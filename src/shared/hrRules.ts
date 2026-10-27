/**
 * v76 — HR for a broker's / builder's / contractor's own people: day attendance (selfie + GPS), leave, targets, monthly statement,
 * claims, assets and holidays. Pure rules, no server imports (the unit tests and the browser use them directly).
 *
 * All dates are Indian dates ("YYYY-MM-DD" in Asia/Kolkata): a punch at 23:50 IST is that day's, whatever the server's clock zone is.
 */

export type HrFeature = 'ATTENDANCE' | 'LEAVE' | 'TARGETS' | 'STATEMENT' | 'CLAIMS' | 'ASSETS' | 'HOLIDAYS';
export const HR_FEATURES: HrFeature[] = ['ATTENDANCE', 'LEAVE', 'TARGETS', 'STATEMENT', 'CLAIMS', 'ASSETS', 'HOLIDAYS'];

/** Which HR features an employer's role gets. A builder runs a sales force (everything); a broker a small office (everything, kept light);
 *  a contractor's people work on sites (no sales targets, no incentive statement). Admins / owners / buyers / lawyers: none. */
export function hrFeaturesFor(employerRole?: string): HrFeature[] {
  switch (employerRole) {
    case 'DEVELOPER_BUILDER': case 'BROKER': return [...HR_FEATURES];
    case 'CONTRACTOR': return ['ATTENDANCE', 'LEAVE', 'CLAIMS', 'ASSETS', 'HOLIDAYS'];
    default: return [];
  }
}
export const isHrEmployer = (role?: string) => hrFeaturesFor(role).length > 0;

// ───────────────────────── Indian dates ─────────────────────────
const IST_MS = 330 * 60_000;
export interface IstParts { date: string; minutes: number; dow: number }
/** the Indian date, minutes since midnight and weekday (0 = Sunday) of an instant */
export function istParts(ms: number): IstParts {
  const d = new Date(ms + IST_MS);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), dow: d.getUTCDay() };
}
export const istToday = (now = Date.now()) => istParts(now).date;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (s: unknown): s is string => typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
export const isMonth = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const dayMs = (date: string) => Date.parse(date + 'T00:00:00Z');
export const addDays = (date: string, n: number) => new Date(dayMs(date) + n * 86400000).toISOString().slice(0, 10);
export const dowOf = (date: string) => new Date(dayMs(date)).getUTCDay();
export const daysBetween = (from: string, to: string) => Math.round((dayMs(to) - dayMs(from)) / 86400000);
export function monthBounds(month: string): { from: string; to: string; days: number } {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`; const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from, to: `${month}-${String(last).padStart(2, '0')}`, days: last };
}
export const monthOf = (date: string) => date.slice(0, 7);
export const timeOf = (ms: number) => { const p = istParts(ms); return `${String(Math.floor(p.minutes / 60)).padStart(2, '0')}:${String(p.minutes % 60).padStart(2, '0')}`; };

// ───────────────────────── employer settings ─────────────────────────
export interface HrHoliday { date: string; label: string }
export interface HrSettingsLike {
  /** "HH:MM" — the working day starts */
  workStart: string;
  /** minutes after workStart that are still "on time" */
  graceMin: number;
  /** 0 = Sunday … 6 = Saturday */
  weeklyOff: number[];
  /** paid leave days per calendar year (casual + sick share it) */
  leaveAllowance: number;
  /** the employer's own holidays; the national ones below come on their own */
  holidays: HrHoliday[];
  /** national holidays the employer switched off, as "MM-DD" */
  mutedNational: string[];
  /** a selfie with every punch-in? */
  selfie: boolean;
}
export const DEFAULT_HR_SETTINGS: HrSettingsLike = { workStart: '10:00', graceMin: 15, weeklyOff: [0], leaveAllowance: 12, holidays: [], mutedNational: [], selfie: true };

/** fixed-date national holidays (the ones that move every year — Diwali, Holi, Eid — the employer adds himself) */
export const NATIONAL_HOLIDAYS: Array<{ md: string; label: string; hi: string }> = [
  { md: '01-26', label: 'Republic Day', hi: 'गणतंत्र दिवस' },
  { md: '08-15', label: 'Independence Day', hi: 'स्वतंत्रता दिवस' },
  { md: '10-02', label: 'Gandhi Jayanti', hi: 'गांधी जयंती' },
  { md: '12-25', label: 'Christmas', hi: 'क्रिसमस' },
];
export function holidayOn(s: HrSettingsLike, date: string): string | null {
  const own = s.holidays.find(h => h.date === date); if (own) return own.label;
  const md = date.slice(5);
  const nat = NATIONAL_HOLIDAYS.find(h => h.md === md);
  return nat && !s.mutedNational.includes(md) ? nat.label : null;
}
export const isWeeklyOff = (s: HrSettingsLike, date: string) => s.weeklyOff.includes(dowOf(date));
export const isWorkingDay = (s: HrSettingsLike, date: string) => !isWeeklyOff(s, date) && !holidayOn(s, date);
/** the holidays of a month, for the calendar list (national + own, in date order) */
export function holidaysIn(s: HrSettingsLike, month: string): HrHoliday[] {
  const { from, to, days } = monthBounds(month); const out: HrHoliday[] = [];
  for (let i = 0; i < days; i++) { const d = addDays(from, i); const l = holidayOn(s, d); if (l && d <= to) out.push({ date: d, label: l }); }
  return out;
}

/** validates a settings patch; returns an error string or the clean settings */
export function cleanSettings(input: any, cur: HrSettingsLike): HrSettingsLike | string {
  const out: HrSettingsLike = { ...cur, weeklyOff: [...cur.weeklyOff], holidays: cur.holidays.map(h => ({ ...h })), mutedNational: [...cur.mutedNational] };
  if (input.workStart !== undefined) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(input.workStart))) return 'Work start must be like 10:00'; out.workStart = String(input.workStart); }
  if (input.graceMin !== undefined) { const v = Number(input.graceMin); if (!Number.isInteger(v) || v < 0 || v > 120) return 'Grace time must be 0–120 minutes'; out.graceMin = v; }
  if (input.weeklyOff !== undefined) {
    if (!Array.isArray(input.weeklyOff) || input.weeklyOff.length > 3 || input.weeklyOff.some((x: unknown) => !Number.isInteger(x) || (x as number) < 0 || (x as number) > 6)) return 'Weekly off must be up to 3 weekdays';
    out.weeklyOff = [...new Set(input.weeklyOff as number[])].sort();
  }
  if (input.leaveAllowance !== undefined) { const v = Number(input.leaveAllowance); if (!Number.isInteger(v) || v < 0 || v > 60) return 'Leave days a year must be 0–60'; out.leaveAllowance = v; }
  if (input.selfie !== undefined) { if (typeof input.selfie !== 'boolean') return 'selfie must be true or false'; out.selfie = input.selfie; }
  if (input.holidays !== undefined) {
    if (!Array.isArray(input.holidays) || input.holidays.length > 60) return 'Too many holidays';
    const seen = new Set<string>(); const list: HrHoliday[] = [];
    for (const h of input.holidays) {
      if (!isDate(h?.date)) return 'Holiday date must be YYYY-MM-DD';
      const label = String(h?.label || '').trim().slice(0, 60); if (label.length < 2) return 'Give each holiday a name';
      if (seen.has(h.date)) continue; seen.add(h.date); list.push({ date: h.date, label });
    }
    out.holidays = list.sort((a, b) => a.date.localeCompare(b.date));
  }
  if (input.mutedNational !== undefined) {
    if (!Array.isArray(input.mutedNational) || input.mutedNational.some((x: unknown) => !NATIONAL_HOLIDAYS.some(h => h.md === x))) return 'Unknown national holiday';
    out.mutedNational = [...new Set(input.mutedNational as string[])];
  }
  return out;
}

// ───────────────────────── attendance ─────────────────────────
export type DayCode = 'P' | 'L' | 'H' | 'A' | 'V' | 'O' | '-';
/** P present · L late · H half day · A absent · V on leave · O off (weekly off / holiday) · - not yet / before joining */
export const DAY_LABEL: Record<DayCode, { en: string; hi: string }> = {
  P: { en: 'Present', hi: 'हाज़िर' }, L: { en: 'Late', hi: 'देर से' }, H: { en: 'Half day', hi: 'आधा दिन' }, A: { en: 'Absent', hi: 'ग़ैरहाज़िर' },
  V: { en: 'On leave', hi: 'छुट्टी' }, O: { en: 'Off', hi: 'छुट्टी का दिन' }, '-': { en: '—', hi: '—' },
};

/** minutes late for a punch-in; 0 while inside the grace time */
export function lateMinutes(s: HrSettingsLike, inAtMs: number): number {
  const [h, m] = s.workStart.split(':').map(Number);
  const late = istParts(inAtMs).minutes - (h * 60 + m);
  return late > s.graceMin ? late : 0;
}

export interface AttRecordLike { date: string; inAt?: string; outAt?: string; lateMin?: number; manual?: 'PRESENT' | 'HALF' | 'ABSENT' }
export interface LeaveLike { from: string; to: string; status: string }

/** The code for one person on one day. `joined` = the date he was added (nothing is "absent" before that). */
export function dayCode(s: HrSettingsLike, date: string, rec: AttRecordLike | undefined, leaves: LeaveLike[], today: string, joined?: string): DayCode {
  if (joined && date < joined) return '-';
  if (rec?.manual === 'ABSENT') return 'A';
  if (rec?.manual === 'HALF') return 'H';
  if (rec?.manual === 'PRESENT') return 'P';
  if (rec?.inAt) return (rec.lateMin || 0) > 0 ? 'L' : 'P';
  if (leaves.some(l => l.status === 'APPROVED' && l.from <= date && date <= l.to)) return 'V';
  if (!isWorkingDay(s, date)) return 'O';
  if (date > today) return '-';
  if (date === today) return '-';   // today stays open until the day is over (the board shows "not in yet" instead)
  return 'A';
}

export interface AttSummary { P: number; L: number; H: number; A: number; V: number; O: number; workingDays: number; presentDays: number }
/** counts for a month up to `today`; presentDays counts a half day as 0.5 */
export function summarize(codes: DayCode[]): AttSummary {
  const c: AttSummary = { P: 0, L: 0, H: 0, A: 0, V: 0, O: 0, workingDays: 0, presentDays: 0 };
  for (const x of codes) if (x !== '-') c[x]++;
  c.workingDays = c.P + c.L + c.H + c.A + c.V;
  c.presentDays = c.P + c.L + c.H * 0.5;
  return c;
}
export function monthCodes(s: HrSettingsLike, month: string, recs: AttRecordLike[], leaves: LeaveLike[], today: string, joined?: string): Array<{ date: string; code: DayCode }> {
  const { from, days } = monthBounds(month); const by = new Map(recs.map(r => [r.date, r]));
  return Array.from({ length: days }, (_, i) => { const date = addDays(from, i); return { date, code: dayCode(s, date, by.get(date), leaves, today, joined) }; });
}

/** what the "Today" board shows for one person */
export type TodayState = 'IN' | 'LATE' | 'OUT' | 'ON_LEAVE' | 'OFF' | 'ABSENT' | 'NOT_YET' | 'HALF';
export function todayState(s: HrSettingsLike, rec: AttRecordLike | undefined, leaves: LeaveLike[], now: number, joined?: string): TodayState {
  const p = istParts(now);
  if (rec?.manual === 'ABSENT') return 'ABSENT';
  if (rec?.manual === 'HALF') return 'HALF';
  if (rec?.inAt) return rec.outAt ? 'OUT' : (rec.lateMin || 0) > 0 ? 'LATE' : 'IN';
  if (rec?.manual === 'PRESENT') return 'IN';
  if (leaves.some(l => l.status === 'APPROVED' && l.from <= p.date && p.date <= l.to)) return 'ON_LEAVE';
  if (joined && p.date < joined) return 'OFF';
  if (!isWorkingDay(s, p.date)) return 'OFF';
  const [h, m] = s.workStart.split(':').map(Number);
  return p.minutes > h * 60 + m + s.graceMin ? 'ABSENT' : 'NOT_YET';
}

// ───────────────────────── leave ─────────────────────────
export const LEAVE_TYPES: Array<{ id: 'CASUAL' | 'SICK' | 'UNPAID'; en: string; hi: string; paid: boolean }> = [
  { id: 'CASUAL', en: 'Casual leave', hi: 'कैज़ुअल छुट्टी', paid: true },
  { id: 'SICK', en: 'Sick leave', hi: 'बीमारी की छुट्टी', paid: true },
  { id: 'UNPAID', en: 'Unpaid leave', hi: 'बिना वेतन छुट्टी', paid: false },
];
export const isPaidLeave = (t: string) => LEAVE_TYPES.find(x => x.id === t)?.paid ?? false;
export const MAX_LEAVE_SPAN = 31;
export const MAX_BACKDATE = 7;

/** working days inside from..to (weekly offs and holidays are not leave days) */
export function leaveDays(s: HrSettingsLike, from: string, to: string): number {
  if (!isDate(from) || !isDate(to) || to < from) return 0;
  const span = daysBetween(from, to) + 1; if (span > MAX_LEAVE_SPAN) return 0;
  let n = 0; for (let i = 0; i < span; i++) if (isWorkingDay(s, addDays(from, i))) n++;
  return n;
}
export const overlaps = (a: { from: string; to: string }, b: { from: string; to: string }) => a.from <= b.to && b.from <= a.to;

export interface LeaveRec extends LeaveLike { days: number; type: string }
/** paid-leave days used / waiting / left in a calendar year (leave that crosses new year counts in the year it starts) */
export function leaveBalance(s: HrSettingsLike, leaves: LeaveRec[], year: string) {
  const inYear = leaves.filter(l => l.from.slice(0, 4) === year && isPaidLeave(l.type));
  const used = inYear.filter(l => l.status === 'APPROVED').reduce((a, l) => a + l.days, 0);
  const pending = inYear.filter(l => l.status === 'PENDING').reduce((a, l) => a + l.days, 0);
  return { allowance: s.leaveAllowance, used, pending, left: Math.max(0, s.leaveAllowance - used - pending) };
}

/** validates a leave request; returns an error string or the clean request with its working-day count */
export function checkLeave(s: HrSettingsLike, input: { from?: string; to?: string; type?: string; reason?: string }, existing: LeaveRec[], today: string): string | { from: string; to: string; type: string; reason: string; days: number } {
  if (!isDate(input.from) || !isDate(input.to)) return 'Pick the first and last day of the leave';
  if (input.to < input.from) return 'The last day cannot be before the first day';
  if (daysBetween(input.from, input.to) + 1 > MAX_LEAVE_SPAN) return `A request can cover at most ${MAX_LEAVE_SPAN} days`;
  if (daysBetween(input.from, today) > MAX_BACKDATE) return `A leave can be asked at most ${MAX_BACKDATE} days after the fact`;
  const type = String(input.type || 'CASUAL'); if (!LEAVE_TYPES.some(t => t.id === type)) return 'Pick a leave type';
  const reason = String(input.reason || '').trim(); if (reason.length < 3) return 'Write a short reason';
  const days = leaveDays(s, input.from, input.to);
  if (days === 0) return 'These dates are all weekly offs or holidays — no leave is needed';
  if (existing.some(l => (l.status === 'PENDING' || l.status === 'APPROVED') && overlaps(l, { from: input.from!, to: input.to! }))) return 'You already have a leave request on these dates';
  if (isPaidLeave(type)) {
    const b = leaveBalance(s, existing, input.from.slice(0, 4));
    if (days > b.left) return `Only ${b.left} paid leave day(s) left this year — ask for unpaid leave for the rest`;
  }
  return { from: input.from, to: input.to, type, reason: reason.slice(0, 300), days };
}

// ───────────────────────── targets ─────────────────────────
export const TARGET_METRICS = ['calls', 'visits', 'bookings'] as const;
export type TargetMetric = typeof TARGET_METRICS[number];
export type TargetSet = Record<TargetMetric, number>;
export const METRIC_LABEL: Record<TargetMetric, { en: string; hi: string }> = {
  calls: { en: 'Calls', hi: 'कॉल' }, visits: { en: 'Site visits', hi: 'साइट विज़िट' }, bookings: { en: 'Bookings', hi: 'बुकिंग' },
};
/** a starting point the employer can change, by the person's role */
export function suggestTarget(teamRole?: string): TargetSet {
  switch (teamRole) {
    case 'TELECALLER': return { calls: 400, visits: 20, bookings: 0 };
    case 'SALES_EXECUTIVE': return { calls: 150, visits: 15, bookings: 2 };
    case 'SITE_COORDINATOR': return { calls: 50, visits: 40, bookings: 0 };
    case 'CLOSING_MANAGER': return { calls: 60, visits: 20, bookings: 4 };
    default: return { calls: 100, visits: 10, bookings: 1 };
  }
}
export function cleanTarget(input: any): string | TargetSet {
  const out = { calls: 0, visits: 0, bookings: 0 } as TargetSet;
  for (const k of TARGET_METRICS) {
    const v = Number(input?.[k] ?? 0);
    if (!Number.isInteger(v) || v < 0 || v > 5000) return `${METRIC_LABEL[k].en} target must be a whole number up to 5000`;
    out[k] = v;
  }
  if (!TARGET_METRICS.some(k => out[k] > 0)) return 'Set at least one target';
  return out;
}
export type Pace = 'AHEAD' | 'ON_TRACK' | 'BEHIND';
export interface Progress { metric: TargetMetric; target: number; actual: number; pct: number }
/** how much of the month's work days are over, 0..1 (a month with no working day counts as over) */
export function monthElapsed(s: HrSettingsLike, month: string, today: string): number {
  const { from, days } = monthBounds(month); let total = 0, gone = 0;
  for (let i = 0; i < days; i++) { const d = addDays(from, i); if (!isWorkingDay(s, d)) continue; total++; if (d <= today) gone++; }
  return total === 0 ? 1 : gone / total;
}
export function targetProgress(target: TargetSet, actual: TargetSet, elapsed: number): { rows: Progress[]; overall: number; pace: Pace } {
  const rows: Progress[] = TARGET_METRICS.filter(k => target[k] > 0).map(k => ({ metric: k, target: target[k], actual: actual[k] || 0, pct: Math.round((actual[k] || 0) * 100 / target[k]) }));
  const overall = rows.length ? Math.round(rows.reduce((a, r) => a + Math.min(r.pct, 100), 0) / rows.length) : 0;
  const want = elapsed * 100;
  const pace: Pace = overall >= want + 10 ? 'AHEAD' : overall >= want - 10 ? 'ON_TRACK' : 'BEHIND';
  return { rows, overall, pace };
}

// ───────────────────────── monthly statement ─────────────────────────
export interface Adjustment { label: string; amount: number }
export function cleanAdjustments(input: any): string | Adjustment[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 12) return 'Up to 12 adjustment lines';
  const out: Adjustment[] = [];
  for (const a of input) {
    const label = String(a?.label || '').trim().slice(0, 60); const amount = Math.round(Number(a?.amount));
    if (label.length < 2) return 'Name each adjustment line';
    if (!Number.isFinite(amount) || Math.abs(amount) > 10_000_000 || amount === 0) return 'Adjustment amount must be a non-zero rupee figure';
    out.push({ label, amount });
  }
  return out;
}
export const cleanFixed = (v: unknown): number | string => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? n : 'Fixed pay must be a rupee figure (0 or more)'; };
export function netPay(fixed: number, incentive: number, adjustments: Adjustment[]) {
  return Math.round(fixed + incentive + adjustments.reduce((a, x) => a + x.amount, 0));
}

// ───────────────────────── claims & assets ─────────────────────────
export const CLAIM_KINDS: Array<{ id: string; en: string; hi: string }> = [
  { id: 'PETROL', en: 'Petrol', hi: 'पेट्रोल' }, { id: 'TRAVEL', en: 'Travel / ticket', hi: 'यात्रा / टिकट' }, { id: 'FOOD', en: 'Food on duty', hi: 'ड्यूटी पर खाना' },
  { id: 'PHONE', en: 'Phone / data', hi: 'फ़ोन / डेटा' }, { id: 'SITE', en: 'Site expense', hi: 'साइट ख़र्च' }, { id: 'OTHER', en: 'Other', hi: 'अन्य' },
];
export const CLAIM_MAX = 50_000; export const CLAIM_PENDING_MAX = 8;
export function cleanClaim(input: any, today: string): string | { date: string; kind: string; amount: number; note: string } {
  const date = input?.date ?? today; if (!isDate(date)) return 'Pick the date of the expense';
  if (date > today) return 'The expense date cannot be in the future';
  if (daysBetween(date, today) > 60) return 'Claims older than 60 days are not accepted';
  const kind = String(input?.kind || ''); if (!CLAIM_KINDS.some(k => k.id === kind)) return 'Pick the kind of expense';
  const amount = Math.round(Number(input?.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 1 || amount > CLAIM_MAX) return `Amount must be between ₹1 and ₹${CLAIM_MAX.toLocaleString('en-IN')}`;
  const note = String(input?.note || '').trim().slice(0, 200);
  if (note.length < 3) return 'Write what the expense was for';
  return { date, kind, amount, note };
}
export const ASSET_KINDS: Array<{ id: string; en: string; hi: string }> = [
  { id: 'PHONE', en: 'Phone', hi: 'फ़ोन' }, { id: 'SIM', en: 'SIM card', hi: 'सिम कार्ड' }, { id: 'LAPTOP', en: 'Laptop / tablet', hi: 'लैपटॉप / टैबलेट' },
  { id: 'KEYS', en: 'Site keys', hi: 'साइट की चाबियाँ' }, { id: 'BROCHURE', en: 'Brochures / material', hi: 'ब्रोशर / सामग्री' }, { id: 'TOOLS', en: 'Tools / equipment', hi: 'औज़ार / उपकरण' },
  { id: 'ID_CARD', en: 'ID card / uniform', hi: 'आईडी कार्ड / यूनिफ़ॉर्म' }, { id: 'OTHER', en: 'Other', hi: 'अन्य' },
];
