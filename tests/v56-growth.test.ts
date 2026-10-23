import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** v56 — growth batch: a buyer's saved homes, the owner's anonymous "buyers looking" count, and the pending broker's own ID screen. */
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 7200 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (c: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = async (r: Response) => r.json();
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v56-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BUYER: 'USR-BUYER-001', OWNER: 'USR-OWNER-001', B1: 'USR-BRK-001', NEW: 'USR-BRK-004' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('saved homes', () => {
  it('a buyer saves and unsaves a live home; it shows on his home; only the public facts come back', async () => {
    const props = (await j(await call(jar.BUYER, 'GET', '/api/properties?limit=5'))).properties;
    const p = props.find((x: any) => ['active', 'under_negotiation'].includes(x.listingStatus));
    expect(p).toBeTruthy();
    expect((await j(await call(jar.BUYER, 'POST', `/api/saved/${p.id}`))).saved).toBe(true);
    const list = await j(await call(jar.BUYER, 'GET', '/api/saved'));
    expect(list.ids).toContain(p.id);
    const row = list.saved.find((x: any) => x.id === p.id);
    expect(row).toMatchObject({ id: p.id, title: p.title, available: true });
    expect(JSON.stringify(row)).not.toMatch(/ownerPhone|ownerName|street|googleMaps/);
    const home = (await j(await call(jar.BUYER, 'GET', '/api/home/insights'))).insights;
    expect(home.saved.some((x: any) => x.id === p.id)).toBe(true);
    expect((await j(await call(jar.BUYER, 'POST', `/api/saved/${p.id}`))).saved).toBe(false);
    expect((await j(await call(jar.BUYER, 'GET', '/api/saved'))).ids).not.toContain(p.id);
  });
  it('an unknown home cannot be saved; a stranger needs to sign in', async () => {
    expect((await call(jar.BUYER, 'POST', '/api/saved/PROP-NOPE')).status).toBe(404);
    expect((await call(undefined, 'GET', '/api/saved')).status).toBe(401);
  });
});

describe('owner: buyers looking for a home like mine', () => {
  it('each live listing carries a count (a number only), and a new matching buyer need raises it', async () => {
    const h1 = (await j(await call(jar.OWNER, 'GET', '/api/home/insights'))).insights;
    const live = h1.listings.find((l: any) => ['active', 'under_negotiation'].includes(l.status));
    expect(typeof live.demand).toBe('number');
    expect(JSON.stringify(h1.listings)).not.toMatch(/customerName|customerPhone|buyerId/);
    const p = await j(await call(jar.B1, 'GET', `/api/properties/${live.id}`));
    const prop = p.property || p;
    const r = await call(jar.B1, 'POST', '/api/requirements', {
      customerName: 'Demand Test', customerPhone: '9' + String(Date.now()).slice(-9), transactionType: prop.transactionType, propertyType: prop.propertyType,
      city: prop.city, state: prop.state, preferredLocalities: [prop.locality], budgetMin: Math.round(prop.askingPrice * 0.8), budgetMax: Math.round(prop.askingPrice * 1.2), purpose: 'Self-use', urgency: 'Moderate (1-3 months)',
    });
    expect([200, 201]).toContain(r.status);
    const h2 = (await j(await call(jar.OWNER, 'GET', '/api/home/insights'))).insights;
    expect(h2.listings.find((l: any) => l.id === live.id).demand).toBeGreaterThanOrEqual(live.demand + 1);
  });
});

describe('pending broker', () => {
  it('can read his own ID check while pending (the waiting screen shows it), and nothing else opens', async () => {
    const me = await j(await call(jar.NEW, 'GET', '/api/auth/me'));
    expect((me.user || me).verificationStatus).toBe('PENDING');
    const r = await call(jar.NEW, 'GET', '/api/id-review/mine');
    expect(r.status).toBe(200);
    expect(Array.isArray((await j(r)).docs)).toBe(true);
    expect((await call(jar.NEW, 'GET', '/api/properties')).status).toBe(403);
  });
});
