import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  dayKey, dayOfIso, lastDays, windowDays, isWindow, addActivity, pruneActivity, auditActivity, daySets, dayCounts, windowCounts, windowSets, daysActive, trackingSince,
  bookingStats, projectStats, isLiveProject, KEEP_DAYS, type ActivityDay, type ActivityInput,
} from '../src/shared/pulseRules';

/** v17 "Network Pulse": who came each day, what the network sold, what was collected, what is live — for the superadmin only. */
const PORT = 6100 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const email = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id).email;
async function login(who: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: who, password: cfg.demoPassword }) });
  expect(r.status, who).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const PROJ = 'PROJ-RAI-02';
let AV = 0; let UNIT = 0;
const unit = () => `V17-${++UNIT}`;
const P = '/api/admin/pulse';
const pulse = async () => (await j(await call(jar.SUP, 'GET', P)));
const drill = async (q: string) => (await j(await call(jar.SUP, 'GET', `${P}/drill?${q}`)));

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v17-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' },
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  expect(cfg).toBeTruthy();
  jar.SUP = await login(cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').email);
  jar.B1 = await login(email('USR-BRK-001')); jar.B2 = await login(email('USR-BRK-002'));
  jar.BUILDER = await login(email('USR-BUILDER-001'));
  jar.POOJA = await login('9000030001');
  const proj = (await j(await call(jar.BUILDER, 'GET', '/api/builder/projects'))).projects.find((p: any) => p.id === PROJ);
  AV = proj.priceStartingFrom;
}, 90_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

// ───────────────────────── pure rules ─────────────────────────
const T = Date.parse('2026-10-14T10:00:00Z'); // 15:30 IST on 14 Oct
const role: Record<string, string> = { b1: 'BROKER', b2: 'BROKER', bld: 'DEVELOPER_BUILDER', emp: 'TEAM_MEMBER', adm: 'ADMIN', sup: 'SUPERADMIN' };
const inp = (days: ActivityDay[] = [], audit = new Map()): ActivityInput => ({ days, audit, roleOf: id => role[id] });

describe('days are Indian days', () => {
  it('a day turns over at midnight IST, not midnight UTC', () => {
    expect(dayKey(Date.parse('2026-10-14T18:29:59Z'))).toBe('2026-10-14');
    expect(dayKey(Date.parse('2026-10-14T18:30:00Z'))).toBe('2026-10-15');
    expect(dayKey(Date.parse('2026-10-14T00:10:00Z'))).toBe('2026-10-14');
    expect(dayOfIso('2026-10-14T20:00:00.000Z')).toBe('2026-10-15');
    expect(dayOfIso('')).toBe(''); expect(dayOfIso(undefined)).toBe(''); expect(dayOfIso('not a date')).toBe('');
  });
  it('lists the last n days oldest first and knows the windows', () => {
    expect(lastDays(3, T)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
    expect(windowDays('today', T)).toEqual(['2026-10-14']);
    expect(windowDays('yesterday', T)).toEqual(['2026-10-13']);
    expect(windowDays('d7', T)).toHaveLength(7); expect(windowDays('d7', T).at(-1)).toBe('2026-10-14');
    expect(windowDays('d30', T)).toHaveLength(30);
    expect(isWindow('d7')).toBe(true); expect(isWindow('week')).toBe(false); expect(isWindow(undefined)).toBe(false);
  });
});

describe('recording', () => {
  it('records each person once a day; doing something implies being seen; bad input is ignored', () => {
    const d: ActivityDay[] = [];
    expect(addActivity(d, '2026-10-14', 'b1', 'seen')).toBe(true);
    expect(addActivity(d, '2026-10-14', 'b1', 'seen')).toBe(false);
    expect(addActivity(d, '2026-10-14', 'b1', 'acted')).toBe(true);
    expect(addActivity(d, '2026-10-14', 'b1', 'acted')).toBe(false);
    expect(addActivity(d, '2026-10-14', 'b2', 'acted')).toBe(true);
    // v20: the record carries id = day (the PostgreSQL store keys every record by id)
    expect(d).toEqual([{ id: '2026-10-14', day: '2026-10-14', seen: ['b1', 'b2'], acted: ['b1', 'b2'] }]);
    expect(addActivity(d, '', 'b1', 'seen')).toBe(false); expect(addActivity(d, '2026-10-14', '', 'seen')).toBe(false);
  });
  it('keeps the days in order even when one arrives late', () => {
    const d: ActivityDay[] = [];
    addActivity(d, '2026-10-14', 'a', 'seen'); addActivity(d, '2026-10-12', 'a', 'seen'); addActivity(d, '2026-10-13', 'a', 'seen');
    expect(d.map(x => x.day)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
  });
  it('erases records older than the retention period (180 days) and nothing newer', () => {
    const d: ActivityDay[] = [];
    for (const day of [dayKey(T - 200 * 86_400_000), dayKey(T - (KEEP_DAYS - 1) * 86_400_000), dayKey(T - 5 * 86_400_000), dayKey(T)]) addActivity(d, day, 'x', 'seen');
    expect(pruneActivity(d, T)).toBe(1); expect(d).toHaveLength(3);
    expect(trackingSince(d)).toBe(dayKey(T - (KEEP_DAYS - 1) * 86_400_000)); expect(trackingSince([])).toBeNull();
  });
});

describe('history from the audit trail', () => {
  const ev = (iso: string, actorId: string, action: string) => ({ timestamp: iso, actorId, action });
  it('a login is "seen", anything else is "acted"; failed logins, system actors and strangers are ignored', () => {
    const m = auditActivity([
      ev('2026-10-13T05:00:00Z', 'b1', 'LOGIN_SUCCESS'), ev('2026-10-13T06:00:00Z', 'b2', 'CRM_LEAD_REGISTERED'), ev('2026-10-13T06:00:00Z', 'b2', 'LOGIN_FAILED'),
      ev('2026-10-13T06:00:00Z', 'SYSTEM', 'LISTING_AUTO_EXPIRED'), ev('2026-10-13T06:00:00Z', 'public', 'POSTER_ENQUIRY'), ev('2026-10-13T06:00:00Z', 'ghost', 'X'),
    ], new Set(['b1', 'b2']));
    const d = m.get('2026-10-13')!;
    expect([...d.seen].sort()).toEqual(['b1', 'b2']); expect([...d.acted]).toEqual(['b2']);
  });
  it('the daily record and the audit trail are merged, never double counted', () => {
    const audit = auditActivity([ev('2026-10-14T05:00:00Z', 'b1', 'CRM_LEAD_REGISTERED')], new Set(['b1']));
    const s = daySets({ day: '2026-10-14', seen: ['b1', 'b2'], acted: [] }, audit.get('2026-10-14'));
    expect([...s.seen].sort()).toEqual(['b1', 'b2']); expect([...s.acted]).toEqual(['b1']);
  });
});

describe('counting', () => {
  const days: ActivityDay[] = [
    { day: '2026-10-14', seen: ['b1', 'b2', 'bld', 'emp', 'adm', 'sup', 'ghost'], acted: ['b1', 'adm'] },
    { day: '2026-10-13', seen: ['b1'], acted: [] },
  ];
  it('admins and unknown ids are never counted; brokers are a subset of people; acted a subset of people', () => {
    expect(dayCounts('2026-10-14', inp(days))).toEqual({ day: '2026-10-14', people: 4, brokers: 2, acted: 1, actedBrokers: 1, source: 'tracked' });
  });
  it('says where a day came from', () => {
    const audit = auditActivity([{ timestamp: '2026-10-12T05:00:00Z', actorId: 'b2', action: 'CRM_LEAD_REGISTERED' }], new Set(['b2']));
    expect(dayCounts('2026-10-12', inp(days, audit)).source).toBe('history');
    expect(dayCounts('2026-10-11', inp(days, audit)).source).toBe('none');
    expect(dayCounts('2026-10-11', inp(days, audit)).people).toBe(0);
  });
  it('a window counts every person once, however many days they came', () => {
    expect(windowCounts(['2026-10-13', '2026-10-14'], inp(days))).toEqual({ people: 4, brokers: 2, acted: 1, actedBrokers: 1 });
    expect([...windowSets(['2026-10-13', '2026-10-14'], inp(days)).brokers].sort()).toEqual(['b1', 'b2']);
    expect(daysActive('b1', ['2026-10-13', '2026-10-14'], inp(days))).toBe(2);
    expect(daysActive('b2', ['2026-10-13', '2026-10-14'], inp(days))).toBe(1);
  });
});

describe('bookings and projects', () => {
  const bk = (id: string, status: string, value: number, createdAt: string, extra: any = {}) => ({ id, status, agreementValue: value, createdAt, ...extra });
  const rows = [
    bk('1', 'APPROVED', 5_000_000, '2026-10-10T05:00:00Z', { decidedAt: '2026-10-14T04:00:00Z' }),
    bk('2', 'APPROVED', 7_000_000, '2026-10-01T05:00:00Z', { decidedAt: '2026-10-07T04:00:00Z' }),
    bk('3', 'APPROVED', 3_000_000, '2026-10-14T05:00:00Z', { direct: true }),
    bk('4', 'REQUESTED', 9_000_000, '2026-10-14T05:00:00Z'),
    bk('5', 'REJECTED', 2_000_000, '2026-10-13T05:00:00Z'), bk('6', 'CANCELLED', 1_000_000, '2026-09-01T05:00:00Z'),
  ];
  const col: Record<string, number> = { '1': 1_000_000, '2': 7_000_000, '3': 3_000_000 };
  const s = bookingStats(rows, b => col[b.id] || 0, T);
  it('counts by status and only approved bookings are "sold"', () => {
    expect(s.counts).toEqual({ requested: 1, approved: 3, rejected: 1, cancelled: 1 });
    expect(s.network).toEqual({ count: 2, value: 12_000_000, collected: 8_000_000 });
    expect(s.direct).toEqual({ count: 1, value: 3_000_000, collected: 3_000_000 }); // builder's own desk is kept apart from the network
  });
  it('windows use the day the builder approved it (not the day it was raised)', () => {
    expect(s.byWindow.today.network).toEqual({ count: 1, value: 5_000_000 });
    expect(s.byWindow.today.all).toEqual({ count: 2, value: 8_000_000 }); // + the direct sale decided today (falls back to createdAt)
    expect(s.byWindow.d7.network.count).toBe(1); // #2 was approved on 7 Oct: 7 days back, outside the last 7 days (8–14 Oct)
    expect(s.byWindow.d30.network.count).toBe(2);
    expect(s.byWindow.today.raised).toBe(2); expect(s.byWindow.yesterday.raised).toBe(1);
  });
  it('the per-day series lines up with the windows', () => {
    expect(s.series).toHaveLength(30); expect(s.series.at(-1)).toEqual({ day: '2026-10-14', raised: 2, approved: 2 });
    expect(s.series.reduce((a, x) => a + x.approved, 0)).toBe(3);
  });
  it('a project is live while it still has units to sell', () => {
    const ps = [
      { id: 'a', builderId: 'x', projectStage: 'Under Construction', city: 'Raipur', totalUnits: 100, availableUnits: 40 },
      { id: 'b', builderId: 'x', projectStage: 'Ready to Move', city: 'Raipur', totalUnits: 50, availableUnits: 0 },
      { id: 'c', builderId: 'y', projectStage: 'Pre-Launch / Upcoming', city: 'Bilaspur', totalUnits: 20 },
    ];
    expect(isLiveProject(ps[1])).toBe(false); expect(isLiveProject(ps[2])).toBe(true);
    const st = projectStats(ps);
    expect(st).toMatchObject({ total: 3, live: 2, builders: 2, liveBuilders: 2, units: { total: 170, available: 60, sold: 110 } });
    expect(st.byCity).toEqual([{ city: 'Raipur', count: 1 }, { city: 'Bilaspur', count: 1 }]);
  });
});

// ───────────────────────── over HTTP ─────────────────────────
describe('who may look', () => {
  it('only the superadmin: anonymous 401, a broker 403 — on the numbers and on the lists', async () => {
    expect((await call(undefined, 'GET', P)).status).toBe(401);
    expect((await call(jar.B1, 'GET', P)).status).toBe(403);
    expect((await call(jar.BUILDER, 'GET', `${P}/drill?kind=people`)).status).toBe(403);
    expect((await call(jar.SUP, 'GET', P)).status).toBe(200);
  });
  it('an unknown list is a 400, an unknown period falls back to today', async () => {
    expect((await call(jar.SUP, 'GET', `${P}/drill?kind=phones`)).status).toBe(400);
    expect((await drill('kind=people&window=forever')).window).toBe('today');
  });
});

describe('who came', () => {
  it('everyone who signed in today is counted once; the superadmin is not', async () => {
    const p = await pulse();
    expect(p.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.trackingSince).toBe(p.today);
    const t = p.activity.windows.today;
    expect(t.brokers).toBeGreaterThanOrEqual(2); expect(t.people).toBeGreaterThanOrEqual(4);
    const list = await drill('kind=people&window=today');
    const ids = list.rows.map((r: any) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['USR-BRK-001', 'USR-BRK-002', 'USR-BUILDER-001', 'USR-TEAM-001']));
    expect(list.rows.some((r: any) => ['SUPERADMIN', 'ADMIN'].includes(r.role))).toBe(false);
    expect(list.total).toBe(t.people);
    expect((await drill('kind=brokers&window=today')).rows.every((r: any) => r.role === 'BROKER')).toBe(true);
    expect(p.activity.windows.d7.people).toBeGreaterThanOrEqual(t.people); expect(p.activity.windows.d30.people).toBeGreaterThanOrEqual(p.activity.windows.d7.people);
  });
  it('"did something" needs a change that went through — a refused request does not count', async () => {
    const before = (await drill('kind=acted&window=today')).rows.map((r: any) => r.id);
    expect(before).not.toContain('USR-BRK-002'); expect(before).not.toContain('USR-BUILDER-001');
    const bad = await call(jar.B2, 'POST', '/api/crm/leads', { projectId: PROJ, name: 'No Consent', phone: rnd() }); // consent missing → refused
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect((await drill('kind=acted&window=today')).rows.map((r: any) => r.id)).not.toContain('USR-BRK-002');
    const ok = await call(jar.B1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Pulse Lead', phone: rnd(), source: 'WALK_IN' });
    expect(ok.status, await ok.clone().text()).toBe(200);
    const after = await drill('kind=acted&window=today');
    expect(after.rows.map((r: any) => r.id)).toContain('USR-BRK-001');
    expect(after.rows.map((r: any) => r.id)).not.toContain('USR-BRK-002');
  });
  it('a "view as" session counts the admin, not the person he is looking at', async () => {
    const buyer = cfg.demoAccounts.find((a: any) => a.role === 'BUYER_TENANT');
    const baseline = new Set((await drill('kind=people&window=today')).rows.map((r: any) => r.id));
    expect(baseline.has(buyer.id)).toBe(false);
    const im = await call(jar.SUP, 'POST', '/api/auth/impersonate', { userId: buyer.id }); expect(im.status).toBe(200);
    const cookie = im.headers.get('set-cookie')!.split(';')[0];
    expect((await call(cookie, 'GET', '/api/auth/me')).status).toBe(200);
    expect((await call(cookie, 'GET', '/api/properties')).status).toBeLessThan(500);
    const after = (await drill('kind=people&window=today')).rows.map((r: any) => r.id);
    expect(after).not.toContain(buyer.id);
  });
  it('only a user id and a date are stored — no page, IP or phone — and the lists show no contact details', async () => {
    await wait(600); // the database is written a moment after a change
    const db = JSON.parse(readFileSync(path.join(dir, 'data', 'database.json'), 'utf-8'));
    expect(db.activityDays.length).toBeGreaterThan(0);
    for (const d of db.activityDays) {
      expect(Object.keys(d).sort()).toEqual(['acted', 'day', 'id', 'seen']); // v20: id = the day itself, nothing personal
      expect(d.id).toBe(d.day);
      for (const id of [...d.seen, ...d.acted]) expect(db.users.some((u: any) => u.id === id)).toBe(true);
    }
    for (const kind of ['people', 'signups']) {
      const rows = (await drill(`kind=${kind}&window=d30`)).rows; expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) for (const k of Object.keys(r)) expect(['phone', 'email', 'altPhone', 'pan', 'gstin', 'passwordHash']).not.toContain(k);
    }
  });
});

describe('what the network sold and collected', () => {
  const stageTo = async (id: string, stages: string[], cookie = jar.B1) => { for (const stage of stages) { const r = await call(cookie, 'POST', `/api/crm/leads/${id}/stage`, { stage }); expect(r.status, await r.clone().text()).toBe(200); } };
  let booking: any; let m2: any; let base: any; let custName: string;

  it('a booking approved by the builder shows up as a network sale — with its value and no customer', async () => {
    base = await pulse();
    custName = `Pulse Customer ${Date.now()}`;
    const l = (await j(await call(jar.B1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: custName, phone: rnd(), source: 'WALK_IN' }))).lead;
    await stageTo(l.id, ['CONTACTED', 'SITE_VISIT_SCHEDULED', 'SITE_VISITED']);
    const r = await call(jar.B1, 'POST', `/api/crm/leads/${l.id}/booking-request`, { unitNo: unit(), agreementValue: AV, tokenAmount: 50000, tokenMode: 'CHEQUE', tokenRef: 'CHQ-17' });
    expect(r.status, await r.clone().text()).toBe(200);
    const b = (await j(r)).booking;
    const mid = await pulse();
    expect(mid.bookings.counts.requested).toBe(base.bookings.counts.requested + 1);
    expect(mid.bookings.network.count).toBe(base.bookings.network.count); // a request is not a sale
    const ap = await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b.id}/decision`, { decision: 'APPROVE' }); expect(ap.status, await ap.clone().text()).toBe(200);
    booking = (await j(ap)).booking; m2 = booking.paymentSchedule[1];
    expect((await drill('kind=acted&window=today')).rows.map((r: any) => r.id)).toContain('USR-BUILDER-001'); // the approval was a real change
    const p = await pulse();
    expect(p.bookings.counts.approved).toBe(base.bookings.counts.approved + 1);
    expect(p.bookings.network.count).toBe(base.bookings.network.count + 1);
    expect(p.bookings.network.value).toBe(base.bookings.network.value + AV);
    expect(p.bookings.byWindow.today.network.count).toBe(base.bookings.byWindow.today.network.count + 1);
    expect(p.bookings.byWindow.today.network.value).toBe(base.bookings.byWindow.today.network.value + AV);
    expect(p.bookings.series.at(-1).approved).toBe(base.bookings.series.at(-1).approved + 1);
    expect(p.bookings.direct.count).toBe(base.bookings.direct.count); // the builder's own-desk number does not move
    const list = await drill('kind=bookings&status=APPROVED&scope=network&window=today');
    const row = list.rows.find((x: any) => x.id === booking.id);
    expect(row).toMatchObject({ projectName: expect.any(String), unitNo: booking.unitNo, agreementValue: AV, direct: false, status: 'APPROVED' });
    expect(JSON.stringify(list)).not.toContain(custName); // no customer name, ever
    for (const r2 of list.rows) for (const k of ['customerName', 'phone', 'leadId']) expect(Object.keys(r2)).not.toContain(k);
    expect(list.value).toBeGreaterThanOrEqual(AV);
  });
  it('the waiting list is the builder\'s open requests', async () => {
    const w = await drill('kind=bookings&status=REQUESTED&window=all');
    expect(w.total).toBe((await pulse()).bookings.counts.requested);
  });

  it('money is "on the way" until the builder confirms it, then it is collected', async () => {
    const amount = Math.floor(m2.amount / 2);
    const p0 = await pulse();
    const t = await call(jar.B1, 'POST', '/api/crm/money/trails', { bookingId: booking.id, target: m2.id, amount, mode: 'UPI', ref: 'UPI-V17-1' }); expect(t.status, await t.clone().text()).toBe(200);
    const tid = (await j(t)).trail.id;
    const p1 = await pulse();
    expect(p1.money.onTheWay.amount).toBe(p0.money.onTheWay.amount + amount); expect(p1.money.onTheWay.withPartner).toBe(p0.money.onTheWay.withPartner + amount);
    expect(p1.money.collectedNetwork).toBe(p0.money.collectedNetwork); // nothing is collected until the builder says so
    expect((await call(jar.B1, 'POST', `/api/crm/money/trails/${tid}/handover`, {})).status).toBe(200);
    const p2 = await pulse();
    expect(p2.money.onTheWay.handedOver).toBe(p0.money.onTheWay.handedOver + amount); expect(p2.money.onTheWay.withPartner).toBe(p0.money.onTheWay.withPartner);
    expect((await drill('kind=money')).rows.some((r: any) => r.id === tid && r.holder === 'BUILDER_PENDING')).toBe(true);
    const c = await call(jar.BUILDER, 'POST', `/api/crm/money/trails/${tid}/builder-confirm`, { received: true, receiptNo: 'RCPT-V17-1' }); expect(c.status, await c.clone().text()).toBe(200);
    const p3 = await pulse();
    expect(p3.money.onTheWay.amount).toBe(p0.money.onTheWay.amount);
    expect(p3.money.collectedNetwork).toBe(p0.money.collectedNetwork + amount);
    expect(p3.money.confirmedByBuilder).toBe(p0.money.confirmedByBuilder + amount);
    const row = (await drill('kind=bookings&status=APPROVED&scope=network&window=all')).rows.find((x: any) => x.id === booking.id);
    expect(row.collected).toBe(amount); expect(row.pct).toBeGreaterThan(0);
  });
});

describe('what is live', () => {
  it('counts projects that still have units, and lists them', async () => {
    const p = await pulse();
    expect(p.projects.live).toBeGreaterThanOrEqual(2); expect(p.projects.units.available).toBeGreaterThan(0);
    expect(p.network.brokers.verified).toBeGreaterThanOrEqual(2);
    const list = await drill('kind=projects&live=1');
    expect(list.rows.map((r: any) => r.id)).toEqual(expect.arrayContaining(['PROJ-RAI-01', PROJ]));
    expect(list.total).toBe(p.projects.live);
    expect(list.rows.every((r: any) => r.availableUnits > 0)).toBe(true);
  });
  it('the 30-day series is complete, oldest first, ending today', async () => {
    const p = await pulse();
    expect(p.activity.series).toHaveLength(30); expect(p.activity.series.at(-1).day).toBe(p.today);
    expect(p.activity.series.at(-1)).toMatchObject({ source: 'tracked' });
    const days = p.activity.series.map((s: any) => s.day); expect([...days].sort()).toEqual(days);
  });
});
