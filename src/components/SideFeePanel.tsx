import React, { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Lock, Check } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import type { DealSideView } from '../types/index.js';

const rupee = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * v41 — "Apna-apna side" panel of a Deal Room: each broker keeps the brokerage of his OWN client.
 * 1. write my fee (private)   2. both sign "only my own client"   3. write down what my client paid me.
 * The other broker's amount is never shown — only whether he has written it / got it.
 */
export const SideFeePanel: React.FC<{ dealId: string; onChanged?: () => void }> = ({ dealId, onChanged }) => {
  const tx = useTx();
  const [side, setSide] = useState<DealSideView | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [fee, setFee] = useState('');
  const [feeNote, setFeeNote] = useState('');
  const [rAmount, setRAmount] = useState('');
  const [rRef, setRRef] = useState('');
  const [rDate, setRDate] = useState(today());

  const load = () => api.sidesGet(dealId).then(r => { setSide(r.side); if (r.side.myFee) setFee(String(r.side.myFee)); setFeeNote(r.side.myFeeNote || ''); }).catch(e => setErr(e.message));
  useEffect(() => { setSide(null); setErr(''); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dealId]);

  const run = async (key: string, fn: () => Promise<{ side: DealSideView }>) => {
    setBusy(key); setErr('');
    try { const r = await fn(); setSide(r.side); onChanged?.(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };

  if (!side) return err ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{err}</div> : <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-slate-400" />;
  const sideLabel = side.mySide === 'SELLER' ? tx('Seller side', 'विक्रेता की तरफ़') : side.mySide === 'BUYER' ? tx('Buyer side', 'खरीदार की तरफ़') : '—';
  const outstanding = Math.max(0, (side.myFee || 0) - side.myReceived);
  const inp = 'mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900';

  return (
    <div data-testid="side-panel" className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 space-y-1">
        <div className="flex items-center gap-2 font-bold text-sm"><ShieldCheck className="h-4 w-4" />{tx('Apna-apna side', 'अपना-अपना साइड')} · {sideLabel}</div>
        <p>{tx('No split. You take brokerage only from your own client; the other broker from his. His fee is never shown to you and yours is never shown to him. GENZ does not hold or move this money.', 'कोई बँटवारा नहीं। आप सिर्फ़ अपने क्लाइंट से ब्रोकरेज लेते हैं, दूसरा ब्रोकर अपने से। उसकी फ़ीस आपको और आपकी उसे कभी नहीं दिखती। GENZ यह पैसा न रखता है, न भेजता है।')}</p>
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700" data-testid="side-error">{err}</div>}

      {/* 1 — my fee */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
        <div className="flex items-center justify-between"><h4 className="text-sm font-bold text-slate-900">1 · {tx('My brokerage (private)', 'मेरी ब्रोकरेज (प्राइवेट)')}</h4><span className="flex items-center gap-1 text-xs text-slate-500"><Lock className="h-3 w-3" />{tx('only you see this', 'सिर्फ़ आपको दिखती है')}</span></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
          <label className="text-xs font-semibold text-slate-700">{tx('Amount (₹)', 'रकम (₹)')}
            <input data-testid="side-fee-input" type="number" min={1} step={1} value={fee} onChange={e => setFee(e.target.value)} className={inp} disabled={side.myReceived > 0} />
          </label>
          <label className="text-xs font-semibold text-slate-700 sm:col-span-1">{tx('Note (optional)', 'नोट (वैकल्पिक)')}
            <input data-testid="side-fee-note" type="text" maxLength={200} value={feeNote} onChange={e => setFeeNote(e.target.value)} className={inp} disabled={side.myReceived > 0} />
          </label>
          <button data-testid="side-fee-save" disabled={!!busy || side.myReceived > 0 || !(Number(fee) > 0)} onClick={() => run('fee', () => api.sidesSetFee(dealId, Math.round(Number(fee)), feeNote.trim() || undefined))}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy === 'fee' ? '…' : tx('Save my fee', 'मेरी फ़ीस सेव करें')}</button>
        </div>
        <p className="text-xs text-slate-500">
          {side.myFee ? <>{tx('Saved', 'सेव')}: <b data-testid="side-my-fee">{rupee(side.myFee)}</b> · </> : null}
          {side.otherHasFee ? tx('The other broker has written his fee too (amount hidden).', 'दूसरे ब्रोकर ने भी अपनी फ़ीस लिख दी है (रकम छिपी है)।') : tx('The other broker has not written his fee yet.', 'दूसरे ब्रोकर ने अभी फ़ीस नहीं लिखी।')}
        </p>
      </section>

      {/* 2 — undertaking */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
        <h4 className="text-sm font-bold text-slate-900">2 · {tx('"Own client only" undertaking', '"सिर्फ़ अपना क्लाइंट" वचन')}</h4>
        <p className="text-xs text-slate-700 bg-slate-50 rounded-lg p-2.5 border border-slate-100">{tx(side.undertaking.en, side.undertaking.hi)}</p>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className={side.signedByMe ? 'text-emerald-700 font-semibold' : 'text-slate-500'} data-testid="side-signed-me">{side.signedByMe ? '✓ ' : ''}{tx('You', 'आप')}</span>
          <span className={side.signedByOther ? 'text-emerald-700 font-semibold' : 'text-slate-500'} data-testid="side-signed-other">{side.signedByOther ? '✓ ' : ''}{tx('Other broker', 'दूसरा ब्रोकर')}</span>
          {!side.signedByMe && (
            <button data-testid="side-sign" disabled={!!busy} onClick={() => run('sign', () => api.sidesSign(dealId))} className="ml-auto rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white disabled:opacity-50">{busy === 'sign' ? '…' : tx('I agree & sign', 'मैं सहमत हूँ, साइन करें')}</button>
          )}
          {side.ready && <span className="ml-auto flex items-center gap-1 text-emerald-700 font-semibold"><Check className="h-3.5 w-3.5" />{tx('Both signed', 'दोनों ने साइन किया')}</span>}
        </div>
      </section>

      {/* 3 — received */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
        <div className="flex items-center justify-between"><h4 className="text-sm font-bold text-slate-900">3 · {tx('Received from my client', 'मेरे क्लाइंट से मिला')}</h4><span className="flex items-center gap-1 text-xs text-slate-500"><Lock className="h-3 w-3" />{tx('nobody confirms it for you', 'कोई और कन्फ़र्म नहीं करता')}</span></div>
        {!side.myFee || !side.ready ? (
          <p className="text-xs text-slate-500">{tx('Write your fee and let both brokers sign first.', 'पहले अपनी फ़ीस लिखें और दोनों ब्रोकर साइन करें।')}</p>
        ) : (
          <>
            <p className="text-xs text-slate-700">{tx('Received', 'मिला')}: <b data-testid="side-received">{rupee(side.myReceived)}</b> / {rupee(side.myFee)} · {tx('Left', 'बाकी')}: {rupee(outstanding)}</p>
            {side.myReceipts.length > 0 && (
              <ul className="text-xs text-slate-600 space-y-0.5">
                {side.myReceipts.map(r => <li key={r.id}>{r.paidOn} · {rupee(r.amount)} · {r.ref}</li>)}
              </ul>
            )}
            {outstanding > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                <label className="text-xs font-semibold text-slate-700">{tx('Amount (₹)', 'रकम (₹)')}<input data-testid="side-rcv-amount" type="number" min={1} max={outstanding} value={rAmount} onChange={e => setRAmount(e.target.value)} className={inp} /></label>
                <label className="text-xs font-semibold text-slate-700">{tx('UTR / reference', 'UTR / रेफ़रेंस')}<input data-testid="side-rcv-ref" type="text" maxLength={60} value={rRef} onChange={e => setRRef(e.target.value)} className={inp} /></label>
                <label className="text-xs font-semibold text-slate-700">{tx('Date', 'तारीख')}<input data-testid="side-rcv-date" type="date" value={rDate} max={today()} onChange={e => setRDate(e.target.value)} className={inp} /></label>
                <button data-testid="side-rcv-save" disabled={!!busy || !(Number(rAmount) > 0) || rRef.trim().length < 4}
                  onClick={() => run('rcv', async () => { const r = await api.sidesReceived(dealId, { amount: Math.round(Number(rAmount)), ref: rRef.trim(), paidOn: rDate }); setRAmount(''); setRRef(''); return r; })}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy === 'rcv' ? '…' : tx('Write it down', 'दर्ज करें')}</button>
              </div>
            )}
            {side.myDone && <p className="text-xs font-semibold text-emerald-700" data-testid="side-my-done">✓ {tx('Your side is complete.', 'आपकी तरफ़ पूरा हो गया।')}</p>}
          </>
        )}
        <p className="text-xs text-slate-500">{side.otherDone ? tx('The other broker has received his fee too.', 'दूसरे ब्रोकर को भी उसकी फ़ीस मिल गई।') : tx('Both sides must be complete before the deal can be marked Settled.', 'डील "Settled" होने से पहले दोनों तरफ़ पूरा होना ज़रूरी है।')}</p>
      </section>
    </div>
  );
};
