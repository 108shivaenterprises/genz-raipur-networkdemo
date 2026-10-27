import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** v79 — source guards (there is no DOM test environment): the visit pass explains itself, the scan opens it, the chat cards open,
 *  the Home tiles and the bell share ONE list, the old "(full form)" wording is gone, and every new sentence has Hindi. */
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const TX = /\btx\(\s*(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*(,\s*(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"))?\s*\)/g;
const DEVA = /[ऀ-ॿ]/;

describe('the visit pass says why it cannot be confirmed, and what to do', () => {
  const m = read('src/components/SiteVisitQrPassModal.tsx');
  it('uses the SAME pure gate as the server, and shows the notice instead of dead buttons', () => {
    expect(m).toContain("import { gateWords } from '../shared/visitGateRules.js'");
    expect(m).toContain('export const VisitGateNotice');
    expect(m).toContain('<VisitGateNotice visit={V} onFresh={setFresh} />');
    expect(read('server.ts')).toContain("from './src/shared/visitGateRules.js'");
  });
  it('has Remind and Move-the-visit controls with test ids, and calls only the two new endpoints', () => {
    for (const id of ['visit-gate', 'visit-remind', 'visit-move-open', 'visit-move', 'visit-move-time', 'visit-move-save', 'visit-gate-done', 'visit-far-hint']) expect(m, id).toContain(`data-testid="${id}"`);
    expect(m).toContain('api.remindSiteVisit'); expect(m).toContain('api.rescheduleSiteVisit');
    const a = read('src/lib/api.ts'); expect(a).toContain('/remind'); expect(a).toContain('/reschedule');
  });
  it('a far-away phone location is explained and the no-location way (the 6-digit code) is pointed to', () => {
    expect(m).toMatch(/km from the property/); expect(m).toContain('Verify OTP');
  });
  it('the home-header scan opens the pass for a visit the scanner cannot confirm — it is no longer a dead-end line', () => {
    const q = read('src/components/QuickScan.tsx');
    expect(q).toContain("if (v.gate && !v.gate.ok) { setOpen({ visit: v, raw: '' }); return; }");
    expect(q.indexOf("v.gate && !v.gate.ok")).toBeLessThan(q.indexOf('You booked this visit, so you cannot verify it yourself'));
  });
  it('the deal room opens the same pass', () => {
    const d = read('src/components/ChatPlus.tsx'); expect(d).toContain('Pass window closed');
  });
});

describe('the location card in the chat opens a map', () => {
  const c = read('src/components/ChatPlus.tsx');
  const loc = c.slice(c.indexOf('data-testid="chat-card-LOCATION"') - 400, c.indexOf('data-testid="chat-card-LOCATION"') + 1800);
  it('shows an exact pin when the property side shared one, else the area, each as a real link that opens in a new tab', () => {
    expect(loc).toContain('data-testid="chat-card-maps"'); expect(loc).toContain('data-exact={isExact ?');
    expect(loc).toContain('target="_blank"'); expect(loc).toContain('rel="noreferrer"');
    expect(loc).toMatch(/Open the exact pin in Maps/); expect(loc).toMatch(/Open the area in Maps/);
  });
  it('builds the area link from the rounded area only — never a street address', () => {
    expect(loc).not.toMatch(/addressHidden|street|houseNo/);
  });
});

describe('a builder\'s unit card opens its details', () => {
  const p = read('src/components/PartnerChat.tsx');
  it('the card is a button that opens a sheet which asks the server for THIS chat\'s unit', () => {
    expect(p).toContain('export const UnitSheet'); expect(p).toContain('api.pchatUnit(threadId, unitId)');
    expect(p).toContain("card.kind === 'UNIT' && threadId"); expect(p).toContain('<UnitSheet threadId={threadId} unitId={card.refId}');
    expect(p).toContain('<PartnerCard card={m.card} threadId={id} />');
  });
  it('the sheet is drawn at the page level (portal) so a chat bubble cannot clip it, and can be closed', () => {
    expect(p).toContain("import { createPortal } from 'react-dom'"); expect(p).toContain('createPortal('); expect(p).toContain('data-testid="pc-unit-close"');
    for (const id of ['pc-unit-sheet', 'pc-unit-price', 'pc-unit-status', 'pc-unit-facts']) expect(p, id).toContain(`data-testid="${id}"`);
  });
  it('the sheet sits ABOVE the full-screen chat (z-[55]) — a z-50 sheet was drawn behind it and nothing seemed to happen', () => {
    const z = Number(/fixed inset-0 z-\[(\d+)\][^"]*"[^>]*data-testid="pc-unit-sheet"/.exec(p)?.[1]);
    const chat = Number(/fixed inset-0 z-\[(\d+)\]/.exec(read('src/components/ChatKit.tsx'))?.[1]);
    expect(chat).toBeGreaterThan(0); expect(z).toBeGreaterThan(chat);
  });
  it('a hidden price is shown as "On request" — the screen never computes a price itself', () => {
    expect(p).toContain("u.priceHidden ? tx('On request'"); expect(p).not.toMatch(/ratePerSqft\s*\*/);
  });
  it('the server route is read-only, per chat, and the api helper exists', () => {
    const s = read('server/partnerchat.ts'); expect(s).toMatch(/r\.get\('\/:id\/unit\/:uid'/);
    expect(read('src/lib/api.ts')).toContain('pchatUnit');
  });
});

describe('the Home counters and the bell are one list', () => {
  const rules = read('src/shared/homeTodoRules.ts');
  it('Home tiles are built from HOME_TODOS, not from a second hand-written list', () => {
    const h = read('src/components/BrokerHome.tsx'); expect(h).toContain('HOME_TODOS'); expect(h).toContain('TILE_ICON');
    expect(read('server/homebell.ts')).toContain('reconcileTodos');
  });
  it('every to-do key is a counter some server file really computes for the Home (no dead keys)', () => {
    const all = readdirSync(path.join(ROOT, 'server')).filter(f => f.endsWith('.ts')).map(f => read('server/' + f)).join('\n');
    const keys = [...rules.matchAll(/key: '(\w+)'/g)].map(x => x[1]); expect(keys.length).toBeGreaterThanOrEqual(8);
    for (const k of keys) expect(all, k).toMatch(new RegExp(`\\b${k}\\b\\s*[:,]`));
  });
  it('the Home route refreshes the bell, and the bell shows a "To do" chip with the number', () => {
    expect(read('server/reputation.ts')).toContain('syncHomeBell(u, true)');
    const b = read('src/components/NotificationBell.tsx'); expect(b).toContain('data-testid="bell-todo-chip"'); expect(b).toContain("tx('To do', 'करना है')");
  });
  it('every definition has an English and a Hindi sentence', () => {
    expect(DEVA.test(rules)).toBe(true);
    for (const m of rules.matchAll(/hi: '([^']*)'/g)) expect(DEVA.test(m[1]), m[0].slice(0, 70)).toBe(true);
    for (const m of rules.matchAll(/hi: `([^`]*)`/g)) expect(DEVA.test(m[1]), m[0].slice(0, 70)).toBe(true);
  });
});

describe('wording', () => {
  it('there is no "(full form)" anywhere a person reads it', () => {
    for (const f of ['src/components/BrokerHome.tsx', 'src/App.tsx', 'src/components/Navbar.tsx', 'src/components/NavigationTabs.tsx', 'src/lib/i18n.tsx']) expect(read(f), f).not.toMatch(/\(full form\)/i);
    expect(read('src/components/BrokerHome.tsx')).toContain("tx('Add property', 'प्रॉपर्टी जोड़ें')");
  });
});

describe('the shared link', () => {
  it('Home shares the public page when it is on, else the city report — and tells which one', () => {
    const h = read('src/components/BrokerHome.tsx');
    expect(h).toContain("data-target={pageUrl ? 'page' : 'report'}"); expect(h).toContain('/c/${encodeURIComponent(h.refCode)}');
  });
  it('the report points to the sharer\'s page, and the page points back to the report', () => {
    const r = read('server/report.ts'); expect(r).toContain('report-sharedby'); expect(r).toContain('brandOf');
    const pp = read('server/publicPage.ts'); expect(pp).toContain('/report/');
  });
  it('an enquiry from the public page can start a client room with that home already in it', () => {
    const v = read('src/components/PublicPageView.tsx'); expect(v).toContain('genz.newroom'); expect(v).toContain('homeId'); expect(v).toContain('homeTitle');
  });
});

describe('hindi', () => {
  it('every tx() in the screens touched by v79 has an English and a Hindi text', () => {
    for (const f of ['src/components/SiteVisitQrPassModal.tsx', 'src/components/QuickScan.tsx', 'src/components/ChatPlus.tsx', 'src/components/PartnerChat.tsx', 'src/components/BrokerHome.tsx', 'src/components/NotificationBell.tsx']) {
      const src = read(f); const calls = [...src.matchAll(TX)].filter(c => !c[0].includes('${')); expect(calls.length, f).toBeGreaterThan(0);   // (the regex cannot read a template with ${…} inside — those few are left to review)
      for (const c of calls) { expect(c[2], `${f}: ${c[0].slice(0, 70)}`).toBeTruthy(); expect(DEVA.test(c[3]), `${f}: ${c[0].slice(0, 70)}`).toBe(true); }
    }
  });
  it('the alerts the new visit routes send have Hindi', () => {
    const s = read('server.ts'); const i = s.indexOf("/api/site-visits/:id/remind"); expect(i).toBeGreaterThan(0);
    const blk = s.slice(i, s.indexOf('9. OWNER', i));
    const his = [...blk.matchAll(/hi: \[([^\]]*)\]/g), ...blk.matchAll(/hi: '([^']*)'/g), ...blk.matchAll(/hi: `([^`]*)`/g)]; expect(his.length).toBeGreaterThanOrEqual(2);
    for (const m of his) expect(DEVA.test(m[1]), m[0].slice(0, 70)).toBe(true);
  });
});
