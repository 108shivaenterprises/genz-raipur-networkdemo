/** v180 — QA round 3 (security): ReDoS guards on the paste parser. */
import { describe, it, expect } from 'vitest';
import { parseOne, parseNeed, findArea, findBudget, findPrice, parsePaste, splitMessages, stripContacts } from '../src/shared/waParse';
import { readNeedChange } from '../src/shared/sahayak';

const N = 20_000;
const inputs: Record<string, string> = {
  digits: '1'.repeat(N), 'digits!': '1'.repeat(N - 1) + '!', newlines: '\n'.repeat(N), plus: '+'.repeat(N),
  spaces: ' '.repeat(N), tabs: '\t'.repeat(N), owner: 'owner '.repeat(N / 6), 'ph ph': 'ph ph '.repeat(N / 6),
  'digit-nl': '1\n'.repeat(N / 2), 'digit-sp': '1 '.repeat(N / 2), 'digit-comma': '1,'.repeat(N / 2),
};
const fns: Record<string, (s: string) => unknown> = { parseOne, parseNeed, findArea, findBudget, findPrice, parsePaste, splitMessages, stripContacts, readNeedChange: s => readNeedChange(s.slice(0, N)) };

describe('F2 paste parser is linear on hostile input (< 150 ms per 20k chars)', () => {
  for (const [fn, f] of Object.entries(fns)) for (const [name, s] of Object.entries(inputs)) {
    it(`${fn} on ${name}`, () => { const t = performance.now(); f(s); expect(performance.now() - t).toBeLessThan(150); });
  }
  it('splitMessages never returns more than PASTE_MAX_ITEMS', () => {
    expect(splitMessages('2bhk flat for sale 45 lakh Raipur\n\n'.repeat(500)).length).toBeLessThanOrEqual(30);
  });
});

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { maskPan } from '../server/kyc';

const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

describe('F4 maskPan', () => {
  it('never echoes a short value, trims, keeps first 2 / last 2 of a real PAN', () => {
    expect(maskPan('ABC')).toBe('•••••'); expect(maskPan(' ABCDE1234F ')).toBe('AB•••••4F'); expect(maskPan('')).toBe(''); expect(maskPan(undefined)).toBeUndefined();
  });
  it('audit lines use maskPan, not the last 4 characters', () => {
    expect(read('server.ts')).not.toMatch(/PAN …\$\{panNumber\.slice\(-4\)\}/); expect(read('server/ownerlist.ts')).not.toMatch(/PAN …\$\{pan\.slice\(-4\)\}/);
  });
});

const SCRIPT = `(async () => {
const { issueOtp } = await import(${JSON.stringify(path.join(root, 'server/otpManual.ts'))});
const T = 1_800_000_000_000, M = 61_000; const out: Record<string, any> = {};
const run = (phone: string, ip: string, n: number, t0: number) => { const codes: string[] = []; for (let i = 0; i < n; i++) { const r: any = issueOtp(phone, 'reset', t0 + i * M, ip); codes.push(r.ok ? 'ok' : r.code); } return codes; };
out.a = run('9855555555', '1.1.1.1', 4, T);                       // ok ok ok PHONE_DAY
out.bAfterA = (issueOtp('9855555555', 'reset', T + 10 * M, '2.2.2.2') as any).ok;   // a different device is not blocked
out.ceiling = run('9866666666', '9.9.9.9', 3, T).concat(run('9866666666', '8.8.8.8', 3, T + 10 * M), run('9866666666', '7.7.7.7', 3, T + 20 * M), run('9866666666', '6.6.6.6', 3, T + 30 * M));   // 9 ok, then the 10th ok, 11th capped
process.stdout.write('@@' + JSON.stringify(out) + '@@'); process.exit(0);
})();`;
describe('F3 OTP cap is per (number, device) + a looser per-number ceiling', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'genz-v180-')); mkdirSync(path.join(dir, 'data'));
  const r = spawnSync(path.join(root, 'node_modules/.bin/tsx'), ['--eval', SCRIPT], { cwd: dir, encoding: 'utf8', env: { ...process.env, OTP_DAILY_CAP: '50', NODE_ENV: 'development', KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', DEMO_MODE: 'false' }, timeout: 90_000 });
  rmSync(dir, { recursive: true, force: true });
  const m = /@@(.*)@@/s.exec(r.stdout || ''); const U = m ? JSON.parse(m[1]) : {};
  it('IP A using its 3 does not block IP B for the same number', () => { expect(m, (r.stdout || '') + (r.stderr || '')).toBeTruthy(); expect(U.a).toEqual(['ok', 'ok', 'ok', 'PHONE_DAY']); expect(U.bAfterA).toBe(true); });
  it('the global per-number ceiling (10/day from any device) still answers PHONE_DAY', () => { expect(U.ceiling.slice(0, 10).every((x: string) => x === 'ok')).toBe(true); expect(U.ceiling[10]).toBe('PHONE_DAY'); });
});

describe('F5 consent withdrawal', () => {
  it('pushTo checks consentWithdrawnAt before recordInbox; privacy ids are randomised and the audit says what was stopped', () => {
    const w = read('server/webpush.ts'); expect(w.indexOf('consentWithdrawnAt')).toBeLessThan(w.indexOf('recordInbox(userId, msg)'));
    const p = read('server/privacy.ts'); expect(p).toContain("crypto.randomBytes(3)"); expect(p).toContain('stopped: marketing pushes');
  });
});
describe('F1 invite lookup', () => {
  it('prefill is masked and flags hasPan; register falls back to the stored PAN', () => {
    const s = read('server.ts'); expect(s).toContain("panNumber: maskPan(a.panNumber) || '', hasPan: !!a.panNumber"); expect(s).toContain('panNumber === normPan(maskPan(storedPan))');
  });
});
