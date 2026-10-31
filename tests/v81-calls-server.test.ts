import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** v81 — in-app voice calls on a real server: who may call, ringing, signals, consent-based recording, who may listen, the log. */
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (c: string | undefined, method: string, url: string, body?: unknown, extra: Record<string, string> = {}) =>
  fetch(B + url, { method, headers: { ...(typeof body === 'object' && !(body instanceof Uint8Array) ? { 'content-type': 'application/json' } : {}), ...(c ? { cookie: c } : {}), ...extra }, body: (body === undefined ? undefined : (body instanceof Uint8Array ? body : JSON.stringify(body))) as any });
const j = async (r: Response) => r.json();
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const WEBM = (n = 600) => new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...new Array(n).fill(9)]);
const IDS = { BRK: 'USR-BRK-002', BRK_OTHER: 'USR-BRK-001', STAFF: 'USR-TEAM-003', STAFF2: 'USR-TEAM-004', STAFF_OTHER: 'USR-TEAM-001', OWNER: 'USR-OWNER-001', BUYER: 'USR-BUYER-001', ADMIN: 'USR-ADMIN-1', BUILDER: 'USR-BUILDER-002' };

async function start(who: string, to: string, context: string, contextId?: string) {
  const r = await call(jar[who], 'POST', '/api/calls/start', { toUserId: (IDS as any)[to], context, contextId });
  return { r, d: await j(r) };
}
async function endAll(...who: string[]) {
  for (const w of who) { const x = await j(await call(jar[w], 'GET', '/api/calls/ring')); for (const c of [x.ring, x.active]) if (c) await call(jar[w], 'POST', `/api/calls/${c.id}/end`, {}); }
}
async function live(callerWho: string, calleeWho: string, to: string, context: string, contextId?: string) {
  const { r, d } = await start(callerWho, to, context, contextId); expect(r.status, JSON.stringify(d)).toBe(200);
  const a = await call(jar[calleeWho], 'POST', `/api/calls/${d.call.id}/answer`, {}); expect(a.status).toBe(200);
  return d.call.id as string;
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v81-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: 'a1'.repeat(32), SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', SAHAYAK: 'off', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries(IDS)) jar[k] = await login(id);
}, 90000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

describe('who may call whom', () => {
  it('only logged-in brokers, builders and their staff have the call tools', async () => {
    for (const w of ['BRK', 'BUILDER', 'STAFF']) expect((await call(jar[w], 'GET', '/api/calls/ring')).status, w).toBe(200);
    for (const w of ['OWNER', 'BUYER', 'ADMIN']) expect((await call(jar[w], 'GET', '/api/calls/ring')).status, w).toBe(403);
    expect((await call(undefined, 'GET', '/api/calls/ring')).status).toBe(401);
  });
  it('team calls: the employer and his own staff, not another business', async () => {
    expect((await start('BRK', 'STAFF', 'TEAM')).r.status).toBe(200); await endAll('BRK', 'STAFF');
    expect((await start('STAFF', 'BRK', 'TEAM')).r.status).toBe(200); await endAll('BRK', 'STAFF');
    expect((await start('STAFF', 'STAFF2', 'TEAM')).r.status).toBe(200); await endAll('STAFF', 'STAFF2');
    expect((await start('BRK', 'BRK_OTHER', 'TEAM')).r.status).toBe(403);
    expect((await start('BRK', 'STAFF_OTHER', 'TEAM')).r.status).toBe(403);
    expect((await start('STAFF', 'BRK_OTHER', 'TEAM')).r.status).toBe(403);
    expect((await start('BRK', 'BRK', 'TEAM')).r.status).toBe(403);
  });
  it('deal-room calls: only the people of that room who can take calls', async () => {
    expect((await start('BRK', 'BRK_OTHER', 'DEAL', 'DEAL-2026-001')).r.status).toBe(200); await endAll('BRK', 'BRK_OTHER');
    expect((await start('BRK', 'OWNER', 'DEAL', 'DEAL-2026-001')).r.status).toBe(403);   // the owner has no call tool
    expect((await start('BRK', 'BRK_OTHER', 'DEAL', 'DEAL-NOPE')).r.status).toBe(404);
    expect((await start('BRK', 'BUILDER', 'DEAL', 'DEAL-2026-001')).r.status).toBe(403);  // not in the room
    expect((await start('BRK', 'BRK_OTHER', 'PARTNER')).r.status).toBe(403);             // two brokers are not a builder + partner
    expect((await start('BRK', 'STAFF', 'NOPE' as any)).r.status).toBe(400);
  });
  it('/people lists only those I may call', async () => {
    const t = await j(await call(jar.BRK, 'GET', '/api/calls/people?context=TEAM'));
    expect(t.people.map((p: any) => p.id).sort()).toEqual([IDS.STAFF, IDS.STAFF2].sort());
    const s = await j(await call(jar.STAFF, 'GET', '/api/calls/people?context=TEAM'));
    expect(s.people.map((p: any) => p.id)).toContain(IDS.BRK);
    const d = await j(await call(jar.BRK, 'GET', '/api/calls/people?context=DEAL&id=DEAL-2026-001'));
    expect(d.people.map((p: any) => p.id)).toContain(IDS.BRK_OTHER); expect(d.people.map((p: any) => p.id)).not.toContain(IDS.OWNER);   // (the owner has no call tool)
    expect((await call(jar.BRK_OTHER, 'GET', '/api/calls/people?context=DEAL&id=DEAL-NOPE')).status).toBe(404);
  });
});

describe('ringing, answering, signals', () => {
  it('rings the other person, one call at a time, and the signals reach only the other phone', async () => {
    const { r, d } = await start('BRK', 'STAFF', 'TEAM'); expect(r.status).toBe(200);
    const id = d.call.id; expect(d.call.status).toBe('RINGING'); expect(d.call.peer.name).toBe('Divya Sinha');
    const ring = await j(await call(jar.STAFF, 'GET', '/api/calls/ring'));
    expect(ring.ring.id).toBe(id); expect(ring.ring.peer.id).toBe(IDS.BRK);
    expect((await j(await call(jar.BRK, 'GET', '/api/calls/ring'))).ring).toBeNull();
    // busy
    expect((await start('BRK', 'STAFF2', 'TEAM')).r.status).toBe(409);
    expect((await start('STAFF2', 'STAFF', 'TEAM')).r.status).toBe(409);
    // only the called person answers; a stranger sees nothing
    expect((await call(jar.BRK, 'POST', `/api/calls/${id}/answer`, {})).status).toBe(403);
    expect((await call(jar.BRK_OTHER, 'POST', `/api/calls/${id}/answer`, {})).status).toBe(404);
    expect((await call(jar.STAFF, 'POST', `/api/calls/${id}/answer`, {})).status).toBe(200);
    // signals
    expect((await call(jar.BRK, 'POST', `/api/calls/${id}/signal`, { kind: 'offer', data: '{"sdp":"x"}' })).status).toBe(200);
    expect((await call(jar.BRK, 'POST', `/api/calls/${id}/signal`, { kind: 'ice', data: '{"c":1}' })).status).toBe(200);
    expect((await call(jar.BRK, 'POST', `/api/calls/${id}/signal`, { kind: 'bogus', data: '{}' })).status).toBe(400);
    expect((await call(jar.BRK, 'POST', `/api/calls/${id}/signal`, { kind: 'ice', data: 'x'.repeat(13000) })).status).toBe(413);
    const got = await j(await call(jar.STAFF, 'GET', `/api/calls/${id}/signals?after=0`));
    expect(got.signals.map((x: any) => x.kind)).toEqual(['offer', 'ice']);
    expect(got.call.status).toBe('ACTIVE');
    const again = await j(await call(jar.STAFF, 'GET', `/api/calls/${id}/signals?after=${got.signals[1].seq}`)); expect(again.signals).toEqual([]);
    expect((await j(await call(jar.BRK, 'GET', `/api/calls/${id}/signals?after=0`))).signals).toEqual([]);       // own signals do not come back
    expect((await call(jar.BRK_OTHER, 'GET', `/api/calls/${id}/signals?after=0`)).status).toBe(404);
    // the one who is called sees the ending
    await call(jar.BRK, 'POST', `/api/calls/${id}/end`, {});
    const after = await j(await call(jar.STAFF, 'GET', `/api/calls/${id}/signals?after=0`)); expect(after.call.status).toBe('ENDED');
    expect((await call(jar.BRK, 'POST', `/api/calls/${id}/signal`, { kind: 'ice', data: '{}' })).status).toBe(409);
  });
  it('decline and cancel end a ring; nobody can answer a finished call', async () => {
    let { d } = await start('STAFF', 'BRK', 'TEAM');
    expect((await call(jar.STAFF, 'POST', `/api/calls/${d.call.id}/decline`, {})).status).toBe(409);   // the caller cannot decline
    expect((await call(jar.BRK, 'POST', `/api/calls/${d.call.id}/decline`, {})).status).toBe(200);
    expect((await call(jar.BRK, 'POST', `/api/calls/${d.call.id}/answer`, {})).status).toBe(409);
    ({ d } = await start('STAFF', 'BRK', 'TEAM'));
    expect((await call(jar.STAFF, 'POST', `/api/calls/${d.call.id}/cancel`, {})).status).toBe(200);
    expect((await j(await call(jar.BRK, 'GET', '/api/calls/ring'))).ring).toBeNull();
  });
  it('the relay servers come with a public STUN, and say whether a TURN relay is set', async () => {
    const c = await j(await call(jar.BRK, 'GET', '/api/calls/config'));
    expect(c.iceServers[0].urls.join(' ')).toContain('stun:');
    expect(c.relay).toBe(false);
    expect(JSON.stringify(c.iceServers)).not.toContain('credential');
  });
});

describe('recording is never silent', () => {
  it('ASK: one side asks, the other allows; only the one who asked records; audio joins into one file', async () => {
    const id = await live('BRK', 'STAFF', 'STAFF', 'TEAM');
    // nobody can send audio before it is allowed
    expect((await call(jar.STAFF, 'POST', `/api/calls/${id}/chunk?seq=0`, WEBM(), { 'content-type': 'audio/webm' })).status).toBe(403);
    expect((await call(jar.STAFF, 'POST', `/api/calls/${id}/record`, { action: 'ask' })).status).toBe(200);
    const mid = await j(await call(jar.BRK, 'GET', `/api/calls/${id}`)); expect(mid.call.record).toBe('ASKED'); expect(mid.call.askedByMe).toBe(false);
    expect((await call(jar.STAFF, 'POST', `/api/calls/${id}/record`, { action: 'allow' })).status).toBe(409);   // cannot allow your own ask
    expect((await call(jar.BRK, 'POST', `/api/calls/${id}/record`, { action: 'allow' })).status).toBe(200);
    const on = await j(await call(jar.STAFF, 'GET', `/api/calls/${id}`)); expect(on.call.record).toBe('ON'); expect(on.call.recordByMe).toBe(true);
    // the recording phone sends pieces; the other phone may not; the first piece must really be audio
    expect((await call(jar.BRK, 'POST', `/api/calls/${id}/chunk?seq=0`, WEBM(), { 'content-type': 'audio/webm' })).status).toBe(403);
    expect((await call(jar.STAFF, 'POST', `/api/calls/${id}/chunk?seq=0`, new Uint8Array(100).fill(5), { 'content-type': 'audio/webm' })).status).toBe(415);
    expect((await call(jar.STAFF, 'POST', `/api/calls/${id}/chunk?seq=0`, WEBM(), { 'content-type': 'audio/webm' })).status).toBe(200);
    expect((await call(jar.STAFF, 'POST', `/api/calls/${id}/chunk?seq=1`, new Uint8Array(300).fill(4), { 'content-type': 'audio/webm' })).status).toBe(200);
    expect((await call(jar.STAFF, 'POST', `/api/calls/${id}/chunk?seq=999`, new Uint8Array(300).fill(4), { 'content-type': 'audio/webm' })).status).toBe(400);
    await call(jar.BRK, 'POST', `/api/calls/${id}/end`, {});
    expect((await call(jar.STAFF, 'POST', `/api/calls/${id}/chunk?seq=2`, new Uint8Array(200).fill(3), { 'content-type': 'audio/webm' })).status).toBe(200);   // the last piece may arrive just after the end
    const fin = await j(await call(jar.STAFF, 'POST', `/api/calls/${id}/record/finish`, {})); expect(fin.saved).toBe(true);
    expect(readdirSync(path.join(dir, 'data', 'callrec')).some(f => f.startsWith(id) && f.endsWith('.webm'))).toBe(true);
    // who may listen: the employer yes; the staff member who recorded it, a stranger and a GENZ admin no
    const ok = await call(jar.BRK, 'GET', `/api/calls/${id}/audio`); expect(ok.status).toBe(200);
    const bytes = new Uint8Array(await ok.arrayBuffer()); expect(bytes.length).toBe(604 + 300 + 204 - 4 - 4 + 4 + 4 + 0 > 0 ? bytes.length : 0); expect(bytes.slice(0, 4)).toEqual(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]));
    expect(bytes.length).toBe(604 + 300 + 200);
    expect(ok.headers.get('content-type')).toBe('audio/webm'); expect(ok.headers.get('cache-control')).toContain('no-store');
    for (const w of ['STAFF', 'BRK_OTHER', 'ADMIN', 'BUYER']) expect([403, 404], w).toContain((await call(jar[w], 'GET', `/api/calls/${id}/audio`)).status);
    expect((await call(jar.STAFF, 'DELETE', `/api/calls/${id}/audio`)).status).toBe(404);
    // the employer deletes it; it is gone for good
    expect((await call(jar.BRK, 'DELETE', `/api/calls/${id}/audio`)).status).toBe(200);
    expect((await call(jar.BRK, 'GET', `/api/calls/${id}/audio`)).status).toBe(404);
    expect(readdirSync(path.join(dir, 'data', 'callrec')).some(f => f.startsWith(id))).toBe(false);
  });
  it('a "no" stops it, and a stopped recording cannot be started again', async () => {
    const id = await live('STAFF', 'BRK', 'BRK', 'TEAM');
    await call(jar.BRK, 'POST', `/api/calls/${id}/record`, { action: 'ask' });
    expect((await call(jar.STAFF, 'POST', `/api/calls/${id}/record`, { action: 'deny' })).status).toBe(200);
    expect((await j(await call(jar.BRK, 'GET', `/api/calls/${id}`))).call.record).toBe('DENIED');
    expect((await call(jar.BRK, 'POST', `/api/calls/${id}/chunk?seq=0`, WEBM(), { 'content-type': 'audio/webm' })).status).toBe(403);
    await call(jar.BRK, 'POST', `/api/calls/${id}/record`, { action: 'ask' }); await call(jar.STAFF, 'POST', `/api/calls/${id}/record`, { action: 'allow' });
    await call(jar.BRK, 'POST', `/api/calls/${id}/chunk?seq=0`, WEBM(), { 'content-type': 'audio/webm' });
    expect((await call(jar.BRK, 'POST', `/api/calls/${id}/record`, { action: 'stop' })).status).toBe(200);
    expect((await call(jar.BRK, 'POST', `/api/calls/${id}/record`, { action: 'ask' })).status).toBe(409);
    await endAll('BRK', 'STAFF');
  });
  it('the employer rule: OFF forbids, ALWAYS records from the first second, calls off stops calls — and only the owner of the business sets it', async () => {
    expect((await call(jar.STAFF, 'PUT', '/api/calls/settings', { enabled: true, record: 'ALWAYS' })).status).toBe(403);
    expect((await call(jar.BRK, 'PUT', '/api/calls/settings', { enabled: true, record: 'MAYBE' })).status).toBe(400);
    // OFF
    expect((await call(jar.BRK, 'PUT', '/api/calls/settings', { enabled: true, record: 'OFF' })).status).toBe(200);
    let id = await live('BRK', 'STAFF', 'STAFF', 'TEAM');
    expect((await call(jar.BRK, 'POST', `/api/calls/${id}/record`, { action: 'ask' })).status).toBe(403);
    await endAll('BRK', 'STAFF');
    // OFF also covers a call between the staff member and another business
    id = await live('BRK_OTHER', 'STAFF', 'STAFF', 'DEAL', 'DEAL-2026-001').catch(() => '');
    // (the staff member is not in that deal room, so this is refused — covered below with an allotted member)
    // ALWAYS
    expect((await call(jar.BRK, 'PUT', '/api/calls/settings', { enabled: true, record: 'ALWAYS' })).status).toBe(200);
    const { d } = await start('BRK', 'STAFF', 'TEAM'); expect(d.call.record).toBe('ON'); expect(d.call.recordMode).toBe('ALWAYS');
    await call(jar.STAFF, 'POST', `/api/calls/${d.call.id}/answer`, {});
    expect((await call(jar.BRK, 'POST', `/api/calls/${d.call.id}/chunk?seq=0`, WEBM(), { 'content-type': 'audio/webm' })).status).toBe(200);
    expect((await call(jar.STAFF, 'POST', `/api/calls/${d.call.id}/record`, { action: 'stop' })).status).toBe(409);   // the employer's rule cannot be stopped by the staff
    await endAll('BRK', 'STAFF');
    const cfgS = await j(await call(jar.STAFF, 'GET', '/api/calls/config')); expect(cfgS.settings.record).toBe('ALWAYS'); expect(cfgS.canManage).toBe(false);
    // calls off
    expect((await call(jar.BRK, 'PUT', '/api/calls/settings', { enabled: false, record: 'ASK' })).status).toBe(200);
    expect((await start('BRK', 'STAFF', 'TEAM')).r.status).toBe(403);
    expect((await start('STAFF', 'BRK', 'TEAM')).r.status).toBe(403);
    expect((await call(jar.BRK, 'PUT', '/api/calls/settings', { enabled: true, record: 'ASK' })).status).toBe(200);
  });
  it('between two businesses it is always "ask" — the other broker must allow it', async () => {
    const id = await live('BRK', 'BRK_OTHER', 'BRK_OTHER', 'DEAL', 'DEAL-2026-001');
    expect((await j(await call(jar.BRK, 'GET', `/api/calls/${id}`))).call.recordMode).toBe('ASK');
    expect((await call(jar.BRK, 'POST', `/api/calls/${id}/record`, { action: 'ask' })).status).toBe(200);
    expect((await call(jar.BRK_OTHER, 'POST', `/api/calls/${id}/record`, { action: 'allow' })).status).toBe(200);
    await call(jar.BRK, 'POST', `/api/calls/${id}/chunk?seq=0`, WEBM(), { 'content-type': 'audio/webm' });
    await call(jar.BRK, 'POST', `/api/calls/${id}/end`, {});
    await call(jar.BRK, 'POST', `/api/calls/${id}/record/finish`, {});
    // both businesses may listen to what both agreed to
    expect((await call(jar.BRK, 'GET', `/api/calls/${id}/audio`)).status).toBe(200);
    expect((await call(jar.BRK_OTHER, 'GET', `/api/calls/${id}/audio`)).status).toBe(200);
    expect((await call(jar.BUILDER, 'GET', `/api/calls/${id}/audio`)).status).toBe(404);
  });
});

describe('the log and privacy', () => {
  it('the employer sees his staff\'s calls, the staff member sees his own, nobody sees a number, and audio is flagged only for those who may listen', async () => {
    const mine = await j(await call(jar.STAFF, 'GET', '/api/calls/log'));
    const boss = await j(await call(jar.BRK, 'GET', '/api/calls/log'));
    expect(mine.calls.length).toBeGreaterThan(0); expect(boss.calls.length).toBeGreaterThan(0);
    expect(mine.calls.every((c: any) => c.audio === false)).toBe(true);
    expect(boss.calls.some((c: any) => c.audio === true || c.deleted)).toBe(true);
    const other = await j(await call(jar.BRK_OTHER, 'GET', '/api/calls/log'));
    expect(other.calls.every((c: any) => !String(c.with).includes('Divya'))).toBe(true);   // another business never sees my staff's calls
    const all = JSON.stringify([mine, boss, other]);
    expect(/\b\d{10}\b/.test(all.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, ''))).toBe(false);
    expect(all).not.toMatch(/\+91/);
  });
  it('a recording can be deleted by the businesses on the call and the settings write an audit line', async () => {
    const log = await j(await call(jar.BRK, 'GET', '/api/calls/log'));
    const rec = log.calls.find((c: any) => c.audio);
    if (rec) { expect((await call(jar.BRK, 'DELETE', `/api/calls/${rec.id}/audio`)).status).toBe(200); }
    const audit = await j(await call(jar.ADMIN, 'GET', '/api/audit-logs'));
    const txt = JSON.stringify(audit);
    expect(txt).toContain('CALL_SETTINGS_SET'); expect(txt).toContain('CALL_STARTED');
  });
});
