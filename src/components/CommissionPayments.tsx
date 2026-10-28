import { useState } from 'react';
import { CheckCircle2, Clock, XCircle, Plus, AlertTriangle, Loader2 } from 'lucide-react';
import type { CommissionParticipantAllocation, DealCommissionAgreement } from '../types/index.js';
import { api } from '../lib/api.js';
import { formatINR } from '../lib/utils.js';
import { useTx } from '../lib/i18n.js';

/**
 * v21 — the payments of ONE commission share, written down by the two brokers themselves.
 * One broker records "₹X, ref UTR…", the OTHER broker confirms (or rejects with a reason); only a confirmed entry counts as paid.
 * GENZ never records or touches the money. If they disagree, "Raise a dispute" opens the deal room to the GENZ admin.
 */
export function CommissionPayments({ dealId, agreement, alloc, meId, iAmDealBroker, frozen, soloDeal, onChanged }: {
  dealId: string; agreement: DealCommissionAgreement; alloc: CommissionParticipantAllocation;
  meId: string; iAmDealBroker: boolean;
  /** a dispute is open on this deal room: payments are frozen until the GENZ admin resolves it */
  frozen: boolean;
  /** one broker on both sides — he confirms his own entries */
  soloDeal: boolean;
  onChanged: () => void;
}) {
  const tx = useTx();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const entries = alloc.payments || [];
  const pending = entries.filter((p) => p.status === 'PENDING').reduce((a, p) => a + p.amount, 0);
  const outstanding = Math.max(0, alloc.allocationAmount - (alloc.paidAmount || 0) - pending);

  const [mode, setMode] = useState<'' | 'record' | 'dispute'>('');
  const [amount, setAmount] = useState('');
  const [ref, setRef] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState('');
  const [why, setWhy] = useState('');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr('');
    try { await fn(); setMode(''); setRejecting(null); setAmount(''); setRef(''); setNote(''); setWhy(''); setRejectNote(''); onChanged(); }
    catch (e: any) { setErr(e?.message || tx('Something went wrong', 'कुछ गड़बड़ हो गई')); }
    finally { setBusy(false); }
  };

  const canRecord = iAmDealBroker && agreement.status === 'ACTIVE' && !frozen && outstanding > 0;

  return (
    <div className="space-y-2 pt-2 border-t border-slate-200" data-testid={`payments-${alloc.participantId}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{tx('Payments written down by the brokers', 'ब्रोकरों द्वारा दर्ज भुगतान')}</span>
        {pending > 0 && <span className="text-xs font-semibold text-amber-700">{formatINR(pending)} {tx('waiting for confirmation', 'पुष्टि का इंतज़ार')}</span>}
      </div>

      {entries.length === 0 && (
        <p className="text-xs text-slate-500">{tx('Nothing written down yet. When the money is paid, one of you records it here and the other confirms — GENZ does not hold the money — it only keeps this record for both sides.', 'अभी कुछ दर्ज नहीं। पैसा चुकने पर आप दोनों में से एक यहाँ दर्ज करे और दूसरा पुष्टि करे — GENZ पैसा अपने पास नहीं रखता — बस आप दोनों के लिए यह रिकॉर्ड रखता है।')}</p>
      )}

      {entries.map((p) => {
        const mine = p.recordedById === meId;
        const canAnswer = iAmDealBroker && p.status === 'PENDING' && !frozen && (!mine || soloDeal);
        return (
          <div key={p.id} className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <strong className="text-slate-900">{formatINR(p.amount)}</strong>
                <span className="text-slate-500"> · {p.paidOn} · {tx('ref', 'रेफ़')} <span className="font-mono">{p.ref}</span></span>
                <div className="text-xs text-slate-400">{tx('written by', 'दर्ज करने वाला')} {p.recordedByName}{p.note ? ` — ${p.note}` : ''}</div>
              </div>
              {p.status === 'CONFIRMED' && <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3 w-3" />{tx('Confirmed', 'पुष्ट')}</span>}
              {p.status === 'PENDING' && <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700"><Clock className="h-3 w-3" />{tx('Waiting', 'इंतज़ार')}</span>}
              {p.status === 'REJECTED' && <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700"><XCircle className="h-3 w-3" />{tx('Rejected', 'अस्वीकृत')}</span>}
            </div>
            {p.status === 'REJECTED' && p.rejectNote && <div className="text-xs text-rose-700">{tx('Reason', 'कारण')}: {p.rejectNote}</div>}
            {p.status === 'CONFIRMED' && p.confirmedByName && <div className="text-xs text-slate-400">{tx('confirmed by', 'पुष्टि')} {p.confirmedByName}</div>}
            {p.status === 'PENDING' && mine && !soloDeal && <div className="text-xs text-slate-500">{tx('The other broker has to confirm this entry.', 'इस एंट्री की पुष्टि दूसरे ब्रोकर को करनी है।')}</div>}
            {canAnswer && rejecting !== p.id && (
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => run(() => api.confirmCommissionPayment(dealId, agreement.id, p.id))} className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-60">{tx('Yes, I received / paid it', 'हाँ, मुझे मिला / मैंने दिया')}</button>
                <button disabled={busy} onClick={() => { setRejecting(p.id); setErr(''); }} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">{tx('No, this is wrong', 'नहीं, यह गलत है')}</button>
              </div>
            )}
            {canAnswer && rejecting === p.id && (
              <div className="space-y-1.5">
                <input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} maxLength={300} placeholder={tx('Why is it wrong? (min 5 characters)', 'यह गलत क्यों है? (कम से कम 5 अक्षर)')} className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5" />
                <div className="flex gap-2">
                  <button disabled={busy || rejectNote.trim().length < 5} onClick={() => run(() => api.rejectCommissionPayment(dealId, agreement.id, p.id, rejectNote.trim()))} className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-50">{tx('Reject entry', 'एंट्री अस्वीकार करें')}</button>
                  <button onClick={() => setRejecting(null)} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">{tx('Cancel', 'रद्द करें')}</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {frozen && iAmDealBroker && (
        <p className="text-xs text-rose-700 flex items-start gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />{tx('A dispute is open on this deal room, so payments are frozen. The GENZ admin decides in the dispute.', 'इस डील रूम पर विवाद खुला है, इसलिए भुगतान रुके हैं। GENZ एडमिन विवाद में फ़ैसला करेगा।')}</p>
      )}

      {iAmDealBroker && mode === '' && (canRecord || (!frozen && alloc.entitlementStatus !== 'DISPUTED')) && (
        <div className="flex flex-wrap gap-2">
          {canRecord && (
            <button onClick={() => { setMode('record'); setErr(''); setAmount(String(outstanding)); }} className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1"><Plus className="h-3 w-3" />{tx('Write down a payment', 'भुगतान दर्ज करें')}</button>
          )}
          {!frozen && alloc.entitlementStatus !== 'DISPUTED' && (
            <button onClick={() => { setMode('dispute'); setErr(''); }} className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-200">{tx('Raise a dispute', 'विवाद दर्ज करें')}</button>
          )}
        </div>
      )}

      {mode === 'record' && (
        <div className="rounded-lg border border-slate-300 bg-white p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">{tx('Amount (₹)', 'रकम (₹)')}
              <input type="number" min={1} max={outstanding} value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-0.5 w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5" />
            </label>
            <label className="text-xs text-slate-500">{tx('Paid on', 'किस तारीख़ को')}
              <input type="date" max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="mt-0.5 w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5" />
            </label>
          </div>
          <label className="text-xs text-slate-500 block">{tx('Bank reference (UTR / cheque no. / transaction id)', 'बैंक रेफ़रेंस (UTR / चेक नं. / ट्रांज़ैक्शन आईडी)')}
            <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} placeholder="e.g. UTR 4123 4567 8901" className="mt-0.5 w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono" />
          </label>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={tx('Note (optional)', 'नोट (वैकल्पिक)')} className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5" />
          <p className="text-xs text-slate-500">{tx('Never type a card or bank account number here — only the transaction reference.', 'यहाँ कार्ड या बैंक खाता नंबर कभी न लिखें — सिर्फ़ ट्रांज़ैक्शन रेफ़रेंस।')}</p>
          <div className="flex gap-2">
            <button disabled={busy || !Number(amount) || ref.trim().length < 4} onClick={() => run(() => api.settleCommissionPayment(dealId, agreement.id, { participantId: alloc.participantId, paidDelta: Number(amount), ref: ref.trim(), paidOn, note: note.trim() || undefined }))} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1">{busy && <Loader2 className="h-3 w-3 animate-spin" />}{tx('Save entry', 'एंट्री सेव करें')}</button>
            <button onClick={() => setMode('')} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">{tx('Cancel', 'रद्द करें')}</button>
          </div>
        </div>
      )}

      {mode === 'dispute' && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 space-y-2">
          <p className="text-xs text-rose-900">{tx('Raising a dispute freezes the payments of this deal room, and the GENZ admin can then read the whole deal room (chat, notes, documents) until the dispute is resolved. Every admin look is written to the audit trail you can read.', 'विवाद दर्ज करने पर इस डील रूम के भुगतान रुक जाते हैं, और विवाद सुलझने तक GENZ एडमिन पूरा डील रूम (चैट, नोट्स, दस्तावेज़) देख सकता है। एडमिन का हर बार देखना ऑडिट ट्रेल में दर्ज होता है, जो आप पढ़ सकते हैं।')}</p>
          <textarea value={why} onChange={(e) => setWhy(e.target.value)} maxLength={500} rows={3} placeholder={tx('What is the problem? (min 15 characters)', 'समस्या क्या है? (कम से कम 15 अक्षर)')} className="w-full text-xs border border-rose-200 rounded-lg px-2.5 py-1.5" />
          <div className="flex gap-2">
            <button disabled={busy || why.trim().length < 15} onClick={() => run(() => api.settleCommissionPayment(dealId, agreement.id, { participantId: alloc.participantId, isDisputed: true, disputeNotes: why.trim() }))} className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1">{busy && <Loader2 className="h-3 w-3 animate-spin" />}{tx('Raise dispute', 'विवाद दर्ज करें')}</button>
            <button onClick={() => setMode('')} className="px-3 py-1.5 rounded-lg bg-white text-slate-700 text-xs font-semibold border border-slate-200">{tx('Cancel', 'रद्द करें')}</button>
          </div>
        </div>
      )}

      {err && <div className="text-xs text-rose-700" role="alert">{err}</div>}
    </div>
  );
}
