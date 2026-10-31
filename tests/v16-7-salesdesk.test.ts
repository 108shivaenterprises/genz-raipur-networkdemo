import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  LEAD_SOURCES, LEAD_SOURCE_IDS, parseSource, cleanProfile, profileCompleteness, CALL_OUTCOMES, callStats, callOutcome, MAX_CALL_ATTEMPTS, FORWARD_PURPOSES,
  TEAM_ROLES, inferTeamRole, scheduleError, PLAN_TYPES, TOKEN_MODES, MISSING_LABEL,
} from '../src/shared/crmSales';
import { ROLE_PERMISSIONS } from '../server/permissions';

/** v16.7 "Sales Desk": lead source + customer details, telecaller calls, forwarding, booking request with amount + payment condition. */
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const email = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id).email;
async function login(who: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: who, password: cfg.demoPassword }) });
  expect(r.status, who).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const PROJ = 'PROJ-RAI-02';
let AV = 0; let UNIT = 0;
const unit = () => `V167-${++UNIT}`;
const TEAM = { POOJA: 'USR-TEAM-001', RAKESH: 'USR-TEAM-002', DIVYA: 'USR-TEAM-003', KOMAL: 'USR-TEAM-005' };

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v167-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true', CRM_LOST_RETENTION_DAYS: '0.00002', CRM_OPTOUT_RETENTION_DAYS: '0.00002' },
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  expect(cfg).toBeTruthy();
  jar.B1 = await login(email('USR-BRK-001')); jar.B2 = await login(email('USR-BRK-002'));
  jar.BUILDER = await login(email('USR-BUILDER-001')); jar.BUILDER2 = await login(email('USR-BUILDER-002'));
  jar.SUP = await login(cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').email);
  jar.POOJA = await login('9000030001'); jar.RAKESH = await login('9000030002'); jar.DIVYA = await login('9000030003'); jar.KOMAL = await login('9000030005');
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
const visited = ['CONTACTED', 'SITE_VISIT_SCHEDULED', 'SITE_VISITED'];
const getLead = async (cookie: string, id: string) => j(await call(cookie, 'GET', `/api/crm/leads/${id}`));
const allot = (leadId: string, memberId: string | null, cookie = jar.B1) => call(cookie, 'POST', '/api/team/allot/lead', { leadId, memberId });
const policy = (memberId: string, body: any, cookie = jar.B1) => call(cookie, 'PUT', `/api/pcontrol/team/${memberId}/policy`, body);
const futureLocal = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const tomorrow = () => new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

describe('pure rules', () => {
  it('lead sources: 15 sources, every one labelled in English and Hindi, ids unique; CSV cells map to ids', () => {
    expect(LEAD_SOURCES.length).toBe(15); expect(new Set(LEAD_SOURCE_IDS).size).toBe(15);
    for (const s of LEAD_SOURCES) { expect(s.en.length).toBeGreaterThan(2); expect(/[ऀ-ॿ]/.test(s.hi), s.id).toBe(true); expect(/[ऀ-ॿ]/.test(s.hintHi), s.id).toBe(true); }
    expect(parseSource('walk_in')).toBe('WALK_IN'); expect(parseSource('Property portal')).toBe('PROPERTY_PORTAL'); expect(parseSource('WALK-IN')).toBe('WALK_IN'); expect(parseSource('')).toBeUndefined(); expect(parseSource('nonsense')).toBeUndefined();
  });
  it('customer details: only the allowed keys; no income / PAN / Aadhaar / religion / caste / health / second phone', () => {
    for (const bad of ['income', 'pan', 'aadhaar', 'religion', 'caste', 'health', 'altPhone', 'salary']) expect(typeof cleanProfile({ [bad]: 'x' }), bad).toBe('string');
    expect(typeof cleanProfile({ purpose: 'LOTTERY' })).toBe('string'); expect(typeof cleanProfile({ familySize: 0 })).toBe('string'); expect(typeof cleanProfile({ familySize: 21 })).toBe('string'); expect(typeof cleanProfile({ familySize: 2.5 })).toBe('string');
    expect(typeof cleanProfile({ remarks: 'x'.repeat(301) })).toBe('string'); expect(typeof cleanProfile([])).toBe('string'); expect(typeof cleanProfile(null)).toBe('string');
    expect(cleanProfile({ purpose: 'SELF_USE', remarks: '  a   b  ', residenceCity: '', familySize: '4' })).toEqual({ purpose: 'SELF_USE', remarks: 'a b', familySize: 4 });
    expect(cleanProfile({ funding: 'SELF', loanStatus: 'SANCTIONED' })).toEqual({ funding: 'SELF' }); // a loan status makes no sense with own funds
  });
  it('details meter counts ten things a salesperson wants to know; every missing item has an English and Hindi label', () => {
    const e = profileCompleteness({}); expect(e.filled).toBe(0); expect(e.total).toBe(10);
    const f = profileCompleteness({ budgetMax: 5e6, profile: { purpose: 'INVESTMENT', funding: 'HOME_LOAN', timeline: 'M1_3', occupation: 'BUSINESS', residenceCity: 'Raipur', currentHome: 'RENT', familySize: 4, decisionMaker: 'self', bestTimeToCall: 'EVENING' } });
    expect(f.filled).toBe(10); expect(f.missing).toEqual([]);
    for (const k of e.missing) { expect(MISSING_LABEL[k]).toBeTruthy(); expect(/[ऀ-ॿ]/.test(MISSING_LABEL[k][1])).toBe(true); }
  });
  it('call outcomes: eight, bilingual; only visit / call-back need a time; "unreached" after the maximum tries with no connection', () => {
    expect(CALL_OUTCOMES.length).toBe(8);
    for (const o of CALL_OUTCOMES) expect(/[ऀ-ॿ]/.test(o.hi), o.id).toBe(true);
    expect(CALL_OUTCOMES.filter(o => o.needsWhen).map(o => o.id).sort()).toEqual(['CALLBACK', 'VISIT_FIXED']);
    const mk = (ids: string[]) => ({ activities: ids.map((id, i) => ({ type: 'CALL', at: new Date(Date.now() - i * 1000).toISOString(), call: { outcome: id } })) });
    expect(callStats(mk(['NO_ANSWER', 'NO_ANSWER', 'NO_ANSWER', 'BUSY'])).unreached).toBe(false);
    expect(callStats(mk(Array(MAX_CALL_ATTEMPTS).fill('NO_ANSWER'))).unreached).toBe(true);
    expect(callStats(mk([...Array(MAX_CALL_ATTEMPTS).fill('NO_ANSWER'), 'INTERESTED'])).unreached).toBe(false);
    const st = callStats(mk(['INTERESTED', 'NO_ANSWER'])); expect(st.attempts).toBe(2); expect(st.connected).toBe(1); expect(st.lastOutcome).toBe('INTERESTED');
    expect(callOutcome('NOPE')).toBeUndefined();
  });
  it('payment schedule must total 100%; team role is read out of an old free-text title', () => {
    expect(scheduleError([{ pct: 10 }, { pct: 90 }])).toBe(''); expect(scheduleError([{ pct: 10 }, { pct: 80 }])).toMatch(/100/); expect(scheduleError([])).toMatch(/1–12/); expect(scheduleError(undefined)).toBe('');
    expect(inferTeamRole('Telecaller')).toBe('TELECALLER'); expect(inferTeamRole('Site executive')).toBe('SITE_COORDINATOR'); expect(inferTeamRole('Sales coordinator')).toBe('SITE_COORDINATOR'); expect(inferTeamRole('Closing manager')).toBe('CLOSING_MANAGER');
    expect(inferTeamRole('Sales executive')).toBe('SALES_EXECUTIVE'); expect(inferTeamRole('whatever')).toBe('OTHER'); expect(inferTeamRole('x', 'ASSISTANT')).toBe('ASSISTANT');
    for (const l of [TEAM_ROLES, PLAN_TYPES, TOKEN_MODES, FORWARD_PURPOSES]) for (const o of l) expect(/[ऀ-ॿ]/.test(o.hi) || o.hi === o.en, o.id).toBe(true);
  });
  it('permissions: builder and employees may be given the booking-request screen; the money-claim routes still insist on being the associate', () => {
    expect(ROLE_PERMISSIONS.DEVELOPER_BUILDER).toContain('crm:booking_request'); expect(ROLE_PERMISSIONS.TEAM_MEMBER).toContain('crm:booking_request'); expect(ROLE_PERMISSIONS.BROKER).toContain('crm:booking_request');
    expect(ROLE_PERMISSIONS.TEAM_MEMBER).not.toContain('crm:booking_decide'); expect(ROLE_PERMISSIONS.TEAM_MEMBER).not.toContain('crm:payout'); expect(ROLE_PERMISSIONS.BROKER).not.toContain('crm:booking_decide');
  });
});

describe('lead source and customer details', () => {
  let L: any;
  it('a lead can be registered with any of the sources, a source detail and a customer-details card', async () => {
    L = await mkLead('Src Lead', { source: 'PROPERTY_PORTAL', sourceDetail: '99acres', budgetMax: 6000000, profile: { purpose: 'SELF_USE', funding: 'HOME_LOAN', loanStatus: 'IN_PROCESS', timeline: 'M1_3', residenceCity: 'Bilaspur', familySize: 4, decisionMaker: 'self + wife' } });
    expect(L.source).toBe('PROPERTY_PORTAL'); expect(L.sourceDetail).toBe('99acres'); expect(L.profile.loanStatus).toBe('IN_PROCESS');
    const g = (await getLead(jar.B1, L.id)).lead; expect(g.detailsFilled).toBe(7); expect(g.detailsTotal).toBe(10);
    for (const s of LEAD_SOURCE_IDS) expect((await call(jar.B1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'S ' + s, phone: rnd(), source: s })).status, s).toBe(200);
  });
  it('bad source, unknown / sensitive detail keys and out-of-range values are refused with a clear message', async () => {
    const post = (b: any) => call(jar.B1, 'POST', '/api/crm/leads', { consent: true, projectId: PROJ, name: 'Bad Lead', phone: rnd(), ...b });
    expect((await post({ source: 'MAGIC' })).status).toBe(400);
    const r = await post({ profile: { aadhaar: '1234' } }); expect(r.status).toBe(400); expect((await j(r)).error).toMatch(/aadhaar/i);
    expect((await post({ profile: { income: 100000 } })).status).toBe(400); expect((await post({ profile: { familySize: 99 } })).status).toBe(400); expect((await post({ profile: { purpose: 'X' } })).status).toBe(400);
    expect((await post({ sourceDetail: 'x'.repeat(101) })).status).toBe(400);
  });
  it('the details can be edited (a full replace; {} clears them) and every change is in the timeline; only the lead owner can change the source', async () => {
    const a = await call(jar.B1, 'PATCH', `/api/crm/leads/${L.id}`, { profile: { purpose: 'INVESTMENT', timeline: 'M3_6' }, source: 'SOCIAL_MEDIA', sourceDetail: 'Diwali offer' });
    expect(a.status, await a.clone().text()).toBe(200); const l = (await j(a)).lead;
    expect(l.profile).toEqual({ purpose: 'INVESTMENT', timeline: 'M3_6' }); expect(l.source).toBe('SOCIAL_MEDIA'); expect(l.activities.some((x: any) => /source changed/i.test(x.note))).toBe(true); expect(l.activities.some((x: any) => /details updated/i.test(x.note))).toBe(true);
    expect((await j(await call(jar.B1, 'PATCH', `/api/crm/leads/${L.id}`, { profile: {} }))).lead.profile).toBeUndefined();
    expect((await call(jar.B2, 'PATCH', `/api/crm/leads/${L.id}`, { source: 'OTHER' })).status).toBe(404); // another associate cannot even see it
    expect((await allot(L.id, TEAM.POOJA)).status).toBe(200);
    expect((await call(jar.POOJA, 'PATCH', `/api/crm/leads/${L.id}`, { source: 'OTHER' })).status).toBe(403); // an employee cannot rewrite the source report
    expect((await call(jar.POOJA, 'PATCH', `/api/crm/leads/${L.id}`, { profile: { bestTimeToCall: 'EVENING' }, budgetMax: 7000000 })).status).toBe(200); // but fills in what she learns on the call
  });
  it('an opted-out customer\'s details can no longer be edited', async () => {
    const o = await mkLead('Opt Out Details'); expect((await call(jar.B1, 'POST', `/api/crm/leads/${o.id}/optout`, {})).status).toBe(200);
    const r = await call(jar.B1, 'PATCH', `/api/crm/leads/${o.id}`, { profile: { purpose: 'SELF_USE' } }); expect(r.status).toBe(409); expect((await j(r)).code).toBe('OPTED_OUT');
    expect((await call(jar.B1, 'POST', `/api/crm/leads/${o.id}/call`, { outcome: 'INTERESTED' })).status).toBe(409);
  });
  it('CSV import takes a source column and a default source; an unknown source is a row error, not a silent "other"', async () => {
    const csv = `name,phone,source,source_detail\nCsv One,${rnd()},Walk-in,Reception\nCsv Two,${rnd()},hoarding_or_print,Pandri bridge\nCsv Three,${rnd()},carrier pigeon,\nCsv Four,${rnd()},,`;
    const r = await j(await call(jar.B1, 'POST', '/api/crm/leads/import', { projectId: PROJ, csv, consent: true, source: 'EXHIBITION', sourceDetail: 'Raipur Expo' }));
    expect(r.imported).toBe(3); expect(r.failed).toBe(1); expect(r.results.find((x: any) => !x.ok).error).toMatch(/source/i);
    const all = (await j(await call(jar.B1, 'GET', '/api/crm/leads?limit=500'))).leads;
    const one = all.find((l: any) => l.name === 'Csv One'); const two = all.find((l: any) => l.name === 'Csv Two'); const four = all.find((l: any) => l.name === 'Csv Four');
    expect(one.source).toBe('WALK_IN'); expect(one.sourceDetail).toBe('Reception'); expect(two.source).toBe('HOARDING_OR_PRINT'); expect(four.source).toBe('EXHIBITION'); expect(four.sourceDetail).toBe('Raipur Expo');
    const exp = await (await call(jar.B1, 'GET', '/api/crm/leads/export?full=1')).text(); expect(exp).toMatch(/source_detail/); expect(exp).toContain('Pandri bridge');
  });
  it('which other projects the customer is considering stays with the associate: the builder never sees it, and saving the builder\'s own edits does not wipe it', async () => {
    const l = await mkLead('Competitor Lead', { profile: { competitors: 'Rival Heights, Sunrise Villas', purpose: 'SELF_USE' } });
    expect((await getLead(jar.B1, l.id)).lead.profile.competitors).toMatch(/Rival/);
    const bl = (await getLead(jar.BUILDER, l.id)).lead; expect(bl.profile.competitors).toBeUndefined(); expect(bl.profile.purpose).toBe('SELF_USE'); expect(JSON.stringify(bl)).not.toMatch(/Rival|Sunrise/);
    expect(JSON.stringify((await j(await call(jar.BUILDER, 'GET', '/api/crm/leads?limit=500'))).leads.find((x: any) => x.id === l.id))).not.toMatch(/Rival/);
    expect((await call(jar.BUILDER, 'PATCH', `/api/crm/leads/${l.id}`, { profile: { purpose: 'INVESTMENT', timeline: 'M1_3' } })).status).toBe(200);
    const mine = (await getLead(jar.B1, l.id)).lead.profile; expect(mine.competitors).toMatch(/Rival/); expect(mine.purpose).toBe('INVESTMENT');
    expect((await call(jar.BUILDER, 'PATCH', `/api/crm/leads/${l.id}`, { profile: {} })).status).toBe(200); expect((await getLead(jar.B1, l.id)).lead.profile).toEqual({ competitors: 'Rival Heights, Sunrise Villas' });
    expect(JSON.stringify(await (await call(jar.BUILDER, 'GET', '/api/crm/leads/export?full=1')).text())).not.toMatch(/Rival/);
  });
  it('the source filter and the source report use the new list', async () => {
    expect((await j(await call(jar.B1, 'GET', '/api/crm/leads?source=PROPERTY_PORTAL&limit=500'))).leads.every((l: any) => l.source === 'PROPERTY_PORTAL')).toBe(true);
    const rep = await j(await call(jar.B1, 'GET', '/api/crm/reports?days=365')); expect(rep.bySource.map((s: any) => s.id)).toEqual(expect.arrayContaining(['WALK_IN', 'EXHIBITION']));
  });
});

describe('telecaller: call log and call list', () => {
  let L: any;
  it('a first connected call moves a NEW lead to CONTACTED, counts as an attempt and is a structured timeline entry', async () => {
    L = await mkLead('Call Lead'); expect(L.callAttempts).toBe(0);
    const r = await j(await call(jar.B1, 'POST', `/api/crm/leads/${L.id}/call`, { outcome: 'INTERESTED', note: 'wants 3 BHK', durationMin: 4 }));
    expect(r.lead.stage).toBe('CONTACTED'); expect(r.lead.callAttempts).toBe(1); expect(r.lead.callsConnected).toBe(1); expect(r.lead.lastCallOutcome).toBe('INTERESTED');
    const a = r.lead.activities.find((x: any) => x.type === 'CALL'); expect(a.call).toEqual({ outcome: 'INTERESTED', durationMin: 4, attempt: 1 }); expect(a.note).toMatch(/wants 3 BHK/);
  });
  it('"visit fixed" and "call back" need a date; the right follow-up is created; bad input is refused', async () => {
    const x = (b: any) => call(jar.B1, 'POST', `/api/crm/leads/${L.id}/call`, b);
    expect((await x({})).status).toBe(400); expect((await x({ outcome: 'BOGUS' })).status).toBe(400);
    expect((await x({ outcome: 'VISIT_FIXED' })).status).toBe(400); expect((await x({ outcome: 'CALLBACK', when: 'soon' })).status).toBe(400);
    expect((await x({ outcome: 'CALLBACK', when: new Date(Date.now() - 86400000).toISOString() })).status).toBe(400);
    expect((await x({ outcome: 'INTERESTED', durationMin: -3 })).status).toBe(400); expect((await x({ outcome: 'INTERESTED', durationMin: 2.5 })).status).toBe(400);
    const v = await j(await x({ outcome: 'VISIT_FIXED', when: futureLocal(48), note: 'Saturday 11am' }));
    expect(v.lead.stage).toBe('SITE_VISIT_SCHEDULED'); const fu = v.lead.followUps.find((f: any) => !f.done && f.channel === 'SITE_VISIT'); expect(fu).toBeTruthy(); expect(fu.note).toMatch(/Saturday/);
    const c = await j(await x({ outcome: 'CALLBACK', when: futureLocal(5) })); expect(c.lead.followUps.some((f: any) => !f.done && f.channel === 'CALL')).toBe(true); expect(c.lead.callAttempts).toBe(3);
  });
  it('not reaching the customer sets a retry reminder; five tries with no answer suggests another channel; a wrong number is tagged', async () => {
    const n = await mkLead('Unreachable Lead');
    const first = await j(await call(jar.B1, 'POST', `/api/crm/leads/${n.id}/call`, { outcome: 'NO_ANSWER' })); expect(first.lead.stage).toBe('NEW'); expect(first.lead.followUps.some((f: any) => !f.done && /retry/i.test(f.note))).toBe(true);
    let last: any; for (let i = 0; i < 4; i++) last = await j(await call(jar.B1, 'POST', `/api/crm/leads/${n.id}/call`, { outcome: i % 2 ? 'BUSY' : 'SWITCHED_OFF' }));
    expect(last.suggest).toBe('TRY_WHATSAPP'); expect(last.lead.callAttempts).toBe(5); expect(last.attemptsLeft).toBe(0);
    expect((await j(await call(jar.B1, 'GET', '/api/crm/alerts'))).alerts.find((a: any) => a.kind === 'UNREACHABLE').ids).toContain(n.id);
    const w = await mkLead('Wrong Number'); const wr = await j(await call(jar.B1, 'POST', `/api/crm/leads/${w.id}/call`, { outcome: 'WRONG_NUMBER' }));
    expect(wr.suggest).toBe('FIX_NUMBER'); expect(wr.lead.tags).toContain('wrong-number');
    const nl = await mkLead('Not Interested Lead'); expect((await j(await call(jar.B1, 'POST', `/api/crm/leads/${nl.id}/call`, { outcome: 'NOT_INTERESTED' }))).suggest).toBe('LOST');
  });
  it('the call list shows fresh un-called leads and due follow-ups; a called lead drops off; an employee sees only what is allotted to them', async () => {
    const fresh = await mkLead('Fresh For Queue'); const due = await mkLead('Due For Queue');
    await call(jar.B1, 'POST', `/api/crm/leads/${due.id}/followups`, { dueAt: new Date(Date.now() - 3600_000).toISOString(), note: 'call about booking', channel: 'CALL' });
    const q = await j(await call(jar.B1, 'GET', '/api/crm/call-queue'));
    const f = q.queue.find((r: any) => r.id === fresh.id); const d = q.queue.find((r: any) => r.id === due.id);
    expect(f.reason).toBe('NEW_UNCALLED'); expect(d.reason).toBe('FOLLOWUP_DUE'); expect(d.followUpNote).toMatch(/booking/); expect(q.queue.findIndex((r: any) => r.id === d.id)).toBeLessThan(q.queue.findIndex((r: any) => r.id === f.id));
    expect(q.counts.due).toBeGreaterThan(0); expect(q.counts.fresh).toBeGreaterThan(0);
    await call(jar.B1, 'POST', `/api/crm/leads/${fresh.id}/call`, { outcome: 'INTERESTED' });
    expect((await j(await call(jar.B1, 'GET', '/api/crm/call-queue'))).queue.some((r: any) => r.id === fresh.id)).toBe(false);
    await allot(due.id, TEAM.POOJA);
    const pq = await j(await call(jar.POOJA, 'GET', '/api/crm/call-queue')); expect(pq.queue.map((r: any) => r.id)).toContain(due.id); expect(pq.queue.some((r: any) => r.id === fresh.id)).toBe(false); // only what is allotted to her
    expect((await j(await call(jar.RAKESH, 'GET', '/api/crm/call-queue'))).queue.some((r: any) => r.id === due.id)).toBe(false);
    expect((await j(await call(jar.B1, 'GET', `/api/crm/call-queue?memberId=${TEAM.POOJA}`))).queue.every((r: any) => r.id !== fresh.id)).toBe(true);
    expect((await j(await call(jar.B2, 'GET', '/api/crm/call-queue'))).queue.some((r: any) => r.id === due.id)).toBe(false);
    expect((await call(jar.B2, 'POST', `/api/crm/leads/${due.id}/call`, { outcome: 'INTERESTED' })).status).toBe(404);
  });
});

describe('forwarding a lead to the next executive / coordinator', () => {
  let L: any;
  it('an employee forwards an allotted lead with a note; the receiver gets it, the sender no longer sees it, and the history is kept', async () => {
    L = await mkLead('Forward Lead'); await allot(L.id, TEAM.POOJA);
    const x = (b: any, c = jar.POOJA) => call(c, 'POST', `/api/crm/leads/${L.id}/forward`, b);
    expect((await x({ toMemberId: TEAM.RAKESH, purpose: 'SITE_VISIT', note: 'hi' })).status).toBe(400); // a note is the whole point
    expect((await x({ toMemberId: TEAM.DIVYA, note: 'Spoke twice, wants a site visit' })).status).toBe(400); // another team's employee
    expect((await x({ toMemberId: 'USR-BRK-001', note: 'Spoke twice, wants a site visit' })).status).toBe(400); // not an employee at all
    expect((await x({ toMemberId: TEAM.POOJA, note: 'Spoke twice, wants a site visit' })).status).toBe(409); // already with her
    expect((await x({ toMemberId: TEAM.RAKESH, purpose: 'SITE_VISIT', note: 'Spoke twice, wants a Saturday site visit' }, jar.RAKESH)).status).toBe(404); // not his lead — he cannot even see it
    const ok = await x({ toMemberId: TEAM.RAKESH, purpose: 'SITE_VISIT', note: 'Spoke twice, wants a Saturday site visit' }); expect(ok.status, await ok.clone().text()).toBe(200);
    const r = await j(ok); expect(r.forwardedTo.name).toMatch(/Rakesh/); expect(JSON.stringify(r)).not.toMatch(/phone|Spoke twice/); // a receipt, not the lead
    expect((await call(jar.POOJA, 'GET', `/api/crm/leads/${L.id}`)).status).toBe(404);
    const own = (await getLead(jar.B1, L.id)).lead; expect(own.assignedMemberName).toMatch(/Rakesh/); expect(own.handoffs).toHaveLength(1); expect(own.handoffs[0]).toMatchObject({ fromName: expect.stringMatching(/Pooja/), toName: expect.stringMatching(/Rakesh/), purpose: 'SITE_VISIT' }); expect(own.forwardUnseen).toBe(true);
    expect(own.activities[0].note).toMatch(/Forwarded .*→/);
  });
  it('the receiver is alerted until they open it; opening is the "seen" receipt; the owner sees that', async () => {
    const al = (await j(await call(jar.RAKESH, 'GET', '/api/crm/alerts'))).alerts.find((a: any) => a.kind === 'FORWARDED_TO_ME'); expect(al.ids).toContain(L.id);
    expect((await j(await call(jar.RAKESH, 'GET', '/api/crm/leads?limit=100'))).leads.find((l: any) => l.id === L.id).forwardUnseen).toBe(true);
    const g = (await getLead(jar.RAKESH, L.id)).lead; expect(g.handoffs[0].note).toMatch(/Saturday/);
    const after = (await getLead(jar.B1, L.id)).lead; expect(after.handoffs[0].seenAt).toBeTruthy(); expect(after.forwardUnseen).toBe(false);
    expect((await j(await call(jar.RAKESH, 'GET', '/api/crm/alerts'))).alerts.some((a: any) => a.kind === 'FORWARDED_TO_ME')).toBe(false);
  });
  it('who can be forwarded to: teammates with a reason when blocked; the owner can forward too; employer control can switch forwarding off per employee', async () => {
    const t = await j(await call(jar.RAKESH, 'GET', `/api/crm/leads/${L.id}/forward-targets`)); expect(t.canForwardNow).toBe(true);
    expect(t.targets.map((x: any) => x.id)).toEqual([TEAM.POOJA]); expect(t.targets[0].role).toBe('TELECALLER'); expect(JSON.stringify(t)).not.toMatch(/phone|9000030/);
    expect((await policy(TEAM.POOJA, { onLeave: true })).status).toBe(200);
    expect((await j(await call(jar.RAKESH, 'GET', `/api/crm/leads/${L.id}/forward-targets`))).targets[0].blocked).toBe('on leave');
    expect((await call(jar.RAKESH, 'POST', `/api/crm/leads/${L.id}/forward`, { toMemberId: TEAM.POOJA, note: 'Visit done, please follow up' })).status).toBe(409);
    expect((await policy(TEAM.POOJA, { onLeave: false })).status).toBe(200);
    // the owner forwards (a lead sitting with nobody goes straight to an employee)
    const o = await mkLead('Owner Forward'); expect((await call(jar.B1, 'POST', `/api/crm/leads/${o.id}/forward`, { toMemberId: TEAM.RAKESH, purpose: 'FOLLOW_UP', note: 'Please call him tomorrow' })).status).toBe(200);
    expect((await getLead(jar.B1, o.id)).lead.assignedMemberName).toMatch(/Rakesh/);
    expect((await call(jar.B2, 'POST', `/api/crm/leads/${o.id}/forward`, { toMemberId: TEAM.DIVYA, note: 'Please call him tomorrow' })).status).toBe(404);
    // switching it off for Rakesh
    expect((await policy(TEAM.RAKESH, { canForward: false })).status).toBe(200);
    const blocked = await call(jar.RAKESH, 'POST', `/api/crm/leads/${o.id}/forward`, { toMemberId: TEAM.POOJA, note: 'Please call him tomorrow' }); expect(blocked.status).toBe(403);
    expect((await getLead(jar.RAKESH, o.id)).lead.memberCan).toEqual({ forward: false, requestBooking: false });
    expect((await j(await call(jar.RAKESH, 'GET', `/api/crm/leads/${o.id}/forward-targets`))).canForwardNow).toBe(false);
    await policy(TEAM.RAKESH, { canForward: true });
  });
  it('a builder forwards a builder-desk lead to their own employee, but not an associate\'s lead; lost and opted-out leads cannot be forwarded', async () => {
    const bl = await mkLead('Builder Desk Lead', {}, jar.BUILDER); expect(bl.associateId).toBe('');
    expect((await call(jar.BUILDER, 'POST', `/api/crm/leads/${bl.id}/forward`, { toMemberId: TEAM.KOMAL, purpose: 'CLOSING', note: 'Hot lead, close this week' })).status).toBe(200);
    expect((await call(jar.BUILDER, 'POST', `/api/crm/leads/${bl.id}/forward`, { toMemberId: TEAM.POOJA, note: 'Another team entirely' })).status).toBe(400);
    const ass = await mkLead('Associate Lead For Builder');
    expect((await call(jar.BUILDER, 'POST', `/api/crm/leads/${ass.id}/forward`, { toMemberId: TEAM.KOMAL, note: 'This is not the builder\'s to move' })).status).toBe(403);
    const lost = await mkLead('Lost Forward'); await call(jar.B1, 'POST', `/api/crm/leads/${lost.id}/stage`, { stage: 'LOST', lostCode: 'PRICE' });
    expect((await call(jar.B1, 'POST', `/api/crm/leads/${lost.id}/forward`, { toMemberId: TEAM.RAKESH, note: 'Trying again later maybe' })).status).toBe(403);
  });
});

describe('booking request: booking amount, payment condition, who may raise it', () => {
  const req = (lead: string, b: any, c = jar.B1) => call(c, 'POST', `/api/crm/leads/${lead}/booking-request`, b);
  const good = (o: any = {}) => ({ unitNo: unit(), agreementValue: AV, tokenAmount: 0, ...o });
  it('the booking amount must say how it was paid; refs, dates and amounts are validated', async () => {
    const l = await mkLead('Amount Rules'); await stageTo(l.id, visited);
    const t = (b: any) => req(l.id, good(b));
    expect((await t({ tokenAmount: 50000 })).status).toBe(400); // no mode
    const nr = await t({ tokenAmount: 50000, tokenMode: 'CHEQUE' }); expect(nr.status).toBe(400); expect((await j(nr)).error).toMatch(/cheque|UTR/i);
    expect((await t({ tokenAmount: 50000, tokenMode: 'UPI', tokenRef: 'ab' })).status).toBe(400);
    expect((await t({ tokenAmount: 50000, tokenMode: 'UPI', tokenRef: 'UTR998', tokenPaidOn: tomorrow() })).status).toBe(400);
    expect((await t({ tokenAmount: AV + 1, tokenMode: 'CASH' })).status).toBe(400);
    expect((await t({ tokenAmount: 1000, tokenMode: 'WIRE', tokenRef: 'xx1' })).status).toBe(400);
    expect((await t({ plan: { planType: 'SPACE' } })).status).toBe(400);
    expect((await t({ plan: { planType: 'TIME_LINKED', schedule: [{ name: 'A', pct: 40, dueInDays: 0 }, { name: 'Bee', pct: 40, dueInDays: 30 }] } })).status).toBe(400); // 80%
    expect((await t({ plan: { planType: 'TIME_LINKED', schedule: [] } })).status).toBe(400);
    expect((await t({ plan: { planType: 'LOAN_LINKED', funding: 'HOME_LOAN', loanAmount: AV + 1 } })).status).toBe(400);
    expect((await t({ plan: { planType: 'CUSTOM' } })).status).toBe(400); // custom needs lines or words
    expect((await t({ plan: { planType: 'STANDARD', secret: 1 } })).status).toBe(400); // strict
    expect((await t({ plan: { planType: 'STANDARD', expectedRegistryBy: '31/12/2026' } })).status).toBe(400);
  });
  it('a valid request records the amount as a CLAIM (never "paid"), the plan, the co-applicant and who raised it; own-funds drops the loan fields', async () => {
    const l = await mkLead('Claim Rules', { profile: { funding: 'HOME_LOAN' } }); await stageTo(l.id, visited);
    const first = Math.round(AV * 0.1);
    const r = await req(l.id, good({ tokenAmount: first + 1000, tokenMode: 'NEFT_RTGS', tokenRef: 'UTR-7788', tokenPaidOn: yesterday(), coApplicantName: 'Mrs Sharma', note: 'wants top floor',
      plan: { planType: 'CONSTRUCTION_LINKED', funding: 'SELF', bank: 'SBI', loanAmount: 100000, conditions: 'free parking', discountAsked: 50000, expectedRegistryBy: '2027-03-31', schedule: [{ name: 'Booking', pct: 10, dueInDays: 0 }, { name: 'Plinth', pct: 40, dueInDays: 120 }, { name: 'Possession', pct: 50, dueInDays: 400 }] } }));
    expect(r.status, await r.clone().text()).toBe(200); const b = (await j(r)).booking;
    expect(b.token).toMatchObject({ amount: first + 1000, mode: 'NEFT_RTGS', ref: 'UTR-7788', status: 'CLAIMED' }); expect(b.token.claimedByName).toBeTruthy();
    expect(b.paymentSchedule.map((m: any) => m.paid)).toEqual([false, false, false]); expect(b.collectedAmount).toBe(0); // the old "token >= first instalment => paid" shortcut is gone
    expect(b.paymentSchedule.map((m: any) => m.name)).toEqual(['Booking', 'Plinth', 'Possession']); expect(b.paymentSchedule.reduce((a: number, m: any) => a + m.amount, 0)).toBe(AV);
    expect(b.plan).toMatchObject({ planType: 'CONSTRUCTION_LINKED', funding: 'SELF', conditions: 'free parking', discountAsked: 50000, expectedRegistryBy: '2027-03-31' }); expect(b.plan.bank).toBeUndefined(); expect(b.plan.loanAmount).toBeUndefined();
    expect(b.coApplicantName).toBe('Mrs Sharma'); expect(b.requestedBy).toMatchObject({ role: 'BROKER' }); expect(b.direct).toBeUndefined(); expect(b.brokerageAmount).toBeGreaterThan(0);
    // the builder sees the whole picture
    const bb = (await j(await call(jar.BUILDER, 'GET', '/api/crm/bookings'))).bookings.find((x: any) => x.id === b.id); expect(bb.token.status).toBe('CLAIMED'); expect(bb.plan.planType).toBe('CONSTRUCTION_LINKED');
    // booking a unit with no money paid yet is fine too
    const l2 = await mkLead('No Token'); await stageTo(l2.id, visited); const r2 = await req(l2.id, good()); expect(r2.status).toBe(200); expect((await j(r2)).booking.token).toBeUndefined();
    // a lead that has not visited the site cannot be booked
    const l3 = await mkLead('Not Visited'); expect((await req(l3.id, good())).status).toBe(409);
  });
  it('the builder confirms the booking amount while approving: it becomes real receipts on the schedule, and brokerage follows the collection', async () => {
    const l = await mkLead('Approve With Token'); await stageTo(l.id, visited);
    const amt = Math.round(AV * 0.05);
    const b = (await j(await req(l.id, good({ tokenAmount: amt, tokenMode: 'CHEQUE', tokenRef: 'CHQ-123456' })))).booking;
    expect((await call(jar.B1, 'POST', `/api/crm/bookings/${b.id}/decision`, { decision: 'APPROVE' })).status).toBe(403); // the associate cannot approve her own request
    expect((await call(jar.BUILDER2, 'POST', `/api/crm/bookings/${b.id}/decision`, { decision: 'APPROVE', tokenReceived: true })).status).toBe(404);
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b.id}/decision`, { decision: 'APPROVE', tokenReceived: 'yes' })).status).toBe(400);
    const ap = await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b.id}/decision`, { decision: 'APPROVE', tokenReceived: true }); expect(ap.status, await ap.clone().text()).toBe(200);
    const a = (await j(ap)).booking; expect(a.status).toBe('APPROVED'); expect(a.token.status).toBe('RECEIVED'); expect(a.token.confirmedByName).toBeTruthy();
    expect(a.collectedAmount).toBe(amt); expect(a.paymentSchedule[0].receipts[0]).toMatchObject({ amount: amt, mode: 'CHEQUE', ref: 'CHQ-123456' });
    expect(Math.abs(a.payableBrokerage - Math.round((a.brokerageAmount * amt) / AV))).toBeLessThanOrEqual(1); expect(a.payableBrokerage).toBeLessThan(a.brokerageAmount);
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b.id}/token`, { received: true })).status).toBe(409); // once is enough
  });
  it('left unconfirmed it stays "claimed" with no money recorded; the builder can confirm later or say it never arrived (with a reason); the associate cannot', async () => {
    const mk = async (n: string) => { const l = await mkLead(n); await stageTo(l.id, visited); return (await j(await req(l.id, good({ tokenAmount: 30000, tokenMode: 'UPI', tokenRef: 'UTR-5521' })))).booking; };
    const b1 = await mk('Later Confirm'); const ap = (await j(await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b1.id}/decision`, { decision: 'APPROVE' }))).booking;
    expect(ap.token.status).toBe('CLAIMED'); expect(ap.collectedAmount).toBe(0); expect(ap.payableBrokerage).toBe(0);
    expect((await call(jar.B1, 'POST', `/api/crm/bookings/${b1.id}/token`, { received: true })).status).toBe(403);
    expect((await call(jar.BUILDER2, 'POST', `/api/crm/bookings/${b1.id}/token`, { received: true })).status).toBe(404);
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b1.id}/token`, {})).status).toBe(400);
    const c = await j(await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b1.id}/token`, { received: true, note: 'matched in bank' })); expect(c.booking.token.status).toBe('RECEIVED'); expect(c.booking.collectedAmount).toBe(30000);
    const b2 = await mk('Never Arrived'); await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b2.id}/decision`, { decision: 'APPROVE' });
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b2.id}/token`, { received: false })).status).toBe(400); // a reason is required
    const n = await j(await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b2.id}/token`, { received: false, note: 'cheque bounced' })); expect(n.booking.token.status).toBe('NOT_RECEIVED'); expect(n.booking.collectedAmount).toBe(0);
    const lead = (await getLead(jar.B1, b2.leadId)).lead; expect(lead.activities.some((x: any) => /NOT received/.test(x.note))).toBe(true);
  });
  it('a booking amount cannot be confirmed as received on a booking that is not approved yet; a rejected request releases the unit', async () => {
    const l = await mkLead('Reject Me'); await stageTo(l.id, visited); const u = unit();
    const b = (await j(await req(l.id, good({ unitNo: u, tokenAmount: 20000, tokenMode: 'CASH' })))).booking;
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b.id}/token`, { received: true })).status).toBe(409);
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b.id}/decision`, { decision: 'REJECT', note: 'ok' })).status).toBe(400);
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b.id}/decision`, { decision: 'REJECT', note: 'Unit already sold offline' })).status).toBe(200);
    const again = await mkLead('Same Unit Again'); await stageTo(again.id, visited); expect((await req(again.id, good({ unitNo: u }))).status).toBe(200);
  });
  it('an employee can raise a booking request only when the employer allows it; she never sees brokerage, payouts or the money ledger', async () => {
    const l = await mkLead('Employee Booking'); await stageTo(l.id, visited); await allot(l.id, TEAM.POOJA);
    const body = good({ tokenAmount: 25000, tokenMode: 'UPI', tokenRef: 'UTR-EMP1' });
    const off = await req(l.id, body, jar.POOJA); expect(off.status).toBe(403); expect((await j(off)).error).toMatch(/employer/i);
    expect((await policy(TEAM.POOJA, { canRequestBooking: true })).status).toBe(200);
    expect((await req(l.id, good({ unitNo: 'x' }), jar.RAKESH)).status).not.toBe(200); // not his lead, and his employer has not allowed it either
    const ok = await req(l.id, body, jar.POOJA); expect(ok.status, await ok.clone().text()).toBe(200); const m = (await j(ok)).booking;
    expect(m.forMember).toBe(true); expect(m.token.status).toBe('CLAIMED'); expect(m.requestedBy.onBehalfOf).toBeTruthy();
    for (const k of ['brokerageAmount', 'brokeragePct', 'payouts', 'paymentSchedule', 'tdsPct', 'brokeragePaidAmount']) expect(m, k).not.toHaveProperty(k);
    const seen = await getLead(jar.POOJA, l.id); expect(seen.booking.forMember).toBe(true); expect(seen.booking).not.toHaveProperty('brokerageAmount'); expect(seen.booking).not.toHaveProperty('paymentSchedule');
    expect((await call(jar.POOJA, 'GET', `/api/crm/bookings/${m.id}/ledger`)).status).toBe(404); expect((await j(await call(jar.POOJA, 'GET', '/api/crm/bookings'))).bookings).toEqual([]);
    const bb = (await j(await call(jar.B1, 'GET', '/api/crm/bookings'))).bookings.find((x: any) => x.id === m.id); expect(bb.requestedBy.name).toMatch(/Pooja/); expect(bb.requestedBy.onBehalfOf).toBeTruthy();
    expect((await call(jar.POOJA, 'POST', `/api/crm/bookings/${m.id}/decision`, { decision: 'APPROVE' })).status).toBe(403); // an employee never decides
    expect((await call(jar.POOJA, 'POST', `/api/crm/bookings/${m.id}/token`, { received: true })).status).toBe(403);
    await call(jar.BUILDER, 'POST', `/api/crm/bookings/${m.id}/decision`, { decision: 'APPROVE', tokenReceived: true });
    const afterApproval = await getLead(jar.POOJA, l.id); expect(afterApproval.booking.status).toBe('APPROVED'); expect(afterApproval.booking.token.status).toBe('RECEIVED'); expect(afterApproval.booking).not.toHaveProperty('brokerageAmount');
  });
  it('builder-desk sale: the builder raises and approves it without a mandate; no brokerage, no payout; associates cannot see or raise it', async () => {
    const l = await mkLead('Desk Sale', {}, jar.BUILDER); await stageTo(l.id, visited, jar.BUILDER);
    expect((await req(l.id, good(), jar.B1)).status).toBe(404); // an associate has no access to a builder-desk lead
    expect((await req(l.id, good(), jar.BUILDER2)).status).toBe(404);
    const r = await req(l.id, good({ tokenAmount: 100000, tokenMode: 'NEFT_RTGS', tokenRef: 'UTR-DESK1', plan: { planType: 'DOWN_PAYMENT', funding: 'SELF', discountAsked: 100000 } }), jar.BUILDER);
    expect(r.status, await r.clone().text()).toBe(200); const b = (await j(r)).booking; expect(b.direct).toBe(true); expect(b.brokerageAmount).toBe(0); expect(b.associateId).toBe(''); expect(b.mandateId).toBeUndefined();
    const before = (await j(await call(jar.BUILDER, 'GET', '/api/builder/projects'))).projects.find((p: any) => p.id === PROJ);
    const ap = await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b.id}/decision`, { decision: 'APPROVE', tokenReceived: true }); expect(ap.status, await ap.clone().text()).toBe(200);
    const a = (await j(ap)).booking; expect(a.status).toBe('APPROVED'); expect(a.brokerageAmount).toBe(0); expect(a.brokeragePct).toBe(0); expect(a.collectedAmount).toBe(100000); expect(a.token.status).toBe('RECEIVED');
    const after = (await j(await call(jar.BUILDER, 'GET', '/api/builder/projects'))).projects.find((p: any) => p.id === PROJ); expect(after.availableUnits).toBe(before.availableUnits - 1);
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b.id}/payout`, { amount: 100, ref: 'UTR-X1', mode: 'NEFT_RTGS' })).status).toBe(409);
    expect((await j(await call(jar.B1, 'GET', '/api/crm/bookings'))).bookings.some((x: any) => x.id === b.id)).toBe(false);
    expect((await getLead(jar.BUILDER, l.id)).lead.stage).toBe('BOOKED');
    const ov = await j(await call(jar.BUILDER, 'GET', '/api/crm/overview')); expect(ov.overview.approvedBookings).toBeGreaterThan(0);
    // cancelling it puts the unit back, without touching any mandate
    const cn = await call(jar.BUILDER, 'POST', `/api/crm/bookings/${b.id}/cancel`, { reason: 'Customer changed plan', refundAmount: 100000 }); expect(cn.status, await cn.clone().text()).toBe(200);
    expect((await j(await call(jar.BUILDER, 'GET', '/api/builder/projects'))).projects.find((p: any) => p.id === PROJ).availableUnits).toBe(before.availableUnits);
  });
  it('an employee of a builder can raise a builder-desk booking when allowed; the unclaimed-amount alert goes to the builder only', async () => {
    const l = await mkLead('Komal Desk Sale', {}, jar.BUILDER); await stageTo(l.id, visited, jar.BUILDER); await allot(l.id, TEAM.KOMAL, jar.BUILDER);
    expect((await req(l.id, good(), jar.KOMAL)).status).toBe(403);
    expect((await policy(TEAM.KOMAL, { canRequestBooking: true }, jar.BUILDER)).status).toBe(200);
    const r = await req(l.id, good({ plan: { planType: 'STANDARD' } }), jar.KOMAL); expect(r.status, await r.clone().text()).toBe(200); expect((await j(r)).booking.forMember).toBe(true);
    const bb = (await j(await call(jar.BUILDER, 'GET', '/api/crm/bookings'))).bookings.find((x: any) => x.leadId === l.id); expect(bb.direct).toBe(true); expect(bb.requestedBy.name).toMatch(/Komal/);
  });
  it('payment-claim and payout-confirmation routes still belong to the associate only, even though the builder now holds the booking-request permission', async () => {
    const bk = (await j(await call(jar.B1, 'GET', '/api/crm/bookings'))).bookings.find((x: any) => x.status === 'APPROVED' && !x.direct);
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${bk.id}/payments/${bk.paymentSchedule[0].id}/claim`, { note: 'customer says paid by cheque' })).status).toBe(403);
    expect((await call(jar.BUILDER, 'POST', `/api/crm/bookings/${bk.id}/cancel-request`, { reason: 'trying to cancel my own booking' })).status).toBe(403);
    expect((await call(jar.POOJA, 'POST', `/api/crm/bookings/${bk.id}/cancel-request`, { reason: 'an employee cannot do this' })).status).toBe(404);
  });
});

describe('reports, alerts, team roles, privacy', () => {
  it('the report has a team table (calls, connected, visits fixed, forwarded) and the typical time to the first call; an employee sees only their own row', async () => {
    const r = await j(await call(jar.B1, 'GET', '/api/crm/reports?days=30'));
    const pooja = r.byMember.find((m: any) => m.id === TEAM.POOJA); expect(pooja).toBeTruthy(); expect(pooja.role).toBe('TELECALLER'); expect(pooja.forwardedOut).toBeGreaterThan(0);
    const owner = r.byMember.reduce((a: number, m: any) => a + m.calls, 0); expect(owner).toBeGreaterThanOrEqual(0);
    expect(typeof r.speedToLeadHours === 'number' || r.speedToLeadHours === null).toBe(true); expect(r.speedToLeadHours).not.toBeNull();
    const mine = await j(await call(jar.POOJA, 'GET', '/api/crm/reports?days=30')); expect(mine.byMember.map((m: any) => m.id)).toEqual([TEAM.POOJA]); expect(mine.money).toBeNull();
    expect((await j(await call(jar.B2, 'GET', '/api/crm/reports?days=30'))).byMember.every((m: any) => m.id !== TEAM.POOJA)).toBe(true);
  });
  it('team members are added with a role (the title is optional and defaults from it); the role can be changed; old titles still resolve to a role', async () => {
    const add = await call(jar.B1, 'POST', '/api/team', { name: 'Sunita Verma', phone: rnd(), role: 'SITE_COORDINATOR', consentAttested: true }); expect(add.status, await add.clone().text()).toBe(200);
    const m = (await j(add)).member; expect(m.teamTitle).toMatch(/Site/i);
    expect((await call(jar.B1, 'POST', '/api/team', { name: 'No Role Person', phone: rnd(), consentAttested: true })).status).toBe(400);
    expect((await call(jar.B1, 'POST', '/api/team', { name: 'Bad Role Person', phone: rnd(), role: 'CEO', consentAttested: true })).status).toBe(400);
    const list = (await j(await call(jar.B1, 'GET', '/api/team'))).members; expect(list.find((x: any) => x.id === TEAM.POOJA).teamRole).toBe('TELECALLER'); expect(list.find((x: any) => x.id === TEAM.RAKESH).teamRole).toBe('SITE_COORDINATOR');
    expect((await call(jar.B1, 'PUT', `/api/team/${m.id}`, { teamRole: 'CLOSING_MANAGER' })).status).toBe(200);
    expect((await j(await call(jar.B1, 'GET', '/api/team'))).members.find((x: any) => x.id === m.id).teamRole).toBe('CLOSING_MANAGER');
    expect((await call(jar.B2, 'PUT', `/api/team/${m.id}`, { teamRole: 'ASSISTANT' })).status).not.toBe(200);
  });
  it('retention erases the new personal fields too: customer details, source detail and hand-off notes', async () => {
    const l = await mkLead('Erase Details', { sourceDetail: 'Referred by Mr Tiwari', profile: { residenceLocality: 'Shankar Nagar', decisionMaker: 'father', remarks: 'lives near the temple' } });
    await allot(l.id, TEAM.POOJA); await call(jar.POOJA, 'POST', `/api/crm/leads/${l.id}/forward`, { toMemberId: TEAM.RAKESH, note: 'Customer is nervous about the loan' });
    await call(jar.B1, 'POST', `/api/crm/leads/${l.id}/stage`, { stage: 'LOST', lostCode: 'LOAN_REJECTED' });
    await wait(2500); const run = await j(await call(jar.SUP, 'POST', '/api/crm/retention/run')); expect(run.erased).toBeGreaterThanOrEqual(1);
    const got = (await getLead(jar.B1, l.id)).lead; expect(got.erasedAt).toBeTruthy(); expect(got.profile).toBeUndefined(); expect(got.sourceDetail).toBeUndefined();
    const s = JSON.stringify(got); for (const w of ['Shankar Nagar', 'Tiwari', 'nervous', 'temple', 'father']) expect(s, w).not.toContain(w);
    expect((await call(jar.B1, 'PATCH', `/api/crm/leads/${l.id}`, { profile: { purpose: 'SELF_USE' } })).status).toBe(409);
  });
  it('an employee\'s lead response never carries more than before: no brokerage fields on the lead, phone masked per the employer\'s policy', async () => {
    const l = await mkLead('Mask Check'); await allot(l.id, TEAM.POOJA);
    const got = (await getLead(jar.POOJA, l.id)).lead; expect(JSON.stringify(got)).not.toMatch(/brokerage|commission|tds/i);
    expect(got.memberCan).toBeDefined(); const me = await getLead(jar.B1, l.id); expect(me.lead.memberCan).toBeUndefined();
  });
  it('the sales-desk UI is wired in both languages: every new screen file exists and carries Hindi strings next to English ones', () => {
    const root = path.resolve(import.meta.dirname, '..');
    const ui = readFileSync(path.join(root, 'src/components/CrmSales.tsx'), 'utf8'); const view = readFileSync(path.join(root, 'src/components/CrmView.tsx'), 'utf8');
    for (const k of ['SourceField', 'ProfileFields', 'LeadDetailsCard', 'CallPanel', 'ForwardSheet', 'HandoffTrail', 'CallQueuePanel', 'BookingRequestSheet', 'BookingDetail', 'ApproveSheet']) { expect(ui).toContain(`export const ${k}`); }
    for (const k of ['SourceField', 'CallPanel', 'ForwardSheet', 'CallQueuePanel', 'BookingRequestSheet', 'ApproveSheet', 'LeadDetailsCard', 'HandoffTrail']) expect(view).toContain(k);
    expect((ui.match(/tx\('/g) || []).length).toBeGreaterThan(80); expect((ui.match(/[ऀ-ॿ]/g) || []).length).toBeGreaterThan(1500);
    expect(ui).not.toMatch(/altPhone|alternate phone|aadhaar number|pan number/i);
  });
});
