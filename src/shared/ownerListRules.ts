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

export type ListFeeStatus = 'FREE' | 'PENDING' | 'WAITING_CONFIRM' | 'PAID' | 'REJECTED' | 'WAIVED_BROKER' | 'EXPIRED';
export interface OwnerListingState {
  planId: string; planName: string; fee: number; durationDays: number; refundable: boolean;
  feeStatus: ListFeeStatus;
  /** payment the owner wrote (UTR) — GENZ staff confirms it */
  ref?: string; paidOn?: string; payNote?: string; rejectNote?: string;
  confirmedById?: string; confirmedAt?: string;
  /** in the broker pool (visible, never matched) */
  liveFrom?: string; liveUntil?: string;
  /** the broker the owner chose; the listing is matched only after his mandate is signed */
  assignedBrokerId?: string; assignedAt?: string;
  requests: { brokerId: string; brokerName: string; note?: string; at: string }[];
  matchedAt?: string;
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
