/**
 * Builder ⇄ Associates CRM — shared (server + client) types.
 *
 * Pipeline modelled on how Indian developer / channel-partner CRMs work:
 *   Lead registered (dedupe-protected) → contacted → site visit → negotiation
 *   → booking request (by associate) → approval (by builder) → payment schedule
 *   → associate brokerage accrual → payout.
 */

import type { LeadProfile, CrmHandoff, BookingPlan, BookingToken } from '../shared/crmSales.js';
import type { MoneyTrail } from '../shared/moneyTrail.js';
export type { LeadProfile, CrmHandoff, BookingPlan, BookingToken } from '../shared/crmSales.js';

/** v16.7 widened the list — the full, labelled list lives in src/shared/crmSales.ts (LEAD_SOURCES). */
export type CrmLeadSource =
  | 'ASSOCIATE_REFERRAL'
  | 'WALK_IN'
  | 'DIGITAL_CAMPAIGN'
  | 'HOARDING_OR_PRINT'
  | 'CLIENT_REFERRAL'
  | 'EXHIBITION'
  | 'TELECALLING'
  | 'EMPLOYEE_REFERRAL'
  | 'SOCIAL_MEDIA'
  | 'WEBSITE_ENQUIRY'
  | 'PROPERTY_PORTAL'
  | 'WHATSAPP_OR_SMS'
  | 'NEWSPAPER_TV_RADIO'
  | 'EXISTING_CUSTOMER'
  | 'OTHER';

export type CrmLeadStage =
  | 'NEW'
  | 'CONTACTED'
  | 'SITE_VISIT_SCHEDULED'
  | 'SITE_VISITED'
  | 'NEGOTIATION'
  | 'BOOKING_REQUESTED'
  | 'BOOKED'
  | 'LOST';

export const CRM_STAGE_ORDER: CrmLeadStage[] = [
  'NEW',
  'CONTACTED',
  'SITE_VISIT_SCHEDULED',
  'SITE_VISITED',
  'NEGOTIATION',
  'BOOKING_REQUESTED',
  'BOOKED',
  'LOST',
];

export type CrmActivityType = 'CALL' | 'WHATSAPP' | 'MEETING' | 'SITE_VISIT' | 'NOTE' | 'STAGE_CHANGE' | 'SYSTEM';

export interface CrmActivity {
  id: string;
  type: CrmActivityType;
  note: string;
  byUserId: string;
  byName: string;
  at: string;
  /** v16.7 — a telecaller's structured call result (type CALL only) */
  call?: { outcome: string; durationMin?: number; attempt: number };
}

export interface CrmFollowUp {
  id: string;
  dueAt: string;
  note: string;
  channel: 'CALL' | 'WHATSAPP' | 'MEETING' | 'SITE_VISIT';
  done: boolean;
  doneAt?: string;
  createdBy: string;
}

export interface CrmLead {
  id: string; // CRM-L-0001
  projectId: string;
  projectName: string;
  builderId: string;
  /** associate (broker) who registered / owns the lead; empty for builder-direct leads */
  associateId: string;
  associateName: string;
  mandateId?: string;
  /** employee (TEAM_MEMBER) of the associate / builder who is currently working this lead */
  assignedMemberId?: string;
  assignedMemberName?: string;
  name: string;
  phone: string;
  /** normalised last-10-digits, used for duplicate / channel-conflict protection */
  phoneKey: string;
  email?: string;
  source: CrmLeadSource;
  /** v16.7 — campaign / portal / referrer name that goes with the source */
  sourceDetail?: string;
  /** v16.7 — what a salesperson wants to know about the customer (purpose, funding, timeline …) */
  profile?: LeadProfile;
  /** v16.7 — who passed the lead on to whom (telecaller → executive → coordinator …) */
  handoffs?: CrmHandoff[];
  budgetMin?: number;
  budgetMax?: number;
  unitInterest: string;
  stage: CrmLeadStage;
  lostReason?: string;
  nextFollowUpAt?: string;
  followUps: CrmFollowUp[];
  activities: CrmActivity[];
  /** Registration protection: while active, no other associate can register the same buyer for the project */
  protectedUntil: string;
  /** v12: builder verification of associate-registered leads. Absent = accepted (legacy / auto). */
  verify?: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  verifyDueAt?: string;
  verifyNote?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  /** v12: the builder's side scanned the visitor's QR pass at the site */
  visitProof?: { at: string; byName: string; passId: string };
  /** shortlist this lead was promoted from */
  shortlistId?: string;
  /** staff phone mode applied to this response (never stored) */
  phoneMasked?: boolean;
  /** v16 — DPDP: the registering user attested that the customer agreed to be contacted */
  consent?: { at: string; byId: string; byName: string; via: 'FORM' | 'IMPORT' | 'SHORTLIST' | 'API' };
  /** v16 — customer asked not to be contacted: outreach is locked, data is erased after a short period */
  optedOutAt?: string;
  temperature?: 'HOT' | 'WARM' | 'COLD';
  tags?: string[];
  lostCode?: string;
  visitFeedback?: CrmVisitFeedback[];
  protectionExtensions?: number;
  erasedAt?: string;
  /** computed on read (never stored) */
  callAttempts?: number;
  callsConnected?: number;
  lastCallOutcome?: string;
  lastCallAt?: string;
  detailsFilled?: number;
  detailsTotal?: number;
  forwardUnseen?: boolean;
  /** what the employer lets this employee do (only sent to employees) */
  memberCan?: { forward: boolean; requestBooking: boolean };
  stale?: boolean;
  protectionDaysLeft?: number;
  lastActivityAt?: string;
  bookingId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmVisitFeedback {
  id: string; at: string; byId: string; byName: string;
  rating: number; liked: string[]; objection: string; nextStep: string;
}
export interface CrmReceipt {
  id: string; amount: number; mode: 'CASH' | 'CHEQUE' | 'UPI' | 'NEFT_RTGS' | 'DD' | 'LOAN' | 'OTHER'; ref: string;
  at: string; byId: string; byName: string;
  reversed?: { at: string; byName: string; reason: string };
  /** v16.9 — the money trail (collector → CP → builder) this receipt came from */
  trailId?: string;
}
export interface CrmPayout {
  id: string; amount: number; tdsPct: number; tds: number; net: number;
  mode: 'CASH' | 'CHEQUE' | 'UPI' | 'NEFT_RTGS' | 'OTHER'; ref: string; paidOn: string;
  byId: string; byName: string; at: string;
  /** RECORDED = builder says paid; CONFIRMED = associate says received; DISPUTED = associate says not received */
  status: 'RECORDED' | 'CONFIRMED' | 'DISPUTED'; ackAt?: string; ackNote?: string;
}
export interface CrmPaymentMilestone {
  id: string;
  name: string; // "Booking amount", "On plinth", ...
  pct: number; // percent of agreement value
  amount: number;
  dueDate: string;
  paid: boolean;
  paidAt?: string;
  receiptNo?: string;
  /** v16 — partial collections: money received so far (absent on older records = full amount when `paid`) */
  paidAmount?: number;
  receipts?: CrmReceipt[];
  /** v16 — the associate says the customer already paid this; the builder must record it or answer */
  claim?: { id: string; at: string; byId: string; byName: string; note: string; status: 'OPEN' | 'RESOLVED' };
}

export interface CrmBooking {
  id: string; // CRM-B-0001
  leadId: string;
  projectId: string;
  projectName: string;
  builderId: string;
  associateId: string;
  mandateId?: string;
  customerName: string;
  unitNo: string;
  unitConfig: string;
  agreementValue: number;
  tokenAmount: number;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  /** v16.7 — the booking amount the customer says they paid; the builder confirms it (GENZ moves no money) */
  token?: BookingToken;
  /** v16.7 — the customer's payment condition as agreed with the salesperson */
  plan?: BookingPlan;
  coApplicantName?: string;
  /** v16.7 — who raised the request (an associate, the builder, or an employee on their behalf) */
  requestedBy?: { id: string; name: string; role: string; onBehalfOf?: string };
  /** v16.7 — a sale made by the builder's own desk: no associate, no brokerage */
  direct?: boolean;
  /** v16.9 — stage-wise custody of the customer's payments: collected → CP confirmed → handed to builder → builder confirmed */
  trails?: MoneyTrail[];
  decisionNote?: string;
  decidedBy?: string;
  decidedAt?: string;
  paymentSchedule: CrmPaymentMilestone[];
  /** associate brokerage accrues on approval; paid out in tranches */
  brokeragePct: number;
  brokerageAmount: number;
  brokeragePaidAmount: number;
  tdsPct: number;
  /** v16 — payout ledger (UTR / mode / date, associate confirmation) */
  payouts?: CrmPayout[];
  cancelRequest?: { at: string; byId: string; byName: string; reason: string; status: 'OPEN' | 'APPROVED' | 'REJECTED'; decisionNote?: string };
  settlement?: { refundAmount: number; forfeitAmount: number; clawbackAmount: number; clawbackStatus: 'NONE' | 'DUE' | 'RECOVERED'; note: string; at: string };
  createdAt: string;
  updatedAt: string;
}
