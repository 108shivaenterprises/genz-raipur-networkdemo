/**
 * v87 — when a shop-QR lead's number opens, he lands in BOTH of the broker's lists: the client card (Today & Clients) AND the buyer need (Buyers / Magic Match). Before v85 — a shop-QR lead's number is hidden from the broker (only ••last4) until, in the in-app chat, the customer has confirmed his need
 * AND the broker has shared a home that matches it (an owner: until he confirms the property details). Over real HTTP.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const PORT = 7300 + Math.floor(Math.random() * 90);
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v93-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), SHOP_PROOF_REQUIRED: 'true', HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });



const JPG = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from('ffd8ffe000104a46494600', 'hex'), Buffer.alloc(2000, 1)]).toString('base64');
const TERMS = { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 };
const base = (o: Record<string, unknown> = {}) => ({ shopName: 'Raju Paan Shop', personName: 'Raju', phone: '9876500055', area: 'Raipur', city: 'Raipur', terms: TERMS, consent: true, ...o });
const geo = (lat = 21.2514, lng = 81.6296, acc = 12) => ({ lat, lng, acc });

describe('v93 one shop, one QR — proof of place', { timeout: 90000 }, () => {
  it('a new shop partner needs the in-app photo + GPS (when proof is required)', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', base()); expect(r.status).toBe(400); expect((await r.json()).code).toBe('PROOF_REQUIRED');
  });
  it('weak GPS, a non-photo and a location outside India are refused', async () => {
    expect((await (await call(jar.BRK1, 'POST', '/api/shop-partners', base({ photo: JPG, geo: geo(21.25, 81.62, 900) }))).json()).code).toBe('PROOF_ACC');
    expect((await (await call(jar.BRK1, 'POST', '/api/shop-partners', base({ photo: 'data:image/png;base64,AAAA', geo: geo() }))).json()).code).toBe('PROOF_PHOTO');
    expect((await (await call(jar.BRK1, 'POST', '/api/shop-partners', base({ photo: JPG, geo: geo(51.5, -0.1) }))).json()).code).toBe('PROOF_GEO');
  });
  let pid = '';
  it('with photo + GPS it is added, and the owner can see the photo (another broker cannot)', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', base({ photo: JPG, geo: geo() })); expect(r.status).toBe(200);
    const j = await r.json(); pid = j.partner.id; expect(j.partner.proof?.photo).toBe(true);
    const img = await fetch(`${B}/api/shop-partners/${pid}/photo`, { headers: { cookie: jar.BRK1 } }); expect(img.status).toBe(200); expect(img.headers.get('content-type')).toBe('image/jpeg');
    expect((await fetch(`${B}/api/shop-partners/${pid}/photo`, { headers: { cookie: jar.BRK2 } })).status).toBe(404);
  });
  it('ANOTHER broker cannot put a QR on the same shop: same mobile, or same place + name', async () => {
    const same = await call(jar.BRK2, 'POST', '/api/shop-partners', base({ photo: JPG, geo: geo(21.3, 81.7) }));
    expect(same.status).toBe(409); const j = await same.json(); expect(j.code).toBe('SHOP_TAKEN'); expect(JSON.stringify(j)).not.toMatch(/Vikram|USR-BRK/);
    const place = await call(jar.BRK2, 'POST', '/api/shop-partners', base({ phone: '9876500056', photo: JPG, geo: geo(21.25141, 81.62961) }));
    expect(place.status).toBe(409);
  });
  it('a different shop a few steps away (other name, other mobile) is allowed — it is a market', async () => {
    const r = await call(jar.BRK2, 'POST', '/api/shop-partners', base({ shopName: 'Sharma Chai', personName: 'Sharma', phone: '9876500057', photo: JPG, geo: geo(21.25141, 81.62961) }));
    expect(r.status).toBe(200);
  });
  it('the same broker cannot add the same mobile twice (as before)', async () => {
    expect((await call(jar.BRK1, 'POST', '/api/shop-partners', base({ photo: JPG, geo: geo() }))).status).toBe(409);
  });
});
