import {
  UserProfile,
  Invitation,
  Property,
  BuyerRequirement,
  DealRoom,
  SiteVisit,
  ConstructionLead,
  Dispute,
  AuditEvent,
  CollaborationOffer,
  BuilderProject,
  SalesAssociateMandate,
  DealTask,
  DealCommissionAgreement,
  DueDiligenceChecklistItem,
  DueDiligenceIssue,
  TransactionReadinessReport,
  PropertyMediaAsset,
  MediaShareGrant,
  DealMessage,
  PlatformActivityEvent,
  OwnerMandate,
} from '../types/index.js';
import type { CrmLead, CrmBooking } from '../types/crm.js';

/** v20 — drop-down values for a partial (paged) listing list */
export interface PropertyFacets { states: { name: string; n: number }[]; cities: { state: string; city: string; n: number }[]; tags: { name: string; n: number }[] }

/** Session lives in an HttpOnly cookie set by the server; the client never stores identity or tokens. */
export class ApiError extends Error {
  /** the whole error body — lets a screen show row-by-row problems (sheet import) */
  public body?: any;
  constructor(message: string, public status: number, public code?: string, body?: any) {
    super(message);
    this.body = body;
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON error body */
  }

  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/login')) onUnauthorized?.();
    throw new ApiError(data.error || 'Network error occurred', res.status, data.code, data);
  }

  return data;
}

export type Permission = string;
export interface SessionInfo {
  success: boolean;
  /** v26 — the password was right; the authenticator code is still needed */
  twoFactorRequired?: boolean;
  ticket?: string;
  twoFactorSuggested?: boolean;
  user: UserProfile;
  permissions: Permission[];
  mustChangePassword?: boolean;
  impersonatedBy?: { id: string; name: string };
}

export const api = {
  // Auth
  authConfig: () =>
    request<{
      success: boolean;
      demoMode: boolean;
      demoPassword?: string;
      demoAccounts: { id: string; name: string; email: string; role: string; companyName?: string; verificationStatus: string }[];
    }>('/api/auth/config'),
  login: (email: string, password: string) =>
    request<SessionInfo>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login2fa: (ticket: string, code: string) => request<SessionInfo>('/api/auth/login/2fa', { method: 'POST', body: JSON.stringify({ ticket, code }) }),
  twoFactorStatus: () => request<any>('/api/auth/2fa/status'),
  twoFactorSetup: (password: string) => request<any>('/api/auth/2fa/setup', { method: 'POST', body: JSON.stringify({ password }) }),
  twoFactorEnable: (code: string) => request<any>('/api/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) }),
  twoFactorDisable: (password: string, code: string) => request<any>('/api/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password, code }) }),
  logout: () => request<{ success: boolean }>('/api/auth/logout', { method: 'POST', body: '{}' }),
  getMe: () => request<SessionInfo>('/api/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ success: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  getUsers: () => request<{ success: boolean; users: UserProfile[]; activeUserId: string }>('/api/auth/users'),
  impersonate: (userId: string) =>
    request<{ success: boolean; user: UserProfile }>('/api/auth/impersonate', { method: 'POST', body: JSON.stringify({ userId }) }),
  stopImpersonating: () => request<{ success: boolean; user: UserProfile }>('/api/auth/impersonate/stop', { method: 'POST', body: '{}' }),
  getPermissionMatrix: () =>
    request<{ success: boolean; roles: string[]; matrix: any }>('/api/auth/permission-matrix'),
  revokeInvitation: (id: string) =>
    request<{ success: boolean }>(`/api/invitations/${id}/revoke`, { method: 'POST', body: '{}' }),
  registerInvite: (payload: {
    code: string;
    name: string;
    email?: string;
    phone: string;
    companyName?: string;
    shopType?: string;
    shopName?: string;
    locality?: string;
    payoutUpi?: string;
    reraNumber?: string;
    state?: string;
    city?: string;
    password: string;
    panNumber?: string;
    gstin?: string;
    /** v18 — 12-digit Aadhaar typed once; the server keeps only the last 4 digits */
    aadhaarNumber?: string;
    idConsent?: boolean;
    consent: boolean;
  }) => request<{ success: boolean; user: UserProfile; autoVerified?: boolean }>('/api/auth/register-invite', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  // Invitations
  getInvitations: () => request<{ success: boolean; invitations: Invitation[] }>('/api/invitations'),
  createInvitation: (payload: { invitedEmail?: string; invitedPhone: string; targetRole: string }) =>
    request<{ success: boolean; invitation: Invitation }>('/api/invitations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  validateInvite: (code: string) =>
    request<{ valid: boolean; invitation?: Invitation; error?: string }>(`/api/invitations/validate/${encodeURIComponent(code)}`),

  // Verification Review
  reviewVerification: (userId: string, action: string, notes?: string) =>
    request<{ success: boolean; user: UserProfile }>(`/api/verifications/${userId}/review`, {
      method: 'POST',
      body: JSON.stringify({ action, notes }),
    }),

  // Properties
  getProperties: (filters?: { locality?: string; propertyType?: string; maxPrice?: number; state?: string; city?: string; pincode?: string; tag?: string; q?: string; scope?: 'boot'; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (filters?.state) params.append('state', filters.state);
    if (filters?.city) params.append('city', filters.city);
    if (filters?.pincode) params.append('pincode', filters.pincode);
    if (filters?.tag) params.append('tag', filters.tag);
    if (filters?.locality) params.append('locality', filters.locality);
    if (filters?.propertyType) params.append('propertyType', filters.propertyType);
    if (filters?.maxPrice) params.append('maxPrice', String(filters.maxPrice));
    if (filters?.q) params.append('q', filters.q);
    if (filters?.scope) params.append('scope', filters.scope);
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.offset) params.append('offset', String(filters.offset));
    return request<{ success: boolean; properties: Property[]; total?: number; scoped?: boolean; hasMore?: boolean; facets?: PropertyFacets }>(`/api/properties?${params.toString()}`);
  },
  getProperty: (id: string) => request<{ success: boolean; property: Property }>(`/api/properties/${id}`),
  createProperty: (payload: any) =>
    request<{ success: boolean; property: Property }>('/api/properties', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updatePropertyPrice: (id: string, newAskingPrice: number, reason: string) =>
    request<{ success: boolean; property: Property }>(`/api/properties/${id}/price-update`, {
      method: 'POST',
      body: JSON.stringify({ newAskingPrice, reason }),
    }),
  updateProperty: (id: string, payload: Partial<Property> & { priceChangeReason?: string }) =>
    request<{ success: boolean; property: Property }>(`/api/properties/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteProperty: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/properties/${id}`, {
      method: 'DELETE',
    }),

  // Requirements
  getRequirements: (o: { scope?: 'boot'; q?: string; city?: string; propertyType?: string; mine?: boolean; limit?: number; offset?: number } = {}) => {
    const p = new URLSearchParams();
    if (o.scope) p.set('scope', o.scope); if (o.q) p.set('q', o.q); if (o.city) p.set('city', o.city); if (o.propertyType) p.set('propertyType', o.propertyType);
    if (o.mine) p.set('mine', '1'); if (o.limit) p.set('limit', String(o.limit)); if (o.offset) p.set('offset', String(o.offset));
    return request<{ success: boolean; requirements: BuyerRequirement[]; total?: number; scoped?: boolean; hasMore?: boolean }>(`/api/requirements?${p}`);
  },
  createRequirement: (payload: any) =>
    request<{ success: boolean; requirement: BuyerRequirement }>('/api/requirements', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Matching Engine
  getMatchesForRequirement: (reqId: string) =>
    request<{ success: boolean; requirement: BuyerRequirement; matches: any[] }>(`/api/matching/requirement/${reqId}`),
  getMatchesForProperty: (propId: string) =>
    request<{ success: boolean; property: Property; matches: any[] }>(`/api/matching/property/${propId}`),
  getMatchingMatrix: () =>
    request<{ success: boolean; count: number; matches: any[] }>('/api/matching/matrix'),

  // Collaborations
  getOffers: () => request<{ success: boolean; offers: CollaborationOffer[] }>('/api/collaborations'),
  createOffer: (payload: any) =>
    request<{ success: boolean; offer: CollaborationOffer }>('/api/collaborations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  respondOffer: (id: string, payload: { decision: string; counterIntroducingShare?: number; counterClosingShare?: number; notes?: string }) =>
    request<{ success: boolean; offer: CollaborationOffer; dealRoom?: DealRoom }>(`/api/collaborations/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Deal Rooms
  getDeals: () => request<{ success: boolean; deals: DealRoom[] }>('/api/deals'),
  getDeal: (id: string) =>
    request<{
      success: boolean;
      deal: DealRoom;
      property: Property;
      requirement: BuyerRequirement;
      siteVisits: SiteVisit[];
      dispute?: Dispute;
      participants: any;
      /** v21: what the viewer may read inside the room; `adminCanSee` = a dispute is open, so GENZ may read it right now */
      access?: { level: 'FULL' | 'SUMMARY'; via: string; adminCanSee: boolean; openDisputeId?: string };
    }>(`/api/deals/${id}`),
  updateDealStage: (id: string, stage: string, notes?: string) =>
    request<{ success: boolean; deal: DealRoom }>(`/api/deals/${id}/stage`, {
      method: 'POST',
      body: JSON.stringify({ stage, notes }),
    }),
  updateDealCommission: (id: string, introducingBrokerSharePct: number, closingBrokerSharePct: number, totalCommissionExpected?: number) =>
    request<{ success: boolean; deal: DealRoom }>(`/api/deals/${id}/commission`, {
      method: 'POST',
      body: JSON.stringify({ introducingBrokerSharePct, closingBrokerSharePct, totalCommissionExpected }),
    }),

  // Site Visits
  scheduleSiteVisit: (payload: {
    dealRoomId?: string;
    propertyId: string;
    customerName: string;
    customerPhone?: string;
    scheduledTime: string;
    notes?: string;
    scanAt?: string;
  }) =>
    request<{ success: boolean; siteVisit: SiteVisit; dealRoom?: DealRoom }>('/api/site-visits', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getSiteVisits: (params?: { dealRoomId?: string; propertyId?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ success: boolean; siteVisits: SiteVisit[] }>(`/api/site-visits${q ? `?${q}` : ''}`);
  },
  verifySiteVisitOtp: (id: string, otpCode: string, feedbackNotes?: string) =>
    request<{ success: boolean; siteVisit: SiteVisit; dealRoom?: DealRoom }>(`/api/site-visits/${id}/verify-otp`, {
      method: 'POST',
      body: JSON.stringify({ otpCode, feedbackNotes }),
    }),
  checkinSiteVisitQr: (id: string, qrToken?: string, feedbackNotes?: string, latitude?: number, longitude?: number) =>
    request<{ success: boolean; siteVisit: SiteVisit; dealRoom?: DealRoom }>(`/api/site-visits/${id}/checkin-qr`, {
      method: 'POST',
      body: JSON.stringify({ qrToken, feedbackNotes, latitude, longitude }),
    }),

  // Owner ⇄ listing-broker net-amount mandates
  getOwnerMandates: (propertyId?: string) =>
    request<{ success: boolean; mandates: OwnerMandate[] }>(`/api/owner-mandates${propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : ''}`),
  createOwnerMandate: (payload: { propertyId: string; remunerationBasis: 'SURPLUS_ABOVE_NET' | 'PERCENTAGE' | 'FIXED_FEE'; approvedNetPrice?: number; commissionPct?: number; fixedFeeAmount?: number; advertisedPrice?: number; protectionPeriodDays?: number; password: string }) =>
    request<{ success: boolean; mandate: OwnerMandate }>('/api/owner-mandates', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  acceptOwnerMandate: (id: string, password: string) =>
    request<{ success: boolean; mandate: OwnerMandate; property: Property }>(`/api/owner-mandates/${id}/accept`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  rejectOwnerMandate: (id: string, note: string) =>
    request<{ success: boolean; mandate: OwnerMandate }>(`/api/owner-mandates/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  withdrawOwnerMandate: (id: string) =>
    request<{ success: boolean; mandate: OwnerMandate }>(`/api/owner-mandates/${id}/withdraw`, { method: 'POST' }),
  appointListingBroker: (propertyId: string, brokerId: string) =>
    request<{ success: boolean; property: Property }>(`/api/properties/${propertyId}/appoint-broker`, {
      method: 'POST',
      body: JSON.stringify({ brokerId }),
    }),
  lookupPincode: (pin: string) =>
    request<{ success: boolean; found: boolean; unavailable?: boolean; state?: string; district?: string; city?: string; localities?: string[] }>(`/api/geo/pincode/${encodeURIComponent(pin)}`),

  // Construction Leads
  getConstructionLeads: () =>
    request<{ success: boolean; leads: ConstructionLead[] }>('/api/construction-leads'),
  createConstructionLead: (payload: any) =>
    request<{ success: boolean; lead: ConstructionLead }>('/api/construction-leads', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  requestLeadAccess: (id: string, termsAccepted: boolean) =>
    request<{ success: boolean; request: any; lead: ConstructionLead }>(`/api/construction-leads/${id}/request-access`, {
      method: 'POST',
      body: JSON.stringify({ termsAccepted }),
    }),
  /** Send only the half you own: the contractor declares `finalContractValue`, the referring broker confirms `paid` (the server refuses the other half). */
  settleConstructionReferral: (id: string, body: { finalContractValue?: number; paid?: boolean }) =>
    request<{ success: boolean; lead: ConstructionLead }>(`/api/construction-leads/${id}/settle-referral`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Disputes
  getDisputes: () => request<{ success: boolean; disputes: Dispute[] }>('/api/disputes'),
  createDispute: (payload: any) =>
    request<{ success: boolean; dispute: Dispute }>('/api/disputes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  resolveDispute: (id: string, payload: any) =>
    request<{ success: boolean; dispute: Dispute }>(`/api/disputes/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Audit Logs & Activity Feed
  getAuditLogs: (o: { before?: number | null; q?: string; entity?: string; full?: boolean; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (o.before) p.set('before', String(o.before)); if (o.q) p.set('q', o.q); if (o.entity) p.set('entity', o.entity);
    if (o.full) p.set('full', '1'); p.set('limit', String(o.limit || 100));
    return request<{ success: boolean; events: AuditEvent[]; total: number; hasMore: boolean; nextBefore: number | null; integrity: { isValid: boolean; checkedCount: number; brokenEventId?: number; fullCheckedAt?: string } }>(`/api/audit-logs?${p}`);
  },
  getActivityFeed: () =>
    request<{ success: boolean; activities: PlatformActivityEvent[] }>('/api/activity-feed'),

  // Admin Metrics
  getAdminMetrics: () =>
    request<{ success: boolean; metrics: any; settings: any }>('/api/admin/metrics'),

  // Builder Projects & Sales Associates
  getBuilderProjects: () =>
    request<{ success: boolean; projects: BuilderProject[] }>('/api/builder/projects'),
  createBuilderProject: (payload: any) =>
    request<{ success: boolean; project: BuilderProject }>('/api/builder/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getBuilderAssociates: () =>
    request<{ success: boolean; brokers: UserProfile[]; mandates: SalesAssociateMandate[]; projects: BuilderProject[] }>('/api/builder/associates'),
  appointSalesAssociate: (payload: { projectId: string; brokerId: string; agreedCommissionPct: number; targetUnitsQuota?: number }) =>
    request<{ success: boolean; mandate: SalesAssociateMandate; project: BuilderProject }>('/api/builder/associates/mandate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  recordAssociateSale: (payload: { mandateId: string; unitDetails: string; saleValue: number; customerName?: string }) =>
    request<{ success: boolean; mandate: SalesAssociateMandate; project: BuilderProject; commissionEarned: number }>('/api/builder/associates/record-sale', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Deal Tasks & Responsibility Matrix (Module A1)
  getDealTasks: (dealId: string) =>
    request<{ success: boolean; tasks: DealTask[] }>(`/api/deals/${dealId}/tasks`),
  acceptDealTask: (dealId: string, taskId: string, acceptance: 'ACCEPTED' | 'REJECTED') =>
    request<{ success: boolean; task: DealTask }>(`/api/deals/${dealId}/tasks/${taskId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ acceptance }),
    }),
  dealAssignees: (dealId: string) =>
    request<{ success: boolean; assignees: { id: string; name: string; role: string; group: 'PARTICIPANT' | 'TEAM' | 'LEGAL' | 'DESK'; title?: string; employerName?: string }[] }>(`/api/deals/${dealId}/assignees`),
  assignDealTask: (dealId: string, taskId: string, payload: { assignedParticipantId: string; assignedParticipantName: string; assignedParticipantRole?: string; reason?: string }) =>
    request<{ success: boolean; task: DealTask }>(`/api/deals/${dealId}/tasks/${taskId}/assign`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  completeDealTask: (dealId: string, taskId: string, payload: { completionNote?: string; evidenceAttachments?: any[] }) =>
    request<{ success: boolean; task: DealTask }>(`/api/deals/${dealId}/tasks/${taskId}/complete`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  verifyDealTask: (dealId: string, taskId: string, payload: { verificationStatus: 'VERIFIED' | 'REJECTED'; verificationNotes?: string }) =>
    request<{ success: boolean; task: DealTask }>(`/api/deals/${dealId}/tasks/${taskId}/verify`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  setDealTaskApplicability: (dealId: string, taskId: string, isApplicable: boolean, reason?: string) =>
    request<{ success: boolean; task: DealTask }>(`/api/deals/${dealId}/tasks/${taskId}/applicability`, {
      method: 'POST',
      body: JSON.stringify({ isApplicable, reason }),
    }),

  // Versioned Commission Agreements (Module A2 & A3)
  getDealCommissionAgreements: (dealId: string) =>
    request<{ success: boolean; agreements: DealCommissionAgreement[] }>(`/api/deals/${dealId}/commission-agreements`),
  proposeCommissionAgreement: (dealId: string, payload: any) =>
    request<{ success: boolean; agreement: DealCommissionAgreement }>(`/api/deals/${dealId}/commission-agreements/propose`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  approveCommissionAgreement: (dealId: string, agreementId: string, payload: { authMethod?: string; signerNotes?: string }) =>
    request<{ success: boolean; agreement: DealCommissionAgreement }>(`/api/deals/${dealId}/commission-agreements/${agreementId}/approve`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  /** v21: a deal broker writes down a payment (PENDING until the other broker confirms) or marks a share as disputed */
  settleCommissionPayment: (dealId: string, agreementId: string, payload: { participantId: string; paidDelta?: number; ref?: string; paidOn?: string; note?: string; isDisputed?: boolean; disputeNotes?: string }) =>
    request<{ success: boolean; agreement: DealCommissionAgreement }>(`/api/deals/${dealId}/commission-agreements/${agreementId}/settle-payment`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  confirmCommissionPayment: (dealId: string, agreementId: string, paymentId: string) =>
    request<{ success: boolean; agreement: DealCommissionAgreement }>(`/api/deals/${dealId}/commission-agreements/${agreementId}/payments/${paymentId}/confirm`, { method: 'POST', body: '{}' }),
  rejectCommissionPayment: (dealId: string, agreementId: string, paymentId: string, note: string) =>
    request<{ success: boolean; agreement: DealCommissionAgreement }>(`/api/deals/${dealId}/commission-agreements/${agreementId}/payments/${paymentId}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),

  // Due Diligence Checklist (Module B1 - B4)
  getDueDiligence: (propertyId: string) =>
    request<{ success: boolean; items: DueDiligenceChecklistItem[]; issues: DueDiligenceIssue[]; property: Property }>(`/api/due-diligence/property/${propertyId}`),
  uploadDueDiligenceEvidence: (itemId: string, payload: {
    fileName: string;
    fileUrl?: string;
    documentType?: string;
    documentNumber?: string;
    issuer?: string;
    issueDate?: string;
    fileSizeBytes?: number;
    contentSha256?: string;
    mimeType?: string;
    isConfidential?: boolean;
    accessScope?: 'ALL_VERIFIED_BROKERS' | 'DEAL_PARTICIPANTS_ONLY' | 'OWNER_AND_ADMIN_ONLY' | 'CUSTOM_BROKERS';
    sharedBrokerIds?: string[];
    notes?: string;
    /** id of a paper uploaded to the Property Papers library — the stored file is linked as the evidence */
    libraryDocId?: string;
  }) =>
    request<{ success: boolean; item: DueDiligenceChecklistItem; evidence: any }>(`/api/due-diligence/items/${itemId}/evidence`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  advanceDueDiligenceGate: (itemId: string, payload: { stage: string; verificationMethod?: string; notes?: string }) =>
    request<{ success: boolean; item: DueDiligenceChecklistItem }>(`/api/due-diligence/items/${itemId}/gate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  setDueDiligenceStatus: (itemId: string, payload: { status: string; mismatchSeverity?: string; reason?: string }) =>
    request<{ success: boolean; item: DueDiligenceChecklistItem }>(`/api/due-diligence/items/${itemId}/status`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  setDueDiligenceApplicability: (itemId: string, isApplicable: boolean, reason?: string) =>
    request<{ success: boolean; item: DueDiligenceChecklistItem }>(`/api/due-diligence/items/${itemId}/applicability`, {
      method: 'POST',
      body: JSON.stringify({ isApplicable, reason }),
    }),
  addDueDiligenceComment: (itemId: string, text: string) =>
    request<{ success: boolean; item: DueDiligenceChecklistItem }>(`/api/due-diligence/items/${itemId}/comment`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  // Issue Register (Module B5)
  getDueDiligenceIssues: (filters?: { propertyId?: string; dealId?: string }) => {
    const params = new URLSearchParams();
    if (filters?.propertyId) params.append('propertyId', filters.propertyId);
    if (filters?.dealId) params.append('dealId', filters.dealId);
    return request<{ success: boolean; issues: DueDiligenceIssue[] }>(`/api/due-diligence/issues?${params.toString()}`);
  },
  createDueDiligenceIssue: (payload: any) =>
    request<{ success: boolean; issue: DueDiligenceIssue }>('/api/due-diligence/issues', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  respondDueDiligenceIssue: (issueId: string, payload: { responseNotes: string; resolutionEvidence?: string[] }) =>
    request<{ success: boolean; issue: DueDiligenceIssue }>(`/api/due-diligence/issues/${issueId}/respond`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  decideDueDiligenceIssue: (issueId: string, payload: { decision: string; notes?: string }) =>
    request<{ success: boolean; issue: DueDiligenceIssue }>(`/api/due-diligence/issues/${issueId}/decide`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Transaction Readiness Report (Module B6)
  getReadinessReport: (dealId: string) =>
    request<{ success: boolean; report: TransactionReadinessReport }>(`/api/deals/${dealId}/readiness-report`),
  generateReadinessReport: (dealId: string) =>
    request<{ success: boolean; report: TransactionReadinessReport }>(`/api/deals/${dealId}/readiness-report/generate`, {
      method: 'POST',
    }),

  // Property Media Vault & Selective Sharing
  getVaultAssets: (propertyId: string) =>
    request<{ success: boolean; assets: PropertyMediaAsset[]; isOwnerOrListingBroker: boolean; activeGrantsCount: number }>(
      `/api/properties/${propertyId}/vault/assets`
    ),
  uploadVaultAsset: (propertyId: string, payload: any) =>
    request<{ success: boolean; asset: PropertyMediaAsset }>(`/api/properties/${propertyId}/vault/assets`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getVaultGrants: (propertyId: string) =>
    request<{ success: boolean; grants: MediaShareGrant[] }>(`/api/properties/${propertyId}/vault/grants`),
  createVaultGrant: (propertyId: string, payload: any) =>
    request<{ success: boolean; grant: MediaShareGrant }>(`/api/properties/${propertyId}/vault/grants`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  revokeVaultGrant: (propertyId: string, grantId: string, reason: string) =>
    request<{ success: boolean; grant: MediaShareGrant }>(`/api/properties/${propertyId}/vault/grants/${grantId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  updatePropertyLocation: (propertyId: string, payload: any) =>
    request<{ success: boolean; property: Property }>(`/api/properties/${propertyId}/location`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Deal Room Chat & Communication
  getDealMessages: (dealId: string) =>
    request<{ success: boolean; messages: DealMessage[] }>(`/api/deals/${dealId}/messages`),
  sendDealMessage: (dealId: string, payload: { text: string; mediaUrl?: string; mediaType?: string; audience?: 'ALL' | 'BROKERS' }) =>
    request<{ success: boolean; message: DealMessage }>(`/api/deals/${dealId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // GENZ Connector programme
  connectorMeta: () => request<any>('/api/connector/meta'),
  connectorOverview: () => request<any>('/api/connector/overview'),
  connectorReferrals: (q?: { status?: string; q?: string; queue?: string }) => {
    const p = new URLSearchParams();
    if (q?.status) p.append('status', q.status);
    if (q?.queue) p.append('queue', q.queue);
    if (q?.q) p.append('q', q.q);
    return request<{ success: boolean; referrals: any[] }>(`/api/connector/referrals${p.toString() ? `?${p}` : ''}`);
  },
  connectorRefer: (payload: any) => request<{ success: boolean; referral: any }>('/api/connector/referrals', { method: 'POST', body: JSON.stringify(payload) }),
  growthMe: () => request<any>('/api/growth/me'),
  growthNominate: (b: any) => request<any>('/api/growth/nominations', { method: 'POST', body: JSON.stringify(b) }),
  growthCard: (b: any) => request<any>('/api/growth/card', { method: 'PUT', body: JSON.stringify(b) }),
  growthQueue: (status?: string) => request<any>(`/api/growth/queue${status ? `?status=${status}` : ''}`),
  growthApprove: (id: string) => request<any>(`/api/growth/queue/${id}/approve`, { method: 'POST', body: '{}' }),
  growthReject: (id: string, reason?: string) => request<any>(`/api/growth/queue/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  growthResetIssue: (id: string) => request<any>(`/api/growth/resets/${id}/issue`, { method: 'POST', body: '{}' }),
  growthResetDismiss: (id: string) => request<any>(`/api/growth/resets/${id}/dismiss`, { method: 'POST', body: '{}' }),
  growthCities: () => request<any>('/api/growth/cities'),
  growthWaitlist: (b: any) => request<{ success: boolean; message: string }>('/api/growth/public/waitlist', { method: 'POST', body: JSON.stringify(b) }),
  growthForgot: (phone: string) => request<{ success: boolean; message: string }>('/api/growth/public/forgot', { method: 'POST', body: JSON.stringify({ phone }) }),
  connectorAttachContact: (id: string, customerPhone: string) => request<any>(`/api/connector/referrals/${id}/attach-contact`, { method: 'POST', body: JSON.stringify({ customerPhone }) }),
  connectorAssign: (id: string, assigneeId: string) => request<any>(`/api/connector/referrals/${id}/assign`, { method: 'POST', body: JSON.stringify({ assigneeId }) }),
  connectorSetStatus: (id: string, status: string, note?: string) => request<any>(`/api/connector/referrals/${id}/status`, { method: 'POST', body: JSON.stringify({ status, note }) }),
  connectorApproveReward: (id: string, amount?: number) => request<any>(`/api/connector/referrals/${id}/reward`, { method: 'POST', body: JSON.stringify(amount === undefined ? {} : { amount }) }),
  homeInsights: () => request<{ success: boolean; insights: any }>('/api/home/insights'),
  crList: () => request<any>('/api/client-rooms'),
  crCreate: (payload: any) => request<any>('/api/client-rooms', { method: 'POST', body: JSON.stringify(payload) }),
  crGet: (id: string) => request<any>(`/api/client-rooms/${id}`),
  crAddItem: (id: string, propertyId: string, note?: string) => request<any>(`/api/client-rooms/${id}/items`, { method: 'POST', body: JSON.stringify({ propertyId, note }) }),
  crDelItem: (id: string, itemId: string) => request<any>(`/api/client-rooms/${id}/items/${itemId}`, { method: 'DELETE' }),
  crSend: (id: string, text: string, propertyId?: string) => request<any>(`/api/client-rooms/${id}/messages`, { method: 'POST', body: JSON.stringify({ text, propertyId }) }),
  crRead: (id: string) => request<any>(`/api/client-rooms/${id}/read`, { method: 'POST' }),
  crVisitHandled: (id: string, itemId: string, vid: string) => request<any>(`/api/client-rooms/${id}/visit/${itemId}/${vid}/handled`, { method: 'POST' }),
  crLink: (id: string) => request<any>(`/api/client-rooms/${id}/link`, { method: 'POST' }),
  crClose: (id: string) => request<any>(`/api/client-rooms/${id}/close`, { method: 'POST' }),
  connectorShareSet: (id: string, pct: number, note?: string) => request<any>(`/api/connector/referrals/${id}/share`, { method: 'POST', body: JSON.stringify({ pct, note }) }),
  connectorShareRespond: (id: string, action: 'ACCEPT' | 'DECLINE', note?: string) => request<any>(`/api/connector/referrals/${id}/share/respond`, { method: 'POST', body: JSON.stringify({ action, note }) }),
  connectorShareDeal: (id: string, commission: number) => request<any>(`/api/connector/referrals/${id}/share/deal`, { method: 'POST', body: JSON.stringify({ commission }) }),
  connectorShareSettle: (id: string, action: 'PAID' | 'CONFIRM' | 'NOT_RECEIVED', note?: string) => request<any>(`/api/connector/referrals/${id}/share/settle`, { method: 'POST', body: JSON.stringify({ action, note }) }),
  connectorPay: (id: string, reference: string) => request<any>(`/api/connector/referrals/${id}/pay`, { method: 'POST', body: JSON.stringify({ reference }) }),
  connectorSaveProfile: (payload: any) => request<any>('/api/connector/profile', { method: 'PUT', body: JSON.stringify(payload) }),
  connectorPartners: () => request<{ success: boolean; partners: any[] }>('/api/connector/partners'),
  connectorMyPartners: () => request<{ success: boolean; partners: any[]; invites: any[] }>('/api/connector/my-partners'),
  connectorInvitePartner: (phone: string) => request<{ success: boolean; invitation: { id: string; code: string; invitedPhone: string; expiresAt: string } }>('/api/connector/my-partners/invite', { method: 'POST', body: JSON.stringify({ phone }) }),
  invProjects: () => request<{ success: boolean; projects: any[] }>('/api/inventory/projects'),
  invProject: (id: string) => request<any>(`/api/inventory/projects/${id}`),
  invGenerate: (id: string, payload: any) => request<{ success: boolean; added: number }>(`/api/inventory/projects/${id}/units/generate`, { method: 'POST', body: JSON.stringify(payload) }),
  invUnit: (uid: string, payload: any) => request<{ success: boolean }>(`/api/inventory/units/${uid}`, { method: 'PUT', body: JSON.stringify(payload) }),
  invSettings: (id: string, payload: any) => request<{ success: boolean }>(`/api/inventory/projects/${id}/settings`, { method: 'PUT', body: JSON.stringify(payload) }),
  invHold: (uid: string, payload: { leadId: string; tokenAmount: number; tokenRef: string }) => request<{ success: boolean }>(`/api/inventory/units/${uid}/hold`, { method: 'POST', body: JSON.stringify(payload) }),
  invRelease: (uid: string) => request<{ success: boolean }>(`/api/inventory/units/${uid}/release`, { method: 'POST', body: '{}' }),
  invBulk: (id: string, payload: any) => request<any>(`/api/inventory/projects/${id}/units/bulk`, { method: 'POST', body: JSON.stringify(payload) }),
  invVisibility: (id: string, payload: any) => request<{ success: boolean; vis: any; cleared: number }>(`/api/inventory/projects/${id}/visibility`, { method: 'PUT', body: JSON.stringify(payload) }),
  invPartners: (id: string) => request<{ success: boolean; partners: { brokerId: string; name: string; company: string; status: string }[] }>(`/api/inventory/projects/${id}/partners`),
  invImport: (id: string, rows: any[]) => request<{ success: boolean; created: number; updated: number }>(`/api/inventory/projects/${id}/units/import`, { method: 'POST', body: JSON.stringify({ rows }) }),
  invPosts: (projectId?: string) => request<{ success: boolean; posts: any[] }>(`/api/invdesk/posts${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
  invPostCreate: (payload: any) => request<{ success: boolean; post: any; priceCapped: boolean }>('/api/invdesk/posts', { method: 'POST', body: JSON.stringify(payload) }),
  invPostEnd: (id: string) => request<{ success: boolean }>(`/api/invdesk/posts/${id}/end`, { method: 'POST', body: '{}' }),
  invShares: () => request<{ success: boolean; links: any[] }>('/api/invdesk/shares'),
  invShareCreate: (payload: any) => request<{ success: boolean; token: string; path: string; showPrice: boolean; showFeatures: boolean; capped: boolean }>('/api/invdesk/shares', { method: 'POST', body: JSON.stringify(payload) }),
  invShareRevoke: (token: string) => request<{ success: boolean }>(`/api/invdesk/shares/${token}/revoke`, { method: 'POST', body: '{}' }),
  launchAdminProjects: () => request<{ success: boolean; projects: any[] }>('/api/launch/admin/projects'),
  launchAdminSegments: () => request<{ success: boolean; counts: Record<string, number>; members: any[] }>('/api/launch/admin/segments'),
  launchSetSegment: (id: string, segment: 'BIG_FIRM' | 'INDEPENDENT' | null) => request<{ success: boolean }>(`/api/launch/admin/partners/${id}/segment`, { method: 'PUT', body: JSON.stringify({ segment }) }),
  launchRequest: (id: string, note: string) => request<{ success: boolean }>(`/api/launch/admin/projects/${id}/request`, { method: 'POST', body: JSON.stringify({ note }) }),
  launchPlan: (id: string, payload: any) => request<{ success: boolean; plan: any }>(`/api/launch/admin/projects/${id}/plan`, { method: 'PUT', body: JSON.stringify(payload) }),
  launchStatus: (id: string, status: string, note = '') => request<{ success: boolean; plan: any }>(`/api/launch/admin/projects/${id}/status`, { method: 'POST', body: JSON.stringify({ status, note }) }),
  launchBuilderProjects: () => request<{ success: boolean; projects: any[] }>('/api/launch/builder/projects'),
  launchConsent: (id: string, decision: 'GRANT' | 'DECLINE' | 'WITHDRAW', note = '') => request<{ success: boolean; consent: string; status: string }>(`/api/launch/builder/projects/${id}/consent`, { method: 'POST', body: JSON.stringify({ decision, note }) }),
  launchFeed: () => request<{ success: boolean; segment: string | null; items: any[] }>('/api/launch/feed'),
  invLeaderboard: (id: string) => request<{ success: boolean; rows: any[]; slabs: any[] }>(`/api/inventory/projects/${id}/leaderboard`),
  teamCheckin: (payload: any) => request<{ success: boolean; checkin: any }>('/api/team/checkin', { method: 'POST', body: JSON.stringify(payload) }),
  teamActivity: (days = 7) => request<{ success: boolean; days: number; rows: any[] }>(`/api/team/activity?days=${days}`),
  teamCheckins: (memberId?: string) => request<{ success: boolean; checkins: any[] }>(`/api/team/checkins${memberId ? `?memberId=${memberId}` : ''}`),
  teamSelfie: (id: string) => request<{ success: boolean; selfie: string }>(`/api/team/checkins/${id}/selfie`),
  teamIncentives: () => request<{ success: boolean; rows: any[]; note: string }>('/api/team/incentives'),
  shareBrand: () => request<{ success: boolean; brand: any }>('/api/share/brand'),
  shareSaveBrand: (payload: any) => request<{ success: boolean; brand: any }>('/api/share/brand', { method: 'PUT', body: JSON.stringify(payload) }),
  shareSources: () => request<{ success: boolean; sources: any[] }>('/api/share/sources'),
  shareLinks: () => request<{ success: boolean; links: any[] }>('/api/share/links'),
  shareCreate: (payload: any) => request<{ success: boolean; token: string; path: string }>('/api/share/links', { method: 'POST', body: JSON.stringify(payload) }),
  shareRevoke: (token: string) => request<{ success: boolean }>(`/api/share/links/${token}/revoke`, { method: 'POST', body: '{}' }),
  lrList: () => request<{ success: boolean; records: any[] }>('/api/land-records'),
  lrProperties: () => request<{ success: boolean; properties: any[] }>('/api/land-records/properties'),
  lrSave: (id: string | null, payload: any) => request<{ success: boolean; record: any }>(id ? `/api/land-records/${id}` : '/api/land-records', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) }),
  lrDelete: (id: string) => request<{ success: boolean }>(`/api/land-records/${id}`, { method: 'DELETE' }),
  teamList: () => request<{ success: boolean; members: any[]; max: number }>('/api/team'),
  teamAdd: (payload: { name: string; phone: string; title?: string; role?: string; consentAttested: boolean }) => request<{ success: boolean; member: any; loginId: string; temporaryPassword: string }>('/api/team', { method: 'POST', body: JSON.stringify(payload) }),
  teamUpdate: (id: string, payload: { active?: boolean; teamTitle?: string; teamRole?: string; incentivePct?: number }) => request<{ success: boolean }>(`/api/team/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  teamReset: (id: string) => request<{ success: boolean; loginId: string; temporaryPassword: string }>(`/api/team/${id}/reset-password`, { method: 'POST', body: '{}' }),
  teamAllotLead: (leadId: string, memberId: string | null) => request<{ success: boolean }>('/api/team/allot/lead', { method: 'POST', body: JSON.stringify({ leadId, memberId }) }),
  teamAllotDeal: (dealId: string, memberIds: string[]) => request<{ success: boolean; teamMemberIds: string[] }>('/api/team/allot/deal', { method: 'POST', body: JSON.stringify({ dealId, memberIds }) }),
  connectorSettings: () => request<{ success: boolean; enabled: boolean; rewards: Record<string, number>; maxSharePct?: number }>('/api/connector/settings'),
  connectorSaveSettings: (payload: { enabled?: boolean; rewards?: Record<string, number>; maxSharePct?: number }) => request<any>('/api/connector/settings', { method: 'PUT', body: JSON.stringify(payload) }),

  // Superadmin control center
  controlCenter: () => request<any>('/api/admin/control-center'),
  /** v17 Network Pulse (superadmin): counts + the list behind a tile */
  pulse: () => request<any>('/api/admin/pulse'),
  pulseDrill: (q: Record<string, string>) => request<any>(`/api/admin/pulse/drill?${new URLSearchParams(q).toString()}`),
  savePlatformSettings: (payload: any) => request<any>('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  permissionMatrix: () => request<{ success: boolean; roles: string[]; matrix: { permission: string; description: string; roles: string[] }[] }>('/api/auth/permission-matrix'),

  // Builder ⇄ Associates CRM
  crmOverview: () => request<{ success: boolean; overview: any }>('/api/crm/overview'),
  crmProjects: () => request<{ success: boolean; projects: any[]; mandates: any[] }>('/api/crm/projects'),
  crmLeads: (f: Record<string, string | number | undefined> = {}) => {
    const qs = Object.entries(f).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
    return request<{ success: boolean; leads: CrmLead[]; total: number; offset: number; limit: number }>(`/api/crm/leads${qs ? `?${qs}` : ''}`);
  },
  crmLead: (id: string) => request<{ success: boolean; lead: CrmLead; booking?: CrmBooking }>(`/api/crm/leads/${id}`),
  crmCreateLead: (payload: any) => request<{ success: boolean; lead: CrmLead }>('/api/crm/leads', { method: 'POST', body: JSON.stringify(payload) }),
  crmSetStage: (id: string, payload: { stage: string; note?: string; lostReason?: string; lostCode?: string }) =>
    request<{ success: boolean; lead: CrmLead }>(`/api/crm/leads/${id}/stage`, { method: 'POST', body: JSON.stringify(payload) }),
  crmAddActivity: (id: string, payload: { type: string; note: string }) =>
    request<{ success: boolean; lead: CrmLead }>(`/api/crm/leads/${id}/activity`, { method: 'POST', body: JSON.stringify(payload) }),
  crmAddFollowUp: (id: string, payload: { dueAt: string; note: string; channel: string }) =>
    request<{ success: boolean; lead: CrmLead }>(`/api/crm/leads/${id}/followups`, { method: 'POST', body: JSON.stringify(payload) }),
  crmFollowUpDone: (id: string, fid: string) =>
    request<{ success: boolean; lead: CrmLead }>(`/api/crm/leads/${id}/followups/${fid}/done`, { method: 'POST', body: '{}' }),
  crmAssign: (id: string, associateId: string, reason: string) =>
    request<{ success: boolean; lead: CrmLead }>(`/api/crm/leads/${id}/assign`, { method: 'POST', body: JSON.stringify({ associateId, reason }) }),
  crmBonus: () => request<{ success: boolean; projects: any[]; canManage: boolean }>('/api/crm/bonus'),
  crmSaveBonusScheme: (projectId: string, scheme: any) =>
    request<{ success: boolean; scheme: any }>(`/api/crm/projects/${projectId}/bonus-scheme`, { method: 'PUT', body: JSON.stringify(scheme) }),
  crmPayBonus: (projectId: string, payload: { mandateId: string; amount: number; reference: string }) =>
    request<{ success: boolean; tds: number; net: number }>(`/api/crm/projects/${projectId}/bonus/pay`, { method: 'POST', body: JSON.stringify(payload) }),
  crmBookings: () => request<{ success: boolean; bookings: CrmBooking[] }>('/api/crm/bookings'),
  /** v16.9 — Money Trail: collector → partner → builder, with "who holds it" at every step */
  moneyTrails: (bookingId?: string) => request<{ success: boolean; rows: any[]; totals: Record<string, { count: number; amount: number }>; canCollect: boolean; canConfirm: boolean; readOnly: boolean }>(`/api/crm/money/trails${bookingId ? `?bookingId=${encodeURIComponent(bookingId)}` : ''}`),
  moneyCollectables: () => request<{ success: boolean; bookings: any[] }>('/api/crm/money/collectables'),
  moneyStart: (b: any) => request<{ success: boolean; trail: any }>('/api/crm/money/trails', { method: 'POST', body: JSON.stringify(b) }),
  moneyCpConfirm: (id: string, b: { received: boolean; note?: string }) => request<{ success: boolean; trail: any }>(`/api/crm/money/trails/${id}/cp-confirm`, { method: 'POST', body: JSON.stringify(b) }),
  moneyHandover: (id: string, b: { mode?: string; ref?: string; note?: string }) => request<{ success: boolean; trail: any }>(`/api/crm/money/trails/${id}/handover`, { method: 'POST', body: JSON.stringify(b) }),
  moneyBuilderConfirm: (id: string, b: { received: boolean; note?: string; receiptNo?: string }) => request<{ success: boolean; trail: any }>(`/api/crm/money/trails/${id}/builder-confirm`, { method: 'POST', body: JSON.stringify(b) }),
  moneyCancel: (id: string, reason: string) => request<{ success: boolean; trail: any }>(`/api/crm/money/trails/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  crmRequestBooking: (leadId: string, payload: any) =>
    request<{ success: boolean; booking: CrmBooking }>(`/api/crm/leads/${leadId}/booking-request`, { method: 'POST', body: JSON.stringify(payload) }),
  crmDecideBooking: (id: string, decision: 'APPROVE' | 'REJECT', note?: string, extra: { tokenReceived?: boolean } = {}) =>
    request<{ success: boolean; booking: CrmBooking }>(`/api/crm/bookings/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision, note, ...extra }) }),
  /** v16.7 — the builder confirms (or denies) that the booking amount the requester claimed has arrived */
  crmConfirmToken: (id: string, received: boolean, note?: string) =>
    request<{ success: boolean; booking: CrmBooking }>(`/api/crm/bookings/${id}/token`, { method: 'POST', body: JSON.stringify({ received, note }) }),
  /** v16.7 — telecaller call log, call list, forwarding */
  crmCall: (id: string, p: { outcome: string; note?: string; durationMin?: number; when?: string }) =>
    request<{ success: boolean; lead: CrmLead; suggest?: 'LOST' | 'TRY_WHATSAPP' | 'FIX_NUMBER'; attemptsLeft: number }>(`/api/crm/leads/${id}/call`, { method: 'POST', body: JSON.stringify(p) }),
  crmCallQueue: (memberId?: string) =>
    request<{ success: boolean; queue: any[]; total: number; counts: { due: number; fresh: number; today: number } }>(`/api/crm/call-queue${memberId ? `?memberId=${encodeURIComponent(memberId)}` : ''}`),
  crmForwardTargets: (id: string) =>
    request<{ success: boolean; targets: { id: string; name: string; title: string; role: string; openLeads: number; blocked: string }[]; current: { id: string; name?: string } | null; canForwardNow: boolean }>(`/api/crm/leads/${id}/forward-targets`),
  crmForward: (id: string, p: { toMemberId: string; purpose: string; note: string }) =>
    request<{ success: boolean; forwardedTo: { id: string; name: string }; handoff: { id: string; at: string; purpose: string } }>(`/api/crm/leads/${id}/forward`, { method: 'POST', body: JSON.stringify(p) }),
  crmReceivePayment: (id: string, mid: string, p: { receiptNo: string; amount?: number; mode?: string }) =>
    request<{ success: boolean; booking: CrmBooking }>(`/api/crm/bookings/${id}/payments/${mid}/receive`, { method: 'POST', body: JSON.stringify(p) }),
  crmPayout: (id: string, p: { amount: number; ref: string; mode?: string; paidOn?: string }) =>
    request<{ success: boolean; booking: CrmBooking; tds: number; net: number }>(`/api/crm/bookings/${id}/payout`, { method: 'POST', body: JSON.stringify(p) }),
  crmCancelBooking: (id: string, p: { reason: string; refundAmount?: number; forfeitAmount?: number; clawbackAmount?: number; settlementNote?: string }) =>
    request<{ success: boolean; booking: CrmBooking }>(`/api/crm/bookings/${id}/cancel`, { method: 'POST', body: JSON.stringify(p) }),
  // ── v16: CRM controls, workflow, reports ──
  crmAlerts: () => request<{ success: boolean; alerts: { kind: string; severity: 'high' | 'med' | 'low'; count: number; en: string; hi: string; ids?: string[] }[] }>('/api/crm/alerts'),
  crmExtendProtection: (id: string) => request<{ success: boolean; lead: CrmLead }>(`/api/crm/leads/${id}/extend-protection`, { method: 'POST', body: '{}' }),
  crmCorrectPhone: (id: string, phone: string, reason: string) => request<{ success: boolean; lead: CrmLead }>(`/api/crm/leads/${id}/correct-phone`, { method: 'POST', body: JSON.stringify({ phone, reason }) }),
  crmOptOut: (id: string, note?: string) => request<{ success: boolean; lead: CrmLead }>(`/api/crm/leads/${id}/optout`, { method: 'POST', body: JSON.stringify({ note }) }),
  crmPatchLead: (id: string, p: { temperature?: string; tags?: string[]; unitInterest?: string; budgetMax?: number; note?: string; source?: string; sourceDetail?: string; profile?: Record<string, unknown> }) => request<{ success: boolean; lead: CrmLead }>(`/api/crm/leads/${id}`, { method: 'PATCH', body: JSON.stringify(p) }),
  crmEditFollowUp: (id: string, fid: string, p: { dueAt?: string; note?: string; channel?: string }) => request<{ success: boolean; lead: CrmLead }>(`/api/crm/leads/${id}/followups/${fid}`, { method: 'PATCH', body: JSON.stringify(p) }),
  crmDeleteFollowUp: (id: string, fid: string) => request<{ success: boolean; lead: CrmLead }>(`/api/crm/leads/${id}/followups/${fid}`, { method: 'DELETE' }),
  crmVisitFeedback: (id: string, p: { rating: number; liked: string[]; objection: string; nextStep: string }) => request<{ success: boolean; lead: CrmLead }>(`/api/crm/leads/${id}/visit-feedback`, { method: 'POST', body: JSON.stringify(p) }),
  crmImport: (p: { projectId: string; csv: string; consent: boolean }) => request<{ success: boolean; imported: number; failed: number; results: { row: number; ok: boolean; id?: string; error?: string; code?: string }[] }>('/api/crm/leads/import', { method: 'POST', body: JSON.stringify(p) }),
  crmBulk: (p: any) => request<{ success: boolean; done: number; results: { id: string; ok: boolean; error?: string }[] }>('/api/crm/leads/bulk', { method: 'POST', body: JSON.stringify(p) }),
  crmExportCsv: async (full: boolean) => {
    const res = await fetch(`/api/crm/leads/export${full ? '?full=1' : ''}`, { credentials: 'same-origin' });
    if (!res.ok) { let m = 'Export failed'; try { m = (await res.json()).error || m; } catch { /* */ } throw new ApiError(m, res.status); }
    return res.blob();
  },
  crmClaimPayment: (id: string, mid: string, note: string) => request<{ success: boolean; booking: CrmBooking }>(`/api/crm/bookings/${id}/payments/${mid}/claim`, { method: 'POST', body: JSON.stringify({ note }) }),
  crmReverseReceipt: (id: string, mid: string, rid: string, reason: string) => request<{ success: boolean; booking: CrmBooking }>(`/api/crm/bookings/${id}/payments/${mid}/receipts/${rid}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) }),
  crmPayoutAck: (id: string, pid: string, action: 'CONFIRM' | 'DISPUTE', note?: string) => request<{ success: boolean; booking: CrmBooking }>(`/api/crm/bookings/${id}/payouts/${pid}/ack`, { method: 'POST', body: JSON.stringify({ action, note }) }),
  crmLedger: (id: string) => request<any>(`/api/crm/bookings/${id}/ledger`),
  crmClawbackSettle: (id: string, note: string) => request<{ success: boolean; booking: CrmBooking }>(`/api/crm/bookings/${id}/clawback/settle`, { method: 'POST', body: JSON.stringify({ note }) }),
  crmCancelRequest: (id: string, reason: string) => request<{ success: boolean; booking: CrmBooking }>(`/api/crm/bookings/${id}/cancel-request`, { method: 'POST', body: JSON.stringify({ reason }) }),
  crmCancelDecide: (id: string, p: { approve: boolean; note?: string; refundAmount?: number; forfeitAmount?: number; clawbackAmount?: number; settlementNote?: string }) => request<{ success: boolean; booking: CrmBooking }>(`/api/crm/bookings/${id}/cancel-request/decide`, { method: 'POST', body: JSON.stringify(p) }),
  crmSetTds: (projectId: string, tdsPct: number) => request<{ success: boolean; tdsPct: number }>(`/api/crm/projects/${projectId}/finance`, { method: 'PUT', body: JSON.stringify({ tdsPct }) }),
  crmReports: (days = 90) => request<any>(`/api/crm/reports?days=${days}`),
  // ── v11: daily-use ──
  dailyDigest: () => request<any>('/api/daily/digest'),
  dailyFeedback: (key: string, action: 'OPENED' | 'SHORTLISTED' | 'DISMISSED') => request<any>('/api/daily/digest/feedback', { method: 'POST', body: JSON.stringify({ key, action }) }),
  dailyPrefs: (b: { muted?: boolean; hour?: number }) => request<any>('/api/daily/digest/prefs', { method: 'PUT', body: JSON.stringify(b) }),
  clients: () => request<any>('/api/daily/clients'),
  clientsDue: () => request<any>('/api/daily/clients/due'),
  clientAdd: (b: any) => request<any>('/api/daily/clients', { method: 'POST', body: JSON.stringify(b) }),
  clientUpdate: (id: string, b: any) => request<any>(`/api/daily/clients/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  clientStage: (id: string, b: any) => request<any>(`/api/daily/clients/${id}/stage`, { method: 'POST', body: JSON.stringify(b) }),
  clientNote: (id: string, b: any) => request<any>(`/api/daily/clients/${id}/note`, { method: 'POST', body: JSON.stringify(b) }),
  clientDelete: (id: string) => request<any>(`/api/daily/clients/${id}`, { method: 'DELETE' }),
  clientParse: (text: string) => request<any>('/api/daily/clients/parse', { method: 'POST', body: JSON.stringify({ text }) }),
  myListings: () => request<any>('/api/daily/listings'),
  confirmListing: (id: string) => request<any>(`/api/daily/listings/${id}/confirm`, { method: 'POST', body: '{}' }),
  trustBreakdown: () => request<any>('/api/daily/trust'),
  report: (b: any) => request<any>('/api/daily/report', { method: 'POST', body: JSON.stringify(b) }),
  reports: () => request<any>('/api/daily/reports'),
  reportResolve: (id: string, action: 'UPHOLD' | 'DISMISS') => request<any>(`/api/daily/reports/${id}/resolve`, { method: 'POST', body: JSON.stringify({ action }) }),
  mapPins: (city?: string) => request<any>(`/api/daily/map${city ? `?city=${encodeURIComponent(city)}` : ''}`),
  rateCard: (city?: string) => request<any>(`/api/daily/rate-card${city ? `?city=${encodeURIComponent(city)}` : ''}`),
  points: () => request<any>('/api/community/points'),
  pointsRedeem: () => request<any>('/api/community/points/redeem', { method: 'POST', body: '{}' }),
  leaderboard: () => request<any>('/api/community/leaderboard'),
  chapters: () => request<any>('/api/community/chapters'),
  chapter: (id: string) => request<any>(`/api/community/chapters/${id}`),
  chapterCreate: (b: any) => request<any>('/api/community/chapters', { method: 'POST', body: JSON.stringify(b) }),
  chapterCaptain: (id: string, captainId: string) => request<any>(`/api/community/chapters/${id}/captain`, { method: 'PUT', body: JSON.stringify({ captainId }) }),
  chapterJoin: (id: string) => request<any>(`/api/community/chapters/${id}/join`, { method: 'POST', body: '{}' }),
  chapterLeave: () => request<any>('/api/community/chapters/leave', { method: 'POST', body: '{}' }),
  chapterPost: (id: string, text: string) => request<any>(`/api/community/chapters/${id}/posts`, { method: 'POST', body: JSON.stringify({ text }) }),
  meetCreate: (id: string, b: any) => request<any>(`/api/community/chapters/${id}/meets`, { method: 'POST', body: JSON.stringify(b) }),
  meetRsvp: (id: string, going: boolean) => request<any>(`/api/community/meets/${id}/rsvp`, { method: 'POST', body: JSON.stringify({ going }) }),
  meetAttendance: (id: string, userIds: string[]) => request<any>(`/api/community/meets/${id}/attendance`, { method: 'POST', body: JSON.stringify({ userIds }) }),
  loans: () => request<any>('/api/community/loans'),
  loanSubmit: (b: any) => request<any>('/api/community/loans', { method: 'POST', body: JSON.stringify(b) }),
  loanStatus: (id: string, b: any) => request<any>(`/api/community/loans/${id}/status`, { method: 'POST', body: JSON.stringify(b) }),
  academy: () => request<any>('/api/community/academy'),
  academyDone: (id: string) => request<any>(`/api/community/academy/${id}/done`, { method: 'POST', body: '{}' }),
  // Property Papers library (real files on the server)
  propDocsMeta: () => request<any>('/api/property-docs/meta'),
  propDocs: (q: { q?: string; propertyId?: string; type?: string; scope?: string }) => {
    const p = new URLSearchParams(); for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
    return request<any>(`/api/property-docs?${p.toString()}`);
  },
  propDocUpload: (b: any) => request<any>('/api/property-docs', { method: 'POST', body: JSON.stringify(b) }),
  propDocEdit: (id: string, b: any) => request<any>(`/api/property-docs/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  propDocPeople: (id: string) => request<any>(`/api/property-docs/${id}/people`),
  propDocShare: (id: string, b: { userIds: string[]; expiresInDays?: number }) => request<any>(`/api/property-docs/${id}/share`, { method: 'POST', body: JSON.stringify(b) }),
  propDocRevoke: (id: string, userId: string) => request<any>(`/api/property-docs/${id}/revoke`, { method: 'POST', body: JSON.stringify({ userId }) }),
  propDocLog: (id: string) => request<any>(`/api/property-docs/${id}/log`),
  propDocDelete: (id: string) => request<any>(`/api/property-docs/${id}`, { method: 'DELETE' }),
  pdocs: () => request<any>('/api/pdocs'),
  pdocPeople: () => request<any>('/api/pdocs/people'),
  pdocUpload: (b: { title: string; propertyId?: string; pages: string[] }) => request<any>('/api/pdocs', { method: 'POST', body: JSON.stringify(b) }),
  pdocShare: (id: string, b: any) => request<any>(`/api/pdocs/${id}/share`, { method: 'POST', body: JSON.stringify(b) }),
  pdocRevoke: (id: string, userId?: string) => request<any>(`/api/pdocs/${id}/revoke`, { method: 'POST', body: JSON.stringify({ userId }) }),
  pdocDelete: (id: string) => request<any>(`/api/pdocs/${id}`, { method: 'DELETE' }),
  pdocLog: (id: string) => request<any>(`/api/pdocs/${id}/log`),
  pdocOpen: (id: string) => request<any>(`/api/pdocs/${id}/open`, { method: 'POST', body: '{}' }),
  growthChallenge: () => request<{ question: string; token: string }>('/api/growth/public/challenge'),

  // ── v12: project control (builder), project-wise partner view, staff lead control ──
  pcProjects: () => request<any>('/api/pcontrol/builder/projects'),
  pcProject: (id: string) => request<any>(`/api/pcontrol/builder/projects/${id}`),
  ofList: () => request<any>('/api/offers'),
  ofMake: (b: any) => request<any>('/api/offers', { method: 'POST', body: JSON.stringify(b) }),
  ofWithdraw: (id: string) => request<any>(`/api/offers/${id}/withdraw`, { method: 'POST', body: '{}' }),
  ofDecide: (id: string, b: any) => request<any>(`/api/offers/${id}/decide`, { method: 'POST', body: JSON.stringify(b) }),
  ofRespond: (id: string, action: 'ACCEPT' | 'DECLINE') => request<any>(`/api/offers/${id}/respond`, { method: 'POST', body: JSON.stringify({ action }) }),
  ofToken: (id: string, b: any) => request<any>(`/api/offers/${id}/token/received`, { method: 'POST', body: JSON.stringify(b) }),
  ofTokenAck: (id: string, what: 'PAID' | 'OUTCOME') => request<any>(`/api/offers/${id}/token/ack`, { method: 'POST', body: JSON.stringify({ what }) }),
  ofTokenExtend: (id: string, days: number) => request<any>(`/api/offers/${id}/token/extend`, { method: 'POST', body: JSON.stringify({ days }) }),
  ofTokenClose: (id: string, b: any) => request<any>(`/api/offers/${id}/token/close`, { method: 'POST', body: JSON.stringify(b) }),
  lsMine: () => request<any>('/api/listings/mine'),
  lsStatus: (id: string, b: any) => request<any>(`/api/listings/${id}/status`, { method: 'POST', body: JSON.stringify(b) }),
  lsUndo: (id: string) => request<any>(`/api/listings/${id}/undo`, { method: 'POST', body: '{}' }),
  lsRelist: (id: string, b: any) => request<any>(`/api/listings/${id}/relist`, { method: 'POST', body: JSON.stringify(b) }),
  lsPoster: (id: string) => request<any>(`/api/listings/${id}/poster`, { method: 'POST', body: '{}' }),
  lsEnquiries: () => request<any>('/api/listings/enquiries'),
  lsEnquiryStatus: (id: string, status: string) => request<any>(`/api/listings/enquiries/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  lsAlerts: () => request<any>('/api/listings/alerts'),
  lsMarket: (city?: string) => request<any>(`/api/listings/market${city ? `?city=${encodeURIComponent(city)}` : ''}`),
  netMe: () => request<any>('/api/network/me'),
  netApps: () => request<any>('/api/network/tier2/applications'),
  netPropose: (b: any) => request<any>('/api/network/tier2/applications', { method: 'POST', body: JSON.stringify(b) }),
  netVouch: (id: string) => request<any>(`/api/network/tier2/applications/${id}/vouch`, { method: 'POST', body: '{}' }),
  netInvite: (id: string) => request<any>(`/api/network/tier2/applications/${id}/invitation`),
  netClose: (id: string, note: string) => request<any>(`/api/network/tier2/applications/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),
  netTree: () => request<any>('/api/network/tree'),
  netCaptain: () => request<any>('/api/network/captain'),
  netAdmin: () => request<any>('/api/network/admin/overview'),
  // v18 — who registered whom, and the PAN / Aadhaar check
  netSponsored: () => request<any>('/api/network/sponsored'),
  netAdminSponsors: () => request<any>('/api/network/admin/sponsors'),
  netMyId: () => request<any>('/api/network/my-id'),
  netMyIdSave: (b: { panNumber?: string; aadhaarNumber: string; consent: boolean; kycConsent?: boolean; address?: string; pincode?: string; kycSource?: 'TYPED' | 'PHOTO' | 'MIXED' }) => request<any>('/api/network/my-id', { method: 'POST', body: JSON.stringify(b) }),
  // v25 — encrypted KYC vault
  kycMine: () => request<any>('/api/kyc-vault/mine'),
  kycDeleteMine: () => request<any>('/api/kyc-vault/mine', { method: 'DELETE' }),
  kycStatus: () => request<any>('/api/kyc-vault/status'),
  kycSetOn: (on: boolean) => request<any>('/api/kyc-vault/settings', { method: 'PUT', body: JSON.stringify({ on }) }),
  kycReveal: (userId: string, b: { purpose: string; reason: string; ref?: string; password: string; code?: string }) => request<any>(`/api/kyc-vault/reveal/${encodeURIComponent(userId)}`, { method: 'POST', body: JSON.stringify(b) }),
  kycReveals: () => request<any>('/api/kyc-vault/reveals'),
  // v26 — bypass protection days, WhatsApp paste + owner consent, push alerts, buyer-need broadcast
  protectionConfig: () => request<any>('/api/protection/config'),
  protectionSettings: (b: { maxDays?: number; defaultDays?: number }) => request<any>('/api/protection/settings', { method: 'PUT', body: JSON.stringify(b) }),
  waPaste: (text: string) => request<any>('/api/consent/paste', { method: 'POST', body: JSON.stringify({ text }) }),
  drafts: () => request<any>('/api/consent/drafts'),
  draftSave: (id: string, fields: Record<string, any>) => request<any>(`/api/consent/drafts/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ fields }) }),
  draftDelete: (id: string) => request<any>(`/api/consent/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  draftCheck: (id: string) => request<any>(`/api/consent/drafts/${encodeURIComponent(id)}/check`, { method: 'POST', body: '{}' }),
  consentRequest: (id: string, protectionDays: number, agreeTerms?: boolean) => request<any>(`/api/consent/drafts/${encodeURIComponent(id)}/request`, { method: 'POST', body: JSON.stringify({ protectionDays, agreeTerms }) }),
  consentPaper: (id: string, protectionDays: number, data: string, agreeTerms?: boolean) => request<any>(`/api/consent/drafts/${encodeURIComponent(id)}/paper`, { method: 'POST', body: JSON.stringify({ protectionDays, data, agreeTerms }) }),
  draftFromForm: (payload: any) => request<any>('/api/consent/drafts/from-form', { method: 'POST', body: JSON.stringify(payload) }),
  draftSavedNeed: (id: string, requirementId: string) => request<any>(`/api/consent/drafts/${encodeURIComponent(id)}/saved-need`, { method: 'POST', body: JSON.stringify({ requirementId }) }),
  // v37 — Deal Hub (pipeline, KPIs, next steps)
  dealHub: () => request<any>('/api/deal-hub'),
  // v36 — Verified Photo
  photoMine: () => request<any>('/api/profile-photo/mine'),
  photoUpload: (data: string, consent: boolean) => request<any>('/api/profile-photo/mine', { method: 'POST', body: JSON.stringify({ data, consent }) }),
  photoAdmin: () => request<any>('/api/profile-photo/admin'),
  photoDecide: (id: string, verdict: 'APPROVE' | 'REJECT', note?: string) => request<any>(`/api/profile-photo/admin/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ verdict, note }) }),
  // v35 — Network Watch
  pwMeta: () => request<any>('/api/party-watch/meta'),
  pwCheck: (phone: string) => request<any>('/api/party-watch/check', { method: 'POST', body: JSON.stringify({ phone }) }),
  pwReport: (b: any) => request<any>('/api/party-watch/report', { method: 'POST', body: JSON.stringify(b) }),
  pwMine: () => request<any>('/api/party-watch/mine'),
  pwAppeal: (phone: string, note: string) => request<any>('/api/party-watch/appeal', { method: 'POST', body: JSON.stringify({ phone, note }) }),
  pwAdmin: (queue?: string) => request<any>(`/api/party-watch/admin${queue ? `?queue=${encodeURIComponent(queue)}` : ''}`),
  pwReview: (id: string, rid: string, verdict: 'UPHOLD' | 'DISMISS', note: string) => request<any>(`/api/party-watch/admin/${encodeURIComponent(id)}/report/${encodeURIComponent(rid)}`, { method: 'POST', body: JSON.stringify({ verdict, note }) }),
  pwDecide: (id: string, action: 'BLOCK' | 'CLEAR', note: string) => request<any>(`/api/party-watch/admin/${encodeURIComponent(id)}/decide`, { method: 'POST', body: JSON.stringify({ action, note }) }),
  pwAnswer: (id: string, aid: string, answer: string) => request<any>(`/api/party-watch/admin/${encodeURIComponent(id)}/appeal/${encodeURIComponent(aid)}`, { method: 'POST', body: JSON.stringify({ answer }) }),
  // v29 — buyer bond (who brought the buyer first)
  bbMine: () => request<any>('/api/buyer-bonds/mine'),
  bbRelease: (id: string) => request<any>(`/api/buyer-bonds/${encodeURIComponent(id)}/release`, { method: 'POST', body: '{}' }),
  bbAsk: (id: string, note: string) => request<any>(`/api/buyer-bonds/${encodeURIComponent(id)}/ask`, { method: 'POST', body: JSON.stringify({ note }) }),
  bbAdmin: (propertyId?: string) => request<any>(`/api/buyer-bonds/admin${propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : ''}`),
  bbVoid: (id: string, note: string) => request<any>(`/api/buyer-bonds/admin/${encodeURIComponent(id)}/void`, { method: 'POST', body: JSON.stringify({ note }) }),
  consentFromProperty: (propertyId: string) => request<any>(`/api/consent/from-property/${encodeURIComponent(propertyId)}`, { method: 'POST', body: '{}' }),
  consentAttach: (draftId: string) => request<any>(`/api/consent/drafts/${encodeURIComponent(draftId)}/attach`, { method: 'POST', body: '{}' }),
  consentSignatureUrl: (consentId: string) => `/api/consent/${encodeURIComponent(consentId)}/signature`,
  consentFormUrl: (id: string, days: number) => `/api/consent/drafts/${encodeURIComponent(id)}/form?days=${days}`,
  consentMine: () => request<any>('/api/consent/mine'),
  consentQueue: () => request<any>('/api/consent/admin/queue'),
  consentPaperUrl: (id: string) => `/api/consent/admin/${encodeURIComponent(id)}/paper`,
  consentDecide: (id: string, approve: boolean, note: string) => request<any>(`/api/consent/admin/${encodeURIComponent(id)}/decide`, { method: 'POST', body: JSON.stringify({ approve, note }) }),
  consentVoid: (id: string, note: string) => request<any>(`/api/consent/admin/${encodeURIComponent(id)}/void`, { method: 'POST', body: JSON.stringify({ note }) }),
  pushKey: () => request<{ success: boolean; publicKey: string | null }>('/api/push/key'),
  pushSubscribe: (b: { endpoint: string; keys: { p256dh: string; auth: string } }) => request<any>('/api/push/subscribe', { method: 'POST', body: JSON.stringify(b) }),
  pushUnsubscribe: (endpoint: string) => request<any>('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
  pushPrefs: () => request<any>('/api/push/prefs'),
  pushPrefsSave: (b: Record<string, boolean>) => request<any>('/api/push/prefs', { method: 'PUT', body: JSON.stringify(b) }),
  pushTest: () => request<any>('/api/push/test', { method: 'POST', body: '{}' }),
  broadcastSend: (requirementId: string) => request<any>('/api/broadcast', { method: 'POST', body: JSON.stringify({ requirementId }) }),
  broadcastInbox: () => request<any>('/api/broadcast/inbox'),
  broadcastRespond: (id: string, b: { propertyId?: string; note?: string }) => request<any>(`/api/broadcast/${encodeURIComponent(id)}/respond`, { method: 'POST', body: JSON.stringify(b) }),
  broadcastMine: () => request<any>('/api/broadcast/mine'),
  broadcastClose: (id: string) => request<any>(`/api/broadcast/${encodeURIComponent(id)}/close`, { method: 'POST', body: '{}' }),
  netIdCheck: (userId: string, checked: boolean, note?: string) => request<any>(`/api/network/id-check/${encodeURIComponent(userId)}`, { method: 'POST', body: JSON.stringify({ checked, note }) }),
  // v19 — ID copies (PAN card / masked Aadhaar) and the ID-review desk
  idMine: () => request<any>('/api/id-review/mine'),
  idMineUpload: (b: { kind: string; fileName: string; data: string }) => request<any>('/api/id-review/mine/docs', { method: 'POST', body: JSON.stringify(b) }),
  idMineDelete: (id: string) => request<any>(`/api/id-review/mine/docs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  idAppDocs: (appId: string) => request<any>(`/api/id-review/applications/${encodeURIComponent(appId)}/docs`),
  idAppUpload: (appId: string, b: { kind: string; fileName: string; data: string }) => request<any>(`/api/id-review/applications/${encodeURIComponent(appId)}/docs`, { method: 'POST', body: JSON.stringify(b) }),
  idAppDelete: (appId: string, id: string) => request<any>(`/api/id-review/applications/${encodeURIComponent(appId)}/docs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  idDocUrl: (id: string) => `/api/id-review/docs/${encodeURIComponent(id)}/file`,
  idSummary: () => request<any>('/api/id-review/summary'),
  // v20 — Revenue & Growth (superadmin) + system health + builder pitch links
  revSummary: () => request<any>('/api/revenue/summary'),
  revProjects: () => request<any>('/api/revenue/projects'),
  revAgreementCreate: (b: any) => request<any>('/api/revenue/agreements', { method: 'POST', body: JSON.stringify(b) }),
  revAgreementUpdate: (id: string, b: any) => request<any>(`/api/revenue/agreements/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(b) }),
  revEntries: (o: { agreementId?: string; view?: string; q?: string } = {}) => request<any>(`/api/revenue/entries?${new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][])}`),
  revEntryCreate: (b: any) => request<any>('/api/revenue/entries', { method: 'POST', body: JSON.stringify(b) }),
  revEntryAct: (id: string, b: any) => request<any>(`/api/revenue/entries/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(b) }),
  revExportUrl: () => '/api/revenue/export.csv',
  revMine: () => request<any>('/api/revenue/mine'),
  revValue: () => request<any>('/api/revenue/value'),
  revPilot: (days = 60, city = '') => request<any>(`/api/revenue/pilot?days=${days}&city=${encodeURIComponent(city)}`),
  homeBroker: () => request<any>('/api/home/broker'),
  reputationPending: () => request<any>('/api/reputation/pending'),
  reputationConfirm: (refId: string, toId: string, note = '') => request<any>('/api/reputation/confirm', { method: 'POST', body: JSON.stringify({ refId, toId, note }) }),
  revValueCsvUrl: () => '/api/revenue/value.csv',
  revStrength: (city = '') => request<any>(`/api/revenue/strength${city ? `?city=${encodeURIComponent(city)}` : ''}`),
  revLinks: () => request<any>('/api/revenue/strength/links'),
  revLinkCreate: (b: { city?: string; label: string; days?: number }) => request<any>('/api/revenue/strength/links', { method: 'POST', body: JSON.stringify(b) }),
  revLinkRevoke: (id: string) => request<any>(`/api/revenue/strength/links/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  publicStrength: (token: string) => request<any>(`/api/public/strength/${encodeURIComponent(token)}`),
  adminHealth: () => request<any>('/api/admin/health'),
  idQueue: (filter: string, q = '', tier = '') => request<any>(`/api/id-review/queue?filter=${encodeURIComponent(filter)}${q ? `&q=${encodeURIComponent(q)}` : ''}${tier ? `&tier=${tier}` : ''}`),
  idTask: (id: string) => request<any>(`/api/id-review/tasks/${encodeURIComponent(id)}`),
  idAssign: (id: string, assigneeId: string | null) => request<any>(`/api/id-review/tasks/${encodeURIComponent(id)}/assign`, { method: 'POST', body: JSON.stringify({ assigneeId }) }),
  idAssignAll: (assigneeId: string) => request<any>('/api/id-review/assign-unassigned', { method: 'POST', body: JSON.stringify({ assigneeId }) }),
  idDecide: (id: string, decision: 'SEEN' | 'ASK_AGAIN', note?: string) => request<any>(`/api/id-review/tasks/${encodeURIComponent(id)}/decide`, { method: 'POST', body: JSON.stringify({ decision, note }) }),
  // v22 — Legal Help
  legalContext: (dealId: string) => request<any>(`/api/legal/context?dealId=${encodeURIComponent(dealId)}`),
  legalRaise: (b: any) => request<any>('/api/legal/requests', { method: 'POST', body: JSON.stringify(b) }),
  legalRequests: (dealId?: string) => request<any>(`/api/legal/requests${dealId ? `?dealId=${encodeURIComponent(dealId)}` : ''}`),
  legalAct: (id: string, action: 'claim' | 'quote' | 'release' | 'accept' | 'decline' | 'cancel' | 'complete' | 'messages' | 'report-bypass' | 'bypass-decision', body: any = {}) =>
    request<any>(`/api/legal/requests/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: JSON.stringify(body) }),
  legalDesk: () => request<any>('/api/legal/desk'),
  legalProfileSave: (states: string[]) => request<any>('/api/legal/profile', { method: 'PUT', body: JSON.stringify({ states }) }),
  legalAdmin: () => request<any>('/api/legal/admin'),
  legalSettingsSave: (b: any) => request<any>('/api/legal/settings', { method: 'PUT', body: JSON.stringify(b) }),
  legalCounsellorStates: (id: string, states: string[]) => request<any>(`/api/legal/counsellors/${encodeURIComponent(id)}/states`, { method: 'POST', body: JSON.stringify({ states }) }),
  legalCounsellorPanel: (id: string, action: 'REMOVE' | 'RESTORE', reason: string) => request<any>(`/api/legal/counsellors/${encodeURIComponent(id)}/panel`, { method: 'POST', body: JSON.stringify({ action, reason }) }),
  legalBadge: () => request<{ success: boolean; count: number }>('/api/legal/badge'),
  // v23 — Plans & Fees
  billingCatalog: () => request<any>('/api/billing/catalog'),
  billingPeople: (q: string) => request<any>(`/api/billing/people?q=${encodeURIComponent(q)}`),
  billingRuleSave: (id: string | null, b: any) => request<any>(id ? `/api/billing/rules/${encodeURIComponent(id)}` : '/api/billing/rules', { method: id ? 'PUT' : 'POST', body: JSON.stringify(b) }),
  billingPlanSave: (id: string | null, b: any) => request<any>(id ? `/api/billing/plans/${encodeURIComponent(id)}` : '/api/billing/plans', { method: id ? 'PUT' : 'POST', body: JSON.stringify(b) }),
  billingGates: (gates: any[]) => request<any>('/api/billing/gates', { method: 'PUT', body: JSON.stringify({ gates }) }),
  billingPreview: (b: any) => request<any>('/api/billing/preview', { method: 'POST', body: JSON.stringify(b) }),
  billingLedger: (status = '', kind = '') => request<any>(`/api/billing/ledger?status=${encodeURIComponent(status)}&kind=${encodeURIComponent(kind)}`),
  billingLedgerAct: (id: string, action: 'confirm' | 'reject' | 'waive' | 'refund-settled' | 'mark-paid', body: any = {}) => request<any>(`/api/billing/ledger/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: JSON.stringify(body) }),
  billingGrant: (b: { userId: string; planId: string; months: number; note: string }) => request<any>('/api/billing/members/grant', { method: 'POST', body: JSON.stringify(b) }),
  billingEnd: (entryId: string, note: string) => request<any>(`/api/billing/members/${encodeURIComponent(entryId)}/end`, { method: 'POST', body: JSON.stringify({ note }) }),
  billingMe: () => request<any>('/api/billing/me'),
  billingBuy: (planId: string, period: 'MONTHLY' | 'YEARLY') => request<any>('/api/billing/me/buy', { method: 'POST', body: JSON.stringify({ planId, period }) }),
  billingBadge: () => request<{ success: boolean; count: number; relevant: boolean }>('/api/billing/badge'),
  idSettings: () => request<any>('/api/id-review/settings'),
  idSettingsSave: (b: { autoVerify?: boolean; defaultAssigneeId?: string | null }) => request<any>('/api/id-review/settings', { method: 'PUT', body: JSON.stringify(b) }),
  netProfile: (id: string) => request<any>(`/api/network/profile/${encodeURIComponent(id)}`),
  netSetTier: (id: string, b: any) => request<any>(`/api/network/tier/${id}`, { method: 'POST', body: JSON.stringify(b) }),
  netChannel: () => request<any>('/api/network/channel/projects'),
  netDesk: () => request<any>('/api/network/desk'),
  netDeskNew: (b: any) => request<any>('/api/network/desk', { method: 'POST', body: JSON.stringify(b) }),
  netDeskStatus: (id: string, b: any) => request<any>(`/api/network/desk/${id}/status`, { method: 'POST', body: JSON.stringify(b) }),
  tuList: () => request<any>('/api/tieups'),
  tuDirectory: (q: string, city: string, tier: string) => request<any>(`/api/tieups/directory?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}&tier=${tier}`),
  tuPropose: (b: any) => request<any>('/api/tieups', { method: 'POST', body: JSON.stringify(b) }),
  tuAct: (id: string, action: 'accept' | 'decline' | 'withdraw' | 'end', b: any = {}) => request<any>(`/api/tieups/${id}/${action}`, { method: 'POST', body: JSON.stringify(b) }),
  tlGet: (dealId: string) => request<any>(`/api/timeline/${dealId}`),
  tlAdd: (dealId: string, b: any) => request<any>(`/api/timeline/${dealId}/milestones`, { method: 'POST', body: JSON.stringify(b) }),
  tlMs: (dealId: string, id: string, action: 'done' | 'confirm' | 'cancel', b: any = {}) => request<any>(`/api/timeline/${dealId}/milestones/${id}/${action}`, { method: 'POST', body: JSON.stringify(b) }),
  tlNote: (dealId: string, b: any) => request<any>(`/api/timeline/${dealId}/notes`, { method: 'POST', body: JSON.stringify(b) }),
  tlNoteDel: (dealId: string, id: string) => request<any>(`/api/timeline/${dealId}/notes/${id}`, { method: 'DELETE' }),
  visitAck: (kind: 'PASS' | 'VISIT', refId: string) => request<any>(`/api/visit-acks/${kind}/${encodeURIComponent(refId)}`),
  visitMe: () => request<any>('/api/visits/me'),
  visitIssue: (b: { leadId: string; scheduledAt: string; partySize?: number; note?: string; scanAt?: string }) => request<any>('/api/visits/passes', { method: 'POST', body: JSON.stringify(b) }),
  visitPasses: (leadId?: string) => request<any>(`/api/visits/passes${leadId ? `?leadId=${encodeURIComponent(leadId)}` : ''}`),
  visitCancel: (id: string) => request<any>(`/api/visits/passes/${id}/cancel`, { method: 'POST', body: '{}' }),
  visitBoard: () => request<any>('/api/visits/board'),
  visitPreview: (code: string) => request<any>(`/api/visits/scan/${encodeURIComponent(code)}`),
  visitConfirm: (code: string, b: { idChecked: true; partySize?: number; note?: string }) => request<any>(`/api/visits/scan/${encodeURIComponent(code)}/confirm`, { method: 'POST', body: JSON.stringify(b) }),
  pcSettings: (id: string, b: any) => request<any>(`/api/pcontrol/builder/projects/${id}/settings`, { method: 'PUT', body: JSON.stringify(b) }),
  pcDetails: (id: string, b: any) => request<any>(`/api/pcontrol/builder/projects/${id}/details`, { method: 'PUT', body: JSON.stringify(b) }),
  pcDecide: (mid: string, b: any) => request<any>(`/api/pcontrol/builder/mandates/${mid}/decide`, { method: 'POST', body: JSON.stringify(b) }),
  pcStatus: (mid: string, b: any) => request<any>(`/api/pcontrol/builder/mandates/${mid}/status`, { method: 'POST', body: JSON.stringify(b) }),
  pcTerms: (mid: string, b: any) => request<any>(`/api/pcontrol/builder/mandates/${mid}/terms`, { method: 'PUT', body: JSON.stringify(b) }),
  pcNotice: (id: string, b: any) => request<any>(`/api/pcontrol/builder/projects/${id}/updates`, { method: 'POST', body: JSON.stringify(b) }),
  pcNoticeDelete: (uid: string) => request<any>(`/api/pcontrol/builder/updates/${uid}`, { method: 'DELETE' }),
  pcFile: (id: string, b: any) => request<any>(`/api/pcontrol/builder/projects/${id}/collateral`, { method: 'POST', body: JSON.stringify(b) }),
  pcFileDelete: (id: string, cid: string) => request<any>(`/api/pcontrol/builder/projects/${id}/collateral/${cid}`, { method: 'DELETE' }),
  pcVerifyQueue: () => request<any>('/api/pcontrol/builder/verification-queue'),
  pcVerify: (leadId: string, b: { decision: 'ACCEPT' | 'REJECT'; note?: string }) => request<any>(`/api/pcontrol/builder/leads/${leadId}/verify`, { method: 'POST', body: JSON.stringify(b) }),
  ppProjects: () => request<any>('/api/pcontrol/partner/projects'),
  ppProject: (id: string) => request<any>(`/api/pcontrol/partner/projects/${id}`),
  ppApply: (id: string, note: string) => request<any>(`/api/pcontrol/partner/projects/${id}/apply`, { method: 'POST', body: JSON.stringify({ note }) }),
  ppClients: () => request<any>('/api/pcontrol/partner/clients'),
  ppShortlist: () => request<any>('/api/pcontrol/partner/shortlist'),
  ppShortlistAdd: (id: string, b: any) => request<any>(`/api/pcontrol/partner/projects/${id}/shortlist`, { method: 'POST', body: JSON.stringify(b) }),
  ppShortlistEdit: (sid: string, b: any) => request<any>(`/api/pcontrol/partner/shortlist/${sid}`, { method: 'PUT', body: JSON.stringify(b) }),
  ppShortlistDrop: (sid: string) => request<any>(`/api/pcontrol/partner/shortlist/${sid}`, { method: 'DELETE' }),
  ppShortlistRegister: (sid: string, b: any = {}) => request<any>(`/api/pcontrol/partner/shortlist/${sid}/register`, { method: 'POST', body: JSON.stringify(b) }),
  tcControl: () => request<any>('/api/pcontrol/team/control'),
  tcRouting: (mode: string) => request<any>('/api/pcontrol/team/routing', { method: 'PUT', body: JSON.stringify({ mode }) }),
  tcPolicy: (id: string, b: any) => request<any>(`/api/pcontrol/team/${id}/policy`, { method: 'PUT', body: JSON.stringify(b) }),
  tcHandover: (fromMemberId: string, toMemberId: string | null) => request<any>('/api/pcontrol/team/handover', { method: 'POST', body: JSON.stringify({ fromMemberId, toMemberId }) }),
  tcBulk: (leadIds: string[], memberId: string | null) => request<any>('/api/pcontrol/team/bulk-allot', { method: 'POST', body: JSON.stringify({ leadIds, memberId }) }),
  tcReveals: () => request<any>('/api/pcontrol/team/reveals'),
  staffReveal: (leadId: string) => request<{ phone: string }>(`/api/pcontrol/leads/${leadId}/reveal`, { method: 'POST', body: '{}' }),
  staffPool: () => request<any>('/api/pcontrol/staff/pool'),
  staffClaim: (leadId: string) => request<any>('/api/pcontrol/staff/claim', { method: 'POST', body: JSON.stringify({ leadId }) }),
};
