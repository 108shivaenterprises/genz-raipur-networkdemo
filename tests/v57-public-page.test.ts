import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { priceShort, cleanAreas, mobile10, PAGE_LIMITS } from '../src/shared/publicPageRules.js';

/**
 * v57 — the broker's public page (/c/<code>): only the homes he picked (his own live listings after the owners' promise, other
 * brokers' listings only when their listing broker opened them), never an owner's details, and enquiries that reach ONLY the page broker.
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 7300 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (c: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = async (r: Response) => r.json();
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const page = async (p: string) => { const r = await fetch(B + p); return { status: r.status, html: await r.text() }; };
const tokenOf = (html: string) => /name="t" value="([^"]+)"/.exec(html)?.[1] || '';
const enquire = (code: string, f: Record<string, string>, origin?: string) =>
  fetch(`${B}/c/${code}/enquiry`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(origin ? { origin } : {}) }, body: new URLSearchParams(f).toString() });
const unesc = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

let code = ''; let pagePath = '';

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v57-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await sleep(250); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ ADMIN: 'USR-SUPERADMIN', B1: 'USR-BRK-001', B2: 'USR-BRK-002', B3: 'USR-BRK-003', BUYER: 'USR-BUYER-001' })) {
    if (cfg.demoAccounts.some((x: any) => x.id === id)) jar[k] = await login(id);
  }
  if (!jar.ADMIN) jar.ADMIN = await login(cfg.demoAccounts.find((x: any) => x.role === 'SUPERADMIN').id);
  const me = await j(await call(jar.B1, 'GET', '/api/public-page'));
  pagePath = me.card.path; code = pagePath.split('/').pop()!;
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await sleep(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

describe('shared rules', () => {
  it('prices, areas and mobile numbers', () => {
    expect(priceShort(28_500_000)).toBe('₹2.85 Cr');
    expect(priceShort(100_000_000)).toBe('₹10 Cr');
    expect(priceShort(4_500_000)).toBe('₹45 L');
    expect(priceShort(7_270_000)).toBe('₹72.7 L');
    expect(priceShort(12_000)).toBe('₹12,000');
    expect(cleanAreas('Shankar Nagar, telibandha,  Shankar nagar , <b>Pandri</b>, a')).toEqual(['Shankar Nagar', 'telibandha', 'Pandri']);
    expect(cleanAreas(Array.from({ length: 10 }, (_, i) => `Area ${i}`))).toHaveLength(PAGE_LIMITS.areas);
    expect(mobile10('+91 98260-11101')).toBe('9826011101');
    expect(mobile10('09826011101')).toBe('9826011101');
    expect(mobile10('9131100011')).toBe('9131100011');
    expect(mobile10('12345')).toBe('');
    expect(mobile10('98260111012')).toBe('');
  });
});

describe('the page', () => {
  it('shows exactly the chosen live homes and never an owner’s name, number, address or map', async () => {
    const me = await j(await call(jar.B1, 'GET', '/api/public-page'));
    expect(me.card.enabled).toBe(true);
    expect(me.homes.chosen.length).toBeGreaterThan(2);
    const { status, html } = await page(pagePath);
    expect(status).toBe(200);
    expect((html.match(/<article class="home"/g) || []).length).toBe(me.homes.chosen.length);
    const text = unesc(html);
    for (const id of me.homes.chosen) {
      const r = await j(await call(jar.ADMIN, 'GET', `/api/properties/${id}`)); const p = r.property || r;
      expect(text).toContain(p.title);
      for (const secret of [p.ownerName, p.addressHidden, p.street, p.googleMapsUrl].filter((x: any) => typeof x === 'string' && x.length > 5)) expect(text, `${id} leaks "${secret}"`).not.toContain(secret);
      const ph = String(p.ownerPhone || '').replace(/\D/g, '').slice(-10);
      if (ph.length === 10) expect(text.replace(/\s/g, ''), `${id} leaks the owner phone`).not.toContain(ph);
    }
    expect(html).not.toMatch(/ownerPhone|ownerApprovedNetPrice|googleMaps|latitude/);
    expect(html).toContain('<script src="/c/page.js" defer></script>');
    expect((await fetch(B + '/c/page.js')).headers.get('content-type')).toMatch(/javascript/);
    expect((await page('/c/GZ-NOPE-0000')).status).toBe(404);
  });

  it('another broker’s listing shows only while its listing broker allows it; closing it takes it off every page', async () => {
    const b2 = await j(await call(jar.B2, 'GET', '/api/public-page'));
    const opened = b2.own.find((p: any) => p.othersCanShow);
    expect(opened).toBeTruthy();
    expect(opened.othersShowing).toBeGreaterThanOrEqual(1);
    expect((await page(pagePath)).html).toContain(`id="h-${opened.id}"`);
    // B1 sees it in "other brokers' homes", B2's name with it
    const b1 = await j(await call(jar.B1, 'GET', '/api/public-page'));
    expect(b1.network.find((p: any) => p.id === opened.id)?.listingBroker?.name).toBeTruthy();
    // the listing broker closes it → gone from B1's page and B1 cannot add it back
    await call(jar.B2, 'POST', `/api/public-page/others/${opened.id}`, { on: false });
    expect((await page(pagePath)).html).not.toContain(`id="h-${opened.id}"`);
    const again = await call(jar.B1, 'PUT', '/api/public-page/homes', { ids: [...b1.homes.chosen.filter((x: string) => x !== opened.id), opened.id] });
    expect(again.status).toBe(400); expect((await j(again)).code).toBe('HOME_NOT_SHOWABLE');
    // opened again → B1 may add it
    expect((await call(jar.B2, 'POST', `/api/public-page/others/${opened.id}`, { on: true })).status).toBe(200);
    const ok = await call(jar.B1, 'PUT', '/api/public-page/homes', { ids: [...b1.homes.chosen.filter((x: string) => x !== opened.id), opened.id] });
    expect(ok.status).toBe(200);
    expect((await page(pagePath)).html).toContain(`id="h-${opened.id}"`);
    // only the listing broker decides
    expect((await call(jar.B1, 'POST', `/api/public-page/others/${opened.id}`, { on: false })).status).toBe(404);
  });

  it('own listings go public only after the one-time owners’ promise; a home of a stranger never', async () => {
    const b3 = await j(await call(jar.B3, 'GET', '/api/public-page'));
    expect(b3.card.ownerOk).toBe(false);
    const mine = b3.own[0]; expect(mine).toBeTruthy();
    const r1 = await call(jar.B3, 'PUT', '/api/public-page/homes', { ids: [mine.id] });
    expect(r1.status).toBe(400); expect((await j(r1)).code).toBe('OWNER_OK_NEEDED');
    const r2 = await j(await call(jar.B3, 'PUT', '/api/public-page/homes', { ids: [mine.id], ownerOk: true }));
    expect(r2.card.ownerOk).toBe(true); expect(r2.homes.chosen).toEqual([mine.id]);
    // B1's own listing is not B3's to show (B1 never opened it to pages)
    const b1own = (await j(await call(jar.B1, 'GET', '/api/public-page'))).own.find((p: any) => !p.othersCanShow);
    const r3 = await call(jar.B3, 'PUT', '/api/public-page/homes', { ids: [mine.id, b1own.id] });
    expect(r3.status).toBe(400);
    // the page is off until he switches it on
    const b3code = r2.card.path.split('/').pop();
    expect((await page(`/c/${b3code}`)).status).toBe(404);
    await call(jar.B3, 'PUT', '/api/public-page/settings', { enabled: true, headline: 'Call me on 9826012345 for flats', areas: 'Pandri, Avanti Vihar' });
    const live = await page(`/c/${b3code}`);
    expect(live.status).toBe(200);
    expect(live.html).toContain(`id="h-${mine.id}"`);
    expect(live.html).not.toContain('9826012345');
    expect(live.html).toContain('Avanti Vihar');
  });

  it('saving the old visiting card keeps the page’s homes; a buyer has no page screen', async () => {
    const before = (await j(await call(jar.B1, 'GET', '/api/public-page'))).homes.chosen;
    expect((await call(jar.B1, 'PUT', '/api/growth/card', { enabled: true, showPhone: true, headline: 'Raipur homes' })).status).toBe(200);
    expect((await j(await call(jar.B1, 'GET', '/api/public-page'))).homes.chosen).toEqual(before);
    expect((await call(jar.BUYER, 'GET', '/api/public-page')).status).toBe(403);
    expect((await call(undefined, 'GET', '/api/public-page')).status).toBe(401);
  });
});

describe('enquiries', () => {
  it('reach only the page broker — also about another broker’s listing — and bots get nothing in', async () => {
    const me = await j(await call(jar.B1, 'GET', '/api/public-page'));
    const net = me.network.find((p: any) => p.onPage);
    expect(net).toBeTruthy();
    const count = async () => (await j(await call(jar.B1, 'GET', '/api/public-page'))).enquiries.length;
    const n0 = await count();
    // too fast (a bot) and the hidden field filled (a bot): both look sent, nothing is kept
    let html = (await page(pagePath)).html;
    const fast = await enquire(code, { t: tokenOf(html), name: 'Bot One', phone: '9826000001', consent: '1' });
    expect(fast.status).toBe(303);
    await sleep(2700);
    const trap = await enquire(code, { t: tokenOf(html), name: 'Bot Two', phone: '9826000002', consent: '1', website: 'http://spam' });
    expect(trap.status).toBe(303);
    expect(await count()).toBe(n0);
    // a wrong number / no consent / another site → refused
    expect((await enquire(code, { t: tokenOf(html), name: 'Kiran', phone: '12345', consent: '1' })).status).toBe(400);
    expect((await enquire(code, { t: tokenOf(html), name: 'Kiran', phone: '9826117619' })).status).toBe(400);
    expect((await enquire(code, { t: tokenOf(html), name: 'Kiran', phone: '9826117619', consent: '1' }, 'https://evil.example')).status).toBe(403);
    // a real one, about the other broker's listing
    const ok = await enquire(code, { t: tokenOf(html), name: 'Kiran Mehta', phone: '+91 98261 17619', home: net.id, message: 'Sunday visit? 9826117000', consent: '1' });
    expect(ok.status).toBe(303); expect(ok.headers.get('location')).toContain('sent=1');
    // the same form cannot bring a second one
    expect((await enquire(code, { t: tokenOf(html), name: 'Kiran Mehta', phone: '9826117619', consent: '1' })).status).toBe(400);
    const mine = (await j(await call(jar.B1, 'GET', '/api/public-page'))).enquiries;
    const e = mine.find((x: any) => x.name === 'Kiran Mehta');
    expect(e).toMatchObject({ phone: '9826117619', propertyId: net.id, status: 'NEW', message: 'Sunday visit? 9826117000' });
    expect(e.home.own).toBe(false); expect(e.home.listingBroker).toBeTruthy();
    // the listing broker of that home never sees the customer
    const b2 = await j(await call(jar.B2, 'GET', '/api/public-page'));
    expect(JSON.stringify(b2)).not.toContain('9826117619');
    expect(JSON.stringify(await j(await call(jar.B2, 'GET', '/api/listings/enquiries')))).not.toContain('9826117619');
    // GENZ's record says an enquiry came, not who sent it
    const audit = await j(await call(jar.ADMIN, 'GET', '/api/audit-logs?limit=300&full=1'));
    const rows = JSON.stringify(audit);
    expect(rows).toContain('PAGE_ENQUIRY');
    expect(rows).not.toContain('9826117619');
    // the broker's home shows the new enquiry
    const home = await j(await call(jar.B1, 'GET', '/api/home/broker'));
    expect(home.counts.pageNew).toBeGreaterThanOrEqual(1);
    expect(home.page.on).toBe(true);
    // the same mobile again today about the same home: added to the same enquiry
    html = (await page(pagePath)).html; await sleep(2700);
    expect((await enquire(code, { t: tokenOf(html), name: 'Kiran Mehta', phone: '9826117619', home: net.id, message: 'Also Saturday is fine', consent: '1' })).status).toBe(303);
    const after = (await j(await call(jar.B1, 'GET', '/api/public-page'))).enquiries.filter((x: any) => x.phone === '9826117619');
    expect(after).toHaveLength(1);
    expect(after[0].message).toContain('Also Saturday is fine');
  }, 30000);

  it('only the page broker can mark or delete an enquiry', async () => {
    const e = (await j(await call(jar.B1, 'GET', '/api/public-page'))).enquiries.find((x: any) => x.phone === '9826117619');
    expect((await call(jar.B2, 'POST', `/api/public-page/enquiries/${e.id}/status`, { status: 'SPAM' })).status).toBe(404);
    expect((await call(jar.B2, 'DELETE', `/api/public-page/enquiries/${e.id}`)).status).toBe(404);
    expect((await call(jar.B1, 'POST', `/api/public-page/enquiries/${e.id}/status`, { status: 'WHATEVER' })).status).toBe(400);
    const r = await j(await call(jar.B1, 'POST', `/api/public-page/enquiries/${e.id}/status`, { status: 'CONTACTED' }));
    expect(r.enquiries.find((x: any) => x.id === e.id).status).toBe('CONTACTED');
    const d = await j(await call(jar.B1, 'DELETE', `/api/public-page/enquiries/${e.id}`));
    expect(d.enquiries.some((x: any) => x.id === e.id)).toBe(false);
  });

  it('a switched-off page takes no enquiries', async () => {
    await call(jar.B1, 'PUT', '/api/public-page/settings', { enabled: false });
    expect((await page(pagePath)).status).toBe(404);
    expect((await enquire(code, { t: '1.x', name: 'Late Comer', phone: '9826117620', consent: '1' })).status).toBe(404);
    await call(jar.B1, 'PUT', '/api/public-page/settings', { enabled: true });
    expect((await page(pagePath)).status).toBe(200);
  });
});
