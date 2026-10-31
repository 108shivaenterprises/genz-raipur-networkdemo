import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * v20 — fast + stable at network scale: paged audit trail with incremental chain check (and no silent re-seal),
 * bounded match matrix, listings / needs that start "mine + newest" and are searched on the server, a slim cached
 * people directory with ETag, masked client names of other brokers, crash / slow-request monitor, and a guard that
 * every record has an id (the PostgreSQL store needs it — activity days had none).
 */
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess | null = null; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const root = path.resolve(import.meta.dirname, '..');
async function start() {
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true', BOOT_LISTINGS: '2', BOOT_REQUIREMENTS: '1' }, stdio: 'ignore',
  });
  cfg = null;
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  const sup = cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN')?.id || 'USR-SUPERADMIN';
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', OWN: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1', SUP: sup, BUYER: 'USR-BUYER-001' })) jar[k] = await login(id);
}
async function stop() {
  if (!proc) return;
  const p = proc; proc = null;
  await new Promise<void>(res => { p.once('exit', () => res()); p.kill('SIGTERM'); setTimeout(res, 8000); });
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v20-'));
  mkdirSync(path.join(dir, 'data'));
  await start();
}, 60000);
afterAll(async () => { await stop(); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('audit trail: one page at a time, searchable, chain checked incrementally', () => {
  it('pages newest-first with a cursor, filters by text and says how many match', async () => {
    for (let i = 0; i < 3; i++) expect((await call(jar.SUP, 'PUT', '/api/admin/settings', { defaultProtectionPeriodDays: 90 + (i % 2) })).status).toBe(200);
    const p1 = await j(await call(jar.SUP, 'GET', '/api/audit-logs?limit=10'));
    expect(p1.events.length).toBe(10);
    expect(p1.total).toBeGreaterThan(10);
    expect(p1.hasMore).toBe(true);
    expect(p1.events[0].id).toBeGreaterThan(p1.events[9].id); // newest first
    const p2 = await j(await call(jar.SUP, 'GET', `/api/audit-logs?limit=10&before=${p1.nextBefore}`));
    expect(p2.events[0].id).toBeLessThan(p1.events[9].id);
    const q = await j(await call(jar.SUP, 'GET', '/api/audit-logs?q=PLATFORM_SETTINGS_UPDATED'));
    expect(q.events.length).toBeGreaterThanOrEqual(2);
    expect(q.events.every((e: any) => e.action === 'PLATFORM_SETTINGS_UPDATED')).toBe(true);
    expect(q.integrity.isValid).toBe(true);
    const full = await j(await call(jar.SUP, 'GET', '/api/audit-logs?limit=10&full=1'));
    expect(full.integrity.isValid).toBe(true);
    expect(full.integrity.checkedCount).toBe(full.events[0].id); // ids are 1..n
  });
  it('a broker still sees only his own lines', async () => {
    const r = await j(await call(jar.BRK2, 'GET', '/api/audit-logs?limit=200'));
    expect(r.events.some((e: any) => e.action === 'PLATFORM_SETTINGS_UPDATED')).toBe(false);
  });
});

describe('match matrix cannot freeze the server any more', () => {
  it('a broker gets only pairs that touch his listings or his clients; admins get a bounded answer', async () => {
    const t = Date.now();
    const b = await j(await call(jar.BRK1, 'GET', '/api/matching/matrix'));
    expect(Date.now() - t).toBeLessThan(3000);
    expect(b.success).toBe(true);
    const myProps = new Set(((await j(await call(jar.BRK1, 'GET', '/api/properties'))).properties as any[]).filter(p => p.listingBrokerId === 'USR-BRK-001').map(p => p.id));
    for (const m of b.matches) expect(myProps.has(m.propertyId) || m.requirementBrokerId === 'USR-BRK-001').toBe(true);
    const a = await j(await call(jar.ADMIN, 'GET', '/api/matching/matrix'));
    expect(a.matches.length).toBeLessThanOrEqual(500);
  });
});

describe('listings and buyer needs start small and are searched on the server', () => {
  it('scope=boot keeps everything that is mine and caps the rest; total + facets come along', async () => {
    const all = await j(await call(jar.BRK1, 'GET', '/api/properties'));
    expect(all.total).toBe(all.properties.length);
    const boot = await j(await call(jar.BRK1, 'GET', '/api/properties?scope=boot'));
    if (all.total > 2) {
      expect(boot.scoped).toBe(true);
      expect(boot.total).toBe(all.total);
      const mine = all.properties.filter((p: any) => p.listingBrokerId === 'USR-BRK-001').map((p: any) => p.id);
      for (const id of mine) expect(boot.properties.some((p: any) => p.id === id)).toBe(true);
      expect(Array.isArray(boot.facets.cities)).toBe(true);
    }
    const page = await j(await call(jar.BRK1, 'GET', '/api/properties?limit=1&offset=0'));
    expect(page.properties.length).toBe(1);
    expect(page.hasMore).toBe(all.total > 1);
    const first = all.properties[0];
    const found = await j(await call(jar.BRK1, 'GET', `/api/properties?q=${encodeURIComponent(first.id)}&limit=5`));
    expect(found.properties.some((p: any) => p.id === first.id)).toBe(true);
  });
  it('another broker’s client shows by initials only (no full name, phone or customer id)', async () => {
    const r = await j(await call(jar.BRK2, 'GET', '/api/requirements'));
    const other = (r.requirements as any[]).filter(x => x.assignedBrokerId && x.assignedBrokerId !== 'USR-BRK-002');
    expect(other.length).toBeGreaterThan(0);
    for (const x of other) {
      expect(x.customerName).toMatch(/^([A-Z]\.\s?)+$|^Client$/);
      expect(x.customerId).toBeUndefined();
      expect(String(x.customerPhone)).not.toMatch(/^\+?\d{10,}$/);
    }
    const mine = await j(await call(jar.BRK2, 'GET', '/api/requirements?mine=1'));
    for (const x of mine.requirements) expect(x.assignedBrokerId).toBe('USR-BRK-002');
    const boot = await j(await call(jar.BRK2, 'GET', '/api/requirements?scope=boot'));
    if (r.total > 1) { expect(boot.scoped).toBe(true); expect(boot.total).toBe(r.total); }
  });
});

describe('people directory: short cards, built once, revalidated with an ETag', () => {
  it('a broker gets cards without contact details, referral codes or last-login, and a 304 on an unchanged reload', async () => {
    const r = await call(jar.BRK1, 'GET', '/api/auth/users');
    expect(r.status).toBe(200);
    const tag = r.headers.get('etag'); expect(tag).toBeTruthy();
    expect(r.headers.get('cache-control')).toMatch(/no-cache/);
    const body = await r.json();
    const others = (body.users as any[]).filter(u => u.id !== 'USR-BRK-001');
    expect(others.length).toBeGreaterThan(3);
    for (const u of others) for (const k of ['email', 'phone', 'referralCode', 'lastLoginAt', 'panNumber', 'aadhaarLast4', 'trustDetails', 'verificationNotes']) expect(u[k], `${u.id}.${k}`).toBeUndefined();
    expect(others.some(u => typeof u.trustScore === 'number')).toBe(true);
    const again = await call(jar.BRK1, 'GET', '/api/auth/users', undefined, { 'if-none-match': tag! });
    expect(again.status).toBe(304);
  });
  it('admins still get the full list (with e-mail), never stored by the browser', async () => {
    const r = await call(jar.ADMIN, 'GET', '/api/auth/users');
    expect(r.headers.get('cache-control')).toMatch(/no-store/);
    const body = await r.json();
    expect((body.users as any[]).some(u => u.email)).toBe(true);
  });
});

describe('health monitor (no outside service)', () => {
  it('phones can report a crash (even before sign-in); only the superadmin reads the health page', async () => {
    const rep = await fetch(B + '/api/client-errors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'render', area: 'deals', message: 'Cannot read properties of undefined (reading x) 9876543210', stack: 'at X' }) });
    expect(rep.status).toBe(204);
    expect((await call(jar.BRK1, 'GET', '/api/admin/health')).status).toBe(403);
    const h = await j(await call(jar.SUP, 'GET', '/api/admin/health'));
    expect(h.health.counts.client).toBeGreaterThanOrEqual(1);
    expect(h.health.client[0].detail).toContain('[n]'); // long numbers are blanked
    expect(h.health.eventLoopLagMs).toBeTruthy();
    expect(['OK', 'WARN']).toContain(h.health.status);
  });
});

describe('map pins one city at a time; connector desk list capped', () => {
  it('map answers with a city and the list of cities', async () => {
    const m = await j(await call(jar.BRK1, 'GET', '/api/daily/map'));
    expect(m.city).toBeTruthy();
    expect(Array.isArray(m.cities)).toBe(true);
    const all = await j(await call(jar.BRK1, 'GET', '/api/daily/map?city=ALL'));
    expect(all.pins.length).toBeGreaterThanOrEqual(m.pins.length);
  });
  it('referral list carries the total', async () => {
    const r = await j(await call(jar.SUP, 'GET', '/api/connector/referrals?limit=2'));
    expect(r.referrals.length).toBeLessThanOrEqual(2);
    expect(r.total).toBeGreaterThanOrEqual(r.referrals.length);
  });
});

describe('stability guards', () => {
  it('every stored record has an id (the PostgreSQL store keys rows by it — activity days used to have none)', async () => {
    await call(jar.BRK1, 'GET', '/api/properties'); // marks today as active
    await new Promise(r => setTimeout(r, 1200)); // let the coalesced write land
    const st = JSON.parse(readFileSync(path.join(dir, 'data', 'database.json'), 'utf8'));
    for (const [k, v] of Object.entries(st)) {
      if (!Array.isArray(v)) continue;
      const bad = (v as any[]).filter(x => !x || x.id === undefined || x.id === null || x.id === '');
      expect(bad.length, `${k} has records without id`).toBe(0);
    }
  });
  it('a hand-edited audit line is NOT silently re-sealed on restart: the broken chain stays visible', async () => {
    await stop();
    const file = path.join(dir, 'data', 'database.json');
    const st = JSON.parse(readFileSync(file, 'utf8'));
    expect(st.settings.auditChainSealedAt).toBeTruthy();
    st.auditEvents[1].details = st.auditEvents[1].details + ' (edited by hand)';
    writeFileSync(file, JSON.stringify(st));
    await start();
    const r = await j(await call(jar.SUP, 'GET', '/api/audit-logs?limit=5&full=1'));
    expect(r.integrity.isValid).toBe(false);
    expect(r.integrity.brokenEventId).toBe(st.auditEvents[1].id);
    const after = JSON.parse(readFileSync(file, 'utf8'));
    expect(after.auditEvents.some((e: any) => e.action === 'AUDIT_CHAIN_RESEALED' && e.id > st.auditEvents[st.auditEvents.length - 1].id)).toBe(false);
  }, 60000);
});
