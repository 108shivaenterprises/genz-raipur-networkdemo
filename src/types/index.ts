import type { PropertyType } from '../shared/india.js';
export type UserRole =
  | 'SUPERADMIN'
  | 'ADMIN'
  | 'BROKER'
  | 'PROPERTY_OWNER'
  | 'BUYER_TENANT'
  | 'CONTRACTOR'
  | 'DEVELOPER_BUILDER'
  | 'LEGAL_COUNSEL'
  | 'GENZ_CONNECTOR'
  | 'TEAM_MEMBER';

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
  access?: 'OPEN_APPLY' | 'INVITE_ONLY';
  leadIntake?: 'OPEN' | 'PAUSED';
  intakeNote?: string;
  leadVerification?: 'AUTO' | 'MANUAL';
  registrationDays?: number;
  earlyBirdIncentiveBonusPct?: number;
  bonusScheme?: import('../shared/bonus.js').BonusScheme;
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
  statusReason?: string;
  dailyLeadCap?: number;
  validUntil?: string;
}

export type TrustTier = 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE' | 'NEW';

export interface TrustScoreDetails {
  score: number; // 0 to 100
  tier: TrustTier;
  completedDeals: number;
  verifiedSiteVisits: number;
  activeMandates?: number;
  disputePenalty?: number;
  lastUpdated?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  city: string;
  state?: string;
  brokerId?: string;
  referralCode?: string;
  plan?: string;
  chapterId?: string;
  boostUntil?: string;
  companyName?: string;
  reraNumber?: string;
  panNumber?: string;
  gstin?: string;
  /** v18 — broker tier, sponsor of record (who registered this member) and ID status (Aadhaar: last 4 digits only; never the full number) */
  tier?: 'TIER1' | 'TIER2';
  sponsorId?: string;
  aadhaarLast4?: string;
  idCheckedAt?: string;
  idCheckNote?: string;
  consent?: { policyVersion: string; acceptedAt: string };
  /** TEAM_MEMBER only */
  employerId?: string;
  employerRole?: UserRole;
  teamTitle?: string;
  teamRole?: string;
  /** GENZ_CONNECTOR only */
  connector?: { shopType: string; shopName: string; locality?: string; whatsapp?: string; payoutUpi?: string };
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED' | 'BLACKLISTED';
  verificationNotes?: string;
  avatarUrl?: string;
  createdAt: string;

  // Deterministic Trust Score based on completed deals & verified physical site visits
  trustScore?: number;
  trustTier?: TrustTier;
  completedDealsCount?: number;
  verifiedSiteVisitsCount?: number;
  trustDetails?: TrustScoreDetails;
}

export interface Invitation {
  id: string;
  code: string;
  invitedEmail: string;
  invitedPhone: string;
  targetRole: UserRole;
  issuedBy: string;
  status: 'PENDING' | 'REDEEMED' | 'EXPIRED' | 'REVOKED';
  expiresAt: string;
  redeemedBy?: string;
  redeemedAt?: string;
  createdAt: string;
}

export interface Property {
  /** v26/v28 — the owner's consent behind the listing and the bypass-protection end date it gave */
  ownerConsentId?: string;
  protectionUntil?: string;
  id: string;
  title: string;
  description: string;
  propertyType: PropertyType;
  transactionType: 'Sale' | 'Rent' | 'Lease';
  city: string;
  locality: string;
  addressHidden: string;
  landmark: string;
  // Nation-wide Location & Address Fields
  state?: string; // e.g. Chhattisgarh, Maharashtra, Madhya Pradesh, Delhi NCR, etc.
  district?: string;
  tehsil?: string;
  village?: string;
  street?: string;
  pincode?: string;
  tags?: string[];
  googleMapsUrl?: string;
  googleMapsDirectionsUrl?: string;
  latitude?: number;
  longitude?: number;
  locationPrecision?: 'APPROXIMATE_LOCALITY' | 'GENERAL_AREA' | 'EXACT_PIN';

  // Rich Media: Video, Walkthrough
  videoUrl?: string; // YouTube, MP4, Vimeo walkthrough link
  plotAreaSqFt?: number;
  builtUpAreaSqFt?: number;
  askingPrice: number;
  ownerApprovedNetPrice?: number;
  listingBrokerId: string;
  ownerId: string;
  ownerName: string;
  ownerPhone: string;
  listingStatus: 'draft' | 'pending_verification' | 'active' | 'under_negotiation' | 'sold' | 'rented' | 'withdrawn' | 'suspended';
  verificationStatus: 'VERIFIED' | 'PENDING' | 'REJECTED';
  duplicateHash: string;
  priceHistory: Array<{ price: number; changedAt: string; reason: string }>;
  images: string[];
  documents: Array<{ id: string; name: string; url: string; category: string }>;
  createdAt: string;
  updatedAt: string;
}

// Media Vault & Controlled Sharing Interfaces
export type MediaSensitivity = 'PUBLIC' | 'CONFIDENTIAL' | 'HIGHLY_SENSITIVE';
export type MediaCategory =
  | 'PHOTOGRAPH'
  | 'WALKTHROUGH_VIDEO'
  | 'OWNERSHIP_TITLE_DEED'
  | 'SALE_DEED_CHAIN'
  | 'LAYOUT_SITE_PLAN'
  | 'SURVEY_MEASUREMENT'
  | 'TAX_RECEIPT_NOC'
  | 'OTHER_ATTACHMENT';

export interface PropertyMediaAsset {
  id: string;
  propertyId: string;
  uploaderId: string;
  uploaderName: string;
  introducerId?: string;
  originalFileName: string;
  category: MediaCategory;
  mimeType: string;
  fileSizeBytes: number;
  fileUrl: string;
  storagePath: string;
  sha256Hash: string;
  description: string;
  version: number;
  sensitivity: MediaSensitivity;
  isMalwareScanned: boolean;
  status: 'ACTIVE' | 'ARCHIVED' | 'REVOKED';
  createdAt: string;
}

export type SharePermissionLevel = 'PREVIEW' | 'VIEW' | 'DOWNLOAD' | 'CONTRIBUTE';

export interface MediaShareGrant {
  id: string;
  propertyId: string;
  grantedByUserId: string;
  grantedByName: string;
  recipientType: 'BROKER' | 'CONNECTOR' | 'BUYER' | 'DEAL_ROOM_PARTICIPANTS' | 'VERIFIED_GROUP';
  recipientId: string;
  recipientName: string;
  assetIds: string[];
  permissionLevel: SharePermissionLevel;
  locationPrecisionPermitted: 'APPROXIMATE_LOCALITY' | 'GENERAL_AREA' | 'EXACT_PIN';
  requiresAuthentication: boolean;
  allowForwarding: boolean;
  startAt: string;
  expiresAt?: string;
  isRevoked: boolean;
  revokedAt?: string;
  revocationReason?: string;
  createdAt: string;
}

export interface DealMessage {
  id: string;
  dealRoomId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  /** 'BROKERS' = private channel of the two deal brokers; the property owner never sees it */
  audience?: 'ALL' | 'BROKERS';
  mediaUrl?: string;
  mediaType?: 'IMAGE' | 'DOCUMENT' | 'AUDIO_VOICE_NOTE';
  timestamp: string;
}

export interface BuyerRequirement {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface MatchScore {
  propertyId: string;
  requirementId: string;
  score: number;
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
  proposedIntroducingShare: number;
  proposedClosingShare: number;
  terms: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COUNTERED';
  createdAt: string;
  respondedAt?: string;
  property?: Property;
  proposingBroker?: UserProfile;
  receivingBroker?: UserProfile;
  requirement?: BuyerRequirement;
}

export interface DealRoom {
  id: string;
  propertyId: string;
  requirementId: string;
  introducingBrokerId: string;
  closingBrokerId: string;
  ownerId: string;
  customerId: string;
  stage: 'Lead' | 'Introduction' | 'Site Visit Done' | 'Negotiation' | 'Agreement' | 'Handover' | 'Settled' | 'Disputed';
  totalCommissionExpected: number;
  introducingBrokerSharePct: number;
  closingBrokerSharePct: number;
  ownerRemunerationConfirmed: boolean;
  ownerProtectionExpiresAt: string;
  siteVisitsCount: number;
  agreementHash?: string;
  /** true when the server stripped the commercial terms (e.g. the viewer is the property owner) */
  commercialsHidden?: boolean;
  /** v21: the price the deal is worth — agreed by the brokers in the commission agreement, else the listing's asking price (sale deals) */
  dealValue?: number;
  /** v21: true when the viewer is a GENZ admin and no dispute is open — the server then sends only the summary */
  summaryOnly?: boolean;
  disputeId?: string;
  settlementStatus: 'PROPOSED' | 'AGREED' | 'DUE' | 'PARTIALLY_PAID' | 'PAID' | 'DISPUTED';
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SiteVisit {
  id: string;
  dealRoomId: string;
  propertyId: string;
  brokerId: string;
  customerName: string;
  customerPhone?: string;
  scheduledTime: string;
  /** Only present for the customer / owner / admins (and brokers in DEMO_MODE). */
  otpCode?: string;
  /** Same visibility as otpCode — the QR secret. */
  qrToken?: string;
  isVerified: boolean;
  /** v33 — the buyer's “no direct deal” acknowledgement: NONE (older visit / no mobile), PENDING, ACKED */
  ackStatus?: 'NONE' | 'PENDING' | 'ACKED';
  /** v34 — where the visit QR is scanned */
  scanAt?: string;
  verifiedAt?: string;
  verificationMethod: 'OTP' | 'QR' | 'ADMIN_OVERRIDE';
  feedbackNotes?: string;
  createdAt: string;
}

export interface OwnerMandate {
  id: string;
  propertyId: string;
  ownerId: string;
  brokerId: string;
  advertisedPrice: number;
  /** the owner's FIXED final / net amount; everything realised above it is the listing broker's remuneration */
  approvedNetPrice: number;
  remunerationBasis: 'SURPLUS_ABOVE_NET' | 'PERCENTAGE' | 'FIXED_FEE';
  agreedCommissionPct?: number;
  fixedFeeAmount?: number;
  protectionPeriodDays: number;
  agreementHash: string;
  status: 'PENDING_BROKER' | 'ACTIVE' | 'REJECTED' | 'WITHDRAWN' | 'SUPERSEDED';
  ownerSignedAt: string;
  brokerSignedAt?: string;
  decisionNote?: string;
  isConfirmed: boolean;
  confirmedAt?: string;
  createdAt: string;
  // server-added projection fields
  ownerName?: string;
  brokerName?: string;
  propertyTitle?: string;
  brokerRemunerationAtAsking?: number;
  ownerReceivesAtAsking?: number;
  /** v27 — the owner agreed on the consent link / signed form (not a GENZ user) */
  consentId?: string;
  offPlatformOwner?: { name: string; phoneLast4: string };
  ownerSignature?: { initials?: string; drawn: boolean; at: string; name?: string } | null;
}

export interface ConstructionLead {
  id: string;
  title: string;
  projectType: 'Turnkey Residential' | 'Commercial Interior Fitout' | 'Renovation & Remodel' | 'Structural Expansion' | 'Architectural Sanction';
  approximateLocation: string;
  exactAddressHidden: string;
  estimatedBudget: number;
  scopeDescription: string;
  timeline: string;
  referringBrokerId: string;
  referringBrokerName: string;
  referralCommissionPct: number;
  customerNameMasked: string;
  customerPhoneHidden: string;
  customerConsentAt?: string;
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  assignedContractorId?: string;
  finalContractValue?: number;
  referralCommissionDue?: number;
  referralCommissionPaid?: boolean;
  createdAt: string;
}

export interface Dispute {
  id: string;
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
  entityType: string;
  entityId: string;
  action: string;
  details: string;
  previousHash: string;
  hash: string;
}

export type ActivityEventType =
  | 'PROPERTY_LISTED'
  | 'PROPERTY_UPDATED'
  | 'DEAL_ROOM_CREATED'
  | 'DEAL_STAGE_ADVANCED'
  | 'SITE_VISIT_SCHEDULED'
  | 'SITE_VISIT_VERIFIED'
  | 'MANDATE_APPOINTED'
  | 'DISPUTE_LOGGED';

export interface PlatformActivityEvent {
  id: string;
  type: ActivityEventType;
  title: string;
  description: string;
  timestamp: string;
  actorName: string;
  actorRole: UserRole;
  actorId: string;
  entityId: string;
  targetTab?: 'properties' | 'deals' | 'builder' | 'disputes' | 'onboarding' | 'matches';
  metadata?: {
    locality?: string;
    propertyTitle?: string;
    price?: number;
    stage?: string;
    dealId?: string;
    customerName?: string;
    verificationMethod?: string;
    commissionExpected?: number;
    badge?: string;
  };
}

// ==========================================
// MODULE A: RESPONSIBILITY MATRIX & AGREEMENTS
// ==========================================

export type TaskCategory =
  | 'INTRO_COMMUNICATION'
  | 'DUE_DILIGENCE_LEGAL'
  | 'FINANCIAL_LOAN'
  | 'REGISTRATION_GOVT'
  | 'HANDOVER_CONSTRUCTION';

export type TaskStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'WAIVED';

export type AssignmentAcceptance =
  | 'PENDING_ACCEPTANCE'
  | 'ACCEPTED'
  | 'REJECTED';

export type VerificationStatus =
  | 'UNVERIFIED'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'REJECTED';

export interface TaskEvidence {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
  uploadedBy: string;
  mimeType?: string;
}

export interface TaskReassignmentRecord {
  fromUserId: string;
  toUserId: string;
  reassignedBy: string;
  reassignedAt: string;
  reason: string;
}

export interface TaskDisputeRecord {
  disputeId: string;
  raisedAt: string;
  reason: string;
  status: string;
}

export interface DealTask {
  id: string; // e.g. TSK-2026-001-01
  dealId: string;
  taskKey: string;
  title: string;
  description: string;
  category: TaskCategory;
  isApplicable: boolean;
  notApplicableReason?: string;
  assignedParticipantId: string;
  assignedParticipantRole: string;
  assignedParticipantName: string;
  assignmentAcceptance: AssignmentAcceptance;
  acceptedAt?: string;
  acceptedBy?: string;
  responsibleParticipantId: string; // RACI Responsible
  supportingParticipantIds: string[]; // RACI Supporting
  reviewingParticipantId: string; // RACI Reviewer
  dueDate: string;
  taskStatus: TaskStatus;
  completionTimestamp?: string;
  completionNote?: string;
  evidenceAttachments: TaskEvidence[];
  verificationStatus: VerificationStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  verificationNotes?: string;
  reassignmentHistory: TaskReassignmentRecord[];
  disputeHistory: TaskDisputeRecord[];
}

/**
 * v21: a commission payment is written down by the brokers themselves (GENZ never records money). One broker records it,
 * the OTHER broker confirms it — only a confirmed entry counts towards `paidAmount`.
 */
export interface CommissionPaymentEntry {
  id: string; // PAY-1, PAY-2 …
  amount: number;
  /** bank reference / UTR / cheque no. — free text, never a card or account number */
  ref: string;
  paidOn: string; // YYYY-MM-DD
  note?: string;
  recordedById: string;
  recordedByName: string;
  recordedAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  confirmedById?: string;
  confirmedByName?: string;
  confirmedAt?: string;
  rejectNote?: string;
}

export interface CommissionParticipantAllocation {
  participantId: string;
  participantName: string;
  role: string;
  allocationPct: number;
  allocationAmount: number;
  basisDescription: string;
  entitlementStatus: 'AGREED' | 'EARNED' | 'RECEIVABLE' | 'PAID' | 'DISPUTED';
  paidAmount: number;
  disputedAmount: number;
  taxDeductionTdsPct: number;
  invoiceRequired: boolean;
  /** v21: payments written down by the brokers (see CommissionPaymentEntry) */
  payments?: CommissionPaymentEntry[];
}

export interface PaymentTrigger {
  triggerId: string;
  milestoneName: string;
  stage: string;
  percentage: number;
  amount: number;
  dueDate?: string;
  isMet: boolean;
  confirmedAt?: string;
}

export interface SignatureAuditRecord {
  signerName: string;
  signerEmail: string;
  ipAddress: string;
  authMethod: 'COMPLIANT_E_SIGN_PKEY' | 'AADHAAR_ESIGN_GATEWAY' | 'DIGITAL_SEAL';
  timestamp: string;
  cryptoHash: string;
}

export interface AgreementApproval {
  userId: string;
  userName: string;
  role: string;
  hasAccepted: boolean;
  acceptedAt?: string;
  signatureAuditTrail?: SignatureAuditRecord;
}

export interface DealCommissionAgreement {
  id: string; // e.g. AGR-2026-001-V1
  dealId: string;
  version: number;
  status:
    | 'DRAFT'
    | 'SENT_TO_PARTICIPANTS'
    | 'ACCEPTED'
    | 'ACTIVE'
    | 'AMENDED'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'DISPUTED';
  totalAgreedBrokerage: number;
  /** v21: the price the property is being sold for, as the two brokers agreed it (shown to GENZ as a total only) */
  dealValue?: number;
  payer: 'SELLER' | 'BUYER' | 'SPLIT_EQUAL' | 'BUILDER_DEVELOPER';
  contractualBasis: string;
  calculationBasis:
    | 'PERCENTAGE_OF_TOTAL_DEAL_VALUE'
    | 'FIXED_LUMPSUM_ESCROW'
    | 'PERCENTAGE_OF_BROKERAGE_POOL';
  allocations: CommissionParticipantAllocation[];
  paymentTriggers: PaymentTrigger[];
  applicableTaxes: {
    gstPct: number;
    tdsPct: number;
    invoiceMandatory: boolean;
  };
  cancellationClause: string;
  disputeProcess: string;
  proposedBy: string;
  proposedByName: string;
  proposalReason: string;
  previousVersionId?: string;
  requiredApprovals: AgreementApproval[];
  cryptoSealHash: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// MODULE B: DUE DILIGENCE ENGINE & READINESS
// ==========================================

export type DueDiligenceCategory =
  | 'COMMON_TITLE'
  | 'REVENUE_MUNICIPAL'
  | 'PHYSICAL_BOUNDARY'
  | 'STATUTORY_ZONING'
  | 'PLOT_LAND'
  | 'FLAT_APARTMENT'
  | 'INDEPENDENT_HOUSE'
  | 'COMMERCIAL_UNIT'
  | 'AGRICULTURAL_LAND';

export type DueDiligenceItemStatus =
  | 'NOT_STARTED'
  | 'PENDING_DOCUMENT'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'ISSUE_FOUND'
  | 'REJECTED'
  | 'NOT_APPLICABLE';

export type ApprovalGateStage =
  | 'NONE'
  | 'DOCUMENT_UPLOADED'
  | 'BROKER_CHECKED'
  | 'AUTHENTICITY_VERIFIED'
  | 'LEGAL_REVIEW_COMPLETED'
  | 'ISSUE_RESOLVED'
  | 'READINESS_APPROVED';

export interface DueDiligenceEvidence {
  id: string;
  fileName: string;
  fileUrl: string;
  uploadedBy: string;
  uploadedAt: string;
  documentType: string;
  documentNumber?: string;
  issuer?: string;
  issueDate?: string;
  secureStorageRef: string;
  fileSizeBytes?: number;
  mimeType?: string;
  checksumSha256?: string;
  isConfidential?: boolean;
  accessScope?: 'ALL_VERIFIED_BROKERS' | 'DEAL_PARTICIPANTS_ONLY' | 'OWNER_AND_ADMIN_ONLY' | 'CUSTOM_BROKERS';
  sharedBrokerIds?: string[];
  notes?: string;
  /** set when the paper is a real file kept in the Property Papers library */
  libraryDocId?: string;
}

export interface ChecklistAuditLog {
  action: string;
  performedBy: string;
  timestamp: string;
  details: string;
}

export interface DueDiligenceChecklistItem {
  id: string;
  propertyId: string;
  dealId?: string;
  templateVersion: number;
  category: DueDiligenceCategory;
  itemKey: string;
  title: string;
  description: string;
  propertyTypeApplicability: string[]; // e.g. ['ALL'] or specific types
  isApplicable: boolean;
  notApplicableReason?: string;
  responsibleVerifierId: string;
  responsibleVerifierRole: string;
  status: DueDiligenceItemStatus;
  approvalStage: ApprovalGateStage;
  requiredDocument: string;
  acceptableEvidenceDescription: string;
  evidenceReferences: DueDiligenceEvidence[];
  verificationMethod:
    | 'DOCUMENT_CROSS_CHECK'
    | 'GOVT_PORTAL_REGISTRY'
    | 'PHYSICAL_INSPECTION'
    | 'INDEPENDENT_LEGAL_OPINION'
    | 'COURT_RECORD_SEARCH';
  verificationResult?: string;
  reviewerId?: string;
  reviewerName?: string;
  reviewerRole?: string;
  reviewTimestamp?: string;
  comments: Array<{
    id: string;
    authorId: string;
    authorName: string;
    text: string;
    createdAt: string;
  }>;
  mismatchSeverity?: 'INFORMATIONAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reverificationDate?: string;
  auditHistory: ChecklistAuditLog[];
}

export interface DueDiligenceIssue {
  id: string;
  checklistId?: string;
  propertyId: string;
  dealId?: string;
  severity: 'INFORMATIONAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  supportingEvidence: string[];
  responsibleResolverId: string;
  responsibleResolverName: string;
  deadline: string;
  resolutionPlan: string;
  responseNotes?: string;
  resolutionEvidence?: string[];
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'ACCEPTED_RISK' | 'REOPENED';
  reviewerDecision?: string;
  reviewedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionReadinessReport {
  id: string;
  dealId: string;
  propertyId: string;
  generatedAt: string;
  generatedBy: string;
  checklistCompletion: {
    totalItems: number;
    verifiedCount: number;
    pendingCount: number;
    waivedCount: number;
    percentage: number;
  };
  criticalIssuesCount: number;
  unresolvedExceptions: Array<{
    title: string;
    severity: string;
    status: string;
    description: string;
  }>;
  pendingDocuments: string[];
  legalReviewerDetails: {
    name: string;
    barRegistration: string;
    legalOpinionStatus:
      | 'TITLE_CLEAR_MARKETABLE'
      | 'SUBJECT_TO_CONDITIONS'
      | 'DEFECT_FOUND'
      | 'PENDING_OPINION';
    signedAt?: string;
  };
  approvedResponsibilities: {
    totalTasks: number;
    completedTasks: number;
    verifiedTasks: number;
    allResponsibilitiesAccepted: boolean;
  };
  registryCoordinationOwner: {
    id: string;
    name: string;
    role: string;
  };
  paymentHandoverMilestones: Array<{
    trigger: string;
    amount?: number;
    isMet: boolean;
  }>;
  isReadyForRegistry: boolean;
  blockers: string[];
  statutoryDisclaimer: string;
}

