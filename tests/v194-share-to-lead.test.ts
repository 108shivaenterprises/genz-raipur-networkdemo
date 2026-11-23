import { freePort } from './helpers/port';
/**
 * v194 (round 14) — share to a QR lead before his number opens; liked homes; blocked manual room; plainDigits. Rig copied from v105. (was: the assistant keeps the customer's client room level with his chat:
 *   · a home shown AFTER the room opened (a tap on “more homes”, a new listing, a home the broker sent) goes into the room by itself, with its public photos;
 *   · a home the broker took out of the room is not put back;
 *   · when the broker already has an open room for the same number, the homes go into THAT room (the customer's chat does not get a second link).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v194-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, QUIET_HOURS: 'off', KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PUSH_DRY_RUN: 'true', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true', REVEAL_FRESH_LISTING_HOURS: '0.003', VIDEO_MAX_MB: '5' },
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


import { contactKind } from '../src/shared/clientRoomRules';

describe('v194 · number words glued together', () => {
  it.each(['Nine four nine four two oneseven three eight eight', 'nine four nine four two one seven three eight eight', 'nauaath saat chhe paanch char teen do ek nau', '९४९४ दो एकसात ३८८'])('"%s" is caught as a phone number (broker and client use the same guard)', s => {
    expect(contactKind(s)).toBe('PHONE');
  });
  it('ordinary words are left alone', () => { for (const s of ['someone tone phone', 'I want one house, two bhk, 30 lakh', 'done and gone']) expect(contactKind(s), s).toBe(null); });
});

describe('v194 · share to a QR lead (HTTP)', { timeout: 180000 }, () => {
  const A = '9123419401'; let tokA = ''; const hs: string[] = []; let L: any; let reqId = '';
  const reqOf = async () => ((await j(await call(jar.BRK1, 'GET', '/api/requirements'))).requirements || []).find((q: any) => q.leadId === L.id);
  it('setup: QR, 5 homes, a customer scans and confirms', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Share Medical', personName: 'Ramesh Verma', phone: SHOP_PHONE, area: 'Shankar Nagar', city: 'Raipur', terms: TERMS, consent: true });
    expect(r.status).toBe(200); const jj = await j(r); partner = jj.partner; qr = jj.partner.qrCode; const token = jj.link.split('/sp/')[1];
    const ck = await partnerSignIn(token); expect((await form(ck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
    for (let i = 1; i <= 5; i++) hs.push(await mk(`Share house ${i}`, 20000000 + i * 100000));
    await sleep(300);
    tokA = tokOf(await scan('Suyash Share', A)); expect(tokA).toBeTruthy();
    expect((await form(undefined, `/q/chat/${tokA}/ans`, { a: 'YES' })).status).toBe(303);
    L = await lead('9401'); expect(L).toBeTruthy(); expect(L.chat.revealedAt).toBeFalsy();
    const q = await reqOf(); expect(q, 'the need exists with the lead id').toBeTruthy(); reqId = q.id;
  });
  it('the manual room form is blocked for a lead whose room is already there (no mobile number needed)', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/client-rooms', { leadId: L.id, clientName: 'Suyash Share', phone: '', consent: true });
    expect(r.status).toBe(409); const b = await j(r); expect(b.code).toBe('ROOM_READY'); expect(b.errorHi).toBeTruthy();
  });
  it('matching carries the liked list; the broker shares a home with the lead before the number opens (spOffer)', async () => {
    const m = await j(await call(jar.BRK1, 'GET', `/api/matching/requirement/${reqId}`)); expect(Array.isArray(m.liked)).toBe(true); expect(m.liked.length).toBe(0);
    const pick = m.matches.map((x: any) => x.property.id).find((id: string) => hs.includes(id)) || hs[4];
    const o = await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${L.id}/offer`, { homeId: pick }); expect(o.status, (await o.clone().text()).slice(0, 200)).toBe(200);
    const l2 = await lead('9401'); expect(homesOf(l2)).toContain(pick);
    expect(JSON.stringify(await j(await call(jar.BRK1, 'GET', `/api/matching/requirement/${reqId}`)))).not.toContain(A);   // the number is not in the match payload
  });
  it('a customer 👍 puts the home in liked (the co-broking trigger)', async () => {
    const l = await lead('9401'); const h = homesOf(l)[0];
    expect((await form(undefined, `/q/chat/${tokA}/like`, { h, v: '0' })).status).toBe(303);
    const m = await j(await call(jar.BRK1, 'GET', `/api/matching/requirement/${reqId}`)); expect(m.liked).toContain(h);
  });
  it('LISTING_TOO_NEW carries the time it opens (the screen shows it instead of a dead error)', () => {
    expect(readFileSync(path.join(ROOT, 'server/shopPartners.ts'), 'utf8')).toContain("code: 'LISTING_TOO_NEW', availableAt");
    expect(readFileSync(path.join(ROOT, 'src/components/MatchCenterView.tsx'), 'utf8')).toContain('can be shared from');
  });
});

describe('v195 · room share + like data for a normal client', { timeout: 120000 }, () => {
  it('the room detail of a QR lead carries its lead id; the room screen shares through the lead, with the 48h time', () => {
    expect(readFileSync(path.join(ROOT, 'server/clientroom.ts'), 'utf8')).toContain('leadId: st().partnerLeads.find(');
    const ui = readFileSync(path.join(ROOT, 'src/components/ClientRooms.tsx'), 'utf8'); expect(ui).toContain('api.spOffer(r.leadId, pick)'); expect(ui).toContain('can be shared from'); expect(ui).toContain('Share with ${');
  });
  it('matching returns roomId for a normal client; buyer-account saves count as likes; V123 "go to his room"', () => {
    const s = readFileSync(path.join(ROOT, 'server.ts'), 'utf8'); expect(s).toContain('roomIdByPhone(currentUser.id, phoneOfReq(requirement))'); expect(s).toContain('db.getState().savedProperties.filter(s => s.userId === q.buyerId)');
    expect(readFileSync(path.join(ROOT, 'src/components/MatchCenterView.tsx'), 'utf8')).toContain('Go to his client room');
  });
  it('HTTP: a QR lead room (after the number opens) shows leadId in its detail', async () => {
    const l = await lead('9401'); await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${l.id}/visit`, { homeId: homesOf(l)[0], when: 'Sunday 11 am' });
    const rooms = ((await j(await call(jar.BRK1, 'GET', '/api/client-rooms'))).rooms || []) as any[]; const rm = rooms.find(x => x.clientName === 'Suyash Share'); expect(rm).toBeTruthy();
    const d = (await j(await call(jar.BRK1, 'GET', `/api/client-rooms/${rm.id}`))).room; expect(d.leadId).toBe(l.id); expect(d.phoneLast4).toBe('9401');
  });
});

import { humanIso } from '../src/shared/clientRoomRules';
describe('v196 · round 15 fixes', { timeout: 120000 }, () => {
  it('humanIso turns a raw ISO time into an Indian-time date; plain text is untouched', () => {
    const o = humanIso('Visit at 2026-11-24T18:53:20.110Z ok'); expect(o).not.toMatch(/T18:53/); expect(o).toMatch(/24 Nov|25 Nov/); expect(humanIso('Sunday 11 am')).toBe('Sunday 11 am');
  });
  it('run-together number words with "ate" are caught', () => { expect(contactKind('ninefour ninefour twoone seventhree eightate')).toBe('PHONE'); });
  it('HTTP: matching says per home whether Share is allowed (same rule as /offer); rejected homes carry a reason', async () => {
    const l = await lead('9401'); const q = ((await j(await call(jar.BRK1, 'GET', '/api/requirements'))).requirements || []).find((x: any) => x.leadId === l.id);
    const m = await j(await call(jar.BRK1, 'GET', `/api/matching/requirement/${q.id}`)); expect(m.share).toBeTruthy();
    for (const x of m.matches) { const c = m.share[x.property.id]; expect(c, x.property.id).toBeTruthy(); if (!c.ok) expect(['NOT_READY', 'HELD', 'TOO_NEW', 'NO_MATCH']).toContain(c.code);
      else { const o = await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${l.id}/offer`, { homeId: x.property.id }); expect(o.status, x.property.id).toBe(200); break; } }
    const bad = m.matches.find((x: any) => m.share[x.property.id]?.ok === false);
    if (bad) { const o = await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${l.id}/offer`, { homeId: bad.property.id }); expect(o.status).toBeGreaterThanOrEqual(400); }
  });
  it('source guards: chat portal, picker inside the viewport + current room only, deep link, no 3-line wrap', () => {
    const f = (x: string) => readFileSync(path.join(ROOT, x), 'utf8');
    expect(f('src/components/ChatKit.tsx')).toContain('createPortal(shell, document.body)');
    const s = f('src/components/ShareToRoom.tsx'); expect(s).toContain('fixed inset-x-3'); expect(s).toContain('roomId');
    expect(f('src/components/MatchCenterView.tsx')).toContain('match-share-why'); expect(f('src/components/MatchCenterView.tsx')).toContain('shrink-0 whitespace-nowrap');
    expect(f('src/components/ShopPartners.tsx')).toContain("'genz.openroom'"); expect(f('src/components/ClientRooms.tsx')).toContain("'genz.openroom'");
  });
});
