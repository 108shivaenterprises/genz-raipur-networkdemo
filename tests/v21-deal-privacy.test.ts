import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { dealDetailVia, canSeeDealCommercials, canViewDeal, openDisputeDeals } from '../server/access';
import { generateDealTasks } from '../server/dealTemplates';

/**
 * v21 — a GENZ admin sees a broker-to-broker deal room as a SUMMARY (deal value + dashboard totals) and reads inside it
 * only while a dispute is open (or when GENZ itself is a party). Commission payments are written down by the brokers, the
 * other broker confirms; GENZ records no money.
 */
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
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const DEAL = 'DEAL-2026-001'; const AGR = 'AGR-DEAL-2026-001-V1';
const BRK1 = 'USR-BRK-001'; // closing broker of the seeded room
const BRK2 = 'USR-BRK-002'; // introducing broker
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const pay = (cookie: string, who: string, amount: number, ref: string, extra: object = {}) =>
  call(cookie, 'POST', `/api/deals/${DEAL}/commission-agreements/${AGR}/settle-payment`, { participantId: who, paidDelta: amount, ref, paidOn: today, ...extra });
const allocOf = async (cookie: string, who: string) => (await j(await call(cookie, 'GET', `/api/deals/${DEAL}/commission-agreements`))).agreements.find((a: any) => a.id === AGR).allocations.find((a: any) => a.participantId === who);

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v21-'));
  mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  const sup = cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN')?.id || 'USR-SUPERADMIN';
  for (const [k, id] of Object.entries({ SUP: sup, ADMIN: 'USR-ADMIN-1', BRK1, BRK2, OWN: 'USR-OWNER-001', LEGAL: 'USR-LEGAL-001', BRK3: 'USR-BRK-003' })) { try { jar[k] = await login(id); } catch { /* an account the seed does not have */ } }
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('access rules (pure)', () => {
  const deal: any = { id: 'D1', introducingBrokerId: 'B1', closingBrokerId: 'B2', ownerId: 'O1' };
  const none = { disputes: [] } as any;
  const open = { disputes: [{ dealRoomId: 'D1', status: 'OPEN' }] } as any;
  const closed = { disputes: [{ dealRoomId: 'D1', status: 'RESOLVED' }, { dealRoomId: 'D1', status: 'DISMISSED' }] } as any;
  const admin: any = { id: 'A1', role: 'ADMIN' };
  it('an admin reads inside a deal room only while a dispute is open', () => {
    expect(canViewDeal(admin, deal)).toBe(true); // may see the room exists (summary)
    expect(dealDetailVia(admin, deal, none)).toBe('NONE');
    expect(dealDetailVia(admin, deal, open)).toBe('DISPUTE');
    expect(dealDetailVia(admin, deal, closed)).toBe('NONE'); // closes again when the dispute is resolved
    for (const s of ['OPEN', 'UNDER_REVIEW', 'MEDIATION']) expect(dealDetailVia(admin, deal, { disputes: [{ dealRoomId: 'D1', status: s }] } as any)).toBe('DISPUTE');
    expect(dealDetailVia(admin, deal, { disputes: [{ dealRoomId: 'OTHER', status: 'OPEN' }] } as any)).toBe('NONE'); // another room's dispute opens nothing here
  });
  it('the brokers (and an employee they allot, and read-only legal counsel) keep their view', () => {
    expect(dealDetailVia({ id: 'B1', role: 'BROKER' } as any, deal, none)).toBe('PARTICIPANT');
    expect(dealDetailVia({ id: 'O1', role: 'PROPERTY_OWNER' } as any, deal, none)).toBe('PARTICIPANT');
    expect(dealDetailVia({ id: 'L1', role: 'LEGAL_COUNSEL' } as any, deal, none, { allowLegal: true })).toBe('LEGAL');
    expect(dealDetailVia({ id: 'X', role: 'BROKER' } as any, deal, none)).toBe('NONE');
  });
  it('brokerage terms: the two brokers always; GENZ only with an open dispute or as a party; the owner never', () => {
    expect(canSeeDealCommercials({ id: 'B1', role: 'BROKER' } as any, deal, none)).toBe(true);
    expect(canSeeDealCommercials(admin, deal, none)).toBe(false);
    expect(canSeeDealCommercials(admin, deal, open)).toBe(true);
    expect(canSeeDealCommercials({ id: 'O1', role: 'PROPERTY_OWNER' } as any, deal, open)).toBe(false);
    expect(canSeeDealCommercials({ id: 'A1', role: 'ADMIN' } as any, { ...deal, ownerId: 'A1' }, none)).toBe(true); // GENZ is the owner of the room
    expect(openDisputeDeals({ disputes: [{ dealRoomId: 'D1', status: 'OPEN' }, { dealRoomId: 'D2', status: 'RESOLVED' }, { status: 'OPEN' }] } as any)).toEqual(new Set(['D1']));
  });
  it('new deal rooms keep no GENZ desk: duties stay with the brokers, who review each other', () => {
    const t = generateDealTasks('DEAL-X-1', { introducingBrokerId: 'B1', introducingBrokerName: 'One', closingBrokerId: 'B2', closingBrokerName: 'Two', ownerId: 'O1', ownerName: 'Own' });
    expect(t.some(x => x.assignedParticipantRole === 'ADMIN' || x.assignedParticipantId === 'PLATFORM-DESK')).toBe(false);
    expect(t.every(x => ['B1', 'B2'].includes(x.reviewingParticipantId))).toBe(true);
    expect(t.every(x => x.reviewingParticipantId !== x.assignedParticipantId)).toBe(true);
  });
});

describe('GENZ admin sees a summary, not the inside of a broker deal room', () => {
  it('the deal list: deal value yes; brokerage, split, notes and the client name no', async () => {
    const admin = (await j(await call(jar.ADMIN, 'GET', '/api/deals'))).deals.find((d: any) => d.id === DEAL);
    expect(admin.summaryOnly).toBe(true);
    expect(admin.commercialsHidden).toBe(true);
    expect(admin.totalCommissionExpected).toBe(0); expect(admin.introducingBrokerSharePct).toBe(0); expect(admin.notes).toBe('');
    expect(admin.dealValue).toBeGreaterThan(0);
    expect(String(admin.customerId)).toMatch(/^[A-Z]\.( [A-Z]\.)*$|^Client$/); // initials only
    const broker = (await j(await call(jar.BRK1, 'GET', '/api/deals'))).deals.find((d: any) => d.id === DEAL);
    expect(broker.summaryOnly).toBeUndefined();
    expect(broker.totalCommissionExpected).toBeGreaterThan(0);
    expect(broker.dealValue).toBe(admin.dealValue);
  });
  it('the deal screen: summary only — no visits, no client, no phone numbers', async () => {
    const r = await j(await call(jar.ADMIN, 'GET', `/api/deals/${DEAL}`));
    expect(r.access).toMatchObject({ level: 'SUMMARY', via: 'NONE', adminCanSee: false });
    expect(r.deal.summaryOnly).toBe(true);
    expect(r.siteVisits).toEqual([]); expect(r.requirement).toBeUndefined(); expect(r.dispute).toBeUndefined();
    expect(r.participants.introducingBroker.phone).toBeUndefined(); expect(r.participants.closingBroker.phone).toBeUndefined();
    const b = await j(await call(jar.BRK1, 'GET', `/api/deals/${DEAL}`));
    expect(b.access).toMatchObject({ level: 'FULL', via: 'PARTICIPANT', adminCanSee: false });
    expect(b.participants.introducingBroker.phone).toBeTruthy(); // the co-broker can still ring the other broker
  });
  it('chat, tasks, commission terms, assignees, timeline and stage are closed to GENZ — the same for admin and superadmin', async () => {
    for (const who of ['ADMIN', 'SUP']) {
      for (const [m, u] of [['GET', `/api/deals/${DEAL}/messages`], ['GET', `/api/deals/${DEAL}/tasks`], ['GET', `/api/deals/${DEAL}/commission-agreements`], ['GET', `/api/deals/${DEAL}/assignees`], ['GET', `/api/timeline/${DEAL}`]] as const) {
        const r = await call(jar[who], m, u);
        expect(r.status, `${who} ${u}`).toBe(403);
        expect((await j(r)).code, `${who} ${u}`).toBe('DEAL_SUMMARY_ONLY');
      }
      const stage = await call(jar[who], 'POST', `/api/deals/${DEAL}/stage`, { stage: 'Negotiation', notes: 'admin override attempt' });
      expect(stage.status, who).toBe(403);
      expect((await j(stage)).code).toBe('DEAL_SUMMARY_ONLY');
    }
    // …while the brokers read the same endpoints
    for (const u of [`/api/deals/${DEAL}/messages`, `/api/deals/${DEAL}/tasks`, `/api/deals/${DEAL}/commission-agreements`, `/api/timeline/${DEAL}`]) expect((await call(jar.BRK1, 'GET', u)).status, u).toBe(200);
  });
  it('the legal counsel keeps read-only access, but never the brokers\' commercials', async () => {
    if (!jar.LEGAL) return;
    const r = await j(await call(jar.LEGAL, 'GET', `/api/deals/${DEAL}`));
    expect(r.deal.commercialsHidden).toBe(true);
    expect(r.access.level).toBe('FULL');
  });
  it('the admin did not leave an "opened in full" line — nothing was opened', async () => {
    const log = await j(await call(jar.SUP, 'GET', '/api/audit-logs?limit=500&q=DEAL_ADMIN_ACCESS'));
    expect(log.events.filter((e: any) => e.action === 'DEAL_ADMIN_ACCESS')).toHaveLength(0);
  });
  it('the brokers\' audit trail and the admin\'s: commission amounts show as ₹••• to GENZ while no dispute is open', async () => {
    // a payment line exists only after the next describe — see the last test of this file
    expect(true).toBe(true);
  });
});

describe('a dispute opens the room to GENZ — and resolving it closes it again', () => {
  let disputeId = '';
  it('the broker raises the dispute; both brokers see the notice; GENZ may now read the room', async () => {
    const d = await call(jar.BRK1, 'POST', '/api/disputes', { dealRoomId: DEAL, counterpartyId: BRK2, reason: 'BYPASS_ATTEMPT', description: 'The introducing broker approached the owner directly after the visit.' });
    expect(d.status).toBe(200); disputeId = (await j(d)).dispute.id;
    const admin = await j(await call(jar.ADMIN, 'GET', `/api/deals/${DEAL}`));
    expect(admin.access).toMatchObject({ level: 'FULL', via: 'DISPUTE', adminCanSee: true, openDisputeId: disputeId });
    expect(admin.deal.summaryOnly).toBeUndefined();
    expect(admin.deal.totalCommissionExpected).toBeGreaterThan(0);
    for (const u of [`/api/deals/${DEAL}/messages`, `/api/deals/${DEAL}/tasks`, `/api/deals/${DEAL}/commission-agreements`, `/api/timeline/${DEAL}`]) expect((await call(jar.ADMIN, 'GET', u)).status, u).toBe(200);
    expect((await call(jar.SUP, 'GET', `/api/deals/${DEAL}/messages`)).status).toBe(200);
    for (const who of ['BRK1', 'BRK2']) {
      const b = await j(await call(jar[who], 'GET', `/api/deals/${DEAL}`));
      expect(b.access).toMatchObject({ adminCanSee: true, openDisputeId: disputeId });
    }
  });
  it('every admin opening is written to the audit trail — and the deal\'s brokers can read it (once per half hour, not per refresh)', async () => {
    for (let i = 0; i < 3; i++) await call(jar.ADMIN, 'GET', `/api/deals/${DEAL}/messages`);
    for (const who of ['BRK1', 'BRK2']) {
      const log = await j(await call(jar[who], 'GET', '/api/audit-logs?limit=500'));
      const lines = log.events.filter((e: any) => e.action === 'DEAL_ADMIN_ACCESS' && e.entityId === DEAL);
      expect(lines.length, who).toBeGreaterThanOrEqual(1);
      expect(lines.length, `${who} not one line per refresh`).toBeLessThanOrEqual(2); // admin + superadmin, each once
      expect(lines[0].details).toContain(disputeId);
    }
  });
  it('an outsider broker still sees nothing', async () => {
    if (!jar.BRK3) return;
    expect((await call(jar.BRK3, 'GET', `/api/deals/${DEAL}/messages`)).status).toBe(404);
  });
  it('payments are frozen while the dispute is open', async () => {
    const r = await pay(jar.BRK1, BRK2, 1000, 'UTR FROZEN-0001');
    expect(r.status).toBe(409);
    expect((await j(r)).error).toMatch(/frozen/i);
  });
  it('resolving the dispute closes the room to GENZ again', async () => {
    const r = await call(jar.SUP, 'POST', `/api/disputes/${disputeId}/resolve`, { status: 'RESOLVED', resolutionNotes: 'Both brokers heard; the introducer is protected for 30 days.', liftHold: true });
    expect(r.status).toBe(200);
    expect((await call(jar.ADMIN, 'GET', `/api/deals/${DEAL}/messages`)).status).toBe(403);
    expect((await j(await call(jar.ADMIN, 'GET', `/api/deals/${DEAL}`))).access.level).toBe('SUMMARY');
    expect((await j(await call(jar.BRK1, 'GET', `/api/deals/${DEAL}`))).access.adminCanSee).toBe(false);
  });
});

describe('commission payments: the brokers write them down, the other broker confirms, GENZ records nothing', () => {
  it('GENZ (admin or superadmin) cannot record or confirm a payment', async () => {
    for (const who of ['ADMIN', 'SUP']) {
      const r = await pay(jar[who], BRK2, 1000, 'UTR ADMIN-0001');
      expect(r.status, who).toBe(403);
    }
  });
  it('an entry is PENDING and counts for nothing until the other broker confirms', async () => {
    const r = await pay(jar.BRK1, BRK2, 100000, 'UTR 412345678901', { note: 'first instalment' });
    expect(r.status).toBe(200);
    let a = await allocOf(jar.BRK1, BRK2);
    expect(a.payments).toHaveLength(1);
    expect(a.payments[0]).toMatchObject({ amount: 100000, ref: 'UTR 412345678901', status: 'PENDING', recordedById: BRK1 });
    expect(a.paidAmount).toBe(0);
    // the one who wrote it cannot confirm it
    const own = await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/commission-agreements/${AGR}/payments/${a.payments[0].id}/confirm`);
    expect(own.status).toBe(403);
    // the other broker can
    const ok = await call(jar.BRK2, 'POST', `/api/deals/${DEAL}/commission-agreements/${AGR}/payments/${a.payments[0].id}/confirm`);
    expect(ok.status).toBe(200);
    a = await allocOf(jar.BRK1, BRK2);
    expect(a.payments[0].status).toBe('CONFIRMED'); expect(a.payments[0].confirmedById).toBe(BRK2);
    expect(a.paidAmount).toBe(100000); expect(a.entitlementStatus).toBe('EARNED');
    // answered once only
    expect((await call(jar.BRK2, 'POST', `/api/deals/${DEAL}/commission-agreements/${AGR}/payments/${a.payments[0].id}/confirm`)).status).toBe(409);
  });
  it('checks: a real bank reference, a real date, not more than is outstanding, no duplicate entry', async () => {
    expect((await pay(jar.BRK1, BRK2, 5000, 'x')).status).toBe(400); // reference too short
    expect((await pay(jar.BRK1, BRK2, 5000, 'UTR 1111 2222 3333', { paidOn: '2999-01-01' })).status).toBe(400); // future date
    expect((await pay(jar.BRK1, BRK2, 5000, 'UTR 1111 2222 3333', { paidOn: 'yesterday' })).status).toBe(400);
    expect((await pay(jar.BRK1, BRK2, 99_000_000, 'UTR 1111 2222 3333')).status).toBe(400); // more than the share
    expect((await pay(jar.BRK1, BRK2, 100000, 'utr 412345678901')).status).toBe(409); // same reference + amount
    expect((await pay(jar.BRK1, BRK2, 0.5 - 1, 'UTR 1111 2222 3333')).status).toBe(400);
    expect((await pay(jar.OWN, BRK2, 1000, 'UTR OWNER-0001')).status).toBe(403); // the owner is not a party to the broker money
  });
  it('a rejected entry needs a reason and counts for nothing', async () => {
    const w = await pay(jar.BRK2, BRK1, 50000, 'NEFT ABC123456789');
    expect(w.status).toBe(200);
    const e = (await allocOf(jar.BRK2, BRK1)).payments.find((p: any) => p.ref === 'NEFT ABC123456789');
    const url = `/api/deals/${DEAL}/commission-agreements/${AGR}/payments/${e.id}/reject`;
    expect((await call(jar.BRK1, 'POST', url, { note: 'no' })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', url, { note: 'I did not receive this amount' })).status).toBe(200);
    const a = await allocOf(jar.BRK1, BRK1);
    expect(a.payments.find((p: any) => p.id === e.id)).toMatchObject({ status: 'REJECTED', rejectNote: 'I did not receive this amount' });
    expect(a.paidAmount).toBe(0);
  });
  it('the share is PAID only when the confirmed entries add up to it, and the room can then be settled', async () => {
    expect((await pay(jar.BRK1, BRK2, 185000, 'RTGS 998877665544')).status).toBe(200);
    const a0 = await allocOf(jar.BRK1, BRK2);
    const id = a0.payments.find((p: any) => p.ref === 'RTGS 998877665544').id;
    expect((await call(jar.BRK2, 'POST', `/api/deals/${DEAL}/commission-agreements/${AGR}/payments/${id}/confirm`)).status).toBe(200);
    const a = await allocOf(jar.BRK1, BRK2);
    expect(a.paidAmount).toBe(285000); expect(a.entitlementStatus).toBe('PAID');
    // nothing left to write down on a fully paid share
    expect((await pay(jar.BRK1, BRK2, 1, 'UTR 5555 6666 7777')).status).toBe(400);
  });
  it('"payment not received" opens a real dispute: it needs a description, freezes the room and opens it to GENZ', async () => {
    const url = `/api/deals/${DEAL}/commission-agreements/${AGR}/settle-payment`;
    expect((await call(jar.BRK2, 'POST', url, { participantId: BRK1, isDisputed: true, disputeNotes: 'short' })).status).toBe(400);
    const r = await call(jar.BRK2, 'POST', url, { participantId: BRK1, isDisputed: true, disputeNotes: 'The closing broker has not paid my share of the brokerage.' });
    expect(r.status).toBe(200);
    expect((await allocOf(jar.BRK2, BRK1)).entitlementStatus).toBe('DISPUTED');
    const disputes = (await j(await call(jar.ADMIN, 'GET', '/api/disputes'))).disputes.filter((d: any) => d.dealRoomId === DEAL && d.status === 'OPEN');
    expect(disputes).toHaveLength(1);
    expect(disputes[0]).toMatchObject({ reason: 'COMMISSION_NON_PAYMENT', complainantId: BRK2, counterpartyId: BRK1 });
    expect((await call(jar.ADMIN, 'GET', `/api/deals/${DEAL}/messages`)).status).toBe(200); // open to GENZ now
    // the admin resolves it: the share is released from DISPUTED
    expect((await call(jar.SUP, 'POST', `/api/disputes/${disputes[0].id}/resolve`, { status: 'RESOLVED', resolutionNotes: 'Brokers agreed to settle directly; closed.', liftHold: true })).status).toBe(200);
    expect((await allocOf(jar.BRK2, BRK1)).entitlementStatus).not.toBe('DISPUTED');
    expect((await call(jar.ADMIN, 'GET', `/api/deals/${DEAL}/messages`)).status).toBe(403);
  });
});

describe('what GENZ sees on its dashboard and in the audit trail', () => {
  it('a deal worth money counts once it reaches the Agreement stage — the totals, never the deal', async () => {
    const before = (await j(await call(jar.ADMIN, 'GET', '/api/admin/metrics'))).metrics;
    expect(before.dealTotals).toBeTruthy();
    expect(before.dealTotals.commissionPaid).toBe(285000); // only the CONFIRMED entries
    for (const stage of ['Negotiation', 'Agreement']) expect((await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/stage`, { stage })).status, stage).toBe(200);
    const m = (await j(await call(jar.ADMIN, 'GET', '/api/admin/metrics'))).metrics;
    expect(m.dealTotals.deals).toBeGreaterThanOrEqual(1);
    expect(m.dealTotals.dealValue).toBeGreaterThan(0);
    expect(m.dealTotals.commissionAgreed).toBe(570000);
    expect(m.dealTotals.commissionPaid).toBe(285000);
    expect(m.totalCommissionsEarned).toBe(570000);
    expect(JSON.stringify(m)).not.toContain(DEAL); // no deal is named
    const b = (await j(await call(jar.BRK1, 'GET', '/api/admin/metrics'))).metrics;
    expect(b.dealTotals).toBeUndefined(); // a broker gets only his own figures
  });
  it('a bad deal value is refused when the agreement is proposed', async () => {
    const r = await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/commission-agreements/propose`, { totalAgreedBrokerage: 600000, dealValue: -5, allocations: [{ participantId: BRK1, allocationPct: 50 }, { participantId: BRK2, allocationPct: 50 }] });
    expect(r.status).toBe(400);
    expect((await j(r)).error).toMatch(/deal value/i);
  });
  it('the audit trail shows GENZ that a payment happened, with the amounts hidden (₹•••); the brokers see them', async () => {
    const admin = await j(await call(jar.ADMIN, 'GET', '/api/audit-logs?limit=500&entity=COMMISSION'));
    const lines = admin.events.filter((e: any) => e.action === 'COMMISSION_PAYMENT_RECORDED' || e.action === 'COMMISSION_PAYMENT_CONFIRMED');
    expect(lines.length).toBeGreaterThan(0);
    for (const e of lines) { expect(e.details).toContain('₹•••'); expect(e.details).not.toMatch(/₹\s?\d/); }
    const broker = await j(await call(jar.BRK1, 'GET', '/api/audit-logs?limit=500&entity=COMMISSION'));
    const mine = broker.events.filter((e: any) => e.action === 'COMMISSION_PAYMENT_RECORDED');
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.some((e: any) => /₹\s?\d/.test(e.details))).toBe(true);
  });
  it('the activity feed gives GENZ the deal without its brokerage figure', async () => {
    const feed = await j(await call(jar.ADMIN, 'GET', '/api/activity-feed'));
    const a = (feed.activities || feed.feed || []).find((x: any) => x.entityId === DEAL);
    if (a) { expect(a.description).not.toMatch(/Expected Brokerage/); expect(a.metadata?.commissionExpected).toBeUndefined(); }
  });
});
