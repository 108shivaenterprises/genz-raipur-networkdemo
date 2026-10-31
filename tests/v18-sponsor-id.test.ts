import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  verhoeffValid, verhoeffCheckDigit, isValidAadhaar, normAadhaar, aadhaarLast4, maskAadhaar, isValidPan, normPan, isSponsorEligible,
} from '../src/shared/idRules';

/**
 * v18 — a broker without RERA joins only through a RERA-registered sponsor; GENZ records who registered whom;
 * every broker gives PAN (one per account) and Aadhaar (checksum checked, ONLY the last 4 digits kept); a local associate
 * is approved only after a GENZ admin has seen the cards.
 */
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const PW = 'Strong#Pass2026';
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function loginWith(email: string, password: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  expect(r.status, email).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const login = (id: string) => loginWith(acct(id).email, cfg.demoPassword);
const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
let panSeq = 2000;
const mkPan = () => `QRSPD${++panSeq}K`;
const mkAadhaar = () => { const body = '4' + String(Math.floor(Math.random() * 1e10)).padStart(10, '0'); return body + verhoeffCheckDigit(body); };
const mkApp = (n: string, phone = rnd()) => ({ name: n, phone, city: 'Raipur', reference: 'Known for 6 years, runs an office near Pandri bus stand', consent: true as const });
const regRaw = (code: string, phone: string, extra: any = {}) => fetch(B + '/api/auth/register-invite', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, name: 'Local Associate', phone, password: PW, consent: true, city: 'Raipur', panNumber: mkPan(), aadhaarNumber: mkAadhaar(), idConsent: true, ...extra }) });

/** a fresh RERA-registered (Tier 1) broker: admin invitation → register with RERA + PAN + Aadhaar → admin approves → signed in */
async function newTier1(name: string) {
  const phone = rnd(); const email = `${name.toLowerCase().replace(/\W+/g, '.')}.${Date.now()}@example.in`;
  const inv = await j(await call(jar.SUP, 'POST', '/api/invitations', { invitedEmail: email, invitedPhone: phone, targetRole: 'BROKER' }));
  const pan = mkPan(); const aad = mkAadhaar();
  const r = await fetch(B + '/api/auth/register-invite', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: inv.invitation.code, name, email, phone, password: PW, consent: true, city: 'Raipur', reraNumber: `PCGRERA25${String(++panSeq).slice(-4)}-0001`, panNumber: pan, aadhaarNumber: aad, idConsent: true }) });
  expect(r.status, 'tier1 register').toBe(200);
  const id = (await r.json()).user.id;
  expect((await call(jar.ADMIN, 'POST', `/api/verifications/${id}/review`, { action: 'APPROVE', notes: 'RERA checked on the portal' })).status).toBe(200);
  return { id, name, email, pan, aad, cookie: await loginWith(email, PW) };
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v18-'));
  mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  const sup = cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN')?.id || 'USR-SUPERADMIN';
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', OWN: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1', SUP: sup })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('pure rules: Aadhaar checksum, PAN shape, who may sponsor', () => {
  it('Verhoeff check digit matches the published example and detects a changed digit', () => {
    expect(verhoeffCheckDigit('236')).toBe(3); expect(verhoeffValid('2363')).toBe(true); expect(verhoeffValid('2364')).toBe(false);
    expect(verhoeffValid('')).toBe(false); expect(verhoeffValid('23a3')).toBe(false);
  });
  it('an Aadhaar number is 12 digits, starts 2–9, and passes the checksum; spaces / hyphens are ignored', () => {
    const ok = '234567890124';
    expect(isValidAadhaar(ok)).toBe(true); expect(isValidAadhaar('234567890123')).toBe(false);
    expect(isValidAadhaar('23456789012')).toBe(false); expect(isValidAadhaar('2345678901245')).toBe(false); expect(isValidAadhaar('abcdefghijkl')).toBe(false);
    for (const lead of ['0', '1']) { const body = lead + '3456789012'; expect(isValidAadhaar(body + verhoeffCheckDigit(body))).toBe(false); }
    expect(normAadhaar('2345 6789-0124')).toBe(ok);
    for (let i = 0; i < 25; i++) expect(isValidAadhaar(mkAadhaar())).toBe(true);
  });
  it('only the last 4 digits are ever shown; junk gives nothing', () => {
    expect(aadhaarLast4('234567890124')).toBe('0124'); expect(maskAadhaar('0124')).toBe('XXXX XXXX 0124');
    expect(maskAadhaar(undefined)).toBe(''); expect(maskAadhaar('12')).toBe(''); expect(maskAadhaar('234567890124')).toBe('');
  });
  it('PAN shape', () => {
    expect(isValidPan('ABCPD1001F')).toBe(true); expect(isValidPan('ABCXD1001F')).toBe(false); expect(isValidPan('ABCPD100F')).toBe(false);
    expect(normPan(' abcpd 1001f ')).toBe('ABCPD1001F');
  });
  it('a sponsor is a VERIFIED broker whose RERA registration is on file — never a local associate, owner or pending account', () => {
    expect(isSponsorEligible({ role: 'BROKER', verificationStatus: 'VERIFIED', reraNumber: 'PCGRERA250518-0001' })).toBe(true);
    expect(isSponsorEligible({ role: 'BROKER', verificationStatus: 'VERIFIED', tier: 'TIER1' })).toBe(true);
    expect(isSponsorEligible({ role: 'BROKER', verificationStatus: 'VERIFIED', tier: 'TIER2', reraNumber: 'X1234567' })).toBe(false); // the tier GENZ set wins
    expect(isSponsorEligible({ role: 'BROKER', verificationStatus: 'VERIFIED' })).toBe(false);
    expect(isSponsorEligible({ role: 'BROKER', verificationStatus: 'PENDING', reraNumber: 'PCGRERA250518-0001' })).toBe(false);
    expect(isSponsorEligible({ role: 'BROKER', verificationStatus: 'SUSPENDED', reraNumber: 'PCGRERA250518-0001' })).toBe(false);
    expect(isSponsorEligible({ role: 'PROPERTY_OWNER', verificationStatus: 'VERIFIED', reraNumber: 'PCGRERA250518-0001' })).toBe(false);
    expect(isSponsorEligible(undefined)).toBe(false); expect(isSponsorEligible(null)).toBe(false);
  });
});

let S: Awaited<ReturnType<typeof newTier1>>;     // a fresh RERA-registered sponsor
let T: { id: string; cookie: string; pan: string; aad: string; phone: string };  // the local associate S registered
let U: { id: string; cookie: string; pan: string; code: string; phone: string };  // a second associate (sponsored by BRK-002), left PENDING

describe('a local associate enters only through a RERA-registered sponsor', () => {
  it('the sponsor registers them; PAN + Aadhaar are taken; the full Aadhaar number is never stored or returned', async () => {
    S = await newTier1('Sponsor Sunil');
    const phone = rnd();
    const p = await j(await call(S.cookie, 'POST', '/api/network/tier2/applications', mkApp('Tarun Local', phone)));
    expect(p.invitation.code).toMatch(/^GZ-BRK-/); expect(p.invitation.whatsappText).toContain('Sponsor Sunil'); expect(p.invitation.whatsappText).toMatch(/PAN/);
    const v = await j(await fetch(B + `/api/invitations/validate/${p.invitation.code}`)); expect(v.invitation.sponsorName).toBe('Sponsor Sunil'); expect(v.invitation.tier2).toBe(true);
    const pan = mkPan(); const aad = mkAadhaar();
    const r = await regRaw(p.invitation.code, phone, { panNumber: pan, aadhaarNumber: aad });
    expect(r.status).toBe(200); const raw = await r.text(); const body = JSON.parse(raw);
    expect(body.user.sponsorId).toBe(S.id); expect(body.user.aadhaarLast4).toBe(aad.slice(-4)); expect(body.user.tier).toBe('TIER2'); expect(body.user.verificationStatus).toBe('PENDING');
    expect(raw).not.toContain(aad); expect(JSON.stringify(body)).not.toContain(aad.slice(0, 8));
    T = { id: body.user.id, cookie: r.headers.get('set-cookie')!.split(';')[0], pan, aad, phone };
  });
  it('PENDING → cannot be approved until the admin has SEEN the cards; only users:review can tick; the tick needs both numbers', async () => {
    const early = await call(jar.ADMIN, 'POST', `/api/verifications/${T.id}/review`, { action: 'APPROVE' }); expect(early.status).toBe(400); expect((await early.json()).code).toBe('ID_CHECK_PENDING');
    for (const who of ['BRK1', 'BRK2', 'OWN'] as const) expect((await call(jar[who], 'POST', `/api/network/id-check/${T.id}`, { checked: true })).status, who).toBe(403);
    expect((await call(undefined, 'POST', `/api/network/id-check/${T.id}`, { checked: true })).status).toBe(401);
    expect((await call(jar.ADMIN, 'POST', '/api/network/id-check/USR-NOBODY', { checked: true })).status).toBe(404);
    expect((await call(jar.ADMIN, 'POST', '/api/network/id-check/USR-OWNER-001', { checked: true })).status).toBe(404); // not a broker
    expect((await call(jar.ADMIN, 'POST', '/api/network/id-check/USR-BRK-002', { checked: true })).status).toBe(409); // no Aadhaar on file yet (older broker)
    const ok = await j(await call(jar.ADMIN, 'POST', `/api/network/id-check/${T.id}`, { checked: true, note: 'PAN card + masked Aadhaar on video call' }));
    expect(ok.id.checked).toBe(true); expect(ok.id.aadhaar).toBe(`XXXX XXXX ${T.aad.slice(-4)}`); expect(JSON.stringify(ok)).not.toContain(T.aad);
    // un-ticking works and blocks approval again
    expect((await j(await call(jar.ADMIN, 'POST', `/api/network/id-check/${T.id}`, { checked: false }))).id.checked).toBe(false);
    expect((await call(jar.ADMIN, 'POST', `/api/verifications/${T.id}/review`, { action: 'APPROVE' })).status).toBe(400);
    expect((await call(jar.ADMIN, 'POST', `/api/network/id-check/${T.id}`, { checked: true, note: 'seen again' })).status).toBe(200);
    expect((await call(jar.ADMIN, 'POST', `/api/verifications/${T.id}/review`, { action: 'APPROVE', notes: 'Local reference + ID seen' })).status).toBe(200);
    T.cookie = await loginWith(`${T.phone.slice(-10)}@phone.genz.local`, PW);
  });
  it('a local associate can NEVER sponsor another — a non-RERA chain is impossible', async () => {
    const me = await j(await call(T.cookie, 'GET', '/api/network/me'));
    expect(me.tier).toBe('TIER2'); expect(me.canSponsor).toBe(false); expect(me.canVouch).toBe(false); expect(me.vouchBlock).toMatch(/RERA-registered/);
    const r = await call(T.cookie, 'POST', '/api/network/tier2/applications', mkApp('Chain Link'));
    expect(r.status).toBe(403); expect((await r.json()).code).toBe('VOUCH_BLOCKED');
    expect(me.sponsor.id).toBe(S.id); expect(me.sponsor.name).toBe('Sponsor Sunil'); expect(me.sponsor.rera).toMatch(/^PCGRERA/);
    expect(me.idStatus).toMatchObject({ hasPan: true, hasAadhaar: true, checked: true });
  });
  it('the sponsor must still be an active RERA-registered member when the invitee registers', async () => {
    const S2 = await newTier1('Sponsor Sameer');
    const phone = rnd();
    const p = await j(await call(S2.cookie, 'POST', '/api/network/tier2/applications', mkApp('Vikas Late', phone)));
    expect((await call(jar.SUP, 'POST', `/api/verifications/${S2.id}/review`, { action: 'SUSPEND', notes: 'under review' })).status).toBe(200);
    const r = await regRaw(p.invitation.code, phone); expect(r.status).toBe(409); expect((await r.json()).code).toBe('SPONSOR_INACTIVE');
  });
  it('one PAN = one broker account: a second sign-up with the same PAN is refused (also on the RERA route)', async () => {
    const phone = rnd();
    const p = await j(await call(jar.BRK2, 'POST', '/api/network/tier2/applications', mkApp('Umesh Pending', phone)));
    const dup = await regRaw(p.invitation.code, phone, { panNumber: T.pan }); expect(dup.status).toBe(409); expect((await dup.json()).code).toBe('PAN_IN_USE');
    const dup2 = await regRaw(p.invitation.code, phone, { panNumber: ` ${T.pan.toLowerCase()} ` }); expect(dup2.status).toBe(409); // spaces / case do not help
    // the RERA route
    const email = `dup.${Date.now()}@example.in`; const ph2 = rnd();
    const inv = await j(await call(jar.SUP, 'POST', '/api/invitations', { invitedEmail: email, invitedPhone: ph2, targetRole: 'BROKER' }));
    const rr = await fetch(B + '/api/auth/register-invite', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: inv.invitation.code, name: 'Dup Pan', email, phone: ph2, password: PW, consent: true, reraNumber: 'PCGRERA250999-0001', panNumber: S.pan, aadhaarNumber: mkAadhaar(), idConsent: true }) });
    expect(rr.status).toBe(409);
    // and a fresh PAN works — Umesh stays PENDING for the later tests
    const pan = mkPan(); const ok = await regRaw(p.invitation.code, phone, { panNumber: pan }); expect(ok.status).toBe(200);
    U = { id: (await ok.json()).user.id, cookie: ok.headers.get('set-cookie')!.split(';')[0], pan, code: p.invitation.code, phone };
  });
});

describe('GENZ sees who registered whom; the sponsor sees his own; the member sees who registered him', () => {
  it('suspending the person he registered costs the sponsor a strike, and the admin view shows it', async () => {
    expect((await call(jar.SUP, 'POST', `/api/verifications/${T.id}/review`, { action: 'SUSPEND', notes: 'Fake listings' })).status).toBe(200);
    const me = await j(await call(S.cookie, 'GET', '/api/network/me')); expect(me.strikes).toBe(1); expect(me.sponsoredCount).toBe(1);
    const mine = await j(await call(S.cookie, 'GET', '/api/network/sponsored'));
    expect(mine.totals).toMatchObject({ all: 1, verified: 0, pending: 0, problem: 1 }); expect(mine.members[0]).toMatchObject({ id: T.id, status: 'SUSPENDED', idOnFile: true, idChecked: true });
    expect(JSON.stringify(mine)).not.toMatch(/phone|pan|aadhaar/i);
  });
  it('admin: every sponsor with the people he registered, with masked PAN / Aadhaar and who saw the ID', async () => {
    const d = await j(await call(jar.ADMIN, 'GET', '/api/network/admin/sponsors'));
    const sp = d.sponsors.find((x: any) => x.id === S.id);
    expect(sp).toMatchObject({ name: 'Sponsor Sunil', tier: 'TIER1', total: 1, problem: 1, strikes: 1 }); expect(sp.rera).toMatch(/^PCGRERA/);
    const m = sp.members[0];
    expect(m).toMatchObject({ id: T.id, status: 'SUSPENDED', idOnFile: true, idChecked: true, aadhaar: `XXXX XXXX ${T.aad.slice(-4)}` }); expect(m.pan).toMatch(/^QR•+\w\w$/); expect(m.checkNote).toBe('seen again'); expect(m.checkedBy).toBeTruthy();
    const brk2 = d.sponsors.find((x: any) => x.id === 'USR-BRK-002'); expect(brk2.members.some((x: any) => x.id === U.id && x.status === 'PENDING')).toBe(true);
    expect(d.totals.sponsors).toBeGreaterThanOrEqual(2); expect(d.totals.problem).toBeGreaterThanOrEqual(1); expect(Array.isArray(d.unsponsored)).toBe(true); expect(d.totals.idNotSeen).toBeGreaterThanOrEqual(1);
    const raw = JSON.stringify(d); expect(raw).not.toContain(T.aad); expect(raw).not.toContain(T.pan); expect(raw).not.toMatch(/"phone"|"email"/);
    // only GENZ ops
    for (const who of ['BRK1', 'BRK2', 'OWN'] as const) expect((await call(jar[who], 'GET', '/api/network/admin/sponsors')).status, who).toBe(403);
    expect((await call(undefined, 'GET', '/api/network/admin/sponsors')).status).toBe(401);
  });
  it('admin overview: ID coverage of all brokers and a pending list that shows the sponsor and the ID state', async () => {
    const ov = await j(await call(jar.ADMIN, 'GET', '/api/network/admin/overview'));
    expect(ov.ids.brokers).toBeGreaterThanOrEqual(3); expect(ov.ids.withAadhaar).toBeLessThan(ov.ids.brokers + 1); expect(ov.ids).toHaveProperty('seen');
    const u = ov.pendingTier2.find((x: any) => x.id === U.id); expect(u).toMatchObject({ idOnFile: true, idChecked: false }); expect(u.sponsor).toBeTruthy();
  });
  it('a trust card names the sponsor but carries no ID numbers', async () => {
    const tp = await call(jar.BRK1, 'GET', `/api/network/profile/${U.id}`);
    expect(tp.status).toBe(404); // not verified yet → no public card
    const sp = await j(await call(jar.BRK1, 'GET', `/api/network/profile/${S.id}`)); expect(JSON.stringify(sp)).not.toMatch(/aadhaar|panNumber/i);
  });
});

describe('older brokers add their own PAN + Aadhaar; a pending associate can too', () => {
  it('validation, consent, PAN uniqueness, masking, and editing resets the admin tick', async () => {
    const g0 = await j(await call(jar.BRK1, 'GET', '/api/network/my-id')); expect(g0.required).toBe(false); expect(g0.id.hasAadhaar).toBe(false);
    const aad = mkAadhaar(); const pan = mkPan();
    const post = (b: any) => call(jar.BRK1, 'POST', '/api/network/my-id', b);
    expect((await post({ panNumber: pan, aadhaarNumber: aad })).status).toBe(400);                                           // no consent
    expect((await post({ panNumber: pan, aadhaarNumber: aad, consent: false })).status).toBe(400);
    expect((await post({ panNumber: 'BAD', aadhaarNumber: aad, consent: true })).status).toBe(400);
    expect((await post({ panNumber: pan, aadhaarNumber: '234567890123', consent: true })).status).toBe(400);                  // bad checksum
    expect((await post({ panNumber: pan, consent: true })).status).toBe(400);                                                 // no Aadhaar
    const clash = await post({ panNumber: S.pan, aadhaarNumber: aad, consent: true }); expect(clash.status).toBe(409); expect((await clash.json()).code).toBe('PAN_IN_USE');
    const ok = await post({ panNumber: pan, aadhaarNumber: aad, consent: true }); expect(ok.status).toBe(200);
    const body = await ok.text(); expect(body).not.toContain(aad); const id = JSON.parse(body).id;
    expect(id).toMatchObject({ hasPan: true, hasAadhaar: true, aadhaar: `XXXX XXXX ${aad.slice(-4)}`, checked: false }); expect(id.pan).toMatch(/^QR•+/);
    expect((await call(jar.ADMIN, 'POST', '/api/network/id-check/USR-BRK-001', { checked: true })).status).toBe(200);
    expect((await j(await call(jar.BRK1, 'GET', '/api/network/my-id'))).id.checked).toBe(true);
    // same numbers again → the tick stays; different Aadhaar → the tick is cleared and the admin must look again
    expect((await j(await post({ aadhaarNumber: aad, consent: true }))).id.checked).toBe(true);
    expect((await j(await post({ aadhaarNumber: mkAadhaar(), consent: true }))).id.checked).toBe(false);
    // owners and anonymous callers cannot use it
    expect((await call(jar.OWN, 'POST', '/api/network/my-id', { panNumber: mkPan(), aadhaarNumber: mkAadhaar(), consent: true })).status).toBe(403);
    expect((await call(undefined, 'GET', '/api/network/my-id')).status).toBe(401);
  });
  it('a PENDING associate (cannot use the rest of the app yet) can still add or correct his ID', async () => {
    const g = await j(await call(U.cookie, 'GET', '/api/network/my-id')); expect(g.required).toBe(true); expect(g.id.hasPan).toBe(true);
    const aad = mkAadhaar();
    const r = await call(U.cookie, 'POST', '/api/network/my-id', { aadhaarNumber: aad, consent: true }); expect(r.status).toBe(200);
    expect((await r.json()).id.aadhaar).toBe(`XXXX XXXX ${aad.slice(-4)}`);
  });
});

describe('DPDP: erasure removes PAN, Aadhaar last-4 and the ID check', () => {
  it('after an erasure request is completed nothing about the ID is left on the account', async () => {
    const users = async () => (await j(await call(jar.SUP, 'GET', '/api/auth/users'))).users as any[];
    const before = (await users()).find(x => x.id === U.id); expect(before.aadhaarLast4).toBeTruthy(); expect(before.panNumber).toBeTruthy();
    const f = await j(await call(U.cookie, 'POST', '/api/privacy/requests', { type: 'ERASURE', details: 'Please delete my account' }));
    expect((await call(jar.SUP, 'POST', `/api/privacy/requests/${f.request.id}/resolve`, { decision: 'COMPLETE' })).status).toBe(200);
    const after = (await users()).find(x => x.id === U.id);
    expect(after.panNumber).toBeUndefined(); expect(after.aadhaarLast4).toBeUndefined(); expect(after.idCheckedAt).toBeUndefined(); expect(after.idConsentAt).toBeUndefined();
  });
});
