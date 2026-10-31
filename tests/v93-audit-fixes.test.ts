import { freePort } from './helpers/port';
/**
 * v93 — regression tests for the fixes from AUDIT_REPORT.md (F1–F18). Pure rules first, then three real servers:
 * a demo server, a server with DEMO_MODE=false, and start-ups against a damaged database file.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { containsPhone } from '../src/shared/clientRoomRules';
import { areaWordsMatch } from '../src/shared/shopPartner';
import { maskPhoneNumber } from '../server/validation';

const ROOT = path.resolve(__dirname, '..');
const TSX = path.join(ROOT, 'node_modules/.bin/tsx');
const BASE_ENV = { KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', HOST: '127.0.0.1', NODE_ENV: 'development', DISABLE_HMR: 'true', ALLOW_FRESH_DB: '' };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface Srv { B: string; proc: ChildProcess; dir: string; cfg: any; out: string[]; exit: Promise<number | null> }
async function start(env: Record<string, string>, dir = mkdtempSync(path.join(tmpdir(), 'genz-v93-')), wait = true): Promise<Srv> {
  if (!existsSync(path.join(dir, 'data'))) mkdirSync(path.join(dir, 'data'));
  const port = await freePort(); const B = `http://127.0.0.1:${port}`; const out: string[] = [];
  const proc = spawn(TSX, [path.join(ROOT, 'server.ts')], { cwd: dir, env: { ...process.env, ...BASE_ENV, PORT: String(port), ...env } });
  proc.stdout?.on('data', d => out.push(String(d))); proc.stderr?.on('data', d => out.push(String(d)));
  const exit = new Promise<number | null>(r => proc.on('exit', c => r(c)));
  let cfg: any;
  for (let i = 0; wait && i < 160 && proc.exitCode === null; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await sleep(250); }
  return { B, proc, dir, cfg, out, exit };
}
async function stop(s?: Srv) { if (!s) return; s.proc.kill('SIGTERM'); await Promise.race([s.exit, sleep(2000)]); if (existsSync(s.dir)) rmSync(s.dir, { recursive: true, force: true }); }
const caller = (B: string) => (cookie: string | undefined, method: string, url: string, body?: unknown, extra: Record<string, string> = {}) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
const former = (B: string) => (cookie: string | undefined, url: string, data: Record<string, string>) =>
  fetch(B + url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(data).toString() });
const cookieOf = (r: Response) => (r.headers.get('set-cookie') || '').split(';')[0];
const TERMS = { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 };

// ───────────────────────── pure rules ─────────────────────────
describe('F5 — the phone-in-chat filter sees through disguises, and leaves normal messages alone', () => {
  it.each(['9826511223', '98265 11223', '९८२६५११२२३', '98265+11223', '98265x11223', '98265:11223', '98265*11223', '９８２６５１１２２３', '𝟗𝟖𝟐𝟔𝟓𝟏𝟏𝟐𝟐𝟑',
    '98265​11223', '98265 then 11223', 'nine eight two six five one one two two three', '98265o1122', 'wa.me/919826511223'])('blocks %j', t => expect(containsPhone(t)).toBe(true));
  it.each(['Budget 45 lakh, 3 BHK on 2nd floor', 'Plot area 1760412345678 sq.ft', 'Visit at 10:30 on 12/11/2026', 'Price 7270000 negotiable', 'Flat no 402, tower 7, 1200 sq ft', 'do teen din mein visit karenge'])
    ('allows %j', t => expect(containsPhone(t)).toBe(false));
});

describe('F4 — area matching uses distinctive whole words only', () => {
  it.each([['shankar nagar', 'ram nagar'], ['devendra nagar', 'shankar nagar'], ['naya raipur', 'telibandha'], ['tatibandh', 'telibandha']])('%s ≠ %s', (a, b) => expect(areaWordsMatch(a, b, 'raipur')).toBe(false));
  it.each([['shankar nagar', 'shankar nagar'], ['shankar', 'shankar nagar'], ['amlidih', 'amlidih main road']])('%s = %s', (a, b) => expect(areaWordsMatch(a, b, 'raipur')).toBe(true));
});

describe('F7 — one phone mask everywhere: the last 4 digits only', () => {
  it('never shows the first digits', () => {
    expect(maskPhoneNumber('+91 98261 44001')).toBe('+91 ••••••4001');
    expect(maskPhoneNumber('9826144001')).toBe('••••••4001');
    expect(maskPhoneNumber('+91 98261 44001')).not.toContain('98261');
  });
});

// ───────────────────────── demo server ─────────────────────────
describe('demo server', { timeout: 90000 }, () => {
  let S: Srv; let call: ReturnType<typeof caller>; let form: ReturnType<typeof former>;
  const jar: Record<string, string> = {};
  const login = async (id: string) => {
    const a = S.cfg.demoAccounts.find((x: any) => x.id === id);
    const r = await fetch(S.B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: S.cfg.demoPassword }) });
    expect(r.status, id).toBe(200); return cookieOf(r);
  };
  beforeAll(async () => {
    S = await start({ DEMO_MODE: 'true', SEED_DEMO_DATA: 'true' }); expect(S.cfg).toBeTruthy();
    call = caller(S.B); form = former(S.B);
    for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', OWN: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
  }, 60000);
  afterAll(() => stop(S));

  it('F3 — a listing made after the customer scanned cannot open his number (for 48 h)', async () => {
    const p = await (await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Audit Kirana', personName: 'Audit Person', phone: '9876500931', area: 'Kachna', city: 'Raipur', terms: TERMS, consent: true })).json();
    const tok = p.link.split('/sp/')[1];
    await form(undefined, `/sp/${tok}/otp`, { phone: '9876500931' });
    const code = (await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json()).partners.find((x: any) => x.id === p.partner.id).codeForPartner;
    expect(code).toMatch(/^\d{6}$/);                                            // DEMO only — see the DEMO_MODE=false block below
    const ck = cookieOf(await form(undefined, `/sp/${tok}/verify`, { code })); await form(ck, `/sp/${tok}/accept`, { ok: '1' });
    const page = await (await fetch(`${S.B}/q/${p.partner.qrCode}`)).text(); const t = /name="t" value="([^"]+)"/.exec(page)?.[1] || '';
    await sleep(2600);
    const r = await form(undefined, `/q/${p.partner.qrCode}`, { t, kind: 'BUY', name: 'Test Cust', phone: '9876512345', locality: 'Kachna', budget: '20 lakh', ptype: 'Residential Plot', consent: '1', direct: '1', sign: 'Test Cust' });
    const chat = /\/q\/chat\/([A-Za-z0-9_-]+)/.exec(r.headers.get('location') || '')?.[1] || '';
    const lead = (await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json()).leads.find((l: any) => l.phoneLast4 === '2345');
    await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${lead.id}/ask-need`);
    await form(undefined, `/q/chat/${chat}/ans`, { a: 'YES' });
    const made = await (await call(jar.BRK1, 'POST', '/api/properties', { title: 'Plot in Kachna', description: 'A residential plot for sale', propertyType: 'Residential Plot', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: 'Kachna', addressHidden: 'Some lane, Kachna', askingPrice: 2000000, ownerApprovedNetPrice: 1900000, ownerName: 'Fake Owner', ownerPhone: '9123456780' })).json();
    const offer = await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${lead.id}/offer`, { homeId: made.property.id });
    expect(offer.status).toBe(409); expect((await offer.json()).code).toBe('LISTING_TOO_NEW');
    const after = (await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json()).leads.find((l: any) => l.id === lead.id);
    expect(after.masked).toBe(true); expect(after.phone).toBeUndefined();
  });

  it('F16 — the partner page link is not stored in plain text', async () => {
    await call(jar.BRK1, 'GET', '/api/shop-partners'); await sleep(2500);       // let the debounced write land
    const data = JSON.parse(readFileSync(path.join(S.dir, 'data', 'database.json'), 'utf8'));
    for (const p of data.shopPartners) { expect(p.token).toBeUndefined(); if (p.linkAt) expect(String(p.tokenSealed || '')).toMatch(/^l1\./); }
  });

  it('F6 — no phone number in the deal room, whatever the account age', async () => {
    const r = await call(jar.OWN, 'POST', '/api/deals/DEAL-2026-001/messages', { text: 'Buyer ji, call me directly: 98261 55667' });
    expect(r.status).toBe(400); expect((await r.json()).code).toBe('CHAT_FILTER');
    expect((await call(jar.OWN, 'POST', '/api/deals/DEAL-2026-001/messages', { text: 'Site visit on Sunday works for me.' })).status).toBe(200);
  });

  it('F13 — the owner (a checker) never receives the visit code / QR secret', async () => {
    const v = (await (await call(jar.OWN, 'GET', '/api/site-visits')).json()).siteVisits as any[];
    expect(v.length).toBeGreaterThan(0);
    expect(v.filter(x => x.brokerId !== 'USR-OWNER-001').some(x => x.otpCode || x.qrToken)).toBe(false);
  });

  it('F15 — a cross-site write is refused even without an Origin header', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/deals/DEAL-2026-001/messages', { text: 'hello' }, { 'sec-fetch-site': 'cross-site' });
    expect(r.status).toBe(403);
  });

  it('F11 — anonymous public actions are logged as PUBLIC, not SUPERADMIN', async () => {
    const ev = (await (await call(jar.ADMIN, 'GET', '/api/audit-logs?limit=500')).json());
    const rows = (ev.events || ev.auditEvents || ev.logs || []) as any[];
    const pub = rows.filter(e => e.actorId === 'public');
    expect(pub.length).toBeGreaterThan(0); expect(pub.every(e => e.actorRole === 'PUBLIC')).toBe(true);
  });

  it('F8 — signing out ends the session token for real', async () => {
    const ck = await login('USR-BRK-003');
    expect((await call(ck, 'GET', '/api/auth/me')).status).toBe(200);
    expect((await call(ck, 'POST', '/api/auth/logout')).status).toBe(200);
    expect((await call(ck, 'GET', '/api/auth/me')).status).toBe(401);
  });
});

// ───────────────────────── DEMO_MODE=false ─────────────────────────
describe('DEMO_MODE=false without an SMS gateway', { timeout: 90000 }, () => {
  let S: Srv; let call: ReturnType<typeof caller>; let form: ReturnType<typeof former>; let vik = '';
  beforeAll(async () => {
    S = await start({ DEMO_MODE: 'false', SEED_DEMO_DATA: 'true', SEED_ADMIN_PASSWORD: 'Boot1234567Xy' }); expect(S.cfg).toBeTruthy();
    call = caller(S.B); form = former(S.B);
    const login = async (email: string, password: string) => cookieOf(await fetch(S.B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) }));
    let sup = await login('admin@genzbuildcon.com', 'Boot1234567Xy');
    sup = cookieOf(await call(sup, 'POST', '/api/auth/change-password', { currentPassword: 'Boot1234567Xy', newPassword: 'Audit12345Xyz' })) || sup;
    const temp = (await (await call(sup, 'POST', '/api/admin/users/USR-BRK-001/reset-password')).json()).temporaryPassword;
    vik = await login('vikram.realty@gmail.com', temp);
    vik = cookieOf(await call(vik, 'POST', '/api/auth/change-password', { currentPassword: temp, newPassword: 'Audit12345Xyz' })) || vik;
  }, 60000);
  afterAll(() => stop(S));

  it('F2 — no demo logins, and the shop’s code is never shown to the broker (the page says SMS is not set up)', async () => {
    expect(S.cfg.demoAccounts).toEqual([]);
    const p = await (await call(vik, 'POST', '/api/shop-partners', { shopName: 'Audit Kirana', personName: 'Audit Person', phone: '9826099999', area: 'Shankar Nagar', city: 'Raipur', terms: TERMS, consent: true })).json();
    expect(p.link).toMatch(/^\/sp\//);
    const otp = await form(undefined, `${p.link}/otp`, { phone: '9826099999' });
    expect(otp.status).toBe(503); expect(await otp.text()).toContain('SMS is not set up');
    const mine = (await (await call(vik, 'GET', '/api/shop-partners')).json()).partners.find((x: any) => x.id === p.partner.id);
    expect(mine.codeForPartner).toBeFalsy(); expect(mine.status).toBe('PENDING');
  });
});

// ───────────────────────── damaged database file ─────────────────────────
describe('F1 — a damaged database.json is never replaced by a fresh seed', { timeout: 90000 }, () => {
  const damaged = (dir: string) => { mkdirSync(path.join(dir, 'data'), { recursive: true }); writeFileSync(path.join(dir, 'data', 'database.json'), '{"users":[{"id":"REAL-1"}],"dealRooms":[{"id":"IMPORTANT"'); };
  it('no backup → the server refuses to start and keeps the damaged file aside', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genz-v93-bad-')); damaged(dir);
    const S = await start({ DEMO_MODE: 'false' }, dir, false);
    const code = await Promise.race([S.exit, sleep(30000).then(() => 'timeout')]);
    expect(code).not.toBe('timeout'); expect(code).not.toBe(0);
    expect(S.out.join('')).toContain('Refusing to start');
    const files = readdirSync(path.join(dir, 'data'));
    expect(files.some(f => f.startsWith('database.corrupt-'))).toBe(true);
    expect(files).not.toContain('database.json');
    rmSync(dir, { recursive: true, force: true });
  });
  it('a readable backup → it is restored, not the seed', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genz-v93-bak-'));
    const first = await start({ DEMO_MODE: 'true', SEED_DEMO_DATA: 'true' }, dir);   // a normal start writes data + the first backup
    expect(first.cfg).toBeTruthy(); first.proc.kill('SIGTERM'); await first.exit;
    const backups = readdirSync(path.join(dir, 'data', 'backups'));
    expect(backups.length).toBeGreaterThan(0);
    damaged(dir);
    const S = await start({ DEMO_MODE: 'true', SEED_DEMO_DATA: 'true' }, dir);
    expect(S.cfg).toBeTruthy(); expect(S.out.join('')).toContain('Restored the newest readable backup');
    await stop(S);
  });
});
