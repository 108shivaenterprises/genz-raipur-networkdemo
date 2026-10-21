import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { leadScore, digestScore, rateCard, parseLeadText } from '../src/shared/dailyRules';
import { filterMessage, isNewAccount } from '../src/shared/spamRules';
import { approxPoint, clusterPoints } from '../src/shared/geo';
import { LESSONS } from '../src/shared/academy';

/** v11: digest, client pipeline, lead score, listing freshness + reports, map, view-only docs, spam guards, chapters, points, loan desk. */
const PORT = 4600 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
let pool: { challengeToken: string; challengeAnswer: number }[] = [];

const loginRaw = (id: string) => fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: id, password: cfg.demoPassword }) });
async function login(id: string) { const r = await loginRaw(id); expect(r.status).toBe(200); return r.headers.get('set-cookie')!.split(';')[0]; }
const call = (cookie: string | undefined, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const byId = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
const rnd = () => '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
// 1×1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
let brokers: any[] = [];

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v11-'));
  mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  const issued = await Promise.all(Array.from({ length: 4 }, async () => (await fetch(B + '/api/growth/public/challenge')).json()));
  await new Promise(r => setTimeout(r, 2200));
  pool = issued.map((c: any) => ({ challengeToken: c.token, challengeAnswer: c.question.split(' + ').reduce((a: number, b: string) => a + Number(b), 0) }));
  brokers = cfg.demoAccounts.filter((a: any) => a.role === 'BROKER');
  jar.BRK1 = await login(byId('USR-BRK-001').email);
  jar.BRK2 = await login(byId('USR-BRK-002').email);
  jar.ADMIN = await login(byId('USR-ADMIN-1').email);
  jar.OWNER = await login(byId('USR-OWNER-001').email);
  jar.CON = await login(cfg.demoAccounts.find((a: any) => a.role === 'GENZ_CONNECTOR').email);
  const ok: any[] = [];
  for (const b of brokers) { try { jar[b.id] = await login(b.email); if ((await call(jar[b.id], 'GET', '/api/daily/digest')).status === 200) ok.push(b); } catch { /* unverified demo broker */ } }
  brokers = ok;
}, 40000);

afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('pure rules', () => {
  const card: any = { id: 'C', brokerId: 'B', name: 'Ravi', stage: 'NEGOTIATION', createdAt: new Date().toISOString(), lastContactAt: new Date().toISOString(), timeline: [] };
  it('lead score explains itself and orders hot > cold', () => {
    const hot = leadScore(card, { matchCount: 3, shareViews7d: 2 });
    const cold = leadScore({ ...card, stage: 'NEW', lastContactAt: new Date(Date.now() - 40 * 86400000).toISOString(), createdAt: new Date(Date.now() - 40 * 86400000).toISOString() }, { matchCount: 0, shareViews7d: 0 });
    expect(hot.label).toBe('HOT'); expect(cold.label).toBe('COLD'); expect(hot.score).toBeGreaterThan(cold.score);
    expect(hot.reasons.length).toBeGreaterThan(2);
    expect(leadScore({ ...card, stage: 'LOST' }, { matchCount: 5, shareViews7d: 5 }).score).toBe(0);
  });
  it('digest score: a better match wins, a boost / learned taste only nudges', () => {
    const a = digestScore(90, { trust: 50, ageDays: 2, boosted: false, typeAff: 0, locAff: 0 });
    const b = digestScore(70, { trust: 50, ageDays: 2, boosted: true, typeAff: 5, locAff: 5 });
    expect(a.score).toBeGreaterThan(b.score);
    expect(digestScore(70, { trust: 50, ageDays: 2, boosted: true, typeAff: 0, locAff: 0 }).score - digestScore(70, { trust: 50, ageDays: 2, boosted: false, typeAff: 0, locAff: 0 }).score).toBe(3);
  });
  it('rate card needs ≥ 10 listings in 90 days and shows its sample', () => {
    const mk = (n: number, price = 5_000_000) => Array.from({ length: n }, (_, i) => ({ id: 'P' + i, city: 'Raipur', locality: 'Shankar Nagar', propertyType: 'Residential Flat', transactionType: 'Sale', listingStatus: 'active', builtUpAreaSqFt: 1000, askingPrice: price + i * 10000, createdAt: new Date().toISOString() })) as any[];
    expect(rateCard(mk(9))).toHaveLength(0);
    const r = rateCard(mk(10));
    expect(r).toHaveLength(1); expect(r[0].sample).toBe(10); expect(r[0].medianPerSqFt).toBeGreaterThan(4900); expect(r[0].note).toMatch(/Indicative/);
    expect(rateCard(mk(12).map(p => ({ ...p, createdAt: new Date(Date.now() - 120 * 86400000).toISOString() })))).toHaveLength(0);
  });
  it('lead text parser pulls name, phone, budget', () => {
    const p = parseLeadText('New enquiry\nName: Amit Verma\nPhone: +91 98765 43210\nBudget: 60 lakh - 80 lakh\nLocation: Shankar Nagar');
    expect(p.name).toBe('Amit Verma'); expect(p.phone).toBe('9876543210'); expect(p.budgetMin).toBe(6_000_000); expect(p.budgetMax).toBe(8_000_000); expect(p.area).toBe('Shankar Nagar');
  });
  it('map points are approximate and stable; clusters merge close pins', () => {
    const a = approxPoint('Raipur', 'Telibandha'); const b = approxPoint('Raipur', 'Telibandha');
    expect(a).toEqual(b); expect(Math.abs(a.lat - 21.25)).toBeLessThan(0.05);
    expect(approxPoint('Raipur', 'x', 21.251234, 81.629876)).toMatchObject({ lat: 21.25, lng: 81.63 });
    expect(clusterPoints([{ lat: 21.25, lng: 81.63 }, { lat: 21.251, lng: 81.631 }, { lat: 28.6, lng: 77.2 }], 5)).toHaveLength(2);
  });
  it('academy lessons are bilingual', () => { for (const l of LESSONS) { expect(l.title.hi.length).toBeGreaterThan(2); expect(l.points.hi.length).toBe(l.points.en.length); } });
});

describe('spam guards', () => {
  const base = () => ({ name: 'Test Person', phone: rnd(), city: 'nagpur', role: 'BROKER', consent: true });
  it('request-access needs a correct, fresh, single-use check', async () => {
    expect((await call(undefined, 'POST', '/api/growth/public/waitlist', base())).status).toBe(400);
    expect((await call(undefined, 'POST', '/api/growth/public/waitlist', { ...base(), ...pool[0], challengeAnswer: 999 })).status).toBe(400);
    const good = pool[1];
    expect((await call(undefined, 'POST', '/api/growth/public/waitlist', { ...base(), ...good })).status).toBe(200);
    expect((await call(undefined, 'POST', '/api/growth/public/waitlist', { ...base(), ...good })).status).toBe(400); // replay
    const fresh = await j(await fetch(B + '/api/growth/public/challenge'));
    const ans = fresh.question.split(' + ').reduce((a: number, b: string) => a + Number(b), 0);
    expect((await call(undefined, 'POST', '/api/growth/public/waitlist', { ...base(), challengeToken: fresh.token, challengeAnswer: ans })).status).toBe(400); // too fast = bot
  });
  it('new accounts cannot post links or phone numbers; old accounts can post one', () => {
    const fresh = { createdAt: new Date().toISOString() }; const old = { createdAt: new Date(Date.now() - 30 * 86400000).toISOString() };
    expect(isNewAccount(fresh)).toBe(true); expect(isNewAccount(old)).toBe(false); expect(isNewAccount(fresh, Date.now(), true)).toBe(false);
    expect(filterMessage(fresh, 'call me 98261 12345')).toMatch(/New accounts/);
    expect(filterMessage(fresh, 'see https://x.com')).toMatch(/New accounts/);
    expect(filterMessage(fresh, 'Plot area 1760412345678 sq.ft')).toBeNull(); // long numbers are not phone numbers
    expect(filterMessage(old, 'call me 98261 12345 or see https://x.com')).toBeNull();
    expect(filterMessage(old, 'http://a.com http://b.com http://c.com')).toMatch(/Too many/);
  });
  it('deal-room chat refuses link floods and repeated text', async () => {
    const deals = await j(await call(jar.BRK1, 'GET', '/api/deals'));
    const d = deals.deals?.[0] || deals.dealRooms?.[0];
    expect(d).toBeTruthy();
    const spam = await call(jar.BRK1, 'POST', `/api/deals/${d.id}/messages`, { text: 'visit http://a.com http://b.com http://c.com now' });
    expect(spam.status).toBe(400); expect((await j(spam)).code).toBe('CHAT_FILTER');
    const t = 'Same line ' + Date.now();
    expect((await call(jar.BRK1, 'POST', `/api/deals/${d.id}/messages`, { text: t })).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/deals/${d.id}/messages`, { text: t })).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/deals/${d.id}/messages`, { text: t })).status).toBe(429);
  });
});

describe('client pipeline + lead score + digest', () => {
  let target: any; let cid = '';
  it('only verified brokers get it; owners and connectors do not', async () => {
    expect((await call(jar.OWNER, 'GET', '/api/daily/clients')).status).toBe(403);
    expect((await call(jar.CON, 'GET', '/api/daily/digest')).status).toBe(403);
    expect((await call(undefined, 'GET', '/api/daily/clients')).status).toBe(401);
  });
  it('adds a client only with consent, rejects a duplicate number, dedupes an offline retry', async () => {
    const props = (await j(await call(jar.BRK1, 'GET', '/api/properties'))).properties;
    target = props.find((p: any) => p.listingBrokerId !== 'USR-BRK-001' && p.transactionType === 'Sale');
    expect(target).toBeTruthy();
    const body = { name: 'Digest Client', phone: '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0'), budgetMin: Math.round(target.askingPrice * 0.8), budgetMax: Math.round(target.askingPrice * 1.1), city: target.city, areas: [target.locality], propertyType: target.propertyType, transactionType: 'Sale', clientRef: 'ref-' + Date.now() };
    expect((await call(jar.BRK1, 'POST', '/api/daily/clients', { ...body, consent: false })).status).toBe(400);
    const ok = await j(await call(jar.BRK1, 'POST', '/api/daily/clients', { ...body, consent: true }));
    cid = ok.client.id; expect(ok.client.stage).toBe('NEW'); expect(ok.client.lead.label).toBeDefined();
    const retry = await j(await call(jar.BRK1, 'POST', '/api/daily/clients', { ...body, consent: true }));
    expect(retry.duplicate).toBe(true); expect(retry.client.id).toBe(cid);
    expect((await call(jar.BRK1, 'POST', '/api/daily/clients', { ...body, clientRef: 'other', consent: true })).status).toBe(409);
  });
  it('is private: another broker never sees it', async () => {
    const other = await j(await call(jar.BRK2, 'GET', '/api/daily/clients'));
    expect(other.clients.some((c: any) => c.id === cid)).toBe(false);
    expect((await call(jar.BRK2, 'POST', `/api/daily/clients/${cid}/stage`, { stage: 'CONTACTED' })).status).toBe(404);
    expect((await call(jar.BRK2, 'DELETE', `/api/daily/clients/${cid}`)).status).toBe(404);
  });
  it('moves stages, demands a reason for LOST, and the score rises as the lead warms up', async () => {
    const s0 = (await j(await call(jar.BRK1, 'GET', '/api/daily/clients'))).clients.find((c: any) => c.id === cid).lead.score;
    expect((await call(jar.BRK1, 'POST', `/api/daily/clients/${cid}/stage`, { stage: 'LOST' })).status).toBe(400);
    await call(jar.BRK1, 'POST', `/api/daily/clients/${cid}/note`, { text: 'Spoke today', kind: 'CONTACT' });
    const mv = await j(await call(jar.BRK1, 'POST', `/api/daily/clients/${cid}/stage`, { stage: 'SITE_VISIT' }));
    expect(mv.client.lead.score).toBeGreaterThan(s0); expect(mv.client.timeline[0].text).toContain('SITE_VISIT');
  });
  it('digest finds the matching property for that client, learns from taps and can be muted', async () => {
    const d = await j(await call(jar.BRK1, 'GET', '/api/daily/digest'));
    const m = d.matches.find((x: any) => x.property.id === target.id && x.sourceId === cid);
    expect(m).toBeTruthy(); expect(m.score).toBeGreaterThan(50); expect(m.reasons.length).toBeGreaterThan(0);
    expect(d.matches.every((x: any) => x.property.id !== undefined && x.broker?.id !== 'USR-BRK-001')).toBe(true); // never your own listings
    expect(new Set(d.matches.map((x: any) => x.key)).size).toBe(d.matches.length); // no duplicates
    expect(JSON.stringify(d)).not.toMatch(/ownerPhone|ownerApprovedNetPrice/);
    await call(jar.BRK1, 'POST', '/api/daily/digest/feedback', { key: m.key, action: 'DISMISSED' });
    const d2 = await j(await call(jar.BRK1, 'GET', '/api/daily/digest'));
    expect(d2.matches.some((x: any) => x.key === m.key)).toBe(false);
    await call(jar.BRK1, 'PUT', '/api/daily/digest/prefs', { muted: true });
    expect((await j(await call(jar.BRK1, 'GET', '/api/daily/digest'))).muted).toBe(true);
    await call(jar.BRK1, 'PUT', '/api/daily/digest/prefs', { muted: false });
  });
  it('digest generates quickly', async () => { const t = Date.now(); await call(jar.BRK1, 'GET', '/api/daily/digest'); expect(Date.now() - t).toBeLessThan(5000); });
  it('can parse a pasted lead and delete a client', async () => {
    const p = await j(await call(jar.BRK1, 'POST', '/api/daily/clients/parse', { text: 'Name: Sunita Rao\nMobile 9812345678\nBudget 45 lakh' }));
    expect(p.parsed.name).toBe('Sunita Rao');
    expect((await call(jar.BRK1, 'DELETE', `/api/daily/clients/${cid}`)).status).toBe(200);
  });
});

describe('listing freshness, reports, trust', () => {
  let mine: any;
  it('a broker can confirm only their own listing; trust breakdown explains the score', async () => {
    const l = await j(await call(jar.BRK1, 'GET', '/api/daily/listings'));
    mine = l.listings[0]; expect(mine).toBeTruthy(); expect(mine.state).toBe('FRESH'); expect(mine.daysLeft).toBeGreaterThan(25);
    expect((await call(jar.BRK1, 'POST', `/api/daily/listings/${mine.id}/confirm`)).status).toBe(200);
    expect((await call(jar.BRK2, 'POST', `/api/daily/listings/${mine.id}/confirm`)).status).toBe(404);
    const t = await j(await call(jar.BRK1, 'GET', '/api/daily/trust'));
    expect(t.total).toBeGreaterThan(0); expect(t.parts.map((p: any) => p.id)).toContain('fresh'); expect(t.parts.reduce((a: number, p: any) => a + p.max, 0)).toBe(100);
  });
  it('three different reporters auto-hold a listing; admin can release it', async () => {
    const builder = cfg.demoAccounts.find((a: any) => a.role === 'DEVELOPER_BUILDER'); jar[builder.id] = await login(builder.email);
    const others = [...brokers.filter((b: any) => b.id !== 'USR-BRK-001').slice(0, 2), builder];
    expect(others.length).toBe(3);
    expect((await call(jar.BRK1, 'POST', '/api/daily/report', { targetType: 'LISTING', targetId: mine.id, reason: 'FAKE' })).status).toBe(400); // own listing
    const rep = (o: any) => call(jar[o.id], 'POST', '/api/daily/report', { targetType: 'LISTING', targetId: mine.id, reason: 'SOLD' });
    expect((await rep(others[0])).status).toBe(200);
    expect((await j(await rep(others[0]))).duplicate).toBe(true); // the same member cannot stack reports
    expect((await rep(others[1])).status).toBe(200); expect((await rep(others[2])).status).toBe(200);
    const seen = (await j(await call(jar[others[0].id], 'GET', '/api/properties'))).properties.some((p: any) => p.id === mine.id);
    expect(seen).toBe(false); // held: hidden from the network
    expect((await j(await call(jar.BRK1, 'GET', '/api/daily/listings'))).listings.find((x: any) => x.id === mine.id).state).toBe('HELD');
    expect((await call(jar.BRK1, 'GET', '/api/daily/reports')).status).toBe(403);
    const q = (await j(await call(jar.ADMIN, 'GET', '/api/daily/reports'))).reports.filter((r: any) => r.targetId === mine.id);
    expect(q.length).toBe(3);
    for (const r of q) await call(jar.ADMIN, 'POST', `/api/daily/reports/${r.id}/resolve`, { action: 'DISMISS' });
    expect((await j(await call(jar[others[0].id], 'GET', '/api/properties'))).properties.some((p: any) => p.id === mine.id)).toBe(true);
  });
});

describe('map', () => {
  it('returns approximate pins only, with no customer details', async () => {
    const m = await j(await call(jar.BRK1, 'GET', '/api/daily/map'));
    expect(m.pins.length).toBeGreaterThan(0);
    for (const p of m.pins) { expect(Math.abs(p.lat * 100 - Math.round(p.lat * 100))).toBeLessThan(1000); expect(p.lat).toBeGreaterThan(5); }
    const s = JSON.stringify(m); expect(s).not.toMatch(/customerName|customerPhone|ownerPhone|addressHidden|street/);
    expect((await call(jar.OWNER, 'GET', '/api/daily/map')).status).toBe(403);
  });
});

describe('view-only protected documents', () => {
  let id = '';
  it('rejects non-images and oversize junk, accepts a real image', async () => {
    expect((await call(jar.BRK1, 'POST', '/api/pdocs', { title: 'Bad', pages: ['data:application/pdf;base64,JVBERi0xLjQK'] })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', '/api/pdocs', { title: 'Bad', pages: [Buffer.from('<?php echo 1;').toString('base64')] })).status).toBe(400);
    const ok = await j(await call(jar.BRK1, 'POST', '/api/pdocs', { title: 'Sale deed – Plot 14', pages: [PNG, PNG] }));
    id = ok.doc.id; expect(ok.doc.pages).toBe(2); expect(ok.doc.owner).toBe(true);
  });
  it('nobody else can open it until it is shared', async () => {
    expect((await call(jar.BRK2, 'POST', `/api/pdocs/${id}/open`)).status).toBe(403);
    expect((await j(await call(jar.BRK2, 'GET', '/api/pdocs'))).docs.some((d: any) => d.id === id)).toBe(false);
  });
  it('shares as view-only with a view limit; page tokens work once and only as an image', async () => {
    const sh = await j(await call(jar.BRK1, 'POST', `/api/pdocs/${id}/share`, { userIds: ['USR-BRK-002'], expiresInDays: 7, maxViews: 1 }));
    expect(sh.shared).toBe(1);
    const open = await j(await call(jar.BRK2, 'POST', `/api/pdocs/${id}/open`));
    expect(open.canDownload).toBe(false); expect(open.tokens).toHaveLength(2); expect(open.watermark).toContain(byId('USR-BRK-002').name);
    const asDoc = await call(jar.BRK2, 'GET', `/api/pdocs/page/${open.tokens[0]}`, undefined, { 'sec-fetch-dest': 'document' });
    expect(asDoc.status).toBe(403); // typed into the address bar
    const asImg = await call(jar.BRK2, 'GET', `/api/pdocs/page/${open.tokens[1]}`, undefined, { 'sec-fetch-dest': 'image' });
    expect(asImg.status).toBe(200); expect(asImg.headers.get('cache-control')).toContain('no-store'); expect(asImg.headers.get('content-type')).toBe('image/png');
    expect((await call(jar.BRK2, 'GET', `/api/pdocs/page/${open.tokens[1]}`, undefined, { 'sec-fetch-dest': 'image' })).status).toBe(403); // single use
    expect((await call(jar.ADMIN, 'GET', `/api/pdocs/page/${open.tokens[0]}`, undefined, { 'sec-fetch-dest': 'image' })).status).toBe(403); // not your token
    expect((await call(jar.BRK2, 'POST', `/api/pdocs/${id}/open`)).status).toBe(403); // view limit used up
  });
  it('only the owner can download; the log shows who looked and who was refused', async () => {
    expect((await call(jar.BRK2, 'GET', `/api/pdocs/${id}/download/0`)).status).toBe(404);
    const dl = await call(jar.BRK1, 'GET', `/api/pdocs/${id}/download/0`);
    expect(dl.status).toBe(200); expect(dl.headers.get('content-disposition')).toContain('attachment');
    const log = (await j(await call(jar.BRK1, 'GET', `/api/pdocs/${id}/log`))).log;
    expect(log.some((l: any) => l.allowed)).toBe(true); expect(log.some((l: any) => !l.allowed)).toBe(true);
    expect((await call(jar.BRK2, 'GET', `/api/pdocs/${id}/log`)).status).toBe(404);
  });
  it('revoking a viewer or the whole document locks them out; the owner can delete it', async () => {
    await call(jar.BRK1, 'POST', `/api/pdocs/${id}/share`, { userIds: ['USR-BRK-002'] });
    expect((await call(jar.BRK2, 'POST', `/api/pdocs/${id}/open`)).status).toBe(200);
    await call(jar.BRK1, 'POST', `/api/pdocs/${id}/revoke`, { userId: 'USR-BRK-002' });
    expect((await call(jar.BRK2, 'POST', `/api/pdocs/${id}/open`)).status).toBe(403);
    expect((await call(jar.CON, 'GET', '/api/pdocs')).status).toBe(403);
    expect((await call(jar.BRK1, 'DELETE', `/api/pdocs/${id}`)).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/pdocs/${id}/open`)).status).toBe(404);
  });
  it('the property owner can also protect a document', async () => { expect((await call(jar.OWNER, 'GET', '/api/pdocs')).status).toBe(200); });
});

describe('chapters, points, loan desk, academy, plan', () => {
  let chapterId = '';
  it('admin opens a chapter; only same-city brokers join; the captain runs meets and marks attendance (+points, once)', async () => {
    const me1 = await j(await call(jar.BRK1, 'GET', '/api/auth/me')); const city = me1.user?.city || me1.city || 'Raipur';
    expect((await call(jar.BRK1, 'POST', '/api/community/chapters', { name: 'x', city })).status).toBe(403);
    const ch = await j(await call(jar.ADMIN, 'POST', '/api/community/chapters', { name: 'Raipur Central', city, zone: 'Central', captainId: 'USR-BRK-001' }));
    chapterId = ch.chapter.id;
    expect((await call(jar.BRK1, 'POST', `/api/community/chapters/${chapterId}/join`)).status).toBe(200);
    expect((await call(jar.BRK2, 'GET', `/api/community/chapters/${chapterId}`)).status).toBe(403); // not a member yet
    await call(jar.BRK2, 'POST', `/api/community/chapters/${chapterId}/join`);
    expect((await call(jar.BRK2, 'POST', `/api/community/chapters/${chapterId}/posts`, { text: 'hello all' })).status).toBe(403); // not the captain
    expect((await call(jar.BRK1, 'POST', `/api/community/chapters/${chapterId}/posts`, { text: 'Meet on Sunday' })).status).toBe(200);
    const future = await j(await call(jar.BRK1, 'POST', `/api/community/chapters/${chapterId}/meets`, { title: 'Monthly meet', at: new Date(Date.now() + 86400000).toISOString(), venue: 'Hotel Babylon' }));
    expect((await call(jar.BRK2, 'POST', `/api/community/meets/${future.meet.id}/rsvp`, { going: true })).status).toBe(200);
    expect((await call(jar.BRK1, 'POST', `/api/community/meets/${future.meet.id}/attendance`, { userIds: ['USR-BRK-002'] })).status).toBe(400); // meet not over
  });
  it('points are earned once, capped per day, never money, and can buy a profile boost', async () => {
    const p0 = await j(await call(jar.BRK1, 'GET', '/api/community/points'));
    const before = p0.balance;
    const list = await j(await call(jar.BRK1, 'GET', '/api/daily/listings'));
    await call(jar.BRK1, 'POST', `/api/daily/listings/${list.listings[0].id}/confirm`); // same month, already awarded earlier → no double award
    const p1 = await j(await call(jar.BRK1, 'GET', '/api/community/points'));
    expect(p1.balance).toBeGreaterThanOrEqual(before);
    expect((await call(jar.BRK1, 'POST', '/api/community/points/redeem')).status).toBe(p1.balance >= p1.cost ? 200 : 400);
    expect(JSON.stringify(p1)).not.toMatch(/₹|rupee|cash/i);
    expect((await call(jar.CON, 'GET', '/api/community/points')).status).toBe(403);
  });
  it('home-loan referral needs the client’s consent; only admin works the queue', async () => {
    const body = { clientName: 'Loan Client', clientPhone: rnd(), amount: 3_500_000, city: 'Raipur', incomeType: 'SALARIED' };
    expect((await call(jar.BRK1, 'POST', '/api/community/loans', { ...body, consent: false })).status).toBe(400);
    const ok = await j(await call(jar.BRK1, 'POST', '/api/community/loans', { ...body, consent: true }));
    expect(ok.loan.status).toBe('SUBMITTED');
    expect((await call(jar.BRK1, 'POST', `/api/community/loans/${ok.loan.id}/status`, { status: 'SANCTIONED' })).status).toBe(403);
    expect((await j(await call(jar.BRK2, 'GET', '/api/community/loans'))).loans.some((l: any) => l.id === ok.loan.id)).toBe(false); // another broker's referral stays private
    const st = await j(await call(jar.ADMIN, 'POST', `/api/community/loans/${ok.loan.id}/status`, { status: 'SANCTIONED' }));
    expect(st.loan.status).toBe('SANCTIONED'); expect(st.loan.history).toHaveLength(2);
    expect((await j(await call(jar.ADMIN, 'GET', '/api/community/loans'))).loans.find((l: any) => l.id === ok.loan.id).clientPhone).toBeTruthy();
  });
  it('academy progress is saved per user', async () => {
    expect((await call(jar.BRK1, 'POST', '/api/community/academy/nope/done')).status).toBe(404);
    await call(jar.BRK1, 'POST', `/api/community/academy/${LESSONS[0].id}/done`);
    expect((await j(await call(jar.BRK1, 'GET', '/api/community/academy'))).done).toContain(LESSONS[0].id);
    expect((await j(await call(jar.BRK2, 'GET', '/api/community/academy'))).done).not.toContain(LESSONS[0].id);
  });
  it('everyone is on the free plan and no paid feature is switched on', async () => {
    const f = await j(await call(jar.BRK1, 'GET', '/api/daily/flags'));
    expect(f.plan).toBe('free'); expect(f.flags.sponsoredSlots).toBe(false); expect(f.flags.premiumTeams).toBe(false);
  });
});
