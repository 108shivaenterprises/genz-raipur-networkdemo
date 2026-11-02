import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { freePort } from './helpers/port';
import { planInventory, findUnits, amountIn, summaryText } from '../src/shared/invCopilot';

const units = [
  { id: 'U1', label: 'A-10', status: 'AVAILABLE', price: 7_000_000, config: '2 BHK' },
  { id: 'U2', label: 'A-101', status: 'AVAILABLE', price: 8_500_000, config: '3 BHK' },
  { id: 'U3', label: 'A-102', status: 'HOLD', price: 8_600_000, config: '3 BHK' },
  { id: 'U4', label: 'A-103', status: 'BOOKED', price: 8_700_000, config: '3 BHK' },
];
const p = (s: string, canManage = true) => planInventory(s, { units, canManage });

describe('v111 inventory planner', () => {
  it('the longest unit name wins; amounts read lakh / crore / plain', () => {
    expect(findUnits('A-101 ka rate', units).map(u => u.id)).toEqual(['U2']);
    expect(findUnits('a10 dekho', units).map(u => u.id)).toEqual(['U1']);
    expect(amountIn('85 lakh')).toBe(8_500_000); expect(amountIn('1.2 cr')).toBe(12_000_000); expect(amountIn('8500000')).toBe(8_500_000); expect(amountIn('rate 500')).toBe(0);
  });
  it('builder: rate and reserve become plans; a big jump is flagged', () => {
    expect(p('A-101 ka rate 86 lakh karo')).toMatchObject({ kind: 'PRICE', unitId: 'U2', price: 8_600_000 });
    expect((p('A-101 ka rate 120 lakh karo') as any).warn).toBeTruthy();
    expect(p('A-101 reserve karo')).toMatchObject({ kind: 'STATUS', unitId: 'U2', status: 'RESERVED' });
    expect(p('A-101 ka rate badlo').kind).toBe('ASK');
  });
  it('held / booked units cannot be changed; nothing is planned', () => {
    expect(p('A-102 reserve karo').kind).toBe('INFO');
    expect(p('A-103 ka rate 90 lakh karo').kind).toBe('INFO');
  });
  it('a partner can only ask — and a hold is sent to the grid', () => {
    expect(p('A-101 ka rate 86 lakh karo', false).kind).toBe('INFO');
    expect(p('A-101 hold karo', false).kind).toBe('INFO');
    expect(p('kitne flat bache hain', false).kind).toBe('SHOW_SUMMARY');
    expect(p('A-101 ka status', false)).toMatchObject({ kind: 'SHOW_UNIT', unitId: 'U2' });
    expect(summaryText(units)).toContain('2 available');
  });
  it('unknown unit or nonsense never writes', () => {
    expect(p('rate 85 lakh karo').kind).toBe('ASK');
    expect(p('hello').kind).toBe('UNKNOWN');
  });
});

// ───────── end to end: the builder's plan is accepted by the real grid endpoint; a partner's is refused ─────────
const PORT = await freePort(); const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v111-')); mkdirSync(path.join(dir, 'data'));
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

describe('v111 inventory copilot end to end', () => {
  it('builder rate + reserve + free go through; a broker is refused', async () => {
    const bld = await as('USR-BUILDER-001');
    const projs = (await bld('GET', '/api/inventory/projects')).j.projects;
    let proj: any = null;
    for (const pr of projs) { const d = (await bld('GET', `/api/inventory/projects/${pr.id}`)).j; if ((d.units || []).some((u: any) => u.status === 'AVAILABLE')) { proj = d; break; } }
    expect(proj, 'a demo project with an available unit').toBeTruthy();
    const us = proj.units.map((u: any) => ({ id: u.id, label: u.label, code: u.code, status: u.status, price: u.price, config: u.config }));
    const target = us.find((u: any) => u.status === 'AVAILABLE');
    const pr: any = planInventory(`${target.label} ka rate ${Math.round((target.price * 1.05) / 1e5)} lakh karo`, { units: us, canManage: true });
    expect(pr.kind).toBe('PRICE');
    expect((await bld('PUT', `/api/inventory/units/${pr.unitId}`, { price: pr.price, reason: 'Copilot' })).status).toBe(200);
    const rs: any = planInventory(`${target.label} reserve karo`, { units: us, canManage: true });
    expect(rs.kind).toBe('STATUS');
    expect((await bld('PUT', `/api/inventory/units/${rs.unitId}`, { status: rs.status })).status).toBe(200);
    const fr: any = planInventory(`${target.label} available karo`, { units: us.map((u: any) => u.id === target.id ? { ...u, status: 'RESERVED' } : u), canManage: true });
    expect(fr).toMatchObject({ kind: 'STATUS', status: 'AVAILABLE' });
    expect((await bld('PUT', `/api/inventory/units/${fr.unitId}`, { status: fr.status })).status).toBe(200);
    const brk = await as('USR-BRK-001');
    expect((await brk('PUT', `/api/inventory/units/${target.id}`, { price: 1_000_000 })).status).not.toBe(200);
  }, 90_000);
});
