import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** v135 — API keys typed by the superadmin: only he can, the full secret never comes back, and the app uses them at once. */
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const SECRET = 'f2s-TEST-abcd1234efgh5678';

async function login(email: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: cfg.demoPassword }) });
  expect(r.status).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const acct = (role: string) => cfg.demoAccounts.find((a: any) => a.role === role && a.verificationStatus === 'VERIFIED');
const keys = async () => { const r = await call(jar.SA, 'GET', '/api/admin/api-keys'); expect(r.status).toBe(200); const t = await r.text(); return { t, j: JSON.parse(t) }; };
const row = (j: any, n: string) => j.keys.find((k: any) => k.name === n);

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-keys-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  const env: any = { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' };
  for (const k of ['FAST2SMS_API_KEY', 'FAST2SMS_OTP_ID', 'SMS_WEBHOOK_URL', 'SMS_WEBHOOK_TOKEN', 'TURN_URLS', 'TURN_USERNAME', 'TURN_CREDENTIAL', 'FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID']) delete env[k];
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], { cwd: dir, env, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ }
    await new Promise(r => setTimeout(r, 250));
  }
  expect(cfg).toBeTruthy();
  jar.SA = await login(acct('SUPERADMIN').email); jar.ADMIN = await login(acct('ADMIN').email); jar.BRK = await login(acct('BROKER').email);
}, 60_000);
afterAll(() => { proc?.kill(); rmSync(dir, { recursive: true, force: true }); });

describe('API keys in the Control Center', () => {
  it('only the superadmin may see or change them', async () => {
    expect((await call(undefined, 'GET', '/api/admin/api-keys')).status).toBe(401);
    for (const c of [jar.ADMIN, jar.BRK]) {
      expect((await call(c, 'GET', '/api/admin/api-keys')).status).toBe(403);
      expect((await call(c, 'PUT', '/api/admin/api-keys/FAST2SMS_API_KEY', { value: 'x' })).status).toBe(403);
    }
    const { j } = await keys(); expect(j.vault).toBe(true); expect(row(j, 'FAST2SMS_API_KEY').source).toBe('none');
  });
  it('a saved secret shows only its last 4; bad values and unknown keys are refused', async () => {
    expect((await call(jar.SA, 'PUT', '/api/admin/api-keys/FAST2SMS_API_KEY', { value: SECRET })).status).toBe(200);
    const { t, j } = await keys(); expect(t).not.toContain(SECRET); expect(row(j, 'FAST2SMS_API_KEY')).toMatchObject({ source: 'panel', shown: '••••5678' });
    expect(row(j, 'FAST2SMS_API_KEY').updatedBy).toBeTruthy();
    expect((await call(jar.SA, 'PUT', '/api/admin/api-keys/SMS_WEBHOOK_URL', { value: 'http://evil.example/x' })).status).toBe(400);
    expect((await call(jar.SA, 'PUT', '/api/admin/api-keys/FAST2SMS_API_KEY', { value: 'a\nb' })).status).toBe(400);
    expect((await call(jar.SA, 'PUT', '/api/admin/api-keys/DATABASE_URL', { value: 'x' })).status).toBe(404);
    expect((await call(jar.SA, 'PUT', '/api/admin/api-keys/AUTH_SECRET', { value: 'x' })).status).toBe(404);
  });
  it('the app uses a key at once (TURN relay for calls), and removing it switches it off again', async () => {
    const relay = async () => (await (await call(jar.BRK, 'GET', '/api/calls/config')).json()).relay;
    expect(await relay()).toBe(false);
    for (const [n, v] of [['TURN_URLS', 'turn:turn.example.in:3478'], ['TURN_USERNAME', 'genz'], ['TURN_CREDENTIAL', 'pass-123456789']])
      expect((await call(jar.SA, 'PUT', `/api/admin/api-keys/${n}`, { value: v })).status).toBe(200);
    expect(await relay()).toBe(true);
    expect((await call(jar.SA, 'PUT', '/api/admin/api-keys/TURN_CREDENTIAL', { value: '' })).status).toBe(200);
    expect(await relay()).toBe(false);
    expect(row((await keys()).j, 'TURN_CREDENTIAL').source).toBe('none');
  });
});
