/**
 * v82 — the shopkeeper's page as an app + the anti-bypass pack, over real HTTP:
 * a written brokerage is shown to the shop as a change he can accept or reject, payment needs a reference, alerts (web push) are switched on from his page,
 * the customer is asked by SMS only if he ticked the separate box, and the poster / leaflet / certificate are served.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { createServer, type Server } from 'http';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const PORT = 7300 + Math.floor(Math.random() * 90);
const SMS_PORT = 7400 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any; let smsSrv: Server;
const sms: { to: string; message: string }[] = [];
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
  smsSrv = createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { try { sms.push(JSON.parse(b)); } catch { /* ignore */ } res.end('ok'); }); });
  await new Promise<void>(r => smsSrv.listen(SMS_PORT, '127.0.0.1', r));
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v82-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: `http://127.0.0.1:${SMS_PORT}/sms`, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); smsSrv?.close(); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const cookieOf = (r: Response) => (r.headers.get('set-cookie') || '').split(';')[0];
const TERMS = { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 };
const SHOP_PHONE = '9876500022';
let partner: any; let token = ''; let pCookie = '';
const list = async () => (await call(jar.BRK1, 'GET', '/api/shop-partners')).json();
const leadOf = async (phone: string) => (await list()).leads.find((l: any) => l.phoneLast4 === phone.slice(-4));
const shopPage = async () => (await fetch(`${B}/sp/${token}`, { headers: { cookie: pCookie } })).text();

async function scan(phone: string, extra: Record<string, string> = {}, kind = 'RENT_IN') {
  const page = await (await fetch(`${B}/q/${partner.qrCode}`)).text();
  const t = /name="t" value="([^"]+)"/.exec(page)?.[1] || '';
  await sleep(2600);
  return form(undefined, `/q/${partner.qrCode}`, { t, kind, name: 'Ramesh Customer', phone, locality: 'Shankar Nagar', budget: '12000', ptype: 'Flat', note: '', consent: '1', direct: '1', sign: 'Ramesh Customer', ...extra });
}

describe('v82 shop partner page as an app', () => {
  it('the shop signs in with the code that came by SMS and accepts; the page carries the app card, manifest and certificate link only after accepting', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Sai Provision', personName: 'Ramesh Sahu', phone: SHOP_PHONE, area: 'Telibandha', city: 'Raipur', terms: TERMS, consent: true });
    expect(r.status).toBe(200); const j = await r.json(); partner = j.partner; token = j.link.split('/sp/')[1];
    const o = await form(undefined, `/sp/${token}/otp`, { phone: SHOP_PHONE }); expect(o.status).toBe(200);
    await sleep(200);
    const code = /code to open your QR partner page is (\d{6})/.exec(sms[sms.length - 1].message)?.[1]; expect(code).toMatch(/^\d{6}$/);
    const v = await form(undefined, `/sp/${token}/verify`, { code: code! }); expect(v.status).toBe(303); pCookie = cookieOf(v);
    let page = await shopPage();
    expect(page).toContain('id="app-card"'); expect(page).toContain(`/sp/${token}/manifest.webmanifest`); expect(page).toContain('<script src="/sp/app.js"');
    expect(page).not.toContain('data-testid="cert-link"');
    expect((await form(pCookie, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
    page = await shopPage(); expect(page).toContain('data-testid="cert-link"');
    // the app script and manifest are public-safe files; the manifest is per shop and never cached
    const js = await fetch(`${B}/sp/app.js`); expect(js.status).toBe(200); expect(await js.text()).toContain('/push');
    const m = await fetch(`${B}/sp/${token}/manifest.webmanifest`); expect(m.status).toBe(200);
    const mj = await m.json(); expect(mj.display).toBe('standalone'); expect(mj.start_url).toBe(`/sp/${token}`);
    expect((await fetch(`${B}/sp/${'x'.repeat(24)}/manifest.webmanifest`)).status).toBe(404);
  });

  it('alerts: the push address is accepted only from a signed-in phone, only from a known push service; the broker sees ON', async () => {
    const body = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } };
    const anon = await fetch(`${B}/sp/${token}/push`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect(anon.status).toBe(401);
    const evil = await fetch(`${B}/sp/${token}/push`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: pCookie }, body: JSON.stringify({ ...body, endpoint: 'https://evil.example.com/x' }) });
    expect(evil.status).toBe(400);
    expect((await list()).partners.find((p: any) => p.id === partner.id).alerts.phones).toBe(0);
    const ok = await fetch(`${B}/sp/${token}/push`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: pCookie }, body: JSON.stringify(body) });
    expect(ok.status).toBe(200); expect((await ok.json()).fresh).toBe(true);
    expect((await list()).partners.find((p: any) => p.id === partner.id).alerts.phones).toBe(1);
    expect((await (await fetch(`${B}/sp/${token}/push`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: pCookie }, body: JSON.stringify(body) })).json()).fresh).toBe(false);
  });

  it('the QR form has a SEPARATE, optional, unticked SMS box; only a customer who ticks it can be asked later', async () => {
    const page = await (await fetch(`${B}/q/${partner.qrCode}`)).text();
    expect(page).toContain('name="outcome"'); expect(/name="outcome" value="1"\s+(checked)/.test(page)).toBe(false);
    expect(page).toContain('वैकल्पिक');
    expect((await scan('9131100801', { outcome: '1' })).status).toBe(303);
    expect((await scan('9131100802')).status).toBe(303);
    const a = await leadOf('9131100801'); const b = await leadOf('9131100802');
    expect(a.outcomeOk).toBe(true); expect(b.outcomeOk).toBeFalsy();
    expect(b.history.some((h: any) => /agreed to one SMS/.test(h.text))).toBe(false);
    expect(a.history.some((h: any) => /agreed to one SMS/.test(h.text))).toBe(true);
  }, 30000);

  it('the brokerage written by hand (deal not in the app) reaches the shop as a change; “ठीक है” closes it, and the shop sees a FIXED share', async () => {
    const a = await leadOf('9131100801');
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${a.id}/won`, {})).status).toBe(400); // nothing to take it from
    const w = await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${a.id}/won`, { brokerage: 15000 }); expect(w.status).toBe(200);
    const lead = (await w.json()).lead; expect(lead.won).toMatchObject({ source: 'TYPED', amount: 2000, brokerage: 15000 });
    expect(lead.shareChanges[0]).toMatchObject({ by: 'TYPED', from: 0, to: 2000, status: 'PENDING' });
    let page = await shopPage();
    expect(page).toContain('data-testid="share-change"'); expect(page).toContain('data-testid="fixed-share"'); expect(page).toContain('₹2,000');
    expect(page).not.toContain('15,000'); // he never sees the broker's own brokerage
    const cid = lead.shareChanges[0].id;
    expect((await form(pCookie, `/sp/${token}/lead/${a.id}/change/${cid}/ok`, {})).status).toBe(303);
    const after = await leadOf('9131100801'); expect(after.shareChanges[0].status).toBe('OK');
    page = await shopPage(); expect(page).not.toContain('data-testid="share-change"'); expect(page).toContain('आपने मान लिया');
  });

  it('the broker corrects the share while it is unpaid: a reason is needed, the shop is told, says “not right”, and the broker replies; the desk sees it', async () => {
    const a = await leadOf('9131100801');
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${a.id}/share`, { brokerage: 12000 })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${a.id}/share`, { brokerage: 15000, reason: 'same figure' })).status).toBe(409);
    expect((await call(jar.BRK2, 'POST', `/api/shop-partners/leads/${a.id}/share`, { brokerage: 12000, reason: 'not mine' })).status).toBe(404);
    // a FIXED ₹2,000 share does not move with the brokerage, so use a lower one to make it visible
    const r = await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${a.id}/share`, { brokerage: 1500, reason: 'client negotiated hard' });
    expect(r.status).toBe(200); const ch = (await r.json()).lead.shareChanges.slice(-1)[0];
    expect(ch).toMatchObject({ by: 'REVISED', from: 2000, to: 1500, status: 'PENDING', reason: 'client negotiated hard' });
    let page = await shopPage(); expect(page).toContain('client negotiated hard'); expect(page).toContain('₹1,500');
    expect((await form(pCookie, `/sp/${token}/lead/${a.id}/change/${ch.id}/no`, { note: 'x' })).status).toBe(200); // a note of 1 letter is refused (re-shows the page)
    expect((await form(pCookie, `/sp/${token}/lead/${a.id}/change/${ch.id}/no`, { note: 'We agreed 2000 on the phone' })).status).toBe(303);
    const desk = await (await call(jar.ADMIN, 'GET', '/api/shop-partners/admin')).json();
    const row = desk.items.find((x: any) => x.id === a.id); expect(row.flags.some((f: any) => f.code === 'SHARE_DISPUTED')).toBe(true);
    expect(row.shareChanges.some((c: any) => c.status === 'DISPUTED' && /2000/.test(c.note))).toBe(true);
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${a.id}/changes/${ch.id}/reply`, { note: '' })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${a.id}/changes/${ch.id}/reply`, { note: 'Will call you today' })).status).toBe(200);
    page = await shopPage(); expect(page).toContain('Will call you today'); expect(page).toContain('GENZ डेस्क देख रहा है');
  });

  it('paying needs a UPI / bank reference (cash does not); the shop sees the mode and the reference and confirms', async () => {
    const a = await leadOf('9131100801');
    const noRef = await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${a.id}/paid`, { mode: 'UPI' });
    expect(noRef.status).toBe(400); expect((await noRef.json()).code).toBe('REF_NEEDED');
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${a.id}/paid`, { mode: 'BANK', ref: 'ab' })).status).toBe(400);
    const ok = await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${a.id}/paid`, { mode: 'UPI', ref: 'UTR 4471 8820' });
    expect(ok.status).toBe(200); expect((await ok.json()).lead.payout).toMatchObject({ status: 'PAID', mode: 'UPI', ref: 'UTR 4471 8820' });
    const page = await shopPage(); expect(page).toContain('UTR 4471 8820'); expect(page).toContain('data-testid="got-it"');
    expect((await form(pCookie, `/sp/${token}/lead/${a.id}/received`, {})).status).toBe(303);
    expect((await leadOf('9131100801')).payout.status).toBe('RECEIVED');
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${a.id}/paid`, { mode: 'CASH' })).status).toBe(409); // nothing is due any more
  });

  it('asking the customer: only if he ticked the box; one SMS with a one-tap link; GET only shows the question; his answer reaches the shop and the desk', async () => {
    const yes = await leadOf('9131100801'); const no = await leadOf('9131100802');
    // not ticked → refused, no SMS
    const before = sms.length;
    const refused = await form(pCookie, `/sp/${token}/lead/${no.id}/ask-customer`, {}); expect(refused.status).toBe(200); expect(await refused.text()).toContain('अनुमति नहीं दी');
    expect(sms.length).toBe(before);
    // ticked → one SMS to the customer's number with a link
    const sent = await form(pCookie, `/sp/${token}/lead/${yes.id}/ask-customer`, {}); expect(sent.status).toBe(200);
    expect(sms.length).toBe(before + 1); const m = sms[sms.length - 1];
    expect(m.to).toBe('+919131100801'); const link = /\/q\/ok\/([A-Za-z0-9_-]{20,40})/.exec(m.message); expect(link).toBeTruthy();
    expect(m.message).not.toContain('Sai Provision'); // the SMS does not name the shop or any amount
    // asking again right away is refused (24 h gap)
    const again = await form(pCookie, `/sp/${token}/lead/${yes.id}/ask-customer`, {}); expect(await again.text()).toContain('अभी पूछा गया');
    expect(sms.length).toBe(before + 1);
    // the link: GET shows the question and does NOT answer it
    const q = await fetch(`${B}/q/ok/${link![1]}`); expect(q.status).toBe(200); const qt = await q.text(); expect(qt).toContain('data-testid="ok-yes"');
    expect((await leadOf('9131100801')).askState.answer).toBeUndefined();
    expect((await fetch(`${B}/q/ok/${'z'.repeat(24)}`)).status).toBe(404);
    // POST answers; a second POST cannot change it
    const done = await form(undefined, `/q/ok/${link![1]}`, { a: 'YES' }); expect(done.status).toBe(200); expect(await done.text()).toContain('दर्ज');
    await form(undefined, `/q/ok/${link![1]}`, { a: 'NO' });
    expect((await leadOf('9131100801')).askState.answer).toBe('YES');
    const page = await shopPage(); expect(page).toContain('data-testid="customer-answer"'); expect(page).toContain('हाँ, बात आगे बढ़ी');
    // a lead that is NOT a written deal but whose customer says it went ahead → flagged for the desk
    const lead2 = await leadOf('9131100802');
    expect(lead2.status).not.toBe('WON');
  }, 30000);

  it('a customer who says it went ahead, while no deal is written, is flagged to the broker and the GENZ desk', async () => {
    // a fresh lead (ticked) that the broker marks “not going ahead”, then the shop asks and the customer says YES
    expect((await scan('9131100803', { outcome: '1' })).status).toBe(303);
    const l = await leadOf('9131100803');
    expect((await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${l.id}/status`, { status: 'LOST', reason: 'Not interested' })).status).toBe(200);
    const before = sms.length;
    await form(pCookie, `/sp/${token}/lead/${l.id}/ask-customer`, {});
    expect(sms.length).toBe(before + 1);
    const tok = /\/q\/ok\/([A-Za-z0-9_-]{20,40})/.exec(sms[sms.length - 1].message)![1];
    await form(undefined, `/q/ok/${tok}`, { a: 'YES' });
    const mine = await leadOf('9131100803'); expect(mine.flags.some((f: any) => f.code === 'CUSTOMER_YES')).toBe(true);
    const desk = await (await call(jar.ADMIN, 'GET', '/api/shop-partners/admin')).json();
    const row = desk.items.find((x: any) => x.id === l.id); expect(row.flags.some((f: any) => f.code === 'CUSTOMER_YES')).toBe(true); expect(row.customerSaid).toBe('YES');
  }, 30000);

  it('a question to the broker lands on the lead history; poster A5/A4, leaflet and certificate are served (and never say “no fee”)', async () => {
    const l = await leadOf('9131100802');
    expect((await form(pCookie, `/sp/${token}/lead/${l.id}/ask-broker`, { note: 'Kya iska kuch hua?' })).status).toBe(303);
    expect((await leadOf('9131100802')).history.some((h: any) => /Partner asks the broker: Kya iska kuch hua\?/.test(h.text))).toBe(true);
    const a5 = await (await fetch(`${B}/q/${partner.qrCode}/poster`)).text(); expect(a5).toContain('size:A5'); expect(a5).toContain('data-testid="poster"'); expect(a5).toContain('GENZ आपसे कोई पैसा नहीं लेता');
    const a4 = await (await fetch(`${B}/q/${partner.qrCode}/poster?size=a4`)).text(); expect(a4).toContain('size:A4');
    for (const t of [a5, a4]) { expect(t).not.toMatch(/no fee|बिना फ़ीस|फ्री|free of charge/i); expect(t).toContain('<svg'); }
    const leaf = await call(jar.BRK1, 'GET', `/api/shop-partners/${partner.id}/leaflet`); expect(leaf.status).toBe(200);
    const lt = await leaf.text(); expect(lt).toContain('data-testid="leaflet"'); expect(lt).toContain('ब्रोकरेज का 20%'); expect(lt).toContain('₹20,000'); expect(lt).toContain('१५ दिन');
    expect((await call(jar.BRK2, 'GET', `/api/shop-partners/${partner.id}/leaflet`)).status).toBe(404);
    const cert = await fetch(`${B}/sp/${token}/certificate`, { headers: { cookie: pCookie } }); expect(cert.status).toBe(200);
    const ct = await cert.text(); expect(ct).toContain('GENZ नेटवर्क पार्टनर'); expect(ct).toContain('Sai Provision'); expect(ct).toContain('लाइसेंस या सरकारी मान्यता नहीं'); expect(ct).not.toMatch(/verified shop|वेरिफ़ाइड दुकान/i);
    expect((await fetch(`${B}/sp/${token}/certificate`, { redirect: 'manual' })).status).toBe(303); // not signed in → back to the gate
  });

  it('the broker\'s own record is shown to him and to the shops: shares paid within 15 days', async () => {
    const d = await list(); expect(d.record.counted).toBeGreaterThanOrEqual(1); expect(d.record.onTime).toBeGreaterThanOrEqual(1);
    const page = await shopPage(); expect(page).toContain('data-testid="broker-record"');
  });
});
