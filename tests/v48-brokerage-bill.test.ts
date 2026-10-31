import { freePort } from './helpers/port';
/** v48 — brokerage bills to the owner / buyer: made from the Agreement stage, public bill page with UPI, party says paid, broker confirms, reminders, privacy */
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v48-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });



let deal: any; let bill: any; let token = '';
describe('brokerage bill', () => {
  it('only from the Agreement stage', async () => {
    const list = await (await call(jar.BRK2, 'GET', '/api/properties')).json();
    const prop = (Array.isArray(list) ? list : list.properties).find((p: any) => p.listingBrokerId === 'USR-BRK-001' && p.verificationStatus === 'VERIFIED');
    const o = await call(jar.BRK2, 'POST', '/api/collaborations', { propertyId: prop.id, feeMode: 'OWN_SIDE', proposerSide: 'BUYER', terms: 'buyer side mine, seller side yours', receivingBrokerId: 'USR-BRK-001' });
    const a = await call(jar.BRK1, 'POST', `/api/collaborations/${(await o.json()).offer.id}/respond`, { decision: 'ACCEPT' });
    deal = (await a.json()).dealRoom;
    const early = await call(jar.BRK1, 'POST', `/api/deals/${deal.id}/payment-requests`, { party: 'OWNER', partyName: 'Sunil', partyPhone: '9826155667', items: [{ text: 'Brokerage', amount: 1000 }], dueOn: new Date().toISOString().slice(0, 10) });
    expect(early.status).toBe(409);
    // reach Agreement: own-side undertaking by both, a visit outside the app confirmed by the other side
    expect((await call(jar.BRK1, 'PUT', `/api/deals/${deal.id}/sides/fee`, { amount: 120000 })).status).toBe(200);
    for (const who of ['BRK1', 'BRK2']) expect((await call(jar[who], 'POST', `/api/deals/${deal.id}/sides/undertaking`)).status).toBe(200);
    expect((await call(jar.BRK2, 'POST', `/api/deals/${deal.id}/offline-visit`, { visitedOn: new Date(Date.now() - 86400000).toISOString().slice(0, 10), note: 'Buyer saw it with the owner' })).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/deals/${deal.id}/offline-visit/confirm`)).status).toBe(200);
    for (const st of ['Site Visit Done', 'Negotiation', 'Agreement']) expect((await call(jar.BRK1, 'POST', `/api/deals/${deal.id}/stage`, { stage: st })).status).toBe(200);
  });

  it('the listing broker gets the owner prefilled; checks on GST, amounts and a second open bill', async () => {
    const g = await (await call(jar.BRK1, 'GET', `/api/deals/${deal.id}/payment-requests`)).json();
    expect(g.canBill).toBe(true);
    expect(g.prefill.owner.phone).toMatch(/^\d{10}$/);
    expect(g.prefill.owner.amount).toBe(120000);
    const g2 = await (await call(jar.BRK2, 'GET', `/api/deals/${deal.id}/payment-requests`)).json();
    expect(g2.prefill.owner.phone).toBe(''); // the buyer-side broker never gets the owner's number from here
    const base = { party: 'OWNER', partyName: g.prefill.owner.name || 'Owner', partyPhone: g.prefill.owner.phone, items: [{ text: 'Brokerage — sale', amount: 120000 }], dueOn: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), upiId: 'vikram@okaxis' };
    expect((await call(jar.BRK1, 'POST', `/api/deals/${deal.id}/payment-requests`, { ...base, gstPct: 18 })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', `/api/deals/${deal.id}/payment-requests`, { ...base, items: [{ text: 'x', amount: 0 }] })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', `/api/deals/${deal.id}/payment-requests`, { ...base, upiId: 'not-upi' })).status).toBe(400);
    const r = await call(jar.BRK1, 'POST', `/api/deals/${deal.id}/payment-requests`, { ...base, gstPct: 18, gstin: '22AAAAA0000A1Z5' });
    expect(r.status).toBe(200);
    bill = (await r.json()).request; token = bill.link.split('/pay/')[1];
    expect(bill.total).toBe(141600); expect(bill.number).toMatch(/\/\d{4}-\d{2}\/0001$/);
    expect((await call(jar.BRK1, 'POST', `/api/deals/${deal.id}/payment-requests`, base)).status).toBe(409);
  });

  it('the party opens the bill (UPI, total), says paid; the broker confirms; reminders are counted', async () => {
    const page = await (await fetch(`${B}/pay/${token}`)).text();
    expect(page).toContain('1,41,600'); expect(page).toContain('upi://pay'); expect(page).toContain('Tax invoice');
    expect((await call(jar.BRK1, 'POST', `/api/payment-requests/${bill.id}/remind`)).status).toBe(200);
    expect((await form(undefined, `/pay/${token}/paid`, { ref: 'UTR998877' })).status).toBe(303);
    let mine = (await (await call(jar.BRK1, 'GET', '/api/payment-requests')).json()).requests.find((x: any) => x.id === bill.id);
    expect(mine.status).toBe('PARTY_SAYS_PAID'); expect(mine.reminders.length).toBe(1); expect(mine.views).toBeGreaterThanOrEqual(1);
    const home = await (await call(jar.BRK1, 'GET', '/api/home/broker')).json();
    expect(home.counts.billsToConfirm).toBe(1);
    // the other broker cannot touch it
    expect((await call(jar.BRK2, 'POST', `/api/payment-requests/${bill.id}/received`, { ref: 'x1' })).status).toBe(404);
    expect((await (await call(jar.BRK2, 'GET', `/api/deals/${deal.id}/payment-requests`)).json()).requests.length).toBe(0);
    const outsider = await login('USR-BRK-003');
    expect((await call(outsider, 'GET', `/api/deals/${deal.id}/payment-requests`)).status).toBe(404);
    expect((await call(jar.BRK1, 'POST', `/api/payment-requests/${bill.id}/received`, {})).status).toBe(200); // takes the party's UTR
    mine = (await (await call(jar.BRK1, 'GET', '/api/payment-requests')).json()).requests.find((x: any) => x.id === bill.id);
    expect(mine.status).toBe('PAID'); expect(mine.paid.ref).toBe('UTR998877');
    expect(await (await fetch(`${B}/pay/${token}`)).text()).toContain('PAID');
    expect((await call(jar.BRK1, 'POST', `/api/payment-requests/${bill.id}/cancel`)).status).toBe(409);
  });
});
