import { Property, BuyerRequirement, MatchScore } from './db.js';
import { RELATED_TYPE_GROUPS, sameCity } from '../src/shared/india.js';
import { localityFit, inferCity } from '../src/shared/places.js';

export function calculatePropertyMatch(property: Property, requirement: BuyerRequirement): MatchScore {
  let score = 0;
  const reasons: string[] = [];

  // 1. Transaction Type Match (Sale vs Rent)
  const transactionMatch = property.transactionType === requirement.transactionType;
  if (transactionMatch) {
    score += 20;
    reasons.push(`Exact transaction match: ${property.transactionType}`);
  } else {
    reasons.push(`Mismatched transaction type (${property.transactionType} vs ${requirement.transactionType})`);
    return {
      propertyId: property.id,
      requirementId: requirement.id,
      score: 0,
      breakdown: {
        locationMatch: false,
        budgetMatch: false,
        typeMatch: false,
        areaMatch: false,
        transactionMatch: false,
      },
      reasons: ['Incompatible transaction intent (Sale vs Lease/Rent)'],
    };
  }

  // 2. Property Type Match
  const typeMatch = property.propertyType === requirement.propertyType;
  if (typeMatch) {
    score += 25;
    reasons.push(`Exact property category match: ${property.propertyType}`);
  } else {
    // Partial credit for neighbouring categories (e.g. Commercial Office ~ Commercial Shop, Flat ~ Builder Floor)
    const related = RELATED_TYPE_GROUPS.some(g => g.includes(property.propertyType) && g.includes(requirement.propertyType));
    if (related) {
      score += 12;
      reasons.push(`Related category match (${property.propertyType} ~ ${requirement.propertyType})`);
    } else {
      reasons.push(`Different property classification`);
    }
  }

  // 3. Location Match — India-wide: the city must agree first, then the area inside it.
  // v90: a client who wrote only "Raipur" (or nothing) is happy with any area of Raipur; "Shanker Nagar" = "Shankar Nagar, Raipur";
  // an area in the same zone of the city is a near match. A city typed in the locality box counts as the city.
  const reqCity = requirement.city || inferCity(requirement.preferredLocalities);
  const sameCityOrUnknown = !reqCity || sameCity(reqCity, property.city);
  const fit = sameCityOrUnknown ? localityFit(property.city || reqCity, requirement.preferredLocalities, property.locality) : { level: 'none' as const };
  const locationMatch = sameCityOrUnknown && fit.level !== 'none';

  if (sameCityOrUnknown && fit.level === 'exact') {
    score += 25;
    reasons.push(`Prime location alignment in ${property.locality}, ${property.city}`);
  } else if (sameCityOrUnknown && fit.level === 'city') {
    score += 20;
    reasons.push(`Client is open to any area of ${property.city} — ${property.locality} fits`);
  } else if (sameCityOrUnknown && fit.level === 'near') {
    score += 16;
    reasons.push(`Nearby area: ${property.locality} is close to ${fit.hit}`);
  } else if (!sameCityOrUnknown) {
    reasons.push(`Different city (${property.city} vs requested ${reqCity})`);
  } else if (reqCity && sameCity(reqCity, property.city)) {
    score += 5;
    reasons.push(`City match: ${property.city} (outside the preferred localities)`);
  }

  // 4. Budget Compatibility
  let budgetMatch = false;
  const price = property.askingPrice;
  if (price >= requirement.budgetMin && price <= requirement.budgetMax) {
    score += 20;
    budgetMatch = true;
    reasons.push(`Asking price ₹${(price / 100000).toFixed(1)}L sits inside target budget (₹${(requirement.budgetMin / 100000).toFixed(1)}L - ₹${(requirement.budgetMax / 100000).toFixed(1)}L)`);
  } else if (price < requirement.budgetMin) {
    // Even better bargain
    score += 15;
    budgetMatch = true;
    reasons.push(`High value: Asking price ₹${(price / 100000).toFixed(1)}L is below maximum budget cap`);
  } else if (price <= requirement.budgetMax * 1.1) {
    // Negotiable within 10%
    score += 10;
    budgetMatch = true;
    reasons.push(`Within 10% negotiation margin of buyer's upper budget`);
  } else {
    reasons.push(`Above target budget range`);
  }

  // 5. Area Match
  let areaMatch = true;
  const propArea = property.builtUpAreaSqFt || property.plotAreaSqFt || 0;
  if (requirement.minAreaSqFt || requirement.maxAreaSqFt) {
    const min = requirement.minAreaSqFt || 0;
    const max = requirement.maxAreaSqFt || Infinity;
    if (propArea >= min && propArea <= max) {
      score += 10;
      reasons.push(`Built-up space (${propArea} sq.ft) satisfies floor space criteria`);
    } else if (propArea > 0 && propArea >= min * 0.9) {
      score += 5;
      reasons.push(`Area (${propArea} sq.ft) close to requested specifications`);
    } else {
      areaMatch = false;
      reasons.push(`Area (${propArea} sq.ft) deviates from requested bounds`);
    }
  } else {
    score += 10; // No strict area constraint
  }

  // 6. Tag overlap (amenities / features the buyer asked for) — bonus only when the buyer listed tags
  const wanted = (requirement.preferredTags || []).map(t => t.toLowerCase());
  if (wanted.length > 0) {
    const have = new Set((property.tags || []).map(t => t.toLowerCase()));
    const hit = wanted.filter(t => have.has(t));
    if (hit.length > 0) {
      score += Math.round((hit.length / wanted.length) * 8);
      reasons.push(`Matches ${hit.length}/${wanted.length} requested tags`);
    }
  }

  // A different city is never a good match, whatever the price
  if (!sameCityOrUnknown) score = Math.min(score, 40);

  // Verification bonus
  if (property.verificationStatus === 'VERIFIED') {
    reasons.push(`Verified property documents & RERA compliance checked`);
  }

  return {
    propertyId: property.id,
    requirementId: requirement.id,
    score: Math.min(100, Math.max(0, score)),
    breakdown: {
      locationMatch,
      budgetMatch,
      typeMatch,
      areaMatch,
      transactionMatch,
    },
    reasons,
  };
}
