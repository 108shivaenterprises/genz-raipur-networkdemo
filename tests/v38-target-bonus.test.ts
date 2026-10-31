import { freePort } from './helpers/port';
/** v38 — Target Bonus: target by the partner's own deadline, extra % above target, early-finish bonus; frozen terms; payouts */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { computeTarget, partnerPeriod, validateTargetScheme, DEFAULT_TARGET_SCHEME, type TargetBonusScheme } from '../src/shared/targetBonus';

const DAY = 86_400_000;
const T0 = Date.parse('2026-10-01T00:00:00.000Z');
const at = (d: number) => new Date(T0 + d * DAY).toISOString();
const S: TargetBonusScheme = { enabled: true, periodDays: 60, qualifyCollectionPct: 10, hit: { kind: 'EXTRA_PCT', value: 0.5 }, overPct: 0.25, early: { kind: 'LUMP_SUM', value: 20000, withinPct: 50 } };
const P = { mandateId: 'M1', associateId: 'B1', target: 3, start: at(0), deadline: '2026-11-29' };
const bk = (d: number, v = 1_000_000, c = 10, m = 'M1') => ({ mandateId: m, agreementValue: v, approvedAt: at(d), collectedPct: c });

describe('target bonus rules', () => {
  it('pays hit + over + early when the target is reached early', () => {
    const r = computeTarget(S, P, [bk(3), bk(10), bk(20), bk(40, 2_000_000)], 0, T0 + 45 * DAY);
    expect(r.state).toBe('ACHIEVED'); expect(r.early).toBe(true); expect(r.units).toBe(4); expect(r.overUnits).toBe(1);
    expect(r.hitAmount).toBe(Math.round(5_000_000 * 0.5 / 100));
    expect(r.overAmount).toBe(Math.round(2_000_000 * 0.25 / 100));
    expect(r.earlyAmount).toBe(20000);
    expect(r.earned).toBe(r.hitAmount + r.overAmount + r.earlyAmount);
    expect(r.payable).toBe(r.earned);
  });
  it('no early bonus after the early window, nothing before the target, bookings outside the period or below collection do not count', () => {
    const late = computeTarget(S, P, [bk(3), bk(10), bk(40)], 0, T0 + 50 * DAY);
    expect(late.state).toBe('ACHIEVED'); expect(late.early).toBe(false); expect(late.earlyAmount).toBe(0); expect(late.hitAmount).toBeGreaterThan(0);
    const short = computeTarget(S, P, [bk(3), bk(10), bk(20, 1_000_000, 5), bk(-2), bk(70)], 0, T0 + 20 * DAY);
    expect(short.units).toBe(2); expect(short.state).toBe('IN_PROGRESS'); expect(short.earned).toBe(0); expect(short.unitsToGo).toBe(1);
    expect(short.potential.hit).toBeGreaterThan(0); expect(short.potential.early).toBe(20000);
    expect(computeTarget(S, P, [bk(3)], 0, T0 + 70 * DAY).state).toBe('MISSED');
    expect(computeTarget(S, { ...P, target: 0 }, [bk(3)], 0, T0).state).toBe('NO_TARGET');
  });
  it('a cancelled booking (no longer passed in) lowers the earning and shows as over-paid', () => {
    const r = computeTarget(S, P, [bk(3), bk(10)], 30000, T0 + 30 * DAY);
    expect(r.earned).toBe(0); expect(r.overpaid).toBe(30000); expect(r.payable).toBe(0);
  });
  it('period defaults to start + periodDays; validation limits', () => {
    expect(partnerPeriod(S, { assignedAt: at(0), targetUnitsQuota: 4 }).deadline).toBe('2026-11-30');
    expect(partnerPeriod(S, { assignedAt: at(0), decidedAt: at(5), targetUnitsQuota: 4, targetBy: '2026-12-31' }).deadline).toBe('2026-12-31');
    expect(validateTargetScheme(S)).toBeNull();
    expect(validateTargetScheme({ ...S, periodDays: 3 })).toBeTruthy();
    expect(validateTargetScheme({ ...S, hit: { kind: 'EXTRA_PCT', value: 9 } })).toBeTruthy();
    expect(DEFAULT_TARGET_SCHEME(0.75).early?.value).toBe(0.75);
  });
});

// ───────────── API ─────────────
const ROOT = path.resolve(__dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v38-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BLD: 'USR-BUILDER-001', BLD2: 'USR-BUILDER-002', BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', OWN: 'USR-OWNER-001', SUP: 'USR-SUPERADMIN' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const PROJ = 'PROJ-RAI-02'; const MAND = 'MAND-RAI-03';
const scheme = { enabled: true, periodDays: 90, qualifyCollectionPct: 10, hit: { kind: 'EXTRA_PCT', value: 0.5 }, overPct: 0.25, early: { kind: 'EXTRA_PCT', value: 0.3, withinPct: 50 }, note: 'Diwali target push' };
const tb = async (who: string) => { const r = await call(jar[who], 'GET', '/api/crm/target-bonus'); expect(r.status, who).toBe(200); return r.json(); };
const row = async (who: string) => (await tb(who)).projects.find((p: any) => p.projectId === PROJ)?.rows.find((x: any) => x.mandateId === MAND);

describe('target bonus API', () => {
  it('only builders, partner brokers and admins; brokers see nothing until a scheme is on', async () => {
    expect((await call(undefined, 'GET', '/api/crm/target-bonus')).status).toBe(401);
    expect((await call(jar.OWN, 'GET', '/api/crm/target-bonus')).status).toBe(403);
    expect((await tb('BRK1')).projects).toEqual([]);
    const b = await tb('BLD'); expect(b.canManage).toBe(true); expect(b.projects.some((p: any) => p.projectId === PROJ && p.scheme === null)).toBe(true);
  });

  it('the builder sets the scheme (validated, own projects only); the early-bird % follows it', async () => {
    expect((await call(jar.BLD, 'PUT', `/api/crm/projects/${PROJ}/target-bonus`, { ...scheme, periodDays: 3 })).status).toBe(400);
    expect((await call(jar.BLD, 'PUT', `/api/crm/projects/${PROJ}/target-bonus`, { ...scheme, overPct: 9 })).status).toBe(400);
    expect((await call(jar.BRK1, 'PUT', `/api/crm/projects/${PROJ}/target-bonus`, scheme)).status).toBe(403);
    expect((await call(jar.BLD2, 'PUT', `/api/crm/projects/${PROJ}/target-bonus`, scheme)).status).toBe(404);
    const r = await call(jar.BLD, 'PUT', `/api/crm/projects/${PROJ}/target-bonus`, scheme); expect(r.status).toBe(200);
    const p = (await tb('BLD')).projects.find((x: any) => x.projectId === PROJ);
    expect(p.scheme.hit.value).toBe(0.5); expect(p.earlyBirdPct).toBe(0.3);
    // the partner broker now sees exactly his own row; another broker does not see him
    const mine = (await tb('BRK1')).projects.find((x: any) => x.projectId === PROJ);
    expect(mine.rows.length).toBeGreaterThan(0); expect(mine.rows.every((x: any) => x.associateId === 'USR-BRK-001')).toBe(true);
    for (const pr of (await tb('BRK2')).projects) for (const x of pr.rows) expect(x.associateId).toBe('USR-BRK-002');
  });

  it('per-partner target + deadline; nothing to pay before the target', async () => {
    expect((await call(jar.BLD, 'PUT', `/api/crm/projects/${PROJ}/target-bonus/partners/${MAND}`, { target: 1, deadline: '2020-01-01' })).status).toBe(400);
    expect((await call(jar.BLD, 'PUT', `/api/crm/projects/${PROJ}/target-bonus/partners/${MAND}`, { target: 0 })).status).toBe(400);
    expect((await call(jar.BRK1, 'PUT', `/api/crm/projects/${PROJ}/target-bonus/partners/${MAND}`, { target: 1 })).status).toBe(403);
    const r = await call(jar.BLD, 'PUT', `/api/crm/projects/${PROJ}/target-bonus/partners/${MAND}`, { target: 1, deadline: '' }); expect(r.status).toBe(200);
    const x = await row('BLD'); expect(x.target).toBe(1); expect(x.state).toBe('IN_PROGRESS'); expect(x.earned).toBe(0);
    expect((await call(jar.BLD, 'POST', `/api/crm/projects/${PROJ}/target-bonus/pay`, { mandateId: MAND, amount: 1000, reference: 'UTR12345' })).status).toBe(400);
  });

  it('an approved booking with the minimum collection reaches the target early → hit + early-bird; terms freeze; payout recorded', async () => {
    const bookings = await (await call(jar.BLD, 'GET', '/api/crm/bookings')).json();
    const bkg = (bookings.bookings || bookings).find((b: any) => b.mandateId === MAND && b.status === 'REQUESTED');
    expect(bkg, 'demo booking').toBeTruthy();
    const d = await call(jar.BLD, 'POST', `/api/crm/bookings/${bkg.id}/decision`, { decision: 'APPROVE', note: 'ok' });
    expect(d.status, await d.clone().text()).toBe(200);
    const after = await (await call(jar.BLD, 'GET', '/api/crm/bookings')).json();
    const ab = (after.bookings || after).find((b: any) => b.id === bkg.id);
    const first = ab.paymentSchedule[0];
    expect((await call(jar.BLD, 'POST', `/api/crm/bookings/${bkg.id}/payments/${first.id}/receive`, { receiptNo: 'RCPT-77', mode: 'UPI' })).status).toBe(200);

    const x = await row('BLD');
    expect(x.state).toBe('ACHIEVED'); expect(x.early).toBe(true); expect(x.units).toBe(1);
    expect(x.hitAmount).toBe(Math.round(ab.agreementValue * 0.5 / 100));
    expect(x.earlyAmount).toBe(Math.round(ab.agreementValue * 0.3 / 100));
    expect(x.locked).toBe(true);

    // frozen: his target can no longer be changed, and a new scheme does not touch him
    const lock = await call(jar.BLD, 'PUT', `/api/crm/projects/${PROJ}/target-bonus/partners/${MAND}`, { target: 5 });
    expect(lock.status).toBe(409); expect((await lock.json()).code).toBe('TARGET_LOCKED');
    expect((await call(jar.BLD, 'PUT', `/api/crm/projects/${PROJ}/target-bonus`, { ...scheme, hit: { kind: 'EXTRA_PCT', value: 0.1 }, early: null })).status).toBe(200);
    const y = await row('BLD'); expect(y.earned).toBe(x.earned);

    // payout
    expect((await call(jar.BLD, 'POST', `/api/crm/projects/${PROJ}/target-bonus/pay`, { mandateId: MAND, amount: x.payable, reference: 'x' })).status).toBe(400);
    expect((await call(jar.BLD, 'POST', `/api/crm/projects/${PROJ}/target-bonus/pay`, { mandateId: MAND, amount: x.payable + 1, reference: 'UTR998877' })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', `/api/crm/projects/${PROJ}/target-bonus/pay`, { mandateId: MAND, amount: x.payable, reference: 'UTR998877' })).status).toBe(403);
    const pay = await call(jar.BLD, 'POST', `/api/crm/projects/${PROJ}/target-bonus/pay`, { mandateId: MAND, amount: x.payable, reference: 'UTR998877' });
    expect(pay.status).toBe(200); expect((await pay.json()).payout.breakdown.early).toBe(x.earlyAmount);
    expect((await row('BLD')).payable).toBe(0);
    const br = (await tb('BRK1')).projects.find((p: any) => p.projectId === PROJ);
    expect(br.rows.find((r: any) => r.mandateId === MAND).paid).toBe(x.payable); expect(br.payouts.length).toBe(1);
    expect((await tb('BRK2')).projects.flatMap((p: any) => p.payouts).some((p: any) => p.mandateId === MAND)).toBe(false);
  });
});
