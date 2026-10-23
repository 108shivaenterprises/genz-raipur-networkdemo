import React, { useState, useEffect } from 'react';
import { PageTitle } from './PageTitle.js';
import { Property, BuyerRequirement } from '../types/index.js';
import { api } from '../lib/api.js';
import { formatINR } from '../lib/utils.js';
import { useTx } from '../lib/i18n.js';
import { useLabel, useReason } from '../lib/labels.js';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Building,
  UserCheck,
  Send,
  Loader2,
} from 'lucide-react';

interface MatchCenterViewProps {
  properties: Property[];
  requirements: BuyerRequirement[];
  selectedRequirementId?: string;
  selectedPropertyId?: string;
  onOpenCollaborationModal: (data: { propertyId: string; requirementId?: string; receivingBrokerId: string }) => void;
  /** broker-only action; a buyer / owner never sees the button */
  canPropose?: boolean;
  /** matching a property against other customers' needs is not open to buyers */
  canMatchByProperty?: boolean;
}

export const MatchCenterView: React.FC<MatchCenterViewProps> = ({
  properties,
  requirements,
  selectedRequirementId,
  selectedPropertyId,
  onOpenCollaborationModal,
  canPropose = true,
  canMatchByProperty = true,
}) => {
  const tx = useTx();
  const label = useLabel();
  const reasonOf = useReason();
  const [activeReqId, setActiveReqId] = useState<string>(
    selectedRequirementId || (requirements[0] ? requirements[0].id : '')
  );
  const [activePropId, setActivePropId] = useState<string>(selectedPropertyId || '');
  const [modeState, setMode] = useState<'by_requirement' | 'by_property'>('by_requirement');
  const mode = canMatchByProperty ? modeState : 'by_requirement';

  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (mode === 'by_requirement' && activeReqId) {
      setLoading(true);
      api
        .getMatchesForRequirement(activeReqId)
        .then((res) => {
          setMatches(res.matches || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else if (mode === 'by_property' && activePropId) {
      setLoading(true);
      api
        .getMatchesForProperty(activePropId)
        .then((res) => {
          setMatches(res.matches || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [mode, activeReqId, activePropId]);

  const currentReq = requirements.find((r) => r.id === activeReqId);
  const currentProp = properties.find((p) => p.id === activePropId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <PageTitle title={canMatchByProperty ? tx('Matches', 'मैच') : tx('Properties for you', 'आपके लिए प्रॉपर्टी')} help={<>{tx('Matches evaluated across geographic proximity, budget boundaries, category classification, and built-up tolerances.', 'मैच इलाके, बजट, प्रॉपर्टी के प्रकार और क्षेत्रफल की सीमा के आधार पर जाँचे जाते हैं।')} {tx('Same scoring rules every time, city-aware.', 'हर बार वही तय नियम, शहर के हिसाब से।')}</>} />
        </div>

        {/* Mode Toggle */}
        {canMatchByProperty && <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs">
          <button
            onClick={() => setMode('by_requirement')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
              mode === 'by_requirement'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCheck className="h-3.5 w-3.5" />
            <span>{tx('Match by Buyer', 'खरीदार से मैच')}</span>
          </button>
          <button
            onClick={() => setMode('by_property')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
              mode === 'by_property'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building className="h-3.5 w-3.5" />
            <span>{tx('Match by Property', 'प्रॉपर्टी से मैच')}</span>
          </button>
        </div>}
      </div>

      {/* Target Selector Bar */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
        {mode === 'by_requirement' ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center justify-between">
            <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto">
              <label htmlFor="select-requirement" className="text-xs font-semibold text-slate-700 shrink-0">
                {canMatchByProperty ? tx('Active Buyer Need:', 'खरीदार की ज़रूरत:') : tx('My requirement:', 'मेरी ज़रूरत:')}
              </label>
              <select
                id="select-requirement"
                value={activeReqId}
                onChange={(e) => setActiveReqId(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none sm:flex-none"
              >
                {requirements.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id}: {r.customerName || ''} — {label('propertyType', r.propertyType)} {tx('in', 'में')} {(r.preferredLocalities || []).join(', ')} ({formatINR(r.budgetMin)} - {formatINR(r.budgetMax)})
                  </option>
                ))}
              </select>
            </div>
            {currentReq && (
              <div className="text-xs text-slate-500">
                {tx('Target Budget', 'बजट')}: <strong className="text-slate-900">{formatINR(currentReq.budgetMin)} - {formatINR(currentReq.budgetMax)}</strong>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center justify-between">
            <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto">
              <label htmlFor="select-property" className="text-xs font-semibold text-slate-700 shrink-0">
                {tx('Active Property:', 'प्रॉपर्टी:')}
              </label>
              <select
                id="select-property"
                value={activePropId || (properties[0]?.id || '')}
                onChange={(e) => setActivePropId(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none sm:flex-none"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id}: {p.title} — {p.locality || ''} ({formatINR(p.askingPrice)})
                  </option>
                ))}
              </select>
            </div>
            {currentProp && (
              <div className="text-xs text-slate-500">
                {tx('Asking Price', 'माँगी कीमत')}: <strong className="text-slate-900">{formatINR(currentProp.askingPrice)}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center p-12 text-slate-500 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-slate-900" />
          <span className="text-sm">{tx('Computing match scores across the property network...', 'पूरे प्रॉपर्टी नेटवर्क में मैच स्कोर निकाले जा रहे हैं...')}</span>
        </div>
      )}

      {/* Match Results */}
      {!loading && matches.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-slate-300" />
          <h3 className="mt-2 text-sm font-semibold text-slate-900">{tx('No compatible matches found', 'कोई मेल खाती प्रॉपर्टी नहीं मिली')}</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            {canMatchByProperty ? tx('Try adjusting budget caps, adding neighboring localities, or registering additional inventory.', 'बजट सीमा बदलकर, पास के इलाके जोड़कर या और इन्वेंटरी दर्ज करके देखें।') : tx('Try a wider budget or add nearby localities to your requirement.', 'अपनी ज़रूरत में बजट बढ़ाकर या पास के इलाके जोड़कर देखें।')}
          </p>
        </div>
      )}

      {!loading && matches.length > 0 && (
        <div className="space-y-4">
          <div className="text-xs font-medium text-slate-500">
            {tx('Top Matched Opportunities', 'सबसे अच्छे मैच')} ({matches.length})
          </div>

          <div className="grid grid-cols-1 gap-4">
            {matches.filter((it) => it && (mode === 'by_requirement' ? it.property : it.requirement)).map((item, index) => {
              const isPropMatch = mode === 'by_requirement';
              const score = item.score;
              const breakdown = item.breakdown || {};

              return (
                <div
                  key={index}
                  className="overflow-hidden rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs hover:border-slate-300 transition-all"
                >
                  {isPropMatch && item.property.images?.[0] && (
                    <div className="-mx-5 -mt-5 mb-4 h-32 bg-slate-100 sm:h-36" data-testid="match-cover">
                      <img src={item.property.images[0]} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
                    </div>
                  )}
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    {/* Left: Score Badge & Title */}
                    <div className="space-y-2 lg:max-w-2xl">
                      <div className="flex items-center gap-3">
                        {/* Score Circle / Meter */}
                        <div
                          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-bold text-sm tracking-tight ${
                            score >= 80
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : score >= 50
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-50 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {score}%
                        </div>

                        <div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-mono font-bold text-slate-800">
                              {isPropMatch ? item.property.id : item.requirement.id}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {label('propertyType', isPropMatch ? item.property.propertyType : item.requirement.propertyType)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-slate-900">
                              {isPropMatch
                                ? `${item.property.locality}${item.property.city ? ', ' + item.property.city : ''}`
                                : (item.requirement?.preferredLocalities || []).join(', ')}
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-slate-900 mt-0.5">
                            {isPropMatch ? item.property.title : `${tx('Buyer', 'खरीदार')}: ${item.requirement.customerName}`}
                          </h3>
                        </div>
                      </div>

                      {/* Reasons Breakdown List */}
                      <div className="mt-2 space-y-1">
                        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          {tx('Why this matched:', 'यह मैच क्यों हुआ:')}
                        </div>
                        <ul className="space-y-1 text-xs text-slate-600">
                          {(item.reasons || []).map((reason: string, rIdx: number) => (
                            <li key={rIdx} className="flex items-center gap-1.5">
                              <span className="text-emerald-600 font-bold">✓</span>
                              <span>{reasonOf(String(reason))}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Criteria Checklist */}
                      <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          {breakdown.locationMatch ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-slate-300" />
                          )}
                          {tx('Location', 'इलाका')}
                        </span>
                        <span className="flex items-center gap-1">
                          {breakdown.budgetMatch ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-slate-300" />
                          )}
                          {tx('Budget', 'बजट')}
                        </span>
                        <span className="flex items-center gap-1">
                          {breakdown.typeMatch ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-slate-300" />
                          )}
                          {tx('Category', 'प्रकार')}
                        </span>
                        <span className="flex items-center gap-1">
                          {breakdown.areaMatch ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-slate-300" />
                          )}
                          {tx('Area Space', 'क्षेत्रफल')}
                        </span>
                      </div>
                    </div>

                    {/* Right: Price & Collaboration Action */}
                    <div className="flex flex-col items-start lg:items-end justify-between gap-3 border-t lg:border-t-0 lg:border-l border-slate-100 pt-3 lg:pt-0 lg:pl-6 shrink-0">
                      <div className="lg:text-right">
                        <div className="text-xs text-slate-500">
                          {isPropMatch ? tx('Asking Price:', 'माँगी कीमत:') : tx('Target Budget:', 'बजट:')}
                        </div>
                        <div className="text-lg font-bold text-slate-900">
                          {isPropMatch
                            ? formatINR(item.property.askingPrice)
                            : `${formatINR(item.requirement.budgetMin)} - ${formatINR(item.requirement.budgetMax)}`}
                        </div>
                      </div>

                      {canPropose && (
                      <button
                        onClick={() =>
                          onOpenCollaborationModal({
                            propertyId: isPropMatch ? item.property.id : activePropId,
                            requirementId: isPropMatch ? activeReqId : item.requirement.id,
                            receivingBrokerId: isPropMatch
                              ? item.property.listingBrokerId
                              : item.requirement.assignedBrokerId,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition-colors"
                      >
                        <Send className="h-3.5 w-3.5 text-amber-400" />
                        <span>{tx('Co-broking offer', 'को-ब्रोकिंग ऑफ़र')}</span>
                      </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
