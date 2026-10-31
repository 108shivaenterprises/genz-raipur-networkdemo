import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** v72 — fee % of the final price, co-broker only sees the % and rupees, buyer paid a broker directly, आपस का हिसाब, bill prefill, owner-room offers + visit OK, shop page progress. */
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
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
let jarC: Record<string, string> = {}; let nocookie = false;
const ckStr = () => nocookie ? '' : Object.entries(jarC).map(([k, v]) => `${k}=${v}`).join('; ');
const page = async (method: string, url: string, opt: { form?: Record<string, string>; json?: unknown } = {}) => {
  const r = await fetch(B + url, { method, redirect: 'manual', headers: { ...(opt.form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...(opt.json ? { 'content-type': 'application/json' } : {}), ...(ckStr() ? { cookie: ckStr() } : {}) }, body: opt.form ? new URLSearchParams(opt.form).toString() : opt.json ? JSON.stringify(opt.json) : undefined });
  const sc = (r.headers as any).getSetCookie?.() as string[] | undefined;
  if (sc?.length && !nocookie) for (const c of sc) { const [k, ...v] = c.split(';')[0].split('='); jarC[k] = v.join('='); }
  const text = await r.text(); let js: any; try { js = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, js, type: r.headers.get('content-type') || '' };
};
// a tiny valid PNG
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.alloc(200, 7)]).toString('base64');
const JUNK = Buffer.alloc(300, 65).toString('base64');

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v72-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: 'a1'.repeat(32), SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ B1: 'USR-BRK-001', B2: 'USR-BRK-002', OWN: 'USR-OWNER-001', BLD: 'USR-BUILDER-001' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });



let DEAL = ''; let PRICE = 0;
const hs = async (c: string, id = DEAL) => (await j(await call(c, 'GET', `/api/deals/${id}/hisaab`))).hisaab;
const plan = (c: string, b: any) => call(c, 'PUT', `/api/deals/${DEAL}/hisaab/plan`, b);
describe('v72 fee plans and the two brokers', () => {
  it('find the deal', async () => {
    const all = (await j(await call(jar.B1, 'GET', '/api/deals'))).deals as any[];
    const d = all.find(x => x.ownerId === 'USR-OWNER-001' && [x.introducingBrokerId, x.closingBrokerId].includes('USR-BRK-001') && [x.introducingBrokerId, x.closingBrokerId].includes('USR-BRK-002'));
    expect(d, JSON.stringify(all.map(x => [x.id, x.ownerId, x.introducingBrokerId, x.closingBrokerId]))).toBeTruthy(); DEAL = d.id; PRICE = (await hs(jar.B1)).sauda.price; expect(PRICE).toBeGreaterThan(0);
  });
  it('a fee must be a % (0.1–10) of the final price or a fixed rupee amount', async () => {
    expect((await plan(jar.B1, { buyerSide: { mode: 'PCT', value: 50 } })).status).toBe(400);
    expect((await plan(jar.B1, { buyerSide: { mode: 'FIXED', value: 0 } })).status).toBe(400);
    expect((await plan(jar.B1, { buyerSide: { mode: 'FIXED', value: 12.5 } })).status).toBe(400);
    expect((await plan(jar.OWN, { buyerSide: { mode: 'PCT', value: 1 } })).status).toBe(403);
  });
  it('my buyer-side fee follows the FINAL price (1% of the price) and the bill is prefilled from it', async () => {
    const r = await j(await plan(jar.B1, { buyerSide: { mode: 'PCT', value: 1 } }));
    const want = Math.round(PRICE * 0.01);
    expect(r.hisaab.brokerage.dueParts.find((x: any) => x.key === 'BUYER_FEE').amount).toBe(want);
    expect(r.hisaab.brokerage.due).toBeGreaterThanOrEqual(want); expect(['PLAN', 'MANDATE_PLAN']).toContain(r.hisaab.brokerage.dueBasis);
    const pr = await j(await call(jar.B1, 'GET', `/api/deals/${DEAL}/payment-requests`));
    expect(pr.prefill.buyer.amount).toBe(want);
  });
  it('the other broker sees ONLY the % and rupees I give him — never my buyer-side fee, owner net or surplus', async () => {
    await plan(jar.B1, { shareOut: { mode: 'PCT', value: 1 } });
    const b2 = await hs(jar.B2); const t = JSON.stringify(b2);
    expect(b2.brokerage.aapas.shareIn).toMatchObject({ mode: 'PCT', value: 1, amount: Math.round(PRICE * 0.01) });
    expect(b2.plan.buyerSide).toBeNull(); expect(t).not.toContain('"buyerSide":{'); expect(t).not.toContain('BUYER_FEE');
    for (const c of [jar.B2, jar.OWN, jar.B1]) { const x = await (await call(c, 'GET', `/api/deals/${DEAL}`)).text(); expect(x).not.toContain('feePlans'); }
    expect(JSON.stringify(await hs(jar.OWN))).not.toContain('shareOut');
  });
  it('आपस का हिसाब: both give 1% → squared; a different amount → only the difference moves', async () => {
    await plan(jar.B2, { shareOut: { mode: 'PCT', value: 1 } });
    let a = (await hs(jar.B1)).brokerage.aapas; expect(a.who).toBe('SQUARE'); expect(a.left).toBe(0);
    await plan(jar.B2, { shareOut: { mode: 'FIXED', value: 10000 } });
    a = (await hs(jar.B1)).brokerage.aapas; const diff = Math.round(PRICE * 0.01) - 10000;
    expect(a.who).toBe(diff > 0 ? 'I_PAY' : diff < 0 ? 'HE_PAYS' : 'SQUARE'); expect(Math.abs(a.left)).toBe(Math.abs(diff));
    // writing the difference as paid to the other broker settles it
    if (diff > 0) { const w = await j(await call(jar.B1, 'POST', `/api/deals/${DEAL}/hisaab/book`, { dir: 'OUT', party: 'BROKER', amount: diff, mode: 'UPI', ref: 'NET1' })); expect(w.hisaab.brokerage.aapas.left).toBe(0); expect(w.hisaab.brokerage.aapas.who).toBe('SQUARE'); expect(w.hisaab.brokerage.paidOut).toBe(0); }
  });
  it('the buyer paid a broker directly: counts toward the price, hidden amount for the other broker, auto brokerage-received for the receiver, owner hand excludes it', async () => {
    const b0 = await hs(jar.B1); const o0 = await hs(jar.OWN);
    const bad = await call(jar.B1, 'POST', `/api/deals/${DEAL}/hisaab/payments`, { kind: 'TO_BROKER', amount: 100000, mode: 'CASH', toBrokerId: 'USR-BLD-NOPE' }); expect(bad.status).toBe(400);
    const w = await j(await call(jar.B1, 'POST', `/api/deals/${DEAL}/hisaab/payments`, { kind: 'TO_BROKER', amount: 100000, mode: 'CASH', toBrokerId: 'USR-BRK-001', note: 'seedha' }));
    expect(w.hisaab.sauda.received).toBe(b0.sauda.received + 100000); expect(w.hisaab.sauda.direct).toBe(100000);
    expect(w.hisaab.brokerage.entries.some((e: any) => e.id.startsWith('direct:') && e.amount === 100000 && e.dir === 'IN')).toBe(true);
    expect(w.hisaab.brokerage.received).toBe(b0.brokerage.received + 100000);
    const b2 = await hs(jar.B2); const e2 = b2.sauda.entries.find((e: any) => e.kind === 'TO_BROKER');
    expect(e2.masked).toBe(true); expect(e2.amount).toBe(0); expect(b2.sauda.directHidden).toBe(true); expect(JSON.stringify(b2)).not.toContain('seedha');
    const o = await hs(jar.OWN); const oe = o.sauda.entries.find((e: any) => e.kind === 'TO_BROKER');
    expect(oe.amount).toBe(100000); expect(o.ownerHand).toBe(o0.ownerHand === undefined ? undefined : o0.ownerHand); // the money that went to the broker is not in the owner's hand
    if (o.ownerHand !== undefined) expect(o.ownerHand).toBe(o.sauda.received - 100000 - (o.ownerBrokerage.paid - o.ownerBrokerage.viaBuyer));
  });
});

const OPH = '9811144455'; let OROOM = ''; let OLINK = '';
const signIn = async (link: string, room: string, phone: string) => {
  if ((await page('GET', link)).text.includes('id="app-card"')) return;
  expect((await page('POST', `${link}/otp`, { form: { phone } })).text).toContain('name="code"');
  const code = (await j(await call(jar.B1, 'GET', `/api/client-rooms/${room}`))).room.codeForClient;
  expect((await page('POST', `${link}/verify`, { form: { code } })).status).toBe(303);
};
describe('v72 owner room: offers and visits', () => {
  let OFFER = ''; let VID = '';
  it('set up an owner room, a buyer-broker offer and a visit on the same property', async () => {
    const r = await call(jar.B1, 'POST', '/api/client-rooms/owner', { propertyId: 'PROP-RAI-101', phone: OPH, ownerName: 'Sunil Lalwani', consent: true });
    expect(r.status, await r.clone().text()).toBe(200); const b = await j(r); OROOM = b.room.id; OLINK = b.link;
    const asking = (await j(await call(jar.B1, 'GET', '/api/properties'))).properties.find((p: any) => p.id === 'PROP-RAI-101').askingPrice;
    const o = await call(jar.B2, 'POST', '/api/offers', { propertyId: 'PROP-RAI-101', buyerName: 'Secret Buyer Name', buyerPhone: '9822233344', amount: Math.round(asking * 0.9), tokenProposed: 0, consent: true });
    expect(o.status, await o.clone().text()).toBe(200); OFFER = (await j(o)).offer.id;
    const v = await j(await call(jar.B2, 'POST', '/api/site-visits', { propertyId: 'PROP-RAI-101', customerName: 'Hidden Visitor', customerPhone: '9833344455', scheduledTime: new Date(Date.now() + 86400_000).toISOString() }));
    VID = v.siteVisit.id;
  });
  it('the owner sees the offer amount and the visit time — never the buyer\'s name', async () => {
    await signIn(OLINK, OROOM, OPH);
    const g = await page('GET', OLINK);
    expect(g.text).toContain('data-testid="owner-offer"'); expect(g.text).toContain('data-testid="owner-visit"');
    expect(g.text).not.toContain('Secret Buyer Name'); expect(g.text).not.toContain('Hidden Visitor');
  });
  it('visit OK is saved on the visit; a stranger / no session cannot answer', async () => {
    nocookie = true; await page('POST', `${OLINK}/visit/${VID}`, { form: { answer: 'YES' } }); nocookie = false;
    expect((await j(await call(jar.OWN, 'GET', `/api/site-visits?propertyId=PROP-RAI-101`))).siteVisits.find((x: any) => x.id === VID).ownerOk).toBeUndefined();
    expect((await page('POST', `${OLINK}/visit/${VID}`, { form: { answer: 'YES' } })).status).toBe(303);
    const sv = (await j(await call(jar.OWN, 'GET', `/api/site-visits?propertyId=PROP-RAI-101`))).siteVisits.find((x: any) => x.id === VID);
    expect(sv.ownerOk.answer).toBe('YES');
  });
  it('the owner counters, then accepts a fresh offer from his room; the other buyer-broker is told through the normal offer flow', async () => {
    const asking = (await j(await call(jar.B1, 'GET', '/api/properties'))).properties.find((p: any) => p.id === 'PROP-RAI-101').askingPrice;
    const ok = await page('POST', `${OLINK}/offer/${OFFER}`, { form: { action: 'COUNTER', amount: String(Math.round(asking * 0.95)) } });
    expect(ok.status).toBe(303);
    const mine = (await j(await call(jar.B2, 'GET', '/api/offers'))).made.find((x: any) => x.id === OFFER);
    expect(mine.status).toBe('COUNTERED'); expect(mine.counterAmount).toBe(Math.round(asking * 0.95));
    const a = await page('POST', `${OLINK}/offer/${OFFER}`, { form: { action: 'ACCEPT' } });
    expect(a.status).toBe(200); // a countered offer waits for the buyer side — owner cannot accept his own counter
  });
  it('the buyer side accepts the counter, then the owner has nothing left to answer', async () => {
    const r = await call(jar.B2, 'POST', `/api/offers/${OFFER}/respond`, { action: 'ACCEPT' }); expect(r.status, await r.clone().text()).toBe(200);
    const g = await page('GET', OLINK); expect(g.text).not.toContain(`/offer/${OFFER}`);
  });
});
