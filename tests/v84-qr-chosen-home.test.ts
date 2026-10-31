import { freePort } from './helpers/port';
/**
 * v84 — on the shop QR page the home the customer chose stays in front of him ON the form (photo, price, title, place, a way to change it),
 * and a broker whose QR shows no homes is told why (his public page is off / he is not verified / none of his listings is switched on).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { readFileSync } from 'fs';

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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v84-')); mkdirSync(path.join(dir, 'data'));
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


describe('shop QR: the chosen home stays on the form', { timeout: 40000 }, () => {
  let code = ''; let homeId = ''; let homeTitle = '';
  it('setup: a live QR for broker 1', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Verma Medical', personName: 'Suresh Verma', phone: SHOP_PHONE, area: 'Shankar Nagar', city: 'Raipur', terms: TERMS, consent: true });
    expect(r.status).toBe(200); const j = await r.json(); partner = j.partner; code = j.partner.qrCode; const token = j.link.split('/sp/')[1];
    const ck = await partnerSignIn(token); expect((await form(ck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);   // the shop accepts → the QR is live
    const html = await (await fetch(`${B}/q/${code}`)).text();
    homeId = [...html.matchAll(/id="h-([A-Za-z0-9-]+)"/g)].map(m => m[1])[0]; expect(homeId).toBeTruthy();
    expect(html).toContain('id="homes"');                       // "See other homes" has somewhere to go back to
    expect(html).not.toContain('data-testid="qr-picked-home"'); // nothing chosen yet → no chosen-home card
    homeTitle = new RegExp(`id="h-${homeId}"[\\s\\S]*?<div class="tt">([^<]+)</div>`).exec(html)?.[1] || '';
  });
  it('after “I’m interested” the form itself carries the home: photo box, price, title, place and a “see other homes” link', async () => {
    const html = await (await fetch(`${B}/q/${code}?home=${homeId}#form`)).text();
    const form = html.slice(html.indexOf('id="form"'), html.indexOf('<form method="post"'));
    expect(form).toContain('data-testid="qr-picked-home"'); expect(form).toContain('<canvas'); expect(form).toContain('data-wm=');   // the watermarked photo box, same as the list
    expect(form).toContain('You chose this home'); expect(form).toContain('data-testid="qr-change-home"'); expect(form).toContain(`href="/q/${code}#homes"`);
    if (homeTitle) expect(form).toContain(homeTitle.replace(/&amp;/g, '&').split('&')[0]);
    expect(html).toContain('name="home" value="' + homeId + '"');      // and the lead still carries the home
  });
  it('a home id that is not on this broker’s page picks nothing (no card, no hidden field)', async () => {
    const html = await (await fetch(`${B}/q/${code}?home=PROP-NOT-THERE`)).text();
    expect(html).not.toContain('data-testid="qr-picked-home"'); expect(html).not.toContain('name="home"');
  });
  it('the broker is told how many homes his QR pages show — and why none when none', async () => {
    const j = await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json();
    expect(j.homes.verified).toBe(true); expect(j.homes.pageOn).toBe(true); expect(j.homes.shown).toBeGreaterThan(0);
    const ui = readFileSync(path.join(ROOT, 'src/components/ShopPartners.tsx'), 'utf8');
    expect(ui).toContain('data-testid="sp-no-homes"'); expect(ui).toContain('d.homes.shown === 0');
    for (const hi of ['पब्लिक पेज बंद है', 'वेरिफ़िकेशन के बाद', 'कोई लिस्टिंग चालू नहीं']) expect(ui).toContain(hi);
  });
});
