import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normCity, cityStage, badgesFor, TOP_CITIES } from '../src/shared/cities';

/** v10: invite loop, public waitlist, public card, city launch board, forgot-password queue, coalesced DB writes. */
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess;
let dir: string;
let cfg: any;
const jar: Record<string, string> = {};

async function loginRaw(id: string, password?: string) {
  return fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: id, password: password || cfg.demoPassword }) });
}
async function login(id: string, password?: string) {
  const r = await loginRaw(id, password);
  expect(r.status).toBe(200);
  return r.headers.get('set-cookie')!.split(';')[0];
}
const call = (cookie: string | undefined, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const byId = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
/** solved spam-check answers (each works once, and not sooner than 2 s after it was issued) */
let pool: { challengeToken: string; challengeAnswer: number }[] = [];
const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v10-'));
  mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ }
    await new Promise(r => setTimeout(r, 250));
  }
  expect(cfg).toBeTruthy();
  const issued = await Promise.all(Array.from({ length: 10 }, async () => (await fetch(B + '/api/growth/public/challenge')).json()));
  await new Promise(r => setTimeout(r, 2200));
  pool = issued.map((c: any) => ({ challengeToken: c.token, challengeAnswer: c.question.split(' + ').reduce((a: number, b: string) => a + Number(b), 0) }));
  jar.BRK1 = await login(byId('USR-BRK-001').email);
  jar.BRK2 = await login(byId('USR-BRK-002').email);
  jar.ADMIN = await login(byId('USR-ADMIN-1').email);
  jar.OWNER = await login(byId('USR-OWNER-001').email);
  jar.CON = await login(cfg.demoAccounts.find((a: any) => a.role === 'GENZ_CONNECTOR').email);
  jar.TADM = await login(byId('USR-TEAM-011').email);
}, 30000);
afterAll(() => { proc?.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

describe('city helpers', () => {
  it('normalises names and aliases', () => {
    expect(normCity('  gurgaon ')).toBe('Gurugram');
    expect(normCity('NAYA RAIPUR')).toBe('Raipur');
    expect(normCity('bangalore')).toBe('Bengaluru');
    expect(normCity('shivpuri city')).toBe('Shivpuri City');
    expect(normCity('<script>')).toBe('Script');
  });
  it('has a launch ladder and badges', () => {
    expect(cityStage(0)).toBe('WAITLIST'); expect(cityStage(5)).toBe('SEEDING'); expect(cityStage(15)).toBe('LIVE'); expect(cityStage(40)).toBe('HUB');
    expect(badgesFor(0).earned).toHaveLength(0); expect(badgesFor(3).earned.map(b => b.id)).toEqual(['CONNECTOR', 'BUILDER']); expect(badgesFor(3).next?.remaining).toBe(7);
    expect(new Set(TOP_CITIES.map(c => c.name)).size).toBe(TOP_CITIES.length);
  });
});

describe('public waitlist', () => {
  const body = (extra: any = {}) => ({ name: 'Test Person', phone: rnd(), city: 'nagpur', role: 'BROKER', consent: true, ...pool.shift(), ...extra });
  it('needs consent and rejects the honeypot', async () => {
    expect((await call(undefined, 'POST', '/api/growth/public/waitlist', body({ consent: false }))).status).toBe(400);
    expect((await call(undefined, 'POST', '/api/growth/public/waitlist', body({ website: 'http://spam' }))).status).toBe(400);
  });
  it('accepts a request, keeps the answer generic for known numbers, and attributes a valid ref code', async () => {
    const ok = await j(await call(undefined, 'POST', '/api/growth/public/waitlist', body()));
    expect(ok.success).toBe(true);
    const known = await j(await call(undefined, 'POST', '/api/growth/public/waitlist', body({ phone: '9826144001' }))); // an existing demo user's number
    expect(known.message).toBe(ok.message);
    const p = rnd();
    await call(undefined, 'POST', '/api/growth/public/waitlist', body({ phone: p, ref: 'GZ-VIKR-1001', name: 'Via Vikram' }));
    const q = await j(await call(jar.ADMIN, 'GET', '/api/growth/queue?status=NEW'));
    const lead = q.leads.find((l: any) => l.name === 'Via Vikram');
    expect(lead.source).toBe('NOMINATION');
    expect(lead.nominatorId).toBe('USR-BRK-001');
    expect(lead.city).toBe('Nagpur');
  });
  it('is invisible to non-ops', async () => {
    expect((await call(jar.BRK1, 'GET', '/api/growth/queue')).status).toBe(403);
    expect((await call(jar.TADM, 'GET', '/api/growth/queue')).status).toBe(403);
    expect((await call(undefined, 'GET', '/api/growth/queue')).status).toBe(401);
  });
});

describe('nominations → invitation → joined', () => {
  const phone = rnd();
  let leadId = ''; let code = '';
  it('only professionals can nominate; owners, connectors and ops-staff cannot', async () => {
    for (const k of ['OWNER', 'CON', 'TADM']) expect((await call(jar[k], 'GET', '/api/growth/me')).status).toBe(403);
    expect((await call(jar.BRK1, 'GET', '/api/growth/me')).status).toBe(200);
  });
  it('validates and de-duplicates', async () => {
    const base = { name: 'Rakesh Contractor', phone, city: 'Bhilai', role: 'CONTRACTOR', consent: true };
    expect((await call(jar.BRK1, 'POST', '/api/growth/nominations', { ...base, consent: false })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', '/api/growth/nominations', { ...base, phone: byId('USR-BRK-001') ? '9826144001' : phone })).status).toBe(409); // already on GENZ
    const ok = await call(jar.BRK1, 'POST', '/api/growth/nominations', base);
    expect(ok.status).toBe(200);
    leadId = (await j(ok)).lead.id;
    expect((await call(jar.BRK2, 'POST', '/api/growth/nominations', base)).status).toBe(409);
  });
  it('ops approve → phone-bound invitation; the nominee registers and is linked to the nominator', async () => {
    const a = await j(await call(jar.ADMIN, 'POST', `/api/growth/queue/${leadId}/approve`, {}));
    expect(a.success).toBe(true);
    code = a.invitation.code;
    expect(a.whatsappText).toContain(code);
    expect((await call(jar.ADMIN, 'POST', `/api/growth/queue/${leadId}/approve`, {})).status).toBe(409);
    const reg = await call(undefined, 'POST', '/api/auth/register-invite', { code, name: 'Rakesh Contractor', phone, password: 'Strong@Pass2026', city: 'bhilai', consent: true });
    expect(reg.status).toBe(200);
    const me = await j(await call(jar.BRK1, 'GET', '/api/growth/me'));
    expect(me.stats.joined).toBeGreaterThanOrEqual(1);
    const row = me.pipeline.find((p: any) => p.id === leadId);
    expect(row.status).toBe('JOINED');
    expect(me.checklist.find((c: any) => c.id === 'nominate').done).toBe(true);
  });
  it('a rejected lead stays out and cannot be approved', async () => {
    const p2 = rnd();
    const lead = (await j(await call(jar.BRK2, 'POST', '/api/growth/nominations', { name: 'No Thanks', phone: p2, city: 'Indore', role: 'BROKER', consent: true }))).lead;
    expect((await call(jar.ADMIN, 'POST', `/api/growth/queue/${lead.id}/reject`, { reason: 'unverifiable' })).status).toBe(200);
    expect((await call(jar.ADMIN, 'POST', `/api/growth/queue/${lead.id}/approve`, {})).status).toBe(409);
  });
});

describe('public visiting card', () => {
  it('shows an opted-in, verified professional and nothing private', async () => {
    const r = await fetch(B + '/c/GZ-VIKR-1001');
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('GENZ Verified');
    expect(html).toContain('noindex');
    expect(html).toContain('/?ref=GZ-VIKR-1001');
    expect(html).not.toMatch(/commission|passwordHash|@phone\.genz\.local/i);
  });
  it('is 404 when not opted in, and escapes the headline', async () => {
    const me2 = await j(await call(jar.BRK2, 'GET', '/api/growth/me'));
    expect((await fetch(B + '/c/' + me2.code)).status).toBe(404);
    const up = await call(jar.BRK2, 'PUT', '/api/growth/card', { enabled: true, showPhone: false, headline: '<script>alert(1)</script>' });
    expect(up.status).toBe(200);
    const html = await (await fetch(B + '/c/' + me2.code)).text();
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('href="tel:'); // phone hidden unless opted in
    await call(jar.BRK2, 'PUT', '/api/growth/card', { enabled: false, showPhone: false });
    expect((await fetch(B + '/c/' + me2.code)).status).toBe(404);
    expect((await fetch(B + '/c/NOPE')).status).toBe(404);
  });
});

describe('city launch board', () => {
  it('ops see stages, demand and the next city; others do not', async () => {
    const b = await j(await call(jar.ADMIN, 'GET', '/api/growth/cities'));
    const raipur = b.cities.find((c: any) => c.city === 'Raipur');
    expect(raipur.verifiedPros).toBeGreaterThanOrEqual(5);
    expect(['SEEDING', 'LIVE']).toContain(raipur.stage);
    const nagpur = b.cities.find((c: any) => c.city === 'Nagpur');
    expect(nagpur.waitlist).toBeGreaterThan(0);
    expect(nagpur.stage).toBe('WAITLIST');
    expect(b.nextCity).toBeTruthy();
    expect(b.cities.length).toBeGreaterThanOrEqual(TOP_CITIES.length);
    expect(b.topInviters[0].verified).toBeGreaterThanOrEqual(1);
    expect((await call(jar.BRK1, 'GET', '/api/growth/cities')).status).toBe(403);
  });
});

describe('forgot password', () => {
  it('answers the same for known and unknown numbers, then ops issue a one-time password', async () => {
    const a = await j(await call(undefined, 'POST', '/api/growth/public/forgot', { phone: '9826144001' }));
    const b = await j(await call(undefined, 'POST', '/api/growth/public/forgot', { phone: rnd() }));
    expect(a.message).toBe(b.message);
    const u = await j(await call(jar.BRK1, 'GET', '/api/auth/me'));
    const phone = String(u.user.phone).replace(/\D/g, '').slice(-10);
    expect((await call(undefined, 'POST', '/api/growth/public/forgot', { phone })).status).toBe(200);
    const q = await j(await call(jar.ADMIN, 'GET', '/api/growth/queue'));
    const req = q.resets.find((x: any) => x.userId === 'USR-BRK-001');
    expect(req).toBeTruthy();
    expect((await call(jar.BRK2, 'POST', `/api/growth/resets/${req.id}/issue`, {})).status).toBe(403);
    const issued = await j(await call(jar.ADMIN, 'POST', `/api/growth/resets/${req.id}/issue`, {}));
    expect(issued.temporaryPassword).toBeTruthy();
    const l = await loginRaw(phone, issued.temporaryPassword);
    expect(l.status).toBe(200);
    expect((await j(l)).mustChangePassword).toBe(true);
    expect((await call(jar.ADMIN, 'POST', `/api/growth/resets/${req.id}/issue`, {})).status).toBe(404); // single use
  });
  it('ops cannot use this to reset an administrator (only a super admin can)', async () => {
    await call(undefined, 'POST', '/api/growth/public/forgot', { phone: '9826144001' }); // the super admin's own number
    const q = await j(await call(jar.ADMIN, 'GET', '/api/growth/queue'));
    const req = q.resets.find((x: any) => x.userId === 'USR-SUPERADMIN');
    expect(req).toBeTruthy();
    expect((await call(jar.ADMIN, 'POST', `/api/growth/resets/${req.id}/issue`, {})).status).toBe(403);
  });
});

describe('database writes are coalesced but durable', () => {
  it('lands on disk shortly after a change', async () => {
    await call(undefined, 'POST', '/api/growth/public/waitlist', { name: 'Disk Check Person', phone: rnd(), city: 'Surat', role: 'BROKER', consent: true, ...pool.shift() });
    await new Promise(r => setTimeout(r, 600));
    const f = path.join(dir, 'data', 'database.json');
    expect(existsSync(f)).toBe(true);
    expect(readFileSync(f, 'utf8')).toContain('Disk Check Person');
  });
});
