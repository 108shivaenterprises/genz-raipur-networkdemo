import { freePort } from './helpers/port';
/**
 * v108 — a unit "block" (the old hold) as a clock, and the unit grid as a building.
 *   · pure rules: which units form a tower × floor picture (top floor first, nothing dropped), how a countdown reads and changes colour,
 *     which token amounts are offered, why a unit cannot be blocked (the same refusals the server makes);
 *   · server: the partner's own count of blocks used (caps.holds), the builder's desk is told the moment a unit is blocked (first name only),
 *     the broker is told 15 minutes before it ends — once — and when it has ended; a booking-pending hold (no clock) is never swept;
 *   · a block stays a RECORD (token + receipt number the broker typed) — GENZ moves no money.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { towerRows, isTower, floorLabel, statusCounts, clock, holdTone, holdLeftMs, holdElapsed, tokenChips, canBlock } from '../src/shared/blockGridRules';

// ───────────────────────── pure rules ─────────────────────────
const U = (label: string, floor: number | null | undefined, status = 'AVAILABLE', group = 'Tower A') => ({ id: label, label, group, floor, status });

describe('the tower picture', () => {
  it('floors become rows, the top floor first; units inside a floor are in natural order (A-2 before A-10)', () => {
    const list = [U('A-201', 2), U('A-101', 1), U('A-102', 1), U('A-10', 1), U('A-2', 1), U('A-301', 3), U('A-001', 0)];
    const t = towerRows(list);
    expect(t.rows.map(r => r.floor)).toEqual([3, 2, 1, 0]);
    expect(t.rows.find(r => r.floor === 1)!.units.map(u => u.label)).toEqual(['A-2', 'A-10', 'A-101', 'A-102']);
    expect(t.cols).toBe(4);
  });
  it('a unit with no floor is never dropped — it goes to a last row; every unit appears exactly once', () => {
    const list = [U('A-101', 1), U('A-201', 2), U('SHOP-1', null), U('SHOP-2', undefined), U('A-102', 1)];
    const t = towerRows(list);
    expect(t.noFloor.map(u => u.label)).toEqual(['SHOP-1', 'SHOP-2']);
    const all = [...t.rows.flatMap(r => r.units), ...t.noFloor].map(u => u.id).sort();
    expect(all).toEqual(list.map(u => u.id).sort());
    expect(towerRows([]).cols).toBe(1);
  });
  it('a group reads as a building only with two or more floors and most units on a floor — plots and villas keep the plain grid', () => {
    expect(isTower([U('A-101', 1), U('A-201', 2), U('A-102', 1)])).toBe(true);
    expect(isTower([U('A-101', 1), U('A-102', 1)])).toBe(false);                       // one floor only
    expect(isTower([U('P-1', null), U('P-2', null), U('P-3', null)])).toBe(false);     // plots
    expect(isTower([U('A-101', 1), U('A-201', 2), U('x', null), U('y', null), U('z', null)])).toBe(false); // most have no floor
    expect(isTower([])).toBe(false);
  });
  it('ground floor reads G (भू in Hindi); the status bar counts the four states and ignores strangers', () => {
    expect(floorLabel(0)).toBe('G'); expect(floorLabel(0, true)).toBe('भू'); expect(floorLabel(7)).toBe('7');
    expect(statusCounts([{ status: 'AVAILABLE' }, { status: 'HOLD' }, { status: 'HOLD' }, { status: 'BOOKED' }, { status: 'RESERVED' }, { status: 'WEIRD' }]))
      .toEqual({ AVAILABLE: 1, HOLD: 2, BOOKED: 1, RESERVED: 1 });
  });
});

describe('the clock', () => {
  it('reads h:mm:ss from an hour up, m:ss below, never negative', () => {
    expect(clock(2 * 3600_000 - 2000)).toBe('1:59:58');
    expect(clock(12 * 60_000 + 5000)).toBe('12:05');
    expect(clock(59_000)).toBe('0:59'); expect(clock(0)).toBe('0:00'); expect(clock(-5000)).toBe('0:00');
  });
  it('the colour follows the time left: ok → soon (30 min) → late (5 min) → gone; no clock at all means a booking is pending', () => {
    const now = Date.parse('2026-11-02T10:00:00Z'); const at = (min: number) => new Date(now + min * 60_000).toISOString();
    expect(holdTone(at(90), now)).toBe('ok'); expect(holdTone(at(31), now)).toBe('ok');
    expect(holdTone(at(30), now)).toBe('soon'); expect(holdTone(at(6), now)).toBe('soon');
    expect(holdTone(at(5), now)).toBe('late'); expect(holdTone(at(0.5), now)).toBe('late');
    expect(holdTone(at(0), now)).toBe('gone'); expect(holdTone(at(-3), now)).toBe('gone');
    expect(holdTone(null, now)).toBe('pending'); expect(holdTone(undefined, now)).toBe('pending');
    expect(holdLeftMs(at(10), now)).toBe(600_000); expect(holdLeftMs(at(-10), now)).toBe(0); expect(holdLeftMs(null, now)).toBe(0);
  });
  it('the progress bar goes 0 → 1 across the window and is 0 when the viewer may not see when it began', () => {
    const t0 = Date.parse('2026-11-02T10:00:00Z'); const iso = (m: number) => new Date(t0 + m * 60_000).toISOString();
    expect(holdElapsed(iso(0), iso(120), t0)).toBe(0); expect(holdElapsed(iso(0), iso(120), t0 + 60 * 60_000)).toBe(0.5);
    expect(holdElapsed(iso(0), iso(120), t0 + 500 * 60_000)).toBe(1); expect(holdElapsed(iso(0), iso(120), t0 - 5000)).toBe(0);
    expect(holdElapsed(undefined, iso(120), t0)).toBe(0); expect(holdElapsed(iso(0), null, t0)).toBe(0); expect(holdElapsed(iso(10), iso(5), t0)).toBe(1);
  });
});

describe('blocking a unit', () => {
  it('a few round token amounts, none below the project minimum, the minimum first, at most four', () => {
    expect(tokenChips(21_000)).toEqual([21_000, 25_000, 50_000, 100_000]);
    expect(tokenChips(100_000)).toEqual([100_000, 200_000, 500_000]);
    expect(tokenChips(1_000_000)).toEqual([1_000_000]);
    expect(tokenChips(0)[0]).toBe(1); expect(tokenChips(25_000)).toEqual([25_000, 50_000, 100_000, 200_000]);
    for (const m of [1, 21_000, 60_000, 99_999]) for (const n of tokenChips(m)) expect(n).toBeGreaterThanOrEqual(m);
  });
  it('tells before the broker types anything: not a partner / not available / already at the limit / no customer yet', () => {
    expect(canBlock({ status: 'AVAILABLE', canHold: true, used: 0, max: 3, leads: 2 }).ok).toBe(true);
    expect(canBlock({ status: 'AVAILABLE', canHold: false, used: 0, max: 3, leads: 2 }).reason!.en).toMatch(/partner/i);
    for (const s of ['HOLD', 'BOOKED', 'RESERVED']) expect(canBlock({ status: s, canHold: true, used: 0, max: 3, leads: 2 }).ok, s).toBe(false);
    const full = canBlock({ status: 'AVAILABLE', canHold: true, used: 3, max: 3, leads: 2 }); expect(full.ok).toBe(false); expect(full.reason!.en).toContain('3'); expect(full.reason!.hi).toContain('3');
    expect(canBlock({ status: 'AVAILABLE', canHold: true, used: 0, max: 3, leads: 0 }).reason!.en).toMatch(/lead/i);
  });
});

// ───────────────────────── server ─────────────────────────
const PORT = await freePort();
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
const PLOTS = 'PROJ-RAI-02';

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v108-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' },
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  expect(cfg).toBeTruthy();
  jar.B1 = await login(email('USR-BRK-001')); jar.B2 = await login(email('USR-BRK-002'));
  jar.BUILDER = await login(email('USR-BUILDER-001')); jar.POOJA = await login('9000030001');
}, 90_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

let seq = 0;
const phone = () => `9${String(700_000_000 + (++seq) * 6151).padStart(9, '0')}`.slice(0, 10);
const newLead = async (cookie: string, name: string) => (await j(await call(cookie, 'POST', '/api/crm/leads', { consent: true, projectId: PLOTS, name, phone: phone(), source: 'WALK_IN' }))).lead.id as string;
const grid = async (cookie: string) => j(await call(cookie, 'GET', `/api/inventory/projects/${PLOTS}`));
const freeUnits = async (cookie: string) => (await grid(cookie)).units.filter((u: any) => u.status === 'AVAILABLE') as any[];
const block = (cookie: string, uid: string, leadId: string, o: Record<string, unknown> = {}) => call(cookie, 'POST', `/api/inventory/units/${uid}/hold`, { leadId, tokenAmount: 25000, tokenRef: 'UTR-V108-1', ...o });
const bell = async (cookie: string) => (await j(await call(cookie, 'GET', '/api/inbox'))).items as any[];

describe('the partner’s own count of blocks used', () => {
  let leads: string[] = []; const used: string[] = [];
  it('a partner sees used / max (0 of 3 to start); the builder and a team member are not given a count', async () => {
    const g = await grid(jar.B1);
    expect(g.caps.holds).toEqual({ used: expect.any(Number), max: 3 });
    const start = g.units.filter((u: any) => u.status === 'HOLD' && u.mine).length; expect(g.caps.holds.used).toBe(start);
    expect((await grid(jar.BUILDER)).caps.holds).toBeUndefined();
    expect((await grid(jar.POOJA).catch(() => ({ caps: {} }))).caps?.holds).toBeUndefined();
  });
  it('every block raises the count, a release lowers it, a second partner’s count is his own', async () => {
    const before = (await grid(jar.B1)).caps.holds.used;
    leads = [await newLead(jar.B1, 'Count One'), await newLead(jar.B1, 'Count Two')];
    const free = await freeUnits(jar.B1);
    for (let i = 0; i < 2; i++) { const r = await block(jar.B1, free[i].id, leads[i], { tokenRef: `UTR-CNT-${i}` }); expect(r.status, await r.clone().text()).toBe(200); used.push(free[i].id); }
    expect((await grid(jar.B1)).caps.holds.used).toBe(before + 2);
    expect((await grid(jar.B2)).caps.holds.used).toBe(0);
    expect((await call(jar.B1, 'POST', `/api/inventory/units/${used[0]}/release`)).status).toBe(200);
    expect((await grid(jar.B1)).caps.holds.used).toBe(before + 1);
    expect((await call(jar.B1, 'POST', `/api/inventory/units/${used[1]}/release`)).status).toBe(200);
    expect((await grid(jar.B1)).caps.holds.used).toBe(before);
  });
  it('the block answer carries the unit with its clock, so the sheet can show the countdown at once', async () => {
    const lead = await newLead(jar.B1, 'Clock Buyer'); const [u] = await freeUnits(jar.B1);
    const r = await block(jar.B1, u.id, lead, { tokenRef: 'UTR-CLOCK-9' }); expect(r.status).toBe(200);
    const b = await j(r); expect(b.unit.status).toBe('HOLD');
    const left = Date.parse(b.unit.hold.expiresAt) - Date.now(); expect(left).toBeGreaterThan(60 * 60_000); expect(left).toBeLessThanOrEqual(72 * 3600_000);
    expect(b.unit.hold.customerName).toBe('Clock Buyer'); expect(b.unit.hold.tokenRef).toBe('UTR-CLOCK-9');   // the holder sees the record he typed
    expect((await call(jar.B1, 'POST', `/api/inventory/units/${u.id}/release`)).status).toBe(200);
  });
  it('the limit of three and “one customer, one block” still hold, with the server’s own words', async () => {
    const ls = [await newLead(jar.B1, 'Lim A'), await newLead(jar.B1, 'Lim B'), await newLead(jar.B1, 'Lim C'), await newLead(jar.B1, 'Lim D')];
    const free = await freeUnits(jar.B1); const mine: string[] = [];
    const base = (await grid(jar.B1)).caps.holds.used;
    for (let i = 0; i < 3 - base; i++) { expect((await block(jar.B1, free[i].id, ls[i], { tokenRef: `UTR-LIM-${i}` })).status).toBe(200); mine.push(free[i].id); }
    const g = await grid(jar.B1); expect(g.caps.holds).toEqual({ used: 3, max: 3 });
    const over = await block(jar.B1, free[5].id, ls[3], { tokenRef: 'UTR-LIM-OVER' }); expect(over.status).toBe(409); expect((await j(over)).error).toMatch(/3 units on hold/);
    for (const id of mine) await call(jar.B1, 'POST', `/api/inventory/units/${id}/release`);
    expect((await block(jar.B1, free[6].id, ls[0], { tokenRef: 'UTR-ONE' })).status).toBe(200);
    const twice = await block(jar.B1, free[7].id, ls[0], { tokenRef: 'UTR-TWO' }); expect(twice.status).toBe(409); expect((await j(twice)).error).toMatch(/already has a unit on hold/);
    await call(jar.B1, 'POST', `/api/inventory/units/${free[6].id}/release`);
  });
});

describe('the builder’s desk is told when a unit is blocked', () => {
  it('one line with the unit, the broker, the customer’s FIRST name and the token — no phone, no receipt number — and the broker himself is not alerted', async () => {
    const blocked = async (c: string) => (await bell(c)).filter(x => /Unit blocked/.test(x.title));
    // (the bell keeps one line per unit — a unit blocked again replaces its older line — so look for THIS block’s line, not for a bigger count)
    const bBefore = (await bell(jar.B1)).length;
    const lead = await newLead(jar.B1, 'Meenakshi Kulkarni'); const [u] = await freeUnits(jar.B1);
    expect((await blocked(jar.BUILDER)).some(x => x.body.includes('Meenakshi'))).toBe(false);
    expect((await block(jar.B1, u.id, lead, { tokenAmount: 50000, tokenRef: 'UTR-SECRET-5555' })).status).toBe(200);
    await wait(400);
    const lines = await blocked(jar.BUILDER);
    const l = lines.find(x => x.title.includes(u.label) && x.body.includes('Meenakshi'))!; expect(l).toBeTruthy();
    expect(l.title).toContain(u.label); expect(l.body).toContain('Meenakshi'); expect(l.body).not.toContain('Kulkarni');
    expect(l.body).toContain('50,000'); expect(l.body).not.toContain('UTR-SECRET-5555'); expect(l.body).not.toMatch(/\d{10}/);
    expect((await blocked(jar.B1)).length).toBe(0);
    expect((await bell(jar.B1)).length).toBe(bBefore);
    expect((await call(jar.B1, 'POST', `/api/inventory/units/${u.id}/release`)).status).toBe(200);
  });
  it('a refused block alerts nobody', async () => {
    const blocked = async () => (await bell(jar.BUILDER)).filter(x => /Unit blocked/.test(x.title)).length;
    const lead = await newLead(jar.B1, 'Refused Buyer'); const [u] = await freeUnits(jar.B1); const before = await blocked();
    expect((await block(jar.B1, u.id, lead, { tokenAmount: 100 })).status).toBe(400);        // below the minimum token
    expect((await block(jar.B1, u.id, lead, { tokenRef: 'x' })).status).toBe(400);            // no receipt number
    await wait(300); expect(await blocked()).toBe(before);
  });
});

describe('the sweep: a warning 15 minutes before, once; a note when it ends; a pending booking is never swept', () => {
  let out: any;
  beforeAll(() => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'genz-v108-sweep-')); mkdirSync(path.join(scratch, 'data'));
    const root = path.resolve(import.meta.dirname, '..');
    const r = spawnSync(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'tests/helpers/v108-sweep.ts')], {
      cwd: scratch, encoding: 'utf8', timeout: 80_000,
      env: { ...process.env, NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true' },
    });
    rmSync(scratch, { recursive: true, force: true });
    const line = (r.stdout || '').split('\n').find(l => l.startsWith('RESULT '));
    expect(line, (r.stdout || '') + (r.stderr || '')).toBeTruthy();
    out = JSON.parse(line!.slice(7));
  }, 100_000);
  it('with 40 minutes left nothing happens; at 10 minutes the broker gets one line, in both languages, naming the customer by first name', () => {
    expect(out.warnMin).toBe(15);
    expect(out.early).toEqual({ swept: 0, warned: false, status: 'HOLD' });
    expect(out.soon).toEqual({ swept: 0, warned: true, status: 'HOLD' });
    expect(out.inboxSoon).toHaveLength(1);
    expect(out.inboxSoon[0].title).toMatch(/Block ending/); expect(out.inboxSoon[0].body).toContain('Ravi'); expect(out.inboxSoon[0].body).not.toContain('Verma');
    expect(out.inboxSoon[0].body).toMatch(/10 min/); expect(out.inboxSoon[0].hi).toBeTruthy();
  });
  it('the warning is given once — the next sweep keeps the same stamp and sends nothing new', () => {
    expect(out.again).toEqual({ swept: 0, sameStamp: true });
  });
  it('after the end the unit is free for everyone and the broker is told it lapsed (the bell keeps one line per unit: the newest)', () => {
    expect(out.lapsed.swept).toBe(1); expect(out.lapsed.status).toBe('AVAILABLE'); expect(out.lapsed.hold).toBeNull();
    expect(out.inboxLapsed).toHaveLength(1); expect(out.inboxLapsed[0].title).toMatch(/Block lapsed/); expect(out.inboxLapsed[0].body).not.toContain('Verma');
  });
  it('a hold whose booking request is with the builder has no clock and is never swept, however late', () => {
    expect(out.pending).toEqual({ swept: 0, status: 'HOLD' });
  });
});

describe('what others may see of a block', () => {
  it('another partner sees only that the unit is held and when it frees up — not who, which customer or what token', async () => {
    const lead = await newLead(jar.B1, 'Privacy Buyer'); const [u] = await freeUnits(jar.B1);
    expect((await block(jar.B1, u.id, lead, { tokenRef: 'UTR-PRIV-7' })).status).toBe(200);
    const other = (await grid(jar.B2)).units.find((x: any) => x.id === u.id);
    expect(other.status).toBe('HOLD'); expect(other.mine).toBe(false);
    expect(other.hold.expiresAt).toBeTruthy();
    for (const k of ['brokerId', 'brokerName', 'leadId', 'customerName', 'tokenAmount', 'tokenRef', 'at', 'warnedAt']) expect(other.hold[k], k).toBeUndefined();
    const mine = (await grid(jar.B1)).units.find((x: any) => x.id === u.id); expect(mine.mine).toBe(true); expect(mine.hold.customerName).toBe('Privacy Buyer');
    const owner = (await grid(jar.BUILDER)).units.find((x: any) => x.id === u.id); expect(owner.hold.customerName).toBe('Privacy Buyer'); expect(owner.hold.tokenRef).toBe('UTR-PRIV-7');
    expect((await call(jar.B2, 'POST', `/api/inventory/units/${u.id}/release`)).status).toBe(404);
    expect((await call(jar.B1, 'POST', `/api/inventory/units/${u.id}/release`)).status).toBe(200);
  });
});
