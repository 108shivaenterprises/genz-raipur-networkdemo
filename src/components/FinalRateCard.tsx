import { useState } from 'react';
import { IndianRupee, Handshake } from 'lucide-react';
import { useTx } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { formatINR } from '../lib/utils.js';

/**
 * v80 — "Final rate": where the price agreed at / after the visit is written down.
 * Everyone in the room reads it; the deal brokers (and the listing broker) type it. The brokerage / hisaab figures follow it by themselves.
 */
export default function FinalRateCard({ f, dealId, onChanged }: { f: any; dealId: string; onChanged: () => void }) {
  const tx = useTx();
  const [val, setVal] = useState(''); const [note, setNote] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  if (!f) return null;
  const src = f.source === 'OFFER' ? tx('accepted offer', 'मंज़ूर ऑफ़र') : f.source === 'AGREEMENT' ? tx('signed commission agreement', 'साइन हुआ कमीशन एग्रीमेंट') : f.source === 'MANUAL' ? tx('typed by a broker', 'ब्रोकर ने भरी') : tx('the asking price — no final rate yet', 'माँगी कीमत — अभी फ़ाइनल रेट नहीं');
  const waiting = f.source === 'ASKING' && ['Site Visit Done', 'Negotiation', 'Agreement'].includes(f.stage);
  const n = Number(String(val).replace(/[, ₹]/g, ''));
  const save = async () => {
    if (!(n > 0)) { setErr(tx('Enter the final rate in rupees', 'फ़ाइनल रेट रुपये में भरें')); return; }
    setBusy(true); setErr(''); setDone(false);
    try { await api.setFinalPrice(dealId, n, note.trim()); setVal(''); setNote(''); setDone(true); onChanged(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div id="final-rate-card" className={`space-y-2 rounded-xl border p-4 ${waiting ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'}`} data-testid="final-rate" data-source={f.source}>
      <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-600"><Handshake className="h-3 w-3" aria-hidden />{tx('Final rate', 'फ़ाइनल रेट')}</span>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <b className="text-lg text-slate-900" data-testid="final-rate-price">{formatINR(f.price)}</b>
        <span className="text-xs text-slate-500">{src}</span>
      </div>
      {f.source !== 'ASKING' && f.diff !== 0 && <p className="text-xs text-slate-600" data-testid="final-rate-diff">{f.diff < 0 ? tx(`${formatINR(-f.diff)} below the asking price (${formatINR(f.asking)})`, `माँगी कीमत (${formatINR(f.asking)}) से ${formatINR(-f.diff)} कम`) : tx(`${formatINR(f.diff)} above the asking price (${formatINR(f.asking)})`, `माँगी कीमत (${formatINR(f.asking)}) से ${formatINR(f.diff)} ज़्यादा`)}</p>}
      {f.source === 'MANUAL' && (f.by || f.note) && <p className="text-xs text-slate-500" data-testid="final-rate-by">{f.by ? tx(`Set by ${f.by}`, `${f.by} ने भरा`) : ''}{f.at ? ` · ${new Date(f.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}{f.note ? ` — ${f.note}` : ''}</p>}
      {waiting && f.canSet && <p className="text-xs font-semibold text-amber-800" data-testid="final-rate-hint">{tx('Rate settled at the visit? Write it here — the brokerage and the hisaab follow it.', 'विज़िट में रेट तय हो गया? यहीं लिखें — ब्रोकरेज और हिसाब इसी से बनेंगे।')}</p>}
      {f.locked && <p className="text-xs text-slate-600" data-testid="final-rate-locked">{tx('The signed commission agreement fixes this price. To change it, make a new agreement version.', 'साइन हुआ कमीशन एग्रीमेंट यह कीमत तय करता है। बदलने के लिए नया एग्रीमेंट वर्ज़न बनाएँ।')}</p>}
      {f.settled && <p className="text-xs text-slate-600">{tx('This deal is settled — the price stays as it was.', 'यह डील पूरी हो चुकी है — कीमत जैसी थी वैसी रहेगी।')}</p>}
      {f.canSet && !f.locked && (
        <div className="space-y-1.5 pt-1">
          <div className="flex gap-2">
            <label className="relative flex-1"><IndianRupee className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-slate-400" aria-hidden />
              <input value={val} onChange={e => setVal(e.target.value.replace(/[^\d,]/g, ''))} inputMode="numeric" placeholder={tx('Final rate agreed', 'तय हुआ फ़ाइनल रेट')} aria-label={tx('Final rate in rupees', 'फ़ाइनल रेट रुपये में')} className="min-h-10 w-full rounded-lg border border-slate-300 pl-8 pr-3 text-sm" data-testid="final-rate-input" /></label>
            <button type="button" onClick={save} disabled={busy || !(n > 0)} className="min-h-10 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-50" data-testid="final-rate-save">{tx('Set rate', 'रेट सेट करें')}</button>
          </div>
          {n > 0 && <p className="text-xs text-slate-500" data-testid="final-rate-preview">= {formatINR(n)}</p>}
          {/* v83 — the optional “how it was agreed” line appears once a rate is being typed (it was a second, always-open box) */}
          {(n > 0 || !!note) && <input value={note} onChange={e => setNote(e.target.value)} maxLength={120} placeholder={tx('How it was agreed (optional) — e.g. “at the visit, buyer and owner”', 'कैसे तय हुआ (वैकल्पिक) — जैसे “विज़िट पर, खरीदार और मालिक के बीच”')} className="min-h-10 w-full rounded-lg border border-slate-300 px-3 text-xs" data-testid="final-rate-note" />}
          {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
          {done && <p className="text-xs font-semibold text-emerald-700" role="status" data-testid="final-rate-done">{tx('Saved — the other side is told.', 'सेव हो गया — दूसरी तरफ़ को बता दिया गया।')}</p>}
        </div>
      )}
      {!f.canSet && !f.locked && !f.settled && <p className="text-xs text-slate-500">{tx('The deal brokers write the final rate here.', 'फ़ाइनल रेट यहाँ डील के ब्रोकर लिखते हैं।')}</p>}
    </div>
  );
}
