import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** v170 — a new deal between the same two brokers gets their last agreed terms to fill the form (one tap). The agreement stays per deal. */
const PORT = await freePort(); const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any; let c1 = '';
const root = path.resolve(import.meta.dirname, '..');
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v170-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], { cwd: dir, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore' });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  const a = cfg.demoAccounts.find((x: any) => x.id === 'USR-BRK-001');
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  c1 = r.headers.get('set-cookie')!.split(';')[0];
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('same terms (v170)', () => {
  it('the route answers a deal broker; with no earlier deal between the pair it has nothing to copy', async () => {
    const r = await fetch(B + '/api/deals/DEAL-2026-001/last-terms', { headers: { cookie: c1 } });
    expect(r.status).toBe(200); expect((await r.json()).terms).toBeNull();
  });
  it('a stranger cannot read it', async () => {
    expect((await fetch(B + '/api/deals/DEAL-2026-001/last-terms')).status).toBeGreaterThanOrEqual(401);
  });
  it('the proposal form offers "Use same terms" and still names this property + client only', () => {
    const s = readFileSync(path.join(root, 'src/components/DealRoomsView.tsx'), 'utf8');
    expect(s).toContain('same-terms-use'); expect(s).toContain('api.lastAgreementTerms'); expect(s).toContain('stays for this property and client only');
  });
});
