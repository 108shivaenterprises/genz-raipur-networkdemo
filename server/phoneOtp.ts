/**
 * v133 — Firebase phone OTP (Google) for the pages that ask a mobile + code: the shop partner's page, the client room, "open my old chat".
 * Firebase can only run ITS OWN verification (it will not send our text), so:
 *   1. the flow makes its own 6-digit code exactly as before and "sends" it — sendSms() keeps it here, sealed, for 10 minutes;
 *   2. the customer is sent to /otp: Firebase texts him its code, he types it, the browser gets a Google-signed token;
 *   3. /otp/claim checks the token (signature, project, expiry, phone) and hands the flow's code to that browser, which posts it to the flow's own /verify.
 * So every flow keeps its own checks; this page only proves "this browser holds that phone". Off unless the FIREBASE_* variables are set.
 */
import { Router, Request, Response } from 'express';
import { createVerify, createPublicKey } from 'node:crypto';
import { db } from './db.js';
import { apiKey } from './apiKeys.js';
import { seal, unseal } from './vaultCrypto.js';
import { rateLimit } from './auth.js';

const env = apiKey;   // v135 — Control Center key first, then the server env
export const firebaseConfig = () => ({ apiKey: env('FIREBASE_API_KEY'), authDomain: env('FIREBASE_AUTH_DOMAIN') || (env('FIREBASE_PROJECT_ID') ? `${env('FIREBASE_PROJECT_ID')}.firebaseapp.com` : ''), projectId: env('FIREBASE_PROJECT_ID'), appId: env('FIREBASE_APP_ID') });
export const firebaseOn = () => !!(env('FIREBASE_API_KEY') && env('FIREBASE_PROJECT_ID')) && !env('SMS_WEBHOOK_URL') && !env('FAST2SMS_API_KEY');   // v134 — a direct SMS gateway wins, else the phone gets two codes

const TTL = 10 * 60_000;
const p10 = (s: string) => String(s || '').replace(/\D/g, '').slice(-10);
const st = () => db.getState() as any;

/** called by sendSms(): keep the flow's code for this phone (sealed), newest wins */
export function stashOtp(to: string, message: string): boolean {
  const code = /\b(\d{6})\b/.exec(message)?.[1]; const phone = p10(to); if (!code || phone.length !== 10) return false;
  const all = (st().fbOtp ||= {}) as Record<string, { c: string; at: number }>;
  for (const k of Object.keys(all)) if (Date.now() - all[k].at > TTL) delete all[k];
  all[phone] = { c: seal(code, `fbotp|${phone}`), at: Date.now() }; db.save(); return true;
}
function takeOtp(phone: string): string {
  const all = (st().fbOtp || {}) as Record<string, { c: string; at: number }>; const row = all[phone]; if (!row) return '';
  delete all[phone]; db.save(); if (Date.now() - row.at > TTL) return '';
  try { return unseal(row.c, `fbotp|${phone}`); } catch { return ''; }
}

// Google's signing certificates for Firebase ID tokens (public; cached as their Cache-Control says)
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let certs: { at: number; ttl: number; keys: Record<string, string> } | null = null;
async function googleCerts(): Promise<Record<string, string>> {
  if (certs && Date.now() - certs.at < certs.ttl) return certs.keys;
  const r = await fetch(CERTS_URL); if (!r.ok) throw new Error('certs ' + r.status);
  const age = Number(/max-age=(\d+)/.exec(r.headers.get('cache-control') || '')?.[1] || 3600);
  certs = { at: Date.now(), ttl: Math.min(age, 6 * 3600) * 1000, keys: await r.json() as Record<string, string> }; return certs.keys;
}
const b64u = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** → the 10-digit Indian mobile the token proves, or throws. `keys` is for the test. */
export async function verifyFirebaseToken(idToken: string, projectId = env('FIREBASE_PROJECT_ID'), keys?: Record<string, string>, now = Date.now()): Promise<string> {
  const [h, p, s] = String(idToken || '').split('.'); if (!h || !p || !s || !projectId) throw new Error('malformed');
  const head = JSON.parse(b64u(h).toString('utf8')); const body = JSON.parse(b64u(p).toString('utf8'));
  if (head.alg !== 'RS256' || !head.kid) throw new Error('alg');
  const pem = (keys || await googleCerts())[head.kid]; if (!pem) throw new Error('unknown key');
  if (!createVerify('RSA-SHA256').update(`${h}.${p}`).verify(createPublicKey(pem), b64u(s))) throw new Error('signature');
  const sec = now / 1000;
  if (body.aud !== projectId || body.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('project');
  if (!(Number(body.exp) > sec) || !(Number(body.iat) <= sec + 300) || !body.sub) throw new Error('expired');
  if (sec - Number(body.auth_time || 0) > 600) throw new Error('stale sign-in');   // the phone was proved in the last 10 minutes
  const ph = String(body.phone_number || ''); if (!/^\+91[6-9]\d{9}$/.test(ph)) throw new Error('phone');
  return ph.slice(-10);
}

/** the flows this page may post a code back to — their own /verify routes, nothing else */
export const OTP_ACT_RE = /^\/(?:q\/[A-Za-z0-9_-]{4,40}\/resume|sp\/[A-Za-z0-9_-]{8,80}|r\/[A-Za-z0-9_-]{8,80})\/verify$/;
export const otpUrl = (phone: string, act: string) => `/otp?phone=${encodeURIComponent(p10(phone))}&act=${encodeURIComponent(act)}`;

const esc = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function createPhoneOtpRouter(): Router {
  const r = Router();
  r.get('/', rateLimit('otp-page', 60, 60_000), (req: Request, res: Response) => {
    const phone = p10(String(req.query.phone || '')); const act = String(req.query.act || '');
    if (!firebaseOn() || !/^[6-9]\d{9}$/.test(phone) || !OTP_ACT_RE.test(act)) return res.status(404).type('text/plain').send('Not found');
    const c = firebaseConfig();
    // this page alone talks to Google (SDK, reCAPTCHA, Identity Toolkit); the rest of the app keeps its strict policy
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com https://www.google.com https://apis.google.com https://www.recaptcha.net; connect-src 'self' https://identitytoolkit.googleapis.com https://www.googleapis.com https://firebaseinstallations.googleapis.com https://www.google.com https://www.recaptcha.net; frame-src https://www.google.com https://recaptcha.google.com https://www.recaptcha.net https://${c.authDomain}; style-src 'unsafe-inline'; img-src 'self' data: https:; base-uri 'none'; form-action 'self'`);
    res.set('Cache-Control', 'no-store').send(`<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>कोड — GENZ</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#f1f5f9;color:#0f172a}.w{max-width:440px;margin:0 auto;padding:18px}h1{font-size:20px;margin:6px 0}.c{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin-top:12px}input{width:100%;box-sizing:border-box;font-size:22px;letter-spacing:6px;text-align:center;padding:12px;border:1px solid #cbd5e1;border-radius:10px}button{width:100%;min-height:48px;margin-top:10px;border:0;border-radius:10px;background:#0f172a;color:#fff;font-size:16px;font-weight:700}button[disabled]{opacity:.5}.l{background:#fff;color:#0f172a;border:1px solid #cbd5e1}.m{font-size:14px;color:#475569}.e{color:#b91c1c;font-size:14px;margin-top:8px}</style></head>
<body><div class="w"><h1>मोबाइल की पुष्टि · Confirm your mobile</h1><p class="m">+91 ${esc(phone.slice(0, 2))}••••••${esc(phone.slice(-2))} पर SMS से 6 अंकों का कोड भेजा जा रहा है। <br>A 6-digit code is being sent by SMS.</p>
<div class="c"><p class="m" id="st">कोड भेज रहे हैं… / Sending the code…</p><div id="box" style="display:none"><input id="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="••••••" aria-label="Code"><button id="ok" type="button">पुष्टि करें / Confirm</button></div><p class="e" id="err" role="alert"></p><button id="again" class="l" type="button" style="display:none">दोबारा कोड भेजें / Send again</button></div>
<div id="rc"></div></div>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script><script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script>(function(){var cfg=${JSON.stringify(c)},phone=${JSON.stringify(phone)},act=${JSON.stringify(act)};var $=function(i){return document.getElementById(i)};var conf=null;
function fail(m){$('err').textContent=m;$('again').style.display='block';$('ok').disabled=false}
function msg(e){var c=(e&&e.code)||'';return c==='auth/invalid-verification-code'?'कोड ग़लत है। / Wrong code.':c==='auth/code-expired'?'कोड का समय निकल गया — दोबारा भेजें। / The code expired — send again.':c==='auth/too-many-requests'?'बहुत बार कोशिश हुई — कुछ देर बाद करें। / Too many tries — wait a while.':c==='auth/invalid-phone-number'?'मोबाइल नंबर सही नहीं। / The mobile number is not valid.':'कोड नहीं भेज पाए — दोबारा कोशिश करें। / Could not send the code — try again.'}
try{firebase.initializeApp(cfg)}catch(e){}
var auth=firebase.auth();auth.languageCode='hi';var rv=new firebase.auth.RecaptchaVerifier('rc',{size:'invisible'});
function send(){$('err').textContent='';$('again').style.display='none';$('st').textContent='कोड भेज रहे हैं… / Sending the code…';
auth.signInWithPhoneNumber('+91'+phone,rv).then(function(r){conf=r;$('st').textContent='SMS में आया कोड डालें। / Enter the code from the SMS.';$('box').style.display='block';$('code').focus()}).catch(function(e){$('st').textContent='';fail(msg(e))})}
$('again').onclick=send;
$('ok').onclick=function(){var v=$('code').value.replace(/\\D/g,'');if(v.length!==6||!conf)return fail('6 अंकों का कोड लिखें। / Write the 6-digit code.');$('ok').disabled=true;$('err').textContent='';
conf.confirm(v).then(function(x){return x.user.getIdToken()}).then(function(t){return fetch('/otp/claim',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken:t,act:act})})}).then(function(r){return r.json()}).then(function(j){if(!j.ok)return fail(j.error||'पुष्टि नहीं हो पाई। / Could not confirm.');auth.signOut();var f=document.createElement('form');f.method='post';f.action=act;[['code',j.code],['phone',phone]].forEach(function(p){var i=document.createElement('input');i.type='hidden';i.name=p[0];i.value=p[1];f.appendChild(i)});document.body.appendChild(f);f.submit()}).catch(function(e){fail(msg(e))})};
send()})();</script></body></html>`);
  });
  r.post('/claim', rateLimit('otp-claim', 20, 60 * 60_000), async (req: Request, res: Response) => {
    if (!firebaseOn()) return res.status(404).json({ ok: false });
    const act = String(req.body?.act || ''); if (!OTP_ACT_RE.test(act)) return res.status(400).json({ ok: false, error: 'Bad request' });
    let phone = '';
    try { phone = await verifyFirebaseToken(String(req.body?.idToken || '')); } catch { return res.status(401).json({ ok: false, error: 'पुष्टि नहीं हो पाई — दोबारा कोशिश करें। / Could not confirm — try again.' }); }
    // no code waiting (it expired, or this number has nothing to open): the flow's own /verify answers that, exactly as for a wrong code
    res.json({ ok: true, code: takeOtp(phone) || '000000' });
  });
  return r;
}
