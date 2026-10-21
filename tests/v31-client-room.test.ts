/**
 * v31 — Client Room: a broker's private room with his own client. Link + mobile OTP, no signup. The chat belongs to the client and the
 * introducing broker only; the client sees marketing facts only (no exact address, no owner details); phone numbers cannot be typed in the chat.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const PORT = 6600 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
/** the client's browser: a tiny cookie jar + form posts */
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

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v31b-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', OWN: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1', SUPER: 'USR-SUPER-1' })) { try { jar[k] = await login(id); } catch { /* optional */ } }
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

let roomId = ''; let link = ''; let PA: any; let itemId = '';
const cl = client();

describe('client room', () => {
  it('setup: a live listing; the room needs the client\'s consent and a real mobile', async () => {
    const all = (await j(await call(jar.ADMIN, 'GET', '/api/properties'))).properties as any[];
    PA = all.find(p => p.listingBrokerId === 'USR-BRK-001' && p.transactionType === 'Sale' && p.listingStatus === 'active' && p.verificationStatus === 'VERIFIED' && p.addressHidden);
    expect(PA).toBeTruthy();
    expect((await call(jar.BRK2, 'POST', '/api/client-rooms', { clientName: 'Sunil', phone, kind: 'BUYER' })).status).toBe(400);               // no consent
    expect((await call(jar.BRK2, 'POST', '/api/client-rooms', { clientName: 'Sunil', phone: '12345', kind: 'BUYER', consent: true })).status).toBe(400);
    const made = await call(jar.BRK2, 'POST', '/api/client-rooms', { clientName: 'Sunil Verma', phone, kind: 'BUYER', consent: true });
    expect(made.status, await made.clone().text()).toBe(200);
    const b = await j(made); roomId = b.room.id; link = b.link;
    expect(link).toMatch(/^\/r\/[A-Za-z0-9_-]{20,}$/);
    expect(JSON.stringify(b.room)).not.toContain(phone);                                                         // only the last 4 digits are kept
    expect((await call(jar.BRK2, 'POST', '/api/client-rooms', { clientName: 'Sunil Again', phone, kind: 'BUYER', consent: true })).status).toBe(409);
  });

  it('the broker shares a property; the client sees nothing before the mobile check', async () => {
    const it = await call(jar.BRK2, 'POST', `/api/client-rooms/${roomId}/items`, { propertyId: PA.id, note: 'Corner plot, east facing' });
    expect(it.status, await it.clone().text()).toBe(200);
    itemId = (await j(it)).room.items[0].id;
    const g = await cl.go('GET', link);
    expect(g.status).toBe(200);
    expect(g.text).toContain('name="phone"');
    expect(g.text).not.toContain(PA.title);
  });

  it('a wrong mobile gets no code; the right mobile gets one; a wrong code fails; the right code opens the room', async () => {
    const wrong = await cl.go('POST', `${link}/otp`, { phone: '9000000000' });
    expect(wrong.text).toContain('मेल नहीं खाता');
    expect((await j(await call(jar.BRK2, 'GET', `/api/client-rooms/${roomId}`))).room.codeForClient).toBeUndefined();
    const ok = await cl.go('POST', `${link}/otp`, { phone });
    expect(ok.text).toContain('name="code"');
    const code = (await j(await call(jar.BRK2, 'GET', `/api/client-rooms/${roomId}`))).room.codeForClient;          // no SMS gateway: the broker reads it out
    expect(code).toMatch(/^\d{6}$/);
    // v32: the broker's list + home flag the waiting client (tab badge / home tile), and it clears once the code is used
    const lst = (await j(await call(jar.BRK2, 'GET', '/api/client-rooms'))).rooms.find((x: any) => x.id === roomId);
    expect(lst.codeAsk).toBe(true);
    expect((await j(await call(jar.BRK2, 'GET', '/api/home/broker'))).counts.roomCodes).toBeGreaterThanOrEqual(1);
    const bad = await cl.go('POST', `${link}/verify`, { code: code === '111111' ? '222222' : '111111' });
    expect(bad.text).toContain('सही नहीं');
    expect(cl.has()).toBe(false);
    const good = await cl.go('POST', `${link}/verify`, { code });
    expect(good.status).toBe(303);
    expect(cl.has()).toBe(true);
    // the code is single-use
    expect((await j(await call(jar.BRK2, 'GET', '/api/client-rooms'))).rooms.find((x: any) => x.id === roomId).codeAsk).toBe(false);
    expect((await j(await call(jar.BRK2, 'GET', `/api/client-rooms/${roomId}`))).room.codeForClient).toBeUndefined();
  });

  it('inside: marketing facts only — no exact address, owner name / number or net price', async () => {
    const g = await cl.go('GET', link);
    expect(g.status).toBe(200);
    expect(g.text).toContain(PA.title);
    expect(g.text).toContain('Corner plot, east facing');
    expect(g.text).not.toContain(PA.addressHidden);
    expect(g.text).not.toContain(String(PA.ownerName));
    expect(g.text).not.toContain(String(PA.ownerPhone).replace(/\D/g, '').slice(-10));
    expect(g.text).not.toContain(String(PA.ownerApprovedNetPrice));
  });

  it('the client reacts, asks for a visit and writes; the broker sees all three', async () => {
    expect((await cl.go('POST', `${link}/react`, { item: itemId, r: 'LIKE' })).status).toBe(303);
    const when = new Date(Date.now() + 86400_000).toISOString().slice(0, 16);
    expect((await cl.go('POST', `${link}/visit`, { item: itemId, when, note: 'after 5 pm' })).status).toBe(303);
    expect((await cl.go('POST', `${link}/msg`, { text: 'Is the price negotiable?', item: itemId })).status).toBe(303);
    const d = (await j(await call(jar.BRK2, 'GET', `/api/client-rooms/${roomId}`))).room;
    expect(d.items[0].reaction).toBe('LIKE');
    expect(d.items[0].visitRequests[0].status).toBe('REQUESTED');
    expect(d.messages.at(-1).text).toBe('Is the price negotiable?');
    expect(d.unread).toBe(1);
    const list = await j(await call(jar.BRK2, 'GET', '/api/client-rooms'));
    expect(list.counts.unread).toBe(1); expect(list.counts.visits).toBe(1);
    // broker replies, marks the visit handled
    expect((await call(jar.BRK2, 'POST', `/api/client-rooms/${roomId}/messages`, { text: 'Yes, a little. Let us see it first.' })).status).toBe(200);
    expect((await call(jar.BRK2, 'POST', `/api/client-rooms/${roomId}/read`)).status).toBe(200);
    const vid = d.items[0].visitRequests[0].id;
    expect((await call(jar.BRK2, 'POST', `/api/client-rooms/${roomId}/visit/${itemId}/${vid}/handled`)).status).toBe(200);
    expect((await j(await call(jar.BRK2, 'GET', '/api/client-rooms'))).counts.visits).toBe(0);
    const page = await cl.go('GET', link);
    expect(page.text).toContain('Yes, a little. Let us see it first.');
  });

  it('phone numbers cannot be typed in the chat — from either side', async () => {
    const c = await cl.go('POST', `${link}/msg`, { text: 'call the owner on 98765 43210' });
    expect(c.status).toBe(200);
    expect(c.text).toContain('फ़ोन नंबर');
    const b = await call(jar.BRK2, 'POST', `/api/client-rooms/${roomId}/messages`, { text: 'owner is +91 9876543210' });
    expect(b.status).toBe(400); expect((await j(b)).code).toBe('PHONE_IN_CHAT');
    const d = (await j(await call(jar.BRK2, 'GET', `/api/client-rooms/${roomId}`))).room;
    expect(JSON.stringify(d.messages)).not.toContain('9876543210');
  });

  it('nobody else can read the room: not the listing broker, another broker, the owner, admin or superadmin', async () => {
    for (const who of ['BRK1', 'OWN', 'ADMIN', 'SUPER']) {
      if (!jar[who]) continue;
      const r = await call(jar[who], 'GET', `/api/client-rooms/${roomId}`);
      expect([403, 404], who).toContain(r.status);
    }
    expect((await call(jar.BRK1, 'GET', `/api/client-rooms/${roomId}`)).status).toBe(404);
    expect((await call(jar.BRK1, 'GET', '/api/client-rooms')).status).toBe(200);
    expect((await j(await call(jar.BRK1, 'GET', '/api/client-rooms'))).rooms.length).toBe(0);
    expect((await call(jar.BRK1, 'POST', `/api/client-rooms/${roomId}/messages`, { text: 'hello' })).status).toBe(404);
    // another person's browser holding only the link cannot get in
    const stranger = client();
    const s = await stranger.go('GET', link);
    expect(s.text).not.toContain(PA.title);
    expect((await stranger.go('POST', `${link}/msg`, { text: 'hi' })).status).toBe(303);
    expect((await j(await call(jar.BRK2, 'GET', `/api/client-rooms/${roomId}`))).room.messages.filter((m: any) => m.text === 'hi').length).toBe(0);
  });

  it('a sold property shows as no longer available to the client', async () => {
    const r = await call(jar.BRK1, 'POST', `/api/listings/${PA.id}/status`, { status: 'sold', soldVia: 'OUTSIDE', soldNote: 'Owner sold directly' });
    expect(r.status, await r.clone().text()).toBe(200);
    const g = await cl.go('GET', link);
    expect(g.text).toContain('अब उपलब्ध नहीं');
    expect(g.text).not.toContain('name="when"');           // no visit form for a sold property
    // a sold property cannot be shared any more
    expect((await call(jar.BRK2, 'POST', `/api/client-rooms/${roomId}/items`, { propertyId: PA.id })).status).toBe(404);
  });

  it('a new link kills the old link and the client\'s session; closing the room ends it', async () => {
    const n = await call(jar.BRK2, 'POST', `/api/client-rooms/${roomId}/link`);
    const nl = (await j(n)).link; expect(nl).not.toBe(link);
    expect((await cl.go('GET', link)).status).toBe(404);
    const again = client();
    expect((await again.go('GET', nl)).text).toContain('name="phone"');
    expect((await cl.go('GET', nl)).text).toContain('name="phone"');                   // the old session no longer counts
    expect((await call(jar.BRK2, 'POST', `/api/client-rooms/${roomId}/close`)).status).toBe(200);
    expect((await again.go('GET', nl)).status).toBe(404);
    expect((await call(jar.BRK2, 'POST', `/api/client-rooms/${roomId}/messages`, { text: 'hello' })).status).toBe(409);
  });
});
