import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { verhoeffCheckDigit, panProblem, aadhaarProblem, isLast4, ID_DOC_MAX_BYTES } from '../src/shared/idRules';

/**
 * v19 — "Save" says why it is grey; PAN card / masked Aadhaar copies (sponsor at invite time, member at sign-up and later);
 * the sponsor's details come PREFILLED at sign-up; an ID Review desk for admin + superadmin (queue, assign, seen / ask again);
 * and the switch "auto-verify people registered by a RERA broker" with its notification (open task) and its safety conditions.
 */
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const PW = 'Strong#Pass2026';
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function loginWith(email: string, password: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  expect(r.status, email).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const login = (id: string) => loginWith(acct(id).email, cfg.demoPassword);
const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
let panSeq = 3000;
const mkPan = () => `QRSPD${++panSeq}K`;
const mkAadhaar = () => { const body = '4' + String(Math.floor(Math.random() * 1e10)).padStart(10, '0'); return body + verhoeffCheckDigit(body); };
const mkApp = (n: string, extra: any = {}, phone = rnd()) => ({ name: n, phone, city: 'Raipur', reference: 'Known for 6 years, runs an office near Pandri bus stand', consent: true as const, ...extra });
/** a tiny but real-looking JPEG (the server reads the magic bytes, not the name) */
const jpeg = (n = 1500) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]), crypto.randomBytes(n)]);
const b64 = (b: Buffer) => `data:image/jpeg;base64,${b.toString('base64')}`;
const up = (cookie: string, url: string, kind: string, buf: Buffer = jpeg(), fileName = 'card.jpg') => call(cookie, 'POST', url, { kind, fileName, data: b64(buf) });
let ipSeq = 10;
const nextIp = () => `10.19.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;
const register = (code: string, phone: string, extra: any = {}) => fetch(B + '/api/auth/register-invite', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp() }, body: JSON.stringify({ code, name: 'Local Associate', phone, password: PW, consent: true, city: 'Raipur', panNumber: mkPan(), aadhaarNumber: mkAadhaar(), idConsent: true, ...extra }) });

async function newTier1(name: string) {
  const phone = rnd(); const email = `${name.toLowerCase().replace(/\W+/g, '.')}.${Date.now()}@example.in`;
  const inv = await j(await call(jar.SUP, 'POST', '/api/invitations', { invitedEmail: email, invitedPhone: phone, targetRole: 'BROKER' }));
  const pan = mkPan(); const aad = mkAadhaar();
  const r = await fetch(B + '/api/auth/register-invite', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp() }, body: JSON.stringify({ code: inv.invitation.code, name, email, phone, password: PW, consent: true, city: 'Raipur', reraNumber: `PCGRERA25${String(++panSeq).slice(-4)}-0001`, panNumber: pan, aadhaarNumber: aad, idConsent: true }) });
  expect(r.status, 'tier1 register').toBe(200);
  const id = (await r.json()).user.id;
  expect((await call(jar.ADMIN, 'POST', `/api/verifications/${id}/review`, { action: 'APPROVE', notes: 'RERA checked on the portal' })).status).toBe(200);
  return { id, name, email, pan, aad, cookie: await loginWith(email, PW) };
}
/** sponsor S registers a person and the person joins: returns ids + the person's session */
async function sponsorAndJoin(S: { cookie: string }, name: string, appExtra: any = {}, regExtra: any = {}) {
  const phone = rnd();
  const p = await j(await call(S.cookie, 'POST', '/api/network/tier2/applications', mkApp(name, appExtra, phone)));
  expect(p.invitation?.code, JSON.stringify(p)).toBeTruthy();
  const r = await register(p.invitation.code, phone, { name, ...regExtra });
  const body = await r.json(); expect(r.status, JSON.stringify(body)).toBe(200);
  return { id: body.user.id as string, appId: p.application.id as string, code: p.invitation.code as string, phone, body, cookie: r.headers.get('set-cookie')!.split(';')[0] };
}
const taskOf = async (userId: string, filter = 'all') => ((await j(await call(jar.ADMIN, 'GET', `/api/id-review/queue?filter=${filter}`))).tasks as any[]).find(t => t.user.id === userId);
const usersList = async () => (await j(await call(jar.SUP, 'GET', '/api/auth/users'))).users as any[];

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v19-'));
  mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true', TRUST_PROXY: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  const sup = cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN')?.id || 'USR-SUPERADMIN';
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', OWN: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1', SUP: sup })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('"Save" says WHY: the exact reason for a refused PAN / Aadhaar (the screenshot case)', () => {
  it('the PAN typed in the screenshot (the Aadhaar was fine) fails because its 4th letter is not a holder type — and the message says so', () => {
    const w = panProblem('ABCDE9012E')!; expect(w.code).toBe('PAN_TYPE'); expect(w.en).toContain('“D”'); expect(w.hi).toContain('“D”'); expect(w.en).toMatch(/ABCPD1234E/);
  });
  it('PAN: too short / too long / wrong shape / fine / empty', () => {
    expect(panProblem('ABCPD12')!.code).toBe('PAN_SHORT'); expect(panProblem('ABCPD1234EE')!.code).toBe('PAN_LONG'); expect(panProblem('ABCPD12345')!.code).toBe('PAN_SHAPE');
    expect(panProblem('abc pd 1234 e')).toBeNull(); expect(panProblem('')).toBeNull(); expect(panProblem(undefined)).toBeNull();
  });
  it('Aadhaar: not digits / short / long / starts 0 or 1 / wrong check digit / fine / empty — and the number is never echoed back', () => {
    expect(aadhaarProblem('27014551815a')!.code).toBe('AADHAAR_DIGITS'); expect(aadhaarProblem('2701455')!.code).toBe('AADHAAR_SHORT'); expect(aadhaarProblem('2701455181521')!.code).toBe('AADHAAR_LONG');
    expect(aadhaarProblem('170145518152')!.code).toBe('AADHAAR_FIRST');
    expect(aadhaarProblem('270145518152')).toBeNull();                                                      // the Aadhaar typed in the screenshot was fine …
    const w = aadhaarProblem('270145518153')!; expect(w.code).toBe('AADHAAR_CHECK'); expect(w.en).not.toContain('270145518153'); expect(w.hi).not.toContain('270145518153');
    expect(aadhaarProblem(mkAadhaar())).toBeNull(); expect(aadhaarProblem('')).toBeNull();
    expect(isLast4('0124')).toBe(true); expect(isLast4('012')).toBe(false); expect(isLast4('01245')).toBe(false); expect(isLast4('01a4')).toBe(false);
  });
  it('the server gives the same reasons when a member saves a wrong number under Register & ID', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/network/my-id', { panNumber: 'ABCDE9012E', aadhaarNumber: mkAadhaar(), consent: true });
    expect(r.status).toBe(400); const e = await j(r); expect(e.code).toBe('PAN_INVALID'); expect(e.error).toContain('“D”');
    const r2 = await call(jar.BRK1, 'POST', '/api/network/my-id', { panNumber: 'ABCPD1234E', aadhaarNumber: '270145518153', consent: true });
    expect(r2.status).toBe(400); expect((await j(r2)).error).toMatch(/do not pass the Aadhaar check/);
  });
});

let S: Awaited<ReturnType<typeof newTier1>>;
let T: Awaited<ReturnType<typeof sponsorAndJoin>>; let tApp: any;
const sponsorPan = mkPan(); const sponsorLast4 = '4821';

describe('the sponsor adds the person\'s ID details and copies at invite time', () => {
  it('a wrong PAN / last-4 is refused with the reason; a PAN already on GENZ is refused', async () => {
    S = await newTier1('Sponsor Sunil19');
    const bad = await call(S.cookie, 'POST', '/api/network/tier2/applications', mkApp('Tarun', { panNumber: 'ABCDE9012E' }));
    expect(bad.status).toBe(400); expect((await j(bad)).error).toContain('“D”');
    expect((await call(S.cookie, 'POST', '/api/network/tier2/applications', mkApp('Tarun', { aadhaarLast4: '12' }))).status).toBe(400);
    const dup = await call(S.cookie, 'POST', '/api/network/tier2/applications', mkApp('Tarun', { panNumber: S.pan })); // the sponsor's own PAN is already an account
    expect(dup.status).toBe(409); expect((await j(dup)).code).toBe('PAN_IN_USE');
  });

  it('firm, PAN and Aadhaar last-4 are kept on the request; the request card shows only yes / no', async () => {
    const phone = rnd();
    const p = await j(await call(S.cookie, 'POST', '/api/network/tier2/applications', mkApp('Tarun Sahu', { companyName: 'Sahu Realty', panNumber: sponsorPan, aadhaarLast4: sponsorLast4 }, phone)));
    expect(p.application.idGiven).toMatchObject({ company: true, pan: true, aadhaar: true, panDoc: false, aadhaarDoc: false });
    expect(JSON.stringify(p.application)).not.toContain(sponsorPan); expect(JSON.stringify(p.application)).not.toContain(sponsorLast4);
    tApp = { id: p.application.id, code: p.invitation.code, phone };
  });

  it('the sponsor attaches the PAN card and the masked Aadhaar; a second upload of the same kind replaces the first; junk and oversize are refused', async () => {
    const url = `/api/id-review/applications/${tApp.id}/docs`;
    const a = await up(S.cookie, url, 'PAN'); expect(a.status).toBe(200); expect((await j(a)).docs).toHaveLength(1);
    const b = await up(S.cookie, url, 'PAN', jpeg(2200)); expect((await j(b)).docs).toHaveLength(1);                 // replaced, not added
    const c = await up(S.cookie, url, 'AADHAAR'); expect((await j(c)).docs).toHaveLength(2);
    expect((await up(S.cookie, url, 'PAN', Buffer.from('<html>not an image</html>'))).status).toBe(415);
    expect((await up(S.cookie, url, 'PAN', Buffer.concat([jpeg(10), Buffer.alloc(ID_DOC_MAX_BYTES + 1000)]))).status).toBe(413);
    expect((await up(S.cookie, url, 'VOTER')).status).toBe(400);
    expect(readdirSync(path.join(dir, 'data', 'iddocs')).filter(f => f.endsWith('.bin'))).toHaveLength(2);           // the replaced file is really gone from disk
  });

  it('nobody else can add to, list or read this request\'s copies: another broker, an owner', async () => {
    const url = `/api/id-review/applications/${tApp.id}/docs`;
    expect((await up(jar.BRK1, url, 'PAN')).status).toBe(404);
    expect((await call(jar.BRK1, 'GET', url)).status).toBe(404);
    expect((await up(jar.OWN, url, 'PAN')).status).toBe(403);
  });

  it('the request card (sponsor view) now says the copies are there', async () => {
    const apps = (await j(await call(S.cookie, 'GET', '/api/network/tier2/applications'))).applications as any[];
    expect(apps.find(a => a.id === tApp.id).idGiven).toMatchObject({ panDoc: true, aadhaarDoc: true });
  });
});

describe('the sign-up comes PREFILLED and the sponsor\'s copies become the member\'s', () => {
  it('the invitation check returns what the sponsor filled (never an Aadhaar number, only the last 4)', async () => {
    const v = await j(await fetch(B + `/api/invitations/validate/${tApp.code}`));
    expect(v.invitation.prefill).toEqual({ name: 'Tarun Sahu', city: 'Raipur', companyName: 'Sahu Realty', panNumber: sponsorPan, aadhaarLast4: sponsorLast4, docs: expect.arrayContaining(['PAN', 'AADHAAR']) });
    expect(v.invitation.sponsorName).toBe('Sponsor Sunil19');
  });
  it('a plain admin-issued invitation has no prefill', async () => {
    const phone = rnd(); const inv = await j(await call(jar.SUP, 'POST', '/api/invitations', { invitedEmail: `x${Date.now()}@example.in`, invitedPhone: phone, targetRole: 'BROKER' }));
    const v = await j(await fetch(B + `/api/invitations/validate/${inv.invitation.code}`)); expect(v.invitation.prefill).toBeNull();
  });
  it('the person joins (typing a different PAN than the sponsor gave); the copies move to his account; a task is opened', async () => {
    const memberPan = mkPan();
    const r = await register(tApp.code, tApp.phone, { name: 'Tarun Sahu', panNumber: memberPan, aadhaarNumber: mkAadhaar() });
    expect(r.status).toBe(200); const body = await r.json();
    T = { id: body.user.id, appId: tApp.id, code: tApp.code, phone: tApp.phone, body, cookie: r.headers.get('set-cookie')!.split(';')[0] };
    (T as any).pan = memberPan;
    expect(body.autoVerified).toBe(false); expect(body.user.verificationStatus).toBe('PENDING');
    const mine = await j(await call(T.cookie, 'GET', '/api/id-review/mine'));
    expect(mine.docs.map((d: any) => d.kind).sort()).toEqual(['AADHAAR', 'PAN']); expect(mine.docs.every((d: any) => d.uploadedBy === 'SPONSOR')).toBe(true);
    expect(mine.review.status).toBe('OPEN');
  });
  it('who can open a copy: the member and the review team — NOT the sponsor any more, not another broker', async () => {
    const mine = await j(await call(T.cookie, 'GET', '/api/id-review/mine')); const doc = mine.docs[0];
    const own = await call(T.cookie, 'GET', `/api/id-review/docs/${doc.id}/file`); expect(own.status).toBe(200); expect(own.headers.get('content-type')).toBe('image/jpeg'); expect(own.headers.get('cache-control')).toMatch(/no-store/);
    expect((await call(S.cookie, 'GET', `/api/id-review/docs/${doc.id}/file`)).status).toBe(404);
    expect((await call(jar.BRK1, 'GET', `/api/id-review/docs/${doc.id}/file`)).status).toBe(404);
    expect((await call(jar.ADMIN, 'GET', `/api/id-review/docs/${doc.id}/file`)).status).toBe(200);
    expect((await call(jar.SUP, 'GET', `/api/id-review/docs/${doc.id}/file`)).status).toBe(200);
    const audit = (await j(await call(jar.SUP, 'GET', '/api/audit-logs'))).events as any[];
    expect(audit.some(e => e.action === 'IDDOC_VIEWED' && /opened the/.test(e.details || e.message || ''))).toBe(true);
  });
  it('the sponsor can no longer list or change the copies of a request that has become an account', async () => {
    expect((await call(S.cookie, 'GET', `/api/id-review/applications/${tApp.id}/docs`)).status).toBe(409);
  });
  it('the member adds his own Aadhaar copy (replaces the sponsor\'s of that kind); a broker-only route refuses an owner', async () => {
    const r = await up(T.cookie, '/api/id-review/mine/docs', 'AADHAAR'); expect(r.status).toBe(200);
    const docs = (await j(r)).docs as any[]; expect(docs).toHaveLength(2);
    expect(docs.find(d => d.kind === 'AADHAAR').uploadedBy).toBe('SELF'); expect(docs.find(d => d.kind === 'PAN').uploadedBy).toBe('SPONSOR');
    expect((await call(jar.OWN, 'GET', '/api/id-review/mine')).status).toBe(403);
    expect((await up(jar.OWN, '/api/id-review/mine/docs', 'PAN')).status).toBe(403);
  });
});

describe('the ID Review desk: queue, assign, decide — for admin AND superadmin', () => {
  it('only the review team can open it; a broker and an owner cannot', async () => {
    for (const k of ['BRK1', 'OWN']) for (const u of ['/api/id-review/queue', '/api/id-review/summary', '/api/id-review/settings']) expect((await call(jar[k], 'GET', u)).status, `${k} ${u}`).toBe(403);
    expect((await call(jar.BRK1, 'PUT', '/api/id-review/settings', { autoVerify: true })).status).toBe(403);
    for (const k of ['ADMIN', 'SUP']) expect((await call(jar[k], 'GET', '/api/id-review/queue')).status, k).toBe(200);
  });

  it('the queue shows him with the sponsor, the masked ID, both copies and a warning that his PAN differs from what the sponsor gave', async () => {
    const t = await taskOf(T.id, 'todo'); expect(t, 'task in the to-do list').toBeTruthy();
    expect(t.user).toMatchObject({ name: 'Tarun Sahu', tier: 'TIER2', status: 'PENDING' }); expect(t.sponsor.name).toBe('Sponsor Sunil19');
    expect(t.docs).toHaveLength(2); expect(t.mismatch).toBe(true); expect(t.autoVerified).toBe(false);
    expect(t.idInfo.pan).toMatch(/•/); expect(t.idInfo.aadhaar).toMatch(/^XXXX XXXX \d{4}$/);
    expect(JSON.stringify(t)).not.toContain((T as any).pan);                                           // the LIST never carries the full PAN
  });

  it('the detail (and only the detail) has the full PAN, a phone for the video call, and what the sponsor typed', async () => {
    const t = await taskOf(T.id);
    const d = await j(await call(jar.SUP, 'GET', `/api/id-review/tasks/${t.id}`));
    expect(d.detail.panFull).toBe((T as any).pan); expect(d.detail.phone).toBeTruthy();
    expect(d.detail.sponsorGave).toMatchObject({ companyName: 'Sahu Realty', pan: sponsorPan, aadhaarLast4: sponsorLast4 }); expect(d.detail.mismatch.pan).toBe(true);
    expect(JSON.stringify(d)).not.toMatch(/passwordHash/);
  });

  it('assign: admin hands it to the superadmin; a broker or a made-up id cannot be the reviewer; "mine" and the badge follow', async () => {
    const t = await taskOf(T.id); const supId = (await usersList()).find(u => u.role === 'SUPERADMIN').id;
    expect((await call(jar.ADMIN, 'POST', `/api/id-review/tasks/${t.id}/assign`, { assigneeId: acct('USR-BRK-001').id })).status).toBe(400);
    expect((await call(jar.ADMIN, 'POST', `/api/id-review/tasks/${t.id}/assign`, { assigneeId: 'USR-NOBODY' })).status).toBe(400);
    expect((await call(jar.ADMIN, 'POST', `/api/id-review/tasks/${t.id}/assign`, { assigneeId: supId })).status).toBe(200);
    expect((await taskOf(T.id, 'mine') === undefined)).toBe(true);                                       // not mine for the admin …
    const mineSup = ((await j(await call(jar.SUP, 'GET', '/api/id-review/queue?filter=mine'))).tasks as any[]).map(x => x.user.id); expect(mineSup).toContain(T.id); // … but for the superadmin
    expect((await call(jar.SUP, 'POST', `/api/id-review/tasks/${t.id}/assign`, { assigneeId: null })).status).toBe(200);     // the superadmin can also take it off / hand it back
    expect((await taskOf(T.id, 'unassigned'))).toBeTruthy();
    const s = await j(await call(jar.ADMIN, 'GET', '/api/id-review/summary')); expect(s.badge).toBeGreaterThanOrEqual(1); expect(s.unassigned).toBeGreaterThanOrEqual(1);
  });

  it('a local associate cannot be approved before the ID is seen (v18 gate stays); ask-again needs a note and puts the ball in the member\'s court', async () => {
    const t = await taskOf(T.id);
    const early = await call(jar.ADMIN, 'POST', `/api/verifications/${T.id}/review`, { action: 'APPROVE' }); expect(early.status).toBe(400); expect((await j(early)).code).toBe('ID_CHECK_PENDING');
    expect((await call(jar.ADMIN, 'POST', `/api/id-review/tasks/${t.id}/decide`, { decision: 'ASK_AGAIN' })).status).toBe(400);
    const ask = await call(jar.ADMIN, 'POST', `/api/id-review/tasks/${t.id}/decide`, { decision: 'ASK_AGAIN', note: 'Aadhaar photo is blurry — send a clearer one' }); expect(ask.status).toBe(200);
    expect((await taskOf(T.id, 'asked'))).toBeTruthy(); expect(await taskOf(T.id, 'todo')).toBeUndefined();
    const mine = await j(await call(T.cookie, 'GET', '/api/id-review/mine')); expect(mine.review).toMatchObject({ status: 'CHANGES_ASKED', note: 'Aadhaar photo is blurry — send a clearer one' });
  });

  it('the member sends a clearer copy → the task is open again for the team', async () => {
    expect((await up(T.cookie, '/api/id-review/mine/docs', 'AADHAAR', jpeg(3000))).status).toBe(200);
    expect(await taskOf(T.id, 'asked')).toBeUndefined(); expect(await taskOf(T.id, 'todo')).toBeTruthy();
    expect((await j(await call(T.cookie, 'GET', '/api/id-review/mine'))).review.status).toBe('OPEN');
  });

  it('"ID seen" closes the task, sets the tick, and only then can an admin approve; every step is in the audit trail', async () => {
    const t = await taskOf(T.id);
    const seen = await call(jar.SUP, 'POST', `/api/id-review/tasks/${t.id}/decide`, { decision: 'SEEN', note: 'video call: PAN card + masked Aadhaar match' }); expect(seen.status).toBe(200);
    const u = (await usersList()).find(x => x.id === T.id); expect(u.idCheckedAt).toBeTruthy(); expect(u.idCheckNote).toMatch(/video call/);
    expect(await taskOf(T.id, 'todo')).toBeUndefined(); expect((await taskOf(T.id, 'done')).status).toBe('DONE');
    expect((await call(jar.ADMIN, 'POST', `/api/verifications/${T.id}/review`, { action: 'APPROVE', notes: 'ok' })).status).toBe(200);
    const audit = (await j(await call(jar.SUP, 'GET', '/api/audit-logs'))).events as any[]; const acts = new Set(audit.map(e => e.action));
    for (const a of ['IDDOC_UPLOADED', 'ID_CHANGES_ASKED', 'ID_CHECKED', 'ID_TASK_ASSIGNED']) expect(acts.has(a), a).toBe(true);
  });

  it('the older "I have seen the ID" button (KYC table / sponsor chain) keeps the same task in step', async () => {
    const X = await sponsorAndJoin(S, 'Umesh Chain');                                                      // S's second registration this month
    expect(await taskOf(X.id, 'todo')).toBeTruthy();
    expect((await call(jar.ADMIN, 'POST', `/api/network/id-check/${X.id}`, { checked: true, note: 'office' })).status).toBe(200);
    expect((await taskOf(X.id, 'done'))).toBeTruthy(); expect(await taskOf(X.id, 'todo')).toBeUndefined();
    expect((await call(jar.ADMIN, 'POST', `/api/network/id-check/${X.id}`, { checked: false })).status).toBe(200);
    expect((await taskOf(X.id, 'todo'))).toBeTruthy();                                                     // un-ticking reopens the check
  });

  it('a suspension closes the check as adverse, and the sponsor gets the strike as before', async () => {
    const S2 = await newTier1('Sponsor Strike19'); const V = await sponsorAndJoin(S2, 'Vimal Bad');
    expect((await call(jar.SUP, 'POST', `/api/verifications/${V.id}/review`, { action: 'REJECT', notes: 'fake documents' })).status).toBe(200);
    const t = await taskOf(V.id, 'done'); expect(t.status).toBe('REJECTED');
  });
});

describe('the switch: auto-verify people registered by a RERA broker', () => {
  let SA1: Awaited<ReturnType<typeof newTier1>>; let SA2: Awaited<ReturnType<typeof newTier1>>;
  let adminId: string; let X: Awaited<ReturnType<typeof sponsorAndJoin>>;

  it('is OFF by default: a new associate waits for admin approval; both admin and superadmin see the switch as off', async () => {
    SA1 = await newTier1('Sponsor Auto1'); SA2 = await newTier1('Sponsor Auto2');
    for (const k of ['ADMIN', 'SUP']) expect((await j(await call(jar[k], 'GET', '/api/id-review/settings'))).autoVerify, k).toBe(false);
    const P = await sponsorAndJoin(SA1, 'Pehla Pending');                                                   // SA1's 1st of 2
    expect(P.body.autoVerified).toBe(false); expect(P.body.user.verificationStatus).toBe('PENDING');
  });

  it('a plain ADMIN can turn it on (and choose the default reviewer); it is audit-logged with who and when; a non-reviewer cannot', async () => {
    adminId = (await usersList()).find(u => u.id === acct('USR-ADMIN-1').id).id;
    expect((await call(jar.ADMIN, 'PUT', '/api/id-review/settings', { defaultAssigneeId: acct('USR-BRK-001').id })).status).toBe(400);
    const r = await call(jar.ADMIN, 'PUT', '/api/id-review/settings', { autoVerify: true, defaultAssigneeId: adminId }); expect(r.status).toBe(200);
    const s = await j(await call(jar.SUP, 'GET', '/api/id-review/settings'));
    expect(s.autoVerify).toBe(true); expect(s.changedBy).toBeTruthy(); expect(s.changedAt).toBeTruthy(); expect(s.defaultAssigneeId).toBe(adminId); expect(s.reviewers.length).toBeGreaterThanOrEqual(2);
    const audit = (await j(await call(jar.SUP, 'GET', '/api/audit-logs'))).events as any[];
    expect(audit.some(e => e.action === 'ID_REVIEW_SETTINGS' && /auto-verify RERA referrals ON/.test(e.details || e.message || ''))).toBe(true);
  });

  it('now a person registered by a verified, strike-free RERA broker is VERIFIED AT SIGN-UP (broker id, probation, can use the network) — and the ID check stays open, assigned to the default reviewer', async () => {
    X = await sponsorAndJoin(SA2, 'Xavier Auto');                                                          // SA2's 1st of 2
    expect(X.body.autoVerified).toBe(true); expect(X.body.user.verificationStatus).toBe('VERIFIED');
    expect(X.body.user.brokerId).toMatch(/^GZ-BRK-/); expect(X.body.user.tier).toBe('TIER2'); expect(X.body.user.probationUntil).toBeTruthy(); expect(X.body.user.autoVerifiedBy).toBe(SA2.id);
    expect((await call(X.cookie, 'GET', '/api/network/me')).status).toBe(200);                              // a verified-only area opens
    const u = (await usersList()).find(x => x.id === X.id); expect(u.idCheckedAt).toBeUndefined();         // … but nobody has SEEN the ID yet
    const t = await taskOf(X.id, 'auto'); expect(t, 'auto-verified task').toBeTruthy();
    expect(t.autoVerified).toBe(true); expect(t.status).toBe('OPEN'); expect(t.assignee?.id).toBe(adminId); expect(t.source).toBe('AUTO_VERIFY');
    const audit = (await j(await call(jar.SUP, 'GET', '/api/audit-logs'))).events as any[];
    expect(audit.some(e => e.action === 'USER_AUTO_VERIFIED' && e.entityId === X.id)).toBe(true);
  });

  it('the notification: the admin\'s badge and the "auto-verified" tile count it, and keep counting until the ID is checked', async () => {
    const a = await j(await call(jar.ADMIN, 'GET', '/api/id-review/summary')); expect(a.autoVerifyOn).toBe(true); expect(a.auto).toBeGreaterThanOrEqual(1); expect(a.mine).toBeGreaterThanOrEqual(1); expect(a.badge).toBeGreaterThanOrEqual(1);
    const s = await j(await call(jar.SUP, 'GET', '/api/id-review/summary')); expect(s.auto).toBe(a.auto);          // the superadmin sees the same pile
    const t = await taskOf(X.id);
    expect((await call(jar.ADMIN, 'POST', `/api/id-review/tasks/${t.id}/decide`, { decision: 'SEEN', note: 'video call' })).status).toBe(200);
    const a2 = await j(await call(jar.ADMIN, 'GET', '/api/id-review/summary')); expect(a2.auto).toBe(a.auto - 1);
    expect((await usersList()).find(x => x.id === X.id).verificationStatus).toBe('VERIFIED');               // the check changed nothing about his status
  });

  it('if the check finds a problem, suspending the auto-verified person closes the task, ends his session and gives the sponsor a strike', async () => {
    const Y = await sponsorAndJoin(SA2, 'Yash Auto');                                                      // SA2's 2nd of 2
    expect(Y.body.autoVerified).toBe(true);
    expect((await call(jar.SUP, 'POST', `/api/verifications/${Y.id}/review`, { action: 'SUSPEND', notes: 'PAN card does not match' })).status).toBe(200);
    expect((await taskOf(Y.id, 'done')).status).toBe('REJECTED');
    expect((await call(Y.cookie, 'GET', '/api/network/me')).status).toBe(401);
    const sp = (await usersList()).find(x => x.id === SA2.id); expect(sp.vouchStrikes).toBe(1);
  });

  it('a sponsor WITH a strike no longer auto-verifies: the person waits for admin approval and the task says why', async () => {
    const SB = await newTier1('Sponsor Struck19');
    const bad = await sponsorAndJoin(SB, 'Bad First');                                                     // auto-verified (SB clean) …
    expect(bad.body.autoVerified).toBe(true);
    expect((await call(jar.SUP, 'POST', `/api/verifications/${bad.id}/review`, { action: 'SUSPEND', notes: 'fake' })).status).toBe(200);   // … then suspended → strike
    const Z = await sponsorAndJoin(SB, 'Zubin Second');
    expect(Z.body.autoVerified).toBe(false); expect(Z.body.user.verificationStatus).toBe('PENDING');
    const t = await taskOf(Z.id); const d = await j(await call(jar.ADMIN, 'GET', `/api/id-review/tasks/${t.id}`));
    expect(JSON.stringify(d.detail.history)).toMatch(/auto-verify skipped: the sponsor already has a strike/);
  });

  it('a Tier 1 broker invited by GENZ itself is not touched by the switch (still needs the admin\'s approval)', async () => {
    const phone = rnd(); const email = `t1.${Date.now()}@example.in`;
    const inv = await j(await call(jar.SUP, 'POST', '/api/invitations', { invitedEmail: email, invitedPhone: phone, targetRole: 'BROKER' }));
    const r = await fetch(B + '/api/auth/register-invite', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp() }, body: JSON.stringify({ code: inv.invitation.code, name: 'Rera Direct', email, phone, password: PW, consent: true, city: 'Raipur', reraNumber: 'PCGRERA250999-0001', panNumber: mkPan(), aadhaarNumber: mkAadhaar(), idConsent: true }) });
    const b = await r.json(); expect(r.status).toBe(200); expect(b.autoVerified).toBe(false); expect(b.user.verificationStatus).toBe('PENDING');
  });

  it('bulk: "give all unassigned checks to <reviewer>" assigns them; turning the switch OFF stops auto-verifying but keeps the people already verified', async () => {
    expect((await j(await call(jar.SUP, 'PUT', '/api/id-review/settings', { defaultAssigneeId: null }))).defaultAssigneeId).toBe('');
    const r = await j(await call(jar.SUP, 'POST', '/api/id-review/assign-unassigned', { assigneeId: adminId })); expect(r.assigned).toBeGreaterThanOrEqual(1);
    expect((await call(jar.SUP, 'POST', '/api/id-review/assign-unassigned', { assigneeId: acct('USR-BRK-001').id })).status).toBe(400);
    expect((await call(jar.SUP, 'PUT', '/api/id-review/settings', { autoVerify: false })).status).toBe(200);
    const SC = await newTier1('Sponsor Off19'); const W = await sponsorAndJoin(SC, 'Wasim Off');
    expect(W.body.autoVerified).toBe(false); expect(W.body.user.verificationStatus).toBe('PENDING');
    expect((await usersList()).find(x => x.id === X.id).verificationStatus).toBe('VERIFIED');
  });
});

describe('the member side and clean-up', () => {
  it('an older member adding a PAN / Aadhaar under Register & ID opens an ID-review task for the team', async () => {
    const aad = mkAadhaar(); const pan = mkPan();
    expect((await call(jar.BRK1, 'POST', '/api/network/my-id', { panNumber: pan, aadhaarNumber: aad, consent: true })).status).toBe(200);
    const mine = ((await j(await call(jar.ADMIN, 'GET', '/api/id-review/queue?filter=todo'))).tasks as any[]).find(t => t.user.id === acct('USR-BRK-001').id);
    expect(mine, 'BRK-001 task').toBeTruthy(); expect(mine.source === 'ID_CHANGED' || mine.source === 'BACKFILL').toBe(true);
  });

  it('a member can delete his own copy; it is gone from the server', async () => {
    const mine = await j(await call(jar.BRK1, 'GET', '/api/id-review/mine')); expect(mine.docs).toHaveLength(0);
    const r = await up(jar.BRK1, '/api/id-review/mine/docs', 'PAN'); const doc = (await j(r)).docs[0];
    expect((await call(jar.BRK1, 'DELETE', `/api/id-review/mine/docs/${doc.id}`)).status).toBe(200);
    expect((await call(jar.BRK1, 'GET', `/api/id-review/docs/${doc.id}/file`)).status).toBe(404); expect((await call(jar.ADMIN, 'GET', `/api/id-review/docs/${doc.id}/file`)).status).toBe(404);
  });

  it('a sponsor who withdraws the request deletes the copies he attached at once', async () => {
    const Sw = await newTier1('Sponsor Withdraw19'); const phone = rnd();
    const p = await j(await call(Sw.cookie, 'POST', '/api/network/tier2/applications', mkApp('Wapas Le', {}, phone)));
    const doc = (await j(await up(Sw.cookie, `/api/id-review/applications/${p.application.id}/docs`, 'PAN'))).docs[0];
    expect((await call(jar.ADMIN, 'GET', `/api/id-review/docs/${doc.id}/file`)).status).toBe(200);
    expect((await call(Sw.cookie, 'POST', `/api/network/tier2/applications/${p.application.id}/reject`, { note: '' })).status).toBe(200);
    expect((await call(jar.ADMIN, 'GET', `/api/id-review/docs/${doc.id}/file`)).status).toBe(404);
  });

  it('DPDP erasure removes the member\'s copies from disk, his task, and what the sponsor typed about him', async () => {
    const before = readdirSync(path.join(dir, 'data', 'iddocs')).filter(f => f.endsWith('.bin')).length; expect(before).toBeGreaterThan(0);
    const docs = (await j(await call(T.cookie, 'GET', '/api/id-review/mine'))).docs as any[]; expect(docs.length).toBeGreaterThan(0);
    const f = await j(await call(T.cookie, 'POST', '/api/privacy/requests', { type: 'ERASURE', details: 'Please delete my account' }));
    expect((await call(jar.SUP, 'POST', `/api/privacy/requests/${f.request.id}/resolve`, { decision: 'COMPLETE' })).status).toBe(200);
    for (const d of docs) expect((await call(jar.SUP, 'GET', `/api/id-review/docs/${d.id}/file`)).status).toBe(404);
    expect(await taskOf(T.id)).toBeUndefined();
    expect(readdirSync(path.join(dir, 'data', 'iddocs')).filter(f2 => f2.endsWith('.bin')).length).toBe(before - docs.length);
  });
});
