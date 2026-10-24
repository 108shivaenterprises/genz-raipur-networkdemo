import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * v63 — the client's full mobile is kept sealed in his room: the broker sees it (call / WhatsApp), office staff by the "customer numbers" switch
 * (full / tap to reveal / never), nobody else; lists, audit and other brokers get only the last 4; it is erased when the room closes.
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 7600 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (c: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = async (r: Response) => r.json();
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id);
  expect(a, id).toBeTruthy();
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
function client() {
  let cookie = '';
  const go = async (method: string, url: string, form?: Record<string, string>) => {
    const r = await fetch(B + url, { method, redirect: 'manual', headers: { ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...(cookie ? { cookie } : {}) }, body: form ? new URLSearchParams(form).toString() : undefined });
    const sc = (r.headers as any).getSetCookie?.() as string[] | undefined;
    if (sc?.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
    return { status: r.status, text: await r.text() };
  };
  return { go };
}
const perms = async (c: string) => { const me = await j(await call(c, 'GET', '/api/auth/me')); return (me.permissions || me.user?.permissions || []) as string[]; };
const policy = (c: string, member: string, p: Record<string, unknown>) => call(c, 'PUT', `/api/pcontrol/team/${member}/policy`, p);

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v63-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ B1: 'USR-BRK-001', B2: 'USR-BRK-002', S1: 'USR-TEAM-002', S2: 'USR-TEAM-003', BUILDER: 'USR-BUILDER-001', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });


const NUM = '9712345678';
let ROOM = ''; let SROOM = '';
const rooms = async (c: string) => (await j(await call(c, 'GET', '/api/client-rooms'))).rooms as any[];
const detail = async (c: string, id: string) => j(await call(c, 'GET', `/api/client-rooms/${id}`));

describe('client mobile in the room', () => {
  it('the broker sees the full number in his room; lists and other brokers get only the last 4', async () => {
    const r = await call(jar.B1, 'POST', '/api/client-rooms', { clientName: 'Mohit Garg', phone: NUM, kind: 'BUYER', consent: true });
    expect(r.status, await r.clone().text()).toBe(200);
    ROOM = (await j(r)).room.id;
    const d = (await detail(jar.B1, ROOM)).room;
    expect(d.phone).toBe(NUM); expect(d.phoneSaved).toBe(true); expect(d.phoneAccess).toBe('FULL');
    const list = JSON.stringify(await rooms(jar.B1));
    expect(list).not.toContain(NUM); expect(list).toContain('5678');
    expect((await call(jar.B2, 'GET', `/api/client-rooms/${ROOM}`)).status).toBe(404);
    expect((await call(jar.B2, 'POST', `/api/client-rooms/${ROOM}/phone/reveal`)).status).toBe(404);
  });
  it('is stored sealed — not readable in the data file', async () => {
    await new Promise(r => setTimeout(r, 2500));
    const fs = await import('node:fs'); const f = path.join(dir, 'data');
    let found = false; let any = false;
    for (const n of fs.readdirSync(f)) { const p = path.join(f, n); if (!fs.statSync(p).isFile() || fs.statSync(p).size > 60e6) continue; const t = fs.readFileSync(p, 'utf8'); if (t.includes('clientRooms')) any = true; if (t.includes(NUM)) found = true; }
    expect(any).toBe(true); expect(found).toBe(false);
  });
  it('office staff: switch off → no room; "always visible" → number; "tap to reveal" → one tap; "never" → nothing', async () => {
    expect((await call(jar.S1, 'GET', '/api/client-rooms')).status).toBe(403);
    expect((await policy(jar.B1, 'USR-TEAM-002', { rooms: true, phoneMode: 'FULL' })).status).toBe(200);
    expect((await detail(jar.S1, ROOM)).room.phone).toBe(NUM);
    expect((await policy(jar.B1, 'USR-TEAM-002', { phoneMode: 'REVEAL', revealCap: 5 })).status).toBe(200);
    const d1 = (await detail(jar.S1, ROOM)).room;
    expect(d1.phone).toBeUndefined(); expect(d1.phoneAccess).toBe('REVEAL'); expect(d1.phoneSaved).toBe(true);
    const rv = await call(jar.S1, 'POST', `/api/client-rooms/${ROOM}/phone/reveal`);
    expect(rv.status).toBe(200); expect((await j(rv)).phone).toBe(NUM);
    expect((await call(jar.S1, 'POST', `/api/client-rooms/${ROOM}/phone/reveal`)).status).toBe(200); // same room again: not counted twice
    expect((await policy(jar.B1, 'USR-TEAM-002', { phoneMode: 'HIDDEN' })).status).toBe(200);
    const d2 = (await detail(jar.S1, ROOM)).room;
    expect(d2.phone).toBeUndefined(); expect(d2.phoneAccess).toBe('HIDDEN');
    expect((await call(jar.S1, 'POST', `/api/client-rooms/${ROOM}/phone/reveal`)).status).toBe(403);
    expect(JSON.stringify(await rooms(jar.S1))).not.toContain(NUM);
  });
  it('the daily cap counts reveals', async () => {
    expect((await policy(jar.B1, 'USR-TEAM-002', { phoneMode: 'REVEAL', revealCap: 1 })).status).toBe(200);
    const mk = async (n: string, ph: string) => (await j(await call(jar.B1, 'POST', '/api/client-rooms', { clientName: n, phone: ph, kind: 'RENTER', consent: true }))).room.id;
    const a = await mk('Cap Test A', '9811100001');
    const b = await mk('Cap Test B', '9811100002');
    const used = (await call(jar.S1, 'POST', `/api/client-rooms/${ROOM}/phone/reveal`)).status; // ROOM was revealed today already (earlier test) — not counted again
    expect(used).toBe(200);
    // the earlier reveal used the cap of 1 this day → a different room is refused
    expect((await call(jar.S1, 'POST', `/api/client-rooms/${a}/phone/reveal`)).status).toBe(429);
    expect(b).toBeTruthy();
  });
  it('a room opened by staff is the broker\'s: he sees who opened it and the number', async () => {
    expect((await policy(jar.B1, 'USR-TEAM-002', { phoneMode: 'FULL' })).status).toBe(200);
    const r = await call(jar.S1, 'POST', '/api/client-rooms', { clientName: 'Neelam Rao', phone: '9822200003', kind: 'TENANT', consent: true });
    expect(r.status, await r.clone().text()).toBe(200);
    SROOM = (await j(r)).room.id;
    const row = (await rooms(jar.B1)).find(x => x.id === SROOM);
    expect(row.createdById).toBe('USR-TEAM-002'); expect(row.createdByName).toBeTruthy();
    expect((await detail(jar.B1, SROOM)).room.phone).toBe('9822200003');
    expect((await detail(jar.S2, SROOM).catch(() => ({}))).room).toBeUndefined(); // another broker's staff / not on the switch
  });
  it('adding / re-saving the number: only the broker, and it must match the room\'s key', async () => {
    expect((await call(jar.B1, 'PUT', `/api/client-rooms/${ROOM}/phone`, { phone: '9000000000' })).status).toBe(400); // another number
    expect((await call(jar.B1, 'PUT', `/api/client-rooms/${ROOM}/phone`, { phone: '12' })).status).toBe(400);
    expect((await call(jar.S1, 'PUT', `/api/client-rooms/${ROOM}/phone`, { phone: NUM })).status).toBe(403); // staff cannot
    expect((await call(jar.B2, 'PUT', `/api/client-rooms/${ROOM}/phone`, { phone: NUM })).status).toBe(404); // another broker
    const ok = await call(jar.B1, 'PUT', `/api/client-rooms/${ROOM}/phone`, { phone: NUM });
    expect(ok.status).toBe(200); expect((await j(ok)).room.phone).toBe(NUM);
  });
  it('closing the room erases the saved number', async () => {
    const c = await call(jar.B1, 'POST', `/api/client-rooms/${ROOM}/close`);
    expect(c.status).toBe(200);
    const d = (await detail(jar.B1, ROOM)).room;
    expect(d.phoneSaved).toBe(false); expect(d.phone).toBeUndefined();
    expect((await call(jar.B1, 'POST', `/api/client-rooms/${ROOM}/phone/reveal`)).status).toBe(404);
  });
});
