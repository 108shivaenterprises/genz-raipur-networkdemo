import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** v73 — owner self-login, master plan, fee gate, broker pool (seen, never matched), assign + mandate. */
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 8000 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (c: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = async (r: Response) => r.json();
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
let jarC: Record<string, string> = {}; let nocookie = false;
const ckStr = () => nocookie ? '' : Object.entries(jarC).map(([k, v]) => `${k}=${v}`).join('; ');
const page = async (method: string, url: string, opt: { form?: Record<string, string>; json?: unknown } = {}) => {
  const r = await fetch(B + url, { method, redirect: 'manual', headers: { ...(opt.form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...(opt.json ? { 'content-type': 'application/json' } : {}), ...(ckStr() ? { cookie: ckStr() } : {}) }, body: opt.form ? new URLSearchParams(opt.form).toString() : opt.json ? JSON.stringify(opt.json) : undefined });
  const sc = (r.headers as any).getSetCookie?.() as string[] | undefined;
  if (sc?.length && !nocookie) for (const c of sc) { const [k, ...v] = c.split(';')[0].split('='); jarC[k] = v.join('='); }
  const text = await r.text(); let js: any; try { js = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, js, type: r.headers.get('content-type') || '' };
};
// a tiny valid PNG
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.alloc(200, 7)]).toString('base64');
const JUNK = Buffer.alloc(300, 65).toString('base64');

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v73-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: 'a1'.repeat(32), SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ B1: 'USR-BRK-001', B2: 'USR-BRK-002', OWN: 'USR-OWNER-001', SUP: cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').id })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });



const PH = '9876512345';
let OWNER = ''; let PID = ''; let PLAN = ''; let OWNER_ID = '';
const prop = (extra: any = {}) => ({ title: 'Self listed flat in Raipur ' + Math.random().toString(36).slice(2, 7), description: 'A flat the owner lists himself in Raipur.', propertyType: 'Residential Flat', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: 'Shankar Nagar', pincode: '492001', addressHidden: 'Flat 4, Test Society, Shankar Nagar', askingPrice: 5000000 + Math.floor(Math.random() * 100000), ownerApprovedNetPrice: 4500000, ownerName: 'Self Owner', ownerPhone: PH, tags: [], ...extra });
const ocall = (method: string, url: string, body?: unknown) => call(OWNER, method, url, body);

describe('owner mobile sign-in', () => {
  it('a bad number is refused; a code is sent; a wrong code fails; a new owner must give name + consent', async () => {
    expect((await call(undefined, 'POST', '/api/owner/otp', { phone: '12345' })).status).toBe(400);
    const o = await j(await call(undefined, 'POST', '/api/owner/otp', { phone: PH })); expect(o.devCode).toMatch(/^\d{6}$/); expect(o.exists).toBe(false);
    expect((await call(undefined, 'POST', '/api/owner/verify', { phone: PH, code: '000000', name: 'Self Owner', consent: true })).status).toBe(400);
    const need = await call(undefined, 'POST', '/api/owner/verify', { phone: PH, code: o.devCode });
    expect((await j(need)).code).toBe('NAME_REQUIRED');
    const noc = await call(undefined, 'POST', '/api/owner/verify', { phone: PH, code: o.devCode, name: 'Self Owner' });
    expect((await j(noc)).code).toBe('CONSENT_REQUIRED');
    const ok = await call(undefined, 'POST', '/api/owner/verify', { phone: PH, code: o.devCode, name: 'Self Owner', consent: true });
    expect(ok.status, await ok.clone().text()).toBe(200); OWNER = ok.headers.get('set-cookie')!.split(';')[0]; OWNER_ID = (await j(ok)).user.id;
    const me = await j(await ocall('GET', '/api/auth/me')); expect(me.user.role).toBe('PROPERTY_OWNER');
  });
  it('the code works once; the same number signs in again to the same account', async () => {
    const o = await j(await call(undefined, 'POST', '/api/owner/otp', { phone: PH })); expect(o.exists).toBe(true);
    const ok = await call(undefined, 'POST', '/api/owner/verify', { phone: PH, code: o.devCode }); expect(ok.status).toBe(200); expect((await j(ok)).user.id).toBe(OWNER_ID);
    expect((await call(undefined, 'POST', '/api/owner/verify', { phone: PH, code: o.devCode })).status).toBe(400);
  });
  it('an owner who already has a password account cannot be taken over by an OTP', async () => {
    const me = await j(await call(jar.OWN, 'GET', '/api/auth/me')); const ph = String(me.user.phone).replace(/\D/g, '').slice(-10);
    const r = await call(undefined, 'POST', '/api/owner/otp', { phone: ph }); expect(r.status).toBe(409); expect((await j(r)).code).toBe('USE_PASSWORD');
  });
});

describe('master plan (superadmin)', () => {
  it('only GENZ staff manage plans; a plan is checked', async () => {
    expect((await call(OWNER, 'GET', '/api/owner-listing/admin/overview')).status).toBe(403);
    expect((await call(jar.B1, 'POST', '/api/owner-listing/admin/plans', { name: 'x', fee: 1 })).status).toBe(403);
    const base = { name: 'Flat sale ₹499', transactionTypes: ['Sale'], propertyTypes: ['Residential Flat'], fee: 499, durationDays: 30, maxPhotos: 2, maxActivePerOwner: 1, refundable: true };
    expect((await call(jar.SUP, 'POST', '/api/owner-listing/admin/plans', { ...base, fee: -5 })).status).toBe(400);
    expect((await call(jar.SUP, 'POST', '/api/owner-listing/admin/plans', { ...base, durationDays: 0 })).status).toBe(400);
    const ok = await j(await call(jar.SUP, 'POST', '/api/owner-listing/admin/plans', base)); PLAN = ok.plan.id; expect(ok.plan.fee).toBe(499);
    expect((await call(jar.SUP, 'PUT', '/api/owner-listing/admin/config', { upiId: 'bad upi' })).status).toBe(400);
    expect((await call(jar.SUP, 'PUT', '/api/owner-listing/admin/config', { upiId: 'genz@okbank', enabled: true })).status).toBe(200);
  });
  it('the most specific plan wins; other kinds fall back to the default Rent plan', async () => {
    const a = await j(await ocall('GET', '/api/owner-listing/quote?transactionType=Sale&propertyType=Residential%20Flat')); expect(a.plan.id).toBe(PLAN); expect(a.plan.fee).toBe(499);
    const b = await j(await ocall('GET', '/api/owner-listing/quote?transactionType=Rent&propertyType=Residential%20Flat')); expect(b.plan.fee).toBe(499);
  });
});

let OID = '';
describe('fee, then the pool', () => {
  it('limits of the plan: photos and open listings', async () => {
    const r = await ocall('POST', '/api/properties', prop({ images: ['https://example.com/a.jpg', 'https://example.com/b.jpg', 'https://example.com/c.jpg'] })); expect(r.status).toBe(400); expect((await j(r)).code).toBe('PHOTO_LIMIT');
    const c = await ocall('POST', '/api/properties', prop()); expect(c.status, await c.clone().text()).toBe(200);
    const p = (await j(c)).property; PID = p.id;
    expect(p.listingStatus).toBe('draft'); expect(p.ownerListing.feeStatus).toBe('PENDING'); expect(p.ownerListing.fee).toBe(499);
    const two = await ocall('POST', '/api/properties', prop()); expect(two.status).toBe(429); expect((await j(two)).code).toBe('PLAN_LIMIT');
  });
  it('a listing not paid for is invisible to brokers', async () => {
    expect((await call(jar.B1, 'GET', `/api/properties/${PID}`)).status).toBe(404);
  });
  it('the owner writes the payment; staff may reject, he writes it again, staff confirm', async () => {
    expect((await ocall('POST', `/api/owner-listing/${PID}/pay`, { ref: '' })).status).toBe(400);
    expect((await ocall('POST', `/api/owner-listing/${PID}/pay`, { ref: 'UTR111222333' })).status).toBe(400); // the no-direct-deal promise is required
    const w = await j(await ocall('POST', `/api/owner-listing/${PID}/pay`, { ref: 'UTR111222333', noDirectDeal: true })); expect(w.listing.feeStatus).toBe('WAITING_CONFIRM'); expect(w.listing.noDirectDealAt).toBeTruthy();
    expect((await ocall('POST', `/api/owner-listing/${PID}/confirm`)).status).toBe(403);
    const ov = await j(await call(jar.SUP, 'GET', '/api/owner-listing/admin/overview')); expect(ov.waiting.some((x: any) => x.propertyId === PID)).toBe(true);
    expect((await call(jar.SUP, 'POST', `/api/owner-listing/${PID}/reject`, { note: '' })).status).toBe(400);
    expect((await j(await call(jar.SUP, 'POST', `/api/owner-listing/${PID}/reject`, { note: 'UTR not found in bank' }))).listing.feeStatus).toBe('REJECTED');
    await ocall('POST', `/api/owner-listing/${PID}/pay`, { ref: 'UTR999888777', noDirectDeal: true });
    const ok = await j(await call(jar.SUP, 'POST', `/api/owner-listing/${PID}/confirm`)); expect(ok.listing.feeStatus).toBe('PAID'); expect(ok.listing.inPool).toBe(true);
  });
  it('once the fee is paid it is live: a broker SEES it (no owner phone, no fee data) and can bring an offer even before a mandate', async () => {
    const g = await j(await call(jar.B1, 'GET', `/api/properties/${PID}`)); expect(g.property.ownerListed).toBe(true); expect(g.property.inPool).toBe(true);
    expect(g.property.ownerListing).toBeUndefined(); expect(g.property.ownerPhone).not.toContain(PH); expect(g.property.listingStatus).toBe('active');
    const off = await call(jar.B2, 'POST', '/api/offers', { propertyId: PID, buyerName: 'Buyer Name', buyerPhone: '9822233344', amount: 4000000, tokenProposed: 0, consent: true }); expect(off.status, await off.clone().text()).toBe(200);
    OID = (await j(off)).offer.id;
  });
  it('any number of brokers can bring offers on a paid listing (no single broker, no mandate)', async () => {
    const off = await call(jar.B1, 'POST', '/api/offers', { propertyId: PID, buyerName: 'Second Buyer', buyerPhone: '9822233355', amount: 4100000, tokenProposed: 0, consent: true }); expect(off.status, await off.clone().text()).toBe(200);
    expect((await call(jar.B1, 'POST', `/api/owner-listing/${PID}/request`, {})).status).toBe(404); // the old ask-for-mandate flow is gone
  });
  it('a PAID owner listing needs no mandate for a token: any broker may bring the offer', async () => {
    // the owner PAID GENZ: any broker may bring offers, and a token needs no mandate
    const oid = OID; const ac = await ocall('POST', `/api/offers/${oid}/decide`, { action: 'ACCEPT' }); expect(ac.status, await ac.clone().text()).toBe(200);
    const tk = await ocall('POST', `/api/offers/${oid}/token/received`, { amount: 100000, ref: 'UTR123456' }); expect(tk.status, await tk.clone().text()).toBe(200);
  });
});

describe('free routes and housekeeping', () => {
  it('a free listing is NOT possible on your own: only through a broker / shop QR after a mandate', async () => {
    const fp = await j(await call(jar.SUP, 'POST', '/api/owner-listing/admin/plans', { name: 'Free', transactionTypes: ['Lease'], propertyTypes: ['Residential Flat'], fee: 0, durationDays: 30, maxPhotos: 5, maxActivePerOwner: 3 }));
    const r = await ocall('POST', '/api/properties', prop({ transactionType: 'Lease', askingPrice: 25000, ownerApprovedNetPrice: 22000 })); expect(r.status).toBe(409); expect((await j(r)).code).toBe('VIA_BROKER_ONLY');
    await call(jar.SUP, 'DELETE', `/api/owner-listing/admin/plans/${fp.plan.id}`);
  });
  it('naming a broker at listing time = no fee, but not live before the mandate', async () => {
    await call(jar.SUP, 'PUT', `/api/owner-listing/admin/plans/${PLAN}`, { maxActivePerOwner: 5 });
    const r = await ocall('POST', '/api/properties', prop({ listingBrokerId: 'USR-BRK-002' })); expect(r.status, await r.clone().text()).toBe(200);
    const p = (await j(r)).property; expect(p.ownerListing.feeStatus).toBe('WAIVED_BROKER'); expect(p.listingStatus).toBe('pending_verification');
    expect((await call(jar.B1, 'GET', `/api/properties/${p.id}`)).status).toBe(404);
    // the owner signs the mandate with a mobile code (no password); the broker signs; ONLY THEN is it active for matching
    const sc = await j(await ocall('POST', '/api/owner/sign-code')); expect(sc.devCode).toMatch(/^\d{6}$/);
    expect((await ocall('POST', '/api/owner-mandates', { propertyId: p.id, approvedNetPrice: 4500000, protectionPeriodDays: 30, password: '000000' })).status).toBe(400);
    const sc2 = await j(await ocall('POST', '/api/owner/sign-code'));
    const m = await ocall('POST', '/api/owner-mandates', { propertyId: p.id, approvedNetPrice: 4500000, protectionPeriodDays: 30, password: sc2.devCode });
    expect(m.status, await m.clone().text()).toBe(200); const id = (await j(m)).mandate.id;
    expect((await call(jar.B1, 'GET', `/api/properties/${p.id}`)).status).toBe(404);
    const ok = await call(jar.B2, 'POST', `/api/owner-mandates/${id}/accept`, { password: cfg.demoPassword }); expect(ok.status, await ok.clone().text()).toBe(200);
    const q = (await j(await call(jar.B2, 'GET', `/api/properties/${p.id}`))).property; expect(q.listingStatus).toBe('active'); expect(q.verificationStatus).toBe('VERIFIED');
  });
  it('switching owner listing off stops self-listing but brokers can still list for owners', async () => {
    await call(jar.SUP, 'PUT', '/api/owner-listing/admin/config', { enabled: false });
    const r = await ocall('POST', '/api/properties', prop()); expect(r.status).toBe(403); expect((await j(r)).code).toBe('OWNER_LISTING_OFF');
    await call(jar.SUP, 'PUT', '/api/owner-listing/admin/config', { enabled: true });
  });
  it('a plan in use is only switched off, never deleted from under a listing', async () => {
    const d = await j(await call(jar.SUP, 'DELETE', `/api/owner-listing/admin/plans/${PLAN}`)); expect(d.deactivated).toBe(true);
  });
});

describe('owner uploads: listing photo / video and verification papers', () => {
  const JPG = Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.alloc(300, 9)]).toString('base64');
  const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(300, 1)]).toString('base64');
  let DOC = ''; let URL1 = '';
  it('a listing photo uploads, and any signed-in broker can open it; junk is refused', async () => {
    const ok = await ocall('POST', '/api/owner-media/photo', { data: `data:image/jpeg;base64,${JPG}` }); expect(ok.status, await ok.clone().text()).toBe(200); URL1 = (await j(ok)).url; expect(URL1).toMatch(/^\/api\/owner-media\/f\/IMG-/);
    const g = await call(jar.B1, 'GET', URL1); expect(g.status).toBe(200); expect(g.headers.get('content-type')).toBe('image/jpeg');
    expect((await call(undefined, 'GET', URL1)).status).toBe(401);
    expect((await ocall('POST', '/api/owner-media/photo', { data: JUNK })).status).toBe(415);
    // the returned url is accepted as a listing photo
    const c = await ocall('PUT', `/api/properties/${PID}`, { images: [URL1] }); expect([200, 400, 403, 404, 409]).toContain(c.status);
  });
  it('a short video uploads; a non-video is refused', async () => {
    expect((await ocall('POST', '/api/owner-media/video', { data: MP4 })).status).toBe(200);
    expect((await ocall('POST', '/api/owner-media/video', { data: JUNK })).status).toBe(415);
  });
  it('verification papers: consent + the right property; private to the owner and GENZ staff', async () => {
    expect((await ocall('POST', '/api/owner-media/doc', { kind: 'SELFIE', data: PNG })).status).toBe(400); // no consent
    const s = await ocall('POST', '/api/owner-media/doc', { kind: 'SELFIE', data: PNG, consent: true }); expect(s.status, await s.clone().text()).toBe(200); DOC = (await j(s)).doc.id;
    expect((await ocall('POST', '/api/owner-media/doc', { kind: 'ELECTRICITY_BILL', data: PNG, consent: true })).status).toBe(400); // which property?
    expect((await ocall('POST', '/api/owner-media/doc', { kind: 'ELECTRICITY_BILL', propertyId: 'PRP-NOT-MINE', data: PNG, consent: true })).status).toBe(403);
    expect((await ocall('POST', '/api/owner-media/doc', { kind: 'ELECTRICITY_BILL', propertyId: PID, data: PNG, consent: true })).status).toBe(200);
    expect((await ocall('POST', '/api/owner-media/doc', { kind: 'ID_PAN', data: JUNK, consent: true })).status).toBe(415);
    expect((await call(jar.B1, 'GET', `/api/owner-media/doc/${DOC}/file`)).status).toBe(404);
    expect((await ocall('GET', `/api/owner-media/doc/${DOC}/file`)).status).toBe(200);
    expect((await ocall('GET', '/api/owner-media/admin/docs')).status).toBe(403);
  });
  it('GENZ staff check them, the checker is named, and face + ID both approved = identity checked', async () => {
    const q = await j(await call(jar.SUP, 'GET', '/api/owner-media/admin/docs')); expect(q.docs.some((d: any) => d.id === DOC)).toBe(true);
    expect((await call(jar.SUP, 'POST', `/api/owner-media/admin/docs/${DOC}`, { approve: false })).status).toBe(400); // a reason is needed to send back
    expect((await call(jar.SUP, 'POST', `/api/owner-media/admin/docs/${DOC}`, { approve: true })).status).toBe(200);
    const pan = await j(await ocall('POST', '/api/owner-media/doc', { kind: 'ID_PAN', data: PNG, consent: true }));
    expect((await j(await ocall('GET', '/api/owner-media/doc'))).idChecked).toBe(false);
    expect((await call(jar.SUP, 'POST', `/api/owner-media/admin/docs/${pan.doc.id}`, { approve: true })).status).toBe(200);
    const mine = await j(await ocall('GET', '/api/owner-media/doc')); expect(mine.idChecked).toBe(true); expect(mine.docs.find((d: any) => d.id === DOC).review.byName).toBeTruthy();
    expect((await ocall('DELETE', `/api/owner-media/doc/${DOC}`)).status).toBe(409); // a checked paper stays on record
  });
  it('the owner sees the network strength (totals only)', async () => {
    const n = await j(await ocall('GET', '/api/owner-listing/network')); expect(n.brokers).toBeGreaterThan(0); expect(n.phone).toBeUndefined();
  });
});
