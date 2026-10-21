/**
 * v23 — Plans & Fees (GENZ admins and the superadmin decide; payers see exactly what applies to them).
 *
 *  Fee rules   per event (legal case accepted, booking through a network broker, broker-to-broker commission received),
 *              per group (builder, big RERA firm, independent RERA broker, local associate, counsellor), flat ₹ or %
 *              (with min / max), optionally only some states or some people, never some people, from a start date.
 *  Plans       memberships per group with a monthly / yearly price, member fees per event and member-only features.
 *  Gates       features an admin reserves for members (off by default — nothing changes until an admin turns one on).
 *  Ledger      every charge and membership payment. The payer pays outside the app and writes the UTR; a GENZ admin
 *              confirms. These are GENZ's own fees; GENZ does not hold the parties' deal money.
 *
 *  A charge is worked out once, when the event happens, and keeps that calculation (rule changes are never retroactive).
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db, type DatabaseState, type UserProfile, type BillingEntry } from './db.js';
import { ctx, needs } from './auth.js';
import { findState } from '../src/shared/india.js';
import {
  payerSegmentOf, homeStateOf, computeFee, pickRule, describeRule, describeBenefit, ruleWarnings, planWarnings, targets, addMonths, segmentInfo, eventInfo,
  SEGMENT_IDS, EVENT_IDS, GATE_IDS, GATES, FEE_EVENTS, GRACE_DAYS,
  type PayerSegment, type FeeEvent, type GateKey, type FeeRule, type Plan, type PayerCtx, type GateSetting, type BillingWarning,
} from '../src/shared/billingRules.js';
import { DEFAULT_LEGAL_SETTINGS } from '../src/shared/legalRules.js';

const st = (): DatabaseState => db.getState();
const nowIso = () => new Date().toISOString();
const me = () => ctx().user as UserProfile;
const bad = (res: Response, msg: string, code = 400, extra: object = {}) => res.status(code).json({ error: msg, ...extra });
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const DAY = 86_400_000;
const nextId = (prefix: string, ids: string[], pad: number) => `${prefix}${String(ids.reduce((m, id) => Math.max(m, Number(id.slice(prefix.length)) || 0), 0) + 1).padStart(pad, '0')}`;
const isStaff = (u: UserProfile) => u.role === 'ADMIN' || u.role === 'SUPERADMIN';
const audit = (id: string, action: string, details: string) => { const u = ctx().user as UserProfile | null; db.appendAuditEvent(u?.id || 'SYSTEM', (u?.role || 'SUPERADMIN') as any, 'SYSTEM', id, action, details); };
const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

// ───────────────────────────── who is paying ─────────────────────────────
const activeStaff = (employerId: string) => st().users.filter(x => x.role === 'TEAM_MEMBER' && x.employerId === employerId && x.verificationStatus === 'VERIFIED').length;
export const segmentOfUser = (u: UserProfile): PayerSegment | null => payerSegmentOf(u, u.role === 'BROKER' ? activeStaff(u.id) : 0);
export function payerOf(u: UserProfile, state?: string): PayerCtx | null {
  const segment = segmentOfUser(u); if (!segment) return null;
  return { userId: u.id, segment, state: findState(state)?.name || homeStateOf(u) };
}

// ───────────────────────────── one-time setup: v22 legal fees become ordinary rules / a plan ─────────────────────────────
export function ensureBilling() {
  const s = st();
  // every stored record carries an id (the PostgreSQL store keys rows by it)
  for (const g of GATES) if (!s.billingGates.some(x => x.key === g.id)) s.billingGates.push({ id: g.id, key: g.id, membersOnly: false, segments: [...g.segments] });
  for (const g of s.billingGates) if (!g.id) g.id = g.key;
  for (const p of s.legalProfiles) if (!(p as any).id) (p as any).id = p.userId;
  if (s.billingMigrated) return;
  const t = nowIso(); const legacy: any = { ...DEFAULT_LEGAL_SETTINGS, ...(s.legalSettings || {}) };
  const by = 'SYSTEM';
  // the v22 per-case fee and member fee carry over as a rule and a plan (labelled as starting figures until an admin edits them)
  if (!s.billingRules.some(r => r.event === 'LEGAL_CASE')) {
    s.billingRules.push({
      id: nextId('FR-', s.billingRules.map(r => r.id), 4), event: 'LEGAL_CASE', segments: ['LEGAL_COUNSEL'], states: [], includeUserIds: [], excludeUserIds: [],
      mode: 'FLAT', value: Number(legacy.platformFee ?? 500), active: true, effectiveFrom: '2026-01-01T00:00:00.000Z', note: 'Starting figure carried over from v22 — edit it',
      createdAt: t, createdBy: by, updatedAt: t, updatedBy: by, history: [{ at: t, by, what: 'Created from the v22 legal-help fee' }],
    });
  }
  if (!s.billingPlans.some(p => p.id === 'PLAN-LEGAL')) {
    s.billingPlans.push({
      id: 'PLAN-LEGAL', name: 'Legal Panel Membership', nameHi: 'लीगल पैनल मेंबरशिप', description: 'Lower GENZ fee on every accepted legal case.',
      segments: ['LEGAL_COUNSEL'], states: [], includeUserIds: [], excludeUserIds: [],
      monthly: Number(legacy.membershipMonthly ?? 1999), yearly: Number(legacy.membershipYearly ?? 19999),
      fees: { LEGAL_CASE: { type: 'FLAT', value: Number(legacy.memberPlatformFee ?? 250) } }, features: ['LEGAL_CLAIM'], active: true,
      createdAt: t, createdBy: by, updatedAt: t, updatedBy: by, history: [{ at: t, by, what: 'Created from the v22 legal membership' }],
    });
  }
  // v22 ledger lines move over unchanged
  for (const e of (s.legalLedger || []) as any[]) {
    if (s.billingLedger.some(x => x.id === e.id)) continue;
    const u = db.byId('users', e.counsellorId);
    s.billingLedger.push({
      id: e.id, kind: e.kind === 'MEMBERSHIP' ? 'MEMBERSHIP' : 'CHARGE', payerId: e.counsellorId, payerName: e.counsellorName || u?.name || 'Counsellor', payerSegment: 'LEGAL_COUNSEL',
      amount: e.amount, event: e.kind === 'MEMBERSHIP' ? undefined : 'LEGAL_CASE', refId: e.caseId, refLabel: e.caseId,
      planId: e.kind === 'MEMBERSHIP' ? 'PLAN-LEGAL' : undefined, planName: e.kind === 'MEMBERSHIP' ? 'Legal Panel Membership' : undefined, period: e.plan, months: e.plan === 'YEARLY' ? 12 : e.plan === 'MONTHLY' ? 1 : undefined,
      validFrom: e.validFrom, validTo: e.validTo, status: e.status, ref: e.ref, paidOn: e.paidOn, note: e.note, rejectNote: e.rejectNote,
      createdAt: e.createdAt, updatedAt: e.updatedAt, history: [...(e.history || []), { at: t, by, what: 'Moved from the v22 legal ledger' }],
    });
  }
  s.billingMigrated = true;
  db.save();
}

// ───────────────────────────── membership ─────────────────────────────
export function activeMembership(userId: string, now = Date.now()): BillingEntry | null {
  const iso = new Date(now).toISOString(); let best: BillingEntry | null = null;
  for (const e of st().billingLedger) {
    if (e.kind !== 'MEMBERSHIP' || e.payerId !== userId || !(e.status === 'CONFIRMED' || e.status === 'WAIVED') || !e.validFrom || !e.validTo) continue;
    if (e.validFrom <= iso && e.validTo > iso && (!best || e.validTo > best.validTo!)) best = e;
  }
  return best;
}
/** The end of the person's last paid-for period (to queue a renewal after it). */
const lastValidTo = (userId: string): string | null => {
  let best = '';
  for (const e of st().billingLedger) if (e.kind === 'MEMBERSHIP' && e.payerId === userId && (e.status === 'CONFIRMED' || e.status === 'WAIVED') && e.validTo && e.validTo > best) best = e.validTo;
  return best || null;
};
export const planById = (id?: string) => (id ? st().billingPlans.find(p => p.id === id) : undefined) || null;
export function memberPlanOf(userId: string, now = Date.now()): Plan | null { const m = activeMembership(userId, now); return m ? planById(m.planId) : null; }
export function hasFeature(u: UserProfile, key: GateKey): boolean { return !!memberPlanOf(u.id)?.features.includes(key); }
/** null = allowed; otherwise the reason (the feature is reserved for members and this person is not one). */
export function gateBlock(u: UserProfile, key: GateKey): string | null {
  const g = st().billingGates.find(x => x.key === key); if (!g || !g.membersOnly) return null;
  const seg = segmentOfUser(u); if (!seg || !g.segments.includes(seg)) return null;
  if (hasFeature(u, key)) return null;
  const names = st().billingPlans.filter(p => p.active && p.features.includes(key) && p.segments.includes(seg)).map(p => p.name);
  return `This is for GENZ members only${names.length ? ` (${names.join(' / ')})` : ''}. See Plans & Fees.`;
}
export function overdue(userId: string, event?: FeeEvent, now = Date.now()) {
  return st().billingLedger.some(e => e.payerId === userId && e.kind === 'CHARGE' && (!event || e.event === event) && (e.status === 'DUE' || e.status === 'REJECTED') && now - new Date(e.createdAt).getTime() > GRACE_DAYS * DAY);
}

// ───────────────────────────── charging ─────────────────────────────
export interface ChargeInput { event: FeeEvent; payerId: string; base: number; refId: string; refLabel?: string; dealId?: string; state?: string }
/** Called by the legal, CRM and deal-room code when the event happens. Returns the fee (0 = no rule / free) and the line, if any. */
export function chargeEvent(i: ChargeInput): { fee: number; normalFee: number; entry: BillingEntry | null; planId?: string } {
  ensureBilling();
  const s = st(); const u = db.byId('users', i.payerId); if (!u) return { fee: 0, normalFee: 0, entry: null };
  const payer = payerOf(u, i.state); if (!payer || !eventInfo(i.event)?.payers.includes(payer.segment)) return { fee: 0, normalFee: 0, entry: null };
  const dup = s.billingLedger.find(e => e.kind === 'CHARGE' && e.event === i.event && e.refId === i.refId && e.payerId === i.payerId && e.status !== 'CANCELLED');
  if (dup) return { fee: dup.amount, normalFee: dup.calc?.normalFee ?? dup.amount, entry: dup, planId: dup.calc?.planId };
  const t = nowIso(); const plan = memberPlanOf(u.id);
  const r = computeFee(s.billingRules, plan, i.event, payer, Math.max(0, i.base || 0), t);
  if (!r.rule || r.fee <= 0) return { fee: 0, normalFee: r.normalFee, entry: null, planId: r.plan?.id };
  const e: BillingEntry = {
    id: nextId('GZF-', s.billingLedger.map(x => x.id), 6), kind: 'CHARGE', payerId: u.id, payerName: u.companyName ? `${u.name} — ${u.companyName}` : u.name, payerSegment: payer.segment,
    amount: r.fee, event: i.event, refId: i.refId, refLabel: i.refLabel || i.refId, dealId: i.dealId, state: payer.state, base: Math.round(i.base),
    calc: { ruleId: r.rule.id, mode: r.rule.mode, value: r.rule.value, minFee: r.rule.minFee, maxFee: r.rule.maxFee, normalFee: r.normalFee, planId: r.plan?.id, benefit: r.benefit },
    status: 'DUE', createdAt: t, updatedAt: t,
    history: [{ at: t, by: 'SYSTEM', what: `${eventInfo(i.event)?.en}: ${describeRule(r.rule)} = ${inr(r.normalFee)}${r.plan ? ` → member (${r.plan.name}) ${inr(r.fee)}` : ''}` }],
  };
  s.billingLedger.push(e);
  db.appendAuditEvent('SYSTEM', 'SUPERADMIN', 'SYSTEM', e.id, 'GENZ_FEE_CHARGED', `${eventInfo(i.event)?.en} · ${e.payerName} · ${inr(e.amount)}`);
  return { fee: r.fee, normalFee: r.normalFee, entry: e, planId: r.plan?.id };
}
/** The event was undone (booking cancelled …): unpaid charges are cancelled; paid ones are flagged for a refund outside the app. */
export function cancelCharges(event: FeeEvent, refId: string, reason: string) {
  const t = nowIso(); let n = 0;
  for (const e of st().billingLedger) {
    if (e.kind !== 'CHARGE' || e.event !== event || e.refId !== refId) continue;
    if (e.status === 'DUE' || e.status === 'REJECTED' || e.status === 'MARKED_PAID') {
      const marked = e.status === 'MARKED_PAID';
      e.status = 'CANCELLED'; e.cancelNote = reason; e.needsRefund = marked; e.updatedAt = t;
      e.history.push({ at: t, by: 'SYSTEM', what: `Cancelled: ${reason}${marked ? ' — the payer had marked it paid; settle any refund outside the app' : ''}` }); n++;
    } else if (e.status === 'CONFIRMED') {
      e.needsRefund = true; e.updatedAt = t; e.history.push({ at: t, by: 'SYSTEM', what: `${reason} after GENZ received this fee — settle a refund outside the app` }); n++;
    }
  }
  if (n) db.save();
  return n;
}

// ───────────────────────────── shaping ─────────────────────────────
/** GENZ staff never see which deal, or the commission amount, behind a broker-deal fee (v21: GENZ sees only totals). */
function shapeEntry(e: BillingEntry, forStaff: boolean) {
  if (forStaff && e.event === 'BROKER_DEAL') { const { base, dealId, refId, refLabel, history, ...rest } = e; return { ...rest, refLabel: 'Broker-to-broker deal', history: history.map(h => ({ ...h, what: h.what.replace(/₹[\d,]+(\.\d+)?/g, '₹•••') })), calc: e.calc ? { ...e.calc, normalFee: undefined } : undefined, hidden: true }; }
  return e;
}
const describePlanFor = (p: Plan) => ({
  ...p, feesText: Object.entries(p.fees).map(([ev, b]) => ({ event: ev, en: describeBenefit(ev as FeeEvent, b!, 'en'), hi: describeBenefit(ev as FeeEvent, b!, 'hi') })),
});

// ───────────────────────────── bodies ─────────────────────────────
const stateField = z.string().trim().refine(v => !!findState(v), { message: 'Select a valid Indian state or union territory' });
const idList = z.array(z.string().min(2).max(60)).max(200).default([]);
const targeting = {
  segments: z.array(z.enum(SEGMENT_IDS)).min(1, 'Choose at least one group'),
  states: z.array(stateField).max(36).default([]),
  includeUserIds: idList, excludeUserIds: idList,
};
const money = (max: number) => z.coerce.number().min(0).max(max);
const ruleBody = z.object({
  event: z.enum(EVENT_IDS), mode: z.enum(['FLAT', 'PERCENT']), value: z.coerce.number().min(0).max(10_000_000),
  minFee: money(10_000_000).optional(), maxFee: money(10_000_000).optional(),
  active: z.boolean().default(true), effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date as YYYY-MM-DD').optional(),
  note: z.string().trim().max(300).optional(), acknowledge: z.array(z.string()).default([]),
  ...targeting,
});
const benefit = z.object({ type: z.enum(['FREE', 'FLAT', 'PERCENT', 'DISCOUNT_PCT']), value: z.coerce.number().min(0).max(10_000_000).default(0) });
const planBody = z.object({
  name: z.string().trim().min(3, 'Give the plan a name (3+ letters)').max(60), nameHi: z.string().trim().max(60).optional(), description: z.string().trim().max(300).optional(),
  monthly: money(10_000_000).optional(), yearly: money(100_000_000).optional(),
  fees: z.object({ LEGAL_CASE: benefit.optional(), BUILDER_BOOKING: benefit.optional(), BROKER_DEAL: benefit.optional() }).default({}),
  features: z.array(z.enum(GATE_IDS)).default([]), active: z.boolean().default(true), acknowledge: z.array(z.string()).default([]),
  ...targeting,
});
const payBody = z.object({
  ref: z.string().trim().min(6, 'Enter the UTR / transaction reference (at least 6 characters).').max(60),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date as YYYY-MM-DD').optional(), note: z.string().trim().max(300).optional(),
});

function checkTargets(d: { segments: PayerSegment[]; includeUserIds: string[]; excludeUserIds: string[] }): string | null {
  for (const id of [...d.includeUserIds, ...d.excludeUserIds]) { const u = db.byId('users', id); if (!u) return `Unknown person ${id}`; }
  if (d.includeUserIds.some(id => d.excludeUserIds.includes(id))) return 'The same person cannot be both included and excluded.';
  return null;
}
function needAck(res: Response, warnings: BillingWarning[], ack: string[]): boolean {
  const missing = warnings.filter(w => !ack.includes(w));
  if (missing.length) { bad(res, 'Please read and accept the warning(s) before saving.', 409, { code: 'ACK_REQUIRED', warnings: missing }); return true; }
  return false;
}

export function createBillingRouter() {
  const r = Router();
  const manage = needs('billing:manage'); const self = needs('billing:self');
  ensureBilling();

  // ═════════════ GENZ admins and superadmin ═════════════
  r.get('/catalog', manage, (_req, res) => {
    ensureBilling(); const s = st(); const now = Date.now();
    const live = s.billingLedger.filter(e => e.kind === 'MEMBERSHIP' && (e.status === 'CONFIRMED' || e.status === 'WAIVED') && e.validTo && new Date(e.validTo).getTime() > now && new Date(e.validFrom!).getTime() <= now);
    const sum = (f: (e: BillingEntry) => boolean) => s.billingLedger.filter(f).reduce((a, e) => a + e.amount, 0);
    const ids = new Set<string>(); for (const x of [...s.billingRules, ...s.billingPlans]) for (const id of [...x.includeUserIds, ...x.excludeUserIds]) ids.add(id);
    const people: Record<string, string> = {}; for (const id of ids) { const u = db.byId('users', id); if (u) people[id] = u.companyName ? `${u.name} — ${u.companyName}` : u.name; }
    res.json({
      success: true, people,
      rules: s.billingRules.slice().sort((a, b) => a.event.localeCompare(b.event) || b.updatedAt.localeCompare(a.updatedAt)).map(x => ({ ...x, text: { en: describeRule(x, 'en'), hi: describeRule(x, 'hi') }, warnings: ruleWarnings(x) })),
      plans: s.billingPlans.map(p => ({ ...describePlanFor(p), members: live.filter(e => e.planId === p.id).length, warnings: planWarnings(p) })),
      gates: s.billingGates,
      members: live.map(e => ({ entryId: e.id, userId: e.payerId, name: e.payerName, segment: e.payerSegment, planId: e.planId, planName: e.planName, validFrom: e.validFrom, validTo: e.validTo, comp: !!e.comp })),
      totals: {
        toConfirm: s.billingLedger.filter(e => e.status === 'MARKED_PAID').length,
        due: sum(e => e.status === 'DUE' || e.status === 'REJECTED'), received: sum(e => e.status === 'CONFIRMED'),
        receivedFees: sum(e => e.status === 'CONFIRMED' && e.kind === 'CHARGE'), receivedMemberships: sum(e => e.status === 'CONFIRMED' && e.kind === 'MEMBERSHIP'),
        refunds: s.billingLedger.filter(e => e.needsRefund).length, activeMembers: live.length,
      },
    });
  });

  r.get('/people', manage, (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim().toLowerCase(); if (q.length < 2) return res.json({ success: true, people: [] });
    const out = st().users.filter(u => !!segmentOfUser(u) && (u.name.toLowerCase().includes(q) || (u.companyName || '').toLowerCase().includes(q) || u.id.toLowerCase().includes(q))).slice(0, 20)
      .map(u => ({ id: u.id, name: u.name, company: u.companyName, city: u.city, segment: segmentOfUser(u) }));
    res.json({ success: true, people: out });
  });

  const saveRule = (existing: FeeRule | null) => (req: Request, res: Response) => {
    const p = ruleBody.safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid rule');
    const d = p.data; const u = me(); const s = st(); const t = nowIso();
    const ev = eventInfo(d.event)!;
    const wrong = d.segments.filter(x => !ev.payers.includes(x)); if (wrong.length) return bad(res, `${ev.en} is paid only by: ${ev.payers.map(x => segmentInfo(x)?.en).join(', ')}.`);
    if (d.mode === 'PERCENT' && d.value > 100) return bad(res, 'A percentage cannot be above 100.');
    if (d.mode === 'FLAT' && (d.minFee !== undefined || d.maxFee !== undefined)) return bad(res, 'Min / max apply only to a percentage fee.');
    if (d.minFee !== undefined && d.maxFee !== undefined && d.minFee > d.maxFee) return bad(res, 'The minimum cannot be above the maximum.');
    const tErr = checkTargets(d); if (tErr) return bad(res, tErr);
    const today = todayIst();
    let from = d.effectiveFrom || (existing ? existing.effectiveFrom.slice(0, 10) : today);
    if (!existing || from !== existing.effectiveFrom.slice(0, 10)) { if (from < today) return bad(res, 'A fee cannot start in the past — charges are never retroactive.'); }
    const effectiveFrom = from === today && !existing ? t : new Date(`${from}T00:00:00+05:30`).toISOString();
    if (needAck(res, ruleWarnings({ event: d.event, mode: d.mode, active: d.active }), d.acknowledge)) return;
    const body = { event: d.event, mode: d.mode, value: d.value, minFee: d.mode === 'PERCENT' ? d.minFee : undefined, maxFee: d.mode === 'PERCENT' ? d.maxFee : undefined, active: d.active, note: d.note, segments: d.segments, states: [...new Set(d.states.map(x => findState(x)!.name))], includeUserIds: d.includeUserIds, excludeUserIds: d.excludeUserIds };
    let rule: FeeRule;
    if (existing) {
      const before = describeRule(existing);
      Object.assign(existing, body, { effectiveFrom: from === existing.effectiveFrom.slice(0, 10) ? existing.effectiveFrom : effectiveFrom, updatedAt: t, updatedBy: u.id });
      existing.history.push({ at: t, by: u.id, what: `Changed: ${before} → ${describeRule(existing)}${existing.active ? '' : ' (off)'} · earlier charges keep their old calculation` });
      rule = existing;
    } else {
      rule = { id: nextId('FR-', s.billingRules.map(x => x.id), 4), ...body, effectiveFrom, createdAt: t, createdBy: u.id, updatedAt: t, updatedBy: u.id, history: [{ at: t, by: u.id, what: `Created: ${describeRule(body)}` }] };
      s.billingRules.push(rule);
    }
    audit(rule.id, existing ? 'GENZ_FEE_RULE_CHANGED' : 'GENZ_FEE_RULE_CREATED', `${ev.en} · ${rule.segments.join(', ')} · ${describeRule(rule)}${rule.states.length ? ` · ${rule.states.join(', ')}` : ''}${rule.active ? '' : ' · OFF'}`);
    db.save();
    res.json({ success: true, rule });
  };
  r.post('/rules', manage, saveRule(null));
  r.put('/rules/:id', manage, (req, res) => { const x = st().billingRules.find(r => r.id === req.params.id); if (!x) return bad(res, 'Rule not found', 404); return saveRule(x)(req, res); });

  const savePlan = (existing: Plan | null) => (req: Request, res: Response) => {
    const p = planBody.safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid plan');
    const d = p.data; const u = me(); const s = st(); const t = nowIso();
    if (!(d.monthly && d.monthly > 0) && !(d.yearly && d.yearly > 0) && d.monthly === undefined && d.yearly === undefined) return bad(res, 'Give a monthly or a yearly price (0 is allowed for a free plan).');
    for (const [ev, b] of Object.entries(d.fees)) {
      if (!b) continue;
      const info = eventInfo(ev)!;
      if (!info.payers.some(x => d.segments.includes(x))) return bad(res, `${info.en} does not apply to the groups of this plan.`);
      if ((b.type === 'PERCENT' || b.type === 'DISCOUNT_PCT') && b.value > 100) return bad(res, 'A percentage cannot be above 100.');
    }
    for (const f of d.features) { const g = GATES.find(x => x.id === f)!; if (!g.segments.some(x => d.segments.includes(x))) return bad(res, `“${g.en}” does not apply to the groups of this plan.`); }
    const tErr = checkTargets(d); if (tErr) return bad(res, tErr);
    if (needAck(res, planWarnings({ segments: d.segments, fees: d.fees as any, active: d.active, monthly: d.monthly, yearly: d.yearly }), d.acknowledge)) return;
    const body = { name: d.name, nameHi: d.nameHi, description: d.description, monthly: d.monthly, yearly: d.yearly, fees: d.fees as Plan['fees'], features: d.features, active: d.active, segments: d.segments, states: [...new Set(d.states.map(x => findState(x)!.name))], includeUserIds: d.includeUserIds, excludeUserIds: d.excludeUserIds };
    let plan: Plan;
    if (existing) { Object.assign(existing, body, { updatedAt: t, updatedBy: u.id }); existing.history.push({ at: t, by: u.id, what: `Changed${existing.active ? '' : ' (closed to new members)'}` }); plan = existing; }
    else { plan = { id: nextId('PLAN-', s.billingPlans.filter(x => /^PLAN-\d+$/.test(x.id)).map(x => x.id), 3), ...body, createdAt: t, createdBy: u.id, updatedAt: t, updatedBy: u.id, history: [{ at: t, by: u.id, what: 'Created' }] }; s.billingPlans.push(plan); }
    audit(plan.id, existing ? 'GENZ_PLAN_CHANGED' : 'GENZ_PLAN_CREATED', `${plan.name} · ${plan.segments.join(', ')} · ${plan.monthly !== undefined ? `${inr(plan.monthly)}/mo ` : ''}${plan.yearly !== undefined ? `${inr(plan.yearly)}/yr` : ''}${plan.active ? '' : ' · closed'}`);
    db.save();
    res.json({ success: true, plan });
  };
  r.post('/plans', manage, savePlan(null));
  r.put('/plans/:id', manage, (req, res) => { const x = st().billingPlans.find(p => p.id === req.params.id); if (!x) return bad(res, 'Plan not found', 404); return savePlan(x)(req, res); });

  r.put('/gates', manage, (req: Request, res: Response) => {
    const p = z.object({ gates: z.array(z.object({ key: z.enum(GATE_IDS), membersOnly: z.boolean(), segments: z.array(z.enum(SEGMENT_IDS)) })).min(1) }).safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid');
    const s = st(); const u = me(); const t = nowIso();
    for (const g of p.data.gates) {
      const info = GATES.find(x => x.id === g.key)!;
      const segs = g.segments.filter(x => info.segments.includes(x));
      if (g.membersOnly && info.kind === 'GATE' && !segs.length) return bad(res, `Choose who “${info.en}” is reserved for.`);
      if (g.membersOnly && info.kind === 'GATE' && !s.billingPlans.some(pl => pl.active && pl.features.includes(g.key))) return bad(res, `Add “${info.en}” to an open plan first — otherwise nobody could use it.`);
      const cur = s.billingGates.find(x => x.key === g.key)!;
      if (cur.membersOnly !== g.membersOnly || cur.segments.join() !== segs.join()) audit(g.key, 'GENZ_GATE_CHANGED', `${info.en}: ${g.membersOnly ? `members only (${segs.join(', ')})` : 'open to all'}`);
      Object.assign(cur, { membersOnly: g.membersOnly, segments: segs, updatedAt: t, updatedBy: u.id });
    }
    db.save(); res.json({ success: true, gates: s.billingGates });
  });

  /** "What would this person / group pay?" — so an admin can check a rule before people meet it. */
  r.post('/preview', manage, (req: Request, res: Response) => {
    const p = z.object({ event: z.enum(EVENT_IDS), base: z.coerce.number().min(0).max(10_000_000_000), userId: z.string().optional(), segment: z.enum(SEGMENT_IDS).optional(), state: z.string().optional() }).safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid');
    const s = st(); let payer: PayerCtx | null = null; let plan: Plan | null = null; let who = '';
    if (p.data.userId) { const u = db.byId('users', p.data.userId); if (!u) return bad(res, 'Person not found', 404); payer = payerOf(u, p.data.state); plan = memberPlanOf(u.id); who = u.name; }
    else if (p.data.segment) payer = { userId: '-', segment: p.data.segment, state: findState(p.data.state)?.name || '' };
    if (!payer) return bad(res, 'GENZ charges this person nothing (no billing group).');
    if (!eventInfo(p.data.event)!.payers.includes(payer.segment)) return res.json({ success: true, fee: 0, why: `${segmentInfo(payer.segment)?.en} do not pay for ${eventInfo(p.data.event)?.en}.` });
    const r = computeFee(s.billingRules, plan, p.data.event, payer, p.data.base, nowIso());
    res.json({ success: true, fee: r.fee, normalFee: r.normalFee, rule: r.rule ? { id: r.rule.id, text: describeRule(r.rule) } : null, plan: r.plan ? { id: r.plan.id, name: r.plan.name } : null, who, segment: payer.segment, state: payer.state,
      why: !r.rule ? 'No fee rule applies — nothing is charged.' : r.plan ? `Normal fee ${inr(r.normalFee)}; as a member of ${r.plan.name}: ${inr(r.fee)}` : `${describeRule(r.rule)} = ${inr(r.fee)}` });
  });

  r.get('/ledger', manage, (req: Request, res: Response) => {
    const status = String(req.query.status || ''); const kind = String(req.query.kind || '');
    let rows = st().billingLedger.slice().reverse();
    if (status === 'REFUND') rows = rows.filter(e => e.needsRefund); else if (status) rows = rows.filter(e => e.status === status);
    if (kind) rows = rows.filter(e => e.kind === kind || e.event === kind);
    res.json({ success: true, entries: rows.slice(0, 500).map(e => shapeEntry(e, true)) });
  });

  const act = (name: 'confirm' | 'reject' | 'waive') => r.post(`/ledger/:id/${name}`, manage, (req: Request, res: Response) => {
    const u = me(); const e = st().billingLedger.find(x => x.id === req.params.id); if (!e) return bad(res, 'Entry not found', 404);
    const t = nowIso();
    if (name === 'waive') {
      if (!['DUE', 'REJECTED', 'MARKED_PAID'].includes(e.status)) return bad(res, 'Already settled.', 409);
      const p = z.object({ note: z.string().trim().min(5, 'Say why (at least 5 characters).').max(300) }).safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid');
      e.status = 'WAIVED'; e.note = p.data.note;
      if (e.kind === 'MEMBERSHIP') { const from = (() => { const l = lastValidTo(e.payerId); return l && l > t ? l : t; })(); e.validFrom = from; e.validTo = addMonths(from, e.months || 1); }
      e.history.push({ at: t, by: u.id, what: `Waived: ${p.data.note}` });
    } else {
      if (e.status !== 'MARKED_PAID') return bad(res, 'Only a payment the payer has marked paid can be confirmed or rejected.', 409);
      if (name === 'confirm') {
        e.status = 'CONFIRMED';
        if (e.kind === 'MEMBERSHIP') { const l = lastValidTo(e.payerId); const from = l && l > t ? l : t; e.validFrom = from; e.validTo = addMonths(from, e.months || 1); }
        e.history.push({ at: t, by: u.id, what: `Payment received${e.validTo ? ` · member until ${e.validTo.slice(0, 10)}` : ''}` });
      } else {
        const p = z.object({ note: z.string().trim().min(5, 'Say why (at least 5 characters).').max(300) }).safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid');
        e.status = 'REJECTED'; e.rejectNote = p.data.note; e.history.push({ at: t, by: u.id, what: `Payment not found: ${p.data.note}` });
      }
    }
    e.updatedAt = t; audit(e.id, `GENZ_FEE_${name.toUpperCase()}`, `${e.kind === 'MEMBERSHIP' ? `Membership ${e.planName}` : eventInfo(e.event)?.en} · ${e.payerName}${e.event === 'BROKER_DEAL' ? '' : ` · ${inr(e.amount)}`}`); db.save();
    res.json({ success: true, entry: shapeEntry(e, true) });
  });
  act('confirm'); act('reject'); act('waive');
  r.post('/ledger/:id/refund-settled', manage, (req: Request, res: Response) => {
    const u = me(); const e = st().billingLedger.find(x => x.id === req.params.id); if (!e || !e.needsRefund) return bad(res, 'Nothing to settle', 404);
    const p = z.object({ note: z.string().trim().min(5, 'Write what was done (at least 5 characters).').max(300) }).safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid');
    e.needsRefund = false; e.updatedAt = nowIso(); e.history.push({ at: e.updatedAt, by: u.id, what: `Refund settled: ${p.data.note}` });
    audit(e.id, 'GENZ_FEE_REFUND_SETTLED', p.data.note); db.save(); res.json({ success: true });
  });

  /** Give someone a membership without payment (pilot, partner, goodwill) — recorded as waived. */
  r.post('/members/grant', manage, (req: Request, res: Response) => {
    const p = z.object({ userId: z.string().min(2), planId: z.string().min(2), months: z.coerce.number().int().min(1).max(36), note: z.string().trim().min(5, 'Say why (at least 5 characters).').max(300) }).safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid');
    const u = db.byId('users', p.data.userId); const plan = planById(p.data.planId); if (!u || !plan) return bad(res, 'Person or plan not found', 404);
    const payer = payerOf(u); if (!payer || !plan.segments.includes(payer.segment)) return bad(res, `${u.name} is not in a group this plan is for.`);
    const s = st(); const t = nowIso(); const l = lastValidTo(u.id); const from = l && l > t ? l : t;
    const e: BillingEntry = { id: nextId('GZF-', s.billingLedger.map(x => x.id), 6), kind: 'MEMBERSHIP', payerId: u.id, payerName: u.companyName ? `${u.name} — ${u.companyName}` : u.name, payerSegment: payer.segment, amount: 0, planId: plan.id, planName: plan.name, months: p.data.months, comp: true, validFrom: from, validTo: addMonths(from, p.data.months), status: 'WAIVED', note: p.data.note, createdAt: t, updatedAt: t, history: [{ at: t, by: me().id, what: `Given free for ${p.data.months} month(s): ${p.data.note}` }] };
    s.billingLedger.push(e); audit(e.id, 'GENZ_MEMBERSHIP_GIVEN', `${plan.name} → ${u.name} for ${p.data.months} month(s): ${p.data.note}`); db.save();
    res.json({ success: true, entry: e });
  });
  r.post('/members/:entryId/end', manage, (req: Request, res: Response) => {
    const e = st().billingLedger.find(x => x.id === req.params.entryId && x.kind === 'MEMBERSHIP'); if (!e || !e.validTo) return bad(res, 'Membership not found', 404);
    const p = z.object({ note: z.string().trim().min(5, 'Say why (at least 5 characters).').max(300) }).safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid');
    const t = nowIso(); if (e.validTo <= t) return bad(res, 'This membership has already ended.', 409);
    e.validTo = t; e.updatedAt = t; e.history.push({ at: t, by: me().id, what: `Ended early: ${p.data.note}` });
    audit(e.id, 'GENZ_MEMBERSHIP_ENDED', `${e.planName} · ${e.payerName}: ${p.data.note}`); db.save(); res.json({ success: true });
  });

  // ═════════════ the payer ═════════════
  r.get('/me', self, (_req, res) => {
    ensureBilling(); const u = me(); const s = st(); const payer = payerOf(u); const now = nowIso();
    if (!payer) return res.json({ success: true, segment: null, plans: [], rules: [], ledger: [], gates: [], membership: null });
    const mem = activeMembership(u.id); const plan = mem ? planById(mem.planId) : null;
    // the fees that would apply to me today (one per event, the same rule the charge would use)
    const rules = FEE_EVENTS.filter(ev => ev.payers.includes(payer.segment)).map(ev => {
      const rule = pickRule(s.billingRules, ev.id, payer, now);
      const upcoming = s.billingRules.filter(r => r.active && r.event === ev.id && r.effectiveFrom > now && targets(r, payer)).map(r => ({ from: r.effectiveFrom, en: describeRule(r, 'en'), hi: describeRule(r, 'hi') }));
      const b = plan?.fees[ev.id];
      return { event: ev.id, rule: rule ? { en: describeRule(rule, 'en'), hi: describeRule(rule, 'hi'), since: rule.effectiveFrom } : null, member: rule && b ? { en: describeBenefit(ev.id, b, 'en'), hi: describeBenefit(ev.id, b, 'hi') } : null, upcoming };
    }).filter(x => x.rule || x.upcoming.length);
    const plans = s.billingPlans.filter(p => p.active && targets(p, payer)).map(describePlanFor);
    const gates = s.billingGates.filter(g => g.membersOnly && g.segments.includes(payer.segment)).map(g => ({ key: g.key, unlocked: !!plan?.features.includes(g.key) }));
    const ledger = s.billingLedger.filter(e => e.payerId === u.id).slice().reverse().slice(0, 200);
    const pending = ledger.find(e => e.kind === 'MEMBERSHIP' && (e.status === 'DUE' || e.status === 'MARKED_PAID' || e.status === 'REJECTED'));
    res.json({ success: true, segment: payer.segment, state: payer.state, plans, rules, gates, ledger, membership: mem ? { planId: mem.planId, planName: mem.planName, validTo: mem.validTo, comp: !!mem.comp } : null, pendingMembershipId: pending?.id, perks: plan?.features || [] });
  });
  r.post('/me/buy', self, (req: Request, res: Response) => {
    const p = z.object({ planId: z.string().min(2), period: z.enum(['MONTHLY', 'YEARLY']) }).safeParse(req.body); if (!p.success) return bad(res, 'Choose a plan and monthly or yearly');
    const u = me(); const s = st(); const payer = payerOf(u); const plan = planById(p.data.planId);
    if (!payer || !plan || !plan.active || !targets(plan, payer)) return bad(res, 'This plan is not open to you.', 404);
    const price = p.data.period === 'MONTHLY' ? plan.monthly : plan.yearly; if (price === undefined) return bad(res, `This plan has no ${p.data.period.toLowerCase()} price.`);
    if (s.billingLedger.some(e => e.kind === 'MEMBERSHIP' && e.payerId === u.id && ['DUE', 'MARKED_PAID', 'REJECTED'].includes(e.status))) return bad(res, 'You already have a membership payment in progress.', 409);
    const t = nowIso(); const months = p.data.period === 'YEARLY' ? 12 : 1;
    const e: BillingEntry = { id: nextId('GZF-', s.billingLedger.map(x => x.id), 6), kind: 'MEMBERSHIP', payerId: u.id, payerName: u.companyName ? `${u.name} — ${u.companyName}` : u.name, payerSegment: payer.segment, amount: Math.round(price), planId: plan.id, planName: plan.name, period: p.data.period, months, status: 'DUE', createdAt: t, updatedAt: t, history: [{ at: t, by: u.id, what: `Asked for ${plan.name} (${p.data.period.toLowerCase()}, ${inr(price)})` }] };
    if (price === 0) { const l = lastValidTo(u.id); const from = l && l > t ? l : t; e.status = 'WAIVED'; e.validFrom = from; e.validTo = addMonths(from, months); e.history.push({ at: t, by: 'SYSTEM', what: 'Free plan — active at once' }); }
    s.billingLedger.push(e); audit(e.id, 'GENZ_MEMBERSHIP_REQUESTED', `${plan.name} · ${u.name} · ${inr(price)}`); db.save();
    res.json({ success: true, entry: e });
  });
  r.post('/ledger/:id/mark-paid', self, (req: Request, res: Response) => {
    const u = me(); const e = st().billingLedger.find(x => x.id === req.params.id);
    if (!e || e.payerId !== u.id) return bad(res, 'Entry not found', 404);
    if (e.status !== 'DUE' && e.status !== 'REJECTED') return bad(res, 'This entry is not waiting for payment.', 409);
    const p = payBody.safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid payment');
    const today = todayIst();
    if (p.data.paidOn && p.data.paidOn > today) return bad(res, 'The payment date cannot be in the future.');
    const norm = (x: string) => x.replace(/\s+/g, '').toLowerCase();
    if (st().billingLedger.some(x => x.id !== e.id && x.ref && norm(x.ref) === norm(p.data.ref) && x.status !== 'REJECTED' && x.status !== 'CANCELLED')) return bad(res, 'This reference is already used on another entry.', 409);
    e.status = 'MARKED_PAID'; e.ref = p.data.ref; e.paidOn = p.data.paidOn || today; e.note = p.data.note; e.rejectNote = undefined; e.updatedAt = nowIso();
    e.history.push({ at: e.updatedAt, by: u.id, what: `Marked paid · ref ${e.ref}` });
    audit(e.id, 'GENZ_FEE_MARKED_PAID', `${u.name} · ref ${e.ref}`); db.save();
    res.json({ success: true, entry: e });
  });

  /** badge + whether the tab is worth showing to this person */
  r.get('/badge', needs('billing:self', 'billing:manage'), (_req, res) => {
    ensureBilling(); const u = me(); const s = st();
    if (isStaff(u)) return res.json({ success: true, count: s.billingLedger.filter(e => e.status === 'MARKED_PAID').length + s.billingLedger.filter(e => e.needsRefund).length, relevant: true });
    const payer = payerOf(u); if (!payer) return res.json({ success: true, count: 0, relevant: false });
    const mine = s.billingLedger.filter(e => e.payerId === u.id);
    const relevant = mine.length > 0 || s.billingPlans.some(p => p.active && targets(p, payer)) || s.billingRules.some(r => r.active && targets(r, payer));
    res.json({ success: true, count: mine.filter(e => e.status === 'DUE' || e.status === 'REJECTED').length, relevant });
  });

  return r;
}

export type { GateSetting };
