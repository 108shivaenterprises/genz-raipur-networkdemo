import { freePort } from './helpers/port';
/** v47 — close a deal room that did not happen (ask → agree / no reply → closed; reopen) and a visit outside the app (other side confirms) */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';


const ROOT = path.resolve(__dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const form = (cookie: string | undefined, url: string, data: Record<string, string>) =>
  fetch(B + url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(data).toString() });
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v47-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', SAHAYAK: 'off', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true', DEAL_CLOSE_AUTO_MS: '1500' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });



const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function newDeal(skip = 0) {
  const list = await (await call(jar.BRK2, 'GET', '/api/properties')).json();
  const arr = (Array.isArray(list) ? list : list.properties).filter((p: any) => p.listingBrokerId === 'USR-BRK-001' && p.verificationStatus === 'VERIFIED');
  const prop = arr[skip];
  const o = await call(jar.BRK2, 'POST', '/api/collaborations', { propertyId: prop.id, proposedIntroducingShare: 50, proposedClosingShare: 50, terms: 'v47 test', receivingBrokerId: 'USR-BRK-001' });
  expect(o.status).toBe(200);
  const a = await call(jar.BRK1, 'POST', `/api/collaborations/${(await o.json()).offer.id}/respond`, { decision: 'ACCEPT' });
  expect(a.status).toBe(200);
  return (await a.json()).dealRoom;
}
const hubItem = async (who: string, id: string) => (await (await call(jar[who], 'GET', '/api/deal-hub')).json()).deals.find((d: any) => d.id === id);
let deal: any;

describe('close a deal room', () => {
  it('one asks, the other says “still on” → dropped; asks again, the other agrees → closed; a closed room cannot move; reopen', async () => {
    deal = await newDeal(0);
    expect(deal.stage).toBe('Introduction');
    expect((await call(jar.BRK2, 'POST', `/api/deals/${deal.id}/close`, { reason: 'NOPE' })).status).toBe(400);
    expect((await call(jar.BRK2, 'POST', `/api/deals/${deal.id}/close`, { reason: 'BUYER_BACKED_OUT', note: 'Buyer took another flat' })).status).toBe(200);
    expect((await hubItem('BRK1', deal.id)).next.map((n: any) => n.kind)).toContain('CLOSE_TO_ANSWER');
    expect((await call(jar.BRK2, 'POST', `/api/deals/${deal.id}/close/answer`, { agree: true })).status).toBe(409); // the asker cannot answer himself
    expect((await call(jar.BRK1, 'POST', `/api/deals/${deal.id}/close/answer`, { agree: false })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', `/api/deals/${deal.id}/close/answer`, { agree: false, note: 'Buyer called me today, still keen' })).status).toBe(200);
    expect((await hubItem('BRK1', deal.id)).closing).toBeUndefined();
    expect((await call(jar.BRK2, 'POST', `/api/deals/${deal.id}/close`, { reason: 'PRICE_NOT_AGREED' })).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/deals/${deal.id}/close/answer`, { agree: true })).status).toBe(200);
    const h = await hubItem('BRK2', deal.id);
    expect(h.closed).toBe(true); expect(h.next).toEqual([]);
    const k = (await (await call(jar.BRK2, 'GET', '/api/deal-hub')).json()).kpis; expect(k.closed).toBeGreaterThanOrEqual(1);
    const st = await call(jar.BRK1, 'POST', `/api/deals/${deal.id}/stage`, { stage: 'Site Visit Done' });
    expect(st.status).toBe(409); expect((await st.json()).code).toBe('DEAL_CLOSED');
    expect((await call(jar.BRK1, 'POST', `/api/deals/${deal.id}/reopen`, { note: '' })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', `/api/deals/${deal.id}/reopen`, { note: 'Buyer is back with a better offer' })).status).toBe(200);
    expect((await hubItem('BRK2', deal.id)).closed).toBe(false);
  });

  it('no reply within the window → closes by itself', async () => {
    const d2 = await newDeal(1);
    expect((await call(jar.BRK1, 'POST', `/api/deals/${d2.id}/close`, { reason: 'OWNER_WITHDREW' })).status).toBe(200);
    expect((await hubItem('BRK2', d2.id)).closed).toBe(false);
    await sleep(1700);
    expect((await hubItem('BRK2', d2.id)).closed).toBe(true);
  });

  it('someone outside the deal cannot close it', async () => {
    const other = await login('USR-BRK-003');
    expect((await call(other, 'POST', `/api/deals/${deal.id}/close`, { reason: 'OTHER', note: 'xx yy' })).status).toBe(403);
  });
});

describe('visit outside the app', () => {
  it('recorded by one side, confirmed only by the other; then the deal may move to “Site Visit Done”', async () => {
    const day = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10);
    expect((await call(jar.BRK2, 'POST', `/api/deals/${deal.id}/stage`, { stage: 'Site Visit Done' })).status).toBe(409);
    expect((await call(jar.BRK2, 'POST', `/api/deals/${deal.id}/offline-visit`, { visitedOn: '2099-01-01', note: 'Buyer saw the flat with me' })).status).toBe(400);
    expect((await call(jar.BRK2, 'POST', `/api/deals/${deal.id}/offline-visit`, { visitedOn: day, note: 'Buyer saw the flat with me and the owner' })).status).toBe(200);
    expect((await call(jar.BRK2, 'POST', `/api/deals/${deal.id}/offline-visit/confirm`)).status).toBe(403); // maker ≠ checker
    expect((await hubItem('BRK1', deal.id)).next.map((n: any) => n.kind)).toContain('OFFLINE_VISIT_TO_CONFIRM');
    expect((await call(jar.BRK2, 'POST', `/api/deals/${deal.id}/stage`, { stage: 'Site Visit Done' })).status).toBe(409);
    expect((await call(jar.BRK1, 'POST', `/api/deals/${deal.id}/offline-visit/confirm`)).status).toBe(200);
    const st = await call(jar.BRK2, 'POST', `/api/deals/${deal.id}/stage`, { stage: 'Site Visit Done' });
    expect(st.status).toBe(200);
    expect((await hubItem('BRK2', deal.id)).offlineVisit).toEqual({ confirmed: true, byMe: true });
    // nothing more to record once past the visit stage
    expect((await call(jar.BRK1, 'POST', `/api/deals/${deal.id}/offline-visit`, { visitedOn: day, note: 'again again' })).status).toBe(409);
  });
});
