import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';

/**
 * v115 — Propi's "demand vs supply", for the broker's own city: per area, open client needs (last 120 days) against live listings.
 * The rule of thumb is on every row: more demand → list here (it moves fast); more supply → post your client's need here (options come to you).
 */
export const DemandSupply: React.FC = () => {
  const tx = useTx();
  const [deal, setDeal] = useState<'ALL' | 'Sale' | 'Rent'>('ALL'); const [seg, setSeg] = useState<'ALL' | 'RES' | 'COM'>('ALL');
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { setD(null); setErr(''); api.demandSupply({ deal, seg }).then(setD).catch(e => setErr(e.message)); }, [deal, seg]);
  const chip = (on: boolean) => `min-h-9 rounded-full px-3 text-[11px] font-semibold ${on ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`;
  const TIP: Record<string, [string, string, string]> = {
    LIST: ['List here — it moves fast', 'यहाँ लिस्ट करें — जल्दी बिकेगा', 'bg-emerald-100 text-emerald-800'],
    POST: ['Post your client’s need here', 'यहाँ क्लाइंट की ज़रूरत डालें', 'bg-sky-100 text-sky-800'],
    EVEN: ['Balanced', 'बराबर', 'bg-slate-100 text-slate-600'],
  };
  if (err) return null;   // a role that may not read the network board simply does not see the card
  const max = d ? Math.max(1, ...d.rows.map((r: any) => Math.max(r.demand, r.supply))) : 1;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3" data-testid="demand-supply">
      <h3 className="text-sm font-bold text-slate-900">{tx('Demand vs supply', 'माँग बनाम सप्लाई')}{d?.city ? ` · ${d.city}` : ''}</h3>
      <p className="text-[11px] text-slate-500">{tx('Open client needs (last 120 days) against live listings, area by area.', 'इलाके-वार: खुली क्लाइंट ज़रूरतें (पिछले 120 दिन) बनाम लाइव लिस्टिंग।')}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(['ALL', 'Sale', 'Rent'] as const).map(x => <button key={x} type="button" onClick={() => setDeal(x)} aria-pressed={deal === x} className={chip(deal === x)}>{x === 'ALL' ? tx('All', 'सभी') : x === 'Sale' ? tx('Sale', 'बिक्री') : tx('Rent / lease', 'किराया / लीज़')}</button>)}
        <span className="mx-1 w-px bg-slate-200" />
        {(['ALL', 'RES', 'COM'] as const).map(x => <button key={x} type="button" onClick={() => setSeg(x)} aria-pressed={seg === x} className={chip(seg === x)}>{x === 'ALL' ? tx('All types', 'सभी प्रकार') : x === 'RES' ? tx('Residential', 'रिहायशी') : tx('Commercial', 'कमर्शियल')}</button>)}
      </div>
      {!d ? <Loader2 className="mt-3 h-5 w-5 animate-spin text-slate-400" /> : (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-amber-50 p-2"><div className="text-lg font-bold text-amber-800">{d.demand}</div><div className="text-[11px] text-amber-900">{tx('client needs', 'क्लाइंट ज़रूरतें')}</div></div>
            <div className="rounded-lg bg-emerald-50 p-2"><div className="text-lg font-bold text-emerald-800">{d.supply}</div><div className="text-[11px] text-emerald-900">{tx('live listings', 'लाइव लिस्टिंग')}</div></div>
            <div className="rounded-lg bg-slate-50 p-2"><div className="text-lg font-bold text-slate-800">{d.areas}</div><div className="text-[11px] text-slate-600">{tx('areas', 'इलाके')}</div></div>
          </div>
          {d.rows.length === 0 ? <p className="mt-3 text-xs text-slate-500">{tx('Nothing posted here yet.', 'यहाँ अभी कुछ नहीं डाला गया।')}</p> : (
            <ul className="mt-3 space-y-2">{d.rows.map((r: any) => (
              <li key={r.area} className="text-xs" data-testid="ds-row">
                <div className="flex items-center justify-between gap-2"><b className="truncate text-slate-900">{r.area}</b><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${TIP[r.tip][2]}`}>{tx(TIP[r.tip][0], TIP[r.tip][1])}</span></div>
                <div className="mt-1 grid grid-cols-[3.5rem_1fr] items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-600">
                  <span>{tx('Needs', 'ज़रूरत')} {r.demand}</span><span className="h-2 rounded-full bg-amber-100"><span className="block h-2 rounded-full bg-amber-500" style={{ width: `${(r.demand / max) * 100}%` }} /></span>
                  <span>{tx('Listings', 'लिस्टिंग')} {r.supply}</span><span className="h-2 rounded-full bg-emerald-100"><span className="block h-2 rounded-full bg-emerald-500" style={{ width: `${(r.supply / max) * 100}%` }} /></span>
                </div>
              </li>))}</ul>
          )}
        </>
      )}
    </section>
  );
};
