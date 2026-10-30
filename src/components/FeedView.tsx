import React, { useEffect, useState } from 'react';
import { Loader2, Home, Megaphone, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';
import type { TabType } from './NavigationTabs.js';

const Who: React.FC<{ b: any }> = ({ b }) => {
  const tx = useTx();
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
      {b.name}{b.company ? ` · ${b.company}` : ''}
      <span className="rounded bg-slate-900 px-1 text-[10px] font-bold text-white" title={tx(b.levelEn, b.levelHi)}>{b.level}</span>
      {b.rera ? <ShieldCheck className="h-3 w-3 text-emerald-600" aria-label="RERA no. on file" /> : <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-800">{tx('Local', 'लोकल')}</span>}
    </span>
  );
};

/** v92 — the network's live feed: new listings + needs brokers sent to the network, with how each one fits me. */
export const FeedView: React.FC<{ onNavigate: (t: TabType) => void }> = ({ onNavigate }) => {
  const tx = useTx();
  const [items, setItems] = useState<any[] | null>(null);
  const [kind, setKind] = useState<'all' | 'listings' | 'needs'>('all');
  const [err, setErr] = useState('');
  useEffect(() => { setItems(null); api.feed(kind).then(r => setItems(r.items || [])).catch(e => { setErr(e.message); setItems([]); }); }, [kind]);
  const ago = (iso: string) => { const h = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 3600_000)); return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`; };
  return (
    <div className="space-y-3" data-testid="feed-view">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-900">{tx('Network feed', 'नेटवर्क फ़ीड')}</h2>
        <div className="flex gap-1 text-xs">
          {(['all', 'listings', 'needs'] as const).map(k => (
            <button key={k} onClick={() => setKind(k)} className={`rounded-full px-3 py-1 font-semibold ${kind === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
              {k === 'all' ? tx('All', 'सब') : k === 'listings' ? tx('Homes', 'घर') : tx('Needs', 'ज़रूरतें')}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-slate-500">{tx('New homes and buyer needs from verified brokers (last 14 days). Clients are never named.', 'वेरिफ़ाइड ब्रोकरों के नए घर और ख़रीदार की ज़रूरतें (14 दिन)। क्लाइंट का नाम कभी नहीं दिखता।')}</p>
      {!items && <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />}
      {err && <p className="text-xs text-red-700">{err}</p>}
      {items && !items.length && !err && <p className="rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-500">{tx('Nothing new yet.', 'अभी कुछ नया नहीं।')}</p>}
      {items?.map(it => it.kind === 'LISTING' ? (
        <div key={it.id} className="rounded-xl border border-slate-200 bg-white p-3" data-testid="feed-listing">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><div className="flex items-center gap-1 text-[11px] font-semibold text-indigo-700"><Home className="h-3 w-3" /> {tx('New home', 'नया घर')} · {ago(it.at)}</div>
              <div className="truncate text-sm font-bold text-slate-900">{it.title}</div>
              <div className="text-xs text-slate-600">{it.type} · {it.locality}, {it.city}</div></div>
            <div className="shrink-0 text-right text-sm font-bold text-slate-900">{formatINR(it.price)}{it.deal !== 'Sale' ? <span className="text-[10px] font-normal"> /mo</span> : null}</div>
          </div>
          <div className="mt-1"><Who b={it.broker} /></div>
          {it.myClientsFit > 0 && <button onClick={() => onNavigate('matches')} className="mt-2 w-full rounded-lg bg-emerald-50 py-1.5 text-xs font-semibold text-emerald-800">{tx(`${it.myClientsFit} of your clients fit this — see matches`, `आपके ${it.myClientsFit} क्लाइंट से मेल खाता है — मैच देखें`)}</button>}
        </div>
      ) : (
        <div key={it.id} className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3" data-testid="feed-need">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-indigo-700"><Megaphone className="h-3 w-3" /> {tx('Buyer need', 'ख़रीदार की ज़रूरत')} · {ago(it.at)}</div>
          <div className="text-sm font-bold text-slate-900">{it.line}</div>
          <div className="mt-1"><Who b={it.broker} /></div>
          {it.myHomesFit > 0 && <button onClick={() => onNavigate('requirements')} className="mt-2 w-full rounded-lg bg-emerald-600 py-1.5 text-xs font-bold text-white">{tx(`You have ${it.myHomesFit} matching home${it.myHomesFit > 1 ? 's' : ''} — tap “I have it”`, `आपके पास ${it.myHomesFit} मिलते घर हैं — “मेरे पास है” दबाएँ`)}</button>}
        </div>
      ))}
    </div>
  );
};
