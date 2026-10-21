/**
 * v38 — Target Bonus: a builder's reward for a partner (associate broker) who reaches HIS OWN unit target before HIS OWN deadline.
 *
 *   target   = the partner's "target units" (SalesAssociateMandate.targetUnitsQuota)
 *   start    = the day the builder approved the partner (decidedAt, else assignedAt)
 *   deadline = a date the builder sets for that partner, else start + the scheme's period (days)
 *
 * Three rewards, all on top of the base commission and the volume bonus:
 *   1. HIT   — target reached on or before the deadline → extra % on the sales counted in the period, or a fixed ₹
 *   2. OVER  — every unit beyond the target (inside the period) → extra % on that unit's agreement value
 *   3. EARLY — target reached within the first X % of the period → one more extra % / fixed ₹ (the project's "early-bird %")
 *
 * A unit counts when its booking is APPROVED inside [start, deadline] AND the minimum collection % has been received.
 * A cancelled booking drops out by itself, so the bonus can go down after a cancellation (shown as over-paid).
 * Pure functions: used by the server (amounts, payouts) and by the screens (progress).
 */
export type TargetRewardKind = 'EXTRA_PCT' | 'LUMP_SUM';
export interface TargetReward { kind: TargetRewardKind; value: number }

export interface TargetBonusScheme {
  enabled: boolean;
  /** default length of a partner's target period, counted from the day he was approved */
  periodDays: number;
  /** a booking counts only once this % of its agreement value is collected (default 10) */
  qualifyCollectionPct: number;
  /** 1. target reached by the deadline */
  hit: TargetReward;
  /** 2. extra % on each unit beyond the target (0 = off) */
  overPct: number;
  /** 3. target reached within the first `withinPct` % of the period (null = off) */
  early: (TargetReward & { withinPct: number }) | null;
  note?: string;
  updatedAt?: string;
}

/** Terms frozen for one partner when the builder changes the scheme after that partner already earned under the old one. */
export interface TargetTermsLock { scheme: TargetBonusScheme; target: number; deadline: string; lockedAt: string }

export interface TargetBookingInput { mandateId: string; agreementValue: number; approvedAt?: string; collectedPct: number }

export interface TargetPartnerInput {
  mandateId: string;
  associateId: string;
  target: number;
  /** ISO — period start */
  start: string;
  /** ISO day or time — inclusive last day */
  deadline: string;
}

export type TargetState = 'NO_TARGET' | 'IN_PROGRESS' | 'ACHIEVED' | 'MISSED';

export interface TargetRow {
  mandateId: string;
  associateId: string;
  target: number;
  start: string;
  deadline: string;
  earlyBy?: string;
  state: TargetState;
  units: number;
  salesValue: number;
  unitsToGo: number;
  daysTotal: number;
  daysLeft: number;
  earlyDaysLeft?: number;
  /** units per day needed from today to make it */
  pace: 'AHEAD' | 'ON_TRACK' | 'BEHIND' | 'DONE' | 'OVER';
  hitAt?: string;
  early: boolean;
  overUnits: number;
  hitAmount: number;
  overAmount: number;
  earlyAmount: number;
  earned: number;
  paid: number;
  payable: number;
  overpaid: number;
  /** what the partner would get if he reached the target today (for the progress card) */
  potential: { hit: number; early: number; perExtraUnitPct: number };
  locked: boolean;
}

const DAY = 86_400_000;
export const endOfDay = (iso: string) => {
  const t = Date.parse(iso.length <= 10 ? iso + 'T00:00:00.000Z' : iso);
  return iso.length <= 10 ? t + DAY - 1 : t;
};
export const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY).toISOString().slice(0, 10);

export const DEFAULT_TARGET_SCHEME = (earlyBirdPct?: number): TargetBonusScheme => ({
  enabled: true, periodDays: 90, qualifyCollectionPct: 10,
  hit: { kind: 'EXTRA_PCT', value: 0.5 }, overPct: 0.25,
  early: { kind: 'EXTRA_PCT', value: earlyBirdPct && earlyBirdPct > 0 ? earlyBirdPct : 0.25, withinPct: 50 },
});

const amount = (r: TargetReward | null | undefined, sales: number) => !r || !(r.value > 0) ? 0 : r.kind === 'LUMP_SUM' ? Math.round(r.value) : Math.round((sales * r.value) / 100);

export function computeTarget(scheme: TargetBonusScheme, p: TargetPartnerInput, bookings: TargetBookingInput[], paid = 0, now = Date.now(), locked = false): TargetRow {
  const startMs = Date.parse(p.start);
  const endMs = endOfDay(p.deadline);
  const span = Math.max(DAY, endMs - startMs);
  const earlyMs = scheme.early && scheme.early.withinPct > 0 ? startMs + span * Math.min(100, scheme.early.withinPct) / 100 : undefined;
  const counted = bookings
    .filter(b => b.mandateId === p.mandateId && b.approvedAt && b.collectedPct + 1e-9 >= scheme.qualifyCollectionPct)
    .filter(b => { const t = Date.parse(b.approvedAt!); return t >= startMs && t <= endMs; })
    .sort((a, b) => Date.parse(a.approvedAt!) - Date.parse(b.approvedAt!));
  const units = counted.length;
  const salesValue = counted.reduce((a, b) => a + b.agreementValue, 0);
  const target = Math.max(0, Math.floor(p.target || 0));
  const achieved = target > 0 && units >= target;
  const hitAt = achieved ? counted[target - 1].approvedAt : undefined;
  const early = !!(achieved && earlyMs !== undefined && Date.parse(hitAt!) <= earlyMs);
  const overList = achieved ? counted.slice(target) : [];
  const overValue = overList.reduce((a, b) => a + b.agreementValue, 0);
  const on = scheme.enabled;
  const hitAmount = on && achieved ? amount(scheme.hit, salesValue) : 0;
  const overAmount = on && achieved ? Math.round((overValue * (scheme.overPct || 0)) / 100) : 0;
  const earlyAmount = on && early ? amount(scheme.early, salesValue) : 0;
  const earned = hitAmount + overAmount + earlyAmount;
  const state: TargetState = target <= 0 ? 'NO_TARGET' : achieved ? 'ACHIEVED' : now > endMs ? 'MISSED' : 'IN_PROGRESS';
  const daysTotal = Math.max(1, Math.round(span / DAY));
  const daysLeft = Math.max(0, Math.ceil((endMs - now) / DAY));
  const elapsed = Math.min(1, Math.max(0, (now - startMs) / span));
  const pace: TargetRow['pace'] = achieved ? (units > target ? 'OVER' : 'DONE') : target <= 0 ? 'ON_TRACK' : units / target >= elapsed + 0.1 ? 'AHEAD' : units / target >= elapsed - 0.1 ? 'ON_TRACK' : 'BEHIND';
  // what reaching the target today would pay (estimate on the sales so far, at least one average unit per missing unit)
  const avg = units ? salesValue / units : 0;
  const projected = salesValue + Math.max(0, target - units) * avg;
  return {
    mandateId: p.mandateId, associateId: p.associateId, target, start: p.start, deadline: p.deadline,
    earlyBy: earlyMs !== undefined ? new Date(earlyMs).toISOString() : undefined,
    state, units, salesValue, unitsToGo: Math.max(0, target - units), daysTotal, daysLeft,
    earlyDaysLeft: earlyMs !== undefined ? Math.max(0, Math.ceil((earlyMs - now) / DAY)) : undefined,
    pace, hitAt, early, overUnits: overList.length, hitAmount, overAmount, earlyAmount, earned,
    paid: Math.round(paid), payable: Math.max(0, earned - Math.round(paid)), overpaid: Math.max(0, Math.round(paid) - earned),
    potential: { hit: on ? amount(scheme.hit, projected) : 0, early: on && earlyMs !== undefined && now <= earlyMs ? amount(scheme.early, projected) : 0, perExtraUnitPct: on ? scheme.overPct || 0 : 0 },
    locked,
  };
}

/** The target, period start and deadline the scheme uses for one partner. */
export function partnerPeriod(scheme: TargetBonusScheme, m: { decidedAt?: string; assignedAt: string; targetUnitsQuota: number; targetBy?: string }) {
  const start = m.decidedAt || m.assignedAt;
  return { start, deadline: m.targetBy || addDays(start, scheme.periodDays || 90), target: m.targetUnitsQuota || 0 };
}

export function rewardLabel(r: TargetReward | null | undefined, hi = false): string {
  if (!r || !(r.value > 0)) return hi ? 'बंद' : 'off';
  return r.kind === 'LUMP_SUM' ? `₹${Math.round(r.value).toLocaleString('en-IN')}` : (hi ? `बिक्री पर +${r.value}%` : `+${r.value}% on sales`);
}

export function validateTargetScheme(s: TargetBonusScheme): string | null {
  if (!(s.periodDays >= 7 && s.periodDays <= 730)) return 'Target period must be between 7 and 730 days';
  if (!(s.qualifyCollectionPct >= 0 && s.qualifyCollectionPct <= 100)) return 'Collection % must be between 0 and 100';
  const pct = (r: TargetReward | null | undefined, what: string) => r && r.kind === 'EXTRA_PCT' && r.value > 5 ? `${what}: extra % can be at most 5` : null;
  return pct(s.hit, 'Target bonus') || pct(s.early, 'Early-finish bonus') || (s.overPct < 0 || s.overPct > 5 ? 'Extra % per unit above target can be at most 5' : null)
    || (s.early && !(s.early.withinPct >= 10 && s.early.withinPct <= 90) ? 'Early finish must be within 10–90 % of the period' : null);
}
