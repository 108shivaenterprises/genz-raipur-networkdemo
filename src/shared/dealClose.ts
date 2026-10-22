/**
 * v47 — closing a deal room that did not happen, and a site visit that took place outside the app.
 *  - Close: one broker asks (with a reason); the other broker agrees, or nothing is said for CLOSE_AUTO_DAYS → the room closes.
 *    A one-broker deal (he is on both sides) closes at once. Either broker can reopen a closed room. Closing never ends the
 *    buyer protection, the owner's mandate or any dispute rule — those run on their own clocks.
 *  - Offline visit: when the visit happened before / outside the app (no OTP / QR possible), one side records it and the OTHER side
 *    confirms; then the deal may move to "Site Visit Done". It is shown as NOT verified and gives no buyer protection.
 */
export const CLOSE_AUTO_DAYS = 7;
export const CLOSE_REASONS = [
  { id: 'BUYER_BACKED_OUT', en: 'Buyer backed out', hi: 'खरीदार पीछे हट गया' },
  { id: 'PRICE_NOT_AGREED', en: 'Price not agreed', hi: 'कीमत पर बात नहीं बनी' },
  { id: 'OWNER_WITHDREW', en: 'Owner withdrew / sold elsewhere', hi: 'मालिक ने मना किया / कहीं और बेच दी' },
  { id: 'LOAN_PAPERS', en: 'Loan or papers problem', hi: 'लोन या कागज़ की दिक़्क़त' },
  { id: 'OTHER', en: 'Other', hi: 'अन्य' },
] as const;
export type CloseReason = typeof CLOSE_REASONS[number]['id'];

export interface DealClosure {
  status: 'ASKED' | 'CLOSED';
  reason: CloseReason; note?: string;
  byId: string; byName: string; askedAt: string; autoAt: string;
  closedAt?: string; how?: 'AGREED' | 'NO_REPLY' | 'ONE_BROKER';
  agreedById?: string;
}
export interface OfflineVisit {
  byId: string; byName: string; at: string; visitedOn: string; note: string;
  confirmedById?: string; confirmedByName?: string; confirmedAt?: string;
}
export const isClosed = (d: { closure?: DealClosure | null }) => d.closure?.status === 'CLOSED';
export const offlineVisitConfirmed = (d: { offlineVisit?: OfflineVisit | null }) => !!d.offlineVisit?.confirmedAt;
export const reasonText = (id: string, hi = false) => { const r = CLOSE_REASONS.find(x => x.id === id); return r ? (hi ? r.hi : r.en) : id; };
