import { freePort } from './helpers/port';
/** v31 — the extras on each role's home: /api/home/insights returns a small, role-shaped summary and nothing private. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const acct = (role: string) => cfg.demoAccounts.find((a: any) => a.role === role && a.verificationStatus === 'VERIFIED');
async function insights(role: string) {
  const a = acct(role); if (!a) return null;
  const l = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(l.status, role).toBe(200);
  const r = await fetch(B + '/api/home/insights', { headers: { cookie: l.headers.get('set-cookie')!.split(';')[0] } });
  expect(r.status, role).toBe(200);
  return (await r.json()).insights;
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v31c-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], { cwd: dir, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('role home insights', () => {
  it('owner: per-listing numbers, no other person\'s data', async () => {
    const d = await insights('PROPERTY_OWNER');
    expect(d.role).toBe('PROPERTY_OWNER');
    expect(Array.isArray(d.listings)).toBe(true);
    for (const l of d.listings) for (const k of ['views', 'enquiries', 'visits', 'verifiedVisits', 'offers', 'days']) expect(typeof l[k], k).toBe('number');
    expect(JSON.stringify(d)).not.toMatch(/ownerApprovedNetPrice|customerPhone|otpCode/);
  });
  it('buyer: visits and needs only', async () => {
    const d = await insights('BUYER_TENANT');
    expect(Array.isArray(d.visits)).toBe(true); expect(typeof d.needs).toBe('number');
    expect(JSON.stringify(d)).not.toMatch(/otpCode|qrToken/);
  });
  it('legal counsel: case counts and a membership line', async () => {
    const d = await insights('LEGAL_COUNSEL');
    expect(d.cases).toHaveProperty('accepted'); expect(typeof d.open).toBe('number');
    expect(typeof d.membership.active).toBe('boolean'); expect(typeof d.membership.warn).toBe('boolean');
  });
  it('builder: this week and the most active broker', async () => {
    const d = await insights('DEVELOPER_BUILDER');
    for (const k of ['leads', 'visits', 'bookings']) expect(typeof d.week[k], k).toBe('number');
    expect(d).toHaveProperty('topBroker');
  });
  it('contractor and connector', async () => {
    const c = await insights('CONTRACTOR'); expect(c.jobs).toHaveProperty('active'); expect(c.requests).toHaveProperty('waiting');
    const k = await insights('GENZ_CONNECTOR'); expect(typeof k.referrals).toBe('number'); expect(typeof k.shareAsks).toBe('number');
  });
  it('admin and superadmin get the “today” list', async () => {
    for (const role of ['ADMIN', 'SUPERADMIN']) {
      const d = await insights(role);
      const ids = d.items.map((i: any) => i.id);
      for (const id of ['idreview', 'kyc', 'listings', 'disputes', 'utr', 'consents', 'shares']) expect(ids, role).toContain(id);
      for (const i of d.items) { expect(typeof i.n).toBe('number'); expect(i.tab).toBeTruthy(); }
    }
  });
});
