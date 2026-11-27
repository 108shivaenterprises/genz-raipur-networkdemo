import { freePort } from './helpers/port';
/** v199 (D20) — GENZ Mudra: safe discount voucher. Rig copied from v105. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { readFileSync } from 'fs';
import { mudraBalance, settleMudra, eraseMudraFor } from '../server/mudra';

const ROOT = path.resolve(__dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const form = (cookie: string | undefined, url: string, data: Record<string, string>) =>
  fetch(B + url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(data).toString() });
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v199-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, QUIET_HOURS: 'off', KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PUSH_DRY_RUN: 'true', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true', REVEAL_FRESH_LISTING_HOURS: '0.003', VIDEO_MAX_MB: '5' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', ADMIN: 'USR-ADMIN-1', SA: 'USR-SUPERADMIN', BUY: 'USR-BUYER-001' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 500)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });


const j = async (r: Response) => r.json().catch(() => ({})) as Promise<any>;
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const DEAL = 'DEAL-2026-001'; const BUYER = 'USR-BUYER-001';

describe('v199 · ledger rules (unit)', () => {
  const base = () => ({
    users: [{ id: 'B1', role: 'BUYER_TENANT' }, { id: 'K1', role: 'BROKER' }], requirements: [{ id: 'R1', buyerId: 'B1' }, { id: 'R2', buyerId: 'K1' }],
    dealRooms: [{ id: 'D1', requirementId: 'R1', stage: 'Site Visit Done' }, { id: 'D2', requirementId: 'R2', stage: 'Site Visit Done' }],
    siteVisits: [{ dealRoomId: 'D1', isVerified: true }, { dealRoomId: 'D2', isVerified: true }],
    commissionAgreements: [{ dealId: 'D1', status: 'ACTIVE', version: 1, totalAgreedBrokerage: 200000, payer: 'SPLIT_EQUAL' }, { dealId: 'D2', status: 'ACTIVE', version: 1, totalAgreedBrokerage: 100000 }],
    mudraEntries: [] as any[], mudraRedemptions: [] as any[], mudraConfig: undefined as any,
  });
  const withState = async <T>(st: any, fn: () => T): Promise<T> => {
    const { db } = await import('../server/db'); const g = db.getState.bind(db), sv = db.save.bind(db), ap = db.appendAuditEvent.bind(db);
    (db as any).getState = () => st; (db as any).save = () => {}; (db as any).appendAuditEvent = () => {};
    try { return fn(); } finally { (db as any).getState = g; (db as any).save = sv; (db as any).appendAuditEvent = ap; }
  };
  it('1 credit only for a BUYER_TENANT, after a verified visit AND an active agreement; 1% of the buyer share; once per deal', async () => {
    const st: any = base();
    await withState(st, () => {
      expect(settleMudra('D2')).toMatchObject({ ok: false, reason: 'NOT_A_BUYER_ACCOUNT' });                // a broker never earns
      st.siteVisits[0].isVerified = false; expect(settleMudra('D1')).toMatchObject({ ok: false, reason: 'NO_VERIFIED_VISIT' }); st.siteVisits[0].isVerified = true;
      st.commissionAgreements[0].status = 'SENT_TO_PARTICIPANTS'; expect(settleMudra('D1')).toMatchObject({ ok: false, reason: 'NO_ACTIVE_AGREEMENT' }); st.commissionAgreements[0].status = 'ACTIVE';
      const r: any = settleMudra('D1'); expect(r.ok).toBe(true); expect(r.entry.amount).toBe(1000);              // 1% of (200000 / 2)
      expect(settleMudra('D1')).toMatchObject({ ok: true, already: true }); expect(st.mudraEntries.length).toBe(1);   // idempotent
      expect(mudraBalance('B1').balance).toBe(1000);
    });
  });
  it('3/4 balance comes from the ledger (FIFO, expiry); a disputed or closed deal freezes the credit', async () => {
    const st: any = base(); const past = new Date(Date.now() - 86400_000).toISOString(); const fut = new Date(Date.now() + 86400_000 * 30).toISOString();
    st.mudraEntries.push({ id: 'c1', userId: 'B1', kind: 'CREDIT', amount: 500, dealId: 'D1', at: '2026-01-01T00:00:00.000Z', expiresAt: past, note: '' }, { id: 'c2', userId: 'B1', kind: 'CREDIT', amount: 1000, dealId: 'D1', at: '2026-02-01T00:00:00.000Z', expiresAt: fut, note: '' }, { id: 'd1', userId: 'B1', kind: 'DEBIT', amount: 300, at: '2026-03-01T00:00:00.000Z', note: '' });
    await withState(st, () => {
      expect(mudraBalance('B1').balance).toBe(1000);                      // the 300 debit was taken from the lot that was alive then (earliest expiry first); the expired lot is gone
      st.dealRooms[0].stage = 'Disputed'; expect(mudraBalance('B1').balance).toBe(0);
      st.dealRooms[0].stage = 'Site Visit Done'; st.dealRooms[0].closure = { status: 'CLOSED' }; expect(mudraBalance('B1').balance).toBe(0);
      st.dealRooms[0].closure = undefined; expect(mudraBalance('B1').balance).toBe(1000);
      expect(settleMudra('D1')).toMatchObject({ ok: true, already: true });
    });
  });
  it('3b a debit never draws on a frozen (disputed) lot: after the live credit is spent the balance is 0 and the frozen lot returns intact if the deal reopens', async () => {
    const st: any = base(); st.dealRooms.push({ id: 'D3', requirementId: 'R1', stage: 'Site Visit Done' }); st.dealRooms[0].stage = 'Disputed';
    const soon = new Date(Date.now() + 86400_000 * 5).toISOString(); const later = new Date(Date.now() + 86400_000 * 60).toISOString();
    st.mudraEntries.push({ id: 'f', userId: 'B1', kind: 'CREDIT', amount: 500, dealId: 'D1', at: '2026-01-01T00:00:00.000Z', expiresAt: soon, note: '' }, { id: 'l', userId: 'B1', kind: 'CREDIT', amount: 1000, dealId: 'D3', at: '2026-02-01T00:00:00.000Z', expiresAt: later, note: '' });
    await withState(st, () => {
      expect(mudraBalance('B1').balance).toBe(1000);                                        // the frozen lot does not count
      st.mudraEntries.push({ id: 'd', userId: 'B1', kind: 'DEBIT', amount: 1000, at: new Date().toISOString(), note: '' });   // the whole live amount is redeemed
      expect(mudraBalance('B1').balance).toBe(0);                                            // not 500: the debit did not eat the frozen lot, so no second spend
      st.dealRooms[0].stage = 'Site Visit Done'; expect(mudraBalance('B1').balance).toBe(500);   // reopened: the frozen lot is intact
    });
  });
  it('6b DPDP erase keeps an anonymous amount-0 tombstone per deal, so a later settle cannot mint the same deal again', async () => {
    const st: any = base(); await withState(st, () => {
      expect(settleMudra('D1')).toMatchObject({ ok: true }); expect(st.mudraEntries.length).toBe(1);
      eraseMudraFor('B1'); expect(st.mudraEntries).toHaveLength(1); expect(st.mudraEntries[0]).toMatchObject({ userId: 'ERASED', amount: 0, dealId: 'D1' });
      expect(settleMudra('D1')).toMatchObject({ ok: true, already: true }); expect(st.mudraEntries).toHaveLength(1); expect(mudraBalance('B1').balance).toBe(0);
    });
  });
  it('6 DPDP erase removes the user\'s entries and redemptions only', async () => {
    const st: any = base(); st.mudraEntries.push({ id: 'a', userId: 'B1', kind: 'CREDIT', amount: 1 }, { id: 'b', userId: 'X', kind: 'CREDIT', amount: 1 }); st.mudraRedemptions.push({ id: 'r', userId: 'B1', invoiceRef: 'x' });
    await withState(st, () => { expect(eraseMudraFor('B1')).toBe(2); });
    expect(st.mudraEntries.map((e: any) => e.id)).toEqual(['b']); expect(st.mudraRedemptions.length).toBe(0);
    expect(read('server/privacy.ts')).toContain('eraseMudraFor(target.id)');
  });
});

describe('v199 · HTTP', { timeout: 120000 }, () => {
  let partner = '';
  it('1 no broker-callable credit: broker and buyer get 403; SUPERADMIN needs the deal AND its buyer', async () => {
    expect((await call(jar.BRK1, 'POST', '/api/mudra/admin/credit', { dealId: DEAL, userId: BUYER })).status).toBe(403);
    expect((await call(jar.BUY, 'POST', '/api/mudra/admin/credit', { dealId: DEAL, userId: BUYER })).status).toBe(403);
    expect((await call(jar.SA, 'POST', '/api/mudra/admin/credit', { dealId: 'NOPE', userId: BUYER })).status).toBe(404);
    const mm = await call(jar.SA, 'POST', '/api/mudra/admin/credit', { dealId: DEAL, userId: 'USR-BRK-001' }); expect(mm.status).toBe(409); expect((await j(mm)).code).toBe('BUYER_MISMATCH');
    expect((await call(jar.BRK1, 'GET', '/api/mudra/me')).status).toBe(403);                      // brokers have no Mudra at all
  });
  it('7 SUPERADMIN controls the rules; a partner carries the % GENZ earns', async () => {
    expect((await call(jar.BRK1, 'PUT', '/api/mudra/admin/config', { pct: 2 })).status).toBe(403);
    expect((await call(jar.SA, 'PUT', '/api/mudra/admin/config', { pct: 9 })).status).toBe(400);
    const r = await call(jar.SA, 'PUT', '/api/mudra/admin/config', { maxDiscountPct: 10, partners: [{ id: 'PTR-T1', name: 'Test Painters', category: 'Painting', feePct: 8, active: true }] }); expect(r.status).toBe(200); partner = 'PTR-T1';
    const c = await j(await call(jar.BUY, 'GET', '/api/mudra/config')); expect(c.config.pct).toBeGreaterThan(0); expect(c.config.terms.hi.length).toBeGreaterThan(20); expect(c.config.partners[0].maxDiscountPct).toBe(8);
  });
  it('2/5 redeem: booked-via-GENZ literal, partner cap = min(partner fee, max discount), balance, unique invoice, idempotent', async () => {
    const me0 = await j(await call(jar.BUY, 'GET', '/api/mudra/me')); const start = me0.balance; expect(start).toBeGreaterThan(900);   // the demo credit (SEED_DEMO_DATA)
    const body = { partnerId: partner, invoiceRef: 'INV-1001', invoiceAmount: 10000, amount: 800, bookedViaGenz: true };
    expect((await call(jar.BUY, 'POST', '/api/mudra/redeem', { ...body, bookedViaGenz: false })).status).toBe(400);
    expect((await call(jar.BUY, 'POST', '/api/mudra/redeem', { ...body, bookedViaGenz: 'true' })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', '/api/mudra/redeem', body)).status).toBe(403);
    const over = await call(jar.BUY, 'POST', '/api/mudra/redeem', { ...body, invoiceRef: 'INV-1002', amount: 801 }); expect(over.status).toBe(400); expect((await j(over)).code).toBe('OVER_CAP');   // 8% of 10000, not 10%
    expect((await call(jar.BUY, 'POST', '/api/mudra/redeem', { ...body, partnerId: 'NOT-A-PARTNER', invoiceRef: 'INV-1003' })).status).toBe(404);
    const ok = await call(jar.BUY, 'POST', '/api/mudra/redeem', body); expect(ok.status).toBe(200); expect((await j(ok)).balance).toBe(start - 800);
    const again = await j(await call(jar.BUY, 'POST', '/api/mudra/redeem', body)); expect(again.duplicate).toBe(true); expect(again.balance).toBe(start - 800);   // same request: no second debit
    const dup = await call(jar.BUY, 'POST', '/api/mudra/redeem', { ...body, amount: 500 }); expect(dup.status).toBe(409); expect((await j(dup)).code).toBe('DUPLICATE_INVOICE');
    const big = await call(jar.BUY, 'POST', '/api/mudra/redeem', { ...body, invoiceRef: 'INV-1004', invoiceAmount: 100_000_000, amount: start }); expect(big.status).toBe(400); expect((await j(big)).code).toBe('NOT_ENOUGH');
  });
  it('3 no double spend: parallel redemptions never take more than the balance', async () => {
    const before = (await j(await call(jar.BUY, 'GET', '/api/mudra/me'))).balance;
    const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => call(jar.BUY, 'POST', '/api/mudra/redeem', { partnerId: partner, invoiceRef: `INV-PAR-${i}`, invoiceAmount: 100_000, amount: 800, bookedViaGenz: true })));
    const won = rs.filter(r => r.status === 200).length; const after = (await j(await call(jar.BUY, 'GET', '/api/mudra/me'))).balance;
    expect(won).toBe(Math.floor(before / 800)); expect(after).toBe(before - won * 800); expect(after).toBeGreaterThanOrEqual(0);
    const me = await j(await call(jar.BUY, 'GET', '/api/mudra/me')); expect(me.entries.filter((e: any) => e.kind === 'DEBIT').length).toBeGreaterThan(0);
  });
});

describe('v199 · source guards', () => {
  const m = read('server/mudra.ts'); const ui = read('src/components/MudraVoucher.tsx') + read('src/components/MudraAdmin.tsx');
  it('4/6 events only: the hooks are the two server events; demo seed is gated; flag documented in code', () => {
    const s = read('server.ts'); expect(s).toContain('settleMudraQuiet(deal.id)'); expect(s).toContain('settleMudraQuiet(visit.dealRoomId)');
    expect(m).toMatch(/SEED_DEMO_DATA \?\? 'false'/); expect(read('server/db.ts')).toContain('COINS_ENABLED');
    expect(m).not.toMatch(/r\.post\('\/credit'/);                                                       // no open credit route
  });
  it('2/5 redeem guards present; no hard-coded 0.2 margin; no mutable coinsRemaining', () => {
    for (const k of ['u.role !== \'BUYER_TENANT\'', 'isVerifiedFull(u)', 'z.literal(true)', 'DUPLICATE_INVOICE', 'Math.min(cfg.maxDiscountPct, partner.feePct)']) expect(m, k).toContain(k);
    expect(m).toContain('x.userId === u.id && x.invoiceRef.toLowerCase() === ref'); expect(m).not.toContain('0.2'); expect(m).not.toContain('coinsRemaining');
  });
  it('7 wording: a voucher, never a wallet; EN + HI; not-money notice', () => {
    expect(ui).not.toMatch(/wallet|top[- ]?up|withdraw(?!n)/i); expect(ui).toContain('discount voucher'); expect(ui).toContain('डिस्काउंट वाउचर'); expect(ui).toContain('यह पैसा नहीं है'); expect(ui).toContain('useTx');
    expect(read('server/db.ts')).toContain('GENZ is not responsible'); expect(read('server/db.ts')).toContain('GENZ की नहीं है');
  });
});
