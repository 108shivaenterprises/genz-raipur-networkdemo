import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ackBuyer } from './helpers/ack';
import { makeCode, normalizeCode, passWindow, checkSlot, passTiming, needsVisitProof } from '../src/shared/visitRules';

/** v13: visit QR passes — who creates, who scans. */
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
let PROJ = ''; let M1 = ''; let M2 = '';
const slot = (h = 1) => new Date(Date.now() + h * 3600_000).toISOString();

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v13-'));
  mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BLD: 'USR-BUILDER-001', BLD2: 'USR-BUILDER-002', BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', ADMIN: 'USR-ADMIN-1', TEAM1: 'USR-TEAM-001', TEAM2: 'USR-TEAM-002', BTEAM: 'USR-TEAM-005' })) jar[k] = await login(id);
  const bk3 = cfg.demoAccounts.find((a: any) => a.role === 'BROKER' && !['USR-BRK-001', 'USR-BRK-002'].includes(a.id) && a.verificationStatus === 'VERIFIED');
  if (bk3) { const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: bk3.email, password: cfg.demoPassword }) }); if (r.status === 200) jar.BRK3 = r.headers.get('set-cookie')!.split(';')[0]; }
  const p = await j(await call(jar.BLD, 'POST', '/api/builder/projects', { projectName: 'Control Test Heights', locality: 'Shankar Nagar', reraNumber: 'CGRERAP999999', priceStartingFrom: 4500000, priceMax: 9000000, totalUnits: 40, channelPartnerCommissionPct: 2, unitConfigurations: ['2 BHK'] }));
  PROJ = p.project?.id || p.projectId || p.id; expect(PROJ).toBeTruthy();
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });


describe('pure rules', () => {
  it('codes: alphabet, normalise link/payload/spaces, reject junk', () => {
    const c = makeCode(n => Math.floor(Math.random() * n));
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    expect(normalizeCode(`GENZV:${c}`)).toBe(c);
    expect(normalizeCode(`https://x.in/v/${c}`)).toBe(c);
    expect(normalizeCode(c.toLowerCase().slice(0, 5) + ' - ' + c.slice(5).toLowerCase())).toBe(c);
    expect(normalizeCode('O0O0O0O0O0')).toBe(''); expect(normalizeCode('short')).toBe('');
  });
  it('window, slot checks and project rule', () => {
    const w = passWindow('2026-01-01T10:00:00.000Z');
    expect(w.validFrom).toBe('2026-01-01T08:00:00.000Z'); expect(w.validUntil).toBe('2026-01-01T20:00:00.000Z');
    expect(checkSlot('nope')).toMatch(/valid/); expect(checkSlot(new Date(Date.now() - 5 * 3600_000).toISOString())).toMatch(/past/);
    expect(checkSlot(new Date(Date.now() + 40 * 86400_000).toISOString())).toMatch(/ahead/); expect(checkSlot(slot())).toBe('');
    expect(passTiming({ validFrom: slot(1), validUntil: slot(5) })).toBe('NOT_YET');
    expect(passTiming({ validFrom: slot(-5), validUntil: slot(-1) })).toBe('EXPIRED');
    const old = new Date(Date.now() - 86400_000).toISOString(); const nw = new Date().toISOString();
    expect(needsVisitProof({ visitProof: 'QR_REQUIRED', visitProofSince: nw }, { createdAt: old })).toBe(false); // grandfathered
    expect(needsVisitProof({ visitProof: 'QR_REQUIRED', visitProofSince: old }, { createdAt: nw })).toBe(true);
    expect(needsVisitProof({ visitProof: 'QR_REQUIRED', visitProofSince: old }, { createdAt: nw, visitProof: {} })).toBe(false);
    expect(needsVisitProof({ visitProof: 'OFF' }, { createdAt: nw })).toBe(false);
  });
});

describe('visit pass flow', () => {
  let LEAD = ''; let DESK = ''; let pass: any; let phone = '';
  it('setup: partner approved on project, registers a lead; builder registers a desk lead', async () => {
    await call(jar.BRK1, 'POST', `/api/pcontrol/partner/projects/${PROJ}/apply`, {});
    const d = await j(await call(jar.BLD, 'GET', `/api/pcontrol/builder/projects/${PROJ}`));
    M1 = d.partners.find((m: any) => m.brokerId === 'USR-BRK-001').id;
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${M1}/decide`, { action: 'APPROVE', commissionPct: 2 })).status).toBe(200);
    phone = rnd();
    const l = await j(await call(jar.BRK1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Ramesh Sahu', phone }));
    LEAD = l.lead.id; expect(LEAD).toBeTruthy();
    const dl = await j(await call(jar.BLD, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Desk Walkin', phone: rnd() }));
    DESK = dl.lead.id; expect(DESK).toBeTruthy();
  });
  it('who may CREATE: own partner yes; builder no (for partner lead); other partner, admin, strangers no', async () => {
    expect((await call(jar.BRK2, 'POST', '/api/visits/passes', { leadId: LEAD, scheduledAt: slot() })).status).toBe(404);
    const b = await call(jar.BLD, 'POST', '/api/visits/passes', { leadId: LEAD, scheduledAt: slot() });
    expect(b.status).toBe(403); expect((await j(b)).error).toMatch(/only the partner/);
    expect((await call(jar.ADMIN, 'POST', '/api/visits/passes', { leadId: LEAD, scheduledAt: slot() })).status).toBe(403);
    expect((await call(undefined, 'POST', '/api/visits/passes', { leadId: LEAD, scheduledAt: slot() })).status).toBe(401);
    expect((await call(jar.BRK1, 'POST', '/api/visits/passes', { leadId: LEAD, scheduledAt: 'x' })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', '/api/visits/passes', { leadId: LEAD, scheduledAt: slot(24 * 40) })).status).toBe(400);
    const ok = await call(jar.BRK1, 'POST', '/api/visits/passes', { leadId: LEAD, scheduledAt: slot(), partySize: 3 });
    expect(ok.status).toBe(200); pass = (await j(ok)).pass; expect(pass.code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/); expect(pass.payload).toBe('GENZV:' + pass.code);
    const lead = (await j(await call(jar.BRK1, 'GET', `/api/crm/leads/${LEAD}`))).lead; expect(lead.stage).toBe('SITE_VISIT_SCHEDULED');
  });
  it('builder CAN create for its own desk lead; reissue supersedes the old pass', async () => {
    expect((await call(jar.BLD, 'POST', '/api/visits/passes', { leadId: DESK, scheduledAt: slot() })).status).toBe(200);
    const second = await j(await call(jar.BRK1, 'POST', '/api/visits/passes', { leadId: LEAD, scheduledAt: slot(2), partySize: 2 }));
    const list = (await j(await call(jar.BRK1, 'GET', `/api/visits/passes?leadId=${LEAD}`))).passes;
    expect(list.find((p: any) => p.id === pass.id).status).toBe('SUPERSEDED');
    expect(list.find((p: any) => p.id === second.pass.id).status).toBe('ACTIVE');
    pass = second.pass;
  });
  it('partner staff: only for leads allotted to them', async () => {
    expect((await call(jar.TEAM1, 'POST', '/api/visits/passes', { leadId: LEAD, scheduledAt: slot() })).status).toBe(404);
  });
  it('public page: shows first name + last 4 only, QR svg, no-store, noindex', async () => {
    // v33: before the buyer confirms “no direct deal”, the page shows the acknowledgement, not the QR
    const gate = await (await fetch(`${B}/v/${pass.code}`)).text();
    expect(gate).not.toContain('<svg'); expect(gate).toContain('name="agree"');
    expect(await ackBuyer(B, call, jar.BRK1, 'PASS', pass.id, phone)).toBe(303);
    const r = await fetch(`${B}/v/${pass.code}`); const t = await r.text();
    expect(r.status).toBe(200); expect(r.headers.get('cache-control')).toMatch(/no-store/); expect(r.headers.get('x-robots-tag')).toMatch(/noindex/);
    expect(t).toContain('<svg'); expect(t).toContain('Ramesh'); expect(t).not.toContain('Sahu'); expect(t).toContain('••••' + phone.slice(-4)); expect(t).not.toContain(phone);
    expect((await fetch(`${B}/v/AAAAAAAAAA`)).status).toBe(404);
  });
  it('who may SCAN: builder yes; partner, partner staff, other builder, admin, anon no', async () => {
    for (const k of ['BRK1', 'ADMIN']) expect((await call(jar[k], 'GET', `/api/visits/scan/${pass.code}`)).status, k).toBe(403);
    expect((await call(jar.TEAM1, 'GET', `/api/visits/scan/${pass.code}`)).status).toBe(404); // partner staff: not valid for them
    expect((await call(undefined, 'GET', `/api/visits/scan/${pass.code}`)).status).toBe(401);
    expect((await call(jar.BLD2, 'GET', `/api/visits/scan/${pass.code}`)).status).toBe(404); // looks identical to an unknown code
    const ok = await j(await call(jar.BLD, 'GET', `/api/visits/scan/${pass.code}`));
    expect(ok.pass.customerName).toBe('Ramesh Sahu'); expect(ok.pass.phoneLast4).toBe(phone.slice(-4)); expect(ok.canConfirm).toBe(true); expect(ok.pass.referredBy).toBeTruthy();
    expect(JSON.stringify(ok)).not.toContain(phone);
    expect((await call(jar.BLD, 'GET', `/api/visits/scan/${pass.code.toLowerCase()}`)).status).toBe(200); // case-insensitive
  });
  it('builder staff scan only after the builder allows it (and builder-only grant)', async () => {
    expect((await call(jar.BTEAM, 'GET', `/api/visits/scan/${pass.code}`)).status).toBe(404);
    const me0 = await j(await call(jar.BTEAM, 'GET', '/api/visits/me')); expect(me0.canScan).toBe(false);
    // partner cannot grant scan rights to its own staff
    expect((await call(jar.BRK1, 'PUT', '/api/pcontrol/team/USR-TEAM-001/policy', { canScanVisits: true })).status).toBe(400);
    expect((await call(jar.BLD, 'PUT', '/api/pcontrol/team/USR-TEAM-005/policy', { canScanVisits: true })).status).toBe(200);
    expect((await j(await call(jar.BTEAM, 'GET', '/api/visits/me'))).canScan).toBe(true);
    expect((await call(jar.BTEAM, 'GET', `/api/visits/scan/${pass.code}`)).status).toBe(200);
    expect((await call(jar.BLD, 'PUT', '/api/pcontrol/team/USR-TEAM-005/policy', { onLeave: true })).status).toBe(200);
    expect((await call(jar.BTEAM, 'GET', `/api/visits/scan/${pass.code}`)).status).toBe(404); // on leave
    await call(jar.BLD, 'PUT', '/api/pcontrol/team/USR-TEAM-005/policy', { onLeave: false, canScanVisits: false });
  });
  it('confirm needs ID-check, works once, marks lead + awards points + audits', async () => {
    expect((await call(jar.BLD, 'POST', `/api/visits/scan/${pass.code}/confirm`, {})).status).toBe(400);
    expect((await call(jar.BLD, 'POST', `/api/visits/scan/${pass.code}/confirm`, { idChecked: false })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', `/api/visits/scan/${pass.code}/confirm`, { idChecked: true })).status).toBe(403);
    const ok = await call(jar.BLD, 'POST', `/api/visits/scan/${pass.code}/confirm`, { idChecked: true, partySize: 2 });
    expect(ok.status).toBe(200); expect((await j(ok)).stage).toBe('SITE_VISITED');
    const again = await call(jar.BLD, 'POST', `/api/visits/scan/${pass.code}/confirm`, { idChecked: true });
    expect(again.status).toBe(409); expect((await j(again)).error).toMatch(/already been used/);
    const lead = (await j(await call(jar.BRK1, 'GET', `/api/crm/leads/${LEAD}`))).lead;
    expect(lead.stage).toBe('SITE_VISITED'); expect(lead.visitProof.passId).toBe(pass.id);
    expect(await fetch(`${B}/v/${pass.code}`).then(r => r.text())).toContain('Visit verified');
    const audit = await j(await call(jar.ADMIN, 'GET', '/api/audit-logs'));
    expect(JSON.stringify(audit)).toContain('VISIT_PASS_SCANNED');
    const board = await j(await call(jar.BLD, 'GET', '/api/visits/board')); expect(board.done.some((p: any) => p.id === pass.id)).toBe(true);
    expect(board.done[0].code).toBeUndefined();
    const part = (await j(await call(jar.BLD, 'GET', `/api/pcontrol/builder/projects/${PROJ}`))).partners.find((m: any) => m.id === M1);
    expect(part.verifiedVisits).toBe(1);
  });
  it('cancelled / foreign / junk codes are refused; repeated junk locks the scanner', async () => {
    const l = await j(await call(jar.BRK1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Second Cust', phone: rnd() }));
    const p2 = (await j(await call(jar.BRK1, 'POST', '/api/visits/passes', { leadId: l.lead.id, scheduledAt: slot() }))).pass;
    expect((await call(jar.BLD, 'POST', `/api/visits/passes/${p2.id}/cancel`, {})).status).toBe(404); // builder cannot cancel partner's pass
    expect((await call(jar.BRK1, 'POST', `/api/visits/passes/${p2.id}/cancel`, {})).status).toBe(200);
    const s = await j(await call(jar.BLD, 'GET', `/api/visits/scan/${p2.code}`)); expect(s.canConfirm).toBe(false); expect(s.warnings.join()).toMatch(/cancelled/);
    expect((await call(jar.BLD, 'POST', `/api/visits/scan/${p2.code}/confirm`, { idChecked: true })).status).toBe(409);
    let last = 0; for (let i = 0; i < 12; i++) last = (await call(jar.BLD, 'GET', '/api/visits/scan/BADBADBAD2')).status;
    expect(last).toBe(429);
  });
});

describe('project rule QR_REQUIRED', () => {
  it('blocks manual SITE_VISITED / booking until a scanned pass; grandfathers older leads', async () => {
    const before = await j(await call(jar.BRK1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Old Lead', phone: rnd() }));
    expect((await call(jar.BRK2, 'PUT', `/api/pcontrol/builder/projects/${PROJ}/settings`, { visitProof: 'QR_REQUIRED' })).status).toBe(403);
    await new Promise(r => setTimeout(r, 20));
    expect((await call(jar.BLD, 'PUT', `/api/pcontrol/builder/projects/${PROJ}/settings`, { visitProof: 'QR_REQUIRED' })).status).toBe(200);
    await new Promise(r => setTimeout(r, 20));
    const nw = await j(await call(jar.BRK1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'New Lead', phone: rnd() }));
    const blocked = await call(jar.BRK1, 'POST', `/api/crm/leads/${nw.lead.id}/stage`, { stage: 'SITE_VISITED' });
    expect(blocked.status).toBe(409); expect((await j(blocked)).code).toBe('VISIT_QR_REQUIRED');
    expect((await call(jar.BRK1, 'POST', `/api/crm/leads/${before.lead.id}/stage`, { stage: 'SITE_VISITED' })).status).toBe(200);
    const p = (await j(await call(jar.BRK1, 'POST', '/api/visits/passes', { leadId: nw.lead.id, scheduledAt: slot() }))).pass;
    expect((await call(jar.BLD, 'POST', `/api/visits/scan/${p.code}/confirm`, { idChecked: true })).status).toBe(409);   // v33: the buyer has not confirmed yet
    expect(await ackBuyer(B, call, jar.BRK1, 'PASS', p.id, nw.lead.phone || (await j(await call(jar.BRK1, 'GET', `/api/crm/leads/${nw.lead.id}`))).lead.phone)).toBe(303);
    expect((await call(jar.BLD, 'POST', `/api/visits/scan/${p.code}/confirm`, { idChecked: true })).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/crm/leads/${nw.lead.id}/stage`, { stage: 'NEGOTIATION' })).status).toBe(200);
  });
  it('pass cannot be issued once the partnership is paused', async () => {
    const l = await j(await call(jar.BRK1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Paused Case', phone: rnd() }));
    await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${M1}/status`, { action: 'PAUSE', reason: 'Review' });
    expect((await call(jar.BRK1, 'POST', '/api/visits/passes', { leadId: l.lead.id, scheduledAt: slot() })).status).toBe(409);
    await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${M1}/status`, { action: 'RESUME' });
  });
});
