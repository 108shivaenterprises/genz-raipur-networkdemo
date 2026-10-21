import { describe, it, expect } from 'vitest';
import { isValidPan, isValidGstin, isPlausibleRera, normPan, maskPan } from '../server/kyc.js';

describe('India KYC validators', () => {
  it('PAN', () => {
    expect(isValidPan('ABCPE1234F')).toBe(true);
    expect(isValidPan('ABCDE1234F')).toBe(false); // 4th char D is not a holder type
    expect(isValidPan('ABCPE123F')).toBe(false);
    expect(normPan(' abcpe1234f ')).toBe('ABCPE1234F');
    expect(maskPan('ABCPE1234F')).toBe('AB•••••4F');
  });
  it('GSTIN incl. check digit', () => {
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true);
    expect(isValidGstin('27AAPFU0939F1ZW')).toBe(false); // wrong check digit
    expect(isValidGstin('99AAPFU0939F1ZV')).toBe(false); // bad state code
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false);
  });
  it('RERA shape', () => {
    expect(isPlausibleRera('PCGRERA250518-0001')).toBe(true);
    expect(isPlausibleRera('123')).toBe(false);
    expect(isPlausibleRera('ONLYLETTERSHERE')).toBe(false);
    expect(isPlausibleRera('<script>1')).toBe(false);
  });
});
