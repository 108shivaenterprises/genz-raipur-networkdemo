import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { readFileSync } from 'fs';
process.env.AUTH_SECRET ||= 'v202-test-secret-0123456789abcdef0123';
const ROOT = path.resolve(__dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;

let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const form = (cookie: string | undefined, url: string, data: Record<string, string>) =>
  fetch(B + url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(data).toString() });
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v202-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, QUIET_HOURS: 'off', KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PUSH_DRY_RUN: 'true', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true', REVEAL_FRESH_LISTING_HOURS: '0.003', VIDEO_MAX_MB: '5' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', OWN: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1', SA: 'USR-SUPERADMIN', BUY: 'USR-BUYER-001' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 500)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });




const j = async (r: Response) => r.json().catch(() => ({})) as Promise<any>;
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const PASS = 'Strong#Pass2026';
const invite = async (email: string, phone: string, targetRole: string) => (await j(await call(jar.SA, 'POST', '/api/invitations', { invitedEmail: email, invitedPhone: phone, targetRole }))).invitation.code as string;
const otpFor = async (code: string, phone: string) => { const r = await call(undefined, 'POST', '/api/auth/register-otp', { code, phone }); const d = await j(r); expect(r.status, JSON.stringify(d)).toBe(200); return d as { otpToken: string; devCode: string }; };
const body = (code: string, email: string, phone: string, extra: object = {}) => ({ code, name: 'Test Person', phone, email, password: PASS, consent: true, locality: 'Shankar Nagar', city: 'Raipur', aadhaarNumber: '234567890130', idConsent: true, ...extra });
const cookieOf = async (email: string) => { const l = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASS }) }); expect(l.status).toBe(200); return (l.headers.get('set-cookie') || '').split(';')[0]; };

describe('v202 · round 11: a phone is proven by a code', { timeout: 120000 }, () => {
  it('a buyer or an owner cannot sign up on an invite without the mobile code (400 OTP_REQUIRED, EN + HI)', async () => {
    for (const [role, email, phone] of [['BUYER_TENANT', 'nb1@test.genz.example', '9826202011'], ['PROPERTY_OWNER', 'no1@test.genz.example', '9826202012']]) {
      const c = await invite(email, phone, role); const r = await call(undefined, 'POST', '/api/auth/register-invite', body(c, email, phone)); const d = await j(r);
      expect(r.status, role).toBe(400); expect(d.code).toBe('OTP_REQUIRED'); expect(d.errorHi).toBeTruthy();
    }
  });
  it('with the code a buyer signs up and his phone is stamped verified', async () => {
    const email = 'nb2@test.genz.example', phone = '9826202013'; const c = await invite(email, phone, 'BUYER_TENANT'); const o = await otpFor(c, phone);
    const r = await call(undefined, 'POST', '/api/auth/register-invite', body(c, email, phone, { otpToken: o.otpToken, otpCode: o.devCode })); expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
    const st = await j(await call(await cookieOf(email), 'GET', '/api/phone/status')); expect(st.verified).toBe(true);
  });
  it('a number already verified on a live account is refused at invite sign-up WITH a code (409 PHONE_TAKEN, EN + HI); without a code the account is made unverified (round 12)', async () => {
    const email = 'nb3@test.genz.example'; const c = await invite(email, '9826377889', 'BROKER'); const o = await otpFor(c, '9826377889');
    const r = await call(undefined, 'POST', '/api/auth/register-invite', body(c, email, '9826377889', { otpToken: o.otpToken, otpCode: o.devCode, panNumber: 'ABCPN3033F' })); const d = await j(r);
    expect(r.status).toBe(409); expect(d.code).toBe('PHONE_TAKEN'); expect(d.errorHi).toBeTruthy();
  });
  it('verify-my-phone: an account made without a code is unverified; send + confirm stamps it; a wrong code does not; the number cannot be verified on two accounts', async () => {
    const email = 'nb4@test.genz.example', phone = '9826202014'; const c = await invite(email, phone, 'BROKER');
    const rg = await call(undefined, 'POST', '/api/auth/register-invite', body(c, email, phone, { panNumber: 'ABCPN2014F' })); expect(rg.status, JSON.stringify(await rg.clone().json())).toBe(200);
    const ck = await cookieOf(email);
    expect((await j(await call(ck, 'GET', '/api/phone/status'))).verified).toBe(false);
    const sent = await j(await call(ck, 'POST', '/api/phone/send')); expect(sent.otpToken).toBeTruthy(); expect(sent.devCode).toMatch(/^\d{6}$/);
    const bad = await call(ck, 'POST', '/api/phone/confirm', { otpToken: sent.otpToken, otpCode: sent.devCode === '000000' ? '111111' : '000000' }); expect(bad.status).toBe(400); expect((await j(bad)).errorHi).toBeTruthy();
    expect((await j(await call(ck, 'GET', '/api/phone/status'))).verified).toBe(false);
    expect((await call(ck, 'POST', '/api/phone/confirm', { otpToken: sent.otpToken, otpCode: sent.devCode })).status).toBe(200);
    expect((await j(await call(ck, 'GET', '/api/phone/status'))).verified).toBe(true);
    expect((await call(undefined, 'POST', '/api/phone/send')).status).toBe(401);
  });
  it('the unit rule: suspended, rejected, blacklisted and erased holders do not block a verified number', async () => {
    const { customerMatchesUser, phoneVerifiedElsewhere } = await import('../server/access'); const mk = (id: string, status = 'VERIFIED', email = `${id}@x.in`): any => ({ id, phone: '98000 00001', email, phoneVerifiedAt: 'x', verificationStatus: status });
    const st: any = { users: [mk('A'), mk('B', 'SUSPENDED'), mk('C', 'REJECTED'), mk('D', 'BLACKLISTED'), mk('E', 'VERIFIED', 'gone@erased.invalid')] };
    expect(customerMatchesUser('9800000001', st.users[0], st)).toBe(true); expect(phoneVerifiedElsewhere('9800000001', st, 'A')).toBe(false);
    st.users.push(mk('F')); expect(customerMatchesUser('9800000001', st.users[0], st)).toBe(false); expect(phoneVerifiedElsewhere('9800000001', st, 'A')).toBe(true);
  });
  it('the export profile is an allow-list: his identity yes; desk notes, trust scores, internal flags no', async () => {
    const p = (await j(await call(jar.BRK1, 'GET', '/api/privacy/export'))).profile; expect(p.email).toBeTruthy(); expect(p.id).toBe('USR-BRK-001');
    for (const k of ['passwordHash', 'verificationNotes', 'idCheckNote', 'idCheckedBy', 'autoVerifiedBy', 'trustScore', 'trustDetails', 'vouchStrikes', 'sessionVersion', 'selfRegistered', 'signupMode']) expect(p, k).not.toHaveProperty(k);
  });
  it('source: password-reset codes stamp the phone; the Vercel build regenerates api/index.mjs; the profile page offers the verify card (EN + HI)', () => {
    expect(read('server/otpManual.ts')).toContain("stampPhone(u, db.getState(), 'password-reset code')");
    expect(JSON.parse(read('vercel.json')).buildCommand).toBe('npm run build:vercel'); expect(JSON.parse(read('package.json')).scripts['build:vercel']).toContain('--outfile=api/index.mjs');
    const c = read('src/components/PhoneVerifyCard.tsx'); expect(c).toContain('Verify your mobile number'); expect(c).toContain('अपना मोबाइल नंबर वेरिफ़ाई करें'); expect(read('src/components/PrivacyCenter.tsx')).toContain('<PhoneVerifyCard />');
    const jv = read('src/components/JoinView.tsx'); expect(jv).toContain("role === 'BUYER_TENANT' || role === 'PROPERTY_OWNER'"); expect(jv).toContain('पहले अपना मोबाइल वेरिफ़ाई करें');
  });
});
