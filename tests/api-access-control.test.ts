import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * End-to-end: boots the real server against a throw-away data directory and asserts
 * what each role can / cannot do over HTTP.
 */
const PORT = 3900 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess;
let dir: string;
let cfg: any;

const jar: Record<string, string> = {};
async function login(email: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: cfg.demoPassword }) });
  expect(r.status).toBe(200);
  return r.headers.get('set-cookie')!.split(';')[0];
}
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const byRole = (role: string, i = 0) => cfg.demoAccounts.filter((a: any) => a.role === role && a.verificationStatus === 'VERIFIED')[i];

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-e2e-'));
  mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  expect(cfg).toBeTruthy();
  for (const role of ['SUPERADMIN', 'ADMIN', 'BROKER', 'PROPERTY_OWNER', 'BUYER_TENANT', 'CONTRACTOR', 'DEVELOPER_BUILDER', 'LEGAL_COUNSEL']) {
    jar[role] = await login(byRole(role).email);
  }
}, 40_000);

afterAll(() => { proc?.kill(); if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('authentication', () => {
  it('rejects anonymous calls and the old x-user-id header', async () => {
    expect((await call(undefined, 'GET', '/api/properties')).status).toBe(401);
    const r = await fetch(B + '/api/auth/me', { headers: { 'x-user-id': 'USR-SUPERADMIN' } });
    expect(r.status).toBe(401);
  });
  it('wrong password -> 401, no user enumeration', async () => {
    const a = await call(undefined, 'POST', '/api/auth/login', { email: byRole('BROKER').email, password: 'nope-nope-1A' });
    const b = await call(undefined, 'POST', '/api/auth/login', { email: 'ghost@example.com', password: 'nope-nope-1A' });
    expect(a.status).toBe(401); expect(b.status).toBe(401);
    expect((await a.json()).error).toBe((await b.json()).error);
  });
  it('the old switch-user backdoor is gone', async () => {
    expect([404, 401]).toContain((await call(jar.BROKER, 'POST', '/api/auth/switch-user', { userId: 'USR-SUPERADMIN' })).status);
  });
  it('blocks cross-origin state changes', async () => {
    const r = await fetch(B + '/api/auth/logout', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json', cookie: jar.BROKER }, body: '{}' });
    expect(r.status).toBe(403);
  });
});

describe('role gates', () => {
  it.each([
    ['BROKER', '/api/auth/permission-matrix', 403],
    ['ADMIN', '/api/auth/permission-matrix', 200],
    ['BUYER_TENANT', '/api/crm/overview', 403],
    ['CONTRACTOR', '/api/crm/overview', 403],
    ['LEGAL_COUNSEL', '/api/crm/overview', 403],
    ['BROKER', '/api/crm/overview', 200],
    ['DEVELOPER_BUILDER', '/api/crm/overview', 200],
    ['BUYER_TENANT', '/api/deals', 403],
    ['PROPERTY_OWNER', '/api/builder/projects', 403],
  ])('%s GET %s -> %i', async (role, url, status) => {
    expect((await call(jar[role as string], 'GET', url as string)).status).toBe(status);
  });

  it('only SUPERADMIN may start "view as"', async () => {
    const t = byRole('BROKER', 1) || byRole('BROKER');
    expect((await call(jar.BROKER, 'POST', '/api/auth/impersonate', { userId: t.id })).status).toBe(403);
    expect((await call(jar.ADMIN, 'POST', '/api/auth/impersonate', { userId: t.id })).status).toBe(403);
  });

  it('SUPERADMIN "view as" is read-only', async () => {
    const t = byRole('BROKER');
    const r = await call(jar.SUPERADMIN, 'POST', '/api/auth/impersonate', { userId: t.id });
    expect(r.status).toBe(200);
    const imp = r.headers.get('set-cookie')!.split(';')[0];
    expect((await call(imp, 'GET', '/api/auth/me')).status).toBe(200);
    expect((await call(imp, 'POST', '/api/requirements', { title: 'x' })).status).toBe(403);
  });
});

describe('privacy', () => {
  it('user directory never leaks email/phone/password hashes to a broker', async () => {
    const r = await call(jar.BROKER, 'GET', '/api/auth/users');
    const { users } = await r.json();
    const me = byRole('BROKER');
    for (const u of users) {
      expect(u.passwordHash).toBeUndefined();
      expect(u.sessionVersion).toBeUndefined();
      if (u.id !== me.id) { expect(u.email).toBeUndefined(); expect(u.phone).toBeUndefined(); }
    }
  });
});

describe('Builder ⇄ Associates CRM', () => {
  it('registers a lead, blocks duplicates from another associate, enforces approval flow', async () => {
    const projects = await (await call(jar.BROKER, 'GET', '/api/crm/projects')).json();
    expect(projects.projects.length).toBeGreaterThan(0);
    const projectId = projects.projects[0].id;
    const phone = '9' + Math.floor(100000000 + Math.random() * 899999999);

    const created = await call(jar.BROKER, 'POST', '/api/crm/leads', { consent: true, projectId, name: 'Test Buyer', phone, source: 'ASSOCIATE_REFERRAL', unitInterest: '3 BHK' });
    expect(created.status).toBeLessThan(300);
    const lead = (await created.json()).lead;

    const dup = await call(jar.BROKER, 'POST', '/api/crm/leads', { consent: true, projectId, name: 'Test Buyer', phone });
    expect(dup.status).toBe(409);

    // cannot request a booking before the site visit
    const early = await call(jar.BROKER, 'POST', `/api/crm/leads/${lead.id}/booking-request`, { unitNo: 'A-101', agreementValue: 6000000, tokenAmount: 100000 });
    expect(early.status).toBe(409);

    // a broker can never approve their own booking
    expect((await call(jar.BROKER, 'POST', '/api/crm/bookings/CRM-B-0001/decision', { decision: 'APPROVE' })).status).toBe(403);

    // a buyer cannot touch the lead
    expect((await call(jar.BUYER_TENANT, 'GET', `/api/crm/leads/${lead.id}`)).status).toBe(403);
  });
});

describe('DPDP & India KYC', () => {
  // 234567890124 passes the Aadhaar (Verhoeff) check digit; v18: brokers must give PAN + Aadhaar + consent
  const regBody = (code: string, extra: any = {}) => ({ code, name: 'Test Broker', email: 'kyc.test@example.in', phone: '9826100011', password: 'Strong#Pass2026', consent: true, reraNumber: 'PCGRERA250518-0001', panNumber: 'ABCPE1234F', aadhaarNumber: '234567890124', idConsent: true, ...extra });

  it('registration enforces consent, PAN, GSTIN and RERA for brokers', async () => {
    const inv = await (await call(jar.SUPERADMIN, 'POST', '/api/invitations', { invitedEmail: 'kyc.test@example.in', invitedPhone: '9826100011', targetRole: 'BROKER' })).json();
    const code = inv.invitation.code;
    expect((await call(undefined, 'POST', '/api/auth/register-invite', regBody(code, { consent: false }))).status).toBe(400);
    expect((await call(undefined, 'POST', '/api/auth/register-invite', regBody(code, { panNumber: 'BAD' }))).status).toBe(400);
    expect((await call(undefined, 'POST', '/api/auth/register-invite', regBody(code, { gstin: '27AAPFU0939F1ZW' }))).status).toBe(400);
    expect((await call(undefined, 'POST', '/api/auth/register-invite', regBody(code, { reraNumber: '' }))).status).toBe(400);
    expect((await call(undefined, 'POST', '/api/auth/register-invite', regBody(code, { aadhaarNumber: undefined }))).status).toBe(400); // v18: Aadhaar is required for brokers
    expect((await call(undefined, 'POST', '/api/auth/register-invite', regBody(code, { aadhaarNumber: '234567890123' }))).status).toBe(400); // wrong check digit
    expect((await call(undefined, 'POST', '/api/auth/register-invite', regBody(code, { idConsent: false }))).status).toBe(400);
    const ok = await call(undefined, 'POST', '/api/auth/register-invite', regBody(code, { gstin: '27AAPFU0939F1ZV' }));
    expect(ok.status).toBe(200);
    const { user } = await ok.json();
    expect(user.verificationStatus).toBe('PENDING');
    expect(user.consent.policyVersion).toBeTruthy();
  });

  it('users can export their data and file an erasure request; only admins resolve it', async () => {
    const exp = await call(jar.BROKER, 'GET', '/api/privacy/export');
    expect(exp.status).toBe(200);
    const bundle = await exp.json();
    expect(bundle.profile.passwordHash).toBeUndefined();
    expect(bundle.profile.id).toBe(byRole('BROKER').id);

    const filed = await call(jar.BROKER, 'POST', '/api/privacy/requests', { type: 'GRIEVANCE', details: 'Please correct my company name' });
    expect(filed.status).toBe(200);
    const id = (await filed.json()).request.id;
    expect((await call(jar.BROKER, 'POST', `/api/privacy/requests/${id}/resolve`, { decision: 'COMPLETE' })).status).toBe(403);
    expect((await call(jar.ADMIN, 'POST', `/api/privacy/requests/${id}/resolve`, { decision: 'COMPLETE' })).status).toBe(200);
    // anonymous callers get nothing
    expect((await call(undefined, 'GET', '/api/privacy/export')).status).toBe(401);
  });

  it('exposes the grievance officer publicly', async () => {
    const r = await (await call(undefined, 'GET', '/api/legal/config')).json();
    expect(r.grievanceOfficer.email).toContain('@');
    expect(r.policyVersion).toBeTruthy();
  });
});
