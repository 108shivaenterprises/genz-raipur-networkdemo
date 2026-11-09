/**
 * v116 — Vastu CRM Smart AI Lead Ingestion & Text Parser.
 * Automatically parses raw WhatsApp forwards, SMS, portal inquiries (99acres, MagicBricks, Meta Ads),
 * and client chats into structured lead fields.
 */

export interface ParsedLeadData {
  name: string;
  phone: string;
  email?: string;
  budgetMin?: number;
  budgetMax?: number;
  unitInterest?: string;
  locality?: string;
  note: string;
  rawConfidence: {
    hasName: boolean;
    hasPhone: boolean;
    hasBudget: boolean;
    hasUnit: boolean;
  };
}

/**
 * Parses Indian currency notation like "3.5 Cr", "80 Lakhs", "1.2 - 1.5 crore", "50L", "2.5cr" into integer Rupees.
 */
export function parseIndianBudget(text: string): { min?: number; max?: number } {
  // Normalize string
  const clean = text.toLowerCase().replace(/,/g, '');

  // Cr pattern: (e.g. 1.5 cr, 2 - 2.5 crore)
  const crRangeRegex = /(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:cr|crore|crores)/i;
  const crRangeMatch = clean.match(crRangeRegex);
  if (crRangeMatch) {
    return {
      min: Math.round(parseFloat(crRangeMatch[1]) * 10_000_000),
      max: Math.round(parseFloat(crRangeMatch[2]) * 10_000_000),
    };
  }

  const singleCrRegex = /(\d+(?:\.\d+)?)\s*(?:cr|crore|crores)\b/i;
  const singleCrMatch = clean.match(singleCrRegex);
  if (singleCrMatch) {
    return {
      max: Math.round(parseFloat(singleCrMatch[1]) * 10_000_000),
    };
  }

  // Lakh pattern: (e.g. 60 - 75 lakhs, 80 lac, 50l)
  const lakhRangeRegex = /(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs|l)\b/i;
  const lakhRangeMatch = clean.match(lakhRangeRegex);
  if (lakhRangeMatch) {
    return {
      min: Math.round(parseFloat(lakhRangeMatch[1]) * 100_000),
      max: Math.round(parseFloat(lakhRangeMatch[2]) * 100_000),
    };
  }

  const singleLakhRegex = /(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs|l)\b/i;
  const singleLakhMatch = clean.match(singleLakhRegex);
  if (singleLakhMatch) {
    return {
      max: Math.round(parseFloat(singleLakhMatch[1]) * 100_000),
    };
  }

  return {};
}

/**
 * Parses raw messy real estate enquiry messages into structured lead format.
 */
export function parseRawLeadText(raw: string): ParsedLeadData {
  const text = raw.trim();

  // 1. Phone extraction: 10-digit Indian phone starting with 6-9
  let phone = '';
  const phoneRegex = /(?:\+?91[\s-]?)?([6-9](?:[\s-]?\d){9})/i;
  const phoneMatch = text.match(phoneRegex);
  if (phoneMatch) {
    phone = phoneMatch[1].replace(/\D/g, '');
  }

  // 2. Email extraction
  let email: string | undefined;
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
  const emailMatch = text.match(emailRegex);
  if (emailMatch) {
    email = emailMatch[1];
  }

  // 3. Name extraction
  let name = '';
  // Check for explicit "Name: ...", "Client: ...", "Customer: ..."
  const explicitNameMatch = text.match(/(?:name|client|customer|buyer)\s*[:=-]\s*([a-zA-Z\s.]+?)(?:[\n,;]|phone|mob|contact|budget|looking)/i);
  if (explicitNameMatch && explicitNameMatch[1].trim().length >= 2) {
    name = explicitNameMatch[1].trim();
  } else {
    // Check for "Mr. / Mrs. / Dr. / Adv. [Name]"
    const prefixMatch = text.match(/(?:mr|mrs|ms|dr|adv|er)\.?\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i);
    if (prefixMatch) {
      name = prefixMatch[0].trim();
    } else {
      // Fallback: Check the first line or words before "looking for"
      const firstLine = text.split('\n')[0].replace(/(?:hi|hello|hey|lead|inquiry|requirement)[:,\s]*/i, '').trim();
      const tokens = firstLine.split(/\s+/);
      if (tokens.length >= 2 && tokens.length <= 4 && /^[a-zA-Z]+$/.test(tokens[0]) && !/looking|need|budget|bhk|flat|call/i.test(tokens[0])) {
        name = tokens.slice(0, 2).join(' ');
      }
    }
  }

  // Clean name
  name = name.replace(/^(?:mr|mrs|ms|dr|adv|er)\.?\s+/i, (m) => m.toUpperCase());

  // 4. Unit interest extraction (BHK, Villa, Studio, Commercial, Plot)
  let unitInterest = '';
  const bhkMatch = text.match(/(\d(?:\.5)?\s*(?:bhk|rk|bedroom|bed)|studio|penthouse|duplex|villa|plot|commercial|office)/i);
  if (bhkMatch) {
    unitInterest = bhkMatch[1].toUpperCase();
  }

  // 5. Budget extraction
  const { min: budgetMin, max: budgetMax } = parseIndianBudget(text);

  // 6. Locality extraction
  let locality = '';
  const inLocalityMatch = text.match(/(?:in|at|near|around|for)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);
  if (inLocalityMatch && !/sale|rent|bhk|budget|urgent|visit/i.test(inLocalityMatch[1])) {
    locality = inLocalityMatch[1].trim();
  }

  return {
    name: name || 'Inbound Lead',
    phone,
    email,
    budgetMin,
    budgetMax,
    unitInterest,
    locality,
    note: text.slice(0, 300),
    rawConfidence: {
      hasName: Boolean(name),
      hasPhone: Boolean(phone),
      hasBudget: Boolean(budgetMax),
      hasUnit: Boolean(unitInterest),
    },
  };
}

