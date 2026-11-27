import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { numberToIndianWords, numberToHindiWords } from '../src/lib/indianLegalWords.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

describe('v199 · State-Adaptive Legal Drafts Suite', () => {
  describe('Documentation & Statutory Matrix', () => {
    it('contains comprehensive legal template suite markdown with state matrix', () => {
      const docPath = path.join(ROOT, 'docs/legal-templates/INDIAN_REAL_ESTATE_LEGAL_TEMPLATES_SUITE.md');
      expect(existsSync(docPath)).toBe(true);

      const docContent = readFileSync(docPath, 'utf8');
      expect(docContent).toContain('Agreement to Sell');
      expect(docContent).toContain('Leave & License');
      expect(docContent).toContain('Commercial Shop & Office Lease Agreement');
      expect(docContent).toContain('Plot & Land Sale Agreement');
      expect(docContent).toContain('Exclusive Broker Mandate & Anti-Bypass Agreement');
      expect(docContent).toContain('Instant 1-Page Token / Bayana Digital Receipt');

      // State specific laws
      expect(docContent).toContain('Maharashtra Rent Control Act, 1999');
      expect(docContent).toContain('Transfer of Property Act, 1882');
      expect(docContent).toContain('SECTION 194-IA');
      expect(docContent).toContain('Khasra No.');
      expect(docContent).toContain('7/12 (Saat-Baara) Utara');
      expect(docContent).toContain('RTC (Pahani)');
    });
  });

  describe('Legal Words Conversion (Number to Words)', () => {
    it('converts amounts to legal Indian English words', () => {
      expect(numberToIndianWords(7200000)).toBe('Rupees Seventy Two Lakh Only');
      expect(numberToIndianWords(50000)).toBe('Rupees Fifty Thousand Only');
      expect(numberToIndianWords(15000000)).toBe('Rupees One Crore Fifty Lakh Only');
      expect(numberToIndianWords(0)).toBe('Rupees Zero Only');
    });

    it('converts amounts to legal Hindi words', () => {
      expect(numberToHindiWords(7200000)).toBe('रुपये 72 लाख मात्र');
      expect(numberToHindiWords(50000)).toBe('रुपये 50 हज़ार मात्र');
      expect(numberToHindiWords(15000000)).toBe('रुपये 1 करोड़ 50 लाख मात्र');
      expect(numberToHindiWords(0)).toBe('रुपये शून्य मात्र');
    });
  });

  describe('LegalDraftModal Component Architecture', () => {
    const modalPath = path.join(ROOT, 'src/components/LegalDraftModal.tsx');
    const modalSrc = readFileSync(modalPath, 'utf8');

    it('supports all 6 agreement types', () => {
      expect(modalSrc).toContain("'RESALE_FLAT_HOUSE'");
      expect(modalSrc).toContain("'PLOT_LAND'");
      expect(modalSrc).toContain("'RENT_11M'");
      expect(modalSrc).toContain("'COMMERCIAL_LEASE'");
      expect(modalSrc).toContain("'BROKER_MANDATE'");
      expect(modalSrc).toContain("'BAYANA_RECEIPT'");
    });

    it('supports all required state jurisdictions with revenue terminology switching', () => {
      expect(modalSrc).toContain("'CG_MP'");
      expect(modalSrc).toContain("'MH'");
      expect(modalSrc).toContain("'DL_UP'");
      expect(modalSrc).toContain("'KA'");
      expect(modalSrc).toContain("'PAN_INDIA'");

      // Revenue terminology switching
      expect(modalSrc).toContain('Khasra No. & Diversion');
      expect(modalSrc).toContain('7/12 Survey No. & CTS No.');
      expect(modalSrc).toContain('Khasra / Khatauni / Lal Dora');
      expect(modalSrc).toContain('RTC (Pahani) & e-Khata PID');
    });

    it('implements 4.5 inch non-judicial physical stamp margin toggle', () => {
      expect(modalSrc).toContain('data-testid="stamp-margin-toggle"');
      expect(modalSrc).toContain('4.5" Stamp Margin Active');
      expect(modalSrc).toContain('Non-Judicial Stamp Paper');
    });

    it('enforces statutory compliance clauses (TDS, Rent Control, Broker Protection)', () => {
      // 1% TDS under Section 194-IA
      expect(modalSrc).toContain('Section 194-IA (1% TDS Compliance)');
      expect(modalSrc).toContain('1% TDS as mandated by Income Tax laws');

      // Maharashtra Rent Control Act 1999
      expect(modalSrc).toContain('Maharashtra Rent Control Act, 1999');

      // Broker protection anti-bypass tail period
      expect(modalSrc).toContain('180-Day Cooling / Tail Period');
      expect(modalSrc).toContain('Anti-Circumvention (Non-Bypass)');
    });

    it('includes essential testids for automated testing and user interaction', () => {
      expect(modalSrc).toContain('data-testid="legal-draft-modal"');
      expect(modalSrc).toContain('data-testid="print-draft-btn"');
      expect(modalSrc).toContain('data-testid="draft-type-select"');
      expect(modalSrc).toContain('data-testid="state-jurisdiction-select"');
      expect(modalSrc).toContain('data-testid="stamp-margin-toggle"');
    });
  });

  describe('Integration with Existing Views', () => {
    it('is wired into DealHisaab with launch button and modal rendering', () => {
      const hisaabSrc = readFileSync(path.join(ROOT, 'src/components/DealHisaab.tsx'), 'utf8');
      expect(hisaabSrc).toContain('import { LegalDraftModal }');
      expect(hisaabSrc).toContain('data-testid="hisaab-legal-draft-btn"');
      expect(hisaabSrc).toContain('showLegalDraftModal');
      expect(hisaabSrc).toContain('<LegalDraftModal');
    });

    it('is wired into PropertyPapersView with launch button and modal rendering', () => {
      const papersSrc = readFileSync(path.join(ROOT, 'src/components/PropertyPapersView.tsx'), 'utf8');
      expect(papersSrc).toContain('import { LegalDraftModal }');
      expect(papersSrc).toContain('data-testid="papers-legal-draft-btn"');
      expect(papersSrc).toContain('showDraftModal');
      expect(papersSrc).toContain('<LegalDraftModal');
    });
  });
});
