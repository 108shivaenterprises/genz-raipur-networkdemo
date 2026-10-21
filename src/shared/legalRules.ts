/**
 * v22 — Legal Help: pure rules shared by the server and the web app (no DOM, no Node APIs).
 *
 *  A broker asks for legal help from inside a deal room. The request carries only what the broker chooses to
 *  write and share — never the deal room itself (no chat, no brokerage, no customer name, no other broker's phone).
 *  Empanelled counsellors of that STATE see it, the first to claim it quotes a fee, the broker accepts or declines.
 *  GENZ earns a fixed platform fee per accepted case (lower for members) and an optional membership — never a cut of
 *  the advocate's fee. All money moves outside the app; the app only records it.
 */
import { findState } from './india.js';

export type LegalHelpType =
  | 'TITLE_CHECK' | 'AGREEMENT_DRAFT' | 'REGISTRATION' | 'LAND_RECORDS' | 'LOAN_DOCS' | 'LEGAL_NOTICE' | 'RERA_BUILDER' | 'LEASE_RENT' | 'OTHER';

export interface HelpTypeInfo {
  id: LegalHelpType;
  en: string; hi: string;
  /** one line: when to pick this */
  whenEn: string; whenHi: string;
  /** papers the counsellor will usually ask for (the broker ticks the ones he holds; shared view-only, expiring) */
  papers: { en: string; hi: string }[];
  /** facts to write in the description / details */
  details: { en: string; hi: string }[];
}

export const HELP_TYPES: HelpTypeInfo[] = [
  {
    id: 'TITLE_CHECK', en: 'Title / ownership check', hi: 'मालिकाना हक़ / टाइटल की जाँच',
    whenEn: 'Before token / agreement: is the seller the real owner and is the property free of dues and disputes?',
    whenHi: 'टोकन / एग्रीमेंट से पहले: क्या विक्रेता असली मालिक है और संपत्ति पर कोई बकाया या विवाद तो नहीं?',
    papers: [
      { en: 'Latest sale deed / title deed', hi: 'ताज़ा रजिस्ट्री / सेल डीड' },
      { en: 'Earlier chain of deeds (as many as you have)', hi: 'पिछली रजिस्ट्रियों की कड़ी (जितनी हों)' },
      { en: 'Land record extract (khasra / khatauni / B-1 / 7-12 / patta)', hi: 'भू-अभिलेख नकल (खसरा / खतौनी / बी-1 / 7-12 / पट्टा)' },
      { en: 'Property tax receipt', hi: 'संपत्ति कर रसीद' },
      { en: 'Encumbrance / no-dues certificate', hi: 'भार-मुक्त / नो-ड्यूज़ प्रमाणपत्र' },
      { en: 'Approved map / layout (if any)', hi: 'स्वीकृत नक्शा / लेआउट (हो तो)' },
    ],
    details: [
      { en: 'Property address, survey / khasra number, area', hi: 'संपत्ति का पता, सर्वे / खसरा नंबर, क्षेत्रफल' },
      { en: 'Seller’s name as on the papers (names only)', hi: 'काग़ज़ों के अनुसार विक्रेता का नाम (सिर्फ़ नाम)' },
      { en: 'What worries you (gaps in the chain, a name mismatch, a loan on it…)', hi: 'आपको क्या खटक रहा है (कड़ी में कमी, नाम में फ़र्क़, उस पर लोन…)' },
    ],
  },
  {
    id: 'AGREEMENT_DRAFT', en: 'Sale agreement / MoU drafting', hi: 'बिक्री एग्रीमेंट / MoU बनवाना',
    whenEn: 'Price and terms are agreed; you need a proper draft or a review of one.',
    whenHi: 'कीमत और शर्तें तय हैं; सही ड्राफ़्ट चाहिए या मौजूदा ड्राफ़्ट की जाँच।',
    papers: [
      { en: 'Existing draft / MoU (if any)', hi: 'मौजूदा ड्राफ़्ट / MoU (हो तो)' },
      { en: 'Title papers (as for a title check)', hi: 'टाइटल के काग़ज़ (जैसे टाइटल जाँच में)' },
      { en: 'Approved map / layout', hi: 'स्वीकृत नक्शा / लेआउट' },
    ],
    details: [
      { en: 'Agreed price and payment schedule (token, instalments, balance)', hi: 'तय कीमत और भुगतान का क्रम (टोकन, किस्तें, शेष)' },
      { en: 'Possession date, who bears stamp duty / registration', hi: 'क़ब्ज़े की तारीख़, स्टाम्प / रजिस्ट्रेशन का ख़र्च किसका' },
      { en: 'Special conditions (loan, tenant, part-payment, timeline)', hi: 'विशेष शर्तें (लोन, किरायेदार, आंशिक भुगतान, समयसीमा)' },
    ],
  },
  {
    id: 'REGISTRATION', en: 'Registration / stamp duty', hi: 'रजिस्ट्री / स्टाम्प ड्यूटी',
    whenEn: 'The deal is ready to be registered; you need the process, stamp duty or the sub-registrar visit handled.',
    whenHi: 'सौदा रजिस्ट्री के लिए तैयार है; प्रक्रिया, स्टाम्प ड्यूटी या सब-रजिस्ट्रार की कार्यवाही चाहिए।',
    papers: [
      { en: 'Final draft deed', hi: 'अंतिम ड्राफ़्ट डीड' },
      { en: 'Title papers and latest land record', hi: 'टाइटल के काग़ज़ और ताज़ा भू-अभिलेख' },
      { en: 'Guideline (circle) value proof, if you have it', hi: 'गाइडलाइन (सर्कल) रेट का प्रमाण, हो तो' },
    ],
    details: [
      { en: 'Registration district / sub-registrar office', hi: 'रजिस्ट्रेशन ज़िला / सब-रजिस्ट्रार कार्यालय' },
      { en: 'Deal value and preferred registration date', hi: 'सौदे की कीमत और पसंदीदा रजिस्ट्री की तारीख़' },
      { en: 'Number of buyers / sellers (not their ID numbers)', hi: 'ख़रीदार / विक्रेता कितने (उनके ID नंबर नहीं)' },
    ],
  },
  {
    id: 'LAND_RECORDS', en: 'Land records / mutation / diversion', hi: 'भू-अभिलेख / नामांतरण / डायवर्सन',
    whenEn: 'Name correction, mutation (namantaran), diversion, demarcation or a record dispute.',
    whenHi: 'नाम सुधार, नामांतरण, डायवर्सन, सीमांकन या रिकॉर्ड का विवाद।',
    papers: [
      { en: 'Current land record extract', hi: 'वर्तमान भू-अभिलेख नकल' },
      { en: 'Deed or order that created the change', hi: 'जिस डीड / आदेश से बदलाव हुआ' },
      { en: 'Earlier application / receipt number, if any', hi: 'पहले का आवेदन / रसीद नंबर, हो तो' },
    ],
    details: [
      { en: 'Village, tehsil, district, survey / khasra number', hi: 'गाँव, तहसील, ज़िला, सर्वे / खसरा नंबर' },
      { en: 'What exactly is wrong or pending', hi: 'क्या ग़लत या लंबित है' },
    ],
  },
  {
    id: 'LOAN_DOCS', en: 'Bank / loan legal papers', hi: 'बैंक / लोन के क़ानूनी काग़ज़',
    whenEn: 'The bank asks for a legal opinion, NOC or mortgage papers.',
    whenHi: 'बैंक को लीगल ओपिनियन, NOC या मॉर्गेज के काग़ज़ चाहिए।',
    papers: [
      { en: 'Bank’s list / letter asking for the opinion', hi: 'बैंक की सूची / पत्र जिसमें ओपिनियन माँगा है' },
      { en: 'Title papers and land record', hi: 'टाइटल के काग़ज़ और भू-अभिलेख' },
    ],
    details: [
      { en: 'Bank name and branch (no loan account number)', hi: 'बैंक का नाम और शाखा (लोन खाता नंबर नहीं)' },
      { en: 'Loan type and what the bank has asked for', hi: 'लोन का प्रकार और बैंक ने क्या माँगा' },
    ],
  },
  {
    id: 'LEGAL_NOTICE', en: 'Legal notice / dispute advice', hi: 'क़ानूनी नोटिस / विवाद की सलाह',
    whenEn: 'Someone has defaulted, encroached, backed out, or you received a notice.',
    whenHi: 'किसी ने चूक की, क़ब्ज़ा किया, मुकर गया, या आपको नोटिस मिला।',
    papers: [
      { en: 'Agreement / receipt that the dispute is about', hi: 'जिस एग्रीमेंट / रसीद पर विवाद है' },
      { en: 'Notice received or sent', hi: 'मिला या भेजा गया नोटिस' },
      { en: 'Written messages that show the facts', hi: 'तथ्य दिखाने वाले लिखित संदेश' },
    ],
    details: [
      { en: 'Timeline: what happened and when (dates)', hi: 'क्रम: क्या हुआ और कब (तारीख़ें)' },
      { en: 'What outcome you want (refund, possession, compliance)', hi: 'आप क्या नतीजा चाहते हैं (रिफ़ंड, क़ब्ज़ा, पालन)' },
    ],
  },
  {
    id: 'RERA_BUILDER', en: 'RERA / builder paper check', hi: 'RERA / बिल्डर के काग़ज़ की जाँच',
    whenEn: 'Check a project’s RERA status, a builder-buyer agreement or allotment letter.',
    whenHi: 'प्रोजेक्ट की RERA स्थिति, बिल्डर-ख़रीदार एग्रीमेंट या आवंटन पत्र की जाँच।',
    papers: [
      { en: 'Builder-buyer agreement / allotment letter', hi: 'बिल्डर-ख़रीदार एग्रीमेंट / आवंटन पत्र' },
      { en: 'RERA registration page / certificate', hi: 'RERA रजिस्ट्रेशन पेज / प्रमाणपत्र' },
      { en: 'Payment plan and receipts', hi: 'भुगतान योजना और रसीदें' },
    ],
    details: [
      { en: 'Project name, RERA number, unit number', hi: 'प्रोजेक्ट का नाम, RERA नंबर, यूनिट नंबर' },
      { en: 'The clause or issue you are unsure about', hi: 'जिस धारा / मुद्दे पर शक है' },
    ],
  },
  {
    id: 'LEASE_RENT', en: 'Lease / rent agreement', hi: 'लीज़ / किराया एग्रीमेंट',
    whenEn: 'Draft or check a rent, lease or leave-and-licence agreement.',
    whenHi: 'किराया, लीज़ या लीव-एंड-लाइसेंस एग्रीमेंट बनवाना या जाँचना।',
    papers: [
      { en: 'Existing agreement (if renewing)', hi: 'मौजूदा एग्रीमेंट (नवीनीकरण हो तो)' },
      { en: 'Ownership proof of the landlord', hi: 'मकान मालिक के मालिकाना हक़ का प्रमाण' },
    ],
    details: [
      { en: 'Rent, deposit, term, lock-in, escalation', hi: 'किराया, डिपॉज़िट, अवधि, लॉक-इन, वार्षिक वृद्धि' },
      { en: 'Use of the property (residential / commercial)', hi: 'संपत्ति का उपयोग (आवासीय / व्यावसायिक)' },
    ],
  },
  {
    id: 'OTHER', en: 'Something else', hi: 'कुछ और',
    whenEn: 'None of the above — describe it in your own words.', whenHi: 'ऊपर में से कोई नहीं — अपने शब्दों में बताइए।',
    papers: [{ en: 'Whatever the counsellor needs to read', hi: 'जो भी काग़ज़ वकील को पढ़ना हो' }],
    details: [{ en: 'What you need, by when, and what you already tried', hi: 'क्या चाहिए, कब तक, और आपने क्या कोशिश की' }],
  },
];
export const helpTypeInfo = (id: string) => HELP_TYPES.find(h => h.id === id);
export const HELP_TYPE_IDS = HELP_TYPES.map(h => h.id) as [LegalHelpType, ...LegalHelpType[]];

/** What must never go into a legal-help request, whatever the type. Shown on the form. */
export const NEVER_SHARE: { en: string; hi: string }[] = [
  { en: 'Brokerage split, commission terms or payment entries between the two brokers', hi: 'दोनों ब्रोकरों के बीच कमीशन का बँटवारा, शर्तें या भुगतान की एंट्री' },
  { en: 'Phone numbers (they open for both sides only after you accept the counsellor’s fee)', hi: 'फ़ोन नंबर (काउंसलर की फ़ीस मंज़ूर करने के बाद ही दोनों तरफ़ खुलते हैं)' },
  { en: 'Aadhaar / PAN / bank account numbers of anyone', hi: 'किसी का भी आधार / PAN / बैंक खाता नंबर' },
  { en: 'The deal-room chat — the counsellor never gets into the deal room', hi: 'डील रूम की चैट — काउंसलर डील रूम में कभी नहीं आता' },
];

// ───────────────────────────── states, text ─────────────────────────────
/** The canonical state of a deal room's property (explicit state, else from its city, else null). */
export function stateOfProperty(p: { state?: string; city?: string } | undefined, cityToState: (c?: string) => string | undefined): string | null {
  if (!p) return null;
  const direct = p.state ? findState(p.state)?.name : undefined;
  if (direct) return direct;
  const viaCity = p.city ? cityToState(p.city) : undefined;
  return viaCity ? (findState(viaCity)?.name ?? null) : null;
}

/** Indian mobile / landline numbers written in a free-text field (spaces, dashes, +91 allowed) are replaced. */
const PHONE_RE = /(?:\+?\s*91[\s\-.]*)?(?:\(?0?\)?[\s\-.]*)?\b[6-9](?:[\s\-.]*\d){9}\b/g;
const LONG_DIGITS_RE = /\b\d{10,}\b/g;
export function maskPhones(text: string): { text: string; masked: boolean } {
  let masked = false;
  const sub = (m: string) => { masked = true; return '••• (number hidden — shared after the fee is accepted)'; };
  let out = String(text || '').replace(PHONE_RE, sub);
  out = out.replace(LONG_DIGITS_RE, sub);
  return { text: out, masked };
}

// ───────────────────────────── money ─────────────────────────────
export interface LegalSettings {
  /** GENZ platform fee per accepted case, in rupees (flat). Never a share of the advocate's fee. */
  platformFee: number;
  /** the same fee for a counsellor with an active membership (0 = free for members) */
  memberPlatformFee: number;
  membershipMonthly: number;
  membershipYearly: number;
  /** hours the first counsellor has to quote before the case goes back to the pool */
  claimHours: number;
  /** hours the broker has to answer a quote before it lapses and the case goes back to the pool */
  quoteHours: number;
  /** strikes after which a counsellor is taken off the panel */
  maxStrikes: number;
  /** false until the superadmin saves the numbers once — the screen says the figures are placeholders until then */
  configured: boolean;
  updatedAt?: string; updatedBy?: string;
}
export const DEFAULT_LEGAL_SETTINGS: LegalSettings = {
  platformFee: 500, memberPlatformFee: 250, membershipMonthly: 1999, membershipYearly: 19999,
  claimHours: 24, quoteHours: 72, maxStrikes: 2, configured: false,
};
export const clampMoney = (n: unknown, max = 1_000_000) => Math.min(max, Math.max(0, Math.round(Number(n) || 0)));

// ───────────────────────────── lifecycle ─────────────────────────────
export type LegalStatus = 'OPEN' | 'CLAIMED' | 'QUOTED' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED';
export const LIVE_STATUSES: LegalStatus[] = ['OPEN', 'CLAIMED', 'QUOTED', 'ACCEPTED'];

export type LedgerKind = 'PLATFORM_FEE' | 'MEMBERSHIP';
export type LedgerStatus = 'DUE' | 'MARKED_PAID' | 'CONFIRMED' | 'REJECTED' | 'WAIVED';

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso); d.setUTCMonth(d.getUTCMonth() + months); return d.toISOString();
}
