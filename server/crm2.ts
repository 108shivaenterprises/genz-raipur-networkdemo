/**
 * v16 — CRM controls, workflow and reports.  Mounted at /api/crm BEFORE the base CRM router.
 *
 * Controls  : customer consent + opt-out, two-side money (claim → record → confirm), partial collections with reversal,
 *             payout ledger (UTR / mode / date) the associate confirms, TDS per project, protection extension with real activity,
 *             audited phone correction, cancellation requests with refund / forfeit / clawback, retention of lost / opted-out leads.
 * Workflow  : follow-up edit / snooze / delete, structured lost reasons, visit feedback, temperature + tags, CSV import / export,
 *             bulk actions, alerts.
 * Reports   : funnel, project / associate / source tables, lost reasons, aging, money flags.
 *
 * GENZ never moves money: everything here RECORDS what the parties say, and makes the other side confirm it.
 */
import { alert, inr } from './alerts.js';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from './db.js';
import type { UserProfile } from './db.js';
import { ctx, needs, rateLimit, digits } from './auth.js';
import { isAdmin, isSuper } from './access.js';
import { phoneSchema, maskPhoneNumber } from './validation.js';
import { policyOf } from '../src/shared/pcontrolRules.js';
import { trailsFor } from './crm4.js';
import { trailFlags, isOpenTrail } from '../src/shared/moneyTrail.js';
import {
  registerLead, leadCreateSchema, leadsForUser, bookingsForUser, canWork, auditCrm, currentUser, viewLead, viewBooking, collectedPct, payableBrokerage, paidOf, cancelBooking, nowIso, autoFollowUp,
  type CrmUser,
} from './crm.js';
import {
  LOST_CODES, lostCodeOk, TEMPERATURES, MAX_TAGS, MAX_BULK, MAX_IMPORT_ROWS, PHONE_FIX_HOURS, PROTECTION_EXTEND_DAYS, CLAIM_ESCALATE_DAYS, PAYOUT_CONFIRM_DAYS,
  LOST_RETENTION_DAYS, OPTOUT_RETENTION_DAYS, extendBlock, isStale, isOpenStage, protectionDaysLeft, lastActivityAt, csvCell, parseCsv, brokerageBreakup, effectiveTdsPct,
} from '../src/shared/crmRules.js';
import { CRM_STAGE_ORDER } from '../src/types/crm.js';
import { parseSource, callStats, callOutcome, UNCALLED_HOURS, FORWARD_UNSEEN_HOURS, TOKEN_UNCONFIRMED_DAYS, inferTeamRole } from '../src/shared/crmSales.js';
import type { CrmLead, CrmBooking, CrmLeadStage } from '../src/types/crm.js';

const DAY = 86400_000;
const bad = (res: Response, error: string, status = 400, code?: string) => res.status(status).json(code ? { error, code } : { error });
const me = currentUser;
const stateOf = () => db.getState();
const isBuilderOf = (u: CrmUser, b: { builderId: string }) => (u.role === 'DEVELOPER_BUILDER' && b.builderId === u.id) || isSuper(u as any);
const isAssociateOf = (u: CrmUser, b: { associateId: string }) => u.role === 'BROKER' && b.associateId === u.id;
const aid = (p: string) => `${p}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`;

/** Fraction of the schedule's money that is overdue and unpaid, per booking. */
function overdueMilestones(bks: CrmBooking[], now = Date.now()) {
  const out: { bookingId: string; customer: string; project: string; milestone: string; dueDate: string; pending: number; days: number }[] = [];
  for (const b of bks) {
    if (b.status !== 'APPROVED') continue;
    for (const m of b.paymentSchedule) {
      const pending = m.amount - paidOf(m);
      if (pending > 0 && Date.parse(m.dueDate) < now) out.push({ bookingId: b.id, customer: b.customerName, project: b.projectName, milestone: m.name, dueDate: m.dueDate, pending, days: Math.floor((now - Date.parse(m.dueDate)) / DAY) });
    }
  }
  return out.sort((a, b) => b.days - a.days);
}

export function createCrmPlusRouter() {
  const r = Router();
  r.use(needs('crm:read'));

  const loadLead = (req: Request, res: Response, opts: { work?: boolean } = {}): CrmLead | null => {
    const u = me(); const lead = leadsForUser(u).find(l => l.id === req.params.id);
    if (!lead || (opts.work !== false && !canWork(u, lead))) { bad(res, 'Lead not found', 404); return null; }
    return lead;
  };
  const activity = (l: CrmLead, type: CrmLead['activities'][number]['type'], note: string) => {
    const u = me();
    l.activities.unshift({ id: aid('A'), type, note, byUserId: u.id, byName: u.name, at: nowIso() });
    l.updatedAt = nowIso();
  };
  const nextFu = (l: CrmLead) => { l.nextFollowUpAt = l.followUps.filter(f => !f.done).map(f => f.dueAt).sort()[0]; };

  // ═════════════════════════ alerts ═════════════════════════
  r.get('/alerts', (_req, res) => {
    const u = me(); const now = Date.now();
    const leads = leadsForUser(u).filter(l => !l.erasedAt); const bks = bookingsForUser(u);
    const open = leads.filter(l => isOpenStage(l.stage));
    const A: { kind: string; severity: 'high' | 'med' | 'low'; count: number; en: string; hi: string; ids?: string[] }[] = [];
    const add = (kind: string, severity: 'high' | 'med' | 'low', ids: string[], en: string, hi: string) => { if (ids.length) A.push({ kind, severity, count: ids.length, en, hi, ids: ids.slice(0, 30) }); };
    add('FOLLOWUP_OVERDUE', 'high', open.filter(l => l.followUps.some(f => !f.done && Date.parse(f.dueAt) < now)).map(l => l.id), 'Leads with overdue follow-ups', 'ओवरड्यू फ़ॉलो-अप वाली लीड');
    add('PROTECTION_EXPIRING', 'high', open.filter(l => protectionDaysLeft(l) <= 7 && l.stage !== 'BOOKING_REQUESTED').map(l => l.id), 'Leads losing protection within 7 days', '7 दिन में सुरक्षा खत्म होने वाली लीड');
    add('STALE', 'med', open.filter(l => isStale(l)).map(l => l.id), 'Leads with no activity for 7+ days', '7+ दिन से निष्क्रिय लीड');
    // v16.7 — speed to lead, forwarded leads, unreachable leads
    add('FORWARDED_TO_ME', 'high', open.filter(l => { const h = (l.handoffs || [])[0]; return !!h && !h.seenAt && h.toId === u.id; }).map(l => l.id), 'Leads forwarded to you — open them', 'आपको फ़ॉरवर्ड की गई लीड — खोलकर देखें');
    if (u.role !== 'TEAM_MEMBER') add('FORWARD_UNSEEN', 'med', open.filter(l => { const h = (l.handoffs || [])[0]; return !!h && !h.seenAt && h.toId !== u.id && now - Date.parse(h.at) > FORWARD_UNSEEN_HOURS * 3600_000; }).map(l => l.id), `Forwarded leads not opened for ${FORWARD_UNSEEN_HOURS}+ hours`, `${FORWARD_UNSEEN_HOURS}+ घंटे से बिना खोली फ़ॉरवर्ड लीड`);
    add('NEW_NOT_CALLED', 'med', open.filter(l => l.stage === 'NEW' && !l.activities.some(a => ['CALL', 'WHATSAPP', 'MEETING'].includes(a.type)) && now - Date.parse(l.createdAt) > UNCALLED_HOURS * 3600_000).map(l => l.id), `New leads nobody has contacted in ${UNCALLED_HOURS}+ hours`, `${UNCALLED_HOURS}+ घंटे से बिना संपर्क वाली नई लीड`);
    add('UNREACHABLE', 'low', open.filter(l => callStats(l).unreached).map(l => l.id), 'Leads called 5+ times and never reached', '5+ बार कॉल, एक बार भी बात नहीं हुई');
    if (u.role === 'DEVELOPER_BUILDER' || isAdmin(u as any)) {
      add('VERIFY_PENDING', 'med', leads.filter(l => l.verify === 'PENDING').map(l => l.id), 'Associate leads awaiting your verification', 'आपके वेरिफ़िकेशन की प्रतीक्षा में एसोसिएट लीड');
      const claims = bks.flatMap(b => b.paymentSchedule.filter(m => m.claim?.status === 'OPEN').map(m => ({ b, m })));
      add('CLAIM_OPEN', 'high', claims.map(c => c.b.id), 'Payment claims awaiting your reply', 'आपके जवाब की प्रतीक्षा में पेमेंट क्लेम');
      add('CLAIM_ESCALATED', 'high', claims.filter(c => now - Date.parse(c.m.claim!.at) > CLAIM_ESCALATE_DAYS * DAY).map(c => c.b.id), `Payment claims unanswered for ${CLAIM_ESCALATE_DAYS}+ days`, `${CLAIM_ESCALATE_DAYS}+ दिन से बिना जवाब के पेमेंट क्लेम`);
      add('COLLECTION_OVERDUE', 'med', [...new Set(overdueMilestones(bks).map(o => o.bookingId))], 'Bookings with overdue payment milestones', 'ओवरड्यू पेमेंट किस्तों वाली बुकिंग');
      add('TOKEN_UNCONFIRMED', 'high', bks.filter(b => b.token?.status === 'CLAIMED' && ['REQUESTED', 'APPROVED'].includes(b.status) && now - Date.parse(b.token.claimedAt) > TOKEN_UNCONFIRMED_DAYS * DAY).map(b => b.id), `Booking amounts claimed but not confirmed for ${TOKEN_UNCONFIRMED_DAYS}+ days`, `${TOKEN_UNCONFIRMED_DAYS}+ दिन से बिना कन्फ़र्म की गई बुकिंग राशि`);
      add('CANCEL_REQUEST', 'med', bks.filter(b => b.cancelRequest?.status === 'OPEN').map(b => b.id), 'Booking cancellation requests waiting for you', 'आपके इंतज़ार में बुकिंग कैंसिल अनुरोध');
      add('PAYOUT_DISPUTED', 'high', bks.filter(b => (b.payouts || []).some(p => p.status === 'DISPUTED')).map(b => b.id), 'Payouts disputed by the associate', 'एसोसिएट द्वारा विवादित पेआउट');
      add('CLAWBACK_DUE', 'low', bks.filter(b => b.settlement?.clawbackStatus === 'DUE').map(b => b.id), 'Brokerage clawbacks still due', 'बाकी ब्रोकरेज वापसी');
    }
    if (u.role === 'BROKER') {
      add('PAYOUT_UNCONFIRMED', 'med', bks.filter(b => (b.payouts || []).some(p => p.status === 'RECORDED' && now - Date.parse(p.at) > PAYOUT_CONFIRM_DAYS * DAY)).map(b => b.id), `Payouts you have not confirmed (${PAYOUT_CONFIRM_DAYS}+ days)`, `${PAYOUT_CONFIRM_DAYS}+ दिन से कन्फ़र्म नहीं किए पेआउट`);
      add('PAYOUT_NEW', 'med', bks.filter(b => (b.payouts || []).some(p => p.status === 'RECORDED' && now - Date.parse(p.at) <= PAYOUT_CONFIRM_DAYS * DAY)).map(b => b.id), 'New payouts — confirm that you received them', 'नए पेआउट — मिलने पर कन्फ़र्म करें');
      add('CLAWBACK_DUE', 'high', bks.filter(b => b.settlement?.clawbackStatus === 'DUE').map(b => b.id), 'Brokerage clawback due on a cancelled booking', 'कैंसिल बुकिंग पर ब्रोकरेज वापसी बाकी');
    }
    // v16.9 — customer money still on its way (who must act on it is whoever the Money Trail says can)
    const live = trailsFor(u as any).filter(isOpenTrail); const tf = trailFlags(live, now);
    const uniq = (xs: { bookingId: string }[]) => [...new Set(xs.map(x => x.bookingId))];
    add('MONEY_WITH_TEAM', 'high', uniq(tf.withTeam.filter(t => t.can.cpConfirm || t.can.builderConfirm)), 'Money collected by a team member — waiting for your confirmation', 'टीम मेंबर द्वारा ली गई रकम — आपके कन्फ़र्म करने की प्रतीक्षा में');
    add('MONEY_AWAITING_BUILDER', 'high', uniq(tf.awaitingBuilder.filter(t => t.can.builderConfirm)), 'Money handed over to you — confirm that it arrived', 'आपको सौंपी गई रकम — मिलने पर कन्फ़र्म करें');
    add('MONEY_AWAITING_BUILDER_CP', 'med', uniq(tf.awaitingBuilder.filter(t => !t.can.builderConfirm)), 'Money handed to the builder — not confirmed by the builder yet', 'बिल्डर को सौंपी गई रकम — बिल्डर ने अभी तक कन्फ़र्म नहीं की');
    add('MONEY_STUCK', 'high', uniq(tf.stuck), 'Money entries marked "not received" — sort them out', '"नहीं मिली" चिह्नित रकम — इन्हें सुलझाएँ');
    res.json({ success: true, alerts: A });
  });

  // ═════════════════════════ lead controls ═════════════════════════
  r.post('/leads/:id/extend-protection', needs('crm:lead_manage'), (req: Request, res: Response) => {
    const u = me(); const lead = loadLead(req, res); if (!lead) return;
    if (u.role === 'TEAM_MEMBER') return bad(res, 'Ask your employer to extend this lead', 403);
    const why = extendBlock(lead); if (why) return bad(res, why, 409, 'EXTEND_BLOCKED');
    const base = Math.max(Date.parse(lead.protectedUntil), Date.now());
    lead.protectedUntil = new Date(base + PROTECTION_EXTEND_DAYS * DAY).toISOString();
    lead.protectionExtensions = (lead.protectionExtensions || 0) + 1;
    activity(lead, 'SYSTEM', `Registration protection extended by ${PROTECTION_EXTEND_DAYS} days (${lead.protectionExtensions}) — until ${lead.protectedUntil.slice(0, 10)}`);
    db.save(); auditCrm('CRM_PROTECTION_EXTENDED', lead.id, `${lead.name}: protection extended to ${lead.protectedUntil.slice(0, 10)} (${lead.protectionExtensions})`);
    res.json({ success: true, lead: viewLead(lead, u) });
  });

  r.post('/leads/:id/correct-phone', needs('crm:lead_manage'), (req: Request, res: Response) => {
    const u = me(); const lead = loadLead(req, res); if (!lead) return;
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 5) return bad(res, 'Say why the number is being corrected (min 5 chars)');
    const p = phoneSchema.safeParse(req.body?.phone); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid phone');
    if (lead.stage === 'BOOKED' || lead.stage === 'BOOKING_REQUESTED' || lead.optedOutAt || lead.erasedAt) return bad(res, 'The number of this lead can no longer be changed', 409);
    const builder = isBuilderOf(u, lead);
    const own = lead.associateId === u.id && u.role === 'BROKER' && Date.now() - Date.parse(lead.createdAt) <= PHONE_FIX_HOURS * 3600_000;
    if (!builder && !own) return bad(res, `The associate can fix a typo only within ${PHONE_FIX_HOURS} hours of registering. Ask the builder to correct it.`, 403, 'PHONE_LOCKED');
    const key = digits(p.data);
    if (key === lead.phoneKey) return bad(res, 'This is already the number on the lead');
    const now = Date.now();
    const clash = stateOf().crmLeads.find(l => l.id !== lead.id && l.projectId === lead.projectId && l.phoneKey === key && l.verify !== 'REJECTED' && (l.stage === 'BOOKED' || l.stage === 'BOOKING_REQUESTED' || (l.stage !== 'LOST' && Date.parse(l.protectedUntil) > now)));
    if (clash) return bad(res, 'That number is already registered for this project and is under protection', 409, 'LEAD_DUPLICATE');
    const old = lead.phone; lead.phone = p.data; lead.phoneKey = key;
    activity(lead, 'SYSTEM', `Phone corrected ${maskPhoneNumber(old)} → ${maskPhoneNumber(p.data)}: ${reason.slice(0, 160)}`);
    db.save(); auditCrm('CRM_PHONE_CORRECTED', lead.id, `${lead.name}: phone corrected ${maskPhoneNumber(old)} → ${maskPhoneNumber(p.data)} by ${u.name}. Reason: ${reason}`);
    res.json({ success: true, lead: viewLead(lead, u) });
  });

  r.post('/leads/:id/optout', needs('crm:lead_manage'), (req: Request, res: Response) => {
    const u = me(); const lead = loadLead(req, res); if (!lead) return;
    if (lead.optedOutAt) return bad(res, 'Already opted out', 409);
    if (lead.stage === 'BOOKED' || lead.stage === 'BOOKING_REQUESTED') return bad(res, 'This customer already has a booking — manage contact preferences with the builder', 409);
    lead.optedOutAt = nowIso(); lead.stage = 'LOST'; lead.lostCode = 'NOT_INTERESTED'; lead.lostReason = 'Customer asked not to be contacted';
    lead.followUps = lead.followUps.filter(f => f.done); lead.nextFollowUpAt = undefined;
    activity(lead, 'SYSTEM', `Customer opted out of contact${req.body?.note ? `: ${String(req.body.note).slice(0, 150)}` : ''}. Personal data is erased after ${OPTOUT_RETENTION_DAYS} days.`);
    db.save(); auditCrm('CRM_LEAD_OPTOUT', lead.id, `${lead.name} opted out (recorded by ${u.name}); outreach locked`);
    res.json({ success: true, lead: viewLead(lead, u) });
  });

  // follow-ups: edit / snooze / delete
  const fuPatch = z.object({ dueAt: z.string().optional(), note: z.string().trim().min(2).max(300).optional(), channel: z.enum(['CALL', 'WHATSAPP', 'MEETING', 'SITE_VISIT']).optional() });
  r.patch('/leads/:id/followups/:fid', needs('crm:lead_manage'), (req: Request, res: Response) => {
    const u = me(); const lead = loadLead(req, res); if (!lead) return;
    const fu = lead.followUps.find(f => f.id === req.params.fid); if (!fu) return bad(res, 'Follow-up not found', 404);
    if (fu.done) return bad(res, 'A completed follow-up cannot be changed', 409);
    const p = fuPatch.safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid follow-up');
    if (p.data.dueAt !== undefined) { if (Number.isNaN(Date.parse(p.data.dueAt))) return bad(res, 'A valid due date/time is required'); fu.dueAt = new Date(p.data.dueAt).toISOString(); }
    if (p.data.note) fu.note = p.data.note; if (p.data.channel) fu.channel = p.data.channel;
    nextFu(lead); lead.updatedAt = nowIso(); db.save();
    res.json({ success: true, lead: viewLead(lead, u) });
  });
  r.delete('/leads/:id/followups/:fid', needs('crm:lead_manage'), (req: Request, res: Response) => {
    const u = me(); const lead = loadLead(req, res); if (!lead) return;
    const fu = lead.followUps.find(f => f.id === req.params.fid); if (!fu) return bad(res, 'Follow-up not found', 404);
    if (fu.done) return bad(res, 'A completed follow-up cannot be removed', 409);
    lead.followUps = lead.followUps.filter(f => f.id !== fu.id); nextFu(lead); lead.updatedAt = nowIso(); db.save();
    res.json({ success: true, lead: viewLead(lead, u) });
  });

  // visit feedback
  const fbSchema = z.object({ rating: z.number().int().min(1).max(5), liked: z.array(z.string().trim().min(1).max(30)).max(6).default([]), objection: z.string().trim().max(300).default(''), nextStep: z.string().trim().max(200).default('') });
  r.post('/leads/:id/visit-feedback', needs('crm:lead_manage'), (req: Request, res: Response) => {
    const u = me(); const lead = loadLead(req, res); if (!lead) return;
    const p = fbSchema.safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid feedback');
    if (!['SITE_VISITED', 'NEGOTIATION', 'BOOKING_REQUESTED', 'BOOKED'].includes(lead.stage)) return bad(res, 'Visit feedback can be added after the customer has visited the site', 409);
    if ((lead.visitFeedback || []).length >= 5) return bad(res, 'At most 5 feedback entries per lead', 409);
    lead.visitFeedback = [...(lead.visitFeedback || []), { id: aid('VF'), at: nowIso(), byId: u.id, byName: u.name, ...p.data }];
    if (!lead.temperature) lead.temperature = p.data.rating >= 4 ? 'HOT' : p.data.rating === 3 ? 'WARM' : 'COLD';
    activity(lead, 'NOTE', `Visit feedback ★${p.data.rating}${p.data.liked.length ? ` · liked: ${p.data.liked.join(', ')}` : ''}${p.data.objection ? ` · objection: ${p.data.objection}` : ''}${p.data.nextStep ? ` · next: ${p.data.nextStep}` : ''}`);
    db.save(); res.json({ success: true, lead: viewLead(lead, u) });
  });

  // ═════════════════════════ import / export / bulk ═════════════════════════
  const rowSchema = z.object({ name: z.string().trim().min(2).max(120), phone: phoneSchema, email: z.string().trim().max(200).optional(), unitInterest: z.string().trim().max(160).optional(), budgetMax: z.number().positive().max(100_000_000_000).optional(), note: z.string().trim().max(300).optional() });
  r.post('/leads/import', needs('crm:lead_create'), rateLimit('crm-import', 5, 24 * 3600_000), (req: Request, res: Response) => {
    const u = me();
    if (req.body?.consent !== true) return bad(res, 'Confirm that every customer in this file agreed to be contacted', 400, 'CONSENT_REQUIRED');
    const projectId = String(req.body?.projectId || ''); if (!projectId) return bad(res, 'Choose a project');
    const defaultSource = req.body?.source ? parseSource(req.body.source) : undefined;
    if (req.body?.source && !defaultSource) return bad(res, 'Unknown lead source');
    const defaultDetail = typeof req.body?.sourceDetail === 'string' ? req.body.sourceDetail : undefined;
    let rows: Record<string, unknown>[] = [];
    if (typeof req.body?.csv === 'string') {
      if (req.body.csv.length > 400_000) return bad(res, 'File is too large');
      const t = parseCsv(req.body.csv); const head = (t[0] || []).map(h => h.trim().toLowerCase());
      if (!head.includes('name') || !head.includes('phone')) return bad(res, 'The first row must have the headings: name, phone (optional: email, interest, budget, note, source, source_detail)');
      rows = t.slice(1).map(c => { const o: Record<string, unknown> = {}; head.forEach((h, i) => { o[h] = (c[i] || '').trim(); }); return o; });
    } else if (Array.isArray(req.body?.rows)) rows = req.body.rows; else return bad(res, 'Send the rows as csv text');
    if (!rows.length) return bad(res, 'The file has no rows');
    if (rows.length > MAX_IMPORT_ROWS) return bad(res, `Import at most ${MAX_IMPORT_ROWS} rows at a time`);
    const out: { row: number; ok: boolean; id?: string; error?: string; code?: string }[] = [];
    const seen = new Set<string>();
    rows.forEach((raw, i) => {
      const srcCell = raw.source ?? raw.lead_source ?? raw.leadsource;
      const rowSource = srcCell ? parseSource(srcCell) : defaultSource;
      if (srcCell && !rowSource) { out.push({ row: i + 2, ok: false, error: `Unknown lead source “${String(srcCell).slice(0, 40)}” — use one of the source names from the form` }); return; }
      const rowDetail = String(raw.source_detail || raw.sourcedetail || raw.campaign || defaultDetail || '').slice(0, 100) || undefined;
      const budget = raw.budget ?? raw.budgetmax; const p = rowSchema.safeParse({ name: raw.name, phone: String(raw.phone || '').replace(/\s+/g, ''), email: raw.email ? String(raw.email) : undefined, unitInterest: (raw.interest ?? raw.unitinterest) ? String(raw.interest ?? raw.unitinterest) : undefined, budgetMax: budget ? Number(budget) : undefined, note: raw.note ? String(raw.note) : undefined });
      if (!p.success) { out.push({ row: i + 2, ok: false, error: p.error.issues[0]?.message || 'Invalid row' }); return; }
      const key = digits(p.data.phone);
      if (seen.has(key)) { out.push({ row: i + 2, ok: false, error: 'Duplicate number inside the file', code: 'LEAD_DUPLICATE' }); return; }
      seen.add(key);
      const parsed = leadCreateSchema.safeParse({ ...p.data, email: p.data.email && /^\S+@\S+\.\S+$/.test(p.data.email) ? p.data.email : undefined, projectId, source: rowSource || 'ASSOCIATE_REFERRAL', sourceDetail: rowDetail, consent: true });
      if (!parsed.success) { out.push({ row: i + 2, ok: false, error: parsed.error.issues[0]?.message || 'Invalid row' }); return; }
      const rr = registerLead(u as unknown as UserProfile, parsed.data, { via: 'IMPORT' });
      if (rr.status === 200) out.push({ row: i + 2, ok: true, id: rr.body.lead.id }); else out.push({ row: i + 2, ok: false, error: rr.body.error, code: rr.body.code });
    });
    const ok = out.filter(o => o.ok).length;
    auditCrm('CRM_LEADS_IMPORTED', projectId, `${u.name} imported ${ok} of ${rows.length} leads into ${projectId} (consent attested for the whole file)`);
    res.json({ success: true, imported: ok, failed: out.length - ok, results: out });
  });

  r.get('/leads/export', rateLimit('crm-export', 10, 24 * 3600_000), (req: Request, res: Response) => {
    const u = me();
    if (u.role === 'TEAM_MEMBER') return bad(res, 'Employees cannot export leads — ask your employer', 403);
    const full = req.query.full === '1' && !isAdmin(u as any);
    const leads = leadsForUser(u).filter(l => !l.erasedAt && (!req.query.projectId || l.projectId === String(req.query.projectId)));
    const head = ['id', 'project', 'name', 'phone', 'email', 'source', 'source_detail', 'stage', 'temperature', 'tags', 'lost_reason', 'created', 'last_activity', 'next_followup', 'associate', 'protected_until'];
    const lines = [head.join(',')].concat(leads.map(l => [l.id, l.projectName, l.name, full ? l.phone : maskPhoneNumber(l.phone), l.email || '', l.source, l.sourceDetail || '', l.stage, l.temperature || '', (l.tags || []).join('|'), l.lostCode || '', l.createdAt.slice(0, 10), lastActivityAt(l).slice(0, 10), (l.nextFollowUpAt || '').slice(0, 10), l.associateName, l.protectedUntil.slice(0, 10)].map(csvCell).join(',')));
    auditCrm('CRM_LEADS_EXPORTED', 'EXPORT', `${u.name} exported ${leads.length} leads (${full ? 'full phone numbers' : 'masked phone numbers'})`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="genz-leads-${nowIso().slice(0, 10)}.csv"`); res.setHeader('Cache-Control', 'no-store');
    res.send('﻿' + lines.join('\n'));
  });

  r.post('/leads/bulk', needs('crm:lead_manage'), rateLimit('crm-bulk', 60, 24 * 3600_000), (req: Request, res: Response) => {
    const u = me();
    const ids: string[] = Array.isArray(req.body?.ids) ? [...new Set<string>(req.body.ids.map(String))] : [];
    if (!ids.length) return bad(res, 'Select at least one lead'); if (ids.length > MAX_BULK) return bad(res, `At most ${MAX_BULK} leads at a time`);
    const action = String(req.body?.action || '');
    if (!['TEMPERATURE', 'TAG', 'FOLLOWUP', 'LOST'].includes(action)) return bad(res, 'action must be TEMPERATURE, TAG, FOLLOWUP or LOST');
    const temp = req.body?.temperature; const tag = String(req.body?.tag || '').trim().slice(0, 20);
    if (action === 'TEMPERATURE' && !(TEMPERATURES as readonly string[]).includes(temp)) return bad(res, 'Pick HOT, WARM or COLD');
    if (action === 'TAG' && !tag) return bad(res, 'Enter a tag');
    if (action === 'FOLLOWUP' && (!req.body?.dueAt || Number.isNaN(Date.parse(req.body.dueAt)) || String(req.body?.note || '').trim().length < 2 || !['CALL', 'WHATSAPP', 'MEETING', 'SITE_VISIT'].includes(req.body?.channel))) return bad(res, 'A due date, channel and note are required');
    if (action === 'LOST' && !lostCodeOk(req.body?.lostCode)) return bad(res, 'Pick a lost reason');
    if (action === 'LOST' && u.role === 'TEAM_MEMBER' && !policyOf(stateOf().users.find(x => x.id === u.id)).canMarkLost) return bad(res, 'Only your employer can mark leads lost', 403);
    const results = ids.map(id => {
      const l = leadsForUser(u).find(x => x.id === id);
      if (!l || !canWork(u, l)) return { id, ok: false, error: 'Not found' };
      if (action === 'LOST') {
        if (!isOpenStage(l.stage) || l.stage === 'BOOKING_REQUESTED') return { id, ok: false, error: 'Booked / booking pending leads cannot be marked lost here' };
        l.stage = 'LOST'; l.lostCode = req.body.lostCode; l.lostReason = String(req.body?.note || '').trim().slice(0, 300) || LOST_CODES.find(c => c.id === req.body.lostCode)!.en;
        activity(l, 'STAGE_CHANGE', `Stage → LOST (bulk): ${l.lostReason}`);
      } else if (action === 'TEMPERATURE') { l.temperature = temp; l.updatedAt = nowIso(); }
      else if (action === 'TAG') {
        const cur = l.tags || []; if (cur.includes(tag)) return { id, ok: true };
        if (cur.length >= MAX_TAGS) return { id, ok: false, error: `Already has ${MAX_TAGS} tags` };
        l.tags = [...cur, tag]; l.updatedAt = nowIso();
      } else {
        if (l.optedOutAt || !isOpenStage(l.stage)) return { id, ok: false, error: 'Lead is closed or opted out' };
        l.followUps.push({ id: aid('FU'), dueAt: new Date(req.body.dueAt).toISOString(), note: String(req.body.note).trim().slice(0, 300), channel: req.body.channel, done: false, createdBy: u.id }); nextFu(l); l.updatedAt = nowIso();
      }
      return { id, ok: true };
    });
    db.save(); auditCrm('CRM_BULK_ACTION', 'BULK', `${u.name} bulk ${action} on ${results.filter(x => x.ok).length}/${ids.length} leads`);
    res.json({ success: true, done: results.filter(x => x.ok).length, results });
  });

  // ═════════════════════════ money: claims, reversals, ledger, payout confirmation ═════════════════════════
  const loadBooking = (req: Request, res: Response): CrmBooking | null => {
    const u = me(); const b = bookingsForUser(u).find(x => x.id === req.params.id);
    if (!b) { bad(res, 'Booking not found', 404); return null; } return b;
  };

  r.post('/bookings/:id/payments/:mid/claim', needs('crm:booking_request'), rateLimit('crm-claim', 20, 24 * 3600_000), (req: Request, res: Response) => {
    const u = me(); const b = loadBooking(req, res); if (!b) return;
    if (!isAssociateOf(u, b)) return bad(res, 'Only the associate on this booking can raise a payment claim', 403);
    if (b.status !== 'APPROVED') return bad(res, 'Claims can be raised only on approved bookings', 409);
    const m = b.paymentSchedule.find(x => x.id === req.params.mid); if (!m) return bad(res, 'Milestone not found', 404);
    if (paidOf(m) >= m.amount) return bad(res, 'This milestone is already fully collected', 409);
    if (m.claim?.status === 'OPEN') return bad(res, 'A claim is already open on this milestone', 409);
    const note = String(req.body?.note || '').trim(); if (note.length < 5) return bad(res, 'Say what the customer told you (date, mode, reference) — min 5 chars');
    m.claim = { id: aid('CL'), at: nowIso(), byId: u.id, byName: u.name, note: note.slice(0, 300), status: 'OPEN' };
    b.updatedAt = nowIso(); db.save();
    auditCrm('CRM_PAYMENT_CLAIMED', b.id, `${u.name} says the customer paid "${m.name}" on ${b.id}: ${note.slice(0, 150)}. The builder must record it or reply.`, 'COMMISSION');
    res.json({ success: true, booking: viewBooking(b) });
  });

  r.post('/bookings/:id/payments/:mid/receipts/:rid/reverse', needs('crm:booking_decide'), (req: Request, res: Response) => {
    const u = me(); const b = loadBooking(req, res); if (!b) return;
    if (!isBuilderOf(u, b)) return bad(res, 'Only the builder can reverse a collection entry', 403);
    const m = b.paymentSchedule.find(x => x.id === req.params.mid); if (!m) return bad(res, 'Milestone not found', 404);
    const rc = (m.receipts || []).find(x => x.id === req.params.rid); if (!rc) return bad(res, 'This entry was recorded before receipts were tracked and cannot be reversed here', 404);
    if (rc.reversed) return bad(res, 'Already reversed', 409);
    const reason = String(req.body?.reason || '').trim(); if (reason.length < 5) return bad(res, 'A reason (min 5 chars) is required');
    const live = (m.receipts || []).filter(x => !x.reversed && x.id !== rc.id).reduce((a, x) => a + x.amount, 0);
    const total = b.paymentSchedule.reduce((a, x) => a + x.amount, 0) || 1;
    const newCollected = b.paymentSchedule.reduce((a, x) => a + (x.id === m.id ? live : paidOf(x)), 0);
    const supports = Math.round((b.brokerageAmount * Math.min(100, (newCollected / total) * 100)) / 100);
    if (b.brokeragePaidAmount > supports) return bad(res, `Brokerage already paid (₹${b.brokeragePaidAmount.toLocaleString('en-IN')}) is more than the reduced collection supports (₹${supports.toLocaleString('en-IN')}). Settle with the associate first.`, 409, 'PAYOUT_EXCEEDS');
    rc.reversed = { at: nowIso(), byName: u.name, reason: reason.slice(0, 200) };
    m.paidAmount = live; m.paid = live >= m.amount; if (!m.paid) { m.paidAt = undefined; m.receiptNo = undefined; }
    b.updatedAt = nowIso(); db.save();
    auditCrm('CRM_PAYMENT_REVERSED', b.id, `${u.name} reversed ₹${rc.amount.toLocaleString('en-IN')} (${m.name}, ref ${rc.ref}) on ${b.id}: ${reason}`, 'COMMISSION');
    res.json({ success: true, booking: viewBooking(b) });
  });

  r.post('/bookings/:id/payouts/:pid/ack', needs('crm:booking_request'), (req: Request, res: Response) => {
    const u = me(); const b = loadBooking(req, res); if (!b) return;
    if (!isAssociateOf(u, b)) return bad(res, 'Only the associate who is being paid can confirm', 403);
    const po = (b.payouts || []).find(x => x.id === req.params.pid); if (!po) return bad(res, 'Payout not found', 404);
    if (po.status !== 'RECORDED') return bad(res, `Already ${po.status.toLowerCase()}`, 409);
    const action = req.body?.action; const note = String(req.body?.note || '').trim();
    if (!['CONFIRM', 'DISPUTE'].includes(action)) return bad(res, 'action must be CONFIRM or DISPUTE');
    if (action === 'DISPUTE' && note.length < 5) return bad(res, 'Say what is wrong (min 5 chars)');
    po.status = action === 'CONFIRM' ? 'CONFIRMED' : 'DISPUTED'; po.ackAt = nowIso(); po.ackNote = note.slice(0, 300) || undefined; b.updatedAt = nowIso(); db.save();
    alert(b.builderId, 'deals', action === 'CONFIRM' ? `Partner confirmed brokerage ✔ · ${b.projectName}` : `Partner disputes a payout · ${b.projectName}`, `${u.name}: ${inr(po.amount)} (${po.mode} ${po.ref}) for unit ${b.unitNo}${action === 'DISPUTE' ? ` — ${note.slice(0, 80)}` : ''}`, '/?tab=crm', { not: u.id, tag: `po-${b.id}`, hi: [action === 'CONFIRM' ? `पार्टनर ने ब्रोकरेज कन्फ़र्म की ✔ · ${b.projectName}` : `पार्टनर ने पेमेंट पर आपत्ति की · ${b.projectName}`, `${u.name}: यूनिट ${b.unitNo} के लिए ${inr(po.amount)} (${po.mode} ${po.ref})${action === 'DISPUTE' ? ` — ${note.slice(0, 80)}` : ''}`] });
    auditCrm(action === 'CONFIRM' ? 'CRM_PAYOUT_CONFIRMED' : 'CRM_PAYOUT_DISPUTED', b.id, `${u.name} ${action === 'CONFIRM' ? 'confirmed receiving' : 'disputes'} ₹${po.amount.toLocaleString('en-IN')} (${po.mode} ref ${po.ref}) on ${b.id}${note ? `: ${note}` : ''}`, 'COMMISSION');
    res.json({ success: true, booking: viewBooking(b) });
  });

  r.get('/bookings/:id/ledger', (req: Request, res: Response) => {
    const u = me(); const b = loadBooking(req, res); if (!b) return;
    const st = stateOf(); const assoc = db.byId('users', b.associateId); const proj = db.byId('builderProjects', b.projectId);
    const pays = b.payouts || []; const paidTotal = pays.reduce((a, p) => a + p.amount, 0);
    const tdsPct = effectiveTdsPct(proj?.tdsPct ?? b.tdsPct, !!assoc?.panNumber);
    const { collected, pct } = collectedPct(b);
    res.json({
      success: true, booking: viewBooking(b),
      milestones: b.paymentSchedule.map(m => ({ ...m, receivedAmount: paidOf(m), pending: m.amount - paidOf(m) })),
      payouts: pays,
      summary: {
        brokerageAmount: b.brokerageAmount, collected, collectedPct: Math.round(pct * 10) / 10, payable: payableBrokerage(b), paid: b.brokeragePaidAmount,
        confirmed: pays.filter(p => p.status === 'CONFIRMED').reduce((a, p) => a + p.amount, 0), unconfirmed: pays.filter(p => p.status === 'RECORDED').reduce((a, p) => a + p.amount, 0), disputed: pays.filter(p => p.status === 'DISPUTED').reduce((a, p) => a + p.amount, 0),
        tdsPct, noPan: !assoc?.panNumber,
      },
      invoice: { indicative: true, note: 'Indicative figures for the associate\'s brokerage invoice. GST applies only if the associate is GST-registered. Rates (GST, TDS) must be confirmed with your CA.', associateGstin: assoc?.gstin || null, ...brokerageBreakup(paidTotal, tdsPct, !!assoc?.gstin) },
      settlement: b.settlement || null, cancelRequest: b.cancelRequest || null, viewer: u.role,
    });
  });

  r.post('/bookings/:id/clawback/settle', needs('crm:booking_decide'), (req: Request, res: Response) => {
    const u = me(); const b = loadBooking(req, res); if (!b) return;
    if (!isBuilderOf(u, b)) return bad(res, 'Only the builder records the clawback', 403);
    if (b.settlement?.clawbackStatus !== 'DUE') return bad(res, 'No clawback is due on this booking', 409);
    b.settlement.clawbackStatus = 'RECOVERED'; b.settlement.note = `${b.settlement.note}${b.settlement.note ? ' · ' : ''}Recovered: ${String(req.body?.note || '').slice(0, 120)}`; b.updatedAt = nowIso(); db.save();
    auditCrm('CRM_CLAWBACK_RECOVERED', b.id, `${u.name} marked the ₹${b.settlement.clawbackAmount.toLocaleString('en-IN')} clawback on ${b.id} as recovered`, 'COMMISSION');
    res.json({ success: true, booking: viewBooking(b) });
  });

  // cancellation by request
  r.post('/bookings/:id/cancel-request', needs('crm:booking_request'), (req: Request, res: Response) => {
    const u = me(); const b = loadBooking(req, res); if (!b) return;
    if (!isAssociateOf(u, b)) return bad(res, 'Only the associate on this booking can request cancellation', 403);
    if (b.status !== 'APPROVED') return bad(res, 'Only approved bookings can be cancelled', 409);
    if (b.cancelRequest?.status === 'OPEN') return bad(res, 'A cancellation request is already open', 409);
    const reason = String(req.body?.reason || '').trim(); if (reason.length < 5) return bad(res, 'A reason (min 5 chars) is required');
    b.cancelRequest = { at: nowIso(), byId: u.id, byName: u.name, reason: reason.slice(0, 300), status: 'OPEN' }; b.updatedAt = nowIso(); db.save();
    auditCrm('CRM_CANCEL_REQUESTED', b.id, `${u.name} asked to cancel ${b.id} (${b.customerName}): ${reason}`, 'COMMISSION');
    res.json({ success: true, booking: viewBooking(b) });
  });
  r.post('/bookings/:id/cancel-request/decide', needs('crm:booking_decide'), (req: Request, res: Response) => {
    const u = me(); const b = loadBooking(req, res); if (!b) return;
    if (!isBuilderOf(u, b)) return bad(res, 'Only the builder decides', 403);
    if (b.cancelRequest?.status !== 'OPEN') return bad(res, 'No open cancellation request', 409);
    if (req.body?.approve === true) { const out = cancelBooking(u, b, `${b.cancelRequest.reason}${req.body?.note ? ` — ${String(req.body.note).slice(0, 100)}` : ''}`, req.body); return res.status(out.status).json(out.body); }
    const note = String(req.body?.note || '').trim(); if (note.length < 5) return bad(res, 'Give the associate a reason (min 5 chars)');
    b.cancelRequest.status = 'REJECTED'; b.cancelRequest.decisionNote = note.slice(0, 300); b.updatedAt = nowIso(); db.save();
    auditCrm('CRM_CANCEL_REJECTED', b.id, `${u.name} declined the cancellation request on ${b.id}: ${note}`, 'COMMISSION');
    res.json({ success: true, booking: viewBooking(b) });
  });

  r.put('/projects/:id/finance', needs('crm:payout'), (req: Request, res: Response) => {
    const u = me(); const p = stateOf().builderProjects.find(x => x.id === req.params.id);
    if (!p || !isBuilderOf(u, p)) return bad(res, 'Project not found', 404);
    const t = Number(req.body?.tdsPct); if (!Number.isFinite(t) || t < 0 || t > 30) return bad(res, 'TDS % must be between 0 and 30');
    const was = p.tdsPct; p.tdsPct = t; p.updatedAt = nowIso(); db.save();
    auditCrm('CRM_TDS_RATE_SET', p.id, `${u.name}: TDS on brokerage for ${p.projectName} ${was ?? 'default'} → ${t}% (applies to NEW payouts; confirm with your CA)`, 'COMMISSION');
    res.json({ success: true, tdsPct: t });
  });

  // super-admin can run the retention erase right now (it also runs hourly); audited by sweepCrm itself
  r.post('/retention/run', (_req: Request, res: Response) => {
    if (!isSuper(me() as any)) return bad(res, 'Only the super admin can run retention now', 403);
    res.json({ success: true, erased: sweepCrm(), lostAfterDays: LOST_RETENTION_DAYS, optedOutAfterDays: OPTOUT_RETENTION_DAYS });
  });

  // ═════════════════════════ reports ═════════════════════════
  const reached = (l: CrmLead): number => {
    let idx = CRM_STAGE_ORDER.indexOf(l.stage as CrmLeadStage); if (l.stage !== 'LOST') return idx;
    idx = 0;
    for (const a of l.activities) { const m = /→ (\w+)/.exec(a.note); const i = m ? CRM_STAGE_ORDER.indexOf(m[1] as CrmLeadStage) : -1; if (a.type === 'STAGE_CHANGE' && i >= 0 && i < 7 && i > idx) idx = i; }
    if (l.visitProof) idx = Math.max(idx, 3);
    return idx;
  };
  r.get('/reports', (req: Request, res: Response) => {
    const u = me(); const days = Math.min(365, Math.max(7, Number(req.query.days) || 90)); const since = Date.now() - days * DAY; const now = Date.now();
    const all = leadsForUser(u); const leads = all.filter(l => Date.parse(l.createdAt) >= since); const bks = bookingsForUser(u);
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
    const firstResp = (l: CrmLead) => { const a = [...l.activities].reverse().find(x => ['CALL', 'WHATSAPP', 'MEETING', 'SITE_VISIT'].includes(x.type)); return a ? (Date.parse(a.at) - Date.parse(l.createdAt)) / 3600_000 : null; };
    const steps: [string, string, (l: CrmLead) => boolean][] = [
      ['REGISTERED', 'Registered', () => true], ['CONTACTED', 'Contacted', l => reached(l) >= 1], ['SITE_VISITED', 'Visited', l => reached(l) >= 3], ['NEGOTIATION', 'Negotiating', l => reached(l) >= 4], ['BOOKING_REQUESTED', 'Booking asked', l => reached(l) >= 5], ['BOOKED', 'Booked', l => l.stage === 'BOOKED'],
    ];
    let prev = leads.length;
    const funnel = steps.map(([id, label, f]) => { const c = leads.filter(f).length; const row = { id, label, count: c, pctOfPrev: pct(c, prev) }; prev = c || prev; return row; });
    // v20: grouping copied the whole group for every lead (quadratic) and money() scanned every lead per booking
    const group = <K extends string>(key: (l: CrmLead) => K) => { const m = new Map<K, CrmLead[]>(); for (const l of leads) { const k = key(l); const g = m.get(k); if (g) g.push(l); else m.set(k, [l]); } return m; };
    const approvedByLead = new Map<string, number>();
    for (const b of bks) if (b.status === 'APPROVED') approvedByLead.set(b.leadId, (approvedByLead.get(b.leadId) || 0) + b.agreementValue);
    const money = (ls: CrmLead[]) => ls.reduce((a, l) => a + (approvedByLead.get(l.id) || 0), 0);
    const byProject = [...group(l => l.projectId).entries()].map(([id, ls]) => ({ id, name: ls[0].projectName, leads: ls.length, visited: ls.filter(l => reached(l) >= 3).length, booked: ls.filter(l => l.stage === 'BOOKED').length, lost: ls.filter(l => l.stage === 'LOST').length, convPct: pct(ls.filter(l => l.stage === 'BOOKED').length, ls.length), salesValue: money(ls) })).sort((a, b) => b.leads - a.leads);
    const showAssoc = u.role !== 'TEAM_MEMBER';
    const byAssociate = showAssoc ? [...group(l => l.associateId || '_desk').entries()].map(([id, ls]) => {
      const fr = ls.map(firstResp).filter((x): x is number => x !== null);
      return { id, name: ls[0].associateName || 'Builder desk', leads: ls.length, contacted: ls.filter(l => reached(l) >= 1).length, visited: ls.filter(l => reached(l) >= 3).length, booked: ls.filter(l => l.stage === 'BOOKED').length, convPct: pct(ls.filter(l => l.stage === 'BOOKED').length, ls.length), avgFirstResponseHrs: fr.length ? Math.round((fr.reduce((a, x) => a + x, 0) / fr.length) * 10) / 10 : null, overdue: ls.filter(l => isOpenStage(l.stage) && l.followUps.some(f => !f.done && Date.parse(f.dueAt) < now)).length, stale: ls.filter(l => isStale(l)).length, lost: ls.filter(l => l.stage === 'LOST').length };
    }).sort((a, b) => b.booked - a.booked || b.leads - a.leads) : [];
    const bySource = [...group(l => l.source).entries()].map(([id, ls]) => ({ id, leads: ls.length, booked: ls.filter(l => l.stage === 'BOOKED').length, convPct: pct(ls.filter(l => l.stage === 'BOOKED').length, ls.length) })).sort((a, b) => b.leads - a.leads);
    // v16.7 — team table: who called whom, how many connected, visits fixed, hand-offs; and how fast a fresh lead is first called
    const inWindow = (at: string) => Date.parse(at) >= since;
    const st = stateOf();
    const teamIds = u.role === 'TEAM_MEMBER' ? [u.id] : st.users.filter(x => x.role === 'TEAM_MEMBER' && (u.role === 'BROKER' || u.role === 'DEVELOPER_BUILDER' ? x.employerId === u.id : true)).map(x => x.id);
    // an employee's own numbers must not vanish when they forward a lead away, so count over everything their employer owns
    const pool = u.role === 'TEAM_MEMBER' ? st.crmLeads.filter(l => (l.associateId || l.builderId) === db.byId('users', u.id)?.employerId) : all;
    // v20: one pass over the leads for all members (it was one full pass PER member — an admin has hundreds)
    const agg = new Map<string, { calls: number; connected: number; visitsFixed: number; fwdOut: number; fwdIn: number; open: number; booked: number }>();
    const A = (id: string) => { let x = agg.get(id); if (!x) { x = { calls: 0, connected: 0, visitsFixed: 0, fwdOut: 0, fwdIn: 0, open: 0, booked: 0 }; agg.set(id, x); } return x; };
    const wanted = new Set(teamIds);
    for (const l of pool) {
      for (const a of l.activities) if (a.type === 'CALL' && a.call && a.byUserId && wanted.has(a.byUserId) && inWindow(a.at)) {
        const x = A(a.byUserId); x.calls++; if (callOutcome(a.call.outcome)?.connected) x.connected++; if (a.call.outcome === 'VISIT_FIXED') x.visitsFixed++;
      }
      for (const h of l.handoffs || []) if (inWindow(h.at)) { if (wanted.has(h.fromId)) A(h.fromId).fwdOut++; if (wanted.has(h.toId)) A(h.toId).fwdIn++; }
    }
    for (const l of all) if (l.assignedMemberId && wanted.has(l.assignedMemberId)) { const x = A(l.assignedMemberId); if (isOpenStage(l.stage)) x.open++; if (l.stage === 'BOOKED') x.booked++; }
    const byMember = teamIds.map(id => {
      const mu = db.byId('users', id)!;
      const x = agg.get(id) || { calls: 0, connected: 0, visitsFixed: 0, fwdOut: 0, fwdIn: 0, open: 0, booked: 0 };
      return {
        id, name: mu.name, role: inferTeamRole(mu.teamTitle, mu.teamRole), title: mu.teamTitle || '',
        calls: x.calls, connected: x.connected, connectPct: pct(x.connected, x.calls), visitsFixed: x.visitsFixed,
        forwardedOut: x.fwdOut, forwardedIn: x.fwdIn, open: x.open, booked: x.booked,
      };
    }).sort((a, b) => b.calls - a.calls);
    const firstCalls = leads.map(l => { const c = [...l.activities].reverse().find(x => x.type === 'CALL'); return c ? (Date.parse(c.at) - Date.parse(l.createdAt)) / 3600_000 : null; }).filter((x): x is number => x !== null && x >= 0).sort((a, b) => a - b);
    const speedToLeadHours = firstCalls.length ? Math.round(firstCalls[Math.floor(firstCalls.length / 2)] * 10) / 10 : null;
    const lostBy = new Map<string, number>(); for (const l of leads) if (l.stage === 'LOST') lostBy.set(l.lostCode || 'OTHER', (lostBy.get(l.lostCode || 'OTHER') || 0) + 1);
    const lostReasons = [...lostBy.entries()].map(([code, count]) => ({ code, label: LOST_CODES.find(c => c.id === code)?.en || code, count })).sort((a, b) => b.count - a.count);
    const activeAll = all.filter(l => isOpenStage(l.stage));
    const bucket = (lo: number, hi: number) => activeAll.filter(l => { const d = (now - Date.parse(l.createdAt)) / DAY; return d >= lo && d < hi; }).length;
    const aging = [{ label: '0–7 days', count: bucket(0, 8) }, { label: '8–30 days', count: bucket(8, 31) }, { label: '31–60 days', count: bucket(31, 61) }, { label: '60+ days', count: bucket(61, 1e9) }];
    const od = overdueMilestones(bks);
    const approved = bks.filter(b => b.status === 'APPROVED');
    const payouts = approved.flatMap(b => b.payouts || []);
    res.json({
      success: true, days, role: u.role, totals: { leads: leads.length, active: leads.filter(l => isOpenStage(l.stage)).length, booked: leads.filter(l => l.stage === 'BOOKED').length, lost: leads.filter(l => l.stage === 'LOST').length },
      funnel, byProject, byAssociate, bySource, byMember, speedToLeadHours, lostReasons, aging,
      money: u.role === 'TEAM_MEMBER' ? null : {
        overdueCollections: od.slice(0, 20), overdueTotal: od.reduce((a, o) => a + o.pending, 0),
        payable: approved.reduce((a, b) => a + payableBrokerage(b), 0), paid: approved.reduce((a, b) => a + b.brokeragePaidAmount, 0),
        unconfirmedPayouts: payouts.filter(p => p.status === 'RECORDED').length, disputedPayouts: payouts.filter(p => p.status === 'DISPUTED').length,
        openClaims: approved.reduce((a, b) => a + b.paymentSchedule.filter(m => m.claim?.status === 'OPEN').length, 0),
        clawbackDue: bks.filter(b => b.settlement?.clawbackStatus === 'DUE').reduce((a, b) => a + (b.settlement?.clawbackAmount || 0), 0),
      },
    });
  });

  return r;
}

/** Hourly: erase personal data of lost leads after the retention period, and of opted-out customers soon after. Bookings keep their financial records. */
export function sweepCrm() {
  const st = db.getState(); const now = Date.now(); let n = 0;
  for (const l of st.crmLeads) {
    if (l.erasedAt || l.stage !== 'LOST' || l.bookingId) continue;
    const age = (now - Date.parse(l.updatedAt)) / DAY;
    if (!((l.optedOutAt && age >= OPTOUT_RETENTION_DAYS) || age >= LOST_RETENTION_DAYS)) continue;
    l.name = `${(l.name.split(' ')[0] || 'Customer').slice(0, 20)} (erased)`; l.phone = ''; l.phoneKey = `erased-${l.id}`; l.email = undefined; l.budgetMin = undefined; l.budgetMax = undefined;
    l.followUps = []; l.nextFollowUpAt = undefined; l.visitFeedback = undefined; l.tags = undefined; l.profile = undefined; l.sourceDetail = undefined;
    l.handoffs = (l.handoffs || []).map(h => ({ ...h, note: '' }));
    l.activities = l.activities.map(a => (a.type === 'STAGE_CHANGE' ? { ...a, note: a.note.replace(/:.*$/, '') } : { ...a, note: 'Entry removed (data retention)' }));
    l.erasedAt = nowIso(); n++;
  }
  if (n) { db.save(); db.appendAuditEvent('system', 'SUPERADMIN', 'LEAD', 'RETENTION', 'CRM_LEADS_ERASED', `${n} lost / opted-out leads had their personal data erased (retention: lost ${LOST_RETENTION_DAYS} days, opted-out ${OPTOUT_RETENTION_DAYS} days)`); }
  return n;
}
