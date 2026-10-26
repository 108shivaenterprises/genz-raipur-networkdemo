import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

/** v75 — the client hears his broker on his phone: the alert card on the room page, one "it works" alert for a NEW phone, the broker's ON / OFF view, names (never message text) on the lock screen. */
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 7790 + Math.floor(Math.random() * 90);
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
let ck = '';
const page = async (method: string, url: string, opt: { form?: Record<string, string>; json?: unknown } = {}) => {
  const r = await fetch(B + url, { method, redirect: 'manual', headers: { ...(opt.form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...(opt.json ? { 'content-type': 'application/json' } : {}), ...(ck ? { cookie: ck } : {}) }, body: opt.form ? new URLSearchParams(opt.form).toString() : opt.json ? JSON.stringify(opt.json) : undefined });
  const sc = (r.headers as any).getSetCookie?.() as string[] | undefined;
  if (sc?.length) ck = sc.map(c => c.split(';')[0]).join('; ');
  const text = await r.text(); let js: any; try { js = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, js };
};
const b64u = (b: Buffer) => b.toString('base64url');
const phoneKeys = () => { const e = crypto.createECDH('prime256v1'); e.generateKeys(); return { p256dh: b64u(e.getPublicKey()), auth: b64u(crypto.randomBytes(16)) }; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v75a-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: 'a1'.repeat(32), SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  jar.B1 = await login('USR-BRK-001');
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

let ROOM = ''; let LINK = ''; const PHONE = '9722334455';
const roomOf = async () => (await j(await call(jar.B1, 'GET', `/api/client-rooms/${ROOM}`))).room;

describe('the client room page asks for alerts, loudly', () => {
  it('has one big alert card at the very top (before the broker and the homes), with the 3 states and the phone script', async () => {
    const b = await j(await call(jar.B1, 'POST', '/api/client-rooms', { clientName: 'Alert Tester', phone: PHONE, kind: 'BUYER', consent: true }));
    ROOM = b.room.id; LINK = b.link;
    await page('POST', `${LINK}/otp`, { form: { phone: PHONE } });
    const code = (await roomOf()).codeForClient;
    expect((await page('POST', `${LINK}/verify`, { form: { code } })).status).toBe(303);
    const g = await page('GET', LINK);
    expect(g.text).toContain('id="app-card"'); expect(g.text).toContain('id="app-push"'); expect(g.text).toContain('id="app-later"'); expect(g.text).toContain('id="app-ios"');
    expect(g.text.indexOf('id="app-card"')).toBeLessThan(g.text.indexOf('id="chat-box"'));
    expect(g.text.indexOf('id="app-card"')).toBeLessThan(g.text.indexOf('id="docs"'));
  });
  it('the page script is valid JavaScript and knows ask / on / denied / ios / none', async () => {
    const js = (await page('GET', '/r/cr.js')).text;
    expect(() => new Function(js)).not.toThrow();
    for (const w of ["show('on')", "show('ask')", "show('denied')", "show('ios')", "show('none')"]) expect(js).toContain(w);
    expect(js).toContain('cr_later_');                       // "later" snoozes for a day, it does not lose the card for ever
  });
});

describe('a phone turns alerts on', () => {
  let keys = phoneKeys(); const endpoint = 'https://fcm.googleapis.com/fcm/send/v75-phone-one';
  it('a NEW phone is news: one event line + one "it works" alert; the same phone coming back is silent', async () => {
    const a = await page('POST', `${LINK}/push`, { json: { endpoint, keys } });
    expect(a.status).toBe(200); expect(a.js.fresh).toBe(true);
    const again = await page('POST', `${LINK}/push`, { json: { endpoint, keys } });
    expect(again.js.fresh).toBe(false);
    const again2 = await page('POST', `${LINK}/push`, { json: { endpoint, keys } });
    expect(again2.js.fresh).toBe(false);
    const r = await roomOf();
    expect(r.events.filter((e: any) => /turned on alerts/.test(e.text)).length).toBe(1);
    await sleep(300);
    const sent = (await roomOf()).alerts.sent;
    expect(sent.filter((x: any) => /Alerts are on/.test(x.title)).length).toBe(1);
  });
  it('the broker sees ON with the number of phones — in the room and in the list', async () => {
    const r = await roomOf(); expect(r.alerts.phones).toBe(1);
    const list = (await j(await call(jar.B1, 'GET', '/api/client-rooms'))).rooms.find((x: any) => x.id === ROOM);
    expect(list.alerts.phones).toBe(1);
  });
  it('a second phone counts; a 4th replaces the oldest (at most 3)', async () => {
    for (let i = 2; i <= 4; i++) expect((await page('POST', `${LINK}/push`, { json: { endpoint: `https://fcm.googleapis.com/fcm/send/v75-phone-${i}`, keys: phoneKeys() } })).status).toBe(200);
    expect((await roomOf()).alerts.phones).toBe(3);
  });
});

describe('what the client hears', () => {
  it('his broker writes → an alert with the broker’s name, never the message text', async () => {
    const SECRET = 'rate 52 lakh final, token 5 lakh tomorrow';
    const before = (await roomOf()).alerts.sent.length;
    expect((await call(jar.B1, 'POST', `/api/client-rooms/${ROOM}/messages`, { text: SECRET })).status).toBe(200);
    await sleep(300);
    const sent = (await roomOf()).alerts.sent;
    const last = sent[sent.length - 1];
    expect(sent.length).toBeGreaterThan(before >= 5 ? 0 : before);
    expect(last.title).toMatch(/💬/); expect(last.title).toMatch(/Message from|का संदेश/);
    const me = cfg.demoAccounts.find((x: any) => x.id === 'USR-BRK-001');
    expect(last.title).toContain(String(me.name || '').split(' ')[0]);
    expect(JSON.stringify(sent)).not.toContain('52 lakh');
  });
  it('a room whose client never turned alerts on shows OFF to the broker', async () => {
    const b = await j(await call(jar.B1, 'POST', '/api/client-rooms', { clientName: 'Quiet Client', phone: '9733445566', kind: 'BUYER', consent: true }));
    const r = (await j(await call(jar.B1, 'GET', `/api/client-rooms/${b.room.id}`))).room;
    expect(r.alerts.phones).toBe(0); expect(r.alerts.sent).toEqual([]);
  });
  it('a new link kills the old alerts (the old link is dead) and the broker sees OFF', async () => {
    expect((await call(jar.B1, 'POST', `/api/client-rooms/${ROOM}/link`)).status).toBe(200);
    expect((await roomOf()).alerts.phones).toBe(0);
  });
});
