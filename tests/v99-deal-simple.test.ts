/** v99 — the simple deal room: what it shows, how it opens the full room, and that the full room's test-ids are all still there (source-level, like v83). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
const read = (f: string) => readFileSync(path.resolve(__dirname, '..', f), 'utf8');
const room = read('src/components/DealRoomsView.tsx'); const simple = read('src/components/DealSimple.tsx'); const hub = read('src/components/DealHub.tsx');

describe('v99 — simple deal room', () => {
  it('the simple screen has the glance facts, six doors and a way to the full room', () => {
    for (const id of ['deal-simple', 'deal-simple-facts', 'deal-simple-doors', 'deal-simple-full']) expect(simple, id).toContain(`data-testid="${id}"`);
    for (const d of ['chat_call', 'responsibilities', 'commission_agreement', 'media_vault', 'due_diligence', 'money']) expect(simple, d).toContain(`${d}:`);
    expect(simple).toContain('deal-fact-'); expect(simple).toContain('deal-door-');
  });
  it('the room has a Simple ⇄ Full switch, remembered, and a link into one section opens the full room', () => {
    expect(room).toContain('data-testid="deal-view-toggle"'); expect(room).toContain('data-testid="deal-view-simple"'); expect(room).toContain('data-testid="deal-view-full"');
    expect(room).toContain("localStorage.getItem('genz_deal_view')"); expect(room).toContain("localStorage.setItem('genz_deal_view'");
    expect(room).toContain("if (urlQ.get('sub')) return false;");
  });
  it('anything but the overview opens the full room: a tab pick, a "next step" tap, a pipeline card with a tab', () => {
    expect(room).toContain("if (id !== 'overview') setSimple(false);");
    expect(room).toContain("if (tab && tab !== 'overview') setSimple(false);");
    expect(room).toContain("const showSimple = simple && activeSubTab === 'overview' && !summaryOnly;");   // never hides a section that was opened some other way
  });
  it('the GENZ summary view (admin) is never the simple one; the money door is hidden from anyone who may not see commercials', () => {
    expect(room).toContain('!summaryOnly && (\n                <div className="flex items-center justify-between gap-2" data-testid="deal-view-toggle">');
    expect(room).toContain("...(hideCommercials ? [] : ['money' as const])");
    expect(room).toContain("...(hideCommercials || !perm('agreement:read') ? [] : ['commission_agreement' as const])");
  });
  it('nothing of the full room was taken out (the v83 ids are all still there)', () => {
    for (const id of ['deal-subtabs-sticky', 'deal-header-card', 'deal-money', 'deal-parties', 'deal-protection', 'deal-cover']) expect(room, id).toContain(`data-testid="${id}"`);
    for (const id of ['stage-summary', 'stage-stepper', 'next-steps', 'deal-subtabs', 'deal-tab-more']) expect(hub, id).toContain(`data-testid="${id}`);
  });
  it('text is never below 12px on the simple screen', () => { expect(simple).not.toMatch(/text-\[(?:9|10|11)px\]/); });
});
