import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * v16.4 — regression tests from the all-roles audit (browser crawl + API sweep per role).
 * Each test pins down something the audit found broken.
 */
const PORT = 4200 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess;
let dir: string;
let cfg: any;
const jar: Record<string, string> = {};
const root = path.resolve(import.meta.dirname, '..');

async function login(email: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: cfg.demoPassword }) });
  expect(r.status).toBe(200);
  return r.headers.get('set-cookie')!.split(';')[0];
}
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const acct = (role: string, i = 0) => cfg.demoAccounts.filter((a: any) => a.role === role && a.verificationStatus === 'VERIFIED')[i];

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-audit-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  expect(cfg).toBeTruthy();
  jar.ADMIN = await login(acct('ADMIN').email);
  jar.B1 = await login('vikram.realty@gmail.com');
  jar.B2 = await login('amit.verma@shrikriparealty.in');
}, 40_000);

afterAll(() => { proc?.kill(); if (dir) rmSync(dir, { recursive: true, force: true }); });

const SENSITIVE = ['email', 'phone', 'panNumber', 'gstin', 'verificationNotes', 'consent', 'passwordHash', 'aadhaarLast4', 'idCheckedAt', 'sponsorId'];

describe('co-broking offers never carry the other broker\'s contact / KYC details', () => {
  it('each party sees the counterparty as a directory card (no email, phone, PAN, GSTIN, notes)', async () => {
    for (const [me, other] of [[jar.B1, 'amit.verma@shrikriparealty.in'], [jar.B2, 'vikram.realty@gmail.com']] as const) {
      const r = await (await call(me, 'GET', '/api/collaborations')).json();
      expect(r.offers.length).toBeGreaterThan(0);
      const raw = JSON.stringify(r);
      expect(raw.toLowerCase()).not.toContain(other.toLowerCase());
      for (const o of r.offers) for (const side of ['proposingBroker', 'receivingBroker']) {
        const b = o[side]; if (!b) continue;
        // own profile may keep the own email; the OTHER party must never have these keys
        const mine = (b.id === (me === jar.B1 ? 'USR-BRK-001' : 'USR-BRK-002'));
        if (!mine) for (const k of SENSITIVE) expect(b[k], `${side}.${k}`).toBeUndefined();
        expect(b.name).toBeTruthy(); // still identifiable by name / company / trust score
      }
    }
  });
  it('admin keeps the full view', async () => {
    const r = await (await call(jar.ADMIN, 'GET', '/api/collaborations')).json();
    expect(r.offers.some((o: any) => o.proposingBroker?.email || o.receivingBroker?.email)).toBe(true);
  });
});

describe('Deal Room UI only calls what the role may read', () => {
  const src = readFileSync(path.join(root, 'src/components/DealRoomsView.tsx'), 'utf-8');
  it('every per-deal fetch and sub-tab is behind a permission check', () => {
    for (const [fn, perm] of [['loadTasks(id)', 'task:read'], ['loadAgreements(id)', 'agreement:read'], ['loadReadinessReport(id)', 'dd:read'], ['loadMessages(id)', 'deal:chat'], ['loadVault(res.property.id)', 'property:read']] as const) {
      const line = src.split('\n').find(l => l.includes(fn) && l.includes('perm('));
      expect(line, `${fn} must be guarded`).toBeTruthy();
      expect(line).toContain(perm);
    }
    for (const perm of ['deal:chat', 'property:read', 'task:read', 'agreement:read', 'dd:read', 'dispute:read', 'dispute:create']) expect(src).toContain(`perm('${perm}'`);
  });
  it('the server really does refuse what the UI no longer asks for', async () => {
    const legal = await login(acct('LEGAL_COUNSEL').email);
    const deals = await (await call(legal, 'GET', '/api/deals')).json();
    const id = deals.deals[0]?.id; expect(id).toBeTruthy();
    expect((await call(legal, 'GET', `/api/deals/${id}/messages`)).status).toBe(403);
    expect((await call(legal, 'GET', `/api/deals/${id}/commission-agreements`)).status).toBe(403);
    const tm = await login(acct('TEAM_MEMBER').email);
    const tdeals = await (await call(tm, 'GET', '/api/deals')).json();
    if (tdeals.deals[0]) expect((await call(tm, 'GET', `/api/deals/${tdeals.deals[0].id}/readiness-report`)).status).toBe(403);
  });
});

describe('role homes rely on data each role can really read', () => {
  it('the growth checklist never asks a role for a step it cannot do (no Share Kit → no brand step)', async () => {
    const legal = await login(acct('LEGAL_COUNSEL').email);
    const l = await (await call(legal, 'GET', '/api/growth/me')).json();
    expect(l.checklist.map((c: any) => c.id)).not.toContain('brand');
    const b = await (await call(jar.B1, 'GET', '/api/growth/me')).json();
    expect(b.checklist.map((c: any) => c.id)).toContain('brand');
  });

  it('the demo buyer owns their enquiry, and gets the visit code for a visit booked on their phone', async () => {
    const buyer = await login(acct('BUYER_TENANT').email);
    const mine = await (await call(buyer, 'GET', '/api/requirements')).json();
    expect(mine.requirements.length).toBeGreaterThan(0);
    const phone = mine.requirements[0].customerPhone;
    const when = new Date(Date.now() + 2 * 86400_000).toISOString();
    const made = await (await call(jar.B2, 'POST', '/api/site-visits', { propertyId: 'PROP-RAI-101', customerName: mine.requirements[0].customerName, customerPhone: phone, scheduledTime: when })).json();
    expect(made.success).toBe(true);
    const visits = await (await call(buyer, 'GET', '/api/site-visits')).json();
    const v = visits.siteVisits.find((x: any) => x.id === made.siteVisit.id);
    expect(v?.otpCode).toMatch(/^\d{6}$/); // the customer sees the code the broker will ask for
    // another buyer never sees it
    const other = await login(acct('BUYER_TENANT', 1).email);
    const ov = await (await call(other, 'GET', '/api/site-visits')).json();
    expect(ov.siteVisits.find((x: any) => x.id === made.siteVisit.id)).toBeUndefined();
  });

  it('owner, buyer, legal and builder get their own home — not the broker commission dashboard', () => {
    const dash = readFileSync(path.join(root, 'src/components/DashboardView.tsx'), 'utf-8');
    const home = readFileSync(path.join(root, 'src/components/RoleHome.tsx'), 'utf-8');
    expect(dash).toContain('hasOwnHome');
    expect(home).toMatch(/ROLE_HOME_ROLES = \['PROPERTY_OWNER', 'BUYER_TENANT', 'LEGAL_COUNSEL', 'DEVELOPER_BUILDER'\]/);
    // the role homes never mention brokerage pipeline / commission volume
    expect(home).not.toMatch(/totalCommissionExpected|Brokerage Pipeline|Commission Status/);
  });
});

describe('construction referral settlement: each side does only its own step', () => {
  it('contractor claims → declares contract value → referring broker confirms receipt → COMPLETED', async () => {
    const con = await login('ramesh@chhattisgarhconstructions.com');
    const LID = 'CL-RAI-501';

    // nothing to settle before the lead is taken
    expect((await call(jar.B1, 'POST', `/api/construction-leads/${LID}/settle-referral`, { paid: true })).status).toBe(409);

    // only a contractor can claim, and only after accepting the terms
    expect((await call(jar.B2, 'POST', `/api/construction-leads/${LID}/request-access`, { termsAccepted: true })).status).toBe(403);
    expect((await call(con, 'POST', `/api/construction-leads/${LID}/request-access`, {})).status).toBe(400);
    const claimed = await (await call(con, 'POST', `/api/construction-leads/${LID}/request-access`, { termsAccepted: true })).json();
    expect(claimed.success).toBe(true);
    expect(claimed.lead.status).toBe('ASSIGNED');

    // the broker cannot declare the contract value; the contractor cannot say "I paid myself"
    expect((await call(jar.B1, 'POST', `/api/construction-leads/${LID}/settle-referral`, { finalContractValue: 9000000 })).status).toBe(403);
    expect((await call(con, 'POST', `/api/construction-leads/${LID}/settle-referral`, { paid: true })).status).toBe(403);
    // a broker who did not refer this lead has no say either
    expect((await call(jar.B2, 'POST', `/api/construction-leads/${LID}/settle-referral`, { paid: true })).status).toBe(403);
    // fee cannot be confirmed before a contract value exists
    expect((await call(jar.B1, 'POST', `/api/construction-leads/${LID}/settle-referral`, { paid: true })).status).toBe(400);
    // nonsense values are refused
    expect((await call(con, 'POST', `/api/construction-leads/${LID}/settle-referral`, { finalContractValue: 1e15 })).status).toBe(400);

    // contractor declares → fee due is worked out from the lead's own % (1%)
    const declared = await (await call(con, 'POST', `/api/construction-leads/${LID}/settle-referral`, { finalContractValue: 9000000 })).json();
    expect(declared.lead.referralCommissionDue).toBe(90000);
    expect(declared.lead.status).toBe('IN_PROGRESS');
    expect(declared.lead.referralCommissionPaid).toBeFalsy();

    // referring broker confirms receipt → completed, value locked
    const done = await (await call(jar.B1, 'POST', `/api/construction-leads/${LID}/settle-referral`, { paid: true })).json();
    expect(done.lead.referralCommissionPaid).toBe(true);
    expect(done.lead.status).toBe('COMPLETED');
    expect((await call(con, 'POST', `/api/construction-leads/${LID}/settle-referral`, { finalContractValue: 1 })).status).toBe(409);
  });

  it('the screen gives each side only its own button (static check)', () => {
    const v = readFileSync(path.join(root, 'src/components/ConstructionView.tsx'), 'utf-8');
    expect(v).toContain('finalContractValue: contractValue');
    expect(v).toContain('paid: true');
    expect(v).toContain('canSubmitLead');
  });
});

describe('every role can change their own password (not only on first login)', () => {
  it('wrong current password is refused; a good change works, ends other sessions, and the new password signs in', async () => {
    const email = acct('LEGAL_COUNSEL').email;
    const first = await login(email);
    const other = await login(email); // a second device
    expect((await call(first, 'POST', '/api/auth/change-password', { currentPassword: 'Not-The-Password-1', newPassword: 'Brand-New-Pass-2026' })).status).toBe(400);
    expect((await call(first, 'POST', '/api/auth/change-password', { currentPassword: cfg.demoPassword, newPassword: 'short' })).status).toBe(400);
    const ok = await call(first, 'POST', '/api/auth/change-password', { currentPassword: cfg.demoPassword, newPassword: 'Brand-New-Pass-2026' });
    expect(ok.status).toBe(200);
    expect((await call(other, 'GET', '/api/auth/me')).status).toBe(401); // other device signed out
    const again = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Brand-New-Pass-2026' }) });
    expect(again.status).toBe(200);
  });

  it('the "My data" panel offers it to everyone (static check)', () => {
    const v = readFileSync(path.join(root, 'src/components/PrivacyCenter.tsx'), 'utf-8');
    expect(v).toContain('PasswordSection');
    expect(v).toContain('api.changePassword');
  });
});

describe('Hindi coverage that must not silently regress', () => {
  it('every quick-pick tag has a Hindi name (so Owner / Buyer forms stay fully Hindi)', async () => {
    const { TAG_GROUPS } = await import('../src/shared/india.js');
    const labels = readFileSync(path.join(root, 'src/lib/labels.ts'), 'utf-8');
    const missing = TAG_GROUPS.flatMap(g => g.tags).filter(t => !labels.includes(`'${t}':`));
    expect(missing).toEqual([]);
  });

  it('the buyer and owner forms are written bilingual (no bare English labels left in them)', () => {
    const m = readFileSync(path.join(root, 'src/components/Modals.tsx'), 'utf-8');
    const a = m.indexOf('export const AddPropertyModal'); const b = m.indexOf('export const CollaborationModal');
    const forms = m.slice(a, b);
    // a <label> whose whole text is plain English (no {hi ? …} / {isBuyerUser ? …}) means a Hindi user sees English
    const bare = [...forms.matchAll(/<label[^>]*>([A-Za-z][^<{]*)<\/label>/g)].map(x => x[1]);
    expect(bare).toEqual([]);
  });
  it('every t(\'key\', …) used in the app has a Hindi entry (the nav tabs once fell back to English)', async () => {
    const { readdirSync, statSync } = await import('node:fs');
    const dict = readFileSync(path.join(root, 'src/lib/i18n.tsx'), 'utf-8');
    const keys = new Set([...dict.matchAll(/'([a-zA-Z]+\.[a-zA-Z_]+)':/g)].map(m => m[1]));
    const missing: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) { for (const m of readFileSync(p, 'utf-8').matchAll(/\bt\('([a-zA-Z]+\.[a-zA-Z_]+)',/g)) if (!keys.has(m[1])) missing.push(`${m[1]} (${f})`); } } };
    walk(path.join(root, 'src'));
    expect(missing).toEqual([]);
  });

  it('dashboard chart tooltips decide "money vs count" by data key, not by the (translatable) series name', () => {
    const d = readFileSync(path.join(root, 'src/components/DashboardView.tsx'), 'utf-8');
    expect(d).not.toMatch(/entry\.name\.toLowerCase\(\)\.includes/);
    expect(d).toContain("entry.dataKey === 'brokerageVolume'");
  });

  it('the Connector Desk, Share Kit and Navbar carry no Hinglish-in-English placeholders any more', () => {
    const share = readFileSync(path.join(root, 'src/components/ShareKit.tsx'), 'utf-8');
    expect(share).not.toMatch(/chuno|hatao|placeholder="Naam"/);
    const desk = readFileSync(path.join(root, 'src/components/ConnectorDesk.tsx'), 'utf-8');
    expect(desk).toContain("tx('Local Partner Referrals'");
    const nav = readFileSync(path.join(root, 'src/components/Navbar.tsx'), 'utf-8');
    expect(nav).toContain("label('role', currentUser.role)");
  });
});
