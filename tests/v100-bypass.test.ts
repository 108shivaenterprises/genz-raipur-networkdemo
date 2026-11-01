import { freePort } from './helpers/port';
/**
 * v100 — nobody walks around GENZ: a phone number or any other contact id (e-mail, UPI, Instagram / Telegram, chat links) cannot be passed in ANY text another person reads —
 * deal-room chat, client-room chat, the shop-QR lead chat (both sides, and a number split over two messages), listing text, offer terms, visit notes —
 * and the bot never prints a phone number. Ordinary talk (prices, areas, times, "whatsapp pe baat karte hain") still goes through.
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
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const form = (cookie: string | undefined, url: string, data: Record<string, string>) =>
  fetch(B + url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(data).toString() });
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id); expect(a, id).toBeTruthy();
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v100b-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PUSH_DRY_RUN: 'true', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 500)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const cookieOf = (r: Response) => (r.headers.get('set-cookie') || '').split(';')[0];
const TERMS = { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 };
const tokOf = (r: Response) => /\/q\/chat\/([A-Za-z0-9_-]+)/.exec(r.headers.get('location') || '')?.[1] || '';

/** one QR shop for a demo broker, partner accepted */
async function shop(ck: string, name: string, area: string, city: string, phone: string) {
  const r = await call(ck, 'POST', '/api/shop-partners', { shopName: name, personName: 'Shop Owner', phone, area, city, terms: TERMS, consent: true });
  expect(r.status).toBe(200); const j = await r.json(); const token = j.link.split('/sp/')[1];
  await form(undefined, `/sp/${token}/otp`, { phone });
  const code = (await (await call(ck, 'GET', '/api/shop-partners')).json()).partners.find((x: any) => x.id === j.partner.id).codeForPartner;
  const sess = cookieOf(await form(undefined, `/sp/${token}/verify`, { code }));
  expect((await form(sess, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
  return { qr: j.partner.qrCode as string, ck };
}
async function scan(s: { qr: string }, d: Record<string, string>) {
  const page = await (await fetch(`${B}/q/${s.qr}`)).text();
  const t = /name="t" value="([^"]+)"/.exec(page)?.[1] || ''; await sleep(2600);
  return form(undefined, `/q/${s.qr}`, { t, note: '', consent: '1', ...d });
}
const leadOf = async (ck: string, last4: string) => (await (await call(ck, 'GET', '/api/shop-partners')).json()).leads.find((l: any) => l.phoneLast4 === last4);
const homesOf = (l: any) => l.chat.msgs.filter((m: any) => m.kind === 'HOME').map((m: any) => m.homeId);


const dbOf = async (): Promise<any> => {
  for (let i = 0; i < 60; i++) { try { const t = readFileSync(path.join(dir, 'data', 'database.json'), 'utf8'); if (t.includes('DEAL-JAI-') && t.includes('"shopPartners"')) return JSON.parse(t); } catch { /* not written yet */ } await sleep(300); }
  throw new Error('database.json never had the demo cities');
};

import { containsPhone, containsContact, containsContactId, phoneAcross } from '../src/shared/clientRoomRules';
import { stripContacts } from '../src/shared/waParse';

const BAD: Record<string, string> = {
  'plain 10 digits': 'call me 9826012345', 'spaced 5-5': 'call 98260 12345', 'dashes': 'ph 98-26-01-23-45', 'single spaces': '9 8 2 6 0 1 2 3 4 5', 'dots': '98.26.01.23.45',
  'devanagari digits': '९८२६०१२३४५', 'arabic-indic digits': '٩٨٢٦٠١٢٣٤٥', 'full-width': '９８２６０１２３４５', 'digit words en': 'nine eight two six zero one two three four five',
  'digit words hinglish': 'nau aath do chhe zero ek do teen char paanch', 'devanagari words': 'नौ आठ दो छह शून्य एक दो तीन चार पांच', 'letter O': '9826O12345', 'letter l for 1': '98260l2345',
  '+91': 'whatsapp +91 98260 12345', '0 prefix': '09826012345', 'tens words': 'ninety eight twenty six zero one two three four five', 'tens hyphen + oh': 'ninety-eight twenty-six oh one two three four five', 'double / triple': 'nine eight double two six one double oh seven seven', 'double nine': 'double nine eight two six one oh oh seven seven',
  'phone then a number': '9826012345 5 baje', 'phone then 2 more digits': '98260 12345 7', 'zero-width in between': '98​26​01​23​45', 'filler word': '98265 then 01234',
  'email': 'mail me at raj.kumar@gmail.com', 'email words': 'raj kumar at gmail dot com', 'email (at)': 'raj(at)gmail.com', 'upi': 'pay on rajbroker@oksbi', 'wa.me': 'wa.me/rajbroker',
  't.me': 't.me/rajbroker', 'instagram id': 'insta: raj_007', 'telegram id': 'my telegram raj007', 'my insta is': 'my insta is rajproperty', 'url': 'https://rajproperties.com/contact',
  'shortener': 'bit.ly/3xYz9', 'handle': 'ping @rajbroker', 'wa digits link': 'wa.me/919826012345',
};
const OK = [
  'Sunday 5 pm site visit theek hai, price 85 lakh final', '9 lakh 82 hazar 60 sq ft 12345 plot no', 'Flat 301, 2nd floor, 1250 sq ft, ₹45,00,000', 'whatsapp pe baat karte hain', 'telegram pe aao', 'double bed 2 bhk 1200 sqft, 85 lakh', 'triple storey house 3 floor 90 lakh',
  'insta page dekho', 'visit at 5:30 on 12/11/2026 for 3 bhk', 'Rs 1.2 cr, 2400 sqft, plot 45/A, ward 12', 'मैं कल 5 बजे आऊँगा', 'call me tomorrow at 5', 'price 95 lakh at Shankar Nagar',
  'meet @ the site at 5', 'email ke bajay chat karo', '2 bhk 1100 sqft 85 lakh 4th floor ward no 27 sector 21', 'agreement 11 months, deposit 50000, rent 15000', 'my budget is 6500000 and 3 bhk',
  'Registry 2024 ka hai, khasra 123/4, rakba 2400 sqft, circle rate 4500', 'Token 51000 diya, balance 12 lakh 50 hazar baaki',
];

describe('the checker itself: every disguise is caught, ordinary talk is not', () => {
  for (const [k, t] of Object.entries(BAD)) it('blocks: ' + k, () => { expect(containsContact(t), t).toBe(true); });
  for (const t of OK) it('lets through: ' + t, () => { expect(containsContact(t), t).toBe(false); });
  it('a number split over two or three messages is one number', () => {
    expect(phoneAcross(['98260'], '12345')).toBe(true);
    expect(phoneAcross(['9826', '012'], '345')).toBe(true);
    expect(phoneAcross(['ok 98260'], '12345')).toBe(true);        // the first message may have words before its digits
    expect(phoneAcross(['kal milte hain'], '12345')).toBe(false);
    expect(phoneAcross(['flat 301'], '2025 8500')).toBe(false);
    expect(phoneAcross(['price 4500000 final, token 51000'], '2 lakh')).toBe(false);
  });
  it('contact ids are not phones, and phones are not "ids" (two different messages to the user)', () => {
    expect(containsPhone('raj@oksbi')).toBe(false); expect(containsContactId('raj@oksbi')).toBe(true);
    expect(containsContactId('9826012345')).toBe(false); expect(containsPhone('9826012345')).toBe(true);
  });
  it('a pasted forward loses its phones, e-mails, links and handles but keeps the property', () => {
    const t = stripContacts('3BHK Shankar Nagar 85 lakh. Call 9826012345 or mail raj@gmail.com, insta: raj_007, t.me/rajbroker, https://x.com/raj');
    expect(t).toContain('3BHK Shankar Nagar 85 lakh'); expect(containsContact(t)).toBe(false);
  });
});

describe('the app: no channel carries a contact', { timeout: 180000 }, () => {
  it('deal-room chat (both channels): every disguise is refused with 400, ordinary talk goes through, a number split over two messages is refused', async () => {
    const ck = await login('USR-BRK-001');
    const d = (await (await call(ck, 'GET', '/api/deals')).json()); const deal = (d.deals || d.dealRooms)[0];
    let n = 0;
    for (const [k, t] of Object.entries(BAD)) { const r = await call(ck, 'POST', `/api/deals/${deal.id}/messages`, { text: t }); expect(r.status, k).toBe(400); n++; }
    for (const t of OK.slice(0, 6)) { const r = await call(ck, 'POST', `/api/deals/${deal.id}/messages`, { text: t }); expect(r.status, t).toBe(200); }
    expect((await call(ck, 'POST', `/api/deals/${deal.id}/messages`, { text: 'mera number 98260' })).status).toBe(200);
    const split = await call(ck, 'POST', `/api/deals/${deal.id}/messages`, { text: '12345 hai' });
    expect(split.status).toBe(400); expect((await split.json()).error).toMatch(/Phone numbers/);
    const id = await call(ck, 'POST', `/api/deals/${deal.id}/messages`, { text: 'mail raj@gmail.com', audience: 'BROKERS' });
    expect(id.status).toBe(400); expect((await id.json()).error).toMatch(/E-mail, UPI/);
    expect(n).toBeGreaterThan(30);
  });
  it('client-room chat (broker side) refuses a phone, an id, and a split number', async () => {
    const ck = await login('USR-BRK-001');
    const room = (await (await call(ck, 'GET', '/api/client-rooms')).json()).rooms.find((x: any) => x.status === 'ACTIVE'); expect(room).toBeTruthy();
    for (const k of ['plain 10 digits', 'devanagari digits', 'phone then a number', 'email', 'upi', 'instagram id', 'wa.me', 'tens words']) { const r = await call(ck, 'POST', `/api/client-rooms/${room.id}/messages`, { text: BAD[k] }); expect(r.status, k).toBe(400); }
    expect((await call(ck, 'POST', `/api/client-rooms/${room.id}/messages`, { text: 'Sunday 5 pm visit, 85 lakh final' })).status).toBe(200);
    expect((await call(ck, 'POST', `/api/client-rooms/${room.id}/messages`, { text: 'number 98260' })).status).toBe(200);
    expect((await call(ck, 'POST', `/api/client-rooms/${room.id}/messages`, { text: '12345' })).status).toBe(400);
  });
  it('listing text another broker reads (title, description, locality, landmark) cannot carry a contact', async () => {
    const ck = await login('USR-BRK-001');
    const ok = { title: 'Nice 3BHK flat Shankar Nagar', description: 'East facing flat, lift, parking, near market.', propertyType: 'Residential Flat', transactionType: 'Sale', askingPrice: 5100000, ownerApprovedNetPrice: 5000000, state: 'Chhattisgarh', city: 'Raipur', locality: 'Shankar Nagar', pincode: '492001', addressHidden: 'Plot 12, Lane 3, Shankar Nagar', builtUpAreaSqFt: 1180, ownerName: 'Test Owner', ownerPhone: '9893012345', tags: [] };
    for (const [field, k] of [['description', 'plain 10 digits'], ['description', 'email'], ['title', 'upi'], ['description', 'instagram id'], ['landmark', 'url'], ['description', 'devanagari digits'], ['locality', 'phone then a number']] as const) {
      const r = await call(ck, 'POST', '/api/properties', { ...ok, [field]: field === 'title' ? 'Flat ' + BAD[k] : 'Nice flat. ' + BAD[k] }); expect(r.status, field + ' ' + k).toBe(400);
      expect((await r.json()).error, field + ' ' + k).toMatch(/Do not write phone numbers/);
    }
    const good = await call(ck, 'POST', '/api/properties', ok);
    expect([200, 201, 428, 409]).toContain(good.status);                    // past the contact check (the owner-consent / duplicate gates may answer instead)
    expect(JSON.stringify(await good.json())).not.toMatch(/Do not write phone numbers/);
  });
  it('a co-broking offer’s terms and a visit’s notes cannot carry a contact', async () => {
    const ck = await login('USR-BRK-001');
    const props = (await (await call(ck, 'GET', '/api/properties')).json()).properties;
    const other = props.find((p: any) => p.listingBrokerId !== 'USR-BRK-001' && p.listingStatus === 'active');
    const off = await call(ck, 'POST', '/api/collaborations', { propertyId: other.id, receivingBrokerId: other.listingBrokerId, proposedIntroducingShare: 50, proposedClosingShare: 50, proposerSide: 'BUYER', terms: 'split fifty fifty, call me 9826012345' });
    expect(off.status).toBe(400); expect((await off.json()).error).toMatch(/Do not write phone numbers/);
    const v = await call(ck, 'POST', '/api/site-visits', { propertyId: other.id, customerName: 'Test Client', scheduledTime: new Date(Date.now() + 2 * 86400_000).toISOString(), notes: 'insta: raj_007' });
    expect(v.status).toBe(400); expect((await v.json()).error).toMatch(/Do not write phone numbers/);
  });
});

describe('the shop-QR lead chat: both sides, and the bot', { timeout: 180000 }, () => {
  it('the customer cannot type a number / id / split number; the broker cannot either; the bot prints no number and no id', async () => {
    const s = await shop(await login('USR-BRK-PUN'), 'Baner Chai', 'Baner', 'Pune', '9876500391');
    const r = await scan(s, { kind: 'BUY', name: 'Tara Gupte', phone: '9123459831', locality: 'Baner', budget: '90 lakh', ptype: 'Residential Flat', direct: '1', sign: 'Tara Gupte' });
    const tok = tokOf(r); expect(tok).toBeTruthy();
    const say = async (text: string) => (await form(undefined, `/q/chat/${tok}/msg`, { text })).status;
    const countMsgs = async () => { const l = await leadOf(s.ck, '9831'); return l.chat.msgs.filter((m: any) => m.by === 'CUSTOMER').length; };
    const before = await countMsgs();
    for (const k of ['plain 10 digits', 'spaced 5-5', 'devanagari digits', 'digit words hinglish', 'tens words', 'email', 'upi', 'instagram id', 'wa.me', 'my insta is']) {
      const res = await form(undefined, `/q/chat/${tok}/msg`, { text: BAD[k] }); const html = await res.text();
      expect(res.status, k).toBe(200);                                       // the page again, with the refusal — not a redirect
      expect(html, k).toMatch(/Please do not/);
    }
    expect(await countMsgs(), 'none of them was stored').toBe(before);
    expect(await say('mera number 98260')).toBe(303); expect(await countMsgs()).toBe(before + 1);
    const split = await (await form(undefined, `/q/chat/${tok}/msg`, { text: '12345' })).text(); expect(split).toMatch(/Please do not/);
    expect(await countMsgs()).toBe(before + 1);
    // the broker's side
    const l = await leadOf(s.ck, '9831');
    for (const k of ['plain 10 digits', 'email', 'telegram id']) expect((await call(s.ck, 'POST', `/api/shop-partners/leads/${l.id}/chat`, { text: BAD[k] })).status, k).toBe(400);
    expect((await call(s.ck, 'POST', `/api/shop-partners/leads/${l.id}/chat`, { text: 'Sunday 5 baje aa jaiye' })).status).toBe(200);
    // the bot: confirm, ask for visit, photos, price, owner… and read every line it said
    await form(undefined, `/q/chat/${tok}/ans`, { a: 'YES' });
    for (const text of ['photo bhejo', 'rate kya hai', 'number do', 'owner ka number', 'whatsapp number bhejo', 'visit karna hai kal 5 baje', 'broker se baat karni hai']) await form(undefined, `/q/chat/${tok}/msg`, { text });
    const fin = await leadOf(s.ck, '9831');
    const botSaid = fin.chat.msgs.filter((m: any) => m.by === 'BOT' || m.by === 'SYSTEM').map((m: any) => `${m.text || ''} ${m.en || ''}`).join('\n');
    expect(botSaid.length).toBeGreaterThan(100);
    expect(containsPhone(botSaid), 'the bot never prints a phone number').toBe(false); expect(containsContactId(botSaid), 'nor an e-mail / id / link').toBe(false);
    expect(botSaid).not.toMatch(/\b[6-9]\d{9}\b/);
  });
});
