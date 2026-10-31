import { freePort } from './helpers/port';
/**
 * v31 — Connector % share: the connector and the working broker agree a % of the BROKER's commission on a referral.
 * Paid by the broker outside GENZ; GENZ caps the %, records the terms and keeps the trail.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const acct = (role: string, i = 0) => cfg.demoAccounts.filter((a: any) => a.role === role && a.verificationStatus === 'VERIFIED')[i];
async function login(email: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: cfg.demoPassword }) });
  expect(r.status).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const ph = () => '98' + String(10000000 + Math.floor(Math.random() * 89999999));

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v31a-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  jar.CON = await login(acct('GENZ_CONNECTOR').email);
  jar.CON2 = await login(acct('GENZ_CONNECTOR', 1).email);
  jar.ADMIN = await login(acct('ADMIN').email);
  jar.SUPER = await login(acct('SUPERADMIN').email);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

let id = ''; let brokerJar = ''; let brokerId = '';
const sh = (c: string, p: string, b?: unknown) => call(jar[c], 'POST', `/api/connector/referrals/${id}/${p}`, b);

describe('connector share', () => {
  it('setup: a referral assigned to a broker, worked up to IN_PROGRESS', async () => {
    const made = await j(await call(jar.CON, 'POST', '/api/connector/referrals', { type: 'SELL_PROPERTY', customerName: 'Share Customer', customerPhone: ph(), customerConsent: true, city: 'Raipur', locality: 'Pandri' }));
    id = made.referral.id;
    const users = (await j(await call(jar.ADMIN, 'GET', '/api/auth/users'))).users as any[];
    const broker = users.find(u => u.role === 'BROKER' && u.verificationStatus === 'VERIFIED' && u.id !== 'USR-BRK-001');
    brokerId = broker.id; brokerJar = await login(broker.email); jar.BRK = brokerJar;
    expect((await call(jar.ADMIN, 'POST', `/api/connector/referrals/${id}/assign`, { assigneeId: brokerId })).status).toBe(200);
    for (const s of ['CONTACTED', 'QUALIFIED', 'IN_PROGRESS']) expect((await call(jar.BRK, 'POST', `/api/connector/referrals/${id}/status`, { status: s })).status).toBe(200);
  });

  it('the cap is enforced and an outsider cannot touch the share', async () => {
    const meta = await j(await call(jar.CON, 'GET', '/api/connector/meta'));
    expect(meta.maxSharePct).toBe(25);
    expect((await sh('CON', 'share', { pct: 60 })).status).toBe(400);
    expect((await sh('CON', 'share', { pct: 0 })).status).toBe(400);
    expect((await sh('CON2', 'share', { pct: 10 })).status).toBe(404);           // another connector
    expect((await sh('ADMIN', 'share', { pct: 10 })).status).toBe(403);          // staff do not negotiate for either side
  });

  it('connector proposes, the broker cannot answer his own side, broker counters, connector accepts', async () => {
    const p = await sh('CON', 'share', { pct: 20 });
    expect(p.status, await p.clone().text()).toBe(200);
    expect((await j(p)).referral.share.status).toBe('PROPOSED');
    // the connector cannot accept his own proposal
    expect((await sh('CON', 'share/respond', { action: 'ACCEPT' })).status).toBe(409);
    // the broker counters
    const c = await sh('BRK', 'share', { pct: 12.5, note: 'normal rate' });
    expect(c.status).toBe(200);
    const shr = (await j(c)).referral.share;
    expect(shr.pct).toBe(12.5); expect(shr.proposedBy).toBe('WORKER');
    // the broker cannot accept his own counter
    expect((await sh('BRK', 'share/respond', { action: 'ACCEPT' })).status).toBe(409);
    const ok = await sh('CON', 'share/respond', { action: 'ACCEPT' });
    expect(ok.status).toBe(200);
    const done = (await j(ok)).referral.share;
    expect(done.status).toBe('AGREED'); expect(done.pct).toBe(12.5);
    expect(done.history.map((h: any) => h.action)).toEqual(['PROPOSED', 'COUNTERED', 'ACCEPTED']);
  });

  it('an agreed share is locked, and the commission can only be recorded after CLOSED_WON by the broker', async () => {
    expect((await sh('CON', 'share', { pct: 5 })).status).toBe(409);
    expect((await sh('BRK', 'share/deal', { commission: 100000 })).status).toBe(409);       // not won yet
    expect((await call(jar.BRK, 'POST', `/api/connector/referrals/${id}/status`, { status: 'CLOSED_WON' })).status).toBe(200);
    expect((await sh('CON', 'share/deal', { commission: 100000 })).status).toBe(403);       // connector cannot set the broker's commission
    expect((await sh('BRK', 'share/deal', { commission: -5 })).status).toBe(400);
    const d = await sh('BRK', 'share/deal', { commission: 150000 });
    expect(d.status, await d.clone().text()).toBe(200);
    const s = (await j(d)).referral.share;
    expect(s.amount).toBe(18750);                                                           // 12.5% of 1,50,000
  });

  it('the broker marks paid; the connector says not received (needs a note), the broker pays again, the connector confirms', async () => {
    expect((await sh('CON', 'share/settle', { action: 'CONFIRM' })).status).toBe(409);      // nothing marked paid yet
    expect((await sh('CON', 'share/settle', { action: 'PAID' })).status).toBe(403);         // connector cannot mark the broker's payment
    expect((await sh('BRK', 'share/settle', { action: 'PAID', note: 'UPI 1234' })).status).toBe(200);
    expect((await sh('CON', 'share/settle', { action: 'NOT_RECEIVED' })).status).toBe(400);
    expect((await sh('CON', 'share/settle', { action: 'NOT_RECEIVED', note: 'nothing came yet' })).status).toBe(200);
    // GENZ ops can see it as an exception
    const ov = await j(await call(jar.SUPER, 'GET', '/api/connector/overview'));
    expect(ov.queue.shareDisputes).toBeGreaterThanOrEqual(1);
    const list = await j(await call(jar.SUPER, 'GET', '/api/connector/referrals?queue=shareDisputes'));
    expect(list.referrals.some((r: any) => r.id === id)).toBe(true);
    expect((await sh('BRK', 'share/settle', { action: 'PAID', note: 'paid again, UTR 5678' })).status).toBe(200);
    const fin = await sh('CON', 'share/settle', { action: 'CONFIRM' });
    expect(fin.status).toBe(200);
    expect((await j(fin)).referral.share.status).toBe('CONFIRMED');
  });

  it('the connector sees the share without learning the broker; staff see it too; the audit trail has it', async () => {
    const mine = (await j(await call(jar.CON, 'GET', `/api/connector/referrals/${id}`))).referral;
    expect(mine.share.pct).toBe(12.5);
    expect(mine.assignedToName).toBeUndefined();
    expect(JSON.stringify(mine.share)).not.toContain(brokerId);
    const staff = (await j(await call(jar.ADMIN, 'GET', `/api/connector/referrals/${id}`))).referral;
    expect(staff.share.amount).toBe(18750);
    const audit = JSON.stringify(await j(await call(jar.SUPER, 'GET', '/api/audit-logs')));
    expect(audit).toContain('CONNECTOR_SHARE_CONFIRMED');
  });

  it('the superadmin can change the cap; the old cap no longer applies', async () => {
    expect((await call(jar.ADMIN, 'PUT', '/api/connector/settings', { maxSharePct: 10 })).status).toBe(403);
    expect((await call(jar.SUPER, 'PUT', '/api/connector/settings', { maxSharePct: 80 })).status).toBe(400);
    expect((await call(jar.SUPER, 'PUT', '/api/connector/settings', { maxSharePct: 10 })).status).toBe(200);
    const made = await j(await call(jar.CON, 'POST', '/api/connector/referrals', { type: 'SELL_PROPERTY', customerName: 'Cap Customer', customerPhone: ph(), customerConsent: true, city: 'Raipur', locality: 'Pandri' }));
    const r2 = await call(jar.CON, 'POST', `/api/connector/referrals/${made.referral.id}/share`, { pct: 15 });
    expect(r2.status).toBe(400);
    expect((await call(jar.CON, 'POST', `/api/connector/referrals/${made.referral.id}/share`, { pct: 10 })).status).toBe(200);
  });
});
