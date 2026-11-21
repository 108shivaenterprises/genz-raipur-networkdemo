import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const f = (p: string) => readFileSync(p, 'utf8');
describe('v177 — deal tab polish', () => {
  const hub = f('src/components/DealHub.tsx'), rooms = f('src/components/DealRoomsView.tsx');
  it('one metric strip below lg; tiles only at lg', () => {
    expect(hub).toContain('text-center lg:hidden" data-testid="hub-strip"'); expect(hub).toContain('hidden grid-cols-2 gap-2 lg:grid');
  });
  it('Today: grouped disputes, collapsible summary, remembered choice, max 3 rows', () => {
    for (const t of ['today-disputes', 'today-toggle', 'genz-today-open', 'rows.slice(0, 3)']) expect(hub).toContain(t);
  });
  it('rows label the share; mode bar has aria-labels and no needs-me dot; phone title hidden', () => {
    expect(hub).toContain("tx('Your share', 'आपका हिस्सा')"); expect(rooms).toContain('aria-label={n !== undefined ? `${text}, ${n}` : undefined}');
    expect(rooms).toContain("mainMode === 'PIPELINE' ? 'hidden lg:block' : ''");
  });
});
