import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * v58 — a broker's office staff: the broker switches on (per person) listings read-only (+ the address of HIS OWN listings), his client
 * rooms and his client list. Everything stays the broker's; staff never get an owner's name / number or papers, never close a room,
 * never delete a client; numbers in the client list only with "always visible"; another broker's staff never see any of it.
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = await freePort();
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v58-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ B1: 'USR-BRK-001', B2: 'USR-BRK-002', S1: 'USR-TEAM-002', S2: 'USR-TEAM-003', BUILDER: 'USR-BUILDER-001', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

describe('switches', () => {
  it('are off by default; only a broker can give them; the member gets the screens only after the switch', async () => {
    const p0 = await perms(jar.S1);
    expect(p0).not.toContain('property:read'); expect(p0).not.toContain('clientroom:use'); expect(p0).not.toContain('daily:use');
    expect((await call(jar.S1, 'GET', '/api/properties')).status).toBe(403);
    expect((await call(jar.S1, 'GET', '/api/client-rooms')).status).toBe(403);
    expect((await call(jar.S1, 'GET', '/api/daily/clients')).status).toBe(403);
    // a builder's staff never gets these
    const r = await policy(jar.BUILDER, 'USR-TEAM-005', { rooms: true });
    expect(r.status).toBe(400);
    // a broker cannot set them on someone else's staff
    expect((await policy(jar.B1, 'USR-TEAM-003', { rooms: true })).status).toBe(404);
    expect((await policy(jar.B1, 'USR-TEAM-002', { listings: 'EVERYTHING' })).status).toBe(400);
    expect((await policy(jar.B1, 'USR-TEAM-002', { listings: 'READ', rooms: true, clients: true })).status).toBe(200);
    const p1 = await perms(jar.S1);
    expect(p1).toEqual(expect.arrayContaining(['property:read', 'clientroom:use', 'daily:use']));
    expect(p1).not.toContain('property:create'); expect(p1).not.toContain('propdoc:use'); expect(p1).not.toContain('sitevisit:create');
  });
});

describe('listings', () => {
  it('read-only like the broker sees them; the address of the broker\'s own listing only with "+ address"; never the owner or papers', async () => {
    const all = (await j(await call(jar.ADMIN, 'GET', '/api/properties'))).properties as any[];
    const own = all.find(p => p.listingBrokerId === 'USR-BRK-001' && p.verificationStatus === 'VERIFIED' && ['active', 'under_negotiation'].includes(p.listingStatus) && p.addressHidden && p.addressHidden.length > 5);
    const other = all.find(p => p.listingBrokerId === 'USR-BRK-002' && p.verificationStatus === 'VERIFIED' && ['active', 'under_negotiation'].includes(p.listingStatus) && p.addressHidden && p.addressHidden.length > 5);
    expect(own && other).toBeTruthy();
    const read = async (id: string) => (await j(await call(jar.S1, 'GET', `/api/properties/${id}`))).property;
    let a = await read(own.id);
    expect(a.addressHidden).not.toBe(own.addressHidden);
    expect(a.ownerName).toBe('Owner (identity protected)');
    await policy(jar.B1, 'USR-TEAM-002', { listings: 'ADDRESS' });
    a = await read(own.id);
    expect(a.addressHidden).toBe(own.addressHidden);
    expect(a.ownerName).toBe('Owner (identity protected)');
    expect(String(a.ownerPhone)).not.toBe(String(own.ownerPhone));
    expect(a.documents).toEqual([]);
    expect(a.ownerApprovedNetPrice).toBeUndefined();
    const o = await read(other.id);
    expect(o.addressHidden).not.toBe(other.addressHidden);          // never another broker's address
    // the member cannot list, edit or offer
    expect((await call(jar.S1, 'POST', '/api/properties', { title: 'x' })).status).toBe(403);
    expect((await call(jar.S1, 'POST', '/api/offers', { propertyId: other.id, amount: 1 })).status).toBe(403);
  });
});

describe('client rooms', () => {
  const phone = '97' + String(10000000 + Math.floor(Math.random() * 89999999));
  let roomId = ''; let link = '';
  it('the member opens a room for the broker\'s client; it is the broker\'s room; the client is told the office team can read', async () => {
    const made = await call(jar.S1, 'POST', '/api/client-rooms', { clientName: 'Office Client', phone, kind: 'BUYER', consent: true });
    expect(made.status, await made.clone().text()).toBe(200);
    const b = await j(made); roomId = b.room.id; link = b.link;
    expect(b.room.staff).toBe(true);
    // the broker sees it among his own rooms; another broker's staff never does
    expect((await j(await call(jar.B1, 'GET', '/api/client-rooms'))).rooms.some((r: any) => r.id === roomId)).toBe(true);
    await policy(jar.B2, 'USR-TEAM-003', { rooms: true });
    expect((await j(await call(jar.S2, 'GET', '/api/client-rooms'))).rooms.some((r: any) => r.id === roomId)).toBe(false);
    expect((await call(jar.S2, 'GET', `/api/client-rooms/${roomId}`)).status).toBe(404);
    // the client signs in with the code the member reads out
    const cl = client();
    await cl.go('POST', `${link}/otp`, { phone });
    const code = (await j(await call(jar.S1, 'GET', `/api/client-rooms/${roomId}`))).room.codeForClient;
    expect(code).toMatch(/^\d{6}$/);
    expect((await cl.go('POST', `${link}/verify`, { code })).status).toBe(303);
    // the member writes; the client sees who wrote and that the office team can read the chat
    const m = await j(await call(jar.S1, 'POST', `/api/client-rooms/${roomId}/messages`, { text: 'Namaste, I am from the office — sending homes today.' }));
    expect(m.room.messages.at(-1)).toMatchObject({ from: 'BROKER', byName: 'Rakesh Dewangan' });
    const page = await cl.go('GET', link);
    expect(page.text).toContain('Rakesh Dewangan');
    expect(page.text).toContain('office team');
    // the broker himself writing is shown as the broker
    const m2 = await j(await call(jar.B1, 'POST', `/api/client-rooms/${roomId}/messages`, { text: 'Main khud aaunga visit par.' }));
    expect(m2.room.messages.at(-1).byName).toBeUndefined();
  });
  it('the member cannot close the room; the broker can', async () => {
    const r = await call(jar.S1, 'POST', `/api/client-rooms/${roomId}/close`);
    expect(r.status).toBe(403); expect((await j(r)).code).toBe('STAFF_CANNOT_CLOSE');
    expect((await call(jar.B1, 'POST', `/api/client-rooms/${roomId}/close`)).status).toBe(200);
  });
  it('switching rooms off takes the screen away at once', async () => {
    await policy(jar.B1, 'USR-TEAM-002', { rooms: false });
    expect((await call(jar.S1, 'GET', '/api/client-rooms')).status).toBe(403);
    await policy(jar.B1, 'USR-TEAM-002', { rooms: true });
  });
});

describe('client list', () => {
  it('the member works the broker\'s client cards; numbers only with "always visible"; no deleting', async () => {
    const before = (await j(await call(jar.B1, 'GET', '/api/daily/clients'))).clients.length;
    const add = await call(jar.S1, 'POST', '/api/daily/clients', { name: 'Walk-in Kavita', phone: '9131200077', budgetMin: 2000000, budgetMax: 3000000, city: 'Raipur', consent: true });
    expect(add.status, await add.clone().text()).toBe(200);
    const card = (await j(add)).client;
    const mine = (await j(await call(jar.B1, 'GET', '/api/daily/clients'))).clients;
    expect(mine.length).toBe(before + 1);
    const seen = mine.find((c: any) => c.id === card.id);
    expect(seen.phone).toContain('9131200077');
    expect(seen.timeline[0].text).toContain('Rakesh Dewangan');
    // numbers hidden from the member when the broker says so
    await policy(jar.B1, 'USR-TEAM-002', { phoneMode: 'HIDDEN' });
    const list = (await j(await call(jar.S1, 'GET', '/api/daily/clients'))).clients;
    const masked = list.find((c: any) => c.id === card.id);
    expect(masked.phoneHidden).toBe(true);
    expect(JSON.stringify(list)).not.toContain('9131200077');
    expect(JSON.stringify(await j(await call(jar.S1, 'GET', '/api/daily/clients/due')))).not.toContain('9131200077');
    // a note and a stage change are his; deleting stays with the broker
    const n = await j(await call(jar.S1, 'POST', `/api/daily/clients/${card.id}/note`, { text: 'Called, will visit Sunday' }));
    expect(n.client.timeline[0].text).toContain('Rakesh Dewangan');
    const del = await call(jar.S1, 'DELETE', `/api/daily/clients/${card.id}`);
    expect(del.status).toBe(403);
    // another broker's staff with the list switched on sees only HIS broker's clients
    await policy(jar.B2, 'USR-TEAM-003', { clients: true });
    expect(JSON.stringify(await j(await call(jar.S2, 'GET', '/api/daily/clients')))).not.toContain(card.id);
    expect((await call(jar.B1, 'DELETE', `/api/daily/clients/${card.id}`)).status).toBe(200);
    await policy(jar.B1, 'USR-TEAM-002', { phoneMode: 'FULL', clients: false });
    expect((await call(jar.S1, 'GET', '/api/daily/clients')).status).toBe(403);
  });
});
