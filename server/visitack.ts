/**
 * v33 — Visit acknowledgement ("no direct deal").   /api/visit-acks  (the broker)   +   public page /a/:token  (the buyer)
 *
 * Before a buyer gets the visit QR / code he must (1) tick a promise — he came through this broker and will not deal directly with the
 * owner / builder without him during the protection period — and (2) confirm his own mobile with a code (SMS when a gateway is set,
 * otherwise the broker reads it out). Until both are done the QR does not show and the visit cannot be verified.
 *   PASS  = builder-project visit pass  (the buyer link is the usual /v/<code>, which sends him here first)
 *   VISIT = broker-to-broker site visit (the buyer link is /a/<token>; after the acknowledgement he sees his QR + code)
 * Only visits created from v33 on carry an acknowledgement; older ones keep working as they were.
 * The buyer's mobile is kept as an HMAC + last 4 digits. The wording is versioned so a dispute can show what he agreed to.
 */
import { Router, type Request, type Response } from 'express';
import express from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { db } from './db.js';
import type { UserProfile, VisitAck } from './db.js';
import { ctx, needs, rateLimit, secret, hit, secureOtp, safeEqual } from './auth.js';
import { can } from './permissions.js';
import { sendSms } from './notify.js';
import { pushTo } from './webpush.js';
import { ACK_VERSION, ACK_LIMITS, ACK_NOTE, ackText, type AckKind } from '../src/shared/visitAckRules.js';
import { qrPayload, scanLine } from '../src/shared/visitRules.js';

const st = () => db.getState();
const nowIso = () => new Date().toISOString();
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const hmac = (tag: string, v: string) => crypto.createHmac('sha256', secret()).update(`${tag}|${v}`).digest('hex');
const phone10 = (p: unknown) => String(p ?? '').replace(/\D/g, '').slice(-10);
const PHONE_RE = /^[6-9]\d{9}$/;
const smsOn = () => !!process.env.SMS_WEBHOOK_URL;
const bad = (res: Response, error: string, status = 400) => res.status(status).json({ error });

// ───────────────────────────── used by the other modules ─────────────────────────────
const tokenOf = (a: VisitAck) => { const h = a.id.slice(4); return `${h}-${hmac('va-token', a.id).slice(0, 24)}`; };
export const ackBase = (a: VisitAck) => `/a/${tokenOf(a)}`;
export const ackFor = (kind: AckKind, refId: string) => st().visitAcks.find(a => a.kind === kind && a.refId === refId);
export const ackStatus = (kind: AckKind, refId: string): 'NONE' | 'PENDING' | 'ACKED' => ackFor(kind, refId)?.status || 'NONE';
/** the buyer link the broker sends (PASS → the usual pass link, which gates itself; VISIT → the acknowledgement page) */
export const ackLinkFor = (a: VisitAck, passCode?: string) => a.kind === 'PASS' && passCode ? `/v/${passCode}` : `/a/${tokenOf(a)}`;
/** a message when the visit may NOT go on yet because the buyer has not acknowledged; undefined = fine (done, or an older visit with none) */
export function ackBlock(kind: AckKind, refId: string): string | undefined {
  const a = ackFor(kind, refId);
  if (!a || a.status === 'ACKED') return undefined;
  return 'The buyer has not yet confirmed the “no direct deal” acknowledgement (tick + mobile code) — send him the link first. / खरीदार ने अभी “सीधा सौदा नहीं” की सहमति नहीं दी — पहले उसे लिंक भेजें।';
}
/** one acknowledgement per visit; none when the buyer's mobile is not a valid Indian mobile (the screens then warn the broker) */
export function createAck(a: { kind: AckKind; refId: string; phone?: string; buyerName: string; brokerId: string; subject: string }): VisitAck | null {
  const phone = phone10(a.phone); if (!PHONE_RE.test(phone)) return null;
  const old = ackFor(a.kind, a.refId); if (old) return old;
  const broker = db.byId('users', a.brokerId) as UserProfile | undefined;
  const ack: VisitAck = {
    id: `VAK-${crypto.randomBytes(5).toString('hex')}`, kind: a.kind, refId: a.refId, phoneKey: hmac('va-phone', phone), phoneLast4: phone.slice(-4),
    buyerName: a.buyerName, brokerId: a.brokerId, brokerName: broker?.name || 'your broker', subject: a.subject, textVersion: ACK_VERSION, status: 'PENDING', createdAt: nowIso(),
  };
  st().visitAcks.unshift(ack);
  db.appendAuditEvent('SYSTEM', 'SUPERADMIN', 'VISIT', a.refId, 'VISIT_ACK_REQUESTED', `“No direct deal” acknowledgement requested from ${a.buyerName} (••${ack.phoneLast4}) for ${a.subject}, introduced by ${ack.brokerName}. Wording ${ACK_VERSION}.`);
  if (smsOn()) void sendSms(`+91${phone}`, `GENZ: ${ack.brokerName} has arranged your property visit. Open this link to confirm and get your visit pass: ${process.env.PUBLIC_URL || ''}${ackLinkFor(ack)}`);
  return ack;
}
export const sweepVisitAcks = () => {
  // an unfinished request older than 120 days is just noise; an acknowledged one is evidence and stays
  const cut = Date.now() - 120 * 86400_000; const s = st(); const before = s.visitAcks.length;
  s.visitAcks = s.visitAcks.filter(a => a.status === 'ACKED' || Date.parse(a.createdAt) > cut);
  if (s.visitAcks.length !== before) db.save();
};

// ───────────────────────────── broker API ─────────────────────────────
const me = () => ctx().user as UserProfile;
/** may the caller look after this visit's acknowledgement? — the broker who made it, or the one who owns the lead; admins read. */
function mayManage(a: VisitAck): boolean {
  const u = me();
  if (u.role === 'SUPERADMIN' || u.role === 'ADMIN') return true;
  if (a.brokerId === u.id) return true;
  if (u.role === 'TEAM_MEMBER' && u.employerId === a.brokerId) return true;
  return false;
}
export function createVisitAckRouter() {
  const r = Router();
  r.get('/:kind/:refId', (req: Request, res: Response) => {
    if (!(ctx().user as UserProfile | null)?.id) return bad(res, 'Sign in first', 401);
    const kind = String(req.params.kind).toUpperCase() as AckKind;
    if (!['PASS', 'VISIT'].includes(kind)) return bad(res, 'Unknown kind', 404);
    if (!(can(me() as any, 'visit:pass') || can(me() as any, 'sitevisit:read'))) return bad(res, 'Not allowed', 403);
    const a = ackFor(kind, String(req.params.refId));
    if (!a || !mayManage(a)) return res.json({ success: true, ack: null });
    const pass = kind === 'PASS' ? db.byId('visitPasses', a.refId) : undefined;
    const waiting = a.status === 'PENDING' && a.otpPlain && a.otpExpires && Date.parse(a.otpExpires) > Date.now() ? a.otpPlain : undefined;
    res.json({ success: true, ack: {
      id: a.id, status: a.status, buyerName: a.buyerName, phoneLast4: a.phoneLast4, createdAt: a.createdAt, tickedAt: a.tickedAt, ackedAt: a.ackedAt, textVersion: a.textVersion,
      link: ackLinkFor(a, pass?.code), page: ackBase(a), /** only when no SMS gateway is set: the code the buyer has just asked for — the broker reads it out */ codeForBuyer: waiting, smsOn: smsOn(),
    } });
  });
  return r;
}

// ───────────────────────────── the buyer's page (no login: link + tick + mobile code) ─────────────────────────────
const CSS = `*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f5f2;color:#1b1b1b}.w{max-width:520px;margin:0 auto;padding:14px}
.top{background:#14213d;color:#fff;border-radius:16px;padding:16px}.top h1{margin:0 0 4px;font-size:18px}.top p{margin:0;opacity:.85;font-size:13px}
.card{background:#fff;border-radius:14px;padding:14px;margin-top:12px;box-shadow:0 1px 2px rgba(0,0,0,.06)}.warn{background:#fff6e5}.ok{background:#e9f7ee}
p.t{font-size:14px;line-height:1.55;margin:6px 0}p.h{font-size:15px;line-height:1.6;margin:6px 0}.small{color:#666;font-size:12px}
.pro{background:#f3f6fb;border-left:4px solid #14213d;border-radius:8px;padding:10px 12px;margin:10px 0}
label{display:block;font-size:13px;font-weight:600;margin:10px 0 4px}label.k{display:flex;gap:10px;align-items:flex-start;font-size:14px;font-weight:600}label.k input{width:22px;height:22px;flex:none;margin-top:2px}
input[type=text],input[type=tel]{width:100%;padding:12px;border:1px solid #bbb;border-radius:10px;font-size:16px;font-family:inherit}
button,.btn{display:inline-block;padding:12px 16px;border-radius:11px;border:0;font-size:15px;font-weight:700;background:#1fa855;color:#fff;text-decoration:none;cursor:pointer}.l{background:#eee;color:#222}
.q{text-align:center}.q svg{width:230px;height:230px}.code{font-family:ui-monospace,Menlo,monospace;font-size:22px;letter-spacing:3px;font-weight:700;text-align:center}.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}`;
const shell = (body: string) => `<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><link rel="icon" type="image/png" href="/icon-192.png"><title>Visit confirmation</title><style>${CSS}</style></head><body><div class="w">${body}</div></body></html>`;

export function renderAckGate(a: VisitAck, base: string, msg = '', step: 'phone' | 'code' = 'phone', agreed = false): string {
  const t = ackText(a.brokerName, a.subject);
  return shell(`<div class="top"><h1>${esc(a.subject)}</h1><p>साइट विज़िट की पुष्टि · Confirm your site visit · GENZ</p></div>
${msg ? `<div class="card warn"><p class="t">${msg}</p></div>` : ''}
<div class="card">${step === 'phone' ? `<p class="h">नमस्ते ${esc((a.buyerName || '').split(' ')[0])} जी — विज़िट पास पाने से पहले यह पुष्टि करें।</p><p class="t">Hello — please confirm this before you get your visit pass.</p>
<div class="pro"><p class="h">${esc(t.hi)}</p><p class="t">${esc(t.en)}</p></div>
<form method="post" action="${esc(base)}/otp"><label class="k"><input type="checkbox" name="agree" value="1" required${agreed ? ' checked' : ''}><span>मैं सहमत हूँ / I agree</span></label>
<label>आपका मोबाइल नंबर / Your mobile number</label><input type="tel" name="phone" inputmode="numeric" maxlength="14" required autocomplete="tel-national" placeholder="98XXXXXXXX">
<div class="row"><button type="submit">कोड भेजें / Send code</button></div></form>`
 : `<p class="h">${smsOn() ? 'SMS में आया 6 अंकों का कोड डालें।' : 'आपके ब्रोकर आपको 6 अंकों का कोड बताएँगे — वह यहाँ डालें।'}</p><p class="t">${smsOn() ? 'Enter the 6-digit code sent by SMS.' : 'Your broker will tell you a 6-digit code — enter it here.'}</p>
<form method="post" action="${esc(base)}/verify"><label>कोड / Code</label><input type="text" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code"><div class="row"><button type="submit">पुष्टि करें / Confirm</button><a class="btn l" href="${esc(base)}">दोबारा कोड / Send again</a></div></form>`}</div>
<p class="small" style="margin:12px 4px">${esc(ACK_NOTE.hi)}<br>${esc(ACK_NOTE.en)}</p>`);
}

async function ackedView(a: VisitAck): Promise<string> {
  const done = `<div class="card ok"><p class="h">✔ आपकी पुष्टि दर्ज हो गई।</p><p class="t">Your confirmation is recorded.</p></div>`;
  if (a.kind === 'VISIT') {
    const v = db.byId('siteVisits', a.refId) as any;
    if (!v) return shell(`${done}`);
    const payload = JSON.stringify({ visitId: v.id, dealRoomId: v.dealRoomId, propertyId: v.propertyId, token: `VISIT-PASS-${v.id}`, secret: v.qrToken || undefined });
    const svg = await QRCode.toString(payload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', width: 240 });
    const when = new Date(v.scheduledTime).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
    return shell(`<div class="top"><h1>${esc(a.subject)}</h1><p>आपका विज़िट पास · Your visit pass</p></div>${done}
<div class="card"><div class="q">${svg}</div><div class="code">${esc(v.otpCode || '')}</div><p class="t" style="text-align:center">${esc(when)}</p>
<p class="t"><b>कहाँ स्कैन होगा:</b> ${esc(scanLine('VISIT', v.scanAt).where.hi)} — मालिक या लिस्टिंग ब्रोकर स्कैन करेगा। सिर्फ़ तभी दिखाएँ, जब आप वहाँ मौजूद हों।</p><p class="t"><b>Where it is scanned:</b> ${esc(scanLine('VISIT', v.scanAt).where.en.toLowerCase())} — the owner or the listing broker scans it. Show it only when you are physically there.</p></div>`);
  }
  const pass = db.byId('visitPasses', a.refId) as any;
  return shell(`${done}${pass ? `<div class="card"><a class="btn" href="/v/${esc(pass.code)}">अपना विज़िट पास खोलें / Open my visit pass</a></div>` : ''}`);
}

export function createVisitAckPageRouter() {
  const r = Router();
  const form = express.urlencoded({ extended: false, limit: '10kb' });
  const headers = (res: Response) => { res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' }); };
  const find = (token: string) => {
    const m = /^([a-f0-9]{10})-([a-f0-9]{24})$/.exec(token); if (!m) return undefined;
    const a = st().visitAcks.find(x => x.id === `VAK-${m[1]}`);
    return a && safeEqual(token, tokenOf(a)) ? a : undefined;
  };
  const gone = (res: Response) => res.status(404).send(shell(`<div class="card"><p class="h">यह लिंक मान्य नहीं है। अपने ब्रोकर से नया लिंक माँगें।</p><p class="t">This link is not valid. Ask your broker for a new one.</p></div>`));
  const ping = (a: VisitAck, title: string, body: string) => void pushTo(a.brokerId, { kind: 'deals', title, body, url: a.kind === 'PASS' ? '/?tab=visits' : '/?tab=visits' });

  r.get('/:token', rateLimit('va-view', 120, 60_000), async (req: Request, res: Response) => {
    headers(res); const a = find(req.params.token); if (!a) return gone(res);
    if (a.status === 'ACKED') { const p = a.kind === 'PASS' ? db.byId('visitPasses', a.refId) as any : undefined; if (p) return res.redirect(303, `/v/${p.code}`); return res.send(await ackedView(a)); }
    res.send(renderAckGate(a, `/a/${req.params.token}`));
  });

  r.post('/:token/otp', rateLimit('va-otp', 30, 3600_000), form, async (req: Request, res: Response) => {
    headers(res); const a = find(req.params.token); if (!a) return gone(res);
    if (a.status === 'ACKED') return res.redirect(303, `/a/${req.params.token}`);
    const base = `/a/${req.params.token}`;
    if (req.body?.agree !== '1') return res.send(renderAckGate(a, base, 'आगे बढ़ने के लिए “मैं सहमत हूँ” पर टिक करें। / Please tick “I agree” to continue.'));
    const phone = phone10(req.body?.phone);
    if (!phone) return res.send(renderAckGate(a, base, 'अपना मोबाइल नंबर डालें। / Enter your mobile number.', 'phone', true));
    if (hit(`va-phone:${a.id}`, ACK_LIMITS.askPerHour, 3600_000, 3600_000) > 0) return res.status(429).send(renderAckGate(a, base, 'बहुत बार कोशिश हो चुकी। एक घंटे बाद फिर करें। / Too many tries — please wait an hour.', 'phone', true));
    if (!safeEqual(hmac('va-phone', phone), a.phoneKey)) return res.send(renderAckGate(a, base, 'यह नंबर इस विज़िट से मेल नहीं खाता। उसी नंबर से कोशिश करें जो आपने अपने ब्रोकर को दिया था। / This number does not match this visit — use the number you gave your broker.', 'phone', true));
    const otp = secureOtp();
    a.tickedAt = nowIso(); a.otpHash = hmac('va-otp', `${a.id}|${otp}`); a.otpExpires = new Date(Date.now() + ACK_LIMITS.otpMinutes * 60_000).toISOString(); a.otpTries = 0;
    a.otpPlain = smsOn() ? undefined : otp;
    if (smsOn()) await sendSms(`+91${phone}`, `GENZ: your code to confirm your site visit is ${otp}. Valid ${ACK_LIMITS.otpMinutes} minutes. Do not share it.`);
    db.save();
    if (!smsOn()) ping(a, 'Your buyer is confirming the visit', `${a.buyerName} ticked the agreement and asked for the code. Open Visit QR and read it out.`);
    res.send(renderAckGate(a, base, '', 'code'));
  });

  r.post('/:token/verify', rateLimit('va-verify', 40, 3600_000), form, async (req: Request, res: Response) => {
    headers(res); const a = find(req.params.token); if (!a) return gone(res);
    if (a.status === 'ACKED') return res.redirect(303, `/a/${req.params.token}`);
    const base = `/a/${req.params.token}`;
    if (!a.tickedAt || !a.otpHash || !a.otpExpires || Date.parse(a.otpExpires) < Date.now()) return res.send(renderAckGate(a, base, 'कोड की मियाद ख़त्म — नया कोड मँगाएँ। / The code has expired — ask for a new one.'));
    if ((a.otpTries || 0) >= ACK_LIMITS.otpTries) { a.otpHash = undefined; a.otpPlain = undefined; db.save(); return res.send(renderAckGate(a, base, 'बहुत बार ग़लत कोड — नया कोड मँगाएँ। / Too many wrong codes — ask for a new one.')); }
    const code = String(req.body?.code || '').trim();
    if (!safeEqual(a.otpHash, hmac('va-otp', `${a.id}|${code}`))) { a.otpTries = (a.otpTries || 0) + 1; db.save(); return res.send(renderAckGate(a, base, 'कोड सही नहीं है। / The code is not correct.', 'code')); }
    a.otpHash = undefined; a.otpPlain = undefined; a.otpExpires = undefined; a.otpTries = 0; a.status = 'ACKED'; a.ackedAt = nowIso();
    db.save();
    db.appendAuditEvent('SYSTEM', 'SUPERADMIN', 'VISIT', a.refId, 'VISIT_ACK_DONE', `${a.buyerName} (••${a.phoneLast4}, mobile verified by code) agreed on ${a.ackedAt}: no direct dealing with the owner / builder of ${a.subject} without ${a.brokerName} during the protection period (wording ${a.textVersion}).`);
    ping(a, 'Buyer confirmed', `${a.buyerName} confirmed the visit. The pass is ready.`);
    res.redirect(303, base);
  });
  return r;
}
