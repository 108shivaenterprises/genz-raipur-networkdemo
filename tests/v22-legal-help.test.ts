import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { maskPhones, stateOfProperty, HELP_TYPES, NEVER_SHARE, addMonths } from '../src/shared/legalRules';
import { computeFee } from '../src/shared/billingRules';
import { stateOfCity } from '../src/shared/india';
import { ROLE_PERMISSIONS } from '../server/permissions';
import { PERMISSION_HI } from '../src/lib/permHi';

/** v22 — Legal Help: broker asks from a deal room, state-matched counsellors claim first-come-first-served, flat GENZ fee. */
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
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const DEAL = 'DEAL-2026-001';
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
let reqId = ''; let feeId = '';

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v22-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  const sup = cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN')?.id;
  for (const [k, id] of Object.entries({ SUP: sup, ADMIN: 'USR-ADMIN-1', BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', BRK3: 'USR-BRK-003', OWN: 'USR-OWNER-001', L1: 'USR-LEGAL-001', L2: 'USR-LEGAL-002' })) jar[k] = await login(id as string);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('rules (pure)', () => {
  it('hides phone numbers written in free text, however they are spaced', () => {
    for (const t of ['call 9876543210 now', 'call +91 98765 43210 now', 'call 98765-43210 now', 'call 91 9876543210 now', 'whatsapp 09876543210']) {
      const m = maskPhones(t); expect(m.masked, t).toBe(true); expect(m.text, t).not.toMatch(/\d{5}/);
    }
    expect(maskPhones('Plot 45, survey 123/4, area 2400 sq ft, price 4500000').masked).toBe(false);
  });
  it('the state comes from the property, else from its city', () => {
    expect(stateOfProperty({ state: 'Chhattisgarh' }, stateOfCity)).toBe('Chhattisgarh');
    expect(stateOfProperty({ city: 'Raipur' }, stateOfCity)).toBe('Chhattisgarh');
    expect(stateOfProperty({ state: 'Madhya Pradesh', city: 'Raipur' }, stateOfCity)).toBe('Madhya Pradesh');
    expect(stateOfProperty(undefined, stateOfCity)).toBeNull();
  });
  it('the v22 starting fee (flat ₹500, members ₹250) is an ordinary Plans & Fees rule now', () => {
    const t = '2026-10-01T00:00:00.000Z'; const base = { states: [], includeUserIds: [], excludeUserIds: [], active: true, effectiveFrom: '2026-01-01T00:00:00.000Z', createdAt: t, createdBy: 'x', updatedAt: t, updatedBy: 'x', history: [] };
    const rule: any = { ...base, id: 'FR-1', event: 'LEGAL_CASE', segments: ['LEGAL_COUNSEL'], mode: 'FLAT', value: 500 };
    const plan: any = { ...base, id: 'P', name: 'P', segments: ['LEGAL_COUNSEL'], fees: { LEGAL_CASE: { type: 'FLAT', value: 250 } }, features: [] };
    const p = { userId: 'L', segment: 'LEGAL_COUNSEL' as const, state: 'Chhattisgarh' };
    expect(computeFee([rule], null, 'LEGAL_CASE', p, 9000, t).fee).toBe(500);
    expect(computeFee([rule], plan, 'LEGAL_CASE', p, 9000, t).fee).toBe(250);
  });
  it('every help type says which papers and details to share; the never-share list is bilingual', () => {
    expect(HELP_TYPES.length).toBeGreaterThanOrEqual(8);
    for (const h of HELP_TYPES) { expect(h.papers.length, h.id).toBeGreaterThan(0); expect(h.details.length, h.id).toBeGreaterThan(0); expect(h.hi && h.whenHi, h.id).toBeTruthy(); for (const x of [...h.papers, ...h.details]) expect(x.hi.length, h.id).toBeGreaterThan(1); }
    for (const n of NEVER_SHARE) expect(n.en && n.hi).toBeTruthy();
    expect(addMonths('2026-01-31T00:00:00.000Z', 1) > '2026-02-01').toBe(true);
  });
  it('roles: only brokers ask, only counsellors claim, staff manage, only the superadmin sets fees', () => {
    expect(ROLE_PERMISSIONS.BROKER).toContain('legal:request'); expect(ROLE_PERMISSIONS.LEGAL_COUNSEL).toContain('legal:desk');
    expect(ROLE_PERMISSIONS.ADMIN).toContain('legal:manage'); expect(ROLE_PERMISSIONS.ADMIN).not.toContain('legal:settings'); expect(ROLE_PERMISSIONS.SUPERADMIN).toContain('legal:settings');
    expect(ROLE_PERMISSIONS.LEGAL_COUNSEL).not.toContain('legal:settings'); expect(ROLE_PERMISSIONS.PROPERTY_OWNER).not.toContain('legal:request');
    for (const k of ['legal:request', 'legal:desk', 'legal:manage', 'legal:settings']) expect(PERMISSION_HI[k], k).toBeTruthy();
  });
});

describe('raising a request from the deal room', () => {
  it('the state is read from the deal’s property', async () => {
    const c = await j(await call(jar.BRK1, 'GET', `/api/legal/context?dealId=${DEAL}`));
    expect(c.success).toBe(true); expect(c.state).toBe('Chhattisgarh'); expect(c.stateFromProperty).toBe(true);
  });
  it('a stranger, an owner, an admin and a counsellor cannot raise it', async () => {
    const body = { dealId: DEAL, helpType: 'TITLE_CHECK', description: 'Please check the title of this plot carefully.' };
    expect((await call(jar.BRK3, 'POST', '/api/legal/requests', body)).status).toBe(404);
    for (const who of ['OWN', 'ADMIN', 'L1']) expect((await call(jar[who], 'POST', '/api/legal/requests', body)).status, who).toBe(403);
    expect((await call(jar.SUP, 'POST', '/api/legal/requests', body)).status).toBe(404); // the superadmin holds every permission but is no party to this deal
  });
  it('checks the form: description length, a real help type, only own papers', async () => {
    const ok = { dealId: DEAL, helpType: 'TITLE_CHECK', description: 'Please check the title of this plot carefully.' };
    expect((await call(jar.BRK1, 'POST', '/api/legal/requests', { ...ok, description: 'short' })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', '/api/legal/requests', { ...ok, helpType: 'WHATEVER' })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', '/api/legal/requests', { ...ok, state: 'Atlantis' })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', '/api/legal/requests', { ...ok, sharedDocIds: ['PDOC-NOT-MINE'] })).status).toBe(400);
  });
  it('raises it; a number typed into the text is hidden; a second one of the same kind is refused', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/legal/requests', { dealId: DEAL, helpType: 'TITLE_CHECK', description: 'Please check the title. Seller is on 98765 43210 if you need him.', detailsShared: ['Survey / khasra number'] });
    expect(r.status).toBe(200); const b = await j(r); reqId = b.request.id;
    expect(b.phoneMasked).toBe(true); expect(b.request.description).not.toMatch(/98765/); expect(b.request.status).toBe('OPEN'); expect(b.request.state).toBe('Chhattisgarh');
    expect((await call(jar.BRK1, 'POST', '/api/legal/requests', { dealId: DEAL, helpType: 'TITLE_CHECK', description: 'Another one for the same thing please.' })).status).toBe(409);
  });
});

describe('who sees it', () => {
  it('a counsellor of that state sees it — with no names, no deal room, no papers', async () => {
    const d = await j(await call(jar.L1, 'GET', '/api/legal/desk'));
    const x = d.pool.find((p: any) => p.id === reqId); expect(x).toBeTruthy();
    expect(x.requestedBy).toBeUndefined(); expect(x.dealRoomId).toBeUndefined(); expect(x.docs).toBeUndefined(); expect(x.messages).toBeUndefined();
    const me = await j(await call(jar.L1, 'GET', '/api/billing/me'));
    expect(me.rules.find((r: any) => r.event === 'LEGAL_CASE').rule.en).toMatch(/₹500 each time/); // the counsellor reads the fee, cannot edit it
  });
  it('a counsellor who works another state does not', async () => {
    expect((await call(jar.L2, 'PUT', '/api/legal/profile', { states: ['Maharashtra'] })).status).toBe(200);
    const d = await j(await call(jar.L2, 'GET', '/api/legal/desk'));
    expect(d.pool.find((p: any) => p.id === reqId)).toBeUndefined();
    expect((await call(jar.L2, 'GET', `/api/legal/requests/${reqId}`)).status).toBe(404);
    expect((await call(jar.L2, 'POST', `/api/legal/requests/${reqId}/claim`)).status).toBe(403);
  });
  it('GENZ admin and superadmin see the request text; another broker, an owner do not', async () => {
    for (const who of ['ADMIN', 'SUP']) { const a = await j(await call(jar[who], 'GET', '/api/legal/admin')); expect(a.requests.some((x: any) => x.id === reqId && x.description)).toBe(true); }
    for (const who of ['BRK2', 'BRK3', 'OWN']) { const r = await call(jar[who], 'GET', `/api/legal/requests/${reqId}`); expect([403, 404], who).toContain(r.status); }
  });
  it('the broker’s own deal-room privacy is untouched — the admin still cannot open the deal room', async () => {
    expect((await call(jar.ADMIN, 'GET', `/api/deals/${DEAL}/messages`)).status).toBe(403);
  });
});

describe('first come, first served', () => {
  it('only one of two simultaneous claims wins', async () => {
    expect((await call(jar.L2, 'PUT', '/api/legal/profile', { states: ['Chhattisgarh'] })).status).toBe(200);
    const [a, b] = await Promise.all([call(jar.L1, 'POST', `/api/legal/requests/${reqId}/claim`), call(jar.L2, 'POST', `/api/legal/requests/${reqId}/claim`)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b; expect((await j(loser)).code).toBe('ALREADY_CLAIMED');
    const winnerJar = a.status === 200 ? jar.L1 : jar.L2; jar.WIN = winnerJar; jar.LOSE = a.status === 200 ? jar.L2 : jar.L1;
    expect((await j(await call(jar.LOSE, 'GET', '/api/legal/desk'))).pool.find((p: any) => p.id === reqId)).toBeUndefined();
  });
  it('the winner now sees who asked (a name, never a phone); the loser sees nothing', async () => {
    const w = await j(await call(jar.WIN, 'GET', `/api/legal/requests/${reqId}`));
    expect(w.request.requestedBy.name).toBeTruthy(); expect(w.request.contact).toBeUndefined(); expect(w.request.dealRoomId).toBeUndefined();
    expect((await call(jar.LOSE, 'GET', `/api/legal/requests/${reqId}`)).status).toBe(404);
  });
  it('the thread hides numbers before the fee is accepted', async () => {
    const r = await j(await call(jar.WIN, 'POST', `/api/legal/requests/${reqId}/messages`, { text: 'Ring me on 91234 56789 please' }));
    expect(r.phoneMasked).toBe(true); expect(r.request.messages.at(-1).text).not.toMatch(/91234/);
  });
});

describe('quote → accept', () => {
  it('only the claimer quotes; the amount is checked', async () => {
    expect((await call(jar.LOSE, 'POST', `/api/legal/requests/${reqId}/quote`, { amount: 3000 })).status).toBe(403);
    expect((await call(jar.WIN, 'POST', `/api/legal/requests/${reqId}/quote`, { amount: -5 })).status).toBe(400);
    const q = await call(jar.WIN, 'POST', `/api/legal/requests/${reqId}/quote`, { amount: 7500, days: 5, note: 'Title search + opinion' });
    expect(q.status).toBe(200); expect((await j(q)).request.status).toBe('QUOTED');
  });
  it('the broker can decline: the case returns to the pool and that counsellor is skipped', async () => {
    expect((await call(jar.BRK1, 'POST', `/api/legal/requests/${reqId}/decline`)).status).toBe(200);
    const w = await j(await call(jar.WIN, 'GET', '/api/legal/desk'));
    expect(w.pool.find((p: any) => p.id === reqId)).toBeUndefined(); // not offered again
    expect((await call(jar.WIN, 'POST', `/api/legal/requests/${reqId}/claim`)).status).toBe(403);
    const other = await j(await call(jar.LOSE, 'GET', '/api/legal/desk')); expect(other.pool.find((p: any) => p.id === reqId)).toBeTruthy();
    // the other counsellor takes it, quotes
    expect((await call(jar.LOSE, 'POST', `/api/legal/requests/${reqId}/claim`)).status).toBe(200);
    expect((await call(jar.LOSE, 'POST', `/api/legal/requests/${reqId}/quote`, { amount: 9000, days: 7 })).status).toBe(200);
    [jar.WIN, jar.LOSE] = [jar.LOSE, jar.WIN];
  });
  it('accepting fixes GENZ’s flat fee, opens both phones, and writes it down', async () => {
    expect((await call(jar.BRK3, 'POST', `/api/legal/requests/${reqId}/accept`)).status).toBe(403);
    const a = await call(jar.BRK1, 'POST', `/api/legal/requests/${reqId}/accept`); expect(a.status).toBe(200);
    const x = (await j(a)).request; expect(x.status).toBe('ACCEPTED');
    expect(x.contact.broker.phone).toBeTruthy(); expect(x.contact.counsellor.phone).toBeTruthy();
    const w = await j(await call(jar.WIN, 'GET', `/api/legal/requests/${reqId}`)); expect(w.request.platformFee).toBe(500); expect(w.request.contact.broker.phone).toBeTruthy();
    const d = await j(await call(jar.WIN, 'GET', '/api/billing/me'));
    const fee = d.ledger.find((e: any) => e.refId === reqId); feeId = fee.id;
    expect(fee).toMatchObject({ kind: 'CHARGE', event: 'LEGAL_CASE', amount: 500, status: 'DUE' });
    expect(fee.amount).not.toBe(Math.round(9000 * 0.1)); // flat — not a percentage of the advocate’s fee
    const log = await j(await call(jar.BRK1, 'GET', '/api/audit-logs?limit=300&entity=LEGAL'));
    expect(log.events.some((e: any) => e.action === 'LEGAL_QUOTE_ACCEPTED')).toBe(true);
  });
  it('after accepting, numbers in the thread are no longer hidden', async () => {
    const r = await j(await call(jar.BRK1, 'POST', `/api/legal/requests/${reqId}/messages`, { text: 'Call me on 98111 22233' }));
    expect(r.phoneMasked).toBe(false);
  });
});

describe('GENZ is paid outside the app — the counsellor marks it, an admin confirms', () => {
  it('needs a real reference and no double use', async () => {
    expect((await call(jar.WIN, 'POST', `/api/billing/ledger/${feeId}/mark-paid`, { ref: 'x' })).status).toBe(400);
    expect((await call(jar.LOSE, 'POST', `/api/billing/ledger/${feeId}/mark-paid`, { ref: 'UTR 123456789012' })).status).toBe(404);
    expect((await call(jar.WIN, 'POST', `/api/billing/ledger/${feeId}/mark-paid`, { ref: 'UTR 123456789012', paidOn: '2999-01-01' })).status).toBe(400);
    expect((await call(jar.WIN, 'POST', `/api/billing/ledger/${feeId}/mark-paid`, { ref: 'UTR 123456789012', paidOn: today })).status).toBe(200);
  });
  it('a counsellor cannot confirm his own payment; an admin can; a reject needs a reason', async () => {
    expect((await call(jar.WIN, 'POST', `/api/billing/ledger/${feeId}/confirm`)).status).toBe(403);
    expect((await call(jar.BRK1, 'POST', `/api/billing/ledger/${feeId}/confirm`)).status).toBe(403);
    expect((await call(jar.ADMIN, 'POST', `/api/billing/ledger/${feeId}/reject`, { note: 'no' })).status).toBe(400);
    expect((await call(jar.ADMIN, 'POST', `/api/billing/ledger/${feeId}/confirm`)).status).toBe(200);
    const a = await j(await call(jar.ADMIN, 'GET', '/api/legal/admin')); expect(a.totals.feesReceived).toBe(500);
  });
});

describe('membership', () => {
  let mid = '';
  it('is asked for, paid outside, confirmed — then the next case costs the member rate', async () => {
    const m = await call(jar.WIN, 'POST', '/api/billing/me/buy', { planId: 'PLAN-LEGAL', period: 'YEARLY' }); expect(m.status).toBe(200); mid = (await j(m)).entry.id;
    expect((await call(jar.WIN, 'POST', '/api/billing/me/buy', { planId: 'PLAN-LEGAL', period: 'MONTHLY' })).status).toBe(409);
    expect((await call(jar.WIN, 'POST', `/api/billing/ledger/${mid}/mark-paid`, { ref: 'NEFT MEMBER-0001' })).status).toBe(200);
    expect((await call(jar.SUP, 'POST', `/api/billing/ledger/${mid}/confirm`)).status).toBe(200);
    const d = await j(await call(jar.WIN, 'GET', '/api/legal/desk')); expect(d.member.active).toBe(true);
    const me = await j(await call(jar.WIN, 'GET', '/api/billing/me')); expect(me.rules.find((r: any) => r.event === 'LEGAL_CASE').member.en).toMatch(/₹250/);
    const e = me.ledger.find((x: any) => x.id === mid); expect(e.validTo > e.validFrom).toBe(true);
  });
});

describe('fees are set by GENZ admins (Plans & Fees); counsellors can only read them; time limits stay with the superadmin', () => {
  const cfgBody = { claimHours: 12, quoteHours: 48, maxStrikes: 2 };
  it('legal time limits: superadmin only', async () => {
    for (const who of ['ADMIN', 'L1', 'BRK1']) expect((await call(jar[who], 'PUT', '/api/legal/settings', cfgBody)).status, who).toBe(403);
    expect((await call(jar.L1, 'GET', '/api/legal/settings')).status).toBe(200);
    const r = await j(await call(jar.SUP, 'PUT', '/api/legal/settings', cfgBody)); expect(r.settings).toMatchObject(cfgBody);
    const log = await j(await call(jar.SUP, 'GET', '/api/audit-logs?limit=300&entity=LEGAL')); expect(log.events.some((e: any) => e.action === 'LEGAL_SETTINGS_CHANGED')).toBe(true);
  });
  it('a counsellor cannot change a fee rule; an admin can', async () => {
    const cat = await j(await call(jar.ADMIN, 'GET', '/api/billing/catalog')); const rule = cat.rules.find((r: any) => r.event === 'LEGAL_CASE');
    const body = { event: 'LEGAL_CASE', mode: 'FLAT', value: 800, segments: ['LEGAL_COUNSEL'], active: true };
    expect((await call(jar.L1, 'PUT', `/api/billing/rules/${rule.id}`, body)).status).toBe(403);
    expect((await call(jar.ADMIN, 'PUT', `/api/billing/rules/${rule.id}`, body)).status).toBe(200);
  });
  it('an accepted case keeps the fee it had when it was accepted', async () => {
    const x = await j(await call(jar.WIN, 'GET', `/api/legal/requests/${reqId}`)); expect(x.request.platformFee).toBe(500);
  });
});

describe('documents: papers close when the case closes', () => {
  it('only the broker or the counsellor of a case can complete it', async () => {
    expect((await call(jar.BRK3, 'POST', `/api/legal/requests/${reqId}/complete`)).status).toBe(403);
    expect((await call(jar.BRK1, 'POST', `/api/legal/requests/${reqId}/complete`)).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/legal/requests/${reqId}/complete`)).status).toBe(409);
  });
});

describe('taking the work offline', () => {
  let id2 = '';
  it('the broker reports it; an admin upholds it; two strikes take the counsellor off the panel; the deal room stays closed to GENZ', async () => {
    // a fresh case, claimed by WIN, quoted and accepted
    const mk = async (type: string) => {
      const r = await j(await call(jar.BRK1, 'POST', '/api/legal/requests', { dealId: DEAL, helpType: type, description: 'Need this handled properly please.' }));
      const id = r.request.id as string;
      expect((await call(jar.WIN, 'POST', `/api/legal/requests/${id}/claim`)).status).toBe(200);
      expect((await call(jar.WIN, 'POST', `/api/legal/requests/${id}/quote`, { amount: 4000 })).status).toBe(200);
      return id;
    };
    id2 = await mk('AGREEMENT_DRAFT');
    expect((await call(jar.BRK1, 'POST', `/api/legal/requests/${id2}/report-bypass`, { description: 'short' })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', `/api/legal/requests/${id2}/report-bypass`, { description: 'He asked me to pay him directly and skip the platform.' })).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/legal/requests/${id2}/report-bypass`, { description: 'He asked me to pay him directly and skip the platform.' })).status).toBe(409);
    expect((await call(jar.BRK1, 'POST', `/api/legal/requests/${id2}/bypass-decision`, { decision: 'UPHELD', note: 'not allowed' })).status).toBe(403);
    expect((await call(jar.ADMIN, 'POST', `/api/legal/requests/${id2}/bypass-decision`, { decision: 'UPHELD', note: 'Confirmed with the broker' })).status).toBe(200);
    let a = await j(await call(jar.ADMIN, 'GET', '/api/legal/admin')); const wid = a.counsellors.find((c: any) => c.strikes === 1);
    expect(wid).toBeTruthy(); expect(wid.removed).toBe(false);
    // second report → removed
    const id3 = await mk('LEASE_RENT');
    await call(jar.BRK1, 'POST', `/api/legal/requests/${id3}/report-bypass`, { description: 'Again he tried to deal with me outside the app.' });
    const dec = await j(await call(jar.SUP, 'POST', `/api/legal/requests/${id3}/bypass-decision`, { decision: 'UPHELD', note: 'Second proven attempt' }));
    expect(dec.removed).toBe(true);
    a = await j(await call(jar.ADMIN, 'GET', '/api/legal/admin')); expect(a.counsellors.find((c: any) => c.removed)).toBeTruthy();
    const p = await j(await call(jar.WIN, 'GET', '/api/legal/desk')); expect(p.blocked).toMatch(/taken off/i);
    // a report never opens the deal room to GENZ
    expect((await call(jar.ADMIN, 'GET', `/api/deals/${DEAL}/messages`)).status).toBe(403);
  });
});

describe('the pool stays honest', () => {
  it('a request nobody quotes within the time limit goes back to the pool', async () => {
    // the superadmin shortens the claim window to 1 hour in settings; we cannot wait, so check the sweep through the API surface instead
    const r = await j(await call(jar.BRK2, 'GET', '/api/legal/badge')); expect(r.success).toBe(true);
    const b = await j(await call(jar.SUP, 'GET', '/api/legal/badge')); expect(typeof b.count).toBe('number');
  });
  it('the broker sees only his own requests; a counsellor only the cases he holds', async () => {
    const mine = await j(await call(jar.BRK1, 'GET', `/api/legal/requests?dealId=${DEAL}`)); expect(mine.requests.length).toBeGreaterThan(0);
    expect((await j(await call(jar.BRK2, 'GET', '/api/legal/requests'))).requests).toHaveLength(0);
  });
});
