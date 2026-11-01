import { freePort } from './helpers/port';
/**
 * v105 — the assistant keeps the customer's client room level with his chat:
 *   · a home shown AFTER the room opened (a tap on “more homes”, a new listing, a home the broker sent) goes into the room by itself, with its public photos;
 *   · a home the broker took out of the room is not put back;
 *   · when the broker already has an open room for the same number, the homes go into THAT room (the customer's chat does not get a second link).
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v105-')); mkdirSync(path.join(dir, 'data'));
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

describe('the client room follows the chat (v105)', { timeout: 180000 }, () => {
  const A = '9123410501'; const C = '9123410503'; let tokA = ''; let tokC = ''; const hs: string[] = [];
  let imgId = ''; let imgUrl = '';

  const rooms = async () => ((await j(await call(jar.BRK1, 'GET', '/api/client-rooms'))).rooms || []) as any[];
  const roomOf = async (name: string) => { const r = (await rooms()).find(x => x.clientName === name); return r ? (await j(await call(jar.BRK1, 'GET', `/api/client-rooms/${r.id}`))).room : null; };
  const roomHomes = async (name: string): Promise<string[]> => ((await roomOf(name))?.items || []).map((i: any) => i.propertyId);
  const until = async <T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 4000) => { const end = Date.now() + ms; let v = await fn(); while (Date.now() < end && !ok(v)) { await sleep(150); v = await fn(); } return v; };

  it('setup: a live QR and five homes of his in Shankar Nagar (one with an uploaded photo), made before anybody scans', async () => {
    const p = await call(jar.BRK1, 'POST', '/api/owner-media/photo', { data: `data:image/jpeg;base64,${JPG}` }); expect(p.status).toBe(200); const pd = await j(p); imgUrl = pd.url; imgId = pd.id;
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Room Medical', personName: 'Ramesh Verma', phone: SHOP_PHONE, area: 'Shankar Nagar', city: 'Raipur', terms: TERMS, consent: true });
    expect(r.status).toBe(200); const jj = await j(r); partner = jj.partner; qr = jj.partner.qrCode; const token = jj.link.split('/sp/')[1];
    const ck = await partnerSignIn(token); expect((await form(ck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
    for (let i = 1; i <= 5; i++) hs.push(await mk(`Room sync house ${i}`, 20000000 + i * 100000, i === 1 ? { images: [imgUrl] } : {}));
    await sleep(300);
  });

  it('A confirms → the assistant shows 3 homes and opens his room with those 3 (and the public photo as an /m/ link)', async () => {
    tokA = tokOf(await scan('Asha Room', A)); expect(tokA).toBeTruthy();
    expect((await form(undefined, `/q/chat/${tokA}/ans`, { a: 'YES' })).status).toBe(303);
    const l = await lead('0501'); const shown = homesOf(l); expect(shown.length).toBe(3);
    const inRoom = await roomHomes('Asha Room'); expect([...inRoom].sort()).toEqual([...shown].sort());
    const room = await roomOf('Asha Room'); const withPhoto = room.items.find((i: any) => i.propertyId === hs[0]);
    if (withPhoto) expect(withPhoto.media.photos).toContain(`/m/${imgId}`);
  });

  it('A taps “more homes” → the next homes are in the chat AND in his room (before this fix the room stayed at the first 3)', async () => {
    expect((await tap(tokA, 'MORE')).status).toBe(303);
    const l = await lead('0501'); const shown = homesOf(l); expect(shown.length).toBeGreaterThan(3);
    const inRoom = await until(() => roomHomes('Asha Room'), v => shown.every(x => v.includes(x)));
    for (const h of shown) expect(inRoom, h).toContain(h);
    expect(inRoom.length).toBe(new Set(inRoom).size);                                                                  // no home twice
  });

  it('a NEW listing that fits (the assistant shows it by itself) → it lands in his room too', async () => {
    const h6 = await mk('Room sync house 6 (new)', 20600000); hs.push(h6);
    const l = await until(() => lead('0501'), x => homesOf(x).includes(h6), 5000); expect(homesOf(l)).toContain(h6);
    expect(await until(() => roomHomes('Asha Room'), v => v.includes(h6))).toContain(h6);
  });

  it('the broker takes a home out of the room → opening the chat again does NOT put it back; a home he sends in the chat later does arrive', async () => {
    const room = await roomOf('Asha Room'); const gone = room.items[0];
    expect((await call(jar.BRK1, 'DELETE', `/api/client-rooms/${room.id}/items/${gone.id}`)).status).toBe(200);
    await chat(tokA); await chat(tokA);                                                                                   // opening the chat runs the follow-up
    expect(await roomHomes('Asha Room')).not.toContain(gone.propertyId);
  });

  it('the broker already has an open room for the same number → the homes go into THAT room; the customer is not given a second link', async () => {
    const mkRoom = await call(jar.BRK1, 'POST', '/api/client-rooms', { clientName: 'Chetan Room', phone: C, kind: 'BUYER', consent: true }); expect(mkRoom.status, await mkRoom.clone().text()).toBe(200);
    tokC = tokOf(await scan('Chetan Room', C)); expect(tokC).toBeTruthy();
    expect((await form(undefined, `/q/chat/${tokC}/ans`, { a: 'YES' })).status).toBe(303);
    const l = await lead('0503'); const shown = homesOf(l); expect(shown.length).toBeGreaterThan(0);
    const inRoom = await until(() => roomHomes('Chetan Room'), v => shown.every(x => v.includes(x))); for (const h of shown) expect(inRoom, h).toContain(h);
    expect((await rooms()).filter(x => x.clientName === 'Chetan Room' && x.status === 'ACTIVE').length).toBe(1);        // still one room
    expect(await chat(tokC)).not.toContain('data-testid="chat-room"');                                                  // its link is the broker's to send
    expect((await tap(tokC, 'MORE')).status).toBe(303);
    const more = homesOf(await lead('0503')); const again = await until(() => roomHomes('Chetan Room'), v => more.every(x => v.includes(x))); for (const h of more) expect(again, h).toContain(h);
  });

  it('a home the broker sends from his screen (not the assistant) is in the room as well', async () => {
    const l = await lead('0501');
    const extra = await mk('Room sync house 7 (sent by the broker)', 20700000); hs.push(extra);
    await sleep(500);
    expect(homesOf(await lead('0501')), 'the assistant waits 4 h between pushes, so this home is not in the chat yet').not.toContain(extra);
    const r = await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${l.id}/offer`, { homeId: extra }); expect(r.status, await r.clone().text()).toBe(200);
    expect(await until(() => roomHomes('Asha Room'), v => v.includes(extra))).toContain(extra);
  });
});
