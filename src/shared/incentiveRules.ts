/**
 * v76b — a team member's incentive: the employer picks, per member, a PERCENTAGE or a fixed VALUE (₹ for every approved booking).
 *
 *  • Broker: the % is taken on the brokerage of the booking — that brokerage is fixed in advance, when the project is assigned (the mandate),
 *    so the base never moves after the booking is made.
 *  • Builder: his own desk sale carries no brokerage, so the % is taken on the booking (agreement) value; the fixed ₹ is per booking.
 *  • Anyone else has no bookings, so no incentive.
 * GENZ only calculates — the employer pays his employee himself, and a member never sees these figures except the final amount in a statement the employer shares.
 */
export type IncentiveMode = 'PCT' | 'FIXED';
export const INCENTIVE_MODES: readonly IncentiveMode[] = ['PCT', 'FIXED'];
/** highest % per employer kind (broker: of brokerage; builder: of booking value) and highest fixed ₹ per booking */
export const INCENTIVE_LIMITS = { pctBroker: 50, pctBuilder: 10, fixed: 500_000 } as const;
export type IncentiveBase = 'BROKERAGE' | 'VALUE';

export interface IncentiveCfg { incentiveMode?: IncentiveMode; incentivePct?: number; incentiveFixed?: number }
export interface IncentiveBooking { brokerage: number; value: number }

export const incentiveBaseFor = (employerRole?: string): IncentiveBase | null =>
  employerRole === 'BROKER' ? 'BROKERAGE' : employerRole === 'DEVELOPER_BUILDER' ? 'VALUE' : null;
export const incentiveModeOf = (c: IncentiveCfg | undefined): IncentiveMode => (c?.incentiveMode === 'FIXED' ? 'FIXED' : 'PCT');
export const maxPctFor = (employerRole?: string) => (employerRole === 'DEVELOPER_BUILDER' ? INCENTIVE_LIMITS.pctBuilder : INCENTIVE_LIMITS.pctBroker);

/** is this booking one the employer earns on? a broker: bookings of his own clients (his brokerage); a builder: bookings in his own projects */
export const isOwnBooking = (employerRole: string | undefined, employerId: string, b: { associateId?: string; builderId?: string }): boolean =>
  employerRole === 'BROKER' ? b.associateId === employerId : employerRole === 'DEVELOPER_BUILDER' ? b.builderId === employerId : false;

/** check what the employer typed; returns the fields to store (only the ones he sent) or the problem in words */
export function cleanIncentive(employerRole: string | undefined, input: { mode?: unknown; pct?: unknown; fixed?: unknown }): string | { incentiveMode?: IncentiveMode; incentivePct?: number; incentiveFixed?: number } {
  if (!incentiveBaseFor(employerRole)) return 'Only a broker or a builder can set an incentive';
  const out: { incentiveMode?: IncentiveMode; incentivePct?: number; incentiveFixed?: number } = {};
  if (input.mode !== undefined) {
    if (!INCENTIVE_MODES.includes(input.mode as IncentiveMode)) return 'Choose % or a fixed ₹ amount';
    out.incentiveMode = input.mode as IncentiveMode;
  }
  if (input.pct !== undefined) {
    const v = Number(input.pct); const max = maxPctFor(employerRole);
    if (!Number.isFinite(v) || v < 0 || v > max) return employerRole === 'DEVELOPER_BUILDER' ? `Incentive must be between 0% and ${max}% of the booking value` : `Incentive must be between 0% and ${max}% of brokerage`;
    out.incentivePct = Math.round(v * 100) / 100;
  }
  if (input.fixed !== undefined) {
    const v = Number(input.fixed);
    if (!Number.isInteger(v) || v < 0 || v > INCENTIVE_LIMITS.fixed) return `The fixed incentive must be a whole rupee amount, 0 – ${INCENTIVE_LIMITS.fixed.toLocaleString('en-IN')} per booking`;
    out.incentiveFixed = v;
  }
  return out;
}

/** the incentive on a set of approved bookings (those the employer owns: a broker's own brokerage, a builder's own desk sales) */
export function incentiveOf(cfg: IncentiveCfg | undefined, employerRole: string | undefined, bookings: IncentiveBooking[]): number {
  const base = incentiveBaseFor(employerRole); if (!base || !bookings.length) return 0;
  if (incentiveModeOf(cfg) === 'FIXED') return Math.max(0, Math.round(cfg?.incentiveFixed || 0)) * bookings.length;
  const sum = bookings.reduce((a, b) => a + (base === 'BROKERAGE' ? b.brokerage : b.value), 0);
  return Math.round(sum * (cfg?.incentivePct || 0) / 100);
}

/** one line for screens: "10% of brokerage", "0.5% of booking value", "₹5,000 per booking" */
export function incentiveLabel(cfg: IncentiveCfg | undefined, employerRole: string | undefined, hi = false): string {
  if (incentiveModeOf(cfg) === 'FIXED') return `₹${(cfg?.incentiveFixed || 0).toLocaleString('en-IN')} ${hi ? 'प्रति बुकिंग' : 'per booking'}`;
  const of = incentiveBaseFor(employerRole) === 'VALUE' ? (hi ? 'बुकिंग मूल्य का' : 'of booking value') : (hi ? 'ब्रोकरेज का' : 'of brokerage');
  return `${cfg?.incentivePct || 0}% ${of}`;
}
