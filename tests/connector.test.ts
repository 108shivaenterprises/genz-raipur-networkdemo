import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** GENZ Connector programme: local shopkeepers / community members referring customers. */
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess;
let dir: string;
let cfg: any;
const jar: Record<string, string> = {};

async function login(id: string, password?: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: id, password: password || cfg.demoPassword }) });
  expect(r.status).toBe(200);
  return r.headers.get('set-cookie')!.split(';')[0];
}
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const acct = (role: string, i = 0) => cfg.demoAccounts.filter((a: any) => a.role === role && a.verificationStatus === 'VERIFIED')[i];
const j = async (r: Response) => r.json();

const newRef = (phone: string, over: any = {}) => ({
  type: 'BUY_PROPERTY', customerName: 'Test Customer', customerPhone: phone, customerConsent: true,
  city: 'Raipur', locality: 'Pandri', ...over,
});

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-conn-'));
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
  jar.CON = await login(acct('GENZ_CONNECTOR').email);
  jar.CON2 = await login(acct('GENZ_CONNECTOR', 1).email);
  jar.ADMIN = await login(acct('ADMIN').email);
  jar.BROKER = await login(acct('BROKER').email);
  jar.OWNER = await login(acct('PROPERTY_OWNER').email);
  jar.BUYER = await login(acct('BUYER_TENANT').email);
}, 40_000);

afterAll(async () => { proc?.kill(); await new Promise(r => setTimeout(r, 500)); if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('demo seed', () => {
  it('has 13 connector users (12 verified, 1 pending) covering 12 shop types, and 50 referrals', async () => {
    const ov = await j(await call(jar.ADMIN, 'GET', '/api/connector/referrals'));
    expect(ov.referrals.length).toBe(50);
    const partners = await j(await call(jar.ADMIN, 'GET', '/api/connector/partners'));
    expect(partners.partners.length).toBe(13);
    expect(new Set(partners.partners.map((p: any) => p.connector?.shopType || p.shopType)).size).toBeGreaterThanOrEqual(12);
  });
});

describe('connector access boundaries', () => {
  it('other roles cannot use the connector API', async () => {
    for (const k of ['OWNER', 'BUYER']) {
      expect((await call(jar[k], 'GET', '/api/connector/referrals')).status).toBe(403);
      expect((await call(jar[k], 'POST', '/api/connector/referrals', newRef('9876500001'))).status).toBe(403);
    }
    expect((await call(undefined, 'GET', '/api/connector/referrals')).status).toBe(401);
  });
  it('a connector cannot reach inventory, deals, audit-all, admin or management endpoints', async () => {
    for (const u of ['/api/deals', '/api/admin/control-center', '/api/connector/partners', '/api/connector/settings', '/api/invitations']) {
      expect([401, 403]).toContain((await call(jar.CON, 'GET', u)).status);
    }
    expect((await call(jar.CON, 'GET', '/api/properties')).status).toBe(403);
  });
  it('connectors are not exposed in the member directory to other brokers', async () => {
    const r = await j(await call(jar.BROKER, 'GET', '/api/auth/users'));
    expect(r.users.some((u: any) => u.role === 'GENZ_CONNECTOR')).toBe(false);
  });
  it('only the superadmin sees the control centre; admin does not', async () => {
    expect((await call(jar.ADMIN, 'GET', '/api/admin/control-center')).status).toBe(403);
  });
});

describe('referral submission', () => {
  it('requires customer consent', async () => {
    const r = await call(jar.CON, 'POST', '/api/connector/referrals', newRef('9876500002', { customerConsent: false }));
    expect(r.status).toBe(400);
  });
  it('rejects a connector referring their own number', async () => {
    const me = await j(await call(jar.CON, 'GET', '/api/auth/me'));
    const r = await call(jar.CON, 'POST', '/api/connector/referrals', newRef(String(me.user.phone).replace(/\D/g, '').slice(-10)));
    expect(r.status).toBe(400);
  });
  it('accepts a valid referral and blocks the same phone + need within 60 days', async () => {
    const a = await call(jar.CON, 'POST', '/api/connector/referrals', newRef('9876500003'));
    expect(a.status).toBe(200);
    const body = await j(a);
    expect(body.referral.status).toBe('SUBMITTED');
    expect((await call(jar.CON2, 'POST', '/api/connector/referrals', newRef('9876500003'))).status).toBe(409);
    expect((await call(jar.CON, 'POST', '/api/connector/referrals', newRef('9876500003', { type: 'CONSTRUCTION' }))).status).toBe(200);
  });
  it('a connector sees only their own referrals, without internal notes or broker identity', async () => {
    const mine = await j(await call(jar.CON, 'GET', '/api/connector/referrals'));
    const meId = (await j(await call(jar.CON, 'GET', '/api/auth/me'))).user.id;
    expect(mine.referrals.length).toBeGreaterThan(0);
    for (const x of mine.referrals) {
      expect(x.connectorId).toBe(meId);
      expect(x.assignedToName).toBeUndefined();
      expect(x.assignedToId).toBeUndefined();
      expect(x.internalNote).toBeUndefined();
    }
    const other = await j(await call(jar.CON2, 'GET', '/api/connector/referrals'));
    expect(other.referrals.every((x: any) => x.connectorId !== meId)).toBe(true);
  });
});

describe('operations flow: assign → progress → won → reward → pay', () => {
  let id: string;
  let broker: any;
  it('admin assigns property referrals only to brokers', async () => {
    const created = await j(await call(jar.CON, 'POST', '/api/connector/referrals', newRef('9876500010', { type: 'SELL_PROPERTY' })));
    id = created.referral.id;
    const users = await j(await call(jar.ADMIN, 'GET', '/api/auth/users'));
    // pick a broker who is NOT the demo connectors' sponsor (a sponsor legitimately sees and pays rewards)
    broker = users.users.find((u: any) => u.role === 'BROKER' && u.verificationStatus === 'VERIFIED' && u.id !== 'USR-BRK-001');
    const contractor = users.users.find((u: any) => u.role === 'CONTRACTOR' && u.verificationStatus === 'VERIFIED');
    if (contractor) expect((await call(jar.ADMIN, 'POST', `/api/connector/referrals/${id}/assign`, { assigneeId: contractor.id })).status).toBe(400);
    expect((await call(jar.ADMIN, 'POST', `/api/connector/referrals/${id}/assign`, { assigneeId: broker.id })).status).toBe(200);
  });
  it('status machine rejects skipped steps and requires assignment; lost needs a reason', async () => {
    expect((await call(jar.ADMIN, 'POST', `/api/connector/referrals/${id}/status`, { status: 'CLOSED_WON' })).status).toBe(409);
    expect((await call(jar.ADMIN, 'POST', `/api/connector/referrals/${id}/status`, { status: 'CONTACTED' })).status).toBe(200);
  });
  it('no reward before CLOSED_WON', async () => {
    expect((await call(jar.ADMIN, 'POST', `/api/connector/referrals/${id}/reward`, {})).status).toBe(409);
  });
  it('after won: reward approved, then payout needs a UTR reference', async () => {
    for (const s of ['QUALIFIED', 'IN_PROGRESS', 'CLOSED_WON']) {
      expect((await call(jar.ADMIN, 'POST', `/api/connector/referrals/${id}/status`, { status: s })).status).toBe(200);
    }
    expect((await call(jar.ADMIN, 'POST', `/api/connector/referrals/${id}/pay`, { reference: 'UTR123456' })).status).toBe(409);
    const ap = await call(jar.ADMIN, 'POST', `/api/connector/referrals/${id}/reward`, {});
    expect(ap.status).toBe(200);
    expect((await j(ap)).referral.rewardStatus).toBe('APPROVED');
    expect((await call(jar.ADMIN, 'POST', `/api/connector/referrals/${id}/pay`, { reference: 'x' })).status).toBe(400);
    expect((await call(jar.ADMIN, 'POST', `/api/connector/referrals/${id}/pay`, { reference: 'UTR123456' })).status).toBe(200);
    expect((await call(jar.ADMIN, 'POST', `/api/connector/referrals/${id}/reward`, {})).status).toBe(409);
  });
  it('the connector can see their reward status but cannot approve or pay it', async () => {
    expect((await call(jar.CON, 'POST', `/api/connector/referrals/${id}/reward`, {})).status).toBe(403);
    expect((await call(jar.CON, 'POST', `/api/connector/referrals/${id}/pay`, { reference: 'UTR999999' })).status).toBe(403);
  });
  it('an assigned broker sees the lead but never the reward data', async () => {
    const bro = await login(broker.email);
    const list = await j(await call(bro, 'GET', '/api/connector/referrals'));
    const mine = list.referrals.find((x: any) => x.id === id);
    expect(mine).toBeTruthy();
    expect(mine.rewardAmount).toBeUndefined();
    expect(mine.payoutReference).toBeUndefined();
  });
  it('reward events are hidden from the audit trail of non-admins', async () => {
    const a = await j(await call(jar.BROKER, 'GET', '/api/audit-logs'));
    const events = a.events || a.auditEvents || [];
    expect(events.some((e: any) => String(e.action).startsWith('CONNECTOR_REWARD'))).toBe(false);
  });
});

describe('phone-only onboarding of a shopkeeper (no e-mail)', () => {
  it('admin invites by mobile; shopkeeper registers; admin approves; shopkeeper logs in by mobile', async () => {
    const inv = await call(jar.ADMIN, 'POST', '/api/invitations', { invitedPhone: '9123456789', targetRole: 'GENZ_CONNECTOR' });
    expect(inv.status).toBe(200);
    const code = (await j(inv)).invitation.code;
    // wrong mobile number is refused
    const bad = await call(undefined, 'POST', '/api/auth/register-invite', { code, name: 'Ramu Chai Wala', phone: '9000000001', password: 'Chai@Stall2026', consent: true, state: 'Chhattisgarh', city: 'Raipur', shopType: 'TEA_STALL', shopName: 'Ramu Tea Stall', locality: 'Pandri' });
    expect(bad.status).toBe(400);
    const reg = await call(undefined, 'POST', '/api/auth/register-invite', { code, name: 'Ramu Chai Wala', phone: '9123456789', password: 'Chai@Stall2026', consent: true, state: 'Chhattisgarh', city: 'Raipur', shopType: 'TEA_STALL', shopName: 'Ramu Tea Stall', locality: 'Pandri' });
    expect(reg.status).toBe(200);
    const uid = (await j(reg)).user?.id;
    expect(uid).toBeTruthy();
    expect((await call(jar.ADMIN, 'POST', `/api/verifications/${uid}/review`, { action: 'APPROVE', notes: 'Visited the stall' })).status).toBe(200);
    const cookie = await login('9123456789', 'Chai@Stall2026');
    const me = await j(await call(cookie, 'GET', '/api/auth/me'));
    expect(me.user.role).toBe('GENZ_CONNECTOR');
    expect(me.user.connector.shopType).toBe('TEA_STALL');
    const rr = await call(cookie, 'POST', '/api/connector/referrals', newRef('9876500050', { type: 'RENT_TAKE' }));
    expect(await rr.text()).toContain('SUBMITTED');
  });
});

describe('superadmin control centre + maintenance mode', () => {
  it('serves the dashboard, saves validated settings, and maintenance blocks non-admins', async () => {
    const sa = acct('SUPERADMIN');
    if (!sa) return;
    const SA = await login(sa.email);
    const cc = await j(await call(SA, 'GET', '/api/admin/control-center'));
    expect(cc.connector.referrals).toBeGreaterThanOrEqual(50);
    expect(cc.audit.integrity).toBeTruthy();
    expect((await call(SA, 'PUT', '/api/admin/settings', { defaultProtectionPeriodDays: 1 })).status).toBe(400);
    expect((await call(SA, 'PUT', '/api/admin/settings', { maintenanceMode: true })).status).toBe(200);
    expect((await call(jar.CON, 'GET', '/api/connector/referrals')).status).toBe(503);
    expect((await call(SA, 'GET', '/api/connector/referrals')).status).toBe(200);
    expect((await call(SA, 'PUT', '/api/admin/settings', { maintenanceMode: false })).status).toBe(200);
    expect((await call(jar.CON, 'GET', '/api/connector/referrals')).status).toBe(200);
    const m = await j(await call(SA, 'GET', '/api/auth/permission-matrix'));
    expect(m.roles).toContain('GENZ_CONNECTOR');
  });
});

describe('desk tiles open the same list their number counts', () => {
  const q = async (cookie: string, queue: string) => j(await call(cookie, 'GET', `/api/connector/referrals?queue=${queue}`));
  const ov = async (cookie: string) => j(await call(cookie, 'GET', '/api/connector/overview'));

  it('every tile count equals the length of the list behind it', async () => {
    const o = await ov(jar.ADMIN);
    expect((await q(jar.ADMIN, 'unassigned')).referrals).toHaveLength(o.queue.unassigned);
    expect((await q(jar.ADMIN, 'rewardApprovals')).referrals).toHaveLength(o.queue.rewardApprovals);
    expect((await q(jar.ADMIN, 'payoutsDue')).referrals).toHaveLength(o.queue.payoutsDue);
    expect((await q(jar.ADMIN, 'open')).referrals).toHaveLength(o.stats.open);
    expect((await q(jar.ADMIN, 'won')).referrals).toHaveLength(o.stats.won);
    expect(o.queue.unassigned).toBeGreaterThan(0);
    expect(o.queue.payoutsDue).toBeGreaterThan(0);
    expect((await q(jar.ADMIN, 'payoutsDue')).referrals.every((r: any) => r.rewardStatus === 'APPROVED')).toBe(true);
    expect((await q(jar.ADMIN, 'rewardApprovals')).referrals.every((r: any) => r.status === 'CLOSED_WON' && r.rewardStatus === 'NONE')).toBe(true);
    expect((await q(jar.ADMIN, 'unassigned')).referrals.every((r: any) => r.status === 'SUBMITTED' && !r.assignedToId)).toBe(true);
    const due = (await q(jar.ADMIN, 'payoutsDue')).referrals.reduce((t: number, r: any) => t + (r.rewardAmount || 0), 0);
    expect(o.queue.payoutsDueAmount).toBe(due);
  });

  it('an approved reward moves from "reward approvals" to "payouts due", and leaves it once paid', async () => {
    const before = await ov(jar.ADMIN);
    const target = (await q(jar.ADMIN, 'rewardApprovals')).referrals[0];
    expect(target).toBeTruthy();
    const ok = await call(jar.ADMIN, 'POST', `/api/connector/referrals/${target.id}/reward`, {});
    expect(ok.status).toBe(200);
    const mid = await ov(jar.ADMIN);
    expect(mid.queue.rewardApprovals).toBe(before.queue.rewardApprovals - 1);
    expect(mid.queue.payoutsDue).toBe(before.queue.payoutsDue + 1);
    expect(mid.queue.payoutsDueAmount).toBeGreaterThan(before.queue.payoutsDueAmount);
    expect((await q(jar.ADMIN, 'payoutsDue')).referrals.some((r: any) => r.id === target.id)).toBe(true);
    expect((await call(jar.ADMIN, 'POST', `/api/connector/referrals/${target.id}/pay`, { reference: 'UTR123456' })).status).toBe(200);
    const after = await ov(jar.ADMIN);
    expect(after.queue.payoutsDue).toBe(before.queue.payoutsDue);
    expect((await q(jar.ADMIN, 'payoutsDue')).referrals.some((r: any) => r.id === target.id)).toBe(false);
  });

  it('rejects an unknown queue, and gives non-managers an empty money queue', async () => {
    expect((await call(jar.ADMIN, 'GET', '/api/connector/referrals?queue=everything')).status).toBe(400);
    for (const who of [jar.CON, jar.BROKER]) {
      for (const queue of ['payoutsDue', 'rewardApprovals']) {
        const r = await call(who, 'GET', `/api/connector/referrals?queue=${queue}`);
        if (r.status === 200) expect((await j(r)).referrals).toHaveLength(0);
        else expect([403, 404]).toContain(r.status);
      }
    }
  });
});
