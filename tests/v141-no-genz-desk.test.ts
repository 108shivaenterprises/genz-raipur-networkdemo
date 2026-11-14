/**
 * v141 — India scale, no GENZ desk: sign-up with mobile OTP + a valid unused PAN is live at once; a broker's own RERA gives Tier 1 at once;
 * three different verified members reporting a member suspends him (photo and self-added RERA go with it).
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
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id).email;
let SA = ''; const BRK: string[] = [];
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v141-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], { cwd: dir, stdio: 'ignore', env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', SMS_WEBHOOK_URL: '', FAST2SMS_API_KEY: '', PUSH_DRY_RUN: 'true', SAHAYAK: 'off', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' } });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  SA = await login(cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').email, cfg.demoPassword);
  for (const id of ['USR-BRK-001', 'USR-BRK-002', 'USR-BRK-003']) BRK.push(await login(acct(id), cfg.demoPassword));
}, 120_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const PASS = 'Naya#Account2026';
const invite = async (role: string, email: string, phone: string) => (await j(await call(SA, 'POST', '/api/invitations', { invitedEmail: email, invitedPhone: phone, targetRole: role }))).invitation.code;
const body = (code: string, name: string, phone: string, email: string, extra: object) => ({ code, name, phone, email, password: PASS, consent: true, city: 'Raipur', aadhaarNumber: '234567890130', idConsent: true, ...extra });

describe('v141 · no GENZ desk', { timeout: 180_000 }, () => {
  let NEW_ID = '';
  it('sign-up: mobile OTP + valid unused PAN = live at once; a wrong code stops; no code = waits for GENZ as before', async () => {
    const c1 = await invite('BROKER', 'otp.broker@test.genz.example', '9826170141');
    const o = await j(await call(undefined, 'POST', '/api/auth/register-otp', { code: c1, phone: '9826170141' }));
    expect(o.devCode).toMatch(/^\d{6}$/); expect(o.otpToken).toBeTruthy();
    expect((await call(undefined, 'POST', '/api/auth/register-otp', { code: 'NOPE-NOPE', phone: '9826170141' })).status).toBe(404);
    const wrong = await call(undefined, 'POST', '/api/auth/register-invite', body(c1, 'Otp Broker', '9826170141', 'otp.broker@test.genz.example', { panNumber: 'ABCPO1410F', otpToken: o.otpToken, otpCode: o.devCode === '000000' ? '111111' : '000000' }));
    expect(wrong.status).toBe(400); expect((await j(wrong)).code).toBe('OTP');
    const o2 = await j(await call(undefined, 'POST', '/api/auth/register-otp', { code: c1, phone: '9826170141' }));
    const ok = await call(undefined, 'POST', '/api/auth/register-invite', body(c1, 'Otp Broker', '9826170141', 'otp.broker@test.genz.example', { panNumber: 'ABCPO1410F', otpToken: o2.otpToken, otpCode: o2.devCode }));
    expect(ok.status, await ok.clone().text()).toBe(200);
    const r = await j(ok); expect(r.autoVerified).toBe(true); expect(r.user.verificationStatus).toBe('VERIFIED'); NEW_ID = r.user.id;
    // without the code the old path stays: waits for GENZ
    const c2 = await invite('BROKER', 'nootp.broker@test.genz.example', '9826170142');
    const n = await j(await call(undefined, 'POST', '/api/auth/register-invite', body(c2, 'No Otp', '9826170142', 'nootp.broker@test.genz.example', { panNumber: 'ABCPO1420F' })));
    expect(n.autoVerified).toBe(false); expect(n.user.verificationStatus).toBe('PENDING');
  });
  it('a broker adds his RERA: Tier 1 at once, no staff check; a number already taken is refused', async () => {
    const me = await login('otp.broker@test.genz.example', PASS);
    const r = await call(me, 'POST', '/api/network/my-rera', { reraNumber: 'CGRERA010224A0141' });
    const b = await j(r); expect(r.status, JSON.stringify(b)).toBe(200); expect(b.tier).toBe('TIER1'); expect(b.claim.status).toBe('APPROVED');
    expect((await call(BRK[1], 'POST', '/api/network/my-rera', { reraNumber: 'CGRERA010224A0141' })).status).toBe(409);
  });
  it('three different verified members report a member → suspended at once, his self-added RERA goes', async () => {
    for (let i = 0; i < 3; i++) { const r = await call(BRK[i], 'POST', '/api/daily/report', { targetType: 'BROKER', targetId: NEW_ID, reason: 'FAKE', note: 'not a real broker' }); expect(r.status, await r.clone().text()).toBe(200); }
    const me = await login('otp.broker@test.genz.example', PASS);   // he can still sign in, but his work is locked (like PENDING)
    const u = (await j(await call(me, 'GET', '/api/auth/me'))).user;
    expect(u.verificationStatus).toBe('SUSPENDED'); expect(u.reraNumber || '').toBe('');
  });
});
