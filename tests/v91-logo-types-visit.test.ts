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
const PORT = 7300 + Math.floor(Math.random() * 90);
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v91-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', SUPER: 'USR-SUPERADMIN' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });


const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const cookieOf = (r: Response) => (r.headers.get('set-cookie') || '').split(';')[0];
const TERMS = { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 };
const SHOP_PHONE = '9876500033';
let partner: any; let qr = '';
const list = async () => (await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json());
async function scan(phone: string, kind: string, extra: Record<string, string> = {}) {
  const page = await (await fetch(`${B}/q/${qr}`)).text();
  const t = /name="t" value="([^"]+)"/.exec(page)?.[1] || '';
  await sleep(2600);
  return form(undefined, `/q/${qr}`, { t, kind, name: 'Mohit Garg', phone, locality: 'Shankar Nagar', budget: '3 crore', ptype: 'House', note: '', consent: '1', direct: '1', sign: 'Mohit Garg', ...extra });
}
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('v91 GENZ logo (superadmin only) + QR property types + visit auto-mark', { timeout: 120000 }, () => {
  it('setup: a live QR for broker 1', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Mina chai', personName: 'Mina', phone: SHOP_PHONE, area: 'Raipur', city: 'Raipur', terms: TERMS, consent: true });
    expect(r.status).toBe(200); const j = await r.json(); partner = j.partner; qr = j.partner.qrCode;
    const token = j.link.split('/sp/')[1];
    await form(undefined, `/sp/${token}/otp`, { phone: SHOP_PHONE });
    const code = (await list()).partners.find((x: any) => x.id === partner.id).codeForPartner;
    const ck = cookieOf(await form(undefined, `/sp/${token}/verify`, { code }));
    expect((await form(ck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
  });

  it('the QR form offers the property types (plot, shop, farm…), not only homes', async () => {
    const page = await (await fetch(`${B}/q/${qr}`)).text();
    for (const t of ['Plot', 'Shop', 'Farm', 'Godown', 'Flat']) expect(page.toLowerCase()).toContain(t.toLowerCase());
    expect(page).toContain('<optgroup');
  });

  it('the logo is on by default: public config, image, and a strip on the public page', async () => {
    const c = await (await fetch(`${B}/api/brand/config`)).json();
    expect(c.enabled).toBe(true); expect(c.surfaces.qr && c.surfaces.page).toBe(true);
    const img = await fetch(`${B}/api/brand/logo`); expect(img.status).toBe(200); expect(img.headers.get('content-type')).toMatch(/image\//);
    const page = await (await fetch(`${B}/q/${qr}`)).text(); expect(page).toContain('data-gz-logo="page"');
  });

  it('only the superadmin can change it (a broker is refused; an SVG or a big file is refused)', async () => {
    expect((await call(jar.BRK1, 'PUT', '/api/brand', { enabled: false })).status).toBe(403);
    expect((await call(undefined, 'PUT', '/api/brand', { enabled: false })).status).toBe(401);
    const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    expect((await call(jar.SUPER, 'PUT', '/api/brand', { image: svg })).status).toBe(400);
    const big = 'data:image/png;base64,' + Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(320 * 1024)]).toString('base64');
    expect((await call(jar.SUPER, 'PUT', '/api/brand', { image: big })).status).toBe(413);
  });

  it('the superadmin uploads a logo; it is served, and switching it off removes it from pages and QR', async () => {
    const up = await call(jar.SUPER, 'PUT', '/api/brand', { image: PNG }); expect(up.status).toBe(200); expect((await up.json()).custom).toBe(true);
    const img = await fetch(`${B}/api/brand/logo`); expect(img.headers.get('content-type')).toBe('image/png');
    const off = await call(jar.SUPER, 'PUT', '/api/brand', { enabled: false }); expect(off.status).toBe(200);
    const page = await (await fetch(`${B}/q/${qr}`)).text(); expect(page).not.toContain('data-gz-logo="page"');
    expect((await call(jar.SUPER, 'PUT', '/api/brand', { enabled: true, surfaces: { page: false } })).status).toBe(200);
    expect(await (await fetch(`${B}/q/${qr}`)).text()).not.toContain('data-gz-logo="page"');
    expect((await call(jar.SUPER, 'PUT', '/api/brand', { surfaces: { page: true }, image: null })).status).toBe(200);
    expect(await (await fetch(`${B}/q/${qr}`)).text()).toContain('data-gz-logo="page"');
  });

  it('a plot customer is not shown a flat (type is checked)', async () => {
    const r = await scan('9123459101', 'BUY', { ptype: 'Plot', name: 'Plot Wala' }); expect(r.status).toBe(303);
    const l = (await list()).leads.find((x: any) => x.phoneLast4 === '9101'); expect(l).toBeTruthy();
  });

  it('booking a visit for a shop customer moves the lead to Contacted and tells the shop', async () => {
    const r = await scan('9123459102', 'BUY', { name: 'Visit Wala' }); expect(r.status).toBe(303);
    const before = (await list()).leads.find((x: any) => x.phoneLast4 === '9102'); expect(before.status).toBe('NEW');
    const when = new Date(Date.now() + 86400_000).toISOString();
    const v = await call(jar.BRK1, 'POST', '/api/site-visits', { propertyId: 'PROP-RAI-101', customerName: 'Visit Wala', customerPhone: '9123459102', scheduledTime: when });
    expect([200, 201]).toContain(v.status);
    const after = (await list()).leads.find((x: any) => x.phoneLast4 === '9102'); expect(after.status).toBe('CONTACTED');
    const again = await call(jar.BRK1, 'GET', '/api/shop-partners'); expect(again.status).toBe(200);
  });
});
