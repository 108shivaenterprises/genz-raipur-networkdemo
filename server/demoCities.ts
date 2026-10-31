/**
 * v99 — demo accounts OUTSIDE Raipur, so the demo shows that the app is for all of India (and so the QR / bot / deal-room flows can be tried in Pune, Indore and Jaipur).
 * Runs only with SEED_DEMO_DATA=true AND SEED_DEMO_BULK=true, right after server/demoBulk.ts. Everything is FAKE: made-up names, numbers that are not real mobiles, example e-mail domains.
 *   per city: 1 broker · 1 owner · 1 buyer · 5 listings (sale flat, sale flat, rent flat, shop on rent, plot) in that city's real localities
 */
import crypto from 'node:crypto';
import type { DatabaseState, UserProfile, Property } from './db.js';

const DAY = 86_400_000;
export const DEMO_CITY_MARK = 'USR-BRK-PUN';
type Loc = [string, number, number];
const CITIES = [
  { code: 'PUN', city: 'Pune', state: 'Maharashtra', district: 'Pune', pin: '4110', rera: 'P52100', broker: ['Mahesh Kulkarni', 'Baner Homes Pune'], owner: 'Sunita Deshpande', buyer: 'Rahul Joshi',
    locs: [['Baner', 18.5590, 73.7868], ['Kothrud', 18.5074, 73.8077], ['Wakad', 18.5984, 73.7600], ['Viman Nagar', 18.5679, 73.9143], ['Hinjewadi Phase 1', 18.5912, 73.7389]] as Loc[] },
  { code: 'IND', city: 'Indore', state: 'Madhya Pradesh', district: 'Indore', pin: '4520', rera: 'P-IND-18-', broker: ['Pooja Chouhan', 'Vijay Nagar Realty'], owner: 'Anil Bhatnagar', buyer: 'Kavya Solanki',
    locs: [['Vijay Nagar', 22.7533, 75.8937], ['Palasia', 22.7240, 75.8830], ['Bhawarkuan', 22.6930, 75.8690], ['Scheme 78', 22.7560, 75.9080], ['Rau', 22.6350, 75.8000]] as Loc[] },
  { code: 'JAI', city: 'Jaipur', state: 'Rajasthan', district: 'Jaipur', pin: '3020', rera: 'RAJ/P/2019/', broker: ['Rajesh Meena', 'Pink City Properties'], owner: 'Kamla Sharma', buyer: 'Deepak Saini',
    locs: [['Vaishali Nagar', 26.9124, 75.7360], ['Malviya Nagar', 26.8544, 75.8180], ['Mansarovar', 26.8500, 75.7700], ['C-Scheme', 26.9124, 75.8000], ['Jagatpura', 26.8210, 75.8620]] as Loc[] },
];
type Kind = { type: Property['propertyType']; tx: 'Sale' | 'Rent'; title: string; built?: number; plot?: number; lakh: number; tags: string[] };
const KINDS: Kind[] = [
  { type: 'Residential Flat', tx: 'Sale', title: '3 BHK Flat', built: 1480, lakh: 86, tags: ['Lift', 'Covered Parking', 'Gated Community'] },
  { type: 'Residential Flat', tx: 'Sale', title: '2 BHK Flat', built: 1050, lakh: 54, tags: ['Lift', 'Power Backup', 'Bank Loan Available'] },
  { type: 'Residential Flat', tx: 'Rent', title: '2 BHK Flat for Rent', built: 1000, lakh: 0.21, tags: ['Semi-Furnished', 'Covered Parking'] },
  { type: 'Commercial Shop', tx: 'Rent', title: 'Shop on Rent', built: 420, lakh: 0.42, tags: ['Main Road', 'Near Market'] },
  { type: 'Residential Plot', tx: 'Sale', title: 'Residential Plot', plot: 1800, lakh: 64, tags: ['Corner Plot', 'Approved Layout'] },
];

export function seedDemoCities(s: DatabaseState, sharedPasswordHash: string) {
  if (s.users.some(u => u.id === DEMO_CITY_MARK)) return;
  const now = Date.now(); const ago = (d: number) => new Date(now - d * DAY).toISOString();
  const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
  const IMGS = [...new Set(s.properties.flatMap(p => p.images || []))];
  const mk = (id: string, name: string, role: UserProfile['role'], phone: string, company: string, c: typeof CITIES[number], extra: Record<string, unknown> = {}) => {
    const slug = name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
    s.users.push({ id, name, role, phone, email: `${slug}@demo.genz.example`, city: c.city, state: c.state, companyName: company, verificationStatus: 'VERIFIED', verificationNotes: 'Demo account (fake data)',
      createdAt: ago(40), sessionVersion: 1, passwordHash: sharedPasswordHash, ...extra } as UserProfile);
  };
  CITIES.forEach((c, ci) => {
    const brk = `USR-BRK-${c.code}`; const own = `USR-OWNER-${c.code}`; const buy = `USR-BUYER-${c.code}`;
    const ownerPhone = `+91 91${ci + 5}00 ${String(11000 + ci * 7).slice(-5)}`;
    mk(brk, c.broker[0], 'BROKER', `+91 91${ci + 5}10 ${String(21000 + ci * 7).slice(-5)}`, c.broker[1], c, { brokerId: `GZ-BRK-${c.code}001`, reraNumber: `${c.rera}${700 + ci}`, firmSegment: 'INDEPENDENT', referralCode: `GZ-${c.code}-9${ci}01` });
    mk(own, c.owner, 'PROPERTY_OWNER', ownerPhone, 'Individual', c);
    mk(buy, c.buyer, 'BUYER_TENANT', `+91 91${ci + 5}20 ${String(31000 + ci * 7).slice(-5)}`, 'Individual', c);
    KINDS.forEach((k, i) => {
      const [loc, lat, lng] = c.locs[i % c.locs.length];
      const asking = k.tx === 'Sale' ? Math.round(k.lakh * (0.9 + ci * 0.08) * 100_000 / 10_000) * 10_000 : Math.round(k.lakh * (0.9 + ci * 0.08) * 100_000 / 500) * 500;
      const p = {
        id: `PROP-${c.code}-${String(i + 1).padStart(3, '0')}`, title: `${k.title} — ${loc}`, propertyType: k.type, transactionType: k.tx, city: c.city, state: c.state, district: c.district, locality: loc,
        description: `${k.title} in ${loc}, ${c.city}. ${k.built ? `${k.built} sq.ft built-up` : `${k.plot} sq.ft`}${k.tx === 'Sale' ? ', papers ready for registry' : ', available from next month'}. Demo listing (fake data).`,
        tags: [...k.tags], addressHidden: `Plot ${10 + i * 7}, ${loc}, ${c.city} - ${c.pin}${String(10 + i).padStart(2, '0')}`, landmark: 'Near the main chowk', pincode: `${c.pin}${String(10 + i).padStart(2, '0')}`,
        latitude: +(lat + (i - 2) * 0.002).toFixed(5), longitude: +(lng + (i - 2) * 0.002).toFixed(5), locationPrecision: 'APPROXIMATE_LOCALITY',
        plotAreaSqFt: k.plot, builtUpAreaSqFt: k.built, askingPrice: asking, ownerApprovedNetPrice: Math.round(asking * 0.95),
        listingBrokerId: brk, ownerId: own, ownerName: c.owner, ownerPhone, listingStatus: 'active', verificationStatus: 'VERIFIED', duplicateHash: sha(`dmo-city-${c.code}-${i}`),
        priceHistory: [{ price: Math.round(asking * 1.04), changedAt: ago(20 + i), reason: 'Initial listing' }], images: IMGS.length ? [IMGS[(ci * 5 + i) % IMGS.length]] : [], documents: [],
        confirmedAt: ago(i), createdAt: ago(20 + i), updatedAt: ago(i), publicShareOk: true,
      } as unknown as Property;
      if (!p.plotAreaSqFt) delete (p as any).plotAreaSqFt;
      if (!p.builtUpAreaSqFt) delete (p as any).builtUpAreaSqFt;
      s.properties.push(p);
    });
  });
}
