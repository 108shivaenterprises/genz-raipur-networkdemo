/**
 * ✨ Magic Match (v54 — was "Matches").
 * The same deterministic scoring as before (city + locality, budget overlap, category, area tolerance); only the screen changed:
 * one compact card per match (photo, title, type · locality, price, score), the four checks as small chips, "Why this match" opens the
 * reasons and the ids, and the list shows 8 at a time instead of every match at once.
 */
import React, { useState, useEffect } from 'react';
import { PageTitle } from './PageTitle.js';
import { PropertyThumb } from './PropertyThumb.js';
import { Property, BuyerRequirement } from '../types/index.js';
import { api } from '../lib/api.js';
import { formatINR } from '../lib/utils.js';
import { useTx } from '../lib/i18n.js';
import { useLabel, useReason } from '../lib/labels.js';
import { matchAction, mineFirst } from '../shared/matchOfferRules.js';
import { Sparkles, Check, X, Building, UserCheck, Send, Loader2, ChevronDown, Heart, MessagesSquare } from 'lucide-react';

interface MatchCenterViewProps {
  properties: Property[];
  requirements: BuyerRequirement[];
  selectedRequirementId?: string;
  selectedPropertyId?: string;
  onOpenCollaborationModal: (data: { propertyId: string; requirementId?: string; receivingBrokerId: string }) => void;
  /** broker-only action; a buyer / owner never sees the button */
  canPropose?: boolean;
  /** v68 — my own id: a match between my own home and my own buyer is not a co-broking case */
  meId?: string;
  /** matching a property against other customers' needs is not open to buyers */
  canMatchByProperty?: boolean;
}

const PAGE = 8;
const initials = (n?: string) => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

export const MatchCenterView: React.FC<MatchCenterViewProps> = ({
  properties,
  requirements,
  selectedRequirementId,
  selectedPropertyId,
  onOpenCollaborationModal,
  canPropose = true,
  meId,
  canMatchByProperty = true,
}) => {
  const tx = useTx();
  const label = useLabel();
  const reasonOf = useReason();
  // v80 — the screen starts on MY buyer / MY home (not on somebody else's), and lists mine first
  const myReqs = mineFirst(requirements, (r) => !!meId && r.assignedBrokerId === meId);
  const myProps = mineFirst(properties, (p) => !!meId && p.listingBrokerId === meId);
  const [activeReqId, setActiveReqId] = useState<string>(selectedRequirementId || (myReqs[0] ? myReqs[0].id : ''));
  const [activePropId, setActivePropId] = useState<string>(selectedPropertyId || (myProps[0] ? myProps[0].id : ''));
  useEffect(() => { if (!activeReqId && myReqs[0]) setActiveReqId(myReqs[0].id); }, [requirements.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!activePropId && myProps[0]) setActivePropId(myProps[0].id); }, [properties.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [modeState, setMode] = useState<'by_requirement' | 'by_property'>('by_requirement');
  const mode = canMatchByProperty ? modeState : 'by_requirement';

  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [shown, setShown] = useState(PAGE);
  const [why, setWhy] = useState('');
  // v56 — a buyer (no co-broking) saves homes instead
  const [saved, setSaved] = useState<Set<string>>(new Set());
  useEffect(() => { if (!canPropose) api.savedList().then(r => setSaved(new Set(r.ids || []))).catch(() => undefined); }, [canPropose]);
  const toggleSave = async (id: string) => { try { const r = await api.savedToggle(id); setSaved(x => { const n = new Set(x); if (r.saved) n.add(id); else n.delete(id); return n; }); } catch { /* not available any more */ } };

  useEffect(() => {
    setShown(PAGE); setWhy('');
    if (mode === 'by_requirement' && activeReqId) {
      setLoading(true);
      api.getMatchesForRequirement(activeReqId).then((res) => { setMatches(res.matches || []); setLoading(false); }).catch(() => setLoading(false));
    } else if (mode === 'by_property' && activePropId) {
      setLoading(true);
      api.getMatchesForProperty(activePropId).then((res) => { setMatches(res.matches || []); setLoading(false); }).catch(() => setLoading(false));
    }
  }, [mode, activeReqId, activePropId]);

  const currentReq = requirements.find((r) => r.id === activeReqId);
  const currentProp = properties.find((p) => p.id === activePropId);
  const list = matches.filter((it) => it && (mode === 'by_requirement' ? it.property : it.requirement));
  const sel = 'min-h-11 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none';
  const modeBtn = (on: boolean) => `inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors sm:flex-none ${on ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`;

  return (
    <div className="space-y-4" data-testid="magic-match">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle
          testId="magic-title"
          title={<span className="inline-flex items-center gap-1.5"><Sparkles className="h-5 w-5 text-amber-500" aria-hidden />{tx('Magic Match', 'मैजिक मैच')}</span>}
          meta={!loading && list.length ? (canMatchByProperty ? tx(`${list.length} matches`, `${list.length} मैच`) : tx(`${list.length} homes for you`, `आपके लिए ${list.length} घर`)) : undefined}
          help={<>{canMatchByProperty
            ? tx('Your buyer’s need is checked against every live listing (and a listing against every buyer need): city and locality, budget, type of property and area.', 'आपके खरीदार की ज़रूरत हर लाइव लिस्टिंग से मिलाई जाती है (और लिस्टिंग हर खरीदार की ज़रूरत से): शहर और इलाका, बजट, प्रॉपर्टी का प्रकार और क्षेत्रफल।')
            : tx('Homes that fit your need: city and locality, budget, type of property and area.', 'आपकी ज़रूरत से मेल खाते घर: शहर और इलाका, बजट, प्रॉपर्टी का प्रकार और क्षेत्रफल।')}{' '}{tx('The same fixed rules every time — no guessing.', 'हर बार वही तय नियम — कोई अंदाज़ा नहीं।')}</>}
        />
        {canMatchByProperty && (
          <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1" role="tablist">
            <button role="tab" aria-selected={mode === 'by_requirement'} onClick={() => setMode('by_requirement')} className={modeBtn(mode === 'by_requirement')} data-testid="magic-by-buyer"><UserCheck className="h-4 w-4" />{tx('For a buyer', 'खरीदार के लिए')}</button>
            <button role="tab" aria-selected={mode === 'by_property'} onClick={() => setMode('by_property')} className={modeBtn(mode === 'by_property')} data-testid="magic-by-property"><Building className="h-4 w-4" />{tx('For a property', 'प्रॉपर्टी के लिए')}</button>
          </div>
        )}
      </div>

      {/* what to match */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        {mode === 'by_requirement' ? (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">{canMatchByProperty ? tx('Buyer need', 'खरीदार की ज़रूरत') : tx('My requirement', 'मेरी ज़रूरत')}</span>
            <select id="select-requirement" value={activeReqId} onChange={(e) => setActiveReqId(e.target.value)} className={sel}>
              {(() => {
                const opt = (r: BuyerRequirement) => (
                  <option key={r.id} value={r.id}>
                    {r.customerName ? `${r.customerName} — ` : ''}{label('propertyType', r.propertyType)} {tx('in', 'में')} {(r.preferredLocalities || []).join(', ')} ({formatINR(r.budgetMin)}–{formatINR(r.budgetMax)})
                  </option>
                );
                const mine = myReqs.filter((r) => r.assignedBrokerId === meId); const rest = myReqs.filter((r) => r.assignedBrokerId !== meId);
                if (!mine.length || !rest.length) return myReqs.map(opt);
                return [<optgroup key="m" label={tx('My buyers', 'मेरे खरीदार')}>{mine.map(opt)}</optgroup>, <optgroup key="o" label={tx('Other brokers’ buyers', 'दूसरे ब्रोकरों के खरीदार')}>{rest.map(opt)}</optgroup>];
              })()}
            </select>
            {currentReq && <span className="mt-1 block text-xs text-slate-500">{tx('Budget', 'बजट')}: <strong className="text-slate-900">{formatINR(currentReq.budgetMin)} – {formatINR(currentReq.budgetMax)}</strong></span>}
          </label>
        ) : (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">{tx('Property', 'प्रॉपर्टी')}</span>
            <select id="select-property" value={activePropId || (myProps[0]?.id || '')} onChange={(e) => setActivePropId(e.target.value)} className={sel}>
              {(() => {
                const opt = (p: Property) => <option key={p.id} value={p.id}>{p.title} — {p.locality || ''} ({formatINR(p.askingPrice)})</option>;
                const mine = myProps.filter((p) => p.listingBrokerId === meId); const rest = myProps.filter((p) => p.listingBrokerId !== meId);
                if (!mine.length || !rest.length) return myProps.map(opt);
                return [<optgroup key="m" label={tx('My listings', 'मेरी लिस्टिंग')}>{mine.map(opt)}</optgroup>, <optgroup key="o" label={tx('Other brokers’ listings', 'दूसरे ब्रोकरों की लिस्टिंग')}>{rest.map(opt)}</optgroup>];
              })()}
            </select>
            {currentProp && <span className="mt-1 block text-xs text-slate-500">{tx('Asking price', 'माँगी कीमत')}: <strong className="text-slate-900">{formatINR(currentProp.askingPrice)}</strong></span>}
          </label>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 p-10 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-slate-900" />
          <span className="text-sm">{tx('Finding matches…', 'मैच ढूँढ रहे हैं…')}</span>
        </div>
      )}

      {!loading && list.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center" data-testid="magic-empty">
          <Sparkles className="mx-auto h-8 w-8 text-slate-300" />
          <h3 className="mt-2 text-sm font-semibold text-slate-900">{tx('No match yet', 'अभी कोई मैच नहीं')}</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            {canMatchByProperty ? tx('Try a wider budget, nearby localities, or add more listings.', 'बजट थोड़ा बढ़ाएँ, पास के इलाके जोड़ें, या और लिस्टिंग डालें।') : tx('Try a wider budget or add nearby localities to your requirement.', 'अपनी ज़रूरत में बजट बढ़ाकर या पास के इलाके जोड़कर देखें।')}
          </p>
        </div>
      )}

      {!loading && list.length > 0 && (
        <div className="space-y-2.5">
          {list.slice(0, shown).map((item, index) => {
            const isPropMatch = mode === 'by_requirement';
            const p = item.property; const r = item.requirement;
            const score = item.score;
            const b = item.breakdown || {};
            const key = `${isPropMatch ? p.id : r.id}-${index}`;
            const open = why === key;
            // v68/v80 — what this card may offer ME: my own home & my own buyer → a client room; one side mine → an offer to the OTHER broker; neither mine → nothing
            const act = matchAction(meId, isPropMatch ? p?.listingBrokerId : currentProp?.listingBrokerId, isPropMatch ? currentReq?.assignedBrokerId : r?.assignedBrokerId);
            const own = act.kind === 'OWN';
            const tone = score >= 80 ? 'bg-emerald-100 text-emerald-800' : score >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700';
            const checks: [boolean, string, string][] = [[!!b.locationMatch, 'Location', 'इलाका'], [!!b.budgetMatch, 'Budget', 'बजट'], [!!b.typeMatch, 'Type', 'प्रकार'], [!!b.areaMatch, 'Area', 'क्षेत्रफल']];
            return (
              <div key={key} className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs" data-testid="match-card">
                <div className="flex gap-3">
                  {isPropMatch
                    ? <PropertyThumb src={p.images?.[0]} type={p.propertyType} seed={p.title || p.id} className="h-20 w-20 rounded-lg" />
                    : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700" aria-hidden>{initials(r.customerName)}</span>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-slate-900">{isPropMatch ? p.title : `${tx('Buyer', 'खरीदार')}: ${r.customerName}`}</h3>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-sm font-bold ${tone}`} data-testid="match-score">{score}%</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-slate-600" data-testid="match-sub">
                      {label('propertyType', isPropMatch ? p.propertyType : r.propertyType)} · {isPropMatch ? `${p.locality}${p.city ? ', ' + p.city : ''}` : (r.preferredLocalities || []).join(', ')}
                    </p>
                    <p className="mt-0.5 text-base font-bold text-slate-900">{isPropMatch ? formatINR(p.askingPrice) : `${formatINR(r.budgetMin)} – ${formatINR(r.budgetMax)}`}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5" data-testid="match-checks">
                  {checks.map(([ok, en, hiL]) => (
                    <span key={en} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${ok ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                      {ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}{tx(en, hiL)}
                    </span>
                  ))}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <button type="button" onClick={() => setWhy(open ? '' : key)} aria-expanded={open} className="-ml-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50" data-testid="match-why">
                    {tx('Why this match', 'यह मैच क्यों')}<ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {!canPropose && isPropMatch && (
                    <button type="button" onClick={() => void toggleSave(p.id)} aria-pressed={saved.has(p.id)} className={`ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-semibold ${saved.has(p.id) ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-300 bg-white text-slate-700'}`} data-testid="match-save">
                      <Heart className={`h-4 w-4 ${saved.has(p.id) ? 'fill-rose-500 text-rose-500' : ''}`} />{saved.has(p.id) ? tx('Saved', 'सेव है') : tx('Save', 'सेव करें')}
                    </button>
                  )}
                  {canPropose && own && (
                    <button
                      onClick={() => {
                        const req = isPropMatch ? currentReq : r; const home = isPropMatch ? p : currentProp;
                        try { sessionStorage.setItem('genz.newroom', JSON.stringify({ clientName: req?.customerName || '', phone: String(req?.customerPhone || '').replace(/\D/g, '').slice(-10), kind: 'BUYER', note: `Magic Match · ${home?.title || ''}`.slice(0, 190), homeId: home?.id || '', homeTitle: home?.title || '' })); } catch { /* storage blocked: the form opens empty */ }
                        window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: 'clientroom' }));
                      }}
                      className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 text-sm font-semibold text-white hover:bg-emerald-800"
                      data-testid="match-own-room"
                    >
                      <MessagesSquare className="h-4 w-4" />{tx('Your own home & buyer — open client room', 'आपका अपना घर और खरीदार — क्लाइंट रूम खोलें')}
                    </button>
                  )}
                  {canPropose && act.kind === 'OFFER' && (
                    <button
                      onClick={() => onOpenCollaborationModal({
                        propertyId: isPropMatch ? p.id : activePropId,
                        requirementId: isPropMatch ? activeReqId : r.id,
                        receivingBrokerId: act.to,
                      })}
                      className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-sm font-semibold text-white hover:bg-slate-800"
                      data-testid="match-offer"
                    >
                      <Send className="h-4 w-4 text-amber-400" />{tx('Co-broking offer', 'को-ब्रोकिंग ऑफ़र')}
                    </button>
                  )}
                  {canPropose && act.kind === 'NONE' && (
                    <span className="ml-auto max-w-[11rem] text-right text-xs leading-snug text-slate-500" data-testid="match-not-mine">{tx('Neither this home nor this buyer is yours', 'न यह घर आपका है, न यह खरीदार')}</span>
                  )}
                </div>
                {open && (
                  <div className="mt-1 rounded-lg bg-slate-50 p-2.5" data-testid="match-why-list">
                    <ul className="space-y-1 text-sm text-slate-700">
                      {(item.reasons || []).map((reason: string, i: number) => <li key={i} className="flex gap-1.5"><span className="font-bold text-emerald-600">✓</span><span>{reasonOf(String(reason))}</span></li>)}
                    </ul>
                    <p className="mt-1.5 font-mono text-xs text-slate-500">{isPropMatch ? p.id : r.id}</p>
                  </div>
                )}
              </div>
            );
          })}
          {list.length > shown && (
            <button type="button" onClick={() => setShown((s) => s + PAGE)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:border-slate-900" data-testid="match-more">
              {tx(`Show ${Math.min(PAGE, list.length - shown)} more (of ${list.length - shown})`, `${Math.min(PAGE, list.length - shown)} और दिखाएँ (${list.length - shown} में से)`)}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
