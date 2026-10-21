import React, { useState } from 'react';
import { ConstructionLead, UserProfile } from '../types/index.js';
import { api } from '../lib/api.js';
import { formatINR } from '../lib/utils.js';
import { useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import {
  HardHat,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Phone,
  Building,
  FileCheck2,
  DollarSign,
  Loader2,
} from 'lucide-react';

interface ConstructionViewProps {
  leads: ConstructionLead[];
  currentUser: UserProfile;
  onRefreshLeads: () => void;
  onOpenAddLead: () => void;
  /** only brokers / admins post leads; a contractor takes them */
  canSubmitLead?: boolean;
}

export const ConstructionView: React.FC<ConstructionViewProps> = ({
  leads,
  currentUser,
  onRefreshLeads,
  onOpenAddLead,
  canSubmitLead = true,
}) => {
  const tx = useTx();
  const label = useLabel();
  const [selectedLead, setSelectedLead] = useState<ConstructionLead | null>(leads[0] || null);
  const [isRequestingAccess, setIsRequestingAccess] = useState<boolean>(false);
  const [termsAccepted, setTermsAccepted] = useState<boolean>(false);
  const [submittingAccess, setSubmittingAccess] = useState<boolean>(false);

  // Settlement dialog
  const [isSettling, setIsSettling] = useState<boolean>(false);
  const [contractValue, setContractValue] = useState<number>(0);

  const handleRequestAccess = async () => {
    if (!selectedLead) return;
    if (!termsAccepted) {
      alert(tx('Please check the box to agree to the referral commission terms.', 'रेफ़रल कमीशन की शर्तें मानने के लिए बॉक्स पर टिक करें।'));
      return;
    }
    setSubmittingAccess(true);
    try {
      const res = await api.requestLeadAccess(selectedLead.id, true);
      alert(tx(`Access granted! Customer contact details disclosed. Referral obligation locked at ${res.lead.referralCommissionPct}%.`, `एक्सेस मिल गया! ग्राहक का संपर्क दिख रहा है। रेफ़रल ज़िम्मेदारी ${res.lead.referralCommissionPct}% पर पक्की।`));
      setIsRequestingAccess(false);
      onRefreshLeads();
      setSelectedLead(res.lead);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmittingAccess(false);
    }
  };

  /** Contractor: declare the final contract value. Referring broker: confirm the fee reached them. Each sends only its own half. */
  const handleSettleReferral = async (body: { finalContractValue?: number; paid?: boolean }) => {
    if (!selectedLead) return;
    try {
      const res = await api.settleConstructionReferral(selectedLead.id, body);
      alert(tx('Referral settlement record updated successfully.', 'रेफ़रल निपटान रिकॉर्ड अपडेट हो गया।'));
      setIsSettling(false);
      onRefreshLeads();
      setSelectedLead(res.lead);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const isContractor = currentUser.role === 'CONTRACTOR';
  const isSuperAdmin = currentUser.role === 'SUPERADMIN';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{tx('GENZ BUILDCON Infrastructure Alliance', 'GENZ BUILDCON इंफ्रास्ट्रक्चर अलायंस')}</span>
            <span aria-hidden="true">·</span>
            <span>{leads.length} {tx('active construction opportunities', 'चालू कंस्ट्रक्शन अवसर')}</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            {isContractor ? tx('Construction Leads You Can Take', 'आप जो कंस्ट्रक्शन लीड ले सकते हैं') : tx('Construction Lead Marketplace & Referral Pipeline', 'कंस्ट्रक्शन लीड मार्केटप्लेस और रेफ़रल पाइपलाइन')}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {tx('Turnkey civil and interior opportunities across India with a referral fee agreed upfront for the broker.', 'पूरे भारत में सिविल और इंटीरियर के अवसर — ब्रोकर की रेफ़रल फ़ीस पहले से तय।')}
          </p>
        </div>

        {canSubmitLead && (
        <button
          onClick={onOpenAddLead}
          className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition-colors"
        >
          <HardHat className="h-3.5 w-3.5 text-orange-400" />
          <span>{tx('+ Submit Construction Lead', '+ कंस्ट्रक्शन लीड जमा करें')}</span>
        </button>
        )}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Lead Cards */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {tx('Available Opportunities', 'उपलब्ध अवसर')}
          </div>
          <div className="space-y-2">
            {leads.map((lead) => {
              const isSelected = selectedLead?.id === lead.id;
              return (
                <button
                  key={lead.id}
                  onClick={() => setSelectedLead(lead)}
                  className={`w-full text-left rounded-xl p-4 border transition-all ${
                    isSelected
                      ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                      : 'border-slate-200/90 bg-white hover:border-slate-300 text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-mono font-bold ${isSelected ? 'text-amber-400' : 'text-slate-900'}`}>
                      {lead.id}
                    </span>
                    <span
                      className={`font-semibold ${
                        isSelected ? 'text-orange-300' : 'text-orange-600'
                      }`}
                    >
                      {lead.referralCommissionPct}% {tx('Referral Fee', 'रेफ़रल फ़ीस')}
                    </span>
                  </div>

                  <div className="mt-2 text-sm font-semibold truncate">
                    {lead.title}
                  </div>

                  <div className={`mt-1 text-xs ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                    {tx('Location', 'इलाका')}: {lead.approximateLocation}
                  </div>

                  <div
                    className={`mt-2 flex items-center justify-between text-xs pt-2 border-t ${
                      isSelected ? 'border-slate-800' : 'border-slate-100'
                    }`}
                  >
                    <span className={isSelected ? 'text-slate-300' : 'text-slate-500'}>
                      {tx('Est. Budget', 'अनुमानित बजट')}:
                    </span>
                    <span className="font-bold text-sm">
                      {formatINR(lead.estimatedBudget)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Lead Detail & Access Workflow */}
        <div className="lg:col-span-2">
          {selectedLead && (
            <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-6">
              {/* Header */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-bold text-slate-900">{selectedLead.id}</span>
                    <span aria-hidden="true">·</span>
                    <span>{label('constructionType', selectedLead.projectType)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{tx('Status', 'स्थिति')}: <strong className="text-slate-800">{label('leadStatus', selectedLead.status)}</strong></span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-1">
                    {selectedLead.title}
                  </h3>
                </div>

                <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-1 text-xs font-bold text-orange-800">
                  {selectedLead.referralCommissionPct}% {tx('Referral Mandate', 'रेफ़रल मैंडेट')}
                </div>
              </div>

              {/* Scope & Details */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-700">{tx('Project Scope & Specifications', 'प्रोजेक्ट का दायरा और विवरण')}:</div>
                <p className="rounded-lg bg-slate-50 p-4 text-xs text-slate-700 leading-relaxed">
                  {selectedLead.scopeDescription}
                </p>
              </div>

              {/* Lead Parameters */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 p-3 bg-white">
                  <div className="text-xs text-slate-500">{tx('Estimated Project Budget', 'अनुमानित प्रोजेक्ट बजट')}</div>
                  <div className="mt-1 text-base font-bold text-slate-900">
                    {formatINR(selectedLead.estimatedBudget)}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-3 bg-white">
                  <div className="text-xs text-slate-500">{tx('Project Timeline', 'प्रोजेक्ट की समय-सीमा')}</div>
                  <div className="mt-1 text-base font-bold text-slate-900">
                    {selectedLead.timeline}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-3 bg-white">
                  <div className="text-xs text-slate-500">{tx('Referring Broker', 'रेफ़र करने वाला ब्रोकर')}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {selectedLead.referringBrokerName}
                  </div>
                </div>
              </div>

              {/* Privacy Shield & Contact Disclosure Section */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <h4 className="text-sm font-bold text-slate-900">
                      {tx('Customer Privacy Shield & Disclosed Contact', 'ग्राहक की प्राइवेसी और बताया गया संपर्क')}
                    </h4>
                  </div>
                  <span className="text-xs text-slate-500">
                    {selectedLead.status === 'ASSIGNED' ? tx('Contact Unmasked', 'संपर्क खुला') : tx('Masked', 'छुपा हुआ')}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
                    <span className="text-slate-500">{tx('Customer Name', 'ग्राहक का नाम')}:</span>
                    <span className="font-semibold text-slate-900">
                      {selectedLead.customerNameMasked}
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
                    <span className="text-slate-500 flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5 text-slate-400" /> {tx('Customer Phone', 'ग्राहक का फ़ोन')}:
                    </span>
                    <span className="font-mono font-bold text-slate-900">
                      {selectedLead.customerPhoneHidden}
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
                    <span className="text-slate-500">{tx('Exact Project Site', 'प्रोजेक्ट साइट का पता')}:</span>
                    <span className="text-slate-700 font-medium">
                      {selectedLead.exactAddressHidden}
                    </span>
                  </div>
                </div>

                {/* Workflow Actions */}
                {selectedLead.status === 'OPEN' && !isContractor && (
                  <p className="rounded-lg bg-white p-3 text-xs text-slate-600 border border-slate-200">{tx('Waiting for a verified contractor to take this lead. You will see the contractor here once the referral agreement is signed.', 'किसी वेरिफ़ाइड कॉन्ट्रैक्टर के यह लीड लेने का इंतज़ार है। रेफ़रल एग्रीमेंट साइन होते ही कॉन्ट्रैक्टर यहाँ दिखेगा।')}</p>
                )}
                {selectedLead.status === 'OPEN' && isContractor && (
                  <div className="pt-2">
                    {!isRequestingAccess ? (
                      <button
                        onClick={() => setIsRequestingAccess(true)}
                        className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-xs font-semibold text-amber-300 hover:bg-slate-800 transition-colors shadow-xs"
                      >
                        <Lock className="h-3.5 w-3.5" />
                        <span>{tx(`Request Access & Sign ${selectedLead.referralCommissionPct}% Referral Agreement`, `एक्सेस लें और ${selectedLead.referralCommissionPct}% रेफ़रल एग्रीमेंट साइन करें`)}</span>
                      </button>
                    ) : (
                      <div className="rounded-lg bg-white p-4 border border-slate-200 space-y-3">
                        <div className="text-xs font-bold text-slate-900">
                          {tx('GENZ BUILDCON Referral Remuneration Agreement', 'GENZ BUILDCON रेफ़रल पारिश्रमिक एग्रीमेंट')}
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {tx('By requesting customer details, you covenant to pay ', 'ग्राहक का संपर्क माँगकर आप वादा करते हैं कि कुल अनुबंध मूल्य का ')}
                          <strong>{selectedLead.referralCommissionPct}%</strong>{tx(' referral brokerage on the total executed contract value to referring broker ', ' रेफ़रल ब्रोकरेज रेफ़र करने वाले ब्रोकर ')}<strong>{selectedLead.referringBrokerName}</strong>{tx(' directly, upon contract signing and mobilization. GENZ does not handle this money.', ' को सीधे देंगे — अनुबंध साइन होने और काम शुरू होने पर। यह पैसा GENZ नहीं संभालता।')}
                        </p>
                        <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={termsAccepted}
                            onChange={(e) => setTermsAccepted(e.target.checked)}
                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                          />
                          <span>{tx(`I accept and ratify the ${selectedLead.referralCommissionPct}% referral obligation`, `मैं ${selectedLead.referralCommissionPct}% रेफ़रल ज़िम्मेदारी स्वीकार करता/करती हूँ`)}</span>
                        </label>
                        <div className="flex items-center justify-end gap-2 pt-2">
                          <button
                            onClick={() => setIsRequestingAccess(false)}
                            className="text-xs text-slate-500 hover:text-slate-800"
                          >
                            {tx('Cancel', 'रद्द करें')}
                          </button>
                          <button
                            onClick={handleRequestAccess}
                            disabled={submittingAccess}
                            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            {submittingAccess ? tx('Processing...', 'हो रहा है...') : tx('Ratify & Disclose Contact', 'मंज़ूर करें और संपर्क देखें')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Settlement Ledger (When assigned or completed) — GENZ only records; the money moves directly between contractor and broker */}
                {selectedLead.status !== 'OPEN' && (() => {
                  const isAssignedContractor = isContractor && selectedLead.assignedContractorId === currentUser.id;
                  const isReferrer = currentUser.role === 'BROKER' && selectedLead.referringBrokerId === currentUser.id;
                  const declared = !!selectedLead.referralCommissionDue;
                  const canDeclare = (isAssignedContractor || isSuperAdmin) && !selectedLead.referralCommissionPaid;
                  const canConfirm = (isReferrer || isSuperAdmin) && declared && !selectedLead.referralCommissionPaid;
                  return (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
                      <span>{tx('Referral Ledger & Settlement', 'रेफ़रल खाता और निपटान')}</span>
                      {selectedLead.referralCommissionPaid ? (
                        <span className="text-emerald-800 flex items-center gap-1 font-semibold">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {tx('Settled & Paid', 'निपटा और चुकाया')}
                        </span>
                      ) : (
                        <span className="text-amber-800">{tx('Pending Settlement', 'निपटान बाकी')}</span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-emerald-800">{tx('Contract Value', 'अनुबंध मूल्य')}:</span>
                        <div className="font-bold text-slate-900 text-sm">
                          {selectedLead.finalContractValue ? formatINR(selectedLead.finalContractValue) : tx('Not declared yet', 'अभी बताया नहीं')}
                        </div>
                      </div>
                      <div>
                        <span className="text-emerald-800">{tx('Referral Fee Due', 'देय रेफ़रल फ़ीस')}:</span>
                        <div className="font-bold text-slate-900 text-sm">
                          {declared ? formatINR(selectedLead.referralCommissionDue) : tx('Pending calculation', 'हिसाब बाकी')}
                        </div>
                      </div>
                    </div>

                    {isAssignedContractor && declared && !selectedLead.referralCommissionPaid && (
                      <p className="text-[11px] text-emerald-900">{tx(`Pay ${selectedLead.referringBrokerName} directly. They confirm here once it reaches them — GENZ never holds this money.`, `${selectedLead.referringBrokerName} को सीधे भुगतान करें। उनके पास पहुँचते ही वे यहाँ कन्फ़र्म करेंगे — यह पैसा GENZ कभी नहीं रखता।`)}</p>
                    )}
                    {isReferrer && !declared && (
                      <p className="text-[11px] text-emerald-900">{tx('Waiting for the contractor to declare the final contract value.', 'कॉन्ट्रैक्टर के अंतिम अनुबंध मूल्य बताने का इंतज़ार है।')}</p>
                    )}

                    {(canDeclare || canConfirm) && (
                      <div className="pt-2 border-t border-emerald-200/60 space-y-2">
                        {canDeclare && (!isSettling ? (
                          <button
                            onClick={() => {
                              setIsSettling(true);
                              setContractValue(selectedLead.finalContractValue || selectedLead.estimatedBudget);
                            }}
                            className="text-xs font-semibold text-emerald-900 underline hover:text-emerald-950"
                          >
                            {declared ? tx('Update contract value →', 'अनुबंध मूल्य बदलें →') : tx('Declare final contract value →', 'अंतिम अनुबंध मूल्य बताएँ →')}
                          </button>
                        ) : (
                          <div className="bg-white p-3 rounded-lg border border-emerald-200 space-y-2 mt-2">
                            <div>
                              <label className="text-[11px] font-semibold text-slate-700">
                                {tx('Agreed Contract Value (INR)', 'तय अनुबंध मूल्य (₹)')}:
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={contractValue}
                                onChange={(e) => setContractValue(Number(e.target.value))}
                                className="w-full rounded border border-slate-300 p-1.5 text-xs text-slate-900 mt-0.5"
                              />
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                              <button onClick={() => setIsSettling(false)} className="text-xs text-slate-500">{tx('Cancel', 'रद्द करें')}</button>
                              <button
                                onClick={() => handleSettleReferral({ finalContractValue: contractValue })}
                                disabled={!(contractValue > 0)}
                                className="rounded bg-slate-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                {tx('Save contract value', 'अनुबंध मूल्य सेव करें')}
                              </button>
                            </div>
                          </div>
                        ))}
                        {canConfirm && (
                          <button
                            onClick={() => { if (window.confirm(tx('Confirm that you have actually received this referral fee?', 'क्या आपको यह रेफ़रल फ़ीस सच में मिल गई है?'))) handleSettleReferral({ paid: true }); }}
                            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                          >
                            {tx('I have received the referral fee', 'मुझे रेफ़रल फ़ीस मिल गई')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
