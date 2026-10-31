import { freePort } from './helpers/port';
/**
 * v98 — the app is for every city of India, not only Raipur.
 *  (1) the pure rules: the bot reads an area in ANY city ("Whitefield mein", "in Baner", "वाकड़ में"), never invents one, and the map puts a pin in the right place
 *  (2) over real HTTP: a shop in PUNE → the lead, the client card and the buyer need all say Pune (never Raipur), a Pune home matches, an area no list holds is still read
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { findArea, readNeedChange } from '../src/shared/sahayak';
import { approxPoint, CITY_CENTRES, STATE_CENTRES, INDIA_CENTRE } from '../src/shared/geo';

describe('v98 — reading an area in any city', () => {
  const area = (t: string, c = '') => findArea(t, c);
  it('a known area of the city is found (Pune, Bengaluru, Raipur alike)', () => {
    expect(area('hinjewadi me 2bhk 40 lakh', 'Pune')).toBe('Hinjewadi');
    expect(area('Koramangala mein 3bhk', 'Bengaluru')).toBe('Koramangala');
    expect(area('Shankar Nagar mein 2bhk 15000 kiraya', 'Raipur')).toBe('Shankar Nagar');
    expect(area('Naya Raipur mein plot 20 lakh', 'Raipur')).toBe('Naya Raipur');
  });
  it('an area NO list holds is still read from the sentence — English, Hinglish and Devanagari', () => {
    expect(area('I want a 2bhk flat in Mundhwa under 80 lakh', 'Pune')).toBe('Mundhwa');
    expect(area('Katora Talab ke paas 3bhk 60 lakh', 'Raipur')).toBe('Katora Talab');
    expect(area('Gomti Nagar me 3bhk 70 lakh')).toBe('Gomti Nagar');            // even when the city is unknown
    expect(area('वाकड़ में 2bhk 40 लाख', 'Pune')).toBe('वाकड़');
    expect(area('3bhk flat in Koramangala 1.2 cr', 'Bengaluru')).toBe('Koramangala');
  });
  it('it never invents one: type, money and filler words are not places; the city itself is not an area', () => {
    expect(area('mujhe flat chahiye kiraya mein', 'Pune')).toBeUndefined();
    expect(area('in budget 50 lakh', 'Pune')).toBeUndefined();
    expect(area('budget 50 lakh')).toBeUndefined();
    expect(area('aap kaise ho', 'Pune')).toBeUndefined();
    expect(area('2bhk in Pune 50 lakh', 'Pune')).toBeUndefined();
    expect(area('looking in Raipur 2bhk', 'Raipur')).toBeUndefined();
    expect(area('2bhk in 15000 rent', 'Pune')).toBeUndefined();
  });
  it('readNeedChange passes the city through: budget, type, BHK, buy/rent and the area together', () => {
    expect(readNeedChange('2bhk Whitefield mein 25000 kiraya', 'Bengaluru')).toMatchObject({ kind: 'RENT_IN', bhk: 2, budget: '25000', ptype: 'Residential Flat', locality: 'Whitefield' });
    expect(readNeedChange('50 lakh')).toEqual({ budget: '50 lakh' });             // no city, no area → nothing made up
  });
});

describe('v98 — a map pin lands in the right place', () => {
  it('many more towns have their own centre', () => {
    for (const c of ['Mysuru', 'Agra', 'Guwahati', 'Amritsar', 'Rajkot', 'Durg', 'Thiruvananthapuram']) expect(CITY_CENTRES[c], c).toBeTruthy();
    expect(Object.keys(CITY_CENTRES).length).toBeGreaterThan(90);
  });
  it('a town we do not list falls back to its STATE, not to the middle of India', () => {
    const near = (a: { lat: number; lng: number }, b: [number, number], km = 450) => Math.hypot((a.lat - b[0]) * 111, (a.lng - b[1]) * 100) < km;
    const p = approxPoint('Kumbakonam', 'Main Road', undefined, undefined, 'Tamil Nadu');
    expect(near(p, STATE_CENTRES['tamil nadu'])).toBe(true); expect(near(p, INDIA_CENTRE, 300)).toBe(false);
    const q = approxPoint('Kumbakonam', 'Main Road');
    expect(near(q, INDIA_CENTRE, 50)).toBe(true);                                // no state either → India's middle, as before
    const r = approxPoint('Mysuru', 'Vijayanagar', undefined, undefined, 'Karnataka');
    expect(near(r, CITY_CENTRES.Mysuru, 10)).toBe(true);                        // a listed town wins over the state
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v98-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PUSH_DRY_RUN: 'true', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  jar.BRK1 = await login('USR-BRK-001');
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 500)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const cookieOf = (r: Response) => (r.headers.get('set-cookie') || '').split(';')[0];
const TERMS = { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 };
const SHOP_PHONE = '9876500098';
let partner: any; let qr = '';
const list = async () => (await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json());
async function partnerSignIn(tok: string) {
  await form(undefined, `/sp/${tok}/otp`, { phone: SHOP_PHONE });
  const code = (await list()).partners.find((x: any) => x.id === partner.id).codeForPartner;
  return cookieOf(await form(undefined, `/sp/${tok}/verify`, { code }));
}
const tokOf = (r: Response) => /\/q\/chat\/([A-Za-z0-9_-]+)/.exec(r.headers.get('location') || '')?.[1] || '';
const lead = async (last4: string) => (await list()).leads.find((l: any) => l.phoneLast4 === last4);
const say = (tok: string, text: string) => form(undefined, `/q/chat/${tok}/msg`, { text });
const bots = (l: any) => l.chat.msgs.filter((m: any) => m.by === 'BOT');

describe('v98 — a shop in Pune, end to end (the broker’s home city is Raipur)', { timeout: 90000 }, () => {
  const BUYER = '9123459801'; let tok = ''; let mine = '';
  it('setup: a live QR for a shop in Pune', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Baner Stationers', personName: 'Mahesh Patil', phone: SHOP_PHONE, area: 'Baner', city: 'Pune', terms: TERMS, consent: true });
    expect(r.status).toBe(200); const j = await r.json(); partner = j.partner; qr = j.partner.qrCode; const token = j.link.split('/sp/')[1];
    const ck = await partnerSignIn(token); expect((await form(ck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
  });
  it('setup: a Pune flat is listed BEFORE the scan', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/properties', { title: 'Sunny 2BHK in Baner', description: 'A residential flat, east facing, near the Baner road', propertyType: 'Residential Flat', transactionType: 'Sale', state: 'Maharashtra', city: 'Pune', locality: 'Baner', addressHidden: 'Lane 4, Baner', askingPrice: 7500000, ownerApprovedNetPrice: 7200000, ownerName: 'Test Owner', ownerPhone: '9123450098' });
    expect(r.status).toBe(200); const j = await r.json(); mine = j.property?.id || j.id || ''; expect(mine).toMatch(/^PROP-/);
    await sleep(300);
  });
  it('the QR page suggests areas of PUNE (not Raipur)', async () => {
    const page = await (await fetch(`${B}/q/${qr}`)).text();
    expect(page).toContain('Hinjewadi'); expect(page).not.toContain('Telibandha');
    expect(page).not.toContain('class="hm"');        // the broker's Raipur homes are not shown at a Pune shop
  });
  it('the scan → lead says Pune; ✅ → the Baner flat is shown, and the client card AND the buyer need say Pune', async () => {
    const page = await (await fetch(`${B}/q/${qr}`)).text();
    const t = /name="t" value="([^"]+)"/.exec(page)?.[1] || '';
    await sleep(2600);
    const r = await form(undefined, `/q/${qr}`, { t, kind: 'BUY', name: 'Neha Kulkarni', phone: BUYER, locality: 'baner', budget: '80 lakh', ptype: 'Flat', note: '', consent: '1', direct: '1', sign: 'Neha Kulkarni' });
    expect(r.status).toBe(303); tok = tokOf(r);
    let l = await lead('9801'); expect(l.city).toBe('Pune'); expect(l.locality).toBe('Baner');
    expect((await form(undefined, `/q/chat/${tok}/ans`, { a: 'YES' })).status).toBe(303);
    l = await lead('9801');
    expect(l.chat.msgs.filter((m: any) => m.kind === 'HOME').map((m: any) => m.homeId)).toContain(mine);
    expect(l.masked).toBe(false); expect(l.clientCardId).toBeTruthy();
    const cards = await (await call(jar.BRK1, 'GET', '/api/daily/clients')).json();
    const card = (cards.clients || []).find((c: any) => c.id === l.clientCardId);
    expect(card.city).toBe('Pune');
    const needs = (await (await call(jar.BRK1, 'GET', '/api/requirements?mine=1')).json()).requirements as any[];
    const need = needs.find(q => String(q.customerPhone).includes(BUYER));
    expect(need?.city).toBe('Pune');
  });
  it('free text in Pune: an area no list holds (“Mundhwa ke paas”) is read into the lead', async () => {
    expect((await say(tok, '2bhk Mundhwa ke paas 90 lakh chahiye')).status).toBe(303);
    const l = await lead('9801'); expect(l.locality).toBe('Mundhwa'); expect(l.budget).toBe('90 lakh');
  });
});
