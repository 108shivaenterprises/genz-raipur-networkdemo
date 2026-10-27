import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as H from '../src/shared/hrRules.js';
import { eraseHr } from '../server/hr.js';

/** v76 — HR on a real server: who may use which tool, a member sees only himself, a statement stays hidden until published (and never shows brokerage),
 *  an approved leave puts him on leave and brings him back, selfies are files, privacy. */
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 7900 + Math.floor(Math.random() * 90);
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
/** the smallest thing the server accepts as a JPEG: the magic bytes + padding */
const JPEG = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]).toString('base64');
const GPS = { lat: 21.2514, lng: 81.6296, accuracy: 20 };
const today = () => H.istToday();
const DEF = { ...H.DEFAULT_HR_SETTINGS };
const workDay = (d: string, step: number) => { while (!H.isWorkingDay(DEF, d)) d = H.addDays(d, step); return d; };

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v76-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: 'a1'.repeat(32), SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  const ids: Record<string, string> = {
    BRK: 'USR-BRK-002', BRK_OTHER: 'USR-BRK-001', BUILDER: 'USR-BUILDER-002', CON: 'USR-CONTRACTOR-001',
    M_BRK: 'USR-TEAM-003', M_BRK2: 'USR-TEAM-004', M_BRK_OTHER: 'USR-TEAM-001', M_BUILDER: 'USR-TEAM-007', M_CON: 'USR-TEAM-008',
    OWNER: 'USR-OWNER-001', BUYER: 'USR-BUYER-001', LEGAL: 'USR-LEGAL-001', ADMIN: 'USR-ADMIN-1',
  };
  for (const [k, id] of Object.entries(ids)) jar[k] = await login(id);
}, 90000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

describe('who may use HR', () => {
  it('only a broker, a builder or a contractor has the employer tools — nobody else gets in', async () => {
    for (const who of ['BRK', 'BUILDER', 'CON']) expect((await call(jar[who], 'GET', '/api/hr/overview')).status, who).toBe(200);
    for (const who of ['OWNER', 'BUYER', 'LEGAL', 'ADMIN', 'M_BRK']) expect((await call(jar[who], 'GET', '/api/hr/overview')).status, who).toBe(403);
    expect((await call(undefined, 'GET', '/api/hr/overview')).status).toBe(401);
  });
  it('the tools differ by employer: a contractor has no targets and no pay statements', async () => {
    const f = async (who: string) => (await j(await call(jar[who], 'GET', '/api/hr/overview'))).features as string[];
    expect(await f('BRK')).toEqual(H.HR_FEATURES); expect(await f('BUILDER')).toEqual(H.HR_FEATURES);
    expect(await f('CON')).not.toContain('TARGETS'); expect(await f('CON')).not.toContain('STATEMENT');
    expect((await call(jar.CON, 'GET', '/api/hr/targets')).status).toBe(403);
    expect((await call(jar.CON, 'GET', '/api/hr/statements')).status).toBe(403);
    expect((await call(jar.CON, 'POST', '/api/hr/statements/build', { month: today().slice(0, 7) })).status).toBe(403);
    const me = await j(await call(jar.M_CON, 'GET', '/api/hr/me'));
    expect(me.features).not.toContain('TARGETS'); expect(me.target).toBeUndefined();
    expect((await call(jar.M_CON, 'GET', '/api/hr/me/statements')).status).toBe(403);
    expect((await call(jar.M_BRK, 'GET', '/api/hr/me/statements')).status).toBe(200);
  });
  it('a member uses only the "me" tools, an employer is not a member', async () => {
    expect((await call(jar.M_BRK, 'GET', '/api/hr/settings')).status).toBe(403);
    expect((await call(jar.M_BRK, 'PUT', '/api/hr/targets/USR-TEAM-003', { calls: 10 })).status).toBe(403);
    expect((await call(jar.M_BRK, 'POST', '/api/hr/leaves/x/decide', { decision: 'APPROVE' })).status).toBe(403);
    expect((await call(jar.BRK, 'GET', '/api/hr/me')).status).toBe(403);
    expect((await call(jar.BRK, 'POST', '/api/hr/me/punch', { kind: 'in', ...GPS, selfie: JPEG })).status).toBe(403);
    for (const who of ['OWNER', 'BUYER', 'LEGAL', 'ADMIN']) expect((await call(jar[who], 'GET', '/api/hr/me')).status, who).toBe(403);
  });
  it('an employer cannot touch another employer\'s people', async () => {
    expect((await call(jar.BRK, 'PUT', '/api/hr/targets/USR-TEAM-001', { calls: 10 })).status).toBe(404);
    expect((await call(jar.BRK, 'POST', '/api/hr/leaves', { userId: 'USR-TEAM-001', from: today(), to: today(), reason: 'x y z' })).status).toBe(404);
    expect((await call(jar.BRK, 'POST', '/api/hr/assets', { userId: 'USR-TEAM-007', kind: 'PHONE', label: 'Redmi' })).status).toBe(404);
    expect((await call(jar.BRK, 'POST', '/api/hr/attendance/mark', { userId: 'USR-TEAM-008', status: 'PRESENT' })).status).toBe(404);
  });
});

describe('settings', () => {
  it('are validated and kept', async () => {
    expect((await call(jar.BRK, 'PUT', '/api/hr/settings', { workStart: '99:99' })).status).toBe(400);
    expect((await call(jar.BRK, 'PUT', '/api/hr/settings', { holidays: [{ date: '2026-02-30', label: 'x' }] })).status).toBe(400);
    const r = await call(jar.BRK, 'PUT', '/api/hr/settings', { leaveAllowance: 6, holidays: [{ date: '2031-11-08', label: 'Diwali' }] });
    expect(r.status).toBe(200);
    const s = (await j(await call(jar.BRK, 'GET', '/api/hr/settings'))).settings;
    expect(s.leaveAllowance).toBe(6); expect(s.holidays).toEqual([{ date: '2031-11-08', label: 'Diwali' }]); expect(s.workStart).toBe('10:00');
    // another employer is unaffected
    expect((await j(await call(jar.BUILDER, 'GET', '/api/hr/settings'))).settings.leaveAllowance).toBe(12);
    // a member sees his employer's hours and holidays (not other settings)
    const me = await j(await call(jar.M_BRK, 'GET', '/api/hr/me'));
    expect(me.settings.leaveAllowance).toBe(6); expect(me.upcoming.length).toBeGreaterThan(0);
  });
});

describe('attendance', () => {
  it('a punch-in needs GPS in India and a selfie; one in a day; out needs an in', async () => {
    const p = (kind: string, extra: object = {}) => call(jar.M_BRK, 'POST', '/api/hr/me/punch', { kind, ...GPS, ...extra });
    expect((await p('nope')).status).toBe(400);
    expect((await p('in', { lat: 51.5, lng: -0.12, selfie: JPEG })).status).toBe(400);   // not India
    expect((await p('in')).status).toBe(400);                                              // no selfie
    expect((await p('in', { selfie: 'data:image/jpeg;base64,AAAA' })).status).toBe(400);   // too small to be a photo
    expect((await p('in', { selfie: 'data:image/jpeg;base64,' + Buffer.alloc(300, 1).toString('base64') })).status).toBe(400); // not a JPEG
    expect((await p('out')).status).toBe(409);                                             // nothing to punch out of
    const r = await p('in', { selfie: JPEG }); expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
    const b = await j(r); expect(['IN', 'LATE']).toContain(b.state); expect(b.record.date).toBe(today()); expect(b.record.hasSelfie).toBe(true);
    expect(JSON.stringify(b)).not.toMatch(/"(lat|lng|inLat|inLng|outLat|outLng|accuracy|inAcc)"/);   // GPS never goes back to the member
    expect((await p('in', { selfie: JPEG })).status).toBe(409);                            // already in
    const o = await p('out'); expect(o.status).toBe(200); expect((await j(o)).state).toBe('OUT');
  });
  it('the employer sees the board, the GPS point and the selfie; nobody else does', async () => {
    const ov = await j(await call(jar.BRK, 'GET', '/api/hr/overview'));
    const row = ov.board.find((x: any) => x.id === 'USR-TEAM-003'); expect(['IN', 'LATE', 'OUT']).toContain(row.state); expect(row.state).toBe('OUT');
    expect(ov.counts.in + ov.counts.late).toBeGreaterThanOrEqual(1);
    const day = await j(await call(jar.BRK, 'GET', '/api/hr/attendance/day'));
    const d = day.rows.find((x: any) => x.id === 'USR-TEAM-003'); expect(d.lat).toBeCloseTo(GPS.lat, 3); expect(d.hasSelfie).toBe(true);
    const sf = await call(jar.BRK, 'GET', `/api/hr/attendance/${d.attId}/selfie`); expect(sf.status).toBe(200);
    expect((await j(sf)).selfie).toMatch(/^data:image\/jpeg;base64,/);
    // a rival broker (and the member's own screen) cannot fetch it
    expect((await call(jar.BRK_OTHER, 'GET', `/api/hr/attendance/${d.attId}/selfie`)).status).toBe(404);
    expect((await call(jar.M_BRK, 'GET', `/api/hr/attendance/${d.attId}/selfie`)).status).toBe(403);
    expect((await j(await call(jar.BRK_OTHER, 'GET', '/api/hr/attendance/day'))).rows.some((x: any) => x.id === 'USR-TEAM-003')).toBe(false);
    // the month grid has a letter per day
    const g = await j(await call(jar.BRK, 'GET', '/api/hr/attendance'));
    const gr = g.rows.find((x: any) => x.id === 'USR-TEAM-003'); expect(gr.codes.length).toBe(g.days);
    const idx = Number(today().slice(8)) - 1; expect(['P', 'L']).toContain(gr.codes[idx]);
  });
  it('a day marked by hand shows in the grid; clearing removes it; old or future days are refused', async () => {
    const t = today(); const idx = Number(t.slice(8)) - 1;
    expect((await call(jar.BRK, 'POST', '/api/hr/attendance/mark', { userId: 'USR-TEAM-004', date: t, status: 'MAYBE' })).status).toBe(400);
    expect((await call(jar.BRK, 'POST', '/api/hr/attendance/mark', { userId: 'USR-TEAM-004', date: H.addDays(t, 1), status: 'PRESENT' })).status).toBe(400);
    expect((await call(jar.BRK, 'POST', '/api/hr/attendance/mark', { userId: 'USR-TEAM-004', date: H.addDays(t, -40), status: 'PRESENT' })).status).toBe(400);
    expect((await call(jar.BRK, 'POST', '/api/hr/attendance/mark', { userId: 'USR-TEAM-004', date: t, status: 'HALF', note: 'came at noon' })).status).toBe(200);
    let g = await j(await call(jar.BRK, 'GET', '/api/hr/attendance'));
    expect(g.rows.find((x: any) => x.id === 'USR-TEAM-004').codes[idx]).toBe('H');
    expect((await call(jar.BRK, 'POST', '/api/hr/attendance/mark', { userId: 'USR-TEAM-004', date: t, status: 'CLEAR' })).status).toBe(200);
    g = await j(await call(jar.BRK, 'GET', '/api/hr/attendance'));
    expect(g.rows.find((x: any) => x.id === 'USR-TEAM-004').codes[idx]).not.toBe('H');
  });
  it('a contractor\'s site supervisor marks the day too (attendance is part of every employer\'s tools)', async () => {
    const r = await call(jar.M_CON, 'POST', '/api/hr/me/punch', { kind: 'in', ...GPS, selfie: JPEG });
    expect(r.status).toBe(200);
  });
  it('an employer can switch the selfie off', async () => {
    expect((await call(jar.BUILDER, 'PUT', '/api/hr/settings', { selfie: false })).status).toBe(200);
    const r = await call(jar.M_BUILDER, 'POST', '/api/hr/me/punch', { kind: 'in', ...GPS });
    expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
    expect((await j(r)).record.hasSelfie).toBe(false);
  });
});

describe('leave', () => {
  const ask = (c: string, body: object) => call(c, 'POST', '/api/hr/me/leaves', body);
  it('a request is validated, balance-checked and waits for the employer', async () => {
    const t = today();
    expect((await ask(jar.M_BRK2, { from: t, to: t })).status).toBe(400);                                   // no reason
    expect((await ask(jar.M_BRK2, { from: H.addDays(t, -30), to: H.addDays(t, -29), reason: 'old one' })).status).toBe(400);
    expect((await ask(jar.M_BRK2, { from: t, to: H.addDays(t, -1), reason: 'wrong order' })).status).toBe(400);
    // the allowance is 6 (set above): 7 working days of paid leave do not fit
    const from = workDay(H.addDays(t, 20), 1); let to = from; let n = 1; while (n < 7) { to = workDay(H.addDays(to, 1), 1); n++; }
    const tooMany = await ask(jar.M_BRK2, { from, to, reason: 'long trip' }); expect(tooMany.status).toBe(400); expect((await j(tooMany)).error).toMatch(/paid leave/);
    const unpaid = await ask(jar.M_BRK2, { from, to, type: 'UNPAID', reason: 'long trip' }); expect(unpaid.status).toBe(200);
    expect((await ask(jar.M_BRK2, { from, to: from, reason: 'same days again' })).status).toBe(400);        // overlaps his pending request
    const ov = await j(await call(jar.BRK, 'GET', '/api/hr/overview')); expect(ov.pending.leaves).toBeGreaterThanOrEqual(1);
    // the other broker sees none of it
    expect((await j(await call(jar.BRK_OTHER, 'GET', '/api/hr/leaves'))).leaves.length).toBe(0);
    const id = (await j(unpaid)).leave.id;
    expect((await call(jar.BRK, 'POST', `/api/hr/leaves/${id}/decide`, { decision: 'REJECT' })).status).toBe(400);               // a rejection needs a reason
    expect((await call(jar.BRK, 'POST', `/api/hr/leaves/${id}/decide`, { decision: 'REJECT', note: 'busy week' })).status).toBe(200);
    expect((await call(jar.BRK, 'POST', `/api/hr/leaves/${id}/decide`, { decision: 'APPROVE' })).status).toBe(409);               // already decided
    const mine = await j(await call(jar.M_BRK2, 'GET', '/api/hr/me/leaves'));
    expect(mine.leaves.find((l: any) => l.id === id)).toMatchObject({ status: 'REJECTED', decidedNote: 'busy week' });
  });
  it('an approved leave that covers today puts him on leave; cancelling brings him back', async () => {
    const t = today();
    const from = workDay(t, -1), to = workDay(t, 1);
    const r = await ask(jar.M_BRK2, { from, to, reason: 'family function' }); expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
    const id = (await j(r)).leave.id;
    const policy = async () => (await j(await call(jar.BRK, 'GET', '/api/pcontrol/team/control'))).members.find((m: any) => m.id === 'USR-TEAM-004').policy;
    expect((await policy()).onLeave).toBe(false);
    const ok = await call(jar.BRK, 'POST', `/api/hr/leaves/${id}/decide`, { decision: 'APPROVE' }); expect(ok.status, JSON.stringify(await ok.clone().json())).toBe(200);
    const p = await policy(); expect(p.onLeave).toBe(true); expect(p.onLeaveBy).toBe('LEAVE');
    // he cannot punch in on an approved leave
    expect((await call(jar.M_BRK2, 'POST', '/api/hr/me/punch', { kind: 'in', ...GPS, selfie: JPEG })).status).toBe(409);
    const me = await j(await call(jar.M_BRK2, 'GET', '/api/hr/me')); expect(me.state).toBe('ON_LEAVE');
    const ov = await j(await call(jar.BRK, 'GET', '/api/hr/overview')); expect(ov.board.find((x: any) => x.id === 'USR-TEAM-004').state).toBe('ON_LEAVE');
    // he withdraws it
    expect((await call(jar.M_BRK2, 'POST', `/api/hr/me/leaves/${id}/cancel`)).status).toBe(200);
    expect((await policy()).onLeave).toBe(false);
    expect((await call(jar.M_BRK2, 'POST', `/api/hr/me/leaves/${id}/cancel`)).status).toBe(409);
  });
  it('an employer-entered leave is approved at once; the employer\'s own on-leave switch is not undone by the leave', async () => {
    const t = today(); const from = workDay(t, -1), to = workDay(t, 1);
    const policy = async () => (await j(await call(jar.BRK, 'GET', '/api/pcontrol/team/control'))).members.find((m: any) => m.id === 'USR-TEAM-004').policy;
    const r = await call(jar.BRK, 'POST', '/api/hr/leaves', { userId: 'USR-TEAM-004', from, to, type: 'UNPAID', reason: 'phone call' });
    expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
    const granted = await j(r); expect(granted.leave.status).toBe('APPROVED');
    expect((await policy()).onLeave).toBe(true);
    // the employer switches him back by hand — the sweep must not put him on leave again
    expect((await call(jar.BRK, 'PUT', '/api/pcontrol/team/USR-TEAM-004/policy', { onLeave: false })).status).toBe(200);
    const after = await policy(); expect(after.onLeave).toBe(false); expect(after.onLeaveBy).toBeUndefined();
    await call(jar.BRK, 'GET', '/api/hr/overview');
    expect((await policy()).onLeave).toBe(false);
    // the employer cancels the leave
    expect((await call(jar.BRK, 'POST', `/api/hr/leaves/${granted.leave.id}/cancel`)).status).toBe(200);
  });
});

describe('targets and statements', () => {
  const month = today().slice(0, 7);
  it('a target is set by the employer and the member sees his own progress', async () => {
    expect((await call(jar.BRK, 'PUT', '/api/hr/targets/USR-TEAM-003', { calls: 0, visits: 0, bookings: 0 })).status).toBe(400);
    expect((await call(jar.BRK, 'PUT', '/api/hr/targets/USR-TEAM-003', {})).status).toBe(400);
    expect((await call(jar.BRK, 'PUT', '/api/hr/targets/USR-TEAM-003', { calls: 120, visits: 12, bookings: 1, fixedPay: 18000 })).status).toBe(200);
    const t = await j(await call(jar.BRK, 'GET', '/api/hr/targets'));
    const row = t.rows.find((x: any) => x.id === 'USR-TEAM-003');
    expect(row.target).toEqual({ calls: 120, visits: 12, bookings: 1 }); expect(row.fixedPay).toBe(18000); expect(['AHEAD', 'ON_TRACK', 'BEHIND']).toContain(row.progress.pace);
    expect(t.rows.find((x: any) => x.id === 'USR-TEAM-004').target).toBeNull();
    const me = await j(await call(jar.M_BRK, 'GET', '/api/hr/me'));
    expect(me.target.rows.map((r: any) => r.metric)).toEqual(['calls', 'visits', 'bookings']);
    expect(JSON.stringify(me)).not.toMatch(/fixedPay|18000/);                       // his pay is not on his target card
    // a builder's target does not leak across employers
    expect((await j(await call(jar.BUILDER, 'GET', '/api/hr/targets'))).rows.every((x: any) => x.target === null)).toBe(true);
  });
  it('a statement stays hidden until published, never shows brokerage, locks when published', async () => {
    expect((await call(jar.BRK, 'POST', '/api/hr/statements/build', { month: '2099-01' })).status).toBe(400);
    expect((await call(jar.BRK, 'POST', '/api/hr/statements/build', { month: 'soon' })).status).toBe(400);
    const b = await call(jar.BRK, 'POST', '/api/hr/statements/build', { month }); expect(b.status).toBe(200); expect((await j(b)).built).toBeGreaterThanOrEqual(2);
    const list = await j(await call(jar.BRK, 'GET', `/api/hr/statements?month=${month}`));
    const st = list.statements.find((x: any) => x.userId === 'USR-TEAM-003'); expect(st.fixed).toBe(18000); expect(st.published).toBe(false);
    // the member sees nothing yet
    expect((await j(await call(jar.M_BRK, 'GET', '/api/hr/me/statements'))).statements).toEqual([]);
    expect((await call(jar.BRK, 'PUT', `/api/hr/statements/${st.id}`, { adjustments: [{ label: 'x', amount: 5 }] })).status).toBe(400);
    const e = await call(jar.BRK, 'PUT', `/api/hr/statements/${st.id}`, { fixed: 20000, incentive: 2500, adjustments: [{ label: 'Petrol refund', amount: 1500 }, { label: 'Late fine', amount: -200 }] });
    expect(e.status).toBe(200); expect((await j(e)).statement.net).toBe(23800);
    expect((await call(jar.BRK, 'POST', `/api/hr/statements/${st.id}/paid`, {})).status).toBe(409);        // publish first
    expect((await call(jar.BRK, 'POST', `/api/hr/statements/${st.id}/publish`)).status).toBe(200);
    const seen = await j(await call(jar.M_BRK, 'GET', '/api/hr/me/statements'));
    expect(seen.statements.length).toBe(1);
    expect(seen.statements[0]).toMatchObject({ month, fixed: 20000, incentive: 2500, net: 23800 });
    expect(JSON.stringify(seen)).not.toMatch(/brokerage|incentivePct|userId|absentDays|suggest/i);       // no brokerage, no employer-only fields
    // a colleague sees none of it, and neither does the other broker's member
    expect((await j(await call(jar.M_BRK_OTHER, 'GET', '/api/hr/me/statements'))).statements).toEqual([]);
    // a published statement is locked and survives a rebuild
    expect((await call(jar.BRK, 'PUT', `/api/hr/statements/${st.id}`, { fixed: 1 })).status).toBe(409);
    const again = await j(await call(jar.BRK, 'POST', '/api/hr/statements/build', { month })); expect(again.kept).toBeGreaterThanOrEqual(1);
    expect((await j(await call(jar.M_BRK, 'GET', '/api/hr/me/statements'))).statements[0].net).toBe(23800);
    expect((await call(jar.BRK, 'DELETE', `/api/hr/statements/${st.id}`)).status).toBe(409);
    const paid = await call(jar.BRK, 'POST', `/api/hr/statements/${st.id}/paid`, {}); expect(paid.status).toBe(200);
    expect((await j(await call(jar.M_BRK, 'GET', '/api/hr/me/statements'))).statements[0].paidAt).toBeTruthy();
    // taken back: hidden again
    expect((await call(jar.BRK, 'POST', `/api/hr/statements/${st.id}/unpublish`)).status).toBe(200);
    expect((await j(await call(jar.M_BRK, 'GET', '/api/hr/me/statements'))).statements).toEqual([]);
    // another employer cannot open it
    expect((await call(jar.BRK_OTHER, 'POST', `/api/hr/statements/${st.id}/publish`)).status).toBe(404);
  });
});

describe('claims', () => {
  const file = (c: string, body: object) => call(c, 'POST', '/api/hr/me/claims', body);
  it('a member files, the employer approves and marks paid, the member follows it', async () => {
    const t = today();
    expect((await file(jar.M_BRK, { kind: 'PETROL', amount: 0, note: 'site visits' })).status).toBe(400);
    expect((await file(jar.M_BRK, { kind: 'PETROL', amount: 450, note: 'x' })).status).toBe(400);
    expect((await file(jar.M_BRK, { kind: 'PETROL', amount: 450, note: 'site visits', date: H.addDays(t, 2) })).status).toBe(400);
    const r = await file(jar.M_BRK, { kind: 'PETROL', amount: 450, note: 'site visits Naya Raipur' }); expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
    expect((await file(jar.M_BRK, { kind: 'PETROL', amount: 450, note: 'site visits Naya Raipur' })).status).toBe(409);                  // the same claim twice
    const id = (await j(r)).claim.id;
    const ov = await j(await call(jar.BRK, 'GET', '/api/hr/overview')); expect(ov.pending.claims).toBeGreaterThanOrEqual(1);
    expect((await j(await call(jar.BRK_OTHER, 'GET', '/api/hr/claims'))).claims.length).toBe(0);
    expect((await call(jar.BRK, 'POST', `/api/hr/claims/${id}/paid`, {})).status).toBe(409);                                              // not approved yet
    expect((await call(jar.BRK, 'POST', `/api/hr/claims/${id}/decide`, { decision: 'REJECT' })).status).toBe(400);
    expect((await call(jar.BRK, 'POST', `/api/hr/claims/${id}/decide`, { decision: 'APPROVE' })).status).toBe(200);
    expect((await j(await call(jar.BRK, 'GET', '/api/hr/claims'))).totals.toPay).toBe(450);
    expect((await call(jar.BRK, 'POST', `/api/hr/claims/${id}/paid`, {})).status).toBe(200);
    expect((await j(await call(jar.M_BRK, 'GET', '/api/hr/me/claims'))).claims.find((c: any) => c.id === id).status).toBe('PAID');
    expect((await call(jar.M_BRK, 'POST', `/api/hr/me/claims/${id}/cancel`)).status).toBe(409);                                           // paid ones stay
    // a colleague cannot withdraw it either
    expect((await call(jar.M_BRK2, 'POST', `/api/hr/me/claims/${id}/cancel`)).status).toBe(404);
  });
  it('a contractor\'s people claim too; a withdrawn claim disappears', async () => {
    const r = await file(jar.M_CON, { kind: 'SITE', amount: 1200, note: 'cement bags for the shuttering' }); expect(r.status).toBe(200);
    const id = (await j(r)).claim.id;
    expect((await j(await call(jar.CON, 'GET', '/api/hr/claims'))).claims.some((c: any) => c.id === id)).toBe(true);
    expect((await call(jar.M_CON, 'POST', `/api/hr/me/claims/${id}/cancel`)).status).toBe(200);
    expect((await j(await call(jar.CON, 'GET', '/api/hr/claims'))).claims.some((c: any) => c.id === id)).toBe(false);
  });
});

describe('assets', () => {
  it('handed over, confirmed by the member, returned', async () => {
    expect((await call(jar.BRK, 'POST', '/api/hr/assets', { userId: 'USR-TEAM-003', kind: 'TOYS', label: 'Redmi Note 12' })).status).toBe(400);
    expect((await call(jar.BRK, 'POST', '/api/hr/assets', { userId: 'USR-TEAM-003', kind: 'PHONE', label: 'R' })).status).toBe(400);
    expect((await call(jar.BRK, 'POST', '/api/hr/assets', { userId: 'USR-TEAM-003', kind: 'PHONE', label: 'Redmi Note 12', givenOn: H.addDays(today(), 3) })).status).toBe(400);
    const r = await call(jar.BRK, 'POST', '/api/hr/assets', { userId: 'USR-TEAM-003', kind: 'PHONE', label: 'Redmi Note 12', serial: 'IMEI 8650' }); expect(r.status).toBe(200);
    const id = (await j(r)).asset.id;
    expect((await j(await call(jar.M_BRK, 'GET', '/api/hr/me'))).pending.assetsToConfirm).toBe(1);
    expect((await j(await call(jar.M_BRK2, 'GET', '/api/hr/me/assets'))).assets).toEqual([]);                                // a colleague sees nothing
    expect((await call(jar.M_BRK2, 'POST', `/api/hr/me/assets/${id}/ack`)).status).toBe(404);
    expect((await call(jar.M_BRK, 'POST', `/api/hr/me/assets/${id}/ack`)).status).toBe(200);
    expect((await call(jar.BRK, 'DELETE', `/api/hr/assets/${id}`)).status).toBe(409);                                         // confirmed: mark returned instead
    const ov = await j(await call(jar.BRK, 'GET', '/api/hr/overview')); expect(ov.board.find((x: any) => x.id === 'USR-TEAM-003').assetsOut).toBe(1);
    expect((await call(jar.BRK, 'PUT', `/api/hr/assets/${id}`, { returned: true })).status).toBe(200);
    expect((await j(await call(jar.BRK, 'GET', '/api/hr/overview'))).board.find((x: any) => x.id === 'USR-TEAM-003').assetsOut).toBe(0);
    expect((await call(jar.M_BRK, 'POST', `/api/hr/me/assets/${id}/ack`)).status).toBe(409);
  });
  it('a contractor hands out keys and tools', async () => {
    const r = await call(jar.CON, 'POST', '/api/hr/assets', { userId: 'USR-TEAM-008', kind: 'KEYS', label: 'Site store keys' }); expect(r.status).toBe(200);
  });
});

describe('privacy', () => {
  it('a member\'s own download has his HR rows without GPS or employer-only notes', async () => {
    const x = await j(await call(jar.M_BRK, 'GET', '/api/privacy/export'));
    expect(x.hr.attendance.length).toBeGreaterThanOrEqual(1);
    expect(x.hr.claims.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(x.hr)).not.toMatch(/inLat|inLng|outLat|selfie/i);
  });
  it('erasing a member anonymises his rows; erasing an employer removes the HR record', () => {
    const s: any = {
      hrAttendance: [{ id: 'A1', employerId: 'E1', userId: 'M1', userName: 'Divya', date: '2026-03-02', inLat: 21.2, inLng: 81.6, inAcc: 5, inSelfie: true, note: 'late bus' }, { id: 'A2', employerId: 'E2', userId: 'M2', userName: 'Other', date: '2026-03-02' }],
      hrSettings: [{ employerId: 'E1' }, { employerId: 'E2' }],
      hrLeaves: [{ id: 'L1', employerId: 'E1', userId: 'M1', userName: 'Divya', reason: 'my mother is unwell', decidedNote: 'ok' }],
      hrTargets: [{ employerId: 'E1', userId: 'M1' }],
      hrStatements: [{ id: 'S1', employerId: 'E1', userId: 'M1', userName: 'Divya' }],
      hrClaims: [{ id: 'C1', employerId: 'E1', userId: 'M1', userName: 'Divya', note: 'petrol for the Bilaspur trip' }],
      hrAssets: [{ id: 'X1', employerId: 'E1', userId: 'M1', userName: 'Divya', note: 'has a cracked screen' }],
    };
    eraseHr(s, 'M1', 'Deleted user ab12');
    expect(s.hrAttendance[0]).toMatchObject({ userName: 'Deleted user ab12', inSelfie: undefined, inLat: undefined, inLng: undefined, note: undefined });
    expect(s.hrLeaves[0]).toMatchObject({ userName: 'Deleted user ab12', reason: '—', decidedNote: undefined });
    expect(s.hrClaims[0].note).toBe('—'); expect(s.hrAssets[0]).toMatchObject({ userName: 'Deleted user ab12', note: undefined });
    expect(s.hrStatements[0].userName).toBe('Deleted user ab12'); expect(s.hrTargets).toEqual([]);
    expect(s.hrAttendance.length).toBe(2);                       // the employer's books keep the day
    eraseHr(s, 'E1', 'Deleted user ee');
    expect(s.hrAttendance.map((a: any) => a.id)).toEqual(['A2']); expect(s.hrSettings).toEqual([{ employerId: 'E2' }]);
    expect(s.hrLeaves).toEqual([]); expect(s.hrClaims).toEqual([]); expect(s.hrAssets).toEqual([]); expect(s.hrStatements).toEqual([]);
  });
});
