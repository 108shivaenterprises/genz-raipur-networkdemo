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

// ───────────────────────────── v82 — the share follows the deal; edits are told to the shop; late payment has a cost ─────────────────────────────
/**
 * The shop's share is worked out by the app from the linked deal (final price + the owner's mandate + the broker's own fee plan in the deal's
 * हिसाब), so nobody types a number. If the broker changes it anyway (or there is no deal in the app and he types his brokerage), the shop is told:
 * the old and the new amount, and the broker's reason. The shop can say "ठीक है" or "सही नहीं" (→ GENZ desk), ask the broker, or ask the customer.
 */
export type ShareChangeBy = 'DEAL' | 'BROKER_EDIT' | 'TYPED' | 'REVISED';
export type ShareChangeStatus = 'PENDING' | 'OK' | 'DISPUTED';
export const SHARE_CHANGE_LABEL: Record<ShareChangeBy, { en: string; hi: string }> = {
  DEAL: { en: 'The deal changed', hi: 'डील में बदलाव हुआ' },
  BROKER_EDIT: { en: 'The broker changed his brokerage', hi: 'ब्रोकर ने अपनी ब्रोकरेज बदली' },
  TYPED: { en: 'The broker wrote his brokerage (this deal is not in the app)', hi: 'ब्रोकर ने ब्रोकरेज ख़ुद लिखी (यह डील ऐप में नहीं चली)' },
  REVISED: { en: 'The broker corrected the share', hi: 'ब्रोकर ने हिस्सा सुधारा' },
};
export const SHARE_LIMITS = { keep: 20, mergeMinutes: 30, reasonMin: 3 } as const;

export type PartnerPayMode = 'UPI' | 'BANK' | 'CASH';
export const PAY_MODES: { id: PartnerPayMode; en: string; hi: string }[] = [
  { id: 'UPI', en: 'UPI', hi: 'UPI' }, { id: 'BANK', en: 'Bank transfer', hi: 'बैंक ट्रांसफ़र' }, { id: 'CASH', en: 'Cash (the shop must confirm)', hi: 'नकद (दुकान वाले की पुष्टि ज़रूरी)' },
];
/** a UPI / bank payment needs its reference (UTR / transaction id); cash needs only the shop's own "received" */
export const refOk = (mode: PartnerPayMode, ref: string) => mode === 'CASH' || /^[A-Za-z0-9][A-Za-z0-9 \-\/_.,#:]{5,59}$/.test(ref);

/** what happens when the share is not paid after the deal is done */
export const OVERDUE = { remindDays: [3, 7, 12], pauseDays: 15, deskDays: 30 } as const;
const DAY = 86_400_000;
export const daysSince = (iso: string | undefined, nowMs = Date.now()) => (iso ? Math.max(0, Math.floor((nowMs - Date.parse(iso)) / DAY)) : 0);
/** how many days the share has been unpaid (0 when paid / nothing due) */
export function unpaidDays(l: { won?: { at: string }; payout?: { status: PayoutStatus } }, nowMs = Date.now()): number {
  return l.won && l.payout && (l.payout.status === 'DUE' || l.payout.status === 'NOT_RECEIVED') ? daysSince(l.won.at, nowMs) : 0;
}

/** "paid on time" record of one broker towards his shop partners: settled within pauseDays = on time */
export function payRecord(leads: { won?: { at: string }; payout?: { status: PayoutStatus; paidAt?: string } }[], nowMs = Date.now()) {
  let onTime = 0, late = 0, overdue = 0, open = 0;
  for (const l of leads) {
    if (!l.won || !l.payout) continue;
    const wonMs = Date.parse(l.won.at); if (Number.isNaN(wonMs)) continue;
    if (l.payout.status === 'PAID' || l.payout.status === 'RECEIVED') {
      const paidMs = Date.parse(l.payout.paidAt || '') || wonMs;
      if (paidMs - wonMs <= OVERDUE.pauseDays * DAY) onTime++; else late++;
    } else if (nowMs - wonMs > OVERDUE.pauseDays * DAY) overdue++; else open++;
  }
  const counted = onTime + late + overdue;
  return { onTime, late, overdue, open, counted };
}
export const payRecordText = (r: { onTime: number; counted: number }, hi = false) => (r.counted > 0
  ? (hi ? `दुकान पार्टनर को समय पर हिस्सा: ${r.counted} में से ${r.onTime}` : `Shop partners paid on time: ${r.onTime} of ${r.counted}`) : '');

/** the customer's one-tap answer ("did you take a property through this broker?") — asked by SMS, only if he agreed to it on the QR page */
export const ASK_LIMITS = { perLead: 2, gapHours: 24, validDays: 7 } as const;
export const OUTCOME_CONSENT = {
  hi: 'वैकल्पिक: मैं सहमत हूँ कि GENZ मुझे एक SMS भेजकर पूछ सकता है कि बात आगे बढ़ी या नहीं।',
  en: 'Optional: I agree that GENZ may send me one SMS asking whether it went ahead.',
};

/** audit F4 — words that say nothing about WHICH area it is ("Nagar", "Colony", "Naya"…): they never make two areas "the same" */
export const AREA_STOP_WORDS = new Set(['nagar', 'ngr', 'colony', 'road', 'marg', 'vihar', 'sector', 'phase', 'ward', 'para', 'chowk', 'enclave', 'extension', 'layout', 'society', 'city', 'town', 'gram', 'gaon', 'naya', 'nava', 'purana', 'main', 'east', 'west', 'north', 'south', 'near', 'block', 'mohalla', 'basti', 'नगर', 'कॉलोनी', 'रोड', 'नया']);
/**
 * the customer's area words vs the home's area (both already lower-cased / cleaned): the same name, or one shared
 * distinctive whole word (4+ letters, not a generic word, not the city's own name). "Shankar Nagar" ≠ "Ram Nagar"; "Naya Raipur" ≠ any Raipur home.
 */
export function areaWordsMatch(lead: string, home: string, city = ''): boolean {
  if (!lead) return false;
  if (lead === home) return true;
  const cityWords = new Set(city.split(' ')); const homeWords = new Set(home.split(' '));
  return lead.split(' ').some(w => w.length >= 4 && !AREA_STOP_WORDS.has(w) && !cityWords.has(w) && homeWords.has(w));
}
