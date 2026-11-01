import { freePort } from './helpers/port';
/**
 * v103 — the GENZ सहायक follows the homes by itself.
 *   · a NEW home that fits a confirmed need is shown in the customer's chat (without him asking) — at once when his number is already open,
 *     and only after the audit-F3 wait (48 h; here a few seconds) when the home would be what opens the number;
 *   · a home he was shown that is SOLD / WITHDRAWN / SUSPENDED gets one plain line in his chat + the next best homes; the card carries the status;
 *   · an undo brings one "available again" line; nothing is said twice;
 *   · it keeps quiet when the bot is off, when he never confirmed his need, and within the 4-hour gap.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { goneKind, GONE_WORDS, BOT_WATCH } from '../src/shared/sahayak';

const ROOT = path.resolve(__dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
const FRESH_SECONDS = 11;                       // REVEAL_FRESH_LISTING_HOURS below = 0.003 h ≈ 10.8 s
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v103-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PUSH_DRY_RUN: 'true', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true', REVEAL_FRESH_LISTING_HOURS: '0.003' },
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
const SHOP_PHONE = '9876500103';
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
const chatPage = async (tok: string) => (await fetch(`${B}/q/chat/${tok}`)).text();
const bots = (l: any) => l.chat.msgs.filter((m: any) => m.by === 'BOT');
const homesOf = (l: any): string[] => l.chat.msgs.filter((m: any) => m.kind === 'HOME').map((m: any) => m.homeId);
const botText = (l: any) => bots(l).map((m: any) => `${m.text}\n${m.en || ''}`).join('\n---\n');
const inbox = async () => ((await j(await call(jar.BRK1, 'GET', '/api/inbox?lang=hi'))).items || []) as any[];
/** wait until `cond` holds for the lead (the listing hook runs just after the response) */
async function until(last4: string, cond: (l: any) => boolean, ms = 4000) {
  const end = Date.now() + ms; let l = await lead(last4);
  while (Date.now() < end) { if (cond(l)) return l; await sleep(150); l = await lead(last4); }
  return l;
}
const newHome = (title: string, price: number, extra: Record<string, unknown> = {}) => call(jar.BRK1, 'POST', '/api/properties', {
  title, description: 'A residential house, east facing, near the park', propertyType: 'Independent House', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: 'Shankar Nagar',
  addressHidden: 'Lane 4, Shankar Nagar', askingPrice: price, ownerApprovedNetPrice: Math.round(price * 0.95), ownerName: 'Test Owner', ownerPhone: '9123450103', ...extra });
const mk = async (title: string, price: number) => { const r = await newHome(title, price); expect(r.status, title).toBe(200); return (await j(r)).property.id as string; };

describe('the assistant follows the homes by itself (v103)', { timeout: 120000 }, () => {
  const A = '9123410301'; const Bb = '9123410302'; const C = '9123410303';
  let tokA = ''; let tokB = ''; let tokC = ''; let h1 = ''; let h2 = ''; let h3 = '';

  it('setup: a live QR for broker 1 and one house of his in Shankar Nagar (made before anybody scans)', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Watch Medical', personName: 'Ramesh Verma', phone: SHOP_PHONE, area: 'Shankar Nagar', city: 'Raipur', terms: TERMS, consent: true });
    expect(r.status).toBe(200); const jj = await j(r); partner = jj.partner; qr = jj.partner.qrCode; const token = jj.link.split('/sp/')[1];
    const ck = await partnerSignIn(token); expect((await form(ck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
    h1 = await mk('Watch house one in Shankar Nagar', 20000000); await sleep(300);
  });

  it('customer A (3 crore) confirms → shown homes, number open; customer B (50 lakh) confirms → nothing fits yet (number stays hidden); customer C never confirms', async () => {
    tokA = tokOf(await scan('Asha Watch', A)); tokB = tokOf(await scan('Bimal Watch', Bb, { budget: '50 lakh' })); tokC = tokOf(await scan('Chetan Watch', C));
    expect(tokA && tokB && tokC).toBeTruthy();
    expect((await form(undefined, `/q/chat/${tokA}/ans`, { a: 'YES' })).status).toBe(303);
    expect((await form(undefined, `/q/chat/${tokB}/ans`, { a: 'YES' })).status).toBe(303);
    const a = await lead('0301'); const b = await lead('0302'); const c = await lead('0303');
    expect(homesOf(a).length).toBeGreaterThan(0); expect(a.masked).toBe(false); expect(a.bot.following).toBe(true);
    expect(homesOf(b)).toHaveLength(0); expect(b.masked).toBe(true); expect(botText(b)).toContain('as soon as it comes');   // the promise the assistant now keeps
    expect(c.chat.reqConfirmedAt).toBeNull(); expect(c.bot.following).toBe(false);
  });

  it('a NEW listing that fits → customer A (number open) gets it in the chat at once, nobody asked; broker 1 is told; B (the number would open) and C get nothing yet', async () => {
    h2 = await mk('Watch house two in Shankar Nagar', 4500000);
    const a = await until('0301', l => homesOf(l).includes(h2));
    expect(homesOf(a)).toContain(h2);
    const last = bots(a).filter((m: any) => m.kind === 'CHIPS').at(-1);
    expect(last.text).toContain('नया घर'); expect(last.en).toContain('new home'); expect(last.chips.map((c: any) => c.id)).toContain('VISIT');
    expect(a.bot.watchPushes).toBe(1);
    const bell = (await inbox()).find(i => /नया घर भेजा/.test(i.title) && /Asha Watch/.test(i.title)); expect(bell, 'broker bell').toBeTruthy();
    const b = await lead('0302'); expect(homesOf(b)).toHaveLength(0); expect(b.masked).toBe(true);   // audit F3: a home made after he scanned must not be what opens his number
    const c = await lead('0303'); expect(homesOf(c)).toHaveLength(0);
    expect(await chatPage(tokA)).toContain('Watch house two');
  });

  it('a second new listing right after is NOT pushed (one push per 4 hours) — and nothing is written twice on a re-open', async () => {
    h3 = await mk('Watch house three in Shankar Nagar', 4700000); await sleep(600);
    let a = await lead('0301'); expect(homesOf(a)).not.toContain(h3); expect(a.bot.watchPushes).toBe(1);
    const n = bots(a).length; await chatPage(tokA); await chatPage(tokA); a = await lead('0301'); expect(bots(a).length).toBe(n);
  });

  it('after the wait, B opens his chat → the new home that fits him is shown, his number opens, the broker is told (the F3 wait is kept, not removed)', async () => {
    await sleep(FRESH_SECONDS * 1000);
    await chatPage(tokB);
    const b = await until('0302', l => homesOf(l).length > 0);
    expect(homesOf(b).length).toBeGreaterThan(0); expect(homesOf(b).every((id: string) => [h2, h3].includes(id))).toBe(true);
    expect(b.masked).toBe(false); expect(botText(b)).toContain('new home');
    expect((await inbox()).some(i => /नंबर खुल गया/.test(i.title) && /Bimal Watch/.test(i.title))).toBe(true);
  });

  it('a home he was shown is SOLD → one plain line + the card carries the status + the next best home; the broker is not spammed; saying it twice never happens', async () => {
    const before = homesOf(await lead('0301'));
    expect((await call(jar.BRK1, 'POST', `/api/listings/${h1}/status`, { status: 'sold', soldVia: 'OUTSIDE' })).status).toBe(200);
    expect(before).toContain(h1);
    const a = await until('0301', l => /बिक चुका/.test(botText(l)));
    expect(botText(a)).toMatch(/Watch house one.*बिक चुका/); expect(botText(a)).toContain('has been sold');
    expect(bots(a).some((m: any) => m.kind === 'CHIPS' && /अभी इसके जैसा कोई और|ऊपर भेजे हैं/.test(m.text))).toBe(true);   // a replacement or the promise — never silence
    const msgs = a.chat.msgs.filter((m: any) => m.kind === 'HOME' && m.homeId === h1); expect(msgs.length).toBeGreaterThan(0); expect(msgs.every((m: any) => m.gone === 'SOLD')).toBe(true);
    const page = await chatPage(tokA); expect(page).toContain('data-gone="SOLD"'); expect(page).toContain('❌ बिक चुका है');
    // another change elsewhere, and re-opening, say nothing more about it
    const n = bots(a).length; await mk('Watch house four elsewhere', 99000000); await sleep(600); await chatPage(tokA);
    const again = await lead('0301'); expect(bots(again).filter((m: any) => /Watch house one.*बिक चुका/.test(m.text)).length).toBe(1); expect(bots(again).length).toBe(n);
  });

  it('an UNDO inside 24 h → one “available again” line, and the card is clean again', async () => {
    expect((await call(jar.BRK1, 'POST', `/api/listings/${h1}/undo`, {})).status).toBe(200);
    const a = await until('0301', l => /फिर से उपलब्ध/.test(botText(l)));
    expect(botText(a)).toContain('available again'); expect(a.chat.msgs.filter((m: any) => m.homeId === h1).every((m: any) => !m.gone)).toBe(true);
    expect(await chatPage(tokA)).not.toContain('data-gone="SOLD"');
  });

  it('WITHDRAWN and an admin SUSPEND are told the same way (the words differ)', async () => {
    expect((await call(jar.BRK1, 'POST', `/api/listings/${h2}/status`, { status: 'withdrawn' })).status).toBe(200);
    let a = await until('0301', l => /हटा दिया गया/.test(botText(l)));
    expect(botText(a)).toMatch(/Watch house two.*हटा दिया गया/); expect(botText(a)).toContain('taken off the list');
    // nothing else fits him now: he is promised the next one (which is now true), and the broker is told he has no replacement to offer
    expect(bots(a).some((m: any) => m.kind === 'CHIPS' && /अभी इसके जैसा कोई और मेल खाता घर नहीं है — नया घर आते ही/.test(m.text))).toBe(true);
    const bell = (await inbox()).find(i => /Asha Watch/.test(i.title) && /Watch house two/.test(i.title)); expect(bell, 'broker bell: no replacement').toBeTruthy(); expect(bell.body).toMatch(/कोई मेल खाता घर नहीं/);
    expect((await call(jar.ADMIN, 'POST', `/api/properties/${h1}/moderate`, { action: 'SUSPEND', reason: 'checking papers for this house' })).status).toBe(200);
    a = await until('0301', l => /Watch house one.*अभी उपलब्ध नहीं/.test(botText(l)));
    expect(botText(a)).toMatch(/Watch house one.*अभी उपलब्ध नहीं/);
    expect(await chatPage(tokA)).toContain('data-gone="OFF"');
    expect((await call(jar.ADMIN, 'POST', `/api/properties/${h1}/moderate`, { action: 'RESTORE' })).status).toBe(200);
    a = await until('0301', l => (botText(l).match(/फिर से उपलब्ध/g) || []).length >= 2);
    expect((botText(a).match(/फिर से उपलब्ध/g) || []).length).toBe(2);
  });

  it('the broker switches the assistant OFF for this chat → a new listing or a sold home is NOT told to the customer (the card still shows the status)', async () => {
    const a0 = await lead('0301');
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${a0.id}/bot`, { off: true })).status).toBe(200);
    const n = bots(await lead('0301')).length;
    expect((await call(jar.BRK1, 'POST', `/api/listings/${h3}/status`, { status: 'withdrawn' })).status).toBe(200);
    await mk('Watch house five (bot off)', 4400000); await sleep(800); await chatPage(tokA);
    const a = await lead('0301'); expect(bots(a).length).toBe(n);
    expect(await chatPage(tokA)).toMatch(/data-gone="WITHDRAWN"|Watch house three/);
  });

  it('C, who never confirmed his need, was never written to', async () => {
    const c = await lead('0303'); expect(bots(c).every((m: any) => !/🆕|अपडेट/.test(m.text))).toBe(true); expect(homesOf(c)).toHaveLength(0);
  });
});

describe('v103 — the pure parts', () => {
  it('every reason has Hindi and English words, and the limits are what the doc says', () => {
    expect(goneKind({ listingStatus: 'sold' }, false)).toBe('SOLD'); expect(goneKind({ listingStatus: 'rented' }, false)).toBe('RENTED');
    expect(goneKind({ listingStatus: 'withdrawn' }, false)).toBe('WITHDRAWN'); expect(goneKind({ listingStatus: 'active', expiredAt: '2026-01-01' }, false)).toBe('EXPIRED');
    expect(goneKind({ listingStatus: 'suspended' }, false)).toBe('OFF'); expect(goneKind({ listingStatus: 'active' }, false)).toBe('OFF');
    expect(goneKind({ listingStatus: 'sold', purgedAt: '2026-01-01' }, false)).toBe('GONE'); expect(goneKind(undefined, false)).toBe('GONE');
    expect(goneKind({ listingStatus: 'sold' }, true)).toBeNull();   // live always wins
    for (const k of Object.keys(GONE_WORDS) as (keyof typeof GONE_WORDS)[]) { const w = GONE_WORDS[k]; expect(w.hi && w.en && w.shortHi && w.shortEn).toBeTruthy(); expect(w.en).not.toMatch(/[ऀ-ॿ]/); expect(w.shortEn).not.toMatch(/[ऀ-ॿ]/); }
    expect(BOT_WATCH).toEqual({ days: 30, gapHours: 4, maxPushes: 10 });
  });
});
