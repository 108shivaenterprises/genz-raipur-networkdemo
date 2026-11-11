import { freePort } from './helpers/port';
/**
 * v127 — co-broking from a QR lead: the broker has no home of his own for the customer, the network does.
 *   · he sends the need (no name, no number) to the brokers who hold a matching home;
 *   · until a listing broker answers “I have it” with a home, he cannot show that home to the customer;
 *   · after the answer he can: the number opens, the home is in the chat and the room, and the other broker is never named to the customer.
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v127-')); mkdirSync(path.join(dir, 'data'));
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

describe('co-broke from a QR lead (v127)', { timeout: 180000 }, () => {
  const A = '9123411271'; let tok = ''; let H = ''; let bc = '';
  it('setup: a live QR of broker 1; broker 2 lists the only home that fits; ~11 s pass (test setting of the 48-hour rule)', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Cobroke Store', personName: 'Ramesh Verma', phone: SHOP_PHONE, area: 'Amlidih', city: 'Raipur', terms: TERMS, consent: true });
    expect(r.status).toBe(200); const jj = await j(r); partner = jj.partner; qr = jj.partner.qrCode; const token = jj.link.split('/sp/')[1];
    const ck = await partnerSignIn(token); expect((await form(ck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
    const hr = await call(jar.BRK2, 'POST', '/api/properties', { title: 'Cobroke farm house', description: 'A farm house near Cobrokepur with a well', propertyType: 'Farm House', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: 'Cobrokepur',
      addressHidden: 'Plot 4', askingPrice: 800000, ownerApprovedNetPrice: 760000, ownerName: 'Test Owner', ownerPhone: '9123450127' });
    expect(hr.status, (await hr.clone().text()).slice(0, 200)).toBe(200); H = (await j(hr)).property.id; await sleep(11500);
  });
  it('the customer confirms; nothing of broker 1 fits, the network has the home; broker 1 cannot show it yet', async () => {
    tok = tokOf(await scan('Kiran Cobroke', A, { locality: 'Cobrokepur', budget: '9 lakh', ptype: 'Farm House' })); expect(tok).toBeTruthy();
    expect((await form(undefined, `/q/chat/${tok}/ans`, { a: 'YES' })).status).toBe(303);
    const l = await lead('1271'); expect(l.chat.revealedAt).toBeFalsy(); expect(l.bot.network.count).toBeGreaterThan(0); expect(l.matches).toEqual([]);
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${l.id}/offer`, { homeId: H })).status).toBe(400);
  });
  it('he asks the network: broker 2 gets the need without the name or number, and answers “I have it” with his home', async () => {
    const l = await lead('1271'); const r = await call(jar.BRK1, 'POST', '/api/broadcast', { requirementId: l.bot.network.reqId }); expect(r.status, await r.clone().text()).toBe(200); bc = (await j(r)).broadcast.id;
    const it = ((await j(await call(jar.BRK2, 'GET', '/api/broadcast/inbox'))).items as any[]).find(x => x.id === bc); expect(it).toBeTruthy(); expect(JSON.stringify(it)).not.toMatch(/Kiran|9123411271|1271/);
    expect((await lead('1271')).matches).toEqual([]);   // asking is not enough
    expect((await call(jar.BRK2, 'POST', `/api/broadcast/${bc}/respond`, { propertyId: H, note: '' })).status).toBe(200);
  });
  it('now broker 1 can share it: the number opens, the home is in the chat and in the room, broker 2 is not named to the customer', async () => {
    const l = await lead('1271'); expect(l.matches.map((m: any) => m.id)).toEqual([H]);
    const o = await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${l.id}/offer`, { homeId: H }); expect(o.status, await o.clone().text()).toBe(200);
    expect((await lead('1271')).chat.revealedAt).toBeTruthy();
    const html = await chat(tok); expect(html).toContain('Cobroke farm house'); expect(html).not.toMatch(/Amit Verma|Shri Kripa/);
    const rooms = ((await j(await call(jar.BRK1, 'GET', '/api/client-rooms'))).rooms || []) as any[]; const rm = rooms.find(x => x.clientName === 'Kiran Cobroke'); expect(rm).toBeTruthy();
    expect(JSON.stringify(await j(await call(jar.BRK1, 'GET', `/api/client-rooms/${rm.id}`)))).toContain(H);
  });

  it('first to show holds the buyer on that home: the same customer through ANOTHER broker’s QR — that broker cannot share it, book a visit or make an offer; nobody is named; the customer is told plainly', async () => {
    jar.BRK3 = await login('USR-BRK-003');
    const bonds = await j(await call(jar.BRK1, 'GET', '/api/buyer-bonds/mine')); expect(bonds.bonds.some((b: any) => b.propertyId === H && b.source === 'SHOWN')).toBe(true);
    const r = await call(jar.BRK3, 'POST', '/api/shop-partners', { shopName: 'Second Store', personName: 'Mahesh Sahu', phone: '9876500127', area: 'Amlidih', city: 'Raipur', terms: TERMS, consent: true });
    expect(r.status, await r.clone().text()).toBe(200); const jj = await j(r); const token = jj.link.split('/sp/')[1];
    await form(undefined, `/sp/${token}/otp`, { phone: '9876500127' }); const code = (await j(await call(jar.BRK3, 'GET', '/api/shop-partners'))).partners.find((x: any) => x.id === jj.partner.id).codeForPartner;
    const ck = (await form(undefined, `/sp/${token}/verify`, { code })).headers.get('set-cookie')!.split(';')[0]; expect((await form(ck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
    const keep = qr; qr = jj.partner.qrCode; const tok3 = tokOf(await scan('Kiran Cobroke', A, { locality: 'Cobrokepur', budget: '9 lakh', ptype: 'Farm House' })); qr = keep; expect(tok3).toBeTruthy();
    expect((await form(undefined, `/q/chat/${tok3}/ans`, { a: 'YES' })).status).toBe(303);
    const l3 = ((await j(await call(jar.BRK3, 'GET', '/api/shop-partners'))).leads as any[]).find(x => x.phoneLast4 === '1271'); expect(l3.chat.revealedAt).toBeFalsy(); expect(l3.matches).toEqual([]);
    const html = await (await fetch(`${B}/q/chat/${tok3}`)).text(); expect(html).not.toContain('Cobroke farm house'); expect(html).toContain('already seeing with another GENZ broker'); expect(html).not.toMatch(/Vikram/);
    for (const [url, body] of [[`/api/shop-partners/leads/${l3.id}/offer`, { homeId: H }], ['/api/site-visits', { propertyId: H, customerName: 'Kiran', customerPhone: A, scheduledTime: new Date(Date.now() + 7200_000).toISOString() }], ['/api/offers', { propertyId: H, buyerName: 'Kiran', buyerPhone: A, consent: true, amount: 780000 }]] as const) {
      const x = await call(jar.BRK3, 'POST', url, body); expect(x.status, url).toBe(409); const b = await j(x); expect(b.code).toBe('BUYER_BONDED'); expect(JSON.stringify(b)).not.toMatch(/Vikram|USR-BRK-001/);
    }
  });
  it('the listing broker himself cannot take that buyer directly on his own home — until he is in broker 1’s deal on it', async () => {
    const body = () => ({ propertyId: H, customerName: 'Kiran', customerPhone: A, scheduledTime: new Date(Date.now() + 7200_000 + Math.random() * 3600_000).toISOString() });
    expect((await call(jar.BRK2, 'POST', '/api/site-visits', body())).status).toBe(409);
    const v = await call(jar.BRK1, 'POST', '/api/site-visits', body()); expect(v.status, await v.clone().text()).toBe(200); expect((await j(v)).dealRoom).toMatchObject({ introducingBrokerId: 'USR-BRK-001', closingBrokerId: 'USR-BRK-002' });
    expect((await call(jar.BRK2, 'POST', '/api/site-visits', body())).status).toBe(200);
  });
});
