/**
 * v185 (D15) — open sign-up: role → mobile OTP → name, city, PAN → live at once in the Basic tier (verified-but-not-KYC): own listings private,
 * deals / money / broadcasts / invites locked with a friendly ACCOUNT_NOT_VERIFIED. SIGNUP_MODE=invite restores the invitation-only sign-up.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { freePort } from './helpers/port';
import { effectivePermissions, BASIC_LOCKED } from '../server/permissions';

const root = path.resolve(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(root, f), 'utf8');
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const j = (r: Response) => r.json().catch(() => ({})) as Promise<any>;
const PASS = 'Naya#Account2026';

function rig(env: Record<string, string>) {
  let proc: ChildProcess; let dir = ''; let B = ''; let cfg: any;
  const call = (ck: string | undefined, m: string, u: string, b?: unknown) => fetch(B + u, { method: m, headers: { 'content-type': 'application/json', ...(ck ? { cookie: ck } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const login = async (who: string, password = PASS) => { const r = await call(undefined, 'POST', '/api/auth/login', { email: who, password }); expect(r.status, `${who} ${await r.clone().text()}`).toBe(200); return r.headers.get('set-cookie')!.split(';')[0]; };
  return {
    call, login, get cfg() { return cfg; },
    async start() {
      const port = await freePort(); B = `http://127.0.0.1:${port}`;
      dir = mkdtempSync(path.join(tmpdir(), 'genz-v185-')); mkdirSync(path.join(dir, 'data'));
      proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], { cwd: dir, stdio: 'ignore', env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', SMS_WEBHOOK_URL: '', FAST2SMS_API_KEY: '', PUSH_DRY_RUN: 'true', SAHAYAK: 'off', PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true', ...env } });
      for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
    },
    async stop() { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); },
  };
}

describe('v185 · open sign-up (default)', { timeout: 240_000 }, () => {
  const s = rig({ SIGNUP_IP_DAILY_CAP: '6' });
  let SA = ''; let A = ''; let B2 = ''; let C = ''; let AID = '';
  beforeAll(async () => { await s.start(); SA = await s.login(s.cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').email, s.cfg.demoPassword); }, 120_000);
  afterAll(() => s.stop());
  const otp = async (phone: string) => { const r = await s.call(undefined, 'POST', '/api/auth/signup-otp', { phone }); const b = await j(r); expect(r.status, JSON.stringify(b)).toBe(200); return b as { otpToken: string; devCode: string }; };
  const signup = async (phone: string, extra: object = {}, code?: { otpToken: string; devCode: string }) => {
    const o = code || await otp(phone);
    return s.call(undefined, 'POST', '/api/auth/signup', { role: 'BROKER', name: 'Naya Broker', phone, otpToken: o.otpToken, otpCode: o.devCode, password: PASS, consent: true, panConsent: true, city: 'Raipur', panNumber: 'ABCPN8500F', officePhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', officeLocation: { lat: 21.2514, lng: 81.6296, acc: 20 }, ...extra });
  };

  it('config says open; no invitation code is needed', async () => { expect(s.cfg.signupMode).toBe('open'); });

  it('role → phone → OTP → name, city, PAN = live in Basic; a wrong OTP and a missing / bad PAN stop', async () => {
    const o = await otp('9826185001');
    const bad = await signup('9826185001', {}, { otpToken: o.otpToken, devCode: o.devCode === '000000' ? '111111' : '000000' });
    expect(bad.status).toBe(400); expect((await j(bad)).code).toBe('OTP');
    const o2 = await otp('9826185001');
    const noPan = await signup('9826185001', { panNumber: '' }, o2); expect((await j(noPan)).code).toBe('PAN_REQUIRED');
    const badPan = await signup('9826185001', { panNumber: 'ABC123' }, o2); expect((await j(badPan)).code).toBe('PAN_INVALID');
    const ok = await signup('9826185001', {}, o2); const b = await j(ok);
    expect(ok.status, JSON.stringify(b)).toBe(200);
    expect(b.basic).toBe(true); expect(b.user.verificationStatus).toBe('VERIFIED'); expect(b.user.basicTier).toBe(true); expect(b.user.passwordHash).toBeUndefined();
    AID = b.user.id; A = ok.headers.get('set-cookie')!.split(';')[0];
    expect(b.permissions).toContain('property:create'); expect(b.permissions).not.toContain('agreement:propose'); expect(b.permissions).not.toContain('collab:propose');
    const me = (await j(await s.call(A, 'GET', '/api/auth/me'))).user; expect(me.basicTier).toBe(true);
  });

  it('duplicate phone: a clear message in both languages; a PAN is only a claim until KYC (generic answer, two Basic claims coexist, a KYC-held PAN refuses without saying so)', async () => {
    const d1 = await signup('9826185001', { panNumber: 'ABCPN8501F' }); const b1 = await j(d1);
    expect(d1.status).toBe(409); expect(b1.code).toBe('DUPLICATE_PHONE'); expect(b1.error).toMatch(/already has a GENZ account/); expect(b1.errorHi).toMatch(/पहले से/);
    // another Basic account claiming the same PAN is allowed (the first to reach KYC approval with a document wins)
    const c2 = await signup('9826185002'); expect(c2.status, await c2.clone().text()).toBe(200);
    // a PAN held by a non-Basic (KYC-route) account refuses with the generic answer
    const code = (await j(await s.call(SA, 'POST', '/api/invitations', { invitedEmail: 'pan.holder@test.genz.example', invitedPhone: '9826185020', targetRole: 'BROKER' }))).invitation.code;
    const reg = await s.call(undefined, 'POST', '/api/auth/register-invite', { code, name: 'Pan Holder', phone: '9826185020', email: 'pan.holder@test.genz.example', password: PASS, consent: true, city: 'Raipur', aadhaarNumber: '234567890130', idConsent: true, panNumber: 'ABCPH9020F' });
    expect(reg.status, await reg.clone().text()).toBe(200);
    const d2 = await signup('9826185003', { panNumber: 'ABCPH9020F' }); const b2 = await j(d2);
    expect(d2.status).toBe(409); expect(b2.code).toBe('CANNOT_REGISTER'); expect(JSON.stringify(b2)).not.toMatch(/already|registered|linked/i);
    const users = (await j(await s.call(SA, 'GET', '/api/auth/users'))).users as any[];
    expect(users.filter(u => String(u.phone).endsWith('9826185001')).length).toBe(1); expect(users.some(u => String(u.phone).endsWith('9826185003'))).toBe(false);
  });

  it('Basic tier: friendly 403 (ACCOUNT_NOT_VERIFIED, basic) for broadcast / invite others; own listings and clients still work', async () => {
    const bc = await s.call(A, 'POST', '/api/broadcast', { requirementId: 'REQ-X' }); const b = await j(bc);
    expect(bc.status).toBe(403); expect(b.code).toBe('ACCOUNT_NOT_VERIFIED'); expect(b.basic).toBe(true); expect(b.errorHi).toMatch(/KYC/); expect(b.error).toMatch(/Verify your KYC/);
    const nom = await s.call(A, 'POST', '/api/growth/nominations', { name: 'X', phone: '9826185999' }); expect(nom.status).toBe(403); expect((await j(nom)).basic).toBe(true);
    const own = await s.call(A, 'POST', '/api/properties', { title: 'Basic flat in Raipur test', description: 'A flat listed by a Basic account.', propertyType: 'Residential Flat', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: 'Shankar Nagar', pincode: '492007', addressHidden: 'Flat 4, Test Society, Raipur', askingPrice: 5500000, ownerApprovedNetPrice: 5200000, ownerName: 'Some Owner', ownerPhone: '9876500185', tags: [] });
    const ob = await j(own); expect([200, 201], JSON.stringify(ob)).toContain(own.status);
    expect(ob.property.verificationStatus).toBe('PENDING'); expect(ob.property.basicHold).toBe(true);
    const pid = ob.property.id;
    const brk = await s.login(s.cfg.demoAccounts.find((a: any) => a.id === 'USR-BRK-001').email, s.cfg.demoPassword);
    expect(((await j(await s.call(brk, 'GET', '/api/properties'))).properties as any[]).some(p => p.id === pid)).toBe(false);   // private to the lister
    expect(((await j(await s.call(A, 'GET', '/api/properties'))).properties as any[]).some(p => p.id === pid)).toBe(true);
    // not in other members' directory
    expect(((await j(await s.call(brk, 'GET', '/api/auth/users'))).users as any[]).some(u => u.id === AID)).toBe(false);
    // admin KYC approval lifts the limits and publishes the held listing
    // the platform setting asks a broker for a RERA number before approval: a Basic account's claim is only PENDING until an admin checks it
    const rr = await s.call(A, 'POST', '/api/network/my-rera', { reraNumber: 'CGRERA010224A0185' }); expect(rr.status, await rr.clone().text()).toBe(200); expect((await j(rr)).pending).toBe(true);
    const rc = await s.call(SA, 'POST', `/api/network/rera-claims/${AID}`, { approve: true }); expect(rc.status, await rc.clone().text()).toBe(200);
    // without KYC evidence the approval is refused (v186); with the Aadhaar last-4 on file and the ID seen it goes through
    expect((await j(await s.call(SA, 'POST', `/api/verifications/${AID}/review`, { action: 'APPROVE', notes: 'x' }))).code).toBe('KYC_EVIDENCE_MISSING');
    const idr = await s.call(A, 'POST', '/api/network/my-id', { panNumber: 'ABCPN8500F', aadhaarNumber: '234567890130', consent: true }); expect(idr.status, await idr.clone().text()).toBe(200);
    const seen = await s.call(SA, 'POST', `/api/network/id-check/${AID}`, { checked: true, note: 'PAN + Aadhaar card seen on video' }); expect(seen.status, await seen.clone().text()).toBe(200);
    const ap = await s.call(SA, 'POST', `/api/verifications/${AID}/review`, { action: 'APPROVE', notes: 'PAN + RERA seen', publishIds: [pid] }); expect(ap.status, await ap.clone().text()).toBe(200);
    const A2 = await s.login('9826185001'); const me = (await j(await s.call(A2, 'GET', '/api/auth/me'))).user;
    expect(me.basicTier).toBeFalsy(); expect(me.brokerId).toMatch(/^GZ-BRK-/);
    expect(((await j(await s.call(brk, 'GET', '/api/properties'))).properties as any[]).some(p => p.id === pid)).toBe(true);
  });

  it('a Basic account cannot file reports, so three of them can never suspend a real broker (sock-puppet guard)', async () => {
    const mk = async (phone: string, pan: string) => { const r = await signup(phone, { panNumber: pan }); expect(r.status, await r.clone().text()).toBe(200); return r.headers.get('set-cookie')!.split(';')[0]; };
    B2 = await mk('9826185013', 'ABCPN8503F'); C = await mk('9826185014', 'ABCPN8504F'); const D = await mk('9826185015', 'ABCPN8505F');
    const target = 'USR-BRK-002';
    for (const ck of [B2, C, D]) { const r = await s.call(ck, 'POST', '/api/daily/report', { targetType: 'BROKER', targetId: target, reason: 'FAKE', note: 'sock puppet test' }); expect(r.status, await r.clone().text()).toBe(403); expect((await j(r)).basic).toBe(true); }   // v186: a Basic account cannot report at all
    const t = ((await j(await s.call(SA, 'GET', '/api/auth/users'))).users as any[]).find(u => u.id === target);
    expect(t.verificationStatus).toBe('VERIFIED');
    // admin one-tap suspend of a new Basic account works and audits
    const su = await s.call(SA, 'POST', `/api/verifications/${(await j(await s.call(B2, 'GET', '/api/auth/me'))).user.id}/review`, { action: 'SUSPEND', notes: 'spam' }); expect(su.status).toBe(200);
  });

  it('per-IP cap: after 6 accounts from one device in a day the next is refused with a clear message', async () => {
    const ok = await signup('9826185006', { panNumber: 'ABCPN8506F' }); expect(ok.status, await ok.clone().text()).toBe(200);
    const r = await signup('9826185007', { panNumber: 'ABCPN8507F' }); const b = await j(r);
    expect(r.status).toBe(429); expect(b.code).toBe('SIGNUP_IP_CAP'); expect(b.errorHi).toMatch(/कल/);
  });

  it('a Basic broker cannot be given the locked permissions (unit)', () => {
    const base = { role: 'BROKER' as const, verificationStatus: 'VERIFIED' as const };
    const full = effectivePermissions(base); const basic = effectivePermissions({ ...base, basicTier: true });
    for (const p of BASIC_LOCKED) expect(basic).not.toContain(p);
    expect(basic).toContain('property:create'); expect(basic).toContain('requirement:create'); expect(basic).toContain('property:read');
    expect(full).toContain('agreement:propose');
  });
});

describe('v185 · SIGNUP_MODE=invite restores the invitation-only sign-up', { timeout: 120_000 }, () => {
  const s = rig({ SIGNUP_MODE: 'invite' });
  beforeAll(async () => { await s.start(); }, 120_000);
  afterAll(() => s.stop());
  it('open routes are closed; the invitation routes behave as before', async () => {
    expect(s.cfg.signupMode).toBe('invite');
    const o = await s.call(undefined, 'POST', '/api/auth/signup-otp', { phone: '9826185010' }); expect(o.status).toBe(403); expect((await j(o)).code).toBe('SIGNUP_INVITE_ONLY');
    const r = await s.call(undefined, 'POST', '/api/auth/signup', { role: 'BROKER' }); expect(r.status).toBe(403); expect((await j(r)).errorHi).toMatch(/आमंत्रण/);
    expect((await s.call(undefined, 'POST', '/api/auth/register-otp', { code: 'NOPE-NOPE', phone: '9826185010' })).status).toBe(404);
    expect((await s.call(undefined, 'POST', '/api/auth/register-invite', { code: 'NOPE-NOPE', name: 'X Y', phone: '9826185010', email: 'x@y.example', password: PASS, consent: true })).status).toBe(400);
  });
});

describe('v185 · screens', () => {
  it('JoinView: role chooser, no invitation code / captcha in open mode, short DPDP summary + full-notice expander, 44px', () => {
    const f = read('src/components/JoinView.tsx');
    for (const t of ['join-roles', "isOpen && !inv", 'api.openSignup', 'api.signupOtp', 'join-have-code', 'join-full-notice', 'Read full notice', 'पूरी सूचना पढ़ें', 'join-role-', 'min-h-11']) expect(f).toContain(t);
    expect(f).not.toMatch(/12\s*\+\s*6/);
  });
  it('locked actions open a friendly sheet; first steps carry the KYC step; admin queue has Basic + one-tap suspend', () => {
    expect(read('src/lib/api.ts')).toContain("window.dispatchEvent(new CustomEvent('genz:kyc-locked'))");
    const k = read('src/components/KycLockedSheet.tsx'); for (const t of ['kyc-locked-sheet', 'Verify your KYC to unlock this', 'KYC वेरिफ़ाई करें', 'min-h-11']) expect(k).toContain(t);
    expect(read('src/App.tsx')).toContain('<KycLockedSheet />');
    const fr = read('src/components/FirstRunStrip.tsx'); expect(fr).toContain('Verify your KYC to unlock deals'); expect(fr).toContain('डील खोलने के लिए KYC वेरिफ़ाई करें');
    const o = read('src/components/OnboardingView.tsx'); for (const t of ['basic-filter', 'basic-suspend', 'basic-approve']) expect(o).toContain(t);
  });
  it('server guards: audit events, report sock-puppet guard, directory hides Basic, invite path untouched', () => {
    const s = read('server/openSignup.ts'); for (const t of ["'OPEN_SIGNUP'", "'BASIC_AUTO_LIVE'", 'SIGNUP_IP_CAP', 'DUPLICATE_PHONE', 'CANNOT_REGISTER', 'SIGNUP_PAN_REFUSED']) expect(s).toContain(t);
    expect(read('server/daily.ts')).toContain('isVerifiedFull(r)'); expect(read('server.ts')).toContain('!u.basicTier && visibleRoles');
    expect(read('server/features.ts')).toContain("SIGNUP_MODE");
    expect(read('server.ts')).toContain("app.post('/api/auth/register-invite'");
  });
});
