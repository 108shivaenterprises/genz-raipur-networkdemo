/**
 * v99.2 — ONE demo network, any city.
 * The same records the Raipur demo has (listings · buyer needs · deal rooms in every stage with duties, agreements, chat, visits ·
 * proposals · owner mandates · construction leads · builder projects with units and CRM · client rooms · disputes · legal cases)
 * are made here for whichever city it is told to — only the city, state, localities, id family and the people change.
 * server/demoBulk.ts calls it for Raipur (id family "DMO"); server/demoCities.ts calls it for Pune, Indore and Jaipur.
 * Everything is FAKE. Raipur's output is unchanged by this file (checked record-for-record).
 */
import crypto from 'node:crypto';
import type { DatabaseState, UserProfile, Property, BuyerRequirement, DealRoom, SiteVisit, OwnerMandate, ConstructionLead, Dispute, BuilderProject, SalesAssociateMandate, InventoryUnit, ClientRoom } from './db.js';
import type { CrmLead, CrmBooking } from '../src/types/crm.js';
import { secret } from './auth.js';
import { RENT_TASK_OVERRIDES } from './dealTemplates.js';
import { seal, vaultReady } from './vaultCrypto.js';

export const DAY = 86_400_000;
export type Loc = [string, number, number];

/** a seeded random stream — the same seed always gives the same demo */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** what differs from one city to the next — nothing else does */
export type NetCfg = {
  tag: string;                         // id family: DMO (Raipur) · PUN · IND · JAI
  city: string; state: string; district: string;
  pin4: string;                        // first 4 digits of the city's pincodes
  reraB: string;                       // prefix of a builder project's RERA number
  locs: Loc[];                         // the city's real localities (name, lat, lng)
  nProps: number; nReqs: number; stages: DealRoom['stage'][]; nRooms: number; nProjects: number;
  /** which broker lists the i-th property (Raipur: every 5th broker). The small demo cities give the FIRST broker — the demo log-in — every kind of home: a sale flat, a rent flat, a shop, a plot … */
  listingBroker?: (i: number, n: number) => number;
};
export type Helpers = {
  r: () => number; int: (a: number, b: number) => number; pick: <T>(a: readonly T[]) => T; now: number;
  ago: (d: number, h?: number) => string; ahead: (d: number, h?: number) => string; sha: (v: string) => string; tok: (n?: number) => string;
  pad: (n: number, w?: number) => string; lakh: (n: number) => number; user: (id: string) => UserProfile; digits: (p: string) => string; ph: (block: number, i: number) => string;
};
export type NetCtx = {
  cfg: NetCfg; h: Helpers;
  brokers: UserProfile[]; owners: UserProfile[]; buyers: UserProfile[]; contractors: UserProfile[]; builders: UserProfile[]; legals: UserProfile[];
  featured: string[];                  // the brokers a demo log-in lands on — most deal rooms / proposals / client rooms have one of them on a side
  team?: { brokerId: string; memberId: string };
  extraTargetProjects: string[];       // base-seed projects that also get a target bonus (Raipur only)
};

/** the helper bundle for a city: phones in a block of their own so no two cities share a number */
export function makeHelpers(s: DatabaseState, r: () => number, phOffset = 0): Helpers {
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const now = Date.now();
  const ago = (d: number, h = 0) => new Date(now - d * DAY - h * 3_600_000).toISOString();
  const ahead = (d: number, h = 0) => new Date(now + d * DAY + h * 3_600_000).toISOString();
  const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
  const tok = (n = 12) => sha(String(r())).slice(0, n);
  const pad = (n: number, w = 3) => String(n).padStart(w, '0');
  const lakh = (n: number) => Math.round(n / 10_000) * 10_000;
  const user = (id: string) => s.users.find(u => u.id === id)!;
  const digits = (p: string) => p.replace(/\D/g, '').slice(-10);
  const ph = (block: number, i: number) => `+91 9${block + phOffset} ${String(10000 + i).slice(-5)}`; // +91 91xxx yyyyy — not real numbers
  return { r, int, pick, now, ago, ahead, sha, tok, pad, lakh, user, digits, ph };
}

export function seedNetwork(s: DatabaseState, ctx: NetCtx) {
  const { cfg, h, brokers, owners, buyers, contractors, builders, legals } = ctx;
  const { r, int, pick, now, ago, ahead, sha, tok, pad, lakh, user, digits, ph } = h;
  const S: any = s;
  const mt = cfg.tag === 'DMO' ? '' : `${cfg.tag}-`;   // Raipur's client-room chat ids keep their old shape

  // ───────────── listings ─────────────
  const LOC = cfg.locs;
  type Kind = { type: Property['propertyType']; tx: 'Sale' | 'Rent' | 'Lease'; title: string; built?: [number, number]; plot?: [number, number]; price: [number, number]; tags: string[] };
  const KINDS: Kind[] = [
    { type: 'Residential Flat', tx: 'Sale', title: '3 BHK Flat', built: [1350, 1850], price: [55, 115], tags: ['Lift', 'Covered Parking', 'Gated Community', 'Ready to Move'] },
    { type: 'Residential Flat', tx: 'Sale', title: '2 BHK Flat', built: [950, 1250], price: [32, 62], tags: ['Lift', 'Power Backup', 'Bank Loan Available'] },
    { type: 'Residential Flat', tx: 'Rent', title: '2 BHK Flat for Rent', built: [950, 1300], price: [0.12, 0.26], tags: ['Semi-Furnished', 'Covered Parking', 'Near Market'] },
    { type: 'Independent House', tx: 'Sale', title: 'Independent House', built: [1800, 3200], plot: [1200, 2400], price: [78, 210], tags: ['East Facing', 'Vastu Compliant', 'Clear Title'] },
    { type: 'Residential Villa', tx: 'Sale', title: '4 BHK Villa', built: [3200, 4600], plot: [2400, 3600], price: [190, 340], tags: ['Gated Community', 'Clubhouse', 'Garden / Park'] },
    { type: 'Builder Floor', tx: 'Sale', title: 'Builder Floor', built: [1400, 2000], price: [52, 95], tags: ['North Facing', 'Registry Ready'] },
    { type: 'Penthouse', tx: 'Sale', title: 'Duplex Penthouse', built: [3000, 4200], price: [220, 360], tags: ['Lift', 'Swimming Pool', 'Gym'] },
    { type: 'Residential Plot', tx: 'Sale', title: 'Residential Plot', plot: [1000, 3000], price: [24, 92], tags: ['Corner Plot', 'Approved Layout', 'Converted / NA Land'] },
    { type: 'Commercial Shop', tx: 'Sale', title: 'Ground-floor Shop', built: [250, 800], price: [32, 120], tags: ['Main Road', 'Mall / High Street'] },
    { type: 'Commercial Shop', tx: 'Rent', title: 'Shop on Rent', built: [300, 900], price: [0.25, 0.85], tags: ['Main Road', 'Near Market'] },
    { type: 'Commercial Office', tx: 'Rent', title: 'Office Space', built: [800, 3000], price: [0.45, 1.6], tags: ['Lift', 'Power Backup', 'Furnished'] },
    { type: 'Showroom', tx: 'Lease', title: 'Showroom on Lease', built: [1500, 4000], price: [1.2, 3.5], tags: ['Highway Facing', 'Main Road'] },
    { type: 'Warehouse / Godown', tx: 'Rent', title: 'Warehouse', built: [5000, 20000], price: [0.7, 2.6], tags: ['Warehouse Grade', 'Near Highway'] },
    { type: 'Commercial Plot', tx: 'Sale', title: 'Commercial Plot', plot: [2000, 6000], price: [90, 320], tags: ['Main Road', 'Corner Plot'] },
    { type: 'Agricultural Land', tx: 'Sale', title: 'Agricultural Land', plot: [43560, 217800], price: [40, 260], tags: ['Farm Land', 'Clear Title'] },
    { type: 'Farm House', tx: 'Sale', title: 'Farm House', built: [1500, 2600], plot: [21780, 43560], price: [85, 190], tags: ['Farm Land', 'Garden / Park'] },
  ];
  const IMGS = [...new Set([...s.properties.flatMap(p => p.images || []), ...s.builderProjects.flatMap(p => p.images || [])])];
  const props: Property[] = [];
  for (let i = 0; i < cfg.nProps; i++) {
    const k = KINDS[i % KINDS.length];
    const [loc, lat, lng] = LOC[(i * 7) % LOC.length];
    const owner = owners[Math.floor(i / 3) % owners.length];
    const brk = brokers[cfg.listingBroker ? cfg.listingBroker(i, brokers.length) : (i * 5) % brokers.length];
    const priceCr = k.price[0] + r() * (k.price[1] - k.price[0]);
    const asking = k.tx === 'Sale' ? lakh(priceCr * 100_000) : Math.round((priceCr * 100_000) / 500) * 500;
    const created = int(4, 70);
    const built = k.built ? int(k.built[0], k.built[1]) : undefined;
    const plot = k.plot ? int(k.plot[0], k.plot[1]) : undefined;
    const p = {
      id: `PROP-${cfg.tag}-${pad(i + 1)}`, title: `${k.title} — ${loc}`, propertyType: k.type, transactionType: k.tx, city: cfg.city, state: cfg.state, district: cfg.city, locality: loc,
      description: `${k.title} in ${loc}, ${cfg.city}. ${built ? `${built} sq.ft built-up` : `${plot} sq.ft`}${k.tx === 'Sale' ? ', papers ready for registry' : ', available from next month'}. Demo listing (fake data).`,
      tags: [...k.tags], addressHidden: `House / Plot ${int(4, 220)}, ${loc}, ${cfg.city} - ${cfg.pin4}${pad(int(1, 20), 2)}`, landmark: `Near ${pick(['Main Chowk', 'Shiv Mandir', 'Government School', 'Petrol Pump', 'Gurudwara', 'City Hospital'])}`,
      pincode: `${cfg.pin4}${pad(int(1, 20), 2)}`, latitude: +(lat + (r() - 0.5) * 0.01).toFixed(5), longitude: +(lng + (r() - 0.5) * 0.01).toFixed(5), locationPrecision: 'APPROXIMATE_LOCALITY',
      plotAreaSqFt: plot, builtUpAreaSqFt: built, askingPrice: asking, ownerApprovedNetPrice: Math.round(asking * 0.95),
      listingBrokerId: brk.id, ownerId: owner.id, ownerName: owner.name, ownerPhone: owner.phone,
      listingStatus: i >= cfg.nProps - 2 ? 'pending_verification' : 'active', verificationStatus: i >= cfg.nProps - 2 ? 'PENDING' : 'VERIFIED',
      duplicateHash: sha(`dmo-${i}`), priceHistory: [{ price: Math.round(asking * 1.05), changedAt: ago(created), reason: 'Initial listing' }, ...(i % 4 === 0 ? [{ price: asking, changedAt: ago(Math.max(1, created - 10)), reason: 'Owner revised the price' }] : [])],
      images: IMGS.length ? [IMGS[i % IMGS.length], IMGS[(i + 3) % IMGS.length]] : [], documents: [],
      confirmedAt: ago(int(0, 9)), createdAt: ago(created), updatedAt: ago(int(0, 6)),
    } as Property;
    if (!p.plotAreaSqFt) delete p.plotAreaSqFt;
    if (!p.builtUpAreaSqFt) delete p.builtUpAreaSqFt;
    props.push(p);
  }
  s.properties.push(...props);

  // ───────────── requirements (half of them shaped after a listing, so Match Center has real matches) ─────────────
  const reqs: BuyerRequirement[] = [];
  const baseIx = (i: number) => (i * 3 + Math.floor(i / 15)) % cfg.nProps;
  const PURPOSE: BuyerRequirement['purpose'][] = ['Self-use', 'Investment', 'Rental Yield', 'Commercial Relocation'];
  const URGENCY: BuyerRequirement['urgency'][] = ['Immediate (< 15 days)', 'Moderate (1-3 months)', 'Exploratory (3-6 months)'];
  const extraNames = ['Sanjay Bhagat', 'Rekha Sharma', 'Aman Khanduja', 'Divya Thakur', 'Kunal Gupta', 'Farhan Siddiqui', 'Lata Netam', 'Gopal Rao', 'Tanvi Shah', 'Harsh Vardhan', 'Rupesh Sahu', 'Isha Kaushik', 'Manoj Lakra', 'Snehal Patil', 'Yash Chandrakar', 'Bhavna Dixit', 'Om Prakash', 'Rani Sonkar'];
  for (let i = 0; i < cfg.nReqs; i++) {
    const base = props[baseIx(i)];
    const buyer = i < buyers.length ? buyers[i] : undefined;
    const name = buyer?.name || extraNames[(i - buyers.length) % extraNames.length];
    const phone = buyer?.phone || ph(1007, i + 1);
    let brk = brokers[(i * 7 + 3) % brokers.length];
    if (brk.id === base.listingBrokerId) brk = brokers[(i * 7 + 4) % brokers.length];
    const tight = i % 2 === 0;
    const req = {
      id: `REQ-${cfg.tag}-${pad(i + 1)}`, customerId: `CUST-${cfg.tag}-${pad(i + 1)}`, buyerId: buyer?.id, customerName: name, customerPhone: phone, assignedBrokerId: brk.id,
      budgetMin: Math.round(base.askingPrice * (tight ? 0.85 : 0.7)), budgetMax: Math.round(base.askingPrice * (tight ? 1.12 : 1.3)), city: cfg.city, state: cfg.state,
      preferredLocalities: [base.locality, LOC[(i * 5 + 1) % LOC.length][0]], preferredTags: base.tags?.slice(0, 2) || [],
      propertyType: base.propertyType, transactionType: base.transactionType,
      minAreaSqFt: base.builtUpAreaSqFt ? Math.round(base.builtUpAreaSqFt * 0.8) : base.plotAreaSqFt ? Math.round(base.plotAreaSqFt * 0.8) : undefined,
      maxAreaSqFt: base.builtUpAreaSqFt ? Math.round(base.builtUpAreaSqFt * 1.3) : base.plotAreaSqFt ? Math.round(base.plotAreaSqFt * 1.3) : undefined,
      purpose: base.transactionType === 'Sale' ? pick(PURPOSE.slice(0, 2)) : base.propertyType.startsWith('Commercial') || base.propertyType === 'Showroom' || base.propertyType === 'Warehouse / Godown' ? 'Commercial Relocation' : 'Self-use',
      urgency: URGENCY[i % 3], status: i % 3 === 0 ? 'matching' : 'active', createdAt: ago(int(2, 40)), updatedAt: ago(int(0, 5)),
    } as BuyerRequirement;
    if (!req.buyerId) delete req.buyerId;
    if (req.minAreaSqFt === undefined) { delete req.minAreaSqFt; delete req.maxAreaSqFt; }
    reqs.push(req);
  }
  s.requirements.push(...reqs);

  // ───────────── deal rooms (every stage) ─────────────
  const tplTasks = s.dealTasks.filter(t => t.dealId === 'DEAL-2026-001');
  const tplAgr = s.commissionAgreements.find(a => a.dealId === 'DEAL-2026-001');
  const STAGES = cfg.stages;
  const DONE_BY: Record<string, number> = { Lead: 0, Introduction: 1, 'Site Visit Done': 4, Negotiation: 5, Agreement: 9, Handover: 11, Settled: 13, Disputed: 5 };
  const STAGE_IX: Record<string, number> = { Lead: 0, Introduction: 1, 'Site Visit Done': 2, Negotiation: 3, Agreement: 4, Handover: 5, Settled: 6, Disputed: 3 };
  const CHAT = [
    ['Namaste ji, client ne listing dekhi hai — weekend par visit fix karte hain?', 'Ji bilkul, Saturday 11 baje theek rahega. Owner ko inform kar deta hoon.'],
    ['Client loan pre-approval le aaye hain, papers share kar diye hain.', 'Badiya. Title papers vault me daal diye hain, legal check ke liye bhej rahe hain.'],
    ['Owner thoda negotiable hain, final figure kal tak bata denge.', 'Theek hai, client ko bhi same bata deta hoon.'],
    ['Registry ki date Sub-Registrar office se confirm ho gayi.', 'Perfect. Stamp duty challan ready rakhte hain.'],
    ['Visit ke baad client ko floor plan chahiye tha, bhej diya.', 'Thank you ji, owner ko feedback mil gaya.'],
  ];
  const deals: DealRoom[] = [];
  const visits: SiteVisit[] = [];
  const featured = ctx.featured;
  STAGES.forEach((stage, i) => {
    const req = reqs[i];
    const base = props[baseIx(i)];
    // the demo log-ins should see deals: put USR-BRK-001..004 on one side of most rooms
    let closing = user(base.listingBrokerId);
    let intro = user(req.assignedBrokerId);
    if (i < Math.round(STAGES.length * 0.75)) {
      const f = user(featured[i % featured.length]);
      if (i % 2 === 0 && f.id !== intro.id) { closing = f; base.listingBrokerId = f.id; } else if (f.id !== closing.id) { intro = f; req.assignedBrokerId = f.id; }
    }
    if (intro.id === closing.id) intro = brokers.find(b => b.id !== closing.id)!;
    req.status = stage === 'Settled' ? 'fulfilled' : 'in_deal_room';
    const id = `DEAL-${cfg.tag}-${pad(i + 1)}`;
    const stalled = i === 5 || i === 8;
    const createdD = stalled ? int(30, 40) : int(6, 35);
    const fee = base.transactionType === 'Sale' ? Math.round(base.askingPrice * 0.02) : base.askingPrice;
    const introPct = i % 3 === 0 ? 60 : 50;
    const six = STAGE_IX[stage];
    if (stage === 'Settled') { base.listingStatus = base.transactionType === 'Sale' ? 'sold' : 'rented'; base.soldAt = ago(int(2, 8)); base.soldVia = 'NETWORK'; }
    else if (six >= 3) base.listingStatus = 'under_negotiation';
    const legal = legals[i % legals.length];
    const contractor = contractors[i % contractors.length];
    const lastTouch = stalled ? int(16, 24) : int(0, 4);
    const d: DealRoom = {
      id, propertyId: base.id, requirementId: req.id, introducingBrokerId: intro.id, closingBrokerId: closing.id, ownerId: base.ownerId, customerId: req.customerId,
      stage, totalCommissionExpected: fee, introducingBrokerSharePct: introPct, closingBrokerSharePct: 100 - introPct,
      ownerRemunerationConfirmed: six >= 2, ownerProtectionExpiresAt: ahead(i === 3 ? 4 : int(12, 45)), siteVisitsCount: six >= 2 ? (i % 2) + 1 : 0,
      agreementHash: sha(id), dealValue: six >= 4 ? base.askingPrice : undefined,
      settlementStatus: stage === 'Settled' ? 'PAID' : stage === 'Handover' ? 'DUE' : stage === 'Disputed' ? 'DISPUTED' : six >= 4 ? 'AGREED' : 'PROPOSED',
      notes: `${base.title}: ${req.customerName} (${req.purpose}). Demo deal room.`, createdAt: ago(createdD), updatedAt: ago(lastTouch),
      ...(i % 4 === 0 && ctx.team && (intro.id === ctx.team.brokerId || closing.id === ctx.team.brokerId) ? { teamMemberIds: [ctx.team.memberId] } : {}),
    } as DealRoom;
    if (d.dealValue === undefined) delete d.dealValue;
    deals.push(d);

    // tasks — the same 13 steps as the base demo deal, mapped onto this room's people
    const map = (x?: string) => x === 'USR-BRK-002' ? intro.id : x === 'USR-BRK-001' ? closing.id : x === 'USR-LEGAL-001' ? legal.id : x === 'USR-CONTRACTOR-001' ? contractor.id : x;
    const done = DONE_BY[stage];
    const tAt = (k: number) => stalled ? ago(createdD - k) : new Date(Math.min(Date.parse(d.createdAt) + (k + 1) * 1.5 * DAY, now - (14 - k) * 3_600_000)).toISOString();
    tplTasks.forEach((t0: any, k: number) => {
      const t: any = JSON.parse(JSON.stringify(t0));
      t.id = `TSK-${cfg.tag}-${pad(i + 1)}-${pad(k + 1, 2)}`; t.dealId = id;
      // v60 — a rent / lease demo deal shows the rental duties, as a real one does
      const rentDef = base.transactionType !== 'Sale' ? RENT_TASK_OVERRIDES[t.taskKey] : undefined;
      if (rentDef?.title) t.title = rentDef.title;
      if (rentDef?.description) t.description = rentDef.description;
      if (rentDef?.na) { t.isApplicable = false; t.notApplicableReason = rentDef.na; }
      for (const f of ['assignedParticipantId', 'responsibleParticipantId', 'reviewingParticipantId', 'acceptedBy', 'verifiedBy']) if (t[f]) t[f] = map(t[f]);
      t.supportingParticipantIds = (t.supportingParticipantIds || []).map(map);
      t.assignedParticipantName = user(t.assignedParticipantId)?.name || t.assignedParticipantName;
      t.dueDate = new Date(Date.parse(d.createdAt) + (k + 2) * 3 * DAY).toISOString();
      t.evidenceAttachments = []; t.reassignmentHistory = []; t.disputeHistory = [];
      delete t.completionTimestamp; delete t.completionNote; delete t.verifiedBy; delete t.verifiedAt; delete t.verificationNotes;
      t.acceptedAt = tAt(0);
      if (k === 12 && stage === 'Settled') { t.taskStatus = 'WAIVED'; t.verificationStatus = 'VERIFIED'; }
      else if (k < done) {
        t.taskStatus = 'COMPLETED'; t.completionTimestamp = tAt(k + 1); t.completionNote = 'Done and logged on the platform (demo).';
        if (k === done - 1 && stage !== 'Settled' && i % 2 === 0) t.verificationStatus = 'UNVERIFIED';
        else { t.verificationStatus = 'VERIFIED'; t.verifiedBy = t.reviewingParticipantId; t.verifiedAt = tAt(k + 1); }
      } else if (k < done + 2) {
        t.taskStatus = 'IN_PROGRESS'; t.verificationStatus = 'UNVERIFIED';
        if (i % 3 === 1) t.dueDate = ago(int(1, 4)); // a few overdue
      } else {
        t.taskStatus = 'NOT_STARTED'; t.verificationStatus = 'UNVERIFIED';
        if (six <= 1 && k < done + 4) { t.assignmentAcceptance = 'PENDING_ACCEPTANCE'; delete t.acceptedAt; delete t.acceptedBy; }
      }
      s.dealTasks.push(t);
    });

    // commission agreement: sent for signature in Negotiation, active from Agreement on
    if (tplAgr && six >= 3) {
      const a: any = JSON.parse(JSON.stringify(tplAgr));
      const pending = stage === 'Negotiation';
      a.id = `AGR-${id}-V1`; a.dealId = id; a.status = pending ? 'SENT_TO_PARTICIPANTS' : stage === 'Settled' ? 'COMPLETED' : stage === 'Disputed' ? 'DISPUTED' : 'ACTIVE';
      a.totalAgreedBrokerage = fee; a.dealValue = base.askingPrice;
      const people = [intro, closing]; const pcts = [introPct, 100 - introPct];
      a.allocations = a.allocations.slice(0, 2).map((al: any, j: number) => ({ ...al, participantId: people[j].id, participantName: people[j].name, allocationPct: pcts[j], allocationAmount: Math.round(fee * pcts[j] / 100), paidAmount: stage === 'Settled' ? Math.round(fee * pcts[j] / 100) : 0, entitlementStatus: stage === 'Settled' ? 'PAID' : stage === 'Handover' ? 'RECEIVABLE' : 'AGREED' }));
      const met = stage === 'Settled' ? 3 : stage === 'Handover' ? 2 : stage === 'Agreement' ? 1 : 0;
      a.paymentTriggers = a.paymentTriggers.map((tr: any, j: number) => ({ ...tr, amount: Math.round(fee * tr.percentage / 100), isMet: j < met, confirmedAt: j < met ? ago(int(1, 10)) : undefined }));
      a.requiredApprovals = people.map((p, j) => {
        const signed = !pending || j === 1;
        return signed
          ? { userId: p.id, userName: p.name, role: 'BROKER', hasAccepted: true, acceptedAt: ago(int(3, 12)), signatureAuditTrail: { signerName: p.name, signerEmail: p.email, ipAddress: '103.88.23.x (demo)', authMethod: 'COMPLIANT_E_SIGN_PKEY', timestamp: ago(int(3, 12)), cryptoHash: sha(`${id}-${p.id}`) } }
          : { userId: p.id, userName: p.name, role: 'BROKER', hasAccepted: false };
      });
      a.proposedBy = closing.id; a.proposedByName = closing.name; a.proposalReason = `Co-brokerage on ${base.title} (demo).`;
      a.cryptoSealHash = sha(a.id); a.createdAt = ago(int(8, 14)); a.updatedAt = ago(int(0, 7));
      s.commissionAgreements.push(a);
    }

    // chat
    const lines = CHAT[i % CHAT.length];
    const msgAt = (k: number) => stalled ? ago(lastTouch + 2 - k) : ago(Math.max(0, lastTouch + 2 - k), int(1, 9));
    [closing, intro].forEach((p, k) => s.dealMessages.push({ id: `MSG-${cfg.tag}-${pad(i + 1)}-${k + 1}`, dealRoomId: id, senderId: p.id, senderName: p.name, senderRole: 'BROKER', text: lines[k], timestamp: msgAt(k) } as any));
    if (i % 3 === 0) s.dealMessages.push({ id: `MSG-${cfg.tag}-${pad(i + 1)}-3`, dealRoomId: id, senderId: intro.id, senderName: intro.name, senderRole: 'BROKER', audience: 'BROKERS', text: 'Brokerage split wahi rakhte hain jo agreement me likha hai.', timestamp: msgAt(2) } as any);

    // visits: done ones from "Site Visit Done" on, an upcoming one for the early rooms, one waiting for the property side to verify
    const vbase = { dealRoomId: id, propertyId: base.id, brokerId: intro.id, customerName: req.customerName, customerPhone: digits(req.customerPhone) };
    if (six >= 2) for (let k = 0; k < d.siteVisitsCount; k++) {
      const m = k % 2 === 0 ? 'OTP' : 'QR';
      visits.push({ ...vbase, id: `SV-${cfg.tag}-${pad(i + 1)}-${k + 1}`, scheduledTime: ago(createdD - 3 - k * 2), otpCode: String(int(100000, 999999)), qrToken: tok(16), isVerified: true, verifiedAt: ago(createdD - 3 - k * 2, -1), verificationMethod: m, feedbackNotes: pick(['Client liked the layout, asked for final price.', 'Visited with family, wants to compare one more option.', 'Ventilation and road width liked. Next: papers.']), createdAt: ago(createdD - 1) } as SiteVisit);
    }
    if (six <= 1) visits.push({ ...vbase, id: `SV-${cfg.tag}-${pad(i + 1)}-U`, scheduledTime: ahead(int(1, 5), int(2, 8)), otpCode: String(int(100000, 999999)), qrToken: tok(16), isVerified: false, verificationMethod: 'OTP', createdAt: ago(1) } as SiteVisit);
    if (stage === 'Site Visit Done' && i % 2 === 0) visits.push({ ...vbase, id: `SV-${cfg.tag}-${pad(i + 1)}-P`, scheduledTime: ago(1, 3), otpCode: String(int(100000, 999999)), qrToken: tok(16), isVerified: false, verificationMethod: 'OTP', createdAt: ago(3) } as SiteVisit);

    // the accepted proposal that opened the room
    S.offers.push({ id: `OFFER-${cfg.tag}-${pad(i + 1)}`, propertyId: base.id, requirementId: req.id, proposingBrokerId: intro.id, receivingBrokerId: closing.id, proposedIntroducingShare: introPct, proposedClosingShare: 100 - introPct, terms: `${introPct}/${100 - introPct} split of the total brokerage. Demo proposal.`, status: 'ACCEPTED', lastActorId: closing.id, dealRoomId: id, createdAt: ago(createdD + 1), respondedAt: ago(createdD) });
  });
  s.dealRooms.push(...deals);
  s.siteVisits.push(...visits);

  // open proposals (Deals → Collab proposals)
  const inDeal = new Set(deals.map(d => d.propertyId));
  const free = props.filter(p => !inDeal.has(p.id) && p.listingStatus === 'active');
  for (let i = 0; i < 10; i++) {
    const p = free[(i * 2) % free.length]; const q = reqs[Math.floor(reqs.length * 16 / 30) + (i % (reqs.length - Math.floor(reqs.length * 16 / 30)))];
    const to = i < 4 ? user(featured[i]) : user(p.listingBrokerId);
    if (to.id !== p.listingBrokerId) p.listingBrokerId = to.id;
    let from = user(q.assignedBrokerId); if (from.id === to.id) from = brokers.find(b => b.id !== to.id)!;
    const st = (['PENDING', 'PENDING', 'COUNTERED', 'PENDING', 'REJECTED'] as const)[i % 5];
    S.offers.push({ id: `OFFER-${cfg.tag}-P${pad(i + 1, 2)}`, propertyId: p.id, requirementId: q.id, proposingBrokerId: from.id, receivingBrokerId: to.id, proposedIntroducingShare: 50, proposedClosingShare: 50, terms: st === 'COUNTERED' ? 'Counter: 40/60 because the listing broker handles registry. Demo.' : 'Mere paas verified buyer hai, 50/50 split par kaam karte hain. Demo.', status: st, lastActorId: st === 'COUNTERED' ? to.id : from.id, createdAt: ago(int(1, 9)), ...(st === 'REJECTED' ? { respondedAt: ago(1) } : {}) });
  }

  // ───────────── disputes ─────────────
  const disputed = deals.find(d => d.stage === 'Disputed')!;
  const handover = deals.find(d => d.stage === 'Handover')!;
  const disp: Dispute[] = [
    { id: `DISP-${cfg.tag}-01`, dealRoomId: disputed.id, complainantId: disputed.introducingBrokerId, complainantName: user(disputed.introducingBrokerId).name, complainantRole: 'BROKER', counterpartyId: disputed.ownerId, counterpartyName: user(disputed.ownerId).name, reason: 'BYPASS_ATTEMPT', description: 'Owner contacted my buyer directly after the verified visit and offered a lower price outside the platform. (demo)', evidenceLinks: [], status: 'OPEN', settlementHold: true, createdAt: ago(3), updatedAt: ago(1) },
    { id: `DISP-${cfg.tag}-02`, dealRoomId: handover.id, complainantId: handover.closingBrokerId, complainantName: user(handover.closingBrokerId).name, complainantRole: 'BROKER', counterpartyId: handover.introducingBrokerId, counterpartyName: user(handover.introducingBrokerId).name, reason: 'COMMISSION_NON_PAYMENT', description: 'Second milestone of the split is pending for 10 days after the registry. (demo)', evidenceLinks: [], status: 'UNDER_REVIEW', settlementHold: false, createdAt: ago(6), updatedAt: ago(2) },
    { id: `DISP-${cfg.tag}-03`, dealRoomId: deals[4].id, complainantId: deals[4].closingBrokerId, complainantName: user(deals[4].closingBrokerId).name, complainantRole: 'BROKER', counterpartyId: deals[4].introducingBrokerId, counterpartyName: user(deals[4].introducingBrokerId).name, reason: 'FALSE_REPRESENTATION', description: 'Buyer budget was shown higher than actual. (demo)', evidenceLinks: [], status: 'RESOLVED', resolutionNotes: 'Both brokers agreed after a call with the GENZ desk.', settlementHold: false, createdAt: ago(20), updatedAt: ago(15) },
  ];
  disputed.disputeId = `DISP-${cfg.tag}-01`;
  s.disputes.push(...disp);

  // ───────────── owner mandates ─────────────
  const mand: OwnerMandate[] = [];
  props.slice(0, 22).forEach((p, i) => {
    const status: OwnerMandate['status'] = i % 9 === 4 ? 'PENDING_BROKER' : i === 10 ? 'WITHDRAWN' : i === 15 ? 'REJECTED' : i === 19 ? 'PENDING_BROKER' : 'ACTIVE';
    const basis: OwnerMandate['remunerationBasis'] = (['SURPLUS_ABOVE_NET', 'PERCENTAGE', 'FIXED_FEE'] as const)[i % 3];
    const period = [30, 45, 60, 90][i % 4];
    const signed = i % 5 === 0 ? period - int(2, 6) : int(3, 25); // some end within 7 days
    mand.push({
      id: `OM-${cfg.tag}-${pad(i + 1)}`, propertyId: p.id, ownerId: p.ownerId, brokerId: p.listingBrokerId, advertisedPrice: p.askingPrice,
      approvedNetPrice: basis === 'SURPLUS_ABOVE_NET' ? p.ownerApprovedNetPrice : 0, remunerationBasis: basis, agreedCommissionPct: basis === 'PERCENTAGE' ? 2 : 0,
      ...(basis === 'FIXED_FEE' ? { fixedFeeAmount: Math.max(25_000, lakh(p.askingPrice * 0.015)) } : {}),
      protectionPeriodDays: period, agreementHash: sha(`om-${i}`), status, ownerSignedAt: ago(signed),
      ...(status === 'ACTIVE' || status === 'WITHDRAWN' ? { brokerSignedAt: ago(signed, -2) } : {}),
      ...(status === 'ACTIVE' ? { isConfirmed: true, confirmedAt: ago(signed, -2) } : { isConfirmed: false }),
      ...(status === 'REJECTED' ? { decisionNote: 'Net price too low for this locality.' } : status === 'WITHDRAWN' ? { decisionNote: 'Owner sold privately to a relative.' } : {}),
      createdAt: ago(signed + 1),
    } as OwnerMandate);
  });
  s.ownerMandates.push(...mand);

  // ───────────── construction leads + contractor requests ─────────────
  const CL_TYPES: ConstructionLead['projectType'][] = ['Turnkey Residential', 'Commercial Interior Fitout', 'Renovation & Remodel', 'Structural Expansion', 'Architectural Sanction'];
  const CL_ST: ConstructionLead['status'][] = ['OPEN', 'OPEN', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'OPEN', 'IN_PROGRESS', 'OPEN', 'ASSIGNED', 'CANCELLED', 'OPEN'];
  const leads: ConstructionLead[] = CL_ST.map((st, i) => {
    const brk = brokers[(i * 3) % brokers.length]; const t = CL_TYPES[i % CL_TYPES.length]; const loc = LOC[(i * 3 + 2) % LOC.length][0];
    const budget = lakh(int(8, 120) * 100_000); const ctr = contractors[i % contractors.length];
    const l = {
      id: `CL-${cfg.tag}-${500 + i + 1}`, title: `${t} — ${loc}`, projectType: t, approximateLocation: `${loc}, ${cfg.city}`, exactAddressHidden: `Plot ${int(10, 300)}, ${loc}, ${cfg.city}`,
      estimatedBudget: budget, scopeDescription: pick(['G+1 RCC house with standard finishing.', 'Office interior for 25 seats with cabins.', 'Kitchen and bathroom remodel, waterproofing.', 'Second floor addition on existing house.', 'Map sanction and structural drawings for G+2.']),
      timeline: pick(['3-4 months', '6-8 months', '10-12 months', '45 days']), referringBrokerId: brk.id, referringBrokerName: brk.name, referralCommissionPct: 1,
      customerNameMasked: `${pick(['Mahesh', 'Sunita', 'Rakesh', 'Jyoti', 'Anil', 'Farida'])} ${pick(['K.', 'S.', 'V.', 'T.'])} (Masked)`, customerPhoneHidden: ph(1008, i + 1), status: st, createdAt: ago(int(2, 50)),
    } as ConstructionLead;
    if (st !== 'OPEN' && st !== 'CANCELLED') { l.assignedContractorId = ctr.id; l.finalContractValue = lakh(budget * 0.95); l.referralCommissionDue = Math.round(l.finalContractValue * 0.01); l.referralCommissionPaid = st === 'COMPLETED'; }
    return l;
  });
  s.constructionLeads.push(...leads);
  leads.filter(l => l.status === 'OPEN').forEach((l, i) => {
    [contractors[i % contractors.length], contractors[(i + 4) % contractors.length]].forEach((c, j) => {
      const ok = j === 0 && i % 2 === 0;
      S.contractorRequests.push({ id: `CAR-${cfg.tag}-${pad(i + 1)}-${j + 1}`, leadId: l.id, contractorId: c.id, contractorName: c.companyName || c.name, termsAccepted: true, termsAcceptedAt: ago(2), status: ok ? 'APPROVED' : 'REQUESTED', ...(ok ? { disclosedContact: { customerName: l.customerNameMasked.replace(' (Masked)', ''), customerPhone: l.customerPhoneHidden, exactAddress: l.exactAddressHidden } } : {}), createdAt: ago(int(1, 6)) });
    });
  });

  // ───────────── builder projects, units, partners, CRM ─────────────
  const tplProj = s.builderProjects[0];
  const tplMand = s.associateMandates[0];
  const tplLead = (s as any).crmLeads?.[0] as CrmLead | undefined;
  const PTYPES: BuilderProject['projectType'][] = ['Luxury High-Rise', 'Gated Plotted Enclave', 'Commercial Mall & Business Hub', 'Ultra-Luxury Villas'];
  const PSTAGE: BuilderProject['projectStage'][] = ['Pre-Launch / Upcoming', 'Under Construction', 'Ready to Move'];
  const NAMES = ['Green Valley Residency', 'Royal Orchid Enclave', 'Capital Square', 'Sunrise Villas', 'Lake View Towers', 'Shree Ram Nagar Phase 2', 'Metro Business Park', 'Emerald Greens', 'Silver Oak Plots', 'Heritage Homes'];
  const projBuilders = [...builders.filter(b => !s.builderProjects.some(p => p.builderId === b.id) && b.verificationStatus === 'VERIFIED')];
  const projs: BuilderProject[] = [];
  NAMES.slice(0, cfg.nProjects).forEach((nm, i) => {
    const b = projBuilders[i % projBuilders.length]; if (!b || !tplProj) return;
    const ptype = PTYPES[i % PTYPES.length]; const loc = LOC[(i * 2 + 1) % LOC.length][0];
    const minP = ptype === 'Gated Plotted Enclave' ? lakh(int(18, 35) * 100_000) : ptype === 'Commercial Mall & Business Hub' ? lakh(int(30, 60) * 100_000) : ptype === 'Ultra-Luxury Villas' ? lakh(int(150, 220) * 100_000) : lakh(int(45, 80) * 100_000);
    const configs = ptype === 'Gated Plotted Enclave' ? ['Plot 1,200 sq.ft', 'Plot 1,800 sq.ft', 'Corner Plot 2,400 sq.ft'] : ptype === 'Commercial Mall & Business Hub' ? ['Shop 300 sq.ft', 'Office 900 sq.ft', 'Anchor Store 3,000 sq.ft'] : ptype === 'Ultra-Luxury Villas' ? ['4 BHK Villa (3,600 sq.ft)', '5 BHK Villa (4,800 sq.ft)'] : ['2 BHK (1,150 sq.ft)', '3 BHK (1,650 sq.ft)', '4 BHK (2,300 sq.ft)'];
    const total = int(60, 220); const avail = Math.round(total * (0.35 + r() * 0.5));
    const p = {
      ...JSON.parse(JSON.stringify(tplProj)), id: `PROJ-${cfg.tag}-${pad(i + 1, 2)}`, builderId: b.id, builderName: b.companyName || b.name, projectName: `${b.companyName?.split(' ')[0] || ''} ${nm}`.trim(),
      tagline: pick(['Spacious homes near the city centre', 'Plots with wide roads and full amenities', 'High-street shops and offices', 'Private villas with gardens']), locality: loc, city: cfg.city, state: cfg.state,
      reraNumber: `${cfg.reraB}${pad(30 + i, 2)}C00${pad(i + 1, 2)}`, projectType: ptype, projectStage: PSTAGE[i % 3], launchDate: ago(int(30, 200)), completionTarget: pick(['March 2027', 'December 2027', 'June 2028', 'Ready']),
      totalUnits: total, availableUnits: avail, priceStartingFrom: minP, priceMax: Math.round(minP * (1.6 + r())), channelPartnerCommissionPct: pick([2, 2.5, 3, 3.5]),
      siteAddress: `${loc} main road, ${cfg.city}`, unitConfigurations: configs, assignedAssociatesCount: 0, totalBookingsGenerated: total - avail, totalSalesVolumeDelivered: (total - avail) * minP,
      status: i % 4 === 3 ? 'PRE_BOOKING' : 'ACTIVE_LAUNCH', images: IMGS.length ? [IMGS[(i + 1) % IMGS.length], IMGS[(i + 5) % IMGS.length]] : [], createdAt: ago(int(30, 120)), updatedAt: ago(int(0, 10)),
    } as BuilderProject;
    if (i % 2 === 1) delete p.bonusScheme;
    projs.push(p);
  });
  s.builderProjects.push(...projs);

  const units: InventoryUnit[] = [];
  projs.forEach(p => {
    for (let k = 0; k < 10; k++) {
      const cfg = p.unitConfigurations[k % p.unitConfigurations.length];
      const st: InventoryUnit['status'] = k % 4 === 1 ? 'BOOKED' : k === 6 ? 'RESERVED' : 'AVAILABLE';
      const plotted = p.projectType === 'Gated Plotted Enclave';
      units.push({ id: `UNIT-${p.id}-${plotted ? 'P' : 'A'}-${100 + k + 1}`, projectId: p.id, builderId: p.builderId, group: plotted ? 'Block A' : 'Tower A', label: plotted ? `P-${k + 1}` : `A-${100 + k + 1}`, ...(plotted ? {} : { floor: Math.floor(k / 2) + 1 }), config: cfg.split(' (')[0], areaSqft: Number((cfg.match(/[\d,]+(?= sq)/)?.[0] || '1200').replace(/,/g, '')), price: lakh(p.priceStartingFrom * (1 + k * 0.06)), status: st, facing: pick(['NORTH', 'EAST', 'WEST', 'SOUTH']), features: k % 3 === 0 ? ['PARK_FACING'] : ['COVERED_PARKING'], updatedAt: ago(int(0, 15)) } as InventoryUnit);
    }
  });
  S.inventoryUnits.push(...units);

  const mands: SalesAssociateMandate[] = [];
  const MST: SalesAssociateMandate['status'][] = ['ACTIVE_ASSOCIATE', 'TOP_PERFORMER', 'ACTIVE_ASSOCIATE', 'APPLIED', 'INVITED'];
  projs.forEach((p, i) => {
    const team = [user(featured[i % 4]), brokers[(i * 3 + 5) % brokers.length], brokers[(i * 3 + 7) % brokers.length]].filter((b, j, a) => a.findIndex(x => x.id === b.id) === j);
    team.forEach((b, j) => {
      if (!tplMand) return;
      const st = MST[(i + j) % MST.length]; const sold = st === 'TOP_PERFORMER' ? int(4, 9) : st === 'ACTIVE_ASSOCIATE' ? int(0, 3) : 0;
      mands.push({ ...JSON.parse(JSON.stringify(tplMand)), id: `MAND-${cfg.tag}-${pad(i + 1, 2)}-${j + 1}`, projectId: p.id, projectName: p.projectName, builderId: p.builderId, builderName: p.builderName, brokerId: b.id, brokerName: b.name, brokerCompany: b.companyName, brokerReraNumber: b.reraNumber, agreedCommissionPct: p.channelPartnerCommissionPct, targetUnitsQuota: int(5, 12), unitsSold: sold, grossSalesDelivered: sold * p.priceStartingFrom, commissionEarned: Math.round(sold * p.priceStartingFrom * p.channelPartnerCommissionPct / 100), commissionPaid: sold > 0 && j === 0, status: st, assignedAt: ago(int(5, 60)), ...(st === 'APPLIED' ? { appliedNote: 'Mere paas is area ke 20+ active buyers hain.' } : {}) } as SalesAssociateMandate);
    });
    p.assignedAssociatesCount = mands.filter(m => m.projectId === p.id && ['ACTIVE_ASSOCIATE', 'TOP_PERFORMER'].includes(m.status)).length;
  });
  s.associateMandates.push(...mands);

  const CRM_ST: CrmLead['stage'][] = ['NEW', 'CONTACTED', 'SITE_VISIT_SCHEDULED', 'SITE_VISITED', 'NEGOTIATION', 'BOOKING_REQUESTED', 'BOOKED', 'LOST'];
  const SRC: CrmLead['source'][] = ['ASSOCIATE_REFERRAL', 'WALK_IN', 'DIGITAL_CAMPAIGN', 'CLIENT_REFERRAL', 'SOCIAL_MEDIA', 'PROPERTY_PORTAL', 'WHATSAPP_OR_SMS', 'EXHIBITION'];
  const crmNames = ['Amit Rathore', 'Sonal Gupta', 'Rajesh Netam', 'Preeti Saxena', 'Nikhil Chawla', 'Arpita Das', 'Sumit Bhardwaj', 'Monika Sahu', 'Tarun Patel', 'Jaya Mishra', 'Rakesh Kurre', 'Aditi Verma'];
  const crm: CrmLead[] = []; const bookings: CrmBooking[] = [];
  const tplBooking = (s as any).crmBookings?.[0] as CrmBooking | undefined;
  if (tplLead) projs.forEach((p, i) => {
    const partners = mands.filter(m => m.projectId === p.id && ['ACTIVE_ASSOCIATE', 'TOP_PERFORMER'].includes(m.status));
    if (!partners.length) return;
    for (let k = 0; k < 4; k++) {
      const m = partners[k % partners.length]; const stage = CRM_ST[(i + k * 3) % CRM_ST.length]; const n = crm.length + 1;
      const phone = ph(1009, n); const id = `CRM-L-${cfg.tag}-${pad(n)}`;
      const l: any = {
        ...JSON.parse(JSON.stringify(tplLead)), id, projectId: p.id, projectName: p.projectName, builderId: p.builderId, associateId: m.brokerId, associateName: m.brokerName, mandateId: m.id,
        name: crmNames[n % crmNames.length], phone, phoneKey: digits(phone), email: `${crmNames[n % crmNames.length].toLowerCase().replace(/\s+/g, '.')}@demo.genz.example`, source: SRC[n % SRC.length],
        unitInterest: p.unitConfigurations[k % p.unitConfigurations.length], stage, budgetMin: p.priceStartingFrom, budgetMax: Math.round(p.priceStartingFrom * 1.3),
        followUps: stage === 'LOST' || stage === 'BOOKED' ? [] : [{ id: `FU-${n}`, dueAt: k % 2 ? ago(1) : ahead(int(1, 4)), note: pick(['Payment plan bhejna hai', 'Site visit confirm karna', 'Loan eligibility check', 'Floor choice discuss karna']), channel: pick(['CALL', 'WHATSAPP']), done: false, createdBy: m.brokerId }],
        activities: [{ id: `A-${n}-1`, type: 'CALL', note: 'First call done, requirement noted.', byUserId: m.brokerId, byName: m.brokerName, at: ago(int(6, 20)) }],
        protectedUntil: ahead(int(20, 60)), createdAt: ago(int(7, 25)), updatedAt: ago(int(0, 5)),
      };
      delete l.assignedMemberId; delete l.assignedMemberName; delete l.bookingId; delete l.lostReason;
      l.nextFollowUpAt = l.followUps[0]?.dueAt; if (!l.nextFollowUpAt) delete l.nextFollowUpAt;
      if ((stage === 'BOOKING_REQUESTED' || stage === 'BOOKED') && tplBooking) {
        const unit = units.find(u => u.projectId === p.id && u.status === 'AVAILABLE');
        if (unit) {
          const bId = `CRM-B-${cfg.tag}-${pad(bookings.length + 1)}`; const val = unit.price;
          bookings.push({ ...JSON.parse(JSON.stringify(tplBooking)), id: bId, leadId: id, projectId: p.id, projectName: p.projectName, builderId: p.builderId, associateId: m.brokerId, mandateId: m.id, customerName: l.name, unitNo: unit.label, unitConfig: unit.config, agreementValue: val, tokenAmount: 100_000, status: stage === 'BOOKED' ? 'APPROVED' : 'REQUESTED', ...(stage === 'BOOKED' ? { decidedAt: ago(int(2, 12)), decidedBy: p.builderId } : {}), paymentSchedule: tplBooking.paymentSchedule.map((x: any, j: number) => ({ ...x, id: `PM-${bId}-${j + 1}`, amount: Math.round(val * x.pct / 100), paid: stage === 'BOOKED' && j === 0 })), brokeragePct: p.channelPartnerCommissionPct, brokerageAmount: Math.round(val * p.channelPartnerCommissionPct / 100), brokeragePaidAmount: 0, createdAt: ago(int(1, 6)), updatedAt: ago(int(0, 2)) } as CrmBooking);
          unit.status = 'BOOKED'; unit.bookingId = bId; l.bookingId = bId;
        }
      }
      crm.push(l as CrmLead);
    }
  });
  S.crmLeads.push(...crm);
  S.crmBookings.push(...bookings);

  // ───────────── v38 target bonus on most projects: some partners already reached their target, others are on the way ─────────────
  const withTarget = [...projs, ...s.builderProjects.filter(p => ctx.extraTargetProjects.includes(p.id))].filter((_, i) => i % 3 !== 2);
  withTarget.forEach((p, i) => {
    p.targetBonus = {
      enabled: true, periodDays: [60, 90, 120][i % 3], qualifyCollectionPct: 10,
      hit: i % 2 ? { kind: 'LUMP_SUM', value: 50_000 } : { kind: 'EXTRA_PCT', value: 0.5 }, overPct: 0.25,
      early: { kind: 'EXTRA_PCT', value: p.earlyBirdIncentiveBonusPct || 0.25, withinPct: 50 },
      note: pick(['Diwali se Holi tak target push', 'Jaldi target poora karo, early-bird pao', 'Har extra unit par alag se bonus']), updatedAt: ago(4),
    };
    if (p.targetBonus.early && p.targetBonus.early.kind === 'EXTRA_PCT') p.earlyBirdIncentiveBonusPct = p.targetBonus.early.value;
    const ms = s.associateMandates.filter(m => m.projectId === p.id && ['ACTIVE_ASSOCIATE', 'TOP_PERFORMER'].includes(m.status));
    ms.forEach((m, j) => {
      const sold = S.crmBookings.filter((b: CrmBooking) => b.mandateId === m.id && b.status === 'APPROVED').length;
      m.targetUnitsQuota = sold > 0 && j % 2 === 0 ? sold : Math.max(sold + 1, [3, 4, 5, 6][(i + j) % 4]);
      if (j === 1) m.targetBy = ahead(int(10, 40)).slice(0, 10);
    });
  });


  const hm = (tag: string, v: string) => crypto.createHmac('sha256', secret()).update(`${tag}|${v}`).digest('hex');
  const KINDS_R: ClientRoom['kind'][] = ['BUYER', 'BUYER', 'RENTER', 'TENANT', 'BUYER', 'OTHER'];
  const live = props.filter(p => p.listingStatus === 'active');
  for (let i = 0; i < cfg.nRooms; i++) {
    const b = i < Math.round(cfg.nRooms * 8 / 14) ? user(featured[i % 4]) : brokers[(i * 3) % brokers.length];
    const q = reqs[(i * 2 + 1) % reqs.length]; const phone = digits(q.customerPhone);
    const opened = int(3, 30);
    const items = [0, 1, 2].slice(0, 1 + (i % 3)).map(k => {
      const p = live[(i * 3 + k * 5) % live.length];
      return { id: `CRI-${cfg.tag}-${pad(i + 1)}-${k + 1}`, propertyId: p.id, sharedAt: ago(opened - 1 - k), ...(k === 0 && i % 2 === 0 ? { reaction: 'LIKE' as const, reactionAt: ago(opened - 2) } : k === 1 && i % 3 === 0 ? { reaction: 'PASS' as const, reactionAt: ago(opened - 2) } : {}), visitRequests: k === 0 && i % 3 === 1 ? [{ id: `VR-${cfg.tag}-${i + 1}`, at: ago(1), preferred: 'Sunday 11 am', status: 'REQUESTED' as const }] : [] };
    });
    const msgs = [
      { id: `CRM-M-${mt}${i + 1}-1`, from: 'BROKER' as const, text: 'Namaste! Aapke budget ke hisaab se kuch options share kiye hain.', at: ago(opened - 1) },
      { id: `CRM-M-${mt}${i + 1}-2`, from: 'CLIENT' as const, text: i % 2 ? 'Pehla wala achha laga, visit kab ho sakti hai?' : 'Thanks, dekh ke batata hoon.', at: ago(Math.max(0, opened - 3), int(1, 6)), propertyId: items[0].propertyId },
    ];
    const room = {
      id: `CRM-${cfg.tag}${pad(i + 1, 4)}`, brokerId: b.id, clientName: q.customerName, kind: KINDS_R[i % KINDS_R.length], note: pick(['Budget flexible, wants east facing.', 'Wife ki pasand final hogi.', 'Office ke paas chahiye.', '']),
      phoneKey: hm('cr-phone', phone), phoneLast4: phone.slice(-4), tokenHash: sha(`room-${i}-${tok()}`), sessVersion: 1, status: i === cfg.nRooms - 1 ? 'CLOSED' : 'ACTIVE',
      createdAt: ago(opened), updatedAt: ago(int(0, 3)), expiresAt: ahead(60 - (opened % 20)), ...(i === cfg.nRooms - 1 ? { closedAt: ago(1) } : {}),
      lastClientSeenAt: ago(0, 2), lastBrokerSeenAt: i % 2 ? ago(opened - 2) : ago(0, 1), items, messages: msgs, events: [{ at: ago(opened), text: 'Room opened' }, { at: ago(opened - 1), text: `${items.length} home(s) shared` }],
    } as ClientRoom;
    if (!room.note) delete room.note;
    if (room.status === 'ACTIVE') { try { if (vaultReady()) room.phoneSealed = seal(phone, `clientroom:${room.id}:phone`); } catch { /* no key: last 4 only */ } }
    S.clientRooms.push(room);
  }

  // ───────────── legal help cases ─────────────
  const LST = ['OPEN', 'OPEN', 'CLAIMED', 'QUOTED', 'ACCEPTED', 'COMPLETED', 'OPEN'] as const;
  const LTYPE = ['TITLE_CHECK', 'AGREEMENT_DRAFT', 'REGISTRATION', 'LAND_RECORDS', 'LOAN_DOCS', 'TITLE_CHECK', 'LEASE_RENT'] as const;
  deals.filter(d => STAGE_IX[d.stage] >= 2).slice(0, LST.length).forEach((d, i) => {
    const by = user(d.closingBrokerId); const c = legals[[0, 3, 0, 2, 1, 0, 4][i] % legals.length]; const st = LST[i];
    const p = s.properties.find(x => x.id === d.propertyId)!;
    S.legalRequests.push({
      id: `LGL-${cfg.tag}-${pad(i + 1)}`, dealRoomId: d.id, propertyId: d.propertyId, state: cfg.state, city: cfg.city, helpType: LTYPE[i],
      description: `${p.title}: please check papers before token. Owner has registry copy and B1/P2. (demo)`, detailsShared: [], sharedDocIds: [], requestedById: by.id, requestedByName: by.name,
      status: st, ...(st !== 'OPEN' ? { counsellorId: c.id, counsellorName: c.name, claimedAt: st === 'CLAIMED' ? ago(0, 3) : ago(3) } : {}),
      ...(['QUOTED', 'ACCEPTED', 'COMPLETED'].includes(st) ? { quote: { amount: pick([5000, 7500, 11000, 15000]), days: pick([3, 5, 7]), note: 'Includes one site-office visit.', at: ago(2) } } : {}),
      ...(['ACCEPTED', 'COMPLETED'].includes(st) ? { acceptedAt: ago(2) } : {}), ...(st === 'COMPLETED' ? { completedAt: ago(1) } : {}),
      passedBy: [], messages: st === 'OPEN' ? [] : [{ at: ago(2), by: c.id, role: 'LEGAL_COUNSEL', text: 'Papers ki list bhej di hai, kal tak opinion de dunga.' }],
      history: [{ at: ago(4), by: by.id, what: 'Case opened' }], createdAt: ago(4), updatedAt: ago(1),
    });
  });
}
