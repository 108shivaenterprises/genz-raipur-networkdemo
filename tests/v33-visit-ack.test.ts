/**
 * v33 — “no direct deal” acknowledgement: the buyer ticks a promise and confirms his own mobile before his visit QR / code works.
 * Both flows: broker-to-broker site visit (VISIT) and builder-project pass (PASS). Older visits without an acknowledgement keep working.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { ackBuyer } from './helpers/ack.js';

const ROOT = path.resolve(__dirname, '..');
const PORT = 6700 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const slot = (h = 1) => new Date(Date.now() + h * 3600_000).toISOString();
const form = (url: string, body: Record<string, string>) => fetch(B + url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
let PA: any; let PROJ = ''; let M1 = '';

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v33-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', OWN: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1', BLD: 'USR-BUILDER-001', BLD2: 'USR-BUILDER-002' })) jar[k] = await login(id);
  const all = (await j(await call(jar.ADMIN, 'GET', '/api/properties'))).properties as any[];
  PA = all.find(p => p.listingBrokerId === 'USR-BRK-001' && p.ownerId === 'USR-OWNER-001' && p.transactionType === 'Sale' && p.listingStatus === 'active' && p.verificationStatus === 'VERIFIED');
  expect(PA).toBeTruthy();
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('broker-to-broker site visit', () => {
  const phone = rnd(); let id = ''; let sec: any; let ack: any;
  it('scheduling makes a pending acknowledgement; the visit cannot be verified yet (OTP and QR)', async () => {
    const v = await j(await call(jar.BRK2, 'POST', '/api/site-visits', { propertyId: PA.id, customerName: 'Mohan Buyer', customerPhone: phone, scheduledTime: slot(1) }));
    id = v.siteVisit.id; expect(v.siteVisit.ackStatus).toBe('PENDING');
    sec = (await j(await call(jar.OWN, 'GET', `/api/site-visits?propertyId=${PA.id}`))).siteVisits.find((x: any) => x.id === id);
    const a = await call(jar.BRK1, 'POST', `/api/site-visits/${id}/verify-otp`, { otpCode: sec.otpCode });
    expect(a.status).toBe(409); expect((await j(a)).code).toBe('ACK_REQUIRED');
    const q = await call(jar.BRK1, 'POST', `/api/site-visits/${id}/checkin-qr`, { qrToken: sec.qrToken });
    expect(q.status).toBe(409); expect((await j(q)).code).toBe('ACK_REQUIRED');
  });
  it('only the scheduling broker sees the link / the code the buyer asks for; strangers get nothing', async () => {
    ack = (await j(await call(jar.BRK2, 'GET', `/api/visit-acks/VISIT/${id}`))).ack;
    expect(ack.status).toBe('PENDING'); expect(ack.page).toMatch(/^\/a\/[a-f0-9]{10}-[a-f0-9]{24}$/); expect(ack.link).toBe(ack.page); expect(ack.phoneLast4).toBe(phone.slice(-4));
    expect((await j(await call(jar.BRK1, 'GET', `/api/visit-acks/VISIT/${id}`))).ack).toBeNull();
    expect((await j(await call(jar.OWN, 'GET', `/api/visit-acks/VISIT/${id}`))).ack).toBeNull();
    expect((await call(undefined, 'GET', `/api/visit-acks/VISIT/${id}`)).status).toBe(401);
  });
  it('the buyer page: promise + tick + mobile; no QR before he is done; bad links are 404', async () => {
    const r = await fetch(B + ack.page); const t = await r.text();
    expect(r.status).toBe(200); expect(r.headers.get('cache-control')).toMatch(/no-store/); expect(r.headers.get('x-robots-tag')).toMatch(/noindex/);
    expect(t).toContain('name="agree"'); expect(t).toContain('Mohan'); expect(t).not.toContain('<svg'); expect(t).not.toContain(sec.otpCode); expect(t).not.toContain(phone);
    expect((await fetch(B + '/a/0000000000-000000000000000000000000')).status).toBe(404);
    expect((await fetch(B + ack.page.slice(0, -3) + 'abc')).status).toBe(404);
  });
  it('no tick → no code; a different mobile → no code; the right mobile → a code the broker reads out', async () => {
    const noTick = await (await form(ack.page + '/otp', { phone })).text(); expect(noTick).toContain('I agree');
    expect((await j(await call(jar.BRK2, 'GET', `/api/visit-acks/VISIT/${id}`))).ack.codeForBuyer).toBeUndefined();
    const wrong = await (await form(ack.page + '/otp', { agree: '1', phone: '9000000000' })).text(); expect(wrong).toContain('मेल नहीं खाता');
    expect((await j(await call(jar.BRK2, 'GET', `/api/visit-acks/VISIT/${id}`))).ack.codeForBuyer).toBeUndefined();
    const ok = await (await form(ack.page + '/otp', { agree: '1', phone })).text(); expect(ok).toContain('name="code"');
    const code = (await j(await call(jar.BRK2, 'GET', `/api/visit-acks/VISIT/${id}`))).ack.codeForBuyer; expect(code).toMatch(/^\d{6}$/);
    const bad = await (await form(ack.page + '/verify', { code: code === '111111' ? '222222' : '111111' })).text(); expect(bad).toContain('सही नहीं');
    expect((await j(await call(jar.BRK2, 'GET', `/api/visit-acks/VISIT/${id}`))).ack.status).toBe('PENDING');
    const good = await form(ack.page + '/verify', { code }); expect(good.status).toBe(303);
    const a2 = (await j(await call(jar.BRK2, 'GET', `/api/visit-acks/VISIT/${id}`))).ack; expect(a2.status).toBe('ACKED'); expect(a2.codeForBuyer).toBeUndefined(); expect(a2.ackedAt).toBeTruthy();
  });
  it('after the acknowledgement the buyer sees his QR + code, and the visit can be verified', async () => {
    const t = await (await fetch(B + ack.page)).text(); expect(t).toContain('<svg'); expect(t).toContain(sec.otpCode);
    expect((await j(await call(jar.OWN, 'GET', `/api/site-visits?propertyId=${PA.id}`))).siteVisits.find((x: any) => x.id === id).ackStatus).toBe('ACKED');
    expect((await call(jar.BRK1, 'POST', `/api/site-visits/${id}/verify-otp`, { otpCode: sec.otpCode })).status).toBe(200);
  });
  it('the agreement is in the audit trail (wording version, no full mobile); a visit with no mobile has no acknowledgement and still works', async () => {
    const audit = JSON.stringify(await j(await call(jar.ADMIN, 'GET', '/api/audit-logs')));
    expect(audit).toContain('VISIT_ACK_DONE'); expect(audit).toContain('wording v1'); expect(audit).not.toContain(phone);
    const v = await j(await call(jar.BRK2, 'POST', '/api/site-visits', { propertyId: PA.id, customerName: 'Walk In', scheduledTime: slot(1) }));
    expect(v.siteVisit.ackStatus).toBe('NONE');
    const s2 = (await j(await call(jar.OWN, 'GET', `/api/site-visits?propertyId=${PA.id}`))).siteVisits.find((x: any) => x.id === v.siteVisit.id);
    expect((await call(jar.BRK1, 'POST', `/api/site-visits/${v.siteVisit.id}/verify-otp`, { otpCode: s2.otpCode })).status).toBe(200);
  });
  it('wrong codes lock the code (5 tries) and asking again is rate limited', async () => {
    const p2 = rnd();
    const v = await j(await call(jar.BRK2, 'POST', '/api/site-visits', { propertyId: PA.id, customerName: 'Lock Test', customerPhone: p2, scheduledTime: slot(2) }));
    const a = (await j(await call(jar.BRK2, 'GET', `/api/visit-acks/VISIT/${v.siteVisit.id}`))).ack;
    await form(a.page + '/otp', { agree: '1', phone: p2 });
    let last = ''; for (let i = 0; i < 6; i++) last = await (await form(a.page + '/verify', { code: '000000' })).text();
    expect(last).toContain('बहुत बार ग़लत कोड');
    for (let i = 0; i < 9; i++) await form(a.page + '/otp', { agree: '1', phone: '9111111111' });
    expect((await form(a.page + '/otp', { agree: '1', phone: '9111111111' })).status).toBe(429);
  });
});

describe('builder-project visit pass', () => {
  const phone = rnd(); let LEAD = ''; let pass: any;
  it('setup: partner approved on a project, one lead', async () => {
    const p = await j(await call(jar.BLD, 'POST', '/api/builder/projects', { projectName: 'Ack Test Heights', locality: 'Shankar Nagar', reraNumber: 'CGRERAP888888', priceStartingFrom: 4500000, priceMax: 9000000, totalUnits: 40, channelPartnerCommissionPct: 2, unitConfigurations: ['2 BHK'] }));
    PROJ = p.project?.id || p.projectId || p.id; expect(PROJ).toBeTruthy();
    await call(jar.BRK1, 'POST', `/api/pcontrol/partner/projects/${PROJ}/apply`, {});
    const d = await j(await call(jar.BLD, 'GET', `/api/pcontrol/builder/projects/${PROJ}`));
    M1 = d.partners.find((m: any) => m.brokerId === 'USR-BRK-001').id;
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${M1}/decide`, { action: 'APPROVE', commissionPct: 2 })).status).toBe(200);
    LEAD = (await j(await call(jar.BRK1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Ramesh Sahu', phone }))).lead.id;
  });
  it('the pass link shows the acknowledgement, not the QR; the builder cannot confirm until the buyer has agreed', async () => {
    pass = (await j(await call(jar.BRK1, 'POST', '/api/visits/passes', { leadId: LEAD, scheduledAt: slot(), partySize: 2 }))).pass;
    expect(pass.ackStatus).toBe('PENDING');
    const t = await (await fetch(`${B}/v/${pass.code}`)).text(); expect(t).toContain('name="agree"'); expect(t).not.toContain('<svg');
    const s = await j(await call(jar.BLD, 'GET', `/api/visits/scan/${pass.code}`)); expect(s.canConfirm).toBe(false); expect(s.warnings.join()).toMatch(/not yet confirmed/);
    const c = await call(jar.BLD, 'POST', `/api/visits/scan/${pass.code}/confirm`, { idChecked: true }); expect(c.status).toBe(409); expect((await j(c)).code).toBe('ACK_REQUIRED');
  });
  it('the buyer agrees on the pass page → his pass shows → the builder can confirm', async () => {
    const info = (await j(await call(jar.BRK1, 'GET', `/api/visit-acks/PASS/${pass.id}`))).ack; expect(info.link).toBe(`/v/${pass.code}`);
    expect(await ackBuyer(B, call, jar.BRK1, 'PASS', pass.id, phone)).toBe(303);
    const r = await fetch(B + info.page, { redirect: 'manual' }); expect(r.status).toBe(303); expect(r.headers.get('location')).toBe(`/v/${pass.code}`);
    expect(await (await fetch(`${B}/v/${pass.code}`)).text()).toContain('<svg');
    const s = await j(await call(jar.BLD, 'GET', `/api/visits/scan/${pass.code}`)); expect(s.canConfirm).toBe(true);
    expect((await call(jar.BLD, 'POST', `/api/visits/scan/${pass.code}/confirm`, { idChecked: true })).status).toBe(200);
  });
  it('a re-issued pass for a buyer who already agreed does not ask him again', async () => {
    const l2 = (await j(await call(jar.BRK1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Repeat Buyer', phone: rnd() }))).lead;
    const p1 = (await j(await call(jar.BRK1, 'POST', '/api/visits/passes', { leadId: l2.id, scheduledAt: slot() }))).pass;
    expect(await ackBuyer(B, call, jar.BRK1, 'PASS', p1.id, l2.phone || (await j(await call(jar.BRK1, 'GET', `/api/crm/leads/${l2.id}`))).lead.phone)).toBe(303);
    const p2 = (await j(await call(jar.BRK1, 'POST', '/api/visits/passes', { leadId: l2.id, scheduledAt: slot(3) }))).pass;
    expect(p2.ackStatus).toBe('ACKED'); expect(await (await fetch(`${B}/v/${p2.code}`)).text()).toContain('<svg');
  });
});

describe('v34 — where the QR is scanned, and a clear message when a scanned QR is not yours', () => {
  it('a builder pass carries its scan point (default: office); a bad point is refused; the buyer page shows it', async () => {
    const phone = rnd();
    const lead = (await j(await call(jar.BRK1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Scan Point Buyer', phone }))).lead;
    expect((await call(jar.BRK1, 'POST', '/api/visits/passes', { leadId: lead.id, scheduledAt: slot(), scanAt: 'ROOF' })).status).toBe(400);
    const p1 = (await j(await call(jar.BRK1, 'POST', '/api/visits/passes', { leadId: lead.id, scheduledAt: slot() }))).pass;
    expect(p1.scanAt).toBe('OFFICE'); expect(p1.scan.where.en).toBe('Project / sales office');
    const p2 = (await j(await call(jar.BRK1, 'POST', '/api/visits/passes', { leadId: lead.id, scheduledAt: slot(2), scanAt: 'GATE' }))).pass;
    expect(p2.scanAt).toBe('GATE');
    expect(await ackBuyer(B, call, jar.BRK1, 'PASS', p2.id, phone)).toBe(303);
    const t = await (await fetch(`${B}/v/${p2.code}`)).text(); expect(t).toContain('Scan at'); expect(t).toContain('Site gate');
  });
  it('another builder scanning it hears "a GENZ pass, but not for your project"; a junk code hears "not a valid GENZ pass"; neither says whose it is', async () => {
    const lead = (await j(await call(jar.BRK1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Foreign Scan', phone: rnd() }))).lead;
    const p = (await j(await call(jar.BRK1, 'POST', '/api/visits/passes', { leadId: lead.id, scheduledAt: slot() }))).pass;
    const f = await call(jar.BLD2, 'GET', `/api/visits/scan/${p.code}`); const fj = await j(f);
    expect(f.status).toBe(404); expect(fj.code).toBe('NOT_YOUR_PASS'); expect(fj.error).toMatch(/NOT for your project/); expect(JSON.stringify(fj)).not.toContain('Ack Test Heights'); expect(JSON.stringify(fj)).not.toContain('Foreign');
    const u = await j(await call(jar.BLD2, 'GET', '/api/visits/scan/ZZZZZZZZZ2')); expect(u.error).toMatch(/not a valid GENZ visit pass/); expect(u.code).toBeUndefined();
    const c = await call(jar.BLD2, 'POST', `/api/visits/scan/${p.code}/confirm`, { idChecked: true }); expect(c.status).toBe(404);
  });
  it('a site visit carries its scan point (default: at the property) and the buyer sees it after confirming', async () => {
    const phone = rnd();
    expect((await call(jar.BRK2, 'POST', '/api/site-visits', { propertyId: PA.id, customerName: 'X', customerPhone: phone, scheduledTime: slot(1), scanAt: 'ROOF' })).status).toBe(400);
    const v = await j(await call(jar.BRK2, 'POST', '/api/site-visits', { propertyId: PA.id, customerName: 'Meet Buyer', customerPhone: phone, scheduledTime: slot(1), scanAt: 'MEET' }));
    expect(v.siteVisit.scanAt).toBe('MEET');
    const d = await j(await call(jar.BRK2, 'POST', '/api/site-visits', { propertyId: PA.id, customerName: 'Default Buyer', scheduledTime: slot(1) })); expect(d.siteVisit.scanAt).toBe('PROPERTY');
    expect(await ackBuyer(B, call, jar.BRK2, 'VISIT', v.siteVisit.id, phone)).toBe(303);
    const a = (await j(await call(jar.BRK2, 'GET', `/api/visit-acks/VISIT/${v.siteVisit.id}`))).ack;
    const t = await (await fetch(B + a.page)).text(); expect(t).toContain('Where it is scanned'); expect(t).toContain('meeting point');
  });
});
