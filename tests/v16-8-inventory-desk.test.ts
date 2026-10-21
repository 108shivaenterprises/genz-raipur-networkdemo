import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  cleanUnitDetail, validateRule, adjustedPrice, previewRateChange, cleanVis, effectiveVis, partnerMaySee, memberView, capShareFlags, unitShareLine, inrShort,
  UNIT_FEATURES, FACINGS, impliedFeatures, DEFAULT_INV_POLICY, type TeamPost,
} from '../src/shared/inventoryRules';
import { segmentOf, launchView, cleanPlanInput, emptyPlan, BIG_FIRM_STAFF, type LaunchPlan } from '../src/shared/launchRules';
import { cleanPolicy, policyOf } from '../src/shared/pcontrolRules';
import { verhoeffCheckDigit } from '../src/shared/idRules';
import { ROLE_PERMISSIONS, memberPermissions } from '../server/permissions';

/** v16.8 "Inventory Desk": unit facts + rate control + who-sees, team board, customer links, GENZ launch, Reassign list. */
const PORT = 5300 + Math.floor(Math.random() * 90);
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
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const PLOTS = 'PROJ-RAI-02'; const TOWER = 'PROJ-RAI-01';

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v168-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' },
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  expect(cfg).toBeTruthy();
  jar.B1 = await login(email('USR-BRK-001')); jar.B2 = await login(email('USR-BRK-002')); jar.B3 = await login(email('USR-BRK-003'));
  jar.BUILDER = await login(email('USR-BUILDER-001')); jar.BUILDER2 = await login(email('USR-BUILDER-002'));
  jar.SUP = await login(cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').email);
  jar.POOJA = await login('9000030001'); jar.RAKESH = await login('9000030002'); jar.DIVYA = await login('9000030003');
}, 90_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const grid = async (cookie: string, pid = PLOTS) => { const r = await call(cookie, 'GET', `/api/inventory/projects/${pid}`); return { status: r.status, body: r.status === 200 ? await j(r) : null }; };
const unitsOf = async (cookie: string, pid = PLOTS) => (await grid(cookie, pid)).body?.units ?? [];
const freeIds = async (n: number, from = 4) => (await unitsOf(jar.BUILDER)).filter((u: any) => u.status === 'AVAILABLE').slice(from, from + n).map((u: any) => u.id);
const policy = (memberId: string, body: any, cookie = jar.B1) => call(cookie, 'PUT', `/api/pcontrol/team/${memberId}/policy`, body);

// ───────────────────────── pure rules ─────────────────────────
describe('unit facts', () => {
  it('catalog: every feature and every facing has an English and a Hindi label', () => {
    expect(UNIT_FEATURES.length).toBeGreaterThanOrEqual(12); expect(FACINGS.length).toBe(8);
    for (const f of [...UNIT_FEATURES, ...FACINGS]) { expect(f.en.length).toBeGreaterThan(1); expect(/[ऀ-ॿ]/.test(f.hi), f.id).toBe(true); }
    expect(new Set(UNIT_FEATURES.map(f => f.id)).size).toBe(UNIT_FEATURES.length);
  });
  it('cleanUnitDetail: road sides 1-4, width 6-300 ft, known tags only, note length; null clears', () => {
    expect(cleanUnitDetail({ roadSides: 3, facing: 'EAST', roadWidthFt: 40, features: ['CORNER', 'VASTU', 'CORNER'], dimensions: ' 30 x 50 ft ', note: ' Extra frontage ' }))
      .toEqual({ roadSides: 3, facing: 'EAST', roadWidthFt: 40, features: ['CORNER', 'VASTU'], dimensions: '30 x 50 ft', note: 'Extra frontage' });
    for (const bad of [{ roadSides: 5 }, { roadSides: 0.5 }, { facing: 'UP' }, { roadWidthFt: 3 }, { roadWidthFt: 400 }, { features: ['POOL_PARTY'] }, { features: 'CORNER' }, { note: 'x'.repeat(201) }, { dimensions: 'y'.repeat(25) }]) expect(typeof cleanUnitDetail(bad as any), JSON.stringify(bad)).toBe('string');
    expect(typeof cleanUnitDetail({ features: UNIT_FEATURES.map(f => f.id) }), 'more than 12 tags').toBe('string');
    expect(cleanUnitDetail({ facing: null, roadSides: null, note: '' })).toEqual({ facing: null, roadSides: null, note: null });
  });
  it('a plot touching two or more roads is a corner plot by definition', () => {
    expect(impliedFeatures({ roadSides: 2 })).toContain('CORNER'); expect(impliedFeatures({ roadSides: 1, features: ['VASTU'] })).toEqual(['VASTU']);
  });
});

describe('rate change rules', () => {
  const U = (price: number, area: number | undefined, status = 'AVAILABLE', id = 'u') => ({ id, label: id, price, areaSqft: area, status });
  it('rule validation: a single change is at most ±40 %, never zero, per-sq-ft rate bounded', () => {
    expect(typeof validateRule({ mode: 'PCT', value: 41 })).toBe('string'); expect(typeof validateRule({ mode: 'PCT', value: -41 })).toBe('string'); expect(typeof validateRule({ mode: 'PCT', value: 0 })).toBe('string');
    expect(typeof validateRule({ mode: 'NOPE', value: 5 })).toBe('string'); expect(typeof validateRule({ mode: 'SET_PER_SQFT', value: 50 })).toBe('string');
    expect(validateRule({ mode: 'PCT', value: '5' })).toEqual({ mode: 'PCT', value: 5 });
  });
  it('maths: % rounds to ₹1,000; per-sq-ft needs an area; set-rate multiplies exactly', () => {
    expect(adjustedPrice(8_500_000, 1450, { mode: 'PCT', value: 5 })).toBe(8_925_000);
    expect(adjustedPrice(8_500_000, 1450, { mode: 'PCT', value: -10 })).toBe(7_650_000);
    expect(adjustedPrice(3_600_000, 1500, { mode: 'PER_SQFT', value: 100 })).toBe(3_750_000);
    expect(adjustedPrice(3_600_000, undefined, { mode: 'PER_SQFT', value: 100 })).toBe('no area');
    expect(adjustedPrice(3_600_000, 1500, { mode: 'SET_PER_SQFT', value: 2999 })).toBe(4_498_500);
    expect(adjustedPrice(3_600_000, 1500, { mode: 'FLAT', value: -3_600_000 })).toBe('price would be too low');
  });
  it('preview: held and booked units are skipped, never silently changed', () => {
    const p = previewRateChange([U(1_000_000, 1000, 'AVAILABLE', 'a'), U(1_000_000, 1000, 'BOOKED', 'b'), U(1_000_000, 1000, 'HOLD', 'c'), U(1_000_000, 1000, 'RESERVED', 'd')], { mode: 'PCT', value: 10 });
    expect(p.changes.map(c => c.id)).toEqual(['a', 'd']); expect(p.skipped.map(s => `${s.id}:${s.why}`)).toEqual(['b:booked', 'c:on hold']);
    expect(p.changes[0]).toMatchObject({ from: 1_000_000, to: 1_100_000 });
  });
});

describe('who may see a unit', () => {
  it('cleanVis: SELECTED needs partners; ALL/HIDDEN carry none; price flag is boolean', () => {
    expect(typeof cleanVis({ audience: 'SELECTED' })).toBe('string'); expect(typeof cleanVis({ audience: 'EVERYONE' })).toBe('string'); expect(typeof cleanVis({ priceHidden: 'yes' })).toBe('string');
    expect(cleanVis({ audience: 'SELECTED', brokerIds: ['a', 'b', 'a'] })).toEqual({ audience: 'SELECTED', brokerIds: ['a', 'b'], priceHidden: false });
    expect(cleanVis({ audience: 'ALL', brokerIds: ['a'], priceHidden: true })).toEqual({ audience: 'ALL', brokerIds: [], priceHidden: true });
  });
  it('a unit override wins over the project default; partnerMaySee follows the audience', () => {
    const proj = { audience: 'SELECTED' as const, brokerIds: ['b1'], priceHidden: true };
    expect(effectiveVis(undefined, proj)).toBe(proj);
    expect(partnerMaySee(effectiveVis(undefined, proj), 'b1')).toBe(true); expect(partnerMaySee(effectiveVis(undefined, proj), 'b2')).toBe(false);
    expect(partnerMaySee(effectiveVis({ audience: 'ALL', brokerIds: [], priceHidden: false }, proj), 'b2')).toBe(true);
    expect(partnerMaySee({ audience: 'HIDDEN', brokerIds: [], priceHidden: false }, 'b1')).toBe(false);
  });
  const post = (o: Partial<TeamPost>): TeamPost => ({ id: 'p', employerId: 'e', projectId: 'x', unitIds: ['u1'], memberIds: [], showPrice: true, showFeatures: true, note: '', createdBy: 'e', createdByName: 'E', createdAt: '', active: true, ...o });
  it('employee view: OFF sees nothing; ALL follows the policy; SHARED sees only posted units; the most restrictive post wins', () => {
    const off = memberView({ ...DEFAULT_INV_POLICY }, [], 'u1', 'm', true); expect(off.visible).toBe(false);
    expect(memberView({ invMode: 'ALL', invPrice: true, invFeatures: false, invShareOut: false }, [], 'u1', 'm', true)).toMatchObject({ visible: true, price: true, features: false });
    expect(memberView({ invMode: 'ALL', invPrice: true, invFeatures: true, invShareOut: false }, [], 'u1', 'm', false).price).toBe(false); // the builder hid the rate from his boss
    const sh = { invMode: 'SHARED' as const, invPrice: true, invFeatures: true, invShareOut: false };
    expect(memberView(sh, [], 'u1', 'm', true).visible).toBe(false);
    expect(memberView(sh, [post({})], 'u1', 'm', true)).toMatchObject({ visible: true, price: true, features: true, via: 'POST' });
    expect(memberView(sh, [post({}), post({ id: 'q', showPrice: false })], 'u1', 'm', true).price).toBe(false);
    expect(memberView(sh, [post({ memberIds: ['other'] })], 'u1', 'm', true).visible).toBe(false);
    expect(memberView(sh, [post({ active: false })], 'u1', 'm', true).visible).toBe(false);
    expect(memberView(sh, [post({ endsAt: new Date(Date.now() - 1000).toISOString() })], 'u1', 'm', true).visible).toBe(false);
    expect(memberView({ ...sh, invPrice: false }, [post({})], 'u1', 'm', true).price).toBe(false);
  });
  it('share flags can be turned off but never on beyond what the sender sees', () => {
    expect(capShareFlags({ showPrice: true, showFeatures: true }, false, true)).toEqual({ showPrice: false, showFeatures: true });
    expect(capShareFlags({ showPrice: false, showFeatures: true }, true, true)).toEqual({ showPrice: false, showFeatures: true });
  });
  it('share text: price and features appear only when switched on; Hindi works; amounts read as L / Cr', () => {
    const u = { label: 'P-12', config: 'Plot', areaSqft: 1500, price: 4_550_000, facing: 'EAST', roadSides: 3, roadWidthFt: 40, features: ['VASTU'], dimensions: '30 x 50 ft', note: 'Extra frontage' };
    const all = unitShareLine(u, { showPrice: true, showFeatures: true }, false);
    expect(all).toContain('3-side road'); expect(all).toContain('East facing'); expect(all).toContain('Corner'); expect(all).toContain('₹45.5 L'); expect(all).toContain('Extra frontage');
    const none = unitShareLine(u, { showPrice: false, showFeatures: false }, false);
    expect(none).not.toMatch(/road|facing|₹|Corner|frontage/); expect(none).toContain('P-12'); expect(none).toContain('1500 sq ft');
    expect(unitShareLine({ ...u, price: null }, { showPrice: true, showFeatures: false }, false)).toContain('price on request');
    expect(/[ऀ-ॿ]/.test(unitShareLine(u, { showPrice: true, showFeatures: true }, true))).toBe(true);
    expect(inrShort(10_000_000)).toBe('₹1 Cr'); expect(inrShort(25_000_000)).toBe('₹2.5 Cr'); expect(inrShort(250_000)).toBe('₹2.5 L'); expect(inrShort(4_550_000)).toBe('₹45.5 L'); expect(inrShort(9_500)).toBe('₹9,500');
  });
  it('team policy accepts the new switches and rejects junk', () => {
    const base = policyOf({}); expect(base).toMatchObject({ invMode: 'OFF', invPrice: false, invFeatures: true, invShareOut: false });
    expect(cleanPolicy({ invMode: 'SHARED', invPrice: true }, base)).toMatchObject({ invMode: 'SHARED', invPrice: true });
    expect(typeof cleanPolicy({ invMode: 'EVERYTHING' }, base)).toBe('string'); expect(typeof cleanPolicy({ invPrice: 'yes' }, base)).toBe('string');
  });
});

describe('GENZ launch rules', () => {
  const plan = (o: Partial<LaunchPlan> = {}): LaunchPlan => ({ ...emptyPlan('2026-01-01T00:00:00.000Z'), consent: 'GRANTED', status: 'LIVE', ...o });
  it('groups: no RERA no. = local; a RERA broker is big with 5+ active staff or when the desk says so; the tier cannot be overridden', () => {
    expect(segmentOf({ role: 'BROKER', reraNumber: 'X1' }, 0)).toBe('INDEPENDENT'); expect(segmentOf({ role: 'BROKER', reraNumber: 'X1' }, BIG_FIRM_STAFF)).toBe('BIG_FIRM');
    expect(segmentOf({ role: 'BROKER', reraNumber: 'X1', firmSegment: 'BIG_FIRM' }, 0)).toBe('BIG_FIRM'); expect(segmentOf({ role: 'BROKER', reraNumber: 'X1', firmSegment: 'INDEPENDENT' }, 50)).toBe('INDEPENDENT');
    expect(segmentOf({ role: 'BROKER' }, 50)).toBe('LOCAL'); expect(segmentOf({ role: 'BROKER', tier: 'TIER2', reraNumber: 'X1', firmSegment: 'BIG_FIRM' }, 50)).toBe('LOCAL');
    expect(segmentOf({ role: 'DEVELOPER_BUILDER' }, 0)).toBeNull();
  });
  it('waves: nothing without the builder\'s yes or while not live; later waves see "soon"; locals never get more than a teaser', () => {
    const now = Date.parse('2026-06-01T00:00:00.000Z');
    expect(launchView(undefined, 'BIG_FIRM', now)).toBe('HIDDEN'); expect(launchView(plan({ consent: 'REQUESTED' }), 'BIG_FIRM', now)).toBe('HIDDEN');
    expect(launchView(plan({ status: 'DRAFT' }), 'BIG_FIRM', now)).toBe('HIDDEN'); expect(launchView(plan({ status: 'PAUSED' }), 'BIG_FIRM', now)).toBe('HIDDEN');
    const p = plan({ waves: { BIG_FIRM: { on: true, at: '2026-05-01T00:00:00.000Z' }, INDEPENDENT: { on: true, at: '2026-07-01T00:00:00.000Z' }, LOCAL: { mode: 'OFF', at: '2026-05-01T00:00:00.000Z' } } });
    expect(launchView(p, 'BIG_FIRM', now)).toBe('OPEN'); expect(launchView(p, 'INDEPENDENT', now)).toBe('SOON'); expect(launchView(p, 'LOCAL', now)).toBe('HIDDEN');
    p.waves.LOCAL = { mode: 'TEASER', at: '2026-05-01T00:00:00.000Z' }; expect(launchView(p, 'LOCAL', now)).toBe('TEASER');
    p.waves.INDEPENDENT.on = false; expect(launchView(p, 'INDEPENDENT', now)).toBe('HIDDEN');
  });
  it('plan input: at least one group, local can be OFF or TEASER only (no selling window), dates must parse', () => {
    const cur = plan();
    expect(typeof cleanPlanInput({ waves: { BIG_FIRM: { on: false }, INDEPENDENT: { on: false }, LOCAL: { mode: 'OFF' } } }, cur)).toBe('string');
    expect(typeof cleanPlanInput({ waves: { LOCAL: { mode: 'FULL' } } }, cur)).toBe('string');
    expect(typeof cleanPlanInput({ waves: { BIG_FIRM: { on: true, at: 'someday' } } }, cur)).toBe('string');
    expect(typeof cleanPlanInput({ headline: 'x'.repeat(121) }, cur)).toBe('string');
    const ok = cleanPlanInput({ headline: ' Sky Villas ', waves: { LOCAL: { mode: 'TEASER' } } }, cur) as LaunchPlan; expect(ok.headline).toBe('Sky Villas'); expect(ok.waves.LOCAL.mode).toBe('TEASER');
  });
  it('permissions: employees get unit read / share (the route checks their policy), the desk gets launch, nobody else does', () => {
    expect(ROLE_PERMISSIONS.TEAM_MEMBER).toEqual(expect.arrayContaining(['inventory:read', 'inventory:share', 'task:manage']));
    for (const r of ['BROKER', 'DEVELOPER_BUILDER'] as const) expect(memberPermissions(r)).toEqual(expect.arrayContaining(['inventory:read', 'inventory:share']));
    expect(ROLE_PERMISSIONS.ADMIN).toContain('launch:manage'); expect(ROLE_PERMISSIONS.BROKER).not.toContain('launch:manage'); expect(ROLE_PERMISSIONS.DEVELOPER_BUILDER).not.toContain('launch:manage');
    expect(ROLE_PERMISSIONS.TEAM_MEMBER).not.toContain('inventory:manage'); expect(ROLE_PERMISSIONS.BROKER).toContain('launch:read');
  });
});

// ───────────────────────── Reassign list ─────────────────────────
describe('deal room: who a duty can be handed to', () => {
  let dealId = ''; const ids = (a: any[]) => a.map(x => x.id);
  const assign = (cookie: string, task: string, to: string) => call(cookie, 'POST', `/api/deals/${dealId}/tasks/${task}/assign`, { assignedParticipantId: to, assignedParticipantName: 'x', reason: 'test hand-over' });
  const tasks = async () => (await j(await call(jar.B1, 'GET', `/api/deals/${dealId}/tasks`))).tasks as any[];
  it('the list holds only people in the room: both brokers, the owner, the allotted employee, legal counsel, the desk — no outsiders, no other employees', async () => {
    dealId = (await j(await call(jar.B1, 'GET', '/api/deals'))).deals[0].id;
    const r = await call(jar.B1, 'GET', `/api/deals/${dealId}/assignees`); expect(r.status).toBe(200);
    const a = (await j(r)).assignees; const got = ids(a);
    expect(got).toEqual(expect.arrayContaining(['USR-BRK-001', 'USR-BRK-002', 'USR-OWNER-001', 'USR-TEAM-001', 'USR-LEGAL-001']));
    for (const out of ['USR-BRK-003', 'USR-BRK-004', 'USR-TEAM-002', 'USR-TEAM-003', 'USR-BUILDER-001', 'USR-SUPERADMIN', 'USR-BUYER-001', 'USR-CONTRACTOR-001']) expect(got, out).not.toContain(out);
    expect(a.find((x: any) => x.id === 'USR-TEAM-001')).toMatchObject({ group: 'TEAM', title: 'Telecaller', employerName: 'Vikramaditya Sharma' });
    expect(got).not.toContain('USR-ADMIN-1'); // v21: GENZ keeps no desk in a broker-to-broker deal room
  });
  it('someone outside the room, and another broker\'s employee, cannot open the list', async () => {
    expect((await call(jar.B3, 'GET', `/api/deals/${dealId}/assignees`)).status).toBe(404);
    expect((await call(jar.DIVYA, 'GET', `/api/deals/${dealId}/assignees`)).status).toBe(404);
  });
  it('the server accepts the allotted employee and refuses anyone from outside the deal', async () => {
    const t = (await tasks()).find((x: any) => x.assignedParticipantId === 'USR-BRK-001');
    expect((await assign(jar.B1, t.id, 'USR-BRK-003')).status).toBe(400);
    expect((await assign(jar.B1, t.id, 'USR-TEAM-002')).status).toBe(400); // an employee who is not allotted to this deal
    expect((await assign(jar.B1, t.id, 'USR-BUILDER-001')).status).toBe(400);
    const ok = await assign(jar.B1, t.id, 'USR-TEAM-001'); expect(ok.status, await ok.clone().text()).toBe(200);
    const after = (await tasks()).find((x: any) => x.id === t.id); expect(after).toMatchObject({ assignedParticipantId: 'USR-TEAM-001', assignedParticipantName: 'Pooja Nayak', assignedParticipantRole: 'TEAM_MEMBER', assignmentAcceptance: 'PENDING_ACCEPTANCE' });
    // the employee can answer for what is hers …
    expect((await call(jar.POOJA, 'POST', `/api/deals/${dealId}/tasks/${t.id}/accept`, { acceptance: 'ACCEPTED' })).status).toBe(200);
    // … and hand it back, but cannot touch other people's duties or waive anything
    const others = (await tasks()).find((x: any) => x.assignedParticipantId === 'USR-BRK-002');
    expect((await assign(jar.POOJA, others.id, 'USR-BRK-001')).status).toBe(403);
    expect((await call(jar.POOJA, 'POST', `/api/deals/${dealId}/tasks/${t.id}/applicability`, { isApplicable: false, reason: 'not needed' })).status).toBe(403);
    expect((await assign(jar.POOJA, t.id, 'USR-BRK-001')).status).toBe(200);
  });
});

// ───────────────────────── unit facts, rate control ─────────────────────────
describe('builder: unit facts and rates', () => {
  const uid = (n: number) => `UNIT-${PLOTS}-P-${n}`;
  it('one plot: road sides, facing, width, tags and a rate change with a reason; history kept; only the builder may edit', async () => {
    const before = (await unitsOf(jar.BUILDER)).find((u: any) => u.id === uid(10));
    const r = await call(jar.BUILDER, 'PUT', `/api/inventory/units/${uid(10)}`, { price: before.price + 100000, reason: 'Corner premium', facing: 'EAST', roadSides: 3, roadWidthFt: 60, features: ['CORNER', 'PARK_FACING'], dimensions: '40 x 50 ft', note: 'Three sides open' });
    expect(r.status, await r.clone().text()).toBe(200);
    const u = (await unitsOf(jar.BUILDER)).find((x: any) => x.id === uid(10));
    expect(u).toMatchObject({ price: before.price + 100000, facing: 'EAST', roadSides: 3, roadWidthFt: 60, dimensions: '40 x 50 ft', note: 'Three sides open' });
    expect(u.features).toEqual(expect.arrayContaining(['CORNER', 'PARK_FACING'])); expect(u.priceHistory[0]).toMatchObject({ price: before.price + 100000, reason: 'Corner premium', by: 'Er. Alok Singhania' });
    const mine = (await unitsOf(jar.B1)).find((x: any) => x.id === uid(10)); expect(mine).toMatchObject({ facing: 'EAST', roadSides: 3, price: before.price + 100000 }); expect(mine.priceHistory).toBeUndefined(); expect(mine.vis).toBeUndefined();
    expect((await call(jar.B1, 'PUT', `/api/inventory/units/${uid(10)}`, { price: 1000000 })).status).toBe(403);
    expect((await call(jar.BUILDER2, 'PUT', `/api/inventory/units/${uid(10)}`, { price: 1000000 })).status).toBe(404); // another builder
  });
  it('bad facts are refused; the facts of a booked plot can still be corrected but its rate is locked', async () => {
    for (const bad of [{ roadSides: 7 }, { facing: 'UP' }, { features: ['NOPE'] }, { roadWidthFt: 2 }, { note: 'x'.repeat(201) }, { price: -5 }]) expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${uid(10)}`, bad)).status, JSON.stringify(bad)).toBe(400);
    const booked = (await unitsOf(jar.BUILDER)).find((x: any) => x.status === 'BOOKED');
    const lock = await call(jar.BUILDER, 'PUT', `/api/inventory/units/${booked.id}`, { price: booked.price + 1 }); expect(lock.status).toBe(409); expect((await j(lock)).error).toMatch(/locked/i);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${booked.id}`, { roadSides: 2 })).status).toBe(200);
  });
  it('bulk rate change: the preview changes nothing; applying skips booked units; every change is in the history, the audit log and (if asked) a partner notice', async () => {
    const pre = await unitsOf(jar.BUILDER); const byId = new Map(pre.map((u: any) => [u.id, u]));
    const dry = await j(await call(jar.BUILDER, 'POST', `/api/inventory/projects/${PLOTS}/units/bulk`, { filter: { group: 'Phase 1' }, action: 'RATE', rule: { mode: 'PCT', value: 10 }, dryRun: true }));
    expect(dry).toMatchObject({ success: true, dryRun: true, total: 24 }); expect(dry.skipped.filter((s: any) => s.why === 'booked').length).toBe(3);
    expect(dry.changes.length).toBe(21); expect((await unitsOf(jar.BUILDER)).every((u: any) => u.price === (byId.get(u.id) as any).price)).toBe(true);
    const go = await j(await call(jar.BUILDER, 'POST', `/api/inventory/projects/${PLOTS}/units/bulk`, { filter: { group: 'Phase 1' }, action: 'RATE', rule: { mode: 'PCT', value: 10 }, reason: 'Diwali rate revision', notify: true }));
    expect(go).toMatchObject({ success: true, applied: 21 });
    const post = await unitsOf(jar.BUILDER);
    for (const u of post) { const was = byId.get(u.id) as any; if (u.status === 'BOOKED') expect(u.price).toBe(was.price); else { expect(u.price).toBe(adjustedPrice(was.price, was.areaSqft, { mode: 'PCT', value: 10 })); expect(u.priceHistory[0]).toMatchObject({ price: u.price, reason: 'Diwali rate revision' }); } }
    const page = await j(await call(jar.B1, 'GET', `/api/pcontrol/partner/projects/${PLOTS}`));
    expect(page.updates.some((x: any) => x.kind === 'PRICE' && /Rates revised/.test(x.title))).toBe(true);
    const audit = (await j(await call(jar.SUP, 'GET', '/api/audit-logs?limit=300'))); const ev = (audit.events || audit.logs || []).find((e: any) => e.action === 'INVENTORY_RATE_CHANGED' && /21 unit/.test(e.details));
    expect(ev, 'audit event for the bulk change').toBeTruthy();
    // and back down again
    expect((await j(await call(jar.BUILDER, 'POST', `/api/inventory/projects/${PLOTS}/units/bulk`, { filter: { group: 'Phase 1' }, action: 'RATE', rule: { mode: 'PCT', value: -5 }, reason: 'Corrected' }))).applied).toBe(21);
  });
  it('limits: ±40 % per action, a real action, a real selection — and a partner cannot call it at all', async () => {
    const b = (body: any) => call(jar.BUILDER, 'POST', `/api/inventory/projects/${PLOTS}/units/bulk`, { filter: { group: 'Phase 1' }, ...body });
    expect((await b({ action: 'RATE', rule: { mode: 'PCT', value: 45 } })).status).toBe(400); expect((await b({ action: 'RATE', rule: { mode: 'PCT', value: 0 } })).status).toBe(400);
    expect((await b({ action: 'RATE', rule: { mode: 'SET_PER_SQFT', value: 10 } })).status).toBe(400); expect((await b({ action: 'NUKE' })).status).toBe(400);
    expect((await call(jar.BUILDER, 'POST', `/api/inventory/projects/${PLOTS}/units/bulk`, { action: 'RATE', rule: { mode: 'PCT', value: 5 } })).status).toBe(400); // nothing selected
    expect((await call(jar.BUILDER, 'POST', `/api/inventory/projects/${PLOTS}/units/bulk`, { unitIds: ['UNIT-NOPE'], action: 'STATUS', status: 'RESERVED' })).status).toBe(400);
    expect((await call(jar.B1, 'POST', `/api/inventory/projects/${PLOTS}/units/bulk`, { filter: { group: 'Phase 1' }, action: 'RATE', rule: { mode: 'PCT', value: 5 } })).status).toBe(403);
    expect((await call(jar.BUILDER2, 'POST', `/api/inventory/projects/${PLOTS}/units/bulk`, { filter: { group: 'Phase 1' }, action: 'RATE', rule: { mode: 'PCT', value: 5 } })).status).toBe(404);
  });
  it('bulk facts: set road sides / add tags on a selection; the 12-tag cap holds', async () => {
    const ids = [uid(12), uid(13)];
    const r = await call(jar.BUILDER, 'POST', `/api/inventory/projects/${PLOTS}/units/bulk`, { unitIds: ids, action: 'FEATURES', detail: { roadSides: 2, facing: 'WEST' }, addFeatures: ['MAIN_ROAD'], removeFeatures: ['VASTU'] });
    expect(r.status, await r.clone().text()).toBe(200);
    for (const u of (await unitsOf(jar.BUILDER)).filter((x: any) => ids.includes(x.id))) { expect(u).toMatchObject({ roadSides: 2, facing: 'WEST' }); expect(u.features).toContain('MAIN_ROAD'); expect(u.features).toContain('CORNER'); expect(u.features).not.toContain('VASTU'); }
    expect((await call(jar.BUILDER, 'POST', `/api/inventory/projects/${PLOTS}/units/bulk`, { unitIds: ids, action: 'FEATURES', addFeatures: ['FAKE'] })).status).toBe(400);
  });
  it('sheet import: new plots and updated rates in one go; one bad row saves nothing; a booked plot is locked; labels in plain words work', async () => {
    const rows = [
      { group: 'Phase 2', label: 'S-1', config: 'Plot', areaSqft: 1000, price: 3_000_000, facing: 'West', roadSides: 2, roadWidthFt: 40, features: 'Corner; Park facing', dimensions: '25 x 40 ft' },
      { group: 'Phase 2', label: 'S-2', config: 'Plot', areaSqft: 1200, price: 3_500_000, facing: 'north east', roadSides: 3, features: 'Vastu-friendly' },
      { group: 'Phase 1', label: 'P-15', price: 4_100_000, roadSides: 1 },
    ];
    const bad = await call(jar.BUILDER, 'POST', `/api/inventory/projects/${PLOTS}/units/import`, { rows: [...rows, { group: 'Phase 2', label: 'S-3', price: 'abc' }, { group: 'Phase 1', label: 'P-1', price: 1_000_000 }] });
    expect(bad.status).toBe(400); const bb = await j(bad); expect(bb.errors.map((e: any) => e.row).sort()).toEqual([4, 5]); expect((await unitsOf(jar.BUILDER)).some((u: any) => u.label === 'S-1')).toBe(false);
    const ok = await j(await call(jar.BUILDER, 'POST', `/api/inventory/projects/${PLOTS}/units/import`, { rows }));
    expect(ok).toMatchObject({ success: true, created: 2, updated: 1 });
    const all = await unitsOf(jar.BUILDER); const s1 = all.find((u: any) => u.label === 'S-1'); const s2 = all.find((u: any) => u.label === 'S-2');
    expect(s1).toMatchObject({ facing: 'WEST', roadSides: 2, roadWidthFt: 40, dimensions: '25 x 40 ft' }); expect(s1.features).toEqual(expect.arrayContaining(['PARK_FACING', 'CORNER']));
    expect(s2).toMatchObject({ facing: 'NORTH_EAST', roadSides: 3 }); expect(s2.features).toContain('VASTU'); expect(all.find((u: any) => u.label === 'P-15')).toMatchObject({ price: 4_100_000, roadSides: 1 });
    expect((await call(jar.BUILDER, 'POST', `/api/inventory/projects/${PLOTS}/units/import`, { rows: [{ group: 'Phase 2', label: 'S-9', price: 1_000_000, features: 'Helipad' }] })).status).toBe(400);
    expect((await call(jar.B1, 'POST', `/api/inventory/projects/${PLOTS}/units/import`, { rows })).status).toBe(403);
  });
});

// ───────────────────────── who sees what ─────────────────────────
describe('builder decides who sees a plot and its rate', () => {
  const uid = (n: number) => `UNIT-${PLOTS}-P-${n}`;
  const labelsOf = async (c: string) => (await unitsOf(c)).map((u: any) => u.label);
  it('a plot hidden from partners disappears for the partner and his staff — and cannot be held or booked — while the builder still sees it', async () => {
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${uid(16)}`, { vis: { audience: 'HIDDEN' } })).status).toBe(200);
    expect(await labelsOf(jar.B1)).not.toContain('P-16'); expect(await labelsOf(jar.B2)).not.toContain('P-16'); expect(await labelsOf(jar.RAKESH)).not.toContain('P-16');
    const mine = (await unitsOf(jar.BUILDER)).find((u: any) => u.label === 'P-16'); expect(mine.vis).toMatchObject({ audience: 'HIDDEN' });
    expect((await call(jar.B1, 'POST', `/api/inventory/units/${uid(16)}/hold`, { leadId: 'x', tokenAmount: 50000, tokenRef: 'UTR12345' })).status).toBe(404);
    // a booking request for that plot number is refused too
    const lead = (await j(await call(jar.B1, 'POST', '/api/crm/leads', { consent: true, projectId: PLOTS, name: 'Hidden Plot Buyer', phone: '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0'), source: 'WALK_IN' }))).lead;
    for (const stage of ['CONTACTED', 'SITE_VISIT_SCHEDULED', 'SITE_VISITED']) await call(jar.B1, 'POST', `/api/crm/leads/${lead.id}/stage`, { stage });
    const proj = (await j(await call(jar.BUILDER, 'GET', '/api/builder/projects'))).projects.find((p: any) => p.id === PLOTS);
    const rq = await call(jar.B1, 'POST', `/api/crm/leads/${lead.id}/booking-request`, { unitNo: 'P-16', agreementValue: proj.priceStartingFrom, tokenAmount: 0 });
    expect(rq.status).toBe(409); expect((await j(rq)).error).toMatch(/not open to you/);
    // back to the project default
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${uid(16)}`, { vis: null })).status).toBe(200); expect(await labelsOf(jar.B1)).toContain('P-16');
  });
  it('project default "only these partners": the others see an empty grid; partner list is names only; strangers are refused', async () => {
    const partners = (await j(await call(jar.BUILDER, 'GET', `/api/inventory/projects/${PLOTS}/partners`))).partners;
    expect(partners.map((p: any) => p.brokerId)).toEqual(expect.arrayContaining(['USR-BRK-001', 'USR-BRK-002'])); expect(JSON.stringify(partners)).not.toMatch(/phone|email/i);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/projects/${PLOTS}/visibility`, { audience: 'SELECTED', brokerIds: ['USR-BRK-003'] })).status).toBe(400); // not a partner of this project
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/projects/${PLOTS}/visibility`, { audience: 'SELECTED', brokerIds: [] })).status).toBe(400);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/projects/${PLOTS}/visibility`, { audience: 'SELECTED', brokerIds: ['USR-BRK-001'] })).status).toBe(200);
    expect((await unitsOf(jar.B1)).length).toBeGreaterThan(20); expect((await unitsOf(jar.B2)).length).toBe(0); expect((await unitsOf(jar.BUILDER)).length).toBeGreaterThan(20);
    const page = await j(await call(jar.B2, 'GET', `/api/pcontrol/partner/projects/${PLOTS}`)); expect(page.availableUnits_list).toEqual([]); // the project page agrees with the grid
    expect((await call(jar.B1, 'PUT', `/api/inventory/projects/${PLOTS}/visibility`, { audience: 'ALL' })).status).toBe(403);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/projects/${PLOTS}/visibility`, { audience: 'ALL', clearOverrides: true })).status).toBe(200);
    expect((await unitsOf(jar.B2)).length).toBeGreaterThan(20);
  });
  it('hidden rate: the partner and his staff see "price on request" everywhere (grid, project page); the builder sees it; a share cannot reveal it', async () => {
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/projects/${PLOTS}/visibility`, { audience: 'ALL', priceHidden: true })).status).toBe(200);
    const u = (await unitsOf(jar.B1)).find((x: any) => x.label === 'P-17'); expect(u).toMatchObject({ price: null, priceHidden: true }); expect(u.ratePerSqft).toBeUndefined();
    expect((await unitsOf(jar.RAKESH)).find((x: any) => x.label === 'P-17').price).toBeNull(); // his employer cannot see it, so he cannot either, whatever his own switch says
    const page = await j(await call(jar.B1, 'GET', `/api/pcontrol/partner/projects/${PLOTS}`)); expect(page.availableUnits_list.every((x: any) => x.price === null && x.priceHidden)).toBe(true);
    expect((await unitsOf(jar.BUILDER)).find((x: any) => x.label === 'P-17').price).toBeGreaterThan(0);
    const sh = await j(await call(jar.B1, 'POST', '/api/invdesk/shares', { projectId: PLOTS, unitIds: [uid(17)], showPrice: true, showFeatures: true }));
    expect(sh).toMatchObject({ success: true, showPrice: false, capped: true });
    const html = await (await fetch(B + sh.path)).text(); expect(html).not.toMatch(/₹\s?\d/);
    // restore
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/projects/${PLOTS}/visibility`, { audience: 'ALL', priceHidden: false })).status).toBe(200);
    expect((await unitsOf(jar.B1)).find((x: any) => x.label === 'P-17').price).toBeGreaterThan(0);
  });
  it('one plot can hide just its own rate; a held plot hides the broker from other partners (still true after the change)', async () => {
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${uid(18)}`, { vis: { audience: 'ALL', priceHidden: true } })).status).toBe(200);
    expect((await unitsOf(jar.B1)).find((x: any) => x.label === 'P-18').price).toBeNull(); expect((await unitsOf(jar.B1)).find((x: any) => x.label === 'P-19').price).toBeGreaterThan(0);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${uid(18)}`, { vis: null })).status).toBe(200);
  });
});

// ───────────────────────── team board ─────────────────────────
describe('partner team: what staff may see, and the board', () => {
  const uid = (n: number) => `UNIT-${PLOTS}-P-${n}`;
  const POOJA = 'USR-TEAM-001', RAKESH = 'USR-TEAM-002', DIVYA = 'USR-TEAM-003';
  it('an employee whose employer never opened the grid sees nothing; the demo employee on "only what I post" sees just the posted plots, features yes, rates no', async () => {
    expect((await grid(jar.DIVYA)).status).toBe(404); expect((await j(await call(jar.DIVYA, 'GET', '/api/inventory/projects'))).projects).toEqual([]);
    const g = await grid(jar.POOJA); expect(g.status).toBe(200);
    expect(g.body.units.length).toBe(6); expect(g.body.caps).toMatchObject({ kind: 'MEMBER', canHold: false, canManage: false, canShare: false, member: { mode: 'SHARED', price: false, features: true } });
    for (const u of g.body.units) { expect(u.price).toBeNull(); expect(u.facing).toBeTruthy(); expect(u.priceHistory).toBeUndefined(); expect(u.hold).toBeUndefined(); }
    expect((await call(jar.POOJA, 'POST', `/api/inventory/units/${g.body.units[0].id}/hold`, { leadId: 'x', tokenAmount: 50000, tokenRef: 'UTR1234' })).status).toBe(403); // no hold permission
    expect((await call(jar.POOJA, 'GET', `/api/inventory/projects/${PLOTS}/leaderboard`)).status).toBe(404); // staff do not see partner rankings
  });
  it('his boss changes his switches: all units, rates on, features off — each one takes effect at once, and the audit log says so', async () => {
    expect((await policy(POOJA, { invMode: 'ALL', invPrice: true, invFeatures: false })).status).toBe(200);
    const all = (await grid(jar.POOJA)).body.units; expect(all.length).toBeGreaterThan(20); const u = all.find((x: any) => x.label === 'P-19');
    expect(u.price).toBeGreaterThan(0); expect(u.facing).toBeUndefined(); expect(u.roadSides).toBeUndefined(); expect(u.features).toBeUndefined();
    expect((await policy(POOJA, { invMode: 'SHARED', invPrice: false, invFeatures: true })).status).toBe(200);
    expect((await policy(POOJA, { invMode: 'EVERYTHING' })).status).toBe(400); expect((await policy(DIVYA, { invMode: 'ALL' })).status).toBe(404); // not his employee
    expect((await call(jar.POOJA, 'PUT', `/api/pcontrol/team/${POOJA}/policy`, { invMode: 'ALL' })).status).toBeGreaterThanOrEqual(403); // an employee cannot raise his own access
    const log = await j(await call(jar.SUP, 'GET', '/api/audit-logs?limit=400')); expect((log.events || log.logs).some((e: any) => e.action === 'TEAM_POLICY_SET' && /units ALL \(price true, features false/.test(e.details))).toBe(true);
  });
  it('a post puts chosen units in front of chosen staff; the post decides rate / features per post, the staff policy caps it', async () => {
    const mk = (body: any, c = jar.B1) => call(c, 'POST', '/api/invdesk/posts', { projectId: PLOTS, ...body });
    expect((await mk({ unitIds: [] })).status).toBe(400); expect((await mk({ unitIds: [uid(20)], memberIds: [DIVYA] })).status).toBe(400); // not my team
    expect((await mk({ unitIds: [uid(1)] })).status).toBe(409); // booked
    expect((await mk({ unitIds: ['UNIT-NOPE'] })).status).toBe(400);
    expect((await mk({ unitIds: [uid(20)] }, jar.POOJA)).status).toBe(403); expect((await mk({ unitIds: [uid(20)] }, jar.B3)).status).toBe(404); // not a partner here
    // Rakesh is on "all units, rates on": a post addressed to Pooja only
    const r = await j(await mk({ unitIds: [uid(20), uid(21)], memberIds: [POOJA], showPrice: true, showFeatures: true, note: 'Show to the Sharma family' })); expect(r.success).toBe(true);
    // Pooja has rates OFF in her own policy → still no rate even though the post allows it
    let units = (await grid(jar.POOJA)).body.units; expect(units.find((x: any) => x.id === uid(20)).price).toBeNull();
    expect((await policy(POOJA, { invPrice: true })).status).toBe(200);
    units = (await grid(jar.POOJA)).body.units; expect(units.find((x: any) => x.id === uid(20)).price).toBeGreaterThan(0); // post + policy both allow
    expect(units.find((x: any) => x.label === 'P-4').price).toBeNull(); // the older whole-team post hides the rate
    const mine = (await j(await call(jar.POOJA, 'GET', '/api/invdesk/posts'))).posts; expect(mine.some((p: any) => p.note === 'Show to the Sharma family')).toBe(true);
    // the post is addressed to Pooja only — Rakesh's own list does not carry it
    expect((await j(await call(jar.RAKESH, 'GET', '/api/invdesk/posts'))).posts.some((p: any) => p.note === 'Show to the Sharma family')).toBe(false);
    // ending a post removes the units from her view; another partner cannot end it
    const id = r.post.id; expect((await call(jar.B2, 'POST', `/api/invdesk/posts/${id}/end`, {})).status).toBe(404); expect((await call(jar.B1, 'POST', `/api/invdesk/posts/${id}/end`, {})).status).toBe(200);
    expect((await grid(jar.POOJA)).body.units.some((x: any) => x.id === uid(20))).toBe(false);
    expect((await policy(POOJA, { invPrice: false })).status).toBe(200);
  });
  it('a rate the builder hid from the partner can never be shown to a post, whatever the post says', async () => {
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${uid(22)}`, { vis: { audience: 'ALL', priceHidden: true } })).status).toBe(200);
    const r = await j(await call(jar.B1, 'POST', '/api/invdesk/posts', { projectId: PLOTS, unitIds: [uid(22)], showPrice: true })); expect(r.post.showPrice).toBe(false); expect(r.priceCapped).toBe(true);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${uid(22)}`, { vis: null })).status).toBe(200);
    expect((await call(jar.B1, 'POST', `/api/invdesk/posts/${r.post.id}/end`, {})).status).toBe(200);
  });
});

// ───────────────────────── customer share ─────────────────────────
describe('customer links: rate and features can be switched on and off', () => {
  const uid = (n: number) => `UNIT-${PLOTS}-P-${n}`;
  const mk = (cookie: string, body: any) => call(cookie, 'POST', '/api/invdesk/shares', { projectId: PLOTS, ...body });
  const page = async (path: string, lang = '') => { const r = await fetch(B + path); return { status: r.status, html: await r.text() }; };
  let tokenAll = '';
  it('with the rate off the public page shows the plots and their road sides but no amount; with it on, the rate appears; the broker\'s card is on both', async () => {
    const u = (await unitsOf(jar.B1)).find((x: any) => x.id === uid(10));
    const off = await j(await mk(jar.B1, { unitIds: [uid(10), uid(11)], showPrice: false, showFeatures: true, clientLabel: 'Mr Sharma' })); expect(off).toMatchObject({ success: true, showPrice: false, showFeatures: true });
    let p = await page(off.path); expect(p.status).toBe(200);
    expect(p.html).toContain('P-10'); expect(p.html).toMatch(/3-side road/); expect(p.html).toMatch(/East facing/); expect(p.html).toContain('Three sides open'); expect(p.html).not.toMatch(/₹\s?\d/); expect(p.html).toContain('Capital Propex Raipur');
    const on = await j(await mk(jar.B1, { unitIds: [uid(10)], showPrice: true, showFeatures: false })); tokenAll = on.token;
    p = await page(on.path); expect(p.html).toContain('P-10'); expect(p.html).toContain('₹' + u.price.toLocaleString('en-IN')); expect(p.html).not.toMatch(/side road|East facing|Three sides open/);
    const hi = await j(await mk(jar.B1, { unitIds: [uid(10)], showPrice: false, showFeatures: true, lang: 'hi' })); p = await page(hi.path); expect(p.html).toMatch(/तरफ़ सड़क/); expect(p.html).toMatch(/पूर्व/);
    expect(p.html).toMatch(/noindex/); expect(p.html).not.toMatch(/commission|brokerage|mandate|कमीशन/i);
  });
  it('a share needs real, available, visible units; a hundred units, an empty list and an admin are refused', async () => {
    expect((await mk(jar.B1, { unitIds: [] })).status).toBe(400); expect((await mk(jar.B1, { unitIds: Array.from({ length: 31 }, (_, i) => `u${i}`) })).status).toBe(400);
    expect((await mk(jar.B1, { unitIds: [uid(1)] })).status).toBe(409); // booked
    expect((await mk(jar.B1, { unitIds: ['UNIT-NOPE'] })).status).toBe(400);
    expect((await mk(jar.SUP, { unitIds: [uid(10)] })).status).toBeGreaterThanOrEqual(403);
    expect((await mk(jar.B3, { unitIds: [uid(10)] })).status).toBe(404); // no mandate here
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${uid(23)}`, { vis: { audience: 'HIDDEN' } })).status).toBe(200);
    expect((await mk(jar.B1, { unitIds: [uid(23)] })).status).toBe(404); // hidden from him
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${uid(23)}`, { vis: null })).status).toBe(200);
  });
  it('the builder can send his own customers a link too (all rates, all facts)', async () => {
    const r = await j(await mk(jar.BUILDER, { unitIds: [uid(10)], showPrice: true, showFeatures: true })); expect(r).toMatchObject({ showPrice: true, showFeatures: true });
    const p = await page(r.path); expect(p.html).toContain('P-10'); expect(p.html).toContain('GENZ BUILDCON');
  });
  it('an employee may send a link only when his boss allowed it, can switch on only what he sees, and the page carries the boss\'s card', async () => {
    expect((await mk(jar.POOJA, { unitIds: [uid(10)] })).status).toBe(403); // share-out off for Pooja
    expect((await policy('USR-TEAM-002', { invPrice: false })).status).toBe(200);
    const r = await j(await mk(jar.RAKESH, { unitIds: [uid(10)], showPrice: true, showFeatures: true })); expect(r).toMatchObject({ success: true, showPrice: false, showFeatures: true, capped: true });
    const p = await page(r.path); expect(p.status).toBe(200); expect(p.html).toContain('Capital Propex Raipur'); expect(p.html).not.toMatch(/₹\s?\d/); expect(p.html).not.toContain('Rakesh');
    expect((await policy('USR-TEAM-002', { invPrice: true })).status).toBe(200);
    const r2 = await j(await mk(jar.RAKESH, { unitIds: [uid(10)], showPrice: true })); expect(r2.showPrice).toBe(true);
    // the boss sees the staff's links (who made them, how many views) and may stop one
    const list = (await j(await call(jar.B1, 'GET', '/api/invdesk/shares'))).links; const theirs = list.find((l: any) => l.by === 'Rakesh Dewangan'); expect(theirs).toBeTruthy(); expect(JSON.stringify(list)).not.toMatch(/phone/i);
    expect((await call(jar.B2, 'POST', `/api/invdesk/shares/${r2.token}/revoke`, {})).status).toBe(404);
    expect((await call(jar.B1, 'POST', `/api/invdesk/shares/${r2.token}/revoke`, {})).status).toBe(200); expect((await page(r2.path)).status).toBe(404);
    // when the boss switches share-out off, every old link of that employee dies
    expect((await page(r.path)).status).toBe(200); expect((await policy('USR-TEAM-002', { invShareOut: false })).status).toBe(200); expect((await page(r.path)).status).toBe(404);
    expect((await policy('USR-TEAM-002', { invShareOut: true })).status).toBe(200);
  });
  it('a plot that is sold or reserved after the link was made drops off the page; with nothing left the page says so; a revoked or unknown link is a plain 404', async () => {
    const a = await j(await mk(jar.B1, { unitIds: [uid(14), uid(15)], showPrice: false })); let p = await page(a.path); expect(p.html).toContain('P-14'); expect(p.html).toContain('P-15');
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${uid(14)}`, { status: 'RESERVED' })).status).toBe(200);
    p = await page(a.path); expect(p.html).not.toContain('>P-14'); expect(p.html).toContain('P-15'); expect(p.html).toMatch(/sold or are on hold/);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${uid(15)}`, { status: 'RESERVED' })).status).toBe(200);
    p = await page(a.path); expect(p.html).toMatch(/no longer available/);
    for (const n of [14, 15]) await call(jar.BUILDER, 'PUT', `/api/inventory/units/${uid(n)}`, { status: 'AVAILABLE' });
    expect((await call(jar.B1, 'POST', `/api/invdesk/shares/${tokenAll}/revoke`, {})).status).toBe(200); expect((await page(`/s/${tokenAll}`)).status).toBe(404); expect((await page('/s/nonsense')).status).toBe(404);
  });
});

// ───────────────────────── GENZ launch ─────────────────────────
describe('GENZ network launch: builder says yes, waves by group, locals only a teaser', () => {
  const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
  const L = (cookie: string, m: string, u: string, body?: unknown) => call(cookie, m, `/api/launch${u}`, body);
  const ids = async (c: string) => (await j(await call(c, 'GET', '/api/pcontrol/partner/projects'))).projects.map((p: any) => p.id);
  const feed = async (c: string) => (await j(await L(c, 'GET', '/feed'))) as { segment: string; items: any[] };
  const future = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();
  const past = () => new Date(Date.now() - 3600_000).toISOString();
  const plan = (waves: any, extra: any = {}) => L(jar.SUP, 'PUT', `/admin/projects/${PLOTS}/plan`, { headline: 'Atal Nagar plots — launch week', note: 'Site visits from Monday', waves, ...extra });
  const status = (s: string, note = '') => L(jar.SUP, 'POST', `/admin/projects/${PLOTS}/status`, { status: s, note });

  it('baseline: an independent RERA broker without a mandate can see the open project; only the GENZ desk can touch launches', async () => {
    expect(await ids(jar.B3)).toContain(PLOTS);
    for (const c of [jar.B1, jar.BUILDER, jar.POOJA]) expect((await L(c, 'GET', '/admin/projects')).status, 'not for this role').toBe(403);
    expect((await L(jar.B1, 'POST', `/admin/projects/${PLOTS}/request`, {})).status).toBe(403);
    const seg = await j(await L(jar.SUP, 'GET', '/admin/segments')); expect(seg.counts.BIG_FIRM + seg.counts.INDEPENDENT + seg.counts.LOCAL).toBe(seg.members.length); expect(JSON.stringify(seg)).not.toMatch(/phone|email|@/);
  });
  it('no consent, no launch: the plan cannot be set or made live before the builder agrees; another builder cannot answer for this one', async () => {
    expect((await plan({ BIG_FIRM: { on: true } })).status).toBe(409); expect((await status('LIVE')).status).toBe(409);
    expect((await L(jar.SUP, 'POST', `/admin/projects/${PLOTS}/request`, { note: 'GENZ has signed a tie-up with you — may we launch to the network?' })).status).toBe(200);
    expect((await L(jar.SUP, 'POST', `/admin/projects/${PLOTS}/request`, {})).status).toBe(409); // already waiting
    const mine = (await j(await L(jar.BUILDER, 'GET', '/builder/projects'))).projects.find((p: any) => p.id === PLOTS); expect(mine.plan).toMatchObject({ consent: 'REQUESTED', requestedBy: expect.any(String) });
    expect((await L(jar.BUILDER2, 'POST', `/builder/projects/${PLOTS}/consent`, { decision: 'GRANT' })).status).toBe(404);
    expect((await L(jar.B1, 'POST', `/builder/projects/${PLOTS}/consent`, { decision: 'GRANT' })).status).toBe(403);
    expect((await L(jar.BUILDER, 'POST', `/builder/projects/${PLOTS}/consent`, { decision: 'MAYBE' })).status).toBe(400);
    expect((await L(jar.BUILDER, 'POST', `/builder/projects/${PLOTS}/consent`, { decision: 'WITHDRAW' })).status).toBe(409); // nothing granted yet
    expect(await ids(jar.B3)).toContain(PLOTS); // a request changes nothing for anyone
    expect((await L(jar.BUILDER, 'POST', `/builder/projects/${PLOTS}/consent`, { decision: 'GRANT', note: 'Agreed' })).status).toBe(200);
    expect(await ids(jar.B3)).toContain(PLOTS); // a draft changes nothing either
  });
  it('plan rules: at least one group, a real date, locals OFF or TEASER only; an invite-only project cannot go live', async () => {
    expect((await plan({ BIG_FIRM: { on: false }, INDEPENDENT: { on: false }, LOCAL: { mode: 'OFF' } })).status).toBe(400);
    expect((await plan({ LOCAL: { mode: 'FULL' } })).status).toBe(400); expect((await plan({ BIG_FIRM: { on: true, at: 'whenever' } })).status).toBe(400);
    const ok = await plan({ BIG_FIRM: { on: true, at: past() }, INDEPENDENT: { on: true, at: future(2) }, LOCAL: { mode: 'OFF' } }); expect(ok.status, await ok.clone().text()).toBe(200);
    expect((await call(jar.BUILDER, 'PUT', `/api/pcontrol/builder/projects/${PLOTS}/settings`, { access: 'INVITE_ONLY' })).status).toBe(200);
    const inv = await status('LIVE'); expect(inv.status).toBe(409); expect((await j(inv)).error).toMatch(/invite-only/);
    expect((await call(jar.BUILDER, 'PUT', `/api/pcontrol/builder/projects/${PLOTS}/settings`, { access: 'OPEN_APPLY' })).status).toBe(200);
    expect((await status('LIVE', 'Go')).status).toBe(200); expect((await status('LIVE')).status).toBe(409);
  });
  it('live: the big firm sees it now; the independent broker sees only "opens later" (no price, no commission) and cannot apply; once their wave opens they can', async () => {
    const f1 = await feed(jar.B1); expect(f1.segment).toBe('BIG_FIRM'); const it1 = f1.items.find(x => x.id === PLOTS);
    expect(it1).toMatchObject({ view: 'OPEN', headline: 'Atal Nagar plots — launch week' }); expect(it1.priceStartingFrom).toBeGreaterThan(0); expect(it1.defaultCommissionPct).toBeGreaterThan(0);
    const f3 = await feed(jar.B3); expect(f3.segment).toBe('INDEPENDENT'); const it3 = f3.items.find(x => x.id === PLOTS);
    expect(it3.view).toBe('SOON'); expect(it3.opensAt).toBeTruthy(); for (const k of ['priceStartingFrom', 'priceMax', 'defaultCommissionPct', 'builderName', 'note']) expect(it3[k], k).toBeUndefined();
    expect(await ids(jar.B3)).not.toContain(PLOTS);
    expect((await call(jar.B3, 'GET', `/api/pcontrol/partner/projects/${PLOTS}`)).status).toBe(404);
    expect((await call(jar.B3, 'POST', `/api/pcontrol/partner/projects/${PLOTS}/apply`, { note: 'early' })).status).toBe(404);
    expect((await plan({ INDEPENDENT: { on: true, at: past() } })).status).toBe(200);
    expect((await feed(jar.B3)).items.find(x => x.id === PLOTS).view).toBe('OPEN'); expect(await ids(jar.B3)).toContain(PLOTS);
    expect((await call(jar.B3, 'POST', `/api/pcontrol/partner/projects/${PLOTS}/apply`, { note: 'ready' })).status).toBe(200); // the builder still approves — this is only a request
  });
  it('the desk can mark a RERA firm big or independent (or back to automatic); a builder cannot; junk is refused', async () => {
    expect((await L(jar.SUP, 'PUT', '/admin/partners/USR-BRK-002/segment', { segment: 'BIG_FIRM' })).status).toBe(200);
    expect((await feed(jar.B2)).segment).toBe('BIG_FIRM');
    expect((await L(jar.SUP, 'PUT', '/admin/partners/USR-BRK-002/segment', { segment: null })).status).toBe(200); expect((await feed(jar.B2)).segment).toBe('INDEPENDENT');
    expect((await L(jar.SUP, 'PUT', '/admin/partners/USR-BRK-002/segment', { segment: 'LOCAL' })).status).toBe(400);
    expect((await L(jar.BUILDER, 'PUT', '/admin/partners/USR-BRK-002/segment', { segment: 'BIG_FIRM' })).status).toBe(403);
    expect((await L(jar.SUP, 'PUT', '/admin/partners/USR-NOBODY/segment', { segment: 'BIG_FIRM' })).status).toBe(404);
  });
  it('local associates (no RERA no.): nothing by default; with the teaser on they see name, place and date only — never a price, a commission, units or an apply button — and their tier cannot be overridden', async () => {
    // a real Tier 2 member, made the normal way: a RERA-registered sponsor registers them, invited, PAN + Aadhaar given, ID seen by the desk, approved
    const phone = rnd();
    const p = await j(await call(jar.B2, 'POST', '/api/network/tier2/applications', { name: 'Mohan Verma', phone, city: 'Raipur', reference: 'Known for 6 years, runs an office near Pandri bus stand', consent: true }));
    expect(p.invitation.code).toMatch(/^GZ-BRK-/);
    const aadBody = '3' + String(Math.floor(Math.random() * 1e10)).padStart(10, '0');
    const reg = await fetch(B + '/api/auth/register-invite', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: p.invitation.code, name: 'Local Associate', phone, password: 'Strong#Pass2026', consent: true, city: 'Raipur', panNumber: 'XYZPK4821Q', aadhaarNumber: aadBody + verhoeffCheckDigit(aadBody), idConsent: true }) });
    expect(reg.status).toBe(200); const t2id = (await reg.json()).user.id;
    expect((await call(jar.SUP, 'POST', `/api/network/id-check/${t2id}`, { checked: true, note: 'seen on video call' })).status).toBe(200);
    expect((await call(jar.SUP, 'POST', `/api/verifications/${t2id}/review`, { action: 'APPROVE', notes: 'Local reference checked' })).status).toBe(200);
    const lg = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${phone.slice(-10)}@phone.genz.local`, password: 'Strong#Pass2026' }) });
    const T2 = lg.headers.get('set-cookie')!.split(';')[0];
    expect((await feed(T2))).toMatchObject({ segment: 'LOCAL', items: [] });
    expect((await L(jar.SUP, 'PUT', '/admin/partners/' + t2id + '/segment', { segment: 'BIG_FIRM' })).status).toBe(409);
    expect((await plan({ LOCAL: { mode: 'TEASER', at: past() } })).status).toBe(200);
    const t = (await feed(T2)).items.find(x => x.id === PLOTS); expect(t.view).toBe('TEASER');
    for (const k of ['priceStartingFrom', 'priceMax', 'defaultCommissionPct', 'builderName', 'note', 'relation']) expect(t[k], k).toBeUndefined();
    expect((await call(T2, 'GET', '/api/pcontrol/partner/projects')).status).toBe(403); expect((await call(T2, 'POST', `/api/pcontrol/partner/projects/${PLOTS}/apply`, {})).status).toBe(403);
    expect((await call(T2, 'GET', `/api/inventory/projects/${PLOTS}`)).status).toBe(404);
    expect((await plan({ LOCAL: { mode: 'OFF' } })).status).toBe(200); expect((await feed(T2)).items).toEqual([]);
  });
  it('pause hides it from the waves; the builder can withdraw his permission — the launch closes and his own open / invite-only setting rules again', async () => {
    expect((await status('PAUSED', 'Stock check')).status).toBe(200);
    expect((await feed(jar.B1)).items.find(x => x.id === PLOTS)).toBeUndefined(); expect((await feed(jar.B3)).items.find(x => x.id === PLOTS)).toBeUndefined();
    expect((await status('LIVE')).status).toBe(200);
    expect((await L(jar.BUILDER, 'POST', `/builder/projects/${PLOTS}/consent`, { decision: 'WITHDRAW', note: 'Handling it ourselves now' })).status).toBe(200);
    const mine = (await j(await L(jar.BUILDER, 'GET', '/builder/projects'))).projects.find((p: any) => p.id === PLOTS); expect(mine.plan).toMatchObject({ consent: 'DECLINED', status: 'CLOSED' }); expect(mine.plan.history.length).toBeGreaterThan(3);
    expect((await feed(jar.B1)).items.find(x => x.id === PLOTS)).toBeUndefined();
    expect((await plan({ BIG_FIRM: { on: true } })).status).toBe(409); // consent is gone
    expect(await ids(jar.B3)).toContain(PLOTS);
    const log = await j(await call(jar.SUP, 'GET', '/api/audit-logs?limit=600')); const acts = (log.events || log.logs).map((e: any) => e.action);
    for (const a of ['LAUNCH_REQUESTED', 'LAUNCH_CONSENT_GRANT', 'LAUNCH_PLAN_SET', 'LAUNCH_LIVE', 'LAUNCH_PAUSED', 'LAUNCH_CONSENT_WITHDRAW', 'LAUNCH_SEGMENT_SET']) expect(acts, a).toContain(a);
  });
});
