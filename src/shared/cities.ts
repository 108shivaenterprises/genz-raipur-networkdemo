/** City helpers shared by the server (growth board) and the UI. Pure functions, no I/O. */

export interface TopCity { name: string; state: string; tier: 1 | 2 }

/** India's major metros and big tier-2 markets — the 12-month expansion list. Order = suggested launch priority tie-breaker. */
export const TOP_CITIES: TopCity[] = [
  { name: 'Raipur', state: 'Chhattisgarh', tier: 1 }, { name: 'Bhilai', state: 'Chhattisgarh', tier: 2 }, { name: 'Bilaspur', state: 'Chhattisgarh', tier: 2 },
  { name: 'Nagpur', state: 'Maharashtra', tier: 1 }, { name: 'Pune', state: 'Maharashtra', tier: 1 }, { name: 'Mumbai', state: 'Maharashtra', tier: 1 }, { name: 'Navi Mumbai', state: 'Maharashtra', tier: 1 }, { name: 'Nashik', state: 'Maharashtra', tier: 2 },
  { name: 'Bhopal', state: 'Madhya Pradesh', tier: 1 }, { name: 'Indore', state: 'Madhya Pradesh', tier: 1 }, { name: 'Jabalpur', state: 'Madhya Pradesh', tier: 2 },
  { name: 'Delhi', state: 'Delhi', tier: 1 }, { name: 'Gurugram', state: 'Haryana', tier: 1 }, { name: 'Noida', state: 'Uttar Pradesh', tier: 1 }, { name: 'Ghaziabad', state: 'Uttar Pradesh', tier: 1 },
  { name: 'Lucknow', state: 'Uttar Pradesh', tier: 1 }, { name: 'Kanpur', state: 'Uttar Pradesh', tier: 2 }, { name: 'Varanasi', state: 'Uttar Pradesh', tier: 2 }, { name: 'Prayagraj', state: 'Uttar Pradesh', tier: 2 },
  { name: 'Jaipur', state: 'Rajasthan', tier: 1 }, { name: 'Ahmedabad', state: 'Gujarat', tier: 1 }, { name: 'Surat', state: 'Gujarat', tier: 1 }, { name: 'Vadodara', state: 'Gujarat', tier: 2 },
  { name: 'Hyderabad', state: 'Telangana', tier: 1 }, { name: 'Bengaluru', state: 'Karnataka', tier: 1 }, { name: 'Chennai', state: 'Tamil Nadu', tier: 1 }, { name: 'Coimbatore', state: 'Tamil Nadu', tier: 2 },
  { name: 'Kochi', state: 'Kerala', tier: 2 }, { name: 'Visakhapatnam', state: 'Andhra Pradesh', tier: 2 },
  { name: 'Kolkata', state: 'West Bengal', tier: 1 }, { name: 'Bhubaneswar', state: 'Odisha', tier: 2 }, { name: 'Ranchi', state: 'Jharkhand', tier: 2 }, { name: 'Patna', state: 'Bihar', tier: 2 },
  { name: 'Chandigarh', state: 'Chandigarh', tier: 1 }, { name: 'Dehradun', state: 'Uttarakhand', tier: 2 },
];

const ALIAS: Record<string, string> = {
  bombay: 'Mumbai', 'new bombay': 'Navi Mumbai', gurgaon: 'Gurugram', bangalore: 'Bengaluru', bengalooru: 'Bengaluru', calcutta: 'Kolkata', madras: 'Chennai',
  poona: 'Pune', baroda: 'Vadodara', trivandrum: 'Thiruvananthapuram', cochin: 'Kochi', allahabad: 'Prayagraj', benares: 'Varanasi', banaras: 'Varanasi',
  'naya raipur': 'Raipur', 'nava raipur': 'Raipur', 'new raipur': 'Raipur', 'new delhi': 'Delhi', 'greater noida': 'Noida', vizag: 'Visakhapatnam', 'new delhi ncr': 'Delhi',
};

/** Canonical city name: trims, collapses spaces, fixes old/alternate names and casing ("gurgaon " → "Gurugram"). */
export function normCity(input: unknown): string {
  const raw = String(input ?? '').replace(/[^\p{L}\p{N}\s.\-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!raw) return '';
  const key = raw.toLowerCase();
  if (ALIAS[key]) return ALIAS[key];
  return raw.split(' ').map(w => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(' ');
}

export type CityStage = 'WAITLIST' | 'SEEDING' | 'LIVE' | 'HUB';

/** Launch ladder by the number of VERIFIED professionals (brokers, builders, contractors, legal) in a city. */
export const CITY_THRESHOLDS = { SEEDING: 5, LIVE: 15, HUB: 40 } as const;

export function cityStage(verifiedPros: number): CityStage {
  if (verifiedPros >= CITY_THRESHOLDS.HUB) return 'HUB';
  if (verifiedPros >= CITY_THRESHOLDS.LIVE) return 'LIVE';
  if (verifiedPros >= CITY_THRESHOLDS.SEEDING) return 'SEEDING';
  return 'WAITLIST';
}

export const STAGE_LABEL: Record<CityStage, { en: string; hi: string }> = {
  WAITLIST: { en: 'Waitlist', hi: 'प्रतीक्षा सूची' },
  SEEDING: { en: 'Seeding', hi: 'शुरुआती चरण' },
  LIVE: { en: 'Live', hi: 'लाइव' },
  HUB: { en: 'City hub', hi: 'सिटी हब' },
};

/** Badges earned from the number of invitees that became VERIFIED members. */
export const INVITER_BADGES = [
  { at: 1, id: 'CONNECTOR', en: 'Network Starter', hi: 'नेटवर्क स्टार्टर' },
  { at: 3, id: 'BUILDER', en: 'Network Builder', hi: 'नेटवर्क बिल्डर' },
  { at: 10, id: 'CHAMPION', en: 'City Champion', hi: 'सिटी चैंपियन' },
  { at: 25, id: 'FOUNDER', en: 'Founding Leader', hi: 'फ़ाउंडिंग लीडर' },
] as const;

export function badgesFor(verifiedInvitees: number) {
  const earned = INVITER_BADGES.filter(b => verifiedInvitees >= b.at);
  const next = INVITER_BADGES.find(b => verifiedInvitees < b.at);
  return { earned, next: next ? { ...next, remaining: next.at - verifiedInvitees } : null };
}
