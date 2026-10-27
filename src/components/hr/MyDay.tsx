import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Camera, X, LogIn, LogOut, CalendarDays, Receipt, Package, Wallet } from 'lucide-react';
import { useI18n, useTx } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';
import { shrinkImage } from '../../lib/imgShrink.js';
import { Bar, CODE_CLASS, Pill, fmtRange, fmtDay, fmtTime, inr, monthLabel, useFlash, useStateInfo, INPUT, BTN_DARK, BTN_GREEN, BTN_LINE, CARD } from './shared.js';
import { useStatusPill } from './HrLeaveClaims.js';

const METRIC: Record<string, [string, string]> = { calls: ['Calls', 'कॉल'], visits: ['Site visits', 'साइट विज़िट'], bookings: ['Bookings', 'बुकिंग'] };
const PACE: Record<string, [string, string, 'green' | 'blue' | 'red']> = { AHEAD: ['Ahead', 'आगे', 'green'], ON_TRACK: ['On track', 'ठीक चल रहा', 'blue'], BEHIND: ['Behind', 'पीछे', 'red'] };

// ───────────────────────── punch in / out ─────────────────────────
const PunchSheet: React.FC<{ kind: 'in' | 'out'; needSelfie: boolean; onClose: () => void; onDone: () => void }> = ({ kind, needSelfie, onClose, onDone }) => {
  const tx = useTx();
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [selfie, setSelfie] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [locating, setLocating] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const locate = () => {
    setErr(''); setLocating(true);
    if (!navigator.geolocation) { setLocating(false); return setErr(tx('Location is not available on this phone', 'इस फ़ोन पर लोकेशन उपलब्ध नहीं')); }
    navigator.geolocation.getCurrentPosition(
      p => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); setLocating(false); },
      e => { setLocating(false); setErr(e.code === 1 ? tx('Allow location for this app (phone settings) and try again', 'इस ऐप को लोकेशन की अनुमति दें (फ़ोन सेटिंग) और फिर कोशिश करें') : tx('Could not get the location — step outside and try again', 'लोकेशन नहीं मिली — बाहर आकर फिर कोशिश करें')); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  };
  useEffect(() => { locate(); }, []);
  const submit = async () => {
    if (!pos) return; setBusy(true); setErr('');
    try { await api.hrPunch({ kind, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, ...(kind === 'in' && needSelfie ? { selfie } : {}) }); onDone(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const ready = !!pos && (kind === 'out' || !needSelfie || !!selfie);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-4 text-xs" onClick={e => e.stopPropagation()} role="dialog" aria-label={kind === 'in' ? tx('Punch in', 'हाज़िरी लगाएँ') : tx('Punch out', 'छुट्टी की हाज़िरी')}>
        <div className="flex items-center justify-between"><div className="text-sm font-bold">{kind === 'in' ? tx('Punch in', 'हाज़िरी लगाएँ') : tx('Punch out', 'आज का काम पूरा')}</div><button type="button" onClick={onClose} aria-label={tx('Close', 'बंद करें')} className="p-1"><X className="h-4 w-4" /></button></div>
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 font-medium ${pos ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-600'}`}>
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          {pos ? tx(`Location found (±${Math.round(pos.accuracy)} m)`, `लोकेशन मिल गई (±${Math.round(pos.accuracy)} m)`) : locating ? tx('Getting your location…', 'लोकेशन ले रहे हैं…') : tx('Location not found', 'लोकेशन नहीं मिली')}
          {!locating && <button type="button" onClick={locate} className="ml-auto underline">{tx('Retry', 'फिर से')}</button>}
        </div>
        {kind === 'in' && needSelfie && (<>
          <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { try { setSelfie(await shrinkImage(f, 360, 60 * 1024)); setErr(''); } catch { setErr(tx('Could not read the photo — take it again', 'फ़ोटो पढ़ी नहीं गई — फिर से लें')); } } }} />
          <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 font-semibold"><Camera className="h-4 w-4" />{selfie ? tx('Selfie taken — retake', 'सेल्फ़ी ली — दोबारा लें') : tx('Take a selfie', 'सेल्फ़ी लें')}</button>
          {selfie && <img src={selfie} alt={tx('your selfie', 'आपकी सेल्फ़ी')} className="mx-auto h-24 w-24 rounded-xl object-cover" />}
        </>)}
        {err && <div className="rounded bg-red-50 px-2 py-1.5 text-red-700">{err}</div>}
        <button disabled={busy || !ready} onClick={submit} className={`${BTN_GREEN} w-full`} data-testid="hr-punch-go">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{kind === 'in' ? tx('Mark me present', 'मुझे हाज़िर लिखें') : tx('Mark my day done', 'आज का दिन पूरा लिखें')}</button>
        <p className="text-[10px] text-slate-500">{tx('Your location and selfie are seen only by your employer. The selfie is deleted after 30 days.', 'आपकी लोकेशन और सेल्फ़ी सिर्फ़ आपके नियोक्ता को दिखती हैं। सेल्फ़ी 30 दिन बाद मिटा दी जाती है।')}</p>
      </div>
    </div>
  );
};

// ───────────────────────── panels ─────────────────────────
const Spin = () => <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;

const LeavePanel: React.FC<{ today: string; onChanged: () => void }> = ({ today, onChanged }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi'; const pill = useStatusPill(); const { flash, node } = useFlash();
  const [d, setD] = useState<any>(null); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ type: 'CASUAL', from: today, to: today, reason: '' });
  const load = () => api.hrMyLeaves().then(setD).catch(e => flash(false, e.message));
  useEffect(() => { load(); }, []);
  if (!d) return <Spin />;
  const ask = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await api.hrAskLeave(f); flash(true, tx('Sent to your employer', 'नियोक्ता को भेज दिया')); setF({ ...f, reason: '' }); await load(); onChanged(); }
    catch (x: any) { flash(false, x.message); } finally { setBusy(false); }
  };
  const cancel = async (id: string) => { try { await api.hrCancelMyLeave(id); flash(true, tx('Withdrawn', 'वापस ले ली')); await load(); onChanged(); } catch (x: any) { flash(false, x.message); } };
  const tname = (t: string) => d.types.find((x: any) => x.id === t)?.[hi ? 'hi' : 'en'] || t;
  return (
    <div className="space-y-3">
      {node}
      <div className="flex items-center justify-between rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900"><span>{tx('Paid leave left this year', 'इस साल बची सवेतन छुट्टी')}</span><b className="text-base">{d.balance.left} / {d.balance.allowance}</b></div>
      <form onSubmit={ask} className="grid grid-cols-2 gap-2 text-xs">
        <select value={f.type} onChange={e => setF({ ...f, type: e.target.value })} className={`${INPUT} col-span-2`}>{d.types.map((t: any) => <option key={t.id} value={t.id}>{hi ? t.hi : t.en}</option>)}</select>
        <label className="space-y-1"><span className="text-slate-500">{tx('From', 'से')}</span><input required type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to })} className={INPUT} /></label>
        <label className="space-y-1"><span className="text-slate-500">{tx('To', 'तक')}</span><input required type="date" value={f.to} min={f.from} onChange={e => setF({ ...f, to: e.target.value })} className={INPUT} /></label>
        <input required value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} placeholder={tx('Reason', 'कारण')} className={`${INPUT} col-span-2`} />
        <button disabled={busy} className={`${BTN_DARK} col-span-2`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Ask for leave', 'छुट्टी माँगें')}</button>
      </form>
      {d.leaves.length > 0 && <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-xs">{d.leaves.slice(0, 10).map((l: any) => (
        <li key={l.id} className="flex items-start justify-between gap-2 px-3 py-2.5"><span><b className="text-slate-900">{fmtRange(l.from, l.to, hi)}</b> · {l.days} {tx('d', 'दिन')} · {tname(l.type)}{l.decidedNote ? <span className="block text-slate-500">“{l.decidedNote}”</span> : null}</span>
          <span className="flex flex-col items-end gap-1">{pill(l.status)}{(l.status === 'PENDING' || (l.status === 'APPROVED' && l.to >= today)) && <button type="button" className="text-[11px] font-semibold text-red-600 underline" onClick={() => cancel(l.id)}>{tx('Withdraw', 'वापस लें')}</button>}</span></li>))}</ul>}
    </div>
  );
};

const ClaimsPanel: React.FC<{ today: string; onChanged: () => void }> = ({ today, onChanged }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi'; const pill = useStatusPill(); const { flash, node } = useFlash();
  const [d, setD] = useState<any>(null); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ kind: 'PETROL', amount: '', date: today, note: '' });
  const load = () => api.hrMyClaims().then(setD).catch(e => flash(false, e.message));
  useEffect(() => { load(); }, []);
  if (!d) return <Spin />;
  const file = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await api.hrFileClaim({ ...f, amount: Number(f.amount) }); flash(true, tx('Sent to your employer', 'नियोक्ता को भेज दिया')); setF({ ...f, amount: '', note: '' }); await load(); onChanged(); }
    catch (x: any) { flash(false, x.message); } finally { setBusy(false); }
  };
  const cancel = async (id: string) => { try { await api.hrCancelMyClaim(id); flash(true, tx('Withdrawn', 'वापस ले लिया')); await load(); onChanged(); } catch (x: any) { flash(false, x.message); } };
  const kname = (k: string) => d.kinds.find((x: any) => x.id === k)?.[hi ? 'hi' : 'en'] || k;
  return (
    <div className="space-y-3">
      {node}
      <form onSubmit={file} className="grid grid-cols-2 gap-2 text-xs">
        <select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })} className={INPUT}>{d.kinds.map((k: any) => <option key={k.id} value={k.id}>{hi ? k.hi : k.en}</option>)}</select>
        <input required type="number" inputMode="decimal" min={1} max={d.max} value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} placeholder={tx('Amount ₹', 'रकम ₹')} className={INPUT} />
        <input required type="date" max={today} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} className={`${INPUT} col-span-2`} />
        <input required value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder={tx('What was it for?', 'किसलिए था?')} className={`${INPUT} col-span-2`} />
        <button disabled={busy} className={`${BTN_DARK} col-span-2`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Send claim', 'दावा भेजें')}</button>
      </form>
      {d.claims.length > 0 && <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-xs">{d.claims.slice(0, 10).map((c: any) => (
        <li key={c.id} className="flex items-start justify-between gap-2 px-3 py-2.5"><span><b className="text-slate-900">{inr(c.amount)}</b> · {kname(c.kind)} · {fmtDay(c.date, hi)}<span className="block text-slate-500">{c.note}{c.decidedNote ? ` — ${c.decidedNote}` : ''}</span></span>
          <span className="flex flex-col items-end gap-1">{pill(c.status)}{c.status === 'PENDING' && <button type="button" className="text-[11px] font-semibold text-red-600 underline" onClick={() => cancel(c.id)}>{tx('Withdraw', 'वापस लें')}</button>}</span></li>))}</ul>}
    </div>
  );
};

const AssetsPanel: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi'; const { flash, node } = useFlash();
  const [d, setD] = useState<any>(null);
  const load = () => api.hrMyAssets().then(setD).catch(e => flash(false, e.message));
  useEffect(() => { load(); }, []);
  if (!d) return <Spin />;
  const ack = async (id: string) => { try { await api.hrAckAsset(id); flash(true, tx('Thanks — noted', 'धन्यवाद — दर्ज')); await load(); onChanged(); } catch (x: any) { flash(false, x.message); } };
  if (d.assets.length === 0) return <p className="text-xs text-slate-500">{tx('Nothing has been handed to you.', 'आपको कुछ सौंपा नहीं गया।')}</p>;
  return (
    <div className="space-y-2">{node}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-xs">{d.assets.map((a: any) => (
        <li key={a.id} className="flex items-start justify-between gap-2 px-3 py-2.5"><span><b className="text-sm text-slate-900">{a.label}</b>{a.serial ? ` · ${a.serial}` : ''}<span className="block text-slate-500">{tx('Given', 'दिया')} {fmtDay(a.givenOn, hi)}{a.returnedOn ? ` · ${tx('returned', 'लौटाया')} ${fmtDay(a.returnedOn, hi)}` : ''}</span></span>
          {!a.returnedOn && !a.ackAt && <button type="button" onClick={() => ack(a.id)} className={BTN_GREEN}>{tx('I received it', 'मुझे मिल गया')}</button>}
          {!a.returnedOn && a.ackAt && <Pill tone="green">{tx('Received', 'मिला')}</Pill>}
          {a.returnedOn && <Pill>{tx('Returned', 'लौटाया')}</Pill>}</li>))}</ul>
    </div>
  );
};

const PayPanel: React.FC = () => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const [d, setD] = useState<any>(null); const [open, setOpen] = useState('');
  useEffect(() => { api.hrMyStatements().then(setD).catch(() => setD({ statements: [] })); }, []);
  if (!d) return <Spin />;
  if (d.statements.length === 0) return <p className="text-xs text-slate-500">{tx('Your employer has not shared a statement yet.', 'आपके नियोक्ता ने अभी कोई विवरण साझा नहीं किया।')}</p>;
  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-xs">{d.statements.map((s: any) => (
      <li key={s.id}>
        <button type="button" onClick={() => setOpen(open === s.id ? '' : s.id)} className="flex min-h-12 w-full items-center justify-between gap-2 px-3 py-2 text-left"><span className="font-semibold text-slate-900">{monthLabel(s.month, hi)}</span><span className="flex items-center gap-2"><b className="text-sm">{inr(s.net)}</b>{s.paidAt && <Pill tone="blue">{tx('Paid', 'भुगतान हुआ')}</Pill>}</span></button>
        {open === s.id && <div className="space-y-1 bg-slate-50 px-3 pb-3 pt-1 text-slate-700">
          <div className="flex justify-between"><span>{tx('Fixed pay', 'तय वेतन')}</span><b>{inr(s.fixed)}</b></div>
          {s.incentive > 0 && <div className="flex justify-between"><span>{tx('Incentive', 'इंसेंटिव')}</span><b>{inr(s.incentive)}</b></div>}
          {s.adjustments.map((a: any, i: number) => <div key={i} className="flex justify-between"><span>{a.label}</span><b className={a.amount < 0 ? 'text-red-600' : ''}>{a.amount < 0 ? '−' : '+'}{inr(Math.abs(a.amount))}</b></div>)}
          <div className="flex justify-between border-t border-slate-200 pt-1 text-sm"><b>{tx('Take-home', 'हाथ में')}</b><b>{inr(s.net)}</b></div>
          <div className="pt-1 text-[11px] text-slate-500">{tx(`Present ${s.presentDays} of ${s.workingDays} days · ${s.calls} calls · ${s.visits} visits · ${s.bookings} bookings`, `${s.workingDays} में से ${s.presentDays} दिन हाज़िर · ${s.calls} कॉल · ${s.visits} विज़िट · ${s.bookings} बुकिंग`)}</div>
        </div>}
      </li>))}</ul>
  );
};

// ───────────────────────── the card on the member's home ─────────────────────────
/** "My day": punch in / out, this month, leave, my target, and — only what the employer's account type has — expenses, items, pay slips. Renders nothing when HR is not available. */
export const MyDay: React.FC = () => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi'; const info = useStateInfo();
  const [d, setD] = useState<any>(null);
  const [punch, setPunch] = useState<'in' | 'out' | null>(null);
  const [panel, setPanel] = useState<'' | 'leave' | 'claims' | 'assets' | 'pay'>('');
  const { flash, node } = useFlash();
  const load = () => api.hrMe().then(setD).catch(() => setD(false));
  useEffect(() => { load(); }, []);
  if (!d) return d === null ? <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-slate-300" /></div> : null;
  const f: string[] = d.features; const st = info(d.state); const rec = d.record;
  const has = (k: string) => f.includes(k);
  const toggle = (p: typeof panel) => setPanel(panel === p ? '' : p);
  const dateLabel = new Date(d.today + 'T00:00:00Z').toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const quick = (id: typeof panel, icon: React.ReactNode, label: string, badge?: number) => (
    <button key={id} type="button" aria-pressed={panel === id} onClick={() => toggle(id)} className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border px-2 text-[11px] font-semibold ${panel === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>
      {icon}{label}{badge ? <span className="absolute right-1.5 top-1 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{badge}</span> : null}</button>);
  return (
    <section className={`${CARD} space-y-3`} data-testid="hr-myday">
      {node}
      <div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-bold text-slate-900">{tx('My day', 'मेरा दिन')}</h3><div className="text-[11px] text-slate-500">{dateLabel} · {d.employerName}</div></div><Pill tone={st.tone}>{st.label}</Pill></div>
      {(d.holiday || d.state === 'OFF') && <div className="rounded-lg bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800">{d.holiday ? tx(`Holiday today: ${d.holiday}`, `आज छुट्टी: ${d.holiday}`) : tx('Today is your weekly off.', 'आज आपकी साप्ताहिक छुट्टी है।')}</div>}
      {has('ATTENDANCE') && (
        d.state === 'ON_LEAVE' ? <div className="rounded-lg bg-sky-50 px-3 py-3 text-center text-xs font-medium text-sky-800">{tx('You are on approved leave today.', 'आज आप मंज़ूर छुट्टी पर हैं।')}</div>
        : rec?.inAt && !rec.outAt ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-3 py-3"><div className="text-xs text-emerald-900"><b className="block text-sm">{tx(`In since ${fmtTime(rec.inAt)}`, `${fmtTime(rec.inAt)} से हाज़िर`)}</b>{rec.lateMin ? tx(`${rec.lateMin} min late`, `${rec.lateMin} मिनट देर`) : tx('On time', 'समय पर')}</div>
            <button type="button" onClick={() => setPunch('out')} className={BTN_DARK} data-testid="hr-punch-out"><LogOut className="h-4 w-4" />{tx('Punch out', 'छुट्टी की हाज़िरी')}</button></div>)
        : rec?.outAt ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3"><div className="text-xs text-slate-700"><b className="block text-sm text-slate-900">{tx('Day done', 'दिन पूरा')}</b>{fmtTime(rec.inAt)} → {fmtTime(rec.outAt)}</div><button type="button" onClick={() => setPunch('out')} className="text-[11px] font-semibold text-slate-600 underline">{tx('Update out time', 'समय बदलें')}</button></div>)
        : <button type="button" onClick={() => setPunch('in')} className={`${BTN_GREEN} w-full !min-h-14 !text-sm`} data-testid="hr-punch-in"><LogIn className="h-5 w-5" />{tx('Punch in', 'हाज़िरी लगाएँ')}</button>
      )}
      {has('ATTENDANCE') && (
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500"><span>{monthLabel(d.month, hi)}</span><span>{tx(`Present ${d.summary.presentDays} · Late ${d.summary.L} · Absent ${d.summary.A} · Leave ${d.summary.V}`, `हाज़िर ${d.summary.presentDays} · देर ${d.summary.L} · ग़ैरहाज़िर ${d.summary.A} · छुट्टी ${d.summary.V}`)}</span></div>
          <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-0.5" aria-hidden>{d.codes.split('').map((c: string, i: number) => <span key={i} className={`flex aspect-square items-center justify-center rounded text-[9px] font-semibold ${CODE_CLASS[c] || ''}`}>{i + 1}</span>)}</div>
        </div>
      )}
      {has('TARGETS') && d.target && (
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          <div className="flex items-center justify-between text-xs"><b className="text-slate-900">{tx('My target this month', 'इस महीने का मेरा टारगेट')}</b><Pill tone={PACE[d.target.pace][2]}>{PACE[d.target.pace][hi ? 1 : 0]} · {d.target.overall}%</Pill></div>
          {d.target.rows.map((p: any) => <div key={p.metric}><div className="mb-1 flex justify-between text-[11px]"><span className="text-slate-600">{METRIC[p.metric][hi ? 1 : 0]}</span><b className="text-slate-900">{p.actual} / {p.target}</b></div><Bar pct={p.pct} /></div>)}
          <p className="text-[10px] text-slate-400">{tx(`${d.target.elapsed}% of the working days are over`, `काम के ${d.target.elapsed}% दिन बीत चुके`)}</p>
        </div>
      )}
      <div className="flex gap-2">
        {has('LEAVE') && quick('leave', <CalendarDays className="h-4 w-4" />, tx('Leave', 'छुट्टी'), d.pending.leaves)}
        {has('CLAIMS') && quick('claims', <Receipt className="h-4 w-4" />, tx('Expenses', 'ख़र्च'), d.pending.claims)}
        {has('ASSETS') && quick('assets', <Package className="h-4 w-4" />, tx('My items', 'मेरा सामान'), d.pending.assetsToConfirm)}
        {has('STATEMENT') && quick('pay', <Wallet className="h-4 w-4" />, tx('Pay', 'वेतन'), 0)}
      </div>
      {panel === 'leave' && <LeavePanel today={d.today} onChanged={load} />}
      {panel === 'claims' && <ClaimsPanel today={d.today} onChanged={load} />}
      {panel === 'assets' && <AssetsPanel onChanged={load} />}
      {panel === 'pay' && <PayPanel />}
      {punch && <PunchSheet kind={punch} needSelfie={!!d.settings.selfie} onClose={() => setPunch(null)} onDone={() => { setPunch(null); flash(true, punch === 'in' ? tx('You are marked present', 'आप हाज़िर लिख दिए गए') : tx('Day marked done', 'दिन पूरा लिख दिया')); load(); }} />}
    </section>
  );
};
