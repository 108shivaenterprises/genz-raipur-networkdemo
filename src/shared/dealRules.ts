/**
 * v14 — pure rules for offers + token lock, sold / relist and data retention.
 * No server imports so the unit tests and the browser can use them.
 */
export const MAX_LIVE_OFFERS_PER_PROPERTY = 3;   // per buyer-side broker, per property
export const MAX_LIVE_OFFERS_PER_BROKER = 15;
export const MAX_COUNTER_ROUNDS = 3;
export const TOKEN_DUE_HOURS = 48;               // after the owner accepts, token must be received within this
export const TOKEN_DEFAULT_DAYS = 7;
export const TOKEN_MAX_DAYS = 30;
export const TOKEN_GRACE_DAYS = 3;               // after token validity ends, lock auto-releases if nobody acts
export const UNDO_SOLD_HOURS = 24;
/** v27 — a sold / rented listing stays on the network board with a SOLD badge for this many days (so nobody keeps chasing it). */
export const SOLD_VISIBLE_DAYS = 30;
/** Days after closing before personal data is erased. SOLD_PURGE_DAYS env var overrides it on the server (tests use a tiny value). */
export const SOLD_PURGE_DAYS: number = Number((globalThis as any).process?.env?.SOLD_PURGE_DAYS) || 90;

export const LIVE_OFFER = ['SUBMITTED', 'COUNTERED', 'ACCEPTED', 'BACKUP', 'TOKEN_HELD'] as const;
export const isLiveOffer = (s: string) => (LIVE_OFFER as readonly string[]).includes(s);

/** Offer amount plausibility against the asking price. Returns '' or an error text. */
export function checkOfferAmount(amount: number, asking: number, token: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return 'Offer amount must be greater than zero';
  if (asking > 0 && (amount < asking * 0.3 || amount > asking * 1.5)) return 'Offer is outside the plausible range for this listing (30%–150% of asking)';
  if (!Number.isFinite(token) || token < 0) return 'Token amount cannot be negative';
  if (token > amount) return 'Token cannot be more than the offer amount';
  return '';
}

export function validityHours(h: unknown): number {
  const n = Number(h ?? 72);
  return Number.isFinite(n) ? Math.min(168, Math.max(6, Math.round(n))) : 72;
}

/** Sale listings are "sold", rent / lease listings are "rented". */
export const closedStatusFor = (tx: string): 'sold' | 'rented' => (tx === 'Sale' ? 'sold' : 'rented');

/** Coarse price band for the anonymous market record (floor to ₹5 lakh, ₹25 lakh above ₹1 Cr). */
export function priceBand(price: number): string {
  if (!price || price <= 0) return 'n/a';
  const step = price >= 1e7 ? 2_500_000 : 500_000;
  const lo = Math.floor(price / step) * step;
  const fmt = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr` : `₹${Math.round(n / 1e5)} L`);
  return `${fmt(lo)} – ${fmt(lo + step)}`;
}

export const monthOf = (iso: string) => String(iso).slice(0, 7);
export const resaleKeyOf = (p: { city?: string; locality?: string; propertyType?: string; plotAreaSqFt?: number; builtUpAreaSqFt?: number }) =>
  [p.city, p.locality, p.propertyType, p.plotAreaSqFt || p.builtUpAreaSqFt || 0].map(x => String(x ?? '').trim().toLowerCase()).join('|');

export function canUndoSold(soldAtIso: string | undefined, now = Date.now()): boolean {
  return !!soldAtIso && now - Date.parse(soldAtIso) <= UNDO_SOLD_HOURS * 3600_000;
}
export function purgeDue(soldAtIso: string | undefined, now = Date.now(), days = SOLD_PURGE_DAYS): boolean {
  return !!soldAtIso && now - Date.parse(soldAtIso) > days * 86400_000;
}

/** Order BACKUP offers: earliest queue number first, ties → earlier creation. Expired ones are skipped. */
export function nextBackup<T extends { status: string; queueNo?: number; createdAt: string; validUntil: string }>(offers: T[], now = Date.now()): T | undefined {
  return offers.filter(o => o.status === 'BACKUP' && Date.parse(o.validUntil) > now)
    .sort((a, b) => (a.queueNo ?? 1e9) - (b.queueNo ?? 1e9) || a.createdAt.localeCompare(b.createdAt))[0];
}

/** Mask a buyer for the property side until the offer is accepted: first name only. */
export const firstName = (n: string) => String(n || '').trim().split(/\s+/)[0] || '';
export const buyerShown = (name: string, status: string) => (['ACCEPTED', 'TOKEN_HELD', 'CLOSED'].includes(status) ? name : firstName(name));

/** Milestone kinds the property owner may see (broker commission stays between the brokers). */
export const OWNER_VISIBLE_KINDS = ['AGREEMENT', 'PAYMENT', 'REGISTRY', 'POSSESSION', 'OTHER'];
