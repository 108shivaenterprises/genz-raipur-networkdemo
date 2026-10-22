/**
 * v46 — Shop QR partners ("referral partners"): a broker's own shopkeepers / guards who keep his QR at their counter.
 * Pure rules shared by the server and the screens.
 *
 *  - The cut is agreed when the QR is put up: separately for sale and for rent, either a % of the broker's OWN brokerage on that
 *    deal or a fixed ₹ per closed deal. Changing it needs both: the broker proposes, the partner accepts. A change applies to
 *    leads that come AFTER it — every lead keeps the terms it came in under.
 *  - A lead belongs to that partner for `lockDays` (default 180) from the scan. If the broker works that mobile number in that time
 *    (visit, client room, deal, buyer protection, client card) GENZ links it to the lead — marking it "lost" does not hide it.
 *  - GENZ never holds this money: the broker pays the partner directly; GENZ records "paid" / "received" / "not received".
 */
export type CutMode = 'PCT' | 'FIXED';
export interface Cut { mode: CutMode; value: number }
export interface PartnerTerms { sale: Cut; rent: Cut; lockDays: number }
export type LeadKind = 'BUY' | 'RENT_IN' | 'SELL' | 'RENT_OUT';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'VISIT' | 'NEGOTIATION' | 'WON' | 'LOST';
export type PayoutStatus = 'DUE' | 'PAID' | 'RECEIVED' | 'NOT_RECEIVED';

export const PARTNER_LIMITS = {
  maxPct: 50, maxFixed: 10_00_000, minLockDays: 30, maxLockDays: 365, defaultLockDays: 180,
  partners: 300, devices: 2, sessionDays: 60, otpMinutes: 10, otpTries: 5, leadsPerQrPerDay: 60,
} as const;

export const DEFAULT_TERMS: PartnerTerms = { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: PARTNER_LIMITS.defaultLockDays };

export const LEAD_KINDS: { id: LeadKind; en: string; hi: string; side: 'SALE' | 'RENT' }[] = [
  { id: 'BUY', en: 'Wants to buy', hi: 'ख़रीदना है', side: 'SALE' },
  { id: 'RENT_IN', en: 'Wants to rent', hi: 'किराये पर चाहिए', side: 'RENT' },
  { id: 'SELL', en: 'Wants to sell', hi: 'बेचना है', side: 'SALE' },
  { id: 'RENT_OUT', en: 'Wants to give on rent', hi: 'किराये पर देना है', side: 'RENT' },
];
export const LEAD_STATUSES: { id: LeadStatus; en: string; hi: string }[] = [
  { id: 'NEW', en: 'New', hi: 'नई' },
  { id: 'CONTACTED', en: 'Spoke', hi: 'बात हुई' },
  { id: 'VISIT', en: 'Visit done', hi: 'विज़िट हुई' },
  { id: 'NEGOTIATION', en: 'Negotiation', hi: 'बातचीत' },
  { id: 'WON', en: 'Deal done', hi: 'डील हुई' },
  { id: 'LOST', en: 'Not going ahead', hi: 'आगे नहीं बढ़ी' },
];
export const PAYOUT_LABEL: Record<PayoutStatus, { en: string; hi: string }> = {
  DUE: { en: 'Partner’s share due', hi: 'पार्टनर का हिस्सा बाकी' },
  PAID: { en: 'Broker says paid', hi: 'ब्रोकर ने चुकाया बताया' },
  RECEIVED: { en: 'Partner confirmed received', hi: 'पार्टनर ने पाया माना' },
  NOT_RECEIVED: { en: 'Partner says NOT received', hi: 'पार्टनर: नहीं मिला' },
};

export const sideOfKind = (k: LeadKind) => LEAD_KINDS.find(x => x.id === k)!.side;

export function validCut(c: unknown): c is Cut {
  const x = c as Cut;
  if (!x || (x.mode !== 'PCT' && x.mode !== 'FIXED')) return false;
  if (typeof x.value !== 'number' || !Number.isFinite(x.value) || x.value <= 0) return false;
  return x.mode === 'PCT' ? x.value <= PARTNER_LIMITS.maxPct && Math.round(x.value * 10) === x.value * 10 : Number.isInteger(x.value) && x.value <= PARTNER_LIMITS.maxFixed;
}
/** returns an error text, or null when the terms are fine */
export function checkTerms(t: unknown): string | null {
  const x = t as PartnerTerms;
  if (!x || typeof x !== 'object') return 'Set the partner’s share for sale and for rent';
  if (!validCut(x.sale)) return `Sale share: a % between 0.1 and ${PARTNER_LIMITS.maxPct}, or a whole ₹ amount`;
  if (!validCut(x.rent)) return `Rent share: a % between 0.1 and ${PARTNER_LIMITS.maxPct}, or a whole ₹ amount`;
  if (!Number.isInteger(x.lockDays) || x.lockDays < PARTNER_LIMITS.minLockDays || x.lockDays > PARTNER_LIMITS.maxLockDays) return `Lead protection must be ${PARTNER_LIMITS.minLockDays}–${PARTNER_LIMITS.maxLockDays} days`;
  return null;
}
export const cleanTerms = (t: PartnerTerms): PartnerTerms => ({
  sale: { mode: t.sale.mode, value: t.sale.value }, rent: { mode: t.rent.mode, value: t.rent.value }, lockDays: t.lockDays,
});
export const sameTerms = (a: PartnerTerms, b: PartnerTerms) => JSON.stringify(cleanTerms(a)) === JSON.stringify(cleanTerms(b));

/** the partner's amount on a closed deal: % of the broker's own brokerage, or the fixed ₹ (never more than the brokerage) */
export function partnerAmount(cut: Cut, brokerage: number): number {
  const b = Math.max(0, Math.round(brokerage || 0));
  const v = cut.mode === 'PCT' ? Math.round(b * cut.value / 100) : Math.round(cut.value);
  return Math.min(v, b);
}

export const cutText = (c: Cut, hi = false) => (c.mode === 'PCT'
  ? (hi ? `ब्रोकरेज का ${c.value}%` : `${c.value}% of the brokerage`)
  : (hi ? `₹${c.value.toLocaleString('en-IN')} हर डील` : `₹${c.value.toLocaleString('en-IN')} per deal`));
export const termsText = (t: PartnerTerms, hi = false) => (hi
  ? `बिक्री: ${cutText(t.sale, true)} · किराया: ${cutText(t.rent, true)} · लीड ${t.lockDays} दिन तक आपकी`
  : `Sale: ${cutText(t.sale)} · Rent: ${cutText(t.rent)} · a lead stays yours for ${t.lockDays} days`);
