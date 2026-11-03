import React, { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';

/**
 * v115 — on my listing: how many OTHER brokers hold a client need it fits (Propi's "5 agents have a matching requirement"),
 * the needs without any client detail, and one tap a day to tell those brokers. Loads by itself; hidden when nothing fits.
 */
export const ListingBuyers: React.FC<{ propertyId: string }> = ({ propertyId }) => {
  const tx = useTx();
  const [d, setD] = useState<any>(null); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const load = () => api.listingNeeds(propertyId).then(setD).catch(() => setD(false));
  useEffect(() => { const t = setTimeout(load, 100 + Math.random() * 500); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [propertyId]);
  if (d === null) return <p className="flex w-full items-center gap-1.5 text-[11px] text-slate-500"><Loader2 className="h-3 w-3 animate-spin" />{tx('Looking for buyers in the network…', 'नेटवर्क में खरीदार देख रहे हैं…')}</p>;
  if (!d || !d.count) return null;
  const budget = (n: any) => n.budgetMax > 0 ? `${n.budgetMin > 0 ? `${formatINR(n.budgetMin)}–` : ''}${formatINR(n.budgetMax)}` : tx('budget open', 'बजट खुला');
  const tell = async () => {
    setBusy(true); setMsg('');
    try { const r = await api.listingTell(propertyId); setMsg(tx(`Sent to ${r.sentTo} broker${r.sentTo > 1 ? 's' : ''} ✓`, `${r.sentTo} ब्रोकर को भेजा ✓`)); load(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="w-full" data-testid="listing-buyers">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-2 text-left text-xs font-semibold text-emerald-900">
        <span>🤝 {tx(`${d.brokers} broker${d.brokers > 1 ? 's have' : ' has'} a client for this (${d.count} need${d.count > 1 ? 's' : ''})`, `${d.brokers} ब्रोकर के पास इसका क्लाइंट है (${d.count} ज़रूरत)`)}</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          <ul className="space-y-1">{d.top.map((n: any) => (
            <li key={n.id} className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] text-slate-700 ring-1 ring-slate-200">
              <b className="text-slate-900">{n.type}</b> · {(n.localities || []).join(', ') || tx('any area', 'कोई भी इलाका')} · {budget(n)}
              <span className="float-right font-bold text-emerald-700">{n.score}%</span>
              <div className="text-slate-500">{n.broker ? `${n.broker.name}${n.broker.company ? ` · ${n.broker.company}` : ''}` : ''} · {n.days ? tx(`${n.days}d ago`, `${n.days} दिन पहले`) : tx('today', 'आज')}</div>
            </li>))}</ul>
          <p className="text-[11px] text-slate-500">{tx('Client names and numbers stay with their broker. Tell them — they open your listing and make an offer.', 'क्लाइंट का नाम-नंबर उनके ब्रोकर के पास ही रहता है। उन्हें बताइए — वे आपकी लिस्टिंग खोलकर ऑफ़र देंगे।')}</p>
          <button type="button" disabled={busy || !d.canTell} onClick={tell} data-testid="listing-tell"
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {d.canTell ? tx(`Tell these ${d.brokers} broker${d.brokers > 1 ? 's' : ''}`, `इन ${d.brokers} ब्रोकरों को बताएँ`) : tx('Told today — again tomorrow', 'आज बता दिया — कल फिर')}
          </button>
          {msg && <p className="text-[11px] font-semibold text-slate-700" role="status">{msg}</p>}
        </div>
      )}
    </div>
  );
};
