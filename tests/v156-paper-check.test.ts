import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** v156 — the deal's Paper check is a plain tick / untick list the deal brokers keep; nobody else can tick and GENZ verifies nothing. */
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (c: string | undefined, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const j = (r: Response) => r.json();
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function login(who: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === who);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a ? a.email : who, password: cfg.demoPassword }) });
  expect(r.status, who).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const B1 = 'USR-BRK-001'; const B3 = 'USR-BRK-003'; const OWN = 'USR-OWNER-001';
const rnd = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v156-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, stdio: 'ignore',
    env: { ...process.env, KYC_VAULT_KEY: 'c4'.repeat(32), SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' },
  });
  for (let i = 0; i < 160; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  expect(cfg).toBeTruthy();
  const ids: Record<string, string> = { B1, B3, OWN };
  for (const [k, id] of Object.entries(ids)) jar[k] = await login(id);
}, 150_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

describe('paper check', () => {
  it('a deal broker ticks and unticks; unknown papers, strangers and the owner are refused', async () => {
    const deals = (await j(await call(jar.B1, 'GET', '/api/deals'))).deals as any[];
    const d = deals.find(x => x.introducingBrokerId === B1 || x.closingBrokerId === B1);
    expect(d).toBeTruthy();
    const u = `/api/deals/${d.id}/paper-checks`;
    const g0 = await j(await call(jar.B1, 'GET', u)); expect(g0.canTick).toBe(true);
    const on = await j(await call(jar.B1, 'POST', u, { key: 'sale_deed', done: true })); expect(on.checks.sale_deed.byName).toBeTruthy();
    expect((await j(await call(jar.B1, 'GET', u))).checks.sale_deed).toBeTruthy();
    const off = await j(await call(jar.B1, 'POST', u, { key: 'sale_deed', done: false })); expect(off.checks.sale_deed).toBeUndefined();
    expect((await call(jar.B1, 'POST', u, { key: 'made_up', done: true })).status).toBe(400);
    expect((await call(jar.B3, 'POST', u, { key: 'tax', done: true })).status).toBeGreaterThanOrEqual(403);
    const own = await call(jar.OWN, 'POST', u, { key: 'tax', done: true });
    expect([403, 404]).toContain(own.status);
    expect((await call(undefined, 'GET', u)).status).toBe(401);
  });
});

// v158 — the deal's dates: only the deal brokers set them, order is checked, the other broker and strangers are refused
describe('key dates', () => {
  it('set / clear / order / who may', async () => {
    const deals = (await j(await call(jar.B1, 'GET', '/api/deals'))).deals as any[];
    const d = deals.find(x => x.introducingBrokerId === B1 || x.closingBrokerId === B1);
    const u = `/api/deals/${d.id}/key-dates`;
    expect((await j(await call(jar.B1, 'GET', u))).canSet).toBe(true);
    const ok = await j(await call(jar.B1, 'POST', u, { token: '2027-03-10', registry: '2027-04-20' })); expect(ok.dates.registry).toBe('2027-04-20');
    expect((await call(jar.B1, 'POST', u, { registry: '2027-03-01' })).status).toBe(400);          // registry before token
    expect((await call(jar.B1, 'POST', u, { token: 'tomorrow' })).status).toBe(400);
    expect((await j(await call(jar.B1, 'POST', u, { registry: null }))).dates.registry).toBeUndefined();
    expect((await call(jar.B3, 'POST', u, { token: '2027-03-11' })).status).toBeGreaterThanOrEqual(403);
    expect([403, 404]).toContain((await call(jar.OWN, 'POST', u, { token: '2027-03-11' })).status);
    expect((await call(undefined, 'GET', u)).status).toBe(401);
  });
});
