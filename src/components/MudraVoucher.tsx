import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Ticket } from 'lucide-react';
import { api } from '../lib/api.js';
import { MakeCode } from './JobCode.js';
import { useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';

/** v199 (D20) — the buyer's GENZ Mudra: a discount voucher (not money). Balance, expiry, the terms, and a "use it" form for a GENZ-affiliated service partner booked through GENZ. */
export const MudraVoucher: React.FC = () => {
  const tx = useTx();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [ok, setOk] = useState('');
  const [inv, setInv] = useState<any[]>([]); const [sel, setSel] = useState(''); const [coins, setCoins] = useState('');
  const load = useCallback(() => Promise.all([api.mudraMe(), api.mudraInvoices()]).then(([x, i]) => { setD(x); setInv(i.invoices || []); setErr(''); }).catch(e => setErr(e.message)), []);
  // one open invoice is selected by itself; the Mudra amount starts at the most that is allowed
  useEffect(() => { const pick = inv.find(i => i.id === sel) || (inv.length === 1 ? inv[0] : null); if (pick && pick.id !== sel) setSel(pick.id); if (pick) setCoins(String(pick.maxCoins)); }, [inv, sel]);
  useEffect(() => { void load(); }, [load]);
  if (!d) return err ? <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600" role="alert">{err}</p> : <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-label="Loading" />;
  if (!d.config.enabled) return null;
  const next = d.lots.length ? [...d.lots].sort((a: any, b: any) => a.expiresAt.localeCompare(b.expiresAt))[0] : null;
  const cur = inv.find(i => i.id === sel);
  const n = Math.max(0, Math.min(Number(coins) || 0, cur?.maxCoins || 0));
  const redeem = async () => {
    if (!cur || n < 1) return; setBusy(true); setErr(''); setOk('');
    try { await api.mudraRedeem({ invoiceId: cur.id, coins: n }); setOk(tx(`Receipt · ${cur.invoiceRef} · ${cur.partnerName}: Mudra used ${formatINR(n)} · You pay ${formatINR(cur.amountInr - n)}.`, `रसीद · ${cur.invoiceRef} · ${cur.partnerName}: मुद्रा इस्तेमाल ${formatINR(n)} · आप ${formatINR(cur.amountInr - n)} देंगे।`)); setSel(''); await load(); }
    catch (e: any) { const m = e.message; if (e.code === 'ALREADY_PAID' || e.status === 409) await load(); setErr(m); } finally { setBusy(false); }
  };
  const inp = 'min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm';
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4" data-testid="mudra-voucher">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Ticket className="h-4 w-4 text-amber-700" aria-hidden />{tx('GENZ Mudra — discount voucher', 'GENZ मुद्रा — डिस्काउंट वाउचर')}</h3>
      <p className="mt-1 text-2xl font-extrabold text-slate-900" data-testid="mudra-balance">{formatINR(d.balance)}</p>
      {d.frozenByDispute && <p className="mt-1 text-xs font-semibold text-amber-800" role="status" data-testid="mudra-frozen-top">{tx('Your voucher is on hold while a dispute on your deal is open. It returns when GENZ closes it.', 'आपके डील पर विवाद खुला होने तक आपका वाउचर रुका है। GENZ के उसे बंद करते ही वह वापस मिल जाएगा।')}</p>}
      <p className="text-xs text-slate-600">{next ? tx(`Next expiry ${new Date(next.expiresAt).toLocaleDateString('en-IN')}`, `अगली समाप्ति ${new Date(next.expiresAt).toLocaleDateString('en-IN')}`) : tx(`You earn ${d.config.pct}% of the brokerage as a voucher after a verified site visit and an activated commission agreement. Valid ${d.config.validityDays} days.`, `वेरिफ़ाइड साइट विज़िट और चालू कमीशन एग्रीमेंट के बाद ब्रोकरेज का ${d.config.pct}% वाउचर मिलता है। वैधता ${d.config.validityDays} दिन।`)}</p>
      <p className="mt-1 text-[11px] text-slate-600">{tx('Not money: it cannot be withdrawn or given to anyone. Use it only as a discount at a GENZ-affiliated service partner, booked through GENZ.', 'यह पैसा नहीं है: इसे निकाला या किसी को दिया नहीं जा सकता। सिर्फ़ GENZ से जुड़े सर्विस पार्टनर पर, GENZ के ज़रिए बुकिंग में डिस्काउंट के लिए।')}</p>
      {inv.length > 0 && (
        <div className="mt-3 space-y-2" data-testid="mudra-invoices">
          <p className="text-xs font-bold text-slate-800">{tx('Your invoices', 'आपके इनवॉइस')}</p>
          {inv.map(i => (
            <button key={i.id} type="button" onClick={() => setSel(i.id)} aria-pressed={sel === i.id} className={`block min-h-11 w-full rounded-lg border p-2 text-left text-xs ${sel === i.id ? 'border-slate-900 bg-white' : 'border-slate-200 bg-white/60'}`} data-testid={`mudra-inv-${i.id}`}>
              <b className="block text-sm text-slate-900">{i.partnerName} · {formatINR(i.amountInr)}</b><span className="block text-slate-600">{i.description} · {i.invoiceRef}</span>
            </button>
          ))}
          {cur && (
            <div className="space-y-2 rounded-lg bg-white p-2" data-testid="mudra-redeem">
              <div className="space-y-2 rounded-lg border border-slate-200 p-2" data-testid="mudra-job">
                <p className="text-xs font-bold text-slate-800" data-testid="mudra-job-status">{tx('The work', 'काम')}: {({ OPEN: tx('Not started', 'शुरू नहीं हुआ'), STARTED: tx('Started', 'शुरू हो गया'), COMPLETED: tx('Finished, waiting for your approval', 'पूरा हुआ, आपके अप्रूवल का इंतज़ार'), SIGNED_OFF: tx('Approved by you', 'आपने अप्रूव किया') } as Record<string, string>)[cur.jobStatus || 'OPEN']}</p>
                {(cur.jobStatus || 'OPEN') === 'OPEN' && <MakeCode make={() => api.mudraJobCode(cur.id)} testId="mudra-jobcode" label={tx('Get job start code (for the service person)', 'जॉब शुरू करने का कोड पाएँ (सर्विस वाले के लिए)')} />}
                {[['before', tx('Before', 'पहले'), cur.before], ['after', tx('After', 'बाद में'), cur.after]].map(([k, l, ids]: any) => ids?.length ? <div key={k}><p className="text-[11px] font-semibold text-slate-600">{l}</p><div className="flex flex-wrap gap-1">{ids.map((pid: string) => <img key={pid} src={`/api/mudra/invoices/${cur.id}/photos/${pid}`} alt={`${l}`} loading="lazy" className="h-20 w-20 rounded object-cover" data-testid={`mudra-photo-${pid}`} />)}</div></div> : null)}
                {cur.jobStatus === 'COMPLETED' && <button type="button" disabled={busy} className="min-h-11 w-full rounded-lg bg-emerald-600 text-sm font-bold text-white disabled:opacity-50" data-testid="mudra-signoff-btn" onClick={async () => { setBusy(true); setErr(''); try { await api.mudraSignoff(cur.id); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }}>{tx('Approve the work', 'काम अप्रूव करें')}</button>}
                {cur.signoffRequired && cur.jobStatus !== 'SIGNED_OFF' && <p className="text-[11px] text-amber-800" data-testid="mudra-signoff-note">{tx('The discount can be applied after you approve the finished work.', 'काम अप्रूव करने के बाद ही डिस्काउंट लगेगा।')}</p>}
              </div>
              <label className="block text-xs font-semibold text-slate-700">{tx(`Use Mudra ₹ (up to ${formatINR(cur.maxCoins)})`, `मुद्रा ₹ इस्तेमाल करें (अधिकतम ${formatINR(cur.maxCoins)})`)}
                <input className={inp} inputMode="numeric" value={coins} onChange={e => { const v = e.target.value.replace(/\D/g, ''); setCoins(v && Number(v) > (cur?.maxCoins || 0) ? String(cur?.maxCoins || 0) : v); }} data-testid="mudra-amount" /></label>
              {cur.paused && <p className="text-[11px] text-amber-800" data-testid="mudra-paused">{tx('This partner is paused right now, so no discount can be applied. Ask GENZ.', 'यह पार्टनर अभी रुका हुआ है, इसलिए डिस्काउंट नहीं लग सकता। GENZ से पूछें।')}</p>}
              {d.frozenByDispute && <p className="text-xs font-semibold text-amber-800" role="status" data-testid="mudra-frozen">{tx('Your voucher is on hold while a dispute on your deal is open. It returns when GENZ closes it.', 'आपके डील पर विवाद खुला होने तक आपका वाउचर रुका है। GENZ के उसे बंद करते ही वह वापस मिल जाएगा।')}</p>}
              {!cur.paused && d.balance < 1 && !d.frozenByDispute && <p className="text-[11px] text-slate-600" data-testid="mudra-nobalance">{tx('You have no voucher balance yet, so there is no discount on this invoice. You earn it after a verified site visit and a signed commission agreement.', 'अभी आपके वाउचर में बैलेंस नहीं है, इसलिए इस इनवॉइस पर डिस्काउंट नहीं है। वेरिफ़ाइड साइट विज़िट और साइन हुए कमीशन एग्रीमेंट के बाद यह मिलता है।')}</p>}
              <p className="text-sm font-bold text-slate-900" data-testid="mudra-pay-line">{tx(`You pay ${formatINR(cur.amountInr - n)}`, `आप ${formatINR(cur.amountInr - n)} देंगे`)}</p>
              <button type="button" disabled={busy || n < 1 || cur.paused || (cur.signoffRequired && cur.jobStatus !== 'SIGNED_OFF')} onClick={() => void redeem()} className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-bold text-white disabled:opacity-50" data-testid="mudra-redeem-btn">{tx('Apply discount', 'डिस्काउंट लगाएँ')}</button>
              <p className="text-[11px] text-slate-600">{/* TODO: real collection of this payment needs a licensed payment gateway with split settlement (RBI payment-aggregator rules), pending owner approval. Today this only records the amounts. */}
              {tx('Pay the amount shown on the invoice, to the partner or GENZ as the invoice says.', 'इनवॉइस पर दिखी रकम उसी तरह दें जैसा इनवॉइस में लिखा है: पार्टनर को या GENZ को।')}</p>
            </div>
          )}
        </div>
      )}
      {ok && <p className="mt-2 text-xs font-semibold text-emerald-800" role="status">{ok}</p>}
      {err && <p className="mt-2 text-xs text-red-700" role="alert">{err}</p>}
      <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer font-semibold">{tx('Terms', 'शर्तें')}</summary><p className="mt-1">{tx(d.config.terms.en, d.config.terms.hi)}</p></details>
    </section>
  );
};
