import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * v78 — against a real server:
 *  (1) a client page that stamps the name of whoever sent the link across the paper,
 *  (2) the builder can manage inventory from inside his project room,
 *  (3) profiles for everyone: search (professionals by name, anyone by exact mobile / GZ code, a private person only for a professional),
 *      ratings & reviews that only come from people who really worked together, one vote each, reply / report / GENZ hides.
 * Demo people who have really worked together: BRK-001 ↔ BRK-002 ↔ OWNER-001 (a deal room), BRK-001/BRK-002 ↔ BUILDER-001 (partnership), OWNER-001 ↔ BRK-001 (mandate).
 * BRK-003 and the buyer have worked with nobody.
 */
const PORT = await freePort();
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
const B1 = 'USR-BRK-001'; const B2 = 'USR-BRK-002'; const B3 = 'USR-BRK-003'; const OWN = 'USR-OWNER-001'; const BUY = 'USR-BUYER-001'; const BLD1 = 'USR-BUILDER-001';
let P = '';

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v78-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, stdio: 'ignore',
    env: { ...process.env, KYC_VAULT_KEY: 'c3'.repeat(32), SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' },
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  expect(cfg).toBeTruthy();
  const ids: Record<string, string> = { BLD: BLD1, BLD2: 'USR-BUILDER-002', S1: B1, S2: B2, S3: B3, ADMIN: 'USR-ADMIN-1', OWNER: OWN, BUYER: BUY, CON: 'USR-CONTRACTOR-001', LEGAL: 'USR-LEGAL-001', POOJA: '9000030001', RAKESH: '9000030002' };
  for (const [k, id] of Object.entries(ids)) jar[k] = await login(id);
  const p = await j(await call(jar.BLD, 'POST', '/api/builder/projects', { projectName: 'Watermark Heights', locality: 'Shankar Nagar', reraNumber: 'CGRERAP787878', priceStartingFrom: 2500000, priceMax: 30000000, totalUnits: 60, channelPartnerCommissionPct: 2, unitConfigurations: ['3 BHK'] }));
  P = p.project?.id || p.projectId || p.id; expect(P).toBeTruthy();
  expect((await call(jar.S1, 'POST', `/api/pcontrol/partner/projects/${P}/apply`, { note: 'ready' })).status).toBe(200);
  const d = await j(await call(jar.BLD, 'GET', `/api/pcontrol/builder/projects/${P}`));
  for (const m of d.partners) expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${m.id}/decide`, { action: 'APPROVE', commissionPct: 2.5 })).status).toBe(200);
}, 120_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

// ───────────────────────── 1 · the name on the client's paper ─────────────────────────
describe('client page: the paper carries the name of whoever sent the link', () => {
  const add = (b: any) => call(jar.BLD, 'POST', `/api/pcontrol/builder/projects/${P}/collateral`, b);
  const mk = (docId: string, who: string) => call(jar[who], 'POST', '/api/projdocs/shares', { projectId: P, docId, clientLabel: 'Mr Sharma', lang: 'en' });
  const get = async (p: string) => { const r = await fetch(B + p); return { status: r.status, html: await r.text(), csp: r.headers.get('content-security-policy') || '' }; };
  let drive = ''; let pic = '';
  it('a Drive paper is shown inside the page as a preview with the sender\'s name over it', async () => {
    const d = await j(await add({ title: 'Layout plan', kind: 'BROCHURE', url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing', audience: 'SELECTED', brokerIds: [B1], passOn: 'CLIENT' })); expect(d.success).toBe(true); drive = d.collateral.id;
    const l = await j(await mk(drive, 'S1')); expect(l.path).toMatch(/^\/s\//);
    const pg = await get(l.path);
    expect(pg.status).toBe(200);
    expect(pg.html).toContain('class="vw"'); expect(pg.html).toContain('class="wmo"'); expect(pg.html).toContain('class="wmb"');
    expect(pg.html).toContain('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/preview');       // the preview, not the "view" page
    expect(pg.html).toContain('Vikramaditya%20Sharma');                                           // the name is in the repeating stamp
    expect(pg.html).toContain('V.S.');                                                            // …and the big faint initials
    expect(pg.html).toMatch(/class="wmb">[^<]*Vikramaditya Sharma/);                                // …and in the bar at the bottom
    expect(pg.html).toContain('<iframe'); expect(pg.html).toContain('sandbox="');
    expect(pg.csp).toContain('frame-src https:');                                                  // only this page may frame web papers
    expect(pg.csp).toContain("frame-ancestors 'none'");                                            // and nobody may frame it
    expect(pg.html).not.toContain('Mr Sharma');                                                    // the client's label stays with the sender
  });
  it('a picture is shown as a picture, with the same stamp', async () => {
    const d = await j(await add({ title: 'Floor plan', kind: 'BROCHURE', url: 'https://example.com/floor.JPG', audience: 'SELECTED', brokerIds: [B1], passOn: 'CLIENT' })); pic = d.collateral.id;
    const pg = await get((await j(await mk(pic, 'S1'))).path);
    expect(pg.status).toBe(200); expect(pg.html).toContain('<img src="https://example.com/floor.JPG"'); expect(pg.html).toContain('draggable="false"'); expect(pg.html).toContain('class="wmo"'); expect(pg.html).not.toContain('<iframe');
  });
  it('an employee\'s link carries the employee\'s name and the firm — not the boss\'s', async () => {
    expect((await call(jar.S1, 'POST', '/api/projdocs/posts', { projectId: P, docIds: [drive], allowClient: true })).status).toBe(200);     // the partner posts it to his team and lets them send it on
    const r = await mk(drive, 'RAKESH'); expect(r.status).toBe(200);
    const pg = await get((await j(r)).path);
    expect(pg.html).toContain('Rakesh%20Dewangan');
    expect(pg.html).toMatch(/Rakesh Dewangan · /);
    expect(pg.html).toContain('R.D.');
  });
  it('the page script stops the right-click menu on the paper and the paper is not printed', async () => {
    const js = await fetch(B + '/s/track.js'); expect(js.status).toBe(200); const t = await js.text();
    expect(t).toContain('contextmenu'); expect(t).toContain('.vw');
    const pg = await get((await j(await mk(drive, 'S1'))).path); expect(pg.html).toContain('@media print{.vw{display:none}}');
  });
  it('a revoked or unknown link still shows nothing', async () => {
    const l = await j(await mk(drive, 'S1')); const token = l.path.slice(3);
    expect((await call(jar.S1, 'POST', `/api/projdocs/shares/${token}/revoke`, {})).status).toBe(200);
    expect((await get(l.path)).status).toBe(404); expect((await get('/s/nonsense-token')).status).toBe(404);
  });
});

// ───────────────────────── 2 · the builder's inventory, inside his project ─────────────────────────
describe('builder: inventory of his own project', () => {
  it('he sees his project in the inventory list and can add flats to it; another builder cannot', async () => {
    const list = await j(await call(jar.BLD, 'GET', '/api/inventory/projects')); expect(list.projects.some((x: any) => x.id === P)).toBe(true);
    const gen = { unitKind: 'FLAT', group: 'Tower A', prefix: 'A', startFloor: 1, floors: 3, perFloor: 2, config: '3 BHK', areaSqft: 1450, basePrice: 7500000, floorRise: 50000 };
    expect((await call(jar.BLD2, 'POST', `/api/inventory/projects/${P}/units/generate`, gen)).status).toBe(404);
    expect((await call(jar.S1, 'POST', `/api/inventory/projects/${P}/units/generate`, gen)).status).toBe(403);
    const r = await j(await call(jar.BLD, 'POST', `/api/inventory/projects/${P}/units/generate`, gen)); expect(r).toMatchObject({ success: true, added: 6 });
    const grid = await j(await call(jar.BLD, 'GET', `/api/inventory/projects/${P}`)); expect(grid.units.length).toBe(6);
    expect(grid.caps?.canManage ?? grid.capabilities?.canManage ?? true).toBe(true);
    expect((await call(jar.BLD2, 'GET', `/api/inventory/projects/${P}`)).status).toBe(404);
  });
});

// ───────────────────────── 3 · profiles, ratings and reviews ─────────────────────────
const search = async (who: string, q: string) => { const r = await call(jar[who], 'GET', `/api/profiles/search?q=${encodeURIComponent(q)}`); return { status: r.status, ...(await j(r)) } as any; };
const open = async (who: string, id: string, t?: string) => { const r = await call(jar[who], 'GET', `/api/profiles/u/${id}${t ? `?t=${encodeURIComponent(t)}` : ''}`); return { status: r.status, ...(await j(r)) } as any; };
const rate = (who: string, id: string, b: any) => call(jar[who], 'POST', `/api/profiles/u/${id}/review`, b);
const inbox = async (who: string) => (await j(await call(jar[who], 'GET', '/api/inbox'))).items as any[];

describe('profiles: who may use them', () => {
  it('a sign-in is needed; every kind of member (and GENZ staff) has the desk; a shop partner does not', async () => {
    for (const [m, u] of [['GET', '/api/profiles/search?q=abc'], ['GET', '/api/profiles/mine'], ['PUT', '/api/profiles/mine'], ['GET', '/api/profiles/u/USR-BRK-001'], ['POST', '/api/profiles/u/USR-BRK-001/review'], ['GET', '/api/profiles/admin/queue']] as const) expect((await call(undefined, m, u, m === 'GET' ? undefined : {})).status, `${m} ${u}`).toBe(401);
    for (const who of ['BLD', 'S1', 'POOJA', 'OWNER', 'BUYER', 'CON', 'LEGAL', 'ADMIN']) expect((await call(jar[who], 'GET', '/api/profiles/mine')).status, who).toBe(200);
    const staff = await j(await call(jar.ADMIN, 'GET', '/api/profiles/mine')); expect(staff).toMatchObject({ staff: true, reviewsAboutMe: [], reviewsIWrote: [] });
    expect((await call(jar.ADMIN, 'PUT', '/api/profiles/mine', { about: 'hello' })).status).toBe(403);
    const cn = cfg.demoAccounts.find((x: any) => /CONNECTOR|SHOP/i.test(`${x.role} ${x.id}`));
    if (cn) { const c = await login(cn.id); expect((await call(c, 'GET', '/api/profiles/search?q=abc')).status).toBe(403); }
  });
  it('only admins can open the moderation desk', async () => {
    for (const who of ['S1', 'BLD', 'OWNER', 'BUYER', 'POOJA']) expect((await call(jar[who], 'GET', '/api/profiles/admin/queue')).status, who).toBe(403);
    expect((await call(jar.ADMIN, 'GET', '/api/profiles/admin/queue')).status).toBe(200);
  });
});

describe('profiles: finding a person', () => {
  it('a professional is found by name, firm or city; the card shows only what a public register already says', async () => {
    const r = await search('BLD', 'Capital Propex'); expect(r.status).toBe(200); expect(r.kind).toBe('TEXT');
    const c = r.results.find((x: any) => x.id === B1); expect(c).toBeTruthy();
    expect(c).toMatchObject({ name: 'Vikramaditya Sharma', firm: 'Capital Propex Raipur', group: 'BROKER', status: 'ACTIVE', code: 'GZ-BRK-492001' });
    expect(c.rating).toMatchObject({ count: 0, early: true });
    expect(JSON.stringify(r)).not.toMatch(/98271 ?22334|vikram\.realty|@gmail/);                 // no phone, no e-mail
    expect(JSON.stringify(r)).not.toContain('ticket');                                            // a professional needs no pass
    expect((await search('BLD', 'vikramaditya')).results.some((x: any) => x.id === B1)).toBe(true);
  });
  it('too short a search lists nothing — there is no browsing', async () => {
    const r = await search('S1', 'ab'); expect(r).toMatchObject({ kind: 'TOO_SHORT', results: [] }); expect(r.hint).toBeTruthy();
    expect((await search('S1', '')).results).toEqual([]);
  });
  it('a customer or an owner never shows by name — only by exact mobile or code, and only to a professional', async () => {
    for (const who of ['S1', 'BLD', 'LEGAL']) { const r = await search(who, 'Alok'); expect(r.results.some((x: any) => x.id === BUY || x.group === 'CUSTOMER'), who).toBe(false); }
    expect((await search('S1', 'Sunil')).results.some((x: any) => x.id === OWN)).toBe(false);
    expect((await search('S1', 'Pandey')).results.some((x: any) => x.id === BUY)).toBe(false);
    expect((await search('S1', '98263')).results.length).toBe(0);                                 // half a number is just a word
    const r = await search('S1', '+91 98263 77889'); expect(r.kind).toBe('PHONE');
    expect(r.results.length).toBe(1);
    const c = r.results[0]; expect(c).toMatchObject({ id: BUY, group: 'CUSTOMER', name: 'Alok P.', status: 'ACTIVE' }); expect(typeof c.ticket).toBe('string');
    expect(JSON.stringify(r)).not.toMatch(/98263|Pandey|@/); expect(c.firm).toBe('');                                      // not the surname, not the number back
    for (const who of ['POOJA', 'RAKESH', 'BLD', 'LEGAL']) expect((await search(who, '9826377889')).results.length, who).toBe(1);   // builder, counsel and the broker's staff may
    for (const who of ['OWNER', 'BUYER', 'CON']) expect((await search(who, '9826377889')).results.length, who).toBe(0);               // other customers, owners, contractors may not
    const o = await search('S2', '9826155667'); expect(o.results[0]).toMatchObject({ id: OWN, group: 'OWNER', name: 'Sunil L.' });
  });
  it('a GZ code works in any case; a pending account or a made-up number finds nothing', async () => {
    expect((await search('S1', 'gz-brk-492002')).results.map((x: any) => x.id)).toEqual([B2]);
    expect((await search('S1', 'GZ-BRK-492004')).results).toEqual([]);                            // Rohit is still PENDING
    expect((await search('S1', '9425533221')).results).toEqual([]);
    expect((await search('S1', '9999999999')).results).toEqual([]);
    expect((await search('S1', 'GZ-BRK-999999')).results).toEqual([]);
  });
  it('a private person opens only with the pass the exact search gave — his id alone opens nothing', async () => {
    expect((await open('S1', BUY)).status).toBe(404); expect((await open('BLD', OWN)).status).toBe(404); expect((await open('OWNER', BUY)).status).toBe(404);
    const t = (await search('S1', '9826377889')).results[0].ticket;
    expect((await open('S1', BUY, t)).status).toBe(200);
    expect((await open('S2', BUY, t)).status).toBe(404);                                          // a pass belongs to the person it was given to
    expect((await open('S1', BUY, t.replace(/.$/, (c: string) => (c === 'A' ? 'B' : 'A')))).status).toBe(404);
    expect((await open('S1', BUY, '1.abc')).status).toBe(404); expect((await open('S1', BUY, `${Date.now() - 1000}.${t.split('.')[1]}`)).status).toBe(404);
    const t3 = (await search('S3', '9826377889')).results[0].ticket;
    expect((await open('S3', OWN, t3)).status).toBe(404);                                         // …and to the person it was for: a pass for the buyer does not open the owner
    expect((await open('ADMIN', BUY)).status).toBe(200);                                          // GENZ staff need none
    const me = await open('BUYER', BUY); expect(me.status).toBe(200);                              // his own page
  });
  it('someone who really worked with a private person can open him without a search', async () => {
    expect((await open('S1', OWN)).status).toBe(200); expect((await open('S2', OWN)).status).toBe(200);   // deal room + mandate
    expect((await open('S3', OWN)).status).toBe(404);                                              // never worked with him
  });
  it('the exact-mobile and code searches leave a line in the audit trail (the last four digits, never the whole number)', async () => {
    const a = JSON.stringify(await j(await call(jar.ADMIN, 'GET', '/api/audit-logs?limit=500&q=PROFILE_LOOKUP')));
    expect(a).toContain('PROFILE_LOOKUP'); expect(a).toContain('mobile ending 7889'); expect(a).not.toContain('9826377889');
  });
  it('a professional who switched his name search off is gone from the name search but not from his exact mobile or code', async () => {
    expect((await call(jar.S3, 'PUT', '/api/profiles/mine', { visible: false })).status).toBe(200);
    expect((await search('BLD', 'Priya Agrawal')).results.some((x: any) => x.id === B3)).toBe(false);
    const byPhone = await search('BLD', '9826177112'); expect(byPhone.results.map((x: any) => x.id)).toEqual([B3]); expect(typeof byPhone.results[0].ticket).toBe('string');
    expect((await open('BLD', B3)).status).toBe(404);                                              // by id alone: no
    expect((await open('BLD', B3, byPhone.results[0].ticket)).status).toBe(200);                   // with the pass: yes
    expect((await search('BLD', 'GZ-BRK-492003')).results.map((x: any) => x.id)).toEqual([B3]);
    expect((await call(jar.S3, 'PUT', '/api/profiles/mine', { visible: true })).status).toBe(200);
    expect((await search('BLD', 'Priya Agrawal')).results.some((x: any) => x.id === B3)).toBe(true);
  });
});

describe('profiles: keeping my own', () => {
  it('I choose what it says; bad text is refused', async () => {
    const ok = await call(jar.S1, 'PUT', '/api/profiles/mine', { about: 'I help families in Shankar Nagar buy their first home.', areas: ['Shankar Nagar', 'Telibandha'], languages: ['Hindi', 'English'], years: 9 });
    expect(ok.status).toBe(200);
    for (const bad of [{ about: 'call me 98271 22334' }, { about: 'see https://x.in' }, { about: 'x'.repeat(241) }, { areas: ['a'] }, { areas: 'Telibandha' }, { years: 80 }, { years: 2.5 }, { visible: 'no' }]) expect((await call(jar.S1, 'PUT', '/api/profiles/mine', bad)).status, JSON.stringify(bad)).toBe(400);
    const me = await j(await call(jar.S1, 'GET', '/api/profiles/mine'));
    expect(me.profile).toMatchObject({ visible: true, about: 'I help families in Shankar Nagar buy their first home.', areas: ['Shankar Nagar', 'Telibandha'], languages: ['Hindi', 'English'], years: 9 });
    const seen = await open('BLD', B1); expect(seen.card).toMatchObject({ about: 'I help families in Shankar Nagar buy their first home.', years: 9 }); expect(seen.card.areas).toEqual(['Shankar Nagar', 'Telibandha']);
  });
  it('a customer or an owner cannot hide: the text and photo are his, the lookup is what keeps brokers safe', async () => {
    expect((await call(jar.BUYER, 'PUT', '/api/profiles/mine', { visible: false, about: 'Looking for a 3 BHK in Raipur' })).status).toBe(200);
    const me = await j(await call(jar.BUYER, 'GET', '/api/profiles/mine')); expect(me.isPrivate).toBe(true); expect(me.profile.visible).toBe(true);
    expect((await search('S1', '9826377889')).results.length).toBe(1);
  });
});

describe('reviews: only after real work together, one vote each', () => {
  it('no review without proof, none of yourself, none by staff', async () => {
    const r = await rate('S3', B1, { rating: 5, tags: ['HONEST'] }); expect(r.status).toBe(403); expect((await j(r)).code).toBe('NO_PROOF');
    expect((await rate('S1', B1, { rating: 5, tags: ['HONEST'] })).status).toBe(403);
    expect((await rate('ADMIN', B1, { rating: 5, tags: ['HONEST'] })).status).toBe(403);
    expect((await rate('BUYER', B1, { rating: 5, tags: ['HONEST'] })).status).toBe(403);           // the buyer has no deal with anyone
    expect((await rate('S3', 'USR-NOBODY', { rating: 5 })).status).toBe(404);
    const o = await open('S3', B1); expect(o.review).toMatchObject({ ok: false }); expect(o.review.reason).toMatch(/worked together/); expect(o.review.hi).toMatch(/[ऀ-ॿ]/);
    expect((await open('S2', B1)).review).toMatchObject({ ok: true, group: 'BROKER' });
    expect((await open('S2', B1)).review.tags.length).toBeGreaterThan(4);
  });
  it('the text is checked on the server too', async () => {
    for (const bad of [{ rating: 0 }, { rating: 6, tags: ['HONEST'] }, { rating: 5, tags: ['PAYS_ON_TIME'] }, { rating: 5, tags: ['HONEST', 'HONEST'] }, { rating: 5, remark: 'call 9827122334' }, { rating: 5, remark: 'visit www.best.com' }, { rating: 1 }, { rating: 2, remark: 'bad' }, { rating: 5, remark: 'x'.repeat(300) }, {}])
      expect((await rate('S2', B1, bad)).status, JSON.stringify(bad)).toBe(400);
    expect((await open('BLD', B1)).total).toBe(0);
  });
  it('three people who worked with him rate him: each counts once, and "early" ends with the third', async () => {
    const a = await j(await rate('S2', B1, { rating: 5, tags: ['HONEST', 'FAIR_SPLIT'], remark: 'Closed the Shankar Nagar deal smoothly. My share came in the same week.' }));
    expect(a.success).toBe(true); expect(a.rating).toMatchObject({ count: 1, avg: 5, early: true });
    const b = await j(await rate('OWNER', B1, { rating: 4, tags: ['RESPONSIVE'], remark: '' })); expect(b.rating).toMatchObject({ count: 2, avg: 4.5, early: true });
    expect(b.review.worked.en).toBeTruthy();
    const c = await j(await rate('BLD', B1, { rating: 4, tags: ['HONEST'] })); expect(c.rating).toMatchObject({ count: 3, avg: 4.3, early: false });
    const again = await j(await rate('S2', B1, { rating: 3, tags: ['HONEST'], remark: 'On second thought it took two weeks.' }));    // an edit, not a second vote
    expect(again.rating).toMatchObject({ count: 3, avg: 3.7 }); expect(again.review.editedAt).toBeTruthy();
    const o = await open('BUYER', B1);                                                           // anyone can read it
    expect(o.total).toBe(3); expect(o.card.rating).toMatchObject({ count: 3, avg: 3.7 }); expect(o.card.rating.tags[0]).toEqual({ id: 'HONEST', n: 2 });
    const rv = o.reviews.find((x: any) => /two weeks/.test(x.remark)); expect(rv.reviewer).toMatchObject({ name: 'Amit Kumar Verma', id: B2 }); expect(rv.worked.en).toMatch(/deal room|partnership/);
    expect(o.reviews.find((x: any) => x.reviewer.id === OWN).reviewer.name).toBe('Sunil L.');    // a private person is shown as "Sunil L."
    expect(o.review).toMatchObject({ ok: false });                                                // the buyer cannot rate him
    expect(JSON.stringify(o)).not.toMatch(/evidenceIds|reports"|DEAL-2026/);                       // the proof ids stay on the server
  });
  it('the reviewer can see and change his own; the other side cannot edit it', async () => {
    const mine = await open('S2', B1); expect(mine.mine).toMatchObject({ mine: true, rating: 3, editable: true }); expect(mine.mine.editableUntil).toBeTruthy();
    expect((await call(jar.S1, 'POST', `/api/profiles/u/${B2}/review`, { rating: 1, tags: ['MISLEADING'] })).status).toBe(200);   // a different review: S1 about S2
    const feed = (await j(await call(jar.S2, 'GET', '/api/profiles/mine'))); expect(feed.reviewsIWrote.length).toBe(1); expect(feed.reviewsIWrote[0].target.id).toBe(B1); expect(feed.reviewsAboutMe.length).toBe(1);
  });
  it('the reviewed person is told, can answer once, and cannot answer someone else\'s review', async () => {
    const told = (await inbox('S1')).filter((x: any) => /rated you/.test(x.title)); expect(told.length).toBeGreaterThanOrEqual(3);
    expect(told.some((x: any) => /★/.test(x.title))).toBe(true);
    const mine = (await j(await call(jar.S1, 'GET', '/api/profiles/mine'))).reviewsAboutMe; expect(mine.length).toBe(3);
    const rv = mine.find((x: any) => x.reviewer.id === B2);
    expect((await call(jar.S2, 'POST', `/api/profiles/reviews/${rv.id}/reply`, { text: 'Not my review' })).status).toBe(404);
    expect((await call(jar.S1, 'POST', `/api/profiles/reviews/${rv.id}/reply`, { text: 'x' })).status).toBe(400);
    expect((await call(jar.S1, 'POST', `/api/profiles/reviews/${rv.id}/reply`, { text: 'Call me on 9827122334' })).status).toBe(400);
    expect((await call(jar.S1, 'POST', `/api/profiles/reviews/${rv.id}/reply`, { text: 'Thank you — the builder\'s payment came late, I paid your share on the day I got mine.' })).status).toBe(200);
    expect((await open('BUYER', B1)).reviews.find((x: any) => x.id === rv.id).reply.text).toMatch(/Thank you/);
    expect((await inbox('S2')).some((x: any) => /replied to your review/.test(x.title))).toBe(true);
  });
  it('a hostile reply or remark is shown as text, never as markup', async () => {
    const r = await rate('OWNER', B1, { rating: 4, tags: ['RESPONSIVE'], remark: '<img src=x onerror=alert(1)> fine' });
    expect(r.status).toBe(200);                                                                    // allowed as text: the screens print it escaped
    const o = await open('BLD', B1); expect(JSON.stringify(o)).toContain('<img src=x');            // the API sends the raw text; React prints it as text
  });
});

describe('reviews: reporting and GENZ moderation', () => {
  let rid = ''; let before = 0;
  it('anyone who can see a review may report it once, for a listed reason', async () => {
    const o = await open('S3', B1); const rv = o.reviews.find((x: any) => x.reviewer.id === B2); rid = rv.id; before = o.card.rating.count;
    expect((await call(jar.S3, 'POST', `/api/profiles/reviews/${rid}/report`, { reason: 'SPAM' })).status).toBe(400);
    expect((await call(jar.S3, 'POST', `/api/profiles/reviews/${rid}/report`, {})).status).toBe(400);
    expect((await call(jar.S3, 'POST', `/api/profiles/reviews/${rid}/report`, { reason: 'FAKE', note: 'I think they are friends' })).status).toBe(200);
    expect((await call(jar.S3, 'POST', `/api/profiles/reviews/${rid}/report`, { reason: 'FAKE' })).status).toBe(409);
    expect((await call(jar.S2, 'POST', `/api/profiles/reviews/${rid}/report`, { reason: 'FALSE' })).status).toBe(400);   // it is his own
    expect((await call(jar.BUYER, 'POST', `/api/profiles/reviews/${rid}/report`, { reason: 'FALSE' })).status).toBe(200);
    expect((await call(jar.S1, 'POST', `/api/profiles/reviews/${rid}/report`, { reason: 'FALSE' })).status).toBe(200);    // the reviewed person
    expect((await open('BLD', B1)).reviews.find((x: any) => x.id === rid).disputed).toBe(true);                         // everyone sees "disputed"
    expect((await call(jar.S3, 'POST', `/api/profiles/reviews/RV-NOPE/report`, { reason: 'FALSE' })).status).toBe(404);
  });
  it('a report alone changes nothing; the staff queue shows who said what', async () => {
    expect((await open('BLD', B1)).card.rating.count).toBe(before);                                // nothing hides itself — brigading cannot remove a review
    const q = await j(await call(jar.ADMIN, 'GET', '/api/profiles/admin/queue')); const row = q.reported.find((x: any) => x.id === rid);
    expect(row).toBeTruthy(); expect(row.reportsDetail.length).toBe(3); expect(row.reportsDetail.some((x: any) => x.byTarget)).toBe(true);
    expect(row.target.id).toBe(B1); expect(row.reviewer.id).toBe(B2);
  });
  it('hiding needs a reason and takes the review out of the number; both people are told', async () => {
    expect((await call(jar.ADMIN, 'POST', `/api/profiles/admin/reviews/${rid}/hide`, { reason: 'no' })).status).toBe(400);
    expect((await call(jar.S1, 'POST', `/api/profiles/admin/reviews/${rid}/hide`, { reason: 'I do not like it' })).status).toBe(403);
    expect((await call(jar.ADMIN, 'POST', `/api/profiles/admin/reviews/${rid}/hide`, { reason: 'The two were not in a real deal' })).status).toBe(200);
    const o = await open('BLD', B1); expect(o.card.rating.count).toBe(before - 1); expect(o.reviews.some((x: any) => x.id === rid)).toBe(false);
    const own = await open('S2', B1); expect(own.mine).toMatchObject({ status: 'HIDDEN', hiddenReason: 'The two were not in a real deal' });
    expect(own.review.ok).toBe(false); expect(own.review.reason).toMatch(/removed/);                   // he cannot simply write it again
    expect((await rate('S2', B1, { rating: 5, tags: ['HONEST'] })).status).toBe(403);
    expect((await call(jar.S1, 'POST', `/api/profiles/reviews/${rid}/reply`, { text: 'still thanks' })).status).toBe(409);
    expect((await inbox('S2')).some((x: any) => /removed by GENZ/.test(x.title))).toBe(true); expect((await inbox('S1')).some((x: any) => /removed by GENZ/.test(x.title))).toBe(true);
    const q = await j(await call(jar.ADMIN, 'GET', '/api/profiles/admin/queue')); expect(q.hidden.some((x: any) => x.id === rid && x.hiddenReason)).toBe(true); expect(q.reported.some((x: any) => x.id === rid)).toBe(false);
    expect(JSON.stringify(await j(await call(jar.ADMIN, 'GET', '/api/audit-logs?limit=500&q=REVIEW_HIDDEN')))).toContain('REVIEW_HIDDEN');
  });
  it('restoring puts it back; "keep it" clears the reports', async () => {
    expect((await call(jar.S1, 'POST', `/api/profiles/admin/reviews/${rid}/restore`, {})).status).toBe(403);
    expect((await call(jar.ADMIN, 'POST', `/api/profiles/admin/reviews/${rid}/restore`, {})).status).toBe(200);
    expect((await call(jar.ADMIN, 'POST', `/api/profiles/admin/reviews/${rid}/restore`, {})).status).toBe(404);
    expect((await open('BLD', B1)).card.rating.count).toBe(before);
    expect((await call(jar.ADMIN, 'POST', `/api/profiles/admin/reviews/${rid}/clear`, {})).status).toBe(200);
    const q = await j(await call(jar.ADMIN, 'GET', '/api/profiles/admin/queue')); expect(q.reported.some((x: any) => x.id === rid)).toBe(false);
    expect((await call(jar.ADMIN, 'POST', '/api/profiles/admin/reviews/RV-NOPE/hide', { reason: 'not there at all' })).status).toBe(404);
  });
});

describe('reviews: taking one back, other kinds of people, privacy', () => {
  it('a review can be withdrawn; a second withdrawal finds nothing', async () => {
    expect((await call(jar.S2, 'DELETE', `/api/profiles/u/${B1}/review`)).status).toBe(200);
    expect((await call(jar.S2, 'DELETE', `/api/profiles/u/${B1}/review`)).status).toBe(404);
    expect((await open('BLD', B1)).card.rating.count).toBe(2);
    expect((await call(jar.S3, 'DELETE', `/api/profiles/u/${B1}/review`)).status).toBe(404);
  });
  it('a broker and a builder rate each other with their own kind of tags', async () => {
    const r = await rate('S1', BLD1, { rating: 5, tags: ['PAYS_ON_TIME', 'CLEAR_TERMS'], remark: 'Terms were clear from day one.' }); expect(r.status).toBe(200);
    expect((await rate('S1', BLD1, { rating: 5, tags: ['HONEST'] })).status).toBe(400);          // a broker's tag on a builder
    const o = await open('S2', BLD1); expect(o.card).toMatchObject({ group: 'BUILDER', name: expect.stringContaining('Alok') }); expect(o.card.rating.count).toBe(1);
    expect((await open('BLD', B1)).reviews.some((x: any) => x.reviewer.id === BLD1)).toBe(true);
  });
  it('an owner is rated by the broker he gave the mandate to, and by nobody else', async () => {
    expect((await rate('S1', OWN, { rating: 5, tags: ['GENUINE_OWNER', 'CLEAR_PAPERS'], remark: 'Papers were ready on day one.' })).status).toBe(200);
    expect((await rate('S3', OWN, { rating: 1, tags: ['PRICE_CHANGED'] })).status).toBe(403);
    const o = await open('S2', OWN); expect(o.card).toMatchObject({ group: 'OWNER', name: 'Sunil L.', firm: '' }); expect(o.card.rating.count).toBe(1);
    expect(JSON.stringify(o)).not.toMatch(/Lalwani|98261 ?55667/);
  });
  it('a member\'s own data export carries both what he wrote and what was written about him', async () => {
    const x = await call(jar.S1, 'GET', '/api/privacy/export');
    if (x.status === 200) { const d = JSON.stringify(await j(x)); expect(d).toContain('reviewsAboutMe'); expect(d).toContain('reviewsIWrote'); expect(d).toContain('Terms were clear from day one.'); }
    else expect([404, 405]).toContain(x.status);
  });
});

describe('searching is rate-limited', () => {
  it('after forty searches in an hour the forty-first waits', async () => {
    let ok = 0; let wait429 = 0; let retry = '';
    for (let i = 0; i < 44; i++) { const r = await call(jar.CON, 'GET', `/api/profiles/search?q=${encodeURIComponent('Raipur')}`); if (r.status === 200) ok++; else if (r.status === 429) { wait429++; retry = r.headers.get('retry-after') || ''; } }
    expect(ok).toBeGreaterThanOrEqual(36); expect(ok).toBeLessThanOrEqual(40); expect(wait429).toBe(44 - ok); expect(wait429).toBeGreaterThanOrEqual(4);   // (the contractor made a search or two earlier)
    expect(Number(retry)).toBeGreaterThan(0);
    expect((await call(jar.LEGAL, 'GET', '/api/profiles/search?q=Raipur')).status).toBe(200);        // it is per person
  });
});
