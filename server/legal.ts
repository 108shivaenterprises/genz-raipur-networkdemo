/**
 * v22 — Legal Help.
 *
 *  Broker (deal room)  → "I need legal help": state comes from the deal's property, he picks the kind of help, writes a short
 *                        description, ticks which details / property papers he can share.
 *  Counsellor (panel)  → sees open requests of HIS states only; the first to claim it (first come, first served) quotes a fee.
 *  Broker              → accepts (GENZ's flat platform fee is fixed for the counsellor, phones open both ways, ticked papers
 *                        become view-only for the counsellor) or declines (the case goes back to the pool, that counsellor skipped).
 *  GENZ admin          → sees the requests (what the broker chose to write), the fee ledger, strikes; the superadmin sets the fees.
 *
 *  The counsellor NEVER enters the deal room: no chat, no brokerage, no customer, no other broker's phone.
 *  GENZ does not hold the parties' money. GENZ's own fee is paid by the counsellor outside the app, marked paid with a reference and confirmed by an admin.
 *  GENZ takes a flat fee / membership, never a share of the advocate's fee (Bar Council fee-sharing rules).
 */
import { alert } from './alerts.js';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db, type DatabaseState, type UserProfile, type LegalRequest, type LegalProfile } from './db.js';
import { chargeEvent, activeMembership, overdue, gateBlock, ensureBilling } from './billing.js';
import { ctx, needs, rateLimit } from './auth.js';
import { findState, stateOfCity } from '../src/shared/india.js';
import {
  HELP_TYPE_IDS, helpTypeInfo, maskPhones, stateOfProperty, clampMoney, DEFAULT_LEGAL_SETTINGS,
  LIVE_STATUSES, type LegalSettings,
} from '../src/shared/legalRules.js';

const st = (): DatabaseState => db.getState();
const nowIso = () => new Date().toISOString();
const me = () => ctx().user as UserProfile;
const bad = (res: Response, msg: string, code = 400, extra: object = {}) => res.status(code).json({ error: msg, ...extra });
const audit = (id: string, action: string, details: string) => { const u = me(); db.appendAuditEvent(u.id, u.role, 'LEGAL', id, action, details); };
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const nextId = (prefix: string, ids: string[], pad: number) => `${prefix}${String(ids.reduce((m, id) => Math.max(m, Number(id.slice(prefix.length)) || 0), 0) + 1).padStart(pad, '0')}`;
const DAY = 86_400_000;
const FEE_GRACE_DAYS = 30;
const SHARE_DAYS = 60;
const isStaff = (u: UserProfile) => u.role === 'ADMIN' || u.role === 'SUPERADMIN';
const settings = (): LegalSettings => ({ ...DEFAULT_LEGAL_SETTINGS, ...(st().legalSettings || {}) });

// ───────────────────────────── counsellor helpers ─────────────────────────────
export function profileOf(u: UserProfile): LegalProfile {
  const s = st();
  let p = s.legalProfiles.find(x => x.userId === u.id);
  if (!p) {
    const home = findState(u.state)?.name || stateOfCity(u.city);
    p = { id: u.id, userId: u.id, states: home ? [home] : [], strikes: 0, updatedAt: nowIso() };
    s.legalProfiles.push(p);
  }
  return p;
}
/** v23: memberships and fees live in Plans & Fees (server/billing.ts) */
export function memberUntil(counsellorId: string, now = Date.now()): string | null { return activeMembership(counsellorId, now)?.validTo || null; }
const feeOverdue = (counsellorId: string, now = Date.now()) => overdue(counsellorId, 'LEGAL_CASE', now);
const panelBlock = (u: UserProfile, p: LegalProfile): string | null => {
  if (u.verificationStatus !== 'VERIFIED') return 'Your account is not verified yet.';
  if (p.removed) return 'You have been taken off the GENZ legal panel.';
  if (feeOverdue(u.id)) return `A GENZ platform fee has been unpaid for more than ${FEE_GRACE_DAYS} days — pay it (or ask the GENZ team) to claim new cases.`;
  return gateBlock(u, 'LEGAL_CLAIM');
};

// ───────────────────────────── lazy sweep: lapsed claims / quotes go back to the pool ─────────────────────────────
export function sweepLegal(now = Date.now()): number {
  const s = st(); const cfg = settings(); let n = 0;
  for (const r of s.legalRequests) {
    if (r.status === 'CLAIMED' && r.claimedAt && now - new Date(r.claimedAt).getTime() > cfg.claimHours * 3_600_000) {
      reopen(r, `Counsellor did not quote within ${cfg.claimHours} h — back to the pool`, 'SYSTEM'); n++;
    } else if (r.status === 'QUOTED' && r.quote && now - new Date(r.quote.at).getTime() > cfg.quoteHours * 3_600_000) {
      reopen(r, `Quote not answered within ${cfg.quoteHours} h — lapsed, back to the pool`, 'SYSTEM'); n++;
    }
  }
  if (n) db.save();
  return n;
}
function reopen(r: LegalRequest, why: string, by: string) {
  if (r.counsellorId && !r.passedBy.includes(r.counsellorId)) r.passedBy.push(r.counsellorId);
  r.history.push({ at: nowIso(), by, what: why });
  r.status = 'OPEN'; r.counsellorId = undefined; r.counsellorName = undefined; r.claimedAt = undefined; r.quote = undefined; r.updatedAt = nowIso();
}

// ───────────────────────────── shaping ─────────────────────────────
const brokerLabel = (u?: UserProfile) => u ? (u.companyName ? `${u.name} — ${u.companyName}` : u.name) : 'Broker';
function docsFor(r: LegalRequest) {
  const out: { id: string; title: string; type: string; fileName: string }[] = [];
  for (const id of r.sharedDocIds) { const d = db.byId('propertyDocs', id); if (d) out.push({ id: d.id, title: d.title, type: d.type, fileName: d.fileName }); }
  return out;
}
/** What each side may see. `view` is the viewer's relation to the case. */
function shape(r: LegalRequest, u: UserProfile, now = Date.now()) {
  const isOwner = r.requestedById === u.id; const isCounsellor = r.counsellorId === u.id; const staff = isStaff(u);
  const prop = r.propertyId ? db.byId('properties', r.propertyId) : undefined;
  const base: any = {
    id: r.id, state: r.state, city: r.city, helpType: r.helpType, status: r.status, description: r.description,
    detailsShared: r.detailsShared, propertyType: prop?.propertyType, createdAt: r.createdAt, updatedAt: r.updatedAt,
    sharedDocCount: r.sharedDocIds.length, claimedAt: r.claimedAt, quote: r.quote, platformFee: staff || isCounsellor ? r.platformFee : undefined,
    bypassReport: r.bypassReport,
  };
  const dueBy = (r.status === 'CLAIMED' && r.claimedAt) ? new Date(new Date(r.claimedAt).getTime() + settings().claimHours * 3_600_000).toISOString()
    : (r.status === 'QUOTED' && r.quote) ? new Date(new Date(r.quote.at).getTime() + settings().quoteHours * 3_600_000).toISOString() : undefined;
  if (dueBy) base.respondBy = dueBy;
  const mine = isOwner || isCounsellor || staff;
  if (!mine) return base; // an unclaimed case in the pool: no names, no deal, no papers
  base.dealRoomId = isOwner || staff ? r.dealRoomId : undefined; // the counsellor is never told which deal room
  base.requestedBy = isOwner || staff || r.status !== 'OPEN' ? { id: r.requestedById, name: r.requestedByName } : undefined;
  base.counsellor = r.counsellorId ? { id: r.counsellorId, name: r.counsellorName } : undefined;
  base.messages = r.messages;
  base.history = r.history.map(h => ({ at: h.at, what: h.what }));
  const showDocs = staff || isOwner || ((r.status === 'ACCEPTED' || r.status === 'COMPLETED') && isCounsellor);
  if (showDocs) base.docs = docsFor(r);
  if ((r.status === 'ACCEPTED' || r.status === 'COMPLETED') && (isOwner || isCounsellor)) {
    const b = db.byId('users', r.requestedById); const c = r.counsellorId ? db.byId('users', r.counsellorId) : undefined;
    base.contact = { broker: { name: b?.name, company: b?.companyName, phone: b?.phone }, counsellor: { name: c?.name, company: c?.companyName, phone: c?.phone } };
  }
  void now;
  return base;
}

// ───────────────────────────── bodies ─────────────────────────────
const stateField = z.string().trim().refine(v => !!findState(v), { message: 'Select a valid Indian state or union territory' });
const requestBody = z.object({
  dealId: z.string().min(2).max(60),
  state: stateField.optional(),
  helpType: z.enum(HELP_TYPE_IDS),
  description: z.string().trim().min(15, 'Describe what you need in at least 15 characters.').max(1200),
  detailsShared: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  sharedDocIds: z.array(z.string().min(2).max(80)).max(20).default([]),
});
const quoteBody = z.object({
  amount: z.coerce.number().int('Enter the fee in whole rupees').min(0).max(5_000_000),
  days: z.coerce.number().int().min(0).max(365).optional(),
  note: z.string().trim().max(600).optional(),
});
const settingsBody = z.object({
  claimHours: z.coerce.number().int().min(1).max(168), quoteHours: z.coerce.number().int().min(1).max(720), maxStrikes: z.coerce.number().int().min(1).max(10),
});

function loadRequest(req: Request, res: Response): LegalRequest | null {
  sweepLegal();
  const r = st().legalRequests.find(x => x.id === req.params.id);
  if (!r) { bad(res, 'Legal-help request not found', 404); return null; }
  return r;
}
/** May this user open the case at all? */
function canOpen(u: UserProfile, r: LegalRequest): boolean {
  if (isStaff(u) || r.requestedById === u.id) return true;
  if (r.counsellorId === u.id) return true;
  if (u.role === 'LEGAL_COUNSEL' && r.status === 'OPEN' && !r.passedBy.includes(u.id)) return !!profileOf(u).states.includes(r.state);
  return false;
}
function closeShares(r: LegalRequest) {
  if (!r.counsellorId || !r.acceptedAt) return;
  for (const id of r.sharedDocIds) {
    const d = db.byId('propertyDocs', id); if (!d) continue;
    for (const sh of d.shares) if (sh.userId === r.counsellorId && sh.grantedAt === r.acceptedAt && !sh.revoked) sh.revoked = true;
  }
}

export function createLegalRouter() {
  const r = Router();
  const broker = needs('legal:request'); const desk = needs('legal:desk'); const manage = needs('legal:manage'); const anyLegal = needs('legal:request', 'legal:desk', 'legal:manage');

  // ───────── shared: the fee table (read-only for counsellors) ─────────
  r.get('/settings', anyLegal, (_req, res) => {
    const u = me(); const cfg = settings();
    res.json({ success: true, settings: { claimHours: cfg.claimHours, quoteHours: cfg.quoteHours, maxStrikes: cfg.maxStrikes }, canEdit: u.role === 'SUPERADMIN' });
  });
  r.put('/settings', needs('legal:settings'), (req: Request, res: Response) => {
    const p = settingsBody.safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid settings');
    const before = settings();
    st().legalSettings = { ...before, ...p.data, updatedAt: nowIso(), updatedBy: me().id };
    audit('LEGAL-SETTINGS', 'LEGAL_SETTINGS_CHANGED', `Quote within ${before.claimHours}→${p.data.claimHours} h, broker answers within ${before.quoteHours}→${p.data.quoteHours} h, strikes ${before.maxStrikes}→${p.data.maxStrikes}`);
    db.save();
    const cfg = settings();
    res.json({ success: true, settings: { claimHours: cfg.claimHours, quoteHours: cfg.quoteHours, maxStrikes: cfg.maxStrikes } });
  });

  // ───────── broker: context from the deal room ─────────
  r.get('/context', broker, (req: Request, res: Response) => {
    const u = me(); const deal = db.byId('dealRooms', String(req.query.dealId || ''));
    if (!deal || (deal.introducingBrokerId !== u.id && deal.closingBrokerId !== u.id)) return bad(res, 'Deal Room not found', 404);
    const prop = db.byId('properties', deal.propertyId);
    const state = stateOfProperty(prop, stateOfCity) || findState(u.state)?.name || stateOfCity(u.city) || null;
    const docs = st().propertyDocs.filter(d => d.propertyId === deal.propertyId && d.uploaderId === u.id).map(d => ({ id: d.id, title: d.title, type: d.type, fileName: d.fileName }));
    const mine = st().legalRequests.filter(x => x.dealRoomId === deal.id && x.requestedById === u.id).map(x => shape(x, u));
    res.json({ success: true, state, stateFromProperty: !!stateOfProperty(prop, stateOfCity), city: prop?.city, propertyType: prop?.propertyType, docs, requests: mine, membersOnly: gateBlock(u, 'LEGAL_REQUEST') });
  });

  // ───────── broker: raise a request ─────────
  r.post('/requests', broker, rateLimit('legalreq', 20, 60 * 60_000), (req: Request, res: Response) => {
    const u = me(); const p = requestBody.safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid request');
    const d = p.data; const s = st();
    const deal = db.byId('dealRooms', d.dealId);
    if (!deal || (deal.introducingBrokerId !== u.id && deal.closingBrokerId !== u.id)) return bad(res, 'Deal Room not found', 404);
    const gate = gateBlock(u, 'LEGAL_REQUEST'); if (gate) return bad(res, gate, 403, { code: 'MEMBERS_ONLY' });
    const prop = db.byId('properties', deal.propertyId);
    const state = findState(d.state)?.name || stateOfProperty(prop, stateOfCity);
    if (!state) return bad(res, 'Select the state the property is in.');
    if (s.legalRequests.some(x => x.dealRoomId === deal.id && x.helpType === d.helpType && LIVE_STATUSES.includes(x.status))) return bad(res, 'You already have an open request of this kind for this deal. Cancel it or wait for the counsellor.', 409);
    // papers: only his own uploads on this deal's property
    const mineDocs = new Set(s.propertyDocs.filter(x => x.propertyId === deal.propertyId && x.uploaderId === u.id).map(x => x.id));
    const docIds = [...new Set(d.sharedDocIds)];
    if (docIds.some(id => !mineDocs.has(id))) return bad(res, 'You can show the counsellor only papers you uploaded for this property.');
    const m = maskPhones(d.description);
    const t = nowIso();
    const row: LegalRequest = {
      id: nextId('LGL-', s.legalRequests.map(x => x.id), 6), dealRoomId: deal.id, propertyId: deal.propertyId, state, city: prop?.city,
      helpType: d.helpType, description: m.text, detailsShared: d.detailsShared.map(x => maskPhones(x).text), sharedDocIds: docIds,
      requestedById: u.id, requestedByName: brokerLabel(u), status: 'OPEN', passedBy: [], messages: [],
      history: [{ at: t, by: u.id, what: `Asked for legal help (${helpTypeInfo(d.helpType)?.en}) in ${state}${m.masked ? ' — a phone number in the text was hidden' : ''}` }],
      createdAt: t, updatedAt: t,
    };
    s.legalRequests.push(row);
    // v59 — the state's counsellors hear of a new case (no names, no deal: first come, first served)
    // (a counsellor who has not opened the desk yet still works his home state — profileOf() gives it, as the desk would)
    alert(s.users.filter(c => c.role === 'LEGAL_COUNSEL' && c.verificationStatus === 'VERIFIED').filter(c => { const pp = profileOf(c); return pp.states.includes(state) && !pp.removed; }).map(c => c.id), 'deals', `New legal help request · ${state}`, `${helpTypeInfo(d.helpType)?.en || 'Legal help'} — the first counsellor to take it gets it`, '/?tab=legal', { not: u.id, tag: `lgl-${row.id}`, hi: [`नई क़ानूनी मदद की माँग · ${state}`, `${helpTypeInfo(d.helpType)?.hi || 'क़ानूनी मदद'} — जो काउंसलर पहले लेगा, केस उसका`] });
    audit(row.id, 'LEGAL_REQUEST_RAISED', `${helpTypeInfo(d.helpType)?.en} · ${state} · ${docIds.length} paper(s) offered`);
    db.save();
    res.json({ success: true, request: shape(row, u), phoneMasked: m.masked });
  });

  r.get('/requests', anyLegal, (req: Request, res: Response) => {
    sweepLegal(); const u = me(); const s = st();
    const dealId = String(req.query.dealId || '');
    let rows = s.legalRequests;
    if (u.role === 'LEGAL_COUNSEL') rows = rows.filter(x => x.counsellorId === u.id);
    else if (!isStaff(u)) rows = rows.filter(x => x.requestedById === u.id);
    if (dealId) rows = rows.filter(x => x.dealRoomId === dealId);
    res.json({ success: true, requests: rows.slice().reverse().slice(0, 300).map(x => shape(x, u)) });
  });

  r.get('/requests/:id', anyLegal, (req: Request, res: Response) => {
    const row = loadRequest(req, res); if (!row) return;
    const u = me(); if (!canOpen(u, row)) return bad(res, 'Legal-help request not found', 404);
    res.json({ success: true, request: shape(row, u) });
  });

  // ───────── counsellor: desk ─────────
  r.get('/desk', desk, (_req, res) => {
    sweepLegal(); const u = me(); const s = st(); const p = profileOf(u);
    const until = memberUntil(u.id);
    const pool = s.legalRequests.filter(x => x.status === 'OPEN' && p.states.includes(x.state) && !x.passedBy.includes(u.id)).slice().reverse().map(x => shape(x, u));
    const mineCases = s.legalRequests.filter(x => x.counsellorId === u.id).slice().reverse().map(x => shape(x, u));
    const owed = s.billingLedger.filter(e => e.payerId === u.id && (e.status === 'DUE' || e.status === 'REJECTED')).length;
    res.json({
      success: true, profile: { states: p.states, strikes: p.strikes, removed: !!p.removed, removedReason: p.removedReason }, blocked: panelBlock(u, p),
      member: { active: !!until, until }, owed, pool, cases: mineCases,
    });
  });
  r.put('/profile', desk, (req: Request, res: Response) => {
    const u = me(); const p = z.object({ states: z.array(stateField).min(1, 'Choose at least one state').max(8, 'Choose at most 8 states') }).safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid states');
    const prof = profileOf(u); prof.states = [...new Set(p.data.states.map(x => findState(x)!.name))]; prof.updatedAt = nowIso();
    audit(u.id, 'LEGAL_PANEL_STATES_SET', prof.states.join(', ')); db.save();
    res.json({ success: true, states: prof.states });
  });

  r.post('/requests/:id/claim', desk, rateLimit('legalclaim', 60, 60 * 60_000), (req: Request, res: Response) => {
    const row = loadRequest(req, res); if (!row) return; const u = me(); const prof = profileOf(u);
    const block = panelBlock(u, prof); if (block) return bad(res, block, 403);
    if (!prof.states.includes(row.state)) return bad(res, `This case is in ${row.state}, which is not one of your states.`, 403);
    if (row.passedBy.includes(u.id)) return bad(res, 'You already gave this case back.', 403);
    // first come, first served — Node runs this synchronously, so only one claim can pass the status check
    if (row.status !== 'OPEN') return bad(res, 'Another counsellor claimed this case first.', 409, { code: 'ALREADY_CLAIMED' });
    row.status = 'CLAIMED'; row.counsellorId = u.id; row.counsellorName = u.name; row.claimedAt = nowIso(); row.updatedAt = row.claimedAt;
    row.history.push({ at: row.claimedAt, by: u.id, what: `${u.name} took the case — quote due within ${settings().claimHours} h` });
    alert(row.requestedById, 'deals', 'A counsellor took your legal case', `${u.name} — the fee quote comes next`, '/?tab=deals', { not: u.id, tag: `lgl-${row.id}`, hi: ['एक काउंसलर ने आपका क़ानूनी केस लिया', `${u.name} — अब फ़ीस का कोट आएगा`] });
    audit(row.id, 'LEGAL_REQUEST_CLAIMED', `${u.name} claimed (${row.state})`); db.save();
    res.json({ success: true, request: shape(row, u) });
  });

  r.post('/requests/:id/quote', desk, (req: Request, res: Response) => {
    const row = loadRequest(req, res); if (!row) return; const u = me();
    if (row.counsellorId !== u.id) return bad(res, 'Not your case', 403);
    if (row.status !== 'CLAIMED' && row.status !== 'QUOTED') return bad(res, 'A fee can be quoted only on a case you have claimed.', 409);
    const p = quoteBody.safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid quote');
    row.quote = { amount: clampMoney(p.data.amount, 5_000_000), days: p.data.days, note: p.data.note ? maskPhones(p.data.note).text : undefined, at: nowIso() };
    row.status = 'QUOTED'; row.updatedAt = row.quote.at;
    row.history.push({ at: row.quote.at, by: u.id, what: `Quoted ${inr(row.quote.amount)}${p.data.days ? ` · ${p.data.days} day(s)` : ''}` });
    alert(row.requestedById, 'deals', `Legal fee quote: ${inr(row.quote.amount)}`, `${u.name}${p.data.days ? ` · ${p.data.days} day(s)` : ''} — accept or decline in the deal room`, '/?tab=deals', { not: u.id, tag: `lgl-${row.id}`, hi: [`क़ानूनी फ़ीस का कोट: ${inr(row.quote.amount)}`, `${u.name}${p.data.days ? ` · ${p.data.days} दिन` : ''} — डील रूम में मंज़ूर या मना करें`] });
    audit(row.id, 'LEGAL_QUOTE_GIVEN', `${inr(row.quote.amount)}`); db.save();
    res.json({ success: true, request: shape(row, u) });
  });

  r.post('/requests/:id/release', desk, (req: Request, res: Response) => {
    const row = loadRequest(req, res); if (!row) return; const u = me();
    if (row.counsellorId !== u.id) return bad(res, 'Not your case', 403);
    if (row.status !== 'CLAIMED' && row.status !== 'QUOTED') return bad(res, 'Only a case that is not yet accepted can be given back.', 409);
    reopen(row, `${u.name} gave the case back`, u.id); audit(row.id, 'LEGAL_REQUEST_RELEASED', 'Counsellor gave the case back'); db.save();
    res.json({ success: true });
  });

  // ───────── broker: answer the quote ─────────
  r.post('/requests/:id/accept', broker, (req: Request, res: Response) => {
    const row = loadRequest(req, res); if (!row) return; const u = me();
    if (row.requestedById !== u.id) return bad(res, 'Not your request', 403);
    if (row.status !== 'QUOTED' || !row.quote || !row.counsellorId) return bad(res, 'There is no fee to accept right now.', 409);
    const t = nowIso();
    row.status = 'ACCEPTED'; row.acceptedAt = t; row.updatedAt = t;
    row.history.push({ at: t, by: u.id, what: `Accepted the fee ${inr(row.quote.amount)} — phones opened for both sides` });
    // the papers the broker ticked become view-only for this counsellor (expiring, revoked when the case closes)
    for (const id of row.sharedDocIds) {
      const d = db.byId('propertyDocs', id); if (!d || d.uploaderId !== u.id) continue;
      d.shares.push({ userId: row.counsellorId, grantedBy: u.id, grantedAt: t, expiresAt: new Date(Date.now() + SHARE_DAYS * DAY).toISOString() });
    }
    // v23: GENZ's fee comes from Plans & Fees (the rule / plan in force now; frozen on this line)
    const charge = chargeEvent({ event: 'LEGAL_CASE', payerId: row.counsellorId, base: row.quote.amount, refId: row.id, refLabel: `Legal case ${row.id}`, state: row.state });
    const fee = charge.fee; const isMember = !!charge.planId;
    row.platformFee = fee; row.feeLedgerId = charge.entry?.id;
    alert(row.counsellorId, 'deals', 'Your fee was accepted ✔', `${row.requestedByName} — the case is yours; the shared papers are open`, '/?tab=legal', { not: u.id, tag: `lgl-${row.id}`, hi: ['आपकी फ़ीस मंज़ूर ✔', `${row.requestedByName} — केस आपका है; दिखाए गए काग़ज़ अब खुले हैं`] });
    audit(row.id, 'LEGAL_QUOTE_ACCEPTED', `${inr(row.quote.amount)} accepted · GENZ platform fee ${inr(fee)}${isMember ? ' (member)' : ''} · ${row.sharedDocIds.length} paper(s) shown · phones opened`);
    db.save();
    res.json({ success: true, request: shape(row, u) });
  });

  r.post('/requests/:id/decline', broker, (req: Request, res: Response) => {
    const row = loadRequest(req, res); if (!row) return; const u = me();
    if (row.requestedById !== u.id) return bad(res, 'Not your request', 403);
    if (row.status !== 'QUOTED' && row.status !== 'CLAIMED') return bad(res, 'Nothing to decline right now.', 409);
    const was = row.counsellorId;
    reopen(row, 'Broker declined the fee — back to the pool', u.id); audit(row.id, 'LEGAL_QUOTE_DECLINED', 'Broker declined; case reopened'); db.save();
    alert(was, 'deals', 'Your fee quote was declined', `${row.requestedByName} — the case went back to the pool`, '/?tab=legal', { not: u.id, tag: `lgl-${row.id}`, hi: ['आपका फ़ीस कोट मना हुआ', `${row.requestedByName} — केस वापस पूल में गया`] });
    res.json({ success: true, request: shape(row, u) });
  });

  r.post('/requests/:id/cancel', broker, (req: Request, res: Response) => {
    const row = loadRequest(req, res); if (!row) return; const u = me();
    if (row.requestedById !== u.id) return bad(res, 'Not your request', 403);
    if (row.status === 'ACCEPTED' || row.status === 'COMPLETED' || row.status === 'CANCELLED') return bad(res, 'An accepted or finished case cannot be cancelled — mark it complete instead.', 409);
    row.status = 'CANCELLED'; row.cancelledAt = nowIso(); row.updatedAt = row.cancelledAt; row.history.push({ at: row.cancelledAt, by: u.id, what: 'Broker cancelled the request' });
    audit(row.id, 'LEGAL_REQUEST_CANCELLED', 'Cancelled by the broker'); db.save();
    res.json({ success: true });
  });

  r.post('/requests/:id/complete', anyLegal, (req: Request, res: Response) => {
    const row = loadRequest(req, res); if (!row) return; const u = me();
    if (row.requestedById !== u.id && row.counsellorId !== u.id) return bad(res, 'Not your case', 403);
    if (row.status !== 'ACCEPTED') return bad(res, 'Only an accepted case can be completed.', 409);
    row.status = 'COMPLETED'; row.completedAt = nowIso(); row.updatedAt = row.completedAt; closeShares(row);
    row.history.push({ at: row.completedAt, by: u.id, what: 'Marked complete — papers closed to the counsellor' });
    alert(row.requestedById === u.id ? row.counsellorId : row.requestedById, 'deals', 'Legal case marked complete', `${u.name} closed it — the papers are closed to the counsellor`, row.requestedById === u.id ? '/?tab=legal' : '/?tab=deals', { not: u.id, tag: `lgl-${row.id}`, hi: ['क़ानूनी केस पूरा हुआ', `${u.name} ने बंद किया — काग़ज़ अब काउंसलर के लिए बंद`] });
    audit(row.id, 'LEGAL_REQUEST_COMPLETED', 'Completed; paper access ended'); db.save();
    res.json({ success: true, request: shape(row, u) });
  });

  // ───────── the small thread between the two ─────────
  r.post('/requests/:id/messages', anyLegal, rateLimit('legalmsg', 120, 60 * 60_000), (req: Request, res: Response) => {
    const row = loadRequest(req, res); if (!row) return; const u = me();
    if (row.requestedById !== u.id && row.counsellorId !== u.id) return bad(res, 'Only the broker and the counsellor of this case can write here.', 403);
    if (row.status === 'OPEN' || row.status === 'CANCELLED') return bad(res, 'The thread opens when a counsellor takes the case.', 409);
    const p = z.object({ text: z.string().trim().min(1, 'Write a message').max(1000) }).safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid message');
    const m = maskPhones(p.data.text);
    row.messages.push({ at: nowIso(), by: u.id, role: u.role, text: row.status === 'ACCEPTED' || row.status === 'COMPLETED' ? p.data.text : m.text });
    row.updatedAt = nowIso(); db.save();
    // the alert carries the text as stored — a number stays hidden on the lock screen too until the fee is accepted
    alert(row.requestedById === u.id ? row.counsellorId : row.requestedById, 'deals', 'New message on a legal case', `${u.name}: ${String(row.messages.at(-1)?.text || '').slice(0, 80)}`, row.requestedById === u.id ? '/?tab=legal' : '/?tab=deals', { not: u.id, tag: `lgl-msg-${row.id}`, hi: ['क़ानूनी केस पर नया संदेश', `${u.name}: ${String(row.messages.at(-1)?.text || '').slice(0, 80)}`] });
    res.json({ success: true, request: shape(row, u), phoneMasked: m.masked && !(row.status === 'ACCEPTED' || row.status === 'COMPLETED') });
  });

  // ───────── broker: "the counsellor took this offline" ─────────
  r.post('/requests/:id/report-bypass', broker, (req: Request, res: Response) => {
    const row = loadRequest(req, res); if (!row) return; const u = me();
    if (row.requestedById !== u.id) return bad(res, 'Not your request', 403);
    if (!row.counsellorId || !['QUOTED', 'ACCEPTED', 'COMPLETED'].includes(row.status)) return bad(res, 'You can report this only against the counsellor of a case.', 409);
    const p = z.object({ description: z.string().trim().min(15, 'Say what happened (at least 15 characters).').max(1000) }).safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid report');
    if (row.bypassReport && row.bypassReport.status === 'OPEN') return bad(res, 'A report is already with GENZ.', 409);
    row.bypassReport = { at: nowIso(), by: u.id, description: maskPhones(p.data.description).text, status: 'OPEN' };
    row.history.push({ at: row.bypassReport.at, by: u.id, what: 'Reported: the counsellor tried to take this work outside GENZ' });
    audit(row.id, 'LEGAL_BYPASS_REPORTED', `Against ${row.counsellorName}`); db.save();
    res.json({ success: true, request: shape(row, u) });
  });

  // ───────── GENZ admin / superadmin ─────────
  r.get('/admin', manage, (_req, res) => {
    sweepLegal(); ensureBilling(); const s = st(); const now = Date.now(); const cfg = settings();
    const counsellors = s.users.filter(x => x.role === 'LEGAL_COUNSEL').map(c => {
      const p = profileOf(c); const until = memberUntil(c.id, now);
      const cases = s.legalRequests.filter(x => x.counsellorId === c.id);
      return { id: c.id, name: c.name, company: c.companyName, verified: c.verificationStatus === 'VERIFIED', states: p.states, strikes: p.strikes, removed: !!p.removed, removedReason: p.removedReason,
        member: !!until, memberUntil: until, openCases: cases.filter(x => ['CLAIMED', 'QUOTED', 'ACCEPTED'].includes(x.status)).length, doneCases: cases.filter(x => x.status === 'COMPLETED').length, feeOverdue: feeOverdue(c.id, now) };
    });
    const legalFees = s.billingLedger.filter(e => e.event === 'LEGAL_CASE' || (e.kind === 'MEMBERSHIP' && e.payerSegment === 'LEGAL_COUNSEL'));
    const sum = (f: (e: (typeof legalFees)[number]) => boolean) => legalFees.filter(f).reduce((a, e) => a + e.amount, 0);
    const u = me();
    const requests = s.legalRequests.slice().reverse().slice(0, 300).map(x => shape(x, u));
    const states = new Map<string, { open: number; counsellors: number }>();
    for (const x of s.legalRequests) if (x.status === 'OPEN') { const v = states.get(x.state) || { open: 0, counsellors: 0 }; v.open++; states.set(x.state, v); }
    for (const [name, v] of states) v.counsellors = counsellors.filter(c => c.verified && !c.removed && c.states.includes(name)).length;
    res.json({
      success: true, settings: { claimHours: cfg.claimHours, quoteHours: cfg.quoteHours, maxStrikes: cfg.maxStrikes }, canEdit: u.role === 'SUPERADMIN', counsellors, requests,
      uncovered: [...states.entries()].filter(([, v]) => v.counsellors === 0).map(([state, v]) => ({ state, open: v.open })),
      totals: {
        open: s.legalRequests.filter(x => x.status === 'OPEN').length, live: s.legalRequests.filter(x => ['CLAIMED', 'QUOTED', 'ACCEPTED'].includes(x.status)).length,
        completed: s.legalRequests.filter(x => x.status === 'COMPLETED').length, bypassOpen: s.legalRequests.filter(x => x.bypassReport?.status === 'OPEN').length,
        feesDue: sum(e => e.status === 'DUE' || e.status === 'REJECTED'), feesToConfirm: sum(e => e.status === 'MARKED_PAID'), feesReceived: sum(e => e.status === 'CONFIRMED'),
        toConfirm: legalFees.filter(e => e.status === 'MARKED_PAID').length,
      },
    });
  });


  r.post('/requests/:id/bypass-decision', manage, (req: Request, res: Response) => {
    const row = loadRequest(req, res); if (!row) return; const u = me();
    if (!row.bypassReport || row.bypassReport.status !== 'OPEN' || !row.counsellorId) return bad(res, 'There is no open report on this case.', 409);
    const p = z.object({ decision: z.enum(['UPHELD', 'DISMISSED']), note: z.string().trim().min(5, 'Write a note (at least 5 characters).').max(500) }).safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid decision');
    row.bypassReport.status = p.data.decision; row.bypassReport.decisionNote = p.data.note; row.bypassReport.decidedAt = nowIso();
    row.history.push({ at: row.bypassReport.decidedAt, by: u.id, what: `GENZ ${p.data.decision === 'UPHELD' ? 'upheld' : 'dismissed'} the bypass report: ${p.data.note}` });
    let removed = false;
    if (p.data.decision === 'UPHELD') {
      const c = db.byId('users', row.counsellorId)!; const prof = profileOf(c);
      prof.strikes += 1; prof.updatedAt = nowIso();
      if (prof.strikes >= settings().maxStrikes) { prof.removed = true; prof.removedReason = 'Repeated attempts to take legal-help work outside GENZ'; removed = true; }
    }
    audit(row.id, 'LEGAL_BYPASS_DECIDED', `${p.data.decision}${removed ? ' · taken off the panel' : ''}`); db.save();
    res.json({ success: true, removed, request: shape(row, u) });
  });

  r.post('/counsellors/:id/states', manage, (req: Request, res: Response) => {
    const c = db.byId('users', req.params.id); if (!c || c.role !== 'LEGAL_COUNSEL') return bad(res, 'Counsellor not found', 404);
    const p = z.object({ states: z.array(stateField).min(1).max(8) }).safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid states');
    const prof = profileOf(c); prof.states = [...new Set(p.data.states.map(x => findState(x)!.name))]; prof.updatedAt = nowIso();
    audit(c.id, 'LEGAL_PANEL_STATES_SET', `${c.name}: ${prof.states.join(', ')}`); db.save(); res.json({ success: true, states: prof.states });
  });
  r.post('/counsellors/:id/panel', manage, (req: Request, res: Response) => {
    const c = db.byId('users', req.params.id); if (!c || c.role !== 'LEGAL_COUNSEL') return bad(res, 'Counsellor not found', 404);
    const p = z.object({ action: z.enum(['REMOVE', 'RESTORE']), reason: z.string().trim().min(5, 'Say why (at least 5 characters).').max(300) }).safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid');
    const prof = profileOf(c);
    if (p.data.action === 'REMOVE') { prof.removed = true; prof.removedReason = p.data.reason; }
    else { prof.removed = false; prof.removedReason = undefined; prof.strikes = Math.max(0, Math.min(prof.strikes, settings().maxStrikes - 1)); }
    prof.updatedAt = nowIso(); audit(c.id, p.data.action === 'REMOVE' ? 'LEGAL_PANEL_REMOVED' : 'LEGAL_PANEL_RESTORED', `${c.name}: ${p.data.reason}`); db.save();
    res.json({ success: true });
  });

  /** badge numbers for the tabs */
  r.get('/badge', anyLegal, (_req, res) => {
    sweepLegal(); const u = me(); const s = st();
    if (u.role === 'LEGAL_COUNSEL') { const p = profileOf(u); return res.json({ success: true, count: s.legalRequests.filter(x => x.status === 'OPEN' && p.states.includes(x.state) && !x.passedBy.includes(u.id)).length }); }
    if (isStaff(u)) return res.json({ success: true, count: s.legalRequests.filter(x => x.bypassReport?.status === 'OPEN').length });
    res.json({ success: true, count: s.legalRequests.filter(x => x.requestedById === u.id && x.status === 'QUOTED').length });
  });

  return r;
}
