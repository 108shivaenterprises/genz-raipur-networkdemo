import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, MapPin, Camera, Trash2 } from 'lucide-react';
import { useI18n, useTx } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';
import { CODE_CLASS, Pill, MonthBar, nowMonth, fmtTime, fmtDay, useFlash, useStateInfo, INPUT, BTN_DARK, BTN_LINE, CARD, WEEKDAYS } from './shared.js';
import { HrLeave, HrClaims, HrAssets } from './HrLeaveClaims.js';
import { HrTargets, HrPay } from './HrTargetsPay.js';

type Sec = 'today' | 'leave' | 'targets' | 'pay' | 'claims' | 'assets' | 'settings';

// ───────────────────────── Today ─────────────────────────
const MonthSheet: React.FC = () => {
  const tx = useTx(); const { lang } = useI18n();
  const [month, setMonth] = useState(nowMonth());
  const [g, setG] = useState<any>(null);
  useEffect(() => { setG(null); api.hrAttendance(month).then(setG).catch(() => setG({ rows: [], days: 0 })); }, [month]);
  return (
    <div className="space-y-3">
      <MonthBar month={month} onChange={setMonth} max={nowMonth()} />
      {!g ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div> : g.rows.length === 0 ? <p className="text-xs text-slate-500">{tx('No team members yet.', 'अभी कोई टीम सदस्य नहीं।')}</p> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="text-[10px]">
            <thead><tr><th className="sticky left-0 bg-white p-2 text-left text-xs text-slate-500">{tx('Who', 'कौन')}</th>{Array.from({ length: g.days }, (_, i) => <th key={i} className="px-0.5 text-center font-normal text-slate-400">{i + 1}</th>)}<th className="px-2 text-slate-500">{tx('Present', 'हाज़िर')}</th></tr></thead>
            <tbody>{g.rows.map((r: any) => (
              <tr key={r.id} className={`border-t border-slate-100 ${r.active ? '' : 'opacity-50'}`}>
                <td className="sticky left-0 bg-white p-2 text-xs font-medium whitespace-nowrap">{r.name}</td>
                {r.codes.split('').map((c: string, i: number) => <td key={i} className="p-0.5"><span className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${CODE_CLASS[c] || ''}`}>{c === 'O' || c === '-' ? '' : c}</span></td>)}
                <td className="px-2 text-center text-xs font-semibold">{r.summary.presentDays}/{r.summary.workingDays}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {(['P', 'L', 'H', 'A', 'V', 'O'] as const).map(c => <span key={c} className="inline-flex items-center gap-1"><span className={`inline-block h-3 w-3 rounded ${CODE_CLASS[c]}`} />{lang === 'hi' ? g?.legend?.[c]?.hi : g?.legend?.[c]?.en}</span>)}
      </div>
    </div>
  );
};

const Today: React.FC<{ ov: any; reload: () => void }> = ({ ov, reload }) => {
  const tx = useTx(); const { lang } = useI18n(); const info = useStateInfo();
  const { flash, node } = useFlash();
  const [open, setOpen] = useState('');
  const [day, setDay] = useState<Record<string, any>>({});
  const [shot, setShot] = useState('');
  const [busy, setBusy] = useState(false);
  const c = ov.counts;
  const expand = async (id: string) => {
    setOpen(open === id ? '' : id);
    if (open !== id && !Object.keys(day).length) { try { const d = await api.hrDay(); setDay(Object.fromEntries(d.rows.map((r: any) => [r.id, r]))); } catch { /* the board is enough */ } }
  };
  const mark = async (userId: string, status: string) => {
    setBusy(true);
    try { await api.hrMark({ userId, date: ov.today, status }); flash(true, tx('Saved', 'सेव हुआ')); setDay({}); reload(); }
    catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };
  const tile = (n: number, label: string, cls: string) => <div className={`rounded-xl border p-3 text-center ${cls}`}><div className="text-2xl font-bold">{n}</div><div className="text-[11px] font-medium">{label}</div></div>;
  return (
    <div className="space-y-4">
      {node}
      {(ov.holiday || ov.weeklyOff) && <div className="rounded-lg bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800">{ov.holiday ? tx(`Holiday today: ${ov.holiday}`, `आज छुट्टी: ${ov.holiday}`) : tx('Today is the weekly off.', 'आज साप्ताहिक छुट्टी है।')}</div>}
      <div className="grid grid-cols-4 gap-2">
        {tile(c.in, tx('In', 'हाज़िर'), 'border-emerald-200 bg-emerald-50 text-emerald-800')}
        {tile(c.late, tx('Late', 'देर से'), 'border-amber-200 bg-amber-50 text-amber-800')}
        {tile(c.absent + c.notYet, tx('Not in', 'नहीं आए'), 'border-red-200 bg-red-50 text-red-700')}
        {tile(c.onLeave, tx('On leave', 'छुट्टी पर'), 'border-sky-200 bg-sky-50 text-sky-800')}
      </div>
      {ov.board.length === 0 ? <div className={`${CARD} text-center text-xs text-slate-500`}>{tx('Add your first team member in the Members tab — then their day shows here.', 'सदस्य टैब में पहला टीम सदस्य जोड़ें — फिर उनका दिन यहाँ दिखेगा।')}</div> : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white" data-testid="hr-board">
          {ov.board.map((b: any) => {
            const s = info(b.state); const d = day[b.id];
            return (
              <li key={b.id}>
                <button type="button" onClick={() => expand(b.id)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left">
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-900">{b.name}</div><div className="truncate text-[11px] text-slate-500">{b.teamTitle}{b.inAt ? ` · ${fmtTime(b.inAt)}${b.outAt ? ` → ${fmtTime(b.outAt)}` : ''}` : ''}{b.lateMin ? ` · ${b.lateMin} ${tx('min late', 'मिनट देर')}` : ''}</div></div>
                  {b.assetsOut > 0 && <Pill>{b.assetsOut} {b.assetsOut === 1 ? tx('item out', 'सामान बाहर') : tx('items out', 'सामान बाहर')}</Pill>}
                  <Pill tone={s.tone}>{s.label}</Pill>
                </button>
                {open === b.id && (
                  <div className="space-y-2 bg-slate-50 px-3 pb-3 pt-2 text-xs">
                    {d?.lat != null && <a className="inline-flex items-center gap-1 text-sky-700 underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${d.lat},${d.lng}`}><MapPin className="h-3.5 w-3.5" />{tx('Where he punched in', 'कहाँ से हाज़िरी लगाई')}{d.accuracy != null ? ` (±${d.accuracy} m)` : ''}</a>}
                    {b.hasSelfie && <button type="button" className="ml-3 inline-flex items-center gap-1 text-slate-700 underline" onClick={async () => { try { setShot((await api.hrSelfie(b.attId)).selfie); } catch (e: any) { flash(false, e.message); } }}><Camera className="h-3.5 w-3.5" />{tx('Selfie', 'सेल्फ़ी')}</button>}
                    {d?.manual && <div className="text-slate-600">{tx('You marked: ', 'आपने लिखा: ')}<b>{d.manual === 'PRESENT' ? tx('present', 'हाज़िर') : d.manual === 'HALF' ? tx('half day', 'आधा दिन') : tx('absent', 'ग़ैरहाज़िर')}</b>{d.note ? ` — ${d.note}` : ''}</div>}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className="self-center text-slate-500">{tx('Mark today:', 'आज लिखें:')}</span>
                      <button disabled={busy} onClick={() => mark(b.id, 'PRESENT')} className={BTN_LINE}>{tx('Present', 'हाज़िर')}</button>
                      <button disabled={busy} onClick={() => mark(b.id, 'HALF')} className={BTN_LINE}>{tx('Half day', 'आधा दिन')}</button>
                      <button disabled={busy} onClick={() => mark(b.id, 'ABSENT')} className={BTN_LINE}>{tx('Absent', 'ग़ैरहाज़िर')}</button>
                      <button disabled={busy} onClick={() => mark(b.id, 'CLEAR')} className={BTN_LINE}>{tx('Clear', 'हटाएँ')}</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {ov.upcoming?.length > 0 && <p className="text-[11px] text-slate-500">{tx('Coming holidays: ', 'आने वाली छुट्टियाँ: ')}{ov.upcoming.slice(0, 3).map((h: any) => `${h.label} (${fmtDay(h.date, lang === 'hi')})`).join(' · ')}</p>}
      <details className="rounded-xl border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-sm font-bold text-slate-900">{tx('Month sheet', 'महीने की शीट')}</summary><div className="mt-3"><MonthSheet /></div></details>
      {shot && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setShot('')}><img src={shot} alt={tx('selfie', 'सेल्फ़ी')} className="max-h-[80vh] rounded-xl" /></div>}
    </div>
  );
};

// ───────────────────────── Settings (hours, weekly off, leave days, selfie, holidays) ─────────────────────────
const Settings: React.FC<{ features: string[]; reload: () => void }> = ({ features, reload }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const { flash, node } = useFlash();
  const [s, setS] = useState<any>(null); const [nat, setNat] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [h, setH] = useState({ date: '', label: '' });
  useEffect(() => { api.hrSettings().then(r => { setS(r.settings); setNat(r.national); }).catch(e => flash(false, e.message)); }, []);
  if (!s) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  const set = (p: object) => setS({ ...s, ...p });
  const save = async () => {
    setBusy(true);
    try { const r = await api.hrSaveSettings(s); setS(r.settings); flash(true, tx('Saved', 'सेव हुआ')); reload(); }
    catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };
  const addHoliday = () => {
    if (!h.date || h.label.trim().length < 2) return flash(false, tx('Pick the date and give the holiday a name', 'तारीख चुनें और छुट्टी का नाम लिखें'));
    set({ holidays: [...s.holidays.filter((x: any) => x.date !== h.date), { date: h.date, label: h.label.trim() }].sort((a: any, b: any) => a.date.localeCompare(b.date)) }); setH({ date: '', label: '' });
  };
  const days = WEEKDAYS(hi);
  const canLeave = features.includes('LEAVE');
  return (
    <div className="space-y-4">
      {node}
      <section className={`${CARD} space-y-3`}>
        <h3 className="text-sm font-bold text-slate-900">{tx('Working day', 'काम का दिन')}</h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <label className="space-y-1"><span className="text-slate-500">{tx('Work starts at', 'काम शुरू होता है')}</span><input type="time" value={s.workStart} onChange={e => set({ workStart: e.target.value })} className={INPUT} /></label>
          <label className="space-y-1"><span className="text-slate-500">{tx('Grace (minutes)', 'छूट (मिनट)')}</span><input type="number" min={0} max={120} value={s.graceMin} onChange={e => set({ graceMin: Number(e.target.value) })} className={INPUT} /></label>
        </div>
        <div className="text-xs"><div className="mb-1 text-slate-500">{tx('Weekly off', 'साप्ताहिक छुट्टी')}</div>
          <div className="flex flex-wrap gap-1.5">{days.map((d, i) => <button key={i} type="button" aria-pressed={s.weeklyOff.includes(i)} onClick={() => set({ weeklyOff: s.weeklyOff.includes(i) ? s.weeklyOff.filter((x: number) => x !== i) : [...s.weeklyOff, i].sort() })} className={`min-h-10 min-w-12 rounded-lg border px-2 text-xs font-semibold ${s.weeklyOff.includes(i) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{d}</button>)}</div></div>
        <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={s.selfie} onChange={e => set({ selfie: e.target.checked })} className="h-4 w-4" />{tx('Selfie with every punch-in (kept 30 days)', 'हर हाज़िरी पर सेल्फ़ी (30 दिन रखी जाती है)')}</label>
        {canLeave && <label className="block space-y-1 text-xs"><span className="text-slate-500">{tx('Paid leave days a year (casual + sick)', 'साल में वेतन-सहित छुट्टी के दिन (कैज़ुअल + बीमारी)')}</span><input type="number" min={0} max={60} value={s.leaveAllowance} onChange={e => set({ leaveAllowance: Number(e.target.value) })} className={`${INPUT} max-w-28`} /></label>}
      </section>
      <section className={`${CARD} space-y-3`}>
        <h3 className="text-sm font-bold text-slate-900">{tx('Holidays', 'छुट्टियाँ')}</h3>
        <div className="space-y-1.5">{nat.map((n: any) => (
          <label key={n.md} className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" className="h-4 w-4" checked={!s.mutedNational.includes(n.md)} onChange={e => set({ mutedNational: e.target.checked ? s.mutedNational.filter((x: string) => x !== n.md) : [...s.mutedNational, n.md] })} />{hi ? n.hi : n.label} <span className="text-slate-400">({n.md.split('-').reverse().join('/')})</span></label>))}</div>
        <p className="text-[11px] text-slate-500">{tx('Diwali, Holi, Eid and other festivals move every year — add them below.', 'दिवाली, होली, ईद जैसे त्योहार हर साल बदलते हैं — उन्हें नीचे जोड़ें।')}</p>
        <ul className="divide-y divide-slate-100 text-xs">{s.holidays.map((x: any) => <li key={x.date} className="flex items-center justify-between py-2"><span><b>{x.label}</b> <span className="text-slate-500">· {fmtDay(x.date, hi)} {x.date.slice(0, 4)}</span></span><button type="button" aria-label={tx('Remove', 'हटाएँ')} onClick={() => set({ holidays: s.holidays.filter((y: any) => y.date !== x.date) })} className="rounded p-2 text-slate-500 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></li>)}</ul>
        <div className="flex flex-wrap gap-2"><input type="date" value={h.date} onChange={e => setH({ ...h, date: e.target.value })} className={`${INPUT} w-40`} /><input placeholder={tx('Name (e.g. Diwali)', 'नाम (जैसे दिवाली)')} value={h.label} onChange={e => setH({ ...h, label: e.target.value })} className={`${INPUT} min-w-0 flex-1`} /><button type="button" onClick={addHoliday} className={BTN_LINE}>{tx('Add', 'जोड़ें')}</button></div>
      </section>
      <button disabled={busy} onClick={save} className={`${BTN_DARK} w-full`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Save', 'सेव करें')}</button>
    </div>
  );
};

// ───────────────────────── the People tab ─────────────────────────
/** The employer's HR home: sections are chips, only the ones this account type has (a contractor sees no Targets / Pay). */
export const HrEmployer: React.FC<{ onChanged?: (pending: number) => void }> = ({ onChanged }) => {
  const tx = useTx();
  const [ov, setOv] = useState<any>(null); const [err, setErr] = useState('');
  const [sec, setSec] = useState<Sec>('today');
  const load = useCallback(async () => {
    try { const r = await api.hrOverview(); setOv(r); onChanged?.((r.pending?.leaves || 0) + (r.pending?.claims || 0)); }
    catch (e: any) { setErr(e.message); }
  }, [onChanged]);
  useEffect(() => { load(); }, [load]);
  if (err) return <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>;
  if (!ov) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  const f: string[] = ov.features;
  const chips: Array<{ id: Sec; en: string; hi: string; badge?: number; show: boolean }> = [
    { id: 'today', en: 'Today', hi: 'आज', show: f.includes('ATTENDANCE') },
    { id: 'leave', en: 'Leave', hi: 'छुट्टी', badge: ov.pending.leaves, show: f.includes('LEAVE') },
    { id: 'targets', en: 'Targets', hi: 'टारगेट', show: f.includes('TARGETS') },
    { id: 'pay', en: 'Pay', hi: 'वेतन', show: f.includes('STATEMENT') },
    { id: 'claims', en: 'Expenses', hi: 'ख़र्च', badge: ov.pending.claims + ov.pending.toPay, show: f.includes('CLAIMS') },
    { id: 'assets', en: 'Assets', hi: 'सामान', show: f.includes('ASSETS') },
    { id: 'settings', en: 'Settings', hi: 'सेटिंग', show: true },
  ];
  return (
    <div className="space-y-4" data-testid="hr-employer">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist">
        {chips.filter(c => c.show).map(c => (
          <button key={c.id} role="tab" aria-selected={sec === c.id} data-testid={`hr-chip-${c.id}`} onClick={() => setSec(c.id)} className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold ${sec === c.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
            {tx(c.en, c.hi)}{c.badge ? <span className={`rounded-full px-1.5 text-[10px] ${sec === c.id ? 'bg-white text-slate-900' : 'bg-red-600 text-white'}`}>{c.badge}</span> : null}
          </button>))}
      </div>
      {sec === 'today' && <Today ov={ov} reload={load} />}
      {sec === 'leave' && <HrLeave ov={ov} reload={load} />}
      {sec === 'targets' && <HrTargets />}
      {sec === 'pay' && <HrPay ov={ov} />}
      {sec === 'claims' && <HrClaims reload={load} />}
      {sec === 'assets' && <HrAssets ov={ov} reload={load} />}
      {sec === 'settings' && <Settings features={f} reload={load} />}
    </div>
  );
};
