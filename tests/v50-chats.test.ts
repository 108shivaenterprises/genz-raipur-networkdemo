import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * v50 — the Chats inbox: every deal-room chat I am part of with its last message and unread count, "I have read it" marks,
 * and the same visibility as the deal-room chat itself (strangers, GENZ admins and the owner's view of the brokers-only channel).
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const DEAL = 'DEAL-2026-001'; // brokers USR-BRK-001 + USR-BRK-002 · owner USR-OWNER-001

const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const chats = async (who: string) => (await (await call(jar[who], 'GET', '/api/chats/deals')).json());
const mine = async (who: string) => (await chats(who)).deals.find((d: any) => d.id === DEAL);
const post = (who: string, body: any) => call(jar[who], 'POST', `/api/deals/${DEAL}/messages`, body);

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v50-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ B1: 'USR-BRK-001', B2: 'USR-BRK-002', B3: 'USR-BRK-003', OWNER: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('who sees which chats', () => {
  it('needs a sign-in; shows my deal chats with the last message; strangers and GENZ admins get none of it', async () => {
    expect((await call(undefined, 'GET', '/api/chats/deals')).status).toBe(401);
    const d = await mine('B1');
    expect(d).toBeTruthy();
    expect(d.propertyTitle).toMatch(/Villa/);
    expect(d.count).toBeGreaterThanOrEqual(2);
    expect(d.last.text.length).toBeGreaterThan(5);
    expect(d.with).toContain('Amit Kumar Verma');            // the other broker, by name — never a phone number
    expect(JSON.stringify(d)).not.toMatch(/\+91|phone/i);
    expect(await mine('B3')).toBeUndefined();                  // not in this deal room
    const adm = await chats('ADMIN');
    expect(adm.deals).toEqual([]);                             // GENZ reads a deal chat only through a dispute, never from the inbox
    expect((await call(jar.B3, 'POST', `/api/chats/deals/${DEAL}/read`)).status).toBe(404);
    expect((await call(jar.ADMIN, 'POST', `/api/chats/deals/${DEAL}/read`)).status).toBe(404);
  });
});

describe('unread and "I have read it"', () => {
  it('counts what the others wrote after my read mark; reading clears it; the header total matches', async () => {
    await call(jar.B1, 'POST', `/api/chats/deals/${DEAL}/read`);
    await call(jar.B2, 'POST', `/api/chats/deals/${DEAL}/read`);
    expect((await mine('B1')).unread).toBe(0);
    expect((await post('B2', { text: 'Alpha — visit time ok?' })).status).toBe(200);
    expect((await post('B2', { text: 'Beta — please confirm' })).status).toBe(200);
    expect((await mine('B1')).unread).toBe(2);
    expect((await mine('B2')).unread).toBe(0);               // my own messages are never unread for me
    const list = await chats('B1');
    const sum = await (await call(jar.B1, 'GET', '/api/chats/summary')).json();
    expect(sum.unread).toBe(list.unread);
    expect(sum.unread).toBeGreaterThanOrEqual(2);
    const r1 = await call(jar.B1, 'POST', `/api/chats/deals/${DEAL}/read`);
    expect((await r1.json()).unread).toBe(0);
    expect((await mine('B1')).unread).toBe(0);
    expect((await call(jar.B1, 'POST', `/api/chats/deals/${DEAL}/read`)).status).toBe(200); // reading twice is harmless
    // a message of my own does not make anything unread for me, and the last-message line says it is mine
    await post('B1', { text: 'Gamma — yes' });
    const d = await mine('B1');
    expect(d.unread).toBe(0); expect(d.last.mine).toBe(true); expect(d.last.text).toBe('Gamma — yes');
  });

  it('a person with no read mark yet is told only about the last few days, not old talk', async () => {
    // Every demo-bulk deal chat is older than 3 days except the freshest ones: nothing ancient is shown as unread
    const all = (await chats('B1')).deals;
    const old = all.filter((d: any) => d.last && Date.now() - Date.parse(d.last.at) > 4 * 86400_000);
    expect(old.length).toBeGreaterThan(0);
    for (const d of old) expect(d.unread, d.id).toBe(0);
  });
});

describe('the brokers-only channel', () => {
  it('reaches the two brokers but never the owner — not in the last message, not in the unread count', async () => {
    await call(jar.OWNER, 'POST', `/api/chats/deals/${DEAL}/read`);
    const before = await mine('OWNER');
    expect(before).toBeTruthy();
    const r = await post('B2', { text: 'Commission talk only for brokers', audience: 'BROKERS' });
    expect(r.status).toBe(200);
    const b1 = await mine('B1');
    expect(b1.last.text).toBe('Commission talk only for brokers');
    expect(b1.unread).toBe(1);
    const o = await mine('OWNER');
    expect(o.last.text).not.toMatch(/Commission talk only/);
    expect(o.unread).toBe(before.unread);
    expect(o.count).toBe(before.count);
  });
});
