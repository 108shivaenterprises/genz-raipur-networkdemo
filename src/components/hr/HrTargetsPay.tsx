import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useI18n, useTx } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';
import { Bar, Pill, MonthBar, inr, nowMonth, useFlash, INPUT, BTN_DARK, BTN_GREEN, BTN_LINE, BTN_RED, CARD, type Tone } from './shared.js';

const PACE: Record<string, [string, string, Tone]> = { AHEAD: ['Ahead', 'आगे', 'green'], ON_TRACK: ['On track', 'ठीक चल रहा', 'blue'], BEHIND: ['Behind', 'पीछे', 'red'] };
const METRIC: Record<string, [string, string]> = { calls: ['Calls', 'कॉल'], visits: ['Site visits', 'साइट विज़िट'], bookings: ['Bookings', 'बुकिंग'] };

// ───────────────────────── Targets ─────────────────────────
export const HrTargets: React.FC = () => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const { flash, node } = useFlash();
  const [month, setMonth] = useState(nowMonth());
  const [d, setD] = useState<any>(null);
  const [edit, setEdit] = useState<{ id: string; calls: string; visits: string; bookings: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.hrTargets(month).then(setD).catch(e => flash(false, e.message));
  useEffect(() => { setD(null); load(); }, [month]);
  const save = async (clear = false) => {
    if (!edit) return; setBusy(true);
    try {
      await api.hrSetTarget(edit.id, clear ? { clear: true } : { calls: Number(edit.calls) || 0, visits: Number(edit.visits) || 0, bookings: Number(edit.bookings) || 0 });
      flash(true, clear ? tx('Target removed', 'टारगेट हटाया') : tx('Target saved — he is told', 'टारगेट सेव — उसे सूचना गई')); setEdit(null); await load();
    } catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      {node}
      <MonthBar month={month} onChange={setMonth} max={nowMonth()} />
      {!d ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div> : d.rows.length === 0 ? <div className={`${CARD} text-center text-xs text-slate-500`}>{tx('No team members yet.', 'अभी कोई टीम सदस्य नहीं।')}</div> : (<>
        <p className="text-[11px] text-slate-500">{tx(`${d.elapsed}% of the working days are over. Calls, site visits and approved bookings come from what your people log in the CRM.`, `काम के ${d.elapsed}% दिन बीत चुके। कॉल, साइट विज़िट और मंज़ूर बुकिंग वही हैं जो आपके लोग CRM में दर्ज करते हैं।`)}</p>
        {d.rows.map((r: any) => {
          const pace = r.progress ? PACE[r.progress.pace] : null; const e = edit?.id === r.id ? edit : null;
          return (
            <section key={r.id} className={CARD} data-testid="hr-target-row">
              <div className="flex items-start justify-between gap-2"><div><div className="text-sm font-bold text-slate-900">{r.name}</div><div className="text-[11px] text-slate-500">{r.teamTitle}</div></div>
                {pace ? <Pill tone={pace[2]}>{hi ? pace[1] : pace[0]} · {r.progress.overall}%</Pill> : <Pill>{tx('No target', 'टारगेट नहीं')}</Pill>}</div>
              {r.progress && !e && <div className="mt-3 space-y-2">{r.progress.rows.map((p: any) => (
                <div key={p.metric}><div className="mb-1 flex justify-between text-xs"><span className="text-slate-600">{METRIC[p.metric][hi ? 1 : 0]}</span><b className="text-slate-900">{p.actual} / {p.target}</b></div><Bar pct={p.pct} /></div>))}</div>}
              {!r.progress && !e && <div className="mt-2 text-xs text-slate-500">{tx(`This month: ${r.actual.calls} calls · ${r.actual.visits} visits · ${r.actual.bookings} bookings`, `इस महीने: ${r.actual.calls} कॉल · ${r.actual.visits} विज़िट · ${r.actual.bookings} बुकिंग`)}</div>}
              {e ? (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-xs">{(['calls', 'visits', 'bookings'] as const).map(k => <label key={k} className="space-y-1"><span className="text-slate-500">{METRIC[k][hi ? 1 : 0]}</span><input type="number" inputMode="numeric" min={0} value={e[k]} onChange={ev => setEdit({ ...e, [k]: ev.target.value })} className={INPUT} /></label>)}</div>
                  <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => save()} className={BTN_DARK}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Save', 'सेव')}</button>
                    <button type="button" onClick={() => setEdit({ ...e, calls: String(r.suggested.calls), visits: String(r.suggested.visits), bookings: String(r.suggested.bookings) })} className={BTN_LINE}>{tx('Use a usual figure', 'आम आँकड़ा लें')}</button>
                    {r.target && <button disabled={busy} onClick={() => save(true)} className={BTN_RED}>{tx('Remove', 'हटाएँ')}</button>}
                    <button type="button" onClick={() => setEdit(null)} className={BTN_LINE}>{tx('Cancel', 'रद्द')}</button></div>
                </div>
              ) : <button onClick={() => { const s = r.target || { calls: '', visits: '', bookings: '' }; setEdit({ id: r.id, calls: String(s.calls), visits: String(s.visits), bookings: String(s.bookings) }); }} className={`${BTN_LINE} mt-3`}>{r.target ? tx('Change target', 'टारगेट बदलें') : tx('Set a monthly target', 'मासिक टारगेट रखें')}</button>}
            </section>);
        })}
      </>)}
    </div>
  );
};

// ───────────────────────── Pay (monthly statement) ─────────────────────────
const StatementCard: React.FC<{ s: any; reload: () => Promise<void>; flash: (ok: boolean, m: string) => void }> = ({ s, reload, flash }) => {
  const tx = useTx();
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [fixed, setFixed] = useState(String(s.fixed)); const [inc, setInc] = useState(String(s.incentive));
  const [lines, setLines] = useState<Array<{ label: string; amount: string }>>(s.adjustments.map((a: any) => ({ label: a.label, amount: String(a.amount) })));
  useEffect(() => { setFixed(String(s.fixed)); setInc(String(s.incentive)); setLines(s.adjustments.map((a: any) => ({ label: a.label, amount: String(a.amount) }))); }, [s.id, s.fixed, s.incentive, s.net, s.published]);
  const net = (Number(fixed) || 0) + (Number(inc) || 0) + lines.reduce((a, l) => a + (Number(l.amount) || 0), 0);
  const run = async (fn: () => Promise<any>, ok: string) => { setBusy(true); try { await fn(); flash(true, ok); await reload(); } catch (e: any) { flash(false, e.message); } finally { setBusy(false); } };
  const save = () => run(() => api.hrEditStatement(s.id, { fixed: Number(fixed) || 0, incentive: Number(inc) || 0, adjustments: lines.filter(l => l.label.trim() || Number(l.amount)).map(l => ({ label: l.label, amount: Number(l.amount) })) }), tx('Saved', 'सेव हुआ'));
  const status = s.paidAt ? <Pill tone="blue">{tx('Paid', 'भुगतान हुआ')}</Pill> : s.published ? <Pill tone="green">{tx('Shared', 'साझा')}</Pill> : <Pill tone="amber">{tx('Draft', 'ड्राफ़्ट')}</Pill>;
  return (
    <section className={CARD} data-testid="hr-statement">
      <button type="button" onClick={() => setOpen(!open)} className="flex min-h-12 w-full items-center justify-between gap-2 text-left">
        <div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900">{s.userName}</div><div className="text-[11px] text-slate-500">{tx(`Present ${s.presentDays} of ${s.workingDays} days`, `${s.workingDays} में से ${s.presentDays} दिन हाज़िर`)}</div></div>
        <div className="flex items-center gap-2"><b className="text-base text-slate-900">{inr(s.published ? s.net : net)}</b>{status}</div>
      </button>
      {open && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 text-xs">
          <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-slate-600">
            <div className="rounded-lg bg-slate-50 p-2"><b className="block text-sm text-slate-900">{s.calls}</b>{tx('calls', 'कॉल')}</div>
            <div className="rounded-lg bg-slate-50 p-2"><b className="block text-sm text-slate-900">{s.visits}</b>{tx('visits', 'विज़िट')}</div>
            <div className="rounded-lg bg-slate-50 p-2"><b className="block text-sm text-slate-900">{s.bookings}</b>{tx('bookings', 'बुकिंग')}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1"><span className="text-slate-500">{tx('Fixed pay ₹', 'तय वेतन ₹')}</span><input disabled={s.published} type="number" inputMode="numeric" min={0} value={fixed} onChange={e => setFixed(e.target.value)} className={INPUT} /></label>
            <label className="space-y-1"><span className="text-slate-500">{tx('Incentive ₹', 'इंसेंटिव ₹')}</span><input disabled={s.published} type="number" inputMode="numeric" min={0} value={inc} onChange={e => setInc(e.target.value)} className={INPUT} /></label>
          </div>
          <div className="space-y-1.5">
            <div className="text-slate-500">{tx('Add or cut (petrol refund, advance, fine…)', 'जोड़ें या काटें (पेट्रोल, एडवांस, जुर्माना…)')}</div>
            {lines.map((l, i) => (
              <div key={i} className="flex gap-2"><input disabled={s.published} value={l.label} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder={tx('What for', 'किसलिए')} className={`${INPUT} min-w-0 flex-1`} />
                <input disabled={s.published} type="number" inputMode="numeric" value={l.amount} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} placeholder="+ / −" className={`${INPUT} w-24`} />
                {!s.published && <button type="button" aria-label={tx('Remove line', 'लाइन हटाएँ')} onClick={() => setLines(lines.filter((_, j) => j !== i))} className="rounded p-2 text-slate-500 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}</div>))}
            {!s.published && <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setLines([...lines, { label: '', amount: '' }])} className={BTN_LINE}><Plus className="h-4 w-4" />{tx('Add a line', 'लाइन जोड़ें')}</button>
              {s.absentDays > 0 && s.suggestDeduct > 0 && !lines.some(l => l.label.startsWith('Absent')) && <button type="button" onClick={() => setLines([...lines, { label: `Absent ${s.absentDays} day(s)`, amount: String(-s.suggestDeduct) }])} className={BTN_LINE}>{tx(`Cut ${s.absentDays} absent day(s): −${inr(s.suggestDeduct)}`, `${s.absentDays} ग़ैरहाज़िर दिन काटें: −${inr(s.suggestDeduct)}`)}</button>}
            </div>}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-bold text-white"><span>{tx('Take-home', 'हाथ में')}</span><span>{inr(net)}</span></div>
          <div className="flex flex-wrap gap-2">
            {!s.published && <><button disabled={busy} onClick={save} className={BTN_LINE}>{tx('Save', 'सेव')}</button>
              <button disabled={busy} onClick={() => run(async () => { await api.hrEditStatement(s.id, { fixed: Number(fixed) || 0, incentive: Number(inc) || 0, adjustments: lines.filter(l => l.label.trim() || Number(l.amount)).map(l => ({ label: l.label, amount: Number(l.amount) })) }); await api.hrStatementAct(s.id, 'publish'); }, tx('Shared with him', 'उसे दिखा दिया'))} className={BTN_GREEN}>{tx('Share with him', 'उसे दिखाएँ')}</button>
              <button disabled={busy} onClick={() => run(() => api.hrDeleteStatement(s.id), tx('Deleted', 'हटाया'))} className={BTN_RED}>{tx('Delete', 'हटाएँ')}</button></>}
            {s.published && !s.paidAt && <><button disabled={busy} onClick={() => run(() => api.hrStatementAct(s.id, 'paid'), tx('Marked paid', 'भुगतान दर्ज'))} className={BTN_DARK}>{tx('I have paid', 'मैंने भुगतान कर दिया')}</button>
              <button disabled={busy} onClick={() => run(() => api.hrStatementAct(s.id, 'unpublish'), tx('Taken back', 'वापस लिया'))} className={BTN_LINE}>{tx('Take back to edit', 'बदलने के लिए वापस लें')}</button></>}
          </div>
        </div>
      )}
    </section>
  );
};

export const HrPay: React.FC<{ ov: any }> = ({ ov }) => {
  const tx = useTx();
  const { flash, node } = useFlash();
  const [month, setMonth] = useState(nowMonth());
  const [d, setD] = useState<any>(null); const [t, setT] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => { try { const [a, b] = await Promise.all([api.hrStatements(month), api.hrTargets(month)]); setD(a); setT(b); } catch (e: any) { flash(false, e.message); } };
  useEffect(() => { setD(null); load(); }, [month]);
  const build = async () => {
    setBusy(true);
    try { const r = await api.hrBuildStatements(month); flash(true, tx(`${r.built} statement(s) made from attendance and the CRM`, `हाज़िरी और CRM से ${r.built} विवरण बने`) + (r.kept ? tx(` · ${r.kept} shared one(s) left as they are`, ` · ${r.kept} साझा किए हुए जैसे थे वैसे`) : '')); await load(); }
    catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };
  const setFixed = async (id: string, v: string) => { try { await api.hrSetTarget(id, { fixedPay: Number(v) || 0 }); flash(true, tx('Fixed pay saved', 'तय वेतन सेव')); await load(); } catch (e: any) { flash(false, e.message); } };
  return (
    <div className="space-y-3">
      {node}
      <MonthBar month={month} onChange={setMonth} max={nowMonth()} />
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">{tx('A statement is private until you tap “Share with him”. It never shows brokerage. GENZ only calculates — you pay your employee yourself.', 'विवरण तब तक निजी है जब तक आप “उसे दिखाएँ” न दबाएँ। इसमें ब्रोकरेज कभी नहीं दिखती। GENZ सिर्फ़ गणना करता है — भुगतान आप ख़ुद करें।')}</p>
      <details className={CARD}><summary className="cursor-pointer text-sm font-bold text-slate-900">{tx('Fixed monthly pay', 'तय मासिक वेतन')}</summary>
        {!t ? <Loader2 className="mt-2 h-4 w-4 animate-spin text-slate-400" /> : t.rows.length === 0 ? <p className="mt-2 text-xs text-slate-500">{tx('No team members yet.', 'अभी कोई टीम सदस्य नहीं।')}</p> : (
          <ul className="mt-2 divide-y divide-slate-100">{t.rows.map((r: any) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-xs"><span className="min-w-0"><b className="block truncate text-slate-900">{r.name}</b><span className="text-slate-500">{tx('Incentive', 'इंसेंटिव')} {r.incentivePct || 0}%</span></span>
              <input type="number" inputMode="numeric" min={0} defaultValue={r.fixedPay ?? ''} key={`${r.id}-${r.fixedPay}`} placeholder="₹" onBlur={e => { if (e.target.value !== String(r.fixedPay ?? '')) setFixed(r.id, e.target.value); }} className={`${INPUT} w-28`} aria-label={tx('Fixed pay', 'तय वेतन')} /></li>))}</ul>)}
        <p className="mt-2 text-[11px] text-slate-500">{tx('For a broker the incentive is worked out automatically: the member’s incentive % of the brokerage on bookings approved that month (set the % in Members). A builder adds incentive lines by hand.', 'ब्रोकर के लिए इंसेंटिव अपने-आप बनता है: उस महीने मंज़ूर बुकिंग की ब्रोकरेज का सदस्य का इंसेंटिव % (% सदस्य टैब में रखें)। बिल्डर इंसेंटिव ख़ुद जोड़ता है।')}</p>
      </details>
      <button disabled={busy} onClick={build} className={`${BTN_DARK} w-full`} data-testid="hr-build">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{d?.statements?.length ? tx('Refresh numbers from attendance & CRM', 'हाज़िरी और CRM से आँकड़े ताज़ा करें') : tx('Make this month’s statements', 'इस महीने के विवरण बनाएँ')}</button>
      {!d ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div> : (<>
        {d.statements.map((s: any) => <StatementCard key={s.id} s={s} reload={load} flash={flash} />)}
        {d.statements.length === 0 && <div className={`${CARD} text-center text-xs text-slate-500`}>{ov.board.length ? tx('No statement for this month yet — tap the button above.', 'इस महीने का विवरण अभी नहीं — ऊपर का बटन दबाएँ।') : tx('Add team members first.', 'पहले टीम सदस्य जोड़ें।')}</div>}
        {d.missing.length > 0 && d.statements.length > 0 && <p className="text-[11px] text-slate-500">{tx('Not made yet: ', 'अभी नहीं बने: ')}{d.missing.map((m: any) => m.name).join(', ')}</p>}
      </>)}
    </div>
  );
};
