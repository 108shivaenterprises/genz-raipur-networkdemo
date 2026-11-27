/**
 * v185 (D15) — open sign-up (SIGNUP_MODE=open, the default): choose a role, give a mobile number, confirm it with the OTP, then name + city + PAN.
 * The account is LIVE at once in the Basic tier (verificationStatus VERIFIED + basicTier): it can browse, chat and keep its own listings / clients,
 * but deals, commission, money, broadcasts and inviting others stay locked (permissions.ts BASIC_LOCKED) and its listings stay private until an admin
 * approves its KYC. SIGNUP_MODE=invite turns these routes off and the invitation-code sign-up is the only way in (the reversal).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db, type UserProfile } from './db.js';
import { ctx, rateLimit, hit, ipKey, hashPassword, passwordPolicyError, setSessionCookie, signSession, digits } from './auth.js';
import { signupMode } from './features.js';
import { sendSignupOtp, checkOtpToken, finishSignupOtp } from './ownerlist.js';
import { phoneSchema } from './validation.js';
import { normPan, isValidPan, maskPan, panHeldByApproved } from './kyc.js';
import { connectorProfileSchema } from './connector.js';
import { publicUser } from './access.js';
import { effectivePermissions, isVerifiedFull } from './permissions.js';
import { POLICY_VERSION } from './privacy.js';
import { alert } from './alerts.js';
import { normCity } from '../src/shared/cities.js';
import { canonPlace } from '../src/shared/places.js';
import { findState } from '../src/shared/india.js';
import { stateFor } from './consent.js';

export const OPEN_ROLES = ['BROKER', 'DEVELOPER_BUILDER', 'GENZ_CONNECTOR'] as const;
const DAY = 86400_000;
/** signups made per IP in the last day (counted when an account is made, not when it is tried) */
const made = new Map<string, number[]>();
export const ipSignupCap = () => { const n = Number(process.env.SIGNUP_IP_DAILY_CAP); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10; };
/** v191 (D3): hourly — forget IPs whose signups are all older than a day (the map would only ever grow) */
export function pruneSignupCounters(now = Date.now()): number { let n = 0; for (const [ip, a] of made) if (!a.some(t => t > now - DAY)) { made.delete(ip); n++; } return n; }
const ipCount = (ip: string, now = Date.now()) => { const a = (made.get(ip) || []).filter(t => t > now - DAY); if (a.length) made.set(ip, a); else made.delete(ip); return a.length; };   // single server instance (the Docker prod path): counters live in memory like every other limiter
let lastDigestAt = 0;
/** the text the person agreed to; its hash is stored with the consent so we can show which notice was accepted */
export const OPEN_NOTICE = 'GENZ may use my mobile number, name, city and PAN to run my account and to check my KYC. My PAN is kept only while the account is being verified and is cleared if I do no KYC for 180 days.';

const schema = z.object({
  role: z.enum(OPEN_ROLES),
  name: z.string().trim().min(2, 'Name is required').max(120),
  phone: phoneSchema,
  otpToken: z.string().max(400),
  otpCode: z.string().max(12),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  locality: z.string().trim().max(80).optional(),
  panNumber: z.string().trim().max(20).optional(),
  password: z.string().max(128),
  companyName: z.string().trim().max(160).optional(),
  shopType: z.string().max(40).optional(),
  shopName: z.string().trim().max(100).optional(),
  payoutUpi: z.string().trim().max(80).optional(),
  consent: z.literal(true, { message: 'You must accept the Privacy Policy and Terms to join' }),
  /** a separate tick for keeping the PAN (DPDP: its own purpose) */
  panConsent: z.boolean().optional(),
  /** v201 — mandatory shop/office photo (data URI) and GPS location for BROKER, DEVELOPER_BUILDER, GENZ_CONNECTOR */
  officePhoto: z.string().max(1_200_000).optional(),
  officeLocation: z.object({
    lat: z.number(),
    lng: z.number(),
    acc: z.number().optional(),
    address: z.string().trim().max(240).optional(),
  }).optional(),
});

const OFFICE_PROOF_DIR = () => path.resolve(process.cwd(), 'data', 'office-proofs');
const officeProofFile = (userId: string) => path.join(OFFICE_PROOF_DIR(), `${userId.replace(/[^A-Za-z0-9_-]/g, '')}.jpg`);
function parseOfficePhoto(raw?: string): Buffer | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.replace(/^data:image\/(?:jpeg|jpg|png|webp);base64,/i, '');
  if (!cleaned || cleaned.length > 1_100_000) return null;
  const buf = Buffer.from(cleaned, 'base64');
  if (!buf.length || buf.length > 800 * 1024) return null;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  return isJpg || isPng ? buf : null;
}

const err = (res: Response, status: number, code: string, error: string, errorHi: string, extra: object = {}) => res.status(status).json({ error, errorHi, code, ...extra });
const closed = (res: Response) => err(res, 403, 'SIGNUP_INVITE_ONLY', 'Sign-up is by invitation right now. Ask a GENZ member for an invitation code.', 'अभी साइन-अप केवल आमंत्रण से है। किसी GENZ सदस्य से आमंत्रण कोड माँगें।');

export function createOpenSignupRouter() {
  const r = Router();

  r.post('/signup-otp', rateLimit('signup-otp-ip', 20, 3600_000), async (req: Request, res: Response) => {
    if (signupMode() !== 'open') return closed(res);
    const o = await sendSignupOtp(String(req.body?.phone || '').replace(/\D/g, '').slice(-10), req.ip, 'open');
    if ('error' in o) return res.status(o.status).json({ error: o.error, errorHi: o.errorHi, code: o.code, wait: o.wait });
    res.json({ success: true, ...o });
  });

  r.post('/signup', rateLimit('signup-ip-try', 20, 3600_000), (req: Request, res: Response) => {
    if (signupMode() !== 'open') return closed(res);
    const ip = ipKey(req.ip);
    const cap = ipSignupCap();
    if (ipCount(ip) >= cap) return err(res, 429, 'SIGNUP_IP_CAP', `Too many accounts were made from this device today (${cap}). Try again tomorrow, or ask GENZ for help.`, `आज इस डिवाइस से बहुत अकाउंट बन चुके हैं (${cap})। कल फिर कोशिश करें, या GENZ से मदद माँगें।`);
    const p = schema.safeParse(req.body);
    if (!p.success) return err(res, 400, 'BAD_INPUT', p.error.issues[0]?.message || 'Please check the details', 'कृपया जानकारी जाँचें');
    const d = p.data; const phone = digits(d.phone).slice(-10); const st = db.getState();
    const pw = passwordPolicyError(d.password); if (pw) return err(res, 400, 'WEAK_PASSWORD', pw, 'पासवर्ड कमज़ोर है — 10+ अक्षर, बड़ा, छोटा और अंक रखें।');
    const pan = normPan(d.panNumber);
    const needsPan = d.role === 'BROKER' || d.role === 'DEVELOPER_BUILDER';
    if (needsPan && !pan) return err(res, 400, 'PAN_REQUIRED', 'Enter your PAN (e.g. ABCPD1234E).', 'अपना PAN डालें (जैसे ABCPD1234E)।');
    if (pan && !isValidPan(pan)) return err(res, 400, 'PAN_INVALID', 'PAN format is invalid (e.g. ABCPD1234E).', 'PAN का फ़ॉर्मेट सही नहीं है (जैसे ABCPD1234E)।');
    if (pan && d.panConsent !== true) return err(res, 400, 'PAN_CONSENT_REQUIRED', 'Please tick that GENZ may keep your PAN to check your KYC.', 'कृपया सहमति दें कि GENZ आपका PAN KYC जाँचने के लिए रखे।');
    const city = normCity(d.city);
    if (d.role !== 'GENZ_CONNECTOR' && !city) return err(res, 400, 'CITY_REQUIRED', 'Your city is required — GENZ matches clients and homes city by city.', 'अपना शहर चुनें — GENZ क्लाइंट और घर शहर के हिसाब से मिलाता है।');
    // v201 — mandatory shop/office photo and GPS location for Broker, Builder/Developer, and Shopkeeper
    const photoBuf = parseOfficePhoto(d.officePhoto);
    if (!photoBuf) return err(res, 400, 'OFFICE_PHOTO_REQUIRED', 'Shop / office photo is mandatory to create an ID so GENZ can verify flags.', 'आईडी बनाने के लिए दुकान / ऑफ़िस की फ़ोटो अनिवार्य है ताकि शिकायत आने पर GENZ जाँच कर सके।');
    const loc = d.officeLocation;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng) || loc.lat < 6 || loc.lat > 38 || loc.lng < 68 || loc.lng > 98) {
      return err(res, 400, 'OFFICE_LOCATION_REQUIRED', 'Valid shop / office GPS location is mandatory to create an ID.', 'आईडी बनाने के लिए दुकान / ऑफ़िस की सही लोकेशन (GPS) अनिवार्य है।');
    }
    let connector: UserProfile['connector'];
    if (d.role === 'GENZ_CONNECTOR') {
      const cp = connectorProfileSchema.safeParse({ shopType: d.shopType, shopName: d.shopName, locality: d.locality || undefined, payoutUpi: d.payoutUpi || undefined });
      if (!cp.success) return err(res, 400, 'BAD_INPUT', cp.error.issues[0]?.message || 'Shop details are required', 'दुकान की जानकारी ज़रूरी है');
      connector = { ...cp.data, payoutUpi: cp.data.payoutUpi || undefined, whatsapp: phone };
    }
    // everything the person can fix is checked BEFORE the code, so a typo never burns a one-time code
    const otpErr = checkOtpToken(d.otpToken, phone, d.otpCode, false, req.ip, 'open');   // looked at now, spent only when the account exists
    if (otpErr) return err(res, 400, 'OTP', otpErr, 'मोबाइल कोड सही नहीं है या पुराना हो गया — नया कोड माँगें।');
    // the phone was just proven by the OTP, so telling its owner "already registered" gives nothing away
    if (st.users.some(u => digits(u.phone).slice(-10) === phone)) return err(res, 409, 'DUPLICATE_PHONE', 'This mobile number already has a GENZ account. Sign in with it, or use "Forgot password".', 'इस मोबाइल नंबर का GENZ अकाउंट पहले से है। इसी से साइन इन करें, या "पासवर्ड भूल गए" चुनें।');
    // a PAN is a CLAIM until KYC: only a KYC-approved holder blocks it (two Basic claims may coexist; the first to reach approval with a document wins). The answer never says a PAN is registered; every refusal is audited.
    if (pan) {
      const probe = hit(`open-pan:${ip}|${pan}`, 3, DAY) || hit(`open-pair:${phone}|${pan}`, 5, DAY);
      const held = panHeldByApproved(st.users, pan);
      if (probe || held) {
        db.appendAuditEvent('system', 'SUPERADMIN', 'VERIFICATION', 'signup', 'SIGNUP_PAN_REFUSED', `Open sign-up refused for PAN ${maskPan(pan)} (${probe ? 'too many tries' : 'already held by a KYC-approved account'}) from ${ip}`);
        return err(res, probe ? 429 : 409, probe ? 'SIGNUP_PAN_TRIES' : 'CANNOT_REGISTER', 'We could not create an account with these details. Check them, or contact GENZ.', 'इन विवरणों से अकाउंट नहीं बन सका। जानकारी जाँचें, या GENZ से संपर्क करें।');
      }
    }
    const now = new Date().toISOString(); const id = `USR-${d.role.slice(0, 3)}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const u: UserProfile = {
      id, name: d.name, email: `${phone}@phone.genz.local`, phone, role: d.role, city, state: findState(d.state)?.name || stateFor('', city) || undefined,
      ...(d.locality ? { homeLocality: canonPlace(city, d.locality) } : {}),
      companyName: d.companyName || connector?.shopName || '', connector, reraNumber: '', panNumber: pan || undefined,
      consent: { policyVersion: POLICY_VERSION, acceptedAt: now, ip: req.ip, ua: String(req.headers['user-agent'] || '').slice(0, 200), noticeHash: crypto.createHash('sha256').update(OPEN_NOTICE).digest('hex').slice(0, 16) },
      ...(pan ? { idConsentAt: now } : {}),
      verificationStatus: 'VERIFIED', basicTier: true, signupMode: 'open', autoVerifiedAt: now, autoVerifiedBy: 'OPEN_SIGNUP',
      verificationNotes: 'Live at open sign-up (Basic): mobile OTP + PAN. Not KYC-verified — deals, money, broadcasts and invites are locked until an admin approves the PAN / RERA document.',
      officeProof: { photo: true, lat: loc.lat, lng: loc.lng, ...(Number.isFinite(loc.acc) ? { acc: loc.acc } : {}), ...(loc.address ? { address: loc.address } : {}), at: now },
      createdAt: now, passwordHash: hashPassword(d.password), sessionVersion: 1,
    };
    try { fs.mkdirSync(OFFICE_PROOF_DIR(), { recursive: true }); fs.writeFileSync(officeProofFile(id), photoBuf); } catch (e: any) { console.error('[SIGNUP] office photo save failed:', e?.message || e); }
    st.users.push(u); finishSignupOtp(d.otpToken); made.set(ip, [...(made.get(ip) || []), Date.now()]);
    db.save();
    db.appendAuditEvent(id, u.role, 'VERIFICATION', id, 'OPEN_SIGNUP', `${d.name} signed up (${u.role}) with mobile OTP${pan ? ` + PAN ${maskPan(pan)}` : ''}`);
    db.appendAuditEvent(id, u.role, 'VERIFICATION', id, 'BASIC_AUTO_LIVE', `${d.name} is live in the Basic tier — not KYC-verified; admins can suspend in one tap`);
    // one digest per hour, not one alert per sign-up (a flood must not flood the admins too)
    if (Date.now() - lastDigestAt > 3600_000) {
      lastDigestAt = Date.now();
      const n = st.users.filter(x => x.basicTier && Date.parse(x.createdAt) > Date.now() - 3600_000).length;
      alert(st.users.filter(a => (a.role === 'ADMIN' || a.role === 'SUPERADMIN') && isVerifiedFull(a)).slice(0, 20).map(a => a.id), 'deals', `New Basic members (${n} in the last hour)`, 'Live without KYC — check or suspend them in Invite & KYC', '/?tab=onboarding', { tag: 'basic-signups', hi: [`नए बेसिक सदस्य (पिछले घंटे में ${n})`, 'बिना KYC चालू — Invite & KYC में जाँचें या सस्पेंड करें'] });
    }
    setSessionCookie(req, res, signSession(id, 1));
    res.json({ success: true, basic: true, user: publicUser(u), permissions: effectivePermissions(u) });
  });

  /** v201 — GENZ admins (or the account owner) can inspect the stored shop/office photo when reviewing flags */
  r.get('/office-proof/:userId', (req: Request, res: Response) => {
    const caller = ctx().user as UserProfile | null;
    if (!caller) return res.status(401).json({ error: 'Login required' });
    const targetId = String(req.params.userId || '');
    if (caller.id !== targetId && !['ADMIN', 'SUPERADMIN'].includes(caller.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      const buf = fs.readFileSync(officeProofFile(targetId));
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.type('image/jpeg').send(buf);
    } catch {
      res.status(404).json({ error: 'Office proof photo not found' });
    }
  });
  return r;
}

/** v186b (D16) — one-time, idempotent boot migration: accounts that went live through OTP + PAN (v141) or open sign-up, and whose ID nobody has seen, become Basic.
 *  Seeded / demo accounts carry no `autoVerifiedBy` of these kinds, owner OTP-only accounts are a different path, and staff are never touched. BASIC_MIGRATION=off skips it. */
/** v190 (D17): once, reset the old default "RERA required = ON" so a broker without RERA can be approved as Tier 2. An admin who switches it ON afterwards keeps it. */
export function migrateReraSetting(): number {
  const s = db.getState().settings; if (s.reraTier2Default) return 0;
  s.requireReraForBrokerApproval = false; s.reraTier2Default = true; db.save(); return 1;
}

export function migrateBasicTier(): number {
  if (String(process.env.BASIC_MIGRATION || '').toLowerCase() === 'off') return 0;
  const st = db.getState(); let n = 0;
  for (const u of st.users) {
    if (u.basicTier || u.idCheckedAt || !['OTP_PAN', 'OPEN_SIGNUP'].includes(String(u.autoVerifiedBy)) || u.verificationStatus !== 'VERIFIED') continue;
    if (['ADMIN', 'SUPERADMIN', 'PROPERTY_OWNER', 'TEAM_MEMBER'].includes(u.role)) continue;
    // an admin already approved this account (it has a broker id, or a USER_APPROVE audit event): leave it verified
    if (u.brokerId || (st.auditEvents || []).some((e: any) => e.entityId === u.id && e.action === 'USER_APPROVE')) continue;
    u.basicTier = true; n++;
    db.appendAuditEvent('system', 'SUPERADMIN', 'VERIFICATION', u.id, 'BASIC_MIGRATED', `${u.name} moved to Basic: went live by OTP + PAN and nobody has seen the ID yet`);
  }
  if (n) db.save();
  return n;
}
