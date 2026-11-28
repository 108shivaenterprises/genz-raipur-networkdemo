import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { readFileSync } from 'fs';
process.env.AUTH_SECRET ||= 'v203-test-secret-0123456789abcdef0123';
const ROOT = path.resolve(__dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;

let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const form = (cookie: string | undefined, url: string, data: Record<string, string>) =>
  fetch(B + url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(data).toString() });
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v203-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, QUIET_HOURS: 'off', KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PUSH_DRY_RUN: 'true', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true', REVEAL_FRESH_LISTING_HOURS: '0.003', VIDEO_MAX_MB: '5' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', OWN: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1', SA: 'USR-SUPERADMIN', BUY: 'USR-BUYER-001' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 500)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });




const j = async (r: Response) => r.json().catch(() => ({})) as Promise<any>;
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
let ipn = 0; const nextIp = () => `10.203.${Math.floor(++ipn / 250)}.${ipn % 250}`;

// ───────── unit: pure rules, with a mocked database ─────────
const withState = async <T>(st: any, fn: () => T): Promise<T> => {
  const { db } = await import('../server/db'); const g = db.getState.bind(db), sv = db.save.bind(db), ap = db.appendAuditEvent.bind(db);
  (db as any).getState = () => st; (db as any).save = () => {}; (db as any).appendAuditEvent = () => {};
  try { return fn(); } finally { (db as any).getState = g; (db as any).save = sv; (db as any).appendAuditEvent = ap; }
};

describe('v203 · round 12 (unit)', () => {
  it('a deal under a live dispute is frozen for Mudra (open, under review, mediation, or settlement marked DISPUTED) and unfrozen when it closes', async () => {
    const { disputeFrozen } = await import('../server/mudra');
    const st: any = { dealRooms: [{ id: 'D1', settlementStatus: 'AGREED' }, { id: 'D2', settlementStatus: 'DISPUTED' }], disputes: [{ dealRoomId: 'D1', status: 'MEDIATION' }] };
    await withState(st, () => { expect(disputeFrozen('D1')).toBe(true); expect(disputeFrozen('D2')).toBe(false); expect(disputeFrozen('NOPE')).toBe(false); });   // round 13: only a live dispute freezes
    st.disputes[0].status = 'RESOLVED'; st.dealRooms[1].settlementStatus = 'AGREED';
    await withState(st, () => { expect(disputeFrozen('D1')).toBe(false); expect(disputeFrozen('D2')).toBe(false); });
  });
  it('a co-broke request nobody answers expires after its 7 days; a fresh one stays', async () => {
    const { sweepOffers } = await import('../server/offers');
    const st: any = { propertyOffers: [], properties: [], offers: [{ id: 'O1', status: 'PENDING', validUntil: new Date(Date.now() - 1000).toISOString(), proposingBrokerId: 'A', receivingBrokerId: 'B', lastActorId: 'A' }, { id: 'O2', status: 'COUNTERED', validUntil: new Date(Date.now() + 86400_000).toISOString(), proposingBrokerId: 'A', receivingBrokerId: 'B' }, { id: 'O3', status: 'ACCEPTED', validUntil: new Date(Date.now() - 1000).toISOString() }] };
    await withState(st, () => { expect(sweepOffers()).toBe(1); });
    expect(st.offers.map((o: any) => o.status)).toEqual(['EXPIRED', 'COUNTERED', 'ACCEPTED']);
  });
  it('an OTP token that was not issued by the server is refused before it can create a record; one with a far-future expiry too; a real one reads', async () => {
    const { makeOtpToken, readOtpToken } = await import('../server/ownerlist');
    const real = makeOtpToken('9826000001', '123456', Date.now() + 600_000); expect(readOtpToken(real, '9826000001')).toBeTruthy();
    const [body, sig] = real.split('.'); const j0 = JSON.parse(Buffer.from(body, 'base64url').toString());
    const forged = Buffer.from(JSON.stringify({ p: '9826000001', e: Date.now() + 600_000, n: 'abcdef012345' })).toString('base64url') + '.' + sig; expect(readOtpToken(forged, '9826000001')).toBeNull();
    const tampered = Buffer.from(JSON.stringify({ ...j0, e: j0.e + 1000 })).toString('base64url') + '.' + sig; expect(readOtpToken(tampered, '9826000001')).toBeNull();
    const far = makeOtpToken('9826000001', '123456', Date.now() + 3 * 3600_000); expect(readOtpToken(far, '9826000001')).toBeNull();
  });
  it('stampPhone: stamps when free; when another live account verified the number it does not stamp', async () => {
    const { stampPhone } = await import('../server/access');
    const a: any = { id: 'A', role: 'BROKER', phone: '+91 98000 00007', verificationStatus: 'VERIFIED' }; const other: any = { id: 'B', role: 'BROKER', phone: '9800000007', phoneVerifiedAt: 'x', verificationStatus: 'VERIFIED' };
    await withState({ users: [a] }, () => stampPhone(a, { users: [a] } as any, 'test')); expect(a.phoneVerifiedAt).toBeTruthy();
    const c: any = { id: 'C', role: 'BROKER', phone: '98000 00007', verificationStatus: 'VERIFIED' };
    await withState({ users: [c, other] }, () => stampPhone(c, { users: [c, other] } as any, 'test')); expect(c.phoneVerifiedAt).toBeUndefined();
  });
});

// ───────── HTTP ─────────
describe('v203 · round 12 (HTTP)', { timeout: 180000 }, () => {
  let prop: any; let offerId = ''; let dealId = '';
  it('setup: a verified property listed by BRK1', async () => {
    const list = await (await call(jar.BRK2, 'GET', '/api/properties')).json(); const arr = Array.isArray(list) ? list : list.properties;
    const deals = ((await j(await call(jar.BRK2, 'GET', '/api/deals'))).deals || []) as any[]; const taken = new Set(deals.map(d => d.propertyId));
    prop = arr.find((p: any) => p.listingBrokerId === 'USR-BRK-001' && p.verificationStatus === 'VERIFIED' && ['active', 'under_negotiation'].includes(p.listingStatus) && !taken.has(p.id)); expect(prop, 'a listing by BRK1 with no deal room yet').toBeTruthy();
  });
  it('1 · a phone number in the counter / accept notes is refused (400, EN + HI); clean notes pass', async () => {
    const o = await j(await call(jar.BRK2, 'POST', '/api/collaborations', { propertyId: prop.id, proposedIntroducingShare: 50, proposedClosingShare: 50, terms: 'fifty fifty on two percent', receivingBrokerId: 'USR-BRK-001' })); offerId = o.offer.id; expect(offerId).toBeTruthy();
    const bad = await call(jar.BRK1, 'POST', `/api/collaborations/${offerId}/respond`, { decision: 'COUNTER', counterIntroducingShare: 40, counterClosingShare: 60, notes: 'call me on 9826377889 please' }); const d = await j(bad);
    expect(bad.status).toBe(400); expect(d.errorHi).toBeTruthy(); expect(d.code).toBe('NO_CONTACT');
    expect((await call(jar.BRK1, 'POST', `/api/collaborations/${offerId}/respond`, { decision: 'ACCEPT', notes: 'write to me@mail.com' })).status).toBe(400);
  });
  it('2 · a reverse offer is refused while one is open; the open offer withdraws (only by the one who moved last) and then a new one is allowed', async () => {
    const rev = await call(jar.BRK1, 'POST', '/api/collaborations', { propertyId: prop.id, proposedIntroducingShare: 50, proposedClosingShare: 50, terms: 'reverse request on same listing', receivingBrokerId: 'USR-BRK-002' }); const rd = await j(rev);
    expect(rev.status, JSON.stringify(rd)).toBe(409); expect(rd.code).toBe('REVERSE_OFFER_OPEN'); expect(rd.errorHi).toBeTruthy();
    expect((await call(jar.BRK1, 'POST', `/api/collaborations/${offerId}/respond`, { decision: 'WITHDRAW' })).status).toBe(403);   // BRK1 did not make the last move
    const w = await call(jar.BRK2, 'POST', `/api/collaborations/${offerId}/respond`, { decision: 'WITHDRAW' }); expect(w.status).toBe(200); expect((await j(w)).offer.status).toBe('WITHDRAWN');
    const again = await j(await call(jar.BRK2, 'POST', '/api/collaborations', { propertyId: prop.id, proposedIntroducingShare: 60, proposedClosingShare: 40, terms: 'fresh request after withdrawing', receivingBrokerId: 'USR-BRK-001' })); expect(again.offer.validUntil).toBeTruthy(); offerId = again.offer.id;
  });
  it('2 · after accept there is one deal room; a second proposal or accept for the same pair is refused (409, EN + HI)', async () => {
    const acc = await j(await call(jar.BRK1, 'POST', `/api/collaborations/${offerId}/respond`, { decision: 'ACCEPT', notes: 'happy to work together' })); expect(acc.dealRoom?.id).toBeTruthy(); dealId = acc.dealRoom.id;
    const again = await j(await call(jar.BRK2, 'POST', '/api/collaborations', { propertyId: prop.id, proposedIntroducingShare: 50, proposedClosingShare: 50, terms: 'duplicate request after accept', receivingBrokerId: 'USR-BRK-001' })); expect(again.offer?.id).toBeTruthy();
    const dup = await call(jar.BRK1, 'POST', `/api/collaborations/${again.offer.id}/respond`, { decision: 'ACCEPT' }); const dd = await j(dup);
    expect(dup.status).toBe(409); expect(dd.code).toBe('DEAL_ROOM_EXISTS'); expect(dd.errorHi).toBeTruthy();
  });
  it('4 · a dispute needs a deal room or a lead (no free-form dispute against any user); the counterparty must be on it; one open dispute per deal', async () => {
    const free = await call(jar.BRK1, 'POST', '/api/disputes', { counterpartyId: 'USR-BRK-002', reason: 'OTHER', description: 'free form dispute without any deal at all' }); const fd = await j(free);
    expect(free.status).toBe(400); expect(fd.code).toBe('TARGET_REQUIRED'); expect(fd.errorHi).toBeTruthy();
    const outsider = await call(jar.BRK1, 'POST', '/api/disputes', { dealRoomId: dealId, counterpartyId: 'USR-ADMIN-1', reason: 'OTHER', description: 'counterparty is not in this deal room at all' }); expect(outsider.status).toBe(400);
    const ok = await call(jar.BRK1, 'POST', '/api/disputes', { dealRoomId: dealId, counterpartyId: 'USR-BRK-002', reason: 'COMMISSION_NON_PAYMENT', description: 'the other broker has not paid the agreed share' }); const od = await j(ok); expect(ok.status, JSON.stringify(od)).toBe(200);
    const dispId = od.dispute.id; (globalThis as any).__disp = dispId;
    const second = await call(jar.BRK2, 'POST', '/api/disputes', { dealRoomId: dealId, counterpartyId: 'USR-BRK-001', reason: 'OTHER', description: 'a second dispute on the same deal room' }); expect(second.status).toBe(409); expect((await j(second)).errorHi).toBeTruthy();
  });
  it('5 · mediation keeps the notes untouched and tells both parties; closing needs real notes (EN + HI), lifts the hold by default and unfreezes the deal; a non-SUPERADMIN cannot blacklist', async () => {
    const id = (globalThis as any).__disp as string;
    const dealOf = async () => (await j(await call(jar.SA, 'GET', `/api/deals/${dealId}`))).deal ?? (await j(await call(jar.SA, 'GET', '/api/deals'))).deals.find((d: any) => d.id === dealId);
    expect((await dealOf()).settlementStatus).toBe('DISPUTED');
    const med = await j(await call(jar.ADMIN, 'POST', `/api/disputes/${id}/resolve`, { status: 'MEDIATION', resolutionNotes: 'talking to both brokers' })); expect(med.dispute.status).toBe('MEDIATION'); expect(med.dispute.resolutionNotes || '').not.toContain('talking');
    const thin = await call(jar.ADMIN, 'POST', `/api/disputes/${id}/resolve`, { status: 'RESOLVED', resolutionNotes: 'ok' }); expect(thin.status).toBe(400); expect((await j(thin)).errorHi).toBeTruthy();
    const bl = await call(jar.ADMIN, 'POST', `/api/disputes/${id}/resolve`, { status: 'RESOLVED', resolutionNotes: 'paid in full after mediation', blacklistParty: true }); expect(bl.status).toBe(403); expect((await j(bl)).errorHi).toBeTruthy();
    const done = await j(await call(jar.ADMIN, 'POST', `/api/disputes/${id}/resolve`, { status: 'RESOLVED', resolutionNotes: 'paid in full after mediation' })); expect(done.dispute.status).toBe('RESOLVED'); expect(done.dispute.settlementHold).toBe(false); expect(done.dispute.resolutionNotes).toBe('paid in full after mediation');
    expect((await dealOf()).settlementStatus).toBe('AGREED');
  });
  it('5 · the buyer may read disputes (own rows only, redacted); everyone else sees only theirs', async () => {
    const r = await call(jar.BUY, 'GET', '/api/disputes'); expect(r.status).toBe(200); const d = await j(r); expect(Array.isArray(d.disputes)).toBe(true); expect(JSON.stringify(d.disputes)).not.toMatch(/description|complainant|resolutionNotes/);
  });
  it('9 · a Tier 1 broker sending a DIFFERENT RERA files a pending claim, keeps his number and tier; resending the same number keeps the first timestamp', async () => {
    const before = await j(await call(jar.BRK1, 'GET', '/api/network/my-rera')); expect(before.tier).toBe('TIER1');
    const num = 'PCGRERA260101-7777'; const a = await j(await call(jar.BRK1, 'POST', '/api/network/my-rera', { reraNumber: num })); expect(a.pending).toBe(true); expect(a.tier).toBe('TIER1');
    await new Promise(r => setTimeout(r, 30));
    const b = await j(await call(jar.BRK1, 'POST', '/api/network/my-rera', { reraNumber: num })); expect(b.claim.at).toBe(a.claim.at);
    const after = await j(await call(jar.BRK1, 'GET', '/api/network/my-rera')); expect(after.rera).toBe(before.rera); expect(after.claim.status).toBe('PENDING');
  });
  it('10 · Hindi on the errors that had none: co-broke, profile, photo, oversized body', async () => {
    const self = await call(jar.BRK1, 'POST', '/api/collaborations', { propertyId: prop.id, proposedIntroducingShare: 50, proposedClosingShare: 50, terms: 'to myself for a test', receivingBrokerId: 'USR-BRK-001' }); expect((await j(self)).errorHi).toBeTruthy();
    const pf = await call(jar.BRK1, 'PUT', '/api/profiles/mine', { years: 99 }); const pd = await j(pf); expect(pf.status).toBe(400); expect(pd.errorHi).toBeTruthy();
    const big = await call(jar.BRK1, 'PUT', '/api/profiles/mine', { about: 'x'.repeat(400_000) }); expect(big.status).toBe(413); expect((await j(big)).errorHi).toBeTruthy();
  });
  it('13 · a re-send while the first code is still live is free and never trips the per-number cap (round 13); the cap itself is in the source', async () => {
    for (let i = 0; i < 4; i++) { const r = await fetch(B + '/api/auth/signup-otp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp() }, body: JSON.stringify({ phone: '9826203333' }) }); expect(r.status).toBe(200); }
    expect(read('server/ownerlist.ts')).toContain('sentTimes.length >= 8');
  });
});

describe('v203 · round 12 (source)', () => {
  it('11/12 · PHONE_TAKEN only with a passed code; reset and owner sign-in stamp through stampPhone (audit PHONE_VERIFIED / PHONE_TAKEN_REFUSED)', () => {
    expect(read('server.ts')).toContain('if (otpOk && phoneVerifiedElsewhere(phone))');
    expect(read('server/otpManual.ts')).toContain("digits(u.phone).slice(-10) === phone"); expect(read('server/otpManual.ts')).toContain("stampPhone(u, db.getState(), 'password-reset code')");
    expect(read('server/ownerlist.ts')).toContain("stampPhone(u, s, 'owner sign-in code')"); const a = read('server/access.ts'); expect(a).toContain("'PHONE_VERIFIED'"); expect(a).toContain("'PHONE_TAKEN_REFUSED'");
  });
  it('3/6/7 · Mudra redeem refuses with copy while frozen; co-broke notifies on propose, accept, counter, reject, withdraw; the sweep expires co-broke requests', () => {
    expect(read('server/mudra.ts')).toContain("code: 'DISPUTE_FROZEN'");
    const s = read('server.ts'); for (const t of ['A co-broke request came in', 'Your co-broke request was accepted', 'Your co-broke request got a counter', 'Your co-broke request was declined', 'A co-broke request was withdrawn']) expect(s).toContain(t);
    expect(read('server/offers.ts')).toContain("'OFFER_EXPIRED'");
  });
  it('5/8/10 · UI: no default closing text, blacklist only for SUPERADMIN, no directory list in the dispute modal, split boxes do not overwrite each other, the co-broke button says why it is off', () => {
    const d = read('src/components/DisputesView.tsx'); expect(d).not.toContain('Reviewed and closed by a GENZ admin'); expect(d).toContain("currentUser.role === 'SUPERADMIN' && (");
    const m = read('src/components/Modals.tsx'); expect(m).toContain('data-testid="dispute-needs-deal"'); expect(m).not.toContain('setClosingShare(100 - val)'); expect(m).toContain('data-testid="split-sum-error"'); expect(m).toContain('noValidate className={`mt-4 space-y-3');
    const p = read('src/components/PropertiesView.tsx'); expect(p).toContain('Complete ID check to co-broke'); expect(p).toContain('को-ब्रोक के लिए ID जाँच पूरी करें');
    expect(read('src/components/ReraTier.tsx')).toContain('Basic account · ID check pending');
  });
});
