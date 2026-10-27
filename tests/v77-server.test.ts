import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * v77 — against a real server: (1) the notification bell, (2) many kinds of unit with their own number / code / rate,
 * (3) project papers that go builder → partner (personally or to all) → his team → his client, checked live at every step.
 * One fresh project of builder 1 carries all three, with partner 1 (team: Pooja sees only what is posted and cannot send, Rakesh sees all and may send) and partner 2.
 */
const PORT = 7900 + Math.floor(Math.random() * 60);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (c: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const j = (r: Response) => r.json();
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function login(who: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === who);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a ? a.email : who, password: cfg.demoPassword }) });
  expect(r.status, who).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const page = async (p: string) => { const r = await fetch(B + p); return { status: r.status, html: await r.text() }; };
let P = ''; // the fresh project
const B1 = 'USR-BRK-001'; const B2 = 'USR-BRK-002';

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v77-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, stdio: 'ignore',
    env: { ...process.env, KYC_VAULT_KEY: 'b2'.repeat(32), SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' },
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  expect(cfg).toBeTruthy();
  const ids: Record<string, string> = { BLD: 'USR-BUILDER-001', BLD2: 'USR-BUILDER-002', S1: B1, S2: B2, S3: 'USR-BRK-003', ADMIN: 'USR-ADMIN-1', OWNER: 'USR-OWNER-001', BUYER: 'USR-BUYER-001', CON: 'USR-CONTRACTOR-001', LEGAL: 'USR-LEGAL-001', POOJA: '9000030001', RAKESH: '9000030002', DIVYA: '9000030003' };
  for (const [k, id] of Object.entries(ids)) jar[k] = await login(id);
  const p = await j(await call(jar.BLD, 'POST', '/api/builder/projects', { projectName: 'Kinds Heights', locality: 'Shankar Nagar', reraNumber: 'CGRERAP777777', priceStartingFrom: 2500000, priceMax: 30000000, totalUnits: 60, channelPartnerCommissionPct: 2, unitConfigurations: ['3 BHK'] }));
  P = p.project?.id || p.projectId || p.id; expect(P).toBeTruthy();
  // both partners are appointed on it
  for (const k of ['S1', 'S2']) expect((await call(jar[k], 'POST', `/api/pcontrol/partner/projects/${P}/apply`, { note: 'ready' })).status).toBe(200);
  const d = await j(await call(jar.BLD, 'GET', `/api/pcontrol/builder/projects/${P}`));
  for (const m of d.partners) expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${m.id}/decide`, { action: 'APPROVE', commissionPct: 2.5 })).status).toBe(200);
}, 120_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

const inbox = async (who: string, q = '') => j(await call(jar[who], 'GET', `/api/inbox${q}`));

// ───────────────────────── 1 · the bell ─────────────────────────
describe('notification bell', () => {
  it('needs a sign-in', async () => {
    for (const [m, u] of [['GET', '/api/inbox'], ['GET', '/api/inbox/count'], ['POST', '/api/inbox/read'], ['DELETE', '/api/inbox'], ['DELETE', '/api/inbox/NTF-x']] as const) expect((await call(undefined, m, u, m === 'POST' ? {} : undefined)).status, `${m} ${u}`).toBe(401);
  });
  it('every kind of account has one (an empty list is fine)', async () => {
    for (const who of ['BLD', 'S1', 'POOJA', 'OWNER', 'BUYER', 'CON', 'LEGAL', 'ADMIN']) {
      const r = await call(jar[who], 'GET', '/api/inbox'); expect(r.status, who).toBe(200);
      const d = await j(r); expect(Array.isArray(d.items), who).toBe(true); expect(typeof d.unread, who).toBe('number');
      expect((await j(await call(jar[who], 'GET', '/api/inbox/count'))).unread, who).toBe(d.unread);
    }
  });
  let lineId = ''; let before = 0;
  it('what a person is told on his phone is also in his bell — only his own', async () => {
    before = (await inbox('S1')).unread; const b2 = (await inbox('S2')).unread;
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/projects/${P}/updates`, { kind: 'OFFER', title: 'Diwali offer', body: 'Free parking on every booking', audience: 'ASSOCIATES' })).status).toBe(200);
    const d = await inbox('S1');
    expect(d.unread).toBe(before + 1);
    const line = d.items.find((x: any) => /Diwali offer/.test(x.title)); expect(line).toBeTruthy();
    expect(line).toMatchObject({ kind: 'broadcast', read: false, url: '/?tab=pcontrol' }); expect(line.title).toContain('Kinds Heights'); expect(line.body).toContain('Free parking');
    lineId = line.id;
    expect((await inbox('S2')).unread).toBe(b2 + 1);                                   // the other partner has his own line
    expect((await inbox('S3')).items.some((x: any) => /Diwali offer/.test(x.title))).toBe(false); // a broker who is not appointed hears nothing
    expect((await inbox('BLD')).items.some((x: any) => /Diwali offer/.test(x.title))).toBe(false); // nor does the sender
  });
  it('a line can be marked read, one by one or all together; a wrong request is refused', async () => {
    expect((await call(jar.S1, 'POST', '/api/inbox/read', { ids: [lineId] })).status).toBe(200);
    const d = await inbox('S1'); expect(d.items.find((x: any) => x.id === lineId).read).toBe(true); expect(d.unread).toBe(before);
    expect((await call(jar.S1, 'POST', '/api/inbox/read', { everyone: true })).status).toBe(400);
    expect((await call(jar.S1, 'POST', '/api/inbox/read', { ids: 'all' })).status).toBe(400);
    const all = await j(await call(jar.S1, 'POST', '/api/inbox/read', {})); expect(all.unread).toBe(0);
    // another person's id changes nothing
    const was = (await inbox('S2')).unread; await call(jar.S1, 'POST', '/api/inbox/read', { ids: (await inbox('S2')).items.map((x: any) => x.id) });
    expect((await inbox('S2')).unread).toBe(was);
  });
  it('nobody can remove a line that is not his', async () => {
    const theirs = (await inbox('S2')).items[0];
    expect((await call(jar.S1, 'DELETE', `/api/inbox/${theirs.id}`)).status).toBe(404);
    expect((await call(jar.S1, 'DELETE', '/api/inbox/NTF-nothing')).status).toBe(404);
    expect((await inbox('S2')).items.some((x: any) => x.id === theirs.id)).toBe(true);
  });
  it('one line can be removed, and "Clear all" empties only my own bell', async () => {
    expect((await call(jar.S1, 'DELETE', `/api/inbox/${lineId}`)).status).toBe(200);
    expect((await inbox('S1')).items.some((x: any) => x.id === lineId)).toBe(false);
    const s2 = (await inbox('S2')).items.length; expect(s2).toBeGreaterThan(0);
    const r = await j(await call(jar.S1, 'DELETE', '/api/inbox')); expect(r).toMatchObject({ success: true, unread: 0 });
    expect(await inbox('S1')).toMatchObject({ items: [], unread: 0 });
    expect((await inbox('S2')).items.length).toBe(s2);
  });
  it('the bell keeps a line even when his phone alerts for that kind are switched off', async () => {
    expect((await call(jar.S2, 'PUT', '/api/push/prefs', { deals: false, quiet: true })).status).toBe(200);
    const n = (await inbox('S2')).items.length;
    const doc = await j(await call(jar.BLD, 'POST', `/api/pcontrol/builder/projects/${P}/collateral`, { title: 'Quiet paper', kind: 'BROCHURE', url: 'https://example.com/quiet.pdf', audience: 'SELECTED', brokerIds: [B2] }));
    expect(doc.success).toBe(true);
    const d = await inbox('S2'); expect(d.items.length).toBe(n + 1);
    expect(d.items.find((x: any) => /Quiet paper/.test(x.title))).toMatchObject({ kind: 'deals', read: false });
    await call(jar.S2, 'PUT', '/api/push/prefs', { deals: true, quiet: false });
    await call(jar.BLD, 'DELETE', `/api/pcontrol/builder/projects/${P}/collateral/${doc.collateral.id}`);
  });
  it('words come in Hindi when the person reads in Hindi', async () => {
    const doc = await j(await call(jar.BLD, 'POST', `/api/pcontrol/builder/projects/${P}/collateral`, { title: 'Hindi paper', kind: 'BROCHURE', url: 'https://example.com/h.pdf', audience: 'SELECTED', brokerIds: [B1] }));
    const en = (await inbox('S1', '?lang=en')).items.find((x: any) => /Hindi paper/.test(x.title)); const hi = (await inbox('S1', '?lang=hi')).items.find((x: any) => /Hindi paper/.test(x.title));
    expect(en.body).toMatch(/shared a paper with you personally/); expect(/[ऀ-ॿ]/.test(hi.body)).toBe(true); expect(hi.id).toBe(en.id);
    await call(jar.BLD, 'DELETE', `/api/pcontrol/builder/projects/${P}/collateral/${doc.collateral.id}`); await call(jar.S1, 'DELETE', '/api/inbox');
  });
  it('his data export carries the lines still in his bell; a team member\'s limited file does not', async () => {
    const exp = await j(await call(jar.S2, 'GET', '/api/privacy/export'));
    expect(Array.isArray(exp.notifications)).toBe(true); expect(exp.notifications.length).toBeGreaterThan(0);
    expect(JSON.stringify(exp.notifications)).not.toContain('"userId"');
    const lim = await j(await call(jar.POOJA, 'GET', '/api/privacy/export')); expect(lim.scope).toBe('LIMITED'); expect(lim.notifications).toBeUndefined();
  });
});

// ───────────────────────── 2 · many kinds of unit ─────────────────────────
describe('kinds of unit, own number, own code, own rate', () => {
  const gen = (b: any, who = 'BLD') => call(jar[who], 'POST', `/api/inventory/projects/${P}/units/generate`, b);
  const grid = async (who = 'BLD') => (await j(await call(jar[who], 'GET', `/api/inventory/projects/${P}`)));
  const byLabel = async (label: string, who = 'BLD') => (await grid(who)).units.find((u: any) => u.label === label);
  it('flats by floor: numbered A-101…, price rises per floor, codes run GR-0001…', async () => {
    const r = await j(await gen({ unitKind: 'FLAT', group: 'Tower A', prefix: 'A-', startFloor: 1, floors: 3, perFloor: 2, config: '3 BHK', areaSqft: 1450, basePrice: 8_500_000, floorRise: 100_000, codePrefix: 'GR' }));
    expect(r.added).toBe(6);
    const u = await byLabel('A-201'); expect(u).toMatchObject({ kind: 'FLAT', floor: 2, price: 8_600_000, code: 'GR-0003', config: '3 BHK', group: 'Tower A' });
    expect((await byLabel('A-102')).code).toBe('GR-0002'); expect((await byLabel('A-302')).price).toBe(8_700_000);
  });
  it('a penthouse block starting on floor 15, priced by rate × area; codes carry on', async () => {
    expect((await j(await gen({ unitKind: 'PENTHOUSE', group: 'Tower A', prefix: 'PH-', startFloor: 15, floors: 1, perFloor: 2, config: '4 BHK', areaSqft: 2600, ratePerSqft: 9000, codePrefix: 'GR' }))).added).toBe(2);
    expect(await byLabel('PH-1501')).toMatchObject({ kind: 'PENTHOUSE', floor: 15, price: 23_400_000, code: 'GR-0007' });
    expect((await byLabel('PH-1502')).code).toBe('GR-0008');
  });
  it('plots are numbered serially, have no floor; "floors" is ignored for them; no code prefix = no code', async () => {
    expect((await j(await gen({ unitKind: 'PLOT', group: 'Phase 1', prefix: 'P-', floors: 9, perFloor: 4, config: 'Plot', areaSqft: 1500, basePrice: 2_550_000 }))).added).toBe(4);
    const p = await byLabel('P-3'); expect(p.kind).toBe('PLOT'); expect(p.floor).toBeUndefined(); expect(p.code).toBeUndefined(); expect(p.price).toBe(2_550_000);
  });
  it('independent houses / villas with their own code series', async () => {
    expect((await j(await gen({ unitKind: 'VILLA', group: 'Phase 2', prefix: 'V-', perFloor: 2, config: '3 BHK', areaSqft: 1800, basePrice: 9_500_000, codePrefix: 'VL' }))).added).toBe(2);
    expect(await byLabel('V-2')).toMatchObject({ kind: 'VILLA', code: 'VL-0002' });
  });
  it('the old way of asking (TOWER / PLOTS) still works', async () => {
    expect((await j(await gen({ kind: 'TOWER', group: 'Old Tower', prefix: 'O-', floors: 2, perFloor: 1, basePrice: 5_000_000 }))).added).toBe(2);
    expect((await j(await gen({ kind: 'PLOTS', group: 'Old Plots', prefix: 'OP-', perFloor: 2, basePrice: 1_500_000 }))).added).toBe(2);
    expect((await byLabel('O-201')).kind).toBe('FLAT'); expect((await byLabel('OP-1')).kind).toBe('PLOT');
  });
  it('wrong requests are refused: no kind, no price, rate without area, bad prefix, duplicate numbers, not the owner', async () => {
    expect((await gen({ group: 'X', prefix: 'X-', perFloor: 1, basePrice: 1_000_000 })).status).toBe(400);
    expect((await gen({ unitKind: 'PLOT', group: 'X', prefix: 'X-', perFloor: 1 })).status).toBe(400);
    expect((await gen({ unitKind: 'PLOT', group: 'X', prefix: 'X-', perFloor: 1, ratePerSqft: 2000 })).status).toBe(400);
    expect((await gen({ unitKind: 'PLOT', group: 'X', prefix: 'X-', perFloor: 1, basePrice: 1_000_000, codePrefix: 'G-R' })).status).toBe(400);
    expect((await gen({ unitKind: 'PLOT', group: 'Phase 9', prefix: 'P-', perFloor: 1, basePrice: 1_000_000 })).status).toBe(409);        // P-1 exists already
    expect((await gen({ unitKind: 'PLOT', group: 'X', prefix: 'X-', perFloor: 1, basePrice: 1_000_000 }, 'S1')).status).toBe(403);       // a partner cannot build the grid
    expect((await gen({ unitKind: 'PLOT', group: 'X', prefix: 'X-', perFloor: 1, basePrice: 1_000_000 }, 'BLD2')).status).toBe(404);      // another builder
  });
  it('the grid says what each unit is; a partner sees kind and code too', async () => {
    const g = await grid(); const kinds: Record<string, number> = {};
    for (const u of g.units) kinds[u.kind] = (kinds[u.kind] || 0) + 1;
    expect(kinds).toEqual({ FLAT: 8, PENTHOUSE: 2, PLOT: 6, VILLA: 2 });
    const seen = await byLabel('PH-1501', 'S1'); expect(seen).toMatchObject({ kind: 'PENTHOUSE', code: 'GR-0007', price: 23_400_000 });
    const proj = await j(await call(jar.S1, 'GET', `/api/pcontrol/partner/projects/${P}`));
    expect(proj.availableUnits_list.find((x: any) => x.label === 'V-1')).toMatchObject({ kind: 'VILLA', code: 'VL-0001' });
  });
  it('the builder can change one unit\'s kind or code; a code belongs to one unit; a partner cannot', async () => {
    const a = await byLabel('P-1'); const b = await byLabel('P-2');
    const put = (id: string, body: any, who = 'BLD') => call(jar[who], 'PUT', `/api/inventory/units/${id}`, body);
    expect((await put(a.id, { code: 'MY-CODE 1' })).status).toBe(200); expect((await byLabel('P-1')).code).toBe('MY-CODE 1');
    expect((await put(b.id, { code: 'my-code 1' })).status).toBe(409);
    expect((await put(b.id, { code: '<script>' })).status).toBe(400);
    expect((await put(a.id, { code: null })).status).toBe(200); expect((await byLabel('P-1')).code).toBeUndefined();
    expect((await put(b.id, { kind: 'SHOP' })).status).toBe(200); expect((await byLabel('P-2')).kind).toBe('SHOP');
    expect((await put(b.id, { kind: 'SPACESHIP' })).status).toBe(400);
    expect((await put(b.id, { kind: 'PLOT' }, 'S1')).status).toBe(403);
    expect((await put(b.id, { kind: 'PLOT' })).status).toBe(200);
  });
  it('one action for a whole kind: set the kind in bulk, or change the rate of all plots at once (with a preview)', async () => {
    const g = await grid(); const ids = g.units.filter((u: any) => u.group === 'Old Plots').map((u: any) => u.id);
    const bulk = (b: any) => call(jar.BLD, 'POST', `/api/inventory/projects/${P}/units/bulk`, b);
    expect((await bulk({ unitIds: ids, action: 'KIND', unitKind: 'VILLA' })).status).toBe(200);
    expect((await byLabel('OP-1')).kind).toBe('VILLA');
    expect((await bulk({ unitIds: ids, action: 'KIND', unitKind: 'JET' })).status).toBe(400);
    expect((await bulk({ unitIds: ids, action: 'KIND', unitKind: 'PLOT' })).status).toBe(200);
    const prev = await j(await bulk({ filter: { kind: 'PLOT' }, action: 'RATE', rule: { mode: 'PCT', value: 10 }, dryRun: true }));
    expect(prev.total).toBe(6); expect(prev.changes.length).toBe(6);
    const done = await j(await bulk({ filter: { kind: 'PLOT' }, action: 'RATE', rule: { mode: 'PCT', value: 10 }, reason: 'Diwali' }));
    expect(done.applied).toBe(6); expect((await byLabel('P-3')).price).toBe(2_805_000); expect((await byLabel('A-101')).price).toBe(8_500_000); // flats untouched
  });
  it('a sheet can carry kind (the way people write it) and the builder\'s code; mistakes save nothing', async () => {
    const imp = (rows: any[]) => call(jar.BLD, 'POST', `/api/inventory/projects/${P}/units/import`, { rows });
    const total = async () => (await grid()).units.length;
    const n0 = await total();
    const bad1 = await imp([{ group: 'Phase 3', label: 'S-1', kind: 'Shop', price: 4_000_000 }, { group: 'Phase 3', label: 'S-2', kind: 'Spaceship', price: 3_000_000 }]);
    expect(bad1.status).toBe(400); expect((await j(bad1)).errors[0].error).toMatch(/Unknown kind/);
    const bad2 = await imp([{ group: 'Phase 3', label: 'S-1', code: 'SH-1', price: 4_000_000 }, { group: 'Phase 3', label: 'S-2', code: 'sh-1', price: 3_000_000 }]);
    expect(bad2.status).toBe(400); expect((await j(bad2)).errors[0].error).toMatch(/twice/);
    const bad3 = await imp([{ group: 'Phase 3', label: 'S-9', code: 'GR-0001', price: 4_000_000 }]);
    expect(bad3.status).toBe(400); expect((await j(bad3)).errors[0].error).toMatch(/already belongs to A-101/);
    expect(await total()).toBe(n0);
    const ok = await j(await imp([
      { group: 'Phase 3', label: 'S-1', kind: 'Shop', code: 'SH-1', config: 'Ground floor', areaSqft: 300, price: 4_000_000, floor: 0 },
      { group: 'Phase 3', label: 'OF-1', kind: 'office', code: 'SH-2', price: 3_000_000, floor: 1 },
      { group: 'Phase 3', label: 'X-1', price: 1_000_000, floor: 2 },
      { group: 'Phase 3', label: 'X-2', price: 1_100_000 },
    ]));
    expect(ok).toMatchObject({ created: 4, updated: 0 });
    expect(await byLabel('S-1')).toMatchObject({ kind: 'SHOP', code: 'SH-1', floor: 0 }); expect((await byLabel('OF-1')).kind).toBe('OFFICE');
    expect((await byLabel('X-1')).kind).toBe('FLAT'); expect((await byLabel('X-2')).kind).toBe('PLOT');                       // no kind written: a floor means a flat, no floor a plot
    const again = await j(await imp([{ group: 'Phase 3', label: 'S-1', kind: 'Shop', price: 4_200_000 }]));                 // update keeps the code
    expect(again).toMatchObject({ created: 0, updated: 1 }); expect(await byLabel('S-1')).toMatchObject({ code: 'SH-1', price: 4_200_000 });
  });
  it('personal inventory: a unit shown only to one partner is invisible to the other', async () => {
    const u = await byLabel('PH-1502');
    expect((await call(jar.BLD, 'PUT', `/api/inventory/units/${u.id}`, { vis: { audience: 'SELECTED', brokerIds: [B1] } })).status).toBe(200);
    expect(await byLabel('PH-1502', 'S1')).toBeTruthy(); expect(await byLabel('PH-1502', 'S2')).toBeUndefined();
    expect((await call(jar.BLD, 'PUT', `/api/inventory/units/${u.id}`, { vis: null })).status).toBe(200);
    expect(await byLabel('PH-1502', 'S2')).toBeTruthy();
  });
});

// ───────────────────────── 3 · project papers ─────────────────────────
describe('project papers: builder → partner → team → client', () => {
  const url = (n: string) => `https://example.com/${n}.pdf`;
  const add = (b: any, who = 'BLD') => call(jar[who], 'POST', `/api/pcontrol/builder/projects/${P}/collateral`, b);
  const patch = (id: string, b: any, who = 'BLD') => call(jar[who], 'PATCH', `/api/pcontrol/builder/projects/${P}/collateral/${id}`, b);
  const docs = async (who: string) => (await j(await call(jar[who], 'GET', `/api/projdocs?projectId=${P}`)));
  const titles = async (who: string) => (await docs(who)).docs.map((d: any) => d.title).sort();
  const D: Record<string, string> = {};

  it('the builder chooses who gets a paper and how far it may go; wrong choices are refused', async () => {
    const bro = await j(await add({ title: 'Brochure', kind: 'BROCHURE', url: url('b'), audience: 'ALL_CPS' })); expect(bro.success).toBe(true); D.brochure = bro.collateral.id;
    for (const [k, b] of Object.entries({
      price: { title: 'Price list', kind: 'PRICE_LIST', url: url('p'), audience: 'ASSOCIATES', passOn: 'TEAM' },
      plan: { title: 'Personal plan', kind: 'PAYMENT_PLAN', url: url('pp'), audience: 'SELECTED', brokerIds: [B1], passOn: 'CLIENT', note: 'Valid till 30 Nov' },
      other: { title: 'Only for B2', kind: 'OTHER', url: url('o'), audience: 'SELECTED', brokerIds: [B2] },
    })) { const r = await j(await add(b)); expect(r.success, k).toBe(true); D[k] = r.collateral.id; }
    expect((await add({ title: 'Nobody', url: url('n'), audience: 'SELECTED' })).status).toBe(400);
    expect((await add({ title: 'Nobody', url: url('n'), audience: 'SELECTED', brokerIds: [] })).status).toBe(400);
    expect((await add({ title: 'Stranger', url: url('n'), audience: 'SELECTED', brokerIds: ['USR-BRK-003'] })).status).toBe(400);
    expect((await add({ title: 'Odd', url: url('n'), passOn: 'EVERYWHERE' })).status).toBe(400);
    expect((await add({ title: 'Evil', url: 'javascript:alert(1)' })).status).toBe(400);
    expect((await add({ title: 'Mine', url: url('m') }, 'S1')).status).toBe(403);
    expect((await add({ title: 'Theirs', url: url('t') }, 'BLD2')).status).toBe(404);
    const d = (await j(await call(jar.BLD, 'GET', `/api/pcontrol/builder/projects/${P}`))).collateral.find((c: any) => c.id === D.plan);
    expect(d).toMatchObject({ audience: 'SELECTED', brokerIds: [B1], passOn: 'CLIENT', note: 'Valid till 30 Nov' });
  });
  it('a paper given personally is seen by that partner only — on the project page and in the papers list', async () => {
    const view = async (who: string) => (await j(await call(jar[who], 'GET', `/api/pcontrol/partner/projects/${P}`))).collateral;
    expect((await view('S1')).map((c: any) => c.title).sort()).toEqual(['Brochure', 'Personal plan', 'Price list']);
    expect((await view('S2')).map((c: any) => c.title).sort()).toEqual(['Brochure', 'Only for B2', 'Price list']);
    expect((await view('S3')).map((c: any) => c.title)).toEqual(['Brochure']);                          // not appointed: only what is for all brokers
    expect((await view('S1')).find((c: any) => c.title === 'Personal plan')).toMatchObject({ personal: true, passOn: 'CLIENT', note: 'Valid till 30 Nov' });
    expect(await titles('S1')).toEqual(['Brochure', 'Personal plan', 'Price list']);
    expect(await titles('S2')).toEqual(['Brochure', 'Only for B2', 'Price list']);
    expect((await docs('S3')).docs).toEqual([]);                                                       // no mandate on this project = nothing
    const one = (await docs('S1')).docs;
    expect(one.find((d: any) => d.title === 'Brochure')).toMatchObject({ canTeam: false, canClient: false, personal: false });
    expect(one.find((d: any) => d.title === 'Price list')).toMatchObject({ canTeam: true, canClient: false });
    expect(one.find((d: any) => d.title === 'Personal plan')).toMatchObject({ canTeam: true, canClient: true, personal: true });
    expect((await call(jar.BLD, 'GET', '/api/projdocs')).status).toBe(403); expect((await call(jar.BUYER, 'GET', '/api/projdocs')).status).toBe(403); expect((await call(undefined, 'GET', '/api/projdocs')).status).toBe(401);
  });
  it('the chosen partner is told on his phone and in his bell; the other partner is not', async () => {
    expect((await inbox('S1')).items.some((x: any) => /Personal plan/.test(x.title))).toBe(true);
    expect((await inbox('S2')).items.some((x: any) => /Personal plan/.test(x.title))).toBe(false);
    expect((await inbox('S2')).items.some((x: any) => /Only for B2/.test(x.title))).toBe(true);
  });
  it('his team sees nothing until he shows it', async () => {
    for (const w of ['POOJA', 'RAKESH', 'DIVYA']) expect((await docs(w)).docs, w).toEqual([]);
  });
  it('showing papers to the team: only what the builder lets travel, only own team, only people who can open papers', async () => {
    const post = (b: any, who = 'S1') => call(jar[who], 'POST', '/api/projdocs/posts', { projectId: P, ...b });
    expect((await post({ docIds: [] })).status).toBe(400);
    expect((await post({ docIds: [D.brochure] })).status).toBe(403);                       // builder kept it for the partner alone
    expect((await post({ docIds: [D.price], allowClient: true })).status).toBe(403);       // builder allows the team to read, not to send
    expect((await post({ docIds: [D.other] })).status).toBe(404);                          // not his paper
    expect((await post({ docIds: ['PC-nothing'] })).status).toBe(400);
    expect((await post({ docIds: [D.price], memberIds: ['USR-TEAM-003'] })).status).toBe(400); // Divya works for partner 2
    expect((await post({ docIds: [D.price] }, 'S3')).status).toBe(404);                    // no mandate
    expect((await post({ docIds: [D.price] }, 'POOJA')).status).toBe(403);                 // staff cannot post
    expect((await post({ docIds: [D.price] }, 'BLD')).status).toBe(403);
    expect((await call(jar.S1, 'POST', '/api/projdocs/posts', { projectId: 'NOPE', docIds: [D.price] })).status).toBe(404);
    // nobody to show to: both staff have unit access switched off
    for (const m of ['USR-TEAM-001', 'USR-TEAM-002']) expect((await call(jar.S1, 'PUT', `/api/pcontrol/team/${m}/policy`, { invMode: 'OFF' })).status).toBe(200);
    expect((await post({ docIds: [D.price] })).status).toBe(409);
    await call(jar.S1, 'PUT', '/api/pcontrol/team/USR-TEAM-001/policy', { invMode: 'SHARED', invShareOut: false });
    await call(jar.S1, 'PUT', '/api/pcontrol/team/USR-TEAM-002/policy', { invMode: 'ALL', invShareOut: true });
  });
  let post1 = ''; let post2 = '';
  it('a post for named people reaches only them; a post for the whole team reaches everyone; they are told', async () => {
    const poojaBefore = (await inbox('POOJA')).unread;
    const r1 = await j(await call(jar.S1, 'POST', '/api/projdocs/posts', { projectId: P, docIds: [D.price], memberIds: ['USR-TEAM-001'], note: 'Use this one' })); expect(r1.success).toBe(true); post1 = r1.post.id;
    expect(await titles('POOJA')).toEqual(['Price list']); expect(await titles('RAKESH')).toEqual([]);
    const pj = (await docs('POOJA')).docs[0]; expect(pj).toMatchObject({ canClient: false, fromNote: 'Use this one', passOn: 'TEAM' });
    expect(pj.note).toBeUndefined();                                                       // the builder's note to the partner is not passed down
    expect((await inbox('POOJA')).unread).toBe(poojaBefore + 1); expect((await inbox('POOJA')).items[0].title).toContain('Price list');
    const r2 = await j(await call(jar.S1, 'POST', '/api/projdocs/posts', { projectId: P, docIds: [D.plan], allowClient: true })); expect(r2.success).toBe(true); post2 = r2.post.id;
    expect(await titles('POOJA')).toEqual(['Personal plan', 'Price list']); expect(await titles('RAKESH')).toEqual(['Personal plan']);
    expect((await docs('POOJA')).docs.find((d: any) => d.title === 'Personal plan').canClient).toBe(false);   // Pooja may read but has no customer-link right
    expect((await docs('RAKESH')).docs[0].canClient).toBe(true);
    expect((await docs('RAKESH')).docs[0].note).toBeUndefined();
    expect((await docs('DIVYA')).docs).toEqual([]);                                        // another partner's staff see nothing
    const mine = await docs('S1'); expect(mine.posts.length).toBe(2); expect(mine.team.find((m: any) => m.id === 'USR-TEAM-002')).toMatchObject({ canSee: true, canSend: true }); expect(mine.team.find((m: any) => m.id === 'USR-TEAM-001')).toMatchObject({ canSee: true, canSend: false });
    expect(mine.docs.find((d: any) => d.title === 'Personal plan').shownTo).toBe(1);
  });
  let link = ''; let selfLink = '';
  it('a client page: whoever is allowed makes one; the others are refused', async () => {
    const mk = (docId: string, who: string) => call(jar[who], 'POST', '/api/projdocs/shares', { projectId: P, docId, clientLabel: 'Mr Sharma', lang: 'en' });
    expect((await mk(D.plan, 'POOJA')).status).toBe(403);                                  // no customer-link right
    expect((await mk(D.price, 'RAKESH')).status).toBe(404);                                // not shown to him
    expect((await mk(D.price, 'S1')).status).toBe(403);                                    // the builder stops at the team
    expect((await mk(D.brochure, 'S1')).status).toBe(403);
    expect((await mk(D.other, 'S1')).status).toBe(404);
    expect([403, 404]).toContain((await mk(D.plan, 'DIVYA')).status);                   // unit access switched off for her
    expect((await mk(D.plan, 'S3')).status).toBe(404);
    expect([403, 404]).toContain((await mk(D.plan, 'BLD')).status);                     // a builder has no partner desk
    const r = await j(await mk(D.plan, 'RAKESH')); expect(r.path).toMatch(/^\/s\/[\w-]{8,}$/); link = r.path;
    selfLink = (await j(await mk(D.plan, 'S1'))).path;
    const pg = await page(link);
    expect(pg.status).toBe(200); expect(pg.html).toContain('Personal plan'); expect(pg.html).toContain('Kinds Heights'); expect(pg.html).toContain('https://example.com/pp.pdf'); expect(pg.html).toContain('noopener noreferrer');
    expect(pg.html).not.toContain('Valid till 30 Nov');                                    // the builder\'s note to the partner is not the client\'s business
    expect(pg.html).not.toContain('Mr Sharma');                                           // the label is for the sender only
  });
  it('the sender sees his links and the views; an employer sees his staff\'s links too; only they can stop one', async () => {
    const mine = (await j(await call(jar.RAKESH, 'GET', '/api/projdocs/shares'))).links; expect(mine.length).toBe(1);
    expect(mine[0]).toMatchObject({ title: 'Personal plan', projectName: 'Kinds Heights', clientLabel: 'Mr Sharma', revoked: false }); expect(mine[0].views).toBeGreaterThanOrEqual(1);
    const boss = (await j(await call(jar.S1, 'GET', '/api/projdocs/shares'))).links; expect(boss.length).toBe(2); expect(boss.find((l: any) => l.by)?.by).toMatch(/Rakesh/);
    expect(JSON.stringify(boss)).not.toMatch(/\b\d{10}\b/);                                // no phone numbers anywhere
    const pj = await call(jar.POOJA, 'GET', '/api/projdocs/shares'); if (pj.status === 200) expect((await j(pj)).links).toEqual([]); else expect(pj.status).toBe(403);
    expect((await call(jar.S2, 'POST', `/api/projdocs/shares/${link.slice(3)}/revoke`, {})).status).toBe(404);
    expect((await call(jar.POOJA, 'POST', `/api/projdocs/shares/${link.slice(3)}/revoke`, {})).status).toBe(404);
  });
  it('it is checked live: lowering what the builder allows stops the next view, raising it brings it back', async () => {
    expect((await patch(D.plan, { passOn: 'TEAM' })).status).toBe(200);
    expect((await page(link)).status).toBe(404); expect((await page(selfLink)).status).toBe(404);
    expect((await docs('RAKESH')).docs[0].canClient).toBe(false);
    expect((await call(jar.RAKESH, 'POST', '/api/projdocs/shares', { projectId: P, docId: D.plan })).status).toBe(403);
    expect((await patch(D.plan, { passOn: 'NONE' })).status).toBe(200);
    expect(await titles('RAKESH')).toEqual([]);                                            // the team can no longer even read it
    expect((await call(jar.S1, 'POST', `/api/projdocs/posts`, { projectId: P, docIds: [D.plan] })).status).toBe(403);
    expect((await patch(D.plan, { passOn: 'CLIENT' })).status).toBe(200);
    expect((await page(link)).status).toBe(200); expect(await titles('RAKESH')).toEqual(['Personal plan']);
  });
  it('taking a paper away from a partner shuts him and his people out at once', async () => {
    expect((await patch(D.plan, { audience: 'SELECTED', brokerIds: [B2] })).status).toBe(200);
    expect(await titles('S1')).toEqual(['Brochure', 'Price list']); expect(await titles('RAKESH')).toEqual([]);
    expect((await page(link)).status).toBe(404); expect((await page(selfLink)).status).toBe(404);
    expect((await inbox('S2')).items.some((x: any) => /Personal plan/.test(x.title))).toBe(true);   // the newly chosen partner is told
    expect((await patch(D.plan, { audience: 'SELECTED', brokerIds: [B1] })).status).toBe(200);
    expect((await page(link)).status).toBe(200);
    expect((await patch(D.plan, { audience: 'SELECTED', brokerIds: ['USR-BRK-003'] })).status).toBe(400);
    expect((await patch(D.price, { audience: 'SELECTED' })).status).toBe(400);               // switching to "chosen partners" needs the names
    expect((await patch(D.plan, { audience: 'SELECTED' })).status).toBe(200);                // already personal: the names it has stay
    expect((await patch(D.plan, { passOn: 'ALL' })).status).toBe(400);
    expect((await patch(D.plan, { owner: 'me' })).status).toBe(400);                       // strict: nothing else can be slipped in
    expect((await patch(D.plan, { note: 'x' }, 'S1')).status).toBe(403);
    expect((await patch(D.plan, { note: 'x' }, 'BLD2')).status).toBe(404);
    expect((await patch('PC-none', { note: 'x' })).status).toBe(404);
  });
  it('a pause of the partnership, or of the staff member, also stops it; resuming brings it back', async () => {
    const mand = (await j(await call(jar.BLD, 'GET', `/api/pcontrol/builder/projects/${P}`))).partners.find((m: any) => m.brokerId === B1).id;
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${mand}/status`, { action: 'PAUSE', reason: 'Quality review' })).status).toBe(200);
    expect((await docs('S1')).docs).toEqual([]); expect((await docs('RAKESH')).docs).toEqual([]); expect((await page(link)).status).toBe(404); expect((await page(selfLink)).status).toBe(404);
    expect((await call(jar.S1, 'POST', '/api/projdocs/shares', { projectId: P, docId: D.plan })).status).toBe(404);
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${mand}/status`, { action: 'RESUME' })).status).toBe(200);
    expect((await page(link)).status).toBe(200);
    // the staff member\'s own switches
    expect((await call(jar.S1, 'PUT', '/api/pcontrol/team/USR-TEAM-002/policy', { invShareOut: false })).status).toBe(200);
    expect((await page(link)).status).toBe(404); expect((await docs('RAKESH')).docs[0].canClient).toBe(false); expect((await page(selfLink)).status).toBe(200);
    expect((await call(jar.S1, 'PUT', '/api/pcontrol/team/USR-TEAM-002/policy', { invShareOut: true, invMode: 'OFF' })).status).toBe(200);
    expect((await docs('RAKESH')).docs).toEqual([]); expect((await page(link)).status).toBe(404);
    expect((await call(jar.S1, 'PUT', '/api/pcontrol/team/USR-TEAM-002/policy', { invMode: 'ALL', invShareOut: true })).status).toBe(200);
    expect((await call(jar.S1, 'PUT', '/api/pcontrol/team/USR-TEAM-002/policy', { onLeave: true })).status).toBe(200);
    expect((await docs('RAKESH')).docs).toEqual([]); expect((await page(link)).status).toBe(404);
    expect((await call(jar.S1, 'PUT', '/api/pcontrol/team/USR-TEAM-002/policy', { onLeave: false })).status).toBe(200);
    expect((await page(link)).status).toBe(200);
  });
  it('ending a post takes the papers away from the staff and kills their client pages; the partner\'s own page stays', async () => {
    expect((await call(jar.S2, 'POST', `/api/projdocs/posts/${post2}/end`, {})).status).toBe(404);
    expect((await call(jar.POOJA, 'POST', `/api/projdocs/posts/${post2}/end`, {})).status).toBe(403);
    expect((await call(jar.S1, 'POST', `/api/projdocs/posts/${post2}/end`, {})).status).toBe(200);
    expect(await titles('RAKESH')).toEqual([]); expect(await titles('POOJA')).toEqual(['Price list']);
    expect((await page(link)).status).toBe(404); expect((await page(selfLink)).status).toBe(200);
    expect((await docs('S1')).posts.map((p: any) => p.id)).toEqual([post1]);
    expect((await call(jar.S1, 'POST', `/api/projdocs/shares/${selfLink.slice(3)}/revoke`, {})).status).toBe(200);
    expect((await page(selfLink)).status).toBe(404);
    expect((await page('/s/nonsense-token')).status).toBe(404);
  });
  it('removing a paper removes it everywhere', async () => {
    const mk = await j(await call(jar.S1, 'POST', '/api/projdocs/shares', { projectId: P, docId: D.plan, lang: 'hi' })); const l2 = mk.path;
    const hi = await page(l2); expect(hi.status).toBe(200); expect(/[ऀ-ॿ]/.test(hi.html)).toBe(true);
    expect((await call(jar.BLD, 'DELETE', `/api/pcontrol/builder/projects/${P}/collateral/${D.plan}`)).status).toBe(200);
    expect(await titles('S1')).toEqual(['Brochure', 'Price list']); expect((await page(l2)).status).toBe(404);
    expect((await call(jar.S1, 'POST', '/api/projdocs/shares', { projectId: P, docId: D.plan })).status).toBe(404);
  });
  it('only a partner or his staff has a papers desk', async () => {
    for (const w of ['ADMIN', 'OWNER', 'CON', 'LEGAL']) expect((await call(jar[w], 'GET', `/api/projdocs?projectId=${P}`)).status, w).toBe(403);
    expect((await call(jar.S2, 'POST', '/api/projdocs/shares', { projectId: P, docId: D.price })).status).toBe(403); // partner 2 sees it, but the builder stops it at the team
  });
});
