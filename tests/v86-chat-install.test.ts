import { freePort } from './helpers/port';
/**
 * v85b — the customer's chat page is installable (manifest + “add to home”) and can switch on phone alerts; the broker sees whether they are on. Over real HTTP.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const form = (cookie: string | undefined, url: string, data: Record<string, string>) =>
  fetch(B + url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(data).toString() });
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v85-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const cookieOf = (r: Response) => (r.headers.get('set-cookie') || '').split(';')[0];
const TERMS = { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 };
const SHOP_PHONE = '9876500022';
let partner: any; let qr = '';
const list = async () => (await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json());
async function partnerSignIn(tok: string) {
  await form(undefined, `/sp/${tok}/otp`, { phone: SHOP_PHONE });
  const code = (await list()).partners.find((x: any) => x.id === partner.id).codeForPartner;
  return cookieOf(await form(undefined, `/sp/${tok}/verify`, { code }));
}
async function scan(phone: string, kind: string, extra: Record<string, string> = {}) {
  const page = await (await fetch(`${B}/q/${qr}`)).text();
  const t = /name="t" value="([^"]+)"/.exec(page)?.[1] || '';
  await sleep(2600);
  return form(undefined, `/q/${qr}`, { t, kind, name: 'Mohit Garg', phone, locality: 'Shankar Nagar', budget: '3 crore', ptype: 'House', note: '', consent: '1', direct: '1', sign: 'Mohit Garg', ...extra });
}
const tokOf = (r: Response) => /\/q\/chat\/([A-Za-z0-9_-]+)/.exec(r.headers.get('location') || '')?.[1] || '';
const leadByLast4 = async (last4: string) => (await list()).leads.find((l: any) => l.phoneLast4 === last4);


const FCM = 'https://fcm.googleapis.com/fcm/send/abc123';
const KEYS = { p256dh: 'B' + 'x'.repeat(86), auth: 'y'.repeat(22) };
describe('customer chat: add to home + alerts', { timeout: 60000 }, () => {
  let tok = ''; let leadId = '';
  it('setup: live QR, a buyer scans', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Verma Medical', personName: 'Suresh Verma', phone: SHOP_PHONE, area: 'Shankar Nagar', city: 'Raipur', terms: TERMS, consent: true });
    const j = await r.json(); partner = j.partner; qr = j.partner.qrCode; const token = j.link.split('/sp/')[1];
    const ck = await partnerSignIn(token); expect((await form(ck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
    const s = await scan('9123455601', 'BUY'); tok = tokOf(s); leadId = (await leadByLast4('5601')).id; expect(tok).toBeTruthy();
  });
  it('the first look has no install card and no script; after he writes the card, the manifest link and the script are there', async () => {
    let page = await (await fetch(`${B}/q/chat/${tok}`)).text();
    expect(page).not.toContain('data-testid="chat-app-card"'); expect(page).not.toContain('/q/chat-app.js'); expect(page).not.toContain('manifest.webmanifest');
    await form(undefined, `/q/chat/${tok}/msg`, { text: 'Namaste' });
    page = await (await fetch(`${B}/q/chat/${tok}`)).text();
    expect(page).toContain('data-testid="chat-app-card"'); expect(page).toContain('id="app-install"'); expect(page).toContain('id="app-push"'); expect(page).toContain('Add to Home Screen');
    expect(page).toContain(`/q/chat/${tok}/manifest.webmanifest`); expect(page).toContain('src="/q/chat-app.js"');
  });
  it('the manifest is this chat only (own scope + start page), installable, and a bad link has none', async () => {
    const m = await (await fetch(`${B}/q/chat/${tok}/manifest.webmanifest`)).json();
    expect(m.start_url).toBe(`/q/chat/${tok}`); expect(m.scope).toBe('/q/chat/'); expect(m.display).toBe('standalone'); expect(m.icons.length).toBeGreaterThanOrEqual(2);
    expect((await fetch(`${B}/q/chat/not-a-real-token-at-all-1234/manifest.webmanifest`)).status).toBe(404);
  });
  it('the script points at the chat link, not at the shop page, and speaks to the customer', async () => {
    const js = await (await fetch(`${B}/q/chat-app.js`)).text();
    expect(js).toContain("split('/')[3]"); expect(js).toContain("'/q/chat/'+TOK+'/push'"); expect(js).not.toContain("'/sp/'+TOK");
    expect(js).toContain('ब्रोकर का जवाब सीधे फ़ोन पर पाएँ'); expect(js).not.toContain('लीड और हिस्से');
  });
  it('his phone subscribes (bad keys / unknown push service are refused); the broker sees the alerts are on', async () => {
    expect((await leadByLast4('5601')).alerts).toBe(0);
    expect((await call(undefined, 'POST', `/q/chat/${tok}/push`, { endpoint: FCM, keys: { p256dh: 'short', auth: 'x' } })).status).toBe(400);
    expect((await call(undefined, 'POST', `/q/chat/${tok}/push`, { endpoint: 'https://evil.example.com/x', keys: KEYS })).status).toBe(400);
    expect((await call(undefined, 'POST', `/q/chat/not-a-real-token-at-all-1234/push`, { endpoint: FCM, keys: KEYS })).status).toBe(404);
    const ok = await call(undefined, 'POST', `/q/chat/${tok}/push`, { endpoint: FCM, keys: KEYS }); expect(ok.status).toBe(200); expect((await ok.json()).fresh).toBe(true);
    expect((await (await call(undefined, 'POST', `/q/chat/${tok}/push`, { endpoint: FCM, keys: KEYS })).json()).fresh).toBe(false);   // the same phone twice is one phone
    expect((await leadByLast4('5601')).alerts).toBe(1);
    expect(JSON.stringify(await list())).not.toContain(FCM);                    // the broker never sees his push address
  });
  it('the broker writing, asking and sharing still work with alerts on (no error from a phone we cannot reach)', async () => {
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/chat`, { text: 'Dekhta hoon' })).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/ask-need`)).status).toBe(200);
  });
  it('the broker screen says whether his alerts are on', () => {
    const ui = readFileSync(path.join(ROOT, 'src/components/ShopPartners.tsx'), 'utf8');
    expect(ui).toContain('data-testid="sp-chat-alerts"'); expect(ui).toContain('अलर्ट अभी चालू नहीं');
  });
  it('the lock-screen words carry the broker’s name only, never the message, a home or a number', () => {
    const wp = readFileSync(path.join(ROOT, 'server/webpush.ts'), 'utf8'); const i = wp.indexOf('export function brokerWrote');
    const fn = wp.slice(i, wp.indexOf('export function dropRoomPush'));
    expect(fn).not.toContain('${text}'); expect(fn).not.toContain('message'); expect(fn).toContain('Tap to read and reply');
  });
});
