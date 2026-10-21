import crypto from 'node:crypto';
import {
  DealTask,
  DealCommissionAgreement,
  DueDiligenceChecklistItem,
  DueDiligenceIssue,
  TransactionReadinessReport,
  DueDiligenceCategory,
} from '../src/types/index.js';

export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// 13 Task Templates required by Module A1
export const TASK_DEFINITIONS = [
  {
    key: 'T1_BUYER_SELLER_INTRO',
    title: 'Buyer or Seller Introduction',
    description: 'Document initial parties, source of lead, introduction timestamp, and client consent for representation.',
    category: 'INTRO_COMMUNICATION' as const,
    defaultRole: 'BROKER',
    defaultDaysFromStart: 1,
  },
  {
    key: 'T2_PROPERTY_SHORTLIST',
    title: 'Property Identification & Shortlisting',
    description: 'Match requirements against verified inventory in the target city; prepare shortlist with verified pricing and documentation status.',
    category: 'INTRO_COMMUNICATION' as const,
    defaultRole: 'BROKER',
    defaultDaysFromStart: 3,
  },
  {
    key: 'T3_OWNER_NEGOTIATION',
    title: 'Owner Contact & Price Negotiation',
    description: 'Facilitate price discussions within owner approved net price bounds without bypassing listing broker mandate.',
    category: 'INTRO_COMMUNICATION' as const,
    defaultRole: 'BROKER',
    defaultDaysFromStart: 5,
  },
  {
    key: 'T4_BUYER_QUALIFICATION_VISIT',
    title: 'Buyer Qualification & Site Visits',
    description: 'Schedule, execute, and verify physical site inspection using tamper-proof OTP/QR verification with customer feedback.',
    category: 'INTRO_COMMUNICATION' as const,
    defaultRole: 'BROKER',
    defaultDaysFromStart: 7,
  },
  {
    key: 'T5_DOCUMENT_COLLECTION',
    title: 'Document Collection & Preliminary Review',
    description: 'Collect registered sale deed, Khasra B1, P-II Khatauni, diversion certificate, tax receipts, and municipal approvals from seller.',
    category: 'DUE_DILIGENCE_LEGAL' as const,
    defaultRole: 'BROKER',
    defaultDaysFromStart: 9,
  },
  {
    key: 'T6_LEGAL_TITLE_REVIEW',
    title: 'Independent Legal Title Review',
    description: 'Engage enrolled High Court / District Bar Advocate to conduct 30-year Sub-Registrar search, encumbrance check, and draft legal opinion.',
    category: 'DUE_DILIGENCE_LEGAL' as const,
    defaultRole: 'LEGAL_COUNSEL',
    defaultDaysFromStart: 14,
  },
  {
    key: 'T7_SURVEY_BOUNDARY_VERIF',
    title: 'Survey, Measurement & Boundary Verification',
    description: 'Conduct on-site demarcation survey, verify corner boundary pillars against revenue map (Nazul/Patwari), and check road access width.',
    category: 'DUE_DILIGENCE_LEGAL' as const,
    defaultRole: 'ADMIN',
    defaultDaysFromStart: 16,
  },
  {
    key: 'T8_LOAN_BANK_COORD',
    title: 'Loan & Bank Coordination',
    description: 'Coordinate bank valuation, legal vetting by empaneled bank advocate, and home loan sanction letter issuance for buyer.',
    category: 'FINANCIAL_LOAN' as const,
    defaultRole: 'BROKER',
    defaultDaysFromStart: 20,
  },
  {
    key: 'T9_AGREEMENT_DRAFTING',
    title: 'Agreement Drafting & Legal Coordination',
    description: 'Draft bilingual (English/Hindi) Agreement to Sell (Bayanama) including milestone schedules, default penalties, and vacant possession clause.',
    category: 'DUE_DILIGENCE_LEGAL' as const,
    defaultRole: 'LEGAL_COUNSEL',
    defaultDaysFromStart: 22,
  },
  {
    key: 'T10_STAMP_DUTY_REGISTRATION',
    title: 'Stamp Duty & Registration Coordination',
    description: 'Calculate the stamp duty, municipal surcharge and registration fees applicable in the state where the property lies (rates differ by state, gender of buyer and property type); purchase e-stamp certificates.',
    category: 'REGISTRATION_GOVT' as const,
    defaultRole: 'BROKER',
    defaultDaysFromStart: 25,
  },
  {
    key: 'T11_REGISTRY_APPOINTMENT',
    title: 'Registry Appointment & Completion Coordination',
    description: 'Book a slot at the jurisdictional Sub-Registrar office, verify Aadhaar biometrics readiness of seller/buyer/witnesses, and oversee deed execution.',
    category: 'REGISTRATION_GOVT' as const,
    defaultRole: 'BROKER',
    defaultDaysFromStart: 28,
  },
  {
    key: 'T12_PAYMENT_POSSESSION_HANDOVER',
    title: 'Payment Confirmation & Possession Handover',
    description: 'Verify final demand draft / RTGS settlement, handover physical keys, execute possession receipt, and transfer utility accounts.',
    category: 'HANDOVER_CONSTRUCTION' as const,
    defaultRole: 'ADMIN',
    defaultDaysFromStart: 30,
  },
  {
    key: 'T13_CONSTRUCTION_CONTRACTOR',
    title: 'Construction, Renovation or Contractor Coordination',
    description: 'Connect client with verified GENZ BUILDCON turnkey contractors for elevation, interior fitout, or expansion where applicable.',
    category: 'HANDOVER_CONSTRUCTION' as const,
    defaultRole: 'CONTRACTOR',
    defaultDaysFromStart: 35,
  },
];

export function generateDealTasks(
  dealId: string,
  options: {
    introducingBrokerId: string;
    introducingBrokerName: string;
    closingBrokerId: string;
    closingBrokerName: string;
    ownerId: string;
    ownerName: string;
    legalCounselId?: string;
    legalCounselName?: string;
    /** platform desk that reviews / verifies tasks (a real, verified admin) */
    adminId?: string;
    adminName?: string;
    /** optional empanelled contractor; falls back to the platform desk */
    contractorId?: string;
    contractorName?: string;
    propertyType?: string;
  }
): DealTask[] {
  const now = new Date();
  const tasks: DealTask[] = [];
  // v21: with no platform desk given (the normal case now — GENZ does not sit inside a broker-to-broker deal room) the duties that
  // used to default to the desk stay with the deal's own brokers, and the two brokers review each other's work.
  const desk = !!options.adminId;
  const adminId = options.adminId || options.closingBrokerId;
  const adminName = options.adminName || options.closingBrokerName;
  const deskRole = desk ? 'ADMIN' : 'BROKER';

  for (let i = 0; i < TASK_DEFINITIONS.length; i++) {
    const def = TASK_DEFINITIONS[i];
    const taskId = `TSK-${dealId.replace('DEAL-', '')}-${String(i + 1).padStart(2, '0')}`;
    const dueDate = new Date(now.getTime() + def.defaultDaysFromStart * 86400000).toISOString();

    let assignedId = options.closingBrokerId;
    let assignedName = options.closingBrokerName;
    let assignedRole = 'BROKER';

    if (def.key === 'T1_BUYER_SELLER_INTRO' || def.key === 'T4_BUYER_QUALIFICATION_VISIT' || def.key === 'T8_LOAN_BANK_COORD') {
      assignedId = options.introducingBrokerId;
      assignedName = options.introducingBrokerName;
      assignedRole = 'BROKER';
    } else if (def.key === 'T6_LEGAL_TITLE_REVIEW' || def.key === 'T9_AGREEMENT_DRAFTING') {
      // No empanelled advocate on the network yet → the platform desk holds the duty until one is appointed.
      assignedId = options.legalCounselId || adminId;
      assignedName = options.legalCounselId ? (options.legalCounselName || 'Legal Counsel') : adminName;
      assignedRole = options.legalCounselId ? 'LEGAL_COUNSEL' : deskRole;
    } else if (def.key === 'T12_PAYMENT_POSSESSION_HANDOVER' || def.key === 'T7_SURVEY_BOUNDARY_VERIF') {
      assignedId = adminId;
      assignedName = adminName;
      assignedRole = deskRole;
    } else if (def.key === 'T13_CONSTRUCTION_CONTRACTOR') {
      assignedId = options.contractorId || adminId;
      assignedName = options.contractorId ? (options.contractorName || 'Contractor') : adminName;
      assignedRole = options.contractorId ? 'CONTRACTOR' : deskRole;
    }
    // the reviewer of a duty: the platform desk when one is given, otherwise the OTHER broker of the deal
    const reviewerId = desk ? adminId : (assignedId === options.introducingBrokerId ? options.closingBrokerId : options.introducingBrokerId);

    const isConstructionApplicable =
      options.propertyType === 'Industrial Plot' ||
      options.propertyType === 'Residential Villa' ||
      options.propertyType === 'Commercial Office';

    const isApplicable = def.key !== 'T13_CONSTRUCTION_CONTRACTOR' || isConstructionApplicable;

    tasks.push({
      id: taskId,
      dealId,
      taskKey: def.key,
      title: def.title,
      description: def.description,
      category: def.category,
      isApplicable,
      notApplicableReason: isApplicable ? undefined : 'No immediate construction or renovation scope requested by buyer for ready flat.',
      assignedParticipantId: assignedId,
      assignedParticipantRole: assignedRole,
      assignedParticipantName: assignedName,
      assignmentAcceptance: 'ACCEPTED',
      acceptedAt: now.toISOString(),
      acceptedBy: assignedId,
      responsibleParticipantId: assignedId,
      supportingParticipantIds: [options.introducingBrokerId, options.closingBrokerId].filter(id => id !== assignedId),
      reviewingParticipantId: reviewerId,
      dueDate,
      taskStatus: i === 0 ? 'COMPLETED' : i <= 3 ? 'IN_PROGRESS' : 'NOT_STARTED',
      completionTimestamp: i === 0 ? new Date(now.getTime() - 24 * 3600000).toISOString() : undefined,
      completionNote: i === 0 ? 'Lead qualified and verified introduction logged on platform.' : undefined,
      evidenceAttachments: i === 0 ? [
        {
          id: `EV-${taskId}-1`,
          name: 'Introduction_Consent_Record.pdf',
          url: '/docs/intro_consent.pdf',
          uploadedAt: now.toISOString(),
          uploadedBy: assignedId,
        }
      ] : [],
      verificationStatus: i === 0 ? 'VERIFIED' : 'UNVERIFIED',
      verifiedBy: i === 0 ? reviewerId : undefined,
      verifiedAt: i === 0 ? now.toISOString() : undefined,
      verificationNotes: i === 0 ? (desk ? 'Initial parties and representation mandate verified by platform desk.' : 'Initial parties and representation mandate checked by the other broker of the deal.') : undefined,
      reassignmentHistory: [],
      disputeHistory: [],
    });
  }

  return tasks;
}

// ==========================================
// DUE DILIGENCE ENGINE DEFINITIONS (MODULE B)
// ==========================================

export interface DDTemplateDef {
  key: string;
  category: DueDiligenceCategory;
  title: string;
  description: string;
  applicableTypes: string[]; // ['ALL'] or specific
  requiredDocument: string;
  acceptableEvidenceDescription: string;
  verificationMethod:
    | 'DOCUMENT_CROSS_CHECK'
    | 'GOVT_PORTAL_REGISTRY'
    | 'PHYSICAL_INSPECTION'
    | 'INDEPENDENT_LEGAL_OPINION'
    | 'COURT_RECORD_SEARCH';
}

export const COMMON_DD_CHECKS: DDTemplateDef[] = [
  {
    key: 'DD_C1_OWNER_IDENTITY',
    category: 'COMMON_TITLE',
    title: 'Owner Identity & Authority to Transact',
    description: 'Verify seller Aadhaar, PAN card, Power of Attorney validity, and registered board resolution if corporate seller.',
    applicableTypes: ['ALL'],
    requiredDocument: 'Government Photo ID (Aadhaar / PAN) & Registered POA if applicable',
    acceptableEvidenceDescription: 'Verified Aadhaar QR verification slip, PAN card copy with active NSDL validation status, and registered General Power of Attorney registered at Sub-Registrar office.',
    verificationMethod: 'DOCUMENT_CROSS_CHECK',
  },
  {
    key: 'DD_C2_REGISTERED_TITLE_CHAIN',
    category: 'COMMON_TITLE',
    title: 'Current Registered Title & 30-Year Prior Title Chain',
    description: 'Verify current registered sale deed, mother deed, gift deeds, and trace chain of title transfers for preceding 30 years without gaps.',
    applicableTypes: ['ALL'],
    requiredDocument: 'Registered Sale Deed (Mool Dastavez) & Link Deeds for 30 years',
    acceptableEvidenceDescription: 'Certified copies of registered conveyance deeds from the jurisdictional Sub-Registrar records spanning 30 continuous years.',
    verificationMethod: 'INDEPENDENT_LEGAL_OPINION',
  },
  {
    key: 'DD_C3_SUCCESSION_CO_OWNERS',
    category: 'COMMON_TITLE',
    title: 'Succession, Inheritance, Co-Owner & Authorization Issues',
    description: 'Audit succession tree, legal heir certificates, mutation in revenue records, and obtain written NOC from all surviving co-owners.',
    applicableTypes: ['ALL'],
    requiredDocument: 'Family Tree Affidavit (Varisan Pramanpatra) & Co-owner NOCs',
    acceptableEvidenceDescription: 'Notarized family pedigree chart, Tahsildar legal heir certificate, and signed irrevocable consent deeds from all legal heirs.',
    verificationMethod: 'INDEPENDENT_LEGAL_OPINION',
  },
  {
    key: 'DD_C4_ENCUMBRANCE_MORTGAGE',
    category: 'COMMON_TITLE',
    title: 'Encumbrances, Mortgages, Lender Releases & Form 15/16',
    description: 'Search Sub-Registrar registry index and CERSAI portal to ensure no existing bank mortgage, equitable charge, or attachment orders.',
    applicableTypes: ['ALL'],
    requiredDocument: 'Non-Encumbrance Certificate (Bar-Mukt Pramanpatra / Form 15 & 16) & CERSAI Report',
    acceptableEvidenceDescription: 'Sub-Registrar certified encumbrance certificate (Form 15/16 or the state equivalent) covering minimum 13-30 years, and bank No Objection Certificate (NOC) if loan was previously closed.',
    verificationMethod: 'GOVT_PORTAL_REGISTRY',
  },
  {
    key: 'DD_C5_LITIGATION_DISPUTES',
    category: 'COMMON_TITLE',
    title: 'Litigation, Court Injunctions & Acquisition Notices',
    description: 'Search the e-Courts district portal, the relevant High Court records, revenue board, and National Highways/Railways acquisition notifications.',
    applicableTypes: ['ALL'],
    requiredDocument: 'Litigation Non-Involvement Affidavit & e-Courts Case Search Report',
    acceptableEvidenceDescription: 'Comprehensive search certificate from local advocate covering civil suits, partition suits, and revenue appeals concerning the property khasra.',
    verificationMethod: 'COURT_RECORD_SEARCH',
  },
  {
    key: 'DD_C6_REVENUE_TAX_RECORDS',
    category: 'REVENUE_MUNICIPAL',
    title: 'Revenue, Municipal & Property-Tax Records',
    description: 'Verify the land-record extract (Khasra/Khatauni, 7/12, Patta/Chitta, Bhulekh or the state equivalent) from the state land-records portal, and the latest municipal property-tax receipt.',
    applicableTypes: ['ALL'],
    requiredDocument: 'Computerised B-1 Khasra, P-II Khatauni & Nagar Nigam Tax Clearance Receipt',
    acceptableEvidenceDescription: 'Digitally signed land-record extract (Khasra/Khatauni, 7/12, RoR or state equivalent) from the state land-records portal dated within last 30 days and municipal assessment receipt showing zero outstanding dues.',
    verificationMethod: 'GOVT_PORTAL_REGISTRY',
  },
  {
    key: 'DD_C7_POSSESSION_BOUNDARIES',
    category: 'PHYSICAL_BOUNDARY',
    title: 'Possession, Occupancy, Boundaries & Physical Measurements',
    description: 'Conduct on-site physical demarcation, measure actual carpet/plot dimensions against deed, and check boundary walls and adjoining neighbors.',
    applicableTypes: ['ALL'],
    requiredDocument: 'Site Demarcation Report (Simankan Prativedan) & GPS Geo-tagged Inspection Photos',
    acceptableEvidenceDescription: 'Revenue Patwari demarcation panchnama or licensed surveyor report with photographic proof of boundaries and undisturbed vacant possession.',
    verificationMethod: 'PHYSICAL_INSPECTION',
  },
  {
    key: 'DD_C8_LEGAL_ACCESS_EASEMENT',
    category: 'PHYSICAL_BOUNDARY',
    title: 'Legal Access, Easements & Road Rights-of-Way',
    description: 'Verify uninterrupted motorable road access connecting property to public highway without passing through private un-notified lands.',
    applicableTypes: ['ALL'],
    requiredDocument: 'Approach Road Verification Certificate & Master Plan Access Alignment',
    acceptableEvidenceDescription: 'Municipal or PWD approved road width confirmation (minimum 20-30 ft) and absence of private easement disputes.',
    verificationMethod: 'PHYSICAL_INSPECTION',
  },
  {
    key: 'DD_C9_EXISTING_LEASES_TENANTS',
    category: 'COMMON_TITLE',
    title: 'Existing Leases, Tenants, Occupants & Third-Party Rights',
    description: 'Verify absence of protected tenants, informal caretakers, or unexpired commercial leases; obtain tenant surrender deeds if tenanted.',
    applicableTypes: ['ALL'],
    requiredDocument: 'Tenant Surrender Deed or Vacant Physical Possession Undertaking',
    acceptableEvidenceDescription: 'Affidavit from seller confirming nil third-party tenant rights or registered deed of lease termination with full refund of security deposit.',
    verificationMethod: 'DOCUMENT_CROSS_CHECK',
  },
  {
    key: 'DD_C10_UTILITIES_DUES',
    category: 'REVENUE_MUNICIPAL',
    title: 'Utilities & Outstanding Service Dues',
    description: 'Clear electricity-board bills, water-board connection charges, and society maintenance ledger statements.',
    applicableTypes: ['ALL'],
    requiredDocument: 'Latest CSPDCL Electricity Bill & Paid Receipt, Water Tax Clearance, Society NOC',
    acceptableEvidenceDescription: 'Zero-balance bill receipts from power distribution company and formal NOC from apartment society management.',
    verificationMethod: 'DOCUMENT_CROSS_CHECK',
  },
  {
    key: 'DD_C11_MATERIAL_DEFECTS_DISCLOSURE',
    category: 'PHYSICAL_BOUNDARY',
    title: 'Material Defects & Seller Disclosures',
    description: 'Document structural health, dampness, flood water logging history during monsoon, high-tension wire alignment, or pipeline right of user.',
    applicableTypes: ['ALL'],
    requiredDocument: 'Seller Disclosure Statement & Structural Fitness Certificate',
    acceptableEvidenceDescription: 'Signed disclosure form covering structural stability, overhead transmission lines, and environmental hazard disclosures.',
    verificationMethod: 'PHYSICAL_INSPECTION',
  },
  {
    key: 'DD_C12_STATUTORY_ZONING',
    category: 'STATUTORY_ZONING',
    title: 'Local Planning, Land-Use & Statutory Restrictions',
    description: 'Verify property compliance with the Master Plan / Development Plan, Town & Country Planning land zoning, and green-belt setbacks.',
    applicableTypes: ['ALL'],
    requiredDocument: 'Master Plan / Development Plan Zoning Certificate & Land Use Verification (local planning authority)',
    acceptableEvidenceDescription: 'Official extract from Town & Country Planning Directorate confirming permissible residential/commercial use.',
    verificationMethod: 'GOVT_PORTAL_REGISTRY',
  },
];

export const CONDITIONAL_DD_CHECKS: DDTemplateDef[] = [
  // Plot / Land
  {
    key: 'DD_PLOT_1_DIVERSION',
    category: 'PLOT_LAND',
    title: 'Land Classification & Sec 172 Revenue Code Diversion',
    description: 'Verify the agricultural-to-non-agricultural conversion / diversion order issued under the state Land Revenue Code by the competent revenue officer (SDO / Collector).',
    applicableTypes: ['Industrial Plot'],
    requiredDocument: 'SDO Diversion Order (Vyapvaran Aadesh) & Premium Challan Receipt',
    acceptableEvidenceDescription: 'Official diversion sanad signed by Revenue Officer with non-agricultural assessment tax receipts.',
    verificationMethod: 'GOVT_PORTAL_REGISTRY',
  },
  {
    key: 'DD_PLOT_2_LAYOUT_SANCTION',
    category: 'PLOT_LAND',
    title: 'TNCP Approved Layout & Colonizer License Sanction',
    description: 'Verify layout development approval from Director, Town & Country Planning and Municipal colonizer registration with open space relinquishment.',
    applicableTypes: ['Industrial Plot'],
    requiredDocument: 'TNCP Approved Layout Map (Blueprint) & Colonizer Registration Certificate',
    acceptableEvidenceDescription: 'Original stamped layout blueprint highlighting sanctioned plot boundaries, park reservations, and public utility transfers.',
    verificationMethod: 'DOCUMENT_CROSS_CHECK',
  },
  {
    key: 'DD_PLOT_3_SEC165_RESTRICTIONS',
    category: 'PLOT_LAND',
    title: 'Tribal / Restricted-Land Transfer Restrictions (State Land Revenue Code)',
    description: 'Audit the state land-revenue-law clauses that protect tribal / restricted lands (e.g. Sec 165 of the Chhattisgarh Land Revenue Code and its equivalents in other states) and check whether Collector permission is required for the transfer.',
    applicableTypes: ['Industrial Plot', 'Agricultural Land'],
    requiredDocument: 'Caste & Revenue Title Certificate / Collector Permission Order if applicable',
    acceptableEvidenceDescription: 'Affidavit and revenue verification that the land is not subject to alienation restrictions under the state land revenue law.',
    verificationMethod: 'INDEPENDENT_LEGAL_OPINION',
  },

  // Flat / Apartment
  {
    key: 'DD_FLAT_1_RERA_REGISTRATION',
    category: 'FLAT_APARTMENT',
    title: 'State RERA Project Registration & Quarterly Audit Status',
    description: 'Verify valid registration on the state RERA portal, project end-date compliance, and bank escrow accounts.',
    applicableTypes: ['Residential Flat', 'Penthouse'],
    requiredDocument: 'State RERA Registration Certificate & Portal Compliance Extract',
    acceptableEvidenceDescription: 'Official state RERA registration order with verification of registered promoter details and approved project plans.',
    verificationMethod: 'GOVT_PORTAL_REGISTRY',
  },
  {
    key: 'DD_FLAT_2_COMPLETION_OCCUPANCY',
    category: 'FLAT_APARTMENT',
    title: 'Sanctioned Floor Plans, Material Deviations, CC & OC',
    description: 'Verify Municipal Corporation Completion Certificate (CC) and Occupancy Certificate (OC) or architect deviation report.',
    applicableTypes: ['Residential Flat', 'Penthouse'],
    requiredDocument: 'Municipal Completion Certificate (CC) & Occupancy Certificate (OC)',
    acceptableEvidenceDescription: 'Clear Occupancy Certificate issued by the local municipal body confirming adherence to sanctioned building bye-laws.',
    verificationMethod: 'DOCUMENT_CROSS_CHECK',
  },
  {
    key: 'DD_FLAT_3_UDS_PARKING_RIGHTS',
    category: 'FLAT_APARTMENT',
    title: 'Undivided Land Share (UDS), Society NOC & Parking Allocation',
    description: 'Verify exact Undivided Land Share (UDS) percentage in parent land, alloted covered/stilt car parking bay number, and association NOC.',
    applicableTypes: ['Residential Flat', 'Penthouse'],
    requiredDocument: 'Deed of Declaration, Parking Allotment Letter & Society Transfer NOC',
    acceptableEvidenceDescription: 'Registered Apartment Owners Association letter confirming exclusive parking allotment and nil transfer fee disputes.',
    verificationMethod: 'DOCUMENT_CROSS_CHECK',
  },

  // Independent House / Villa
  {
    key: 'DD_HOUSE_1_BUILDING_PERMISSION',
    category: 'INDEPENDENT_HOUSE',
    title: 'Municipal Building Permission & Sanctioned Blueprints',
    description: 'Verify the municipal building permission letter, sanctioned floor blueprints, and setback compliance (front, rear, side yards).',
    applicableTypes: ['Residential Villa'],
    requiredDocument: 'Municipal Building Permission Order (Bhavan Anumati) & Sanctioned Architectural Drawings',
    acceptableEvidenceDescription: 'Stamped Nagar Nigam approval blueprint matching the built structure without unauthorized additional floors or encroachments.',
    verificationMethod: 'DOCUMENT_CROSS_CHECK',
  },
  {
    key: 'DD_HOUSE_2_UNAUTHORIZED_CONSTRUCTION',
    category: 'INDEPENDENT_HOUSE',
    title: 'Unauthorized Construction & Setback Deviation Audit',
    description: 'Audit physical structure for excess FAR/FSI, unauthorized cantilever balconies over public roads, or illegal basement excavations.',
    applicableTypes: ['Residential Villa'],
    requiredDocument: 'Architect As-Built Survey & Non-Violation Certificate',
    acceptableEvidenceDescription: 'Signed report from registered architect or chartered engineer confirming deviations are within 5% compounding limits.',
    verificationMethod: 'PHYSICAL_INSPECTION',
  },

  // Commercial Property
  {
    key: 'DD_COMM_1_ZONING_FIRE_APPROVAL',
    category: 'COMMERCIAL_UNIT',
    title: 'Permitted Commercial Use, Fire NOC & Operating Clearances',
    description: 'Verify Master Plan commercial strip classification, the state Fire & Emergency Services NOC, and high-rise safety clearances.',
    applicableTypes: ['Commercial Office', 'Commercial Shop'],
    requiredDocument: 'Commercial Land-Use Sanad, Fire Department NOC & Structural Stability Certificate',
    acceptableEvidenceDescription: 'Valid Fire NOC issued by the state Fire & Emergency Services authority and the municipal trade / commercial assessment.',
    verificationMethod: 'GOVT_PORTAL_REGISTRY',
  },
  {
    key: 'DD_COMM_2_COMMERCIAL_LEASES_LICENSES',
    category: 'COMMERCIAL_UNIT',
    title: 'Commercial Leases, Security Deposits & Power Sanction',
    description: 'Verify existing registered lease agreements, security deposit escrow status, Lock-in period compliance, and 3-phase high-tension power sanction.',
    applicableTypes: ['Commercial Office', 'Commercial Shop'],
    requiredDocument: 'Registered Lease Agreement, Rent Roll Ledger & CSPDCL HT/LT Sanction Letter',
    acceptableEvidenceDescription: 'Certified copies of commercial tenant contracts and load demand sanction certificate from electricity board.',
    verificationMethod: 'DOCUMENT_CROSS_CHECK',
  },

  // Agricultural Land
  {
    key: 'DD_AGRI_1_KISAN_RIN_PUSTIKA',
    category: 'AGRICULTURAL_LAND',
    title: 'Land Ownership Records, Revenue Records & Ceiling Limits',
    description: 'Verify the original land-ownership records (Kisan Rin Pustika / Pass Book / RoR), the seller holding against the state land-ceiling law, and check for surplus-land vesting notices.',
    applicableTypes: ['Agricultural Land'],
    requiredDocument: 'Original Kisan Rin Pustika, 12-Year Revenue Record (Pahat) & Ceiling Non-Involvement Affidavit',
    acceptableEvidenceDescription: 'Current year computerized Patwari entries and SDO clearance certifying holding is within legal non-tribal ceiling limits.',
    verificationMethod: 'GOVT_PORTAL_REGISTRY',
  },
  {
    key: 'DD_AGRI_2_WATER_IRRIGATION_RIGHTS',
    category: 'AGRICULTURAL_LAND',
    title: 'Tenancy Rights, Actual Physical Possession & Water Rights',
    description: 'Verify tube-well / borewell registration, irrigation canal water rights (Sinchan Vibhag), absence of protected shikmi tenants, and boundary beacons.',
    applicableTypes: ['Agricultural Land'],
    requiredDocument: 'Irrigation Department Clearance (Sinchan Parchi) & Tube-Well Electricity Bill',
    acceptableEvidenceDescription: 'Inspection panchnama signed by 5 adjoining farmers confirming peaceful cultivation and undisputed possession.',
    verificationMethod: 'PHYSICAL_INSPECTION',
  },
];

export function generateDueDiligenceItems(
  propertyId: string,
  propertyType: string,
  options?: { dealId?: string; verifierId?: string; verifierRole?: string }
): DueDiligenceChecklistItem[] {
  const items: DueDiligenceChecklistItem[] = [];
  const now = new Date().toISOString();

  // 1. Add all 12 Common checks
  COMMON_DD_CHECKS.forEach((def, index) => {
    const itemId = `DD-${propertyId.replace('PROP-', '')}-C${String(index + 1).padStart(2, '0')}`;
    items.push({
      id: itemId,
      propertyId,
      dealId: options?.dealId,
      templateVersion: 1,
      category: def.category,
      itemKey: def.key,
      title: def.title,
      description: def.description,
      propertyTypeApplicability: def.applicableTypes,
      isApplicable: true,
      responsibleVerifierId: options?.verifierId || 'PLATFORM-DESK',
      responsibleVerifierRole: options?.verifierRole || 'LEGAL_COUNSEL',
      status: 'NOT_STARTED',
      approvalStage: 'NONE',
      requiredDocument: def.requiredDocument,
      acceptableEvidenceDescription: def.acceptableEvidenceDescription,
      evidenceReferences: [],
      verificationMethod: def.verificationMethod,
      comments: [],
      auditHistory: [
        {
          action: 'ITEM_INITIALIZED',
          performedBy: options?.verifierId || 'SYSTEM',
          timestamp: now,
          details: `Due diligence checklist item created under baseline template v1`,
        },
      ],
    });
  });

  // 2. Add Conditional checks for this property type
  CONDITIONAL_DD_CHECKS.forEach((def, index) => {
    const isApplicable = def.applicableTypes.includes(propertyType) || def.applicableTypes.includes('ALL');
    const itemId = `DD-${propertyId.replace('PROP-', '')}-T${String(index + 1).padStart(2, '0')}`;
    items.push({
      id: itemId,
      propertyId,
      dealId: options?.dealId,
      templateVersion: 1,
      category: def.category,
      itemKey: def.key,
      title: def.title,
      description: def.description,
      propertyTypeApplicability: def.applicableTypes,
      isApplicable,
      notApplicableReason: isApplicable ? undefined : `Property type "${propertyType}" is exempt from this check category.`,
      responsibleVerifierId: options?.verifierId || 'PLATFORM-DESK',
      responsibleVerifierRole: options?.verifierRole || 'LEGAL_COUNSEL',
      status: isApplicable ? 'NOT_STARTED' : 'NOT_APPLICABLE',
      approvalStage: 'NONE',
      requiredDocument: def.requiredDocument,
      acceptableEvidenceDescription: def.acceptableEvidenceDescription,
      evidenceReferences: [],
      verificationMethod: def.verificationMethod,
      comments: [],
      auditHistory: [
        {
          action: 'ITEM_INITIALIZED',
          performedBy: options?.verifierId || 'SYSTEM',
          timestamp: now,
          details: `Conditional check initialized. Applicable: ${isApplicable}`,
        },
      ],
    });
  });

  return items;
}

// Transaction Readiness Calculator (Module B6)
export function calculateTransactionReadiness(
  dealId: string,
  propertyId: string,
  ddItems: DueDiligenceChecklistItem[],
  issues: DueDiligenceIssue[],
  tasks: DealTask[],
  context: {
    legal?: { name?: string; barRegistration?: string };
    coordinator?: { id: string; name: string; role: string };
  } = {}
): TransactionReadinessReport {
  const legal = context.legal;
  const applicableItems = ddItems.filter((i) => i.propertyId === propertyId && i.isApplicable);
  const totalItems = applicableItems.length;
  const verifiedCount = applicableItems.filter((i) => i.status === 'VERIFIED').length;
  const pendingCount = applicableItems.filter(
    (i) => i.status === 'NOT_STARTED' || i.status === 'PENDING_DOCUMENT' || i.status === 'UNDER_REVIEW'
  ).length;
  const waivedCount = ddItems.filter((i) => i.propertyId === propertyId && !i.isApplicable).length;

  const percentage = totalItems > 0 ? Math.round((verifiedCount / totalItems) * 100) : 0;

  // Unresolved and open critical/high issues
  const dealIssues = issues.filter(
    (iss) => (iss.propertyId === propertyId || iss.dealId === dealId) && iss.status !== 'RESOLVED'
  );
  const criticalIssues = dealIssues.filter((iss) => iss.severity === 'CRITICAL');

  const pendingDocs: string[] = [];
  applicableItems.forEach((item) => {
    if (item.status === 'PENDING_DOCUMENT' || item.status === 'NOT_STARTED') {
      pendingDocs.push(`${item.title}: ${item.requiredDocument}`);
    }
  });

  // Check legal review signoff
  const titleReviewItem = applicableItems.find((i) => i.itemKey === 'DD_C2_REGISTERED_TITLE_CHAIN');
  const legalApproved =
    titleReviewItem &&
    (titleReviewItem.approvalStage === 'LEGAL_REVIEW_COMPLETED' ||
      titleReviewItem.approvalStage === 'READINESS_APPROVED') &&
    titleReviewItem.status === 'VERIFIED';

  // Check task acceptance
  const dealTasks = tasks.filter((t) => t.dealId === dealId && t.isApplicable);
  const acceptedTasks = dealTasks.filter((t) => t.assignmentAcceptance === 'ACCEPTED');
  const completedTasks = dealTasks.filter((t) => t.taskStatus === 'COMPLETED');
  const verifiedTasks = dealTasks.filter((t) => t.verificationStatus === 'VERIFIED');
  const allResponsibilitiesAccepted = dealTasks.length > 0 && acceptedTasks.length === dealTasks.length;

  const blockers: string[] = [];
  if (criticalIssues.length > 0) {
    blockers.push(`Blocked by ${criticalIssues.length} unresolved CRITICAL due diligence issue(s).`);
  }
  if (!legalApproved) {
    blockers.push('Formal legal title review & opinion by qualified advocate is pending.');
  }
  if (percentage < 70) {
    blockers.push(`Overall due diligence completion is only ${percentage}% (minimum 70% required for registry scheduling).`);
  }
  if (!allResponsibilitiesAccepted) {
    blockers.push('Pending acceptance of task responsibilities by one or more participants in the Deal Room.');
  }

  const isReady = blockers.length === 0;

  return {
    id: `REP-${dealId}-${Date.now().toString().slice(-6)}`,
    dealId,
    propertyId,
    generatedAt: new Date().toISOString(),
    generatedBy: 'GENZ Central Verification Engine',
    checklistCompletion: {
      totalItems,
      verifiedCount,
      pendingCount,
      waivedCount,
      percentage,
    },
    criticalIssuesCount: criticalIssues.length,
    unresolvedExceptions: dealIssues.map((iss) => ({
      title: iss.title,
      severity: iss.severity,
      status: iss.status,
      description: iss.description,
    })),
    pendingDocuments: pendingDocs.slice(0, 5),
    legalReviewerDetails: {
      name: legal?.name || 'Not yet assigned',
      barRegistration: legal?.barRegistration || 'Not provided',
      legalOpinionStatus: legalApproved
        ? 'TITLE_CLEAR_MARKETABLE'
        : criticalIssues.length > 0
        ? 'DEFECT_FOUND'
        : 'PENDING_OPINION',
      signedAt: legalApproved ? new Date().toISOString() : undefined,
    },
    approvedResponsibilities: {
      totalTasks: dealTasks.length,
      completedTasks: completedTasks.length,
      verifiedTasks: verifiedTasks.length,
      allResponsibilitiesAccepted,
    },
    registryCoordinationOwner: context.coordinator ?? { id: '', name: 'Not assigned', role: '' },
    // Stage checklist only — amounts are agreed between buyer and seller, never invented by the platform.
    paymentHandoverMilestones: [
      { trigger: 'Token / Bayana Agreement Execution', isMet: acceptedTasks.length > 0 },
      { trigger: 'Legal Title Clearance & Bank NOC', isMet: legalApproved || false },
      { trigger: 'Registration Appointment & Deed Execution', isMet: false },
      { trigger: 'Physical Key Handover & Utility Meter Transfer', isMet: false },
    ],
    isReadyForRegistry: isReady,
    blockers,
    statutoryDisclaimer:
      'CONFIDENTIAL WORKFLOW REPORT: Platform verification is an internal risk assessment mechanism and does not constitute a statutory government title guarantee, judicial certification, or substitute for registered deed vetting by an independent advocate.',
  };
}
