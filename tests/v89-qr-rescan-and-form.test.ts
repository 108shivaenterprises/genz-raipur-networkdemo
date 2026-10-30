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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v89-')); mkdirSync(path.join(dir, 'data'));
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



describe('the QR form follows the chosen side; the same mobile scanning again is not swallowed silently', { timeout: 90000 }, () => {
  it('setup: a live QR for broker 1', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Karan tea stall', personName: 'Karan', phone: SHOP_PHONE, area: 'Raipur', city: 'Raipur', terms: TERMS, consent: true });
    expect(r.status).toBe(200); const j = await r.json(); partner = j.partner; qr = j.partner.qrCode; const token = j.link.split('/sp/')[1];
    const ck = await partnerSignIn(token); expect((await form(ck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
  });
  it('a seller’s form: the big buttons follow the choice (list-my-property is the green one), the seller note exists, and the buyer promise is hidden for a seller', async () => {
    const sell = await (await fetch(`${B}/q/${qr}?want=sell#form`)).text();
    expect(sell).toMatch(/class="btn g"[^>]*data-testid="qr-want-list"/); expect(sell).toMatch(/class="btn l"[^>]*data-testid="qr-want-home"/);
    expect(sell).toContain('value="SELL" checked'); expect(sell).toContain('data-testid="qr-seller-note"');
    expect(sell).toContain('input[name=kind][value=SELL]:checked) #promise,');
    const buy = await (await fetch(`${B}/q/${qr}?want=buy#form`)).text();
    expect(buy).toMatch(/class="btn g"[^>]*data-testid="qr-want-home"/); expect(buy).toMatch(/class="btn l"[^>]*data-testid="qr-want-list"/); expect(buy).toContain('value="BUY" checked');
    const none = await (await fetch(`${B}/q/${qr}`)).text(); expect(none).toMatch(/class="btn g"[^>]*data-testid="qr-want-home"/);
  });
  it('a seller needs no “no direct deal” promise (the server still asks it of a buyer)', async () => {
    const r = await scan('9123455601', 'SELL', { direct: '', sign: '', budget: '1.2 cr' }); expect(r.status).toBe(303); expect(r.headers.get('location')).toContain('/q/chat/');
    const buy = await scan('9123455602', 'BUY', { direct: '', sign: '' }); expect(buy.status).toBe(200);   // refused, the form comes back with the message
  });
  let first = ''; let leadId = '';
  it('first scan: a buyer', async () => {
    const r = await scan('9123455603', 'BUY', { name: 'Arvind Verma' }); first = tokOf(r); expect(first.length).toBeGreaterThan(20);
    leadId = (await leadByLast4('5603')).id;
  });
  it('the same mobile now comes to SELL: that is a separate lead with its own chat', async () => {
    const r = await scan('9123455603', 'SELL', { direct: '', sign: '', name: 'Arvind Verma', locality: 'Telibandha' });
    expect(r.status).toBe(303); const t2 = tokOf(r); expect(t2.length).toBeGreaterThan(20); expect(t2).not.toBe(first);
    const leads = (await list()).leads.filter((l: any) => l.phoneLast4 === '5603'); expect(leads.length).toBe(2); expect(leads.map((l: any) => l.kind).sort()).toEqual(['BUY', 'SELL']);
  });
  it('the same mobile scans again as a buyer with another name: no second lead, the first name stays, the broker is told the new details, the customer is told the truth', async () => {
    const before = (await list()).leads.filter((l: any) => l.phoneLast4 === '5603' && l.kind === 'BUY').length;
    const r = await scan('9123455603', 'BUY', { name: 'Krishna', locality: 'Pandri', budget: '60 lakh' });
    expect(r.status).toBe(303); expect(r.headers.get('location')).toContain('/thanks?again=1');
    const leads = (await list()).leads.filter((l: any) => l.phoneLast4 === '5603' && l.kind === 'BUY'); expect(leads.length).toBe(before);
    expect(leads.find((l: any) => l.kind === 'BUY').name).toBe('Arvind Verma');
    const h = JSON.stringify(leads[0].history); expect(h).toContain('Scanned again'); expect(h).toContain('Krishna'); expect(h).toContain('Pandri'); expect(h).toContain('60 lakh');
    const page = await (await fetch(`${B}${r.headers.get('location')}`)).text(); expect(page).toContain('data-testid="qr-again"'); expect(page).toContain('already with this broker');
    const plain = await (await fetch(`${B}/q/${qr}/thanks`)).text(); expect(plain).not.toContain('data-testid="qr-again"');
  });
  it('rescanning never hands out the first chat link (anyone can type a mobile number)', async () => {
    const one = tokOf(await scan('9123455605', 'BUY', { name: 'Meena Rao' }));
    const r = await scan('9123455605', 'BUY', { name: 'Someone Else' });
    expect(r.headers.get('location')).not.toContain('/q/chat/');
    expect(JSON.stringify(await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json())).not.toContain(one);
  });
  it('the client room’s “other rooms” link names the broker, not as if the search were his', () => {
    const src = readFileSync(path.join(ROOT, 'server/clientroom.ts'), 'utf8');
    expect(src).toContain('के साथ मेरी तलाश / My search with'); expect(src).not.toContain('मेरी तलाश / My search — ');
  });
});
