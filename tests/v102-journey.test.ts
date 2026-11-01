import { freePort } from './helpers/port';
/**
 * v102 — one deal, walked step by step by every role: a buyer-side broker (BRK2) brings a buyer to the listing broker's (BRK1) home, owned by OWN.
 * After EVERY step the other roles look at it: the listing broker, the owner, an outsider broker (BRK3), GENZ admin, the buyer's own page —
 * and each of them must see only what he may, and the record must sit where it belongs (visit, deal room, audit trail, buyer bond, offer, brokerage, commission, bill).
 * Part A: two brokers (the visit → verification → offer → final price → commission agreement → payments → bill → close).
 * Part B: ONE broker on both sides (own buyer on own listing: only the owner can verify; nothing is shared).
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
const nameOf = (k: string) => acct({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', BRK3: 'USR-BRK-003', OWN: 'USR-OWNER-001' }[k]!).name as string;
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const slot = (h = 1) => new Date(Date.now() + h * 3600_000).toISOString();
const form = (url: string, body: Record<string, string>) => fetch(B + url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
const err = async (r: Response) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }) as any;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v102j-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PUSH_DRY_RUN: 'true', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', BRK3: 'USR-BRK-003', OWN: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
}, 90000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

let PA: any;                                  // the home: listed by BRK1, owned by OWN
const visitsOf = async (who: string) => ((await j(await call(jar[who], 'GET', `/api/site-visits?propertyId=${PA.id}`))).siteVisits as any[]);
const dealOf = async (who: string, id: string) => call(jar[who], 'GET', `/api/deals/${id}`);
const auditAll = async () => (await j(await call(jar.ADMIN, 'GET', '/api/audit-logs?limit=500')));

describe('Part A — two brokers, one buyer', () => {
  const phone = rnd(); let visit: any; let secret: any; let DEAL = ''; let ack: any; let offer: any;

  it('0 · the home: the listing broker and the owner have it; every broker can browse it; GENZ admin sees it', async () => {
    const all = (await j(await call(jar.ADMIN, 'GET', '/api/properties'))).properties as any[];
    const deals = ((await j(await call(jar.ADMIN, 'GET', '/api/deals'))).deals || []) as any[];
    // a home that has no deal room with BRK2 yet — so the journey starts from nothing (the seeded demo already has a deal on PROP-RAI-101)
    PA = all.find(p => p.listingBrokerId === 'USR-BRK-001' && p.ownerId === 'USR-OWNER-001' && p.transactionType === 'Sale' && p.listingStatus === 'active' && p.verificationStatus === 'VERIFIED' && !deals.some(d => d.propertyId === p.id));
    expect(PA).toBeTruthy();
    for (const who of ['BRK1', 'BRK2', 'BRK3', 'OWN']) expect((await call(jar[who], 'GET', `/api/properties/${PA.id}`)).status, who).toBe(200);
  });

  it('1 · BRK2 books a visit for his buyer → a deal room opens by itself (BRK2 introduces, BRK1 closes), the buyer has a pending “no direct deal” promise', async () => {
    const r = await call(jar.BRK2, 'POST', '/api/site-visits', { propertyId: PA.id, customerName: 'Anil Kumar Gupta', customerPhone: phone, scheduledTime: slot(1) });
    expect(r.status).toBe(200); const b = await j(r); visit = b.siteVisit; DEAL = b.dealRoom.id;
    expect(visit.ackStatus).toBe('PENDING'); expect(visit.isVerified).toBe(false);
    expect(b.dealRoom).toMatchObject({ propertyId: PA.id, introducingBrokerId: 'USR-BRK-002', closingBrokerId: 'USR-BRK-001', stage: 'Introduction', siteVisitsCount: 1 });
    expect(b.dealRoom.antiBypassTailDays).toBeGreaterThan(0); expect(Date.parse(b.dealRoom.antiBypassExpiresAt)).toBeGreaterThan(Date.now());
    const a = (await auditAll()).logs || (await auditAll()).auditLogs || (await auditAll());
    const txt = JSON.stringify(a); expect(txt).toContain('SITE_VISIT_SCHEDULED'); expect(txt).toContain('VISIT_ACK_REQUESTED');
  });

  it('2 · who sees the visit: BRK2 all of it · BRK1 and the owner see the buyer masked and no code · GENZ admin everything · an outsider nothing', async () => {
    const v2 = (await visitsOf('BRK2')).find(v => v.id === visit.id)!; expect(v2.customerName).toBe('Anil Kumar Gupta'); expect(v2.customerPhone).toBe(phone); expect(v2.otpCode).toMatch(/^\d{6}$/);   // demo: the booker sees his own code
    for (const who of ['BRK1', 'OWN']) {
      const v = (await visitsOf(who)).find(x => x.id === visit.id)!; expect(v, who).toBeTruthy();
      expect(v.customerName, who).not.toBe('Anil Kumar Gupta'); expect(v.customerPhone, who).not.toBe(phone); expect(String(v.customerPhone), who).toContain('•');
      expect(v.otpCode, who).toBe(''); expect(v.qrToken, who).toBe(''); expect(v.secretHidden, who).toBe(true);
    }
    secret = (await visitsOf('ADMIN')).find(v => v.id === visit.id)!; expect(secret.customerPhone).toBe(phone); expect(secret.otpCode).toMatch(/^\d{6}$/); expect(secret.qrToken).toBeTruthy();
    expect((await visitsOf('BRK3')).some(v => v.id === visit.id)).toBe(false);
  });

  it('3 · the deal room is on BRK1’s and BRK2’s list, not on the outsider’s; the owner can open it', async () => {
    for (const who of ['BRK1', 'BRK2']) { const l = (await j(await call(jar[who], 'GET', '/api/deals'))).deals as any[]; expect(l.some(d => d.id === DEAL), who).toBe(true); }
    expect(((await j(await call(jar.BRK3, 'GET', '/api/deals'))).deals as any[]).some(d => d.id === DEAL)).toBe(false);
    expect((await dealOf('BRK3', DEAL)).status).toBeGreaterThanOrEqual(403);
    expect((await dealOf('OWN', DEAL)).status).toBe(200);
  });

  it('4 · the gate each role sees before the buyer has promised: BRK1 / owner “waiting for the buyer”, BRK2 “you booked it”, outsider “not your property”', async () => {
    const g = async (who: string) => (await visitsOf(who)).find(v => v.id === visit.id)?.gate;
    expect(await g('BRK1')).toMatchObject({ code: 'ACK_REQUIRED', ok: false, propertySide: true });
    expect(await g('OWN')).toMatchObject({ code: 'ACK_REQUIRED', ok: false, propertySide: true });
    expect(await g('BRK2')).toMatchObject({ code: 'MAKER_CHECKER', ok: false, iAmBooker: true });
  });

  it('5 · scanning / typing the code too early: every role gets its own error and nothing is recorded', async () => {
    const otp = secret.otpCode; const qr = secret.qrToken;
    const e1 = await err(await call(jar.BRK1, 'POST', `/api/site-visits/${visit.id}/verify-otp`, { otpCode: otp })); expect(e1).toMatchObject({ status: 409, code: 'ACK_REQUIRED' }); expect(e1.error).toMatch(/no direct deal/i);
    const e2 = await err(await call(jar.BRK1, 'POST', `/api/site-visits/${visit.id}/checkin-qr`, { qrToken: qr })); expect(e2).toMatchObject({ status: 409, code: 'ACK_REQUIRED' });
    const e3 = await err(await call(jar.OWN, 'POST', `/api/site-visits/${visit.id}/checkin-qr`, { qrToken: qr })); expect(e3).toMatchObject({ status: 409, code: 'ACK_REQUIRED' });
    const e4 = await err(await call(jar.BRK2, 'POST', `/api/site-visits/${visit.id}/verify-otp`, { otpCode: otp })); expect(e4).toMatchObject({ status: 403, code: 'MAKER_CHECKER' }); expect(e4.error).toMatch(/cannot verify it yourself/);
    const e5 = await err(await call(jar.BRK3, 'POST', `/api/site-visits/${visit.id}/checkin-qr`, { qrToken: qr })); expect(e5).toMatchObject({ status: 403, code: 'PROPERTY_SIDE_ONLY' }); expect(e5.error).toMatch(/Only the property side/);
    expect((await call(undefined, 'POST', `/api/site-visits/${visit.id}/checkin-qr`, { qrToken: qr })).status).toBe(401);
    const v = (await visitsOf('ADMIN')).find(x => x.id === visit.id)!; expect(v.isVerified).toBe(false);
  });

  it('6 · the buyer’s page: both brokers are named, his family / relatives / nominee are covered; only BRK2 holds the link', async () => {
    ack = (await j(await call(jar.BRK2, 'GET', `/api/visit-acks/VISIT/${visit.id}`))).ack;
    expect(ack.status).toBe('PENDING'); expect(ack.textVersion).toBe('v2');
    expect((await j(await call(jar.BRK1, 'GET', `/api/visit-acks/VISIT/${visit.id}`))).ack).toBeNull();
    expect((await j(await call(jar.OWN, 'GET', `/api/visit-acks/VISIT/${visit.id}`))).ack).toBeNull();
    const t = await (await fetch(B + ack.page)).text();
    expect(t).toContain(nameOf('BRK2')); expect(t).toContain(nameOf('BRK1')); expect(t).toContain(PA.title);
    expect(t).toMatch(/family/); expect(t).toMatch(/relative/); expect(t).toMatch(/nominee/); expect(t).toMatch(/firm or company/); expect(t).toMatch(/commission is payable/);
    expect(t).toContain('परिवार का कोई सदस्य'); expect(t).toContain('रिश्तेदार'); expect(t).toContain('नॉमिनी');
    expect(t).not.toContain(phone); expect(t).not.toContain(secret.otpCode); expect(t).not.toContain('<svg');                  // no pass before the promise
  });

  it('7 · the buyer promises (tick + his mobile + the code the broker reads out): the audit trail holds v2 with both brokers; BRK1 and the owner now see “ready to verify”', async () => {
    expect(await ackBuyer(B, call, jar.BRK2, 'VISIT', visit.id, phone)).toBe(303);
    const a2 = (await j(await call(jar.BRK2, 'GET', `/api/visit-acks/VISIT/${visit.id}`))).ack; expect(a2.status).toBe('ACKED'); expect(a2.ackedAt).toBeTruthy();
    const txt = JSON.stringify(await auditAll());
    expect(txt).toContain('VISIT_ACK_DONE'); expect(txt).toContain('wording v2'); expect(txt).toContain('family, relatives, nominee'); expect(txt).toContain(nameOf('BRK1')); expect(txt).not.toContain(phone);
    for (const who of ['BRK1', 'OWN']) { const v = (await visitsOf(who)).find(x => x.id === visit.id)!; expect(v.ackStatus, who).toBe('ACKED'); expect(v.gate, who).toMatchObject({ code: 'OK', ok: true }); }
    expect((await visitsOf('BRK2')).find(x => x.id === visit.id)!.gate).toMatchObject({ code: 'MAKER_CHECKER', ok: false });          // the booker still may not verify
    const page = await (await fetch(B + ack.page)).text(); expect(page).toContain('<svg'); expect(page).toContain(secret.otpCode);        // now the buyer has his pass
  });

  it('8 · the scanner at the property: a wrong QR / wrong code counts a try and records nothing; the booker and the outsider are still refused', async () => {
    const bad = await err(await call(jar.BRK1, 'POST', `/api/site-visits/${visit.id}/checkin-qr`, { qrToken: 'WRONGTOKEN123' })); expect(bad.status).toBe(400); expect(bad.error).toMatch(/Invalid or expired QR/);
    const badOtp = await err(await call(jar.BRK1, 'POST', `/api/site-visits/${visit.id}/verify-otp`, { otpCode: secret.otpCode === '000000' ? '111111' : '000000' })); expect(badOtp.status).toBe(400); expect(badOtp.error).toMatch(/attempt\(s\) left/);
    expect((await err(await call(jar.BRK2, 'POST', `/api/site-visits/${visit.id}/checkin-qr`, { qrToken: secret.qrToken }))).code).toBe('MAKER_CHECKER');
    expect((await err(await call(jar.BRK3, 'POST', `/api/site-visits/${visit.id}/verify-otp`, { otpCode: secret.otpCode }))).code).toBe('PROPERTY_SIDE_ONLY');
    expect((await visitsOf('ADMIN')).find(x => x.id === visit.id)!.isVerified).toBe(false);
    if (PA.latitude !== undefined && PA.longitude !== undefined) {
      const far = await err(await call(jar.BRK1, 'POST', `/api/site-visits/${visit.id}/checkin-qr`, { qrToken: secret.qrToken, latitude: PA.latitude + 1, longitude: PA.longitude + 1 })); expect(far.status).toBe(400); expect(far.error).toMatch(/km from the property/);
    }
    const lat = await err(await call(jar.BRK1, 'POST', `/api/site-visits/${visit.id}/checkin-qr`, { qrToken: secret.qrToken, latitude: 95, longitude: 10 })); expect(lat.status).toBe(400); expect(lat.error).toMatch(/Invalid GPS/);
  });

  it('9 · BRK1 scans the buyer’s QR: the visit is verified and recorded in every place — visit, deal stage, audit, buyer bond — and every role sees the same truth', async () => {
    const r = await call(jar.BRK1, 'POST', `/api/site-visits/${visit.id}/checkin-qr`, { qrToken: secret.qrToken }); expect(r.status).toBe(200);
    const body = await j(r); expect(body.siteVisit.isVerified).toBe(true); expect(body.dealRoom.stage).toBe('Site Visit Done');
    for (const who of ['BRK1', 'BRK2', 'OWN', 'ADMIN']) {
      const v = (await visitsOf(who)).find(x => x.id === visit.id)!; expect(v.isVerified, who).toBe(true); expect(v.verificationMethod, who).toBe('QR'); expect(v.verifiedAt, who).toBeTruthy();
    }
    expect((await visitsOf('ADMIN')).find(x => x.id === visit.id)!.gpsChecked).toBe(false);          // no location was sent — the evidence says so
    for (const who of ['BRK1', 'BRK2']) expect((await j(await dealOf(who, DEAL))).deal.stage, who).toBe('Site Visit Done');
    const txt = JSON.stringify(await auditAll()); expect(txt).toContain('SITE_VISIT_QR_CHECKIN'); expect(txt).toContain(visit.id);
    // scanning it again / typing the code afterwards: already done
    expect((await err(await call(jar.BRK1, 'POST', `/api/site-visits/${visit.id}/checkin-qr`, { qrToken: secret.qrToken }))).code).toBe('DONE');
    expect((await err(await call(jar.OWN, 'POST', `/api/site-visits/${visit.id}/verify-otp`, { otpCode: secret.otpCode }))).code).toBe('DONE');
  });

  it('10 · the buyer bond now protects BRK2: another broker cannot book or offer for the same buyer on this home — with a message that points to co-broking', async () => {
    const e = await err(await call(jar.BRK3, 'POST', '/api/site-visits', { propertyId: PA.id, customerName: 'Anil Kumar Gupta', customerPhone: phone, scheduledTime: slot(3) }));
    expect(e.status).toBe(409); expect(JSON.stringify(e)).toMatch(/co-?brok|already|bond|brought/i);
    const o = await err(await call(jar.BRK3, 'POST', '/api/offers', { propertyId: PA.id, buyerName: 'Anil Kumar Gupta', buyerPhone: phone, consent: true, amount: Math.round(PA.askingPrice * 0.9), tokenProposed: 100000 }));
    expect(o.status).toBe(409);
    // BRK2 himself can carry on with the same buyer (his own bond)
    const again = await call(jar.BRK2, 'POST', '/api/site-visits', { propertyId: PA.id, customerName: 'Anil Kumar Gupta', customerPhone: phone, scheduledTime: slot(30) }); expect(again.status).toBe(200);
  });

  it('11 · the offer: BRK2 offers for his buyer, the owner / BRK1 see it, the outsider cannot decide, the owner accepts → one deal room (the same one)', async () => {
    const amount = Math.round(PA.askingPrice * 0.93);
    const mk = await call(jar.BRK2, 'POST', '/api/offers', { propertyId: PA.id, buyerName: 'Anil Kumar Gupta', buyerPhone: phone, consent: true, amount, tokenProposed: 100000 });
    expect(mk.status, await mk.clone().text()).toBe(200); offer = (await j(mk)).offer;
    expect((await err(await call(jar.BRK3, 'POST', `/api/offers/${offer.id}/decide`, { action: 'ACCEPT' }))).status).toBe(404);
    expect((await err(await call(jar.BRK2, 'POST', `/api/offers/${offer.id}/decide`, { action: 'ACCEPT' }))).status).toBe(404);          // the buyer side cannot accept his own offer
    const acc = await call(jar.OWN, 'POST', `/api/offers/${offer.id}/decide`, { action: 'ACCEPT' }); expect(acc.status, await acc.clone().text()).toBe(200);
    const accepted = (await j(acc)).offer; expect(accepted.status).toMatch(/ACCEPTED|TOKEN/); expect(accepted.dealRoomId).toBeTruthy();
    DEAL = accepted.dealRoomId;
    const d = (await j(await dealOf('BRK2', DEAL))); expect(d.deal.dealValue).toBe(amount);
  });

  it('12 · the offer is on every role’s screen the right way: the owner and BRK1 see the buyer’s offer, BRK2 sees his own, the outsider sees none; the deal value is the offer', async () => {
    const lists = async (who: string) => { const b = await j(await call(jar[who], 'GET', '/api/offers')); return { made: (b.made || []) as any[], incoming: (b.incoming || []) as any[] }; };
    expect((await lists('BRK2')).made.find(o => o.id === offer.id)).toMatchObject({ role: 'BUYER_SIDE', buyerPhoneLast4: phone.slice(-4) });
    for (const who of ['OWN', 'BRK1']) { const o = (await lists(who)).incoming.find(x => x.id === offer.id); expect(o, who).toMatchObject({ role: 'PROPERTY_SIDE' }); expect(o.buyerPhoneLast4, who).toBeUndefined(); expect(JSON.stringify(o), who).not.toContain(phone); }
    const out = await lists('BRK3'); expect([...out.made, ...out.incoming].some(o => o.id === offer.id)).toBe(false);
    for (const who of ['BRK1', 'BRK2', 'OWN']) expect((await j(await dealOf(who, DEAL))).deal.dealValue, who).toBe(Math.round(PA.askingPrice * 0.93));
  });

  it('13 · the stage ladder: no skipping, the outsider / owner / GENZ admin cannot move it, “Agreement” needs a signed commission agreement', async () => {
    expect((await err(await call(jar.BRK2, 'POST', `/api/deals/${DEAL}/stage`, { stage: 'Settled' }))).status).toBe(400);
    expect((await err(await call(jar.BRK3, 'POST', `/api/deals/${DEAL}/stage`, { stage: 'Negotiation' }))).status).toBeGreaterThanOrEqual(403);
    expect((await err(await call(jar.OWN, 'POST', `/api/deals/${DEAL}/stage`, { stage: 'Negotiation' }))).status).toBeGreaterThanOrEqual(403);
    expect(await err(await call(jar.ADMIN, 'POST', `/api/deals/${DEAL}/stage`, { stage: 'Negotiation' }))).toMatchObject({ status: 403, code: 'DEAL_SUMMARY_ONLY' });
    expect((await call(jar.BRK2, 'POST', `/api/deals/${DEAL}/stage`, { stage: 'Negotiation' })).status).toBe(200);
    const need = await err(await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/stage`, { stage: 'Agreement' })); expect(need.status).toBe(409); expect(need.error).toMatch(/commission agreement/);
    for (const who of ['BRK1', 'BRK2']) expect((await j(await dealOf(who, DEAL))).deal.stage, who).toBe('Negotiation');
  });

  it('14 · the final price: a deal broker types it; the owner and the listing broker see their share, the buyer-side broker sees none; the owner and the outsider cannot type it', async () => {
    const before = (await j(await dealOf('BRK1', DEAL))).brokerage;
    const price = Math.round(PA.askingPrice * 0.91);
    expect((await call(jar.BRK2, 'POST', `/api/deals/${DEAL}/final-price`, { price })).status).toBe(200);
    for (const who of ['BRK1', 'BRK2', 'OWN']) expect((await j(await dealOf(who, DEAL))).deal.dealValue, who).toBe(price);
    if (before?.mandate) {
      expect((await j(await dealOf('BRK1', DEAL))).brokerage).toMatchObject({ price, source: 'MANUAL' }); expect((await j(await dealOf('OWN', DEAL))).brokerage.price).toBe(price);
      expect((await j(await dealOf('BRK2', DEAL))).brokerage).toBeUndefined();
    }
    expect((await call(jar.OWN, 'POST', `/api/deals/${DEAL}/final-price`, { price: 1 })).status).toBe(403);
    expect((await call(jar.BRK3, 'POST', `/api/deals/${DEAL}/final-price`, { price: 1 })).status).toBeGreaterThanOrEqual(403);
  });

  let AGR = ''; let total = 0;
  it('15 · the commission agreement: BRK2 proposes 40 / 60 → wrong sums, an outsider and a proposer who left himself out are refused; BRK1 sees it waiting; the owner, outsider and GENZ cannot read it', async () => {
    const price = (await j(await dealOf('BRK2', DEAL))).deal.dealValue; total = Math.round(price * 0.02);
    const base = { totalAgreedBrokerage: total, dealValue: price, payer: 'SELLER' };
    const p = (who: string, b: any) => call(jar[who], 'POST', `/api/deals/${DEAL}/commission-agreements/propose`, { ...base, ...b });
    expect((await err(await p('BRK2', { allocations: [{ participantId: 'USR-BRK-002', allocationPct: 40 }, { participantId: 'USR-BRK-001', allocationPct: 50 }] }))).error).toMatch(/total exactly 100%/);
    expect((await err(await p('BRK2', { allocations: [{ participantId: 'USR-BRK-002', allocationPct: 40 }, { participantId: 'USR-BRK-003', allocationPct: 60 }] }))).error).toMatch(/brokers of this deal/);
    expect((await err(await p('BRK2', { allocations: [{ participantId: 'USR-BRK-001', allocationPct: 100 }] }))).error).toMatch(/proposer must be part/);
    expect((await p('BRK3', { allocations: [{ participantId: 'USR-BRK-002', allocationPct: 40 }, { participantId: 'USR-BRK-001', allocationPct: 60 }] })).status).toBeGreaterThanOrEqual(403);
    expect((await p('OWN', { allocations: [{ participantId: 'USR-BRK-002', allocationPct: 40 }, { participantId: 'USR-BRK-001', allocationPct: 60 }] })).status).toBe(403);
    const ok = await p('BRK2', { allocations: [{ participantId: 'USR-BRK-002', allocationPct: 40 }, { participantId: 'USR-BRK-001', allocationPct: 60 }] }); expect(ok.status, await ok.clone().text()).toBe(200);
    const ag = (await j(ok)).agreement; AGR = ag.id; expect(ag.status).toBe('SENT_TO_PARTICIPANTS');
    expect((await err(await p('BRK2', { allocations: [{ participantId: 'USR-BRK-002', allocationPct: 50 }, { participantId: 'USR-BRK-001', allocationPct: 50 }] }))).error).toMatch(/already awaiting signatures/);
    const list = async (who: string) => call(jar[who], 'GET', `/api/deals/${DEAL}/commission-agreements`);
    for (const who of ['BRK1', 'BRK2']) { const a = ((await j(await list(who))).agreements as any[])[0]; expect(a.status, who).toBe('SENT_TO_PARTICIPANTS'); expect(a.totalAgreedBrokerage, who).toBe(total); }
    for (const who of ['OWN', 'BRK3', 'ADMIN']) expect((await list(who)).status, who).toBeGreaterThanOrEqual(403);
    expect((await err(await call(jar.OWN, 'GET', `/api/deals/${DEAL}/commission-agreements`))).error).toMatch(/not permitted/);          // the owner never reads the brokers’ split
  });

  it('16 · both sign: the proposer cannot sign twice, the outsider cannot sign; after BRK1’s signature it is ACTIVE and the split shows 40 / 60 in the deal room of both; the quick split is locked', async () => {
    const sign = (who: string) => call(jar[who], 'POST', `/api/deals/${DEAL}/commission-agreements/${AGR}/approve`, {});
    expect((await err(await sign('BRK2'))).error).toMatch(/already signed/);
    expect((await sign('BRK3')).status).toBeGreaterThanOrEqual(403);
    const r = await sign('BRK1'); expect(r.status).toBe(200); expect((await j(r)).agreement.status).toBe('ACTIVE');
    for (const who of ['BRK1', 'BRK2']) { const d = (await j(await dealOf(who, DEAL))).deal; expect(d.introducingBrokerSharePct, who).toBe(40); expect(d.closingBrokerSharePct, who).toBe(60); expect(d.totalCommissionExpected, who).toBe(total); }
    expect((await err(await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/commission`, { introducingBrokerSharePct: 50, closingBrokerSharePct: 50 }))).error).toMatch(/ACTIVE/);
    expect(JSON.stringify(await auditAll())).toContain('AGREEMENT_ESIGNED');
    expect((await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/stage`, { stage: 'Agreement' })).status).toBe(200);
  });

  it('17 · the bill to the owner: only the listing broker is prefilled with the owner’s number; BRK2 sees nothing of it; the owner opens it, says paid; BRK1 confirms', async () => {
    const g1 = await j(await call(jar.BRK1, 'GET', `/api/deals/${DEAL}/payment-requests`)); expect(g1.canBill).toBe(true); expect(g1.prefill.owner.phone).toMatch(/^\d{10}$/);
    const g2 = await j(await call(jar.BRK2, 'GET', `/api/deals/${DEAL}/payment-requests`)); expect(g2.prefill.owner.phone).toBe('');
    expect((await call(jar.BRK3, 'GET', `/api/deals/${DEAL}/payment-requests`)).status).toBe(404);
    const mk = await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/payment-requests`, { party: 'OWNER', partyName: 'Sunil Lalwani', partyPhone: g1.prefill.owner.phone, items: [{ text: 'Brokerage — sale', amount: total }], dueOn: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) });
    expect(mk.status, await mk.clone().text()).toBe(200); const bill = (await j(mk)).request; const token = bill.link.split('/pay/')[1];
    const page = await (await fetch(`${B}/pay/${token}`)).text(); expect(page).toContain(PA.title.slice(0, 12)); expect(page).not.toContain(String(PA.ownerPhone || 'no-phone-xyz'));
    expect((await form(`/pay/${token}/paid`, { ref: 'UTR445566' })).status).toBe(303);
    expect((await call(jar.BRK2, 'POST', `/api/payment-requests/${bill.id}/received`, {})).status).toBe(404);          // not his bill
    expect((await call(jar.BRK1, 'POST', `/api/payment-requests/${bill.id}/received`, {})).status).toBe(200);
    expect(((await j(await call(jar.BRK1, 'GET', '/api/payment-requests'))).requests as any[]).find(x => x.id === bill.id).status).toBe('PAID');
    expect(((await j(await call(jar.BRK2, 'GET', '/api/payment-requests'))).requests as any[]).some(x => x.id === bill.id)).toBe(false);
  });

  let sharePaid = 0;
  it('18 · the commission share: BRK1 writes down “paid BRK2’s share” → BRK1 cannot confirm his own entry; the owner, the outsider and GENZ cannot touch it; BRK2 confirms → PAID', async () => {
    const ag0 = ((await j(await call(jar.BRK1, 'GET', `/api/deals/${DEAL}/commission-agreements`))).agreements as any[])[0];
    const mine = ag0.allocations.find((a: any) => a.participantId === 'USR-BRK-002'); const due = mine.allocationAmount; expect(due).toBe(Math.round(total * 0.4));
    const rec = (who: string, b: any) => call(jar[who], 'POST', `/api/deals/${DEAL}/commission-agreements/${AGR}/settle-payment`, { participantId: 'USR-BRK-002', paidOn: new Date().toISOString().slice(0, 10), ...b });
    expect((await err(await rec('BRK1', { paidDelta: due + 1, ref: 'UTR100200' }))).error).toMatch(/outstanding/);
    expect((await err(await rec('BRK1', { paidDelta: 1000, ref: 'x' }))).error).toMatch(/bank reference/);
    expect((await err(await rec('BRK1', { paidDelta: 1000, ref: 'UTR100200', paidOn: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) }))).error).toMatch(/real date/);
    const part = Math.floor(due / 2); sharePaid = part;
    const r1 = await rec('BRK1', { paidDelta: part, ref: 'UTR100200' }); expect(r1.status, await r1.clone().text()).toBe(200);
    const entry = (await j(r1)).agreement.allocations.find((a: any) => a.participantId === 'USR-BRK-002').payments[0]; expect(entry.status).toBe('PENDING');
    expect((await err(await rec('BRK1', { paidDelta: part, ref: 'utr100200' }))).error).toMatch(/already written down/);          // the same reference + amount twice (any letter case)
    const conf = (who: string, id: string, dec = 'confirm', body: any = {}) => call(jar[who], 'POST', `/api/deals/${DEAL}/commission-agreements/${AGR}/payments/${id}/${dec}`, body);
    expect((await err(await conf('BRK1', entry.id))).error).toMatch(/other broker has to answer/);
    for (const who of ['OWN', 'BRK3']) expect((await conf(who, entry.id)).status, who).toBeGreaterThanOrEqual(403);
    expect((await err(await conf('ADMIN', entry.id))).error).toMatch(/GENZ can open the inside of a deal room only while a dispute/);
    const view = async (who: string) => ((await j(await call(jar[who], 'GET', `/api/deals/${DEAL}/commission-agreements`))).agreements as any[])[0].allocations.find((a: any) => a.participantId === 'USR-BRK-002');
    expect((await view('BRK2')).paidAmount).toBe(0);                                                               // nothing counts before the other broker confirms
    expect((await err(await conf('BRK2', entry.id, 'reject', { note: 'no' }))).error).toMatch(/at least 5 characters/);
    expect((await conf('BRK2', entry.id)).status).toBe(200);
    for (const who of ['BRK1', 'BRK2']) expect((await view(who)).paidAmount, who).toBe(part);
    expect((await err(await conf('BRK2', entry.id))).error).toMatch(/already confirmed/);
  });

  it('19 · a payment BRK2 does not agree with: he rejects it with a reason → it never counts; the rest is paid and confirmed → BRK2’s share is PAID', async () => {
    const ag = async () => ((await j(await call(jar.BRK1, 'GET', `/api/deals/${DEAL}/commission-agreements`))).agreements as any[])[0];
    const due = (await ag()).allocations.find((a: any) => a.participantId === 'USR-BRK-002').allocationAmount; const rest = due - sharePaid;
    const rec = (b: any) => call(jar.BRK1, 'POST', `/api/deals/${DEAL}/commission-agreements/${AGR}/settle-payment`, { participantId: 'USR-BRK-002', paidOn: new Date().toISOString().slice(0, 10), ...b });
    const wrong = await j(await rec({ paidDelta: rest, ref: 'UTR300400' })); const wid = wrong.agreement.allocations.find((a: any) => a.participantId === 'USR-BRK-002').payments.find((p: any) => p.ref === 'UTR300400').id;
    expect((await call(jar.BRK2, 'POST', `/api/deals/${DEAL}/commission-agreements/${AGR}/payments/${wid}/reject`, { note: 'This amount never reached my account' })).status).toBe(200);
    expect((await ag()).allocations.find((a: any) => a.participantId === 'USR-BRK-002').paidAmount).toBe(sharePaid);
    // a rejected line does not block the same reference: BRK1 writes it again (now it is right), BRK2 confirms → the share is PAID
    const again = await j(await rec({ paidDelta: rest, ref: 'UTR300400' })); const aid = again.agreement.allocations.find((a: any) => a.participantId === 'USR-BRK-002').payments.filter((p: any) => p.status === 'PENDING')[0].id;
    expect((await call(jar.BRK2, 'POST', `/api/deals/${DEAL}/commission-agreements/${AGR}/payments/${aid}/confirm`, {})).status).toBe(200);
    const a2 = (await ag()).allocations.find((a: any) => a.participantId === 'USR-BRK-002'); expect(a2.paidAmount).toBe(due); expect(a2.entitlementStatus).toBe('PAID');
    expect((await err(await rec({ paidDelta: 1, ref: 'UTR999111' }))).error).toMatch(/outstanding/);                    // nothing more can be paid on a PAID share
  });

  it('20 · BRK1’s own share is written by BRK1 (received from the owner) and confirmed by BRK2; “Settled” needs EVERY share PAID — before that nobody can settle; after that the deal is settled for both, and cannot be closed any more', async () => {
    const ag = async () => ((await j(await call(jar.BRK2, 'GET', `/api/deals/${DEAL}/commission-agreements`))).agreements as any[])[0];
    expect((await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/stage`, { stage: 'Handover' })).status).toBe(200);
    const early = await err(await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/stage`, { stage: 'Settled' })); expect(early.status).toBe(409); expect(early.error).toMatch(/every commission allocation to be PAID/);
    const mine = (await ag()).allocations.find((a: any) => a.participantId === 'USR-BRK-001').allocationAmount;
    const r = await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/commission-agreements/${AGR}/settle-payment`, { participantId: 'USR-BRK-001', paidDelta: mine, ref: 'UTR777888', paidOn: new Date().toISOString().slice(0, 10) });
    expect(r.status, await r.clone().text()).toBe(200); const id = (await j(r)).agreement.allocations.find((a: any) => a.participantId === 'USR-BRK-001').payments[0].id;
    expect((await call(jar.BRK2, 'POST', `/api/deals/${DEAL}/commission-agreements/${AGR}/payments/${id}/confirm`, {})).status).toBe(200);
    expect((await ag()).allocations.every((a: any) => a.entitlementStatus === 'PAID')).toBe(true);
    expect((await call(jar.BRK2, 'POST', `/api/deals/${DEAL}/stage`, { stage: 'Settled' })).status).toBe(200);
    for (const who of ['BRK1', 'BRK2', 'OWN']) { const d = (await j(await dealOf(who, DEAL))).deal; expect(d.stage, who).toBe('Settled'); expect(d.settlementStatus, who).toBe('PAID'); }
    expect((await err(await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/close`, { reason: 'OTHER', note: 'x' }))).error).toMatch(/already finished/);
    const txt = JSON.stringify(await auditAll()); for (const w of ['COMMISSION_PAYMENT_RECORDED', 'COMMISSION_PAYMENT_CONFIRMED', 'COMMISSION_PAYMENT_REJECTED', 'STAGE_ADVANCED', 'PAYMENT_REQUEST_SENT']) expect(txt, w).toContain(w);
  });
});

describe('Part B — ONE broker on both sides (BRK1 brings his own buyer to his own listing)', () => {
  const phone = rnd(); let PB: any; let visit: any; let secret: any; let DEAL = '';
  const vis = async (who: string) => ((await j(await call(jar[who], 'GET', `/api/site-visits?propertyId=${PB.id}`))).siteVisits as any[]).find(v => v.id === visit?.id);

  it('B0 · the home: BRK1 lists a new house for the owner OWN (BRK1 is the listing broker); GENZ approves it; no deal room yet', async () => {
    const body = { title: 'Corner house Tatibandh QA-ONE', description: 'A residential house, east facing, near the park', propertyType: 'Independent House', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: 'Tatibandh', addressHidden: 'Lane 9, Tatibandh', askingPrice: 7350000, ownerApprovedNetPrice: 7000000, builtUpAreaSqFt: 1650, ownerName: nameOf('OWN'), ownerPhone: '9123450177', ownerId: 'USR-OWNER-001' };
    const c = await call(jar.BRK1, 'POST', '/api/properties', body); expect(c.status, await c.clone().text()).toBe(200); PB = (await j(c)).property;
    if (PB.verificationStatus !== 'VERIFIED') expect((await call(jar.ADMIN, 'POST', `/api/properties/${PB.id}/moderate`, { action: 'APPROVE' })).status).toBe(200);
    PB = (await j(await call(jar.BRK1, 'GET', `/api/properties/${PB.id}`))).property || PB;
    expect(PB).toMatchObject({ listingBrokerId: 'USR-BRK-001', ownerId: 'USR-OWNER-001' });
    const deals = ((await j(await call(jar.ADMIN, 'GET', '/api/deals'))).deals || []) as any[]; expect(deals.some(d => d.propertyId === PB.id)).toBe(false);
  });

  it('B1 · BRK1 books a visit for HIS OWN buyer on HIS OWN listing → one deal room, he is introducing AND closing broker (no empty “closing broker”)', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/site-visits', { propertyId: PB.id, customerName: 'Meena Rathore', customerPhone: phone, scheduledTime: slot(1) });
    expect(r.status, await r.clone().text()).toBe(200); const b = await j(r); visit = b.siteVisit; DEAL = b.dealRoom.id;
    expect(b.dealRoom.introducingBrokerId).toBe('USR-BRK-001');
    expect(b.dealRoom.closingBrokerId, 'closingBrokerId is empty — single-broker checks (solo payments, one-broker close) will not recognise this deal').toBe('USR-BRK-001');
    secret = (await vis('ADMIN'))!; expect(secret.otpCode).toMatch(/^\d{6}$/);
  });

  it('B2 · who can verify: ONLY the owner (the booker never verifies his own visit, there is no second broker); the outsider and BRK2 are refused', async () => {
    expect((await vis('BRK1'))!.gate).toMatchObject({ code: 'MAKER_CHECKER', iAmBooker: true }); expect((await vis('OWN'))!.gate).toMatchObject({ code: 'ACK_REQUIRED', propertySide: true });
    expect(await ackBuyer(B, call, jar.BRK1, 'VISIT', visit.id, phone)).toBe(303);
    expect((await vis('BRK1'))!.gate).toMatchObject({ code: 'MAKER_CHECKER', ok: false, iAmBooker: true });
    expect((await vis('OWN'))!.gate).toMatchObject({ code: 'OK', ok: true });
    expect((await err(await call(jar.BRK1, 'POST', `/api/site-visits/${visit.id}/checkin-qr`, { qrToken: secret.qrToken }))).code).toBe('MAKER_CHECKER');
    expect((await err(await call(jar.BRK1, 'POST', `/api/site-visits/${visit.id}/verify-otp`, { otpCode: secret.otpCode }))).code).toBe('MAKER_CHECKER');
    for (const who of ['BRK2', 'BRK3']) expect((await err(await call(jar[who], 'POST', `/api/site-visits/${visit.id}/checkin-qr`, { qrToken: secret.qrToken }))).code, who).toBe('PROPERTY_SIDE_ONLY');
    expect((await vis('ADMIN'))!.isVerified).toBe(false);
  });

  it('B3 · the owner verifies (code) → Site Visit Done for BRK1 and the owner; nobody else sees the deal', async () => {
    const r = await call(jar.OWN, 'POST', `/api/site-visits/${visit.id}/verify-otp`, { otpCode: secret.otpCode }); expect(r.status, await r.clone().text()).toBe(200);
    for (const who of ['BRK1', 'OWN', 'ADMIN']) { const v = (await vis(who))!; expect(v.isVerified, who).toBe(true); expect(v.verificationMethod, who).toBe('OTP'); }
    for (const who of ['BRK1', 'OWN']) expect((await j(await dealOf(who, DEAL))).deal.stage, who).toBe('Site Visit Done');
    expect((await dealOf('BRK2', DEAL)).status).toBeGreaterThanOrEqual(403);
    expect(((await j(await call(jar.BRK2, 'GET', '/api/deals'))).deals as any[]).some(d => d.id === DEAL)).toBe(false);
  });

  let AGR = ''; let total = 0;
  it('B4 · the buyer bond protects BRK1; his own commission note: a one-broker agreement is 100% his; the owner and the outsider cannot read it', async () => {
    expect((await err(await call(jar.BRK2, 'POST', '/api/site-visits', { propertyId: PB.id, customerName: 'Meena Rathore', customerPhone: phone, scheduledTime: slot(5) }))).status).toBe(409);
    expect((await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/stage`, { stage: 'Negotiation' })).status).toBe(200);
    const price = Math.round(PB.askingPrice * 0.95); expect((await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/final-price`, { price })).status).toBe(200);
    total = Math.round(price * 0.02);
    const ok = await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/commission-agreements/propose`, { totalAgreedBrokerage: total, dealValue: price, payer: 'SELLER', allocations: [{ participantId: 'USR-BRK-001', allocationPct: 100 }] });
    expect(ok.status, await ok.clone().text()).toBe(200); const ag = (await j(ok)).agreement; AGR = ag.id;
    expect(['ACTIVE', 'SENT_TO_PARTICIPANTS']).toContain(ag.status);
    expect((await call(jar.OWN, 'GET', `/api/deals/${DEAL}/commission-agreements`)).status).toBe(403);
    expect((await call(jar.BRK2, 'GET', `/api/deals/${DEAL}/commission-agreements`)).status).toBeGreaterThanOrEqual(403);
  });

  it('B5 · agreement signed (alone) → ACTIVE; “Agreement” stage opens; his payments are confirmed straight away because there is no second broker', async () => {
    let ag = ((await j(await call(jar.BRK1, 'GET', `/api/deals/${DEAL}/commission-agreements`))).agreements as any[])[0];
    if (ag.status !== 'ACTIVE') { const s = await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/commission-agreements/${AGR}/approve`, {}); expect(s.status, await s.clone().text()).toBe(200); ag = (await j(s)).agreement; }
    expect(ag.status).toBe('ACTIVE');
    expect((await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/stage`, { stage: 'Agreement' })).status).toBe(200);
    const pay = await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/commission-agreements/${AGR}/settle-payment`, { participantId: 'USR-BRK-001', paidDelta: total, ref: 'UTR55667788', paidOn: new Date().toISOString().slice(0, 10) });
    expect(pay.status, await pay.clone().text()).toBe(200);
    const a = (await j(pay)).agreement.allocations[0]; expect(a.payments[0].status, 'a one-broker deal should confirm by itself').toBe('CONFIRMED'); expect(a.entitlementStatus).toBe('PAID');
  });

  it('B6 · Handover → Settled works with only one broker; settled for BRK1 and the owner', async () => {
    expect((await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/stage`, { stage: 'Handover' })).status).toBe(200);
    const s = await call(jar.BRK1, 'POST', `/api/deals/${DEAL}/stage`, { stage: 'Settled' }); expect(s.status, await s.clone().text()).toBe(200);
    for (const who of ['BRK1', 'OWN']) { const d = (await j(await dealOf(who, DEAL))).deal; expect(d.stage, who).toBe('Settled'); expect(d.settlementStatus, who).toBe('PAID'); }
  });
});

describe('Part C — the owner’s consent (mandate) carries the v2 wording: family, relatives, nominee and any firm are bound too', () => {
  it('C1 · the owner’s page shows the wider promise in English and Hindi; after he agrees the record says form oc-v2; GENZ’s trail names the form version', async () => {
    const loc = `Wording Colony ${Math.floor(Math.random() * 1e6)}`; const ph = `98${String(27300000 + Math.floor(Math.random() * 99999))}`;
    const p = await j(await call(jar.BRK1, 'POST', '/api/consent/paste', { text: `*2BHK Flat for Sale* ${loc}, Raipur 1150 sqft Price: 45 Lakh` })); const d = p.drafts[0];
    const fields = { title: `2BHK Flat in ${loc}`, propertyType: 'Residential Flat', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: loc, askingPrice: 4_500_000, areaSqft: 1150, ownerName: 'Ram Prasad', ownerPhone: ph, addressHidden: 'House 12, Lane 3, near temple' };
    expect((await call(jar.BRK1, 'PUT', `/api/consent/drafts/${d.id}`, { fields })).status).toBe(200);
    const r = await call(jar.BRK1, 'POST', `/api/consent/drafts/${d.id}/request`, { protectionDays: 90 }); const b = await j(r); expect(r.status, JSON.stringify(b)).toBe(200);
    const token = String(b.url).split('/oc/')[1];
    const page = await (await fetch(`${B}/oc/${token}`)).text();
    expect(page).toMatch(/family member, relative, nominee, or any firm or company of theirs/); expect(page).toContain('परिवारजन'); expect(page).toMatch(/रिश्तेदार/); expect(page).toMatch(/नॉमिनी/);
    const agree = await form(`/oc/${token}`, { action: 'agree', name: 'Ram Prasad', ok: '1', sigMode: 'type', initials: 'RP' }); const agreeText = await agree.text(); expect(agreeText).toMatch(/आपने \d{1,2} \w{3} \d{4} को सहमति दी/);
    const logs = JSON.stringify(((await j(await call(jar.ADMIN, 'GET', '/api/audit-logs?limit=500&q=oc-v2'))).events) || []); expect(logs).toContain('form oc-v2');
  });
});
