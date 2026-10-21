import { UserProfile, DealRoom, SiteVisit, TrustTier, TrustScoreDetails } from '../types/index.js';

/**
 * Calculates a broker's deterministic Trust Score (0-100) based on:
 * 1. Base credential verification (RERA registration + Admin KYC check)
 * 2. Completed / closed deals and settled co-broking agreements
 * 3. OTP / GPS verified physical site visits
 * 4. Active dispute record
 */
export function calculateTrustScoreForUser(
  user: UserProfile,
  deals: DealRoom[] = [],
  visits: SiteVisit[] = []
): TrustScoreDetails {
  if (user.role !== 'BROKER') {
    const isVerified = user.verificationStatus === 'VERIFIED';
    return {
      score: isVerified ? 85 : 30,
      tier: isVerified ? 'GOLD' : 'NEW',
      completedDeals: 0,
      verifiedSiteVisits: 0,
    };
  }

  // Count completed/settled deals for this broker (Introducing or Closing Broker)
  const completedDeals = deals.filter(
    (d) =>
      (d.introducingBrokerId === user.id || d.closingBrokerId === user.id) &&
      (d.stage === 'Settled' ||
        d.stage === 'Handover' ||
        d.stage === 'Agreement' ||
        d.settlementStatus === 'PAID' ||
        d.settlementStatus === 'AGREED')
  ).length;

  // Count verified physical site visits for this broker
  const verifiedSiteVisits = visits.filter(
    (v) =>
      (v.brokerId === user.id ||
        deals.some(
          (d) =>
            d.id === v.dealRoomId &&
            (d.introducingBrokerId === user.id || d.closingBrokerId === user.id)
        )) &&
      v.isVerified
  ).length;

  // Base points by credential validation
  let basePoints = 0;
  if (user.verificationStatus === 'VERIFIED') {
    basePoints = user.reraNumber ? 50 : 40;
  } else if (user.verificationStatus === 'PENDING') {
    basePoints = 20;
  } else if (user.verificationStatus === 'BLACKLISTED') {
    return {
      score: 0,
      tier: 'NEW',
      completedDeals,
      verifiedSiteVisits,
    };
  }

  // Points earned:
  // Each completed or agreed deal: +15 points (max 40 pts from deals)
  // Each verified OTP site visit: +8 points (max 30 pts from visits)
  const dealPoints = Math.min(completedDeals * 15, 40);
  const visitPoints = Math.min(verifiedSiteVisits * 8, 30);

  let rawScore = basePoints + dealPoints + visitPoints;
  if (rawScore > 100) rawScore = 100;
  if (rawScore < 0) rawScore = 0;

  // Determine Tier
  let tier: TrustTier = 'NEW';
  if (rawScore >= 88) {
    tier = 'PLATINUM';
  } else if (rawScore >= 72) {
    tier = 'GOLD';
  } else if (rawScore >= 50) {
    tier = 'SILVER';
  } else if (rawScore >= 25) {
    tier = 'BRONZE';
  } else {
    tier = 'NEW';
  }

  return {
    score: rawScore,
    tier,
    completedDeals,
    verifiedSiteVisits,
    lastUpdated: new Date().toISOString(),
  };
}

export interface TrustBadgeConfig {
  label: string;
  shortLabel: string;
  description: string;
  badgeClass: string;
  pillClass: string;
  iconBg: string;
  borderColor: string;
  starColor: string;
}

export function getTrustTierBadgeConfig(tier?: TrustTier): TrustBadgeConfig {
  switch (tier) {
    case 'PLATINUM':
      return {
        label: 'Platinum Elite Broker',
        shortLabel: 'Platinum',
        description: 'Top-tier broker with 2+ closed deals and multiple verified site inspections.',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-200',
        pillClass: 'bg-emerald-600 text-white',
        iconBg: 'bg-emerald-100 text-emerald-700',
        borderColor: 'border-emerald-300',
        starColor: 'text-emerald-600',
      };
    case 'GOLD':
      return {
        label: 'Gold Verified Partner',
        shortLabel: 'Gold',
        description: 'Proven closer with verified physical site visits and agreed co-broking contracts.',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-300 ring-1 ring-amber-200',
        pillClass: 'bg-amber-600 text-white',
        iconBg: 'bg-amber-100 text-amber-700',
        borderColor: 'border-amber-300',
        starColor: 'text-amber-500',
      };
    case 'SILVER':
      return {
        label: 'Silver Associate',
        shortLabel: 'Silver',
        description: 'Active certified broker with verified site visits and active deal pipeline.',
        badgeClass: 'bg-sky-50 text-sky-800 border-sky-300 ring-1 ring-sky-200',
        pillClass: 'bg-sky-600 text-white',
        iconBg: 'bg-sky-100 text-sky-700',
        borderColor: 'border-sky-300',
        starColor: 'text-sky-500',
      };
    case 'BRONZE':
      return {
        label: 'Bronze Partner',
        shortLabel: 'Bronze',
        description: 'RERA-registered partner commencing transactions on the exchange.',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-300 ring-1 ring-slate-200',
        pillClass: 'bg-slate-600 text-white',
        iconBg: 'bg-slate-200 text-slate-700',
        borderColor: 'border-slate-300',
        starColor: 'text-slate-500',
      };
    default:
      return {
        label: 'New Member',
        shortLabel: 'New',
        description: 'Newly registered broker undergoing initial deal onboarding.',
        badgeClass: 'bg-zinc-100 text-zinc-600 border-zinc-200',
        pillClass: 'bg-zinc-500 text-white',
        iconBg: 'bg-zinc-200 text-zinc-500',
        borderColor: 'border-zinc-200',
        starColor: 'text-zinc-400',
      };
  }
}
