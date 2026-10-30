/**
 * v90 — a client need is tidied when saved ("shanker nagar, raipur" → "Shankar Nagar"; a bare city stays a whole-city wish), the broker sees what the
 * NETWORK holds for it right away, only he can ask, and the QR page shows only the homes he ticks. Over real HTTP.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const PORT = 7400 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const form = (cookie: string | undefined, url: string, data: Record<string, string>) =>
  fetch(B + url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(data).toString() });
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v90-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });


const reqBody = (o: Record<string, unknown> = {}) => ({
  customerName: 'Ravi Test', customerPhone: '9000012345', budgetMin: 2000000, budgetMax: 90000000, city: 'Raipur', preferredLocalities: ['Shanker Nagar, Raipur'],
  preferredTags: [], propertyType: 'Residential Flat', transactionType: 'Sale', purpose: 'Self-use', urgency: 'Moderate (1-3 months)', ...o,
});

describe('v90 needs, network and QR homes', { timeout: 90000 }, () => {
  let reqId = ''; let wholeId = '';
  it('a need is saved with the area tidied and the broker is told what the network holds', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/requirements', reqBody());
    expect(r.status).toBe(200); const j = await r.json();
    reqId = j.requirement.id;
    expect(j.requirement.preferredLocalities).toEqual(['Shankar Nagar']);
    expect(j.network).toBeTruthy();
    expect(typeof j.network.count).toBe('number');
  });
  it('a bare city name stays a whole-city wish and matches homes in any area', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/requirements', reqBody({ customerPhone: '9000012346', preferredLocalities: ['raipur city'] }));
    const j = await r.json(); wholeId = j.requirement.id;
    expect(j.requirement.preferredLocalities).toEqual(['Raipur']);
    const all = await (await call(jar.BRK1, 'GET', `/api/broadcast/network/${wholeId}`)).json();
    const one = await (await call(jar.BRK1, 'GET', `/api/broadcast/network/${reqId}`)).json();
    expect(all.success).toBe(true);
    expect(all.count).toBeGreaterThanOrEqual(one.count);
    for (const h of all.top) { expect(h.city).toBe('Raipur'); expect(h.broker?.name).toBeTruthy(); }
  });
  it('only the broker who owns the need can look at it', async () => {
    expect((await call(jar.BRK2, 'GET', `/api/broadcast/network/${reqId}`)).status).toBe(404);
    expect((await call(undefined, 'GET', `/api/broadcast/network/${reqId}`)).status).toBeGreaterThanOrEqual(401);
  });
  it('the QR page shows only the homes the broker ticks', async () => {
    const ov = await (await call(jar.BRK1, 'GET', '/api/public-page')).json();
    expect(ov.success).toBe(true);
    const own = (ov.own || []).map((h: any) => h.id) as string[];
    if (own.length < 2) return; // the demo data has fewer than two live homes for broker 1 — nothing to choose between
    const pick = own[0];
    let r = await call(jar.BRK1, 'PUT', '/api/public-page/homes', { ids: [pick], ownerOk: true });
    expect(r.status).toBe(200);
    r = await call(jar.BRK1, 'PUT', '/api/public-page/settings', { enabled: true });
    expect(r.status).toBe(200);
    const after = await (await call(jar.BRK1, 'GET', '/api/public-page')).json();
    expect(after.homes.chosen).toEqual([pick]);
    const none = await call(jar.BRK1, 'PUT', '/api/public-page/homes', { ids: [] });
    expect((await none.json()).homes.chosen).toEqual([]);
  });
});
