import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useI18n, useTx } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';
import { Pill, fmtRange, fmtDay, inr, useFlash, INPUT, BTN_DARK, BTN_GREEN, BTN_LINE, BTN_RED, CARD, type Tone } from './shared.js';

const LEAVE_TYPE: Record<string, [string, string]> = { CASUAL: ['Casual', 'कैज़ुअल'], SICK: ['Sick', 'बीमारी'], UNPAID: ['Unpaid', 'बिना वेतन'] };
const CLAIM_KIND: Record<string, [string, string]> = { PETROL: ['Petrol', 'पेट्रोल'], TRAVEL: ['Travel', 'यात्रा'], FOOD: ['Food', 'खाना'], PHONE: ['Phone', 'फ़ोन'], SITE: ['Site', 'साइट'], OTHER: ['Other', 'अन्य'] };
export const useStatusPill = () => {
  const tx = useTx();
  return (s: string): React.ReactNode => {
    const m: Record<string, [string, Tone]> = {
      PENDING: [tx('Waiting', 'इंतज़ार'), 'amber'], APPROVED: [tx('Approved', 'मंज़ूर'), 'green'], REJECTED: [tx('Rejected', 'नामंज़ूर'), 'red'], CANCELLED: [tx('Cancelled', 'रद्द'), 'slate'], PAID: [tx('Paid', 'भुगतान हुआ'), 'blue'],
    };
    const [label, tone] = m[s] || [s, 'slate']; return <Pill tone={tone}>{label}</Pill>;
  };
};

/** a Reject button opens a one-line reason box (the member is told why) */
const DecideRow: React.FC<{ onApprove: () => Promise<void>; onReject: (note: string) => Promise<void>; approveLabel?: string }> = ({ onApprove, onReject, approveLabel }) => {
  const tx = useTx(); const [rej, setRej] = useState(false); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  if (rej) return (
    <div className="mt-2 flex gap-2"><input autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder={tx('Reason (he will see it)', 'कारण (उसे दिखेगा)')} className={`${INPUT} min-w-0 flex-1`} />
      <button disabled={busy || note.trim().length < 3} onClick={() => run(() => onReject(note))} className={BTN_RED}>{tx('Reject', 'नामंज़ूर')}</button><button onClick={() => setRej(false)} className={BTN_LINE}>{tx('Back', 'वापस')}</button></div>);
  return <div className="mt-2 flex gap-2"><button disabled={busy} onClick={() => run(onApprove)} className={BTN_GREEN}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{approveLabel || tx('Approve', 'मंज़ूर करें')}</button><button disabled={busy} onClick={() => setRej(true)} className={BTN_RED}>{tx('Reject', 'नामंज़ूर')}</button></div>;
};

// ───────────────────────── Leave ─────────────────────────
export const HrLeave: React.FC<{ ov: any; reload: () => void }> = ({ ov, reload }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi'; const pill = useStatusPill();
  const { flash, node } = useFlash();
  const [d, setD] = useState<any>(null);
  const [f, setF] = useState({ userId: '', type: 'CASUAL', from: '', to: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const load = () => api.hrLeaves().then(setD).catch(e => flash(false, e.message));
  useEffect(() => { load(); }, []);
  if (!d) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  const act = async (fn: () => Promise<any>, ok: string) => { try { const r = await fn(); flash(true, r?.handedBack ? `${ok} · ${tx(`${r.handedBack} open lead(s) taken back`, `${r.handedBack} खुली लीड वापस ली गईं`)}` : ok); await load(); reload(); } catch (e: any) { flash(false, e.message); } };
  const pending = d.leaves.filter((l: any) => l.status === 'PENDING'); const rest = d.leaves.filter((l: any) => l.status !== 'PENDING');
  const left = (id: string) => d.balances.find((b: any) => b.id === id);
  const grant = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await api.hrLeaveGrant({ ...f, to: f.to || f.from }); flash(true, tx('Leave noted', 'छुट्टी दर्ज हुई')); setF({ userId: '', type: 'CASUAL', from: '', to: '', reason: '' }); await load(); reload(); }
    catch (x: any) { flash(false, x.message); } finally { setBusy(false); }
  };
  const tname = (t: string) => (LEAVE_TYPE[t] || [t, t])[hi ? 1 : 0];
  return (
    <div className="space-y-4">
      {node}
      <section className="space-y-2">
        <h3 className="text-sm font-bold text-slate-900">{tx('Waiting for your answer', 'आपके जवाब का इंतज़ार')} ({pending.length})</h3>
        {pending.length === 0 && <div className={`${CARD} text-center text-xs text-slate-500`}>{tx('No leave request is waiting. 🎉', 'कोई छुट्टी की अर्ज़ी बाकी नहीं। 🎉')}</div>}
        {pending.map((l: any) => { const b = left(l.userId); return (
          <div key={l.id} className={CARD}>
            <div className="flex items-start justify-between gap-2"><div><div className="text-sm font-bold text-slate-900">{l.userName}</div><div className="text-xs text-slate-600">{fmtRange(l.from, l.to, hi)} · {l.days} {tx(l.days === 1 ? 'day' : 'days', 'दिन')} · {tname(l.type)}</div></div>{b && <Pill tone={b.left < l.days ? 'red' : 'slate'}>{tx(`${b.left} paid days left`, `${b.left} सवेतन दिन बाकी`)}</Pill>}</div>
            <p className="mt-1 text-xs text-slate-700">“{l.reason}”</p>
            <DecideRow onApprove={() => act(() => api.hrLeaveDecide(l.id, 'APPROVE'), tx('Approved', 'मंज़ूर किया'))} onReject={note => act(() => api.hrLeaveDecide(l.id, 'REJECT', note), tx('Rejected', 'नामंज़ूर किया'))} />
          </div>); })}
      </section>
      <details className={CARD}><summary className="cursor-pointer text-sm font-bold text-slate-900">{tx('Note a leave yourself (he asked on the phone)', 'छुट्टी ख़ुद दर्ज करें (उसने फ़ोन पर बताई)')}</summary>
        <form onSubmit={grant} className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <select required value={f.userId} onChange={e => setF({ ...f, userId: e.target.value })} className={`${INPUT} col-span-2`}><option value="">{tx('Who?', 'कौन?')}</option>{ov.board.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <select value={f.type} onChange={e => setF({ ...f, type: e.target.value })} className={`${INPUT} col-span-2`}>{d.types.map((t: any) => <option key={t.id} value={t.id}>{hi ? t.hi : t.en}</option>)}</select>
          <label className="space-y-1"><span className="text-slate-500">{tx('From', 'से')}</span><input required type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to })} className={INPUT} /></label>
          <label className="space-y-1"><span className="text-slate-500">{tx('To', 'तक')}</span><input type="date" value={f.to} min={f.from} onChange={e => setF({ ...f, to: e.target.value })} className={INPUT} /></label>
          <input required value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} placeholder={tx('Reason', 'कारण')} className={`${INPUT} col-span-2`} />
          <button disabled={busy} className={`${BTN_DARK} col-span-2`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Save leave', 'छुट्टी दर्ज करें')}</button>
        </form>
      </details>
      <details className={CARD}><summary className="cursor-pointer text-sm font-bold text-slate-900">{tx(`Paid leave left in ${d.year}`, `${d.year} में बची सवेतन छुट्टी`)}</summary>
        <ul className="mt-2 divide-y divide-slate-100 text-xs">{d.balances.map((b: any) => <li key={b.id} className="flex items-center justify-between py-2"><span className="font-medium">{b.name}</span><span className="text-slate-600">{b.left} / {b.allowance}{b.pending ? ` · ${b.pending} ${tx('waiting', 'इंतज़ार में')}` : ''}</span></li>)}</ul>
      </details>
      {rest.length > 0 && <section className="space-y-1">
        <h3 className="text-sm font-bold text-slate-900">{tx('Earlier', 'पहले की')}</h3>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-xs">{rest.slice(0, 25).map((l: any) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <span><b className="text-slate-900">{l.userName}</b> · {fmtRange(l.from, l.to, hi)} · {l.days} {tx('d', 'दिन')} · {tname(l.type)}{l.decidedNote ? <span className="block text-slate-500">{l.decidedNote}</span> : null}</span>
            <span className="flex items-center gap-2">{pill(l.status)}{l.status === 'APPROVED' && l.to >= ov.today && <button className="text-[11px] font-semibold text-red-600 underline" onClick={() => act(() => api.hrLeaveCancel(l.id), tx('Leave cancelled', 'छुट्टी रद्द'))}>{tx('Cancel', 'रद्द करें')}</button>}</span>
          </li>))}</ul>
      </section>}
    </div>
  );
};

// ───────────────────────── Expenses (claims) ─────────────────────────
export const HrClaims: React.FC<{ reload: () => void }> = ({ reload }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi'; const pill = useStatusPill();
  const { flash, node } = useFlash();
  const [d, setD] = useState<any>(null);
  const load = () => api.hrClaims().then(setD).catch(e => flash(false, e.message));
  useEffect(() => { load(); }, []);
  if (!d) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  const act = async (fn: () => Promise<any>, ok: string) => { try { await fn(); flash(true, ok); await load(); reload(); } catch (e: any) { flash(false, e.message); } };
  const pending = d.claims.filter((c: any) => c.status === 'PENDING'); const toPay = d.claims.filter((c: any) => c.status === 'APPROVED'); const rest = d.claims.filter((c: any) => c.status === 'PAID' || c.status === 'REJECTED');
  const kind = (k: string) => (CLAIM_KIND[k] || [k, k])[hi ? 1 : 0];
  const row = (c: any) => <div className="text-xs"><div className="flex items-baseline justify-between gap-2"><b className="text-sm text-slate-900">{c.userName}</b><b className="text-sm text-slate-900">{inr(c.amount)}</b></div><div className="text-slate-600">{kind(c.kind)} · {fmtDay(c.date, hi)} — {c.note}</div>{c.decidedNote && <div className="text-slate-500">{c.decidedNote}</div>}</div>;
  return (
    <div className="space-y-4">
      {node}
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">{tx('GENZ only keeps the record — you pay your people yourself, then tap “Paid”.', 'GENZ सिर्फ़ रिकॉर्ड रखता है — भुगतान आप ख़ुद करें, फिर “भुगतान हुआ” दबाएँ।')}</p>
      <section className="space-y-2">
        <h3 className="text-sm font-bold text-slate-900">{tx('To approve', 'मंज़ूरी के लिए')} ({pending.length}){d.totals.pending ? ` · ${inr(d.totals.pending)}` : ''}</h3>
        {pending.length === 0 && <div className={`${CARD} text-center text-xs text-slate-500`}>{tx('No expense claim is waiting.', 'कोई ख़र्च का दावा बाकी नहीं।')}</div>}
        {pending.map((c: any) => <div key={c.id} className={CARD}>{row(c)}<DecideRow onApprove={() => act(() => api.hrClaimDecide(c.id, 'APPROVE'), tx('Approved', 'मंज़ूर किया'))} onReject={note => act(() => api.hrClaimDecide(c.id, 'REJECT', note), tx('Rejected', 'नामंज़ूर किया'))} /></div>)}
      </section>
      {toPay.length > 0 && <section className="space-y-2">
        <h3 className="text-sm font-bold text-slate-900">{tx('Approved — to pay', 'मंज़ूर — देना बाकी')} · {inr(d.totals.toPay)}</h3>
        {toPay.map((c: any) => <div key={c.id} className={CARD}>{row(c)}<div className="mt-2"><button onClick={() => act(() => api.hrClaimPaid(c.id), tx('Marked paid', 'भुगतान दर्ज'))} className={BTN_DARK}>{tx('I have paid this', 'मैंने भुगतान कर दिया')}</button></div></div>)}
      </section>}
      {rest.length > 0 && <section className="space-y-1"><h3 className="text-sm font-bold text-slate-900">{tx('Earlier', 'पहले के')}</h3>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">{rest.slice(0, 25).map((c: any) => <li key={c.id} className="flex items-start justify-between gap-2 px-3 py-2.5"><div className="min-w-0 flex-1">{row(c)}</div>{pill(c.status)}</li>)}</ul></section>}
    </div>
  );
};

// ───────────────────────── Assets ─────────────────────────
export const HrAssets: React.FC<{ ov: any; reload: () => void }> = ({ ov, reload }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const { flash, node } = useFlash();
  const [d, setD] = useState<any>(null);
  const [f, setF] = useState({ userId: '', kind: 'PHONE', label: '', serial: '' });
  const [busy, setBusy] = useState(false);
  const load = () => api.hrAssets().then(setD).catch(e => flash(false, e.message));
  useEffect(() => { load(); }, []);
  if (!d) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  const give = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await api.hrGiveAsset(f); flash(true, tx('Noted — he will be asked to confirm', 'दर्ज — उससे पुष्टि माँगी जाएगी')); setF({ ...f, label: '', serial: '' }); await load(); reload(); }
    catch (x: any) { flash(false, x.message); } finally { setBusy(false); }
  };
  const act = async (fn: () => Promise<any>, ok: string) => { try { await fn(); flash(true, ok); await load(); reload(); } catch (e: any) { flash(false, e.message); } };
  const out = d.assets.filter((a: any) => !a.returnedOn); const back = d.assets.filter((a: any) => a.returnedOn);
  const kname = (k: string) => { const x = d.kinds.find((y: any) => y.id === k); return x ? (hi ? x.hi : x.en) : k; };
  const li = (a: any) => (
    <li key={a.id} className="flex items-start justify-between gap-2 px-3 py-2.5 text-xs">
      <div className="min-w-0"><div><b className="text-sm text-slate-900">{a.label}</b> <span className="text-slate-500">· {kname(a.kind)}</span></div><div className="text-slate-600">{a.userName} · {fmtDay(a.givenOn, hi)}{a.serial ? ` · ${a.serial}` : ''}</div>
        {!a.returnedOn && <div className={a.ackAt ? 'text-emerald-700' : 'text-amber-700'}>{a.ackAt ? tx('He confirmed receiving it', 'उसने मिलना माना') : tx('Waiting for him to confirm', 'उसकी पुष्टि बाकी')}</div>}
        {a.returnedOn && <div className="text-slate-500">{tx('Returned', 'लौटाया')} {fmtDay(a.returnedOn, hi)}</div>}</div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {!a.returnedOn ? <button className="font-semibold text-slate-800 underline" onClick={() => act(() => api.hrAssetReturned(a.id, true), tx('Marked returned', 'लौटाया दर्ज'))}>{tx('Returned', 'लौटा दिया')}</button> : <button className="text-slate-500 underline" onClick={() => act(() => api.hrAssetReturned(a.id, false), tx('Back on his list', 'फिर उसकी सूची में'))}>{tx('Undo', 'वापस')}</button>}
        {!a.ackAt && !a.returnedOn && <button className="text-red-600 underline" onClick={() => act(() => api.hrAssetDelete(a.id), tx('Removed', 'हटाया'))}>{tx('Remove', 'हटाएँ')}</button>}
      </div>
    </li>);
  return (
    <div className="space-y-4">
      {node}
      <form onSubmit={give} className={`${CARD} grid grid-cols-2 gap-2 text-xs`}>
        <h3 className="col-span-2 text-sm font-bold text-slate-900">{tx('Hand something over', 'कुछ सौंपें')}</h3>
        <select required value={f.userId} onChange={e => setF({ ...f, userId: e.target.value })} className={INPUT}><option value="">{tx('To whom?', 'किसे?')}</option>{ov.board.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })} className={INPUT}>{d.kinds.map((k: any) => <option key={k.id} value={k.id}>{hi ? k.hi : k.en}</option>)}</select>
        <input required value={f.label} onChange={e => setF({ ...f, label: e.target.value })} placeholder={tx('Item (e.g. Redmi Note 12)', 'सामान (जैसे Redmi Note 12)')} className={INPUT} />
        <input value={f.serial} onChange={e => setF({ ...f, serial: e.target.value })} placeholder={tx('IMEI / number (optional)', 'IMEI / नंबर (वैकल्पिक)')} className={INPUT} />
        <button disabled={busy} className={`${BTN_DARK} col-span-2`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Save', 'दर्ज करें')}</button>
      </form>
      <section className="space-y-1"><h3 className="text-sm font-bold text-slate-900">{tx('With your people now', 'अभी लोगों के पास')} ({out.length})</h3>
        {out.length === 0 ? <div className={`${CARD} text-center text-xs text-slate-500`}>{tx('Nothing is out.', 'कुछ बाहर नहीं है।')}</div> : <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">{out.map(li)}</ul>}</section>
      {back.length > 0 && <details className={CARD}><summary className="cursor-pointer text-sm font-bold text-slate-900">{tx('Returned', 'लौटाया गया')} ({back.length})</summary><ul className="mt-2 divide-y divide-slate-100">{back.slice(0, 30).map(li)}</ul></details>}
    </div>
  );
};
