import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Ticket } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';

/** v199 (D20) — the buyer's GENZ Mudra: a discount voucher (not money). Balance, expiry, the terms, and a "use it" form for a GENZ-affiliated service partner booked through GENZ. */
export const MudraVoucher: React.FC = () => {
  const tx = useTx();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [ok, setOk] = useState('');
  const [f, setF] = useState({ partnerId: '', invoiceRef: '', invoiceAmount: '', amount: '', via: false });
  const load = useCallback(() => api.mudraMe().then(x => { setD(x); setErr(''); }).catch(e => setErr(e.message)), []);
  useEffect(() => { void load(); }, [load]);
  if (!d) return err ? <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600" role="alert">{err}</p> : <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-label="Loading" />;
  if (!d.config.enabled) return null;
  const next = d.lots.length ? [...d.lots].sort((a: any, b: any) => a.expiresAt.localeCompare(b.expiresAt))[0] : null;
  const p = d.config.partners.find((x: any) => x.id === f.partnerId);
  const redeem = async () => {
    setBusy(true); setErr(''); setOk('');
    try { await api.mudraRedeem({ partnerId: f.partnerId, invoiceRef: f.invoiceRef.trim(), invoiceAmount: Number(f.invoiceAmount), amount: Number(f.amount), bookedViaGenz: true }); setOk(tx('Discount recorded.', 'डिस्काउंट दर्ज हो गया।')); setF({ partnerId: '', invoiceRef: '', invoiceAmount: '', amount: '', via: false }); await load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const inp = 'min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm';
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4" data-testid="mudra-voucher">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Ticket className="h-4 w-4 text-amber-700" aria-hidden />{tx('GENZ Mudra — discount voucher', 'GENZ मुद्रा — डिस्काउंट वाउचर')}</h3>
      <p className="mt-1 text-2xl font-extrabold text-slate-900" data-testid="mudra-balance">{formatINR(d.balance)}</p>
      <p className="text-xs text-slate-600">{next ? tx(`Next expiry ${new Date(next.expiresAt).toLocaleDateString('en-IN')}`, `अगली समाप्ति ${new Date(next.expiresAt).toLocaleDateString('en-IN')}`) : tx(`You earn ${d.config.pct}% of the brokerage as a voucher after a verified site visit and an activated commission agreement. Valid ${d.config.validityDays} days.`, `वेरिफ़ाइड साइट विज़िट और चालू कमीशन एग्रीमेंट के बाद ब्रोकरेज का ${d.config.pct}% वाउचर मिलता है। वैधता ${d.config.validityDays} दिन।`)}</p>
      <p className="mt-1 text-[11px] text-slate-600">{tx('Not money: it cannot be withdrawn or given to anyone. Use it only as a discount at a GENZ-affiliated service partner, booked through GENZ.', 'यह पैसा नहीं है: इसे निकाला या किसी को दिया नहीं जा सकता। सिर्फ़ GENZ से जुड़े सर्विस पार्टनर पर, GENZ के ज़रिए बुकिंग में डिस्काउंट के लिए।')}</p>
      {d.balance > 0 && d.config.partners.length > 0 && (
        <div className="mt-3 space-y-2" data-testid="mudra-redeem">
          <select className={inp} value={f.partnerId} onChange={e => setF({ ...f, partnerId: e.target.value })} aria-label={tx('Service partner', 'सर्विस पार्टनर')} data-testid="mudra-partner"><option value="">{tx('Choose a GENZ service partner…', 'GENZ सर्विस पार्टनर चुनें…')}</option>{d.config.partners.map((x: any) => <option key={x.id} value={x.id}>{x.name} · {x.category}</option>)}</select>
          <input className={inp} value={f.invoiceRef} onChange={e => setF({ ...f, invoiceRef: e.target.value })} maxLength={40} placeholder={tx('Invoice / booking number', 'इनवॉइस / बुकिंग नंबर')} aria-label={tx('Invoice number', 'इनवॉइस नंबर')} data-testid="mudra-invoice" />
          <input className={inp} inputMode="numeric" value={f.invoiceAmount} onChange={e => setF({ ...f, invoiceAmount: e.target.value.replace(/\D/g, '') })} placeholder={tx('Invoice amount ₹', 'इनवॉइस रकम ₹')} aria-label={tx('Invoice amount', 'इनवॉइस रकम')} />
          <input className={inp} inputMode="numeric" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value.replace(/\D/g, '') })} placeholder={p ? tx(`Discount ₹ (up to ${p.maxDiscountPct}% of the invoice)`, `डिस्काउंट ₹ (इनवॉइस का ${p.maxDiscountPct}% तक)`) : tx('Discount ₹', 'डिस्काउंट ₹')} aria-label={tx('Discount', 'डिस्काउंट')} data-testid="mudra-amount" />
          <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.via} onChange={e => setF({ ...f, via: e.target.checked })} data-testid="mudra-via" />{tx('This work was booked through GENZ (not directly with the partner).', 'यह काम GENZ के ज़रिए बुक हुआ है (पार्टनर से सीधे नहीं)।')}</label>
          <button type="button" disabled={busy || !f.via || !f.partnerId || f.invoiceRef.trim().length < 4 || !Number(f.invoiceAmount) || !Number(f.amount)} onClick={() => void redeem()} className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-bold text-white disabled:opacity-50" data-testid="mudra-redeem-btn">{tx('Use as discount', 'डिस्काउंट में इस्तेमाल करें')}</button>
        </div>
      )}
      {ok && <p className="mt-2 text-xs font-semibold text-emerald-800" role="status">{ok}</p>}
      {err && <p className="mt-2 text-xs text-red-700" role="alert">{err}</p>}
      <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer font-semibold">{tx('Terms', 'शर्तें')}</summary><p className="mt-1">{tx(d.config.terms.en, d.config.terms.hi)}</p></details>
    </section>
  );
};
