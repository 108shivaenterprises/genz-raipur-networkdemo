import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { computeBonus, bookingCounts, type BonusScheme } from '../src/shared/bonus';

const scheme: BonusScheme = {
  enabled: true, qualifyCollectionPct: 10, windowFrom: '2026-10-01', windowTo: '2026-12-31',
  slabs: [
    { id: 'a', level: 'INDIVIDUAL', minUnits: 3, kind: 'LUMP_SUM', value: 50000 },
    { id: 'b', level: 'INDIVIDUAL', minUnits: 5, kind: 'EXTRA_PCT', value: 0.5 },
    { id: 'c', level: 'PROJECT', minUnits: 6, kind: 'LUMP_SUM', value: 20000 },
  ],
};
const bk = (mandateId: string, v = 5_000_000, over: any = {}) => ({ mandateId, associateId: mandateId + '-u', agreementValue: v, approvedAt: '2026-11-10T10:00:00Z', collectedPct: 20, ...over });

describe('computeBonus (pure)', () => {
  const ms = [{ mandateId: 'M1', associateId: 'M1-u' }, { mandateId: 'M2', associateId: 'M2-u' }];
  it('no bonus below the first slab', () => {
    const r = computeBonus(scheme, ms, [bk('M1'), bk('M1')]);
    expect(r.rows[0].earned).toBe(0);
    expect(r.rows[0].nextIndividual?.unitsToGo).toBe(1);
  });
  it('lump-sum slab at 3 units; highest slab only (no stacking) at 5 units', () => {
    expect(computeBonus(scheme, ms, [bk('M1'), bk('M1'), bk('M1')]).rows[0].individualAmount).toBe(50000);
    const five = computeBonus(scheme, ms, Array.from({ length: 5 }, () => bk('M1')));
    expect(five.rows[0].individualSlab?.id).toBe('b');
    expect(five.rows[0].individualAmount).toBe(Math.round(25_000_000 * 0.005)); // 0.5% of ₹2.5 Cr, not + the 50k lump sum
  });
  it('project-level slab pays each associate who has at least one counted unit', () => {
    const r = computeBonus(scheme, ms, [...Array.from({ length: 5 }, () => bk('M1')), bk('M2')]);
    expect(r.projectUnits).toBe(6);
    expect(r.rows[1].projectAmount).toBe(20000);
    expect(computeBonus(scheme, [...ms, { mandateId: 'M3', associateId: 'M3-u' }], [...Array.from({ length: 6 }, () => bk('M1'))]).rows[2].projectAmount).toBe(0);
  });
  it('ignores bookings outside the window or below the collection threshold; cancelled ones simply are not passed in', () => {
    expect(bookingCounts(scheme, bk('M1', 1, { approvedAt: '2026-09-30T23:00:00Z' }))).toBe(false);
    expect(bookingCounts(scheme, bk('M1', 1, { approvedAt: '2026-12-31T20:00:00Z' }))).toBe(true);
    expect(bookingCounts(scheme, bk('M1', 1, { collectedPct: 5 }))).toBe(false);
  });
  it('payable = earned − paid; flags over-payment after a cancellation', () => {
    const r = computeBonus(scheme, ms, [bk('M1'), bk('M1'), bk('M1')], { M1: 60000 });
    expect(r.rows[0].payable).toBe(0);
    expect(r.rows[0].overpaid).toBe(10000);
  });
  it('a disabled scheme pays nothing', () => {
    expect(computeBonus({ ...scheme, enabled: false }, ms, [bk('M1')]).rows).toEqual([]);
  });
});

const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
async function login(email: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: cfg.demoPassword }) });
  expect(r.status).toBe(200);
  return r.headers.get('set-cookie')!.split(';')[0];
}
const call = (cookie: string, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
const acct = (role: string, i = 0) => cfg.demoAccounts.filter((a: any) => a.role === role && a.verificationStatus === 'VERIFIED')[i];

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-bonus-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' },
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  jar.BUILDER = await login(acct('DEVELOPER_BUILDER').email);
  jar.BROKER = await login(acct('BROKER').email);
  jar.OWNER = await login(acct('PROPERTY_OWNER').email);
}, 40_000);
afterAll(async () => { proc?.kill(); await new Promise(r => setTimeout(r, 500)); if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('volume bonus API', () => {
  let projectId = '';
  it('builder sees own projects and can save a validated scheme; broker/owner cannot', async () => {
    const list = await (await call(jar.BUILDER, 'GET', '/api/crm/bonus')).json();
    expect(list.canManage).toBe(true);
    projectId = list.projects[0].projectId;
    const good = { enabled: true, qualifyCollectionPct: 0, slabs: [{ level: 'INDIVIDUAL', minUnits: 1, kind: 'LUMP_SUM', value: 10000 }, { level: 'PROJECT', minUnits: 2, kind: 'EXTRA_PCT', value: 0.25 }] };
    expect((await call(jar.BUILDER, 'PUT', `/api/crm/projects/${projectId}/bonus-scheme`, good)).status).toBe(200);
    expect((await call(jar.BROKER, 'PUT', `/api/crm/projects/${projectId}/bonus-scheme`, good)).status).toBe(403);
    expect((await call(jar.OWNER, 'GET', '/api/crm/bonus')).status).toBe(403);
  });
  it('rejects bad schemes (duplicate slab, % too large, empty, reversed dates)', async () => {
    const put = (b: any) => call(jar.BUILDER, 'PUT', `/api/crm/projects/${projectId}/bonus-scheme`, b);
    const s = (x: any) => ({ enabled: true, qualifyCollectionPct: 10, slabs: [{ level: 'INDIVIDUAL', minUnits: 2, kind: 'LUMP_SUM', value: 1000 }], ...x });
    expect((await put(s({ slabs: [{ level: 'INDIVIDUAL', minUnits: 2, kind: 'LUMP_SUM', value: 1 }, { level: 'INDIVIDUAL', minUnits: 2, kind: 'LUMP_SUM', value: 2 }] }))).status).toBe(400);
    expect((await put(s({ slabs: [{ level: 'INDIVIDUAL', minUnits: 2, kind: 'EXTRA_PCT', value: 9 }] }))).status).toBe(400);
    expect((await put(s({ slabs: [] }))).status).toBe(400);
    expect((await put(s({ windowFrom: '2026-12-01', windowTo: '2026-11-01' }))).status).toBe(400);
    expect((await put(s({ qualifyCollectionPct: 150 }))).status).toBe(400);
  });
  it('payout needs a UTR and cannot exceed what is payable', async () => {
    const pay = (b: any) => call(jar.BUILDER, 'POST', `/api/crm/projects/${projectId}/bonus/pay`, b);
    expect([400, 404]).toContain((await pay({ mandateId: 'NOPE', amount: 1, reference: 'UTR12345' })).status);
    const list = await (await call(jar.BUILDER, 'GET', '/api/crm/bonus')).json();
    const row = list.projects.find((p: any) => p.projectId === projectId).rows[0];
    if (row) {
      expect((await pay({ mandateId: row.mandateId, amount: row.payable + 1, reference: 'UTR12345' })).status).toBe(400);
      expect((await pay({ mandateId: row.mandateId, amount: 1, reference: 'x' })).status).toBe(400);
    }
    expect((await call(jar.BROKER, 'POST', `/api/crm/projects/${projectId}/bonus/pay`, { mandateId: 'x', amount: 1, reference: 'UTR12345' })).status).toBe(403);
  });
  it('a broker sees only their own progress row', async () => {
    const list = await (await call(jar.BROKER, 'GET', '/api/crm/bonus')).json();
    expect(list.canManage).toBe(false);
    const me = acct('BROKER').id;
    for (const p of list.projects) for (const r of p.rows) expect(r.associateId).toBe(me);
  });
  it('end-to-end: approved booking earns the slab, builder pays it with a UTR, payable drops to zero', async () => {
    const pid = 'PROJ-RAI-02';
    const sch = { enabled: true, qualifyCollectionPct: 0, slabs: [{ level: 'INDIVIDUAL', minUnits: 1, kind: 'LUMP_SUM', value: 10000 }] };
    expect((await call(jar.BUILDER, 'PUT', `/api/crm/projects/${pid}/bonus-scheme`, sch)).status).toBe(200);
    const dec = await call(jar.BUILDER, 'POST', '/api/crm/bookings/CRM-B-0001/decision', { decision: 'APPROVE' });
    expect(dec.status, await dec.clone().text()).toBe(200);
    const read = async () => (await (await call(jar.BROKER, 'GET', '/api/crm/bonus')).json()).projects.find((p: any) => p.projectId === pid).rows[0];
    const row = await read();
    expect(row.units).toBe(1);
    expect(row.earned).toBe(10000);
    expect((await call(jar.BUILDER, 'POST', `/api/crm/projects/${pid}/bonus/pay`, { mandateId: row.mandateId, amount: 10000, reference: 'UTR9988776655' })).status).toBe(200);
    const after = await read();
    expect(after.paid).toBe(10000);
    expect(after.payable).toBe(0);
    // cancelling the booking removes the earned bonus → flagged as over-paid for adjustment
    expect((await call(jar.BUILDER, 'POST', '/api/crm/bookings/CRM-B-0001/cancel', { reason: 'Customer withdrew' })).status).toBe(200);
    const cancelled = await read();
    expect(cancelled.earned).toBe(0);
    expect(cancelled.overpaid).toBe(10000);
  });
});
