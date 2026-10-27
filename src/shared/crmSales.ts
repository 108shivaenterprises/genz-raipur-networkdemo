/**
 * v16.7 — Sales Desk: pure constants and rules shared by the server and the browser.
 * (lead sources, customer details, telecaller call outcomes, forwarding, booking request details, team roles)
 *
 * Privacy line (DPDP): nothing here asks for income, PAN / Aadhaar, religion, caste, health or a second phone number.
 * A customer's "details" are what a salesperson needs to serve them — nothing they did not agree to be contacted about.
 */

type Opt = { id: string; en: string; hi: string };
const ids = <T extends readonly Opt[]>(a: T) => a.map(x => x.id) as unknown as [T[number]['id'], ...T[number]['id'][]];
export const optLabel = (list: readonly Opt[], id: string | undefined, hi: boolean) => { const o = list.find(x => x.id === id); return o ? (hi ? o.hi : o.en) : (id || ''); };

// ───────────────────────── lead source ─────────────────────────
export type SourceOpt = Opt & { hintEn: string; hintHi: string };
export const LEAD_SOURCES: readonly SourceOpt[] = [
  { id: 'WALK_IN', en: 'Walk-in at site / office', hi: 'साइट / ऑफ़िस पर वॉक-इन', hintEn: 'Who received them? (optional)', hintHi: 'किसने रिसीव किया? (वैकल्पिक)' },
  { id: 'TELECALLING', en: 'Telecalling / cold call', hi: 'टेलीकॉलिंग / कोल्ड कॉल', hintEn: 'Data list or campaign name (optional)', hintHi: 'डेटा लिस्ट या कैंपेन का नाम (वैकल्पिक)' },
  { id: 'ASSOCIATE_REFERRAL', en: 'Associate’s own contact', hi: 'एसोसिएट का अपना संपर्क', hintEn: 'How do you know them? (optional)', hintHi: 'आप उन्हें कैसे जानते हैं? (वैकल्पिक)' },
  { id: 'CLIENT_REFERRAL', en: 'Reference from a customer', hi: 'ग्राहक का रेफ़रेंस', hintEn: 'Referred by (name / flat no.)', hintHi: 'किसने भेजा (नाम / फ़्लैट नं.)' },
  { id: 'EMPLOYEE_REFERRAL', en: 'Employee / friend reference', hi: 'कर्मचारी / दोस्त का रेफ़रेंस', hintEn: 'Referred by (name)', hintHi: 'किसने भेजा (नाम)' },
  { id: 'SOCIAL_MEDIA', en: 'Facebook / Instagram / YouTube', hi: 'फ़ेसबुक / इंस्टाग्राम / यूट्यूब', hintEn: 'Page or campaign (e.g. Diwali offer)', hintHi: 'पेज या कैंपेन (जैसे दिवाली ऑफ़र)' },
  { id: 'DIGITAL_CAMPAIGN', en: 'Google / online ad', hi: 'गूगल / ऑनलाइन विज्ञापन', hintEn: 'Campaign name', hintHi: 'कैंपेन का नाम' },
  { id: 'WEBSITE_ENQUIRY', en: 'Website / app enquiry', hi: 'वेबसाइट / ऐप पूछताछ', hintEn: 'Which page / form? (optional)', hintHi: 'कौन सा पेज / फ़ॉर्म? (वैकल्पिक)' },
  { id: 'PROPERTY_PORTAL', en: 'Property portal', hi: 'प्रॉपर्टी पोर्टल', hintEn: 'Portal name (99acres, MagicBricks, Housing…)', hintHi: 'पोर्टल का नाम (99acres, MagicBricks, Housing…)' },
  { id: 'WHATSAPP_OR_SMS', en: 'WhatsApp / SMS broadcast', hi: 'WhatsApp / SMS ब्रॉडकास्ट', hintEn: 'Broadcast name (optional)', hintHi: 'ब्रॉडकास्ट का नाम (वैकल्पिक)' },
  { id: 'HOARDING_OR_PRINT', en: 'Hoarding / banner / pamphlet', hi: 'होर्डिंग / बैनर / पम्फ़लेट', hintEn: 'Which hoarding / location?', hintHi: 'कौन सी होर्डिंग / जगह?' },
  { id: 'NEWSPAPER_TV_RADIO', en: 'Newspaper / TV / radio', hi: 'अख़बार / TV / रेडियो', hintEn: 'Which one?', hintHi: 'कौन सा?' },
  { id: 'EXHIBITION', en: 'Exhibition / property expo', hi: 'प्रदर्शनी / प्रॉपर्टी एक्सपो', hintEn: 'Event name', hintHi: 'इवेंट का नाम' },
  { id: 'EXISTING_CUSTOMER', en: 'Existing customer (repeat)', hi: 'मौजूदा ग्राहक (दोबारा)', hintEn: 'Earlier project (optional)', hintHi: 'पहले का प्रोजेक्ट (वैकल्पिक)' },
  { id: 'OTHER', en: 'Other', hi: 'अन्य', hintEn: 'Say what (optional)', hintHi: 'क्या — बताएँ (वैकल्पिक)' },
];
export const LEAD_SOURCE_IDS = ids(LEAD_SOURCES);
export const sourceLabel = (id: string | undefined, hi: boolean) => optLabel(LEAD_SOURCES, id, hi) || (id || '').replace(/_/g, ' ').toLowerCase();
/** Match a CSV cell ("walk_in", "Walk-in at site / office", "वॉक-इन …") to a source id. */
export function parseSource(v: unknown): string | undefined {
  const raw = String(v ?? '').trim(); if (!raw) return undefined;
  const key = raw.toLowerCase().replace(/[\s\-\/]+/g, '_');
  return LEAD_SOURCES.find(s => s.id.toLowerCase() === key || s.en.toLowerCase() === raw.toLowerCase() || s.hi === raw)?.id;
}
export const sourceHint = (id: string | undefined, hi: boolean) => { const s = LEAD_SOURCES.find(x => x.id === id); return s ? (hi ? s.hintHi : s.hintEn) : ''; };

// ───────────────────────── customer details ─────────────────────────
export const PURPOSES: readonly Opt[] = [
  { id: 'SELF_USE', en: 'To live in (self use)', hi: 'खुद रहने के लिए' }, { id: 'INVESTMENT', en: 'Investment', hi: 'निवेश' }, { id: 'BOTH', en: 'Both', hi: 'दोनों' },
];
export const FUNDINGS: readonly Opt[] = [
  { id: 'SELF', en: 'Own funds', hi: 'अपना पैसा' }, { id: 'HOME_LOAN', en: 'Home loan', hi: 'होम लोन' }, { id: 'MIXED', en: 'Part own, part loan', hi: 'कुछ अपना, कुछ लोन' },
];
export const LOAN_STATUSES: readonly Opt[] = [
  { id: 'NOT_APPLIED', en: 'Not applied yet', hi: 'अभी अप्लाई नहीं किया' }, { id: 'IN_PROCESS', en: 'Applied / in process', hi: 'अप्लाई किया / प्रोसेस में' }, { id: 'SANCTIONED', en: 'Pre-approved / sanctioned', hi: 'प्री-अप्रूव्ड / सैंक्शन' },
];
export const TIMELINES: readonly Opt[] = [
  { id: 'IMMEDIATE', en: 'Within a month', hi: 'एक महीने के अंदर' }, { id: 'M1_3', en: 'In 1–3 months', hi: '1–3 महीने में' }, { id: 'M3_6', en: 'In 3–6 months', hi: '3–6 महीने में' },
  { id: 'M6_PLUS', en: 'After 6 months', hi: '6 महीने बाद' }, { id: 'EXPLORING', en: 'Just exploring', hi: 'अभी सिर्फ़ देख रहे हैं' },
];
export const OCCUPATIONS: readonly Opt[] = [
  { id: 'SALARIED', en: 'Salaried (private)', hi: 'नौकरी (प्राइवेट)' }, { id: 'GOVERNMENT', en: 'Government job', hi: 'सरकारी नौकरी' }, { id: 'BUSINESS', en: 'Business', hi: 'व्यापार' },
  { id: 'PROFESSIONAL', en: 'Professional (doctor / CA / lawyer…)', hi: 'प्रोफ़ेशनल (डॉक्टर / CA / वकील…)' }, { id: 'RETIRED', en: 'Retired', hi: 'रिटायर्ड' }, { id: 'NRI', en: 'NRI / abroad', hi: 'NRI / विदेश में' }, { id: 'OTHER', en: 'Other', hi: 'अन्य' },
];
export const CURRENT_HOMES: readonly Opt[] = [
  { id: 'OWN', en: 'Own house', hi: 'अपना घर' }, { id: 'RENT', en: 'Rented', hi: 'किराये पर' }, { id: 'FAMILY', en: 'With family', hi: 'परिवार के साथ' },
];
export const BEST_TIMES: readonly Opt[] = [
  { id: 'MORNING', en: 'Morning', hi: 'सुबह' }, { id: 'AFTERNOON', en: 'Afternoon', hi: 'दोपहर' }, { id: 'EVENING', en: 'Evening', hi: 'शाम' }, { id: 'ANYTIME', en: 'Any time', hi: 'कभी भी' },
];
export const LANGUAGES: readonly Opt[] = [
  { id: 'HI', en: 'Hindi', hi: 'हिन्दी' }, { id: 'EN', en: 'English', hi: 'अंग्रेज़ी' }, { id: 'CG', en: 'Chhattisgarhi', hi: 'छत्तीसगढ़ी' }, { id: 'OTHER', en: 'Other', hi: 'अन्य' },
];

/** Everything on a lead's "customer details" card. All optional; unknown keys are rejected by the server. */
export interface LeadProfile {
  purpose?: string; funding?: string; loanStatus?: string; timeline?: string;
  occupation?: string; residenceCity?: string; residenceLocality?: string; currentHome?: string;
  familySize?: number; decisionMaker?: string; preferences?: string; competitors?: string;
  bestTimeToCall?: string; language?: string; remarks?: string;
}
export const PROFILE_TEXT_MAX: Record<'residenceCity' | 'residenceLocality' | 'decisionMaker' | 'preferences' | 'competitors' | 'remarks', number> = {
  residenceCity: 60, residenceLocality: 60, decisionMaker: 80, preferences: 200, competitors: 120, remarks: 300,
};
export const PROFILE_ENUMS: Record<'purpose' | 'funding' | 'loanStatus' | 'timeline' | 'occupation' | 'currentHome' | 'bestTimeToCall' | 'language', readonly Opt[]> = {
  purpose: PURPOSES, funding: FUNDINGS, loanStatus: LOAN_STATUSES, timeline: TIMELINES, occupation: OCCUPATIONS, currentHome: CURRENT_HOMES, bestTimeToCall: BEST_TIMES, language: LANGUAGES,
};

/** Clean a client-supplied profile: returns the tidy profile, or an error string. Empty values are dropped. */
export function cleanProfile(input: unknown): LeadProfile | string {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return 'Customer details must be an object';
  const src = input as Record<string, unknown>; const out: Record<string, unknown> = {};
  const allowed = new Set([...Object.keys(PROFILE_ENUMS), ...Object.keys(PROFILE_TEXT_MAX), 'familySize']);
  for (const k of Object.keys(src)) if (!allowed.has(k)) return `Unknown detail “${k}”`;
  for (const [k, list] of Object.entries(PROFILE_ENUMS)) {
    const v = src[k]; if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'string' || !list.some(o => o.id === v)) return `Invalid value for ${k}`;
    out[k] = v;
  }
  for (const [k, max] of Object.entries(PROFILE_TEXT_MAX)) {
    const v = src[k]; if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'string') return `Invalid value for ${k}`;
    const t = v.replace(/\s+/g, ' ').trim(); if (t.length > max) return `${k} can be at most ${max} characters`;
    if (t) out[k] = t;
  }
  if (src.familySize !== undefined && src.familySize !== null && src.familySize !== '') {
    const n = Number(src.familySize); if (!Number.isInteger(n) || n < 1 || n > 20) return 'Family size must be a whole number from 1 to 20';
    out.familySize = n;
  }
  if (out.funding === 'SELF') delete out.loanStatus; // a loan status only makes sense when a loan is involved
  return out as LeadProfile;
}
/** The "how well do we know this customer" meter: 10 things a salesperson wants to know. */
export function profileCompleteness(l: { budgetMax?: number; budgetMin?: number; profile?: LeadProfile }): { filled: number; total: number; missing: string[] } {
  const p = l.profile || {};
  const checks: [string, boolean][] = [
    ['budget', !!(l.budgetMax || l.budgetMin)], ['purpose', !!p.purpose], ['funding', !!p.funding], ['timeline', !!p.timeline], ['occupation', !!p.occupation],
    ['residence', !!(p.residenceCity || p.residenceLocality)], ['currentHome', !!p.currentHome], ['familySize', !!p.familySize], ['decisionMaker', !!p.decisionMaker], ['bestTimeToCall', !!p.bestTimeToCall],
  ];
  return { filled: checks.filter(c => c[1]).length, total: checks.length, missing: checks.filter(c => !c[1]).map(c => c[0]) };
}
export const MISSING_LABEL: Record<string, [string, string]> = {
  budget: ['budget', 'बजट'], purpose: ['purpose', 'मक़सद'], funding: ['funding', 'पैसे का इंतज़ाम'], timeline: ['buying timeline', 'कब तक खरीदना है'], occupation: ['occupation', 'पेशा'],
  residence: ['where they live', 'कहाँ रहते हैं'], currentHome: ['current home', 'अभी का घर'], familySize: ['family size', 'परिवार के सदस्य'], decisionMaker: ['who decides', 'फ़ैसला कौन करेगा'], bestTimeToCall: ['best time to call', 'कॉल का सही समय'],
};

// ───────────────────────── telecaller: call outcomes ─────────────────────────
export type CallOutcomeOpt = Opt & { connected: boolean; needsWhen?: 'CALLBACK' | 'VISIT'; retryHours?: number };
export const CALL_OUTCOMES: readonly CallOutcomeOpt[] = [
  { id: 'INTERESTED', en: 'Spoke — interested', hi: 'बात हुई — रुचि है', connected: true },
  { id: 'VISIT_FIXED', en: 'Spoke — site visit fixed', hi: 'बात हुई — साइट विज़िट तय', connected: true, needsWhen: 'VISIT' },
  { id: 'CALLBACK', en: 'Spoke — call back later', hi: 'बात हुई — बाद में कॉल करें', connected: true, needsWhen: 'CALLBACK' },
  { id: 'NOT_INTERESTED', en: 'Spoke — not interested', hi: 'बात हुई — रुचि नहीं', connected: true },
  { id: 'NO_ANSWER', en: 'No answer', hi: 'फ़ोन नहीं उठाया', connected: false, retryHours: 4 },
  { id: 'BUSY', en: 'Busy / cut the call', hi: 'व्यस्त / कॉल काट दी', connected: false, retryHours: 3 },
  { id: 'SWITCHED_OFF', en: 'Switched off / unreachable', hi: 'फ़ोन बंद / पहुँच से बाहर', connected: false, retryHours: 24 },
  { id: 'WRONG_NUMBER', en: 'Wrong / invalid number', hi: 'गलत / अमान्य नंबर', connected: false },
];
export const CALL_OUTCOME_IDS = ids(CALL_OUTCOMES);
export const MAX_CALL_ATTEMPTS = 5; // this many calls without ever connecting → time to give up or try another channel
export const callOutcome = (id: string | undefined) => CALL_OUTCOMES.find(o => o.id === id);

/** Calls recorded on a lead (newest first on the lead). */
export function callStats(l: { activities: { type: string; at: string; call?: { outcome: string } }[] }) {
  const calls = l.activities.filter(a => a.type === 'CALL' && a.call);
  const connected = calls.filter(a => callOutcome(a.call!.outcome)?.connected).length;
  const last = calls[0];
  return { attempts: calls.length, connected, lastOutcome: last?.call?.outcome, lastAt: last?.at, unreached: connected === 0 && calls.length >= MAX_CALL_ATTEMPTS };
}

// ───────────────────────── forwarding to the next executive ─────────────────────────
export const FORWARD_PURPOSES: readonly Opt[] = [
  { id: 'SITE_VISIT', en: 'Arrange / handle the site visit', hi: 'साइट विज़िट कराना' },
  { id: 'FOLLOW_UP', en: 'Further follow-up', hi: 'आगे का फ़ॉलो-अप' },
  { id: 'CLOSING', en: 'Negotiation / closing', hi: 'बातचीत / क्लोज़िंग' },
  { id: 'PAPERWORK', en: 'Booking paperwork', hi: 'बुकिंग के कागज़' },
  { id: 'OTHER', en: 'Other', hi: 'अन्य' },
];
export const FORWARD_PURPOSE_IDS = ids(FORWARD_PURPOSES);
export const MAX_HANDOFFS = 30;
export const FORWARD_UNSEEN_HOURS = 24;

export interface CrmHandoff { id: string; at: string; fromId: string; fromName: string; toId: string; toName: string; purpose: string; note: string; seenAt?: string }

// ───────────────────────── team roles (a structured version of the free-text job title) ─────────────────────────
export const TEAM_ROLES: readonly Opt[] = [
  { id: 'TELECALLER', en: 'Telecaller', hi: 'टेलीकॉलर' },
  { id: 'SALES_EXECUTIVE', en: 'Sales executive', hi: 'सेल्स एक्ज़ीक्यूटिव' },
  { id: 'SITE_COORDINATOR', en: 'Site / visit coordinator', hi: 'साइट / विज़िट कोऑर्डिनेटर' },
  { id: 'CLOSING_MANAGER', en: 'Closing / sales manager', hi: 'क्लोज़िंग / सेल्स मैनेजर' },
  { id: 'ASSISTANT', en: 'Assistant / back office', hi: 'असिस्टेंट / बैक-ऑफ़िस' },
  // v75 — a contractor's own people
  { id: 'SITE_SUPERVISOR', en: 'Site supervisor', hi: 'साइट सुपरवाइज़र' },
  { id: 'ESTIMATOR', en: 'Estimator / quantity surveyor', hi: 'एस्टीमेटर / क्वांटिटी सर्वेयर' },
  { id: 'ACCOUNTANT', en: 'Accountant', hi: 'अकाउंटेंट' },
  { id: 'OTHER', en: 'Other', hi: 'अन्य' },
];
export const TEAM_ROLE_IDS = ids(TEAM_ROLES);
/** v75 — the roles offered in the "Add member" list: a contractor sees his own (supervisor, estimator…), a broker / builder the sales ones */
export function teamRolesFor(employerRole?: string): readonly Opt[] {
  const pick = (x: string[]) => x.map(id => TEAM_ROLES.find(r => r.id === id)!).filter(Boolean);   // in the order given: the first is the default
  return employerRole === 'CONTRACTOR' ? pick(['SITE_SUPERVISOR', 'ESTIMATOR', 'SALES_EXECUTIVE', 'ACCOUNTANT', 'ASSISTANT', 'OTHER'])
    : pick(['TELECALLER', 'SALES_EXECUTIVE', 'SITE_COORDINATOR', 'CLOSING_MANAGER', 'ASSISTANT', 'OTHER']);
}
/** v75 — how many people one employer may add: a builder runs a sales force, a broker a small office */
export const TEAM_MAX_BY_ROLE: Record<string, number> = { DEVELOPER_BUILDER: 60, CONTRACTOR: 30 };
export const TEAM_MAX_DEFAULT = 15;
/** v76b — the superadmin may change the figure: per kind of employer (`byRole`) and for one person (`personal`, beats the kind). Absent = the built-in figures above. */
export const TEAM_CAP_LIMITS = [1, 500] as const;
export const TEAM_CAP_ROLES = ['BROKER', 'DEVELOPER_BUILDER', 'CONTRACTOR'] as const;
export const teamMaxFor = (employerRole?: string, byRole?: Record<string, number>, personal?: number): number => {
  const ok = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= TEAM_CAP_LIMITS[0] && (n as number) <= TEAM_CAP_LIMITS[1];
  if (ok(personal)) return personal;
  const set = byRole?.[String(employerRole || '')];
  return ok(set) ? set : (TEAM_MAX_BY_ROLE[String(employerRole || '')] ?? TEAM_MAX_DEFAULT);
};
export const teamCapProblem = (v: unknown): string | null => (Number.isInteger(v) && (v as number) >= TEAM_CAP_LIMITS[0] && (v as number) <= TEAM_CAP_LIMITS[1] ? null : `The team limit must be a whole number, ${TEAM_CAP_LIMITS[0]} – ${TEAM_CAP_LIMITS[1]}`);
/** Older members only have a free-text title ("Telecaller", "Site executive") — read the role out of it. */
export function inferTeamRole(title: string | undefined, role?: string): string {
  if (role && TEAM_ROLES.some(r => r.id === role)) return role;
  const t = String(title || '').toLowerCase();
  if (/tele\s*-?call|calling|caller/.test(t)) return 'TELECALLER';
  if (/supervisor|foreman|mistri/.test(t)) return 'SITE_SUPERVISOR';
  if (/estimat|quantity|survey/.test(t)) return 'ESTIMATOR';
  if (/account|book-?keep/.test(t)) return 'ACCOUNTANT';
  if (/site|visit|co-?ordinator/.test(t)) return 'SITE_COORDINATOR';
  if (/closing|manager|head|team lead/.test(t)) return 'CLOSING_MANAGER';
  if (/sales|executive|relationship/.test(t)) return 'SALES_EXECUTIVE';
  if (/assist|office|back|admin|account/.test(t)) return 'ASSISTANT';
  return 'OTHER';
}
export const UNCALLED_HOURS = 4; // a fresh lead nobody has reached within this many hours is flagged
/** The usual next hand-off in a sales chain (just a suggestion shown first — any teammate can be chosen). */
export const NEXT_ROLE: Record<string, string> = { TELECALLER: 'SALES_EXECUTIVE', SALES_EXECUTIVE: 'SITE_COORDINATOR', SITE_COORDINATOR: 'CLOSING_MANAGER', CLOSING_MANAGER: 'ASSISTANT' };

// ───────────────────────── booking request: amount, payment condition ─────────────────────────
export const TOKEN_MODES: readonly Opt[] = [
  { id: 'CHEQUE', en: 'Cheque', hi: 'चेक' }, { id: 'UPI', en: 'UPI', hi: 'UPI' }, { id: 'NEFT_RTGS', en: 'NEFT / RTGS', hi: 'NEFT / RTGS' },
  { id: 'DD', en: 'Demand draft', hi: 'डिमांड ड्राफ़्ट' }, { id: 'CASH', en: 'Cash', hi: 'नकद' }, { id: 'OTHER', en: 'Other', hi: 'अन्य' },
];
export const PLAN_TYPES: readonly Opt[] = [
  { id: 'STANDARD', en: 'Builder’s standard plan', hi: 'बिल्डर का स्टैंडर्ड प्लान' },
  { id: 'DOWN_PAYMENT', en: 'Down payment (full payment, with rebate)', hi: 'डाउन पेमेंट (पूरा पेमेंट, छूट के साथ)' },
  { id: 'TIME_LINKED', en: 'Time-linked instalments', hi: 'समय के हिसाब से किस्तें' },
  { id: 'CONSTRUCTION_LINKED', en: 'Construction-linked (CLP)', hi: 'निर्माण के हिसाब से (CLP)' },
  { id: 'LOAN_LINKED', en: 'Bank-loan linked (disbursement)', hi: 'बैंक लोन से जुड़ा (डिसबर्समेंट)' },
  { id: 'CUSTOM', en: 'Custom — as agreed', hi: 'कस्टम — आपसी सहमति से' },
];
export const PLAN_TYPE_IDS = ids(PLAN_TYPES);
export const MAX_SCHEDULE_LINES = 12;
export const TOKEN_UNCONFIRMED_DAYS = 3;

export interface BookingPlan {
  planType: string; funding?: string; bank?: string; loanAmount?: number; conditions?: string;
  schedule?: { name: string; pct: number; dueInDays: number }[]; discountAsked?: number; expectedRegistryBy?: string;
}
export interface BookingToken {
  amount: number; mode?: string; ref?: string; paidOn?: string;
  /** CLAIMED = the requester says the customer paid it; RECEIVED = the builder recorded it; NOT_RECEIVED = the builder says it never arrived */
  status: 'CLAIMED' | 'RECEIVED' | 'NOT_RECEIVED'; claimedAt: string; claimedByName: string; confirmedAt?: string; confirmedByName?: string; note?: string;
}

/** '' when the proposed schedule is fine, else why not. */
export function scheduleError(s: { pct: number }[] | undefined): string {
  if (!s) return '';
  if (!s.length || s.length > MAX_SCHEDULE_LINES) return `A payment schedule needs 1–${MAX_SCHEDULE_LINES} lines`;
  const sum = s.reduce((a, m) => a + (Number(m.pct) || 0), 0);
  return Math.abs(sum - 100) > 0.01 ? `The payment lines must total 100% (now ${Math.round(sum * 100) / 100}%)` : '';
}
