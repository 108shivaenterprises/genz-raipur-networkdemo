/**
 * v116 — a brand-new account for EVERY role, made the real way (no seed): GENZ invites → the person registers with the code →
 * waits as PENDING (locked out of work) → GENZ approves → signs in → the role's own first screen / first action works.
 * A team member is made by his broker (temporary password, must change it). A SUPERADMIN can never be made through the API.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { freePort } from './helpers/port';

const PORT = await freePort(); const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const call = (ck: string | undefined, m: string, u: string, b?: unknown) => fetch(B + u, { method: m, headers: { 'content-type': 'application/json', ...(ck ? { cookie: ck } : {}) }, body: b ? JSON.stringify(b) : undefined });
const j = (r: Response) => r.json().catch(() => ({})) as Promise<any>;
async function login(who: string, password: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: who, password }) });
  expect(r.status, `${who} ${await r.clone().text()}`).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
let SA = ''; let ADMIN = '';
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v116-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], { cwd: dir, stdio: 'ignore', env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', PUSH_DRY_RUN: 'true', SAHAYAK: 'off', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' } });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  SA = await login(cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').email, cfg.demoPassword);
  ADMIN = await login(cfg.demoAccounts.find((a: any) => a.id === 'USR-ADMIN-1').email, cfg.demoPassword);
}, 120_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const PASS = 'Naya#Account2026';
// one new person per role; the extra fields are what that role's registration form asks for
const PEOPLE: { role: string; name: string; phone: string; email?: string; extra?: Record<string, unknown>; firstWork: (ck: string) => Promise<number> }[] = [
  { role: 'ADMIN', name: 'Naya Admin', phone: '9826170001', email: 'naya.admin@test.genz.example', firstWork: async ck => (await call(ck, 'GET', '/api/invitations')).status },
  { role: 'BROKER', name: 'Naya Broker', phone: '9826170002', email: 'naya.broker@test.genz.example', extra: { reraNumber: 'PCGRERA250518-0917', panNumber: 'ABCPN1234F', aadhaarNumber: '234567890124', idConsent: true, companyName: 'Naya Realty' },
    firstWork: async ck => (await call(ck, 'POST', '/api/daily/clients', { name: 'Pehla Client', phone: '9826179001', budgetMin: 0, budgetMax: 4_000_000, city: 'Raipur', areas: ['Pandri'], propertyType: 'Residential Flat', transactionType: 'Sale', tags: [], notes: '', consent: true })).status },
  { role: 'PROPERTY_OWNER', name: 'Naya Owner', phone: '9826170003', email: 'naya.owner@test.genz.example', firstWork: async ck => (await call(ck, 'GET', '/api/properties')).status },
  { role: 'BUYER_TENANT', name: 'Naya Buyer', phone: '9826170004', email: 'naya.buyer@test.genz.example', firstWork: async ck => (await call(ck, 'GET', '/api/requirements')).status },
  { role: 'CONTRACTOR', name: 'Naya Contractor', phone: '9826170005', email: 'naya.contractor@test.genz.example', extra: { companyName: 'Naya Constructions' }, firstWork: async ck => (await call(ck, 'GET', '/api/auth/me')).status },
  { role: 'DEVELOPER_BUILDER', name: 'Naya Builder', phone: '9826170006', email: 'naya.builder@test.genz.example', extra: { reraNumber: 'PCGRERAP150125-0007', panNumber: 'AABCN1234F', companyName: 'Naya Developers' }, firstWork: async ck => (await call(ck, 'GET', '/api/inventory/projects')).status },
  { role: 'LEGAL_COUNSEL', name: 'Naya Vakeel', phone: '9826170007', email: 'naya.legal@test.genz.example', extra: { companyName: 'Naya Chambers' }, firstWork: async ck => (await call(ck, 'GET', '/api/auth/me')).status },
  { role: 'GENZ_CONNECTOR', name: 'Naya Dukaan', phone: '9826170008', extra: { state: 'Chhattisgarh', shopType: 'KIRANA_STORE', shopName: 'Naya Kirana', locality: 'Telibandha' }, firstWork: async ck => (await call(ck, 'GET', '/api/connector/referrals')).status },
];

describe('v116 · a new account for every role, the real way', { timeout: 180_000 }, () => {
  const made: Record<string, { id: string; login: string }> = {};
  it('a SUPERADMIN cannot be made through an invitation (by design)', async () => {
    expect((await call(SA, 'POST', '/api/invitations', { invitedEmail: 'naya.super@test.genz.example', invitedPhone: '9826170000', targetRole: 'SUPERADMIN' })).status).toBe(403);
    expect((await call(ADMIN, 'POST', '/api/invitations', { invitedEmail: 'naya.admin2@test.genz.example', invitedPhone: '9826170010', targetRole: 'ADMIN' })).status).toBe(403);   // only a superadmin invites admins
  });
  for (const p of PEOPLE) {
    it(`${p.role}: invite → register → PENDING → approve → sign in → first work`, async () => {
      const inv = await call(SA, 'POST', '/api/invitations', { ...(p.email ? { invitedEmail: p.email } : {}), invitedPhone: p.phone, targetRole: p.role });
      expect(inv.status, await inv.clone().text()).toBe(200);
      const code = (await j(inv)).invitation.code;
      expect((await j(await call(undefined, 'GET', `/api/invitations/validate/${code}`))).valid ?? true).toBeTruthy();
      const first = p === PEOPLE[0];   // registration is rate-limited (10 an hour from one place) — the refusals are checked once
      if (first) expect((await call(undefined, 'POST', '/api/auth/register-invite', { code, name: p.name, phone: p.phone, ...(p.email ? { email: p.email } : {}), password: 'weak', consent: true, city: 'Raipur', ...p.extra })).status).toBe(400);   // a weak password is refused
      const reg = await call(undefined, 'POST', '/api/auth/register-invite', { code, name: p.name, phone: p.phone, ...(p.email ? { email: p.email } : {}), password: PASS, consent: true, city: 'Raipur', ...p.extra });
      expect(reg.status, await reg.clone().text()).toBe(200);
      const user = (await j(reg)).user; expect(user.role).toBe(p.role);
      if (first) expect((await call(undefined, 'POST', '/api/auth/register-invite', { code, name: p.name, phone: p.phone, ...(p.email ? { email: p.email } : {}), password: PASS, consent: true, city: 'Raipur', ...p.extra })).status).toBe(400);   // a code works once
      const who = p.email || p.phone;
      if (user.verificationStatus === 'PENDING') {
        const pending = await login(who, PASS);
        expect((await j(await call(pending, 'GET', '/api/auth/me'))).user.verificationStatus).toBe('PENDING');
        if (p.role === 'BROKER') expect((await p.firstWork(pending))).toBe(403);   // locked out of work until GENZ checks the KYC
        const ap = await call(SA, 'POST', `/api/verifications/${user.id}/review`, { action: 'APPROVE', notes: 'Documents seen (test)' });
        expect(ap.status, await ap.clone().text()).toBe(200);
      }
      const ck = await login(who, PASS);
      const me = await j(await call(ck, 'GET', '/api/auth/me'));
      expect(me.user.role).toBe(p.role); expect(me.user.verificationStatus).toBe('VERIFIED');
      expect((me.permissions || []).length).toBeGreaterThan(0);
      expect(await p.firstWork(ck), `${p.role} first work`).toBe(200);
      made[p.role] = { id: user.id, login: who };
    });
  }
  it('TEAM_MEMBER: the new broker adds his staff → temporary password → must change it → then works for his broker', async () => {
    const brk = await login(made.BROKER.login, PASS);
    const r = await call(brk, 'POST', '/api/team', { name: 'Naya Staff', phone: '9826170009', title: 'Telecaller', consentAttested: true });
    expect(r.status, await r.clone().text()).toBe(200);
    const temp = (await j(r)).temporaryPassword as string;
    let ck = await login('9826170009', temp);
    expect((await j(await call(ck, 'GET', '/api/auth/me'))).mustChangePassword).toBe(true);
    expect((await call(ck, 'POST', '/api/auth/change-password', { currentPassword: temp, newPassword: PASS })).status).toBe(200);
    ck = await login('9826170009', PASS);
    const me = await j(await call(ck, 'GET', '/api/auth/me'));
    expect(me.user.role).toBe('TEAM_MEMBER'); expect(me.user.employerId).toBe(made.BROKER.id); expect(me.mustChangePassword).toBeFalsy();
  });
  it('every new account shows in the admin’s user list with its role', async () => {
    const users = (await j(await call(SA, 'GET', '/api/auth/users'))).users as any[];
    for (const p of PEOPLE) expect(users.some(u => u.name === p.name && u.role === p.role), p.role).toBe(true);
    expect(users.some(u => u.name === 'Naya Staff' && u.role === 'TEAM_MEMBER')).toBe(true);
  });
});

// the public demo's ready-made EMPTY account per role ("Naya …", demo password) — every one signs in and sees its own first screen
describe('v116 · the empty “Naya …” demo account of every role', { timeout: 120_000 }, () => {
  const IDS = ['USR-NEW-SUPERADMIN', 'USR-NEW-ADMIN', 'USR-NEW-BROKER', 'USR-NEW-OWNER', 'USR-NEW-BUYER', 'USR-NEW-CONTRACTOR', 'USR-NEW-BUILDER', 'USR-NEW-LEGAL', 'USR-NEW-CONNECTOR', 'USR-NEW-TEAM'];
  it('all ten roles are there, verified, and sign in with the demo password', async () => {
    const list = cfg.demoAccounts as any[];
    expect(new Set(IDS.map(id => list.find(a => a.id === id)?.role)).size).toBe(10);
    for (const id of IDS) {
      const a = list.find(x => x.id === id); expect(a, id).toBeTruthy(); expect(a.verificationStatus).toBe('VERIFIED');
      const ck = await login(a.email, cfg.demoPassword);
      const me = await j(await call(ck, 'GET', '/api/auth/me')); expect(me.user.id).toBe(id); expect((me.permissions || []).length, id).toBeGreaterThan(0);
    }
  });
  it('they start empty: the new broker has no clients and no listings; his staff works for him', async () => {
    const brk = await login(cfg.demoAccounts.find((a: any) => a.id === 'USR-NEW-BROKER').email, cfg.demoPassword);
    expect((await j(await call(brk, 'GET', '/api/daily/clients'))).clients).toHaveLength(0);
    expect((await j(await call(brk, 'GET', '/api/listings/mine'))).listings).toHaveLength(0);
    const staff = await login(cfg.demoAccounts.find((a: any) => a.id === 'USR-NEW-TEAM').email, cfg.demoPassword);
    expect((await j(await call(staff, 'GET', '/api/auth/me'))).user.employerId).toBe('USR-NEW-BROKER');
    const ok = await call(brk, 'POST', '/api/daily/clients', { name: 'Pehla Client', phone: '9826179101', budgetMin: 0, budgetMax: 4_000_000, city: 'Raipur', areas: ['Pandri'], propertyType: 'Residential Flat', transactionType: 'Sale', tags: [], notes: '', consent: true });
    expect(ok.status, await ok.clone().text()).toBe(200);
  });
});
