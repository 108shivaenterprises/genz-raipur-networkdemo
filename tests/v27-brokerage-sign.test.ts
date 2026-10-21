/**
 * v27 — brokerage terms at listing time + the owner's signature (typed initials or drawn) on the consent link;
 * the mandate becomes ACTIVE the moment the listing is live; an existing listing can get its owner signature too.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { canSeeClosedProperty } from '../server/access';
import { termsOf, remunerationAt, validInitials, termsWords } from '../src/shared/consentRules';

const ROOT = path.resolve(__dirname, '..');

describe('brokerage terms (pure)', () => {
  const base = { askingPrice: 4_500_000 };
  it('no basis = no terms; each basis is checked against the price', () => {
    expect(termsOf({ ...base })).toEqual({ terms: null });
    expect(termsOf({ ...base, remunerationBasis: 'SURPLUS_ABOVE_NET', ownerApprovedNetPrice: 4_000_000 }).terms).toMatchObject({ basis: 'SURPLUS_ABOVE_NET', net: 4_000_000, pct: 0, fee: 0 });
    expect(termsOf({ ...base, remunerationBasis: 'SURPLUS_ABOVE_NET', ownerApprovedNetPrice: 4_500_000 }).problem).toBeTruthy();   // net must be below the price
    expect(termsOf({ ...base, remunerationBasis: 'PERCENTAGE', agreedCommissionPct: 15 }).problem?.hi).toMatch(/कमीशन/);
    expect(termsOf({ ...base, remunerationBasis: 'PERCENTAGE', agreedCommissionPct: 2 }).terms).toMatchObject({ pct: 2, net: 0 });
    expect(termsOf({ ...base, remunerationBasis: 'FIXED_FEE', fixedFeeAmount: 4_500_000 }).problem).toBeTruthy();
    expect(termsOf({ ...base, remunerationBasis: 'FIXED_FEE', fixedFeeAmount: 90_000 }).terms).toMatchObject({ fee: 90_000 });
  });
  it('broker / owner split at the asking price', () => {
    expect(remunerationAt({ basis: 'SURPLUS_ABOVE_NET', advertised: 4_500_000, net: 4_000_000, pct: 0, fee: 0 })).toEqual({ broker: 500_000, owner: 4_000_000 });
    expect(remunerationAt({ basis: 'PERCENTAGE', advertised: 4_500_000, net: 0, pct: 2, fee: 0 })).toEqual({ broker: 90_000, owner: 4_410_000 });
    expect(remunerationAt({ basis: 'FIXED_FEE', advertised: 4_500_000, net: 0, pct: 0, fee: 50_000 })).toEqual({ broker: 50_000, owner: 4_450_000 });
  });
  it('the owner’s words carry the brokerage, hi + en, and say GENZ takes nothing', () => {
    const w = termsWords({ basis: 'PERCENTAGE', advertised: 4_500_000, net: 0, pct: 2, fee: 0 });
    expect(w.en).toMatch(/2% of the final price/); expect(w.hi).toMatch(/कमीशन 2%/); expect(w.en).toMatch(/GENZ takes no part/);
  });
  it('initials: 2–8 letters in any script; no digits or symbols', () => {
    expect(validInitials(' RP ')).toBe('RP'); expect(validInitials('आर पी')).toBe('आर पी'); expect(validInitials('R.P.')).toBe('R.P.');
    expect(validInitials('R')).toBeNull(); expect(validInitials('12')).toBeNull(); expect(validInitials('<b>')).toBeNull(); expect(validInitials('ABCDEFGHI')).toBeNull();
  });
});

const PORT = 6100 + Math.floor(Math.random() * 90);
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v27-'));
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

describe('brokerage at listing time → owner signs with typed initials → mandate ACTIVE on publish', () => {
  let d: Awaited<ReturnType<typeof draftWith>>; let token = ''; let consentId = ''; let propertyId = '';
  it('the broker confirms the terms with a tick (v28: no password — browsers auto-filled a saved superadmin password)', async () => {
    d = await draftWith(jar.BRK1, NET);
    const none = await call(jar.BRK1, 'POST', `/api/consent/drafts/${d.id}/request`, { protectionDays: 60 });
    expect(none.status).toBe(400); const nb = await none.json(); expect(nb.code).toBe('TERMS_NOT_AGREED'); expect(nb.hi).toMatch(/टिक/);
    const ok = await call(jar.BRK1, 'POST', `/api/consent/drafts/${d.id}/request`, { protectionDays: 60, agreeTerms: true });
    const b = await ok.json(); expect(ok.status, JSON.stringify(b)).toBe(200);
    token = String(b.url).split('/oc/')[1]; consentId = b.draft.consent.id;
    expect(b.draft.consent.terms).toMatchObject({ basis: 'SURPLUS_ABOVE_NET', advertised: PRICE, net: 4_000_000 });
  });
  it('an invalid brokerage (commission over 10 %) stops before the owner is asked', async () => {
    const x = await draftWith(jar.BRK1, { remunerationBasis: 'PERCENTAGE', agreedCommissionPct: 15 });
    const r = await call(jar.BRK1, 'POST', `/api/consent/drafts/${x.id}/request`, { protectionDays: 30, agreeTerms: true });
    expect(r.status).toBe(400); expect((await r.json()).code).toBe('TERMS_INVALID');
  });
  it('the owner page shows the brokerage and offers both ways to sign; the pad script is our own file', async () => {
    const page = await (await fetch(`${B}/oc/${token}`)).text();
    expect(page).toContain('ब्रोकरेज / Brokerage'); expect(page).toContain('₹40 L');            // net amount the owner receives
    expect(page).toMatch(/Type initials/); expect(page).toMatch(/Draw signature/); expect(page).toContain('<canvas id="sigpad"');
    expect(page).toContain('<script src="/oc/sign.js"'); expect(page).not.toMatch(/<script>[^<]/);   // no inline script (the CSP forbids it)
    const js = await fetch(`${B}/oc/sign.js`); expect(js.status).toBe(200); expect(js.headers.get('content-type')).toMatch(/javascript/);
    expect(await js.text()).toContain('toDataURL');
  });
  it('a yes without a signature is not accepted; the owner is told to sign', async () => {
    const r = await ownerPost(token, { action: 'agree', name: 'Ram Prasad', ok: '1', sigMode: 'type', initials: '' });
    expect(await r.text()).toMatch(/नाम के अक्षर|Type your initials/);
    const r2 = await ownerPost(token, { action: 'agree', name: 'Ram Prasad', ok: '1', sigMode: 'type', initials: 'R1' });
    expect(await r2.text()).toMatch(/Type your initials/);
    const dd = (await j(await call(jar.BRK1, 'GET', '/api/consent/drafts'))).drafts.find((x: any) => x.id === d.id);
    expect(dd.consent.status).toBe('PENDING');
  });
  it('the price / brokerage cannot be changed after the owner was asked', async () => {
    const r = await call(jar.BRK1, 'PUT', `/api/consent/drafts/${d.id}`, { fields: { askingPrice: PRICE + 100_000 } });
    expect(r.status).toBe(409); expect((await r.json()).code).toBe('CONSENT_LOCKED');
    expect((await call(jar.BRK1, 'PUT', `/api/consent/drafts/${d.id}`, { fields: { remunerationBasis: 'FIXED_FEE', fixedFeeAmount: 1000 } })).status).toBe(409);
  });
  it('typed initials + the owner’s yes → accepted; signature recorded; publish at another price is refused', async () => {
    const r = await ownerPost(token, { action: 'agree', name: 'Ram Prasad', ok: '1', sigMode: 'type', initials: 'RP' });
    expect(await r.text()).toMatch(/हस्ताक्षर दर्ज[^<]*<b>RP<\/b>/);
    const dd = (await j(await call(jar.BRK1, 'GET', '/api/consent/drafts'))).drafts.find((x: any) => x.id === d.id);
    expect(dd.consent).toMatchObject({ status: 'ACCEPTED', signature: { initials: 'RP', drawn: false } });
    const bad = await call(jar.BRK1, 'POST', '/api/properties', publishBody(d.loc, d.ph, consentId, PRICE + 5000));
    expect(bad.status).toBe(409); expect((await bad.json()).code).toBe('CONSENT_MISMATCH');
  });
  it('publish → the mandate is ACTIVE at once (owner not a GENZ user), seal + signature on it, deal rooms unlocked', async () => {
    const p = await call(jar.BRK1, 'POST', '/api/properties', publishBody(d.loc, d.ph, consentId));
    const pb = await p.json(); expect(p.status, JSON.stringify(pb)).toBe(200);
    propertyId = pb.property.id;
    const ms = (await j(await call(jar.BRK1, 'GET', `/api/owner-mandates?propertyId=${propertyId}`))).mandates;
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ status: 'ACTIVE', isConfirmed: true, remunerationBasis: 'SURPLUS_ABOVE_NET', approvedNetPrice: 4_000_000, protectionPeriodDays: 60, ownerName: 'Ram Prasad', consentId, brokerRemunerationAtAsking: 500_000, ownerReceivesAtAsking: 4_000_000 });
    expect(ms[0].ownerSignature).toMatchObject({ initials: 'RP', drawn: false });
    expect(ms[0].agreementHash).toMatch(/^[0-9a-f]{64}$/);
    // the owner of another broker's listing sees nothing of it
    expect((await j(await call(jar.BRK2, 'GET', `/api/owner-mandates?propertyId=${propertyId}`))).mandates).toHaveLength(0);
  });
});

describe('the owner draws his signature', () => {
  it('a drawn PNG is stored, shown only to the broker who asked and to GENZ staff; junk is refused', async () => {
    const d = await draftWith(jar.BRK1, { remunerationBasis: 'FIXED_FEE', fixedFeeAmount: 90_000 });
    const r = await call(jar.BRK1, 'POST', `/api/consent/drafts/${d.id}/request`, { protectionDays: 30, agreeTerms: true });
    const b = await r.json(); expect(r.status, JSON.stringify(b)).toBe(200);
    const token = String(b.url).split('/oc/')[1]; const cid = b.draft.consent.id;
    const base = { action: 'agree', name: 'Ram Prasad', ok: '1', sigMode: 'draw' };
    expect(await (await ownerPost(token, { ...base, sigPng: '', sigPts: '0' })).text()).toMatch(/Please sign in the box/);
    expect(await (await ownerPost(token, { ...base, sigPng: png(), sigPts: '3' })).text()).toMatch(/Please sign in the box/);                 // too few strokes
    expect(await (await ownerPost(token, { ...base, sigPng: 'data:image/png;base64,AAAA', sigPts: '40' })).text()).toMatch(/Please sign in the box/); // not a PNG
    expect(await (await ownerPost(token, { ...base, sigPng: `data:image/svg+xml;base64,${Buffer.from('<svg onload=alert(1)/>').toString('base64')}`, sigPts: '40' })).text()).toMatch(/Please sign in the box/);
    expect((await call(jar.BRK1, 'GET', `/api/consent/${cid}/signature`)).status).toBe(404);                                                    // nothing stored yet
    const ok = await ownerPost(token, { ...base, sigPng: png(), sigPts: '40' });
    expect(await ok.text()).toMatch(/हाथ का साइन/);
    const mine = await call(jar.BRK1, 'GET', `/api/consent/${cid}/signature`);
    expect(mine.status).toBe(200); expect(mine.headers.get('content-type')).toBe('image/png'); expect(mine.headers.get('x-content-type-options')).toBe('nosniff');
    const bytes = Buffer.from(await mine.arrayBuffer()); expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect((await call(jar.BRK2, 'GET', `/api/consent/${cid}/signature`)).status).toBe(404);                                                    // another broker
    expect((await call(jar.ADMIN, 'GET', `/api/consent/${cid}/signature`)).status).toBe(200);                                                   // GENZ staff
    expect((await call(undefined, 'GET', `/api/consent/${cid}/signature`)).status).toBe(401);
    const dd = (await j(await call(jar.BRK1, 'GET', '/api/consent/drafts'))).drafts.find((x: any) => x.id === d.id);
    expect(dd.consent.signature).toMatchObject({ drawn: true });
    expect(dd.consent.signature.at).toBeTruthy();
  });
});

describe('an existing listing (owner not on GENZ) gets its owner signature + brokerage too', () => {
  it('from-property → terms → owner signs → attach: protection date + ACTIVE mandate on the old listing', async () => {
    const loc = LOC(); const ph = phone();
    const body = publishBody(loc, ph, '', PRICE); delete (body as any).consentId;
    const p = await call(jar.BRK1, 'POST', '/api/properties', body);
    const pb = await p.json(); expect(p.status, JSON.stringify(pb)).toBe(200);
    const pid = pb.property.id as string;
    expect((await call(jar.BRK2, 'POST', `/api/consent/from-property/${pid}`)).status).toBe(404);                      // not his listing
    const a = await j(await call(jar.BRK1, 'POST', `/api/consent/from-property/${pid}`));
    expect(a.draft.fields).toMatchObject({ forPropertyId: pid, ownerName: 'Ram Prasad', ownerPhone: ph, askingPrice: PRICE, remunerationBasis: '' });
    const again = await j(await call(jar.BRK1, 'POST', `/api/consent/from-property/${pid}`));
    expect(again.draft.id).toBe(a.draft.id);                                                                           // one open draft per listing
    expect((await call(jar.BRK1, 'PUT', `/api/consent/drafts/${a.draft.id}`, { fields: { remunerationBasis: 'PERCENTAGE', agreedCommissionPct: 2 } })).status).toBe(200);
    const r = await call(jar.BRK1, 'POST', `/api/consent/drafts/${a.draft.id}/request`, { protectionDays: 90, agreeTerms: true });
    const rb = await r.json(); expect(r.status, JSON.stringify(rb)).toBe(200);
    const token = String(rb.url).split('/oc/')[1];
    expect((await call(jar.BRK1, 'POST', `/api/consent/drafts/${a.draft.id}/attach`)).status).toBe(409);               // owner has not said yes
    await ownerPost(token, { action: 'agree', name: 'Ram Prasad', ok: '1', sigMode: 'type', initials: 'RP' });
    const at = await call(jar.BRK1, 'POST', `/api/consent/drafts/${a.draft.id}/attach`);
    const ab = await at.json(); expect(at.status, JSON.stringify(ab)).toBe(200); expect(ab.mandateId).toMatch(/^OM-2026-\d+$/);
    const ms = (await j(await call(jar.BRK1, 'GET', `/api/owner-mandates?propertyId=${pid}`))).mandates;
    expect(ms[0]).toMatchObject({ status: 'ACTIVE', remunerationBasis: 'PERCENTAGE', agreedCommissionPct: 2, protectionPeriodDays: 90, brokerRemunerationAtAsking: 90_000 });
    expect((await call(jar.BRK1, 'POST', `/api/consent/drafts/${a.draft.id}/attach`)).status).toBe(409);               // used once
    expect((await call(jar.BRK1, 'POST', `/api/consent/from-property/${pid}`)).status).toBe(409);                      // already has a mandate
    // the same property now blocks another broker's listing for 90 days
    const dup = await call(jar.BRK2, 'POST', '/api/properties', publishBody(loc, ph, '', PRICE + 7));
    expect(dup.status).toBe(409); expect((await dup.json()).code).toBe('CONSENT_TAKEN');
  });
});

describe('static guarantees', () => {
  it('the broker’s password check lives in one file; the owner page has no inline script', () => {
    const srv = readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
    expect(srv).not.toContain('function verifySigningPassword');
    expect(readFileSync(path.join(ROOT, 'server/signing.ts'), 'utf8')).toContain('mandate-sign:');
    expect(readFileSync(path.join(ROOT, 'src/components/ListingDrafts.tsx'), 'utf8')).toContain('data-testid="brokerage-block"');
  });
});

describe('sold / rented → the whole network sees it as closed', () => {
  it('pure: only brokers, only verified, only for 30 days, never after the personal data is erased', () => {
    const now = Date.parse('2026-10-17T00:00:00Z'); const day = 86400_000;
    const sold = { verificationStatus: 'VERIFIED' as const, listingStatus: 'sold' as const, soldAt: new Date(now - 5 * day).toISOString() };
    expect(canSeeClosedProperty({ id: 'b', role: 'BROKER' } as any, sold, now)).toBe(true);
    expect(canSeeClosedProperty({ id: 'b', role: 'BROKER' } as any, { ...sold, listingStatus: 'rented' }, now)).toBe(true);
    expect(canSeeClosedProperty({ id: 'b', role: 'BROKER' } as any, { ...sold, soldAt: new Date(now - 31 * day).toISOString() }, now)).toBe(false);
    expect(canSeeClosedProperty({ id: 'b', role: 'BROKER' } as any, { ...sold, purgedAt: 'x' }, now)).toBe(false);
    expect(canSeeClosedProperty({ id: 'b', role: 'BROKER' } as any, { ...sold, listingStatus: 'withdrawn' as any }, now)).toBe(false);
    expect(canSeeClosedProperty({ id: 'o', role: 'PROPERTY_OWNER' } as any, sold, now)).toBe(false);
    expect(canSeeClosedProperty({ id: 'x', role: 'BUYER_TENANT' } as any, sold, now)).toBe(false);
  });
  it('the edit screen cannot set “sold” directly; the sold flow does, and then another broker still sees the listing — as SOLD', async () => {
    const loc = LOC(); const ph = phone();
    const body = publishBody(loc, ph, '', PRICE); delete (body as any).consentId;
    const p = await j(await call(jar.BRK1, 'POST', '/api/properties', body)); const pid = p.property.id as string;
    expect((await j(await call(jar.BRK2, 'GET', `/api/properties?locality=${encodeURIComponent(loc)}`))).properties.map((x: any) => x.id)).toContain(pid);
    await call(jar.BRK1, 'POST', `/api/listings/${pid}/status`, { status: 'under_negotiation' });                       // negotiation first
    const edit = await call(jar.BRK1, 'PUT', `/api/properties/${pid}`, { ...body, listingStatus: 'sold' });
    expect(edit.status).toBe(400);                                                                                      // the plain edit still refuses it
    expect((await call(jar.BRK1, 'POST', `/api/listings/${pid}/status`, { status: 'sold' })).status).toBe(400);         // how did it close?
    const ok = await call(jar.BRK1, 'POST', `/api/listings/${pid}/status`, { status: 'sold', soldVia: 'OUTSIDE', soldPrice: 4_400_000 });
    expect(ok.status, await ok.clone().text()).toBe(200);
    const seen = (await j(await call(jar.BRK2, 'GET', `/api/properties?locality=${encodeURIComponent(loc)}`))).properties.find((x: any) => x.id === pid);
    expect(seen).toMatchObject({ listingStatus: 'sold' });
    expect(seen.soldPrice).toBeUndefined();                                                                             // the final price stays private to the owner and listing broker
    expect(JSON.stringify(seen)).not.toContain('4400000');
    expect((await call(jar.BRK2, 'GET', `/api/properties/${pid}`)).status).toBe(200);
    expect((await call(jar.BRK2, 'POST', '/api/offers', { propertyId: pid, amount: 4_000_000, buyerName: 'Test Buyer', buyerPhone: '9876500000' })).status).toBeGreaterThanOrEqual(400);   // no offers on a sold listing
  });
});
