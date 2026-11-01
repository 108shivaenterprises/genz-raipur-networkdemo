import { freePort } from './helpers/port';
/**
 * v104 — photos & video in the QR chat, and a real video upload.
 *   · a home in the chat that has photos / a video shows a watermarked thumbnail + “see photos / video”; the page it opens plays YouTube, a video the broker
 *     uploaded, or a link, and shows the photos with the broker's name across them — all without a login, and only for a home that chat showed;
 *   · the assistant answers “photos / video?” from the listing (chips per home) and only hands over to the broker for a home with nothing;
 *   · the broker is told once per home that the customer opened the photos / video;
 *   · a video uploads as the raw file (checked, capped, streamed); an in-app upload is public ONLY while a live listing uses it, and plays with Range;
 *   · a sold / withdrawn home shows no media; the client room opens with the same public media.
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v104-')); mkdirSync(path.join(dir, 'data'));
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
const SHOP_PHONE = '9876500104';
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
  addressHidden: 'Lane 4, Shankar Nagar', askingPrice: price, ownerApprovedNetPrice: Math.round(price * 0.95), ownerName: 'Test Owner', ownerPhone: '9123450104', ...extra });
const mk = async (title: string, price: number, extra: Record<string, unknown> = {}) => { const r = await newHome(title, price, extra); expect(r.status, title + ' ' + (await r.clone().text()).slice(0, 200)).toBe(200); return (await j(r)).property.id as string; };

describe('photos & video in the chat, and a real video upload (v104)', { timeout: 180000 }, () => {
  const A = '9123410401'; let tokA = ''; let hYT = ''; let hUP = ''; let hNO = '';
  let imgUrl = ''; let vidUrl = ''; let vidId = ''; let imgId = '';

  it('pure rules: an in-app upload is read at /m/<id>; only a VID- file is an uploaded video', () => {
    expect(pubMediaUrl('/api/owner-media/f/IMG-0123456789ab')).toBe('/m/IMG-0123456789ab');
    expect(pubMediaUrl('/api/owner-media/f/VID-0123456789ab')).toBe('/m/VID-0123456789ab');
    expect(pubMediaUrl('https://x.test/a.jpg')).toBe('https://x.test/a.jpg'); expect(pubMediaUrl('/api/owner-media/f/DOC-0123456789ab')).toBe('/api/owner-media/f/DOC-0123456789ab');
    expect(isUploadedVideo('/m/VID-0123456789ab')).toBe(true); expect(isUploadedVideo('/api/owner-media/f/VID-0123456789ab')).toBe(true); expect(isUploadedVideo('/m/IMG-0123456789ab')).toBe(false);
    expect(videoKind('/m/VID-0123456789ab')).toBe('FILE'); expect(videoKind(YT)).toBe('YOUTUBE'); expect(videoKind('https://x.test/tour.mp4')).toBe('FILE');
  });

  it('upload: only mp4 / mov / webm, the first bytes must be a real video, over the cap is refused, signed-in only', async () => {
    expect((await upVideo(undefined, mp4(5000))).status).toBe(401);
    expect((await upVideo(jar.BRK1, mp4(5000), 'image/png')).status).toBe(415);                                   // wrong type
    expect((await upVideo(jar.BRK1, Buffer.alloc(4000, 65))).status).toBe(415);                                    // text pretending to be a video
    expect((await upVideo(jar.BRK1, mp4(100))).status).toBe(415);                                                  // too small to be a video
    const big = await upVideo(jar.BRK1, mp4(6 * 1024 * 1024)); expect(big.status).toBe(413);                       // VIDEO_MAX_MB=5 in this server
    expect((await big.json()).error).toMatch(/over 5 MB/);
    const ok = await upVideo(jar.BRK1, mp4(2 * 1024 * 1024)); expect(ok.status, await ok.clone().text()).toBe(200);
    const d = await ok.json(); expect(d.url).toMatch(/^\/api\/owner-media\/f\/VID-[0-9a-f]{12}$/); expect(d.size).toBe(2 * 1024 * 1024);
    vidUrl = d.url; vidId = d.id;
  });

  it('the stored file plays with Range for a signed-in member; a stranger gets nothing; /m/ is closed while no live listing uses it', async () => {
    const r = await fetch(B + vidUrl, { headers: { cookie: jar.BRK1, range: 'bytes=0-99' } });
    expect(r.status).toBe(206); expect(r.headers.get('content-range')).toBe(`bytes 0-99/${2 * 1024 * 1024}`); expect(r.headers.get('accept-ranges')).toBe('bytes'); expect(r.headers.get('content-type')).toBe('video/mp4');
    expect((await r.arrayBuffer()).byteLength).toBe(100);
    expect((await fetch(B + vidUrl, { headers: { range: 'bytes=0-9' } })).status).toBe(401);                       // /api/owner-media/f needs a login
    expect((await fetch(B + `/m/${vidId}`)).status).toBe(404);                                                     // no listing uses it yet
    expect((await fetch(B + '/m/VID-ffffffffffff')).status).toBe(404); expect((await fetch(B + '/m/..%2F..%2Fserver.ts')).status).toBe(404);
  });

  it('setup: a live QR, one photo uploaded in the app, and three homes — YouTube + photos, the uploaded video + the uploaded photo, and one with nothing', async () => {
    const p = await call(jar.BRK1, 'POST', '/api/owner-media/photo', { data: `data:image/jpeg;base64,${JPG}` }); expect(p.status).toBe(200);
    const pd = await j(p); imgUrl = pd.url; imgId = pd.id;
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Media Medical', personName: 'Ramesh Verma', phone: SHOP_PHONE, area: 'Shankar Nagar', city: 'Raipur', terms: TERMS, consent: true });
    expect(r.status).toBe(200); const jj = await j(r); partner = jj.partner; qr = jj.partner.qrCode; const token = jj.link.split('/sp/')[1];
    const ck = await partnerSignIn(token); expect((await form(ck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
    hYT = await mk('Media house with YouTube', 21000000, { images: ['https://photos.example.com/a.jpg', 'https://photos.example.com/b.jpg'], videoUrl: YT });
    hUP = await mk('Media house with uploaded video', 22000000, { images: [imgUrl], videoUrl: vidUrl });
    hNO = await mk('Media house with nothing', 23000000);
    await sleep(300);
  });

  it('now /m/ is open for the video and the photo (their listing is live) — Range works, nosniff, short private cache, and the id is checked', async () => {
    const r = await fetch(B + `/m/${vidId}`, { headers: { range: 'bytes=10-19' } });
    expect(r.status).toBe(206); expect(r.headers.get('content-range')).toBe(`bytes 10-19/${2 * 1024 * 1024}`); expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('cache-control') || '').toContain('private');
    expect((await fetch(B + `/m/${vidId}`, { method: 'HEAD' })).status).toBe(200);
    expect((await fetch(B + `/m/${vidId}`, { headers: { range: 'bytes=999999999-' } })).status).toBe(416);
    const ph = await fetch(B + `/m/${imgId}`); expect(ph.status).toBe(200); expect(ph.headers.get('content-type')).toBe('image/jpeg');
  });

  it('the customer confirms → the chat shows the homes; ones with media get a watermarked thumbnail + “see photos / video”, the empty one does not; the uploaded photo is served at /m/', async () => {
    tokA = tokOf(await scan('Asha Media', A)); expect(tokA).toBeTruthy();
    expect((await form(undefined, `/q/chat/${tokA}/ans`, { a: 'YES' })).status).toBe(303);
    const l = await lead('0401'); const ids = homesOf(l); expect(ids.length).toBeGreaterThan(0);
    const page = await chat(tokA);
    const shown = [hYT, hUP, hNO].filter(x => ids.includes(x));
    expect(shown.length).toBeGreaterThan(0);
    if (ids.includes(hYT)) { expect(page).toContain(`/q/chat/${tokA}/home/${hYT}`); expect(page).toContain('https://photos.example.com/a.jpg'); }
    if (ids.includes(hUP)) { expect(page).toContain(`/q/chat/${tokA}/home/${hUP}`); expect(page).toContain(`data-src="/m/${imgId}"`); }
    if (ids.includes(hNO)) expect(page).not.toContain(`/q/chat/${tokA}/home/${hNO}`);
    expect(page).toContain('data-testid="home-media"'); expect(page).toContain('/c/page.js'); expect(page).toContain('data-wm='); expect(page).not.toContain('/api/owner-media/f/');
  });

  // the three homes may not all be among the 3 shown first (the broker has other demo homes there) — make sure each is in his chat before testing its page
  it('he asks “photos / video?” → the assistant offers each home that has media as a chip (no hand-over to the broker); a home with nothing gets “ask the broker”', async () => {
    let l = await lead('0401');
    for (let i = 0; i < 4 && ![hYT, hUP, hNO].every(h => homesOf(l).includes(h)); i++) { expect((await tap(tokA, 'MORE')).status).toBe(303); l = await lead('0401'); }
    expect([hYT, hUP, hNO].every(h => homesOf(l).includes(h)), 'all three of the test homes are in his chat').toBe(true);
    expect((await say(tokA, 'photos aur video bhejo')).status).toBe(303);
    l = await lead('0401'); const last = bots(l).at(-1);
    expect(last.kind).toBe('CHIPS'); expect(last.text).toContain('📷'); const ids = last.chips.map((c: any) => c.id);
    expect(ids).toContain(`MEDIA:${hYT}`); expect(ids).toContain(`MEDIA:${hUP}`); expect(ids).not.toContain(`MEDIA:${hNO}`); expect(ids).toContain('HUMAN');
    expect(last.chips.find((c: any) => c.id === `MEDIA:${hYT}`).en).toMatch(/2 photos · 1 video/);
    expect(l.bot.needsBroker || '').not.toBe('photos');                                                              // the assistant answered; the broker was not called
  });

  it('tapping a media chip opens that home\'s page (no message is added to the chat)', async () => {
    const before = (await lead('0401')).chat.msgs.length;
    const r = await tap(tokA, `MEDIA:${hYT}`); expect(r.status).toBe(303); expect(r.headers.get('location')).toBe(`/q/chat/${tokA}/home/${hYT}`);
    expect((await lead('0401')).chat.msgs.length).toBe(before);
  });

  it('the YouTube home\'s page: watermarked photos, the embedded video, visit / talk buttons — and it never shows a login-only link', async () => {
    const r = await preview(tokA, hYT); expect(r.status).toBe(200); expect(r.headers.get('cache-control')).toContain('no-store');
    const html = await r.text();
    expect(html).toContain('Media house with YouTube'); expect(html).toContain('data-src="https://photos.example.com/a.jpg"'); expect(html).toContain('data-src="https://photos.example.com/b.jpg"');
    expect(html).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'); expect(html).toContain('data-testid="media-video-yt"');
    expect(html).toContain(`value="VISITH:${hYT}"`); expect(html).toContain('data-testid="media-human"'); expect(html).toContain('/c/page.js'); expect(html).not.toContain('/api/owner-media/f/');
    expect(html).toMatch(/data-wm="[^"]*GENZ"/);
  });

  it('the uploaded-video home\'s page plays the file right in the page (a <video> on /m/) and shows the uploaded photo at /m/', async () => {
    const html = await (await preview(tokA, hUP)).text();
    expect(html).toContain('data-testid="media-video-file"'); expect(html).toContain(`<video src="/m/${vidId}"`); expect(html).toContain('controls'); expect(html).toContain('playsinline');
    expect(html).toContain(`data-src="/m/${imgId}"`); expect(html).not.toContain('/api/owner-media/f/');
  });

  it('a home with nothing: the page says so and offers “ask for photos” — which calls the broker (and only then)', async () => {
    const html = await (await preview(tokA, hNO)).text();
    expect(html).toContain('data-testid="media-none"'); expect(html).toContain('data-testid="media-ask"'); expect(html).toContain(`value="MEDIAREQ:${hNO}"`);
    expect((await lead('0401')).bot.needsBroker || '').not.toBe('photos');
    expect((await tap(tokA, `MEDIAREQ:${hNO}`)).status).toBe(303);
    const l = await lead('0401'); expect(l.bot.needsBroker).toBe('photos');
    const last = bots(l).at(-1); expect(last.text).toContain('Media house with nothing'); expect(last.text).toContain('ब्रोकर'); 
  });

  it('only a home THIS chat showed has a page: a stranger\'s link, a made-up id, another home → back to the chat; a wrong link → 404', async () => {
    const l = await lead('0401'); const shownIds = new Set(homesOf(l));
    const other = (await j(await call(jar.BRK1, 'GET', '/api/properties'))).properties?.find((p: any) => !shownIds.has(p.id))?.id;
    if (other) { const r = await preview(tokA, other); expect(r.status).toBe(303); expect(r.headers.get('location')).toBe(`/q/chat/${tokA}`); }
    expect((await preview(tokA, 'PROP-nope')).status).toBe(303); expect((await preview(tokA, '..%2Fx')).status).toBe(303);
    expect((await preview('A'.repeat(30), hYT)).status).toBe(404);
  });

  it('the broker is told ONCE per home that he opened the photos / video (two views = one bell); a home with nothing is not "viewed"', async () => {
    await preview(tokA, hYT); await preview(tokA, hUP); await preview(tokA, hUP); await preview(tokA, hNO);
    const l = await lead('0401'); const viewed = (l.bot.viewed || []) as string[];
    expect(viewed).toContain(hYT); expect(viewed).toContain(hUP); expect(viewed).not.toContain(hNO);
    const bells = (await inbox()).filter(i => /फ़ोटो\/वीडियो देखे/.test(i.title) && /Asha Media/.test(i.title));
    expect(bells.length).toBeLessThanOrEqual(2); expect(bells.length).toBeGreaterThan(0);
  });

  it('his client room opens with the same PUBLIC photos / video the chat showed (an /m/ link, never the login-only one)', async () => {
    const r = await tap(tokA, 'ROOM'); expect(r.status).toBe(303);
    const l = await lead('0401');
    const rooms = (await j(await call(jar.BRK1, 'GET', '/api/client-rooms'))).rooms as any[];
    const room = rooms.find(x => /Asha Media/.test(x.clientName)); expect(room, 'room').toBeTruthy();
    const det = (await j(await call(jar.BRK1, 'GET', `/api/client-rooms/${room.id}`))).room;
    const it = det.items.find((i: any) => i.propertyId === hUP); expect(it, 'item').toBeTruthy();
    expect(it.media.videos).toContain(`/m/${vidId}`); expect(it.media.photos).toContain(`/m/${imgId}`);
    const yt = det.items.find((i: any) => i.propertyId === hYT); expect(yt.media.videos).toContain(YT);
    expect(l.bot.roomId || det.id).toBeTruthy();
  });

  it('a sold home: its page says so, shows NO photos or video, the chat card has no media link, and its uploaded files close at /m/', async () => {
    expect((await call(jar.BRK1, 'POST', `/api/listings/${hUP}/status`, { status: 'sold', soldVia: 'OUTSIDE' })).status).toBe(200);
    await sleep(400);
    const html = await (await preview(tokA, hUP)).text();
    expect(html).toContain('data-testid="media-gone"'); expect(html).not.toContain('<video'); expect(html).not.toContain('<canvas');
    expect(await chat(tokA)).not.toContain(`/q/chat/${tokA}/home/${hUP}`);
    expect((await fetch(B + `/m/${vidId}`)).status).toBe(404); expect((await fetch(B + `/m/${imgId}`)).status).toBe(404);
    expect((await fetch(B + vidUrl, { headers: { cookie: jar.BRK1 } })).status).toBe(200);                         // the broker himself still reaches his own file
  });
});
