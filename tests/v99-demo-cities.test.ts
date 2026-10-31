import { freePort } from './helpers/port';
/**
 * v99 — demo accounts OUTSIDE Raipur (Pune, Indore, Jaipur) and a full QR → bot flow in each, using ONLY the seeded demo accounts/listings.
 * Proves the app is not "Raipur only": a shop in Pune shows Pune homes, an Indore owner gets a draft in Indore, a Jaipur renter is matched to a Jaipur rent flat.
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v99c-')); mkdirSync(path.join(dir, 'data'));
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

describe('the demo has brokers, owners, buyers and listings in Pune, Indore and Jaipur', { timeout: 120000 }, () => {
  const CITIES = [['PUN', 'Pune', 'Maharashtra'], ['IND', 'Indore', 'Madhya Pradesh'], ['JAI', 'Jaipur', 'Rajasthan']] as const;
  it('each city: a verified broker, an owner, a buyer who can log in', async () => {
    for (const [code, city, state] of CITIES) {
      for (const role of ['BRK', 'OWNER', 'BUYER']) {
        const a = cfg.demoAccounts.find((x: any) => x.id === `USR-${role}-${code}`); expect(a, `${role}-${code}`).toBeTruthy(); expect(a.verificationStatus).toBe('VERIFIED');
      }
      const ck = await login(`USR-BRK-${code}`);
      const me = await (await call(ck, 'GET', '/api/auth/me')).json(); const u = me.user || me;
      expect(u.city).toBe(city); expect(u.state).toBe(state);
    }
  });
  it('each city: 5 live listings in that city only (sale flats, a rent flat, a shop on rent, a plot) with real localities', async () => {
    for (const [code, city, state] of CITIES) {
      const ck = await login(`USR-BRK-${code}`);
      const r = await (await call(ck, 'GET', '/api/properties?mine=1')).json(); const mine = (r.properties || []).filter((p: any) => String(p.id).startsWith(`PROP-${code}-`));
      expect(mine.length, city).toBe(5);
      for (const p of mine) { expect(p.city).toBe(city); expect(p.state).toBe(state); expect(p.listingStatus).toBe('active'); expect(p.askingPrice).toBeGreaterThan(0); expect(JSON.stringify(p)).not.toMatch(/Raipur|Chhattisgarh/); }
      expect(new Set(mine.map((p: any) => p.propertyType))).toEqual(new Set(['Residential Flat', 'Commercial Shop', 'Residential Plot']));
      expect(mine.filter((p: any) => p.transactionType === 'Rent')).toHaveLength(2);
    }
  });
  it('a Raipur broker does not see the other cities’ owner phone numbers (masked as before)', async () => {
    const ck = await login('USR-BRK-001');
    const r = await (await call(ck, 'GET', '/api/properties')).json(); const p = (r.properties || []).find((x: any) => x.id === 'PROP-PUN-001');
    if (p) expect(String(p.ownerPhone || '')).not.toMatch(/\d{5}\s?\d{5}/);
  });
});

describe('Pune: a buyer at a Pune shop is matched to the seeded Pune flat — and the bot speaks of Pune, not Raipur', { timeout: 120000 }, () => {
  let s: { qr: string; ck: string };
  it('the Pune broker adds a shop in Kothrud; a buyer scans (2 BHK flat, 60 lakh) → ✅ → the seeded Kothrud 2 BHK appears', async () => {
    s = await shop(await login('USR-BRK-PUN'), 'Kothrud Dairy', 'Kothrud', 'Pune', '9876500191');
    const r = await scan(s, { kind: 'BUY', name: 'Isha Patwardhan', phone: '9123459811', locality: 'Kothrud', budget: '60 lakh', ptype: 'Residential Flat', direct: '1', sign: 'Isha Patwardhan' });
    expect(r.status).toBe(303); const tok = tokOf(r);
    await form(undefined, `/q/chat/${tok}/ans`, { a: 'YES' });
    const l = await leadOf(s.ck, '9811');
    expect(l.city).toBe('Pune'); expect(homesOf(l)).toContain('PROP-PUN-002');
    expect(JSON.stringify(l.chat.msgs)).not.toContain('Raipur');
  });
  it('the shop page for Pune shows Pune homes and Pune areas only', async () => {
    const page = await (await fetch(`${B}/q/${s.qr}`)).text();
    expect(page).not.toContain('Telibandha'); expect(page).not.toContain('Shankar Nagar');
  });
});

describe('Jaipur: a renter is matched to the seeded Jaipur rent flat', { timeout: 120000 }, () => {
  it('a 2 BHK for rent, 25000 a month, Mansarovar → ✅ → PROP-JAI-003', async () => {
    const s = await shop(await login('USR-BRK-JAI'), 'Mansarovar Kirana', 'Mansarovar', 'Jaipur', '9876500192');
    const r = await scan(s, { kind: 'RENT_IN', name: 'Deepika Rathore', phone: '9123459812', locality: 'Mansarovar', budget: '25000', ptype: 'Residential Flat', direct: '1', sign: 'Deepika Rathore' });
    expect(r.status).toBe(303); const tok = tokOf(r);
    await form(undefined, `/q/chat/${tok}/ans`, { a: 'YES' });
    const l = await leadOf(s.ck, '9812'); expect(l.city).toBe('Jaipur'); expect(homesOf(l)).toContain('PROP-JAI-003');
  });
});

describe('Indore: an owner at an Indore shop is asked the listing questions and the draft lands with the Indore broker', { timeout: 120000 }, () => {
  it('SELL → ✅ → questions → a draft in Indore (Madhya Pradesh), no Raipur anywhere', async () => {
    const s = await shop(await login('USR-BRK-IND'), 'Vijay Nagar Tea', 'Vijay Nagar', 'Indore', '9876500193');
    const r = await scan(s, { kind: 'SELL', name: 'Sanjay Pathak', phone: '9123459813', locality: 'Vijay Nagar', budget: '95 lakh', ptype: 'Residential Flat' });
    const tok = tokOf(r); await form(undefined, `/q/chat/${tok}/ans`, { a: 'YES' });
    const tap = (k: string) => form(undefined, `/q/chat/${tok}/quick`, { k });
    await tap('ASK:bhk:3'); await form(undefined, `/q/chat/${tok}/msg`, { text: '1500 sq ft' }); await tap('ASK:floor:1-2'); await tap('ASK:price:KEEP');
    await tap('ASK:avail:M1'); await form(undefined, `/q/chat/${tok}/msg`, { text: 'Sai Kunj, Lane 2, Vijay Nagar' }); await tap('ASK:papers:LOAN');
    const l = await leadOf(s.ck, '9813'); expect(l.bot.interview.finished).toBe(true);
    const d = (await (await call(s.ck, 'GET', '/api/consent/drafts')).json()).drafts.find((x: any) => x.id === l.bot.interview.draftId);
    expect(d.fields).toMatchObject({ city: 'Indore', state: 'Madhya Pradesh', locality: 'Vijay Nagar', bhk: 3, areaSqft: 1500, askingPrice: 9500000, papers: 'LOAN', transactionType: 'Sale' });
    expect(d.missing).toEqual([]); expect(JSON.stringify(d)).not.toMatch(/Raipur|Chhattisgarh/);
  });
});
