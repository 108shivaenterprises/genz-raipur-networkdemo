/**
 * v175 (D5) — one-time codes WITHOUT an SMS provider.
 * The server makes the 6-digit code (crypto.randomInt) and keeps only an HMAC of it (+ the code sealed with a key derived from the server secret,
 * so an admin can read it from "Pending OTP codes" and relay it on WhatsApp; the sealed copy is wiped as soon as the code is used or locked).
 * The browser gets an opaque reference only — never a token it could brute-force offline.
 * Limits: 60 s per phone, 3 codes per phone per day (a locked-by-wrong-guesses code does not count), a budget per purpose (OTP_CAP_RESET/OWNER/SIGNUP) and an overall cap (OTP_DAILY_CAP, default 300) over codes still live, 10 distinct phones per IP per day; 5 wrong tries lock that one code for 15 min (never the whole phone; at most 6 locked codes per number AND device (IP) per day; 30 wrong guesses per IP per hour across all codes).
 * Every number gets a record whether or not it has an account, so no answer here says whether an account exists.
 */
import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { db } from './db.js';
import { stampPhone } from './access.js';
import { ctx, needs, rateLimit, hit, ipKey, secret, safeEqual, secureOtp, hashPassword, passwordPolicyError, digits, DEMO_MODE } from './auth.js';
import { sendSms, smsGateway } from './notify.js';
import { otpMode } from './features.js';
import { effectivePermissions } from './permissions.js';

/** v186: 'open' = open sign-up codes, with a budget of their own so a sign-up flood can never use up the codes that existing members need to sign in */
export type OtpPurpose = 'signup' | 'owner' | 'reset' | 'open';
interface Rec { id: string; phone: string; purpose: OtpPurpose; hash: string; enc: string; exp: number; createdAt: number; tries: number; used?: boolean; locked?: boolean; lockedUntil?: number; sent?: string[]; viewedBy?: string[]; ip?: string }
export const OTP_TTL_MS = 10 * 60_000, COOLDOWN_S = 60, PER_PHONE_DAY = 3, PER_PHONE_DAY_ANY = 10, MAX_TRIES = 5, LOCK_MS = 15 * 60_000, DAY = 86400_000;
const PHONE_RE = /^[6-9]\d{9}$/;
export const dailyCap = () => { const n = Number(process.env.OTP_DAILY_CAP); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 300; };

const capEnv = (name: string, d: number) => { const n = Number(process.env[name]); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d; };
export const purposeCap = (p: OtpPurpose) => p === 'reset' ? capEnv('OTP_CAP_RESET', 150) : p === 'owner' ? capEnv('OTP_CAP_OWNER', 100) : p === 'open' ? capEnv('OTP_CAP_OPEN', 150) : capEnv('OTP_CAP_SIGNUP', 50);
const book = (): Record<string, Rec> => {
  const s = db.getState() as any; const b: Record<string, Rec> = (s.manualOtp ||= {}); const t = Date.now(); const old = t - DAY;
  for (const k of Object.keys(b)) { if (b[k].createdAt < old) delete b[k]; else if (b[k].enc && b[k].exp < t) b[k].enc = ''; }   // an expired code's sealed copy is wiped
  return b;
};
const hm = (r: { id: string; phone: string; purpose: string }, code: string) => crypto.createHmac('sha256', secret()).update(`manual-otp|${r.id}|${r.phone}|${r.purpose}|${code}`).digest('hex');
const encKey = () => crypto.createHmac('sha256', secret()).update('manual-otp-seal').digest();
const sealCode = (code: string, id: string) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv); c.setAAD(Buffer.from(id)); const ct = Buffer.concat([c.update(code, 'utf8'), c.final()]); return [iv, c.getAuthTag(), ct].map(b => b.toString('base64url')).join('.'); };
const openCode = (s: string, id: string) => { try { const [iv, tag, ct] = s.split('.').map(x => Buffer.from(x, 'base64url')); const d = crypto.createDecipheriv('aes-256-gcm', encKey(), iv); d.setAAD(Buffer.from(id)); d.setAuthTag(tag); return Buffer.concat([d.update(ct), d.final()]).toString('utf8'); } catch { return ''; } };

export interface OtpFail { ok: false; status: number; code: string; error: string; errorHi: string; wait?: number }
const fail = (status: number, code: string, error: string, errorHi: string, wait?: number): OtpFail => ({ ok: false, status, code, error, errorHi, ...(wait ? { wait } : {}) });
export interface OtpView { ref: string; expiresInSec: number; cooldownSec: number; wa: string | null }

/** staff = ADMIN / SUPERADMIN or anyone holding otp:relay: their reset never goes through the WhatsApp relay (a SUPERADMIN does it by hand) */
export function isStaffPhone(phone: string): boolean {
  return db.getState().users.some(u => digits(u.phone).slice(-10) === phone && (u.role === 'ADMIN' || u.role === 'SUPERADMIN' || (effectivePermissions(u) as string[]).includes('otp:relay')));
}
const ipSeen = new Map<string, number>();
/** per-IP: at most 10 distinct phones asked for a code in 24 h (the same phone again is not a new one). null = allowed */
export function ipPhoneGate(ip: string | undefined, phone: string, now = Date.now()): OtpFail | null {
  ip = ipKey(ip);
  const k = `${ip || '?'}|${phone}`; if ((ipSeen.get(k) || 0) > now) return null;
  const wait = hit(`otp-ip-phones:${ip || '?'}`, 10, DAY);
  if (wait) return fail(429, 'IP_PHONES', 'Too many different numbers from this device today. Try again tomorrow.', 'आज इस डिवाइस से बहुत सारे अलग नंबर आज़माए गए। कल कोशिश करें।', wait);
  if (ipSeen.size > 5000) for (const [x, e] of ipSeen) if (e < now) ipSeen.delete(x);
  ipSeen.set(k, now + DAY); return null;
}

/** wa.me click-to-chat link to the platform number (OTP_WHATSAPP_NUMBER); the text carries the reference, never the code. null = number not set. */
export function waLink(ref: string): string | null {
  const n = String(process.env.OTP_WHATSAPP_NUMBER || '').replace(/\D/g, '');
  return n.length >= 10 ? `https://wa.me/${n}?text=${encodeURIComponent(`GENZ login code please. Request ${ref}`)}` : null;
}

/** Make a code for any phone (account or not). Returns the reference + the code (the caller decides who may see it: admin screen / SMS / demo). */
export function issueOtp(phone: string, purpose: OtpPurpose, now = Date.now(), ip?: string): (OtpView & { ok: true; code: string }) | OtpFail {
  if (!PHONE_RE.test(phone)) return fail(400, 'BAD_PHONE', 'Enter your 10-digit mobile number', '10 अंकों का मोबाइल नंबर लिखें');
  if (ip) ip = ipKey(ip);   // v186: an IPv6 client owns a whole /64 — one device
  const b = book(); const all = Object.values(b);
  const mine = all.filter(r => r.phone === phone);
  // v178: no phone-wide lock (a stranger could lock a victim out by guessing wrong on purpose). Each wrong-guessed code is locked on its own; this caps how many such codes one number can burn per day.
  // S4: the cap is per (device, number), so a stranger cannot lock the real owner out; the wait is when the oldest locked code ages out.
  const burnt = ip ? mine.filter(r => r.locked && r.ip === ip) : [];
  if (burnt.length >= 6) { const w = Math.max(3600, Math.ceil((Math.min(...burnt.map(r => r.createdAt)) + DAY - now) / 1000)); return fail(429, 'LOCKED', 'Too many wrong codes for this number from this device today. Try again tomorrow.', 'आज इस डिवाइस से इस नंबर पर बहुत ग़लत कोड आज़माए गए। कल फिर कोशिश करें।', w); }
  const last = Math.max(0, ...mine.map(r => r.createdAt));
  if (now - last < COOLDOWN_S * 1000) { const w = Math.ceil((COOLDOWN_S * 1000 - (now - last)) / 1000); return fail(429, 'COOLDOWN', `Wait ${w} seconds before asking for another code.`, `दूसरा कोड माँगने से पहले ${w} सेकंड रुकें।`, w); }
  // F3: the 3/day cap is per (number, device) so a stranger cannot lock a victim's number; a looser per-number ceiling (10/day, any device) stops a botnet. Same generic answer for both.
  const unlocked = mine.filter(r => !r.locked), fromHere = unlocked.filter(r => r.ip === ip);
  const capped = fromHere.length >= PER_PHONE_DAY ? fromHere : unlocked.length >= PER_PHONE_DAY_ANY ? unlocked : null;
  if (capped) { const w = Math.ceil((Math.min(...capped.map(r => r.createdAt)) + DAY - now) / 1000); return fail(429, 'PHONE_DAY', 'Too many codes for this number today. Try again tomorrow.', 'आज इस नंबर के लिए बहुत कोड माँगे जा चुके। कल कोशिश करें।', w); }
  const live = all.filter(r => !r.used && r.exp >= now && (purpose === 'open' ? r.purpose === 'open' : r.purpose !== 'open'));   // used / expired codes do not eat the budget; open sign-up codes have their own bucket (v186)
  if ((purpose !== 'open' && live.length >= dailyCap()) || live.filter(r => r.purpose === purpose).length >= purposeCap(purpose)) return fail(503, 'DAILY_CAP', 'Codes are busy right now. Please try again later.', 'अभी कोड भेजने की सीमा पूरी हो गई है। कृपया बाद में कोशिश करें।', 3600);
  const code = secureOtp(); let id = ''; do id = crypto.randomBytes(4).toString('hex').toUpperCase(); while (b[id]);   // never overwrite another code's record
  const rec: Rec = { id, phone, purpose, hash: '', enc: sealCode(code, id), exp: now + OTP_TTL_MS, createdAt: now, tries: 0, ...(ip ? { ip } : {}) };
  rec.hash = hm(rec, code); b[id] = rec; db.save();
  return { ok: true, ref: id, code, expiresInSec: OTP_TTL_MS / 1000, cooldownSec: COOLDOWN_S, wa: waLink(id) };
}

const wrongByIp = new Map<string, { n: number; reset: number }>();
const WRONG_PER_IP = 30, WRONG_WINDOW = 3600_000;
/** S4: one device cannot burn many codes — 30 wrong guesses per IP per hour across every ref. */
const ipWrongWait = (ip: string | undefined, now: number) => { const b = ip && wrongByIp.get(ip); return b && b.reset > now && b.n >= WRONG_PER_IP ? Math.ceil((b.reset - now) / 1000) : 0; };
const ipWrongCount = (ip: string | undefined, now: number) => {
  if (!ip) return; let b = wrongByIp.get(ip);
  if (!b || b.reset <= now) { if (wrongByIp.size > 5000) for (const [k, v] of wrongByIp) if (v.reset <= now) wrongByIp.delete(k); b = { n: 0, reset: now + WRONG_WINDOW }; wrongByIp.set(ip, b); }
  b.n += 1;
};
/** Check a code. consume=false lets the caller finish its own checks first, then call useOtp(). */
export function checkOtp(ref: unknown, phone: string, purpose: OtpPurpose, code: unknown, now = Date.now(), consume = true, ip?: string): { ok: true } | OtpFail {
  if (ip) ip = ipKey(ip);
  const ipw = ipWrongWait(ip, now);
  if (ipw) return fail(429, 'IP_WRONG', 'Too many wrong codes from this device. Try again later.', 'इस डिवाइस से बहुत ग़लत कोड आज़माए गए। बाद में कोशिश करें।', ipw);
  const rec = typeof ref === 'string' ? book()[ref] : undefined;
  if (!rec || rec.phone !== phone || rec.purpose !== purpose) return fail(400, 'NO_CODE', 'Ask for a code first.', 'पहले कोड माँगें।');
  if (rec.lockedUntil && rec.lockedUntil > now) { const w = Math.ceil((rec.lockedUntil - now) / 1000); return fail(429, 'LOCKED', `Too many wrong codes. Try again in ${Math.ceil(w / 60)} minute(s).`, `बहुत ग़लत कोड। ${Math.ceil(w / 60)} मिनट बाद कोशिश करें।`, w); }
  if (rec.used) return fail(400, 'USED', 'That code was already used — ask for a new one.', 'यह कोड पहले इस्तेमाल हो चुका — नया कोड माँगें।');
  if (rec.exp < now) return fail(400, 'EXPIRED', 'The code has expired — ask for a new one.', 'कोड की मियाद ख़त्म — नया कोड माँगें।');
  if (!safeEqual(rec.hash, hm(rec, String(code ?? '').replace(/\D/g, '')))) {
    rec.tries += 1; ipWrongCount(ip, now);
    if (rec.tries >= MAX_TRIES) { rec.lockedUntil = now + LOCK_MS; rec.used = true; rec.locked = true; rec.enc = ''; db.appendAuditEvent('system', 'SUPERADMIN', 'SYSTEM', rec.id, 'OTP_PHONE_LOCKED', `${rec.purpose} code for ••••${rec.phone.slice(-4)} locked for 15 min after ${MAX_TRIES} wrong guesses`); db.save(); return fail(429, 'LOCKED', 'Too many wrong codes. Try again in 15 minute(s).', 'बहुत ग़लत कोड। 15 मिनट बाद कोशिश करें।', LOCK_MS / 1000); }
    db.save(); const left = MAX_TRIES - rec.tries;
    return fail(400, 'WRONG_CODE', `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`, `कोड सही नहीं है। ${left} कोशिश बाकी।`);
  }
  if (consume) useOtp(ref as string);
  return { ok: true };
}
export function useOtp(ref: string) { const r = book()[ref]; if (r) { r.used = true; r.enc = ''; db.save(); } }

/** Shared "ask for a code" answer: identical for every phone. `deliver` sends it where it must go (SMS in sms mode, the admin screen in manual mode). */
export function requestView(r: OtpView & { code: string }, phone: string, purpose: OtpPurpose, knownAccount = false) {
  const mode = otpMode();
  if (mode === 'sms') { if (knownAccount) void sendSms(phone, `GENZ: your code is ${r.code} (valid 10 minutes). Do not share it.`).catch(() => undefined); }
  return { success: true, mode, ref: r.ref, expiresInSec: r.expiresInSec, cooldownSec: r.cooldownSec, ...(mode === 'manual' ? { wa: r.wa, waSet: !!r.wa } : {}), ...(DEMO_MODE && purpose !== 'reset' && (mode === 'demo' || (mode === 'sms' && !smsGateway())) ? { devCode: r.code } : {}), purpose };
}
export const failBody = (f: OtpFail) => ({ error: f.error, errorHi: f.errorHi, code: f.code, ...(f.wait ? { wait: f.wait } : {}) });

// ───────────────────────── forgot password ─────────────────────────
export function createForgotRouter() {
  const r = Router();
  r.post('/request', rateLimit('forgot-ip', 20, 3600_000), (req: Request, res: Response) => {
    const phone = digits(String(req.body?.phone || '')).slice(-10);
    if (!PHONE_RE.test(phone)) return res.status(400).json(failBody(fail(400, 'BAD_PHONE', 'Enter your 10-digit mobile number', '10 अंकों का मोबाइल नंबर लिखें')));
    const g = ipPhoneGate(req.ip, phone); if (g) return res.status(g.status).json(failBody(g));
    // a staff number gets a record too (same limits, same answer) but the relay screen never shows it, see below
    const out = issueOtp(phone, 'reset', Date.now(), req.ip);
    if (!out.ok) return res.status(out.status).json(failBody(out));
    // sms mode texts only a real account; the answer (and its timing, the text is not awaited) is the same for everyone
    const known = db.getState().users.some(u => digits(u.phone) === phone && u.verificationStatus !== 'BLACKLISTED');
    res.json(requestView(out, phone, 'reset', known));
  });
  r.post('/reset', rateLimit('forgot-reset-ip', 30, 3600_000), (req: Request, res: Response) => {
    const phone = digits(String(req.body?.phone || '')).slice(-10);
    const problem = passwordPolicyError(req.body?.password);
    if (problem) return res.status(400).json({ error: problem, code: 'WEAK_PASSWORD' });
    const c = checkOtp(req.body?.ref, phone, 'reset', req.body?.code, Date.now(), true, req.ip);
    if (!c.ok) return res.status(c.status).json(failBody(c));
    const hash = hashPassword(String(req.body.password));   // always hashed, so an unknown number costs the same time
    if (otpMode() === 'manual' && isStaffPhone(phone)) {   // staff: no reset through the WhatsApp relay; the page tells them to ask a SUPERADMIN
      db.appendAuditEvent('system', 'SUPERADMIN', 'SYSTEM', phone.slice(-4), 'STAFF_RESET_BLOCKED', `A mobile-code password reset for a staff number (••${phone.slice(-4)}) was refused; a SUPERADMIN must do it`);
      return res.json({ success: true });
    }
    const hits = db.getState().users.filter(u => digits(u.phone).slice(-10) === phone && u.verificationStatus !== 'BLACKLISTED' && !(u as any).selfSignup);
    if (hits.length === 1) {
      const u = hits[0]; u.passwordHash = hash; u.mustChangePassword = false; u.sessionVersion = (u.sessionVersion || 1) + 1; stampPhone(u, db.getState(), 'password-reset code'); db.save();   // the reset code proved he holds this number (not stamped if another live account verified it first)   // every other session is signed out
      db.appendAuditEvent(u.id, u.role, 'SYSTEM', u.id, 'PASSWORD_RESET_OTP', `Password reset with a mobile code (••${phone.slice(-4)}); all sessions revoked`);
    }
    res.json({ success: true });   // same answer whether or not the number has an account
  });
  return r;
}

// ───────────────────────── admin: pending codes (manual mode) ─────────────────────────
/** the message the admin sends to the number ON RECORD (never a reply to an inbound chat): proves the person holds that phone */
const relayLink = (phone: string, code: string) => `https://wa.me/91${phone}?text=${encodeURIComponent(`GENZ code: ${code} (valid 10 minutes). Do not share it with anyone. / GENZ कोड: ${code} (10 मिनट तक मान्य)। किसी को न बताएँ।`)}`;
export function createOtpAdminRouter() {
  const r = Router();
  r.get('/', needs('otp:relay'), (_req: Request, res: Response) => {
    const u = ctx().user; const now = Date.now(); const out: unknown[] = []; let dirty = false; const mine = digits(u.phone || '').slice(-10);
    res.setHeader('Cache-Control', 'no-store');
    const manual = otpMode() === 'manual';
    for (const rec of manual ? Object.values(book()).sort((a, b) => b.createdAt - a.createdAt) : []) {
      if (rec.used || rec.exp < now || !rec.enc) continue;
      if (rec.phone === mine || isStaffPhone(rec.phone)) continue;   // never your own code, never a staff number's
      const code = openCode(rec.enc, rec.id); if (!code) continue;
      if (!(rec.viewedBy ||= []).includes(u.id)) { rec.viewedBy.push(u.id); dirty = true; db.appendAuditEvent(u.id, u.role, 'SYSTEM', rec.id, 'OTP_CODE_VIEWED', `Viewed pending ${rec.purpose} code ${rec.id} and the full number ••••${rec.phone.slice(-4)} to send it on WhatsApp to that number`); }
      out.push({ ref: rec.id, phone: rec.phone, phoneMasked: `••••••${rec.phone.slice(-4)}`, purpose: rec.purpose, ageSec: Math.floor((now - rec.createdAt) / 1000), expiresInSec: Math.floor((rec.exp - now) / 1000), code, sendLink: relayLink(rec.phone, code), sent: (rec.sent || []).length > 0 });
    }
    if (dirty) db.save();
    res.json({ success: true, mode: otpMode(), pending: out, dailyCap: dailyCap(), usedToday: Object.keys(book()).length });
  });
  /** the admin tapped "Send to this number" — keep a record of which number the code went to */
  r.post('/:ref/sent', needs('otp:relay'), (req: Request, res: Response) => {
    const u = ctx().user; const rec = book()[String(req.params.ref)];
    if (otpMode() !== 'manual') return res.status(409).json({ error: 'Manual code relay is off.', errorHi: 'मैन्युअल कोड रिले बंद है।' });
    if (!rec || rec.used || rec.exp < Date.now() || rec.phone === digits(u.phone || '').slice(-10) || isStaffPhone(rec.phone)) return res.status(404).json({ error: 'That code is no longer pending.', errorHi: 'यह कोड अब लंबित नहीं है।' });
    if ((rec.sent ||= []).includes(u.id)) return res.json({ success: true, already: true });   // tapping twice must not write a second record
    rec.sent.push(u.id); db.save();
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', rec.id, 'OTP_CODE_SENT_TO_NUMBER', `Sent ${rec.purpose} code ${rec.id} on WhatsApp to the number on record ••••${rec.phone.slice(-4)}`);
    res.json({ success: true });
  });
  return r;
}
