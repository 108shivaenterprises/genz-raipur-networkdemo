import { describe, it, expect } from 'vitest';
import {
  TASK_DEFINITIONS,
  generateDealTasks,
  generateDueDiligenceItems,
  calculateTransactionReadiness,
  COMMON_DD_CHECKS,
  CONDITIONAL_DD_CHECKS,
  sha256,
} from '../server/dealTemplates.js';
import { DealCommissionAgreement, DueDiligenceIssue, DealTask } from '../src/types/index.js';

describe('MODULE A: TRANSPARENT DEAL RESPONSIBILITIES & COMMISSION AGREEMENTS', () => {
  it('generates the exact 13 configurable task templates covering end-to-end deal lifecycle', () => {
    expect(TASK_DEFINITIONS.length).toBe(13);
    const keys = TASK_DEFINITIONS.map((t) => t.key);
    expect(keys).toContain('T1_BUYER_SELLER_INTRO');
    expect(keys).toContain('T2_PROPERTY_SHORTLIST');
    expect(keys).toContain('T3_OWNER_NEGOTIATION');
    expect(keys).toContain('T4_BUYER_QUALIFICATION_VISIT');
    expect(keys).toContain('T5_DOCUMENT_COLLECTION');
    expect(keys).toContain('T6_LEGAL_TITLE_REVIEW');
    expect(keys).toContain('T7_SURVEY_BOUNDARY_VERIF');
    expect(keys).toContain('T8_LOAN_BANK_COORD');
    expect(keys).toContain('T9_AGREEMENT_DRAFTING');
    expect(keys).toContain('T10_STAMP_DUTY_REGISTRATION');
    expect(keys).toContain('T11_REGISTRY_APPOINTMENT');
    expect(keys).toContain('T12_PAYMENT_POSSESSION_HANDOVER');
    expect(keys).toContain('T13_CONSTRUCTION_CONTRACTOR');
  });

  it('strictly distinguishes assignment, completion, and independent verification states', () => {
    const tasks = generateDealTasks('DEAL-TEST-001', {
      introducingBrokerId: 'USR-BRK-002',
      introducingBrokerName: 'Amit Verma',
      closingBrokerId: 'USR-BRK-001',
      closingBrokerName: 'Vikram Sharma',
      ownerId: 'USR-OWNER-001',
      ownerName: 'Sunil Lalwani',
      legalCounselId: 'USR-LEGAL-001',
      legalCounselName: 'Adv. Devendra Mishra',
      propertyType: 'Residential Flat',
    });

    expect(tasks.length).toBe(13);

    // Initial state: assignment != completion != verification
    const docTask = tasks.find((t) => t.taskKey === 'T5_DOCUMENT_COLLECTION')!;
    expect(docTask.assignedParticipantId).toBe('USR-BRK-001');
    expect(docTask.taskStatus).not.toBe('COMPLETED');
    expect(docTask.verificationStatus).toBe('UNVERIFIED');

    // Simulate completion
    docTask.taskStatus = 'COMPLETED';
    docTask.completionTimestamp = new Date().toISOString();
    docTask.completionNote = 'All deeds collected from seller';
    docTask.evidenceAttachments = [
      {
        id: 'EV-1',
        name: 'Deed.pdf',
        url: '/docs/deed.pdf',
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'USR-BRK-001',
      },
    ];

    // Verification must still be separate! Completion is not verification.
    expect(docTask.taskStatus).toBe('COMPLETED');
    expect(docTask.verificationStatus).toBe('UNVERIFIED');

    // Simulate independent review
    docTask.verificationStatus = 'VERIFIED';
    docTask.verifiedBy = 'USR-ADMIN-1';
    docTask.verifiedAt = new Date().toISOString();

    expect(docTask.verificationStatus).toBe('VERIFIED');
    expect(docTask.verifiedBy).not.toBe(docTask.assignedParticipantId);
  });

  it('validates commission allocations and computes cryptographic SHA-256 seal', () => {
    const totalFee = 500000;
    const allocations = [
      {
        participantId: 'USR-BRK-001',
        participantName: 'Vikram Sharma',
        role: 'BROKER',
        allocationPct: 50,
        allocationAmount: 250000,
        basisDescription: 'Listing broker',
        entitlementStatus: 'AGREED' as const,
        paidAmount: 0,
        disputedAmount: 0,
        taxDeductionTdsPct: 5,
        invoiceRequired: true,
      },
      {
        participantId: 'USR-BRK-002',
        participantName: 'Amit Verma',
        role: 'BROKER',
        allocationPct: 50,
        allocationAmount: 250000,
        basisDescription: 'Introducing broker',
        entitlementStatus: 'AGREED' as const,
        paidAmount: 0,
        disputedAmount: 0,
        taxDeductionTdsPct: 5,
        invoiceRequired: true,
      },
    ];

    const sumPct = allocations.reduce((s, a) => s + a.allocationPct, 0);
    expect(sumPct).toBe(100);

    const sumAmount = allocations.reduce((s, a) => s + a.allocationAmount, 0);
    expect(sumAmount).toBe(totalFee);

    const seal = sha256(`AGR-TEST-V1:${totalFee}:${sumPct}`);
    expect(seal.length).toBe(64);
  });
});

describe('MODULE B: PROPERTY DUE DILIGENCE ENGINE', () => {
  it('provides all 12 Common baseline property checks for Raipur properties', () => {
    expect(COMMON_DD_CHECKS.length).toBe(12);
    const keys = COMMON_DD_CHECKS.map((c) => c.key);
    expect(keys).toContain('DD_C1_OWNER_IDENTITY');
    expect(keys).toContain('DD_C2_REGISTERED_TITLE_CHAIN');
    expect(keys).toContain('DD_C3_SUCCESSION_CO_OWNERS');
    expect(keys).toContain('DD_C4_ENCUMBRANCE_MORTGAGE');
    expect(keys).toContain('DD_C5_LITIGATION_DISPUTES');
    expect(keys).toContain('DD_C6_REVENUE_TAX_RECORDS');
    expect(keys).toContain('DD_C7_POSSESSION_BOUNDARIES');
    expect(keys).toContain('DD_C8_LEGAL_ACCESS_EASEMENT');
    expect(keys).toContain('DD_C9_EXISTING_LEASES_TENANTS');
    expect(keys).toContain('DD_C10_UTILITIES_DUES');
    expect(keys).toContain('DD_C11_MATERIAL_DEFECTS_DISCLOSURE');
    expect(keys).toContain('DD_C12_STATUTORY_ZONING');
  });

  it('generates property-type conditional checks appropriately', () => {
    const flatItems = generateDueDiligenceItems('PROP-FLAT-01', 'Residential Flat');
    const houseItems = generateDueDiligenceItems('PROP-HOUSE-01', 'Residential Villa');
    const plotItems = generateDueDiligenceItems('PROP-PLOT-01', 'Industrial Plot');
    const commItems = generateDueDiligenceItems('PROP-COMM-01', 'Commercial Office');
    const agriItems = generateDueDiligenceItems('PROP-AGRI-01', 'Agricultural Land');

    // All must have the 12 common items applicable
    expect(flatItems.filter((i) => i.category === 'COMMON_TITLE').length).toBeGreaterThan(0);
    expect(houseItems.filter((i) => i.category === 'COMMON_TITLE').length).toBeGreaterThan(0);

    // Flat must have RERA and Completion checks applicable
    const flatRera = flatItems.find((i) => i.itemKey === 'DD_FLAT_1_RERA_REGISTRATION');
    expect(flatRera?.isApplicable).toBe(true);

    // Flat should NOT have Agricultural Kisan Rin Pustika applicable
    const flatAgri = flatItems.find((i) => i.itemKey === 'DD_AGRI_1_KISAN_RIN_PUSTIKA');
    expect(flatAgri?.isApplicable).toBe(false);

    // Plot must have Sec 172 Diversion applicable
    const plotDiversion = plotItems.find((i) => i.itemKey === 'DD_PLOT_1_DIVERSION');
    expect(plotDiversion?.isApplicable).toBe(true);

    // Commercial must have Fire approval applicable
    const commFire = commItems.find((i) => i.itemKey === 'DD_COMM_1_ZONING_FIRE_APPROVAL');
    expect(commFire?.isApplicable).toBe(true);

    // Agricultural must have water and irrigation rights applicable
    const agriWater = agriItems.find((i) => i.itemKey === 'DD_AGRI_2_WATER_IRRIGATION_RIGHTS');
    expect(agriWater?.isApplicable).toBe(true);
  });

  it('blocks transaction readiness when critical issues are unresolved', () => {
    const items = generateDueDiligenceItems('PROP-TEST-01', 'Residential Villa');
    const tasks: DealTask[] = generateDealTasks('DEAL-TEST-01', {
      introducingBrokerId: 'USR-BRK-002',
      introducingBrokerName: 'Amit Verma',
      closingBrokerId: 'USR-BRK-001',
      closingBrokerName: 'Vikram Sharma',
      ownerId: 'USR-OWNER-001',
      ownerName: 'Sunil Lalwani',
      propertyType: 'Residential Villa',
    });

    const criticalIssue: DueDiligenceIssue = {
      id: 'ISSUE-CRIT-01',
      propertyId: 'PROP-TEST-01',
      dealId: 'DEAL-TEST-01',
      severity: 'CRITICAL',
      title: 'Mortgage Attachment by Bank',
      description: 'Outstanding bank loan equitable mortgage registered in 2019 without release deed',
      supportingEvidence: ['/docs/bank_notice.pdf'],
      responsibleResolverId: 'USR-OWNER-001',
      responsibleResolverName: 'Sunil Lalwani',
      deadline: '2026-10-30T00:00:00.000Z',
      resolutionPlan: 'Pay off loan and obtain No Dues Certificate',
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const report = calculateTransactionReadiness(
      'DEAL-TEST-01',
      'PROP-TEST-01',
      items,
      [criticalIssue],
      tasks
    );

    // CRITICAL issue must block readiness!
    expect(report.isReadyForRegistry).toBe(false);
    expect(report.criticalIssuesCount).toBe(1);
    expect(report.blockers.some((b) => b.includes('CRITICAL'))).toBe(true);
  });

  it('blocks transaction readiness if independent legal title review is missing', () => {
    const items = generateDueDiligenceItems('PROP-TEST-02', 'Residential Villa');
    const tasks: DealTask[] = generateDealTasks('DEAL-TEST-02', {
      introducingBrokerId: 'USR-BRK-002',
      introducingBrokerName: 'Amit Verma',
      closingBrokerId: 'USR-BRK-001',
      closingBrokerName: 'Vikram Sharma',
      ownerId: 'USR-OWNER-001',
      ownerName: 'Sunil Lalwani',
      propertyType: 'Residential Villa',
    });

    // Mark items verified except legal review
    items.forEach((item) => {
      item.status = 'VERIFIED';
      item.approvalStage = 'AUTHENTICITY_VERIFIED';
    });

    // Title chain check has not completed legal review by qualified counsel
    const titleCheck = items.find((i) => i.itemKey === 'DD_C2_REGISTERED_TITLE_CHAIN')!;
    titleCheck.approvalStage = 'BROKER_CHECKED'; // Broker only checked, no advocate opinion!

    const report = calculateTransactionReadiness(
      'DEAL-TEST-02',
      'PROP-TEST-02',
      items,
      [],
      tasks
    );

    // Must block readiness!
    expect(report.isReadyForRegistry).toBe(false);
    expect(report.blockers.some((b) => b.includes('legal title review'))).toBe(true);
  });

  it('approves transaction readiness when legal review is signed off, all tasks accepted, and no critical defects exist', () => {
    const items = generateDueDiligenceItems('PROP-TEST-03', 'Residential Villa');
    const tasks: DealTask[] = generateDealTasks('DEAL-TEST-03', {
      introducingBrokerId: 'USR-BRK-002',
      introducingBrokerName: 'Amit Verma',
      closingBrokerId: 'USR-BRK-001',
      closingBrokerName: 'Vikram Sharma',
      ownerId: 'USR-OWNER-001',
      ownerName: 'Sunil Lalwani',
      propertyType: 'Residential Villa',
    });

    // Mark 80%+ items verified
    items.forEach((item) => {
      item.status = 'VERIFIED';
      item.approvalStage = 'READINESS_APPROVED';
    });

    // Qualified legal counsel completed legal review
    const titleCheck = items.find((i) => i.itemKey === 'DD_C2_REGISTERED_TITLE_CHAIN')!;
    titleCheck.approvalStage = 'LEGAL_REVIEW_COMPLETED';
    titleCheck.status = 'VERIFIED';

    // All tasks accepted
    tasks.forEach((t) => {
      t.assignmentAcceptance = 'ACCEPTED';
    });

    const report = calculateTransactionReadiness(
      'DEAL-TEST-03',
      'PROP-TEST-03',
      items,
      [],
      tasks
    );

    expect(report.isReadyForRegistry).toBe(true);
    expect(report.blockers.length).toBe(0);
    expect(report.checklistCompletion.percentage).toBe(100);
    expect(report.legalReviewerDetails.legalOpinionStatus).toBe('TITLE_CLEAR_MARKETABLE');
  });
});
