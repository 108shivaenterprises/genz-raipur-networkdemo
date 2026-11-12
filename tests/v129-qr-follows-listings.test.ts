import { freePort } from './helpers/port';
/**
 * v129 — the shop QR and the public QR page follow the broker's listings by themselves:
 *   · before his one-time owner promise nothing of his shows;
 *   · after it, a NEW listing is on both pages at once, without a tick;
 *   · a listing he unticked stays off, and later listings still come on;
 *   · a sold or withdrawn listing leaves both pages at once.
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v129-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PUSH_DRY_RUN: 'true', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true', REVEAL_FRESH_LISTING_HOURS: '0.003', VIDEO_MAX_MB: '5' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
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

describe('QR pages follow the listings (v129)', { timeout: 120000 }, () => {
  let card = ''; const ids: Record<string, string> = {};
  const list = async (n: number) => { const title = `Follow flat ${n}`; const r = await call(jar.BRK1, 'POST', '/api/properties', { title, description: `A bright two bedroom flat near the park, east facing, number ${n}`, propertyType: 'Residential Flat', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: 'Followpur',
    addressHidden: `Flat ${n}9`, askingPrice: 4500000 + n * 1000, ownerApprovedNetPrice: 4400000, ownerName: 'Test Owner', ownerPhone: `912345129${n}`, bhk: 2 }); expect(r.status, (await r.clone().text()).slice(0, 200)).toBe(200); ids[n] = (await j(r)).property.id; return title; };
  const on = async (title: string) => [(await (await fetch(`${B}/q/${qr}`)).text()).includes(title), (await (await fetch(`${B}/c/${card}`)).text()).includes(title)];
  it('setup: a live shop QR and his public page', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Follow Store', personName: 'Ramesh Verma', phone: SHOP_PHONE, area: 'Amlidih', city: 'Raipur', terms: TERMS, consent: true });
    expect(r.status).toBe(200); const jj = await j(r); partner = jj.partner; qr = jj.partner.qrCode; const token = jj.link.split('/sp/')[1];
    const ck = await partnerSignIn(token); expect((await form(ck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
    card = (await j(await call(jar.BRK1, 'GET', '/api/public-page'))).card.path.split('/c/')[1]; expect(card).toBeTruthy();
  });
  it('before the owner promise a listing is on neither page; the first tick (with the promise) puts it on both', async () => {
    const t1 = await list(1); const promised = !!(await j(await call(jar.BRK1, 'GET', '/api/public-page'))).card.ownerOk; expect(await on(t1)).toEqual([promised, promised]);   // the demo seed may already carry the promise
    expect((await call(jar.BRK1, 'PUT', '/api/public-page/homes', { ids: [ids[1]], ownerOk: true })).status).toBe(200); expect(await on(t1)).toEqual([true, true]);
  });
  it('a new listing after that is on both pages by itself', async () => { expect(await on(await list(2))).toEqual([true, true]); });
  it('an unticked listing stays off, and a later listing still comes on', async () => {
    const chosen = (await j(await call(jar.BRK1, 'GET', '/api/public-page'))).homes.chosen as string[]; expect(chosen).toContain(ids[2]);
    expect((await call(jar.BRK1, 'PUT', '/api/public-page/homes', { ids: chosen.filter(x => x !== ids[2]) })).status).toBe(200);
    expect(await on('Follow flat 2')).toEqual([false, false]); expect(await on(await list(3))).toEqual([true, true]); expect(await on('Follow flat 2')).toEqual([false, false]);
  });
  it('sold or withdrawn → off both pages at once', async () => {
    expect((await call(jar.BRK1, 'POST', `/api/listings/${ids[3]}/status`, { status: 'sold', soldVia: 'OUTSIDE', soldNote: 'Owner sold directly' })).status).toBe(200); expect(await on('Follow flat 3')).toEqual([false, false]);
    expect((await call(jar.BRK1, 'POST', `/api/listings/${ids[1]}/status`, { status: 'withdrawn', note: 'Owner changed his mind' })).status).toBe(200); expect(await on('Follow flat 1')).toEqual([false, false]);
  });
});
