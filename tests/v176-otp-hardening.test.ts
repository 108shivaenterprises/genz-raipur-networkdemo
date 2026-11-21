/** v176 — OTP hardening: staff reset blocked, staff codes hidden, per-purpose caps, per-IP distinct phones, expiry wipe, no devCode for reset, boot refusal in production with DEMO_MODE. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tsx = path.join(root, 'node_modules/.bin/tsx');
const imp = (f: string) => JSON.stringify(path.join(root, f));

const SCRIPT = `(async () => {
const O = await import(${imp('server/otpManual.ts')});
const { db } = await import(${imp('server/db.ts')});
const express = (await import(${imp('node_modules/express/index.js')})).default;
const T = 1_800_000_000_000; const out: Record<string, any> = {}; const st: any = db.getState();
// per-purpose budgets (OTP_CAP_RESET=2): the 3rd live reset code is refused, signup still works, a USED code frees a place
const r1: any = O.issueOtp('9811000001', 'reset', T), r2: any = O.issueOtp('9811000002', 'reset', T);
const r3: any = O.issueOtp('9811000003', 'reset', T); out.resetCap = r3.code + '|' + r3.status + '|' + /[\\u0900-\\u097F]/.test(r3.errorHi);
out.signupStill = (O.issueOtp('9811000004', 'signup', T) as any).ok;
O.useOtp(r1.ref); out.afterUsed = (O.issueOtp('9811000003', 'reset', T + 1000) as any).ok;
// per-IP: 10 distinct phones, the 11th is refused, the same phone again is fine
let ipOk = 0; for (let i = 0; i < 10; i++) if (!O.ipPhoneGate('1.2.3.4', '98220000' + String(10 + i), T)) ipOk++;
out.ipOk = ipOk; const g: any = O.ipPhoneGate('1.2.3.4', '9822000099', T); out.ip11 = g && g.code + '|' + g.status + '|' + /[\\u0900-\\u097F]/.test(g.errorHi);
out.ipSame = O.ipPhoneGate('1.2.3.4', '9822000010', T); out.ipOther = O.ipPhoneGate('5.6.7.8', '9822000099', T);
// expiry wipe: a code that expired keeps no sealed copy
const now = Date.now(); const e: any = O.issueOtp('9833000001', 'owner', now - 11 * 60_000); O.issueOtp('9833000002', 'owner', now);
out.wiped = st.manualOtp[e.ref].enc === '';
// 3 codes per phone per day; a locked one (wrong guesses) does not count
let n = 0; for (let i = 0; i < 5; i++) if ((O.issueOtp('9844000001', 'owner', now + 100 * 61_000 * (i + 1)) as any).ok) n++; out.perPhone = n;
// staff: an ADMIN account's number (cap raised again so the earlier codes do not get in the way)
process.env.OTP_CAP_RESET = '50';
st.users.push({ id: 'USR-ST1', name: 'Staff', email: 's@x.in', phone: '+91 98770 00001', role: 'ADMIN', verificationStatus: 'VERIFIED', passwordHash: 'keep-me', sessionVersion: 1 });
st.users.push({ id: 'USR-BR1', name: 'Brk', email: 'b@x.in', phone: '+91 98770 00002', role: 'BROKER', verificationStatus: 'VERIFIED', passwordHash: 'old-hash', sessionVersion: 1 });
out.isStaff = [O.isStaffPhone('9877000001'), O.isStaffPhone('9877000002')];
const app = express(); app.use(express.json()); app.use('/f', O.createForgotRouter());
const srv = app.listen(0); const port = (srv.address() as any).port; const B = 'http://127.0.0.1:' + port;
const post = async (u: string, b: any) => { const r = await fetch(B + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json() }; };
const rq = await post('/f/request', { phone: '9877000001' }); out.staffReqKeys = Object.keys(rq.j).sort().join(',');
out.noDevCode = rq.j.devCode === undefined;
const rq2 = await post('/f/request', { phone: '9877000002' }); out.brokerReqKeys = Object.keys(rq2.j).sort().join(',');
// a code we know for the staff number (the one the request made is sealed)
const known: any = O.issueOtp('9877000001', 'reset', Date.now() + 70_000);
out.staffIssue = known.ok ? 'ok' : known.code;
if (known.ok) { const done = await post('/f/reset', { phone: '9877000001', ref: known.ref, code: known.code, password: 'Fresh#Pass2026x' }); out.staffReset = done.s + '|' + JSON.stringify(done.j) + '|' + (st.users.find((u: any) => u.id === 'USR-ST1').passwordHash === 'keep-me'); }
const kb: any = O.issueOtp('9877000002', 'reset', Date.now() + 140_000);
if (kb.ok) { const done = await post('/f/reset', { phone: '9877000002', ref: kb.ref, code: kb.code, password: 'Fresh#Pass2026x' }); out.brokerReset = done.s + '|' + (st.users.find((u: any) => u.id === 'USR-BR1').passwordHash !== 'old-hash'); }
out.audit = JSON.stringify(st.auditEvents || st.auditLog || []).includes('STAFF_RESET_BLOCKED');
srv.close();
process.stdout.write('@@' + JSON.stringify(out) + '@@'); process.exit(0);
})();
`;
let U: Record<string, any> = {};
beforeAll(() => {
  const dir = mkdtempSync(path.join(tmpdir(), 'genz-v176-')); mkdirSync(path.join(dir, 'data'));
  const r = spawnSync(tsx, ['--eval', SCRIPT], { cwd: dir, encoding: 'utf8', env: { ...process.env, OTP_MODE: 'manual', OTP_CAP_RESET: '2', OTP_DAILY_CAP: '50', NODE_ENV: 'development', DEMO_MODE: 'false', KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '' }, timeout: 120_000 });
  const m = /@@(.*)@@/s.exec(r.stdout || ''); expect(m, (r.stdout || '') + (r.stderr || '')).toBeTruthy(); U = JSON.parse(m![1]);
  rmSync(dir, { recursive: true, force: true });
}, 150_000);

describe('v176 OTP hardening (module + router)', () => {
  it('a budget per purpose: the 3rd live reset code gets the bilingual 503; signup is unaffected; a used code frees a place', () => {
    expect(U.resetCap).toBe('DAILY_CAP|503|true'); expect(U.signupStill).toBe(true); expect(U.afterUsed).toBe(true);
  });
  it('per IP: 10 distinct phones a day, the 11th is refused (bilingual); the same phone again and another IP are fine', () => {
    expect(U.ipOk).toBe(10); expect(U.ip11).toBe('IP_PHONES|429|true'); expect(U.ipSame).toBeNull(); expect(U.ipOther).toBeNull();
  });
  it('an expired code loses its sealed copy', () => { expect(U.wiped).toBe(true); });
  it('3 codes per phone per day', () => { expect(U.perPhone).toBe(3); });
  it('staff numbers (ADMIN / otp:relay) are recognised; a broker is not', () => { expect(U.isStaff).toEqual([true, false]); });
  it('forgot/request answers a staff and a broker number with the same shape and never a devCode', () => { expect(U.staffReqKeys).toBe(U.brokerReqKeys); expect(U.noDevCode).toBe(true); });
  it('a staff reset with a right code answers "success" but changes nothing (audited); a broker reset works', () => {
    expect(U.staffReset).toBe('200|{"success":true}|true'); expect(U.brokerReset).toBe('200|true'); expect(U.audit).toBe(true);
  });
});

describe('wiring', () => {
  const read = (p: string) => readFileSync(path.join(root, p), 'utf8');
  it('the admin list hides staff / own numbers, shows the full number + send link, and is empty outside manual mode', () => {
    const s = read('server/otpManual.ts');
    expect(s).toContain('rec.phone === mine || isStaffPhone(rec.phone)'); expect(s).toContain('manual ? Object.values(book())'); expect(s).toContain('sendLink: relayLink(rec.phone, code)'); expect(s).toContain('OTP_CODE_SENT_TO_NUMBER'); expect(s).toContain('OTP_PHONE_LOCKED');
    expect(s).toContain("purpose !== 'reset'");
    expect(read('src/components/OtpCodesView.tsx')).toContain('otp-send');
  });
  it('production + DEMO_MODE: the server refuses to start (clear error); register-otp, owner otp and forgot all use the per-IP gate', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genz-v176b-')); mkdirSync(path.join(dir, 'data'));
    const r = spawnSync(tsx, [path.join(root, 'server.ts')], { cwd: dir, encoding: 'utf8', timeout: 90_000, env: { ...process.env, NODE_ENV: 'production', DEMO_MODE: 'true', PUBLIC_DEMO: '', AUTH_SECRET: 'x'.repeat(40), PORT: '0', HOST: '127.0.0.1' } });
    rmSync(dir, { recursive: true, force: true });
    expect(r.status).toBe(1); expect((r.stderr || '') + (r.stdout || '')).toContain('DEMO_MODE must be false in production');
    expect(read('server.ts')).toContain('sendSignupOtp(String(req.body?.phone'); expect(read('server/ownerlist.ts').match(/ipPhoneGate\(/g)?.length).toBe(2);   // sign-up + owner (forgot uses it in otpManual)
  }, 100_000);
});
