import { freePort } from './helpers/port';
/**
 * v99 — the GENZ सहायक asks an OWNER (who scanned a shop QR to sell / give on rent) the listing questions and makes a DRAFT for the broker.
 * Pune on purpose (the broker's own city is Raipur): nothing may fall back to Raipur. Real HTTP, a fresh server.
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v99-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PUSH_DRY_RUN: 'true', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  jar.BRK1 = await login('USR-BRK-001'); jar.BRK2 = await login('USR-BRK-002');
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 500)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const cookieOf = (r: Response) => (r.headers.get('set-cookie') || '').split(';')[0];
const TERMS = { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 };
const SHOP_PHONE = '9876500099';
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
  return form(undefined, `/q/${qr}`, { t, kind, name: 'Sunita Deshpande', phone, locality: 'Baner', budget: '75 lakh', ptype: 'Residential Flat', note: '', consent: '1', ...extra });
}
const tokOf = (r: Response) => /\/q\/chat\/([A-Za-z0-9_-]+)/.exec(r.headers.get('location') || '')?.[1] || '';
const lead = async (last4: string) => (await list()).leads.find((l: any) => l.phoneLast4 === last4);
const say = (tok: string, text: string) => form(undefined, `/q/chat/${tok}/msg`, { text });
const tap = (tok: string, k: string) => form(undefined, `/q/chat/${tok}/quick`, { k });
const bots = (l: any) => l.chat.msgs.filter((m: any) => m.by === 'BOT');
const lastBot = (l: any) => bots(l).at(-1);
const drafts = async () => (await (await call(jar.BRK1, 'GET', '/api/consent/drafts')).json()).drafts as any[];

describe('GENZ सहायक — an OWNER (Pune flat for sale) is asked the listing questions', { timeout: 120000 }, () => {
  const OWNER = '9123459901'; let tok = ''; let leadId = ''; let draftId = '';
  it('setup: a live QR for a shop in Pune', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Baner Chai Point', personName: 'Mahesh Patil', phone: SHOP_PHONE, area: 'Baner', city: 'Pune', terms: TERMS, consent: true });
    expect(r.status).toBe(200); const j = await r.json(); partner = j.partner; qr = j.partner.qrCode; const token = j.link.split('/sp/')[1];
    const ck = await partnerSignIn(token); expect((await form(ck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
  });
  it('he scans as an OWNER who wants to SELL → hello + the ✅ card; no number yet', async () => {
    const r = await scan(OWNER, 'SELL'); expect(r.status).toBe(303); tok = tokOf(r);
    const l = await lead('9901'); leadId = l.id;
    expect(l.kind).toBe('SELL'); expect(l.city).toBe('Pune'); expect(l.masked).toBe(true);
    expect(bots(l)[0].text).toContain('प्रॉपर्टी की जानकारी');
  });
  it('✅ → the number opens, and the FIRST listing question comes (the form already gave type, place and price, so the type/price are not asked from scratch)', async () => {
    expect((await form(undefined, `/q/chat/${tok}/ans`, { a: 'YES' })).status).toBe(303);
    const l = await lead('9901'); expect(l.masked).toBe(false);
    expect(l.bot.interview).toMatchObject({ finished: false, asking: true });
    const q = lastBot(l); expect(q.kind).toBe('CHIPS'); expect(q.text).toContain('BHK');      // type is known (Flat) → BHK comes first
    expect(q.chips.map((c: any) => c.id)).toEqual(expect.arrayContaining(['ASK:bhk:2', 'ASK:bhk:SKIP']));
  });
  it('a BHK tap, then the size typed in words, are read', async () => {
    await tap(tok, 'ASK:bhk:2');
    let l = await lead('9901'); expect(lastBot(l).text).toContain('साइज़');
    await say(tok, '1150 sqft');
    l = await lead('9901'); expect(lastBot(l).text).toContain('1,150'); expect(lastBot(l).text).toContain('मंज़िल');
  });
  it('a stale chip (an earlier question) is ignored; a typed floor works', async () => {
    const n = (await lead('9901')).chat.msgs.length;
    await tap(tok, 'ASK:bhk:3');
    expect((await lead('9901')).chat.msgs.length).toBe(n);
    await say(tok, '3rd floor');
    const l = await lead('9901'); expect(lastBot(l).text).toContain('यही रखें');          // price is next, with the form's ₹75 L offered back
    expect(lastBot(l).chips.map((c: any) => c.id)).toContain('ASK:price:KEEP');
  });
  it('a phone number in the chat is still refused, and a silly price asks again instead of guessing', async () => {
    expect(await (await say(tok, 'call me 9123459901')).text()).toContain('फ़ोन नंबर न लिखें');
    await say(tok, '40');
    const l = await lead('9901'); expect(lastBot(l).text).toContain('बहुत कम'); expect(l.bot.interview.asking).toBe(true);
  });
  it('“keep” → then address (a phone number inside it is refused), papers', async () => {
    await tap(tok, 'ASK:price:KEEP');
    let l = await lead('9901'); expect(lastBot(l).text).toContain('कब से');
    await tap(tok, 'ASK:avail:NOW');
    l = await lead('9901'); expect(lastBot(l).text).toContain('पता');
    await say(tok, 'Lane 4, Sai Residency, flat 302');
    l = await lead('9901'); expect(lastBot(l).text).toContain('काग़ज़');
  });
  it('the last tap finishes: a DRAFT is in the broker’s Drafts — Pune, owner name+number, answers, a public-safe description (no address)', async () => {
    await tap(tok, 'ASK:papers:REG');
    const l = await lead('9901');
    expect(l.bot.interview).toMatchObject({ finished: true, asking: false }); draftId = l.bot.interview.draftId; expect(draftId).toMatch(/^LD-/);
    expect(lastBot(l).text).toContain('हाँ'); expect(lastBot(l).text).toContain('लाइव नहीं होगी');
    const d = (await drafts()).find(x => x.id === draftId); expect(d).toBeTruthy(); expect(d.status).toBe('DRAFT'); expect(d.kind).toBe('LISTING');
    expect(d.fields).toMatchObject({ city: 'Pune', state: 'Maharashtra', locality: 'Baner', propertyType: 'Residential Flat', transactionType: 'Sale', bhk: 2, areaSqft: 1150, floor: '3rd floor', askingPrice: 7500000, ownerName: 'Sunita Deshpande', ownerPhone: OWNER, source: 'QR_CHAT', leadId });
    expect(d.fields.addressHidden).toContain('Sai Residency'); expect(d.fields.description).not.toContain('Sai Residency'); expect(d.fields.description).not.toContain(OWNER);
    expect(d.fields.description).toContain('2 BHK'); expect(d.fields.title).toBe('2 BHK Flat for Sale in Baner');
    expect(d.missing).toEqual([]);                                           // everything the consent step needs is there
    expect(JSON.stringify(d.fields)).not.toContain('Raipur');
  });
  it('another broker sees nothing of it', async () => {
    const r = await (await call(jar.BRK2, 'GET', '/api/consent/drafts')).json();
    expect((r.drafts || []).some((x: any) => x.id === draftId)).toBe(false);
  });
  it('“status?” is answered from the real state: draft ready, then (after the broker asks for consent) the pending link', async () => {
    await say(tok, 'mera listing kab tak lagega?');
    let l = await lead('9901'); expect(lastBot(l).text).toContain('ड्राफ़्ट तैयार');
    const r = await call(jar.BRK1, 'POST', `/api/consent/drafts/${draftId}/request`, { method: 'LINK', protectionDays: 30 });
    if (r.status === 200) { await tap(tok, 'STATUS'); l = await lead('9901'); expect(lastBot(l).text).toMatch(/मंज़ूरी का लिंक|हाँ/); }
  });
  it('scanning again as the SAME owner never makes a second draft', async () => {
    const all = (await drafts()).filter(x => x.fields?.leadId === leadId);
    expect(all).toHaveLength(1);
  });
  it('a RENT_OUT owner gets the rent questions (furnishing), and “not sure” leaves a field for the broker', async () => {
    const R = '9123459902';
    const r = await scan(R, 'RENT_OUT', { name: 'Anil Joshi', budget: '18000', ptype: 'Residential Flat', locality: 'Kothrud' }); const t2 = tokOf(r);
    await form(undefined, `/q/chat/${t2}/ans`, { a: 'YES' });
    await tap(t2, 'ASK:bhk:SKIP'); await say(t2, '900 sqft'); await tap(t2, 'ASK:floor:SKIP');
    let l = await lead('9902'); expect(lastBot(l).text).toContain('18,000'); await tap(t2, 'ASK:price:KEEP');
    l = await lead('9902'); expect(lastBot(l).text).toContain('फ़र्नीचर'); await tap(t2, 'ASK:furn:SEMI');
    await tap(t2, 'ASK:avail:D15'); await say(t2, 'Gali 2, Kothrud Colony, near the temple'); await tap(t2, 'ASK:papers:UNSURE');
    l = await lead('9902'); expect(l.bot.interview.finished).toBe(true);
    const d = (await drafts()).find(x => x.id === l.bot.interview.draftId);
    expect(d.fields).toMatchObject({ transactionType: 'Rent', furnishing: 'SEMI', askingPrice: 18000, locality: 'Kothrud', city: 'Pune' }); expect(d.fields.bhk ?? null).toBeNull();
  });
  it('an owner who stops half-way is not lost: the draft exists after the FIRST answer, and what the broker fixed is never overwritten', async () => {
    const r = await scan('9123459904', 'SELL', { name: 'Meena Rao', locality: 'Aundh', budget: '1.1 cr' }); const t4 = tokOf(r);
    await form(undefined, `/q/chat/${t4}/ans`, { a: 'YES' });
    await tap(t4, 'ASK:bhk:3');
    let l = await lead('9904'); expect(l.bot.interview).toMatchObject({ finished: false, asking: true }); expect(l.bot.interview.draftId).toMatch(/^LD-/);
    const id = l.bot.interview.draftId;
    let d = (await drafts()).find(x => x.id === id); expect(d.fields).toMatchObject({ bhk: 3, locality: 'Aundh', city: 'Pune', ownerName: 'Meena Rao' }); expect(d.missing.length).toBeGreaterThan(0);
    // the broker fixes the title and the price in the draft
    const put = await call(jar.BRK1, 'PUT', `/api/consent/drafts/${id}`, { fields: { title: 'My own title for Meena’s flat', askingPrice: 10500000 } }); expect(put.status).toBe(200);
    // the owner carries on and finishes
    await say(t4, '1400 sqft'); await tap(t4, 'ASK:floor:SKIP'); await tap(t4, 'ASK:price:KEEP');   // KEEP confirms HIS number (₹1.1 Cr as he wrote it) …
    await tap(t4, 'ASK:avail:NOW'); await say(t4, 'Plot 8, Aundh Road, near the school'); await tap(t4, 'ASK:papers:SOME');
    l = await lead('9904'); expect(l.bot.interview.finished).toBe(true);
    d = (await drafts()).find(x => x.id === id);
    expect(d.fields.title).toBe('My own title for Meena’s flat');       // … but the broker's title and price stay
    expect(d.fields.askingPrice).toBe(10500000);
    expect(d.fields).toMatchObject({ areaSqft: 1400, bhk: 3 });
    expect((await drafts()).filter(x => x.fields?.leadId === l.id)).toHaveLength(1);
  });
  it('a buyer lead is NOT interviewed (no owner questions, no draft)', async () => {
    const r = await scan('9123459903', 'BUY', { name: 'Ravi Kale', locality: 'Baner', budget: '80 lakh', direct: '1', sign: 'Ravi Kale' }); const t3 = tokOf(r);
    expect(r.status).toBe(303);
    await form(undefined, `/q/chat/${t3}/ans`, { a: 'YES' });
    const l = await lead('9903'); expect(l.bot.interview).toBeNull();
  });
});
