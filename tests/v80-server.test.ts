import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * v80 — against a real server:
 *  (1) a broker can never offer a co-broking deal to HIMSELF (Magic Match on his own home + his own buyer);
 *  (2) a client number the broker typed when he opened the room is shown to him — also for rooms that were saved before the number was kept;
 *  (3) the FINAL RATE of a deal has one place (set, read, who may, who is told);
 *  (4) the owner sign-in code is a signed token (valid on any copy of the server, one use, five tries);
 *  (5) "use my location" has a network-address fallback for city / state;
 *  (6) the owner who sits on a broker's own listing is found by his exact mobile in Profiles even though he has no GENZ login.
 */
const PORT = 8200 + Math.floor(Math.random() * 60);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (c: string | undefined, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const j = (r: Response) => r.json();
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function login(who: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === who);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a ? a.email : who, password: cfg.demoPassword }) });
  expect(r.status, who).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const B1 = 'USR-BRK-001'; const B2 = 'USR-BRK-002'; const B3 = 'USR-BRK-003'; const OWN = 'USR-OWNER-001';
const rnd = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v80-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, stdio: 'ignore',
    env: { ...process.env, KYC_VAULT_KEY: 'c4'.repeat(32), SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' },
  });
  for (let i = 0; i < 160; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  expect(cfg).toBeTruthy();
  const ids: Record<string, string> = { B1, B2, B3, OWN };
  for (const [k, id] of Object.entries(ids)) jar[k] = await login(id);
}, 150_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

// ───────────────────────── 1 · never an offer to myself ─────────────────────────
describe('a co-broking offer to yourself is refused by the server', () => {
  it('B1 offering his own listing to himself (named, or by default the listing broker) → 400', async () => {
    const l = (await j(await call(jar.B1, 'GET', '/api/properties'))).properties.filter((p: any) => p.listingBrokerId === B1 && p.verificationStatus === 'VERIFIED' && p.listingStatus === 'active');
    expect(l.length).toBeGreaterThan(0);
    const body = { propertyId: l[0].id, feeMode: 'OWN_SIDE', proposerSide: 'BUYER', terms: 'Each broker keeps the fee of his own client.' };
    const named = await call(jar.B1, 'POST', '/api/collaborations', { ...body, receivingBrokerId: B1 });
    expect(named.status).toBe(400); expect((await j(named)).error).toMatch(/yourself/i);
    const dflt = await call(jar.B1, 'POST', '/api/collaborations', body);
    expect(dflt.status).toBe(400); expect((await j(dflt)).error).toMatch(/yourself/i);
  });
});

// ───────────────────────── 2 · a client's number the broker added himself ─────────────────────────
describe('the broker sees the number of a client he added', () => {
  it('every active room in his list says the number is saved — rooms saved before the number was kept are healed when he opens the list', async () => {
    for (const who of ['B1', 'B2']) {
      const rooms = (await j(await call(jar[who], 'GET', '/api/client-rooms'))).rooms as any[];
      const active = rooms.filter(r => r.status === 'ACTIVE');
      expect(active.length, who).toBeGreaterThan(0);
      for (const r of active) expect(r.phoneSaved, `${who} ${r.id} ${r.clientName}`).toBe(true);
    }
  });
  it('and the room itself carries the full 10 digits for him (never for a broker who does not own the room)', async () => {
    const rooms = (await j(await call(jar.B1, 'GET', '/api/client-rooms'))).rooms as any[];
    const one = rooms.find(r => r.status === 'ACTIVE')!;
    const d = (await j(await call(jar.B1, 'GET', `/api/client-rooms/${one.id}`))).room;
    expect(d.phone).toMatch(/^\d{10}$/); expect(d.phone.slice(-4)).toBe(one.phoneLast4); expect(d.phoneAccess).toBe('FULL');
    expect((await call(jar.B3, 'GET', `/api/client-rooms/${one.id}`)).status).toBe(404);
  });
  it('a room he opens now with a number keeps that number', async () => {
    const NUM = '98' + rnd(8);
    const mk = await call(jar.B2, 'POST', '/api/client-rooms', { clientName: 'Number Check', phone: NUM, kind: 'BUYER', consent: true });
    expect(mk.status, await mk.clone().text()).toBe(200);
    const id = (await j(mk)).room.id;
    expect((await j(await call(jar.B2, 'GET', `/api/client-rooms/${id}`))).room.phone).toBe(NUM);
  });
});

// ───────────────────────── 3 · the final rate has one place ─────────────────────────
describe('the final rate of a deal', () => {
  const DEAL = 'DEAL-2026-001'; // brokers B1 + B2 · owner OWN
  it('a deal broker sees the card with his right to set it; the owner sees it without that right', async () => {
    const b = await j(await call(jar.B1, 'GET', `/api/deals/${DEAL}`));
    expect(b.finalRate).toBeTruthy(); expect(b.finalRate.canSet).toBe(true); expect(b.finalRate.price).toBeGreaterThan(0);
    const o = await j(await call(jar.OWN, 'GET', `/api/deals/${DEAL}`));
    expect(o.finalRate?.canSet).toBeFalsy();
  });
  it('after the negotiation a deal broker writes the agreed rate and one line how it was agreed — it is kept with who and when', async () => {
    const price = 7_350_000;
    const r = await call(jar.B2, 'POST', `/api/deals/${DEAL}/final-price`, { price, note: '  Agreed on site after the visit\n ' });
    expect(r.status, await r.clone().text()).toBe(200);
    const out = await j(r); expect(out.finalRate).toMatchObject({ price, source: 'MANUAL', note: 'Agreed on site after the visit' });
    expect(out.finalRate.by).toBeTruthy(); expect(out.finalRate.at).toBeTruthy();
    for (const who of ['B1', 'B2', 'OWN']) expect((await j(await call(jar[who], 'GET', `/api/deals/${DEAL}`))).finalRate.price, who).toBe(price);
  });
  it('a bad price, an owner and an outsider cannot set it', async () => {
    expect((await call(jar.B1, 'POST', `/api/deals/${DEAL}/final-price`, { price: -5 })).status).toBe(400);
    expect((await call(jar.B1, 'POST', `/api/deals/${DEAL}/final-price`, { price: 0 })).status).toBe(400);
    expect((await call(jar.B1, 'POST', `/api/deals/${DEAL}/final-price`, { price: 'abc' })).status).toBe(400);
    expect((await call(jar.OWN, 'POST', `/api/deals/${DEAL}/final-price`, { price: 1_000_000 })).status).toBe(403);
    expect([403, 404]).toContain((await call(jar.B3, 'POST', `/api/deals/${DEAL}/final-price`, { price: 1_000_000 })).status);
  });
  it('a long note is cut, control characters are removed', async () => {
    const r = await call(jar.B1, 'POST', `/api/deals/${DEAL}/final-price`, { price: 7_300_000, note: 'x'.repeat(400) + '\u0007' });
    expect(r.status).toBe(200); const n = (await j(r)).finalRate.note as string; expect(n.length).toBeLessThanOrEqual(120); expect(n).not.toMatch(/[\u0000-\u001f]/);
  });
});

// ───────────────────────── 4 · the owner's one-time code works on any copy of the server ─────────────────────────
describe('owner sign-in: the code travels as a signed token', () => {
  const otp = async (phone: string) => { const r = await call(undefined, 'POST', '/api/owner/otp', { phone }); expect(r.status, await r.clone().text()).toBe(200); return j(r); };
  it('the token holds the phone, an expiry and a nonce — never the code', async () => {
    const ph = '9' + rnd(9); const o = await otp(ph);
    expect(o.otpToken).toMatch(/^[\w-]+\.[\w-]+$/); expect(o.devCode).toMatch(/^\d{6}$/);
    const body = JSON.parse(Buffer.from(o.otpToken.split('.')[0], 'base64url').toString('utf8'));
    expect(Object.keys(body).sort()).toEqual(['e', 'n', 'p']); expect(body.p).toBe(ph); expect(body.e).toBeGreaterThan(Date.now());
    expect(o.otpToken).not.toContain(o.devCode);
  });
  it('the FIRST code still signs in after a second code was sent — the check needs no memory of the server that sent it', async () => {
    const ph = '9' + rnd(9);
    const a = await otp(ph); const b = await otp(ph);
    expect(a.otpToken).not.toBe(b.otpToken);
    if (a.devCode === b.devCode) return;   // (1 in a million: the two codes happen to be equal — nothing to prove)
    const ok = await call(undefined, 'POST', '/api/owner/verify', { phone: ph, code: a.devCode, otpToken: a.otpToken, name: 'Token Owner', consent: true, city: 'Raipur', state: 'Chhattisgarh' });
    expect(ok.status, await ok.clone().text()).toBe(200); expect((await j(ok)).user.role).toBe('PROPERTY_OWNER');
  });
  it('a code opens the door once; asking again says it was used', async () => {
    const ph = '9' + rnd(9); const o = await otp(ph);
    const body = { phone: ph, code: o.devCode, otpToken: o.otpToken, name: 'Once Only', consent: true };
    expect((await call(undefined, 'POST', '/api/owner/verify', body)).status).toBe(200);
    const again = await call(undefined, 'POST', '/api/owner/verify', body);
    expect(again.status).toBe(400); expect((await j(again)).code).toBe('EXPIRED');
  });
  it('a wrong code is "not right", five tries at most, then even the right code is refused', async () => {
    const ph = '9' + rnd(9); const o = await otp(ph);
    const wrong = o.devCode === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i++) { const r = await call(undefined, 'POST', '/api/owner/verify', { phone: ph, code: wrong, otpToken: o.otpToken }); expect(r.status).toBe(400); expect((await j(r)).code).toBe('WRONG_CODE'); }
    const six = await call(undefined, 'POST', '/api/owner/verify', { phone: ph, code: o.devCode, otpToken: o.otpToken, name: 'Late', consent: true });
    expect(six.status).toBe(429);
    const seven = await call(undefined, 'POST', '/api/owner/verify', { phone: ph, code: o.devCode, otpToken: o.otpToken, name: 'Late', consent: true });
    expect(seven.status).toBe(400);
  });
  it('a token made for one number does not open another; no token and no memory of a code = expired (never a crash)', async () => {
    const p1 = '9' + rnd(9); const p2 = '9' + rnd(9); const o = await otp(p1);
    const r = await call(undefined, 'POST', '/api/owner/verify', { phone: p2, code: o.devCode, otpToken: o.otpToken, name: 'Other', consent: true });
    expect(r.status).toBe(400); expect((await j(r)).code).toBe('EXPIRED');
    const junk = await call(undefined, 'POST', '/api/owner/verify', { phone: p2, code: '111111', otpToken: 'not.a.token.at.all' });
    expect(junk.status).toBe(400);
  });
  it('the old way (no token, the server remembers the code) still works for an older page', async () => {
    const ph = '9' + rnd(9); const o = await otp(ph);
    const ok = await call(undefined, 'POST', '/api/owner/verify', { phone: ph, code: o.devCode, name: 'Old Page', consent: true });
    expect(ok.status).toBe(200);
  });
});

// ───────────────────────── 5 · "use my location" has a network fallback ─────────────────────────
describe('/api/geo/ip — rough city and state from the network address (nothing is stored)', () => {
  const ip = (h: Record<string, string>) => call(undefined, 'GET', '/api/geo/ip', undefined, h).then(j);
  it('the edge region code and city fill state and city', async () => {
    expect(await ip({ 'x-vercel-ip-country': 'IN', 'x-vercel-ip-country-region': 'CT', 'x-vercel-ip-city': 'Raipur' })).toMatchObject({ found: true, state: 'Chhattisgarh', city: 'Raipur', country: 'India' });
    expect(await ip({ 'x-vercel-ip-country': 'IN', 'x-vercel-ip-country-region': 'MH', 'x-vercel-ip-city': encodeURIComponent('Navi Mumbai') })).toMatchObject({ found: true, state: 'Maharashtra', city: 'Navi Mumbai' });
  });
  it('a city we know gives the state even when the region code is missing', async () => {
    expect(await ip({ 'x-vercel-ip-country': 'IN', 'x-vercel-ip-city': 'Bilaspur' })).toMatchObject({ found: true, state: 'Chhattisgarh', city: 'Bilaspur' });
  });
  it('outside India or with no hint there is nothing to fill', async () => {
    expect((await ip({ 'x-vercel-ip-country': 'US', 'x-vercel-ip-country-region': 'CA', 'x-vercel-ip-city': 'Fresno' })).found).toBe(false);
    expect((await ip({})).found).toBe(false);
  });
  it('a broken header never crashes it', async () => {
    const r = await ip({ 'x-vercel-ip-country': 'IN', 'x-vercel-ip-city': '%E0%A4%A' });
    expect(typeof r.found).toBe('boolean');
  });
});

// ───────────────────────── 6 · the owner of my own listing is found by his mobile ─────────────────────────
describe('Profiles search finds the owner of a broker’s own listing, though he has no GENZ login', () => {
  const PH = '98' + rnd(8);
  let PID = '';
  it('setup: B1 lists a flat for an owner who is not on GENZ', async () => {
    const r = await call(jar.B1, 'POST', '/api/properties', {
      title: 'Owner-record check flat in Raipur', description: 'A flat whose owner has no GENZ login.', propertyType: 'Residential Flat', transactionType: 'Sale',
      state: 'Chhattisgarh', city: 'Raipur', locality: 'Shankar Nagar', pincode: '492007', addressHidden: 'Flat 4, Test Apartments, Shankar Nagar, Raipur', askingPrice: 5200000, ownerApprovedNetPrice: 5000000,
      ownerName: 'Ramesh Agrawal', ownerPhone: PH, tags: ['Gated Society'],
    });
    expect([200, 201], await r.clone().text()).toContain(r.status); PID = (await j(r)).property.id;
  });
  it('the listing broker finds him by the exact mobile — a short name, last 4 digits, his listing; no full number, no address', async () => {
    const r = await call(jar.B1, 'GET', `/api/profiles/search?q=${PH}`); expect(r.status).toBe(200);
    const d = await j(r);
    expect(d.results).toEqual([]); expect(d.ownerRecord).toBeTruthy();
    expect(d.ownerRecord).toMatchObject({ name: 'Ramesh A.', last4: PH.slice(-4) });
    expect(d.ownerRecord.listings.map((l: any) => l.propertyId)).toContain(PID);
    const raw = JSON.stringify(d); expect(raw).not.toContain(PH); expect(raw).not.toContain('Agrawal'); expect(raw).not.toMatch(/Test Apartments/);
  });
  it('another broker (not the listing broker) sees nothing — the search is not a way to learn who owns what', async () => {
    const d = await j(await call(jar.B2, 'GET', `/api/profiles/search?q=${PH}`));
    expect(d.results).toEqual([]); expect(d.ownerRecord).toBeUndefined();
  });
  it('a name search never lists him, and a number that is on nobody’s listing finds nothing', async () => {
    const byName = await j(await call(jar.B1, 'GET', `/api/profiles/search?q=${encodeURIComponent('Ramesh Agrawal')}`));
    expect(byName.ownerRecord).toBeUndefined();
    const none = await j(await call(jar.B1, 'GET', `/api/profiles/search?q=97${rnd(8)}`));
    expect(none.ownerRecord).toBeUndefined(); expect(none.results).toEqual([]);
  });
  it('a member with that mobile is still shown as a member (the record is only the fallback)', async () => {
    const me = await j(await call(jar.OWN, 'GET', '/api/auth/me')); const ph = String(me.user?.phone || me.phone || '').replace(/\D/g, '').slice(-10);
    expect(ph).toMatch(/^\d{10}$/);
    const d = await j(await call(jar.B1, 'GET', `/api/profiles/search?q=${ph}`));
    expect(d.results.length).toBe(1); expect(d.results[0].id).toBe(OWN); expect(d.ownerRecord).toBeUndefined();
  });
});
