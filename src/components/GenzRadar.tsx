import React, { useEffect, useRef, useState } from 'react';
import { Radar, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
import { api } from '../lib/api.js';
import { BuyerRequirement, UserProfile } from '../types/index.js';
import { formatINR } from '../lib/utils.js';
import { PROPERTY_TYPES } from '../shared/india.js';
import { useTx } from '../lib/i18n.js';

/** v119 — GENZ Radar: the real client needs of the network, by default only the ones around the broker's own city;
 *  "Advanced search" opens any city / area / type. Same data and masking as the Needs list (the server does both). */
export const GenzRadar: React.FC<{ currentUser: UserProfile; onMatch: (r: BuyerRequirement) => void }> = ({ currentUser, onMatch }) => {
  const tx = useTx();
  const home = (currentUser.city || '').trim();
  const [adv, setAdv] = useState(false);
  const [city, setCity] = useState(home);
  const [area, setArea] = useState('');
  const [type, setType] = useState('');
  const [txn, setTxn] = useState('');
  const [rows, setRows] = useState<BuyerRequirement[] | null>(null);
  const [err, setErr] = useState('');
  const [again, setAgain] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    const t = window.setTimeout(async () => {
      try {
        const r = await api.getRequirements({ city: city.trim() || undefined, q: area.trim() || undefined, propertyType: type || undefined, limit: 60 });
        if (my === seq.current) { setRows(r.requirements); setErr(''); }
      } catch (e: any) { if (my === seq.current) setErr(e?.message || tx('Could not load', 'लोड नहीं हुआ')); }
    }, area ? 350 : 0);
    return () => window.clearTimeout(t);
  }, [city, area, type, again]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = (rows || []).filter(r => (r.status === 'active' || r.status === 'matching') && (!txn || r.transactionType === txn) && r.assignedBrokerId !== currentUser.id);
  // v120 — the needs in the broker's OWN areas (profile) come first; the rest of his city after them
  const myAreas = [...(((currentUser as any).profile?.areas as string[]) || []), (currentUser as any).homeLocality || ''].map(x => String(x).trim().toLowerCase()).filter(Boolean);
  const near = (r: BuyerRequirement) => (r.preferredLocalities || []).some(l => myAreas.includes(String(l).trim().toLowerCase()));
  if (myAreas.length) live.sort((x, y) => Number(near(y)) - Number(near(x)));
  const where = city.trim() || tx('all India', 'पूरा भारत');

  return (
    <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-slate-900 to-indigo-950 p-3.5 text-white" data-testid="genz-radar">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-bold tracking-wide">GENZ RADAR</h2>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{where}</span>
        </div>
        <button type="button" onClick={() => setAdv(a => !a)} aria-expanded={adv} data-testid="radar-adv"
          className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-white/10 px-2.5 text-[11px] font-semibold hover:bg-white/20">
          <SlidersHorizontal className="h-3.5 w-3.5" />{tx('Advanced search', 'एडवांस सर्च')}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-300">
        {adv ? tx('Any city, any area — clear the city box to look across India.', 'कोई भी शहर, कोई भी इलाका — पूरे भारत के लिए शहर खाली छोड़ें।')
          : tx(`Client needs around you (${where}). Use Advanced search for anywhere else.`, `आपके आसपास (${where}) की क्लाइंट ज़रूरतें। कहीं और की देखने के लिए एडवांस सर्च।`)}
      </p>
      {adv && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input value={city} onChange={e => setCity(e.target.value)} placeholder={tx('City', 'शहर')} aria-label={tx('City', 'शहर')} className="min-h-10 rounded-lg border border-white/20 bg-white/10 px-2.5 text-xs text-white placeholder:text-slate-400" />
          <label className="relative"><Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input value={area} onChange={e => setArea(e.target.value)} placeholder={tx('Area / locality', 'इलाका')} aria-label={tx('Area', 'इलाका')} className="min-h-10 w-full rounded-lg border border-white/20 bg-white/10 pl-7 pr-2 text-xs text-white placeholder:text-slate-400" /></label>
          <select value={type} onChange={e => setType(e.target.value)} aria-label={tx('Type', 'प्रकार')} className="min-h-10 rounded-lg border border-white/20 bg-slate-800 px-2 text-xs text-white">
            <option value="">{tx('Any type', 'कोई भी प्रकार')}</option>
            {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={txn} onChange={e => setTxn(e.target.value)} aria-label={tx('Buy or rent', 'खरीद या किराया')} className="min-h-10 rounded-lg border border-white/20 bg-slate-800 px-2 text-xs text-white">
            <option value="">{tx('Buy / Rent', 'खरीद / किराया')}</option><option value="Sale">{tx('Buy', 'खरीद')}</option><option value="Rent">{tx('Rent', 'किराया')}</option><option value="Lease">{tx('Lease', 'लीज़')}</option>
          </select>
        </div>
      )}
      {err && <p role="alert" className="mt-2 rounded bg-red-500/20 p-2 text-xs">{err} <button type="button" className="underline" onClick={() => setAgain(n => n + 1)}>{tx('Retry', 'फिर कोशिश')}</button></p>}
      {rows === null && !err && <p className="mt-2 text-xs text-slate-300">{tx('Loading…', 'लोड हो रहा है…')}</p>}
      {rows !== null && live.length === 0 && <p className="mt-2 text-xs text-slate-300">{tx(`No open client needs in ${where} right now.`, `${where} में अभी कोई खुली ज़रूरत नहीं।`)}</p>}
      <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {live.slice(0, 20).map(r => (
          <li key={r.id} className="w-60 shrink-0 rounded-xl border border-white/15 bg-white/10 p-2.5 text-xs">
            {near(r) && <p className="mb-0.5 text-[10px] font-bold uppercase text-emerald-300">📍 {tx('Your area', 'आपका इलाका')}</p>}
            <p className="font-semibold">{r.propertyType} · {r.transactionType === 'Sale' ? tx('Buy', 'खरीद') : r.transactionType === 'Rent' ? tx('Rent', 'किराया') : tx('Lease', 'लीज़')}</p>
            <p className="mt-0.5 text-slate-300">{[...(r.preferredLocalities || []).slice(0, 2), r.city].filter(Boolean).join(', ') || '—'}</p>
            <p className="mt-0.5 font-mono text-emerald-300">{formatINR(r.budgetMin)} – {formatINR(r.budgetMax)}</p>
            <button type="button" onClick={() => onMatch(r)} className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1 rounded-lg bg-indigo-500 font-semibold hover:bg-indigo-400"><Sparkles className="h-3.5 w-3.5 text-amber-300" />{tx('Match homes', 'घर मिलाएँ')}</button>
          </li>
        ))}
      </ul>
    </section>
  );
};
