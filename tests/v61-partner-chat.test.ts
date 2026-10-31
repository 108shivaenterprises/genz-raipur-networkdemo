import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ROLE_PERMISSIONS, memberPermissions } from '../server/permissions';
import { PERMISSION_HI } from '../src/lib/permHi';

/**
 * v61 — Builder ↔ channel partner chat and notice photos.
 * One thread per builder and partner; the builder side is the builder and his staff who check partner leads (canVerify); the
 * partner side is the broker. Cards: the pair's leads / bookings (first names only) and, from the builder, available units.
 * Photos are private to the two sides; a notice photo to whoever may read that notice. A finished partnership leaves a read-only chat.
 */
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
  expect(a, id).toBeTruthy();
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const jpeg = (n = 200) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, 7)]).toString('base64');
const BLD = 'USR-BUILDER-001';
let T1 = ''; let T2 = ''; let PHOTO = '';

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v61-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 160; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BLD, BT: 'USR-TEAM-005', B1: 'USR-BRK-001', B2: 'USR-BRK-002', B3: 'USR-BRK-003', OWN: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
  for (const k of ['BLD', 'BT', 'B1', 'B2']) expect((await call(jar[k], 'PUT', '/api/push/prefs', { quiet: false, deals: true })).status, k).toBe(200);
}, 90000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

describe('who may use it', () => {
  it('builders and brokers; a builder’s staff only when he checks partner leads; never an owner or GENZ staff', async () => {
    expect(ROLE_PERMISSIONS.BROKER).toContain('pchat:use'); expect(ROLE_PERMISSIONS.DEVELOPER_BUILDER).toContain('pchat:use');
    for (const r of ['PROPERTY_OWNER', 'BUYER_TENANT', 'ADMIN', 'LEGAL_COUNSEL'] as const) expect(ROLE_PERMISSIONS[r]).not.toContain('pchat:use');
    expect(memberPermissions('DEVELOPER_BUILDER', { canVerify: true })).toContain('pchat:use');
    expect(memberPermissions('DEVELOPER_BUILDER', {})).not.toContain('pchat:use');
    expect(memberPermissions('BROKER', { canVerify: true })).not.toContain('pchat:use');
    expect(PERMISSION_HI['pchat:use']).toMatch(/बिल्डर ↔ पार्टनर चैट/);
    for (const k of ['OWN', 'ADMIN', 'BT']) expect((await call(jar[k], 'GET', '/api/partner-chats')).status, k).toBe(403);
    expect((await call(undefined, 'GET', '/api/partner-chats')).status).toBe(401);
    // the super admin holds every permission but speaks for neither side: an empty list (no error on every page), and no thread to open
    const sup = await login(cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').id);
    const l = await call(sup, 'GET', '/api/partner-chats'); expect(l.status).toBe(200); expect((await j(l)).threads).toEqual([]);
    expect((await call(sup, 'POST', '/api/partner-chats/open', { withId: BLD })).status).toBe(403);
  });
  it('a broker sees only the builders he is linked with; an unlinked one cannot open a chat', async () => {
    const l1 = await j(await call(jar.B1, 'GET', '/api/partner-chats'));
    expect(l1.side).toBe('PARTNER'); expect(l1.threads.map((t: any) => t.withId)).toEqual([BLD]); expect(l1.threads[0].id).toBeNull(); expect(l1.threads[0].projects.length).toBeGreaterThan(0);
    expect((await j(await call(jar.B3, 'GET', '/api/partner-chats'))).threads).toEqual([]);
    const r = await call(jar.B3, 'POST', '/api/partner-chats/open', { withId: BLD });
    expect(r.status).toBe(404); expect((await j(r)).code).toBe('NOT_LINKED');
  });
});

describe('talking', () => {
  it('opening twice gives the same thread; a message reaches the builder (unread + phone alert)', async () => {
    T1 = (await j(await call(jar.B1, 'POST', '/api/partner-chats/open', { withId: BLD }))).id; expect(T1).toMatch(/^PCH-/);
    expect((await j(await call(jar.B1, 'POST', '/api/partner-chats/open', { withId: BLD }))).id).toBe(T1);
    expect((await call(jar.BLD, 'POST', '/api/partner-chats/open', { withId: 'USR-BRK-001' })).status).toBe(200);
    expect((await call(jar.B1, 'POST', `/api/partner-chats/${T1}/messages`, {})).status).toBe(400);
    const m = await j(await call(jar.B1, 'POST', `/api/partner-chats/${T1}/messages`, { text: 'Is A-101 still available? Client visiting Sunday.' }));
    expect(m.message.mine).toBe(true); expect(m.message.side).toBe('PARTNER');
    const bl = await j(await call(jar.BLD, 'GET', '/api/partner-chats'));
    expect(bl.side).toBe('BUILDER'); const row = bl.threads.find((t: any) => t.id === T1); expect(row.unread).toBe(1); expect(row.with).toMatch(/Vikramaditya/);
    expect(bl.threads.some((t: any) => t.withId === 'USR-BRK-002')).toBe(true); // linked, no chat yet
    const th = await j(await call(jar.BLD, 'GET', `/api/partner-chats/${T1}`));
    expect(th.thread.messages[0].mine).toBe(false); expect(th.thread.open).toBe(true);
    expect((await j(await call(jar.BLD, 'GET', '/api/partner-chats'))).threads.find((t: any) => t.id === T1).unread).toBe(0);
    const recent = (await j(await call(jar.BLD, 'GET', '/api/push/recent'))).alerts;
    const a = recent.filter((x: any) => /partner chat$/.test(x.title)); expect(a).toHaveLength(1); expect(a[0].url).toBe(`/?tab=chats&chat=p:${T1}`); expect(a[0].hi.title).toMatch(/पार्टनर चैट/);
  });
  it('another broker or the builder of nothing here never reads it', async () => {
    for (const k of ['B2', 'B3']) { expect((await call(jar[k], 'GET', `/api/partner-chats/${T1}`)).status, k).toBe(404); expect((await call(jar[k], 'POST', `/api/partner-chats/${T1}/messages`, { text: 'hi' })).status, k).toBe(404); }
  });
});

describe('cards and photos', () => {
  it('cards: his own leads (first name only) and bookings; units only from the builder', async () => {
    const c1 = await j(await call(jar.B1, 'GET', `/api/partner-chats/${T1}/cards`));
    expect(c1.units).toEqual([]); expect(c1.leads.length).toBeGreaterThan(0);
    for (const l of c1.leads) { expect(l.label).not.toMatch(/\d{5}/); expect(l.label.split(' · ')[0].trim().split(' ').length).toBeLessThanOrEqual(2); } // a first name (with its title: "Dr. Alok")
    const lead = c1.leads[0];
    const r = await j(await call(jar.B1, 'POST', `/api/partner-chats/${T1}/messages`, { card: { kind: 'LEAD', refId: lead.refId }, text: 'Please check this lead' }));
    expect(r.message.card).toMatchObject({ kind: 'LEAD', refId: lead.refId, label: lead.label });
    expect((await call(jar.B1, 'POST', `/api/partner-chats/${T1}/messages`, { card: { kind: 'UNIT', refId: 'x' } })).status).toBe(403);
    const cb = await j(await call(jar.BLD, 'GET', `/api/partner-chats/${T1}/cards`));
    expect(cb.units.length).toBeGreaterThan(0);
    const u = await j(await call(jar.BLD, 'POST', `/api/partner-chats/${T1}/messages`, { card: { kind: 'UNIT', refId: cb.units[0].refId } }));
    expect(u.message.card.kind).toBe('UNIT'); expect(u.message.side).toBe('BUILDER');
    // a lead between the builder and ANOTHER partner cannot be put in this chat
    const t2 = (await j(await call(jar.B2, 'POST', '/api/partner-chats/open', { withId: BLD }))).id; T2 = t2;
    const c2 = await j(await call(jar.B2, 'GET', `/api/partner-chats/${t2}/cards`));
    if (c2.leads.length) expect((await call(jar.B1, 'POST', `/api/partner-chats/${T1}/messages`, { card: { kind: 'LEAD', refId: c2.leads[0].refId } })).status).toBe(404);
  });
  it('photos: only images, not too big; private to the two sides', async () => {
    const txt = Buffer.from('this is not a picture at all, just some words to fill more than a hundred characters of base64 text ok').toString('base64');
    expect((await call(jar.B1, 'POST', `/api/partner-chats/${T1}/messages`, { photo: txt })).status).toBe(415);
    expect((await call(jar.B1, 'POST', `/api/partner-chats/${T1}/messages`, { photo: jpeg(620 * 1024) })).status).toBe(413);
    const r = await j(await call(jar.B1, 'POST', `/api/partner-chats/${T1}/messages`, { photo: jpeg() }));
    expect(r.message.card.kind).toBe('PHOTO'); PHOTO = r.message.card.refId;
    for (const k of ['B1', 'BLD']) { const g = await call(jar[k], 'GET', `/api/partner-chats/photo/${PHOTO}`); expect(g.status, k).toBe(200); expect(g.headers.get('content-type')).toBe('image/jpeg'); expect(g.headers.get('cache-control')).toMatch(/private/); }
    expect((await call(jar.B2, 'GET', `/api/partner-chats/photo/${PHOTO}`)).status).toBe(404);
    expect((await call(jar.ADMIN, 'GET', `/api/partner-chats/photo/${PHOTO}`)).status).toBe(403);
    const list = await j(await call(jar.BLD, 'GET', '/api/partner-chats'));
    expect(list.threads.find((t: any) => t.id === T1).last.photo).toBe(true);
  });
});

describe('the builder’s sales manager', () => {
  it('with "check partner leads" on, he reads and writes for the builder; the builder sees who wrote', async () => {
    expect((await call(jar.BLD, 'PUT', '/api/pcontrol/team/USR-TEAM-005/policy', { canVerify: true })).status).toBe(200);
    const l = await j(await call(jar.BT, 'GET', '/api/partner-chats'));
    expect(l.side).toBe('BUILDER'); expect(l.threads.some((t: any) => t.id === T1)).toBe(true);
    const m = await j(await call(jar.BT, 'POST', `/api/partner-chats/${T1}/messages`, { text: 'Yes, A-101 is open. Sunday 11 AM is fine.' }));
    expect(m.message.side).toBe('BUILDER');
    const forBuilder = (await j(await call(jar.BLD, 'GET', `/api/partner-chats/${T1}`))).thread.messages.at(-1);
    expect(forBuilder.mine).toBe(true); expect(forBuilder.by).toMatch(/Komal|\w+/);
    const forBroker = (await j(await call(jar.B1, 'GET', `/api/partner-chats/${T1}`))).thread.messages.at(-1);
    expect(forBroker.mine).toBe(false); expect(forBroker.by).toBeUndefined();
    // the partner's message alerts the builder AND the sales manager
    await call(jar.B1, 'POST', `/api/partner-chats/${T1}/messages`, { text: 'Thank you!' });
    expect((await j(await call(jar.BT, 'GET', '/api/push/recent'))).alerts.some((a: any) => /partner chat$/.test(a.title))).toBe(true);
    expect((await call(jar.BLD, 'PUT', '/api/pcontrol/team/USR-TEAM-005/policy', { canVerify: false })).status).toBe(200);
    expect((await call(jar.BT, 'GET', `/api/partner-chats/${T1}`)).status).toBe(403);
  });
});

describe('when the partnership ends', () => {
  it('the chat stays readable but takes no new messages', async () => {
    expect((await call(jar.B2, 'POST', `/api/partner-chats/${T2}/messages`, { text: 'Hello sir' })).status).toBe(200);
    const proj = await j(await call(jar.BLD, 'GET', '/api/pcontrol/builder/projects'));
    const ids: string[] = (proj.projects || []).map((p: any) => p.id);
    for (const pid of ids) {
      const d = await j(await call(jar.BLD, 'GET', `/api/pcontrol/builder/projects/${pid}`));
      for (const m of (d.partners || []).filter((x: any) => x.brokerId === 'USR-BRK-002' && !['REVOKED', 'DECLINED', 'COMPLETED'].includes(x.status))) {
        const r = await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${m.id}/status`, { action: 'REVOKE', reason: 'Season over, thank you' });
        expect(r.status, await r.clone().text()).toBe(200);
      }
    }
    const t = await j(await call(jar.B2, 'GET', `/api/partner-chats/${T2}`));
    expect(t.thread.open).toBe(false); expect(t.thread.messages.length).toBe(1);
    const r = await call(jar.B2, 'POST', `/api/partner-chats/${T2}/messages`, { text: 'one more' });
    expect(r.status).toBe(409); expect((await j(r)).code).toBe('CLOSED');
  });
});

describe('a photo on a project notice', () => {
  it('appointed partners see it; a broker outside the project does not; deleting the notice erases it', async () => {
    const r = await call(jar.BLD, 'POST', '/api/pcontrol/builder/projects/PROJ-RAI-02/updates', { kind: 'OFFER', title: 'Diwali offer: free parking', body: 'Poster attached', audience: 'ASSOCIATES', photo: jpeg(300) });
    expect(r.status, await r.clone().text()).toBe(200);
    const u = (await j(r)).update; expect(u.photoId).toMatch(/^WPH-/);
    expect((await call(jar.BLD, 'POST', '/api/pcontrol/builder/projects/PROJ-RAI-02/updates', { title: 'Bad photo', photo: Buffer.from('x'.repeat(200)).toString('base64') })).status).toBe(415);
    const seen = await j(await call(jar.B1, 'GET', '/api/pcontrol/partner/projects/PROJ-RAI-02'));
    expect(seen.updates.find((x: any) => x.id === u.id)?.photoId).toBe(u.photoId);
    expect(seen.project.builderId).toBe(BLD);
    expect((await call(jar.B1, 'GET', `/api/pcontrol/notice-photo/${u.photoId}`)).status).toBe(200);
    expect((await call(jar.BLD, 'GET', `/api/pcontrol/notice-photo/${u.photoId}`)).status).toBe(200);
    expect((await call(jar.B3, 'GET', `/api/pcontrol/notice-photo/${u.photoId}`)).status).toBe(404);
    expect((await call(jar.B1, 'GET', `/api/partner-chats/photo/${u.photoId}`)).status).toBe(404); // not a chat photo
    expect((await call(jar.BLD, 'DELETE', `/api/pcontrol/builder/updates/${u.id}`)).status).toBe(200);
    expect((await call(jar.B1, 'GET', `/api/pcontrol/notice-photo/${u.photoId}`)).status).toBe(404);
  });
});
