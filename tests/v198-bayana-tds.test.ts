/** v198 — token acknowledgement + indicative TDS line, ported selectively from the Antigravity branch (D18). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { tdsFor, TDS_THRESHOLD } from '../server/hisaab';
const read = (f: string) => readFileSync(path.resolve(import.meta.dirname, '..', f), 'utf8');

describe('v198 · TDS', () => {
  it('indicative 1% from ₹50 lakh; none below; never negative; carries the as-of month', () => {
    expect(tdsFor(6_000_000)).toMatchObject({ applicable: true, amount: 60000, sellerNetPayable: 5_940_000, indicative: true });
    expect(tdsFor(TDS_THRESHOLD).applicable).toBe(true); expect(tdsFor(4_999_999)).toMatchObject({ applicable: false, amount: 0 });
    for (const bad of [0, -5, NaN]) { const t = tdsFor(bad as number); expect(t.amount).toBe(0); expect(t.sellerNetPayable).toBe(0); }
    expect(tdsFor(1).asOf).toMatch(/^\d{4}-\d{2}$/);
  });
});
describe('v198 · Bayana modal source guards', () => {
  const m = read('src/components/BayanaReceiptModal.tsx');
  it('accessible, bilingual, with the disclaimer and none of the removed legal text', () => {
    for (const k of ['role="dialog"', 'aria-modal="true"', "e.key === 'Escape'", 'aria-label={tx(', 'useTx', 'Record only, not an agreement or proof of registration']) expect(m).toContain(k);
    expect(m).toContain('Broker’s acknowledgement of token received (non-statutory)');
    for (const bad of ['Vikramaditya', 'Genz Realty Exchange', 'Rameshwar', 'Harish Agrawal', 'Forfeiture', 'forfeit', 'Contract Act', 'RERA', 'earnest', '10%', 'Math.round(s.price * 0.1)']) expect(m, bad).not.toContain(bad);
    expect(m).toContain('Math.max(0,');
  });
  it('wired in the hisaab, EN/HI, record-only', () => {
    const h = read('src/components/DealHisaab.tsx'); expect(h).toContain('BayanaReceiptModal'); expect(h).toContain('hisaab-bayana-btn'); expect(h).toContain('hisaab-tds'); expect(h).toContain('Confirm with your CA');
    expect(h).not.toContain('Vikramaditya'); expect(read('server/hisaab.ts')).toContain('INDICATIVE');
  });
});
