/**
 * v18 — pure ID rules (PAN shape, Aadhaar checksum) + the sponsor rule for the RERA-sponsored entry of local associates.
 * No server imports: the server, the browser and the unit tests all use the same code.
 *
 * Aadhaar: GENZ checks the number (12 digits, first digit 2–9, Verhoeff check digit) ONCE when it is typed in, keeps only
 *          the LAST 4 digits and throws the rest away. The full number is never stored, logged, audited or returned.
 *          (The Aadhaar Act and UIDAI rules restrict private entities from storing the full number, and mandatory Aadhaar for a
 *          private platform is legally thin — so the real check is a GENZ admin SEEING the card, recorded as "ID seen".)
 */

/** AAAAA9999A — 4th letter is the holder type. Format only; an admin checks authenticity on the income-tax portal. */
export const PAN_RE = /^[A-Z]{3}[PCFHATBLJG][A-Z][0-9]{4}[A-Z]$/;
export const normPan = (v: unknown) => String(v ?? '').replace(/\s+/g, '').toUpperCase();
export const isValidPan = (pan: string) => PAN_RE.test(pan);

// ── Verhoeff (the checksum Aadhaar uses) ──
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** true when the digit string (check digit included) passes the Verhoeff check */
export function verhoeffValid(num: string): boolean {
  if (!/^\d+$/.test(num)) return false;
  let c = 0;
  const rev = num.split('').reverse().map(Number);
  for (let i = 0; i < rev.length; i++) c = D[c][P[i % 8][rev[i]]];
  return c === 0;
}
/** the check digit to append to `body` (used by the tests to build valid numbers) */
export function verhoeffCheckDigit(body: string): number {
  let c = 0;
  const rev = body.split('').reverse().map(Number);
  for (let i = 0; i < rev.length; i++) c = D[c][P[(i + 1) % 8][rev[i]]];
  return INV[c];
}

export const normAadhaar = (v: unknown) => String(v ?? '').replace(/[\s-]+/g, '');
/** 12 digits, not starting with 0 or 1, valid Verhoeff check digit */
export function isValidAadhaar(n: string): boolean {
  return /^[2-9]\d{11}$/.test(n) && verhoeffValid(n);
}
export const aadhaarLast4 = (n: string) => n.slice(-4);
/** what screens show: never more than the last 4 */
export const maskAadhaar = (last4?: string) => (last4 && /^\d{4}$/.test(last4) ? `XXXX XXXX ${last4}` : '');

/** Who may register (sponsor) a local associate: a verified broker whose RERA registration is on file (Tier 1). */
export function isSponsorEligible(u: { role?: string; tier?: string; reraNumber?: string; verificationStatus?: string } | undefined | null): boolean {
  if (!u || u.role !== 'BROKER' || u.verificationStatus !== 'VERIFIED') return false;
  const tier = u.tier === 'TIER1' || u.tier === 'TIER2' ? u.tier : (u.reraNumber ? 'TIER1' : 'TIER2');
  return tier === 'TIER1';
}

/** Hindi + English one-liners shared by the join screen and the invitation text */
export const AADHAAR_NOTE = {
  en: 'GENZ checks the number. With your tick below it is kept encrypted, away from your profile, and only the GENZ superadmin can open it — with a written reason that is recorded and shown to you. Without your tick only the last 4 digits are kept.',
  hi: 'GENZ नंबर जाँचता है। नीचे आपके टिक करने पर वह एन्क्रिप्ट होकर, आपकी प्रोफ़ाइल से अलग रखा जाता है और सिर्फ़ GENZ का सुपरएडमिन उसे खोल सकता है — लिखित कारण के साथ, जो दर्ज होता है और आपको दिखता है। टिक न करने पर सिर्फ़ आख़िरी 4 अंक रखे जाते हैं।',
} as const;

// ───────────────────────── v19 — say WHY a PAN / Aadhaar is refused ─────────────────────────
export interface IdProblem { code: string; en: string; hi: string }

/** null when the PAN is fine (or empty — the caller decides whether empty is allowed). Otherwise the exact reason, in English + Hindi. */
export function panProblem(raw: unknown): IdProblem | null {
  const p = normPan(raw);
  if (!p) return null;
  if (p.length < 10) return { code: 'PAN_SHORT', en: `A PAN has 10 characters — you have typed ${p.length}.`, hi: `PAN में 10 अक्षर / अंक होते हैं — आपने ${p.length} लिखे हैं।` };
  if (p.length > 10) return { code: 'PAN_LONG', en: `A PAN has 10 characters — you have typed ${p.length}.`, hi: `PAN में 10 अक्षर / अंक होते हैं — आपने ${p.length} लिखे हैं।` };
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p)) return { code: 'PAN_SHAPE', en: 'A PAN looks like ABCPD1234E: 5 letters, then 4 digits, then 1 letter.', hi: 'PAN ऐसा दिखता है — ABCPD1234E: पहले 5 अक्षर, फिर 4 अंक, फिर 1 अक्षर।' };
  if (!isValidPan(p)) return { code: 'PAN_TYPE', en: `The 4th character of a PAN says who holds it and must be P (person), C, F, H, A, T, B, L, J or G — yours has “${p[3]}”. A person’s PAN has P, e.g. ABCPD1234E.`, hi: `PAN का 4था अक्षर बताता है कि PAN किसका है — वह P (व्यक्ति), C, F, H, A, T, B, L, J या G होना चाहिए — आपके PAN में “${p[3]}” है। व्यक्ति के PAN में P होता है, जैसे ABCPD1234E।` };
  return null;
}

/** null when the Aadhaar is fine (or empty). Otherwise the exact reason. The number itself is never echoed back. */
export function aadhaarProblem(raw: unknown): IdProblem | null {
  const n = normAadhaar(raw);
  if (!n) return null;
  if (!/^\d+$/.test(n)) return { code: 'AADHAAR_DIGITS', en: 'An Aadhaar number has only digits.', hi: 'आधार नंबर में सिर्फ़ अंक होते हैं।' };
  if (n.length < 12) return { code: 'AADHAAR_SHORT', en: `An Aadhaar number has 12 digits — you have typed ${n.length}.`, hi: `आधार नंबर में 12 अंक होते हैं — आपने ${n.length} लिखे हैं।` };
  if (n.length > 12) return { code: 'AADHAAR_LONG', en: `An Aadhaar number has 12 digits — you have typed ${n.length}.`, hi: `आधार नंबर में 12 अंक होते हैं — आपने ${n.length} लिखे हैं।` };
  if (!/^[2-9]/.test(n)) return { code: 'AADHAAR_FIRST', en: 'An Aadhaar number never starts with 0 or 1.', hi: 'आधार नंबर कभी 0 या 1 से शुरू नहीं होता।' };
  if (!verhoeffValid(n)) return { code: 'AADHAAR_CHECK', en: 'These 12 digits do not pass the Aadhaar check — one digit is probably mistyped. Compare with the card.', hi: 'ये 12 अंक आधार की जाँच में पास नहीं होते — कोई अंक ग़लत टाइप हुआ लगता है। कार्ड से मिलाएँ।' };
  return null;
}

/** last 4 digits typed by a sponsor (optional hint) */
export const isLast4 = (v: unknown) => /^\d{4}$/.test(String(v ?? '').trim());

// ── scanned ID copies (PAN card / masked Aadhaar) ──
export const ID_DOC_KINDS = ['PAN', 'AADHAAR'] as const;
export type IdDocKind = (typeof ID_DOC_KINDS)[number];
export const ID_DOC_MAX_BYTES = 3 * 1024 * 1024;
/** a scan is deleted this many days after the GENZ team has decided on it (kept only as long as it is needed for the check) */
export const ID_DOC_RETENTION_DAYS = 90;
/** a request that was withdrawn / rejected / expired never became an account: its scans go after this many days */
export const ID_DOC_ORPHAN_DAYS = 14;
export const ID_DOC_LABEL: Record<IdDocKind, { en: string; hi: string }> = {
  PAN: { en: 'PAN card (photo / PDF)', hi: 'PAN कार्ड (फ़ोटो / PDF)' },
  AADHAAR: { en: 'Aadhaar card — MASKED copy (photo / PDF)', hi: 'आधार कार्ड — मास्क्ड कॉपी (फ़ोटो / PDF)' },
};
export const ID_DOC_NOTE = {
  en: 'Upload the MASKED Aadhaar (first 8 digits hidden — download “Masked Aadhaar” from myAadhaar.uidai.gov.in, or cover the number with paper before the photo). Only the GENZ ID-review team can open these copies, every opening is logged, and they are deleted 90 days after the check or when you ask.',
  hi: 'आधार की MASKED कॉपी डालें (पहले 8 अंक छिपे हुए — myAadhaar.uidai.gov.in से “Masked Aadhaar” डाउनलोड करें, या फ़ोटो से पहले नंबर काग़ज़ से ढक दें)। इन कॉपी को सिर्फ़ GENZ की ID-जाँच टीम खोल सकती है, हर बार खुलना दर्ज होता है, और जाँच के 90 दिन बाद या आपके कहने पर ये हटा दी जाती हैं।',
} as const;
