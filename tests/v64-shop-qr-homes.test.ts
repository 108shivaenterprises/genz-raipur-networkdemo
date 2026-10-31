import { freePort } from './helpers/port';
/**
 * v64 — the shop QR page shows the broker's public-page homes (his own + other brokers' that opened theirs), "I'm interested" keeps the lead
 * with the QR's broker only, a buyer / renter ticks + signs the "no direct deal" promise, and the lead shows which shop and which home.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { partnerAmount, checkTerms } from '../src/shared/shopPartner';

describe('shop partner rules', () => {
  it('share = % of the broker\'s brokerage or a fixed ₹, never more than the brokerage; terms are checked', () => {
    expect(partnerAmount({ mode: 'PCT', value: 20 }, 100000)).toBe(20000);
    expect(partnerAmount({ mode: 'FIXED', value: 2000 }, 15000)).toBe(2000);
    expect(partnerAmount({ mode: 'FIXED', value: 50000 }, 15000)).toBe(15000);
    expect(checkTerms({ sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 })).toBeNull();
    expect(checkTerms({ sale: { mode: 'PCT', value: 80 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 })).toMatch(/Sale/);
    expect(checkTerms({ sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 20.5 }, lockDays: 180 })).toMatch(/Rent/);
    expect(checkTerms({ sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 5 })).toMatch(/protection/);
  });
});

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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v64-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });


const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const cookieOf = (r: Response) => (r.headers.get('set-cookie') || '').split(';')[0];
const TERMS = { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 };
const SHOP_PHONE = '9876500022';
let partner: any; let own = ''; let net = ''; let netTitle = '';
async function partnerSignIn(tok: string) {
  const o = await form(undefined, `/sp/${tok}/otp`, { phone: SHOP_PHONE });
  const code = (await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json()).partners.find((x: any) => x.id === partner.id).codeForPartner;
  const v = await form(undefined, `/sp/${tok}/verify`, { code }); void o;
  return cookieOf(v);
}
const qr = () => `/q/${partner.qrCode}`;
async function scan(phone: string, kind: string, extra: Record<string, string> = {}) {
  const page = await (await fetch(`${B}${qr()}`)).text();
  const t = /name="t" value="([^"]+)"/.exec(page)?.[1] || '';
  await sleep(2600);
  return form(undefined, qr(), { t, kind, name: 'Mohit Garg', phone, locality: 'Shankar Nagar', budget: '50 lakh', ptype: 'Flat', note: '', consent: '1', ...extra });
}
const leads = async () => (await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json()).leads as any[];

describe('shop QR page with homes', { timeout: 40000 }, () => {
  it('setup: the QR is live; the broker\'s page has his own home and another broker\'s home', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Verma Medical', personName: 'Suresh Verma', phone: SHOP_PHONE, area: 'Shankar Nagar', city: 'Raipur', terms: TERMS, consent: true });
    expect(r.status).toBe(200); const j = await r.json(); partner = j.partner; const token = j.link.split('/sp/')[1];
    const ck = await partnerSignIn(token); expect((await form(ck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
    const ov = await (await call(jar.BRK1, 'GET', '/api/public-page')).json();
    expect(ov.card.enabled).toBe(true);
    const html = await (await fetch(`${B}${qr()}`)).text();
    const ids = [...html.matchAll(/id="h-([A-Za-z0-9-]+)"/g)].map(m => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const all = (await (await call(jar.BRK1, 'GET', '/api/properties')).json()).properties as any[];
    own = ids.find(id => all.find(p => p.id === id)?.listingBrokerId === 'USR-BRK-001')!;
    net = ids.find(id => all.find(p => p.id === id)?.listingBrokerId !== 'USR-BRK-001')!;
    expect(own).toBeTruthy(); expect(net).toBeTruthy();
    netTitle = all.find(p => p.id === net).title;
    expect(html).toContain('मुझे पसंद है'); expect(html).toContain('GENZ नेटवर्क लिस्टिंग');
    expect(html).toContain('मुझे प्रॉपर्टी चाहिए'); expect(html).toContain('मुझे अपनी प्रॉपर्टी देनी है');
  });

  it('never shows an owner, an address or a number; a home its listing broker closed to pages drops out at once', async () => {
    const html = await (await fetch(`${B}${qr()}`)).text();
    const all = (await (await call(jar.ADMIN, 'GET', '/api/properties')).json()).properties as any[];
    for (const id of [own, net]) { const p = all.find(x => x.id === id); for (const secret of [p.ownerName, p.ownerPhone, p.addressHidden, p.googleMapsLink].filter(x => x && String(x).length > 5)) expect(html, id).not.toContain(String(secret)); }
    const owner = all.find(p => p.id === net).listingBrokerId; const ownerCookie = owner === 'USR-BRK-002' ? jar.BRK2 : '';
    expect(ownerCookie).toBeTruthy();
    const off = await call(ownerCookie, 'POST', `/api/public-page/others/${net}`, { on: false });
    expect(off.status, await off.clone().text()).toBeLessThan(300);
    expect(await (await fetch(`${B}${qr()}`)).text()).not.toContain(`id="h-${net}"`);
    const on = await call(ownerCookie, 'POST', `/api/public-page/others/${net}`, { on: true, ownerOk: true });
    expect(on.status).toBeLessThan(300);
    // it does not come back by itself — the QR broker adds it again
    expect(await (await fetch(`${B}${qr()}`)).text()).not.toContain(`id="h-${net}"`);
    const put = await call(jar.BRK1, 'PUT', '/api/public-page/homes', { ids: [own, net], ownerOk: true });
    expect(put.status, await put.clone().text()).toBe(200);
    expect(await (await fetch(`${B}${qr()}`)).text()).toContain(`id="h-${net}"`);
  });

  it('"I\'m interested" opens the form with the home chosen and the buyer kind set', async () => {
    const html = await (await fetch(`${B}${qr()}?home=${own}#form`)).text();
    expect(html).toContain(`name="home" value="${own}"`); expect(html).toMatch(/value="(BUY|RENT_IN)" checked/);
    expect(html).toContain('ख़रीदने या किराये पर लेने वालों के लिए'); // the promise is on the page
    expect(await (await fetch(`${B}${qr()}?want=sell`)).text()).toMatch(/value="SELL" checked/);
  });

  it('a buyer must tick and sign the "no direct deal" promise', async () => {
    const r = await scan('9123477701', 'BUY', { home: own });
    expect(r.status).toBe(200); expect(await r.text()).toContain('सीधा सौदा नहीं');
    expect((await leads()).some(l => l.phoneLast4 === '7701')).toBe(false);
    const r2 = await scan('9123477702', 'BUY', { home: own, direct: '1' }); // ticked, not signed
    expect(r2.status).toBe(200);
    expect((await leads()).some(l => l.phoneLast4 === '7702')).toBe(false);
  });

  it('with the promise the lead goes only to this broker, with the shop, the home and the signed promise', async () => {
    const r = await scan('9123477703', 'BUY', { home: net, direct: '1', sign: 'Mohit Garg' });
    expect(r.status).toBe(303);
    const l = (await leads()).find(x => x.phoneLast4 === '7703');
    expect(l).toBeTruthy();
    expect(l.shopName).toBe('Verma Medical'); expect(l.homeId).toBe(net); expect(l.homeTitle).toBe(netTitle); expect(l.homeOwn).toBe(false);
    expect(l.promise.signName).toBe('Mohit Garg'); expect(l.promise.version).toBe('v1'); expect(l.promise.text).toMatch(/directly/);
    expect(l.clientCardId).toBeUndefined(); expect(l.phone).toBeUndefined();   // v85: no client card (no number) until the need is confirmed and a home is shared
    // the listing broker (another broker) sees nothing of this lead — not in his shop-QR list, not in his client list, not in the audit text
    const other = await (await call(jar.BRK2, 'GET', '/api/shop-partners')).json();
    expect(JSON.stringify(other)).not.toContain('9123477703'); expect(JSON.stringify(other)).not.toContain('Mohit Garg');
    const audit = JSON.stringify((await (await call(jar.ADMIN, 'GET', '/api/audit-logs?limit=200')).json()));
    expect(audit).not.toContain('9123477703');
  });

  it('a home not on the broker\'s page is ignored (no home on the lead); an own home is marked as his', async () => {
    const r = await scan('9123477704', 'BUY', { home: 'PROP-DOES-NOT-EXIST', direct: '1', sign: 'Mohit Garg' });
    expect(r.status).toBe(303);
    const l = (await leads()).find(x => x.phoneLast4 === '7704'); expect(l.homeId).toBeUndefined();
    const r2 = await scan('9123477705', 'RENT_IN', { home: own, direct: '1', sign: 'Mohit Garg' });
    expect(r2.status).toBe(303);
    expect((await leads()).find(x => x.phoneLast4 === '7705').homeOwn).toBe(true);
  });

  it('a seller needs no promise and the lead is still just a lead (no listing is made)', async () => {
    const before = ((await (await call(jar.ADMIN, 'GET', '/api/properties')).json()).properties as any[]).length;
    const r = await scan('9123477706', 'SELL');
    expect(r.status).toBe(303);
    const l = (await leads()).find(x => x.phoneLast4 === '7706'); expect(l.kind).toBe('SELL'); expect(l.promise).toBeUndefined();
    expect(((await (await call(jar.ADMIN, 'GET', '/api/properties')).json()).properties as any[]).length).toBe(before);
  });

  it('with the broker\'s page OFF the QR page shows no homes (the form still works)', async () => {
    expect((await call(jar.BRK1, 'PUT', '/api/public-page/settings', { enabled: false })).status).toBe(200);
    const html = await (await fetch(`${B}${qr()}`)).text();
    expect(html).not.toContain('id="h-'); expect(html).toContain('name="kind"');
    expect((await call(jar.BRK1, 'PUT', '/api/public-page/settings', { enabled: true })).status).toBe(200);
  });
});
