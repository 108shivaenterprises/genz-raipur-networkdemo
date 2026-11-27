/**
 * D23 — job-code handshake (proof of presence) + before/after job photos.
 * The CUSTOMER generates a random 4-digit code in his own app (it is shown once, in that response); only a salted hash and an expiry are stored.
 * The other side types it: 5 wrong tries lock it, it works once, it expires in 24 h, the compare is constant-time.
 * Shortcut: a 4-digit code has only 10,000 values, so a leaked hash could be brute-forced offline; the real protection is the 5-try lock and the short life. Upgrade: HMAC with a server secret.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { sniffMime } from '../src/shared/propDocs.js';
import type { JobCodeRec } from './db.js';
import { secret } from './auth.js';

export const JOBCODE_TTL_MS = 24 * 3600_000;
export const JOBCODE_MAX_TRIES = 5;
export const JOBCODE_MAX_ISSUES = 5;            // bounded, not unlimited: at most 5 codes (+1 per desk unlock, 2 unlocks max) with 5 tries each, about 35 guesses per visit in the very worst case
export const JOBCODE_MAX_UNLOCKS = 2;          // each desk unlock voids the code and grants one more issue; at most 2 per record            // a customer cannot keep re-rolling to get fresh tries
export const JOB_PHOTO_MAX_BYTES = 150 * 1024;  // the app shrinks to ~150 KB first (same cap as the profile photo)
export const JOB_PHOTO_MAX_PER_KIND = 4;

/** HMAC keyed from the server secret through a domain-separated HMAC (never a new env var, never printed): a leaked hash cannot be brute-forced offline without the server secret */
const hashOf = (salt: string, code: string) => crypto.createHmac('sha256', crypto.createHmac('sha256', secret()).update('genz-job-code-v1').digest()).update(`${salt}:${code}`).digest();

/** a new code: returns the plain code (to show once) and the record to store (hash only). `prev` carries the issue count; a lock is replaced by the fresh code (still capped by JOBCODE_MAX_ISSUES). */
export function issueJobCode(prev?: JobCodeRec, now = Date.now()): { code: string; rec: JobCodeRec } | { error: 'TOO_MANY' } {
  const issues = (prev?.issues || 0) + 1; if (issues > JOBCODE_MAX_ISSUES + (prev?.unlocks || 0)) return { error: 'TOO_MANY' };
  const code = String(crypto.randomInt(0, 10000)).padStart(4, '0'); const salt = crypto.randomBytes(8).toString('hex');
  return { code, rec: { hash: hashOf(salt, code).toString('hex'), salt, expiresAt: new Date(now + JOBCODE_TTL_MS).toISOString(), attempts: 0, issues, ...(prev?.unlocks ? { unlocks: prev.unlocks, unlockedBy: prev.unlockedBy } : {}) } };
}
export const triesLeft = (n: number) => ({ en: n === 1 ? '1 try left' : `${n} tries left`, hi: `${n} कोशिश बाक़ी` });
export type CodeCheck = 'OK' | 'BAD' | 'EXPIRED' | 'LOCKED' | 'USED' | 'NONE';
/** checks (and counts) one try. Mutates `rec`. */
export function checkJobCode(rec: JobCodeRec | undefined, input: unknown, now = Date.now()): CodeCheck {
  if (!rec || !rec.hash) return 'NONE'; if (rec.usedAt) return 'USED'; if (rec.lockedAt) return 'LOCKED';
  if (Date.parse(rec.expiresAt) < now) return 'EXPIRED';
  const given = String(input ?? '').trim();
  const ok = /^\d{4}$/.test(given) && crypto.timingSafeEqual(hashOf(rec.salt, given), Buffer.from(rec.hash, 'hex'));
  if (ok) { rec.usedAt = new Date(now).toISOString(); return 'OK'; }
  rec.attempts += 1; if (rec.attempts >= JOBCODE_MAX_TRIES) rec.lockedAt = new Date(now).toISOString();
  return rec.lockedAt ? 'LOCKED' : 'BAD';
}
/** the desk VOIDS the code (no hash, state NONE): the customer must make a fresh random one, so every earlier guess is worthless and an unlock never refreshes a guess budget.
 *  Capped at JOBCODE_MAX_UNLOCKS per record; the one who unlocked may not be the one who enters the next code. */
export function unlockJobCode(rec: JobCodeRec | undefined, by: string): 'OK' | 'NONE' | 'TOO_MANY' {
  if (!rec || !rec.hash || rec.usedAt) return 'NONE';   // nothing active to void: refused and the unlock budget is NOT used (B14-01)
  if ((rec.unlocks || 0) >= JOBCODE_MAX_UNLOCKS) return 'TOO_MANY';
  rec.hash = ''; rec.salt = ''; rec.lockedAt = undefined; rec.usedAt = undefined; rec.attempts = 0; rec.unlocks = (rec.unlocks || 0) + 1; rec.unlockedBy = by; return 'OK';
}
export const codeState = (rec?: JobCodeRec, now = Date.now()): 'NONE' | 'ACTIVE' | 'USED' | 'LOCKED' | 'EXPIRED' =>
  !rec || !rec.hash ? 'NONE' : rec.usedAt ? 'USED' : rec.lockedAt ? 'LOCKED' : Date.parse(rec.expiresAt) < now ? 'EXPIRED' : 'ACTIVE';

// ── job photos on disk (same pattern as the profile photo: sniffed bytes, size cap, never public) ──
const DIR = () => path.resolve(process.cwd(), 'data', 'jobphotos');
const fileOf = (id: string) => path.join(DIR(), `${id}.bin`);
export function saveJobPhoto(data: unknown): { id: string; mime: string; size: number } | { error: string; errorHi: string; status: number } {
  const raw = String(data ?? '').replace(/^data:[^;]+;base64,/, '');
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(raw) || raw.length < 100) return { error: 'The photo could not be read. Please choose it again.', errorHi: 'फ़ोटो पढ़ी नहीं जा सकी। दोबारा चुनें।', status: 400 };
  const buf = Buffer.from(raw, 'base64');
  if (buf.length > JOB_PHOTO_MAX_BYTES) return { error: 'The photo is too big (150 KB at most).', errorHi: 'फ़ोटो बहुत बड़ी है (अधिकतम 150 KB)।', status: 413 };
  const mime = sniffMime(buf); if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') return { error: 'Only a JPEG, PNG or WebP photo is accepted.', errorHi: 'सिर्फ़ JPEG, PNG या WebP फ़ोटो चलेगी।', status: 415 };
  const id = `JPH-${crypto.randomBytes(5).toString('hex')}`;
  try { fs.mkdirSync(DIR(), { recursive: true }); const tmp = fileOf(id) + '.tmp'; fs.writeFileSync(tmp, buf); fs.renameSync(tmp, fileOf(id)); }
  catch { return { error: 'The photo could not be saved. Please try again.', errorHi: 'फ़ोटो सेव नहीं हो सकी। फिर कोशिश करें।', status: 500 }; }
  return { id, mime, size: buf.length };
}
export const readJobPhoto = (id: string): Buffer | null => { try { return fs.readFileSync(fileOf(id)); } catch { return null; } };
export const eraseJobPhotos = (ids: string[]) => { for (const id of ids) { try { fs.unlinkSync(fileOf(id)); } catch { /* already gone */ } } };
