import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { verifyFirebaseToken, OTP_ACT_RE, otpUrl } from '../server/phoneOtp';

/** v133 — Firebase phone OTP: the Google token is checked properly, and the page can only post a code back to the three flows' own /verify routes. */
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KEYS = { k1: publicKey.export({ type: 'spki', format: 'pem' }) as string };
const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const NOW = 1_800_000_000_000; const sec = NOW / 1000;
const token = (over: object = {}, head: object = {}, key = privateKey) => {
  const h = b({ alg: 'RS256', kid: 'k1', typ: 'JWT', ...head }); const p = b({ aud: 'genz-test', iss: 'https://securetoken.google.com/genz-test', sub: 'u1', iat: sec - 10, exp: sec + 3600, auth_time: sec - 10, phone_number: '+919123456789', ...over });
  return `${h}.${p}.${createSign('RSA-SHA256').update(`${h}.${p}`).sign(key).toString('base64url')}`;
};
const ok = (t: string) => verifyFirebaseToken(t, 'genz-test', KEYS, NOW);

describe('the Google token', () => {
  it('a good token gives the 10-digit mobile', async () => { expect(await ok(token())).toBe('9123456789'); });
  it('another project, a forged signature, an unknown key, “none” as the algorithm → refused', async () => {
    await expect(ok(token({ aud: 'someone-else' }))).rejects.toThrow(); await expect(ok(token({ iss: 'https://securetoken.google.com/someone-else' }))).rejects.toThrow();
    await expect(ok(token({}, {}, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey))).rejects.toThrow(/signature/);
    await expect(ok(token({}, { kid: 'k9' }))).rejects.toThrow(/unknown key/); await expect(ok(token({}, { alg: 'none' }))).rejects.toThrow(/alg/);
    const [h, p] = token().split('.'); await expect(ok(`${h}.${b({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), phone_number: '+919999999999' })}.${token().split('.')[2]}`)).rejects.toThrow(/signature/);
  });
  it('expired, signed in long ago, no phone or a foreign number → refused', async () => {
    await expect(ok(token({ exp: sec - 1 }))).rejects.toThrow(/expired/); await expect(ok(token({ auth_time: sec - 3600 }))).rejects.toThrow(/stale/);
    await expect(ok(token({ phone_number: undefined }))).rejects.toThrow(/phone/); await expect(ok(token({ phone_number: '+14155550100' }))).rejects.toThrow(/phone/);
  });
});
describe('where the page may post the code', () => {
  it('only the three flows’ own /verify routes', () => {
    for (const a of ['/q/SQR-ABC123/resume/verify', '/sp/abcDEF123456_-x/verify', '/r/abcDEF123456_-x/verify']) expect(OTP_ACT_RE.test(a), a).toBe(true);
    for (const a of ['https://evil.example/r/abcDEF123456/verify', '//evil.example/verify', '/api/auth/login', '/r/abcDEF123456/verify/../x', '/r/abcDEF123456/otp', '/sp/x/verify?next=1', '']) expect(OTP_ACT_RE.test(a), a).toBe(false);
    expect(otpUrl('+91 91234 56789', '/r/abcDEF123456/verify')).toBe('/otp?phone=9123456789&act=%2Fr%2FabcDEF123456%2Fverify');
  });
  it('wiring: off unless configured; the three flows hand over to /otp; a text without a code is not “sent”', () => {
    const root = path.resolve(import.meta.dirname, '..'); const read = (p: string) => readFileSync(path.join(root, p), 'utf8');
    expect(read('server/phoneOtp.ts')).toContain("if (!firebaseOn() || !/^[6-9]\\d{9}$/.test(phone) || !OTP_ACT_RE.test(act)) return res.status(404)");
    expect(read('server/shopPartners.ts').split('otpUrl(phone,').length - 1).toBe(2); expect(read('server/clientroom.ts')).toContain('otpUrl(phone, `/r/${req.params.token}/verify`)');
    expect(read('server/notify.ts')).toContain('if (firebaseOn()) { if (!stashOtp(to, message))');
  });
});
