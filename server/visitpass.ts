/**
 * v13 — Visit QR passes for builder projects.
 *
 *   Partner / builder desk  ──issues──▶  pass (code + QR)  ──shown by──▶  customer  ──scanned by──▶  builder side only
 *
 * Maker–checker: whoever issues a pass can never scan it. A partner's lead can only be issued by the partner
 * (or the partner's allotted staff); only the builder (or staff the builder authorised) can scan.
 * Pass is single-use, time-boxed, tied to one lead; the scanner sees who is expected and confirms an ID check.
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { z } from 'zod';
import { db } from './db.js';
import type { UserProfile, VisitPass } from './db.js';
import type { CrmLead } from '../src/types/crm.js';
import { ctx, needs, hit, rateLimit } from './auth.js';
import { can } from './permissions.js';
import { policyOf, mandateIsActive, startOfDayMs } from '../src/shared/pcontrolRules.js';
import { scanPointIds, defaultScanPoint, scanLine, makeCode, normalizeCode, qrPayload, passWindow, checkSlot, passTiming, firstName, STAGES_BEFORE_VISIT, STAGES_NO_PASS, MAX_PARTY } from '../src/shared/visitRules.js';
import { leadsForMember } from './leadflow.js';
import { awardPoints } from './community.js';
import { createAck, ackFor, ackBlock, ackStatus, renderAckGate, ackBase } from './visitack.js';

const nowIso = () => new Date().toISOString();
const st = () => db.getState();
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const last4 = (p: string) => String(p || '').replace(/\D/g, '').slice(-4);
const bad = (res: Response, error: string, status = 400, code?: string) => res.status(status).json({ error, ...(code ? { code } : {}) });

const profile = (id: string) => db.byId('users', id);

/** Can this user issue a pass for this lead? (partner side / builder-desk only). */
export function canIssueFor(u: UserProfile, l: CrmLead): boolean {
  if (u.role === 'BROKER') return l.associateId === u.id;
  if (u.role === 'DEVELOPER_BUILDER') return l.builderId === u.id && !l.associateId;
  if (u.role === 'TEAM_MEMBER') {
    const emp = profile(u.employerId || '');
    if (!emp || emp.verificationStatus !== 'VERIFIED') return false;
    if (emp.role === 'BROKER') return l.associateId === emp.id && l.assignedMemberId === u.id;
    if (emp.role === 'DEVELOPER_BUILDER') return l.builderId === emp.id && !l.associateId && leadsForMember(u).some(x => x.id === l.id);
  }
  return false;
}

/** Can this user scan passes of this builder (and project)? (builder side only). */
export function canScanFor(u: UserProfile, builderId: string, projectId?: string): boolean {
  if (u.role === 'DEVELOPER_BUILDER') return u.id === builderId && u.verificationStatus === 'VERIFIED';
  if (u.role !== 'TEAM_MEMBER' || u.verificationStatus !== 'VERIFIED' || u.employerId !== builderId) return false;
  const emp = profile(builderId);
  if (!emp || emp.role !== 'DEVELOPER_BUILDER' || emp.verificationStatus !== 'VERIFIED') return false;
  const p = policyOf(u);
  if (!p.canScanVisits || p.onLeave) return false;
  return !projectId || p.projectIds.length === 0 || p.projectIds.includes(projectId);
}

const ownerOf = (u: UserProfile) => (u.role === 'TEAM_MEMBER' ? u.employerId || '' : u.id);

function expireStale(now = Date.now()) {
  let n = 0;
  for (const p of st().visitPasses) if (p.status === 'ACTIVE' && Date.parse(p.validUntil) < now) { p.status = 'EXPIRED'; n++; }
  if (n) db.save();
  return n;
}
export const sweepVisitPasses = expireStale;

const issueSchema = z.object({
  leadId: z.string().min(3).max(40),
  scheduledAt: z.string().min(8).max(40),
  partySize: z.number().int().min(1).max(MAX_PARTY).optional(),
  note: z.string().trim().max(200).optional(),
  scanAt: z.enum(['OFFICE', 'GATE', 'MODEL']).optional(),
});
const confirmSchema = z.object({
  idChecked: z.literal(true, { message: 'Confirm that you checked the visitor\'s photo ID / name' }),
  partySize: z.number().int().min(1).max(MAX_PARTY).optional(),
  note: z.string().trim().max(200).optional(),
});

const view = (p: VisitPass) => ({ ...p, timing: passTiming(p), payload: qrPayload(p.code), link: `/v/${p.code}`, ackStatus: ackStatus('PASS', p.id), scan: scanLine('PASS', p.scanAt) });

export function createVisitRouter() {
  const r = Router();
  const me = () => ctx().user as UserProfile;
  const audit = (action: string, id: string, details: string) => { const u = me(); db.appendAuditEvent(u.id, u.role as any, 'VISIT', id, action, details); };

  r.get('/me', (_req, res) => {
    const u = profile(me().id)!;
    const canIssue = can(u as any, 'visit:pass');
    const canScan = can(u as any, 'visit:scan') && canScanFor(u, ownerOf(u));
    res.json({ success: true, canIssue, canScan, role: u.role, id: u.id });
  });

  // ── issue ──
  r.post('/passes', needs('visit:pass'), (req, res) => {
    const u = profile(me().id)!;
    const parsed = issueSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues[0]?.message || 'Invalid pass');
    const d = parsed.data;
    const slotErr = checkSlot(d.scheduledAt); if (slotErr) return bad(res, slotErr);
    const lead = db.byId('crmLeads', d.leadId);
    if (!lead || !canIssueFor(u, lead)) {
      if (lead && u.role === 'DEVELOPER_BUILDER' && lead.builderId === u.id && lead.associateId) {
        return bad(res, 'This lead belongs to a channel partner — only the partner can issue its visit pass (you scan it at the site)', 403);
      }
      return bad(res, 'Lead not found or not yours to issue a pass for', 404);
    }
    if (STAGES_NO_PASS.includes(lead.stage)) return bad(res, `A visit pass cannot be issued for a lead that is ${lead.stage.replace(/_/g, ' ').toLowerCase()}`, 409);
    if (lead.verify === 'REJECTED') return bad(res, 'This lead was rejected by the builder', 409);
    const project = db.byId('builderProjects', lead.projectId);
    if (!project || project.status === 'ARCHIVED') return bad(res, 'Project is not available', 409);
    if (lead.associateId) {
      const m = db.byId('associateMandates', lead.mandateId);
      if (!m || !mandateIsActive(m)) return bad(res, 'The partnership on this project is not active — pass cannot be issued', 409);
    }
    const wait = hit(`vpass:${u.id}`, 60, 86400_000);
    if (wait) return bad(res, 'Daily limit of 60 passes reached', 429);

    for (const o of st().visitPasses) if (o.leadId === lead.id && o.status === 'ACTIVE') o.status = 'SUPERSEDED';
    let code = ''; do { code = makeCode(n => crypto.randomInt(n)); } while (st().visitPasses.some(p => p.code === code));
    const ts = nowIso();
    const pass: VisitPass = {
      id: `VP-${Date.now().toString(36)}${crypto.randomInt(1296).toString(36)}`, code, leadId: lead.id, projectId: project.id, projectName: project.projectName,
      builderId: project.builderId, associateId: lead.associateId || '', associateName: lead.associateName || 'Builder desk',
      customerName: lead.name, phoneLast4: last4(lead.phone), scheduledAt: new Date(d.scheduledAt).toISOString(), ...passWindow(new Date(d.scheduledAt).toISOString()),
      partySize: d.partySize, note: d.note || undefined, scanAt: d.scanAt || defaultScanPoint('PASS'), status: 'ACTIVE', createdById: u.id, createdByName: u.name, createdAt: ts,
    };
    st().visitPasses.unshift(pass);
    // v33 — the buyer confirms “no direct deal” (tick + his mobile code) before the pass works; needs a valid mobile on the lead
    const newAck = createAck({ kind: 'PASS', refId: pass.id, phone: lead.phone, buyerName: lead.name, brokerId: lead.associateId || lead.builderId || u.id, subject: project.projectName });
    // the same buyer already confirmed for an earlier pass of this lead → a re-issued pass does not ask him again
    if (newAck) { const prior = st().visitPasses.filter(o => o.leadId === lead.id && o.id !== pass.id).map(o => ackFor('PASS', o.id)).find(a => a && a.status === 'ACKED' && a.phoneKey === newAck.phoneKey);
      if (prior) { newAck.status = 'ACKED'; newAck.tickedAt = prior.tickedAt; newAck.ackedAt = prior.ackedAt; newAck.textVersion = prior.textVersion; } }
    if (STAGES_BEFORE_VISIT.includes(lead.stage) && lead.stage !== 'SITE_VISIT_SCHEDULED') {
      lead.activities.unshift({ id: `A-${Date.now().toString(36)}`, type: 'STAGE_CHANGE', byUserId: u.id, byName: u.name, at: ts, note: `Stage ${lead.stage} → SITE_VISIT_SCHEDULED (visit pass issued)` });
      lead.stage = 'SITE_VISIT_SCHEDULED';
    }
    lead.activities.unshift({ id: `A-${Date.now().toString(36)}v`, type: 'SITE_VISIT', byUserId: u.id, byName: u.name, at: ts, note: `Visit pass ${code} issued for ${new Date(pass.scheduledAt).toLocaleString('en-IN')}` });
    lead.updatedAt = ts;
    db.save();
    audit('VISIT_PASS_ISSUED', pass.id, `${u.name} issued visit pass for ${lead.name} (${lead.id}) at ${project.projectName}, slot ${pass.scheduledAt}`);
    res.json({ success: true, pass: view(pass) });
  });

  r.get('/passes', needs('visit:pass'), (req, res) => {
    expireStale();
    const u = profile(me().id)!; const owner = ownerOf(u);
    const leadId = req.query.leadId ? String(req.query.leadId) : '';
    let list = st().visitPasses.filter(p => (u.role === 'DEVELOPER_BUILDER' || (u.role === 'TEAM_MEMBER' && profile(owner)?.role === 'DEVELOPER_BUILDER'))
      ? p.builderId === owner && !p.associateId : p.associateId === owner);
    if (u.role === 'TEAM_MEMBER') { const mine = new Set(st().crmLeads.filter(l => canIssueFor(u, l)).map(l => l.id)); list = list.filter(p => mine.has(p.leadId)); }
    if (leadId) list = list.filter(p => p.leadId === leadId);
    res.json({ success: true, passes: list.slice(0, 200).map(view) });
  });

  r.post('/passes/:id/cancel', needs('visit:pass'), (req, res) => {
    const u = profile(me().id)!;
    const p = st().visitPasses.find(x => x.id === req.params.id);
    const lead = p && db.byId('crmLeads', p.leadId);
    if (!p || !lead || !canIssueFor(u, lead)) return bad(res, 'Pass not found', 404);
    if (p.status !== 'ACTIVE') return bad(res, `Pass is already ${p.status.toLowerCase()}`, 409);
    p.status = 'CANCELLED'; p.cancelledAt = nowIso(); db.save();
    audit('VISIT_PASS_CANCELLED', p.id, `${u.name} cancelled pass ${p.code} for ${p.customerName}`);
    res.json({ success: true });
  });

  // ── scan (builder side only) ──
  const scanGate = (req: Request, res: Response): { pass: VisitPass; lead: CrmLead; u: UserProfile } | null => {
    const u = profile(me().id)!;
    if (hit(`vscan-all:${u.id}`, 150, 600_000)) { bad(res, 'Too many scans — wait a few minutes', 429); return null; }
    const code = normalizeCode(String(req.params.code || ''));
    const pass = code ? st().visitPasses.find(p => p.code === code) : undefined;
    // v34 — say plainly WHY it cannot be scanned here (a GENZ pass of someone else vs not a GENZ pass at all) — never whose it is.
    // Bad scans still count towards the lock, so codes cannot be guessed.
    if (!pass || !canScanFor(u, pass.builderId, pass.projectId)) {
      const wait = hit(`vscan-bad:${u.id}`, 10, 600_000, 600_000);
      if (wait) { bad(res, 'Too many invalid scans — scanner locked for 10 minutes', 429); return null; }
      const foreign = !!pass && !(u.role === 'TEAM_MEMBER' && !policyOf(u).canScanVisits);
      bad(res, !pass
        ? 'This is not a valid GENZ visit pass (unknown or mistyped code). Ask the visitor to open his pass link again. / यह GENZ का मान्य विज़िट पास नहीं है — विज़िटर से पास लिंक दोबारा खुलवाएँ।'
        : foreign ? 'This is a GENZ visit pass, but NOT for your project — you cannot scan it. Send the visitor to the right builder. / यह GENZ पास है, पर आपके प्रोजेक्ट का नहीं — आप इसे स्कैन नहीं कर सकते।'
        : 'Your employer has not allowed you to scan visit passes', 404, foreign ? 'NOT_YOUR_PASS' : undefined);
      return null;
    }
    const lead = db.byId('crmLeads', pass.leadId);
    if (!lead) { bad(res, 'Lead no longer exists', 404); return null; }
    return { pass, lead, u };
  };

  r.get('/scan/:code', needs('visit:scan'), (req, res) => {
    expireStale();
    const g = scanGate(req, res); if (!g) return;
    const { pass, lead } = g;
    const timing = passTiming(pass);
    const warnings: string[] = [];
    if (pass.status === 'USED') warnings.push(`Already used on ${new Date(pass.usedAt!).toLocaleString('en-IN')} by ${pass.usedByName}`);
    else if (pass.status !== 'ACTIVE') warnings.push(`Pass is ${pass.status.toLowerCase()}`);
    else if (timing === 'NOT_YET') warnings.push(`Pass opens ${new Date(pass.validFrom).toLocaleString('en-IN')}`);
    else if (timing === 'EXPIRED') warnings.push('Pass time window is over');
    if (lead.stage === 'LOST' || lead.verify === 'REJECTED') warnings.push('Lead is lost / rejected');
    const ackMsg = pass.status === 'ACTIVE' ? ackBlock('PASS', pass.id) : undefined; if (ackMsg) warnings.push(ackMsg.split(' / ')[0]);
    const partner = pass.associateId ? profile(pass.associateId) : undefined;
    res.json({
      success: true, canConfirm: pass.status === 'ACTIVE' && timing === 'OPEN' && !(lead.stage === 'LOST' || lead.verify === 'REJECTED') && !ackMsg, warnings,
      pass: {
        id: pass.id, code: pass.code, status: pass.status, timing, projectName: pass.projectName, scheduledAt: pass.scheduledAt, validFrom: pass.validFrom, validUntil: pass.validUntil,
        customerName: pass.customerName, phoneLast4: pass.phoneLast4, partySize: pass.partySize, note: pass.note,
        referredBy: pass.associateName, referredByCompany: partner?.companyName || '', leadStage: lead.stage, issuedBy: pass.createdByName,
      },
    });
  });

  r.post('/scan/:code/confirm', needs('visit:scan'), (req, res) => {
    expireStale();
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues[0]?.message || 'Invalid request');
    const g = scanGate(req, res); if (!g) return;
    const { pass, lead, u } = g;
    if (pass.status !== 'ACTIVE') return bad(res, pass.status === 'USED' ? 'This pass has already been used' : `Pass is ${pass.status.toLowerCase()}`, 409);
    const timing = passTiming(pass);
    if (timing !== 'OPEN') return bad(res, timing === 'NOT_YET' ? `Pass opens ${new Date(pass.validFrom).toLocaleString('en-IN')}` : 'Pass time window is over', 409);
    if (lead.stage === 'LOST' || lead.verify === 'REJECTED') return bad(res, 'Lead is lost / rejected', 409);
    const ackMsg = ackBlock('PASS', pass.id); if (ackMsg) return bad(res, ackMsg, 409, 'ACK_REQUIRED');
    const ts = nowIso();
    pass.status = 'USED'; pass.usedAt = ts; pass.usedById = u.id; pass.usedByName = u.name;
    if (parsed.data.partySize) pass.partySize = parsed.data.partySize;
    lead.visitProof = { at: ts, byName: u.name, passId: pass.id };
    const prev = lead.stage;
    if (STAGES_BEFORE_VISIT.includes(lead.stage)) lead.stage = 'SITE_VISITED';
    lead.activities.unshift({ id: `A-${Date.now().toString(36)}q`, type: 'SITE_VISIT', byUserId: u.id, byName: u.name, at: ts,
      note: `QR-verified site visit (pass ${pass.code}, ID checked by ${u.name})${prev !== lead.stage ? `; stage ${prev} → SITE_VISITED` : ''}${parsed.data.note ? `. ${parsed.data.note}` : ''}` });
    lead.updatedAt = ts;
    let points = false;
    if (pass.associateId) points = awardPoints(pass.associateId, 'PROJECT_VISIT', pass.id, 3);
    db.save();
    audit('VISIT_PASS_SCANNED', pass.id, `${u.name} verified visit of ${pass.customerName} (${lead.id}) at ${pass.projectName}; referred by ${pass.associateName}`);
    res.json({ success: true, pointsAwarded: points, stage: lead.stage });
  });

  r.get('/board', needs('visit:scan'), (_req, res) => {
    expireStale();
    const u = profile(me().id)!;
    if (!canScanFor(u, ownerOf(u))) return res.json({ success: true, expected: [], done: [] });
    const owner = ownerOf(u); const day = startOfDayMs(); const end = day + 86400_000;
    const pol = policyOf(u);
    const mine = st().visitPasses.filter(p => p.builderId === owner && (u.role !== 'TEAM_MEMBER' || pol.projectIds.length === 0 || pol.projectIds.includes(p.projectId)));
    const today = (p: VisitPass) => { const t = Date.parse(p.scheduledAt); return t >= day && t < end; };
    res.json({
      success: true,
      expected: mine.filter(p => p.status === 'ACTIVE' && (today(p) || passTiming(p) === 'OPEN')).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).map(p => ({ ...view(p), code: undefined, payload: undefined, link: undefined, codeTail: p.code.slice(-4) })),
      done: mine.filter(p => p.status === 'USED' && p.usedAt && Date.parse(p.usedAt) >= day).map(p => ({ ...view(p), code: undefined, payload: undefined, link: undefined })),
    });
  });
  return r;
}

// ───────────────────────── public pass page (customer shows this at the gate) ─────────────────────────
export function createPublicVisitRouter() {
  const r = Router();
  r.get('/:code', rateLimit('visit-pass-view', 60, 60_000), async (req: Request, res: Response) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    const gone = () => res.status(404).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Pass not found</title><body style="font-family:system-ui;padding:24px"><p>This visit pass was not found.</p></body>`);
    const code = normalizeCode(req.params.code);
    expireStale();
    const p = code ? st().visitPasses.find(x => x.code === code) : undefined;
    if (!p) return gone();
    // v33 — the buyer must confirm “no direct deal” (tick + mobile code) before he sees the QR
    if (p.status === 'ACTIVE' && ackBlock('PASS', p.id)) { const a = ackFor('PASS', p.id)!; return res.send(renderAckGate(a, ackBase(a))); }
    const proj = db.byId('builderProjects', p.projectId);
    const svg = await QRCode.toString(qrPayload(p.code), { type: 'svg', margin: 1, errorCorrectionLevel: 'M', width: 240 });
    const when = new Date(p.scheduledAt).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
    const live = p.status === 'ACTIVE' && passTiming(p) !== 'EXPIRED';
    const label = p.status === 'USED' ? 'Visit verified ✔' : p.status === 'ACTIVE' ? (live ? 'Valid pass' : 'Expired') : p.status === 'CANCELLED' || p.status === 'SUPERSEDED' ? 'Pass cancelled / replaced' : 'Expired';
    res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Site visit pass — ${esc(p.projectName)}</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f5f2;color:#1b1b1b}.w{max-width:440px;margin:0 auto;padding:16px}
.c{background:#fff;border-radius:18px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center}h1{font-size:19px;margin:0 0 2px}.s{color:#555;font-size:13px}
.q{display:inline-block;margin:14px 0 4px;padding:8px;border:1px solid #eee;border-radius:12px;${live ? '' : 'opacity:.25;'}}.q svg{display:block;width:230px;height:230px}.code{font-family:ui-monospace,Menlo,monospace;font-size:20px;letter-spacing:3px;font-weight:700}
.st{display:inline-block;margin:6px 0;padding:4px 14px;border-radius:999px;font-size:13px;font-weight:700;background:${p.status === 'USED' ? '#dcfce7;color:#166534' : live ? '#dbeafe;color:#1e40af' : '#fee2e2;color:#991b1b'}}
.row{display:flex;justify-content:space-between;gap:10px;font-size:14px;padding:8px 0;border-bottom:1px solid #eee;text-align:left}.row:last-child{border:0}.row b{text-align:right}.n{font-size:12px;color:#666;margin-top:12px;line-height:1.5}</style></head>
<body><div class="w"><div class="c"><div class="s">GENZ · Site visit pass</div><h1>${esc(p.projectName)}</h1>${proj?.locality ? `<div class="s">${esc(proj.locality)}${proj.city ? ', ' + esc(proj.city) : ''}</div>` : ''}
<div class="st">${esc(label)}</div><br><div class="q">${svg}</div><div class="code">${esc(p.code)}</div>
<div style="margin-top:14px"><div class="row"><span>Visitor</span><b>${esc(firstName(p.customerName))} · ••••${esc(p.phoneLast4)}</b></div><div class="row"><span>Visit slot</span><b>${esc(when)}</b></div>${p.partySize ? `<div class="row"><span>People</span><b>${p.partySize}</b></div>` : ''}<div class="row"><span>Referred by</span><b>${esc(p.associateName)}</b></div><div class="row"><span>Scan at</span><b>${esc(scanLine('PASS', p.scanAt).where.en)} · ${esc(scanLine('PASS', p.scanAt).where.hi)}</b></div></div>
<p class="n">Show this QR (or the code) at the ${esc(scanLine('PASS', p.scanAt).where.en.toLowerCase())} with a photo ID. It works once, only during the slot window, and only the builder's team can scan it.<br>कृपया यह QR / कोड प्रोजेक्ट ऑफ़िस पर फ़ोटो ID के साथ दिखाएँ। यह एक ही बार मान्य है।</p></div></div></body></html>`);
  });
  return r;
}
