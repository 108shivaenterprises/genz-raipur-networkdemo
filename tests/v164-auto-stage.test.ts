import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
// static guard: stages move by themselves on share / visit agreed (forward only), and the number also opens on an agreed visit
const src = readFileSync('server/shopPartners.ts', 'utf8');
describe('shop lead auto stages (v164)', () => {
  it('autoStage is forward-only and tells the shop', () => {
    expect(src).toContain('function autoStage');
    expect(src).toMatch(/indexOf\(to\) <= STAGE_ORDER\.indexOf\(l\.status\)/);
    expect(src).toContain('tellShop(p, `लीड आगे बढ़ी');
  });
  it('a shared home and an agreed visit both move the lead to Spoke', () => {
    expect(src).toContain("autoStage(l, 'CONTACTED', 'Broker shared a matching home')");
    expect(src).toContain("autoStage(l, 'CONTACTED', 'A visit was agreed in the chat')");
    expect(src).toContain("visitAgreed(l, String(req.params.vid))");
  });
});
