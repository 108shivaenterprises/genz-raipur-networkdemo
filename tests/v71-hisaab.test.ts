import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** v71 — हिसाब: sale money, each broker's private brokerage book, owner's view. */
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 8000 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (c: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = async (r: Response) => r.json();
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
let jarC: Record<string, string> = {}; let nocookie = false;
const ckStr = () => nocookie ? '' : Object.entries(jarC).map(([k, v]) => `${k}=${v}`).join('; ');
const page = async (method: string, url: string, opt: { form?: Record<string, string>; json?: unknown } = {}) => {
  const r = await fetch(B + url, { method, redirect: 'manual', headers: { ...(opt.form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...(opt.json ? { 'content-type': 'application/json' } : {}), ...(ckStr() ? { cookie: ckStr() } : {}) }, body: opt.form ? new URLSearchParams(opt.form).toString() : opt.json ? JSON.stringify(opt.json) : undefined });
  const sc = (r.headers as any).getSetCookie?.() as string[] | undefined;
  if (sc?.length && !nocookie) for (const c of sc) { const [k, ...v] = c.split(';')[0].split('='); jarC[k] = v.join('='); }
  const text = await r.text(); let js: any; try { js = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, js, type: r.headers.get('content-type') || '' };
};
// a tiny valid PNG
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.alloc(200, 7)]).toString('base64');
const JUNK = Buffer.alloc(300, 65).toString('base64');

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v71-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: 'a1'.repeat(32), SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ B1: 'USR-BRK-001', B2: 'USR-BRK-002', OWN: 'USR-OWNER-001', BLD: 'USR-BUILDER-001' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });



let DEAL = '';
const hs = async (c: string, id = DEAL) => j(await call(c, 'GET', `/api/deals/${id}/hisaab`));
describe('deal accounts', () => {
  it('find a deal of BRK1 + BRK2 + owner', async () => {
    const all = (await j(await call(jar.B1, 'GET', '/api/deals'))).deals as any[];
    const d = all.find(x => x.ownerId === 'USR-OWNER-001' && [x.introducingBrokerId, x.closingBrokerId].includes('USR-BRK-001') && [x.introducingBrokerId, x.closingBrokerId].includes('USR-BRK-002')) || all.find(x => x.ownerId === 'USR-OWNER-001');
    expect(d, JSON.stringify(all.map(x => [x.id, x.ownerId, x.introducingBrokerId, x.closingBrokerId]))).toBeTruthy(); DEAL = d.id;
  });
  it('the deal people see it; a stranger does not; the owner has no brokerage book but sees his own brokerage', async () => {
    const b = await hs(jar.B1); expect(b.hisaab.role).toBe('BROKER'); expect(b.hisaab.sauda.price).toBeGreaterThan(0); expect(b.hisaab.brokerage).toBeTruthy();
    const o = await hs(jar.OWN); expect(o.hisaab.role).toBe('OWNER'); expect(o.hisaab.brokerage).toBeUndefined(); expect(o.hisaab.canRecord).toBe(false);
    expect((await call(jar.BLD, 'GET', `/api/deals/${DEAL}/hisaab`)).status).toBe(403);
  });
  it('validation', async () => {
    const pay = (b: any) => call(jar.B1, 'POST', `/api/deals/${DEAL}/hisaab/payments`, b);
    expect((await pay({ kind: 'PART', amount: 0, mode: 'UPI' })).status).toBe(400);
    expect((await pay({ kind: 'PART', amount: 1000, mode: 'BITCOIN' })).status).toBe(400);
    expect((await pay({ kind: 'WHAT', amount: 1000, mode: 'UPI' })).status).toBe(400);
    expect((await pay({ kind: 'PART', amount: 1000, mode: 'UPI', paidOn: '2099-01-01' })).status).toBe(400);
    expect((await call(jar.OWN, 'POST', `/api/deals/${DEAL}/hisaab/payments`, { kind: 'PART', amount: 1000, mode: 'UPI' })).status).toBe(403);
  });
  let P1 = '';
  it('token + part payment: received and balance move; owner confirms; the writer cannot confirm his own entry', async () => {
    const before = (await hs(jar.B1)).hisaab.sauda;
    const t = await call(jar.B1, 'POST', `/api/deals/${DEAL}/hisaab/payments`, { kind: 'TOKEN', amount: 200000, mode: 'UPI', ref: 'UTR123456', note: 'token' });
    expect(t.status, await t.clone().text()).toBe(200);
    const p = await j(await call(jar.B2, 'POST', `/api/deals/${DEAL}/hisaab/payments`, { kind: 'PART', amount: 500000, mode: 'BANK', ref: 'NEFT778899' }));
    const s = p.hisaab.sauda; P1 = s.entries.find((e: any) => e.kind === 'PART').id;
    expect(s.received).toBe(before.received + 700000); expect(s.balance).toBe(Math.max(0, before.price - s.received)); expect(s.token).toBe(before.token + 200000);
    expect((await call(jar.B2, 'POST', `/api/deals/${DEAL}/hisaab/payments/${P1}/ack`)).status).toBe(403);
    const a = await j(await call(jar.OWN, 'POST', `/api/deals/${DEAL}/hisaab/payments/${P1}/ack`));
    expect(a.hisaab.sauda.entries.find((e: any) => e.id === P1).ack.byName).toBeTruthy();
    expect((await call(jar.B2, 'POST', `/api/deals/${DEAL}/hisaab/payments/${P1}/void`, { reason: 'typo' })).status).toBe(409);
  });
  it('a refund reduces what was received; a cancelled entry is not counted; only its writer can cancel', async () => {
    const r0 = (await hs(jar.B1)).hisaab.sauda.received;
    const rf = await j(await call(jar.B1, 'POST', `/api/deals/${DEAL}/hisaab/payments`, { kind: 'REFUND', amount: 50000, mode: 'UPI' }));
    expect(rf.hisaab.sauda.received).toBe(r0 - 50000);
    const id = rf.hisaab.sauda.entries.find((e: any) => e.kind === 'REFUND').id;
    expect((await call(jar.B2, 'POST', `/api/deals/${DEAL}/hisaab/payments/${id}/void`, { reason: 'not mine' })).status).toBe(403);
    const v = await j(await call(jar.B1, 'POST', `/api/deals/${DEAL}/hisaab/payments/${id}/void`, { reason: 'wrong entry' }));
    expect(v.hisaab.sauda.received).toBe(r0);
  });
  it('each broker has a PRIVATE brokerage book — the other never sees it, nor does any deal response', async () => {
    const b1 = (await hs(jar.B1)).hisaab.brokerage; const b2 = (await hs(jar.B2)).hisaab.brokerage;
    const g = await j(await call(jar.B1, 'POST', `/api/deals/${DEAL}/hisaab/book`, { dir: 'IN', party: 'OWNER', amount: 120000, mode: 'CASH', note: 'advance brokerage' }));
    expect(g.hisaab.brokerage.received).toBe(b1.received + 120000);
    const o = await j(await call(jar.B1, 'POST', `/api/deals/${DEAL}/hisaab/book`, { dir: 'OUT', party: 'OTHER', amount: 20000, mode: 'UPI', ref: 'SHARE001' }));
    expect(o.hisaab.brokerage.paidOut).toBe(20000); expect(o.hisaab.brokerage.inHand).toBe(o.hisaab.brokerage.received - 20000);
    expect((await hs(jar.B2)).hisaab.brokerage.received).toBe(b2.received);
    for (const c of [jar.B2, jar.OWN, jar.B1]) { const t = await (await call(c, 'GET', `/api/deals/${DEAL}`)).text(); expect(t).not.toContain('brokerBook'); expect(t).not.toContain('advance brokerage'); }
    expect(JSON.stringify(await hs(jar.OWN))).not.toContain('advance brokerage');
  });
  it('brokerage due can be set by hand; the Deal Desk list adds it up', async () => {
    const d = await j(await call(jar.B1, 'PUT', `/api/deals/${DEAL}/hisaab/due`, { amount: 300000 }));
    expect(d.hisaab.brokerage.due).toBe(300000); expect(d.hisaab.brokerage.dueBasis).toBe('MANUAL'); expect(d.hisaab.brokerage.left).toBe(Math.max(0, 300000 - d.hisaab.brokerage.received));
    const l = await j(await call(jar.B1, 'GET', '/api/hisaab'));
    expect(l.deals.find((x: any) => x.dealId === DEAL).received).toBeGreaterThan(0); expect(l.totals.received).toBeGreaterThan(0);
  });
});
