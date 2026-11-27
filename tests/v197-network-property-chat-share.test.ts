import { freePort } from './helpers/port';
/**
 * v197 — Share network properties in chat with interactive card, photos & video preview.
 * Verifies that:
 * 1. Brokers can share network properties with buyers/tenants directly into the client room.
 * 2. Shared properties automatically appear inside the chat thread as an interactive card.
 * 3. Clicking the property card opens the full public property card with photos & walkthrough videos.
 * 4. Anti-bypass rules are preserved: owner phone and exact unit address are kept protected.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};

const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = async (r: Response) => r.json();
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);

async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}

function client() {
  let cookie = '';
  const go = async (method: string, url: string, form?: Record<string, string>) => {
    const r = await fetch(B + url, { method, redirect: 'manual', headers: { ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...(cookie ? { cookie } : {}) }, body: form ? new URLSearchParams(form).toString() : undefined });
    const sc = (r.headers as any).getSetCookie?.() as string[] | undefined;
    if (sc?.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
    return { status: r.status, text: await r.text(), loc: r.headers.get('location') || '' };
  };
  return { go, has: () => !!cookie };
}

const phone = '98' + String(10000000 + Math.floor(Math.random() * 89999999));
let roomId = ''; let link = ''; let networkProp: any; let token = '';
const cl = client();

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v197-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', ADMIN: 'USR-ADMIN-1' })) {
    jar[k] = await login(id);
  }
}, 60000);

afterAll(async () => {
  proc?.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 300));
  if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

describe('v197 · network property chat sharing and interactive media card', () => {
  it('setup: create client room and authenticate client via OTP', async () => {
    const all = (await j(await call(jar.ADMIN, 'GET', '/api/properties'))).properties as any[];
    // Pick a network listing listed by BRK1 (so BRK2 is sharing a network property)
    networkProp = all.find(p => p.listingBrokerId === 'USR-BRK-001' && p.listingStatus === 'active' && p.verificationStatus === 'VERIFIED');
    expect(networkProp).toBeTruthy();

    const made = await call(jar.BRK2, 'POST', '/api/client-rooms', { clientName: 'Aarav Sharma', phone, kind: 'BUYER', consent: true });
    expect(made.status).toBe(200);
    const b = await j(made);
    roomId = b.room.id;
    link = b.link;
    token = link.split('/r/')[1];

    // Client requests OTP and signs in
    await cl.go('POST', `${link}/otp`, { phone });
    const code = (await j(await call(jar.BRK2, 'GET', `/api/client-rooms/${roomId}`))).room.codeForClient;
    expect(code).toBeTruthy();
    const good = await cl.go('POST', `${link}/verify`, { code });
    expect(good.status).toBe(303);
    expect(cl.has()).toBe(true);
  });

  it('broker shares network property; room items AND chat messages both receive the property, and buyer bond is secured', async () => {
    const res = await call(jar.BRK2, 'POST', `/api/client-rooms/${roomId}/items`, {
      propertyId: networkProp.id,
      note: 'यह नेटवर्क की बहुत बढ़िया प्रॉपर्टी है, फ़ोटो और वीडियो देखें!',
    });
    expect(res.status).toBe(200);
    const body = await j(res);
    expect(body.room.items.some((i: any) => i.propertyId === networkProp.id)).toBe(true);
    
    // Check that chat message was automatically appended with propertyId
    const propMsg = body.room.messages.find((m: any) => m.propertyId === networkProp.id);
    expect(propMsg).toBeTruthy();
    expect(propMsg.from).toBe('BROKER');
    expect(propMsg.text).toContain('यह नेटवर्क की बहुत बढ़िया प्रॉपर्टी है');

    // CR-1: Buyer bond registered for introducing broker on this property
    const bondsRes = await j(await call(jar.BRK2, 'GET', '/api/buyer-bonds/mine'));
    const bond = (bondsRes.bonds || []).find((b: any) => b.propertyId === networkProp.id);
    expect(bond).toBeTruthy();
    expect(bond.source).toBe('SHOWN');
  });

  it('client room HTML renders an interactive property card directly in chat bubble', async () => {
    const g = await cl.go('GET', link);
    expect(g.status).toBe(200);
    // Contains property card in chat
    expect(g.text).toContain(`data-testid="chat-prop-card-${networkProp.id}"`);
    expect(g.text).toContain(`data-testid="chat-open-home-${networkProp.id}"`);
    expect(g.text).toContain(networkProp.title);
    expect(g.text).toContain(`/r/${token}/home/${networkProp.id}`);
  });

  it('tapping property card opens dedicated page showing photos, video, WhatsApp family share, and anti-bypass safety', async () => {
    const mediaPage = await cl.go('GET', `/r/${token}/home/${networkProp.id}`);
    expect(mediaPage.status).toBe(200);
    expect(mediaPage.text).toContain(networkProp.title);
    expect(mediaPage.text).toContain('data-testid="prop-details-card"');
    expect(mediaPage.text).toContain('data-testid="prop-media-back"');
    expect(mediaPage.text).toContain('data-testid="prop-actions"');
    expect(mediaPage.text).toContain('data-testid="family-share-card"');
    expect(mediaPage.text).toContain('data-testid="share-family-whatsapp"');
    expect(mediaPage.text).toContain('%2Fp%2F');
    expect(mediaPage.text).toContain('transform:rotate(-25deg)');
    expect(mediaPage.text).toContain('🔒');
    expect(mediaPage.text).toContain('पूरा पता और मालिक का फ़ोन नंबर');
    // Owner phone and exact hidden address must NEVER leak
    if (networkProp.ownerPhone) expect(mediaPage.text).not.toContain(networkProp.ownerPhone);
    if (networkProp.addressHidden) expect(mediaPage.text).not.toContain(networkProp.addressHidden);
  });

  it('static UI guards: ClientRooms.tsx contains network share picker, modal, and media viewer', () => {
    const src = readFileSync(path.join(ROOT, 'src/components/ClientRooms.tsx'), 'utf8');
    expect(src).toContain('data-testid="room-plus-share-network"');
    expect(src).toContain('data-testid="property-media-modal"');
    expect(src).toContain('data-testid="network-property-picker-modal"');
    expect(src).toContain('chat-open-media');
    expect(src).toContain('View card, photos & video');
  });
});
