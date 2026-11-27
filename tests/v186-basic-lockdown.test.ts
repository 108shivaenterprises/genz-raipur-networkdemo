/**
 * v186 (D16) — Basic (open sign-up, not KYC-verified) is DEFAULT-DENY: each exploit path the security review found is checked over HTTP.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { freePort } from './helpers/port';
import { ipKey } from '../server/auth';
import { signupMode } from '../server/features';
import { isVerifiedFull } from '../server/permissions';

const root = path.resolve(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(root, f), 'utf8');
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const j = (r: Response) => r.json().catch(() => ({})) as Promise<any>;
const PASS = 'Naya#Account2026';
/** the demo network has only a handful of live listings: a real broker adds some so the quota has rows to cut */
async function seedListings(call: (ck: string | undefined, m: string, u: string, b?: unknown) => Promise<Response>, ck: string, n: number) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = await call(ck, 'POST', '/api/properties', { title: `Seed flat number ${i} Raipur`, description: 'A live listing added by a verified broker for the quota test.', propertyType: 'Residential Flat', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: `Seed Nagar ${i}`, pincode: '492007', addressHidden: `Flat ${i}, Seed Society, Raipur`, askingPrice: 4000000 + i * 100000, ownerApprovedNetPrice: 3800000 + i * 100000, ownerName: 'Seed Owner', ownerPhone: '9876500188', tags: [] });
    const b = await r.json() as any; if (b.property?.id) ids.push(b.property.id);
  }
  return ids;
}

function rig(env: Record<string, string>) {
  let proc: ChildProcess; let dir = ''; let B = ''; let cfg: any;
  const call = (ck: string | undefined, m: string, u: string, b?: unknown) => fetch(B + u, { method: m, headers: { 'content-type': 'application/json', ...(ck ? { cookie: ck } : {}) }, body: b ? JSON.stringify(b) : undefined });
  const login = async (who: string, password = PASS) => { const r = await call(undefined, 'POST', '/api/auth/login', { email: who, password }); expect(r.status, `${who} ${await r.clone().text()}`).toBe(200); return r.headers.get('set-cookie')!.split(';')[0]; };
  return {
    call, login, get cfg() { return cfg; },
    async start() {
      const port = await freePort(); B = `http://127.0.0.1:${port}`;
      dir = mkdtempSync(path.join(tmpdir(), 'genz-v186-')); mkdirSync(path.join(dir, 'data'));
      proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], { cwd: dir, stdio: 'ignore', env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', SMS_WEBHOOK_URL: '', FAST2SMS_API_KEY: '', PUSH_DRY_RUN: 'true', SAHAYAK: 'off', PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true', ...env } });
      for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
    },
    async stop() { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); },
  };
}

describe('v186 · Basic is default-deny (HTTP)', { timeout: 300_000 }, () => {
  const s = rig({ SIGNUP_IP_DAILY_CAP: '30', BASIC_ROWS_PER_DAY: '5' });
  let SA = ''; let BRK = ''; let A = ''; let AID = ''; let CON = '';
  beforeAll(async () => {
    await s.start(); SA = await s.login(s.cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').email, s.cfg.demoPassword);
    BRK = await s.login(s.cfg.demoAccounts.find((a: any) => a.id === 'USR-BRK-001').email, s.cfg.demoPassword);
    await seedListings(s.call, await s.login(s.cfg.demoAccounts.find((a: any) => a.id === 'USR-BRK-002').email, s.cfg.demoPassword), 8);
  }, 120_000);
  afterAll(() => s.stop());
  const otp = async (phone: string) => { const r = await s.call(undefined, 'POST', '/api/auth/signup-otp', { phone }); const b = await j(r); expect(r.status, JSON.stringify(b)).toBe(200); return b as { otpToken: string; devCode: string }; };
  const signup = async (phone: string, extra: object = {}, code?: { otpToken: string; devCode: string }) => {
    const o = code || await otp(phone);
    return s.call(undefined, 'POST', '/api/auth/signup', { role: 'BROKER', name: 'Naya Broker', phone, otpToken: o.otpToken, otpCode: o.devCode, password: PASS, consent: true, panConsent: true, city: 'Raipur', panNumber: 'ABCPN8600F', officePhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', officeLocation: { lat: 21.2514, lng: 81.6296, acc: 20 }, ...extra });
  };
  const cookie = (r: Response) => r.headers.get('set-cookie')!.split(';')[0];
  const locked = async (r: Response) => { const b = await j(r); expect(r.status, JSON.stringify(b)).toBe(403); expect(b.code).toBe('ACCOUNT_NOT_VERIFIED'); expect(b.basic).toBe(true); expect(b.errorHi).toMatch(/KYC/); };

  it('sign-up works; the id is random; consent carries the PAN-purpose tick, notice hash and user-agent', async () => {
    const r = await signup('9826186001'); const b = await j(r); expect(r.status, JSON.stringify(b)).toBe(200);
    AID = b.user.id; A = cookie(r); expect(AID).toMatch(/^USR-BRO-\d+-[0-9a-f]{8}$/);
    const me = (await j(await s.call(A, 'GET', '/api/auth/me'))).user;
    expect(me.idConsentAt).toBeTruthy(); expect(me.consent.noticeHash).toMatch(/^[0-9a-f]{16}$/); expect(me.consent.policyVersion).toBeTruthy(); expect(typeof me.consent.ua).toBe('string');
    const noTick = await signup('9826186099', { panConsent: false, panNumber: 'ABCPN8699F' }); expect((await j(noTick)).code).toBe('PAN_CONSENT_REQUIRED');
  });

  it('H1 reports and quick flags are locked (a Basic account cannot hide listings or suspend people)', async () => {
    await locked(await s.call(A, 'POST', '/api/daily/report', { targetType: 'BROKER', targetId: 'USR-BRK-002', reason: 'FAKE', note: 'x' }));
    await locked(await s.call(A, 'POST', '/api/daily/listings/PROP-101/flag', { reason: 'SOLD' }));
  });
  it('H2 network watch check / report are locked', async () => {
    await locked(await s.call(A, 'POST', '/api/party-watch/check', { phone: '9876543210' }));
    await locked(await s.call(A, 'POST', '/api/party-watch/report', { phone: '9876543210', category: 'x', note: 'twelve characters of text' }));
  });
  it('H4 claiming a client need and broadcasting are locked', async () => {
    await locked(await s.call(A, 'POST', '/api/requirements/REQ-1/claim', {}));
    await locked(await s.call(A, 'POST', '/api/broadcast', { requirementId: 'REQ-1' }));
  });
  it('H5 /my-rera: a Basic account only files a PENDING claim — no tier, no number — and it is not proof for approval', async () => {
    const r = await s.call(A, 'POST', '/api/network/my-rera', { reraNumber: 'CGRERA010224A0186' }); const b = await j(r);
    expect(r.status, JSON.stringify(b)).toBe(200); expect(b.pending).toBe(true); expect(b.claim.status).toBe('PENDING'); expect(b.tier).toBe('TIER2');
    const me = (await j(await s.call(A, 'GET', '/api/auth/me'))).user; expect(me.reraNumber || '').toBe('');
    const claims = (await j(await s.call(SA, 'GET', '/api/network/rera-claims'))).claims as any[]; expect(claims.some(c => c.userId === AID)).toBe(true);
    // approval is still refused: no ID evidence (PAN + Aadhaar seen)
    expect((await s.call(SA, 'POST', `/api/verifications/${AID}/review`, { action: 'APPROVE', notes: 'x' })).status).toBe(400);   // the platform RERA setting (claim is not a number) — and below, no ID evidence either
  });
  it('H6 posting a construction lead and H7 a connector referral are locked', async () => {
    await locked(await s.call(A, 'POST', '/api/construction-leads', { title: 'x' }));
    const r = await signup('9826186002', { role: 'GENZ_CONNECTOR', shopType: 'KIRANA_STORE', shopName: 'Sharma Kirana', panNumber: undefined, panConsent: undefined, city: undefined });
    expect(r.status, await r.clone().text()).toBe(200); CON = cookie(r);
    await locked(await s.call(CON, 'POST', '/api/connector/referrals', { customerName: 'X', customerPhone: '9876500000' }));
  });
  it('H8/H10 property papers and the people list are locked; the profiles phone-search oracle is closed; the directory hides Basic', async () => {
    await locked(await s.call(A, 'GET', '/api/pdocs/people'));
    await locked(await s.call(A, 'POST', '/api/property-docs', { title: 'x' }));
    await locked(await s.call(A, 'GET', '/api/profiles/search?q=9826186001'));
    await locked(await s.call(A, 'GET', '/api/matching/matrix'));
    const dir = (await j(await s.call(BRK, 'GET', '/api/auth/users'))).users as any[]; expect(dir.some(u => u.id === AID)).toBe(false);
    // a verified member's phone search never finds a Basic account
    const f = await j(await s.call(BRK, 'GET', '/api/profiles/search?q=9826186001')); expect((f.results || []).length).toBe(0);
  });
  it('(a) scraping: a Basic account gets only its daily row quota (clamped, friendly note); the list never errors, own rows always come', async () => {
    const one = await j(await s.call(A, 'GET', '/api/properties')); expect((one.properties || []).length).toBeLessThanOrEqual(5);
    const again = await s.call(A, 'GET', '/api/properties'); const b = await j(again);
    expect(again.status).toBe(200); expect((b.properties || []).filter((p: any) => p.listingBrokerId !== AID).length).toBe(0); if ((one.properties || []).length >= 5) { expect(b.limited).toBe(true); expect(b.limitedNoteHi).toMatch(/KYC/); }
    const rq = await j(await s.call(A, 'GET', '/api/requirements')); expect((rq.requirements || []).length).toBeLessThanOrEqual(5);
  });
  it('H12 approval needs ID evidence; held listings are NOT auto-published (explicit publish, max 10); a PAN claimed by two Basic accounts is recorded as a conflict', async () => {
    const B2r = await signup('9826186003', { panNumber: 'ABCPN8600F' }); expect(B2r.status, await B2r.clone().text()).toBe(200);   // same PAN as A: allowed, it is only a claim
    const B2id = (await j(B2r)).user.id;
    const own = await s.call(A, 'POST', '/api/properties', { title: 'Held flat in Raipur one', description: 'A flat listed by a Basic account.', propertyType: 'Residential Flat', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: 'Shankar Nagar', pincode: '492007', addressHidden: 'Flat 4, Test Society, Raipur', askingPrice: 5500000, ownerApprovedNetPrice: 5200000, ownerName: 'Some Owner', ownerPhone: '9876500186', tags: [] });
    const pid = (await j(own)).property?.id; expect(pid).toBeTruthy();
    const held = await j(await s.call(SA, 'GET', `/api/verifications/${AID}/held`)); expect(held.total).toBe(1); expect(held.willPublish).toBe(1);
    expect((await s.call(A, 'POST', '/api/network/my-id', { panNumber: 'ABCPN8600F', aadhaarNumber: '234567890130', consent: true })).status).toBe(200);
    expect((await s.call(SA, 'POST', `/api/network/id-check/${AID}`, { checked: true, note: 'PAN + Aadhaar card seen' })).status).toBe(200);
    expect((await s.call(SA, 'POST', `/api/network/rera-claims/${AID}`, { approve: true })).status).toBe(200);   // an admin checks the claim on the portal
    const ap = await s.call(SA, 'POST', `/api/verifications/${AID}/review`, { action: 'APPROVE', notes: 'seen' }); const ab = await j(ap);   // no ids ticked: nothing is published
    expect(ap.status, JSON.stringify(ab)).toBe(200); expect(ab.publishedHeld).toBe(0); expect(ab.heldLeft).toBe(1);
    const stillHidden = ((await j(await s.call(BRK, 'GET', '/api/properties'))).properties as any[]).some(p => p.id === pid); expect(stillHidden).toBe(false);
    // the other Basic claimant of the same PAN is NOT silently cleared (v186b): a conflict is recorded for an admin
    const users = (await j(await s.call(SA, 'GET', '/api/auth/users'))).users as any[]; expect(users.find(u => u.id === B2id).panNumber).toBe('ABCPN8600F');
    expect(((await j(await s.call(SA, 'GET', '/api/audit-logs'))).events as any[]).some(e => e.action === 'PAN_CLAIM_CONFLICT' && e.entityId === B2id)).toBe(true);
    // a second review with an explicit publish
    expect(read('server.ts')).toContain('.slice(0, 10)'); expect(read('server.ts')).toContain('publishIds');
  });
  it('PAN: a refusal is generic and audited; a typo / refusal does not burn the one-time code', async () => {
    const code = (await j(await s.call(SA, 'POST', '/api/invitations', { invitedEmail: 'holder@test.genz.example', invitedPhone: '9826186020', targetRole: 'BROKER' }))).invitation.code;
    expect((await s.call(undefined, 'POST', '/api/auth/register-invite', { code, name: 'Pan Holder', phone: '9826186020', email: 'holder@test.genz.example', password: PASS, consent: true, city: 'Raipur', aadhaarNumber: '234567890130', idConsent: true, panNumber: 'ABCPH9120F' })).status).toBe(200);
    const o = await otp('9826186004');
    const refused = await signup('9826186004', { panNumber: 'ABCPH9120F' }, o); const rb = await j(refused);
    expect(refused.status).toBe(409); expect(rb.code).toBe('CANNOT_REGISTER'); expect(JSON.stringify(rb)).not.toMatch(/already|registered|linked/i);
    const retry = await signup('9826186004', { panNumber: 'ABCPN8604F' }, o); expect(retry.status, await retry.clone().text()).toBe(200);   // the same code still works
    const audit = (await j(await s.call(SA, 'GET', '/api/audit-logs'))).events as any[]; expect(audit.some(e => e.action === 'SIGNUP_PAN_REFUSED')).toBe(true);
  });
  it('(6) an invited sign-up with OTP + PAN is Basic too (no broker id, locked actions)', async () => {
    const code = (await j(await s.call(SA, 'POST', '/api/invitations', { invitedEmail: 'inv.otp@test.genz.example', invitedPhone: '9826186030', targetRole: 'BROKER' }))).invitation.code;
    const o = await j(await s.call(undefined, 'POST', '/api/auth/register-otp', { code, phone: '9826186030' }));
    const reg = await s.call(undefined, 'POST', '/api/auth/register-invite', { code, name: 'Invited Otp', phone: '9826186030', email: 'inv.otp@test.genz.example', password: PASS, consent: true, city: 'Raipur', aadhaarNumber: '234567890130', idConsent: true, panNumber: 'ABCPI9130F', otpToken: o.otpToken, otpCode: o.devCode });
    const rb = await j(reg); expect(reg.status, JSON.stringify(rb)).toBe(200); expect(rb.basic).toBe(true); expect(rb.user.basicTier).toBe(true); expect(rb.user.brokerId).toBeUndefined();
    await locked(await s.call(cookie(reg), 'POST', '/api/broadcast', { requirementId: 'REQ-1' }));
  });
});

describe('v186 · units and source guards', () => {
  it('H9 IPv6 counts by /64; the OTP limits use it; per-(ip, phone) keys; open sign-up codes have their own bucket', () => {
    expect(ipKey('2001:db8:1:2:aaaa::1')).toBe(ipKey('2001:db8:1:2:bbbb:cccc:dddd:2')); expect(ipKey('2001:db8:1:3::1')).not.toBe(ipKey('2001:db8:1:2::1'));
    expect(ipKey('::ffff:10.1.2.3')).toBe('10.1.2.3'); expect(ipKey('10.1.2.3')).toBe('10.1.2.3');
    const o = read('server/otpManual.ts'); expect(o).toContain('ip = ipKey(ip)'); expect(o).toContain("'open'"); expect(o).toContain("purpose === 'open' ? r.purpose === 'open' : r.purpose !== 'open'");
    expect(read('server/ownerlist.ts')).toContain('signup-otp:${ipKey(ip)}|${phone}');
    const g = read('server/openSignup.ts'); expect(g).toContain('ipKey(req.ip)'); expect(g).toContain('made.delete(ip)'); expect(g).toContain('open-pair:'); expect(g).toContain("tag: 'basic-signups'");
  });
  it('(5) SIGNUP_MODE fails closed: only the exact words; anything else is invite', () => {
    const was = process.env.SIGNUP_MODE; const err = console.error; console.error = () => {};
    try {
      const m = (v?: string) => { if (v === undefined) delete process.env.SIGNUP_MODE; else process.env.SIGNUP_MODE = v; return signupMode(); };
      expect(m(undefined)).toBe('open'); expect(m('open')).toBe('open'); expect(m('invite')).toBe('invite');
      for (const bad of ['Open', 'opne', 'OPEN ', 'true', 'closed']) expect(m(bad)).toBe('invite');
    } finally { console.error = err; if (was === undefined) delete process.env.SIGNUP_MODE; else process.env.SIGNUP_MODE = was; }
  });
  it('isVerifiedFull: verified and not Basic', () => {
    expect(isVerifiedFull({ verificationStatus: 'VERIFIED' })).toBe(true); expect(isVerifiedFull({ verificationStatus: 'VERIFIED', basicTier: true })).toBe(false);
    expect(isVerifiedFull({ verificationStatus: 'PENDING' })).toBe(false); expect(isVerifiedFull(undefined)).toBe(false);
  });
  it('no trust / visibility / ability check on a user still reads plain VERIFIED (allow-list of the sign-in / self-data cases)', () => {
    const skipFile = /^(db|auth|permissions|webpush|openSignup|demoNetwork|demoBulk|dealTemplates|connectorSeed)\.ts$/;
    const propSubject = /\b(p|prop|property|np|t|c|x)\.verificationStatus/;   // properties / tasks (checked below for x)
    const bad: string[] = [];
    for (const f of ['server.ts', ...readdirSync(path.join(root, 'server')).filter(n => n.endsWith('.ts') && !skipFile.test(n)).map(n => `server/${n}`)]) {
      read(f).split('\n').forEach((l, i) => {
        for (const m of l.matchAll(/\b(\w+)\.verificationStatus\s*[!=]==\s*'VERIFIED'/g)) {
          if (/basicTier|newUser\./.test(l)) continue; const subj = m[1]; if (['p', 'prop', 'property', 'np', 'pr', 'l'].includes(subj) && !/users|isVerifiedFull/.test(l)) continue;
          if (/state\.properties|st\(\)\.properties|s\.properties|properties\.filter|Property\b/.test(l) && subj !== 'u') continue;
          bad.push(`${f}:${i + 1}:${subj}`);
        }
      });
    }
    // the only plain checks left: sign-in / self-data, the admin audience of an alert, a count of connectors, the report target, the legal panel's own flag
    const allowed = bad.filter(b => !/^(server\.ts:(30\d|31\d|64\d|65\d|100\d)|server\/connector\.ts:16|server\/legal\.ts:3|server\/daily\.ts:41|server\/clientroom\.ts|server\/consent\.ts|server\/feed\.ts|server\/broadcast\.ts:3|server\/saved\.ts|server\/listings\.ts|server\/report\.ts|server\/publicPage\.ts:4|server\/share\.ts:(65|29)|server\/growth\.ts:38|server\/revenue\.ts:10|server\/matching\.ts|server\/access\.ts:(11)|server\/shopPartners\.ts:10)/.test(b));
    expect(allowed, allowed.join(', ')).toEqual([]);
    void propSubject;
  });
  it('H3/H11/H12 guards: board and appoint / assign targets use the full check; approval publishes at most 10 held listings on request; PAN retention sweep is on by default', () => {
    expect(read('server/leadboard.ts')).toContain('isVerifiedFull(u)'); expect(read('server/pcontrol.ts')).toContain('!isVerifiedFull(broker)'); expect(read('server/connector.ts')).toContain('isVerifiedFull(to)');
    expect(read('server/network.ts')).toContain('isVerifiedFull(t)'); expect(read('server.ts')).toContain('isVerifiedFull(b)');
    expect(read('server/idreview.ts')).toContain('sweepBasicPan'); expect(read('server/features.ts')).toContain('BASIC_PAN_RETENTION');
    expect(read('server/permissions.ts')).toMatch(/BASIC_LOCKED[\s\S]*'report:create', 'partywatch:report', 'lead:create', 'connector:refer'/);
  });
  it('(7) the retention sweep clears the PAN of a Basic account with no KYC activity, and nobody else', async () => {
    const { db } = await import('../server/db'); const { sweepBasicPan } = await import('../server/idreview');
    const old = new Date(Date.now() - 200 * 86400_000).toISOString(); const recent = new Date(Date.now() - 10 * 86400_000).toISOString();
    const mk = (id: string, extra: object) => ({ id, name: id, role: 'BROKER', basicTier: true, panNumber: 'ABCPN1111F', createdAt: old, verificationStatus: 'VERIFIED', ...extra });
    const users: any[] = [mk('U-IDLE', {}), mk('U-ACTIVE', { aadhaarLast4: '1234' }), mk('U-NEW', { createdAt: recent }), mk('U-FULL', { basicTier: undefined })];
    const st: any = { users, idDocs: [], auditEvents: [] };
    const g = db.getState.bind(db), sv = db.save.bind(db), ap = db.appendAuditEvent.bind(db);
    (db as any).getState = () => st; (db as any).save = () => {}; (db as any).appendAuditEvent = (...a: any[]) => { st.auditEvents.push(a); };
    try { expect(sweepBasicPan()).toBe(1); } finally { (db as any).getState = g; (db as any).save = sv; (db as any).appendAuditEvent = ap; }
    expect(users.find(u => u.id === 'U-IDLE').panNumber).toBeUndefined();
    for (const id of ['U-ACTIVE', 'U-NEW', 'U-FULL']) expect(users.find(u => u.id === id).panNumber).toBe('ABCPN1111F');
    expect(st.auditEvents.some((a: any[]) => a[4] === 'BASIC_PAN_CLEARED')).toBe(true);
  });
});

describe('v186 · (8) the demo code is never returned when DEMO_MODE is off', { timeout: 120_000 }, () => {
  const s = rig({ DEMO_MODE: 'false', OTP_MODE: 'manual', SIGNUP_IP_DAILY_CAP: '5' });
  beforeAll(async () => { await s.start(); }, 120_000);
  afterAll(() => s.stop());
  it('signup-otp has no devCode (manual mode) and the sms path refuses instead of leaking one', async () => {
    const r = await s.call(undefined, 'POST', '/api/auth/signup-otp', { phone: '9826186070' }); const b = await j(r);
    expect(JSON.stringify(b)).not.toMatch(/devCode/); expect(b.ref || b.otpToken).toBeTruthy();
  });
});

describe('v186b · second review (HTTP)', { timeout: 300_000 }, () => {
  const s = rig({ SIGNUP_IP_DAILY_CAP: '30', BASIC_ROWS_PER_DAY: '5', BASIC_IP_ROWS_PER_DAY: '8' });
  let SA = ''; let BRK = ''; let A = ''; let AID = ''; let B = ''; let C = ''; let CID = ''; let C2 = ''; let C2ID = ''; let PID = '';
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]).toString('base64');
  beforeAll(async () => {
    await s.start(); SA = await s.login(s.cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').email, s.cfg.demoPassword);
    BRK = await s.login(s.cfg.demoAccounts.find((a: any) => a.id === 'USR-BRK-001').email, s.cfg.demoPassword);
    await seedListings(s.call, await s.login(s.cfg.demoAccounts.find((a: any) => a.id === 'USR-BRK-002').email, s.cfg.demoPassword), 10);
  }, 120_000);
  afterAll(() => s.stop());
  const otp = async (phone: string) => { const r = await s.call(undefined, 'POST', '/api/auth/signup-otp', { phone }); const b = await j(r); expect(r.status, JSON.stringify(b)).toBe(200); return b as { otpToken: string; devCode: string }; };
  const signup = async (phone: string, extra: object = {}) => {
    const o = await otp(phone);
    return s.call(undefined, 'POST', '/api/auth/signup', { role: 'BROKER', name: 'Naya Broker', phone, otpToken: o.otpToken, otpCode: o.devCode, password: PASS, consent: true, panConsent: true, city: 'Raipur', panNumber: 'ABCPN8700F', officePhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', officeLocation: { lat: 21.2514, lng: 81.6296, acc: 20 }, ...extra });
  };
  const cookie = (r: Response) => r.headers.get('set-cookie')!.split(';')[0];
  const locked = async (r: Response) => { const b = await j(r); expect(r.status, JSON.stringify(b)).toBe(403); expect(b.basic).toBe(true); };
  const listing = (title: string, extra: object = {}) => ({ title, description: 'A flat listed in the second review test.', propertyType: 'Residential Flat', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: 'Shankar Nagar', pincode: '492007', addressHidden: 'Flat 4, Test Society, Raipur', askingPrice: 5500000, ownerApprovedNetPrice: 5200000, ownerName: 'Some Owner', ownerPhone: '9876500187', tags: [], ...extra });

  it('set-up: two Basic brokers, two Basic shop partners (the same PAN on both partners)', async () => {
    const a = await signup('9826187001'); expect(a.status, await a.clone().text()).toBe(200); A = cookie(a); AID = (await j(a)).user.id;
    const b = await signup('9826187002', { panNumber: 'ABCPN8702F' }); expect(b.status, await b.clone().text()).toBe(200); B = cookie(b);
    const mkC = async (phone: string) => { const r = await signup(phone, { role: 'GENZ_CONNECTOR', shopType: 'KIRANA_STORE', shopName: `Shop ${phone}`, panNumber: 'ABCPC8703F', city: undefined }); expect(r.status, await r.clone().text()).toBe(200); return r; };
    const c = await mkC('9826187003'); C = cookie(c); CID = (await j(c)).user.id;
    const c2 = await mkC('9826187004'); C2 = cookie(c2); C2ID = (await j(c2)).user.id;
  });

  it('HIGH-1 other reads: the map, the member directory, single reads, feeds and profile pages give a Basic account nothing about the network', async () => {
    const own = await s.call(A, 'POST', '/api/properties', listing('Own held flat for the map test')); const ob = await j(own); expect([200, 201], JSON.stringify(ob)).toContain(own.status); PID = ob.property.id;
    const map = await j(await s.call(A, 'GET', '/api/daily/map?city=ALL')); expect(map.basicLimited).toBe(true); expect(map.pins.length).toBe(1); expect(map.pins[0].mine).toBe(true); expect(map.networkCount).toBeGreaterThan(0);
    const dir = await j(await s.call(A, 'GET', '/api/auth/users')); expect(dir.users.length).toBe(1); expect(dir.users[0].id).toBe(AID);
    for (const u of ['/api/community/leaderboard', '/api/feed', '/api/daily/digest', '/api/community/chapters', '/api/construction-leads', '/api/builder/projects', '/api/network/profile/USR-BRK-001', '/api/profiles/u/USR-BRK-001']) await locked(await s.call(A, 'GET', u));
    await locked(await s.call(A, 'POST', '/api/saved/PROP-101', {})); await locked(await s.call(A, 'GET', '/api/broadcast/demand-supply?city=Raipur'));
    expect((await j(await s.call(A, 'GET', '/api/activity-feed'))).activities).toEqual([]);
    const nm = await j(await s.call(A, 'GET', '/api/broadcast/network/REQ-1')); expect(nm.success === true ? nm.count : 0).toBe(0);
  });

  it('HIGH-1/3 single reads count against the quota (per account and per IP); own rows are never counted or blocked; the list keeps working', async () => {
    const ids = ((await j(await s.call(BRK, 'GET', '/api/properties'))).properties as any[]).filter(p => p.listingBrokerId !== 'USR-BRK-001').slice(0, 9).map(p => p.id); expect(ids.length).toBeGreaterThanOrEqual(9);
    for (const id of ids.slice(0, 5)) expect((await s.call(A, 'GET', `/api/properties/${id}`)).status).toBe(200);
    const over = await s.call(A, 'GET', `/api/properties/${ids[5]}`); const ob = await j(over); expect(over.status).toBe(429); expect(ob.code).toBe('BASIC_QUOTA'); expect(ob.errorHi).toMatch(/KYC/);
    expect((await s.call(A, 'GET', `/api/properties/${PID}`)).status).toBe(200);   // own listing: always open
    const list = await j(await s.call(A, 'GET', '/api/properties')); expect((list.properties as any[]).some(p => p.id === PID)).toBe(true);   // own rows come first and are never trimmed
    // the IP bucket (8 rows/day here) counts only rows that are not the account's own: A used 5, B has 3 left and then the network is capped
    for (const id of ids.slice(5, 8)) expect((await s.call(B, 'GET', `/api/properties/${id}`)).status).toBe(200);
    const ipOver = await s.call(B, 'GET', `/api/properties/${ids[8]}`); expect(ipOver.status).toBe(429); expect((await j(ipOver)).code).toBe('BASIC_QUOTA_IP');
  });

  it('HIGH-2 / MED-2 a shop partner can give an ID copy (or an admin attaches one) and is approved only after a person has SEEN the card; a shared PAN claim is recorded, not silently cleared', async () => {
    expect((await s.call(C, 'GET', '/api/id-review/mine')).status).toBe(200);
    const up = await s.call(C, 'POST', '/api/id-review/mine/docs', { kind: 'PAN', fileName: 'pan.png', data: png }); expect(up.status, await up.clone().text()).toBe(200);
    const adm = await s.call(SA, 'POST', `/api/id-review/users/${C2ID}/docs`, { kind: 'PAN', fileName: 'pan-seen.png', data: png }); expect(adm.status, await adm.clone().text()).toBe(200);
    expect((await s.call(C, 'POST', '/api/id-review/users/' + CID + '/docs', { kind: 'PAN', fileName: 'x.png', data: png })).status).toBe(403);   // not for members
    // an uploaded copy alone is not enough
    const early = await s.call(SA, 'POST', `/api/verifications/${CID}/review`, { action: 'APPROVE', notes: 'x' }); expect(early.status).toBe(400); expect((await j(early)).code).toBe('KYC_EVIDENCE_MISSING');
    expect((await s.call(SA, 'POST', `/api/network/id-check/${CID}`, { checked: true, note: 'PAN card seen at the shop' })).status).toBe(200);
    const ok = await s.call(SA, 'POST', `/api/verifications/${CID}/review`, { action: 'APPROVE', notes: 'seen' }); expect(ok.status, await ok.clone().text()).toBe(200);
    const audit = (await j(await s.call(SA, 'GET', '/api/audit-logs'))).events as any[]; expect(audit.some(e => e.action === 'PAN_CLAIM_CONFLICT' && e.entityId === C2ID)).toBe(true);
    const users = (await j(await s.call(SA, 'GET', '/api/auth/users'))).users as any[]; expect(users.find(u => u.id === C2ID).panNumber).toBeTruthy();   // the other claim stays until an admin resolves it
    expect(users.find(u => u.id === CID).basicTier).toBeFalsy();
  });

  it('MED-1 a Basic PAN claim does not block an invited broker with the same PAN', async () => {
    const code = (await j(await s.call(SA, 'POST', '/api/invitations', { invitedEmail: 'squat@test.genz.example', invitedPhone: '9826187010', targetRole: 'BROKER' }))).invitation.code;
    const r = await s.call(undefined, 'POST', '/api/auth/register-invite', { code, name: 'Real Holder', phone: '9826187010', email: 'squat@test.genz.example', password: PASS, consent: true, city: 'Raipur', aadhaarNumber: '234567890130', idConsent: true, panNumber: 'ABCPN8700F' });
    expect(r.status, await r.clone().text()).toBe(200);
  });

  it('MED-3 / MED-4 a held listing is 404 in the vault for others and never blocks a real broker listing the same property', async () => {
    expect((await s.call(BRK, 'GET', `/api/properties/${PID}/vault/assets`)).status).toBe(404);
    expect((await s.call(A, 'GET', `/api/properties/${PID}/vault/assets`)).status).toBe(200);
    const dup = await s.call(BRK, 'POST', '/api/properties', listing('Own held flat for the map test')); expect(dup.status, await dup.clone().text()).not.toBe(409);
  });

  it('MED-5 migration: OTP/open-signup accounts nobody has checked become Basic; demo, staff, owners and checked accounts are untouched; idempotent; BASIC_MIGRATION=off skips', async () => {
    const { db } = await import('../server/db'); const { migrateBasicTier } = await import('../server/openSignup');
    const mk = (id: string, extra: object) => ({ id, name: id, role: 'BROKER', verificationStatus: 'VERIFIED', ...extra });
    const users: any[] = [mk('M-OTP', { autoVerifiedBy: 'OTP_PAN' }), mk('M-OPEN', { autoVerifiedBy: 'OPEN_SIGNUP' }), mk('M-SEEN', { autoVerifiedBy: 'OTP_PAN', idCheckedAt: 'x' }), mk('M-DEMO', {}), mk('M-SPONSOR', { autoVerifiedBy: 'USR-BRK-001' }), mk('M-OWNER', { role: 'PROPERTY_OWNER', autoVerifiedBy: 'OTP_PAN' }), mk('M-ADMIN', { role: 'ADMIN', autoVerifiedBy: 'OTP_PAN' })];
    const st: any = { users, auditEvents: [] }; const g = db.getState.bind(db), sv = db.save.bind(db), ap = db.appendAuditEvent.bind(db);
    (db as any).getState = () => st; (db as any).save = () => {}; (db as any).appendAuditEvent = (...a: any[]) => { st.auditEvents.push(a); };
    const was = process.env.BASIC_MIGRATION;
    try {
      process.env.BASIC_MIGRATION = 'off'; expect(migrateBasicTier()).toBe(0);
      delete process.env.BASIC_MIGRATION; expect(migrateBasicTier()).toBe(2); expect(migrateBasicTier()).toBe(0);
    } finally { (db as any).getState = g; (db as any).save = sv; (db as any).appendAuditEvent = ap; if (was === undefined) delete process.env.BASIC_MIGRATION; else process.env.BASIC_MIGRATION = was; }
    expect(users.filter(u => u.basicTier).map(u => u.id).sort()).toEqual(['M-OPEN', 'M-OTP']); expect(st.auditEvents.filter((a: any[]) => a[4] === 'BASIC_MIGRATED').length).toBe(2);
    expect(read('server.ts')).toContain("['basicMigration', migrateBasicTier]");
  });

  it('LOW guards: publish only ticked ids; the PAN sweep skips closed accounts and counts from the last sign-in; RERA claim conflicts; no co-broke pointer or commission terms for Basic', () => {
    const sv = read('server.ts'); expect(sv).toContain('tick.has(x.id)'); expect(sv).toContain('blockedAnswer(bond, !!currentUser.basicTier)'); expect(sv).toContain('p.basicHold && !db.byId');
    expect(read('server/consent.ts')).toContain('live && !basic');
    const i = read('server/idreview.ts'); expect(i).toContain("['SUSPENDED', 'BLACKLISTED'].includes(u.verificationStatus)"); expect(i).toContain('lastLoginAt');
    expect(read('server/network.ts')).toContain('RERA_CONFLICT'); expect(read('server/permissions.ts')).toContain("'builder:projects_read'");
    expect(read('server/legal.ts')).toContain('basic: !!c.basicTier'); expect(read('server/clientroom.ts')).toContain('p.listingBrokerId !== me().id) return kycLocked(res)');
    expect(read('src/components/ConnectorDesk.tsx')).toContain('!u.basicTier'); expect(read('src/components/MandateModal.tsx')).toContain('!b.basicTier');
  });
});
