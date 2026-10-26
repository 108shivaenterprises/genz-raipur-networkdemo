import { ackBuyer } from './helpers/ack.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** v70 — owner room (mandate-gated, numbers only), two rooms for one mobile, owner confirms a visit by the buyer's QR / code, full-Aadhaar switch. */
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 7800 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (c: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = async (r: Response) => r.json();
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
let jarC: Record<string, string> = {}; let nocookie = false;
const ckStr = () => nocookie ? '' : Object.entries(jarC).map(([k, v]) => `${k}=${v}`).join('; ');
const page = async (method: string, url: string, opt: { form?: Record<string, string>; json?: unknown } = {}) => {
  const r = await fetch(B + url, { method, redirect: 'manual', headers: { ...(opt.form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...(opt.json ? { 'content-type': 'application/json' } : {}), ...(ckStr() ? { cookie: ckStr() } : {}) }, body: opt.form ? new URLSearchParams(opt.form).toString() : opt.json ? JSON.stringify(opt.json) : undefined });
  const sc = (r.headers as any).getSetCookie?.() as string[] | undefined;
  if (sc?.length && !nocookie) for (const c of sc) { const [k, ...v] = c.split(';')[0].split('='); jarC[k] = v.join('='); }
  const text = await r.text(); let js: any; try { js = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, js, type: r.headers.get('content-type') || '' };
};
// a tiny valid PNG
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.alloc(200, 7)]).toString('base64');
const JUNK = Buffer.alloc(300, 65).toString('base64');

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v70-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: 'a1'.repeat(32), SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ B1: 'USR-BRK-001', B2: 'USR-BRK-002', OWN: 'USR-OWNER-001' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });


const OPH = '9811122233';
let OROOM = ''; let OLINK = ''; let BROOM = ''; let BLINK = '';
const signIn = async (link: string, room: string, phone: string) => {
  if ((await page('GET', link)).text.includes('id="app-card"')) return;   // already signed in on this phone
  expect((await page('POST', `${link}/otp`, { form: { phone } })).text).toContain('name="code"');
  const code = (await j(await call(jar.B1, 'GET', `/api/client-rooms/${room}`))).room.codeForClient;
  expect((await page('POST', `${link}/verify`, { form: { code } })).status).toBe(303);
};

describe('owner room', () => {
  it('only my own listing with an active mandate; another broker is refused; the normal form cannot make an OWNER room', async () => {
    const ready = await j(await call(jar.B1, 'GET', '/api/client-rooms/owner-ready'));
    expect(ready.homes.some((h: any) => h.id === 'PROP-RAI-101')).toBe(true);
    expect((await call(jar.B2, 'POST', '/api/client-rooms/owner', { propertyId: 'PROP-RAI-101', phone: OPH, ownerName: 'X', consent: true })).status).toBe(404);
    expect((await call(jar.B1, 'POST', '/api/client-rooms/owner', { propertyId: 'PROP-RAI-101', phone: OPH, ownerName: 'Sunil', consent: false })).status).toBe(400);
    const sneaky = await j(await call(jar.B1, 'POST', '/api/client-rooms', { clientName: 'Sneaky', phone: '9000011122', kind: 'OWNER', consent: true }));
    expect(sneaky.room.kind).toBe('BUYER');
    const r = await call(jar.B1, 'POST', '/api/client-rooms/owner', { propertyId: 'PROP-RAI-101', phone: OPH, ownerName: 'Sunil Lalwani', consent: true });
    expect(r.status, await r.clone().text()).toBe(200);
    const b = await j(r); OROOM = b.room.id; OLINK = b.link; expect(b.room.kind).toBe('OWNER');
    expect((await call(jar.B1, 'POST', '/api/client-rooms/owner', { propertyId: 'PROP-RAI-101', phone: OPH, ownerName: 'Sunil', consent: true })).status).toBe(409);
  });
  it('the owner signs in with his mobile and sees NUMBERS and the scan box — no names, no property list', async () => {
    await signIn(OLINK, OROOM, OPH);
    const g = await page('GET', OLINK);
    expect(g.text).toContain('id="scan-btn"'); expect(g.text).toContain('Only numbers');
    expect(g.text).not.toContain('name="item"'); expect(g.text).toContain('id="docform"');
    const d = (await j(await call(jar.B1, 'GET', `/api/client-rooms/${OROOM}`))).room;
    expect(d.ownerStats).toBeTruthy(); expect(typeof d.ownerStats.viewing).toBe('number');
  });
  it('the owner can write to the broker', async () => {
    const m = await page('POST', `${OLINK}/msg`, { form: { text: 'Kab tak visit aayegi?' } });
    expect(m.status).toBe(303);
    expect((await j(await call(jar.B1, 'GET', `/api/client-rooms/${OROOM}`))).room.messages.some((x: any) => x.text.includes('Kab tak'))).toBe(true);
  });
});

describe('one mobile, two rooms', () => {
  it('a buyer room with the SAME mobile (same broker) is allowed; signing in to one opens the other and shows a switch', async () => {
    const r = await call(jar.B1, 'POST', '/api/client-rooms', { clientName: 'Sunil Lalwani', phone: OPH, kind: 'BUYER', consent: true });
    expect(r.status, await r.clone().text()).toBe(200);
    const b = await j(r); BROOM = b.room.id; BLINK = b.link;
    await signIn(BLINK, BROOM, OPH);           // the code typed for the search room …
    const g = await page('GET', BLINK);
    expect(g.text).toContain('मेरे दूसरे रूम'); expect(g.text).toContain(`/r/go-${OROOM}`);
    const other = await page('GET', `/r/go-${OROOM}`);   // … also opens the owner room, no second code
    expect(other.status).toBe(200); expect(other.text).toContain('id="scan-btn"'); expect(other.text).toContain(`/r/go-${BROOM}`);
    nocookie = true;
    expect((await page('GET', `/r/go-${OROOM}`)).status).toBe(404);   // a phone with no session gets nothing
    nocookie = false;
  });
});

describe('visit cannot be bypassed: the owner confirms with the buyer’s QR / code', () => {
  const buyerPhone = '98' + String(Math.floor(10000000 + Math.random() * 89999999));
  let vid = ''; let sec: any;
  it('before the buyer’s promise the owner cannot confirm', async () => {
    const v = await j(await call(jar.B2, 'POST', '/api/site-visits', { propertyId: 'PROP-RAI-101', customerName: 'Mohan Buyer', customerPhone: buyerPhone, scheduledTime: new Date(Date.now() + 86400_000).toISOString() }));
    vid = v.siteVisit.id;
    sec = (await j(await call(jar.OWN, 'GET', `/api/site-visits?propertyId=PROP-RAI-101`))).siteVisits.find((x: any) => x.id === vid);
    await signIn(OLINK, OROOM, OPH);
    const a = await page('POST', `${OLINK}/scan`, { json: { code: JSON.stringify({ visitId: vid, secret: sec.qrToken }) } });
    expect(a.status).toBe(409);
  });
  it('wrong code / other property → no match; right QR → verified; a second scan is refused', async () => {
    expect((await ackBuyer(B, call, jar.B2, 'VISIT', vid, buyerPhone))).toBe(303);
    expect((await page('POST', `${OLINK}/scan`, { json: { code: '000000' } })).status).toBe(404);
    expect((await page('POST', `${OLINK}/scan`, { json: { code: 'abc' } })).status).toBe(400);
    const ok = await page('POST', `${OLINK}/scan`, { json: { code: JSON.stringify({ visitId: vid, secret: sec.qrToken }) } });
    expect(ok.status, ok.text).toBe(200); expect(ok.js.who).toBe('M.B');
    const v = (await j(await call(jar.OWN, 'GET', `/api/site-visits?propertyId=PROP-RAI-101`))).siteVisits.find((x: any) => x.id === vid);
    expect(v.isVerified).toBe(true); expect(v.verificationMethod).toBe('QR');
    expect((await page('POST', `${OLINK}/scan`, { json: { code: sec.otpCode } })).status).toBe(404);
  });
  it('a buyer room cannot scan', async () => {
    await signIn(BLINK, BROOM, OPH);
    expect((await page('POST', `${BLINK}/scan`, { json: { code: '123456' } })).status).toBe(403);
  });
});

describe('full Aadhaar is off by default', () => {
  it('the broker cannot ask and the client cannot send it', async () => {
    const d = (await j(await call(jar.B1, 'GET', `/api/client-rooms/${OROOM}`))).room;
    expect(d.fullAadhaar.on).toBe(false);
    const a = await call(jar.B1, 'POST', `/api/client-rooms/${OROOM}/full-aadhaar`, { ask: true });
    expect(a.status).toBe(403); expect((await j(a)).code).toBe('FULL_AADHAAR_OFF');
    await signIn(OLINK, OROOM, OPH);
    expect((await page('POST', `${OLINK}/doc`, { json: { kind: 'KYC_AADHAAR_FULL', data: PNG, consent: true } })).status).toBe(403);
    expect((await page('GET', OLINK)).text).not.toContain('KYC_AADHAAR_FULL');
  });
});
