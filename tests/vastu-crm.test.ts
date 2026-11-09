import { describe, it, expect } from 'vitest';
import { parseIndianBudget, parseRawLeadText } from '../src/shared/vastuAiParser.js';

describe('Vastu CRM AI Indian Budget Parser', () => {
  it('parses single Crore amounts', () => {
    expect(parseIndianBudget('Budget is 3.5 cr')).toEqual({ max: 35_000_000 });
    expect(parseIndianBudget('Looking under 2 Crore')).toEqual({ max: 20_000_000 });
    expect(parseIndianBudget('Max 1.25crores')).toEqual({ max: 12_500_000 });
  });

  it('parses Crore budget ranges (min to max)', () => {
    expect(parseIndianBudget('Budget: 1.5 - 2.2 Cr')).toEqual({
      min: 15_000_000,
      max: 22_000_000,
    });
    expect(parseIndianBudget('3 to 4.5 crore')).toEqual({
      min: 30_000_000,
      max: 45_000_000,
    });
  });

  it('parses Lakh amounts and Lakh ranges', () => {
    expect(parseIndianBudget('Budget 85 lakhs')).toEqual({ max: 8_500_000 });
    expect(parseIndianBudget('Around 60 - 75 lac')).toEqual({
      min: 6_000_000,
      max: 7_500_000,
    });
    expect(parseIndianBudget('approx 50L')).toEqual({ max: 5_000_000 });
  });

  it('returns empty object when no budget notation exists', () => {
    expect(parseIndianBudget('Need 2 BHK ready to move')).toEqual({});
  });
});

describe('Vastu CRM Smart WhatsApp / Chat Lead Extraction', () => {
  it('parses WhatsApp forward with explicit fields', () => {
    const raw = `*New Inbound Inquiry*
Name: Rajesh Sharma
Phone: 9820123456
Email: rajesh.sharma@gmail.com
Looking for 3 BHK in Worli
Budget: 3.5 - 4.5 Cr
Client ready to visit this Sunday.`;

    const parsed = parseRawLeadText(raw);

    expect(parsed.name).toBe('Rajesh Sharma');
    expect(parsed.phone).toBe('9820123456');
    expect(parsed.email).toBe('rajesh.sharma@gmail.com');
    expect(parsed.unitInterest).toBe('3 BHK');
    expect(parsed.budgetMin).toBe(35_000_000);
    expect(parsed.budgetMax).toBe(45_000_000);
    expect(parsed.rawConfidence.hasName).toBe(true);
    expect(parsed.rawConfidence.hasPhone).toBe(true);
    expect(parsed.rawConfidence.hasBudget).toBe(true);
  });

  it('parses natural conversational chat without explicit labels', () => {
    const raw = `Hi, Mr. Alok Singhania looking for a 2 BHK in Bandra West. Budget is around 2.8 Crore. Call me on +91 98765 43210 after 4 PM.`;

    const parsed = parseRawLeadText(raw);

    expect(parsed.name).toBe('MR. Alok Singhania');
    expect(parsed.phone).toBe('9876543210');
    expect(parsed.unitInterest).toBe('2 BHK');
    expect(parsed.budgetMax).toBe(28_000_000);
    expect(parsed.rawConfidence.hasPhone).toBe(true);
  });

  it('handles Portal / Meta Lead Ads format', () => {
    const raw = `MagicBricks Lead:
Customer: Priya Nair
Contact: 9811122233
Interest: Villa in Whitefield
Budget: 1.8 Cr`;

    const parsed = parseRawLeadText(raw);

    expect(parsed.name).toBe('Priya Nair');
    expect(parsed.phone).toBe('9811122233');
    expect(parsed.unitInterest).toBe('VILLA');
    expect(parsed.budgetMax).toBe(18_000_000);
  });
});

