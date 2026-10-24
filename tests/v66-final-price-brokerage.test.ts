import { mandateShareAt } from '../src/shared/mandateShare';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * v66 — the owner's mandate applied to the FINAL price of a deal (offer / agreement / typed), shown only to the owner and the listing broker.
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v66-'));
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



const deal = async (who: string) => (await (await call(jar[who], 'GET', `/api/deals/${DEAL}`)).json());

describe('mandateShareAt (pure)', () => {
  const net = { remunerationBasis: 'SURPLUS_ABOVE_NET' as const, approvedNetPrice: 3_000_000 };
  it('net amount: broker gets what is above the net, never below 0; owner never loses his net while the price allows', () => {
    expect(mandateShareAt(net, 4_500_000)).toEqual({ broker: 1_500_000, owner: 3_000_000, belowNet: false });
    expect(mandateShareAt(net, 4_000_000)).toEqual({ broker: 1_000_000, owner: 3_000_000, belowNet: false });
    expect(mandateShareAt(net, 4_800_000)).toEqual({ broker: 1_800_000, owner: 3_000_000, belowNet: false }); // above the asking price: the extra is the broker's
    expect(mandateShareAt(net, 3_000_000)).toEqual({ broker: 0, owner: 3_000_000, belowNet: false });
    expect(mandateShareAt(net, 2_800_000)).toEqual({ broker: 0, owner: 2_800_000, belowNet: true });
  });
  it('percentage follows the price; fixed fee stays, but never more than the price', () => {
    expect(mandateShareAt({ remunerationBasis: 'PERCENTAGE', agreedCommissionPct: 2 }, 4_000_000)).toMatchObject({ broker: 80_000, owner: 3_920_000 });
    expect(mandateShareAt({ remunerationBasis: 'FIXED_FEE', fixedFeeAmount: 100_000 }, 3_000_000)).toMatchObject({ broker: 100_000, owner: 2_900_000 });
    expect(mandateShareAt({ remunerationBasis: 'FIXED_FEE', fixedFeeAmount: 100_000 }, 50_000)).toMatchObject({ broker: 50_000, owner: 0 });
  });
});

describe('final price on a deal', () => {
  it('only the owner and the listing broker see the mandate share; the other broker sees none', async () => {
    const o = (await deal('OWNER')).brokerage; const l = (await deal(principal)).brokerage;
    expect(l?.mandate).toBe(true); expect(o?.mandate).toBe(true);
    expect((await deal(outsider)).brokerage).toBeUndefined();
    expect((await deal('B3')).brokerage ?? null).toBeNull();
    expect(JSON.stringify((await deal(outsider)))).not.toContain(String(l.net));
  });
  it('a deal broker types the final price: it flows into the share and the bill hint; below the owner’s net is flagged', async () => {
    const before = (await deal(principal)).brokerage;
    expect(before.source).toBe('ASKING');
    const lower = Math.round(before.asking * 0.97);
    const r = await call(jar[principal], 'POST', `/api/deals/${DEAL}/final-price`, { price: lower });
    expect(r.status).toBe(200);
    const after = (await deal(principal)).brokerage;
    expect(after).toMatchObject({ price: lower, source: 'MANUAL', broker: Math.max(0, lower - before.net), owner: Math.min(before.net, lower) });
    expect((await deal('OWNER')).brokerage.price).toBe(lower);
    const bill = await (await call(jar[principal], 'GET', `/api/deals/${DEAL}/payment-requests`)).json();
    if (bill.prefill?.owner?.amount !== undefined) expect(bill.prefill.owner.amount).toBe(after.broker);
    const low = await call(jar[principal], 'POST', `/api/deals/${DEAL}/final-price`, { price: before.net - 100_000 });
    expect(low.status).toBe(200); expect((await deal(principal)).brokerage).toMatchObject({ belowNet: true, broker: 0 });
    expect((await call(jar.OWNER, 'POST', `/api/deals/${DEAL}/final-price`, { price: 1 })).status).toBe(403);
    expect((await call(jar[principal], 'POST', `/api/deals/${DEAL}/final-price`, { price: -5 })).status).toBe(400);
  });
  it('an accepted offer opens a deal room whose value is the offer (a counter updates it)', async () => {
    const prop = (await (await call(jar.B1, 'GET', `/api/properties/${PROP}`)).json()).property;
    const amount = Math.round(prop.askingPrice * 0.93);
    const mk = await call(jar.B3, 'POST', '/api/offers', { propertyId: PROP, buyerName: 'Final Buyer', buyerPhone: '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0'), consent: true, amount, tokenProposed: 100000 });
    expect(mk.status, await mk.clone().text()).toBe(200);
    const off = (await mk.json()).offer;
    const acc = await (await call(jar.OWNER, 'POST', `/api/offers/${off.id}/decide`, { action: 'ACCEPT' })).json();
    const dealId = acc.offer.dealRoomId; expect(dealId).toBeTruthy();
    const d = (await (await call(jar.OWNER, 'GET', `/api/deals/${dealId}`)).json());
    expect(d.deal.dealValue).toBe(amount);
    expect(d.brokerage).toMatchObject({ price: amount, source: 'OFFER' });
  });
});
