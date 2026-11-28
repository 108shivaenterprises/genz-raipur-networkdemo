import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { readFileSync } from 'fs';
process.env.AUTH_SECRET ||= 'v204-test-secret-0123456789abcdef0123';
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
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v204-')); mkdirSync(path.join(dir, 'data'));
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

describe('v204 · round 13 (HTTP)', { timeout: 180000 }, () => {
  let deals: any[] = [];
  it('setup: deals BRK1 shares with another broker', async () => {
    deals = (((await j(await call(jar.BRK1, 'GET', '/api/deals'))).deals) || []).filter((d: any) => d.introducingBrokerId && d.closingBrokerId && d.introducingBrokerId !== d.closingBrokerId);
    expect(deals.length).toBeGreaterThanOrEqual(4);
  });
  it('2 · at most 3 open disputes per user (429 TOO_MANY_OPEN, EN + HI); admins are alerted by the filing', async () => {
    const rows = ((await j(await call(jar.BRK1, 'GET', '/api/disputes'))).disputes || []) as any[]; const openNow = rows.filter(d => d.complainantId === 'USR-BRK-001' && ['OPEN', 'UNDER_REVIEW', 'MEDIATION'].includes(d.status)).length; const busy = new Set(rows.filter(d => ['OPEN', 'UNDER_REVIEW', 'MEDIATION'].includes(d.status)).map(d => d.dealRoomId));
    const mine = deals.filter(d => [d.introducingBrokerId, d.closingBrokerId].includes('USR-BRK-001') && !busy.has(d.id)); const ids: string[] = []; const room = 3 - openNow;   // seeded disputes already count
    let last: any = null;
    for (const d of mine.slice(0, room + 1)) {
      const other = d.introducingBrokerId === 'USR-BRK-001' ? d.closingBrokerId : d.introducingBrokerId;
      const r = await call(jar.BRK1, 'POST', '/api/disputes', { dealRoomId: d.id, counterpartyId: other, reason: 'OTHER', description: 'a factual description of what happened here' }); last = { status: r.status, body: await j(r) };
      if (r.status === 200) ids.push(last.body.dispute.id); else break;
    }
    expect(ids.length, JSON.stringify(last)).toBe(room); expect(room).toBeGreaterThan(0); expect(last.status).toBe(429); expect(last.body.code).toBe('TOO_MANY_OPEN'); expect(last.body.errorHi).toBeTruthy();
    (globalThis as any).__ids = ids; (globalThis as any).__deal = mine[0].id;
  });
  it('1 · closing ALWAYS lifts the hold (liftHold:false is ignored) and the deal is back to AGREED; blacklisting needs written reasons', async () => {
    const ids = (globalThis as any).__ids as string[]; const dealId = (globalThis as any).__deal as string;
    const nb = await call(jar.SA, 'POST', `/api/disputes/${ids[0]}/resolve`, { status: 'RESOLVED', blacklistParty: true }); expect(nb.status).toBe(400); expect((await j(nb)).errorHi).toBeTruthy();
    const done = await j(await call(jar.ADMIN, 'POST', `/api/disputes/${ids[0]}/resolve`, { status: 'RESOLVED', resolutionNotes: 'settled between the two brokers', liftHold: false }));
    expect(done.dispute.status).toBe('RESOLVED'); expect(done.dispute.settlementHold).toBe(false);
    const deal = (((await j(await call(jar.SA, 'GET', '/api/deals'))).deals) || []).find((d: any) => d.id === dealId); expect(deal.settlementStatus).toBe('AGREED');
    for (const id of ids.slice(1)) await call(jar.ADMIN, 'POST', `/api/disputes/${id}/resolve`, { status: 'DISMISSED', resolutionNotes: 'dismissed: no basis found' });
  });
  it('6 · the buyer voucher summary says whether a dispute froze it', async () => {
    const m = await j(await call(jar.BUY, 'GET', '/api/mudra/me')); expect(typeof m.frozenByDispute).toBe('boolean');   // true only while a live dispute is on one of his deals
  });
});

describe('v204 · round 13 (unit)', () => {
  it('a closed or settled-only dispute never freezes; the buyer view shows the real state and no deal id', async () => {
    const { disputeFrozen } = await import('../server/mudra'); const { db } = await import('../server/db'); const g = db.getState.bind(db);
    (db as any).getState = () => ({ dealRooms: [{ id: 'D1', settlementStatus: 'DISPUTED' }], disputes: [{ dealRoomId: 'D1', status: 'RESOLVED' }, { dealRoomId: 'D1', status: 'DISMISSED' }] });
    try { expect(disputeFrozen('D1')).toBe(false); } finally { (db as any).getState = g; }
    const s = read('server.ts'); expect(s).toContain('voucherOnHold: disputeFrozen(d.dealRoomId)'); expect(s).not.toMatch(/disputes: currentUser\.role === 'BUYER_TENANT' \? rows\.map\(d => \(\{ id: d\.id, dealRoomId/);
  });
});

describe('v204 · round 13 (source)', () => {
  it('2/5 · desk alert on filing, 7-day escalation in the sweep, expired offers refused, Hindi status inside OFFER_CLOSED', () => {
    const s = read('server.ts'); expect(s).toContain("'A dispute was filed'"); expect(s).toContain('function sweepDisputes'); expect(s).toContain("['disputes', sweepDisputes]");
    expect(s).toContain("code: 'OFFER_EXPIRED'"); expect(s).toContain("WITHDRAWN: 'वापस'"); expect(s).toContain("code: 'NOTES_REQUIRED'");
  });
  it('3 · per-number OTP cap counts only successful sends and ignores a re-send while a code is live', () => {
    const o = read('server/ownerlist.ts'); expect(o).toContain('const countSend'); expect(o).toContain('(liveCode.get(phone) || 0) <= Date.now()'); expect(o).not.toContain("hit('otp-phone:'");
  });
  it('4 · a pending RERA claim keeps the AUTO provenance; the member-report demotion uses it; staff approval clears it', () => {
    expect(read('server/network.ts')).toContain("u.reraAuto = true"); expect(read('server/network.ts')).toContain('t.reraAuto = false'); expect(read('server/daily.ts')).toContain("t.reraClaim?.decidedBy === 'AUTO' || t.reraAuto");
  });
  it('6-10 · UI: frozen-voucher note, dispute button on the phone view, withdraw on sent cards, disabled co-broke buttons with reasons, RERA wording', () => {
    const m = read('src/components/MudraVoucher.tsx'); expect(m).toContain('Your voucher is on hold while a dispute on your deal is open. It returns when GENZ closes it.'); expect(m).toContain('data-testid="mudra-frozen"');
    expect(read('server/mudra.ts')).toContain('frozenByDispute');
    const d = read('src/components/DealSimple.tsx'); expect(d).toContain('data-testid="deal-file-dispute"'); expect(d).toContain('औपचारिक विवाद दर्ज करें');
    expect(read('src/components/DisputesView.tsx')).toContain('File Formal Dispute'); expect(read('src/components/Modals.tsx')).toContain('“File Formal Dispute”');
    expect(read('src/components/DealRoomsView.tsx')).toContain('data-testid={`withdraw-sent-${offer.id}`}');
    const p = read('src/components/PropertiesView.tsx'); expect(p).toContain("(currentUser as any).basicTier)) actions.push({ key: 'collab'"); expect(p).toContain('p.listingBrokerActive === false'); expect(read('server.ts')).toContain('out.listingBrokerActive = isActiveBroker');
    const mc = read('src/components/MatchCenterView.tsx'); expect(mc).toContain('data-testid="match-offer-why"'); expect(mc).toContain('Complete ID check to co-broke');
    const r = read('src/components/ReraTier.tsx'); expect(r).toContain('Sent to GENZ staff for checking'); expect(r).toContain('GENZ स्टाफ़ को जाँच के लिए भेजा गया');
  });
});
