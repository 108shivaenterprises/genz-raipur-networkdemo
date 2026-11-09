import { freePort } from './helpers/port';
/**
 * v119 — the customer's client room is there the moment he confirms his need (QR scan → confirm), even when no home fits yet.
 *   · the customer has the room card in his chat at once;
 *   · the broker sees no room (list, detail, lead links) while the customer's number is still hidden;
 *   · when the number opens (a home is shown), the same room becomes the broker's, with the homes in it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { pubMediaUrl, isUploadedVideo, videoKind } from '../src/shared/roomMedia';

const ROOT = path.resolve(__dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const form = (cookie: string | undefined, url: string, data: Record<string, string>) =>
  fetch(B + url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(data).toString() });
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v119-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PUSH_DRY_RUN: 'true', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true', REVEAL_FRESH_LISTING_HOURS: '0.003', VIDEO_MAX_MB: '5' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 500)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const cookieOf = (r: Response) => (r.headers.get('set-cookie') || '').split(';')[0];
const j = async (r: Response) => r.json();
const TERMS = { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 };
const SHOP_PHONE = '9876500105';
let partner: any; let qr = '';
const list = async () => j(await call(jar.BRK1, 'GET', '/api/shop-partners'));
async function partnerSignIn(tok: string) {
  await form(undefined, `/sp/${tok}/otp`, { phone: SHOP_PHONE });
  const code = (await list()).partners.find((x: any) => x.id === partner.id).codeForPartner;
  return cookieOf(await form(undefined, `/sp/${tok}/verify`, { code }));
}
async function scan(name: string, phone: string, extra: Record<string, string> = {}) {
  const page = await (await fetch(`${B}/q/${qr}`)).text();
  const t = /name="t" value="([^"]+)"/.exec(page)?.[1] || '';
  await sleep(2600);
  return form(undefined, `/q/${qr}`, { t, kind: 'BUY', name, phone, locality: 'Shankar Nagar', budget: '3 crore', ptype: 'House', note: '', consent: '1', direct: '1', sign: name, ...extra });
}
const tokOf = (r: Response) => /\/q\/chat\/([A-Za-z0-9_-]+)/.exec(r.headers.get('location') || '')?.[1] || '';
const lead = async (last4: string) => (await list()).leads.find((l: any) => l.phoneLast4 === last4);
const chat = async (tok: string) => (await fetch(`${B}/q/chat/${tok}`)).text();
const preview = (tok: string, id: string) => fetch(`${B}/q/chat/${tok}/home/${id}`, { redirect: 'manual' });
const bots = (l: any) => l.chat.msgs.filter((m: any) => m.by === 'BOT');
const homesOf = (l: any): string[] => l.chat.msgs.filter((m: any) => m.kind === 'HOME').map((m: any) => m.homeId);
const inbox = async () => ((await j(await call(jar.BRK1, 'GET', '/api/inbox?lang=hi'))).items || []) as any[];
const say = (tok: string, text: string) => form(undefined, `/q/chat/${tok}/msg`, { text });
const tap = (tok: string, k: string) => form(undefined, `/q/chat/${tok}/quick`, { k });

const JPG = Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.alloc(300, 9)]).toString('base64');
const mp4 = (bytes: number) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(Math.max(0, bytes - 12), 1)]);
const upVideo = (cookie: string | undefined, buf: Buffer | Uint8Array, type = 'video/mp4') =>
  fetch(B + '/api/owner-media/video-raw', { method: 'POST', headers: { 'content-type': type, ...(cookie ? { cookie } : {}) }, body: buf as any });
const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const newHome = (title: string, price: number, extra: Record<string, unknown> = {}) => call(jar.BRK1, 'POST', '/api/properties', {
  title, description: 'A residential house, east facing, near the park', propertyType: 'Independent House', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: 'Shankar Nagar',
  addressHidden: 'Lane 4, Shankar Nagar', askingPrice: price, ownerApprovedNetPrice: Math.round(price * 0.95), ownerName: 'Test Owner', ownerPhone: '9123450105', ...extra });
const mk = async (title: string, price: number, extra: Record<string, unknown> = {}) => { const r = await newHome(title, price, extra); expect(r.status, title + ' ' + (await r.clone().text()).slice(0, 200)).toBe(200); return (await j(r)).property.id as string; };

describe('the room opens at confirm, the broker gets it with the number (v119)', { timeout: 180000 }, () => {
  const A = '9123411901'; let tok = '';
  const rooms = async () => ((await j(await call(jar.BRK1, 'GET', '/api/client-rooms'))).rooms || []) as any[];
  const until = async <T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 5000) => { const end = Date.now() + ms; let v = await fn(); while (Date.now() < end && !ok(v)) { await sleep(150); v = await fn(); } return v; };

  it('setup: a live QR', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Held Room Store', personName: 'Ramesh Verma', phone: SHOP_PHONE, area: 'Amlidih', city: 'Raipur', terms: TERMS, consent: true });
    expect(r.status).toBe(200); const jj = await j(r); partner = jj.partner; qr = jj.partner.qrCode; const token = jj.link.split('/sp/')[1];
    const ck = await partnerSignIn(token); expect((await form(ck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
  });

  it('he confirms a need nothing fits → his room card is in the chat, the broker has no room and no number', async () => {
    tok = tokOf(await scan('Hira Held', A, { locality: 'Nowhereville', budget: '9 lakh', ptype: 'Farm House' })); expect(tok).toBeTruthy();
    expect((await form(undefined, `/q/chat/${tok}/ans`, { a: 'YES' })).status).toBe(303);
    const l = await lead('1901'); expect(l.chat.revealedAt).toBeFalsy();
    expect(await chat(tok)).toContain('data-testid="chat-room"');
    expect((await rooms()).some(x => x.clientName === 'Hira Held')).toBe(false);
    const links = (await j(await call(jar.BRK1, 'GET', '/api/shop-partners'))).leads.find((x: any) => x.phoneLast4 === '1901');
    expect(JSON.stringify(links)).not.toContain('Client room opened');
  });

  it('a matching home is listed, ~11 s pass (test setting for the 48-hour rule), the broker shows it → the number opens and the same room is now in his list', async () => {
    const hr = await call(jar.BRK1, 'POST', '/api/properties', { title: 'Held room farm house', description: 'A farm house near Nowhereville', propertyType: 'Farm House', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: 'Nowhereville',
      addressHidden: 'Plot 4', askingPrice: 800000, ownerApprovedNetPrice: 760000, ownerName: 'Test Owner', ownerPhone: '9123450119' });
    expect(hr.status, (await hr.clone().text()).slice(0, 200)).toBe(200); const homeId = (await j(hr)).property?.id || (await j(hr.clone())).id;
    await sleep(11500);
    const l = await lead('1901');
    const o = await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${l.id}/offer`, { homeId }); expect(o.status, await o.clone().text()).toBe(200);
    await chat(tok);   // opening his chat page levels the room with the chat (v105)
    const got = await until(rooms, v => v.some(x => x.clientName === 'Hira Held'), 6000);
    expect(got.some(x => x.clientName === 'Hira Held')).toBe(true);
  });

  it('v120 — he taps “this month” → the broker\'s lead carries the timeline and a deal brief with a next step', async () => {
    expect((await tap(tok, 'TL:NOW')).status).toBe(303);
    const l = await lead('1901'); expect(l.bot.timeline).toBe('NOW');
    expect(l.brief.reasons.some((r: any) => /this month/i.test(r.en))).toBe(true); expect(l.brief.next.en.length).toBeGreaterThan(10);
    expect((await tap(tok, 'TL:JUNK')).status).toBe(303); expect((await lead('1901')).bot.timeline).toBe('NOW');
  });
});
