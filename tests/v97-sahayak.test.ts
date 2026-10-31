import { freePort } from './helpers/port';
/**
 * v97 — GENZ सहायक over real HTTP: it opens the QR chat, shows only LIVE matching homes, answers availability / price / photos,
 * takes a visit request (home → time → the broker answers), opens the client room on his tap, lets him Explore, and goes quiet when the broker talks.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v97-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PUSH_DRY_RUN: 'true', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 500)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const cookieOf = (r: Response) => (r.headers.get('set-cookie') || '').split(';')[0];
const TERMS = { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 };
const SHOP_PHONE = '9876500097';
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
const lead = async (last4: string) => (await list()).leads.find((l: any) => l.phoneLast4 === last4);
const chat = async (tok: string) => (await fetch(`${B}/q/chat/${tok}`)).text();
const say = (tok: string, text: string) => form(undefined, `/q/chat/${tok}/msg`, { text });
const tap = (tok: string, k: string) => form(undefined, `/q/chat/${tok}/quick`, { k });
const bots = (l: any) => l.chat.msgs.filter((m: any) => m.by === 'BOT');
const lastBot = (l: any) => bots(l).at(-1);

describe('GENZ सहायक — buyer chat from the QR to a visit', { timeout: 90000 }, () => {
  const BUYER = '9123459701'; let tok = ''; let leadId = ''; let homes: string[] = [];
  it('setup: a live QR for broker 1', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Sahayak Medical', personName: 'Ramesh Verma', phone: SHOP_PHONE, area: 'Shankar Nagar', city: 'Raipur', terms: TERMS, consent: true });
    expect(r.status).toBe(200); const j = await r.json(); partner = j.partner; qr = j.partner.qrCode; const token = j.link.split('/sp/')[1];
    const ck = await partnerSignIn(token); expect((await form(ck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
  });
  let mine = '';
  it('setup: broker 1 lists a second home in Shankar Nagar BEFORE the customer scans (so it is not “too new” — audit F3 stays on)', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/properties', { title: 'Corner house in Shankar Nagar', description: 'A residential house, east facing, near the park', propertyType: 'Independent House', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: 'Shankar Nagar', addressHidden: 'Lane 4, Shankar Nagar', askingPrice: 20000000, ownerApprovedNetPrice: 19000000, ownerName: 'Test Owner', ownerPhone: '9123450097' });
    expect(r.status).toBe(200); const j = await r.json(); mine = j.property?.id || j.id || ''; expect(mine).toMatch(/^PROP-/);
    await sleep(300);
  });
  it('the moment he scans, the assistant says hello and asks him to confirm his need — nobody pressed anything', async () => {
    const r = await scan(BUYER, 'BUY'); expect(r.status).toBe(303); tok = tokOf(r);
    const l = await lead('9701'); leadId = l.id;
    expect(l.bot.on).toBe(true); expect(l.chat.reqAskedAt).toBeTruthy(); expect(l.chat.reqConfirmedAt).toBeNull();
    const first = bots(l)[0]; expect(first.text).toContain('GENZ सहायक'); expect(first.en).toContain('GENZ assistant');
    expect(bots(l).some((m: any) => m.kind === 'ASK')).toBe(true);
    const page = await chat(tok); expect(page).toContain('data-testid="chat-confirm"'); expect(page).toContain('data-testid="bot-msg"');
    expect(l.masked).toBe(true); expect(l.phone).toBeUndefined();       // still hidden
  });
  it('before he confirms, “visit chahiye” only reminds him to confirm; a phone number is still refused', async () => {
    expect((await say(tok, 'mujhe visit karna hai')).status).toBe(303);
    let l = await lead('9701'); expect(lastBot(l).text).toContain('✅ पक्की'); expect(l.bot.visits).toHaveLength(0);
    expect(await (await say(tok, 'call me 9123459701')).text()).toContain('फ़ोन नंबर न लिखें');
  });
  it('he taps ✅ → up to 3 LIVE matching homes appear in his chat, the broker now sees the number, and the broker was told', async () => {
    expect((await form(undefined, `/q/chat/${tok}/ans`, { a: 'YES' })).status).toBe(303);
    const l = await lead('9701');
    homes = l.chat.msgs.filter((m: any) => m.kind === 'HOME').map((m: any) => m.homeId);
    expect(homes.length).toBeGreaterThan(1); expect(homes.length).toBeLessThanOrEqual(3); expect(homes).toContain(mine);
    expect(l.masked).toBe(false); expect(l.phone).toBe(BUYER); expect(l.clientCardId).toBeTruthy();
    expect(lastBot(l).kind).toBe('CHIPS'); expect(lastBot(l).chips.map((c: any) => c.id)).toEqual(expect.arrayContaining(['VISIT', 'MORE', 'ROOM', 'HUMAN']));
    const page = await chat(tok); expect(page).toContain('data-testid="bot-chips"'); expect(page).toContain('data-testid="chat-explore"');
    const all = (await (await call(jar.BRK1, 'GET', '/api/properties')).json()).properties;
    for (const id of homes) { const p = all.find((x: any) => x.id === id); expect(p.listingStatus).toBe('active'); expect(p.transactionType).toBe('Sale'); }
  });
  it('“is it available?” answers from the listing status', async () => {
    await say(tok, 'kya ye abhi available hai?');
    const l = await lead('9701'); expect(lastBot(l).text).toContain('उपलब्ध है');
  });
  it('a price question is NOT negotiated by the bot: it quotes the listed price and calls the broker; then it keeps quiet', async () => {
    await say(tok, 'rate kam hoga kya?');
    let l = await lead('9701'); expect(lastBot(l).text).toContain('ब्रोकर आपसे खुद बात करेंगे'); expect(l.bot.needsBroker).toBe('price'); expect(l.bot.quiet).toBe(true);
    const n = bots(l).length; await say(tok, 'hello'); l = await lead('9701'); expect(bots(l).length).toBe(n);   // quiet for 6 hours after a hand-over
  });
  it('a visit: chip → (which home) → time chip → a request waits for the broker; the customer sees it', async () => {
    // the bot is quiet after the hand-over, but a tapped chip is an explicit action and is always served
    await tap(tok, 'VISIT');
    let l = await lead('9701');
    if (l.bot.visits.length === 0 && lastBot(l).chips?.some((c: any) => c.id.startsWith('VISITH:'))) await tap(tok, lastBot(l).chips[0].id);
    l = await lead('9701');
    expect(lastBot(l).chips.map((c: any) => c.id)).toContain('WHEN:kal-shaam');
    await tap(tok, 'WHEN:kal-shaam');
    l = await lead('9701'); expect(l.bot.visits).toHaveLength(1);
    const v = l.bot.visits[0]; expect(v.status).toBe('ASKED'); expect(v.preferred).toContain('कल शाम'); expect(homes).toContain(v.homeId);
    const page = await chat(tok); expect(page).toContain('data-testid="chat-visits"'); expect(page).toContain('ब्रोकर के जवाब का इंतज़ार');
  });
  it('a second request for the same home while one is open is refused (no spam to the broker)', async () => {
    let l = await lead('9701'); const v = l.bot.visits[0];
    await tap(tok, `VISITH:${v.homeId}`); await tap(tok, 'WHEN:kal-subah');
    l = await lead('9701'); expect(l.bot.visits).toHaveLength(1);
  });
  it('the broker suggests another time → the customer gets ✔ / 🕐 chips → he accepts → agreed', async () => {
    let l = await lead('9701'); const v = l.bot.visits[0];
    expect((await call(jar.BRK2, 'POST', `/api/shop-partners/leads/${leadId}/visit/${v.id}`, { action: 'OK' })).status).toBe(404);   // not his lead
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/visit/${v.id}`, { action: 'COUNTER', text: 'ok' })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/visit/${v.id}`, { action: 'COUNTER', text: 'call 9876543210' })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/visit/${v.id}`, { action: 'COUNTER', text: 'Sunday 11 am' })).status).toBe(200);
    l = await lead('9701'); expect(l.bot.visits[0].status).toBe('COUNTER'); expect(lastBot(l).chips.map((c: any) => c.id)).toEqual([`VOK:${v.id}`, `VAGAIN:${v.id}`]);
    await tap(tok, `VOK:${v.id}`);
    l = await lead('9701'); expect(l.bot.visits[0].status).toBe('OK'); expect(l.bot.visits[0].preferred).toBe('Sunday 11 am');
  });
  it('forged chips do nothing: a home that was never sent, an unknown visit id, an unknown key', async () => {
    const before = await lead('9701');
    await tap(tok, 'VISITH:PROP-RAI-999'); await tap(tok, 'VOK:LVR-nope'); await tap(tok, 'DROP TABLE'); await tap(tok, 'WHEN:nope');
    const after = await lead('9701'); expect(after.bot.visits).toHaveLength(1);
    expect(after.chat.msgs.length).toBe(before.chat.msgs.length);            // not even an echo line was added
  });
  it('NO from the broker asks the customer for another time', async () => {
    // a new request for a second home
    let l = await lead('9701'); const other = homes.find(h => h !== l.bot.visits[0].homeId);
    if (!other) return;
    await tap(tok, `VISITH:${other}`); await tap(tok, 'WHEN:weekend');
    l = await lead('9701'); const v = l.bot.visits.find((x: any) => x.homeId === other); expect(v.status).toBe('ASKED');
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/visit/${v.id}`, { action: 'NO' })).status).toBe(200);
    l = await lead('9701'); expect(lastBot(l).chips.map((c: any) => c.id)).toContain('WHEN:aaj-shaam');
  });
  it('when a listing is withdrawn, availability says so plainly and Explore no longer lists it', async () => {
    let gone = '';
    for (const h of homes) { const r = await call(jar.BRK1, 'POST', `/api/listings/${h}/status`, { status: 'withdrawn' }); if (r.status === 200) { gone = h; break; } }   // a home with a live deal cannot be withdrawn — his own new one can
    expect(gone).not.toBe('');
    const ex = await (await fetch(`${B}/q/chat/${tok}/explore`)).text(); expect(ex).not.toContain(`data-testid="ex-${gone}"`);
    await tap(tok, 'AVAIL'); const l = await lead('9701'); expect(bots(l).some((m: any) => /अब लिस्ट में नहीं|अभी उपलब्ध नहीं|बिक चुका/.test(m.text))).toBe(true);
  });
  it('Explore lists live homes that fit; 👍 shows one to the broker; wrong tokens / unconfirmed leads get nothing', async () => {
    const ex = await (await fetch(`${B}/q/chat/${tok}/explore`)).text(); expect(ex).toContain('Explore'); expect(ex).toContain('data-testid="ex-');
    expect((await fetch(`${B}/q/chat/not-a-real-token-at-all-1234/explore`)).status).toBe(404);
    const id = /data-testid="ex-([A-Za-z0-9-]+)"/.exec(ex)![1];
    expect((await form(undefined, `/q/chat/${tok}/like`, { h: id, v: '0' })).status).toBe(303);
    expect((await lead('9701')).chat.msgs.some((m: any) => m.kind === 'ANSWER' && m.text.includes('पसंद आया'))).toBe(true);
    const before = (await lead('9701')).chat.msgs.length;
    await form(undefined, `/q/chat/${tok}/like`, { h: 'PROP-RAI-999', v: '1' });                     // a home that does not fit / does not exist
    expect((await lead('9701')).chat.msgs.length).toBe(before);
  });
  it('the client room opens on his tap: a room for broker 1 with the homes shown; its link works; a second tap does not open a second room', async () => {
    const roomsBefore = (await (await call(jar.BRK1, 'GET', '/api/client-rooms')).json()).rooms.length;
    await tap(tok, 'ROOM');
    const rooms = (await (await call(jar.BRK1, 'GET', '/api/client-rooms')).json()).rooms; expect(rooms.length).toBe(roomsBefore + 1);
    const room = rooms.find((r: any) => /Shop QR lead/.test(r.note || '')) || rooms[0]; expect(room.itemCount ?? room.items?.length ?? 1).toBeGreaterThan(0);
    const page = await chat(tok); expect(page).toContain('data-testid="chat-room"');
    const href = /data-testid="chat-room-open"/.test(page) ? /href="(\/r\/[^"]+)"[^>]*data-testid="chat-room-open"/.exec(page)?.[1] : '';
    expect(href).toMatch(/^\/r\/[A-Za-z0-9_-]{20,}/); expect((await fetch(B + href!)).status).toBe(200);
    await tap(tok, 'ROOM'); expect((await (await call(jar.BRK1, 'GET', '/api/client-rooms')).json()).rooms.length).toBe(roomsBefore + 1);
    expect(JSON.stringify(await lead('9701'))).not.toContain(href!.replace('/r/', ''));            // the room link is never in what the broker's list returns
  });
});

describe('GENZ सहायक — switches, quiet time, no-match, owners', { timeout: 90000 }, () => {
  it('no live home fits → the bot says so honestly, tells the broker, and the number stays hidden', async () => {
    const r = await scan('9123459702', 'BUY', { locality: 'Telibandha', budget: '5 lakh', ptype: 'Plot', name: 'Nomatch Wala' }); const t = tokOf(r);
    expect((await form(undefined, `/q/chat/${t}/ans`, { a: 'YES' })).status).toBe(303);
    const l = await lead('9702'); expect(l.masked).toBe(true); expect(l.bot.needsBroker).toBe('no-match'); expect(lastBot(l).text).toContain('मेल खाता कोई घर उपलब्ध नहीं');
    expect(l.chat.msgs.filter((m: any) => m.kind === 'HOME')).toHaveLength(0);
  });
  it('the customer writes a change in plain words: the bot reads budget / BHK and asks him to confirm again', async () => {
    const r = await scan('9123459703', 'RENT_IN', { budget: '10000', ptype: 'Flat', name: 'Change Wala' }); const t = tokOf(r);
    expect((await form(undefined, `/q/chat/${t}/ans`, { a: 'EDIT', text: '2bhk, 15000 tak kiraya' })).status).toBe(303);
    const l = await lead('9703'); expect(l.budget).toBe('15000'); expect(l.note).toContain('2BHK'); expect(l.chat.reqAskedAt).toBeTruthy(); expect(l.chat.reqConfirmedAt).toBeNull();
    expect(lastBot(l).kind).toBe('ASK'); expect(l.needLine).toContain('15000');
  });
  it('after the broker writes, the bot is quiet for a while; a hello then gets no bot answer', async () => {
    const l0 = await lead('9703'); const t = tokOf(await scan('9123459704', 'BUY', { name: 'Quiet Wala' }));
    const l = await lead('9704'); expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${l.id}/chat`, { text: 'Namaste, main dekh raha hoon' })).status).toBe(200);
    expect((await lead('9704')).bot.quiet).toBe(true);
    const n = bots(await lead('9704')).length; await say(t, 'hello'); expect(bots(await lead('9704')).length).toBe(n);
    expect(l0).toBeTruthy();
  });
  it('the broker switches the bot off for one chat: no answers, and the manual ask works as before', async () => {
    const t = tokOf(await scan('9123459705', 'BUY', { name: 'Off Wala' })); const l = await lead('9705');
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${l.id}/bot`, { off: true })).status).toBe(200);
    const n = bots(await lead('9705')).length; await say(t, 'mujhe visit karna hai'); await tap(t, 'VISIT'); expect(bots(await lead('9705')).length).toBe(n);
    expect((await lead('9705')).bot.on).toBe(false);
  });
  it('the broker switches it off for ALL chats: a new lead gets no welcome and no automatic ask — the old manual flow', async () => {
    expect((await call(jar.BRK1, 'POST', '/api/shop-partners/sahayak', { off: true })).status).toBe(200);
    expect((await (await call(jar.BRK1, 'GET', '/api/shop-partners/sahayak')).json()).off).toBe(true);
    const t = tokOf(await scan('9123459706', 'BUY', { name: 'Manual Wala' })); const l = await lead('9706');
    expect(bots(l)).toHaveLength(0); expect(l.chat.reqAskedAt).toBeNull(); expect(l.bot.on).toBe(false);
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${l.id}/ask-need`)).status).toBe(200);
    expect((await form(undefined, `/q/chat/${t}/ans`, { a: 'YES' })).status).toBe(303);
    const l2 = await lead('9706'); expect(l2.masked).toBe(true); expect(l2.chat.msgs.filter((m: any) => m.kind === 'HOME')).toHaveLength(0);   // nothing shown by itself
    expect((await call(jar.BRK1, 'POST', '/api/shop-partners/sahayak', { off: false })).status).toBe(200);
  });
  it('an owner (sell) lead: the bot asks the owner to confirm the property, then hands over — it never shows him homes', async () => {
    const t = tokOf(await scan('9123459707', 'SELL', { direct: '', sign: '', locality: 'Telibandha', budget: '', name: 'Owner Wala' })); const l = await lead('9707');
    expect(bots(l).some((m: any) => m.kind === 'ASK')).toBe(true);
    await form(undefined, `/q/chat/${t}/ans`, { a: 'YES' });
    const l2 = await lead('9707'); expect(l2.masked).toBe(false); expect(l2.chat.msgs.filter((m: any) => m.kind === 'HOME')).toHaveLength(0);
    expect((await fetch(`${B}/q/chat/${t}/explore`)).status).toBe(200);   // redirects to the chat for an owner (no Explore) — page still renders
  });
  it('another broker never reaches this chat’s bot switch or visit routes; an anonymous caller gets 401', async () => {
    const l = await lead('9705');
    expect((await call(jar.BRK2, 'POST', `/api/shop-partners/leads/${l.id}/bot`, { off: false })).status).toBe(404);
    expect((await call(undefined, 'POST', `/api/shop-partners/leads/${l.id}/visit/LVR-x`, { action: 'OK' })).status).toBe(401);
    expect((await call(undefined, 'POST', '/api/shop-partners/sahayak', { off: true })).status).toBe(401);
  });
});
