/**
 * Bulk demo data — so every role opens a full app instead of an empty one.
 * Runs only with SEED_DEMO_DATA=true AND SEED_DEMO_BULK=true (the Vercel public demo turns both on; tests do not).
 *
 *   accounts : 15 brokers · 12 owners · 12 buyers · 11 contractors · 11 builders · 10 legal counsellors (with the base seed)
 *   records  : ~45 listings · 30 requirements · 16 deal rooms (every stage, tasks, agreements, chat, visits) · offers ·
 *              owner mandates · construction leads · builder projects with units, partners, CRM leads and bookings ·
 *              client rooms · legal cases · disputes · invitations
 *
 * Everything is FAKE (made-up names, numbers that are not real mobiles, example e-mail domains) and generated from a fixed
 * random seed, so every server instance of the demo builds exactly the same records (same ids) on a cold start.
 */
import crypto from 'node:crypto';
import type { DatabaseState, UserProfile, Property, DealRoom } from './db.js';
import type { UserRole } from './permissions.js';
import { seedNetwork, rng, type Loc } from './demoNetwork.js';

const DAY = 86_400_000;
const MARK = 'USR-BRK-005';

export function seedDemoBulk(s: DatabaseState, sharedPasswordHash: string) {
  if (s.users.some(u => u.id === MARK)) return;
  const r = rng(20261021);
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const now = Date.now();
  const ago = (d: number, h = 0) => new Date(now - d * DAY - h * 3_600_000).toISOString();
  const ahead = (d: number, h = 0) => new Date(now + d * DAY + h * 3_600_000).toISOString();
  const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
  const tok = (n = 12) => sha(String(r())).slice(0, n);
  const pad = (n: number, w = 3) => String(n).padStart(w, '0');
  const lakh = (n: number) => Math.round(n / 10_000) * 10_000;
  const S: any = s;

  // ───────────── people ─────────────
  const mk = (id: string, name: string, role: UserRole, phone: string, company: string, extra: Partial<UserProfile> = {}): UserProfile => {
    const slug = name.toLowerCase().replace(/^(dr|er|ar|adv)\.\s*/, '').replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
    const u = {
      id, name, role, phone, email: `${slug}@demo.genz.example`, city: 'Raipur', state: 'Chhattisgarh', companyName: company,
      verificationStatus: 'VERIFIED', verificationNotes: 'Demo account (fake data)', createdAt: ago(int(20, 120)),
      sessionVersion: 1, passwordHash: sharedPasswordHash, ...extra,
    } as UserProfile;
    s.users.push(u);
    return u;
  };
  const ph = (block: number, i: number) => `+91 9${block} ${String(10000 + i).slice(-5)}`; // +91 91xxx yyyyy — not real numbers

  const brokerSeed: [string, string, string][] = [
    ['Rahul Sahu', 'Sahu Properties', 'Raipur'], ['Sneha Tiwari', 'Tiwari Realty Point', 'Raipur'], ['Manoj Dewangan', 'Dewangan Estates', 'Bhilai'],
    ['Kavita Chandrakar', 'Chandrakar Land Bank', 'Raipur'], ['Arvind Verma', 'Verma Homes', 'Durg'], ['Nisha Agrawal', 'Agrawal Property Hub', 'Raipur'],
    ['Deepak Sinha', 'Sinha Realtors', 'Bilaspur'], ['Ritu Shrivastava', 'Capital Nest Realty', 'Raipur'], ['Sandeep Jain', 'Jain Commercial Spaces', 'Raipur'],
    ['Pankaj Yadav', 'Yadav Plots & Farms', 'Raipur'], ['Shalini Mishra', 'Mishra Rentals', 'Raipur'],
  ];
  brokerSeed.forEach(([n, c, city], i) => mk(`USR-BRK-${pad(5 + i)}`, n, 'BROKER', ph(1001, i + 1), c, {
    city, brokerId: `GZ-BRK-4920${pad(10 + i, 2)}`, reraNumber: `CGRERA0102${pad(24 + i, 2)}A00${pad(10 + i, 2)}`,
    firmSegment: i % 3 === 0 ? 'BIG_FIRM' : 'INDEPENDENT', verificationStatus: i === 9 || i === 10 ? 'PENDING' : 'VERIFIED',
    referralCode: `GZ-${n.slice(0, 4).toUpperCase()}-${1010 + i}`,
  } as any));
  const ownerSeed = ['Ramesh Agrawal', 'Sushma Gupta', 'Vinod Choubey', 'Anita Sahu', 'Prakash Jain', 'Meera Tiwari', 'Harish Lalwani', 'Geeta Verma', 'Mohan Dewangan', 'Kiran Thakur'];
  ownerSeed.forEach((n, i) => mk(`USR-OWNER-${pad(3 + i)}`, n, 'PROPERTY_OWNER', ph(1002, i + 1), 'Individual', i === 8 ? { verificationStatus: 'PENDING' as const } : {}));
  const buyerSeed = ['Dr. Saurabh Mishra', 'Priyanka Rao', 'Ankit Tripathi', 'Neha Bansal', 'Rohit Kashyap', 'Swati Pandey', 'Vivek Singh', 'Pooja Chandrakar', 'Abhishek Soni', 'Kritika Jain'];
  buyerSeed.forEach((n, i) => mk(`USR-BUYER-${pad(3 + i)}`, n, 'BUYER_TENANT', ph(1003, i + 1), 'Individual'));
  const contractorSeed: [string, string][] = [
    ['Rajkumar Sahu', 'Sahu Constructions'], ['Ajay Nishad', 'Nishad Interiors'], ['Bhupendra Verma', 'Verma Civil Contractors'], ['Firoz Khan', 'Khan Structural Works'],
    ['Lalit Dewangan', 'Dewangan Builders & Repairs'], ['Satish Patel', 'Patel Turnkey Homes'], ['Manish Gupta', 'Gupta Fitouts'], ['Raju Yadav', 'Yadav Earthmovers'], ['Hemant Sinha', 'Sinha Architects & Sanctions'],
  ];
  contractorSeed.forEach(([n, c], i) => mk(`USR-CONTRACTOR-${pad(3 + i)}`, n, 'CONTRACTOR', ph(1004, i + 1), c, { verificationNotes: 'PWD class-B registration (demo)' }));
  const builderSeed: [string, string][] = [
    ['Er. Vikas Goyal', 'Goyal Infra Developers'], ['Ar. Shweta Bhatia', 'Bhatia Habitat'], ['Er. Naveen Choudhary', 'Choudhary Estates Pvt Ltd'], ['Er. Rakesh Mittal', 'Mittal Township'],
    ['Ar. Payal Saluja', 'Saluja Greens'], ['Er. Arun Kedia', 'Kedia Commercial Realty'], ['Er. Sunil Bajaj', 'Bajaj Heights'], ['Er. Tarun Bothra', 'Bothra Landmark'], ['Er. Gaurav Daga', 'Daga Plotted Developments'],
  ];
  builderSeed.forEach(([n, c], i) => mk(`USR-BUILDER-${pad(3 + i)}`, n, 'DEVELOPER_BUILDER', ph(1005, i + 1), c, { reraNumber: `CGRERAP1501${pad(25 + i, 2)}B00${pad(10 + i, 2)}`, verificationStatus: i === 8 ? 'PENDING' : 'VERIFIED' }));
  const legalSeed: [string, string][] = [
    ['Adv. Sanjay Shukla', 'Shukla Law Associates'], ['Adv. Rashmi Tiwari', 'Tiwari & Partners'], ['Adv. Imran Qureshi', 'Qureshi Legal'], ['Adv. Pratibha Sahu', 'Sahu Chambers'],
    ['Adv. Ashish Dubey', 'Dubey Property Law'], ['Adv. Neelima Verma', 'Verma Legal Desk'], ['Adv. Rajiv Agrawal', 'Agrawal & Co. Advocates'], ['Adv. Mamta Jain', 'Jain Title Services'],
  ];
  legalSeed.forEach(([n, c], i) => mk(`USR-LEGAL-${pad(3 + i)}`, n, 'LEGAL_COUNSEL', ph(1006, i + 1), c, { reraNumber: `CG/${2300 + i * 37}/20${10 + i}`, verificationNotes: 'Enrolled advocate — title & registry work (demo)' }));

  const byRole = (role: UserRole) => s.users.filter(u => u.role === role);
  const brokers = byRole('BROKER').filter(u => u.verificationStatus === 'VERIFIED');
  const owners = byRole('PROPERTY_OWNER');
  const buyers = byRole('BUYER_TENANT');
  const contractors = byRole('CONTRACTOR');
  const builders = byRole('DEVELOPER_BUILDER');
  const legals = byRole('LEGAL_COUNSEL');
  const user = (id: string) => s.users.find(u => u.id === id) || brokers[0];
  const digits = (p: string) => p.replace(/\D/g, '').slice(-10);

  // ───────────── the network itself: listings → needs → deal rooms → proposals → mandates → leads → projects → client rooms → legal cases ─────────────
  // (shared with every other demo city — see server/demoNetwork.ts)
  const RAIPUR_STAGES: DealRoom['stage'][] = ['Lead', 'Lead', 'Introduction', 'Introduction', 'Site Visit Done', 'Site Visit Done', 'Site Visit Done', 'Negotiation', 'Negotiation', 'Negotiation', 'Agreement', 'Agreement', 'Handover', 'Settled', 'Settled', 'Disputed'];
  const RAIPUR_LOCS: Loc[] = [
    ['Shankar Nagar', 21.2475, 81.6600], ['Telibandha', 21.2380, 81.6640], ['Civil Lines', 21.2420, 81.6390], ['VIP Road', 21.2240, 81.6880], ['Avanti Vihar', 21.2410, 81.6700],
    ['Pachpedi Naka', 21.2190, 81.6650], ['Mowa', 21.2690, 81.6720], ['Saddu', 21.2820, 81.6790], ['Amlidih', 21.2660, 81.6880], ['Kota', 21.2480, 81.6040],
    ['Tatibandh', 21.2590, 81.5810], ['Devendra Nagar', 21.2560, 81.6510], ['Samta Colony', 21.2420, 81.6200], ['Katora Talab', 21.2370, 81.6280], ['Naya Raipur Sector 21', 21.1680, 81.7860],
    ['Labhandih', 21.2280, 81.6950], ['Daldal Seoni', 21.2750, 81.6950], ['Fafadih', 21.2530, 81.6360], ['Sundar Nagar', 21.2300, 81.6420], ['Kachna', 21.2720, 81.7050],
  ];
  seedNetwork(s, {
    cfg: { tag: 'DMO', city: 'Raipur', state: 'Chhattisgarh', district: 'Raipur', pin4: '4920', reraB: 'CGRERAP1501', locs: RAIPUR_LOCS, nProps: 45, nReqs: 30, stages: RAIPUR_STAGES, nRooms: 14, nProjects: 99 },
    h: { r, int, pick, now, ago, ahead, sha, tok, pad, lakh, user, digits, ph },
    brokers, owners, buyers, contractors, builders, legals,
    featured: ['USR-BRK-001', 'USR-BRK-002', 'USR-BRK-003', 'USR-BRK-004'],
    team: { brokerId: 'USR-BRK-001', memberId: 'USR-TEAM-001' },
    extraTargetProjects: ['PROJ-RAI-01'],
  });


  // ───────────── invitations (admin) ─────────────
  ['BROKER', 'BROKER', 'PROPERTY_OWNER', 'DEVELOPER_BUILDER', 'LEGAL_COUNSEL'].forEach((role, i) => S.invitations.push({
    id: `INV-DMO-${i + 1}`, code: `GZ-DEMO-${1000 + i}`, invitedEmail: `invite${i + 1}@demo.genz.example`, invitedPhone: ph(1010, i + 1), targetRole: role, issuedBy: i % 2 ? 'USR-ADMIN-1' : 'USR-SUPERADMIN', status: 'PENDING', expiresAt: ahead(10 + i), createdAt: ago(i + 1),
  }));
}
