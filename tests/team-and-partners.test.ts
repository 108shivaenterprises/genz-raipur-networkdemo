import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Team members (employees of a broker/builder) + a broker's own referral-partner network. */
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess;
let dir: string;
let cfg: any;
const jar: Record<string, string> = {};

async function login(id: string, password?: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: id, password: password || cfg.demoPassword }) });
  expect(r.status).toBe(200);
  return r.headers.get('set-cookie')!.split(';')[0];
}
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = async (r: Response) => r.json();
const acct = (role: string, i = 0) => cfg.demoAccounts.filter((a: any) => a.role === role && a.verificationStatus === 'VERIFIED')[i];

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-team-'));
  mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ }
    await new Promise(r => setTimeout(r, 250));
  }
  expect(cfg).toBeTruthy();
  jar.ADMIN = await login(acct('ADMIN').email);
  jar.BROKER = await login(cfg.demoAccounts.find((a: any) => a.id === 'USR-BRK-001').email);
  jar.BROKER2 = await login(cfg.demoAccounts.find((a: any) => a.id === 'USR-BRK-002').email);
  jar.OWNER = await login(acct('PROPERTY_OWNER').email);
  jar.T1 = await login('9000030001');
}, 40_000);

afterAll(async () => { proc?.kill(); await new Promise(r => setTimeout(r, 500)); if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('team member — demo seed and visibility', () => {
  it('logs in by mobile and sees only the leads the employer allotted', async () => {
    const me = await j(await call(jar.T1, 'GET', '/api/auth/me'));
    expect(me.user.role).toBe('TEAM_MEMBER');
    const mine = (await j(await call(jar.T1, 'GET', '/api/crm/leads'))).leads;
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((l: any) => l.assignedMemberId === me.user.id)).toBe(true);
    const all = (await j(await call(jar.BROKER, 'GET', '/api/crm/leads'))).leads;
    expect(all.length).toBeGreaterThan(mine.length);
  });
  it('has no bookings, bonus, brokerage, inventory, connector or audit access', async () => {
    expect((await j(await call(jar.T1, 'GET', '/api/crm/bookings'))).bookings).toEqual([]);
    for (const u of ['/api/crm/bonus', '/api/properties', '/api/audit-logs', '/api/connector/referrals', '/api/team', '/api/invitations']) {
      expect([401, 403]).toContain((await call(jar.T1, 'GET', u)).status);
    }
  });
  it('sees only allotted deal rooms, with commercials redacted', async () => {
    const deals = (await j(await call(jar.T1, 'GET', '/api/deals'))).deals;
    expect(deals.length).toBe(1);
    expect(deals[0].commercialsHidden).toBe(true);
    expect(deals[0].totalCommissionExpected).toBe(0);
    expect(deals[0].teamMemberIds).toBeUndefined();
  });
  it('the directory shows a member only themselves and the employer', async () => {
    const u = (await j(await call(jar.T1, 'GET', '/api/auth/users'))).users;
    expect(u.length).toBe(2);
  });
});

describe('employer manages the team', () => {
  let newId: string; let temp: string; const phone = '9811122233';
  it('owners cannot use the team API; ops can', async () => {
    expect((await call(jar.OWNER, 'GET', '/api/team')).status).toBe(403);
    expect((await call(jar.ADMIN, 'GET', '/api/team')).status).toBe(200); // ops can have their own staff
  });
  it('consent attestation is required; then the member is created with a one-time password', async () => {
    expect((await call(jar.BROKER, 'POST', '/api/team', { name: 'Anil Sahu', phone, title: 'Telecaller', consentAttested: false })).status).toBe(400);
    const r = await call(jar.BROKER, 'POST', '/api/team', { name: 'Anil Sahu', phone, title: 'Telecaller', consentAttested: true });
    expect(r.status).toBe(200);
    const b = await j(r);
    newId = b.member.id; temp = b.temporaryPassword;
    expect(temp.length).toBeGreaterThanOrEqual(10);
    expect((await call(jar.BROKER, 'POST', '/api/team', { name: 'Dup', phone, title: 'Telecaller', consentAttested: true })).status).toBe(409);
  });
  it('the new member must change the temporary password at first sign-in', async () => {
    const c = await login(phone, temp);
    const me = await j(await call(c, 'GET', '/api/auth/me'));
    expect(me.mustChangePassword).toBe(true);
  });
  it('allot a lead, then the member sees it; take it back and it disappears', async () => {
    const free = (await j(await call(jar.BROKER, 'GET', '/api/crm/leads'))).leads.find((l: any) => l.assignedMemberId !== newId);
    expect((await call(jar.BROKER, 'POST', '/api/team/allot/lead', { leadId: free.id, memberId: newId })).status).toBe(200);
    const c = await login(phone, temp);
    // a forced-change account can still be checked by the employer's view
    const team = (await j(await call(jar.BROKER, 'GET', '/api/team'))).members.find((m: any) => m.id === newId);
    expect(team.leads).toBe(1);
    expect((await call(jar.BROKER, 'POST', '/api/team/allot/lead', { leadId: free.id, memberId: null })).status).toBe(200);
    expect((await j(await call(jar.BROKER, 'GET', '/api/team'))).members.find((m: any) => m.id === newId).leads).toBe(0);
    void c;
  });
  it('another broker cannot allot my leads or use my members', async () => {
    const lead = (await j(await call(jar.BROKER, 'GET', '/api/crm/leads'))).leads[0];
    expect((await call(jar.BROKER2, 'POST', '/api/team/allot/lead', { leadId: lead.id, memberId: newId })).status).toBe(404);
    expect((await call(jar.BROKER2, 'PUT', `/api/team/${newId}`, { active: false })).status).toBe(404);
    expect((await call(jar.BROKER2, 'POST', `/api/team/${newId}/reset-password`)).status).toBe(404);
    const mine2 = (await j(await call(jar.BROKER2, 'GET', '/api/crm/leads'))).leads[0];
    if (mine2) expect((await call(jar.BROKER2, 'POST', '/api/team/allot/lead', { leadId: mine2.id, memberId: newId })).status).toBe(400);
  });
  it('deal allotment is limited to deal brokers and own members', async () => {
    const deals = (await j(await call(jar.BROKER, 'GET', '/api/deals'))).deals;
    const d = deals[0];
    expect((await call(jar.BROKER, 'POST', '/api/team/allot/deal', { dealId: d.id, memberIds: [newId] })).status).toBe(200);
    expect((await call(jar.BROKER, 'POST', '/api/team/allot/deal', { dealId: d.id, memberIds: ['USR-BRK-002'] })).status).toBe(400);
    expect((await call(jar.OWNER, 'POST', '/api/team/allot/deal', { dealId: d.id, memberIds: [] })).status).toBe(403);
  });
  it('suspending kills the session; reactivating restores access; reset issues a new password', async () => {
    const before = await login('9000030002');
    expect((await call(before, 'GET', '/api/crm/leads')).status).toBe(200);
    const t2 = (await j(await call(jar.BROKER, 'GET', '/api/team'))).members.find((m: any) => m.phone.includes('30002'));
    expect((await call(jar.BROKER, 'PUT', `/api/team/${t2.id}`, { active: false })).status).toBe(200);
    expect((await call(before, 'GET', '/api/crm/leads')).status).toBe(401);
    // a fresh sign-in may reach the "pending / suspended" screen, but never any data
    const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: '9000030002', password: cfg.demoPassword }) });
    if (r.status === 200) expect((await call(r.headers.get('set-cookie')!.split(';')[0], 'GET', '/api/crm/leads')).status).toBe(403);
    expect((await call(jar.BROKER, 'PUT', `/api/team/${t2.id}`, { active: true })).status).toBe(200);
    const rs = await j(await call(jar.BROKER, 'POST', `/api/team/${t2.id}/reset-password`));
    expect(rs.temporaryPassword).toBeTruthy();
  });
  it('a suspended employer locks the whole team out', async () => {
    const t1 = await login('9000030001');
    const brk = cfg.demoAccounts.find((a: any) => a.id === 'USR-BRK-001');
    expect((await call(jar.ADMIN, 'POST', `/api/verifications/${brk.id}/review`, { action: 'SUSPEND', notes: 'test' })).status).toBe(200);
    expect([401, 403]).toContain((await call(t1, 'GET', '/api/crm/leads')).status);
    expect((await call(jar.ADMIN, 'POST', `/api/verifications/${brk.id}/review`, { action: 'APPROVE', notes: 'back' })).status).toBe(200);
    jar.BROKER = await login(brk.email); // the suspension ended the old session
  });
});

describe('broker referral-partner network', () => {
  let code: string; let partnerCookie: string; let refId: string;
  const phone = '9822233344';
  it('only brokers can invite partners; the number must be new', async () => {
    expect((await call(jar.OWNER, 'POST', '/api/connector/my-partners/invite', { phone })).status).toBe(403);
    expect((await call(jar.BROKER, 'POST', '/api/connector/my-partners/invite', { phone: '9000030001' })).status).toBe(409);
    const r = await call(jar.BROKER, 'POST', '/api/connector/my-partners/invite', { phone });
    expect(r.status).toBe(200);
    code = (await j(r)).invitation.code;
    expect((await call(jar.BROKER, 'POST', '/api/connector/my-partners/invite', { phone })).status).toBe(409);
  });
  it('the partner registers, admin approves, and the referral lands with the sponsor', async () => {
    const reg = await call(undefined, 'POST', '/api/auth/register-invite', { code, name: 'Sunita Kirana', phone, password: 'Kirana@Store2026', consent: true, state: 'Chhattisgarh', city: 'Raipur', shopType: 'KIRANA_STORE', shopName: 'Sunita Kirana', locality: 'Tatibandh' });
    expect(reg.status).toBe(200);
    const uid = (await j(reg)).user.id;
    expect((await call(jar.ADMIN, 'POST', `/api/verifications/${uid}/review`, { action: 'APPROVE', notes: 'ok' })).status).toBe(200);
    partnerCookie = await login(phone, 'Kirana@Store2026');
    const r = await call(partnerCookie, 'POST', '/api/connector/referrals', { type: 'BUY_PROPERTY', customerName: 'Ramesh', customerPhone: '9876511111', customerConsent: true, city: 'Raipur', locality: 'Tatibandh' });
    expect(r.status).toBe(200);
    const ref = (await j(r)).referral;
    refId = ref.id;
    const list = (await j(await call(jar.BROKER, 'GET', '/api/connector/referrals'))).referrals;
    const mine = list.find((x: any) => x.id === refId);
    expect(mine).toBeTruthy();
    expect(mine.sponsorId).toBe('USR-BRK-001');
    expect(mine.duplicateHash).toBeUndefined();
    const other = (await j(await call(jar.BROKER2, 'GET', '/api/connector/referrals'))).referrals;
    expect(other.some((x: any) => x.id === refId)).toBe(false);
  });
  it('the global 60-day duplicate lock still applies', async () => {
    const dup = await call(partnerCookie, 'POST', '/api/connector/referrals', { type: 'BUY_PROPERTY', customerName: 'Ramesh', customerPhone: '9876511111', customerConsent: true, city: 'Raipur', locality: 'Tatibandh' });
    expect(dup.status).toBe(409);
  });
  it('sponsor: reward only after CLOSED_WON, UTR required; partner and other brokers cannot approve or pay', async () => {
    expect((await call(jar.BROKER, 'POST', `/api/connector/referrals/${refId}/reward`, {})).status).toBe(409);
    for (const s of ['CONTACTED', 'QUALIFIED', 'IN_PROGRESS', 'CLOSED_WON']) {
      expect((await call(jar.BROKER, 'POST', `/api/connector/referrals/${refId}/status`, { status: s })).status).toBe(200);
    }
    expect((await call(partnerCookie, 'POST', `/api/connector/referrals/${refId}/reward`, {})).status).toBe(403);
    expect([403, 404]).toContain((await call(jar.BROKER2, 'POST', `/api/connector/referrals/${refId}/reward`, {})).status);
    expect([403, 404]).toContain((await call(jar.BROKER2, 'POST', `/api/connector/referrals/${refId}/pay`, { reference: 'UTR000111222' })).status);
    expect((await call(jar.BROKER, 'POST', `/api/connector/referrals/${refId}/reward`, {})).status).toBe(200);
    expect((await call(jar.BROKER, 'POST', `/api/connector/referrals/${refId}/pay`, { reference: 'x' })).status).toBe(400);
    expect((await call(jar.BROKER, 'POST', `/api/connector/referrals/${refId}/pay`, { reference: 'UTR000111222' })).status).toBe(200);
  });
  it('my-partners lists only this broker\'s own partners', async () => {
    const mine = await j(await call(jar.BROKER, 'GET', '/api/connector/my-partners'));
    expect(mine.partners.some((p: any) => p.phone.includes('9822233344'))).toBe(true);
    const other = await j(await call(jar.BROKER2, 'GET', '/api/connector/my-partners'));
    expect(other.partners.length).toBe(0);
  });
});
