/**
 * v116 — a brand-new account for EVERY role, made the real way (no seed): GENZ invites → the person registers with the code →
 * waits as PENDING (locked out of work) → GENZ approves → signs in → the role's own first screen / first action works.
 * A team member is made by his broker (temporary password, must change it). A SUPERADMIN can never be made through the API.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { freePort } from './helpers/port';

const PORT = await freePort(); const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const call = (ck: string | undefined, m: string, u: string, b?: unknown) => fetch(B + u, { method: m, headers: { 'content-type': 'application/json', ...(ck ? { cookie: ck } : {}) }, body: b ? JSON.stringify(b) : undefined });
const j = (r: Response) => r.json().catch(() => ({})) as Promise<any>;
async function login(who: string, password: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: who, password }) });
  expect(r.status, `${who} ${await r.clone().text()}`).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
let SA = ''; let ADMIN = '';
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v131-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], { cwd: dir, stdio: 'ignore', env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', PUSH_DRY_RUN: 'true', SAHAYAK: 'off', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' } });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  SA = await login(cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').email, cfg.demoPassword);
  ADMIN = await login(cfg.demoAccounts.find((a: any) => a.id === 'USR-ADMIN-1').email, cfg.demoPassword);
}, 120_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const PASS = 'Naya#Account2026';
// one new person per role; the extra fields are what that role's registration form asks for


describe('v131 · a broker joins without RERA', { timeout: 180_000 }, () => {
  const made: Record<string, { id: string; login: string }> = {};
  it('v131 — a broker may join WITHOUT a RERA number (PAN stays a must): he is Tier 2 / Non-RERA; a builder without RERA is still refused', async () => {
    const mk = async (role: string, email: string, phone: string) => (await j(await call(SA, 'POST', '/api/invitations', { invitedEmail: email, invitedPhone: phone, targetRole: role }))).invitation.code;
    const base = (code: string, name: string, phone: string, email: string, extra: object) => ({ code, name, phone, email, password: PASS, consent: true, city: 'Raipur', aadhaarNumber: '234567890130', idConsent: true, ...extra });
    const c1 = await mk('BROKER', 'bina.rera@test.genz.example', '9826170131');
    expect((await call(undefined, 'POST', '/api/auth/register-invite', base(c1, 'Bina Rera', '9826170131', 'bina.rera@test.genz.example', {}))).status).toBe(400);   // no PAN
    const ok = await call(undefined, 'POST', '/api/auth/register-invite', base(c1, 'Bina Rera', '9826170131', 'bina.rera@test.genz.example', { panNumber: 'ABCPB1310F' })); expect(ok.status, await ok.clone().text()).toBe(200);
    const u = (await j(ok)).user; expect(u.reraNumber || '').toBe('');
    expect(u.tier ?? 'TIER2').toBe('TIER2');   // no RERA number → Tier 2 (tierOf): builder projects stay closed to him
    const c2 = await mk('DEVELOPER_BUILDER', 'bina.builder@test.genz.example', '9826170132');
    const no = await call(undefined, 'POST', '/api/auth/register-invite', base(c2, 'Bina Builder', '9826170132', 'bina.builder@test.genz.example', { panNumber: 'ABCPB1320F', aadhaarNumber: '345678901326', companyName: 'Bina Buildcon' })); expect(no.status).toBe(400); expect((await j(no)).error).toMatch(/RERA/);
  });
});
