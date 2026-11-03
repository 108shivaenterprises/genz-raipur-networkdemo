/**
 * v114 — every kind of deal a Raipur broker really does, walked over real HTTP, one journey per kind.
 * At each step the broker's own client card + buyer need (V113 "one client, three places") must follow the deal:
 *   visit booked → card SITE_VISIT · offer made → NEGOTIATION · sold / rented through GENZ → DEAL (need fulfilled).
 *
 *  D1  resale, ONE broker on both sides (own buyer on own listing): visit → offer → the owner counters → accepted → token → sold
 *  D2  resale, co-broking with TWO buyers: reject needs a reason → A accepted → token → B goes on backup → sold-outside blocked by the token →
 *      forfeit blocked before validity → extend once → buyer A backs out (refund) → B promoted → A's deal room closed by both brokers → reopened
 *  D3  a visit that happened outside the app: recorded by one broker, confirmed by the other → "Site Visit Done"
 *  D4  residential rent (co-broking): tenant need → match → offer at the rent → accepted → "rented" (not "sold") → tenancy + police verification + notice
 *  D5  commercial lease (showroom): offer → accepted → token → rented → tenancy with lock-in and escalation
 *  D6  plot sale: counter declined → offer withdrawn → sold OUTSIDE the network → undo within 24 h → sold again → relisted for resale
 *  D7  builder project (primary sale) through a channel partner: lead → site visited → booking request with token → builder approves →
 *      instalment collected → brokerage paid with UTR; a second booking rejected; a wrong-range agreement value refused
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { freePort } from './helpers/port';

const PORT = await freePort(); const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const call = (ck: string | undefined, m: string, u: string, b?: unknown) => fetch(B + u, { method: m, redirect: 'manual', headers: { 'content-type': 'application/json', ...(ck ? { cookie: ck } : {}) }, body: b ? JSON.stringify(b) : undefined });
const j = (r: Response) => r.json().catch(() => ({})) as Promise<any>;
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v114-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], { cwd: dir, stdio: 'ignore', env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PUSH_DRY_RUN: 'true', SAHAYAK: 'off', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' } });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', BRK3: 'USR-BRK-003', BRK4: 'USR-BRK-004', OWN: 'USR-OWNER-001', BUILDER: 'USR-BUILDER-001', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
  props = (await j(await call(jar.ADMIN, 'GET', '/api/properties'))).properties;
  deals = ((await j(await call(jar.ADMIN, 'GET', '/api/deals'))).deals || []);
}, 120_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

let props: any[] = []; let deals: any[] = [];
const live = (p: any) => p.listingStatus === 'active' && p.verificationStatus === 'VERIFIED';
const clean = (p: any) => !deals.some(d => d.propertyId === p.id);
const pick = (f: (p: any) => boolean, what: string) => { const p = props.find(x => live(x) && f(x)); expect(p, what).toBeTruthy(); return p; };
const clientsOf = async (who: string) => (await j(await call(jar[who], 'GET', '/api/daily/clients'))).clients as any[];
const cardOf = async (who: string, phone: string) => (await clientsOf(who)).find(c => String(c.phone).replace(/\D/g, '').endsWith(phone));
const needOf = async (who: string, id: string) => ((await j(await call(jar[who], 'GET', '/api/requirements?mine=1'))).requirements as any[]).find(q => q.id === id);
const offerOf = async (who: string, id: string) => { const b = await j(await call(jar[who], 'GET', '/api/offers')); return [...(b.made || []), ...(b.incoming || [])].find((o: any) => o.id === id); };
const propOf = async (id: string) => (await j(await call(jar.ADMIN, 'GET', `/api/properties/${id}`))).property || (await j(await call(jar.ADMIN, 'GET', '/api/properties'))).properties.find((p: any) => p.id === id);
const addClient = async (who: string, b: Record<string, unknown>) => { const r = await call(jar[who], 'POST', '/api/daily/clients', { budgetMin: 0, city: 'Raipur', tags: [], notes: '', consent: true, ...b }); expect(r.status, await r.clone().text()).toBe(200); return (await j(r)).client; };
const slot = (h = 2) => new Date(Date.now() + h * 3600_000).toISOString();
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const ok = async (r: Response, what = '') => { expect(r.status, `${what} ${await r.clone().text()}`).toBe(200); return j(r); };

// ───────────────────────── D1 ─────────────────────────
describe('D1 · resale, one broker on both sides', { timeout: 120_000 }, () => {
  const PH = '9811100001'; let home: any; let offer: any;
  it('1 · his client (budget, area, type) → card + need; Magic Match shows his own listing', async () => {
    home = pick(p => p.listingBrokerId === 'USR-BRK-001' && p.ownerId === 'USR-OWNER-001' && p.transactionType === 'Sale' && clean(p), 'BRK1 own clean sale home of OWNER-001');
    await addClient('BRK1', { name: 'Rakesh Jain', phone: PH, budgetMin: Math.round(home.askingPrice * 0.85), budgetMax: Math.round(home.askingPrice * 1.05), areas: [home.locality], propertyType: home.propertyType, transactionType: 'Sale' });
    const c = await cardOf('BRK1', PH); expect(c.needId).toBeTruthy();
    const m = await j(await call(jar.BRK1, 'GET', `/api/matching/requirement/${c.needId}`));
    expect((m.matches as any[]).some(x => x.property.id === home.id)).toBe(true);
  });
  it('2 · he books the visit → one-broker deal room; the card moves to SITE_VISIT', async () => {
    const b = await ok(await call(jar.BRK1, 'POST', '/api/site-visits', { propertyId: home.id, customerName: 'Rakesh Jain', customerPhone: PH, scheduledTime: slot() }), 'visit');
    expect(b.dealRoom.introducingBrokerId).toBe('USR-BRK-001'); expect(b.dealRoom.closingBrokerId).toBe('USR-BRK-001');
    expect((await cardOf('BRK1', PH)).stage).toBe('SITE_VISIT');
  });
  it('3 · his offer → card NEGOTIATION; he cannot decide his own buyer’s offer — only the owner can', async () => {
    offer = (await ok(await call(jar.BRK1, 'POST', '/api/offers', { propertyId: home.id, buyerName: 'Rakesh Jain', buyerPhone: PH, consent: true, amount: Math.round(home.askingPrice * 0.92), tokenProposed: 100000 }), 'offer')).offer;
    expect((await cardOf('BRK1', PH)).stage).toBe('NEGOTIATION');
    const self = await call(jar.BRK1, 'POST', `/api/offers/${offer.id}/decide`, { action: 'ACCEPT' });
    expect(self.status).toBe(403); expect((await j(self)).code).toBe('OWNER_ONLY');
  });
  it('4 · the owner counters; the broker accepts the counter → ACCEPTED at the counter price with a deal room', async () => {
    const counter = Math.round(home.askingPrice * 0.97);
    await ok(await call(jar.OWN, 'POST', `/api/offers/${offer.id}/decide`, { action: 'COUNTER', counterAmount: counter, note: 'Final from my side' }), 'counter');
    expect((await offerOf('BRK1', offer.id)).status).toBe('COUNTERED');
    const acc = await ok(await call(jar.BRK1, 'POST', `/api/offers/${offer.id}/respond`, { action: 'ACCEPT' }), 'respond');
    expect(acc.offer.status).toBe('ACCEPTED'); expect(acc.offer.amount).toBe(counter); expect(acc.offer.dealRoomId).toBeTruthy();
  });
  it('5 · the owner records the token (the broker cannot); the broker confirms it was paid; the listing is “under negotiation”', async () => {
    expect((await call(jar.BRK1, 'POST', `/api/offers/${offer.id}/token/received`, { amount: 100000, ref: 'UTR-D1-0001' })).status).toBe(403);
    expect((await call(jar.OWN, 'POST', `/api/offers/${offer.id}/token/received`, { amount: 100000, ref: 'x' })).status).toBe(400);
    const t = await ok(await call(jar.OWN, 'POST', `/api/offers/${offer.id}/token/received`, { amount: 100000, ref: 'UTR-D1-0001', validDays: 15 }), 'token');
    expect(t.offer.status).toBe('TOKEN_HELD');
    await ok(await call(jar.BRK1, 'POST', `/api/offers/${offer.id}/token/ack`, { what: 'PAID' }), 'ack');
    expect((await call(jar.BRK1, 'POST', `/api/offers/${offer.id}/token/ack`, { what: 'PAID' })).status).toBe(409);
    expect((await propOf(home.id)).listingStatus).toBe('under_negotiation');
  });
  it('6 · sold through GENZ on that offer → listing sold, offer closed with token COMPLETED; the card is DEAL and the need fulfilled', async () => {
    expect((await call(jar.BRK1, 'POST', `/api/listings/${home.id}/status`, { status: 'rented', soldVia: 'NETWORK', offerId: offer.id })).status).toBe(400);   // a sale listing is “sold”
    expect((await call(jar.BRK1, 'POST', `/api/listings/${home.id}/status`, { status: 'sold' })).status).toBe(400);                                          // how did it close?
    await ok(await call(jar.BRK1, 'POST', `/api/listings/${home.id}/status`, { status: 'sold', soldVia: 'NETWORK', offerId: offer.id }), 'sold');
    expect((await propOf(home.id)).listingStatus).toBe('sold');
    const o = await offerOf('BRK1', offer.id); expect(o.status).toBe('CLOSED'); expect(o.token.outcome).toBe('COMPLETED');
    const c = await cardOf('BRK1', PH); expect(c.stage).toBe('DEAL');
    expect((await needOf('BRK1', c.needId)).status).toBe('fulfilled');
  });
});

// ───────────────────────── D2 ─────────────────────────
describe('D2 · resale co-broking, two buyers, token, backup, buyer backs out', { timeout: 120_000 }, () => {
  const PA = '9811100011'; const PB = '9811100012'; let home: any; let A: any; let Bo: any;
  it('1 · two brokers bring two buyers; offers made without a card first → each broker gets a card for his buyer', async () => {
    home = pick(p => p.listingBrokerId === 'USR-BRK-002' && p.ownerId === 'USR-OWNER-002' && p.transactionType === 'Sale' && clean(p), 'BRK2 clean sale home of OWNER-002');
    A = (await ok(await call(jar.BRK1, 'POST', '/api/offers', { propertyId: home.id, buyerName: 'Anita Sharma', buyerPhone: PA, consent: true, amount: Math.round(home.askingPrice * 0.93), tokenProposed: 200000 }), 'A')).offer;
    Bo = (await ok(await call(jar.BRK3, 'POST', '/api/offers', { propertyId: home.id, buyerName: 'Bhola Sahu', buyerPhone: PB, consent: true, amount: Math.round(home.askingPrice * 0.9), tokenProposed: 100000 }), 'B')).offer;
    const ca = await cardOf('BRK1', PA); expect(ca, 'BRK1 card for buyer A').toBeTruthy(); expect(ca.stage).toBe('NEGOTIATION'); expect(ca.needId).toBeTruthy();
    expect(await cardOf('BRK3', PB), 'BRK3 card for buyer B').toBeTruthy();
    expect(await cardOf('BRK2', PA)).toBeFalsy();                                   // the listing broker never gets the other side's buyer
  });
  it('2 · a rejection needs a reason; an outsider cannot decide; the listing broker accepts A', async () => {
    expect((await call(jar.BRK2, 'POST', `/api/offers/${Bo.id}/decide`, { action: 'REJECT' })).status).toBe(400);
    expect((await call(jar.BRK3, 'POST', `/api/offers/${A.id}/decide`, { action: 'ACCEPT' })).status).toBe(404);
    const a = await ok(await call(jar.BRK2, 'POST', `/api/offers/${A.id}/decide`, { action: 'ACCEPT' }), 'accept A');
    expect(a.offer.status).toBe('ACCEPTED'); expect(a.offer.dealRoomId).toBeTruthy(); A = a.offer;
  });
  it('3 · token on A → A holds the property, B goes to backup #1, listing under negotiation; selling outside is blocked', async () => {
    await ok(await call(jar.BRK2, 'POST', `/api/offers/${A.id}/token/received`, { amount: 200000, ref: 'UTR-D2-A001', validDays: 10 }), 'token');
    const b = await offerOf('BRK3', Bo.id); expect(b.status).toBe('BACKUP'); expect(b.queueNo).toBe(1);
    expect((await propOf(home.id)).listingStatus).toBe('under_negotiation');
    const out = await call(jar.BRK2, 'POST', `/api/listings/${home.id}/status`, { status: 'sold', soldVia: 'OUTSIDE' }); expect(out.status).toBe(409); expect((await j(out)).code).toBe('TOKEN_LOCK');
    expect((await call(jar.BRK2, 'POST', `/api/listings/${home.id}/status`, { status: 'active' })).status).toBe(409);
  });
  it('4 · forfeit is refused while the token is valid; extend works once', async () => {
    expect((await call(jar.BRK2, 'POST', `/api/offers/${A.id}/token/close`, { outcome: 'FORFEITED', note: 'buyer did not come' })).status).toBe(409);
    await ok(await call(jar.BRK2, 'POST', `/api/offers/${A.id}/token/extend`, { days: 3 }), 'extend');
    expect((await call(jar.BRK2, 'POST', `/api/offers/${A.id}/token/extend`, { days: 3 })).status).toBe(409);
  });
  it('5 · buyer A backs out → token refunded → A released, B promoted to ACCEPTED with its own deal room; listing open again', async () => {
    expect((await call(jar.BRK2, 'POST', `/api/offers/${A.id}/token/close`, { outcome: 'REFUNDED' })).status).toBe(400);   // a note is needed
    await ok(await call(jar.BRK2, 'POST', `/api/offers/${A.id}/token/close`, { outcome: 'REFUNDED', note: 'Loan not sanctioned, token returned by NEFT' }), 'refund');
    expect((await offerOf('BRK1', A.id)).status).toBe('RELEASED');
    const b = await offerOf('BRK3', Bo.id); expect(b.status).toBe('ACCEPTED'); expect(b.dealRoomId).toBeTruthy();
    expect(['active', 'under_negotiation']).toContain((await propOf(home.id)).listingStatus);
    await ok(await call(jar.BRK1, 'POST', `/api/offers/${A.id}/token/ack`, { what: 'OUTCOME' }), 'outcome ack');
  });
  it('6 · A’s deal room: BRK1 asks to close (buyer backed out) → BRK2 agrees → closed; reopen needs a reason; the card goes LOST by hand', async () => {
    const id = A.dealRoomId;
    expect((await call(jar.BRK1, 'POST', `/api/deals/${id}/close`, { reason: 'NOPE' })).status).toBe(400);
    await ok(await call(jar.BRK1, 'POST', `/api/deals/${id}/close`, { reason: 'BUYER_BACKED_OUT', note: 'Loan not sanctioned' }), 'close ask');
    expect((await call(jar.BRK1, 'POST', `/api/deals/${id}/close/answer`, { agree: true })).status).toBe(409);      // the asker does not answer himself
    await ok(await call(jar.BRK2, 'POST', `/api/deals/${id}/close/answer`, { agree: true }), 'close answer');
    const d = (await j(await call(jar.BRK1, 'GET', `/api/deals/${id}`))).deal; expect(d.closure?.status).toBe('CLOSED');
    expect((await call(jar.BRK2, 'POST', `/api/deals/${id}/reopen`, { note: '' })).status).toBe(400);
    await ok(await call(jar.BRK2, 'POST', `/api/deals/${id}/reopen`, { note: 'Buyer got a second loan offer' }), 'reopen');
    const ca = await cardOf('BRK1', PA);
    expect((await call(jar.BRK1, 'POST', `/api/daily/clients/${ca.id}/stage`, { stage: 'LOST' })).status).toBe(400);
    await ok(await call(jar.BRK1, 'POST', `/api/daily/clients/${ca.id}/stage`, { stage: 'LOST', lostReason: 'Loan not sanctioned' }), 'lost');
    expect((await needOf('BRK1', ca.needId)).status).toBe('closed');
  });
  it('7 · B completes: sold through GENZ on B → BRK3’s card for B is DEAL; BRK1’s lost card stays LOST', async () => {
    await ok(await call(jar.BRK2, 'POST', `/api/listings/${home.id}/status`, { status: 'sold', soldVia: 'NETWORK', offerId: Bo.id }), 'sold B');
    expect((await cardOf('BRK3', PB)).stage).toBe('DEAL');
    expect((await cardOf('BRK1', PA)).stage).toBe('LOST');
  });
});

// ───────────────────────── D3 ─────────────────────────
describe('D3 · a visit outside the app, confirmed by the other broker', { timeout: 60_000 }, () => {
  it('BRK1 books a visit on BRK3’s home → deal room “Introduction”; records an offline visit → BRK3 (not BRK1) confirms → “Site Visit Done”', async () => {
    const home = pick(p => p.listingBrokerId === 'USR-BRK-003' && p.transactionType === 'Sale' && clean(p), 'BRK3 clean sale home');
    const v = await ok(await call(jar.BRK1, 'POST', '/api/site-visits', { propertyId: home.id, customerName: 'Chetan Patel', customerPhone: '9811100021', scheduledTime: slot() }), 'visit');
    const id = v.dealRoom.id; expect(v.dealRoom.stage).toBe('Introduction');
    expect((await call(jar.BRK1, 'POST', `/api/deals/${id}/offline-visit`, { visitedOn: today(), note: 'x' })).status).toBe(400);
    await ok(await call(jar.BRK1, 'POST', `/api/deals/${id}/offline-visit`, { visitedOn: today(), note: 'Chetan saw the home with his wife on Sunday' }), 'offline');
    expect((await call(jar.BRK1, 'POST', `/api/deals/${id}/offline-visit/confirm`, {})).status).toBe(403);   // maker ≠ checker
    await ok(await call(jar.BRK3, 'POST', `/api/deals/${id}/offline-visit/confirm`, {}), 'confirm');
    expect((await j(await call(jar.BRK1, 'GET', `/api/deals/${id}`))).deal.stage).toBe('Introduction');   // confirming records it; the broker then moves the stage himself
    await ok(await call(jar.BRK1, 'POST', `/api/deals/${id}/stage`, { stage: 'Site Visit Done' }), 'stage');
    expect((await j(await call(jar.BRK1, 'GET', `/api/deals/${id}`))).deal.stage).toBe('Site Visit Done');
    expect((await cardOf('BRK1', '9811100021'))?.stage ?? 'none').toBe('none');   // a visit alone never makes a client card (no consent asked) — only an existing card moves
  });
});

// ───────────────────────── D4 ─────────────────────────
describe('D4 · residential rent, co-broking, tenancy', { timeout: 120_000 }, () => {
  const PH = '9811100031'; let home: any; let offer: any;
  it('1 · a tenant need (Rent) → Magic Match shows another broker’s rent flat', async () => {
    home = pick(p => p.listingBrokerId === 'USR-BRK-003' && p.transactionType === 'Rent' && p.propertyType === 'Residential Flat' && clean(p), 'BRK3 clean rent flat');
    await addClient('BRK1', { name: 'Deepika Nair', phone: PH, budgetMin: Math.round(home.askingPrice * 0.8), budgetMax: Math.round(home.askingPrice * 1.1), areas: [home.locality], propertyType: 'Residential Flat', transactionType: 'Rent' });
    const c = await cardOf('BRK1', PH); const q = await needOf('BRK1', c.needId); expect(q.transactionType).toBe('Rent');
    const m = await j(await call(jar.BRK1, 'GET', `/api/matching/requirement/${c.needId}`)); expect((m.matches as any[]).some(x => x.property.id === home.id)).toBe(true);
  });
  it('2 · offer at the monthly rent → the listing broker accepts → it is marked “rented” (never “sold”) through GENZ; the tenant card is DEAL', async () => {
    offer = (await ok(await call(jar.BRK1, 'POST', '/api/offers', { propertyId: home.id, buyerName: 'Deepika Nair', buyerPhone: PH, consent: true, amount: home.askingPrice, tokenProposed: 0 }), 'offer')).offer;
    offer = (await ok(await call(jar.BRK3, 'POST', `/api/offers/${offer.id}/decide`, { action: 'ACCEPT' }), 'accept')).offer;
    expect((await call(jar.BRK3, 'POST', `/api/listings/${home.id}/status`, { status: 'sold', soldVia: 'NETWORK', offerId: offer.id })).status).toBe(400);
    await ok(await call(jar.BRK3, 'POST', `/api/listings/${home.id}/status`, { status: 'rented', soldVia: 'NETWORK', offerId: offer.id }), 'rented');
    expect((await propOf(home.id)).listingStatus).toBe('rented');
    const c = await cardOf('BRK1', PH); expect(c.stage).toBe('DEAL'); expect((await needOf('BRK1', c.needId)).status).toBe('fulfilled');
  });
  it('3 · the tenancy: made from the deal room by the tenant’s broker, police verification steps, notice to vacate', async () => {
    const body = { place: `${home.propertyType}, ${home.locality}`, ownerName: 'Owner Ji', tenantName: 'Deepika Nair', tenantPhone: PH, rent: home.askingPrice, deposit: home.askingPrice * 2, startOn: today(), months: 11, noticeDays: 30, agreement: 'DRAFTED', dealRoomId: offer.dealRoomId, consent: true };
    expect((await call(jar.BRK1, 'POST', '/api/rent', { ...body, consent: false })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', '/api/rent', { ...body, lockInMonths: 12 })).status).toBe(400);     // lock-in longer than the term
    const t = (await ok(await call(jar.BRK1, 'POST', '/api/rent', body), 'tenancy')).tenancy;
    expect((await call(jar.BRK1, 'POST', `/api/rent/${t.id}/police`, { status: 'DONE' })).status).toBe(400);   // a done step needs its date
    await ok(await call(jar.BRK1, 'POST', `/api/rent/${t.id}/police`, { status: 'SUBMITTED', station: 'Telibandha PS' }), 'police');
    await ok(await call(jar.BRK1, 'POST', `/api/rent/${t.id}/police`, { status: 'DONE', on: today(), ref: 'PV-2026-118' }), 'police done');
    expect((await call(jar.BRK1, 'POST', `/api/rent/${t.id}/police`, { status: 'DONE', on: today(), ref: '1234 5678 9012' })).status).toBe(400);   // not an Aadhaar
    const got = (await j(await call(jar.BRK1, 'GET', `/api/rent/${t.id}`))).tenancy; expect(got.police.status).toBe('DONE'); expect(got.dealRoomId).toBe(offer.dealRoomId);
  });
});

// ───────────────────────── D5 ─────────────────────────
describe('D5 · commercial lease (showroom)', { timeout: 120_000 }, () => {
  const PH = '9811100041'; let home: any; let offer: any;
  it('a business client → lease offer → the listing broker accepts → token → “rented” through GENZ → lease tenancy (36 months, 12 lock-in, 5% escalation)', async () => {
    home = pick(p => p.listingBrokerId === 'USR-BRK-004' && p.transactionType === 'Lease' && clean(p), 'BRK4 clean lease');
    await addClient('BRK1', { name: 'Sanjay Motors', phone: PH, budgetMin: Math.round(home.askingPrice * 0.8), budgetMax: Math.round(home.askingPrice * 1.1), areas: [home.locality], propertyType: home.propertyType, transactionType: 'Lease' });
    offer = (await ok(await call(jar.BRK1, 'POST', '/api/offers', { propertyId: home.id, buyerName: 'Sanjay Motors', buyerPhone: PH, consent: true, amount: Math.round(home.askingPrice * 0.95), tokenProposed: Math.round(home.askingPrice * 0.5) }), 'offer')).offer;
    const pending = await call(jar.BRK4, 'POST', `/api/offers/${offer.id}/decide`, { action: 'ACCEPT' });
    expect(pending.status).toBe(403); expect((await j(pending)).code).toBe('ACCOUNT_NOT_VERIFIED');                  // an unverified broker cannot decide until GENZ checks his KYC
    await ok(await call(jar.ADMIN, 'POST', '/api/verifications/USR-BRK-004/review', { action: 'APPROVE', notes: 'RERA and PAN seen' }), 'KYC approve');
    offer = (await ok(await call(jar.BRK4, 'POST', `/api/offers/${offer.id}/decide`, { action: 'ACCEPT' }), 'accept')).offer;
    await ok(await call(jar.BRK4, 'POST', `/api/offers/${offer.id}/token/received`, { amount: Math.round(home.askingPrice * 0.5), ref: 'CHQ-004512' }), 'token');
    await ok(await call(jar.BRK4, 'POST', `/api/listings/${home.id}/status`, { status: 'rented', soldVia: 'NETWORK', offerId: offer.id }), 'rented');
    expect((await offerOf('BRK1', offer.id)).token.outcome).toBe('COMPLETED');
    const t = (await ok(await call(jar.BRK4, 'POST', '/api/rent', { place: `${home.propertyType}, ${home.locality}`, ownerName: 'Showroom Owner', tenantName: 'Sanjay Motors', tenantPhone: PH, rent: Math.round(home.askingPrice * 0.95), deposit: Math.round(home.askingPrice * 6), startOn: today(), months: 36, lockInMonths: 12, escalationPct: 5, noticeDays: 90, agreement: 'REGISTERED', dealRoomId: offer.dealRoomId, consent: true }), 'lease')).tenancy;
    expect(t.months).toBe(36); expect(t.lockInMonths).toBe(12); expect(t.nextRent).toBeGreaterThan(t.rent);
    const c = await cardOf('BRK1', PH); expect(c.stage).toBe('DEAL'); expect((await needOf('BRK1', c.needId)).status).toBe('fulfilled');
  });
});

// ───────────────────────── D6 ─────────────────────────
describe('D6 · plot sale: counter declined, withdrawn, sold outside, undo, relist', { timeout: 120_000 }, () => {
  const PH = '9811100051'; let plot: any;
  it('1 · a plot client matches the plot; offer → counter → buyer side declines (withdrawn); a second offer is withdrawn by the buyer side', async () => {
    plot = pick(p => p.listingBrokerId === 'USR-BRK-002' && /Plot/.test(p.propertyType) && p.transactionType === 'Sale' && clean(p), 'BRK2 clean plot');
    await addClient('BRK1', { name: 'Mahesh Verma', phone: PH, budgetMin: Math.round(plot.askingPrice * 0.7), budgetMax: Math.round(plot.askingPrice * 1.05), areas: [plot.locality], propertyType: plot.propertyType, transactionType: 'Sale' });
    const c = await cardOf('BRK1', PH);
    const m = await j(await call(jar.BRK1, 'GET', `/api/matching/requirement/${c.needId}`)); expect((m.matches as any[]).some(x => x.property.id === plot.id)).toBe(true);
    const o1 = (await ok(await call(jar.BRK1, 'POST', '/api/offers', { propertyId: plot.id, buyerName: 'Mahesh Verma', buyerPhone: PH, requirementId: c.needId, consent: true, amount: Math.round(plot.askingPrice * 0.8), tokenProposed: 0 }), 'o1')).offer;
    expect((await call(jar.BRK1, 'POST', '/api/offers', { propertyId: plot.id, buyerName: 'Mahesh Verma', buyerPhone: PH, consent: true, amount: Math.round(plot.askingPrice * 0.8) })).status).toBe(409);   // one live offer per buyer
    await ok(await call(jar.BRK2, 'POST', `/api/offers/${o1.id}/decide`, { action: 'COUNTER', counterAmount: Math.round(plot.askingPrice * 0.95) }), 'counter');
    await ok(await call(jar.BRK1, 'POST', `/api/offers/${o1.id}/respond`, { action: 'DECLINE' }), 'decline');
    expect((await offerOf('BRK1', o1.id)).status).toBe('WITHDRAWN');
    const o2 = (await ok(await call(jar.BRK1, 'POST', '/api/offers', { propertyId: plot.id, buyerName: 'Mahesh Verma', buyerPhone: PH, consent: true, amount: Math.round(plot.askingPrice * 0.85) }), 'o2')).offer;
    await ok(await call(jar.BRK1, 'POST', `/api/offers/${o2.id}/withdraw`, {}), 'withdraw');
    expect((await offerOf('BRK1', o2.id)).status).toBe('WITHDRAWN');
  });
  it('2 · sold OUTSIDE the network → live offers closed; the card is not touched (not a GENZ deal); undo within 24 h; sold again; relisted for resale', async () => {
    const o3 = (await ok(await call(jar.BRK3, 'POST', '/api/offers', { propertyId: plot.id, buyerName: 'Kamal Dewangan', buyerPhone: '9811100052', consent: true, amount: Math.round(plot.askingPrice * 0.82) }), 'o3')).offer;
    await ok(await call(jar.BRK2, 'POST', `/api/listings/${plot.id}/status`, { status: 'sold', soldVia: 'OUTSIDE', soldPrice: plot.askingPrice, soldNote: 'Owner sold to a relative' }), 'sold outside');
    expect((await offerOf('BRK3', o3.id)).status).toBe('CLOSED');
    expect((await cardOf('BRK1', PH)).stage).not.toBe('DEAL');
    await ok(await call(jar.BRK2, 'POST', `/api/listings/${plot.id}/undo`, {}), 'undo');
    expect((await propOf(plot.id)).listingStatus).toBe('active');
    expect((await call(jar.BRK2, 'POST', `/api/listings/${plot.id}/relist`, { confirm: true, askingPrice: plot.askingPrice })).status).toBe(409);   // only sold / rented / withdrawn
    await ok(await call(jar.BRK2, 'POST', `/api/listings/${plot.id}/status`, { status: 'sold', soldVia: 'OUTSIDE' }), 'sold again');
    expect((await call(jar.BRK2, 'POST', `/api/listings/${plot.id}/relist`, { askingPrice: plot.askingPrice })).status).toBe(400);
    await ok(await call(jar.BRK2, 'POST', `/api/listings/${plot.id}/relist`, { confirm: true, askingPrice: Math.round(plot.askingPrice * 1.1) }), 'relist');
    const again = ((await j(await call(jar.ADMIN, 'GET', '/api/properties'))).properties as any[]).find(p => p.resaleOf === plot.id);
    expect(again, 'a new listing for the resale').toBeTruthy();
  });
});

// ───────────────────────── D7 ─────────────────────────
describe('D7 · builder project (primary sale) through a channel partner', { timeout: 120_000 }, () => {
  const PROJ = 'PROJ-RAI-02'; let lead: any; let booking: any; let project: any;
  it('1 · the partner registers the customer for the project; before a site visit no booking can be asked', async () => {
    project = ((await j(await call(jar.BRK1, 'GET', '/api/crm/projects'))).projects as any[]).find(p => p.id === PROJ);
    expect(project, 'BRK1 is a partner on PROJ-RAI-02').toBeTruthy();
    lead = (await ok(await call(jar.BRK1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Rohit Tiwari', phone: '9811100061', source: 'WALK_IN' }), 'lead')).lead;
    expect((await call(jar.BRK1, 'POST', `/api/crm/leads/${lead.id}/booking-request`, { unitNo: 'P-12', agreementValue: project.priceStartingFrom, tokenAmount: 100000 })).status).toBe(409);
  });
  it('2 · site visited → booking request with the token; a value outside the project range and a token above the value are refused', async () => {
    await ok(await call(jar.BRK1, 'POST', `/api/crm/leads/${lead.id}/stage`, { stage: 'SITE_VISITED' }), 'stage');
    expect((await call(jar.BRK1, 'POST', `/api/crm/leads/${lead.id}/booking-request`, { unitNo: 'P-12', agreementValue: Math.round(project.priceStartingFrom * 0.2), tokenAmount: 100000 })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', `/api/crm/leads/${lead.id}/booking-request`, { unitNo: 'P-12', agreementValue: project.priceStartingFrom, tokenAmount: project.priceStartingFrom * 2 })).status).toBe(400);
    booking = (await ok(await call(jar.BRK1, 'POST', `/api/crm/leads/${lead.id}/booking-request`, { unitNo: 'P-12', agreementValue: project.priceStartingFrom, tokenAmount: 100000, tokenMode: 'UPI', tokenRef: 'UPI-778899', tokenPaidOn: today() }), 'booking')).booking;
    expect(booking.status).toBe('REQUESTED');
    expect((await call(jar.BRK1, 'POST', `/api/crm/bookings/${booking.id}/decision`, { decision: 'APPROVE' })).status).toBe(403);   // only the builder decides
  });
  it('3 · the builder approves with the token received → first instalment collected (receipt needed) → brokerage paid with a UTR (not more than payable)', async () => {
    await ok(await call(jar.BUILDER, 'POST', `/api/crm/bookings/${booking.id}/decision`, { decision: 'APPROVE', tokenReceived: true }), 'approve');
    const find = async () => ((await j(await call(jar.BUILDER, 'GET', '/api/crm/bookings'))).bookings as any[]).find(b => b.id === booking.id);
    booking = await find(); expect(booking.status).toBe('APPROVED');
    const due = (booking.paymentSchedule || []).find((m: any) => !m.paid);
    expect(due, 'a payment schedule exists').toBeTruthy();
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${booking.id}/payments/${due.id}/receive`, { receiptNo: 'x' })).status).toBe(400);
    await ok(await call(jar.BUILDER, 'POST', `/api/crm/bookings/${booking.id}/payments/${due.id}/receive`, { receiptNo: 'RCPT-1201' }), 'collect');
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${booking.id}/payout`, { amount: 1000, ref: 'x' })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', `/api/crm/bookings/${booking.id}/payout`, { amount: 1, ref: 'UTR-NOPE' })).status).toBe(403);   // the partner cannot pay himself
    const payable = (await find()).payableBrokerage as number; expect(payable).toBeGreaterThan(0);              // a part of the brokerage is payable once money is collected
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${booking.id}/payout`, { amount: payable + 1, ref: 'UTR-PO-1' })).status).toBe(400);
    if (payable > 0) {
      const po = await ok(await call(jar.BUILDER, 'POST', `/api/crm/bookings/${booking.id}/payout`, { amount: Math.min(payable, 50000), ref: 'UTR-PO-2026-11', mode: 'NEFT_RTGS' }), 'payout');
      expect(po.net).toBeLessThanOrEqual(Math.min(payable, 50000));
    }
  });
  it('4 · a second customer’s booking is rejected by the builder with a reason; the approved one can be cancelled', async () => {
    const l2 = (await ok(await call(jar.BRK1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Sunita Rao', phone: '9811100062', source: 'WALK_IN' }), 'lead2')).lead;
    await ok(await call(jar.BRK1, 'POST', `/api/crm/leads/${l2.id}/stage`, { stage: 'SITE_VISITED' }), 'stage2');
    const b2 = (await ok(await call(jar.BRK1, 'POST', `/api/crm/leads/${l2.id}/booking-request`, { unitNo: 'P-14', agreementValue: project.priceStartingFrom, tokenAmount: 0 }), 'booking2')).booking;
    await ok(await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b2.id}/decision`, { decision: 'REJECT', note: 'Unit P-14 is already sold offline' }), 'reject');
    expect(((await j(await call(jar.BUILDER, 'GET', '/api/crm/bookings'))).bookings as any[]).find(b => b.id === b2.id).status).toBe('REJECTED');
    const nc = await call(jar.BUILDER, 'POST', `/api/crm/bookings/${booking.id}/cancel`, { reason: 'Customer withdrew after loan rejection' });
    expect(nc.status).toBe(409); expect((await j(nc)).code).toBe('CLAWBACK_REQUIRED');                           // brokerage already paid → say how much comes back
    const paid = ((await j(await call(jar.BUILDER, 'GET', '/api/crm/bookings'))).bookings as any[]).find(b => b.id === booking.id).brokeragePaidAmount;
    await ok(await call(jar.BUILDER, 'POST', `/api/crm/bookings/${booking.id}/cancel`, { reason: 'Customer withdrew after loan rejection', clawbackAmount: paid }), 'cancel');
    const cb = ((await j(await call(jar.BUILDER, 'GET', '/api/crm/bookings'))).bookings as any[]).find(b => b.id === booking.id);
    expect(cb.status).toBe('CANCELLED'); expect(cb.settlement?.clawbackAmount).toBe(paid);
  });
  it('5 · from his own client card: block a unit for the card (lead made by itself) → site visited → card SITE_VISIT → booking approved → card DEAL, need fulfilled', async () => {
    const PH = '9811100063';
    await addClient('BRK1', { name: 'Neha Agrawal', phone: PH, budgetMax: project.priceStartingFrom * 1.2, areas: [], propertyType: 'Residential Plot', transactionType: 'Sale' });
    const card = await cardOf('BRK1', PH);
    const unit = ((await j(await call(jar.BRK1, 'GET', `/api/inventory/projects/${PROJ}`))).units as any[]).find(u => u.status === 'AVAILABLE');
    await ok(await call(jar.BRK1, 'POST', `/api/inventory/units/${unit.id}/hold`, { clientCardId: card.id, tokenAmount: Math.max(project.minToken || 0, 25000), tokenRef: 'UTR-D7-NEHA' }), 'block from card');
    const lead = ((await j(await call(jar.BRK1, 'GET', '/api/crm/leads'))).leads as any[]).find(l => l.name === 'Neha Agrawal' && l.projectId === PROJ);
    expect(lead, 'the project lead was made from the card').toBeTruthy();
    await ok(await call(jar.BRK1, 'POST', `/api/crm/leads/${lead.id}/stage`, { stage: 'SITE_VISITED' }), 'visited');
    expect((await cardOf('BRK1', PH)).stage).toBe('SITE_VISIT');
    const bk = (await ok(await call(jar.BRK1, 'POST', `/api/crm/leads/${lead.id}/booking-request`, { unitNo: unit.label, agreementValue: project.priceStartingFrom, tokenAmount: 25000, tokenMode: 'UPI', tokenRef: 'UTR-D7-NEHA', tokenPaidOn: today() }), 'booking')).booking;
    await ok(await call(jar.BUILDER, 'POST', `/api/crm/bookings/${bk.id}/decision`, { decision: 'APPROVE' }), 'approve');
    const c = await cardOf('BRK1', PH); expect(c.stage).toBe('DEAL'); expect((await needOf('BRK1', c.needId)).status).toBe('fulfilled');
  });
});
