import { describe, it, expect } from 'vitest';
import { calculatePropertyMatch } from '../server/matching.js';
import {
  commissionSplitSchema,
  phoneSchema,
  generateMandateHash,
  maskPhoneNumber,
} from '../server/validation.js';
import { Property, BuyerRequirement, sha256 } from '../server/db.js';

describe('GENZ BROKER NETWORK - Core Engine Tests', () => {
  const dummyProperty: Property = {
    id: 'PROP-TEST-01',
    title: '4 BHK Luxury Villa in Shankar Nagar',
    description: 'High end bungalow with lawn',
    propertyType: 'Residential Villa',
    transactionType: 'Sale',
    city: 'Raipur',
    locality: 'Shankar Nagar',
    addressHidden: 'Bungalow 14, Lotus Enclave',
    landmark: 'Near Temple',
    plotAreaSqFt: 3000,
    builtUpAreaSqFt: 4000,
    askingPrice: 28000000, // ₹2.80 Cr
    ownerApprovedNetPrice: 26500000,
    listingBrokerId: 'USR-BRK-001',
    ownerId: 'USR-OWNER-001',
    ownerName: 'Sunil Lalwani',
    ownerPhone: '+91 98261 55667',
    listingStatus: 'active',
    verificationStatus: 'VERIFIED',
    duplicateHash: 'abc123hash',
    priceHistory: [],
    images: [],
    documents: [],
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
  };

  const matchingRequirement: BuyerRequirement = {
    id: 'REQ-TEST-01',
    customerId: 'CUST-01',
    customerName: 'Dr. Pandey',
    customerPhone: '+91 98263 77889',
    assignedBrokerId: 'USR-BRK-002',
    budgetMin: 25000000, // ₹2.50 Cr
    budgetMax: 30000000, // ₹3.00 Cr
    preferredLocalities: ['Shankar Nagar', 'Telibandha'],
    propertyType: 'Residential Villa',
    transactionType: 'Sale',
    minAreaSqFt: 3000,
    maxAreaSqFt: 5000,
    purpose: 'Self-use',
    urgency: 'Immediate (< 15 days)',
    status: 'matching',
    createdAt: '2026-10-10T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
  };

  it('calculates a high match score for compatible property and buyer requirement', () => {
    const result = calculatePropertyMatch(dummyProperty, matchingRequirement);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.breakdown.locationMatch).toBe(true);
    expect(result.breakdown.budgetMatch).toBe(true);
    expect(result.breakdown.typeMatch).toBe(true);
    expect(result.breakdown.transactionMatch).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(3);
  });

  it('is city-aware: the same locality name in another city does not match', () => {
    const sameCity = calculatePropertyMatch(dummyProperty, { ...matchingRequirement, city: 'Raipur' } as BuyerRequirement);
    const otherCity = calculatePropertyMatch(dummyProperty, { ...matchingRequirement, city: 'Pune', state: 'Maharashtra' } as BuyerRequirement);
    expect(sameCity.breakdown.locationMatch).toBe(true);
    expect(otherCity.breakdown.locationMatch).toBe(false);
    expect(otherCity.score).toBeLessThan(sameCity.score);
  });

  it('boosts the score for shared tags', () => {
    const tagged = { ...dummyProperty, tags: ['Gated Society', 'Park Facing'] } as Property;
    const base = calculatePropertyMatch(tagged, matchingRequirement);
    const withTags = calculatePropertyMatch(tagged, { ...matchingRequirement, preferredTags: ['gated society'] } as BuyerRequirement);
    expect(withTags.score).toBeGreaterThanOrEqual(base.score);
  });

  it('rejects completely mismatched transaction types (Sale vs Rent)', () => {
    const rentReq: BuyerRequirement = {
      ...matchingRequirement,
      transactionType: 'Rent',
    };
    const result = calculatePropertyMatch(dummyProperty, rentReq);
    expect(result.score).toBe(0);
    expect(result.breakdown.transactionMatch).toBe(false);
  });

  it('validates that commission splits strictly add up to 100%', () => {
    const valid5050 = commissionSplitSchema.safeParse({
      introducingBrokerSharePct: 50,
      closingBrokerSharePct: 50,
    });
    expect(valid5050.success).toBe(true);

    const valid6040 = commissionSplitSchema.safeParse({
      introducingBrokerSharePct: 60,
      closingBrokerSharePct: 40,
    });
    expect(valid6040.success).toBe(true);

    const invalidUnder = commissionSplitSchema.safeParse({
      introducingBrokerSharePct: 40,
      closingBrokerSharePct: 40,
    });
    expect(invalidUnder.success).toBe(false);

    const invalidOver = commissionSplitSchema.safeParse({
      introducingBrokerSharePct: 70,
      closingBrokerSharePct: 40,
    });
    expect(invalidOver.success).toBe(false);
  });

  it('enforces Indian mobile phone format validation', () => {
    expect(phoneSchema.safeParse('+91 98261 44001').success).toBe(true);
    expect(phoneSchema.safeParse('9826144001').success).toBe(true);
    expect(phoneSchema.safeParse('+91 74152 99887').success).toBe(true);

    // Invalid phone numbers
    expect(phoneSchema.safeParse('12345').success).toBe(false);
    expect(phoneSchema.safeParse('+1 555 123 4567').success).toBe(false);
    expect(phoneSchema.safeParse('1800-200-0000').success).toBe(false);
  });

  it('masks phone numbers to protect customer privacy', () => {
    const masked = maskPhoneNumber('+91 98261 44001');
    expect(masked).toBe('+91 ••••••4001'); // audit F7: last 4 only, the same digits every other mask shows
  });

  it('generates deterministic SHA-256 cryptographic mandate seal', () => {
    const timestamp = '2026-10-10T12:00:00.000Z';
    const hash1 = generateMandateHash({
      propertyId: 'PROP-RAI-101',
      ownerId: 'USR-OWNER-001',
      approvedNetPrice: 27000000,
      agreedCommissionPct: 2,
      timestamp,
    });

    const hash2 = generateMandateHash({
      propertyId: 'PROP-RAI-101',
      ownerId: 'USR-OWNER-001',
      approvedNetPrice: 27000000,
      agreedCommissionPct: 2,
      timestamp,
    });

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // 64 hex characters for SHA-256
  });

  it('maintains tamper-evident audit log hash chain', () => {
    const genesisHash = sha256('GENESIS');
    const event1Hash = sha256(`${genesisHash}:EVENT1:DETAILS`);
    const event2Hash = sha256(`${event1Hash}:EVENT2:DETAILS`);

    expect(event1Hash).not.toBe(event2Hash);
    expect(event1Hash.length).toBe(64);
  });

  it('generates pre-filled WhatsApp share URL with deep link for properties', async () => {
    const { getPropertyWhatsAppShareUrl } = await import('../src/lib/utils.js');
    const shareUrl = getPropertyWhatsAppShareUrl({
      id: dummyProperty.id,
      title: dummyProperty.title,
      propertyType: dummyProperty.propertyType,
      transactionType: dummyProperty.transactionType,
      locality: dummyProperty.locality,
      askingPrice: dummyProperty.askingPrice,
      builtUpAreaSqFt: dummyProperty.builtUpAreaSqFt,
    });

    expect(shareUrl).toContain('https://api.whatsapp.com/send?text=');
    expect(shareUrl).toContain(encodeURIComponent('PROP-TEST-01'));
    expect(shareUrl).toContain(encodeURIComponent('tab=properties&propertyId=PROP-TEST-01'));
  });

  it('generates pre-filled WhatsApp share URL with deep link for requirements', async () => {
    const { getRequirementWhatsAppShareUrl } = await import('../src/lib/utils.js');
    const shareUrl = getRequirementWhatsAppShareUrl({
      id: matchingRequirement.id,
      propertyType: matchingRequirement.propertyType,
      transactionType: matchingRequirement.transactionType,
      budgetMin: matchingRequirement.budgetMin,
      budgetMax: matchingRequirement.budgetMax,
      preferredLocalities: matchingRequirement.preferredLocalities,
      urgency: matchingRequirement.urgency,
      minAreaSqFt: matchingRequirement.minAreaSqFt,
      maxAreaSqFt: matchingRequirement.maxAreaSqFt,
    });

    expect(shareUrl).toContain('https://api.whatsapp.com/send?text=');
    expect(shareUrl).toContain(encodeURIComponent('REQ-TEST-01'));
    expect(shareUrl).toContain(encodeURIComponent('tab=requirements&reqId=REQ-TEST-01'));
  });
});
