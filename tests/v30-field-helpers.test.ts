import { freePort } from './helpers/port';
/**
 * v30 — field helpers from the role audit: a pasted forward's phone number never reaches a public description, the all-in
 * cost sheet / EMI maths, and the live demand ticker on public pages (real counts only, never a name or number).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { stripPhones, parsePaste } from '../src/shared/waParse';
import { landedCost, emi, loanPlan } from '../src/shared/costRules';

const ROOT = path.resolve(__dirname, '..');

describe('stripPhones', () => {
  it('removes mobiles in every common form, keeps the rest', () => {
    const t = '*2BHK flat for sale* Shankar Nagar 1150 sqft 45 L\nCall: 98271 23456 / +91-9876543210 / 09826112233\nWhatsApp 98261 77112';
    const out = stripPhones(t);
    expect(out).not.toMatch(/\d{5}[\s-]?\d{5}/); expect(out).not.toMatch(/9876543210|9826112233|9827123456/);
    expect(out).toContain('2BHK flat for sale'); expect(out).toContain('1150 sqft'); expect(out).toContain('45 L');
  });
  it('does not eat prices or areas that are not mobiles', () => {
    expect(stripPhones('Plot 2400 sqft rate 2100/sqft total 50,40,000 khasra 1234567')).toBe('Plot 2400 sqft rate 2100/sqft total 50,40,000 khasra 1234567');
  });
  it('the parsed phone list still has the numbers (so the broker can pick the owner’s), only the description loses them', () => {
    const [x] = parsePaste('2BHK flat for sale Shankar Nagar Raipur 45 L call 9827123456');
    expect(x.phones).toEqual(['9827123456']);
  });
});

describe('cost sheet maths', () => {
  it('duty on the higher of price and guideline value, registration cap, GST, extras, fee', () => {
    const c = landedCost({ price: 5_000_000, guidelineValue: 6_000_000, stampPct: 5, regPct: 1, regCap: 30_000, gstPct: 0, extras: 150_000, legal: 15_000, brokeragePct: 1 });
    expect(c).toMatchObject({ dutyBase: 6_000_000, stamp: 300_000, reg: 30_000, gst: 0, brokerage: 50_000, extras: 150_000, legal: 15_000, total: 5_545_000 });
    expect(c.onTopPct).toBe(10.9);
    expect(landedCost({ price: 4_000_000, stampPct: 5, regPct: 1, gstPct: 5, extras: 0, legal: 0, brokeragePct: 0 })).toMatchObject({ stamp: 200_000, reg: 40_000, gst: 200_000, total: 4_440_000 });
  });
  it('bad input never gives NaN', () => {
    const c = landedCost({ price: NaN, stampPct: -3, regPct: Infinity as any, gstPct: 0, extras: 'x' as any, legal: 0, brokeragePct: 0 });
    expect(Object.values(c).every(v => Number.isFinite(v))).toBe(true);
  });
  it('EMI is the standard reducing-balance figure; zero rate divides evenly', () => {
    expect(emi(4_000_000, 8.5, 20)).toBe(34_713);                      // ₹40 L, 8.5 %, 20 years
    expect(emi(1_200_000, 0, 10)).toBe(10_000);
    expect(emi(0, 8, 10)).toBe(0);
    const p = loanPlan(5_000_000, 20, 8.5, 20);
    expect(p.loan).toBe(4_000_000); expect(p.emi).toBe(34_713); expect(p.interest).toBe(34_713 * 240 - 4_000_000);
  });
});

const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v30-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('paste → draft description has no phone numbers', () => {
  it('listing and need drafts keep the number in the “pick a number” list, never in the description that goes public', async () => {
    const p = await j(await call(jar.BRK1, 'POST', '/api/consent/paste', { text: '*2BHK Flat for Sale* Shankar Nagar, Raipur 1150 sqft Price: 45 Lakh. Call 9827123456\n\n2BHK flat chahiye Telibandha Raipur budget 40-50 lakh, contact 9826177112' }));
    const lst = p.drafts.find((d: any) => d.kind === 'LISTING'); const need = p.drafts.find((d: any) => d.kind === 'NEED');
    expect(lst.fields.description).not.toMatch(/\d{10}/); expect(lst.fields.description).toContain('2BHK');
    expect(lst.fields.phonesFound).toEqual(['9827123456']);
    expect(need.fields.description).not.toMatch(/\d{10}/);
    expect(lst.raw).toContain('9827123456');                                  // the broker still sees his original message
  });
});

describe('public page demand ticker', () => {
  it('shows real counts once there are at least 3 buyers in the city; never a name or number', async () => {
    const all = (await j(await call(jar.ADMIN, 'GET', '/api/properties'))).properties as any[];
    const PA = all.find(p => p.listingBrokerId === 'USR-BRK-001' && p.transactionType === 'Sale' && p.listingStatus === 'active' && p.verificationStatus === 'VERIFIED');
    expect(PA).toBeTruthy();
    const city = PA.city as string; const state = PA.state as string;
    for (let i = 0; i < 3; i++) {
      const rq = await call(jar.BRK1, 'POST', '/api/requirements', { customerName: `Ticker Buyer ${i}`, customerPhone: `98${String(10000000 + i * 7 + Math.floor(Math.random() * 1e6))}`, budgetMin: 4_000_000, budgetMax: 5_000_000, state, city, preferredLocalities: ['Anywhere'], propertyType: 'Residential Flat', transactionType: 'Sale', purpose: 'Self-use', urgency: 'Moderate (1-3 months)' });
      expect(rq.status, await rq.clone().text()).toBe(200);
    }
    const pr = await call(jar.BRK1, 'POST', `/api/listings/${PA.id}/poster`, {});
    const code = (await pr.json()).code as string; expect(code).toBeTruthy();
    const page = await (await fetch(`${B}/p/${code}`, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' } })).text();
    expect(page).toContain('data-genz-demand');
    expect(page).toMatch(/\d+ buyers are looking in/);
    const ticker = page.match(/<div data-genz-demand[\s\S]*?<\/div>/)![0];
    expect(ticker).not.toContain('Ticker Buyer'); expect(ticker).not.toMatch(/\d{10}/); expect(page).not.toContain('Ticker Buyer');   // the broker's own call button is the only number on the page
  });
});

describe('printed owner consent form', () => {
  it('counts the protection days from the signing date, shows address / date / witness lines, and a fixed fee does not "follow the price"', async () => {
    const p = await j(await call(jar.BRK1, 'POST', '/api/consent/paste', { text: '*2BHK Flat for Sale* Shankar Nagar, Raipur 1150 sqft Price: 45 Lakh' }));
    const id = p.drafts[0].id as string;
    const put = await call(jar.BRK1, 'PUT', `/api/consent/drafts/${id}`, { fields: { title: '2BHK Flat', propertyType: 'Residential Flat', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: 'Shankar Nagar', askingPrice: 4_500_000, areaSqft: 1150, ownerName: 'Ram Prasad', ownerPhone: '9827112345', addressHidden: 'House 12, Lane 3', remunerationBasis: 'FIXED_FEE', fixedFeeAmount: 150000 } });
    expect(put.status, await put.clone().text()).toBe(200);
    const html = await (await call(jar.BRK1, 'GET', `/api/consent/drafts/${id}/form?days=60`)).text();
    expect(html).toContain('from the date I sign this form'); expect(html).toContain('साइन की तारीख़ से');
    expect(html).not.toContain('from today');
    expect(html).toContain('House 12, Lane 3'); expect(html).toContain('Date / तारीख़'); expect(html).toContain('Witness');
    expect(html).toContain('The fee stays the same whatever the final price is'); expect(html).not.toContain('follows the same rule');
    expect(html).toContain('60 days');
  });
});
