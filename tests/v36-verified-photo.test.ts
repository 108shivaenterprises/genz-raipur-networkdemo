import { freePort } from './helpers/port';
/** v36 — Verified Photo: upload → GENZ checks → only then it is the broker's avatar */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const PORT = await freePort();
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
// a tiny valid JPEG header + padding (sniffMime looks at the magic bytes)
const JPG = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]), Buffer.alloc(3000, 7)]).toString('base64');

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v36-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

let PID = '';
describe('verified photo', () => {
  it('needs consent, a real image and a small file', async () => {
    expect((await call(jar.BRK1, 'POST', '/api/profile-photo/mine', { data: JPG, consent: false })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', '/api/profile-photo/mine', { data: 'data:image/jpeg;base64,' + Buffer.from('not an image at all, just words repeated '.repeat(10)).toString('base64'), consent: true })).status).toBe(415);
    expect((await call(jar.BRK1, 'POST', '/api/profile-photo/mine', { data: 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(200 * 1024)]).toString('base64'), consent: true })).status).toBe(413);
    expect((await call(undefined, 'POST', '/api/profile-photo/mine', { data: JPG, consent: true })).status).toBe(401);
  });

  it('a new photo is PENDING and is NOT the avatar yet; others cannot see it', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/profile-photo/mine', { data: JPG, consent: true });
    expect(r.status, await r.clone().text()).toBe(200);
    const m = await j(await call(jar.BRK1, 'GET', '/api/profile-photo/mine'));
    expect(m.pending.status).toBe('PENDING'); expect(m.url).toBeFalsy();
    expect((await call(jar.BRK2, 'GET', '/api/profile-photo/u/USR-BRK-001')).status).toBe(404);
    expect((await call(jar.BRK1, 'GET', '/api/profile-photo/u/USR-BRK-001')).status).toBe(200);   // his own pending
    expect((await call(undefined, 'GET', '/api/profile-photo/u/USR-BRK-001')).status).toBe(401);   // never public
    expect((await call(jar.BRK1, 'GET', '/api/profile-photo/admin')).status).toBe(403);
  });

  it('staff can send it back (reason needed), the file is deleted, the broker sees why', async () => {
    const q = await j(await call(jar.ADMIN, 'GET', '/api/profile-photo/admin'));
    PID = q.photos.find((p: any) => p.userId === 'USR-BRK-001').id;
    expect((await call(jar.ADMIN, 'POST', `/api/profile-photo/admin/${PID}`, { verdict: 'REJECT' })).status).toBe(400);
    expect((await call(jar.ADMIN, 'POST', `/api/profile-photo/admin/${PID}`, { verdict: 'REJECT', note: 'Face not clear' })).status).toBe(200);
    const m = await j(await call(jar.BRK1, 'GET', '/api/profile-photo/mine'));
    expect(m.latest.status).toBe('REJECTED'); expect(m.latest.review.note).toBe('Face not clear'); expect(m.url).toBeFalsy();
    expect(readdirSync(path.join(dir, 'data', 'profilephotos')).filter(f => f.endsWith('.bin')).length).toBe(0);
  });

  it('after approval it becomes the avatar, any member can open it, and a later upload waits for its own approval', async () => {
    expect((await call(jar.BRK1, 'POST', '/api/profile-photo/mine', { data: JPG, consent: true })).status).toBe(200);
    const id = (await j(await call(jar.ADMIN, 'GET', '/api/profile-photo/admin'))).photos.find((p: any) => p.userId === 'USR-BRK-001').id;
    expect((await call(jar.ADMIN, 'POST', `/api/profile-photo/admin/${id}`, { verdict: 'APPROVE' })).status).toBe(200);
    expect((await call(jar.ADMIN, 'POST', `/api/profile-photo/admin/${id}`, { verdict: 'APPROVE' })).status).toBe(404);   // already decided
    const m = await j(await call(jar.BRK1, 'GET', '/api/profile-photo/mine'));
    expect(m.approved).toBeTruthy(); expect(m.url).toContain('/api/profile-photo/u/USR-BRK-001');
    const img = await call(jar.BRK2, 'GET', '/api/profile-photo/u/USR-BRK-001');
    expect(img.status).toBe(200); expect(img.headers.get('content-type')).toBe('image/jpeg'); expect(img.headers.get('cache-control')).toContain('private');
    const dir2 = await j(await call(jar.BRK2, 'GET', '/api/network/directory'));
    void dir2;
    expect((await call(jar.BRK1, 'POST', '/api/profile-photo/mine', { data: JPG, consent: true })).status).toBe(200);
    const m2 = await j(await call(jar.BRK1, 'GET', '/api/profile-photo/mine'));
    expect(m2.approved).toBeTruthy(); expect(m2.pending).toBeTruthy(); expect(m2.url).toBeTruthy();   // old stays until the new one is approved
  });
});
