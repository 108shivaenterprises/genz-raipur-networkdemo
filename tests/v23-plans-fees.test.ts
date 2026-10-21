import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { payerSegmentOf, pickRule, ruleFee, benefitFee, computeFee, ruleWarnings, planWarnings, describeRule, type FeeRule, type Plan } from '../src/shared/billingRules';
import { ROLE_PERMISSIONS } from '../server/permissions';
import { PERMISSION_HI } from '../src/lib/permHi';

/** v23 — Plans & Fees: GENZ admins decide fee rules (flat / %, per group / state / person), plans, member-only features. */
const PORT = 5300 + Math.floor(Math.random() * 90);
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
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const DEAL = 'DEAL-2026-001'; const AGR = 'AGR-DEAL-2026-001-V1';

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v23-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  const sup = cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN')?.id;
  for (const [k, id] of Object.entries({ SUP: sup, ADMIN: 'USR-ADMIN-1', BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', OWN: 'USR-OWNER-001', L1: 'USR-LEGAL-001', BLD: 'USR-BUILDER-001' })) jar[k] = await login(id as string);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const T = '2026-10-01T00:00:00.000Z';
const base = { states: [] as string[], includeUserIds: [] as string[], excludeUserIds: [] as string[], active: true, effectiveFrom: '2026-01-01T00:00:00.000Z', createdAt: T, createdBy: 'x', updatedAt: T, updatedBy: 'x', history: [] };
const rule = (x: Partial<FeeRule>): FeeRule => ({ ...base, id: 'R', event: 'BUILDER_BOOKING', segments: ['BUILDER'], mode: 'PERCENT', value: 1, ...x } as FeeRule);
const plan = (x: Partial<Plan>): Plan => ({ ...base, id: 'P', name: 'P', segments: ['BUILDER'], fees: {}, features: [], ...x } as Plan);
const B1 = { userId: 'B1', segment: 'BUILDER' as const, state: 'Chhattisgarh' };

describe('rules (pure)', () => {
  it('every person falls in one group (or none)', () => {
    expect(payerSegmentOf({ role: 'DEVELOPER_BUILDER' })).toBe('BUILDER');
    expect(payerSegmentOf({ role: 'BROKER', reraNumber: 'CG/1/2020', tier: 'TIER1' }, 6)).toBe('BROKER_BIG_FIRM');
    expect(payerSegmentOf({ role: 'BROKER', reraNumber: 'CG/1/2020', tier: 'TIER1' }, 1)).toBe('BROKER_INDEPENDENT');
    expect(payerSegmentOf({ role: 'BROKER', tier: 'TIER2' }, 9)).toBe('BROKER_LOCAL'); // staff never lifts a local associate
    expect(payerSegmentOf({ role: 'LEGAL_COUNSEL' })).toBe('LEGAL_COUNSEL');
    expect(payerSegmentOf({ role: 'CONTRACTOR' })).toBe('CONTRACTOR');
    expect(payerSegmentOf({ role: 'PROPERTY_OWNER' })).toBeNull();
    expect(payerSegmentOf({ role: 'BUYER_TENANT' })).toBeNull();
  });
  it('% with min / max; flat is flat', () => {
    expect(ruleFee({ mode: 'PERCENT', value: 1, minFee: 1000, maxFee: 25000 }, 8_200_000)).toBe(25000);
    expect(ruleFee({ mode: 'PERCENT', value: 1, minFee: 1000, maxFee: 25000 }, 50_000)).toBe(1000);
    expect(ruleFee({ mode: 'PERCENT', value: 0.5 }, 1_000_000)).toBe(5000);
    expect(ruleFee({ mode: 'FLAT', value: 999 }, 123)).toBe(999);
  });
  it('the most specific rule wins: a person, then a state, then the group; future rules wait; excluded people pay nothing', () => {
    const general = rule({ id: 'G', value: 1 }); const cg = rule({ id: 'S', value: 0.5, states: ['Chhattisgarh'] }); const one = rule({ id: 'P', value: 0.2, includeUserIds: ['B1'] });
    expect(pickRule([general, cg, one], 'BUILDER_BOOKING', B1, T)!.id).toBe('P');
    expect(pickRule([general, cg], 'BUILDER_BOOKING', B1, T)!.id).toBe('S');
    expect(pickRule([general, cg], 'BUILDER_BOOKING', { ...B1, state: 'Gujarat' }, T)!.id).toBe('G');
    expect(pickRule([rule({ effectiveFrom: '2027-01-01T00:00:00.000Z' })], 'BUILDER_BOOKING', B1, T)).toBeNull();
    expect(pickRule([rule({ excludeUserIds: ['B1'] })], 'BUILDER_BOOKING', B1, T)).toBeNull();
    expect(pickRule([rule({ active: false })], 'BUILDER_BOOKING', B1, T)).toBeNull();
    expect(pickRule([rule({ segments: ['BROKER_INDEPENDENT'], event: 'BROKER_DEAL' })], 'BUILDER_BOOKING', B1, T)).toBeNull();
  });
  it('members: free, flat, %, or a discount — and never more than the normal fee', () => {
    expect(benefitFee({ type: 'FREE', value: 0 }, 900, 1000)).toBe(0);
    expect(benefitFee({ type: 'DISCOUNT_PCT', value: 50 }, 900, 1000)).toBe(450);
    expect(benefitFee({ type: 'PERCENT', value: 10 }, 900, 1000)).toBe(100);
    const r = [rule({ mode: 'FLAT', value: 1000 })];
    expect(computeFee(r, plan({ fees: { BUILDER_BOOKING: { type: 'FLAT', value: 5000 } } }), 'BUILDER_BOOKING', B1, 0, T).fee).toBe(1000); // capped at normal
    expect(computeFee(r, plan({ fees: { BUILDER_BOOKING: { type: 'FREE', value: 0 } } }), 'BUILDER_BOOKING', B1, 0, T).fee).toBe(0);
    expect(computeFee([], plan({ fees: { BUILDER_BOOKING: { type: 'FLAT', value: 5000 } } }), 'BUILDER_BOOKING', B1, 0, T).fee).toBe(0); // no rule → no charge, even with a plan
  });
  it('warnings for the risky choices', () => {
    expect(ruleWarnings({ event: 'LEGAL_CASE', mode: 'PERCENT', active: true })).toEqual(['BAR_COUNCIL']);
    expect(ruleWarnings({ event: 'LEGAL_CASE', mode: 'FLAT', active: true })).toEqual([]);
    expect(ruleWarnings({ event: 'BROKER_DEAL', mode: 'PERCENT', active: true })).toEqual(['BROKER_FREE_PROMISE', 'DEAL_PRIVACY']);
    expect(planWarnings({ segments: ['BROKER_INDEPENDENT'], fees: {}, active: true, monthly: 499 })).toEqual(['BROKER_FREE_PROMISE']);
    expect(planWarnings({ segments: ['BROKER_INDEPENDENT'], fees: {}, active: true, monthly: 0 })).toEqual([]); // a free plan promises nothing new
    expect(describeRule({ event: 'BUILDER_BOOKING', mode: 'PERCENT', value: 1, minFee: 1000, maxFee: 25000 })).toBe('1% of the booking (agreement) value (min ₹1,000, max ₹25,000)');
  });
  it('permissions: admins and the superadmin manage; payers see their own; owners and buyers are never billed', () => {
    expect(ROLE_PERMISSIONS.ADMIN).toContain('billing:manage'); expect(ROLE_PERMISSIONS.SUPERADMIN).toContain('billing:manage');
    for (const r of ['BROKER', 'DEVELOPER_BUILDER', 'LEGAL_COUNSEL', 'CONTRACTOR'] as const) { expect(ROLE_PERMISSIONS[r]).toContain('billing:self'); expect(ROLE_PERMISSIONS[r]).not.toContain('billing:manage'); }
    for (const r of ['PROPERTY_OWNER', 'BUYER_TENANT', 'TEAM_MEMBER', 'GENZ_CONNECTOR'] as const) expect(ROLE_PERMISSIONS[r]).not.toContain('billing:self');
    for (const k of ['billing:manage', 'billing:self']) expect(PERMISSION_HI[k], k).toBeTruthy();
  });
});

describe('admins set the rules; nobody else can', () => {
  const body = { event: 'BUILDER_BOOKING', mode: 'PERCENT', value: 1, minFee: 1000, maxFee: 25000, segments: ['BUILDER'], active: true };
  it('payers cannot touch rules, plans or the ledger', async () => {
    for (const who of ['BRK1', 'L1', 'BLD', 'OWN']) {
      expect((await call(jar[who], 'POST', '/api/billing/rules', body)).status, who).toBe(403);
      expect((await call(jar[who], 'GET', '/api/billing/catalog')).status, who).toBe(403);
    }
    expect((await call(jar.OWN, 'GET', '/api/billing/me')).status).toBe(403);
  });
  it('checks: % ≤ 100, min ≤ max, the event’s own payers, no start in the past, min/max only for %', async () => {
    expect((await call(jar.ADMIN, 'POST', '/api/billing/rules', { ...body, value: 120 })).status).toBe(400);
    expect((await call(jar.ADMIN, 'POST', '/api/billing/rules', { ...body, minFee: 5000, maxFee: 100 })).status).toBe(400);
    expect((await call(jar.ADMIN, 'POST', '/api/billing/rules', { ...body, segments: ['BROKER_INDEPENDENT'] })).status).toBe(400);
    expect((await call(jar.ADMIN, 'POST', '/api/billing/rules', { ...body, effectiveFrom: '2020-01-01' })).status).toBe(400);
    expect((await call(jar.ADMIN, 'POST', '/api/billing/rules', { ...body, mode: 'FLAT', value: 500 })).status).toBe(400);
    expect((await call(jar.ADMIN, 'POST', '/api/billing/rules', { ...body, excludeUserIds: ['USR-NOBODY'] })).status).toBe(400);
  });
  it('the admin creates a builder booking fee: 1%, min ₹1,000, max ₹25,000 — audited', async () => {
    const r = await call(jar.ADMIN, 'POST', '/api/billing/rules', body); expect(r.status).toBe(200);
    const cat = await j(await call(jar.SUP, 'GET', '/api/billing/catalog'));
    expect(cat.rules.some((x: any) => x.event === 'BUILDER_BOOKING' && x.text.en === '1% of the booking (agreement) value (min ₹1,000, max ₹25,000)')).toBe(true);
    const log = await j(await call(jar.SUP, 'GET', '/api/audit-logs?limit=300&q=GENZ_FEE_RULE_CREATED')); expect(log.events.length).toBeGreaterThan(0);
  });
  it('the builder sees the fee before any booking; the calculator agrees', async () => {
    const me = await j(await call(jar.BLD, 'GET', '/api/billing/me'));
    expect(me.segment).toBe('BUILDER'); expect(me.rules.find((x: any) => x.event === 'BUILDER_BOOKING').rule.en).toMatch(/1% of the booking/);
    const pv = await j(await call(jar.ADMIN, 'POST', '/api/billing/preview', { event: 'BUILDER_BOOKING', base: 8_200_000, userId: 'USR-BUILDER-001' }));
    expect(pv.fee).toBe(25000);
    const badge = await j(await call(jar.BLD, 'GET', '/api/billing/badge')); expect(badge.relevant).toBe(true);
  });
  it('broker-side rules need the warnings to be accepted', async () => {
    const deal = { event: 'BROKER_DEAL', mode: 'PERCENT', value: 2, segments: ['BROKER_INDEPENDENT', 'BROKER_BIG_FIRM', 'BROKER_LOCAL'], active: true };
    const r = await call(jar.ADMIN, 'POST', '/api/billing/rules', deal); expect(r.status).toBe(409);
    expect((await j(r)).warnings).toEqual(['BROKER_FREE_PROMISE', 'DEAL_PRIVACY']);
    expect((await call(jar.ADMIN, 'POST', '/api/billing/rules', { ...deal, acknowledge: ['BROKER_FREE_PROMISE', 'DEAL_PRIVACY'] })).status).toBe(200);
    const legalPct = { event: 'LEGAL_CASE', mode: 'PERCENT', value: 10, segments: ['LEGAL_COUNSEL'], active: false };
    expect((await j(await call(jar.ADMIN, 'POST', '/api/billing/rules', legalPct))).warnings).toEqual(['BAR_COUNCIL']);
  });
});

describe('charges happen at the event, frozen at that moment', () => {
  it('approving a network booking charges the builder (capped at the max); a second approval cannot double it', async () => {
    const r = await call(jar.BLD, 'POST', '/api/crm/bookings/CRM-B-0001/decision', { decision: 'APPROVE' });
    expect(r.status).toBe(200);
    const me = await j(await call(jar.BLD, 'GET', '/api/billing/me'));
    const fee = me.ledger.filter((e: any) => e.event === 'BUILDER_BOOKING' && e.refId === 'CRM-B-0001');
    expect(fee).toHaveLength(1);
    expect(fee[0]).toMatchObject({ kind: 'CHARGE', amount: 25000, base: 8_200_000, status: 'DUE' });
    expect(fee[0].calc).toMatchObject({ mode: 'PERCENT', value: 1, maxFee: 25000 });
  });
  it('changing the rule later does not touch that charge', async () => {
    const cat = await j(await call(jar.ADMIN, 'GET', '/api/billing/catalog')); const rr = cat.rules.find((x: any) => x.event === 'BUILDER_BOOKING');
    expect((await call(jar.ADMIN, 'PUT', `/api/billing/rules/${rr.id}`, { event: 'BUILDER_BOOKING', mode: 'FLAT', value: 2000, segments: ['BUILDER'], active: true })).status).toBe(200);
    const me = await j(await call(jar.BLD, 'GET', '/api/billing/me'));
    expect(me.ledger.find((e: any) => e.refId === 'CRM-B-0001').amount).toBe(25000);
  });
  it('a confirmed broker-to-broker commission payment charges the broker who received it — GENZ never sees the deal or the amount', async () => {
    const w = await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/commission-agreements/${AGR}/settle-payment`, { participantId: 'USR-BRK-002', paidDelta: 100000, ref: 'UTR 777788889999', paidOn: today });
    expect(w.status).toBe(200);
    const a = (await j(await call(jar.BRK1, 'GET', `/api/deals/${DEAL}/commission-agreements`))).agreements.find((x: any) => x.id === AGR).allocations.find((x: any) => x.participantId === 'USR-BRK-002');
    const pid = a.payments.at(-1).id;
    expect((await call(jar.BRK2, 'POST', `/api/deals/${DEAL}/commission-agreements/${AGR}/payments/${pid}/confirm`)).status).toBe(200);
    const mine = await j(await call(jar.BRK2, 'GET', '/api/billing/me'));
    const fee = mine.ledger.find((e: any) => e.event === 'BROKER_DEAL');
    expect(fee).toMatchObject({ amount: 2000, base: 100000, dealId: DEAL }); // the broker sees his own figures
    const admin = await j(await call(jar.ADMIN, 'GET', '/api/billing/ledger'));
    const seen = admin.entries.find((e: any) => e.id === fee.id);
    expect(seen.hidden).toBe(true); expect(seen.base).toBeUndefined(); expect(seen.dealId).toBeUndefined(); expect(seen.refId).toBeUndefined();
    expect(JSON.stringify(seen)).not.toContain(DEAL);
    expect((await call(jar.ADMIN, 'GET', `/api/deals/${DEAL}/messages`)).status).toBe(403); // v21 still holds
  });
  it('cancelling the booking cancels the unpaid charge', async () => {
    const r = await call(jar.BLD, 'POST', '/api/crm/bookings/CRM-B-0001/cancel', { reason: 'Customer withdrew before agreement' });
    expect(r.status).toBe(200);
    const me = await j(await call(jar.BLD, 'GET', '/api/billing/me'));
    expect(me.ledger.find((e: any) => e.refId === 'CRM-B-0001')).toMatchObject({ status: 'CANCELLED' });
  });
});

describe('plans, members and member-only features', () => {
  let planId = '';
  it('an admin builds a plan for RERA brokers: legal help + early launch access, deal fee halved', async () => {
    const body = { name: 'Independent Pro', segments: ['BROKER_INDEPENDENT', 'BROKER_BIG_FIRM'], monthly: 499, yearly: 4999, fees: { BROKER_DEAL: { type: 'DISCOUNT_PCT', value: 50 } }, features: ['LEGAL_REQUEST', 'LAUNCH_EARLY'], active: true };
    const r1 = await call(jar.ADMIN, 'POST', '/api/billing/plans', body); expect(r1.status).toBe(409); // paid broker plan → accept the "free for brokers" warning
    const r = await call(jar.ADMIN, 'POST', '/api/billing/plans', { ...body, acknowledge: ['BROKER_FREE_PROMISE'] }); expect(r.status).toBe(200);
    planId = (await j(r)).plan.id;
    expect((await call(jar.ADMIN, 'POST', '/api/billing/plans', { ...body, name: 'x', acknowledge: ['BROKER_FREE_PROMISE'] })).status).toBe(400);
    expect((await call(jar.ADMIN, 'POST', '/api/billing/plans', { ...body, features: ['LEGAL_CLAIM'], acknowledge: ['BROKER_FREE_PROMISE'] })).status).toBe(400); // a counsellor feature in a broker plan
  });
  it('reserving legal help for members blocks a non-member broker — with a clear message', async () => {
    const cat = await j(await call(jar.ADMIN, 'GET', '/api/billing/catalog'));
    const gates = cat.gates.map((g: any) => g.key === 'LEGAL_REQUEST' ? { ...g, membersOnly: true } : g);
    expect((await call(jar.ADMIN, 'PUT', '/api/billing/gates', { gates })).status).toBe(200);
    const r = await call(jar.BRK1, 'POST', '/api/legal/requests', { dealId: DEAL, helpType: 'TITLE_CHECK', description: 'Please check the title of this plot.' });
    expect(r.status).toBe(403); const b = await j(r); expect(b.code).toBe('MEMBERS_ONLY'); expect(b.error).toMatch(/Independent Pro/);
    const ctx = await j(await call(jar.BRK1, 'GET', `/api/legal/context?dealId=${DEAL}`)); expect(ctx.membersOnly).toBeTruthy();
  });
  it('the broker takes the plan, pays outside, GENZ confirms — now he can ask, and his deal fee is halved', async () => {
    const me0 = await j(await call(jar.BRK1, 'GET', '/api/billing/me'));
    expect(['BROKER_INDEPENDENT', 'BROKER_BIG_FIRM']).toContain(me0.segment);
    expect(me0.plans.some((p: any) => p.id === planId)).toBe(true);
    const buy = await j(await call(jar.BRK1, 'POST', '/api/billing/me/buy', { planId, period: 'MONTHLY' }));
    expect(buy.entry).toMatchObject({ amount: 499, status: 'DUE' });
    expect((await call(jar.BRK1, 'POST', `/api/billing/ledger/${buy.entry.id}/mark-paid`, { ref: 'UPI 1234567890AB' })).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/billing/ledger/${buy.entry.id}/confirm`)).status).toBe(403);
    expect((await call(jar.ADMIN, 'POST', `/api/billing/ledger/${buy.entry.id}/confirm`)).status).toBe(200);
    const me = await j(await call(jar.BRK1, 'GET', '/api/billing/me')); expect(me.membership.planId).toBe(planId);
    expect(me.rules.find((r: any) => r.event === 'BROKER_DEAL').member.en).toMatch(/50% off/);
    expect((await call(jar.BRK1, 'POST', '/api/legal/requests', { dealId: DEAL, helpType: 'TITLE_CHECK', description: 'Please check the title of this plot.' })).status).toBe(200);
  });
  it('an admin can give a membership free and end it early', async () => {
    const g = await call(jar.ADMIN, 'POST', '/api/billing/members/grant', { userId: 'USR-LEGAL-001', planId: 'PLAN-LEGAL', months: 3, note: 'Pilot counsellor for Raipur' });
    expect(g.status).toBe(200); const e = (await j(g)).entry; expect(e).toMatchObject({ amount: 0, comp: true, status: 'WAIVED' });
    expect((await j(await call(jar.L1, 'GET', '/api/billing/me'))).membership.planId).toBe('PLAN-LEGAL');
    expect((await call(jar.ADMIN, 'POST', '/api/billing/members/grant', { userId: 'USR-BUILDER-001', planId: 'PLAN-LEGAL', months: 1, note: 'wrong group test' })).status).toBe(400);
    expect((await call(jar.ADMIN, 'POST', `/api/billing/members/${e.id}/end`, { note: 'Pilot over' })).status).toBe(200);
    expect((await j(await call(jar.L1, 'GET', '/api/billing/me'))).membership).toBeNull();
  });
  it('a gate cannot be switched on for a feature no open plan contains', async () => {
    const cat = await j(await call(jar.ADMIN, 'GET', '/api/billing/catalog'));
    // close every plan that has LEGAL_CLAIM, then try to reserve it
    const legal = cat.plans.find((p: any) => p.id === 'PLAN-LEGAL');
    expect((await call(jar.ADMIN, 'PUT', '/api/billing/plans/PLAN-LEGAL', { ...legal, features: [], acknowledge: [] })).status).toBe(200);
    const gates = cat.gates.map((g: any) => g.key === 'LEGAL_CLAIM' ? { ...g, membersOnly: true } : g);
    expect((await call(jar.ADMIN, 'PUT', '/api/billing/gates', { gates })).status).toBe(400);
  });
});

describe('who pays GENZ, and how', () => {
  it('only the payer marks paid; a reference is used once; only GENZ staff confirm, reject or waive', async () => {
    const me = await j(await call(jar.BRK2, 'GET', '/api/billing/me'));
    const fee = me.ledger.find((e: any) => e.event === 'BROKER_DEAL');
    expect((await call(jar.BRK1, 'POST', `/api/billing/ledger/${fee.id}/mark-paid`, { ref: 'UTR 555566667777' })).status).toBe(404);
    expect((await call(jar.BRK2, 'POST', `/api/billing/ledger/${fee.id}/mark-paid`, { ref: 'UPI 1234567890AB' })).status).toBe(409); // already used above
    expect((await call(jar.BRK2, 'POST', `/api/billing/ledger/${fee.id}/mark-paid`, { ref: 'UTR 555566667777' })).status).toBe(200);
    expect((await call(jar.ADMIN, 'POST', `/api/billing/ledger/${fee.id}/reject`, { note: 'Not in the bank statement' })).status).toBe(200);
    expect((await call(jar.SUP, 'POST', `/api/billing/ledger/${fee.id}/waive`, { note: 'Goodwill — first deal' })).status).toBe(200);
    const after = await j(await call(jar.BRK2, 'GET', '/api/billing/me'));
    expect(after.ledger.find((e: any) => e.id === fee.id).status).toBe('WAIVED');
  });
  it('a broker who owes nothing and has no plan or rule sees no tab', async () => {
    const cat = await j(await call(jar.ADMIN, 'GET', '/api/billing/catalog'));
    for (const r of cat.rules.filter((x: any) => x.event === 'BROKER_DEAL')) await call(jar.ADMIN, 'PUT', `/api/billing/rules/${r.id}`, { ...r, active: false, acknowledge: [] });
    // BRK2 still has a (waived) ledger line, so his tab stays; a fresh owner-less view is checked with the contractor
    const c = cfg.demoAccounts.find((a: any) => a.role === 'CONTRACTOR');
    if (!c) return;
    const cj = await login(c.id);
    expect((await j(await call(cj, 'GET', '/api/billing/badge'))).relevant).toBe(false);
  });
});
