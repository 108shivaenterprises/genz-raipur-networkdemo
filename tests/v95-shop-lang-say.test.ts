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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v95-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });



import { pickLang } from '../server/shopPartners';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const cookieOf = (r: Response) => (r.headers.get('set-cookie') || '').split(';')[0];
const TERMS = { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 };
const PH = '9876500066';

describe('v95 shop page language + "say it to customers" + show-QR', { timeout: 90000 }, () => {
  it('pickLang keeps Hindi, English or both and leaves tags and script alone', () => {
    const h = '<p>मंज़ूर / Accept</p><b>स्कैन</b><script>var a="x / Y"</script><p>Only English / Text</p>';
    expect(pickLang(h, 'both')).toBe(h);
    expect(pickLang(h, 'hi')).toBe('<p>मंज़ूर</p><b>स्कैन</b><script>var a="x / Y"</script><p>Only English / Text</p>');
    expect(pickLang(h, 'en')).toBe('<p>Accept</p><b>स्कैन</b><script>var a="x / Y"</script><p>Only English / Text</p>');
  });
  let tok = ''; let ck = '';
  it('setup: an active partner and the shopkeeper signed in', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Lal Kirana', personName: 'Lal', phone: PH, area: 'Raipur', city: 'Raipur', terms: TERMS, consent: true });
    expect(r.status).toBe(200); const j = await r.json(); tok = j.link.split('/sp/')[1];
    await form(undefined, `/sp/${tok}/otp`, { phone: PH });
    const code = (await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json()).partners.find((x: any) => x.id === j.partner.id).codeForPartner;
    ck = cookieOf(await form(undefined, `/sp/${tok}/verify`, { code }));
    expect((await form(ck, `/sp/${tok}/accept`, { ok: '1' })).status).toBe(303);
  });
  const get = (u: string, extra: Record<string, string> = {}) => fetch(B + u, { headers: { cookie: ck, ...extra } });
  it('the page is Hindi-only by default and has the language bar', async () => {
    const t = await (await get(`/sp/${tok}`)).text();
    expect(t).toContain('data-testid="sp-lang"'); expect(t).not.toContain('How your share is worked out'); expect(t).not.toContain('Tell customers');
    expect(t).toContain('ग्राहक से कहें');
  });
  it('?lang=en shows English and is remembered; ?lang=both shows both', async () => {
    const r = await get(`/sp/${tok}?lang=en`); const t = await r.text(); expect(t).toContain('Tell customers'); expect(t).not.toContain('सही प्रॉपर्टी वाले आपको');
    const sc = (r.headers.get('set-cookie') || '').split(';')[0]; expect(sc).toBe('sp_lang=en');
    const again = await (await get(`/sp/${tok}`, { cookie: `${ck}; ${sc}` })).text(); expect(again).toContain('Tell customers');
    const both = await (await get(`/sp/${tok}?lang=both`)).text(); expect(both).toContain('Tell customers'); expect(both).toContain('ग्राहक से कहें');
  });
  it('the “say it to customers” card links a full-screen QR and a WhatsApp message', async () => {
    const t = await (await get(`/sp/${tok}`)).text(); expect(t).toContain('data-testid="shop-show-qr"'); expect(t).toContain('data-testid="shop-wa"');
    const show = await (await get(`/sp/${tok}/show`)).text(); expect(show).toContain('data-testid="show-qr"'); expect(show).toContain('<svg');
    expect((await fetch(`${B}/sp/${tok}/show`, { redirect: 'manual' })).status).toBe(303);   // not signed in → back to the sign-in
  });
});
