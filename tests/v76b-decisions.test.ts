import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { teamMaxFor, TEAM_MAX_DEFAULT } from '../src/shared/crmSales.js';
import { cleanIncentive, incentiveOf, incentiveLabel, incentiveBaseFor, isOwnBooking } from '../src/shared/incentiveRules.js';
import { expiryStep, type OwnerListingState } from '../src/shared/ownerListRules.js';

/** v76b — the owner's decisions after v76: incentive as % or ₹, team limit set by the superadmin, ₹49 / 15-day owner plan with expiry alerts,
 *  a team member cannot delete his data and downloads only a limited file. */
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

describe('incentive: a percentage or a fixed value', () => {
  const bks = [{ brokerage: 60_000, value: 2_000_000 }, { brokerage: 30_000, value: 1_000_000 }];
  it('a broker\'s % is taken on the brokerage (fixed when the project was assigned), a builder\'s on the booking value', () => {
    expect(incentiveBaseFor('BROKER')).toBe('BROKERAGE'); expect(incentiveBaseFor('DEVELOPER_BUILDER')).toBe('VALUE'); expect(incentiveBaseFor('CONTRACTOR')).toBeNull();
    expect(incentiveOf({ incentivePct: 10 }, 'BROKER', bks)).toBe(9_000);
    expect(incentiveOf({ incentivePct: 0.5 }, 'DEVELOPER_BUILDER', bks)).toBe(15_000);
  });
  it('the fixed option pays ₹ for every approved booking, whatever the brokerage', () => {
    expect(incentiveOf({ incentiveMode: 'FIXED', incentiveFixed: 5_000, incentivePct: 40 }, 'BROKER', bks)).toBe(10_000);
    expect(incentiveOf({ incentiveMode: 'FIXED', incentiveFixed: 5_000 }, 'DEVELOPER_BUILDER', bks)).toBe(10_000);
    expect(incentiveOf({ incentiveMode: 'FIXED', incentiveFixed: 5_000 }, 'BROKER', [])).toBe(0);
  });
  it('no bookings or not a broker / builder = no incentive; no mode means the old percentage', () => {
    expect(incentiveOf({ incentivePct: 10 }, 'CONTRACTOR', bks)).toBe(0); expect(incentiveOf({ incentivePct: 10 }, 'BROKER', [])).toBe(0);
    expect(incentiveOf({}, 'BROKER', bks)).toBe(0); expect(incentiveOf({ incentiveMode: undefined, incentivePct: 10 }, 'BROKER', bks)).toBe(9_000);
  });
  it('what the employer types is checked', () => {
    expect(cleanIncentive('BROKER', { pct: 12.345 })).toEqual({ incentivePct: 12.35 });
    expect(cleanIncentive('BROKER', { mode: 'FIXED', fixed: 2500 })).toEqual({ incentiveMode: 'FIXED', incentiveFixed: 2500 });
    expect(cleanIncentive('BROKER', { pct: 80 })).toMatch(/0% and 50% of brokerage/);
    expect(cleanIncentive('DEVELOPER_BUILDER', { pct: 11 })).toMatch(/0% and 10% of the booking value/);
    expect(cleanIncentive('DEVELOPER_BUILDER', { pct: 2 })).toEqual({ incentivePct: 2 });
    expect(typeof cleanIncentive('BROKER', { mode: 'BOTH' })).toBe('string');
    for (const f of [-1, 1.5, 500_001, 'x']) expect(typeof cleanIncentive('BROKER', { fixed: f }), String(f)).toBe('string');
    expect(typeof cleanIncentive('CONTRACTOR', { pct: 1 })).toBe('string');
  });
  it('the line on screen says which one it is, in both languages', () => {
    expect(incentiveLabel({ incentivePct: 10 }, 'BROKER')).toBe('10% of brokerage');
    expect(incentiveLabel({ incentivePct: 0.5 }, 'DEVELOPER_BUILDER')).toBe('0.5% of booking value');
    expect(incentiveLabel({ incentiveMode: 'FIXED', incentiveFixed: 5000 }, 'BROKER')).toBe('₹5,000 per booking');
    expect(incentiveLabel({ incentiveMode: 'FIXED', incentiveFixed: 5000 }, 'BROKER', true)).toContain('प्रति बुकिंग');
    expect(incentiveLabel({ incentivePct: 10 }, 'BROKER', true)).toContain('ब्रोकरेज');
  });
  it('a booking counts for a broker when it is his client\'s, for a builder when it is in his project', () => {
    expect(isOwnBooking('BROKER', 'B1', { associateId: 'B1', builderId: 'X' })).toBe(true);
    expect(isOwnBooking('BROKER', 'B1', { associateId: 'B2', builderId: 'B1' })).toBe(false);
    expect(isOwnBooking('DEVELOPER_BUILDER', 'X', { associateId: 'B1', builderId: 'X' })).toBe(true);
    expect(isOwnBooking('CONTRACTOR', 'X', { associateId: 'X', builderId: 'X' })).toBe(false);
  });
});

describe('team limit figure', () => {
  it('the superadmin\'s figure for a person beats the one for his kind, which beats the built-in one; nonsense is ignored', () => {
    expect(teamMaxFor('BROKER')).toBe(TEAM_MAX_DEFAULT); expect(teamMaxFor('DEVELOPER_BUILDER')).toBe(60); expect(teamMaxFor('CONTRACTOR')).toBe(30);
    expect(teamMaxFor('BROKER', { BROKER: 25 })).toBe(25);
    expect(teamMaxFor('BROKER', { BROKER: 25 }, 40)).toBe(40);
    expect(teamMaxFor('DEVELOPER_BUILDER', { BROKER: 25 })).toBe(60);
    expect(teamMaxFor('BROKER', { BROKER: 0 }, 9999)).toBe(TEAM_MAX_DEFAULT);
    expect(teamMaxFor('BROKER', { BROKER: 2.5 })).toBe(TEAM_MAX_DEFAULT);
  });
});

describe('owner listing: ₹49 for 15 days, with a reminder before it ends', () => {
  const day = 86_400_000; const now = Date.parse('2026-11-01T10:00:00Z');
  const prop = (over: Partial<OwnerListingState> = {}, status = 'active') => ({ listingStatus: status, ownerListing: { planId: 'P', planName: 'x', fee: 49, durationDays: 15, refundable: false, feeStatus: 'PAID', requests: [], createdAt: '', liveUntil: new Date(now + 10 * day).toISOString(), ...over } as OwnerListingState });
  const at = (days: number, over: Partial<OwnerListingState> = {}) => prop({ liveUntil: new Date(now + days * day).toISOString(), ...over });
  it('nothing for ten days, a warning at 3 days, another at 1 day, then it ends — each warning once', () => {
    expect(expiryStep(at(10), now)).toBeNull();
    expect(expiryStep(at(3), now)).toBe('WARN3');
    expect(expiryStep(at(2.5), now)).toBe('WARN3');
    expect(expiryStep(at(2.5, { expWarn: 3 }), now)).toBeNull();
    expect(expiryStep(at(0.9, { expWarn: 3 }), now)).toBe('WARN1');
    expect(expiryStep(at(0.9), now)).toBe('WARN1');                          // a listing found late still gets the last warning
    expect(expiryStep(at(0.9, { expWarn: 1 }), now)).toBeNull();
    expect(expiryStep(at(-0.001), now)).toBe('END');
    expect(expiryStep(at(-5, { expWarn: 1 }), now)).toBe('END');
  });
  it('only a PAID, un-assigned listing in the pool is watched', () => {
    expect(expiryStep(at(2, { feeStatus: 'PENDING' }), now)).toBeNull(); expect(expiryStep(at(2, { feeStatus: 'WAIVED_BROKER' }), now)).toBeNull();
    expect(expiryStep(at(2, { assignedBrokerId: 'USR-BRK-001' }), now)).toBeNull(); expect(expiryStep(at(2, { matchedAt: '2026-10-01' }), now)).toBeNull();
    expect(expiryStep({ ...at(2), listingStatus: 'draft' }, now)).toBeNull(); expect(expiryStep({ listingStatus: 'active' }, now)).toBeNull();
    expect(expiryStep(at(2, { liveUntil: 'not a date' }), now)).toBeNull();
  });
  it('the sweep is wired in: hourly, at start, and lazily when the owner screens open', () => {
    const o = read('server/ownerlist.ts');
    expect(o).toContain('expiryStep(p, now)'); expect(o).toMatch(/r\.use\(\(_req, _res, next\) => \{ lazySweep\(\); next\(\); \}\)/); expect(o).toContain('o.expWarn = undefined');
    expect(read('server.ts')).toContain("['ownerListings', sweepOwnerListings]");
  });
});

const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (c: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const j = async (r: Response) => r.json();
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v76b-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: 'a1'.repeat(32), SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  const ids: Record<string, string> = {
    SUP: cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').id, ADMIN: 'USR-ADMIN-1', BRK: 'USR-BRK-002', BUILDER: 'USR-BUILDER-002', CON: 'USR-CONTRACTOR-001',
    M_BRK: 'USR-TEAM-003', OWNER: 'USR-OWNER-001',
  };
  for (const [k, id] of Object.entries(ids)) jar[k] = await login(id);
}, 90000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

describe('team limit is in the superadmin\'s hands', () => {
  const add = (phone: string) => call(jar.BRK, 'POST', '/api/team', { name: 'Test Person', phone, role: 'TELECALLER', consentAttested: true });
  it('only the superadmin may see or change it', async () => {
    expect((await call(jar.SUP, 'GET', '/api/admin/team-limits')).status).toBe(200);
    expect((await call(jar.ADMIN, 'GET', '/api/admin/team-limits')).status).toBe(403);
    expect((await call(jar.ADMIN, 'PUT', '/api/admin/team-limits/role', { role: 'BROKER', max: 99 })).status).toBe(403);
    for (const who of ['BRK', 'BUILDER', 'CON', 'OWNER', 'M_BRK']) expect((await call(jar[who], 'PUT', '/api/admin/team-limits/role', { role: 'BROKER', max: 99 })).status, who).toBe(403);
    expect((await call(undefined, 'GET', '/api/admin/team-limits')).status).toBe(401);
  });
  it('starts at the built-in figures: broker 15, builder 60, contractor 30', async () => {
    const d = await j(await call(jar.SUP, 'GET', '/api/admin/team-limits'));
    expect(Object.fromEntries(d.roles.map((r: any) => [r.role, r.cap]))).toEqual({ BROKER: 15, DEVELOPER_BUILDER: 60, CONTRACTOR: 30 });
    expect(d.employers.some((e: any) => e.id === 'USR-BRK-002' && e.used === 2 && e.cap === 15)).toBe(true);
  });
  it('wrong figures are refused', async () => {
    for (const max of [0, -3, 501, 2.5, 'ten', undefined]) expect((await call(jar.SUP, 'PUT', '/api/admin/team-limits/role', { role: 'BROKER', max })).status, String(max)).toBe(400);
    expect((await call(jar.SUP, 'PUT', '/api/admin/team-limits/role', { role: 'OWNER', max: 5 })).status).toBe(400);
    expect((await call(jar.SUP, 'PUT', '/api/admin/team-limits/user/USR-OWNER-001', { max: 5 })).status).toBe(404);
    expect((await call(jar.SUP, 'PUT', '/api/admin/team-limits/user/NOPE', { max: 5 })).status).toBe(404);
  });
  it('a lower figure for brokers stops the next addition; nobody is removed', async () => {
    expect((await call(jar.SUP, 'PUT', '/api/admin/team-limits/role', { role: 'BROKER', max: 2 })).status).toBe(200);
    const r = await add('9811100001'); expect(r.status).toBe(409); const b = await j(r); expect(b.code).toBe('TEAM_LIMIT'); expect(b.cap).toBe(2);
    const t = await j(await call(jar.BRK, 'GET', '/api/team')); expect(t.max).toBe(2); expect(t.members.length).toBe(2);
  });
  it('one person can be given more, and the figure comes back when the override is cleared', async () => {
    const s = await call(jar.SUP, 'PUT', '/api/admin/team-limits/user/USR-BRK-002', { max: 3 }); expect(s.status).toBe(200);
    expect((await j(await call(jar.BRK, 'GET', '/api/team'))).max).toBe(3);
    const ok = await add('9811100002'); expect(ok.status, await ok.clone().text()).toBe(200);
    expect((await add('9811100003')).status).toBe(409);
    // another broker is still on the kind's figure of 2
    const d = await j(await call(jar.SUP, 'GET', '/api/admin/team-limits'));
    expect(d.employers.find((e: any) => e.id === 'USR-BRK-002')).toMatchObject({ override: 3, cap: 3, used: 3 });
    expect(d.employers.find((e: any) => e.id === 'USR-BRK-001').override).toBeNull();
    await call(jar.SUP, 'PUT', '/api/admin/team-limits/user/USR-BRK-002', { max: null });
    expect((await j(await call(jar.BRK, 'GET', '/api/team'))).max).toBe(2);
    await call(jar.SUP, 'PUT', '/api/admin/team-limits/role', { role: 'BROKER', max: null });
    expect((await j(await call(jar.BRK, 'GET', '/api/team'))).max).toBe(15);
  });
  it('the change is in the audit trail', async () => {
    const a = await j(await call(jar.SUP, 'GET', '/api/audit-logs?limit=300&q=TEAM_LIMIT'));
    expect(JSON.stringify(a)).toContain('TEAM_LIMIT_CHANGED');
  });
});

describe('a member\'s incentive: % or ₹', () => {
  it('a broker can switch a member to a fixed ₹ per booking and back', async () => {
    const f = await call(jar.BRK, 'PUT', '/api/team/USR-TEAM-003', { incentiveMode: 'FIXED', incentiveFixed: 5000 }); expect(f.status, await f.clone().text()).toBe(200);
    const m = (await j(await call(jar.BRK, 'GET', '/api/team'))).members.find((x: any) => x.id === 'USR-TEAM-003');
    expect(m).toMatchObject({ incentiveMode: 'FIXED', incentiveFixed: 5000 });
    const inc = await j(await call(jar.BRK, 'GET', '/api/team/incentives'));
    expect(inc.base).toBe('BROKERAGE'); expect(inc.rows.find((x: any) => x.id === 'USR-TEAM-003')).toMatchObject({ incentiveMode: 'FIXED', incentiveFixed: 5000 });
    expect((await call(jar.BRK, 'PUT', '/api/team/USR-TEAM-003', { incentiveMode: 'PCT', incentivePct: 12.5 })).status).toBe(200);
    expect((await j(await call(jar.BRK, 'GET', '/api/team'))).members.find((x: any) => x.id === 'USR-TEAM-003')).toMatchObject({ incentiveMode: 'PCT', incentivePct: 12.5, incentiveFixed: 5000 });
  });
  it('wrong figures are refused; one broker cannot touch another\'s member', async () => {
    for (const body of [{ incentiveMode: 'BOTH' }, { incentiveFixed: -1 }, { incentiveFixed: 1.5 }, { incentiveFixed: 600000 }, { incentivePct: 80 }, { incentivePct: -2 }]) expect((await call(jar.BRK, 'PUT', '/api/team/USR-TEAM-003', body)).status, JSON.stringify(body)).toBe(400);
    expect((await call(jar.BUILDER, 'PUT', '/api/team/USR-TEAM-003', { incentivePct: 5 })).status).toBe(404);
  });
  it('a builder\'s % is of the booking value (up to 10%), a contractor has no incentive', async () => {
    expect((await call(jar.BUILDER, 'PUT', '/api/team/USR-TEAM-007', { incentivePct: 0.5 })).status).toBe(200);
    const bad = await call(jar.BUILDER, 'PUT', '/api/team/USR-TEAM-007', { incentivePct: 11 }); expect(bad.status).toBe(400); expect((await j(bad)).error).toMatch(/booking value/);
    const inc = await j(await call(jar.BUILDER, 'GET', '/api/team/incentives')); expect(inc.base).toBe('VALUE'); expect(inc.rows.find((x: any) => x.id === 'USR-TEAM-007')).toMatchObject({ incentivePct: 0.5, firmShareAccrued: 0 });
    expect((await call(jar.CON, 'PUT', '/api/team/USR-TEAM-008', { incentivePct: 3 })).status).toBe(400);
  });
  it('the HR pay list carries the line for the employer only', async () => {
    const t = await j(await call(jar.BRK, 'GET', '/api/hr/targets'));
    expect(t.rows.find((x: any) => x.id === 'USR-TEAM-003').incentiveEn).toBe('12.5% of brokerage');
    expect(JSON.stringify(await j(await call(jar.M_BRK, 'GET', '/api/hr/me')))).not.toMatch(/incentive/i);
  });
});

describe('owner listing plans', () => {
  const quote = async (tx: string) => (await j(await call(jar.BRK, 'GET', `/api/owner-listing/quote?transactionType=${tx}&propertyType=Residential%20Flat`))).plan;
  it('starts with one plan: ₹49 for 15 days, any kind of property', async () => {
    const c = await j(await call(jar.BRK, 'GET', '/api/owner-listing/config'));
    expect(c.plans.length).toBe(1);
    expect(c.plans[0]).toMatchObject({ fee: 49, durationDays: 15, transactionTypes: [], propertyTypes: [] });
    for (const t of ['Sale', 'Rent', 'Lease']) expect(await quote(t), t).toMatchObject({ fee: 49, durationDays: 15 });
  });
  it('the superadmin adds a bigger plan and edits the starting one; owners get the most specific', async () => {
    const big = await call(jar.SUP, 'POST', '/api/owner-listing/admin/plans', { name: 'Sale — 45 days', transactionTypes: ['Sale'], propertyTypes: [], fee: 149, durationDays: 45, maxPhotos: 20, maxActivePerOwner: 5, refundable: false });
    expect(big.status, await big.clone().text()).toBe(200);
    expect(await quote('Sale')).toMatchObject({ fee: 149, durationDays: 45 }); expect(await quote('Rent')).toMatchObject({ fee: 49, durationDays: 15 });
    const id = (await j(await call(jar.BRK, 'GET', '/api/owner-listing/config'))).plans.find((p: any) => p.fee === 49).id;
    expect((await call(jar.SUP, 'PUT', `/api/owner-listing/admin/plans/${id}`, { fee: 59 })).status).toBe(200);
    expect(await quote('Rent')).toMatchObject({ fee: 59 });
  });
  it('a broker or an owner cannot change a plan', async () => {
    for (const who of ['BRK', 'OWNER', 'M_BRK']) expect((await call(jar[who], 'POST', '/api/owner-listing/admin/plans', { name: 'cheap', fee: 1, durationDays: 5, maxPhotos: 5, maxActivePerOwner: 1 })).status, who).toBe(403);
  });
});

describe('a team member cannot delete his data and downloads a limited file', () => {
  it('he can ask for a correction or write a complaint, not an erasure', async () => {
    const r = await call(jar.M_BRK, 'POST', '/api/privacy/requests', { type: 'ERASURE' });
    expect(r.status).toBe(403); const b = await j(r); expect(b.code).toBe('TEAM_MEMBER_NO_ERASE'); expect(/[ऀ-ॿ]/.test(b.hi)).toBe(true);
    expect((await call(jar.M_BRK, 'POST', '/api/privacy/requests', { type: 'CORRECTION', details: 'my mobile number is written wrong' })).status).toBe(200);
    expect((await call(jar.M_BRK, 'POST', '/api/privacy/requests', { type: 'GRIEVANCE', details: 'my leave was not counted' })).status).toBe(200);
    // everybody else keeps the right to ask (a person who is not an employee's record-holder)
    expect((await call(jar.OWNER, 'POST', '/api/privacy/requests', { type: 'ERASURE' })).status).toBe(200);
    const mine = (await j(await call(jar.M_BRK, 'GET', '/api/privacy/requests'))).requests; expect(mine.some((x: any) => x.type === 'ERASURE')).toBe(false);
  });
  it('his download holds his work profile and his own HR record — no customers, deals or audit trail', async () => {
    const x = await j(await call(jar.M_BRK, 'GET', '/api/privacy/export'));
    expect(x.scope).toBe('LIMITED'); expect(Object.keys(x).sort()).toEqual(['calls', 'exportedAt', 'hr', 'note', 'policyVersion', 'privacyRequests', 'profile', 'scope']);
    expect(x.profile).toMatchObject({ id: 'USR-TEAM-003', name: expect.any(String), teamTitle: expect.any(String) });
    expect(JSON.stringify(x)).not.toMatch(/passwordHash|crmLeads|dealRooms|auditEventsByYou|sessionVersion|@phone\.genz\.local/);
  });
  it('an employer\'s own download is still the full one', async () => {
    const x = await j(await call(jar.BRK, 'GET', '/api/privacy/export'));
    expect(x.scope).toBeUndefined(); for (const k of ['profile', 'crmLeads', 'dealRooms', 'auditEventsByYou', 'hr']) expect(x, k).toHaveProperty(k);
  });
});

describe('screens', () => {
  it('Members: % or ₹ chooser, hidden for a contractor; the incentive table follows the employer', () => {
    const t = read('src/components/TeamView.tsx');
    expect(t).toContain('<option value="PCT">%</option><option value="FIXED">₹</option>'); expect(t).toContain("employerRole !== 'CONTRACTOR' && <td><IncentiveCell");
    expect(t).toContain("inc.base === 'VALUE'"); expect(t).toContain('incentiveLabel(r, role');
  });
  it('Control Center shows the team-limit card; it renders nothing for anyone the server refuses', () => {
    expect(read('src/components/ControlCenter.tsx')).toContain('<TeamLimitsAdmin />');
    const c = read('src/components/TeamLimitsAdmin.tsx');
    expect(c).toContain('.catch(() => setD(null))'); expect(c).toContain('if (!d) return null');
    for (const m of c.matchAll(/\btx\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g)) expect(/[ऀ-ॿ]/.test(m[2]), m[1]).toBe(true);
    expect(read('server.ts')).toContain("app.use('/api/admin/team-limits', createTeamLimitsRouter())");
  });
  it('My data: no erase button for a team member, with the reason', () => {
    const p = read('src/components/PrivacyCenter.tsx');
    expect(p).toContain("role !== 'TEAM_MEMBER' && <button onClick={() => file('ERASURE')}"); expect(p).toContain('data-testid="member-no-erase"');
  });
});
