import { freePort } from './helpers/port';
/**
 * v101 — the QR customer's chat, end to end (the screenshot case): he confirms his need → his buyer need exists for the broker (number still hidden) and the NETWORK is searched even though
 * none of the broker's own homes fits; he is told how many network homes there are + the price range (never which); "change kar do … Shankar Nagar 2.5 cr" is applied even after "talk to the broker";
 * the client room opens by itself with his number; scanning the same QR again opens the old chat (same phone: his cookie; another phone: an SMS code); the chat offers add-to-home + alerts at the top.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readIntent, readNeedChange } from '../src/shared/sahayak';
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v101-')); mkdirSync(path.join(dir, 'data'));
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
const SHOP_PHONE = '9876500101';
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


const reqsOf = async (name: string) => ((await (await call(jar.BRK1, 'GET', '/api/requirements?mine=true&limit=300')).json()).requirements || []).filter((r: any) => r.customerName === name);
const houseBody = (title: string, price: number, loc: string) => ({ title, description: 'A residential house, east facing, near the park', propertyType: 'Independent House', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: loc, addressHidden: `Lane 4, ${loc}`, askingPrice: price, ownerApprovedNetPrice: Math.round(price * 0.95), builtUpAreaSqFt: 1500, ownerName: 'Test Owner', ownerPhone: '9123450101' });
const nameOf = (id: string) => acct(id).name as string;

describe('v101 — reading the customer’s words (pure)', () => {
  it('"change kar do … aab Shankar Nagar mai … 2.5 cr" is a change of his need (typo, mai, Hinglish)', () => {
    const t = 'Change kar do mujhe aab shankar nagar mai chahiye 2.5 cr budget hai';
    expect(readIntent(t)).toBe('NEED'); const c = readNeedChange(t, 'Raipur'); expect(c.budget).toBe('2.5 cr'); expect(c.locality).toBe('Shankar Nagar');
  });
  it('"X nahi, Y" reads Y: the type, the place and buy / rent come from AFTER "nahi"; the money from the whole line', () => {
    expect(readNeedChange('farm house nahi flat chahiye', 'Raipur').ptype).toBe('Residential Flat');
    const p = readNeedChange('Amlidih nahi, Pandri mein dekho', 'Raipur'); expect(p.locality).toBe('Pandri'); expect(readIntent('Amlidih nahi, Pandri mein dekho')).toBe('NEED');
    expect(readNeedChange('rent nahi, sale chahiye 80 lakh', 'Raipur')).toMatchObject({ kind: 'BUY', budget: '80 lakh' });
    expect(readNeedChange('budget 60 lakh hai', 'Raipur')).toMatchObject({ budget: '60 lakh' });
  });
  it('ordinary talk is not a need change (price question, photos, "nahi pata")', () => {
    expect(readIntent('price kitna hai')).toBe('PRICE'); expect(readIntent('photo bhejo')).toBe('PHOTOS'); expect(readIntent('mujhe nahi pata')).not.toBe('NEED');
  });
});

describe('v101 — the screenshot case: need confirmed, none of the broker’s own homes fits', { timeout: 120000 }, () => {
  const KRISHNA = '9123459801'; let tok = ''; let ck = ''; let target: any;
  it('setup: a live QR for broker 1, and broker 2 lists two houses in Amlidih (₹38 L fits the budget, ₹46 L is far above it)', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Green Valley Society', personName: 'Ramesh Verma', phone: SHOP_PHONE, area: 'Amlidih', city: 'Raipur', terms: TERMS, consent: true });
    expect(r.status).toBe(200); const j = await r.json(); partner = j.partner; qr = j.partner.qrCode; const token = j.link.split('/sp/')[1];
    const sck = await partnerSignIn(token); expect((await form(sck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
    const a = await call(jar.BRK2, 'POST', '/api/properties', houseBody('Garden house Amlidih QA-38', 3800000, 'Amlidih')); expect(a.status).toBe(200); target = (await a.json()).property || {};
    const b = await call(jar.BRK2, 'POST', '/api/properties', houseBody('Big house Amlidih QA-46', 4600000, 'Amlidih')); expect(b.status).toBe(200);
    await sleep(300);
  });
  it('he scans: no buyer need yet; the chat page shows the “never miss a reply” card ABOVE the chat once he has confirmed (see below)', async () => {
    const r = await scan(KRISHNA, 'BUY', { name: 'Krishna QA', locality: 'Amlidih', budget: '40 lakh', ptype: 'Independent House' }); expect(r.status).toBe(303); tok = tokOf(r); ck = cookieOf(r);
    expect(await reqsOf('Krishna QA')).toHaveLength(0);
  });
  it('he taps ✅: his buyer need exists for the broker at once (number still hidden), the network is searched, and he is told the COUNT and PRICE RANGE only', async () => {
    expect((await form(undefined, `/q/chat/${tok}/ans`, { a: 'YES' })).status).toBe(303);
    const l = await lead('9801'); expect(l.masked).toBe(true); expect(l.phone).toBeUndefined();
    const needs = await reqsOf('Krishna QA'); expect(needs).toHaveLength(1);
    expect(needs[0].leadId).toBe(l.id); expect(needs[0].customerPhone).toBe(''); expect(needs[0].budgetMax).toBe(4000000); expect(needs[0].preferredLocalities).toContain('Amlidih'); expect(needs[0].status).toBe('matching');
    expect(l.bot.network.count).toBe(1); expect(l.bot.network.min).toBe(3800000); expect(l.bot.network.max).toBe(3800000);   // the ₹46 L house is above his budget: not counted
    const net = bots(l).find((m: any) => /🌐/.test(m.text))!; expect(net).toBeTruthy();
    expect(net.text).toContain('1 प्रॉपर्टी'); expect(net.text).toContain('₹38 लाख'); expect(net.text).toContain(nameOf('USR-BRK-001')); expect(net.en).toContain('on your behalf');
    for (const leak of ['QA-38', 'QA-46', nameOf('USR-BRK-002'), 'Lane 4', '9123450101']) { expect(net.text + net.en).not.toContain(leak); }   // never which home, whose, or where exactly
    expect(l.bot.needsBroker).toBe('no-match'); expect(lastBot(l).text).toContain('नेटवर्क के घरों');                        // honest about his own homes, and points to the network work
    expect(l.chat.msgs.filter((m: any) => m.kind === 'HOME')).toHaveLength(0);
  });
  it('the broker’s Buyers list shows the need with a “number opens after you share a home” hint, and the lead card says what the network holds', async () => {
    const l = await lead('9801'); expect(l.bot.network).toMatchObject({ count: 1 });
    const src = (await import('fs')).readFileSync(path.join(ROOT, 'src/components/RequirementsView.tsx'), 'utf8'); expect(src).toContain('req-phone-hidden');
    const sp = (await import('fs')).readFileSync(path.join(ROOT, 'src/components/ShopPartners.tsx'), 'utf8'); expect(sp).toContain('sp-network');
  });
  it('he taps “Talk to the broker” → the assistant goes quiet; then he writes “Change kar do … aab Shankar Nagar mai … 2.5 cr” → it IS applied (need, buyer need, client card), and he gets an answer', async () => {
    await tap(tok, 'HUMAN'); let l = await lead('9801'); expect(l.bot.quiet).toBe(true);
    const before = bots(l).length;
    expect((await say(tok, 'Change kar do mujhe aab shankar nagar mai chahiye 2.5 cr budget hai')).status).toBe(303);
    l = await lead('9801'); expect(bots(l).length).toBeGreaterThan(before);
    expect(lastBot(l).kind === 'ASK' || /ज़रूरत/.test(lastBot(l).text)).toBe(true);
    const need = (await reqsOf('Krishna QA'))[0]; expect(need.budgetMax).toBe(25000000); expect(need.preferredLocalities).toEqual(['Shankar Nagar']); expect(need.customerPhone).toBe('');
    expect(bots(l).some((m: any) => m.kind === 'ASK' && /Shankar Nagar/.test(m.text) && /2.5 cr/.test(m.text))).toBe(true);   // the card he confirms again shows the new need
    expect(l.chat.reqConfirmedAt).toBeNull();
    const und = bots(l).find((m: any) => /Understood — your need is now this/.test(m.en))!; expect(und.en).toMatch(/budget/); expect(und.en).not.toMatch(/[\u0900-\u097f]/);   // the English line carries no Hindi word
  });
  it('he confirms again: the network is searched again for the NEW need (one buyer need, updated — not a second one)', async () => {
    const at0 = (await lead('9801')).bot.network.at;
    await sleep(20); expect((await form(undefined, `/q/chat/${tok}/ans`, { a: 'YES' })).status).toBe(303);
    const l = await lead('9801'); expect(l.bot.network.at).not.toBe(at0); expect(await reqsOf('Krishna QA')).toHaveLength(1);
  });
  it('the chat page offers “add to home + alerts” at the TOP, with a manual how-to for Android', async () => {
    const page = await chat(tok); expect(page).toContain('data-testid="chat-app-card"'); expect(page).toContain('data-testid="chat-app-how"');
    expect(page.indexOf('chat-app-card')).toBeLessThan(page.indexOf('data-testid="chat-box"'));
    const js = await (await fetch(`${B}/q/chat-app.js`)).text(); expect(js).toContain('अगला जवाब मिस न हो');       // the card's words are set by the page script
  });
  it('the same phone scans the QR again: his chat opens (welcome back) — not a blank form; “new request” still shows the form', async () => {
    const withCookie = await (await fetch(`${B}/q/${qr}`, { headers: { cookie: ck } })).text();
    expect(withCookie).toContain('data-testid="qr-welcome-back"'); expect(withCookie).toContain(`href="/q/chat/${tok}"`); expect(withCookie).not.toContain('name="kind"');
    expect(await (await fetch(`${B}/q/${qr}?new=1`, { headers: { cookie: ck } })).text()).toContain('name="kind"');
    expect(await (await fetch(`${B}/q/${qr}`)).text()).toContain('name="kind"');          // another browser: the form
    const page = await (await fetch(`${B}/q/chat/${tok}`)).text(); expect(page).toContain('data-testid="chat-box"');
  });
  it('another phone / browser: the same QR + the same mobile → an SMS code reopens the SAME chat; a stranger who types the number learns nothing', async () => {
    const r1 = await fetch(`${B}/q/${qr}/resume`); expect(r1.status).toBe(200); expect(await r1.text()).toContain('data-testid="resume-phone"');
    // an unknown number: the very same page, no code
    const un = await form(undefined, `/q/${qr}/resume`, { phone: '9123459899' }); const unHtml = await un.text(); expect(un.status).toBe(200); expect(unHtml).toContain('data-testid="resume-code"'); expect(unHtml).not.toContain('resume-demo-code');
    const ok = await form(undefined, `/q/${qr}/resume`, { phone: KRISHNA }); const html = await ok.text(); expect(ok.status).toBe(200);
    const code = /resume-demo-code[^>]*>[\s\S]*?<b>(\d{6})<\/b>/.exec(html)?.[1]; expect(code).toMatch(/^\d{6}$/);            // demo mode shows it; with SMS on it goes by SMS only
    const wrong = await form(undefined, `/q/${qr}/resume/verify`, { phone: KRISHNA, code: code === '000000' ? '111111' : '000000' }); expect(wrong.status).toBe(400);
    const good = await form(undefined, `/q/${qr}/resume/verify`, { phone: KRISHNA, code: code! }); expect(good.status).toBe(303);
    expect(good.headers.get('location')).toBe(`/q/chat/${tok}`); expect(good.headers.get('set-cookie') || '').toContain(`gq_${qr}=${tok}`);
    expect((await form(undefined, `/q/${qr}/resume/verify`, { phone: KRISHNA, code: code! })).status).toBe(400);   // a code works once
    expect(JSON.stringify(await lead('9801'))).not.toContain(tok);                                               // the chat link is never in the broker's data
  });
  it('scanning with the same mobile and submitting the form again: no new lead, and the page offers the SMS-code way back; codes are rate-limited per mobile', async () => {
    const r = await scan(KRISHNA, 'BUY', { name: 'Krishna QA', locality: 'Amlidih', budget: '40 lakh', ptype: 'Independent House' }); expect(r.headers.get('location')).toContain('thanks?again=1');
    const thanks = await (await fetch(B + r.headers.get('location')!)).text(); expect(thanks).toContain('data-testid="qr-resume"');
    expect((await list()).leads.filter((x: any) => x.phoneLast4 === '9801')).toHaveLength(1);
    const codes = []; for (let i = 0; i < 4; i++) codes.push((await form(undefined, `/q/${qr}/resume`, { phone: '9123459877' })).status);
    expect(codes).toContain(429);
  });
  it('the QR page: a proof line (how many verified homes the network holds in the city — a number only), the 3 steps, the add-to-home hint, and compact no-photo cards', async () => {
    const html = await (await fetch(`${B}/q/${qr}`)).text();
    expect(html).toContain('data-testid="qr-network"'); expect(html).toContain('data-testid="qr-steps"'); expect(html).toContain('data-testid="qr-home-hint"');
    expect(html).toContain('.hm .ph.nophoto{aspect-ratio:auto;height:40px}');
    expect(/data-testid="qr-network"[^>]*>[^<]*<b>(\d+\+?)<\/b>/.exec(html)?.[1]).toMatch(/^\d+\+?$/);
  });
});

describe('v101 — his number opens (a home of the broker’s own fits): one buyer need gets the number, the client room opens by itself, and the network is told', { timeout: 120000 }, () => {
  const MOHIT = '9123459802'; let tok = '';
  it('broker 1 lists a house in Shankar Nagar; the customer scans and confirms', async () => {
    expect((await call(jar.BRK1, 'POST', '/api/properties', houseBody('Own corner house SN-QA', 20000000, 'Shankar Nagar'))).status).toBe(200); await sleep(300);
    const r = await scan(MOHIT, 'BUY', { name: 'Mohit QA', locality: 'Shankar Nagar', budget: '3 crore', ptype: 'Independent House' }); tok = tokOf(r);
    expect((await form(undefined, `/q/chat/${tok}/ans`, { a: 'YES' })).status).toBe(303);
  });
  it('the need made at confirm now carries the number (no second need), the room is open, and the chips stay under the last message', async () => {
    const l = await lead('9802'); expect(l.masked).toBe(false); expect(l.phone).toBe(MOHIT);
    const needs = await reqsOf('Mohit QA'); expect(needs).toHaveLength(1); expect(needs[0].customerPhone).toBe(MOHIT); expect(needs[0].leadId).toBe(l.id);
    expect(l.bot.room).toBe(true); expect(l.clientCardId).toBeTruthy();
    expect(lastBot(l).kind).toBe('CHIPS'); const page = await chat(tok); expect(page).toContain('data-testid="chat-room"'); expect(page).toContain('data-testid="bot-chips"');
  });
  it('a later change in the open chat (budget) moves the buyer need and the client card, and the bot answers', async () => {
    const n0 = bots(await lead('9802')).length; await say(tok, 'mera budget 4 crore hai'); const l = await lead('9802');
    expect((await reqsOf('Mohit QA'))[0].budgetMax).toBe(40000000); expect(bots(l).length).toBeGreaterThan(n0);
    expect(bots(l).slice(n0).some((m: any) => /ज़रूरत/.test(m.text))).toBe(true);
  });
});
