/**
 * v49 — page tokens for the watermarked, view-only viewers (Protected Docs and protected Property Papers).
 *
 * A token is signed (HMAC with the server secret), names the document, the page and the person, and lives a few minutes.
 * Signed rather than kept in memory, so it still works when the page request reaches another server instance
 * (Vercel runs several). Each instance also remembers the tokens it has already served, so a token cannot be replayed there.
 */
import crypto from 'node:crypto';
import { secret, safeEqual } from './auth.js';

export type ViewKind = 'PDOC' | 'PROPDOC';
export interface ViewClaim { k: ViewKind; d: string; u: string; p: number; e: number; n: string }

const TTL_MS = 5 * 60_000;
const used = new Map<string, number>();
setInterval(() => { const now = Date.now(); for (const [k, exp] of used) if (exp < now) used.delete(k); }, 60_000).unref();

const sign = (body: string) => crypto.createHmac('sha256', secret()).update(`view-token|${body}`).digest('base64url');

export function makeViewToken(kind: ViewKind, docId: string, userId: string, page: number, ttlMs = TTL_MS): string {
  const claim: ViewClaim = { k: kind, d: docId, u: userId, p: page, e: Date.now() + ttlMs, n: crypto.randomBytes(6).toString('base64url') };
  const body = Buffer.from(JSON.stringify(claim)).toString('base64url');
  return `${body}.${sign(body)}`;
}

/** The claim when the token is genuine, unexpired, of this kind, for this user and not used before on this instance; otherwise null. */
export function useViewToken(token: string, kind: ViewKind, userId: string): ViewClaim | null {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig || !safeEqual(sig, sign(body))) return null;
  let c: ViewClaim;
  try { c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!c || c.k !== kind || c.u !== userId || typeof c.e !== 'number' || c.e < Date.now() || !Number.isInteger(c.p) || c.p < 0) return null;
  if (used.has(sig)) return null;
  used.set(sig, c.e);
  return c;
}

/** "Name · ••1234 · 22/10/26, 6:40 pm" — what is stamped on every page a viewer opens */
export function stampFor(name: string, phoneDigits: string): string {
  const stamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' });
  const last4 = String(phoneDigits || '').replace(/\D/g, '').slice(-4);
  return `${name} · ${last4 ? `••${last4}` : '••••'} · ${stamp}`;
}
