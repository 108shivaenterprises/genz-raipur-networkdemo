import { freePort } from './helpers/port';
/** v46 — Shop QR partners (agreed share, customer scan, tracking, paid / not received) + client room: no code again on the same phone, at most 2 phones */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { partnerAmount, checkTerms } from '../src/shared/shopPartner';

describe('shop partner rules', () => {
  it('share = % of the broker\'s brokerage or a fixed ₹, never more than the brokerage; terms are checked', () => {
    expect(partnerAmount({ mode: 'PCT', value: 20 }, 100000)).toBe(20000);
    expect(partnerAmount({ mode: 'FIXED', value: 2000 }, 15000)).toBe(2000);
    expect(partnerAmount({ mode: 'FIXED', value: 50000 }, 15000)).toBe(15000);
    expect(checkTerms({ sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 })).toBeNull();
    expect(checkTerms({ sale: { mode: 'PCT', value: 80 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 })).toMatch(/Sale/);
    expect(checkTerms({ sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 20.5 }, lockDays: 180 })).toMatch(/Rent/);
    expect(checkTerms({ sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 5 })).toMatch(/protection/);
  });
});

const ROOT = path.resolve(__dirname, '..');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const form = (cookie: string | undefined, url: string, data: Record<string, string>) =>
  fetch(B + url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(data).toString() });
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v46-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });


const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const cookieOf = (r: Response) => (r.headers.get('set-cookie') || '').split(';')[0];
const TERMS = { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 };
const SHOP_PHONE = '9876500011';
const CUST = '9123488801';
let partner: any; let token = ''; let pCookie = ''; let leadId = '';

async function partnerSignIn(tok: string, prevCookie?: string) {
  const o = await form(prevCookie, `/sp/${tok}/otp`, { phone: SHOP_PHONE });
  if (o.status !== 200) return { status: o.status, cookie: '', text: await o.text() };
  const code = (await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json()).partners.find((x: any) => x.id === partner.id).codeForPartner;
  const v = await form(prevCookie, `/sp/${tok}/verify`, { code });
  return { status: v.status, cookie: cookieOf(v), text: '' };
}
async function scan(phone: string, kind = 'BUY', extra: Record<string, string> = {}) {
  const page = await (await fetch(`${B}/q/${partner.qrCode}`)).text();
  const t = /name="t" value="([^"]+)"/.exec(page)?.[1] || '';
  await sleep(2600);
  return form(undefined, `/q/${partner.qrCode}`, { t, kind, name: 'Ramesh Customer', phone, locality: 'Shankar Nagar', budget: '50 lakh', ptype: 'Flat', note: '', consent: '1', ...(kind === 'BUY' || kind === 'RENT_IN' ? { direct: '1', sign: 'Ramesh Customer' } : {}), ...extra });
}

describe('shop QR partner', () => {
  it('broker adds a partner; the QR does not work until the shopkeeper accepts on his own phone', async () => {
    const bad = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Gupta Kirana', personName: 'Mohan Gupta', phone: SHOP_PHONE, area: 'Shankar Nagar', terms: { ...TERMS, lockDays: 3 }, consent: true });
    expect(bad.status).toBe(400);
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Gupta Kirana', personName: 'Mohan Gupta', phone: SHOP_PHONE, area: 'Shankar Nagar', city: 'Raipur', terms: TERMS, consent: true });
    expect(r.status).toBe(200);
    const j = await r.json(); partner = j.partner; token = j.link.split('/sp/')[1];
    expect(partner.status).toBe('PENDING');
    expect(await (await fetch(`${B}/q/${partner.qrCode}`)).text()).toContain('अभी चालू नहीं');
    // wrong mobile on the partner page
    expect(await (await form(undefined, `/sp/${token}/otp`, { phone: '9000000000' })).text()).toContain('मेल नहीं');
    const s = await partnerSignIn(token); expect(s.status).toBe(303); pCookie = s.cookie;
    const page = await (await fetch(`${B}/sp/${token}`, { headers: { cookie: pCookie } })).text();
    expect(page).toContain('ब्रोकरेज का 20%');
    expect((await form(pCookie, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
    const list = await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json();
    expect(list.partners.find((x: any) => x.id === partner.id).status).toBe('ACTIVE');
    // another broker sees nothing and cannot touch it
    const other = await (await call(jar.BRK2, 'GET', '/api/shop-partners')).json();
    expect(other.partners.some((x: any) => x.id === partner.id)).toBe(false);
    expect((await call(jar.BRK2, 'POST', `/api/shop-partners/${partner.id}/link`)).status).toBe(404);
  });

  it('a customer scans: the lead goes to that broker (and his client list), the shop sees only the last 4 digits; a second scan is not a new lead', async () => {
    const r = await scan(CUST);
    expect(r.status).toBe(303);
    const list = await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json();
    const lead = list.leads.find((l: any) => l.phoneLast4 === CUST.slice(-4)); leadId = lead.id;
    expect(lead.partnerId).toBe(partner.id); expect(lead.kind).toBe('BUY'); expect(lead.masked).toBe(true); expect(lead.phone).toBeUndefined(); expect(lead.clientCardId).toBeUndefined();   // v85: the number (and so the client card) comes only after the need is confirmed and a home is shared
    expect(lead.terms.sale.value).toBe(20);
    expect((await scan(CUST)).status).toBe(303);
    const again = await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json();
    expect(again.leads.filter((l: any) => l.phoneLast4 === CUST.slice(-4)).length).toBe(1);
    const page = await (await fetch(`${B}/sp/${token}`, { headers: { cookie: pCookie } })).text();
    expect(page).toContain('••8801'); expect(page).not.toContain(CUST);
    // a form sent too fast / without consent is refused
    const p = await (await fetch(`${B}/q/${partner.qrCode}`)).text(); const t = /name="t" value="([^"]+)"/.exec(p)?.[1] || '';
    expect(await (await form(undefined, `/q/${partner.qrCode}`, { t, kind: 'BUY', name: 'Fast Bot', phone: '9123488802', locality: 'X area', consent: '1' })).text()).toContain('दोबारा');
  }, 30000);

  it('marked “lost” but then worked on (client room on the same mobile) → flagged for the shop and the GENZ desk', async () => {
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/status`, { status: 'LOST' })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/status`, { status: 'LOST', reason: 'Client not reachable' })).status).toBe(200);
    await sleep(20);
    expect((await call(jar.BRK1, 'POST', '/api/client-rooms', { clientName: 'Ramesh Customer', phone: CUST, kind: 'BUYER', consent: true })).status).toBe(200);
    const list = await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json();
    const lead = list.leads.find((l: any) => l.id === leadId);
    expect(lead.links.some((x: any) => x.kind === 'ROOM')).toBe(true);
    expect(lead.flags.map((f: any) => f.code)).toContain('AFTER_LOST');
    const desk = await (await call(jar.ADMIN, 'GET', '/api/shop-partners/admin')).json();
    expect(desk.items.some((x: any) => x.id === leadId)).toBe(true);
    expect((await call(jar.BRK1, 'GET', '/api/shop-partners/admin')).status).toBe(403);
    const page = await (await fetch(`${B}/sp/${token}`, { headers: { cookie: pCookie } })).text();
    expect(page).toContain('क्लाइंट रूम खुला');
  });

  it('deal done → share worked out from the agreed %, paid, and the shop can say “not received”', async () => {
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/won`, { brokerage: 150000 })).status).toBe(200);
    let lead = (await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json()).leads.find((l: any) => l.id === leadId);
    expect(lead.won.amount).toBe(30000); expect(lead.payout.status).toBe('DUE');
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/paid`, { ref: 'UPI 1234' })).status).toBe(200);
    expect((await form(pCookie, `/sp/${token}/lead/${leadId}/not-received`, { note: 'Abhi tak nahi aaya' })).status).toBe(303);
    lead = (await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json()).leads.find((l: any) => l.id === leadId);
    expect(lead.payout.status).toBe('NOT_RECEIVED');
    const desk = await (await call(jar.ADMIN, 'GET', '/api/shop-partners/admin')).json();
    expect(desk.items.find((x: any) => x.id === leadId).payout.partnerNote).toBe('Abhi tak nahi aaya');
  });

  it('a new share needs the shop’s yes, and applies only to later leads', async () => {
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/${partner.id}/terms`, { terms: { ...TERMS, sale: { mode: 'PCT', value: 10 } } })).status).toBe(200);
    let p = (await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json()).partners.find((x: any) => x.id === partner.id);
    expect(p.terms.sale.value).toBe(20); expect(p.pending.terms.sale.value).toBe(10);
    expect((await form(pCookie, `/sp/${token}/change/accept`, {})).status).toBe(303);
    p = (await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json()).partners.find((x: any) => x.id === partner.id);
    expect(p.terms.sale.value).toBe(10); expect(p.termsVersion).toBe(2); expect(p.pending).toBeNull();
    const old = (await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json()).leads.find((l: any) => l.id === leadId);
    expect(old.terms.sale.value).toBe(20);
    expect((await scan('9123488803', 'SELL')).status).toBe(303);
    const fresh = (await (await call(jar.BRK1, 'GET', '/api/shop-partners')).json()).leads.find((l: any) => l.phoneLast4 === '8803');
    expect(fresh.terms.sale.value).toBe(10); expect(fresh.clientCardId).toBeUndefined();
  }, 30000);

  it('the shop page opens on at most 2 phones', async () => {
    const two = await partnerSignIn(token); expect(two.status).toBe(303);
    const three = await partnerSignIn(token); expect(three.status).toBe(403);
    // the first phone still opens without a code
    expect(await (await fetch(`${B}/sp/${token}`, { headers: { cookie: pCookie } })).text()).toContain('आपके QR से आई लीड');
  });
});

describe('client room: same phone needs no code again; at most 2 phones', () => {
  it('2 phones in, a third refused until the broker removes one; a removed phone must sign in again', async () => {
    const PH = '9123477701';
    const r = await call(jar.BRK2, 'POST', '/api/client-rooms', { clientName: 'Two Phones', phone: PH, kind: 'BUYER', consent: true });
    const j = await r.json(); const room = j.room; const tok = j.link.split('/r/')[1];
    const signIn = async () => {
      const o = await form(undefined, `/r/${tok}/otp`, { phone: PH });
      if (o.status !== 200) return { status: o.status, cookie: '' };
      const code = (await (await call(jar.BRK2, 'GET', `/api/client-rooms/${room.id}`)).json()).room.codeForClient;
      const v = await form(undefined, `/r/${tok}/verify`, { code });
      return { status: v.status, cookie: cookieOf(v) };
    };
    const a = await signIn(); const b = await signIn(); const c = await signIn();
    expect(a.status).toBe(303); expect(b.status).toBe(303); expect(c.status).toBe(403);
    const pageA = await fetch(`${B}/r/${tok}`, { headers: { cookie: a.cookie } });
    const html = await pageA.text();
    expect(html).toContain('Two Phones ••7701'); // the name mark over the page
    const det = (await (await call(jar.BRK2, 'GET', `/api/client-rooms/${room.id}`)).json()).room;
    expect(det.devices.length).toBe(2);
    expect((await call(jar.BRK2, 'DELETE', `/api/client-rooms/${room.id}/devices/${det.devices[0].id}`)).status).toBe(200);
    const after = await fetch(`${B}/r/${tok}`, { headers: { cookie: a.cookie } });
    expect(await after.text()).toContain('मोबाइल नंबर डालें');
    expect((await signIn()).status).toBe(303);
    // another broker cannot remove the client's phones
    expect((await call(jar.BRK1, 'DELETE', `/api/client-rooms/${room.id}/devices/${det.devices[1].id}`)).status).toBe(404);
  });
});
