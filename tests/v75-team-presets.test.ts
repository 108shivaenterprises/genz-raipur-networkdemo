import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { teamMaxFor, teamRolesFor, inferTeamRole, TEAM_ROLE_IDS, TEAM_MAX_DEFAULT } from '../src/shared/crmSales.js';
import { STAFF_PRESETS, presetPatch, presetOf, DEFAULT_POLICY } from '../src/shared/pcontrolRules.js';

/** v75 — team limits by employer, contractor roles, and one-tap staff presets (every preset must be accepted by the server for the employer it is offered to). */
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 7800 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (c: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = async (r: Response) => r.json();
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
let phoneSeq = 0;
const add = (c: string, role: string, name = 'Test Member') =>
  call(c, 'POST', '/api/team', { name, phone: `98${String(76000000 + ++phoneSeq * 7 + Math.floor(Math.random() * 5)).padStart(8, '0')}`.slice(0, 10), role, consentAttested: true });

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v75t-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: 'a1'.repeat(32), SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK: 'USR-BRK-002', BUILDER: 'USR-BUILDER-002', CON: 'USR-CONTRACTOR-001' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

describe('rules (no server)', () => {
  it('the member limit depends on who employs', () => {
    expect(teamMaxFor('DEVELOPER_BUILDER')).toBe(60);
    expect(teamMaxFor('CONTRACTOR')).toBe(30);
    expect(teamMaxFor('BROKER')).toBe(TEAM_MAX_DEFAULT);
    expect(teamMaxFor(undefined)).toBe(15);
  });
  it('a contractor is offered his own site roles, a broker or builder the sales ones — every offered role is a valid id', () => {
    const con = teamRolesFor('CONTRACTOR').map(r => r.id); const brk = teamRolesFor('BROKER').map(r => r.id);
    expect(con).toContain('SITE_SUPERVISOR'); expect(con).toContain('ESTIMATOR'); expect(con).not.toContain('TELECALLER');
    expect(brk).toContain('TELECALLER'); expect(brk).not.toContain('SITE_SUPERVISOR');
    for (const id of [...con, ...brk]) expect(TEAM_ROLE_IDS).toContain(id);
    expect(inferTeamRole('Site supervisor')).toBe('SITE_SUPERVISOR');
    expect(inferTeamRole('Quantity surveyor')).toBe('ESTIMATOR');
    expect(inferTeamRole('Accountant')).toBe('ACCOUNTANT');
    expect(inferTeamRole('Telecaller')).toBe('TELECALLER');
  });
  it('a preset is recognised after it is applied, and any other mix is "custom"', () => {
    for (const kind of ['BUILDER', 'BROKER'] as const) {
      for (const pr of STAFF_PRESETS) {
        const pol = { ...DEFAULT_POLICY, ...presetPatch(pr.id, kind) };
        expect(presetOf(pol, kind), `${kind}/${pr.id}`).toBe(pr.id);
        expect(presetOf({ ...pol, canMarkLost: !pol.canMarkLost }, kind), `${kind}/${pr.id} edited`).not.toBe(pr.id);
      }
    }
    expect(presetPatch('NOPE', 'BROKER')).toBeNull();
  });
  it('presets are safe by design: nobody but Accounts handles money, and numbers are never fully open except for Sales', () => {
    for (const kind of ['BUILDER', 'BROKER'] as const) {
      for (const pr of STAFF_PRESETS) {
        const pt = presetPatch(pr.id, kind)!;
        if (pr.id !== 'ACCOUNTS') { expect(pt.canConfirmMoney).toBe(false); expect(pt.canCollectMoney).toBe(false); }
        if (pr.id !== 'SALES') expect(pt.phoneMode).not.toBe('FULL');
        if (kind === 'BROKER') expect(pt.canVerify).toBeUndefined(); else { expect(pt.listings).toBeUndefined(); expect(pt.rooms).toBeUndefined(); }
      }
    }
    expect(presetPatch('SITE', 'BUILDER')!.canScanVisits).toBe(true);
    expect(presetPatch('SALES', 'BUILDER')!.canScanVisits).toBe(false);
  });
});

describe('server', () => {
  it('lists the limit per employer', async () => {
    expect((await j(await call(jar.BUILDER, 'GET', '/api/team'))).max).toBe(60);
    expect((await j(await call(jar.CON, 'GET', '/api/team'))).max).toBe(30);
    expect((await j(await call(jar.BRK, 'GET', '/api/team'))).max).toBe(15);
  });
  it('a contractor adds a site supervisor and the role is kept', async () => {
    const r = await add(jar.CON, 'SITE_SUPERVISOR', 'Ravi Supervisor');
    expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
    const b = await j(r); expect(b.member.teamRole).toBe('SITE_SUPERVISOR');
    const l = (await j(await call(jar.CON, 'GET', '/api/team'))).members;
    expect(l.find((m: any) => m.id === b.member.id).teamRole).toBe('SITE_SUPERVISOR');
  });
  it('a broker stops at 15 people', async () => {
    const have = (await j(await call(jar.BRK, 'GET', '/api/team'))).members.filter((m: any) => m.status !== 'REJECTED').length;
    for (let i = have; i < 15; i++) { const r = await add(jar.BRK, 'TELECALLER', `Tele ${i}`); expect(r.status, `add #${i}`).toBe(200); }
    const over = await add(jar.BRK, 'TELECALLER', 'One too many');
    expect(over.status).toBe(409); expect((await j(over)).error).toContain('15');
  });
  it('a builder goes past 15 (a sales force is bigger than an office)', async () => {
    const have = (await j(await call(jar.BUILDER, 'GET', '/api/team'))).members.length;
    for (let i = have; i < 17; i++) { const r = await add(jar.BUILDER, 'SALES_EXECUTIVE', `Exec ${i}`); expect(r.status, `add #${i}`).toBe(200); }
    expect((await j(await call(jar.BUILDER, 'GET', '/api/team'))).members.length).toBeGreaterThanOrEqual(17);
  });
  for (const [who, kind] of [['BUILDER', 'BUILDER'], ['BRK', 'BROKER']] as const) {
    it(`every preset is accepted by the server for a ${kind.toLowerCase()} and reads back as the same preset`, async () => {
      const list = (await j(await call(jar[who], 'GET', '/api/team'))).members;
      const mid = list[0].id;
      for (const pr of STAFF_PRESETS) {
        const r = await call(jar[who], 'PUT', `/api/pcontrol/team/${mid}/policy`, presetPatch(pr.id, kind));
        expect(r.status, `${kind}/${pr.id}: ${JSON.stringify(await r.clone().json())}`).toBe(200);
        const ctl = await j(await call(jar[who], 'GET', '/api/pcontrol/team/control'));
        const m = ctl.members.find((x: any) => x.id === mid);
        expect(presetOf(m.policy, kind), `${kind}/${pr.id}`).toBe(pr.id);
      }
    });
  }
  it('the server still refuses a preset meant for the other employer (a broker cannot give builder-only switches)', async () => {
    const mid = (await j(await call(jar.BRK, 'GET', '/api/team'))).members[0].id;
    expect((await call(jar.BRK, 'PUT', `/api/pcontrol/team/${mid}/policy`, presetPatch('SITE', 'BUILDER'))).status).toBe(400);
    const bid = (await j(await call(jar.BUILDER, 'GET', '/api/team'))).members[0].id;
    expect((await call(jar.BUILDER, 'PUT', `/api/pcontrol/team/${bid}/policy`, presetPatch('SALES', 'BROKER'))).status).toBe(400);
  });
});
