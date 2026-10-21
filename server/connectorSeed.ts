/**
 * Demo data for the GENZ Connector programme (only used with SEED_DEMO_DATA=true):
 * 12 local partners (one per shop type, across India) and exactly 50 referrals covering every
 * referral type and status. All names / numbers are fictional.
 */
import type { UserProfile } from './db.js';
import type { ConnectorReferral, ReferralStatus, ReferralType, ShopType } from '../src/shared/connector.js';
import { REFERRAL_TYPE_IDS, DEFAULT_REWARDS } from '../src/shared/connector.js';
import crypto from 'node:crypto';

const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

interface Partner { id: string; name: string; shop: string; type: ShopType; city: string; state: string; locality: string; phone: string; upi: string }
const PARTNERS: Partner[] = [
  { id: 'USR-CON-001', name: 'Ramesh Gupta', shop: 'Gupta Paan Corner', type: 'PAAN_SHOP', city: 'Raipur', state: 'Chhattisgarh', locality: 'Shankar Nagar', phone: '+91 90000 20001', upi: 'ramesh.gupta@okaxis' },
  { id: 'USR-CON-002', name: 'Sunita Yadav', shop: 'Sunita Chai Adda', type: 'TEA_STALL', city: 'Bhopal', state: 'Madhya Pradesh', locality: 'MP Nagar', phone: '+91 90000 20002', upi: 'sunita.chai@ybl' },
  { id: 'USR-CON-003', name: 'Mohd. Irfan', shop: 'Irfan Fresh Sabzi', type: 'VEGETABLE_VENDOR', city: 'Lucknow', state: 'Uttar Pradesh', locality: 'Aminabad', phone: '+91 90000 20003', upi: 'irfan.sabzi@paytm' },
  { id: 'USR-CON-004', name: 'Dinesh Patel', shop: 'Patel Kirana & General', type: 'KIRANA_STORE', city: 'Ahmedabad', state: 'Gujarat', locality: 'Naranpura', phone: '+91 90000 20004', upi: 'dinesh.patel@oksbi' },
  { id: 'USR-CON-005', name: 'Anita Nair', shop: 'Nair Medicals', type: 'MEDICAL_STORE', city: 'Kochi', state: 'Kerala', locality: 'Edappally', phone: '+91 90000 20005', upi: 'anita.nair@okhdfcbank' },
  { id: 'USR-CON-006', name: 'Sandeep Singh', shop: 'Royal Gents Salon', type: 'SALON_BARBER', city: 'Jaipur', state: 'Rajasthan', locality: 'Vaishali Nagar', phone: '+91 90000 20006', upi: 'sandeep.salon@ybl' },
  { id: 'USR-CON-007', name: 'Kavita Joshi', shop: 'Joshi Xerox & CSC', type: 'STATIONERY_COPY', city: 'Pune', state: 'Maharashtra', locality: 'Kothrud', phone: '+91 90000 20007', upi: 'kavita.csc@okicici' },
  { id: 'USR-CON-008', name: 'Vijay Kumar', shop: 'Vijay Mobile Point', type: 'MOBILE_RECHARGE', city: 'Patna', state: 'Bihar', locality: 'Boring Road', phone: '+91 90000 20008', upi: 'vijay.mobile@paytm' },
  { id: 'USR-CON-009', name: 'Lakshmi Reddy', shop: 'Lakshmi Tiffin Centre', type: 'TIFFIN_DHABA', city: 'Hyderabad', state: 'Telangana', locality: 'Madhapur', phone: '+91 90000 20009', upi: 'lakshmi.tiffin@okaxis' },
  { id: 'USR-CON-010', name: 'Raju Das', shop: 'Auto Stand — Salt Lake', type: 'AUTO_DRIVER', city: 'Kolkata', state: 'West Bengal', locality: 'Salt Lake', phone: '+91 90000 20010', upi: 'raju.das@ybl' },
  { id: 'USR-CON-011', name: 'Harpreet Kaur', shop: 'Sector 22 RWA', type: 'SOCIETY_RWA', city: 'Chandigarh', state: 'Chandigarh', locality: 'Sector 22', phone: '+91 90000 20011', upi: 'harpreet.rwa@oksbi' },
  { id: 'USR-CON-012', name: 'Meena Thakur', shop: 'Mahila Mandal — Bilaspur', type: 'COMMUNITY_MEMBER', city: 'Bilaspur', state: 'Chhattisgarh', locality: 'Sarkanda', phone: '+91 90000 20012', upi: 'meena.thakur@okaxis' },
];

const FIRST = ['Aarav', 'Vivaan', 'Diya', 'Ishaan', 'Kavya', 'Rohan', 'Neha', 'Arjun', 'Pooja', 'Sameer', 'Anjali', 'Karan', 'Priya', 'Manish', 'Ritu', 'Deepak', 'Sneha', 'Yash', 'Nisha', 'Gaurav'];
const LAST = ['Sharma', 'Verma', 'Patel', 'Khan', 'Reddy', 'Nair', 'Singh', 'Das', 'Joshi', 'Mishra', 'Gupta', 'Yadav'];
const BUDGETS = ['around 25 lakh', 'around 40 lakh', '60-80 lakh', 'about 1.2 crore', 'rent up to 15,000/month', 'rent up to 8,000/month', 'plot of 1500 sq.ft', 'two-room renovation', 'not decided yet'];

// 50 referrals: [status, rewardStatus]
const PLAN: Array<[ReferralStatus, 'NONE' | 'APPROVED' | 'PAID']> = [
  ...Array(12).fill(['SUBMITTED', 'NONE']),
  ...Array(8).fill(['CONTACTED', 'NONE']),
  ...Array(6).fill(['QUALIFIED', 'NONE']),
  ...Array(6).fill(['IN_PROGRESS', 'NONE']),
  ...Array(4).fill(['CLOSED_WON', 'NONE']),
  ...Array(3).fill(['CLOSED_WON', 'APPROVED']),
  ...Array(3).fill(['CLOSED_WON', 'PAID']),
  ...Array(4).fill(['CLOSED_LOST', 'NONE']),
  ...Array(2).fill(['DUPLICATE', 'NONE']),
  ...Array(2).fill(['REJECTED', 'NONE']),
] as any;

export function buildConnectorDemo(existing: UserProfile[] = [], now = new Date()): { users: UserProfile[]; referrals: ConnectorReferral[] } {
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000).toISOString();
  const users: UserProfile[] = PARTNERS.map((p, i) => ({
    id: p.id, name: p.name, email: `${p.id.toLowerCase()}@connector.example`, phone: p.phone, role: 'GENZ_CONNECTOR',
    city: p.city, state: p.state, verificationStatus: 'VERIFIED',
    verificationNotes: 'Demo connector partner (shop verified by field visit)',
    createdAt: iso(120 - i * 3),
    connector: { shopType: p.type, shopName: p.shop, locality: p.locality, whatsapp: p.phone, payoutUpi: p.upi },
  }));
  // one connector still waiting for KYC so the admin queue is not empty
  users.push({
    id: 'USR-CON-013', name: 'Pappu Chaurasia', email: 'usr-con-013@connector.example', phone: '+91 90000 20013', role: 'GENZ_CONNECTOR',
    city: 'Indore', state: 'Madhya Pradesh', verificationStatus: 'PENDING', verificationNotes: 'Awaiting shop photo + ID check', createdAt: iso(2),
    connector: { shopType: 'PAAN_SHOP', shopName: 'Pappu Paan Bhandar', locality: 'Vijay Nagar', whatsapp: '+91 90000 20013', payoutUpi: 'pappu.paan@ybl' },
  });

  const nameOf = (id: string, fallback: string) => existing.find(u => u.id === id)?.name ?? fallback;
  const workers = [
    { id: 'USR-BRK-001', name: nameOf('USR-BRK-001', 'Broker 1'), role: 'BROKER' },
    { id: 'USR-BRK-002', name: nameOf('USR-BRK-002', 'Broker 2'), role: 'BROKER' },
    { id: 'USR-BRK-003', name: nameOf('USR-BRK-003', 'Broker 3'), role: 'BROKER' },
    { id: 'USR-CONTRACTOR-001', name: nameOf('USR-CONTRACTOR-001', 'Contractor'), role: 'CONTRACTOR' },
  ];
  const referrals: ConnectorReferral[] = PLAN.map(([status, reward], i) => {
    const p = PARTNERS[i % 12];
    const type: ReferralType = REFERRAL_TYPE_IDS[i % REFERRAL_TYPE_IDS.length];
    const customerName = `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 5) % LAST.length]}`;
    const customerPhone = `+91 9000${String(1 + (i % 9))} ${String(30000 + i * 13).slice(0, 5)}`;
    const created = iso(60 - i);
    const worker = type === 'CONSTRUCTION' ? workers[3] : workers[i % 3];
    const assigned = !['SUBMITTED', 'DUPLICATE', 'REJECTED'].includes(status);
    const events = [{ at: created, byId: p.id, byName: p.name, byRole: 'GENZ_CONNECTOR', action: 'SUBMITTED' }] as ConnectorReferral['events'];
    if (assigned) events.push({ at: iso(59 - i), byId: 'USR-ADMIN-1', byName: 'Pooja Tiwari', byRole: 'ADMIN', action: 'ASSIGNED', note: `Assigned to ${worker.name}` });
    const path: ReferralStatus[] = ['CONTACTED', 'QUALIFIED', 'IN_PROGRESS', 'CLOSED_WON'];
    const upto = status === 'CLOSED_WON' ? 4 : ({ CONTACTED: 1, QUALIFIED: 2, IN_PROGRESS: 3 } as any)[status] ?? 0;
    for (let k = 0; k < upto; k++) events.push({ at: iso(58 - i + k), byId: worker.id, byName: worker.name, byRole: worker.role, action: `STATUS:${path[k]}` });
    if (status === 'CLOSED_LOST') events.push({ at: iso(40 - (i % 10)), byId: worker.id, byName: worker.name, byRole: worker.role, action: 'STATUS:CLOSED_LOST', note: 'Customer postponed the decision' });
    if (status === 'DUPLICATE') events.push({ at: iso(55 - i), byId: 'USR-ADMIN-1', byName: 'Pooja Tiwari', byRole: 'ADMIN', action: 'STATUS:DUPLICATE', note: 'Already registered by another partner' });
    if (status === 'REJECTED') events.push({ at: iso(55 - i), byId: 'USR-ADMIN-1', byName: 'Pooja Tiwari', byRole: 'ADMIN', action: 'STATUS:REJECTED', note: 'Customer could not be reached / not interested' });
    const amount = DEFAULT_REWARDS[type];
    const r: ConnectorReferral = {
      id: `CR-2026-${String(i + 1).padStart(4, '0')}`,
      connectorId: p.id, connectorName: p.name, shopType: p.type, type,
      customerName, customerPhone, customerConsent: true,
      state: p.state, city: p.city, locality: p.locality,
      budgetNote: BUDGETS[i % BUDGETS.length],
      details: `${customerName} asked at ${p.shop}.`,
      status,
      assignedToId: assigned ? worker.id : undefined, assignedToName: assigned ? worker.name : undefined, assignedToRole: assigned ? worker.role : undefined,
      rewardStatus: reward,
      duplicateHash: sha(`${customerPhone.replace(/\D/g, '')}:${type}:${i}`),
      createdAt: created, updatedAt: iso(30 - (i % 25)), events,
    };
    if (reward !== 'NONE') {
      r.rewardAmount = amount; r.rewardApprovedAt = iso(20 - (i % 10));
      events.push({ at: r.rewardApprovedAt, byId: 'USR-ADMIN-1', byName: 'Pooja Tiwari', byRole: 'ADMIN', action: 'REWARD_APPROVED', note: `₹${amount}` });
    }
    if (reward === 'PAID') {
      r.paidAt = iso(10 - (i % 5)); r.payoutReference = `UPI-DEMO-${1000 + i}`;
      events.push({ at: r.paidAt, byId: 'USR-ADMIN-1', byName: 'Pooja Tiwari', byRole: 'ADMIN', action: 'REWARD_PAID', note: r.payoutReference });
    }
    return r;
  });
  return { users, referrals };
}
