/** v37 — Deal Hub: one call for the deals pipeline; same visibility and money rules as /api/deals */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const PORT = 6700 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v37-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', BRK4: 'USR-BRK-004', OWN: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1', LEGAL: 'USR-LEGAL-001' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });


const hub = async (who: string) => { const r = await call(jar[who], 'GET', '/api/deal-hub'); expect(r.status, who).toBe(200); return r.json(); };
describe('deal hub', () => {
  it('lists exactly the deal rooms /api/deals lists, for every role', async () => {
    for (const who of ['BRK1', 'BRK2', 'BRK4', 'OWN', 'ADMIN', 'LEGAL']) {
      const list = await call(jar[who], 'GET', '/api/deals');
      if (list.status === 403) { expect((await call(jar[who], 'GET', '/api/deal-hub')).status, who).toBe(403); continue; }
      const a = (await hub(who)).deals.map((d: any) => d.id).sort();
      const b = (await j(await call(jar[who], 'GET', '/api/deals'))).deals.map((d: any) => d.id).sort();
      expect(a, who).toEqual(b);
    }
    expect((await call(undefined, 'GET', '/api/deal-hub')).status).toBe(401);
  });

  it('a deal broker sees money, his role, the other broker and next steps; KPIs add up', async () => {
    const h = await hub('BRK1');
    expect(h.stages).toContain('Settled');
    const mine = h.deals.filter((d: any) => d.myRole === 'INTRODUCING' || d.myRole === 'CLOSING');
    expect(mine.length).toBeGreaterThan(0);
    for (const d of mine) { expect(d.money).toBeTruthy(); expect(typeof d.money.myShare).toBe('number'); expect(d.propertyTitle).toBeTruthy(); expect(Array.isArray(d.next)).toBe(true); }
    expect(h.kpis.total).toBe(h.deals.length);
    expect(h.kpis.live + h.kpis.settled).toBe(h.kpis.total);
    expect(h.kpis.needsMe).toBe(h.deals.filter((d: any) => d.needsMe).length);
    for (const d of h.deals) for (const n of d.next) expect(typeof n.tab).toBe('string');
  });

  it('the owner never sees the brokers\' money; an admin without a dispute gets the summary only', async () => {
    for (const d of (await hub('OWN')).deals) { expect(d.money).toBeUndefined(); expect(d.agreement).toBeNull(); }
    const lg = await call(jar.LEGAL, 'GET', '/api/deal-hub');
    if (lg.status === 200) for (const d of (await lg.json()).deals) expect(d.money).toBeUndefined();
    const adm = await hub('ADMIN');
    for (const d of adm.deals.filter((x: any) => !x.openDispute)) { expect(d.summaryOnly).toBe(true); expect(d.money).toBeUndefined(); expect(d.tasks).toBeUndefined(); expect(d.lastMessage).toBeUndefined(); }
  });
});
