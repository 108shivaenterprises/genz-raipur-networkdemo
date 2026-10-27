import { describe, it, expect } from 'vitest';
import { inboxAdd, inboxTrim, inboxView, inboxUnread, safeInboxUrl, agoLabel, INBOX_CAP, INBOX_DAYS, type InboxItem } from '../src/shared/inboxRules.js';
import {
  UNIT_KINDS, parseUnitKind, unitKindOf, isFloorWise, kindLabel, kindWord, cleanCode, codeClash, nextCodes, rateCard, unitShareLine, CODE_MAX,
} from '../src/shared/inventoryRules.js';
import { PASS_ON, AUDIENCES, passOf, passAtLeast, docVisibleToBroker, brokerMayPass, postCoversDoc, docInputProblem, MAX_DOC_PARTNERS } from '../src/shared/docRules.js';

/** v77 — pure rules: the notification bell, kinds / codes / rate card of the unit grid, and how far a project paper may travel. */
const NOW = Date.parse('2026-11-01T10:00:00Z');
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();
const entry = (over: Partial<Omit<InboxItem, 'id' | 'read'>> = {}) => ({ userId: 'U1', kind: 'deals' as const, title: 'T', body: 'B', at: iso(1), ...over });

describe('bell: keeping a line', () => {
  it('adds a line, newest first, per person', () => {
    const all: InboxItem[] = [];
    inboxAdd(all, entry({ title: 'old', at: iso(30) }), 'a', NOW); inboxAdd(all, entry({ title: 'new', at: iso(1) }), 'b', NOW); inboxAdd(all, entry({ userId: 'U2', title: 'other' }), 'c', NOW);
    expect(inboxView(all, 'U1', 'en').map(x => x.title)).toEqual(['new', 'old']);
    expect(inboxView(all, 'U2', 'en').map(x => x.title)).toEqual(['other']);
    expect(inboxUnread(all, 'U1')).toBe(2);
  });
  it('the same tag while still unread is ONE line, moved to the top with the fresh words', () => {
    const all: InboxItem[] = [];
    inboxAdd(all, entry({ tag: 'lead-7', title: '1 new lead', at: iso(20) }), 'a', NOW);
    inboxAdd(all, entry({ title: 'something else', at: iso(10) }), 'b', NOW);
    const again = inboxAdd(all, entry({ tag: 'lead-7', title: '2 new leads', at: iso(1) }), 'c', NOW);
    expect(all.length).toBe(2); expect(again.id).toBe('a');
    expect(inboxView(all, 'U1', 'en').map(x => x.title)).toEqual(['2 new leads', 'something else']);
  });
  it('once it is read, the same tag starts a new line; another person\'s tag never merges', () => {
    const all: InboxItem[] = [];
    const first = inboxAdd(all, entry({ tag: 't' }), 'a', NOW); first.read = true;
    inboxAdd(all, entry({ tag: 't' }), 'b', NOW); inboxAdd(all, entry({ userId: 'U2', tag: 't' }), 'c', NOW);
    expect(all.length).toBe(3);
  });
  it('Hindi words are used when asked for, English when a line has none', () => {
    const all: InboxItem[] = [];
    inboxAdd(all, entry({ title: 'Paper', body: 'for you', hi: { title: 'काग़ज़', body: 'आपके लिए' }, at: iso(1) }), 'a', NOW); inboxAdd(all, entry({ title: 'Plain', body: 'only english', at: iso(2) }), 'b', NOW);
    expect(inboxView(all, 'U1', 'hi').map(x => x.title)).toEqual(['काग़ज़', 'Plain']);
    expect(inboxView(all, 'U1', 'en').map(x => x.title)).toEqual(['Paper', 'Plain']);
  });
  it('a tap goes only to a path inside this app', () => {
    expect(safeInboxUrl('/?tab=crm')).toBe('/?tab=crm'); expect(safeInboxUrl('/s/abc')).toBe('/s/abc');
    for (const bad of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '/\\evil', 'crm', '', undefined, 5, '/' + 'x'.repeat(400)]) expect(safeInboxUrl(bad as any), String(bad)).toBeUndefined();
    const all: InboxItem[] = []; const row = inboxAdd(all, entry({ url: 'https://evil.example' }), 'a', NOW);
    expect(row.url).toBeUndefined();
  });
  it('long words are cut so one alert cannot fill the store', () => {
    const all: InboxItem[] = []; const row = inboxAdd(all, entry({ title: 'x'.repeat(500), body: 'y'.repeat(900) }), 'a', NOW);
    expect(row.title.length).toBe(120); expect(row.body.length).toBe(300);
  });
});

describe('bell: how much is kept', () => {
  it(`keeps the newest ${INBOX_CAP} for one person, without touching anyone else`, () => {
    const all: InboxItem[] = [];
    for (let i = 0; i < INBOX_CAP + 15; i++) inboxAdd(all, entry({ title: `n${i}`, at: iso(1000 - i) }), `id${i}`, NOW);
    inboxAdd(all, entry({ userId: 'U2', title: 'mine' }), 'u2', NOW);
    expect(all.filter(x => x.userId === 'U1').length).toBe(INBOX_CAP);
    expect(inboxView(all, 'U1', 'en')[0].title).toBe(`n${INBOX_CAP + 14}`);
    expect(all.filter(x => x.userId === 'U2').length).toBe(1);
  });
  it(`drops lines older than ${INBOX_DAYS} days`, () => {
    const all: InboxItem[] = [];
    inboxAdd(all, entry({ title: 'ancient', at: new Date(NOW - (INBOX_DAYS + 1) * 86_400_000).toISOString() }), 'a', NOW - 1);
    all.push({ id: 'old', userId: 'U1', kind: 'deals', title: 'ancient', body: '', at: new Date(NOW - (INBOX_DAYS + 1) * 86_400_000).toISOString() });
    inboxAdd(all, entry({ title: 'today' }), 'b', NOW);
    expect(inboxTrim(all, 'U1', NOW) >= 0).toBe(true);
    expect(inboxView(all, 'U1', 'en').map(x => x.title)).toEqual(['today']);
  });
  it('"5 min ago" is told in both languages', () => {
    expect(agoLabel(iso(0), NOW)).toBe('just now'); expect(agoLabel(iso(5), NOW)).toBe('5 min ago'); expect(agoLabel(iso(180), NOW)).toBe('3 h ago'); expect(agoLabel(iso(3 * 1440), NOW)).toBe('3 d ago');
    expect(agoLabel(iso(5), NOW, true)).toContain('मिनट'); expect(agoLabel(iso(0), NOW, true)).toBe('अभी'); expect(agoLabel(iso(180), NOW, true)).toContain('घंटे'); expect(agoLabel(iso(3 * 1440), NOW, true)).toContain('दिन');
  });
});

describe('kinds of unit', () => {
  it('every kind has an English and a Hindi name; flats, penthouses, duplexes, shops and offices are numbered by floor', () => {
    expect(UNIT_KINDS.map(k => k.id)).toEqual(['FLAT', 'PENTHOUSE', 'DUPLEX', 'VILLA', 'PLOT', 'SHOP', 'OFFICE', 'OTHER']);
    for (const k of UNIT_KINDS) { expect(k.en.length, k.id).toBeGreaterThan(2); expect(/[ऀ-ॿ]/.test(k.hi), k.id).toBe(true); }
    expect(UNIT_KINDS.filter(k => k.floorWise).map(k => k.id)).toEqual(['FLAT', 'PENTHOUSE', 'DUPLEX', 'SHOP', 'OFFICE']);
    expect(isFloorWise('PLOT')).toBe(false); expect(isFloorWise('VILLA')).toBe(false); expect(isFloorWise('FLAT')).toBe(true);
    expect(kindLabel('PENTHOUSE', false)).toBe('Penthouse'); expect(kindLabel('PLOT', true)).toBe('प्लॉट'); expect(kindLabel('nope', false)).toBe('');
  });
  it('a builder can type the kind the way people say it', () => {
    const cases: [string, string][] = [['flat', 'FLAT'], ['Apartment', 'FLAT'], ['PENTHOUSE', 'PENTHOUSE'], ['pent house', 'PENTHOUSE'], ['duplex', 'DUPLEX'], ['Independent House', 'VILLA'], ['individual house', 'VILLA'], ['Bungalow', 'VILLA'], ['villa', 'VILLA'], ['plot', 'PLOT'], ['प्लॉट', 'PLOT'], ['पेंटहाउस', 'PENTHOUSE'], ['दुकान', 'SHOP'], ['Showroom', 'SHOP'], ['office', 'OFFICE'], ['parking', 'OTHER']];
    for (const [t, k] of cases) expect(parseUnitKind(t), t).toBe(k);
    for (const t of ['', '   ', 'spaceship', undefined, null]) expect(parseUnitKind(t as any), String(t)).toBeUndefined();
  });
  it('a unit made before kinds existed is a flat when it has a floor, otherwise a plot', () => {
    expect(unitKindOf({ floor: 4 })).toBe('FLAT'); expect(unitKindOf({ floor: 0 })).toBe('FLAT'); expect(unitKindOf({})).toBe('PLOT');
    expect(unitKindOf({ kind: 'VILLA', floor: 2 })).toBe('VILLA'); expect(unitKindOf({ kind: 'junk', floor: 2 })).toBe('FLAT');
  });
  it('a customer line names the kind, except a flat (told by its BHK) or when the type already says it', () => {
    expect(kindWord('PENTHOUSE', '4 BHK', false)).toBe('Penthouse'); expect(kindWord('VILLA', '3 BHK', true)).toBe('विला');
    expect(kindWord('FLAT', '3 BHK', false)).toBe(''); expect(kindWord('PLOT', 'Plot 30x50', false)).toBe(''); expect(kindWord(undefined, '', false)).toBe('');
    const line = unitShareLine({ kind: 'PENTHOUSE', label: 'A-1501', config: '4 BHK', areaSqft: 2600, price: 21_000_000 }, { showPrice: true, showFeatures: false }, false);
    expect(line).toContain('A-1501 · Penthouse · 4 BHK');
  });
});

describe('inventory codes', () => {
  it('accepts normal codes, trims, and refuses odd ones', () => {
    expect(cleanCode('  GR-0101 ')).toBe('GR-0101'); expect(cleanCode('A/12 #3')).toBe('A/12 #3'); expect(cleanCode('प्लॉट-7')).toBe('प्लॉट-7');
    expect(cleanCode('')).toBeNull(); expect(cleanCode(null)).toBeNull(); expect(cleanCode(undefined)).toBeNull();
    expect((cleanCode('x'.repeat(CODE_MAX + 1)) as any).error).toMatch(/at most/);
    for (const bad of ['<b>', '-start', 'a;b', 'a"b']) expect((cleanCode(bad) as any).error, bad).toMatch(/letters, digits/);
  });
  it('a code belongs to one unit of a project (case does not matter)', () => {
    const us = [{ id: '1', code: 'GR-0001' }, { id: '2', code: 'gr-0002' }, { id: '3' }];
    expect(codeClash(us, 'gr-0001')?.id).toBe('1'); expect(codeClash(us, 'GR-0002')?.id).toBe('2');
    expect(codeClash(us, 'GR-0001', '1')).toBeUndefined(); expect(codeClash(us, 'GR-9')).toBeUndefined();
  });
  it('auto codes continue after the highest one already used with that prefix', () => {
    expect(nextCodes([], 'GR', 3)).toEqual(['GR-0001', 'GR-0002', 'GR-0003']);
    expect(nextCodes(['GR-0007', 'gr-0003', 'XY-0099', undefined], 'GR', 2)).toEqual(['GR-0008', 'GR-0009']);
    expect(nextCodes(['A.B-0002'], 'A.B', 1)).toEqual(['A.B-0003']);
  });
});

describe('rate card', () => {
  const U = (id: string, kind: any, config: string, price: number | null, area: number | undefined, status = 'AVAILABLE', floor?: number) => ({ id, kind, config, price, areaSqft: area, status, floor });
  const units = [
    U('a', 'FLAT', '2 BHK', 5_000_000, 1000), U('b', 'FLAT', '2 BHK', 5_400_000, 1000, 'BOOKED'), U('c', 'FLAT', '3 BHK', 8_000_000, 1600),
    U('d', 'PENTHOUSE', '4 BHK', 21_000_000, 2600), U('e', 'PLOT', 'Plot', 2_550_000, 1500), U('f', 'PLOT', 'Plot', 1_980_000, 1200, 'HOLD'), U('g', undefined, '', 100, undefined),
  ];
  it('groups by kind and type, with counts, free units, price range and ₹/sq ft range — kinds in catalog order', () => {
    const rows = rateCard(units as any);
    expect(rows.map(r => `${r.kind}|${r.config}`)).toEqual(['FLAT|2 BHK', 'FLAT|3 BHK', 'PENTHOUSE|4 BHK', 'PLOT|', 'PLOT|Plot']);
    const two = rows[0]; expect(two).toMatchObject({ count: 2, available: 1, minPrice: 5_000_000, maxPrice: 5_400_000, minRate: 5000, maxRate: 5400, ids: ['a', 'b'] });
    const plot = rows[4]; expect(plot).toMatchObject({ count: 2, available: 1, minPrice: 1_980_000, maxPrice: 2_550_000, minRate: 1650, maxRate: 1700 });
  });
  it('a hidden rate is left out, never guessed', () => {
    const rows = rateCard(units.map(u => ({ ...u, price: null })) as any);
    for (const r of rows) { expect(r.minPrice).toBeUndefined(); expect(r.maxPrice).toBeUndefined(); expect(r.minRate).toBeUndefined(); }
    expect(rows[0].count).toBe(2);
  });
  it('a unit without an area still shows its price but no ₹/sq ft', () => {
    const r = rateCard([U('x', 'SHOP', 'Ground floor', 3_000_000, undefined)] as any)[0];
    expect(r.minPrice).toBe(3_000_000); expect(r.minRate).toBeUndefined();
  });
});

describe('project papers: who gets a paper and how far it may go', () => {
  it('three steps, each with English and Hindi words', () => {
    expect(PASS_ON.map(x => x.id)).toEqual(['NONE', 'TEAM', 'CLIENT']); expect(AUDIENCES.map(x => x.id)).toEqual(['ASSOCIATES', 'ALL_CPS', 'SELECTED']);
    for (const x of [...PASS_ON, ...AUDIENCES]) { expect(x.en.length).toBeGreaterThan(3); expect(/[ऀ-ॿ]/.test(x.hi), x.id).toBe(true); }
    for (const x of PASS_ON) { expect(x.hintEn.length).toBeGreaterThan(10); expect(/[ऀ-ॿ]/.test(x.hintHi), x.id).toBe(true); }
  });
  it('an old paper (no choice made) stays with the partner alone', () => {
    expect(passOf({})).toBe('NONE'); expect(passOf({ passOn: 'junk' })).toBe('NONE'); expect(passOf({ passOn: 'TEAM' })).toBe('TEAM'); expect(passOf({ passOn: 'CLIENT' })).toBe('CLIENT');
    expect(passAtLeast({}, 'TEAM')).toBe(false); expect(passAtLeast({ passOn: 'TEAM' }, 'TEAM')).toBe(true); expect(passAtLeast({ passOn: 'TEAM' }, 'CLIENT')).toBe(false); expect(passAtLeast({ passOn: 'CLIENT' }, 'TEAM')).toBe(true);
  });
  it('who may see a paper', () => {
    const all = { audience: 'ALL_CPS' }; const part = { audience: 'ASSOCIATES' }; const sel = { audience: 'SELECTED', brokerIds: ['B1'] };
    expect(docVisibleToBroker(all, 'B9', 'NONE')).toBe(true);
    expect(docVisibleToBroker(part, 'B1', 'ACTIVE')).toBe(true); expect(docVisibleToBroker(part, 'B1', 'PAUSED')).toBe(true); expect(docVisibleToBroker(part, 'B1', 'NONE')).toBe(false); expect(docVisibleToBroker(part, 'B1', 'APPLIED')).toBe(false);
    expect(docVisibleToBroker(sel, 'B1', 'ACTIVE')).toBe(true); expect(docVisibleToBroker(sel, 'B2', 'ACTIVE')).toBe(false); expect(docVisibleToBroker(sel, 'B1', 'NONE')).toBe(false);
  });
  it('only a partner whose mandate is running may pass a paper on, and only as far as the builder allows', () => {
    const d = { audience: 'ASSOCIATES', passOn: 'TEAM' };
    expect(brokerMayPass(d, 'B1', 'ACTIVE', 'TEAM')).toBe(true); expect(brokerMayPass(d, 'B1', 'ACTIVE', 'CLIENT')).toBe(false);
    expect(brokerMayPass(d, 'B1', 'PAUSED', 'TEAM')).toBe(false); expect(brokerMayPass(d, 'B1', 'NONE', 'TEAM')).toBe(false);
    expect(brokerMayPass({ audience: 'ALL_CPS', passOn: 'CLIENT' }, 'B9', 'NONE', 'CLIENT')).toBe(false);
    expect(brokerMayPass({ audience: 'SELECTED', brokerIds: ['B2'], passOn: 'CLIENT' }, 'B1', 'ACTIVE', 'TEAM')).toBe(false);
  });
  it('a post covers a paper for the whole team or only for named people, and only while it is live', () => {
    const p = { active: true, docIds: ['D1'], memberIds: [] as string[], allowClient: false };
    expect(postCoversDoc(p, 'D1', 'M1')).toBe(true); expect(postCoversDoc(p, 'D2', 'M1')).toBe(false);
    expect(postCoversDoc({ ...p, memberIds: ['M2'] }, 'D1', 'M1')).toBe(false); expect(postCoversDoc({ ...p, memberIds: ['M2'] }, 'D1', 'M2')).toBe(true);
    expect(postCoversDoc({ ...p, active: false }, 'D1', 'M1')).toBe(false);
  });
  it('what the builder sends is checked', () => {
    const mine = new Set(['B1', 'B2']);
    expect(docInputProblem({}, mine)).toBeNull(); expect(docInputProblem({ audience: 'ALL_CPS', passOn: 'CLIENT' }, mine)).toBeNull();
    expect(docInputProblem({ audience: 'SELECTED', brokerIds: ['B1'], passOn: 'TEAM' }, mine)).toBeNull();
    expect(docInputProblem({ audience: 'EVERYONE' }, mine)).toMatch(/who gets/); expect(docInputProblem({ passOn: 'ALL' }, mine)).toMatch(/how far/);
    expect(docInputProblem({ audience: 'SELECTED' }, mine)).toMatch(/at least one partner/); expect(docInputProblem({ audience: 'SELECTED', brokerIds: [] }, mine)).toMatch(/at least one partner/);
    expect(docInputProblem({ audience: 'SELECTED', brokerIds: ['B1', 'STRANGER'] }, mine)).toMatch(/own partners/);
    expect(docInputProblem({ audience: 'SELECTED', brokerIds: [5 as any] }, mine)).toMatch(/Invalid/);
    expect(docInputProblem({ audience: 'SELECTED', brokerIds: Array.from({ length: MAX_DOC_PARTNERS + 1 }, (_, i) => `B${i}`) }, new Set(Array.from({ length: MAX_DOC_PARTNERS + 1 }, (_, i) => `B${i}`)))).toMatch(/Invalid/);
  });
});
