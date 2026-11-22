/** v158 — the four dates of a resale deal (token, agreement, registry, possession) + the "after the registry" tick, kept by the deal brokers. Pure functions: the server, the screen and the tests use this. */
export const DATE_KEYS = ['token', 'agreement', 'registry', 'possession'] as const;
export type DateKey = typeof DATE_KEYS[number];
export type KeyDates = Partial<Record<DateKey, string>> & { mutationDone?: boolean };
export const DATE_WORDS: Record<DateKey, { en: string; hi: string }> = {
  token: { en: 'Token / advance', hi: 'टोकन / बयाना' },
  agreement: { en: 'Agreement to sell', hi: 'एग्रीमेंट टू सेल' },
  registry: { en: 'Registry', hi: 'रजिस्ट्री' },
  possession: { en: 'Possession', hi: 'क़ब्ज़ा' },
};
/** what to take to the sub-registrar — a general list, not legal advice; each office may ask a little different */
export const REGISTRY_CARRY: { en: string; hi: string }[] = [
  { en: 'Buyer and seller: original ID (Aadhaar / PAN) and passport photos', hi: 'खरीदार और बेचने वाले: असली ID (आधार / PAN) और फ़ोटो' },
  { en: 'Two witnesses with their ID', hi: 'दो गवाह, अपनी ID के साथ' },
  { en: 'Sale deed on the right stamp paper; stamp duty and registration fee receipts', hi: 'सही स्टाम्प पेपर पर रजिस्ट्री का मसौदा; स्टाम्प ड्यूटी और रजिस्ट्रेशन फ़ीस की रसीद' },
  { en: 'Seller’s original title papers, latest tax receipt, society NOC (flat)', hi: 'मालिक के असली काग़ज़, ताज़ा टैक्स रसीद, सोसाइटी NOC (फ़्लैट हो तो)' },
  { en: 'Payment proof (cheque / RTGS slip) and the token receipt', hi: 'भुगतान का सबूत (चेक / RTGS) और टोकन की रसीद' },
  { en: 'Ask your CA or the registrar’s office if TDS applies to this price', hi: 'इस दाम पर TDS लगता है या नहीं — अपने CA या रजिस्ट्रार दफ़्तर से पूछें' },
];
const DAY = 86400_000;
/** today's date in India as YYYY-MM-DD */
export const todayIST = (now = Date.now()) => new Date(now + 19_800_000).toISOString().slice(0, 10);
export const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
/** whole days from today to that date (negative = it has passed) */
export const daysTo = (date: string, now = Date.now()) => Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(todayIST(now) + 'T00:00:00Z')) / DAY);

/** why a set of dates cannot be saved, or '' — the order must make sense and nothing absurd */
export function checkDates(d: KeyDates, now = Date.now()): string {
  const t = todayIST(now);
  for (const k of DATE_KEYS) {
    const v = d[k]; if (v === undefined) continue;
    if (!isDay(v)) return `${DATE_WORDS[k].en}: not a date`;
    if (v < '2020-01-01' || daysTo(v, now) > 1100) return `${DATE_WORDS[k].en}: date is out of range`;
  }
  const seq = DATE_KEYS.map(k => ({ k, v: d[k] })).filter(x => x.v) as { k: DateKey; v: string }[];
  for (let i = 1; i < seq.length; i++) if (seq[i].v < seq[i - 1].v) return `${DATE_WORDS[seq[i].k].en} cannot be before ${DATE_WORDS[seq[i - 1].k].en.toLowerCase()}`;
  void t; return '';
}
/** the words for a date: "in 3 days" / "today" / "2 days ago" */
export function whenWords(date: string, now = Date.now()): { en: string; hi: string; soon: boolean; past: boolean } {
  const n = daysTo(date, now);
  if (n === 0) return { en: 'today', hi: 'आज', soon: true, past: false };
  if (n === 1) return { en: 'tomorrow', hi: 'कल', soon: true, past: false };
  if (n > 0) return { en: `in ${n} days`, hi: `${n} दिन में`, soon: n <= 3, past: false };
  return { en: `${-n} day${n === -1 ? '' : 's'} ago`, hi: `${-n} दिन पहले`, soon: false, past: true };
}
/** the two bell counters: a date within 3 days (not yet passed), and a registry that has passed with the record update not ticked */
export function dateCounts(deals: { stage: string; keyDates?: KeyDates }[], now = Date.now()) {
  let dealDates = 0; let dealMutation = 0;
  for (const d of deals) {
    if (['Settled', 'Disputed'].includes(d.stage) || !d.keyDates) continue;
    if (DATE_KEYS.some(k => d.keyDates![k] && daysTo(d.keyDates![k]!, now) >= 0 && daysTo(d.keyDates![k]!, now) <= 3)) dealDates++;
    if (d.keyDates.registry && daysTo(d.keyDates.registry, now) < 0 && !d.keyDates.mutationDone) dealMutation++;
  }
  return { dealDates, dealMutation };
}

/** v193 — what the buyer paid at each milestone, read from the हिसाब entries (the one money ledger): token → TOKEN, agreement → PART, registry → FINAL. Void and refund entries do not count; a masked amount counts as 0. */
export const MILESTONE_KIND = { token: 'TOKEN', agreement: 'PART', registry: 'FINAL' } as const;
export function milestoneAmounts(entries: { kind: string; amount?: number; void?: unknown; masked?: boolean }[]): Record<'token' | 'agreement' | 'registry', number> {
  const sum = (k: string) => (entries || []).filter(e => e.kind === k && !e.void && !e.masked).reduce((a, e) => a + (Number(e.amount) || 0), 0);
  return { token: sum('TOKEN'), agreement: sum('PART'), registry: sum('FINAL') };
}
/** final rate minus what was received (never below 0) — the same number the हिसाब "Left" tile shows */
export const balanceLeft = (price: number, received: number) => Math.max(0, Math.round((Number(price) || 0) - (Number(received) || 0)));
export const PAY_EVENT = 'genz:hisaab-pay';
