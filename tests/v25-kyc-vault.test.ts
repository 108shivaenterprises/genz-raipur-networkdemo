import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { verhoeffCheckDigit } from '../src/shared/idRules';
import { parseIdText, foundAnything, mergeFound } from '../src/shared/idOcrParse';
import { addressProblem, pinProblem, normAddress, maskedFull } from '../src/shared/kycRules';
import { roleHas, ALL_ROLES } from '../server/permissions';
import { seal, unseal, resetVaultKeyCache, vaultKey } from '../server/vaultCrypto';

/**
 * v25 — the KYC vault (full Aadhaar + address, encrypted, superadmin-only, audited, shown to the member) and
 * reading PAN / Aadhaar photos on the phone (OCR → suggestions only).
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const aadhaarFrom = (body11: string) => body11 + verhoeffCheckDigit(body11);
const GOOD_AADHAAR = aadhaarFrom('48213567901');         // 4821 3567 9014-style, check digit valid
const spaced = (n: string) => n.replace(/(\d{4})(?=\d)/g, '$1 ');

// ───────────────────────── reading the text an OCR engine produced ─────────────────────────
describe('OCR text → suggestions (pure)', () => {
  const PAN_CARD = `INCOME TAX DEPARTMENT        GOVT. OF INDIA
Permanent Account Number Card
QRSPD3001K
Name
KRISHNA TRIPATHI
Father's Name
RAMESH TRIPATHI
Date of Birth 01/01/1990
Signature`;
  const AADHAAR_FRONT = `Government of India
Krishna Tripathi
DOB: 01/01/1990
MALE
${spaced(GOOD_AADHAAR)}
VID : 9123 4567 8901 2345
Aadhaar - Aam Aadmi ka Adhikar`;
  const AADHAAR_BACK = `Unique Identification Authority of India
Address:
S/O: Ramesh Tripathi, House No 42,
Shanti Nagar, Pandri,
Raipur, Chhattisgarh - 492004
${spaced(GOOD_AADHAAR)}
Help: help@uidai.gov.in   www.uidai.gov.in   1947`;

  it('a PAN card gives the PAN and nothing invented', () => {
    const f = parseIdText(PAN_CARD);
    expect(f.kind).toBe('PAN'); expect(f.pan).toBe('QRSPD3001K'); expect(f.aadhaar).toBeUndefined(); expect(f.address).toBeUndefined();
  });
  it('an Aadhaar front gives the number (check digit passes) and never mistakes the 16-digit VID for it', () => {
    const f = parseIdText(AADHAAR_FRONT);
    expect(f.kind).toBe('AADHAAR'); expect(f.aadhaar).toBe(GOOD_AADHAAR); expect(f.pan).toBeUndefined();
    const vidOnly = parseIdText('Government of India\nVID : 9123 4567 8901 2345');
    expect(vidOnly.aadhaar).toBeUndefined(); expect(vidOnly.aadhaarGuess).toBeUndefined();
  });
  it('an Aadhaar back gives the address up to the PIN, the PIN, and none of the footer', () => {
    const f = parseIdText(AADHAAR_BACK);
    expect(f.pincode).toBe('492004'); expect(f.address).toContain('House No 42'); expect(f.address).toContain('Raipur'); expect(f.address!.endsWith('492004')).toBe(true);
    expect(f.address!.toLowerCase()).not.toMatch(/uidai|help@|1947|unique identification/);
    expect(f.aadhaar).toBe(GOOD_AADHAAR);
    expect(addressProblem(f.address)).toBeNull(); expect(pinProblem(f.pincode)).toBeNull();
  });
  it('look-alike characters (S for 5, O for 0) are fixed — but only when the check digit then passes', () => {
    const noisy = spaced(GOOD_AADHAAR).replace(/5/g, 'S').replace(/0/g, 'O');
    expect(noisy).not.toBe(spaced(GOOD_AADHAAR));
    expect(parseIdText(`Aadhaar\n${noisy}`).aadhaar).toBe(GOOD_AADHAAR);
    // a digit that is simply wrong is NOT auto-accepted: it comes back as a guess to be checked by the member
    const wrong = GOOD_AADHAAR.slice(0, 11) + String((Number(GOOD_AADHAAR[11]) + 1) % 10);
    const f = parseIdText(`Aadhaar\n${spaced(wrong)}`);
    expect(f.aadhaar).toBeUndefined(); expect(f.aadhaarGuess).toBe(wrong);
  });
  it('a masked Aadhaar gives only the last 4; a PAN-looking window made of Aadhaar digits is not taken for a PAN', () => {
    const m = parseIdText('Aadhaar\nXXXX XXXX 9014\nAddress: 12 Main Road, Raipur 492001');
    expect(m.aadhaar).toBeUndefined(); expect(m.aadhaarLast4).toBe('9014');
    for (let i = 0; i < 40; i++) { const b = String(2 + Math.floor(Math.random() * 7)) + String(Math.floor(Math.random() * 1e10)).padStart(10, '0'); expect(parseIdText(`Aadhaar\n${spaced(aadhaarFrom(b))}`).pan, b).toBeUndefined(); }
  });
  it('a PAN with confusable characters (0 for O, 1 for I) is corrected by position; a card with no PAN gives none', () => {
    expect(parseIdText('Permanent Account Number\nQRSPD3OO1K').pan).toBe('QRSPD3001K');
    expect(parseIdText('Permanent Account Number\nQRSPD 3001 K').pan).toBe('QRSPD3001K');
    expect(parseIdText('Permanent Account Number\nQRSXD3001K').pan).toBeUndefined();   // 4th letter X is not a holder type
  });
  it('empty or junk text finds nothing and does not crash', () => {
    for (const t of ['', '   ', '\n\n', 'hello world 12', '%%%%####', undefined as any, null as any]) expect(foundAnything(parseIdText(t))).toBe(false);
  });
});

describe('OCR: two readings merged, no false PAN', () => {
  it('a PIN inside an address on an Aadhaar back never becomes a PAN', () => {
    const f = parseIdText('Address: S/O Ram Kumar, Shankar Nagar, Raipur, Chhattisgarh - 492004\nVID 9123 4567 8901 2345');
    expect(f.pan).toBeUndefined();
    expect(parseIdText('Chhattisgarh 492004').pan).toBeUndefined();
  });
  it('mergeFound: first reading wins, second fills the gaps', () => {
    const a = mergeFound({ kind: 'UNKNOWN', address: 'A' } as any, { kind: 'PAN', pan: 'ABCPD7001K', address: 'B' } as any);
    expect(a.pan).toBe('ABCPD7001K');
    expect(a.address).toBe('A');
    expect(foundAnything(mergeFound({ kind: 'UNKNOWN' } as any, { kind: 'UNKNOWN' } as any))).toBe(false);
  });
});

describe('address + PIN rules', () => {
  it('address: optional, 12–300 characters, tidied; PIN: 6 digits, never 0 first', () => {
    expect(addressProblem('')).toBeNull(); expect(addressProblem('Raipur')!.code).toBe('ADDRESS_SHORT'); expect(addressProblem('x'.repeat(301))!.code).toBe('ADDRESS_LONG');
    expect(addressProblem('House 42, Shanti Nagar, Raipur')).toBeNull();
    expect(normAddress('  House 42 \n Shanti   Nagar,\n\nRaipur ')).toBe('House 42, Shanti Nagar, Raipur');
    expect(pinProblem('')).toBeNull(); expect(pinProblem('4920')!.code).toBe('PIN_LENGTH'); expect(pinProblem('0492001')!.code).toBe('PIN_LENGTH'); expect(pinProblem('049200')!.code).toBe('PIN_FIRST'); expect(pinProblem('49200a')!.code).toBe('PIN_DIGITS'); expect(pinProblem('492001')).toBeNull();
    expect(maskedFull(GOOD_AADHAAR)).toBe(`XXXX XXXX ${GOOD_AADHAAR.slice(-4)}`); expect(maskedFull('123')).toBe('');
  });
});

// ───────────────────────── the encryption ─────────────────────────
describe('vault encryption (AES-256-GCM)', () => {
  it('round-trips, uses a fresh IV every time, and the stored text never contains the plain value', () => {
    process.env.KYC_VAULT_KEY = crypto.randomBytes(32).toString('hex'); resetVaultKeyCache();
    const a = seal(GOOD_AADHAAR, 'KYC-U1|aadhaar'); const b = seal(GOOD_AADHAAR, 'KYC-U1|aadhaar');
    expect(a).not.toBe(b); expect(a.startsWith('k1.')).toBe(true); expect(a).not.toContain(GOOD_AADHAAR);
    expect(unseal(a, 'KYC-U1|aadhaar')).toBe(GOOD_AADHAAR); expect(unseal(b, 'KYC-U1|aadhaar')).toBe(GOOD_AADHAAR);
  });
  it('a value cannot be moved to another member / field, and a changed byte is detected', () => {
    process.env.KYC_VAULT_KEY = crypto.randomBytes(32).toString('hex'); resetVaultKeyCache();
    const a = seal('some address 12345', 'KYC-U1|address');
    expect(() => unseal(a, 'KYC-U2|address')).toThrow('VAULT_BAD_DATA');
    expect(() => unseal(a, 'KYC-U1|aadhaar')).toThrow('VAULT_BAD_DATA');
    const parts = a.split('.'); const ct = Buffer.from(parts[4], 'base64url'); ct[0] ^= 1; parts[4] = ct.toString('base64url');
    expect(() => unseal(parts.join('.'), 'KYC-U1|address')).toThrow('VAULT_BAD_DATA');
    expect(() => unseal('garbage', 'x')).toThrow('VAULT_BAD_DATA');
  });
  it('a different key is named as such (“wrong key”), not shown as corrupt data', () => {
    process.env.KYC_VAULT_KEY = crypto.randomBytes(32).toString('hex'); resetVaultKeyCache();
    const a = seal('x', 'a');
    process.env.KYC_VAULT_KEY = crypto.randomBytes(32).toString('hex'); resetVaultKeyCache();
    expect(() => unseal(a, 'a')).toThrow('VAULT_WRONG_KEY');
  });
  it('a malformed key means NO key (the vault stays off) — never a weak fallback; base64 and hex keys both work', () => {
    process.env.KYC_VAULT_KEY = 'too-short'; resetVaultKeyCache();
    expect(vaultKey()).toBeNull(); expect(() => seal('x', 'a')).toThrow('VAULT_NO_KEY');
    const raw = crypto.randomBytes(32);
    process.env.KYC_VAULT_KEY = raw.toString('base64'); resetVaultKeyCache(); expect(vaultKey()?.mode).toBe('env');
    process.env.KYC_VAULT_KEY = raw.toString('hex'); resetVaultKeyCache(); expect(vaultKey()?.mode).toBe('env');
    delete process.env.KYC_VAULT_KEY; resetVaultKeyCache();
  });
  it('without an env key a key file is created once (owner-only) and reused', () => {
    const d = mkdtempSync(path.join(tmpdir(), 'genz-v25-key-')); const f = path.join(d, 'sub', 'k.key');
    process.env.KYC_VAULT_KEY_FILE = f; delete process.env.KYC_VAULT_KEY; resetVaultKeyCache();
    const k1 = vaultKey(); expect(k1?.mode).toBe('file'); expect(existsSync(f)).toBe(true);
    expect(statSync(f).mode & 0o077).toBe(0);                      // no access for group / others
    resetVaultKeyCache(); expect(vaultKey()?.id).toBe(k1?.id);     // same key after a "restart"
    delete process.env.KYC_VAULT_KEY_FILE; resetVaultKeyCache(); rmSync(d, { recursive: true, force: true });
  });
});

describe('who may open the vault (the permission)', () => {
  it('kyc:reveal belongs to the SUPERADMIN only', () => {
    for (const r of ALL_ROLES) expect(roleHas(r, 'kyc:reveal' as any), r).toBe(r === 'SUPERADMIN');
  });
});

describe('static guarantees', () => {
  it('the privacy policy no longer claims “we do not collect Aadhaar numbers”', () => {
    const t = readFileSync(path.join(ROOT, 'src/components/LegalPages.tsx'), 'utf8');
    expect(t).not.toMatch(/We do not collect Aadhaar/i); expect(t).not.toContain('हम आधार नंबर नहीं माँगते'); expect(t).toMatch(/Aadhaar number and address are stored encrypted/);
  });
  it('the production security policy lets the OCR engine run (wasm, same-origin worker) and photo previews show (blob:)', () => {
    const t = readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
    const csp = /Content-Security-Policy',\s*\n\s*"([^"]+)"/.exec(t)![1];
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'"); expect(csp).not.toContain("'unsafe-eval'"); expect(csp).toContain("worker-src 'self'"); expect(csp).toMatch(/img-src [^;]*blob:/);
    expect(csp).toContain("connect-src 'self'");                                  // still no outside sites
  });
  it('the OCR files are served from this site, match the installed library version, and the service worker leaves them alone', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const lib = JSON.parse(readFileSync(path.join(ROOT, 'node_modules/tesseract.js/package.json'), 'utf8'));
    expect(pkg.dependencies['tesseract.js']).toBeTruthy(); expect(lib.version).toBe('7.0.0');
    for (const f of ['worker.min.js', 'tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'lang/eng.traineddata.gz', 'README.txt']) expect(existsSync(path.join(ROOT, 'public/ocr', f)), f).toBe(true);
    expect(readFileSync(path.join(ROOT, 'public/ocr/worker.min.js')).equals(readFileSync(path.join(ROOT, 'node_modules/tesseract.js/dist/worker.min.js')))).toBe(true);
    expect(readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8')).toContain("startsWith('/ocr/')");
    const ocr = readFileSync(path.join(ROOT, 'src/lib/ocr.ts'), 'utf8');
    expect(ocr).not.toMatch(/cdn\.jsdelivr|unpkg|https?:\/\//);                  // no public CDN, no outside address
    expect(ocr).toContain('workerBlobURL: false');
  });
});

// ───────────────────────── the server ─────────────────────────
const PORT = 4900 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const PW = 'Strong#Pass2026';
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function loginWith(email: string, password: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  expect(r.status, email).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const login = (id: string) => loginWith(acct(id).email, cfg.demoPassword);
const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
let panSeq = 5000; let ipSeq = 10;
const mkPan = () => `QRSPD${++panSeq}K`;
const mkAadhaar = () => { const body = '4' + String(Math.floor(Math.random() * 1e10)).padStart(10, '0'); return body + verhoeffCheckDigit(body); };
const nextIp = () => `10.25.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;
const ADDRESS = 'House No 42, Shanti Nagar, Pandri, Raipur, Chhattisgarh';
const PIN = '492004';

interface Joined { id: string; email: string; pan: string; aad: string; cookie: string; vaultStored: boolean; status: number; body: any }
/** invite + register a broker; `extra` is merged into the register body */
async function join(name: string, extra: Record<string, unknown> = {}): Promise<Joined> {
  const phone = rnd(); const email = `${name.toLowerCase().replace(/\W+/g, '.')}.${Date.now()}.${Math.floor(Math.random() * 1e4)}@example.in`;
  const inv = await j(await call(jar.SUP, 'POST', '/api/invitations', { invitedEmail: email, invitedPhone: phone, targetRole: 'BROKER' }));
  const pan = mkPan(); const aad = mkAadhaar();
  const r = await fetch(B + '/api/auth/register-invite', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp() }, body: JSON.stringify({ code: inv.invitation.code, name, email, phone, password: PW, consent: true, city: 'Raipur', reraNumber: `PCGRERA25${String(++panSeq).slice(-4)}-0001`, panNumber: pan, aadhaarNumber: aad, idConsent: true, ...extra }) });
  const body = await r.json();
  return { id: body.user?.id, email, pan, aad, cookie: r.headers.get('set-cookie')?.split(';')[0] || '', vaultStored: !!body.vaultStored, status: r.status, body };
}
const fullBody = { kycConsent: true, address: ADDRESS, pincode: PIN, kycSource: 'PHOTO' };
const reveal = (cookie: string, userId: string, o: Record<string, unknown> = {}) => call(cookie, 'POST', `/api/kyc-vault/reveal/${userId}`, { purpose: 'LEGAL_CASE', reason: 'Notice for unpaid commission of deal DEAL-2026-014 — advocate needs the address', password: cfg.demoPassword, ...o });

let M: Joined;      // a member who agreed: full Aadhaar + address in the vault
let N: Joined;      // a member who did not tick the KYC agreement

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v25-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true', TRUST_PROXY: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  const sup = cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN')?.id || 'USR-SUPERADMIN';
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', OWN: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1', SUP: sup })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('sign-up: the vault is filled only with the member’s tick', () => {
  it('with the tick: vaultStored, a key file appears owner-only, and the member sees the masked Aadhaar and his own address', async () => {
    M = await join('Vault Member', fullBody);
    expect(M.status, JSON.stringify(M.body)).toBe(200); expect(M.vaultStored).toBe(true);
    const keyFile = path.join(dir, 'data', '.kyc-vault.key');
    expect(existsSync(keyFile)).toBe(true); expect(statSync(keyFile).mode & 0o077).toBe(0);
    const mine = await j(await call(M.cookie, 'GET', '/api/kyc-vault/mine'));
    expect(mine).toMatchObject({ success: true, on: true, hasAadhaar: true, hasAddress: true, address: ADDRESS, pincode: PIN, aadhaar: `XXXX XXXX ${M.aad.slice(-4)}` });
    expect(mine.opened).toEqual([]);
    expect(JSON.stringify(mine)).not.toContain(M.aad);                              // not even to the owner: only the masked number
  });
  it('without the tick: only the last 4 digits are kept, nothing is vaulted — even if an address was typed', async () => {
    N = await join('No Tick Member', { address: ADDRESS, pincode: PIN });
    expect(N.status).toBe(200); expect(N.vaultStored).toBe(false);
    const mine = await j(await call(N.cookie, 'GET', '/api/kyc-vault/mine'));
    expect(mine).toMatchObject({ hasAadhaar: false, hasAddress: false, address: '' });
    const me = await j(await call(N.cookie, 'GET', '/api/auth/me'));
    expect(me.user.aadhaarLast4).toBe(N.aad.slice(-4)); expect(JSON.stringify(me)).not.toContain(N.aad);
  });
  it('a bad address or PIN is refused with the reason, and no account is created', async () => {
    const a = await join('Bad Address', { kycConsent: true, address: 'Raipur' });
    expect(a.status).toBe(400); expect(a.body.code).toBe('ADDRESS_SHORT'); expect(a.body.error).toMatch(/address/i);
    const p = await join('Bad Pin', { kycConsent: true, address: ADDRESS, pincode: '49200' });
    expect(p.status).toBe(400); expect(p.body.code).toBe('PIN_LENGTH');
  });
  it('an address alone (no PIN) is fine', async () => {
    const x = await join('Address Only', { kycConsent: true, address: ADDRESS });
    expect(x.status).toBe(200); expect(x.vaultStored).toBe(true);
  });
});

describe('nobody but the superadmin can open it', () => {
  it('admin, other brokers, owners and visitors are refused (status, switch and reveal)', async () => {
    for (const who of ['ADMIN', 'BRK1', 'BRK2', 'OWN']) {
      expect((await reveal(jar[who], M.id)).status, `${who} reveal`).toBe(403);
      expect((await call(jar[who], 'GET', '/api/kyc-vault/status')).status, `${who} status`).toBe(403);
      expect((await call(jar[who], 'PUT', '/api/kyc-vault/settings', { on: false })).status, `${who} switch`).toBe(403);
      expect((await call(jar[who], 'GET', '/api/kyc-vault/reveals')).status, `${who} list`).toBe(403);
    }
    expect((await reveal('', M.id)).status).toBe(401);
  });
  it('the member himself cannot read his own full Aadhaar back through the reveal door either', async () => {
    expect((await reveal(M.cookie, M.id)).status).toBe(403);
  });
  it('a broker cannot read another broker’s vault view', async () => {
    const mine = await j(await call(jar.BRK1, 'GET', '/api/kyc-vault/mine'));
    expect(mine.address || '').toBe(''); expect(mine.hasAadhaar).toBe(false);
  });
});

describe('opening it: reason, password, record, and the member is told', () => {
  it('needs a purpose and a real reason', async () => {
    expect((await reveal(jar.SUP, M.id, { reason: 'too short' })).status).toBe(400);
    expect((await reveal(jar.SUP, M.id, { purpose: 'FUN' })).status).toBe(400);
    expect((await reveal(jar.SUP, M.id, { password: undefined })).status).toBe(400);
  });
  it('a wrong password is refused and the attempt is on the audit trail', async () => {
    const r = await reveal(jar.SUP, M.id, { password: 'not-the-password' });
    expect(r.status).toBe(403); expect((await j(r)).code).toBe('BAD_PASSWORD');
    const logs = (await j(await call(jar.SUP, 'GET', '/api/audit-logs?limit=500&q=KYC_REVEAL_DENIED'))).events || (await j(await call(jar.SUP, 'GET', '/api/audit-logs?limit=500'))).events;
    expect(JSON.stringify(logs)).toContain('KYC_REVEAL_DENIED');
  });
  it('the right password returns PAN, full Aadhaar and address, not cacheable; nothing is returned for a member with an empty vault', async () => {
    const r = await reveal(jar.SUP, M.id, { ref: 'DEAL-2026-014' });
    expect(r.status).toBe(200); expect(r.headers.get('cache-control')).toMatch(/no-store/);
    const b = await j(r);
    expect(b).toMatchObject({ success: true, pan: M.pan, aadhaar: M.aad, address: ADDRESS, pincode: PIN, hideAfterSeconds: 90 });
    expect(b.member.name).toBe('Vault Member');
    expect((await reveal(jar.SUP, N.id)).status).toBe(404);
  });
  it('the audit trail names who, why and the MASKED Aadhaar — never the number or the address', async () => {
    const all = JSON.stringify(await j(await call(jar.SUP, 'GET', '/api/audit-logs?limit=500')));
    expect(all).toContain('KYC_REVEALED'); expect(all).toContain('Notice for unpaid commission');
    expect(all).toContain(`XXXX XXXX ${M.aad.slice(-4)}`); expect(all).toContain('DEAL-2026-014');
    expect(all).not.toContain(M.aad); expect(all).not.toContain('Shanti Nagar');
  });
  it('the member sees who opened his KYC, when and why', async () => {
    const mine = await j(await call(M.cookie, 'GET', '/api/kyc-vault/mine'));
    expect(mine.opened).toHaveLength(1);
    expect(mine.opened[0]).toMatchObject({ purpose: 'LEGAL_CASE' }); expect(mine.opened[0].reason).toContain('unpaid commission'); expect(mine.opened[0].by).toBeTruthy();
    const list = await j(await call(jar.SUP, 'GET', '/api/kyc-vault/reveals'));
    expect(list.reveals[0]).toMatchObject({ member: 'Vault Member', purpose: 'LEGAL_CASE', ref: 'DEAL-2026-014' });
  });
});

describe('it does not leak anywhere else', () => {
  it('the ID-review desk shows only “is it in the vault”, and only the superadmin is offered the reveal button', async () => {
    const q = await j(await call(jar.ADMIN, 'GET', '/api/id-review/queue?filter=all'));
    const t = q.tasks.find((x: any) => x.user.id === M.id); expect(t).toBeTruthy();
    const adminView = await j(await call(jar.ADMIN, 'GET', `/api/id-review/tasks/${t.id}`));
    expect(adminView.detail.vault).toMatchObject({ on: true, hasAadhaar: true, hasAddress: true, canReveal: false });
    const supView = await j(await call(jar.SUP, 'GET', `/api/id-review/tasks/${t.id}`));
    expect(supView.detail.vault.canReveal).toBe(true);
    for (const v of [adminView, supView, q]) { const s = JSON.stringify(v); expect(s).not.toContain(M.aad); expect(s).not.toContain('Shanti Nagar'); }
  });
  it('profile, network, directory, user list and the data export carry no Aadhaar number and no address', async () => {
    const urls: [string, string][] = [[M.cookie, '/api/auth/me'], [M.cookie, '/api/network/me'], [M.cookie, '/api/network/my-id'], [jar.ADMIN, '/api/users'], [jar.SUP, '/api/users'], [jar.BRK1, '/api/partners'], [M.cookie, '/api/privacy/export']];
    for (const [c, u] of urls) {
      const r = await call(c, 'GET', u); expect([200, 403, 404], u).toContain(r.status); // a pending member or an unknown path is refused — nothing to leak either way
      const s = await r.text(); expect(s, u).not.toContain(M.aad); expect(s, u).not.toContain('Shanti Nagar');
    }
    const exp = await j(await call(M.cookie, 'GET', '/api/privacy/export'));
    expect(exp.kycVault).toMatchObject({ hasAadhaar: true, hasAddress: true }); expect(exp.kycVault.openedBy).toHaveLength(1);
  });
  it('the registration answer itself does not echo the number', async () => {
    expect(JSON.stringify(M.body)).not.toContain(M.aad);
  });
});

describe('“My PAN & Aadhaar” (older members) and the address-only update', () => {
  it('saving with the tick vaults the full Aadhaar (and the address); without it only the last 4', async () => {
    const o = await join('Later Member');                     // joined with no tick
    expect(o.vaultStored).toBe(false);
    const aad2 = mkAadhaar();
    const noTick = await j(await call(o.cookie, 'POST', '/api/network/my-id', { aadhaarNumber: aad2, consent: true }));
    expect(noTick.vaultStored).toBe(false);
    const tick = await j(await call(o.cookie, 'POST', '/api/network/my-id', { aadhaarNumber: aad2, consent: true, kycConsent: true, address: ADDRESS, pincode: PIN, kycSource: 'TYPED' }));
    expect(tick.vaultStored).toBe(true);
    expect((await j(await call(o.cookie, 'GET', '/api/kyc-vault/mine')))).toMatchObject({ hasAadhaar: true, hasAddress: true, address: ADDRESS });
    const r = await j(await reveal(jar.SUP, o.id)); expect(r.aadhaar).toBe(aad2);
    // address-only update needs the tick too
    const refused = await call(o.cookie, 'PUT', '/api/kyc-vault/mine/address', { address: 'New house 7, Civil Lines, Raipur' });
    expect(refused.status).toBe(400);
    const ok = await call(o.cookie, 'PUT', '/api/kyc-vault/mine/address', { address: 'New house 7, Civil Lines, Raipur', pincode: '492001', consent: true });
    expect(ok.status).toBe(200); expect((await j(await reveal(jar.SUP, o.id))).address).toBe('New house 7, Civil Lines, Raipur');
  });
  it('a bad Aadhaar or PIN in my-id is refused and stores nothing', async () => {
    const o = await join('Strict Member');
    const r = await call(o.cookie, 'POST', '/api/network/my-id', { aadhaarNumber: o.aad, consent: true, kycConsent: true, address: ADDRESS, pincode: '12' });
    expect(r.status).toBe(400); expect((await j(await call(o.cookie, 'GET', '/api/kyc-vault/mine'))).hasAadhaar).toBe(false);
  });
});

describe('the superadmin’s switch', () => {
  it('status shows counts and the key mode; switching OFF stops new vaulting but keeps what is stored; ON restores', async () => {
    const s = await j(await call(jar.SUP, 'GET', '/api/kyc-vault/status'));
    expect(s).toMatchObject({ on: true, keyReady: true, keyMode: 'file' }); expect(s.keyWarning).toMatch(/KYC_VAULT_KEY/); expect(s.counts.withAadhaar).toBeGreaterThanOrEqual(2);
    expect((await call(jar.SUP, 'PUT', '/api/kyc-vault/settings', { on: false })).status).toBe(200);
    const off = await join('While Off', fullBody);
    expect(off.status).toBe(200); expect(off.vaultStored).toBe(false);
    expect((await j(await call(off.cookie, 'GET', '/api/kyc-vault/mine'))).on).toBe(false);
    const put = await call(off.cookie, 'PUT', '/api/kyc-vault/mine/address', { address: ADDRESS, consent: true }); expect(put.status).toBe(409);
    expect((await j(await reveal(jar.SUP, M.id))).aadhaar).toBe(M.aad);               // what is stored stays readable by the superadmin
    expect((await call(jar.SUP, 'PUT', '/api/kyc-vault/settings', { on: true })).status).toBe(200);
    const on = await join('While On Again', fullBody); expect(on.vaultStored).toBe(true);
    expect(JSON.stringify(await j(await call(jar.SUP, 'GET', '/api/audit-logs?limit=500')))).toContain('KYC_VAULT_SWITCH');
  });
});

describe('deleting', () => {
  it('the member can delete his full Aadhaar + address; PAN and the last 4 stay; it is audited', async () => {
    const d = await join('Delete Me', fullBody);
    expect((await j(await call(d.cookie, 'GET', '/api/kyc-vault/mine'))).hasAadhaar).toBe(true);
    expect((await call(d.cookie, 'DELETE', '/api/kyc-vault/mine')).status).toBe(200);
    const after = await j(await call(d.cookie, 'GET', '/api/kyc-vault/mine')); expect(after).toMatchObject({ hasAadhaar: false, hasAddress: false, address: '' });
    expect((await reveal(jar.SUP, d.id)).status).toBe(404);
    const me = await j(await call(d.cookie, 'GET', '/api/auth/me')); expect(me.user.panNumber).toBe(d.pan); expect(me.user.aadhaarLast4).toBe(d.aad.slice(-4));
    expect(JSON.stringify(await j(await call(jar.SUP, 'GET', '/api/audit-logs?limit=500')))).toContain('KYC_VAULT_DELETED');
  });
  it('a DPDP erasure removes the vault with the rest of his data', async () => {
    const e = await join('Erase Me', fullBody);
    const pr = await j(await call(e.cookie, 'POST', '/api/privacy/requests', { type: 'ERASURE' })); expect(pr.success, JSON.stringify(pr)).toBe(true);
    const res = await call(jar.ADMIN, 'POST', `/api/privacy/requests/${pr.request.id}/resolve`, { decision: 'COMPLETE' });
    expect(res.status, await res.clone().text()).toBe(200);
    expect((await reveal(jar.SUP, e.id)).status).toBe(404);
  });
});

describe('what is on the disk', () => {
  it('the database file holds only encrypted text — no Aadhaar number, no address — and the key is not in it', async () => {
    proc.kill('SIGTERM'); await new Promise(r => setTimeout(r, 1200));
    const raw = readFileSync(path.join(dir, 'data', 'database.json'), 'utf8');
    expect(raw).toContain('"kycVault"'); expect(raw).toContain('"aadhaarEnc":"k1.'); expect(raw).toContain('"addressEnc":"k1.');
    expect(raw).not.toContain(M.aad); expect(raw).not.toContain(spaced(M.aad)); expect(raw).not.toContain('Shanti Nagar'); expect(raw).not.toContain(ADDRESS);
    const key = readFileSync(path.join(dir, 'data', '.kyc-vault.key'), 'utf8').trim(); expect(raw).not.toContain(key);
    // every vault record carries an id (the Postgres store keys rows by it)
    const db = JSON.parse(raw); for (const r of db.kycVault) { expect(r.id).toMatch(/^KYC-/); expect(r.userId).toBeTruthy(); }
  });
});
