import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { freePort } from './helpers/port';
import { planCommand } from '../src/shared/copilotRules';

// 10 worked examples of the "one client, three places" rule, through the real server, as real brokers.
const PORT = await freePort(); const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v113x-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], { cwd: dir, stdio: 'ignore', env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' } });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
}, 120_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

async function as(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  const ck = r.headers.get('set-cookie')!.split(';')[0];
  return (m: string, u: string, b?: unknown) => fetch(B + u, { method: m, headers: { 'content-type': 'application/json', cookie: ck }, body: b ? JSON.stringify(b) : undefined }).then(async x => ({ status: x.status, j: await x.json().catch(() => ({})) }));
}
const base = { budgetMin: 0, budgetMax: 0, city: 'Raipur', areas: [] as string[], propertyType: '2 BHK Flat', transactionType: 'Sale', tags: [], notes: '', consent: true };

describe('v113 — 10 worked examples', () => {
  it('Hinglish lines: the area is read before or after me / in / area (6 lines)', () => {
    const lines: [string, string][] = [
      ['new client Amit 9826012345 budget 5 cr shankar nagar me independent house', 'shankar nagar'],
      ['Amit 9826012345 5 cr budget Shankar Nagar mein house chahiye new client', 'Shankar Nagar'],
      ['naya client Mohan 9826012346 budget 60 lakh 2bhk in Pandri', 'Pandri'],
      ['Ramdulri new client 7000458838 budget 50 lakh plot in sejbahar', 'sejbahar'],
      ['naya client Kavita 9826012347 area Telibandha budget 40 lakh', 'Telibandha'],
      ['new client Sunil 9826012348 budget 30 lakh Kachna mai flat', 'Kachna'],
    ];
    for (const [t, area] of lines) expect((planCommand(t, { clients: [], listings: [] }) as any).body?.areas, t).toEqual([area]);
  });

  it('1-5: client → need → match, edit, stage, duplicate', async () => {
    const b1 = await as('USR-BRK-001');
    const needs = async () => (await b1('GET', '/api/requirements')).j.requirements as any[];
    const clients = async () => (await b1('GET', '/api/daily/clients')).j.clients as any[];
    const needOf = async (ph: string) => (await needs()).filter(q => String(q.customerPhone) === ph);

    // 1 — the Copilot line for Amit: area lands on the card AND on the need
    const plan: any = planCommand('new client Amit 9826012345 budget 5 cr shankar nagar me independent house', { clients: [], listings: [] });
    expect((await b1('POST', '/api/daily/clients', { ...plan.body, consent: true })).status).toBe(200);
    let n = await needOf('9826012345'); expect(n).toHaveLength(1);
    expect(n[0].preferredLocalities.map((x: string) => x.toLowerCase())).toContain('shankar nagar');
    expect(n[0].budgetMax).toBe(50_000_000);

    // 2 — no budget at all: still in Buyers, and Match still answers with homes
    await b1('POST', '/api/daily/clients', { ...base, name: 'No Budget Ji', phone: '9826012349', areas: ['Pandri'] });
    n = await needOf('9826012349'); expect(n).toHaveLength(1);
    const m = await b1('GET', `/api/matching/requirement/${n[0].id}`); expect(m.status).toBe(200);
    expect((m.j.matches || []).length).toBeGreaterThan(0);

    // 3 + 4 — edit the budget and the area on the card: the need follows
    const c = (await clients()).find(x => x.name === 'No Budget Ji');
    await b1('PUT', `/api/daily/clients/${c.id}`, { budgetMin: 2_000_000, budgetMax: 4_000_000, areas: ['Shankar Nagar'] });
    n = await needOf('9826012349'); expect(n).toHaveLength(1);
    expect(n[0].budgetMax).toBe(4_000_000); expect(n[0].preferredLocalities).toEqual(['Shankar Nagar']);

    // 5 — same mobile again is refused, and no second need appears
    expect((await b1('POST', '/api/daily/clients', { ...base, name: 'Dup', phone: '9826012349' })).status).toBe(409);
    expect(await needOf('9826012349')).toHaveLength(1);
  }, 90_000);

  it('6-8: DEAL, LOST, and a need that arrives first', async () => {
    const b1 = await as('USR-BRK-001');
    const needs = async () => (await b1('GET', '/api/requirements')).j.requirements as any[];
    const clients = async () => (await b1('GET', '/api/daily/clients')).j.clients as any[];
    // 6 — DEAL → need fulfilled
    await b1('POST', '/api/daily/clients', { ...base, name: 'Deal Wala', phone: '9826012351', budgetMax: 5_000_000 });
    let c = (await clients()).find(x => x.name === 'Deal Wala');
    await b1('POST', `/api/daily/clients/${c.id}/stage`, { stage: 'DEAL' });
    expect((await needs()).find(q => q.customerPhone === '9826012351').status).toBe('fulfilled');
    // 7 — LOST (with a reason) → need closed
    await b1('POST', '/api/daily/clients', { ...base, name: 'Lost Wala', phone: '9826012352', budgetMax: 5_000_000 });
    c = (await clients()).find(x => x.name === 'Lost Wala');
    expect((await b1('POST', `/api/daily/clients/${c.id}/stage`, { stage: 'LOST' })).status).toBe(400);   // no reason, no loss
    await b1('POST', `/api/daily/clients/${c.id}/stage`, { stage: 'LOST', lostReason: 'budget kam' });
    expect((await needs()).find(q => q.customerPhone === '9826012352').status).toBe('closed');
    // 8 — a need added in Buyers first → the client card exists
    const r = await b1('POST', '/api/requirements', { customerName: 'Need Pehle', customerPhone: '9826012353', budgetMin: 2_000_000, budgetMax: 3_000_000, city: 'Raipur', preferredLocalities: ['Pandri'], propertyType: 'Residential Flat', transactionType: 'Sale', purpose: 'Self-use', urgency: 'Moderate (1-3 months)' });
    expect(r.status, JSON.stringify(r.j)).toBe(200);
    expect((await clients()).filter(x => x.name === 'Need Pehle')).toHaveLength(1);
  }, 90_000);

  it('9-10: the room shows on the card; another broker sees only initials', async () => {
    const b1 = await as('USR-BRK-001');
    await b1('POST', '/api/daily/clients', { ...base, name: 'Room Wala', phone: '9826012354', budgetMax: 5_000_000 });
    // 9 — open a room for that mobile (with consent) → the card carries the room id
    expect((await b1('POST', '/api/client-rooms', { clientName: 'Room Wala', phone: '9826012354', kind: 'BUYER', consent: true })).status).toBe(200);
    const c = ((await b1('GET', '/api/daily/clients')).j.clients as any[]).find(x => x.name === 'Room Wala');
    expect(c.roomId).toBeTruthy(); expect(c.needId).toBeTruthy();
    // 10 — the owner broker sees the full name + number; a different broker sees initials + a masked number
    const mine = ((await b1('GET', '/api/requirements')).j.requirements as any[]).find(q => q.id === c.needId);
    expect(mine.customerName).toBe('Room Wala'); expect(String(mine.customerPhone)).toBe('9826012354');
    const other = cfg.demoAccounts.find((a: any) => a.role === 'BROKER' && a.id !== 'USR-BRK-001');
    expect(other, 'a second demo broker').toBeTruthy();
    const b2 = await as(other.id);
    const seen = ((await b2('GET', '/api/requirements')).j.requirements as any[]).find(q => q.id === c.needId);
    if (seen) { expect(seen.customerName).not.toBe('Room Wala'); expect(String(seen.customerPhone)).not.toBe('9826012354'); }
  }, 90_000);
});
