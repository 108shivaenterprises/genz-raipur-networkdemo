import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const f = (p: string) => readFileSync(p, 'utf8');
describe('v173 — deal tab', () => {
  const hub = f('src/components/DealHub.tsx'), rooms = f('src/components/DealRoomsView.tsx'), simple = f('src/components/DealSimple.tsx');
  it('Book visit button only when the room passes onBookVisit (sitevisit:create)', () => {
    expect(simple).toContain('data-testid="deal-book-visit"');
    expect(rooms).toMatch(/onBookVisit=\{perm\('sitevisit:create'\)/);
  });
  it('phone: three-cell strip, See all, Ending soon, status pills, no dead board/list toggle', () => {
    for (const t of ['hub-strip', 'today-see-all', 'today-ending', 'deal-pills-']) expect(hub).toContain(t);
    expect(hub).toContain("window.addEventListener('resize'"); expect(hub).toContain('{wide && <div className="inline-flex');
  });
  it('Earnings mode only with hasMoney and never for owners', () => {
    expect(rooms).toContain("showEarnings ? [['EARNINGS'");
    expect(hub).toContain('data-testid="deal-earnings"'); expect(hub).toContain('PAYMENTS_TO_CONFIRM');
  });
  it('Offers tab renamed Co-broke; More list order', () => {
    expect(rooms).toContain("tx('Co-broke', 'को-ब्रोक')");
    const i = (s: string) => rooms.indexOf(`{ id: '${s}', label`);
    expect(i('media_vault')).toBeLessThan(i('disputes_holds')); expect(i('disputes_holds')).toBeLessThan(i('legal_help')); expect(i('legal_help')).toBeLessThan(i('antibypass_protocol'));
  });
  it('protection shown before other broker when <= 7 days, no literal 30-day copy', () => {
    expect(simple).toContain("...(protSoon ? ['prot'] : []), 'other'"); expect(simple).not.toContain('30-day anti-bypass');
  });
  it('e2e fixes: join message, share origin, WhatsApp modal', () => {
    expect(f('src/components/JoinView.tsx')).not.toContain('RERA-registered ${sponsorName || \'your sponsor\'}');
    expect(f('src/lib/utils.ts')).not.toContain('ais-pre-'); expect(f('src/components/ShareKit.tsx')).toContain('getShareOrigin()');
    const d = f('src/components/ListingDrafts.tsx'); expect(d).toContain('aria-modal="true"'); expect(d).toContain("e.key === 'Escape'"); expect(d).toContain('autoFocus');
  });
});

describe('v173 round 1d', () => {
  const hub = f('src/components/DealHub.tsx'), rooms = f('src/components/DealRoomsView.tsx'), nav = f('src/components/NavigationTabs.tsx'), app = f('src/App.tsx');
  it('1 search reachable on a phone: More row + pipeline search toggle', () => {
    expect(nav).toContain('data-testid="more-search"'); expect(app).toMatch(/onTabsResolved=\{setAvailableTabs\}\s+onOpenSearch=/);
    expect(hub).toContain('data-testid="hub-search-toggle"');
  });
  it('2 phone opens a deal in the Simple room; pager always on', () => {
    expect(rooms).toContain('window.innerWidth < 1024'); expect(rooms).toContain("window.innerWidth < 1024) { setSimple(true); setActiveSubTab('overview'); }");
    expect(rooms).toContain('{ids.length > 1 && <span className="ml-auto');
  });
  it('4 Earnings only for brokers with money', () => {
    expect(rooms).toContain("currentUser.role === 'BROKER' && !!hub?.kpis?.hasMoney"); expect(hub).toContain('isBroker && k.hasMoney');
    expect(rooms).toContain("setModeRaw('PIPELINE')");
  });
  it('5 Earnings heading, stage label, to-confirm ignores closed', () => {
    expect(rooms).toContain("tx('Earnings (कमाई)'"); expect(hub).toContain("label('dealStage', d.stage) || d.stage"); expect(hub).toContain('.filter((d: any) => !d.closed).reduce(');
  });
  it('6 Book visit not on closed / settled deals', () => {
    expect(rooms).toContain("perm('sitevisit:create') && !activeDeal.closed && activeDeal.stage !== 'Settled'");
  });
});
