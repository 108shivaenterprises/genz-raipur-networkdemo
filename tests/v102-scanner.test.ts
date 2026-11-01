import { freePort } from './helpers/port';
/**
 * v102 — the broker's QR scanner, every QR and every outcome: for each one, the error the person must hear, and where the record lands.
 *  A. the buyer's visit pass (broker-to-broker site visit): no promise yet · wrong person · too early · wrong QR / wrong code (try counter, lock) · GPS far / bad / near ·
 *     success by QR (listing broker) and by code (owner) → visit, deal stage, audit trail (who), buyer bond, timeline, bell; afterwards “already verified”.
 *  B. the builder-project pass: unknown code, someone else's pass, not yet open, used, cancelled, lost lead, no promise, no ID check → success lands in lead + audit + partner's bell + board.
 *  C. every OTHER GENZ QR a broker may point the scanner at is named for what it is (pure).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { ackBuyer } from './helpers/ack.js';
import { otherGenzQr, OTHER_QR_WORDS, NOT_GENZ_QR } from '../src/shared/scanRules.js';
import { normalizeCode } from '../src/shared/visitRules.js';

const ROOT = path.resolve(__dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const err = async (r: Response) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }) as any;
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const slot = (h = 1) => new Date(Date.now() + h * 3600_000).toISOString();

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v102s-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PUSH_DRY_RUN: 'true', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', BRK3: 'USR-BRK-003', OWN: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1', BLD: 'USR-BUILDER-001', BLD2: 'USR-BUILDER-002' })) jar[k] = await login(id);
}, 90000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const auditAll = async () => JSON.stringify(await j(await call(jar.ADMIN, 'GET', '/api/audit-logs?limit=500')));
const inbox = async (who: string) => ((await j(await call(jar[who], 'GET', '/api/inbox?lang=en'))).items || []) as any[];

describe('A — the buyer’s visit pass at the property (broker-to-broker)', () => {
  const LAT = 21.2514; const LNG = 81.6296;
  let P: any; let DEAL = '';
  const visitsOf = async (who: string) => ((await j(await call(jar[who], 'GET', `/api/site-visits?propertyId=${P.id}`))).siteVisits as any[]);
  const book = async (name: string, hours: number, promised = true) => {
    const phone = rnd(); const r = await call(jar.BRK2, 'POST', '/api/site-visits', { propertyId: P.id, customerName: name, customerPhone: phone, scheduledTime: slot(hours) });
    expect(r.status, await r.clone().text()).toBe(200); const b = await j(r); DEAL = b.dealRoom.id;
    if (promised) expect(await ackBuyer(B, call, jar.BRK2, 'VISIT', b.siteVisit.id, phone)).toBe(303);
    const secret = (await visitsOf('ADMIN')).find(v => v.id === b.siteVisit.id)!;
    return { id: b.siteVisit.id as string, phone, qr: secret.qrToken as string, otp: secret.otpCode as string };
  };
  const qr = (who: string, id: string, body: any) => call(jar[who], 'POST', `/api/site-visits/${id}/checkin-qr`, body);
  const otp = (who: string, id: string, code: string) => call(jar[who], 'POST', `/api/site-visits/${id}/verify-otp`, { otpCode: code });
  const state = async (id: string) => (await visitsOf('ADMIN')).find(v => v.id === id)!;

  it('setup: BRK1 lists a house (with its location) for owner OWN; GENZ approves it', async () => {
    const body = { title: 'Scanner test house Devendra Nagar QA', description: 'A residential house, east facing, near the park', propertyType: 'Independent House', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: 'Devendra Nagar', addressHidden: 'Lane 3, Devendra Nagar', askingPrice: 6150000, ownerApprovedNetPrice: 5900000, builtUpAreaSqFt: 1480, ownerName: 'Owner QA', ownerPhone: '9123450188', ownerId: 'USR-OWNER-001', latitude: LAT, longitude: LNG };
    const c = await call(jar.BRK1, 'POST', '/api/properties', body); expect(c.status, await c.clone().text()).toBe(200); P = (await j(c)).property;
    if (P.verificationStatus !== 'VERIFIED') expect((await call(jar.ADMIN, 'POST', `/api/properties/${P.id}/moderate`, { action: 'APPROVE' })).status).toBe(200);
    P = (await j(await call(jar.BRK1, 'GET', `/api/properties/${P.id}`))).property || P; expect(P.latitude).toBe(LAT);
  });

  it('A1 · an unknown visit, a visit scanned without login: each hears its own plain error', async () => {
    expect(await err(await qr('BRK1', 'SV-2026-9999', { qrToken: 'abc' }))).toMatchObject({ status: 404, error: 'Site visit record not found' });
    expect((await call(undefined, 'POST', '/api/site-visits/SV-2026-9999/checkin-qr', { qrToken: 'abc' })).status).toBe(401);
  });

  it('A2 · the buyer has not promised yet: the property side hears “buyer must confirm first”, the booker “you booked it”, the outsider “not your property” — nothing is recorded', async () => {
    const v = await book('Rohit Sharma Scan A2', 1, false);
    for (const who of ['BRK1', 'OWN']) {
      const q = await err(await qr(who, v.id, { qrToken: v.qr })); expect(q, who).toMatchObject({ status: 409, code: 'ACK_REQUIRED' }); expect(q.error, who).toMatch(/no direct deal/i);
      const o = await err(await otp(who, v.id, v.otp)); expect(o, who).toMatchObject({ status: 409, code: 'ACK_REQUIRED' });
    }
    const m = await err(await qr('BRK2', v.id, { qrToken: v.qr })); expect(m).toMatchObject({ status: 403, code: 'MAKER_CHECKER' }); expect(m.error).toMatch(/You scheduled this visit/);
    const p = await err(await qr('BRK3', v.id, { qrToken: v.qr })); expect(p).toMatchObject({ status: 403, code: 'PROPERTY_SIDE_ONLY' }); expect(p.error).toMatch(/Only the property side/);
    expect((await state(v.id)).isVerified).toBe(false);
    expect(await auditAll()).not.toContain(`Site visit ${v.id} checked in`);
    expect((await visitsOf('BRK3')).some(x => x.id === v.id)).toBe(false);          // the outsider never even sees it
  });

  it('A3 · too early (more than 6 h before the slot): the property side is told when it opens; nothing is recorded; the booker moves the visit and then it opens', async () => {
    const v = await book('Sunita Tiwari Scan A3', 12);
    for (const who of ['BRK1', 'OWN']) {
      const q = await err(await qr(who, v.id, { qrToken: v.qr })); expect(q, who).toMatchObject({ status: 400, code: 'TOO_EARLY' }); expect(q.error, who).toMatch(/6 hours/);
      expect((await err(await otp(who, v.id, v.otp))).code, who).toBe('TOO_EARLY');
    }
    expect((await state(v.id)).isVerified).toBe(false);
    expect((await visitsOf('BRK1')).find(x => x.id === v.id)!.gate).toMatchObject({ code: 'TOO_EARLY', ok: false });
    expect((await err(await call(jar.BRK1, 'POST', `/api/site-visits/${v.id}/reschedule`, { scheduledTime: slot(1) }))).code).toBe('NOT_BOOKER');
    expect((await call(jar.BRK2, 'POST', `/api/site-visits/${v.id}/reschedule`, { scheduledTime: slot(1) })).status).toBe(200);
    expect((await visitsOf('BRK1')).find(x => x.id === v.id)!.gate).toMatchObject({ code: 'OK', ok: true });
    expect((await qr('BRK1', v.id, { qrToken: v.qr })).status).toBe(200);
  });

  it('A4 · wrong QR / wrong code: each one counts a try and says how many are left; at 5 the visit is LOCKED for everybody (even the right QR), the booker cannot move it, nothing is recorded', async () => {
    const v = await book('Mohan Verma Scan A4', 1);
    const w1 = await err(await qr('BRK1', v.id, { qrToken: 'WRONGTOKEN123' })); expect(w1).toMatchObject({ status: 400 }); expect(w1.error).toMatch(/Invalid or expired QR/);
    const w2 = await err(await otp('OWN', v.id, v.otp === '000000' ? '111111' : '000000')); expect(w2.status).toBe(400); expect(w2.error).toMatch(/3 attempt\(s\) left/);
    const w3 = await err(await otp('BRK1', v.id, '123456' === v.otp ? '654321' : '123456')); expect(w3.error).toMatch(/2 attempt\(s\) left/);
    expect((await err(await qr('BRK1', v.id, { qrToken: 'WRONGTOKEN456' }))).status).toBe(400);
    expect((await err(await qr('BRK1', v.id, { qrToken: 'WRONGTOKEN789' }))).status).toBe(400);
    for (const [who, run] of [['BRK1', () => qr('BRK1', v.id, { qrToken: v.qr })], ['OWN', () => otp('OWN', v.id, v.otp)]] as const) {
      const l = await err(await run()); expect(l, who).toMatchObject({ status: 429, code: 'LOCKED' }); expect(l.error, who).toMatch(/locked/);
    }
    expect((await err(await call(jar.BRK2, 'POST', `/api/site-visits/${v.id}/reschedule`, { scheduledTime: slot(2) }))).code).toBe('LOCKED');
    expect((await visitsOf('BRK1')).find(x => x.id === v.id)!.gate).toMatchObject({ code: 'LOCKED', ok: false });
    expect((await state(v.id)).isVerified).toBe(false);
  });

  it('A5 · the location: a broken GPS is refused, a phone 100+ km away is refused (and does not verify), a phone at the property verifies and the evidence says “GPS checked”', async () => {
    const v = await book('Kavita Joshi Scan A5', 1);
    const bad = await err(await qr('BRK1', v.id, { qrToken: v.qr, latitude: 95, longitude: 10 })); expect(bad.status).toBe(400); expect(bad.error).toMatch(/Invalid GPS/);
    const far = await err(await qr('BRK1', v.id, { qrToken: v.qr, latitude: LAT + 1, longitude: LNG + 1 })); expect(far.status).toBe(400); expect(far.error).toMatch(/Check-in rejected: you appear to be \d+(\.\d)? km from the property/);
    expect((await state(v.id)).isVerified).toBe(false);
    const ok = await qr('BRK1', v.id, { qrToken: ` ${v.qr} `, latitude: LAT + 0.001, longitude: LNG + 0.001 }); expect(ok.status, await ok.clone().text()).toBe(200);
    const s = await state(v.id); expect(s).toMatchObject({ isVerified: true, verificationMethod: 'QR', gpsChecked: true });
    expect(await auditAll()).toContain('[GPS: ');
  });

  let V: { id: string; phone: string; qr: string; otp: string };
  it('A6 · the OWNER types the buyer’s code (no listing broker involved): verified by OTP, the audit trail names the owner, the deal moves to “Site Visit Done” for all', async () => {
    V = await book('Anil Kumar Gupta Scan A6', 1);
    const before = (await j(await call(jar.BRK2, 'GET', `/api/deals/${DEAL}`))).deal; const n0 = before.siteVisitsCount;
    const r = await otp('OWN', V.id, V.otp); expect(r.status, await r.clone().text()).toBe(200);
    for (const who of ['BRK1', 'BRK2', 'OWN', 'ADMIN']) { const x = (await visitsOf(who)).find(v => v.id === V.id)!; expect(x.isVerified, who).toBe(true); expect(x.verificationMethod, who).toBe('OTP'); expect(x.verifiedAt, who).toBeTruthy(); }
    for (const who of ['BRK1', 'BRK2', 'OWN']) { const d = (await j(await call(jar[who], 'GET', `/api/deals/${DEAL}`))).deal; expect(d.stage, who).toBe('Site Visit Done'); expect(d.siteVisitsCount, who).toBe(n0); }
    const evs = async (who: string) => ((await j(await call(jar[who], 'GET', `/api/audit-logs?q=${V.id}&limit=100`))).events || []) as any[];
    const ev = (await evs('ADMIN')).find(e => e.action === 'SITE_VISIT_CONFIRMED'); expect(ev, 'a SITE_VISIT_CONFIRMED event for this visit').toBeTruthy(); expect(ev.actorId).toBe('USR-OWNER-001');
    for (const who of ['BRK2', 'OWN']) expect((await evs(who)).some(e => e.action === 'SITE_VISIT_CONFIRMED'), who).toBe(true);          // the booker and the owner can read their own trail
    expect((await evs('BRK3')).length).toBe(0);                                                                                      // an outsider reads nothing of it
  });

  it('A7 · after it is verified: scanning again / typing the code / moving or reminding says “already verified” — and the buyer bond now protects BRK2', async () => {
    expect((await err(await qr('BRK1', V.id, { qrToken: V.qr }))).code).toBe('DONE');
    expect((await err(await otp('OWN', V.id, V.otp))).code).toBe('DONE');
    expect((await err(await call(jar.BRK2, 'POST', `/api/site-visits/${V.id}/reschedule`, { scheduledTime: slot(2) }))).code).toBe('DONE');
    expect((await err(await call(jar.BRK2, 'POST', `/api/site-visits/${V.id}/remind`, {}))).code).toBe('DONE');
    const e = await err(await call(jar.BRK3, 'POST', '/api/site-visits', { propertyId: P.id, customerName: 'Anil Kumar Gupta', customerPhone: V.phone, scheduledTime: slot(4) })); expect(e.status).toBe(409);
  });

  it('A8 · the record is on the deal timeline, and the bell tells the people who did NOT confirm it (booker · owner · listing broker) — each in his own words, never the confirmer himself', async () => {
    expect(JSON.stringify(await j(await call(jar.BRK2, 'GET', '/api/activity-feed')))).toContain('SITE_VISIT_VERIFIED');
    const line = async (who: string, re: RegExp) => (await inbox(who)).filter(i => re.test(i.title));
    // A6: OWN typed the code → BRK2 (booker) and BRK1 (listing broker) hear it, OWN does not; A5/A3: BRK1 scanned → BRK2 and OWN hear it
    const done = /Visit verified/;
    expect((await line('BRK2', done)).length).toBeGreaterThanOrEqual(3);
    const own = await line('OWN', done); expect(own.length).toBeGreaterThanOrEqual(2);
    const b1 = await line('BRK1', done); expect(b1.length).toBeGreaterThanOrEqual(1);
    expect(b1.every(i => /reached the property — confirmed by/.test(i.body))).toBe(true);
    for (const i of [...own, ...b1, ...(await line('BRK2', done))]) { expect(i.body).not.toMatch(/\d{10}/); expect(i.body).not.toContain('Gupta'); }       // the buyer is shown by initials only, never a number
    expect((await line('BRK3', done)).length).toBe(0);
    // booked: the property side heard it when it was booked
    const booked = /Visit booked/; expect((await line('BRK1', booked)).length).toBeGreaterThanOrEqual(5); expect((await line('OWN', booked)).length).toBeGreaterThanOrEqual(5); expect((await line('BRK2', booked)).length).toBe(0); expect((await line('BRK3', booked)).length).toBe(0);
    const hi = ((await j(await call(jar.OWN, 'GET', '/api/inbox?lang=hi'))).items as any[]).find(i => /विज़िट बुक/.test(i.title)); expect(hi, 'Hindi line').toBeTruthy();
  });
});

describe('B — the builder-project pass (the builder’s team scans, the partner broker never)', () => {
  const phone = rnd(); let PROJ = ''; let M1 = ''; let LEAD = ''; let pass: any;
  const scanGet = (who: string, code: string) => call(jar[who], 'GET', `/api/visits/scan/${code}`);
  const scanOk = (who: string, code: string, body: any = { idChecked: true }) => call(jar[who], 'POST', `/api/visits/scan/${code}/confirm`, body);
  const issue = async (leadId: string, hours: number) => (await j(await call(jar.BRK1, 'POST', '/api/visits/passes', { leadId, scheduledAt: slot(hours), partySize: 2 }))).pass;
  const newLead = async (name: string) => { const p = rnd(); const l = (await j(await call(jar.BRK1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name, phone: p }))).lead; return { id: l.id as string, phone: p }; };

  it('setup: a builder project, BRK1 is its approved partner, one lead, one pass', async () => {
    const p = await j(await call(jar.BLD, 'POST', '/api/builder/projects', { projectName: 'Scanner Heights QA', locality: 'Shankar Nagar', reraNumber: 'CGRERAP777777', priceStartingFrom: 4500000, priceMax: 9000000, totalUnits: 40, channelPartnerCommissionPct: 2, unitConfigurations: ['2 BHK'] }));
    PROJ = p.project?.id || p.projectId || p.id; expect(PROJ).toBeTruthy();
    await call(jar.BRK1, 'POST', `/api/pcontrol/partner/projects/${PROJ}/apply`, {});
    M1 = (await j(await call(jar.BLD, 'GET', `/api/pcontrol/builder/projects/${PROJ}`))).partners.find((m: any) => m.brokerId === 'USR-BRK-001').id;
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${M1}/decide`, { action: 'APPROVE', commissionPct: 2 })).status).toBe(200);
    const l = await newLead('Ramesh Sahu Scan B'); LEAD = l.id; pass = await issue(LEAD, 1); (pass as any).phone = l.phone;
    expect(pass.code).toMatch(/^[A-Z2-9]{10}$/);
  });

  it('B1 · before the buyer has promised: the builder sees the warning and cannot confirm; nothing changes in the lead', async () => {
    const s = await j(await scanGet('BLD', pass.code)); expect(s.canConfirm).toBe(false); expect(s.warnings.join()).toMatch(/not yet confirmed/);
    const c = await err(await scanOk('BLD', pass.code)); expect(c).toMatchObject({ status: 409, code: 'ACK_REQUIRED' });
    const lead = (await j(await call(jar.BRK1, 'GET', `/api/crm/leads/${LEAD}`))).lead; expect(lead.stage).not.toBe('SITE_VISITED'); expect(lead.visitProof).toBeFalsy();
  });

  it('B2 · who may scan: the partner broker who issued it, an outsider broker, another builder, the owner, an anonymous person — each hears their own error; a junk code hears “not a valid pass”', async () => {
    expect((await err(await scanGet('BRK1', pass.code))).status).toBe(403);                         // maker ≠ checker: the issuer has no scan right at all
    expect((await err(await scanGet('BRK3', pass.code))).status).toBe(403);
    expect((await err(await scanGet('OWN', pass.code))).status).toBe(403);
    expect((await call(undefined, 'GET', `/api/visits/scan/${pass.code}`)).status).toBe(401);
    const f = await err(await scanGet('BLD2', pass.code)); expect(f).toMatchObject({ status: 404, code: 'NOT_YOUR_PASS' }); expect(f.error).toMatch(/NOT for your project/);
    const u = await err(await scanGet('BLD', 'ZZZZZZZZZ2')); expect(u.status).toBe(404); expect(u.error).toMatch(/not a valid GENZ visit pass/); expect(u.code).toBeUndefined();
    expect((await err(await scanOk('BRK1', pass.code))).status).toBe(403);
  });

  it('B3 · the buyer promises → the builder confirms: needs the ID-check tick; then the lead moves to “site visited”, the audit trail names the builder, the partner’s bell rings, the board shows it done', async () => {
    expect(await ackBuyer(B, call, jar.BRK1, 'PASS', pass.id, pass.phone)).toBe(303);
    const s = await j(await scanGet('BLD', pass.code)); expect(s.canConfirm).toBe(true); expect(s.pass.customerName).toBe('Ramesh Sahu Scan B'); expect(s.pass.phoneLast4).toBe(pass.phone.slice(-4)); expect(JSON.stringify(s)).not.toContain(pass.phone);
    const noId = await err(await scanOk('BLD', pass.code, { idChecked: false })); expect(noId.status).toBe(400); expect(noId.error).toMatch(/photo ID/);
    expect((await err(await scanOk('BLD', pass.code, {}))).status).toBe(400);
    const ok = await scanOk('BLD', pass.code, { idChecked: true, partySize: 3, note: 'came with wife' }); expect(ok.status, await ok.clone().text()).toBe(200); expect((await j(ok)).stage).toBe('SITE_VISITED');
    const lead = (await j(await call(jar.BRK1, 'GET', `/api/crm/leads/${LEAD}`))).lead; expect(lead.stage).toBe('SITE_VISITED'); expect(lead.visitProof).toMatchObject({ passId: pass.id }); expect(JSON.stringify(lead.activities)).toMatch(/QR-verified site visit/);
    const mine = ((await j(await call(jar.BRK1, 'GET', '/api/visits/passes'))).passes as any[]).find(p => p.id === pass.id); expect(mine.status).toBe('USED'); expect(mine.partySize).toBe(3);
    const evs = ((await j(await call(jar.ADMIN, 'GET', `/api/audit-logs?q=${pass.id}&limit=50`))).events || []) as any[]; const ev = evs.find(e => e.action === 'VISIT_PASS_SCANNED'); expect(ev).toBeTruthy(); expect(ev.actorId).toBe('USR-BUILDER-001');
    expect((await inbox('BRK1')).some(i => /Site visit confirmed/.test(i.title))).toBe(true);
    const board = await j(await call(jar.BLD, 'GET', '/api/visits/board')); expect(board.done.some((p: any) => p.id === pass.id)).toBe(true); expect(board.expected.some((p: any) => p.id === pass.id)).toBe(false);
  });

  it('B4 · scanned a second time: “already used” with when and by whom; no second confirmation', async () => {
    const s = await j(await scanGet('BLD', pass.code)); expect(s.canConfirm).toBe(false); expect(s.pass.status).toBe('USED'); expect(s.warnings.join()).toMatch(/Already used on .* by /);
    const c = await err(await scanOk('BLD', pass.code)); expect(c).toMatchObject({ status: 409 }); expect(c.error).toMatch(/already been used/);
  });

  it('B5 · a pass for a visit days away is “not open yet” (with the time it opens); a cancelled pass and a replaced pass say so; a lost lead cannot be confirmed', async () => {
    const l2 = await newLead('Future Buyer Scan B'); const p2 = await issue(l2.id, 72); expect(await ackBuyer(B, call, jar.BRK1, 'PASS', p2.id, l2.phone)).toBe(303);
    const s2 = await j(await scanGet('BLD', p2.code)); expect(s2.canConfirm).toBe(false); expect(s2.warnings.join()).toMatch(/Pass opens /);
    const c2 = await err(await scanOk('BLD', p2.code)); expect(c2.status).toBe(409); expect(c2.error).toMatch(/Pass opens /);
    // replaced: a new pass for the same lead supersedes the old one
    const p3 = await issue(l2.id, 1); const old = await j(await scanGet('BLD', p2.code)); expect(old.pass.status).toBe('SUPERSEDED'); expect(old.warnings.join()).toMatch(/superseded/i); expect((await err(await scanOk('BLD', p2.code))).error).toMatch(/superseded/i);
    // cancelled
    expect((await call(jar.BRK1, 'POST', `/api/visits/passes/${p3.id}/cancel`, {})).status).toBe(200);
    const sc = await j(await scanGet('BLD', p3.code)); expect(sc.canConfirm).toBe(false); expect(sc.warnings.join()).toMatch(/cancelled/i); expect((await err(await scanOk('BLD', p3.code))).error).toMatch(/cancelled/i);
    expect((await err(await call(jar.BRK1, 'POST', `/api/visits/passes/${p3.id}/cancel`, {}))).error).toMatch(/already cancelled/);
  });

  it('B6 · too many bad scans lock the scanner for ten minutes (so codes cannot be guessed) — a good code is then refused too', async () => {
    let last = 0; for (let i = 0; i < 12; i++) last = (await call(jar.BLD2, 'GET', `/api/visits/scan/ZZZZZZZZ${(i % 8) + 2}${(i % 7) + 2}`)).status;
    expect(last).toBe(429);
    const locked = await err(await call(jar.BLD2, 'GET', `/api/visits/scan/${pass.code}`)); expect(locked.status).toBe(429); expect(locked.error).toMatch(/locked for 10 minutes/);
  });
});

describe('C — every other GENZ QR is named for what it is (pure)', () => {
  const T = 'AbCdEfGhIjKlMnOpQrStUvWx'; // a 24-char token like the server makes
  it('the buyer’s promise link, shop QR, chat link, partner page, owner consent, bill, shared listing, broker card', () => {
    expect(otherGenzQr(`https://genz.example/a/${'a1b2c3d4e5'}-${'0123456789abcdef01234567'}`)).toBe('BUYER_PROMISE');
    expect(otherGenzQr('https://genz-raipur-networkdemo.vercel.app/q/K7M2P9XQ')).toBe('SHOP_QR');
    expect(otherGenzQr(`https://genz.example/q/chat/${T}`)).toBe('SHOP_QR');
    expect(otherGenzQr(`/sp/${T}`)).toBe('PARTNER_PAGE');
    expect(otherGenzQr(`https://genz.example/oc/${T}`)).toBe('OWNER_CONSENT');
    expect(otherGenzQr(`https://genz.example/pay/${T}`)).toBe('BILL');
    expect(otherGenzQr('https://genz.example/s/Ab12Cd34')).toBe('SHARED_LISTING');
    expect(otherGenzQr('https://genz.example/c/krishna-genz')).toBe('BROKER_CARD');
  });
  it('things that are NOT another GENZ page: empty, plain text, a website’s home, a half link, a mailto, a UPI link, a builder pass, a visit pass', () => {
    for (const t of ['', '   ', 'hello', 'https://google.com', 'https://genz.example/', 'https://genz.example/c/', 'https://genz.example/q/', 'mailto:a@b.com', 'upi://pay?pa=a@b&am=100', 'https://genz.example/a/short', 'https://genz.example/oc/short', 'GENZV:ABCDEFGHJK', 'https://genz.example/v/ABCDEFGHJK', JSON.stringify({ visitId: 'SV-2026-101', token: 'VISIT-PASS-SV-2026-101' }), 'x'.repeat(700)])
      expect(otherGenzQr(t), t.slice(0, 40)).toBe('');
  });
  it('every kind has its own plain words in English and Hindi, and says it is not a visit pass / what to do', () => {
    for (const [k, w] of Object.entries(OTHER_QR_WORDS)) { expect(w.en.length, k).toBeGreaterThan(40); expect(w.hi, k).toMatch(/[ऀ-ॿ]/); expect(w.en, k).not.toEqual(NOT_GENZ_QR.en); }
    expect(new Set(Object.values(OTHER_QR_WORDS).map(w => w.en)).size).toBe(Object.keys(OTHER_QR_WORDS).length);
    expect(NOT_GENZ_QR.en).toMatch(/not a GENZ visit QR/);
  });
  it('a builder pass is read as a pass code in all three shapes (GENZV:, a /v/ link, the bare code), a lookalike is not', () => {
    for (const t of ['GENZV:ABCDEFGHJK', 'https://genz.example/v/ABCDEFGHJK', 'abcdefghjk', 'ABCDE-FGHJK']) expect(normalizeCode(t), t).toBe('ABCDEFGHJK');
    for (const t of ['GENZV:ABCDEFGHIK', 'ABCDEFGHJ', 'ABCDEFGHJKL', 'hello world']) expect(normalizeCode(t), t).toBe('');
  });
});

describe('D — the screens use the same words (source guards: there is no DOM test environment; the real-browser run is in the V102 doc)', () => {
  const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
  it('both scanners (home QR button and the Visit QR screen) name another GENZ QR from ONE place, with Hindi', () => {
    for (const f of ['src/components/QuickScan.tsx', 'src/components/VisitsView.tsx']) { const t = read(f); expect(t, f).toContain("from '../shared/scanRules.js'"); expect(t, f).toContain('otherGenzQr('); expect(t, f).toContain('OTHER_QR_WORDS'); expect(t, f).toContain('NOT_GENZ_QR'); }
  });
  it('the home scan shows the property by its name (not “PROP-104”)', () => {
    const q = read('src/components/QuickScan.tsx'); expect(q).toContain('api.getProperty(v.propertyId)'); expect(q).toContain('property={open.property}');
  });
  it('the pass screen shows “this QR has no check-in secret / belongs to a different visit” — the scan effect runs AFTER the one that clears the error', () => {
    const m = read('src/components/SiteVisitQrPassModal.tsx');
    const clear = m.indexOf('setCheckinSuccess(visit.isVerified);'); const scan = m.indexOf('if (initialScan && !visit.isVerified) onScanned(initialScan)');
    expect(clear).toBeGreaterThan(0); expect(scan).toBeGreaterThan(clear);
  });
  it('the server’s words: “too early” says 6 hours (not “on the day”), a wrong QR says how many tries are left, the property side is told on booking and the others on verifying', () => {
    const s = read('server.ts');
    expect(s).toContain('can be verified from 6 hours before its scheduled time'); expect(s).not.toContain('can only be verified on the day');
    expect(s).toContain('Invalid or expired QR verification token. ${Math.max(0, 5 - visit.otpAttempts)} attempt(s) left.');
    expect(s).toContain("`Visit booked · ${prop.title}`"); expect(s).toContain("`Visit verified ✔ · ${vprop?.title || visit.propertyId}`");
  });
});
