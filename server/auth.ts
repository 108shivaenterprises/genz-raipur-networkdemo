/**
 * Authentication primitives: password hashing (scrypt), signed session tokens (HMAC-SHA256),
 * per-request user context (AsyncLocalStorage) and tiny in-memory rate limiting.
 * No third-party dependency on purpose.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, Response, NextFunction } from 'express';
import { can, effectivePermissions, type Permission } from './permissions.js';

export const IS_PROD = process.env.NODE_ENV === 'production';
/**
 * Demo mode seeds known demo passwords & exposes the quick-login list. OFF unless explicitly enabled
 * (DEMO_MODE=true) and never allowed in production.
 */
export const DEMO_MODE = (process.env.DEMO_MODE ?? 'false').toLowerCase() === 'true';
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Genz@2026';

// ───────────────────────── passwords ─────────────────────────
const SCRYPT_N = 16384;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: SCRYPT_N, r: 8, p: 1 });
  return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored?: string): boolean {
  if (!stored) return false;
  const [scheme, n, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  try {
    const nNum = Number(n);
    if (isNaN(nNum) || nNum < 16 || nNum > 32768 || (nNum & (nNum - 1)) !== 0) return false;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N: nNum, r: 8, p: 1,
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** A hash nobody can log in with (used for accounts that must be re-activated by an admin). */
export function unusablePasswordHash(): string {
  return hashPassword(crypto.randomBytes(24).toString('hex'));
}

export function passwordPolicyError(pw: unknown): string | null {
  if (typeof pw !== 'string') return 'Password is required';
  if (pw.length < 10) return 'Password must be at least 10 characters';
  if (pw.length > 128) return 'Password is too long';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) {
    return 'Password must contain upper-case, lower-case and a digit';
  }
  return null;
}

export function randomPassword(): string {
  // 14 chars, guaranteed to satisfy the policy
  return `Gz${crypto.randomBytes(6).toString('base64url')}${crypto.randomInt(10, 99)}x`;
}

// ───────────────────────── session tokens ─────────────────────────
let SECRET: Buffer | null = null;

export function secret(): Buffer {
  if (SECRET) return SECRET;
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 24) {
    SECRET = Buffer.from(process.env.AUTH_SECRET);
    return SECRET;
  }
  const file = path.resolve(process.cwd(), 'data', '.auth-secret');
  try {
    if (fs.existsSync(file)) {
      SECRET = Buffer.from(fs.readFileSync(file, 'utf-8').trim(), 'hex');
      if (SECRET.length >= 32) return SECRET;
    }
  } catch { /* fallthrough: regenerate */ }
  SECRET = crypto.randomBytes(48);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, SECRET.toString('hex'), { mode: 0o600 });
  } catch (e) {
    console.warn('[AUTH] Could not persist auth secret; sessions reset on restart.', e);
  }
  if (IS_PROD) console.warn('[AUTH] AUTH_SECRET env var not set — using a generated secret file. Set AUTH_SECRET in production.');
  return SECRET;
}

export interface SessionPayload {
  uid: string;
  /** user.sessionVersion at issue time — bumping it revokes all sessions of that user */
  sv: number;
  iat: number;
  exp: number;
  /** present when a SUPERADMIN is "viewing as" another user */
  imp?: string;
}

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h
const IMPERSONATION_TTL_MS = 30 * 60 * 1000; // 30m

export function signSession(uid: string, sv: number, opts: { imp?: string } = {}): string {
  const now = Date.now();
  const payload: SessionPayload = {
    uid, sv, iat: now,
    exp: now + (opts.imp ? IMPERSONATION_TTL_MS : SESSION_TTL_MS),
    ...(opts.imp ? { imp: opts.imp } : {}),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined): SessionPayload | null {
  if (!token || token.length > 2048) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as SessionPayload;
    if (!payload.uid || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const COOKIE_NAME = 'genz_session';

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const raw = part.slice(i + 1).trim();
    try { out[part.slice(0, i).trim()] = decodeURIComponent(raw); } catch { out[part.slice(0, i).trim()] = raw; }   // a bad cookie like `x=%` must not 500 every request
  }
  return out;
}

export function setSessionCookie(req: Request, res: Response, token: string, maxAgeMs = SESSION_TTL_MS) {
  const secure = IS_PROD || req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure ? '; Secure' : ''}`
  );
}

export function clearSessionCookie(res: Response) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function extractToken(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return parseCookies(req.headers.cookie)[COOKIE_NAME];
}

// ───────────────────────── per-request context ─────────────────────────
export interface RequestContext<U = any> {
  user: U | null;
  impersonatedBy?: string;
  ip: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function ctx(): RequestContext {
  return requestContext.getStore() ?? { user: null, ip: 'n/a' };
}

/** Express middleware factory: `resolveUser` loads the user (and checks sessionVersion) for a payload. */
export function authenticate(resolveUser: (p: SessionPayload) => any | null) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const payload = verifySession(extractToken(req));
    const user = payload ? resolveUser(payload) : null;
    requestContext.run({ user, impersonatedBy: payload?.imp, ip: req.ip || 'n/a' }, next);
  };
}

/** Route gate. 401 if anonymous, 403 if the (state-aware) role lacks the permission. */
export function needs(...perms: Permission[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const { user } = ctx();
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (perms.length === 0 || perms.some(p => can(user, p))) return next();
    if (user.basicTier && user.verificationStatus === 'VERIFIED' && perms.some(p => effectivePermissions({ ...user, basicTier: false }).includes(p))) return kycLocked(res);
    if (user.verificationStatus !== 'VERIFIED' && perms.some(p => effectivePermissions({ ...user, verificationStatus: 'VERIFIED' }).includes(p))) {
      return res.status(403).json({
        error: `Your account is ${String(user.verificationStatus).toLowerCase()}. This action unlocks after admin KYC verification.`,
        code: 'ACCOUNT_NOT_VERIFIED',
      });
    }
    return res.status(403).json({ error: `Forbidden: your role (${user.role}) is not permitted to do this.`, code: 'FORBIDDEN' });
  };
}

/** v185 (D15) — the one friendly answer for a Basic account that touches a KYC-only action (the app turns `basic: true` into a "Verify KYC to unlock" sheet) */
export function kycLocked(res: Response) {
  return res.status(403).json({
    error: 'Verify your KYC to unlock this. Deals, commission, payments, site visits, broadcasts and inviting others open after your PAN / RERA document is checked.',
    errorHi: 'इसे खोलने के लिए KYC वेरिफ़ाई करें। डील, कमीशन, पेमेंट, साइट विज़िट, ब्रॉडकास्ट और दूसरों को बुलाना आपका PAN / RERA दस्तावेज़ जाँचने के बाद खुलता है।',
    code: 'ACCOUNT_NOT_VERIFIED', basic: true,
  });
}
/** gate for actions that are not a permission of their own (broadcast to the network) */
export function needsKyc(_req: Request, res: Response, next: NextFunction) {
  const { user } = ctx();
  if (user?.basicTier && user.verificationStatus === 'VERIFIED') return kycLocked(res);
  next();
}

/** v186 (D16) — a Basic account may read only so many rows of a network list per day (per account and per IP): a throw-away account cannot scrape the board. Rows past the quota are cut off with a friendly note. In memory: one server instance (the Docker prod path), same as the other limiters. */
const quotaBook = new Map<string, { n: number; reset: number }>();
export const BASIC_ROWS_PER_DAY = () => { const n = Number(process.env.BASIC_ROWS_PER_DAY); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 200; };
export const BASIC_IP_ROWS_PER_DAY = () => { const n = Number(process.env.BASIC_IP_ROWS_PER_DAY); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3000; };   // v191 (C1d): 3000 so one shared mobile (CGNAT) address is not used up by a few accounts
/** a row the account itself listed / owns / was assigned / created: never counted, never trimmed (v186b) */
const ownRow = (r: any, id: string) => !!r && [r.listingBrokerId, r.ownerId, r.assignedBrokerId, r.createdBy, r.buyerId].includes(id);
export function basicQuota(key: 'properties' | 'requirements' | 'property') {
  return (req: Request, res: Response, next: NextFunction) => {
    const { user } = ctx();
    if (!user?.basicTier) return next();
    const day = 86400_000, now = Date.now(), cap = BASIC_ROWS_PER_DAY(), ipCap = BASIC_IP_ROWS_PER_DAY();
    const slot = (k: string, limit: number) => { let b = quotaBook.get(k); if (!b || b.reset < now) { b = { n: 0, reset: now + day }; quotaBook.set(k, b); } return { b, left: Math.max(0, limit - b.n) }; };
    if (quotaBook.size > 5000) for (const [k, v] of quotaBook) if (v.reset < now) quotaBook.delete(k);
    const bucket = key === 'requirements' ? 'requirements' : 'properties';   // one pool for listings, single reads included
    const mine = slot(`${bucket}:u:${user.id}`, cap), ipS = slot(`${bucket}:ip:${ipKey(req.ip)}`, ipCap);
    const left = Math.min(mine.left, ipS.left);
    const deny = () => res.status(429).json(mine.left <= 0
      ? { error: 'You have seen today\'s limit of listings / needs for a Basic account. Your own listings are always open. Verify your KYC to see more, or come back tomorrow.', errorHi: 'बेसिक अकाउंट की आज की सीमा पूरी हो गई। आपकी अपनी लिस्टिंग हमेशा खुली हैं। और देखने के लिए KYC वेरिफ़ाई करें, या कल आएँ।', code: 'BASIC_QUOTA', basic: true }
      : { error: 'Many Basic accounts on your network have read a lot today. Verify your KYC to continue, or try again tomorrow.', errorHi: 'आपके नेटवर्क से आज बहुत ज़्यादा पढ़ा गया है। जारी रखने के लिए KYC वेरिफ़ाई करें, या कल कोशिश करें।', code: 'BASIC_QUOTA_IP', basic: true });
    const json = res.json.bind(res);
    res.json = (body: any) => {
      if (key === 'property') {
        if (body?.property && !ownRow(body.property, user.id)) { if (left <= 0) { res.json = json; return deny(); } mine.b.n += 1; ipS.b.n += 1; }
        return json(body);
      }
      const rows: any[] | null = Array.isArray(body?.[key]) ? body[key] : null;
      if (rows) {
        const own = rows.filter(r => ownRow(r, user.id)), others = rows.filter(r => !ownRow(r, user.id));
        // a list never turns into an error: the account's own rows are always returned, the rest is trimmed to what is left today
        const kept = others.slice(0, left); mine.b.n += kept.length; ipS.b.n += kept.length;
        body = { ...body, basicPreview: cap, [key]: [...own, ...kept], ...(kept.length < others.length ? { limited: true, limitedNote: 'Today\'s preview limit reached — verify KYC for full access', limitedNoteHi: 'आज की प्रीव्यू सीमा पूरी हो गई — पूरी पहुँच के लिए KYC वेरिफ़ाई करें' } : {}) };
      }
      return json(body);
    };
    next();
  };
}

/** one key for an address: an IPv6 client owns a whole /64, so it counts as one device; IPv4 as is (v186) */
export function ipKey(ip?: string): string {
  const a = String(ip || '?').replace(/^::ffff:/, '');
  if (!a.includes(':')) return a;
  const full = a.split('::'); const head = full[0].split(':').filter(Boolean); const tail = (full[1] || '').split(':').filter(Boolean);
  const groups = [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail];
  return groups.slice(0, 4).map(g => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

export function requireAuth(_req: Request, res: Response, next: NextFunction) {
  if (!ctx().user) return res.status(401).json({ error: 'Authentication required' });
  next();
}

// ───────────────────────── rate limiting ─────────────────────────
interface Bucket { count: number; resetAt: number; blockedUntil?: number }
const buckets = new Map<string, Bucket>();

/** Returns seconds to wait if the caller is over the limit, else 0 (and records the hit). */
export function hit(key: string, limit: number, windowMs: number, blockMs = 0): number {
  const now = Date.now();
  let b = buckets.get(key);
  if (b?.blockedUntil && b.blockedUntil > now) return Math.ceil((b.blockedUntil - now) / 1000);
  if (!b || b.resetAt < now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > limit) {
    if (blockMs) b.blockedUntil = now + blockMs;
    return Math.ceil(((blockMs ? b.blockedUntil! : b.resetAt) - now) / 1000);
  }
  return 0;
}

export function resetHits(key: string) { buckets.delete(key); }

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt < now && (!b.blockedUntil || b.blockedUntil < now)) buckets.delete(k);
}, 60_000).unref();

export function rateLimit(name: string, limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    // signed-in members are counted one by one: many brokers share one office / mobile-carrier IP and must not lock each other out
    const u = ctx().user; const who = u?.id ? `u:${u.id}` : ipKey(req.ip);
    const wait = hit(`${name}:${who}`, limit, windowMs);
    if (wait) {
      res.setHeader('Retry-After', String(wait));
      return res.status(429).json({ error: 'Too many requests. Please slow down.', errorHi: 'बहुत ज़्यादा अनुरोध। कृपया थोड़ा रुककर फिर कोशिश करें।' });
    }
    next();
  };
}

// ───────────────────────── misc security helpers ─────────────────────────
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function secureCode(bytes = 9): string {
  return crypto.randomBytes(bytes).toString('base64url').replace(/[-_]/g, 'x').toUpperCase();
}

export function secureOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

/** Only http(s) URLs or internal /vault paths may be stored — blocks javascript:/data: XSS vectors. */
export function isSafeUrl(url: unknown): boolean {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) return false;
  if (url.startsWith('/') && !url.startsWith('//')) return !/[\r\n<>"']/.test(url);
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function digits(s: string | undefined | null): string {
  return String(s ?? '').replace(/\D/g, '').slice(-10);
}
