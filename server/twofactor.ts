/**
 * v26 — two-step sign-in (TOTP, RFC 6238 — Google Authenticator / Microsoft Authenticator / any authenticator app). Free, no SMS.
 *   /api/auth/2fa
 *
 *   GET  /status                  { enabled, recommended, recoveryLeft }
 *   POST /setup     { password }  → a new secret (base32) + otpauth link for the QR (not active until confirmed)
 *   POST /enable    { code }      → ON; returns 10 one-time recovery codes (shown once)
 *   POST /disable   { password, code }
 *   POST /api/auth/login/2fa { ticket, code }  — the second step after the password (see server.ts login)
 *
 * The secret is stored encrypted (AES-256-GCM, key derived from AUTH_SECRET). A code is accepted once (no replay) within
 * ±30 seconds. Recovery codes are kept only as hashes. Opening the KYC vault needs a fresh code when 2FA is on —
 * and in production the superadmin cannot open the vault at all until 2FA is on.
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from './db.js';
import type { TwoFactor, UserProfile } from './db.js';
import { ctx, requireAuth, rateLimit, secret, verifyPassword, hit, resetHits, safeEqual } from './auth.js';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of clean) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
/** RFC 4226 HOTP / RFC 6238 TOTP (SHA-1, 6 digits, 30 s) */
export function hotp(key: Buffer, counter: number, digits = 6): string {
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(c).digest();
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}
export const stepOf = (ms = Date.now()) => Math.floor(ms / 1000 / 30);
export const totp = (key: Buffer, ms = Date.now()) => hotp(key, stepOf(ms));
/** the matching time step (±1) or -1 */
export function checkTotp(key: Buffer, code: string, ms = Date.now()): number {
  const c = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(c)) return -1;
  const now = stepOf(ms);
  for (const s of [now, now - 1, now + 1]) if (safeEqual(hotp(key, s), c)) return s;
  return -1;
}

const encKey = () => crypto.createHmac('sha256', secret()).update('genz-2fa-v1').digest();
function seal(b: Buffer) { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv); const ct = Buffer.concat([c.update(b), c.final()]); return `t1.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${ct.toString('base64url')}`; }
function unseal(s: string): Buffer { const [, iv, tag, ct] = s.split('.'); const d = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(iv, 'base64url')); d.setAuthTag(Buffer.from(tag, 'base64url')); return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]); }
const recHash = (userId: string, code: string) => crypto.createHmac('sha256', secret()).update(`2fa-rec|${userId}|${code.toUpperCase().replace(/[^A-Z0-9]/g, '')}`).digest('hex');

const rec = (userId: string) => db.getState().twoFactor.find(x => x.userId === userId);
export const twoFactorOn = (userId: string) => !!rec(userId)?.enabledAt;
export const twoFactorRecommended = (u: UserProfile) => u.role === 'SUPERADMIN' || u.role === 'ADMIN';

/** a TOTP or a recovery code for this member (used by login step 2 and by the KYC vault) */
export function verifySecondFactor(userId: string, code: string): 'OK' | 'BAD' | 'OFF' | 'LOCKED' {
  const r = rec(userId);
  if (!r?.enabledAt) return 'OFF';
  if (hit(`2fa:${userId}`, 8, 15 * 60_000, 15 * 60_000)) return 'LOCKED';
  const step = checkTotp(unseal(r.secretEnc), code);
  if (step >= 0) {
    if (r.lastStep !== undefined && step <= r.lastStep) return 'BAD'; // the same code twice
    r.lastStep = step; db.save(); resetHits(`2fa:${userId}`);
    return 'OK';
  }
  const h = recHash(userId, code);
  const i = r.recovery.findIndex(x => safeEqual(x, h));
  if (i >= 0 && String(code).replace(/[^A-Za-z0-9]/g, '').length >= 10) { r.recovery.splice(i, 1); db.save(); resetHits(`2fa:${userId}`); return 'OK'; }
  return 'BAD';
}

// ── login tickets: password OK, waiting for the code (5 minutes, bound to the session version) ──
export function makeTicket(u: UserProfile): string {
  const body = Buffer.from(JSON.stringify({ uid: u.id, sv: u.sessionVersion || 1, exp: Date.now() + 5 * 60_000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(`2fa-ticket|${body}`).digest('base64url');
  return `${body}.${sig}`;
}
export function readTicket(t: string): { uid: string; sv: number } | null {
  const [body, sig] = String(t || '').split('.');
  if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', secret()).update(`2fa-ticket|${body}`).digest('base64url');
  if (!safeEqual(want, sig)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? { uid: p.uid, sv: p.sv } : null; } catch { return null; }
}

export function createTwoFactorRouter() {
  const r = Router();
  const me = () => ctx().user as UserProfile;
  r.get('/status', requireAuth, (_req: Request, res: Response) => {
    const u = me(); const x = rec(u.id);
    res.json({ success: true, enabled: !!x?.enabledAt, enabledAt: x?.enabledAt || null, recommended: twoFactorRecommended(u), recoveryLeft: x?.enabledAt ? x.recovery.length : 0 });
  });
  r.post('/setup', requireAuth, rateLimit('2fa-setup', 10, 3600_000), (req: Request, res: Response) => {
    const u = me();
    if (!verifyPassword(String(req.body?.password || ''), u.passwordHash)) return res.status(400).json({ error: 'Password is not correct', code: 'BAD_PASSWORD' }); // v28: 400 — a 401 signs the user out of the app
    const s = db.getState(); const x = rec(u.id);
    if (x?.enabledAt) return res.status(409).json({ error: 'Two-step sign-in is already on. Turn it off first to move it to a new phone.' });
    const key = crypto.randomBytes(20);
    const row: TwoFactor = { id: u.id, userId: u.id, secretEnc: seal(key), pendingSince: new Date().toISOString(), recovery: [] };
    s.twoFactor = s.twoFactor.filter(t => t.userId !== u.id); s.twoFactor.push(row); db.save();
    const label = encodeURIComponent(`GENZ:${u.email || u.phone}`);
    const b32 = base32Encode(key);
    res.json({ success: true, secret: b32, otpauth: `otpauth://totp/${label}?secret=${b32}&issuer=GENZ&algorithm=SHA1&digits=6&period=30` });
  });
  r.post('/enable', requireAuth, rateLimit('2fa-enable', 20, 3600_000), (req: Request, res: Response) => {
    const u = me(); const x = rec(u.id);
    if (!x || x.enabledAt) return res.status(409).json({ error: 'Start the setup first.' });
    const step = checkTotp(unseal(x.secretEnc), String(req.body?.code || ''));
    if (step < 0) return res.status(400).json({ error: 'The code is not correct. Check the time on your phone and try the newest code.', code: 'BAD_CODE' });
    const codes = Array.from({ length: 10 }, () => crypto.randomBytes(6).toString('hex').toUpperCase().replace(/(.{4})(?=.)/g, '$1-'));
    x.recovery = codes.map(c => recHash(u.id, c)); x.enabledAt = new Date().toISOString(); x.pendingSince = undefined; x.lastStep = step;
    db.save();
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', u.id, 'TWO_FACTOR_ON', `${u.name} turned on two-step sign-in`);
    res.json({ success: true, recoveryCodes: codes });
  });
  r.post('/disable', requireAuth, rateLimit('2fa-disable', 10, 3600_000), (req: Request, res: Response) => {
    const u = me();
    if (!verifyPassword(String(req.body?.password || ''), u.passwordHash)) return res.status(400).json({ error: 'Password is not correct', code: 'BAD_PASSWORD' }); // v28: 400 — a 401 signs the user out of the app
    const v = verifySecondFactor(u.id, String(req.body?.code || ''));
    if (v === 'LOCKED') return res.status(429).json({ error: 'Too many wrong codes. Wait 15 minutes.' });
    if (v !== 'OK') return res.status(400).json({ error: 'The code is not correct.', code: 'BAD_CODE' });
    const s = db.getState(); s.twoFactor = s.twoFactor.filter(t => t.userId !== u.id); db.save();
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', u.id, 'TWO_FACTOR_OFF', `${u.name} turned off two-step sign-in`);
    res.json({ success: true });
  });
  return r;
}
