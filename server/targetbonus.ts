/**
 * v38 — Target Bonus (see src/shared/targetBonus.ts for the rules). Mounted at /api/crm.
 *
 *   GET  /target-bonus                                    builder: own projects, every partner · broker: his own row · admins: all
 *   PUT  /projects/:id/target-bonus                       builder sets the scheme                     (crm:bonus_manage)
 *   PUT  /projects/:id/target-bonus/partners/:mandateId   builder sets one partner's target + deadline (crm:bonus_manage)
 *   POST /projects/:id/target-bonus/pay                   builder records a payout (UTR)               (crm:payout)
 *
 * Fair to the partner: a partner who already reached the target, or whose period is over, keeps the terms in force at that
 * time — the builder's later changes (scheme, target, deadline, quota in Project Control) apply to the others only.
 * GENZ never holds or moves this money; the builder pays and records the reference here.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from './db.js';
import type { BuilderProject, SalesAssociateMandate, UserProfile } from './db.js';
import { ctx, needs } from './auth.js';
import { isAdmin, isSuper } from './access.js';
import { auditCrm, collectedPct } from './crm.js';
import { computeTarget, partnerPeriod, validateTargetScheme, addDays, endOfDay, type TargetBonusScheme, type TargetRow } from '../src/shared/targetBonus.js';

const nowIso = () => new Date().toISOString();
const me = () => ctx().user as UserProfile;
const LIVE = new Set(['ACTIVE_ASSOCIATE', 'TOP_PERFORMER', 'PAUSED', 'COMPLETED']);
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-31');
const reward = z.object({ kind: z.enum(['EXTRA_PCT', 'LUMP_SUM']), value: z.number().min(0).max(100_000_000) });
const schemeSchema = z.object({
  enabled: z.boolean(),
  periodDays: z.number().int().min(7).max(730),
  qualifyCollectionPct: z.number().min(0).max(100),
  hit: reward,
  overPct: z.number().min(0).max(5),
  early: reward.extend({ withinPct: z.number().min(10).max(90) }).nullable(),
  note: z.string().trim().max(200).optional(),
});

/** the terms one partner is measured on: his frozen terms if any, else the project's scheme + his target/deadline */
function termsOf(p: BuilderProject, m: SalesAssociateMandate) {
  if (m.targetLock) return { scheme: m.targetLock.scheme, target: m.targetLock.target, deadline: m.targetLock.deadline, start: m.decidedAt || m.assignedAt, locked: true };
  const scheme = p.targetBonus!;
  return { scheme, ...partnerPeriod(scheme, m), locked: false };
}

export function targetRows(p: BuilderProject, now = Date.now()) {
  const s = db.getState();
  if (!p.targetBonus) return [] as (TargetRow & { brokerName: string; brokerCompany?: string; status: string; targetBy?: string })[];
  const bookings = s.crmBookings.filter(b => b.projectId === p.id && b.status === 'APPROVED').map(b => ({ mandateId: b.mandateId || '', agreementValue: b.agreementValue, approvedAt: b.decidedAt, collectedPct: collectedPct(b).pct }));
  const paid: Record<string, number> = {};
  for (const x of s.targetBonusPayouts) if (x.projectId === p.id) paid[x.mandateId] = (paid[x.mandateId] || 0) + x.amount;
  return s.associateMandates.filter(m => m.projectId === p.id && LIVE.has(m.status)).map(m => {
    const t = termsOf(p, m);
    const row = computeTarget(t.scheme, { mandateId: m.id, associateId: m.brokerId, target: t.target, start: t.start, deadline: t.deadline }, bookings, paid[m.id] || 0, now, t.locked);
    return { ...row, brokerName: m.brokerName, brokerCompany: m.brokerCompany, status: m.status, targetBy: m.targetBy };
  });
}

/**
 * Freeze the terms of every partner who already reached the target or whose period ended, so a later change by the builder
 * cannot take away (or re-open) what was decided. Returns how many were frozen.
 */
export function lockTargetTerms(p: BuilderProject, now = Date.now()): number {
  if (!p.targetBonus) return 0;
  const s = db.getState(); let n = 0;
  const rows = targetRows(p, now);
  for (const r of rows) {
    if (r.locked || (r.state !== 'ACHIEVED' && r.state !== 'MISSED')) continue;
    const m = s.associateMandates.find(x => x.id === r.mandateId); if (!m) continue;
    m.targetLock = { scheme: JSON.parse(JSON.stringify(p.targetBonus)), target: r.target, deadline: r.deadline, lockedAt: new Date(now).toISOString() };
    n++;
  }
  return n;
}

export function sweepTargetBonus(now = Date.now()): number {
  let n = 0;
  for (const p of db.getState().builderProjects || []) n += lockTargetTerms(p, now);
  if (n) db.save();
  return n;
}

export function createTargetBonusRouter() {
  const r = Router();
  const own = (u: UserProfile, id: string) => {
    const p = db.byId('builderProjects', id) as BuilderProject | undefined;
    return p && (isSuper(u as any) || (u.role === 'DEVELOPER_BUILDER' && p.builderId === u.id)) ? p : undefined;
  };

  r.get('/target-bonus', (_req: Request, res: Response) => {
    const u = ctx().user as UserProfile | undefined;
    if (!u) return res.status(401).json({ error: 'Please sign in' });
    const broker = u.role === 'BROKER';
    if (!broker && u.role !== 'DEVELOPER_BUILDER' && !isAdmin(u as any)) return res.status(403).json({ error: 'Target bonus is for builders and their partner brokers' });
    const s = db.getState();
    let projects = s.builderProjects || [];
    if (u.role === 'DEVELOPER_BUILDER') projects = projects.filter(p => p.builderId === u.id);
    else if (broker) { const ids = new Set(s.associateMandates.filter(m => m.brokerId === u.id && LIVE.has(m.status)).map(m => m.projectId)); projects = projects.filter(p => ids.has(p.id) && p.targetBonus?.enabled); }
    let froze = 0;
    const out = projects.map(p => {
      froze += lockTargetTerms(p);
      const rows = targetRows(p).filter(x => !broker || x.associateId === u.id);
      return {
        projectId: p.id, projectName: p.projectName, earlyBirdPct: p.earlyBirdIncentiveBonusPct ?? null, scheme: p.targetBonus || null, rows,
        payouts: s.targetBonusPayouts.filter(x => x.projectId === p.id && (!broker || x.brokerId === u.id)),
      };
    });
    if (froze) db.save();
    res.json({ success: true, projects: out, canManage: u.role === 'DEVELOPER_BUILDER' || isSuper(u as any), now: nowIso() });
  });

  r.put('/projects/:id/target-bonus', needs('crm:bonus_manage'), (req: Request, res: Response) => {
    const u = me(); const p = own(u, req.params.id);
    if (!p) return res.status(404).json({ error: 'Project not found' });
    const parsed = schemeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid target bonus' });
    const d = parsed.data;
    const scheme: TargetBonusScheme = { enabled: d.enabled, periodDays: d.periodDays, qualifyCollectionPct: d.qualifyCollectionPct, hit: d.hit, overPct: d.overPct, early: d.early, note: d.note || undefined, updatedAt: nowIso() };
    const err = validateTargetScheme(scheme); if (err) return res.status(400).json({ error: err });
    const frozen = lockTargetTerms(p); // partners who already earned / whose period ended keep the old terms
    p.targetBonus = scheme;
    if (scheme.early && scheme.early.kind === 'EXTRA_PCT') p.earlyBirdIncentiveBonusPct = scheme.early.value; // the project's early-bird % now means this
    p.updatedAt = nowIso();
    db.save();
    auditCrm('CRM_TARGET_BONUS_UPDATED', p.id, `${u.name} ${scheme.enabled ? 'set' : 'switched off'} the target bonus on ${p.projectName}: ${scheme.periodDays}-day period, hit ${scheme.hit.kind === 'LUMP_SUM' ? inr(scheme.hit.value) : '+' + scheme.hit.value + '%'}, above target +${scheme.overPct}%/unit, early ${scheme.early ? `${scheme.early.kind === 'LUMP_SUM' ? inr(scheme.early.value) : '+' + scheme.early.value + '%'} within ${scheme.early.withinPct}%` : 'off'}, counts at ${scheme.qualifyCollectionPct}% collection${frozen ? ` (${frozen} partner(s) keep their earlier terms)` : ''}`, 'COMMISSION');
    res.json({ success: true, scheme, frozen });
  });

  r.put('/projects/:id/target-bonus/partners/:mandateId', needs('crm:bonus_manage'), (req: Request, res: Response) => {
    const u = me(); const p = own(u, req.params.id);
    if (!p) return res.status(404).json({ error: 'Project not found' });
    if (!p.targetBonus) return res.status(409).json({ error: 'Set up the target bonus for this project first' });
    const m = db.getState().associateMandates.find(x => x.id === req.params.mandateId && x.projectId === p.id);
    if (!m || !LIVE.has(m.status)) return res.status(404).json({ error: 'Partner not found on this project' });
    if (lockTargetTerms(p)) db.save();
    if (m.targetLock) return res.status(409).json({ error: 'This partner already reached the target or the period is over — his terms are frozen', code: 'TARGET_LOCKED' });
    const target = Number(req.body?.target);
    if (!Number.isInteger(target) || target < 1 || target > 500) return res.status(400).json({ error: 'Target must be 1–500 units' });
    const deadline = String(req.body?.deadline ?? '');
    const start = (m.decidedAt || m.assignedAt).slice(0, 10);
    if (deadline) {
      if (!isoDay.safeParse(deadline).success) return res.status(400).json({ error: 'Use a date like 2026-12-31' });
      if (deadline < start) return res.status(400).json({ error: 'Deadline cannot be before the partner started' });
      if (endOfDay(deadline) < Date.now()) return res.status(400).json({ error: 'Deadline must be today or later' });
      if (deadline > addDays(start, 730)) return res.status(400).json({ error: 'Deadline can be at most 2 years after the partner started' });
    }
    const note = String(req.body?.note || '').trim().slice(0, 200);
    const before = `${m.targetUnitsQuota} by ${(m.targetBy || addDays(start, p.targetBonus.periodDays))}`;
    m.targetUnitsQuota = target; m.targetBy = deadline || undefined;
    const after = `${target} by ${deadline || addDays(start, p.targetBonus.periodDays)}`;
    m.termsHistory = [...(m.termsHistory || []), { at: nowIso(), by: u.name, commissionPct: m.agreedCommissionPct, quota: target, dailyLeadCap: m.dailyLeadCap, validUntil: m.validUntil, note: note || `Target ${after}` }];
    db.save();
    auditCrm('CRM_TARGET_SET', m.id, `${u.name}: target for ${m.brokerName} on ${p.projectName} ${before} → ${after}${note ? ` (${note})` : ''}`, 'COMMISSION');
    res.json({ success: true, row: targetRows(p).find(x => x.mandateId === m.id) });
  });

  r.post('/projects/:id/target-bonus/pay', needs('crm:payout'), (req: Request, res: Response) => {
    const u = me(); const p = own(u, req.params.id);
    if (!p) return res.status(404).json({ error: 'Project not found' });
    const mandateId = String(req.body?.mandateId || '');
    const amount = Math.round(Number(req.body?.amount));
    const reference = String(req.body?.reference || '').trim().slice(0, 60);
    const row = targetRows(p).find(x => x.mandateId === mandateId);
    if (!row) return res.status(404).json({ error: 'No target bonus record for this partner on this project' });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'A positive payout amount is required' });
    if (amount > row.payable) return res.status(400).json({ error: `Only ${inr(row.payable)} target bonus is payable right now` });
    if (reference.length < 4) return res.status(400).json({ error: 'Enter the bank / UPI payout reference (UTR)' });
    const s = db.getState();
    const m = s.associateMandates.find(x => x.id === mandateId)!;
    const rec = { id: `TBP-${String(s.targetBonusPayouts.length + 1).padStart(4, '0')}`, projectId: p.id, mandateId, brokerId: m.brokerId, amount, tdsPct: p.tdsPct ?? 5, reference, breakdown: { hit: row.hitAmount, over: row.overAmount, early: row.earlyAmount }, paidBy: u.id, paidAt: nowIso() };
    s.targetBonusPayouts.push(rec);
    if (lockTargetTerms(p) === 0 && !m.targetLock && row.earned > 0) m.targetLock = { scheme: JSON.parse(JSON.stringify(p.targetBonus)), target: row.target, deadline: row.deadline, lockedAt: nowIso() };
    db.save();
    const tds = Math.round((amount * rec.tdsPct) / 100);
    auditCrm('CRM_TARGET_BONUS_PAID', p.id, `Target bonus ${inr(amount)} paid to ${m.brokerName} on ${p.projectName} (ref ${reference}; TDS @${rec.tdsPct}% = ${inr(tds)})`, 'COMMISSION');
    res.json({ success: true, payout: rec, tds, net: amount - tds });
  });

  return r;
}
