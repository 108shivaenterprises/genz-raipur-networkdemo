import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * v59 — phone alerts for the work that crosses from one person to another:
 *   builder ↔ channel partner (partner request, appointment, lead, lead check, notice, booking request / decision),
 *   the broker's team (a lead / a deal room given), legal help (new case for that state's counsellors, taken, quote, messages),
 *   KYC decision, dispute.
 * Each alert reaches the right people only, names a customer by first name only (never a number), keeps a hidden number hidden,
 * honours the person's own alert settings, and never alerts the person who did the action.
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (c: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = async (r: Response) => r.json();
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id);
  expect(a, id).toBeTruthy();
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
type Alert = { kind: string; title: string; body: string; url: string };
const recent = async (c: string): Promise<Alert[]> => { const r = await call(c, 'GET', '/api/push/recent'); expect(r.status).toBe(200); return (await j(r)).alerts; };
const find = async (c: string, re: RegExp) => (await recent(c)).filter(a => re.test(a.title));
/** the alert settings: night silence off so the test does not depend on the hour */
const loud = (c: string) => call(c, 'PUT', '/api/push/prefs', { quiet: false, deals: true, broadcast: true });
const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const DEAL = 'DEAL-2026-001';
const PNAME = 'V59 Alert Heights';
let PROJ = ''; let LEAD = ''; let PHONE = ''; let BOOKING = ''; let LGL = '';

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v59-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 160; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BLD: 'USR-BUILDER-001', BT: 'USR-TEAM-005', B1: 'USR-BRK-001', B2: 'USR-BRK-002', T1: 'USR-TEAM-001', L1: 'USR-LEGAL-001', L2: 'USR-LEGAL-002', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
  for (const k of ['BLD', 'BT', 'B1', 'B2', 'T1', 'L1', 'L2']) expect((await loud(jar[k])).status, k).toBe(200);
}, 90000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

describe('my alerts list', () => {
  it('needs a login and shows only my own alerts', async () => {
    expect((await call(undefined, 'GET', '/api/push/recent')).status).toBe(401);
    expect(Array.isArray(await recent(jar.B1))).toBe(true);
  });
});

describe('builder ↔ channel partner', () => {
  it('a partner request reaches the builder; the appointment reaches the partner; nobody else', async () => {
    const p = await j(await call(jar.BLD, 'POST', '/api/builder/projects', { projectName: PNAME, locality: 'Shankar Nagar', reraNumber: 'CGRERAP595959', priceStartingFrom: 4500000, priceMax: 9000000, totalUnits: 40, channelPartnerCommissionPct: 2, unitConfigurations: ['2 BHK'] }));
    PROJ = p.project?.id || p.projectId || p.id; expect(PROJ).toBeTruthy();
    expect((await call(jar.B1, 'POST', `/api/pcontrol/partner/projects/${PROJ}/apply`, { note: 'Raipur 6 yrs' })).status).toBe(200);
    const req = await find(jar.BLD, new RegExp(`^Partner request · ${PNAME}`));
    expect(req).toHaveLength(1); expect(req[0].kind).toBe('deals'); expect(req[0].url).toBe('/?tab=pcontrol'); expect(req[0].body).toMatch(/Vikramaditya/);
    expect(await find(jar.B1, /^Partner request/)).toHaveLength(0); // the actor is never alerted
    const d = await j(await call(jar.BLD, 'GET', `/api/pcontrol/builder/projects/${PROJ}`));
    const m1 = d.partners.find((m: any) => m.brokerId === 'USR-BRK-001');
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/mandates/${m1.id}/decide`, { action: 'APPROVE', commissionPct: 2.5 })).status).toBe(200);
    const ok = await find(jar.B1, new RegExp(`^You are appointed ✔ · ${PNAME}`));
    expect(ok).toHaveLength(1); expect(ok[0].body).toMatch(/2\.5% commission/);
    expect(await find(jar.B2, new RegExp(PNAME))).toHaveLength(0);
  });

  it('the person’s own switch is respected: deals off → no alert', async () => {
    expect((await call(jar.BLD, 'PUT', '/api/push/prefs', { deals: false })).status).toBe(200);
    expect((await call(jar.B2, 'POST', `/api/pcontrol/partner/projects/${PROJ}/apply`, {})).status).toBe(200);
    expect((await find(jar.BLD, new RegExp(`^Partner request · ${PNAME}`))).length).toBe(1); // still only B1's from before
    expect((await call(jar.BLD, 'PUT', '/api/push/prefs', { deals: true })).status).toBe(200);
  });

  it('a new lead reaches the builder and his staff who check leads — first name only, never the number; the check reaches the partner', async () => {
    const team = (await j(await call(jar.BLD, 'GET', '/api/team'))).members;
    expect(team.some((m: any) => m.id === 'USR-TEAM-005')).toBe(true);
    expect((await call(jar.BLD, 'PUT', '/api/pcontrol/team/USR-TEAM-005/policy', { canVerify: true, phoneMode: 'HIDDEN' })).status).toBe(200);
    expect((await call(jar.BLD, 'PUT', `/api/pcontrol/builder/projects/${PROJ}/settings`, { leadVerification: 'MANUAL' })).status).toBe(200);
    PHONE = rnd();
    const r = await call(jar.B1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Sunita Yadav', phone: PHONE, source: 'WALK_IN' });
    expect(r.status, await r.clone().text()).toBe(200);
    const lead = (await j(r)).lead; LEAD = lead.id;
    for (const who of ['BLD', 'BT']) {
      const a = await find(jar[who], new RegExp(`^New partner lead · ${PNAME}`));
      expect(a, who).toHaveLength(1);
      expect(a[0].body).toMatch(/Sunita/); expect(a[0].body).not.toMatch(/Yadav/); expect(a[0].body).not.toContain(PHONE.slice(-5)); expect(a[0].url).toBe('/?tab=crm');
      expect(a[0].body).toMatch(/within 48 h/); // the builder checks leads by hand on this project
    }
    expect(await find(jar.B1, /^New partner lead/)).toHaveLength(0);
    expect(lead.verify).toBe('PENDING');
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/leads/${LEAD}/verify`, { decision: 'ACCEPT' })).status).toBe(200);
    const acc = await find(jar.B1, new RegExp(`^Lead accepted ✔ · ${PNAME}`));
    expect(acc).toHaveLength(1); expect(acc[0].body).toMatch(/^Sunita/); expect(acc[0].body).not.toMatch(/Yadav/);
  });

  it('a project notice reaches the appointed partners only (as a notice alert)', async () => {
    expect((await call(jar.BLD, 'POST', `/api/pcontrol/builder/projects/${PROJ}/updates`, { kind: 'OFFER', title: 'Diwali offer', body: 'Free parking on all 2 BHK', audience: 'ASSOCIATES' })).status).toBe(200);
    const n = await find(jar.B1, new RegExp(`^${PNAME}: Diwali offer`));
    expect(n).toHaveLength(1); expect(n[0].kind).toBe('broadcast'); expect(n[0].body).toMatch(/Free parking/);
    expect(await find(jar.B2, /Diwali offer/)).toHaveLength(0); // applied, not appointed
    expect(await find(jar.BLD, /Diwali offer/)).toHaveLength(0);
  });

  it('a booking request reaches the builder; his decision reaches the partner', async () => {
    for (const stage of ['CONTACTED', 'SITE_VISIT_SCHEDULED', 'SITE_VISITED']) { const s = await call(jar.B1, 'POST', `/api/crm/leads/${LEAD}/stage`, { stage }); expect(s.status, await s.clone().text()).toBe(200); }
    const r = await call(jar.B1, 'POST', `/api/crm/leads/${LEAD}/booking-request`, { unitNo: 'A-101', agreementValue: 5000000, tokenAmount: 0 });
    expect(r.status, await r.clone().text()).toBe(200);
    BOOKING = (await j(r)).booking.id;
    const a = await find(jar.BLD, new RegExp(`^Booking request · ${PNAME}`));
    expect(a).toHaveLength(1); expect(a[0].body).toMatch(/A-101/); expect(a[0].body).toMatch(/Sunita/); expect(a[0].body).not.toMatch(/Yadav/);
    expect(await find(jar.BT, /^Booking request/)).toHaveLength(1); // his staff who check leads
    const d = await call(jar.BLD, 'POST', `/api/crm/bookings/${BOOKING}/decision`, { decision: 'APPROVE' });
    expect(d.status, await d.clone().text()).toBe(200);
    const ok = await find(jar.B1, new RegExp(`^Booking approved ✔ · ${PNAME}`));
    expect(ok).toHaveLength(1); expect(ok[0].body).toMatch(/A-101/);
    expect(await find(jar.BLD, /^Booking approved/)).toHaveLength(0);
  });
});

describe('the broker’s team', () => {
  it('a lead given to a member reaches that member (first name only)', async () => {
    expect((await call(jar.B1, 'POST', '/api/team/allot/lead', { leadId: LEAD, memberId: 'USR-TEAM-001' })).status).toBe(200);
    const a = await find(jar.T1, /^New lead for you/);
    expect(a).toHaveLength(1); expect(a[0].body).toMatch(/Sunita/); expect(a[0].body).not.toMatch(/Yadav/); expect(a[0].body).toMatch(/Vikramaditya/);
    expect(await find(jar.B1, /^New lead for you/)).toHaveLength(0);
  });
  it('a deal room opened for a member reaches him once', async () => {
    expect((await call(jar.B1, 'POST', '/api/team/allot/deal', { dealId: DEAL, memberIds: [] })).status).toBe(200); // the demo deal already has her
    expect(await find(jar.T1, /^A deal room was opened for you/)).toHaveLength(0);
    expect((await call(jar.B1, 'POST', '/api/team/allot/deal', { dealId: DEAL, memberIds: ['USR-TEAM-001'] })).status).toBe(200);
    expect((await call(jar.B1, 'POST', '/api/team/allot/deal', { dealId: DEAL, memberIds: ['USR-TEAM-001'] })).status).toBe(200); // again: no second alert
    const a = await find(jar.T1, /^A deal room was opened for you/);
    expect(a).toHaveLength(1); expect(a[0].body).toContain(DEAL);
  });
});

describe('legal help', () => {
  it('a new case reaches the counsellors of that state only — without the broker’s name', async () => {
    expect((await call(jar.L2, 'PUT', '/api/legal/profile', { states: ['Maharashtra'] })).status).toBe(200);
    const r = await call(jar.B1, 'POST', '/api/legal/requests', { dealId: DEAL, helpType: 'TITLE_CHECK', description: 'Please check the title of this plot before the agreement.', detailsShared: [] });
    expect(r.status, await r.clone().text()).toBe(200);
    LGL = (await j(r)).request.id;
    const a = await find(jar.L1, /^New legal help request · Chhattisgarh/);
    expect(a).toHaveLength(1); expect(a[0].url).toBe('/?tab=legal'); expect(a[0].body).not.toMatch(/Vikramaditya/);
    expect(await find(jar.L2, /^New legal help request/)).toHaveLength(0);
  });
  it('taken → the broker; a number written before the fee is accepted stays hidden in the alert too', async () => {
    expect((await call(jar.L1, 'POST', `/api/legal/requests/${LGL}/claim`)).status).toBe(200);
    expect(await find(jar.B1, /^A counsellor took your legal case/)).toHaveLength(1);
    expect((await call(jar.L1, 'POST', `/api/legal/requests/${LGL}/messages`, { text: 'Ring me on 91234 56789 please' })).status).toBe(200);
    const m = await find(jar.B1, /^New message on a legal case/);
    expect(m).toHaveLength(1); expect(m[0].body).not.toMatch(/91234|56789/); expect(m[0].url).toBe('/?tab=deals');
    expect((await call(jar.B1, 'POST', `/api/legal/requests/${LGL}/messages`, { text: 'Thank you, the papers are in the case.' })).status).toBe(200);
    const back = await find(jar.L1, /^New message on a legal case/);
    expect(back).toHaveLength(1); expect(back[0].url).toBe('/?tab=legal');
  });
  it('the fee quote reaches the broker; his acceptance reaches the counsellor', async () => {
    expect((await call(jar.L1, 'POST', `/api/legal/requests/${LGL}/quote`, { amount: 3000, days: 5 })).status).toBe(200);
    const q = await find(jar.B1, /^Legal fee quote: ₹3,000/);
    expect(q).toHaveLength(1);
    const acc = await call(jar.B1, 'POST', `/api/legal/requests/${LGL}/accept`);
    expect(acc.status, await acc.clone().text()).toBe(200);
    expect(await find(jar.L1, /^Your fee was accepted ✔/)).toHaveLength(1);
  });
});

describe('deal room chat (broker ↔ broker, owner, allotted staff)', () => {
  it('a message reaches the others in the room once per 3 minutes; the brokers-only channel never reaches the owner or staff', async () => {
    const own = await login('USR-OWNER-001'); expect((await loud(own)).status).toBe(200);
    // a second member of the office is in the room too, but is suspended before anyone writes: his phone hears nothing
    const rk = await login('USR-TEAM-002'); expect((await loud(rk)).status).toBe(200);
    expect((await call(jar.B1, 'POST', '/api/team/allot/deal', { dealId: DEAL, memberIds: ['USR-TEAM-001', 'USR-TEAM-002'] })).status).toBe(200);
    expect((await call(jar.B1, 'PUT', '/api/team/USR-TEAM-002', { active: false })).status).toBe(200);
    expect((await call(jar.B2, 'POST', `/api/deals/${DEAL}/messages`, { text: 'Buyer wants a second visit on Sunday 11 AM' })).status).toBe(200);
    expect((await call(jar.B1, 'PUT', '/api/team/USR-TEAM-002', { active: true })).status).toBe(200);
    expect(await find(await login('USR-TEAM-002'), new RegExp(`· ${DEAL}$`))).toHaveLength(0);
    for (const [who, c] of [['B1', jar.B1], ['OWNER', own], ['STAFF', jar.T1]] as const) {
      const a = await find(c, new RegExp(`^Amit Kumar Verma · ${DEAL}`));
      expect(a, who).toHaveLength(1); expect(a[0].body).toMatch(/Sunday 11 AM/); expect(a[0].url).toBe(`/?tab=deals&deal=${DEAL}`);
    }
    expect(await find(jar.B2, new RegExp(`· ${DEAL}$`))).toHaveLength(0);
    expect((await call(jar.B2, 'POST', `/api/deals/${DEAL}/messages`, { text: 'Also asking about the parking' })).status).toBe(200);
    expect(await find(jar.B1, new RegExp(`^Amit Kumar Verma · ${DEAL}`))).toHaveLength(1); // no second alert within 3 minutes
    // the brokers-only channel: from the other broker → only the broker (his own first alert in that room)
    expect((await call(jar.B1, 'POST', `/api/deals/${DEAL}/messages`, { text: 'Split stays 50:50 as signed', audience: 'BROKERS' })).status).toBe(200);
    const priv = await find(jar.B2, new RegExp(`^🔒 Vikramaditya Sharma · ${DEAL}`));
    expect(priv).toHaveLength(1); expect(priv[0].body).toMatch(/50:50/);
    for (const c of [own, jar.T1]) expect(await find(c, /^🔒/)).toHaveLength(0);
  });
});

describe('a phone follows the person signed in on it', () => {
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/v59-shared-office-phone', keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
  it('sync: unknown → none; mine → mine; someone else’s → let go at once (his alerts stop reaching this phone)', async () => {
    expect((await j(await call(jar.B2, 'POST', '/api/push/sync', sub))).state).toBe('none');
    const r = await j(await call(jar.B2, 'POST', '/api/push/subscribe', sub)); expect(r.me).toBe('USR-BRK-002');
    expect((await j(await call(jar.B2, 'GET', '/api/push/prefs'))).devices).toBe(1);
    expect((await j(await call(jar.B2, 'POST', '/api/push/sync', sub))).state).toBe('mine');
    // Amit did not sign out; Vikram opens the app on the same phone
    expect((await j(await call(jar.B1, 'POST', '/api/push/sync', sub))).state).toBe('released');
    expect((await j(await call(jar.B2, 'GET', '/api/push/prefs'))).devices).toBe(0);
    expect((await j(await call(jar.B1, 'GET', '/api/push/prefs'))).devices).toBe(0); // and it is not his until he turns alerts on himself
    expect((await call(undefined, 'POST', '/api/push/sync', sub)).status).toBe(401);
  });
});

describe('broker → contractor (construction leads)', () => {
  it('a new lead reaches the city’s contractors; taking it, the contract value and "paid" reach the other side', async () => {
    const c1 = await login('USR-CONTRACTOR-001'); expect((await loud(c1)).status).toBe(200);
    const ph = rnd();
    const r = await call(jar.B1, 'POST', '/api/construction-leads', { title: 'G+1 house on a 1500 sq ft plot', projectType: 'Turnkey Residential', approximateLocation: 'Amlidih, Raipur', exactAddressHidden: 'Plot 12, Lane 3, Amlidih', estimatedBudget: 3500000, scopeDescription: 'Full construction with RCC frame and finishing', timeline: '8 months', customerNameMasked: 'Kavita Sahu', customerPhoneHidden: ph, referralCommissionPct: 1, customerConsent: true });
    expect(r.status, await r.clone().text()).toBe(200);
    const id = (await j(r)).lead.id;
    const a = await find(c1, /^New construction lead · Turnkey Residential/);
    expect(a).toHaveLength(1); expect(a[0].body).toMatch(/Amlidih/); expect(a[0].body).not.toMatch(/Kavita|Sahu/); expect(a[0].body).not.toContain(ph.slice(-5)); expect(a[0].url).toBe('/?tab=construction');
    expect(await find(jar.B1, /^New construction lead/)).toHaveLength(0);
    expect((await call(c1, 'POST', `/api/construction-leads/${id}/request-access`, { termsAccepted: true })).status).toBe(200);
    expect(await find(jar.B1, /took your construction lead$/)).toHaveLength(1);
    expect((await call(c1, 'POST', `/api/construction-leads/${id}/settle-referral`, { finalContractValue: 3000000 })).status).toBe(200);
    const v = await find(jar.B1, /^Contract value recorded/);
    expect(v).toHaveLength(1); expect(v[0].body).toMatch(/₹30,00,000/); expect(v[0].body).toMatch(/₹30,000/);
    expect((await call(jar.B1, 'POST', `/api/construction-leads/${id}/settle-referral`, { paid: true })).status).toBe(200);
    expect(await find(c1, /^Referral marked paid ✔/)).toHaveLength(1);
  });
});

describe('KYC and disputes', () => {
  it('a new member waiting for KYC reaches the GENZ desk (name and city — no ID numbers)', async () => {
    expect((await loud(jar.ADMIN)).status).toBe(200);
    const sup = await login(cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').id);
    const inv = await j(await call(sup, 'POST', '/api/invitations', { invitedEmail: 'v59.join@example.in', invitedPhone: '9826100059', targetRole: 'BROKER' }));
    const r = await call(undefined, 'POST', '/api/auth/register-invite', { code: inv.invitation.code, name: 'Naveen Sahu', email: 'v59.join@example.in', phone: '9826100059', password: 'Strong#Pass2026', consent: true, reraNumber: 'PCGRERA250518-0059', panNumber: 'ABCPE1234F', aadhaarNumber: '234567890124', idConsent: true });
    expect(r.status, await r.clone().text()).toBe(200);
    const a = await find(jar.ADMIN, /^New member waiting for KYC · broker/);
    expect(a).toHaveLength(1); expect(a[0].body).toMatch(/Naveen Sahu/); expect(a[0].body).not.toMatch(/ABCPE|2345|9826100059/); expect(a[0].url).toBe('/?tab=onboarding');
  });
  it('the decision on an account reaches that person (role-wise welcome line)', async () => {
    const r = await call(jar.ADMIN, 'POST', '/api/verifications/USR-BRK-004/review', { action: 'APPROVE' });
    expect(r.status, await r.clone().text()).toBe(200);
    const c = await login('USR-BRK-004');
    const a = await find(c, /^Your GENZ account is verified ✔/);
    expect(a).toHaveLength(1); expect(a[0].kind).toBe('system'); expect(a[0].body).toMatch(/listing/);
    expect(await find(jar.ADMIN, /^Your GENZ account is verified/)).toHaveLength(0);
  });
  it('a dispute reaches the other side, not the one who raised it — in Hindi when his app is in Hindi', async () => {
    expect((await call(jar.B2, 'PUT', '/api/push/prefs', { lang: 'fr' })).status).toBe(400);
    expect((await call(jar.B2, 'PUT', '/api/push/prefs', { lang: 'hi' })).status).toBe(200);
    expect((await j(await call(jar.B2, 'GET', '/api/push/prefs'))).prefs.lang).toBe('hi');
    const r = await call(jar.B1, 'POST', '/api/disputes', { dealRoomId: DEAL, counterpartyId: 'USR-BRK-002', reason: 'BYPASS_ATTEMPT', description: 'The other broker approached the owner directly after the visit.' });
    expect(r.status, await r.clone().text()).toBe(200);
    const a = await find(jar.B2, /^A dispute was raised with you/);
    expect(a).toHaveLength(1); expect(a[0].url).toBe('/?tab=disputes'); expect(a[0].body).toMatch(/Vikramaditya/);
    expect((a[0] as any).hi.title).toBe('आपके साथ एक विवाद दर्ज हुआ'); expect((a[0] as any).hi.body).toMatch(/Disputes में जवाब/);
    expect(await find(jar.B1, /^A dispute was raised/)).toHaveLength(0);
  });
});
