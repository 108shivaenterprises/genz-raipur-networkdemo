/**
 * v31 — what each role's home was missing. One call (/api/home/insights), then a small role-shaped block under (or, for GENZ staff, above)
 * the usual home. Every line opens the screen that holds the detail.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Eye, MessageSquare, CalendarCheck, Handshake, AlertTriangle, CheckCircle2, Scale, Hammer, Users, TrendingUp, Calculator, Clock, ArrowRight, Store, Heart } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { formatINR, formatDateTime } from '../lib/utils.js';
import type { TabType } from './NavigationTabs.js';
import { CostSheet } from './CostSheet.js';
import { goto } from '../lib/goto.js';

const card = 'rounded-xl border border-slate-200 bg-white p-4';
const stat = 'rounded-lg bg-slate-50 px-3 py-2 text-center';

const Stat: React.FC<{ n: React.ReactNode; label: string; onClick?: () => void; tone?: string; testId?: string }> = ({ n, label, onClick, tone, testId }) => (
  <button type="button" onClick={onClick} disabled={!onClick} data-testid={testId} className={`${stat} ${onClick ? 'hover:bg-slate-100' : ''}`}>
    <div className={`text-xl font-bold ${tone || 'text-slate-900'}`}>{n}</div><div className="text-[11px] text-slate-500">{label}</div>
  </button>
);

export const HomeInsights: React.FC<{ role: string; onNavigate: (t: TabType) => void }> = ({ role, onNavigate }) => {
  const tx = useTx();
  const [d, setD] = useState<any>(null);
  useEffect(() => { api.homeInsights().then(r => setD(r.insights)).catch(() => setD({ role })); }, [role]);
  if (!d) return <div className="py-4"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>;

  if (d.role === 'ADMIN' || d.role === 'SUPERADMIN') {
    const items = (d.items as any[]);
    const total = items.reduce((n, i) => n + i.n, 0);
    return (
      <section className={`${card} mb-6`} data-testid="insight-admin">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Clock className="h-4 w-4 text-amber-600" />{tx('Today on GENZ', 'आज GENZ पर')}<span className="font-normal text-slate-500">· {total ? tx(`${total} things waiting`, `${total} काम बाकी`) : tx('all clear', 'सब साफ़')}</span></h3>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {items.map(i => <Stat key={i.id} testId={`today-${i.id}`} n={i.n} tone={i.n ? 'text-amber-700' : 'text-slate-400'} label={tx(i.en, i.hi)} onClick={() => onNavigate(i.tab as TabType)} />)}
        </div>
      </section>
    );
  }

  if (d.role === 'PROPERTY_OWNER') {
    const L = d.listings as any[];
    if (!L.length) return null;
    return (
      <section className={`${card} mt-6`} data-testid="insight-owner">
        <h3 className="text-sm font-bold text-slate-900">{tx('How my listings are doing', 'मेरी लिस्टिंग का हाल')}</h3>
        <div className="mt-3 space-y-2">
          {L.map(p => (
            <div key={p.id} className="rounded-lg border border-slate-100 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><div className="text-sm font-semibold text-slate-900">{p.title}</div><div className="text-xs text-slate-500">{formatINR(p.askingPrice)} · {tx(`${p.days} days listed`, `${p.days} दिन से लिस्टेड`)} · {p.status.replace('_', ' ')}</div></div>
                {p.canMarkSold && <button type="button" onClick={() => goto('desk', { sub: 'listings' }, onNavigate)} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800" data-testid={`owner-sold-${p.id}`}>{tx('Mark sold / rented', 'बिकी / किराए पर दर्ज करें')}</button>}
              </div>
              {p.demand > 0 && <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900" data-testid={`owner-demand-${p.id}`}><Users className="h-4 w-4 shrink-0" aria-hidden />{tx(`${p.demand} buyer${p.demand > 1 ? 's' : ''} on GENZ ${p.demand > 1 ? 'are' : 'is'} looking for a home like this — brokers can show it to them`, `GENZ पर ${p.demand} खरीदार इस जैसी प्रॉपर्टी ढूँढ रहे हैं — ब्रोकर उन्हें दिखा सकते हैं`)}</p>}
              <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                <div className={stat}><Eye className="mx-auto h-3.5 w-3.5 text-slate-400" /><b>{p.views}</b><div className="text-[10px] text-slate-500">{tx('poster views', 'पोस्टर व्यू')}</div></div>
                <div className={stat}><MessageSquare className="mx-auto h-3.5 w-3.5 text-slate-400" /><b>{p.enquiries}</b><div className="text-[10px] text-slate-500">{tx('enquiries', 'पूछताछ')}</div></div>
                <div className={stat}><CalendarCheck className="mx-auto h-3.5 w-3.5 text-slate-400" /><b>{p.verifiedVisits}/{p.visits}</b><div className="text-[10px] text-slate-500">{tx('visits done', 'विज़िट हुई')}</div></div>
                <div className={stat}><Handshake className="mx-auto h-3.5 w-3.5 text-slate-400" /><b>{p.offers}</b><div className="text-[10px] text-slate-500">{tx('offers', 'ऑफ़र')}</div></div>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (d.role === 'BUYER_TENANT') {
    return (
      <div className="mt-6 space-y-6" data-testid="insight-buyer">
        <section className={card}>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><CalendarCheck className="h-4 w-4 text-slate-500" />{tx('My site visits', 'मेरी साइट विज़िट')}</h3>
          {d.visits.length === 0 ? <p className="mt-2 text-xs text-slate-500">{tx('No visits yet. When a broker books a visit for you it shows here.', 'अभी कोई विज़िट नहीं। ब्रोकर आपके लिए विज़िट बुक करेगा तो यहाँ दिखेगी।')}</p> : (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">{d.visits.map((v: any) => <li key={v.id} className="flex items-center justify-between gap-2 py-2"><span>{v.title}<span className="block text-xs text-slate-500">{formatDateTime(v.at)}</span></span><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${v.verified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{v.verified ? tx('Visited ✔', 'देख ली ✔') : tx('Upcoming', 'आने वाली')}</span></li>)}</ul>
          )}
        </section>
        {/* v56 — homes I saved (Properties / Magic Match → ♡ Save) */}
        <section className={card} data-testid="buyer-saved">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Heart className="h-4 w-4 text-rose-500" />{tx('Saved homes', 'सेव किए घर')}{(d.saved || []).length > 0 && <span className="rounded-full bg-slate-100 px-2 text-xs text-slate-600">{d.saved.length}</span>}</h3>
          {(d.saved || []).length === 0 ? <p className="mt-2 text-xs text-slate-500">{tx('Tap ♡ Save on a home in Properties or Magic Match to keep it here.', 'Properties या मैजिक मैच में किसी घर पर ♡ सेव दबाएँ — वह यहाँ रहेगा।')}</p> : (
            <ul className="mt-2 divide-y divide-slate-100">
              {d.saved.map((p: any) => (
                <li key={p.id}><button type="button" onClick={() => goto('properties', { propertyId: p.id }, onNavigate)} className="flex min-h-12 w-full items-center gap-3 py-2 text-left">
                  {p.image ? <img src={p.image} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover bg-slate-100" /> : <span className="h-12 w-12 shrink-0 rounded-lg bg-slate-100" />}
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{p.title}</span><span className="block truncate text-xs text-slate-500">{p.locality}, {p.city} · {formatINR(p.askingPrice)}{p.available ? '' : ` · ${tx('no longer available', 'अब उपलब्ध नहीं')}`}</span></span>
                </button></li>
              ))}
            </ul>
          )}
        </section>
        <section className={card}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900"><Calculator className="h-4 w-4 text-slate-500" />{tx('Total cost & EMI', 'कुल ख़र्च और EMI')}</h3>
          <CostSheet />
        </section>
      </div>
    );
  }

  if (d.role === 'LEGAL_COUNSEL') {
    const m = d.membership;
    return (
      <section className={`${card} mt-6 space-y-3`} data-testid="insight-legal">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Scale className="h-4 w-4 text-slate-500" />{tx('My cases at a glance', 'मेरे केस एक नज़र में')}</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat n={d.open} label={tx('open to claim', 'लेने के लिए खुले')} onClick={() => onNavigate('legal')} tone="text-indigo-700" />
          <Stat n={d.cases.claimed} label={tx('claimed — quote due', 'लिया — कोट देना')} onClick={() => onNavigate('legal')} />
          <Stat n={d.cases.quoted} label={tx('quote sent', 'कोट भेजा')} onClick={() => onNavigate('legal')} />
          <Stat n={d.cases.accepted} label={tx('in progress', 'काम जारी')} onClick={() => onNavigate('legal')} tone="text-amber-700" />
          <Stat n={d.cases.completed} label={tx('completed', 'पूरे')} onClick={() => onNavigate('legal')} tone="text-emerald-700" />
        </div>
        <button type="button" onClick={() => onNavigate('plans')} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs ${m.warn ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`} data-testid="legal-membership">
          <span className="flex items-center gap-1.5 font-semibold">{m.warn ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {!m.active ? tx('No active membership — member rates and features are off', 'कोई चालू मेंबरशिप नहीं — मेंबर रेट और फ़ीचर बंद हैं')
              : m.daysLeft <= 0 ? tx('Membership ends today', 'मेंबरशिप आज ख़त्म')
              : m.warn ? tx(`Membership ends in ${m.daysLeft} days — renew in Plans & Fees`, `मेंबरशिप ${m.daysLeft} दिन में ख़त्म — Plans & Fees में रिन्यू करें`)
              : tx(`Membership active · ${m.daysLeft} days left`, `मेंबरशिप चालू · ${m.daysLeft} दिन बाकी`)}</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </section>
    );
  }

  if (d.role === 'DEVELOPER_BUILDER') {
    return (
      <section className={`${card} mt-6`} data-testid="insight-builder">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><TrendingUp className="h-4 w-4 text-slate-500" />{tx('This week', 'इस हफ़्ते')}</h3>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat n={d.week.leads} label={tx('new leads', 'नई लीड')} onClick={() => onNavigate('crm')} />
          <Stat n={d.week.visits} label={tx('visits scheduled / done', 'विज़िट तय / हुई')} onClick={() => onNavigate('crm')} />
          <Stat n={d.week.bookings} label={tx('booking requests', 'बुकिंग अनुरोध')} onClick={() => onNavigate('crm')} tone="text-emerald-700" />
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-600"><Users className="h-4 w-4 text-slate-400" />{d.topBroker ? tx(`Most active broker (30 days): ${d.topBroker.name} — ${d.topBroker.leads} leads`, `सबसे सक्रिय ब्रोकर (30 दिन): ${d.topBroker.name} — ${d.topBroker.leads} लीड`) : tx('No broker leads in the last 30 days yet.', 'पिछले 30 दिन में किसी ब्रोकर की लीड नहीं आई।')}</p>
      </section>
    );
  }

  if (d.role === 'CONTRACTOR') {
    return (
      <section className={`${card} mt-6`} data-testid="insight-contractor">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Hammer className="h-4 w-4 text-slate-500" />{tx('My jobs & requests', 'मेरे काम और अनुरोध')}</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat n={d.jobs.active} label={tx('active jobs', 'चालू काम')} onClick={() => onNavigate('construction')} tone="text-amber-700" />
          <Stat n={d.jobs.completed} label={tx('completed', 'पूरे')} onClick={() => onNavigate('construction')} tone="text-emerald-700" />
          <Stat n={d.requests.waiting} label={tx('requests waiting', 'अनुरोध इंतज़ार में')} onClick={() => onNavigate('construction')} />
          <Stat n={d.requests.approved} label={tx('approved', 'मंज़ूर')} onClick={() => onNavigate('construction')} />
          <Stat n={d.openLeads} label={tx('new leads to ask for', 'माँगने लायक़ नई लीड')} onClick={() => onNavigate('construction')} tone="text-indigo-700" />
        </div>
      </section>
    );
  }

  if (d.role === 'GENZ_CONNECTOR') {
    return (
      <section className={`${card} mt-6`} data-testid="insight-connector">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Store className="h-4 w-4 text-slate-500" />{tx('My numbers', 'मेरे आँकड़े')}</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat n={d.referrals} label={tx('referrals', 'रेफ़रल')} />
          <Stat n={d.won} label={tx('deals won', 'सौदे पक्के')} tone="text-emerald-700" />
          <Stat n={formatINR(d.rewardEarned)} label={tx('reward earned', 'इनाम बना')} />
          <Stat n={d.shareAsks + d.shareToConfirm} label={tx('shares waiting on you', 'हिस्से आपके जवाब पर')} tone={d.shareAsks + d.shareToConfirm ? 'text-amber-700' : undefined} />
        </div>
      </section>
    );
  }
  return null;
};
