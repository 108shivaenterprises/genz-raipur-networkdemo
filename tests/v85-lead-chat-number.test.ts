import { freePort } from './helpers/port';
/**
 * v85 — a shop-QR lead's number is hidden from the broker (only ••last4) until, in the in-app chat, the customer has confirmed his need
 * AND the broker has shared a home that matches it (an owner: until he confirms the property details). Over real HTTP.
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v85-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', SAHAYAK: 'off', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const cookieOf = (r: Response) => (r.headers.get('set-cookie') || '').split(';')[0];
const TERMS = { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 };
const SHOP_PHONE = '9876500022';
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
const leadByLast4 = async (last4: string) => (await list()).leads.find((l: any) => l.phoneLast4 === last4);

describe('shop QR lead: the number stays hidden until the need is confirmed in chat and a matching home is shared', { timeout: 60000 }, () => {
  const BUYER = '9123455501'; let tok = ''; let leadId = ''; let matchId = '';
  it('setup: a live QR for broker 1', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Verma Medical', personName: 'Suresh Verma', phone: SHOP_PHONE, area: 'Shankar Nagar', city: 'Raipur', terms: TERMS, consent: true });
    expect(r.status).toBe(200); const j = await r.json(); partner = j.partner; qr = j.partner.qrCode; const token = j.link.split('/sp/')[1];
    const ck = await partnerSignIn(token); expect((await form(ck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
  });
  it('a buyer scans → he lands in a private chat page; the broker sees ••last4 and NO number anywhere in the API', async () => {
    const r = await scan(BUYER, 'BUY'); expect(r.status).toBe(303); tok = tokOf(r); expect(tok.length).toBeGreaterThan(20);
    const raw = await (await call(jar.BRK1, 'GET', '/api/shop-partners')).text();
    expect(raw).not.toContain(BUYER);                                           // not in the lead, the history, the links — nowhere
    const l = await leadByLast4('5501'); leadId = l.id;
    expect(l.masked).toBe(true); expect(l.phone).toBeUndefined(); expect(l.phoneLast4).toBe('5501'); expect(l.clientCardId).toBeUndefined(); expect(l.chat.keyHash).toBeUndefined();
    expect(JSON.stringify(l)).not.toContain(tok);                               // the customer's private link is never sent to the broker
    const page = await (await fetch(`${B}/q/chat/${tok}`)).text();
    expect(page).toContain('data-testid="chat-box"'); expect(page).toContain('Shankar Nagar'); expect(page).not.toContain('data-testid="chat-confirm"');
  });
  it('the customer cannot type a phone number in the chat; a normal message reaches the broker (unread)', async () => {
    const bad = await (await form(undefined, `/q/chat/${tok}/msg`, { text: 'call me 9123455501' })).text();
    expect(bad).toContain('फ़ोन नंबर न लिखें');
    expect((await form(undefined, `/q/chat/${tok}/msg`, { text: 'Mujhe 4 BHK chahiye, garden wala' })).status).toBe(303);
    const l = await leadByLast4('5501'); expect(l.chat.unread).toBe(1); expect(l.chat.msgs.some((m: any) => m.text.includes('garden wala'))).toBe(true);
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/chat/seen`)).status).toBe(200);
    expect((await leadByLast4('5501')).chat.unread).toBe(0);
  });
  it('the broker cannot type a number either, can write, and cannot share a home before the need is confirmed', async () => {
    const r1 = await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/chat`, { text: 'call 9876543210' }); expect(r1.status).toBe(400);
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/chat`, { text: 'Namaste, main aapke liye dekhta hoon' })).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/offer`, { homeId: 'PROP-RAI-101' })).status).toBe(409);
    expect((await leadByLast4('5501')).matches).toEqual([]);                    // no list of homes either, until he confirms
  });
  it('the broker asks him to confirm; he sees ✅/✏️; an edit makes the broker ask again; ✅ confirms (number still hidden)', async () => {
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/ask-need`)).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/ask-need`)).status).toBe(409);   // already asked
    let page = await (await fetch(`${B}/q/chat/${tok}`)).text(); expect(page).toContain('data-testid="chat-confirm"');
    expect((await form(undefined, `/q/chat/${tok}/ans`, { a: 'EDIT', text: 'Budget 3 crore tak, garden zaroori' })).status).toBe(303);
    let l = await leadByLast4('5501'); expect(l.chat.reqAskedAt).toBeNull(); expect(l.chat.reqConfirmedAt).toBeNull();
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/ask-need`)).status).toBe(200);
    expect((await form(undefined, `/q/chat/${tok}/ans`, { a: 'YES' })).status).toBe(303);
    l = await leadByLast4('5501'); expect(l.chat.reqConfirmedAt).toBeTruthy(); expect(l.masked).toBe(true); expect(l.phone).toBeUndefined();
    page = await (await fetch(`${B}/q/chat/${tok}`)).text(); expect(page).not.toContain('data-testid="chat-confirm"');
  });
  it('after the confirmation the broker is offered only the homes that fit (sale, area, budget); a home that does not fit is refused', async () => {
    const l = await leadByLast4('5501');
    expect(l.matches.length).toBeGreaterThan(0); for (const h of l.matches) { expect(h.rent).toBe(false); expect(h.place).toContain('Shankar Nagar'); }
    matchId = l.matches[0].id;
    const rent = (await (await call(jar.BRK1, 'GET', '/api/properties')).json()).properties.find((p: any) => p.listingBrokerId === 'USR-BRK-001' && p.transactionType !== 'Sale');
    const r = await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/offer`, { homeId: rent?.id || 'PROP-NOT-THERE' }); expect(r.status).toBe(400);
    expect((await leadByLast4('5501')).masked).toBe(true);                       // a refused offer shows nothing
  });
  it('sharing a matching home shows the number to the broker (once), puts the home in the customer’s chat and makes the client card', async () => {
    const r = await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/offer`, { homeId: matchId }); expect(r.status).toBe(200);
    const l = (await r.json()).lead;
    expect(l.masked).toBe(false); expect(l.phone).toBe(BUYER); expect(l.clientCardId).toBeTruthy(); expect(l.chat.revealedAt).toBeTruthy();
    const page = await (await fetch(`${B}/q/chat/${tok}`)).text(); expect(page).toContain('🏠'); expect(page).toContain('अब ब्रोकर को दिख गया');
    const audit = await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json(); expect(audit.success).toBe(true);
  });
  it('the other broker never reaches this lead’s chat', async () => {
    expect((await call(jar.BRK2, 'POST', `/api/shop-partners/leads/${leadId}/chat`, { text: 'hello' })).status).toBe(404);
    expect((await call(jar.BRK2, 'POST', `/api/shop-partners/leads/${leadId}/offer`, { homeId: matchId })).status).toBe(404);
  });
  it('an owner (sell) lead: the number shows as soon as the owner confirms the property details — there is no “matching home”', async () => {
    const OWNER = '9123455502'; const r = await scan(OWNER, 'SELL', { direct: '', sign: '', locality: 'Telibandha', budget: '' }); expect(r.status).toBe(303); const t2 = tokOf(r);
    let l = await leadByLast4('5502'); expect(l.masked).toBe(true); expect(l.phone).toBeUndefined();
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${l.id}/offer`, { homeId: matchId })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${l.id}/ask-need`)).status).toBe(200);
    expect((await form(undefined, `/q/chat/${t2}/ans`, { a: 'YES' })).status).toBe(303);
    l = await leadByLast4('5502'); expect(l.masked).toBe(false); expect(l.phone).toBe(OWNER);
  });
  it('a bad / unknown chat link shows nothing', async () => {
    expect((await fetch(`${B}/q/chat/not-a-real-token-at-all-1234`)).status).toBe(404);
    expect((await form(undefined, `/q/chat/not-a-real-token-at-all-1234/msg`, { text: 'x' })).status).toBe(404);
  });
  it('leads from before v85 (no chat) still show their number — nothing already in use is hidden', async () => {
    const old = (await list()).leads.filter((l: any) => !l.chat);
    expect(old.length).toBeGreaterThan(0); for (const l of old) { expect(l.masked).toBe(false); expect(l.phone).toBeTruthy(); }
  });
});

describe('the matching rules and the screens', () => {
  it('the money text is read the way a customer writes it, and an unreadable budget never blocks a match', async () => {
    const { parseMoney } = await import('../server/shopPartners.js');
    expect(parseMoney('40 lakh')).toBe(4_000_000); expect(parseMoney('1.2 cr')).toBe(12_000_000); expect(parseMoney('12,000 महीना')).toBe(12_000); expect(parseMoney('12k')).toBe(12_000); expect(parseMoney('jo bhi')).toBeNull();
  });
  it('the broker screen hides every call / WhatsApp / client-room button while the number is hidden, and offers the chat', () => {
    const ui = readFileSync(path.join(ROOT, 'src/components/ShopPartners.tsx'), 'utf8');
    expect(ui).toContain('<LeadChat l={l} onChange={onChange} />'); expect(ui).toContain('{!l.masked && (<>');
    for (const id of ['sp-lead-chat', 'sp-masked', 'sp-ask-need', 'sp-matches', 'sp-chat-send']) expect(ui, id).toContain(`data-testid="${id}"`);
    for (const hi of ['नंबर छुपा है', 'ज़रूरत पक्की', 'शेयर करते ही नंबर दिखेगा']) expect(ui).toContain(hi);
    const contact = ui.slice(ui.indexOf('{!l.masked && (<>'), ui.indexOf('{l.links.length > 0 &&'));
    expect(contact).toContain('tel:+91${l.phone}'); expect(contact).toContain('wa.me/91${l.phone}');   // only inside the revealed block
  });
});
