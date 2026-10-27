/**
 * v78 — profiles, ratings and reviews for everyone on GENZ (broker, builder, owner, customer, contractor, counsel, team member).
 *
 * Why: so a member can check, before he trusts someone, whether that person is genuine — and so good people are rewarded for it.
 * Pure rules (no server imports) so the server, the screens and the tests use exactly the same code.
 *
 *   WHO CAN BE FOUND      professionals by name / firm / area; a customer or an owner (a private person) ONLY by his exact mobile number
 *                         or GZ code, and only by a verified broker, builder, counsel or team member — never by browsing or by name.
 *   WHO CAN REVIEW WHOM   only two people who really worked together on GENZ (a deal room, a partnership, an owner mandate, a referred
 *                         building job, a legal case) — the server finds that proof, nobody types it in.
 *   ONE PERSON, ONE VOTE  the same reviewer counts once for the same person, however many deals they did (his latest review).
 *   FAIRNESS              the reviewed person can reply once, can report a review, and GENZ staff can hide one that breaks the rules.
 */
export type TargetGroup = 'BROKER' | 'BUILDER' | 'OWNER' | 'CUSTOMER' | 'CONTRACTOR' | 'LEGAL' | 'TEAM';
export type EvidenceKind = 'DEAL' | 'PARTNERSHIP' | 'OWNER_MANDATE' | 'CONSTRUCTION' | 'LEGAL';

export const REVIEW_EDIT_DAYS = 14;
export const REMARK_MAX = 280;
export const REPLY_MAX = 280;
export const MAX_TAGS = 4;
/** below this many different reviewers the average is shown as "early" */
export const EARLY_BELOW = 3;
export const SEARCH_MIN = 3;
export const SEARCH_MAX = 40;
export const SEARCH_LIMIT = 12;
export const ABOUT_MAX = 240;

export const groupOfRole = (role?: string): TargetGroup | null => ({
  BROKER: 'BROKER', DEVELOPER_BUILDER: 'BUILDER', PROPERTY_OWNER: 'OWNER', BUYER_TENANT: 'CUSTOMER', CONTRACTOR: 'CONTRACTOR', LEGAL_COUNSEL: 'LEGAL', TEAM_MEMBER: 'TEAM',
} as Record<string, TargetGroup>)[String(role)] || null;

export const GROUPS: Record<TargetGroup, { en: string; hi: string; private: boolean }> = {
  BROKER: { en: 'Broker', hi: 'ब्रोकर', private: false },
  BUILDER: { en: 'Builder / developer', hi: 'बिल्डर / डेवलपर', private: false },
  CONTRACTOR: { en: 'Contractor', hi: 'ठेकेदार', private: false },
  LEGAL: { en: 'Legal counsel', hi: 'वकील', private: false },
  TEAM: { en: 'Team member', hi: 'टीम सदस्य', private: false },
  OWNER: { en: 'Property owner', hi: 'प्रॉपर्टी ओनर', private: true },
  CUSTOMER: { en: 'Customer', hi: 'ग्राहक', private: true },
};

export interface TagDef { id: string; en: string; hi: string; tone: 'POS' | 'NEG' }
const t = (id: string, tone: 'POS' | 'NEG', en: string, hi: string): TagDef => ({ id, en, hi, tone });
export const TAGS: Record<TargetGroup, TagDef[]> = {
  BROKER: [
    t('HONEST', 'POS', 'Honest and clear', 'ईमानदार और साफ़'), t('RESPONSIVE', 'POS', 'Replies quickly', 'जल्दी जवाब देता है'),
    t('ACCURATE', 'POS', 'Details matched reality', 'जानकारी सही निकली'), t('FAIR_SPLIT', 'POS', 'Fair on the brokerage', 'ब्रोकरेज में ईमानदार'),
    t('MISLEADING', 'NEG', 'Misleading information', 'गुमराह करने वाली जानकारी'), t('UNRESPONSIVE', 'NEG', 'Does not reply', 'जवाब नहीं देता'),
    t('BYPASS', 'NEG', 'Tried to go around GENZ', 'GENZ को बाइपास करने की कोशिश'), t('PAY_DELAY', 'NEG', 'Delayed my share', 'मेरा हिस्सा देर से दिया'),
  ],
  BUILDER: [
    t('PAYS_ON_TIME', 'POS', 'Pays brokerage on time', 'ब्रोकरेज समय पर देता है'), t('CLEAR_TERMS', 'POS', 'Clear terms', 'साफ़ शर्तें'),
    t('GOOD_SUPPORT', 'POS', 'Good sales support', 'अच्छा सपोर्ट'), t('TRUE_INVENTORY', 'POS', 'Inventory is genuine', 'इन्वेंटरी असली'),
    t('PAY_DELAY', 'NEG', 'Delays payouts', 'पेमेंट में देरी'), t('CHANGED_TERMS', 'NEG', 'Changed terms later', 'बाद में शर्तें बदलीं'),
    t('UNRESPONSIVE', 'NEG', 'Does not reply', 'जवाब नहीं देता'), t('WRONG_INVENTORY', 'NEG', 'Unit not as shown', 'यूनिट वैसी नहीं जैसी दिखाई'),
  ],
  OWNER: [
    t('GENUINE_OWNER', 'POS', 'Genuine owner', 'असली मालिक'), t('CLEAR_PAPERS', 'POS', 'Papers in order', 'कागज़ ठीक'),
    t('REALISTIC_PRICE', 'POS', 'Realistic price', 'वाजिब कीमत'), t('COOPERATIVE', 'POS', 'Cooperative', 'सहयोगी'),
    t('PRICE_CHANGED', 'NEG', 'Changed the price', 'कीमत बदल दी'), t('PAPERS_MISSING', 'NEG', 'Papers not ready', 'कागज़ तैयार नहीं'),
    t('BYPASS', 'NEG', 'Went around the broker', 'ब्रोकर को बाइपास किया'), t('UNRESPONSIVE', 'NEG', 'Does not reply', 'जवाब नहीं देता'),
  ],
  CUSTOMER: [
    t('SERIOUS', 'POS', 'Serious buyer / tenant', 'गंभीर ग्राहक'), t('ON_TIME', 'POS', 'Came on time', 'समय पर आए'),
    t('REAL_BUDGET', 'POS', 'Budget was genuine', 'बजट असली था'), t('RESPECTFUL', 'POS', 'Respectful', 'शिष्ट'),
    t('NO_SHOW', 'NEG', 'Did not turn up', 'आए नहीं'), t('TIME_WASTER', 'NEG', 'Just wasting time', 'सिर्फ़ समय बर्बाद'),
    t('BYPASS', 'NEG', 'Went around the broker', 'ब्रोकर को बाइपास किया'), t('UNRESPONSIVE', 'NEG', 'Stopped replying', 'जवाब देना बंद'),
  ],
  CONTRACTOR: [
    t('QUALITY', 'POS', 'Good quality work', 'काम की अच्छी क्वालिटी'), t('ON_TIME', 'POS', 'Finished on time', 'समय पर पूरा'),
    t('FAIR_PRICE', 'POS', 'Fair price', 'वाजिब रेट'), t('COMMUNICATION', 'POS', 'Good communication', 'अच्छा संवाद'),
    t('DELAYED', 'NEG', 'Delayed', 'देरी हुई'), t('POOR_QUALITY', 'NEG', 'Poor quality', 'काम खराब'),
    t('EXTRA_CHARGES', 'NEG', 'Extra charges', 'ऊपर से पैसे माँगे'), t('UNRESPONSIVE', 'NEG', 'Does not reply', 'जवाब नहीं देता'),
  ],
  LEGAL: [
    t('CLEAR_ADVICE', 'POS', 'Clear advice', 'साफ़ सलाह'), t('QUICK', 'POS', 'Quick', 'जल्दी'),
    t('FAIR_FEE', 'POS', 'Fair fee', 'वाजिब फ़ीस'), t('THOROUGH', 'POS', 'Thorough', 'बारीकी से'),
    t('SLOW', 'NEG', 'Slow', 'देर लगाई'), t('UNCLEAR', 'NEG', 'Unclear advice', 'सलाह साफ़ नहीं'),
    t('FEE_ISSUE', 'NEG', 'Fee problem', 'फ़ीस की दिक़्क़त'), t('UNRESPONSIVE', 'NEG', 'Does not reply', 'जवाब नहीं देता'),
  ],
  TEAM: [
    t('POLITE', 'POS', 'Polite', 'शिष्ट'), t('KNOWS_PROJECT', 'POS', 'Knows the project well', 'प्रोजेक्ट की अच्छी जानकारी'),
    t('ON_TIME', 'POS', 'On time', 'समय पर'), t('HELPFUL', 'POS', 'Helpful', 'मददगार'),
    t('RUDE', 'NEG', 'Rude', 'बदतमीज़'), t('NO_SHOW', 'NEG', 'Did not turn up', 'आए नहीं'),
    t('WRONG_INFO', 'NEG', 'Gave wrong information', 'गलत जानकारी दी'), t('UNRESPONSIVE', 'NEG', 'Does not reply', 'जवाब नहीं देता'),
  ],
};
export const tagsFor = (g: TargetGroup) => TAGS[g];
export const tagLabel = (g: TargetGroup, id: string, hi: boolean) => { const x = TAGS[g].find(y => y.id === id); return x ? (hi ? x.hi : x.en) : id; };

export const EVIDENCE: Record<EvidenceKind, { en: string; hi: string }> = {
  DEAL: { en: 'a deal room', hi: 'डील रूम' },
  PARTNERSHIP: { en: 'a project partnership', hi: 'प्रोजेक्ट पार्टनरशिप' },
  OWNER_MANDATE: { en: 'an owner mandate', hi: 'ओनर मैंडेट' },
  CONSTRUCTION: { en: 'a building job', hi: 'निर्माण का काम' },
  LEGAL: { en: 'a legal case', hi: 'क़ानूनी केस' },
};

// ───────── what a reviewer may write ─────────
const URLISH = /(https?:\/\/|www\.|\b[\w.-]+@[\w-]+\.[a-z]{2,}\b|\b[\w-]+\.(com|in|co|net|org|app|me|io)\b)/i;
const DIGITS10 = /(?:\+?91[\s-]*)?(?:\d[\s.-]*){10,}/;
export function remarkProblem(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (s.length > REMARK_MAX) return `Keep it under ${REMARK_MAX} characters`;
  if (URLISH.test(s)) return 'Please do not put links or email addresses in a review';
  if (DIGITS10.test(s)) return 'Please do not put phone numbers in a review';
  return null;
}
export interface ReviewInput { rating?: unknown; tags?: unknown; remark?: unknown }
/** a problem sentence, or null when the review may be saved */
export function reviewProblem(group: TargetGroup, b: ReviewInput): string | null {
  const r = Number(b.rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) return 'Choose 1 to 5 stars';
  const tags = b.tags == null ? [] : b.tags;
  if (!Array.isArray(tags)) return 'Tags must be a list';
  if (tags.length > MAX_TAGS) return `Choose up to ${MAX_TAGS} tags`;
  const ok = new Set(TAGS[group].map(x => x.id));
  if (tags.some(x => typeof x !== 'string' || !ok.has(x)) || new Set(tags).size !== tags.length) return 'One of the tags does not fit this person';
  const p = remarkProblem(b.remark); if (p) return p;
  const text = String(b.remark ?? '').trim();
  if (r <= 2 && tags.length === 0 && text.length < 10) return 'For a low rating, tell others what went wrong — pick a tag or write a line';
  return null;
}
export const cleanTags = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))].slice(0, MAX_TAGS) : []);

// ───────── the numbers ─────────
export interface ReviewLike { reviewerId: string; rating: number; tags: string[]; at: string; editedAt?: string; status?: string }
export interface Summary { avg: number; count: number; early: boolean; stars: Record<1 | 2 | 3 | 4 | 5, number>; tags: { id: string; n: number }[] }
/** the same reviewer counts once (his latest review); a hidden review counts for nothing */
export function summarize(reviews: ReviewLike[]): Summary {
  const latest = new Map<string, ReviewLike>();
  for (const r of reviews) {
    if (r.status === 'HIDDEN') continue;
    const prev = latest.get(r.reviewerId);
    if (!prev || (r.editedAt || r.at) > (prev.editedAt || prev.at)) latest.set(r.reviewerId, r);
  }
  const list = [...latest.values()];
  const stars = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Summary['stars'];
  const tags = new Map<string, number>();
  let sum = 0;
  for (const r of list) { sum += r.rating; stars[r.rating as 1] += 1; for (const x of r.tags || []) tags.set(x, (tags.get(x) || 0) + 1); }
  return {
    avg: list.length ? Math.round((sum / list.length) * 10) / 10 : 0, count: list.length, early: list.length < EARLY_BELOW, stars,
    tags: [...tags.entries()].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n || a.id.localeCompare(b.id)).slice(0, 6),
  };
}

// ───────── who may find / open whom ─────────
const PROFESSIONAL_VIEWERS = new Set(['BROKER', 'DEVELOPER_BUILDER', 'LEGAL_COUNSEL', 'TEAM_MEMBER']);
const STAFF = new Set(['ADMIN', 'SUPERADMIN']);
export const isStaffRole = (r?: string) => STAFF.has(String(r));
export const canLookupPrivate = (viewerRole?: string) => PROFESSIONAL_VIEWERS.has(String(viewerRole));

/** may `viewer` open the profile of `target`? (the caller has already checked that the viewer is verified and the profile exists) */
export function mayOpenProfile(viewer: { id: string; role: string }, target: { id: string; role: string; visible?: boolean }, hasEvidence = false): boolean {
  if (viewer.id === target.id || isStaffRole(viewer.role)) return true;
  const g = groupOfRole(target.role); if (!g) return false;
  // a professional who switched off the name search is still reachable by his exact mobile / code and by anyone who really worked with him — hiding must not be a way to dodge a review
  if (!GROUPS[g].private) return target.visible !== false || hasEvidence;
  // a private person (customer / owner): another professional, or someone who really worked with him
  return canLookupPrivate(viewer.role) || hasEvidence;
}

export type SearchKind = 'PHONE' | 'CODE' | 'TEXT' | 'TOO_SHORT';
/** what the searcher typed: a mobile number, a GZ code, or words */
export function searchKind(raw: unknown): { kind: SearchKind; q: string } {
  const q = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, SEARCH_MAX);
  const digits = q.replace(/\D/g, '');
  if (/^[+\d][\d\s().-]*$/.test(q) && digits.length >= 10) return { kind: 'PHONE', q: digits.slice(-10) };
  if (/^GZ-[A-Z]{2,5}-\d{3,8}$/i.test(q)) return { kind: 'CODE', q: q.toUpperCase() };
  if (Array.from(q).length < SEARCH_MIN) return { kind: 'TOO_SHORT', q };
  return { kind: 'TEXT', q };
}
export const norm = (s: unknown) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

const TITLE = /^(?:dr|mr|mrs|ms|er|adv|shri|smt|sri|prof|ca|cs)\.?$/i;
/** "Sunita Yadav" → "Sunita Y." (customers and owners; a professional shows his full name). A leading title (Dr., Shri, Adv.) is dropped */
export function shortName(name: string): string {
  let w = String(name || '').trim().split(/\s+/).filter(Boolean);
  while (w.length > 2 && TITLE.test(w[0])) w = w.slice(1);
  if (w.length < 2) return w[0] || '—';
  return `${w[0]} ${Array.from(w[w.length - 1])[0].toUpperCase()}.`;
}

export const REPORT_REASONS: { id: string; en: string; hi: string }[] = [
  { id: 'FAKE', en: 'We never worked together', hi: 'हमने साथ काम नहीं किया' },
  { id: 'FALSE', en: 'Untrue', hi: 'झूठा है' },
  { id: 'ABUSIVE', en: 'Abusive or threatening', hi: 'गाली-गलौज / धमकी' },
  { id: 'PERSONAL', en: 'Shares private details', hi: 'निजी जानकारी है' },
  { id: 'OTHER', en: 'Something else', hi: 'कुछ और' },
];
export const isReportReason = (v: unknown): v is string => REPORT_REASONS.some(x => x.id === v);

export const editableUntil = (at: string) => new Date(Date.parse(at) + REVIEW_EDIT_DAYS * 86_400_000).toISOString();

export interface ProfileInput { visible?: unknown; showPhoto?: unknown; about?: unknown; areas?: unknown; languages?: unknown; years?: unknown }
export function profileProblem(b: ProfileInput): string | null {
  if (b.visible != null && typeof b.visible !== 'boolean') return 'Visible must be on or off';
  if (b.showPhoto != null && typeof b.showPhoto !== 'boolean') return 'Photo must be on or off';
  if (b.about != null) {
    const s = String(b.about).trim();
    if (s.length > ABOUT_MAX) return `Keep "about" under ${ABOUT_MAX} characters`;
    const p = remarkProblem(s); if (p) return p.replace('a review', 'your profile');
  }
  for (const k of ['areas', 'languages'] as const) {
    const v = b[k]; if (v == null) continue;
    if (!Array.isArray(v) || v.length > (k === 'areas' ? 6 : 5) || v.some(x => typeof x !== 'string' || x.trim().length < 2 || x.trim().length > 30)) return `Check ${k}`;
  }
  if (b.years != null && (!Number.isInteger(Number(b.years)) || Number(b.years) < 0 || Number(b.years) > 60)) return 'Years of work must be 0 to 60';
  return null;
}
