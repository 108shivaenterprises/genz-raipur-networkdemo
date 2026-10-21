import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  trailActions, holderOf, holderName, holderTotals, builderNeedsNote, cleanNewTrail, closeOpenTrails, reservedOn, openTrailOn, trailFlags, isOpenTrail,
  startStatus, routeOf, OPEN_STATUS, stepperOf, type MoneyTrail, type TrailActor,
} from '../src/shared/moneyTrail';
import { DEFAULT_POLICY, cleanPolicy } from '../src/shared/pcontrolRules';
import { ROLE_PERMISSIONS, memberPermissions } from '../server/permissions';
import { PERMISSION_HI } from '../src/lib/permHi';

/** v16.9 "Money Trail": collector → partner confirms → partner hands over → builder's authorised person confirms. GENZ moves no money. */
const PORT = 5100 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const email = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id).email;
async function login(who: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: who, password: cfg.demoPassword }) });
  expect(r.status, who).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const PROJ = 'PROJ-RAI-02';
let AV = 0; let UNIT = 0;
const unit = () => `V169-${++UNIT}`;
const TEAM = { POOJA: 'USR-TEAM-001', RAKESH: 'USR-TEAM-002', KOMAL: 'USR-TEAM-005' };
const M = '/api/crm/money';

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v169-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' },
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  expect(cfg).toBeTruthy();
  jar.B1 = await login(email('USR-BRK-001')); jar.B2 = await login(email('USR-BRK-002'));
  jar.BUILDER = await login(email('USR-BUILDER-001')); jar.BUILDER2 = await login(email('USR-BUILDER-002'));
  jar.SUP = await login(cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').email);
  jar.POOJA = await login('9000030001'); jar.RAKESH = await login('9000030002'); jar.KOMAL = await login('9000030005');
  const proj = (await j(await call(jar.BUILDER, 'GET', '/api/builder/projects'))).projects.find((p: any) => p.id === PROJ);
  AV = proj.priceStartingFrom;
}, 90_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

const mkLead = async (name: string, cookie = jar.B1) => {
  const r = await call(cookie, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name, phone: rnd(), source: 'WALK_IN' });
  expect(r.status, await r.clone().text()).toBe(200);
  return (await j(r)).lead;
};
const stageTo = async (id: string, stages: string[], cookie = jar.B1) => { for (const stage of stages) { const r = await call(cookie, 'POST', `/api/crm/leads/${id}/stage`, { stage }); expect(r.status, await r.clone().text()).toBe(200); } };
const visited = ['CONTACTED', 'SITE_VISIT_SCHEDULED', 'SITE_VISITED'];
const allot = (leadId: string, memberId: string | null, cookie = jar.B1) => call(cookie, 'POST', '/api/team/allot/lead', { leadId, memberId });
const policy = (memberId: string, body: any, cookie = jar.B1) => call(cookie, 'PUT', `/api/pcontrol/team/${memberId}/policy`, body);
const bookingOf = async (id: string) => (await j(await call(jar.BUILDER, 'GET', '/api/crm/bookings'))).bookings.find((b: any) => b.id === id);
/** a booking with a claimed booking amount, approved by the builder (amount NOT yet confirmed) and the lead allotted to Pooja */
async function approvedBooking(name: string, token = 50000) {
  const l = await mkLead(name); await stageTo(l.id, visited); expect((await allot(l.id, TEAM.POOJA)).status).toBe(200);
  const r = await call(jar.B1, 'POST', `/api/crm/leads/${l.id}/booking-request`, { unitNo: unit(), agreementValue: AV, tokenAmount: token, tokenMode: 'CHEQUE', tokenRef: 'CHQ-998877' });
  expect(r.status, await r.clone().text()).toBe(200); const b = (await j(r)).booking;
  const ap = await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b.id}/decision`, { decision: 'APPROVE' }); expect(ap.status, await ap.clone().text()).toBe(200);
  return { lead: l, booking: (await j(ap)).booking };
}
const collect = (cookie: string, body: any) => call(cookie, 'POST', `${M}/trails`, body);

// ───────────────────────── pure rules ─────────────────────────
const actor = (side: TrailActor['side'], id: string, canCollect = true, canConfirm = true): TrailActor => ({ id, side, canCollect, canConfirm });
const trail = (over: Partial<MoneyTrail> = {}): MoneyTrail => ({
  id: 'TR-1', bookingId: 'CRM-B-1', target: 'TOKEN', targetName: 'Booking amount', amount: 50000, mode: 'CHEQUE', ref: 'CHQ-1',
  collector: { id: 'STAFF', name: 'Pooja', side: 'CP_STAFF' }, route: 'CP', status: 'WITH_COLLECTOR', steps: [], createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...over,
});

describe('pure rules', () => {
  it('who holds the money at each stage', () => {
    expect(holderOf(trail({ status: 'WITH_COLLECTOR' }))).toBe('COLLECTOR');
    expect(holderOf(trail({ status: 'WITH_CP' }))).toBe('CP');
    expect(holderOf(trail({ status: 'HANDED_OVER' }))).toBe('BUILDER_PENDING');
    expect(holderOf(trail({ status: 'CONFIRMED' }))).toBe('BUILDER');
    expect(holderOf(trail({ status: 'CANCELLED' }))).toBe('NONE');
    expect(holderOf(trail({ status: 'DISPUTED' }))).toBe('COLLECTOR'); // the partner says he never got it
    expect(holderOf(trail({ status: 'NOT_RECEIVED' }))).toBe('CP'); // the builder says it never came: it stays with the last person who confirmed having it
    expect(holderOf(trail({ status: 'NOT_RECEIVED', route: 'BUILDER' }))).toBe('COLLECTOR');
    expect(holderName(trail({ status: 'WITH_COLLECTOR' }), 'Brk', 'Bld')).toBe('Pooja');
    expect(holderName(trail({ status: 'WITH_CP' }), 'Brk', 'Bld')).toBe('Brk');
    expect(holderName(trail({ status: 'CONFIRMED' }), 'Brk', 'Bld')).toBe('Bld');
  });
  it('routes and starting points: a partner collecting himself already holds it; his employee does not', () => {
    expect(startStatus('CP_OWNER')).toBe('WITH_CP'); expect(startStatus('CP_STAFF')).toBe('WITH_COLLECTOR'); expect(startStatus('BUILDER_STAFF')).toBe('WITH_COLLECTOR'); expect(startStatus('BUILDER_OWNER')).toBe('WITH_COLLECTOR');
    expect(routeOf('CP_OWNER')).toBe('CP'); expect(routeOf('CP_STAFF')).toBe('CP'); expect(routeOf('BUILDER_STAFF')).toBe('BUILDER'); expect(routeOf('BUILDER_OWNER')).toBe('BUILDER');
  });
  it('actions: partner confirms his employee’s money, never his own; hand-over only from the partner; the builder confirms last', () => {
    const t = trail();
    expect(trailActions(t, actor('CP_OWNER', 'CP')).cpConfirm).toBe(true);
    expect(trailActions(t, actor('CP_OWNER', 'CP')).handover).toBe(false); // not before he confirmed receiving it
    expect(trailActions(t, actor('CP_STAFF', 'STAFF')).cpConfirm).toBe(false); // the collector never confirms his own money
    expect(trailActions(t, actor('CP_STAFF', 'ACC', true, true)).cpConfirm).toBe(true); // an authorised colleague may
    expect(trailActions(t, actor('CP_STAFF', 'ACC2', true, false)).cpConfirm).toBe(false); // an unauthorised colleague may not
    expect(trailActions(t, actor('BUILDER_OWNER', 'BLD')).cpConfirm).toBe(false);
    const w = trail({ status: 'WITH_CP' });
    expect(trailActions(w, actor('CP_OWNER', 'CP')).handover).toBe(true); expect(trailActions(w, actor('CP_STAFF', 'ACC', true, true)).handover).toBe(true); expect(trailActions(w, actor('CP_STAFF', 'ACC2', true, false)).handover).toBe(false);
    expect(trailActions(w, actor('BUILDER_OWNER', 'BLD')).handover).toBe(false);
    const h = trail({ status: 'HANDED_OVER' });
    expect(trailActions(h, actor('BUILDER_OWNER', 'BLD')).builderConfirm).toBe(true); expect(trailActions(h, actor('BUILDER_STAFF', 'ACC', true, true)).builderConfirm).toBe(true);
    expect(trailActions(h, actor('BUILDER_STAFF', 'ACC', true, false)).builderConfirm).toBe(false); expect(trailActions(h, actor('CP_OWNER', 'CP')).builderConfirm).toBe(false);
    const bc = trail({ route: 'BUILDER', status: 'WITH_COLLECTOR', collector: { id: 'BSTAFF', name: 'Komal', side: 'BUILDER_STAFF' } });
    expect(trailActions(bc, actor('BUILDER_STAFF', 'BSTAFF', true, true)).builderConfirm).toBe(false); // not his own
    expect(trailActions(bc, actor('BUILDER_OWNER', 'BLD')).builderConfirm).toBe(true); expect(trailActions(bc, actor('BUILDER_OWNER', 'BLD')).cpConfirm).toBe(false);
    expect(trailActions(t, null)).toEqual({ cpConfirm: false, handover: false, builderConfirm: false, cancel: false });
    expect(trailActions(t, actor(null, 'ADMIN'))).toEqual({ cpConfirm: false, handover: false, builderConfirm: false, cancel: false });
    expect(trailActions(trail({ status: 'CONFIRMED' }), actor('BUILDER_OWNER', 'BLD')).cancel).toBe(false); expect(trailActions(trail({ status: 'CANCELLED' }), actor('CP_OWNER', 'CP')).builderConfirm).toBe(false);
  });
  it('cancel: the collector his own early entry, the partner before hand-over, the builder side any time until settled', () => {
    expect(trailActions(trail(), actor('CP_STAFF', 'STAFF')).cancel).toBe(true);
    expect(trailActions(trail({ status: 'WITH_CP' }), actor('CP_STAFF', 'STAFF', true, false)).cancel).toBe(false); // the collector can no longer pull it back once the partner holds it
    expect(trailActions(trail({ status: 'HANDED_OVER' }), actor('CP_OWNER', 'CP')).cancel).toBe(false); // once handed over only the builder side can close it
    expect(trailActions(trail({ status: 'HANDED_OVER' }), actor('BUILDER_OWNER', 'BLD')).cancel).toBe(true);
    expect(trailActions(trail({ status: 'NOT_RECEIVED' }), actor('CP_OWNER', 'CP')).cancel).toBe(true);
  });
  it('the builder needs a reason to say "not received", or to confirm money that has not been handed over yet', () => {
    expect(builderNeedsNote(trail({ status: 'HANDED_OVER' }), true)).toBe(false); expect(builderNeedsNote(trail({ status: 'HANDED_OVER' }), false)).toBe(true);
    expect(builderNeedsNote(trail({ status: 'WITH_CP' }), true)).toBe(true); expect(builderNeedsNote(trail({ status: 'WITH_COLLECTOR' }), true)).toBe(true);
    expect(builderNeedsNote(trail({ route: 'BUILDER', status: 'WITH_COLLECTOR' }), true)).toBe(false); // the builder's own people: there is no hand-over step
  });
  it('input: amount, mode, reference (cash may go without one), date not in the future', () => {
    const ok = cleanNewTrail({ target: 'TOKEN', amount: '50000', mode: 'CHEQUE', ref: ' CHQ-1 ', paidOn: '2026-10-01', note: ' hi ' }); expect('ok' in ok && ok.ok).toMatchObject({ target: 'TOKEN', amount: 50000, mode: 'CHEQUE', ref: 'CHQ-1', note: 'hi' });
    expect('ok' in cleanNewTrail({ target: 'M1', amount: 1000, mode: 'CASH' })).toBe(true);
    for (const bad of [{ amount: 0 }, { amount: -5 }, { amount: 'x' }, { amount: 1e11 }, { mode: 'WIRE' }, { mode: 'CHEQUE', ref: 'ab' }, { mode: 'UPI', ref: '' }, { target: '' }, { paidOn: new Date(Date.now() + 5 * 86400000).toISOString() }, { paidOn: 'nonsense' }, { ref: 'x'.repeat(41), mode: 'UPI' }]) {
      expect('error' in cleanNewTrail({ target: 'TOKEN', amount: 1000, mode: 'CASH', ...bad }), JSON.stringify(bad)).toBe(true);
    }
  });
  it('totals per holder (cancelled ignored); open money on a target is reserved; alert buckets by age', () => {
    const rows = [trail({ id: 'a', status: 'WITH_COLLECTOR', amount: 100 }), trail({ id: 'b', status: 'WITH_CP', amount: 200 }), trail({ id: 'c', status: 'HANDED_OVER', amount: 300 }), trail({ id: 'd', status: 'CONFIRMED', amount: 400 }), trail({ id: 'e', status: 'CANCELLED', amount: 999 })];
    const tt = holderTotals(rows); expect(tt.COLLECTOR).toEqual({ count: 1, amount: 100 }); expect(tt.CP).toEqual({ count: 1, amount: 200 }); expect(tt.BUILDER_PENDING).toEqual({ count: 1, amount: 300 }); expect(tt.BUILDER).toEqual({ count: 1, amount: 400 }); expect(tt.NONE.count).toBe(0);
    expect(reservedOn(rows, 'TOKEN')).toBe(600); expect(reservedOn(rows, 'M2')).toBe(0); expect(openTrailOn(rows, 'TOKEN')?.id).toBe('a'); expect(OPEN_STATUS.every(s => isOpenTrail({ status: s }))).toBe(true);
    const old = new Date(Date.now() - 3 * 86400000).toISOString(); const fresh = new Date().toISOString();
    const f = trailFlags([trail({ id: 'o1', status: 'WITH_COLLECTOR', updatedAt: old }), trail({ id: 'n1', status: 'WITH_COLLECTOR', updatedAt: fresh }), trail({ id: 'o2', status: 'HANDED_OVER', updatedAt: old }), trail({ id: 's1', status: 'DISPUTED', updatedAt: fresh })]);
    expect(f.withTeam.map(x => x.id)).toEqual(['o1']); expect(f.awaitingBuilder.map(x => x.id)).toEqual(['o2']); expect(f.stuck.map(x => x.id)).toEqual(['s1']);
  });
  it('the stepper: four boxes on the partner route, two on the builder’s own; the current one is highlighted and a stuck stage is marked', () => {
    const st = (t: MoneyTrail) => stepperOf(t).map(s => `${s.key}:${s.state}`).join(' ');
    expect(st(trail({ status: 'WITH_COLLECTOR' }))).toBe('COLLECTED:done CP:current HANDOVER:todo BUILDER:todo');
    expect(st(trail({ status: 'WITH_CP' }))).toBe('COLLECTED:done CP:done HANDOVER:current BUILDER:todo');
    expect(st(trail({ status: 'HANDED_OVER' }))).toBe('COLLECTED:done CP:done HANDOVER:done BUILDER:current');
    expect(st(trail({ status: 'CONFIRMED' }))).toBe('COLLECTED:done CP:done HANDOVER:done BUILDER:done');
    expect(st(trail({ status: 'DISPUTED' }))).toBe('COLLECTED:done CP:bad HANDOVER:todo BUILDER:todo');
    expect(st(trail({ status: 'NOT_RECEIVED' }))).toBe('COLLECTED:done CP:done HANDOVER:done BUILDER:bad');
    expect(st(trail({ status: 'CANCELLED' }))).toBe('COLLECTED:done CP:todo HANDOVER:todo BUILDER:todo');
    expect(st(trail({ route: 'BUILDER', status: 'WITH_COLLECTOR', collector: { id: 'K', name: 'Komal', side: 'BUILDER_STAFF' } }))).toBe('COLLECTED:done BUILDER:current');
    expect(st(trail({ status: 'WITH_CP', collector: { id: 'P', name: 'Partner', side: 'CP_OWNER' } }))).toBe('COLLECTED:done CP:done HANDOVER:current BUILDER:todo');
  });
  it('a cancelled or rejected booking closes every open entry, with a reason, and leaves settled ones alone', () => {
    const ts = [trail({ id: 'a' }), trail({ id: 'b', status: 'HANDED_OVER' }), trail({ id: 'c', status: 'CONFIRMED' })];
    expect(closeOpenTrails(ts, { id: 'BLD', name: 'Builder', side: 'BUILDER_OWNER' }, 'Booking cancelled')).toBe(2);
    expect(ts.map(x => x.status)).toEqual(['CANCELLED', 'CANCELLED', 'CONFIRMED']); expect(ts[0].steps[0]).toMatchObject({ stage: 'CANCELLED', note: 'Booking cancelled' });
  });
  it('employee switches: both OFF by default, only true / false accepted; permissions exist for partner, builder and employee, with a Hindi line each', () => {
    expect(DEFAULT_POLICY.canCollectMoney).toBe(false); expect(DEFAULT_POLICY.canConfirmMoney).toBe(false);
    const on = cleanPolicy({ canCollectMoney: true, canConfirmMoney: true }, DEFAULT_POLICY); expect(typeof on).toBe('object'); expect((on as any).canCollectMoney).toBe(true);
    expect(typeof cleanPolicy({ canCollectMoney: 'yes' }, DEFAULT_POLICY)).toBe('string'); expect(typeof cleanPolicy({ canConfirmMoney: 1 }, DEFAULT_POLICY)).toBe('string');
    for (const p of ['crm:money_collect', 'crm:money_confirm'] as const) {
      expect(ROLE_PERMISSIONS.BROKER).toContain(p); expect(ROLE_PERMISSIONS.DEVELOPER_BUILDER).toContain(p); expect(ROLE_PERMISSIONS.TEAM_MEMBER).toContain(p);
      for (const e of ['BROKER', 'DEVELOPER_BUILDER'] as const) expect(memberPermissions(e)).toContain(p);
      expect(memberPermissions('CONTRACTOR')).not.toContain(p); expect(ROLE_PERMISSIONS.ADMIN).not.toContain(p); expect(ROLE_PERMISSIONS.PROPERTY_OWNER).not.toContain(p);
      expect(/[ऀ-ॿ]/.test(PERMISSION_HI[p]), p).toBe(true);
    }
  });
});

// ───────────────────────── the whole chain, over HTTP ─────────────────────────
describe('collector → partner → builder', () => {
  let ctx: { lead: any; booking: any }; let tid = '';
  it('an employee cannot record money until the partner switches it on; the switch itself must be a real boolean', async () => {
    ctx = await approvedBooking('Chain Customer');
    const body = { bookingId: ctx.booking.id, target: 'TOKEN', amount: 50000, mode: 'CHEQUE', ref: 'CHQ-998877' };
    const r = await collect(jar.POOJA, body); expect(r.status).toBe(403); expect((await j(r)).code).toBe('MONEY_NOT_ALLOWED');
    expect((await policy(TEAM.POOJA, { canCollectMoney: 'yes' })).status).toBe(400);
    expect((await policy(TEAM.POOJA, { canCollectMoney: true })).status).toBe(200);
    const g = await j(await call(jar.POOJA, 'GET', `${M}/trails`)); expect(g.canCollect).toBe(true); expect(g.canConfirm).toBe(false); expect(g.rows).toEqual([]);
    const ov = await j(await call(jar.POOJA, 'GET', '/api/crm/overview')); expect(ov.overview.moneyTrail).toEqual({ collect: true, confirm: false });
  });
  it('only the employee who works with the customer can record it; a stranger gets nothing', async () => {
    const body = { bookingId: ctx.booking.id, target: 'TOKEN', amount: 50000, mode: 'CHEQUE', ref: 'CHQ-998877' };
    expect((await policy(TEAM.RAKESH, { canCollectMoney: true })).status).toBe(200); // switched on, but the lead is not his
    expect((await collect(jar.RAKESH, body)).status).toBe(403);
    for (const c of [jar.B2, jar.BUILDER2]) expect((await collect(c, body)).status).toBe(404);
    expect((await collect(jar.SUP, body)).status).toBe(403); // the platform only watches
    const cl = await j(await call(jar.POOJA, 'GET', `${M}/collectables`)); const row = cl.bookings.find((x: any) => x.bookingId === ctx.booking.id);
    expect(row.targets[0]).toMatchObject({ target: 'TOKEN', amount: 50000, fixed: true }); expect(row.targets.length).toBeGreaterThan(1);
    expect(JSON.stringify(cl)).not.toMatch(/brokerage|agreementValue/i);
    expect((await call(jar.RAKESH, 'GET', `${M}/collectables`).then(j)).bookings.some((x: any) => x.bookingId === ctx.booking.id)).toBe(false);
  });
  it('step 1 — the team member records the cheque he took: it is WITH HIM, and the ledger has not moved', async () => {
    expect((await collect(jar.POOJA, { bookingId: ctx.booking.id, target: 'TOKEN', amount: 49999, mode: 'CHEQUE', ref: 'CHQ-998877' })).status).toBe(400); // the claimed amount, exactly
    expect((await collect(jar.POOJA, { bookingId: ctx.booking.id, target: 'TOKEN', amount: 50000, mode: 'CHEQUE' })).status).toBe(400); // a cheque needs its number
    const r = await collect(jar.POOJA, { bookingId: ctx.booking.id, target: 'TOKEN', amount: 50000, mode: 'CHEQUE', ref: 'CHQ-998877', note: 'collected at the site office' });
    expect(r.status, await r.clone().text()).toBe(200); const t = (await j(r)).trail; tid = t.id;
    expect(t).toMatchObject({ status: 'WITH_COLLECTOR', route: 'CP', holder: { kind: 'COLLECTOR', name: 'Pooja Nayak' }, collector: { id: TEAM.POOJA } });
    expect(t.steps.map((s: any) => s.stage)).toEqual(['COLLECTED']); expect(t.can).toEqual({ cpConfirm: false, handover: false, builderConfirm: false, cancel: true });
    expect((await collect(jar.POOJA, { bookingId: ctx.booking.id, target: 'TOKEN', amount: 50000, mode: 'CHEQUE', ref: 'CHQ-998877' })).status).toBe(409); // one at a time
    const b = await bookingOf(ctx.booking.id); expect(b.token.status).toBe('CLAIMED'); expect(b.collectedAmount).toBe(0); expect(b.payableBrokerage).toBe(0);
    const back = (await j(await call(jar.POOJA, 'GET', `/api/crm/leads/${ctx.lead.id}`))).lead; expect(back.activities.some((a: any) => /collected by Pooja/.test(a.note))).toBe(true);
  });
  it('the other staff member cannot see it; the partner and the builder see it', async () => {
    expect((await call(jar.RAKESH, 'GET', `${M}/trails`).then(j)).rows).toEqual([]);
    expect((await call(jar.RAKESH, 'POST', `${M}/trails/${tid}/cancel`, { reason: 'not mine' })).status).toBe(404);
    for (const c of [jar.B1, jar.BUILDER]) { const g = await j(await call(c, 'GET', `${M}/trails`)); expect(g.rows.map((x: any) => x.id)).toContain(tid); }
    for (const c of [jar.B2, jar.BUILDER2]) expect((await call(c, 'GET', `${M}/trails`).then(j)).rows.some((x: any) => x.id === tid)).toBe(false);
    const sup = await j(await call(jar.SUP, 'GET', `${M}/trails`)); expect(sup.readOnly).toBe(true); expect(sup.rows.map((x: any) => x.id)).toContain(tid);
  });
  it('step 2 — only the partner (not the collector, not the builder) confirms he received it; "not received" needs a reason and parks it as disputed', async () => {
    expect((await call(jar.POOJA, 'POST', `${M}/trails/${tid}/cp-confirm`, { received: true })).status).toBe(403); // not his own money, and the switch is off
    expect((await call(jar.BUILDER, 'POST', `${M}/trails/${tid}/cp-confirm`, { received: true })).status).toBe(403);
    expect((await call(jar.B1, 'POST', `${M}/trails/${tid}/cp-confirm`, {})).status).toBe(400);
    expect((await call(jar.B1, 'POST', `${M}/trails/${tid}/cp-confirm`, { received: false })).status).toBe(400); // why?
    const d = (await j(await call(jar.B1, 'POST', `${M}/trails/${tid}/cp-confirm`, { received: false, note: 'Pooja has not given it to me yet' }))).trail; expect(d.status).toBe('DISPUTED'); expect(d.holder.kind).toBe('COLLECTOR');
    const al = (await j(await call(jar.B1, 'GET', '/api/crm/alerts'))).alerts; expect(al.some((a: any) => a.kind === 'MONEY_STUCK')).toBe(true);
    const ok = (await j(await call(jar.B1, 'POST', `${M}/trails/${tid}/cp-confirm`, { received: true }))).trail; // she brought it
    expect(ok).toMatchObject({ status: 'WITH_CP', holder: { kind: 'CP' } }); expect(ok.steps.map((s: any) => s.stage)).toEqual(['COLLECTED', 'CP_NOT_RECEIVED', 'CP_CONFIRMED']);
    expect((await call(jar.B1, 'POST', `${M}/trails/${tid}/cp-confirm`, { received: true })).status).toBe(409); // already done
  });
  it('the old direct routes step aside while the money is travelling, and the builder cannot skip ahead without saying why', async () => {
    const r = await call(jar.BUILDER, 'POST', `/api/crm/bookings/${ctx.booking.id}/token`, { received: true }); expect(r.status).toBe(409); expect((await j(r)).code).toBe('MONEY_TRAIL_OPEN');
    const skip = await call(jar.BUILDER, 'POST', `${M}/trails/${tid}/builder-confirm`, { received: true }); expect(skip.status).toBe(400); expect((await j(skip)).code).toBe('NOTE_REQUIRED');
    expect((await call(jar.B1, 'POST', `${M}/trails/${tid}/builder-confirm`, { received: true, note: 'sure' })).status).toBe(403); // the partner never confirms for the builder
  });
  it('step 3 — the partner hands it to the builder (how, with a reference); a stranger cannot; the employee cannot unless authorised', async () => {
    expect((await call(jar.POOJA, 'POST', `${M}/trails/${tid}/handover`, {})).status).toBe(403);
    expect((await call(jar.B1, 'POST', `${M}/trails/${tid}/handover`, { mode: 'WIRE', ref: 'x' })).status).toBe(400);
    expect((await call(jar.B1, 'POST', `${M}/trails/${tid}/handover`, { mode: 'NEFT_RTGS' })).status).toBe(400); // an NEFT hand-over needs its UTR
    const h = (await j(await call(jar.B1, 'POST', `${M}/trails/${tid}/handover`, { mode: 'NEFT_RTGS', ref: 'UTR-445566', note: 'sent from the office account' }))).trail;
    expect(h).toMatchObject({ status: 'HANDED_OVER', holder: { kind: 'BUILDER_PENDING' } }); expect(h.steps.at(-1)).toMatchObject({ stage: 'HANDED_OVER', mode: 'NEFT_RTGS', ref: 'UTR-445566' });
    const b = await bookingOf(ctx.booking.id); expect(b.token.status).toBe('CLAIMED'); expect(b.payableBrokerage).toBe(0); // still nothing in the ledger
    const al = (await j(await call(jar.BUILDER, 'GET', '/api/crm/alerts'))).alerts; expect(Array.isArray(al)).toBe(true);
  });
  it('step 4 — the builder’s employee cannot even see it until he is authorised; then he confirms: the ledger gets a receipt that points back to this trail', async () => {
    expect((await call(jar.KOMAL, 'GET', `${M}/trails`).then(j)).rows).toEqual([]);
    expect((await call(jar.KOMAL, 'POST', `${M}/trails/${tid}/builder-confirm`, { received: true })).status).toBe(404);
    expect((await policy(TEAM.KOMAL, { canConfirmMoney: true }, jar.BUILDER)).status).toBe(200);
    expect((await call(jar.KOMAL, 'GET', `${M}/trails`).then(j)).rows.map((x: any) => x.id)).toContain(tid);
    const r = await call(jar.KOMAL, 'POST', `${M}/trails/${tid}/builder-confirm`, { received: true, receiptNo: 'RCPT-2026-0042' }); expect(r.status, await r.clone().text()).toBe(200);
    const t = (await j(r)).trail; expect(t).toMatchObject({ status: 'CONFIRMED', holder: { kind: 'BUILDER' }, receiptNo: 'RCPT-2026-0042' });
    expect(t.steps.map((s: any) => s.stage)).toEqual(['COLLECTED', 'CP_NOT_RECEIVED', 'CP_CONFIRMED', 'HANDED_OVER', 'BUILDER_CONFIRMED']); expect(t.steps.at(-1).byName).toBe('Komal Sahu');
    const b = await bookingOf(ctx.booking.id);
    expect(b.token).toMatchObject({ status: 'RECEIVED', confirmedByName: 'Komal Sahu', mode: 'NEFT_RTGS', ref: 'UTR-445566' });
    expect(b.collectedAmount).toBe(50000); expect(b.payableBrokerage).toBeGreaterThan(0);
    const rc = b.paymentSchedule.flatMap((m: any) => m.receipts || []).filter((x: any) => x.trailId === tid); expect(rc.length).toBeGreaterThan(0); expect(rc[0]).toMatchObject({ mode: 'NEFT_RTGS', ref: 'RCPT-2026-0042', byName: 'Komal Sahu' });
    expect((await call(jar.BUILDER, 'POST', `${M}/trails/${tid}/builder-confirm`, { received: true })).status).toBe(409); // settled: nothing left to confirm
    expect((await call(jar.B1, 'POST', `${M}/trails/${tid}/cancel`, { reason: 'oops, wrong one' })).status).toBe(409);
  });
  it('an employee’s view never carries brokerage, agreement value or payouts', async () => {
    const g = await j(await call(jar.KOMAL, 'GET', `${M}/trails`)); const s = JSON.stringify(g);
    expect(s).not.toMatch(/brokerage|agreementValue|payout/i);
    const p = await j(await call(jar.POOJA, 'GET', `${M}/trails`)); expect(p.rows.map((x: any) => x.id)).toContain(tid); expect(JSON.stringify(p)).not.toMatch(/brokerage|agreementValue|payout/i);
  });
});

describe('instalments, the partner collecting himself, "not received", and the builder’s own people', () => {
  let ctx: { lead: any; booking: any }; let m2: any; let m3: any;
  it('an instalment can be collected only after approval, only up to what is pending', async () => {
    ctx = await approvedBooking('Instalment Customer', 20000);
    const sched = ctx.booking.paymentSchedule; m2 = sched[1]; m3 = sched[2];
    const base = { bookingId: ctx.booking.id, target: m2.id, mode: 'CASH' };
    expect((await collect(jar.B1, { ...base, amount: m2.amount + 1 })).status).toBe(400);
    expect((await collect(jar.B1, { ...base, target: 'NOPE', amount: 100 })).status).toBe(404);
    const half = Math.floor(m2.amount / 2);
    const t = await collect(jar.POOJA, { ...base, amount: half }); expect(t.status, await t.clone().text()).toBe(200);
    expect((await t.clone().json()).trail).toMatchObject({ status: 'WITH_COLLECTOR', targetName: m2.name, mode: 'CASH' });
    // the first half is now reserved: the rest of the instalment can still be recorded, but not more
    expect((await collect(jar.B1, { ...base, amount: m2.amount - half + 1 })).status).toBe(400);
    const rest = await collect(jar.B1, { ...base, amount: m2.amount - half }); expect(rest.status, await rest.clone().text()).toBe(200);
    for (const id of [(await t.json()).trail.id, (await rest.json()).trail.id]) expect((await call(jar.BUILDER, 'POST', `${M}/trails/${id}/cancel`, { reason: 'test cleanup' })).status).toBe(200);
  });
  it('a partner collecting by himself starts with the money, hands it over, the builder says "not received" (with a reason), the partner hands over again, and it is confirmed', async () => {
    const P3 = Math.floor(m3.amount / 2);
    const r = await collect(jar.B1, { bookingId: ctx.booking.id, target: m3.id, amount: P3, mode: 'UPI', ref: 'UPI-REF-8899' }); expect(r.status, await r.clone().text()).toBe(200);
    const t = (await j(r)).trail; expect(t).toMatchObject({ status: 'WITH_CP', route: 'CP', holder: { kind: 'CP' }, collector: { side: 'CP_OWNER' } });
    expect((await call(jar.B1, 'POST', `${M}/trails/${t.id}/cp-confirm`, { received: true })).status).toBe(403); // nothing to confirm: he is the partner
    expect((await call(jar.B1, 'POST', `${M}/trails/${t.id}/handover`, {})).status).toBe(200);
    expect((await call(jar.BUILDER, 'POST', `${M}/trails/${t.id}/builder-confirm`, { received: false })).status).toBe(400);
    const nr = (await j(await call(jar.BUILDER, 'POST', `${M}/trails/${t.id}/builder-confirm`, { received: false, note: 'not in our bank yet' }))).trail; expect(nr).toMatchObject({ status: 'NOT_RECEIVED', holder: { kind: 'CP' } });
    const al = (await j(await call(jar.BUILDER, 'GET', '/api/crm/alerts'))).alerts; expect(al.some((a: any) => a.kind === 'MONEY_STUCK')).toBe(true);
    // while it is stuck the old direct route stays blocked, so the same money cannot be counted twice
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${ctx.booking.id}/payments/${m3.id}/receive`, { receiptNo: 'RCPT-DIRECT', amount: P3, mode: 'UPI' })).status).toBe(409);
    expect((await call(jar.B1, 'POST', `${M}/trails/${t.id}/handover`, { mode: 'UPI', ref: 'UPI-REF-9911' })).status).toBe(200);
    const ok = await call(jar.BUILDER, 'POST', `${M}/trails/${t.id}/builder-confirm`, { received: true }); expect(ok.status, await ok.clone().text()).toBe(200);
    const b = await bookingOf(ctx.booking.id); const m = b.paymentSchedule.find((x: any) => x.id === m3.id);
    expect(m.paidAmount).toBe(P3); expect(m.receipts.at(-1)).toMatchObject({ amount: P3, mode: 'UPI', ref: 'UPI-REF-9911', trailId: t.id });
    // after it settled the direct route works again for what is left
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${ctx.booking.id}/payments/${m3.id}/receive`, { receiptNo: 'RCPT-DIRECT', amount: 1, mode: 'UPI' })).status).toBe(200);
  });
  it('the builder’s own employee collects: no partner stage; he cannot confirm his own money; the owner (or another authorised person) does', async () => {
    const m4 = ctx.booking.paymentSchedule[3];
    expect((await policy(TEAM.KOMAL, { canCollectMoney: true }, jar.BUILDER)).status).toBe(200); // Komal is already authorised to confirm (earlier test)
    const r = await collect(jar.KOMAL, { bookingId: ctx.booking.id, target: m4.id, amount: Math.floor(m4.amount / 3), mode: 'CHEQUE', ref: 'CHQ-BLD-1' }); expect(r.status, await r.clone().text()).toBe(200);
    const t = (await j(r)).trail; expect(t).toMatchObject({ status: 'WITH_COLLECTOR', route: 'BUILDER', collector: { side: 'BUILDER_STAFF' } });
    expect((await call(jar.B1, 'GET', `${M}/trails`).then(j)).rows.map((x: any) => x.id)).toContain(t.id); // the partner can see it too: it is his customer
    expect((await call(jar.B1, 'POST', `${M}/trails/${t.id}/cp-confirm`, { received: true })).status).toBe(409); // collected on the builder's side: no partner stage
    expect((await call(jar.KOMAL, 'POST', `${M}/trails/${t.id}/builder-confirm`, { received: true })).status).toBe(403); // not his own
    const ok = await call(jar.BUILDER, 'POST', `${M}/trails/${t.id}/builder-confirm`, { received: true }); expect(ok.status, await ok.clone().text()).toBe(200);
    expect((await j(ok)).trail).toMatchObject({ status: 'CONFIRMED', holder: { kind: 'BUILDER' } });
  });
  it('a cancelled entry can never be confirmed afterwards', async () => {
    const x = await approvedBooking('Race Customer', 10000);
    const m = x.booking.paymentSchedule[1];
    const r = await collect(jar.B1, { bookingId: x.booking.id, target: m.id, amount: m.amount, mode: 'CASH' }); const t = (await j(r)).trail;
    expect((await call(jar.B1, 'POST', `${M}/trails/${t.id}/handover`, {})).status).toBe(200);
    expect((await call(jar.BUILDER, 'POST', `${M}/trails/${t.id}/cancel`, { reason: 'wrong person' })).status).toBe(200);
    expect((await call(jar.BUILDER, 'POST', `${M}/trails/${t.id}/builder-confirm`, { received: true })).status).toBe(409);
  });
});

describe('cancelling a booking closes the money', () => {
  it('a rejected booking cancels the open entry; the money must go back to the customer', async () => {
    const l = await mkLead('Reject With Money'); await stageTo(l.id, visited);
    const b = (await j(await call(jar.B1, 'POST', `/api/crm/leads/${l.id}/booking-request`, { unitNo: unit(), agreementValue: AV, tokenAmount: 25000, tokenMode: 'CASH' }))).booking;
    const t = (await j(await collect(jar.B1, { bookingId: b.id, target: 'TOKEN', amount: 25000, mode: 'CASH' }))).trail; expect(t.status).toBe('WITH_CP');
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b.id}/decision`, { decision: 'APPROVE', tokenReceived: true })).status).toBe(409); // the booking amount is on its way through the trail
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b.id}/decision`, { decision: 'REJECT', note: 'Unit already sold offline' })).status).toBe(200);
    const g = (await j(await call(jar.B1, 'GET', `${M}/trails?bookingId=${b.id}`))).rows[0]; expect(g.status).toBe('CANCELLED'); expect(g.steps.at(-1).note).toMatch(/return this money/i);
    expect((await collect(jar.B1, { bookingId: b.id, target: 'TOKEN', amount: 25000, mode: 'CASH' })).status).toBe(409); // a rejected booking takes no money
  });
});
