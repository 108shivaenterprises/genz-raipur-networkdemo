import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { freePort } from './helpers/port';

const PORT = await freePort(); const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v113-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], { cwd: dir, stdio: 'ignore', env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' } });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
}, 120_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('v113 clients ↔ buyers ↔ chat', () => {
  it('one client, three places, no duplicates', async () => {
    const a = cfg.demoAccounts.find((x: any) => x.id === 'USR-BRK-001');
    const lr = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
    const ck = lr.headers.get('set-cookie')!.split(';')[0];
    const call = (m: string, u: string, b?: unknown) => fetch(B + u, { method: m, headers: { 'content-type': 'application/json', cookie: ck }, body: b ? JSON.stringify(b) : undefined }).then(async r => ({ status: r.status, j: await r.json().catch(() => ({})) }));
    const needs = async () => { const r = await call('GET', '/api/requirements'); return (r.j.requirements || r.j) as any[]; };
    const clients = async () => (await call('GET', '/api/daily/clients')).j.clients as any[];

    // 1) client with a budget → appears in Buyers
    const add = await call('POST', '/api/daily/clients', { name: 'Link Test', phone: '9876501234', budgetMin: 3000000, budgetMax: 5000000, city: 'Raipur', areas: ['Pandri'], propertyType: '2 BHK Flat', transactionType: 'Sale', tags: [], notes: '', consent: true });
    expect(add.status, JSON.stringify(add.j)).toBe(200);
    let n = (await needs()).filter((q: any) => q.customerPhone === '9876501234'); expect(n).toHaveLength(1);
    expect(n[0].budgetMax).toBe(5000000);
    const c = (await clients()).find(x => x.name === 'Link Test'); expect(c.needId).toBe(n[0].id);

    // 2) stage DEAL → need fulfilled
    await call('POST', `/api/daily/clients/${c.id}/stage`, { stage: 'DEAL' });
    n = (await needs()).filter((q: any) => q.customerPhone === '9876501234'); expect(n[0].status).toBe('fulfilled');

    // 3) a room for that same mobile → the card shows the room (room-only numbers stay sealed, no card is made for them)
    const rm = await call('POST', '/api/client-rooms', { clientName: 'Link Test', phone: '9876501234', kind: 'BUYER', consent: true });
    expect(rm.status, JSON.stringify(rm.j)).toBe(200);
    const list = await clients(); expect(list.find(x => x.name === 'Link Test').roomId).toBeTruthy();

    // 4) listing again changes nothing (idempotent)
    expect((await clients()).length).toBe(list.length);
  }, 60_000);
});
