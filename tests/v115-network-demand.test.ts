/**
 * v115 — learned from Propi: (1) on MY listing, how many other brokers hold a client need it fits, and one tap a day to tell them;
 * (2) demand vs supply, area by area. Over real HTTP; client names / numbers never leave their broker.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { freePort } from './helpers/port';

const PORT = await freePort(); const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const call = (ck: string, m: string, u: string, b?: unknown) => fetch(B + u, { method: m, headers: { 'content-type': 'application/json', cookie: ck }, body: b ? JSON.stringify(b) : undefined });
const j = (r: Response) => r.json().catch(() => ({})) as Promise<any>;
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v115-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], { cwd: dir, stdio: 'ignore', env: { ...process.env, PUSH_DRY_RUN: 'true', SAHAYAK: 'off', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' } });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', BRK3: 'USR-BRK-003', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
}, 120_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

let home: any;
describe('v115 · my listing → the brokers who have a client for it', { timeout: 90_000 }, () => {
  it('another broker’s client need that fits my listing is counted — without the client’s name or number', async () => {
    home = ((await j(await call(jar.ADMIN, 'GET', '/api/properties'))).properties as any[]).find(p => p.listingBrokerId === 'USR-BRK-001' && p.transactionType === 'Sale' && p.listingStatus === 'active' && p.verificationStatus === 'VERIFIED');
    expect(home).toBeTruthy();
    const before = (await j(await call(jar.BRK1, 'GET', `/api/broadcast/listing/${home.id}`))).count;
    const r = await call(jar.BRK2, 'POST', '/api/daily/clients', { name: 'Secret Buyer Name', phone: '9822200001', budgetMin: Math.round(home.askingPrice * 0.9), budgetMax: Math.round(home.askingPrice * 1.1), city: home.city, areas: [home.locality], propertyType: home.propertyType, transactionType: 'Sale', tags: [], notes: '', consent: true });
    expect(r.status, await r.clone().text()).toBe(200);
    // my own client never counts as "another broker's buyer"
    await call(jar.BRK1, 'POST', '/api/daily/clients', { name: 'My Own Buyer', phone: '9822200002', budgetMin: Math.round(home.askingPrice * 0.9), budgetMax: Math.round(home.askingPrice * 1.1), city: home.city, areas: [home.locality], propertyType: home.propertyType, transactionType: 'Sale', tags: [], notes: '', consent: true });
    const d = await j(await call(jar.BRK1, 'GET', `/api/broadcast/listing/${home.id}`));
    expect(d.count).toBe(before + 1); expect(d.brokers).toBeGreaterThanOrEqual(1); expect(d.canTell).toBe(true);
    const raw = JSON.stringify(d); expect(raw).not.toContain('Secret Buyer Name'); expect(raw).not.toContain('9822200001'); expect(raw).not.toContain('My Own Buyer');
    expect(d.top.every((n: any) => n.score >= 60 && n.broker?.name)).toBe(true);
  });
  it('only the listing broker can see or use it', async () => {
    expect((await call(jar.BRK3, 'GET', `/api/broadcast/listing/${home.id}`)).status).toBe(404);
    expect((await call(jar.BRK3, 'POST', `/api/broadcast/listing/${home.id}/tell`)).status).toBe(404);
  });
  it('“tell them” reaches the other broker’s bell once; a second time the same day is refused', async () => {
    const t = await j(await call(jar.BRK1, 'POST', `/api/broadcast/listing/${home.id}/tell`));
    expect(t.sentTo).toBeGreaterThanOrEqual(1);
    const again = await call(jar.BRK1, 'POST', `/api/broadcast/listing/${home.id}/tell`); expect(again.status).toBe(409); expect((await j(again)).code).toBe('TOLD_RECENTLY');
    expect((await j(await call(jar.BRK1, 'GET', `/api/broadcast/listing/${home.id}`))).canTell).toBe(false);
    await wait(300);
    const bell = (await j(await call(jar.BRK2, 'GET', '/api/inbox'))).items as any[];
    expect(bell.some(i => /listing fits your client need/i.test(i.title || '') && String(i.body || '').includes(home.title.slice(0, 10)))).toBe(true);
  });
});

describe('v115 · demand vs supply, area by area', { timeout: 60_000 }, () => {
  it('the area of the new need shows demand and supply; the filters cut by sale / rent and residential / commercial', async () => {
    const all = await j(await call(jar.BRK1, 'GET', `/api/broadcast/demand-supply?city=${encodeURIComponent(home.city)}`));
    expect(all.demand).toBeGreaterThan(0); expect(all.supply).toBeGreaterThan(0);
    const row = (all.rows as any[]).find(r => r.area.toLowerCase() === String(home.locality).toLowerCase());
    expect(row, 'the home’s area is a row').toBeTruthy(); expect(row.demand).toBeGreaterThanOrEqual(2); expect(row.supply).toBeGreaterThanOrEqual(1);
    expect(['LIST', 'POST', 'EVEN']).toContain(row.tip);
    const rent = await j(await call(jar.BRK1, 'GET', `/api/broadcast/demand-supply?city=${encodeURIComponent(home.city)}&deal=Rent`));
    expect(rent.demand).toBeLessThan(all.demand); expect(rent.supply).toBeLessThan(all.supply);
    const com = await j(await call(jar.BRK1, 'GET', `/api/broadcast/demand-supply?city=${encodeURIComponent(home.city)}&seg=COM`));
    const res = await j(await call(jar.BRK1, 'GET', `/api/broadcast/demand-supply?city=${encodeURIComponent(home.city)}&seg=RES`));
    expect(com.supply + res.supply).toBe(all.supply); expect(com.demand + res.demand).toBe(all.demand);
    expect(JSON.stringify(all)).not.toContain('Secret Buyer Name');
  });
  it('the broker’s own city is the default', async () => {
    const d = await j(await call(jar.BRK1, 'GET', '/api/broadcast/demand-supply'));
    expect(d.city).toBeTruthy(); expect(Array.isArray(d.rows)).toBe(true);
  });
});
