import React, { useState } from 'react';
import { PageTitle } from './PageTitle.js';
import { Dispute, UserProfile } from '../types/index.js';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/utils.js';
import { useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import {
  Scale,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Lock,
  UserX,
  FileText,
  Loader2,
} from 'lucide-react';

interface DisputesViewProps {
  disputes: Dispute[];
  currentUser: UserProfile;
  onRefreshDisputes: () => void;
  onOpenFileDispute: (dealId?: string) => void;
}

export const DisputesView: React.FC<DisputesViewProps> = ({
  disputes,
  currentUser,
  onRefreshDisputes,
  onOpenFileDispute,
}) => {
  const tx = useTx();
  const label = useLabel();
  const reasonText = (r: string) => { const l = label('disputeReason', r); return l === r ? r.replace(/_/g, ' ') : l; };
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(disputes[0] || null);
  const [resolutionStatus, setResolutionStatus] = useState<string>('RESOLVED');
  const [notes, setNotes] = useState<string>('');
  const [liftHold, setLiftHold] = useState<boolean>(true);
  const [blacklistCounterparty, setBlacklistCounterparty] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const isAdmin = currentUser.role === 'SUPERADMIN' || currentUser.role === 'ADMIN';

  const handleResolve = async () => {
    if (!selectedDispute) return;
    setIsSubmitting(true);
    try {
      await api.resolveDispute(selectedDispute.id, {
        status: resolutionStatus,
        resolutionNotes: notes.trim() || 'Reviewed and closed by a GENZ admin.',
        liftHold,
        blacklistParty: blacklistCounterparty,
      });
      alert(tx('Your decision was saved to the audit trail.', 'आपका फ़ैसला ऑडिट ट्रेल में दर्ज हो गया।'));
      onRefreshDisputes();
      setSelectedDispute(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <PageTitle title={tx('Disputes', 'विवाद')} meta={disputes.length > 0 ? disputes.length : undefined} help={tx('Evidence kept on record, commission holds and platform sanctions — decided by a GENZ admin under the platform rules.', 'सबूत रिकॉर्ड में रखना, कमीशन होल्ड और प्लेटफ़ॉर्म कार्रवाई — GENZ एडमिन प्लेटफ़ॉर्म नियमों के तहत तय करता है।')} />
        </div>

        <button
          onClick={() => onOpenFileDispute()}
          className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-700 transition-colors"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>{tx('+ File New Dispute', '+ नया विवाद दर्ज करें')}</span>
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Disputes List */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {tx('Reported Case Files', 'दर्ज मामले')}
          </div>
          <div className="space-y-2">
            {disputes.map((d) => {
              const isSelected = selectedDispute?.id === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setSelectedDispute(d)}
                  className={`w-full text-left rounded-xl p-4 border transition-all ${
                    isSelected
                      ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                      : 'border-slate-200/90 bg-white hover:border-slate-300 text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-mono font-bold ${isSelected ? 'text-amber-400' : 'text-slate-900'}`}>
                      {d.id}
                    </span>
                    <span
                      className={`font-semibold ${
                        d.status === 'RESOLVED'
                          ? isSelected ? 'text-emerald-300' : 'text-emerald-700'
                          : isSelected ? 'text-amber-300' : 'text-amber-700'
                      }`}
                    >
                      {label('disputeStatus', d.status)}
                    </span>
                  </div>

                  <div className="mt-2 text-sm font-semibold truncate">
                    {reasonText(d.reason)}
                  </div>

                  <div className={`mt-1 text-xs truncate ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                    {tx('Against', 'किसके खिलाफ़')}: {d.counterpartyName}
                  </div>

                  <div
                    className={`mt-2 flex items-center justify-between text-xs pt-2 border-t ${
                      isSelected ? 'border-slate-800' : 'border-slate-100'
                    }`}
                  >
                    <span className={isSelected ? 'text-slate-400' : 'text-slate-500'}>
                      {tx('By', 'किसने')}: {d.complainantName}
                    </span>
                    {d.settlementHold && (
                      <span className="flex items-center gap-1 text-red-500 font-semibold text-[11px]">
                        <Lock className="h-3 w-3" /> {tx('Hold Active', 'रोक लगी है')}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Case Details & Admin Resolution */}
        <div className="lg:col-span-2">
          {selectedDispute ? (
            <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-6">
              {/* Header */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-bold text-slate-900">{selectedDispute.id}</span>
                    <span aria-hidden="true">·</span>
                    <span>{tx('Filed', 'दर्ज')}: {formatDate(selectedDispute.createdAt)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{tx('Status', 'स्थिति')}: <strong className="text-slate-900">{label('disputeStatus', selectedDispute.status)}</strong></span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-1">
                    {tx('Allegation', 'आरोप')}: {reasonText(selectedDispute.reason)}
                  </h3>
                </div>

                {selectedDispute.settlementHold && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-xs font-bold text-red-800 flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-red-600" />
                    <span>{tx('Commission Settlement Frozen', 'कमीशन निपटान रुका है')}</span>
                  </div>
                )}
              </div>

              {/* Case Summary */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                  <span className="text-slate-500">{tx('Complainant', 'शिकायतकर्ता')}:</span>
                  <div className="mt-1 font-bold text-slate-900 text-sm">
                    {selectedDispute.complainantName} ({selectedDispute.complainantRole})
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                  <span className="text-slate-500">{tx('Respondent / Counterparty', 'दूसरा पक्ष')}:</span>
                  <div className="mt-1 font-bold text-slate-900 text-sm">
                    {selectedDispute.counterpartyName}
                  </div>
                </div>
              </div>

              {/* Factual Statement */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700">{tx('Complainant Factual Narrative', 'शिकायतकर्ता का बयान')}:</div>
                <div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-700 leading-relaxed border border-slate-200/60">
                  {selectedDispute.description}
                </div>
              </div>

              {/* Resolution Notes if Resolved */}
              {selectedDispute.resolutionNotes && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>{tx('Admin decision', 'एडमिन का फ़ैसला')}:</span>
                  </div>
                  <p className="text-emerald-900 leading-relaxed">
                    {selectedDispute.resolutionNotes}
                  </p>
                </div>
              )}

              {/* Admin Arbitration Form */}
              {isAdmin && selectedDispute.status !== 'RESOLVED' && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Scale className="h-4 w-4 text-blue-600" />
                    {tx('Admin decision desk', 'एडमिन फ़ैसला डेस्क')}
                  </h4>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">{tx('Decision', 'फ़ैसला')}:</label>
                      <select
                        value={resolutionStatus}
                        onChange={(e) => setResolutionStatus(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                      >
                        <option value="RESOLVED">{tx('Resolved (Mediation Settlement Ratified)', 'सुलझी (मध्यस्थता समझौता मंज़ूर)')}</option>
                        <option value="DISMISSED">{tx('Dismissed (Insufficient Evidence)', 'खारिज (सबूत अपर्याप्त)')}</option>
                        <option value="MEDIATION">{tx('Mediation Adjourned / Hearing Scheduled', 'मध्यस्थता स्थगित / सुनवाई तय')}</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700">{tx('Decision Notes & Rationale', 'फ़ैसले का कारण और नोट')}:</label>
                      <textarea
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={tx('Write what you found and what you decided...', 'जाँच में क्या मिला और क्या तय किया — लिखें...')}
                        className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                      />
                    </div>

                    <div className="space-y-2 pt-1">
                      <label className="flex items-center gap-2 text-xs text-slate-800">
                        <input
                          type="checkbox"
                          checked={liftHold}
                          onChange={(e) => setLiftHold(e.target.checked)}
                        />
                        <span>{tx('Lift financial settlement hold on deal room commissions', 'डील रूम कमीशन के निपटान की रोक हटाएँ')}</span>
                      </label>

                      <label className="flex items-center gap-2 text-xs text-red-700 font-semibold">
                        <input
                          type="checkbox"
                          checked={blacklistCounterparty}
                          onChange={(e) => setBlacklistCounterparty(e.target.checked)}
                        />
                        <span>{tx(`Enforce Blacklist Sanction against ${selectedDispute.counterpartyName} (Revokes network privileges)`, `${selectedDispute.counterpartyName} पर ब्लैकलिस्ट कार्रवाई करें (नेटवर्क के अधिकार खत्म)`)}</span>
                      </label>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        onClick={handleResolve}
                        disabled={isSubmitting}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        {isSubmitting ? tx('Recording...', 'दर्ज हो रहा है...') : tx('Execute Binding Ruling', 'बाध्यकारी फ़ैसला लागू करें')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 p-12 text-center text-slate-500 text-xs">
              {disputes.length === 0 ? tx('No disputes filed. If someone bypasses the platform or does not pay an agreed fee, file one here.', 'कोई विवाद दर्ज नहीं। कोई प्लेटफ़ॉर्म को बायपास करे या तय फ़ीस न दे तो यहाँ दर्ज करें।') : tx('Select a dispute record on the left to inspect evidence and rulings.', 'सबूत और फ़ैसले देखने के लिए बाईं ओर से कोई विवाद चुनें।')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
