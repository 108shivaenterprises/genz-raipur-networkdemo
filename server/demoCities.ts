/**
 * v99 / v99.2 — the demo outside Raipur: Pune, Indore, Jaipur. They are NOT lighter or different — each city gets the very same network the Raipur demo has
 * (server/demoNetwork.ts: listings · buyer needs · deal rooms in every stage · proposals · owner mandates · construction leads · builder projects · client rooms · legal cases),
 * plus the same extras (shop QRs with leads, rent desk, public page, reviews, a team member). Only the city, its localities and the people's names differ.
 * Runs only with SEED_DEMO_DATA=true AND SEED_DEMO_BULK=true, right after server/demoBulk.ts. Everything is FAKE: made-up names, numbers that are not real mobiles, example e-mail domains.
 */
import type { DatabaseState, UserProfile } from './db.js';
import { seedNetwork, rng, makeHelpers, type Loc, type NetCfg } from './demoNetwork.js';

export const DEMO_CITY_MARK = 'USR-BRK-PUN';

/** per-city shop QRs + leads, rent-desk rows and public-page enquiries — the same shapes the Raipur demo has (see seedDemoPartners / seedDemoRent / seedDemoPage) */
export type PartnerDemo = {
  brokerId: string; city: string;
  shops: { name: string; person: string; phone: string; area: string; status: 'ACTIVE' | 'PENDING'; sale: { mode: 'PCT' | 'FIXED'; value: number }; rent: { mode: 'PCT' | 'FIXED'; value: number }; lockDays: number; scans: number; days: number }[];
  /** shop = index into shops */
  leads: { shop: number; kind: 'BUY' | 'RENT_IN' | 'SELL' | 'RENT_OUT'; name: string; phone: string; locality: string; budget: string; days: number; as?: 'CONTACTED' | 'WON' | 'LOST' | 'VISIT' }[];
  reworked: { name: string; phone: string; area: string; days: number };    // a lead marked lost, then worked again by the broker → the "worked after lost" flag
};
export type RentDemo = { brokerId: string; rows: { place: string; owner: string; ownerPhone: string; tenant: string; tenantPhone: string; rent: number; deposit: number; startDaysAgo: number; kind: 'RUNNING' | 'FRESH' | 'ENDED'; station: string; ref: string }[] };
export type PageDemo = { brokerId: string; colleagueId: string; headline: string; areas: string[]; enquiries: { name: string; phone: string; about: 'OWN' | 'THEIRS' | 'NONE'; message?: string; hours: number; status?: 'NEW' | 'CONTACTED' }[] };

type City = {
  code: string; city: string; state: string; district: string; pin: string; rera: string; reraB: string; phones: number;
  brokers: [string, string][]; owners: string[]; buyers: string[]; contractors: [string, string][]; builders: [string, string][]; legals: [string, string][]; team: [string, string][];
  locs: Loc[]; station: string;
  shops: PartnerDemo['shops']; leads: PartnerDemo['leads']; reworked: PartnerDemo['reworked']; tenancies: RentDemo['rows']; page: Omit<PageDemo, 'brokerId' | 'colleagueId'>;
};
const T = (sale: number, rent = 2000, lock = 180) => ({ sale: { mode: 'PCT' as const, value: sale }, rent: { mode: 'FIXED' as const, value: rent }, lockDays: lock });

const CITIES: City[] = [
  {
    code: 'PUN', city: 'Pune', state: 'Maharashtra', district: 'Pune', pin: '4110', rera: 'P52100', reraB: 'P52100', phones: 120, station: 'Baner police station',
    brokers: [['Mahesh Kulkarni', 'Baner Homes Pune'], ['Sneha Joshi', 'Kothrud Realty Point'], ['Amit Deshmukh', 'Deccan Estates'], ['Priya Patil', 'Wakad Property Hub']],
    owners: ['Sunita Deshpande', 'Dilip Bhosale', 'Meena Gokhale'], buyers: ['Rahul Joshi', 'Isha Kale', 'Tushar Pawar', 'Anjali Gaikwad'],
    contractors: [['Santosh Jadhav', 'Jadhav Constructions'], ['Prakash Shinde', 'Shinde Interiors & Civil']], builders: [['Er. Vikram Chavan', 'Chavan Infra Developers'], ['Ar. Nisha Bhide', 'Bhide Habitat']],
    legals: [['Adv. Meghna Phadke', 'Phadke Law Associates'], ['Adv. Sachin Kulkarni', 'Kulkarni Property Law']], team: [['Rutuja More', 'Telecaller'], ['Ganesh Thorat', 'Site executive']],
    locs: [['Baner', 18.5590, 73.7868], ['Kothrud', 18.5074, 73.8077], ['Wakad', 18.5984, 73.7600], ['Viman Nagar', 18.5679, 73.9143], ['Hinjewadi Phase 1', 18.5912, 73.7389],
      ['Hadapsar', 18.5089, 73.9260], ['Aundh', 18.5580, 73.8075], ['Kharadi', 18.5515, 73.9400], ['Pimple Saudagar', 18.5985, 73.7925], ['Bavdhan', 18.5130, 73.7790]],
    shops: [
      { name: 'Joshi Kirana Store', person: 'Mohan Joshi', phone: '9822011101', area: 'Baner', status: 'ACTIVE', ...T(20), scans: 46, days: 40 },
      { name: 'Sai Medical', person: 'Rakesh Kale', phone: '9822011102', area: 'Kothrud', status: 'PENDING', ...T(15, 1500), scans: 0, days: 2 },
      { name: 'Green Park Society — main gate', person: 'Ramesh (guard)', phone: '9822011103', area: 'Wakad', status: 'ACTIVE', sale: { mode: 'FIXED', value: 10000 }, rent: { mode: 'FIXED', value: 1500 }, lockDays: 120, scans: 18, days: 25 },
    ],
    leads: [
      { shop: 0, kind: 'BUY', name: 'Sanjay Pawar', phone: '9132100001', locality: 'Baner', budget: '60 लाख तक', days: 1 },
      { shop: 0, kind: 'RENT_IN', name: 'Pooja Sathe', phone: '9132100002', locality: 'Kothrud', budget: '15,000 / महीना', days: 6, as: 'CONTACTED' },
      { shop: 0, kind: 'SELL', name: 'Harish Agrawal', phone: '9132100003', locality: 'Baner', budget: '1.2 करोड़', days: 30, as: 'WON' },
      { shop: 0, kind: 'BUY', name: 'Deepak Sonawane', phone: '9132100004', locality: 'Wakad', budget: '40 लाख', days: 20, as: 'LOST' },
      { shop: 2, kind: 'RENT_OUT', name: 'Kavita Jain', phone: '9132100005', locality: 'Wakad', budget: '18,000 / महीना', days: 3 },
      { shop: 2, kind: 'BUY', name: 'Anil Dubey', phone: '9132100006', locality: 'Wakad', budget: '75 लाख', days: 12, as: 'VISIT' },
    ],
    reworked: { name: 'Deepak Sonawane', phone: '9132100004', area: 'Wakad', days: 5 },
    tenancies: [
      { place: '2 BHK flat, Baner', owner: 'Ramesh Agrawal', ownerPhone: '9132200021', tenant: 'Ankit Verma', tenantPhone: '9132200022', rent: 22000, deposit: 66000, startDaysAgo: 310, kind: 'RUNNING', station: 'Baner police station', ref: 'MH-PN-48211' },
      { place: '1 BHK, Kothrud', owner: 'Kavita Sahu', ownerPhone: '9132200023', tenant: 'Rohit Nair', tenantPhone: '9132200024', rent: 14500, deposit: 43500, startDaysAgo: 12, kind: 'FRESH', station: 'Kothrud police station', ref: '' },
      { place: 'Shop 12, Wakad market', owner: 'Harish Jain', ownerPhone: '9132200025', tenant: 'Meena Traders', tenantPhone: '9132200026', rent: 28000, deposit: 84000, startDaysAgo: 400, kind: 'ENDED', station: 'Wakad police station', ref: '' },
    ],
    page: { headline: 'Pune ke verified flat, plot aur dukaan — sahi daam, saaf kaagaz', areas: ['Baner', 'Kothrud', 'Wakad'], enquiries: [
      { name: 'Neha Gupta', phone: '9132100011', about: 'OWN', message: 'Is it still available? We can visit on Sunday.', hours: 2 }, { name: 'Rahul Tiwari', phone: '9132100012', about: 'THEIRS', hours: 20 },
      { name: 'Sunita Yadav', phone: '9132100013', about: 'NONE', message: '2BHK on rent near Kothrud, up to 25,000.', hours: 50, status: 'CONTACTED' } ] },
  },
  {
    code: 'IND', city: 'Indore', state: 'Madhya Pradesh', district: 'Indore', pin: '4520', rera: 'P-IND-18-', reraB: 'P-IND-18-', phones: 140, station: 'Vijay Nagar thana',
    brokers: [['Pooja Chouhan', 'Vijay Nagar Realty'], ['Rohit Jain', 'Palasia Properties'], ['Neha Sharma', 'Scheme 78 Estates'], ['Vikas Solanki', 'Rau Land Bank']],
    owners: ['Anil Bhatnagar', 'Sarita Mandloi', 'Hemant Joshi'], buyers: ['Kavya Solanki', 'Mayank Tiwari', 'Ritu Sethi', 'Deepesh Patidar'],
    contractors: [['Rajesh Malviya', 'Malviya Constructions'], ['Imran Sheikh', 'Sheikh Civil Works']], builders: [['Er. Alok Maheshwari', 'Maheshwari Developers'], ['Ar. Shruti Gupta', 'Gupta Habitat']],
    legals: [['Adv. Rakesh Tomar', 'Tomar Law Chambers'], ['Adv. Smita Joshi', 'Joshi Property Legal']], team: [['Divya Yadav', 'Telecaller'], ['Sunil Rathore', 'Site executive']],
    locs: [['Vijay Nagar', 22.7533, 75.8937], ['Palasia', 22.7240, 75.8830], ['Bhawarkuan', 22.6930, 75.8690], ['Scheme 78', 22.7560, 75.9080], ['Rau', 22.6350, 75.8000],
      ['Saket Nagar', 22.7123, 75.8872], ['Sudama Nagar', 22.6930, 75.8460], ['Nipania', 22.7500, 75.9180], ['Mahalaxmi Nagar', 22.7550, 75.9060], ['Khajrana', 22.7380, 75.9070]],
    shops: [
      { name: 'Mandloi Kirana Store', person: 'Mohan Mandloi', phone: '9826711101', area: 'Vijay Nagar', status: 'ACTIVE', ...T(20), scans: 46, days: 40 },
      { name: 'Sai Medical', person: 'Rakesh Sahu', phone: '9826711102', area: 'Palasia', status: 'PENDING', ...T(15, 1500), scans: 0, days: 2 },
      { name: 'Green Valley Society — main gate', person: 'Ramesh (guard)', phone: '9826711103', area: 'Scheme 78', status: 'ACTIVE', sale: { mode: 'FIXED', value: 10000 }, rent: { mode: 'FIXED', value: 1500 }, lockDays: 120, scans: 18, days: 25 },
    ],
    leads: [
      { shop: 0, kind: 'BUY', name: 'Sanjay Verma', phone: '9133100001', locality: 'Vijay Nagar', budget: '60 लाख तक', days: 1 },
      { shop: 0, kind: 'RENT_IN', name: 'Pooja Sinha', phone: '9133100002', locality: 'Palasia', budget: '15,000 / महीना', days: 6, as: 'CONTACTED' },
      { shop: 0, kind: 'SELL', name: 'Harish Agrawal', phone: '9133100003', locality: 'Vijay Nagar', budget: '1.2 करोड़', days: 30, as: 'WON' },
      { shop: 0, kind: 'BUY', name: 'Deepak Soni', phone: '9133100004', locality: 'Bhawarkuan', budget: '40 लाख', days: 20, as: 'LOST' },
      { shop: 2, kind: 'RENT_OUT', name: 'Kavita Jain', phone: '9133100005', locality: 'Scheme 78', budget: '18,000 / महीना', days: 3 },
      { shop: 2, kind: 'BUY', name: 'Anil Dubey', phone: '9133100006', locality: 'Scheme 78', budget: '75 लाख', days: 12, as: 'VISIT' },
    ],
    reworked: { name: 'Deepak Soni', phone: '9133100004', area: 'Bhawarkuan', days: 5 },
    tenancies: [
      { place: '2 BHK flat, Vijay Nagar', owner: 'Ramesh Agrawal', ownerPhone: '9133200021', tenant: 'Ankit Verma', tenantPhone: '9133200022', rent: 16000, deposit: 32000, startDaysAgo: 310, kind: 'RUNNING', station: 'Vijay Nagar thana', ref: 'MP-IND-48211' },
      { place: '1 BHK, Palasia', owner: 'Kavita Sahu', ownerPhone: '9133200023', tenant: 'Rohit Nair', tenantPhone: '9133200024', rent: 9500, deposit: 19000, startDaysAgo: 12, kind: 'FRESH', station: 'Palasia thana', ref: '' },
      { place: 'Shop 12, Bhawarkuan market', owner: 'Harish Jain', ownerPhone: '9133200025', tenant: 'Meena Traders', tenantPhone: '9133200026', rent: 22000, deposit: 66000, startDaysAgo: 400, kind: 'ENDED', station: 'Bhawarkuan thana', ref: '' },
    ],
    page: { headline: 'Indore ke verified flat, plot aur dukaan — sahi daam, saaf kaagaz', areas: ['Vijay Nagar', 'Palasia', 'Scheme 78'], enquiries: [
      { name: 'Neha Gupta', phone: '9133100011', about: 'OWN', message: 'Is it still available? We can visit on Sunday.', hours: 2 }, { name: 'Rahul Tiwari', phone: '9133100012', about: 'THEIRS', hours: 20 },
      { name: 'Sunita Yadav', phone: '9133100013', about: 'NONE', message: '2BHK on rent near Palasia, up to 15,000.', hours: 50, status: 'CONTACTED' } ] },
  },
  {
    code: 'JAI', city: 'Jaipur', state: 'Rajasthan', district: 'Jaipur', pin: '3020', rera: 'RAJ/P/2019/', reraB: 'RAJ/P/2019/', phones: 160, station: 'Malviya Nagar thana',
    brokers: [['Rajesh Meena', 'Pink City Properties'], ['Sunita Agarwal', 'Malviya Nagar Realty'], ['Anil Shekhawat', 'Vaishali Homes'], ['Kavita Rathore', 'Mansarovar Estates']],
    owners: ['Kamla Sharma', 'Gopal Khandelwal', 'Rekha Purohit'], buyers: ['Deepak Saini', 'Mona Bhatia', 'Lokesh Gurjar', 'Pallavi Mathur'],
    contractors: [['Bhanwar Singh', 'Singh Constructions'], ['Aslam Khan', 'Khan Civil & Interiors']], builders: [['Er. Manish Goyal', 'Goyal Realty Developers'], ['Ar. Pooja Kothari', 'Kothari Habitat']],
    legals: [['Adv. Narendra Sharma', 'Sharma Law Associates'], ['Adv. Rina Chaudhary', 'Chaudhary Property Law']], team: [['Kajal Soni', 'Telecaller'], ['Mukesh Jangid', 'Site executive']],
    locs: [['Vaishali Nagar', 26.9124, 75.7360], ['Malviya Nagar', 26.8544, 75.8180], ['Mansarovar', 26.8500, 75.7700], ['C-Scheme', 26.9124, 75.8000], ['Jagatpura', 26.8210, 75.8620],
      ['Tonk Road', 26.8720, 75.8030], ['Bani Park', 26.9340, 75.7940], ['Sodala', 26.9035, 75.7740], ['Raja Park', 26.9010, 75.8330], ['Sirsi Road', 26.9000, 75.7280]],
    shops: [
      { name: 'Sharma Kirana Store', person: 'Mohan Sharma', phone: '9829011101', area: 'Malviya Nagar', status: 'ACTIVE', ...T(20), scans: 46, days: 40 },
      { name: 'Sai Medical', person: 'Rakesh Saini', phone: '9829011102', area: 'Mansarovar', status: 'PENDING', ...T(15, 1500), scans: 0, days: 2 },
      { name: 'Green City Society — main gate', person: 'Ramesh (guard)', phone: '9829011103', area: 'Vaishali Nagar', status: 'ACTIVE', sale: { mode: 'FIXED', value: 10000 }, rent: { mode: 'FIXED', value: 1500 }, lockDays: 120, scans: 18, days: 25 },
    ],
    leads: [
      { shop: 0, kind: 'BUY', name: 'Sanjay Verma', phone: '9134100001', locality: 'Malviya Nagar', budget: '60 लाख तक', days: 1 },
      { shop: 0, kind: 'RENT_IN', name: 'Pooja Sinha', phone: '9134100002', locality: 'Mansarovar', budget: '15,000 / महीना', days: 6, as: 'CONTACTED' },
      { shop: 0, kind: 'SELL', name: 'Harish Agrawal', phone: '9134100003', locality: 'Malviya Nagar', budget: '1.2 करोड़', days: 30, as: 'WON' },
      { shop: 0, kind: 'BUY', name: 'Deepak Soni', phone: '9134100004', locality: 'Jagatpura', budget: '40 लाख', days: 20, as: 'LOST' },
      { shop: 2, kind: 'RENT_OUT', name: 'Kavita Jain', phone: '9134100005', locality: 'Vaishali Nagar', budget: '18,000 / महीना', days: 3 },
      { shop: 2, kind: 'BUY', name: 'Anil Dubey', phone: '9134100006', locality: 'Vaishali Nagar', budget: '75 लाख', days: 12, as: 'VISIT' },
    ],
    reworked: { name: 'Deepak Soni', phone: '9134100004', area: 'Jagatpura', days: 5 },
    tenancies: [
      { place: '2 BHK flat, Malviya Nagar', owner: 'Ramesh Agrawal', ownerPhone: '9134200021', tenant: 'Ankit Verma', tenantPhone: '9134200022', rent: 16000, deposit: 32000, startDaysAgo: 310, kind: 'RUNNING', station: 'Malviya Nagar thana', ref: 'RJ-JP-48211' },
      { place: '1 BHK, Mansarovar', owner: 'Kavita Sahu', ownerPhone: '9134200023', tenant: 'Rohit Nair', tenantPhone: '9134200024', rent: 9500, deposit: 19000, startDaysAgo: 12, kind: 'FRESH', station: 'Mansarovar thana', ref: '' },
      { place: 'Shop 12, Raja Park market', owner: 'Harish Jain', ownerPhone: '9134200025', tenant: 'Meena Traders', tenantPhone: '9134200026', rent: 22000, deposit: 66000, startDaysAgo: 400, kind: 'ENDED', station: 'Raja Park thana', ref: '' },
    ],
    page: { headline: 'Jaipur ke verified flat, plot aur dukaan — sahi daam, saaf kaagaz', areas: ['Malviya Nagar', 'Mansarovar', 'Vaishali Nagar'], enquiries: [
      { name: 'Neha Gupta', phone: '9134100011', about: 'OWN', message: 'Is it still available? We can visit on Sunday.', hours: 2 }, { name: 'Rahul Tiwari', phone: '9134100012', about: 'THEIRS', hours: 20 },
      { name: 'Sunita Yadav', phone: '9134100013', about: 'NONE', message: '2BHK on rent near Mansarovar, up to 15,000.', hours: 50, status: 'CONTACTED' } ] },
  },
];

/** the demo broker of each city and what his extras are — read by seedDemoPartners / seedDemoRent / seedDemoPage / seedDemoReviews so every city has the same screens filled as Raipur */
export const DEMO_CITY_PARTNERS: PartnerDemo[] = CITIES.map(c => ({ brokerId: `USR-BRK-${c.code}`, city: c.city, shops: c.shops, leads: c.leads, reworked: c.reworked }));
export const DEMO_CITY_RENT: RentDemo[] = CITIES.map(c => ({ brokerId: `USR-BRK-${c.code}`, rows: c.tenancies }));
export const DEMO_CITY_PAGES: PageDemo[] = CITIES.map(c => ({ brokerId: `USR-BRK-${c.code}`, colleagueId: `USR-BRK-${c.code}-2`, ...c.page }));
export const DEMO_CITY_BROKERS: { brokerId: string; city: string; state: string }[] = CITIES.map(c => ({ brokerId: `USR-BRK-${c.code}`, city: c.city, state: c.state }));

/** the id of the n-th person of a kind in a city: the first keeps the short id (USR-BRK-PUN), the rest get -2, -3 … */
const pid = (kind: string, code: string, n: number) => `USR-${kind}-${code}${n ? `-${n + 1}` : ''}`;

const STAGES: NetCfg['stages'] = ['Lead', 'Introduction', 'Introduction', 'Site Visit Done', 'Site Visit Done', 'Site Visit Done', 'Negotiation', 'Negotiation', 'Agreement', 'Handover', 'Settled', 'Disputed'];

export function seedDemoCities(s: DatabaseState, sharedPasswordHash: string) {
  if (s.users.some(u => u.id === DEMO_CITY_MARK)) return;
  const tpl = [s.users.find(u => u.id === 'USR-TEAM-001'), s.users.find(u => u.id === 'USR-TEAM-002')];
  CITIES.forEach((c, ci) => {
    const r = rng(20261021 + 977 * (ci + 1));
    const h = makeHelpers(s, r, c.phones);
    const { int, ago, ph, pad } = h;
    const mk = (id: string, name: string, role: UserProfile['role'], phone: string, company: string, extra: Record<string, unknown> = {}): UserProfile => {
      const slug = name.toLowerCase().replace(/^(dr|er|ar|adv)\.\s*/, '').replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
      const u = { id, name, role, phone, email: `${slug}.${c.code.toLowerCase()}@demo.genz.example`, city: c.city, state: c.state, companyName: company, verificationStatus: 'VERIFIED', verificationNotes: 'Demo account (fake data)',
        createdAt: ago(int(20, 120)), sessionVersion: 1, passwordHash: sharedPasswordHash, ...extra } as UserProfile;
      s.users.push(u); return u;
    };
    const brokers = c.brokers.map(([n, co], i) => mk(pid('BRK', c.code, i), n, 'BROKER', ph(1001, i + 1), co, { brokerId: `GZ-BRK-${c.code}${pad(1 + i)}`, reraNumber: `${c.rera}${700 + ci * 10 + i}`, firmSegment: i === 0 ? 'BIG_FIRM' : 'INDEPENDENT', referralCode: `GZ-${c.code}-9${ci}0${1 + i}` }));
    const owners = c.owners.map((n, i) => mk(pid('OWNER', c.code, i), n, 'PROPERTY_OWNER', ph(1002, i + 1), 'Individual'));
    const buyers = c.buyers.map((n, i) => mk(pid('BUYER', c.code, i), n, 'BUYER_TENANT', ph(1003, i + 1), 'Individual'));
    const contractors = c.contractors.map(([n, co], i) => mk(pid('CONTRACTOR', c.code, i), n, 'CONTRACTOR', ph(1004, i + 1), co, { verificationNotes: 'Registered contractor (demo)' }));
    const builders = c.builders.map(([n, co], i) => mk(pid('BUILDER', c.code, i), n, 'DEVELOPER_BUILDER', ph(1005, i + 1), co, { reraNumber: `${c.reraB}B${100 + ci * 10 + i}` }));
    const legals = c.legals.map(([n, co], i) => mk(pid('LEGAL', c.code, i), n, 'LEGAL_COUNSEL', ph(1006, i + 1), co, { verificationNotes: 'Enrolled advocate — title & registry work (demo)' }));

    // the employees of the first broker, as in Raipur (a telecaller + a site executive; same permissions as Raipur's demo team)
    const boss = brokers[0]; const team = c.team.map(([n, title], i) => mk(`USR-TEAM-${c.code}${i + 1}`, n, 'TEAM_MEMBER', ph(1011, i + 1), boss.companyName || 'Team',
      { employerId: boss.id, employerRole: boss.role, teamTitle: title, consent: { policyVersion: '2026-10-01', acceptedAt: ago(0), ip: `employer-attested:${boss.id}` }, verificationNotes: `Added by ${boss.name} (demo).`, ...(tpl[i]?.teamPolicy ? { teamPolicy: JSON.parse(JSON.stringify(tpl[i]!.teamPolicy)) } : {}) }));

    const cfg: NetCfg = { tag: c.code, city: c.city, state: c.state, district: c.district, pin4: c.pin, reraB: c.reraB, locs: c.locs, nProps: 30, nReqs: 20, stages: STAGES, nRooms: 10, nProjects: 3, listingBroker: (i, n) => ([0, 1, 2, 7, 9].includes(i % 16) ? 0 : 1 + (i % (n - 1))) };
    seedNetwork(s, { cfg, h, brokers, owners, buyers, contractors, builders, legals, featured: brokers.map(b => b.id), team: { brokerId: boss.id, memberId: team[0].id }, extraTargetProjects: [] });
  });
}
