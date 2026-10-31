/**
 * v60 — Rent desk: a rented home after the deal — the terms both sides agreed, the tenant's police verification, the renewal and
 * the day the tenant leaves. Pure rules shared by the server (what is stored, when reminders go) and the broker's screen. No imports.
 *
 * GENZ never holds rent or deposit: the tenant pays the owner directly. The broker keeps the record, the reminders and the checklist;
 * the rent agreement itself is made by the parties on stamp paper (a lawyer / notary) — the term sheet here is not an agreement.
 */
export const RENT_LIMITS = {
  rentMin: 500, rentMax: 1_000_000,
  depositMax: 10_000_000,
  monthsMin: 1, monthsMax: 60, monthsDefault: 11,
  escalationMax: 20, lockInMax: 36,
  noticeMaxDays: 180, noticeDefaultDays: 30,
  /** reminders before the end of the term (days) */
  remind: [60, 30, 7] as const,
  /** the police verification reminder goes this many days after the start, while it is not done */
  policeAfterDays: 7,
  /** names and numbers are erased this many days after the tenancy ends */
  keepDays: 180,
  place: 80, note: 300, name: 60, ref: 40,
  /** one broker's tenancies (a guard, far above real use) */
  perBroker: 2000,
} as const;

export const AGREEMENT_STEPS = [
  { id: 'NONE', en: 'Not made yet', hi: 'अभी नहीं बना' },
  { id: 'DRAFTED', en: 'Draft ready', hi: 'ड्राफ़्ट तैयार' },
  { id: 'SIGNED', en: 'Signed before a notary', hi: 'नोटरी के सामने साइन' },
  { id: 'REGISTERED', en: 'Registered', hi: 'रजिस्टर्ड' },
] as const;
export type AgreementStep = typeof AGREEMENT_STEPS[number]['id'];

export const POLICE_STEPS = [
  { id: 'NOT_STARTED', en: 'Not started', hi: 'शुरू नहीं' },
  { id: 'SUBMITTED', en: 'Form submitted', hi: 'फ़ॉर्म जमा' },
  { id: 'DONE', en: 'Verified', hi: 'वेरिफ़ाई हो गया' },
] as const;
export type PoliceStep = typeof POLICE_STEPS[number]['id'];

export const TENANCY_STATUSES = [
  { id: 'ACTIVE', en: 'Running', hi: 'चल रहा' },
  { id: 'NOTICE', en: 'Notice given', hi: 'नोटिस दिया' },
  { id: 'ENDED', en: 'Ended', hi: 'ख़त्म' },
] as const;
export type TenancyStatus = typeof TENANCY_STATUSES[number]['id'];

export const PAYER = [
  { id: 'OWNER', en: 'Owner', hi: 'मालिक' },
  { id: 'TENANT', en: 'Tenant', hi: 'किरायेदार' },
] as const;

/** the tenant's police verification — what to carry (any state: the local police station, or your state police’s citizen portal) */
export const POLICE_CHECKLIST = [
  { en: 'Tenant’s passport-size photo', hi: 'किरायेदार की पासपोर्ट साइज़ फ़ोटो' },
  { en: 'Tenant’s ID copy: Aadhaar / voter card / driving licence / PAN / passport', hi: 'किरायेदार की ID कॉपी: आधार / वोटर कार्ड / ड्राइविंग लाइसेंस / पैन / पासपोर्ट' },
  { en: 'Tenant’s permanent (home-town) address and one family contact', hi: 'किरायेदार का स्थायी (घर का) पता और परिवार का एक संपर्क' },
  { en: 'Owner’s name and address, and the rented address', hi: 'मालिक का नाम और पता, और किराये के घर का पता' },
  { en: 'Submit at the local police station (thana) or online on your state police’s citizen portal — keep the acknowledgement number', hi: 'नज़दीकी थाने में या अपने राज्य पुलिस के सिटीज़न पोर्टल पर ऑनलाइन जमा करें — पावती (acknowledgement) नंबर रखें' },
] as const;
export const NEVER_STORE = {
  en: 'Do not upload the tenant’s Aadhaar or any ID here — it goes to the police, not to GENZ. GENZ keeps only the step, the date, the police station and the acknowledgement number.',
  hi: 'किरायेदार का आधार या कोई ID यहाँ अपलोड न करें — वो पुलिस के पास जाती है, GENZ के पास नहीं। GENZ सिर्फ़ स्टेप, तारीख़, थाना और पावती नंबर रखता है।',
} as const;

/** the broker's promise when he records a tenancy */
export const RENT_CONSENT_TEXT = {
  en: 'The owner and the tenant know that I keep their name and number on GENZ for this tenancy — for reminders, renewal and re-letting. GENZ erases them 180 days after the tenancy ends.',
  hi: 'मालिक और किरायेदार जानते हैं कि इस किरायेदारी के लिए मैं उनका नाम और नंबर GENZ पर रखता हूँ — याद दिलाने, रिन्यू करने और दोबारा किराये पर देने के लिए। किरायेदारी ख़त्म होने के 180 दिन बाद GENZ इन्हें मिटा देता है।',
} as const;

/** the term sheet is not the agreement */
export const SHEET_NOTE = {
  en: 'These are the terms the owner and the tenant agreed through their broker. This is not the rent agreement: make the agreement on stamp paper and sign it before a notary. A lease of a year or more must be registered — that is why most rent agreements are for 11 months. GENZ never holds rent or deposit; the tenant pays the owner directly.',
  hi: 'ये वो शर्तें हैं जिन पर मालिक और किरायेदार ब्रोकर के ज़रिए राज़ी हुए। ये किराया अनुबंध नहीं है: अनुबंध स्टाम्प पेपर पर बनवाएँ और नोटरी के सामने साइन करें। एक साल या उससे लंबी लीज़ रजिस्टर करानी पड़ती है — इसीलिए ज़्यादातर अनुबंध 11 महीने के होते हैं। GENZ किराया या डिपॉज़िट कभी नहीं रखता; किरायेदार सीधे मालिक को देता है।',
} as const;

// ───────────────────────── dates (calendar days, IST) ─────────────────────────
export const DAY_MS = 86_400_000;
export const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
export const todayIst = (now = Date.now()) => new Date(now + 330 * 60_000).toISOString().slice(0, 10);
/** the last day of a term: "2026-11-01" + 11 months → "2027-09-30" */
export function endOf(startOn: string, months: number): string {
  const s = new Date(startOn + 'T00:00:00Z');
  const y = s.getUTCFullYear(); const m = s.getUTCMonth() + months; const dd = s.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // last day of the month the term runs into
  // the day before the same date that many months on; a start on the 29th–31st that month lacks ends on its last day
  return new Date(Date.UTC(y, m, dd > last ? last : dd - 1)).toISOString().slice(0, 10);
}
export const addDays = (day: string, n: number) => { const t = new Date(day + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
/** whole days from today (IST) to that day: 0 = today, negative = past */
export const daysTo = (day: string, now = Date.now()) => Math.round((Date.parse(day + 'T00:00:00Z') - Date.parse(todayIst(now) + 'T00:00:00Z')) / DAY_MS);
/** "2027-09-30" → "30 Sep 2027" / "30 सित॰ 2027" */
export const humanDay = (day: string, hi = false) => { try { return new Date(day + 'T00:00:00Z').toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); } catch { return day; } };
export const rupees = (n: number) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
/** the rent after the yearly increase, rounded to ₹10 */
export const nextRent = (rent: number, pct = 0) => Math.round((rent * (1 + Math.max(0, pct || 0) / 100)) / 10) * 10;

// ───────────────────────── what needs the broker's eye ─────────────────────────
export type RentFlag = 'OVERDUE' | 'ENDING_7' | 'ENDING_30' | 'ENDING_60' | 'POLICE' | 'NOTICE';
export interface FlagInput { status: string; startOn: string; endOn: string; police: { status: string } }
export function flagsOf(t: FlagInput, now = Date.now()): RentFlag[] {
  if (t.status === 'ENDED') return [];
  const out: RentFlag[] = [];
  const left = daysTo(t.endOn, now);
  if (left < 0) out.push('OVERDUE'); else if (left <= 7) out.push('ENDING_7'); else if (left <= 30) out.push('ENDING_30'); else if (left <= 60) out.push('ENDING_60');
  if (t.police.status !== 'DONE' && daysTo(t.startOn, now) <= 0) out.push('POLICE');
  if (t.status === 'NOTICE') out.push('NOTICE');
  return out;
}
export const FLAG_TEXT: Record<RentFlag, { en: string; hi: string; tone: 'red' | 'amber' | 'slate' }> = {
  OVERDUE: { en: 'Term is over — renew it or record the vacating', hi: 'अवधि ख़त्म — रिन्यू करें या ख़ाली होना दर्ज करें', tone: 'red' },
  ENDING_7: { en: 'Ends within 7 days', hi: '7 दिन में ख़त्म', tone: 'red' },
  ENDING_30: { en: 'Ends within 30 days', hi: '30 दिन में ख़त्म', tone: 'amber' },
  ENDING_60: { en: 'Ends within 60 days', hi: '60 दिन में ख़त्म', tone: 'amber' },
  POLICE: { en: 'Police verification pending', hi: 'पुलिस वेरिफ़िकेशन बाक़ी', tone: 'amber' },
  NOTICE: { en: 'Notice given — vacating soon', hi: 'नोटिस दिया — जल्द ख़ाली होगा', tone: 'slate' },
};
/** which reminder (if any) is due now: the latest threshold the term has crossed that was not sent yet */
export function dueReminder(t: FlagInput & { reminded?: Partial<Record<'d60' | 'd30' | 'd7' | 'over', string>> }, now = Date.now()): 'd60' | 'd30' | 'd7' | 'over' | null {
  if (t.status === 'ENDED') return null;
  const left = daysTo(t.endOn, now); const r = t.reminded || {};
  if (left < 0) return r.over ? null : 'over';
  if (left <= 7) return r.d7 ? null : 'd7';
  if (left <= 30) return r.d30 || r.d7 ? null : 'd30';
  if (left <= 60) return r.d60 || r.d30 || r.d7 ? null : 'd60';
  return null;
}

// ───────────────────────── WhatsApp lines (sent from the broker's own phone) ─────────────────────────
export type WaKind = 'OWNER_RENEW' | 'TENANT_RENEW' | 'POLICE' | 'TERMS';
export interface WaInput {
  place: string; ownerName: string; tenantName: string; rent: number; deposit: number; maintenance?: number;
  startOn: string; endOn: string; lockInMonths?: number; escalationPct?: number; noticeDays?: number;
}
const first = (n: string) => String(n || '').trim().split(/\s+/)[0] || '';
export function waText(kind: WaKind, t: WaInput, hi: boolean, broker: string): string {
  const end = humanDay(t.endOn, hi); const start = humanDay(t.startOn, hi);
  const nr = rupees(nextRent(t.rent, t.escalationPct)); const notice = t.noticeDays ?? RENT_LIMITS.noticeDefaultDays;
  const sign = broker ? `\n— ${broker}` : '';
  if (kind === 'OWNER_RENEW') return hi
    ? `नमस्ते ${first(t.ownerName)} जी, ${t.place} का किराया अनुबंध ${end} को ख़त्म हो रहा है। इसी किरायेदार को आगे रखना है (नया किराया लगभग ${nr}) या नया किरायेदार ढूँढूँ? बता दीजिए।${sign}`
    : `Namaste ${first(t.ownerName)} ji, the rent agreement of ${t.place} ends on ${end}. Shall we renew with the same tenant (new rent about ${nr}) or should I find a new tenant? Please let me know.${sign}`;
  if (kind === 'TENANT_RENEW') return hi
    ? `नमस्ते ${first(t.tenantName)} जी, ${t.place} का आपका किराया अनुबंध ${end} को ख़त्म हो रहा है। आगे रहना हो तो बताइए — नया किराया लगभग ${nr} होगा। ख़ाली करना हो तो ${notice} दिन पहले बताना ज़रूरी है।${sign}`
    : `Namaste ${first(t.tenantName)} ji, your rent agreement for ${t.place} ends on ${end}. If you want to stay on, the new rent will be about ${nr}. If you plan to move out, please tell us ${notice} days before.${sign}`;
  if (kind === 'POLICE') return hi
    ? `नमस्ते ${first(t.ownerName)} जी, ${t.place} के किरायेदार ${first(t.tenantName)} जी का पुलिस वेरिफ़िकेशन ज़रूरी है। किरायेदार की फ़ोटो और ID कॉपी के साथ नज़दीकी थाने में या अपने राज्य पुलिस के सिटीज़न पोर्टल पर फ़ॉर्म जमा करें, और पावती नंबर मुझे भेज दें।${sign}`
    : `Namaste ${first(t.ownerName)} ji, the police verification of ${first(t.tenantName)} ji, the tenant at ${t.place}, is required. Please submit the form with the tenant's photo and ID copy at the local police station or on your state police’s citizen portal, and send me the acknowledgement number.${sign}`;
  const lines = hi ? [
    `${t.place} — तय शर्तें`,
    `किराया: ${rupees(t.rent)} / महीना${t.maintenance ? ` + मेंटेनेंस ${rupees(t.maintenance)}` : ''}`,
    `सिक्योरिटी डिपॉज़िट: ${rupees(t.deposit)}`,
    `अवधि: ${start} से ${end}`,
    ...(t.lockInMonths ? [`लॉक-इन: ${t.lockInMonths} महीने`] : []),
    ...(t.escalationPct ? [`सालाना बढ़ोतरी: ${t.escalationPct}%`] : []),
    `नोटिस: ${notice} दिन`,
    'किराया और डिपॉज़िट सीधे मालिक को — GENZ पैसे नहीं रखता।',
  ] : [
    `${t.place} — agreed terms`,
    `Rent: ${rupees(t.rent)} / month${t.maintenance ? ` + maintenance ${rupees(t.maintenance)}` : ''}`,
    `Security deposit: ${rupees(t.deposit)}`,
    `Term: ${start} to ${end}`,
    ...(t.lockInMonths ? [`Lock-in: ${t.lockInMonths} months`] : []),
    ...(t.escalationPct ? [`Yearly increase: ${t.escalationPct}%`] : []),
    `Notice: ${notice} days`,
    'Rent and deposit go straight to the owner — GENZ never holds money.',
  ];
  return lines.join('\n') + sign;
}
/** wa.me link: to a 10-digit Indian mobile when known, else the share sheet */
export const waLink = (text: string, phone?: string) => {
  const d = String(phone || '').replace(/\D/g, '').slice(-10);
  return `https://wa.me/${/^[6-9]\d{9}$/.test(d) ? '91' + d : ''}?text=${encodeURIComponent(text)}`;
};
