import crypto from 'crypto';
/** v27 — the broker's password is his e-signature on a mandate / on the terms he sends to an owner. Brute-force limited per user. */
import { db } from './db.js';
import type { UserProfile } from './db.js';
import { hit, resetHits, verifyPassword } from './auth.js';

const LIMIT = { tries: 5, windowMs: 10 * 60_000, blockMs: 15 * 60_000 };

/** v73 — an owner who signed up with a mobile OTP has no password: he signs with a fresh one-time code sent to his mobile (10 minutes, one use) */
const SIGN_CODES = new Map<string, { hash: string; exp: number }>();
const codeHash = (uid: string, code: string) => crypto.createHash('sha256').update(`sign|${uid}|${code}`).digest('hex');
export function issueSignCode(uid: string): string { const code = String(crypto.randomInt(100000, 1000000)); SIGN_CODES.set(uid, { hash: codeHash(uid, code), exp: Date.now() + 10 * 60_000 }); return code; }
export function verifySigningPassword(user: UserProfile, password: unknown): string | null {
  const wait = hit(`mandate-sign:${user.id}`, LIMIT.tries, LIMIT.windowMs, LIMIT.blockMs);
  if (wait) return `Too many wrong attempts. Try again in ${Math.ceil(wait / 60)} min.`;
  // getCurrentUser() returns a trust-score-enriched copy that may not carry the hash: always check against the stored record.
  const stored = db.byId('users', user.id);
  if (stored?.selfSignup) {
    const c = SIGN_CODES.get(user.id); const code = typeof password === 'string' ? password.replace(/\D/g, '') : '';
    if (!c || c.exp < Date.now() || code.length !== 6 || c.hash !== codeHash(user.id, code)) return 'Your signing code is required — ask for a new code on your mobile.';
    SIGN_CODES.delete(user.id); resetHits(`mandate-sign:${user.id}`); return null;
  }
  if (typeof password !== 'string' || !password || !stored?.passwordHash || !verifyPassword(password, stored.passwordHash)) {
    return 'Your password is required to sign, and it did not match.';
  }
  resetHits(`mandate-sign:${user.id}`);
  return null;
}
