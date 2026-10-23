/**
 * v26 — Web Push without any third-party package: VAPID (RFC 8292, ES256 JWT) + message encryption (RFC 8291, aes128gcm),
 * built on Node's own crypto. Free: the browser's push service (Google / Mozilla / Apple / Microsoft) delivers it.
 *
 *   GET  /api/push/key            the public VAPID key (for the browser's subscribe call)
 *   POST /api/push/subscribe      { endpoint, keys: { p256dh, auth } }
 *   POST /api/push/unsubscribe    { endpoint }
 *   GET  /api/push/prefs          what this member wants to hear about
 *   PUT  /api/push/prefs
 *   POST /api/push/test           a test alert to all my devices
 *
 * Keys: env VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (base64url), else a key file data/.vapid.json (0600) created on first start.
 * Only https endpoints of the known push services are accepted (no request to any other server — no SSRF).
 * A push never carries a customer's name or phone: just a short title / line and a link inside the app.
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { db } from './db.js';
import type { PushSub, PushPref, UserProfile } from './db.js';
import { ctx, requireAuth, rateLimit } from './auth.js';

const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');
const unb64u = (s: string) => Buffer.from(String(s).replace(/=+$/, ''), 'base64url');
const nowIso = () => new Date().toISOString();

// ───────────────────────── crypto (pure, exported for the tests) ─────────────────────────
function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, len: number): Buffer {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  const out: Buffer[] = []; let prev = Buffer.alloc(0); let n = 0;
  while (Buffer.concat(out).length < len) { n++; prev = crypto.createHmac('sha256', prk).update(Buffer.concat([prev, info, Buffer.from([n])])).digest(); out.push(prev); }
  return Buffer.concat(out).subarray(0, len);
}

/**
 * RFC 8291 aes128gcm body for one push message.
 * `asPrivate` / `salt` are only passed by the tests (RFC example); normally they are random for every message.
 */
export function encryptPayload(payload: Buffer, uaPublicB64: string, authSecretB64: string, opts: { asPrivate?: Buffer; salt?: Buffer; rs?: number } = {}): Buffer {
  const uaPublic = unb64u(uaPublicB64);
  const authSecret = unb64u(authSecretB64);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('PUSH_BAD_KEY');
  if (authSecret.length < 16) throw new Error('PUSH_BAD_AUTH');
  const ecdh = crypto.createECDH('prime256v1');
  if (opts.asPrivate) ecdh.setPrivateKey(opts.asPrivate); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, shared, keyInfo, 32);
  const salt = opts.salt || crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const rs = opts.rs || 4096;
  const plain = Buffer.concat([payload, Buffer.from([2])]); // single (last) record, no padding
  if (plain.length + 16 > rs) throw new Error('PUSH_TOO_BIG');
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21); salt.copy(header, 0); header.writeUInt32BE(rs, 16); header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, ct]);
}

/** the receiving side — used by the tests to prove the message really opens with the browser's keys */
export function decryptPayload(body: Buffer, uaPrivate: Buffer, uaPublicB64: string, authSecretB64: string): Buffer {
  const salt = body.subarray(0, 16); const idlen = body[20]; const asPublic = body.subarray(21, 21 + idlen); const ct = body.subarray(21 + idlen);
  const uaPublic = unb64u(uaPublicB64);
  const ecdh = crypto.createECDH('prime256v1'); ecdh.setPrivateKey(uaPrivate);
  const shared = ecdh.computeSecret(asPublic);
  const ikm = hkdf(unb64u(authSecretB64), shared, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  let end = plain.length - 1; while (end >= 0 && plain[end] === 0) end--;
  return plain.subarray(0, end); // drop the delimiter
}

export interface VapidKeys { publicKey: string; privateKey: string }
export function generateVapidKeys(): VapidKeys {
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  return { publicKey: b64u(e.getPublicKey()), privateKey: b64u(e.getPrivateKey()) };
}
function privateKeyObject(k: VapidKeys) {
  const pub = unb64u(k.publicKey);
  return crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: k.privateKey.replace(/=+$/, ''), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
}
/** RFC 8292 `Authorization: vapid t=…, k=…` for one push service origin */
export function vapidAuth(endpoint: string, k: VapidKeys, subject: string, expSec = Math.floor(Date.now() / 1000) + 12 * 3600): string {
  const aud = new URL(endpoint).origin;
  const head = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(Buffer.from(JSON.stringify({ aud, exp: expSec, sub: subject })));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: privateKeyObject(k), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${k.publicKey}`;
}
export function verifyVapidJwt(jwt: string, publicKeyB64: string): boolean {
  const [h, b, s] = jwt.split('.');
  const pub = unb64u(publicKeyB64);
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
  return crypto.verify('sha256', Buffer.from(`${h}.${b}`), { key, dsaEncoding: 'ieee-p1363' }, unb64u(s));
}

// ───────────────────────── keys on this server ─────────────────────────
let cached: VapidKeys | null = null;
export function resetVapidCache() { cached = null; }
export function vapidKeys(): VapidKeys | null {
  if (cached) return cached;
  const pub = process.env.VAPID_PUBLIC_KEY, prv = process.env.VAPID_PRIVATE_KEY;
  try {
    if (pub && prv) { const k = { publicKey: pub.trim(), privateKey: prv.trim() }; privateKeyObject(k); return (cached = k); }
    const file = process.env.VAPID_KEY_FILE === '' ? '' : (process.env.VAPID_KEY_FILE || path.resolve(process.cwd(), 'data', '.vapid.json'));
    if (!file) return null;
    if (fs.existsSync(file)) { const k = JSON.parse(fs.readFileSync(file, 'utf8')); privateKeyObject(k); return (cached = k); }
    const k = generateVapidKeys();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(k), { mode: 0o600 });
    return (cached = k);
  } catch (e) {
    console.error('[PUSH] VAPID key problem — push is off:', (e as Error).message);
    return null;
  }
}
const subject = () => process.env.VAPID_SUBJECT || (process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/+$/, '') : 'mailto:support@genzbuildcon.com');

/** push services that may receive our requests (https only) */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/, /^push\.services\.mozilla\.com$/];
export function allowedEndpoint(endpoint: string): boolean {
  try { const u = new URL(endpoint); return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some(re => re.test(u.hostname)) && endpoint.length <= 1000; } catch { return false; }
}

// ───────────────────────── sending ─────────────────────────
export type PushKind = 'matches' | 'deals' | 'consent' | 'broadcast' | 'digest' | 'community' | 'system';
export interface PushMsg { kind: PushKind; title: string; body: string; url?: string; tag?: string; /** v59 — the same alert in Hindi (sent when the person's app is in Hindi) */ hi?: { title: string; body: string } }
const DAILY_CAP = 40;
/** for the tests: every message “sent” (also when the network is not reachable) */
export const pushLog: { userId: string; msg: PushMsg; endpoints: number; at: string }[] = [];
let fetchImpl: typeof fetch = (...a) => fetch(...a);
export function setPushFetch(f: typeof fetch) { fetchImpl = f; }

const istHour = (d = new Date()) => (d.getUTCHours() + 5 + (d.getUTCMinutes() + 30 >= 60 ? 1 : 0)) % 24;
const istDay = (d = new Date()) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

export function prefsOf(userId: string): PushPref {
  const s = db.getState();
  let p = s.pushPrefs.find(x => x.userId === userId);
  if (!p) { p = { id: userId, userId, matches: true, deals: true, consent: true, broadcast: true, digest: true, quiet: true }; s.pushPrefs.push(p); }
  return p;
}

/** never throws, never blocks the request that caused it */
export async function pushTo(userId: string, msg: PushMsg): Promise<number> {
  try {
    const s = db.getState();
    const who = s.users.find(x => x.id === userId);
    if (!who || who.verificationStatus === 'SUSPENDED' || who.verificationStatus === 'BLACKLISTED') return 0; // v59 — a closed account's phone hears nothing more
    if (who.verificationStatus !== 'VERIFIED' && msg.kind !== 'system') return 0; // pending / not approved: only GENZ's word about the account
    const subs = s.pushSubs.filter(x => x.userId === userId);
    const p = prefsOf(userId);
    if (msg.kind !== 'system' && (p as any)[msg.kind] === false) return 0;
    if (p.quiet && msg.kind !== 'consent' && msg.kind !== 'system') { const h = istHour(); if (h >= 22 || h < 7) return 0; }
    const day = istDay();
    if (!p.sentToday || p.sentToday.day !== day) p.sentToday = { day, n: 0 };
    if (p.sentToday.n >= DAILY_CAP) return 0;
    p.sentToday.n++;
    pushLog.push({ userId, msg, endpoints: subs.length, at: nowIso() }); if (pushLog.length > 500) pushLog.shift();
    const keys = vapidKeys();
    if (!keys || !subs.length) return 0;
    const words = p.lang === 'hi' && msg.hi ? msg.hi : msg;
    const payload = Buffer.from(JSON.stringify({ t: words.title.slice(0, 80), b: words.body.slice(0, 180), u: msg.url && msg.url.startsWith('/') ? msg.url : '/', g: msg.tag || msg.kind }));
    let ok = 0;
    await Promise.all(subs.map(async sub => {
      if (!allowedEndpoint(sub.endpoint)) return;
      try {
        const body = encryptPayload(payload, sub.p256dh, sub.auth);
        const r = await fetchImpl(sub.endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: msg.kind === 'consent' ? 'high' : 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Authorization: vapidAuth(sub.endpoint, keys, subject()) }, body: body as any, signal: AbortSignal.timeout(8000) });
        if (r.status === 404 || r.status === 410) { s.pushSubs = s.pushSubs.filter(x => x.id !== sub.id); return; }
        if (r.ok) { ok++; sub.lastOkAt = nowIso(); sub.fails = 0; } else sub.fails = (sub.fails || 0) + 1;
      } catch { sub.fails = (sub.fails || 0) + 1; }
      if (sub.fails >= 8) s.pushSubs = s.pushSubs.filter(x => x.id !== sub.id);
    }));
    db.save();
    return ok;
  } catch (e) {
    console.error('[PUSH] send failed:', (e as Error).message);
    return 0;
  }
}

// ───────────────────────── routes ─────────────────────────
const subSchema = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().min(80).max(120), auth: z.string().min(16).max(40) }) });
const prefSchema = z.object({ matches: z.boolean(), deals: z.boolean(), consent: z.boolean(), broadcast: z.boolean(), digest: z.boolean(), quiet: z.boolean(), lang: z.enum(['en', 'hi']) }).partial().strict();
const prefView = (p: PushPref) => ({ matches: p.matches, deals: p.deals, consent: p.consent, broadcast: p.broadcast, digest: p.digest, quiet: p.quiet, lang: p.lang || 'en' });

export function createPushRouter() {
  const r = Router();
  const me = () => ctx().user as UserProfile;
  r.get('/key', (_req: Request, res: Response) => { const k = vapidKeys(); res.json({ success: true, publicKey: k?.publicKey || null }); });
  /** v59 — my own latest alerts on this server copy (what was sent to my phone; nothing about anyone else) */
  r.get('/recent', requireAuth, (_req: Request, res: Response) => {
    const id = me().id;
    res.json({ success: true, alerts: pushLog.filter(x => x.userId === id).slice(-30).reverse().map(x => ({ kind: x.msg.kind, title: x.msg.title, body: x.msg.body, ...(x.msg.hi ? { hi: x.msg.hi } : {}), url: x.msg.url, at: x.at })) });
  });
  r.post('/subscribe', requireAuth, rateLimit('push-sub', 30, 3600_000), (req: Request, res: Response) => {
    const p = subSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'This browser sent an unusable push address.' });
    if (!allowedEndpoint(p.data.endpoint)) return res.status(400).json({ error: 'This browser’s push service is not supported.', code: 'PUSH_HOST' });
    try { encryptPayload(Buffer.from('x'), p.data.keys.p256dh, p.data.keys.auth); } catch { return res.status(400).json({ error: 'The browser’s push keys are not valid.' }); }
    const s = db.getState(); const u = me();
    const id = crypto.createHash('sha256').update(p.data.endpoint).digest('hex').slice(0, 32);
    s.pushSubs = s.pushSubs.filter(x => x.id !== id);
    const mine = s.pushSubs.filter(x => x.userId === u.id);
    if (mine.length >= 6) { const oldest = mine.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]; s.pushSubs = s.pushSubs.filter(x => x.id !== oldest.id); }
    s.pushSubs.push({ id, userId: u.id, endpoint: p.data.endpoint, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth, ua: String(req.headers['user-agent'] || '').slice(0, 120), createdAt: nowIso(), fails: 0 } as PushSub);
    prefsOf(u.id);
    db.save();
    res.json({ success: true, devices: s.pushSubs.filter(x => x.userId === u.id).length, me: u.id });
  });
  /** v59 — called when the app starts: is this phone's push address mine? If it belongs to someone else (a shared office phone,
   *  the last person did not sign out) it is let go at once, so his alerts stop reaching a phone he is not using. */
  r.post('/sync', requireAuth, rateLimit('push-sync', 60, 3600_000), (req: Request, res: Response) => {
    const p = subSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'This browser sent an unusable push address.' });
    const s = db.getState(); const u = me();
    const id = crypto.createHash('sha256').update(p.data.endpoint).digest('hex').slice(0, 32);
    const cur = s.pushSubs.find(x => x.id === id);
    if (cur && cur.userId === u.id) {
      if (cur.p256dh !== p.data.keys.p256dh || cur.auth !== p.data.keys.auth) { cur.p256dh = p.data.keys.p256dh; cur.auth = p.data.keys.auth; db.save(); }
      return res.json({ success: true, state: 'mine' });
    }
    if (cur) { s.pushSubs = s.pushSubs.filter(x => x.id !== id); db.save(); return res.json({ success: true, state: 'released' }); }
    res.json({ success: true, state: 'none' });
  });
  r.post('/unsubscribe', requireAuth, (req: Request, res: Response) => {
    const s = db.getState(); const u = me();
    const ep = String(req.body?.endpoint || '');
    s.pushSubs = s.pushSubs.filter(x => !(x.userId === u.id && (!ep || x.endpoint === ep)));
    db.save();
    res.json({ success: true, devices: s.pushSubs.filter(x => x.userId === u.id).length });
  });
  r.get('/prefs', requireAuth, (_req: Request, res: Response) => {
    const u = me(); const p = prefsOf(u.id);
    res.json({ success: true, prefs: prefView(p), devices: db.getState().pushSubs.filter(x => x.userId === u.id).length, ready: !!vapidKeys() });
  });
  r.put('/prefs', requireAuth, (req: Request, res: Response) => {
    const v = prefSchema.safeParse(req.body);
    if (!v.success) return res.status(400).json({ error: 'Invalid choice' });
    const p = prefsOf(me().id); Object.assign(p, v.data); db.save();
    res.json({ success: true, prefs: prefView(p) });
  });
  r.post('/test', requireAuth, rateLimit('push-test', 10, 3600_000), async (_req: Request, res: Response) => {
    const u = me();
    const body = ({
      BROKER: 'You will get new matches, offers, owner consents and builder leads here.',
      DEVELOPER_BUILDER: 'You will get partner requests, leads, bookings and payments here.',
      TEAM_MEMBER: 'You will get the leads, deals and client messages of your work here.',
      LEGAL_COUNSEL: 'You will get new legal cases in your states and their messages here.',
      CONTRACTOR: 'You will get new construction leads in your city here.',
    } as Record<string, string>)[u.role] || 'You will get your GENZ updates here.';
    const hiBody = ({
      BROKER: 'नए मैच, ऑफ़र, मालिक की मंज़ूरी और बिल्डर लीड यहीं आएँगे।',
      DEVELOPER_BUILDER: 'पार्टनर की माँग, लीड, बुकिंग और पेमेंट यहीं आएँगे।',
      TEAM_MEMBER: 'आपके काम की लीड, डील और क्लाइंट के संदेश यहीं आएँगे।',
      LEGAL_COUNSEL: 'आपके राज्यों के नए क़ानूनी केस और उनके संदेश यहीं आएँगे।',
      CONTRACTOR: 'आपके शहर की नई कंस्ट्रक्शन लीड यहीं आएँगी।',
    } as Record<string, string>)[u.role] || 'GENZ के अपडेट यहीं आएँगे।';
    const n = await pushTo(u.id, { kind: 'system', title: 'GENZ alerts are on ✔', body, url: '/', hi: { title: 'GENZ अलर्ट चालू ✔', body: hiBody } });
    res.json({ success: true, delivered: n, devices: db.getState().pushSubs.filter(x => x.userId === u.id).length });
  });
  return r;
}

export { istHour, istDay };
