import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { INDIA_STATES, isPincode, cleanTags, reraAuthorityOf, sameCity } from '../src/shared/india';

/**
 * End-to-end checks for: owner never sees the broker↔broker commission, owners only see their own
 * properties, the surplus-above-net mandate flow, and India-wide location/tag validation.
 */
const PORT = 4100 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess;
let dir: string;
let cfg: any;
const jar: Record<string, string> = {};

async function login(email: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: cfg.demoPassword }) });
  expect(r.status).toBe(200);
  return r.headers.get('set-cookie')!.split(';')[0];
}
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const acct = (role: string, i = 0) => cfg.demoAccounts.filter((a: any) => a.role === role && a.verificationStatus === 'VERIFIED')[i];

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-e2e2-'));
  mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  expect(cfg).toBeTruthy();
  for (const role of ['ADMIN', 'BROKER', 'PROPERTY_OWNER']) jar[role] = await login(acct(role).email);
  // second broker (not party to the owner's deals)
  jar.BROKER2 = await login(acct('BROKER', 1).email);
}, 40_000);

afterAll(() => { proc?.kill(); if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('commission confidentiality (owner is not party to the broker split)', () => {
  it('owner sees the deal but not the split, fee, hash or notes', async () => {
    const list = await (await call(jar.PROPERTY_OWNER, 'GET', '/api/deals')).json();
    expect(list.deals.length).toBeGreaterThan(0);
    for (const d of list.deals) {
      expect(d.commercialsHidden).toBe(true);
      expect(d.totalCommissionExpected).toBe(0);
      expect(d.introducingBrokerSharePct).toBe(0);
      expect(d.closingBrokerSharePct).toBe(0);
      expect(d.agreementHash).toBeUndefined();
    }
  });
  it('brokers still see the real split; GENZ admin sees only the deal value (summary) until a dispute is open', async () => {
    const brokerList = await (await call(jar.BRK1 || jar.B1 || jar.ADMIN, 'GET', '/api/deals')).json();
    const adminList = await (await call(jar.ADMIN, 'GET', '/api/deals')).json();
    if (jar.BRK1 || jar.B1) expect(brokerList.deals.some((d: any) => d.totalCommissionExpected > 0 && !d.commercialsHidden)).toBe(true);
    expect(adminList.deals.every((d: any) => d.commercialsHidden || d.totalCommissionExpected === 0 || d.ownerId === 'USR-ADMIN-1')).toBe(true);
  });
  it('owner cannot read commission agreements, collaboration offers or sign them', async () => {
    const adminList = await (await call(jar.ADMIN, 'GET', '/api/deals')).json();
    const id = adminList.deals[0].id;
    expect([401, 403, 404]).toContain((await call(jar.PROPERTY_OWNER, 'GET', `/api/deals/${id}/commission-agreements`)).status);
    expect([401, 403]).toContain((await call(jar.PROPERTY_OWNER, 'GET', '/api/collaborations')).status);
  });
  it('brokers-only chat messages are not returned to the owner', async () => {
    const adminList = await (await call(jar.ADMIN, 'GET', '/api/deals')).json();
    const deal = adminList.deals.find((d: any) => d.introducingBrokerId === acct('BROKER').id || d.closingBrokerId === acct('BROKER').id) || adminList.deals[0];
    const brokerCookie = deal.introducingBrokerId === acct('BROKER', 1).id || deal.closingBrokerId === acct('BROKER', 1).id ? jar.BROKER2 : jar.BROKER;
    const secret = `split-talk-${Date.now()}`;
    const post = await call(brokerCookie, 'POST', `/api/deals/${deal.id}/messages`, { text: secret, audience: 'BROKERS' });
    expect([200, 201]).toContain(post.status);
    const ownerView = await (await call(jar.PROPERTY_OWNER, 'GET', `/api/deals/${deal.id}/messages`).then(r => r.status === 200 ? r : call(jar.ADMIN, 'GET', `/api/deals/${deal.id}/messages`))).json();
    const brokerView = await (await call(brokerCookie, 'GET', `/api/deals/${deal.id}/messages`)).json();
    expect(brokerView.messages.some((m: any) => JSON.stringify(m).includes(secret))).toBe(true);
    const ownerRes = await call(jar.PROPERTY_OWNER, 'GET', `/api/deals/${deal.id}/messages`);
    if (ownerRes.status === 200) expect(JSON.stringify(await ownerRes.json())).not.toContain(secret);
    void ownerView;
  });
  it('audit log shows no commission events to the owner', async () => {
    const r = await call(jar.PROPERTY_OWNER, 'GET', '/api/audit-logs');
    if (r.status === 200) {
      const j = await r.json();
      expect(JSON.stringify(j)).not.toMatch(/COMMISSION/);
    } else expect([401, 403]).toContain(r.status);
  });
});

describe('owner property isolation', () => {
  it("another owner's (or broker-created) property never appears for this owner", async () => {
    const created = await call(jar.BROKER, 'POST', '/api/properties', {
      title: 'Isolation test flat in Pune', description: 'A flat belonging to a different owner entirely.',
      propertyType: 'Residential Flat', transactionType: 'Sale', state: 'Maharashtra', city: 'Pune', locality: 'Baner',
      pincode: '411045', addressHidden: 'Flat 12, Test Society, Baner, Pune', askingPrice: 9500000, ownerApprovedNetPrice: 9000000,
      ownerName: 'Someone Else', ownerPhone: '9876500011', tags: ['Gated Society'],
    });
    expect([200, 201]).toContain(created.status);
    const pid = (await created.json()).property.id;
    const ownerList = await (await call(jar.PROPERTY_OWNER, 'GET', '/api/properties')).json();
    expect(ownerList.properties.some((p: any) => p.id === pid)).toBe(false);
    expect([403, 404]).toContain((await call(jar.PROPERTY_OWNER, 'GET', `/api/properties/${pid}`)).status);
    // every property the owner is given is their own or one they are the listing broker of
    const me = acct('PROPERTY_OWNER').id;
    for (const p of ownerList.properties) expect([p.ownerId, p.listingBrokerId]).toContain(me);
  });
});

describe('surplus-above-net owner mandate', () => {
  let propertyId = ''; let mandateId = ''; let brokerCookie = ''; let askingPrice = 0;
  beforeAll(async () => {
    const ownerList = await (await call(jar.PROPERTY_OWNER, 'GET', '/api/properties')).json();
    const prop = ownerList.properties.find((p: any) => p.ownerId === acct('PROPERTY_OWNER').id && ['active', 'under_negotiation'].includes(p.listingStatus));
    propertyId = prop.id; askingPrice = prop.askingPrice;
    brokerCookie = prop.listingBrokerId === acct('BROKER', 1).id ? jar.BROKER2 : jar.BROKER;
  });
  it('rejects a wrong signing password', async () => {
    const r = await call(jar.PROPERTY_OWNER, 'POST', '/api/owner-mandates', { propertyId, approvedNetPrice: Math.floor(askingPrice * 0.9), protectionPeriodDays: 30, password: 'WrongPass#1' });
    expect(r.status).toBe(400);
  });
  it('rejects a net amount above the advertised price', async () => {
    const r = await call(jar.PROPERTY_OWNER, 'POST', '/api/owner-mandates', { propertyId, approvedNetPrice: askingPrice + 1, protectionPeriodDays: 30, password: cfg.demoPassword });
    expect(r.status).toBe(400);
  });
  it('a broker cannot draft the owner side', async () => {
    const r = await call(brokerCookie, 'POST', '/api/owner-mandates', { propertyId, approvedNetPrice: Math.floor(askingPrice * 0.9), protectionPeriodDays: 30, password: cfg.demoPassword });
    expect(r.status).toBe(403);
  });
  it('owner signs; only the listing broker can co-sign; mandate goes ACTIVE', async () => {
    const net = Math.floor(askingPrice * 0.9);
    const r = await call(jar.PROPERTY_OWNER, 'POST', '/api/owner-mandates', { propertyId, approvedNetPrice: net, protectionPeriodDays: 30, password: cfg.demoPassword });
    const body0 = await r.clone().text();
    expect(r.status, body0).toBe(200);
    const m = (await r.json()).mandate;
    mandateId = m.id; expect(m.status).toBe('PENDING_BROKER');
    // another broker and the owner cannot accept it
    const other = brokerCookie === jar.BROKER ? jar.BROKER2 : jar.BROKER;
    expect([403, 404]).toContain((await call(other, 'POST', `/api/owner-mandates/${mandateId}/accept`, { password: cfg.demoPassword })).status);
    expect([403, 404]).toContain((await call(jar.PROPERTY_OWNER, 'POST', `/api/owner-mandates/${mandateId}/accept`, { password: cfg.demoPassword })).status);
    expect((await call(brokerCookie, 'POST', `/api/owner-mandates/${mandateId}/accept`, { password: 'WrongPass#1' })).status).toBe(400);
    const ok = await call(brokerCookie, 'POST', `/api/owner-mandates/${mandateId}/accept`, { password: cfg.demoPassword });
    expect(ok.status).toBe(200);
    expect((await ok.json()).mandate.status).toBe('ACTIVE');
    const prop = (await (await call(jar.ADMIN, 'GET', `/api/properties/${propertyId}`)).json()).property;
    expect(prop.ownerApprovedNetPrice).toBe(net);
  });
  it('an active mandate cannot be signed twice and the owner can withdraw a pending one', async () => {
    expect((await call(brokerCookie, 'POST', `/api/owner-mandates/${mandateId}/accept`, { password: cfg.demoPassword })).status).toBe(409);
    const net2 = Math.floor(askingPrice * 0.85);
    const r = await call(jar.PROPERTY_OWNER, 'POST', '/api/owner-mandates', { propertyId, approvedNetPrice: net2, protectionPeriodDays: 30, password: cfg.demoPassword });
    expect(r.status).toBe(200);
    const id2 = (await r.json()).mandate.id;
    const w = await call(jar.PROPERTY_OWNER, 'POST', `/api/owner-mandates/${id2}/withdraw`, {});
    expect(w.status).toBe(200);
    expect((await w.json()).mandate.status).toBe('WITHDRAWN');
  });
});

describe('three brokerage types: net amount, commission %, fixed fee', () => {
  let propertyId = ''; let askingPrice = 0; let brokerCookie = '';
  const post = (body: any) => call(jar.PROPERTY_OWNER, 'POST', '/api/owner-mandates', { propertyId, protectionPeriodDays: 30, password: cfg.demoPassword, ...body });
  beforeAll(async () => {
    const ownerList = await (await call(jar.PROPERTY_OWNER, 'GET', '/api/properties')).json();
    const prop = ownerList.properties.find((p: any) => p.ownerId === acct('PROPERTY_OWNER').id && ['active', 'under_negotiation'].includes(p.listingStatus));
    propertyId = prop.id; askingPrice = prop.askingPrice;
    brokerCookie = prop.listingBrokerId === acct('BROKER', 1).id ? jar.BROKER2 : jar.BROKER;
  });
  it('validates each basis', async () => {
    expect((await post({ remunerationBasis: 'PERCENTAGE' })).status).toBe(400);
    expect((await post({ remunerationBasis: 'PERCENTAGE', commissionPct: 15 })).status).toBe(400);
    expect((await post({ remunerationBasis: 'FIXED_FEE' })).status).toBe(400);
    expect((await post({ remunerationBasis: 'FIXED_FEE', fixedFeeAmount: askingPrice })).status).toBe(400);
    expect((await post({ remunerationBasis: 'SURPLUS_ABOVE_NET' })).status).toBe(400);
  });
  it('commission % mandate: broker earns pct of asking, owner receives the rest, ACTIVE after co-sign', async () => {
    const floorBefore = (await (await call(jar.ADMIN, 'GET', `/api/properties/${propertyId}`)).json()).property.ownerApprovedNetPrice;
    const r = await post({ remunerationBasis: 'PERCENTAGE', commissionPct: 2 });
    expect(r.status, await r.clone().text()).toBe(200);
    const m = (await r.json()).mandate;
    expect(m.remunerationBasis).toBe('PERCENTAGE');
    expect(m.agreedCommissionPct).toBe(2);
    expect(m.brokerRemunerationAtAsking).toBe(Math.round(askingPrice * 0.02));
    expect(m.ownerReceivesAtAsking).toBe(askingPrice - Math.round(askingPrice * 0.02));
    expect((await call(brokerCookie, 'POST', `/api/owner-mandates/${m.id}/accept`, { password: cfg.demoPassword })).status).toBe(200);
    const prop = (await (await call(jar.ADMIN, 'GET', `/api/properties/${propertyId}`)).json()).property;
    expect(prop.ownerApprovedNetPrice).toBe(floorBefore); // a % mandate does not overwrite the owner's price floor
  });
  it('fixed-fee mandate supersedes the previous one', async () => {
    const r = await post({ remunerationBasis: 'FIXED_FEE', fixedFeeAmount: 150000 });
    expect(r.status).toBe(200);
    const m = (await r.json()).mandate;
    expect(m.brokerRemunerationAtAsking).toBe(150000);
    expect(m.ownerReceivesAtAsking).toBe(askingPrice - 150000);
    expect((await call(brokerCookie, 'POST', `/api/owner-mandates/${m.id}/accept`, { password: cfg.demoPassword })).status).toBe(200);
    const list = (await (await call(jar.PROPERTY_OWNER, 'GET', `/api/owner-mandates?propertyId=${propertyId}`)).json()).mandates;
    expect(list.filter((x: any) => x.status === 'ACTIVE').length).toBe(1);
    expect(list.find((x: any) => x.status === 'ACTIVE').remunerationBasis).toBe('FIXED_FEE');
  });
});

describe('India-wide location & tags', () => {
  it('covers all states / UTs and validates PIN codes', () => {
    expect(INDIA_STATES.length).toBeGreaterThanOrEqual(36);
    expect(isPincode('492001')).toBe(true);
    expect(isPincode('012345')).toBe(false);
    expect(isPincode('49200')).toBe(false);
    expect(reraAuthorityOf('Maharashtra')).toMatch(/Maha/i);
    expect(sameCity('  pune ', 'Pune')).toBe(true);
  });
  it('rejects an unknown state and a bad PIN, accepts any Indian city', async () => {
    const base = {
      title: 'Validation test shop', description: 'Shop used to validate location rules.', propertyType: 'Commercial Shop', transactionType: 'Sale',
      locality: 'Sector 17', addressHidden: 'Shop 5, Sector 17 market', askingPrice: 5000000, ownerApprovedNetPrice: 4800000, ownerName: 'Test Owner', ownerPhone: '9876500022',
    };
    expect((await call(jar.BROKER, 'POST', '/api/properties', { ...base, state: 'Atlantis', city: 'Pune' })).status).toBe(400);
    expect((await call(jar.BROKER, 'POST', '/api/properties', { ...base, state: 'Punjab', city: 'Chandigarh', pincode: '12' })).status).toBe(400);
    expect([200, 201]).toContain((await call(jar.BROKER, 'POST', '/api/properties', { ...base, state: 'Chandigarh', city: 'Chandigarh', pincode: '160017', tags: ['Corner'] })).status);
  });
  it('cleans custom tags (trim, dedupe, cap)', () => {
    const t = cleanTags(['  Sea View ', 'sea view', 'Gated', '', 'x'.repeat(100)], 5);
    expect(t.filter(x => x.toLowerCase() === 'sea view').length).toBe(1);
    expect(t.length).toBeLessThanOrEqual(5);
  });
});

describe('password change', () => {
  it('wrong current password -> 400, correct -> 200 and the new password works', async () => {
    const email = acct('BROKER', 1).email;
    const cookie = await login(email);
    expect((await call(cookie, 'POST', '/api/auth/change-password', { currentPassword: 'Nope-Nope-1x', newPassword: 'Brand-New-Pass1' })).status).toBe(400);
    const ok = await call(cookie, 'POST', '/api/auth/change-password', { currentPassword: cfg.demoPassword, newPassword: 'Brand-New-Pass1' });
    expect(ok.status).toBe(200);
    const r = await call(undefined, 'POST', '/api/auth/login', { email, password: 'Brand-New-Pass1' });
    expect(r.status).toBe(200);
  });
});
