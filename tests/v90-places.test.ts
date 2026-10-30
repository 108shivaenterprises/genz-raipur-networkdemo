import { describe, it, expect } from 'vitest';
import { localityFit, canonPlace, isCityLevel, samePlace, inferCity, suggestAreas, splitPlaces } from '../src/shared/places';
import { calculatePropertyMatch } from '../server/matching';

const prop = (o: any = {}): any => ({ id: 'P1', transactionType: 'Sale', propertyType: 'Residential Flat', city: 'Raipur', locality: 'Shankar Nagar', askingPrice: 5000000, listingStatus: 'active', verificationStatus: 'VERIFIED', ...o });
const req = (o: any = {}): any => ({ id: 'R1', transactionType: 'Sale', propertyType: 'Residential Flat', city: 'Raipur', preferredLocalities: ['Raipur'], budgetMin: 4000000, budgetMax: 6000000, ...o });

describe('v90 places', () => {
  it('a client who wrote only the city matches any area of it', () => {
    expect(localityFit('Raipur', ['Raipur'], 'Shankar Nagar').level).toBe('city');
    expect(localityFit('Raipur', ['raipur city'], 'Telibandha').level).toBe('city');
    expect(localityFit('Raipur', [], 'Pandri').level).toBe('city');
    expect(isCityLevel('Raipur', 'पूरा शहर')).toBe(true);
    expect(isCityLevel('Raipur', 'Naya Raipur')).toBe(false);
  });
  it('spelling slips and "area, city" are the same place', () => {
    expect(localityFit('Raipur', ['Shanker Nagar'], 'Shankar Nagar').level).toBe('exact');
    expect(localityFit('Raipur', ['shankarnagar, Raipur'], 'Shankar Nagar').level).toBe('exact');
    expect(localityFit('Raipur', ['TELIBANDA'], 'Telibandha').level).toBe('exact');
    expect(samePlace('Sector 2', 'Sector 21')).toBe(false);
    expect(localityFit('Raipur', ['Sector 21'], 'Sector 2').level).toBe('none');
  });
  it('same zone is near, far is none', () => {
    expect(localityFit('Raipur', ['Telibandha'], 'VIP Road').level).toBe('near');
    expect(localityFit('Raipur', ['Pandri'], 'VIP Road').level).toBe('none');
  });
  it('tidies typed areas and infers a city typed as an area', () => {
    expect(canonPlace('Raipur', 'shanker nagar, raipur')).toBe('Shankar Nagar');
    expect(canonPlace('Raipur', 'शंकर नगर')).toBe('Shankar Nagar');
    expect(inferCity(['Shankar Nagar Raipur'])).toBe('Raipur');
    expect(inferCity(['Pandri'])).toBe('');
    expect(splitPlaces('Pandri / VIP Road and Telibandha')).toEqual(['Pandri', 'VIP Road', 'Telibandha']);
    expect(suggestAreas('Raipur', 'shan')).toContain('Shankar Nagar');
  });
  it('matching: bare "Raipur" client sees a Shankar Nagar home as a location match', () => {
    const m = calculatePropertyMatch(prop(), req());
    expect(m.breakdown.locationMatch).toBe(true);
    expect(m.score).toBeGreaterThanOrEqual(70);
    const far = calculatePropertyMatch(prop({ city: 'Bhopal' }), req());
    expect(far.breakdown.locationMatch).toBe(false);
    expect(far.score).toBeLessThanOrEqual(40);
  });
  it('matching: Shanker Nagar wish matches Shankar Nagar home better than a far area', () => {
    const exact = calculatePropertyMatch(prop(), req({ preferredLocalities: ['Shanker Nagar'] }));
    const far = calculatePropertyMatch(prop({ locality: 'VIP Road' }), req({ preferredLocalities: ['Shanker Nagar'] }));
    expect(exact.score).toBeGreaterThan(far.score);
    expect(far.breakdown.locationMatch).toBe(false);
  });
  it('matching: client with no city but "Raipur" as the area is kept to Raipur', () => {
    const ok = calculatePropertyMatch(prop(), req({ city: '', preferredLocalities: ['Raipur'] }));
    const no = calculatePropertyMatch(prop({ city: 'Bhopal', locality: 'Arera Colony' }), req({ city: '', preferredLocalities: ['Raipur'] }));
    expect(ok.breakdown.locationMatch).toBe(true);
    expect(no.breakdown.locationMatch).toBe(false);
  });
});
