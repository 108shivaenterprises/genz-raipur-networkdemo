import React, { useState, useMemo } from 'react';
import { X, Printer, FileText, ShieldCheck, Building2, MapPin, Calendar, IndianRupee, Copy, Sparkles, Scale, Check } from 'lucide-react';
import { formatINR } from '../lib/utils.js';
import { numberToIndianWords, numberToHindiWords } from '../lib/indianLegalWords.js';
import { useTx, useI18n } from '../lib/i18n.js';

export type DraftType = 
  | 'RESALE_FLAT_HOUSE' 
  | 'PLOT_LAND' 
  | 'RENT_11M' 
  | 'COMMERCIAL_LEASE' 
  | 'BROKER_MANDATE' 
  | 'BAYANA_RECEIPT';

export type StateJurisdiction = 'CG_MP' | 'MH' | 'DL_UP' | 'KA' | 'PAN_INDIA';

export interface LegalDraftInitialData {
  dealId?: string;
  propertyTitle?: string;
  propertyAddress?: string;
  city?: string;
  state?: string;
  propertyType?: string;
  totalPrice?: number;
  bayanaAmount?: number;
  monthlyRent?: number;
  securityDeposit?: number;
  sellerName?: string;
  sellerPhone?: string;
  sellerPan?: string;
  buyerName?: string;
  buyerPhone?: string;
  buyerPan?: string;
  brokerName?: string;
  brokerFirm?: string;
  brokerRera?: string;
  landIdentifier?: string; // Khasra / 7-12 / CTS / RTC
  superAreaSqFt?: number;
  carpetAreaSqFt?: number;
  registryDays?: number;
}

export const LegalDraftModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  initialData?: LegalDraftInitialData;
}> = ({ isOpen, onClose, initialData = {} }) => {
  const tx = useTx();
  const { lang } = useI18n();
  const isHi = lang === 'hi';

  const defaultJurisdiction: StateJurisdiction = useMemo(() => {
    const s = String(initialData.state || initialData.city || '').toLowerCase();
    if (s.includes('chhattisgarh') || s.includes('raipur') || s.includes('bilaspur') || s.includes('madhya') || s.includes('indore') || s.includes('bhopal')) return 'CG_MP';
    if (s.includes('maharashtra') || s.includes('mumbai') || s.includes('pune') || s.includes('nagpur') || s.includes('thane')) return 'MH';
    if (s.includes('delhi') || s.includes('noida') || s.includes('uttar') || s.includes('lucknow') || s.includes('ghaziabad')) return 'DL_UP';
    if (s.includes('karnataka') || s.includes('bengaluru') || s.includes('bangalore') || s.includes('mysuru')) return 'KA';
    return 'CG_MP';
  }, [initialData.state, initialData.city]);

  const [draftType, setDraftType] = useState<DraftType>(
    initialData.propertyType === 'Commercial Shop' || initialData.propertyType === 'Commercial Office'
      ? 'COMMERCIAL_LEASE'
      : initialData.propertyType === 'Residential Plot' || initialData.propertyType === 'Agricultural Land'
      ? 'PLOT_LAND'
      : initialData.monthlyRent
      ? 'RENT_11M'
      : 'RESALE_FLAT_HOUSE'
  );

  const [jurisdiction, setJurisdiction] = useState<StateJurisdiction>(defaultJurisdiction);
  const [stampMargin, setStampMargin] = useState<boolean>(true); // 4.5" blank margin on top of page 1 for physical stamp paper
  const [bilingual, setBilingual] = useState<boolean>(true);

  // Form fields
  const [sellerName, setSellerName] = useState(initialData.sellerName || 'Harish Agrawal');
  const [sellerFather, setSellerFather] = useState('Late Ramesh Agrawal');
  const [sellerAddress, setSellerAddress] = useState(initialData.propertyAddress || 'Sector 2, Shankar Nagar, Raipur, Chhattisgarh');
  const [sellerPan, setSellerPan] = useState(initialData.sellerPan || 'ABCPA1234F');
  const [sellerAadhaar, setSellerAadhaar] = useState('XXXX-XXXX-4589');

  const [buyerName, setBuyerName] = useState(initialData.buyerName || 'Rameshwar Sharma');
  const [buyerFather, setBuyerFather] = useState('Suresh Sharma');
  const [buyerAddress, setBuyerAddress] = useState('Telibandha, Raipur, Chhattisgarh');
  const [buyerPan, setBuyerPan] = useState(initialData.buyerPan || 'BXYZP9876K');
  const [buyerAadhaar, setBuyerAadhaar] = useState('XXXX-XXXX-9102');

  const [propertyTitle, setPropertyTitle] = useState(initialData.propertyTitle || '3 BHK Flat — Shankar Nagar');
  const [propertyAddress, setPropertyAddress] = useState(initialData.propertyAddress || 'Flat No. 402, Royal Palms, Shankar Nagar, Raipur, CG - 492007');
  const [landId, setLandId] = useState(initialData.landIdentifier || 'Khasra No. 142/3, Diversion No. 2021/B-121');
  const [carpetArea, setCarpetArea] = useState(initialData.carpetAreaSqFt ? String(initialData.carpetAreaSqFt) : '1,350');
  const [superArea, setSuperArea] = useState(initialData.superAreaSqFt ? String(initialData.superAreaSqFt) : '1,680');

  const [totalPrice, setTotalPrice] = useState(initialData.totalPrice ? String(initialData.totalPrice) : '7200000');
  const [bayana, setBayana] = useState(initialData.bayanaAmount ? String(initialData.bayanaAmount) : '700000');
  const [monthlyRent, setMonthlyRent] = useState(initialData.monthlyRent ? String(initialData.monthlyRent) : '25000');
  const [securityDeposit, setSecurityDeposit] = useState(initialData.securityDeposit ? String(initialData.securityDeposit) : '50000');
  const [registryDays, setRegistryDays] = useState(initialData.registryDays ? String(initialData.registryDays) : '60');
  const [brokerRera, setBrokerRera] = useState(initialData.brokerRera || 'A51800001234');
  const [brokerName, setBrokerName] = useState(initialData.brokerName || 'Vikramaditya Sharma');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const numTotalPrice = Number(totalPrice) || 0;
  const numBayana = Number(bayana) || 0;
  const balanceAmount = Math.max(0, numTotalPrice - numBayana);
  const numRent = Number(monthlyRent) || 0;
  const numDeposit = Number(securityDeposit) || 0;

  const priceInWordsEn = numberToIndianWords(numTotalPrice);
  const priceInWordsHi = numberToHindiWords(numTotalPrice);
  const bayanaInWordsEn = numberToIndianWords(numBayana);
  const bayanaInWordsHi = numberToHindiWords(numBayana);

  // State specific terminology
  const landTerm = jurisdiction === 'CG_MP'
    ? { en: 'Khasra No. & Diversion', hi: 'खसरा नंबर व डायवर्सन' }
    : jurisdiction === 'MH'
    ? { en: '7/12 Survey No. & CTS No.', hi: '७/१२ सर्व्हे क्र. व सी.टी.एस. क्र.' }
    : jurisdiction === 'DL_UP'
    ? { en: 'Khasra / Khatauni / Lal Dora', hi: 'खसरा / खतौनी / लाल डोरा' }
    : jurisdiction === 'KA'
    ? { en: 'RTC (Pahani) & e-Khata PID', hi: 'ಆರ್.ಟಿ.ಸಿ / ಇ-ಖಾತಾ PID' }
    : { en: 'Revenue Survey & Land Record ID', hi: 'राजस्व सर्वे व भूमि रिकॉर्ड' };

  const rentStatute = jurisdiction === 'MH'
    ? 'Governed under Section 24 and Section 55 of the Maharashtra Rent Control Act, 1999 (compulsory IGR registration).'
    : jurisdiction === 'DL_UP'
    ? 'Governed under the UP Regulation of Urban Premises Tenancy Act, 2021 / Indian Easements Act, 1882.'
    : 'Governed as a permissive leave and license under the Indian Easements Act, 1882 (no permanent tenancy or protected occupancy rights created).';

  const rentStatuteHi = jurisdiction === 'MH'
    ? 'महाराष्ट्र रेंट कंट्रोल एक्ट 1999 की धारा 24 व धारा 55 के अंतर्गत बाध्यकारी।'
    : 'भारतीय सुखाचार अधिनियम 1882 (Indian Easements Act) के अंतर्गत अनुज्ञप्ति आधार पर निष्पादित — कोई स्थायी किराएदारी अधिकार नहीं।';

  const handlePrint = () => {
    window.print();
  };

  const handleCopy = () => {
    const el = document.getElementById('legal-draft-content');
    if (el) {
      navigator.clipboard.writeText(el.innerText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto" data-testid="legal-draft-modal">
      <div className="relative w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-slate-200 my-4 flex flex-col max-h-[92vh]">
        
        {/* Header - Hidden when printing */}
        <div className="print:hidden flex flex-wrap items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50 rounded-t-2xl gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>{tx('State-Adaptive Legal Draft Generator', 'राज्य-विशिष्ट कानूनी एग्रीमेंट ड्राफ़्ट')}</span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  {tx('RERA & TPA Verified', 'RERA व संपत्ति अंतरण सत्यापित')}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                {tx('100% Free · Zero API Fees · Print-Ready on ₹100/₹500 Stamp Paper', '100% मुफ़्त · स्टाम्प पेपर प्रिंट हेतु तैयार')}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              title={tx('Copy raw text', 'टेक्स्ट कॉपी करें')}
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? tx('Copied', 'कॉपी हुआ') : tx('Copy Text', 'कॉपी')}</span>
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
              data-testid="print-draft-btn"
            >
              <Printer className="w-4 h-4" />
              <span>{tx('Print / Save as PDF', 'प्रिंट / PDF सेव करें')}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-lg"
              aria-label={tx('Close', 'बंद')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Control Toolbar - Hidden when printing */}
        <div className="print:hidden border-b border-slate-200 p-4 bg-slate-100/70 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Agreement Type */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {tx('Agreement Type', 'अनुबंध का प्रकार')}
              </label>
              <select
                value={draftType}
                onChange={e => setDraftType(e.target.value as DraftType)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                data-testid="draft-type-select"
              >
                <option value="RESALE_FLAT_HOUSE">{tx('Agreement to Sell (Flat / Villa)', 'विक्रय इकरारनामा (फ्लैट / मकान)')}</option>
                <option value="PLOT_LAND">{tx('Plot & Land Sale Agreement', 'भूखंड / ज़मीन विक्रय अनुबंध')}</option>
                <option value="RENT_11M">{tx('11-Month Residential Rent Agreement', '11 महीने का किरायानामा (Leave & License)')}</option>
                <option value="COMMERCIAL_LEASE">{tx('Commercial Shop & Office Lease', 'दुकान व ऑफ़िस कमर्शियल लीज़')}</option>
                <option value="BROKER_MANDATE">{tx('Broker Mandate & Anti-Bypass', 'ब्रोकर मैंडेट व एंटी-बाईपास कमीशन अनुबंध')}</option>
                <option value="BAYANA_RECEIPT">{tx('Instant Bayana / Token Receipt', 'बयाना / टोकन पावती रसीद')}</option>
              </select>
            </div>

            {/* State Jurisdiction */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {tx('State / Regional Law Profile', 'राज्य / क्षेत्रीय कानूनी नियम')}
              </label>
              <select
                value={jurisdiction}
                onChange={e => setJurisdiction(e.target.value as StateJurisdiction)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                data-testid="state-jurisdiction-select"
              >
                <option value="CG_MP">Chhattisgarh & Madhya Pradesh (खसरा, B-1, डायवर्सन)</option>
                <option value="MH">Maharashtra (७/१२, CTS, Sec 55 MRC Act)</option>
                <option value="DL_UP">Delhi-NCR & Uttar Pradesh (खसरा, खतौनी, लाल डोरा)</option>
                <option value="KA">Karnataka (RTC Pahani, e-Khata, Kaveri)</option>
                <option value="PAN_INDIA">Pan-India (Standard RERA & Transfer of Property Act)</option>
              </select>
            </div>

            {/* Customization Options */}
            <div className="flex items-center gap-4 pt-4 sm:pt-6">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={stampMargin}
                  onChange={e => setStampMargin(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  data-testid="stamp-margin-toggle"
                />
                <span>{tx('4.5" Blank Header on Page 1 (for physical Stamp Paper)', 'पेज 1 पर 4.5 इंच खाली हेडर (स्टाम्प पेपर हेतु)')}</span>
              </label>
            </div>
          </div>
        </div>

        {/* Document Body Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-50/50 print:p-0 print:bg-white">
          <div 
            id="legal-draft-content"
            className={`max-w-3xl mx-auto bg-white p-6 sm:p-12 shadow-sm rounded-xl border border-slate-200 print:border-none print:shadow-none print:p-0 print:max-w-none text-slate-900 leading-relaxed font-serif text-[13px] sm:text-[14px] ${
              stampMargin ? 'pt-[3.8in] sm:pt-[4.2in]' : ''
            }`}
          >

            {/* Stamp Paper Notice Indicator (Hidden when printed) */}
            {stampMargin && (
              <div className="print:hidden mb-6 -mt-[3.5in] border border-dashed border-amber-300 bg-amber-50 rounded-lg p-3 text-center text-xs text-amber-800">
                <span className="font-bold">⚠️ स्टाम्प पेपर हेडर मार्जिन सक्रिय है (4.5" Stamp Margin Active):</span>
                <p className="mt-0.5 text-[11px] text-amber-700">
                  {tx(
                    'Page 1 leaves top 4.5 inches blank. Feed your ₹50/₹100/₹500 Non-Judicial Stamp Paper directly into printer tray.',
                    'पेज 1 पर ऊपर 4.5 इंच जगह खाली छोड़ी गई है। अपना ₹100/₹500 का स्टाम्प पेपर सीधे प्रिंटर ट्रे में लगाएं।'
                  )}
                </p>
              </div>
            )}

            {/* ────────────────────────────────── TEMPLATE 1: RESALE AGREEMENT TO SELL ────────────────────────────────── */}
            {draftType === 'RESALE_FLAT_HOUSE' && (
              <div className="space-y-4">
                <div className="text-center border-b pb-3 mb-4">
                  <h1 className="text-base sm:text-lg font-bold tracking-wide uppercase">
                    AGREEMENT TO SELL / विक्रय इकरारनामा
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">
                    (Pursuant to Transfer of Property Act, 1882 & Indian Contract Act, 1872)
                  </p>
                </div>

                <p>
                  This <b>Agreement to Sell</b> is made and executed on this <b>{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</b> at <b>{initialData.city || 'Raipur'}, {initialData.state || 'Chhattisgarh'}</b>.
                </p>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                  <p>
                    <b>FIRST PARTY / SELLER (विक्रेता):</b><br />
                    <b>{sellerName}</b>, Son/Wife/Daughter of {sellerFather}, residing at {sellerAddress}, 
                    PAN: <span className="font-mono font-bold">{sellerPan}</span>, Aadhaar: <span className="font-mono">{sellerAadhaar}</span>.
                  </p>
                  <p className="text-xs text-slate-500">
                    (hereinafter referred to as the "SELLER", which expression shall include legal heirs, successors, executors, and assigns).
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                  <p>
                    <b>SECOND PARTY / PURCHASER (क्रेता):</b><br />
                    <b>{buyerName}</b>, Son/Wife/Daughter of {buyerFather}, residing at {buyerAddress}, 
                    PAN: <span className="font-mono font-bold">{buyerPan}</span>, Aadhaar: <span className="font-mono">{buyerAadhaar}</span>.
                  </p>
                  <p className="text-xs text-slate-500">
                    (hereinafter referred to as the "PURCHASER", which expression shall include legal heirs, successors, executors, and assigns).
                  </p>
                </div>

                <h3 className="font-bold text-sm underline pt-2">PROPERTY SCHEDULE & TITLE:</h3>
                <p>
                  The Seller is the sole, absolute, and unencumbered owner of the residential property situated at:
                  <br /><b>{propertyAddress}</b>
                  <br /><b>{landTerm.en}:</b> {landId}
                  <br />Carpet Area: <b>{carpetArea} Sq.Ft.</b> | Super Built-up: <b>{superArea} Sq.Ft.</b>
                </p>

                <h3 className="font-bold text-sm underline pt-2">TERMS & MUTUAL COVENANTS:</h3>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>
                    <b>Total Sale Consideration:</b> The total price agreed between the parties is <b>{formatINR(numTotalPrice)}</b> (Rupees {priceInWordsEn} only / {priceInWordsHi}) as firm and final price.
                  </li>
                  <li>
                    <b>Earnest Money / Bayana Received:</b> The Seller acknowledges the receipt of <b>{formatINR(numBayana)}</b> (Rupees {bayanaInWordsEn} only) as advance token/bayana.
                  </li>
                  <li>
                    <b>Balance Payment & Registry:</b> The balance consideration of <b>{formatINR(balanceAmount)}</b> shall be paid by the Purchaser on or before <b>{new Date(Date.now() + Number(registryDays) * 86400000).toLocaleDateString('en-IN')}</b> (within {registryDays} days), simultaneously with the execution and registration of the final Sale Deed at the Sub-Registrar Office.
                  </li>
                  <li>
                    <b>Section 194-IA (1% TDS Compliance):</b> If the sale value exceeds ₹50 Lakhs, the Purchaser shall withhold 1% TDS as mandated by Income Tax laws, remit it to the central exchequer, and provide Form 16B to the Seller.
                  </li>
                  <li>
                    <b>Title Warranty & Encumbrance Free:</b> The Seller guarantees that the property is completely free from mortgages, court attachments, bank loans, and family disputes. Seller shall clear all pending municipal taxes and electricity dues up to the date of registration.
                  </li>
                  <li>
                    <b>Default & Breach Clause:</b>
                    <br />- <i>Purchaser's Default:</i> If Purchaser fails to pay balance within stipulated days, Seller may forfeit the earnest money.
                    <br />- <i>Seller's Default:</i> If Seller reneges or delays registration, Purchaser is entitled to full refund plus equivalent liquidated damages, or suit for Specific Performance under the Specific Relief Act, 1963.
                  </li>
                  <li>
                    <b>Facilitating Broker & RERA Acknowledgement:</b> This transaction has been facilitated through verified broker <b>{brokerName}</b> (RERA Reg: <span className="font-mono">{brokerRera}</span>).
                  </li>
                </ol>
              </div>
            )}

            {/* ────────────────────────────────── TEMPLATE 2: PLOT & LAND SALE ────────────────────────────────── */}
            {draftType === 'PLOT_LAND' && (
              <div className="space-y-4">
                <div className="text-center border-b pb-3 mb-4">
                  <h1 className="text-base sm:text-lg font-bold tracking-wide uppercase">
                    PLOT & LAND SALE AGREEMENT / भूखंड विक्रय अनुबंध
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">
                    (With Demarcation, Approach Road, and Diversion Sanctions)
                  </p>
                </div>
                <p>
                  Executed on <b>{new Date().toLocaleDateString('en-IN')}</b> at <b>{initialData.city || 'Raipur'}, {initialData.state || 'Chhattisgarh'}</b>.
                </p>
                <p><b>Seller:</b> {sellerName} (PAN: {sellerPan}) | <b>Purchaser:</b> {buyerName} (PAN: {buyerPan})</p>
                <h3 className="font-bold text-sm underline pt-2">PLOT & REVENUE SPECIFICATIONS:</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li><b>Plot Number & Layout:</b> Plot No. {initialData.propertyTitle || 'Plot No. 18, Green Valley Layout'}</li>
                  <li><b>{landTerm.en}:</b> {landId}</li>
                  <li><b>Dimensions:</b> {carpetArea} Sq.Ft. (Approx {Math.round(Number(carpetArea.replace(/\D/g, '') || 1200) / 9)} Sq.Yards)</li>
                  <li><b>Diversion & T&CP:</b> Residential Diversion Order duly obtained under relevant State Land Revenue Code.</li>
                </ul>
                <h3 className="font-bold text-sm underline pt-2">CORE CONDITIONS:</h3>
                <ol className="list-decimal pl-5 space-y-2">
                  <li><b>Total Agreed Price:</b> {formatINR(numTotalPrice)} | <b>Advance Bayana:</b> {formatINR(numBayana)} | <b>Balance:</b> {formatINR(balanceAmount)}.</li>
                  <li><b>Physical Demarcation (सीमांकन):</b> Seller guarantees verified corner boundaries with concrete pegs and unobstructed approach road.</li>
                  <li><b>Tribal & Protected Land Warranty:</b> Seller declares that the land is not subject to alienation restrictions under Section 165/170-B (CG/MP) or equivalent state restrictions.</li>
                </ol>
              </div>
            )}

            {/* ────────────────────────────────── TEMPLATE 3: 11-MONTH RENT AGREEMENT ────────────────────────────────── */}
            {draftType === 'RENT_11M' && (
              <div className="space-y-4">
                <div className="text-center border-b pb-3 mb-4">
                  <h1 className="text-base sm:text-lg font-bold tracking-wide uppercase">
                    LEAVE & LICENSE AGREEMENT (RESIDENTIAL) / 11 महीने का किरायानामा
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">
                    (Standard 11-Month Non-Tenancy Permissive Occupancy)
                  </p>
                </div>
                <p>
                  Between <b>{sellerName}</b> (Licensor/Landlord) and <b>{buyerName}</b> (Licensee/Tenant).
                </p>
                <p className="text-xs italic bg-slate-50 p-2 rounded border">{rentStatute}</p>
                <ol className="list-decimal pl-5 space-y-2">
                  <li><b>Duration:</b> Fixed tenure of 11 (Eleven) months commencing from {new Date().toLocaleDateString('en-IN')}.</li>
                  <li><b>Monthly Rent / Compensation:</b> <b>{formatINR(numRent)}</b> per month, payable in advance on or before the 7th day of every calendar month.</li>
                  <li><b>Security Deposit:</b> <b>{formatINR(numDeposit)}</b> interest-free refundable deposit, to be refunded at vacating post utility clearance.</li>
                  <li><b>Permitted Use & Police Verification:</b> Strictly for residential purpose. Tenant shall submit KYC for mandatory local Police Verification.</li>
                  <li><b>Notice Period:</b> 30 days written notice on either side.</li>
                </ol>
              </div>
            )}

            {/* ────────────────────────────────── TEMPLATE 4: COMMERCIAL LEASE ────────────────────────────────── */}
            {draftType === 'COMMERCIAL_LEASE' && (
              <div className="space-y-4">
                <div className="text-center border-b pb-3 mb-4">
                  <h1 className="text-base sm:text-lg font-bold tracking-wide uppercase">
                    COMMERCIAL LEASE AGREEMENT / व्यावसायिक लीज़ डीड
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">
                    (For Shops, Offices, Showrooms & Commercial Units)
                  </p>
                </div>
                <p>Between <b>{sellerName}</b> (Lessor) and <b>{buyerName}</b> (Lessee/Business).</p>
                <ol className="list-decimal pl-5 space-y-2">
                  <li><b>Premises:</b> {propertyAddress}</li>
                  <li><b>Monthly Commercial Rent:</b> {formatINR(numRent)} + Applicable GST (18%).</li>
                  <li><b>Lock-in Period:</b> Mandatory 3-year lock-in period. Neither party may exit without paying rent for remaining lock-in.</li>
                  <li><b>Rent Escalation:</b> Rent shall escalate by 5% annually (or 15% every 3 years).</li>
                  <li><b>Tax Deductions (TDS 194-I):</b> Lessee shall deduct 10% TDS under Section 194-I and provide quarterly Form 16A certificates.</li>
                </ol>
              </div>
            )}

            {/* ────────────────────────────────── TEMPLATE 5: BROKER MANDATE & ANTI-BYPASS ────────────────────────────────── */}
            {draftType === 'BROKER_MANDATE' && (
              <div className="space-y-4">
                <div className="text-center border-b pb-3 mb-4">
                  <h1 className="text-base sm:text-lg font-bold tracking-wide uppercase">
                    BROKER MANDATE & ANTI-BYPASS COMMISSION AGREEMENT
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">
                    (RERA Registered Real Estate Agent Protection Undertaking)
                  </p>
                </div>
                <p>
                  Between <b>{sellerName}</b> (Principal/Client) and <b>{brokerName}</b> (RERA Registered Real Estate Broker, Reg No: <span className="font-mono font-bold">{brokerRera}</span>).
                </p>
                <ol className="list-decimal pl-5 space-y-2">
                  <li><b>Scope:</b> Marketing, client matching, and transaction closure of {propertyTitle}.</li>
                  <li><b>Commission Rate:</b> Agreed brokerage of <b>1% to 2%</b> of total registered consideration value, payable upon execution of agreement or deed.</li>
                  <li><b>Anti-Circumvention (Non-Bypass):</b> The Principal guarantees NOT to bypass the Broker or deal behind the Broker's back with any party introduced via chat, site visit pass, or platform room.</li>
                  <li><b>180-Day Cooling / Tail Period:</b> If any party introduced by the Broker buys/leases the property within 180 days post-mandate, full commission remains legally recoverable.</li>
                  <li><b>Breach Liability:</b> In case of proven direct bypass, Principal is liable to pay full brokerage plus 50% liquidated damages under Indian Contract Act, 1872.</li>
                </ol>
              </div>
            )}

            {/* ────────────────────────────────── TEMPLATE 6: INSTANT BAYANA RECEIPT ────────────────────────────────── */}
            {draftType === 'BAYANA_RECEIPT' && (
              <div className="space-y-4">
                <div className="text-center border-b pb-3 mb-4">
                  <h1 className="text-base sm:text-lg font-bold tracking-wide uppercase">
                    BAYANA / TOKEN RECEIPT (पावती रसीद)
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">
                    Receipt No: GZ-BAYANA-{Date.now().toString().slice(-6)} | Date: {new Date().toLocaleDateString('en-IN')}
                  </p>
                </div>
                <p>
                  Received with thanks from <b>{buyerName}</b> (Ph: 91311 00001) a sum of <b>{formatINR(numBayana)}</b> (Rupees {bayanaInWordsEn} only) as initial booking token / earnest money for:
                </p>
                <div className="p-3 bg-slate-50 border rounded-lg">
                  <p className="font-bold">{propertyTitle}</p>
                  <p className="text-xs text-slate-600">{propertyAddress}</p>
                  <p className="text-xs text-slate-600 font-mono mt-1">{landId}</p>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li>Total Deal Consideration: <b>{formatINR(numTotalPrice)}</b></li>
                  <li>Balance Payable at Registry: <b>{formatINR(balanceAmount)}</b></li>
                  <li>Property Freeze Period: 15 Days (Seller shall not show or offer the property to others).</li>
                  <li>Facilitated via: {brokerName} (RERA: {brokerRera})</li>
                </ul>
              </div>
            )}

            {/* Signatures & Execution Block */}
            <div className="pt-10 mt-8 border-t border-slate-300">
              <div className="grid grid-cols-2 gap-8 text-center text-xs sm:text-sm">
                <div>
                  <div className="h-14 border-b border-dashed border-slate-400"></div>
                  <p className="font-bold mt-2">{sellerName}</p>
                  <p className="text-slate-500 text-xs">FIRST PARTY / SELLER / LESSOR</p>
                </div>
                <div>
                  <div className="h-14 border-b border-dashed border-slate-400"></div>
                  <p className="font-bold mt-2">{buyerName}</p>
                  <p className="text-slate-500 text-xs">SECOND PARTY / PURCHASER / LESSEE</p>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-slate-200 grid grid-cols-2 gap-8 text-xs text-slate-600">
                <div>
                  <p className="font-bold">WITNESS 1:</p>
                  <p>Signature: ______________________</p>
                  <p>Name: _________________________</p>
                </div>
                <div>
                  <p className="font-bold">WITNESS 2:</p>
                  <p>Signature: ______________________</p>
                  <p>Name: _________________________</p>
                </div>
              </div>

              <div className="mt-6 text-center text-[10px] text-slate-400 print:text-[8px]">
                Generated via GENZ Broker Network • Verified State Legal Template • Non-Judicial Stamp Paper Compliant
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
