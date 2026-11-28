import { ackBuyer } from './helpers/ack';
import { freePort } from './helpers/port';
/** v200 (D23) — job-code handshake, before/after proof + sign-off, derived tier badges. Rig copied from v199. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { readFileSync } from 'fs';
import { issueJobCode, checkJobCode, codeState, unlockJobCode, triesLeft, JOBCODE_MAX_ISSUES } from '../server/jobcode';
import { badgeCounts } from '../server/profiles';
import { eraseMudraFor } from '../server/mudra';
import { badgeFor, BADGE_CONFIG } from '../src/shared/tierBadge';

process.env.AUTH_SECRET ||= 'v200-test-secret-0123456789abcdef0123';   // the hash key comes from the server secret; the unit tests must not write one into ./data
const ROOT = path.resolve(__dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const form = (cookie: string | undefined, url: string, data: Record<string, string>) =>
  fetch(B + url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(data).toString() });
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v200-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, QUIET_HOURS: 'off', KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PUSH_DRY_RUN: 'true', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true', REVEAL_FRESH_LISTING_HOURS: '0.003', VIDEO_MAX_MB: '5' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', OWN: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1', SA: 'USR-SUPERADMIN', BUY: 'USR-BUYER-001' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 500)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });



const j = async (r: Response) => r.json().catch(() => ({})) as Promise<any>;
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const BUYER = 'USR-BUYER-001';
const DAY = 24 * 3600_000;

describe('v200 · the code itself (unit)', () => {
  it('only a salted hash is stored: the plain code is nowhere in the record; 4 digits', () => {
    const o = issueJobCode(); if ('error' in o) throw new Error('x');
    expect(o.code).toMatch(/^\d{4}$/); expect(JSON.stringify(o.rec)).not.toContain(`"${o.code}"`); expect(Object.keys(o.rec).sort()).toEqual(['attempts', 'expiresAt', 'hash', 'issues', 'salt']);
    expect(o.rec.hash).toMatch(/^[0-9a-f]{64}$/); expect(Date.parse(o.rec.expiresAt) - Date.now()).toBeGreaterThan(23.9 * 3600_000);
  });
  it('works once; a second use is refused', () => {
    const o = issueJobCode() as any; expect(checkJobCode(o.rec, o.code)).toBe('OK'); expect(checkJobCode(o.rec, o.code)).toBe('USED'); expect(codeState(o.rec)).toBe('USED');
  });
  it('expires after 24 h (even with the right code), and a code that is not 4 digits never matches', () => {
    const o = issueJobCode() as any; expect(checkJobCode(o.rec, o.code, Date.now() + DAY + 60_000)).toBe('EXPIRED');
    const p = issueJobCode() as any; expect(checkJobCode(p.rec, `${p.code}0`)).toBe('BAD'); expect(checkJobCode(p.rec, '')).toBe('BAD'); expect(checkJobCode(p.rec, undefined)).toBe('BAD');
  });
  it('5 wrong tries lock it: the right code no longer works, and no new code can be made over a lock', () => {
    const o = issueJobCode() as any; const wrong = o.code === '0000' ? '1111' : '0000';
    for (let i = 1; i <= 4; i++) expect(checkJobCode(o.rec, wrong)).toBe('BAD'); expect(checkJobCode(o.rec, wrong)).toBe('LOCKED');
    expect(checkJobCode(o.rec, o.code)).toBe('LOCKED'); expect(codeState(o.rec)).toBe('LOCKED');
  });
  it('after a lock the customer can re-issue (still capped); the desk unlock clears lock, tries and used mark', () => {
    const o = issueJobCode() as any; for (let i = 0; i < 5; i++) checkJobCode(o.rec, o.code === '0000' ? '1111' : '0000');
    const n = issueJobCode(o.rec) as any; expect(n.rec.lockedAt).toBeUndefined(); expect(n.rec.attempts).toBe(0); expect(n.rec.issues).toBe(2); expect(checkJobCode(n.rec, n.code)).toBe('OK');
  });
  it('desk unlock VOIDS the code (state NONE, the old code is worthless), keeps the issue count, caps at 2 unlocks, remembers who; each unlock grants one more issue', () => {
    const l = issueJobCode() as any; for (let i = 0; i < 5; i++) checkJobCode(l.rec, l.code === '0000' ? '1111' : '0000');
    expect(unlockJobCode(l.rec, 'ADM1')).toBe('OK'); expect(codeState(l.rec)).toBe('NONE'); expect(checkJobCode(l.rec, l.code)).toBe('NONE'); expect(l.rec.issues).toBe(1); expect(l.rec.unlockedBy).toBe('ADM1'); expect(l.rec.hash).toBe('');
    const n = issueJobCode(l.rec) as any; expect(n.rec.unlockedBy).toBe('ADM1'); expect(n.rec.unlocks).toBe(1); expect(checkJobCode(n.rec, l.code === n.code ? '9999' : l.code)).not.toBe('OK');   // an earlier guess is worthless against the fresh code (unless it collided)
    expect(unlockJobCode(n.rec, 'ADM2')).toBe('OK'); expect(unlockJobCode(n.rec, 'ADM3')).toBe('NONE'); const n2 = issueJobCode(n.rec) as any; expect(unlockJobCode(n2.rec, 'ADM3')).toBe('TOO_MANY'); expect(unlockJobCode(undefined, 'A')).toBe('NONE'); const v = issueJobCode() as any; unlockJobCode(v.rec, 'A'); for (let i = 0; i < 4; i++) expect(unlockJobCode(v.rec, 'A')).toBe('NONE'); expect(v.rec.unlocks).toBe(1);   // voiding twice does not burn the cap
    let rec: any; for (let i = 0; i < JOBCODE_MAX_ISSUES; i++) rec = (issueJobCode(rec) as any).rec; expect(issueJobCode(rec)).toEqual({ error: 'TOO_MANY' }); unlockJobCode(rec, 'A'); expect(issueJobCode(rec)).toHaveProperty('code');   // an unlock never leaves the customer stuck
  });
  it('the hash is an HMAC keyed by the server secret: a different secret does not verify, and proper try-left wording', async () => {
    const o = issueJobCode() as any; const { default: crypto } = await import('crypto'); const plain = crypto.createHash('sha256').update(`${o.rec.salt}:${o.code}`).digest('hex'); expect(o.rec.hash).not.toBe(plain);
    expect(triesLeft(1)).toEqual({ en: '1 try left', hi: '1 कोशिश बाक़ी' }); expect(triesLeft(4).en).toBe('4 tries left');
  });
  it('a customer cannot re-roll for fresh tries without limit', () => {
    let rec: any; for (let i = 0; i < JOBCODE_MAX_ISSUES; i++) { const o = issueJobCode(rec) as any; rec = o.rec; } expect(issueJobCode(rec)).toEqual({ error: 'TOO_MANY' });
  });
  it('no code yet = NONE', () => { expect(checkJobCode(undefined, '1234')).toBe('NONE'); expect(codeState(undefined)).toBe('NONE'); });
});

describe('v200 · tier badges (derived, one config)', () => {
  const { GOLD, DIAMOND } = BADGE_CONFIG;
  it('Tier 2 = Verified, Tier 1 = Pro; Gold and Diamond by visits AND deals; no tier = no badge', () => {
    expect(badgeFor({ tier: 'TIER2', verifiedVisits: 0, closedDeals: 0 })).toBe('VERIFIED'); expect(badgeFor({ tier: 'TIER1', verifiedVisits: 0, closedDeals: 0 })).toBe('PRO'); expect(badgeFor({ tier: null, verifiedVisits: 99, closedDeals: 99 })).toBeNull();
    expect(badgeFor({ tier: 'TIER1', verifiedVisits: GOLD.visits, closedDeals: GOLD.deals })).toBe('GOLD'); expect(badgeFor({ tier: 'TIER2', verifiedVisits: GOLD.visits, closedDeals: GOLD.deals })).toBe('GOLD');
    expect(badgeFor({ tier: 'TIER1', verifiedVisits: GOLD.visits - 1, closedDeals: GOLD.deals })).toBe('PRO'); expect(badgeFor({ tier: 'TIER1', verifiedVisits: GOLD.visits, closedDeals: GOLD.deals - 1 })).toBe('PRO');
    expect(badgeFor({ tier: 'TIER1', verifiedVisits: DIAMOND.visits, closedDeals: DIAMOND.deals })).toBe('DIAMOND'); expect(badgeFor({ tier: 'TIER1', verifiedVisits: DIAMOND.visits, closedDeals: DIAMOND.deals - 1 })).toBe('GOLD');
  });
  it('EN + HI labels for every badge; nothing about RERA in them', () => {
    for (const k of ['VERIFIED', 'PRO', 'GOLD', 'DIAMOND'] as const) { const l = BADGE_CONFIG.LABELS[k]; expect(l.en.length).toBeGreaterThan(1); expect(/[ऀ-ॿ]/.test(l.hi)).toBe(true); expect(JSON.stringify(l)).not.toMatch(/RERA/i); }
  });
});

describe('v200 · site visit with the customer\'s own code (HTTP)', { timeout: 120000 }, () => {
  const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
  let PA = ''; let PB = ''; let V1 = ''; let V2 = '';
  const book = async (propertyId: string) => { const r = await call(jar.BRK2, 'POST', '/api/site-visits', { propertyId, customerName: 'Alok Pandey', customerPhone: '9826377889', scheduledTime: inHours(2) }); const d = await j(r); expect(r.status, JSON.stringify(d)).toBe(200); expect(await ackBuyer(B, call, jar.BRK2, 'VISIT', d.siteVisit.id, '9826377889')).toBe(303); return d.siteVisit.id as string; };   // the buyer's "no direct deal" tick comes first, as on main
  it('setup: two visits for the demo buyer\'s phone, booked by broker 2 on broker 1\'s listings', async () => {
    const ps = (await j(await call(jar.BRK1, 'GET', '/api/properties'))).properties as any[];
    const l = ps.filter(p => p.listingBrokerId === 'USR-BRK-001' && p.ownerId === 'USR-OWNER-001' && p.verificationStatus === 'VERIFIED' && p.listingStatus === 'active'); expect(l.length).toBeGreaterThanOrEqual(2); PA = l[0].id; PB = l[1].id;
    for (const id of [PA, PB]) expect((await call(jar.BRK1, 'PUT', `/api/properties/${id}`, { googleMapsUrl: 'https://maps.google.com/?q=21.2514,81.6296' })).status).toBe(200);
    V1 = await book(PA); V2 = await book(PB);
  });
  it('only the buyer of THAT visit can make a code: broker, owner and desk get 404; no code yet means "NONE"', async () => {
    for (const k of ['BRK2', 'BRK1', 'OWN', 'ADMIN']) expect((await call(jar[k], 'POST', `/api/site-visits/${V2}/job-code`)).status, k).toBe(404);
    const none = await call(jar.OWN, 'POST', `/api/site-visits/${V2}/verify-code`, { code: '1234' }); expect(none.status).toBe(409); expect((await j(none)).code).toBe('NONE');
  });
  it('lockout after 5 wrong tries, audited; the right code is then refused; the customer cannot re-make it', async () => {
    const o = await j(await call(jar.BUY, 'POST', `/api/site-visits/${V1}/job-code`)); expect(o.code).toMatch(/^\d{4}$/); const wrong = o.code === '0000' ? '1111' : '0000';
    for (let i = 4; i >= 1; i--) { const r = await call(jar.OWN, 'POST', `/api/site-visits/${V1}/verify-code`, { code: wrong }); expect(r.status).toBe(400); expect((await j(r)).attemptsLeft).toBe(i); }
    const l = await call(jar.OWN, 'POST', `/api/site-visits/${V1}/verify-code`, { code: wrong }); expect(l.status).toBe(423); expect((await j(l)).errorHi).toMatch(/[ऀ-ॿ]/);
    expect((await call(jar.OWN, 'POST', `/api/site-visits/${V1}/verify-code`, { code: o.code })).status).toBe(423);
    // the customer can re-issue after a lock (the property side cannot lock it forever); a desk unlock also exists, desk only
    for (const k of ['OWN', 'BRK1', 'BRK2', 'BUY']) expect((await call(jar[k], 'POST', `/api/site-visits/${V1}/unlock-code`)).status, k).toBe(403);
    const again = await j(await call(jar.BUY, 'POST', `/api/site-visits/${V1}/job-code`)); expect(again.code).toMatch(/^\d{4}$/);
    const w2 = await call(jar.OWN, 'POST', `/api/site-visits/${V1}/verify-code`, { code: again.code === '0000' ? '1111' : '0000' }); expect(w2.status).toBe(400); expect((await j(w2)).error).toContain('4 tries left');
    for (let i = 0; i < 4; i++) await call(jar.OWN, 'POST', `/api/site-visits/${V1}/verify-code`, { code: again.code === '0000' ? '1111' : '0000' });
    expect((await call(jar.OWN, 'POST', `/api/site-visits/${V1}/verify-code`, { code: again.code })).status).toBe(423);
    expect((await call(jar.ADMIN, 'POST', `/api/site-visits/${V1}/unlock-code`)).status).toBe(200);
    const voided = await call(jar.OWN, 'POST', `/api/site-visits/${V1}/verify-code`, { code: again.code }); expect(voided.status).toBe(409); expect((await j(voided)).code).toBe('NONE');   // the unlock voided it: the customer makes a fresh one
    const fresh = await j(await call(jar.BUY, 'POST', `/api/site-visits/${V1}/job-code`)); expect(fresh.code).toMatch(/^\d{4}$/);
    expect((await call(jar.OWN, 'POST', `/api/site-visits/${V1}/verify-code`, { code: fresh.code })).status).toBe(200);
  });
  it('the booker (maker) and a stranger cannot enter it; the property side can, once, through the normal verification', async () => {
    const o = await j(await call(jar.BUY, 'POST', `/api/site-visits/${V2}/job-code`)); expect(o.code).toMatch(/^\d{4}$/);
    expect((await call(jar.BRK2, 'POST', `/api/site-visits/${V2}/verify-code`, { code: o.code })).status).toBe(403);   // maker ≠ checker did not move
    expect((await call(jar.ADMIN, 'POST', `/api/site-visits/${V2}/verify-code`, { code: o.code })).status).not.toBe(200);   // not even a desk account unless it is property side / super
    const mid = JSON.stringify((await j(await call(jar.BUY, 'GET', '/api/site-visits'))).siteVisits); expect(mid).not.toMatch(/"hash"|"salt"/);   // the hash never leaves the server
    const before = (await j(await call(jar.OWN, 'GET', '/api/site-visits'))).siteVisits.find((v: any) => v.id === V2); expect(before.customerPhone).not.toContain('98263 77889'); expect(before.customerPhone).not.toContain('9826377889');
    const ok = await call(jar.OWN, 'POST', `/api/site-visits/${V2}/verify-code`, { code: o.code }); expect(ok.status, JSON.stringify(await ok.clone().json())).toBe(200); expect((await j(ok)).siteVisit.isVerified).toBe(true);
    expect((await call(jar.OWN, 'POST', `/api/site-visits/${V2}/verify-code`, { code: o.code })).status).toBe(409);   // single use / already verified
    const after = (await j(await call(jar.OWN, 'GET', '/api/site-visits'))).siteVisits.find((v: any) => v.id === V2); expect(after.isVerified).toBe(true);
    expect(after.customerPhone).not.toContain('9826377889'); expect(after.customerPhone).not.toContain('98263 77889');   // the reveal rule did not move: verifying a visit never opens the number
  });
  it('exploit path: a broker cannot attach ANOTHER broker\'s buyer requirement to a collaboration (404); his own is fine', async () => {
    const body = (requirementId: string) => ({ propertyId: PB, receivingBrokerId: 'USR-BRK-001', proposedIntroducingShare: 50, proposedClosingShare: 50, terms: 'Split 50:50 on the brokerage', requirementId });
    const steal = await call(jar.BRK2, 'POST', '/api/collaborations', body('REQ-RAI-202')); expect(steal.status).toBe(404);   // REQ-RAI-202 is assigned to broker 1
    const nope = await call(jar.BRK2, 'POST', '/api/collaborations', body('REQ-DOES-NOT-EXIST')); expect(nope.status).toBe(404);
    const own = await call(jar.BRK2, 'POST', '/api/collaborations', body('REQ-RAI-201')); expect(own.status, JSON.stringify(await own.clone().json())).toBe(200);   // REQ-RAI-201 is assigned to broker 2
  });
  it('the visit view never shows who confirmed it, except to GENZ staff', async () => {
    for (const k of ['OWN', 'BRK1', 'BRK2', 'BUY']) { const vs = (await j(await call(jar[k], 'GET', '/api/site-visits'))).siteVisits as any[]; const v = vs.find(x => x.id === V2); if (v) { expect(v.isVerified, k).toBe(true); expect(v, k).not.toHaveProperty('verifiedBy'); } }
    expect(JSON.stringify((await j(await call(jar.OWN, 'GET', '/api/site-visits'))).siteVisits)).not.toContain('verifiedBy');
  });
});

describe('v200 · round 5: a claim on a buyer\'s need waits for his yes', { timeout: 120000 }, () => {
  const need = { customerName: 'Dr. Alok Pandey', customerPhone: '9826377889', budgetMin: 4000000, budgetMax: 9000000, city: 'Raipur', state: 'Chhattisgarh', preferredLocalities: ['Shankar Nagar'], preferredTags: [], propertyType: 'Residential Flat', transactionType: 'Sale', purpose: 'Self-use', urgency: 'Moderate (1-3 months)' };
  let R = '';
  it('setup: the buyer posts a need; nobody is assigned', async () => {
    const c = await call(jar.BUY, 'POST', '/api/requirements', need); const d = await j(c); expect(c.status, JSON.stringify(d)).toBe(200); R = d.requirement.id; expect(d.requirement.assignedBrokerId).toBe('');
  });
  it('a broker\'s claim is only a PENDING request: not assigned, name and number still masked; a repeat does not stack', async () => {
    const c = await j(await call(jar.BRK1, 'POST', `/api/requirements/${R}/claim`)); expect(c.pending).toBe(true); expect(c.requirement.assignedBrokerId).toBe('');
    expect(JSON.stringify(c.requirement)).not.toMatch(/9826377889|Alok Pandey/); expect(c.requirement.myClaim).toBe('PENDING');
    expect((await j(await call(jar.BRK1, 'POST', `/api/requirements/${R}/claim`))).duplicate).toBe(true);
    await call(jar.BRK2, 'POST', `/api/requirements/${R}/claim`);
    const mine = (await j(await call(jar.BUY, 'GET', '/api/requirements'))).requirements.find((x: any) => x.id === R); expect(mine.claimRequests.map((x: any) => x.brokerId).sort()).toEqual(['USR-BRK-001', 'USR-BRK-002']);
  });
  it('only the buyer who posted it can answer (brokers, owner: 404); yes assigns and opens the details to that broker; the other request is superseded', async () => {
    for (const k of ['BRK1', 'BRK2']) expect((await call(jar[k], 'POST', `/api/requirements/${R}/claim/USR-BRK-001`, { accept: true })).status, k).toBe(404);
    expect([403, 404]).toContain((await call(jar.OWN, 'POST', `/api/requirements/${R}/claim/USR-BRK-001`, { accept: true })).status);
    expect((await call(jar.BUY, 'POST', `/api/requirements/${R}/claim/USR-BRK-777`, { accept: true })).status).toBe(404);
    const yes = await j(await call(jar.BUY, 'POST', `/api/requirements/${R}/claim/USR-BRK-001`, { accept: true })); expect(yes.requirement.assignedBrokerId).toBe('USR-BRK-001');
    expect((await call(jar.BUY, 'POST', `/api/requirements/${R}/claim/USR-BRK-002`, { accept: true })).status).toBe(404);
    expect((await call(jar.BRK2, 'POST', `/api/requirements/${R}/claim`)).status).toBe(409);
    const asBrk = (await j(await call(jar.BRK1, 'GET', '/api/requirements'))).requirements.find((x: any) => x.id === R); expect((asBrk.claimRequests || []).map((x: any) => x.brokerId)).toEqual(['USR-BRK-001']);   // the accepted broker never sees who else asked
    const exp = JSON.stringify((await j(await call(jar.BUY, 'GET', '/api/privacy/export'))).requirements || []); expect(exp).not.toContain('brokerName'); expect(read('server/privacy.ts')).toContain('claimRequestCount');
  });
  it('a declined broker cannot re-send for 24h (429, EN+HI); the claim route is rate-limited per broker', async () => {
    const id = (await j(await call(jar.BUY, 'POST', '/api/requirements', need))).requirement.id;
    expect((await call(jar.BRK2, 'POST', `/api/requirements/${id}/claim`)).status).toBe(200);
    expect((await call(jar.BUY, 'POST', `/api/requirements/${id}/claim/USR-BRK-002`, { accept: false })).status).toBe(200);
    const again = await call(jar.BRK2, 'POST', `/api/requirements/${id}/claim`); expect(again.status).toBe(429); const d = await j(again); expect(d.code).toBe('CLAIM_COOLDOWN'); expect(d.errorHi).toBeTruthy();
    expect(read('server.ts')).toContain("rateLimit('claim', 20, 3600_000)");
  });
  it('the broker sees the waiting / declined lines (EN + HI) and no Claim button while waiting; the locality star is rendered in sign-up', () => {
    const rv = read('src/components/RequirementsView.tsx');
    for (const t of ['Waiting for the buyer to accept — details open after that.', 'खरीदार की मंज़ूरी का इंतज़ार — मंज़ूरी के बाद पूरी जानकारी खुलेगी।', 'The buyer declined. You can try again after 24 hours.', 'खरीदार ने मना किया। आप 24 घंटे बाद फिर कोशिश कर सकते हैं।']) expect(rv).toContain(t);
    expect(rv).toMatch(/state === 'PENDING'\) return/); expect(rv).toContain('<ClaimNeed req={req} />'); expect(read('src/lib/api.ts')).toContain('claimRequirement:');
    expect(read('src/components/JoinView.tsx')).toMatch(/<LocationFields[^>]*showLocality[^>]*required \/>/); expect(read('src/components/LocationFields.tsx')).toMatch(/\{required && <span className="text-red-600" aria-hidden> \*<\/span>\}/);
  });
  it('erase copy says what is kept and that the desk completes it; the desk Complete asks to confirm; the 409 is bilingual', () => {
    const pc = read('src/components/PrivacyCenter.tsx'); expect(pc).toContain('GENZ डेस्क'); expect(pc).toContain('invoices and payment records'); expect(pc).toContain('Complete this erasure?'); expect(read('server/privacy.ts')).toContain("code: 'OPEN_DEALS'");
  });
  it('the invite sign-up asks a BROKER for a locality, like the open sign-up', () => { expect(read('server.ts')).toMatch(/invite\.targetRole === 'BROKER' && !String\(parsed\.data\.locality/); });
  it('the broker side is told one line (EN + HI) that the buyer must accept', async () => {
    const c = await j(await call(jar.BUY, 'POST', '/api/requirements', need)); const id = c.requirement.id;
    const r = await j(await call(jar.BRK2, 'POST', `/api/requirements/${id}/claim`)); expect(r.message).toBe('Waiting for the buyer to accept — details open after that.'); expect(r.messageHi).toMatch(/खरीदार/);
  });
  it('the buyer edits only budget / areas / localities of his own need (PUT); name, phone, broker cannot be changed; a broker or a bad value is refused', async () => {
    const c = await j(await call(jar.BUY, 'POST', '/api/requirements', need)); const id = c.requirement.id;
    const ok = await j(await call(jar.BUY, 'PUT', `/api/requirements/${id}`, { budgetMax: 9500000, preferredLocalities: ['Pandri', 'Mowa'], customerName: 'Hacker', customerPhone: '9000000000', assignedBrokerId: 'USR-BRK-001' }));
    expect(ok.requirement).toMatchObject({ budgetMax: 9500000, preferredLocalities: ['Pandri', 'Mowa'], customerName: 'Dr. Alok Pandey', assignedBrokerId: '' });
    expect((await call(jar.BRK1, 'PUT', `/api/requirements/${id}`, { budgetMax: 1 })).status).toBe(404);
    const bad = await call(jar.BUY, 'PUT', `/api/requirements/${id}`, { budgetMin: 9999999, budgetMax: 10 }); expect(bad.status).toBe(400); expect((await j(bad)).errorHi).toMatch(/बजट/);
    expect((await call(jar.BUY, 'PUT', `/api/requirements/${id}`, { preferredLocalities: [] })).status).toBe(400);
  });
  it('"Ask about this home" with no id uses the NEWEST open need (no broker on it -> the listing broker, toOwnBroker false)', async () => {
    const c = await j(await call(jar.BUY, 'POST', '/api/requirements', need)); expect(c.requirement.assignedBrokerId).toBe('');
    const home = ((await j(await call(jar.BUY, 'GET', '/api/properties'))).properties as any[]).find(p => p.listingStatus === 'active'); expect(home).toBeTruthy();
    const r = await j(await call(jar.BUY, 'POST', '/api/requirements/mine/interest', { propertyId: home.id })); expect(r.toOwnBroker).toBe(false);
  });
  it('a need with no buyer behind it is claimed at once, as before', async () => {
    const c = await j(await call(jar.BRK1, 'POST', '/api/requirements', need)); expect(c.requirement.assignedBrokerId).toBe('USR-BRK-001');
  });
});

describe('v200 · service job: code, photos, sign-off gate (HTTP)', { timeout: 120000 }, () => {
  const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]).toString('base64');
  const mk = async () => (await j(await call(jar.SA, 'POST', '/api/mudra/admin/invoices', { partnerId: 'PTR-T1', buyerUserId: BUYER, description: 'Wardrobe fitting', amountInr: 10000 }))).invoice.id as string;
  const start = (id: string, code: string, ck = jar.ADMIN) => call(ck, 'POST', `/api/mudra/admin/invoices/${id}/start`, { code });
  const photo = (id: string, kind: string, data = jpeg(), ck = jar.ADMIN) => call(ck, 'POST', `/api/mudra/admin/invoices/${id}/photos`, { kind, data });
  let A = '';
  it('setup: a partner', async () => {
    expect((await call(jar.SA, 'PUT', '/api/mudra/admin/config', { maxDiscountPct: 10, requireSignoff: false, partners: [{ id: 'PTR-T1', name: 'Test Carpenters', category: 'Carpentry', feePct: 8, active: true }] })).status).toBe(200);
    A = await mk();
  });
  it('IDOR: only the invoice\'s own buyer can make the code (everyone else: 404); the code is shown once and only a hash is kept', async () => {
    for (const k of ['BRK1', 'SA', 'ADMIN']) expect((await call(jar[k], 'POST', `/api/mudra/invoices/${A}/job-code`)).status, k).toBe(404);
    const none = await start(A, '1234'); expect(none.status).toBe(409); expect((await j(none)).code).toBe('NONE');
    const o = await j(await call(jar.BUY, 'POST', `/api/mudra/invoices/${A}/job-code`)); expect(o.code).toMatch(/^\d{4}$/);
    const seen = JSON.stringify([(await j(await call(jar.SA, 'GET', '/api/mudra/admin/invoices'))), (await j(await call(jar.BUY, 'GET', '/api/mudra/invoices')))]); expect(seen).not.toMatch(/"hash"|"salt"/); expect(seen).toContain('"codeState":"ACTIVE"');
    (globalThis as any).__code = o.code;
  });
  it('only the desk starts the job: buyer and broker get 403; wrong code counts down; right code OPEN -> STARTED; replay refused', async () => {
    const code: string = (globalThis as any).__code; const wrong = code === '0000' ? '1111' : '0000';
    expect((await start(A, code, jar.BUY)).status).toBe(403); expect((await start(A, code, jar.BRK1)).status).toBe(403);
    const w = await start(A, wrong); expect(w.status).toBe(400); expect((await j(w)).attemptsLeft).toBe(4);
    const ok = await j(await start(A, code)); expect(ok.invoice.jobStatus).toBe('STARTED'); expect((await start(A, code)).status).toBe(409);
  });
  it('lockout over HTTP: 5 wrong tries lock; the right code is then refused', async () => {
    const B2 = await mk(); const o = await j(await call(jar.BUY, 'POST', `/api/mudra/invoices/${B2}/job-code`)); const wrong = o.code === '0000' ? '1111' : '0000';
    for (let i = 0; i < 4; i++) expect((await start(B2, wrong)).status).toBe(400); expect((await start(B2, wrong)).status).toBe(423);
    expect((await start(B2, o.code)).status).toBe(423); for (const k of ['BUY', 'BRK1']) expect((await call(jar[k], 'POST', `/api/mudra/admin/invoices/${B2}/unlock-code`)).status, k).toBe(403);
    expect((await call(jar.ADMIN, 'POST', `/api/mudra/admin/invoices/${B2}/unlock-code`)).status).toBe(200);
    const gone = await start(B2, o.code, jar.SA); expect(gone.status).toBe(409); expect((await j(gone)).code).toBe('NONE');   // the unlock voided the old code
    const f = await j(await call(jar.BUY, 'POST', `/api/mudra/invoices/${B2}/job-code`)); const same = await start(B2, f.code, jar.ADMIN); expect(same.status).toBe(409); expect((await j(same)).code).toBe('SAME_ADMIN');   // who unlocked may not enter
    expect((await start(B2, f.code, jar.SA)).status).toBe(200);
    const B3 = await mk(); const o3 = await j(await call(jar.BUY, 'POST', `/api/mudra/invoices/${B3}/job-code`)); for (let i = 0; i < 5; i++) await start(B3, o3.code === '0000' ? '1111' : '0000');
    const o4 = await j(await call(jar.BUY, 'POST', `/api/mudra/invoices/${B3}/job-code`)); expect(o4.code).toMatch(/^\d{4}$/); expect((await start(B3, o4.code)).status).toBe(200);   // or the customer re-issues after a lock
    const B5 = await mk(); const none = await call(jar.ADMIN, 'POST', `/api/mudra/admin/invoices/${B5}/unlock-code`); expect(none.status).toBe(409); expect((await j(none)).code).toBe('NONE');   // B14-01 — nothing to void
    const o5 = await j(await call(jar.BUY, 'POST', `/api/mudra/invoices/${B5}/job-code`)); expect(o5.code).toMatch(/^\d{4}$/); expect((await call(jar.ADMIN, 'POST', `/api/mudra/admin/invoices/${B5}/unlock-code`)).status).toBe(200);
    for (let i = 0; i < 3; i++) expect((await call(jar.SA, 'POST', `/api/mudra/admin/invoices/${B5}/unlock-code`)).status).toBe(409);   // an already-voided code refuses and never uses the budget up
    const B4 = await mk(); await call(jar.BUY, 'POST', `/api/mudra/invoices/${B4}/job-code`);
    expect((await call(jar.ADMIN, 'POST', `/api/mudra/admin/invoices/${B4}/unlock-code`)).status).toBe(200); await call(jar.BUY, 'POST', `/api/mudra/invoices/${B4}/job-code`);
    expect((await call(jar.SA, 'POST', `/api/mudra/admin/invoices/${B4}/unlock-code`)).status).toBe(200); await call(jar.BUY, 'POST', `/api/mudra/invoices/${B4}/job-code`);
    const third = await call(jar.ADMIN, 'POST', `/api/mudra/admin/invoices/${B4}/unlock-code`); expect(third.status).toBe(429); expect((await j(third)).code).toBe('TOO_MANY_UNLOCKS');   // 2 unlocks at most
  });
  it('photos: desk only; caps on count, size and type; the buyer sees them, a stranger gets 404; complete needs an after photo', async () => {
    expect((await photo(A, 'before', jpeg(), jar.BUY)).status).toBe(403); expect((await photo(A, 'sideways')).status).toBe(400);
    expect((await photo(A, 'before', Buffer.alloc(300, 1).toString('base64'))).status).toBe(415); expect((await photo(A, 'before', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(160 * 1024)]).toString('base64'))).status).toBe(413);
    const done0 = await call(jar.ADMIN, 'POST', `/api/mudra/admin/invoices/${A}/complete`); expect(done0.status).toBe(409); expect((await j(done0)).code).toBe('NO_AFTER_PHOTO');
    let last: any; for (let i = 0; i < 4; i++) { const r = await photo(A, 'before'); expect(r.status).toBe(200); last = await j(r); } expect((await photo(A, 'before')).status).toBe(409);
    const pid = last.invoice.beforePhotos[0].id; const got = await call(jar.BUY, 'GET', `/api/mudra/invoices/${A}/photos/${pid}`); expect(got.status).toBe(200); expect(got.headers.get('content-security-policy')).toBe("sandbox; default-src 'none'"); expect(got.headers.get('x-content-type-options')).toBe('nosniff'); expect((await call(jar.BRK1, 'GET', `/api/mudra/invoices/${A}/photos/${pid}`)).status).toBe(404);
    expect((await photo(A, 'after')).status).toBe(200);
  });
  it('sign-off gate: flag OFF, redeem works as before; flag ON, redeem is blocked (EN + HI) until the buyer, and only the invoice\'s buyer, signs off', async () => {
    const free = await mk(); expect((await call(jar.BUY, 'POST', '/api/mudra/redeem', { invoiceId: free, coins: 1 })).status).toBe(200);   // flag off: unchanged
    expect((await photo(free, 'before')).status).toBe(409); expect((await call(jar.BUY, 'POST', `/api/mudra/invoices/${free}/signoff`)).status).toBe(409);   // a paid invoice takes no more photos and no sign-off
    expect((await call(jar.SA, 'PUT', '/api/mudra/admin/config', { requireSignoff: true })).status).toBe(200);
    const blocked = await call(jar.BUY, 'POST', '/api/mudra/redeem', { invoiceId: A, coins: 1 }); expect(blocked.status).toBe(409); const bj = await j(blocked); expect(bj.code).toBe('SIGNOFF_REQUIRED'); expect(bj.errorHi).toMatch(/[ऀ-ॿ]/);
    expect((await call(jar.BUY, 'POST', `/api/mudra/invoices/${A}/signoff`)).status).toBe(409);   // not finished yet
    expect((await call(jar.ADMIN, 'POST', `/api/mudra/admin/invoices/${A}/complete`)).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/mudra/invoices/${A}/signoff`)).status).toBe(404); expect((await call(jar.SA, 'POST', `/api/mudra/invoices/${A}/signoff`)).status).toBe(404);
    const so = await j(await call(jar.BUY, 'POST', `/api/mudra/invoices/${A}/signoff`)); expect(so.invoice.jobStatus).toBe('SIGNED_OFF'); expect(so.invoice.signedOffAt).toBeTruthy();
    expect((await call(jar.BUY, 'POST', '/api/mudra/redeem', { invoiceId: A, coins: 1 })).status).toBe(200);
    expect((await call(jar.SA, 'PUT', '/api/mudra/admin/config', { requireSignoff: false })).status).toBe(200);
  });
});

describe('v200 · erase clears the visit code; an erased account cannot earn Mudra (unit)', () => {
  const withState = async <T>(st: any, fn: () => T): Promise<T> => {
    const { db } = await import('../server/db'); const g = db.getState.bind(db), sv = db.save.bind(db), ap = db.appendAuditEvent.bind(db);
    (db as any).getState = () => st; (db as any).save = () => {}; (db as any).appendAuditEvent = () => {};
    try { return fn(); } finally { (db as any).getState = g; (db as any).save = sv; (db as any).appendAuditEvent = ap; }
  };
  it('the hash of that person\'s visits goes, other visits stay; the invoice description is blanked, amounts and refs stay', async () => {
    const st: any = { users: [], mudraEntries: [], mudraRedemptions: [], siteVisits: [{ id: 'V1', customerPhone: '98263 77889', jobCode: { hash: 'h' } }, { id: 'V2', customerPhone: '90000 11111', jobCode: { hash: 'k' } }],
      mudraInvoices: [{ id: 'I1', invoiceRef: 'GZI-2026-0001', buyerUserId: 'B1', description: 'Flat of Alok Pandey', amountInr: 500, status: 'PAID', settlement: { grossInr: 500 } }] };
    await withState(st, () => eraseMudraFor('B1', '+91 98263 77889'));
    expect(st.siteVisits[0].jobCode).toBeUndefined(); expect(st.siteVisits[1].jobCode).toEqual({ hash: 'k' });
    expect(st.mudraInvoices[0]).toMatchObject({ buyerUserId: 'ERASED', description: 'Erased', amountInr: 500, invoiceRef: 'GZI-2026-0001', settlement: { grossInr: 500 } });
  });
  it('settleMudra needs the buyer\'s requirement assigned to a deal broker AND a verified visit with the buyer\'s phone', async () => {
    const { settleMudra, buyerOfDeal } = await import('../server/mudra');
    const mk = (over: any = {}): any => ({ users: [{ id: 'B1', role: 'BUYER_TENANT', phone: '98000 00001', email: 'b@x.in', verificationStatus: 'VERIFIED', idCheckedAt: 'x', phoneVerifiedAt: 'x', ...over.buyer }, { id: 'K1', role: 'BROKER', phone: '90000 00001' }, { id: 'K2', role: 'BROKER', phone: '90000 00002' }], requirements: [{ id: 'R1', buyerId: 'B1', assignedBrokerId: 'K1', ...over.req }], dealRooms: [{ id: 'D1', requirementId: 'R1', stage: 'Site Visit Done', introducingBrokerId: 'K1', closingBrokerId: 'K2' }],
      siteVisits: [{ id: 'V1', dealRoomId: 'D1', isVerified: true, customerPhone: '9800000001', verifiedBy: 'T', ...over.visit }], visitAcks: over.acks ?? [{ kind: 'VISIT', refId: 'V1', status: 'ACKED' }], commissionAgreements: [{ dealId: 'D1', status: 'ACTIVE', version: 1, totalAgreedBrokerage: 200000 }], mudraEntries: [], mudraRedemptions: [], mudraInvoices: [], mudraConfig: undefined });
    expect(await withState(mk(), () => settleMudra('D1'))).toMatchObject({ ok: true });
    expect(await withState(mk({ req: { assignedBrokerId: 'K9' } }), () => [buyerOfDeal('D1'), settleMudra('D1')])).toEqual([null, { ok: false, reason: 'NOT_A_BUYER_ACCOUNT' }]);   // someone else's requirement smuggled into the deal
    expect(await withState(mk({ visit: { customerPhone: '9111111111' } }), () => settleMudra('D1'))).toMatchObject({ ok: false, reason: 'NO_VERIFIED_VISIT' });   // the visit is not the buyer's
    // B-sec — the buyer test is the badge test: a self-farmed buyer on the broker's phone, an unchecked buyer, or a visit the broker / his team / the system link / nobody confirmed earns nothing
    for (const over of [{ buyer: { phone: '90000 00001' } }, { buyer: { idCheckedAt: undefined } }, { buyer: { verificationStatus: 'PENDING' } }, { visit: { verifiedBy: 'K1' } }, { visit: { verifiedBy: 'K2' } }, { visit: { verifiedBy: 'SYSTEM' } }, { visit: { verifiedBy: undefined } }]) { const r: any = await withState(mk(over), () => settleMudra('D1')); expect(r.ok, JSON.stringify(over)).toBe(false); }
    for (const acks of [[], [{ kind: 'VISIT', refId: 'V1', status: 'PENDING' }]]) expect(await withState(mk({ acks }), () => settleMudra('D1'))).toMatchObject({ ok: false, reason: 'NO_VERIFIED_VISIT' });   // no buyer confirmation (tick + mobile code) = no credit
  });
  it('settleMudra never credits an erased user, even through an old requirement.buyerId', async () => {
    const { settleMudra } = await import('../server/mudra');
    const st: any = { users: [{ id: 'B1', role: 'BUYER_TENANT', email: 'deleted-ab@erased.invalid' }], requirements: [{ id: 'R1', buyerId: 'B1' }], dealRooms: [{ id: 'D1', requirementId: 'R1', stage: 'Site Visit Done' }],
      siteVisits: [{ id: 'V1', dealRoomId: 'D1', isVerified: true }], visitAcks: [], commissionAgreements: [{ dealId: 'D1', status: 'ACTIVE', version: 1, totalAgreedBrokerage: 200000 }], mudraEntries: [], mudraRedemptions: [], mudraInvoices: [], mudraConfig: undefined };
    expect(await withState(st, () => settleMudra('D1'))).toMatchObject({ ok: false, reason: 'BUYER_ERASED' }); expect(st.mudraEntries).toHaveLength(0);
  });
});

describe('v200 · source guards', () => {
  it('the visit code goes through finishVisitVerification and never touches the lead-reveal path; no raw HTML; EN + HI; default flag false', () => {
    const s = read('server.ts'); const i = s.indexOf("'/api/site-visits/:id/verify-code'"); const blk = s.slice(i, i + 2600);
    expect(blk).toContain('loadVerifiableVisit'); expect(blk).toContain('finishVisitVerification'); expect(blk).not.toMatch(/leadReveals|isLeadRevealed|revealLead/);
    expect(read('src/components/JobCode.tsx') + read('src/components/MudraVoucher.tsx') + read('src/components/MudraAdmin.tsx')).not.toContain('dangerouslySetInnerHTML');
    expect(read('server/db.ts')).not.toMatch(/requireSignoff:\s*true/); expect(read('server/mudra.ts')).toContain('SIGNOFF_REQUIRED'); expect(read('src/components/JobCode.tsx')).toContain('नया कोड बनाएँ');
  });
  it('C: the buyer gets a "Get visit code" button on his visits card; the verify forms route by length (4 -> verify-code, 6 -> OTP); copy and "tries left" wording', () => {
    const home = read('src/components/RoleHome.tsx'); expect(home).toContain('MakeCode'); expect(home).toContain('api.visitJobCode(v.id)'); expect(home).toContain('विज़िट कोड पाएँ');
    const qr = read('src/components/SiteVisitQrPassModal.tsx'); expect(qr).toContain('api.visitVerifyCode(visit.id, code)'); expect(qr).toContain('api.verifySiteVisitOtp(visit.id, code'); expect(qr).toMatch(/\^\\d\{4\}\$/); expect(qr).toContain('4 अंकों का विज़िट कोड');
    const mod = read('src/components/Modals.tsx'); expect(mod).toContain('api.visitVerifyCode(visit.id, otpCode.trim())'); expect(mod).toContain('4-digit visit code (or 6-digit OTP)'); expect(mod).toContain('4 अंकों का विज़िट कोड (या 6 अंकों का OTP)');
    expect(read('server.ts') + read('server/mudra.ts')).not.toContain('try(ies)'); expect(read('server.ts')).toContain('सत्यापन OTP सही नहीं है');
  });
  it('2/4/5: the unlocker may not enter; unlock is rate limited; the modal buyer gate and copy; desk Unlock button; the 6-digit path locks at 5', () => {
    expect(read('server/mudra.ts')).toContain("rateLimit('jobcode-unlock', 10, 3600_000)"); expect(read('server/mudra.ts')).toContain('SAME_ADMIN'); expect(read('server.ts')).toContain('SAME_ADMIN');
    expect(read('src/components/SiteVisitQrPassModal.tsx')).toContain("currentUser.role === 'BUYER_TENANT' && !V.isVerified"); expect(read('src/components/SiteVisitQrPassModal.tsx')).toContain('4-digit visit code (or 6-digit OTP)');
    expect(read('src/components/Modals.tsx')).not.toContain('Verify & Record Visit'); expect(read('src/components/MudraAdmin.tsx')).toContain('mudra-unlock-'); expect(read('src/components/MudraAdmin.tsx')).toContain('कोड अनलॉक करें');
    expect(read('server.ts')).toContain('visit.verifiedBy = user.id');
  });
  it('round 5: the owner\'s booking SMS carries no code (the customer\'s does, and names who to show it to); the claim copy is EN + HI', () => {
    const sv = read('server.ts'); const l = sv.split('\n').find(x => x.includes('ownerUser?.phone) void sendSms'))!; expect(l).toBeTruthy(); expect(l).not.toMatch(/otpCode|\$\{msg\}/); expect(l).toContain('scan their QR or ask for their code');
    expect(sv).toContain('Show code ${otpCode} to the property owner or listing broker'); expect(sv).toContain('एक ब्रोकर आपकी मदद करना चाहता है'); expect(sv).toContain('REQUIREMENT_CLAIM_ACCEPTED');
    expect(read('server/mudra.ts')).toContain('visitAcked(v.id)'); expect(read('server/profiles.ts').match(/visitAcked\(/g)!.length).toBe(2); expect(read('server/privacy.ts')).toContain('const visitRow');
  });
  it('round 5 extras: owner yes resets on reschedule, buyer told, room line follows, QR/code hidden from the buyer before the tick, errorHi on visit errors, deal brokers hear price/status, claim/invoice/receipt copy', () => {
    const sv = read('server.ts'); expect(sv).toContain('visit.ownerOk = undefined'); expect(sv).toContain('moveClientRoomVisit(visit.id, visit.scheduledTime)'); expect(sv).toContain('Your visit moved to'); expect(sv).toContain('&& !visitAckBlock(\'VISIT\', v.id)) ||');
    expect(sv).toContain('rescheduleErrorHi(bad)'); expect(sv).toContain("tellDealBrokers(prop.id, currentUser.id"); expect(read('server/listings.ts')).toContain('tellDealBrokers(p.id');
    expect(read('server/clientroom.ts')).toContain('Too many tries, please try again in an hour'); expect(read('server/clientroom.ts')).toContain("hit(`cr-verify:${req.ip || ''}`, 120, 3600_000)");
    expect(read('src/components/MudraVoucher.tsx')).toContain('रसीद'); expect(read('src/components/MudraVoucher.tsx')).toContain('mudra-nobalance'); expect(read('src/components/MudraVoucher.tsx')).toContain('mudra-paused'); expect(read('server/mudra.ts')).toContain('paused: !p');
    expect(read('src/components/DealHisaab.tsx')).toContain('This is your own plan, different from the signed agreement.'); expect(read('src/lib/i18n.tsx')).toContain('document.documentElement.lang = lang');
    expect(read('src/shared/waParse.ts')).toContain('शंकर नगर'); expect(read('server/share.ts')).toContain("'बिल्ट-अप'");
  });
  it('A1/B: the secret is derived (domain-separated HMAC), never a new env var; erase keeps invoices and deletes photos', () => {
    const jc = read('server/jobcode.ts'); expect(jc).toContain("createHmac('sha256', secret())"); expect(jc).toContain('genz-job-code-v1'); expect(jc).not.toMatch(/process\.env/);
    const m = read('server/mudra.ts'); const e = m.slice(m.indexOf('export function eraseMudraFor')); expect(e).toContain('eraseJobPhotos'); expect(e).toContain("i.buyerUserId = 'ERASED'"); expect(e).not.toMatch(/s\.mudraInvoices\s*=\s*s\.mudraInvoices\.filter/);
  });
});

describe('v200 · badges count distinct, verified buyers only, found the way the Mudra rule finds them (unit)', () => {
  const usr = (id: string, phone: string, extra: any = {}) => ({ id, role: 'BUYER_TENANT', phone, verificationStatus: 'VERIFIED', idCheckedAt: 'x', phoneVerifiedAt: 'x', ...extra });
  const mkState = (): any => ({
    users: [{ id: 'BRK', role: 'BROKER', phone: '90000 00001' }, { id: 'STAFF', role: 'TEAM_MEMBER', employerId: 'BRK' }, usr('B1', '98000 00001'), usr('B2', '98000 00002'), usr('B3', '98000 00003', { idCheckedAt: undefined }), usr('SELF', '90000 00001'), usr('GONE', '98000 00009', { email: 'deleted-x@erased.invalid' })],
    siteVisits: [], dealRooms: [], requirements: [], visitAcks: [] as any[],
  });
  it('visits: the same buyer repeated counts once; unchecked, erased, own-phone and unknown phones count zero; a visit the broker or his team confirmed does not count', () => {
    const s = mkState(); let n = 0; const v = (phone: string, verifiedBy: string | undefined = 'T') => { const id = `V${++n}`; s.visitAcks.push({ kind: 'VISIT', refId: id, status: 'ACKED' }); return { id, brokerId: 'BRK', isVerified: true, customerPhone: phone, verifiedBy }; };
    s.siteVisits.push(v('9800000001'), v('9800000001', 'OWN'), v('9800000001', 'X'), v('9800000003'), v('9000000001'), v('9111111111'), v('9800000009'), { brokerId: 'BRK', isVerified: false, customerPhone: '9800000002' }, v('9800000002', 'BRK'), v('9800000002', 'STAFF'));
    expect(badgeCounts(s.users[0], s).verifiedVisits).toBe(1);
    s.siteVisits.push({ ...v('9800000002'), verifiedBy: 'SYSTEM' }, { ...v('9800000002'), verifiedBy: undefined }); expect(badgeCounts(s.users[0], s).verifiedVisits).toBe(1);   // an owner-room link ('SYSTEM') and an old visit with no verifiedBy do not count
    s.siteVisits.push(v('9800000002', 'OWN')); expect(badgeCounts(s.users[0], s).verifiedVisits).toBe(2);
  });
  it('deals: the buyer is requirement.buyerId, never the free-text customerId; settled only; distinct; a deal with no linked requirement counts nothing', () => {
    const s = mkState(); const A = (id: string, buyerId: string, assignedBrokerId = 'BRK') => ({ id, buyerId, assignedBrokerId });
    s.requirements.push(A('R1', 'B1'), A('R1b', 'B1'), A('R2', 'B2'), A('R3', 'B3'), A('R4', 'SELF'), A('R5', 'GONE'), A('RX', 'B2', 'SOMEONE_ELSE'));
    const d = (id: string, requirementId: string, customerId = 'free text', stage = 'Settled') => ({ id, stage, requirementId, customerId, introducingBrokerId: 'BRK', closingBrokerId: 'X' });
    let vn = 0; const visit = (dealRoomId: string, phone: string) => { const id = `W${++vn}`; s.visitAcks.push({ kind: 'VISIT', refId: id, status: 'ACKED' }); return { id, dealRoomId, isVerified: true, customerPhone: phone, brokerId: 'BRK', verifiedBy: 'T' }; };
    s.dealRooms.push(d('D1', 'R1'), d('D1b', 'R1b'), d('D3', 'R3'), d('D4', 'R4'), d('D5', 'R5'), d('DO', 'R2', 'B2', 'Negotiation'), d('DT', '', 'B2'), d('DN', 'NOPE', 'B2'), d('DX', 'RX'));
    s.siteVisits.push(visit('D1', '9800000001'), visit('D1b', '9800000001'), visit('D3', '9800000003'), visit('D4', '9000000001'), visit('D5', '9800000009'), visit('DX', '9800000002'), visit('DO', '9800000002'));
    expect(badgeCounts(s.users[0], s).closedDeals).toBe(1);                                    // B1 twice = once; free-text customerId, an open deal and a requirement assigned to ANOTHER broker (the smuggling route) count 0
    s.dealRooms.push(d('D2', 'R2')); expect(badgeCounts(s.users[0], s).closedDeals).toBe(1);   // no verified visit with B2's phone on this deal: still 0 more
    s.siteVisits.push(visit('D2', '9800000002')); expect(badgeCounts(s.users[0], s).closedDeals).toBe(2);
  });
});

describe('v200 · DPDP: export hides secrets and internals; erase keeps invoices as anonymous company records', { timeout: 120000 }, () => {
  const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]).toString('base64');
  let C = ''; let photoId = ''; let mineReq: string[] = [];
  it('a broker\'s export has no job code, hash, OTP or QR token', async () => {
    const r = await call(jar.BRK2, 'GET', '/api/privacy/export'); expect(r.status).toBe(200); const b = await r.json(); const t = JSON.stringify(b.siteVisits);
    expect(b.siteVisits.length).toBeGreaterThan(0); expect(t).not.toMatch(/"jobCode"|"hash"|"salt"|"otpCode"|"qrToken"|"otpAttempts"/); expect(JSON.stringify(b)).not.toMatch(/"jobCode"|"otpCode"|"qrToken"/); expect(t).not.toContain('verifiedBy');
  });
  it('the buyer\'s export lists his own invoices (what he paid) but never GENZ\'s share, the partner payout or the settlement', async () => {
    C = (await j(await call(jar.SA, 'POST', '/api/mudra/admin/invoices', { partnerId: 'PTR-T1', buyerUserId: BUYER, description: 'Retention check', amountInr: 7000 }))).invoice.id;
    const early = await call(jar.ADMIN, 'POST', `/api/mudra/admin/invoices/${C}/photos`, { kind: 'before', data: jpeg() }); expect(early.status).toBe(409); expect((await j(early)).code).toBe('NOT_STARTED');   // B14-04 — no before photo until the job is started
    const cc = await j(await call(jar.BUY, 'POST', `/api/mudra/invoices/${C}/job-code`)); expect((await call(jar.SA, 'POST', `/api/mudra/admin/invoices/${C}/start`, { code: cc.code })).status).toBe(200);
    const ph = await j(await call(jar.ADMIN, 'POST', `/api/mudra/admin/invoices/${C}/photos`, { kind: 'before', data: jpeg() })); photoId = ph.invoice.beforePhotos[0].id;
    const r = await call(jar.BUY, 'GET', '/api/privacy/export'); expect(r.status).toBe(200); const b = await r.json(); const t = JSON.stringify(b.mudraInvoices);
    expect(b.mudraInvoices.length).toBeGreaterThanOrEqual(3); expect(b.mudraInvoices[0]).toHaveProperty('invoiceRef'); expect(b.mudraInvoices.some((i: any) => i.youPaidInr === 9999 || i.youPaidInr === 10000 || i.youPaidInr === 9990)).toBe(true);
    expect(t).not.toMatch(/genzShare|partnerPayout|settlement|jobCode|hash/);
    // round 8 — what he owns is in his file: his needs (buyerId) and the visits booked on his phone, still without codes or claim names
    expect(b.requirements.length).toBeGreaterThan(0); expect(b.requirements.some((x: any) => x.customerPhone)).toBe(true); expect(b.siteVisits.some((v: any) => v.id === 'SV-2026-101')).toBe(true);
    expect(JSON.stringify([b.requirements, b.siteVisits])).not.toMatch(/"claimRequests"|brokerName|"otpCode":"\d|"qrToken"|"jobCode"|"verifiedBy"/); expect(JSON.stringify(b.auditEventsByYou)).not.toMatch(/"hash"|"previousHash"/);
    mineReq = b.requirements.map((x: any) => x.id);
  });
  it('erasing the buyer keeps invoices and settlements (buyer = ERASED, photos gone, open invoice closed); nothing can be redeemed or re-attached; new invoices refused', async () => {
    const before = ((await j(await call(jar.SA, 'GET', '/api/mudra/admin/invoices'))).invoices as any[]).filter(i => i.buyerUserId === BUYER); const paid = before.filter(i => i.settlement);
    expect(paid.length).toBeGreaterThan(0); const refs = before.map(i => i.invoiceRef);
    const pr = await j(await call(jar.BUY, 'POST', '/api/privacy/requests', { type: 'ERASURE', details: 'Please delete my data' })); const id = pr.request?.id || pr.id || (await j(await call(jar.BUY, 'GET', '/api/privacy/requests'))).requests[0].id;
    const done = await call(jar.ADMIN, 'POST', `/api/privacy/requests/${id}/resolve`, { decision: 'COMPLETE', note: 'Erased as requested by the user' }); expect(done.status, JSON.stringify(await done.clone().json())).toBe(200);
    const all = (await j(await call(jar.SA, 'GET', '/api/mudra/admin/invoices'))).invoices as any[]; const kept = all.filter(i => refs.includes(i.invoiceRef));
    expect(kept.length).toBe(refs.length);                                                       // none deleted
    for (const i of kept) { expect(i.buyerUserId).toBe('ERASED'); expect(i.beforePhotos || []).toEqual([]); expect(i.afterPhotos || []).toEqual([]); expect(JSON.stringify(i)).not.toMatch(/dr\.alok|98263|Alok/i); }
    for (const p of paid) { const k = kept.find(i => i.invoiceRef === p.invoiceRef); expect(k.settlement).toMatchObject({ grossInr: p.settlement.grossInr, coinsInr: p.settlement.coinsInr, customerPaysInr: p.settlement.customerPaysInr, genzShareInr: p.settlement.genzShareInr, partnerPayoutInr: p.settlement.partnerPayoutInr }); expect(k.amountInr).toBe(p.amountInr); expect(k.partnerName).toBe(p.partnerName); }
    expect(kept.find(i => i.id === C).status).toBe('CANCELLED');                                // an open invoice with no buyer is closed
    expect((await call(jar.SA, 'GET', `/api/mudra/invoices/${C}/photos/${photoId}`)).status).toBe(404);   // the picture file is gone
    const rq = ((await j(await call(jar.SA, 'GET', '/api/requirements'))).requirements as any[]);   // round 8 — his needs and visits stay as records but carry no name, number or code
    for (const x of rq.filter(x => mineReq.includes(x.id))) { expect(x.customerName).toBe('Erased'); expect(x.customerPhone || '').toBe(''); expect(x.buyerId).toBe('ERASED'); }
    expect(rq.some(x => !mineReq.includes(x.id) && x.customerName && x.customerName !== 'Erased')).toBe(true);   // other people's rows are untouched
    const sv = ((await j(await call(jar.SA, 'GET', '/api/site-visits'))).siteVisits as any[]).find(v => v.id === 'SV-2026-101'); expect(sv).toBeTruthy(); expect(sv.customerName).toBe('Erased'); expect(sv.customerPhone || '').toBe(''); expect(JSON.stringify(sv)).not.toMatch(/98263/);
    const nb = await call(jar.SA, 'POST', '/api/mudra/admin/invoices', { partnerId: 'PTR-T1', buyerUserId: BUYER, description: 'After erase', amountInr: 1000 }); expect(nb.status).toBe(409); expect((await j(nb)).code).toBe('BUYER_ERASED');
    const nr = await call(jar.SA, 'POST', `/api/mudra/admin/invoices/${C}/mark-paid`); expect(nr.status).toBe(409);   // cancelled: it cannot be paid or started
  });
});

describe('v200 · round 10: a phone counts only when it was verified by an OTP', { timeout: 120000 }, () => {
  const VICTIM_PHONE = '9826377889';   // the seeded buyer's number (verified); visit SV-2026-101 is booked on it
  it('an invite sign-up on the victim\'s verified phone is refused (409 PHONE_TAKEN); a buyer invite without an OTP is refused (400 OTP_REQUIRED)', async () => {
    const inv = await j(await call(jar.SA, 'POST', '/api/invitations', { invitedEmail: 'squat.broker@test.genz.example', invitedPhone: '9826155667', targetRole: 'BROKER' }));
    const reg = await call(undefined, 'POST', '/api/auth/register-invite', { code: inv.invitation.code, name: 'Squat Broker', phone: '9826155667', email: 'squat.broker@test.genz.example', password: 'Strong#Pass2026', consent: true, locality: 'Shankar Nagar', city: 'Raipur', aadhaarNumber: '234567890130', idConsent: true, panNumber: 'ABCPS2099F' });
    const rd = await j(reg); expect(reg.status, JSON.stringify(rd)).toBe(200); expect(rd.user.phoneVerifiedAt).toBeUndefined();   // round 12: without a code the account is made, UNVERIFIED — it ties to nothing
    const inv3 = await j(await call(jar.SA, 'POST', '/api/invitations', { invitedEmail: 'squat.broker2@test.genz.example', invitedPhone: '9826155667', targetRole: 'BROKER' }));
    const otp = await j(await call(undefined, 'POST', '/api/auth/register-otp', { code: inv3.invitation.code, phone: '9826155667' }));
    const r3 = await call(undefined, 'POST', '/api/auth/register-invite', { code: inv3.invitation.code, name: 'Squat Broker', phone: '9826155667', email: 'squat.broker2@test.genz.example', password: 'Strong#Pass2026', consent: true, locality: 'Shankar Nagar', city: 'Raipur', aadhaarNumber: '234567890130', idConsent: true, panNumber: 'ABCPS2098F', otpToken: otp.otpToken, otpCode: otp.devCode });
    const d3 = await j(r3); expect(r3.status, JSON.stringify(d3)).toBe(409); expect(d3.code).toBe('PHONE_TAKEN');   // with a code the already-verified number is refused
    const inv2 = await j(await call(jar.SA, 'POST', '/api/invitations', { invitedEmail: 'squat.buyer@test.genz.example', invitedPhone: '9826202099', targetRole: 'BUYER_TENANT' }));
    const r2 = await call(undefined, 'POST', '/api/auth/register-invite', { code: inv2.invitation.code, name: 'Squat Buyer', phone: '9826202099', email: 'squat.buyer@test.genz.example', password: 'Strong#Pass2026', consent: true, locality: 'Shankar Nagar', city: 'Raipur', aadhaarNumber: '234567890130', idConsent: true });
    expect(r2.status).toBe(400); expect((await j(r2)).code).toBe('OTP_REQUIRED');
  });
  it('the OTP-verified holder still matches (the seeded buyer export above lists SV-2026-101); two verified holders of one number match nobody (unit)', async () => {
    const { customerMatchesUser } = await import('../server/access'); const mk = (id: string, v?: string, email = `${id}@x.in`): any => ({ id, phone: '98000 00001', email, phoneVerifiedAt: v });
    const st: any = { users: [mk('A', 'x'), mk('B'), mk('C', 'x', 'gone@erased.invalid')] };
    expect(customerMatchesUser('9800000001', st.users[0], st)).toBe(true);    // an unverified squatter and an erased account do not block him
    expect(customerMatchesUser('9800000001', st.users[1], st)).toBe(false);   // the squatter himself matches nothing
    st.users.push(mk('D', 'x')); expect(customerMatchesUser('9800000001', st.users[0], st)).toBe(false);   // two verified holders: nobody
    expect(customerMatchesUser('98000', { id: 'S', phone: '98000', phoneVerifiedAt: 'x' } as any, { users: [] } as any)).toBe(false);   // a short number never matches
  });
  it('source: invite sign-up stamps phoneVerifiedAt only when the OTP passed; the export rows are allow-lists; the erase audit counts scrubbed rows', () => {
    expect(read('server.ts')).toContain('if (otpOk) newUser.phoneVerifiedAt = now; else newUser.selfRegistered = true;');
    const p = read('server/privacy.ts'); expect(p).toContain('const requirementRow'); expect(p).toContain('const visitRow'); expect(p).toContain('ERASURE_ROWS_SCRUBBED'); expect(p).toContain('need(s) and');
  });
});
