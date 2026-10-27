/**
 * v73 — owner self-listing: the superadmin's MASTER PLAN (what a listing costs, how long it stays in the pool, limits) and pure rules.
 * GENZ's own listing fee only — GENZ never holds the parties' deal money. A listing brought by a GENZ broker or a shop-QR partner is free
 * but needs the mandate; a self-listed property is visible to brokers in the pool but is NOT matched until the owner assigns a broker.
 */
export type ListTx = 'Sale' | 'Rent' | 'Lease';
export interface OwnerListPlan {
  id: string;               // OLP-xxxxxxxxxx
  name: string;
  active: boolean;
  /** empty = every kind */
  transactionTypes: ListTx[];
  propertyTypes: string[];
  fee: number;              // ₹ (0 = free)
  durationDays: number;     // how long the paid listing stays in the pool without a broker
  maxPhotos: number;
  maxActivePerOwner: number;
  refundable: boolean;      // credited / refunded when the title gets verified or a deal happens (shown to the owner)
  note?: string;
  createdAt: string; updatedAt: string;
}
export interface OwnerListCfg {
  enabled: boolean;         // owners may list on their own
  upiId: string;            // where GENZ's fee is paid (outside the app; owner writes the UTR)
  payeeName: string;
}
export const DEFAULT_OWNER_LIST_CFG: OwnerListCfg = { enabled: true, upiId: '', payeeName: 'GENZ BUILDCON' };
export const PLAN_LIMITS = { fee: 100_000, days: [1, 365] as const, photos: [1, 40] as const, active: [1, 50] as const };

export interface OwnerTerms {
  basis: 'PERCENTAGE' | 'FIXED_FEE'; value: number; by: 'BROKER' | 'OWNER'; status: 'PROPOSED' | 'AGREED'; note?: string; at: string;
  history: { by: 'BROKER' | 'OWNER'; basis: string; value: number; at: string; action: 'PROPOSE' | 'COUNTER' | 'ACCEPT' }[];
}
export const TERMS_LIMITS = { pct: [0.1, 10] as const };
export function termsProblem(basis: unknown, value: unknown, price: number): string | null {
  if (basis !== 'PERCENTAGE' && basis !== 'FIXED_FEE') return 'Choose a percentage or a fixed amount';
  const v = Number(value); if (!Number.isFinite(v)) return 'Write the brokerage';
  if (basis === 'PERCENTAGE' && (v < TERMS_LIMITS.pct[0] || v > TERMS_LIMITS.pct[1])) return `Brokerage must be ${TERMS_LIMITS.pct[0]}% – ${TERMS_LIMITS.pct[1]}%`;
  if (basis === 'FIXED_FEE' && (!Number.isInteger(v) || v < 1 || v >= price)) return 'The fixed brokerage must be a whole rupee amount below the price';
  return null;
}
export type ListFeeStatus = 'FREE' | 'PENDING' | 'WAITING_CONFIRM' | 'PAID' | 'REJECTED' | 'WAIVED_BROKER' | 'EXPIRED';
export interface OwnerListingState {
  planId: string; planName: string; fee: number; durationDays: number; refundable: boolean;
  feeStatus: ListFeeStatus;
  /** payment the owner wrote (UTR) — GENZ staff confirms it */
  ref?: string; paidOn?: string; payNote?: string; rejectNote?: string;
  confirmedById?: string; confirmedAt?: string;
  /** in the broker pool (visible, never matched) */
  liveFrom?: string; liveUntil?: string;
  /** v76b — the last "your listing ends soon" alert sent: 3 = three days left, 1 = one day left (reset when the owner renews) */
  expWarn?: 3 | 1;
  /** the broker the owner chose; the listing is matched only after his mandate is signed */
  assignedBrokerId?: string; assignedAt?: string;
  requests: { brokerId: string; brokerName: string; note?: string; at: string }[];
  matchedAt?: string;
  /** free route: the brokerage the chosen broker and the owner settle on before the mandate is made (the mandate is built from the AGREED terms only) */
  terms?: OwnerTerms;
  /** the owner's written undertaking: no direct deal with a buyer / renter brought by GENZ brokers (set when he pays the listing fee) */
  noDirectDealAt?: string;
  createdAt: string;
}

export const planScore = (p: OwnerListPlan, tx: string, pt: string) => (p.transactionTypes.length ? (p.transactionTypes.includes(tx as ListTx) ? 1 : -1) : 0) + (p.propertyTypes.length ? (p.propertyTypes.includes(pt) ? 1 : -1) : 0);
/** the most specific active plan that fits; null = no plan covers it, so owners cannot self-list this kind */
export function pickOwnerPlan(plans: OwnerListPlan[], tx: string, pt: string): OwnerListPlan | null {
  const fit = plans.filter(p => p.active && planScore(p, tx, pt) >= (p.transactionTypes.length ? 1 : 0) + (p.propertyTypes.length ? 1 : 0))
    .sort((a, b) => (b.transactionTypes.length + b.propertyTypes.length) - (a.transactionTypes.length + a.propertyTypes.length) || b.createdAt.localeCompare(a.createdAt));
  return fit[0] || null;
}
export function planProblem(p: Partial<OwnerListPlan>): string | null {
  if (!p.name || String(p.name).trim().length < 2) return 'Give the plan a name';
  if (!Number.isInteger(p.fee) || (p.fee as number) < 0 || (p.fee as number) > PLAN_LIMITS.fee) return `Fee must be a whole rupee amount, 0 – ${PLAN_LIMITS.fee}`;
  if (!Number.isInteger(p.durationDays) || (p.durationDays as number) < PLAN_LIMITS.days[0] || (p.durationDays as number) > PLAN_LIMITS.days[1]) return `Duration must be ${PLAN_LIMITS.days[0]} – ${PLAN_LIMITS.days[1]} days`;
  if (!Number.isInteger(p.maxPhotos) || (p.maxPhotos as number) < PLAN_LIMITS.photos[0] || (p.maxPhotos as number) > PLAN_LIMITS.photos[1]) return `Photos limit must be ${PLAN_LIMITS.photos[0]} – ${PLAN_LIMITS.photos[1]}`;
  if (!Number.isInteger(p.maxActivePerOwner) || (p.maxActivePerOwner as number) < PLAN_LIMITS.active[0] || (p.maxActivePerOwner as number) > PLAN_LIMITS.active[1]) return `Live listings per owner must be ${PLAN_LIMITS.active[0]} – ${PLAN_LIMITS.active[1]}`;
  return null;
}

/** is a self-listed property in the broker pool (seen by brokers, never matched)? */
export const inPool = (p: { ownerListing?: OwnerListingState; listingStatus: string }, now = Date.now()) => {
  const o = p.ownerListing; if (!o || !['pending_verification', 'active'].includes(p.listingStatus)) return false;
  return o.feeStatus === 'PAID' && !o.assignedBrokerId && !!o.liveUntil && Date.parse(o.liveUntil) > now;
};

/** v76b — what the hourly sweep must do for a self-listed property: tell the owner 3 days and 1 day before the paid days end ('WARN3' / 'WARN1', each once per period), and take it out of the pool when they are over ('END'). null = nothing. */
export type ExpiryStep = 'WARN3' | 'WARN1' | 'END';
const DAY_MS = 86_400_000;
export function expiryStep(p: { ownerListing?: OwnerListingState; listingStatus: string }, now = Date.now()): ExpiryStep | null {
  const o = p.ownerListing;
  if (!o || !['pending_verification', 'active'].includes(p.listingStatus) || o.assignedBrokerId || o.matchedAt) return null;
  if (o.feeStatus !== 'PAID' || !o.liveUntil) return null;
  const left = Date.parse(o.liveUntil) - now;
  if (Number.isNaN(left)) return null;
  if (left < 0) return 'END';
  if (left <= DAY_MS) return o.expWarn === 1 ? null : 'WARN1';
  if (left <= 3 * DAY_MS) return o.expWarn ? null : 'WARN3';
  return null;
}

