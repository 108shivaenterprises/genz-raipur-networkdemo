import { freePort } from './helpers/port';
/**
 * v99 / v99.2 — the demo OUTSIDE Raipur (Pune, Indore, Jaipur) is the SAME demo as Raipur: every kind of record Raipur has is there for each city (listings, buyer needs, deal rooms in every stage,
 * offers, mandates, client rooms, construction leads, builder projects, legal cases, shop QRs with leads, rent desk, public page, reviews, team) — only the city and its localities differ.
 * Then a full QR → bot flow in each city using ONLY the seeded accounts/listings: a shop in Pune shows Pune homes, an Indore owner gets a draft in Indore, a Jaipur renter is matched to a Jaipur rent flat.
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

const dbOf = async (): Promise<any> => {
  // the server writes its state to <cwd>/data/database.json — wait until the seeded demo cities are in it
  for (let i = 0; i < 60; i++) { try { const t = readFileSync(path.join(dir, 'data', 'database.json'), 'utf8'); if (t.includes('DEAL-JAI-') && t.includes('"shopPartners"')) return JSON.parse(t); } catch { /* not written yet */ } await sleep(300); }
  throw new Error('database.json never had the demo cities');
};
const CITIES = [['PUN', 'Pune', 'Maharashtra'], ['IND', 'Indore', 'Madhya Pradesh'], ['JAI', 'Jaipur', 'Rajasthan']] as const;

describe('Pune, Indore and Jaipur have the SAME demo as Raipur — only the city and its localities differ', { timeout: 120000 }, () => {
  it('each city has every kind of person Raipur has, all verified, and each can log in', async () => {
    for (const [code, city, state] of CITIES) {
      for (const id of [`USR-BRK-${code}`, `USR-BRK-${code}-2`, `USR-BRK-${code}-3`, `USR-BRK-${code}-4`, `USR-OWNER-${code}`, `USR-OWNER-${code}-2`, `USR-BUYER-${code}`, `USR-BUYER-${code}-3`, `USR-CONTRACTOR-${code}`, `USR-BUILDER-${code}`, `USR-LEGAL-${code}`, `USR-TEAM-${code}1`]) {
        const a = cfg.demoAccounts.find((x: any) => x.id === id); expect(a, id).toBeTruthy(); expect(a.verificationStatus, id).toBe('VERIFIED');
      }
      const me = await (await call(await login(`USR-BRK-${code}`), 'GET', '/api/auth/me')).json(); const u = me.user || me;
      expect(u.city).toBe(city); expect(u.state).toBe(state);
    }
  });
  it('record-for-record: every record type is present in every city, in the same numbers in all three — and Raipur has each of them too', async () => {
    const d = await dbOf();
    const has = (arr: any[], re: RegExp) => (arr || []).filter(x => re.test(String(x.id))).length;
    const KINDS: [string, (t: string) => RegExp][] = [
      ['properties', t => new RegExp(`^PROP-${t}-`)], ['requirements', t => new RegExp(`^REQ-${t}-`)], ['dealRooms', t => new RegExp(`^DEAL-${t}-`)], ['dealTasks', t => new RegExp(`^TSK-${t}-`)],
      ['commissionAgreements', t => new RegExp(`^AGR-DEAL-${t}-`)], ['dealMessages', t => new RegExp(`^MSG-${t}-`)], ['siteVisits', t => new RegExp(`^SV-${t}-`)], ['offers', t => new RegExp(`^OFFER-${t}-`)],
      ['ownerMandates', t => new RegExp(`^OM-${t}-`)], ['constructionLeads', t => new RegExp(`^CL-${t}-`)], ['builderProjects', t => new RegExp(`^PROJ-${t}-`)], ['inventoryUnits', t => new RegExp(`^UNIT-PROJ-${t}-`)],
      ['associateMandates', t => new RegExp(`^MAND-${t}-`)], ['crmLeads', t => new RegExp(`^CRM-L-${t}-`)], ['clientRooms', t => new RegExp(`^CRM-${t}\\d`)], ['legalRequests', t => new RegExp(`^LGL-${t}-`)], ['disputes', t => new RegExp(`^DISP-${t}-`)],
    ];
    for (const [key, re] of KINDS) {
      const raipur = has(d[key], re('DMO')); expect(raipur, `Raipur ${key}`).toBeGreaterThan(0);
      const per = CITIES.map(([code]) => has(d[key], re(code)));
      for (const n of per) expect(n, `${key} per city ${per}`).toBeGreaterThan(0);
      expect(new Set(per).size, `${key} differs between cities: ${per}`).toBe(1);
    }
  });
  it('deal rooms: every stage Raipur has is in every city; listings cover the same kinds; needs are for that city only', async () => {
    const d = await dbOf();
    const stages = (re: RegExp) => new Set(d.dealRooms.filter((x: any) => re.test(x.id)).map((x: any) => x.stage));
    const raipur = stages(/^DEAL-DMO-/);
    for (const [code] of CITIES) { const mine = stages(new RegExp(`^DEAL-${code}-`)); for (const st of raipur) expect(mine.has(st), `${code} lacks stage ${st}`).toBe(true); }
    const kinds = (re: RegExp) => new Set(d.properties.filter((x: any) => re.test(x.id)).map((x: any) => `${x.propertyType}/${x.transactionType}`));
    const rk = kinds(/^PROP-DMO-/);
    for (const [code] of CITIES) { const mk = kinds(new RegExp(`^PROP-${code}-`)); for (const k of rk) expect(mk.has(k), `${code} lacks listing kind ${k}`).toBe(true); }
    for (const [code, city, state] of CITIES) {
      for (const p of d.properties.filter((x: any) => new RegExp(`^PROP-${code}-`).test(x.id))) { expect(p.city).toBe(city); expect(p.state).toBe(state); }
      for (const q of d.requirements.filter((x: any) => new RegExp(`^REQ-${code}-`).test(x.id))) { expect(q.city).toBe(city); expect(q.state).toBe(state); }
    }
  });
  it('the broker of each city has what the Raipur broker has: 3 shop QRs (2 live) with leads, a rent desk, a public page with enquiries, reviews, an employee', async () => {
    const d = await dbOf();
    for (const id of ['USR-BRK-001', 'USR-BRK-PUN', 'USR-BRK-IND', 'USR-BRK-JAI']) {
      const shops = d.shopPartners.filter((x: any) => x.brokerId === id); expect(shops, id).toHaveLength(3);
      expect(shops.filter((x: any) => x.status === 'ACTIVE' && x.qrCode)).toHaveLength(2);
      expect(d.partnerLeads.filter((x: any) => x.brokerId === id).length, `${id} leads`).toBeGreaterThanOrEqual(6);
      expect(d.tenancies.filter((x: any) => x.brokerId === id), `${id} tenancies`).toHaveLength(3);
      const u = d.users.find((x: any) => x.id === id); expect(u.publicCard?.enabled, `${id} page`).toBe(true); expect((u.publicCard?.homes || []).length).toBeGreaterThan(0);
      expect(d.pageEnquiries.filter((x: any) => x.brokerId === id).length, `${id} enquiries`).toBeGreaterThanOrEqual(3);
      expect(d.reviews.filter((x: any) => x.targetId === id).length, `${id} reviews`).toBeGreaterThanOrEqual(3);
      expect(d.users.filter((x: any) => x.employerId === id).length, `${id} team`).toBeGreaterThanOrEqual(2);
    }
  });
  it('no Raipur / Chhattisgarh anywhere in a Pune, Indore or Jaipur record', async () => {
    const d = await dbOf(); const bad = /Raipur|Chhattisgarh|Shankar Nagar|Telibandha|Civil Lines|VIP Road|Avanti|Pandri|Amlidih|Naya Raipur|Bhilai|CGRERA|\b4920\d\d\b/i;
    const mineRe = /[-_](PUN|IND|JAI)(?![A-Z])/;
    for (const [key, arr] of Object.entries<any>(d)) {
      if (!Array.isArray(arr) || key === 'auditEvents') continue;
      for (const x of arr) {
        if (!x || typeof x !== 'object') continue;
        const owned = mineRe.test(String(x.id || '')) || ['brokerId', 'listingBrokerId', 'closingBrokerId', 'builderId'].some(f => /^USR-[A-Z]+-(PUN|IND|JAI)(-\d)?$/.test(String(x[f] || '')));
        if (owned) expect(JSON.stringify(x), `${key} ${x.id}`).not.toMatch(bad);
      }
    }
  });
  it('as the Pune broker: deal rooms in several stages, Pune buyer needs (in Pune), 3 shop QRs, listings of Pune', async () => {
    const ck = await login('USR-BRK-PUN');
    const hub = await (await call(ck, 'GET', '/api/deal-hub')).json(); const deals = hub.deals || [];
    expect(deals.length).toBeGreaterThanOrEqual(5); expect(new Set(deals.map((x: any) => x.stage)).size).toBeGreaterThanOrEqual(4);
    const reqs = await (await call(ck, 'GET', '/api/requirements')).json(); const list = reqs.requirements || reqs;
    const mine = list.filter((q: any) => String(q.id).startsWith('REQ-PUN-')); expect(mine.length).toBeGreaterThan(3); for (const q of mine) { expect(q.city).toBe('Pune'); expect(JSON.stringify(q)).not.toMatch(/Raipur|Chhattisgarh/); }
    const sp = await (await call(ck, 'GET', '/api/shop-partners')).json(); expect(sp.partners.filter((x: any) => x.status === 'ACTIVE')).toHaveLength(2); expect(sp.leads.length).toBeGreaterThanOrEqual(6);
    const props = await (await call(ck, 'GET', '/api/properties?mine=1')).json(); const mineP = (props.properties || []).filter((p: any) => String(p.id).startsWith('PROP-PUN-'));
    expect(mineP.length).toBeGreaterThanOrEqual(20); for (const p of mineP) { expect(p.city).toBe('Pune'); expect(JSON.stringify(p)).not.toMatch(/Raipur|Chhattisgarh/); }
    expect(mineP.filter((p: any) => p.listingBrokerId === 'USR-BRK-PUN').length).toBeGreaterThanOrEqual(8);
  });
  it('a Raipur broker does not see the other cities’ owner phone numbers (masked as before)', async () => {
    const ck = await login('USR-BRK-001');
    const r = await (await call(ck, 'GET', '/api/properties')).json(); const p = (r.properties || []).find((x: any) => x.id === 'PROP-PUN-001');
    if (p) expect(String(p.ownerPhone || '')).not.toMatch(/\d{5}\s?\d{5}/);
  });
});

/** the id and a budget (as the buyer would type it) of a live Pune/Jaipur home of a kind — taken from the seeded data, so the test needs no fixed ids */
const homeOf = async (code: string, type: string, tx: string) => {
  const d = await dbOf(); const p = d.properties.find((x: any) => new RegExp(`^PROP-${code}-`).test(x.id) && x.listingBrokerId === `USR-BRK-${code}` && x.propertyType === type && x.transactionType === tx && x.listingStatus === 'active' && x.verificationStatus === 'VERIFIED');
  expect(p, `a ${tx} ${type} in ${code}`).toBeTruthy(); return p as any;
};

describe('Pune: a buyer at a Pune shop is matched to seeded Pune flats — and the bot speaks of Pune, not Raipur', { timeout: 120000 }, () => {
  let s: { qr: string; ck: string };
  it('the Pune broker adds a shop; a buyer scans (a flat in a seeded locality, a budget that fits) → ✅ → Pune homes appear, only Pune homes', async () => {
    const home = await homeOf('PUN', 'Residential Flat', 'Sale'); const lakhs = Math.ceil(home.askingPrice / 100000) + 5;
    s = await shop(await login('USR-BRK-PUN'), 'Kothrud Dairy', 'Kothrud', 'Pune', '9876500191');
    const r = await scan(s, { kind: 'BUY', name: 'Isha Patwardhan', phone: '9123459811', locality: home.locality, budget: `${lakhs} lakh`, ptype: 'Residential Flat', direct: '1', sign: 'Isha Patwardhan' });
    expect(r.status).toBe(303); const tok = tokOf(r);
    await form(undefined, `/q/chat/${tok}/ans`, { a: 'YES' });
    const l = await leadOf(s.ck, '9811');
    expect(l.city).toBe('Pune'); const homes = homesOf(l); expect(homes.length).toBeGreaterThan(0); expect(homes.every((h: string) => h.startsWith('PROP-PUN-'))).toBe(true);
    expect(JSON.stringify(l.chat.msgs)).not.toContain('Raipur');
  });
  it('the shop page for Pune shows Pune homes and Pune areas only', async () => {
    const page = await (await fetch(`${B}/q/${s.qr}`)).text();
    expect(page).not.toContain('Telibandha'); expect(page).not.toContain('Shankar Nagar');
  });
});

describe('Jaipur: a renter is matched to a seeded Jaipur rent flat', { timeout: 120000 }, () => {
  it('a flat for rent in a seeded locality, a budget that fits → ✅ → Jaipur homes appear, only Jaipur homes', async () => {
    const home = await homeOf('JAI', 'Residential Flat', 'Rent');
    const s = await shop(await login('USR-BRK-JAI'), 'Mansarovar Kirana', 'Mansarovar', 'Jaipur', '9876500192');
    const r = await scan(s, { kind: 'RENT_IN', name: 'Deepika Rathore', phone: '9123459812', locality: home.locality, budget: String(Math.ceil(home.askingPrice / 1000) * 1000 + 5000), ptype: 'Residential Flat', direct: '1', sign: 'Deepika Rathore' });
    expect(r.status).toBe(303); const tok = tokOf(r);
    await form(undefined, `/q/chat/${tok}/ans`, { a: 'YES' });
    const l = await leadOf(s.ck, '9812'); expect(l.city).toBe('Jaipur'); const homes = homesOf(l); expect(homes.length).toBeGreaterThan(0); expect(homes.every((h: string) => h.startsWith('PROP-JAI-'))).toBe(true);
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
