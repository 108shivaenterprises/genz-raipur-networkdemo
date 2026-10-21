import { reraAuthorityOf } from '../shared/india.js';
import React, { useState } from 'react';
import { UserProfile, Property } from '../types/index.js';
import { formatINR, printText } from '../lib/utils.js';
import { useProtectionConfig } from './ProtectionDays.js';
import { useI18n, useTx } from '../lib/i18n.js';
import {
  ShieldCheck,
  Scale,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  Printer,
  X,
  Lock,
  ArrowRight,
  Handshake,
  Download,
  Sliders,
  Percent,
} from 'lucide-react';

interface BrokerSafetyModalProps {
  isOpen: boolean;
  currentUser: UserProfile;
  brokers: UserProfile[];
  properties: Property[];
  onClose: () => void;
  onOpenDispute?: () => void;
}

export const BrokerSafetyModal: React.FC<BrokerSafetyModalProps> = ({
  isOpen,
  currentUser,
  brokers,
  properties,
  onClose,
  onOpenDispute,
}) => {
  const tx = useTx();
  // v28 — the days come from the superadmin's rule (default days), not a fixed 30
  const pDays = useProtectionConfig()?.defaultDays || 30;
  const { lang } = useI18n();
  const hi = lang === 'hi';
  const [activeTab, setActiveTab] = useState<'clause' | 'agreement_gen' | 'blacklist_protocol'>('clause');

  // Commission Agreement Generator state
  const brokerList = brokers.filter((u) => u.role === 'BROKER' || u.role === 'SUPERADMIN');
  const [introducingBrokerName, setIntroducingBrokerName] = useState(
    currentUser.role === 'BROKER' ? currentUser.name : brokerList[0]?.name || ''
  );
  const [closingBrokerName, setClosingBrokerName] = useState(
    brokerList.find((b) => b.name !== introducingBrokerName)?.name || ''
  );
  const [selectedPropId, setSelectedPropId] = useState(properties[0]?.id || '');
  const [dealValuation, setDealValuation] = useState<number>(properties[0]?.askingPrice || 0);
  const [commissionPct, setCommissionPct] = useState<number>(2.0);
  const [introSplitPct, setIntroSplitPct] = useState<number>(50);
  const [copiedAgreement, setCopiedAgreement] = useState(false);

  const selectedProperty = properties.find((p) => p.id === selectedPropId) || properties[0];
  const totalCommissionINR = (dealValuation * commissionPct) / 100;
  const introBrokerShareINR = (totalCommissionINR * introSplitPct) / 100;
  const closingBrokerShareINR = totalCommissionINR - introBrokerShareINR;

  const splitPresets = [
    { label: '50 / 50', intro: 50, desc: tx('Equal Partnership', 'बराबर की साझेदारी') },
    { label: '60 / 40', intro: 60, desc: tx('Buyer Broker Lead', 'खरीदार-ब्रोकर आगे') },
    { label: '40 / 60', intro: 40, desc: tx('Listing Mandate Lead', 'लिस्टिंग मैंडेट आगे') },
    { label: '70 / 30', intro: 70, desc: tx('Direct Exclusive Client', 'सीधा एक्सक्लूसिव क्लाइंट') },
    { label: '30 / 70', intro: 30, desc: tx('Sub-Broker Facilitation', 'सब-ब्रोकर सहयोग') },
    { label: '80 / 20', intro: 80, desc: tx('Lead Referral Only', 'सिर्फ़ लीड रेफ़रल') },
  ];

  const rera = reraAuthorityOf(selectedProperty?.state);
  const jurisdiction = [selectedProperty?.city, selectedProperty?.state].filter(Boolean).join(', ') || 'India';
  const dateStr = new Date().toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const propLine = [selectedProperty?.locality, selectedProperty?.city, selectedProperty?.state].filter(Boolean).join(', ') || 'N/A';
  const refCode = `AGR-${Date.now().toString().slice(-6)}`;
  const agreementText = hi
    ? `========================================================================
GENZ BROKER NETWORK - ${introSplitPct}/${100 - introSplitPct} को-ब्रोकरेज कमीशन बँटवारा समझौता (मसौदा)
क्षेत्राधिकार: ${jurisdiction}
========================================================================
नोट: यह एक नमूना मसौदा है। GENZ इस समझौते का पक्षकार नहीं है और कोई कानूनी
सलाह नहीं देता। हस्ताक्षर से पहले अपने अधिवक्ता से जँचवा लें।

तारीख़: ${dateStr}
समझौता संदर्भ: ${refCode}

1. सहभागी ब्रोकर:
   क) परिचय कराने वाला (खरीदार का) ब्रोकर: ${introducingBrokerName} (पक्ष क) - ${introSplitPct}%
   ख) डील पूरी करने वाला (लिस्टिंग) ब्रोकर:  ${closingBrokerName} (पक्ष ख) - ${100 - introSplitPct}%

2. संबंधित प्रॉपर्टी:
   - प्रॉपर्टी ID:        ${selectedProperty ? selectedProperty.id : 'N/A'}
   - शीर्षक / प्रकार:     ${selectedProperty ? selectedProperty.title : 'प्रॉपर्टी'} (${selectedProperty?.propertyType || ''})
   - इलाका और शहर:      ${propLine}

3. मूल्य और तय कमीशन:
   - सहमत डील मूल्य:           ${formatINR(dealValuation)}
   - कुल ब्रोकरेज:             ${commissionPct}% (${formatINR(totalCommissionINR)})
   - बँटवारे का अनुपात:         ${introSplitPct}% (पक्ष क) / ${100 - introSplitPct}% (पक्ष ख)
   - पक्ष क का हिस्सा:          ${introSplitPct}% -> ${formatINR(introBrokerShareINR)}
   - पक्ष ख का हिस्सा:          ${100 - introSplitPct}% -> ${formatINR(closingBrokerShareINR)}

4. ${pDays} दिन की एंटी-बायपास शर्त:
   पक्ष ख, परिचय कराए गए क्लाइंट के साथ पक्ष क को छोड़कर सीधे सौदा या बातचीत
   नहीं करेगा — साइट विज़िट के सत्यापन या OTP/QR चेक-इन के बाद ${pDays} दिन तक।
   इस अवधि में सीधा सौदा होने पर पक्ष क का तय हिस्सा देय होगा।

5. विवाद:
   भुगतान न होने या बायपास की स्थिति में पहले GENZ Broker Network की विवाद
   प्रक्रिया में मामला दर्ज किया जाएगा (GENZ केवल रिकॉर्ड और मध्यस्थता में मदद
   करता है; न फ़ैसला सुनाता है, न पैसा रखता या वसूलता है)। हल न होने पर पक्ष
   ${jurisdiction} में लागू कानून के अनुसार सक्षम मंच / ${rera} / मध्यस्थता का सहारा ले सकते हैं।

स्टाम्प हैश (SHA-256): दोनों ब्रोकर डील रूम में हस्ताक्षर करें तब बनेगा
स्थिति: मसौदा — दोनों के हस्ताक्षर के बाद ही प्रभावी`
    : `========================================================================
GENZ BROKER NETWORK - ${introSplitPct}/${100 - introSplitPct} CO-BROKERAGE COMMISSION SPLIT AGREEMENT (DRAFT)
Jurisdiction: ${jurisdiction}
========================================================================
NOTE: This is a sample draft. GENZ is not a party to this agreement and gives no
legal advice. Have your advocate review it before signing.

DATE: ${dateStr}
AGREEMENT REF CODE: ${refCode}

1. PARTICIPATING BROKERS:
   a) INTRODUCING (BUYER'S) BROKER: ${introducingBrokerName} (Party A) - ${introSplitPct}%
   b) CLOSING (LISTING) BROKER:     ${closingBrokerName} (Party B) - ${100 - introSplitPct}%

2. SUBJECT PROPERTY:
   - Property ID:       ${selectedProperty ? selectedProperty.id : 'N/A'}
   - Title / Type:      ${selectedProperty ? selectedProperty.title : 'Property'} (${selectedProperty?.propertyType || ''})
   - Locality & City:   ${propLine}

3. VALUATION & AGREED COMMISSION:
   - Agreed Transaction Value:    ${formatINR(dealValuation)}
   - Gross Brokerage Fee:         ${commissionPct}% (${formatINR(totalCommissionINR)})
   - Split Ratio Agreed:          ${introSplitPct}% (Party A) / ${100 - introSplitPct}% (Party B)
   - Party A (Introducing Share): ${introSplitPct}% -> ${formatINR(introBrokerShareINR)}
   - Party B (Closing Share):     ${100 - introSplitPct}% -> ${formatINR(closingBrokerShareINR)}

4. ${pDays}-DAY ANTI-BYPASS CLAUSE:
   Party B will not deal directly with, or negotiate behind the back of, Party A
   regarding the introduced client for ${pDays} calendar days after the verified site
   visit or OTP/QR check-in. If a direct closing happens in this period, Party A's
   agreed share above becomes payable.

5. DISPUTES:
   In case of non-payment or bypass, the matter is first raised through the GENZ
   Broker Network dispute process (GENZ only helps with records and mediation; it
   does not decide the matter and never holds or collects money). If unresolved,
   the parties may approach the competent forum / ${rera} / arbitration as per
   the law applicable in ${jurisdiction}.

STAMP HASH (SHA-256): generated when both brokers sign in the Deal Room
STATUS: DRAFT - effective only after both brokers sign`;

  const handleCopyAgreement = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(agreementText);
      setCopiedAgreement(true);
      setTimeout(() => setCopiedAgreement(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Sticky Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-900 text-white rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg shadow-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight text-white">
                  {tx('Broker Safety & Anti-Bypass Protocols', 'ब्रोकर सुरक्षा और एंटी-बायपास नियम')}
                </h3>
                <span className="rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-bold px-2 py-0.5">
                  {tx('Platform rules', 'प्लेटफ़ॉर्म नियम')}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {tx('Anti-bypass rules, commission split drafts (50:50, 60:40, 70:30, custom %) and the dispute process', 'एंटी-बायपास नियम, कमीशन बँटवारे का मसौदा (50:50, 60:40, 70:30, कस्टम %) और विवाद प्रक्रिया')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={tx('Close', 'बंद करें')}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50 px-5 pt-2 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('clause')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all shrink-0 ${
              activeTab === 'clause'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tx(`${pDays}-Day Anti-Bypass Clause`, `${pDays} दिन की एंटी-बायपास शर्त`)}
          </button>
          <button
            onClick={() => setActiveTab('agreement_gen')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'agreement_gen'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Handshake className="h-3.5 w-3.5" />
            <span>{tx('Commission Split Agreement', 'कमीशन बँटवारा समझौता')} ({introSplitPct}:{100 - introSplitPct})</span>
          </button>
          <button
            onClick={() => setActiveTab('blacklist_protocol')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'blacklist_protocol'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Scale className="h-3.5 w-3.5" />
            <span>{tx('Blacklist & Penalty Steps', 'ब्लैकलिस्ट और कार्रवाई के चरण')}</span>
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs">
          {/* TAB 1: 30-DAY ANTI-BYPASS CLAUSE */}
          {activeTab === 'clause' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-2">
                <div className="flex items-center gap-2 font-bold text-emerald-900 text-sm">
                  <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                  <span>{tx('How You Are Protected Against Client & Broker Poaching', 'क्लाइंट और ब्रोकर बायपास से आपकी सुरक्षा कैसे होती है')}</span>
                </div>
                <p className="text-slate-700 leading-relaxed text-xs">
                  {tx('In Indian real estate, the biggest risk for co-broking agents is client bypass: you take a buyer to see a site, and the buyer and owner then close directly without paying commission.', 'भारतीय रियल एस्टेट में को-ब्रोकिंग एजेंट का सबसे बड़ा जोखिम क्लाइंट बायपास है: आप खरीदार को साइट दिखाते हैं और फिर खरीदार व मालिक सीधे सौदा कर लेते हैं, कमीशन दिए बिना।')}
                </p>
              </div>

              {/* 3 pillars of protection */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1.5 shadow-2xs">
                  <span className="font-bold text-slate-900 block flex items-center gap-1">
                    <span className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px]">1</span>
                    {tx('Digital Intro Stamping', 'डिजिटल परिचय स्टैम्प')}
                  </span>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    {tx('When you schedule a site visit or open a deal room, a SHA-256 hash of the time and the buyer’s mobile is recorded in the tamper-evident audit trail.', 'साइट विज़िट तय करने या डील रूम खोलने पर समय और खरीदार के मोबाइल का SHA-256 हैश छेड़छाड़-पकड़ने वाले ऑडिट ट्रेल में दर्ज होता है।')}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1.5 shadow-2xs">
                  <span className="font-bold text-slate-900 block flex items-center gap-1">
                    <span className="h-5 w-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-[10px]">2</span>
                    {tx('QR / OTP Presence Proof', 'QR / OTP से मौजूदगी का प्रमाण')}
                  </span>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    {tx('A client OTP or QR-pass check-in records a timestamped proof of the physical introduction (with location, if allowed). It is supporting evidence — not a court order.', 'क्लाइंट के OTP या QR पास से चेक-इन पर समय-सहित प्रमाण दर्ज होता है (अनुमति हो तो लोकेशन भी)। यह सहायक सबूत है — कोई अदालती आदेश नहीं।')}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1.5 shadow-2xs">
                  <span className="font-bold text-slate-900 block flex items-center gap-1">
                    <span className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px]">3</span>
                    {tx(`${pDays}-Day Tail Rule`, `${pDays} दिन की टेल शर्त`)}
                  </span>
                  <p className="text-slate-600 text-[11px] leading-relaxed">
                    {tx(`If the client closes within ${pDays} days of the verified visit, the closing broker and owner are expected to honour your commission split under the signed Deal Room agreement. Disputes go through the platform dispute process.`, `सत्यापित विज़िट के ${pDays} दिन में क्लाइंट सौदा करे तो क्लोज़िंग ब्रोकर और मालिक से अपेक्षा है कि वे साइन किए डील रूम समझौते के अनुसार आपका कमीशन हिस्सा मानें। विवाद होने पर प्लेटफ़ॉर्म की विवाद प्रक्रिया चलती है।`)}
                  </p>
                </div>
              </div>

              {/* Action Recommendation */}
              <div className="rounded-xl bg-slate-900 text-white p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                <div>
                  <h4 className="font-bold text-sm text-white">{tx('Draft a Written Split Agreement Before the Site Visit', 'साइट विज़िट से पहले लिखित बँटवारा समझौते का मसौदा बनाएँ')}</h4>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {tx('Create a two-party commission split draft with your agreed percentage (50:50, 60:40, 70:30 or custom) in one click.', 'अपने तय प्रतिशत (50:50, 60:40, 70:30 या कस्टम) के साथ दो-पक्षीय कमीशन बँटवारे का मसौदा एक क्लिक में बनाएँ।')}
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('agreement_gen')}
                  className="rounded-lg bg-amber-400 text-slate-950 font-bold px-4 py-2 hover:bg-amber-300 transition-colors shrink-0 shadow-xs"
                >
                  {tx('Configure Split Agreement →', 'बँटवारा समझौता बनाएँ →')}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: AGREEMENT GENERATOR */}
          {activeTab === 'agreement_gen' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  {tx('Configure Co-Broking Parameters', 'को-ब्रोकिंग का ब्योरा भरें')}
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-600 font-semibold block text-[11px]">{tx('Party A: Introducing Broker (Buyer)', 'पक्ष क: परिचय कराने वाला ब्रोकर (खरीदार)')}</label>
                    <input
                      type="text"
                      value={introducingBrokerName}
                      onChange={(e) => setIntroducingBrokerName(e.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 bg-white p-1.5 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="text-slate-600 font-semibold block text-[11px]">{tx('Party B: Closing Broker (Listing)', 'पक्ष ख: डील पूरी करने वाला ब्रोकर (लिस्टिंग)')}</label>
                    <input
                      type="text"
                      value={closingBrokerName}
                      onChange={(e) => setClosingBrokerName(e.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 bg-white p-1.5 text-xs text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-slate-600 font-semibold block text-[11px]">{tx('Select Property', 'प्रॉपर्टी चुनें')}</label>
                    <select
                      value={selectedPropId}
                      onChange={(e) => {
                        setSelectedPropId(e.target.value);
                        const p = properties.find((pr) => pr.id === e.target.value);
                        if (p) setDealValuation(p.askingPrice);
                      }}
                      className="mt-1 w-full rounded border border-slate-300 bg-white p-1.5 text-xs text-slate-900"
                    >
                      {properties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.id}: {p.title.slice(0, 24)}...
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-600 font-semibold block text-[11px]">{tx('Deal Value (₹)', 'डील मूल्य (₹)')}</label>
                    <input
                      type="number"
                      value={dealValuation}
                      onChange={(e) => setDealValuation(Number(e.target.value))}
                      className="mt-1 w-full rounded border border-slate-300 bg-white p-1.5 text-xs text-slate-900 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-slate-600 font-semibold block text-[11px]">{tx('Total Commission %', 'कुल कमीशन %')}</label>
                    <select
                      value={commissionPct}
                      onChange={(e) => setCommissionPct(Number(e.target.value))}
                      className="mt-1 w-full rounded border border-slate-300 bg-white p-1.5 text-xs text-slate-900"
                    >
                      <option value={1.0}>1.0% ({formatINR((dealValuation * 1.0) / 100)})</option>
                      <option value={1.5}>1.5% ({formatINR((dealValuation * 1.5) / 100)})</option>
                      <option value={2.0}>2.0% ({formatINR((dealValuation * 2.0) / 100)})</option>
                      <option value={2.5}>2.5% ({formatINR((dealValuation * 2.5) / 100)})</option>
                    </select>
                  </div>
                </div>

                {/* Commission Split Configuration Slider & Presets */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-slate-800 font-bold flex items-center gap-1.5 text-xs">
                      <Sliders className="h-3.5 w-3.5 text-blue-600" />
                      <span>{tx('Agreed Commission Split Ratio', 'तय कमीशन बँटवारे का अनुपात')}</span>
                    </label>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {tx('Party A', 'पक्ष क')}: {introSplitPct}%
                      </span>
                      <span className="text-slate-400 font-bold">:</span>
                      <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {tx('Party B', 'पक्ष ख')}: {100 - introSplitPct}%
                      </span>
                    </div>
                  </div>

                  {/* Preset Pills */}
                  <div className="flex flex-wrap gap-1.5">
                    {splitPresets.map((preset) => {
                      const isSelected = introSplitPct === preset.intro;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setIntroSplitPct(preset.intro)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${
                            isSelected
                              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                          }`}
                          title={preset.desc}
                        >
                          <span>{preset.label}</span>
                          <span className="hidden sm:inline text-[10px] opacity-75 ml-1">({preset.desc})</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Range Slider & Manual Controls */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-600 font-medium">
                      <span>{tx('Introducing (Buyer Lead)', 'परिचयकर्ता (खरीदार लीड)')}: <strong className="text-blue-700">{introSplitPct}%</strong></span>
                      <span>{tx('Closing (Listing Mandate)', 'क्लोज़र (लिस्टिंग मैंडेट)')}: <strong className="text-amber-700">{100 - introSplitPct}%</strong></span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={5}
                        max={95}
                        step={5}
                        value={introSplitPct}
                        onChange={(e) => setIntroSplitPct(Number(e.target.value))}
                        className="flex-1 accent-blue-600 cursor-pointer h-2 bg-slate-200 rounded-lg appearance-none"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={introSplitPct}
                          onChange={(e) => {
                            const val = Math.min(99, Math.max(1, Number(e.target.value) || 50));
                            setIntroSplitPct(val);
                          }}
                          className="w-14 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-center text-xs font-bold text-slate-900"
                        />
                        <span className="text-xs text-slate-500 font-bold">%</span>
                      </div>
                    </div>
                  </div>

                  {/* Dual-color visual split bar */}
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex shadow-inner">
                    <div
                      style={{ width: `${introSplitPct}%` }}
                      className="bg-blue-600 transition-all duration-200 h-full"
                    />
                    <div
                      style={{ width: `${100 - introSplitPct}%` }}
                      className="bg-amber-500 transition-all duration-200 h-full"
                    />
                  </div>

                  {/* Split Calculation Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div className="rounded-lg bg-blue-50/90 border border-blue-200 p-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-blue-900 font-semibold truncate">{introducingBrokerName} ({tx('Party A', 'पक्ष क')}):</span>
                        <span className="font-bold text-blue-700">{introSplitPct}%</span>
                      </div>
                      <div className="text-sm font-bold text-blue-950 mt-0.5">
                        {formatINR(introBrokerShareINR)}
                      </div>
                      <span className="text-[10px] text-blue-700">{tx('Introducing / Buyer\'s Broker Share', 'परिचयकर्ता / खरीदार-ब्रोकर का हिस्सा')}</span>
                    </div>

                    <div className="rounded-lg bg-amber-50/90 border border-amber-200 p-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-amber-900 font-semibold truncate">{closingBrokerName} ({tx('Party B', 'पक्ष ख')}):</span>
                        <span className="font-bold text-amber-700">{100 - introSplitPct}%</span>
                      </div>
                      <div className="text-sm font-bold text-amber-950 mt-0.5">
                        {formatINR(closingBrokerShareINR)}
                      </div>
                      <span className="text-[10px] text-amber-700">{tx('Closing / Listing Broker Share', 'क्लोज़र / लिस्टिंग ब्रोकर का हिस्सा')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ready Agreement Text Display */}
              <div className="relative">
                <div className="flex items-center justify-between pb-1.5">
                  <span className="font-mono text-[11px] text-slate-500 font-bold uppercase">
                    {tx('Sample Agreement Draft (get it reviewed by your advocate)', 'समझौते का नमूना मसौदा (अपने अधिवक्ता से जँचवाएँ)')}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopyAgreement}
                      className="inline-flex items-center gap-1 rounded bg-slate-900 px-3 py-1 text-[11px] font-bold text-white hover:bg-slate-800 transition-colors"
                    >
                      {copiedAgreement ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedAgreement ? tx('Copied!', 'कॉपी हुआ!') : tx('Copy Draft Text', 'मसौदा कॉपी करें')}</span>
                    </button>
                    <button
                      onClick={() => printText(refCode, agreementText)}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <Printer className="h-3 w-3" />
                      <span>{tx('Print', 'प्रिंट')}</span>
                    </button>
                  </div>
                </div>

                <pre className="rounded-xl bg-slate-950 p-4 font-mono text-[11px] text-slate-300 leading-relaxed overflow-x-auto max-h-60 border border-slate-800 selection:bg-amber-400 selection:text-slate-900">
                  {agreementText}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: BLACKLIST & PENALTY SLA */}
          {activeTab === 'blacklist_protocol' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 space-y-2">
                <div className="flex items-center gap-2 font-bold text-red-900 text-sm">
                  <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                  <span>{tx('Anti-Poaching Rules', 'एंटी-पोचिंग नियम')}</span>
                </div>
                <p className="text-slate-700 leading-relaxed text-xs">
                  {tx('GENZ Network takes commission withholding, direct client poaching and side deals after a verified site visit seriously. Complaints are reviewed by the admin team on the evidence recorded on the platform.', 'GENZ Network कमीशन रोकने, सीधे क्लाइंट तोड़ने और सत्यापित साइट विज़िट के बाद चुपचाप सौदे करने को गंभीरता से लेता है। शिकायतों की जाँच एडमिन टीम प्लेटफ़ॉर्म पर दर्ज सबूतों के आधार पर करती है।')}
                </p>
              </div>

              {/* Escalation Ladder */}
              <div className="space-y-2.5">
                <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
                  <span className="h-6 w-6 rounded-full bg-slate-200 text-slate-800 font-bold flex items-center justify-center shrink-0">1</span>
                  <div>
                    <h5 className="font-bold text-slate-900">{tx('Step 1: Evidence Window (about 48 hours)', 'चरण 1: सबूत देने की अवधि (लगभग 48 घंटे)')}</h5>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {tx('Both brokers are asked to submit communication proof (SMS, WhatsApp, platform OTP receipt). The deal room’s commission record is put on hold (GENZ never holds the parties’ deal money — the parties settle between themselves once the dispute is resolved).', 'दोनों ब्रोकर से बातचीत के सबूत (SMS, WhatsApp, प्लेटफ़ॉर्म OTP रसीद) माँगे जाते हैं। डील रूम का कमीशन रिकॉर्ड होल्ड पर रखा जाता है (GENZ पक्षों का डील का पैसा कभी अपने पास नहीं रखता — विवाद सुलझने पर पक्ष आपस में निपटारा करते हैं)।')}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
                  <span className="h-6 w-6 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center shrink-0">2</span>
                  <div>
                    <h5 className="font-bold text-slate-900">{tx('Step 2: Admin Review & Trust Impact', 'चरण 2: एडमिन समीक्षा और ट्रस्ट पर असर')}</h5>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      {tx('If the complaint is upheld, the admin can lower the broker’s trust standing and restrict access to exclusive mandates.', 'शिकायत सही पाई जाने पर एडमिन ब्रोकर का ट्रस्ट स्तर घटा सकता है और एक्सक्लूसिव मैंडेट तक पहुँच रोक सकता है।')}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg border border-red-200 bg-red-50/50">
                  <span className="h-6 w-6 rounded-full bg-red-600 text-white font-bold flex items-center justify-center shrink-0">3</span>
                  <div>
                    <h5 className="font-bold text-red-950">{tx('Step 3: Platform Blacklist', 'चरण 3: प्लेटफ़ॉर्म से ब्लैकलिस्ट')}</h5>
                    <p className="text-[11px] text-red-900 mt-0.5">
                      {tx('Permanent suspension from the network. The affected party may take the recorded evidence to the relevant RERA authority or other forum on their own.', 'नेटवर्क से स्थायी निलंबन। प्रभावित पक्ष दर्ज सबूत लेकर संबंधित RERA प्राधिकरण या अन्य मंच पर स्वयं जा सकता है।')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Dispute Button */}
              {onOpenDispute && (
                <div className="pt-2">
                  <button
                    onClick={() => {
                      onClose();
                      onOpenDispute();
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white p-2.5 font-bold shadow-xs transition-colors"
                  >
                    <Scale className="h-4 w-4" />
                    <span>{tx('File a Bypass or Commission Dispute Now', 'बायपास या कमीशन विवाद अभी दर्ज करें')}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 bg-slate-50 rounded-b-2xl shrink-0">
          <span className="text-[11px] text-slate-500 font-medium">
            {tx('General guidance only — not legal advice', 'केवल सामान्य जानकारी — कानूनी सलाह नहीं')}
          </span>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            {tx('Close', 'बंद करें')}
          </button>
        </div>
      </div>
    </div>
  );
};
