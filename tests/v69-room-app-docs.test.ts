import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** v69 — the client room as an app (manifest, alerts) and papers / KYC the client sends from his room (sealed, broker-only for IDs, erased on close). */
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
let ck = '';
const page = async (method: string, url: string, opt: { form?: Record<string, string>; json?: unknown } = {}) => {
  const r = await fetch(B + url, { method, redirect: 'manual', headers: { ...(opt.form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...(opt.json ? { 'content-type': 'application/json' } : {}), ...(ck ? { cookie: ck } : {}) }, body: opt.form ? new URLSearchParams(opt.form).toString() : opt.json ? JSON.stringify(opt.json) : undefined });
  const sc = (r.headers as any).getSetCookie?.() as string[] | undefined;
  if (sc?.length) ck = sc.map(c => c.split(';')[0]).join('; ');
  const text = await r.text(); let js: any; try { js = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, js, type: r.headers.get('content-type') || '' };
};
// a tiny valid PNG
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.alloc(200, 7)]).toString('base64');
const JUNK = Buffer.alloc(300, 65).toString('base64');

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v69-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: 'a1'.repeat(32), SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ B1: 'USR-BRK-001', S1: 'USR-TEAM-002' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

let ROOM = ''; let LINK = ''; let DOC = ''; let KYC = '';
const PHONE = '9712345678';

describe('room as an app + papers', () => {
  it('the room opens with a manifest link and the install / alerts / papers sections after the mobile check', async () => {
    const r = await call(jar.B1, 'POST', '/api/client-rooms', { clientName: 'App Tester', phone: PHONE, kind: 'BUYER', consent: true });
    const b = await j(r); ROOM = b.room.id; LINK = b.link;
    expect((await page('POST', `${LINK}/otp`, { form: { phone: PHONE } })).text).toContain('name="code"');
    const code = (await j(await call(jar.B1, 'GET', `/api/client-rooms/${ROOM}`))).room.codeForClient;
    expect((await page('POST', `${LINK}/verify`, { form: { code } })).status).toBe(303);
    const g = await page('GET', LINK);
    expect(g.text).toContain('rel="manifest"'); expect(g.text).toContain('id="app-card"'); expect(g.text).toContain('id="docform"');
    const m = await page('GET', `${LINK}/manifest.webmanifest`);
    expect(m.status).toBe(200); expect(m.type).toContain('manifest+json');
    expect(m.js.display).toBe('standalone'); expect(m.js.start_url).toBe(LINK); expect(m.js.scope).toBe(LINK + '/');
    const js = await page('GET', '/r/cr.js'); expect(js.text).toContain('beforeinstallprompt');
  });
  it('a stranger without the session cannot push-subscribe, upload or read the manifest of a closed link', async () => {
    const saved = ck; ck = '';
    expect((await page('POST', `${LINK}/doc`, { json: { kind: 'PAPER', data: PNG, consent: true } })).status).toBe(401);
    expect((await page('POST', `${LINK}/push`, { json: { endpoint: 'https://fcm.googleapis.com/x' } })).status).toBe(401);
    ck = saved;
  });
  it('push subscribe validates the push service and the keys', async () => {
    expect((await page('POST', `${LINK}/push`, { json: { endpoint: 'https://evil.example.com/p', keys: { p256dh: 'x'.repeat(90), auth: 'y'.repeat(20) } } })).status).toBe(400);
    expect((await page('POST', `${LINK}/push`, { json: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'x', auth: 'y' } } })).status).toBe(400);
  });
  it('upload needs consent, a known kind, a real image or PDF; then it is stored sealed', async () => {
    expect((await page('POST', `${LINK}/doc`, { json: { kind: 'PAPER', data: PNG, consent: false } })).status).toBe(400);
    expect((await page('POST', `${LINK}/doc`, { json: { kind: 'WHATEVER', data: PNG, consent: true } })).status).toBe(400);
    expect((await page('POST', `${LINK}/doc`, { json: { kind: 'PAPER', data: JUNK, consent: true } })).status).toBe(400);
    const ok = await page('POST', `${LINK}/doc`, { json: { kind: 'PAPER', name: 'rent.png', data: PNG, consent: true, note: 'agreement copy' } });
    expect(ok.status, ok.text).toBe(200); DOC = ok.js.id;
    const k = await page('POST', `${LINK}/doc`, { json: { kind: 'KYC_PAN', name: 'pan.png', data: PNG, consent: true } });
    expect(k.status).toBe(200); KYC = k.js.id;
    const files = readdirSync(path.join(dir, 'data', 'clientdocs', ROOM));
    expect(files.length).toBe(2);
    const raw = readFileSync(path.join(dir, 'data', 'clientdocs', ROOM, files[0]), 'utf8');
    expect(raw).not.toContain(PNG.slice(0, 40));            // sealed, not plain
    expect((await page('GET', LINK)).text).toContain('pan.png');
  });
  it('the broker sees the files and the chat line; opening is counted and audited', async () => {
    const d = (await j(await call(jar.B1, 'GET', `/api/client-rooms/${ROOM}`))).room;
    expect(d.docsOn).toBe(true); expect(d.docs.length).toBe(2);
    expect(d.docs.find((x: any) => x.id === KYC).kyc).toBe(true);
    expect(d.messages.some((m: any) => m.from === 'CLIENT' && m.text.includes('📎'))).toBe(true);
    const o = await call(jar.B1, 'GET', `/api/client-rooms/${ROOM}/docs/${DOC}`);
    expect(o.status).toBe(200); expect(o.headers.get('content-type')).toContain('image/png');
    expect(Buffer.from(await o.arrayBuffer()).toString('base64')).toBe(PNG);
    const d2 = (await j(await call(jar.B1, 'GET', `/api/client-rooms/${ROOM}`))).room;
    expect(d2.docs.find((x: any) => x.id === DOC).opened).toBe(1);
  });
  it('the client can remove his own file', async () => {
    const x = await page('POST', `${LINK}/doc/${DOC}/delete`, { json: {} });
    expect(x.status).toBe(200);
    expect((await j(await call(jar.B1, 'GET', `/api/client-rooms/${ROOM}`))).room.docs.length).toBe(1);
    expect((await call(jar.B1, 'GET', `/api/client-rooms/${ROOM}/docs/${DOC}`)).status).toBe(404);
  });
  it('closing the room erases the files from disk', async () => {
    expect(existsSync(path.join(dir, 'data', 'clientdocs', ROOM))).toBe(true);
    expect((await call(jar.B1, 'POST', `/api/client-rooms/${ROOM}/close`)).status).toBe(200);
    const left = existsSync(path.join(dir, 'data', 'clientdocs', ROOM)) ? readdirSync(path.join(dir, 'data', 'clientdocs', ROOM)) : [];
    expect(left.length).toBe(0);
    expect((await page('GET', `${LINK}/manifest.webmanifest`)).status).toBe(404);
  });
});
