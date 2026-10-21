/**
 * v15 — pure rules for the 2-tier network, vouching, tie-ups and the city target.
 * No server imports so the unit tests and the browser can use them.
 *
 *  Tier 1 — RERA badge: registered agencies / primary channel partners. May partner on builder projects (RERA law covers agents
 *           who sell registered projects) and hold units.
 *  Tier 2 — Local Verified Associate: no RERA needed. v18: enters ONLY through a RERA-registered (Tier 1) sponsor who registers
 *           them (one sponsor is enough — SPONSORS_NEEDED), plus a phone-bound invitation, a local reference, and the member's
 *           own PAN + Aadhaar (last 4 kept) that a GENZ admin must have SEEN before approval. A Tier 2 member can never sponsor.
 *           Resale / rental / land / local inventory only, with a 30-day probation (smaller caps).
 *           GENZ does not call this "RERA verified" anywhere.
 */
export type Tier = 'TIER1' | 'TIER2';
export const PROBATION_DAYS = 30;
export const PROBATION_LIVE_LISTINGS = 5;
export const PROBATION_LIVE_OFFERS = 3;
export const SPONSORS_NEEDED = 1;              // v18: distinct RERA-registered (Tier 1) sponsors needed to bring a local associate in. Set 2 to ask for a second one.
export const VOUCHES_NEEDED = SPONSORS_NEEDED; // (old name kept so older code / screens keep compiling)
export const VOUCHES_PER_MONTH = 2;            // per member, calendar month
export const CAPTAIN_VOUCHES_PER_MONTH = 10;
export const VOUCH_STRIKE_LIMIT = 2;           // strikes before the right to vouch is paused
export const VOUCH_BAN_DAYS = 180;
export const APPLICATION_DAYS = 14;            // an open application / invitation expires after this
export const MAX_OPEN_APPLICATIONS = 10;       // per proposer

export const SHARE_MIN = 10;
export const SHARE_MAX = 90;
export const TIEUP_DEFAULT_DAYS = 180;
export const TIEUP_MAX_DAYS = 365;
export const MAX_OPEN_PROPOSALS = 20;
export const MAX_ACTIVE_TIEUPS = 50;
export const PROPOSAL_DAYS = 14;               // an unanswered proposal lapses
export const CITY_TARGET_ACTIVE = 300;         // active brokers a city needs before it counts as "dense"

export const TIER_LABEL = {
  TIER1: { en: 'RERA no. on file', hi: 'RERA नंबर दर्ज' },
  TIER2: { en: 'Local Associate (vouched)', hi: 'लोकल एसोसिएट (वाउच्ड)' },
} as const;

export const SCOPE_KINDS = ['RESALE', 'RENTAL', 'LAND', 'NEW_PROJECT', 'COMMERCIAL', 'ANY'] as const;
export type ScopeKind = typeof SCOPE_KINDS[number];

export function tierOf(u: { role?: string; tier?: string; reraNumber?: string }): Tier | null {
  if (u.role !== 'BROKER') return null;
  if (u.tier === 'TIER1' || u.tier === 'TIER2') return u.tier;
  return u.reraNumber ? 'TIER1' : 'TIER2';
}

export function inProbation(u: { probationUntil?: string }, now = Date.now()): boolean {
  return !!u.probationUntil && Date.parse(u.probationUntil) > now;
}

export function monthKey(iso: string): string { return iso.slice(0, 7); }

/** Two accounts that look like the same party (same phone / same company) cannot vouch for each other. */
export function sameParty(a: { phone?: string; companyName?: string }, b: { phone?: string; companyName?: string }): boolean {
  const d = (s?: string) => String(s ?? '').replace(/\D/g, '').slice(-10);
  if (d(a.phone) && d(a.phone) === d(b.phone)) return true;
  const ca = (a.companyName || '').trim().toLowerCase(); const cb = (b.companyName || '').trim().toLowerCase();
  return !!ca && ca === cb;
}

export function splitOk(introPct: number): string {
  if (!Number.isFinite(introPct) || !Number.isInteger(introPct)) return 'Share must be a whole number';
  if (introPct < SHARE_MIN || introPct > SHARE_MAX) return `Share must be between ${SHARE_MIN}% and ${SHARE_MAX}%`;
  return '';
}
export function tieupDays(d: unknown): number {
  const n = Number(d ?? TIEUP_DEFAULT_DAYS);
  return Number.isFinite(n) ? Math.min(TIEUP_MAX_DAYS, Math.max(7, Math.round(n))) : TIEUP_DEFAULT_DAYS;
}
