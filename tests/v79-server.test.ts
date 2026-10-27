import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * v79 — against a real server:
 *  (1) a visit the viewer cannot confirm says WHY (booker / too early / window / buyer tick) and offers a way forward: remind the property side,
 *      or move the visit to a new time (same pass, fresh 24 h) — while the maker ≠ checker rule stays exactly as it was;
 *  (2) a booked visit gives its booker the map PIN (never the written address); the property side's own location card carries his pin;
 *  (3) a builder's UNIT card opens the unit's details for his partner (price only if the builder allows it);
 *  (4) the Home counters are also lines in the notification bell (and a removed line comes back only when its number grows);
 *  (5) the shared city report points to the sharer's public page.
 */
const PORT = 8100 + Math.floor(Math.random() * 60);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (c: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const j = (r: Response) => r.json();
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function login(who: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === who);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a ? a.email : who, password: cfg.demoPassword }) });
  expect(r.status, who).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const HI = /[ऀ-ॿ]/;
const B1 = 'USR-BRK-001'; const B2 = 'USR-BRK-002'; const B3 = 'USR-BRK-003'; const OWN = 'USR-OWNER-001'; const BLD = 'USR-BUILDER-001';
const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const MAPS = 'https://maps.google.com/?q=21.2514,81.6296';

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v79-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, stdio: 'ignore',
    env: { ...process.env, KYC_VAULT_KEY: 'c4'.repeat(32), SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' },
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  expect(cfg).toBeTruthy();
  const ids: Record<string, string> = { S1: B1, S2: B2, S3: B3, OWN, BLD, ADMIN: 'USR-ADMIN-1', BUYER: 'USR-BUYER-001' };
  for (const [k, id] of Object.entries(ids)) jar[k] = await login(id);
  for (const k of ['S1', 'S2', 'S3', 'OWN']) await call(jar[k], 'PUT', '/api/push/prefs', { quiet: false, deals: true });
}, 120_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

const props = async (who: string) => (await j(await call(jar[who], 'GET', '/api/properties'))).properties as any[];
const visitsOf = async (who: string) => (await j(await call(jar[who], 'GET', '/api/site-visits'))).siteVisits as any[];
const bookVisit = async (who: string, propertyId: string, hours: number, extra: Record<string, unknown> = {}) => {
  const r = await call(jar[who], 'POST', '/api/site-visits', { propertyId, customerName: 'Mahesh Verma', scheduledTime: inHours(hours), ...extra });
  const d = await j(r); expect(r.status, JSON.stringify(d)).toBe(200); return d;
};
let PA = ''; let PB = ''; let DEAL = ''; let V1 = ''; let V1qr = '';

// ───────────────────────── 1 · why a visit cannot be confirmed, and the way forward ─────────────────────────
describe('a visit says who can confirm it, and what to do when you cannot', () => {
  it('setup: two verified listings of the listing broker (owner = the demo owner)', async () => {
    const l = (await props('S1')).filter(p => p.listingBrokerId === B1 && p.ownerId === OWN && p.verificationStatus === 'VERIFIED' && p.listingStatus === 'active');
    expect(l.length).toBeGreaterThanOrEqual(2); PA = l[0].id; PB = l[1].id;
    for (const id of [PA, PB]) expect((await call(jar.S1, 'PUT', `/api/properties/${id}`, { googleMapsUrl: MAPS })).status, id).toBe(200);
  });
  it('the broker who books it sees "MAKER_CHECKER" before he taps; the listing broker and the owner see "OK"', async () => {
    const d = await bookVisit('S2', PA, 2);
    V1 = d.siteVisit.id; DEAL = d.siteVisit.dealRoomId; expect(DEAL).toMatch(/^DEAL-/);
    expect(d.siteVisit.gate).toMatchObject({ code: 'MAKER_CHECKER', ok: false, iAmBooker: true });
    const mine = (await visitsOf('S2')).find(v => v.id === V1); expect(mine.gate).toMatchObject({ code: 'MAKER_CHECKER', iAmBooker: true });
    V1qr = mine.qrToken; expect(V1qr).toBeTruthy();                                              // the booker holds the buyer's pass (demo)
    for (const who of ['S1', 'OWN']) { const v = (await visitsOf(who)).find(x => x.id === V1); expect(v, who).toBeTruthy(); expect(v.gate, who).toMatchObject({ code: 'OK', ok: true, propertySide: true, iAmBooker: false }); }
    expect((await visitsOf('S3')).some(v => v.id === V1)).toBe(false);                            // a stranger does not even see it
  });
  it('the server still refuses the booker — and a stranger — exactly as before (the rule did not move)', async () => {
    for (const path of ['verify-otp', 'checkin-qr']) {
      const r = await call(jar.S2, 'POST', `/api/site-visits/${V1}/${path}`, { otpCode: '000000', qrToken: V1qr });
      expect(r.status, path).toBe(403); expect((await j(r)).code, path).toBe('MAKER_CHECKER');
      const s = await call(jar.S3, 'POST', `/api/site-visits/${V1}/${path}`, { otpCode: '000000', qrToken: V1qr });
      expect(s.status, path).toBe(403); expect((await j(s)).code, path).toBe('PROPERTY_SIDE_ONLY');
    }
  });
  it('REMIND: only the booker, only the property side hears it (phone alert + bell, in Hindi too), and not twice in a row', async () => {
    const r = await call(jar.S2, 'POST', `/api/site-visits/${V1}/remind`); expect(r.status).toBe(200); expect((await j(r)).notified).toBe(2);   // the owner + the listing broker
    const again = await call(jar.S2, 'POST', `/api/site-visits/${V1}/remind`); expect(again.status).toBe(429); expect((await j(again)).code).toBe('REMIND_WAIT');
    for (const who of ['S1', 'OWN']) {
      const en = (await j(await call(jar[who], 'GET', '/api/inbox?lang=en'))).items.find((x: any) => x.title.includes(V1));
      expect(en, who).toMatchObject({ read: false, url: `/?tab=deals&deal=${DEAL}` }); expect(en.title).toMatch(/Please confirm visit/);
      const hi = (await j(await call(jar[who], 'GET', '/api/inbox?lang=hi'))).items.find((x: any) => x.title.includes(V1)); expect(HI.test(hi.title), who).toBe(true);
      expect(en.body).toContain('M. V.');                                                          // the buyer by initials, never a full name
    }
    expect((await call(jar.S1, 'POST', `/api/site-visits/${V1}/remind`)).status).toBe(403);       // not the booker
    expect((await j(await call(jar.S1, 'POST', `/api/site-visits/${V1}/remind`))).code).toBe('NOT_BOOKER');
    expect((await call(jar.S3, 'POST', `/api/site-visits/${V1}/remind`)).status).toBe(403);
    expect((await call(jar.S2, 'POST', '/api/site-visits/SV-0000/remind')).status).toBe(404);
  });
  it('RESCHEDULE: only the booker; a sane time only; the same pass, a new window; the property side is told; the chat card follows', async () => {
    expect((await call(jar.S1, 'POST', `/api/site-visits/${V1}/reschedule`, { scheduledTime: inHours(3) })).status).toBe(403);
    expect((await call(jar.S3, 'POST', `/api/site-visits/${V1}/reschedule`, { scheduledTime: inHours(3) })).status).toBe(403);
    for (const bad of [inHours(-6), inHours(24 * 31), 'tomorrow-ish', '']) {
      const r = await call(jar.S2, 'POST', `/api/site-visits/${V1}/reschedule`, { scheduledTime: bad }); expect(r.status, String(bad)).toBe(400); expect((await j(r)).code).toBe('BAD_TIME');
    }
    const cardBefore = (await j(await call(jar.S2, 'GET', `/api/deals/${DEAL}/messages`))).messages.find((m: any) => m.kind === 'VISIT' && m.refId === V1);
    const when = inHours(30 * 24);
    const r = await j(await call(jar.S2, 'POST', `/api/site-visits/${V1}/reschedule`, { scheduledTime: when }));
    expect(r.success).toBe(true); expect(r.siteVisit.scheduledTime).toBe(when); expect(r.siteVisit.otpExpiresAt).toBe(new Date(Date.parse(when) + 24 * 3600_000).toISOString());
    expect(r.siteVisit.qrToken).toBe(V1qr);                                                        // the SAME pass — the buyer's link and QR still work
    const cardAfter = (await j(await call(jar.S2, 'GET', `/api/deals/${DEAL}/messages`))).messages.find((m: any) => m.kind === 'VISIT' && m.refId === V1);
    expect(cardAfter.text).not.toBe(cardBefore.text);
    const moved = (await j(await call(jar.OWN, 'GET', '/api/inbox'))).items.find((x: any) => /moved to/.test(x.title) && x.title.includes(V1)); expect(moved).toBeTruthy();
    // a month away → "too early" for the property side, said before he taps and by the server if he taps anyway
    expect((await visitsOf('S1')).find(v => v.id === V1).gate.code).toBe('TOO_EARLY');
    const early = await call(jar.S1, 'POST', `/api/site-visits/${V1}/checkin-qr`, { qrToken: V1qr }); expect(early.status).toBe(400); expect((await j(early)).code).toBe('TOO_EARLY');
    // and back to "in an hour": it opens for the property side again
    expect((await call(jar.S2, 'POST', `/api/site-visits/${V1}/reschedule`, { scheduledTime: inHours(1) })).status).toBe(200);
    expect((await visitsOf('S1')).find(v => v.id === V1).gate.code).toBe('OK');
  });
  it('the property side confirms with the buyer\'s QR — it works exactly as before; afterwards neither remind nor reschedule', async () => {
    const wrong = await call(jar.S1, 'POST', `/api/site-visits/${V1}/checkin-qr`, { qrToken: 'not-the-secret' }); expect(wrong.status).toBe(400);
    const ok = await call(jar.S1, 'POST', `/api/site-visits/${V1}/checkin-qr`, { qrToken: V1qr }); expect(ok.status, JSON.stringify(await ok.clone().json())).toBe(200);
    const v = (await visitsOf('S2')).find(x => x.id === V1); expect(v.isVerified).toBe(true); expect(v.gate.code).toBe('MAKER_CHECKER');
    expect((await visitsOf('S1')).find(x => x.id === V1).gate.code).toBe('DONE');
    expect((await call(jar.S2, 'POST', `/api/site-visits/${V1}/remind`)).status).toBe(409);
    expect((await call(jar.S2, 'POST', `/api/site-visits/${V1}/reschedule`, { scheduledTime: inHours(2) })).status).toBe(409);
    const again = await call(jar.S1, 'POST', `/api/site-visits/${V1}/checkin-qr`, { qrToken: V1qr }); expect(again.status).toBe(409);
  });
  it('a buyer who has not ticked "no direct deal" blocks confirming — and the gate says so', async () => {
    const d = await bookVisit('S2', PB, 1, { customerPhone: '9811122233' });
    const v = (await visitsOf('S1')).find(x => x.id === d.siteVisit.id); expect(v.ackStatus).toBe('PENDING'); expect(v.gate.code).toBe('ACK_REQUIRED');
    const r = await call(jar.S1, 'POST', `/api/site-visits/${v.id}/verify-otp`, { otpCode: '123456' }); expect(r.status).toBe(409); expect((await j(r)).code).toBe('ACK_REQUIRED');
  });
});

// ───────────────────────── 2 · the map pin ─────────────────────────
describe('a booked visit opens the map pin (never the written address)', () => {
  let PC = '';
  it('before a visit: no map link, only the rounded area', async () => {
    const l = (await props('S3')).filter(p => p.listingBrokerId === B2 && p.verificationStatus === 'VERIFIED' && p.listingStatus === 'active' && p.id !== PA && p.id !== PB);
    expect(l.length).toBeGreaterThan(0); PC = l[0].id;                                               // a listing of S2 — S3 and S1 are strangers to it
    expect((await call(jar.S2, 'PUT', `/api/properties/${PC}`, { googleMapsUrl: MAPS })).status).toBe(200);
    const p = (await j(await call(jar.S3, 'GET', `/api/properties/${PC}`))).property;
    expect(p.googleMapsUrl).toBe(''); expect(p.visitPin).toBeUndefined(); expect(p.addressHidden).toMatch(/^Address protected/);
  });
  it('after booking: the booker gets the pin, the written address and papers stay hidden, a stranger still gets nothing', async () => {
    await bookVisit('S3', PC, 4);
    const p = (await j(await call(jar.S3, 'GET', `/api/properties/${PC}`))).property;
    expect(p.visitPin).toBe(true); expect(p.googleMapsUrl).toBe(MAPS);
    expect(p.addressHidden).toMatch(/^Address protected/); expect(p.street).toBe(''); expect(p.documents).toEqual([]);
    const inList = (await props('S3')).find(x => x.id === PC); expect(inList.visitPin).toBe(true); expect(inList.googleMapsUrl).toBe(MAPS);
    const other = (await j(await call(jar.S1, 'GET', `/api/properties/${PC}`))).property;          // S1 has no visit on PC
    expect(other.googleMapsUrl).toBe(''); expect(other.visitPin).toBeUndefined();
  });
});

// ───────────────────────── 3 · the location card in the deal chat ─────────────────────────
describe('the location card carries the property side\'s own pin', () => {
  it('sent by the listing broker: the others in the room can open the exact pin', async () => {
    const r = await call(jar.S1, 'POST', `/api/deals/${DEAL}/messages`, { kind: 'LOCATION' }); expect(r.status).toBe(200);
    const m = (await j(r)).message; expect(m.kind).toBe('LOCATION'); expect(m.pin.url).toBe(MAPS);
    const seen = (await j(await call(jar.S2, 'GET', `/api/deals/${DEAL}/messages`))).messages.find((x: any) => x.kind === 'LOCATION');
    expect(seen.pin.url).toBe(MAPS);
  });
  it('sent by the broker who is not on the property side: no pin on the card (he can only point at what the reader may see)', async () => {
    const r = await call(jar.S2, 'POST', `/api/deals/${DEAL}/messages`, { kind: 'LOCATION', text: 'location again' }); expect(r.status).toBe(200);
    expect((await j(r)).message.pin).toBeUndefined();
  });
});

// ───────────────────────── 4 · a builder's unit card opens ─────────────────────────
describe('a unit card in the builder–partner chat opens its details', () => {
  let T = ''; let shared = ''; let notShared = ''; let projectId = '';
  it('only a unit that was really shared in THIS chat opens; the partner sees what the builder allows', async () => {
    T = (await j(await call(jar.S1, 'POST', '/api/partner-chats/open', { withId: BLD }))).id; expect(T).toMatch(/^PCH-/);
    const cards = (await j(await call(jar.BLD, 'GET', `/api/partner-chats/${T}/cards`))).units; expect(cards.length).toBeGreaterThan(1);
    shared = cards[0].refId; notShared = cards[1].refId;
    expect((await call(jar.BLD, 'POST', `/api/partner-chats/${T}/messages`, { card: { kind: 'UNIT', refId: shared } })).status).toBe(200);
    const r = await call(jar.S1, 'GET', `/api/partner-chats/${T}/unit/${shared}`); expect(r.status).toBe(200);
    const d = await j(r);
    expect(d.side).toBe('PARTNER'); expect(d.unit).toMatchObject({ id: shared, priceHidden: false }); expect(d.unit.price).toBeGreaterThan(0); expect(d.unit.label).toBeTruthy(); expect(d.unit.kind).toBeTruthy();
    expect(d.unit.status).toBeTruthy(); expect(d.project.projectName).toBeTruthy(); projectId = d.project.id;
    expect(JSON.stringify(d)).not.toMatch(/"hold"|"vis"|priceHistory|"brokerId"/);                     // no holds, no visibility rules, no other partner
    const no = await call(jar.S1, 'GET', `/api/partner-chats/${T}/unit/${notShared}`); expect(no.status).toBe(404); expect((await j(no)).code).toBe('UNIT_NOT_SHARED');
    expect((await call(jar.S1, 'GET', `/api/partner-chats/${T}/unit/UNIT-NOPE`)).status).toBe(404);
  });
  it('the builder opens it too; nobody outside the chat does', async () => {
    const d = await j(await call(jar.BLD, 'GET', `/api/partner-chats/${T}/unit/${shared}`)); expect(d.side).toBe('BUILDER'); expect(d.unit.price).toBeGreaterThan(0);
    for (const k of ['S2', 'S3']) expect((await call(jar[k], 'GET', `/api/partner-chats/${T}/unit/${shared}`)).status, k).toBe(404);
    for (const k of ['OWN', 'BUYER', 'ADMIN']) expect((await call(jar[k], 'GET', `/api/partner-chats/${T}/unit/${shared}`)).status, k).toBe(403);
    expect((await call(undefined, 'GET', `/api/partner-chats/${T}/unit/${shared}`)).status).toBe(401);
  });
  it('when the builder hides the price, the partner sees "price on request" — the builder still sees it', async () => {
    expect((await call(jar.BLD, 'PUT', `/api/inventory/projects/${projectId}/visibility`, { audience: 'ALL', brokerIds: [], priceHidden: true, clearOverrides: true })).status).toBe(200);
    const p = await j(await call(jar.S1, 'GET', `/api/partner-chats/${T}/unit/${shared}`)); expect(p.unit.priceHidden).toBe(true); expect(p.unit.price).toBeNull(); expect(p.unit.ratePerSqft).toBeUndefined();
    const b = await j(await call(jar.BLD, 'GET', `/api/partner-chats/${T}/unit/${shared}`)); expect(b.unit.priceHidden).toBe(false); expect(b.unit.price).toBeGreaterThan(0);
  });
});

// ───────────────────────── 5 · the Home counters are lines in the bell ─────────────────────────
describe('the Home counters are also in the notification bell', () => {
  const home = async (who: string) => j(await call(jar[who], 'GET', '/api/home/broker'));
  const bell = async (who: string, lang = 'en') => (await j(await call(jar[who], 'GET', `/api/inbox?lang=${lang}`)));
  const todo = (d: any, key: string) => d.items.find((x: any) => x.todo && x.url === ({ offersWaiting: '/?tab=deals&view=proposals' } as any)[key]);
  let O1 = ''; let O2 = '';
  it('every Home counter above zero has its bell line with the same number; none above zero is missing', async () => {
    const h = await home('S1'); const d = await bell('S1');
    const { HOME_TODOS, todoUrl } = await import('../src/shared/homeTodoRules.js');
    for (const def of HOME_TODOS) {
      const n = Number(h.counts[def.key]) || 0;
      const line = d.items.find((x: any) => x.todo && x.url === todoUrl(def));
      if (n > 0) { expect(line, def.key).toBeTruthy(); expect(line.n, def.key).toBe(n); } else expect(line, def.key).toBeFalsy();
    }
  });
  it('a new co-broking offer makes the offers line (and the badge) appear, in Hindi too', async () => {
    const mk = async (who: string, prop: string) => { const r = await call(jar[who], 'POST', '/api/collaborations', { propertyId: prop, receivingBrokerId: B1, proposedIntroducingShare: 50, proposedClosingShare: 50, terms: 'Split 50:50 on the brokerage' }); const x = await j(r); expect(r.status, JSON.stringify(x)).toBe(200); return x.offer?.id || x.id; };
    const before = (await home('S1')).counts.offersWaiting || 0;
    O1 = await mk('S3', PA);
    const h = await home('S1'); expect(h.counts.offersWaiting).toBe(before + 1);
    const d = await bell('S1'); const line = todo(d, 'offersWaiting'); expect(line).toMatchObject({ n: before + 1, read: false }); expect(line.title).toMatch(/co-broking offer/); expect(line.body).toContain(String(before + 1));
    const hi = todo(await bell('S1', 'hi'), 'offersWaiting'); expect(HI.test(hi.title) && HI.test(hi.body)).toBe(true);
    // and the whole Home still matches the bell, line for line
    const { HOME_TODOS, todoUrl } = await import('../src/shared/homeTodoRules.js');
    let withNumber = 0;
    for (const def of HOME_TODOS) {
      const n = Number(h.counts[def.key]) || 0; const l = d.items.find((x: any) => x.todo && x.url === todoUrl(def));
      if (n > 0) { withNumber++; expect(l, def.key).toBeTruthy(); expect(l.n, def.key).toBe(n); } else expect(l, def.key).toBeFalsy();
    }
    expect(withNumber).toBeGreaterThan(0); expect(d.unread).toBeGreaterThan(0);
  });
  it('read it, remove it: it stays away while the number does not grow; a second offer brings it back unread', async () => {
    const line = todo(await bell('S1'), 'offersWaiting');
    await call(jar.S1, 'POST', '/api/inbox/read', { ids: [line.id] });
    expect(todo(await bell('S1'), 'offersWaiting').read).toBe(true);
    expect((await call(jar.S1, 'DELETE', `/api/inbox/${line.id}`)).status).toBe(200);
    expect(todo(await bell('S1'), 'offersWaiting')).toBeFalsy();
    await home('S1');                                                                                  // the Home loads again: the counter is still there, the bell line stays removed
    expect(todo(await bell('S1'), 'offersWaiting')).toBeFalsy();
    expect((await call(jar.S1, 'DELETE', `/api/inbox/${line.id}`)).status).toBe(404);                // already gone from his view
    O2 = await (async () => { const r = await call(jar.S2, 'POST', '/api/collaborations', { propertyId: PB, receivingBrokerId: B1, proposedIntroducingShare: 50, proposedClosingShare: 50, terms: 'Split 50:50 on the brokerage' }); const x = await j(r); expect(r.status, JSON.stringify(x)).toBe(200); return x.offer?.id || x.id; })();
    await home('S1');
    const back = todo(await bell('S1'), 'offersWaiting'); expect(back).toMatchObject({ read: false }); expect(back.n).toBeGreaterThanOrEqual(2);
  });
  it('"Clear all" clears the bell; the to-do lines stay out of sight until a number grows; other people\'s bells are untouched', async () => {
    const other = (await bell('S2')).items.length;
    const r = await j(await call(jar.S1, 'DELETE', '/api/inbox')); expect(r).toMatchObject({ success: true, unread: 0 }); expect(r.cleared).toBeGreaterThan(0);
    await home('S1'); expect((await bell('S1')).items).toEqual([]);
    expect((await bell('S2')).items.length).toBe(other);
  });
  it('when the offers are answered the line goes away for good', async () => {
    for (const id of [O1, O2]) { const r = await call(jar.S1, 'POST', `/api/collaborations/${id}/respond`, { decision: 'REJECT', notes: 'Not now' }); expect(r.status, id).toBe(200); }
    const h = await home('S1'); expect(h.counts.offersWaiting || 0).toBe(0);
    expect(todo(await bell('S1'), 'offersWaiting')).toBeFalsy();
  });
  it('only a verified broker has such lines — an owner, a builder and the buyer get none', async () => {
    for (const k of ['OWN', 'BLD', 'BUYER', 'ADMIN']) { const d = await bell(k); expect(d.items.some((x: any) => x.todo), k).toBe(false); }
  });
});

// ───────────────────────── 6 · the shared city report points to the sharer's page ─────────────────────────
describe('the shared report opens the sharer\'s public page', () => {
  const get = async (p: string) => { const r = await fetch(B + p); return { status: r.status, html: await r.text() }; };
  it('Home: his page is ON, so that is what the WhatsApp button shares (refCode is his page code)', async () => {
    const h = await j(await call(jar.S1, 'GET', '/api/home/broker')); expect(h.page.on).toBe(true); expect(h.refCode).toMatch(/^GZ-/);
    const pg = await get(`/c/${h.refCode}`); expect(pg.status).toBe(200);
    expect(pg.html).toContain(`/report/`); expect(pg.html).toContain(`ref=${encodeURIComponent(h.refCode)}`);   // the page links to the city report
  });
  it('the report shared with ?ref= of a broker whose page is on has a "Shared by … see his homes" card to /c/<code>', async () => {
    const h = await j(await call(jar.S1, 'GET', '/api/home/broker'));
    const r = await get(`/report/Raipur?ref=${h.refCode}`); expect(r.status).toBe(200);
    expect(r.html).toContain('data-testid="report-sharedby"'); expect(r.html).toContain(`href="/c/${h.refCode}"`); expect(r.html).toMatch(/Vikramaditya/); expect(r.html).toMatch(/homes &amp; ask/);
  });
  it('no ref, a wrong ref, or a broker whose page is OFF: the plain report (no card)', async () => {
    for (const q of ['', '?ref=GZ-NOPE-0000', '?ref=<script>']) { const r = await get(`/report/Raipur${q}`); expect(r.status, q).toBe(200); expect(r.html, q).not.toContain('report-sharedby'); }
    const off = await j(await call(jar.S3, 'GET', '/api/home/broker'));
    if (!off.page?.on && off.refCode) { const r = await get(`/report/Raipur?ref=${off.refCode}`); expect(r.html).not.toContain('report-sharedby'); }
  });
});
