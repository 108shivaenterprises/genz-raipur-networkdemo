/**
 * v59 — phone alerts for the work that crosses from one person to another: builder ↔ channel partner (leads, bookings, money,
 * payouts, notices, appointments, visit scans), legal cases, team allotments, KYC decisions and disputes.
 *
 * Rules: one short line per event; never a customer's phone number; money only when it is the receiver's own business (his
 * brokerage, his booking); the actor never alerts himself. pushTo() already honours the person's alert settings, quiet hours
 * (22:00–07:00 IST, except consent / system) and the daily cap — and an alert never blocks or fails the action that caused it.
 */
import { pushTo, type PushKind } from './webpush.js';
import { db } from './db.js';
import type { UserProfile } from './db.js';

type Who = string | undefined | null;

/** send one alert to each person once (empty ids and the actor himself are dropped) */
export function alert(to: Who | Who[], kind: PushKind, title: string, body: string, url = '/', opts: { not?: Who; tag?: string; hi?: [string, string] } = {}) {
  try {
    const ids = [...new Set((Array.isArray(to) ? to : [to]).filter((x): x is string => !!x && x !== opts.not))];
    const hi = opts.hi ? { title: opts.hi[0].slice(0, 80), body: opts.hi[1].slice(0, 180) } : undefined;
    for (const id of ids) void pushTo(id, { kind, title: title.slice(0, 80), body: body.slice(0, 180), url, ...(opts.tag ? { tag: opts.tag } : {}), ...(hi ? { hi } : {}) });
  } catch { /* an alert never breaks the action */ }
}

/** "Sunita Yadav" → "Sunita", "Dr. Alok Pandey" → "Dr. Alok" (a customer is named by first name only; a title stays with it) */
const TITLE = /^(dr|mr|mrs|ms|miss|shri|smt|sri|er|adv|prof|capt|col|km|kumari|sushri)\.?$/i;
export const firstName = (n?: string) => {
  const w = String(n || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return 'A customer';
  return TITLE.test(w[0]) && w[1] ? `${w[0]} ${w[1]}` : w[0];
};
export const inr = (n: number) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

/** an employer's active staff who have a given switch on */
export function staffWith(employerId: Who, pred: (m: UserProfile) => boolean): string[] {
  if (!employerId) return [];
  return db.getState().users.filter(m => m.role === 'TEAM_MEMBER' && m.employerId === employerId && m.verificationStatus === 'VERIFIED' && !m.teamPolicy?.onLeave && pred(m)).map(m => m.id);
}
/** the builder and his staff allowed to accept / reject partner leads */
export const builderVerifiers = (builderId: Who) => [builderId, ...staffWith(builderId, m => !!m.teamPolicy?.canVerify)];
/** the people who confirm money on a side (the owner of the side + his authorised staff) */
export const moneyConfirmers = (ownerId: Who) => [ownerId, ...staffWith(ownerId, m => !!m.teamPolicy?.canConfirmMoney)];

/** at most one alert per key in `ms` — a busy chat sends one alert, and the phone shows the newest under the same tag */
const lastAt = new Map<string, number>();
export function once(key: string, ms: number): boolean {
  const now = Date.now();
  if (now - (lastAt.get(key) || 0) < ms) return false;
  lastAt.set(key, now);
  if (lastAt.size > 5000) for (const [k, t] of lastAt) if (now - t > ms) lastAt.delete(k);
  return true;
}
