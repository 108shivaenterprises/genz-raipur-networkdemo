import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { tierOf, inProbation, sameParty, splitOk, tieupDays, monthKey } from '../src/shared/networkRules';
import { verhoeffCheckDigit } from '../src/shared/idRules';

/** v15: property-side visit verification, multi-offer + token lock, sold/relist/purge, poster, deal timeline. */
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const slot = (h = 1) => new Date(Date.now() + h * 3600_000).toISOString();
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v15-'));
  mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true',  }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  const sup = cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN')?.id || 'USR-SUPERADMIN';
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', OWN: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1', SUP: sup })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const mkApp = (n: string, phone = rnd(), extra: any = {}) => ({ name: n, phone, city: 'Raipur', reference: 'Known for 6 years, runs an office near Pandri bus stand', consent: true as const, ...extra });
// v18: every broker gives a PAN (one per account) and an Aadhaar (valid checksum; only the last 4 digits are kept)
let panSeq = 1000;
const mkPan = () => `ABCPD${++panSeq}F`;
const mkAadhaar = () => { const body = '2' + String(Math.floor(Math.random() * 1e10)).padStart(10, '0'); return body + verhoeffCheckDigit(body); };
const reg = (code: string, phone: string, extra: any = {}) => fetch(B + '/api/auth/register-invite', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, name: 'Local Associate', phone, password: 'Strong#Pass2026', consent: true, city: 'Raipur', panNumber: mkPan(), aadhaarNumber: mkAadhaar(), idConsent: true, ...extra }) });
let T2PHONE = ''; let T2ID = ''; let T2COOKIE = '';

describe('pure rules', () => {
  it('tier derivation, probation, same-party, split and validity limits', () => {
    expect(tierOf({ role: 'BROKER', reraNumber: 'X1' })).toBe('TIER1'); expect(tierOf({ role: 'BROKER' })).toBe('TIER2'); expect(tierOf({ role: 'BROKER', tier: 'TIER2', reraNumber: 'X1' })).toBe('TIER2'); expect(tierOf({ role: 'DEVELOPER_BUILDER' })).toBeNull();
    expect(inProbation({ probationUntil: new Date(Date.now() + 1000).toISOString() })).toBe(true); expect(inProbation({})).toBe(false);
    expect(sameParty({ phone: '+91 98261 12345' }, { phone: '9826112345' })).toBe(true); expect(sameParty({ companyName: 'ABC Realty' }, { companyName: 'abc realty ' })).toBe(true); expect(sameParty({ phone: '9826112345', companyName: 'A' }, { phone: '9000000000', companyName: 'B' })).toBe(false);
    expect(splitOk(5)).toMatch(/between/); expect(splitOk(55.5)).toMatch(/whole/); expect(splitOk(60)).toBe('');
    expect(tieupDays(1)).toBe(7); expect(tieupDays(9999)).toBe(365); expect(tieupDays(undefined)).toBe(180); expect(monthKey('2026-10-14T10:00:00Z')).toBe('2026-10');
  });
});

describe('Tier 2 entry: a RERA-registered sponsor registers them — no RERA asked, but PAN + Aadhaar', () => {
  it('one Tier 1 sponsor is enough; bad input refused; the invitation is phone-bound; the admin must SEE the ID before approving', async () => {
    T2PHONE = rnd();
    const p = await j(await call(jar.BRK2, 'POST', '/api/network/tier2/applications', mkApp('Mohan Verma', T2PHONE)));
    expect(p.success).toBe(true); expect(p.invitation.code).toMatch(/^GZ-BRK-/); expect(p.invitation.whatsappText).toMatch(/PAN/); expect(p.application.status).toBe('INVITED');
    const id = p.application.id;
    expect((await call(jar.BRK2, 'POST', `/api/network/tier2/applications/${id}/vouch`, {})).status).toBe(409); // already invited — nothing more to add
    expect((await call(jar.OWN, 'POST', `/api/network/tier2/applications/${id}/vouch`, {})).status).toBe(403); // owners cannot sponsor
    const dup = await call(jar.BRK1, 'POST', '/api/network/tier2/applications', mkApp('Mohan V', T2PHONE));
    expect(dup.status).toBe(409); // a request for this number already exists
    const bad = await call(jar.BRK2, 'POST', '/api/network/tier2/applications', mkApp('Short', rnd(), { reference: 'ok' }));
    expect(bad.status).toBe(400);
    const noConsent = await call(jar.BRK2, 'POST', '/api/network/tier2/applications', mkApp('No Consent', rnd(), { consent: false }));
    expect(noConsent.status).toBe(400);
    const inv = await j(await call(jar.BRK2, 'GET', `/api/network/tier2/applications/${id}/invitation`));
    expect(inv.invitation.code).toMatch(/^GZ-BRK-/);
    expect((await call(jar.BRK1, 'GET', `/api/network/tier2/applications/${id}/invitation`)).status).toBe(404); // only the sponsor gets the code
    // the invitation is bound to the phone
    expect((await reg(inv.invitation.code, rnd())).status).toBe(400);
    // PAN and Aadhaar are mandatory for a broker, with consent; the Aadhaar must pass its checksum
    const noAad = await reg(inv.invitation.code, T2PHONE, { aadhaarNumber: undefined }); expect(noAad.status).toBe(400); expect((await noAad.json()).code).toBe('AADHAAR_REQUIRED');
    expect((await reg(inv.invitation.code, T2PHONE, { aadhaarNumber: '234567890123' })).status).toBe(400); // wrong check digit
    const noPan = await reg(inv.invitation.code, T2PHONE, { panNumber: undefined }); expect(noPan.status).toBe(400); expect((await noPan.json()).code).toBe('PAN_REQUIRED');
    const noIdc = await reg(inv.invitation.code, T2PHONE, { idConsent: false }); expect(noIdc.status).toBe(400); expect((await noIdc.json()).code).toBe('ID_CONSENT_REQUIRED');
    const AAD = mkAadhaar();
    const ok = await reg(inv.invitation.code, T2PHONE, { aadhaarNumber: AAD.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3') }); // spaces are fine
    expect(ok.status).toBe(200); const raw = await ok.text(); const body = JSON.parse(raw); T2ID = body.user.id; T2COOKIE = ok.headers.get('set-cookie')!.split(';')[0];
    expect(body.user.sponsorId).toBe('USR-BRK-002'); expect(body.user.aadhaarLast4).toBe(AAD.slice(-4)); expect(raw).not.toContain(AAD); // the full number is never stored or returned
    // a local associate cannot be approved until a GENZ admin has seen the cards
    const early = await call(jar.ADMIN, 'POST', `/api/verifications/${T2ID}/review`, { action: 'APPROVE', notes: 'x' }); expect(early.status).toBe(400); expect((await early.json()).code).toBe('ID_CHECK_PENDING');
    expect((await call(jar.BRK1, 'POST', `/api/network/id-check/${T2ID}`, { checked: true })).status).toBe(403); // a broker cannot tick it
    expect((await call(jar.ADMIN, 'POST', `/api/network/id-check/${T2ID}`, { checked: true, note: 'PAN card + masked Aadhaar on video call' })).status).toBe(200);
    expect((await call(jar.ADMIN, 'POST', `/api/verifications/${T2ID}/review`, { action: 'APPROVE', notes: 'Local reference checked' })).status).toBe(200);
  });
  it('Tier 2: labelled, on probation, cannot vouch yet, locked out of builder projects and unit holds', async () => {
    T2COOKIE = await (async () => { const a = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${T2PHONE.slice(-10)}@phone.genz.local`, password: 'Strong#Pass2026' }) }); expect(a.status).toBe(200); return a.headers.get('set-cookie')!.split(';')[0]; })();
    const me = await j(await call(T2COOKIE, 'GET', '/api/network/me'));
    expect(me.tier).toBe('TIER2'); expect(me.tierLabel.en).toMatch(/Local Associate/); expect(me.probationUntil).toBeTruthy(); expect(me.canVouch).toBe(false); expect(me.canSponsor).toBe(false);
    expect(me.vouchBlock).toMatch(/RERA-registered/); expect(me.sponsor.name).toBeTruthy(); expect(me.idStatus.hasAadhaar).toBe(true); expect(me.idStatus.checked).toBe(true);
    const gate = await call(T2COOKIE, 'GET', '/api/pcontrol/partner/projects'); expect(gate.status).toBe(403); expect((await gate.json()).code).toBe('TIER2_NOT_ALLOWED');
    expect((await call(T2COOKIE, 'POST', '/api/network/tier2/applications', mkApp('Another', rnd()))).status).toBe(403);
    const tu = await call(T2COOKIE, 'POST', '/api/tieups', { toId: 'USR-BRK-001', introSharePct: 50, scopeKinds: ['NEW_PROJECT'] }); expect(tu.status).toBe(400); expect((await tu.json()).code).toBe('TIER2_SCOPE');
    const vouchedBy = (await j(await call(jar.ADMIN, 'GET', '/api/network/admin/overview'))).pendingTier2; expect(Array.isArray(vouchedBy)).toBe(true);
  });
  it('Tier 1 brokers are unaffected by the gate', async () => {
    expect((await call(jar.BRK1, 'GET', '/api/pcontrol/partner/projects')).status).toBe(200);
    const me = await j(await call(jar.BRK1, 'GET', '/api/network/me')); expect(me.tier).toBe('TIER1'); expect(me.canVouch).toBe(true);
  });
});

describe('City Captain alone is enough; monthly vouch limit; strikes', () => {
  it('captain vouch issues the invitation at once and is audited', async () => {
    const ch = await j(await call(jar.ADMIN, 'POST', '/api/community/chapters', { name: 'Raipur Chapter', city: 'Raipur', zone: 'Pandri', captainId: 'USR-BRK-001' }));
    expect(ch.success).toBe(true);
    const me = await j(await call(jar.BRK1, 'GET', '/api/network/me')); expect(me.isCaptain).toBe(true); expect(me.vouchLimit).toBe(10);
    const p = await j(await call(jar.BRK1, 'POST', '/api/network/tier2/applications', mkApp('Captain Pick')));
    expect(p.success).toBe(true); expect(p.invitation.code).toMatch(/^GZ-BRK-/); expect(p.application.vouches[0].as).toBe('CAPTAIN');
    const cap = await j(await call(jar.BRK1, 'GET', '/api/network/captain')); expect(cap.isCaptain).toBe(true); expect(cap.members.total).toBeGreaterThan(0);
    expect((await call(jar.BRK2, 'GET', '/api/network/captain')).status).toBe(200); expect((await j(await call(jar.BRK2, 'GET', '/api/network/captain'))).isCaptain).toBe(false);
  });
  it('a member can vouch only a few times a month', async () => {
    // BRK-002 already used one proposal; the 2nd is fine, the 3rd is refused
    expect((await call(jar.BRK2, 'POST', '/api/network/tier2/applications', mkApp('Second Pick'))).status).toBe(200);
    const third = await call(jar.BRK2, 'POST', '/api/network/tier2/applications', mkApp('Third Pick')); expect(third.status).toBe(403); expect((await third.json()).code).toBe('VOUCH_BLOCKED');
  });
  it('suspending someone you vouched for costs the vouchers a strike; 2 strikes pause vouching', async () => {
    expect((await call(jar.ADMIN, 'POST', `/api/verifications/${T2ID}/review`, { action: 'SUSPEND', notes: 'Fake listings' })).status).toBe(200);
    const m1 = await j(await call(jar.BRK1, 'GET', '/api/network/me')); const m2 = await j(await call(jar.BRK2, 'GET', '/api/network/me'));
    expect(m1.strikes).toBe(0); expect(m2.strikes).toBe(1); // only the sponsor (BRK2) registered him
    const ov = await j(await call(jar.ADMIN, 'GET', '/api/network/admin/overview'));
    expect(ov.flagged.length).toBeGreaterThanOrEqual(1); expect(ov.cities.find((c: any) => c.city)).toBeTruthy(); expect(ov.pipeline.joined).toBeGreaterThanOrEqual(1);
    expect((await call(jar.BRK1, 'GET', '/api/network/admin/overview')).status).toBe(403);
  });
  it('admin can set tier (RERA required for Tier 1)', async () => {
    expect((await call(jar.ADMIN, 'POST', `/api/network/tier/${T2ID}`, { tier: 'TIER1' })).status).toBe(400);
    expect((await call(jar.ADMIN, 'POST', `/api/network/tier/${T2ID}`, { tier: 'TIER1', reraNumber: 'PCGRERA250518-0042' })).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/network/tier/${T2ID}`, { tier: 'TIER2' })).status).toBe(403);
  });
});

let TU: any; let PA: any;
describe('tie-ups: recorded terms, two-side accept, split pre-filled in the deal room', () => {
  it('propose validates; only the recipient accepts; duplicates blocked', async () => {
    expect((await call(jar.BRK1, 'POST', '/api/tieups', { toId: 'USR-BRK-002', introSharePct: 5 })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', '/api/tieups', { toId: 'USR-BRK-001', introSharePct: 50 })).status).toBe(400); // self
    expect((await call(jar.OWN, 'POST', '/api/tieups', { toId: 'USR-BRK-002', introSharePct: 50 })).status).toBe(403);
    const p = await j(await call(jar.BRK1, 'POST', '/api/tieups', { toId: 'USR-BRK-002', introSharePct: 60, scopeKinds: ['RESALE'], city: 'Raipur', validDays: 90, note: 'Buyer-side keeps 60' }));
    expect(p.success).toBe(true); TU = p.tieup; expect(TU.status).toBe('PROPOSED'); expect(TU.other.name).toBeTruthy(); expect(JSON.stringify(TU)).not.toMatch(/phone/i);
    expect((await call(jar.BRK1, 'POST', `/api/tieups/${TU.id}/accept`, {})).status).toBe(403);
    expect((await call(jar.BRK1, 'POST', '/api/tieups', { toId: 'USR-BRK-002', introSharePct: 40 })).status).toBe(409);
    expect((await call(jar.OWN, 'POST', `/api/tieups/${TU.id}/accept`, {})).status).toBe(403);
    const a = await j(await call(jar.BRK2, 'POST', `/api/tieups/${TU.id}/accept`, {})); expect(a.tieup.status).toBe('ACTIVE'); expect(a.tieup.agreementHash).toMatch(/^[0-9a-f]{64}$/); expect(a.tieup.validUntil).toBeTruthy();
    expect((await call(jar.BRK2, 'POST', `/api/tieups/${TU.id}/accept`, {})).status).toBe(409);
  });
  it('directory hides contact data and shows tier + tie-up status', async () => {
    const d = await j(await call(jar.BRK1, 'GET', '/api/tieups/directory?q=')); expect(d.brokers.length).toBeGreaterThan(0);
    expect(JSON.stringify(d)).not.toMatch(/9\d{9}|@/); expect(d.brokers.find((b: any) => b.id === 'USR-BRK-002')?.tieup).toBe('ACTIVE');
    const mine = await j(await call(jar.BRK2, 'GET', '/api/tieups')); expect(mine.tieups[0].direction).toBe('IN');
  });
  it('an accepted offer opens the deal room with the tie-up split (buyer-side 60 / listing-side 40)', async () => {
    const all = (await j(await call(jar.ADMIN, 'GET', '/api/properties'))).properties as any[];
    PA = all.find(p => p.listingBrokerId === 'USR-BRK-001' && p.ownerId === 'USR-OWNER-001' && p.transactionType === 'Sale' && p.listingStatus === 'active' && p.verificationStatus === 'VERIFIED');
    const o = await j(await call(jar.BRK2, 'POST', '/api/offers', { propertyId: PA.id, buyerName: 'Split Buyer', buyerPhone: rnd(), consent: true, amount: Math.round(PA.askingPrice * 0.9), tokenProposed: 100000 }));
    expect(o.success).toBe(true);
    const acc = await j(await call(jar.OWN, 'POST', `/api/offers/${o.offer.id}/decide`, { action: 'ACCEPT' }));
    expect(acc.result).toBe('ACCEPTED'); const dealId = acc.offer.dealRoomId;
    const deal = (await j(await call(jar.BRK1, 'GET', `/api/deals/${dealId}`))).deal ?? (await j(await call(jar.BRK1, 'GET', `/api/deals/${dealId}`)));
    expect(deal.introducingBrokerSharePct).toBe(60); expect(deal.closingBrokerSharePct).toBe(40); expect(deal.tieupId).toBe(TU.id);
  });
  it('either side can end an active tie-up with a reason; the other cannot re-end', async () => {
    expect((await call(jar.BRK2, 'POST', `/api/tieups/${TU.id}/end`, { reason: '' })).status).toBe(400);
    expect((await call(jar.BRK2, 'POST', `/api/tieups/${TU.id}/end`, { reason: 'Changing terms' })).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/tieups/${TU.id}/end`, { reason: 'again' })).status).toBe(409);
  });
});

describe('builder channel + GENZ desk (coordination only)', () => {
  let PID = ''; let DK = '';
  it('builder sees channel modes; desk must be switched on first', async () => {
    const bld = await login('USR-BUILDER-001');
    const ch = await j(await call(bld, 'GET', '/api/network/channel/projects')); expect(ch.projects.length).toBeGreaterThan(0); PID = ch.projects[0].id; expect(ch.rule).toMatch(/RERA/);
    expect((await call(bld, 'POST', '/api/network/desk', { projectId: PID, kind: 'PAPERWORK', note: 'Need agreement paperwork support' })).status).toBe(409);
    expect((await call(bld, 'PUT', `/api/pcontrol/builder/projects/${PID}/settings`, { desk: true })).status).toBe(200);
    const d = await j(await call(bld, 'POST', '/api/network/desk', { projectId: PID, kind: 'PAPERWORK', note: 'Need agreement paperwork support' })); expect(d.success).toBe(true); DK = d.request.id;
    expect((await call(jar.BRK1, 'POST', '/api/network/desk', { projectId: PID, kind: 'OTHER', note: 'trying as broker' })).status).toBe(403);
    expect((await call(jar.BRK1, 'POST', `/api/network/desk/${DK}/status`, { status: 'DONE' })).status).toBe(403);
    expect((await call(jar.ADMIN, 'POST', `/api/network/desk/${DK}/status`, { status: 'DONE', response: 'Handled by desk' })).status).toBe(200);
    const q = await j(await call(jar.ADMIN, 'GET', '/api/network/desk')); expect(q.requests.find((r: any) => r.id === DK).status).toBe('DONE'); expect(q.scope).toMatch(/never sells/);
  });
});

describe('trust profile + invite tree', () => {
  it('profile card has stats and tier label, no phone / email', async () => {
    const p = await j(await call(jar.BRK2, 'GET', '/api/network/profile/USR-BRK-001'));
    expect(p.profile.tierLabel.en).toBe('RERA no. on file'); expect(p.profile.stats).toBeTruthy(); expect(JSON.stringify(p)).not.toMatch(/phone|email|@/i);
    expect((await call(jar.OWN, 'GET', '/api/network/profile/USR-BRK-001')).status).toBe(403);
    expect((await call(jar.BRK2, 'GET', '/api/network/profile/USR-OWNER-001')).status).toBe(404);
  });
  it('invite tree lists the people a member brought in', async () => {
    const t = await j(await call(jar.BRK2, 'GET', '/api/network/tree')); expect(t.success).toBe(true); expect(t.nodes.some((n: any) => n.id === T2ID)).toBe(true);
    const un = await call(undefined, 'GET', '/api/network/tree'); expect(un.status).toBe(401);
  });
});
