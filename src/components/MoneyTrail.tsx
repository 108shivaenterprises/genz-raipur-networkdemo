import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Wallet, Check, X as XIcon, ChevronDown, ChevronUp, Plus, Loader2, ArrowRight, Info } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { stepperOf, isOpenTrail, type MoneyTrail, type HolderKind, type StepKey, type TrailActions, type TrailSide, type TrailStage } from '../shared/moneyTrail.js';
import { TOKEN_MODES } from '../shared/crmSales.js';
import { Sheet, Err, useBusy, inp, btnDark, btnLine, inr, type Flash } from './CrmPlus.js';

/**
 * v16.9 — Money Trail: collected → partner confirms → handed to the builder → builder's authorised person confirms.
 * Every payment shows WHO HOLDS IT right now. GENZ moves no money: each person records what he holds and the next one confirms.
 */
export interface TrailRowV extends MoneyTrail {
  customerName: string; projectName: string; unitNo: string; bookingStatus: string; cpName: string; builderName: string; direct: boolean;
  holder: { kind: HolderKind; name: string }; ageDays: number; can: TrailActions; noteRequired: { received: boolean; notReceived: boolean };
}

const dShort = (s?: string) => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '');
const dLong = (s?: string) => (s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const today = () => new Date().toISOString().slice(0, 10);
/** "Er. Alok Singhania" → "Alok" (skip a leading Er. / Dr. / Mr.) */
const firstName = (n: string) => { const w = n.trim().split(/\s+/); return w.length > 1 && /\.$/.test(w[0]) ? w[1] : w[0]; };
const modeLabel = (id: string | undefined, hi: boolean) => { const m = TOKEN_MODES.find(x => x.id === id); return m ? (hi ? m.hi : m.en) : id || ''; };

/** the tile / badge colour of each holder */
const HOLD_STYLE: Record<HolderKind, { on: string; dot: string }> = {
  COLLECTOR: { on: 'border-amber-400 bg-amber-50', dot: 'bg-amber-500' },
  CP: { on: 'border-sky-400 bg-sky-50', dot: 'bg-sky-500' },
  BUILDER_PENDING: { on: 'border-violet-400 bg-violet-50', dot: 'bg-violet-500' },
  BUILDER: { on: 'border-emerald-400 bg-emerald-50', dot: 'bg-emerald-600' },
  NONE: { on: 'border-slate-300 bg-slate-50', dot: 'bg-slate-400' },
};

const sideLabel = (s: TrailSide, tx: (e: string, h: string) => string) => ({
  CP_OWNER: tx('partner', 'पार्टनर'), CP_STAFF: tx('partner’s team member', 'पार्टनर का टीम मेंबर'),
  BUILDER_OWNER: tx('builder', 'बिल्डर'), BUILDER_STAFF: tx('builder’s team member', 'बिल्डर का टीम मेंबर'),
}[s]);

const STAGE_LABEL = (st: TrailStage, tx: (e: string, h: string) => string) => ({
  COLLECTED: tx('Collected the money', 'पैसा वसूला'), CP_CONFIRMED: tx('Partner confirmed receiving it', 'पार्टनर ने माना कि मिला'),
  CP_NOT_RECEIVED: tx('Partner says: not received', 'पार्टनर: नहीं मिला'), HANDED_OVER: tx('Handed over to the builder', 'बिल्डर को सौंपा'),
  BUILDER_CONFIRMED: tx('Builder confirmed it arrived', 'बिल्डर ने माना कि पहुँचा'), BUILDER_NOT_RECEIVED: tx('Builder says: not received', 'बिल्डर: नहीं मिला'),
  CANCELLED: tx('Entry cancelled', 'एंट्री रद्द'),
}[st]);

/** English target names come from the server; the two common ones read well in Hindi */
const targetName = (n: string, tx: (e: string, h: string) => string) => (n === 'Booking amount' ? tx('Booking amount', 'बुकिंग राशि') : n);

// ───────────────────────── sheets ─────────────────────────
type Act = null | { k: 'cpYes' | 'cpNo' | 'hand' | 'bYes' | 'bNo' | 'cancel'; r: TrailRowV };

const ActSheet: React.FC<{ act: NonNullable<Act>; onClose: () => void; onDone: (msg: string) => void }> = ({ act, onClose, onDone }) => {
  const tx = useTx(); const { busy, err, go } = useBusy();
  const { k, r } = act;
  const [note, setNote] = useState(''); const [receiptNo, setReceiptNo] = useState(''); const [mode, setMode] = useState(''); const [ref, setRef] = useState('');
  const amt = inr(r.amount);
  const needNote = k === 'cpNo' || k === 'bNo' || k === 'cancel' || (k === 'bYes' && r.noteRequired.received);
  const handBad = k === 'hand' && !!mode && mode !== 'CASH' && ref.trim().length < 3;
  const T: Record<string, { title: string; help: string; cta: string; ok: string; danger?: boolean }> = {
    cpYes: { title: tx(`Confirm: I received ${amt}`, `कन्फ़र्म: मुझे ${amt} मिल गए`), help: tx(`Tick this only if ${r.collector.name} has really given you the money (${modeLabel(r.mode, false)}${r.ref ? ` · ${r.ref}` : ''}). After this the money is WITH YOU.`, `तभी कन्फ़र्म करें जब ${r.collector.name} ने सच में आपको पैसा दे दिया हो (${modeLabel(r.mode, true)}${r.ref ? ` · ${r.ref}` : ''})। इसके बाद पैसा आपके पास माना जाएगा।`), cta: tx('Yes, I received it', 'हाँ, मुझे मिल गया'), ok: tx('Confirmed — the money is with you now', 'कन्फ़र्म — अब पैसा आपके पास है') },
    cpNo: { title: tx(`I have NOT received ${amt}`, `मुझे ${amt} नहीं मिले`), help: tx(`This marks the entry as disputed and tells ${r.collector.name} to sort it out.`, `एंट्री “विवाद” में जाएगी और ${r.collector.name} को सुलझाना होगा।`), cta: tx('Mark not received', 'नहीं मिला दर्ज करें'), ok: tx('Marked as not received', '“नहीं मिला” दर्ज हुआ'), danger: true },
    hand: { title: tx(`Hand over ${amt} to the builder`, `${amt} बिल्डर को सौंपें`), help: tx('Say how you gave it. The builder’s accounts person will then check and confirm. Leave the mode blank if you are passing on the customer’s cheque / cash as it is.', 'बताएँ कि कैसे दिया। फिर बिल्डर का अकाउंट वाला जाँचकर कन्फ़र्म करेगा। अगर ग्राहक का चेक / नकद वैसा ही आगे दे रहे हैं तो माध्यम खाली छोड़ें।'), cta: tx('Handed over', 'सौंप दिया'), ok: tx('Handed over — waiting for the builder to confirm', 'सौंपा गया — बिल्डर के कन्फ़र्म की प्रतीक्षा') },
    bYes: { title: tx(`Confirm: ${amt} arrived`, `कन्फ़र्म: ${amt} पहुँच गए`), help: r.noteRequired.received ? tx('This money has not been handed over in the system yet. Say why you are confirming it now (for example: the customer paid our account directly).', 'सिस्टम में यह पैसा अभी सौंपा नहीं गया है। अभी कन्फ़र्म क्यों कर रहे हैं, बताएँ (जैसे: ग्राहक ने सीधे हमारे खाते में दिया)।') : tx('Tick this only after you have checked your bank / cash book / cheque. This puts the amount into the booking’s collection — and the partner’s brokerage becomes payable in proportion.', 'तभी कन्फ़र्म करें जब बैंक / कैश बुक / चेक में जाँच ली हो। इससे रकम बुकिंग की वसूली में जुड़ेगी — और उसी अनुपात में पार्टनर की ब्रोकरेज देय बनेगी।'), cta: tx('Yes, it arrived', 'हाँ, पहुँच गया'), ok: tx('Confirmed — added to the booking’s collection', 'कन्फ़र्म — बुकिंग की वसूली में जुड़ गया') },
    bNo: { title: tx(`${amt} has NOT arrived`, `${amt} नहीं पहुँचे`), help: tx('Say why — for example “cheque bounced” or “not in the bank yet”. The money stays with the last person who confirmed having it.', 'कारण बताएँ — जैसे “चेक बाउंस” या “बैंक में अभी नहीं आया”। पैसा उस आख़िरी व्यक्ति के पास माना जाएगा जिसने उसे पाना कन्फ़र्म किया था।'), cta: tx('Mark not received', 'नहीं मिला दर्ज करें'), ok: tx('Marked as not received', '“नहीं मिला” दर्ज हुआ'), danger: true },
    cancel: { title: tx('Cancel this money entry', 'यह पैसे की एंट्री रद्द करें'), help: tx('Use this for a wrong entry or money that was returned to the customer. A cancelled entry never reaches the booking’s collection.', 'गलत एंट्री या ग्राहक को लौटाए गए पैसे के लिए। रद्द एंट्री कभी बुकिंग की वसूली में नहीं जुड़ती।'), cta: tx('Cancel entry', 'एंट्री रद्द करें'), ok: tx('Entry cancelled', 'एंट्री रद्द हुई'), danger: true },
  };
  const c = T[k];
  const submit = () => {
    const n = note.trim();
    if (k === 'cpYes') return api.moneyCpConfirm(r.id, { received: true, note: n || undefined });
    if (k === 'cpNo') return api.moneyCpConfirm(r.id, { received: false, note: n });
    if (k === 'hand') return api.moneyHandover(r.id, { ...(mode ? { mode, ref: ref.trim() || undefined } : {}), note: n || undefined });
    if (k === 'bYes') return api.moneyBuilderConfirm(r.id, { received: true, note: n || undefined, receiptNo: receiptNo.trim() || undefined });
    if (k === 'bNo') return api.moneyBuilderConfirm(r.id, { received: false, note: n });
    return api.moneyCancel(r.id, n);
  };
  return (
    <Sheet title={c.title} onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-700"><b>{r.customerName}</b> · {r.projectName} · {r.unitNo} · {targetName(r.targetName, tx)}</div>
        <p className="text-xs text-slate-600">{c.help}</p>
        {k === 'hand' && (
          <div className="grid grid-cols-2 gap-2">
            <select value={mode} onChange={e => setMode(e.target.value)} className={inp} aria-label={tx('How handed over', 'कैसे सौंपा')}>
              <option value="">{tx('As collected', 'जैसा लिया वैसा')}</option>
              {TOKEN_MODES.map(m => <option key={m.id} value={m.id}>{tx(m.en, m.hi)}</option>)}
            </select>
            <input value={ref} onChange={e => setRef(e.target.value)} maxLength={40} disabled={!mode || mode === 'CASH'} placeholder={tx('UTR / cheque no.', 'UTR / चेक नं.')} className={`${inp} disabled:opacity-40`} />
          </div>
        )}
        {k === 'bYes' && <input value={receiptNo} onChange={e => setReceiptNo(e.target.value)} maxLength={40} placeholder={tx('Your receipt no. (optional)', 'आपकी रसीद नं. (वैकल्पिक)')} className={inp} />}
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={200} placeholder={needNote ? tx('Reason (required)', 'कारण (ज़रूरी)') : tx('Note (optional)', 'नोट (वैकल्पिक)')} className={inp} />
        <Err msg={err} />
        <button disabled={busy || (needNote && note.trim().length < 3) || handBad} onClick={() => go(submit, () => { onDone(c.ok); onClose(); })} className={`${btnDark} w-full ${c.danger ? '!bg-red-600' : '!bg-emerald-600'}`}>{c.cta}</button>
      </div>
    </Sheet>
  );
};

const RecordSheet: React.FC<{ onClose: () => void; onDone: (msg: string) => void; bookingId?: string | null }> = ({ onClose, onDone, bookingId }) => {
  const tx = useTx(); const { busy, err, go } = useBusy();
  const [list, setList] = useState<any[] | null>(null);
  const [bid, setBid] = useState(bookingId || ''); const [target, setTarget] = useState('');
  const [amount, setAmount] = useState(''); const [mode, setMode] = useState('CHEQUE'); const [ref, setRef] = useState(''); const [paidOn, setPaidOn] = useState(today()); const [note, setNote] = useState('');
  useEffect(() => { api.moneyCollectables().then(r => { setList(r.bookings); const first = r.bookings.find((b: any) => b.bookingId === bookingId) || r.bookings[0]; if (first) { setBid(first.bookingId); setTarget(first.targets[0].target); setAmount(String(first.targets[0].amount)); } }).catch(() => setList([])); }, [bookingId]);
  const bk = list?.find(b => b.bookingId === bid); const tg = bk?.targets.find((t: any) => t.target === target);
  const pickBooking = (id: string) => { setBid(id); const b = list!.find(x => x.bookingId === id); setTarget(b.targets[0].target); setAmount(String(b.targets[0].amount)); };
  const pickTarget = (id: string) => { setTarget(id); const t = bk.targets.find((x: any) => x.target === id); setAmount(String(t.amount)); };
  const n = Number(amount) || 0;
  const bad = !tg || n <= 0 || n > tg.amount || (tg.fixed && n !== tg.amount) || (mode !== 'CASH' && ref.trim().length < 3);
  return (
    <Sheet title={tx('Record money I collected', 'मैंने जो पैसा लिया वह दर्ज करें')} onClose={onClose}>
      {!list ? <p className="text-xs text-slate-500">{tx('Loading…', 'लोड हो रहा है…')}</p> : list.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-600">{tx('There is no booking right now on which you can record money. A booking amount can be recorded once a booking is requested; instalments after the builder approves it.', 'अभी कोई बुकिंग नहीं है जिस पर आप पैसा दर्ज कर सकें। बुकिंग राशि बुकिंग अनुरोध के बाद दर्ज होती है; किस्तें बिल्डर की मंज़ूरी के बाद।')}</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">{tx('Record only what you really took from the customer. It stays with you until the next person confirms it — nothing is added to the booking until the builder confirms.', 'सिर्फ़ वही दर्ज करें जो आपने ग्राहक से सच में लिया। अगला व्यक्ति कन्फ़र्म करे, तब तक पैसा आपके पास माना जाएगा — बिल्डर के कन्फ़र्म करने तक बुकिंग में कुछ नहीं जुड़ता।')}</p>
          <label className="block text-[11px] font-semibold text-slate-600">{tx('Customer', 'ग्राहक')}
            <select value={bid} onChange={e => pickBooking(e.target.value)} className={`${inp} mt-1`}>{list.map(b => <option key={b.bookingId} value={b.bookingId}>{b.customerName} · {b.projectName} · {b.unitNo}</option>)}</select></label>
          <label className="block text-[11px] font-semibold text-slate-600">{tx('Money for', 'किसलिए')}
            <select value={target} onChange={e => pickTarget(e.target.value)} className={`${inp} mt-1`}>{bk?.targets.map((t: any) => <option key={t.target} value={t.target}>{targetName(t.name, tx)} · {inr(t.amount)}{t.fixed ? '' : tx(' pending', ' बाकी')}</option>)}</select></label>
          <label className="block text-[11px] font-semibold text-slate-600">{tx('Amount (₹)', 'रकम (₹)')}
            <input inputMode="numeric" value={amount} disabled={tg?.fixed} onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))} className={`${inp} mt-1 disabled:bg-slate-50`} /></label>
          {tg && !tg.fixed && n > tg.amount && <p className="text-xs font-medium text-red-700">{tx(`Only ${inr(tg.amount)} is pending on this instalment.`, `इस किस्त में सिर्फ़ ${inr(tg.amount)} बाकी हैं।`)}</p>}
          <div className="grid grid-cols-2 gap-2">
            <select value={mode} onChange={e => setMode(e.target.value)} className={inp} aria-label={tx('Paid by', 'कैसे दिया')}>{TOKEN_MODES.map(m => <option key={m.id} value={m.id}>{tx(m.en, m.hi)}</option>)}</select>
            <input type="date" max={today()} value={paidOn} onChange={e => setPaidOn(e.target.value)} className={inp} aria-label={tx('Paid on', 'तारीख')} />
          </div>
          <input value={ref} onChange={e => setRef(e.target.value)} maxLength={40} placeholder={mode === 'CASH' ? tx('Receipt no. (optional for cash)', 'रसीद नं. (नकद में वैकल्पिक)') : tx('Cheque no. / UTR (required)', 'चेक नं. / UTR (ज़रूरी)')} className={inp} />
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder={tx('Note (optional)', 'नोट (वैकल्पिक)')} className={inp} />
          <Err msg={err} />
          <button disabled={busy || bad} onClick={() => go(() => api.moneyStart({ bookingId: bid, target, amount: n, mode, ref: ref.trim() || undefined, paidOn: paidOn ? new Date(paidOn + 'T12:00:00').toISOString() : undefined, note: note.trim() || undefined }), () => { onDone(tx('Recorded — the money is with you until it is confirmed', 'दर्ज हो गया — कन्फ़र्म होने तक पैसा आपके पास माना जाएगा')); onClose(); })} className={`${btnDark} w-full !bg-emerald-600`}>{tx('Record — I hold this money', 'दर्ज करें — यह पैसा मेरे पास है')}</button>
        </div>
      )}
    </Sheet>
  );
};

// ───────────────────────── one payment ─────────────────────────
const Stepper: React.FC<{ r: TrailRowV }> = ({ r }) => {
  const tx = useTx(); const hi = tx('en', 'hi') === 'hi';
  const sv = stepperOf(r);
  const label = (k: StepKey, bad: boolean) => ({
    COLLECTED: tx('Collected', 'वसूला'),
    CP: bad ? tx('Partner: not received', 'पार्टनर: नहीं मिला') : tx('Partner confirmed', 'पार्टनर ने माना'),
    HANDOVER: tx('Handed to builder', 'बिल्डर को सौंपा'),
    BUILDER: bad ? tx('Builder: not received', 'बिल्डर: नहीं मिला') : tx('Builder confirmed', 'बिल्डर ने माना'),
  }[k]);
  const waiting = (k: StepKey) => ({
    COLLECTED: '', CP: tx('waiting for partner', 'पार्टनर की प्रतीक्षा'), HANDOVER: tx('partner to hand over', 'पार्टनर सौंपेगा'),
    BUILDER: r.route === 'CP' ? tx('waiting for builder', 'बिल्डर की प्रतीक्षा') : tx('waiting for builder’s accounts', 'बिल्डर के अकाउंट की प्रतीक्षा'),
  }[k]);
  void hi;
  return (
    <ol className={`grid gap-1 ${sv.length === 4 ? 'grid-cols-4' : 'grid-cols-2'}`} aria-label={tx('Money trail', 'पैसे का सफ़र')}>
      {sv.map((s, i) => (
        <li key={s.key} className="min-w-0 text-center">
          <div className="flex items-center">
            <span className={`h-px flex-1 ${i === 0 ? 'bg-transparent' : s.state === 'todo' ? 'bg-slate-200' : 'bg-emerald-400'}`} />
            <span className={`mx-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-white ${s.state === 'done' ? 'bg-emerald-600' : s.state === 'bad' ? 'bg-red-600' : s.state === 'current' ? 'bg-amber-500 ring-4 ring-amber-100' : 'bg-slate-200 text-slate-400'}`}>
              {s.state === 'done' ? <Check className="h-3.5 w-3.5" /> : s.state === 'bad' ? <XIcon className="h-3.5 w-3.5" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
            </span>
            <span className={`h-px flex-1 ${i === sv.length - 1 ? 'bg-transparent' : s.state === 'done' ? 'bg-emerald-400' : 'bg-slate-200'}`} />
          </div>
          <div className={`mt-1 break-words text-[10px] font-semibold leading-tight ${s.state === 'bad' ? 'text-red-700' : s.state === 'todo' ? 'text-slate-400' : 'text-slate-800'}`}>{label(s.key, s.state === 'bad')}</div>
          {s.step
            ? <div className="text-[9px] leading-tight text-slate-500"><div className="truncate">{firstName(s.step.byName)}</div><div>{dShort(s.step.at)}</div></div>
            : <div className="text-[9px] leading-tight">{s.state === 'current' ? <span className="font-semibold text-amber-700">{waiting(s.key)}</span> : '\u00a0'}</div>}
        </li>
      ))}
    </ol>
  );
};

const PaymentCard: React.FC<{ r: TrailRowV; onAct: (a: NonNullable<Act>) => void; readOnly: boolean }> = ({ r, onAct, readOnly }) => {
  const tx = useTx(); const hi = tx('en', 'hi') === 'hi';
  const [open, setOpen] = useState(false);
  const h = r.holder; const hs = HOLD_STYLE[h.kind];
  const holdLine = (() => {
    switch (h.kind) {
      case 'COLLECTOR': return `${h.name} · ${sideLabel(r.collector.side, tx)}`;
      case 'CP': return `${h.name} · ${tx('partner', 'पार्टनर')}`;
      case 'BUILDER_PENDING': return `${h.name} · ${tx('builder — yet to confirm', 'बिल्डर — कन्फ़र्म बाकी')}`;
      case 'BUILDER': return `${h.name} · ${tx('builder — confirmed', 'बिल्डर — कन्फ़र्म')}`;
      default: return '—';
    }
  })();
  const c = r.can; const any = c.cpConfirm || c.handover || c.builderConfirm || c.cancel;
  const stuck = r.status === 'DISPUTED' || r.status === 'NOT_RECEIVED';
  const lastNote = [...r.steps].reverse().find(s => s.note && (s.stage === 'CP_NOT_RECEIVED' || s.stage === 'BUILDER_NOT_RECEIVED'));
  return (
    <article className={`min-w-0 rounded-xl border bg-white p-3 ${stuck ? 'border-red-300' : r.status === 'CANCELLED' ? 'border-slate-200 opacity-70' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900">{inr(r.amount)} <span className="text-xs font-semibold text-slate-600">· {targetName(r.targetName, tx)}</span></div>
          <div className="truncate text-[11px] text-slate-500">{r.customerName} · {r.projectName} · {r.unitNo}</div>
          <div className="text-[10px] text-slate-400">{modeLabel(r.mode, hi)}{r.ref ? ` · ${r.ref}` : ''}{r.paidOn ? ` · ${dShort(r.paidOn)}` : ''}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-500">{r.id}</span>
          {r.status === 'CANCELLED' && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">{tx('CANCELLED', 'रद्द')}</span>}
          {stuck && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700">{r.status === 'DISPUTED' ? tx('PARTNER: NOT RECEIVED', 'पार्टनर: नहीं मिला') : tx('BUILDER: NOT RECEIVED', 'बिल्डर: नहीं मिला')}</span>}
        </div>
      </div>

      {r.status !== 'CANCELLED' && (
        <div className={`mt-2 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${hs.on}`}>
          <Wallet className="h-4 w-4 shrink-0 text-slate-700" />
          <div className="min-w-0 text-[11px] leading-tight"><span className="text-slate-500">{tx('Money is with', 'पैसा अभी इनके पास')}</span><div className="truncate font-bold text-slate-900">{holdLine}</div></div>
        </div>
      )}

      <div className="mt-3"><Stepper r={r} /></div>
      {stuck && lastNote?.note && <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] text-red-800">“{lastNote.note}” — {lastNote.byName}</p>}

      {!readOnly && any && (
        <div className="mt-3 flex flex-wrap gap-2">
          {c.cpConfirm && <><button onClick={() => onAct({ k: 'cpYes', r })} className={`${btnDark} !bg-emerald-600`}><Check className="h-3.5 w-3.5" />{tx('I received it', 'मुझे मिल गया')}</button><button onClick={() => onAct({ k: 'cpNo', r })} className={btnLine}>{tx('Not received', 'नहीं मिला')}</button></>}
          {c.handover && <button onClick={() => onAct({ k: 'hand', r })} className={`${btnDark} !bg-violet-600`}><ArrowRight className="h-3.5 w-3.5" />{tx('Hand over to builder', 'बिल्डर को सौंपें')}</button>}
          {c.builderConfirm && (r.status === 'HANDED_OVER' || r.route === 'BUILDER')
            ? <><button onClick={() => onAct({ k: 'bYes', r })} className={`${btnDark} !bg-emerald-600`}><Check className="h-3.5 w-3.5" />{tx('Money arrived', 'पैसा पहुँचा')}</button><button onClick={() => onAct({ k: 'bNo', r })} className={btnLine}>{tx('Not received', 'नहीं मिला')}</button></>
            : c.builderConfirm && <button onClick={() => onAct({ k: 'bYes', r })} className={btnLine}>{r.status === 'NOT_RECEIVED' ? tx('It has arrived now', 'अब पहुँच गया') : tx('Confirm early (with reason)', 'पहले कन्फ़र्म करें (कारण के साथ)')}</button>}
          {c.cancel && <button onClick={() => onAct({ k: 'cancel', r })} className={`${btnLine} !border-red-200 !text-red-700`}>{tx('Cancel entry', 'एंट्री रद्द')}</button>}
        </div>
      )}
      {!readOnly && !any && isOpenTrail(r) && <p className="mt-2 text-[11px] text-slate-500">{tx('Nothing for you to do on this one right now.', 'इस पर अभी आपको कुछ करना नहीं है।')}</p>}

      <button onClick={() => setOpen(!open)} className="mt-2 flex min-h-8 items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900" aria-expanded={open}>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}{tx('History', 'इतिहास')} ({r.steps.length})
      </button>
      {open && (
        <ul className="mt-1 space-y-1.5 border-l-2 border-slate-100 pl-3">
          {r.steps.map((s, i) => (
            <li key={i} className="text-[11px] leading-snug">
              <div className="font-semibold text-slate-800">{STAGE_LABEL(s.stage, tx)}</div>
              <div className="text-slate-500">{s.byName} ({sideLabel(s.side, tx)}) · {dLong(s.at)}</div>
              {(s.mode || s.ref) && <div className="text-slate-500">{s.mode ? modeLabel(s.mode, hi) : ''}{s.ref ? ` · ${s.ref}` : ''}</div>}
              {s.note && <div className="text-slate-600">“{s.note}”</div>}
            </li>
          ))}
          {r.receiptNo && <li className="text-[11px] text-slate-600">{tx('Builder’s receipt', 'बिल्डर की रसीद')}: <b>{r.receiptNo}</b></li>}
        </ul>
      )}
    </article>
  );
};

// ───────────────────────── the Money tab ─────────────────────────
const HOLDERS: HolderKind[] = ['COLLECTOR', 'CP', 'BUILDER_PENDING', 'BUILDER'];

export const MoneyPanel: React.FC<{ flash: Flash; bookingId?: string | null; onClearBooking?: () => void; alertIds?: Set<string> | null; onClearAlert?: () => void; onChanged?: () => void; refreshKey?: number }> = ({ flash, bookingId, onClearBooking, alertIds, onClearAlert, onChanged, refreshKey }) => {
  const tx = useTx();
  const [d, setD] = useState<Awaited<ReturnType<typeof api.moneyTrails>> | null>(null);
  const [err, setErr] = useState(''); const [hold, setHold] = useState<HolderKind | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [act, setAct] = useState<Act>(null); const [rec, setRec] = useState(false);
  const load = useCallback(async () => { try { setD(await api.moneyTrails(bookingId || undefined)); setErr(''); } catch (e: any) { setErr(e.message); } }, [bookingId]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const rows = (d?.rows || []) as TrailRowV[];
  const shown = useMemo(() => rows.filter(r => (showCancelled || r.status !== 'CANCELLED') && (!hold || (r.status !== 'CANCELLED' && r.holder.kind === hold)) && (!alertIds || alertIds.has(r.bookingId))), [rows, hold, showCancelled, alertIds]);
  const cancelled = rows.filter(r => r.status === 'CANCELLED').length;
  const done = (msg: string) => { flash(true, msg); load(); onChanged?.(); };
  const TITLE: Record<HolderKind, string> = { COLLECTOR: tx('With team member', 'टीम मेंबर के पास'), CP: tx('With partner', 'पार्टनर के पास'), BUILDER_PENDING: tx('Handed to builder', 'बिल्डर को सौंपा'), BUILDER: tx('Builder confirmed', 'बिल्डर ने माना'), NONE: '' };
  const SUB: Record<HolderKind, string> = { COLLECTOR: tx('not yet confirmed by partner', 'पार्टनर ने अभी नहीं माना'), CP: tx('to be handed to builder', 'बिल्डर को सौंपना बाकी'), BUILDER_PENDING: tx('builder yet to confirm', 'बिल्डर का कन्फ़र्म बाकी'), BUILDER: tx('in the booking’s collection', 'बुकिंग की वसूली में जुड़ा'), NONE: '' };
  if (err && !d) return <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>;
  if (!d) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex min-w-0 flex-1 basis-60 items-start gap-1.5 text-[11px] text-slate-600"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />{tx('GENZ never holds money. Whoever has the money records it; the next person confirms it. Only the builder’s final confirmation adds it to the booking.', 'GENZ पैसा कभी नहीं रखता। जिसके पास पैसा है वह दर्ज करता है; अगला व्यक्ति कन्फ़र्म करता है। बुकिंग में रकम सिर्फ़ बिल्डर के आख़िरी कन्फ़र्म से जुड़ती है।')}</p>
        {d.canCollect && !d.readOnly && <button onClick={() => setRec(true)} className={`${btnDark} !bg-emerald-600`}><Plus className="h-4 w-4" />{tx('Record money I collected', 'मैंने जो पैसा लिया दर्ज करें')}</button>}
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="group" aria-label={tx('Who holds the money', 'पैसा किसके पास है')}>
        {HOLDERS.map(k => {
          const t = d.totals[k] || { count: 0, amount: 0 }; const on = hold === k;
          return (
            <button key={k} onClick={() => setHold(on ? null : k)} aria-pressed={on} className={`min-w-0 rounded-xl border p-2.5 text-left transition ${on ? `${HOLD_STYLE[k].on} ring-2 ring-slate-900` : 'border-slate-200 bg-white hover:border-slate-900'}`}>
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700"><span className={`h-2 w-2 shrink-0 rounded-full ${HOLD_STYLE[k].dot}`} /><span className="truncate">{TITLE[k]}</span></div>
              <div className="mt-1 text-base font-bold text-slate-900">{inr(t.amount)}</div>
              <div className="text-[10px] text-slate-500">{t.count} {tx(t.count === 1 ? 'entry' : 'entries', 'एंट्री')} · {SUB[k]}</div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
        {bookingId && <button onClick={onClearBooking} className="rounded-full border border-slate-300 bg-white px-2.5 py-1 font-semibold">{tx('One booking only', 'सिर्फ़ एक बुकिंग')} · {bookingId} ✕</button>}
        {alertIds && <button onClick={onClearAlert} className="rounded-full border border-amber-400 bg-amber-50 px-2.5 py-1 font-semibold text-amber-900">{tx('From the alert', 'अलर्ट से')} ✕</button>}
        {hold && <button onClick={() => setHold(null)} className="rounded-full border border-slate-900 bg-slate-900 px-2.5 py-1 font-semibold text-white">{TITLE[hold]} ✕</button>}
        {cancelled > 0 && <button onClick={() => setShowCancelled(!showCancelled)} className={`rounded-full border px-2.5 py-1 font-semibold ${showCancelled ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white'}`}>{tx('Show cancelled', 'रद्द दिखाएँ')} ({cancelled})</button>}
        {d.readOnly && <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold">{tx('View only', 'सिर्फ़ देखने के लिए')}</span>}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-xs text-slate-500">
          {rows.length === 0
            ? tx('No money entries yet. When a team member collects a cheque or cash, record it here — then it travels: partner confirms → handed to the builder → builder confirms.', 'अभी कोई एंट्री नहीं। टीम मेंबर चेक या नकद ले तो यहीं दर्ज करें — फिर यह चलेगा: पार्टनर कन्फ़र्म → बिल्डर को सौंपा → बिल्डर कन्फ़र्म।')
            : tx('Nothing matches this filter.', 'इस फ़िल्टर में कुछ नहीं मिला।')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{shown.map(r => <PaymentCard key={r.id} r={r} onAct={setAct} readOnly={d.readOnly} />)}</div>
      )}
      {act && <ActSheet act={act} onClose={() => setAct(null)} onDone={done} />}
      {rec && <RecordSheet bookingId={bookingId} onClose={() => setRec(false)} onDone={done} />}
    </div>
  );
};

/** A one-line strip on a booking card: money that is on its way, with who holds it. Tapping opens the Money tab for that booking. */
export const MoneyStrip: React.FC<{ trails?: MoneyTrail[]; onOpen: () => void }> = ({ trails, onOpen }) => {
  const tx = useTx();
  const live = (trails || []).filter(isOpenTrail);
  if (!live.length) return null;
  const total = live.reduce((a, t) => a + t.amount, 0);
  const stuck = live.some(t => t.status === 'DISPUTED' || t.status === 'NOT_RECEIVED');
  const names: Record<string, string> = { WITH_COLLECTOR: tx('with team member', 'टीम मेंबर के पास'), WITH_CP: tx('with partner', 'पार्टनर के पास'), HANDED_OVER: tx('handed to builder', 'बिल्डर को सौंपा'), NOT_RECEIVED: tx('builder: not received', 'बिल्डर: नहीं मिला'), DISPUTED: tx('partner: not received', 'पार्टनर: नहीं मिला') };
  const kinds = [...new Set(live.map(t => names[t.status]))].join(' · ');
  return (
    <button onClick={onOpen} className={`flex w-full min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-[11px] ${stuck ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
      <Wallet className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate"><b>{inr(total)}</b> {tx('on the way', 'रास्ते में')} · {kinds}</span><ArrowRight className="h-3.5 w-3.5 shrink-0" />
    </button>
  );
};
