import React, { useEffect, useRef, useState } from 'react';
import { PageTitle } from './PageTitle.js';
import { api } from '../lib/api.js';
import { BuyerRequirement, UserProfile } from '../types/index.js';
import { formatINR, formatArea, getRequirementWhatsAppShareUrl } from '../lib/utils.js';
import { UserCheck, Sparkles, Phone, ShieldCheck, Share2, Search, MessageCircle } from 'lucide-react';
import { useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { BroadcastButton, BroadcastInbox, MyBroadcasts, NetworkHas } from './BroadcastPanels.js';

interface RequirementsViewProps {
  requirements: BuyerRequirement[];
  currentUser: UserProfile;
  onOpenAddRequirement: () => void;
  onSelectRequirementForMatching: (req: BuyerRequirement) => void;
  /** v20: big network → the app holds my clients + the newest needs; the rest is searched on the server */
  scope?: { total: number; scoped: boolean };
}

/** v90 — put this client need into Today & Clients (with the client's agreement) so follow-ups, matches and reminders start. */
const AddToClients: React.FC<{ req: BuyerRequirement }> = ({ req }) => {
  const tx = useTx();
  const [open, setOpen] = useState(false); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ good: boolean; text: string } | null>(null);
  if (!(req as any).customerName || !(req as any).customerPhone) return null;
  const add = async () => {
    setBusy(true); setMsg(null);
    try {
      await api.clientAdd({
        name: (req as any).customerName, phone: String((req as any).customerPhone).replace(/\D/g, '').slice(-10), budgetMin: req.budgetMin, budgetMax: req.budgetMax,
        city: req.city || '', areas: (req.preferredLocalities || []).slice(0, 8), propertyType: req.propertyType, transactionType: req.transactionType,
        tags: (req.preferredTags || []).slice(0, 8), notes: `From need ${req.id}`, consent: true, clientRef: `req-${req.id}`,
      });
      setMsg({ good: true, text: tx('Added to Today & Clients.', 'Today & Clients में जुड़ गया।') }); setOpen(false);
    } catch (e: any) { setMsg({ good: /already/i.test(e.message), text: /already/i.test(e.message) ? tx('Already in your Clients.', 'यह पहले से आपके क्लाइंट में है।') : e.message }); setOpen(false); }
    finally { setBusy(false); }
  };
  return (
    <div className="mt-2" data-testid="req-add-client">
      {!open && !msg?.good && <button type="button" onClick={() => setOpen(true)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50" data-testid="req-add-client-btn">👤 {tx('Add to Today & Clients', 'Today & Clients में जोड़ें')}</button>}
      {open && (
        <div className="space-y-2 rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-xs">
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={ok} onChange={(e) => setOk(e.target.checked)} data-testid="req-add-client-ok" />{tx('The client agreed that I may contact him about homes.', 'क्लाइंट ने मकानों के बारे में मुझसे संपर्क की सहमति दी है।')}</label>
          <div className="flex gap-2"><button type="button" disabled={!ok || busy} onClick={add} className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white disabled:opacity-40" data-testid="req-add-client-go">{busy ? '…' : tx('Add', 'जोड़ें')}</button><button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700">{tx('Cancel', 'रद्द')}</button></div>
        </div>
      )}
      {msg && <p className={`mt-1 text-[11px] ${msg.good ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p>}
    </div>
  );
};

export const RequirementsView: React.FC<RequirementsViewProps> = ({
  requirements,
  currentUser,
  onOpenAddRequirement,
  onSelectRequirementForMatching,
  scope,
}) => {
  const tx = useTx();
  const label = useLabel();
  // A buyer sees only their own needs: the broker tools (WhatsApp share of a client need) are not theirs.
  const isBuyer = currentUser?.role === 'BUYER_TENANT';
  const [searchReqId, setSearchReqId] = React.useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('reqId') || '';
    }
    return '';
  });

  // v20: "my clients" vs "network needs", search, server pages on a big network, cards drawn 30 at a time
  const mineOf = (r: BuyerRequirement) => r.assignedBrokerId === currentUser?.id || (r as any).buyerId === currentUser?.id;
  const [view, setView] = useState<'mine' | 'network'>(() => (requirements.some(mineOf) ? 'mine' : 'network'));
  const serverMode = !!scope?.scoped;
  const wantsRemote = serverMode && view === 'network';
  const [remote, setRemote] = useState<{ list: BuyerRequirement[]; total: number; hasMore: boolean; loading: boolean; err: string } | null>(null);
  const seq = useRef(0);
  const fetchRemote = async (more: boolean) => {
    const my = ++seq.current; const offset = more && remote ? remote.list.length : 0;
    setRemote(r => ({ list: more && r ? r.list : [], total: r?.total || 0, hasMore: false, loading: true, err: '' }));
    try {
      const r = await api.getRequirements({ q: searchReqId.trim() || undefined, limit: 60, offset });
      if (my !== seq.current) return;
      setRemote(prev => ({ list: [...(more && prev ? prev.list : []), ...r.requirements], total: r.total ?? r.requirements.length, hasMore: !!r.hasMore, loading: false, err: '' }));
    } catch (e: any) {
      if (my === seq.current) setRemote(prev => ({ list: prev?.list || [], total: prev?.total || 0, hasMore: false, loading: false, err: e?.message || 'Could not load' }));
    }
  };
  useEffect(() => {
    if (!wantsRemote) { seq.current++; setRemote(null); return; }
    const t = window.setTimeout(() => fetchRemote(false), searchReqId.trim() ? 350 : 0);
    return () => window.clearTimeout(t);
  }, [wantsRemote, searchReqId]); // eslint-disable-line react-hooks/exhaustive-deps

  const local = requirements.filter((req) => {
    if (!isBuyer && view === 'mine' && !mineOf(req)) return false;
    if (!searchReqId) return true;
    const q = searchReqId.toLowerCase();
    return (
      req.id.toLowerCase().includes(q) ||
      req.propertyType.toLowerCase().includes(q) ||
      (req.city || '').toLowerCase().includes(q) ||
      req.preferredLocalities.some((l) => l.toLowerCase().includes(q))
    );
  });
  const displayedRequirements = remote ? remote.list : local;
  const [visibleCount, setVisibleCount] = useState(30);
  useEffect(() => { setVisibleCount(30); }, [view, searchReqId]);
  const myCount = requirements.filter(mineOf).length;

  return (
    <div className="space-y-6">
      {currentUser.role === 'BROKER' && <><BroadcastInbox /><MyBroadcasts /></>}
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <PageTitle title={isBuyer ? tx('Your needs', 'आपकी ज़रूरतें') : tx('Buyer & tenant needs', 'खरीदार और किरायेदार की ज़रूरतें')} meta={remote ? tx(`${remote.list.length} of ${remote.total} shown`, `${remote.total} में से ${remote.list.length} दिख रही हैं`) : displayedRequirements.length} help={isBuyer
              ? tx('Tell us what you are looking for. Verified brokers can pick it up, and your best matches show in Magic Match.', 'बताइए आप क्या ढूँढ रहे हैं। वेरिफ़ाइड ब्रोकर इसे उठा सकते हैं, और आपके सबसे अच्छे मैच मैजिक मैच में दिखते हैं।')
              : tx('Customer entities are persistent. Deal protection is deal-scoped, allowing multiple independent requirements.', 'ग्राहक की पहचान स्थायी रहती है। डील सुरक्षा हर डील के लिए अलग है, इसलिए कई स्वतंत्र ज़रूरतें हो सकती हैं।')} />
          {searchReqId && <p className="mt-1 text-xs font-medium text-amber-700">{tx('Filtered by', 'फ़िल्टर')}: {searchReqId}</p>}
        </div>

        <div className="flex items-center gap-2">
          {searchReqId && (
            <button
              onClick={() => setSearchReqId('')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 border border-slate-200 bg-white px-2.5 py-2 rounded-lg"
            >
              {tx('Clear Filter', 'फ़िल्टर हटाएँ')}
            </button>
          )}
          {!isBuyer && currentUser.role === 'BROKER' && (
            <button
              onClick={() => { try { window.location.href = '/?tab=properties&drafts=1'; } catch { /* */ } }}
              className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
              data-testid="req-from-whatsapp"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>{tx('Paste needs from WhatsApp', 'WhatsApp से ज़रूरत पेस्ट करें')}</span>
            </button>
          )}
          <button
            onClick={onOpenAddRequirement}
            className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition-colors"
          >
            <UserCheck className="h-3.5 w-3.5 text-amber-400" />
            <span>{isBuyer ? tx('+ Add my requirement', '+ मेरी ज़रूरत जोड़ें') : tx('+ Add Buyer Requirement', '+ खरीदार की ज़रूरत जोड़ें')}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {!isBuyer && (
          <div className="flex gap-1.5" role="tablist" aria-label={tx('Whose needs', 'किसकी ज़रूरतें')}>
            <button type="button" role="tab" aria-selected={view === 'mine'} onClick={() => setView('mine')} className={`min-h-11 rounded-lg px-3 text-xs font-semibold ${view === 'mine' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>{tx('My clients', 'मेरे क्लाइंट')} ({myCount})</button>
            <button type="button" role="tab" aria-selected={view === 'network'} onClick={() => setView('network')} className={`min-h-11 rounded-lg px-3 text-xs font-semibold ${view === 'network' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>{tx('Network needs', 'नेटवर्क की ज़रूरतें')} ({serverMode ? scope!.total : requirements.length})</button>
          </div>
        )}
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={searchReqId} onChange={e => setSearchReqId(e.target.value)} placeholder={tx('Search: ID, type, city or locality', 'खोजें: ID, प्रकार, शहर या इलाका')} aria-label={tx('Search needs', 'ज़रूरतें खोजें')}
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm" />
        </label>
      </div>
      {!isBuyer && view === 'network' && <p className="text-[11px] text-slate-500">{tx('Other brokers’ clients show by initials only — talk to their broker through a co-broking offer.', 'दूसरे ब्रोकर के क्लाइंट सिर्फ़ नाम के पहले अक्षरों से दिखते हैं — उनके ब्रोकर से को-ब्रोकिंग ऑफ़र से बात करें।')}</p>}
      {remote?.err && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-800">{remote.err}</p>}
      {displayedRequirements.length === 0 && !remote?.loading && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">{view === 'mine' && !isBuyer ? tx('No client needs of yours yet — add one, or look at the network needs.', 'अभी आपके किसी क्लाइंट की ज़रूरत नहीं — जोड़ें, या नेटवर्क की ज़रूरतें देखें।') : tx('Nothing matches this search.', 'इस खोज से कुछ नहीं मिला।')}</p>
      )}

      {/* Grid of Requirements */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {displayedRequirements.slice(0, visibleCount).map((req) => (
          <div
            key={req.id}
            className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs hover:border-slate-300 transition-all space-y-4"
          >
            <div>
              {/* Header */}
              <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-100">
                <span className="font-mono font-bold text-slate-900">{req.id}</span>
                <span className="font-mono text-slate-500">{req.customerId}</span>
              </div>

              {/* Customer and Purpose */}
              <div className="mt-3">
                <h3 className="text-base font-bold text-slate-900">{req.customerName}</h3>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="font-mono">{req.customerPhone}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-500">{label('purpose', req.purpose)}</span>
                </div>
              </div>

              {/* Requirement Details */}
              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">{tx('Target Budget', 'बजट')}:</span>
                  <span className="font-bold text-slate-900">
                    {formatINR(req.budgetMin)} - {formatINR(req.budgetMax)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{tx('Category', 'प्रकार')}:</span>
                  <span className="font-medium text-slate-800">
                    {label('propertyType', req.propertyType)} ({label('transactionType', req.transactionType)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{tx('Required Space', 'ज़रूरी जगह')}:</span>
                  <span className="text-slate-700">
                    {req.minAreaSqFt ? `${formatArea(req.minAreaSqFt)} - ${formatArea(req.maxAreaSqFt)}` : tx('Flexible', 'लचीला')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{tx('Timeline', 'समय-सीमा')}:</span>
                  <span className="font-medium text-amber-800">{label('urgency', req.urgency)}</span>
                </div>
              </div>

              {/* Preferred Localities */}
              <div className="mt-3">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  {tx('Target Localities', 'पसंदीदा इलाके')}:
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-700">
                  {req.preferredLocalities.map((loc, idx) => (
                    <span
                      key={idx}
                      className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 border border-slate-200/60"
                    >
                      {loc}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Match CTA & Quick Share */}
            <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
              <button
                onClick={() => onSelectRequirementForMatching(req)}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 py-2 text-xs font-semibold text-amber-300 hover:bg-slate-800 transition-colors shadow-xs"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>{isBuyer ? tx('See matching properties', 'मैच होती प्रॉपर्टी देखें') : tx('Calculate Matching', 'मैचिंग निकालें')}</span>
              </button>
              {!isBuyer && (
              <a
                href={getRequirementWhatsAppShareUrl(req)}
                target="_blank"
                rel="noopener noreferrer"
                title={tx('Quick Share Requirement on WhatsApp with deep link', 'WhatsApp पर ज़रूरत झटपट शेयर करें')}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 hover:border-emerald-500 transition-colors shadow-2xs"
              >
                <Share2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>{tx('Quick Share', 'झटपट शेयर')}</span>
              </a>
              )}
            </div>
            {currentUser.role === 'BROKER' && req.assignedBrokerId === currentUser.id && ['active', 'matching'].includes(req.status) && <AddToClients req={req} />}
            {currentUser.role === 'BROKER' && req.assignedBrokerId === currentUser.id && ['active', 'matching'].includes(req.status) && <NetworkHas requirementId={req.id} />}
            {currentUser.role === 'BROKER' && req.assignedBrokerId === currentUser.id && ['active', 'matching'].includes(req.status) && <BroadcastButton requirementId={req.id} />}
          </div>
        ))}
      </div>
      {(displayedRequirements.length > visibleCount || remote?.hasMore) && (
        <div className="flex justify-center">
          <button type="button" disabled={remote?.loading} onClick={() => { if (displayedRequirements.length > visibleCount) setVisibleCount(v => v + 30); else fetchRemote(true); }}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 disabled:opacity-50">{remote?.loading ? tx('Loading…', 'लोड हो रहा है…') : tx('Show more', 'और दिखाएँ')}</button>
        </div>
      )}
    </div>
  );
};
