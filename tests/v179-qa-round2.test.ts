/** v179 — QA round 2: security (S1-S8) and the GENZ assistant (B1-B10). Pure functions in-process; module behaviour in a child process with its own empty data dir; the rest are source guards. */
import { describe, it, expect, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findOwnerContact, parseOne, findPrice, findBudget, bareRent, parsePaste } from '../src/shared/waParse';
import { readIntent, readNeedChange, findArea } from '../src/shared/sahayak';
import { maskKycFor, maskPan } from '../server/kyc';
import { applyAnswer } from '../src/shared/listingAsk';
import { setQueueUser, enqueue, readQueue, pendingCount } from '../src/lib/offline';

const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');
const imp = (f: string) => JSON.stringify(path.join(root, f));
const ms = (f: () => unknown) => { const t = Date.now(); f(); return Date.now() - t; };

describe('S1 PAN is masked for everyone but SUPERADMIN', () => {
  const u = { id: 'U1', panNumber: 'ABCDE1234F', name: 'x' };
  it('ADMIN gets a masked PAN, SUPERADMIN the real one, a record without PAN is untouched', () => {
    expect(maskKycFor(u, { role: 'ADMIN' }).panNumber).toBe(maskPan('ABCDE1234F')); expect(maskKycFor(u, { role: 'ADMIN' }).panNumber).not.toContain('CDE123');
    expect(maskKycFor(u, { role: 'SUPERADMIN' }).panNumber).toBe('ABCDE1234F');
    const n: { id: string; panNumber?: string } = { id: 'U2' }; expect(maskKycFor(n, { role: 'ADMIN' })).toBe(n);
    expect(u.panNumber).toBe('ABCDE1234F');   // the stored record is never changed
  });
  it('every route that lists / opens another member runs through the mask; the admin directory cache is split by viewer', () => {
    const s = read('server.ts');
    expect(s).toContain('state.users.map(u => enrichFor(u, me, state))');
    expect(s).toContain('dirCacheAdmin.sa !== sa');
    expect(s).toContain('user: enrichFor(target, c.user, db.getState())');                                  // impersonate
    expect(s).toContain('isAdmin(currentUser) ? enrichFor(b, currentUser, state)');                          // builder associates
    expect(s).toContain('isAdmin(viewer) ? enrichFor(u, viewer, state)');                                    // deal parties
    expect(s).not.toMatch(/state\.users\.map\(u => enrichUserWithTrustScore\(u, state\)\)/);
  });
});

describe('S2 / S3 findOwnerContact: no backtracking blow-up, label words are not names', () => {
  for (const [label, ch] of [['spaces', ' '], ['tabs', '\t']] as const) {
    it(`20k ${label} finish fast in every reader the paste route reaches`, () => {
      for (const pre of ['owner', 'owner ramesh', 'मालिक', '3bhk 5', 'Rs 5', '5 lakh']) {
        const t = pre + ch.repeat(20000) + '1';
        expect(ms(() => findOwnerContact(t)), `findOwnerContact ${pre}`).toBeLessThan(200);
        expect(ms(() => findPrice(t)), `findPrice ${pre}`).toBeLessThan(200);
        expect(ms(() => findBudget(t)), `findBudget ${pre}`).toBeLessThan(200);
        expect(ms(() => bareRent(t)), `bareRent ${pre}`).toBeLessThan(200);
        expect(ms(() => parseOne(t)), `parseOne ${pre}`).toBeLessThan(200);
        expect(ms(() => parsePaste(t)), `parsePaste ${pre}`).toBeLessThan(200);
      }
    });
  }
  it('a normal contact is still found, a label is never the name', () => {
    expect(findOwnerContact('3BHK Shankar Nagar 85 L. Owner Ramesh Patel 98765 43210')).toEqual({ name: 'Ramesh Patel', phone: '9876543210' });
    expect(findOwnerContact('Owner is out of town 9876543210')).toBeNull();
    for (const t of ['Owner contact: 9876543210', 'Owner mobile 9876543210', 'Owner ph 9876543210', 'Owner direct deal 9876543210', 'मालिक नंबर 9876543210']) expect(findOwnerContact(t), t).toEqual({ name: null, phone: '9876543210' });
    expect(findOwnerContact('Owner ph Ramesh 98765 43210')).toEqual({ name: 'Ramesh', phone: '9876543210' });
    expect(parseOne('2bhk flat for sale Shankar Nagar Raipur 45 lakh. Owner contact: 9876543210').ownerPhone).toBe('9876543210');
  });
});

describe('S4 / S5 / S7 / S8 wiring', () => {
  it('OTP cap per (IP, number) with the real wait, per-IP wrong-guess limiter, OtpStep says tomorrow from 1 h', () => {
    const o = read('server/otpManual.ts');
    expect(o).toContain('r.locked && r.ip === ip'); expect(o).toContain('+ DAY - now) / 1000)'); expect(o).toContain('WRONG_PER_IP = 30'); expect(o).toContain("'IP_WRONG'");
    expect(read('src/components/OtpStep.tsx')).toContain('wait >= 3600 ?');
    expect(read('server/ownerlist.ts')).toContain("issueOtp(phone, 'owner', Date.now(), req.ip)");
  });
  it('TRUST_PROXY is trimmed once, used for both, and > 2 warns', () => {
    const s = read('server.ts');
    expect(s).toContain("const TRUST_PROXY = (process.env.TRUST_PROXY || '').trim()"); expect(s).toContain('Number(TRUST_PROXY) > 2'); expect(s).toContain('[config] TRUST_PROXY=');
    expect(s).not.toContain('process.env.TRUST_PROXY ===');
  });
  it('reschedule uses the same VISIT_PAST rule as booking', () => {
    const s = read('server.ts'); const i = s.indexOf("'/api/site-visits/:id/reschedule'");
    expect(s.indexOf("code: 'VISIT_PAST'", i)).toBeGreaterThan(i); expect(s.indexOf("code: 'VISIT_PAST'", i)).toBeLessThan(s.indexOf("code: 'LOCKED'", i));
  });
  it('PAN_REVEALED once per 10 min, no devCode in sessionStorage, SMS_WEBHOOK_URL is a secret', () => {
    expect(read('server/idreview.ts')).toContain('panSeenOnce(me().id, u.id)');
    expect(read('src/components/OwnerListings.tsx')).toContain('otpV: { ...r, devCode: undefined }');
    expect(read('server/apiKeys.ts')).toMatch(/SMS_WEBHOOK_URL[^}]*secret: true/);
  });
  it('consent withdrawal: no self-resolve, sets the flag, pushes respect it', () => {
    const p = read('server/privacy.ts');
    expect(p).toContain('actor.id === pr.userId'); expect(p).toContain("code: 'SELF_RESOLVE'"); expect(p).toContain('t.consentWithdrawnAt = at'); expect(p).toContain('t.consent.withdrawnAt = at');
    expect(read('server/webpush.ts')).toContain("who.consentWithdrawnAt && ['broadcast', 'digest', 'matches', 'community']");
  });
});

describe('S6 offline queue survives sign-out checks', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    (globalThis as any).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  });
  it('the legacy shared queue is moved into the user key (not dropped), and never over an existing queue', () => {
    localStorage.setItem('genz.pending.v1', JSON.stringify([{ kind: 'add', body: { name: 'old' } }]));
    setQueueUser('U1'); expect(pendingCount()).toBe(1); expect(localStorage.getItem('genz.pending.v1')).toBeNull();
    localStorage.setItem('genz.pending.v1', JSON.stringify([{ kind: 'add', body: { name: 'older' } }]));
    setQueueUser('U1'); expect(readQueue()).toHaveLength(1); expect((readQueue()[0] as any).body.name).toBe('old'); expect(localStorage.getItem('genz.pending.v1')).toBeNull();
  });
  it('sign-out flushes first and warns with the unsent count', () => {
    const a = read('src/App.tsx');
    expect(a).toContain('await flushQueue('); expect(a).toContain('entries are not sent yet. They stay on this phone'); expect(a).toContain('एंट्री अभी भेजी नहीं गई हैं');
    expect(a).not.toContain('clearQueue(');   // v181
    setQueueUser('U9'); enqueue({ kind: 'add', body: {} }); expect(pendingCount()).toBe(1);
  });
});

describe('B1 "please" is not a rent need', () => {
  it('a word must start at a word edge', () => {
    for (const t of ['please', 'please stop', 'release', 'pleased', 'different flat']) expect(readNeedChange(t).kind, t).toBeUndefined();
    for (const [t, k] of [['rent', 'RENT_IN'], ['lease', 'RENT_IN'], ['kiraye chahiye', 'RENT_IN'], ['किराये पर चाहिए', 'RENT_IN'], ['flat for sale', 'BUY']] as const) expect(readNeedChange(t).kind, t).toBe(k);
  });
});

describe('B2 filler words are never an area', () => {
  it('Devanagari need sentence keeps only the place', () => {
    expect(readNeedChange('मुझे 3 बीएचके चाहिए शंकर नगर में 80 लाख तक', 'Raipur')).toMatchObject({ bhk: 3, budget: '80 लाख', locality: 'Shankar Nagar' });
    expect(findArea('मुझे 3 बीएचके चाहिए शंकर नगर में 80 लाख तक')).toBe('शंकर नगर');
  });
  it('commands are not places', () => {
    for (const t of ['call me', 'dont message me', "don't message me", 'send me 9876543210', 'tell me a joke', 'message me', 'bhejo me']) expect(findArea(t, 'Raipur'), t).toBeUndefined();
    expect(findArea('2bhk Whitefield mein chahiye')).toBe('Whitefield');
  });
});

describe('B4 loan / legal questions are the broker\'s', () => {
  it('not answered as "available"', () => {
    for (const t of ['loan mil jayega?', 'home loan available?', 'registry clear hai kya', 'RERA available?', 'parking available?', 'title clear hai?']) expect(readIntent(t), t).toBe('PROPERTY_Q');
    expect(readIntent('is it available?')).toBe('AVAIL');
    expect(readIntent('2bhk with parking 50 lakh chahiye')).toBe('NEED');
  });
});

describe('B8 opt-out phrases', () => {
  it('goodbyes stop; ordinary sentences with "stop" / "nahi chahiye" do not', () => {
    for (const t of ['not interested', 'nahi chahiye', 'nahin chahiye', 'band karo', 'बंद करो', 'ab nahi lena', 'please stop', "don't contact me", 'dont message me', 'remove me', 'mujhe nahi chahiye', 'रुको', 'मत भेजो', 'नहीं चाहिए', 'stop']) expect(readIntent(t), t).toBe('STOP');
    for (const t of ["don't stop calling me", 'bus stop near the house', 'villa nahi chahiye, flat chahiye', 'not interested in 2bhk, show 3bhk', 'please', 'please stop by tomorrow']) expect(readIntent(t), t).not.toBe('STOP');
  });
});

describe('B9 owner interview', () => {
  it('floor / area / price must look like what is asked; the net price is never copied from the asking price', () => {
    const f: Record<string, any> = { propertyType: 'Residential Flat', transactionType: 'Sale' };
    expect(applyAnswer(f, 'floor', { text: 'asdf qwer' }).ok).toBe(false);
    expect(applyAnswer(f, 'area', { text: 'asdf qwer' }).ok).toBe(false);
    expect(applyAnswer(f, 'price', { text: 'asdf qwer' }).ok).toBe(false);
    const r: any = applyAnswer(f, 'floor', { text: '3rd floor' }); expect(r.ok).toBe(true);
    const bi: any = applyAnswer(r.fields, 'floor', { text: 'asdf qwer' }); expect(bi.hint.hi).toMatch(/[ऀ-ॿ]/); expect(bi.hint.en).toMatch(/floor/i);
    const p: any = applyAnswer(f, 'price', { text: '45 lakh' }); expect(p.ok).toBe(true); expect(p.fields.askingPrice).toBe(4500000); expect(p.fields.ownerApprovedNetPrice).toBeUndefined();
    expect(read('server/shopPartners.ts')).not.toContain('ownerApprovedNetPrice: price');
  });
});

// ── module behaviour: the assistant and the budget rules, in a child process with an empty data dir ──
const SCRIPT = `(async () => {
const { homeFits, parseMoney, budgetRupees, BUDGET_SLACK } = await import(${imp('server/shopPartners.ts')});   // first: sahayak <-> shopPartners import each other
const { makeSahayak } = await import(${imp('server/sahayak.ts')});
const { db } = await import(${imp('server/db.ts')});
const out: Record<string, any> = {}; const st: any = db.getState();
const prop = (id: string, price: number, extra: any = {}) => ({ id, title: 'Home ' + id, askingPrice: price, listingStatus: 'active', city: 'Raipur', locality: 'Shankar Nagar', transactionType: 'Sale', propertyType: 'Residential Flat', ...extra });
const H = [prop('P1', 28500000), prop('P2', 5000000), prop('P3', 5500000), prop('P4', 6000000), prop('P5', 6300000)];
st.properties.push(...H); let homes: any[] = H; const told: string[] = [];
const deps: any = { addMsg: (l: any, m: any) => { l.chat.msgs.push({ at: new Date().toISOString(), ...m }); }, hist() {}, matchesFor: () => homes, heldElsewhere: () => 0, needLine: () => 'need', shareHome: (l: any, h: any) => deps.addMsg(l, { by: 'BOT', kind: 'HOME', homeId: h.id, text: h.title, title: h.title }),
  ownerSide: () => false, broker: () => ({ name: 'Anil', sahayakOff: false }), tellBroker: (_l: any, t: string) => { told.push(t); }, visitAgreed() {}, audit() {}, isLive: (h: any) => !!h && h.listingStatus === 'active', media: () => ({ photos: 0, videos: 0 }), ping() {},
  applyNeed: () => [], networkScan: () => null, cityOf: () => 'Raipur', ownerFacts: () => ({}), saveDraft: () => ({ error: 'x' }), draftState: () => null, budgetOf: (l: any) => budgetRupees(l.budget, false) };
const bot = makeSahayak(deps);
const mk = (extra: any = {}, bot0: any = {}) => ({ id: 'L' + Math.random(), brokerId: 'B', name: 'Ravi Kumar', kind: 'BUY', locality: 'Shankar Nagar', budget: '60 lakh', status: 'NEW', chat: { msgs: [] as any[], reqConfirmedAt: new Date().toISOString(), bot: bot0 }, ...extra }) as any;
const botMsgs = (l: any) => l.chat.msgs.filter((m: any) => m.by === 'BOT' && m.kind !== 'HOME');
const say = (l: any, t: string) => { deps.addMsg(l, { by: 'CUSTOMER', kind: 'MSG', text: t }); bot.onText(l, t); };

// budget readers
out.money = [parseMoney('60'), parseMoney('sixty lakh'), parseMoney('साठ लाख'), parseMoney('50L'), budgetRupees('60', false), budgetRupees('60', true), budgetRupees('sixty lakh', false), budgetRupees('साठ लाख', false), budgetRupees('', false), budgetRupees('kuch bhi', false)];
const lead = { kind: 'BUY', locality: 'Shankar Nagar', budget: '60', propertyType: '', homeId: '' } as any;
out.fits = [homeFits(lead, H[1]), homeFits(lead, H[4]), homeFits({ ...lead, budget: '55 lakh' }, H[3]), homeFits({ ...lead, budget: '55 lakh' }, prop('PX', 6200000)), homeFits({ ...lead, budget: 'साठ लाख' }, H[4]), homeFits(lead, H[0])]; out.slack = BUDGET_SLACK;

// B5: no budget -> never the dearest home, a few mid-range ones + the ask; over budget is named
{ const l = mk({ budget: '' }); bot.showHomes(l, 'BOT', 'first'); out.noBudgetSent = l.chat.msgs.filter((m: any) => m.kind === 'HOME').map((m: any) => m.homeId); out.noBudgetAsk = /बजट लिख/.test(botMsgs(l)[0]?.text) && /budget/.test(botMsgs(l)[0]?.en); }
{ homes = [H[0]]; const l = mk({ budget: '' }); bot.showHomes(l, 'BOT', 'first'); out.oneHomeNoBudget = [l.chat.msgs.filter((m: any) => m.kind === 'HOME').length, /बजट/.test(botMsgs(l)[0]?.text)]; homes = H; }
{ homes = [H[3]]; const l = mk({ budget: '55 lakh' }); bot.showHomes(l, 'BOT', 'first'); const m = botMsgs(l)[0]; out.over = [/थोड़ा बजट से ऊपर/.test(m.text), /slightly above your budget/.test(m.en)]; homes = H; }

// B7: acknowledgement while quiet / off, once per 10 min; no canned line twice in a row
{ const l = mk({}, { quietUntil: new Date(Date.now() + 3600_000).toISOString() }); say(l, 'is gali me kitna time lagega pahunchne me'); say(l, 'aur ek baat'); const b = botMsgs(l); out.quietAck = [b.length, /broker तक पहुँच गया/.test(b[0]?.text), /reached the broker/.test(b[0]?.en)]; }
{ const l = mk({}, { off: true }); say(l, 'hello kya haal hai bhai'); say(l, 'koi hai?'); out.offAck = botMsgs(l).length; l.chat.bot.lastAckAt = new Date(Date.now() - 11 * 60_000).toISOString(); say(l, 'koi hai?'); out.offAckLater = botMsgs(l).length; }
{ const l = mk({}); say(l, 'bhai kuch bata do'); const n1 = botMsgs(l).length; l.chat.bot.lastFallbackAt = undefined; say(l, 'bhai kuch bata do'); const same = botMsgs(l).filter((m: any) => m.text.startsWith('आपका संदेश मैंने ब्रोकर को भेज दिया')).length; out.noRepeat = [n1, same]; }
{ const l = mk({}); say(l, 'ok'); out.okNoAck = botMsgs(l).length; }

// B8: opt-out closes the lead, tells the broker, silences pushes; works with the bot off too
{ told.length = 0; const l = mk({}); say(l, 'not interested'); out.optOut = [l.status, !!l.lostAt, l.chat.bot.watch.pushes >= 10, told.some(t => t.includes('अब नहीं चाहिए'))]; }
{ const l = mk({}, { off: true }); say(l, 'please stop'); out.optOutOff = [l.status, botMsgs(l).length]; }
{ const l = mk({}); say(l, "don't stop calling me"); out.notStop = l.status; }

// B4 through the bot: a loan question is passed on, not answered as availability
{ told.length = 0; const l = mk({}); say(l, 'loan mil jayega?'); out.loan = [/पक्की नहीं|मैंने ब्रोकर से पूछ/.test(botMsgs(l)[0]?.text || ''), told.some(t => t.includes('सवाल'))]; }

// B6: a counter the customer accepts moves the clock; a broker-made visit with a readable time gets one
{ const l = mk({}); const v: any = { id: 'LVR-1', at: new Date().toISOString(), homeId: 'P2', title: 'Home P2', preferred: 'कल सुबह', preferredEn: 'Tomorrow morning', whenIso: new Date(Date.now() + 20 * 3600_000).toISOString(), status: 'COUNTER', counter: 'Sunday 11 am' };
  l.chat.bot.visits = [v]; bot.onChip(l, 'VOK:LVR-1'); out.vok = [v.status, v.preferred, v.preferredEn, v.whenIso && v.whenIso !== undefined, !!v.whenIso && Date.parse(v.whenIso) > Date.now()];
  const l2 = mk({}); l2.chat.msgs.push({ at: new Date().toISOString(), by: 'BOT', kind: 'HOME', homeId: 'P2', text: 'Home P2', title: 'Home P2' });
  const r = bot.brokerSchedule(l2, 'P2', 'Sunday 11 am', 'Anil'); const bv = l2.chat.bot.visits[0]; out.sched = [r.ok, !!bv.whenIso, bv.preferredEn];
  const l3 = mk({}); l3.chat.msgs.push({ at: new Date().toISOString(), by: 'BOT', kind: 'HOME', homeId: 'P2', text: 'Home P2', title: 'Home P2' }); bot.brokerSchedule(l3, 'P2', 'jab time mile', 'Anil'); out.schedNoClock = l3.chat.bot.visits[0].whenIso === undefined; }

// B10: withdrawn home wording = the push wording
{ homes = H; const l = mk({}); const w: any = { ...prop('PW', 5000000), listingStatus: 'withdrawn' }; st.properties.push(w); l.chat.msgs.push({ at: new Date().toISOString(), by: 'BOT', kind: 'HOME', homeId: 'PW', text: 'Home PW', title: 'Home PW' }); bot.onChip(l, 'AVAIL'); out.avail = botMsgs(l)[0].text + '|' + botMsgs(l)[0].en; }
process.stdout.write('@@' + JSON.stringify(out) + '@@');
process.exit(0);
})();
`;
let B: Record<string, any> = {};
describe('assistant + budget behaviour (child process)', () => {
  it('runs', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genz-v179-')); mkdirSync(path.join(dir, 'data'));
    const file = path.join(dir, 'run.ts'); writeFileSync(file, SCRIPT);   // a file, not --eval: esbuild's name helper is missing in eval mode
    const r = spawnSync(path.join(root, 'node_modules/.bin/tsx'), [file], { cwd: dir, encoding: 'utf8', env: { ...process.env, NODE_ENV: 'development', KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', DEMO_MODE: 'false', SAHAYAK: '' }, timeout: 90_000 });
    const m = /@@(.*)@@/s.exec(r.stdout || ''); expect(m, (r.stdout || '') + (r.stderr || '')).toBeTruthy(); B = JSON.parse(m![1]);
    rmSync(dir, { recursive: true, force: true });
  }, 120_000);
  it('B5 one budget reader; at most 10% over; bare number = lakh; words read', () => {
    expect(B.money).toEqual([60, 6_000_000, 6_000_000, 5_000_000, 6_000_000, 60_000, 6_000_000, 6_000_000, null, null]);
    expect(B.slack).toBe(1.1);
    expect(B.fits).toEqual([true, true, true, false, true, false]);   // 60 lakh: 50L and 63L (+5%) fit; 55 lakh: 60L (+9%) fits, 62L (+12.7%) does not; the 2.85 Cr villa never
  });
  it('B5 no budget: no villa, mid-range only, asks; one home alone is not sent; over budget is said', () => {
    expect(B.noBudgetSent).not.toContain('P1'); expect(B.noBudgetSent.length).toBeGreaterThan(0); expect(B.noBudgetSent.length).toBeLessThanOrEqual(2); expect(B.noBudgetAsk).toBe(true);
    expect(B.oneHomeNoBudget).toEqual([0, true]); expect(B.over).toEqual([true, true]);
  });
  it('B7 acknowledgement: quiet and off both answer once per 10 min; no canned line twice; "ok" needs none', () => {
    expect(B.quietAck).toEqual([1, true, true]); expect(B.offAck).toBe(1); expect(B.offAckLater).toBe(2);
    expect(B.noRepeat[1]).toBe(1); expect(B.okNoAck).toBe(0);
  });
  it('B8 opt-out marks the lead LOST, stops pushes, tells the broker; a normal "stop" sentence does nothing', () => {
    expect(B.optOut).toEqual(['LOST', true, true, true]); expect(B.optOutOff).toEqual(['LOST', 1]); expect(B.notStop).toBe('NEW');
  });
  it('B4 a loan question is passed to the broker', () => { expect(B.loan).toEqual([true, true]); });
  it('B6 the accepted counter moves the clock; the broker-made visit gets one when the time is readable', () => {
    expect(B.vok[0]).toBe('OK'); expect(B.vok[1]).toBe('Sunday 11 am'); expect(B.vok[2]).toMatch(/Sunday/); expect(B.vok[4]).toBe(true);
    expect(B.sched).toEqual([true, true, expect.stringMatching(/Sunday/)]); expect(B.schedNoClock).toBe(true);
  });
  it('B10 a withdrawn home reads like the push', () => { expect(B.avail).toContain('लिस्ट से हट गया'); expect(B.avail).toContain('taken off the list'); });
});

describe('B3 / B10 chat pages', () => {
  it('long unbroken text cannot widen the public chat page or the broker chat', () => {
    const s = read('server/shopPartners.ts'); expect(s).toContain('.bub{max-width:85%;min-width:0;overflow-wrap:anywhere;word-break:break-word');
    expect(read('src/components/ChatKit.tsx')).toContain('[overflow-wrap:anywhere]');
  });
  it('double send once, need card says bot, tap targets >= 44px, English price line has no Hindi', () => {
    const s = read('server/shopPartners.ts');
    expect(s).toContain('Date.now() - Date.parse(lc.at) < 3000'); expect(s).toContain('GENZ सहायक (बॉट, ब्रोकर नहीं) पूछ रहा है');
    expect(s).toContain('.kinds label{margin:0;display:flex;align-items:center;gap:8px;border:1px solid #ccc;border-radius:12px;padding:12px;font-size:14px;background:#fff;min-height:48px}'); expect(s).toContain('.kinds input[type=radio]{width:24px;height:24px');
    expect(s).toContain('.ck{display:flex;gap:8px;align-items:flex-start;font-weight:400;font-size:13px;min-height:44px}');
    const b = read('server/sahayak.ts'); expect(b).toContain('${rsEn(Number(h.askingPrice) || 0)}`).join'); expect(b).not.toContain('price(h)');
  });
});
