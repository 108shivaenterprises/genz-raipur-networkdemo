/**
 * v17 "Network Pulse" — pure rules shared by the server, the browser and the tests.
 *
 * What it answers for the superadmin: how many people / brokers came each day, what the network sold, how much money
 * has been collected, how many projects are live. Nothing here moves money and nothing here stores more than a
 * user-id and a date (no page, no IP, no phone).
 */

/** India has one time zone. A "day" is an Indian calendar day, so the 12:05 am logins do not land in yesterday. */
export const IST_OFFSET_MIN = 330;
/** how long a daily activity record is kept (DPDP: no reason to keep it forever) */
export const KEEP_DAYS = 180;
export const ADMIN_ROLES = ['SUPERADMIN', 'ADMIN'];

export type ActivityKind = 'seen' | 'acted';
/** `id` = `day`: the PostgreSQL store keys every record by id (v20 fix — without it no save went through on Postgres) */
export interface ActivityDay { id?: string; day: string; seen: string[]; acted: string[] }

export type WindowKey = 'today' | 'yesterday' | 'd7' | 'd30';
export const WINDOWS: WindowKey[] = ['today', 'yesterday', 'd7', 'd30'];
export const WINDOW_DAYS: Record<WindowKey, number> = { today: 1, yesterday: 1, d7: 7, d30: 30 };

/** 'YYYY-MM-DD' of an instant, in Indian time */
export const dayKey = (ms: number): string => new Date(ms + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);

/** day of an ISO timestamp ('' when it is missing / not a date) */
export function dayOfIso(iso: string | undefined | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  return Number.isFinite(t) ? dayKey(t) : '';
}

/** the last n days, oldest first, the last one being today */
export function lastDays(n: number, nowMs: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(nowMs - i * 86_400_000));
  return out;
}

/** the days a window covers (today = [today], yesterday = [yesterday], d7 = last 7 incl. today, d30 = last 30 incl. today) */
export function windowDays(w: WindowKey, nowMs: number): string[] {
  if (w === 'yesterday') return [dayKey(nowMs - 86_400_000)];
  return lastDays(WINDOW_DAYS[w], nowMs);
}

export const isWindow = (w: unknown): w is WindowKey => typeof w === 'string' && (WINDOWS as string[]).includes(w);

// ───────────────────────── recording ─────────────────────────

/** Add `id` to a day's record. Doing something implies having been seen. Returns true when something was added. */
export function addActivity(days: ActivityDay[], day: string, id: string, kind: ActivityKind): boolean {
  if (!day || !id) return false;
  let rec = days.find(d => d.day === day);
  if (!rec) {
    rec = { id: day, day, seen: [], acted: [] };
    days.push(rec);
    if (days.length > 1 && days[days.length - 2].day > day) days.sort((a, b) => (a.day < b.day ? -1 : 1));
  }
  let changed = false;
  if (!rec.seen.includes(id)) { rec.seen.push(id); changed = true; }
  if (kind === 'acted' && !rec.acted.includes(id)) { rec.acted.push(id); changed = true; }
  return changed;
}

/** drop records older than `keep` days; returns how many were dropped */
export function pruneActivity(days: ActivityDay[], nowMs: number, keep = KEEP_DAYS): number {
  const oldest = dayKey(nowMs - (keep - 1) * 86_400_000);
  let n = 0;
  for (let i = days.length - 1; i >= 0; i--) if (days[i].day < oldest) { days.splice(i, 1); n++; }
  return n;
}

// ───────────────────────── history from the audit trail ─────────────────────────

export interface AuditLike { timestamp: string; actorId: string; action: string }
export interface DaySets { seen: Set<string>; acted: Set<string> }

/**
 * The audit trail already says who did what and when. For the days before the daily record existed it gives us the people who
 * DID something (a login counts as "seen", anything else as "acted"). Browsing without doing anything cannot be recovered.
 */
export function auditActivity(events: AuditLike[], knownIds: Set<string>): Map<string, DaySets> {
  const out = new Map<string, DaySets>();
  for (const e of events) {
    if (!knownIds.has(e.actorId) || e.action === 'LOGIN_FAILED') continue;
    const day = dayOfIso(e.timestamp);
    if (!day) continue;
    let s = out.get(day);
    if (!s) { s = { seen: new Set(), acted: new Set() }; out.set(day, s); }
    s.seen.add(e.actorId);
    if (e.action !== 'LOGIN_SUCCESS') s.acted.add(e.actorId);
  }
  return out;
}

/** one day, tracked record and audit history together */
export function daySets(rec: ActivityDay | undefined, audit: DaySets | undefined): DaySets {
  const seen = new Set<string>(); const acted = new Set<string>();
  for (const id of rec?.seen || []) seen.add(id);
  for (const id of rec?.acted || []) { seen.add(id); acted.add(id); }
  for (const id of audit?.seen || []) seen.add(id);
  for (const id of audit?.acted || []) { seen.add(id); acted.add(id); }
  return { seen, acted };
}

export interface DayCounts {
  day: string;
  /** every non-admin person who opened the app (or, on old days, did something) */
  people: number;
  /** the brokers among them */
  brokers: number;
  /** people who actually did something (wrote / changed / created) */
  acted: number;
  actedBrokers: number;
  /** tracked = the daily record exists; history = rebuilt from the audit trail only; none = nothing known */
  source: 'tracked' | 'history' | 'none';
}

export interface ActivityInput {
  days: ActivityDay[];
  audit: Map<string, DaySets>;
  /** role of a user id; undefined = unknown user (not counted) */
  roleOf: (id: string) => string | undefined;
}

const counted = (role: string | undefined) => !!role && !ADMIN_ROLES.includes(role);

export function dayCounts(day: string, inp: ActivityInput): DayCounts {
  const rec = inp.days.find(d => d.day === day);
  const au = inp.audit.get(day);
  const s = daySets(rec, au);
  const ppl = [...s.seen].filter(id => counted(inp.roleOf(id)));
  const act = [...s.acted].filter(id => counted(inp.roleOf(id)));
  return {
    day,
    people: ppl.length,
    brokers: ppl.filter(id => inp.roleOf(id) === 'BROKER').length,
    acted: act.length,
    actedBrokers: act.filter(id => inp.roleOf(id) === 'BROKER').length,
    source: rec ? 'tracked' : au ? 'history' : 'none',
  };
}

export function activitySeries(days: string[], inp: ActivityInput): DayCounts[] {
  return days.map(d => dayCounts(d, inp));
}

export interface WindowCounts { people: number; brokers: number; acted: number; actedBrokers: number }

/** unique people across all the days of a window (the same broker on 5 days counts once) */
export function windowSets(days: string[], inp: ActivityInput): { people: Set<string>; brokers: Set<string>; acted: Set<string>; actedBrokers: Set<string> } {
  const people = new Set<string>(); const acted = new Set<string>();
  for (const d of days) {
    const s = daySets(inp.days.find(x => x.day === d), inp.audit.get(d));
    for (const id of s.seen) if (counted(inp.roleOf(id))) people.add(id);
    for (const id of s.acted) if (counted(inp.roleOf(id))) acted.add(id);
  }
  const brokers = new Set([...people].filter(id => inp.roleOf(id) === 'BROKER'));
  const actedBrokers = new Set([...acted].filter(id => inp.roleOf(id) === 'BROKER'));
  return { people, brokers, acted, actedBrokers };
}

export function windowCounts(days: string[], inp: ActivityInput): WindowCounts {
  const w = windowSets(days, inp);
  return { people: w.people.size, brokers: w.brokers.size, acted: w.acted.size, actedBrokers: w.actedBrokers.size };
}

/** on how many days of the window was this person around (for the "who was active" list) */
export function daysActive(id: string, days: string[], inp: ActivityInput): number {
  let n = 0;
  for (const d of days) if (daySets(inp.days.find(x => x.day === d), inp.audit.get(d)).seen.has(id)) n++;
  return n;
}

/** first day a daily record exists (so the screen can say "counting since …") */
export function trackingSince(days: ActivityDay[]): string | null {
  return days.length ? days.reduce((m, d) => (d.day < m ? d.day : m), days[0].day) : null;
}

// ───────────────────────── bookings ─────────────────────────

export interface BookingLike {
  id: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | string;
  agreementValue: number;
  direct?: boolean;
  createdAt: string;
  decidedAt?: string;
}

export interface BookingTotals { count: number; value: number; collected: number }
export interface BookingStats {
  counts: { requested: number; approved: number; rejected: number; cancelled: number };
  /** sold through partners (the network) */
  network: BookingTotals;
  /** sold by a builder's own desk (no partner, no brokerage) — shown apart so the network number stays honest */
  direct: BookingTotals;
  /** by window: approved bookings (count and agreement value), network only and everything */
  byWindow: Record<WindowKey, { network: { count: number; value: number }; all: { count: number; value: number }; raised: number }>;
  series: { day: string; raised: number; approved: number }[];
}

const zero = (): BookingTotals => ({ count: 0, value: 0, collected: 0 });

/** the day a booking counts as "sold": when the builder approved it (older records: when it was raised) */
export const soldDay = (b: BookingLike) => dayOfIso(b.decidedAt || b.createdAt);

export function bookingStats(bookings: BookingLike[], collectedOf: (b: BookingLike) => number, nowMs: number, seriesDays = 30): BookingStats {
  const counts = { requested: 0, approved: 0, rejected: 0, cancelled: 0 };
  const network = zero(); const direct = zero();
  const wins = Object.fromEntries(WINDOWS.map(w => [w, new Set(windowDays(w, nowMs))])) as Record<WindowKey, Set<string>>;
  const byWindow = Object.fromEntries(WINDOWS.map(w => [w, { network: { count: 0, value: 0 }, all: { count: 0, value: 0 }, raised: 0 }])) as BookingStats['byWindow'];
  const sd = lastDays(seriesDays, nowMs);
  const series = sd.map(day => ({ day, raised: 0, approved: 0 }));
  const idx = new Map(series.map((s, i) => [s.day, i]));

  for (const b of bookings) {
    const raisedDay = dayOfIso(b.createdAt);
    for (const w of WINDOWS) if (wins[w].has(raisedDay)) byWindow[w].raised++;
    if (idx.has(raisedDay)) series[idx.get(raisedDay)!].raised++;
    if (b.status === 'REQUESTED') counts.requested++;
    else if (b.status === 'REJECTED') counts.rejected++;
    else if (b.status === 'CANCELLED') counts.cancelled++;
    else if (b.status === 'APPROVED') {
      counts.approved++;
      const t = b.direct ? direct : network;
      t.count++; t.value += b.agreementValue || 0; t.collected += collectedOf(b);
      const sold = soldDay(b);
      if (idx.has(sold)) series[idx.get(sold)!].approved++;
      for (const w of WINDOWS) {
        if (!wins[w].has(sold)) continue;
        byWindow[w].all.count++; byWindow[w].all.value += b.agreementValue || 0;
        if (!b.direct) { byWindow[w].network.count++; byWindow[w].network.value += b.agreementValue || 0; }
      }
    }
  }
  return { counts, network, direct, byWindow, series };
}

// ───────────────────────── projects ─────────────────────────

export interface ProjectLike { id: string; builderId: string; projectStage?: string; city?: string; totalUnits?: number; availableUnits?: number }

/** "live" = the project still has units to sell */
export const isLiveProject = (p: ProjectLike) => (p.availableUnits ?? p.totalUnits ?? 0) > 0;

export function projectStats(projects: ProjectLike[]) {
  const live = projects.filter(isLiveProject);
  const byStage: Record<string, number> = {};
  const byCity: Record<string, number> = {};
  for (const p of live) {
    byStage[p.projectStage || '—'] = (byStage[p.projectStage || '—'] || 0) + 1;
    byCity[p.city || '—'] = (byCity[p.city || '—'] || 0) + 1;
  }
  const total = projects.reduce((a, p) => a + (p.totalUnits || 0), 0);
  const available = live.reduce((a, p) => a + (p.availableUnits ?? p.totalUnits ?? 0), 0);
  return {
    total: projects.length,
    live: live.length,
    builders: new Set(projects.map(p => p.builderId)).size,
    liveBuilders: new Set(live.map(p => p.builderId)).size,
    units: { total, available, sold: Math.max(0, total - available) },
    byStage,
    byCity: Object.entries(byCity).sort((a, b) => b[1] - a[1]).map(([city, count]) => ({ city, count })),
  };
}
