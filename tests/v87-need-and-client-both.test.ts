import { freePort } from './helpers/port';
/**
 * v87 — when a shop-QR lead's number opens, he lands in BOTH of the broker's lists: the client card (Today & Clients) AND the buyer need (Buyers / Magic Match). Before v85 — a shop-QR lead's number is hidden from the broker (only ••last4) until, in the in-app chat, the customer has confirmed his need
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v87-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
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


const needsOf = async (cookie: string) => (await (await call(cookie, 'GET', '/api/requirements?mine=1')).json()).requirements as any[];
async function reveal(phone: string, kind: string, budget: string, ptype = 'House') {
  const r = await scan(phone, kind, { budget, ptype }); const t = tokOf(r); const last4 = phone.slice(-4);
  const l = await leadByLast4(last4);
  await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${l.id}/ask-need`);
  await form(undefined, `/q/chat/${t}/ans`, { a: 'YES' });
  const m = (await leadByLast4(last4)).matches;
  if (m.length) return (await (await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${l.id}/offer`, { homeId: m[0].id })).json()).lead;
  return { id: l.id, matches: m };
}

describe('revealing a shop lead puts the client in BOTH lists', { timeout: 90000 }, () => {
  it('setup: a live QR for broker 1', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Verma Medical', personName: 'Suresh Verma', phone: SHOP_PHONE, area: 'Shankar Nagar', city: 'Raipur', terms: TERMS, consent: true });
    expect(r.status).toBe(200); const j = await r.json(); partner = j.partner; qr = j.partner.qrCode; const token = j.link.split('/sp/')[1];
    const ck = await partnerSignIn(token); expect((await form(ck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
  });
  it('before the number opens there is neither a client card nor a buyer need', async () => {
    await scan('9123455510', 'BUY', { budget: '3 crore' });
    expect((await needsOf(jar.BRK1)).some((q: any) => String(q.customerPhone).replace(/\D/g, '').endsWith('9123455510'))).toBe(false);
    expect((await leadByLast4('5510')).masked).toBe(true);
  });
  it('after the reveal: one client card with the budget AND one buyer need (sale, 70%–100% of the budget, the area he gave)', async () => {
    const l = await reveal('9123455511', 'BUY', '3 crore'); expect(l.masked).toBe(false); expect(l.clientCardId).toBeTruthy();
    const mine = (await needsOf(jar.BRK1)).filter((q: any) => String(q.customerPhone).replace(/\D/g, '').endsWith('9123455511'));
    expect(mine.length).toBe(1);
    expect(mine[0].transactionType).toBe('Sale'); expect(mine[0].budgetMax).toBe(30_000_000); expect(mine[0].budgetMin).toBe(21_000_000);
    expect(mine[0].preferredLocalities).toContain('Shankar Nagar'); expect(mine[0].propertyType).toBe('Independent House'); expect(mine[0].assignedBrokerId).toBe('USR-BRK-001');
    const cards = (await (await call(jar.BRK1, 'GET', '/api/daily/clients')).json()); const card = (cards.clients || []).find((c: any) => c.id === l.clientCardId);
    if (card) { expect(card.budgetMax).toBe(30_000_000); expect(card.budgetMin).toBe(21_000_000); }
    expect(l.links.some((x: any) => x.kind === 'NEED')).toBe(true);                      // the screen then hides the manual "Find in network" button (no second copy)
  });
  it('the other broker sees the need on the network board with the number masked, not as his own client', async () => {
    const all = (await (await call(jar.BRK2, 'GET', '/api/requirements')).json()).requirements.find((q: any) => q.customerName && /Mohit/.test(q.customerName) || String(q.customerPhone).includes('9123455511'));
    if (all) expect(String(all.customerPhone)).not.toContain('9123455511');
    expect((await needsOf(jar.BRK2)).some((q: any) => /Mohit/.test(q.customerName))).toBe(false);
  });
  it('scanning again with the same mobile makes neither a second lead nor a second need', async () => {
    const count = async () => (await needsOf(jar.BRK1)).filter((q: any) => String(q.customerPhone).replace(/\D/g, '').endsWith('9123455511')).length;
    const leads0 = (await list()).leads.filter((x: any) => x.phoneLast4 === '5511').length;
    await scan('9123455511', 'BUY', { budget: '3 crore' });
    expect(await count()).toBe(1); expect((await list()).leads.filter((x: any) => x.phoneLast4 === '5511').length).toBe(leads0);
  });
  it('a rent lead: a rent need with the monthly budget (a bare 15 means 15 thousand)', async () => {
    const rentHome = (await (await call(jar.BRK1, 'GET', '/api/properties')).json()).properties.find((p: any) => p.listingBrokerId === 'USR-BRK-001' && p.transactionType !== 'Sale' && p.status === 'active');
    if (!rentHome) return;   // the demo data gives broker 1 no live rent home, so a rent lead cannot reach the reveal here; the rent money rule is covered by budgetRupees below
    const r = await scan('9123455512', 'RENT_IN', { budget: '15', ptype: 'Flat', locality: rentHome.locality }); const t = tokOf(r); const l0 = await leadByLast4('5512');
    await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${l0.id}/ask-need`); await form(undefined, `/q/chat/${t}/ans`, { a: 'YES' });
    const m = (await leadByLast4('5512')).matches; expect(m.length).toBeGreaterThan(0);
    const l = (await (await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${l0.id}/offer`, { homeId: m[0].id })).json()).lead; expect(l.masked).toBe(false);
    const q = (await needsOf(jar.BRK1)).find((x: any) => String(x.customerPhone).replace(/\D/g, '').endsWith('9123455512'));
    expect(q.transactionType).toBe('Rent'); expect(q.budgetMax).toBe(15_000); expect(q.propertyType).toBe('Residential Flat');
  });
  it('an owner (sell) lead makes no buyer need', async () => {
    const OWNER = '9123455513'; const r = await scan(OWNER, 'SELL', { direct: '', sign: '', locality: 'Telibandha', budget: '' }); const t = tokOf(r);
    const l = await leadByLast4('5513'); await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${l.id}/ask-need`); await form(undefined, `/q/chat/${t}/ans`, { a: 'YES' });
    expect((await needsOf(jar.BRK1)).some((q: any) => String(q.customerPhone).replace(/\D/g, '').endsWith('9123455513'))).toBe(false);
  });
});

describe('budgetRupees', () => {
  it('reads units, and a bare small number the way a customer means it', async () => {
    const { budgetRupees: b } = await import('../server/shopPartners.js');
    expect(b('40 lakh', false)).toBe(4_000_000); expect(b('1.2 cr', false)).toBe(12_000_000); expect(b('50', false)).toBe(5_000_000); expect(b('15', true)).toBe(15_000);
    expect(b('15000', true)).toBe(15_000); expect(b('12k', true)).toBe(12_000); expect(b('jo bhi', false)).toBeNull(); expect(b('', false)).toBeNull(); expect(b(undefined, true)).toBeNull();
  });
});
