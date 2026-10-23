import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * v55 — a Property Paper shared from the deal chat: chosen people of the deal, N days, M opens, view-only (stamped), and — if allowed —
 * shown by the receiving broker to his own client in a Client Room, where the client sees it view-only with his own name stamped.
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 7100 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const DEAL = 'DEAL-2026-001'; // brokers USR-BRK-001 + USR-BRK-002 · owner USR-OWNER-001
let PROP = ''; let P = ''; let R = ''; let rName = ''; let docId = ''; let roomId = ''; let roomTok = ''; let sid = ''; let cookie = '';

const jpeg = (fill: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, fill), Buffer.from([0xff, 0xd9])]);
const call = (c: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = async (r: Response) => r.json();
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const share = (who: string, body: any) => call(jar[who], 'POST', `/api/property-docs/${docId}/chat-share`, { dealId: DEAL, ...body });
const page = (url: string, extra: Record<string, string> = {}) => fetch(B + url, { headers: { cookie, ...extra }, redirect: 'manual' });

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v55-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ B1: 'USR-BRK-001', B2: 'USR-BRK-002', B3: 'USR-BRK-003', OWNER: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
  PROP = (await j(await call(jar.B1, 'GET', `/api/deals/${DEAL}`))).property.id;
  const meta = await j(await call(jar.B1, 'GET', '/api/property-docs/meta'));
  P = meta.properties.some((p: any) => p.id === PROP) ? 'B1' : 'B2';    // the listing broker of this deal's property
  R = P === 'B1' ? 'B2' : 'B1';                                          // the other (buyer-side) broker
  rName = cfg.demoAccounts.find((x: any) => x.id === (R === 'B1' ? 'USR-BRK-001' : 'USR-BRK-002')).name;
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('sharing a paper from the deal chat', () => {
  it('the listing broker shares a paper: it becomes view-only, a PAPER card lands in the chat, the other broker sees his limits', async () => {
    const up = await j(await call(jar[P], 'POST', '/api/property-docs', { propertyId: PROP, type: 'SALE_DEED', title: 'Registry v55', fileName: 'registry.jpg', data: jpeg(9).toString('base64'), attest: true }));
    docId = up.doc.id; expect(up.doc.protect).toBe(false);
    const rid = R === 'B1' ? 'USR-BRK-001' : 'USR-BRK-002';
    const r = await share(P, { userIds: [rid], days: 3, maxViews: 2, clientShare: true });
    expect(r.status).toBe(200);
    const x = await j(r);
    expect(x.message).toMatchObject({ kind: 'PAPER', refId: docId, dealRoomId: DEAL });
    expect(x.doc.protect).toBe(true);
    const msgs = (await j(await call(jar.OWNER, 'GET', `/api/deals/${DEAL}/messages`))).messages;
    expect(msgs.some((m: any) => m.kind === 'PAPER' && m.refId === docId)).toBe(true);
    const fd = await j(await call(jar[R], 'GET', `/api/property-docs/for-deal/${DEAL}`));
    const mine = fd.docs.find((d: any) => d.id === docId);
    expect(mine.myShare).toMatchObject({ viewsLeft: 2, maxViews: 2, clientShare: true, dealId: DEAL });
    expect(mine.canDownload).toBe(false);
  });

  it('every open counts; when they are used up it stops; the file itself is never given', async () => {
    const v1 = await j(await call(jar[R], 'POST', `/api/property-docs/${docId}/view`, {}));
    expect(v1.viewsLeft).toBe(1);
    expect(v1.watermark).toContain(rName);
    expect(v1.watermark).toMatch(/^([A-Z]\.){1,3} · /);                   // the initials lead the stamp
    expect((await j(await call(jar[R], 'POST', `/api/property-docs/${docId}/view`, {}))).viewsLeft).toBe(0);
    const v3 = await call(jar[R], 'POST', `/api/property-docs/${docId}/view`, {});
    expect(v3.status).toBe(403); expect((await j(v3)).code).toBe('VIEWS_USED');
    expect((await call(jar[R], 'GET', `/api/property-docs/${docId}/file`)).status).toBe(403);
    // the listing broker opens his own paper as often as he likes
    expect((await call(jar[P], 'POST', `/api/property-docs/${docId}/view`, {})).status).toBe(200);
  });

  it('only the paper\'s manager can share it, only with people of that deal; strangers see nothing', async () => {
    const rid = R === 'B1' ? 'USR-BRK-001' : 'USR-BRK-002';
    expect((await share(R, { userIds: ['USR-OWNER-001'], days: 1, maxViews: 1 })).status).toBe(403);
    expect((await share(P, { userIds: ['USR-BRK-003'], days: 1, maxViews: 1 })).status).toBe(400);
    expect((await call(jar.B3, 'GET', `/api/property-docs/for-deal/${DEAL}`)).status).toBe(404);
    expect((await share(P, { dealId: 'DEAL-DMO-005', userIds: [rid], days: 1, maxViews: 1 })).status).toBe(400);
  });

  it('a typed PDF cannot be shared view-only', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF');
    const up = await j(await call(jar[P], 'POST', '/api/property-docs', { propertyId: PROP, type: 'NOC', title: 'Typed NOC', fileName: 'noc.pdf', data: pdf.toString('base64'), attest: true }));
    const r = await call(jar[P], 'POST', `/api/property-docs/${up.doc.id}/chat-share`, { dealId: DEAL, userIds: [R === 'B1' ? 'USR-BRK-001' : 'USR-BRK-002'], days: 1, maxViews: 1 });
    expect(r.status).toBe(400); expect((await j(r)).code).toBe('PDF_NOT_SCANNED');
  });
});

describe('showing it to the buyer-side broker\'s own client', () => {
  it('needs the sender\'s "may show his client"; never longer than his own share; only in his own room', async () => {
    const rid = R === 'B1' ? 'USR-BRK-001' : 'USR-BRK-002';
    const phone = '98' + String(Date.now()).slice(-8);
    const room = await j(await call(jar[R], 'POST', '/api/client-rooms', { clientName: 'Kiran Mehta', phone, kind: 'BUYER', consent: true }));
    roomId = room.room.id; roomTok = room.link.split('/r/')[1];
    // sender switched "show client" off → refused
    expect((await share(P, { userIds: [rid], days: 3, maxViews: 5, clientShare: false })).status).toBe(200);
    const off = await call(jar[R], 'POST', `/api/property-docs/${docId}/client-share`, { roomId, days: 7, maxViews: 2 });
    expect(off.status).toBe(403); expect((await j(off)).code).toBe('CLIENT_SHARE_OFF');
    // on again (3 days, 5 opens): the client may see it for at most those 3 days
    expect((await share(P, { userIds: [rid], days: 3, maxViews: 5, clientShare: true })).status).toBe(200);
    const ok = await call(jar[R], 'POST', `/api/property-docs/${docId}/client-share`, { roomId, days: 30, maxViews: 2 });
    expect(ok.status).toBe(200);
    const s = (await j(ok)).share; sid = s.id;
    expect(Date.parse(s.expiresAt)).toBeLessThanOrEqual(Date.now() + 3 * 86_400_000 + 5000);
    expect((await call(jar[P], 'POST', `/api/property-docs/${docId}/client-share`, { roomId, days: 1, maxViews: 1 })).status).toBe(404); // not his room
    const det = await j(await call(jar[R], 'GET', `/api/client-rooms/${roomId}`));
    expect(det.room.messages.some((m: any) => m.paper?.shareId === sid)).toBe(true);
    // the client signs in to his room (no SMS gateway: the broker reads the code out)
    const o = await fetch(`${B}/r/${roomTok}/otp`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `phone=${phone}`, redirect: 'manual' });
    expect(o.status).toBe(200);
    const code = (await j(await call(jar[R], 'GET', `/api/client-rooms/${roomId}`))).room.codeForClient;
    const v = await fetch(`${B}/r/${roomTok}/verify`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `code=${code}`, redirect: 'manual' });
    expect(v.status).toBe(303);
    cookie = v.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    expect(cookie).toContain('genz_cr_');
  });

  it('the client opens it view-only with HIS name stamped; each page image works once, only as an image; opens are counted', async () => {
    const room = await (await page(`/r/${roomTok}`)).text();
    expect(room).toContain(`/r/${roomTok}/paper/${sid}`);
    expect((await fetch(`${B}/r/${roomTok}/paper/${sid}`, { redirect: 'manual' })).status).toBe(303);   // no session → sign in first
    const h1 = await (await page(`/r/${roomTok}/paper/${sid}`)).text();
    const toks = JSON.parse(h1.match(/data-t='([^']+)'/)![1].replace(/&quot;/g, '"'));
    const wm = h1.match(/data-wm="([^"]+)"/)![1];
    expect(wm).toMatch(/^K\.M\. · Kiran Mehta · ••\d{4} · .* · via /);
    expect(wm).toContain(rName);
    const img = await page(`/r/${roomTok}/pp/${toks[0]}`, { 'sec-fetch-dest': 'image' });
    expect(img.status).toBe(200); expect(img.headers.get('cache-control')).toMatch(/no-store/);
    expect(Buffer.from(await img.arrayBuffer()).equals(jpeg(9))).toBe(true);
    expect((await page(`/r/${roomTok}/pp/${toks[0]}`, { 'sec-fetch-dest': 'image' })).status).toBe(403);       // used once
    const h2 = await (await page(`/r/${roomTok}/paper/${sid}`)).text();
    const t2 = JSON.parse(h2.match(/data-t='([^']+)'/)![1].replace(/&quot;/g, '"'));
    expect((await page(`/r/${roomTok}/pp/${t2[0]}`, { 'sec-fetch-dest': 'document' })).status).toBe(403);     // not inside the viewer
    const h3 = await page(`/r/${roomTok}/paper/${sid}`);
    expect(h3.status).toBe(403);                                                                                // 2 opens allowed
    expect(await h3.text()).toMatch(/तय बार|allowed number/);
  });

  it('when the listing broker stops the share, the client\'s copy stops too; the audit trail has both shares', async () => {
    const rid = R === 'B1' ? 'USR-BRK-001' : 'USR-BRK-002';
    const again = await call(jar[R], 'POST', `/api/property-docs/${docId}/client-share`, { roomId, days: 1, maxViews: 3 });
    const sid2 = (await j(again)).share.id;
    expect((await page(`/r/${roomTok}/paper/${sid2}`)).status).toBe(200);
    expect((await call(jar[P], 'POST', `/api/property-docs/${docId}/revoke`, { userId: rid })).status).toBe(200);
    const stopped = await page(`/r/${roomTok}/paper/${sid2}`);
    expect(stopped.status).toBe(403); expect(await stopped.text()).toMatch(/stopped sharing/);
    const logs = await j(await call(jar.ADMIN, 'GET', '/api/audit-logs?q=PROPDOC_&limit=200'));
    const acts = (logs.events || logs.logs || logs.items || []).map((e: any) => e.action);
    expect(acts).toContain('PROPDOC_CHAT_SHARED'); expect(acts).toContain('PROPDOC_CLIENT_SHARED');
  });
});
