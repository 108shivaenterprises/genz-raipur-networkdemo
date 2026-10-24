import { useState } from 'react';
import { IndianRupee } from 'lucide-react';
import { useTx } from '../lib/i18n.js';
import { money } from '../shared/consentRules.js';
import { api } from '../lib/api.js';

/** v66 — the owner's mandate applied to the deal's final price. Shown only to the owner and the listing broker (the server sends it only to them). */
export default function BrokerageAtPrice({ b, dealId, onChanged }: { b: any; dealId: string; onChanged: () => void }) {
  const tx = useTx();
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!b?.mandate) return null;
  const src = b.source === 'OFFER' ? tx('accepted offer', 'मंज़ूर ऑफ़र') : b.source === 'AGREEMENT' ? tx('signed commission agreement', 'साइन हुआ कमीशन एग्रीमेंट') : b.source === 'MANUAL' ? tx('typed by a broker', 'ब्रोकर ने भरी') : tx('asking price (no final price yet)', 'माँगी कीमत (अभी फ़ाइनल कीमत नहीं)');
  const rule = b.basis === 'PERCENTAGE' ? tx(`${b.pct}% of the final price`, `फ़ाइनल कीमत का ${b.pct}%`) : b.basis === 'FIXED_FEE' ? tx(`fixed fee ${money(b.fee)}`, `फिक्स्ड फ़ीस ${money(b.fee)}`) : tx(`owner’s net ${money(b.net)}, the rest is the broker’s`, `मालिक को नेट ${money(b.net)}, ऊपर की रकम ब्रोकर की`);
  const diff = b.broker - b.brokerAtAsking;
  const save = async () => {
    const n = Number(String(val).replace(/[, ]/g, ''));
    if (!(n > 0)) { setErr(tx('Enter the final price in rupees', 'फ़ाइनल कीमत रुपये में भरें')); return; }
    setBusy(true); setErr('');
    try { await api.setFinalPrice(dealId, n); setVal(''); onChanged(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="bg-white border border-emerald-200 rounded-xl p-4 space-y-2" data-testid="brokerage-at-price">
      <span className="text-[10px] uppercase font-semibold text-emerald-700 tracking-wider flex items-center gap-1"><IndianRupee className="h-3 w-3" />{tx('Brokerage at the final price', 'फ़ाइनल कीमत पर ब्रोकरेज')}</span>
      <div className="text-xs text-slate-600">{tx('Final price', 'फ़ाइनल कीमत')}: <b className="text-slate-900" data-testid="bap-price">{money(b.price)}</b> <span className="text-slate-500">· {src}</span></div>
      <div className="text-xs text-slate-600">{tx('Owner’s mandate', 'मालिक का मैंडेट')}: {rule}</div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-emerald-50 p-2"><div className="text-[10px] text-emerald-700 font-semibold">{tx('Listing broker gets', 'लिस्टिंग ब्रोकर को')}</div><div className="text-sm font-bold text-emerald-900" data-testid="bap-broker">{money(b.broker)}</div></div>
        <div className="rounded-lg bg-slate-50 p-2"><div className="text-[10px] text-slate-500 font-semibold">{tx('Owner receives', 'मालिक को मिलेगा')}</div><div className="text-sm font-bold text-slate-900" data-testid="bap-owner">{money(b.owner)}</div></div>
      </div>
      {diff !== 0 && <p className="text-[11px] text-slate-600">{diff < 0 ? tx(`${money(-diff)} less than at the asking price (${money(b.brokerAtAsking)}).`, `माँगी कीमत वाले हिसाब (${money(b.brokerAtAsking)}) से ${money(-diff)} कम।`) : tx(`${money(diff)} more than at the asking price (${money(b.brokerAtAsking)}).`, `माँगी कीमत वाले हिसाब (${money(b.brokerAtAsking)}) से ${money(diff)} ज़्यादा।`)}</p>}
      {b.belowNet && <p className="text-[11px] font-semibold text-red-700" data-testid="bap-below-net">{tx('The price is below the owner’s net amount — the broker gets nothing and the owner receives less than he asked. Settle this with the owner first.', 'कीमत मालिक की नेट रकम से कम है — ब्रोकर को कुछ नहीं मिलेगा और मालिक को अपनी माँग से कम मिलेगा। पहले मालिक से तय करें।')}</p>}
      {b.canSetPrice && b.source !== 'AGREEMENT' && (
        <div className="pt-1">
          <div className="flex gap-2">
            <input value={val} onChange={e => setVal(e.target.value)} inputMode="numeric" placeholder={tx('Final price ₹ (if no offer)', 'फ़ाइनल कीमत ₹ (ऑफ़र न हो तो)')} className="min-h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm" data-testid="bap-input" />
            <button type="button" onClick={save} disabled={busy} className="min-h-10 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-50" data-testid="bap-save">{tx('Set', 'सेट करें')}</button>
          </div>
          {err && <p className="pt-1 text-[11px] text-red-700">{err}</p>}
        </div>
      )}
      <p className="text-[10px] text-slate-500">{tx('Only you and the owner see this. GENZ takes no part of it; the owner pays the broker directly.', 'ये सिर्फ़ आपको और मालिक को दिखता है। GENZ इसमें से कुछ नहीं लेता; मालिक सीधे ब्रोकर को देता है।')}</p>
    </div>
  );
}
