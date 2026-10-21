/**
 * Feature flags + plan. GENZ is FREE for everyone: every user has `plan: 'free'` and every flag below that is
 * a paid/sponsored idea is OFF. Nothing here renders a paywall or an upgrade prompt. When a premium tier is ever
 * wanted, flip a flag or add a plan → feature mapping here; no feature code has to change.
 */
import type { UserProfile } from './db.js';

export const FEATURE_FLAGS = {
  /** a clearly labelled "Sponsored" slot on project pages — data model exists, keep OFF */
  sponsoredSlots: false,
  /** extra seats / history for teams — not used */
  premiumTeams: false,
} as const;
export type FeatureName = keyof typeof FEATURE_FLAGS;

/** plan → features it unlocks on top of the flags above (empty: everyone gets everything that exists, free) */
export const PLAN_FEATURES: Record<string, FeatureName[]> = { free: [] };

export function featureOn(u: Pick<UserProfile, 'plan'> | null | undefined, f: FeatureName): boolean {
  if (FEATURE_FLAGS[f]) return true;
  return (PLAN_FEATURES[u?.plan || 'free'] || []).includes(f);
}
export const planOf = (u: Pick<UserProfile, 'plan'> | null | undefined) => u?.plan || 'free';
