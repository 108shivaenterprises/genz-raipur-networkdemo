import { freePort } from './helpers/port';
/**
 * v100 — region-wise matching, India-wide: the client gets what he asked for WHERE he asked for it.
 *  • a Pune broker's client who wants Raipur sees only Raipur homes (never Pune, never a "different city 40%" tail); a Raipur client who wants Indore sees only Indore; Indore → Jaipur
 *  • the broker who owns the Raipur home sees that Pune client's need (and the other way round), every list follows the requirement's city
 *  • the shop QR: a customer at a Pune shop may name another city (City box, or the area box, or the chat) — homes, his need and alerts follow HIS city
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v100r-')); mkdirSync(path.join(dir, 'data'));
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


const dbOf = async (): Promise<any> => {
  for (let i = 0; i < 60; i++) { try { const t = readFileSync(path.join(dir, 'data', 'database.json'), 'utf8'); if (t.includes('DEAL-JAI-') && t.includes('"shopPartners"')) return JSON.parse(t); } catch { /* not written yet */ } await sleep(300); }
  throw new Error('database.json never had the demo cities');
};
/** the server flushes its state file a moment after a write — wait until the lead is in it (and `ok` holds) */
const leadRaw = async (phone: string, ok: (l: any) => boolean = () => true): Promise<any> => {
  for (let i = 0; i < 50; i++) { try { const d = JSON.parse(readFileSync(path.join(dir, 'data', 'database.json'), 'utf8')); const l = d.partnerLeads.find((x: any) => x.phone === phone); if (l && ok(l)) return l; } catch { /* mid-write */ } await sleep(300); }
  throw new Error('lead ' + phone + ' never reached the state file');
};
const cityOfId = (id: string) => /PROP-(DMO|RAI)-/.test(id) ? 'Raipur' : /PROP-PUN-/.test(id) ? 'Pune' : /PROP-IND-/.test(id) ? 'Indore' : /PROP-JAI-/.test(id) ? 'Jaipur' : '?';
const BASE = { preferredTags: [] as string[], purpose: 'Self-use', urgency: 'Moderate (1-3 months)' };

describe('a client gets homes in the city HE wants — whoever his broker is', { timeout: 120000 }, () => {
  const cases: [string, string, string, any, string][] = [
    ['USR-BRK-PUN', 'Pune client → flat to BUY in Raipur', 'Raipur', { customerName: 'Rohan Kulkarni', customerPhone: '9822100001', budgetMin: 6000000, budgetMax: 12000000, city: 'Raipur', state: 'Chhattisgarh', preferredLocalities: ['Shankar Nagar'], propertyType: 'Residential Flat', transactionType: 'Sale' }, 'USR-BRK-005'],
    ['USR-BRK-001', 'Raipur client → flat for RENT in Indore', 'Indore', { customerName: 'Sunil Verma', customerPhone: '9826100002', budgetMin: 10000, budgetMax: 30000, city: 'Indore', state: 'Madhya Pradesh', preferredLocalities: ['Vijay Nagar'], propertyType: 'Residential Flat', transactionType: 'Rent' }, 'USR-BRK-IND'],
    ['USR-BRK-IND', 'Indore client → plot to BUY in Jaipur', 'Jaipur', { customerName: 'Mohit Jain', customerPhone: '9827100003', budgetMin: 3000000, budgetMax: 9000000, city: 'Jaipur', state: 'Rajasthan', preferredLocalities: ['Jagatpura'], propertyType: 'Residential Plot', transactionType: 'Sale' }, 'USR-BRK-JAI'],
  ];
  for (const [who, label, want, body, otherSide] of cases) {
    it(label + ' → only ' + want + ' homes, in every list, and the ' + want + ' broker sees the need', async () => {
      const ck = await login(who);
      const c = await call(ck, 'POST', '/api/requirements', { ...BASE, ...body }); expect(c.status).toBe(200);
      const j = await c.json(); const id = j.requirement.id;
      expect(j.network.top.length).toBeGreaterThan(0);
      for (const t of j.network.top) expect(cityOfId(t.id), 'create → network.top').toBe(want);
      const per = (await (await call(ck, 'GET', '/api/matching/requirement/' + id)).json()).matches;
      expect(per.length, 'per-requirement list is not empty').toBeGreaterThan(0);
      for (const m of per) expect(cityOfId(m.property.id), 'per-requirement ' + m.property.id).toBe(want);          // v100: no "different city, 40%" tail
      const mx = (await (await call(ck, 'GET', '/api/matching/matrix')).json()).matches.filter((m: any) => m.requirementId === id);
      expect(mx.length).toBeGreaterThan(0); for (const m of mx) expect(cityOfId(m.propertyId)).toBe(want);
      // the other direction: the listing's own broker sees this need in his Match Center — and a home of ANOTHER city does not list it
      const top = per[0].property.id;
      const rev = (await (await call(await login(per[0].property.listingBrokerId), 'GET', '/api/matching/property/' + top)).json()).matches;
      expect(rev.some((m: any) => m.requirement.id === id), 'the listing broker sees the cross-city need').toBe(true);
      const elsewhere = (await dbOf()).properties.find((p: any) => cityOfId(p.id) !== want && cityOfId(p.id) !== '?' && p.listingStatus === 'active');
      const rev2 = (await (await call(await login(elsewhere.listingBrokerId), 'GET', '/api/matching/property/' + elsewhere.id)).json()).matches;
      expect(rev2.some((m: any) => m.requirement.id === id), 'a home of another city never lists this need').toBe(false);
    });
  }
  it('a client with NO city is refused ("City is required") — the city is never guessed from the broker', async () => {
    const ck = await login('USR-BRK-PUN');
    const c = await call(ck, 'POST', '/api/requirements', { ...BASE, customerName: 'Neha Joshi', customerPhone: '9822100009', budgetMin: 4000000, budgetMax: 9000000, preferredLocalities: ['Kothrud'], propertyType: 'Residential Flat', transactionType: 'Sale' });
    expect(c.status).toBe(400); expect((await c.json()).error).toMatch(/city/i);
  });
  it('a Pune client who wants Pune sees only Pune homes (the home city is unchanged)', async () => {
    const ck = await login('USR-BRK-PUN');
    const c = await call(ck, 'POST', '/api/requirements', { ...BASE, customerName: 'Neha Joshi', customerPhone: '9822100009', budgetMin: 4000000, budgetMax: 9000000, city: 'Pune', state: 'Maharashtra', preferredLocalities: ['Kothrud'], propertyType: 'Residential Flat', transactionType: 'Sale' });
    expect(c.status).toBe(200); const id = (await c.json()).requirement.id;
    const per = (await (await call(ck, 'GET', '/api/matching/requirement/' + id)).json()).matches;
    expect(per.length).toBeGreaterThan(0); for (const m of per) expect(cityOfId(m.property.id)).toBe('Pune');
  });
});

describe('the shop QR: a customer at a Pune shop names another city', { timeout: 120000 }, () => {
  let s: { qr: string; ck: string };
  it('the form has a City box that starts with the shop’s city', async () => {
    s = await shop(await login('USR-BRK-PUN'), 'Aundh Stationers', 'Aundh', 'Pune', '9876500291');
    const page = await (await fetch(`${B}/q/${s.qr}`)).text();
    expect(page).toContain('name="city"'); expect(page).toMatch(/name="city"[^>]*value="Pune"/);
  });
  it('City = Raipur → the lead wants Raipur; ✅ shows ONLY Raipur homes; the buyer need is a RAIPUR need; no Pune home is shown', async () => {
    const d = await dbOf();
    const home = d.properties.find((x: any) => cityOfId(x.id) === 'Raipur' && x.publicShareOk && x.listingStatus === 'active' && x.verificationStatus === 'VERIFIED' && x.transactionType === 'Sale');
    expect(home, 'a Raipur home opened to pages').toBeTruthy();
    const lakhs = Math.ceil(home.askingPrice / 100000) + 5;
    const r = await scan(s, { kind: 'BUY', name: 'Kavita Deshmukh', phone: '9123459821', city: 'Raipur', locality: 'Raipur', budget: `${lakhs} lakh`, ptype: home.propertyType, direct: '1', sign: 'Kavita Deshmukh' });
    expect(r.status).toBe(303); const tok = tokOf(r);
    await form(undefined, `/q/chat/${tok}/ans`, { a: 'YES' });
    const l = await leadOf(s.ck, '9821');
    expect(l.city).toBe('Raipur');
    const homes = homesOf(l); expect(homes.length).toBeGreaterThan(0);
    for (const h of homes) expect(cityOfId(h), h).toBe('Raipur');
    const need = (await (await call(s.ck, 'GET', '/api/requirements')).json()).requirements.find((q: any) => String(q.customerPhone).endsWith('9123459821'));
    expect(need, 'a buyer need was made').toBeTruthy(); expect(need.city).toBe('Raipur');
    const stored = await leadRaw('9123459821', x => !!x.wantCity); expect(stored.wantCity).toBe('Raipur');
    expect(JSON.stringify(stored.history)).toContain('Wants a home in Raipur');
  });
  it('the customer writes the city in the AREA box ("Vijay Nagar Indore") → he wants Indore, the area is Vijay Nagar', async () => {
    const r = await scan(s, { kind: 'RENT_IN', name: 'Rahul Kale', phone: '9123459822', locality: 'Vijay Nagar Indore', budget: '15000', ptype: 'Residential Flat', direct: '1', sign: 'Rahul Kale' });
    expect(r.status).toBe(303);
    const stored = await leadRaw('9123459822');
    expect(stored.wantCity).toBe('Indore'); expect(stored.locality).toBe('Vijay Nagar');
  });
  it('a city that is the shop’s own city is not a "different city" (no wantCity), whatever the case', async () => {
    const r = await scan(s, { kind: 'BUY', name: 'Anil Gokhale', phone: '9123459823', city: 'pune', locality: 'Aundh', budget: '80 lakh', ptype: 'Residential Flat', direct: '1', sign: 'Anil Gokhale' });
    expect(r.status).toBe(303);
    const stored = await leadRaw('9123459823'); expect(stored.wantCity).toBeUndefined();
  });
  it('a made-up city is refused with a clear message (no lead)', async () => {
    const r = await scan(s, { kind: 'BUY', name: 'Zed Zed', phone: '9123459824', city: 'Qwertyville', locality: 'Aundh', budget: '80 lakh', direct: '1', sign: 'Zed Zed' });
    expect(r.status).toBe(200); expect(await r.text()).toContain('could not recognise that city');
  });
  it('in the chat: "Indore mein 2bhk chahiye" changes his city (and the area becomes Indore-wide), asks him to confirm again — homes of the OLD city are not shown', async () => {
    const r = await scan(s, { kind: 'BUY', name: 'Meera Phadke', phone: '9123459825', locality: 'Aundh', budget: '70 lakh', ptype: 'Residential Flat', direct: '1', sign: 'Meera Phadke' });
    const tok = tokOf(r);
    await form(undefined, `/q/chat/${tok}/ans`, { a: 'EDIT', text: 'Indore mein 2bhk chahiye 60 lakh tak' });
    const stored = await leadRaw('9123459825', x => x.wantCity === 'Indore');
    expect(stored.wantCity).toBe('Indore'); expect(stored.chat.reqConfirmedAt).toBeUndefined();
    await form(undefined, `/q/chat/${tok}/ans`, { a: 'YES' });
    const l = await leadOf(s.ck, '9825'); for (const h of homesOf(l)) expect(cityOfId(h), h).toBe('Indore');
  });
});
