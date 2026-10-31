import { freePort } from './helpers/port';
import { ackBuyer } from './helpers/ack.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** v70 — owner room (mandate-gated, numbers only), two rooms for one mobile, owner confirms a visit by the buyer's QR / code, full-Aadhaar switch. */
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v70b-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: 'a1'.repeat(32), FULL_AADHAAR_OK: '1', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ B1: 'USR-BRK-001' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });



describe('full Aadhaar when the server switch is ON', () => {
  it('only after the broker asks; then sealed, and the client page offers it', async () => {
    const mk = await j(await call(jar.B1, 'POST', '/api/client-rooms', { clientName: 'Aadhaar Tester', phone: '9876501234', kind: 'BUYER', consent: true }));
    const room = mk.room.id, link = mk.link;
    expect((await page('POST', `${link}/otp`, { form: { phone: '9876501234' } })).text).toContain('name="code"');
    const code = (await j(await call(jar.B1, 'GET', `/api/client-rooms/${room}`))).room.codeForClient;
    await page('POST', `${link}/verify`, { form: { code } });
    expect((await page('GET', link)).text).not.toContain('KYC_AADHAAR_FULL');
    expect((await page('POST', `${link}/doc`, { json: { kind: 'KYC_AADHAAR_FULL', data: PNG, consent: true } })).status).toBe(403);
    expect((await call(jar.B1, 'POST', `/api/client-rooms/${room}/full-aadhaar`, { ask: true })).status).toBe(200);
    expect((await page('GET', link)).text).toContain('KYC_AADHAAR_FULL');
    const up = await page('POST', `${link}/doc`, { json: { kind: 'KYC_AADHAAR_FULL', data: PNG, consent: true } });
    expect(up.status, up.text).toBe(200);
    const d = (await j(await call(jar.B1, 'GET', `/api/client-rooms/${room}`))).room;
    expect(d.docs[0].kind).toBe('KYC_AADHAAR_FULL'); expect(d.docs[0].kyc).toBe(true);
    expect(JSON.stringify(d)).not.toContain(PNG.slice(0, 30));
  });
});
