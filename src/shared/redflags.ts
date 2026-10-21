/**
 * Title red-flag scanner. The record is typed in by a human after checking the state land-record portal
 * (GENZ does not scrape any government site). The scanner only applies rules to what was entered.
 */
export type LandUse = 'AGRICULTURAL' | 'RESIDENTIAL' | 'COMMERCIAL' | 'INDUSTRIAL' | 'NAZUL' | 'OTHER';
export type EncumbranceStatus = 'NOT_CHECKED' | 'CLEAR' | 'MORTGAGE' | 'LITIGATION' | 'OTHER_CHARGE';
export type NocStatus = 'NOT_REQUIRED' | 'PENDING' | 'RECEIVED';
export type ApprovalAuthority = 'NONE' | 'TOWN_COUNTRY_PLANNING' | 'GRAM_PANCHAYAT' | 'MUNICIPAL' | 'DEVELOPMENT_AUTHORITY' | 'OTHER';

export interface LandRecordFields {
  landUse: LandUse;
  diverted: boolean;
  diversionOrderNo?: string;
  ownerNameOnRecord: string;
  /** name of the seller as presented in the deal */
  sellerName?: string;
  encumbrance: EncumbranceStatus;
  bankNoc: NocStatus;
  approvalAuthority: ApprovalAuthority;
  approvalNo?: string;
  /** layout / project RERA registration number, if the land is part of a project */
  reraNo?: string;
  isLayoutOrProject: boolean;
  verifiedAt?: string;
  sharedOwnership?: boolean;
  coOwnersConsent?: boolean;
}

export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';
export interface RedFlag { code: string; severity: Severity; message: string }

const norm = (s?: string) => (s || '').toLowerCase().replace(/\b(shri|smt|mr|mrs|ms|dr|late|sri)\b\.?/g, '').replace(/[^a-zऀ-ॿ ]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s?: string) => new Set(norm(s).split(' ').filter(t => t.length > 1));

export function nameMatches(a?: string, b?: string): boolean {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return true; // nothing to compare
  const small = A.size <= B.size ? A : B, big = A.size <= B.size ? B : A;
  return [...small].every(t => big.has(t));
}

/** Hindi reading of each flag (the server stores the English text; the screen picks by `code`). */
export const RED_FLAG_HI: Record<string, string> = {
  NAZUL: 'नज़ूल / सरकारी ज़मीन — बिक्री के लिए प्राधिकरण से लीज़ या अनुमति चाहिए; केवल निजी बिक्री-विलेख काफ़ी नहीं।',
  AGRI_NOT_DIVERTED: 'खेती की ज़मीन जिसका डायवर्जन (गैर-कृषि उपयोग) आदेश नहीं है — प्लॉट के रूप में बेची या उस पर निर्माण नहीं किया जा सकता।',
  DIVERSION_NO_ORDER: 'डायवर्जन हुआ बताया गया है पर डायवर्जन आदेश का नंबर नहीं भरा।',
  ENC_NOT_CHECKED: 'भार (एनकम्ब्रेंस) की स्थिति अभी जाँची नहीं गई — टोकन से पहले एनकम्ब्रेंस / सर्च रिपोर्ट लें।',
  MORTGAGE_NOC_OK: 'बंधक (मॉर्गेज) है पर बैंक की NOC मिल चुकी है — पक्का करें कि बंधक-मुक्ति पंजीकृत हो चुकी है।',
  MORTGAGE_NO_NOC: 'प्रॉपर्टी बंधक है और बैंक की NOC / मुक्ति अभी नहीं मिली।',
  LITIGATION: 'इस ज़मीन पर मुक़दमा / कोर्ट की कुर्की दर्ज है।',
  OTHER_CHARGE: 'ज़मीन पर कोई और भार दर्ज है — नोट पढ़ें और उसे हटवाएँ।',
  NOC_PENDING: 'बैंक की NOC बाकी दिखाई गई है।',
  NO_LAYOUT_APPROVAL: 'लेआउट / प्रोजेक्ट की नगर-निवेश या स्थानीय निकाय की कोई मंज़ूरी दर्ज नहीं।',
  APPROVAL_NO_MISSING: 'मंज़ूरी देने वाला प्राधिकरण चुना है पर मंज़ूरी / परमिट नंबर नहीं भरा।',
  RERA_MISSING: 'इस लेआउट / प्रोजेक्ट का RERA रजिस्ट्रेशन नंबर दर्ज नहीं (देखें कि छूट मिली है या नहीं)।',
  GP_ONLY: 'सिर्फ़ ग्राम पंचायत की मंज़ूरी है — शहरी सीमा के लेआउट के लिए आम तौर पर नगर तथा ग्राम निवेश की मंज़ूरी चाहिए।',
  NAME_MISMATCH: 'विक्रेता का नाम भूमि रिकॉर्ड पर दर्ज मालिक के नाम से मेल नहीं खाता।',
  COOWNER_CONSENT: 'संयुक्त स्वामित्व दर्ज है और सह-स्वामियों की सहमति पक्की नहीं।',
  NOT_VERIFIED: 'किसी व्यक्ति ने अभी तक आधिकारिक रिकॉर्ड से इसका मिलान नहीं किया।',
  STALE: 'रिकॉर्ड 30 दिन से ज़्यादा पहले जाँचा गया था — सौदा पक्का करने से पहले दोबारा जाँचें।',
};
export const SEVERITY_HI: Record<string, string> = { HIGH: 'गंभीर', MEDIUM: 'मध्यम', LOW: 'कम' };

export function scanRedFlags(r: LandRecordFields, now = Date.now()): { flags: RedFlag[]; verdict: 'CLEAR' | 'CAUTION' | 'DANGER' } {
  const f: RedFlag[] = [];
  const add = (code: string, severity: Severity, message: string) => f.push({ code, severity, message });

  if (r.landUse === 'NAZUL') add('NAZUL', 'HIGH', 'Nazul / government land — sale needs lease or permission from the authority; a private sale deed is not enough.');
  if (r.landUse === 'AGRICULTURAL' && !r.diverted) add('AGRI_NOT_DIVERTED', 'HIGH', 'Agricultural land without a diversion (non-agricultural use) order — cannot be sold as a plot or built on.');
  if (r.diverted && !r.diversionOrderNo?.trim()) add('DIVERSION_NO_ORDER', 'MEDIUM', 'Marked as diverted but the diversion order number is missing.');
  if (r.encumbrance === 'NOT_CHECKED') add('ENC_NOT_CHECKED', 'MEDIUM', 'Encumbrance status not checked yet — get an encumbrance / search report before token.');
  if (r.encumbrance === 'MORTGAGE') {
    if (r.bankNoc === 'RECEIVED') add('MORTGAGE_NOC_OK', 'LOW', 'Mortgage exists but the bank NOC is received — confirm the mortgage release is registered.');
    else add('MORTGAGE_NO_NOC', 'HIGH', 'Property is mortgaged and the bank NOC / release is not received.');
  }
  if (r.encumbrance === 'LITIGATION') add('LITIGATION', 'HIGH', 'Litigation / court attachment noted on this land.');
  if (r.encumbrance === 'OTHER_CHARGE') add('OTHER_CHARGE', 'MEDIUM', 'Another charge is recorded against the land — read the note and clear it.');
  if (r.bankNoc === 'PENDING' && r.encumbrance !== 'MORTGAGE') add('NOC_PENDING', 'MEDIUM', 'A bank NOC is marked pending.');
  if (r.isLayoutOrProject) {
    if (r.approvalAuthority === 'NONE') add('NO_LAYOUT_APPROVAL', 'HIGH', 'Layout / project has no town-planning or local-authority approval recorded.');
    else if (!r.approvalNo?.trim()) add('APPROVAL_NO_MISSING', 'MEDIUM', 'Approval authority chosen but the approval / permit number is missing.');
    if (!r.reraNo?.trim()) add('RERA_MISSING', 'MEDIUM', 'No RERA registration number recorded for this layout / project (check whether it is exempt).');
  }
  if (r.approvalAuthority === 'GRAM_PANCHAYAT' && r.isLayoutOrProject) add('GP_ONLY', 'MEDIUM', 'Only a Gram Panchayat approval — for urban-limit layouts the town & country planning approval is normally required.');
  if (!nameMatches(r.ownerNameOnRecord, r.sellerName)) add('NAME_MISMATCH', 'HIGH', 'Seller name does not match the owner name on the land record.');
  if (r.sharedOwnership && !r.coOwnersConsent) add('COOWNER_CONSENT', 'HIGH', 'Joint ownership recorded and co-owners\' consent is not confirmed.');
  if (!r.verifiedAt) add('NOT_VERIFIED', 'LOW', 'Not yet verified against the official record by a person.');
  else if (now - Date.parse(r.verifiedAt) > 30 * 86400000) add('STALE', 'LOW', 'Record was checked more than 30 days ago — re-check before closing.');

  const verdict = f.some(x => x.severity === 'HIGH') ? 'DANGER' : f.some(x => x.severity === 'MEDIUM') ? 'CAUTION' : 'CLEAR';
  return { flags: f, verdict };
}
