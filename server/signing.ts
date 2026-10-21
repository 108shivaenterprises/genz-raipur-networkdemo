/** v27 — the broker's password is his e-signature on a mandate / on the terms he sends to an owner. Brute-force limited per user. */
import { db } from './db.js';
import type { UserProfile } from './db.js';
import { hit, resetHits, verifyPassword } from './auth.js';

const LIMIT = { tries: 5, windowMs: 10 * 60_000, blockMs: 15 * 60_000 };

export function verifySigningPassword(user: UserProfile, password: unknown): string | null {
  const wait = hit(`mandate-sign:${user.id}`, LIMIT.tries, LIMIT.windowMs, LIMIT.blockMs);
  if (wait) return `Too many wrong attempts. Try again in ${Math.ceil(wait / 60)} min.`;
  // getCurrentUser() returns a trust-score-enriched copy that may not carry the hash: always check against the stored record.
  const stored = db.byId('users', user.id);
  if (typeof password !== 'string' || !password || !stored?.passwordHash || !verifyPassword(password, stored.passwordHash)) {
    return 'Your password is required to sign, and it did not match.';
  }
  resetHits(`mandate-sign:${user.id}`);
  return null;
}
