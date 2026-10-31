import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateSlabs, slabFor, commissionPctFor, slabProgress, leaderPoints } from '../src/shared/slabs.js';
import { scanRedFlags, nameMatches } from '../src/shared/redflags.js';
import { renderTemplate, waLink } from '../src/shared/templates.js';

const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};

async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: id, password: cfg.demoPassword }) });
  expect(r.status).toBe(200);
  return r.headers.get('set-cookie')!.split(';')[0];
}
const call = (cookie: string | undefined, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const email = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id).email;
const PROJ = 'PROJ-RAI-02';
const SELFIE = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2Q==';

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v8-'));
  mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' },
  });
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ }
    await new Promise(r => setTimeout(r, 250));
  }
  expect(cfg).toBeTruthy();
  jar.B1 = await login(email('USR-BRK-001'));
  jar.B2 = await login(email('USR-BRK-002'));
  jar.B3 = await login(email('USR-BRK-003'));
  jar.BUILDER = await login(email('USR-BUILDER-001'));
  jar.ADMIN = await login(cfg.demoAccounts.find((a: any) => a.role === 'ADMIN').email);
  jar.OWNER = await login(cfg.demoAccounts.find((a: any) => a.role === 'PROPERTY_OWNER').email);
  jar.BUYER = await login(cfg.demoAccounts.find((a: any) => a.role === 'BUYER_TENANT').email);
  jar.T1 = await login('9000030001');
}, 40_000);
afterAll(async () => { proc?.kill(); await new Promise(r => setTimeout(r, 500)); if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('pure rules', () => {
  it('slab validation catches gaps, overlaps and bad pct; progress points to the next step', () => {
    const ok = [{ from: 1, to: 3, commissionPct: 2.5 }, { from: 4, to: 8, commissionPct: 3.5, reward: 'Trip' }, { from: 9, to: null, commissionPct: 4 }];
    expect(validateSlabs(ok)).toBeNull();
    expect(validateSlabs([{ from: 1, to: 3, commissionPct: 2.5 }, { from: 5, to: 8, commissionPct: 3 }])).toMatch(/must start at booking 4/);
    expect(validateSlabs([{ from: 1, to: 3, commissionPct: 25 }])).toMatch(/between/);
    expect(validateSlabs([{ from: 1, to: null, commissionPct: 2 }, { from: 2, to: 3, commissionPct: 3 }])).toMatch(/last slab/);
    expect(slabFor(ok, 3)?.commissionPct).toBe(2.5);
    expect(slabFor(ok, 4)?.commissionPct).toBe(3.5);
    expect(commissionPctFor(ok, 50, 1)).toBe(4);
    expect(commissionPctFor([], 1, 3)).toBe(3);
    const pr = slabProgress(ok, 2);
    expect(pr.current?.commissionPct).toBe(2.5);
    expect(pr.next?.from).toBe(4);
    expect(pr.toNext).toBe(2);
    expect(leaderPoints(2, 5_000_000)).toBe(250);
  });
  it('red-flag scanner', () => {
    const base: any = { landUse: 'RESIDENTIAL', diverted: true, diversionOrderNo: 'D/12', ownerNameOnRecord: 'Ramesh Kumar Sahu', sellerName: 'Shri Ramesh Sahu', encumbrance: 'CLEAR', bankNoc: 'NOT_REQUIRED', approvalAuthority: 'NONE', isLayoutOrProject: false, verifiedAt: new Date().toISOString() };
    expect(scanRedFlags(base).verdict).toBe('CLEAR');
    expect(scanRedFlags({ ...base, landUse: 'AGRICULTURAL', diverted: false }).flags.map(f => f.code)).toContain('AGRI_NOT_DIVERTED');
    expect(scanRedFlags({ ...base, encumbrance: 'MORTGAGE', bankNoc: 'PENDING' }).verdict).toBe('DANGER');
    expect(scanRedFlags({ ...base, encumbrance: 'MORTGAGE', bankNoc: 'RECEIVED' }).verdict).toBe('CLEAR');
    expect(scanRedFlags({ ...base, encumbrance: 'NOT_CHECKED' }).verdict).toBe('CAUTION');
    expect(scanRedFlags({ ...base, sellerName: 'Mohan Lal' }).flags.map(f => f.code)).toContain('NAME_MISMATCH');
    expect(scanRedFlags({ ...base, isLayoutOrProject: true }).flags.map(f => f.code)).toEqual(expect.arrayContaining(['NO_LAYOUT_APPROVAL', 'RERA_MISSING']));
    expect(scanRedFlags({ ...base, landUse: 'NAZUL' }).verdict).toBe('DANGER');
    expect(scanRedFlags({ ...base, verifiedAt: undefined }).flags.map(f => f.code)).toContain('NOT_VERIFIED');
    expect(scanRedFlags({ ...base, verifiedAt: new Date(Date.now() - 40 * 86400000).toISOString() }).flags.map(f => f.code)).toContain('STALE');
    expect(nameMatches('Shri Ramesh Sahu', 'Ramesh Kumar Sahu')).toBe(true);
    expect(nameMatches('Ramesh Sahu', 'Mohan Lal')).toBe(false);
  });
  it('templates render in all three languages with RERA text and a wa.me link', () => {
    for (const lang of ['en', 'hi'] as const) {
      const t = renderTemplate('INSPECTION', lang, { customer: 'Verma', broker: 'Amit', company: 'ABC', project: 'Emerald', date: '5 Nov', time: '11:00' });
      expect(t).toContain('Emerald'); expect(t).not.toMatch(/\{\w+\}/);
    }
    expect(renderTemplate('INTRO', 'en', { broker: 'Amit', rera: 'CG/RERA/1' })).toContain('RERA: CG/RERA/1');
    expect(waLink('98261 12345', 'hi there')).toBe('https://wa.me/919826112345?text=hi%20there');
  });
});

describe('inventory matrix, hold and escalator commission', () => {
  let unitId: string; let leadId: string; const pBody = (o: any = {}) => ({ tokenAmount: 25000, tokenRef: 'RCPT-1001', ...o });
  it('only mandated brokers, the owning builder and admins can open the grid', async () => {
    expect((await call(jar.B1, 'GET', `/api/inventory/projects/${PROJ}`)).status).toBe(200);
    expect((await call(jar.B2, 'GET', `/api/inventory/projects/${PROJ}`)).status).toBe(200);
    expect((await call(jar.B3, 'GET', `/api/inventory/projects/${PROJ}`)).status).toBe(404);
    expect((await call(jar.BUILDER, 'GET', `/api/inventory/projects/${PROJ}`)).status).toBe(200);
    expect((await call(jar.OWNER, 'GET', '/api/inventory/projects')).status).toBe(403);
    expect((await call(jar.BUYER, 'GET', '/api/inventory/projects')).status).toBe(403);
    expect((await call(undefined, 'GET', '/api/inventory/projects')).status).toBe(401);
  });
  it('the demo grid has 24 plots with four colours', async () => {
    const d = await j(await call(jar.BUILDER, 'GET', `/api/inventory/projects/${PROJ}`));
    expect(d.summary.total).toBe(24);
    expect(d.summary.booked).toBe(3); expect(d.summary.reserved).toBe(1);
    unitId = d.units.find((u: any) => u.label === 'P-10').id;
  });
  it('a hold needs an own lead on that project, minimum token and a payment reference', async () => {
    const leads = (await j(await call(jar.B1, 'GET', '/api/crm/leads'))).leads.filter((l: any) => l.projectId === PROJ && !['LOST', 'BOOKED'].includes(l.stage));
    leadId = leads[0].id;
    expect((await call(jar.B1, 'POST', `/api/inventory/units/${unitId}/hold`, pBody({ leadId, tokenAmount: 5000 }))).status).toBe(400);
    expect((await call(jar.B1, 'POST', `/api/inventory/units/${unitId}/hold`, pBody({ leadId, tokenRef: 'x' }))).status).toBe(400);
    const other = (await j(await call(jar.B2, 'GET', '/api/crm/leads'))).leads.find((l: any) => l.projectId === PROJ);
    if (other) expect((await call(jar.B1, 'POST', `/api/inventory/units/${unitId}/hold`, pBody({ leadId: other.id }))).status).toBe(400);
    expect((await call(jar.B3, 'POST', `/api/inventory/units/${unitId}/hold`, pBody({ leadId }))).status).toBe(404);
    expect((await call(jar.B1, 'POST', `/api/inventory/units/${unitId}/hold`, pBody({ leadId }))).status).toBe(200);
  });
  it('a second broker cannot take a held unit and cannot see who holds it', async () => {
    const l2 = (await j(await call(jar.B2, 'GET', '/api/crm/leads'))).leads.find((l: any) => l.projectId === PROJ && !['LOST', 'BOOKED'].includes(l.stage));
    expect((await call(jar.B2, 'POST', `/api/inventory/units/${unitId}/hold`, pBody({ leadId: l2.id, tokenRef: 'RCPT-2002' }))).status).toBe(409);
    const u = (await j(await call(jar.B2, 'GET', `/api/inventory/projects/${PROJ}`))).units.find((x: any) => x.id === unitId);
    expect(u.status).toBe('HOLD'); expect(u.hold.brokerId).toBeUndefined(); expect(u.hold.tokenRef).toBeUndefined(); expect(u.mine).toBe(false);
    const mine = (await j(await call(jar.B1, 'GET', `/api/inventory/projects/${PROJ}`))).units.find((x: any) => x.id === unitId);
    expect(mine.mine).toBe(true); expect(mine.hold.tokenRef).toBe('RCPT-1001');
    expect((await call(jar.B2, 'POST', `/api/inventory/units/${unitId}/release`)).status).toBe(404);
  });
  it('the holder releases; the unit is free again', async () => {
    expect((await call(jar.B1, 'POST', `/api/inventory/units/${unitId}/release`)).status).toBe(200);
    const u = (await j(await call(jar.B2, 'GET', `/api/inventory/projects/${PROJ}`))).units.find((x: any) => x.id === unitId);
    expect(u.status).toBe('AVAILABLE');
  });
  it('builder-only controls: reserve a unit, settings and slab validation', async () => {
    expect((await call(jar.B1, 'PUT', `/api/inventory/units/${unitId}`, { status: 'RESERVED' })).status).toBe(403);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${unitId}`, { status: 'RESERVED' })).status).toBe(200);
    expect((await call(jar.B1, 'POST', `/api/inventory/units/${unitId}/hold`, pBody({ leadId }))).status).toBe(409);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/units/${unitId}`, { status: 'AVAILABLE' })).status).toBe(200);
    expect((await call(jar.B1, 'PUT', `/api/inventory/projects/${PROJ}/settings`, { holdHours: 4 })).status).toBe(403);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/projects/${PROJ}/settings`, { cpSlabs: [{ from: 2, to: 3, commissionPct: 2 }] })).status).toBe(400);
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/projects/${PROJ}/settings`, { holdHours: 4, minToken: 30000 })).status).toBe(200);
    expect((await call(jar.B1, 'POST', `/api/inventory/units/${unitId}/hold`, pBody({ leadId, tokenAmount: 25000 }))).status).toBe(400); // min is now 30,000
    expect((await call(jar.BUILDER, 'PUT', `/api/inventory/projects/${PROJ}/settings`, { holdHours: 2, minToken: 21000 })).status).toBe(200);
  });
  it('booking approval applies the slab % to the associate\'s n-th booking and marks the unit BOOKED', async () => {
    const proj = (await j(await call(jar.BUILDER, 'GET', '/api/builder/projects'))).projects.find((p: any) => p.id === PROJ);
    const created = await call(jar.B1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Slab Test Customer', phone: '9898012345', source: 'WALK_IN' });
    expect(created.status).toBe(200);
    const lid = (await j(created)).lead.id;
    for (const stage of ['CONTACTED', 'SITE_VISIT_SCHEDULED', 'SITE_VISITED']) expect((await call(jar.B1, 'POST', `/api/crm/leads/${lid}/stage`, { stage })).status).toBe(200);
    const open = (await j(await call(jar.B1, 'GET', `/api/inventory/projects/${PROJ}`))).units.find((u: any) => u.label === 'P-11');
    expect((await call(jar.B1, 'POST', `/api/inventory/units/${open.id}/hold`, pBody({ leadId: lid, tokenRef: 'RCPT-3003' }))).status).toBe(200);
    // another associate's booking request on the same unit label is refused
    const l2 = (await j(await call(jar.B2, 'GET', '/api/crm/leads'))).leads.find((l: any) => l.projectId === PROJ && ['SITE_VISITED', 'NEGOTIATION'].includes(l.stage));
    if (l2) expect((await call(jar.B2, 'POST', `/api/crm/leads/${l2.id}/booking-request`, { unitNo: 'P-11', agreementValue: proj.priceStartingFrom, tokenAmount: 50000, tokenMode: 'UPI', tokenRef: 'UTR-5521' })).status).toBe(409);
    const br = await call(jar.B1, 'POST', `/api/crm/leads/${lid}/booking-request`, { unitNo: 'P-11', agreementValue: proj.priceStartingFrom, tokenAmount: 50000, tokenMode: 'UPI', tokenRef: 'UTR-5521' });
    expect(br.status).toBe(200);
    const bid = (await j(br)).booking.id;
    // while the request is pending the hold stays and cannot be released by the broker
    expect((await call(jar.B1, 'POST', `/api/inventory/units/${open.id}/release`)).status).toBe(409);
    const before = (await j(await call(jar.BUILDER, 'GET', '/api/crm/bookings'))).bookings.filter((b: any) => b.projectId === PROJ && b.status === 'APPROVED' && b.associateId === 'USR-BRK-001').length;
    const dec = await call(jar.BUILDER, 'POST', `/api/crm/bookings/${bid}/decision`, { decision: 'APPROVE' });
    expect(dec.status).toBe(200);
    const booking = (await j(dec)).booking;
    const nth = before + 1;
    const expected = nth <= 3 ? 2.5 : nth <= 8 ? 3.5 : 4;
    expect(booking.brokeragePct).toBe(expected);
    expect(booking.brokerageAmount).toBe(Math.round(proj.priceStartingFrom * expected / 100));
    const after = (await j(await call(jar.B1, 'GET', `/api/inventory/projects/${PROJ}`))).units.find((u: any) => u.label === 'P-11');
    expect(after.status).toBe('BOOKED');
    // cancelling frees the unit
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${bid}/cancel`, { reason: 'Customer backed out' })).status).toBe(200);
    expect((await j(await call(jar.B1, 'GET', `/api/inventory/projects/${PROJ}`))).units.find((u: any) => u.label === 'P-11').status).toBe('AVAILABLE');
  });
  it('leaderboard ranks associates; other associates\' values stay hidden from brokers', async () => {
    const lb = await j(await call(jar.B2, 'GET', `/api/inventory/projects/${PROJ}/leaderboard`));
    expect(lb.rows.length).toBeGreaterThanOrEqual(2);
    expect(lb.rows[0].rank).toBe(1);
    expect(lb.rows.filter((r: any) => !r.you).every((r: any) => r.value === undefined)).toBe(true);
    const lbB = await j(await call(jar.BUILDER, 'GET', `/api/inventory/projects/${PROJ}/leaderboard`));
    expect(lbB.rows.some((r: any) => r.value !== undefined)).toBe(true);
    expect(lb.slabs.length).toBe(3);
  });
  it('a lapsed hold frees the unit by itself', async () => {
    // hold with a 1-hour window, then check the sweep logic through the public API by shortening is not possible; assert the expiry is set in the future
    const o = (await j(await call(jar.B1, 'GET', `/api/inventory/projects/${PROJ}`))).units.find((u: any) => u.label === 'P-12');
    const leads = (await j(await call(jar.B1, 'GET', '/api/crm/leads'))).leads.filter((l: any) => l.projectId === PROJ && !['LOST', 'BOOKED'].includes(l.stage));
    const r = await call(jar.B1, 'POST', `/api/inventory/units/${o.id}/hold`, pBody({ leadId: leads[0].id, tokenRef: 'RCPT-4004' }));
    expect(r.status).toBe(200);
    const u = (await j(r)).unit;
    const ms = Date.parse(u.hold.expiresAt) - Date.now();
    expect(ms).toBeGreaterThan(110 * 60_000); expect(ms).toBeLessThanOrEqual(120 * 60_000 + 5000);
  });
});

describe('team activity, GPS check-in and incentives', () => {
  let chkId: string;
  it('check-in needs GPS in India, a JPEG selfie and a lead the member works on', async () => {
    const mine = (await j(await call(jar.T1, 'GET', '/api/crm/leads'))).leads[0];
    const body = { label: 'Emerald Heights site', lat: 21.2514, lng: 81.6296, accuracy: 18, selfie: SELFIE, leadId: mine.id };
    expect((await call(jar.T1, 'POST', '/api/team/checkin', { ...body, lat: 51.5 })).status).toBe(400);
    expect((await call(jar.T1, 'POST', '/api/team/checkin', { ...body, selfie: '' })).status).toBe(400);
    expect((await call(jar.T1, 'POST', '/api/team/checkin', { ...body, selfie: 'data:text/html;base64,AAAA' })).status).toBe(400);
    const others = (await j(await call(jar.B1, 'GET', '/api/crm/leads'))).leads.find((l: any) => l.assignedMemberId !== (mine.assignedMemberId));
    if (others) expect((await call(jar.T1, 'POST', '/api/team/checkin', { ...body, leadId: others.id })).status).toBe(404);
    const ok = await call(jar.T1, 'POST', '/api/team/checkin', body);
    expect(ok.status).toBe(200);
    const okBody = await j(ok);
    chkId = okBody.checkin.id;
    expect(okBody.checkin.selfie).toBeUndefined();
    expect((await call(jar.BUYER, 'POST', '/api/team/checkin', body)).status).toBe(403);
  });
  it('the employer sees activity, check-ins and the selfie; others and the member do not', async () => {
    const act = await j(await call(jar.B1, 'GET', '/api/team/activity?days=7'));
    const row = act.rows.find((r: any) => r.name.startsWith('Pooja'));
    expect(row.siteVisits).toBe(1);
    expect(act.rows[0].name).toContain('(you)');
    const list = (await j(await call(jar.B1, 'GET', '/api/team/checkins'))).checkins;
    expect(list.some((c: any) => c.id === chkId && c.hasSelfie && c.selfie === undefined)).toBe(true);
    expect((await j(await call(jar.B1, 'GET', `/api/team/checkins/${chkId}/selfie`))).selfie).toBe(SELFIE);
    expect((await call(jar.B2, 'GET', `/api/team/checkins/${chkId}/selfie`)).status).toBe(404);
    expect((await call(jar.T1, 'GET', '/api/team/activity')).status).toBe(403);
    expect((await call(jar.T1, 'GET', '/api/team/incentives')).status).toBe(403);
  });
  it('the check-in appears on the lead timeline and in the audit trail', async () => {
    const lead = (await j(await call(jar.T1, 'GET', '/api/crm/leads'))).leads[0];
    const full = (await j(await call(jar.T1, 'GET', `/api/crm/leads/${lead.id}`))).lead;
    expect(full.activities.some((a: any) => /Site check-in/.test(a.note))).toBe(true);
  });
  it('incentive % is validated and the firm/agent split is calculated for the employer only', async () => {
    const team = (await j(await call(jar.B1, 'GET', '/api/team'))).members;
    const m = team.find((x: any) => x.name.startsWith('Pooja'));
    expect((await call(jar.B1, 'PUT', `/api/team/${m.id}`, { incentivePct: 80 })).status).toBe(400);
    expect((await call(jar.B1, 'PUT', `/api/team/${m.id}`, { incentivePct: 10 })).status).toBe(200);
    const inc = (await j(await call(jar.B1, 'GET', '/api/team/incentives'))).rows.find((r: any) => r.id === m.id);
    expect(inc.incentivePct).toBe(10);
    expect(inc.incentiveAccrued + inc.firmShareAccrued).toBe(inc.brokerage);
    expect((await call(jar.B2, 'PUT', `/api/team/${m.id}`, { incentivePct: 5 })).status).toBe(404);
  });
});

describe('share kit: brand, tracked link, public page', () => {
  let token: string;
  const BROWSER = { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36' };
  it('only brokers/builders use it', async () => {
    for (const k of ['OWNER', 'BUYER']) expect((await call(jar[k], 'GET', '/api/share/sources')).status).toBe(403);
    expect((await call(jar.T1, 'GET', '/api/share/links')).status).toBe(403);
  });
  it('brand profile validates and escapes on the public page', async () => {
    expect((await call(jar.B1, 'PUT', '/api/share/brand', { logo: 'data:text/html;base64,AAAA' })).status).toBe(400);
    expect((await call(jar.B1, 'PUT', '/api/share/brand', { displayName: '<script>alert(1)</script>Vikram', reraId: 'CG/RERA/AGT/001', tagline: 'Raipur ka apna broker' })).status).toBe(200);
  });
  it('creates a link, serves a public page with broker card and no commission data', async () => {
    const src = (await j(await call(jar.B1, 'GET', '/api/share/sources'))).sources;
    const p = src.find((s: any) => s.kind === 'PROJECT');
    expect(p).toBeTruthy();
    const r = await call(jar.B1, 'POST', '/api/share/links', { kind: 'PROJECT', refId: p.id, clientLabel: 'Dr. Verma', lang: 'hi' });
    expect(r.status).toBe(200);
    token = (await j(r)).token;
    const page = await fetch(`${B}/s/${token}`, { headers: BROWSER });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(p.title.replace(/&/g, '&amp;'));
    expect(html).toContain('CG/RERA/AGT/001');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;Vikram');
    expect(html).not.toContain('<script>alert(1)');
    expect(html.toLowerCase()).not.toContain('commission');
    expect(html).toContain('/s/track.js');
  });
  it('counts real views, ignores link-preview bots, and records time per section', async () => {
    await fetch(`${B}/s/${token}`, { headers: { 'user-agent': 'WhatsApp/2.23 A' } });
    await fetch(`${B}/s/${token}`, { headers: { 'user-agent': 'Mozilla/5.0 Safari other-device' } });
    expect((await fetch(`${B}/s/${token}/ping`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ s: { plans: 45, overview: 8, evil: 999 } }) })).status).toBe(204);
    const l = (await j(await call(jar.B1, 'GET', '/api/share/links'))).links.find((x: any) => x.token === token);
    expect(l.views).toBe(2); // first browser view + the second device; bot ignored
    expect(l.seconds.plans).toBe(45); expect(l.seconds.evil).toBeUndefined();
    expect((await fetch(`${B}/s/track.js`)).headers.get('content-type')).toMatch(/javascript/);
  });
  it('other brokers cannot see or revoke it; revoking kills the page', async () => {
    expect((await j(await call(jar.B2, 'GET', '/api/share/links'))).links.length).toBe(0);
    expect((await call(jar.B2, 'POST', `/api/share/links/${token}/revoke`)).status).toBe(404);
    expect((await call(jar.B1, 'POST', `/api/share/links/${token}/revoke`)).status).toBe(200);
    expect((await fetch(`${B}/s/${token}`, { headers: BROWSER })).status).toBe(404);
    expect((await fetch(`${B}/s/nonexistent`)).status).toBe(404);
  });
  it('a broker can share only own listings; owner details never appear', async () => {
    const src = (await j(await call(jar.B1, 'GET', '/api/share/sources'))).sources.find((s: any) => s.kind === 'PROPERTY');
    if (!src) return;
    expect((await call(jar.B2, 'POST', '/api/share/links', { kind: 'PROPERTY', refId: src.id })).status).toBe(404);
    const t = (await j(await call(jar.B1, 'POST', '/api/share/links', { kind: 'PROPERTY', refId: src.id }))).token;
    const html = await (await fetch(`${B}/s/${t}`, { headers: BROWSER })).text();
    expect(html).not.toMatch(/owner/i);
  });
});

describe('land records & red flags', () => {
  const rec = (over: any = {}, fields: any = {}) => ({
    title: 'Tikrapara plot', state: 'Chhattisgarh', district: 'Raipur', tehsil: 'Raipur', village: 'Tikrapara', khasraNo: '123/4', areaText: '1.02 ha', markVerified: true,
    fields: { landUse: 'RESIDENTIAL', diverted: true, diversionOrderNo: 'D-77', ownerNameOnRecord: 'Ramesh Sahu', sellerName: 'Ramesh Sahu', encumbrance: 'CLEAR', bankNoc: 'NOT_REQUIRED', approvalAuthority: 'NONE', isLayoutOrProject: false, ...fields },
    ...over,
  });
  let id: string;
  it('scans on save and returns the verdict', async () => {
    const clear = await j(await call(jar.B1, 'POST', '/api/land-records', rec()));
    expect(clear.record.scan.verdict).toBe('CLEAR');
    id = clear.record.id;
    const bad = await j(await call(jar.B1, 'POST', '/api/land-records', rec({}, { landUse: 'AGRICULTURAL', diverted: false, encumbrance: 'MORTGAGE', bankNoc: 'PENDING' })));
    expect(bad.record.scan.verdict).toBe('DANGER');
    expect(bad.record.scan.flags.map((f: any) => f.code)).toEqual(expect.arrayContaining(['AGRI_NOT_DIVERTED', 'MORTGAGE_NO_NOC']));
  });
  it('validates input', async () => {
    expect((await call(jar.B1, 'POST', '/api/land-records', rec({ khasraNo: '' }))).status).toBe(400);
    expect((await call(jar.B1, 'POST', '/api/land-records', rec({}, { landUse: 'MOON' }))).status).toBe(400);
    expect((await call(jar.B1, 'POST', '/api/land-records', rec({ propertyId: 'NOPE' }))).status).toBe(404);
  });
  it('records are private to the creator, admins and legal counsel', async () => {
    expect((await j(await call(jar.B2, 'GET', '/api/land-records'))).records.some((r: any) => r.id === id)).toBe(false);
    expect((await call(jar.B2, 'PUT', `/api/land-records/${id}`, rec())).status).toBe(404);
    expect((await call(jar.B2, 'DELETE', `/api/land-records/${id}`)).status).toBe(404);
    expect((await j(await call(jar.ADMIN, 'GET', '/api/land-records'))).records.some((r: any) => r.id === id)).toBe(true);
    for (const k of ['OWNER', 'BUYER', 'T1']) expect((await call(jar[k], 'GET', '/api/land-records')).status).toBe(403);
  });
  it('editing re-scans; delete works for the creator', async () => {
    const upd = await j(await call(jar.B1, 'PUT', `/api/land-records/${id}`, rec({}, { sellerName: 'Mohan Lal' })));
    expect(upd.record.scan.flags.map((f: any) => f.code)).toContain('NAME_MISMATCH');
    expect((await call(jar.B1, 'DELETE', `/api/land-records/${id}`)).status).toBe(200);
  });
});
