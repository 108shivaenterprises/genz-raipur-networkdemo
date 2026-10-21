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
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n), r: 8, p: 1,
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
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
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
    if (user.verificationStatus !== 'VERIFIED' && perms.some(p => effectivePermissions({ ...user, verificationStatus: 'VERIFIED' }).includes(p))) {
      return res.status(403).json({
        error: `Your account is ${String(user.verificationStatus).toLowerCase()}. This action unlocks after admin KYC verification.`,
        code: 'ACCOUNT_NOT_VERIFIED',
      });
    }
    return res.status(403).json({ error: `Forbidden: your role (${user.role}) is not permitted to do this.`, code: 'FORBIDDEN' });
  };
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
    const wait = hit(`${name}:${req.ip}`, limit, windowMs);
    if (wait) {
      res.setHeader('Retry-After', String(wait));
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
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
