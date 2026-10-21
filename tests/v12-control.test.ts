import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pickAssignee, cleanPolicy, policyOf, partnerCard, staffCard, mandateIsActive, maskPhone, DEFAULT_POLICY } from '../src/shared/pcontrolRules';

/** v12: builder control room, project-wise partner view + shortlist, staff lead control. */
const PORT = 4700 + Math.floor(Math.random() * 90);
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

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v12-'));
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
  it('round-robin walks eligible staff, skips leave / cap / other projects', () => {
    const m = [{ id: 'a', openLeads: 0 }, { id: 'b', openLeads: 0, onLeave: true }, { id: 'c', openLeads: 5, maxOpenLeads: 5 }, { id: 'd', openLeads: 0, projectIds: ['X'] }, { id: 'e', openLeads: 0 }];
    const p1 = pickAssignee(m, 'ROUND_ROBIN', 0, 'P1')!; const p2 = pickAssignee(m, 'ROUND_ROBIN', p1.cursor, 'P1')!; const p3 = pickAssignee(m, 'ROUND_ROBIN', p2.cursor, 'P1')!;
    expect([p1.id, p2.id, p3.id]).toEqual(['a', 'e', 'a']);
    expect(pickAssignee(m, 'ROUND_ROBIN', 0, 'X')!.id).toBe('a');
    expect(pickAssignee(m, 'OFF', 0, 'P1')).toBeNull();
    expect(pickAssignee([{ id: 'z', openLeads: 0, onLeave: true }], 'LEAST_LOADED', 0, 'P1')).toBeNull();
  });
  it('least-loaded picks the lightest, ties → lowest id', () => {
    expect(pickAssignee([{ id: 'b', openLeads: 2 }, { id: 'a', openLeads: 2 }, { id: 'c', openLeads: 1 }], 'LEAST_LOADED', 0, 'P')!.id).toBe('c');
    expect(pickAssignee([{ id: 'b', openLeads: 2 }, { id: 'a', openLeads: 2 }], 'LEAST_LOADED', 0, 'P')!.id).toBe('a');
  });
  it('policy: defaults keep legacy behaviour; bad input is rejected', () => {
    expect(policyOf(undefined)).toEqual(DEFAULT_POLICY);
    expect(cleanPolicy({ phoneMode: 'X' }, DEFAULT_POLICY)).toMatch(/Phone mode/);
    expect(cleanPolicy({ revealCap: 0 }, DEFAULT_POLICY)).toMatch(/reveal/);
    expect(cleanPolicy({ scope: 'PROJECTS' }, DEFAULT_POLICY)).toMatch(/at least one project/);
    const ok = cleanPolicy({ phoneMode: 'REVEAL', revealCap: 5, maxOpenLeads: 20 }, DEFAULT_POLICY) as any;
    expect(ok.phoneMode).toBe('REVEAL'); expect(ok.maxOpenLeads).toBe(20);
    expect((cleanPolicy({ maxOpenLeads: null }, ok) as any).maxOpenLeads).toBeUndefined();
    expect(maskPhone('+91 98261 12345')).toBe('••••••••45');
  });
  it('mandate validity + partner scorecard + staff accountability', () => {
    expect(mandateIsActive({ status: 'ACTIVE_ASSOCIATE' })).toBe(true);
    expect(mandateIsActive({ status: 'PAUSED' })).toBe(false);
    expect(mandateIsActive({ status: 'ACTIVE_ASSOCIATE', validUntil: new Date(Date.now() - 1000).toISOString() })).toBe(false);
    const old = new Date(Date.now() - 30 * 86400000).toISOString();
    expect(partnerCard([], old).flag).toBe('INACTIVE');
    const c = partnerCard([{ stage: 'BOOKED', createdAt: old, updatedAt: new Date().toISOString() }, { stage: 'LOST', createdAt: old, updatedAt: old }, { stage: 'NEW', createdAt: old, updatedAt: old }], old);
    expect(c.conversionPct).toBe(50); expect(c.flag).toBe('ACTIVE'); expect(c.leads).toBe(3);
    const lead: any = { id: 'L', stage: 'NEW', createdAt: new Date(Date.now() - 100 * 3600000).toISOString(), updatedAt: '', assignedMemberId: 'm', activities: [{ at: new Date(Date.now() - 99 * 3600000).toISOString(), type: 'SYSTEM', byUserId: 'o', note: 'Allotted to X' }], followUps: [{ dueAt: new Date(Date.now() - 3600000).toISOString(), done: false }] };
    const s = staffCard('m', [lead]);
    expect(s.untouched).toBe(1); expect(s.overdue).toBe(1); expect(s.stale).toBe(1); expect(s.avgFirstResponseHrs).toBeNull();
  });
});

describe('builder control room', () => {
  it('only the builder (and read-only admin) can open it; others are refused', async () => {
    expect((await call(jar.BLD, 'GET', '/api/pcontrol/builder/projects')).status).toBe(200);
    expect((await call(jar.ADMIN, 'GET', '/api/pcontrol/builder/projects')).status).toBe(200);
    expect((await call(jar.BRK1, 'GET', '/api/pcontrol/builder/projects')).status).toBe(403);
    expect((await call(jar.TEAM1, 'GET', '/api/pcontrol/builder/projects')).status).toBe(403);
    expect((await call(undefined, 'GET', '/api/pcontrol/builder/projects')).status).toBe(401);
    expect((await call(jar.ADMIN, 'PUT', `/api/pcontrol/builder/projects/${PROJ}/settings`, { leadIntake: 'PAUSED' })).status).toBe(403);
    expect((await call(jar.BLD2, 'GET', `/api/pcontrol/builder/projects/${PROJ}`)).status).toBe(404); // another builder
  });
  it('broker applies → builder shortlists → approves with terms; duplicates refused', async () => {
    expect((await call(jar.BRK1, 'POST', `/api/pcontrol/partner/projects/${PROJ}/apply`, { note: 'Raipur 6 yrs, 40 clients' })).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/pcontrol/partner/projects/${PROJ}/apply`, {})).status).toBe(409);
    expect((await call(jar.BRK2, 'POST', `/api/pcontrol/partner/projects/${PROJ}/apply`, {})).status).toBe(200);
    // not yet partners → cannot register leads
    const early = await call(jar.BRK1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Early', phone: rnd() });
    expect(early.status).toBe(403);
    const d = await j(await call(jar.BLD, 'GET', `/api/pcontrol/builder/projects/${PROJ}`));
    const m1 = d.partners.find((m: any) => m.brokerId === 'USR-BRK-001'); const m2 = d.partners.find((m: any) => m.brokerId === 'USR-BRK-002');
    M1 = m1.id; M2 = m2.id; expect(m1.status).toBe('APPLIED'); expect(m1.appliedNote).toMatch(/Raipur/);
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${M1}/decide`, { action: 'SHORTLIST', note: 'Interview Monday' })).status).toBe(200);
    const list = await j(await call(jar.BRK1, 'GET', '/api/pcontrol/partner/projects'));
    const row = list.projects.find((p: any) => p.id === PROJ);
    expect(row.relation).toBe('SHORTLISTED'); expect(row.statusReason).toMatch(/Interview/);
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${M1}/decide`, { action: 'APPROVE', commissionPct: 25 })).status).toBe(400);
    const ok = await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${M1}/decide`, { action: 'APPROVE', commissionPct: 2.5, quota: 8, dailyLeadCap: 2 });
    expect(ok.status).toBe(200);
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${M2}/decide`, { action: 'APPROVE' })).status).toBe(200);
    expect((await call(jar.BLD2, 'POST', `/api/pcontrol/builder/mandates/${M1}/decide`, { action: 'DECLINE', note: 'nope' })).status).toBe(404);
    const after = (await j(await call(jar.BRK1, 'GET', `/api/pcontrol/partner/projects/${PROJ}`)));
    expect(after.relation).toBe('ACTIVE'); expect(after.terms.commissionPct).toBe(2.5); expect(after.terms.dailyLeadCap).toBe(2);
  });
  it('daily lead cap, intake pause and pause/resume gate lead registration', async () => {
    const reg = (cookie = jar.BRK1) => call(cookie, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Client ' + Math.random().toString(36).slice(2, 6), phone: rnd() });
    expect((await reg()).status).toBe(200); expect((await reg()).status).toBe(200);
    const third = await reg(); expect(third.status).toBe(429); expect((await j(third)).code).toBe('DAILY_CAP');
    expect((await reg(jar.BRK2)).status).toBe(200); // cap is per partner
    await call(jar.BLD, 'PUT', `/api/pcontrol/builder/projects/${PROJ}/settings`, { leadIntake: 'PAUSED', intakeNote: 'Site visit week' });
    const paused = await reg(jar.BRK2); expect(paused.status).toBe(423); expect((await j(paused)).error).toMatch(/Site visit week/);
    await call(jar.BLD, 'PUT', `/api/pcontrol/builder/projects/${PROJ}/settings`, { leadIntake: 'OPEN' });
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${M2}/status`, { action: 'PAUSE' })).status).toBe(400); // reason needed
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${M2}/status`, { action: 'PAUSE', reason: 'Quality review' })).status).toBe(200);
    expect((await reg(jar.BRK2)).status).toBe(403);
    expect((await j(await call(jar.BRK2, 'GET', '/api/pcontrol/partner/projects'))).projects.find((p: any) => p.id === PROJ).relation).toBe('PAUSED');
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${M2}/status`, { action: 'RESUME' })).status).toBe(200);
    expect((await reg(jar.BRK2)).status).toBe(200);
  });
  it('terms change needs a reason, keeps history, validates ranges', async () => {
    expect((await call(jar.BLD, 'PUT', `/api/pcontrol/builder/mandates/${M2}/terms`, { commissionPct: 3 })).status).toBe(400);
    expect((await call(jar.BLD, 'PUT', `/api/pcontrol/builder/mandates/${M2}/terms`, { commissionPct: 30, note: 'x y z' })).status).toBe(400);
    expect((await call(jar.BLD, 'PUT', `/api/pcontrol/builder/mandates/${M2}/terms`, { commissionPct: 3, dailyLeadCap: 5, validUntil: new Date(Date.now() + 90 * 86400000).toISOString(), note: 'Top performer' })).status).toBe(200);
    const d = await j(await call(jar.BRK2, 'GET', `/api/pcontrol/partner/projects/${PROJ}`));
    expect(d.terms.commissionPct).toBe(3); expect(d.terms.history.length).toBe(2);
    expect((await call(jar.BLD, 'PUT', `/api/pcontrol/builder/mandates/${M2}/terms`, { validUntil: '2020-01-01', note: 'past' })).status).toBe(400);
  });
  it('manual verification: pending lead blocks booking; builder (and only builder) accepts / rejects', async () => {
    await call(jar.BLD, 'PUT', `/api/pcontrol/builder/projects/${PROJ}/settings`, { leadVerification: 'MANUAL' });
    const ph = rnd();
    const r = await j(await call(jar.BRK2, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Verify Me', phone: ph }));
    expect(r.lead.verify).toBe('PENDING');
    await call(jar.BRK2, 'POST', `/api/crm/leads/${r.lead.id}/stage`, { stage: 'SITE_VISITED' }).catch(() => 0);
    const bk = await call(jar.BRK2, 'POST', `/api/crm/leads/${r.lead.id}/booking-request`, { unitNo: 'A-1', agreementValue: 5000000, tokenAmount: 100000 });
    expect([409]).toContain(bk.status);
    const q = await j(await call(jar.BLD, 'GET', '/api/pcontrol/builder/verification-queue'));
    expect(q.leads.some((l: any) => l.id === r.lead.id)).toBe(true);
    expect((await call(jar.BRK2, 'POST', `/api/pcontrol/builder/leads/${r.lead.id}/verify`, { decision: 'ACCEPT' })).status).toBe(404);
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/leads/${r.lead.id}/verify`, { decision: 'REJECT' })).status).toBe(400);
    const rej = await j(await call(jar.BLD, 'POST', `/api/pcontrol/builder/leads/${r.lead.id}/verify`, { decision: 'REJECT', note: 'Already our client' }));
    expect(rej.lead.stage).toBe('LOST'); expect(rej.lead.verify).toBe('REJECTED');
    // protection released → the same phone can be registered again
    const again = await j(await call(jar.BRK2, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Verify Me', phone: ph }));
    expect(again.lead.verify).toBe('PENDING');
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/leads/${again.lead.id}/verify`, { decision: 'ACCEPT' })).status).toBe(200);
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/leads/${again.lead.id}/verify`, { decision: 'ACCEPT' })).status).toBe(409);
    await call(jar.BLD, 'PUT', `/api/pcontrol/builder/projects/${PROJ}/settings`, { leadVerification: 'AUTO' });
  });
  it('builder staff with canVerify can verify; others cannot', async () => {
    await call(jar.BLD, 'PUT', `/api/pcontrol/builder/projects/${PROJ}/settings`, { leadVerification: 'MANUAL' });
    const lead = await j(await call(jar.BRK2, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Staff Verify', phone: rnd() }));
    expect((await call(jar.BTEAM, 'POST', `/api/pcontrol/builder/leads/${lead.lead.id}/verify`, { decision: 'ACCEPT' })).status).toBe(404);
    const comp = (await j(await call(jar.BLD, 'GET', '/api/team'))).members;
    const staff = comp.find((m: any) => m.id === 'USR-TEAM-005');
    expect((await call(jar.BLD, 'PUT', `/api/pcontrol/team/${staff.id}/policy`, { canVerify: true, phoneMode: 'HIDDEN' })).status).toBe(200);
    const q = await j(await call(jar.BTEAM, 'GET', '/api/pcontrol/builder/verification-queue'));
    const seen = q.leads.find((l: any) => l.id === lead.lead.id);
    expect(seen).toBeTruthy(); expect(seen.phone).not.toMatch(/\d{6}/); // HIDDEN: no number
    expect((await call(jar.BTEAM, 'POST', `/api/pcontrol/builder/leads/${lead.lead.id}/verify`, { decision: 'ACCEPT' })).status).toBe(200);
    await call(jar.BLD, 'PUT', `/api/pcontrol/builder/projects/${PROJ}/settings`, { leadVerification: 'AUTO' });
  });
  it('invite-only hides the project from brokers who are not partners; details edit validates', async () => {
    await call(jar.BLD, 'PUT', `/api/pcontrol/builder/projects/${PROJ}/settings`, { access: 'INVITE_ONLY' });
    if (jar.BRK3) {
      const l = await j(await call(jar.BRK3, 'GET', '/api/pcontrol/partner/projects'));
      expect(l.projects.some((p: any) => p.id === PROJ)).toBe(false);
      expect((await call(jar.BRK3, 'GET', `/api/pcontrol/partner/projects/${PROJ}`)).status).toBe(404);
      expect((await call(jar.BRK3, 'POST', `/api/pcontrol/partner/projects/${PROJ}/apply`, {})).status).toBe(404);
      const old = await j(await call(jar.BRK3, 'GET', '/api/builder/projects'));
      expect(old.projects.some((p: any) => p.id === PROJ)).toBe(false);
    }
    expect((await j(await call(jar.BRK1, 'GET', '/api/pcontrol/partner/projects'))).projects.some((p: any) => p.id === PROJ)).toBe(true);
    await call(jar.BLD, 'PUT', `/api/pcontrol/builder/projects/${PROJ}/settings`, { access: 'OPEN_APPLY' });
    expect((await call(jar.BLD, 'PUT', `/api/pcontrol/builder/projects/${PROJ}/details`, { priceStartingFrom: 9999999999 })).status).toBe(400);
    expect((await call(jar.BLD, 'PUT', `/api/pcontrol/builder/projects/${PROJ}/details`, { availableUnits: 999 })).status).toBe(400);
    const ok = await j(await call(jar.BLD, 'PUT', `/api/pcontrol/builder/projects/${PROJ}/details`, { tagline: 'Phase 1 open', availableUnits: 30 }));
    expect(ok.changed).toEqual(['tagline', 'availableUnits']);
    expect((await call(jar.BRK1, 'PUT', `/api/pcontrol/builder/projects/${PROJ}/details`, { tagline: 'hack' })).status).toBe(403);
  });
  it('notices and collateral respect the audience; unsafe links are refused', async () => {
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/projects/${PROJ}/collateral`, { title: 'Evil', url: 'javascript:alert(1)' })).status).toBe(400);
    await call(jar.BLD, 'POST', `/api/pcontrol/builder/projects/${PROJ}/collateral`, { title: 'Price list', kind: 'PRICE_LIST', url: 'https://example.com/p.pdf', audience: 'ASSOCIATES' });
    await call(jar.BLD, 'POST', `/api/pcontrol/builder/projects/${PROJ}/collateral`, { title: 'Brochure', kind: 'BROCHURE', url: 'https://example.com/b.pdf', audience: 'ALL_CPS' });
    await call(jar.BLD, 'POST', `/api/pcontrol/builder/projects/${PROJ}/updates`, { kind: 'OFFER', title: 'Diwali offer', body: 'Free parking', audience: 'ASSOCIATES' });
    await call(jar.BLD, 'POST', `/api/pcontrol/builder/projects/${PROJ}/updates`, { kind: 'LAUNCH', title: 'Phase 2 launch', audience: 'ALL_CPS' });
    const mine = await j(await call(jar.BRK1, 'GET', `/api/pcontrol/partner/projects/${PROJ}`));
    expect(mine.collateral).toHaveLength(2); expect(mine.updates).toHaveLength(2);
    if (jar.BRK3) {
      const out = await j(await call(jar.BRK3, 'GET', `/api/pcontrol/partner/projects/${PROJ}`));
      expect(out.relation).toBe('NONE'); expect(out.collateral.map((c: any) => c.title)).toEqual(['Brochure']); expect(out.updates.map((u: any) => u.title)).toEqual(['Phase 2 launch']);
      expect(out.availableUnits_list).toEqual([]); expect(out.terms).toBeUndefined();
    }
    expect((await call(jar.BRK1, 'POST', `/api/pcontrol/builder/projects/${PROJ}/updates`, { title: 'hack hack' })).status).toBe(403);
  });
  it('revoke: needs a reason, keeps attribution by default, can take open leads back', async () => {
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${M2}/status`, { action: 'REVOKE', reason: 'x' })).status).toBe(400);
    const before = (await j(await call(jar.BRK2, 'GET', `/api/pcontrol/partner/projects/${PROJ}`))).leads.filter((l: any) => !['LOST', 'BOOKED'].includes(l.stage)).length;
    expect(before).toBeGreaterThan(0);
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${M2}/status`, { action: 'REVOKE', reason: 'Misconduct on site', takeOpenLeads: false })).status).toBe(200);
    expect((await j(await call(jar.BRK2, 'GET', `/api/pcontrol/partner/projects/${PROJ}`))).leads.length).toBeGreaterThan(0); // attribution kept
    expect((await call(jar.BRK2, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'After', phone: rnd() })).status).toBe(403);
    expect((await call(jar.BRK2, 'POST', `/api/pcontrol/partner/projects/${PROJ}/apply`, {})).status).toBe(409); // cannot simply re-apply
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${M2}/status`, { action: 'RESUME' })).status).toBe(409);
    // M1: revoke and take open leads back
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${M1}/status`, { action: 'REVOKE', reason: 'Project closed to this partner', takeOpenLeads: true })).status).toBe(200);
    const mine = await j(await call(jar.BRK1, 'GET', `/api/pcontrol/partner/projects/${PROJ}`));
    expect(mine.relation).toBe('REVOKED'); expect(mine.leads.filter((l: any) => !['LOST', 'BOOKED'].includes(l.stage))).toHaveLength(0);
  });
});

describe('channel partner: project-wise shortlist', () => {
  let sid = ''; let clientId = '';
  it('shortlist a CRM client for a project; duplicates refused; private to the broker', async () => {
    // BRK1 was revoked on PROJ — shortlist still works (project is visible), registering does not
    const c = await j(await call(jar.BRK1, 'POST', '/api/daily/clients', { name: 'Shortlist Ravi', phone: rnd(), budgetMin: 3000000, budgetMax: 7000000, city: 'Raipur', propertyType: 'Residential Flat', consent: true }));
    clientId = c.client?.id || c.card?.id; expect(clientId).toBeTruthy();
    const s = await call(jar.BRK1, 'POST', `/api/pcontrol/partner/projects/${PROJ}/shortlist`, { clientId, units: ['A-101', 'A-102'], note: 'Wants east facing' });
    expect(s.status).toBe(200); sid = (await j(s)).shortlist.id;
    expect((await call(jar.BRK1, 'POST', `/api/pcontrol/partner/projects/${PROJ}/shortlist`, { clientId })).status).toBe(409);
    expect((await call(jar.BRK1, 'POST', `/api/pcontrol/partner/projects/${PROJ}/shortlist`, { clientId: 'nope' })).status).toBe(404);
    const mine = await j(await call(jar.BRK1, 'GET', '/api/pcontrol/partner/shortlist'));
    expect(mine.shortlist.some((x: any) => x.id === sid)).toBe(true);
    expect((await j(await call(jar.BRK2, 'GET', '/api/pcontrol/partner/shortlist'))).shortlist.some((x: any) => x.id === sid)).toBe(false);
    expect((await call(jar.BRK2, 'PUT', `/api/pcontrol/partner/shortlist/${sid}`, { note: 'steal' })).status).toBe(404);
    expect((await call(jar.BRK2, 'POST', `/api/pcontrol/partner/shortlist/${sid}/register`, { consent: true })).status).toBe(404);
  });
  it('builder sees demand counts only — never names or numbers', async () => {
    const d = await j(await call(jar.BLD, 'GET', `/api/pcontrol/builder/projects/${PROJ}`));
    expect(d.demand.clients).toBeGreaterThanOrEqual(1); expect(JSON.stringify(d)).not.toContain('Shortlist Ravi');
  });
  it('register → lead is created with the shortlist link (needs an active partnership)', async () => {
    const blocked = await call(jar.BRK1, 'POST', `/api/pcontrol/partner/shortlist/${sid}/register`, { consent: true });
    expect(blocked.status).toBe(403); // revoked in the previous suite
    // approve BRK1 again via a fresh project to prove the happy path
    const p = await j(await call(jar.BLD, 'POST', '/api/builder/projects', { projectName: 'Shortlist Park', locality: 'Kota', reraNumber: 'CGRERAP888888', priceStartingFrom: 3000000, priceMax: 6000000, totalUnits: 20, channelPartnerCommissionPct: 2, unitConfigurations: ['2 BHK'] }));
    const pid = p.project?.id || p.projectId || p.id;
    await call(jar.BRK1, 'POST', `/api/pcontrol/partner/projects/${pid}/apply`, {});
    const m = (await j(await call(jar.BLD, 'GET', `/api/pcontrol/builder/projects/${pid}`))).partners[0];
    await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${m.id}/decide`, { action: 'APPROVE' });
    const s2 = (await j(await call(jar.BRK1, 'POST', `/api/pcontrol/partner/projects/${pid}/shortlist`, { clientId, units: ['P-7'] }))).shortlist;
    const reg = await j(await call(jar.BRK1, 'POST', `/api/pcontrol/partner/shortlist/${s2.id}/register`, { consent: true }));
    expect(reg.lead.shortlistId).toBe(s2.id); expect(reg.lead.unitInterest).toBe('P-7'); expect(reg.shortlist.status).toBe('LEAD_REGISTERED');
    expect((await call(jar.BRK1, 'POST', `/api/pcontrol/partner/shortlist/${s2.id}/register`, { consent: true })).status).toBe(409);
    const det = await j(await call(jar.BRK1, 'GET', `/api/pcontrol/partner/projects/${pid}`));
    expect(det.leads.some((l: any) => l.id === reg.lead.id)).toBe(true);
    expect((await call(jar.BRK1, 'DELETE', `/api/pcontrol/partner/shortlist/${sid}`)).status).toBe(200);
  });
});

describe('staff lead control', () => {
  let bProj = ''; let leads: string[] = [];
  it('set up a project where BRK1 is an active partner', async () => {
    const p = await j(await call(jar.BLD, 'POST', '/api/builder/projects', { projectName: 'Staff Test Villas', locality: 'Avanti Vihar', reraNumber: 'CGRERAP777777', priceStartingFrom: 3000000, priceMax: 6000000, totalUnits: 20, channelPartnerCommissionPct: 2, unitConfigurations: ['3 BHK'] }));
    bProj = p.project?.id || p.projectId || p.id;
    await call(jar.BRK1, 'POST', `/api/pcontrol/partner/projects/${bProj}/apply`, {});
    const m = (await j(await call(jar.BLD, 'GET', `/api/pcontrol/builder/projects/${bProj}`))).partners[0];
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${m.id}/decide`, { action: 'APPROVE' })).status).toBe(200);
  });
  it('only the employer manages policy; staff, strangers and admin cannot', async () => {
    expect((await call(jar.BRK1, 'GET', '/api/pcontrol/team/control')).status).toBe(200);
    expect((await call(jar.TEAM1, 'GET', '/api/pcontrol/team/control')).status).toBe(403);
    expect((await call(jar.ADMIN, 'GET', '/api/pcontrol/team/control')).status).toBe(403);
    expect((await call(jar.BRK2, 'PUT', '/api/pcontrol/team/USR-TEAM-001/policy', { phoneMode: 'HIDDEN' })).status).toBe(404); // another broker's employee
    expect((await call(jar.BRK1, 'PUT', '/api/pcontrol/team/USR-TEAM-001/policy', { phoneMode: 'WEIRD' })).status).toBe(400);
    expect((await call(jar.BRK1, 'PUT', '/api/pcontrol/team/USR-TEAM-001/policy', { canVerify: true })).status).toBe(400); // brokers cannot grant verification
    expect((await call(jar.BRK1, 'PUT', '/api/pcontrol/team/USR-TEAM-001/policy', { scope: 'PROJECTS', projectIds: ['PROJ-NOPE'] })).status).toBe(400);
    expect((await call(jar.TEAM1, 'PUT', '/api/pcontrol/team/USR-TEAM-002/policy', { phoneMode: 'FULL' })).status).toBe(403);
  });
  it('round-robin routing splits new leads between active staff; the owner sees the allotment', async () => {
    await call(jar.BRK1, 'PUT', '/api/pcontrol/team/USR-TEAM-001/policy', { phoneMode: 'FULL', onLeave: false, canClaim: false });
    await call(jar.BRK1, 'PUT', '/api/pcontrol/team/USR-TEAM-002/policy', { phoneMode: 'FULL', onLeave: false });
    expect((await call(jar.BRK1, 'PUT', '/api/pcontrol/team/routing', { mode: 'NOPE' })).status).toBe(400);
    expect((await call(jar.BRK1, 'PUT', '/api/pcontrol/team/routing', { mode: 'ROUND_ROBIN' })).status).toBe(200);
    for (let i = 0; i < 4; i++) {
      const r = await j(await call(jar.BRK1, 'POST', '/api/crm/leads', { consent: true, projectId: bProj, name: 'RR ' + i, phone: rnd() }));
      expect(r.success).toBe(true); leads.push(r.lead.id);
    }
    const all = (await j(await call(jar.BRK1, 'GET', `/api/crm/leads?projectId=${bProj}`))).leads;
    const by = all.reduce((a: any, l: any) => { a[l.assignedMemberId || 'none'] = (a[l.assignedMemberId || 'none'] || 0) + 1; return a; }, {});
    expect(by['USR-TEAM-001']).toBe(2); expect(by['USR-TEAM-002']).toBe(2);
  });
  it('REVEAL mode: masked list, logged reveal, daily cap; HIDDEN: never; masked search blocks number probing', async () => {
    expect((await call(jar.BRK1, 'PUT', '/api/pcontrol/team/USR-TEAM-001/policy', { phoneMode: 'REVEAL', revealCap: 2 })).status).toBe(200);
    const list = (await j(await call(jar.TEAM1, 'GET', '/api/crm/leads'))).leads.filter((l: any) => l.projectId === bProj);
    expect(list.length).toBe(2);
    for (const l of list) { expect(l.phoneMasked).toBe(true); expect(l.phone).toMatch(/^••••••••\d\d$/); }
    const owner = (await j(await call(jar.BRK1, 'GET', '/api/crm/leads'))).leads.find((l: any) => l.id === list[0].id);
    expect(owner.phone).toMatch(/^\d{10}$|^\+?\d/); expect(owner.phoneMasked).toBeUndefined();
    const digitsOf = owner.phone.replace(/\D/g, '').slice(-6);
    const probe = (await j(await call(jar.TEAM1, 'GET', `/api/crm/leads?q=${digitsOf}`))).leads;
    expect(probe).toHaveLength(0); // cannot search by number while masked
    const rv = await j(await call(jar.TEAM1, 'POST', `/api/pcontrol/leads/${list[0].id}/reveal`));
    expect(rv.phone).toBe(owner.phone);
    expect((await call(jar.TEAM1, 'POST', `/api/pcontrol/leads/${list[0].id}/reveal`)).status).toBe(200); // same lead again is free
    expect((await call(jar.TEAM1, 'POST', `/api/pcontrol/leads/${list[1].id}/reveal`)).status).toBe(200);
    // third distinct lead → over the cap of 2
    const extra = await j(await call(jar.BRK1, 'POST', '/api/crm/leads', { consent: true, projectId: bProj, name: 'Cap', phone: rnd() }));
    await call(jar.BRK1, 'POST', '/api/team/allot/lead', { leadId: extra.lead.id, memberId: 'USR-TEAM-001' });
    const capped = await call(jar.TEAM1, 'POST', `/api/pcontrol/leads/${extra.lead.id}/reveal`);
    expect(capped.status).toBe(429);
    // not allotted to him → 404
    const others = (await j(await call(jar.BRK1, 'GET', `/api/crm/leads?projectId=${bProj}`))).leads.find((l: any) => l.assignedMemberId === 'USR-TEAM-002');
    expect((await call(jar.TEAM1, 'POST', `/api/pcontrol/leads/${others.id}/reveal`)).status).toBe(404);
    const log = await j(await call(jar.BRK1, 'GET', '/api/pcontrol/team/reveals'));
    expect(log.reveals.filter((x: any) => x.userId === 'USR-TEAM-001').length).toBe(2);
    const ctl = await j(await call(jar.BRK1, 'GET', '/api/pcontrol/team/control'));
    expect(ctl.members.find((m: any) => m.id === 'USR-TEAM-001').revealsToday).toBe(2);
    await call(jar.BRK1, 'PUT', '/api/pcontrol/team/USR-TEAM-001/policy', { phoneMode: 'HIDDEN' });
    expect((await call(jar.TEAM1, 'POST', `/api/pcontrol/leads/${list[0].id}/reveal`)).status).toBe(403);
    expect((await call(jar.BRK1, 'POST', `/api/pcontrol/leads/${list[0].id}/reveal`)).status).toBe(403); // only staff use reveal
    await call(jar.BRK1, 'PUT', '/api/pcontrol/team/USR-TEAM-001/policy', { phoneMode: 'FULL' });
  });
  it('mark-lost, register and project restrictions are enforced for staff', async () => {
    const mine = (await j(await call(jar.TEAM2, 'GET', '/api/crm/leads'))).leads.find((l: any) => l.projectId === bProj);
    await call(jar.BRK1, 'PUT', '/api/pcontrol/team/USR-TEAM-002/policy', { canMarkLost: false, canRegister: false });
    const lost = await call(jar.TEAM2, 'POST', `/api/crm/leads/${mine.id}/stage`, { stage: 'LOST', lostReason: 'not interested' });
    expect(lost.status).toBe(403);
    expect((await call(jar.TEAM2, 'POST', '/api/crm/leads', { consent: true, projectId: bProj, name: 'Nope', phone: rnd() })).status).toBe(403);
    expect((await call(jar.TEAM2, 'POST', `/api/crm/leads/${mine.id}/stage`, { stage: 'CONTACTED' })).status).toBe(200); // normal work still fine
    await call(jar.BRK1, 'PUT', '/api/pcontrol/team/USR-TEAM-002/policy', { canMarkLost: true, canRegister: true });
    expect((await call(jar.TEAM2, 'POST', '/api/crm/leads', { consent: true, projectId: bProj, name: 'Walk In', phone: rnd() })).status).toBe(200);
  });
  it('pool + claim: only when enabled, capped, first come first served, never someone else\'s lead', async () => {
    await call(jar.BRK1, 'PUT', '/api/pcontrol/team/routing', { mode: 'OFF' });
    const pool = await j(await call(jar.BRK1, 'POST', '/api/crm/leads', { consent: true, projectId: bProj, name: 'Pool Lead', phone: rnd() }));
    expect(pool.lead.assignedMemberId).toBeUndefined();
    expect((await j(await call(jar.TEAM1, 'GET', '/api/pcontrol/staff/pool'))).enabled).toBe(false);
    expect((await call(jar.TEAM1, 'POST', '/api/pcontrol/staff/claim', { leadId: pool.lead.id })).status).toBe(403);
    await call(jar.BRK1, 'PUT', '/api/pcontrol/team/USR-TEAM-001/policy', { canClaim: true, maxOpenLeads: 50 });
    await call(jar.BRK1, 'PUT', '/api/pcontrol/team/USR-TEAM-002/policy', { canClaim: true });
    const pl = await j(await call(jar.TEAM1, 'GET', '/api/pcontrol/staff/pool'));
    const seen = pl.leads.find((l: any) => l.id === pool.lead.id);
    expect(seen).toBeTruthy(); expect(seen.phone).toMatch(/^••••••••\d\d$/);
    expect((await call(jar.TEAM1, 'POST', '/api/pcontrol/staff/claim', { leadId: pool.lead.id })).status).toBe(200);
    expect((await call(jar.TEAM2, 'POST', '/api/pcontrol/staff/claim', { leadId: pool.lead.id })).status).toBe(409); // already taken
    expect((await call(jar.BRK2, 'POST', '/api/pcontrol/staff/claim', { leadId: pool.lead.id })).status).toBe(403); // not staff
  });
  it('scope PROJECTS gives read-only visibility of the whole project; work stays with the assignee', async () => {
    await call(jar.BRK1, 'PUT', '/api/pcontrol/team/USR-TEAM-002/policy', { scope: 'PROJECTS', projectIds: [bProj] });
    const seen = (await j(await call(jar.TEAM2, 'GET', '/api/crm/leads'))).leads.filter((l: any) => l.projectId === bProj);
    const all = (await j(await call(jar.BRK1, 'GET', `/api/crm/leads?projectId=${bProj}`))).leads;
    expect(seen.length).toBe(all.length);
    const notMine = seen.find((l: any) => l.assignedMemberId !== 'USR-TEAM-002');
    expect((await call(jar.TEAM2, 'POST', `/api/crm/leads/${notMine.id}/stage`, { stage: 'CONTACTED' })).status).toBe(404);
    await call(jar.BRK1, 'PUT', '/api/pcontrol/team/USR-TEAM-002/policy', { scope: 'ASSIGNED', projectIds: [] });
  });
  it('bulk allot, hand-over, on-leave and suspend never leave leads stranded', async () => {
    const all = (await j(await call(jar.BRK1, 'GET', `/api/crm/leads?projectId=${bProj}`))).leads.filter((l: any) => !['LOST', 'BOOKED'].includes(l.stage));
    const ids = all.slice(0, 3).map((l: any) => l.id);
    expect((await call(jar.BRK1, 'POST', '/api/pcontrol/team/bulk-allot', { leadIds: [], memberId: 'USR-TEAM-002' })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', '/api/pcontrol/team/bulk-allot', { leadIds: ids, memberId: 'USR-TEAM-003' })).status).toBe(400); // other broker's staff
    const bulk = await j(await call(jar.BRK1, 'POST', '/api/pcontrol/team/bulk-allot', { leadIds: ids, memberId: 'USR-TEAM-002' }));
    expect(bulk.moved).toBe(3);
    // strangers cannot move someone else's leads
    expect((await j(await call(jar.BRK2, 'POST', '/api/pcontrol/team/bulk-allot', { leadIds: ids, memberId: null }))).moved).toBe(0);
    const h = await j(await call(jar.BRK1, 'POST', '/api/pcontrol/team/handover', { fromMemberId: 'USR-TEAM-002', toMemberId: 'USR-TEAM-001' }));
    expect(h.moved).toBeGreaterThanOrEqual(3);
    const after = (await j(await call(jar.BRK1, 'GET', `/api/crm/leads?projectId=${bProj}`))).leads.filter((l: any) => l.assignedMemberId === 'USR-TEAM-002' && !['LOST', 'BOOKED'].includes(l.stage));
    expect(after).toHaveLength(0);
    // on-leave hands leads back (routing OFF → pool)
    const pol = await j(await call(jar.BRK1, 'PUT', '/api/pcontrol/team/USR-TEAM-001/policy', { onLeave: true }));
    expect(pol.handedBack).toBeGreaterThan(0);
    expect((await j(await call(jar.TEAM1, 'GET', '/api/crm/leads'))).leads.filter((l: any) => !['LOST', 'BOOKED'].includes(l.stage) && l.projectId === bProj)).toHaveLength(0);
    // suspend releases too
    await call(jar.BRK1, 'PUT', '/api/pcontrol/team/USR-TEAM-001/policy', { onLeave: false });
    await call(jar.BRK1, 'POST', '/api/pcontrol/team/bulk-allot', { leadIds: ids, memberId: 'USR-TEAM-001' });
    await call(jar.BRK1, 'PUT', '/api/team/USR-TEAM-001', { active: false });
    const left = (await j(await call(jar.BRK1, 'GET', `/api/crm/leads?projectId=${bProj}`))).leads.filter((l: any) => l.assignedMemberId === 'USR-TEAM-001' && !['LOST', 'BOOKED'].includes(l.stage));
    expect(left).toHaveLength(0);
    await call(jar.BRK1, 'PUT', '/api/team/USR-TEAM-001', { active: true });
  });
  it('the audit trail records policy, reveals and partner decisions', async () => {
    const r = await j(await call(jar.ADMIN, 'GET', '/api/audit-logs'));
    const a = JSON.stringify(r.events || r.logs || r.auditEvents || r);
    for (const k of ['TEAM_POLICY_SET', 'CRM_PHONE_REVEALED', 'PARTNER_APPROVE', 'PARTNER_REVOKE', 'CRM_LEAD_REJECTED', 'PARTNER_TERMS_CHANGED']) expect(a).toContain(k);
  });
});
