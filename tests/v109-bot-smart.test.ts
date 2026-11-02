import { describe, it, expect } from 'vitest';
import { readIntent } from '../src/shared/sahayak';
import { normNum, asciiDigits } from '../src/shared/hiNum';
import { maskPhones } from '../src/shared/legalRules';
import { isRealDay } from '../src/shared/crmRules';

describe('v109 bot + hardening', () => {
  it('intents', () => {
    expect(readIntent('ok')).toBe('CONFIRM');
    expect(readIntent('visit cancel karo')).toBe('CANCEL_VISIT');
  });
  it('numbers', () => {
    expect(asciiDigits('९८७')).toBe('987');
    expect(normNum('pachas lakh')).toContain('50 lakh');
    expect(normNum('80L')).toContain('80 lakh');
  });
  it('phone mask bypasses', () => {
    for (const t of ['९८२६०१२३४५', '98260/12345', '98,260,12345']) expect(maskPhones('call ' + t).masked).toBe(true);
  });
  it('isRealDay', () => { expect(isRealDay('2026-02-30')).toBe(false); expect(isRealDay('2026-02-20')).toBe(true); });
});
