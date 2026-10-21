import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Contractor privacy regressions:
 *  1. customer phone / exact address stay masked on an OPEN construction lead (an old "approved" record must not unmask it);
 *  2. they unmask only for the contractor the lead is assigned to, after the referral agreement is accepted;
 *  3. a role with no property access gets no network inventory figures from /api/admin/metrics.
 */
const root = path.resolve(import.meta.dirname, '..');
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const j = (r: Response) => r.json();

interface Srv { B: string; proc: ChildProcess; dir: string; cfg: any; }
async function start(dir: string): Promise<Srv> {
  const port = 5100 + Math.floor(Math.random() * 800);
  const proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' },
  });
  const B = `http://127.0.0.1:${port}`;
  let cfg: any;
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up yet */ } await wait(250); }
  expect(cfg).toBeTruthy();
  return { B, proc, dir, cfg };
}
async function stop(s: Srv) { s.proc.kill('SIGTERM'); await wait(500); }
const loginAs = async (s: Srv, id: string) => {
  const acc = s.cfg.demoAccounts.find((a: any) => a.id === id) || s.cfg.demoAccounts.find((a: any) => a.role === id);
  const r = await fetch(s.B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acc.email, password: s.cfg.demoPassword }) });
  expect(r.status).toBe(200);
  return r.headers.get('set-cookie')!.split(';')[0];
};
const get = (s: Srv, cookie: string, url: string) => fetch(s.B + url, { headers: { cookie } });
const post = (s: Srv, cookie: string, url: string, body: unknown) => fetch(s.B + url, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });

const LEAD = 'CL-RAI-501';
const RAW_TAIL = '33445'; // the last digits of the seeded customer phone, which must never reach a contractor before assignment

describe('contractor sees construction leads masked until assigned', () => {
  let s: Srv; let dir: string;
  beforeAll(async () => { dir = mkdtempSync(path.join(tmpdir(), 'genz-cp-')); mkdirSync(path.join(dir, 'data')); s = await start(dir); }, 90_000);
  afterAll(async () => { if (s) await stop(s); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

  it('a fresh demo contractor gets masked phone and address on an OPEN lead', async () => {
    const ck = await loginAs(s, 'USR-CONTRACTOR-001');
    const r = await get(s, ck, '/api/construction-leads');
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).not.toContain(RAW_TAIL);
    const lead = JSON.parse(body).leads.find((l: any) => l.id === LEAD);
    expect(lead.status).toBe('OPEN');
    expect(lead.customerPhoneHidden).toContain('•');
    expect(lead.exactAddressHidden).toMatch(/^Protected:/);
  });

  it('the referring broker and an admin still see the full contact', async () => {
    const adm = await loginAs(s, 'SUPERADMIN');
    const lead = (await j(await get(s, adm, '/api/construction-leads'))).leads.find((l: any) => l.id === LEAD);
    expect(lead.customerPhoneHidden).toContain(RAW_TAIL);
    const brokerCk = await loginAs(s, lead.referringBrokerId);
    const mine = (await j(await get(s, brokerCk, '/api/construction-leads'))).leads.find((l: any) => l.id === LEAD);
    expect(mine.customerPhoneHidden).toContain(RAW_TAIL);
  });

  it('request-access needs the agreement; signing it unmasks the contact for that contractor only', async () => {
    const c1 = await loginAs(s, 'USR-CONTRACTOR-001'); const c2 = await loginAs(s, 'USR-CONTRACTOR-002');
    expect((await post(s, c1, `/api/construction-leads/${LEAD}/request-access`, {})).status).toBe(400);
    expect((await get(s, c1, '/api/construction-leads').then(j)).leads.find((l: any) => l.id === LEAD).customerPhoneHidden).toContain('•');

    const ok = await post(s, c1, `/api/construction-leads/${LEAD}/request-access`, { termsAccepted: true });
    expect(ok.status).toBe(200);
    const after = (await j(await get(s, c1, '/api/construction-leads'))).leads.find((l: any) => l.id === LEAD);
    expect(after.status).toBe('ASSIGNED');
    expect(after.customerPhoneHidden).toContain(RAW_TAIL);

    // the other contractor neither sees the taken lead's contact nor can take it
    const body2 = await (await get(s, c2, '/api/construction-leads')).text();
    expect(body2).not.toContain(RAW_TAIL);
    expect((await post(s, c2, `/api/construction-leads/${LEAD}/request-access`, { termsAccepted: true })).status).toBe(409);
  });
});

describe('an old approved record on a lead that is not assigned never unmasks it', () => {
  let s: Srv; let dir: string;
  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'genz-cp2-')); mkdirSync(path.join(dir, 'data'));
    s = await start(dir);
    await stop(s); // first run only writes the seed database
    const file = path.join(dir, 'data', 'database.json');
    expect(existsSync(file)).toBe(true);
    const st = JSON.parse(readFileSync(file, 'utf8'));
    const lead = st.constructionLeads.find((l: any) => l.id === LEAD);
    expect(lead.status).toBe('OPEN');
    st.contractorRequests = [{
      id: 'CAR-OLD', leadId: LEAD, contractorId: 'USR-CONTRACTOR-001', contractorName: 'Ramesh', termsAccepted: true, termsAcceptedAt: new Date().toISOString(),
      status: 'APPROVED', disclosedContact: { customerName: 'x', customerPhone: lead.customerPhoneHidden, exactAddress: lead.exactAddressHidden }, createdAt: new Date().toISOString(),
    }];
    writeFileSync(file, JSON.stringify(st));
    s = await start(dir);
  }, 120_000);
  afterAll(async () => { if (s) await stop(s); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

  it('is purged on load, so the OPEN lead stays masked and can be taken through the agreement', async () => {
    const ck = await loginAs(s, 'USR-CONTRACTOR-001');
    const body = await (await get(s, ck, '/api/construction-leads')).text();
    expect(body).not.toContain(RAW_TAIL);
    const adm = await loginAs(s, 'SUPERADMIN');
    expect((await j(await get(s, adm, '/api/admin/metrics'))).metrics).toBeTruthy();
    const ok = await post(s, ck, `/api/construction-leads/${LEAD}/request-access`, { termsAccepted: true });
    expect(ok.status).toBe(200);
    expect((await j(ok)).lead.status).toBe('ASSIGNED');
  });
});

describe('a contractor gets no network inventory figures', () => {
  let s: Srv; let dir: string;
  beforeAll(async () => { dir = mkdtempSync(path.join(tmpdir(), 'genz-cp3-')); mkdirSync(path.join(dir, 'data')); s = await start(dir); }, 90_000);
  afterAll(async () => { if (s) await stop(s); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

  it('metrics for a contractor show zero inventory; admin and broker still see theirs', async () => {
    const c = await loginAs(s, 'USR-CONTRACTOR-001');
    const m = (await j(await get(s, c, '/api/admin/metrics'))).metrics;
    expect(m.totalPropertyInventoryValue).toBe(0);
    expect(m.activeProperties).toBe(0);
    expect(m.userInventoryValue).toBe(0);
    expect(m.userPropertiesCount).toBe(0);
    expect(m.scope).toBe('PERSONAL');
    expect(m.openConstructionLeads).toBeGreaterThan(0); // their own work still counts

    const a = (await j(await get(s, await loginAs(s, 'SUPERADMIN'), '/api/admin/metrics'))).metrics;
    expect(a.totalPropertyInventoryValue).toBeGreaterThan(0);
    const b = (await j(await get(s, await loginAs(s, 'USR-BRK-001'), '/api/admin/metrics'))).metrics;
    expect(b.totalPropertyInventoryValue).toBeGreaterThan(0);
  });

  it('property inventory itself is closed to a contractor', async () => {
    const c = await loginAs(s, 'USR-CONTRACTOR-001');
    expect((await get(s, c, '/api/properties')).status).toBe(403);
  });
});
