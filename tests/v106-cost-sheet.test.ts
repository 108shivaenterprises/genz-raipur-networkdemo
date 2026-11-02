import { freePort } from './helpers/port';
/**
 * v106 — cost sheet of one unit:
 *   · the maths (price + PLC / parking / club / deposit + GST + stamp + registration = all-in, and the payment schedule in rupees) is exact and the schedule always adds up;
 *   · only the builder sets the charges; nobody sends a sheet before he has; a partner whose rate is hidden, or who has no mandate, cannot make one;
 *   · the customer's page shows the figures as they were the day the sheet was made, carries the sender's card, no commission, and dies when withdrawn.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { computeCostSheet, skippedCharges, chargesError, cleanCharges, sheetExpired, DEFAULT_CHARGES, COST_LIMITS, type ProjectCharges, type CostSheetSnapshot } from '../src/shared/costSheetRules';
import { costSheetPage } from '../server/costsheetPage';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

// ───────────────────────── pure rules ─────────────────────────
const CH: ProjectCharges = {
  gstPct: 5, stampPct: 5, regPct: 1, validDays: 15,
  lines: [
    { id: 'plc', label: 'PLC', mode: 'PER_SQFT', amount: 100, gst: true },
    { id: 'parking', label: 'Covered parking', mode: 'FIXED', amount: 200_000, optional: true, maxQty: 2, gst: true },
    { id: 'maint', label: 'Maintenance deposit', mode: 'PER_SQFT', amount: 20, gst: false },
    { id: 'club', label: 'Club', mode: 'FIXED', amount: 0, gst: true },
  ],
  schedule: [{ name: 'Booking', pct: 10, dueInDays: 0 }, { name: 'Agreement', pct: 20, dueInDays: 30 }, { name: 'Plinth', pct: 20, dueInDays: 120 }, { name: 'Slabs', pct: 30, dueInDays: 365 }, { name: 'Possession', pct: 20, dueInDays: 730 }],
};
const UNIT = { price: 5_000_000, areaSqft: 1000 };

describe('cost sheet maths', () => {
  it('price + PLC + chosen parking + deposit, GST only on what GST applies to, stamp and registration on the same base', () => {
    const o = computeCostSheet(UNIT, CH, { parking: 2 });
    expect(o.basic).toBe(5_000_000);
    expect(o.lines.map(l => [l.id, l.amount, l.gst])).toEqual([['plc', 100_000, true], ['parking', 400_000, true], ['maint', 20_000, false]]); // the ₹0 club line is not printed
    expect(o.extras).toBe(520_000);
    expect(o.agreementValue).toBe(5_500_000); // the deposit is not part of what GST / stamp are worked on
    expect(o.gst).toBe(275_000); expect(o.stamp).toBe(275_000); expect(o.reg).toBe(55_000);
    expect(o.payable).toBe(5_795_000); expect(o.allIn).toBe(6_125_000);
    expect(o.ratePerSqft).toBe(5000);
  });
  it('the payment schedule runs on price + taxable charges + GST and always adds up to exactly that', () => {
    const o = computeCostSheet(UNIT, CH, { parking: 2 });
    expect(o.schedule.map(s => s.amount)).toEqual([577_500, 1_155_000, 1_155_000, 1_732_500, 1_155_000]);
    expect(o.schedule.reduce((a, s) => a + s.amount, 0)).toBe(5_500_000 + 275_000);
    // odd numbers and uneven percentages: the last step takes the rounding, the sum never drifts
    const odd: ProjectCharges = { ...CH, schedule: [{ name: 'a', pct: 33.33, dueInDays: 0 }, { name: 'b', pct: 33.33, dueInDays: 10 }, { name: 'c', pct: 33.34, dueInDays: 20 }] };
    for (let i = 0; i < 40; i++) {
      const u = { price: 1_000_000 + Math.floor(Math.random() * 9_000_000) + 7, areaSqft: 500 + Math.floor(Math.random() * 2000) + 0.5 };
      const r = computeCostSheet(u, odd, { parking: i % 3 });
      expect(r.schedule.reduce((a, s) => a + s.amount, 0), JSON.stringify(u)).toBe(r.agreementValue + r.gst);
      expect(r.allIn).toBe(r.payable + r.stamp + r.reg);
    }
  });
  it('an optional charge counts only as many times as the customer picks, never above its limit, never below zero', () => {
    expect(computeCostSheet(UNIT, CH, {}).lines.map(l => l.id)).toEqual(['plc', 'maint']);
    expect(computeCostSheet(UNIT, CH, { parking: 1 }).lines.find(l => l.id === 'parking')!.amount).toBe(200_000);
    expect(computeCostSheet(UNIT, CH, { parking: 9 }).lines.find(l => l.id === 'parking')!.amount).toBe(400_000); // limit 2
    expect(computeCostSheet(UNIT, CH, { parking: -3 }).lines.some(l => l.id === 'parking')).toBe(false);
    expect(computeCostSheet(UNIT, CH, { plc: 5, maint: 5 }).lines.map(l => l.amount)).toEqual([100_000, 20_000]); // a quantity means nothing for a charge that is not optional
  });
  it('a unit’s own PLC replaces the project’s; 0 means no PLC; a project with no PLC line still gets the unit’s', () => {
    expect(computeCostSheet({ ...UNIT, plcPerSqft: 250 }, CH).lines[0]).toMatchObject({ id: 'plc', amount: 250_000 });
    expect(computeCostSheet({ ...UNIT, plcPerSqft: 0 }, CH).lines.some(l => l.id === 'plc')).toBe(false);
    const noPlc = { ...CH, lines: CH.lines.filter(l => l.id !== 'plc') };
    expect(computeCostSheet({ ...UNIT, plcPerSqft: 150 }, noPlc).lines[0]).toMatchObject({ id: 'plc', amount: 150_000, gst: true });
  });
  it('a per-sq-ft charge on a unit with no area is left off the numbers AND reported, so a sheet is never made with the charge silently missing', () => {
    const noArea = { price: 5_000_000 };
    expect(computeCostSheet(noArea, CH).lines.map(l => l.id)).toEqual([]);
    expect(skippedCharges(noArea, CH)).toEqual(['PLC', 'Maintenance deposit']);
    expect(skippedCharges(UNIT, CH)).toEqual([]);
    expect(skippedCharges(noArea, { ...CH, lines: CH.lines.filter(l => l.mode === 'FIXED') })).toEqual([]);
  });
  it('charges are validated: rates, duplicate codes, names, the schedule must total 100 %, validity', () => {
    expect(chargesError(CH)).toBe('');
    const bad = (p: Partial<ProjectCharges>) => chargesError({ ...CH, ...p });
    expect(bad({ gstPct: 40 })).toMatch(/GST/); expect(bad({ stampPct: -1 })).toMatch(/Stamp/); expect(bad({ regPct: 16 })).toMatch(/Registration/);
    expect(bad({ lines: [CH.lines[0], CH.lines[0]] })).toMatch(/used twice/);
    expect(bad({ lines: [{ ...CH.lines[0], label: '' }] })).toMatch(/Name each charge/);
    expect(bad({ lines: [{ ...CH.lines[0], id: 'Bad Code!' }] })).toMatch(/short code/);
    expect(bad({ lines: [{ ...CH.lines[0], amount: -5 }] })).toMatch(/amount/);
    expect(bad({ lines: Array.from({ length: COST_LIMITS.lines + 1 }, (_, i) => ({ id: `c${i}`, label: `Charge ${i}`, mode: 'FIXED' as const, amount: 1 })) })).toMatch(/At most/);
    expect(bad({ schedule: [{ name: 'Only', pct: 90, dueInDays: 0 }] })).toMatch(/total 100%/);
    expect(bad({ schedule: [{ name: 'Zero', pct: 0, dueInDays: 0 }, { name: 'All', pct: 100, dueInDays: 0 }] })).toMatch(/above 0/);
    expect(bad({ validDays: 0 })).toMatch(/valid/); expect(bad({ validDays: 91 })).toMatch(/valid/);
    expect(bad({ schedule: [] })).toBe(''); // a project may choose to print no schedule
  });
  it('cleanCharges: an untouched project gets plain defaults with every amount at 0 (nothing is printed until the builder types a figure)', () => {
    const d = cleanCharges(undefined);
    expect(chargesError(d)).toBe(''); expect(d.lines.every(l => l.amount === 0)).toBe(true);
    expect(computeCostSheet(UNIT, d).lines).toEqual([]);
    expect(DEFAULT_CHARGES.schedule.reduce((a, s) => a + s.pct, 0)).toBe(100);
    expect(cleanCharges({ ...CH, lines: [null as any, { ...CH.lines[0], id: ' PLC ' }] }).lines.map(l => l.id)).toEqual(['plc']);
  });
});

describe('the customer page (pure)', () => {
  const out = computeCostSheet(UNIT, CH, { parking: 1 });
  const snap = (validUntil: string): CostSheetSnapshot => ({ projectName: 'Green Enclave', builderName: 'B', reraNumber: 'CG-RERA-1', unit: { label: 'A-101', group: 'Tower A', config: '3 BHK', floor: 1, facing: 'East' }, out, validUntil, note: 'Prices subject to change' });
  const brand = { displayName: 'Capital Propex', company: '', tagline: '', reraId: '', logo: '', phone: '9000000001' };
  it('a live sheet shows every line, the schedule, the validity and the disclaimer; the expired one shows no number at all', () => {
    const live = costSheetPage(snap(new Date(Date.now() + 5 * 86_400_000).toISOString()), { lang: 'en', clientLabel: 'Mr Sharma', brand, unitMayBeGone: false });
    expect(live.expired).toBe(false);
    for (const s of ['A-101', 'Mr Sharma', inr(out.allIn), inr(out.gst), inr(out.stamp), inr(out.reg), 'PLC', 'Covered parking', 'Payment schedule', 'Prices subject to change', 'not an offer']) expect(live.body, s).toContain(s);
    expect(live.body).not.toMatch(/onclick=/); // the page's CSP allows no inline handlers
    const dead = costSheetPage(snap(new Date(Date.now() - 1000).toISOString()), { lang: 'en', clientLabel: 'Mr Sharma', brand, unitMayBeGone: false });
    expect(dead.expired).toBe(true); expect(dead.body).toContain('expired'); expect(dead.body).not.toContain(inr(out.allIn)); expect(dead.body).not.toMatch(/₹\s?\d/);
    expect(sheetExpired({ validUntil: new Date(Date.now() - 1).toISOString() })).toBe(true);
  });
  it('the Hindi sheet is Hindi; a unit that may be gone carries a warning; names are escaped', () => {
    const hi = costSheetPage(snap(new Date(Date.now() + 86_400_000).toISOString()), { lang: 'hi', clientLabel: '<script>alert(1)</script>', brand, unitMayBeGone: true });
    expect(hi.body).toMatch(/कॉस्ट शीट/); expect(hi.body).toMatch(/बिक चुकी हो सकती है/); expect(hi.body).not.toContain('<script>alert(1)</script>'); expect(hi.body).toContain('&lt;script&gt;');
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
const uid = (n: number) => `UNIT-${PLOTS}-P-${n}`;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v106-')); mkdirSync(path.join(dir, 'data'));
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
  jar.POOJA = await login('9000030001'); jar.RAKESH = await login('9000030002');
}, 90_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const unitsOf = async (cookie: string) => (await j(await call(cookie, 'GET', `/api/inventory/projects/${PLOTS}`))).units as any[];
const prev = (cookie: string | undefined, unitId: string, qty: Record<string, number> = {}) => call(cookie, 'POST', '/api/invdesk/cost-sheets/preview', { unitId, qty });
const make = (cookie: string, body: any) => call(cookie, 'POST', '/api/invdesk/cost-sheets', body);
const page = async (p: string, ua = 'Mozilla/5.0 (Linux; Android 14) Chrome/120') => { const r = await fetch(B + p, { headers: { 'user-agent': ua } }); return { status: r.status, html: await r.text() }; };
const MINE: ProjectCharges = {
  gstPct: 5, stampPct: 5, regPct: 1, validDays: 10, note: 'Prices subject to change without notice',
  lines: [
    { id: 'plc', label: 'PLC', mode: 'PER_SQFT', amount: 100, gst: true },
    { id: 'parking', label: 'Covered parking', mode: 'FIXED', amount: 200_000, optional: true, maxQty: 2, gst: true },
    { id: 'maint', label: 'Maintenance deposit', mode: 'PER_SQFT', amount: 20, gst: false },
  ],
  schedule: [{ name: 'On booking', pct: 10, dueInDays: 0 }, { name: 'Agreement', pct: 30, dueInDays: 30 }, { name: 'Possession', pct: 60, dueInDays: 400 }],
};

describe('the builder sets the charges; nobody sends a sheet before that', () => {
  it('before the builder has set them, the project says so and a sheet cannot be made — by a partner, or even by the builder', async () => {
    const g = await j(await call(jar.BUILDER, 'GET', `/api/inventory/projects/${PLOTS}`));
    expect(g.project.chargesSet).toBe(false); expect(g.project.charges.lines.every((l: any) => l.amount === 0)).toBe(true); // defaults to edit, all at 0
    const u = g.units.find((x: any) => x.areaSqft && x.status === 'AVAILABLE' && x.price);
    const a = await prev(jar.B1, u.id); expect(a.status).toBe(409); expect((await j(a)).error).toMatch(/builder has not set/i);
    const b = await prev(jar.BUILDER, u.id); expect(b.status).toBe(409); expect((await j(b)).error).toMatch(/Set this project/i);
    expect((await make(jar.B1, { unitId: u.id })).status).toBe(409);
  });
  it('only the owning builder can save them; bad figures are refused with a reason; the partner never sees the charges object', async () => {
    expect((await call(jar.B1, 'PUT', `/api/inventory/projects/${PLOTS}/charges`, MINE)).status).toBe(403);
    expect((await call(jar.BUILDER2, 'PUT', `/api/inventory/projects/${PLOTS}/charges`, MINE)).status).toBe(404);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/projects/${PLOTS}/charges`, { gstPct: 5 })).status).toBe(400);
    const bad = await call(jar.BUILDER, 'PUT', `/api/inventory/projects/${PLOTS}/charges`, { ...MINE, schedule: [{ name: 'Half', pct: 50, dueInDays: 0 }] });
    expect(bad.status).toBe(400); expect((await j(bad)).error).toMatch(/total 100%/);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/projects/${PLOTS}/charges`, { ...MINE, gstPct: 60 })).status).toBe(400);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/projects/${PLOTS}/charges`, MINE)).status).toBe(200);
    const mine = await j(await call(jar.BUILDER, 'GET', `/api/inventory/projects/${PLOTS}`)); expect(mine.project.chargesSet).toBe(true); expect(mine.project.charges.gstPct).toBe(5);
    const theirs = await j(await call(jar.B1, 'GET', `/api/inventory/projects/${PLOTS}`)); expect(theirs.project.chargesSet).toBe(true); expect(theirs.project.charges).toBeUndefined();
    expect(JSON.stringify(theirs)).not.toMatch(/Maintenance deposit/);
  });
  it('a unit can carry its own PLC; it is the builder’s alone to set', async () => {
    const u = (await unitsOf(jar.BUILDER)).find((x: any) => x.areaSqft && x.status === 'AVAILABLE');
    expect((await call(jar.B1, 'PUT', `/api/inventory/units/${u.id}`, { plcPerSqft: 999 })).status).toBe(403);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${u.id}`, { plcPerSqft: -1 })).status).toBe(400);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${u.id}`, { plcPerSqft: 250 })).status).toBe(200);
    expect((await unitsOf(jar.BUILDER)).find((x: any) => x.id === u.id).plcPerSqft).toBe(250);
    expect((await unitsOf(jar.B1)).find((x: any) => x.id === u.id).plcPerSqft).toBeUndefined(); // partners never see how a rate is built
    const p = await j(await prev(jar.B1, u.id)); expect(p.out.lines.find((l: any) => l.id === 'plc').amount).toBe(250 * u.areaSqft);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${u.id}`, { plcPerSqft: null })).status).toBe(200);
    expect((await j(await prev(jar.B1, u.id))).out.lines.find((l: any) => l.id === 'plc').amount).toBe(100 * u.areaSqft);
  });
});

describe('who may make a sheet', () => {
  let unit: any;
  it('preview returns the same figures the pure rules compute, plus the choices a customer can make', async () => {
    unit = (await unitsOf(jar.B1)).find((x: any) => x.areaSqft && x.status === 'AVAILABLE' && x.price);
    const p = await j(await prev(jar.B1, unit.id, { parking: 2 }));
    const want = computeCostSheet({ price: unit.price, areaSqft: unit.areaSqft }, cleanCharges(MINE), { parking: 2 });
    expect(p.out).toEqual(want); expect(p.options).toEqual([{ id: 'parking', label: 'Covered parking', maxQty: 2, amount: 200_000, mode: 'FIXED' }]);
    expect(p.validDays).toBe(10); expect(p.blocked).toBe('');
  });
  it('a partner without a mandate, an admin, staff whose boss has not allowed links, and strangers are refused', async () => {
    expect((await prev(jar.B3, unit.id)).status).toBe(404); // no mandate on this project
    expect((await prev(jar.BUILDER2, unit.id)).status).toBe(404); // another builder
    expect((await prev(jar.SUP, unit.id)).status).toBeGreaterThanOrEqual(403);
    expect((await prev(jar.POOJA, unit.id)).status).toBeGreaterThanOrEqual(403);
    expect((await prev(undefined, unit.id)).status).toBe(401);
    expect((await prev(jar.B1, 'UNIT-NOPE')).status).toBe(404);
  });
  it('a partner whose rate is hidden can never make a sheet (a hidden rate must not leak through one); the unit’s own hide works too', async () => {
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/projects/${PLOTS}/visibility`, { audience: 'ALL', priceHidden: true })).status).toBe(200);
    const r = await prev(jar.B1, unit.id); expect(r.status).toBe(403); expect((await j(r)).error).toMatch(/hidden/i);
    expect((await make(jar.B1, { unitId: unit.id })).status).toBe(403);
    expect((await prev(jar.BUILDER, unit.id)).status).toBe(200); // the builder still can
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/projects/${PLOTS}/visibility`, { audience: 'ALL', priceHidden: false })).status).toBe(200);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${unit.id}`, { vis: { audience: 'HIDDEN' } })).status).toBe(200);
    expect((await prev(jar.B1, unit.id)).status).toBe(404);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${unit.id}`, { vis: null })).status).toBe(200);
    expect((await prev(jar.B1, unit.id)).status).toBe(200);
  });
  it('staff: allowed only when the boss allowed customer links, and only while their own rate access lasts', async () => {
    const pol = (body: any) => call(jar.B1, 'PUT', '/api/pcontrol/team/USR-TEAM-002/policy', body);
    expect((await pol({ invMode: 'ALL', invPrice: true, invFeatures: true, invShareOut: true })).status).toBe(200);
    expect((await prev(jar.RAKESH, unit.id)).status).toBe(200);
    expect((await pol({ invPrice: false })).status).toBe(200);
    expect((await prev(jar.RAKESH, unit.id)).status).toBe(403);
    expect((await pol({ invPrice: true, invShareOut: false })).status).toBe(200);
    expect((await prev(jar.RAKESH, unit.id)).status).toBe(403);
    expect((await pol({ invShareOut: true })).status).toBe(200);
  });
  it('a unit with no area cannot get a sheet while a per-sq-ft charge applies — it is refused, never made with the charge missing', async () => {
    expect((await call(jar.BUILDER, 'POST', `/api/inventory/projects/${PLOTS}/units/generate`, { unitKind: 'PLOT', group: 'NoArea', prefix: 'N-', perFloor: 2, basePrice: 1_000_000 })).status).toBe(200);
    const n = (await unitsOf(jar.BUILDER)).find((x: any) => x.group === 'NoArea');
    const p = await j(await prev(jar.B1, n.id)); expect(p.blocked).toMatch(/no area/i); expect(p.blocked).toContain('PLC');
    const r = await make(jar.B1, { unitId: n.id }); expect(r.status).toBe(409); expect((await j(r)).error).toMatch(/no area/i);
  });
});

describe('making a sheet and the customer’s page', () => {
  let unit: any; let tok = ''; let path1 = ''; let leadId = ''; let want: any; let staffTok = '';
  const L = async () => (await j(await call(jar.B1, 'GET', `/api/crm/leads/${leadId}`))).lead;
  it('creates a link; the customer opens it without logging in and sees the figures, the sender’s card, and nothing about commission', async () => {
    unit = (await unitsOf(jar.B1)).find((x: any) => x.areaSqft && x.status === 'AVAILABLE' && x.price);
    leadId = (await j(await call(jar.B1, 'POST', '/api/crm/leads', { consent: true, projectId: PLOTS, name: 'Sheet Buyer', phone: '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0'), source: 'WALK_IN' }))).lead.id;
    const r = await make(jar.B1, { unitId: unit.id, qty: { parking: 1 }, clientLabel: 'Mr Sharma', leadId, note: 'Corner unit, east side', lang: 'en' });
    expect(r.status).toBe(200); const b = await j(r); tok = b.token; path1 = b.path;
    want = computeCostSheet({ price: unit.price, areaSqft: unit.areaSqft }, cleanCharges(MINE), { parking: 1 });
    expect(b.out).toEqual(want); expect(Date.parse(b.validUntil)).toBeGreaterThan(Date.now() + 9 * 86_400_000);
    const p = await page(path1); expect(p.status).toBe(200);
    for (const s of [unit.label, 'Mr Sharma', inr(want.allIn), inr(want.gst), inr(want.stamp), inr(want.reg), 'Covered parking', 'Maintenance deposit', 'no GST', 'On booking', 'Possession', 'Corner unit, east side', 'Prices subject to change without notice', 'Capital Propex Raipur', '/s/print.js', 'not an offer']) expect(p.html, s).toContain(s);
    expect(p.html).toMatch(/noindex/); expect(p.html).not.toMatch(/commission|brokerage|mandate|कमीशन/i); expect(p.html).not.toMatch(/onclick=/);
    expect(p.html).not.toContain('Sheet Buyer'); // the lead's own name is not printed unless the sender typed it as the label
  });
  it('the CRM lead gets a line when the sheet is made and one when the customer first opens it', async () => {
    const acts = (await L()).activities.map((a: any) => a.note);
    expect(acts.some((n: string) => /Cost sheet of .* made for Mr Sharma/.test(n))).toBe(true);
    expect(acts.some((n: string) => /Customer opened the cost sheet/.test(n))).toBe(true);
    await page(path1, 'Mozilla/5.0 (iPhone) Safari/604.1'); // another device: counted again, but the lead is told only once
    expect((await L()).activities.filter((a: any) => /Customer opened the cost sheet/.test(a.note)).length).toBe(1);
  });
  it('link-preview bots do not count as an open; real opens do, and the sender sees the count', async () => {
    const before = (await j(await call(jar.B1, 'GET', '/api/invdesk/cost-sheets'))).sheets.find((s: any) => s.token === tok).views;
    await page(path1, 'WhatsApp/2.23 A'); await page(path1, 'facebookexternalhit/1.1');
    expect((await j(await call(jar.B1, 'GET', '/api/invdesk/cost-sheets'))).sheets.find((s: any) => s.token === tok).views).toBe(before);
    expect(before).toBeGreaterThanOrEqual(2);
  });
  it('the print script is served from our own origin and does one thing', async () => {
    const r = await fetch(`${B}/s/print.js`); expect(r.status).toBe(200); expect(r.headers.get('content-type')).toMatch(/javascript/); expect(await r.text()).toContain('window.print()');
  });
  it('the figures are frozen: when the builder changes the charges and the rate, the sent sheet does not move — a new one does', async () => {
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/projects/${PLOTS}/charges`, { ...MINE, gstPct: 12, validDays: 30 })).status).toBe(200);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${unit.id}`, { price: unit.price + 500_000, reason: 'revision' })).status).toBe(200);
    const old = await page(path1); expect(old.html).toContain(inr(want.allIn)); expect(old.html).toContain(inr(want.gst));
    const fresh = await j(await make(jar.B1, { unitId: unit.id, qty: { parking: 1 } }));
    const now = computeCostSheet({ price: unit.price + 500_000, areaSqft: unit.areaSqft }, cleanCharges({ ...MINE, gstPct: 12, validDays: 30 }), { parking: 1 });
    expect(fresh.out).toEqual(now); expect(fresh.out.allIn).not.toBe(want.allIn);
    expect(Date.parse(fresh.validUntil)).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    expect((await call(jar.B1, 'POST', `/api/invdesk/cost-sheets/${fresh.token}/revoke`, {})).status).toBe(200);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/projects/${PLOTS}/charges`, MINE)).status).toBe(200);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${unit.id}`, { price: unit.price, reason: 'back' })).status).toBe(200);
  });
  it('input is checked: too many parkings, a long label, someone else’s customer, a hundred-character note', async () => {
    expect((await make(jar.B1, { unitId: unit.id, qty: { parking: 9 } })).status).toBe(400);
    expect((await make(jar.B1, { unitId: unit.id, clientLabel: 'x'.repeat(61) })).status).toBe(400);
    expect((await make(jar.B1, { unitId: unit.id, note: 'y'.repeat(COST_LIMITS.noteMax + 1) })).status).toBe(400);
    const other = (await j(await call(jar.B2, 'POST', '/api/crm/leads', { consent: true, projectId: PLOTS, name: 'Other Broker Buyer', phone: '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0'), source: 'WALK_IN' }))).lead;
    const r = await make(jar.B1, { unitId: unit.id, leadId: other.id }); expect(r.status).toBe(400); expect((await j(r)).error).toMatch(/your own customer/i);
  });
  it('lists: a partner sees his own sheets and his staff’s (with who made them), staff only theirs, and the unit-link list stays separate', async () => {
    const s = await j(await make(jar.RAKESH, { unitId: unit.id, qty: {}, clientLabel: 'Staff client' })); staffTok = s.token; expect(s.success).toBe(true);
    const boss = (await j(await call(jar.B1, 'GET', '/api/invdesk/cost-sheets'))).sheets;
    expect(boss.find((x: any) => x.token === tok)).toMatchObject({ unitLabel: unit.label, allIn: want.allIn, expired: false, revoked: false }); expect(boss.find((x: any) => x.token === tok).by).toBeUndefined();
    expect(boss.find((x: any) => x.token === staffTok).by).toBe('Rakesh Dewangan');
    expect(JSON.stringify(boss)).not.toMatch(/phone|email/i);
    const mine = (await j(await call(jar.RAKESH, 'GET', '/api/invdesk/cost-sheets'))).sheets; expect(mine.map((x: any) => x.token)).toEqual([staffTok]);
    expect((await j(await call(jar.B2, 'GET', '/api/invdesk/cost-sheets'))).sheets.map((x: any) => x.token)).not.toContain(tok);
    expect((await j(await call(jar.B1, 'GET', '/api/invdesk/shares'))).links.some((l: any) => l.token === tok)).toBe(false);
    const kit = (await j(await call(jar.B1, 'GET', '/api/share/links'))).links.find((l: any) => l.token === tok); expect(kit.title).toMatch(/^Cost sheet · /);
  });
  it('the customer’s page dies when the sender’s right to the rate ends; when the unit is sold the page stays but warns', async () => {
    expect((await call(jar.B1, 'PUT', '/api/pcontrol/team/USR-TEAM-002/policy', { invPrice: false })).status).toBe(200);
    expect((await page(`/s/${staffTok}`)).status).toBe(404);
    expect((await call(jar.B1, 'PUT', '/api/pcontrol/team/USR-TEAM-002/policy', { invPrice: true })).status).toBe(200);
    expect((await page(`/s/${staffTok}`)).status).toBe(200);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${unit.id}`, { status: 'RESERVED' })).status).toBe(200);
    const p = await page(path1); expect(p.status).toBe(200); expect(p.html).toMatch(/sold or put on hold/); expect(p.html).toContain(inr(want.allIn));
    expect((await make(jar.B1, { unitId: unit.id })).status).toBe(409); // no new sheet for a unit that is gone
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${unit.id}`, { status: 'AVAILABLE' })).status).toBe(200);
    expect((await page(path1)).html).not.toMatch(/sold or put on hold/);
  });
  it('withdrawing: the sender (or his boss) stops it and the link is a plain 404; nobody else can', async () => {
    expect((await call(jar.B2, 'POST', `/api/invdesk/cost-sheets/${staffTok}/revoke`, {})).status).toBe(404);
    expect((await call(jar.RAKESH, 'POST', `/api/invdesk/cost-sheets/${tok}/revoke`, {})).status).toBe(404); // not his
    expect((await call(jar.B1, 'POST', `/api/invdesk/cost-sheets/${staffTok}/revoke`, {})).status).toBe(200); // the boss stops his staff's sheet
    expect((await page(`/s/${staffTok}`)).status).toBe(404);
    expect((await call(jar.B1, 'POST', `/api/invdesk/cost-sheets/${tok}/revoke`, {})).status).toBe(200);
    expect((await page(path1)).status).toBe(404);
    expect((await call(jar.B1, 'POST', `/api/invdesk/shares/${tok}/revoke`, {})).status).toBe(404); // the unit-link revoke does not touch sheets
    const left = (await j(await call(jar.B1, 'GET', '/api/invdesk/cost-sheets'))).sheets; expect(left.filter((x: any) => x.token === tok)[0].revoked).toBe(true);
  });
  it('the builder can send a sheet of his own unit too (and sees the sheet he made)', async () => {
    const r = await j(await make(jar.BUILDER, { unitId: unit.id, qty: { parking: 2 }, clientLabel: 'Walk-in' })); expect(r.success).toBe(true);
    const p = await page(r.path); expect(p.status).toBe(200); expect(p.html).toContain('GENZ BUILDCON'); expect(p.html).toContain('Walk-in');
    expect((await j(await call(jar.BUILDER, 'GET', '/api/invdesk/cost-sheets'))).sheets.some((x: any) => x.token === r.token)).toBe(true);
  });
});
