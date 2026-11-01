/**
 * v100 — a price that cannot be real: the common typo (a missing 0, "45000" for "45 lakh") and the bait price of a fake listing.
 * Only the clearly impossible is stopped — a wide band per square foot, by kind of property — so a village plot or a Mumbai flat both pass.
 * Nothing is checked when the area is unknown.
 */
const CHEAP_OK = new Set(['Agricultural Land', 'Farm House', 'Industrial Plot', 'Warehouse / Godown']);   // land sold by the acre can be a few ₹ per sq ft
export interface PriceFacts { transactionType?: string; propertyType?: string; askingPrice?: number; builtUpAreaSqFt?: number; plotAreaSqFt?: number }
export function priceProblem(p: PriceFacts): string | null {
  const price = Number(p.askingPrice) || 0; const area = Number(p.builtUpAreaSqFt) || Number(p.plotAreaSqFt) || 0;
  if (!(price > 0) || !(area >= 50)) return null;
  const per = price / area; const rent = p.transactionType === 'Rent' || p.transactionType === 'Lease';
  const type = String(p.propertyType || '');
  if (rent) {
    if (per < 1) return `₹${Math.round(price).toLocaleString('en-IN')} a month for ${Math.round(area)} sq ft is below ₹1 per sq ft — please check the rent (a zero may be missing).`;
    if (per > 1000) return `₹${Math.round(price).toLocaleString('en-IN')} a month for ${Math.round(area)} sq ft is above ₹1,000 per sq ft a month — please check the rent.`;
    return null;
  }
  if (!CHEAP_OK.has(type) && per < 150) return `₹${Math.round(price).toLocaleString('en-IN')} for ${Math.round(area)} sq ft is below ₹150 per sq ft — please check the price (a zero or the “lakh / crore” may be missing).`;
  if (per > 500000) return `₹${Math.round(price).toLocaleString('en-IN')} for ${Math.round(area)} sq ft is above ₹5,00,000 per sq ft — please check the price.`;
  return null;
}
