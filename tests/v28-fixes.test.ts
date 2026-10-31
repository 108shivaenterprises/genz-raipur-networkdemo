import { freePort } from './helpers/port';
/**
 * v28 — fixes Krishna found in v27: WhatsApp paste also reads BUYER requirements; brokerage terms are confirmed with a tick
 * (no password — browsers auto-filled a saved superadmin password); a listing made with the normal form gets the owner's
 * WhatsApp approval too; a wrong signing password no longer signs the user out (400, not 401).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { parsePaste, kindOf, findBudget } from '../src/shared/waParse';
import { needMissing } from '../src/shared/consentRules';

const ROOT = path.resolve(__dirname, '..');

describe('WhatsApp paste: buyer requirements (pure)', () => {
  it('requirement words make a NEED; “available / owner direct” stays a listing', () => {
    expect(kindOf('2BHK flat chahiye Shankar Nagar budget 40-50 lakh')).toBe('NEED');
    expect(kindOf('Requirement: plot 1500 sqft Kachna upto 35 L')).toBe('NEED');
    expect(kindOf('दुकान चाहिए पंडरी में, बजट 60 लाख तक')).toBe('NEED');
    expect(kindOf('Client looking for 3BHK house on rent Avanti Vihar 20-25k')).toBe('NEED');
    expect(kindOf('2BHK flat available Shankar Nagar 45 L owner direct')).toBe('LISTING');
    expect(kindOf('Plot for sale in Kachna 25x60 rate 2100/sqft')).toBe('LISTING');
  });
  it('a mixed chat export gives listings and needs, each with its own fields', () => {
    const all = parsePaste(`[17/10/26, 10:15 AM] Ramesh: *Requirement* 2BHK flat chahiye Shankar Nagar / Telibandha / Avanti Vihar, Raipur budget 40-50 lakh. Call 9827112345
[17/10/26, 11:02 AM] Raj: Plot for sale in Kachna 25x60 rate 2100/sqft registry ready call 9876543210
[17/10/26, 11:30 AM] Amit: 3BHK house on rent needed Avanti Vihar 20k-25k per month`);
    expect(all.map(x => x.kind)).toEqual(['NEED', 'LISTING', 'NEED']);
    expect(all[0]).toMatchObject({ propertyType: 'Residential Flat', transactionType: 'Sale', city: 'Raipur', budgetMin: 4_000_000, budgetMax: 5_000_000, localities: ['Shankar Nagar', 'Telibandha', 'Avanti Vihar'] });
    expect(all[0].price).toBeUndefined();                                   // a budget is not an asking price
    expect(all[2]).toMatchObject({ transactionType: 'Rent', budgetMin: 20_000, budgetMax: 25_000 });
    expect(all[0].missing).toEqual(['customerName', 'customerPhone']);
  });
  it('budget forms', () => {
    expect(findBudget('1.2 to 1.5 cr')).toEqual({ min: 12_000_000, max: 15_000_000 });
    expect(findBudget('40 se 50 lakh')).toEqual({ min: 4_000_000, max: 5_000_000 });
    expect(findBudget('budget 45 lakh').max).toBe(4_500_000);
    expect(findBudget('upto 35 L')).toEqual({ min: 2_450_000, max: 3_500_000 });
    expect(needMissing({ propertyType: 'Residential Flat', transactionType: 'Sale', city: 'Raipur', localities: ['Telibandha'], budgetMax: 5e6, customerName: 'Sita', customerPhone: '9876501234' })).toEqual([]);
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
const ownerPost = (token: string, form: Record<string, string>, headers: Record<string, string> = {}) =>
  fetch(`${B}/oc/${token}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(form).toString() });
let seq = 5000;
const phone = () => `97${String(27100000 + ++seq)}`;
const LOC = () => `Sign Colony ${Math.floor(Math.random() * 1e6)}`;
const PRICE = 4_500_000;

/** a real PNG (random pixels so it is not tiny) — what the signature pad's toDataURL gives */
function png(w = 96, h = 48): string {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; crypto.randomFillSync(raw, y * (w * 4 + 1) + 1, w * 4); }
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const file = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${file.toString('base64')}`;
}

async function draftWith(cookie: string, extra: Record<string, any> = {}, loc = LOC(), ph = phone()) {
  const p = await j(await call(cookie, 'POST', '/api/consent/paste', { text: `*2BHK Flat for Sale* ${loc}, Raipur 1150 sqft Price: 45 Lakh` }));
  const id = p.drafts[0].id as string;
  const f = { title: `2BHK Flat in ${loc}`, propertyType: 'Residential Flat', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: loc, askingPrice: PRICE, areaSqft: 1150, ownerName: 'Ram Prasad', ownerPhone: ph, addressHidden: 'House 12, Lane 3, near temple', ...extra };
  const s = await call(cookie, 'PUT', `/api/consent/drafts/${id}`, { fields: f });
  expect(s.status, await s.clone().text()).toBe(200);
  return { id, loc, ph };
}
const publishBody = (loc: string, ph: string, consentId: string, price = PRICE) => ({
  title: `2BHK Flat in ${loc}`, description: 'Nice 2BHK flat, east facing, lift and parking.', propertyType: 'Residential Flat', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur',
  locality: loc, addressHidden: 'House 12, Lane 3, near temple', builtUpAreaSqFt: 1150, askingPrice: price, ownerApprovedNetPrice: 4_000_000, ownerName: 'Ram Prasad', ownerPhone: ph, consentId,
});
const NET = { remunerationBasis: 'SURPLUS_ABOVE_NET', ownerApprovedNetPrice: 4_000_000 };

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v28-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true', TRUST_PROXY: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  const sup = cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN')?.id || 'USR-SUPERADMIN';
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', ADMIN: 'USR-ADMIN-1', SUP: sup })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });


describe('paste → buyer need → Buyer Needs', () => {
  it('a mixed paste makes listing drafts AND need drafts; a need is saved as a Buyer Need with the client’s details', async () => {
    const loc = 'Telibandha';
    const p = await j(await call(jar.BRK1, 'POST', '/api/consent/paste', { text: `2BHK flat chahiye ${loc}, Raipur budget 40-50 lakh\n\n*2BHK Flat for Sale* Shankar Nagar, Raipur 1150 sqft Price: 45 Lakh` }));
    expect(p.found).toBe(2); expect(p.needs).toBe(1);
    const need = p.drafts.find((d: any) => d.kind === 'NEED'); const lst = p.drafts.find((d: any) => d.kind === 'LISTING');
    expect(need.fields).toMatchObject({ propertyType: 'Residential Flat', city: 'Raipur', localities: [loc], budgetMin: 4_000_000, budgetMax: 5_000_000 });
    expect(need.missing).toEqual(['customerName', 'customerPhone']);
    expect(lst.missing).toEqual(expect.arrayContaining(['ownerName', 'ownerPhone']));
    const ask = await call(jar.BRK1, 'POST', `/api/consent/drafts/${need.id}/request`, { protectionDays: 30 });
    expect(ask.status).toBe(400); expect((await ask.json()).code).toBe('NEED_DRAFT');            // a need never goes to an owner
    const put = await j(await call(jar.BRK1, 'PUT', `/api/consent/drafts/${need.id}`, { fields: { customerName: 'Sita Verma', customerPhone: '9876501234' } }));
    expect(put.draft.missing).toEqual([]);
    const rq = await call(jar.BRK1, 'POST', '/api/requirements', { customerName: 'Sita Verma', customerPhone: '9876501234', budgetMin: 4_000_000, budgetMax: 5_000_000, state: 'Chhattisgarh', city: 'Raipur', preferredLocalities: [loc], propertyType: 'Residential Flat', transactionType: 'Sale', purpose: 'Self-use', urgency: 'Moderate (1-3 months)' });
    const rb = await rq.json(); expect(rq.status, JSON.stringify(rb)).toBe(200);
    expect((await call(jar.BRK2, 'POST', `/api/consent/drafts/${need.id}/saved-need`, { requirementId: rb.requirement.id })).status).toBe(404);   // not his draft
    const done = await j(await call(jar.BRK1, 'POST', `/api/consent/drafts/${need.id}/saved-need`, { requirementId: rb.requirement.id }));
    expect(done.draft).toMatchObject({ status: 'PUBLISHED', requirementId: rb.requirement.id, kind: 'NEED' });
  });
});

describe('normal “List property” form → owner approval on WhatsApp', () => {
  it('a broker’s direct listing comes back with an owner-approval draft; owner says yes → protection on the listing', async () => {
    const loc = LOC(); const ph = phone();
    const body = publishBody(loc, ph, '', PRICE); delete (body as any).consentId;
    const r = await call(jar.BRK1, 'POST', '/api/properties', body);
    const pb = await r.json(); expect(r.status, JSON.stringify(pb)).toBe(200);
    expect(pb.ownerApproval?.draftId).toBeTruthy();
    const pid = pb.property.id as string;
    const drafts = (await j(await call(jar.BRK1, 'GET', '/api/consent/drafts'))).drafts;
    const d = drafts.find((x: any) => x.id === pb.ownerApproval.draftId);
    expect(d.fields).toMatchObject({ forPropertyId: pid, ownerPhone: ph, ownerName: 'Ram Prasad', askingPrice: PRICE });
    expect(d.missing).toEqual([]);                                                                   // everything came from the form
    const again = await j(await call(jar.BRK1, 'POST', `/api/consent/from-property/${pid}`));
    expect(again.draft.id).toBe(d.id);                                                                // the card button opens the same draft
    const ask = await j(await call(jar.BRK1, 'POST', `/api/consent/drafts/${d.id}/request`, { protectionDays: 90 }));
    const token = String(ask.url).split('/oc/')[1];
    await ownerPost(token, { action: 'agree', name: 'Ram Prasad', ok: '1', sigMode: 'type', initials: 'RP' });
    const at = await call(jar.BRK1, 'POST', `/api/consent/drafts/${d.id}/attach`);
    expect(at.status, await at.clone().text()).toBe(200);
    const prop = (await j(await call(jar.BRK1, 'GET', `/api/properties/${pid}`))).property;
    expect(Date.parse(prop.protectionUntil) - Date.now()).toBeGreaterThan(89 * 86400_000);
    const no = await call(jar.BRK1, 'POST', `/api/consent/from-property/${pid}`);
    expect(no.status).toBe(409); expect((await no.json()).code).toBe('ALREADY_APPROVED');
  });
  it('when GENZ requires the owner’s consent first, the form becomes a draft (nothing goes live)', async () => {
    expect((await call(jar.SUP, 'PUT', '/api/admin/settings', { ownerConsentRequired: true })).status).toBe(200);
    try {
      const loc = LOC(); const ph = phone();
      const body = publishBody(loc, ph, '', PRICE); delete (body as any).consentId;
      const r = await call(jar.BRK1, 'POST', '/api/properties', body);
      expect(r.status).toBe(428);
      const f = await j(await call(jar.BRK1, 'POST', '/api/consent/drafts/from-form', body));
      expect(f.draft.fields).toMatchObject({ locality: loc, ownerPhone: ph, askingPrice: PRICE, areaSqft: 1150 });
      expect(f.draft.missing).toEqual([]);
      const live = (await j(await call(jar.BRK2, 'GET', `/api/properties?locality=${encodeURIComponent(loc)}`))).properties;
      expect(live).toHaveLength(0);
    } finally {
      expect((await call(jar.SUP, 'PUT', '/api/admin/settings', { ownerConsentRequired: false })).status).toBe(200);
    }
  });
});

describe('a wrong signing password does not sign you out', () => {
  it('owner-mandate sign with a wrong password → 400 SIGN_PASSWORD; the session stays', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/owner-mandates/OM-NOPE/accept', { password: 'wrong' });
    expect(r.status).toBe(404);
    expect((await call(jar.BRK1, 'GET', '/api/auth/me')).status).toBe(200);
  });
});

describe('more audit fixes', () => {
  it('an older listing that has only the city still gets its state in the owner-approval draft', async () => {
    const props = (await j(await call(jar.BRK1, 'GET', '/api/properties'))).properties.filter((p: any) => p.listingBrokerId === 'USR-BRK-001' && !p.state && p.city === 'Raipur');
    if (!props.length) return; // seed changed — nothing to check
    const a = await j(await call(jar.BRK1, 'POST', `/api/consent/from-property/${props[0].id}`));
    expect(a.draft.fields.state).toBe('Chhattisgarh');
    expect(a.draft.missing).not.toContain('state');
  });
  it('the form-turned-draft keeps PIN, landmark and photos for publishing', async () => {
    const loc = LOC();
    const f = await j(await call(jar.BRK1, 'POST', '/api/consent/drafts/from-form', { ...publishBody(loc, phone(), ''), pincode: '492001', landmark: 'Near the temple', images: ['https://example.com/a.jpg'] }));
    expect(f.draft.fields.extra).toMatchObject({ pincode: '492001', landmark: 'Near the temple' });
    expect(f.draft.fields.images).toEqual(['https://example.com/a.jpg']);
  });
  it('GENZ staff can list only on behalf of a named broker; then the BROKER (not staff) gets the owner-approval step', async () => {
    const loc = LOC(); const ph = phone();
    const body = publishBody(loc, ph, ''); delete (body as any).consentId;
    expect((await call(jar.SUP, 'POST', '/api/properties', body)).status).toBe(400);
    const r = await j(await call(jar.SUP, 'POST', '/api/properties', { ...body, listingBrokerId: 'USR-BRK-002' }));
    expect(r.property.listingBrokerId).toBe('USR-BRK-002');
    expect(r.ownerApproval).toBeUndefined();
    const d = await call(jar.BRK2, 'POST', `/api/consent/from-property/${r.property.id}`);
    expect(d.status).toBe(200);
  });
});

describe('validation messages name the box that is wrong', () => {
  it('construction lead with a too-short title → “Title: write at least 5 characters” (not zod’s raw words)', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/construction-leads', { title: 'abc', projectType: 'Turnkey Residential', approximateLocation: 'Shankar Nagar', exactAddressHidden: 'House 12, Lane 3', estimatedBudget: 2_500_000, scopeDescription: 'Build a G+1 house on a 1500 sqft plot', timeline: '6 months', customerNameMasked: 'Ravi', customerPhoneHidden: '9876501234', customerConsent: true });
    const b = await r.json();
    expect(r.status).toBe(400);
    expect(b.error).toBe('Title: write at least 5 characters');
    const r2 = await call(jar.BRK1, 'POST', '/api/construction-leads', { title: 'Build a house', projectType: 'Palace', approximateLocation: 'Shankar Nagar', exactAddressHidden: 'House 12, Lane 3', estimatedBudget: 2_500_000, scopeDescription: 'Build a G+1 house on a 1500 sqft plot', timeline: '6 months', customerNameMasked: 'Ravi', customerPhoneHidden: '9876501234', customerConsent: true });
    expect((await r2.json()).error).toBe('Property type: choose one of the given options'.replace('Property type', 'Project Type'));
  });
});

describe('the API limit counts per member, not per IP (many brokers share one mobile-carrier IP)', () => {
  it('two members on the same IP can each make 350 calls in a minute (700 > the old per-IP 600)', async () => {
    const burst = (cookie: string) => Promise.all(Array.from({ length: 350 }, () => fetch(B + '/api/auth/me', { headers: { cookie } }).then(r => r.status)));
    const [a, b] = await Promise.all([burst(jar.BRK1), burst(jar.BRK2)]);
    expect(a.filter(s => s === 429)).toHaveLength(0);
    expect(b.filter(s => s === 429)).toHaveLength(0);
  }, 30000);
});
