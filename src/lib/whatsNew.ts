/** v182 — "What's new": one dismissible card per app version. Add a NEW entry at the TOP of the list for every release (max 3 bullets per language). */
export interface WhatsNewEntry { version: string; en: string[]; hi: string[]; /** v184 — the owner's own list (an owner has no offline queue or client follow-ups) */ owner?: { en: string[]; hi: string[] } }
export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: '2026.11.22',
    owner: { en: ['Your listing now shows when it was last confirmed.', 'Brokers can report wrong info or a sold home — you are told and can tap “still available”.', 'Quiet hours: no automatic alerts between 9 PM and 8 AM.'], hi: ['आपकी लिस्टिंग पर अब दिखता है कि वह आख़िरी बार कब कन्फर्म हुई।', 'ब्रोकर गलत जानकारी या बिक चुके घर की रिपोर्ट कर सकते हैं — आपको बताया जाएगा, और आप “अभी भी उपलब्ध” दबा सकते हैं।', 'शांत घंटे: रात 9 से सुबह 8 बजे तक कोई ऑटो अलर्ट नहीं।'] },
    en: ['Every listing now says when it was last confirmed, and you can report a wrong or sold listing in one tap.', 'No automatic alerts between 9 PM and 8 AM.', 'The app now copes better when your internet drops.'],
    hi: ['हर लिस्टिंग पर अब लिखा है कि वह कब कन्फ़र्म हुई, और ग़लत या बिकी लिस्टिंग एक टैप में बता सकते हैं।', 'रात 9 से सुबह 8 बजे तक कोई अपने-आप वाला अलर्ट नहीं आएगा।', 'इंटरनेट कमज़ोर होने पर ऐप अब बेहतर चलता है।'],
  },
];
export const LATEST_VERSION = WHATS_NEW[0].version;
const key = (userId: string) => `genz.whatsnew.${userId}`;
export const seenVersion = (userId: string): string | null => { try { return localStorage.getItem(key(userId)); } catch { return null; } };
export const markSeen = (userId: string, v = LATEST_VERSION) => { try { localStorage.setItem(key(userId), v); } catch { /* storage blocked */ } };
/** show only when the person has seen an older version — or nothing, but the account is older than 3 days (a brand-new account sees the first-run checklist instead) */
export function shouldShowWhatsNew(seen: string | null, latest: string, createdAt: string | undefined, now = Date.now()): boolean {
  if (seen === latest) return false;
  if (seen) return true;
  const t = Date.parse(createdAt || ''); return Number.isFinite(t) && now - t > 3 * 86_400_000;
}
