import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** v9: demo profiles for every role + employees on every side, ops staff desk, number-less connector referrals. */
const PORT = 4400 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess;
let dir: string;
let cfg: any;
const jar: Record<string, string> = {};

async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: id, password: cfg.demoPassword }) });
  expect(r.status).toBe(200);
  return r.headers.get('set-cookie')!.split(';')[0];
}
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const byId = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v9-'));
  mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ }
    await new Promise(r => setTimeout(r, 250));
  }
  expect(cfg).toBeTruthy();
}, 30000);
afterAll(() => { proc?.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

describe('demo people', () => {
  it('has at least one demo profile for every role', () => {
    const roles = new Set(cfg.demoAccounts.map((a: any) => a.role));
    for (const r of ['SUPERADMIN', 'ADMIN', 'BROKER', 'PROPERTY_OWNER', 'BUYER_TENANT', 'CONTRACTOR', 'DEVELOPER_BUILDER', 'LEGAL_COUNSEL', 'GENZ_CONNECTOR', 'TEAM_MEMBER']) expect(roles.has(r)).toBe(true);
  });
  it('has employees under builders, brokers, contractors, admin and superadmin — and they can all sign in', async () => {
    for (const id of ['USR-TEAM-001', 'USR-TEAM-003', 'USR-TEAM-005', 'USR-TEAM-008', 'USR-TEAM-011', 'USR-TEAM-013']) {
      const a = byId(id);
      expect(a, id).toBeTruthy();
      jar[id] = await login(a.email);
    }
  });
  it('employee powers follow the employer role', async () => {
    const perms = async (id: string) => (await j(await call(jar[id], 'GET', '/api/auth/me').then(r => r.status === 200 ? r : call(jar[id], 'GET', '/api/auth/session')))).permissions as string[] | undefined;
    const adminStaff = await perms('USR-TEAM-011');
    if (adminStaff) {
      expect(adminStaff).toContain('connector:desk');
      expect(adminStaff).not.toContain('connector:manage');
      expect(adminStaff).not.toContain('connector:payout');
      expect(adminStaff).not.toContain('users:review');
    }
    // contractor staff: sees the employer's jobs only, never commission
    const r = await j(await call(jar['USR-TEAM-008'], 'GET', '/api/construction-leads'));
    for (const l of r.leads) {
      expect(l.assignedContractorId).toBe('USR-CONTRACTOR-001');
      expect(l.referralCommissionPct).toBeUndefined();
      expect(l.finalContractValue).toBeUndefined();
    }
    expect((await call(jar['USR-TEAM-008'], 'POST', '/api/construction-leads/CL-X/request-access', { termsAccepted: true })).status).toBe(403);
    // builder/broker staff cannot reach the connector desk
    expect((await call(jar['USR-TEAM-005'], 'GET', '/api/connector/referrals')).status).toBe(403);
  });
});

describe('ops staff desk', () => {
  it('sees all referrals but no reward data and cannot approve rewards or edit settings', async () => {
    const r = await j(await call(jar['USR-TEAM-011'], 'GET', '/api/connector/referrals'));
    expect(r.referrals.length).toBeGreaterThan(10);
    for (const x of r.referrals) { expect(x.rewardStatus).toBeUndefined(); expect(x.rewardAmount).toBeUndefined(); }
    const won = r.referrals.find((x: any) => x.status === 'CLOSED_WON');
    expect(won).toBeTruthy();
    expect((await call(jar['USR-TEAM-011'], 'POST', `/api/connector/referrals/${won.id}/reward`, { amount: 500 })).status).toBe(403);
    expect((await call(jar['USR-TEAM-011'], 'PUT', '/api/connector/settings', { enabled: false })).status).toBe(403);
    expect((await call(jar['USR-TEAM-011'], 'GET', '/api/connector/partners')).status).toBe(403);
    const users = await j(await call(jar['USR-TEAM-011'], 'GET', '/api/auth/users'));
    expect(users.users.some((u: any) => u.role === 'BROKER')).toBe(true); // assignment pool
  });
});

describe('connector keeps the number (introduce mode)', () => {
  let conn1: string, conn2: string, broker2: string, admin: string;
  let introId = '';
  const phoneA = rnd();
  beforeAll(async () => {
    const cons = cfg.demoAccounts.filter((a: any) => a.role === 'GENZ_CONNECTOR' && a.verificationStatus === 'VERIFIED');
    conn1 = await login(cons[0].email); conn2 = await login(cons[1].email);
    broker2 = await login(byId('USR-BRK-002').email);
    admin = await login(byId('USR-ADMIN-1').email);
  });
  const body = (extra: any = {}) => ({ type: 'BUY_PROPERTY', customerName: 'Mohan Lal Test', city: 'Raipur', locality: 'Shankar Nagar', customerConsent: true, ...extra });

  it('requires a number unless the connector chooses to introduce', async () => {
    expect((await call(conn1, 'POST', '/api/connector/referrals', body())).status).toBe(400);
    const r = await call(conn1, 'POST', '/api/connector/referrals', body({ contactMode: 'CONNECTOR_INTRODUCES' }));
    expect(r.status).toBe(200);
    const x = (await j(r)).referral;
    expect(x.contactMode).toBe('CONNECTOR_INTRODUCES');
    expect(x.customerPhone).toBe('');
    introId = x.id;
  });
  it('blocks the same connector registering the same person+place twice', async () => {
    expect((await call(conn1, 'POST', '/api/connector/referrals', body({ contactMode: 'CONNECTOR_INTRODUCES' }))).status).toBe(409);
  });
  it('shows the connector number to the assigned broker, not the sponsor-less public', async () => {
    expect((await call(admin, 'POST', `/api/connector/referrals/${introId}/assign`, { assigneeId: 'USR-BRK-002' })).status).toBe(200);
    const x = (await j(await call(broker2, 'GET', `/api/connector/referrals/${introId}`))).referral;
    expect(x.connectorPhone).toBeTruthy();
    expect(x.rewardStatus).toBeUndefined();
    const own = (await j(await call(conn1, 'GET', `/api/connector/referrals/${introId}`))).referral;
    expect(own.assignedToId).toBeUndefined();
  });
  it('cannot go in-progress without a customer number; attaching it unlocks', async () => {
    for (const s of ['CONTACTED', 'QUALIFIED']) expect((await call(broker2, 'POST', `/api/connector/referrals/${introId}/status`, { status: s })).status).toBe(200);
    expect((await call(broker2, 'POST', `/api/connector/referrals/${introId}/status`, { status: 'IN_PROGRESS' })).status).toBe(409);
    expect((await call(broker2, 'POST', `/api/connector/referrals/${introId}/attach-contact`, { customerPhone: '123' })).status).toBe(400);
    const a = await j(await call(conn1, 'POST', `/api/connector/referrals/${introId}/attach-contact`, { customerPhone: phoneA }));
    expect(a.duplicate).toBe(false);
    expect((await call(broker2, 'POST', `/api/connector/referrals/${introId}/status`, { status: 'IN_PROGRESS' })).status).toBe(200);
  });
  it('earliest registration wins when the same person turns up twice', async () => {
    const phoneB = rnd();
    const first = await j(await call(conn2, 'POST', '/api/connector/referrals', body({ customerName: 'Early Bird', customerPhone: phoneB })));
    expect(first.success).toBe(true);
    const late = await j(await call(conn1, 'POST', '/api/connector/referrals', body({ customerName: 'Late Comer', locality: 'Telibandha', contactMode: 'CONNECTOR_INTRODUCES' })));
    const r = await j(await call(conn1, 'POST', `/api/connector/referrals/${late.referral.id}/attach-contact`, { customerPhone: phoneB }));
    expect(r.duplicate).toBe(true);
    expect(r.referral.status).toBe('DUPLICATE');
    const kept = (await j(await call(conn2, 'GET', `/api/connector/referrals/${first.referral.id}`))).referral;
    expect(kept.status).not.toBe('DUPLICATE');
  });
});
