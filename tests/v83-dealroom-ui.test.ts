import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** v83 — the deal room is easier to use WITHOUT losing anything. There is no DOM test environment, so these are source guards:
 *  (1) the layout fixes exist (sticky tab bar + scroll to content, one-line stage, folded money block, compact tasks, 12px floor),
 *  (2) every feature that loads / fills in by itself is still mounted and still wired (nothing was moved behind a conditional that would stop it),
 *  (3) every action the old screen had is still reachable, and every new sentence has Hindi. */
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const room = read('src/components/DealRoomsView.tsx');
const hub = read('src/components/DealHub.tsx');
const hisaab = read('src/components/DealHisaab.tsx');
const bap = read('src/components/BrokerageAtPrice.tsx');
const frc = read('src/components/FinalRateCard.tsx');
const TX = /\btx\(\s*(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*(,\s*(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"))?\s*\)/g;
const DEVA = /[ऀ-ॿ]/;

describe('what was hard before is fixed', () => {
  it('the tab bar sticks under the top bar, and picking a tab (or a next-step line) scrolls to that section', () => {
    expect(room).toContain('data-testid="deal-subtabs-sticky"'); expect(room).toContain('sticky top-[61px]');
    expect(room).toContain('const goTab = (id: DealSubTab)'); expect(room).toContain('onPick={(id) => goTab(id as DealSubTab)}');
    expect(room).toContain("goTab(tabAllowed(t) ? t : 'overview'); setTaskFilter(filterFor(k))");
    expect(room).toContain('window.scrollTo({ top: Math.max(0, natural - 61)');
    expect(room).toContain("id === 'chat_call' && typeof window !== 'undefined' && window.innerWidth < 1024");   // a phone's chat is a full screen: no scroll behind it
    expect(read('src/components/Navbar.tsx')).toContain('sticky top-0 z-40');   // the 61px above is that bar (py-2 + 44px buttons + border)
  });
  it('the header is short on a phone: a thumbnail instead of the big cover, the stage on one line, no long mode label', () => {
    expect(room).toContain('data-testid="deal-header-card"'); expect(room).toContain('hidden h-44 w-full bg-slate-100 sm:block'); expect(room).toContain('data-testid="deal-cover"');
    expect(room).toContain('sm:hidden" />'); expect(room).toContain('<PropertyThumb src={activeProperty?.images?.[0]}');
    expect(hub).toContain('data-testid="stage-summary"'); expect(hub).toContain("${open ? 'flex' : 'hidden'} items-center gap-1 overflow-x-auto pb-1 lg:flex");
    expect(room).not.toContain("`${tx('Deal room', 'डील रूम')} · ${selectedDealId}`");
    expect(hub).toContain('data-testid={`stage-step-${i}`}'); expect(hub).toContain('onChange(s)');   // moving the stage still works from the steps
  });
  it('the Overview is money first: final rate, then ONE folded money block; the people are one card; the long notes are one line with “Details”', () => {
    expect(room).toContain('data-testid="deal-money"'); expect(room).toContain('data-testid="deal-parties"'); expect(room).toContain('data-testid="deal-protection"');
    const ov = room.slice(room.indexOf("{activeSubTab === 'overview' && ("), room.indexOf("{/* TAB: ANTI-BYPASS RULES */}"));
    expect(ov.indexOf('<FinalRateCard')).toBeGreaterThan(-1); expect(ov.indexOf('<FinalRateCard')).toBeLessThan(ov.indexOf('<DealHisaab'));
    expect(ov.indexOf('<DealHisaab')).toBeLessThan(ov.indexOf('data-testid="deal-parties"'));
    expect(ov.indexOf('data-testid="deal-parties"')).toBeLessThan(ov.indexOf('data-testid="deal-visits"'));
    expect(ov).toContain('data-testid="deal-admin-open-banner"');   // the dispute alert is never folded away
    expect(ov).toContain('data-testid="deal-admin-closed-banner"');  // the privacy note is still there (inside "Details")
    expect(ov).toContain('antiBypassTailDays');                      // the protection days still come from the deal, not a fixed number
  });
  it('the Tasks tab opens on “mine, not done”, shows one row per task, and the old full detail opens with a tap', () => {
    expect(room).toContain("useState<'AUTO' | 'ALL' | 'MINE' | 'OPEN' | 'OVERDUE' | 'REVIEW'>('AUTO')");
    expect(room).toContain("? 'MINE' : tasks.some(taskIsOpen) ? 'OPEN' : 'ALL'");
    expect(room).toContain(": 'AUTO') as typeof taskFilter");   // a deal opened without a specific ask → auto; a next-step line still sets its own filter
    expect(room).toContain("kind === 'TASKS_TO_VERIFY' ? 'REVIEW'"); expect(room).toContain("kind === 'TASKS_OVERDUE' ? 'OVERDUE'");
    for (const id of ['task-scorecard', 'task-filters']) expect(room).toContain(`data-testid="${id}"`);
    expect(room).toContain('data-testid={`task-row-${task.id}`}'); expect(room).toContain('data-testid={`task-toggle-${task.id}`}');
  });
  it('no text in the deal-room screens is below 12px any more', () => {
    for (const f of ['DealRoomsView', 'DealHub', 'DealHisaab', 'FinalRateCard', 'BrokerageAtPrice', 'DealStatusPanel', 'PaymentRequestsPanel', 'DealTeamAccess', 'SideFeePanel', 'CommissionPayments', 'LegalHelp', 'DueDiligenceView']) {
      const src = read(`src/components/${f}.tsx`);
      expect(src.match(/text-\[1[01]px\]/g) || [], f).toEqual([]);
    }
  });
});

describe('nothing that loads or fills in by itself was lost', () => {
  it('the हिसाब is folded with CSS only: it stays mounted, keeps its own load, and re-loads when the final rate / deal value changes', () => {
    expect(hisaab).toContain('useEffect(() => { void load(); }, [load]);');
    expect(hisaab).toContain('[dealId, refreshKey]');
    expect(hisaab).toContain("folded ? 'hidden lg:block' : ''");                     // hidden, never unmounted
    expect(hisaab).not.toMatch(/\{\s*!folded\s*&&/);                                 // not `{open && <body/>}`
    expect(hisaab).toContain('{extra}{inner}');
    expect(room).toContain('<DealHisaab dealId={activeDeal.id} fold refreshKey=');
    for (const id of ['hisaab', 'hisaab-sale', 'hisaab-pay-open', 'hisaab-book-open', 'hisaab-due', 'hisaab-plan-buyer', 'hisaab-aapas', 'hisaab-net-estimate', 'hisaab-fold-summary']) expect(hisaab, id).toContain(id);
    expect(hisaab).toContain('hisaab-fold-ack');                                      // a payment waiting for my “confirm” shows on the folded header
  });
  it('the Deal Desk list still shows the plain (unfolded) हिसाब', () => {
    expect(hisaab).toMatch(/<DealHisaab dealId=\{x\.dealId\} \/>/);
    expect(hisaab).toContain("return fold ? shell(sec) : sec;");
  });
  it('final rate: the card is outside every fold (the chat card scrolls to it), its note box shows when a rate is typed, and the second price box is gone only where this card already has one', () => {
    expect(frc).toContain('id="final-rate-card"'); expect(frc).toContain('(n > 0 || !!note) && <input'); expect(frc).toContain('data-testid="final-rate-note"');
    expect(room).toContain("document.getElementById('final-rate-card')?.scrollIntoView");
    expect(bap).toContain('hideSetter'); expect(bap).toContain('{!hideSetter && b.canSetPrice && b.source');
    expect(room).toContain('hideSetter={!!dealDetail?.finalRate && !activeDeal?.summaryOnly}');
    expect(room).toContain('(dealDetail?.brokerage?.mandate && !hideCommercials && <BrokerageAtPrice');   // still shown when the हिसाब itself is hidden
  });
  it('the same permission conditions as before guard every block (owner / team / admin / legal views are unchanged)', () => {
    expect(room).toContain('(isOwnerViewer || !activeDeal?.commercialsHidden) && !activeDeal?.summaryOnly');
    expect(room).toContain('dealDetail?.finalRate && !activeDeal?.summaryOnly');
    expect(room).toContain('dealDetail?.brokerage?.mandate && !hideCommercials');
    expect(room).toContain("!hideCommercials && activeDeal.feeMode !== 'OWN_SIDE'");   // the entitlement % of each broker
    expect(room).toContain("perm('mandate:read')"); expect(room).toContain('roomsFor(activeDeal.propertyId)');   // owner's terms + client-room links
    for (const id of ['deal-links', 'deal-owner-terms', 'deal-client-room', 'deal-schedule-visit']) expect(room, id).toContain(id);
  });
  it('every task action of the old card is still there (inside the opened row), and the ones that matter most are also on the row', () => {
    for (const s of ['handleAcceptTask(task.id, \'ACCEPTED\')', 'handleAcceptTask(task.id, \'REJECTED\')', 'setCompleteTaskItem(task)', 'setVerifyTaskItem(task)', 'setReassignTaskItem(task)', 'Reassign']) expect(room, s).toContain(s);
    expect((room.match(/handleAcceptTask\(task\.id, 'ACCEPTED'\)/g) || []).length).toBe(2);       // on the row and inside the opened row
    expect((room.match(/setReassignTaskItem\(task\)/g) || []).length).toBe(1);
    for (const s of ['Acceptance', 'Verification', 'completionNote', 'evidenceAttachments', 'verificationNotes', 'reassignmentHistory']) expect(room, s).toContain(s);
  });
  it('the per-deal fetches are still behind their permission checks (the role-audit rule)', () => {
    for (const [fn, perm] of [['loadTasks(id)', 'task:read'], ['loadAgreements(id)', 'agreement:read'], ['loadReadinessReport(id)', 'dd:read'], ['loadMessages(id)', 'deal:chat'], ['loadVault(res.property.id)', 'property:read']] as const) {
      const line = room.split('\n').find((l) => l.includes(fn) && l.includes('perm('));
      expect(line, fn).toBeTruthy(); expect(line).toContain(perm);
    }
  });
  it('the section tabs are the same ones as before (nothing dropped) and the deep links (?sub=…) still open any of them', () => {
    for (const id of ['overview', 'chat_call', 'responsibilities', 'commission_agreement', 'media_vault', 'due_diligence', 'readiness_report', 'antibypass_protocol', 'legal_help', 'disputes_holds']) expect(room, id).toContain(`'${id}'`);
    expect(room).toContain("urlQ.get('sub')");
  });
});

describe('every new sentence has Hindi', () => {
  it('each tx(en, hi) in the changed screens has a Devanagari second argument', () => {
    const bad: string[] = [];
    for (const [n, src] of [['DealRoomsView', room], ['DealHub', hub], ['DealHisaab', hisaab], ['BrokerageAtPrice', bap], ['FinalRateCard', frc]] as const) {
      for (const m of src.matchAll(TX)) { const hi = m[3]; if (m[1] === "'en'") continue; /* the language probe tx('en', 'hi') */ if (!hi || !DEVA.test(hi)) bad.push(`${n}: ${m[1].slice(0, 50)}`); }
    }
    expect(bad).toEqual([]);
  });
  it('the one-word task status has both languages', () => {
    for (const hi of ['ज़रूरी नहीं', 'जाँचा गया', 'पूरा — जाँच बाकी', 'मना किया', 'स्वीकृति बाकी', 'चालू', 'करना है']) expect(room).toContain(hi);
  });
});
