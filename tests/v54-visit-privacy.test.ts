import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * v54.1 — a site visit's buyer (full name + mobile) stays with the broker who brought him. The property owner and the other broker of the
 * deal see initials and a masked number (found in the role audit: GET /api/site-visits gave them the other broker's client in full).
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const FULL = /(?<!\d)[6-9]\d{9}(?!\d)/;

const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const visits = async (who: string, q = '') => ((await (await call(jar[who], 'GET', '/api/site-visits' + q)).json()).siteVisits || []) as any[];

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v541-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ B1: 'USR-BRK-001', B5: 'USR-BRK-005', OWNER: 'USR-OWNER-001', BUYER: 'USR-BUYER-001', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('site-visit buyer privacy', () => {
  it('the owner sees initials and a masked mobile for every visit to his property (and no visit code: he confirms with the customer’s code)', async () => {
    const list = await visits('OWNER');
    const theirs = list.filter(v => v.brokerId !== 'USR-OWNER-001');
    expect(theirs.length).toBeGreaterThan(0);
    for (const v of theirs) {
      expect(String(v.customerPhone || '')).not.toMatch(FULL);
      expect(v.customerName).toMatch(/^([A-Zऀ-ॿ]\. ?)+$|^Client$/);
    }
    expect(theirs.some(v => v.otpCode || v.qrToken)).toBe(false); // audit F13: the owner is a checker — the code comes from the customer
  });

  it('the other broker of the deal sees the same initials; the broker who brought the buyer sees him in full', async () => {
    const other = (await visits('B1')).filter(v => v.brokerId !== 'USR-BRK-001');
    expect(other.length).toBeGreaterThan(0);
    for (const v of other) { expect(String(v.customerPhone || '')).not.toMatch(FULL); expect(v.customerName).not.toMatch(/\w{3,}/); }
    const own = (await visits('B5')).filter(v => v.brokerId === 'USR-BRK-005' && v.customerPhone);
    expect(own.length).toBeGreaterThan(0);
    expect(own.some(v => FULL.test(String(v.customerPhone)))).toBe(true);
    expect(own.some(v => /\w{3,}/.test(v.customerName))).toBe(true);
  });

  it('the deal room shows the owner the same masked visit; the buyer and GENZ admins still see the full record', async () => {
    const d = await (await call(jar.OWNER, 'GET', '/api/deals/DEAL-2026-001')).json();
    for (const v of d.siteVisits || []) if (v.brokerId !== 'USR-OWNER-001') expect(String(v.customerPhone || '')).not.toMatch(FULL);
    const mine = await visits('BUYER');
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.some(v => /Pandey/.test(v.customerName))).toBe(true);
    const all = await visits('ADMIN');
    expect(all.some(v => FULL.test(String(v.customerPhone || '')))).toBe(true);
  });
});
