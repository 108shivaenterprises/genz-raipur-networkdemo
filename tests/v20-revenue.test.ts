import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { entryMoney, brokerStatusAfter, totals, entriesCsv, isOverdue, type MasterCpEntry, type MasterCpAgreement } from '../src/shared/revenueRules';
import { valueReport, lastMonths, monthOf } from '../src/shared/valueRules';

/**
 * v20 — Revenue & Growth: GENZ's master-CP commission book (builder → GENZ → broker, money outside the app),
 * growth & value numbers, and the read-only network-strength link for builders.
 */
const PORT = 5000 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v20r-'));
  mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  const sup = cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN')?.id || 'USR-SUPERADMIN';
  for (const [k, id] of Object.entries({ SUP: sup, ADMIN: 'USR-ADMIN-1', BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', BUILDER: 'USR-BUILDER-001' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('book rules (pure)', () => {
  const a = { tdsOnGenzPct: 2, tdsOnBrokerPct: 2, paymentDays: 45 } as MasterCpAgreement;
  it('money of a unit: builder pays GENZ %, broker share %, TDS each side, GENZ keeps the spread', () => {
    const m = entryMoney({ agreementValue: 5_000_000, genzRatePct: 4, brokerSharePct: 2.5 }, a);
    expect(m.gross).toBe(200000); expect(m.brokerShare).toBe(125000); expect(m.net).toBe(75000);
    expect(m.tdsOnGenz).toBe(4000); expect(m.expectedFromBuilder).toBe(196000);
    expect(m.tdsOnBroker).toBe(2500); expect(m.payableToBroker).toBe(122500);
  });
  it('pay-when-paid: the broker is due only once the builder has paid', () => {
    expect(brokerStatusAfter('EXPECTED', 'NOT_DUE', true)).toBe('NOT_DUE');
    expect(brokerStatusAfter('INVOICED', 'NOT_DUE', true)).toBe('NOT_DUE');
    expect(brokerStatusAfter('RECEIVED', 'NOT_DUE', true)).toBe('DUE');
    expect(brokerStatusAfter('EXPECTED', 'NOT_DUE', false)).toBe('DUE');
    expect(brokerStatusAfter('RECEIVED', 'PAID', true)).toBe('PAID');
    expect(brokerStatusAfter('WRITTEN_OFF', 'DUE', true)).toBe('NOT_DUE');
  });
  it('totals, overdue and a formula-safe CSV', () => {
    const now = Date.parse('2026-10-16T10:00:00Z');
    const e = (id: string, bookedAt: string, b: any, k: any, extra: Partial<MasterCpEntry> = {}): MasterCpEntry => ({ id, agreementId: 'MCP-0001', source: 'MANUAL', projectName: '=HYPERLINK("x")', unitNo: 'A-1', brokerName: 'Ravi', bookedAt, agreementValue: 1_000_000, genzRatePct: 3, brokerSharePct: 2, builder: b, broker: k, createdAt: bookedAt, updatedAt: bookedAt, history: [], ...extra });
    const list = [
      e('1', '2026-07-01T00:00:00Z', { status: 'INVOICED' }, { status: 'NOT_DUE' }),
      e('2', '2026-10-10T00:00:00Z', { status: 'RECEIVED', receivedAmount: 29400 }, { status: 'PAID', paidAmount: 19600 }),
      e('3', '2026-10-10T00:00:00Z', { status: 'EXPECTED' }, { status: 'NOT_DUE' }, { cancelled: { at: '', by: '', reason: 'x' } }),
    ];
    const ag = new Map([['MCP-0001', a]]);
    expect(isOverdue(list[0], a, now)).toBe(true);
    expect(isOverdue(list[1], a, now)).toBe(false);
    const t = totals(list, ag, now);
    expect(t.entries).toBe(2); // the cancelled one is out
    expect(t.overdueCount).toBe(1);
    expect(t.received).toBe(29400); expect(t.paidToBrokers).toBe(19600); expect(t.cashKept).toBe(9800);
    const csv = entriesCsv(list, ag);
    expect(csv.split('\n')[0]).toContain('GENZ net');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`); // a cell starting with = is neutralised
  });
  it('value report: months, cohorts, k-factor, take rate', () => {
    const now = Date.parse('2026-10-16T10:00:00Z');
    expect(lastMonths(3, now)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(monthOf('2026-09-30T20:00:00Z')).toBe('2026-10'); // IST
    const users = [
      { id: 'A', role: 'ADMIN', verificationStatus: 'VERIFIED', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'b1', role: 'BROKER', verificationStatus: 'VERIFIED', createdAt: '2026-09-05T00:00:00Z', city: 'Raipur', sponsorId: 'A' },
      { id: 'b2', role: 'BROKER', verificationStatus: 'VERIFIED', createdAt: '2026-09-06T00:00:00Z', city: 'Raipur', invitedById: 'b1' },
      { id: 'b3', role: 'BROKER', verificationStatus: 'VERIFIED', createdAt: '2026-10-02T00:00:00Z', city: 'Bhilai', invitedById: 'b1' },
    ];
    const r = valueReport({
      now, users, invitations: [{ issuedBy: 'b1', status: 'REDEEMED', redeemedAt: '2026-09-06T00:00:00Z' }],
      days: [{ day: '2026-09-10', seen: ['b1', 'b2'], acted: ['b1'] }, { day: '2026-10-05', seen: ['b1', 'b3'], acted: [] }],
      bookings: [{ status: 'APPROVED', decidedAt: '2026-10-08T00:00:00Z', createdAt: '2026-10-01T00:00:00Z', agreementValue: 5_000_000 }, { status: 'APPROVED', decidedAt: '2026-10-08T00:00:00Z', createdAt: '2026-10-01T00:00:00Z', agreementValue: 9_000_000, direct: true }],
      offers: [], deals: [],
      revenue: [{ bookedAt: '2026-10-08T00:00:00Z', gross: 150000, net: 50000, received: 0, agreementValue: 5_000_000 }],
    }, 3);
    const oct = r.monthly.find(m => m.month === '2026-10')!;
    expect(oct.activeBrokers).toBe(2); expect(oct.networkBookings).toBe(1); expect(oct.networkGmv).toBe(5_000_000);
    const sep = r.cohorts.find(c => c.month === '2026-09')!;
    expect(sep.size).toBe(2); expect(sep.retention[0]).toBe(100); expect(sep.retention[1]).toBe(50);
    expect(r.virality.viaMembers90d).toBe(2); // b2, b3 came through b1; b1 came through an admin
    expect(r.money.takeRatePct).toBe(1);
    expect(r.money.partnerSharePct).toBe(50);
  });
});

describe('who may open what', () => {
  it('only the superadmin runs the book; a broker / admin / builder gets 403; a broker can read only his own lines', async () => {
    for (const k of ['BRK1', 'ADMIN', 'BUILDER']) expect((await call(jar[k], 'GET', '/api/revenue/summary')).status, k).toBe(403);
    expect((await call(undefined, 'GET', '/api/revenue/summary')).status).toBe(401);
    expect((await call(jar.SUP, 'GET', '/api/revenue/summary')).status).toBe(200);
    const mine = await j(await call(jar.BRK1, 'GET', '/api/revenue/mine'));
    expect(mine.entries).toEqual([]);
  });
});

describe('master-CP book end to end', () => {
  let agId = '';
  it('validates an agreement (share ≤ GENZ rate, one live agreement per project)', async () => {
    expect((await call(jar.SUP, 'POST', '/api/revenue/agreements', { builderName: 'Agrawal Infra', projectIds: ['PROJ-RAI-02'], genzRatePct: 2, brokerSharePct: 3 })).status).toBe(400);
    const r = await j(await call(jar.SUP, 'POST', '/api/revenue/agreements', { builderId: 'USR-BUILDER-001', projectIds: ['PROJ-RAI-02'], genzRatePct: 4, brokerSharePct: 2.5, tdsOnGenzPct: 2, tdsOnBrokerPct: 2, status: 'DRAFT' }));
    agId = r.agreement.id; expect(agId).toMatch(/^MCP-/);
    expect((await call(jar.SUP, 'POST', '/api/revenue/agreements', { builderName: 'Someone', projectIds: ['PROJ-RAI-02'], genzRatePct: 4, brokerSharePct: 2 })).status).toBe(409);
  });
  it('a booking approved in the CRM lands in the book once the agreement is signed (not while it is a draft)', async () => {
    const dec = await call(jar.BUILDER, 'POST', '/api/crm/bookings/CRM-B-0001/decision', { decision: 'APPROVE', tokenReceived: true });
    expect(dec.status, await dec.clone().text()).toBe(200);
    let e = await j(await call(jar.SUP, 'GET', '/api/revenue/entries'));
    expect(e.entries.length).toBe(0); // DRAFT collects nothing
    expect((await call(jar.SUP, 'PUT', `/api/revenue/agreements/${agId}`, { status: 'SIGNED' })).status).toBe(200);
    e = await j(await call(jar.SUP, 'GET', '/api/revenue/entries'));
    expect(e.entries.length).toBe(1);
    const line = e.entries[0];
    expect(line.bookingId).toBe('CRM-B-0001'); expect(line.brokerId).toBe('USR-BRK-001');
    expect(line.money.gross).toBe(Math.round(line.agreementValue * 0.04));
    expect(line.doublePayRisk).toBe(true); // the builder also recorded 3% brokerage to this partner in the CRM
    // syncing again never duplicates
    await call(jar.SUP, 'GET', '/api/revenue/summary');
    expect((await j(await call(jar.SUP, 'GET', '/api/revenue/entries'))).entries.length).toBe(1);
  });
  it('invoice → receive → (pay-when-paid) pay the broker, with UTRs; double-pay needs a confirming note; the broker sees his share', async () => {
    const id = (await j(await call(jar.SUP, 'GET', '/api/revenue/entries'))).entries[0].id;
    expect((await call(jar.SUP, 'PUT', `/api/revenue/entries/${id}`, { action: 'PAY', ref: 'UTR1' })).status).toBe(409); // not due before the builder pays
    expect((await call(jar.SUP, 'PUT', `/api/revenue/entries/${id}`, { action: 'INVOICE' })).status).toBe(400); // invoice no. needed
    expect((await call(jar.SUP, 'PUT', `/api/revenue/entries/${id}`, { action: 'INVOICE', invoiceNo: 'GENZ/26-27/001' })).status).toBe(200);
    expect((await call(jar.SUP, 'PUT', `/api/revenue/entries/${id}`, { action: 'RECEIVE', ref: 'HDFC000111' })).status).toBe(200);
    let line = (await j(await call(jar.SUP, 'GET', '/api/revenue/entries'))).entries[0];
    expect(line.broker.status).toBe('DUE');
    expect((await call(jar.SUP, 'PUT', `/api/revenue/entries/${id}`, { action: 'EDIT', agreementValue: 1 })).status).toBe(409); // money moved
    expect((await call(jar.SUP, 'PUT', `/api/revenue/entries/${id}`, { action: 'PAY', ref: 'UTR2' })).status).toBe(409); // double-pay risk: note required
    expect((await call(jar.SUP, 'PUT', `/api/revenue/entries/${id}`, { action: 'PAY', ref: 'UTR2', reason: 'Builder confirmed it will not pay the partner directly' })).status).toBe(200);
    line = (await j(await call(jar.SUP, 'GET', '/api/revenue/entries'))).entries[0];
    expect(line.broker.status).toBe('PAID'); expect(line.broker.paidAmount).toBe(line.money.payableToBroker);
    const s = await j(await call(jar.SUP, 'GET', '/api/revenue/summary'));
    expect(s.totals.cashKept).toBe(line.builder.receivedAmount - line.broker.paidAmount);
    const mine = await j(await call(jar.BRK1, 'GET', '/api/revenue/mine'));
    expect(mine.entries.length).toBe(1);
    expect(mine.entries[0].payable).toBe(line.money.payableToBroker);
    expect(mine.entries[0].genzRatePct).toBeUndefined(); // GENZ's own rate is not shown to the broker
    expect((await j(await call(jar.BRK2, 'GET', '/api/revenue/mine'))).entries.length).toBe(0);
    const audit = await j(await call(jar.SUP, 'GET', '/api/audit-logs?q=MASTER_CP_PAY'));
    expect(audit.events.length).toBeGreaterThanOrEqual(1);
  });
  it('manual lines only on LOI / signed agreements; cancelling needs a reason; CSV export works', async () => {
    const draft = await j(await call(jar.SUP, 'POST', '/api/revenue/agreements', { builderName: 'Mahamaya Developers', projectNames: ['Mahamaya Greens'], genzRatePct: 3, brokerSharePct: 2 }));
    expect((await call(jar.SUP, 'POST', '/api/revenue/entries', { agreementId: draft.agreement.id, projectName: 'Mahamaya Greens', bookedAt: '2026-10-01', agreementValue: 4000000 })).status).toBe(409);
    await call(jar.SUP, 'PUT', `/api/revenue/agreements/${draft.agreement.id}`, { status: 'LOI' });
    const add = await j(await call(jar.SUP, 'POST', '/api/revenue/entries', { agreementId: draft.agreement.id, projectName: 'Mahamaya Greens', unitNo: 'B-12', bookedAt: '2026-10-01', agreementValue: 4000000 }));
    expect(add.entry.brokerSharePct).toBe(0); // GENZ direct sale: nobody to share with
    expect(add.entry.money.net).toBe(120000);
    expect((await call(jar.SUP, 'PUT', `/api/revenue/entries/${add.entry.id}`, { action: 'CANCEL' })).status).toBe(400);
    expect((await call(jar.SUP, 'PUT', `/api/revenue/entries/${add.entry.id}`, { action: 'CANCEL', reason: 'Booking fell through' })).status).toBe(200);
    const csv = await call(jar.SUP, 'GET', '/api/revenue/export.csv');
    expect(csv.headers.get('content-type')).toMatch(/text\/csv/);
    const text = await csv.text();
    expect(text).toContain('Mahamaya Greens'); expect(text).toContain('Booking fell through');
  });
});

describe('growth & value and the builder link', () => {
  it('value report and CSV for the superadmin only', async () => {
    expect((await call(jar.ADMIN, 'GET', '/api/revenue/value')).status).toBe(403);
    const v = await j(await call(jar.SUP, 'GET', '/api/revenue/value'));
    expect(v.report.monthly.length).toBe(6);
    expect(v.report.headline.verifiedBrokers).toBeGreaterThan(0);
    expect(typeof v.report.money.genzNet12m).toBe('number');
    const csv = await call(jar.SUP, 'GET', '/api/revenue/value.csv');
    expect((await csv.text()).split('\n').length).toBe(7);
  });
  it('a strength link opens without login, shows totals only, counts views and can be switched off', async () => {
    const l = await j(await call(jar.SUP, 'POST', '/api/revenue/strength/links', { city: 'Raipur', label: 'Avinash Group — Raipur', days: 7 }));
    const token = l.link.path.split('/').pop();
    const pub = await fetch(`${B}/api/public/strength/${token}`);
    expect(pub.status).toBe(200);
    const body = await pub.json();
    expect(body.strength.city).toBe('Raipur');
    expect(body.strength.brokers.verified).toBeGreaterThan(0);
    const raw = JSON.stringify(body);
    for (const bad of ['@example', 'phone', 'email', 'USR-BRK-001', 'panNumber']) expect(raw.includes(bad), bad).toBe(false);
    const links = await j(await call(jar.SUP, 'GET', '/api/revenue/strength/links'));
    expect(links.links[0].views).toBe(1);
    expect(links.links[0].token).toBeUndefined(); // the list never repeats the secret, only the path
    expect((await call(jar.SUP, 'DELETE', `/api/revenue/strength/links/${l.link.id}`)).status).toBe(200);
    expect((await fetch(`${B}/api/public/strength/${token}`)).status).toBe(404);
    expect((await fetch(`${B}/api/public/strength/not-a-token`)).status).toBe(404);
  });
});
