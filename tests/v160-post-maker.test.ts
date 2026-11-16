import { describe, it, expect } from 'vitest';
import { makePosts, priceWords, hashtagsFor } from '../src/shared/postMaker.js';

const home = { title: '3BHK, east facing', propertyType: 'Apartment', transactionType: 'Sale' as const, city: 'Raipur', locality: 'Shankar Nagar', askingPrice: 8500000, builtUpAreaSqFt: 1450 };

describe('v160 post maker', () => {
  it('writes prices in lakh / crore', () => {
    expect(priceWords(8500000, 'en')).toBe('85 Lakh');
    expect(priceWords(25000000, 'en')).toBe('2.5 Cr');
    expect(priceWords(25000000, 'hi')).toBe('2.5 करोड़');
  });
  it('makes group, insta and reel text with no owner detail', () => {
    const p = makePosts(home, { lang: 'en', broker: 'Ravi', phone: '9876543210' });
    expect(p.group).toContain('85 Lakh'); expect(p.group).toContain('Shankar Nagar, Raipur'); expect(p.group).toContain('Ravi · 9876543210');
    expect(p.insta).toContain('#RaipurRealEstate'); expect(p.reel).toContain('Reel');
  });
  it('rent shows per month and hindi works', () => {
    const p = makePosts({ ...home, transactionType: 'Rent', askingPrice: 18000 }, { lang: 'hi', broker: 'Ravi' });
    expect(p.group).toContain('/ माह'); expect(p.group).toContain('किराये');
    expect(hashtagsFor({ ...home, transactionType: 'Rent' })).toContain('#RentalHome');
  });
  it('max 12 unique hashtags', () => { const t = hashtagsFor({ ...home, tags: ['a', 'b', 'c'] }); expect(t.length).toBeLessThanOrEqual(12); expect(new Set(t).size).toBe(t.length); });
});
