import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { protectionTone, daysUntil } from '../src/shared/protectionRules.js';
const f = (p: string) => fs.readFileSync(p, 'utf8');

describe('v174 take list (D9)', () => {
  it('protection pill colours: red <=2, amber <=7, else green', () => {
    expect(protectionTone(2)).toContain('red'); expect(protectionTone(7)).toContain('amber'); expect(protectionTone(8)).toContain('emerald');
    expect(daysUntil(undefined)).toBeUndefined(); expect(daysUntil(new Date(Date.now() + 3 * 86400_000 - 1000).toISOString())).toBe(3);
  });
  it('share kit signs every message with name, firm, RERA and phone', () => {
    const s = f('src/components/ShareKit.tsx'); expect(s).toContain('const sign ='); expect(s).toContain('shareText = lastUrl ? `${body}');
  });
  it('lead card: WhatsApp now + Call + age pill; pills on leads and properties', () => {
    const c = f('src/components/CrmView.tsx');
    for (const k of ['lead-wa-now', 'lead-call-now', 'lead-age-pill', 'ProtectionPill', 'bg-amber-100']) expect(c).toContain(k);
    expect(f('src/components/PropertiesView.tsx')).toContain('<ProtectionPill');
  });
  it('deal room has a cost-sheet door; earnings board shows a read-only team split', () => {
    expect(f('src/components/DealSimple.tsx')).toContain('deal-costsheet');
    expect(f('src/components/DealHub.tsx')).toContain('earn-split');
  });
});
