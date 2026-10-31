import { freePort } from './helpers/port';
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
const PORT = await freePort();
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v92-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });



import { brokerLevel } from '../src/shared/brokerLevel';

describe('v92 broker level, network feed, WhatsApp share target', { timeout: 90000 }, () => {
  it('level: a broker without RERA is a full member and can climb; RERA starts one step higher', () => {
    expect(brokerLevel({ tier: 'TIER2' }).code).toBe('G1');
    expect(brokerLevel({ tier: 'TIER2', completedDealsCount: 3 }).code).toBe('G2');
    expect(brokerLevel({ tier: 'TIER2', completedDealsCount: 10 }).code).toBe('G3');
    expect(brokerLevel({ reraNumber: 'PCGRERA260100001', tier: 'TIER1' }).code).toBe('G2');
    expect(brokerLevel({ reraNumber: 'PCGRERA260100001', tier: 'TIER1', completedDealsCount: 10 }).code).toBe('G4');
    expect(brokerLevel({ reraNumber: 'X', tier: 'TIER2' }).rera).toBe(false);   // a local associate is never shown as RERA
  });
  it('the feed lists live homes with the broker level, needs are anonymous, and a buyer account is refused', async () => {
    const r = await call(jar.BRK1, 'GET', '/api/feed'); expect(r.status).toBe(200);
    const j = await r.json(); expect(Array.isArray(j.items)).toBe(true);
    for (const it of j.items) { expect(['LISTING', 'NEED']).toContain(it.kind); expect(it.broker.level).toMatch(/^G[1-4]$/); expect(JSON.stringify(it)).not.toMatch(/customerName|customerPhone|phone/i); }
    expect((await call(jar.BRK1, 'GET', '/api/feed?kind=listings')).status).toBe(200);
    expect((await call(undefined, 'GET', '/api/feed')).status).toBe(401);
  });
  it('a need sent to the network shows up in the feed for another broker, without the client', async () => {
    const mk = await call(jar.BRK1, 'POST', '/api/requirements', { customerName: 'Secret Name', customerPhone: '9000099911', budgetMin: 2000000, budgetMax: 9000000, city: 'Raipur', preferredLocalities: ['Shankar Nagar'], preferredTags: [], propertyType: 'Residential Flat', transactionType: 'Sale', purpose: 'Self-use', urgency: 'Moderate (1-3 months)' });
    expect(mk.status).toBe(200); const rid = (await mk.json()).requirement.id;
    const bc = await call(jar.BRK1, 'POST', '/api/broadcast', { requirementId: rid }); expect(bc.status).toBe(200);
    const f = await (await call(jar.BRK2, 'GET', '/api/feed?kind=needs')).json();
    expect(f.items.some((x: any) => x.kind === 'NEED')).toBe(true);
    expect(JSON.stringify(f)).not.toContain('Secret Name'); expect(JSON.stringify(f)).not.toContain('9000099911');
  });
  it('the app can receive a WhatsApp share (web share target)', async () => {
    const m = JSON.parse(readFileSync(path.join(ROOT, 'public/manifest.webmanifest'), 'utf8'));
    expect(m.share_target?.params?.text).toBe('stext');
  });
});
