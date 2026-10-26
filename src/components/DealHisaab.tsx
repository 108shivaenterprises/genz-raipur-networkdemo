/**
 * v71 — हिसाब: the money of one deal, simply. Sale money (token / part / final / refund: how much came, how much is left) and, for a broker,
 * his PRIVATE brokerage book (due / received / paid out / in hand). GENZ holds none of this money — it is only a record.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Check } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';

const inp = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm';
const btn = 'inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50';
const today = () => new Date().toISOString().slice(0, 10);
const KIND: Record<string, [string, string]> = { TOKEN: ['Token', 'टोकन'], PART: ['Part payment', 'किस्त'], FINAL: ['Final payment', 'आख़िरी भुगतान'], REFUND: ['Refund to buyer', 'ख़रीदार को वापस'] };
const MODE: Record<string, [string, string]> = { UPI: ['UPI', 'UPI'], BANK: ['Bank', 'बैंक'], CASH: ['Cash', 'नक़द'], CHEQUE: ['Cheque', 'चेक'] };
const PARTY: Record<string, [string, string]> = { OWNER: ['Owner', 'मालिक'], BUYER: ['Buyer', 'ख़रीदार'], BROKER: ['Other broker', 'दूसरा ब्रोकर'], OTHER: ['Other', 'अन्य'] };

const Tile: React.FC<{ label: string; value: number; tone?: string; id?: string }> = ({ label, value, tone = 'text-slate-900', id }) => (
  <div className="rounded-lg bg-slate-50 p-2.5 text-center" data-testid={id}><div className={`text-base font-extrabold ${tone}`}>{formatINR(value)}</div><div className="text-[10px] font-medium text-slate-500">{label}</div></div>
);

export const DealHisaab: React.FC<{ dealId: string; compact?: boolean }> = ({ dealId }) => {
  const tx = useTx(); const hi = tx('en', 'hi') === 'hi';
  const [h, setH] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<'' | 'pay' | 'book'>('');
  const [pf, setPf] = useState({ kind: 'PART', amount: '', mode: 'UPI', ref: '', paidOn: today(), note: '' });
  const [bf, setBf] = useState({ dir: 'IN', party: 'OWNER', amount: '', mode: 'UPI', ref: '', paidOn: today(), note: '' });
  const [dueEdit, setDueEdit] = useState<string | null>(null);
  const load = useCallback(() => api.hisaab(dealId).then(x => { setH(x.hisaab); setErr(''); }).catch(e => setErr(e.message)), [dealId]);
  useEffect(() => { void load(); }, [load]);
  const run = async (fn: () => Promise<any>, after?: () => void) => { setBusy(true); setErr(''); try { const x = await fn(); if (x?.hisaab) setH(x.hisaab); after?.(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  if (!h) return err ? <p className="text-xs text-red-700" role="alert">{err}</p> : <Loader2 className="h-4 w-4 animate-spin" />;
  const s = h.sauda; const b = h.brokerage;
  const pct = s.price > 0 ? Math.min(100, Math.round((s.received / s.price) * 100)) : 0;
  const label = (m: Record<string, [string, string]>, k: string) => (m[k] ? tx(m[k][0], m[k][1]) : k);
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" data-testid="hisaab">
      <div>
        <h3 className="text-sm font-bold text-slate-900">💰 {tx('Accounts (हिसाब)', 'हिसाब')}</h3>
        <p className="text-[11px] text-slate-500">{tx('Only a record — GENZ never holds or moves this money. Pay directly (UPI / bank / cash / cheque).', 'सिर्फ़ रिकॉर्ड — यह पैसा GENZ के पास कभी नहीं आता। सीधे दें (UPI / बैंक / नक़द / चेक)।')}</p>
      </div>
      {err && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700" role="alert">{err}</p>}

      <div className="space-y-2" data-testid="hisaab-sale">
        <div className="text-xs font-bold text-slate-800">{tx('Sale money (buyer → owner)', 'सौदे का पैसा (ख़रीदार → मालिक)')}</div>
        <div className="grid grid-cols-3 gap-2">
          <Tile id="hisaab-price" label={tx('Deal price', 'सौदे की कीमत')} value={s.price} />
          <Tile id="hisaab-received" label={tx('Received', 'मिला')} value={s.received} tone="text-emerald-700" />
          <Tile id="hisaab-balance" label={tx('Left', 'बाक़ी')} value={s.balance} tone={s.balance > 0 ? 'text-amber-700' : 'text-emerald-700'} />
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
        {s.priceSource === 'ASKING' && <p className="text-[11px] text-amber-700">{tx('The final price is not set yet — figures use the asking price.', 'अंतिम कीमत तय नहीं है — हिसाब माँगी गई कीमत से है।')}</p>}
        {s.over > 0 && <p className="text-[11px] font-semibold text-red-700">{tx('More than the price is recorded — check the entries.', 'कीमत से ज़्यादा दर्ज है — एंट्री जाँचें।')} (+{formatINR(s.over)})</p>}
        {s.entries.length === 0 && <p className="text-xs text-slate-500">{tx('No payment written yet.', 'अभी कोई भुगतान दर्ज नहीं।')}</p>}
        {s.entries.map((e: any) => (
          <div key={e.id} className={`rounded-lg border p-2 text-xs ${e.void ? 'border-slate-200 bg-slate-50 text-slate-400 line-through' : 'border-slate-200'}`} data-testid={`hisaab-entry-${e.id}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{label(KIND, e.kind)}{e.auto ? ` · ${tx('from the offer', 'ऑफ़र से')}` : ''}</span>
              <span className={`font-extrabold ${e.kind === 'REFUND' ? 'text-red-700' : 'text-emerald-700'}`}>{e.kind === 'REFUND' ? '−' : ''}{formatINR(e.amount)}</span>
            </div>
            <div className="text-[11px] text-slate-500">{e.paidOn}{e.mode ? ` · ${label(MODE, e.mode)}` : ''}{e.ref ? ` · ${e.ref}` : ''}{e.note && !e.auto ? ` · ${e.note}` : ''}{!e.auto && e.byName ? ` · ${e.byName}` : ''}</div>
            {!e.void && !e.auto && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {e.ack ? <span className="font-semibold text-emerald-700">✔ {tx('Confirmed by', 'माना')} {e.ack.byName}</span> : <span className="text-amber-700">⏳ {tx('Not confirmed yet', 'पुष्टि बाक़ी')}</span>}
                {!e.ack && h.canAck && e.byId !== h.me && <button type="button" disabled={busy} className="min-h-9 rounded-lg border border-emerald-300 px-3 font-semibold text-emerald-800" data-testid={`hisaab-ack-${e.id}`} onClick={() => run(() => api.hisaabAck(dealId, e.id))}><Check className="inline h-3.5 w-3.5" /> {tx('Yes, received', 'हाँ, मिल गया')}</button>}
                {!e.ack && h.canRecord && <button type="button" disabled={busy} className="min-h-9 rounded-lg border border-slate-300 px-3" onClick={() => { const r = window.prompt(tx('Why cancel this entry?', 'यह एंट्री क्यों रद्द कर रहे हैं?')); if (r) void run(() => api.hisaabVoid(dealId, e.id, r)); }}>{tx('Cancel', 'रद्द')}</button>}
              </div>
            )}
            {e.void && <div className="text-[11px]">{tx('Cancelled', 'रद्द')}: {e.void.reason}</div>}
          </div>
        ))}
        {h.canRecord && (open === 'pay' ? (
          <div className="space-y-2 rounded-lg bg-slate-50 p-3" data-testid="hisaab-pay-form">
            <select className={inp} value={pf.kind} onChange={e => setPf({ ...pf, kind: e.target.value })} data-testid="hisaab-kind">{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{tx(v[0], v[1])}</option>)}</select>
            <div className="grid grid-cols-2 gap-2">
              <input className={inp} inputMode="numeric" placeholder={tx('Amount ₹', 'रकम ₹')} value={pf.amount} onChange={e => setPf({ ...pf, amount: e.target.value.replace(/\D/g, '') })} data-testid="hisaab-amount" />
              <select className={inp} value={pf.mode} onChange={e => setPf({ ...pf, mode: e.target.value })}>{Object.entries(MODE).map(([k, v]) => <option key={k} value={k}>{tx(v[0], v[1])}</option>)}</select>
              <input className={inp} type="date" max={today()} value={pf.paidOn} onChange={e => setPf({ ...pf, paidOn: e.target.value })} />
              <input className={inp} placeholder={tx('UTR / cheque no.', 'UTR / चेक नं.')} value={pf.ref} onChange={e => setPf({ ...pf, ref: e.target.value })} />
            </div>
            <input className={inp} placeholder={tx('Note (optional)', 'नोट (वैकल्पिक)')} maxLength={200} value={pf.note} onChange={e => setPf({ ...pf, note: e.target.value })} />
            <div className="flex gap-2"><button type="button" className={btn} disabled={busy || !pf.amount} data-testid="hisaab-pay-save" onClick={() => run(() => api.hisaabPay(dealId, { ...pf, amount: Number(pf.amount) }), () => { setOpen(''); setPf({ ...pf, amount: '', ref: '', note: '' }); })}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : tx('Save', 'सेव करें')}</button><button type="button" className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm" onClick={() => setOpen('')}>{tx('Close', 'बंद')}</button></div>
          </div>
        ) : <button type="button" className={btn} onClick={() => setOpen('pay')} data-testid="hisaab-pay-open"><Plus className="h-4 w-4" />{tx('Write a payment', 'भुगतान लिखें')}</button>)}
      </div>

      {h.ownerBrokerage && (
        <div className="space-y-2 border-t border-slate-100 pt-3" data-testid="hisaab-owner">
          <div className="text-xs font-bold text-slate-800">{tx('Your brokerage to the broker', 'ब्रोकर को आपका ब्रोकरेज')}</div>
          <div className="grid grid-cols-3 gap-2"><Tile label={tx('To pay', 'देना है')} value={h.ownerBrokerage.due} /><Tile label={tx('Paid', 'दिया')} value={h.ownerBrokerage.paid} tone="text-emerald-700" /><Tile label={tx('Left to pay', 'देना बाक़ी')} value={h.ownerBrokerage.left} tone="text-amber-700" /></div>
          <Tile id="hisaab-owner-hand" label={tx('In your hand (received − brokerage paid)', 'आपके हाथ में (मिला − ब्रोकरेज दिया)')} value={h.ownerHand} tone="text-indigo-700" />
        </div>
      )}

      {b && (
        <div className="space-y-2 border-t border-slate-100 pt-3" data-testid="hisaab-broker">
          <div className="text-xs font-bold text-slate-800">{tx('My brokerage (only I can see this)', 'मेरा ब्रोकरेज (सिर्फ़ मुझे दिखता है)')}</div>
          <div className="grid grid-cols-3 gap-2">
            <Tile id="hisaab-due" label={tx('Due to me', 'मेरा बनता है')} value={b.due} />
            <Tile id="hisaab-got" label={tx('Received', 'मिला')} value={b.received} tone="text-emerald-700" />
            <Tile id="hisaab-left" label={tx('Left', 'बाक़ी')} value={b.left} tone={b.left > 0 ? 'text-amber-700' : 'text-emerald-700'} />
          </div>
          <div className="grid grid-cols-2 gap-2"><Tile label={tx('Paid out (co-broker etc.)', 'आगे दिया (दूसरा ब्रोकर आदि)')} value={b.paidOut} tone="text-red-700" /><Tile id="hisaab-hand" label={tx('In my hand', 'मेरे हाथ में बचा')} value={b.inHand} tone="text-indigo-700" /></div>
          <p className="text-[11px] text-slate-500">{b.dueBasis === 'MANDATE' ? tx('Due is from the owner’s mandate at this price.', 'यह रकम इस कीमत पर मालिक के मंडेट से है।') : b.dueBasis === 'OWN_SIDE' ? tx('Due is your own-side fee.', 'यह आपकी अपनी-साइड फ़ीस है।') : b.dueBasis === 'SPLIT' ? tx('Due is your share of the expected brokerage.', 'यह अपेक्षित ब्रोकरेज में आपका हिस्सा है।') : b.dueBasis === 'MANUAL' ? tx('Due is the amount you typed.', 'यह आपकी लिखी रकम है।') : tx('Brokerage amount not known — type it.', 'ब्रोकरेज की रकम पता नहीं — लिखें।')}{' '}
            {dueEdit === null ? <button type="button" className="font-semibold underline" onClick={() => setDueEdit(String(b.due || ''))}>{tx('Change', 'बदलें')}</button> : null}</p>
          {dueEdit !== null && <div className="flex gap-2"><input className={inp} inputMode="numeric" value={dueEdit} onChange={e => setDueEdit(e.target.value.replace(/\D/g, ''))} data-testid="hisaab-due-input" /><button type="button" className={btn} onClick={() => run(() => api.hisaabDue(dealId, dueEdit === '' ? null : Number(dueEdit)), () => setDueEdit(null))}>{tx('Save', 'सेव')}</button></div>}
          {b.entries.map((e: any) => (
            <div key={e.id} className={`rounded-lg border p-2 text-xs ${e.void ? 'border-slate-200 text-slate-400 line-through' : 'border-slate-200'}`} data-testid={`hisaab-book-${e.id}`}>
              <div className="flex justify-between gap-2"><span className="font-semibold">{e.dir === 'IN' ? tx('Received from', 'मिला —') : tx('Paid to', 'दिया —')} {label(PARTY, e.party)}{e.auto ? ` · ${tx('bill', 'बिल')}` : ''}</span><span className={`font-extrabold ${e.dir === 'IN' ? 'text-emerald-700' : 'text-red-700'}`}>{e.dir === 'IN' ? '+' : '−'}{formatINR(e.amount)}</span></div>
              <div className="text-[11px] text-slate-500">{e.paidOn}{e.mode ? ` · ${label(MODE, e.mode)}` : ''}{e.ref ? ` · ${e.ref}` : ''}{e.note ? ` · ${e.note}` : ''}</div>
              {!e.void && !e.auto && <button type="button" disabled={busy} className="mt-1 min-h-9 rounded-lg border border-slate-300 px-3" onClick={() => { const r = window.prompt(tx('Why cancel this entry?', 'यह एंट्री क्यों रद्द कर रहे हैं?')); if (r) void run(() => api.hisaabBookVoid(dealId, e.id, r)); }}>{tx('Cancel', 'रद्द')}</button>}
              {e.void && <div className="text-[11px]">{tx('Cancelled', 'रद्द')}: {e.void.reason}</div>}
            </div>
          ))}
          {open === 'book' ? (
            <div className="space-y-2 rounded-lg bg-slate-50 p-3" data-testid="hisaab-book-form">
              <div className="grid grid-cols-2 gap-2">
                <select className={inp} value={bf.dir} onChange={e => setBf({ ...bf, dir: e.target.value })} data-testid="hisaab-dir"><option value="IN">{tx('I received', 'मुझे मिला')}</option><option value="OUT">{tx('I paid out', 'मैंने दिया')}</option></select>
                <select className={inp} value={bf.party} onChange={e => setBf({ ...bf, party: e.target.value })}>{Object.entries(PARTY).map(([k, v]) => <option key={k} value={k}>{tx(v[0], v[1])}</option>)}</select>
                <input className={inp} inputMode="numeric" placeholder={tx('Amount ₹', 'रकम ₹')} value={bf.amount} onChange={e => setBf({ ...bf, amount: e.target.value.replace(/\D/g, '') })} data-testid="hisaab-book-amount" />
                <select className={inp} value={bf.mode} onChange={e => setBf({ ...bf, mode: e.target.value })}>{Object.entries(MODE).map(([k, v]) => <option key={k} value={k}>{tx(v[0], v[1])}</option>)}</select>
                <input className={inp} type="date" max={today()} value={bf.paidOn} onChange={e => setBf({ ...bf, paidOn: e.target.value })} />
                <input className={inp} placeholder={tx('UTR / ref', 'UTR / रेफ़')} value={bf.ref} onChange={e => setBf({ ...bf, ref: e.target.value })} />
              </div>
              <p className="text-[11px] text-slate-500">{tx('A brokerage bill marked paid is counted by itself — do not write it again.', 'ब्रोकरेज बिल “मिल गया” होने पर अपने आप गिना जाता है — दोबारा न लिखें।')}</p>
              <div className="flex gap-2"><button type="button" className={btn} disabled={busy || !bf.amount} data-testid="hisaab-book-save" onClick={() => run(() => api.hisaabBook(dealId, { ...bf, amount: Number(bf.amount) }), () => { setOpen(''); setBf({ ...bf, amount: '', ref: '', note: '' }); })}>{tx('Save', 'सेव करें')}</button><button type="button" className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm" onClick={() => setOpen('')}>{tx('Close', 'बंद')}</button></div>
            </div>
          ) : <button type="button" className={btn} onClick={() => setOpen('book')} data-testid="hisaab-book-open"><Plus className="h-4 w-4" />{tx('Write brokerage received / paid', 'ब्रोकरेज मिला / दिया लिखें')}</button>}
        </div>
      )}
    </section>
  );
};

/** Deal Desk → हिसाब: all my deals at a glance; tap one to open its accounts */
export const HisaabTab: React.FC = () => {
  const tx = useTx();
  const [d, setD] = useState<any>(null); const [open, setOpen] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { api.hisaabList().then(setD).catch(e => setErr(e.message)); }, []);
  if (err) return <p className="text-xs text-red-700">{err}</p>;
  if (!d) return <Loader2 className="h-4 w-4 animate-spin" />;
  const t = d.totals;
  return (
    <div className="space-y-3" data-testid="hisaab-tab">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label={tx('Sale money received', 'सौदों में मिला')} value={t.received} tone="text-emerald-700" />
        <Tile label={tx('Sale money left', 'सौदों में बाक़ी')} value={t.balance} tone="text-amber-700" />
        <Tile label={tx('My brokerage received', 'मेरा ब्रोकरेज मिला')} value={t.brokerGot} tone="text-emerald-700" />
        <Tile label={tx('My brokerage left', 'मेरा ब्रोकरेज बाक़ी')} value={Math.max(0, t.brokerDue - t.brokerGot)} tone="text-amber-700" />
      </div>
      {d.deals.length === 0 && <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{tx('No deal with a price or payment yet.', 'अभी किसी सौदे में कीमत या भुगतान दर्ज नहीं।')}</p>}
      {d.deals.map((x: any) => (
        <div key={x.dealId} className="rounded-xl border border-slate-200 bg-white" data-testid={`hisaab-row-${x.dealId}`}>
          <button type="button" className="flex w-full items-start justify-between gap-2 p-3 text-left" onClick={() => setOpen(open === x.dealId ? '' : x.dealId)}>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{x.title}</span><span className="text-[11px] text-slate-500">{x.dealId} · {x.stage}</span></span>
            <span className="shrink-0 text-right text-[11px]"><span className="block font-bold text-emerald-700">{tx('Got', 'मिला')} {formatINR(x.received)}</span><span className="block font-bold text-amber-700">{tx('Left', 'बाक़ी')} {formatINR(x.balance)}</span></span>
          </button>
          {open === x.dealId && <div className="border-t border-slate-100 p-2"><DealHisaab dealId={x.dealId} /></div>}
        </div>
      ))}
    </div>
  );
};
