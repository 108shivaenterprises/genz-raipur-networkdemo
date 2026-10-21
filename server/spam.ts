/**
 * Spam & abuse guards that need no third-party service.
 *
 *  - challenge(): a signed arithmetic question for the public "request access" form (a free replacement for a CAPTCHA).
 *    It is stateless (HMAC-signed, 10-minute life) and refuses answers that come back in under 2 seconds (bots).
 *  - filterMessage(): deal-room chat rules — new accounts cannot post links or phone numbers, nobody can flood the same text.
 *  - newAccountCap(): lower daily limits for accounts that are less than 7 days old.
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ctx, hit, secret, DEMO_MODE } from './auth.js';
import { isNewAccount as isNew, filterMessage as filter } from '../src/shared/spamRules.js';
import type { UserProfile } from './db.js';

const sign = (body: string) => crypto.createHmac('sha256', secret()).update('challenge:' + body).digest('base64url');

export function makeChallenge(now = Date.now()) {
  const a = crypto.randomInt(3, 15), b = crypto.randomInt(2, 10);
  const body = Buffer.from(JSON.stringify({ a, b, t: now })).toString('base64url');
  return { question: `${a} + ${b}`, token: `${body}.${sign(body)}` };
}

const usedChallenges = new Map<string, number>();
setInterval(() => { const n = Date.now(); for (const [k, t] of usedChallenges) if (n - t > 11 * 60_000) usedChallenges.delete(k); }, 60_000).unref();

export function checkChallenge(token: unknown, answer: unknown, now = Date.now()): 'OK' | 'BAD' | 'EXPIRED' | 'TOO_FAST' {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return 'BAD';
  const good = sign(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return 'BAD';
  try {
    const { a, b, t } = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (now - t > 10 * 60_000) return 'EXPIRED';
    if (now - t < 2000) return 'TOO_FAST';
    if (Number(answer) !== a + b) return 'BAD';
    if (usedChallenges.has(sig)) return 'BAD'; // each solved check works once
    usedChallenges.set(sig, now);
    return 'OK';
  } catch { return 'BAD'; }
}

export const isNewAccount = (u: Pick<UserProfile, 'createdAt'>, now = Date.now()) => isNew(u, now, DEMO_MODE);
export const filterMessage = (u: UserProfile, text: string) => filter(u, text, Date.now(), DEMO_MODE);

/** Same text posted again and again (3 times in 10 min) is flooding. Returns true when it should be refused. */
export function isFlood(userId: string, text: string): boolean {
  const key = `flood:${userId}:${crypto.createHash('sha1').update(text.trim().toLowerCase()).digest('hex')}`;
  return hit(key, 2, 10 * 60_000) > 0;
}

/** Daily cap that only applies to accounts younger than 7 days. */
export function newAccountCap(kind: string, limit: number) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const u = ctx().user as UserProfile | null;
    if (u && isNewAccount(u) && !['SUPERADMIN', 'ADMIN'].includes(u.role)) {
      const wait = hit(`newcap:${kind}:${u.id}`, limit, 24 * 60 * 60_000);
      if (wait) return res.status(429).json({ error: `New accounts can do this ${limit} times a day during the first 7 days. Try again tomorrow.`, code: 'NEW_ACCOUNT_LIMIT' });
    }
    next();
  };
}
