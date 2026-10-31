import { freePort } from './helpers/port';
/** v41 — Apna-apna side: each broker keeps the brokerage of his own client (no split, the other's fee stays private) */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { validSideFee, checkProposerSide, undertakingDone, brokerDone, feeFor } from '../src/shared/sideFees';

describe('side fee rules', () => {
  it('fee must be a whole rupee amount', () => {
    expect(validSideFee(50000)).toBe(true);
    expect(validSideFee(0)).toBe(false);
    expect(validSideFee(10.5)).toBe(false);
    expect(validSideFee('5000')).toBe(false);
  });
  it('the proposer side must agree with who lists the property', () => {
    expect(checkProposerSide('BUYER', 'A', 'B', 'A')).toMatch(/seller-side/);
    expect(checkProposerSide('SELLER', 'A', 'B', 'B')).toMatch(/seller-side/);
    expect(checkProposerSide('SELLER', 'A', 'B', 'A')).toBeNull();
    expect(checkProposerSide('BUYER', 'A', 'B', 'B')).toBeNull();
  });
  it('both must sign; a broker is done when received reaches his fee', () => {
    const d: any = { introducingBrokerId: 'A', closingBrokerId: 'B', sideUndertaking: { A: 'x' }, sideFees: { A: { amount: 100 } }, sideReceipts: { A: { total: 100 } } };
    expect(undertakingDone(d)).toBe(false);
    d.sideUndertaking.B = 'y'; expect(undertakingDone(d)).toBe(true);
    expect(brokerDone(d, 'A')).toBe(true); expect(brokerDone(d, 'B')).toBe(false);
    expect(feeFor({ ...d, feeMode: 'OWN_SIDE' }, 'A')).toBe(100);
    expect(feeFor({ introducingBrokerId: 'A', closingBrokerId: 'B', totalCommissionExpected: 900 }, 'A')).toBe(900);
  });
});

const ROOT = path.resolve(__dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const form = (cookie: string | undefined, url: string, data: Record<string, string>) =>
  fetch(B + url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(data).toString() });
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v41-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });


let prop: any; let offerId = ''; let dealId = '';
describe('apna-apna side offer → deal room', () => {
  it('finds a property listed by BRK1; BRK2 (buyer side) proposes OWN_SIDE; wrong side is refused', async () => {
    const list = await (await call(jar.BRK2, 'GET', '/api/properties')).json();
    const arr = Array.isArray(list) ? list : list.properties;
    prop = arr.find((p: any) => p.listingBrokerId === 'USR-BRK-001' && p.verificationStatus === 'VERIFIED');
    expect(prop).toBeTruthy();
    const bad = await call(jar.BRK2, 'POST', '/api/collaborations', { propertyId: prop.id, feeMode: 'OWN_SIDE', proposerSide: 'SELLER', terms: 'try wrong side', receivingBrokerId: 'USR-BRK-001' });
    expect(bad.status).toBe(400);
    const ok = await call(jar.BRK2, 'POST', '/api/collaborations', { propertyId: prop.id, feeMode: 'OWN_SIDE', proposerSide: 'BUYER', terms: 'buyer side mine, seller side yours', receivingBrokerId: 'USR-BRK-001' });
    expect(ok.status).toBe(200);
    const offer = (await ok.json()).offer; offerId = offer.id;
    expect(offer.feeMode).toBe('OWN_SIDE');
  });
  it('the listing broker accepts; the room has no split and no total', async () => {
    const r = await call(jar.BRK1, 'POST', `/api/collaborations/${offerId}/respond`, { decision: 'ACCEPT' });
    expect(r.status).toBe(200);
    const room = (await r.json()).dealRoom; dealId = room.id;
    expect(room.feeMode).toBe('OWN_SIDE');
    expect(room.sellerBrokerId).toBe('USR-BRK-001'); expect(room.buyerBrokerId).toBe('USR-BRK-002');
    expect(room.totalCommissionExpected).toBe(0);
  });
  it('each broker writes his own fee; the other never sees the amount', async () => {
    expect((await call(jar.BRK1, 'PUT', `/api/deals/${dealId}/sides/fee`, { amount: 0 })).status).toBe(400);
    expect((await call(jar.BRK1, 'PUT', `/api/deals/${dealId}/sides/fee`, { amount: 120000, note: 'seller 1%' })).status).toBe(200);
    expect((await call(jar.BRK2, 'PUT', `/api/deals/${dealId}/sides/fee`, { amount: 45000 })).status).toBe(200);
    const s1 = (await (await call(jar.BRK1, 'GET', `/api/deals/${dealId}/sides`)).json()).side;
    const s2 = (await (await call(jar.BRK2, 'GET', `/api/deals/${dealId}/sides`)).json()).side;
    expect(s1.myFee).toBe(120000); expect(s2.myFee).toBe(45000);
    expect(s1.otherHasFee).toBe(true);
    expect(JSON.stringify(s1)).not.toContain('45000'); expect(JSON.stringify(s2)).not.toContain('120000');
    const d1 = JSON.stringify(await (await call(jar.BRK1, 'GET', `/api/deals/${dealId}`)).json());
    const d2 = JSON.stringify(await (await call(jar.BRK2, 'GET', `/api/deals/${dealId}`)).json());
    expect(d1).not.toContain('45000'); expect(d2).not.toContain('120000');
  });
  it('receipts need both undertakings first; amount and reference are checked; no over-receiving', async () => {
    const rec = { amount: 20000, ref: 'UTR123456', paidOn: new Date().toISOString().slice(0, 10) };
    expect((await call(jar.BRK1, 'POST', `/api/deals/${dealId}/sides/received`, rec)).status).toBe(409);
    expect((await call(jar.BRK1, 'POST', `/api/deals/${dealId}/sides/undertaking`)).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/deals/${dealId}/sides/undertaking`)).status).toBe(409);
    expect((await call(jar.BRK2, 'POST', `/api/deals/${dealId}/sides/undertaking`)).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/deals/${dealId}/sides/received`, { ...rec, ref: 'x' })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', `/api/deals/${dealId}/sides/received`, { ...rec, amount: 999999 })).status).toBe(400);
    const ok = await call(jar.BRK1, 'POST', `/api/deals/${dealId}/sides/received`, rec);
    expect(ok.status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/deals/${dealId}/sides/received`, rec)).status).toBe(409);
    expect((await ok.json()).allDone).toBe(false);
  });
  it('outsiders cannot read the sides; a split deal room is "not own side"', async () => {
    expect((await call(undefined, 'GET', `/api/deals/${dealId}/sides`)).status).toBeGreaterThanOrEqual(401);
    const other = await login('USR-BRK-003');
    expect((await call(other, 'GET', `/api/deals/${dealId}/sides`)).status).toBe(404);
    expect((await call(other, 'PUT', `/api/deals/${dealId}/sides/fee`, { amount: 1000 })).status).toBe(404);
  });
  it('a % split offer can be countered into apna-apna side', async () => {
    const p2 = (await (await call(jar.BRK2, 'GET', '/api/properties')).json());
    const arr = Array.isArray(p2) ? p2 : p2.properties;
    const other = arr.find((p: any) => p.listingBrokerId === 'USR-BRK-001' && p.verificationStatus === 'VERIFIED' && p.id !== prop.id);
    expect(other).toBeTruthy();
    const o = await call(jar.BRK2, 'POST', '/api/collaborations', { propertyId: other.id, proposedIntroducingShare: 60, proposedClosingShare: 40, terms: 'split', receivingBrokerId: 'USR-BRK-001' });
    expect(o.status).toBe(200);
    const id = (await o.json()).offer.id;
    const c = await call(jar.BRK1, 'POST', `/api/collaborations/${id}/respond`, { decision: 'COUNTER', counterFeeMode: 'OWN_SIDE', mySide: 'SELLER' });
    expect(c.status).toBe(200);
    const off = (await c.json()).offer;
    expect(off.feeMode).toBe('OWN_SIDE'); expect(off.proposerSide).toBe('BUYER');
  });
});
