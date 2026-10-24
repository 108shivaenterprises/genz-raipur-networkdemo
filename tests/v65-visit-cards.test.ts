import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkCard } from '../server/chatcards';

/**
 * v65 — every scheduled site visit of a deal leaves a card in its chat by itself.
 * A card carries ids only; the server decides who may put which card into the chat, and never lets "+" widen what a person can open.
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 6900 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const DEAL = 'DEAL-2026-001'; // brokers USR-BRK-001 + USR-BRK-002 · owner USR-OWNER-001
let PROP = ''; let principal = ''; let outsider = '';

const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const post = (who: string, body: any) => call(jar[who], 'POST', `/api/deals/${DEAL}/messages`, body);
const read = async (who: string) => (await (await call(jar[who], 'GET', `/api/deals/${DEAL}/messages`)).json()).messages as any[];

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v65-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ B1: 'USR-BRK-001', B2: 'USR-BRK-002', B3: 'USR-BRK-003', OWNER: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
  const d = await (await call(jar.B1, 'GET', `/api/deals/${DEAL}`)).json();
  PROP = d.property.id;
  // who is the principal of this property (owner or listing broker) — he can upload into the vault; the other deal broker cannot
  const vb = await (await call(jar.B1, 'GET', `/api/properties/${PROP}/vault/assets`)).json();
  principal = vb.isOwnerOrListingBroker ? 'B1' : 'B2';
  outsider = principal === 'B1' ? 'B2' : 'B1';
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });


describe('visit cards appear by themselves', () => {
  it('two visits of the same client both show in the chat, for the broker and the owner, with no secret', async () => {
    const mk = async (days: number) => (await (await call(jar.B1, 'POST', '/api/site-visits', { dealRoomId: DEAL, propertyId: PROP, customerName: 'Same Client', scheduledTime: new Date(Date.now() + days * 86400_000).toISOString() })).json()).siteVisit;
    const a = await mk(1); const b = await mk(2);
    for (const who of ['B1', 'OWNER']) {
      const m = await read(who);
      for (const v of [a, b]) expect(m.filter((x: any) => x.kind === 'VISIT' && x.refId === v.id).length, `${who} ${v.id}`).toBe(1);
    }
    expect(JSON.stringify(await read('OWNER'))).not.toMatch(/otpCode|qrToken/);
    // reading again does not add copies
    const again = await read('B1');
    expect(again.filter((x: any) => x.kind === 'VISIT' && x.refId === a.id).length).toBe(1);
  });
});
