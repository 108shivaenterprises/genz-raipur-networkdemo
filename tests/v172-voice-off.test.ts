import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** D1 — FEATURE_VOICE off (default): no call routes, call:use not effective, call and mic buttons hidden. */
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const PORT = await freePort(); const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v172v-')); mkdirSync(path.join(dir, 'data'));
  const env: any = { ...process.env, KYC_VAULT_KEY: 'a1'.repeat(32), SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', SAHAYAK: 'off', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' };
  delete env.FEATURE_VOICE;
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], { cwd: dir, env, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
}, 90000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

describe('voice off by default', () => {
  it('config says voice is off', () => expect(cfg.voice).toBe(false));
  it('a verified broker gets no call routes and no call:use', async () => {
    const a = cfg.demoAccounts.find((x: any) => x.id === 'USR-BRK-002');
    const l = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
    const ck = l.headers.get('set-cookie')!.split(';')[0];
    expect((await fetch(B + '/api/calls/ring', { headers: { cookie: ck } })).status).toBe(404);
    const me = await (await fetch(B + '/api/auth/me', { headers: { cookie: ck } })).json();
    expect(JSON.stringify(me)).not.toContain('call:use');
  });
  it('client hides the mic button and call tools behind the flag', () => {
    expect(read('src/components/VoiceNote.tsx')).toContain('useVoiceFlag() ?');
    expect(read('src/components/calls/CallsPanel.tsx')).toContain('useCalls() ?');
    expect(read('server.ts')).toContain("if (voiceOn()) app.use('/api/calls'");
  });
});
