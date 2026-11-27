/** D23 — a broker's badge, DERIVED (nothing stored) from his existing tier plus verified visits and closed deals. One config object holds every threshold.
 *  Tier 2 = Verified, Tier 1 = Pro (the labels say nothing about RERA: the tier rules already cover that); Gold and Diamond are earned by work done on GENZ. */
export type BadgeKey = 'VERIFIED' | 'PRO' | 'GOLD' | 'DIAMOND';
export const BADGE_CONFIG = {
  GOLD: { visits: 10, deals: 3 },
  DIAMOND: { visits: 30, deals: 10 },
  LABELS: {
    VERIFIED: { en: 'Verified', hi: 'वेरिफ़ाइड' }, PRO: { en: 'Pro', hi: 'प्रो' }, GOLD: { en: 'Gold', hi: 'गोल्ड' }, DIAMOND: { en: 'Diamond', hi: 'डायमंड' },
  } as Record<BadgeKey, { en: string; hi: string }>,
};
export function badgeFor(i: { tier: 'TIER1' | 'TIER2' | null | undefined; verifiedVisits: number; closedDeals: number }): BadgeKey | null {
  if (!i.tier) return null;
  const { GOLD, DIAMOND } = BADGE_CONFIG;
  if (i.verifiedVisits >= DIAMOND.visits && i.closedDeals >= DIAMOND.deals) return 'DIAMOND';
  if (i.verifiedVisits >= GOLD.visits && i.closedDeals >= GOLD.deals) return 'GOLD';
  return i.tier === 'TIER1' ? 'PRO' : 'VERIFIED';
}
