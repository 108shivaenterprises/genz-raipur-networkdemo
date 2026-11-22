/** v193 (round 13) — milestone amounts reuse the hisaab; unset dates are not inputs; ChatShell fits an iPhone. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { milestoneAmounts, balanceLeft, MILESTONE_KIND } from '../src/shared/keyDates';
const read = (f: string) => readFileSync(path.resolve(import.meta.dirname, '..', f), 'utf8');

describe('v193 · amounts', () => {
  it('sums by milestone, ignoring void, masked and other kinds', () => {
    const e = [{ kind: 'TOKEN', amount: 100000 }, { kind: 'TOKEN', amount: 50000, void: { at: 'x' } }, { kind: 'PART', amount: 500000 }, { kind: 'PART', amount: 1, masked: true }, { kind: 'FINAL', amount: 2000000 }, { kind: 'REFUND', amount: 9 }, { kind: 'TO_BROKER', amount: 9 }];
    expect(milestoneAmounts(e)).toEqual({ token: 100000, agreement: 500000, registry: 2000000 });
    expect(milestoneAmounts([])).toEqual({ token: 0, agreement: 0, registry: 0 });
    expect(MILESTONE_KIND).toEqual({ token: 'TOKEN', agreement: 'PART', registry: 'FINAL' });
  });
  it('balance = final rate − received, never negative', () => {
    expect(balanceLeft(3000000, 100000)).toBe(2900000); expect(balanceLeft(100, 500)).toBe(0);
  });
});
describe('v193 · source guards', () => {
  it('unset dates render a button; amounts open the hisaab form; final rate text', () => {
    const k = read('src/components/KeyDates.tsx'); expect(k).toContain('data-empty="1"'); expect(k).toContain('kd-pay-'); expect(k).toContain('kd-possession-balance'); expect(k).toContain('formatINR');
    const h = read('src/components/DealHisaab.tsx'); expect(h).toContain("'genz:hisaab-pay'"); expect(h).toContain('genz:hisaab-changed');
    expect(read('src/components/FinalRateCard.tsx')).toContain('final rate not set');
  });
  it('ChatShell: 100dvh, visualViewport only with the keyboard open, orientationchange', () => {
    const c = read('src/components/ChatKit.tsx'); expect(c).toContain('h-[100dvh]'); expect(c).toContain('max-h-[100dvh]'); expect(c).toContain('v.height < window.innerHeight - 120'); expect(c).toContain('orientationchange');
  });
});
