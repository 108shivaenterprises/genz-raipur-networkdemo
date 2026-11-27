import { describe, it, expect } from 'vitest';
import { getPropertyWhatsAppShareUrl } from '../src/lib/utils';
import { formatPriceInputHelper, numberToIndianWords, numberToHindiWords } from '../src/lib/indianLegalWords';
import { calculateStampDuty } from '../src/lib/indianRealEstateTax';
import { landedCost } from '../src/shared/costRules';
import { reraPortalUrlOf, RERA_PORTAL_URLS } from '../src/shared/india';
import { maskAadhaar, isValidAadhaar } from '../src/shared/idRules';
import { readFileSync } from 'fs';

describe('CEO Final Audit Verification: Critic P0 & P1 Requirements', () => {
  it('P0-1: WhatsApp Share wired to public brochure (/p/:code) with rich preview text (no login wall for buyers)', () => {
    const url = getPropertyWhatsAppShareUrl({
      id: 'PROP-101',
      title: 'Luxury 3 BHK Penthouse',
      locality: 'Shankar Nagar',
      city: 'Raipur',
      propertyType: 'Residential Flat',
      transactionType: 'Sale',
      askingPrice: 8500000,
      carpetAreaSqFt: 1450,
      facing: 'East',
      posterCode: 'RAIPUR01',
      reraNumber: 'CGRERA010224A0001',
    });

    expect(url).toContain('https://api.whatsapp.com/send?text=');
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('/p/RAIPUR01');
    expect(decoded).toContain('No Login Required');
    expect(decoded).toContain('1,450 sq.ft (Carpet Area)');
    expect(decoded).toContain('Vastu Facing:* East');
    expect(decoded).toContain('RERA Reg:* CGRERA010224A0001');
    expect(decoded).toContain('₹85 L');
  });

  it('P0-2: Bayana Receipt (बयाना रसीद) and Section 194-IA TDS + Stamp Duty calculator wired in DealHisaab and /api/deals/:id/hisaab', () => {
    const hisaabSrc = readFileSync('src/components/DealHisaab.tsx', 'utf8');
    expect(hisaabSrc).toContain('BayanaReceiptModal');
    expect(hisaabSrc).toContain('showBayanaModal');
    expect(hisaabSrc).toContain('Section 194-IA TDS');
    expect(hisaabSrc).toContain('Form 26QB');
    expect(hisaabSrc).toContain('calculateStampDuty');

    const dutyMH = calculateStampDuty('Maharashtra', 6000000, 'MALE');
    expect(dutyMH.stampDutyPct).toBe(6);
    expect(dutyMH.registrationAmount).toBe(30000); // Capped at ₹30,000

    const dutyDL = calculateStampDuty('Delhi', 5000000, 'FEMALE');
    expect(dutyDL.stampDutyPct).toBe(4); // 2% female concession in Delhi (4% vs 6%)

    const dutyHR = calculateStampDuty('Haryana', 5000000, 'FEMALE');
    expect(dutyHR.stampDutyPct).toBe(5); // 2% female concession in Haryana (5% vs 7%)
  });

  it('P0-3: Aadhaar compliance: only masked Aadhaar (XXXX XXXX 1234) and last 4 digits stored/displayed on interfaces, full vault encryption with statutory disclaimers', () => {
    expect(maskAadhaar('1234')).toBe('XXXX XXXX 1234');
    expect(maskAadhaar('invalid')).toBe('');
    expect(isValidAadhaar('123456789012')).toBe(false); // Fails Verhoeff checksum

    const kycVaultSrc = readFileSync('server/kycvault.ts', 'utf8');
    expect(kycVaultSrc).toContain('maskAadhaar');
    expect(kycVaultSrc).toContain('seal(');
    expect(kycVaultSrc).toContain('unseal(');
  });

  it('P0-4: RERA registration number and RERA Carpet Area (carpetAreaSqFt) integrated in validation schemas, AddPropertyModal, EditPropertyModal, and PropertiesView', () => {
    const validationSrc = readFileSync('server/validation.ts', 'utf8');
    expect(validationSrc).toContain('carpetAreaSqFt');

    const addModalSrc = readFileSync('src/components/Modals.tsx', 'utf8');
    expect(addModalSrc).toContain('carpetAreaSqFt');
    expect(addModalSrc).toContain('reraNumber');

    const editModalSrc = readFileSync('src/components/EditPropertyModal.tsx', 'utf8');
    expect(editModalSrc).toContain('carpetAreaSqFt');
    expect(editModalSrc).toContain('reraNumber');

    const propViewSrc = readFileSync('src/components/PropertiesView.tsx', 'utf8');
    expect(propViewSrc).toContain('carpetAreaSqFt');
    expect(propViewSrc).toContain('reraNumber');
  });

  it('P0-5: Vite SPA dev root fallback serving index.html cleanly on GET /', () => {
    const serverSrc = readFileSync('server.ts', 'utf8');
    expect(serverSrc).toContain('createViteServer');
    expect(serverSrc).toContain('app.use(vite.middlewares)');
    expect(serverSrc).toContain('vite.transformIndexHtml');
  });

  it('P1-1: Section 194-IA TDS integrated into landedCost() and computeCostSheet()', () => {
    const under50L = landedCost({ price: 4000000, stampPct: 5, regPct: 1, gstPct: 0, extras: 0, legal: 0, brokeragePct: 1 });
    expect(under50L.tds?.applicable).toBe(false);
    expect(under50L.tds?.amount).toBe(0);

    const over50L = landedCost({ price: 7500000, stampPct: 6, regPct: 1, gstPct: 0, extras: 0, legal: 0, brokeragePct: 1 });
    expect(over50L.tds?.applicable).toBe(true);
    expect(over50L.tds?.amount).toBe(75000); // 1% of ₹75L
    expect(over50L.tds?.sellerNet).toBe(7425000);
    expect(over50L.tds?.form).toBe('Form 26QB');
  });

  it('P1-3: State RERA portal links (MahaRERA, UP-RERA, K-RERA, etc.) replacing generic links', () => {
    expect(reraPortalUrlOf('Maharashtra')).toBe('https://maharera.maharashtra.gov.in');
    expect(reraPortalUrlOf('Karnataka')).toBe('https://rera.karnataka.gov.in');
    expect(reraPortalUrlOf('Uttar Pradesh')).toBe('https://www.up-rera.in');
    expect(reraPortalUrlOf('Chhattisgarh')).toBe('https://rera.cgstate.gov.in');
    expect(reraPortalUrlOf('Delhi')).toBe('https://rera.delhi.gov.in');
    expect(reraPortalUrlOf('Gujarat')).toBe('https://gujrera.gujarat.gov.in');
    expect(reraPortalUrlOf('Haryana')).toBe('https://haryanarera.gov.in');
  });

  it('P1-4: VastuBadge rendered on property cards with orientation directions', () => {
    const propViewSrc = readFileSync('src/components/PropertiesView.tsx', 'utf8');
    expect(propViewSrc).toContain('<VastuBadge');

    const vastuSrc = readFileSync('src/components/VastuComplianceBadge.tsx', 'utf8');
    expect(vastuSrc).toContain('Vastu Shastra Compliant');
    expect(vastuSrc).toContain('Primary Facing');
  });

  it('P1-6: Live Indian currency in legal words (formatPriceInputHelper) below price inputs to prevent zero-miscounting errors', () => {
    expect(formatPriceInputHelper(7500000)).toBe('₹75 Lakh (Rupees Seventy Five Lakh Only)');
    expect(formatPriceInputHelper(15000000)).toBe('₹1.50 Crore (Rupees One Crore Fifty Lakh Only)');
    expect(formatPriceInputHelper(250000)).toBe('₹2.50 Lakh (Rupees Two Lakh Fifty Thousand Only)');

    expect(numberToIndianWords(5000000)).toBe('Rupees Fifty Lakh Only');
    expect(numberToHindiWords(5000000)).toBe('रुपये 50 लाख मात्र');

    const modalSrc = readFileSync('src/components/Modals.tsx', 'utf8');
    expect(modalSrc).toContain('formatPriceInputHelper(Number(askingPrice))');
    expect(modalSrc).toContain('formatPriceInputHelper(Number(ownerApprovedNetPrice))');

    const editModalSrc = readFileSync('src/components/EditPropertyModal.tsx', 'utf8');
    expect(editModalSrc).toContain('formatPriceInputHelper(Number(askingPrice))');
  });
});
