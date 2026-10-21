/**
 * Builder volume-bonus ("incentive slabs").
 * Besides the base channel-partner commission, many builders pay more when an associate — or all associates
 * together — sell more units in a period ("5 units this month → ₹50,000", "10 units on the project → +0.25%").
 * Everything here is COMPUTED from approved bookings, so cancelled bookings drop out automatically.
 */
export type BonusLevel = 'INDIVIDUAL' | 'PROJECT';
export type BonusKind = 'EXTRA_PCT' | 'LUMP_SUM';

export interface BonusSlab {
  id: string;
  /** INDIVIDUAL: counts the associate's own units · PROJECT: counts all associates' units on the project together */
  level: BonusLevel;
  minUnits: number;
  /** EXTRA_PCT: extra % of the agreement value of the associate's counted units · LUMP_SUM: flat ₹ per qualifying associate */
  kind: BonusKind;
  value: number;
}

export interface BonusScheme {
  enabled: boolean;
  /** only bookings approved inside this window count (ISO dates; open-ended if absent) */
  windowFrom?: string;
  windowTo?: string;
  /** a booking counts only once this % of its agreement value has been collected (default 10) */
  qualifyCollectionPct: number;
  slabs: BonusSlab[];
  note?: string;
}

export interface BonusBookingInput {
  mandateId: string;
  associateId: string;
  agreementValue: number;
  /** ISO time the booking was approved */
  approvedAt?: string;
  collectedPct: number;
}

export interface BonusRow {
  mandateId: string;
  associateId: string;
  units: number;
  salesValue: number;
  individualSlab?: BonusSlab;
  projectSlab?: BonusSlab;
  individualAmount: number;
  projectAmount: number;
  earned: number;
  paid: number;
  payable: number;
  overpaid: number;
  nextIndividual?: { slab: BonusSlab; unitsToGo: number };
}

export interface BonusStatus {
  projectUnits: number;
  nextProject?: { slab: BonusSlab; unitsToGo: number };
  rows: BonusRow[];
}

export function bookingCounts(s: BonusScheme, b: BonusBookingInput): boolean {
  if (b.collectedPct + 1e-9 < s.qualifyCollectionPct) return false;
  if (!b.approvedAt) return !s.windowFrom && !s.windowTo;
  const t = Date.parse(b.approvedAt);
  if (s.windowFrom && t < Date.parse(s.windowFrom)) return false;
  if (s.windowTo && t > Date.parse(s.windowTo) + 86399999) return false; // inclusive of the last day
  return true;
}

const best = (slabs: BonusSlab[], level: BonusLevel, units: number) =>
  slabs.filter(x => x.level === level && x.minUnits <= units).sort((a, b) => b.minUnits - a.minUnits)[0];
const next = (slabs: BonusSlab[], level: BonusLevel, units: number) => {
  const n = slabs.filter(x => x.level === level && x.minUnits > units).sort((a, b) => a.minUnits - b.minUnits)[0];
  return n ? { slab: n, unitsToGo: n.minUnits - units } : undefined;
};
const amountFor = (slab: BonusSlab | undefined, salesValue: number) =>
  !slab ? 0 : slab.kind === 'LUMP_SUM' ? Math.round(slab.value) : Math.round((salesValue * slab.value) / 100);

/** Highest slab reached per level (slabs are not stacked within a level). */
export function computeBonus(
  scheme: BonusScheme | undefined,
  mandates: { mandateId: string; associateId: string }[],
  bookings: BonusBookingInput[],
  paidByMandate: Record<string, number> = {},
): BonusStatus {
  if (!scheme || !scheme.enabled) return { projectUnits: 0, rows: [] };
  const counted = bookings.filter(b => bookingCounts(scheme, b));
  const projectUnits = counted.length;
  const projectSlab = best(scheme.slabs, 'PROJECT', projectUnits);
  const rows: BonusRow[] = mandates.map(m => {
    const mine = counted.filter(b => b.mandateId === m.mandateId);
    const units = mine.length;
    const salesValue = mine.reduce((a, b) => a + b.agreementValue, 0);
    const individualSlab = best(scheme.slabs, 'INDIVIDUAL', units);
    const individualAmount = amountFor(individualSlab, salesValue);
    const projectAmount = units > 0 ? amountFor(projectSlab, salesValue) : 0; // a team bonus needs at least one own unit
    const earned = individualAmount + projectAmount;
    const paid = Math.round(paidByMandate[m.mandateId] || 0);
    return {
      mandateId: m.mandateId, associateId: m.associateId, units, salesValue,
      individualSlab, projectSlab: units > 0 ? projectSlab : undefined, individualAmount, projectAmount,
      earned, paid, payable: Math.max(0, earned - paid), overpaid: Math.max(0, paid - earned),
      nextIndividual: next(scheme.slabs, 'INDIVIDUAL', units),
    };
  });
  return { projectUnits, nextProject: next(scheme.slabs, 'PROJECT', projectUnits), rows };
}

export const slabLabel = (s: BonusSlab, hi = false) => hi
  ? `${s.level === 'INDIVIDUAL' ? 'अपनी' : 'प्रोजेक्ट की'} ${s.minUnits}+ यूनिट → ${s.kind === 'EXTRA_PCT' ? `उन बिक्री पर +${s.value}%` : `₹${s.value.toLocaleString('en-IN')} बोनस`}`
  : `${s.level === 'INDIVIDUAL' ? 'Own' : 'Project'} ${s.minUnits}+ units → ${s.kind === 'EXTRA_PCT' ? `+${s.value}% on those sales` : `₹${s.value.toLocaleString('en-IN')} bonus`}`;
