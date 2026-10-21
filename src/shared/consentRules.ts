/**
 * v26 — owner consent before a listing (pure; server, browser and tests share it).
 *
 * Why: a property goes live on GENZ only with its OWNER's yes. That yes is what creates the broker–owner bond
 * (bypass protection for the chosen number of days) and it is how GENZ knows two brokers are listing the SAME property:
 * same owner phone + same city + same locality + same type (+ area within 10 %). The second broker is stopped and sent to
 * co-broke on the first listing instead of creating a duplicate.
 *
 * Two ways to get the yes:
 *   LINK  — the broker sends a link on WhatsApp; the owner opens it on HIS phone, reads the details and taps “Yes”.
 *           (When an SMS gateway is configured, a code sent to the owner's phone is also needed.)
 *   PAPER — the owner signs the printed consent form; the broker uploads a photo; a GENZ admin checks it.
 */
import { findState } from './india.js';

export const CONSENT_LINK_DAYS = 7;
export const CONSENT_FORM_VERSION = 'oc-v1';
/** two listings are the same property when the areas differ by at most this much */
export const SAME_AREA_TOLERANCE = 0.1;
export const MAX_OPEN_DRAFTS = 200;

export type ConsentStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'PAPER_REVIEW' | 'PAPER_REJECTED' | 'LINK_EXPIRED' | 'WITHDRAWN' | 'VOID';

const n = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '');
export const phone10 = (s: unknown) => String(s ?? '').replace(/\D/g, '').slice(-10);

/** the text both keys are made from (the server keys it with HMAC so a phone number cannot be guessed back) */
export function looseKeyText(p: { ownerPhone: string; city: string; locality: string; propertyType: string }) {
  return `${phone10(p.ownerPhone)}|${n(p.city)}|${n(p.locality)}|${n(p.propertyType)}`;
}
export function sameArea(a?: number, b?: number): boolean {
  if (!a || !b) return true;
  return Math.abs(a - b) / Math.max(a, b) <= SAME_AREA_TOLERANCE;
}

export const STATUS_LABEL: Record<ConsentStatus, { en: string; hi: string }> = {
  PENDING: { en: 'Waiting for the owner', hi: 'मालिक के जवाब का इंतज़ार' },
  ACCEPTED: { en: 'Owner agreed', hi: 'मालिक ने सहमति दी' },
  DECLINED: { en: 'Owner said no', hi: 'मालिक ने मना किया' },
  PAPER_REVIEW: { en: 'Signed form — GENZ is checking', hi: 'साइन किया फ़ॉर्म — GENZ जाँच रहा है' },
  PAPER_REJECTED: { en: 'Form not accepted', hi: 'फ़ॉर्म स्वीकार नहीं हुआ' },
  LINK_EXPIRED: { en: 'Link expired', hi: 'लिंक की मियाद ख़त्म' },
  WITHDRAWN: { en: 'Withdrawn', hi: 'वापस लिया' },
  VOID: { en: 'Cancelled by GENZ', hi: 'GENZ ने रद्द किया' },
};

export interface ConsentFacts { brokerName: string; company?: string; rera?: string; title: string; locality: string; city: string; priceText: string; days: number; until?: string; terms?: BrokerageTerms; rent?: boolean; paper?: boolean }

/** The words the owner agrees to — on the link page and on the printable form. */
export function consentWords(f: ConsentFacts) {
  const who = `${f.brokerName}${f.company ? ` (${f.company})` : ''}${f.rera ? `, RERA ${f.rera}` : ''}`;
  return {
    en: `I am the owner (or the owner's authorised family member) of “${f.title}” in ${f.locality}, ${f.city}. I allow ${who} to list it on GENZ Broker Network at ${f.priceText} and to show it to other verified brokers. For ${f.days} days ${f.paper ? 'from the date I sign this form' : 'from today'}, if this property is sold or rented to anyone this broker or the GENZ network brought, I will treat ${f.brokerName} as the broker who brought them (bypass protection).${f.terms ? ` ${termsWords(f.terms, f.rent).en}` : ''} GENZ does not take any money from me and is not a party to the sale.`,
    hi: `मैं “${f.title}” (${f.locality}, ${f.city}) का मालिक हूँ (या मालिक का अधिकृत परिवारजन)। मैं ${who} को इसे GENZ ब्रोकर नेटवर्क पर ${f.priceText} पर डालने और दूसरे वेरिफ़ाइड ब्रोकरों को दिखाने की अनुमति देता/देती हूँ। ${f.paper ? 'इस फ़ॉर्म पर मेरे साइन की तारीख़ से' : 'आज से'} ${f.days} दिन तक, अगर यह प्रॉपर्टी किसी ऐसे व्यक्ति को बिकती या किराये पर जाती है जिसे यह ब्रोकर या GENZ नेटवर्क लाया, तो मैं ${f.brokerName} को ही लाने वाला ब्रोकर मानूँगा/मानूँगी (बायपास सुरक्षा)।${f.terms ? ` ${termsWords(f.terms, f.rent).hi}` : ''} GENZ मुझसे कोई पैसा नहीं लेता और सौदे में पक्ष नहीं है।`,
  };
}

export const PAPER_HELP = {
  en: 'For an owner who does not use a smartphone: print the form, let the owner read and sign it, and upload a clear photo. GENZ checks it before the listing can go live.',
  hi: 'जो मालिक स्मार्टफ़ोन नहीं चलाते उनके लिए: फ़ॉर्म प्रिंट करें, मालिक पढ़कर साइन करें, फिर साफ़ फ़ोटो अपलोड करें। लिस्टिंग लाइव होने से पहले GENZ इसे जाँचता है।',
} as const;

export const TAKEN_MSG = {
  en: 'This owner has already given consent to another GENZ broker for this property. A second listing is not allowed while that protection lasts — you can co-broke on the existing listing instead.',
  hi: 'इस प्रॉपर्टी के लिए मालिक पहले ही GENZ के दूसरे ब्रोकर को सहमति दे चुके हैं। उस सुरक्षा के रहते दूसरी लिस्टिंग नहीं बन सकती — आप मौजूदा लिस्टिंग पर को-ब्रोकिंग कर सकते हैं।',
} as const;

/** v28 — a pasted buyer / tenant requirement: what is still needed before it can be saved as a Buyer Need */
export function needMissing(f: Record<string, any>): string[] {
  const PHONE_RE = /^[6-9]\d{9}$/;
  const m: string[] = [];
  if (!f.propertyType) m.push('propertyType');
  if (!f.transactionType) m.push('transactionType');
  if (!f.city || String(f.city).trim().length < 2) m.push('city');
  if (!Array.isArray(f.localities) || !f.localities.filter((x: string) => String(x).trim()).length) m.push('localities');
  if (!(Number(f.budgetMax) > 0)) m.push('budgetMax');
  if (!f.customerName || String(f.customerName).trim().length < 2) m.push('customerName');
  if (!PHONE_RE.test(phone10(f.customerPhone))) m.push('customerPhone');
  return m;
}

/** fields still missing before the owner can be asked */
export function draftMissing(f: Record<string, any>): string[] {
  const PHONE_RE = /^[6-9]\d{9}$/;
  const m: string[] = [];
  if (!f.propertyType) m.push('propertyType');
  if (!f.transactionType) m.push('transactionType');
  if (!findState(f.state)) m.push('state');
  if (!f.city || String(f.city).trim().length < 2) m.push('city');
  if (!f.locality || String(f.locality).trim().length < 2) m.push('locality');
  if (!(Number(f.askingPrice) > 0)) m.push('askingPrice');
  if (!f.ownerName || String(f.ownerName).trim().length < 2) m.push('ownerName');
  if (!PHONE_RE.test(phone10(f.ownerPhone))) m.push('ownerPhone');
  if (!f.addressHidden || String(f.addressHidden).trim().length < 5) m.push('addressHidden');
  return m;
}


// ───────────────────────── v27: brokerage terms + the owner's signature ─────────────────────────
export type Basis = 'SURPLUS_ABOVE_NET' | 'PERCENTAGE' | 'FIXED_FEE';
export const BASES: Basis[] = ['SURPLUS_ABOVE_NET', 'PERCENTAGE', 'FIXED_FEE'];
/** how the listing broker is paid — fixed when the owner says yes, so a deal room can open the moment the listing is live */
export interface BrokerageTerms { basis: Basis; advertised: number; net: number; pct: number; fee: number; brokerSignedAt?: string }

const rupees = (n: number) => { const x = Math.round(n); return x >= 1e7 ? `₹${+(x / 1e7).toFixed(2)} Cr` : x >= 1e5 ? `₹${+(x / 1e5).toFixed(2)} L` : `₹${x.toLocaleString('en-IN')}`; };
export const money = rupees;

/** what the broker earns / the owner receives if it sells at the advertised price */
export function remunerationAt(t: { basis: Basis; advertised: number; net: number; pct: number; fee: number }) {
  const broker = t.basis === 'PERCENTAGE' ? Math.round(t.advertised * t.pct / 100) : t.basis === 'FIXED_FEE' ? Math.round(t.fee) : Math.max(0, t.advertised - t.net);
  return { broker, owner: Math.max(0, t.advertised - broker) };
}

/** terms from a draft's fields. none = the broker has not chosen a basis (no mandate will be made). */
export function termsOf(f: Record<string, any>): { terms: BrokerageTerms | null; problem?: { en: string; hi: string } } {
  const basis = f.remunerationBasis as Basis | '' | undefined;
  if (!basis) return { terms: null };
  if (!BASES.includes(basis)) return { terms: null, problem: { en: 'Choose how you are paid: net amount, commission % or fixed fee.', hi: 'ब्रोकरेज का तरीका चुनें: नेट अमाउंट, कमीशन % या फिक्स्ड फ़ीस।' } };
  const advertised = Number(f.askingPrice) || 0;
  const net = Number(f.ownerApprovedNetPrice) || 0, pct = Number(f.agreedCommissionPct) || 0, fee = Number(f.fixedFeeAmount) || 0;
  if (!(advertised > 0)) return { terms: null, problem: { en: 'Enter the price first.', hi: 'पहले कीमत भरें।' } };
  if (basis === 'SURPLUS_ABOVE_NET' && !(net > 0 && net < advertised)) return { terms: null, problem: { en: 'The owner’s net amount must be above 0 and below the price.', hi: 'मालिक की नेट रकम 0 से ऊपर और कीमत से कम होनी चाहिए।' } };
  if (basis === 'PERCENTAGE' && !(pct >= 0.1 && pct <= 10)) return { terms: null, problem: { en: 'Commission must be between 0.1% and 10%.', hi: 'कमीशन 0.1% से 10% के बीच होना चाहिए।' } };
  if (basis === 'FIXED_FEE' && !(fee > 0 && fee < advertised)) return { terms: null, problem: { en: 'The fixed fee must be above 0 and below the price.', hi: 'फिक्स्ड फ़ीस 0 से ऊपर और कीमत से कम होनी चाहिए।' } };
  return { terms: { basis, advertised, net: basis === 'SURPLUS_ABOVE_NET' ? net : 0, pct: basis === 'PERCENTAGE' ? pct : 0, fee: basis === 'FIXED_FEE' ? fee : 0 } };
}

export function termsLine(t: BrokerageTerms) {
  const r = remunerationAt(t);
  return {
    kind: t.basis === 'PERCENTAGE' ? { en: `Commission ${t.pct}% of the final price`, hi: `कमीशन ${t.pct}% (फ़ाइनल कीमत का)` }
      : t.basis === 'FIXED_FEE' ? { en: `Fixed fee ${rupees(t.fee)}`, hi: `फिक्स्ड फ़ीस ${rupees(t.fee)}` }
      : { en: `Net amount ${rupees(t.net)} to the owner, the rest is the broker’s`, hi: `मालिक को नेट ${rupees(t.net)}, ऊपर की रकम ब्रोकर की` },
    atAsking: { en: `At ${rupees(t.advertised)}: broker ${rupees(r.broker)}, owner ${rupees(r.owner)}`, hi: `${rupees(t.advertised)} पर: ब्रोकर ${rupees(r.broker)}, मालिक ${rupees(r.owner)}` },
  };
}
export function termsWords(t: BrokerageTerms, rent = false) {
  const l = termsLine(t); const fixed = t.basis === 'FIXED_FEE';
  const lowEn = fixed ? `The fee stays the same whatever the final ${rent ? 'rent' : 'price'} is.` : `If the final ${rent ? 'rent' : 'price'} is lower, the broker’s share follows the same rule.`;
  const lowHi = fixed ? `अंतिम ${rent ? 'किराया' : 'कीमत'} जो भी हो, यह फ़ीस वही रहेगी।` : `अगर अंतिम ${rent ? 'किराया' : 'कीमत'} कम हुई तो ब्रोकर का हिस्सा इसी नियम से घटेगा।`;
  return {
    en: `Brokerage: I agree to pay the broker as follows — ${l.kind.en}. ${l.atAsking.en}. ${lowEn} I pay it directly to the broker; GENZ takes no part of it.`,
    hi: `ब्रोकरेज: मैं ब्रोकर को इस तरह भुगतान देने पर सहमत हूँ — ${l.kind.hi}। ${l.atAsking.hi}। ${lowHi} मैं सीधे ब्रोकर को दूँगा/दूँगी; GENZ इसमें से कुछ नहीं लेता।`,
  };
}

/** owner’s typed initials: 2–8 letters / dots / spaces (any script) */
export function validInitials(s: unknown): string | null {
  const t = String(s ?? '').trim().replace(/\s+/g, ' ');
  if (t.length < 2 || t.length > 8) return null;
  if (!/^[\p{L}\p{M}. ]+$/u.test(t)) return null;
  if ((t.match(/\p{L}/gu) || []).length < 2) return null;
  return t;
}
export const SIGN_MIN_POINTS = 12;
export const SIGN_MAX_BYTES = 200 * 1024;
