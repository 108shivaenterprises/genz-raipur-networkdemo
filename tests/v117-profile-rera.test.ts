/**
 * v117 — profiles for every role + "my RERA came":
 *   a local associate (Tier 2) is locked out of builder projects → adds his RERA himself → GENZ checks it → Tier 1 → builder projects open.
 *   Bad / duplicate numbers are refused, a reject needs a reason, nobody checks his own claim, and the profile shows tier + specialities.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { freePort } from './helpers/port';
import { profileProblem, groupOfRole } from '../src/shared/reviewRules';

const PORT = await freePort(); const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const call = (ck: string | undefined, m: string, u: string, b?: unknown) => fetch(B + u, { method: m, headers: { 'content-type': 'application/json', ...(ck ? { cookie: ck } : {}) }, body: b ? JSON.stringify(b) : undefined });
const j = (r: Response) => r.json().catch(() => ({})) as Promise<any>;
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id); expect(a, id).toBeTruthy();
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const ck: Record<string, string> = {};
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v117-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], { cwd: dir, stdio: 'ignore', env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', PUSH_DRY_RUN: 'true', SAHAYAK: 'off', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' } });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  for (const [k, id] of Object.entries({ T2: 'USR-NEW-ASSOCIATE', BRK1: 'USR-BRK-001', ADMIN: 'USR-ADMIN-1', OWN: 'USR-OWNER-001', CONN: 'USR-NEW-CONNECTOR', TEAM: 'USR-NEW-TEAM', BLD: 'USR-NEW-BUILDER' })) ck[k] = await login(id);
}, 120_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const NEW_RERA = 'PCGRERA261103-0117';

describe('v117 · a local associate gets his RERA → Tier 1', { timeout: 120_000 }, () => {
  it('starts as Tier 2 and is kept out of builder projects', async () => {
    const r = await j(await call(ck.T2, 'GET', '/api/network/my-rera')); expect(r.tier).toBe('TIER2'); expect(r.claim).toBeNull();
    const g = await call(ck.T2, 'GET', '/api/pcontrol/partner/projects'); expect(g.status).toBe(403); expect((await j(g)).code).toBe('TIER2_NOT_ALLOWED');
  });
  it('a wrong, already-used or non-broker RERA is refused', async () => {
    expect((await call(ck.T2, 'POST', '/api/network/my-rera', { reraNumber: 'abc' })).status).toBe(400);
    expect((await call(ck.T2, 'POST', '/api/network/my-rera', { reraNumber: 'PCGRERA251103-0901' })).status).toBe(409);   // Naya Broker's number
    expect((await call(ck.OWN, 'POST', '/api/network/my-rera', { reraNumber: NEW_RERA })).status).toBe(403);
    expect((await call(ck.T2, 'GET', '/api/network/rera-claims')).status).toBe(403);   // only GENZ staff see the queue
  });
  it('adds his RERA → PENDING, admins get an alert, nothing opens yet', async () => {
    const r = await j(await call(ck.T2, 'POST', '/api/network/my-rera', { reraNumber: ' pcgrera261103-0117 ' }));
    expect(r.claim.status).toBe('PENDING'); expect(r.claim.number).toBe(NEW_RERA); expect(r.tier).toBe('TIER2');
    expect((await call(ck.T2, 'GET', '/api/pcontrol/partner/projects')).status).toBe(403);
    const q = await j(await call(ck.ADMIN, 'GET', '/api/network/rera-claims'));
    const row = q.claims.find((x: any) => x.userId === 'USR-NEW-ASSOCIATE'); expect(row.number).toBe(NEW_RERA); expect(row.idChecked).toBe(true);
    // another broker cannot claim the same number while it is being checked
    expect((await call(ck.BRK1, 'POST', '/api/network/my-rera', { reraNumber: NEW_RERA })).status).toBe(409);
  });
  it('a send-back needs a reason; the broker sees it and can send again', async () => {
    expect((await call(ck.ADMIN, 'POST', '/api/network/rera-claims/USR-NEW-ASSOCIATE', { approve: false })).status).toBe(400);
    const no = await j(await call(ck.ADMIN, 'POST', '/api/network/rera-claims/USR-NEW-ASSOCIATE', { approve: false, note: 'Number not found on the CG RERA portal' }));
    expect(no.claim.status).toBe('REJECTED'); expect(no.tier).toBe('TIER2');
    const mine = await j(await call(ck.T2, 'GET', '/api/network/my-rera')); expect(mine.claim.note).toMatch(/not found/);
    expect((await j(await call(ck.T2, 'POST', '/api/network/my-rera', { reraNumber: NEW_RERA }))).claim.status).toBe('PENDING');
  });
  it('GENZ approves → Tier 1, the RERA is on his profile and builder projects open', async () => {
    const ok = await j(await call(ck.ADMIN, 'POST', '/api/network/rera-claims/USR-NEW-ASSOCIATE', { approve: true }));
    expect(ok.tier).toBe('TIER1'); expect(ok.claim.status).toBe('APPROVED');
    expect((await call(ck.ADMIN, 'POST', '/api/network/rera-claims/USR-NEW-ASSOCIATE', { approve: true })).status).toBe(404);   // decided once
    const g = await call(ck.T2, 'GET', '/api/pcontrol/partner/projects'); expect(g.status, await g.clone().text()).toBe(200);
    const me = await j(await call(ck.T2, 'GET', '/api/profiles/mine')); expect(me.card.tier).toBe('TIER1'); expect(me.card.rera).toBe(NEW_RERA);
    expect((await j(await call(ck.T2, 'GET', '/api/network/my-rera'))).rera).toBe(NEW_RERA);
    expect((await call(ck.T2, 'POST', '/api/network/my-rera', { reraNumber: NEW_RERA })).status).toBe(409);   // same number again
    expect((await j(await call(ck.ADMIN, 'GET', '/api/network/rera-claims'))).claims.some((x: any) => x.userId === 'USR-NEW-ASSOCIATE')).toBe(false);
  });
  it('the old admin "set tier" path also closes a waiting claim', async () => {
    expect((await j(await call(ck.BRK1, 'POST', '/api/network/my-rera', { reraNumber: 'PCGRERA261103-0118' }))).claim.status).toBe('PENDING');
    expect((await call(ck.ADMIN, 'POST', '/api/network/tier/USR-BRK-001', { tier: 'TIER1' })).status).toBe(200);
    const r = await j(await call(ck.BRK1, 'GET', '/api/network/my-rera')); expect(r.rera).toBe('PCGRERA261103-0118'); expect(r.claim.status).toBe('APPROVED');
  });
});

describe('v117 · profiles for every role', { timeout: 60_000 }, () => {
  it('broker, builder, owner, team member and shop connector each have a profile; specialities save and show', async () => {
    for (const k of ['T2', 'BLD', 'OWN', 'TEAM', 'CONN']) { const m = await j(await call(ck[k], 'GET', '/api/profiles/mine')); expect(m.card, k).toBeTruthy(); expect(m.staff, k).toBeFalsy(); }
    expect((await call(ck.T2, 'PUT', '/api/profiles/mine', { specialties: ['RESALE', 'X'] })).status).toBe(400);
    expect((await call(ck.T2, 'PUT', '/api/profiles/mine', { specialties: ['RESALE', 'RENTAL', 'PLOTS', 'NRI', 'LOANS'] })).status).toBe(400);   // max 4
    const s = await j(await call(ck.T2, 'PUT', '/api/profiles/mine', { about: 'Resale and rentals in Telibandha', specialties: ['RESALE', 'RENTAL'], areas: ['Telibandha'] }));
    expect(s.card.specialties).toEqual(['RESALE', 'RENTAL']);
    const c = await j(await call(ck.CONN, 'GET', '/api/profiles/mine')); expect(c.card.group).toBe('CONNECTOR');
    expect((await call(ck.CONN, 'GET', '/api/profiles/search?q=Naya')).status).toBe(403);   // his own profile, but no people directory
    expect((await call(ck.CONN, 'PUT', '/api/profiles/mine', { about: 'Kirana store near Telibandha talab', areas: ['Telibandha'] })).status).toBe(200);
    const staff = await j(await call(ck.ADMIN, 'GET', '/api/profiles/mine')); expect(staff.staff).toBe(true);   // GENZ staff search and moderate, no profile
  });
  it('pure rules: the shopkeeper maps to CONNECTOR, specialities are checked', () => {
    expect(groupOfRole('GENZ_CONNECTOR')).toBe('CONNECTOR'); expect(groupOfRole('ADMIN')).toBeNull();
    expect(profileProblem({ specialties: ['RESALE', 'RESALE'] })).toBeTruthy(); expect(profileProblem({ specialties: ['LUXURY'] })).toBeFalsy();
  });
  it('the screens: my profile shows the RERA card to a broker, staff see the claims on ID Review', () => {
    const v = readFileSync(path.resolve(import.meta.dirname, '../src/components/ProfilesView.tsx'), 'utf8');
    expect(v).toContain("{c.role === 'BROKER' && <MyReraCard />}"); expect(v).toContain('data-testid="prof-strength"'); expect(v).toContain('data-testid="profile-hero"');
    const idr = readFileSync(path.resolve(import.meta.dirname, '../src/components/IdReviewView.tsx'), 'utf8'); expect(idr).toContain('<ReraClaimsPanel onDone={after} />');
    const rt = readFileSync(path.resolve(import.meta.dirname, '../src/components/ReraTier.tsx'), 'utf8');
    for (const m of rt.matchAll(/\btx\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g)) expect(/[ऀ-ॿ]/.test(m[2]), m[1]).toBe(true);
  });
});
