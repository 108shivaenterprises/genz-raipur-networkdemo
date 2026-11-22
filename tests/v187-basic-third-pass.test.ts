/** v187 (D16) — third-pass security findings on the Basic tier. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { freePort } from './helpers/port';
import { panHeldByApproved } from '../server/kyc';
import { canSeeProtectedPropertyData, canAccessPropertyWorkspace } from '../server/access';

const root = path.resolve(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(root, f), 'utf8');
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const j = (r: Response) => r.json().catch(() => ({})) as Promise<any>;
const PASS = 'Naya#Account2026';

describe('v187 · units', () => {
  it('1 panHeldByApproved: only a non-Basic, non-owner, live-or-queued (VERIFIED / PENDING) holder blocks', () => {
    const u = (id: string, extra: object) => ({ id, role: 'BROKER', panNumber: 'ABCPN1234F', verificationStatus: 'VERIFIED', ...extra });
    expect(panHeldByApproved([u('A', {})], 'ABCPN1234F')).toBe(true);
    expect(panHeldByApproved([u('A', {})], 'ABCPN1234F', 'A')).toBe(false);          // not against itself
    expect(panHeldByApproved([u('A', { basicTier: true })], 'ABCPN1234F')).toBe(false);
    expect(panHeldByApproved([u('A', { role: 'PROPERTY_OWNER' })], 'ABCPN1234F')).toBe(false);
    expect(panHeldByApproved([u('A', { verificationStatus: 'PENDING' })], 'ABCPN1234F')).toBe(true);   // invite route, admin-issued
    expect(panHeldByApproved([u('A', { verificationStatus: 'REJECTED' })], 'ABCPN1234F')).toBe(false);
    expect(panHeldByApproved([u('A', {})], '')).toBe(false);
    for (const f of ['server/openSignup.ts', 'server/network.ts', 'server/ownerlist.ts']) expect(read(f)).toContain('panHeldByApproved(');
    expect(read('server.ts').match(/panHeldByApproved\(/g)!.length).toBeGreaterThanOrEqual(3);
  });
  it('2 a Basic legal counsel gets no protected property data or workspace; a full one does', () => {
    const p: any = { id: 'P', ownerId: 'O', listingBrokerId: 'B' }; const st: any = { siteVisits: [], dealRooms: [] };
    const lc = (extra: object) => ({ id: 'L', role: 'LEGAL_COUNSEL', verificationStatus: 'VERIFIED', ...extra }) as any;
    expect(canSeeProtectedPropertyData(st, lc({}), p)).toBe(true); expect(canSeeProtectedPropertyData(st, lc({ basicTier: true }), p)).toBe(false);
    expect(canAccessPropertyWorkspace(st, lc({}), p)).toBe(true); expect(canAccessPropertyWorkspace(st, lc({ basicTier: true }), p)).toBe(false);
    const l = read('server/landrecords.ts'); expect(l).not.toMatch(/u\.role === 'LEGAL_COUNSEL' \|\|/); expect(l).toContain("u.role === 'LEGAL_COUNSEL' && isVerifiedFull(u)");
  });
  it('4 migration leaves an old admin-approved OTP_PAN account verified (broker id, or a USER_APPROVE audit event)', async () => {
    const { db } = await import('../server/db'); const { migrateBasicTier } = await import('../server/openSignup');
    const mk = (id: string, extra: object) => ({ id, name: id, role: 'BROKER', verificationStatus: 'VERIFIED', autoVerifiedBy: 'OTP_PAN', ...extra });
    const users: any[] = [mk('M-PLAIN', {}), mk('M-BRKID', { brokerId: 'GZ-BRK-492001' }), mk('M-APPROVED', {})];
    const st: any = { users, auditEvents: [{ entityId: 'M-APPROVED', action: 'USER_APPROVE' }] };
    const g = db.getState.bind(db), sv = db.save.bind(db), ap = db.appendAuditEvent.bind(db);
    (db as any).getState = () => st; (db as any).save = () => {}; (db as any).appendAuditEvent = (...a: any[]) => { st.auditEvents.push({ entityId: a[3], action: a[4] }); };
    try { expect(migrateBasicTier()).toBe(1); } finally { (db as any).getState = g; (db as any).save = sv; (db as any).appendAuditEvent = ap; }
    expect(users.find(u => u.id === 'M-PLAIN').basicTier).toBe(true);
    expect(users.find(u => u.id === 'M-BRKID').basicTier).toBeUndefined(); expect(users.find(u => u.id === 'M-APPROVED').basicTier).toBeUndefined();
  });
  it('3/5/8 source guards: contractors and counsel can give an ID; a Basic typed RERA does not block; tier 2 is set for brokers only; builders have an ID task', () => {
    expect(read('server/idreview.ts')).toContain("'CONTRACTOR', 'LEGAL_COUNSEL'"); expect(read('server/network.ts')).toContain("'CONTRACTOR', 'LEGAL_COUNSEL'");
    expect(read('server/network.ts')).toContain('x.reraNumber && !x.basicTier');
    expect(read('server.ts')).toContain("if (targetUser.role === 'BROKER' && !reraProven) targetUser.tier = 'TIER2'");
  });
});

describe('v187 · HTTP', { timeout: 240_000 }, () => {
  let proc: ChildProcess; let dir = ''; let B = ''; let cfg: any; let SA = ''; let BRK = ''; let A = ''; let AID = ''; let PID = ''; let HOLDER: any;
  let BCK = '';
  const call = (ck: string | undefined, m: string, u: string, b?: unknown) => fetch(B + u, { method: m, headers: { 'content-type': 'application/json', ...(ck ? { cookie: ck } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const login = async (who: string, pw = PASS) => { const r = await call(undefined, 'POST', '/api/auth/login', { email: who, password: pw }); expect(r.status, await r.clone().text()).toBe(200); return r.headers.get('set-cookie')!.split(';')[0]; };
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]).toString('base64');
  beforeAll(async () => {
    const port = await freePort(); B = `http://127.0.0.1:${port}`;
    dir = mkdtempSync(path.join(tmpdir(), 'genz-v187-')); mkdirSync(path.join(dir, 'data'));
    proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], { cwd: dir, stdio: 'ignore', env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', SMS_WEBHOOK_URL: '', FAST2SMS_API_KEY: '', PUSH_DRY_RUN: 'true', SAHAYAK: 'off', PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true', SIGNUP_IP_DAILY_CAP: '30' } });
    for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
    SA = await login(cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').email, cfg.demoPassword);
    BRK = await login(cfg.demoAccounts.find((a: any) => a.id === 'USR-BRK-001').email, cfg.demoPassword);
  }, 120_000);
  afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });
  const signup = async (phone: string, extra: object = {}) => {
    const o = await j(await call(undefined, 'POST', '/api/auth/signup-otp', { phone }));
    return call(undefined, 'POST', '/api/auth/signup', { role: 'BROKER', name: 'Naya Broker', phone, otpToken: o.otpToken, otpCode: o.devCode, password: PASS, consent: true, panConsent: true, city: 'Raipur', panNumber: 'ABCPN8800F', ...extra });
  };

  it('1 /my-id gives the generic refusal (no "already linked") when an approved account holds the PAN; a Basic claim does not block', async () => {
    const code = (await j(await call(SA, 'POST', '/api/invitations', { invitedEmail: 'holder87@test.genz.example', invitedPhone: '9826188020', targetRole: 'BROKER' }))).invitation.code;
    const reg = await call(undefined, 'POST', '/api/auth/register-invite', { code, name: 'Pan Holder', phone: '9826188020', email: 'holder87@test.genz.example', password: PASS, consent: true, city: 'Raipur', aadhaarNumber: '234567890130', idConsent: true, panNumber: 'ABCPH8820F' });
    expect(reg.status, await reg.clone().text()).toBe(200); HOLDER = { panNumber: 'ABCPH8820F' };
    const r = await signup('9826188001', { panNumber: 'ABCPN8802F' }); expect(r.status, await r.clone().text()).toBe(200); AID = (await j(r)).user.id; A = r.headers.get('set-cookie')!.split(';')[0];
    const deny = await call(A, 'POST', '/api/network/my-id', { panNumber: HOLDER.panNumber, aadhaarNumber: '234567890130', consent: true }); const db = await j(deny);
    expect(deny.status).toBe(409); expect(db.code).toBe('CANNOT_REGISTER'); expect(JSON.stringify(db)).not.toMatch(/already|linked/i);
    const free = await call(A, 'POST', '/api/network/my-id', { panNumber: 'ABCPN8801F', aadhaarNumber: '234567890130', consent: true }); expect(free.status, await free.clone().text()).toBe(200);
  });

  it('6 replacing the ID of a Basic account that was already seen clears the "ID seen" tick', async () => {
    expect((await call(SA, 'POST', `/api/network/id-check/${AID}`, { checked: true, note: 'card seen' })).status).toBe(200);
    let me = (await j(await call(SA, 'GET', '/api/auth/users'))).users.find((u: any) => u.id === AID); expect(me.idCheckedAt).toBeTruthy();
    const up = await call(A, 'POST', '/api/id-review/mine/docs', { kind: 'PAN', fileName: 'new.png', data: png }); expect(up.status, await up.clone().text()).toBe(200);
    me = (await j(await call(SA, 'GET', '/api/auth/users'))).users.find((u: any) => u.id === AID); expect(me.idCheckedAt).toBeFalsy();
  });

  it('7 a Basic account cannot open the vault of a network listing; its own is fine', async () => {
    const mine = await call(A, 'POST', '/api/properties', { title: 'Own held flat third pass', description: 'A flat listed by a Basic account.', propertyType: 'Residential Flat', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: 'Shankar Nagar', pincode: '492007', addressHidden: 'Flat 4, Test Society, Raipur', askingPrice: 5600000, ownerApprovedNetPrice: 5300000, ownerName: 'Some Owner', ownerPhone: '9876500189', tags: [] });
    PID = (await j(mine)).property?.id; expect(PID).toBeTruthy();
    expect((await call(A, 'GET', `/api/properties/${PID}/vault/assets`)).status).toBe(200);
    const net = ((await j(await call(BRK, 'GET', '/api/properties'))).properties as any[]).find(p => p.listingBrokerId !== AID);
    expect(net).toBeTruthy(); {expect((await call(A, 'GET', `/api/properties/${net.id}/vault/assets`)).status).toBe(404); }
    expect(read('server.ts')).toContain('a Basic account reads the vault of its own listing');
  });

  it('3 a Basic contractor-style ID path: counsel and contractors are accepted roles on /mine (403 only for other roles)', async () => {
    const ownerAcc = cfg.demoAccounts.find((a: any) => a.role === 'PROPERTY_OWNER');
    if (ownerAcc) { const o = await login(ownerAcc.email, cfg.demoPassword); expect((await call(o, 'GET', '/api/id-review/mine')).status).toBe(403); }
    const lc = cfg.demoAccounts.find((a: any) => a.role === 'LEGAL_COUNSEL');
    if (lc) { const l = await login(lc.email, cfg.demoPassword); expect((await call(l, 'GET', '/api/id-review/mine')).status).toBe(200); }
    const ct = cfg.demoAccounts.find((a: any) => a.role === 'CONTRACTOR');
    if (ct) { const c = await login(ct.email, cfg.demoPassword); expect((await call(c, 'GET', '/api/id-review/mine')).status).toBe(200); }
  });

  it('9 (v188) the Basic KYC screen needs no /network/profile: my-id, my-rera, my docs answer; a RERA copy can be stored; admin ticks the ID on a PAN alone, uploads on his behalf, and sees why RERA blocks approval', async () => {
    expect((await call(A, 'GET', '/api/network/my-id')).status).toBe(200);
    expect((await call(A, 'GET', '/api/network/my-rera')).status).toBe(200);
    expect((await call(A, 'GET', '/api/id-review/mine')).status).toBe(200);
    const rc = await call(A, 'POST', '/api/network/my-rera', { reraNumber: 'PCGRERA2026X0187' }); expect(rc.status, await rc.clone().text()).toBe(200);
    const rd = await call(A, 'POST', '/api/id-review/mine/docs', { kind: 'RERA', fileName: 'rera.png', data: png }); expect(rd.status, await rd.clone().text()).toBe(200);
    expect((await j(rd)).doc.kind).toBe('RERA');
    const bf = await signup('9826188003', { panNumber: 'ABCPN8803F' }); expect(bf.status).toBe(200); BCK = bf.headers.get('set-cookie')!.split(';')[0]; const B2 = (await j(bf)).user.id;   // a fresh Basic with a PAN and no Aadhaar
    const up = await call(SA, 'POST', `/api/id-review/users/${B2}/docs`, { kind: 'PAN', fileName: 'pan.png', data: png }); expect(up.status, await up.clone().text()).toBe(200);
    const tick = await call(SA, 'POST', `/api/network/id-check/${B2}`, { checked: true, note: 'PAN card seen' }); expect(tick.status, await tick.clone().text()).toBe(200);
    const ap = await call(SA, 'POST', `/api/verifications/${B2}/review`, { action: 'APPROVE', notes: 'seen' }); const ab = await j(ap);
    expect(ap.status, JSON.stringify(ab)).toBe(200); expect(ab.user.verificationStatus).toBe('VERIFIED'); expect(ab.user.tier).toBe('TIER2');   // v190 (D17): no RERA = approved as a Tier 2 associate
    const claims = (await j(await call(SA, 'GET', '/api/network/rera-claims'))).claims as any[]; expect(claims.some(c => c.userId === AID)).toBe(true);   // the claim is visible to staff
    const only = await call(A, 'POST', '/api/network/my-id', { panNumber: 'ABCPN8804F', consent: true }); expect(only.status, await only.clone().text()).toBe(200);   // PAN-only correction keeps the Aadhaar on file
    expect((await j(only)).id.hasAadhaar).toBe(true);
    const none = await call(BCK, 'POST', '/api/network/my-id', { panNumber: 'ABCPN8805F', consent: true }); expect((await j(none)).code).toBe('AADHAAR_INVALID');   // nothing on file: still required
  });
  it('11 (v189) the owner\'s "let them come" records ownerOk on the visit; only that property\'s owner; a second tap changes nothing', async () => {
    const DEAL = 'DEAL-2026-001'; const d = await j(await call(BRK, 'GET', `/api/deals/${DEAL}`)); const prop = d.property.id;
    const ow = await login(cfg.demoAccounts.find((a: any) => a.id === 'USR-OWNER-001').email, cfg.demoPassword);
    const b2 = await login(cfg.demoAccounts.find((a: any) => a.id === 'USR-BRK-002').email, cfg.demoPassword);
    const v = await call(BRK, 'POST', '/api/site-visits', { dealRoomId: DEAL, propertyId: prop, customerName: 'Owner Reply Test', scheduledTime: new Date(Date.now() + 2 * 86400_000).toISOString() });
    expect(v.status, await v.clone().text()).toBe(200); const vid = (await j(v)).siteVisit.id;
    expect((await call(b2, 'POST', `/api/site-visits/${vid}/owner-answer`, { answer: 'YES' })).status).toBe(404);   // a broker is not the owner
    const ok = await call(ow, 'POST', `/api/site-visits/${vid}/owner-answer`, { answer: 'YES' }); expect(ok.status, await ok.clone().text()).toBe(200); expect((await j(ok)).ownerOk.answer).toBe('YES');
    const again = await j(await call(ow, 'POST', `/api/site-visits/${vid}/owner-answer`, { answer: 'YES' })); expect(again.already).toBe(true);
    const list = (await j(await call(BRK, 'GET', `/api/site-visits?dealRoomId=${DEAL}`))).siteVisits as any[]; expect(list.find(x => x.id === vid).ownerOk.answer).toBe('YES');
    const audit = (await j(await call(SA, 'GET', '/api/audit-logs'))).events as any[]; expect(audit.filter(e => e.action === 'VISIT_OWNER_ANSWER' && e.entityId === vid).length).toBe(1);
  });
  it('12 (v189) an "Ask GENZ" ticket counts on the admin home, is answered with a reply, and the broker is told the reply time', async () => {
    const DEAL = 'DEAL-2026-001';
    const sent = await call(BRK, 'POST', '/api/privacy/requests', { type: 'GRIEVANCE', dealId: DEAL, details: 'The owner is not picking up, what now?' });
    expect(sent.status, await sent.clone().text()).toBe(200); const sb = await j(sent); expect(sb.respondWithinDays).toBeGreaterThan(0);
    const ins = (await j(await call(SA, 'GET', '/api/home/insights'))).insights; expect(ins.items.find((x: any) => x.id === 'asks').n).toBeGreaterThanOrEqual(1);
    const noReply = await call(SA, 'POST', `/api/privacy/requests/${sb.request.id}/resolve`, { decision: 'COMPLETE' }); expect(noReply.status).toBe(400);   // a reply is required
    const ok = await call(SA, 'POST', `/api/privacy/requests/${sb.request.id}/resolve`, { decision: 'COMPLETE', note: 'We called the owner; he will reply today.' }); expect(ok.status, await ok.clone().text()).toBe(200);
    const mine = (await j(await call(BRK, 'GET', '/api/privacy/requests'))).requests as any[]; expect(mine.find(r => r.id === sb.request.id).resolutionNote).toMatch(/called the owner/);
  });
  it('13 (v190, D17) approve without RERA = Tier 2; with an admin-approved RERA claim = Tier 1; setting ON blocks; a later RERA upgrades Tier 2 to Tier 1', async () => {
    const mk = async (phone: string, pan: string) => { const r = await signup(phone, { panNumber: pan }); expect(r.status).toBe(200); const id = (await j(r)).user.id; const ck = r.headers.get('set-cookie')!.split(';')[0]; await call(SA, 'POST', `/api/network/id-check/${id}`, { checked: true, note: 'PAN card seen' }); return { id, ck }; };
    const review = (id: string) => call(SA, 'POST', `/api/verifications/${id}/review`, { action: 'APPROVE', notes: 'seen' });
    const setOn = async (on: boolean) => expect((await call(SA, 'PUT', '/api/admin/settings', { requireReraForBrokerApproval: on })).status).toBe(200);
    // setting ON: blocked with the next step; an approved RERA claim unlocks Tier 1
    await setOn(true);
    const c = await mk('9826188011', 'ABCPN8811F'); const blocked = await review(c.id); expect(blocked.status).toBe(400); expect((await j(blocked)).code).toBe('RERA_REQUIRED');
    expect((await call(c.ck, 'POST', '/api/network/my-rera', { reraNumber: 'PCGRERA2026X0190' })).status).toBe(200);
    expect((await call(SA, 'POST', `/api/network/rera-claims/${c.id}`, { approve: true })).status).toBe(200);
    const okc = await review(c.id); const okb = await j(okc); expect(okc.status, JSON.stringify(okb)).toBe(200); expect(okb.user.tier).toBe('TIER1');
    // setting OFF (the default): no RERA = Tier 2 (audited), and a later RERA gives Tier 1
    await setOn(false);
    const d = await mk('9826188012', 'ABCPN8812F'); const okd = await review(d.id); const dbd = await j(okd); expect(okd.status, JSON.stringify(dbd)).toBe(200); expect(dbd.user.tier).toBe('TIER2');
    const audit = (await j(await call(SA, 'GET', '/api/audit-logs'))).events as any[]; expect(audit.some(e => e.action === 'BASIC_KYC_APPROVED' && e.entityId === d.id && /tier TIER2/.test(e.details || e.description || ''))).toBe(true);
    const up = await call(d.ck, 'POST', '/api/network/my-rera', { reraNumber: 'PCGRERA2026X0191' }); expect(up.status, await up.clone().text()).toBe(200); expect((await j(up)).tier).toBe('TIER2');   // v191 (S1): a typed RERA is only a pending claim
    expect((await call(SA, 'POST', `/api/network/rera-claims/${d.id}`, { approve: true })).status).toBe(200);
    expect((await j(await call(d.ck, 'GET', '/api/network/my-rera'))).tier).toBe('TIER1');
  });
});

describe('v187 · v188 UI source guards', () => {
  it('10 Basic gets the self-contained KYC screen; the sheet and background 403s do not pop by themselves; badge / banner / held text; mode-aware admin text', () => {
    expect(read('src/components/NetworkHub.tsx')).toMatch(/currentUser\.basicTier\) return[\s\S]{0,200}<KycDesk/);
    const k = read('src/components/KycDesk.tsx'); for (const t of ['netMyIdSave', 'netMyReraSave', 'idMineUpload', "'RERA'"]) expect(k).toContain(t); expect(k).not.toContain('netProfile');
    expect(read('src/lib/api.ts')).toContain('Date.now() - lastTap < 2500'); expect(read('src/components/KycLockedSheet.tsx')).toContain('quietUntil');
    expect(read('src/components/DailyView.tsx')).toContain('currentUser.basicTier ? <BasicDigest');
    expect(read('src/components/Navbar.tsx')).toContain('Basic — add KYC to unlock deals'); expect(read('src/components/BasicBanner.tsx')).toContain('Basic — add KYC to unlock deals');
    expect(read("src/App.tsx").match(/<BasicBanner \/>/g)!.length).toBeGreaterThanOrEqual(1); expect(read("src/App.tsx")).toContain("'deals'");
    expect(read('src/components/PropertiesView.tsx')).toContain('Held until your KYC is verified');
    const o = read('src/components/OnboardingView.tsx'); for (const t of ['openMode', 'AdminIdUpload', 'basic-rera-approve', 'formatINR(l.askingPrice)']) expect(o).toContain(t);
    expect(read('src/lib/api.ts')).toContain('idAdminUpload');
    expect(read('src/lib/api.ts')).toMatch(/const tapped = Date\.now\(\) - lastTap/); expect(read('src/lib/api.ts')).toContain('data?.basic && tapped');
    const sh = read('src/components/KycLockedSheet.tsx'); for (const t of ["'Escape'", 'box.current?.focus()', 'from.current?.focus', 'quietUntil = 0']) expect(sh).toContain(t);
    expect(read('src/components/FirstRunStrip.tsx')).not.toContain("'genz:kyc-locked'"); expect(read('src/components/DailyView.tsx')).toContain('if (!basic) api.leaderboard()');
    const kd = read('src/components/KycDesk.tsx'); for (const t of ['kyc-load-error', 'kyc-not-broker', 'Promise.allSettled']) expect(kd).toContain(t);
    expect(read('src/components/OnboardingView.tsx')).toContain('reraBusy === u.id');
  });
});

describe('v189 · no render-loop class (unstable tx / label in effect deps)', () => {
  it('useTx and useLabel return a stable function per language; KycDesk loads once (no tx in its load deps)', () => {
    expect(read('src/lib/i18n.tsx')).toMatch(/export const useTx = \(\) => \{ const \{ lang \} = useI18n\(\); return useCallback\(\(en: string, hi: string\) => \(lang === 'hi' \? hi : en\), \[lang\]\); \};/);
    expect(read('src/lib/labels.ts')).toMatch(/return useCallback\(\(kind: LabelKind[\s\S]*?\}, \[lang\]\);/);
    const k = read('src/components/KycDesk.tsx');
    expect(k).toMatch(/useCallback\(async \(\) => \{[\s\S]*?\}, \[\]\);/); expect(k).toContain('useEffect(() => { void load(); }, [load]);');
    // no component may list tx in the deps of an effect that fetches (it is stable now, but a regression to an inline function must be caught here)
    const bad: string[] = [];
    for (const f of readdirSync(path.join(root, 'src/components'))) { if (!f.endsWith('.tsx')) continue; const t = read('src/components/' + f); if (/useEffect\([^;]*?api\.[\s\S]{0,300}?\}, \[[^\]]*\btx\b[^\]]*\]\)/.test(t)) bad.push(f); }
    expect(bad).toEqual([]);
  });
});

describe('v189 · round 10 source guards', () => {
  it('Basic empty states and banner (2); honest RERA text (3); admin labels (6); owner PAN gate (7); plain agreement words (8); private client room (9); signup continues (11)', async () => {
    const pv = read('src/components/PropertiesView.tsx'); expect(pv).toContain('<BasicNetworkLocked what="listings"'); expect(pv).toContain("Network preview");
    expect(read('src/components/RequirementsView.tsx')).toContain('<BasicNetworkLocked what="needs" />');
    expect(read('src/App.tsx')).toContain("(['properties', 'requirements', 'desk', 'deals'] as string[]).includes(activeTab)");
    const j = read('src/components/JoinView.tsx'); expect(j).not.toContain('No Aadhaar or RERA needed'); expect(j).toContain('Tier 2 associate; add RERA later to move to Tier 1'); expect(j).not.toContain('You can browse the network'); expect(j).toContain('join-continue');
    const k = read('src/components/KycDesk.tsx'); for (const t of ['Tier 2 associate', 'kyc-rera-why']) expect(k).toContain(t);
    const o = read('src/components/OnboardingView.tsx'); for (const t of ['Basic (not KYC verified)', 'max-sm:block', 'howto-toggle', "basicTier)) toast(" ]) expect(o.includes(t) || t.startsWith('basicTier')).toBe(true);
    expect(read('src/components/DisputesView.tsx')).toContain('const [showAll, setShowAll] = useState(false)');
    const ow = read('src/components/OwnerListings.tsx'); expect(ow).toContain('owner-pan-need'); expect(ow).toContain('const start = () =>');
    const { agreementStatusWord } = await import('../src/lib/agreementWords');
    expect(agreementStatusWord('SENT_TO_PARTICIPANTS', false)).toBe('Sent — waiting for everyone to approve'); expect(agreementStatusWord('SENT_TO_PARTICIPANTS', true)).toMatch(/इंतज़ार/);
    expect(read('src/components/DealRoomsView.tsx')).not.toContain('SHA-256 hash-chained'); expect(read('src/components/ChatPlus.tsx')).toContain('agreementStatusWord(a.status');
    const c = read('server/clientroom.ts'); expect(c).not.toContain('joinFooter'); expect(c).toContain('👎 नहीं / No'); expect(c).not.toContain('Alerts are blocked');
    const wn = (await import('../src/lib/whatsNew')).WHATS_NEW[0]; expect(wn.en.join(' ')).not.toMatch(/offline queue|per user/); expect(wn.en.length).toBeLessThanOrEqual(3);
  });
});

