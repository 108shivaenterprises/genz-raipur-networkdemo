/**
 * v77 — the notification bell. Every alert a person is told (the same words that go to his phone) is also kept here for a while,
 * so he can read it inside the app, tap it to go to the work, mark it read, or clear the lot.
 * Pure rules (no server imports) so the server and the tests use exactly the same code.
 */
export type InboxKind = 'matches' | 'deals' | 'consent' | 'broadcast' | 'digest' | 'community' | 'system';
export interface InboxItem {
  id: string; userId: string; kind: InboxKind;
  title: string; body: string; hi?: { title: string; body: string };
  /** where a tap goes: always an in-app path such as /?tab=pcontrol */
  url?: string;
  /** the same tag again while the old one is still unread = one line (moved to the top), not two */
  tag?: string;
  at: string; read?: boolean;
}

/** most lines kept per person, and for how many days */
export const INBOX_CAP = 60;
export const INBOX_DAYS = 14;
const DAY_MS = 86_400_000;

/** a tap may go only to a path inside this app — never to another site */
export function safeInboxUrl(u: unknown): string | undefined {
  if (typeof u !== 'string') return undefined;
  const s = u.trim();
  return s.startsWith('/') && !s.startsWith('//') && !s.includes('\\') && s.length <= 300 ? s : undefined;
}

/** put one alert into the bell. Returns the stored line. Mutates `all` (the whole collection). */
export function inboxAdd(all: InboxItem[], entry: Omit<InboxItem, 'id' | 'read'>, id: string, now = Date.now()): InboxItem {
  const url = safeInboxUrl(entry.url);
  if (entry.tag) {
    const same = all.find(x => x.userId === entry.userId && x.tag === entry.tag && !x.read);
    if (same) {
      Object.assign(same, { kind: entry.kind, title: entry.title, body: entry.body, hi: entry.hi, url, at: entry.at });
      return same;
    }
  }
  const row: InboxItem = { id, userId: entry.userId, kind: entry.kind, title: entry.title.slice(0, 120), body: entry.body.slice(0, 300), ...(entry.hi ? { hi: { title: entry.hi.title.slice(0, 120), body: entry.hi.body.slice(0, 300) } } : {}), ...(url ? { url } : {}), ...(entry.tag ? { tag: entry.tag.slice(0, 80) } : {}), at: entry.at };
  all.push(row);
  inboxTrim(all, entry.userId, now);
  return row;
}

/** drop lines older than INBOX_DAYS and keep only the newest INBOX_CAP for one person. Mutates `all`; returns how many went. */
export function inboxTrim(all: InboxItem[], userId: string, now = Date.now()): number {
  const mine = all.filter(x => x.userId === userId).sort((a, b) => b.at.localeCompare(a.at));
  const drop = new Set<string>();
  mine.forEach((x, i) => { if (i >= INBOX_CAP || now - Date.parse(x.at) > INBOX_DAYS * DAY_MS) drop.add(x.id); });
  if (!drop.size) return 0;
  const keep = all.filter(x => !drop.has(x.id));
  all.length = 0; all.push(...keep);
  return drop.size;
}

/** the lines of one person, newest first, in his language */
export function inboxView(all: InboxItem[], userId: string, lang: 'en' | 'hi') {
  return all.filter(x => x.userId === userId).sort((a, b) => b.at.localeCompare(a.at)).slice(0, INBOX_CAP)
    .map(x => ({ id: x.id, kind: x.kind, title: lang === 'hi' && x.hi ? x.hi.title : x.title, body: lang === 'hi' && x.hi ? x.hi.body : x.body, url: x.url, at: x.at, read: !!x.read }));
}
export const inboxUnread = (all: InboxItem[], userId: string) => all.reduce((n, x) => n + (x.userId === userId && !x.read ? 1 : 0), 0);

/** "5 min ago" style — shared so the bell and the tests agree */
export function agoLabel(iso: string, now = Date.now(), hi = false): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 1) return hi ? 'अभी' : 'just now';
  if (m < 60) return hi ? `${m} मिनट पहले` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return hi ? `${h} घंटे पहले` : `${h} h ago`;
  const d = Math.round(h / 24);
  return hi ? `${d} दिन पहले` : `${d} d ago`;
}
