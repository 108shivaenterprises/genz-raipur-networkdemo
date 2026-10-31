import { freePort } from './helpers/port';
/**
 * v29 — Buyer bond: the broker who brought the BUYER first (verified visit / offer) is protected on that property.
 * Another broker is stopped (visit + offer) without being told who holds the buyer, can ask to co-broke, and the holder is
 * alerted if the property is marked sold. GENZ staff can cancel a bond on proof.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { ackBuyer } from './helpers/ack.js';

const ROOT = path.resolve(__dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const slot = (h = 1) => new Date(Date.now() + h * 3600_000).toISOString();

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v29-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', BRK3: 'USR-BRK-003', OWN: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

let PA: any; const X = rnd(); let BOND = ''; let BRK2NAME = '';

/** BRK-002 books a visit for the buyer, the property side (listing broker) verifies it with the buyer's OTP */
async function verifiedVisit(maker: string, phone: string, name = 'Sunil Buyer') {
  const r = await call(jar[maker], 'POST', '/api/site-visits', { propertyId: PA.id, customerName: name, customerPhone: phone, scheduledTime: slot(1) });
  const v = await r.json(); expect(r.status, JSON.stringify(v)).toBe(200);
  const id = (v.siteVisit || v.visit || v).id as string;
  const sec = (await j(await call(jar.ADMIN, 'GET', `/api/site-visits?propertyId=${PA.id}`))).siteVisits.find((x: any) => x.id === id);
  expect(await ackBuyer(B, call, jar[maker], 'VISIT', id, phone), 'buyer acknowledgement').toBe(303);   // v33
  const ok = await call(jar.BRK1, 'POST', `/api/site-visits/${id}/verify-otp`, { otpCode: sec.otpCode });
  expect(ok.status, await ok.clone().text()).toBe(200);
  return id;
}

describe('buyer bond', () => {
  it('setup: a live sale listing of BRK-001 owned by the demo owner', async () => {
    const all = (await j(await call(jar.ADMIN, 'GET', '/api/properties'))).properties as any[];
    PA = all.find(p => p.listingBrokerId === 'USR-BRK-001' && p.ownerId === 'USR-OWNER-001' && p.transactionType === 'Sale' && p.listingStatus === 'active' && p.verificationStatus === 'VERIFIED');
    expect(PA).toBeTruthy();
    BRK2NAME = acct('USR-BRK-002').name;
  });

  it('a visit booked but NOT verified makes no bond; a verified visit (OTP) does', async () => {
    const r = await call(jar.BRK2, 'POST', '/api/site-visits', { propertyId: PA.id, customerName: 'Sunil Buyer', customerPhone: X, scheduledTime: slot(2) });
    expect(r.status).toBe(200);
    expect((await j(await call(jar.BRK2, 'GET', '/api/buyer-bonds/mine'))).active).toBe(0);
    expect((await call(jar.BRK3, 'POST', '/api/site-visits', { propertyId: PA.id, customerName: 'Sunil', customerPhone: X, scheduledTime: slot(3) })).status).toBe(200); // not protected yet
    await verifiedVisit('BRK2', X);
    const mine = await j(await call(jar.BRK2, 'GET', '/api/buyer-bonds/mine'));
    expect(mine.active).toBe(1);
    const b = mine.bonds[0];
    expect(b).toMatchObject({ propertyId: PA.id, source: 'VISIT', buyerPhoneLast4: X.slice(-4), active: true, status: 'ACTIVE' });
    expect(Date.parse(b.expiresAt)).toBeGreaterThan(Date.now() + 6 * 86400_000);
    BOND = b.id;
    const home = await j(await call(jar.BRK2, 'GET', '/api/home/broker'));
    expect(home.counts.buyerBonds).toBe(1);
  });

  it('another broker is stopped for the same buyer — visit and offer — without being told who holds the buyer', async () => {
    const v = await call(jar.BRK3, 'POST', '/api/site-visits', { propertyId: PA.id, customerName: 'Sunil', customerPhone: `+91 ${X.slice(0, 5)} ${X.slice(5)}`, scheduledTime: slot(4) });
    expect(v.status).toBe(409);
    const vb = await v.json();
    expect(vb).toMatchObject({ code: 'BUYER_BONDED', bondRef: BOND });
    expect(vb.hi).toMatch(/को-ब्रोकिंग/); expect(vb.protectedUntil).toBeTruthy();
    const txt = JSON.stringify(vb);
    expect(txt).not.toContain('USR-BRK-002'); expect(txt).not.toContain(BRK2NAME); expect(txt).not.toContain(X);
    const o = await call(jar.BRK3, 'POST', '/api/offers', { propertyId: PA.id, buyerName: 'Sunil', buyerPhone: X, consent: true, amount: Math.round(PA.askingPrice * 0.9), tokenProposed: 100000 });
    expect(o.status).toBe(409); expect((await o.json()).code).toBe('BUYER_BONDED');
    // a different buyer is fine
    const o2 = await call(jar.BRK3, 'POST', '/api/offers', { propertyId: PA.id, buyerName: 'Other Buyer', buyerPhone: rnd(), consent: true, amount: Math.round(PA.askingPrice * 0.9), tokenProposed: 100000 });
    expect(o2.status, await o2.clone().text()).toBe(200);
    const b3 = await j(await call(jar.BRK3, 'GET', '/api/buyer-bonds/mine'));
    expect(b3.bonds.some((b: any) => b.source === 'OFFER' && b.active)).toBe(true);     // an offer makes a bond too
    // the visit without a mobile is not blocked (and gives no protection)
    expect((await call(jar.BRK3, 'POST', '/api/site-visits', { propertyId: PA.id, customerName: 'Walk-in', scheduledTime: slot(5) })).status).toBe(200);
  });

  it('the holder himself and the listing broker in his deal room can go on with this buyer', async () => {
    const o = await call(jar.BRK2, 'POST', '/api/offers', { propertyId: PA.id, buyerName: 'Sunil Buyer', buyerPhone: X, consent: true, amount: Math.round(PA.askingPrice * 0.92), tokenProposed: 100000 });
    expect(o.status, await o.clone().text()).toBe(200);
    expect((await call(jar.BRK2, 'POST', '/api/site-visits', { propertyId: PA.id, customerName: 'Sunil Buyer', customerPhone: X, scheduledTime: slot(6) })).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', '/api/site-visits', { propertyId: PA.id, customerName: 'Sunil Buyer', customerPhone: X, scheduledTime: slot(7) })).status).toBe(200); // listing side, same deal room
    const mine = await j(await call(jar.BRK2, 'GET', '/api/buyer-bonds/mine'));
    expect(mine.active).toBe(1);                                                        // still one bond — the first one stays
  });

  it('a stopped broker can ask the holder to co-broke (once); his name and mobile reach the holder', async () => {
    expect((await call(jar.BRK2, 'POST', `/api/buyer-bonds/${BOND}/ask`, { note: 'x' })).status).toBe(400);        // own bond
    const a = await call(jar.BRK3, 'POST', `/api/buyer-bonds/${BOND}/ask`, { note: 'Same buyer called me, let us share' });
    expect(a.status, await a.clone().text()).toBe(200);
    const again = await call(jar.BRK3, 'POST', `/api/buyer-bonds/${BOND}/ask`, { note: '' });
    expect(again.status).toBe(409); expect((await again.json()).code).toBe('ALREADY_ASKED');
    const mine = await j(await call(jar.BRK2, 'GET', '/api/buyer-bonds/mine'));
    const ask = mine.bonds.find((b: any) => b.id === BOND).asks[0];
    expect(ask).toMatchObject({ fromId: 'USR-BRK-003', fromName: acct('USR-BRK-003').name, note: 'Same buyer called me, let us share' });
    expect(mine.asks).toBe(1);
    expect((await j(await call(jar.BRK2, 'GET', '/api/home/broker'))).counts.bondAsks).toBe(1);
    // BRK3 never sees the holder's bond list
    const b3 = await j(await call(jar.BRK3, 'GET', '/api/buyer-bonds/mine'));
    expect(b3.bonds.some((b: any) => b.id === BOND)).toBe(false);
  });

  it('marking the property sold alerts the holder (not the side that closed it)', async () => {
    const s = await call(jar.BRK1, 'POST', `/api/listings/${PA.id}/status`, { status: 'sold', soldVia: 'OUTSIDE', soldNote: 'Owner sold directly' });
    expect(s.status, await s.clone().text()).toBe(200);
    const mine = await j(await call(jar.BRK2, 'GET', '/api/buyer-bonds/mine'));
    expect(mine.bonds.find((b: any) => b.id === BOND).closedNotice).toMatchObject({ status: 'sold', via: 'OUTSIDE' });
    expect((await j(await call(jar.BRK2, 'GET', '/api/home/broker'))).counts.bondAlerts).toBe(1);
  });

  it('GENZ staff see bonds and can cancel one only with a reason; members cannot', async () => {
    expect((await call(jar.BRK2, 'GET', '/api/buyer-bonds/admin')).status).toBe(403);
    const list = await j(await call(jar.ADMIN, 'GET', `/api/buyer-bonds/admin?propertyId=${PA.id}`));
    const row = list.bonds.find((b: any) => b.id === BOND);
    expect(row).toMatchObject({ brokerName: BRK2NAME, propertyId: PA.id });
    expect(JSON.stringify(list)).not.toContain('buyerKey');
    expect((await call(jar.ADMIN, 'POST', `/api/buyer-bonds/admin/${BOND}/void`, { note: 'short' })).status).toBe(400);
    expect((await call(jar.ADMIN, 'POST', `/api/buyer-bonds/admin/${BOND}/void`, { note: 'Buyer confirmed on call he came via another broker' })).status).toBe(200);
    const mine = await j(await call(jar.BRK2, 'GET', '/api/buyer-bonds/mine'));
    expect(mine.bonds.find((b: any) => b.id === BOND)).toMatchObject({ status: 'VOID', active: false });
    expect((await call(jar.BRK3, 'POST', `/api/buyer-bonds/${BOND}/ask`, { note: '' })).status).toBe(404);   // ended
  });

  it('the holder can let a bond go; the buyer is then free for others', async () => {
    const all = (await j(await call(jar.ADMIN, 'GET', '/api/properties'))).properties as any[];
    const P2 = all.find(p => p.listingBrokerId === 'USR-BRK-001' && p.ownerId === 'USR-OWNER-001' && p.listingStatus === 'active' && p.verificationStatus === 'VERIFIED' && p.id !== PA.id && p.transactionType === 'Sale');
    expect(P2, 'a second sale listing of BRK-001 in the seed').toBeTruthy();
    PA = P2; const Y = rnd();
    await verifiedVisit('BRK2', Y);
    const bond = (await j(await call(jar.BRK2, 'GET', '/api/buyer-bonds/mine'))).bonds.find((b: any) => b.propertyId === P2.id && b.active);
    expect((await call(jar.BRK3, 'POST', '/api/site-visits', { propertyId: P2.id, customerName: 'Y', customerPhone: Y, scheduledTime: slot(8) })).status).toBe(409);
    expect((await call(jar.BRK3, 'POST', `/api/buyer-bonds/${bond.id}/release`)).status).toBe(404);          // not his
    expect((await call(jar.BRK2, 'POST', `/api/buyer-bonds/${bond.id}/release`)).status).toBe(200);
    expect((await call(jar.BRK3, 'POST', '/api/site-visits', { propertyId: P2.id, customerName: 'Y', customerPhone: Y, scheduledTime: slot(9) })).status).toBe(200);
  });
});
