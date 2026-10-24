import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  DealTask,
  DealCommissionAgreement,
  DueDiligenceChecklistItem,
  DueDiligenceIssue,
  TransactionReadinessReport,
  PropertyMediaAsset,
  MediaShareGrant,
  DealMessage,
} from '../src/types/index.js';
import {
  generateDealTasks,
  generateDueDiligenceItems,
} from './dealTemplates.js';
import type { UserRole } from './permissions.js';
import { DEFAULT_LEGAL_SETTINGS } from '../src/shared/legalRules.js';
import type { PropertyType } from '../src/shared/india.js';
import type { CrmLead, CrmBooking } from '../src/types/crm.js';
import type { ConnectorReferral, ConnectorProfile } from '../src/shared/connector.js';
import type { BonusScheme } from '../src/shared/bonus.js';
import type { CpSlab } from '../src/shared/slabs.js';
import type { LandRecordFields } from '../src/shared/redflags.js';
import { DEFAULT_REWARDS } from '../src/shared/connector.js';
import { buildConnectorDemo } from './connectorSeed.js';
import { seedDemoBulk } from './demoBulk.js';
import { PRELOADED } from './bootstrap.js';
import { pgStore } from './pgstore.js';
import { DEMO_MODE, DEMO_PASSWORD, IS_PROD, hashPassword, unusablePasswordHash, randomPassword } from './auth.js';

// Supported User Roles (single definition lives in permissions.ts)
export type { UserRole } from './permissions.js';

export interface ProjectCollateral {
  id: string;
  title: string;
  kind: 'BROCHURE' | 'PRICE_LIST' | 'PAYMENT_PLAN' | 'RERA' | 'LAYOUT' | 'OTHER';
  url: string;
  /** ASSOCIATES = appointed partners only; ALL_CPS = any verified broker who can see the project */
  audience: 'ASSOCIATES' | 'ALL_CPS';
  addedAt: string;
}

/** Builder → partners notice board (offers, price changes, launches) */
export interface ProjectUpdate {
  id: string;
  projectId: string;
  builderId: string;
  kind: 'OFFER' | 'UPDATE' | 'PRICE' | 'LAUNCH' | 'NOTICE';
  title: string;
  body: string;
  validUntil?: string;
  audience: 'ASSOCIATES' | 'ALL_CPS';
  /** v61 — one photo with the notice (an offer poster, the site's progress) */
  photoId?: string;
  createdBy: string;
  createdAt: string;
}

/** A broker's private project-wise shortlist: which client is lined up for which project / units */
export interface ProjectShortlist {
  id: string;
  ownerId: string;
  projectId: string;
  projectName: string;
  clientId?: string;
  clientName: string;
  units: string[];
  note: string;
  status: 'SHORTLISTED' | 'LEAD_REGISTERED' | 'DROPPED';
  leadId?: string;
  createdAt: string;
  updatedAt: string;
}

/** v14 — an offer from a buyer-side broker for one buyer on one property. Several buyers may be offered in parallel; one wins the token lock. */
export interface PropertyOffer {
  id: string;
  propertyId: string;
  brokerId: string;
  brokerName: string;
  buyerName: string;
  buyerPhoneKey: string;
  requirementId?: string;
  amount: number;
  tokenProposed: number;
  validUntil: string;
  note?: string;
  status: 'SUBMITTED' | 'COUNTERED' | 'ACCEPTED' | 'TOKEN_HELD' | 'BACKUP' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED' | 'RELEASED' | 'CLOSED';
  counterAmount?: number;
  counterNote?: string;
  rounds: number;
  /** queue position among BACKUP offers (lower = earlier) */
  queueNo?: number;
  decidedById?: string;
  decidedByName?: string;
  decidedAt?: string;
  reason?: string;
  acceptedAt?: string;
  tokenDueBy?: string;
  token?: {
    amount: number; ref: string; receivedAt: string; receivedById: string; validUntil: string;
    extended?: boolean; buyerSideAckAt?: string;
    outcome?: 'COMPLETED' | 'REFUNDED' | 'FORFEITED' | 'RELEASED'; outcomeAt?: string; outcomeNote?: string; outcomeAckAt?: string;
  };
  dealRoomId?: string;
  history: Array<{ at: string; byId: string; byName: string; text: string }>;
  createdAt: string;
  updatedAt: string;
}

/** v14 — registry / payment / agreement milestone on a deal room. The side that did it marks it done; the other side confirms. */
export interface DealMilestone {
  id: string;
  dealRoomId: string;
  kind: 'AGREEMENT' | 'PAYMENT' | 'REGISTRY' | 'POSSESSION' | 'COMMISSION' | 'OTHER';
  title: string;
  plannedAt?: string;
  amount?: number;
  ref?: string;
  note?: string;
  status: 'PLANNED' | 'DONE' | 'CANCELLED';
  doneAt?: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
  confirmedById?: string;
  confirmedByName?: string;
  confirmedAt?: string;
}

/** v14 — a broker's private note / reminder on a deal; visible to its author only. */
export interface BrokerNote {
  id: string;
  dealRoomId: string;
  userId: string;
  text: string;
  remindAt?: string;
  createdAt: string;
}

/** v14 — enquiry from a scanned site poster. Goes to the listing broker only. */
export interface PosterEnquiry {
  id: string;
  propertyId: string;
  brokerId: string;
  name: string;
  phone: string;
  message?: string;
  consentAt: string;
  status: 'NEW' | 'CONTACTED' | 'CLOSED';
  createdAt: string;
}

/** v14 — anonymous market record kept after a sold listing's personal data is erased. No names, no addresses. */
export interface MarketRecord {
  id: string;
  city: string;
  locality: string;
  propertyType: string;
  transactionType: string;
  areaSqFt: number;
  month: string;
  priceBand: string;
  via: 'NETWORK' | 'OUTSIDE';
}

/** Logged phone reveal for a staff member whose phone mode is REVEAL */
/** Single-use QR pass for a customer's visit to a builder's project site. Issued by the partner (or builder desk), scanned by the builder's side. */
export interface VisitPass {
  id: string;
  /** 10-char code printed under the QR; QR payload is GENZV:<code> */
  code: string;
  leadId: string;
  projectId: string;
  projectName: string;
  builderId: string;
  /** partner who owns the lead; empty for builder-desk leads */
  associateId: string;
  associateName: string;
  customerName: string;
  phoneLast4: string;
  scheduledAt: string;
  validFrom: string;
  validUntil: string;
  partySize?: number;
  note?: string;
  status: 'ACTIVE' | 'USED' | 'EXPIRED' | 'CANCELLED' | 'SUPERSEDED';
  createdById: string;
  createdByName: string;
  createdAt: string;
  usedAt?: string;
  usedById?: string;
  usedByName?: string;
  /** v34 — where the pass is scanned (see SCAN_POINTS.PASS) */
  scanAt?: string;
  cancelledAt?: string;
}

export interface LeadReveal {
  id: string;
  employerId: string;
  userId: string;
  userName: string;
  leadId: string;
  at: string;
}

/** What an employee may do with leads — set per member by the employer */
export interface TeamPolicy {
  /** FULL = sees numbers; REVEAL = masked, one tap reveals (logged, daily cap); HIDDEN = never sees numbers */
  phoneMode: 'FULL' | 'REVEAL' | 'HIDDEN';
  revealCap: number;
  canRegister: boolean;
  canMarkLost: boolean;
  /** may pick unassigned leads from the pool */
  canClaim: boolean;
  /** builder staff: may accept / reject associate-registered leads */
  canVerify: boolean;
  /** builder staff: may scan visitors' QR passes at the site and confirm the visit */
  canScanVisits: boolean;
  /** v16.7 */
  canForward?: boolean;
  canRequestBooking?: boolean;
  /** v16.9 — money trail: record customer money he collected / confirm a stage of the chain */
  canCollectMoney?: boolean;
  canConfirmMoney?: boolean;
  /** v16.8 — employer's unit grid: OFF / SHARED (only units posted to him) / ALL; price + features + customer-share switches */
  invMode?: 'OFF' | 'SHARED' | 'ALL';
  invPrice?: boolean;
  invFeatures?: boolean;
  invShareOut?: boolean;
  maxOpenLeads?: number;
  /** ASSIGNED = only allotted leads; PROJECTS = every lead of the listed projects (read + verify) */
  scope: 'ASSIGNED' | 'PROJECTS';
  projectIds: string[];
  onLeave: boolean;
  /** v58 — a BROKER's staff, resale / rent work (default off): listings read-only (+ the address of the employer's own listings),
   *  the employer's client rooms, the employer's client list */
  listings?: 'OFF' | 'READ' | 'ADDRESS';
  rooms?: boolean;
  clients?: boolean;
}
export interface LeadRouting { mode: 'OFF' | 'ROUND_ROBIN' | 'LEAST_LOADED'; cursor?: number }

export interface BuilderProject {
  id: string;
  builderId: string;
  builderName: string;
  projectName: string;
  tagline: string;
  locality: string;
  city: string;
  state?: string;
  reraNumber: string;
  projectType: 'Luxury High-Rise' | 'Gated Plotted Enclave' | 'Commercial Mall & Business Hub' | 'Ultra-Luxury Villas';
  projectStage: 'Pre-Launch / Upcoming' | 'Under Construction' | 'Ready to Move';
  launchDate: string;
  completionTarget: string;
  totalUnits: number;
  availableUnits: number;
  priceStartingFrom: number;
  priceMax: number;
  channelPartnerCommissionPct: number;
  earlyBirdIncentiveBonusPct?: number;
  /** volume-bonus slabs (extra payout when an associate / the whole project sells more units) */
  bonusScheme?: BonusScheme;
  /** v38: reward for a partner who reaches HIS target before HIS deadline (+ per unit above target, + early finish) */
  targetBonus?: import('../src/shared/targetBonus.js').TargetBonusScheme;
  /** escalator commission slabs per associate (n-th approved booking) */
  cpSlabs?: CpSlab[];
  /** broker unit-hold window in hours (default 2) and minimum token to hold (default ₹21,000) */
  holdHours?: number;
  minToken?: number;
  /** v12 builder control: who may see/apply (default OPEN_APPLY), lead intake switch, lead verification mode, protection window */
  access?: 'OPEN_APPLY' | 'INVITE_ONLY';
  /** v16: TDS % the builder deducts on brokerage payouts (CA decides; default 5) */
  tdsPct?: number;
  /** v15: builder allows the GENZ desk to coordinate visits / paperwork (coordination only) */
  desk?: boolean;
  /** v16.8: default "who sees the units / prices" for partners (a unit can override it) */
  invVis?: { audience: 'ALL' | 'SELECTED' | 'HIDDEN'; brokerIds: string[]; priceHidden: boolean };
  /** v16.8: GENZ network launch (needs the builder's consent) */
  launch?: import('../src/shared/launchRules.js').LaunchPlan;
  leadIntake?: 'OPEN' | 'PAUSED';
  intakeNote?: string;
  /** MANUAL: every associate-registered lead waits for the builder desk (auto-accepted after 48 h) */
  leadVerification?: 'AUTO' | 'MANUAL';
  /** QR_REQUIRED: a lead reaches SITE_VISITED / booking only after the builder's side scanned the visitor's QR (leads created before the switch are exempt) */
  visitProof?: 'OFF' | 'QR_REQUIRED';
  visitProofSince?: string;
  registrationDays?: number;
  collateral?: ProjectCollateral[];
  siteAddress: string;
  images: string[];
  unitConfigurations: string[];
  amenities: string[];
  assignedAssociatesCount: number;
  totalBookingsGenerated: number;
  totalSalesVolumeDelivered: number;
  status: 'ACTIVE_LAUNCH' | 'PRE_BOOKING' | 'SOLD_OUT' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

export interface InventoryUnit {
  id: string;
  projectId: string;
  builderId: string;
  group: string; // tower / layout block
  label: string; // A-101, P-12
  floor?: number;
  config: string;
  areaSqft?: number;
  price: number;
  /** v16.8 — property facts the builder adds: facing, open road sides, width, size, feature tags, a short note */
  facing?: string;
  roadSides?: number;
  roadWidthFt?: number;
  dimensions?: string;
  features?: string[];
  note?: string;
  /** v16.8 — per-unit override of who may see it / its price (falls back to the project default) */
  vis?: { audience: 'ALL' | 'SELECTED' | 'HIDDEN'; brokerIds: string[]; priceHidden: boolean };
  /** v16.8 — last rate changes (newest first, capped) */
  priceHistory?: { price: number; at: string; by: string; reason?: string }[];
  status: 'AVAILABLE' | 'HOLD' | 'BOOKED' | 'RESERVED';
  hold?: {
    brokerId: string; brokerName: string; leadId: string; customerName: string;
    tokenAmount: number; tokenRef: string; at: string;
    /** null while a booking request is pending the builder's decision */
    expiresAt: string | null; bookingId?: string;
  };
  bookingId?: string;
  updatedAt: string;
}

export interface SiteCheckin {
  id: string;
  employerId: string;
  userId: string;
  userName: string;
  leadId?: string;
  label: string;
  lat: number;
  lng: number;
  accuracy?: number;
  selfie?: string; // small JPEG data URL; never sent in list responses
  at: string;
}

export interface ShareLink {
  token: string;
  ownerId: string;
  kind: 'PROJECT' | 'PROPERTY' | 'UNITS';
  refId: string;
  /** v16.8 — UNITS links: the chosen units and what the customer may see (refId = project id) */
  unitIds?: string[];
  showPrice?: boolean;
  showFeatures?: boolean;
  /** v16.8 — when an employee made the link, the employer whose card is shown */
  employerId?: string;
  clientLabel: string;
  lang: 'en' | 'hi';
  createdAt: string;
  views: number;
  lastViewAt?: string;
  /** seconds spent per page section while the page was visible */
  seconds: Record<string, number>;
  /** recent view timestamps (capped) */
  viewLog: string[];
  revoked?: boolean;
}

/** A person who asked to join (public waitlist) or was nominated by a member. Admin approves → invitation. */
export interface GrowthLead {
  id: string;                       // GL-0001
  name: string;
  phone: string;
  city: string;                     // canonical (normCity)
  state?: string;
  role: UserRole;                   // role they would join as
  source: 'NOMINATION' | 'WAITLIST';
  nominatorId?: string;             // member who nominated / whose code was used
  note?: string;
  consent: boolean;                 // nominator confirms / person agreed to be contacted (DPDP)
  status: 'NEW' | 'INVITED' | 'JOINED' | 'REJECTED';
  invitationId?: string;
  userId?: string;
  rejectReason?: string;
  createdAt: string;
  updatedAt: string;
}

/** "Forgot password" request: handled by GENZ ops who issue a one-time temporary password. */
export interface ResetRequest {
  id: string;                       // RR-0001
  phone: string;
  userId?: string;                  // only set when exactly one account matches (never revealed to the requester)
  status: 'NEW' | 'DONE' | 'DISMISSED';
  createdAt: string;
  handledBy?: string;
  handledAt?: string;
}

export interface LandRecord {
  id: string;
  createdBy: string;
  propertyId?: string;
  title: string;
  state: string; district: string; tehsil: string; village: string;
  khasraNo: string;
  areaText: string;
  fields: LandRecordFields;
  encumbranceNote?: string;
  sourceNote?: string;
  createdAt: string; updatedAt: string;
}

export interface BonusPayout {
  id: string;
  projectId: string;
  mandateId: string;
  brokerId: string;
  amount: number;
  tdsPct: number;
  reference: string;
  paidBy: string;
  paidAt: string;
}

/** v38 — a target-bonus payout the builder recorded (money moves outside GENZ) */
export interface TargetBonusPayout {
  id: string; projectId: string; mandateId: string; brokerId: string; amount: number; tdsPct: number; reference: string;
  breakdown: { hit: number; over: number; early: number }; paidBy: string; paidAt: string;
}

export interface SalesAssociateMandate {
  id: string;
  projectId: string;
  projectName: string;
  builderId: string;
  builderName: string;
  brokerId: string;
  brokerName: string;
  brokerCompany?: string;
  brokerReraNumber?: string;
  agreedCommissionPct: number;
  targetUnitsQuota: number;
  unitsSold: number;
  grossSalesDelivered: number;
  commissionEarned: number;
  commissionPaid: boolean;
  marketingKitAccess: boolean;
  status: 'INVITED' | 'APPLIED' | 'SHORTLISTED' | 'ACTIVE_ASSOCIATE' | 'TOP_PERFORMER' | 'PAUSED' | 'REVOKED' | 'DECLINED' | 'COMPLETED';
  assignedAt: string;
  /** v12 builder control */
  appliedNote?: string;
  statusReason?: string;
  decidedAt?: string;
  /** max new leads this partner may register per day (empty = no cap) */
  dailyLeadCap?: number;
  /** partnership ends automatically after this date */
  validUntil?: string;
  termsHistory?: { at: string; by: string; commissionPct: number; quota: number; dailyLeadCap?: number; validUntil?: string; note: string }[];
  /** v38 target bonus: this partner's own deadline (ISO day; empty = start + the scheme's period) */
  targetBy?: string;
  /** v38: terms frozen once he reached the target or his period ended (later scheme changes do not touch him) */
  targetLock?: import('../src/shared/targetBonus.js').TargetTermsLock;
}

export type TrustTier = 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE' | 'NEW';

export interface TrustScoreDetails {
  score: number;
  tier: TrustTier;
  completedDeals: number;
  verifiedSiteVisits: number;
  activeMandates?: number;
  disputePenalty?: number;
  lastUpdated?: string;
}

export interface PrivacyRequest {
  id: string;
  userId: string;
  userName: string;
  type: 'ERASURE' | 'CORRECTION' | 'GRIEVANCE';
  details: string;
  status: 'OPEN' | 'COMPLETED' | 'REJECTED';
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string; // Indian format e.g. +91 98261 12345
  role: UserRole;
  city: string; // home city (free text; India-wide)
  state?: string; // Indian state / UT
  brokerId?: string; // e.g. GZ-BRK-492001
  companyName?: string;
  reraNumber?: string; // e.g. CGRERA010224A0001
  panNumber?: string;
  gstin?: string;
  /** DPDP: what the user agreed to and when */
  consent?: { policyVersion: string; acceptedAt: string; ip?: string };
  erasedAt?: string;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED' | 'BLACKLISTED';
  verificationNotes?: string;
  /** TEAM_MEMBER only: the broker / builder who employs this account, and the member's job title */
  employerId?: string;
  /** TEAM_MEMBER only: role of the employer (decides what the employee may do); kept in sync at sign-in */
  employerRole?: UserRole;
  teamTitle?: string;
  /** v16.7 — TEAM_MEMBER only: structured job role (TELECALLER, SALES_EXECUTIVE, SITE_COORDINATOR …); older members are inferred from the title */
  teamRole?: string;
  /** TEAM_MEMBER only: lead-handling rules set by the employer (absent = legacy defaults) */
  teamPolicy?: TeamPolicy;
  /** broker / builder only: how new unassigned leads reach staff */
  leadRouting?: LeadRouting;
  /** personal invite code for the word-of-mouth loop (professionals), and the member who brought this user in */
  referralCode?: string;
  invitedById?: string;
  /** opt-in public "digital visiting card" at /c/<referralCode>; v57 — for a broker it is his public page: the homes he shows
   *  (ids, in his order), the areas he works in, and when he promised that the owners of his own homes agreed (OWNER_OK_TEXT) */
  publicCard?: { enabled: boolean; showPhone: boolean; headline?: string; views?: number; homes?: string[]; areas?: string[]; ownerOkAt?: string };
  /** TEAM_MEMBER only: share (%) of brokerage on their closed leads paid to them as incentive */
  incentivePct?: number;
  /** broker / builder branding for flyers and tracked links */
  brand?: { displayName?: string; tagline?: string; reraId?: string; logo?: string };
  /** GENZ_CONNECTOR only: shop / community-partner details */
  connector?: ConnectorProfile;
  avatarUrl?: string;
  createdAt: string;

  // ── Authentication (never serialised to clients) ──
  passwordHash?: string;
  /** bump to revoke every active session of this user */
  sessionVersion?: number;
  mustChangePassword?: boolean;
  lastLoginAt?: string;

  // Deterministic Trust Score based on completed deals & verified physical site visits
  trustScore?: number;
  trustTier?: TrustTier;
  completedDealsCount?: number;
  verifiedSiteVisitsCount?: number;
  trustDetails?: TrustScoreDetails;
  /** v11: free for everyone; premium tiers can be switched on later via server/features.ts without refactoring */
  plan?: 'free' | string;
  chapterId?: string;
  /** non-cash perk: ranks higher in other brokers' daily digest until this time */
  boostUntil?: string;
  /** v15 broker tier: TIER1 = RERA badge, TIER2 = local associate (vouched). Absent = derived from reraNumber. */
  tier?: 'TIER1' | 'TIER2';
  /** v16.8 — the GENZ desk can mark a RERA firm as BIG_FIRM / INDEPENDENT for network launches (absent = by team size) */
  firmSegment?: 'BIG_FIRM' | 'INDEPENDENT';
  /** Tier 2: smaller caps until this date */
  probationUntil?: string;
  /** members who vouched for this account at entry */
  vouchedBy?: string[];
  /** times a person this member vouched for was suspended / blacklisted */
  vouchStrikes?: number;
  vouchBanUntil?: string;
  /** v18 — sponsor of record: the RERA-registered (Tier 1) broker who registered this local associate, and when */
  sponsorId?: string;
  sponsoredAt?: string;
  /** v18 — Aadhaar: the user record keeps ONLY the last 4 digits (since v25 the full number, if the member agreed, sits encrypted in `kycVault`). idConsentAt = when the member agreed.
   *  idCheckedAt / By = a GENZ admin saw the PAN + Aadhaar originals (video call / office), idCheckNote = what was seen (no numbers). */
  aadhaarLast4?: string;
  idConsentAt?: string;
  idCheckedAt?: string;
  idCheckedBy?: string;
  idCheckNote?: string;
  /** v19 — registered by a RERA broker while the "auto-verify RERA referrals" switch was ON: verified at sign-up, ID still to be checked by the GENZ ID-review team */
  autoVerifiedAt?: string;
  autoVerifiedBy?: string;
}

export interface Invitation {
  id: string;
  code: string; // e.g. GZ-INV-9921
  invitedEmail: string;
  invitedPhone: string;
  targetRole: UserRole;
  issuedBy: string; // Superadmin / Admin ID
  status: 'PENDING' | 'REDEEMED' | 'EXPIRED' | 'REVOKED';
  expiresAt: string;
  redeemedBy?: string;
  redeemedAt?: string;
  /** a broker who invited this local partner into their own referral network (connector invitations only) */
  sponsorId?: string;
  /** member who nominated this person (growth loop) and the growth lead it came from */
  nominatedBy?: string;
  growthLeadId?: string;
  /** v15: Tier 2 entry — the vouched application this invitation belongs to (RERA number not required) */
  tier2AppId?: string;
  createdAt: string;
}

export interface Property {
  id: string; // e.g. PROP-RAI-101
  /** v26 — the owner's consent behind this listing, the bypass-protection end date it gave, and the same-property key (never shown) */
  ownerConsentId?: string;
  protectionUntil?: string;
  ownerKeyHash?: string;
  title: string;
  description: string;
  propertyType: PropertyType;
  transactionType: 'Sale' | 'Rent' | 'Lease';
  city: string;
  locality: string; // e.g. Shankar Nagar, Koramangala, Andheri West — free text, India-wide
  tags?: string[]; // searchable listing tags (amenities, features, legal)
  addressHidden: string; // Exact address hidden from unauthorized brokers
  landmark: string;
  state?: string;
  district?: string;
  tehsil?: string;
  village?: string;
  street?: string;
  pincode?: string;
  googleMapsUrl?: string;
  googleMapsDirectionsUrl?: string;
  latitude?: number;
  longitude?: number;
  locationPrecision?: 'APPROXIMATE_LOCALITY' | 'GENERAL_AREA' | 'EXACT_PIN';
  videoUrl?: string;
  plotAreaSqFt?: number;
  builtUpAreaSqFt?: number;
  askingPrice: number; // In INR (₹)
  ownerApprovedNetPrice: number; // Confidential: only owner & superadmin can see
  listingBrokerId: string; // Broker profile ID
  ownerId: string;
  ownerName: string;
  ownerPhone: string; // Masked to unauthorized users
  listingStatus: 'draft' | 'pending_verification' | 'active' | 'under_negotiation' | 'sold' | 'rented' | 'withdrawn' | 'suspended';
  verificationStatus: 'VERIFIED' | 'PENDING' | 'REJECTED';
  duplicateHash: string; // For duplicate detection (locality + area + price bucket)
  priceHistory: Array<{ price: number; changedAt: string; reason: string }>;
  /** last time the listing broker confirmed "still available"; listings unconfirmed for 30 days expire */
  confirmedAt?: string;
  expiredAt?: string;
  /** v14 — sold / rented bookkeeping (soldPrice & soldNote are private to the owner and listing broker) */
  soldAt?: string;
  soldVia?: 'NETWORK' | 'OUTSIDE';
  soldPrice?: number;
  soldNote?: string;
  soldOfferId?: string;
  /** status before the last sold/rented/withdrawn change, so it can be undone within 24 h */
  prevStatus?: Property['listingStatus'];
  /** public site-poster code (/p/<code>) and scan counter */
  posterCode?: string;
  posterViews?: number;
  /** same city+locality+type+area key, to recognise a resale; resaleOf points at the earlier sold listing */
  resaleKey?: string;
  resaleOf?: string;
  /** personal data was erased after the retention window */
  purgedAt?: string;
  /** set automatically when several members report the listing; hidden until GENZ reviews it */
  heldAt?: string;
  /** v57 — the listing broker allows other GENZ brokers to show this home on their public pages (default: no) */
  publicShareOk?: boolean;
  publicShareAt?: string;
  images: string[];
  documents: Array<{ id: string; name: string; url: string; category: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface BuyerRequirement {
  id: string; // e.g. REQ-RAI-201
  customerId: string; // Persistent customer entity ID
  customerName: string;
  customerPhone: string; // Masked for unauthorized brokers
  assignedBrokerId: string;
  budgetMin: number;
  budgetMax: number;
  city?: string;
  state?: string;
  preferredLocalities: string[];
  preferredTags?: string[];
  propertyType: PropertyType;
  transactionType: 'Sale' | 'Rent' | 'Lease';
  minAreaSqFt?: number;
  maxAreaSqFt?: number;
  purpose: 'Self-use' | 'Investment' | 'Rental Yield' | 'Commercial Relocation';
  urgency: 'Immediate (< 15 days)' | 'Moderate (1-3 months)' | 'Exploratory (3-6 months)';
  status: 'active' | 'matching' | 'in_deal_room' | 'fulfilled' | 'closed';
  /** user id of the buyer/tenant who registered this requirement themselves (if any) */
  buyerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MatchScore {
  propertyId: string;
  requirementId: string;
  score: number; // 0 to 100
  breakdown: {
    locationMatch: boolean;
    budgetMatch: boolean;
    typeMatch: boolean;
    areaMatch: boolean;
    transactionMatch: boolean;
  };
  reasons: string[];
}

export interface CollaborationOffer {
  id: string;
  propertyId: string;
  requirementId?: string;
  proposingBrokerId: string;
  receivingBrokerId: string;
  proposedIntroducingShare: number; // Percentage, e.g. 50%
  proposedClosingShare: number; // Percentage, e.g. 50%
  /** v41 — SPLIT (default): one brokerage shared by %; OWN_SIDE: each broker keeps the fee of his own client (no sharing) */
  feeMode?: 'SPLIT' | 'OWN_SIDE';
  /** v41 — the side the PROPOSING broker acts for (OWN_SIDE only); the receiver is the other side */
  proposerSide?: 'SELLER' | 'BUYER';
  terms: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COUNTERED';
  /** who made the latest move; the *other* party must answer next */
  lastActorId?: string;
  dealRoomId?: string;
  createdAt: string;
  respondedAt?: string;
}

export interface DealRoom {
  id: string; // e.g. DEAL-2026-001
  propertyId: string;
  requirementId: string;
  introducingBrokerId: string;
  closingBrokerId: string;
  ownerId: string;
  customerId: string;
  /** employees of the deal brokers who have been allotted to work on this deal room (commercials stay hidden from them) */
  teamMemberIds?: string[];
  stage: 'Lead' | 'Introduction' | 'Site Visit Done' | 'Negotiation' | 'Agreement' | 'Handover' | 'Settled' | 'Disputed';
  totalCommissionExpected: number; // in INR
  /** v15: the tie-up whose split was pre-filled when this room was opened */
  tieupId?: string;
  introducingBrokerSharePct: number; // e.g. 50
  closingBrokerSharePct: number; // e.g. 50
  ownerRemunerationConfirmed: boolean;
  ownerProtectionExpiresAt: string; // 30-day anti-bypass tail clause
  siteVisitsCount: number;
  agreementHash?: string; // Cryptographic SHA-256 seal of deal terms
  /** v21: what the deal is worth — set from the signed commission agreement (the brokers type it); falls back to the asking price for sale listings */
  dealValue?: number;
  /** v41 — OWN_SIDE: no shared brokerage; each broker keeps the fee of his own client. SPLIT / missing = the usual % split. */
  feeMode?: 'SPLIT' | 'OWN_SIDE';
  sellerBrokerId?: string;
  buyerBrokerId?: string;
  /** v41 — brokerId → his own-side fee. PRIVATE: the other broker never gets it (only a GENZ admin while a dispute is open). */
  sideFees?: Record<string, { amount: number; note?: string; at: string }>;
  /** v41 — brokerId → ISO time he signed the mutual "I deal only with my own client" undertaking */
  sideUndertaking?: Record<string, string>;
  /** v41 — brokerId → fee he wrote down as received from his own client (self-recorded) */
  sideReceipts?: Record<string, { entries: { id: string; amount: number; ref: string; paidOn: string; at: string }[]; total: number }>;
  disputeId?: string;
  /** v47 — the deal did not happen: asked by one broker, agreed by the other (or no reply in 7 days) → CLOSED; can be reopened */
  closure?: import('../src/shared/dealClose.js').DealClosure;
  /** v47 — a visit that happened outside the app, confirmed by the other side (unverified: no OTP / QR, no buyer protection) */
  offlineVisit?: import('../src/shared/dealClose.js').OfflineVisit;
  settlementStatus: 'PROPOSED' | 'AGREED' | 'DUE' | 'PARTIALLY_PAID' | 'PAID' | 'DISPUTED';
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SiteVisit {
  id: string; // e.g. SV-2026-101
  dealRoomId: string;
  propertyId: string;
  brokerId: string;
  customerName: string;
  scheduledTime: string;
  otpCode: string; // 6-digit challenge code (delivered to customer/owner, not to the broker)
  qrToken?: string; // random per-visit QR secret (same visibility as otpCode)
  /** v34 — where the QR is scanned (see SCAN_POINTS.VISIT) */
  scanAt?: string;
  customerPhone?: string;
  otpExpiresAt?: string;
  otpAttempts?: number;
  isVerified: boolean;
  verifiedAt?: string;
  verificationMethod: 'OTP' | 'QR' | 'ADMIN_OVERRIDE';
  feedbackNotes?: string;
  createdAt: string;
}

/**
 * Owner ⇄ listing-broker mandate. The owner fixes the FINAL NET AMOUNT he must receive (approvedNetPrice);
 * everything realised above it is the listing broker's remuneration. Both parties sign (owner on drafting,
 * listing broker on acceptance) — the mandate is binding only when ACTIVE.
 */
export interface OwnerMandate {
  id: string;
  propertyId: string;
  ownerId: string;
  /** the listing broker who co-signs */
  brokerId: string;
  advertisedPrice: number;
  /** owner's fixed final / net amount (SURPLUS_ABOVE_NET only; 0 for the other bases) — confidential between owner, listing broker and admins */
  approvedNetPrice: number;
  /** SURPLUS_ABOVE_NET = owner fixes a net amount, surplus is the broker's · PERCENTAGE = % of final price · FIXED_FEE = flat ₹ */
  remunerationBasis: 'SURPLUS_ABOVE_NET' | 'PERCENTAGE' | 'FIXED_FEE';
  /** commission % when remunerationBasis = PERCENTAGE (0 otherwise) */
  agreedCommissionPct: number;
  /** flat brokerage in ₹ when remunerationBasis = FIXED_FEE */
  fixedFeeAmount?: number;
  protectionPeriodDays: number; // Default 30 days
  agreementHash: string; // SHA-256 signature artifact
  status: 'PENDING_BROKER' | 'ACTIVE' | 'REJECTED' | 'WITHDRAWN' | 'SUPERSEDED';
  ownerSignedAt: string;
  brokerSignedAt?: string;
  decisionNote?: string;
  /** legacy OTP fields (kept so old records still load) */
  otpChallenge?: string;
  otpExpiresAt?: string;
  otpAttempts?: number;
  isConfirmed: boolean; // true only while ACTIVE
  confirmedAt?: string;
  /** v27 — owner is not a GENZ user: he agreed (and signed) on the consent link / signed form, see consentId */
  consentId?: string;
  offPlatformOwner?: { name: string; phoneLast4: string };
  createdAt: string;
}

export interface ConstructionLead {
  id: string; // e.g. CL-RAI-501
  title: string;
  projectType: 'Turnkey Residential' | 'Commercial Interior Fitout' | 'Renovation & Remodel' | 'Structural Expansion' | 'Architectural Sanction';
  approximateLocation: string; // e.g. Naya Raipur Sector 24
  exactAddressHidden: string;
  estimatedBudget: number; // in INR
  scopeDescription: string;
  timeline: string;
  referringBrokerId: string;
  referringBrokerName: string;
  referralCommissionPct: number; // Default 1%
  customerNameMasked: string; // "Rajesh K. (Masked)"
  customerPhoneHidden: string;
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  assignedContractorId?: string;
  finalContractValue?: number;
  referralCommissionDue?: number;
  referralCommissionPaid?: boolean;
  createdAt: string;
}

export interface ContractorAccessRequest {
  id: string;
  leadId: string;
  contractorId: string;
  contractorName: string;
  termsAccepted: boolean;
  termsAcceptedAt?: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED';
  disclosedContact?: {
    customerName: string;
    customerPhone: string;
    exactAddress: string;
  };
  createdAt: string;
}

export interface Dispute {
  id: string; // e.g. DISP-2026-01
  dealRoomId?: string;
  leadId?: string;
  complainantId: string;
  complainantName: string;
  complainantRole: UserRole;
  counterpartyId: string;
  counterpartyName: string;
  reason: 'BYPASS_ATTEMPT' | 'COMMISSION_NON_PAYMENT' | 'FALSE_REPRESENTATION' | 'UNAUTHORIZED_CONTACT' | 'OTHER';
  description: string;
  evidenceLinks: string[];
  status: 'OPEN' | 'UNDER_REVIEW' | 'MEDIATION' | 'RESOLVED' | 'DISMISSED';
  resolutionNotes?: string;
  settlementHold: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: number;
  timestamp: string;
  actorId: string;
  actorRole: UserRole;
  entityType: 'PROPERTY' | 'DEAL' | 'VISIT' | 'COMMISSION' | 'DISPUTE' | 'LEAD' | 'VERIFICATION' | 'SYSTEM' | 'LEGAL';
  entityId: string;
  action: string;
  details: string;
  previousHash: string;
  hash: string;
}

export interface SystemSettings {
  /** v20 — when the one-time legacy re-seal of the audit chain happened (never again after this) */
  auditChainSealedAt?: string;
  platformName: string;
  poweredBy: string;
  city: string;
  state: string;
  defaultProtectionPeriodDays: number;
  defaultConstructionCommissionPct: number;
  requireReraForBrokerApproval: boolean;
  maintenanceMode: boolean;
  /** GENZ Connector programme: on/off + reward (INR) suggested per referral type; admins can override per referral */
  connectorProgramEnabled?: boolean;
  connectorRewards?: Record<string, number>;
  /** v31: highest % of a broker's commission a connector may ask for in a deal */
  connectorMaxSharePct?: number;
  /** v19 — when ON, a person registered by a verified RERA broker is verified at sign-up (the ID check follows; the team is notified). Default OFF. */
  autoVerifyReraReferrals?: boolean;
  autoVerifyChangedBy?: string;
  autoVerifyChangedAt?: string;
  /** v19 — new ID-review tasks go to this reviewer (any user who may review KYC) */
  idReviewDefaultAssigneeId?: string;
  /** v25 — the superadmin's switch: keep the full Aadhaar + address in the encrypted vault (absent = ON) */
  kycVaultOff?: boolean;
  kycVaultChangedBy?: string;
  kycVaultChangedAt?: string;
  /** v26 — the superadmin's legal maximum for bypass protection days (absent = 180) */
  bypassMaxDays?: number;
  bypassMaxChangedBy?: string;
  bypassMaxChangedAt?: string;
  /** v26 — every new broker listing needs the owner's consent first (superadmin switch; absent = OFF) */
  ownerConsentRequired?: boolean;
}

// ───────────────────────── v11: daily-use features ─────────────────────────
export type ClientStage = 'NEW' | 'CONTACTED' | 'SITE_VISIT' | 'NEGOTIATION' | 'DEAL' | 'LOST';
export const CLIENT_STAGES: ClientStage[] = ['NEW', 'CONTACTED', 'SITE_VISIT', 'NEGOTIATION', 'DEAL', 'LOST'];
/** A broker's private client card. The phone never leaves the owning broker (and their allotted employees). */
export interface ClientCard {
  id: string;
  brokerId: string;
  name: string;
  phone: string;
  budgetMin: number;
  budgetMax: number;
  city: string;
  areas: string[];
  propertyType: string;
  transactionType: 'Sale' | 'Rent' | 'Lease';
  tags: string[];
  notes: string;
  stage: ClientStage;
  lostReason?: string;
  followUpAt?: string;
  lastContactAt?: string;
  consent: boolean;
  /** client sync id so an offline retry never creates a duplicate */
  clientRef?: string;
  timeline: { at: string; kind: 'CREATED' | 'STAGE' | 'NOTE' | 'CONTACT' | 'FOLLOWUP' | 'SHARE'; text: string }[];
  createdAt: string;
  updatedAt: string;
}
export interface DigestPref {
  /** = userId (the PostgreSQL store needs an id on every record) */
  id: string;
  userId: string;
  muted: boolean;
  hour: number; // preferred local hour, informational (digest is built on demand)
  /** `${clientId}|${propertyId}` → what the broker did with it */
  seen: Record<string, 'OPENED' | 'SHORTLISTED' | 'DISMISSED'>;
  typeAffinity: Record<string, number>;
  localityAffinity: Record<string, number>;
  lastOpenAt?: string;
}
export type ReportReason = 'FAKE' | 'SOLD' | 'DUPLICATE' | 'WRONG_PRICE' | 'SPAM' | 'ABUSE' | 'OTHER';
export interface ListingReport {
  id: string;
  targetType: 'LISTING' | 'BROKER';
  targetId: string;
  reporterId: string;
  reason: ReportReason;
  note: string;
  status: 'OPEN' | 'UPHELD' | 'DISMISSED';
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}
export interface PointEvent { id: string; userId: string; kind: string; refId: string; points: number; at: string }
/** v15 — a Tier 2 entry request: a member (or City Captain) proposes a local broker, others vouch, then a phone-bound invitation is issued. */
export interface Tier2Application {
  id: string; name: string; phone: string; city: string; reference: string;
  proposerId: string;
  vouches: { userId: string; as: 'MEMBER' | 'CAPTAIN'; at: string }[];
  status: 'OPEN' | 'INVITED' | 'JOINED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED';
  invitationId?: string; userId?: string; note?: string;
  /** v19 — details the sponsor filled in at invite time; they are PREFILLED on the person's sign-up form (the Aadhaar is only a last-4 hint — the full number is never kept) */
  companyName?: string; panNumber?: string; aadhaarLast4?: string;
  createdAt: string; updatedAt: string; expiresAt: string;
}
/** v19 — a scanned copy of a PAN card / MASKED Aadhaar. The bytes sit in data/iddocs/<id>.bin; only the ID-review team (and the owner) can open it. */
export interface IdDoc {
  id: string; kind: 'PAN' | 'AADHAAR';
  /** the person it belongs to, once he has an account */
  subjectUserId?: string;
  /** the sponsor's request it was uploaded against (before the account existed) */
  applicationId?: string;
  uploadedBy: 'SPONSOR' | 'SELF'; uploaderId: string;
  fileName: string; mime: string; size: number; sha256: string;
  createdAt: string;
  /** when the GENZ team decided on this person's ID — the clock for deleting the scan starts here */
  reviewedAt?: string;
}
/**
 * v25 — one member's KYC vault: the FULL Aadhaar number and the address, each sealed (AES-256-GCM, see server/kycvault.ts).
 * Lives in its own collection so it can never leak through a user object, a directory card or a list. Opened only by the superadmin, with a reason; every opening is kept in `views`.
 */
export interface KycVaultRecord {
  id: string; // KYC-<userId>
  userId: string;
  aadhaarEnc?: string; addressEnc?: string;
  /** the last 4 digits (also on the user) — lets the screens say “Aadhaar on file” without opening the vault */
  aadhaarLast4?: string;
  consentAt: string; consentVersion: string;
  /** how the values were entered: typed by hand, read from a photo (then confirmed by the member), or both */
  source: 'TYPED' | 'PHOTO' | 'MIXED';
  createdAt: string; updatedAt: string;
  views: { at: string; byId: string; byName: string; purpose: string; reason: string; ref?: string }[];
}
// ───────────────────────── v26 — consent-first listings, push, broadcast, reputation, captains, 2FA ─────────────────────────
/** A property message pasted from WhatsApp, kept private to the broker until the owner consents and the broker publishes it. */
export interface ListingDraft {
  id: string; brokerId: string;
  /** v28 — NEED = a buyer / tenant requirement pasted from WhatsApp (saved as a Buyer Need, no owner consent) */
  kind?: 'LISTING' | 'NEED';
  requirementId?: string;
  status: 'DRAFT' | 'CONSENT_PENDING' | 'READY' | 'PUBLISHED' | 'DISCARDED';
  raw: string;
  fields: Record<string, any>;
  consentId?: string; propertyId?: string;
  createdAt: string; updatedAt: string;
}
/** The property owner's consent to one broker listing one property, and the bypass-protection bond it creates. */
export interface OwnerConsent {
  id: string; brokerId: string; draftId?: string; propertyId?: string;
  method: 'LINK' | 'PAPER';
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'PAPER_REVIEW' | 'PAPER_REJECTED' | 'LINK_EXPIRED' | 'WITHDRAWN' | 'VOID';
  /** sha256 of the link token (the token itself is only ever in the link) */
  tokenHash?: string; linkExpiresAt?: string;
  ownerName: string; ownerPhoneLast4: string; ownerPhoneHash: string;
  /** owner phone + city + locality + type + area — the same property; looseKeyHash leaves the area out */
  keyHash: string; looseKeyHash: string;
  snapshot: { title: string; propertyType: string; transactionType: string; city: string; state?: string; locality: string; price: number; areaSqft?: number };
  protectionDays: number;
  acceptedAt?: string; expiresAt?: string;
  ownerTypedName?: string;
  /** v27 — brokerage the owner agreed to (and the broker signed with his password); turns into an ACTIVE mandate when the listing goes live */
  terms?: { basis: 'SURPLUS_ABOVE_NET' | 'PERCENTAGE' | 'FIXED_FEE'; advertised: number; net: number; pct: number; fee: number; brokerSignedAt?: string };
  /** v27 — the owner's signature on the link page: typed initials and / or a drawn signature (PNG kept in data/consent-signatures) */
  ownerSignature?: { initials?: string; drawn: boolean; sha256?: string; size?: number; at: string };
  mandateId?: string;
  evidence?: { ipHash?: string; uaHash?: string; brokerIpHash?: string; brokerUaHash?: string; sameDeviceSuspected?: boolean; otpVerified?: boolean; at?: string };
  otpHash?: string; otpTries?: number;
  paper?: { mime: string; size: number; sha256: string; uploadedAt: string };
  review?: { byId: string; byName: string; at: string; approve: boolean; note: string };
  ownerReport?: { at: string; note: string };
  events: { at: string; text: string }[];
  createdAt: string; updatedAt: string;
}
export interface PushSub { id: string; userId: string; endpoint: string; p256dh: string; auth: string; ua: string; createdAt: string; lastOkAt?: string; fails: number }
export interface PushPref { id: string; userId: string; matches: boolean; deals: boolean; consent: boolean; broadcast: boolean; digest: boolean; quiet: boolean; lastDigestDay?: string; sentToday?: { day: string; n: number }; /** v59 — the app language on his phone: alerts that have a Hindi line use it */ lang?: 'en' | 'hi' }
/** "Mere client ko ye chahiye" sent to the brokers who hold matching listings. */
export interface Broadcast {
  id: string; brokerId: string; requirementId: string;
  summary: { transactionType: string; propertyTypes: string[]; city: string; localities: string[]; budgetMin: number; budgetMax: number; bhk?: number };
  recipients: string[];
  responses: { brokerId: string; propertyId: string; note: string; at: string }[];
  status: 'OPEN' | 'CLOSED';
  createdAt: string; closesAt: string;
}
/** "Deal sahi hui" — one broker confirming a closed deal with another. */
export interface PeerConfirm { id: string; kind: 'DEAL_ROOM' | 'OFFER'; refId: string; fromId: string; toId: string; note: string; at: string }
/**
 * v29 — "Buyer bond": the broker who first brought a buyer to a property (a site visit verified with the buyer's OTP / QR,
 * or an offer the buyer agreed to) is protected for that property for the GENZ protection days. Another broker cannot book
 * a visit or make an offer for the same buyer on the same property while it lasts; he can ask the first broker to co-broke.
 * The buyer's mobile is kept only as an HMAC + last 4 digits.
 */
/** v36 — Verified Photo: a broker's profile photo. It reaches his ID card (avatarUrl) only after GENZ staff approve it against his ID. File on disk: data/profilephotos/<id>.bin */
export interface ProfilePhoto {
  id: string; userId: string; status: 'PENDING' | 'APPROVED' | 'REJECTED';
  mime: string; size: number; sha256: string; consentAt: string; createdAt: string;
  review?: { byId: string; byName: string; at: string; note?: string };
}
/** v35 — Network Watch: one record per mobile number (HMAC) that brokers reported for refusing commission / going direct. Names are never shown to the network. */
export interface PartyReport {
  id: string; brokerId: string; partyKind: 'BUYER' | 'OWNER'; category: 'COMMISSION_REFUSED' | 'WENT_DIRECT' | 'FAKE_ENQUIRY' | 'ABUSIVE';
  /** what the reporting broker typed — only the broker and GENZ staff ever read it */
  partyName: string; note: string; at: string;
  evidence: { kind: 'VISIT' | 'OFFER' | 'BOND' | 'ROOM' | 'CONSENT' | 'NONE'; refId?: string; verified: boolean };
  status: 'OPEN' | 'UPHELD' | 'DISMISSED';
  review?: { byId: string; byName: string; at: string; note: string };
}
export interface PartyAlert {
  id: string; key: string; last4: string;
  reports: PartyReport[];
  level: 'NONE' | 'WATCH' | 'CAUTION' | 'BLOCKED';
  /** staff decision: BLOCKED hard-blocks until blockedUntil; CLEARED ignores every report made before it */
  decision?: { action: 'BLOCKED' | 'CLEARED'; byId: string; byName: string; at: string; note: string; until?: string };
  appeals: { id: string; byId: string; byName: string; at: string; note: string; status: 'OPEN' | 'DONE'; answer?: string }[];
  events: { at: string; text: string }[];
  createdAt: string; updatedAt: string;
}
export interface BuyerBond {
  id: string; propertyId: string; brokerId: string;
  buyerKey: string; buyerPhoneLast4: string; buyerName: string;
  source: 'VISIT' | 'OFFER'; sourceId: string; dealRoomId?: string;
  status: 'ACTIVE' | 'RELEASED' | 'VOID';
  createdAt: string; expiresAt: string; days: number;
  asks: { id: string; fromId: string; fromName: string; fromCompany?: string; fromPhone?: string; note: string; at: string }[];
  /** the listing was marked sold / rented while this bond was active (the holder was alerted) */
  closedNotice?: { at: string; status: string; via?: string };
  void?: { byId: string; byName: string; at: string; note: string };
  events: { at: string; text: string }[];
}
/** v31 — a broker's private room with his OWN client (buyer / renter / tenant). Only the client (link + mobile OTP) and the broker who made it can read it. */
export interface ClientRoom {
  id: string;                      // CRM-xxxxxxxx
  brokerId: string;                // the introducing broker — the room is his (v58: his office staff may work in it if he switched it on)
  /** v58 — opened by one of the broker's office staff */
  createdById?: string; createdByName?: string;
  clientName: string;
  kind: 'BUYER' | 'RENTER' | 'TENANT' | 'OTHER';
  note?: string;                   // the broker's own note, never shown to the client
  /** client's mobile: HMAC + last 4 only (the client types it on the link to get the code) */
  phoneKey: string; phoneLast4: string;
  /** v63 — the full mobile, AES-sealed (vault key), so the broker who opened the room can call / WhatsApp him; erased when the room closes. Never in lists, audit or GENZ screens. */
  phoneSealed?: string;
  tokenHash: string; sessVersion: number;
  status: 'ACTIVE' | 'CLOSED';
  createdAt: string; updatedAt: string; expiresAt: string; closedAt?: string;
  /** a pending sign-in code (HMAC) and, when no SMS gateway is set, the plain code the BROKER reads out to his client */
  otpHash?: string; otpExpires?: string; otpTries?: number; otpPlain?: string;
  lastClientSeenAt?: string; lastBrokerSeenAt?: string;
  /** v46 — the client's phones signed in to this room (at most ROOM_LIMITS.devices); the broker can remove one */
  devices?: { id: string; label: string; firstAt: string; lastAt: string }[];
  /** v46 — when the current link was made (the link's maximum life counts from here) */
  linkAt?: string;
  items: { id: string; propertyId: string; sharedAt: string; note?: string; reaction?: 'LIKE' | 'PASS'; reactionAt?: string;
    visitRequests: { id: string; at: string; preferred: string; note?: string; status: 'REQUESTED' | 'HANDLED'; visitId?: string }[];
    /** v40 — the photo / video links the broker chose to show his client (only what he may share; re-checked on every view) */
    media?: { photos: string[]; videos: string[]; at: string };
    /** v40 — site visits booked from this room for this home */
    visits?: { visitId: string; when: string; at: string }[] }[];
  messages: { id: string; from: 'CLIENT' | 'BROKER'; text: string; at: string; propertyId?: string;
    /** v58 — written by the broker's office staff (shown to the client as "<name> (<broker>'s office)") */
    byId?: string; byName?: string;
    /** v55 — a protected property paper the broker showed his client (opens view-only, with the client's name stamped) */
    paper?: { shareId: string; docId: string; title: string } }[];
  events: { at: string; text: string }[];
}
/** v56 — a home a member saved (buyer shortlist) */
export interface SavedProperty { id: string; userId: string; propertyId: string; at: string }
/** v57 — an enquiry sent from a broker's public page (/c/<code>). It belongs to the PAGE broker only — also when it is about another
 *  broker's listing shown on his page. Erased PAGE_LIMITS.keepDays after it came in (or earlier, when the broker deletes it). */
/** v61 — the builder ↔ channel partner chat: one thread per builder and partner broker (all their projects together) */
export interface PartnerMsg {
  id: string; at: string; byId: string; byName: string; side: 'BUILDER' | 'PARTNER';
  text: string;
  /** a lead / booking / unit / photo shown as a small card; the label is kept as it was when sent */
  card?: { kind: 'LEAD' | 'BOOKING' | 'UNIT' | 'PHOTO'; refId: string; label: string; sub?: string };
}
export interface PartnerThread {
  id: string; builderId: string; brokerId: string;
  messages: PartnerMsg[];
  /** userId → the time up to which he has read */
  reads: Record<string, string>;
  lastAt?: string; createdAt: string; updatedAt: string;
}
/** v61 — a photo in the partner chat or on a project notice (the file is data/workphotos/<id>.bin) */
export interface WorkPhoto { id: string; ownerKind: 'PCHAT' | 'NOTICE'; ownerId: string; byId: string; mime: string; size: number; sha256: string; createdAt: string }

/** v60 — Rent desk: one rented home's tenancy, kept by the broker who recorded it. GENZ never holds rent or deposit; the tenant's ID
 *  never comes here (only the police verification step, date, station and acknowledgement no.). Names and numbers are erased
 *  RENT_LIMITS.keepDays after the tenancy ends. */
export interface Tenancy {
  id: string; brokerId: string;
  dealRoomId?: string; propertyId?: string;
  /** short — "2 BHK flat, Shankar Nagar" (never the full address) */
  place: string;
  ownerName: string; ownerPhone?: string; tenantName: string; tenantPhone?: string;
  rent: number; deposit: number; maintenance?: number;
  startOn: string; months: number; endOn: string;
  lockInMonths?: number; escalationPct?: number; noticeDays: number;
  agreement: 'NONE' | 'DRAFTED' | 'SIGNED' | 'REGISTERED'; stampRef?: string;
  police: { status: 'NOT_STARTED' | 'SUBMITTED' | 'DONE'; on?: string; station?: string; ref?: string };
  keysOn?: string; meterNote?: string; note?: string;
  status: 'ACTIVE' | 'NOTICE' | 'ENDED';
  noticeOn?: string; vacateBy?: string; vacatedOn?: string; depositNote?: string;
  renewals: { at: string; fromOn: string; toOn: string; rent: number; byName: string }[];
  reminded: { d60?: string; d30?: string; d7?: string; over?: string; police?: string };
  consentAt: string;
  history: { at: string; by: string; what: string }[];
  erasedAt?: string;
  createdAt: string; updatedAt: string;
}

export interface PageEnquiry {
  id: string;
  brokerId: string;
  /** the home it is about (one of the homes on the page when it was sent); empty = a general enquiry */
  propertyId?: string;
  name: string;
  /** 10 digits */
  phone: string;
  message?: string;
  consentAt: string;
  status: 'NEW' | 'CONTACTED' | 'CLOSED' | 'SPAM';
  /** the number is on GENZ Network Watch (shown to the broker, never to the sender) */
  watch?: 'CAUTION' | 'BLOCKED';
  createdAt: string;
  updatedAt?: string;
}
/** v50 — how far a person has read a deal-room chat (feeds the unread dot in the Chats inbox) */
export interface ChatRead {
  id: string;                      // <userId>|<dealId>
  userId: string; dealId: string;
  /** timestamp of the newest message the person had on screen */
  at: string;
}
/** v48 — a brokerage bill from a deal broker to the owner or the buyer (the party pays the broker directly; GENZ only records) */
export interface PaymentRequest {
  id: string;                      // PRQ-xxxxxxxxxx
  number: string;                  // <broker code>/<FY>/0001
  dealId: string; brokerId: string;
  party: 'OWNER' | 'BUYER'; partyName: string; partyPhone: string;
  propertyTitle: string; propertyPlace: string;
  items: { text: string; amount: number }[];
  gstPct: number; gstin?: string; upiId?: string; dueOn: string; note?: string;
  tokenHash: string; token?: string;
  status: 'SENT' | 'PARTY_SAYS_PAID' | 'PAID' | 'CANCELLED';
  partySaid?: { at: string; ref: string };
  paid?: { at: string; ref: string };
  cancelledAt?: string;
  reminders: { at: string }[]; views: number; lastViewAt?: string;
  createdAt: string; updatedAt: string;
}
/** v46 — a broker's shop / guard partner who keeps his QR at the counter (see src/shared/shopPartner.ts) */
export interface ShopPartner {
  id: string;                      // SHP-xxxxxxxxxx
  brokerId: string;
  shopName: string; personName: string; area: string; city: string;
  /** partner's mobile: HMAC + last 4 (he types it on his page link to get a code) */
  phoneKey: string; phoneLast4: string;
  qrCode: string;                  // public code for /q/:code (the customer's form)
  tokenHash: string; sessVersion: number; linkAt: string; // the partner's own page /sp/:token
  /** the page link itself, so the broker can send it again (opening it still needs the partner's mobile + a code) */
  token?: string;
  status: 'PENDING' | 'ACTIVE' | 'PAUSED' | 'ENDED';
  terms: import('../src/shared/shopPartner.js').PartnerTerms;
  termsVersion: number;
  /** a change the broker proposed — applies once the partner accepts (only to leads after that) */
  pending?: { terms: import('../src/shared/shopPartner.js').PartnerTerms; at: string; note?: string };
  otpHash?: string; otpExpires?: string; otpTries?: number; otpPlain?: string;
  devices?: { id: string; label: string; firstAt: string; lastAt: string }[];
  scans: number; lastScanAt?: string; lastPartnerSeenAt?: string;
  history: { at: string; by: 'BROKER' | 'PARTNER' | 'CUSTOMER' | 'SYSTEM'; text: string }[];
  createdAt: string; updatedAt: string; acceptedAt?: string; endedAt?: string;
}
/** v46 — a customer who scanned a partner's QR. The full mobile is for the broker only; the partner sees the last 4. */
export interface PartnerLead {
  id: string;                      // PLD-xxxxxxxxxx
  partnerId: string; brokerId: string;
  kind: import('../src/shared/shopPartner.js').LeadKind;
  name: string; phone: string; phoneLast4: string;
  locality: string; budget?: string; propertyType?: string; note?: string;
  consentAt: string;
  /** the terms in force when the customer scanned (a later change never touches this lead) */
  termsVersion: number; terms: import('../src/shared/shopPartner.js').PartnerTerms;
  lockUntil: string;
  status: import('../src/shared/shopPartner.js').LeadStatus;
  lostAt?: string; lostReason?: string;
  won?: { at: string; brokerage: number; amount: number; side: 'SALE' | 'RENT' };
  payout?: { status: import('../src/shared/shopPartner.js').PayoutStatus; paidAt?: string; ref?: string; partnerAt?: string; partnerNote?: string };
  clientCardId?: string;
  history: { at: string; by: 'BROKER' | 'PARTNER' | 'CUSTOMER' | 'SYSTEM'; text: string }[];
  createdAt: string; updatedAt: string;
}
/** v33 — a buyer's "no direct deal" acknowledgement for one visit (builder pass or broker-to-broker site visit): tick + mobile OTP before the QR works */
export interface VisitAck {
  id: string;                      // VAK-xxxxxxxx
  kind: 'PASS' | 'VISIT';
  refId: string;                   // VisitPass.id or SiteVisit.id
  /** buyer's mobile: HMAC + last 4 only */
  phoneKey: string; phoneLast4: string;
  buyerName: string; brokerId: string; brokerName: string; subject: string;
  textVersion: string;
  status: 'PENDING' | 'ACKED';
  createdAt: string;
  /** the buyer ticked the promise and asked for a code */
  tickedAt?: string; ackedAt?: string;
  otpHash?: string; otpExpires?: string; otpTries?: number; otpPlain?: string;
}
export interface TwoFactor { id: string; userId: string; secretEnc: string; enabledAt?: string; pendingSince?: string; recovery: string[]; lastStep?: number }
/** v19 — one ID check to be done by someone on the GENZ team. Opened at sign-up / when the ID changes; assignable to a reviewer; notifies the team while it is open. */
export interface IdReviewTask {
  id: string; userId: string;
  status: 'OPEN' | 'CHANGES_ASKED' | 'DONE' | 'REJECTED';
  source: 'SIGNUP' | 'AUTO_VERIFY' | 'ID_CHANGED' | 'NEW_FILE' | 'BACKFILL' | 'REOPENED';
  /** the member was verified automatically (RERA-sponsor switch) and the ID is being checked afterwards */
  autoVerified?: boolean;
  assigneeId?: string; assignedBy?: string; assignedAt?: string;
  /** reviewer's note: what to fix (CHANGES_ASKED) or what was seen (DONE) — never an ID number */
  note?: string;
  createdAt: string; updatedAt: string; doneAt?: string; doneBy?: string;
  history: { at: string; by: string; action: string; note?: string }[];
}
/** v15 — a recorded agreement between two brokers (referral / co-broking split). GENZ records it; GENZ never handles money. */
export interface Tieup {
  id: string; kind: 'BROKER_BROKER';
  fromId: string; toId: string;
  /** share (%) of the brokerage that goes to the BUYER-side (introducing) broker when the two co-broke; the closer gets the rest */
  introSharePct: number;
  scopeKinds: string[]; city?: string; note?: string;
  validDays: number;
  status: 'PROPOSED' | 'ACTIVE' | 'DECLINED' | 'WITHDRAWN' | 'ENDED' | 'EXPIRED';
  proposedAt: string; decidedAt?: string; validUntil?: string; endedAt?: string; endedBy?: string; endReason?: string;
  agreementHash?: string; dealsUsed?: number;
  history: { at: string; by: string; action: string; note?: string }[];
}
/** v15 — a builder asks the GENZ desk to coordinate (site visits, paperwork, launch day). Coordination only: no sales, no money. */
export interface DeskRequest {
  id: string; projectId: string; projectName: string; builderId: string; builderName: string;
  kind: 'SITE_VISIT_COORD' | 'PAPERWORK' | 'LAUNCH_DAY' | 'OTHER';
  note: string; status: 'OPEN' | 'ACK' | 'DONE' | 'DECLINED';
  handledBy?: string; response?: string; createdAt: string; updatedAt: string;
}
export interface Chapter {
  id: string; name: string; city: string; zone: string; captainId?: string; createdAt: string;
  posts: { id: string; by: string; at: string; text: string }[];
}
export interface ChapterMeet {
  id: string; chapterId: string; title: string; at: string; venue: string; createdBy: string;
  rsvps: { userId: string; going: boolean }[];
  attended: string[];
  createdAt: string;
}
export type LoanStatus = 'SUBMITTED' | 'CONTACTED' | 'SANCTIONED' | 'DISBURSED' | 'REJECTED';
export interface LoanReferral {
  id: string; brokerId: string; clientName: string; clientPhone: string; amount: number; city: string;
  incomeType: 'SALARIED' | 'SELF_EMPLOYED' | 'BUSINESS' | 'OTHER'; consent: boolean;
  status: LoanStatus; sharePct?: number; notes?: string;
  history: { at: string; status: LoanStatus; by: string }[];
  createdAt: string; updatedAt: string;
}
/** A document that can be viewed (not downloaded) by the people the owner picks. Page images live on disk, not in the DB. */
export interface ProtectedDoc {
  id: string; ownerId: string; title: string; propertyId?: string; pages: number; mime: string[];
  viewers: { userId: string; grantedAt: string; expiresAt?: string; maxViews?: number; views: number; revoked?: boolean }[];
  revoked?: boolean;
  createdAt: string;
}
/**
 * A real property paper (PDF / photo) kept on the server's disk (data/propdocs/<id>.bin) — never in the database and never behind a public URL.
 * Private by default: the uploader, the property's owner and listing broker, and platform admins. Anyone else needs a share or a deal-room link.
 */
export interface PropertyDoc {
  id: string; propertyId: string; uploaderId: string;
  type: string; title: string; refNo?: string; tags: string[]; note?: string;
  fileName: string; mime: string; size: number; sha256: string;
  visibility: 'PRIVATE' | 'DEAL_PARTICIPANTS' | 'VERIFIED_BROKERS';
  shares: {
    userId: string; grantedBy: string; grantedAt: string; expiresAt?: string; revoked?: boolean;
    /** v55 — shared from a deal chat: how many times the person may open it (0 / missing = no limit), how often he did, the deal,
     *  and whether he may show it to his own client (in his Client Room, view-only, with the client's name stamped) */
    maxViews?: number; views?: number; dealId?: string; clientShare?: boolean;
  }[];
  /** v55 — shown by a broker to his own client in a Client Room (view-only page; the client's own name is stamped on it) */
  clientShares?: { id: string; roomId: string; brokerId: string; grantedAt: string; expiresAt: string; maxViews: number; views: number; revoked?: boolean; lastAt?: string }[];
  /** set when the paper was attached as due-diligence evidence */
  ddItemId?: string;
  /** the uploader confirmed they are the owner / authorised by the owner to keep this paper here (DPDP) */
  attestedAt: string;
  createdAt: string; updatedAt: string;
  /** v49 — view-only: everyone except the uploader sees it only in the viewer, with their own name stamped on every page; no download */
  protect?: boolean; protectedAt?: string;
  /** v49 — pages the viewer shows (1 for a photo; the page photos of a scanned PDF) */
  pages?: number;
}
export interface PropertyDocLog { id: string; docId: string; userId: string; action: 'VIEW' | 'DOWNLOAD' | 'DENIED' | 'SHARE' | 'REVOKE'; at: string; ip: string; note?: string }
export interface DocAccessLog { id: string; docId: string; userId: string; page: number; at: string; ip: string; allowed: boolean }
export interface AcademyProgress { id: string; userId: string; lessonId: string; doneAt: string }

/** v20 — a builder-facing link to the network-strength page (aggregates only; can be revoked; opens are counted) */
export interface StrengthLink { id: string; token: string; city: string; label: string; createdAt: string; createdBy: string; expiresAt: string; revokedAt?: string; views: number; lastViewAt?: string }

/** v22 — Legal Help: a broker's request for a state-matched counsellor, raised from a deal room. It carries only what the broker chose to share. */
export interface LegalRequest {
  id: string; dealRoomId: string; propertyId?: string;
  state: string; city?: string;
  helpType: import('../src/shared/legalRules.js').LegalHelpType;
  /** free text written by the broker; phone numbers are masked before it is stored */
  description: string;
  /** which of the type's usual details / papers the broker ticked as available (labels, not files) */
  detailsShared: string[];
  /** property papers (PropertyDoc ids) the broker agreed to show the counsellor, view-only, once the fee is accepted */
  sharedDocIds: string[];
  requestedById: string; requestedByName: string;
  status: import('../src/shared/legalRules.js').LegalStatus;
  counsellorId?: string; counsellorName?: string; claimedAt?: string;
  quote?: { amount: number; days?: number; note?: string; at: string };
  acceptedAt?: string; completedAt?: string; cancelledAt?: string;
  /** GENZ platform fee fixed at the moment the broker accepted (snapshot — later rate changes do not touch it) */
  platformFee?: number; feeLedgerId?: string;
  /** counsellors who gave the case back or let it lapse — they are not offered it again */
  passedBy: string[];
  messages: { at: string; by: string; role: UserRole; text: string }[];
  /** the broker's report that the counsellor tried to take this work outside GENZ (decided by an admin — not a deal-room dispute, so it opens nothing of the deal) */
  bypassReport?: { at: string; by: string; description: string; status: 'OPEN' | 'UPHELD' | 'DISMISSED'; decisionNote?: string; decidedAt?: string };
  history: { at: string; by: string; what: string }[];
  createdAt: string; updatedAt: string;
}
export interface LegalProfile { id: string; userId: string; states: string[]; strikes: number; removed?: boolean; removedReason?: string; updatedAt: string }
export interface LegalLedgerEntry {
  id: string; kind: import('../src/shared/legalRules.js').LedgerKind; counsellorId: string; counsellorName: string;
  amount: number; caseId?: string; plan?: 'MONTHLY' | 'YEARLY';
  status: import('../src/shared/legalRules.js').LedgerStatus;
  ref?: string; paidOn?: string; note?: string; rejectNote?: string;
  /** membership entries: the period this payment buys, set when GENZ confirms it */
  validFrom?: string; validTo?: string;
  createdAt: string; updatedAt: string; history: { at: string; by: string; what: string }[];
}

/** v23 — Plans & Fees: one line per GENZ charge or membership payment (money moves outside the app; this only records it) */
export interface BillingEntry {
  id: string; kind: 'CHARGE' | 'MEMBERSHIP';
  payerId: string; payerName: string; payerSegment: import('../src/shared/billingRules.js').PayerSegment;
  amount: number;
  /** charges: the event, what it refers to, and the calculation frozen at that moment */
  event?: import('../src/shared/billingRules.js').FeeEvent; refId?: string; refLabel?: string; dealId?: string; state?: string;
  base?: number; calc?: { ruleId: string; mode: 'FLAT' | 'PERCENT'; value: number; minFee?: number; maxFee?: number; normalFee: number; planId?: string; benefit?: import('../src/shared/billingRules.js').PlanBenefit };
  /** memberships */
  planId?: string; planName?: string; period?: 'MONTHLY' | 'YEARLY'; months?: number; comp?: boolean; validFrom?: string; validTo?: string;
  status: import('../src/shared/billingRules.js').EntryStatus;
  ref?: string; paidOn?: string; note?: string; rejectNote?: string; cancelNote?: string; needsRefund?: boolean;
  createdAt: string; updatedAt: string; history: { at: string; by: string; what: string }[];
}

export interface DatabaseState {
  users: UserProfile[];
  invitations: Invitation[];
  properties: Property[];
  requirements: BuyerRequirement[];
  offers: CollaborationOffer[];
  dealRooms: DealRoom[];
  siteVisits: SiteVisit[];
  ownerMandates: OwnerMandate[];
  constructionLeads: ConstructionLead[];
  contractorRequests: ContractorAccessRequest[];
  disputes: Dispute[];
  auditEvents: AuditEvent[];
  settings: SystemSettings;
  builderProjects: BuilderProject[];
  associateMandates: SalesAssociateMandate[];
  dealTasks: DealTask[];
  commissionAgreements: DealCommissionAgreement[];
  dueDiligenceItems: DueDiligenceChecklistItem[];
  dueDiligenceIssues: DueDiligenceIssue[];
  readinessReports: TransactionReadinessReport[];
  propertyMediaAssets: PropertyMediaAsset[];
  mediaShareGrants: MediaShareGrant[];
  dealMessages: DealMessage[];
  crmLeads: CrmLead[];
  crmBookings: CrmBooking[];
  bonusPayouts: BonusPayout[];
  targetBonusPayouts: TargetBonusPayout[];
  inventoryUnits: InventoryUnit[];
  /** v16.8 — an employer's "put these units in front of my team" posts */
  inventoryPosts: import('../src/shared/inventoryRules.js').TeamPost[];
  siteCheckins: SiteCheckin[];
  shareLinks: ShareLink[];
  landRecords: LandRecord[];
  growthLeads: GrowthLead[];
  resetRequests: ResetRequest[];
  privacyRequests: PrivacyRequest[];
  connectorReferrals: ConnectorReferral[];
  clientCards: ClientCard[];
  projectUpdates: ProjectUpdate[];
  projectShortlists: ProjectShortlist[];
  leadReveals: LeadReveal[];
  visitPasses: VisitPass[];
  propertyOffers: PropertyOffer[];
  tier2Applications: Tier2Application[];
  tieups: Tieup[];
  deskRequests: DeskRequest[];
  dealMilestones: DealMilestone[];
  brokerNotes: BrokerNote[];
  posterEnquiries: PosterEnquiry[];
  marketRecords: MarketRecord[];
  digestPrefs: DigestPref[];
  listingReports: ListingReport[];
  pointEvents: PointEvent[];
  chapters: Chapter[];
  chapterMeets: ChapterMeet[];
  loanReferrals: LoanReferral[];
  protectedDocs: ProtectedDoc[];
  docAccessLogs: DocAccessLog[];
  propertyDocs: PropertyDoc[];
  propertyDocLogs: PropertyDocLog[];
  /** v19 — scanned PAN / masked-Aadhaar copies and the ID-review tasks */
  idDocs: IdDoc[];
  idReviewTasks: IdReviewTask[];
  /** v25 — encrypted full Aadhaar + address, one record per member */
  kycVault: KycVaultRecord[];
  /** v26 */
  listingDrafts: ListingDraft[];
  ownerConsents: OwnerConsent[];
  pushSubs: PushSub[];
  pushPrefs: PushPref[];
  broadcasts: Broadcast[];
  peerConfirms: PeerConfirm[];
  /** v29 — buyer ↔ broker bonds per property (who brought this buyer first) */
  buyerBonds: BuyerBond[];
  partyAlerts: PartyAlert[];
  profilePhotos: ProfilePhoto[];
  clientRooms: ClientRoom[];
  chatReads: ChatRead[];
  /** v56 — homes a buyer saved to come back to (only the property id; nothing is shared with anyone) */
  savedProperties: SavedProperty[];
  pageEnquiries: PageEnquiry[];
  /** v60 — Rent desk */
  tenancies: Tenancy[];
  /** v61 — builder ↔ partner chat and work photos */
  partnerThreads: PartnerThread[];
  workPhotos: WorkPhoto[];
  shopPartners: ShopPartner[];
  paymentRequests: PaymentRequest[];
  partnerLeads: PartnerLead[];
  visitAcks: VisitAck[];
  twoFactor: TwoFactor[];
  /** v20 — GENZ's master-CP agreements with builders and the commission book (money moves outside the app) */
  masterCpAgreements: import('../src/shared/revenueRules.js').MasterCpAgreement[];
  masterCpEntries: import('../src/shared/revenueRules.js').MasterCpEntry[];
  /** v20 — read-only "network strength" links shared with builders (aggregate numbers only) */
  strengthLinks: StrengthLink[];
  /** v22 — Legal Help */
  legalRequests: LegalRequest[];
  legalProfiles: LegalProfile[];
  legalLedger: LegalLedgerEntry[];
  legalSettings: import('../src/shared/legalRules.js').LegalSettings;
  /** v23 — Plans & Fees */
  billingRules: import('../src/shared/billingRules.js').FeeRule[];
  billingPlans: import('../src/shared/billingRules.js').Plan[];
  billingLedger: BillingEntry[];
  billingGates: import('../src/shared/billingRules.js').GateSetting[];
  billingMigrated?: boolean;
  academyProgress: AcademyProgress[];
  /** v17 — who opened the app / did something, per Indian calendar day: user ids only, no page, IP or phone; kept 180 days */
  activityDays: import('../src/shared/pulseRules.js').ActivityDay[];
}

const DB_FILE = path.resolve(process.cwd(), 'data', 'database.json');
/** Demo data (fake brokers/properties) only when SEED_DEMO_DATA=true. Default: a clean database with a single SUPERADMIN. */
const SEED_DEMO = (process.env.SEED_DEMO_DATA ?? 'false').toLowerCase() === 'true';
/** SEED_DEMO_BULK=true (with SEED_DEMO_DATA) adds the large demo set — the public Vercel demo turns it on */
const SEED_DEMO_BULK = (process.env.SEED_DEMO_BULK ?? 'false').toLowerCase() === 'true';

function productionSeed(): DatabaseState {
  const seed = getInitialSeedData();
  const admin = { ...seed.users.find(u => u.role === 'SUPERADMIN')! };
  // The first administrator is configured, not hard-coded.
  admin.name = process.env.SEED_ADMIN_NAME || 'Platform Administrator';
  admin.email = (process.env.SEED_ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  if (process.env.SEED_ADMIN_PHONE) admin.phone = process.env.SEED_ADMIN_PHONE;
  admin.companyName = process.env.SEED_ADMIN_COMPANY || process.env.COMPANY_NAME || 'GENZ BUILDCON';
  admin.city = process.env.SEED_ADMIN_CITY || '';
  admin.verificationNotes = 'Initial platform administrator';
  const empty: any = { ...seed };
  for (const [k, v] of Object.entries(seed)) if (Array.isArray(v)) empty[k] = [];
  empty.users = [admin];
  return empty as DatabaseState;
}


// Helper to compute sha256
export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Initial Seed Data with Raipur Real Estate Specifics
function getInitialSeedData(): DatabaseState {
  const now = new Date('2026-10-10T10:00:00.000Z').toISOString();

  const users: UserProfile[] = [
    {
      id: 'USR-SUPERADMIN',
      name: 'Er. Rajesh Agrawal',
      email: 'admin@genzbuildcon.com',
      phone: '+91 98261 44001',
      role: 'SUPERADMIN',
      city: 'Raipur',
      companyName: 'GENZ BUILDCON INFRA PVT LTD',
      verificationStatus: 'VERIFIED',
      verificationNotes: 'Founder & Principal Infrastructure Architect',
      createdAt: now,
    },
    {
      id: 'USR-ADMIN-1',
      name: 'Pooja Tiwari',
      email: 'operations@genzbroker.in',
      phone: '+91 98261 44002',
      role: 'ADMIN',
      city: 'Raipur',
      companyName: 'GENZ Operations Desk',
      verificationStatus: 'VERIFIED',
      verificationNotes: 'Operations Head - CG Zone',
      createdAt: now,
    },
    {
      id: 'USR-BRK-001',
      name: 'Vikramaditya Sharma',
      email: 'vikram.realty@gmail.com',
      phone: '+91 98271 22334',
      role: 'BROKER',
      city: 'Raipur',
      brokerId: 'GZ-BRK-492001',
      companyName: 'Capital Propex Raipur',
      reraNumber: 'CGRERA010224A0001',
      verificationStatus: 'VERIFIED',
      verificationNotes: 'RERA verified & registered with CREDAI CG',
      createdAt: now,
    },
    {
      id: 'USR-BRK-002',
      name: 'Amit Kumar Verma',
      email: 'amit.verma@shrikriparealty.in',
      phone: '+91 94252 88776',
      role: 'BROKER',
      city: 'Raipur',
      brokerId: 'GZ-BRK-492002',
      companyName: 'Shri Kripa Real Estate Advisory',
      reraNumber: 'CGRERA150324A0009',
      verificationStatus: 'VERIFIED',
      verificationNotes: 'Verified broker active in Shankar Nagar & VIP Road',
      createdAt: now,
    },
    {
      id: 'USR-BRK-003',
      name: 'Priya Agrawal',
      email: 'priya@nayaraipurrealty.com',
      phone: '+91 98261 77112',
      role: 'BROKER',
      city: 'Raipur',
      brokerId: 'GZ-BRK-492003',
      companyName: 'Premier Realty CG',
      reraNumber: 'CGRERA200424A0033',
      verificationStatus: 'VERIFIED',
      verificationNotes: 'Specialist in Naya Raipur commercial plots & turnkey developments',
      createdAt: now,
    },
    {
      id: 'USR-BRK-004',
      name: 'Rohit Dewangan',
      email: 'rohit@cghomes.co.in',
      phone: '+91 94255 33221',
      role: 'BROKER',
      city: 'Raipur',
      brokerId: 'GZ-BRK-492004',
      companyName: 'Dewangan Property Mart',
      reraNumber: 'CGRERA080824A0055',
      verificationStatus: 'PENDING',
      verificationNotes: 'Recently onboarded broker. RERA documents submitted for admin vetting.',
      createdAt: now,
    },
    {
      id: 'USR-OWNER-001',
      name: 'Sunil Lalwani',
      email: 'sunil.lalwani@gmail.com',
      phone: '+91 98261 55667',
      role: 'PROPERTY_OWNER',
      city: 'Raipur',
      companyName: 'Lalwani Infrastructure',
      verificationStatus: 'VERIFIED',
      createdAt: now,
    },
    {
      id: 'USR-BUYER-001',
      name: 'Dr. Alok Pandey',
      email: 'dr.alok.pandey@aiimsraipur.edu.in',
      phone: '+91 98263 77889',
      role: 'BUYER_TENANT',
      city: 'Raipur',
      verificationStatus: 'VERIFIED',
      createdAt: now,
    },
    {
      id: 'USR-CONTRACTOR-001',
      name: 'Ramesh Patel',
      email: 'ramesh@chhattisgarhconstructions.com',
      phone: '+91 98271 99001',
      role: 'CONTRACTOR',
      city: 'Raipur',
      companyName: 'Chhattisgarh Civil & Structural Infra',
      verificationStatus: 'VERIFIED',
      verificationNotes: 'Grade-A Builder License registered with PWD CG',
      createdAt: now,
    },
    {
      id: 'USR-BUILDER-001',
      name: 'Er. Alok Singhania',
      email: 'projects@genzbuildcon.com',
      phone: '+91 98261 44099',
      role: 'DEVELOPER_BUILDER',
      city: 'Raipur',
      companyName: 'GENZ BUILDCON INFRASTRUCTURE & DEVELOPERS',
      reraNumber: 'CGRERAP150124A0001',
      verificationStatus: 'VERIFIED',
      verificationNotes: 'Principal Builder & Master Developer of Raipur Township Core',
      createdAt: now,
    },
    {
      id: 'USR-LEGAL-001',
      name: 'Adv. Devendra Mishra',
      email: 'legal.counsel@mishrachambers.in',
      phone: '+91 94255 11990',
      role: 'LEGAL_COUNSEL',
      city: 'Raipur',
      companyName: 'Mishra Chambers of Law',
      reraNumber: 'CG/1402/2012',
      verificationStatus: 'VERIFIED',
      verificationNotes: 'Enrolled Advocate - High Court of CG & Raipur District Bar. Title clearance specialist.',
      createdAt: now,
    },
  ];

  const invitations: Invitation[] = [
    {
      id: 'INV-101',
      code: 'GZ-RAIPUR-2026',
      invitedEmail: 'newbroker@cgproperties.in',
      invitedPhone: '+91 98261 99999',
      targetRole: 'BROKER',
      issuedBy: 'USR-SUPERADMIN',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      createdAt: now,
    },
    {
      id: 'INV-102',
      code: 'GZ-BUILDER-VIP',
      invitedEmail: 'contractor@raipurcivils.in',
      invitedPhone: '+91 98261 88888',
      targetRole: 'CONTRACTOR',
      issuedBy: 'USR-ADMIN-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      createdAt: now,
    },
  ];

  const properties: Property[] = [
    {
      id: 'PROP-RAI-101',
      title: 'Premium 4 BHK Luxury Villa with Private Garden',
      description: 'Lavish high-ceiling bungalow in Shankar Nagar premium enclave. Italian marble flooring, 2 covered parking, gated security, club access.',
      propertyType: 'Residential Villa',
      transactionType: 'Sale',
      city: 'Raipur',
      locality: 'Shankar Nagar',
      addressHidden: 'Bungalow No. 14, Lotus Enclave, Near Canal Road, Shankar Nagar, Raipur - 492007',
      landmark: 'Near Ayyappa Temple',
      plotAreaSqFt: 3200,
      builtUpAreaSqFt: 4500,
      askingPrice: 28500000, // ₹2.85 Cr
      ownerApprovedNetPrice: 27000000, // ₹2.70 Cr (Confidential)
      listingBrokerId: 'USR-BRK-001',
      ownerId: 'USR-OWNER-001',
      ownerName: 'Sunil Lalwani',
      ownerPhone: '+91 98261 55667',
      listingStatus: 'active',
      verificationStatus: 'VERIFIED',
      duplicateHash: sha256('Raipur:Shankar Nagar:Residential Villa:3200:28500000'),
      priceHistory: [
        { price: 29500000, changedAt: '2026-09-15T10:00:00.000Z', reason: 'Initial launch listing' },
        { price: 28500000, changedAt: '2026-10-01T14:30:00.000Z', reason: 'Festive festive season price revision by owner' },
      ],
      images: [
        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80',
      ],
      documents: [
        { id: 'DOC-1', name: 'RERA Registration Certificate.pdf', url: '/docs/cgrera_prop_101.pdf', category: 'Regulatory' },
        { id: 'DOC-2', name: 'NOC from Municipal Corporation Raipur.pdf', url: '/docs/noc_smc.pdf', category: 'Title Deeds' },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'PROP-RAI-102',
      title: 'Grade-A Commercial Office Floor on VIP Road',
      description: 'Fully furnished corporate office space on main VIP Road artery. Ideal for IT/Fintech, Banking or Regional HQ. 100% power backup, high-speed elevators.',
      propertyType: 'Commercial Office',
      transactionType: 'Sale',
      city: 'Raipur',
      locality: 'VIP Road',
      addressHidden: '4th Floor, Apex Pinnacle Towers, VIP Road, Raipur - 492018',
      landmark: 'Opposite Hotel Babylon International',
      builtUpAreaSqFt: 6200,
      askingPrice: 52000000, // ₹5.20 Cr
      ownerApprovedNetPrice: 49500000, // ₹4.95 Cr
      listingBrokerId: 'USR-BRK-002',
      ownerId: 'USR-OWNER-001',
      ownerName: 'Sunil Lalwani',
      ownerPhone: '+91 98261 55667',
      listingStatus: 'active',
      verificationStatus: 'VERIFIED',
      duplicateHash: sha256('Raipur:VIP Road:Commercial Office:6200:52000000'),
      priceHistory: [
        { price: 52000000, changedAt: '2026-08-20T10:00:00.000Z', reason: 'Fresh commercial inventory' },
      ],
      images: [
        'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80',
      ],
      documents: [
        { id: 'DOC-3', name: 'Town & Country Planning Approval.pdf', url: '/docs/tcp_vip_road.pdf', category: 'Sanction Plan' },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'PROP-RAI-103',
      title: 'Spacious 3 BHK High-Rise Flat overlooking Telibandha Lake',
      description: 'Lakeview flat with massive balcony, modular kitchen, wooden flooring in master bedroom, smart automation pre-installed.',
      propertyType: 'Residential Flat',
      transactionType: 'Sale',
      city: 'Raipur',
      locality: 'Telibandha',
      addressHidden: 'Tower B, Flat 1102, Marina Greens, Marine Drive Road, Telibandha, Raipur',
      landmark: 'Marine Drive Promenade',
      builtUpAreaSqFt: 2150,
      askingPrice: 11500000, // ₹1.15 Cr
      ownerApprovedNetPrice: 11000000,
      listingBrokerId: 'USR-BRK-001',
      ownerId: 'USR-OWNER-001',
      ownerName: 'Sunil Lalwani',
      ownerPhone: '+91 98261 55667',
      listingStatus: 'active',
      verificationStatus: 'VERIFIED',
      duplicateHash: sha256('Raipur:Telibandha:Residential Flat:2150:11500000'),
      priceHistory: [],
      images: [
        'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80',
      ],
      documents: [],
      createdAt: now,
      updatedAt: now,
    },
  ];

  const requirements: BuyerRequirement[] = [
    {
      id: 'REQ-RAI-201',
      customerId: 'CUST-001',
      buyerId: 'USR-BUYER-001', // the demo buyer account owns this enquiry (so the buyer's own home screen is not empty)
      customerName: 'Dr. Alok Pandey',
      customerPhone: '+91 98263 77889',
      assignedBrokerId: 'USR-BRK-002', // Co-broker looking on behalf of doctor
      budgetMin: 22000000, // ₹2.20 Cr
      budgetMax: 30000000, // ₹3.00 Cr
      preferredLocalities: ['Shankar Nagar', 'Telibandha', 'Civil Lines'],
      propertyType: 'Residential Villa',
      transactionType: 'Sale',
      minAreaSqFt: 3000,
      maxAreaSqFt: 5000,
      purpose: 'Self-use',
      urgency: 'Immediate (< 15 days)',
      status: 'matching',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'REQ-RAI-202',
      customerId: 'CUST-002',
      customerName: 'Apex Health Systems & Diagnostics',
      customerPhone: '+91 98265 11223',
      assignedBrokerId: 'USR-BRK-001',
      budgetMin: 45000000,
      budgetMax: 60000000,
      preferredLocalities: ['VIP Road', 'Pachpedi Naka', 'Telibandha'],
      propertyType: 'Commercial Office',
      transactionType: 'Sale',
      minAreaSqFt: 5000,
      maxAreaSqFt: 8000,
      purpose: 'Commercial Relocation',
      urgency: 'Moderate (1-3 months)',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const offers: CollaborationOffer[] = [
    {
      id: 'OFFER-001',
      propertyId: 'PROP-RAI-101',
      requirementId: 'REQ-RAI-201',
      proposingBrokerId: 'USR-BRK-002', // Buyer's broker
      receivingBrokerId: 'USR-BRK-001', // Listing broker
      proposedIntroducingShare: 50,
      proposedClosingShare: 50,
      terms: 'Standard 50/50 split on 2% total gross brokerage from buyer and seller side. Client is pre-approved for immediate token payment.',
      status: 'ACCEPTED',
      createdAt: now,
      respondedAt: now,
    },
  ];

  const dealRooms: DealRoom[] = [
    {
      id: 'DEAL-2026-001',
      propertyId: 'PROP-RAI-101',
      requirementId: 'REQ-RAI-201',
      introducingBrokerId: 'USR-BRK-002',
      closingBrokerId: 'USR-BRK-001',
      ownerId: 'USR-OWNER-001',
      customerId: 'CUST-001',
      stage: 'Site Visit Done',
      totalCommissionExpected: 570000, // 2% of ₹2.85 Cr = ₹5,70,000
      introducingBrokerSharePct: 50,
      closingBrokerSharePct: 50,
      ownerRemunerationConfirmed: true,
      ownerProtectionExpiresAt: new Date(Date.now() + 25 * 86400000).toISOString(),
      siteVisitsCount: 1,
      agreementHash: sha256('DEAL-2026-001:PROP-RAI-101:50-50:2026-10-10'),
      settlementStatus: 'AGREED',
      notes: 'Initial site visit verified via OTP. Buyer submitted formal offer of ₹2.78 Cr. Owner counter-offer in progress.',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const siteVisits: SiteVisit[] = [
    {
      id: 'SV-2026-101',
      dealRoomId: 'DEAL-2026-001',
      propertyId: 'PROP-RAI-101',
      brokerId: 'USR-BRK-002',
      customerName: 'Dr. Alok Pandey',
      scheduledTime: '2026-10-10T11:00:00.000Z',
      otpCode: '482910',
      isVerified: true,
      verifiedAt: '2026-10-10T11:22:15.000Z',
      verificationMethod: 'OTP',
      feedbackNotes: 'Buyer inspected the master bedroom suite and lawn. Pleased with ventilation and location. Requested floor plan drawings.',
      createdAt: now,
    },
  ];

  const ownerMandates: OwnerMandate[] = [
    {
      id: 'OM-2026-001',
      propertyId: 'PROP-RAI-101',
      ownerId: 'USR-OWNER-001',
      brokerId: 'USR-BRK-001',
      advertisedPrice: 28500000,
      approvedNetPrice: 27000000,
      remunerationBasis: 'SURPLUS_ABOVE_NET',
      agreedCommissionPct: 0,
      protectionPeriodDays: 30,
      agreementHash: sha256('OM-2026-001:SunilLalwani:28500000:27000000:SURPLUS:30Days'),
      status: 'ACTIVE',
      ownerSignedAt: '2026-10-09T15:50:00.000Z',
      brokerSignedAt: '2026-10-09T16:00:00.000Z',
      isConfirmed: true,
      confirmedAt: '2026-10-09T16:00:00.000Z',
      createdAt: now,
    },
  ];

  const constructionLeads: ConstructionLead[] = [
    {
      id: 'CL-RAI-501',
      title: 'Custom Contemporary Bungalow Construction (Plot 4,800 sq.ft)',
      projectType: 'Turnkey Residential',
      approximateLocation: 'Naya Raipur Sector 24, Atal Nagar',
      exactAddressHidden: 'Plot # 114, Sector 24, Capital City Core, Atal Nagar, Raipur',
      estimatedBudget: 8500000, // ₹85 Lakhs
      scopeDescription: 'G+1 Turnkey RCC frame construction, earthquake resistant, grey structure + architectural finishing. High-grade CP fittings and premium elevation.',
      timeline: '10-12 months',
      referringBrokerId: 'USR-BRK-001',
      referringBrokerName: 'Vikramaditya Sharma',
      referralCommissionPct: 1, // Standard 1%
      customerNameMasked: 'Mahesh C. (Masked for Privacy)',
      customerPhoneHidden: '+91 98261 33445',
      status: 'OPEN',
      createdAt: now,
    },
    {
      id: 'CL-RAI-502',
      title: 'Commercial Pathology Lab Interior Fitout & Electricals',
      projectType: 'Commercial Interior Fitout',
      approximateLocation: 'Devendra Nagar Medical Hub',
      exactAddressHidden: 'Shop 104-106, City Centre Mall Annex, Devendra Nagar, Raipur',
      estimatedBudget: 3500000, // ₹35 Lakhs
      scopeDescription: 'HVAC ducting, medical-grade vinyl flooring, acoustic wall panels, radiation-shielded X-Ray section, reception desk & automated glass sliding doors.',
      timeline: '45-60 days',
      referringBrokerId: 'USR-BRK-002',
      referringBrokerName: 'Amit Kumar Verma',
      referralCommissionPct: 1.5,
      customerNameMasked: 'Dr. Vivek S. (Masked for Privacy)',
      customerPhoneHidden: '+91 94252 66778',
      status: 'OPEN',
      createdAt: now,
    },
  ];

  // No pre-approved access: a demo contractor must see the lead masked and go through the referral agreement (that is what unmasks it).
  const contractorRequests: ContractorAccessRequest[] = [];

  const disputes: Dispute[] = [
    {
      id: 'DISP-2026-01',
      dealRoomId: 'DEAL-2026-001',
      complainantId: 'USR-BRK-002',
      complainantName: 'Amit Kumar Verma',
      complainantRole: 'BROKER',
      counterpartyId: 'USR-OWNER-001',
      counterpartyName: 'Sunil Lalwani',
      reason: 'BYPASS_ATTEMPT',
      description: 'Owner attempted direct verbal contact with Dr. Pandey after registered site visit SV-2026-101 without notifying introducing broker.',
      evidenceLinks: ['/evidence/whatsapp_transcript_visit.pdf'],
      status: 'RESOLVED',
      resolutionNotes: 'Superadmin mediation executed: Owner confirmed genuine introduction via GENZ platform. 30-day protection re-ratified in digital deal room.',
      settlementHold: false,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const firstHash = sha256('GENESIS_EVENT');
  const auditEvents: AuditEvent[] = [
    {
      id: 1,
      timestamp: now,
      actorId: 'USR-SUPERADMIN',
      actorRole: 'SUPERADMIN',
      entityType: 'SYSTEM',
      entityId: 'SYSTEM-ROOT',
      action: 'PLATFORM_INITIALIZATION',
      details: 'GENZ BROKER NETWORK initiated for Raipur zone under GENZ BUILDCON charter.',
      previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
      hash: firstHash,
    },
    {
      id: 2,
      timestamp: now,
      actorId: 'USR-BRK-001',
      actorRole: 'BROKER',
      entityType: 'PROPERTY',
      entityId: 'PROP-RAI-101',
      action: 'PROPERTY_REGISTERED',
      details: '4 BHK Luxury Villa listed in Shankar Nagar with verified ownership and net price mandate.',
      previousHash: firstHash,
      hash: sha256(`${firstHash}:PROPERTY_REGISTERED:PROP-RAI-101`),
    },
  ];

  const builderProjects: BuilderProject[] = [
    {
      id: 'PROJ-RAI-01',
      builderId: 'USR-BUILDER-001',
      builderName: 'GENZ BUILDCON INFRASTRUCTURE & DEVELOPERS',
      projectName: 'GENZ Emerald Heights & Sky Villas',
      tagline: 'Ultra-Luxury 3/4 BHK High-Rise Sky Residences with Italian Club & Private Decks',
      locality: 'VIP Road',
      city: 'Raipur',
      reraNumber: 'CGRERAP150124A0001',
      projectType: 'Luxury High-Rise',
      projectStage: 'Pre-Launch / Upcoming',
      launchDate: '2026-11-01T00:00:00.000Z',
      completionTarget: 'December 2028',
      totalUnits: 140,
      availableUnits: 112,
      priceStartingFrom: 14500000, // ₹1.45 Cr
      priceMax: 38000000, // ₹3.80 Cr
      channelPartnerCommissionPct: 2.5,
      earlyBirdIncentiveBonusPct: 0.5,
      bonusScheme: {
        enabled: true, qualifyCollectionPct: 10, note: 'Diwali-to-March volume incentive',
        windowFrom: '2026-10-01', windowTo: '2027-03-31',
        slabs: [
          { id: 'BS-1', level: 'INDIVIDUAL', minUnits: 3, kind: 'LUMP_SUM', value: 50000 },
          { id: 'BS-2', level: 'INDIVIDUAL', minUnits: 5, kind: 'EXTRA_PCT', value: 0.5 },
          { id: 'BS-3', level: 'PROJECT', minUnits: 10, kind: 'LUMP_SUM', value: 25000 },
        ],
      },
      siteAddress: 'Sector 3, Main VIP Road Highway Corridor, Near Hotel Babylon, Raipur - 492018',
      images: [
        'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
      ],
      unitConfigurations: [
        '3 BHK Sky Deck Flat (2,250 sq.ft)',
        '4 BHK Presidential Suite (3,400 sq.ft)',
        'Duplex Penthouse (5,100 sq.ft)',
      ],
      amenities: [
        'Infinity Sky-Deck Pool',
        'Temperature Controlled Clubhouse',
        'EV Supercharging Bays',
        'Concierge & Valet Butler Desk',
        '5-Tier Biometric Security',
      ],
      assignedAssociatesCount: 2,
      totalBookingsGenerated: 4,
      totalSalesVolumeDelivered: 64000000, // ₹6.40 Cr
      status: 'PRE_BOOKING',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'PROJ-RAI-02',
      builderId: 'USR-BUILDER-001',
      builderName: 'GENZ BUILDCON INFRASTRUCTURE & DEVELOPERS',
      projectName: 'Atal Nagar Plotted Tech Corridor',
      tagline: 'Exclusive Freehold Gated Villa Plots in Smart City Capital Zone',
      locality: 'Naya Raipur (Atal Nagar)',
      city: 'Raipur',
      reraNumber: 'CGRERAP220224A0008',
      projectType: 'Gated Plotted Enclave',
      projectStage: 'Under Construction',
      launchDate: '2026-09-15T00:00:00.000Z',
      completionTarget: 'October 2027',
      totalUnits: 90,
      availableUnits: 54,
      priceStartingFrom: 6500000, // ₹65 Lakhs
      priceMax: 12000000, // ₹1.20 Cr
      channelPartnerCommissionPct: 3.0,
      earlyBirdIncentiveBonusPct: 0.25,
      siteAddress: 'Sector 24, Boulevard Avenue, Atal Nagar (Naya Raipur), CG - 492002',
      images: [
        'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80',
      ],
      unitConfigurations: [
        'Standard Villa Plot (2,400 sq.ft)',
        'Prime Corner Estate Plot (4,200 sq.ft)',
      ],
      amenities: [
        '60ft Wide Tree-Lined Boulevards',
        'Underground Cabling & Fiber Internet',
        'Rainwater Harvesting & Solar Street Lighting',
        'Gated Perimeter with 24x7 Boom Barrier',
      ],
      assignedAssociatesCount: 1,
      totalBookingsGenerated: 2,
      totalSalesVolumeDelivered: 15000000,
      status: 'ACTIVE_LAUNCH',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'PROJ-RAI-03',
      builderId: 'USR-OWNER-001',
      builderName: 'Lalwani Infrastructure',
      projectName: 'Apex Pinnacle Commercial Hub',
      tagline: 'Grade-A Retail Showrooms & High-Yield Corporate Office Suites',
      locality: 'Shankar Nagar',
      city: 'Raipur',
      reraNumber: 'CGRERAP050324C0015',
      projectType: 'Commercial Mall & Business Hub',
      projectStage: 'Under Construction',
      launchDate: '2026-08-01T00:00:00.000Z',
      completionTarget: 'March 2028',
      totalUnits: 65,
      availableUnits: 38,
      priceStartingFrom: 9200000, // ₹92 Lakhs
      priceMax: 45000000,
      channelPartnerCommissionPct: 2.5,
      earlyBirdIncentiveBonusPct: 0.5,
      siteAddress: 'Canal Road Crossing, Shankar Nagar Commercial Main Road, Raipur - 492007',
      images: [
        'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80',
      ],
      unitConfigurations: [
        'High-Street Retail Showroom (850 - 1,800 sq.ft)',
        'Grade-A Corporate Office Suite (1,500 - 5,000 sq.ft)',
      ],
      amenities: [
        'Double-Height Grand Entrance Atrium',
        'High-Speed German Elevators',
        '3-Tier Basement Mechanical Parking',
        '100% DG Power Backup',
      ],
      assignedAssociatesCount: 2,
      totalBookingsGenerated: 3,
      totalSalesVolumeDelivered: 32000000,
      status: 'ACTIVE_LAUNCH',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const associateMandates: SalesAssociateMandate[] = [
    {
      id: 'MAND-RAI-01',
      projectId: 'PROJ-RAI-01',
      projectName: 'GENZ Emerald Heights & Sky Villas',
      builderId: 'USR-BUILDER-001',
      builderName: 'GENZ BUILDCON INFRASTRUCTURE & DEVELOPERS',
      brokerId: 'USR-BRK-001',
      brokerName: 'Vikramaditya Sharma',
      brokerCompany: 'Capital Propex Raipur',
      brokerReraNumber: 'CGRERA010224A0001',
      agreedCommissionPct: 3.0,
      targetUnitsQuota: 8,
      unitsSold: 3,
      grossSalesDelivered: 48000000, // ₹4.80 Cr
      commissionEarned: 1440000, // ₹14.40 Lakhs
      commissionPaid: true,
      marketingKitAccess: true,
      status: 'TOP_PERFORMER',
      assignedAt: now,
    },
    {
      id: 'MAND-RAI-02',
      projectId: 'PROJ-RAI-01',
      projectName: 'GENZ Emerald Heights & Sky Villas',
      builderId: 'USR-BUILDER-001',
      builderName: 'GENZ BUILDCON INFRASTRUCTURE & DEVELOPERS',
      brokerId: 'USR-BRK-002',
      brokerName: 'Amit Kumar Verma',
      brokerCompany: 'Shri Kripa Real Estate Advisory',
      brokerReraNumber: 'CGRERA150324A0009',
      agreedCommissionPct: 2.5,
      targetUnitsQuota: 5,
      unitsSold: 1,
      grossSalesDelivered: 16000000, // ₹1.60 Cr
      commissionEarned: 400000, // ₹4.00 Lakhs
      commissionPaid: false,
      marketingKitAccess: true,
      status: 'ACTIVE_ASSOCIATE',
      assignedAt: now,
    },
    {
      id: 'MAND-RAI-03',
      projectId: 'PROJ-RAI-02',
      projectName: 'Atal Nagar Plotted Tech Corridor',
      builderId: 'USR-BUILDER-001',
      builderName: 'GENZ BUILDCON INFRASTRUCTURE & DEVELOPERS',
      brokerId: 'USR-BRK-001',
      brokerName: 'Vikramaditya Sharma',
      brokerCompany: 'Capital Propex Raipur',
      brokerReraNumber: 'CGRERA010224A0001',
      agreedCommissionPct: 3.0,
      targetUnitsQuota: 6,
      unitsSold: 2,
      grossSalesDelivered: 15000000,
      commissionEarned: 450000,
      commissionPaid: false,
      marketingKitAccess: true,
      status: 'ACTIVE_ASSOCIATE',
      assignedAt: now,
    },
    {
      id: 'MAND-RAI-04',
      projectId: 'PROJ-RAI-02',
      projectName: 'Atal Nagar Plotted Tech Corridor',
      builderId: 'USR-BUILDER-001',
      builderName: 'GENZ BUILDCON INFRASTRUCTURE & DEVELOPERS',
      brokerId: 'USR-BRK-002',
      brokerName: 'Amit Kumar Verma',
      agreedCommissionPct: 2.5,
      targetUnitsQuota: 4,
      unitsSold: 0,
      grossSalesDelivered: 0,
      commissionEarned: 0,
      commissionPaid: false,
      marketingKitAccess: true,
      status: 'ACTIVE_ASSOCIATE',
      assignedAt: now,
    },
  ];

  const settings: SystemSettings = {
    platformName: 'GENZ BROKER NETWORK',
    poweredBy: 'GENZ BUILDCON INFRA PVT LTD',
    city: 'Raipur',
    state: 'Chhattisgarh',
    defaultProtectionPeriodDays: 30,
    defaultConstructionCommissionPct: 1,
    requireReraForBrokerApproval: true,
    maintenanceMode: false,
    connectorProgramEnabled: true,
    connectorRewards: { ...DEFAULT_REWARDS },
    autoVerifyReraReferrals: false,
  };

  // Generate initial Module A & B data
  const dealTasks: DealTask[] = generateDealTasks('DEAL-2026-001', {
    introducingBrokerId: 'USR-BRK-002',
    introducingBrokerName: 'Amit Kumar Verma',
    closingBrokerId: 'USR-BRK-001',
    closingBrokerName: 'Vikramaditya Sharma',
    ownerId: 'USR-OWNER-001',
    ownerName: 'Sunil Lalwani',
    legalCounselId: 'USR-LEGAL-001',
    legalCounselName: 'Adv. Devendra Mishra',
    contractorId: 'USR-CONTRACTOR-001',
    contractorName: 'Ramesh Patel',
    propertyType: 'Residential Villa',
  });

  const commissionAgreements: DealCommissionAgreement[] = [
    {
      id: 'AGR-DEAL-2026-001-V1',
      dealId: 'DEAL-2026-001',
      version: 1,
      status: 'ACTIVE',
      totalAgreedBrokerage: 570000,
      payer: 'SPLIT_EQUAL',
      contractualBasis: 'Co-brokerage mandate with the 30-day anti-bypass rule (GENZ platform terms)',
      calculationBasis: 'PERCENTAGE_OF_TOTAL_DEAL_VALUE',
      allocations: [
        {
          participantId: 'USR-BRK-002',
          participantName: 'Amit Kumar Verma',
          role: 'BROKER',
          allocationPct: 50,
          allocationAmount: 285000,
          basisDescription: 'Buyer introduction, customer financial qualification & site visit coordination',
          entitlementStatus: 'AGREED',
          paidAmount: 0,
          disputedAmount: 0,
          taxDeductionTdsPct: 5,
          invoiceRequired: true,
        },
        {
          participantId: 'USR-BRK-001',
          participantName: 'Vikramaditya Sharma',
          role: 'BROKER',
          allocationPct: 50,
          allocationAmount: 285000,
          basisDescription: 'Exclusive owner listing mandate, document verification & registration coordination',
          entitlementStatus: 'AGREED',
          paidAmount: 0,
          disputedAmount: 0,
          taxDeductionTdsPct: 5,
          invoiceRequired: true,
        },
      ],
      paymentTriggers: [
        {
          triggerId: 'TRIG-1',
          milestoneName: 'Earnest Money Token / Bayana Agreement Execution',
          stage: 'Agreement',
          percentage: 20,
          amount: 114000,
          isMet: true,
          confirmedAt: '2026-10-10T12:00:00.000Z',
        },
        {
          triggerId: 'TRIG-2',
          milestoneName: 'Title Clearance & Bank Loan Sanction',
          stage: 'Negotiation',
          percentage: 30,
          amount: 171000,
          isMet: false,
        },
        {
          triggerId: 'TRIG-3',
          milestoneName: 'Sub-Registrar Registry Execution & Final Settlement',
          stage: 'Handover',
          percentage: 50,
          amount: 285000,
          isMet: false,
        },
      ],
      applicableTaxes: {
        gstPct: 18,
        tdsPct: 5,
        invoiceMandatory: true,
      },
      cancellationClause: 'Cancellation and refund terms are as agreed in writing between the parties. GENZ does not hold, refund or move any money.',
      disputeProcess: 'A dispute on the platform is first reviewed by a GENZ admin under the platform rules. This does not replace any legal remedy available to the parties.',
      proposedBy: 'USR-BRK-001',
      proposedByName: 'Vikramaditya Sharma',
      proposalReason: 'Initial verified agreement between Listing Broker and Introducing Broker for Shankar Nagar Villa.',
      requiredApprovals: [
        {
          userId: 'USR-BRK-001',
          userName: 'Vikramaditya Sharma',
          role: 'BROKER',
          hasAccepted: true,
          acceptedAt: '2026-10-10T11:00:00.000Z',
          signatureAuditTrail: {
            signerName: 'Vikramaditya Sharma',
            signerEmail: 'vikram.realty@gmail.com',
            ipAddress: '103.88.23.14 (Raipur Gateway)',
            authMethod: 'COMPLIANT_E_SIGN_PKEY',
            timestamp: '2026-10-10T11:00:00.000Z',
            cryptoHash: sha256('USR-BRK-001:AGR-DEAL-2026-001-V1:ACCEPTED'),
          },
        },
        {
          userId: 'USR-BRK-002',
          userName: 'Amit Kumar Verma',
          role: 'BROKER',
          hasAccepted: true,
          acceptedAt: '2026-10-10T11:30:00.000Z',
          signatureAuditTrail: {
            signerName: 'Amit Kumar Verma',
            signerEmail: 'amit.verma@shrikriparealty.in',
            ipAddress: '103.88.23.18 (Raipur Gateway)',
            authMethod: 'COMPLIANT_E_SIGN_PKEY',
            timestamp: '2026-10-10T11:30:00.000Z',
            cryptoHash: sha256('USR-BRK-002:AGR-DEAL-2026-001-V1:ACCEPTED'),
          },
        },
      ],
      cryptoSealHash: sha256('AGR-DEAL-2026-001-V1:570000:50-50:SEALED'),
      createdAt: '2026-10-10T10:30:00.000Z',
      updatedAt: '2026-10-10T11:30:00.000Z',
    },
  ];

  // Initialize Due Diligence for properties
  const ddItems101 = generateDueDiligenceItems('PROP-RAI-101', 'Residential Villa', {
    dealId: 'DEAL-2026-001',
    verifierId: 'USR-LEGAL-001',
    verifierRole: 'LEGAL_COUNSEL',
  });
  const itemOwnerId = ddItems101.find((i) => i.itemKey === 'DD_C1_OWNER_IDENTITY');
  if (itemOwnerId) {
    itemOwnerId.status = 'VERIFIED';
    itemOwnerId.approvalStage = 'AUTHENTICITY_VERIFIED';
    itemOwnerId.evidenceReferences = [
      {
        id: 'EV-101-01',
        fileName: 'Aadhaar_PAN_Verification_Sunil_Lalwani.pdf',
        fileUrl: '/docs/kyc_sunil_lalwani.pdf',
        uploadedBy: 'USR-BRK-001',
        uploadedAt: now,
        documentType: 'GOVT_ID',
        documentNumber: 'XXXX-XXXX-9901',
        issuer: 'UIDAI / Income Tax Dept',
        secureStorageRef: 'vault://props/101/kyc_owner.pdf',
      },
    ];
  }

  const itemTax = ddItems101.find((i) => i.itemKey === 'DD_C6_REVENUE_TAX_RECORDS');
  if (itemTax) {
    itemTax.status = 'VERIFIED';
    itemTax.approvalStage = 'AUTHENTICITY_VERIFIED';
    itemTax.evidenceReferences = [
      {
        id: 'EV-101-02',
        fileName: 'Raipur_Nagar_Nigam_Tax_Receipt_2025_26.pdf',
        fileUrl: '/docs/tax_receipt_101.pdf',
        uploadedBy: 'USR-BRK-001',
        uploadedAt: now,
        documentType: 'TAX_RECEIPT',
        documentNumber: 'RNN-TX-882910',
        issuer: 'Raipur Municipal Corporation',
        secureStorageRef: 'vault://props/101/tax_receipt.pdf',
      },
    ];
  }

  const itemBoundary = ddItems101.find((i) => i.itemKey === 'DD_C7_POSSESSION_BOUNDARIES');
  if (itemBoundary) {
    itemBoundary.status = 'VERIFIED';
    itemBoundary.approvalStage = 'BROKER_CHECKED';
  }

  const ddItems102 = generateDueDiligenceItems('PROP-RAI-102', 'Commercial Office', {
    verifierId: 'USR-LEGAL-001',
    verifierRole: 'LEGAL_COUNSEL',
  });
  const ddItems103 = generateDueDiligenceItems('PROP-RAI-103', 'Residential Flat', {
    verifierId: 'USR-LEGAL-001',
    verifierRole: 'LEGAL_COUNSEL',
  });

  const dueDiligenceItems = [...ddItems101, ...ddItems102, ...ddItems103];

  const dueDiligenceIssues: DueDiligenceIssue[] = [
    {
      id: 'ISSUE-PROP-101-01',
      checklistId: 'DD-RAI-101-C03',
      propertyId: 'PROP-RAI-101',
      dealId: 'DEAL-2026-001',
      severity: 'MEDIUM',
      title: 'Co-owner Signature Required on Power of Attorney',
      description: 'Second legal heir (sister based in Pune) needs to provide registered NOC / consent deed for property transfer before registry date.',
      supportingEvidence: ['/docs/family_tree_affidavit.pdf'],
      responsibleResolverId: 'USR-OWNER-001',
      responsibleResolverName: 'Sunil Lalwani',
      deadline: '2026-10-25T18:00:00.000Z',
      resolutionPlan: 'Owner has dispatched registered consent affidavit to Pune for notary execution and courier dispatch.',
      status: 'IN_PROGRESS',
      responseNotes: 'Affidavit drafted by Adv. Devendra Mishra and sent via DTDC courier.',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const readinessReports: TransactionReadinessReport[] = [];

  const propertyMediaAssets: PropertyMediaAsset[] = [
    {
      id: 'ASSET-101-01',
      propertyId: 'PROP-RAI-101',
      uploaderId: 'USR-BRK-001',
      uploaderName: 'Vikramaditya Sharma',
      introducerId: 'USR-BRK-001',
      originalFileName: 'villa_facade_luxury_exterior.jpg',
      category: 'PHOTOGRAPH',
      mimeType: 'image/jpeg',
      fileSizeBytes: 2450000,
      fileUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
      storagePath: 'vault/PROP-RAI-101/photos/villa_facade_luxury_exterior.jpg',
      sha256Hash: sha256('ASSET-101-01:villa_facade'),
      description: 'Front elevation photograph showing private landscaped garden and dual car porch.',
      version: 1,
      sensitivity: 'PUBLIC',
      isMalwareScanned: true,
      status: 'ACTIVE',
      createdAt: now,
    },
    {
      id: 'ASSET-101-02',
      propertyId: 'PROP-RAI-101',
      uploaderId: 'USR-BRK-001',
      uploaderName: 'Vikramaditya Sharma',
      introducerId: 'USR-BRK-001',
      originalFileName: 'italian_marble_living_hall.jpg',
      category: 'PHOTOGRAPH',
      mimeType: 'image/jpeg',
      fileSizeBytes: 3120000,
      fileUrl: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80',
      storagePath: 'vault/PROP-RAI-101/photos/italian_marble_living_hall.jpg',
      sha256Hash: sha256('ASSET-101-02:living_hall'),
      description: 'Double-height grand living hall with imported Italian Statuario marble flooring.',
      version: 1,
      sensitivity: 'PUBLIC',
      isMalwareScanned: true,
      status: 'ACTIVE',
      createdAt: now,
    },
    {
      id: 'ASSET-101-03',
      propertyId: 'PROP-RAI-101',
      uploaderId: 'USR-BRK-001',
      uploaderName: 'Vikramaditya Sharma',
      introducerId: 'USR-BRK-001',
      originalFileName: 'villa_complete_walkthrough_4k.mp4',
      category: 'WALKTHROUGH_VIDEO',
      mimeType: 'video/mp4',
      fileSizeBytes: 48500000,
      fileUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
      storagePath: 'vault/PROP-RAI-101/videos/villa_complete_walkthrough_4k.mp4',
      sha256Hash: sha256('ASSET-101-03:walkthrough_video'),
      description: 'Complete 4K guided walkthrough from boundary gate to terrace penthouse lounge.',
      version: 1,
      sensitivity: 'CONFIDENTIAL',
      isMalwareScanned: true,
      status: 'ACTIVE',
      createdAt: now,
    },
    {
      id: 'ASSET-101-04',
      propertyId: 'PROP-RAI-101',
      uploaderId: 'USR-BRK-001',
      uploaderName: 'Vikramaditya Sharma',
      introducerId: 'USR-BRK-001',
      originalFileName: 'registered_sale_deed_2016_volume_742.pdf',
      category: 'OWNERSHIP_TITLE_DEED',
      mimeType: 'application/pdf',
      fileSizeBytes: 8900000,
      fileUrl: '/docs/sale_deed_shankar_nagar.pdf',
      storagePath: 'vault/PROP-RAI-101/title/registered_sale_deed_2016_volume_742.pdf',
      sha256Hash: sha256('ASSET-101-04:sale_deed_hash'),
      description: 'Registered Sale Deed executed in favor of Sunil Lalwani at Sub-Registrar Raipur Office.',
      version: 1,
      sensitivity: 'HIGHLY_SENSITIVE',
      isMalwareScanned: true,
      status: 'ACTIVE',
      createdAt: now,
    },
    {
      id: 'ASSET-101-05',
      propertyId: 'PROP-RAI-101',
      uploaderId: 'USR-BRK-001',
      uploaderName: 'Vikramaditya Sharma',
      introducerId: 'USR-BRK-001',
      originalFileName: 'sanctioned_building_layout_plan_smc.pdf',
      category: 'LAYOUT_SITE_PLAN',
      mimeType: 'application/pdf',
      fileSizeBytes: 4200000,
      fileUrl: '/docs/layout_sanction_smc.pdf',
      storagePath: 'vault/PROP-RAI-101/layout/sanctioned_building_layout_plan_smc.pdf',
      sha256Hash: sha256('ASSET-101-05:layout_plan'),
      description: 'Municipal Corporation Raipur (SMC) sanctioned structural floor and elevation plans.',
      version: 1,
      sensitivity: 'CONFIDENTIAL',
      isMalwareScanned: true,
      status: 'ACTIVE',
      createdAt: now,
    },
  ];

  const mediaShareGrants: MediaShareGrant[] = [
    {
      id: 'GRANT-2026-001',
      propertyId: 'PROP-RAI-101',
      grantedByUserId: 'USR-BRK-001',
      grantedByName: 'Vikramaditya Sharma',
      recipientType: 'DEAL_ROOM_PARTICIPANTS',
      recipientId: 'DEAL-2026-001',
      recipientName: 'Deal Room DEAL-2026-001 (Amit Kumar Verma & Rameshwar Dewangan)',
      assetIds: ['ASSET-101-01', 'ASSET-101-02', 'ASSET-101-03', 'ASSET-101-05'],
      permissionLevel: 'VIEW',
      locationPrecisionPermitted: 'EXACT_PIN',
      requiresAuthentication: true,
      allowForwarding: false,
      startAt: now,
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      isRevoked: false,
      createdAt: now,
    },
  ];

  const dealMessages: DealMessage[] = [
    {
      id: 'MSG-001',
      dealRoomId: 'DEAL-2026-001',
      senderId: 'USR-BRK-001',
      senderName: 'Vikramaditya Sharma',
      senderRole: 'BROKER',
      text: 'Namaste Amit ji! Welcoming you to the transparent Deal Room for Shankar Nagar Luxury Villa. Mandate terms and verified ownership docs are logged in the vault.',
      timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
    },
    {
      id: 'MSG-002',
      dealRoomId: 'DEAL-2026-001',
      senderId: 'USR-BRK-002',
      senderName: 'Amit Kumar Verma',
      senderRole: 'BROKER',
      text: 'Thanks Vikramaditya ji. Client Rameshwar Dewangan is keen on a physical visit this Saturday morning. Can we verify site boundaries and survey pillars beforehand?',
      timestamp: new Date(Date.now() - 3600000 * 18).toISOString(),
    },
    {
      id: 'MSG-003',
      dealRoomId: 'DEAL-2026-001',
      senderId: 'USR-BRK-001',
      senderName: 'Vikramaditya Sharma',
      senderRole: 'BROKER',
      text: 'Yes absolutely! Demarcation is already confirmed in the Due Diligence checklist. I have shared the walkthrough video and exact Google Maps pin in the Media Vault tab.',
      timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
    },
  ];

  return {
    users,
    invitations,
    properties,
    requirements,
    offers,
    dealRooms,
    siteVisits,
    ownerMandates,
    constructionLeads,
    contractorRequests,
    disputes,
    auditEvents,
    settings,
    builderProjects,
    associateMandates,
    dealTasks,
    commissionAgreements,
    dueDiligenceItems,
    dueDiligenceIssues,
    readinessReports,
    propertyMediaAssets,
    mediaShareGrants,
    dealMessages,
    crmLeads: [],
    crmBookings: [],
    bonusPayouts: [],
    targetBonusPayouts: [],
    inventoryUnits: [],
    inventoryPosts: [],
    siteCheckins: [],
    shareLinks: [],
    landRecords: [],
    growthLeads: [],
    resetRequests: [],
    privacyRequests: [],
    connectorReferrals: [],
    clientCards: [], projectUpdates: [], projectShortlists: [], leadReveals: [], visitPasses: [], propertyOffers: [], tier2Applications: [], tieups: [], deskRequests: [], dealMilestones: [], brokerNotes: [], posterEnquiries: [], marketRecords: [], digestPrefs: [], listingReports: [], pointEvents: [], chapters: [], chapterMeets: [], loanReferrals: [], protectedDocs: [], docAccessLogs: [], propertyDocs: [], propertyDocLogs: [], idDocs: [], idReviewTasks: [], kycVault: [], listingDrafts: [], ownerConsents: [], pushSubs: [], pushPrefs: [], broadcasts: [], peerConfirms: [], buyerBonds: [], partyAlerts: [], profilePhotos: [], clientRooms: [], chatReads: [], savedProperties: [], pageEnquiries: [], tenancies: [], partnerThreads: [], workPhotos: [], shopPartners: [], partnerLeads: [], paymentRequests: [], visitAcks: [], twoFactor: [], academyProgress: [], activityDays: [], masterCpAgreements: [], masterCpEntries: [], strengthLinks: [], legalRequests: [], legalProfiles: [], legalLedger: [], legalSettings: { ...DEFAULT_LEGAL_SETTINGS }, billingRules: [], billingPlans: [], billingLedger: [], billingGates: [],
  };
}

// ───────────────────────── migrations / hardening on load ─────────────────────────
function auditHash(e: Pick<AuditEvent, 'id' | 'timestamp' | 'actorId' | 'actorRole' | 'entityType' | 'entityId' | 'action' | 'details'>, previousHash: string) {
  return sha256(`${e.id}:${e.timestamp}:${e.actorId}:${e.actorRole}:${e.entityType}:${e.entityId}:${e.action}:${e.details}:${previousHash}`);
}

const GENESIS_HASH = '0'.repeat(64);

function verifyChain(events: AuditEvent[]): { isValid: boolean; checkedCount: number; brokenEventId?: number } {
  let prev = GENESIS_HASH;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.previousHash !== prev || ev.hash !== auditHash(ev, prev)) {
      return { isValid: false, checkedCount: i, brokenEventId: ev.id };
    }
    prev = ev.hash;
  }
  return { isValid: true, checkedCount: events.length };
}

function seedCrmDemo(state: DatabaseState) {
  const now = Date.now();
  const iso = (offsetDays: number) => new Date(now + offsetDays * 86400000).toISOString();
  const mk = (n: number, projectId: string, assoc: string, assocName: string, mandateId: string, p: Partial<CrmLead>): CrmLead => {
    const proj = state.builderProjects.find(x => x.id === projectId)!;
    const phone = p.phone || '+91 90000 00000';
    return {
      id: `CRM-L-${String(n).padStart(4, '0')}`,
      projectId,
      projectName: proj.projectName,
      builderId: proj.builderId,
      associateId: assoc,
      associateName: assocName,
      mandateId,
      name: 'Lead',
      phone,
      phoneKey: phone.replace(/\D/g, '').slice(-10),
      source: 'ASSOCIATE_REFERRAL',
      unitInterest: proj.unitConfigurations[0],
      stage: 'NEW',
      followUps: [],
      activities: [],
      protectedUntil: iso(60),
      createdAt: iso(-10),
      updatedAt: iso(-1),
      ...p,
    } as CrmLead;
  };
  const act = (id: string, type: CrmLead['activities'][number]['type'], note: string, by: string, byName: string, off: number) =>
    ({ id, type, note, byUserId: by, byName, at: iso(off) });

  const l1 = mk(1, 'PROJ-RAI-01', 'USR-BRK-001', 'Vikramaditya Sharma', 'MAND-RAI-01', {
    name: 'Dr. Meenal Khare', phone: '+91 98930 11201', email: 'meenal.khare@example.in', budgetMin: 15000000, budgetMax: 19000000,
    stage: 'NEGOTIATION', unitInterest: '3 BHK Sky Deck Flat (2,250 sq.ft)', nextFollowUpAt: iso(1),
    followUps: [{ id: 'FU-1', dueAt: iso(1), note: 'Share revised payment plan & floor options', channel: 'CALL', done: false, createdBy: 'USR-BRK-001' }],
    activities: [
      act('A-1', 'CALL', 'First call: looking for 3BHK near Telibandha, budget up to 1.9 Cr.', 'USR-BRK-001', 'Vikramaditya Sharma', -9),
      act('A-2', 'SITE_VISIT', 'Visited sample flat with spouse. Liked 14th floor east-facing.', 'USR-BRK-001', 'Vikramaditya Sharma', -5),
      act('A-3', 'STAGE_CHANGE', 'Stage moved to NEGOTIATION', 'USR-BRK-001', 'Vikramaditya Sharma', -2),
    ],
  });
  const l2 = mk(2, 'PROJ-RAI-01', 'USR-BRK-002', 'Amit Kumar Verma', 'MAND-RAI-02', {
    name: 'Sandeep Chandrakar', phone: '+91 94250 77123', source: 'CLIENT_REFERRAL', budgetMax: 17500000,
    stage: 'SITE_VISIT_SCHEDULED', nextFollowUpAt: iso(2),
    followUps: [{ id: 'FU-2', dueAt: iso(2), note: 'Site visit Saturday 11am', channel: 'SITE_VISIT', done: false, createdBy: 'USR-BRK-002' }],
    activities: [act('A-4', 'CALL', 'Interested in Duplex Penthouse; wants to see site on weekend.', 'USR-BRK-002', 'Amit Kumar Verma', -3)],
  });
  const l3 = mk(3, 'PROJ-RAI-02', 'USR-BRK-001', 'Vikramaditya Sharma', 'MAND-RAI-03', {
    name: 'Nitin Sahu', phone: '+91 98271 55009', budgetMax: 8500000, unitInterest: 'Prime Corner Estate Plot (4,200 sq.ft)',
    stage: 'BOOKING_REQUESTED', bookingId: 'CRM-B-0001',
    activities: [act('A-5', 'NOTE', 'Token cheque received; booking requested for corner plot C-14.', 'USR-BRK-001', 'Vikramaditya Sharma', -1)],
  });
  const l4 = mk(4, 'PROJ-RAI-02', 'USR-BRK-002', 'Amit Kumar Verma', 'MAND-RAI-04', {
    name: 'Kavita Banjare', phone: '+91 98260 90311', stage: 'CONTACTED', source: 'DIGITAL_CAMPAIGN', budgetMax: 7000000,
    nextFollowUpAt: iso(-1),
    followUps: [{ id: 'FU-3', dueAt: iso(-1), note: 'Call back — overdue', channel: 'CALL', done: false, createdBy: 'USR-BRK-002' }],
  });
  const l5 = mk(5, 'PROJ-RAI-01', '', 'Builder desk', '', {
    name: 'Rohan Deshmukh', phone: '+91 97700 12345', source: 'WALK_IN', stage: 'NEW', budgetMax: 22000000,
    unitInterest: 'Duplex Penthouse (5,100 sq.ft)',
  });
  const l6 = mk(6, 'PROJ-RAI-01', 'USR-BRK-001', 'Vikramaditya Sharma', 'MAND-RAI-01', {
    name: 'Pallavi Joshi', phone: '+91 99810 44556', stage: 'LOST', lostReason: 'Bought ready-to-move elsewhere', budgetMax: 12000000,
  });
  state.crmLeads = [l1, l2, l3, l4, l5, l6];

  const proj2 = state.builderProjects.find(x => x.id === 'PROJ-RAI-02')!;
  const agreement = 8200000;
  const sched = [
    { name: 'Booking amount', pct: 10 }, { name: 'Within 30 days (agreement)', pct: 20 },
    { name: 'On development milestone', pct: 40 }, { name: 'On registry', pct: 30 },
  ].map((m, i) => ({
    id: `PM-1-${i + 1}`, name: m.name, pct: m.pct, amount: Math.round((agreement * m.pct) / 100),
    dueDate: iso(i * 45), paid: false,
  }));
  state.crmBookings = [{
    id: 'CRM-B-0001', leadId: 'CRM-L-0003', projectId: 'PROJ-RAI-02', projectName: proj2.projectName, builderId: proj2.builderId,
    associateId: 'USR-BRK-001', mandateId: 'MAND-RAI-03', customerName: 'Nitin Sahu', unitNo: 'C-14',
    unitConfig: 'Prime Corner Estate Plot (4,200 sq.ft)', agreementValue: agreement, tokenAmount: 200000, status: 'REQUESTED',
    paymentSchedule: sched, brokeragePct: 3, brokerageAmount: Math.round(agreement * 0.03), brokeragePaidAmount: 0, tdsPct: 5,
    createdAt: iso(-1), updatedAt: iso(-1),
  }];
}

function migrateState(parsed: DatabaseState, seed: DatabaseState) {
  // Collections introduced after the first release
  parsed.crmLeads ||= [];
  parsed.crmBookings ||= [];
  // The seeded demo enquiry belongs to the demo buyer account (older demo databases left it unlinked, so that buyer saw nothing).
  for (const r of parsed.requirements || []) if (r.id === 'REQ-RAI-201' && !r.buyerId && parsed.users.some(u => u.id === 'USR-BUYER-001' && u.role === 'BUYER_TENANT')) r.buyerId = 'USR-BUYER-001';
  // An "approved" contact-access request is real only while the lead is assigned to that contractor.
  // (An older demo seed carried a stale one that un-masked a still-OPEN lead for a contractor who never signed.)
  if (Array.isArray(parsed.contractorRequests) && Array.isArray(parsed.constructionLeads)) {
    parsed.contractorRequests = parsed.contractorRequests.filter(r => r.status !== 'APPROVED' || parsed.constructionLeads.some(l => l.id === r.leadId && l.status === 'ASSIGNED' && l.assignedContractorId === r.contractorId));
  }
  parsed.bonusPayouts ||= [];
  parsed.targetBonusPayouts ||= [];
  parsed.inventoryUnits ||= [];
  parsed.inventoryPosts ||= [];
  parsed.siteCheckins ||= [];
  parsed.shareLinks ||= [];
  parsed.landRecords ||= [];
  parsed.growthLeads ||= [];
  parsed.resetRequests ||= [];
  parsed.privacyRequests ||= [];
  parsed.connectorReferrals ||= [];
  for (const k of ['clientCards', 'projectUpdates', 'projectShortlists', 'leadReveals', 'visitPasses', 'propertyOffers', 'tier2Applications', 'tieups', 'deskRequests', 'dealMilestones', 'brokerNotes', 'posterEnquiries', 'marketRecords', 'digestPrefs', 'listingReports', 'pointEvents', 'chapters', 'chapterMeets', 'loanReferrals', 'protectedDocs', 'docAccessLogs', 'propertyDocs', 'propertyDocLogs', 'idDocs', 'idReviewTasks', 'kycVault', 'listingDrafts', 'ownerConsents', 'pushSubs', 'pushPrefs', 'broadcasts', 'peerConfirms', 'buyerBonds', 'partyAlerts', 'profilePhotos', 'clientRooms', 'chatReads', 'savedProperties', 'pageEnquiries', 'tenancies', 'partnerThreads', 'workPhotos', 'shopPartners', 'partnerLeads', 'paymentRequests', 'visitAcks', 'twoFactor', 'academyProgress', 'activityDays', 'masterCpAgreements', 'masterCpEntries', 'strengthLinks', 'legalRequests', 'legalProfiles', 'legalLedger', 'billingRules', 'billingPlans', 'billingLedger', 'billingGates'] as const) (parsed as any)[k] ||= [];
  (parsed as any).legalSettings = { ...DEFAULT_LEGAL_SETTINGS, ...((parsed as any).legalSettings || {}) };
  // v11: listings created before freshness tracking start their 30-day clock now (nothing expires on upgrade)
  for (const p of parsed.properties) p.confirmedAt ||= new Date().toISOString();
  parsed.settings.connectorProgramEnabled ??= true;
  parsed.settings.connectorRewards ||= { ...DEFAULT_REWARDS };
  parsed.builderProjects ||= [];

  // ── demo only: GENZ Connector partners + 50 referrals ──
  if (SEED_DEMO && !parsed.users.some(u => u.role === 'GENZ_CONNECTOR')) {
    const demo = buildConnectorDemo(parsed.users);
    parsed.users.push(...demo.users);
    parsed.connectorReferrals = demo.referrals;
  }

  // ── demo only: a profile for every role, plus employees on every employer side ──
  if (SEED_DEMO) {
    const nowI = new Date().toISOString();
    const principal = (id: string, name: string, phone: string, role: UserRole, company: string, extra: Partial<UserProfile> = {}) => {
      if (parsed.users.some(u => u.id === id)) return;
      parsed.users.push({
        id, name, email: `${phone.replace(/\D/g, '').slice(-10)}@phone.genz.local`, phone, role, city: 'Raipur', state: 'Chhattisgarh',
        companyName: company, verificationStatus: 'VERIFIED', verificationNotes: 'Demo account', createdAt: nowI, ...extra,
      } as UserProfile);
    };
    principal('USR-ADMIN-2', 'Neha Chandrakar', '+91 90000 40001', 'ADMIN', 'GENZ Operations Desk (Verification)');
    principal('USR-BUILDER-002', 'Ar. Manish Thakur', '+91 90000 40002', 'DEVELOPER_BUILDER', 'Thakur Realty & Developers', { reraNumber: 'CGRERAP150124B0002' });
    principal('USR-CONTRACTOR-002', 'Sanjay Sahu', '+91 90000 40003', 'CONTRACTOR', 'Sahu Civil Works');
    principal('USR-OWNER-002', 'Sunita Verma', '+91 90000 40004', 'PROPERTY_OWNER', 'Individual');
    principal('USR-BUYER-002', 'Dr. Anil Kumar', '+91 90000 40005', 'BUYER_TENANT', 'Individual');
    principal('USR-LEGAL-002', 'Adv. Kavita Joshi', '+91 90000 40006', 'LEGAL_COUNSEL', 'Joshi & Associates', { reraNumber: 'CG/2210/2016' });

    // employees: employer → [id, name, phone, title]
    const staff: Record<string, [string, string, string, string][]> = {
      'USR-BRK-001': [['USR-TEAM-001', 'Pooja Nayak', '+91 90000 30001', 'Telecaller'], ['USR-TEAM-002', 'Rakesh Dewangan', '+91 90000 30002', 'Site executive']],
      'USR-BRK-002': [['USR-TEAM-003', 'Divya Sinha', '+91 90000 30003', 'Telecaller'], ['USR-TEAM-004', 'Imran Khan', '+91 90000 30004', 'Field agent']],
      'USR-BUILDER-001': [['USR-TEAM-005', 'Komal Sahu', '+91 90000 30005', 'Sales coordinator'], ['USR-TEAM-006', 'Yogesh Tandon', '+91 90000 30006', 'Site manager']],
      'USR-BUILDER-002': [['USR-TEAM-007', 'Aarti Pandey', '+91 90000 30007', 'CRM executive']],
      'USR-CONTRACTOR-001': [['USR-TEAM-008', 'Dinesh Yadav', '+91 90000 30008', 'Site supervisor'], ['USR-TEAM-009', 'Meena Rathore', '+91 90000 30009', 'Estimator']],
      'USR-CONTRACTOR-002': [['USR-TEAM-010', 'Gopal Verma', '+91 90000 30010', 'Site supervisor']],
      'USR-ADMIN-1': [['USR-TEAM-011', 'Rohit Chauhan', '+91 90000 30011', 'Connector desk executive'], ['USR-TEAM-012', 'Anjali Das', '+91 90000 30012', 'KYC support']],
      'USR-SUPERADMIN': [['USR-TEAM-013', 'Harsh Agrawal', '+91 90000 30013', 'Founder office assistant']],
    };
    for (const [empId, list] of Object.entries(staff)) {
      const emp = parsed.users.find(u => u.id === empId);
      if (!emp) continue;
      for (const [id, name, phone, title] of list) {
        if (parsed.users.some(u => u.id === id)) continue;
        parsed.users.push({
          id, name, email: `${phone.replace(/\D/g, '').slice(-10)}@phone.genz.local`, phone, role: 'TEAM_MEMBER',
          city: emp.city, state: emp.state, companyName: emp.companyName, employerId: emp.id, employerRole: emp.role, teamTitle: title,
          consent: { policyVersion: '2026-10-01', acceptedAt: nowI, ip: `employer-attested:${emp.id}` },
          verificationStatus: 'VERIFIED', verificationNotes: `Added by ${emp.name} (demo).`, createdAt: nowI,
        } as UserProfile);
      }
    }
  }
  // ── demo only: word-of-mouth growth data (waitlist across cities, who invited whom, one public card) ──
  if (SEED_DEMO && parsed.growthLeads.length === 0) {
    const t = new Date().toISOString();
    const mk = (i: number, name: string, phone: string, city: string, state: string, role: UserRole, source: 'NOMINATION' | 'WAITLIST', nominatorId?: string, status: 'NEW' | 'REJECTED' = 'NEW'): GrowthLead => ({
      id: `GL-${String(i).padStart(4, '0')}`, name, phone, city, state, role, source, nominatorId, consent: true, status, createdAt: new Date(Date.now() - i * 86400000).toISOString(), updatedAt: t,
    });
    parsed.growthLeads = [
      mk(1, 'Sachin Deshmukh', '+91 90000 50001', 'Nagpur', 'Maharashtra', 'BROKER', 'NOMINATION', 'USR-BRK-001'),
      mk(2, 'Pallavi Joshi', '+91 90000 50002', 'Nagpur', 'Maharashtra', 'BROKER', 'WAITLIST'),
      mk(3, 'Rajesh Wankhede', '+91 90000 50003', 'Nagpur', 'Maharashtra', 'DEVELOPER_BUILDER', 'WAITLIST'),
      mk(4, 'Imtiaz Ali', '+91 90000 50004', 'Bhopal', 'Madhya Pradesh', 'BROKER', 'NOMINATION', 'USR-BRK-002'),
      mk(5, 'Neelam Rathore', '+91 90000 50005', 'Bhopal', 'Madhya Pradesh', 'CONTRACTOR', 'WAITLIST'),
      mk(6, 'Harpal Singh', '+91 90000 50006', 'Indore', 'Madhya Pradesh', 'BROKER', 'WAITLIST'),
      mk(7, 'Meghna Shah', '+91 90000 50007', 'Indore', 'Madhya Pradesh', 'LEGAL_COUNSEL', 'NOMINATION', 'USR-BRK-003'),
      mk(8, 'Kunal Kulkarni', '+91 90000 50008', 'Pune', 'Maharashtra', 'BROKER', 'WAITLIST'),
      mk(9, 'Divya Menon', '+91 90000 50009', 'Pune', 'Maharashtra', 'DEVELOPER_BUILDER', 'WAITLIST'),
      mk(10, 'Anil Bisht', '+91 90000 50010', 'Dehradun', 'Uttarakhand', 'BROKER', 'WAITLIST'),
      mk(11, 'Sunita Dubey', '+91 90000 50011', 'Bilaspur', 'Chhattisgarh', 'BROKER', 'NOMINATION', 'USR-BRK-004'),
      mk(12, 'Gaurav Tiwari', '+91 90000 50012', 'Bhilai', 'Chhattisgarh', 'CONTRACTOR', 'NOMINATION', 'USR-BRK-001'),
    ];
    const by: Record<string, string> = { 'USR-BRK-002': 'USR-BRK-001', 'USR-BRK-003': 'USR-BRK-001', 'USR-BRK-004': 'USR-BRK-002', 'USR-BUILDER-002': 'USR-BUILDER-001', 'USR-CONTRACTOR-002': 'USR-CONTRACTOR-001' };
    for (const [uid, inv] of Object.entries(by)) { const x = parsed.users.find(u => u.id === uid); if (x && !x.invitedById) x.invitedById = inv; }
    const v = parsed.users.find(u => u.id === 'USR-BRK-001');
    if (v) { v.referralCode ||= 'GZ-VIKR-1001'; v.publicCard ||= { enabled: true, showPhone: true, headline: 'Plots & flats across Raipur — verified listings only', views: 0 }; }
  }
  // employees carry their employer's role (drives their permissions)
  for (const m of parsed.users) {
    if (m.role === 'TEAM_MEMBER') m.employerRole = parsed.users.find(u => u.id === m.employerId)?.role ?? m.employerRole;
  }

  // ── users: session version + credentials ──
  const bootstrapNotes: string[] = [];
  for (const u of parsed.users) {
    u.sessionVersion ||= 1;
    if (!u.passwordHash) {
      if (DEMO_MODE) {
        u.passwordHash = hashPassword(DEMO_PASSWORD);
      } else if (u.role === 'SUPERADMIN') {
        const pw = process.env.SEED_ADMIN_PASSWORD || randomPassword();
        u.passwordHash = hashPassword(pw);
        u.mustChangePassword = true;
        bootstrapNotes.push(`[AUTH] Bootstrap login → ${u.email} / ${pw}  (change it on first login)`);
      } else {
        u.passwordHash = unusablePasswordHash();
        u.mustChangePassword = true;
      }
    }
  }
  bootstrapNotes.forEach(n => console.warn(n));

  // ── builder projects must belong to a real builder (an old unguarded endpoint let any role "launch" projects) ──
  const builder = parsed.users.find(u => u.role === 'DEVELOPER_BUILDER');
  for (const pr of parsed.builderProjects) {
    const owner = parsed.users.find(u => u.id === pr.builderId);
    if (builder && (!owner || owner.role !== 'DEVELOPER_BUILDER')) {
      pr.builderId = builder.id;
      pr.builderName = builder.companyName || builder.name;
    }
  }
  for (const m of parsed.associateMandates || []) {
    const pr = parsed.builderProjects.find(p => p.id === m.projectId);
    if (pr) { m.builderId = pr.builderId; m.builderName = pr.builderName; }
  }

  // ── owner mandates: surplus-above-net model + two-party status ──
  for (const m of parsed.ownerMandates || []) {
    m.remunerationBasis ||= 'SURPLUS_ABOVE_NET';
    if (!m.status) {
      m.status = m.isConfirmed ? 'ACTIVE' : 'PENDING_BROKER';
      m.ownerSignedAt ||= m.createdAt;
      if (m.isConfirmed) m.brokerSignedAt ||= m.confirmedAt || m.createdAt;
    }
    delete (m as any).otpChallenge;
  }

  // ── site visits: random per-visit QR secret (previous token was the guessable visit id) ──
  for (const v of parsed.siteVisits || []) {
    if (!v.qrToken) v.qrToken = crypto.randomBytes(12).toString('base64url');
  }

  // ── deals: ownerRemunerationConfirmed must reflect a really confirmed mandate ──
  for (const d of parsed.dealRooms || []) {
    const confirmed = (parsed.ownerMandates || []).some(m => m.propertyId === d.propertyId && m.isConfirmed);
    if (d.ownerRemunerationConfirmed && !confirmed) d.ownerRemunerationConfirmed = false;
  }

  if (parsed.crmLeads.length === 0 && parsed.crmBookings.length === 0 && parsed.builderProjects.length > 0) {
    seedCrmDemo(parsed);
  }

  // v20: every record needs an id for the PostgreSQL store (activity days were stored without one)
  for (const d of parsed.activityDays || []) if (!(d as any).id) (d as any).id = d.day;

  // ── audit chain: legacy seed events were not hashed with the live formula → re-seal ONCE ──
  // v20: only the first time. After that a broken chain at start-up is kept broken and shown to the admins
  // (re-sealing on every start would quietly hide anyone who edited the database file).
  const v = verifyChain(parsed.auditEvents);
  const sealedBefore = !!parsed.settings.auditChainSealedAt;
  if (!v.isValid && !sealedBefore) {
    let prev = GENESIS_HASH;
    for (const ev of parsed.auditEvents) {
      ev.previousHash = prev;
      ev.hash = auditHash(ev, prev);
      prev = ev.hash;
    }
    const last = parsed.auditEvents[parsed.auditEvents.length - 1];
    const id = (last ? last.id : 0) + 1;
    const timestamp = new Date().toISOString();
    const ev: AuditEvent = {
      id, timestamp, actorId: 'SYSTEM', actorRole: 'SUPERADMIN', entityType: 'SYSTEM', entityId: 'AUDIT_CHAIN',
      action: 'AUDIT_CHAIN_RESEALED',
      details: `Hash chain re-sealed during security migration (legacy events were not verifiable). ${parsed.auditEvents.length} prior events preserved.`,
      previousHash: prev, hash: '',
    };
    ev.hash = auditHash(ev, prev);
    parsed.auditEvents.push(ev);
  } else if (!v.isValid) {
    console.error(`[AUDIT] hash chain is BROKEN at event #${v.brokenEventId} — not re-sealing; Control Center shows it.`);
  }
  if (!sealedBefore) parsed.settings.auditChainSealedAt = new Date().toISOString();

  // ── demo only: unit grids for two builder projects + escalator slabs on the plotted project ──
  if (SEED_DEMO && parsed.inventoryUnits.length === 0) {
    const ts = new Date().toISOString();
    const mk = (projectId: string, group: string, label: string, floor: number | undefined, config: string, area: number, price: number, status: InventoryUnit['status']): InventoryUnit => ({
      id: `UNIT-${projectId}-${label}`, projectId, builderId: 'USR-BUILDER-001', group, label, floor, config, areaSqft: area, price, status, updatedAt: ts,
    });
    const p1 = parsed.builderProjects.find(p => p.id === 'PROJ-RAI-01');
    const p2 = parsed.builderProjects.find(p => p.id === 'PROJ-RAI-02');
    if (p1) {
      for (let f = 1; f <= 5; f++) for (let n = 1; n <= 4; n++) {
        const label = `A-${f}${String(n).padStart(2, '0')}`;
        const st: InventoryUnit['status'] = (f === 1 && n <= 2) ? 'BOOKED' : (f === 5 && n === 4) ? 'RESERVED' : 'AVAILABLE';
        parsed.inventoryUnits.push(mk(p1.id, 'Tower A', label, f, n % 2 ? '3 BHK' : '2 BHK', n % 2 ? 1650 : 1180, 8500000 + f * 150000 + n * 100000, st));
      }
    }
    if (p2) {
      for (let n = 1; n <= 24; n++) parsed.inventoryUnits.push(mk(p2.id, 'Phase 1', `P-${n}`, undefined, 'Plot', 1200 + (n % 4) * 300, 3600000 + n * 80000, n <= 3 ? 'BOOKED' : n === 24 ? 'RESERVED' : 'AVAILABLE'));
      p2.cpSlabs ||= [
        { from: 1, to: 3, commissionPct: 2.5 },
        { from: 4, to: 8, commissionPct: 3.5, reward: 'Bangkok trip' },
        { from: 9, to: null, commissionPct: 4, reward: 'Gold coin' },
      ];
    }
    // v16.8 — property facts on the demo grid, so the plots / flats show road sides, facing and features
    const FAC = ['EAST', 'NORTH', 'WEST', 'SOUTH', 'NORTH_EAST'];
    for (const x of parsed.inventoryUnits) {
      const n = Number(/(\d+)$/.exec(x.label)?.[1] ?? 0);
      if (x.projectId === 'PROJ-RAI-02') {
        x.facing = FAC[n % FAC.length];
        x.roadSides = n % 6 === 0 ? 3 : n % 3 === 0 ? 2 : 1;
        x.roadWidthFt = n % 4 === 0 ? 60 : n % 2 === 0 ? 40 : 30;
        const w = [30, 40, 50][n % 3]; x.dimensions = `${w} x ${Math.round((x.areaSqft || 1200) / w)} ft`;
        x.features = [...(n % 5 === 0 ? ['PARK_FACING'] : []), ...(n % 7 === 0 ? ['MAIN_ROAD'] : []), ...(n % 2 === 1 ? ['VASTU'] : []), 'REGULAR_SHAPE'];
        if (x.roadSides >= 2) x.features.push('CORNER');
        if (x.roadSides === 3) x.note = 'Three sides open — extra frontage';
      } else if (x.projectId === 'PROJ-RAI-01') {
        x.facing = FAC[n % FAC.length];
        x.features = [...((x.floor || 0) >= 5 ? ['TERRACE'] : []), ...(n % 2 ? ['PARK_FACING'] : ['GARDEN_VIEW']), 'COVERED_PARKING'];
      }
    }
    // v16.8 — demo team: Pooja sees only what her boss posts (no rates), Rakesh sees the whole grid with rates and may send customers links
    const brk1 = parsed.users.find(u => u.id === 'USR-BRK-001');
    if (brk1) brk1.firmSegment = 'BIG_FIRM';
    const tp = parsed.users.find(u => u.id === 'USR-TEAM-001'); const tr = parsed.users.find(u => u.id === 'USR-TEAM-002');
    if (tp) tp.teamPolicy = { phoneMode: 'FULL', revealCap: 30, canRegister: true, canMarkLost: true, canClaim: false, canVerify: false, canScanVisits: false, scope: 'ASSIGNED', projectIds: [], onLeave: false, ...(tp.teamPolicy || {}), invMode: 'SHARED', invPrice: false, invFeatures: true, invShareOut: false };
    if (tr) tr.teamPolicy = { phoneMode: 'FULL', revealCap: 30, canRegister: true, canMarkLost: true, canClaim: false, canVerify: false, canScanVisits: false, scope: 'ASSIGNED', projectIds: [], onLeave: false, ...(tr.teamPolicy || {}), invMode: 'ALL', invPrice: true, invFeatures: true, invShareOut: true };
    if (tp && p2 && brk1) {
      const ids = parsed.inventoryUnits.filter(x => x.projectId === p2.id && x.status === 'AVAILABLE').slice(0, 6).map(x => x.id);
      parsed.inventoryPosts.push({ id: 'POST-DEMO-1', employerId: brk1.id, projectId: p2.id, unitIds: ids, memberIds: [], showPrice: false, showFeatures: true, note: 'Push these this week — corner plots first', createdBy: brk1.id, createdByName: brk1.name, createdAt: ts, active: true });
    }
  }

  // ── demo only: allot some CRM leads / a deal room to the demo employees, and put two partners in broker USR-BRK-001's own network ──
  if (SEED_DEMO) {
    const t1 = parsed.users.find(u => u.id === 'USR-TEAM-001'); const t2 = parsed.users.find(u => u.id === 'USR-TEAM-002');
    if (t1 && t2) {
      const mine = (parsed.crmLeads || []).filter(l => l.associateId === 'USR-BRK-001' && !l.assignedMemberId);
      mine.slice(0, 2).forEach(l => { l.assignedMemberId = t1.id; l.assignedMemberName = t1.name; });
      mine.slice(2, 3).forEach(l => { l.assignedMemberId = t2.id; l.assignedMemberName = t2.name; });
      const deal = (parsed.dealRooms || []).find(d => d.introducingBrokerId === 'USR-BRK-001' || d.closingBrokerId === 'USR-BRK-001');
      if (deal && !deal.teamMemberIds) deal.teamMemberIds = [t1.id];
    }
    const brk = parsed.users.find(u => u.id === 'USR-BRK-001');
    if (brk) {
      for (const cid of ['USR-CON-001', 'USR-CON-002']) {
        const c = parsed.users.find(u => u.id === cid);
        if (c?.connector && !c.connector.sponsorId) {
          c.connector.sponsorId = brk.id;
          (parsed.connectorReferrals || []).filter(r => r.connectorId === cid && !['DUPLICATE', 'REJECTED'].includes(r.status)).forEach(r => {
            r.sponsorId = brk.id; r.sponsorName = brk.name;
            if (!r.assignedToId || r.assignedToRole === 'BROKER') { r.assignedToId = brk.id; r.assignedToName = brk.name; r.assignedToRole = 'BROKER'; }
          });
        }
      }
    }
  }

  // ── demo only, opt-in: 10–15 accounts for every role and a full set of records (server/demoBulk.ts) ──
  if (SEED_DEMO && SEED_DEMO_BULK && !parsed.users.some(u => u.id === 'USR-BRK-005')) {
    seedDemoBulk(parsed, DEMO_MODE ? hashPassword(DEMO_PASSWORD) : unusablePasswordHash());
  }
}

class Database {
  private state: DatabaseState;

  constructor() {
    if (PRELOADED.usingPg) {
      this.state = this.initFromPostgres(PRELOADED.state as DatabaseState | null);
    } else {
      this.ensureDataDir();
      this.state = this.loadState();
    }
  }

  private initFromPostgres(loaded: DatabaseState | null): DatabaseState {
    let state = loaded;
    if (!state) {
      // First boot on an empty database: optionally import a legacy JSON file, otherwise seed.
      if (process.env.IMPORT_JSON === 'true' && fs.existsSync(DB_FILE)) {
        state = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) as DatabaseState;
        console.log('[DB] Imported legacy data/database.json into PostgreSQL');
      } else {
        state = SEED_DEMO ? getInitialSeedData() : productionSeed();
      }
    }
    migrateState(state, SEED_DEMO ? getInitialSeedData() : productionSeed());
    this.saveStateDirect(state);
    return state;
  }

  private ensureDataDir() {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadState(): DatabaseState {
    try {
      if (fs.existsSync(DB_FILE)) {
        const data = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed: DatabaseState = JSON.parse(data);
        const seed = (SEED_DEMO ? getInitialSeedData() : productionSeed());
        if (!parsed.builderProjects || parsed.builderProjects.length === 0) {
          parsed.builderProjects = seed.builderProjects;
        }
        if (!parsed.associateMandates || parsed.associateMandates.length === 0) {
          parsed.associateMandates = seed.associateMandates;
        }
        if (!parsed.dealTasks || parsed.dealTasks.length === 0) {
          parsed.dealTasks = seed.dealTasks;
        }
        if (!parsed.commissionAgreements || parsed.commissionAgreements.length === 0) {
          parsed.commissionAgreements = seed.commissionAgreements;
        }
        if (!parsed.dueDiligenceItems || parsed.dueDiligenceItems.length === 0) {
          parsed.dueDiligenceItems = seed.dueDiligenceItems;
        }
        if (!parsed.dueDiligenceIssues || parsed.dueDiligenceIssues.length === 0) {
          parsed.dueDiligenceIssues = seed.dueDiligenceIssues;
        }
        if (!parsed.readinessReports) {
          parsed.readinessReports = seed.readinessReports;
        }
        if (!parsed.propertyMediaAssets || parsed.propertyMediaAssets.length === 0) {
          parsed.propertyMediaAssets = seed.propertyMediaAssets;
        }
        if (!parsed.mediaShareGrants || parsed.mediaShareGrants.length === 0) {
          parsed.mediaShareGrants = seed.mediaShareGrants;
        }
        if (!parsed.dealMessages || parsed.dealMessages.length === 0) {
          parsed.dealMessages = seed.dealMessages;
        }
        migrateState(parsed, seed);
        // Ensure builder user exists
        if (!parsed.users.some(u => u.id === 'USR-BUILDER-001')) {
          const builderUser = seed.users.find(u => u.id === 'USR-BUILDER-001');
          if (builderUser) parsed.users.push(builderUser);
        }
        // Ensure legal user exists
        if (!parsed.users.some(u => u.id === 'USR-LEGAL-001')) {
          const legalUser = seed.users.find(u => u.id === 'USR-LEGAL-001');
          if (legalUser) parsed.users.push(legalUser);
        }
        this.saveStateDirect(parsed);
        return parsed;
      }
    } catch (err) {
      console.error('[DB] Failed to parse existing db file, initializing seed:', err);
    }
    const seed = (SEED_DEMO ? getInitialSeedData() : productionSeed());
    migrateState(seed, seed);
    this.saveStateDirect(seed);
    return seed;
  }

  /** Atomic write (tmp file + rename) so a crash mid-write can never leave a truncated database.json. */
  private saveStateDirect(state: DatabaseState) {
    if (pgStore) { pgStore.schedule(state as any); return; }
    this.writeNow(state);
  }

  private writeNow(state: DatabaseState) {
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmp, DB_FILE);
  }

  private flushTimer: NodeJS.Timeout | null = null;
  /** Many handlers call save() + appendAuditEvent() (= two saves) per request. Coalesce them into one write a moment later,
   *  so a big database does not block the event loop on every click. Flushed on shutdown too. */
  /** Bumped on every save(): read-side caches (trust index, directory, pulse) rebuild only when the data really changed. */
  public version = 0;

  /**
   * v20 — O(1) look-up by id for any collection (the code did `users.find(u => u.id === x)` inside loops over
   * thousands of rows). Ids never change and documents are never swapped in place; the map is rebuilt after any
   * write (version), array swap or length change, so it is never stale.
   */
  private idIdx = new Map<string, { arr: any[]; len: number; v: number; m: Map<string, any> }>();
  public byId<K extends keyof DatabaseState>(key: K, id: string | undefined | null): (DatabaseState[K] extends (infer T)[] ? T : never) | undefined {
    if (!id) return undefined;
    const arr = this.state[key] as unknown as any[];
    if (!Array.isArray(arr)) return undefined;
    let x = this.idIdx.get(key as string);
    if (!x || x.arr !== arr || x.len !== arr.length || x.v !== this.version) {
      const m = new Map<string, any>(); for (const d of arr) if (d && d.id != null) m.set(String(d.id), d);
      x = { arr, len: arr.length, v: this.version, m }; this.idIdx.set(key as string, x);
    }
    const hit = x.m.get(String(id));
    if (hit && hit.id === id) return hit;
    // belt and braces: a stale map never returns a wrong record
    const slow = arr.find(d => d && d.id === id); if (slow) x.m.set(String(id), slow);
    return slow;
  }
  public bump() { this.version++; }
  /** v39 shared mode: another instance changed the database — take its copy (server/sharedSync.ts). */
  public replaceState(next: DatabaseState) {
    // same normalising as a cold start: empty collections have no rows in Postgres, so they come back missing
    migrateState(next, SEED_DEMO ? getInitialSeedData() : productionSeed());
    this.state = next; this.idIdx.clear(); this.version++;
  }

  private lastWriteMs = 0;
  private warnedBig = false;
  public save() {
    this.version++;
    if (pgStore) { pgStore.schedule(this.state as any); return; }
    if (this.flushTimer) return;
    // v20: the JSON file is rewritten whole; space writes by how long the last one took so a big file cannot hog the server
    const delay = Math.max(150, Math.min(10_000, this.lastWriteMs * 3));
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      const t0 = Date.now();
      try { this.writeNow(this.state); } catch (e) { console.error('[DB] write failed', e); }
      this.lastWriteMs = Date.now() - t0;
      if (this.lastWriteMs > 400 && !this.warnedBig) {
        this.warnedBig = true;
        console.warn(`[DB] saving data/database.json took ${this.lastWriteMs} ms — this size needs PostgreSQL (set DATABASE_URL, see docs/DEPLOY_INDIA.md).`);
      }
    }, delay);
    this.flushTimer.unref?.();
  }

  /** Write any pending change immediately (used on SIGTERM / SIGINT / exit). */
  public flush() {
    if (pgStore) return;
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
    try { this.writeNow(this.state); } catch (e) { console.error('[DB] flush failed', e); }
  }

  public getState(): DatabaseState {
    return this.state;
  }

  // Record an immutable append-only audit event with cryptographic hash chaining
  public appendAuditEvent(
    actorId: string,
    actorRole: UserRole,
    entityType: AuditEvent['entityType'],
    entityId: string,
    action: string,
    details: string
  ): AuditEvent {
    const lastEvent = this.state.auditEvents[this.state.auditEvents.length - 1];
    const previousHash = lastEvent ? lastEvent.hash : GENESIS_HASH;
    const id = (lastEvent ? lastEvent.id : 0) + 1;
    const timestamp = new Date().toISOString();
    const hash = auditHash({ id, timestamp, actorId, actorRole, entityType, entityId, action, details }, previousHash);

    const newEvent: AuditEvent = {
      id,
      timestamp,
      actorId,
      actorRole,
      entityType,
      entityId,
      action,
      details,
      previousHash,
      hash,
    };

    this.state.auditEvents.push(newEvent);
    this.save();
    return newEvent;
  }

  /**
   * v20 — the chain is verified incrementally: events already checked are not re-hashed on every page view
   * (300k events took ~1 s per view). The tip of the checked part is re-compared each time, and `full` re-checks
   * everything (Control Center button, start-up and once an hour).
   */
  private chainChecked = { count: 0, hash: '', ok: true, brokenEventId: undefined as number | undefined, fullAt: '' };
  public verifyAuditIntegrity(full = false): { isValid: boolean; checkedCount: number; brokenEventId?: number; fullCheckedAt?: string } {
    const ev = this.state.auditEvents;
    const c = this.chainChecked;
    const tipChanged = c.count > 0 && (ev.length < c.count || ev[c.count - 1]?.hash !== c.hash);
    if (full || tipChanged || c.count === 0) {
      const r = verifyChain(ev);
      this.chainChecked = { count: r.isValid ? ev.length : 0, hash: r.isValid ? (ev[ev.length - 1]?.hash || '') : '', ok: r.isValid, brokenEventId: r.brokenEventId, fullAt: new Date().toISOString() };
      return { ...r, fullCheckedAt: this.chainChecked.fullAt };
    }
    if (!c.ok) return { isValid: false, checkedCount: 0, brokenEventId: c.brokenEventId, fullCheckedAt: c.fullAt };
    let prev = c.hash;
    for (let i = c.count; i < ev.length; i++) {
      const e = ev[i];
      if (e.previousHash !== prev || e.hash !== auditHash(e, prev)) {
        this.chainChecked = { ...c, ok: false, brokenEventId: e.id };
        return { isValid: false, checkedCount: i, brokenEventId: e.id, fullCheckedAt: c.fullAt };
      }
      prev = e.hash;
    }
    this.chainChecked = { ...c, count: ev.length, hash: prev };
    return { isValid: true, checkedCount: ev.length, fullCheckedAt: c.fullAt };
  }
}

export const db = new Database();
process.once('exit', () => db.flush());
