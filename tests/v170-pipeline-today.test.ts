import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const f = (p: string) => readFileSync(p, 'utf8');
describe('v170 — pipeline: Today list + Paper check on the bar', () => {
  it('the pipeline starts with "Today": first waiting item of each deal, one tap into its tab', () => {
    const s = f('src/components/DealHub.tsx');
    expect(s).toContain('data-testid="deal-today"'); expect(s).toContain('onOpen(d.id, n.tab, n.kind)'); expect(s).toContain('.slice(0, 3)');
  });
  it('Paper check is a main tab, not hidden behind More', () => {
    expect(f('src/components/DealRoomsView.tsx')).toContain("icon: ShieldCheck, primary: true");
  });
  it('Back button walks the deal screens (v169)', () => {
    const s = f('src/components/DealRoomsView.tsx'); expect(s).toContain("addEventListener('popstate'"); expect(s).toContain('gdr:');
  });
  it('no agreement yet: the Propose button is visible without tapping More (phone)', () => {
    const s = f('src/components/DealRoomsView.tsx'); expect(s).toContain("agMore || agreements.length === 0 ? 'flex'");
  });
});
