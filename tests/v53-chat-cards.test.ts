import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkCard } from '../server/chatcards';

/**
 * v53 — the "+" menu of the deal chat: cards (property / document / photo / location / visit / stage) and the brokers-only switch.
 * A card carries ids only; the server decides who may put which card into the chat, and never lets "+" widen what a person can open.
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 6900 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const DEAL = 'DEAL-2026-001'; // brokers USR-BRK-001 + USR-BRK-002 · owner USR-OWNER-001
let PROP = ''; let principal = ''; let outsider = '';

const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const post = (who: string, body: any) => call(jar[who], 'POST', `/api/deals/${DEAL}/messages`, body);
const read = async (who: string) => (await (await call(jar[who], 'GET', `/api/deals/${DEAL}/messages`)).json()).messages as any[];

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v53-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ B1: 'USR-BRK-001', B2: 'USR-BRK-002', B3: 'USR-BRK-003', OWNER: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
  const d = await (await call(jar.B1, 'GET', `/api/deals/${DEAL}`)).json();
  PROP = d.property.id;
  // who is the principal of this property (owner or listing broker) — he can upload into the vault; the other deal broker cannot
  const vb = await (await call(jar.B1, 'GET', `/api/properties/${PROP}/vault/assets`)).json();
  principal = vb.isOwnerOrListingBroker ? 'B1' : 'B2';
  outsider = principal === 'B1' ? 'B2' : 'B1';
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('checkCard (pure)', () => {
  const deal = { id: 'D1', propertyId: 'P1', stage: 'Negotiation' as any };
  const property = { id: 'P1', title: 'Villa', images: ['https://x.test/a.jpg'] };
  const base = { deal, property, visibleAssets: [{ id: 'A1', category: 'LAYOUT_SITE_PLAN' as any, fileUrl: 'https://x.test/plan.pdf' }, { id: 'A2', category: 'PHOTOGRAPH' as any, fileUrl: 'https://x.test/b.jpg' }], visits: [{ id: 'V1', dealRoomId: 'D1', brokerId: 'U1', scheduledTime: '2026-11-01T05:30:00.000Z' }, { id: 'V2', dealRoomId: 'OTHER', brokerId: 'U1', scheduledTime: '2026-11-01T05:30:00.000Z' }], isBroker: true, userId: 'U1' };
  it('property / location only for this deal’s property', () => {
    expect(checkCard({ ...base, kind: 'PROPERTY' })).toMatchObject({ ok: true, refId: 'P1' });
    expect(checkCard({ ...base, kind: 'LOCATION', refId: 'P1' })).toMatchObject({ ok: true, refId: 'P1' });
    expect(checkCard({ ...base, kind: 'PROPERTY', refId: 'P9' })).toMatchObject({ ok: false, status: 400 });
    expect(checkCard({ ...base, property: undefined, kind: 'PROPERTY' })).toMatchObject({ ok: false, status: 404 });
  });
  it('photo must be one of the property’s own photos; document one the sender may open', () => {
    expect(checkCard({ ...base, kind: 'PHOTO', mediaUrl: 'https://x.test/a.jpg' })).toMatchObject({ ok: true, mediaUrl: 'https://x.test/a.jpg' });
    expect(checkCard({ ...base, kind: 'PHOTO', mediaUrl: 'https://x.test/b.jpg' })).toMatchObject({ ok: true });
    expect(checkCard({ ...base, kind: 'PHOTO', mediaUrl: 'https://evil.test/c.jpg' })).toMatchObject({ ok: false, status: 403 });
    expect(checkCard({ ...base, kind: 'PHOTO' })).toMatchObject({ ok: false, status: 403 });
    expect(checkCard({ ...base, kind: 'DOCUMENT', refId: 'A1' })).toMatchObject({ ok: true, refId: 'A1' });
    expect(checkCard({ ...base, kind: 'DOCUMENT', refId: 'A7' })).toMatchObject({ ok: false, status: 403 });
  });
  it('visit belongs to this deal; stage must be the current one and only brokers post it', () => {
    expect(checkCard({ ...base, kind: 'VISIT', refId: 'V1' })).toMatchObject({ ok: true });
    expect(checkCard({ ...base, kind: 'VISIT', refId: 'V2' })).toMatchObject({ ok: false, status: 404 });
    expect(checkCard({ ...base, kind: 'VISIT', refId: 'V1', isBroker: false, userId: 'U9' })).toMatchObject({ ok: false, status: 403 });
    expect(checkCard({ ...base, kind: 'VISIT', refId: 'V1', isBroker: false, userId: 'U1' })).toMatchObject({ ok: true });
    expect(checkCard({ ...base, kind: 'STAGE', refId: 'Negotiation' })).toMatchObject({ ok: true, refId: 'Negotiation' });
    expect(checkCard({ ...base, kind: 'STAGE', refId: 'Agreement' })).toMatchObject({ ok: false, status: 409 });
    expect(checkCard({ ...base, kind: 'STAGE', refId: 'Negotiation', isBroker: false })).toMatchObject({ ok: false, status: 403 });
  });
});

describe('cards through the API', () => {
  it('a plain message is unchanged; a bad kind is refused', async () => {
    const r = await post('B1', { text: 'Plain hello v53' });
    expect(r.status).toBe(200);
    const m = (await r.json()).message;
    expect(m.kind).toBeUndefined(); expect(m.auto).toBeUndefined();
    expect((await post('B1', { kind: 'VOICE', text: 'x' })).status).toBe(400);
    expect((await post('B1', { text: '' })).status).toBe(400);              // a card needs a kind; a plain message still needs text
  });

  it('property and location cards: the deal’s own property only, with an automatic one-line text', async () => {
    const r = await post('B1', { kind: 'PROPERTY' });
    expect(r.status).toBe(200);
    const m = (await r.json()).message;
    expect(m).toMatchObject({ kind: 'PROPERTY', refId: PROP, auto: true, audience: 'ALL' });
    expect(m.text).toMatch(/^Shared the property: /);
    expect((await post('B1', { kind: 'PROPERTY', refId: 'PROP-NOT-THIS' })).status).toBe(400);
    const l = await post('B2', { kind: 'LOCATION', text: 'Near the park' });
    expect(l.status).toBe(200);
    const lm = (await l.json()).message;
    expect(lm).toMatchObject({ kind: 'LOCATION', refId: PROP, text: 'Near the park' });
    expect(lm.auto).toBeUndefined();                                        // the sender typed this caption
    const owner = await post('OWNER', { kind: 'PROPERTY' });               // the owner may share his own property too
    expect(owner.status).toBe(200);
  });

  it('a caption goes through the same chat filter (link floods; new accounts also phone numbers); a stranger cannot post at all', async () => {
    const r = await post('B1', { kind: 'LOCATION', text: 'see http://a.com http://b.com http://c.com now' });
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe('CHAT_FILTER');
    expect((await post('B1', { kind: 'LOCATION', text: 'x'.repeat(301) })).status).toBe(400);
    expect((await post('B3', { kind: 'PROPERTY' })).status).toBeGreaterThanOrEqual(403);
    expect((await call(undefined, 'POST', `/api/deals/${DEAL}/messages`, { kind: 'PROPERTY' })).status).toBe(401);
  });

  it('photo: only a photo of this property', async () => {
    const d = await (await call(jar.B1, 'GET', `/api/deals/${DEAL}`)).json();
    const img = (d.property.images || [])[0];
    if (img) {
      const ok = await post('B1', { kind: 'PHOTO', mediaUrl: img });
      expect(ok.status).toBe(200);
      expect((await ok.json()).message).toMatchObject({ kind: 'PHOTO', mediaUrl: img, mediaType: 'IMAGE' });
    }
    const evil = await post('B1', { kind: 'PHOTO', mediaUrl: 'https://evil.example.com/not-ours.jpg' });
    expect(evil.status).toBe(403);
    expect((await evil.json()).code).toBe('CARD_NOT_YOURS');
  });

  it('document: only what the sender may open; "+" does not widen anyone’s access', async () => {
    const up = await call(jar[principal], 'POST', `/api/properties/${PROP}/vault/assets`, { originalFileName: 'Layout plan v53.pdf', category: 'LAYOUT_SITE_PLAN', fileUrl: 'https://files.example.com/plan53.pdf', sensitivity: 'CONFIDENTIAL' });
    expect(up.status).toBe(200);
    const asset = (await up.json()).asset;
    // the principal can share it as a card …
    const mine = await post(principal, { kind: 'DOCUMENT', refId: asset.id });
    expect(mine.status).toBe(200);
    expect((await mine.json()).message).toMatchObject({ kind: 'DOCUMENT', refId: asset.id, auto: true });
    // … the other deal broker holds no grant yet, so he cannot post it (and so cannot pass it on)
    const denied = await post(outsider, { kind: 'DOCUMENT', refId: asset.id });
    expect(denied.status).toBe(403);
    expect((await denied.json()).code).toBe('CARD_NOT_YOURS');
    // the principal gives the deal room access through the normal vault grant …
    const g = await call(jar[principal], 'POST', `/api/properties/${PROP}/vault/grants`, { recipientType: 'DEAL_ROOM_PARTICIPANTS', recipientId: DEAL, assetIds: [asset.id], expiresInDays: 7 });
    expect(g.status).toBe(200);
    // … and only then can the other broker put the card in the chat
    expect((await post(outsider, { kind: 'DOCUMENT', refId: asset.id })).status).toBe(200);
    expect((await post('B1', { kind: 'DOCUMENT', refId: 'ASSET-NOPE' })).status).toBe(403);
  });

  it('stage card: only a deal broker, only the stage the deal is really at', async () => {
    const d = await (await call(jar.B1, 'GET', `/api/deals/${DEAL}`)).json();
    const stage = d.deal.stage;
    const ok = await post('B1', { kind: 'STAGE', refId: stage });
    expect(ok.status).toBe(200);
    expect((await ok.json()).message.text).toBe(`Deal stage: ${stage}`);
    const stale = await post('B1', { kind: 'STAGE', refId: stage === 'Settled' ? 'Lead' : 'Settled' });
    expect(stale.status).toBe(409);
    expect((await post('OWNER', { kind: 'STAGE', refId: stage })).status).toBe(403);
  });

  it('visit card: a visit of this deal, from the broker who set it up (or a deal broker)', async () => {
    const when = new Date(Date.now() + 2 * 86400_000).toISOString();
    const v = await call(jar.B1, 'POST', '/api/site-visits', { dealRoomId: DEAL, propertyId: PROP, customerName: 'Test Buyer', scheduledTime: when });
    expect(v.status).toBe(200);
    const visit = (await v.json()).siteVisit;
    const c = await post('B1', { kind: 'VISIT', refId: visit.id });
    expect(c.status).toBe(200);
    expect((await c.json()).message).toMatchObject({ kind: 'VISIT', refId: visit.id });
    expect(JSON.stringify(await read('OWNER'))).not.toMatch(/otpCode|qrToken/);   // a card never carries the visit secret
    expect((await post('B1', { kind: 'VISIT', refId: 'SV-NOPE' })).status).toBe(404);
    expect((await post('OWNER', { kind: 'VISIT', refId: visit.id })).status).toBe(403);
  });

  it('every card leaves an audit line (and plain chat does not)', async () => {
    const r = await (await call(jar.ADMIN, 'GET', '/api/audit-logs?q=CHAT_CARD_SENT&limit=100')).json();
    const rows: any[] = r.events || r.logs || r.items || [];
    const mine = rows.filter(e => e.action === 'CHAT_CARD_SENT' && e.entityId === DEAL);
    expect(mine.length).toBeGreaterThanOrEqual(6);
    expect(mine.some(e => /PROPERTY card/.test(e.details || e.description || ''))).toBe(true);
  });
});

describe('brokers-only channel', () => {
  it('a card (or text) sent brokers-only is invisible to the owner, also in his inbox preview; the owner cannot post to it', async () => {
    const tag = 'secret-commission-line-' + Date.now();
    expect((await post('B1', { text: tag, audience: 'BROKERS' })).status).toBe(200);
    const pc = await post('B1', { kind: 'LOCATION', audience: 'BROKERS', text: 'private pin note' });
    expect(pc.status).toBe(200);
    expect(JSON.stringify(await read('OWNER'))).not.toMatch(new RegExp(tag + '|private pin note'));
    expect(JSON.stringify(await read('B2'))).toMatch(new RegExp(tag));
    const inbox = await (await call(jar.OWNER, 'GET', '/api/chats/deals')).json();
    expect(JSON.stringify(inbox)).not.toMatch(new RegExp(tag + '|private pin note'));
    const own = await post('OWNER', { text: 'hi', audience: 'BROKERS' });
    expect(own.status).toBe(403);
  });
});
