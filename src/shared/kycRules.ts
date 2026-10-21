/**
 * v25 — KYC vault rules shared by the server, the browser and the tests (pure; no server imports).
 *
 * What the vault is: the member's full Aadhaar number and address, kept ENCRYPTED in a separate record (never on the user
 * object, never in lists, never in an export of other people, never in a log line). PAN stays where it always was (the user record,
 * masked everywhere except the review detail). Opening the vault is a SUPERADMIN-only act that needs a written reason, is
 * written to the audit trail and shows up in the member's own "who looked at my KYC" list.
 */
import { normAadhaar } from './idRules.js';

export const KYC_VAULT_VERSION = 'v1';

export const ADDRESS_MIN = 12;
export const ADDRESS_MAX = 300;
export const PIN_RE = /^[1-9]\d{5}$/;
export const normPin = (v: unknown) => String(v ?? '').replace(/\s+/g, '');
export const normAddress = (v: unknown) => String(v ?? '')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .split(/\n+/).map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join(', ')
  .replace(/\s*,(\s*,)+/g, ',').replace(/\s*,\s*/g, ', ').replace(/^[,\s]+|[,\s]+$/g, '');

export interface KycProblem { code: string; en: string; hi: string }

/** null when fine (or empty — address is optional). */
export function addressProblem(raw: unknown): KycProblem | null {
  const a = normAddress(raw);
  if (!a) return null;
  if (a.length < ADDRESS_MIN) return { code: 'ADDRESS_SHORT', en: `Write the full address (house / street, area, city) — at least ${ADDRESS_MIN} characters.`, hi: `पूरा पता लिखें (मकान / गली, इलाक़ा, शहर) — कम से कम ${ADDRESS_MIN} अक्षर।` };
  if (a.length > ADDRESS_MAX) return { code: 'ADDRESS_LONG', en: `The address is too long (most ${ADDRESS_MAX} characters).`, hi: `पता बहुत लंबा है (ज़्यादा से ज़्यादा ${ADDRESS_MAX} अक्षर)।` };
  return null;
}
export function pinProblem(raw: unknown): KycProblem | null {
  const p = normPin(raw);
  if (!p) return null;
  if (!/^\d+$/.test(p)) return { code: 'PIN_DIGITS', en: 'A PIN code has only digits.', hi: 'PIN कोड में सिर्फ़ अंक होते हैं।' };
  if (p.length !== 6) return { code: 'PIN_LENGTH', en: `A PIN code has 6 digits — you have typed ${p.length}.`, hi: `PIN कोड में 6 अंक होते हैं — आपने ${p.length} लिखे हैं।` };
  if (!PIN_RE.test(p)) return { code: 'PIN_FIRST', en: 'A PIN code never starts with 0.', hi: 'PIN कोड कभी 0 से शुरू नहीं होता।' };
  return null;
}

/** What the member agrees to — one tick on the join screen and on “My PAN & Aadhaar”. */
export const KYC_CONSENT = {
  en: 'I agree that GENZ keeps my PAN, my full Aadhaar number and my address — the Aadhaar number and address are stored encrypted and are opened only by the GENZ superadmin, with a written reason that is recorded and shown to me, for ID checks and for legal or dispute matters. I can ask for them to be deleted (subject to the law).',
  hi: 'मैं सहमत हूँ कि GENZ मेरा PAN, मेरा पूरा आधार नंबर और मेरा पता रखे — आधार नंबर और पता एन्क्रिप्ट करके रखे जाते हैं और सिर्फ़ GENZ का सुपरएडमिन, लिखित कारण के साथ, ID जाँच तथा क़ानूनी या विवाद के मामलों के लिए खोल सकता है; हर बार खुलना दर्ज होता है और मुझे दिखता है। मैं इन्हें हटाने को कह सकता/सकती हूँ (क़ानून की सीमा में)।',
} as const;

export const KYC_VAULT_NOTE = {
  en: 'Your full Aadhaar number and address are kept encrypted, separate from your profile. The photo you use to read them is not uploaded.',
  hi: 'आपका पूरा आधार नंबर और पता एन्क्रिप्ट करके, आपकी प्रोफ़ाइल से अलग रखा जाता है। इन्हें पढ़ने के लिए ली गई फ़ोटो अपलोड नहीं होती।',
} as const;

/** Why a superadmin opens a member's KYC. */
export const REVEAL_PURPOSES = ['LEGAL_CASE', 'DISPUTE', 'COURT_OR_POLICE', 'ID_CHECK', 'OTHER'] as const;
export type RevealPurpose = (typeof REVEAL_PURPOSES)[number];
export const REVEAL_PURPOSE_LABEL: Record<RevealPurpose, { en: string; hi: string }> = {
  LEGAL_CASE: { en: 'Legal case / notice (with an advocate)', hi: 'क़ानूनी मामला / नोटिस (वकील के साथ)' },
  DISPUTE: { en: 'Dispute between members', hi: 'सदस्यों के बीच विवाद' },
  COURT_OR_POLICE: { en: 'Court or police request', hi: 'अदालत या पुलिस की माँग' },
  ID_CHECK: { en: 'ID check / fraud doubt', hi: 'ID जाँच / धोखाधड़ी का शक' },
  OTHER: { en: 'Other (explain below)', hi: 'अन्य (नीचे समझाएँ)' },
};
export const REVEAL_MIN_REASON = 15;
export const REVEAL_MAX_REASON = 400;
/** the vault keeps this many “who opened it” rows per member */
export const VIEW_LOG_CAP = 60;
/** a vault of a member who was rejected / withdrew is deleted after this many days */
export const VAULT_ORPHAN_DAYS = 14;

/** 123456789012 → “XXXX XXXX 9012” */
export const maskedFull = (n: string) => { const d = normAadhaar(n); return d.length === 12 ? `XXXX XXXX ${d.slice(-4)}` : ''; };
