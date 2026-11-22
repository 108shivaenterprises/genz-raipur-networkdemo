/** v182 — "What's new": one dismissible card per app version. Add a NEW entry at the TOP of the list for every release (max 3 bullets per language). */
export interface WhatsNewEntry { version: string; en: string[]; hi: string[] }
export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: '2026.11.22',
    en: ['Faster, safer sign-in code flow; the back button and the offline queue (per user) now work properly.', 'Every listing shows “confirmed N days ago” — and you can report “wrong info / already sold” in one tap.', 'Quiet hours: no automatic bot messages or marketing alerts between 9 PM and 8 AM.'],
    hi: ['साइन-इन कोड तेज़ और सुरक्षित; बैक बटन और ऑफ़लाइन कतार (हर यूज़र की अलग) अब ठीक चलते हैं।', 'हर लिस्टिंग पर “N दिन पहले कन्फर्म” दिखता है — और “गलत जानकारी / बिक चुकी” एक टैप में रिपोर्ट करें।', 'शांत घंटे: रात 9 से सुबह 8 बजे तक कोई ऑटो बॉट संदेश या प्रचार अलर्ट नहीं।'],
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
