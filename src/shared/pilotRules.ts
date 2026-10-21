/**
 * v26 — the two pilot numbers that decide whether GENZ is ready to open a city (pure):
 *   activation — of brokers verified in the window, how many did something real within 7 days of joining
 *                (first listing / first client or buyer need / first owner consent)
 *   D7 return  — how many came back on day 7–13 after joining (a "seen" day in the activity log)
 * Only brokers who joined at least 14 days ago count for D7, so a fresh pilot does not look worse than it is.
 */
export interface PilotInput {
  now: number;
  brokers: { id: string; verifiedAt?: string; createdAt: string; city?: string }[];
  firstListingAt: Record<string, number>;
  firstClientAt: Record<string, number>;
  firstConsentAt: Record<string, number>;
  days: { day: string; seen: string[] }[];
}
const DAY = 86400_000;
const istDay = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);

export function pilotFunnel(i: PilotInput, windowDays = 60, city = '') {
  const since = i.now - windowDays * DAY;
  const seenBy = new Map<string, Set<string>>();
  for (const d of i.days) for (const id of d.seen) { let s = seenBy.get(id); if (!s) seenBy.set(id, (s = new Set())); s.add(d.day); }
  const cohort = i.brokers.filter(b => { const t = Date.parse(b.verifiedAt || b.createdAt); return t >= since && t <= i.now && (!city || String(b.city || '').toLowerCase() === city.toLowerCase()); });
  let listing = 0, client = 0, consent = 0, any = 0, d7Base = 0, d7 = 0;
  for (const b of cohort) {
    const t0 = Date.parse(b.verifiedAt || b.createdAt);
    const within = (m: Record<string, number>) => m[b.id] !== undefined && m[b.id] - t0 <= 7 * DAY;
    const L = within(i.firstListingAt), C = within(i.firstClientAt), O = within(i.firstConsentAt);
    if (L) listing++; if (C) client++; if (O) consent++; if (L || C || O) any++;
    if (i.now - t0 >= 14 * DAY) {
      d7Base++;
      const s = seenBy.get(b.id);
      if (s) for (let k = 7; k <= 13; k++) if (s.has(istDay(t0 + k * DAY))) { d7++; break; }
    }
  }
  const pct = (a: number, n: number) => (n ? Math.round((a / n) * 100) : null);
  return {
    windowDays, city: city || null, joined: cohort.length,
    activation: { any, listing, client, consent, pct: pct(any, cohort.length) },
    d7: { base: d7Base, returned: d7, pct: pct(d7, d7Base) },
    target: { activationPct: 40, d7Pct: 30 },
  };
}
