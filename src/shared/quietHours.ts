/** v182 — quiet hours (India time): no automatic bot / marketing-style push between QUIET_HOURS="21-8" (start-end, 24 h clock); "off" disables. Pure — the clock is passed in. */
export const AUTO_PUSH_KINDS = ['digest', 'community'];
export function parseQuiet(spec: string | undefined): { from: number; to: number } | null {
  const s = (spec ?? '21-8').trim().toLowerCase();
  if (s === 'off') return null;
  const m = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(s);
  const from = m ? +m[1] : 21, to = m ? +m[2] : 8;
  return from > 23 || to > 23 || from === to ? { from: 21, to: 8 } : { from, to };
}
export const istHourOf = (nowMs: number) => new Date(nowMs + 330 * 60_000).getUTCHours();
export const istDayOf = (nowMs: number) => new Date(nowMs + 330 * 60_000).toISOString().slice(0, 10);
export function isQuietHour(nowMs: number, spec: string | undefined = process.env.QUIET_HOURS): boolean {
  const q = parseQuiet(spec); if (!q) return false;
  const h = istHourOf(nowMs);
  return q.from < q.to ? h >= q.from && h < q.to : h >= q.from || h < q.to;
}
/** an automatic bot follow-up may go out: not in quiet hours, and not twice on the same IST day for one client */
export const autoFollowAllowed = (nowMs: number, lastDay: string | undefined, spec: string | undefined = process.env.QUIET_HOURS) => !isQuietHour(nowMs, spec) && lastDay !== istDayOf(nowMs);
