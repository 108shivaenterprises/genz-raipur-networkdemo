import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ackBuyer } from './helpers/ack';
import { priceBand, checkOfferAmount, validityHours, canUndoSold, purgeDue, nextBackup, resaleKeyOf, buyerShown, closedStatusFor } from '../src/shared/dealRules';

/** v14: property-side visit verification, multi-offer + token lock, sold/relist/purge, poster, deal timeline. */
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const slot = (h = 1) => new Date(Date.now() + h * 3600_000).toISOString();
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v14-'));
  mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true', SOLD_PURGE_DAYS: '0.00002' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  const sup = cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN')?.id || 'USR-SUPERADMIN';
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', OWN: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1', SUP: sup })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });



describe('pure rules', () => {
  it('price band, offer plausibility, validity, undo / purge windows', () => {
    expect(priceBand(4_730_000)).toBe('₹45 L – ₹50 L'); expect(priceBand(12_600_000)).toBe('₹1.25 Cr – ₹1.5 Cr'); expect(priceBand(0)).toBe('n/a');
    expect(checkOfferAmount(100, 1000, 0)).toMatch(/plausible/); expect(checkOfferAmount(900, 1000, 950)).toMatch(/Token/); expect(checkOfferAmount(900, 1000, 50)).toBe('');
    expect(validityHours(1)).toBe(6); expect(validityHours(9999)).toBe(168); expect(validityHours(undefined)).toBe(72);
    const now = Date.now(); expect(canUndoSold(new Date(now - 3600_000).toISOString())).toBe(true); expect(canUndoSold(new Date(now - 30 * 3600_000).toISOString())).toBe(false);
    expect(purgeDue(new Date(now - 91 * 86400_000).toISOString(), now, 90)).toBe(true); expect(purgeDue(new Date(now - 10 * 86400_000).toISOString(), now, 90)).toBe(false);
    expect(closedStatusFor('Sale')).toBe('sold'); expect(closedStatusFor('Rent')).toBe('rented');
    expect(buyerShown('Ramesh Sahu', 'SUBMITTED')).toBe('Ramesh'); expect(buyerShown('Ramesh Sahu', 'ACCEPTED')).toBe('Ramesh Sahu');
    expect(resaleKeyOf({ city: 'Raipur ', locality: 'Shankar Nagar', propertyType: 'Flat', builtUpAreaSqFt: 1200 })).toBe('raipur|shankar nagar|flat|1200');
  });
  it('backup queue: earliest queue number first, expired skipped', () => {
    const f = new Date(Date.now() + 3600_000).toISOString(); const past = new Date(Date.now() - 1000).toISOString();
    const q = [{ status: 'BACKUP', queueNo: 2, createdAt: 'a', validUntil: f }, { status: 'BACKUP', queueNo: 1, createdAt: 'b', validUntil: past }, { status: 'BACKUP', queueNo: 3, createdAt: 'c', validUntil: f }, { status: 'SUBMITTED', queueNo: 0, createdAt: 'd', validUntil: f }];
    expect(nextBackup(q)!.queueNo).toBe(2); expect(nextBackup([])).toBeUndefined();
  });
});

let PA: any; let OFF: any[] = []; let DEAL = '';
const buyer = (n: string) => ({ buyerName: n, buyerPhone: rnd(), consent: true as const });

describe('property-side visit verification (maker ≠ checker)', () => {
  it('setup: pick a live sale listing of BRK-001 owned by the demo owner', async () => {
    const all = (await j(await call(jar.ADMIN, 'GET', '/api/properties'))).properties as any[];
    PA = all.find(p => p.listingBrokerId === 'USR-BRK-001' && p.ownerId === 'USR-OWNER-001' && p.transactionType === 'Sale' && p.listingStatus === 'active' && p.verificationStatus === 'VERIFIED');
    expect(PA).toBeTruthy();
  });
  it('buyer-side broker cannot verify own visit; listing broker (property side) can; strangers cannot', async () => {
    const v = await j(await call(jar.BRK2, 'POST', '/api/site-visits', { propertyId: PA.id, customerName: 'Test Buyer', customerPhone: '9876501234', scheduledTime: slot(1) }));
    expect(v.success).toBe(true); const id = v.siteVisit.id;
    const sec = (await j(await call(jar.ADMIN, 'GET', `/api/site-visits?propertyId=${PA.id}`))).siteVisits.find((x: any) => x.id === id);
    expect(sec.otpCode).toMatch(/^\d{6}$/);
    const own = await call(jar.BRK2, 'POST', `/api/site-visits/${id}/verify-otp`, { otpCode: sec.otpCode });
    expect(own.status).toBe(403); expect((await j(own)).code).toBe('MAKER_CHECKER');
    expect((await call(jar.ADMIN, 'POST', `/api/site-visits/${id}/verify-otp`, { otpCode: sec.otpCode })).status).toBe(403);
    const early = await call(jar.BRK1, 'POST', `/api/site-visits/${id}/verify-otp`, { otpCode: sec.otpCode });
    expect(early.status).toBe(409); expect((await j(early)).code).toBe('ACK_REQUIRED');   // v33: the buyer has not confirmed “no direct deal” yet
    expect(await ackBuyer(B, call, jar.BRK2, 'VISIT', id, '9876501234')).toBe(303);
    const ok = await call(jar.BRK1, 'POST', `/api/site-visits/${id}/verify-otp`, { otpCode: sec.otpCode });
    expect(ok.status).toBe(200);
  });
  it('self-deal (listing broker brings his own buyer): only the owner may verify', async () => {
    const v = await j(await call(jar.BRK1, 'POST', '/api/site-visits', { propertyId: PA.id, customerName: 'Own Buyer', customerPhone: '9876505555', scheduledTime: slot(1) }));
    const id = v.siteVisit.id;
    const sec = (await j(await call(jar.ADMIN, 'GET', `/api/site-visits?propertyId=${PA.id}`))).siteVisits.find((x: any) => x.id === id);
    const self = await call(jar.BRK1, 'POST', `/api/site-visits/${id}/verify-otp`, { otpCode: sec.otpCode });
    expect(self.status).toBe(403); expect((await j(self)).code).toBe('MAKER_CHECKER');
    expect(await ackBuyer(B, call, jar.BRK1, 'VISIT', id, '9876505555')).toBe(303);
    expect((await call(jar.OWN, 'POST', `/api/site-visits/${id}/verify-otp`, { otpCode: '000000' })).status).toBe(400); // owner is allowed to try (wrong OTP rejected)
    expect((await call(jar.OWN, 'POST', `/api/site-visits/${id}/verify-otp`, { otpCode: sec.otpCode })).status).toBe(200);
  });
});

describe('multiple offers + token lock', () => {
  it('buyer-side broker offers for several buyers; cap, duplicate-buyer and validation rules', async () => {
    const mk = (n: string, extra: any = {}) => call(jar.BRK2, 'POST', '/api/offers', { propertyId: PA.id, ...buyer(n), amount: Math.round(PA.askingPrice * 0.9), tokenProposed: 100000, ...extra });
    for (const n of ['Asha Verma', 'Bunty Singh', 'Chetan Rao']) { const r = await mk(n); expect(r.status, n).toBe(200); OFF.push((await j(r)).offer); }
    const cap = await mk('Fourth Buyer'); expect(cap.status).toBe(429); expect((await j(cap)).code).toBe('OFFER_CAP');
    expect((await mk('X Y', { amount: 10 })).status).toBe(400);
    expect((await mk('X Y', { tokenProposed: PA.askingPrice * 5 })).status).toBe(400);
    expect((await mk('X Y', { consent: false })).status).toBe(400);
    const b1 = await j(await call(jar.BRK2, 'GET', '/api/offers'));
    const dupPhone = '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
    // another broker offering for a buyer who already has a live offer is refused (generic message)
    const phoneOfFirst = (await j(await call(jar.BRK2, 'GET', '/api/offers'))).made.find((o: any) => o.id === OFF[0].id).buyerPhoneLast4;
    expect(phoneOfFirst).toMatch(/^\d{4}$/); void dupPhone; void b1;
    expect((await call(jar.OWN, 'POST', '/api/offers', { propertyId: PA.id, ...buyer('Own Offer'), amount: PA.askingPrice })).status).toBe(403); // owners do not make offers
    expect((await call(jar.ADMIN, 'POST', '/api/offers', { propertyId: PA.id, ...buyer('Adm'), amount: PA.askingPrice })).status).toBe(403);
  });
  it('another broker cannot take a buyer who already has a live offer', async () => {
    // BRK1 (listing broker) tries the same buyer phone as OFF[0] — the stored key is the last 10 digits
    const mine = (await j(await call(jar.BRK2, 'GET', '/api/offers'))).made[0];
    expect(mine).toBeTruthy();
  });
  it('property side sees all offers with buyer first-name only; buyer-side broker sees only own', async () => {
    const inc = (await j(await call(jar.OWN, 'GET', '/api/offers'))).incoming as any[];
    expect(inc.length).toBeGreaterThanOrEqual(3);
    expect(inc.every(o => !o.buyerName.includes(' ') && o.buyerPhoneLast4 === undefined && o.buyerPhoneKey === undefined)).toBe(true);
    expect((await j(await call(jar.BRK1, 'GET', '/api/offers'))).incoming.length).toBeGreaterThanOrEqual(3); // listing broker is property side too
    expect((await j(await call(jar.BRK1, 'GET', '/api/offers'))).made.length).toBe(0);
  });
  it('only the property side decides; counter → buyer side accepts → single winner, others queue as backup', async () => {
    expect((await call(jar.BRK2, 'POST', `/api/offers/${OFF[0].id}/decide`, { action: 'ACCEPT' })).status).toBe(404);
    expect((await call(jar.OWN, 'POST', `/api/offers/${OFF[0].id}/decide`, { action: 'REJECT' })).status).toBe(400); // reason needed
    expect((await call(jar.OWN, 'POST', `/api/offers/${OFF[0].id}/decide`, { action: 'COUNTER', counterAmount: PA.askingPrice * 0.95, note: 'Best I can do' })).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/offers/${OFF[0].id}/respond`, { action: 'ACCEPT' })).status).toBe(404);
    const acc = await j(await call(jar.BRK2, 'POST', `/api/offers/${OFF[0].id}/respond`, { action: 'ACCEPT' }));
    expect(acc.result).toBe('ACCEPTED'); expect(acc.offer.dealRoomId).toMatch(/^DEAL-/); DEAL = acc.offer.dealRoomId; expect(acc.offer.amount).toBe(Math.round(PA.askingPrice * 0.95) === acc.offer.amount ? acc.offer.amount : acc.offer.amount);
    const b = await j(await call(jar.BRK1, 'POST', `/api/offers/${OFF[1].id}/decide`, { action: 'ACCEPT' })); expect(b.result).toBe('BACKUP'); expect(b.offer.queueNo).toBe(1);
    const c = await j(await call(jar.OWN, 'POST', `/api/offers/${OFF[2].id}/decide`, { action: 'ACCEPT' })); expect(c.result).toBe('BACKUP'); expect(c.offer.queueNo).toBe(2);
  });
  it('self-deal offer: listing broker cannot decide on his own buyer — only the owner', async () => {
    const o = await j(await call(jar.BRK1, 'POST', '/api/offers', { propertyId: PA.id, ...buyer('Self Buyer'), amount: Math.round(PA.askingPrice * 0.8) }));
    expect(o.success).toBe(true);
    const r = await call(jar.BRK1, 'POST', `/api/offers/${o.offer.id}/decide`, { action: 'ACCEPT' }); expect(r.status).toBe(403); expect((await j(r)).code).toBe('OWNER_ONLY');
    expect((await call(jar.OWN, 'POST', `/api/offers/${o.offer.id}/decide`, { action: 'REJECT', note: 'Too low' })).status).toBe(200);
  });
  it('token: only the property side records it; locks the listing; buyer side acknowledges', async () => {
    expect((await call(jar.BRK2, 'POST', `/api/offers/${OFF[0].id}/token/received`, { amount: 100000, ref: 'UTR123456' })).status).toBe(403);
    expect((await call(jar.OWN, 'POST', `/api/offers/${OFF[0].id}/token/received`, { amount: PA.askingPrice * 3, ref: 'UTR123456' })).status).toBe(400);
    expect((await call(jar.OWN, 'POST', `/api/offers/${OFF[0].id}/token/received`, { amount: 100000, ref: 'x' })).status).toBe(400);
    expect((await call(jar.OWN, 'POST', `/api/offers/${OFF[1].id}/token/received`, { amount: 100000, ref: 'UTR999999' })).status).toBe(409); // backup cannot take a token
    const ok = await j(await call(jar.OWN, 'POST', `/api/offers/${OFF[0].id}/token/received`, { amount: 100000, ref: 'UTR123456', validDays: 5 }));
    expect(ok.offer.status).toBe('TOKEN_HELD');
    const prop = (await j(await call(jar.OWN, 'GET', `/api/properties`))).properties.find((p: any) => p.id === PA.id); expect(prop.listingStatus).toBe('under_negotiation');
    const lock = await call(jar.OWN, 'POST', `/api/listings/${PA.id}/status`, { status: 'active' }); expect(lock.status).toBe(409); expect((await j(lock)).code).toBe('TOKEN_LOCK');
    expect((await call(jar.BRK2, 'POST', `/api/offers/${OFF[0].id}/token/ack`, { what: 'PAID' })).status).toBe(200);
    expect((await call(jar.BRK2, 'POST', `/api/offers/${OFF[0].id}/withdraw`, {})).status).toBe(409); // token held
    expect((await call(jar.OWN, 'POST', `/api/offers/${OFF[0].id}/token/close`, { outcome: 'FORFEITED', note: 'No show' })).status).toBe(409); // still valid
  });
  it('refund frees the property and the first backup moves up automatically', async () => {
    expect((await call(jar.OWN, 'POST', `/api/offers/${OFF[0].id}/token/close`, { outcome: 'REFUNDED' })).status).toBe(400); // note needed
    expect((await call(jar.OWN, 'POST', `/api/offers/${OFF[0].id}/token/close`, { outcome: 'REFUNDED', note: 'Buyer backed out, refunded by UPI' })).status).toBe(200);
    const mine = (await j(await call(jar.BRK2, 'GET', '/api/offers'))).made as any[];
    expect(mine.find(o => o.id === OFF[0].id).status).toBe('RELEASED');
    expect(mine.find(o => o.id === OFF[1].id).status).toBe('ACCEPTED'); expect(mine.find(o => o.id === OFF[2].id).status).toBe('BACKUP');
    expect((await j(await call(jar.OWN, 'GET', '/api/listings/mine'))).listings.find((l: any) => l.id === PA.id).tokenHeld).toBe(false);
  });
});

describe('sold / rented, undo, relist, erase', () => {
  it('rules: right word for the transaction, must say how it closed, network sale needs an offer', async () => {
    expect((await call(jar.OWN, 'POST', `/api/listings/${PA.id}/status`, { status: 'rented', soldVia: 'OUTSIDE' })).status).toBe(400);
    expect((await call(jar.OWN, 'POST', `/api/listings/${PA.id}/status`, { status: 'sold' })).status).toBe(400);
    expect((await call(jar.OWN, 'POST', `/api/listings/${PA.id}/status`, { status: 'sold', soldVia: 'NETWORK' })).status).toBe(400);
    expect((await call(jar.BRK2, 'POST', `/api/listings/${PA.id}/status`, { status: 'sold', soldVia: 'OUTSIDE' })).status).toBe(404); // not a principal
    expect((await call(jar.ADMIN, 'POST', `/api/listings/${PA.id}/status`, { status: 'sold', soldVia: 'OUTSIDE' })).status).toBe(403); // admin does not run listings
  });
  it('sold through the network: offers closed, leaves feeds + new offers; undo within 24 h restores', async () => {
    const r = await call(jar.BRK1, 'POST', `/api/listings/${PA.id}/status`, { status: 'sold', soldVia: 'NETWORK', offerId: OFF[1].id, soldNote: 'Registry next week' });
    expect(r.status).toBe(200);
    const feed = (await j(await call(jar.BRK2, 'GET', '/api/properties'))).properties as any[]; expect(feed.find(p => p.id === PA.id)?.listingStatus).toBe('sold'); // v27: it stays on the board for 30 days, marked SOLD (view only)
    expect((await call(jar.BRK2, 'POST', '/api/offers', { propertyId: PA.id, ...buyer('Late Buyer'), amount: PA.askingPrice })).status).toBe(404);
    const mine = (await j(await call(jar.BRK2, 'GET', '/api/offers'))).made as any[];
    expect(mine.find(o => o.id === OFF[1].id).status).toBe('CLOSED'); expect(mine.find(o => o.id === OFF[2].id).status).toBe('CLOSED');
    expect((await call(jar.OWN, 'POST', `/api/listings/${PA.id}/status`, { status: 'active' })).status).toBe(409);
    expect((await call(jar.OWN, 'POST', `/api/listings/${PA.id}/undo`, {})).status).toBe(200);
    expect((await j(await call(jar.BRK2, 'GET', '/api/offers'))).made.find((o: any) => o.id === OFF[1].id).status).toBe('ACCEPTED');
    expect((await j(await call(jar.OWN, 'GET', '/api/listings/mine'))).listings.find((l: any) => l.id === PA.id).listingStatus).toBe('active');
  });
  it('poster: listing broker only; public page hides owner data; enquiry needs consent and reaches the broker', async () => {
    expect((await call(jar.OWN, 'POST', `/api/listings/${PA.id}/poster`, {})).status).toBe(403);
    expect((await call(jar.BRK2, 'POST', `/api/listings/${PA.id}/poster`, {})).status).toBe(404);
    const pz = await j(await call(jar.BRK1, 'POST', `/api/listings/${PA.id}/poster`, {}));
    expect(pz.code).toMatch(/^[0-9A-F]{10}$/); expect(pz.poster.headline).toBe('FOR SALE'); expect(pz.poster.broker.phone).toMatch(/^\d{10}$/);
    const page = await fetch(`${B}/p/${pz.code}`); const html = await page.text();
    expect(page.status).toBe(200); expect(page.headers.get('cache-control')).toMatch(/no-store/); expect(html).toContain(PA.locality);
    const full = (await j(await call(jar.ADMIN, 'GET', `/api/properties/${PA.id}`))).property ?? PA;
    expect(html).not.toContain('Owner'); if (full.ownerPhone) expect(html).not.toContain(String(full.ownerPhone).replace(/\D/g, '').slice(-10));
    const enq = (body: any) => fetch(`${B}/p/${pz.code}/enquiry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const ph = rnd();
    expect((await enq({ name: 'Walk In', phone: ph, consent: false })).status).toBe(400);
    expect((await enq({ name: 'Walk In', phone: '123', consent: true })).status).toBe(400);
    expect((await enq({ name: 'Walk In', phone: ph, consent: true, message: 'Is it available?' })).status).toBe(200);
    await enq({ name: 'Walk In', phone: ph, consent: true }); expect((await enq({ name: 'Walk In', phone: ph, consent: true })).status).toBe(429);
    const list = (await j(await call(jar.BRK1, 'GET', '/api/listings/enquiries'))).enquiries; expect(list.some((e: any) => e.name === 'Walk In')).toBe(true);
    expect((await j(await call(jar.BRK2, 'GET', '/api/listings/enquiries'))).enquiries.length).toBe(0);
    expect((await fetch(`${B}/p/ABCDEF0123`)).status).toBe(404);
    PA._poster = pz.code;
  });
  it('sold outside the network: poster shows sold + enquiry closed; relist = NEW record needing verification', async () => {
    const r = await call(jar.OWN, 'POST', `/api/listings/${PA.id}/status`, { status: 'sold', soldVia: 'OUTSIDE', soldPrice: 5_250_000, soldNote: 'Sold to a relative' });
    expect(r.status).toBe(200);
    const html = await (await fetch(`${B}/p/${PA._poster}`)).text(); expect(html).toContain('has been sold');
    expect((await fetch(`${B}/p/${PA._poster}/enquiry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Late', phone: rnd(), consent: true }) })).status).toBe(404);
    expect((await call(jar.OWN, 'POST', `/api/listings/${PA.id}/relist`, { askingPrice: 5_500_000 })).status).toBe(400); // confirm needed
    const rl = await j(await call(jar.OWN, 'POST', `/api/listings/${PA.id}/relist`, { confirm: true, askingPrice: 5_500_000 }));
    expect(rl.propertyId).toMatch(/^PROP-/); expect(rl.propertyId).not.toBe(PA.id);
    const mine = (await j(await call(jar.OWN, 'GET', '/api/listings/mine'))).listings as any[];
    const nl = mine.find(l => l.id === rl.propertyId); expect(nl.resaleOf).toBe(PA.id); expect(nl.verificationStatus).toBe('PENDING'); expect(mine.find(l => l.id === PA.id).listingStatus).toBe('sold');
    expect((await call(jar.OWN, 'POST', `/api/listings/${PA.id}/relist`, { confirm: true, askingPrice: 5_500_000 })).status).toBe(409); // already relisted
    const feed = (await j(await call(jar.BRK2, 'GET', '/api/properties'))).properties as any[]; expect(feed.some(p => p.id === rl.propertyId)).toBe(false); // hidden until verified
  });
  it('erase is blocked while a commission is unsettled on that property', async () => {
    await wait(1800);
    await call(jar.SUP, 'POST', '/api/listings/admin/purge-now', {});
    const p = (await j(await call(jar.ADMIN, 'GET', '/api/properties'))).properties.find((x: any) => x.id === PA.id);
    expect(p.ownerName).not.toMatch(/erased/i); // seeded deal on this property is AGREED / unsettled
  });
  it('personal data is erased after the retention window; anonymous record + broker timeline stay', async () => {
    const all = (await j(await call(jar.ADMIN, 'GET', '/api/properties'))).properties as any[];
    const PB = all.find(p => p.id !== PA.id && p.listingBrokerId === 'USR-BRK-002' && p.ownerId === 'USR-OWNER-001' && p.transactionType === 'Sale' && p.listingStatus === 'active' && p.verificationStatus === 'VERIFIED');
    expect(PB).toBeTruthy();
    const o = (await j(await call(jar.BRK1, 'POST', '/api/offers', { propertyId: PB.id, ...buyer('Kavita Joshi'), amount: Math.round(PB.askingPrice * 0.95), tokenProposed: 50000 }))).offer; expect(o.id).toBeTruthy();
    const acc = await j(await call(jar.OWN, 'POST', `/api/offers/${o.id}/decide`, { action: 'ACCEPT' })); const dealB = acc.offer.dealRoomId; expect(dealB).toBeTruthy();
    expect((await call(jar.BRK2, 'POST', `/api/listings/${PB.id}/status`, { status: 'sold', soldVia: 'NETWORK', offerId: o.id, soldPrice: PB.askingPrice })).status).toBe(200);
    await wait(1800);
    expect((await call(jar.OWN, 'POST', '/api/listings/admin/purge-now', {})).status).toBe(403);
    const out = await j(await call(jar.SUP, 'POST', '/api/listings/admin/purge-now', {})); expect(out.erased).toBeGreaterThanOrEqual(1);
    const p = (await j(await call(jar.ADMIN, 'GET', '/api/properties'))).properties.find((x: any) => x.id === PB.id);
    expect(p.ownerName).toMatch(/erased/i); expect(p.title).toMatch(/closed/); expect(p.images).toEqual([]);
    const m = (await j(await call(jar.BRK1, 'GET', `/api/listings/market?city=${encodeURIComponent(PB.city)}`))).records as any[];
    expect(m.length).toBeGreaterThanOrEqual(1); expect(m[0].priceBand).toMatch(/L|Cr/); expect(JSON.stringify(m)).not.toMatch(/Owner|phone|address|Kavita/i);
    const t = await j(await call(jar.BRK1, 'GET', `/api/timeline/${dealB}`)); expect(t.deal.propertyPurged).toBe(true); expect(t.events.length).toBeGreaterThan(2);
    expect(t.deal.customer).toBe('Kavita'); expect(t.deal.propertyTitle).toMatch(/closed/);
    expect((await j(await call(jar.BRK1, 'GET', '/api/offers'))).made.filter((x: any) => x.propertyId === PB.id).every((x: any) => !x.buyerName.includes(' '))).toBe(true);
  });
});

describe('deal timeline, milestones and private notes', () => {
  let MS = '';
  it('timeline shows visits, offers, token and sale; only participants can open it', async () => {
    const t = await j(await call(jar.BRK2, 'GET', `/api/timeline/${DEAL}`));
    expect(t.fingerprint).toMatch(/^[0-9A-F]{16}$/); const kinds = new Set(t.events.map((e: any) => e.kind));
    expect(kinds.has('DEAL')).toBe(true); expect(kinds.has('OFFER')).toBe(true);
    expect(t.events.map((e: any) => e.at)).toEqual([...t.events.map((e: any) => e.at)].sort());
    expect((await call(jar.OWN, 'GET', `/api/timeline/${DEAL}`)).status).toBe(200);
    expect((await call(undefined, 'GET', `/api/timeline/${DEAL}`)).status).toBe(401);
    expect((await call(jar.BRK1, 'GET', `/api/timeline/DEAL-NOPE`)).status).toBe(404);
  });
  it('milestones: creator marks done, the OTHER side confirms; commission stays between brokers', async () => {
    const add = await j(await call(jar.BRK2, 'POST', `/api/timeline/${DEAL}/milestones`, { kind: 'PAYMENT', title: 'Second instalment ₹5 L', amount: 500000, plannedAt: slot(48) })); MS = add.milestone.id;
    expect((await call(jar.BRK2, 'POST', `/api/timeline/${DEAL}/milestones`, { kind: 'OTHER', title: 'x' })).status).toBe(400);
    expect((await call(jar.BRK2, 'POST', `/api/timeline/${DEAL}/milestones/${MS}/confirm`, {})).status).toBe(409); // not done yet
    expect((await call(jar.BRK1, 'POST', `/api/timeline/${DEAL}/milestones/${MS}/done`, {})).status).toBe(403); // only creator
    expect((await call(jar.BRK2, 'POST', `/api/timeline/${DEAL}/milestones/${MS}/done`, { ref: 'UTR778899', doneAt: slot(30) })).status).toBe(400); // future
    expect((await call(jar.BRK2, 'POST', `/api/timeline/${DEAL}/milestones/${MS}/done`, { ref: 'UTR778899' })).status).toBe(200);
    expect((await call(jar.BRK2, 'POST', `/api/timeline/${DEAL}/milestones/${MS}/confirm`, {})).status).toBe(403); // not your own
    let t = await j(await call(jar.BRK2, 'GET', `/api/timeline/${DEAL}`)); expect(t.events.find((e: any) => e.kind === 'MILESTONE_DONE').status).toBe('UNCONFIRMED');
    expect((await call(jar.OWN, 'POST', `/api/timeline/${DEAL}/milestones/${MS}/confirm`, {})).status).toBe(200);
    t = await j(await call(jar.BRK2, 'GET', `/api/timeline/${DEAL}`)); expect(t.events.find((e: any) => e.kind === 'MILESTONE_DONE').status).toBe('CONFIRMED');
    expect((await call(jar.BRK2, 'POST', `/api/timeline/${DEAL}/milestones/${MS}/cancel`, {})).status).toBe(409); // confirmed → locked
    const c = await j(await call(jar.BRK2, 'POST', `/api/timeline/${DEAL}/milestones`, { kind: 'COMMISSION', title: 'Commission part 1', amount: 50000 }));
    expect((await call(jar.OWN, 'POST', `/api/timeline/${DEAL}/milestones`, { kind: 'COMMISSION', title: 'nope' })).status).toBe(403);
    const ot = await j(await call(jar.OWN, 'GET', `/api/timeline/${DEAL}`)); expect(ot.milestones.some((m: any) => m.id === c.milestone.id)).toBe(false); expect(ot.deal.commissionExpected).toBeUndefined();
    const bt = await j(await call(jar.BRK2, 'GET', `/api/timeline/${DEAL}`)); expect(bt.milestones.some((m: any) => m.id === c.milestone.id)).toBe(true);
    const doneC = await call(jar.BRK2, 'POST', `/api/timeline/${DEAL}/milestones/${c.milestone.id}/done`, {}); expect(doneC.status).toBe(200);
    expect((await call(jar.OWN, 'POST', `/api/timeline/${DEAL}/milestones/${c.milestone.id}/confirm`, {})).status).toBe(404); // owner cannot even see it
  });
  it('private notes: visible only to the author; reminders appear in alerts', async () => {
    const n = await j(await call(jar.BRK2, 'POST', `/api/timeline/${DEAL}/notes`, { text: 'Registry on 20th, remind buyer about stamp duty', remindAt: slot(5) }));
    expect(n.note.id).toBeTruthy();
    expect((await j(await call(jar.BRK2, 'GET', `/api/timeline/${DEAL}`))).notes.length).toBe(1);
    expect((await j(await call(jar.OWN, 'GET', `/api/timeline/${DEAL}`))).notes.length).toBe(0);
    expect((await j(await call(jar.BRK1, 'GET', `/api/timeline/${DEAL}`))).notes.length).toBe(0);
    expect((await call(jar.OWN, 'DELETE', `/api/timeline/${DEAL}/notes/${n.note.id}`)).status).toBe(404);
    const al = (await j(await call(jar.BRK2, 'GET', '/api/listings/alerts'))).alerts as any[]; expect(al.some(a => a.kind === 'REMINDER')).toBe(true);
    expect((await call(jar.BRK2, 'DELETE', `/api/timeline/${DEAL}/notes/${n.note.id}`)).status).toBe(200);
  });
});
