import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  effectiveTdsPct, brokerageBreakup, csvCell, parseCsv, extendBlock, isStale, protectionDaysLeft, lostCodeOk, fillTemplate, WA_TEMPLATES, hasRecentEngagement,
} from '../src/shared/crmRules';

/** v16: CRM controls (consent, two-side money, ledger, TDS, cancellation), workflow (follow-ups, lost codes, import/export, bulk) and reports. */
const PORT = 4900 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const email = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id).email;
async function login(who: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: who, password: cfg.demoPassword }) });
  expect(r.status).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const PROJ = 'PROJ-RAI-02';
let AV = 0;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v16-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true', CRM_LOST_RETENTION_DAYS: '0.00002', CRM_OPTOUT_RETENTION_DAYS: '0.00002' },
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  expect(cfg).toBeTruthy();
  jar.B1 = await login(email('USR-BRK-001')); jar.B2 = await login(email('USR-BRK-002'));
  jar.BUILDER = await login(email('USR-BUILDER-001')); jar.BUILDER2 = await login(email('USR-BUILDER-002'));
  jar.ADMIN = await login(cfg.demoAccounts.find((a: any) => a.role === 'ADMIN').email);
  jar.SUP = await login(cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').email);
  jar.OWNER = await login(cfg.demoAccounts.find((a: any) => a.role === 'PROPERTY_OWNER').email);
  jar.T1 = await login('9000030001');
  const proj = (await j(await call(jar.BUILDER, 'GET', '/api/builder/projects'))).projects.find((p: any) => p.id === PROJ);
  AV = proj.priceStartingFrom;
}, 90_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const mkLead = async (name: string, extra: any = {}, cookie = jar.B1) => {
  const r = await call(cookie, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name, phone: rnd(), source: 'WALK_IN', ...extra });
  expect(r.status, await r.clone().text()).toBe(200);
  return (await j(r)).lead;
};
const stageTo = async (id: string, stages: string[], cookie = jar.B1) => { for (const stage of stages) { const r = await call(cookie, 'POST', `/api/crm/leads/${id}/stage`, { stage }); expect(r.status, await r.clone().text()).toBe(200); } };
async function mkBooking(label: string) {
  const lead = await mkLead('Cust ' + label);
  await stageTo(lead.id, ['CONTACTED', 'SITE_VISIT_SCHEDULED', 'SITE_VISITED']);
  const br = await call(jar.B1, 'POST', `/api/crm/leads/${lead.id}/booking-request`, { unitNo: label, agreementValue: AV, tokenAmount: 50000, tokenMode: 'CHEQUE', tokenRef: 'CHQ-100234' });
  expect(br.status, await br.clone().text()).toBe(200);
  const bid = (await j(br)).booking.id;
  const dec = await call(jar.BUILDER, 'POST', `/api/crm/bookings/${bid}/decision`, { decision: 'APPROVE' });
  expect(dec.status, await dec.clone().text()).toBe(200);
  return { lead, booking: (await j(dec)).booking };
}
const ledger = async (cookie: string, id: string) => j(await call(cookie, 'GET', `/api/crm/bookings/${id}/ledger`));

describe('pure rules', () => {
  it('TDS: the builder rate, never below 20% when the associate has no PAN; breakup adds GST only for GSTIN holders', () => {
    expect(effectiveTdsPct(undefined, true)).toBe(5); expect(effectiveTdsPct(undefined, false)).toBe(20); expect(effectiveTdsPct(2, true)).toBe(2); expect(effectiveTdsPct(2, false)).toBe(20); expect(effectiveTdsPct(25, false)).toBe(25);
    expect(brokerageBreakup(100000, 5, false)).toEqual({ gross: 100000, gst: 0, tds: 5000, net: 95000 });
    expect(brokerageBreakup(100000, 5, true)).toEqual({ gross: 100000, gst: 18000, tds: 5000, net: 113000 });
  });
  it('CSV cells cannot run as formulas; the parser handles quotes, commas, CRLF and blank lines', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`); expect(csvCell('+91 98')).toBe("'+91 98"); expect(csvCell('-1')).toBe("'-1"); expect(csvCell('@sum')).toBe("'@sum"); expect(csvCell('a,b')).toBe('"a,b"'); expect(csvCell('x\ny')).toBe('x y'); expect(csvCell(null)).toBe('');
    expect(parseCsv('name,phone\r\n"Rao, K",98\n\n"Say ""hi""",99\n')).toEqual([['name', 'phone'], ['Rao, K', '98'], ['Say "hi"', '99']]);
  });
  it('protection can be extended only near expiry, with real engagement, at most twice', () => {
    const now = Date.now(); const iso = (d: number) => new Date(now + d * 86400000).toISOString();
    const eng = [{ at: iso(-2), type: 'CALL' }];
    const lead = (o: any = {}) => ({ stage: 'CONTACTED', protectedUntil: iso(5), protectionExtensions: 0, activities: eng, createdAt: iso(-80), ...o });
    expect(extendBlock(lead())).toBe('');
    expect(extendBlock(lead({ protectedUntil: iso(40) }))).toMatch(/last 7 days/);
    expect(extendBlock(lead({ activities: [{ at: iso(-2), type: 'NOTE' }] }))).toMatch(/real call/);
    expect(extendBlock(lead({ activities: [{ at: iso(-40), type: 'CALL' }] }))).toMatch(/real call/);
    expect(extendBlock(lead({ protectionExtensions: 2 }))).toMatch(/at most 2/);
    expect(extendBlock(lead({ protectedUntil: iso(-10) }))).toMatch(/lapsed/);
    expect(extendBlock(lead({ stage: 'LOST' }))).toMatch(/open lead/); expect(extendBlock(lead({ stage: 'BOOKING_REQUESTED' }))).toMatch(/open lead/);
    expect(hasRecentEngagement({ activities: eng })).toBe(true); expect(protectionDaysLeft({ protectedUntil: iso(5) })).toBeGreaterThanOrEqual(4);
  });
  it('stale = open lead with no activity for 7+ days; lost codes and templates', () => {
    const old = new Date(Date.now() - 9 * 86400000).toISOString();
    expect(isStale({ stage: 'CONTACTED', activities: [], createdAt: old })).toBe(true); expect(isStale({ stage: 'LOST', activities: [], createdAt: old })).toBe(false); expect(isStale({ stage: 'NEW', activities: [{ at: new Date().toISOString() }], createdAt: old })).toBe(false);
    expect(lostCodeOk('PRICE')).toBe(true); expect(lostCodeOk('nope')).toBe(false);
    expect(WA_TEMPLATES.length).toBeGreaterThanOrEqual(6); expect(fillTemplate('Hi {name} @ {project}{x}', { name: 'Ravi', project: 'Palm' })).toBe('Hi Ravi @ Palm');
  });
});

describe('customer consent and opt-out (DPDP)', () => {
  it('a lead cannot be registered without the consent attestation', async () => {
    const no = await call(jar.B1, 'POST', '/api/crm/leads', { projectId: PROJ, name: 'No Consent', phone: rnd() });
    expect(no.status).toBe(400); expect((await j(no)).error).toMatch(/consent|agreed/i);
    expect((await call(jar.B1, 'POST', '/api/crm/leads', { projectId: PROJ, name: 'No Consent', phone: rnd(), consent: false })).status).toBe(400);
  });
  it('consent is stored with who/when/how and opt-out locks outreach, drops follow-ups and cannot be re-opened', async () => {
    const l = await mkLead('Optout Person');
    expect(l.consent.via).toBe('FORM'); expect(l.consent.byId).toBe('USR-BRK-001');
    expect((await call(jar.B1, 'POST', `/api/crm/leads/${l.id}/followups`, { dueAt: new Date(Date.now() + 86400000).toISOString(), channel: 'CALL', note: 'ring him' })).status).toBe(200);
    const out = await j(await call(jar.B1, 'POST', `/api/crm/leads/${l.id}/optout`, { note: 'asked on call' }));
    expect(out.lead.optedOutAt).toBeTruthy(); expect(out.lead.stage).toBe('LOST'); expect(out.lead.lostCode).toBe('NOT_INTERESTED'); expect(out.lead.followUps.filter((f: any) => !f.done)).toHaveLength(0);
    expect((await call(jar.B1, 'POST', `/api/crm/leads/${l.id}/optout`, {})).status).toBe(409);
    const fu = await call(jar.B1, 'POST', `/api/crm/leads/${l.id}/followups`, { dueAt: new Date(Date.now() + 86400000).toISOString(), channel: 'CALL', note: 'sneaky' });
    expect(fu.status).toBe(409); expect((await j(fu)).code).toBe('OPTED_OUT');
    expect((await call(jar.B1, 'POST', `/api/crm/leads/${l.id}/activity`, { type: 'WHATSAPP', note: 'sent offer' })).status).toBe(409);
    expect((await call(jar.B1, 'POST', `/api/crm/leads/${l.id}/activity`, { type: 'NOTE', note: 'just a note' })).status).toBe(200);
    expect((await call(jar.BUILDER, 'POST', `/api/crm/leads/${l.id}/stage`, { stage: 'NEW' })).status).toBe(409);
    expect((await call(jar.B1, 'POST', `/api/crm/leads/${l.id}/correct-phone`, { phone: rnd(), reason: 'typo here' })).status).toBe(409);
    const audit = await j(await call(jar.SUP, 'GET', '/api/audit-logs'));
    expect(JSON.stringify(audit)).toContain('CRM_LEAD_OPTOUT');
  });
});

describe('workflow: follow-ups, lost reasons, temperature + tags, feedback, phone correction, protection', () => {
  let L: any;
  it('moving a lead forward creates an automatic follow-up; it can be edited, snoozed and deleted but not once done', async () => {
    L = await mkLead('Workflow Lead');
    await stageTo(L.id, ['CONTACTED']);
    let cur = (await j(await call(jar.B1, 'GET', `/api/crm/leads/${L.id}`))).lead;
    expect(cur.followUps).toHaveLength(1); expect(cur.followUps[0].note).toMatch(/first contact/);
    const fid = cur.followUps[0].id;
    const later = new Date(Date.now() + 5 * 86400000).toISOString();
    const ed = await j(await call(jar.B1, 'PATCH', `/api/crm/leads/${L.id}/followups/${fid}`, { dueAt: later, note: 'Snoozed to weekend', channel: 'WHATSAPP' }));
    expect(ed.lead.followUps[0].note).toBe('Snoozed to weekend'); expect(ed.lead.followUps[0].channel).toBe('WHATSAPP'); expect(ed.lead.nextFollowUpAt).toBe(new Date(later).toISOString());
    expect((await call(jar.B1, 'PATCH', `/api/crm/leads/${L.id}/followups/${fid}`, { note: 'x' })).status).toBe(400);
    expect((await call(jar.B2, 'PATCH', `/api/crm/leads/${L.id}/followups/${fid}`, { note: 'hijack' })).status).toBe(404);
    expect((await call(jar.B1, 'POST', `/api/crm/leads/${L.id}/followups/${fid}/done`)).status).toBe(200);
    expect((await call(jar.B1, 'PATCH', `/api/crm/leads/${L.id}/followups/${fid}`, { note: 'edit done one' })).status).toBe(409);
    await stageTo(L.id, ['SITE_VISIT_SCHEDULED', 'SITE_VISITED']);
    cur = (await j(await call(jar.B1, 'GET', `/api/crm/leads/${L.id}`))).lead;
    const open = cur.followUps.filter((f: any) => !f.done); expect(open).toHaveLength(1); expect(open[0].note).toMatch(/site visit/i);
    const del = await j(await call(jar.B1, 'DELETE', `/api/crm/leads/${L.id}/followups/${open[0].id}`));
    expect(del.lead.followUps.filter((f: any) => !f.done)).toHaveLength(0); expect(del.lead.nextFollowUpAt).toBeUndefined();
    expect((await call(jar.B1, 'DELETE', `/api/crm/leads/${L.id}/followups/nope`)).status).toBe(404);
  });
  it('temperature + tags (max 5, searchable); visit feedback sets a default temperature and is limited to visited leads', async () => {
    const fresh = await mkLead('Fresh Lead');
    expect((await call(jar.B1, 'POST', `/api/crm/leads/${fresh.id}/visit-feedback`, { rating: 4 })).status).toBe(409);
    expect((await call(jar.B1, 'PATCH', `/api/crm/leads/${L.id}`, { temperature: 'BOILING' })).status).toBe(400);
    const p = await j(await call(jar.B1, 'PATCH', `/api/crm/leads/${L.id}`, { tags: ['nri', 'loan-approved'] }));
    expect(p.lead.tags).toEqual(['nri', 'loan-approved']);
    expect((await call(jar.B1, 'PATCH', `/api/crm/leads/${L.id}`, { tags: ['a', 'b', 'c', 'd', 'e', 'f'] })).status).toBe(400);
    const found = (await j(await call(jar.B1, 'GET', '/api/crm/leads?q=loan-appr'))).leads;
    expect(found.map((x: any) => x.id)).toContain(L.id);
    expect((await call(jar.B1, 'POST', `/api/crm/leads/${L.id}/visit-feedback`, { rating: 9 })).status).toBe(400);
    const fb = await j(await call(jar.B1, 'POST', `/api/crm/leads/${L.id}/visit-feedback`, { rating: 5, liked: ['garden', 'price'], objection: 'wants east facing', nextStep: 'show unit 204' }));
    expect(fb.lead.visitFeedback).toHaveLength(1); expect(fb.lead.temperature).toBe('HOT');
    const hot = (await j(await call(jar.B1, 'GET', '/api/crm/leads?temperature=HOT'))).leads;
    expect(hot.every((x: any) => x.temperature === 'HOT')).toBe(true);
  });
  it('lost needs a structured reason; the label is used when no free text is given; the builder can re-open', async () => {
    expect((await call(jar.B1, 'POST', `/api/crm/leads/${L.id}/stage`, { stage: 'LOST' })).status).toBe(400);
    expect((await call(jar.B1, 'POST', `/api/crm/leads/${L.id}/stage`, { stage: 'LOST', lostCode: 'MOON' })).status).toBe(400);
    const lost = await j(await call(jar.B1, 'POST', `/api/crm/leads/${L.id}/stage`, { stage: 'LOST', lostCode: 'PRICE' }));
    expect(lost.lead.lostCode).toBe('PRICE'); expect(lost.lead.lostReason).toBe('Price too high');
    expect((await call(jar.B1, 'POST', `/api/crm/leads/${L.id}/stage`, { stage: 'NEW' })).status).toBe(409);
    const re = await j(await call(jar.BUILDER, 'POST', `/api/crm/leads/${L.id}/stage`, { stage: 'NEW' }));
    expect(re.lead.stage).toBe('NEW'); expect(re.lead.lostCode).toBeUndefined();
  });
  it('phone correction: associate within 24h only, builder any time, duplicates refused, every change audited with masked numbers', async () => {
    const l = await mkLead('Typo Person'); const other = await mkLead('Other Person', { phone: '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0') });
    const np = rnd();
    expect((await call(jar.B1, 'POST', `/api/crm/leads/${l.id}/correct-phone`, { phone: np, reason: 'x' })).status).toBe(400);
    expect((await call(jar.B1, 'POST', `/api/crm/leads/${l.id}/correct-phone`, { phone: '12345', reason: 'wrong digit typed' })).status).toBe(400);
    expect((await call(jar.B2, 'POST', `/api/crm/leads/${l.id}/correct-phone`, { phone: np, reason: 'wrong digit typed' })).status).toBe(404);
    const ok = await call(jar.B1, 'POST', `/api/crm/leads/${l.id}/correct-phone`, { phone: np, reason: 'wrong digit typed' });
    expect(ok.status, await ok.clone().text()).toBe(200);
    expect((await call(jar.B1, 'POST', `/api/crm/leads/${l.id}/correct-phone`, { phone: np, reason: 'same number again' })).status).toBe(400);
    const clash = await call(jar.BUILDER, 'POST', `/api/crm/leads/${l.id}/correct-phone`, { phone: other.phone, reason: 'builder checked' });
    expect(clash.status).toBe(409); expect((await j(clash)).code).toBe('LEAD_DUPLICATE');
    const b = await call(jar.BUILDER, 'POST', `/api/crm/leads/${l.id}/correct-phone`, { phone: rnd(), reason: 'customer gave another number' });
    expect(b.status).toBe(200);
    const audit = JSON.stringify(await j(await call(jar.SUP, 'GET', '/api/audit-logs')));
    expect(audit).toContain('CRM_PHONE_CORRECTED'); expect(audit).not.toContain(np);
  });
  it('protection extension is refused far from expiry (full rules are unit-tested above); team members cannot extend', async () => {
    const l = await mkLead('Protect Me'); await stageTo(l.id, ['CONTACTED']);
    const r = await call(jar.B1, 'POST', `/api/crm/leads/${l.id}/extend-protection`, {});
    expect(r.status).toBe(409); expect((await j(r)).code).toBe('EXTEND_BLOCKED');
    expect((await call(jar.B2, 'POST', `/api/crm/leads/${l.id}/extend-protection`, {})).status).toBe(404);
  });
});

describe('import, export, bulk, filters', () => {
  it('CSV import needs consent, validates every row, reports per-row results and de-duplicates inside the file', async () => {
    const good = rnd(), dupe = rnd();
    const csv = `name,phone,email,interest,budget,note\nImport One,${good},one@example.com,3 BHK,5000000,walk-in\nImport Two,12345,,,,\nImport Three,${dupe},,2 BHK,,\nImport Three Again,${dupe},,,,\n`;
    expect((await call(jar.B1, 'POST', '/api/crm/leads/import', { projectId: PROJ, csv })).status).toBe(400);
    expect((await call(jar.B1, 'POST', '/api/crm/leads/import', { projectId: PROJ, csv: 'foo,bar\n1,2', consent: true })).status).toBe(400);
    const r = await j(await call(jar.B1, 'POST', '/api/crm/leads/import', { projectId: PROJ, csv, consent: true }));
    expect(r.imported).toBe(2); expect(r.failed).toBe(2);
    expect(r.results.find((x: any) => x.row === 3).ok).toBe(false); expect(r.results.find((x: any) => x.row === 5).code).toBe('LEAD_DUPLICATE');
    const again = await j(await call(jar.B1, 'POST', '/api/crm/leads/import', { projectId: PROJ, csv: `name,phone\nImport One,${good}`, consent: true }));
    expect(again.imported).toBe(0); expect(again.results[0].code).toBe('LEAD_DUPLICATE');
    const l = (await j(await call(jar.B1, 'GET', '/api/crm/leads?q=Import%20One'))).leads[0]; expect(l.consent.via).toBe('IMPORT');
    const big = 'name,phone\n' + Array.from({ length: 201 }, (_, i) => `N${i} Name,${rnd()}`).join('\n');
    expect((await call(jar.B1, 'POST', '/api/crm/leads/import', { projectId: PROJ, csv: big, consent: true })).status).toBe(400);
    expect((await call(jar.T1, 'POST', '/api/crm/leads/import', { projectId: PROJ, csv, consent: true })).status).not.toBe(200);
  });
  it('export is masked by default, formula-safe, audited, and not for employees; full numbers only on request by the owner', async () => {
    const ph = rnd(); await mkLead('=cmd|calc', { phone: ph });
    const res = await call(jar.B1, 'GET', '/api/crm/leads/export'); expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/csv/); const t = await res.text();
    expect(t).toContain('id,project,name,phone'); expect(t).toContain("'=cmd|calc"); expect(t).not.toContain(ph);
    const full = await (await call(jar.B1, 'GET', '/api/crm/leads/export?full=1')).text(); expect(full).toContain(ph);
    const adminFull = await (await call(jar.ADMIN, 'GET', '/api/crm/leads/export?full=1')).text(); expect(adminFull).not.toContain(ph);
    expect((await call(jar.T1, 'GET', '/api/crm/leads/export')).status).toBe(403);
    expect((await call(jar.OWNER, 'GET', '/api/crm/leads/export')).status).toBe(403);
    const audit = JSON.stringify(await j(await call(jar.SUP, 'GET', '/api/audit-logs'))); expect(audit).toContain('CRM_LEADS_EXPORTED');
  });
  it('bulk actions: temperature, tag, follow-up, lost — capped, scoped to your own leads, per-lead results', async () => {
    const a = await mkLead('Bulk A'); const b = await mkLead('Bulk B'); const foreign = (await j(await call(jar.B2, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Foreign', phone: rnd() }))).lead;
    expect((await call(jar.B1, 'POST', '/api/crm/leads/bulk', { ids: [], action: 'TAG', tag: 'x' })).status).toBe(400);
    expect((await call(jar.B1, 'POST', '/api/crm/leads/bulk', { ids: Array.from({ length: 51 }, (_, i) => 'L' + i), action: 'TAG', tag: 'x' })).status).toBe(400);
    expect((await call(jar.B1, 'POST', '/api/crm/leads/bulk', { ids: [a.id], action: 'TEMPERATURE', temperature: 'LAVA' })).status).toBe(400);
    const t = await j(await call(jar.B1, 'POST', '/api/crm/leads/bulk', { ids: [a.id, b.id, foreign?.id || 'NOPE'], action: 'TEMPERATURE', temperature: 'WARM' }));
    expect(t.done).toBe(2); expect(t.results.find((x: any) => x.id === (foreign?.id || 'NOPE')).ok).toBe(false);
    expect((await j(await call(jar.B1, 'POST', '/api/crm/leads/bulk', { ids: [a.id, b.id], action: 'TAG', tag: 'diwali' }))).done).toBe(2);
    expect((await j(await call(jar.B1, 'POST', '/api/crm/leads/bulk', { ids: [a.id, b.id], action: 'FOLLOWUP', dueAt: new Date(Date.now() + 86400000).toISOString(), channel: 'CALL', note: 'Diwali greetings' }))).done).toBe(2);
    const la = (await j(await call(jar.B1, 'GET', `/api/crm/leads/${a.id}`))).lead; expect(la.temperature).toBe('WARM'); expect(la.tags).toContain('diwali'); expect(la.followUps.some((f: any) => f.note === 'Diwali greetings')).toBe(true);
    expect((await call(jar.B1, 'POST', '/api/crm/leads/bulk', { ids: [a.id], action: 'LOST' })).status).toBe(400);
    expect((await j(await call(jar.B1, 'POST', '/api/crm/leads/bulk', { ids: [a.id], action: 'LOST', lostCode: 'POSTPONED' }))).done).toBe(1);
    expect((await j(await call(jar.B1, 'GET', `/api/crm/leads/${a.id}`))).lead.stage).toBe('LOST');
  });
  it('lead list: filters + pagination report the total', async () => {
    const all = await j(await call(jar.B1, 'GET', '/api/crm/leads?limit=2'));
    expect(all.leads).toHaveLength(2); expect(all.total).toBeGreaterThan(2); expect(all.limit).toBe(2);
    const p2 = await j(await call(jar.B1, 'GET', '/api/crm/leads?limit=2&offset=2')); expect(p2.offset).toBe(2); expect(p2.leads[0].id).not.toBe(all.leads[0].id);
    const lost = (await j(await call(jar.B1, 'GET', '/api/crm/leads?stage=LOST'))).leads; expect(lost.length).toBeGreaterThan(0); expect(lost.every((x: any) => x.stage === 'LOST')).toBe(true);
    expect((await j(await call(jar.B1, 'GET', '/api/crm/leads?stale=1'))).leads.every((x: any) => x.stale)).toBe(true);
  });
});

describe('money: partial collections, claims, reversals, payout ledger, TDS', () => {
  let BK: any; let M0: string; let M1: string;
  it('an approved booking starts with an empty ledger', async () => {
    BK = (await mkBooking('V16-A1')).booking; M0 = BK.paymentSchedule[0].id; M1 = BK.paymentSchedule[1].id;
    const l = await ledger(jar.B1, BK.id);
    expect(l.summary.collected).toBe(0); expect(l.summary.paid).toBe(0); expect(l.milestones.length).toBeGreaterThan(1); expect(l.invoice.indicative).toBe(true);
    expect((await call(jar.B2, 'GET', `/api/crm/bookings/${BK.id}/ledger`)).status).toBe(404);
    expect((await call(jar.BUILDER2, 'GET', `/api/crm/bookings/${BK.id}/ledger`)).status).toBe(404);
    expect((await call(jar.T1, 'GET', `/api/crm/bookings/${BK.id}/ledger`)).status).toBe(404); // employees never see money
  });
  it('the associate raises a "customer paid" claim; the builder sees an alert; recording a receipt resolves it', async () => {
    expect((await call(jar.B1, 'POST', `/api/crm/bookings/${BK.id}/payments/${M0}/claim`, { note: 'x' })).status).toBe(400);
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${BK.id}/payments/${M0}/claim`, { note: 'builder cannot claim this' })).status).toBe(403);
    expect((await call(jar.B1, 'POST', `/api/crm/bookings/${BK.id}/payments/${M0}/claim`, { note: 'Customer says UPI on 12th, ref 4455' })).status).toBe(200);
    expect((await call(jar.B1, 'POST', `/api/crm/bookings/${BK.id}/payments/${M0}/claim`, { note: 'raising it again today' })).status).toBe(409);
    const alerts = (await j(await call(jar.BUILDER, 'GET', '/api/crm/alerts'))).alerts; expect(alerts.find((a: any) => a.kind === 'CLAIM_OPEN')?.count).toBeGreaterThan(0);
    const m0amt = BK.paymentSchedule[0].amount;
    expect((await call(jar.B1, 'POST', `/api/crm/bookings/${BK.id}/payments/${M0}/receive`, { amount: 100, receiptNo: 'MINE-1' })).status).toBe(403);
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${BK.id}/payments/${M0}/receive`, { amount: m0amt + 1, receiptNo: 'UPI-TOO-MUCH' })).status).toBe(400);
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${BK.id}/payments/${M0}/receive`, { amount: 0, receiptNo: 'UPI-ZERO' })).status).toBe(400);
    const part = await j(await call(jar.BUILDER, 'POST', `/api/crm/bookings/${BK.id}/payments/${M0}/receive`, { amount: 20000, mode: 'UPI', receiptNo: 'UPI-0001' }));
    const m = part.booking.paymentSchedule[0]; expect(m.paidAmount).toBe(20000); expect(m.paid).toBe(false); expect(m.claim.status).toBe('RESOLVED');
    const rest = await j(await call(jar.BUILDER, 'POST', `/api/crm/bookings/${BK.id}/payments/${M0}/receive`, { mode: 'NEFT_RTGS', receiptNo: 'UTR-0002' }));
    expect(rest.booking.paymentSchedule[0].paid).toBe(true); expect(rest.booking.paymentSchedule[0].receipts).toHaveLength(2);
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${BK.id}/payments/${M0}/receive`, { receiptNo: 'UTR-0003' })).status).toBe(409);
  });
  it('payout needs a UTR / cheque ref and cannot exceed what the collection supports; TDS follows the associate\'s PAN', async () => {
    const l0 = await ledger(jar.BUILDER, BK.id); const payable = l0.summary.payable; expect(payable).toBeGreaterThan(0);
    const pay = (b: any, c = jar.BUILDER) => call(c, 'POST', `/api/crm/bookings/${BK.id}/payout`, b);
    expect((await pay({ amount: 100 })).status).toBe(400); expect((await pay({ amount: 100, ref: 'x' })).status).toBe(400);
    expect((await pay({ amount: payable + 1, ref: 'UTR-OVER-1' })).status).toBe(400);
    expect((await pay({ amount: 100, ref: 'UTR-B1' }, jar.B1)).status).toBe(403);
    expect((await pay({ amount: 100, ref: 'UTR-FUT-1', paidOn: new Date(Date.now() + 5 * 86400000).toISOString() })).status).toBe(400);
    const set = (b: any, c = jar.BUILDER) => call(c, 'PUT', `/api/crm/projects/${PROJ}/finance`, b);
    expect((await set({ tdsPct: 31 })).status).toBe(400); expect((await set({ tdsPct: 'abc' })).status).toBe(400); expect((await set({ tdsPct: 10 }, jar.B1)).status).toBe(403); expect((await set({ tdsPct: 10 }, jar.BUILDER2)).status).toBe(404);
    expect((await set({ tdsPct: 10 })).status).toBe(200);
    const ok = await j(await pay({ amount: payable, ref: 'UTR-OK-0001', mode: 'NEFT_RTGS' }));
    const noPan = (await ledger(jar.B1, BK.id)).summary.noPan;
    const pct = noPan ? 20 : 10; expect(ok.tds).toBe(Math.round((payable * pct) / 100)); expect(ok.net).toBe(payable - ok.tds);
    const l = await ledger(jar.B1, BK.id);
    expect(l.summary.paid).toBe(payable); expect(l.summary.unconfirmed).toBe(payable); expect(l.summary.confirmed).toBe(0); expect(l.summary.payable).toBe(0);
    expect(l.payouts[0]).toMatchObject({ ref: 'UTR-OK-0001', mode: 'NEFT_RTGS', status: 'RECORDED', tdsPct: pct });
    expect(l.invoice.gross).toBe(payable); expect(l.invoice.tds).toBe(l.payouts[0].tds);
  });
  it('the associate confirms or disputes each payout; only the associate can; disputes need a reason and raise a builder alert', async () => {
    const l = await ledger(jar.B1, BK.id); const pid = l.payouts[0].id;
    const ack = (b: any, c = jar.B1, id = pid) => call(c, 'POST', `/api/crm/bookings/${BK.id}/payouts/${id}/ack`, b);
    expect((await ack({ action: 'CONFIRM' }, jar.BUILDER)).status).toBe(403);
    expect((await ack({ action: 'CONFIRM' }, jar.B2)).status).toBe(404);
    expect((await ack({ action: 'MAYBE' })).status).toBe(400); expect((await ack({ action: 'DISPUTE', note: 'no' })).status).toBe(400);
    const alerts = (await j(await call(jar.B1, 'GET', '/api/crm/alerts'))).alerts; expect(alerts.find((a: any) => a.kind === 'PAYOUT_NEW')).toBeTruthy();
    expect((await ack({ action: 'DISPUTE', note: 'Only part of it reached my account' })).status).toBe(200);
    expect((await ack({ action: 'CONFIRM' })).status).toBe(409);
    expect((await j(await call(jar.BUILDER, 'GET', '/api/crm/alerts'))).alerts.find((a: any) => a.kind === 'PAYOUT_DISPUTED')).toBeTruthy();
    expect((await ledger(jar.B1, BK.id)).summary.disputed).toBeGreaterThan(0);
    // collect the next milestone → more is payable → second payout is confirmed
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${BK.id}/payments/${M1}/receive`, { mode: 'CHEQUE', receiptNo: 'CHQ-000123' })).status).toBe(200);
    const pay2 = await call(jar.BUILDER, 'POST', `/api/crm/bookings/${BK.id}/payout`, { amount: 500, ref: 'CHQ-998877', mode: 'CHEQUE', paidOn: new Date(Date.now() - 86400000).toISOString() }); expect(pay2.status, await pay2.clone().text()).toBe(200);
    const id2 = (await ledger(jar.B1, BK.id)).payouts[1].id;
    expect((await ack({ action: 'CONFIRM' }, jar.B1, id2)).status).toBe(200);
    expect((await ledger(jar.B1, BK.id)).summary.confirmed).toBe(500);
  });
  it('a collection cannot be reversed when brokerage already paid depends on it; otherwise it is reversed with a reason', async () => {
    const l = await ledger(jar.BUILDER, BK.id);
    const rid = l.milestones[1].receipts[0].id; // the large second collection is what the payouts rely on
    const rev = await call(jar.BUILDER, 'POST', `/api/crm/bookings/${BK.id}/payments/${M1}/receipts/${rid}/reverse`, { reason: 'cheque bounced' });
    expect(rev.status).toBe(409); expect((await j(rev)).code).toBe('PAYOUT_EXCEEDS');
    const X = (await mkBooking('V16-A2')).booking; const xm = X.paymentSchedule[0].id;
    const got = await j(await call(jar.BUILDER, 'POST', `/api/crm/bookings/${X.id}/payments/${xm}/receive`, { amount: 30000, mode: 'CHEQUE', receiptNo: 'CHQ-BOUNCE' }));
    const xr = got.booking.paymentSchedule[0].receipts[0].id;
    const path = `/api/crm/bookings/${X.id}/payments/${xm}/receipts/${xr}/reverse`;
    expect((await call(jar.B1, 'POST', path, { reason: 'associate cannot reverse' })).status).toBe(403);
    expect((await call(jar.BUILDER, 'POST', path, { reason: 'no' })).status).toBe(400);
    const done = await j(await call(jar.BUILDER, 'POST', path, { reason: 'Cheque bounced at bank' }));
    expect(done.booking.paymentSchedule[0].paidAmount).toBe(0); expect(done.booking.paymentSchedule[0].paid).toBe(false); expect(done.booking.paymentSchedule[0].receipts[0].reversed.reason).toMatch(/bounced/);
    expect((await call(jar.BUILDER, 'POST', path, { reason: 'again again' })).status).toBe(409);
    expect((await ledger(jar.BUILDER, X.id)).summary.collected).toBe(0);
    const audit = JSON.stringify(await j(await call(jar.SUP, 'GET', '/api/audit-logs'))); expect(audit).toContain('CRM_PAYMENT_REVERSED'); expect(audit).toContain('CRM_PAYMENT_CLAIMED'); expect(audit).toContain('CRM_PAYOUT_DISPUTED');
  });
});

describe('cancellation: refund / forfeit / clawback, and cancellation by request', () => {
  it('cancel after a payout must state the clawback; refund + forfeit cannot exceed what was collected', async () => {
    const { booking } = await mkBooking('V16-C1'); const m0 = booking.paymentSchedule[0];
    await call(jar.BUILDER, 'POST', `/api/crm/bookings/${booking.id}/payments/${m0.id}/receive`, { mode: 'UPI', receiptNo: 'UPI-C1-1' });
    const payable = (await ledger(jar.BUILDER, booking.id)).summary.payable;
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${booking.id}/payout`, { amount: payable, ref: 'UTR-C1-0001' })).status).toBe(200);
    const cancel = (b: any) => call(jar.BUILDER, 'POST', `/api/crm/bookings/${booking.id}/cancel`, b);
    expect((await cancel({ reason: 'no' })).status).toBe(400);
    const need = await cancel({ reason: 'Customer withdrew' }); expect(need.status).toBe(409); expect((await j(need)).code).toBe('CLAWBACK_REQUIRED');
    expect((await cancel({ reason: 'Customer withdrew', clawbackAmount: payable + 1 })).status).toBe(400);
    expect((await cancel({ reason: 'Customer withdrew', clawbackAmount: 0, refundAmount: m0.amount, forfeitAmount: 1 })).status).toBe(400);
    const ok = await j(await cancel({ reason: 'Customer withdrew', clawbackAmount: payable, refundAmount: m0.amount - 10000, forfeitAmount: 10000, settlementNote: 'refund by cheque' }));
    expect(ok.booking.status).toBe('CANCELLED'); expect(ok.booking.settlement).toMatchObject({ refundAmount: m0.amount - 10000, forfeitAmount: 10000, clawbackAmount: payable, clawbackStatus: 'DUE' });
    expect((await j(await call(jar.B1, 'GET', '/api/crm/alerts'))).alerts.find((a: any) => a.kind === 'CLAWBACK_DUE')).toBeTruthy();
    expect((await j(await call(jar.BUILDER, 'GET', '/api/crm/alerts'))).alerts.find((a: any) => a.kind === 'CLAWBACK_DUE')).toBeTruthy();
    expect((await call(jar.B1, 'POST', `/api/crm/bookings/${booking.id}/clawback/settle`, { note: 'x' })).status).toBe(403);
    const rec = await j(await call(jar.BUILDER, 'POST', `/api/crm/bookings/${booking.id}/clawback/settle`, { note: 'adjusted in next payout' }));
    expect(rec.booking.settlement.clawbackStatus).toBe('RECOVERED');
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${booking.id}/clawback/settle`, { note: 'again' })).status).toBe(409);
    const lead = (await j(await call(jar.B1, 'GET', `/api/crm/leads/${booking.leadId}`))).lead; expect(lead.stage).toBe('LOST'); expect(lead.lostCode).toBe('OTHER');
  });
  it('the associate can request cancellation; the builder approves (with a settlement) or declines with a reason', async () => {
    const { booking } = await mkBooking('V16-C2'); const { booking: b2 } = await mkBooking('V16-C3');
    const req = (id: string, body: any, c = jar.B1) => call(c, 'POST', `/api/crm/bookings/${id}/cancel-request`, body);
    const dec = (id: string, body: any, c = jar.BUILDER) => call(c, 'POST', `/api/crm/bookings/${id}/cancel-request/decide`, body);
    expect((await req(booking.id, { reason: 'no' })).status).toBe(400); expect((await req(booking.id, { reason: 'Customer lost the job' }, jar.BUILDER)).status).toBe(403);
    expect((await dec(booking.id, { approve: true })).status).toBe(409);
    expect((await req(booking.id, { reason: 'Customer lost the job' })).status).toBe(200); expect((await req(booking.id, { reason: 'asking one more time' })).status).toBe(409);
    expect((await j(await call(jar.BUILDER, 'GET', '/api/crm/alerts'))).alerts.find((a: any) => a.kind === 'CANCEL_REQUEST')).toBeTruthy();
    expect((await dec(booking.id, { approve: false, note: 'x' })).status).toBe(400); expect((await dec(booking.id, { approve: true }, jar.B1)).status).toBe(403);
    const no = await j(await dec(booking.id, { approve: false, note: 'Customer has not told us directly' })); expect(no.booking.cancelRequest.status).toBe('REJECTED'); expect(no.booking.status).toBe('APPROVED');
    expect((await req(booking.id, { reason: 'Now the customer called me' })).status).toBe(200);
    const yes = await j(await dec(booking.id, { approve: true, note: 'confirmed with customer' })); expect(yes.booking.status).toBe('CANCELLED'); expect(yes.booking.cancelRequest.status).toBe('APPROVED');
    expect((await req(b2.id, { reason: 'Customer shifted city' })).status).toBe(200);
    expect((await dec(b2.id, { approve: true }, jar.BUILDER2)).status).toBe(404);
  });
});

describe('alerts and reports', () => {
  it('alerts are scoped: a builder sees verification / money items, an associate sees follow-ups and protection; owners are refused', async () => {
    const l = await mkLead('Overdue One'); await stageTo(l.id, ['CONTACTED']);
    const cur = (await j(await call(jar.B1, 'GET', `/api/crm/leads/${l.id}`))).lead;
    expect((await call(jar.B1, 'PATCH', `/api/crm/leads/${l.id}/followups/${cur.followUps[0].id}`, { dueAt: new Date(Date.now() - 3600_000).toISOString() })).status).toBe(200);
    const mine = (await j(await call(jar.B1, 'GET', '/api/crm/alerts'))).alerts; expect(mine.find((a: any) => a.kind === 'FOLLOWUP_OVERDUE').ids).toContain(l.id); expect(mine.find((a: any) => a.kind === 'CLAIM_OPEN')).toBeUndefined();
    const od = (await j(await call(jar.B1, 'GET', '/api/crm/leads?overdue=1'))).leads; expect(od.map((x: any) => x.id)).toContain(l.id);
    expect((await call(jar.OWNER, 'GET', '/api/crm/alerts')).status).toBe(403); expect((await call(undefined, 'GET', '/api/crm/alerts')).status).toBe(401);
  });
  it('reports: funnel, per-project / per-associate / source tables, lost reasons, aging and money flags; brokers see only their own numbers', async () => {
    const rb = await j(await call(jar.BUILDER, 'GET', '/api/crm/reports?days=365'));
    expect(rb.funnel[0].id).toBe('REGISTERED'); expect(rb.funnel[0].count).toBe(rb.totals.leads); for (let i = 1; i < rb.funnel.length; i++) expect(rb.funnel[i].count).toBeLessThanOrEqual(rb.funnel[i - 1].count);
    expect(rb.byProject.length).toBeGreaterThan(0); expect(rb.byAssociate.length).toBeGreaterThan(0); expect(rb.bySource.length).toBeGreaterThan(0); expect(rb.aging).toHaveLength(4);
    expect(rb.lostReasons.find((x: any) => x.code === 'PRICE' || x.code === 'POSTPONED' || x.code === 'NOT_INTERESTED')).toBeTruthy();
    expect(rb.money).toBeTruthy(); expect(rb.money.disputedPayouts).toBeGreaterThanOrEqual(1); expect(rb.money.clawbackDue).toBeGreaterThanOrEqual(0);
    const rbk = await j(await call(jar.B1, 'GET', '/api/crm/reports?days=365'));
    expect(rbk.byAssociate.every((x: any) => x.id === 'USR-BRK-001')).toBe(true);
    const r2 = await j(await call(jar.B2, 'GET', '/api/crm/reports')); expect(r2.byAssociate.every((x: any) => x.id === 'USR-BRK-002')).toBe(true);
    const rt = await j(await call(jar.T1, 'GET', '/api/crm/reports')); expect(rt.money).toBeNull(); expect(rt.byAssociate).toEqual([]);
    expect((await call(jar.OWNER, 'GET', '/api/crm/reports')).status).toBe(403);
  });
});

describe('retention: lost and opted-out leads lose their personal data', () => {
  it('only the super admin can run it; erased leads keep their stage/lost code but lose name, phone, follow-ups and notes; bookings are untouched', async () => {
    const ph = rnd(); const l = await mkLead('Erase Me Please', { phone: ph, email: 'erase@example.com' });
    await call(jar.B1, 'POST', `/api/crm/leads/${l.id}/activity`, { type: 'NOTE', note: 'wants a call at 7pm, lives in Shankar Nagar' });
    expect((await call(jar.B1, 'POST', `/api/crm/leads/${l.id}/stage`, { stage: 'LOST', lostCode: 'BOUGHT_ELSEWHERE' })).status).toBe(200);
    const optLead = await mkLead('Optout Erase'); expect((await call(jar.B1, 'POST', `/api/crm/leads/${optLead.id}/optout`, {})).status).toBe(200);
    expect((await call(jar.BUILDER, 'POST', '/api/crm/retention/run')).status).toBe(403);
    await wait(2500);
    const run = await j(await call(jar.SUP, 'POST', '/api/crm/retention/run')); expect(run.erased).toBeGreaterThanOrEqual(2);
    const got = (await j(await call(jar.B1, 'GET', `/api/crm/leads/${l.id}`))).lead;
    expect(got.erasedAt).toBeTruthy(); expect(got.name).toMatch(/erased/); expect(got.phone).toBeFalsy(); expect(got.email).toBeUndefined(); expect(got.followUps).toHaveLength(0); expect(got.stage).toBe('LOST'); expect(got.lostCode).toBe('BOUGHT_ELSEWHERE');
    expect(JSON.stringify(got)).not.toContain('Shankar Nagar'); expect(JSON.stringify(got)).not.toContain(ph);
    expect((await j(await call(jar.B1, 'GET', `/api/crm/leads/${optLead.id}`))).lead.erasedAt).toBeTruthy();
    const exp = await (await call(jar.B1, 'GET', '/api/crm/leads/export?full=1')).text(); expect(exp).not.toContain(ph);
    expect((await call(jar.BUILDER, 'POST', `/api/crm/leads/${l.id}/stage`, { stage: 'NEW' })).status).toBe(409);
    // the same number can be registered again afterwards
    expect((await call(jar.B1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Came Back', phone: ph })).status).toBe(200);
    const bookings = (await j(await call(jar.BUILDER, 'GET', '/api/crm/bookings'))).bookings; expect(bookings.filter((b: any) => b.status === 'APPROVED').length).toBeGreaterThan(0);
  });
});
