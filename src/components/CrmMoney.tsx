import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import type { CrmBooking, CrmPaymentMilestone, CrmReceipt } from '../types/crm.js';
import { Sheet, Err, useBusy, inp, btnDark, btnLine, inr, type Flash } from './CrmPlus.js';

/** v16 — collections, payout ledger, cancellation. GENZ never moves money: it records what each side says and makes the other side confirm. */
const MODES: [string, string, string][] = [['UPI', 'UPI', 'UPI'], ['NEFT_RTGS', 'NEFT / RTGS', 'NEFT / RTGS'], ['CHEQUE', 'Cheque', 'चेक'], ['CASH', 'Cash', 'नकद'], ['DD', 'Demand draft', 'डीडी'], ['LOAN', 'Bank loan', 'बैंक लोन'], ['OTHER', 'Other', 'अन्य']];
const PAYOUT_MODES = MODES.filter(m => m[0] !== 'DD' && m[0] !== 'LOAN');
const day = (s?: string) => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const today = () => new Date().toISOString().slice(0, 10);

const ModeSelect: React.FC<{ value: string; onChange: (v: string) => void; payout?: boolean }> = ({ value, onChange, payout }) => {
  const tx = useTx();
  return <select value={value} onChange={e => onChange(e.target.value)} className={inp} aria-label={tx('Mode', 'माध्यम')}>{(payout ? PAYOUT_MODES : MODES).map(m => <option key={m[0]} value={m[0]}>{tx(m[1], m[2])}</option>)}</select>;
};

// ───────────────────────── sheets ─────────────────────────
const ReceiptSheet: React.FC<{ b: CrmBooking; m: CrmPaymentMilestone; onClose: () => void; onDone: () => void }> = ({ b, m, onClose, onDone }) => {
  const tx = useTx(); const { busy, err, go } = useBusy();
  const got = m.paidAmount ?? (m.paid ? m.amount : 0); const left = m.amount - got;
  const [amount, setAmount] = useState(String(left)); const [mode, setMode] = useState('UPI'); const [ref, setRef] = useState('');
  return (
    <Sheet title={tx(`Record money received — ${m.name}`, `मिला हुआ पैसा दर्ज करें — ${m.name}`)} onClose={onClose}>
      <div className="space-y-3">
        {m.claim?.status === 'OPEN' && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{tx('Associate says', 'एसोसिएट का कहना')} ({m.claim.byName}): “{m.claim.note}”</p>}
        <p className="text-xs text-slate-600">{tx(`Pending on this milestone: ${inr(left)}. Enter only what is actually in your account / receipt book — part payments are fine.`, `इस किस्त में बाकी: ${inr(left)}। सिर्फ़ वही दर्ज करें जो सच में आपके खाते / रसीद में आया है — आंशिक भुगतान चलेगा।`)}</p>
        <label className="block text-[11px] font-semibold text-slate-600">{tx('Amount received (₹)', 'मिली रकम (₹)')}<input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))} className={`${inp} mt-1`} /></label>
        <ModeSelect value={mode} onChange={setMode} />
        <input value={ref} onChange={e => setRef(e.target.value)} maxLength={40} placeholder={tx('Receipt no. / UTR / cheque no.', 'रसीद नं. / UTR / चेक नं.')} className={inp} />
        <Err msg={err} />
        <button disabled={busy || ref.trim().length < 3 || !(Number(amount) > 0) || Number(amount) > left} onClick={() => go(() => api.crmReceivePayment(b.id, m.id, { receiptNo: ref.trim(), amount: Number(amount), mode }), () => { onDone(); onClose(); })} className={`${btnDark} w-full`}>{tx('Record', 'दर्ज करें')}</button>
      </div>
    </Sheet>
  );
};

const NoteSheet: React.FC<{ title: string; help?: string; placeholder: string; cta: string; danger?: boolean; min?: number; onSubmit: (note: string) => Promise<any>; onClose: () => void; onDone: () => void }> = ({ title, help, placeholder, cta, danger, min = 5, onSubmit, onClose, onDone }) => {
  const { busy, err, go } = useBusy(); const [note, setNote] = useState('');
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="space-y-3">
        {help && <p className="text-xs text-slate-600">{help}</p>}
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={300} placeholder={placeholder} className={inp} />
        <Err msg={err} />
        <button disabled={busy || note.trim().length < min} onClick={() => go(() => onSubmit(note.trim()), () => { onDone(); onClose(); })} className={`${btnDark} w-full ${danger ? '!bg-red-600' : ''}`}>{cta}</button>
      </div>
    </Sheet>
  );
};

export const PayoutSheet: React.FC<{ b: CrmBooking; onClose: () => void; onDone: () => void }> = ({ b, onClose, onDone }) => {
  const tx = useTx(); const { busy, err, go } = useBusy();
  const [lg, setLg] = useState<any>(null);
  const [amount, setAmount] = useState(''); const [mode, setMode] = useState('NEFT_RTGS'); const [ref, setRef] = useState(''); const [paidOn, setPaidOn] = useState(today());
  useEffect(() => { api.crmLedger(b.id).then(r => { setLg(r); setAmount(String(r.summary.payable)); }).catch(() => setLg(false)); }, [b.id]);
  const s = lg?.summary; const amt = Number(amount) || 0; const tds = s ? Math.round((amt * s.tdsPct) / 100) : 0;
  return (
    <Sheet title={tx(`Release brokerage — ${b.customerName}`, `ब्रोकरेज रिलीज़ करें — ${b.customerName}`)} onClose={onClose}>
      {!s ? <p className="text-xs text-slate-500">{lg === false ? tx('Could not load the ledger.', 'लेजर लोड नहीं हुआ।') : tx('Loading…', 'लोड हो रहा है…')}</p> : (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">{tx(`Payable now: ${inr(s.payable)} (brokerage ${inr(s.brokerageAmount)} × ${s.collectedPct}% collected, less ${inr(s.paid)} already paid). Pay outside GENZ, then record the proof here — the associate will confirm.`, `अभी देय: ${inr(s.payable)} (ब्रोकरेज ${inr(s.brokerageAmount)} × ${s.collectedPct}% वसूली, घटाकर पहले दिया ${inr(s.paid)})। भुगतान GENZ के बाहर करें, फिर प्रमाण यहाँ दर्ज करें — एसोसिएट कन्फ़र्म करेगा।`)}</p>
          <label className="block text-[11px] font-semibold text-slate-600">{tx('Amount (₹)', 'रकम (₹)')}<input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))} className={`${inp} mt-1`} /></label>
          <div className="grid grid-cols-2 gap-2"><ModeSelect value={mode} onChange={setMode} payout /><input type="date" max={today()} value={paidOn} onChange={e => setPaidOn(e.target.value)} className={inp} aria-label={tx('Paid on', 'भुगतान की तारीख')} /></div>
          <input value={ref} onChange={e => setRef(e.target.value)} maxLength={40} placeholder={tx('UTR / cheque no. (required)', 'UTR / चेक नं. (ज़रूरी)')} className={inp} />
          <div className="rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-700">
            {tx(`TDS ${s.tdsPct}% = ${inr(tds)} · net to associate ${inr(amt - tds)}`, `TDS ${s.tdsPct}% = ${inr(tds)} · एसोसिएट को नेट ${inr(amt - tds)}`)}
            {s.noPan && <div className="mt-1 font-semibold text-amber-800">{tx('The associate has no PAN on file, so the higher no-PAN rate applies.', 'एसोसिएट का PAN फ़ाइल में नहीं है, इसलिए बिना-PAN की ऊँची दर लागू है।')}</div>}
            <div className="mt-1 text-slate-500">{tx('Indicative — confirm the rate with your CA.', 'सांकेतिक — दर अपने CA से पक्की करें।')}</div>
          </div>
          <Err msg={err} />
          <button disabled={busy || ref.trim().length < 3 || amt <= 0 || amt > s.payable} onClick={() => go(() => api.crmPayout(b.id, { amount: amt, ref: ref.trim(), mode, paidOn: new Date(paidOn + 'T12:00:00').toISOString() }), () => { onDone(); onClose(); })} className={`${btnDark} w-full !bg-emerald-600`}>{tx('Record payout', 'पेआउट दर्ज करें')}</button>
        </div>
      )}
    </Sheet>
  );
};

const CancelSheet: React.FC<{ b: CrmBooking; collected: number; paid: number; approve?: boolean; initialReason?: string; onClose: () => void; onDone: () => void }> = ({ b, collected, paid, approve, initialReason, onClose, onDone }) => {
  const tx = useTx(); const { busy, err, go } = useBusy();
  const [reason, setReason] = useState(initialReason || ''); const [refund, setRefund] = useState('0'); const [forfeit, setForfeit] = useState('0'); const [claw, setClaw] = useState(paid > 0 ? '' : '0'); const [note, setNote] = useState('');
  const n = (v: string) => Number(v) || 0; const over = n(refund) + n(forfeit) > collected;
  const body = { reason, refundAmount: n(refund), forfeitAmount: n(forfeit), clawbackAmount: paid > 0 ? n(claw) : undefined, settlementNote: note || undefined };
  return (
    <Sheet title={approve ? tx('Approve cancellation', 'कैंसिलेशन मंज़ूर करें') : tx('Cancel this booking', 'यह बुकिंग कैंसिल करें')} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-slate-600">{tx(`Collected so far: ${inr(collected)}. Record what happens to it — GENZ does not move the money, it only keeps the record for both sides.`, `अब तक वसूली: ${inr(collected)}। इसका क्या होगा, यहाँ दर्ज करें — GENZ पैसा नहीं हिलाता, सिर्फ़ दोनों पक्षों के लिए रिकॉर्ड रखता है।`)}</p>
        <input value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder={tx('Reason (min 5 characters)', 'कारण (कम से कम 5 अक्षर)')} className={inp} />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] font-semibold text-slate-600">{tx('Refund to customer ₹', 'ग्राहक को रिफ़ंड ₹')}<input inputMode="numeric" value={refund} onChange={e => setRefund(e.target.value.replace(/[^\d]/g, ''))} className={`${inp} mt-1`} /></label>
          <label className="text-[11px] font-semibold text-slate-600">{tx('Forfeited (kept) ₹', 'ज़ब्त (रखा) ₹')}<input inputMode="numeric" value={forfeit} onChange={e => setForfeit(e.target.value.replace(/[^\d]/g, ''))} className={`${inp} mt-1`} /></label>
        </div>
        {over && <p className="text-xs font-medium text-red-700">{tx('Refund + forfeit is more than what was collected.', 'रिफ़ंड + ज़ब्त वसूली से ज़्यादा है।')}</p>}
        {paid > 0 && (
          <label className="block text-[11px] font-semibold text-slate-600">{tx(`Brokerage already paid ${inr(paid)} — amount to take back from the associate ₹ (0 if none)`, `ब्रोकरेज पहले दिया ${inr(paid)} — एसोसिएट से वापस लेने की रकम ₹ (नहीं तो 0)`)}
            <input inputMode="numeric" value={claw} onChange={e => setClaw(e.target.value.replace(/[^\d]/g, ''))} className={`${inp} mt-1`} /></label>
        )}
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder={tx('Settlement note (optional)', 'सेटलमेंट नोट (वैकल्पिक)')} className={inp} />
        <Err msg={err} />
        <button disabled={busy || reason.trim().length < 5 || over || (paid > 0 && claw === '') || n(claw) > paid} onClick={() => go(() => (approve ? api.crmCancelDecide(b.id, { approve: true, note: reason, ...body }) : api.crmCancelBooking(b.id, body as any)), () => { onDone(); onClose(); })} className={`${btnDark} w-full !bg-red-600`}>{approve ? tx('Approve & cancel', 'मंज़ूर करें और कैंसिल') : tx('Cancel booking', 'बुकिंग कैंसिल करें')}</button>
      </div>
    </Sheet>
  );
};

// ───────────────────────── main money panel for an approved / cancelled booking ─────────────────────────
type Sh = null | { k: 'receipt'; m: CrmPaymentMilestone } | { k: 'claim'; m: CrmPaymentMilestone } | { k: 'reverse'; m: CrmPaymentMilestone; r: CrmReceipt } | { k: 'payout' } | { k: 'dispute'; pid: string }
  | { k: 'cancel' } | { k: 'cancelApprove' } | { k: 'cancelReq' } | { k: 'cancelDecline' } | { k: 'recovered' };

export const BookingMoney: React.FC<{ b: CrmBooking; role: string; meId: string; can: (...p: string[]) => boolean; onChanged: () => void; flash: Flash }> = ({ b, role, meId, can, onChanged, flash }) => {
  const tx = useTx();
  const [lg, setLg] = useState<any>(null); const [sh, setSh] = useState<Sh>(null);
  const load = useCallback(() => { api.crmLedger(b.id).then(setLg).catch(() => setLg(null)); }, [b.id]);
  useEffect(() => { load(); }, [load, b.updatedAt]);
  const done = () => { load(); onChanged(); };
  const isBuilder = can('crm:booking_decide'); const isAssoc = role === 'BROKER' && b.associateId === meId;
  const s = lg?.summary; const ms: (CrmPaymentMilestone & { receivedAmount?: number; pending?: number })[] = lg?.milestones || b.paymentSchedule;
  const payouts = lg?.payouts || b.payouts || [];
  const ack = async (pid: string) => { try { await api.crmPayoutAck(b.id, pid, 'CONFIRM'); flash(true, tx('Payment confirmed — thank you', 'भुगतान कन्फ़र्म — धन्यवाद')); done(); } catch (e: any) { flash(false, e.message); } };
  const cancelled = b.status === 'CANCELLED';
  const badge = (st: string) => st === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' : st === 'DISPUTED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800';
  const stLabel = (st: string) => st === 'CONFIRMED' ? tx('Confirmed by associate', 'एसोसिएट ने कन्फ़र्म किया') : st === 'DISPUTED' ? tx('Disputed', 'विवादित') : tx('Awaiting confirmation', 'कन्फ़र्मेशन बाकी');

  return (
    <div className="mt-3 space-y-4">
      {!cancelled && (
        <div>
          <div className="space-y-2">
            {ms.map(m => {
              const got = m.paidAmount ?? (m.paid ? m.amount : 0); const pctDone = Math.min(100, Math.round((got / (m.amount || 1)) * 100));
              const live = (m.receipts || []).filter(r => !r.reversed);
              return (
                <div key={m.id} className="rounded-lg border border-slate-200 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0"><div className="truncate text-xs font-bold text-slate-900">{m.name} <span className="font-normal text-slate-500">· {m.pct}%</span></div><div className="text-[11px] text-slate-500">{tx('Due', 'देय')} {day(m.dueDate)}{!m.paid && Date.parse(m.dueDate) < Date.now() ? <b className="ml-1 text-red-600">{tx('overdue', 'ओवरड्यू')}</b> : null}</div></div>
                    <div className="text-right text-xs"><b>{inr(got)}</b><span className="text-slate-500"> / {inr(m.amount)}</span></div>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pctDone} aria-valuemin={0} aria-valuemax={100}><div className={`h-full ${m.paid ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${pctDone}%` }} /></div>
                  {m.claim?.status === 'OPEN' && <p className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-900">{isBuilder ? tx(`${m.claim.byName} says the customer paid: “${m.claim.note}” — record it, or reply to them.`, `${m.claim.byName} का कहना है ग्राहक ने भुगतान किया: “${m.claim.note}” — इसे दर्ज करें या उन्हें जवाब दें।`) : tx(`You told the builder on ${day(m.claim.at)}: “${m.claim.note}”. Waiting for them to record it.`, `आपने ${day(m.claim.at)} को बिल्डर को बताया: “${m.claim.note}”। उनके दर्ज करने का इंतज़ार है।`)}</p>}
                  {(m.receipts || []).length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-[11px]">
                      {(m.receipts || []).map(r => (
                        <li key={r.id} className={`flex items-center justify-between gap-2 ${r.reversed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                          <span className="min-w-0 truncate">{inr(r.amount)} · {r.mode} · {r.ref} · {day(r.at)}{r.reversed ? ` — ${tx('reversed', 'रिवर्स')}: ${r.reversed.reason}` : ''}</span>
                          {isBuilder && !r.reversed && <button className="shrink-0 px-1 py-2 text-[10px] font-semibold text-red-600" onClick={() => setSh({ k: 'reverse', m, r })}>{tx('Reverse', 'रिवर्स')}</button>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!m.paid && b.status === 'APPROVED' && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {isBuilder && <button className={btnDark} onClick={() => setSh({ k: 'receipt', m })}>{tx('Record receipt', 'रसीद दर्ज करें')}</button>}
                      {isAssoc && m.claim?.status !== 'OPEN' && <button className={btnLine} onClick={() => setSh({ k: 'claim', m })}>{tx('Customer says paid?', 'ग्राहक ने भुगतान बताया?')}</button>}
                    </div>
                  )}
                  {live.length === 0 && m.paid && m.receiptNo && <p className="mt-1 text-[11px] text-slate-500">{tx('Receipt', 'रसीद')} {m.receiptNo}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {s && !cancelled && (
        <div className="rounded-lg border border-slate-200 p-2.5">
          <div className="text-xs font-bold text-slate-900">{tx('Brokerage ledger', 'ब्रोकरेज लेजर')}</div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-4">
            {[[tx('Brokerage', 'ब्रोकरेज'), inr(s.brokerageAmount)], [tx('Collected', 'वसूली'), `${s.collectedPct}%`], [tx('Payable now', 'अभी देय'), inr(s.payable)], [tx('Paid', 'चुकाया'), inr(s.paid)]].map(([k, v]) => <div key={k as string} className="rounded bg-slate-50 px-2 py-1.5"><div className="text-slate-500">{k}</div><b className="text-slate-900">{v}</b></div>)}
          </div>
          {payouts.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {payouts.map((p: any) => (
                <li key={p.id} className="rounded-lg bg-slate-50 p-2 text-[11px]">
                  <div className="flex flex-wrap items-center justify-between gap-1"><b className="text-slate-900">{inr(p.amount)}</b><span className={`rounded px-1.5 py-0.5 font-bold ${badge(p.status)}`}>{stLabel(p.status)}</span></div>
                  <div className="text-slate-600">{p.mode} · {tx('ref', 'रेफ़')} {p.ref} · {day(p.paidOn)} · TDS {p.tdsPct}% {inr(p.tds)} → {tx('net', 'नेट')} {inr(p.net)}</div>
                  {p.ackNote && <div className="text-slate-500">“{p.ackNote}”</div>}
                  {isAssoc && p.status === 'RECORDED' && <div className="mt-1.5 flex gap-2"><button className={`${btnDark} !bg-emerald-600`} onClick={() => ack(p.id)}>{tx('I received this', 'मुझे मिल गया')}</button><button className={`${btnLine} !border-red-300 !text-red-700`} onClick={() => setSh({ k: 'dispute', pid: p.id })}>{tx('Not received / wrong', 'नहीं मिला / गलत')}</button></div>}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {can('crm:payout') && isBuilder && s.payable > 0 && b.status === 'APPROVED' && <button className={`${btnDark} !bg-emerald-600`} onClick={() => setSh({ k: 'payout' })}>{tx('Release payout', 'पेआउट रिलीज़ करें')}</button>}
            {s.unconfirmed > 0 && isBuilder && <span className="text-[11px] text-amber-800">{tx(`${inr(s.unconfirmed)} not yet confirmed by the associate`, `${inr(s.unconfirmed)} पर एसोसिएट का कन्फ़र्मेशन बाकी`)}</span>}
          </div>
          {lg?.invoice && s.paid > 0 && (
            <details className="mt-2 text-[11px] text-slate-700">
              <summary className="min-h-9 cursor-pointer py-2 font-semibold">{tx('Indicative invoice breakup', 'सांकेतिक इनवॉइस ब्रेकअप')}</summary>
              <div className="space-y-0.5 rounded bg-slate-50 p-2">
                <div className="flex justify-between"><span>{tx('Brokerage paid', 'दिया गया ब्रोकरेज')}</span><b>{inr(lg.invoice.gross)}</b></div>
                <div className="flex justify-between"><span>GST 18% {lg.invoice.associateGstin ? '' : tx('(not applicable — no GSTIN)', '(लागू नहीं — GSTIN नहीं)')}</span><b>{inr(lg.invoice.gst)}</b></div>
                <div className="flex justify-between"><span>TDS {s.tdsPct}%</span><b>− {inr(lg.invoice.tds)}</b></div>
                <div className="flex justify-between border-t border-slate-200 pt-0.5"><span>{tx('Net to associate', 'एसोसिएट को नेट')}</span><b>{inr(lg.invoice.net)}</b></div>
                <p className="pt-1 text-[10px] text-slate-500">{lg.invoice.note}</p>
              </div>
            </details>
          )}
        </div>
      )}

      {cancelled && b.settlement && (
        <div className="rounded-lg border border-red-200 bg-red-50/50 p-2.5 text-[11px] text-slate-800">
          <div className="text-xs font-bold text-red-800">{tx('Cancelled — settlement record', 'कैंसिल — सेटलमेंट रिकॉर्ड')}</div>
          <div className="mt-1">{tx('Refund', 'रिफ़ंड')} {inr(b.settlement.refundAmount)} · {tx('Forfeited', 'ज़ब्त')} {inr(b.settlement.forfeitAmount)} · {tx('Brokerage clawback', 'ब्रोकरेज वापसी')} {inr(b.settlement.clawbackAmount)} ({b.settlement.clawbackStatus === 'DUE' ? tx('due', 'बाकी') : b.settlement.clawbackStatus === 'RECOVERED' ? tx('recovered', 'वसूल') : tx('none', 'नहीं')})</div>
          {b.settlement.note && <div className="text-slate-500">{b.settlement.note}</div>}
          {isBuilder && b.settlement.clawbackStatus === 'DUE' && <button className={`${btnDark} mt-2`} onClick={() => setSh({ k: 'recovered' })}>{tx('Mark clawback recovered', 'वापसी वसूल दर्ज करें')}</button>}
        </div>
      )}

      {b.status === 'APPROVED' && (
        <div className="space-y-2">
          {b.cancelRequest?.status === 'OPEN' && (
            <div className="rounded-lg border border-orange-200 bg-orange-50/60 p-2.5 text-[11px]">
              <b className="text-orange-900">{tx('Cancellation requested', 'कैंसिलेशन अनुरोध')}</b> · {b.cancelRequest.byName}: “{b.cancelRequest.reason}”
              {isBuilder ? <div className="mt-2 flex gap-2"><button className={`${btnDark} !bg-red-600`} onClick={() => setSh({ k: 'cancelApprove' })}>{tx('Approve…', 'मंज़ूर…')}</button><button className={btnLine} onClick={() => setSh({ k: 'cancelDecline' })}>{tx('Decline', 'अस्वीकार')}</button></div> : <div className="mt-1 text-slate-600">{tx('Waiting for the builder to decide.', 'बिल्डर के फ़ैसले का इंतज़ार।')}</div>}
            </div>
          )}
          {b.cancelRequest?.status === 'REJECTED' && <p className="text-[11px] text-slate-600">{tx('Cancellation request declined', 'कैंसिलेशन अनुरोध अस्वीकृत')}: {b.cancelRequest.decisionNote}</p>}
          <div className="flex flex-wrap gap-3">
            {isBuilder && <button className="min-h-9 text-[11px] font-semibold text-red-600 hover:underline" onClick={() => setSh({ k: 'cancel' })}>{tx('Cancel booking…', 'बुकिंग कैंसिल करें…')}</button>}
            {isAssoc && b.cancelRequest?.status !== 'OPEN' && <button className="min-h-9 text-[11px] font-semibold text-red-600 hover:underline" onClick={() => setSh({ k: 'cancelReq' })}>{tx('Request cancellation', 'कैंसिलेशन का अनुरोध')}</button>}
          </div>
        </div>
      )}

      {sh?.k === 'receipt' && <ReceiptSheet b={b} m={sh.m} onClose={() => setSh(null)} onDone={() => { flash(true, tx('Collection recorded', 'वसूली दर्ज हुई')); done(); }} />}
      {sh?.k === 'claim' && <NoteSheet title={tx(`Tell the builder: ${sh.m.name} is paid`, `बिल्डर को बताएँ: ${sh.m.name} का भुगतान हो गया`)} help={tx('This does not mark it paid. It tells the builder to check their account and record it — and it reaches them as an alert.', 'इससे भुगतान "पूरा" दर्ज नहीं होता। यह बिल्डर को अपना खाता जाँचकर दर्ज करने का अलर्ट भेजता है।')} placeholder={tx('What did the customer tell you? Date, mode, reference.', 'ग्राहक ने क्या बताया? तारीख, माध्यम, रेफ़रेंस।')} cta={tx('Send to builder', 'बिल्डर को भेजें')} onSubmit={n => api.crmClaimPayment(b.id, sh.m.id, n)} onClose={() => setSh(null)} onDone={() => { flash(true, tx('Builder alerted', 'बिल्डर को अलर्ट गया')); done(); }} />}
      {sh?.k === 'reverse' && <NoteSheet title={tx(`Reverse ${inr(sh.r.amount)} (${sh.r.ref})`, `${inr(sh.r.amount)} (${sh.r.ref}) रिवर्स करें`)} danger help={tx('Use this when a cheque bounced or an entry was wrong. Brokerage already paid cannot exceed what the remaining collection supports.', 'चेक बाउंस या गलत एंट्री पर इस्तेमाल करें। पहले से दिया ब्रोकरेज बची हुई वसूली से ज़्यादा नहीं हो सकता।')} placeholder={tx('Why is it being reversed?', 'रिवर्स क्यों?')} cta={tx('Reverse entry', 'एंट्री रिवर्स करें')} onSubmit={n => api.crmReverseReceipt(b.id, sh.m.id, sh.r.id, n)} onClose={() => setSh(null)} onDone={() => { flash(true, tx('Entry reversed (logged)', 'एंट्री रिवर्स (लॉग)')); done(); }} />}
      {sh?.k === 'payout' && <PayoutSheet b={b} onClose={() => setSh(null)} onDone={() => { flash(true, tx('Payout recorded — the associate will confirm', 'पेआउट दर्ज — एसोसिएट कन्फ़र्म करेगा')); done(); }} />}
      {sh?.k === 'dispute' && <NoteSheet title={tx('Payment not received / wrong', 'पेमेंट नहीं मिला / गलत')} danger placeholder={tx('What is wrong? (amount short, not in account…)', 'क्या गलत है? (रकम कम, खाते में नहीं…)')} cta={tx('Raise dispute', 'विवाद दर्ज करें')} onSubmit={n => api.crmPayoutAck(b.id, sh.pid, 'DISPUTE', n)} onClose={() => setSh(null)} onDone={() => { flash(true, tx('Dispute raised — the builder is alerted', 'विवाद दर्ज — बिल्डर को अलर्ट')); done(); }} />}
      {sh?.k === 'cancel' && <CancelSheet b={b} collected={s?.collected ?? 0} paid={b.brokeragePaidAmount} onClose={() => setSh(null)} onDone={() => { flash(true, tx('Booking cancelled', 'बुकिंग कैंसिल')); done(); }} />}
      {sh?.k === 'cancelApprove' && <CancelSheet b={b} approve initialReason={b.cancelRequest?.reason} collected={s?.collected ?? 0} paid={b.brokeragePaidAmount} onClose={() => setSh(null)} onDone={() => { flash(true, tx('Cancellation approved', 'कैंसिलेशन मंज़ूर')); done(); }} />}
      {sh?.k === 'cancelReq' && <NoteSheet title={tx('Request cancellation', 'कैंसिलेशन का अनुरोध')} help={tx('The builder decides, and records any refund or brokerage clawback.', 'फ़ैसला बिल्डर करेगा और रिफ़ंड / ब्रोकरेज वापसी दर्ज करेगा।')} placeholder={tx('Why does this booking need to be cancelled?', 'यह बुकिंग क्यों कैंसिल होनी चाहिए?')} cta={tx('Send request', 'अनुरोध भेजें')} onSubmit={n => api.crmCancelRequest(b.id, n)} onClose={() => setSh(null)} onDone={() => { flash(true, tx('Request sent to the builder', 'अनुरोध बिल्डर को भेजा')); done(); }} />}
      {sh?.k === 'cancelDecline' && <NoteSheet title={tx('Decline the request', 'अनुरोध अस्वीकार करें')} placeholder={tx('Tell the associate why (min 5 characters)', 'एसोसिएट को कारण बताएँ (कम से कम 5 अक्षर)')} cta={tx('Decline', 'अस्वीकार')} onSubmit={n => api.crmCancelDecide(b.id, { approve: false, note: n })} onClose={() => setSh(null)} onDone={() => { flash(true, tx('Request declined', 'अनुरोध अस्वीकृत')); done(); }} />}
      {sh?.k === 'recovered' && <NoteSheet title={tx('Clawback recovered', 'वापसी वसूल')} min={0} placeholder={tx('How was it recovered? (adjusted in next payout, bank transfer…)', 'कैसे वसूल हुआ? (अगले पेआउट में समायोजित, बैंक ट्रांसफ़र…)')} cta={tx('Mark recovered', 'वसूल दर्ज करें')} onSubmit={n => api.crmClawbackSettle(b.id, n)} onClose={() => setSh(null)} onDone={() => { flash(true, tx('Clawback marked recovered', 'वापसी वसूल दर्ज')); done(); }} />}
    </div>
  );
};

// ───────────────────────── builder: TDS rate per project ─────────────────────────
export const TdsPanel: React.FC<{ flash: Flash }> = ({ flash }) => {
  const tx = useTx(); const [projects, setProjects] = useState<any[]>([]); const [pid, setPid] = useState(''); const [pct, setPct] = useState('5');
  useEffect(() => { api.crmProjects().then(r => { setProjects(r.projects); if (r.projects[0]) { setPid(r.projects[0].id); setPct(String(r.projects[0].tdsPct ?? 5)); } }).catch(() => undefined); }, []);
  if (!projects.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-bold text-slate-900">{tx('TDS on brokerage', 'ब्रोकरेज पर TDS')}</div>
      <p className="mt-0.5 text-[11px] text-slate-500">{tx('Applies to new payouts of the project. If an associate has no PAN, the higher no-PAN rate (20%) is used automatically. Indicative — your CA decides the rate.', 'प्रोजेक्ट के नए पेआउट पर लागू। अगर एसोसिएट का PAN नहीं है तो ऊँची दर (20%) अपने-आप लगती है। सांकेतिक — दर आपका CA तय करे।')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={pid} onChange={e => { setPid(e.target.value); setPct(String(projects.find(p => p.id === e.target.value)?.tdsPct ?? 5)); }} className="min-h-9 rounded-lg border border-slate-300 px-2 text-xs">{projects.map(p => <option key={p.id} value={p.id}>{p.projectName}</option>)}</select>
        <input inputMode="decimal" value={pct} onChange={e => setPct(e.target.value.replace(/[^\d.]/g, ''))} className="min-h-9 w-20 rounded-lg border border-slate-300 px-2 text-xs" aria-label={tx('TDS %', 'TDS %')} /><span className="text-xs text-slate-600">%</span>
        <button className={btnDark} onClick={async () => { try { await api.crmSetTds(pid, Number(pct)); setProjects(ps => ps.map(p => (p.id === pid ? { ...p, tdsPct: Number(pct) } : p))); flash(true, tx('TDS rate saved (logged)', 'TDS दर सेव (लॉग)')); } catch (e: any) { flash(false, e.message); } }}>{tx('Save', 'सेव')}</button>
      </div>
    </div>
  );
};
