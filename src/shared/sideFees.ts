/**
 * v41 — "Apna-apna side": the buyer-side broker and the seller-side broker each keep the brokerage of THEIR OWN client.
 * Nothing is shared between them, so there is no split %, no "other broker confirms my payment" and no total brokerage.
 * Pure rules used by the server (sides.ts) and the screens.
 */
export type FeeMode = 'SPLIT' | 'OWN_SIDE';
export type DealSide = 'SELLER' | 'BUYER';

export const MAX_SIDE_FEE = 5_000_000_000;

export const SIDE_UNDERTAKING = {
  en: 'I will take brokerage only from my own client. I will not deal directly with the other broker\'s client, and the 30-day protection of this deal room applies to me as well. GENZ does not hold or move any of this money.',
  hi: 'मैं सिर्फ़ अपने क्लाइंट से ब्रोकरेज लूँगा। दूसरे ब्रोकर के क्लाइंट से सीधे डील नहीं करूँगा, और इस डील रूम की 30 दिन की सुरक्षा मुझ पर भी लागू है। GENZ इस पैसे को न रखता है, न भेजता है।',
} as const;

export const otherSide = (s: DealSide): DealSide => (s === 'SELLER' ? 'BUYER' : 'SELLER');

/** the side the proposer must act for, given who lists the property. null = no conflict. Returns an error text when it contradicts the listing. */
export function checkProposerSide(side: DealSide, proposerId: string, receiverId: string, listingBrokerId?: string): string | null {
  if (!listingBrokerId) return null;
  if (listingBrokerId === proposerId && side !== 'SELLER') return 'You list this property, so you are the seller-side broker.';
  if (listingBrokerId === receiverId && side !== 'BUYER') return 'The other broker lists this property, so he is the seller-side broker and you act for the buyer.';
  return null;
}

/** a fee must be a whole rupee amount, 1 .. MAX_SIDE_FEE */
export function validSideFee(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && Number.isInteger(n) && n > 0 && n <= MAX_SIDE_FEE;
}

export interface SideDealLike {
  feeMode?: FeeMode;
  introducingBrokerId: string;
  closingBrokerId: string;
  sellerBrokerId?: string;
  buyerBrokerId?: string;
  sideFees?: Record<string, { amount: number }>;
  sideUndertaking?: Record<string, string>;
  sideReceipts?: Record<string, { total: number }>;
}

export const isOwnSide = (d: { feeMode?: FeeMode }) => d.feeMode === 'OWN_SIDE';
export const sideOf = (d: SideDealLike, userId: string): DealSide | undefined =>
  d.sellerBrokerId === userId ? 'SELLER' : d.buyerBrokerId === userId ? 'BUYER' : undefined;
export const otherBrokerOf = (d: SideDealLike, userId: string) => (d.introducingBrokerId === userId ? d.closingBrokerId : d.introducingBrokerId);
export const feeOf = (d: SideDealLike, userId: string) => d.sideFees?.[userId]?.amount ?? 0;
/** both brokers signed the "own client only" undertaking (a one-broker deal needs only that one signature) */
export const undertakingDone = (d: SideDealLike) => [d.introducingBrokerId, d.closingBrokerId].every(id => !!d.sideUndertaking?.[id]);
/** a broker is done when he wrote his fee and the received total reaches it */
export const brokerDone = (d: SideDealLike, id: string) => feeOf(d, id) > 0 && (d.sideReceipts?.[id]?.total ?? 0) >= feeOf(d, id);
export const allSidesDone = (d: SideDealLike) => [d.introducingBrokerId, d.closingBrokerId].every(id => brokerDone(d, id));
/** the fee a viewer may count on this deal: his own side for an own-side deal, else the shared total */
export const feeFor = (d: SideDealLike & { totalCommissionExpected?: number }, userId: string) => (isOwnSide(d) ? feeOf(d, userId) : d.totalCommissionExpected || 0);
