import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { freePort } from './helpers/port';

// v113 — three whole journeys, each walked with real HTTP and the V113 rule "one client, three places" checked at every step:
//  J1  shop QR → bot chat → number opens → client card + need (linked) → Magic Match finds the broker's OWN home → client room → deal
//  J2  broker 2's client → Magic Match finds broker 1's home (co-broking) → visit → offer with a token → the owner accepts → deal room → card DEAL
//  J3  builder's channel partner: block a unit with a token — and what the block needs (a CRM lead, not a client card)
const PORT = await freePort(); const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const call = (ck: string | undefined, m: string, u: string, b?: unknown) => fetch(B + u, { method: m, redirect: 'manual', headers: { 'content-type': 'application/json', ...(ck ? { cookie: ck } : {}) }, body: b ? JSON.stringify(b) : undefined });
const j = (r: Response) => r.json().catch(() => ({}));
const form = (ck: string | undefined, u: string, d: Record<string, string>) => fetch(B + u, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(ck ? { cookie: ck } : {}) }, body: new URLSearchParams(d).toString() });
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v113j-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], { cwd: dir, stdio: 'ignore', env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PUSH_DRY_RUN: 'true', SAHAYAK: 'off', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', SEED_DEMO_BULK: 'true', DISABLE_HMR: 'true' } });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', OWN: 'USR-OWNER-001', BUILDER: 'USR-BUILDER-001', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
}, 120_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

const clientsOf = async (who: string) => (await j(await call(jar[who], 'GET', '/api/daily/clients'))).clients as any[];
const needsOf = async (who: string) => (await j(await call(jar[who], 'GET', '/api/requirements?mine=1'))).requirements as any[];
const base = { budgetMin: 0, budgetMax: 0, city: 'Raipur', areas: [] as string[], propertyType: 'Independent House', transactionType: 'Sale', tags: [], notes: '', consent: true };

// ─────────────────────────── J1 — shop QR → own home → deal ───────────────────────────
describe('J1 · shop QR → the broker’s own home → client room → deal', { timeout: 120_000 }, () => {
  const SHOP = '9876500033'; const CUST = '9123466611'; let qr = ''; let leadId = ''; let own: any; let chatTok = ''; let cardId = ''; let needId = '';
  const list = async () => await j(await call(jar.BRK1, 'GET', '/api/shop-partners'));
  const scan = async (phone: string) => {
    const page = await (await fetch(`${B}/q/${qr}`)).text(); const t = /name="t" value="([^"]+)"/.exec(page)?.[1] || ''; await wait(2600);
    return form(undefined, `/q/${qr}`, { t, kind: 'BUY', name: 'Mohit Garg', phone, locality: 'Shankar Nagar', budget: '3 crore', ptype: 'House', note: '', consent: '1', direct: '1', sign: 'Mohit Garg' });
  };

  it('1 · the shop gets a live QR; a customer scans it — the number stays hidden and there is no card or need yet', async () => {
    const props = (await j(await call(jar.BRK1, 'GET', '/api/properties'))).properties as any[];
    own = props.find(p => p.listingBrokerId === 'USR-BRK-001' && p.transactionType === 'Sale' && p.listingStatus === 'active' && p.verificationStatus === 'VERIFIED' && p.propertyType === 'Independent House') || props.find(p => p.listingBrokerId === 'USR-BRK-001' && p.transactionType === 'Sale' && p.listingStatus === 'active' && p.verificationStatus === 'VERIFIED');
    expect(own, 'broker 1 has a live sale home').toBeTruthy();
    const r = await call(jar.BRK1, 'POST', '/api/shop-partners', { shopName: 'Gupta Kirana', personName: 'Ramesh Gupta', phone: SHOP, area: 'Shankar Nagar', city: 'Raipur', terms: { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 }, consent: true });
    expect(r.status).toBe(200); const b = await j(r); qr = b.partner.qrCode; const token = b.link.split('/sp/')[1];
    await form(undefined, `/sp/${token}/otp`, { phone: SHOP });
    const code = (await list()).partners.find((x: any) => x.id === b.partner.id).codeForPartner;
    const ck = (await form(undefined, `/sp/${token}/verify`, { code })).headers.get('set-cookie')!.split(';')[0];
    expect((await form(ck, `/sp/${token}/accept`, { ok: '1' })).status).toBe(303);
    const sc = await scan(CUST); expect(sc.status).toBe(303); chatTok = /\/q\/chat\/([A-Za-z0-9_-]+)/.exec(sc.headers.get('location') || '')?.[1] || '';
    const lead = (await list()).leads.find((l: any) => l.phoneLast4 === CUST.slice(-4)); leadId = lead.id; expect(lead.masked).toBe(true);
    expect((await clientsOf('BRK1')).some(c => String(c.phone).includes(CUST))).toBe(false);
  });

  it('2 · the customer confirms his need in the bot chat; the broker shares his OWN home → number opens → card AND need, already linked', async () => {
    const lead = (await list()).leads.find((l: any) => l.id === leadId);
    const t = chatTok; expect(t, 'the customer’s chat link').toBeTruthy();
    await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${lead.id}/ask-need`); await form(undefined, `/q/chat/${t}/ans`, { a: 'YES' });
    const m = (await list()).leads.find((l: any) => l.id === leadId).matches as any[]; expect(m.length, 'the bot finds a matching home').toBeGreaterThan(0);
    const home = m[0];
    own = ((await j(await call(jar.BRK1, 'GET', '/api/properties'))).properties as any[]).find(p => p.id === home.id) || own;   // the home the bot found for him
    const r = await j(await call(jar.BRK1, 'POST', `/api/shop-partners/leads/${leadId}/offer`, { homeId: home.id })); expect(r.lead.masked).toBe(false);
    const card = (await clientsOf('BRK1')).find(c => c.id === r.lead.clientCardId); expect(card, 'the client card').toBeTruthy();
    cardId = card.id; expect(card.needId, 'the card points at its need').toBeTruthy(); needId = card.needId;
    const need = (await needsOf('BRK1')).filter(q => String(q.customerPhone).endsWith(CUST.slice(-10)));
    expect(need).toHaveLength(1); expect(need[0].id).toBe(needId); expect(need[0].customerName).toBe('Mohit Garg');
    expect(need[0].preferredLocalities.length).toBeGreaterThan(0);                                // the area he gave
  });

  it('3 · opening Magic Match for that need lists the broker’s own home', async () => {
    const r = await j(await call(jar.BRK1, 'GET', `/api/matching/requirement/${needId}`));
    expect((r.matches || []).length).toBeGreaterThan(0);
    expect((r.matches as any[]).some(m => m.property.listingBrokerId === 'USR-BRK-001')).toBe(true);
  });

  it('4 · a client room for him (with consent) shows on his card; a second scan changes nothing', async () => {
    expect((await call(jar.BRK1, 'POST', '/api/client-rooms', { clientName: 'Mohit Garg', phone: CUST, kind: 'BUYER', consent: true })).status).toBe(200);
    const card = (await clientsOf('BRK1')).find(c => c.id === cardId); expect(card.roomId).toBeTruthy(); expect(card.needId).toBe(needId);
    await scan(CUST);
    expect((await clientsOf('BRK1')).filter(c => String(c.phone).includes(CUST.slice(-10)))).toHaveLength(1);
    expect((await needsOf('BRK1')).filter(q => String(q.customerPhone).endsWith(CUST.slice(-10)))).toHaveLength(1);
  });

  it('5 · the visit on his own home → a deal room; the card goes to DEAL → the need is “fulfilled”', async () => {
    const v = await call(jar.BRK1, 'POST', '/api/site-visits', { propertyId: own.id, customerName: 'Mohit Garg', customerPhone: CUST, scheduledTime: new Date(Date.now() + 3600_000).toISOString() });
    expect(v.status, await v.clone().text()).toBe(200); expect((await j(v)).dealRoom?.id).toBeTruthy();
    expect((await call(jar.BRK1, 'POST', `/api/daily/clients/${cardId}/stage`, { stage: 'DEAL' })).status).toBe(200);
    expect((await needsOf('BRK1')).find(q => q.id === needId).status).toBe('fulfilled');
  });
});

// ─────────────────────────── J2 — co-broking: another broker's home, offer, token ───────────────────────────
describe('J2 · broker 2’s client → broker 1’s home (co-broking) → visit → offer + token → deal room → DEAL', { timeout: 120_000 }, () => {
  const PH = '9123466622'; let home: any; let needId = ''; let cardId = ''; let dealId = '';
  it('1 · broker 2 adds his client (budget + area of the home); the need exists and is linked', async () => {
    const all = (await j(await call(jar.ADMIN, 'GET', '/api/properties'))).properties as any[];
    const deals = ((await j(await call(jar.ADMIN, 'GET', '/api/deals'))).deals || []) as any[];
    home = all.find(p => p.listingBrokerId === 'USR-BRK-001' && p.ownerId === 'USR-OWNER-001' && p.transactionType === 'Sale' && p.listingStatus === 'active' && p.verificationStatus === 'VERIFIED' && !deals.some(d => d.propertyId === p.id));
    expect(home, 'a clean home of broker 1').toBeTruthy();
    const r = await call(jar.BRK2, 'POST', '/api/daily/clients', { ...base, name: 'Seema Agrawal', phone: PH, budgetMin: Math.round(home.askingPrice * 0.8), budgetMax: Math.round(home.askingPrice * 1.1), areas: [home.locality], propertyType: home.propertyType });
    expect(r.status, await r.clone().text()).toBe(200);
    const c = (await clientsOf('BRK2')).find(x => x.name === 'Seema Agrawal'); cardId = c.id; needId = c.needId; expect(needId).toBeTruthy();
  });
  it('2 · Magic Match for her need shows broker 1’s home, with the reasons', async () => {
    const r = await j(await call(jar.BRK2, 'GET', `/api/matching/requirement/${needId}`));
    const m = (r.matches as any[]).find(x => x.property.id === home.id); expect(m, 'the co-broked home is matched').toBeTruthy(); expect(m.score).toBeGreaterThan(20);
  });
  it('3 · what the other side sees: broker 1 never gets her name or number from the network board', async () => {
    const seen = ((await j(await call(jar.BRK1, 'GET', '/api/requirements'))).requirements as any[]).find(q => q.id === needId);
    if (seen) { expect(seen.customerName).not.toBe('Seema Agrawal'); expect(String(seen.customerPhone)).not.toContain(PH); }
    expect((await clientsOf('BRK1')).some(c => c.name === 'Seema Agrawal')).toBe(false);
  });
  it('4 · she visits (deal room opens, broker 2 introduces, broker 1 closes); the offer carries a TOKEN; the owner accepts', async () => {
    const v = await call(jar.BRK2, 'POST', '/api/site-visits', { propertyId: home.id, customerName: 'Seema Agrawal', customerPhone: PH, scheduledTime: new Date(Date.now() + 3600_000).toISOString() });
    expect(v.status, await v.clone().text()).toBe(200); const vb = await j(v);
    expect(vb.dealRoom).toMatchObject({ introducingBrokerId: 'USR-BRK-002', closingBrokerId: 'USR-BRK-001' });
    const amount = Math.round(home.askingPrice * 0.95);
    const mk = await call(jar.BRK2, 'POST', '/api/offers', { propertyId: home.id, buyerName: 'Seema Agrawal', buyerPhone: PH, consent: true, amount, tokenProposed: 100000 });
    expect(mk.status, await mk.clone().text()).toBe(200); const offer = (await j(mk)).offer;
    expect(offer.tokenProposed ?? 100000).toBe(100000);
    const acc = await call(jar.OWN, 'POST', `/api/offers/${offer.id}/decide`, { action: 'ACCEPT' }); expect(acc.status, await acc.clone().text()).toBe(200);
    dealId = (await j(acc)).offer.dealRoomId; expect(dealId).toBeTruthy();
    const d = await j(await call(jar.BRK2, 'GET', `/api/deals/${dealId}`)); expect(d.deal.dealValue).toBe(amount);
  });
  it('5 · broker 2 moves her card to DEAL → her need is “fulfilled” and broker 1 still has no card for her', async () => {
    expect((await call(jar.BRK2, 'POST', `/api/daily/clients/${cardId}/stage`, { stage: 'DEAL' })).status).toBe(200);
    expect((await needsOf('BRK2')).find(q => q.id === needId).status).toBe('fulfilled');
    expect((await clientsOf('BRK1')).some(c => c.name === 'Seema Agrawal')).toBe(false);
  });
});

// ─────────────────────────── J3 — the builder's channel partner: block a unit ───────────────────────────
describe('J3 · channel partner → block a builder unit with a token', { timeout: 120_000 }, () => {
  const PLOTS = 'PROJ-RAI-02'; let unit: any; let leadId = '';
  it('1 · a partner broker sees the grid with a block counter; the builder does not get one', async () => {
    const g = await j(await call(jar.BRK1, 'GET', `/api/inventory/projects/${PLOTS}`));
    expect(g.caps.holds.max).toBe(3); unit = (g.units as any[]).find(u => u.status === 'AVAILABLE'); expect(unit).toBeTruthy();
    expect((await j(await call(jar.BUILDER, 'GET', `/api/inventory/projects/${PLOTS}`))).caps.holds).toBeUndefined();
  });
  it('2 · v114: a client card IS a block customer — the partner blocks straight from the card; his project lead is made once and reused', async () => {
    await call(jar.BRK1, 'POST', '/api/daily/clients', { ...base, name: 'Card Only Client', phone: '9123466633', budgetMax: 3_000_000 });
    const card = (await clientsOf('BRK1')).find(c => c.name === 'Card Only Client');
    expect((await call(jar.BRK1, 'POST', `/api/inventory/units/${unit.id}/hold`, { leadId: card.id, tokenAmount: 25000, tokenRef: 'UTR-J3-X' })).status).toBe(400);   // a card id is not a lead id
    expect((await call(jar.BRK2, 'POST', `/api/inventory/units/${unit.id}/hold`, { clientCardId: card.id, tokenAmount: 25000, tokenRef: 'UTR-J3-X' })).status).toBeGreaterThanOrEqual(400);   // not his client
    const r = await call(jar.BRK1, 'POST', `/api/inventory/units/${unit.id}/hold`, { clientCardId: card.id, tokenAmount: 25000, tokenRef: 'UTR-J3-X' });
    expect(r.status, await r.clone().text()).toBe(200); expect((await j(r)).unit.hold.customerName).toBe('Card Only Client');
    const leads = ((await j(await call(jar.BRK1, 'GET', '/api/crm/leads'))).leads as any[]).filter(l => l.name === 'Card Only Client' && l.projectId === PLOTS);
    expect(leads).toHaveLength(1);
    expect((await call(jar.BRK1, 'POST', `/api/inventory/units/${unit.id}/release`)).status).toBe(200);
    const again = (await j(await call(jar.BRK1, 'GET', `/api/inventory/projects/${PLOTS}`))).units.find((u: any) => u.status === 'AVAILABLE' && u.id !== unit.id);
    expect((await call(jar.BRK1, 'POST', `/api/inventory/units/${again.id}/hold`, { clientCardId: card.id, tokenAmount: 25000, tokenRef: 'UTR-J3-Y' })).status).toBe(200);
    expect(((await j(await call(jar.BRK1, 'GET', '/api/crm/leads'))).leads as any[]).filter(l => l.name === 'Card Only Client' && l.projectId === PLOTS)).toHaveLength(1);   // reused, not a second lead
    expect((await call(jar.BRK1, 'POST', `/api/inventory/units/${again.id}/release`)).status).toBe(200);
  });
  it('3 · with a CRM lead the block works: token + UTR recorded, the customer is the lead, a second partner is refused, release frees the unit', async () => {
    const lr = await call(jar.BRK1, 'POST', '/api/crm/leads', { consent: true, projectId: PLOTS, name: 'Block Buyer', phone: '9123466644', source: 'WALK_IN' });
    expect(lr.status, await lr.clone().text()).toBe(200); leadId = (await j(lr)).lead.id;
    const r = await call(jar.BRK1, 'POST', `/api/inventory/units/${unit.id}/hold`, { leadId, tokenAmount: 25000, tokenRef: 'UTR-J3-1' });
    expect(r.status, await r.clone().text()).toBe(200); const b = await j(r);
    expect(b.unit.status).toBe('HOLD'); expect(b.unit.hold.customerName).toBe('Block Buyer'); expect(b.unit.hold.tokenRef).toBe('UTR-J3-1');
    const other = await call(jar.BRK2, 'POST', `/api/inventory/units/${unit.id}/hold`, { leadId, tokenAmount: 25000, tokenRef: 'UTR-J3-2' });
    expect(other.status).toBeGreaterThanOrEqual(400);                                        // a unit on hold is not free for another partner
    expect((await call(jar.BRK1, 'POST', `/api/inventory/units/${unit.id}/release`)).status).toBe(200);
  });
});
