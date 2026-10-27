import { describe, it, expect } from 'vitest';
import { visitGate, windowEnd, rescheduleError, gateWords, EARLY_HOURS, WINDOW_HOURS, MAX_TRIES, RESCHEDULE_MAX_DAYS, type GateInput, type GateCode } from '../src/shared/visitGateRules.js';
import { HOME_TODOS, todoTag, todoUrl, todoWords, reconcileTodos, isTodoLine } from '../src/shared/homeTodoRules.js';
import { inboxView, inboxUnread, type InboxItem } from '../src/shared/inboxRules.js';

const HI = /[ऀ-ॿ]/;
const T0 = Date.parse('2026-10-27T10:00:00Z');
const H = 3600_000;

/** a visit on an owner's property, listed by LB, booked by BK; the default viewer is the listing broker, at the visit time */
const base = (o: Partial<GateInput> = {}): GateInput => ({
  isVerified: false, bookerId: 'BK', userId: 'LB', ownerId: 'OW', listingBrokerId: 'LB', isSuper: false, ackBlocked: false,
  scheduledAt: new Date(T0).toISOString(), expiresAt: new Date(T0 + 24 * H).toISOString(), attempts: 0, now: T0, ...o,
});

describe('visitGate — who can confirm a visit, and why not (the same decision the server makes)', () => {
  it('the listing broker or the owner can confirm a visit someone else booked, at the visit time', () => {
    expect(visitGate(base())).toMatchObject({ code: 'OK', ok: true, status: 200, propertySide: true });
    expect(visitGate(base({ userId: 'OW' }))).toMatchObject({ code: 'OK', ok: true });
  });
  it('the broker who booked it can NEVER confirm it (maker ≠ checker) — and is told so before he taps', () => {
    const g = visitGate(base({ userId: 'BK' }));
    expect(g).toMatchObject({ code: 'MAKER_CHECKER', ok: false, status: 403 });
  });
  it('the owner may confirm even if the owner himself booked (his own buyer)', () => {
    expect(visitGate(base({ bookerId: 'OW', userId: 'OW' })).code).toBe('OK');
  });
  it('someone else (another broker, a buyer) is not the property side', () => {
    expect(visitGate(base({ userId: 'X' }))).toMatchObject({ code: 'PROPERTY_SIDE_ONLY', status: 403, propertySide: false });
  });
  it('the listing broker brought the buyer himself → only the owner confirms', () => {
    const own = base({ bookerId: 'LB', userId: 'LB' });
    expect(visitGate(own).code).toBe('MAKER_CHECKER');
    const other = visitGate(base({ bookerId: 'LB', userId: 'LB2', listingBrokerId: 'LB' }));
    expect(other).toMatchObject({ code: 'PROPERTY_SIDE_ONLY', selfDeal: true });
    expect(visitGate(base({ bookerId: 'LB', userId: 'OW' })).code).toBe('OK');
    // the listing broker is not the property side on his own deal (he is the booker anyway)
    expect(visitGate(base({ bookerId: 'LB', userId: 'LB' })).propertySide).toBe(false);
  });
  it('GENZ super admin may step in', () => {
    expect(visitGate(base({ userId: 'ADM', isSuper: true })).code).toBe('OK');
    // …but maker ≠ checker still holds for a super admin who booked it himself
    expect(visitGate(base({ userId: 'ADM', bookerId: 'ADM', isSuper: true })).code).toBe('MAKER_CHECKER');
  });
  it('the order of the checks: verified → buyer tick → too early → window closed → locked', () => {
    expect(visitGate(base({ isVerified: true }))).toMatchObject({ code: 'DONE', status: 409 });
    expect(visitGate(base({ ackBlocked: true }))).toMatchObject({ code: 'ACK_REQUIRED', status: 409 });
    expect(visitGate(base({ now: T0 - EARLY_HOURS * H - 1 }))).toMatchObject({ code: 'TOO_EARLY', status: 400 });
    expect(visitGate(base({ now: T0 - EARLY_HOURS * H })).code).toBe('OK');                       // exactly 6 h before is allowed
    expect(visitGate(base({ now: T0 + 24 * H + 1 }))).toMatchObject({ code: 'EXPIRED', status: 410 });
    expect(visitGate(base({ now: T0 + 24 * H })).code).toBe('OK');
    expect(visitGate(base({ attempts: MAX_TRIES }))).toMatchObject({ code: 'LOCKED', status: 429 });
    expect(visitGate(base({ attempts: MAX_TRIES - 1 })).code).toBe('OK');
    // an earlier check wins over a later one
    expect(visitGate(base({ ackBlocked: true, now: T0 + 48 * H, attempts: 9 })).code).toBe('ACK_REQUIRED');
    expect(visitGate(base({ now: T0 + 48 * H, attempts: 9 })).code).toBe('EXPIRED');
    expect(visitGate(base({ userId: 'BK', now: T0 + 48 * H })).code).toBe('MAKER_CHECKER');       // the booker sees the maker rule first
  });
  it('an old visit with no window end never expires on its own; a missing owner or listing broker is never "the property side"', () => {
    expect(visitGate(base({ expiresAt: undefined, now: T0 + 90 * 24 * H })).code).toBe('OK');
    expect(visitGate(base({ userId: '', ownerId: '', listingBrokerId: '' })).code).toBe('PROPERTY_SIDE_ONLY');
  });
});

describe('the pass window and moving a visit', () => {
  it('the window closes 24 h after the later of the slot and now', () => {
    expect(WINDOW_HOURS).toBe(24);
    expect(windowEnd(new Date(T0 + 5 * H).toISOString(), T0)).toBe(new Date(T0 + 29 * H).toISOString());
    expect(windowEnd(new Date(T0 - 5 * H).toISOString(), T0)).toBe(new Date(T0 + 24 * H).toISOString());   // booked for a time already past → 24 h from now
    expect(windowEnd('nonsense', T0)).toBe(new Date(T0 + 24 * H).toISOString());
  });
  it('a new time must be a real time, not long past, not more than 30 days ahead', () => {
    expect(rescheduleError('x', T0)).toMatch(/valid/);
    expect(rescheduleError(new Date(T0 - 3 * H).toISOString(), T0)).toMatch(/past/);
    expect(rescheduleError(new Date(T0 - 1 * H).toISOString(), T0)).toBe('');
    expect(rescheduleError(new Date(T0 + 2 * H).toISOString(), T0)).toBe('');
    expect(rescheduleError(new Date(T0 + (RESCHEDULE_MAX_DAYS + 1) * 24 * H).toISOString(), T0)).toMatch(/30 days/);
  });
  it('after moving, the same visit opens again for the property side', () => {
    const moved = windowEnd(new Date(T0 + 3 * H).toISOString(), T0);
    const g = visitGate(base({ scheduledAt: new Date(T0 + 3 * H).toISOString(), expiresAt: moved, now: T0 + 2 * H }));
    expect(g.code).toBe('OK');
  });
});

describe('gateWords — every reason has plain words in English and Hindi, and the booker is told what to do', () => {
  const codes: GateCode[] = ['MAKER_CHECKER', 'PROPERTY_SIDE_ONLY', 'DONE', 'ACK_REQUIRED', 'TOO_EARLY', 'EXPIRED', 'LOCKED'];
  it('English and Hindi for all of them', () => {
    for (const c of codes) {
      const en = gateWords(c, { hi: false, sch: '27 Oct, 11:00 am' }); const hi = gateWords(c, { hi: true, sch: '27 Oct, 11:00 am' });
      expect(en.title.length, c).toBeGreaterThan(5); expect(en.body.length, c).toBeGreaterThan(10);
      expect(HI.test(hi.title), c).toBe(true); expect(HI.test(hi.body), c).toBe(true);
      expect(HI.test(en.title + en.body), c).toBe(false);
    }
    expect(gateWords('OK', { hi: false })).toEqual({ title: '', body: '' });
  });
  it('the booker is pointed to “Remind” (maker rule) or to a new time (window closed); the owner-only case names the owner', () => {
    expect(gateWords('MAKER_CHECKER', { hi: false }).body).toMatch(/Remind/);
    expect(gateWords('MAKER_CHECKER', { hi: true }).body).toMatch(/याद दिलाएँ/);
    expect(gateWords('EXPIRED', { hi: false, iAmBooker: true }).body).toMatch(/new time/);
    expect(gateWords('EXPIRED', { hi: false, iAmBooker: false }).body).toMatch(/broker who booked/);
    expect(gateWords('PROPERTY_SIDE_ONLY', { hi: false, selfDeal: true }).body).toMatch(/property owner/);
    expect(gateWords('PROPERTY_SIDE_ONLY', { hi: false, selfDeal: true }).body).not.toMatch(/listing broker/);
    expect(gateWords('TOO_EARLY', { hi: false, sch: '27 Oct, 11:00 am' }).body).toMatch(/27 Oct, 11:00 am/);
    expect(gateWords('TOO_EARLY', { hi: false }).body).toMatch(new RegExp(`${EARLY_HOURS} hours`));
  });
});

// ───────────────────────── Home counters → notification bell ─────────────────────────
describe('HOME_TODOS — one list for the Home tiles and the bell', () => {
  it('every counter has a unique key, English + Hindi words, and opens a real in-app path', () => {
    expect(HOME_TODOS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(HOME_TODOS.map(d => d.key)).size).toBe(HOME_TODOS.length);
    for (const d of HOME_TODOS) {
      expect(HI.test(d.hi), d.key).toBe(true); expect(HI.test(d.en), d.key).toBe(false);
      expect(todoUrl(d), d.key).toMatch(/^\/\?tab=[a-z_]+/);
      expect(todoTag(d)).toBe(`todo:${d.key}`);
      expect(['emerald', 'indigo', 'amber', 'slate']).toContain(d.tone);
    }
  });
  it('the five counters from the Home screenshot are all there', () => {
    const by = (k: string) => HOME_TODOS.find(d => d.key === k)!;
    expect(by('offersWaiting').en).toMatch(/co-broking offer/);
    expect(by('roomVisits').en).toMatch(/asking to visit/);
    expect(by('inbox').en).toMatch(/Brokers looking for what you have/);
    expect(by('waitingOwner').en).toMatch(/Waiting for owner/);
    expect(by('protectedListings').en).toMatch(/bypass protection/);
  });
  it('a tile opens the same sub-screen as its bell line', () => {
    expect(todoUrl(HOME_TODOS.find(d => d.key === 'offersWaiting')!)).toBe('/?tab=deals&view=proposals');
    expect(todoUrl(HOME_TODOS.find(d => d.key === 'waitingOwner')!)).toBe('/?tab=properties&drafts=1');
    expect(todoUrl(HOME_TODOS.find(d => d.key === 'bondAsks')!)).toBe('/?tab=desk&sub=bonds');
    expect(todoUrl(HOME_TODOS.find(d => d.key === 'roomVisits')!)).toBe('/?tab=clientroom');
  });
  it('words carry the number in English and Hindi', () => {
    const w = todoWords(HOME_TODOS[0], 3);
    expect(w.body).toContain('3'); expect(w.hi.body).toContain('3'); expect(HI.test(w.hi.body)).toBe(true);
  });
});

describe('reconcileTodos — a bell line follows its number', () => {
  let seq = 0; const newId = () => `NTF-t${++seq}`;
  const mine = (all: InboxItem[]) => all.filter(x => x.userId === 'U1' && isTodoLine(x));
  const line = (all: InboxItem[], key: string) => all.find(x => x.userId === 'U1' && x.tag === `todo:${key}`);

  it('a counter above zero becomes one unread line; zero makes none', () => {
    const all: InboxItem[] = [];
    const r = reconcileTodos(all, 'U1', { offersWaiting: 2, roomVisits: 1, inbox: 0, waitingOwner: 4 }, T0, newId);
    expect(r).toEqual({ added: 3, updated: 0, removed: 0 });
    expect(mine(all).map(x => x.tag).sort()).toEqual(['todo:offersWaiting', 'todo:roomVisits', 'todo:waitingOwner']);
    expect(line(all, 'offersWaiting')).toMatchObject({ kind: 'deals', n: 2, url: '/?tab=deals&view=proposals' });
    expect(line(all, 'offersWaiting')!.read).toBeFalsy();
    expect(inboxUnread(all, 'U1')).toBe(3);
  });
  it('the same numbers again change nothing (no duplicates, no new unread)', () => {
    const all: InboxItem[] = [];
    reconcileTodos(all, 'U1', { offersWaiting: 2 }, T0, newId);
    all[0].read = true;
    const r = reconcileTodos(all, 'U1', { offersWaiting: 2 }, T0 + 60_000, newId);
    expect(r).toEqual({ added: 0, updated: 0, removed: 0 }); expect(all).toHaveLength(1); expect(all[0].read).toBe(true);
  });
  it('a number that grows brings the line back as unread, at the top; one that shrinks only updates the words', () => {
    const all: InboxItem[] = [];
    reconcileTodos(all, 'U1', { offersWaiting: 2 }, T0, newId);
    all[0].read = true;
    reconcileTodos(all, 'U1', { offersWaiting: 1 }, T0 + 1000, newId);
    expect(all[0]).toMatchObject({ n: 1, read: true }); expect(all[0].body).toContain('1');
    reconcileTodos(all, 'U1', { offersWaiting: 5 }, T0 + 2000, newId);
    expect(all[0]).toMatchObject({ n: 5, read: false, at: new Date(T0 + 2000).toISOString() });
    expect(all).toHaveLength(1);
  });
  it('when the work is done the line goes away', () => {
    const all: InboxItem[] = [];
    reconcileTodos(all, 'U1', { offersWaiting: 2, roomVisits: 1 }, T0, newId);
    const r = reconcileTodos(all, 'U1', { offersWaiting: 0, roomVisits: 1 }, T0 + 1, newId);
    expect(r.removed).toBe(1); expect(mine(all).map(x => x.tag)).toEqual(['todo:roomVisits']);
  });
  it('a line the person removed stays out of sight until its number grows', () => {
    const all: InboxItem[] = [];
    reconcileTodos(all, 'U1', { waitingOwner: 3 }, T0, newId);
    all[0].hidden = true; all[0].read = true;                                           // “remove” / “clear all” in the bell
    expect(inboxView(all, 'U1', 'en')).toEqual([]); expect(inboxUnread(all, 'U1')).toBe(0);
    reconcileTodos(all, 'U1', { waitingOwner: 3 }, T0 + 1, newId);                       // same number: still out of sight
    expect(inboxView(all, 'U1', 'en')).toEqual([]);
    reconcileTodos(all, 'U1', { waitingOwner: 2 }, T0 + 2, newId);                       // fewer: still out of sight
    expect(inboxView(all, 'U1', 'en')).toEqual([]);
    reconcileTodos(all, 'U1', { waitingOwner: 3 }, T0 + 3, newId);                       // grew again (2 → 3): back, unread
    const v = inboxView(all, 'U1', 'en'); expect(v).toHaveLength(1); expect(v[0]).toMatchObject({ todo: true, n: 3, read: false });
    reconcileTodos(all, 'U1', { waitingOwner: 0 }, T0 + 4, newId);                       // done: gone for good
    expect(all).toHaveLength(0);
  });
  it('only that person\'s lines are touched, and the view carries the to-do flag and Hindi words', () => {
    const all: InboxItem[] = [{ id: 'X', userId: 'U2', kind: 'deals', title: 'other', body: '', at: new Date(T0).toISOString(), tag: 'todo:offersWaiting', n: 9 }];
    reconcileTodos(all, 'U1', { offersWaiting: 1 }, T0, newId);
    expect(all.find(x => x.id === 'X')).toMatchObject({ n: 9, title: 'other' });
    const hi = inboxView(all, 'U1', 'hi')[0]; expect(HI.test(hi.title)).toBe(true); expect(HI.test(hi.body)).toBe(true); expect(hi.todo).toBe(true);
    expect(inboxView(all, 'U1', 'en')[0].title).toMatch(/co-broking offer/);
  });
  it('junk counts are treated as zero', () => {
    const all: InboxItem[] = [];
    expect(reconcileTodos(all, 'U1', { offersWaiting: NaN, roomVisits: -3, inbox: 'x', waitingOwner: 2.9 }, T0, newId).added).toBe(1);
    expect(line(all, 'waitingOwner')!.n).toBe(2);
  });
});
