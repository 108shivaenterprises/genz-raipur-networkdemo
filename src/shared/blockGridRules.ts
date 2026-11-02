/**
 * v108 — the unit grid as a building, and a unit "block" (hold) as a clock.
 * Pure helpers: which units form a tower × floor picture, how a countdown reads, what token amounts to offer, why a unit cannot be blocked right now.
 * A block is a RECORD, not a payment: the broker paid the builder directly and types the receipt / UTR; GENZ moves no money.
 */

export interface GridUnit { id: string; label: string; group: string; floor?: number | null; status: string }

const natural = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

export interface TowerRows<U> {
  /** top floor first, like the building */
  rows: { floor: number; units: U[] }[];
  /** units of the group that carry no floor number — shown in a last row, never dropped */
  noFloor: U[];
  /** the widest floor: how many cells a row can hold */
  cols: number;
}

export function towerRows<U extends GridUnit>(list: U[]): TowerRows<U> {
  const byFloor = new Map<number, U[]>(); const noFloor: U[] = [];
  for (const u of list) {
    if (typeof u.floor === 'number' && Number.isFinite(u.floor)) { const a = byFloor.get(u.floor); if (a) a.push(u); else byFloor.set(u.floor, [u]); }
    else noFloor.push(u);
  }
  const floors = [...byFloor.keys()].sort((a, b) => b - a);
  const rows = floors.map(f => ({ floor: f, units: byFloor.get(f)!.sort((a, b) => natural(a.label, b.label)) }));
  return { rows, noFloor: noFloor.sort((a, b) => natural(a.label, b.label)), cols: Math.max(1, ...rows.map(r => r.units.length), noFloor.length ? Math.min(noFloor.length, 6) : 1) };
}

/** a group reads as a building when most of its units sit on a floor and there is more than one floor */
export function isTower(list: GridUnit[]): boolean {
  const floors = new Set(list.filter(u => typeof u.floor === 'number').map(u => u.floor));
  const withFloor = list.filter(u => typeof u.floor === 'number').length;
  return floors.size >= 2 && withFloor >= Math.ceil(list.length * 0.6);
}

export const floorLabel = (f: number, hi = false) => (f === 0 ? (hi ? 'भू' : 'G') : String(f));

/** how many units of each status a group holds — for the little bar above a tower */
export function statusCounts(list: { status: string }[]) {
  const c = { AVAILABLE: 0, HOLD: 0, BOOKED: 0, RESERVED: 0 } as Record<string, number>;
  for (const u of list) if (u.status in c) c[u.status]++;
  return c;
}

// ───────────────────────── the clock ─────────────────────────
/** "1:59:58" from an hour up, "12:05" below — never negative */
export function clock(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}

export type HoldTone = 'ok' | 'soon' | 'late' | 'gone' | 'pending';
/** green-ish while there is time, amber under 30 min, red under 5 min, gone at zero; 'pending' = a booking request is with the builder (no clock) */
export function holdTone(expiresAt: string | null | undefined, now: number): HoldTone {
  if (!expiresAt) return 'pending';
  const left = Date.parse(expiresAt) - now;
  return left <= 0 ? 'gone' : left <= 5 * 60_000 ? 'late' : left <= 30 * 60_000 ? 'soon' : 'ok';
}
export const holdLeftMs = (expiresAt: string | null | undefined, now: number) => (expiresAt ? Math.max(0, Date.parse(expiresAt) - now) : 0);

/** 0 … 1 — how much of the window is used up (only for a hold whose start and end the viewer may see) */
export function holdElapsed(at: string | undefined, expiresAt: string | null | undefined, now: number): number {
  if (!at || !expiresAt) return 0;
  const a = Date.parse(at), e = Date.parse(expiresAt);
  if (!Number.isFinite(a) || !Number.isFinite(e) || e <= a) return 1;
  return Math.min(1, Math.max(0, (now - a) / (e - a)));
}

// ───────────────────────── blocking a unit ─────────────────────────
/** a few round token amounts above the project's minimum, so the broker taps instead of types */
export function tokenChips(min: number): number[] {
  const base = Math.max(1, Math.round(min));
  return [...new Set([base, 25_000, 50_000, 100_000, 200_000, 500_000].filter(n => n >= base))].sort((a, b) => a - b).slice(0, 4);
}

export interface BlockCheck { ok: boolean; reason?: { en: string; hi: string } }
/** the same refusals the server makes — told before the broker types anything */
export function canBlock(o: { status: string; canHold: boolean; used: number; max: number; leads: number }): BlockCheck {
  if (!o.canHold) return { ok: false, reason: { en: 'Only a partner broker can block a unit.', hi: 'सिर्फ़ पार्टनर ब्रोकर यूनिट ब्लॉक कर सकता है।' } };
  if (o.status !== 'AVAILABLE') return { ok: false, reason: { en: 'This unit is not available.', hi: 'यह यूनिट उपलब्ध नहीं है।' } };
  if (o.used >= o.max) return { ok: false, reason: { en: `You already keep ${o.max} blocks — release one or wait for it to end.`, hi: `आपके ${o.max} ब्लॉक पहले से हैं — एक हटाएँ या उसके ख़त्म होने का इंतज़ार करें।` } };
  if (o.leads === 0) return { ok: false, reason: { en: 'Register your customer as a lead on this project first.', hi: 'पहले अपने ग्राहक को इस प्रोजेक्ट पर लीड के रूप में दर्ज करें।' } };
  return { ok: true };
}
