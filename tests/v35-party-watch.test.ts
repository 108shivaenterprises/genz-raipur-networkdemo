import { freePort } from './helpers/port';
/**
 * v35 — Buyer bond: the broker who brought the BUYER first (verified visit / offer) is protected on that property.
 * Another broker is stopped (visit + offer) without being told who holds the buyer, can ask to co-broke, and the holder is
 * alerted if the property is marked sold. GENZ staff can cancel a bond on proof.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { ackBuyer } from './helpers/ack.js';

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
const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const slot = (h = 1) => new Date(Date.now() + h * 3600_000).toISOString();

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v35-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', BRK3: 'USR-BRK-003', OWN: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

let PA: any; const X = rnd(); const Y = [rnd(), rnd(), rnd(), rnd()];
const rep = (who: string, phone: string, extra: Record<string, unknown> = {}) => call(jar[who], 'POST', '/api/party-watch/report', { phone, partyName: 'Rakesh Gupta', partyKind: 'BUYER', category: 'COMMISSION_REFUSED', note: 'Visited twice, then said no commission and went to the owner directly.', ...extra });
const level = async (who: string, phone: string) => (await j(await call(jar[who], 'POST', '/api/party-watch/check', { phone }))).level;
const book = (who: string, phone: string) => call(jar[who], 'POST', '/api/site-visits', { propertyId: PA.id, customerName: 'Rakesh', customerPhone: phone, scheduledTime: slot(2) });

describe('Network Watch', () => {
  it('setup + a clean mobile checks clear', async () => {
    const all = (await j(await call(jar.ADMIN, 'GET', '/api/properties'))).properties as any[];
    PA = all.find(p => p.listingBrokerId === 'USR-BRK-001' && p.ownerId === 'USR-OWNER-001' && p.transactionType === 'Sale' && p.listingStatus === 'active' && p.verificationStatus === 'VERIFIED');
    expect(PA).toBeTruthy();
    expect(await level('BRK1', X)).toBe('NONE');
    expect((await call(jar.BRK1, 'POST', '/api/party-watch/check', { phone: '123' })).status).toBe(400);
    expect((await call(undefined, 'POST', '/api/party-watch/check', { phone: X })).status).toBe(401);
  });

  it('a report needs a real note, a name and — if proof is named — a record of the reporter\'s own', async () => {
    expect((await rep('BRK2', X, { note: 'bad' })).status).toBe(400);
    expect((await rep('BRK2', X, { category: 'NOPE' })).status).toBe(400);
    const np = await rep('BRK2', X, { evidenceKind: 'VISIT' });
    expect(np.status).toBe(400); expect((await np.json()).code).toBe('NO_PROOF');
  });

  it('one report = WATCH: only staff see it, the network still sees nothing', async () => {
    expect((await book('BRK2', X)).status).toBe(200);
    const r = await rep('BRK2', X, { evidenceKind: 'VISIT' });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await r.json()).report.evidence.verified).toBe(true);
    expect(await level('BRK1', X)).toBe('NONE');
    expect((await rep('BRK2', X)).status).toBe(409);
    const adm = await j(await call(jar.ADMIN, 'GET', '/api/party-watch/admin'));
    expect(adm.alerts.find((a: any) => a.last4 === X.slice(-4)).level).toBe('WATCH');
    expect(adm.counts.open).toBeGreaterThan(0);
  });

  it('a second broker with proof → CAUTION for the whole network; visits still work but carry the notice', async () => {
    expect((await book('BRK3', X)).status).toBe(200);
    expect((await rep('BRK3', X, { evidenceKind: 'VISIT', partyName: 'R Gupta' })).status).toBe(200);
    expect(await level('BRK1', X)).toBe('CAUTION');
    const chk = await j(await call(jar.BRK1, 'POST', '/api/party-watch/check', { phone: X }));
    expect(chk.message.hi).toBeTruthy();
    expect(JSON.stringify(chk)).not.toContain('Rakesh'); expect(JSON.stringify(chk)).not.toContain('BRK');   // no names, no reporters
    const v = await book('BRK1', X);
    expect(v.status).toBe(200); expect((await v.json()).watch.level).toBe('CAUTION');
  });

  it('only staff can block, and only after a report was upheld; brokers cannot reach the review desk', async () => {
    expect((await call(jar.BRK1, 'GET', '/api/party-watch/admin')).status).toBe(403);
    const adm = await j(await call(jar.ADMIN, 'GET', '/api/party-watch/admin?queue=caution'));
    const a = adm.alerts.find((x: any) => x.last4 === X.slice(-4)); expect(a.reports.length).toBe(2);
    expect(a.reports[0].brokerName).toBeTruthy();
    expect((await call(jar.ADMIN, 'POST', `/api/party-watch/admin/${a.id}/decide`, { action: 'BLOCK', note: 'Confirmed by both brokers' })).status).toBe(409);
    expect((await call(jar.BRK1, 'POST', `/api/party-watch/admin/${a.id}/decide`, { action: 'BLOCK', note: 'Confirmed by both brokers' })).status).toBe(403);
    for (const x of a.reports) expect((await call(jar.ADMIN, 'POST', `/api/party-watch/admin/${a.id}/report/${x.id}`, { verdict: 'UPHOLD', note: 'Visit record and call log match' })).status).toBe(200);
    expect((await call(jar.ADMIN, 'POST', `/api/party-watch/admin/${a.id}/decide`, { action: 'BLOCK', note: 'Confirmed by both brokers' })).status).toBe(200);
    expect(await level('BRK1', X)).toBe('BLOCKED');
  });

  it('BLOCKED: no visit, no client room for this mobile', async () => {
    const v = await book('BRK1', X);
    expect(v.status).toBe(403); const b = await v.json(); expect(b.code).toBe('PARTY_BLOCKED'); expect(b.hi).toBeTruthy();
    const room = await call(jar.BRK1, 'POST', '/api/client-rooms', { clientName: 'Rakesh', phone: X, consent: true });
    expect(room.status).toBe(403); expect((await room.json()).code).toBe('PARTY_BLOCKED');
    const ok = await call(jar.BRK1, 'POST', '/api/client-rooms', { clientName: 'Someone', phone: rnd(), consent: true });
    expect(ok.status).toBe(200);
  });

  it('an appeal reaches staff; clearing the mobile lifts the block and ignores the old reports', async () => {
    expect((await call(jar.BRK1, 'POST', '/api/party-watch/appeal', { phone: X, note: 'x' })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', '/api/party-watch/appeal', { phone: X, note: 'They paid me the commission yesterday, please clear.' })).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', '/api/party-watch/appeal', { phone: rnd(), note: 'Nothing to appeal here at all.' })).status).toBe(404);
    const a = (await j(await call(jar.ADMIN, 'GET', '/api/party-watch/admin?queue=blocked'))).alerts.find((x: any) => x.last4 === X.slice(-4));
    expect(a.appeals.length).toBe(1);
    expect((await call(jar.ADMIN, 'POST', `/api/party-watch/admin/${a.id}/decide`, { action: 'CLEAR', note: 'Settled, commission received' })).status).toBe(200);
    expect(await level('BRK1', X)).toBe('NONE');
    expect((await book('BRK1', X)).status).toBe(200);
  });

  it('a dismissed report is a strike on the reporter: 3 in a year and he cannot report any more', async () => {
    for (const p of Y.slice(0, 3)) {
      const r = await rep('BRK2', p); expect(r.status, await r.clone().text()).toBe(200);
      const a = (await j(await call(jar.ADMIN, 'GET', '/api/party-watch/admin?queue=open'))).alerts.find((x: any) => x.last4 === p.slice(-4));
      expect((await call(jar.ADMIN, 'POST', `/api/party-watch/admin/${a.id}/report/${a.reports[0].id}`, { verdict: 'DISMISS', note: 'No evidence, the party paid.' })).status).toBe(200);
    }
    expect((await j(await call(jar.BRK2, 'GET', '/api/party-watch/mine'))).dismissed).toBeGreaterThanOrEqual(3);
    const locked = await rep('BRK2', Y[3]);
    expect(locked.status).toBe(403); expect((await locked.json()).code).toBe('REPORT_LOCKED');
  });
});
