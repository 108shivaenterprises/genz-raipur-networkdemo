import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { KYC_RETAIN_DAYS } from '../src/shared/kycRules.js';

/** v74 — KYC stays with GENZ after a member deletes his account: sealed, opened only by a superadmin with a reason, deleted after the retention date. */
const ROOT = path.resolve(import.meta.dirname, '..');
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.alloc(200, 7)]);
const PNG64 = PNG.toString('base64');

interface Srv { B: string; proc: ChildProcess; dir: string; cfg: any; sup: string; b1: string }
async function boot(env: Record<string, string>): Promise<Srv> {
  const port = 8200 + Math.floor(Math.random() * 700); const dir = mkdtempSync(path.join(tmpdir(), 'genz-v74-')); mkdirSync(path.join(dir, 'data'));
  const proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], { cwd: dir, env: { ...process.env, SMS_WEBHOOK_URL: '', PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true', ...env }, stdio: 'ignore' });
  const B = `http://127.0.0.1:${port}`; let cfg: any;
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  const lg = async (id: string) => { const a = cfg.demoAccounts.find((x: any) => x.id === id); const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) }); expect(r.status).toBe(200); return r.headers.get('set-cookie')!.split(';')[0]; };
  return { B, proc, dir, cfg, sup: await lg(cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').id), b1: await lg('USR-BRK-001') };
}
const stop = async (s?: Srv) => { s?.proc.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (s?.dir && existsSync(s.dir)) rmSync(s.dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); };
const mk = (s: Srv) => (c: string | undefined, method: string, url: string, body?: unknown) => fetch(s.B + url, { method, headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
async function newOwner(s: Srv, phone: string, name: string) {
  const call = mk(s); const o = await j(await call(undefined, 'POST', '/api/owner/otp', { phone }));
  const ok = await call(undefined, 'POST', '/api/owner/verify', { phone, code: o.devCode, name, consent: true, city: 'Raipur', state: 'Chhattisgarh' }); expect(ok.status, await ok.clone().text()).toBe(200);
  return { cookie: ok.headers.get('set-cookie')!.split(';')[0], id: (await j(ok)).user.id as string };
}
async function erase(s: Srv, cookie: string) {
  const call = mk(s); const q = await call(cookie, 'POST', '/api/privacy/requests', { type: 'ERASURE' }); expect(q.status, await q.clone().text()).toBe(200);
  const id = (await j(q)).request?.id as string; expect(id).toBeTruthy();
  return call(s.sup, 'POST', `/api/privacy/requests/${id}/resolve`, { decision: 'COMPLETE' });
}

describe('KYC retained after account deletion (3 years)', () => {
  let A: Srv; let call: ReturnType<typeof mk>;
  beforeAll(async () => { A = await boot({ KYC_VAULT_KEY: 'a1'.repeat(32), KYC_RETAIN_DAYS: '0' }); call = mk(A); }, 60000);
  afterAll(async () => { await stop(A); });
  let holdId = ''; let uid = '';

  it('the rule is 3 years', () => { expect(KYC_RETAIN_DAYS).toBe(1095); });

  it('a deleted owner is gone from the app, but the selfie + ID + details are kept sealed', async () => {
    const o = await newOwner(A, '9876500077', 'Retain Owner'); uid = o.id;
    expect((await call(o.cookie, 'POST', '/api/owner-media/doc', { kind: 'SELFIE', data: PNG64, consent: true })).status).toBe(200);
    expect((await call(o.cookie, 'POST', '/api/owner-media/doc', { kind: 'ID_PAN', data: PNG64, consent: true })).status).toBe(200);
    const r = await erase(A, o.cookie); expect(r.status, await r.clone().text()).toBe(200);
    // live copies are gone (nothing for staff to review, the file folder is empty)
    expect((await j(await call(A.sup, 'GET', '/api/owner-media/admin/docs'))).docs.filter((d: any) => d.ownerName === 'Retain Owner' || d.userId === uid)).toEqual([]);
    expect(readdirSync(path.join(A.dir, 'data', 'ownerdocs')).filter(f => f.endsWith('.bin'))).toEqual([]);
    // the sealed copy exists, is listed for a superadmin only, and nothing in the folder is the plain picture
    expect((await call(A.b1, 'GET', '/api/kyc-retain')).status).toBe(403);
    const l = await j(await call(A.sup, 'GET', '/api/kyc-retain')); const h = l.holds.find((x: any) => x.userId === uid); expect(h).toBeTruthy(); holdId = h.id;
    expect(h.files.map((f: any) => f.kind).sort()).toEqual(['ID_PAN', 'SELFIE']); expect(h.label).toMatch(/^Deleted user/);
    const sealed = readdirSync(path.join(A.dir, 'data', 'kycretained')).filter(f => f.endsWith('.sealed')); expect(sealed.length).toBe(2);
  });

  it('opening needs a purpose, a written reason and the superadmin\'s own password; every opening is logged', async () => {
    const OPEN = `/api/kyc-retain/${holdId}/open`; const pw = A.cfg.demoPassword;
    expect((await call(A.b1, 'POST', OPEN, { purpose: 'LEGAL_CASE', reason: 'Legal notice for unpaid commission', password: pw })).status).toBe(403);
    expect((await call(A.sup, 'POST', OPEN, { purpose: 'LEGAL_CASE', reason: 'short', password: pw })).status).toBe(400);
    expect((await call(A.sup, 'POST', OPEN, { purpose: 'LEGAL_CASE', reason: 'Legal notice for unpaid commission', password: 'wrong-password' })).status).toBe(403);
    expect((await call(A.sup, 'GET', `/api/kyc-retain/${holdId}/file/1`)).status).toBe(403);           // a file needs a recorded opening first
    const ok = await call(A.sup, 'POST', OPEN, { purpose: 'LEGAL_CASE', reason: 'Legal notice for unpaid commission', password: pw }); expect(ok.status, await ok.clone().text()).toBe(200);
    const d = await j(ok); expect(d.member.name).toBe('Retain Owner'); expect(d.member.phone).toContain('9876500077'); expect(d.files.length).toBe(2);
    const f = await call(A.sup, 'GET', `/api/kyc-retain/${holdId}/file/${d.files[0].n}`); expect(f.status).toBe(200); expect(f.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await f.arrayBuffer()).equals(PNG)).toBe(true);                                 // the exact picture comes back
    const log = (await j(await call(A.sup, 'GET', '/api/kyc-retain'))).holds.find((x: any) => x.id === holdId); expect(log.opened).toBe(2); // details + one file
    expect((await call(A.b1, 'GET', `/api/kyc-retain/${holdId}/file/1`)).status).toBe(403);
  });

  it('a member with no KYC leaves no hold', async () => {
    const o = await newOwner(A, '9876500078', 'No Papers Owner');
    const r = await erase(A, o.cookie); expect(r.status).toBe(200);
    expect((await j(await call(A.sup, 'GET', '/api/kyc-retain'))).holds.some((x: any) => x.userId === o.id)).toBe(false);
  });

  it('after the retention date the sealed files, details and vault row are deleted', async () => {
    const sw = await j(await call(A.sup, 'POST', '/api/kyc-retain/sweep')); expect(sw.purged).toBeGreaterThanOrEqual(1);
    const h = (await j(await call(A.sup, 'GET', '/api/kyc-retain'))).holds.find((x: any) => x.id === holdId); expect(h.purgedAt).toBeTruthy(); expect(h.files).toEqual([]); expect(h.filesPurged).toBe(2);
    const o = await call(A.sup, 'POST', `/api/kyc-retain/${holdId}/open`, { purpose: 'LEGAL_CASE', reason: 'Legal notice for unpaid commission', password: A.cfg.demoPassword }); expect(o.status).toBe(410);
    expect(readdirSync(path.join(A.dir, 'data', 'kycretained')).filter(f => f.endsWith('.sealed'))).toEqual([]);
  });
});

describe('no encryption key = the erasure is refused and nothing is deleted', () => {
  let C: Srv;
  beforeAll(async () => { C = await boot({ KYC_VAULT_KEY: 'not-a-valid-key' }); }, 60000);
  afterAll(async () => { await stop(C); });
  it('KYC that cannot be sealed stops the erasure', async () => {
    const call = mk(C); const o = await newOwner(C, '9876500079', 'Keyless Owner');
    expect((await call(o.cookie, 'POST', '/api/owner-media/doc', { kind: 'SELFIE', data: PNG64, consent: true })).status).toBe(200);
    const r = await erase(C, o.cookie); expect(r.status).toBe(409); expect((await j(r)).code).toBe('KYC_HOLD_FAILED');
    expect((await j(await call(o.cookie, 'GET', '/api/owner-media/doc'))).docs.length).toBe(1);   // still there
    expect((await call(o.cookie, 'GET', '/api/auth/me')).status).toBe(200);                          // and he is not erased
  });
});
