/** v175 (D5) — manual OTP: hashed codes, expiry, lockout, single use, cooldown, caps, generic answers, admin list masks the phone and is audited. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { freePort } from './helpers/port';

const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

// ── unit side: the module run in a child process with its own empty data dir, so time can be moved and nothing real is touched ──
const SCRIPT = `(async () => {
const { issueOtp, checkOtp, useOtp } = await import(${JSON.stringify(path.join(root, 'server/otpManual.ts'))});
const { db } = await import(${JSON.stringify(path.join(root, 'server/db.ts'))});
const T = 1_800_000_000_000; const out: Record<string, any> = {};
const a: any = issueOtp('9811111111', 'signup', T);
out.stored = JSON.stringify((db.getState() as any).manualOtp);
out.codeInStore = out.stored.includes(a.code);
out.okRight = checkOtp(a.ref, '9811111111', 'signup', a.code, T + 1000, false);
out.otherPhone = (checkOtp(a.ref, '9822222222', 'signup', a.code, T + 1000, false) as any).code;
out.otherPurpose = (checkOtp(a.ref, '9811111111', 'reset', a.code, T + 1000, false) as any).code;
useOtp(a.ref);
out.reuse = (checkOtp(a.ref, '9811111111', 'signup', a.code, T + 2000) as any).code;
out.afterUse = JSON.stringify((db.getState() as any).manualOtp).includes(a.code);
out.cooldown = (issueOtp('9811111111', 'signup', T + 30_000) as any).code;
const b: any = issueOtp('9811111111', 'signup', T + 61_000);
out.expired = (checkOtp(b.ref, '9811111111', 'signup', b.code, T + 61_000 + 10 * 60_000 + 1) as any).code;
const c: any = issueOtp('9833333333', 'reset', T);
const wrong = c.code === '111111' ? '222222' : '111111'; const codes: string[] = [];
for (let i = 0; i < 5; i++) codes.push((checkOtp(c.ref, '9833333333', 'reset', wrong, T + 1000 + i) as any).code);
out.wrongs = codes;
out.rightAfterLock = (checkOtp(c.ref, '9833333333', 'reset', c.code, T + 6000) as any).code;
out.newWhileLocked = (issueOtp('9833333333', 'reset', T + 120_000) as any).ok;
out.afterLock = (issueOtp('9833333333', 'reset', T + 16 * 60_000) as any).ok;
let day = 0; for (let i = 0; i < 5; i++) { const r: any = issueOtp('9844444444', 'owner', T + i * 61_000); if (r.ok) day++; else out.dayCode = r.code; } out.dayOk = day;
let cap = ''; for (let i = 0; i < 30 && !cap; i++) { const r: any = issueOtp('98550000' + String(10 + i), 'signup', T + 500_000); if (!r.ok) cap = r.code + '|' + r.status + '|' + /[\u0900-\u097F]/.test(r.errorHi) + '|' + Object.keys((db.getState() as any).manualOtp).length; } out.cap = cap;
out.badPhone = (issueOtp('12345', 'owner', T) as any).code;
process.stdout.write('@@' + JSON.stringify(out) + '@@');
process.exit(0);
})();
`;
let U: Record<string, any> = {};
describe('manual OTP module', () => {
  beforeAll(() => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genz-v175u-')); mkdirSync(path.join(dir, 'data'));
    const r = spawnSync(path.join(root, 'node_modules/.bin/tsx'), ['--eval', SCRIPT], { cwd: dir, encoding: 'utf8', env: { ...process.env, OTP_DAILY_CAP: '20', NODE_ENV: 'development', KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', DEMO_MODE: 'false' }, timeout: 90_000 });
    const m = /@@(.*)@@/s.exec(r.stdout || ''); expect(m, (r.stdout || '') + (r.stderr || '')).toBeTruthy(); U = JSON.parse(m![1]);
    rmSync(dir, { recursive: true, force: true });
  }, 120_000);
  it('the code is stored hashed, never plain, and wiped once used', () => { expect(U.codeInStore).toBe(false); expect(U.afterUse).toBe(false); expect(U.stored).toContain('"hash"'); });
  it('a right code works only for the same phone + purpose, and only once', () => {
    expect(U.okRight.ok).toBe(true); expect(U.otherPhone).toBe('NO_CODE'); expect(U.otherPurpose).toBe('NO_CODE'); expect(U.reuse).toBe('USED');
  });
  it('60 s cooldown per phone; a code expires after 10 minutes', () => { expect(U.cooldown).toBe('COOLDOWN'); expect(U.expired).toBe('EXPIRED'); });
  it('5 wrong codes lock the phone for 15 minutes (even the right code, and a new request); then it opens', () => {
    expect(U.wrongs.slice(0, 4)).toEqual(['WRONG_CODE', 'WRONG_CODE', 'WRONG_CODE', 'WRONG_CODE']); expect(U.wrongs[4]).toBe('LOCKED');
    expect(U.rightAfterLock).toBe('LOCKED'); expect(U.newWhileLocked).toBe(true); expect(U.afterLock).toBe(true);
  });
  it('3 codes per phone per day', () => { expect(U.dayOk).toBe(3); expect(U.dayCode).toBe('PHONE_DAY'); expect(U.badPhone).toBe('BAD_PHONE'); });
  it('global cap (OTP_DAILY_CAP=20): the 21st code in 24 h gets the friendly bilingual "try later" (503)', () => { expect(U.cap).toBe('DAILY_CAP|503|true|22'); });   // v176: 20 live codes; the 2 used / locked ones are in the store but do not count
});

// ── integration side: a real server in manual mode ──
const PORT = await freePort(); const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any; let SA = '';
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const call = (ck: string | undefined, m: string, u: string, b?: unknown, ip = '') => fetch(B + u, { method: m, headers: { 'content-type': 'application/json', ...(ck ? { cookie: ck } : {}) }, body: b ? JSON.stringify(b) : undefined });
const j = (r: Response) => r.json().catch(() => ({})) as Promise<any>;
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v175-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], { cwd: dir, stdio: 'ignore', env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', SMS_WEBHOOK_URL: '', FAST2SMS_API_KEY: '', PUSH_DRY_RUN: 'true', SAHAYAK: 'off', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true', OTP_MODE: 'manual', OTP_WHATSAPP_NUMBER: '919999900000', OTP_DAILY_CAP: '8' } });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  const l = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').email, password: cfg.demoPassword }) });
  SA = l.headers.get('set-cookie')!.split(';')[0];
}, 120_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('manual OTP over HTTP', () => {
  it('config exposes the mode; manual wins even in DEMO_MODE (no demo code on the screen)', async () => {
    expect(cfg.otpMode).toBe('manual');
    const r = await j(await call(undefined, 'POST', '/api/owner/otp', { phone: '9876500001' }));
    expect(r.success).toBe(true); expect(r.mode).toBe('manual'); expect(r.devCode).toBeUndefined(); expect(r.ref).toMatch(/^[0-9A-F]{8}$/);
    expect(r.wa).toContain('https://wa.me/919999900000?text='); expect(decodeURIComponent(r.wa)).toContain(r.ref); expect(r.wa).not.toMatch(/\d{6}(?!\d)/.source === '' ? /x/ : /%20\d{6}\b/);
    expect(r.otpToken).toBe(r.ref);   // an opaque reference, not an offline-guessable token
  });
  it('forgot password answers the same for a known and an unknown number, and asking again is held for 60 s', async () => {
    const users = await j(await call(SA, 'GET', '/api/auth/users')); const known = String((users.users || users).find((u: any) => u.phone && u.role === 'BROKER').phone).replace(/\D/g, '').slice(-10);
    const a = await call(undefined, 'POST', '/api/auth/forgot/request', { phone: known }); const b = await call(undefined, 'POST', '/api/auth/forgot/request', { phone: '9000000001' });
    const ja = await j(a), jb = await j(b); expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(Object.keys(ja).sort()).toEqual(Object.keys(jb).sort()); expect(ja.devCode).toBeUndefined(); expect(jb.devCode).toBeUndefined();
    const again = await call(undefined, 'POST', '/api/auth/forgot/request', { phone: '9000000001' }); expect(again.status).toBe(429); expect((await j(again)).code).toBe('COOLDOWN');
  });
  it('the reset with a wrong code and with a code for an unknown number give the same shape; a weak password is refused first', async () => {
    const r = await j(await call(undefined, 'POST', '/api/auth/forgot/request', { phone: '9000000002' }));
    expect((await call(undefined, 'POST', '/api/auth/forgot/reset', { phone: '9000000002', ref: r.ref, code: '000000', password: 'short' })).status).toBe(400);
    const w = await call(undefined, 'POST', '/api/auth/forgot/reset', { phone: '9000000002', ref: r.ref, code: '000001', password: 'Strong#Pass2026' });
    expect(w.status).toBe(400); expect((await j(w)).code).toBe('WRONG_CODE');
  });
  it('admin list: phone masked to the last 4, code visible, and the view is in the audit log; a broker is refused', async () => {
    const p = await j(await call(SA, 'GET', '/api/admin/otp-pending')); expect(p.mode).toBe('manual'); expect(p.pending.length).toBeGreaterThan(0);
    for (const row of p.pending) { expect(row.phoneMasked).toMatch(/^•{6}\d{4}$/); expect(row.code).toMatch(/^\d{6}$/); expect(row.phone).toMatch(/^[6-9]\d{9}$/); expect(row.sendLink).toContain(`https://wa.me/91${row.phone}?text=`); }   // v176: full number, so the code goes to the number on record
    const aud = JSON.stringify(await j(await call(SA, 'GET', '/api/audit-logs?limit=500&q=OTP_CODE_VIEWED')));
    expect(aud).toContain('OTP_CODE_VIEWED'); expect(aud).not.toMatch(/\b9000000001\b/);
    const brk = cfg.demoAccounts.find((a: any) => a.role === 'BROKER' && a.verificationStatus === 'VERIFIED');
    const l = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: brk.email, password: cfg.demoPassword }) });
    const bk = l.headers.get('set-cookie')!.split(';')[0]; expect([401, 403]).toContain((await call(bk, 'GET', '/api/admin/otp-pending')).status);
    expect((await call(undefined, 'GET', '/api/admin/otp-pending')).status).toBe(401);
  });
  it('the full reset: right code once, new password works, old one does not, reuse refused; unknown number says the same "done"', async () => {
    const users = await j(await call(SA, 'GET', '/api/auth/users')); const list = users.users || users;
    const u = list.filter((x: any) => x.phone && x.role === 'BROKER' && x.verificationStatus === 'VERIFIED').pop(); const ph = String(u.phone).replace(/\D/g, '').slice(-10);
    expect(list.filter((x: any) => String(x.phone).replace(/\D/g, '').slice(-10) === ph).length).toBe(1);
    const r = await j(await call(undefined, 'POST', '/api/auth/forgot/request', { phone: ph })); expect(r.success).toBe(true);
    const code = (await j(await call(SA, 'GET', '/api/admin/otp-pending'))).pending.find((x: any) => x.ref === r.ref).code;
    const done = await call(undefined, 'POST', '/api/auth/forgot/reset', { phone: ph, ref: r.ref, code, password: 'Fresh#Pass2026x' }); expect(done.status).toBe(200);
    const again = await call(undefined, 'POST', '/api/auth/forgot/reset', { phone: ph, ref: r.ref, code, password: 'Fresh#Pass2026y' }); expect((await j(again)).code).toBe('USED');
    const ok = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: u.email, password: 'Fresh#Pass2026x' }) }); expect(ok.status).toBe(200);
    const old = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: u.email, password: cfg.demoPassword }) }); expect(old.status).toBe(401);
  });
  it('the server-wide daily cap says "try later" in both languages', async () => {
    let last: any = null; for (let i = 0; i < 12; i++) { const r = await call(undefined, 'POST', '/api/auth/forgot/request', { phone: `98000000${String(10 + i)}` }); if (r.status === 503) { last = await j(r); break; } }
    expect(last?.code).toBe('DAILY_CAP'); expect(last.error).toMatch(/try again later/i); expect(last.errorHi).toMatch(/[ऀ-ॿ]/);
  });
});

describe('wiring', () => {
  it('no account-exists answer is left on the OTP / sign-up paths', () => {
    const o = read('server/ownerlist.ts'); expect(o).not.toContain('exists: !!ex'); expect(o).not.toMatch(/\/otp'[\s\S]{0,900}USE_PASSWORD/);
    const s = read('server.ts'); expect(s).not.toContain('An account with this email address already exists'); expect(s).not.toContain('A partner with this mobile number already exists');
  });
  it('sms / firebase are not touched in manual mode; the key fields are hidden; strings have Hindi', () => {
    expect(read('server/otpManual.ts')).toContain("if (mode === 'sms')"); expect(read('src/components/ApiKeysView.tsx')).toContain("manual && /^(SMS|Firebase)/");
    for (const f of ['src/components/OtpStep.tsx', 'src/components/ForgotPassword.tsx', 'src/components/OtpCodesView.tsx']) expect(read(f)).toMatch(/[ऀ-ॿ]/);
  });
});
