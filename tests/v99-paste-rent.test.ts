import { describe, it, expect } from 'vitest';
import { parsePaste, bareRent } from '../src/shared/waParse';

const one = (s: string) => parsePaste(s)[0] as any;

describe('v99 — paste parser: plain-number rent + Devanagari city', () => {
  it('reads a bare 5-digit rent (Latin text)', () => {
    const r = one('3 BHK flat for rent Baner Pune 18000 contact Mr Joshi 9823012345');
    expect(r.transactionType).toBe('Rent'); expect(r.price).toBe(18000); expect(r.city).toBe('Pune'); expect(r.phones).toEqual(['9823012345']);
  });
  it('reads "15000 per month"', () => { expect(one('2bhk flat for rent Kothrud 15000 per month').price).toBe(15000); });
  it('still reads 12k and ₹25,000', () => {
    expect(one('Flat for rent Vijay Nagar Indore 12k').price).toBe(12000);
    expect(one('Shop for rent Mansarovar Jaipur ₹25,000').price).toBe(25000);
  });
  it('sale price is untouched', () => { expect(one('2 BHK flat for sale Baner Pune 75 lakh owner Ramesh 9876543210').price).toBe(7500000); });
  it('Hindi text: city from Devanagari + bare rent', () => {
    const r = one('किराये पर 2 BHK फ्लैट मालवीय नगर जयपुर 18000');
    expect(r.transactionType).toBe('Rent'); expect(r.city).toBe('Jaipur'); expect(r.state).toBe('Rajasthan'); expect(r.price).toBe(18000);
  });
  it('bareRent ignores area, pincode, phone, floor and BHK numbers', () => {
    expect(bareRent('flat for rent 1200 sqft Baner')).toBeUndefined();
    expect(bareRent('flat for rent 1200 sq ft Baner')).toBeUndefined();
    expect(bareRent('rent Baner Pune pin 411045')).toBeUndefined();
    expect(bareRent('rent flat call 9823012345')).toBeUndefined();
    expect(bareRent('rent 3000 sqft shop 45000')).toBe(45000);
  });
  it('two competing numbers → no guess', () => { expect(bareRent('for rent 12000 or 15000')).toBeUndefined(); });
  it('a rent below ₹2,000 or a 6-digit number is not read as bare rent', () => {
    expect(bareRent('for rent 1500')).toBeUndefined();
    expect(bareRent('for rent 150000')).toBeUndefined();
  });
});
