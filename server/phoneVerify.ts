/**
 * D23 round 11 — "verify my phone": a signed-in user proves he holds the number on his account with a mobile code.
 * Only this (or a sign-up / owner sign-in / password-reset code) sets `phoneVerifiedAt`, which is what ties him to the visits booked on his number.
 */
import { Router, Request, Response } from 'express';
import { db } from './db.js';
import { ctx, requireAuth, rateLimit, digits } from './auth.js';
import { sendSignupOtp, checkOtpToken, OTP_HI } from './ownerlist.js';
import { phoneVerifiedElsewhere } from './access.js';

const TAKEN = { error: 'This mobile number is already verified on another GENZ account.', errorHi: 'यह मोबाइल नंबर पहले से किसी दूसरे GENZ अकाउंट पर वेरिफ़ाई है।', code: 'PHONE_TAKEN' };

export function createPhoneVerifyRouter() {
  const r = Router();
  const mine = () => { const u = ctx().user; return { u, ten: digits(u.phone).slice(-10) }; };
  r.get('/status', requireAuth, (_req: Request, res: Response) => { const { u, ten } = mine(); res.json({ success: true, verified: !!u.phoneVerifiedAt, hasPhone: ten.length === 10 }); });
  r.post('/send', requireAuth, rateLimit('phone-verify-send', 10, 3600_000), async (req: Request, res: Response) => {
    const { u, ten } = mine();
    if (u.phoneVerifiedAt) return res.json({ success: true, already: true });
    if (ten.length !== 10) return res.status(400).json({ error: 'Add a 10-digit mobile number to your profile first.', errorHi: 'पहले अपनी प्रोफ़ाइल में 10 अंकों का मोबाइल नंबर जोड़ें।', code: 'NO_PHONE' });
    if (phoneVerifiedElsewhere(u.phone, db.getState(), u.id)) return res.status(409).json(TAKEN);
    const o = await sendSignupOtp(ten, req.ip);
    if ('error' in o) return res.status(o.status).json({ error: o.error, errorHi: o.errorHi, code: o.code, wait: o.wait });
    res.json({ success: true, ...o });
  });
  r.post('/confirm', requireAuth, rateLimit('phone-verify-confirm', 20, 3600_000), (req: Request, res: Response) => {
    const { u, ten } = mine();
    if (u.phoneVerifiedAt) return res.json({ success: true, already: true });
    if (ten.length !== 10) return res.status(400).json({ error: 'Add a 10-digit mobile number to your profile first.', errorHi: 'पहले अपनी प्रोफ़ाइल में 10 अंकों का मोबाइल नंबर जोड़ें।', code: 'NO_PHONE' });
    if (phoneVerifiedElsewhere(u.phone, db.getState(), u.id)) return res.status(409).json(TAKEN);
    const e = checkOtpToken(req.body?.otpToken, ten, String(req.body?.otpCode || ''), true, req.ip);   // the code is for THIS number only; spent on success
    if (e) return res.status(400).json({ error: e, errorHi: OTP_HI[e], code: 'OTP' });
    const full = db.byId('users', u.id); if (!full) return res.status(404).json({ error: 'Account not found' });
    full.phoneVerifiedAt = new Date().toISOString(); db.save();
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', u.id, 'PHONE_VERIFIED', `Mobile ••${ten.slice(-4)} verified with a code`);
    res.json({ success: true, verified: true });
  });
  return r;
}
