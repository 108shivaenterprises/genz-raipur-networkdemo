/** v182 — "confirmed N days ago" trust label + one-tap "wrong info / already sold" report (pure; the clock is passed in). */
export const STALE_WARN_DAYS = 20;
export const QUICK_REASONS = ['SOLD', 'RENTED', 'WRONG_PRICE', 'WRONG_INFO', 'UNREACHABLE'] as const;
export type QuickReason = typeof QUICK_REASONS[number];
export const QUICK_REASON_WORDS: Record<QuickReason, [string, string]> = {
  SOLD: ['Already sold', 'बिक चुकी'], RENTED: ['Already rented', 'किराये पर जा चुकी'], WRONG_PRICE: ['Wrong price', 'गलत कीमत'],
  WRONG_INFO: ['Wrong information', 'गलत जानकारी'], UNREACHABLE: ['Cannot reach the lister', 'लिस्टर से बात नहीं हो पाई'],
};
export const REPORT_WINDOW_DAYS = 7;
export const REPORTS_TO_FLAG = 2;

export function confirmAge(p: { confirmedAt?: string; createdAt?: string }, now = Date.now()) {
  const t = Date.parse(p.confirmedAt || p.createdAt || '');
  const days = Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86_400_000)) : 0;
  return { days, stale: days > STALE_WARN_DAYS };
}
export function confirmLabel(p: { confirmedAt?: string; createdAt?: string }, now = Date.now()): { en: string; hi: string; stale: boolean } {
  const { days, stale } = confirmAge(p, now);
  return days === 0 ? { en: 'confirmed today', hi: 'आज कन्फर्म', stale }
    : { en: `confirmed ${days} day${days === 1 ? '' : 's'} ago`, hi: `${days} दिन पहले कन्फर्म`, stale };
}

export interface QuickReport { by: string; reason: QuickReason; at: string; /** this report was the one that hid the listing */ hid?: boolean }
export type QuickResult = 'DUPLICATE' | 'OK' | 'FLAGGED';
export const MAX_HIDES_PER_REPORTER = 5;
/** how many listings this person's reports have hidden in the last 7 days (across all lists) */
export const hidesBy = (lists: (QuickReport[] | undefined)[], by: string, now = Date.now()) =>
  lists.reduce((n, l) => n + (l || []).filter(r => r.by === by && r.hid && now - Date.parse(r.at) < REPORT_WINDOW_DAYS * 86_400_000).length, 0);
/** adds a report unless this person already reported it within 7 days (ALL reports count for that, also those from before a re-confirm);
 *  only reports newer than `clearedAt` (the lister's last “still available”) count toward the 2-reporter flag. Returns the new list too. */
export function addQuickReport(list: QuickReport[] | undefined, by: string, reason: QuickReason, now = Date.now(), clearedAt?: string): { result: QuickResult; list: QuickReport[] } {
  const win = REPORT_WINDOW_DAYS * 86_400_000;
  const live = (list || []).filter(r => now - Date.parse(r.at) < win);
  if (live.some(r => r.by === by)) return { result: 'DUPLICATE', list: live };
  const cut = Date.parse(clearedAt || '') || 0;
  const next: QuickReport[] = [...live, { by, reason, at: new Date(now).toISOString() }];
  const flagged = new Set(next.filter(r => Date.parse(r.at) > cut).map(r => r.by)).size >= REPORTS_TO_FLAG;
  if (flagged) next[next.length - 1].hid = true;
  return { result: flagged ? 'FLAGGED' : 'OK', list: next };
}
