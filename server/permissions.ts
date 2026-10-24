/**
 * GENZ BROKER NETWORK — Central Access Control (RBAC)
 *
 * Single source of truth for "which role may do what".
 * - Route-level gate:   `needs('permission')` middleware (see server/auth.ts)
 * - Resource-level gate: ownership / participant checks (see server/access.ts)
 * - UI:                 /api/auth/me returns the caller's permission list so the
 *                       client only renders what the server will actually allow.
 *
 * Principle: deny by default, least privilege. A permission here is *necessary*
 * but not always *sufficient* — e.g. `property:update` still requires the caller
 * to own / list the property (or be an admin).
 */

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

export const ALL_ROLES: UserRole[] = [
  'SUPERADMIN',
  'ADMIN',
  'BROKER',
  'PROPERTY_OWNER',
  'BUYER_TENANT',
  'CONTRACTOR',
  'DEVELOPER_BUILDER',
  'LEGAL_COUNSEL',
  'GENZ_CONNECTOR',
  'TEAM_MEMBER',
];

export const PERMISSION_CATALOG = {
  // ── Session (allowed even while KYC is pending) ─────────────────────────
  'self:read': 'View own profile & verification status',
  'self:update': 'Change own password / profile',

  // ── Baseline for every VERIFIED account ─────────────────────────────────
  'metrics:own': 'See own dashboard metrics',
  'activity:read': 'See the (role-scoped) activity feed',
  'directory:read': 'See contact-free partner cards of network members',

  // ── Platform administration ─────────────────────────────────────────────
  'users:list': 'See the full user directory incl. contact details',
  'users:invite': 'Issue invitation codes (non-admin roles)',
  'users:invite_admin': 'Issue invitation codes for ADMIN / SUPERADMIN roles',
  'users:review': 'Approve / reject / suspend users (KYC)',
  'users:blacklist': 'Blacklist a user permanently',
  'users:reset_password': 'Issue a temporary password to a user',
  'users:impersonate': 'View the platform as another user (audited)',
  'audit:read_all': 'Read the complete audit trail',
  'audit:read_own': 'Read audit events that concern the caller',
  'metrics:global': 'See platform-wide metrics (all users, all commissions)',
  'permissions:read_matrix': 'View the role/permission matrix',

  // ── Property inventory ──────────────────────────────────────────────────
  'property:read': 'Browse verified property inventory (privacy-masked)',
  'property:create': 'List a property',
  'property:update': 'Edit a listing the caller owns / lists (admins: any)',
  'property:moderate': 'Approve / reject / suspend listings',
  'property:withdraw': 'Withdraw a listing the caller owns / lists',
  'vault:manage': 'Upload to the media vault & manage share-grants (own property)',
  'vault:read_all': 'Read every vault asset (compliance)',

  // ── Demand side ─────────────────────────────────────────────────────────
  'requirement:read': 'Read buyer requirements (own / assigned; PII masked otherwise)',
  'requirement:create': 'Register a buyer requirement',
  'matching:run': 'Run the property ⇄ requirement match engine',

  // ── Collaboration & deal rooms ──────────────────────────────────────────
  'collab:read': 'Read collaboration offers the caller is a party to',
  'collab:propose': 'Propose a co-broking collaboration',
  'collab:respond': 'Accept / counter / reject a collaboration offer',
  'deal:read': 'Open deal rooms the caller participates in',
  'deal:update_stage': 'Advance a deal-room stage',
  'deal:commission': 'Edit the (pre-agreement) commission split',
  'deal:chat': 'Read / write the deal-room chat',
  'agreement:read': 'Read commission agreements of own deals',
  'agreement:propose': 'Propose / amend a commission agreement',
  'agreement:sign': 'E-sign a commission agreement as a named signer',
  'agreement:record_payment': 'Record commission payments / disputes',
  'task:read': 'Read the deal responsibility matrix',
  'task:manage': 'Accept, assign, complete, waive deal tasks',
  'task:verify': 'Independently verify a completed task',

  // ── Due diligence & legal ───────────────────────────────────────────────
  'dd:read': 'Read due-diligence checklists for properties the caller can access',
  'dd:upload': 'Attach evidence to a due-diligence item',
  'dd:verify_broker': 'Mark broker-level checks',
  'dd:verify_authenticity': 'Mark authenticity verified (independent of uploader)',
  'dd:legal_signoff': 'Formal legal review sign-off',
  'dd:readiness_approve': 'Approve a checklist item for registry readiness',
  'dd:issue_manage': 'Raise / respond to / decide due-diligence issues',
  'readiness:generate': 'Generate the registry-readiness report',

  // ── Site visits & owner mandates ────────────────────────────────────────
  'sitevisit:read': 'Read site visits the caller is party to',
  'sitevisit:create': 'Schedule a site visit',
  'sitevisit:verify': 'Verify a site visit on location (OTP / QR)',
  'sitevisit:secret_view': 'See the visit OTP/QR secret (owner / customer / admin side)',
  'mandate:read': 'Read net-amount mandates of own listings (owner, listing broker, admins)',
  'mandate:owner_create': 'Owner: draft a brokerage mandate — net amount, % commission or fixed fee (signs the draft)',
  'mandate:owner_confirm': 'Owner: withdraw a pending (not yet co-signed) mandate',
  'mandate:broker_respond': 'Listing broker: accept (co-sign) or reject the owner\'s brokerage mandate (net amount, % commission or fixed fee)',

  // ── Construction referral desk ──────────────────────────────────────────
  'lead:read': 'Read construction referral leads (contact details gated)',
  'lead:create': 'Post a construction referral lead',
  'lead:claim': 'Accept referral terms & claim a lead (contractor)',
  'lead:settle': 'Record contract value / referral payment',

  // ── Disputes ────────────────────────────────────────────────────────────
  'dispute:read': 'Read disputes the caller is party to',
  'dispute:create': 'File a dispute',
  'dispute:resolve': 'Mediate & resolve disputes (lifts settlement hold)',

  // ── Builder launchpad ───────────────────────────────────────────────────
  'builder:projects_read': 'View builder projects (commission terms only for partners)',
  'builder:project_create': 'Launch a builder project',
  'builder:associates_read': 'See the associate directory & mandates of own projects',
  'builder:my_mandates': 'See own sales-associate mandates',
  'builder:appoint_associate': 'Appoint a broker as sales associate',
  'builder:record_sale': 'Record / approve a booking against a mandate',

  // ── Builder ⇄ Associates CRM ────────────────────────────────────────────
  'crm:read': 'Open the CRM (scope limited to own pipeline / own projects)',
  'crm:lead_create': 'Register a CRM lead (dedupe-protected)',
  'crm:lead_manage': 'Update stage, log follow-ups & activities on a lead',
  'crm:booking_request': 'Submit a booking request for a lead',
  'crm:booking_decide': 'Approve / reject booking requests, manage payment schedule',
  'crm:payout': 'Mark associate brokerage as paid',
  'crm:money_collect': 'Money trail: record customer money you collected and hand it over to the next person (employees only when the employer allows it)',
  'crm:money_confirm': 'Money trail: confirm a stage of the chain — the partner confirming a colleague\'s collection, or the builder\'s authorised accounts person confirming it arrived (employees only when the employer allows it)',
  'inventory:read': 'See the live unit / plot grid of a project the caller is mandated on or owns',
  'inventory:manage': 'Builder: create units, set status, hold window, minimum token and escalator commission slabs',
  'inventory:hold': 'Broker: place a token hold on an available unit for own lead',
  'inventory:share': 'Send a customer a tracked page of chosen units, with the rate and the property features switched on or off (only what the sender can see himself)',
  'launch:manage': 'GENZ desk: plan a staged network launch of a project (big RERA firms → independent brokers → local teaser), after the builder agrees',
  'launch:read': 'See network launches open to the caller\'s group (partners) or the local teaser board (local associates)',
  'team:checkin': 'Record a GPS + selfie site check-in',
  'share:use': 'Branded flyers, tracked share links and message templates',
  'partywatch:report': 'Network Watch: check a buyer / owner mobile and report one who refuses commission or goes direct',
  'partywatch:review': 'Network Watch: GENZ staff review reports, block or clear a mobile, answer appeals',
  'clientroom:use': 'Client Rooms: a private room (link + mobile OTP) to share properties and chat with your own client',
  'partner:manage': 'Shop QR partners: put your QR at a shop / society gate, agree the shopkeeper’s share, and get the leads customers send by scanning it',
  'publicpage:use': 'My public page: show the homes you choose on your public page (no login, no owner details) and get customers’ enquiries',
  'pchat:use': 'Builder ↔ partner chat: talk with your builder / channel partners about leads, units, bookings and payouts — messages, cards and photos',
  'rent:use': 'Rent desk: keep the tenancies you closed — terms, tenant police verification, renewal reminders, vacating and re-letting (GENZ never holds rent or deposit)',
  'partner:oversee': 'Shop QR partners — GENZ desk: see partner shares marked “not received” and leads worked after being marked lost',
  'landrecord:manage': 'Record land / khasra details and run the title red-flag scanner',
  'team:manage': 'Add / suspend own team members and allot CRM leads & deal rooms to them',
  'growth:nominate': 'Invite-only growth: nominate peers, own invite code, public visiting card, activation checklist',
  'growth:manage': 'City launch board, growth waitlist / nomination queue, password-reset requests',
  'daily:use': 'Daily digest, personal client pipeline, map view, points (brokers)',
  'pdoc:use': 'Upload view-only protected documents and view the ones shared with you',
  'propdoc:use': 'Property Papers library: upload PDF / photo papers of own properties, search them, share with chosen members; open papers shared with you (every open is logged)',
  'report:create': 'Report a listing or a member',
  'report:manage': 'Review reports and release / withdraw held listings',
  'chapter:read': 'See the city chapters, meets and announcements',
  'chapter:manage': 'Create chapters, appoint City Captains, run meets',
  'loan:submit': 'Refer a client (with consent) to the home-loan desk',
  'loan:manage': 'Work the home-loan referral desk',
  'academy:read': 'GENZ Academy lessons and progress',
  'pcontrol:manage': 'Builder: Project Control Room — partner applications, pause / revoke / terms, lead intake & verification, notices, collateral',
  'pcontrol:partner': 'Broker: project-wise view of partnerships, notices, collateral, apply to a project, client shortlist',
  'pcontrol:oversee': 'Admin: read-only view of project control (partners, verification queue) across builders',
  'offer:make': 'Make offers on listings for your buyers',
  'offer:decide': 'Accept / counter / reject offers and confirm tokens on your property',
  'listing:lifecycle': 'Mark a listing sold / rented, relist, site poster and enquiries',
  'tier2:vouch': 'Broker: propose / vouch for a local broker (Tier 2 entry); City Captains vouch alone',
  'tieup:manage': 'Broker: propose, accept and end tie-ups (referral / co-broking terms) with other brokers',
  'network:use': 'Network directory, trust profiles, invite tree, builder channel and GENZ desk requests',
  'visit:pass': 'Issue a single-use QR visit pass for a lead (partner / builder desk)',
  'visit:scan': 'Scan a visitor QR pass at the builder site and confirm the visit (builder side only)',
  'pcontrol:staff': 'Employee: lead pool, claim, logged phone reveal (limited by the employer-set policy)',
  'connector:sponsor': 'Run own referral-partner network: invite local partners, receive their referrals, reward & pay them',
  'crm:bonus_manage': 'Define volume-bonus slabs on own projects and pay bonuses to associates',
  'crm:assign': 'Re-assign leads between associates',

  // ── GENZ Connector (local shopkeepers & community referral partners) ────
  'connector:self': 'Connector: own referral dashboard, referral history & reward ledger',
  'connector:refer': 'Connector: submit a referral (customer must have consented)',
  'connector:desk': 'GENZ staff desk: view, assign and progress connector referrals (no reward, payout or settings)',
  'connector:work': 'Broker / contractor: work the connector referrals assigned to you',
  'connector:manage': 'Review connector partners & referrals, assign, set status, approve rewards',
  'connector:payout': 'Record the payout of an approved connector reward',
  'connector:settings': 'Edit the reward table & connector programme switch',

  // ── Legal Help (v22) ────────────────────────────────────────────────────
  'legal:request': 'Broker: ask GENZ\u2019s legal panel for help from a deal room (state-matched, shares only what the broker ticks)',
  'legal:desk': 'Legal counsel: see open help requests of own states, claim first-come-first-served, quote a fee, see the fee table (read-only)',
  'legal:manage': 'GENZ staff: see all legal-help requests, confirm counsellors\u2019 fee payments, decide bypass reports, set panel states / strikes',
  'legal:settings': 'Superadmin: set the legal-help platform fee, member fee, membership price and time limits',

  // ── Plans & Fees (v23) ──────────────────────────────────────────────────
  'billing:manage': 'GENZ staff: create fee rules (flat / %, per group, state, person), membership plans, member-only features; confirm, reject or waive payments',
  'billing:self': 'See the GENZ fees and plans that apply to me, take a membership, mark my GENZ dues paid',

  // ── KYC vault (v25) ─────────────────────────────────────────────────────
  'kyc:reveal': 'Superadmin only: open a member\u2019s encrypted full Aadhaar number and address for a legal / dispute matter (written reason, audited, shown to the member); switch the vault on or off',

  // ── Superadmin control ──────────────────────────────────────────────────
  'admin:control_center': 'Open the Superadmin Control Center (platform health, function directory, role matrix)',
} as const;

export type Permission = keyof typeof PERMISSION_CATALOG;
export const ALL_PERMISSIONS = Object.keys(PERMISSION_CATALOG) as Permission[];

const SELF: Permission[] = ['self:read', 'self:update', 'metrics:own', 'activity:read', 'directory:read'];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  // Founder / platform owner → everything.
  SUPERADMIN: [...ALL_PERMISSIONS],

  // Operations desk: KYC, moderation, mediation, oversight. No owner/builder business actions,
  // cannot invite/modify admins, blacklist, impersonate, sign, or approve legal sign-off.
  ADMIN: [
    ...SELF,
    'users:list', 'users:invite', 'users:review', 'users:reset_password',
    'connector:manage', 'connector:payout', 'team:manage', 'growth:manage',
    'audit:read_all', 'metrics:global', 'permissions:read_matrix',
    'property:read', 'property:create', 'property:update', 'property:moderate', 'partywatch:review', 'property:withdraw', 'vault:read_all',
    'requirement:read', 'matching:run',
    'mandate:read',
    'collab:read',
    'deal:read', 'deal:update_stage', 'deal:chat',
    'agreement:read', 'agreement:record_payment',
    'task:read', 'task:manage', 'task:verify',
    'dd:read', 'dd:verify_authenticity', 'dd:readiness_approve', 'dd:issue_manage', 'readiness:generate',
    'sitevisit:read', 'sitevisit:secret_view',
    'lead:read',
    'dispute:read', 'dispute:resolve',
    'builder:projects_read', 'builder:associates_read',
    'crm:read', 'crm:assign',
    'pcontrol:oversee',
    'inventory:read', 'landrecord:manage', 'launch:manage',
    'report:manage', 'chapter:read', 'chapter:manage', 'loan:manage', 'academy:read', 'propdoc:use',
    'legal:manage', 'billing:manage', 'partner:oversee',
  ],

  // Verified RERA broker — the core network participant.
  BROKER: [
    ...SELF,
    'audit:read_own',
    'property:read', 'property:create', 'property:update', 'property:withdraw', 'vault:manage',
    'requirement:read', 'requirement:create', 'matching:run',
    'collab:read', 'collab:propose', 'collab:respond',
    'deal:read', 'deal:update_stage', 'deal:commission', 'deal:chat',
    'agreement:read', 'agreement:propose', 'agreement:sign',
    'task:read', 'task:manage', 'task:verify',
    'dd:read', 'dd:upload', 'dd:verify_broker', 'dd:issue_manage',
    'sitevisit:read', 'sitevisit:create', 'sitevisit:verify',
    'mandate:read', 'mandate:broker_respond',
    'lead:read', 'lead:create', 'lead:settle',
    'dispute:read', 'dispute:create',
    'builder:projects_read', 'builder:my_mandates',
    'pcontrol:partner',
    'visit:pass',
    'offer:make', 'offer:decide', 'listing:lifecycle',
    'tier2:vouch', 'tieup:manage', 'network:use',
    'crm:read', 'crm:lead_create', 'crm:lead_manage', 'crm:booking_request', 'crm:money_collect', 'crm:money_confirm',
    'connector:work', 'connector:sponsor', 'team:manage', 'growth:nominate',
    'inventory:read', 'inventory:hold', 'inventory:share', 'launch:read', 'team:checkin', 'share:use', 'clientroom:use', 'partner:manage', 'publicpage:use', 'rent:use', 'pchat:use', 'partywatch:report', 'landrecord:manage',
    'daily:use', 'pdoc:use', 'propdoc:use', 'report:create', 'chapter:read', 'loan:submit', 'academy:read',
    'legal:request', 'billing:self',
  ],

  // Property owner — controls own listings, mandate and vault; sees visit secrets.
  PROPERTY_OWNER: [
    ...SELF,
    'audit:read_own',
    'property:read', 'property:create', 'property:update', 'property:withdraw', 'vault:manage',
    // No collab:* and no agreement:* — what the two brokers agree between themselves is none of the owner's business.
    'deal:read', 'deal:chat',
    'task:read', 'task:manage',
    'dd:read', 'dd:upload',
    'sitevisit:read', 'sitevisit:secret_view', 'sitevisit:verify',
    'offer:decide', 'listing:lifecycle',
    'mandate:read', 'mandate:owner_create', 'mandate:owner_confirm',
    'dispute:read', 'dispute:create',
    'pdoc:use', 'propdoc:use',
  ],

  // Buyer / tenant — demand side only. No deal rooms, no broker-side data.
  BUYER_TENANT: [
    ...SELF,
    'audit:read_own',
    'property:read',
    'requirement:read', 'requirement:create', 'matching:run',
    'sitevisit:read', 'sitevisit:secret_view',
  ],

  // Contractor — construction referral desk only.
  CONTRACTOR: [
    ...SELF,
    'audit:read_own',
    'lead:read', 'lead:claim', 'lead:settle',
    'dispute:read', 'dispute:create',
    'connector:work', 'team:manage', 'team:checkin', 'growth:nominate',
    'pdoc:use', 'report:create', 'chapter:read', 'academy:read',
    'billing:self',
  ],

  // Developer / builder — Launchpad + CRM for own projects. No broker inventory.
  DEVELOPER_BUILDER: [
    ...SELF,
    'audit:read_own',
    'builder:projects_read', 'builder:project_create', 'builder:associates_read',
    'builder:appoint_associate', 'builder:record_sale',
    'pcontrol:manage', 'network:use', 'pchat:use',
    'visit:pass', 'visit:scan',
    'crm:read', 'crm:lead_create', 'crm:lead_manage', 'crm:booking_request', 'crm:booking_decide', 'crm:payout', 'crm:money_collect', 'crm:money_confirm', 'crm:assign', 'crm:bonus_manage', 'team:manage',
    'inventory:read', 'inventory:manage', 'inventory:share', 'share:use', 'growth:nominate',
    'dispute:read', 'dispute:create',
    'pdoc:use', 'report:create', 'chapter:read', 'academy:read',
    'billing:self',
  ],

  // Empanelled advocate — legal review across DD checklists; sees no commissions or chat.
  LEGAL_COUNSEL: [
    ...SELF,
    'audit:read_own',
    'property:read',
    'task:read', 'task:verify',
    'dd:read', 'dd:upload', 'dd:verify_authenticity', 'dd:legal_signoff', 'dd:readiness_approve',
    'dd:issue_manage', 'readiness:generate',
    'deal:read', 'landrecord:manage', 'growth:nominate',
    'pdoc:use', 'propdoc:use', 'report:create', 'chapter:read', 'academy:read',
    'legal:desk', 'billing:self',
  ],

  // Local shopkeeper / community referral partner. Sees only their own referrals and rewards —
  // no inventory, no brokers, no deals, no directory.
  GENZ_CONNECTOR: [
    'self:read', 'self:update',
    'connector:self', 'connector:refer',
  ],

  // Employee of a broker / builder (telecaller, site executive, assistant). Works ONLY on what the employer
  // allots: CRM leads, deal rooms, and (v16.8) the unit grid as far as the employer's Team Control allows — the route
  // checks his policy, so these two permissions alone show nothing. Never sees brokerage, splits, payouts, bonus or mandates. The money-trail permissions exist for him too, but the route checks the employer's two switches (collect / confirm money), default OFF.
  TEAM_MEMBER: [
    'self:read', 'self:update',
    'crm:read', 'crm:lead_create', 'crm:lead_manage', 'crm:booking_request', 'crm:money_collect', 'crm:money_confirm',
    'deal:read', 'deal:chat', 'task:read', 'task:manage',
    'inventory:read', 'inventory:share',
    'team:checkin',
  ],

};

/** While KYC is not VERIFIED the account may only use these. */
export const UNVERIFIED_ALLOWED: Permission[] = ['self:read', 'self:update'];

export function permissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHas(role: UserRole, perm: Permission): boolean {
  return permissionsForRole(role).includes(perm);
}

/** v58 — the resale / rent switches a BROKER gives one of his staff (see TeamPolicy) */
export interface StaffSwitches { listings?: 'OFF' | 'READ' | 'ADDRESS'; rooms?: boolean; clients?: boolean; canVerify?: boolean }

/** An employee's powers depend on who employs them: always a subset of the employer's own. */
export function memberPermissions(employerRole?: UserRole, sw?: StaffSwitches): Permission[] {
  const base: Permission[] = ['self:read', 'self:update', 'team:checkin', 'task:read'];
  switch (employerRole) {
    case 'ADMIN': case 'SUPERADMIN': return [...base, 'connector:desk'];
    case 'CONTRACTOR': return [...base, 'lead:read'];
    case 'DEVELOPER_BUILDER': case 'BROKER': default: {
      const out: Permission[] = [...base, 'crm:read', 'crm:lead_create', 'crm:lead_manage', 'crm:booking_request', 'crm:money_collect', 'crm:money_confirm', 'deal:read', 'deal:chat', 'task:manage', 'pcontrol:staff', 'visit:pass', 'visit:scan', 'inventory:read', 'inventory:share'];
      // v58 — a broker's office staff: only what the broker switched on for this person (the data stays the broker's — see the routers)
      if (employerRole === 'BROKER' && sw) {
        if (sw.listings === 'READ' || sw.listings === 'ADDRESS') out.push('property:read');
        if (sw.rooms) out.push('clientroom:use');
        if (sw.clients) out.push('daily:use');
      }
      // v61 — a builder's sales manager (the one who checks partner leads) also talks with the partners
      if (employerRole === 'DEVELOPER_BUILDER' && sw?.canVerify) out.push('pchat:use');
      return out;
    }
  }
}

export interface AccountLike {
  role: UserRole;
  employerRole?: UserRole;
  teamPolicy?: StaffSwitches;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED' | 'BLACKLISTED';
}

/** Effective permission list for an account, honouring its verification state. */
export function effectivePermissions(user: AccountLike): Permission[] {
  const all = user.role === 'TEAM_MEMBER' ? memberPermissions(user.employerRole, user.teamPolicy) : permissionsForRole(user.role);
  if (user.verificationStatus === 'VERIFIED') return all;
  if (user.verificationStatus === 'PENDING' || user.verificationStatus === 'SUSPENDED') {
    return all.filter(p => UNVERIFIED_ALLOWED.includes(p));
  }
  return []; // REJECTED / BLACKLISTED
}

export function can(user: AccountLike | undefined | null, perm: Permission): boolean {
  if (!user) return false;
  return effectivePermissions(user).includes(perm);
}

/** Role × permission table, used by the admin "Access Control" panel and docs. */
export function permissionMatrix() {
  return ALL_PERMISSIONS.map(p => ({
    permission: p,
    description: PERMISSION_CATALOG[p],
    roles: ALL_ROLES.filter(r => roleHas(r, p)),
  }));
}
