/**
 * v35 — Network Watch.   /api/party-watch
 *
 * Buyers and owners who refuse the broker's commission or go around him hurt every broker on the network. A broker can:
 *   - CHECK a mobile before he works with it (answer: clear / caution / blocked — never a name, never who reported);
 *   - REPORT a mobile with a fixed reason, a note and — best — a record of his own that proves he worked with that mobile
 *     (visit / offer / buyer bond / client room / owner consent). Evidence is matched on the server; the broker never uploads a number twice.
 * Levels (per mobile, kept as an HMAC + last 4 digits only):
 *   WATCH    1 report — only GENZ staff see it, nothing happens
 *   CAUTION  2 brokers with proof (or 3 brokers) in 180 days — every broker who checks / schedules / offers sees a caution
 *   BLOCKED  GENZ staff confirmed it — visits, offers, client rooms and owner consents for this mobile are refused for 365 days
 * Safeguards: staff review every report; a dismissed report counts against the reporter (3 in a year = he cannot report);
 * an appeal can be sent by any broker who knows the person and is answered by staff; staff can clear at any time.
 * The network sees only the level and last 4 digits; names and notes stay with the reporter and GENZ staff.
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from './db.js';
import type { PartyAlert, PartyReport, UserProfile } from './db.js';
import { ctx, needs, secret, rateLimit, digits } from './auth.js';
import { pushTo } from './webpush.js';
import { WATCH_CATEGORIES, WATCH_EVIDENCE, WATCH_LIMITS as L, WATCH_LEVEL_TEXT } from '../src/shared/partyWatchRules.js';

const st = () => db.getState();
const nowIso = () => new Date().toISOString();
const me = () => ctx().user as UserProfile;
const bad = (res: Response, error: string, status = 400, extra: Record<string, unknown> = {}) => res.status(status).json({ error, ...extra });
const phone10 = (p: unknown) => digits(String(p ?? '')).slice(-10);
const PHONE_RE = /^[6-9]\d{9}$/;
const hm = (tag: string, v: string) => crypto.createHmac('sha256', secret()).update(`${tag}|${v}`).digest('hex');
const keyOf = (p: unknown) => hm('pw-phone', phone10(p));
const note = (a: PartyAlert, text: string) => { a.events.push({ at: nowIso(), text }); a.updatedAt = nowIso(); if (a.events.length > 60) a.events.splice(0, a.events.length - 60); };
const DAY = 86400_000;

/** counts a report towards the level: not dismissed, and recent */
const counts = (r: PartyReport, now: number) => r.status !== 'DISMISSED' && now - Date.parse(r.at) <= L.reportDays * DAY;

export function levelOf(a: PartyAlert, now = Date.now()): PartyAlert['level'] {
  const d = a.decision;
  if (d?.action === 'BLOCKED' && (!d.until || Date.parse(d.until) > now)) return 'BLOCKED';
  const since = d?.action === 'CLEARED' || d?.action === 'BLOCKED' ? Date.parse(d.at) : 0; // a cleared / expired block: only newer reports count
  const live = a.reports.filter(r => counts(r, now) && Date.parse(r.at) > since);
  const brokers = new Set(live.map(r => r.brokerId));
  const proven = new Set(live.filter(r => r.evidence.verified).map(r => r.brokerId));
  if (proven.size >= L.verifiedForCaution || brokers.size >= L.anyForCaution) return 'CAUTION';
  if (brokers.size >= 1) return 'WATCH';
  return 'NONE';
}
const refresh = (a: PartyAlert) => { a.level = levelOf(a); return a.level; };

export function findAlert(phone: unknown): PartyAlert | undefined {
  if (!PHONE_RE.test(phone10(phone))) return undefined;
  const k = keyOf(phone);
  return st().partyAlerts.find(a => a.key === k);
}
/** what everyone else may know: NONE / CAUTION / BLOCKED (WATCH stays staff-only) */
export function publicLevel(phone: unknown): 'NONE' | 'CAUTION' | 'BLOCKED' {
  const a = findAlert(phone); if (!a) return 'NONE';
  const l = levelOf(a);
  return l === 'BLOCKED' || l === 'CAUTION' ? l : 'NONE';
}
/** BLOCKED → the refusal to send back (null otherwise). Used by visit / offer / client room / owner consent. */
export function partyBlock(phone: unknown, what: 'buyer' | 'owner'): Record<string, unknown> | null {
  const l = publicLevel(phone);
  if (l !== 'BLOCKED') return null;
  const a = findAlert(phone)!;
  return { error: WATCH_LEVEL_TEXT.BLOCKED.en, hi: WATCH_LEVEL_TEXT.BLOCKED.hi, code: 'PARTY_BLOCKED', party: what, last4: a.last4 };
}
/** CAUTION → a notice to add to a successful answer (null otherwise) */
export function partyCaution(phone: unknown): { en: string; hi: string; level: 'CAUTION' } | null {
  return publicLevel(phone) === 'CAUTION' ? { ...WATCH_LEVEL_TEXT.CAUTION, level: 'CAUTION' } : null;
}

/** does this broker have a record of his OWN with this mobile? (server-side proof for a report) */
function proofFor(brokerId: string, phone: string, kind: string, refId?: string): { ok: boolean; refId?: string } {
  const s = st();
  const p10 = phone10(phone);
  switch (kind) {
    case 'VISIT': { const v = s.siteVisits.find(x => x.brokerId === brokerId && phone10(x.customerPhone) === p10 && (!refId || x.id === refId)); return { ok: !!v, refId: v?.id }; }
    case 'OFFER': { const o = s.propertyOffers.find(x => x.brokerId === brokerId && x.buyerPhoneKey === p10 && (!refId || x.id === refId)); return { ok: !!o, refId: o?.id }; }
    case 'BOND': { const k = hm('bb-phone', p10); const b = s.buyerBonds.find(x => x.brokerId === brokerId && x.buyerKey === k && (!refId || x.id === refId)); return { ok: !!b, refId: b?.id }; }
    case 'ROOM': { const k = hm('cr-phone', p10); const r = s.clientRooms.find(x => x.brokerId === brokerId && x.phoneKey === k && (!refId || x.id === refId)); return { ok: !!r, refId: r?.id }; }
    case 'CONSENT': { const k = hm('oc-phone', p10); const c = s.ownerConsents.find(x => x.brokerId === brokerId && x.ownerPhoneHash === k && (!refId || x.id === refId)); return { ok: !!c, refId: c?.id }; }
  }
  return { ok: false };
}

const dismissedIn = (brokerId: string, now = Date.now()) =>
  st().partyAlerts.reduce((n, a) => n + a.reports.filter(r => r.brokerId === brokerId && r.status === 'DISMISSED' && now - Date.parse(r.review?.at || r.at) <= 365 * DAY).length, 0);

/** hourly: a block that has run out drops back; levels are recomputed; a changed level is announced to the brokers who reported */
export function sweepPartyWatch() {
  let n = 0;
  for (const a of st().partyAlerts) {
    const before = a.level; const after = refresh(a);
    if (before !== after) { n++; note(a, `Level ${before} → ${after}`); }
  }
  if (n) db.save();
  return n;
}

const mineView = (r: PartyReport) => ({ id: r.id, partyKind: r.partyKind, category: r.category, partyName: r.partyName, note: r.note, at: r.at, evidence: r.evidence, status: r.status, review: r.review ? { at: r.review.at, note: r.review.note } : undefined });
const staffView = (a: PartyAlert) => {
  const users = new Map(st().users.map(x => [x.id, x]));
  const p4 = a.last4;
  return {
    id: a.id, last4: p4, level: levelOf(a), decision: a.decision, createdAt: a.createdAt, updatedAt: a.updatedAt,
    reports: a.reports.map(r => ({ ...mineView(r), brokerId: r.brokerId, brokerName: users.get(r.brokerId)?.name || r.brokerId, brokerCompany: users.get(r.brokerId)?.companyName })),
    appeals: a.appeals, events: a.events.slice(-12),
    brokers: new Set(a.reports.filter(r => r.status !== 'DISMISSED').map(r => r.brokerId)).size,
    // an account on GENZ that uses a mobile ending the same way is only a hint for staff — nothing is suspended automatically
    maybeAccounts: st().users.filter(u => phone10(u.phone).slice(-4) === p4 && keyOf(u.phone) === a.key).map(u => ({ id: u.id, name: u.name, role: u.role })),
  };
};

export function createPartyWatchRouter() {
  const r = Router();

  /** check a mobile before working with it */
  r.post('/check', needs('partywatch:report'), rateLimit('pw-check', L.checkPerHour, 3600_000), (req: Request, res: Response) => {
    const phone = phone10(req.body?.phone);
    if (!PHONE_RE.test(phone)) return bad(res, 'Enter a 10-digit mobile number');
    const l = publicLevel(phone);
    res.json({ success: true, level: l, last4: phone.slice(-4), message: l === 'NONE' ? undefined : WATCH_LEVEL_TEXT[l] });
  });

  r.get('/meta', needs('partywatch:report'), (_req, res) => {
    res.json({ success: true, categories: WATCH_CATEGORIES, evidence: WATCH_EVIDENCE, limits: L });
  });

  r.post('/report', needs('partywatch:report'), rateLimit('pw-report', 30, 86400_000), (req: Request, res: Response) => {
    const u = me();
    const phone = phone10(req.body?.phone);
    if (!PHONE_RE.test(phone)) return bad(res, 'Enter the 10-digit mobile number of the buyer / owner');
    const category = WATCH_CATEGORIES.find(c => c.id === req.body?.category)?.id;
    if (!category) return bad(res, 'Pick what happened');
    const partyKind = req.body?.partyKind === 'OWNER' ? 'OWNER' : 'BUYER';
    const text = String(req.body?.note ?? '').trim().slice(0, 400);
    if (text.length < L.noteMin) return bad(res, `Write what happened (at least ${L.noteMin} characters)`, 400, { hi: `क्या हुआ, लिखें (कम से कम ${L.noteMin} अक्षर)`, code: 'NOTE_SHORT' });
    const name = String(req.body?.partyName ?? '').trim().slice(0, 80);
    if (name.length < 2) return bad(res, 'Enter the person\'s name', 400, { hi: 'व्यक्ति का नाम लिखें', code: 'NAME' });
    if (dismissedIn(u.id) >= L.falseLimit) return bad(res, 'Several of your earlier reports were found wrong, so you cannot report right now. Write to GENZ support if you think this is a mistake.', 403, { hi: 'आपकी पहले की कई रिपोर्ट ग़लत पाई गईं, इसलिए अभी आप रिपोर्ट नहीं कर सकते। ग़लती लगे तो GENZ सपोर्ट को लिखें।', code: 'REPORT_LOCKED' });
    const today = st().partyAlerts.reduce((n, a) => n + a.reports.filter(x => x.brokerId === u.id && Date.now() - Date.parse(x.at) < DAY).length, 0);
    if (today >= L.perDay) return bad(res, `You can send ${L.perDay} reports a day`, 429, { code: 'DAILY_LIMIT' });

    // proof: a record of his own with this mobile. No proof is allowed, but then it takes 3 brokers to reach CAUTION.
    const ekind = WATCH_EVIDENCE.find(e => e.id === req.body?.evidenceKind)?.id;
    let evidence: PartyReport['evidence'] = { kind: 'NONE', verified: false };
    if (ekind) {
      const pr = proofFor(u.id, phone, ekind, req.body?.evidenceId ? String(req.body.evidenceId) : undefined);
      if (!pr.ok) return bad(res, 'We could not find that record under your account for this mobile number. Pick a record you made yourself, or send the report without proof.', 400, { hi: 'आपके खाते में इस मोबाइल के साथ ऐसा कोई रिकॉर्ड नहीं मिला। अपना बनाया हुआ रिकॉर्ड चुनें, या बिना सबूत के रिपोर्ट भेजें।', code: 'NO_PROOF' });
      evidence = { kind: ekind, refId: pr.refId, verified: true };
    }
    let a = findAlert(phone);
    if (!a) { a = { id: `PW-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, key: keyOf(phone), last4: phone.slice(-4), reports: [], level: 'NONE', appeals: [], events: [], createdAt: nowIso(), updatedAt: nowIso() }; st().partyAlerts.unshift(a); }
    if (a.reports.some(x => x.brokerId === u.id && x.status === 'OPEN')) return bad(res, 'You already have an open report for this mobile — GENZ is reviewing it.', 409, { code: 'ALREADY_REPORTED' });
    const rep: PartyReport = { id: `PR-${crypto.randomBytes(4).toString('hex')}`, brokerId: u.id, partyKind, category, partyName: name, note: text, at: nowIso(), evidence, status: 'OPEN' };
    a.reports.push(rep);
    const before = a.level; const after = refresh(a);
    note(a, `Report ${rep.id}: ${category}${evidence.verified ? ` (proof ${evidence.kind} ${evidence.refId})` : ' (no proof)'}`);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'LEAD', a.id, 'PARTY_WATCH_REPORT', `${u.name} reported a ${partyKind.toLowerCase()} (…${a.last4}) — ${category}${evidence.verified ? `, proof ${evidence.kind} ${evidence.refId}` : ', no proof'}`);
    if (before !== after && after === 'CAUTION') db.appendAuditEvent('SYSTEM', 'SUPERADMIN', 'LEAD', a.id, 'PARTY_WATCH_CAUTION', `Mobile …${a.last4} reached CAUTION (${new Set(a.reports.filter(x => x.status !== 'DISMISSED').map(x => x.brokerId)).size} brokers)`);
    for (const s of st().users.filter(x => x.role === 'ADMIN' || x.role === 'SUPERADMIN').slice(0, 20)) void pushTo(s.id, { kind: 'deals', title: 'Network Watch: new report', body: `A ${partyKind.toLowerCase()} (…${a.last4}) was reported — ${category.replace(/_/g, ' ').toLowerCase()}. Open Disputes → Network Watch.`, url: '/?tab=disputes' });
    res.json({ success: true, level: publicLevel(phone), report: mineView(rep) });
  });

  r.get('/mine', needs('partywatch:report'), (_req, res) => {
    const u = me();
    const list: any[] = [];
    for (const a of st().partyAlerts) for (const x of a.reports) if (x.brokerId === u.id) list.push({ ...mineView(x), last4: a.last4, alertId: a.id, now: levelOf(a) === 'BLOCKED' ? 'BLOCKED' : levelOf(a) === 'CAUTION' ? 'CAUTION' : 'NONE' });
    list.sort((a, b) => b.at.localeCompare(a.at));
    res.json({ success: true, reports: list.slice(0, 200), dismissed: dismissedIn(u.id), limit: L.falseLimit });
  });

  /** a broker who knows the person says the mark is wrong (e.g. they settled it); staff answer */
  r.post('/appeal', needs('partywatch:report'), rateLimit('pw-appeal', 10, 86400_000), (req: Request, res: Response) => {
    const u = me();
    const phone = phone10(req.body?.phone);
    const a = findAlert(phone);
    if (!a || publicLevel(phone) === 'NONE') return bad(res, 'This mobile has no caution or block to appeal.', 404);
    const text = String(req.body?.note ?? '').trim().slice(0, 400);
    if (text.length < L.noteMin) return bad(res, `Write why this mark is wrong (at least ${L.noteMin} characters)`, 400, { hi: `यह निशान ग़लत क्यों है, लिखें (कम से कम ${L.noteMin} अक्षर)`, code: 'NOTE_SHORT' });
    if (a.appeals.some(x => x.byId === u.id && x.status === 'OPEN')) return bad(res, 'Your appeal is already with GENZ.', 409);
    a.appeals.push({ id: `PA-${crypto.randomBytes(3).toString('hex')}`, byId: u.id, byName: u.name, at: nowIso(), note: text, status: 'OPEN' });
    note(a, `Appeal by ${u.name}`); db.save();
    db.appendAuditEvent(u.id, u.role, 'LEAD', a.id, 'PARTY_WATCH_APPEAL', `${u.name} appealed the mark on …${a.last4}`);
    res.json({ success: true });
  });

  // ---- GENZ staff ----
  r.get('/admin', needs('partywatch:review'), (req: Request, res: Response) => {
    const only = String(req.query.queue || '');
    let list = st().partyAlerts.slice();
    list.forEach(refresh);
    if (only === 'open') list = list.filter(a => a.reports.some(x => x.status === 'OPEN') || a.appeals.some(x => x.status === 'OPEN'));
    else if (only) list = list.filter(a => a.level === only.toUpperCase());
    list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const all = st().partyAlerts;
    res.json({ success: true, alerts: list.slice(0, 300).map(staffView), counts: {
      open: all.filter(a => a.reports.some(x => x.status === 'OPEN') || a.appeals.some(x => x.status === 'OPEN')).length,
      caution: all.filter(a => levelOf(a) === 'CAUTION').length, blocked: all.filter(a => levelOf(a) === 'BLOCKED').length,
      appeals: all.reduce((n, a) => n + a.appeals.filter(x => x.status === 'OPEN').length, 0),
    } });
  });

  /** uphold or dismiss one report. Dismissed = the reporter gets a false-report strike. */
  r.post('/admin/:id/report/:rid', needs('partywatch:review'), (req: Request, res: Response) => {
    const a = me();
    const al = st().partyAlerts.find(x => x.id === req.params.id);
    const rep = al?.reports.find(x => x.id === req.params.rid);
    if (!al || !rep) return bad(res, 'Not found', 404);
    const verdict = req.body?.verdict === 'UPHOLD' ? 'UPHELD' : req.body?.verdict === 'DISMISS' ? 'DISMISSED' : '';
    const why = String(req.body?.note ?? '').trim().slice(0, 300);
    if (!verdict) return bad(res, 'Pick uphold or dismiss');
    if (why.length < 10) return bad(res, 'Write the reason (at least 10 characters)');
    rep.status = verdict; rep.review = { byId: a.id, byName: a.name, at: nowIso(), note: why };
    note(al, `Report ${rep.id} ${verdict.toLowerCase()} by ${a.name}: ${why}`);
    refresh(al); db.save();
    db.appendAuditEvent(a.id, a.role, 'LEAD', al.id, verdict === 'UPHELD' ? 'PARTY_WATCH_UPHELD' : 'PARTY_WATCH_DISMISSED', `${a.name} ${verdict.toLowerCase()} report ${rep.id} on …${al.last4}: ${why}`);
    void pushTo(rep.brokerId, { kind: 'deals', title: verdict === 'UPHELD' ? 'Your Network Watch report was accepted' : 'Your Network Watch report was not accepted', body: why.slice(0, 120), url: '/?tab=clientroom' });
    res.json({ success: true, alert: staffView(al) });
  });

  /** block (365 days) or clear a mobile */
  r.post('/admin/:id/decide', needs('partywatch:review'), (req: Request, res: Response) => {
    const a = me();
    const al = st().partyAlerts.find(x => x.id === req.params.id);
    if (!al) return bad(res, 'Not found', 404);
    const action = req.body?.action === 'BLOCK' ? 'BLOCKED' : req.body?.action === 'CLEAR' ? 'CLEARED' : '';
    const why = String(req.body?.note ?? '').trim().slice(0, 400);
    if (!action) return bad(res, 'Pick block or clear');
    if (why.length < 10) return bad(res, 'Write the reason (at least 10 characters)');
    if (action === 'BLOCKED' && !al.reports.some(x => x.status === 'UPHELD')) return bad(res, 'Uphold at least one report before blocking.', 409, { code: 'NO_UPHELD' });
    al.decision = { action, byId: a.id, byName: a.name, at: nowIso(), note: why, ...(action === 'BLOCKED' ? { until: new Date(Date.now() + L.blockDays * DAY).toISOString() } : {}) };
    for (const x of al.appeals) if (x.status === 'OPEN') { x.status = 'DONE'; x.answer = action === 'CLEARED' ? 'Cleared' : 'Block stays'; }
    note(al, `${action} by ${a.name}: ${why}`);
    refresh(al); db.save();
    db.appendAuditEvent(a.id, a.role, 'LEAD', al.id, action === 'BLOCKED' ? 'PARTY_WATCH_BLOCKED' : 'PARTY_WATCH_CLEARED', `${a.name} ${action === 'BLOCKED' ? 'blocked' : 'cleared'} mobile …${al.last4}: ${why}`);
    res.json({ success: true, alert: staffView(al) });
  });

  r.post('/admin/:id/appeal/:aid', needs('partywatch:review'), (req: Request, res: Response) => {
    const a = me();
    const al = st().partyAlerts.find(x => x.id === req.params.id);
    const ap = al?.appeals.find(x => x.id === req.params.aid);
    if (!al || !ap) return bad(res, 'Not found', 404);
    const ans = String(req.body?.answer ?? '').trim().slice(0, 300);
    if (ans.length < 5) return bad(res, 'Write the answer');
    ap.status = 'DONE'; ap.answer = ans; note(al, `Appeal ${ap.id} answered by ${a.name}`); db.save();
    void pushTo(ap.byId, { kind: 'deals', title: 'GENZ answered your Network Watch appeal', body: ans.slice(0, 120), url: '/?tab=clientroom' });
    res.json({ success: true, alert: staffView(al) });
  });
  return r;
}
