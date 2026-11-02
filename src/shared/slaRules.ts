/**
 * v109 — first-response clock. A new enquiry is a customer waiting; the first real touch (call / WhatsApp / meeting / visit / note)
 * should come within a target (default 30 min). Pure helpers: when was the first touch, what state is the clock in, how fast does a team answer.
 * A stage change or a system line is NOT a touch; a customer who opted out, or a lead already booked / lost, has no clock.
 */
export const SLA_DEFAULT_MIN = 30;
export const SLA_MIN_RANGE: [number, number] = [5, 1440];
const TOUCH = new Set(['CALL', 'WHATSAPP', 'MEETING', 'SITE_VISIT', 'NOTE']);

export interface SlaLead { createdAt: string; stage?: string; optedOutAt?: string; activities?: { type: string; at: string }[] }
export type SlaState = 'DONE' | 'OK' | 'DUE_SOON' | 'BREACHED' | 'NA';

export const clampSla = (m: unknown): number => {
  const n = Math.round(Number(m));
  return Number.isFinite(n) ? Math.min(SLA_MIN_RANGE[1], Math.max(SLA_MIN_RANGE[0], n)) : SLA_DEFAULT_MIN;
};

/** ms timestamp of the first human touch at or after the lead was created, or null */
export function firstTouchAt(l: SlaLead): number | null {
  const c = Date.parse(l.createdAt); let best: number | null = null;
  for (const a of l.activities || []) {
    if (!TOUCH.has(a.type)) continue;
    const t = Date.parse(a.at);
    if (!Number.isFinite(t) || (Number.isFinite(c) && t < c)) continue;
    if (best === null || t < best) best = t;
  }
  return best;
}

export function slaState(l: SlaLead, slaMin: number, now: number): SlaState {
  if (l.optedOutAt || ['BOOKED', 'LOST'].includes(l.stage || '')) return 'NA';
  if (firstTouchAt(l) !== null) return 'DONE';
  const c = Date.parse(l.createdAt); if (!Number.isFinite(c)) return 'NA';
  const left = c + clampSla(slaMin) * 60_000 - now;
  return left <= 0 ? 'BREACHED' : left <= Math.min(5 * 60_000, clampSla(slaMin) * 60_000 / 3) ? 'DUE_SOON' : 'OK';
}
/** minutes left (negative once breached); null when there is no clock */
export const slaLeftMin = (l: SlaLead, slaMin: number, now: number): number | null => {
  const s = slaState(l, slaMin, now); if (s === 'DONE' || s === 'NA') return null;
  return Math.round((Date.parse(l.createdAt) + clampSla(slaMin) * 60_000 - now) / 60_000);
};

/** minutes from enquiry to first touch for each touched lead (negative / absurd values dropped) */
export const responseMinutes = (ls: SlaLead[]): number[] => ls.flatMap(l => {
  const t = firstTouchAt(l); const c = Date.parse(l.createdAt);
  return t !== null && Number.isFinite(c) ? [Math.max(0, Math.round((t - c) / 60_000))] : [];
});
export function medianMin(xs: number[]): number | null {
  if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
/** share (0–100) of the touched leads answered inside the target; null with no data */
export const withinPct = (ls: SlaLead[], slaMin: number): number | null => {
  const r = responseMinutes(ls); return r.length ? Math.round(r.filter(x => x <= clampSla(slaMin)).length / r.length * 100) : null;
};
export const slaText = (m: number) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ''}`.trim());
