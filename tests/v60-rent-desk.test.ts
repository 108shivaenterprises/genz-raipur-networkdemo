import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { endOf, nextRent, dueReminder, flagsOf, daysTo, todayIst, addDays, waText, waLink, isDay } from '../src/shared/rentRules';
import { generateDealTasks } from '../server/dealTemplates';
import { PERMISSION_HI } from '../src/lib/permHi';
import { ROLE_PERMISSIONS } from '../server/permissions';

/**
 * v60 — Rent desk: a rented home after the deal — the agreed terms, the tenant's police verification (never the tenant's ID),
 * reminders before the agreement ends, renewal, notice, vacating and re-letting; names and numbers erased 180 days after the end.
 * A rent / lease deal room gets the rental duties (police verification, rent agreement…) instead of loan / registry.
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
async function boot(extra: Record<string, string> = {}) {
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true', ...extra }, stdio: 'ignore',
  });
  cfg = undefined;
  for (let i = 0; i < 160; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ B1: 'USR-BRK-001', B2: 'USR-BRK-002', OWN: 'USR-OWNER-001', BLD: 'USR-BUILDER-001', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
}
const stopServer = async () => { proc?.kill('SIGTERM'); for (let i = 0; i < 40 && proc.exitCode === null && proc.signalCode === null; i++) await new Promise(r => setTimeout(r, 100)); };
const base = (o: Record<string, unknown> = {}) => ({ place: '2 BHK flat, Shankar Nagar', ownerName: 'Ramesh Agrawal', ownerPhone: '9131200021', tenantName: 'Ankit Verma', tenantPhone: '9131200022', rent: 16000, deposit: 32000, startOn: todayIst(), months: 11, escalationPct: 5, noticeDays: 30, consent: true, ...o });
const T: Record<string, string> = {};

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v60-'));
  mkdirSync(path.join(dir, 'data'));
  await boot();
}, 90000);
afterAll(async () => { await stopServer(); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

describe('rules (pure)', () => {
  it('the end of a term, the yearly increase, the reminder that is due', () => {
    expect(endOf('2026-11-01', 11)).toBe('2027-09-30');
    expect(endOf('2026-01-15', 11)).toBe('2026-12-14');
    expect(endOf('2026-01-31', 1)).toBe('2026-02-28'); // the month has no 31st: the term ends on its last day
    expect(endOf('2027-12-01', 1)).toBe('2027-12-31');
    expect(nextRent(16000, 5)).toBe(16800); expect(nextRent(9500, 5)).toBe(9980); expect(nextRent(9500, 0)).toBe(9500);
    expect(isDay('2026-02-30')).toBe(false); expect(isDay('2026-02-28')).toBe(true);
    const now = Date.now(); const t = (endIn: number, reminded = {}) => ({ status: 'ACTIVE', startOn: addDays(todayIst(now), -300), endOn: addDays(todayIst(now), endIn), police: { status: 'DONE' }, reminded });
    expect(dueReminder(t(90), now)).toBeNull();
    expect(dueReminder(t(50), now)).toBe('d60');
    expect(dueReminder(t(20), now)).toBe('d30');
    expect(dueReminder(t(20, { d30: 'x' }), now)).toBeNull();
    expect(dueReminder(t(5, { d60: 'x', d30: 'x' }), now)).toBe('d7');
    expect(dueReminder(t(-2, { d7: 'x' }), now)).toBe('over');
    expect(dueReminder({ ...t(5), status: 'ENDED' }, now)).toBeNull();
    expect(flagsOf({ status: 'ACTIVE', startOn: addDays(todayIst(now), -10), endOn: addDays(todayIst(now), 3), police: { status: 'NOT_STARTED' } }, now)).toEqual(['ENDING_7', 'POLICE']);
    expect(flagsOf({ status: 'ACTIVE', startOn: addDays(todayIst(now), 10), endOn: addDays(todayIst(now), 300), police: { status: 'NOT_STARTED' } }, now)).toEqual([]); // not started yet
    expect(daysTo(addDays(todayIst(now), 7), now)).toBe(7);
  });
  it('WhatsApp lines: first names, the dates, the suggested rent — and the money never through GENZ', () => {
    const t = { place: '1 BHK, Telibandha', ownerName: 'Kavita Sahu', tenantName: 'Rohit Nair', rent: 9500, deposit: 19000, startOn: '2026-11-01', endOn: '2027-09-30', escalationPct: 5, noticeDays: 30 };
    const o = waText('OWNER_RENEW', t, true, 'Vikram'); expect(o).toMatch(/Kavita जी/); expect(o).not.toMatch(/Sahu/); expect(o).toMatch(/₹9,980/);
    const n = waText('TENANT_RENEW', t, false, 'Vikram'); expect(n).toMatch(/Rohit ji/); expect(n).toMatch(/30 days before/);
    expect(waText('POLICE', t, true, '')).toMatch(/थाने|Citizen Portal/);
    expect(waText('TERMS', t, false, '')).toMatch(/GENZ never holds money/);
    expect(waLink('hi', '9131200021')).toBe('https://wa.me/919131200021?text=hi'); expect(waLink('hi', '123')).toBe('https://wa.me/?text=hi');
  });
  it('a rent / lease deal room gets the rental duties; a sale keeps the sale ones', () => {
    const o = { introducingBrokerId: 'A', introducingBrokerName: 'A', closingBrokerId: 'B', closingBrokerName: 'B', ownerId: 'O', ownerName: 'O' };
    const rent = generateDealTasks('DEAL-9', { ...o, transactionType: 'Rent' });
    const by = (k: string) => rent.find(t => t.taskKey === k)!;
    expect(by('T10_STAMP_DUTY_REGISTRATION').title).toBe('Tenant Police Verification');
    expect(by('T9_AGREEMENT_DRAFTING').title).toMatch(/Rent Agreement/);
    for (const k of ['T6_LEGAL_TITLE_REVIEW', 'T7_SURVEY_BOUNDARY_VERIF', 'T8_LOAN_BANK_COORD', 'T11_REGISTRY_APPOINTMENT', 'T13_CONSTRUCTION_CONTRACTOR']) { expect(by(k).isApplicable, k).toBe(false); expect(by(k).notApplicableReason, k).toBeTruthy(); }
    const sale = generateDealTasks('DEAL-8', { ...o, transactionType: 'Sale' });
    expect(sale.find(t => t.taskKey === 'T8_LOAN_BANK_COORD')!.isApplicable).toBe(true);
    expect(sale.find(t => t.taskKey === 'T10_STAMP_DUTY_REGISTRATION')!.title).toBe('Stamp Duty & Registration Coordination');
  });
  it('only brokers have the Rent desk; the permission has a Hindi line', () => {
    expect(ROLE_PERMISSIONS.BROKER).toContain('rent:use');
    for (const r of ['PROPERTY_OWNER', 'BUYER_TENANT', 'DEVELOPER_BUILDER', 'LEGAL_COUNSEL', 'ADMIN'] as const) expect(ROLE_PERMISSIONS[r]).not.toContain('rent:use');
    expect(PERMISSION_HI['rent:use']).toMatch(/किराया डेस्क/);
  });
});

describe('recording a tenancy', () => {
  it('only a broker; the consent line is required; the terms are checked', async () => {
    for (const k of ['OWN', 'BLD', 'ADMIN']) expect((await call(jar[k], 'GET', '/api/rent')).status, k).toBe(403);
    expect((await call(undefined, 'GET', '/api/rent')).status).toBe(401);
    expect((await call(jar.B1, 'POST', '/api/rent', base({ consent: undefined }))).status).toBe(400);
    expect((await call(jar.B1, 'POST', '/api/rent', base({ ownerPhone: '12345' }))).status).toBe(400);
    expect((await call(jar.B1, 'POST', '/api/rent', base({ rent: 100 }))).status).toBe(400);
    expect((await call(jar.B1, 'POST', '/api/rent', base({ lockInMonths: 12, months: 11 }))).status).toBe(400);
    expect((await call(jar.B1, 'POST', '/api/rent', base({ startOn: addDays(todayIst(), -800) }))).status).toBe(400);
    expect((await call(jar.B1, 'POST', '/api/rent', base({ startOn: '2026-02-30' }))).status).toBe(400);
    expect((await call(jar.B1, 'POST', '/api/rent', base({ secret: 1 }))).status).toBe(400);
    // a sale deal room is not a rental
    const r = await call(jar.B1, 'POST', '/api/rent', base({ dealRoomId: 'DEAL-2026-001' }));
    expect(r.status).toBe(409); expect((await j(r)).code).toBe('NOT_RENT');
  });
  it('by hand: the end date follows, numbers are kept as 10 digits, nothing is flagged on day one', async () => {
    const r = await call(jar.B1, 'POST', '/api/rent', base({ ownerPhone: '+91 91312 00021' }));
    expect(r.status, await r.clone().text()).toBe(200);
    const t = (await j(r)).tenancy; T.main = t.id;
    expect(t.endOn).toBe(endOf(todayIst(), 11)); expect(t.ownerPhone).toBe('9131200021'); expect(t.police.status).toBe('NOT_STARTED');
    expect(t.flags).toEqual(['POLICE']); // it started today: police verification is pending from today
    expect(t.nextRent).toBe(16800); expect(t.status).toBe('ACTIVE');
  });
  it('from my own rent listing (another broker cannot use it); one running tenancy per home', async () => {
    const p = await call(jar.B1, 'POST', '/api/properties', {
      title: '1 BHK on rent near Telibandha lake', description: 'A small furnished flat for rent, two minutes from the lake.',
      propertyType: 'Residential Flat', transactionType: 'Rent', state: 'Chhattisgarh', city: 'Raipur', locality: 'Telibandha',
      pincode: '492006', addressHidden: 'Flat 3, Lake View Apartments, Telibandha', askingPrice: 9500, ownerApprovedNetPrice: 9000,
      ownerName: 'Kavita Sahu', ownerPhone: '9131200023', tags: [],
    });
    expect([200, 201], await p.clone().text()).toContain(p.status);
    const prop = (await j(p)).property; T.prop = prop.id;
    const list = await j(await call(jar.B1, 'GET', '/api/rent'));
    const src = list.sources.find((s: any) => s.propertyId === prop.id);
    expect(src?.kind).toBe('LISTING'); expect(src.ownerName).toBe('Kavita Sahu');
    expect((await call(jar.B2, 'POST', '/api/rent', base({ propertyId: prop.id }))).status).toBe(404);
    const r = await call(jar.B1, 'POST', '/api/rent', base({ propertyId: prop.id, place: '1 BHK, Telibandha', ownerName: 'Kavita Sahu', ownerPhone: '9131200023', tenantName: 'Rohit Nair', tenantPhone: '9131200024', rent: 9500, deposit: 19000, startOn: addDays(todayIst(), -10) }));
    expect(r.status, await r.clone().text()).toBe(200);
    T.listing = (await j(r)).tenancy.id;
    const dup = await call(jar.B1, 'POST', '/api/rent', base({ propertyId: prop.id }));
    expect(dup.status).toBe(409); expect((await j(dup)).code).toBe('DUPLICATE');
    expect((await j(await call(jar.B1, 'GET', '/api/rent'))).sources.some((s: any) => s.propertyId === prop.id)).toBe(false);
  });
  it('another broker never sees or touches it', async () => {
    expect((await j(await call(jar.B2, 'GET', '/api/rent'))).items.some((t: any) => t.id === T.main)).toBe(false);
    for (const [m, u, b] of [['GET', `/api/rent/${T.main}`, undefined], ['PATCH', `/api/rent/${T.main}`, { rent: 1000 }], ['POST', `/api/rent/${T.main}/renew`, {}], ['DELETE', `/api/rent/${T.main}`, undefined], ['GET', `/api/rent/${T.main}/sheet`, undefined]] as const)
      expect((await call(jar.B2, m, u, b)).status, `${m} ${u}`).toBe(404);
  });
});

describe('police verification, terms, renewal, notice, vacating', () => {
  it('police: the step, date, station and acknowledgement no. — an Aadhaar-like number is refused', async () => {
    const bad = await call(jar.B1, 'POST', `/api/rent/${T.main}/police`, { status: 'SUBMITTED', on: todayIst(), ref: '2345 6789 0124' });
    expect(bad.status).toBe(400); expect((await j(bad)).code).toBe('LOOKS_LIKE_AADHAAR');
    expect((await call(jar.B1, 'POST', `/api/rent/${T.main}/police`, { status: 'DONE' })).status).toBe(400); // when?
    expect((await call(jar.B1, 'POST', `/api/rent/${T.main}/police`, { status: 'DONE', on: addDays(todayIst(), 2) })).status).toBe(400); // future
    const r = await j(await call(jar.B1, 'POST', `/api/rent/${T.main}/police`, { status: 'DONE', on: todayIst(), station: 'Telibandha thana', ref: 'CG-TV-48211' }));
    expect(r.tenancy.police).toMatchObject({ status: 'DONE', station: 'Telibandha thana', ref: 'CG-TV-48211' }); expect(r.tenancy.flags).toEqual([]);
  });
  it('terms change with a history line; the end moves with the start', async () => {
    const r = await j(await call(jar.B1, 'PATCH', `/api/rent/${T.main}`, { agreement: 'SIGNED', stampRef: 'IN-CG-1234', meterNote: 'Electricity 14231', months: 12 }));
    expect(r.tenancy.agreement).toBe('SIGNED'); expect(r.tenancy.endOn).toBe(endOf(todayIst(), 12));
    expect(r.tenancy.history.at(-1).what).toMatch(/agreement: NONE → SIGNED/);
    expect((await call(jar.B1, 'PATCH', `/api/rent/${T.main}`, { lockInMonths: 24 })).status).toBe(400);
  });
  it('renew: from the day after the end, with the yearly increase by default; a new agreement is needed', async () => {
    const before = (await j(await call(jar.B1, 'GET', `/api/rent/${T.main}`))).tenancy;
    const r = await j(await call(jar.B1, 'POST', `/api/rent/${T.main}/renew`, { months: 11 }));
    expect(r.tenancy.startOn).toBe(addDays(before.endOn, 1)); expect(r.tenancy.endOn).toBe(endOf(addDays(before.endOn, 1), 11));
    expect(r.tenancy.rent).toBe(16800); expect(r.tenancy.agreement).toBe('NONE'); expect(r.tenancy.renewals).toHaveLength(1);
    expect(r.tenancy.police.status).toBe('DONE'); // the same tenant: no new police verification
    expect((await call(jar.B1, 'DELETE', `/api/rent/${T.main}`)).status).toBe(409); // a renewed tenancy is real work — not deleted
  });
  it('notice → the home should be empty after the notice days; vacating ends it (not a future day)', async () => {
    expect((await call(jar.B1, 'POST', `/api/rent/${T.listing}/notice`, { on: addDays(todayIst(), 1), by: 'TENANT' })).status).toBe(400);
    const n = await j(await call(jar.B1, 'POST', `/api/rent/${T.listing}/notice`, { on: todayIst(), by: 'TENANT' }));
    expect(n.tenancy.status).toBe('NOTICE'); expect(n.tenancy.vacateBy).toBe(addDays(todayIst(), 30)); expect(n.tenancy.flags).toContain('NOTICE');
    expect((await call(jar.B1, 'POST', `/api/rent/${T.listing}/vacate`, { on: addDays(todayIst(), 3) })).status).toBe(400);
    const v = await j(await call(jar.B1, 'POST', `/api/rent/${T.listing}/vacate`, { on: todayIst(), depositNote: 'Full deposit returned' }));
    expect(v.tenancy.status).toBe('ENDED'); expect(v.tenancy.flags).toEqual([]); expect(v.eraseOn).toBe(addDays(todayIst(), 180));
    expect(v.tenancy.property).toMatchObject({ id: T.prop, mine: true });
    expect((await call(jar.B1, 'POST', `/api/rent/${T.listing}/renew`, {})).status).toBe(409);
  });
  it('the term sheet prints in Hindi + English and says it is not the agreement', async () => {
    const r = await call(jar.B1, 'GET', `/api/rent/${T.main}/sheet`);
    expect(r.status).toBe(200); expect(r.headers.get('content-type')).toMatch(/text\/html/);
    const h = await r.text();
    expect(h).toMatch(/₹16,800/); expect(h).toMatch(/किराये की तय शर्तें/); expect(h).toMatch(/This is not the rent agreement/); expect(h).toMatch(/ये किराया अनुबंध नहीं है/);
    expect(h).not.toMatch(/<script>(?!<)/); // no inline script (the print button is a script file)
    expect((await call(undefined, 'GET', '/api/rent/sheet.js')).status).toBe(200);
  });
  it('the broker’s home counts what needs him', async () => {
    const r = await call(jar.B1, 'POST', '/api/rent', base({ place: 'Shop 7, Pandri', ownerName: 'Harish Jain', tenantName: 'Meena Traders', rent: 22000, deposit: 66000, startOn: addDays(todayIst(), -320), months: 11 }));
    expect(r.status, await r.clone().text()).toBe(200);
    const t = (await j(r)).tenancy; T.ending = t.id;
    expect(daysTo(t.endOn)).toBeGreaterThan(7); expect(daysTo(t.endOn)).toBeLessThanOrEqual(30);
    expect(t.flags).toContain('ENDING_30'); expect(t.flags).toContain('POLICE');
    expect(t.reminded.d60 && t.reminded.d30).toBeTruthy(); expect(t.reminded.d7).toBeUndefined(); // recorded late: the passed reminders are not sent in a burst
    const h = await j(await call(jar.B1, 'GET', '/api/home/broker'));
    expect(h.counts.rentEnding).toBeGreaterThanOrEqual(1); expect(h.counts.rentPolice).toBeGreaterThanOrEqual(1);
    const list = await j(await call(jar.B1, 'GET', '/api/rent'));
    expect(list.items[0].id).toBe(T.ending); // the most urgent first
  });
});

describe('the hourly sweep: reminders to the broker, and names erased 180 days after the end', () => {
  it('a tenancy that ended long ago is erased; reminders and the police nudge go once', async () => {
    // an old rental that ended 200 days ago
    const old = await call(jar.B1, 'POST', '/api/rent', base({ place: 'Old flat, Pachpedi Naka', ownerName: 'Sunil Lalwani', tenantName: 'Neha Gupta', startOn: addDays(todayIst(), -700), months: 11 }));
    expect(old.status, await old.clone().text()).toBe(200); T.old = (await j(old)).tenancy.id;
    expect((await call(jar.B1, 'POST', `/api/rent/${T.old}/vacate`, { on: addDays(todayIst(), -200) })).status).toBe(200);
    expect((await call(jar.B1, 'PUT', '/api/push/prefs', { quiet: false, deals: true })).status).toBe(200);
    // the reminders of the ending one were marked when it was recorded (no burst of old alerts) — clear them as if days had passed
    await stopServer();
    const file = path.join(dir, 'data', 'database.json');
    const db = JSON.parse(readFileSync(file, 'utf8'));
    const e = db.tenancies.find((t: any) => t.id === T.ending); e.reminded = {};
    writeFileSync(file, JSON.stringify(db));
    await boot({ RENT_REMIND_ANY_HOUR: 'true' });
    const items = (await j(await call(jar.B1, 'GET', '/api/rent'))).items;
    const o = items.find((t: any) => t.id === T.old);
    expect(o.erasedAt).toBeTruthy(); expect(o.ownerName).toBe('Owner'); expect(o.tenantName).toBe('Tenant'); expect(o.ownerPhone).toBeUndefined(); expect(o.tenantPhone).toBeUndefined();
    expect(o.rent).toBe(16000); // the anonymous numbers stay
    const recent = (await j(await call(jar.B1, 'GET', '/api/push/recent'))).alerts;
    const end = recent.filter((a: any) => /^Rent agreement ends in \d+ day\(s\) · Shop 7, Pandri/.test(a.title));
    expect(end).toHaveLength(1); expect(end[0].url).toBe('/?tab=rentdesk'); expect(end[0].body).toMatch(/Harish and Meena/); expect(end[0].hi.title).toMatch(/किराया अनुबंध/);
    expect(recent.filter((a: any) => a.title === 'Police verification pending · Shop 7, Pandri')).toHaveLength(1);
    const e2 = items.find((t: any) => t.id === T.ending);
    expect(e2.reminded.d30).toBeTruthy(); expect(e2.reminded.police).toBeTruthy();
    expect(recent.some((a: any) => /Old flat/.test(a.title))).toBe(false);
  });
});
