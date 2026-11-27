/**
 * Indian Real Estate Taxation & Regulatory Compliance Engine
 * Covers:
 *  - Section 194-IA TDS (1% deduction on property deals >= ₹50 Lakhs via Form 26QB)
 *  - GST on Brokerage (18% tax invoice with CGST/SGST/IGST breakdown)
 *  - GST on Property Construction (1% affordable, 5% standard under-construction, 0% CC/ready-to-move, 0% plots)
 *  - State-wise Stamp Duty & Registration Charges across major Indian states
 */

export interface TdsResult {
  applicable: boolean;
  threshold: number; // ₹50,00,000
  ratePct: number;   // 1%
  tdsAmount: number;
  sellerNetReceivable: number;
  formType: 'Form 26QB';
  dueDays: number;   // 30 days from end of month
  legalNotice: string;
}

export function calculateTds194IA(propertyPrice: number): TdsResult {
  const THRESHOLD = 5000000; // ₹50 Lakhs
  const applicable = propertyPrice >= THRESHOLD;
  const ratePct = applicable ? 1 : 0;
  const tdsAmount = applicable ? Math.round(propertyPrice * 0.01) : 0;
  const sellerNetReceivable = propertyPrice - tdsAmount;

  return {
    applicable,
    threshold: THRESHOLD,
    ratePct,
    tdsAmount,
    sellerNetReceivable,
    formType: 'Form 26QB',
    dueDays: 30,
    legalNotice: applicable
      ? 'Mandatory 1% TDS under Section 194-IA of the Income Tax Act must be deducted by the buyer before making payment to the seller. File Form 26QB within 30 days of the end of the month.'
      : 'Property consideration is below ₹50,00,000. TDS under Section 194-IA is not applicable.',
  };
}

export interface BrokerageGstResult {
  baseAmount: number;
  gstPct: number; // 18%
  gstAmount: number;
  totalWithGst: number;
  isInterState: boolean;
  cgst: number;
  sgst: number;
  igst: number;
  sacCode: string; // Real Estate Agent Services SAC 997222
}

export function calculateBrokerageGst(
  brokerageAmount: number,
  isInterState = false
): BrokerageGstResult {
  const base = Math.max(0, brokerageAmount || 0);
  const gstPct = 18;
  const gstAmount = Math.round((base * gstPct) / 100);
  const totalWithGst = base + gstAmount;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (isInterState) {
    igst = gstAmount;
  } else {
    cgst = Math.round(gstAmount / 2);
    sgst = gstAmount - cgst;
  }

  return {
    baseAmount: base,
    gstPct,
    gstAmount,
    totalWithGst,
    isInterState,
    cgst,
    sgst,
    igst,
    sacCode: '997222', // SAC code for Real Estate Brokerage / Agency
  };
}

export interface PropertyGstResult {
  ratePct: number;
  gstAmount: number;
  category: 'READY_TO_MOVE' | 'AFFORDABLE_UNDER_CONSTRUCTION' | 'STANDARD_UNDER_CONSTRUCTION' | 'LAND_PLOT';
  explanation: string;
}

export function calculatePropertyGst(params: {
  price: number;
  propertyType: string;
  isUnderConstruction: boolean;
  hasCompletionCertificate?: boolean;
  carpetAreaSqFt?: number;
  isMetroCity?: boolean;
}): PropertyGstResult {
  const { price, propertyType, isUnderConstruction, hasCompletionCertificate, carpetAreaSqFt, isMetroCity } = params;

  const isPlot = /plot|land/i.test(propertyType);
  if (isPlot) {
    return {
      ratePct: 0,
      gstAmount: 0,
      category: 'LAND_PLOT',
      explanation: 'Sale of land/plots is outside the scope of GST (Schedule III of CGST Act). 0% GST applicable.',
    };
  }

  if (!isUnderConstruction || hasCompletionCertificate) {
    return {
      ratePct: 0,
      gstAmount: 0,
      category: 'READY_TO_MOVE',
      explanation: 'Ready-to-move-in property with Completion Certificate (CC) has 0% GST (Schedule III).',
    };
  }

  // Affordable housing criteria: price <= ₹45 Lakhs AND carpet area <= 60 sqm (645 sqft) in metro or 90 sqm (968 sqft) in non-metro
  const maxAffordableSqFt = isMetroCity ? 645 : 968;
  const isAffordable = price <= 4500000 && (!carpetAreaSqFt || carpetAreaSqFt <= maxAffordableSqFt);

  if (isAffordable) {
    const gstAmount = Math.round(price * 0.01);
    return {
      ratePct: 1,
      gstAmount,
      category: 'AFFORDABLE_UNDER_CONSTRUCTION',
      explanation: 'Affordable Housing Project under construction: 1% GST effective rate without Input Tax Credit (ITC).',
    };
  }

  const gstAmount = Math.round(price * 0.05);
  return {
    ratePct: 5,
    gstAmount,
    category: 'STANDARD_UNDER_CONSTRUCTION',
    explanation: 'Standard residential property under construction: 5% GST effective rate without Input Tax Credit (ITC).',
  };
}

export interface StampDutyResult {
  state: string;
  stampDutyPct: number;
  stampDutyAmount: number;
  registrationPct: number;
  registrationAmount: number;
  cessPct: number;
  cessAmount: number;
  totalGovernmentCharges: number;
  buyerRebateApplied?: string;
}

/**
 * State-wise Indian Stamp Duty and Registration Calculator
 */
export function calculateStampDuty(
  stateName: string,
  price: number,
  buyerGender: 'MALE' | 'FEMALE' | 'JOINT' = 'MALE',
  isUrban = true
): StampDutyResult {
  const norm = (stateName || '').trim().toLowerCase();
  let stampPct = 5;
  let regPct = 1;
  let cessPct = 0;
  let regCap: number | null = null;
  let rebateNote: string | undefined = undefined;

  if (norm.includes('maharashtra') || norm.includes('mumbai') || norm.includes('pune')) {
    stampPct = buyerGender === 'FEMALE' ? 5 : 6; // 5% base + 1% metro cess; 1% female concession on residential
    if (buyerGender === 'FEMALE') rebateNote = '1% female buyer concession applied';
    regPct = 1;
    regCap = 30000; // Capped at ₹30,000 for residential purchase in Maharashtra
    cessPct = 1; // 1% Metro Cess / LBT
  } else if (norm.includes('delhi')) {
    if (buyerGender === 'FEMALE') {
      stampPct = 4;
      rebateNote = '2% female buyer concession applied (4% vs 6%)';
    } else if (buyerGender === 'JOINT') {
      stampPct = 5;
      rebateNote = '1% joint buyer concession applied (5% vs 6%)';
    } else {
      stampPct = 6;
    }
    regPct = 1;
  } else if (norm.includes('karnataka') || norm.includes('bangalore') || norm.includes('bengaluru')) {
    stampPct = price <= 4500000 ? 3 : 5;
    cessPct = 0.6; // 10% cess + 2% surcharge on stamp duty = 0.6%
    regPct = 1;
  } else if (norm.includes('uttar pradesh') || norm.includes('up') || norm.includes('noida') || norm.includes('lucknow')) {
    stampPct = 7;
    if (buyerGender === 'FEMALE') {
      rebateNote = '₹10,000 female buyer rebate applied on stamp duty';
    }
    regPct = 1;
  } else if (norm.includes('haryana') || norm.includes('gurgaon') || norm.includes('gurugram')) {
    if (isUrban) {
      stampPct = buyerGender === 'FEMALE' ? 5 : 7;
      if (buyerGender === 'FEMALE') rebateNote = '2% female buyer concession applied (5% vs 7%)';
    } else {
      stampPct = buyerGender === 'FEMALE' ? 3 : 5;
    }
    regPct = 1;
  } else if (norm.includes('chhattisgarh') || norm.includes('raipur')) {
    stampPct = 5;
    regPct = 1;
    cessPct = 1; // Municipal development cess
  } else if (norm.includes('telangana') || norm.includes('hyderabad')) {
    stampPct = 4;
    cessPct = 1.5; // Transfer duty
    regPct = 0.5;
  } else if (norm.includes('tamil nadu') || norm.includes('chennai')) {
    stampPct = 7;
    regPct = 4;
  } else {
    // Standard default
    stampPct = buyerGender === 'FEMALE' ? 5 : 6;
    regPct = 1;
  }

  const stampDutyAmount = Math.round((price * stampPct) / 100);
  let registrationAmount = Math.round((price * regPct) / 100);
  if (regCap !== null && registrationAmount > regCap) {
    registrationAmount = regCap;
  }
  const cessAmount = Math.round((price * cessPct) / 100);
  const totalGovernmentCharges = stampDutyAmount + registrationAmount + cessAmount;

  return {
    state: stateName || 'India Standard',
    stampDutyPct: stampPct,
    stampDutyAmount,
    registrationPct: regPct,
    registrationAmount,
    cessPct,
    cessAmount,
    totalGovernmentCharges,
    buyerRebateApplied: rebateNote,
  };
}
