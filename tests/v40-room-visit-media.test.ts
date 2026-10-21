/** v40 — Client Room: book a verified visit straight from the room (client's own mobile), and share the listing's photos / video */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { youtubeId, videoKind, okMediaUrl } from '../src/shared/roomMedia';

describe('room media helpers', () => {
  it('recognises YouTube / file / other links and refuses unsafe ones', () => {
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(videoKind('https://cdn.example.com/a.mp4')).toBe('FILE');
    expect(videoKind('https://drive.google.com/file/d/x/view')).toBe('LINK');
    expect(okMediaUrl('javascript:alert(1)')).toBe(false);
    expect(okMediaUrl('http://insecure.example/a.jpg')).toBe(false);
    expect(okMediaUrl('https://img.example/a.jpg"onerror=x')).toBe(false);
    expect(okMediaUrl('https://img.example/a.jpg')).toBe(true);
  });
});

const ROOT = path.resolve(__dirname, '..');
const PORT = 6900 + Math.floor(Math.random() * 90);
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v40-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const PHONE = '9123456780';
let room2: any; let room1: any; let token2 = '';
const newRoom = async (who: string, phone: string, name: string) => {
  const r = await call(jar[who], 'POST', '/api/client-rooms', { clientName: name, phone, kind: 'BUYER', consent: true });
  expect(r.status).toBe(200); return r.json();
};

describe('client room: photos & video', () => {
  it('a co-broker shares the listing photos (never the confidential video or papers); the listing broker may add his own video', async () => {
    const a = await newRoom('BRK2', PHONE, 'Ravi Client'); room2 = a.room; token2 = a.link.split('/r/')[1];
    const add = await call(jar.BRK2, 'POST', `/api/client-rooms/${room2.id}/items`, { propertyId: 'PROP-RAI-101' });
    expect(add.status).toBe(200);
    const item = (await add.json()).room.items[0];
    expect(item.media.photos.length).toBe(2); expect(item.media.videos.length).toBe(0);
    const m = await (await call(jar.BRK2, 'GET', `/api/client-rooms/${room2.id}/items/${item.id}/media`)).json();
    expect(m.available.photos.length).toBe(2); expect(m.available.videos).toEqual([]);
    expect(JSON.stringify(m)).not.toContain('.pdf');
    // only this listing's own links
    const bad = await call(jar.BRK2, 'PUT', `/api/client-rooms/${room2.id}/items/${item.id}/media`, { photos: ['https://evil.example/x.jpg'], videos: [] });
    expect(bad.status).toBe(400); expect((await bad.json()).code).toBe('MEDIA_NOT_SHAREABLE');
    const conf = await call(jar.BRK2, 'PUT', `/api/client-rooms/${room2.id}/items/${item.id}/media`, { photos: [], videos: ['https://www.w3schools.com/html/mov_bbb.mp4'] });
    expect(conf.status).toBe(400);
    const one = await call(jar.BRK2, 'PUT', `/api/client-rooms/${room2.id}/items/${item.id}/media`, { photos: [m.available.photos[1]], videos: [] });
    expect(one.status).toBe(200); expect((await one.json()).room.items[0].media.photos).toEqual([m.available.photos[1]]);
    // nobody else reads or changes another broker's room
    expect((await call(jar.BRK1, 'GET', `/api/client-rooms/${room2.id}/items/${item.id}/media`)).status).toBe(404);

    const b = await newRoom('BRK1', '9123456781', 'Own Client'); room1 = b.room;
    const add1 = await (await call(jar.BRK1, 'POST', `/api/client-rooms/${room1.id}/items`, { propertyId: 'PROP-RAI-101' })).json();
    const it1 = add1.room.items[0];
    expect(it1.media.videos).toEqual(['https://www.w3schools.com/html/mov_bbb.mp4']);
    const m1 = await (await call(jar.BRK1, 'GET', `/api/client-rooms/${room1.id}/items/${it1.id}/media`)).json();
    expect(m1.available.videos[0].kind).toBe('FILE'); expect(JSON.stringify(m1)).not.toContain('.pdf');
  });
});

describe('client room: visit booked from the room', () => {
  let cookie = ''; let itemId = ''; let reqId = '';
  it('the client opens his room, sees the chosen photo, and asks for a visit', async () => {
    expect((await form(undefined, `/r/${token2}/otp`, { phone: PHONE })).status).toBe(200);
    const code = (await (await call(jar.BRK2, 'GET', `/api/client-rooms/${room2.id}`)).json()).room.codeForClient;
    expect(code).toMatch(/^\d{6}$/);
    const v = await form(undefined, `/r/${token2}/verify`, { code });
    expect(v.status).toBe(303);
    cookie = (v.headers.get('set-cookie') || '').split(';')[0];
    const page = await (await fetch(`${B}/r/${token2}`, { headers: { cookie } })).text();
    expect(page).toContain('unsplash.com');
    const d = (await (await call(jar.BRK2, 'GET', `/api/client-rooms/${room2.id}`)).json()).room;
    itemId = d.items[0].id;
    const when = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 16);
    expect((await form(cookie, `/r/${token2}/visit`, { item: itemId, when, note: 'Sunday morning' })).status).toBe(303);
    reqId = (await (await call(jar.BRK2, 'GET', `/api/client-rooms/${room2.id}`)).json()).room.items[0].visitRequests[0].id;
    expect(reqId).toBeTruthy();
  });

  it('booking checks the room, the home and the client\'s own mobile; then the request is answered and the client sees the time', async () => {
    const base = { propertyId: 'PROP-RAI-101', customerName: 'Ravi Client', scheduledTime: new Date(Date.now() + 2 * 86400_000).toISOString(), clientRoomId: room2.id, clientRoomItemId: itemId, clientRoomRequestId: reqId };
    let r = await call(jar.BRK2, 'POST', '/api/site-visits', { ...base });
    expect(r.status).toBe(400); expect((await r.json()).code).toBe('ROOM_PHONE_NEEDED');
    r = await call(jar.BRK2, 'POST', '/api/site-visits', { ...base, customerPhone: '9000000001' });
    expect(r.status).toBe(400); expect((await r.json()).code).toBe('ROOM_PHONE_MISMATCH');
    r = await call(jar.BRK1, 'POST', '/api/site-visits', { ...base, customerPhone: PHONE });
    expect(r.status).toBe(404); // not his room
    r = await call(jar.BRK2, 'POST', '/api/site-visits', { ...base, propertyId: 'PROP-RAI-102', customerPhone: PHONE });
    expect(r.status).toBe(400); // that home is not this item
    r = await call(jar.BRK2, 'POST', '/api/site-visits', { ...base, customerPhone: PHONE });
    expect(r.status, await r.clone().text()).toBe(200);
    const visit = (await r.json()).siteVisit;
    const d = (await (await call(jar.BRK2, 'GET', `/api/client-rooms/${room2.id}`)).json()).room;
    expect(d.items[0].visits[0].visitId).toBe(visit.id);
    expect(d.items[0].visitRequests[0].status).toBe('HANDLED'); expect(d.items[0].visitRequests[0].visitId).toBe(visit.id);
    expect(d.openVisits).toBe(0);
    const page = await (await fetch(`${B}/r/${token2}`, { headers: { cookie } })).text();
    expect(page).toContain('विज़िट तय');
    expect(page).not.toContain(visit.otpCode); // the code never shows in the client's room
  });
});
