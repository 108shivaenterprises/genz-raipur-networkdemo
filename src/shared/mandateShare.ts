/**
 * v66 — what the owner's brokerage mandate gives the listing broker at the FINAL price (not only at the asking price).
 *   SURPLUS_ABOVE_NET : the owner keeps his net amount; the broker gets whatever is above it (never below 0)
 *   PERCENTAGE        : a % of the final price
 *   FIXED_FEE         : the same flat fee whatever the price
 * Pure; the mandate is confidential to the owner, the listing broker and GENZ admins, so callers show this only to them.
 */
export type MandateLike = { remunerationBasis: 'SURPLUS_ABOVE_NET' | 'PERCENTAGE' | 'FIXED_FEE'; approvedNetPrice?: number; agreedCommissionPct?: number; fixedFeeAmount?: number };

export function mandateShareAt(m: MandateLike, price: number) {
  const p = Math.max(0, Math.round(price));
  const net = m.approvedNetPrice || 0;
  let broker = m.remunerationBasis === 'PERCENTAGE' ? Math.round(p * (m.agreedCommissionPct || 0) / 100)
    : m.remunerationBasis === 'FIXED_FEE' ? Math.round(m.fixedFeeAmount || 0)
    : Math.max(0, p - net);
  broker = Math.min(broker, p); // a fee can never be more than the price itself
  const owner = Math.max(0, p - broker);
  /** the price did not even reach the owner's net: the broker gets nothing and the owner must agree to a lower amount */
  const belowNet = m.remunerationBasis === 'SURPLUS_ABOVE_NET' && p < net;
  return { broker, owner, belowNet };
}
