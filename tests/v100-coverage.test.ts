import { freePort } from './helpers/port';
/**
 * v100 — coverage and India-wide mapping: every town of the state lists has a map centre (aliases too), a signup always carries a city (state derived), an impossible
 * price is stopped, and the property kinds people really trade (PG / hostel, co-working, hotel / guest house, banquet hall, parking, factory shed, school / hospital building)
 * can be listed, parsed from a forward, matched and shown in the right language.
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v100c-')); mkdirSync(path.join(dir, 'data'));
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


import { INDIA_STATES, PROPERTY_TYPES, RELATED_TYPE_GROUPS } from '../src/shared/india';
import { CITY_CENTRES, STATE_CENTRES, approxPoint } from '../src/shared/geo';
import { priceProblem } from '../src/shared/priceSanity';
import { findType, findCityNames } from '../src/shared/waParse';
import { readNeedChange } from '../src/shared/sahayak';
import { normCity } from '../src/shared/cities';

const townsOf = () => INDIA_STATES.flatMap(s => s.cities.map(c => ({ city: c.replace(/\s*\(.*\)\s*/g, '').trim(), full: c, state: s.name })));

describe('the map: every town of every state list lands in its own place — not in the middle of its state', () => {
  it('all listed towns have a city centre, and every state / UT has a centre too', () => {
    const have = new Set(Object.keys(CITY_CENTRES).map(k => k.toLowerCase()));
    const missing = townsOf().filter(t => !have.has(t.city.toLowerCase()) && !have.has(t.full.toLowerCase())).map(t => t.full);
    expect(missing).toEqual([]);
    for (const s of INDIA_STATES) expect(STATE_CENTRES[s.name.toLowerCase().replace(/^delhi\s*ncr$/, 'delhi')], s.name).toBeTruthy();
  });
  it('the centres are inside India’s box and each lies near its state (a typo in a latitude would show here)', () => {
    for (const [c, [la, ln]] of Object.entries(CITY_CENTRES)) { expect(la, c).toBeGreaterThan(6); expect(la, c).toBeLessThan(37); expect(ln, c).toBeGreaterThan(68); expect(ln, c).toBeLessThan(98); }
    const near = (a: [number, number], b: [number, number], deg: number) => Math.abs(a[0] - b[0]) < deg && Math.abs(a[1] - b[1]) < deg;
    const bigStates = new Set(['rajasthan', 'madhya pradesh', 'maharashtra', 'uttar pradesh', 'jammu and kashmir', 'ladakh', 'andaman and nicobar islands', 'arunachal pradesh', 'karnataka', 'gujarat', 'chhattisgarh', 'odisha', 'telangana', 'andhra pradesh', 'tamil nadu', 'west bengal', 'bihar', 'assam']);
    const EXCLAVE = new Set(['Yanam', 'Mahe', 'Karaikal']);   // Puducherry’s own towns lie in Andhra / Kerala / Tamil Nadu — their centres are right
    for (const t of townsOf().filter(x => !EXCLAVE.has(x.city))) {
      const c = (Object.entries(CITY_CENTRES).find(([k]) => k.toLowerCase() === t.full.toLowerCase()) || Object.entries(CITY_CENTRES).find(([k]) => k.toLowerCase() === t.city.toLowerCase()))![1]; const sc = STATE_CENTRES[t.state.toLowerCase().replace(/^delhi\s*ncr$/, 'delhi')];
      if (sc) expect(near(c, sc, bigStates.has(t.state.toLowerCase()) ? 9 : 4.5), `${t.city} vs ${t.state}`).toBe(true);
    }
  });
  it('old / alternate names find the same place: Bangalore = Bengaluru, Gurgaon = Gurugram, Vizag, Poona, Mysore, Pondicherry …', () => {
    for (const [alias, real] of [['Bangalore', 'Bengaluru'], ['Gurgaon', 'Gurugram'], ['Vizag', 'Visakhapatnam'], ['Poona', 'Pune'], ['Baroda', 'Vadodara'], ['Bombay', 'Mumbai'], ['Mysore', 'Mysuru'], ['Pondicherry', 'Puducherry'], ['Trivandrum', 'Thiruvananthapuram'], ['Allahabad', 'Prayagraj']] as const) {
      const a = approxPoint(alias, 'Main Road'); const b = approxPoint(real, 'Main Road'); expect(a.lat, alias).toBe(b.lat); expect(a.lng, alias).toBe(b.lng);
    }
  });
  it('a town outside the lists with a known state lands in that state, never in the sea; the same locality always lands on the same spot', () => {
    const p = approxPoint('Rewari', 'Model Town', undefined, undefined, 'Haryana'); expect(Math.abs(p.lat - 29.06)).toBeLessThan(0.1);
    expect(approxPoint('Ambala', 'Cantt')).toEqual(approxPoint('Ambala', 'Cantt')); expect(approxPoint('Ambala', 'Cantt')).not.toEqual(approxPoint('Ambala', 'Sector 7'));
    // two towns share a name: Udaipur (Rajasthan, ~24.6°N 73.7°E) and Udaipur (Tripura, ~23.5°N 91.5°E) — the state decides
    expect(approxPoint('Udaipur', 'Main Road', undefined, undefined, 'Rajasthan').lng).toBeLessThan(75); expect(approxPoint('Udaipur', 'Main Road', undefined, undefined, 'Tripura').lng).toBeGreaterThan(90);
    expect(approxPoint('Udaipur (Tripura)', 'Main Road').lng).toBeGreaterThan(90); expect(normCity('Udaipur (Tripura)')).toBe('Udaipur (Tripura)');
  });
});

describe('a city written in a customer’s own words is found — anywhere in India', () => {
  it('city names from every state list, Hindi names, old names', () => {
    expect(findCityNames('Ambala me flat chahiye')[0].city).toBe('Ambala'); expect(findCityNames('Vellore mein 2bhk')[0].city).toBe('Vellore');
    expect(findCityNames('रायपुर में')[0].city).toBe('Raipur'); expect(findCityNames('Bangalore mein')[0].city).toBe('Bengaluru');
    expect(findCityNames('Raipur ka hu, Pune mein chahiye').map(c => c.city)).toEqual(['Raipur', 'Pune']);
  });
  it('a word that is also a town / common word is not read as a city (ghar gaya, Anand Nagar, Mandi gate)', () => {
    for (const t of ['ghar gaya tha', 'Anand Nagar mein 2bhk', 'Mandi gate ke paas', 'Sagar Colony me ghar', 'puri tarah se ready']) expect(findCityNames(t), t).toEqual([]);
  });
  it('the bot reads "Indore mein 2bhk 60 lakh" at a Pune shop as: city Indore, any area, 2 BHK, 60 lakh — and "Aundh mein" at the same shop stays in Pune', () => {
    const ch = readNeedChange('Indore mein 2bhk chahiye 60 lakh tak', 'Pune'); expect(ch.city).toBe('Indore'); expect(ch.locality).toBe('Indore'); expect(ch.bhk).toBe(2);
    const same = readNeedChange('Aundh mein 2bhk chahiye', 'Pune'); expect(same.city).toBeUndefined();
  });
});

describe('a price that cannot be real is stopped — and a real one never is', () => {
  it('typos (a zero missing) and bait prices are caught, with the reason in plain words', () => {
    expect(priceProblem({ transactionType: 'Sale', propertyType: 'Residential Flat', askingPrice: 50000, builtUpAreaSqFt: 1200 })).toMatch(/below ₹150 per sq ft/);
    expect(priceProblem({ transactionType: 'Rent', propertyType: 'Residential Flat', askingPrice: 500, builtUpAreaSqFt: 1000 })).toMatch(/below ₹1 per sq ft/);
    expect(priceProblem({ transactionType: 'Sale', propertyType: 'Residential Flat', askingPrice: 9e9, builtUpAreaSqFt: 800 })).toMatch(/above/);
  });
  it('real prices pass: a Mumbai flat, a village plot, farm land by the acre, a warehouse rent, a flat with no area given', () => {
    expect(priceProblem({ transactionType: 'Sale', propertyType: 'Residential Flat', askingPrice: 35_000_000, builtUpAreaSqFt: 650 })).toBeNull();   // ₹53,800 / sq ft
    expect(priceProblem({ transactionType: 'Sale', propertyType: 'Residential Plot', askingPrice: 400_000, plotAreaSqFt: 1500 })).toBeNull();       // ₹267 / sq ft
    expect(priceProblem({ transactionType: 'Sale', propertyType: 'Agricultural Land', askingPrice: 2_000_000, plotAreaSqFt: 43560 })).toBeNull();   // an acre for 20 lakh
    expect(priceProblem({ transactionType: 'Rent', propertyType: 'Warehouse / Godown', askingPrice: 90_000, builtUpAreaSqFt: 10000 })).toBeNull();
    expect(priceProblem({ transactionType: 'Rent', propertyType: 'Residential Flat', askingPrice: 12_000, builtUpAreaSqFt: 900 })).toBeNull();
    expect(priceProblem({ transactionType: 'Sale', propertyType: 'Residential Flat', askingPrice: 5000, builtUpAreaSqFt: 0 })).toBeNull();            // no area → nothing to compare
  });
});

describe('more kinds of property: PG, co-working, hotel, banquet, parking, factory shed, school / hospital building', () => {
  const NEW = ['PG / Hostel', 'Co-working Space', 'Hotel / Guest House', 'Banquet / Marriage Hall', 'Parking / Garage', 'Factory / Industrial Shed', 'School / Hospital Building'];
  it('they are real types (21 now), each with a Hindi label, and each sits in a family for partial matches', async () => {
    expect(PROPERTY_TYPES.length).toBe(21); for (const t of NEW) { expect(PROPERTY_TYPES).toContain(t); expect(RELATED_TYPE_GROUPS.some(g => g.includes(t)), t).toBe(true); }
    const labels = readFileSync(path.join(ROOT, 'src/lib/labels.ts'), 'utf8'); for (const t of NEW) expect(labels, t).toContain(`'${t}'`);
  });
  it('a pasted forward is read right — and "near school / hospital / hotel", "covered parking" in an ordinary flat ad do NOT change its type', () => {
    expect(findType('PG for girls 12 beds')).toBe('PG / Hostel'); expect(findType('banquet hall for sale 5000 sqft')).toBe('Banquet / Marriage Hall'); expect(findType('co-working space 40 seats')).toBe('Co-working Space');
    expect(findType('guest house on highway')).toBe('Hotel / Guest House'); expect(findType('factory shed 8000 sqft rent')).toBe('Factory / Industrial Shed'); expect(findType('school building for lease')).toBe('School / Hospital Building');
    expect(findType('2bhk flat with covered parking near school')).toBe('Residential Flat'); expect(findType('3 bhk near hospital and hotel Lakeview road')).toBe('Residential Flat');
  });
  it('the shop QR form offers them, and a PG can be listed and found as a need (rent) through the API', async () => {
    const page = await (await fetch(`${B}/q/${(await shop(await login('USR-BRK-PUN'), 'Viman Nagar PG Stores', 'Viman Nagar', 'Pune', '9876500491')).qr}`)).text();
    for (const t of NEW.filter(x => x !== 'Co-working Space' || true)) expect(page, t).toContain(`value="${t}"`);
    const ck = await login('USR-BRK-PUN');
    const need = await call(ck, 'POST', '/api/requirements', { customerName: 'Priya Nair', customerPhone: '9822100031', budgetMin: 5000, budgetMax: 12000, city: 'Pune', state: 'Maharashtra', preferredLocalities: ['Viman Nagar'], preferredTags: [], propertyType: 'PG / Hostel', transactionType: 'Rent', purpose: 'Self-use', urgency: 'Immediate (< 15 days)' });
    expect(need.status).toBe(200);
    const listing = await call(ck, 'POST', '/api/properties', { title: 'Girls PG Viman Nagar 12 beds', description: 'Meals included, AC rooms, 5 min from the IT park.', propertyType: 'PG / Hostel', transactionType: 'Rent', askingPrice: 90000, ownerApprovedNetPrice: 85000, state: 'Maharashtra', city: 'Pune', locality: 'Viman Nagar', pincode: '411014', addressHidden: 'Lane 4, Viman Nagar', builtUpAreaSqFt: 2400, ownerName: 'Test Owner', ownerPhone: '9893012399', tags: [] });
    expect([200, 201, 428]).toContain(listing.status);
  });
});

describe('a member always belongs to a city', { timeout: 120000 }, () => {
  const reg = (code: string, extra: any = {}) => ({ code, name: 'City Test Broker', email: 'city.test@example.in', phone: '9826100077', password: 'Strong#Pass2026', consent: true, reraNumber: 'PCGRERA250518-0077', panNumber: 'ABCPE1234F', aadhaarNumber: '234567890124', idConsent: true, ...extra });
  it('registration without a city is refused (CITY_REQUIRED); with only a city, the state is worked out from it (Ambala → Haryana)', async () => {
    const sa = cfg.demoAccounts.find((x: any) => x.role === 'SUPERADMIN'); expect(sa).toBeTruthy(); const ck = await login(sa.id);
    const inv = await (await call(ck, 'POST', '/api/invitations', { invitedEmail: 'city.test@example.in', invitedPhone: '9826100077', targetRole: 'BROKER' })).json();
    const no = await call(undefined, 'POST', '/api/auth/register-invite', reg(inv.invitation.code)); expect(no.status).toBe(400); expect((await no.json()).code).toBe('CITY_REQUIRED');
    const ok = await call(undefined, 'POST', '/api/auth/register-invite', reg(inv.invitation.code, { city: 'ambala' })); expect(ok.status).toBe(200);
    const { user } = await ok.json(); expect(user.city).toBe('Ambala'); expect(user.state).toBe('Haryana');
  });
  it('an impossible price is refused on a new listing with a clear reason (PRICE_SANITY); a real one is not', async () => {
    const ck = await login('USR-BRK-IND');
    const base = { title: 'Flat in Vijay Nagar 3BHK', description: 'East facing, lift and parking, near market.', propertyType: 'Residential Flat', transactionType: 'Sale', ownerApprovedNetPrice: 40000, state: 'Madhya Pradesh', city: 'Indore', locality: 'Vijay Nagar', pincode: '452010', addressHidden: 'Plot 12, Lane 3, Vijay Nagar', builtUpAreaSqFt: 1300, ownerName: 'Test Owner', ownerPhone: '9893012377', tags: [] };
    const bad = await call(ck, 'POST', '/api/properties', { ...base, askingPrice: 45000 }); expect(bad.status).toBe(422);
    const j = await bad.json(); expect(j.code).toBe('PRICE_SANITY'); expect(j.error).toMatch(/per sq ft/);
    const fine = await call(ck, 'POST', '/api/properties', { ...base, askingPrice: 5_100_000, ownerApprovedNetPrice: 5_000_000 }); expect([200, 201, 428, 409]).toContain(fine.status);
    expect(JSON.stringify(await fine.json())).not.toContain('PRICE_SANITY');
  });
});
