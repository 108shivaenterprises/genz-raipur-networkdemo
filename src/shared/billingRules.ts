/**
 * v23 — Plans & Fees: GENZ's own charges and memberships, decided by GENZ admins.
 * Pure rules shared by the server and the web app (no DOM, no Node APIs).
 *
 *  FEE RULES   "For <event>, <who> pays GENZ <flat ₹ | % of base> (min / max), in <states>, except <people>, from <date>."
 *              No rule = no charge. A rule is never retroactive: a charge is calculated once, when the event happens,
 *              and keeps that calculation even if the rule changes later.
 *  PLANS       Memberships an admin creates for chosen groups: a price per month / year, what each event costs a member
 *              (free, a flat ₹, a %, or a % discount on the normal fee), and which member-only features it unlocks.
 *              A member never pays more than a non-member.
 *  GATES       Features an admin may reserve for members of a plan that includes them (off by default).
 *
 *  GENZ's own fees and memberships are GENZ's money: the payer pays outside the app, writes the UTR here, a GENZ admin confirms.
 *  GENZ does not hold the parties' deal money (token, brokerage, price).
 */
import { segmentOf } from './launchRules.js';
import { findState, stateOfCity } from './india.js';

// ───────────────────────────── who pays ─────────────────────────────
export type PayerSegment = 'BUILDER' | 'BROKER_BIG_FIRM' | 'BROKER_INDEPENDENT' | 'BROKER_LOCAL' | 'LEGAL_COUNSEL' | 'CONTRACTOR';
export const PAYER_SEGMENTS: { id: PayerSegment; en: string; hi: string; hintEn: string; hintHi: string }[] = [
  { id: 'BUILDER', en: 'Builders / developers', hi: 'बिल्डर / डेवलपर', hintEn: 'Builder accounts', hintHi: 'बिल्डर खाते' },
  { id: 'BROKER_BIG_FIRM', en: 'Big RERA firms', hi: 'बड़ी RERA फ़र्में', hintEn: 'RERA no. + 5 or more active staff (or marked by the desk)', hintHi: 'RERA नंबर + 5 या ज़्यादा सक्रिय स्टाफ़ (या डेस्क ने तय किया)' },
  { id: 'BROKER_INDEPENDENT', en: 'Independent RERA brokers', hi: 'स्वतंत्र RERA ब्रोकर', hintEn: 'RERA no., individual or small agency', hintHi: 'RERA नंबर, अकेले या छोटी एजेंसी' },
  { id: 'BROKER_LOCAL', en: 'Local associates (no RERA no.)', hi: 'लोकल एसोसिएट (बिना RERA नंबर)', hintEn: 'Tier 2 members vouched by a RERA sponsor', hintHi: 'RERA स्पॉन्सर से जुड़े टियर 2 सदस्य' },
  { id: 'LEGAL_COUNSEL', en: 'Legal counsellors', hi: 'क़ानूनी सलाहकार', hintEn: 'GENZ legal panel', hintHi: 'GENZ लीगल पैनल' },
  { id: 'CONTRACTOR', en: 'Contractors', hi: 'कॉन्ट्रैक्टर', hintEn: 'Construction partners', hintHi: 'कंस्ट्रक्शन पार्टनर' },
];
export const SEGMENT_IDS = PAYER_SEGMENTS.map(s => s.id) as [PayerSegment, ...PayerSegment[]];
export const segmentInfo = (id?: string | null) => PAYER_SEGMENTS.find(s => s.id === id);

export interface PayerUserLike { id?: string; role?: string; tier?: string; reraNumber?: string; firmSegment?: 'BIG_FIRM' | 'INDEPENDENT'; state?: string; city?: string }
/** The billing group of a person (null = GENZ charges this role nothing). `activeStaff` = his verified employees. */
export function payerSegmentOf(u: PayerUserLike, activeStaff = 0): PayerSegment | null {
  switch (u.role) {
    case 'DEVELOPER_BUILDER': return 'BUILDER';
    case 'LEGAL_COUNSEL': return 'LEGAL_COUNSEL';
    case 'CONTRACTOR': return 'CONTRACTOR';
    case 'BROKER': {
      const s = segmentOf(u, activeStaff);
      return s === 'BIG_FIRM' ? 'BROKER_BIG_FIRM' : s === 'LOCAL' ? 'BROKER_LOCAL' : 'BROKER_INDEPENDENT';
    }
    default: return null;
  }
}
export const homeStateOf = (u: { state?: string; city?: string }) => findState(u.state)?.name || stateOfCity(u.city) || '';

// ───────────────────────────── what is charged ─────────────────────────────
export type FeeEvent = 'LEGAL_CASE' | 'BUILDER_BOOKING' | 'BROKER_DEAL';
export const FEE_EVENTS: { id: FeeEvent; en: string; hi: string; payers: PayerSegment[]; baseEn: string; baseHi: string; whenEn: string; whenHi: string }[] = [
  {
    id: 'LEGAL_CASE', en: 'Legal case accepted', hi: 'लीगल केस मंज़ूर', payers: ['LEGAL_COUNSEL'],
    baseEn: 'the counsellor’s accepted fee', baseHi: 'काउंसलर की मंज़ूर फ़ीस',
    whenEn: 'when a broker accepts the counsellor’s fee', whenHi: 'जब ब्रोकर काउंसलर की फ़ीस मंज़ूर करे',
  },
  {
    id: 'BUILDER_BOOKING', en: 'Booking through a network broker', hi: 'नेटवर्क ब्रोकर से बुकिंग', payers: ['BUILDER'],
    baseEn: 'the booking (agreement) value', baseHi: 'बुकिंग (एग्रीमेंट) की कीमत',
    whenEn: 'when the builder approves a booking made by a network broker (not his own desk; not on a master-CP project)', whenHi: 'जब बिल्डर नेटवर्क ब्रोकर की बुकिंग मंज़ूर करे (अपने डेस्क की नहीं; मास्टर-CP प्रोजेक्ट पर नहीं)',
  },
  {
    id: 'BROKER_DEAL', en: 'Broker-to-broker deal commission', hi: 'ब्रोकर-से-ब्रोकर डील का कमीशन', payers: ['BROKER_BIG_FIRM', 'BROKER_INDEPENDENT', 'BROKER_LOCAL'],
    baseEn: 'the commission payment received', baseHi: 'मिला हुआ कमीशन भुगतान',
    whenEn: 'when the other broker confirms a commission payment to this broker', whenHi: 'जब दूसरा ब्रोकर इस ब्रोकर को कमीशन भुगतान पक्का करे',
  },
];
export const EVENT_IDS = FEE_EVENTS.map(e => e.id) as [FeeEvent, ...FeeEvent[]];
export const eventInfo = (id?: string | null) => FEE_EVENTS.find(e => e.id === id);

// ───────────────────────────── member-only features ─────────────────────────────
export type GateKey = 'LEGAL_CLAIM' | 'LEGAL_REQUEST' | 'LAUNCH_EARLY';
export const GATES: { id: GateKey; kind: 'GATE' | 'PERK'; en: string; hi: string; detailEn: string; detailHi: string; segments: PayerSegment[] }[] = [
  {
    id: 'LEGAL_CLAIM', kind: 'GATE', en: 'Take legal-help cases', hi: 'लीगल-मदद के केस लेना', segments: ['LEGAL_COUNSEL'],
    detailEn: 'When reserved, only counsellors with a plan that includes it can take cases.', detailHi: 'आरक्षित होने पर सिर्फ़ वही काउंसलर केस ले सकते हैं जिनके प्लान में यह हो।',
  },
  {
    id: 'LEGAL_REQUEST', kind: 'GATE', en: 'Ask for legal help', hi: 'लीगल मदद माँगना', segments: ['BROKER_BIG_FIRM', 'BROKER_INDEPENDENT', 'BROKER_LOCAL'],
    detailEn: 'When reserved, only brokers with a plan that includes it can raise a legal-help request.', detailHi: 'आरक्षित होने पर सिर्फ़ वही ब्रोकर लीगल मदद माँग सकते हैं जिनके प्लान में यह हो।',
  },
  {
    id: 'LAUNCH_EARLY', kind: 'PERK', en: 'Early access to Launch Desk projects', hi: 'लॉन्च डेस्क प्रोजेक्ट में पहले मौक़ा', segments: ['BROKER_INDEPENDENT'],
    detailEn: 'An independent RERA broker with this perk sees new launches in the big-firm wave. Local associates can never get a selling window (RERA).', detailHi: 'इस सुविधा वाला स्वतंत्र RERA ब्रोकर नए लॉन्च बड़ी फ़र्मों के साथ देखता है। लोकल एसोसिएट को बिक्री की खिड़की कभी नहीं (RERA)।',
  },
];
export const GATE_IDS = GATES.map(g => g.id) as [GateKey, ...GateKey[]];
export const gateInfo = (id?: string | null) => GATES.find(g => g.id === id);
export interface GateSetting { id: string; key: GateKey; membersOnly: boolean; segments: PayerSegment[]; updatedAt?: string; updatedBy?: string }

// ───────────────────────────── rules and plans ─────────────────────────────
export type FeeMode = 'FLAT' | 'PERCENT';
export interface Targeting {
  segments: PayerSegment[];
  /** empty = every state */
  states: string[];
  /** empty = everyone in the groups; otherwise ONLY these people */
  includeUserIds: string[];
  /** never these people */
  excludeUserIds: string[];
}
export interface FeeRule extends Targeting {
  id: string; event: FeeEvent; mode: FeeMode; value: number; minFee?: number; maxFee?: number;
  active: boolean; effectiveFrom: string; note?: string;
  createdAt: string; createdBy: string; updatedAt: string; updatedBy: string;
  history: { at: string; by: string; what: string }[];
}
export type BenefitType = 'FREE' | 'FLAT' | 'PERCENT' | 'DISCOUNT_PCT';
export interface PlanBenefit { type: BenefitType; value: number }
export interface Plan extends Targeting {
  id: string; name: string; nameHi?: string; description?: string;
  monthly?: number; yearly?: number;
  fees: Partial<Record<FeeEvent, PlanBenefit>>;
  features: GateKey[];
  active: boolean;
  createdAt: string; createdBy: string; updatedAt: string; updatedBy: string;
  history: { at: string; by: string; what: string }[];
}

export interface PayerCtx { userId: string; segment: PayerSegment; state: string }
export function targets(t: Targeting, p: PayerCtx): boolean {
  if (!t.segments.includes(p.segment)) return false;
  if (t.excludeUserIds.includes(p.userId)) return false;
  if (t.includeUserIds.length && !t.includeUserIds.includes(p.userId)) return false;
  if (t.states.length && !t.states.includes(p.state)) return false;
  return true;
}
const specificity = (t: Targeting) => (t.includeUserIds.length ? 4 : 0) + (t.states.length ? 2 : 0) + (t.segments.length === 1 ? 1 : 0);

/** The one rule that decides a charge: the most specific matching rule, then the latest. */
export function pickRule(rules: FeeRule[], event: FeeEvent, p: PayerCtx, atIso: string): FeeRule | null {
  const ok = rules.filter(r => r.active && r.event === event && r.effectiveFrom <= atIso && targets(r, p));
  ok.sort((a, b) => specificity(b) - specificity(a) || b.effectiveFrom.localeCompare(a.effectiveFrom) || b.updatedAt.localeCompare(a.updatedAt));
  return ok[0] || null;
}
export const round = (n: number) => Math.max(0, Math.round(n));
export function ruleFee(r: Pick<FeeRule, 'mode' | 'value' | 'minFee' | 'maxFee'>, base: number): number {
  if (r.mode === 'FLAT') return round(r.value);
  let f = (base * r.value) / 100;
  if (r.minFee !== undefined && f < r.minFee) f = r.minFee;
  if (r.maxFee !== undefined && f > r.maxFee) f = r.maxFee;
  return round(f);
}
export function benefitFee(b: PlanBenefit, normal: number, base: number): number {
  switch (b.type) {
    case 'FREE': return 0;
    case 'FLAT': return round(b.value);
    case 'PERCENT': return round((base * b.value) / 100);
    case 'DISCOUNT_PCT': return round(normal * (1 - Math.min(100, Math.max(0, b.value)) / 100));
  }
}
export interface FeeResult { fee: number; normalFee: number; rule: FeeRule | null; plan: Plan | null; benefit?: PlanBenefit }
/** What GENZ charges this person for this event, right now. No rule → nothing. A member never pays more than the normal fee. */
export function computeFee(rules: FeeRule[], memberPlan: Plan | null, event: FeeEvent, p: PayerCtx, base: number, atIso: string): FeeResult {
  const rule = pickRule(rules, event, p, atIso);
  if (!rule) return { fee: 0, normalFee: 0, rule: null, plan: null };
  const normalFee = ruleFee(rule, base);
  const benefit = memberPlan?.fees[event];
  if (memberPlan && benefit) {
    const m = benefitFee(benefit, normalFee, base);
    return { fee: Math.min(normalFee, m), normalFee, rule, plan: memberPlan, benefit };
  }
  return { fee: normalFee, normalFee, rule, plan: null };
}

// ───────────────────────────── words ─────────────────────────────
const inr = (n?: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
export function describeRule(r: Pick<FeeRule, 'event' | 'mode' | 'value' | 'minFee' | 'maxFee'>, lang: 'en' | 'hi' = 'en'): string {
  const ev = eventInfo(r.event);
  if (r.mode === 'FLAT') return lang === 'hi' ? `हर बार ${inr(r.value)}` : `${inr(r.value)} each time`;
  const base = lang === 'hi' ? ev?.baseHi : ev?.baseEn;
  const lim = [r.minFee !== undefined ? (lang === 'hi' ? `कम से कम ${inr(r.minFee)}` : `min ${inr(r.minFee)}`) : '', r.maxFee !== undefined ? (lang === 'hi' ? `ज़्यादा से ज़्यादा ${inr(r.maxFee)}` : `max ${inr(r.maxFee)}`) : ''].filter(Boolean).join(', ');
  return lang === 'hi' ? `${base} का ${r.value}%${lim ? ` (${lim})` : ''}` : `${r.value}% of ${base}${lim ? ` (${lim})` : ''}`;
}
export function describeBenefit(event: FeeEvent, b: PlanBenefit, lang: 'en' | 'hi' = 'en'): string {
  const ev = eventInfo(event);
  switch (b.type) {
    case 'FREE': return lang === 'hi' ? 'मुफ़्त' : 'free';
    case 'FLAT': return lang === 'hi' ? `हर बार ${inr(b.value)}` : `${inr(b.value)} each time`;
    case 'PERCENT': return lang === 'hi' ? `${ev?.baseHi} का ${b.value}%` : `${b.value}% of ${ev?.baseEn}`;
    case 'DISCOUNT_PCT': return lang === 'hi' ? `सामान्य फ़ीस पर ${b.value}% छूट` : `${b.value}% off the normal fee`;
  }
}

// ───────────────────────────── warnings an admin must acknowledge ─────────────────────────────
export type BillingWarning = 'BAR_COUNCIL' | 'BROKER_FREE_PROMISE' | 'DEAL_PRIVACY';
export const WARNINGS: Record<BillingWarning, { en: string; hi: string }> = {
  BAR_COUNCIL: {
    en: 'A percentage of an advocate’s fee can count as fee-sharing with a non-advocate under Bar Council of India rules. Have an advocate confirm before switching this on.',
    hi: 'वकील की फ़ीस का प्रतिशत लेना बार काउंसिल ऑफ़ इंडिया के नियमों में ग़ैर-वकील के साथ फ़ीस बाँटना माना जा सकता है। चालू करने से पहले किसी वकील से पुष्टि कराइए।',
  },
  BROKER_FREE_PROMISE: {
    en: 'Brokers were told GENZ is free for them. Tell them before this starts — the rule applies only from its start date and they see it on their Plans & Fees screen.',
    hi: 'ब्रोकरों को बताया गया है कि GENZ उनके लिए मुफ़्त है। शुरू होने से पहले उन्हें बताइए — नियम सिर्फ़ शुरू होने की तारीख़ से लागू होगा और वे इसे अपनी प्लान व फ़ीस स्क्रीन पर देखेंगे।',
  },
  DEAL_PRIVACY: {
    en: 'A percentage fee on broker-to-broker commission lets GENZ work out each deal’s commission from the fee — against the promise that GENZ sees only totals. GENZ’s screens hide the deal and the base amount, but the fee itself reveals it.',
    hi: 'ब्रोकर-से-ब्रोकर कमीशन पर प्रतिशत फ़ीस से GENZ हर डील का कमीशन फ़ीस से निकाल सकता है — जबकि वादा है कि GENZ सिर्फ़ कुल जोड़ देखता है। GENZ की स्क्रीन पर डील और आधार रक़म छिपी रहती है, पर फ़ीस से अंदाज़ा लग जाता है।',
  },
};
export function ruleWarnings(r: Pick<FeeRule, 'event' | 'mode' | 'active'>): BillingWarning[] {
  const w: BillingWarning[] = [];
  if (r.event === 'LEGAL_CASE' && r.mode === 'PERCENT') w.push('BAR_COUNCIL');
  if (r.event === 'BROKER_DEAL' && r.active) w.push('BROKER_FREE_PROMISE');
  if (r.event === 'BROKER_DEAL' && r.mode === 'PERCENT') w.push('DEAL_PRIVACY');
  return w;
}
export function planWarnings(p: Pick<Plan, 'segments' | 'fees' | 'active' | 'monthly' | 'yearly'>): BillingWarning[] {
  const w: BillingWarning[] = [];
  if (p.fees.LEGAL_CASE?.type === 'PERCENT') w.push('BAR_COUNCIL');
  if (p.active && p.segments.some(s => s.startsWith('BROKER_')) && ((p.monthly || 0) > 0 || (p.yearly || 0) > 0)) w.push('BROKER_FREE_PROMISE');
  if (p.fees.BROKER_DEAL?.type === 'PERCENT') w.push('DEAL_PRIVACY');
  return w;
}

export const GRACE_DAYS = 30;
export type EntryStatus = 'DUE' | 'MARKED_PAID' | 'CONFIRMED' | 'REJECTED' | 'WAIVED' | 'CANCELLED';
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso); d.setUTCMonth(d.getUTCMonth() + months); return d.toISOString();
}
