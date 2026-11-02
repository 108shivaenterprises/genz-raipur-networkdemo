import { freePort } from './helpers/port';
/**
 * v109 — first-response clock, dormancy rescue, and a role-by-role query sweep.
 *   · slaRules: first touch ignores stage changes / system lines; clock states; median / within-target share; clamping;
 *   · rescueRules: which nudge is due, never twice, never to someone active, never after opt-out;
 *   · server: the stalled-partners queue is for the desk only; a nudge is recorded once;
 *   · every demo role can ask every list screen the app asks for without a server error, and the crossings that must stay shut stay shut.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { firstTouchAt, slaState, slaLeftMin, responseMinutes, medianMin, withinPct, clampSla, slaText, SLA_DEFAULT_MIN } from '../src/shared/slaRules';
import { nextNudge, daysSinceJoin } from '../src/shared/rescueRules';

const T0 = Date.parse('2026-11-02T10:00:00Z'); const iso = (min: number) => new Date(T0 + min * 60_000).toISOString();

describe('first-response clock', () => {
  const lead = (acts: { type: string; at: string }[] = [], o: any = {}) => ({ createdAt: iso(0), stage: 'NEW', activities: acts, ...o });
  it('a call / WhatsApp / meeting / visit / note is the first touch; a stage change or a system line is not; the earliest wins', () => {
    expect(firstTouchAt(lead([{ type: 'SYSTEM', at: iso(1) }, { type: 'STAGE_CHANGE', at: iso(2) }]))).toBeNull();
    expect(firstTouchAt(lead([{ type: 'NOTE', at: iso(40) }, { type: 'CALL', at: iso(12) }, { type: 'SYSTEM', at: iso(1) }]))).toBe(Date.parse(iso(12)));
    expect(firstTouchAt(lead([{ type: 'CALL', at: iso(-30) }]))).toBeNull();          // older than the lead itself
    expect(firstTouchAt(lead([{ type: 'CALL', at: 'garbage' }]))).toBeNull();
    expect(firstTouchAt({ createdAt: iso(0) })).toBeNull();
  });
  it('OK → DUE_SOON (last 5 min) → BREACHED; DONE once touched; no clock for booked / lost / opted-out', () => {
    const l = lead();
    expect(slaState(l, 30, T0 + 10 * 60_000)).toBe('OK');
    expect(slaState(l, 30, T0 + 26 * 60_000)).toBe('DUE_SOON');
    expect(slaState(l, 30, T0 + 30 * 60_000)).toBe('BREACHED');
    expect(slaState(lead([{ type: 'CALL', at: iso(5) }]), 30, T0 + 999 * 60_000)).toBe('DONE');
    for (const o of [{ stage: 'BOOKED' }, { stage: 'LOST' }, { optedOutAt: iso(1) }]) expect(slaState(lead([], o), 30, T0 + 999 * 60_000)).toBe('NA');
    expect(slaState({ createdAt: 'x' }, 30, T0)).toBe('NA');
    expect(slaState(l, 6, T0 + 5 * 60_000)).toBe('DUE_SOON');   // a short target: the warning window is a third of it, not a fixed five minutes
  });
  it('minutes left count down and go negative; nothing for a touched lead', () => {
    expect(slaLeftMin(lead(), 30, T0 + 10 * 60_000)).toBe(20); expect(slaLeftMin(lead(), 30, T0 + 45 * 60_000)).toBe(-15);
    expect(slaLeftMin(lead([{ type: 'CALL', at: iso(3) }]), 30, T0)).toBeNull();
  });
  it('the target is clamped to 5 min … 24 h; junk falls back to 30', () => {
    expect(clampSla(1)).toBe(5); expect(clampSla(99999)).toBe(1440); expect(clampSla('45')).toBe(45); expect(clampSla('abc')).toBe(SLA_DEFAULT_MIN); expect(clampSla(undefined)).toBe(SLA_DEFAULT_MIN); expect(clampSla(NaN)).toBe(30);
  });
  it('median first response and the share inside the target, over touched leads only', () => {
    const ls = [lead([{ type: 'CALL', at: iso(4) }]), lead([{ type: 'CALL', at: iso(10) }]), lead([{ type: 'CALL', at: iso(50) }]), lead([])];
    expect(responseMinutes(ls)).toEqual([4, 10, 50]); expect(medianMin([4, 10, 50])).toBe(10); expect(medianMin([4, 10])).toBe(7); expect(medianMin([])).toBeNull();
    expect(withinPct(ls, 30)).toBe(67); expect(withinPct([lead([])], 30)).toBeNull();
    expect(slaText(7)).toBe('7m'); expect(slaText(90)).toBe('1h 30m'); expect(slaText(120)).toBe('2h');
  });
});

describe('dormancy rescue', () => {
  const day = (d: number) => new Date(T0 - d * 86_400_000).toISOString();
  const u = (d: number, o: any = {}) => ({ verifiedAt: day(d), hasListing: false, hasClient: false, ...o });
  it('nothing in the first days; day 3 → listing nudge; day 7 → client nudge; day 14 → personal call', () => {
    expect(nextNudge(u(2), 'Ravi Verma', T0)).toBeNull();
    expect(nextNudge(u(3), 'Ravi Verma', T0)!.kind).toBe('D3_FIRST_LISTING');
    expect(nextNudge(u(7), 'Ravi Verma', T0)!.kind).toBe('D7_FIRST_CLIENT');
    expect(nextNudge(u(14), 'Ravi Verma', T0)!.kind).toBe('D14_PERSONAL_CALL');
  });
  it('the text uses the first name only, comes in both languages, carries a STOP line, and mentions no number or price', () => {
    const n = nextNudge(u(3), 'Ravi Kumar Verma', T0)!;
    expect(n.en).toContain('Ravi'); expect(n.en).not.toContain('Verma'); expect(n.hi).toContain('Ravi'); expect(n.en).toMatch(/STOP/); expect(n.hi).toMatch(/STOP/); expect(n.en).not.toMatch(/\d{6,}/);
    expect(nextNudge(u(3), '', T0)!.en).toContain('there');
  });
  it('someone who has done the thing is left alone; a broker with a listing but no client still gets the client nudge at day 7', () => {
    expect(nextNudge(u(30, { hasListing: true, hasClient: true }), 'A', T0)).toBeNull();
    expect(nextNudge(u(5, { hasListing: true }), 'A', T0)).toBeNull();
    expect(nextNudge(u(8, { hasListing: true }), 'A', T0)!.kind).toBe('D7_FIRST_CLIENT');
    expect(nextNudge(u(40, { hasClient: true }), 'A', T0)).toBeNull();
  });
  it('a nudge already offered is never offered again — only a later one is', () => {
    expect(nextNudge(u(4, { nudgedKind: 'D3_FIRST_LISTING' }), 'A', T0)).toBeNull();
    expect(nextNudge(u(8, { nudgedKind: 'D3_FIRST_LISTING' }), 'A', T0)!.kind).toBe('D7_FIRST_CLIENT');
    expect(nextNudge(u(20, { nudgedKind: 'D14_PERSONAL_CALL' }), 'A', T0)).toBeNull();
  });
  it('opt-out stops everything; a missing / broken date gives nothing', () => {
    expect(nextNudge(u(20, { optedOut: true }), 'A', T0)).toBeNull();
    expect(nextNudge({ hasListing: false, hasClient: false }, 'A', T0)).toBeNull();
    expect(daysSinceJoin({ createdAt: day(5), hasListing: false, hasClient: false }, T0)).toBe(5);
    expect(daysSinceJoin({ verifiedAt: 'zzz', hasListing: false, hasClient: false }, T0)).toBeNull();
  });
});

// ───────────────────────── server ─────────────────────────
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function login(who: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: who, password: cfg.demoPassword }) });
  return { status: r.status, cookie: r.status === 200 ? r.headers.get('set-cookie')!.split(';')[0] : '' };
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v109-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' },
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  expect(cfg).toBeTruthy();
}, 120_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id).email;

describe('the stalled-partners queue', () => {
  it('only the growth desk sees it; a broker, builder or buyer is refused', async () => {
    const sup = await login(cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').email); jar.SUP = sup.cookie;
    expect((await call(undefined, 'GET', '/api/growth/stalled')).status).toBe(401);
    for (const id of ['USR-BRK-001', 'USR-BUILDER-001', 'USR-BUYER-001']) { const l = await login(acct(id)); expect((await call(l.cookie, 'GET', '/api/growth/stalled')).status, id).toBe(403); }
    const r = await call(jar.SUP, 'GET', '/api/growth/stalled'); expect(r.status).toBe(200); expect(Array.isArray((await r.json()).rows)).toBe(true);
  });
  it('rows carry first-name-only texts; marking one nudged takes it off the list and a wrong kind or user is refused', async () => {
    const rows = (await (await call(jar.SUP, 'GET', '/api/growth/stalled')).json()).rows as any[];
    for (const r of rows) { expect(['D3_FIRST_LISTING', 'D7_FIRST_CLIENT', 'D14_PERSONAL_CALL']).toContain(r.kind); expect(r.en).toMatch(/STOP/); }
    expect((await call(jar.SUP, 'POST', '/api/growth/stalled/USR-NOPE/nudged', { kind: 'D3_FIRST_LISTING' })).status).toBe(404);
    expect((await call(jar.SUP, 'POST', '/api/growth/stalled/USR-BRK-001/nudged', { kind: 'BOGUS' })).status).toBe(404);
    expect((await call(jar.SUP, 'POST', '/api/growth/stalled/USR-BUYER-001/nudged', { kind: 'D3_FIRST_LISTING' })).status).toBe(404);   // brokers only
    const b = await login(acct('USR-BRK-001')); expect((await call(b.cookie, 'POST', '/api/growth/stalled/USR-BRK-002/nudged', { kind: 'D3_FIRST_LISTING' })).status).toBe(403);
    if (rows.length) {
      const one = rows[0]; expect((await call(jar.SUP, 'POST', `/api/growth/stalled/${one.userId}/nudged`, { kind: one.kind })).status).toBe(200);
      const after = (await (await call(jar.SUP, 'GET', '/api/growth/stalled')).json()).rows as any[];
      expect(after.find(x => x.userId === one.userId && x.kind === one.kind)).toBeUndefined();
    }
  });
});

describe('every role can ask every list screen without a server error', () => {
  // the list screens the app itself asks for (static GET paths of the front-end client)
  const src = readFileSync(path.resolve(import.meta.dirname, '../src/lib/api.ts'), 'utf8').split('\n');
  const paths = [...new Set(src.filter(l => !/method:/.test(l)).flatMap(l => [...l.matchAll(/request<[^(]*\(\s*['`](\/api\/[^'`]*)['`]/g)].map(m => m[1])).filter(p => !p.includes('${') && !/logout|export|download|erase|delete/.test(p)))];
  const roles = ['USR-BRK-001', 'USR-BRK-004', 'USR-OWNER-001', 'USR-BUYER-001', 'USR-CONTRACTOR-001', 'USR-BUILDER-001', 'USR-LEGAL-001', 'USR-CON-001', 'USR-ADMIN-2', 'USR-TEAM-001', 'USR-TEAM-011'];
  it('the sweep covers a real number of screens', () => { expect(paths.length).toBeGreaterThan(100); });
  for (const id of roles) {
    it(`${id}: no server error on any of the app's list screens`, async () => {
      const l = await login(acct(id)); expect(l.status).toBe(200);
      const bad: string[] = [];
      for (const p of paths) { const r = await call(l.cookie, 'GET', p); if (r.status >= 500) bad.push(`${p} → ${r.status}`); }
      expect(bad).toEqual([]);
    }, 60_000);
  }
  it('crossings that must stay shut: a buyer has no CRM, a connector no inventory or CRM, a broker no growth desk or admin pages, builder-only pages stay builder-only', async () => {
    const buyer = await login(acct('USR-BUYER-001')); const con = await login(acct('USR-CON-001')); const brk = await login(acct('USR-BRK-001')); const own = await login(acct('USR-OWNER-001'));
    for (const p of ['/api/crm/overview', '/api/crm/bookings', '/api/inventory/projects', '/api/crm/money/collectables']) expect([401, 403, 404], `buyer ${p}`).toContain((await call(buyer.cookie, 'GET', p)).status);
    for (const p of ['/api/crm/overview', '/api/inventory/projects']) expect([401, 403, 404], `connector ${p}`).toContain((await call(con.cookie, 'GET', p)).status);
    for (const p of ['/api/growth/queue', '/api/growth/cities', '/api/network/admin/overview', '/api/pcontrol/builder/projects']) expect([401, 403, 404], `broker ${p}`).toContain((await call(brk.cookie, 'GET', p)).status);
    // the builder's verification queue answers a broker with an empty list (it is filtered by who may verify), never with someone's leads
    const q = await call(brk.cookie, 'GET', '/api/pcontrol/builder/verification-queue'); expect(q.status === 200 ? (await q.json()).leads : []).toEqual([]);
    for (const p of ['/api/crm/overview', '/api/inventory/projects', '/api/growth/queue']) expect([401, 403, 404], `owner ${p}`).toContain((await call(own.cookie, 'GET', p)).status);
  });
});
