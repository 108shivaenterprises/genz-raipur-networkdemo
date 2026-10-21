/**
 * v35 — Network Watch screens (Disputes & Blacklist tab).
 *  PartyWatchBroker: check a buyer / owner mobile, report one who refused commission or went direct, my reports, appeal.
 *  PartyWatchAdmin:  GENZ staff queue — uphold / dismiss each report, block or clear a mobile, answer appeals.
 * The network only ever sees a level and the last 4 digits; names, notes and who reported stay with the reporter and GENZ staff.
 */
import React, { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck, Search, Loader2, Ban, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { WATCH_CATEGORIES, WATCH_EVIDENCE, WATCH_LEVEL_TEXT } from '../shared/partyWatchRules.js';

const d0 = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const digits10 = (v: string) => v.replace(/\D/g, '').slice(-10);
const cls = 'min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm';
const LevelChip: React.FC<{ level: string }> = ({ level }) => {
  const tx = useTx();
  const m: Record<string, [string, string, string]> = {
    NONE: ['bg-emerald-100 text-emerald-800', 'Clear', 'साफ़'], WATCH: ['bg-slate-100 text-slate-700', 'Watch (staff only)', 'निगरानी (सिर्फ़ स्टाफ)'],
    CAUTION: ['bg-amber-100 text-amber-900', 'Caution', 'चेतावनी'], BLOCKED: ['bg-red-100 text-red-800', 'Blocked', 'ब्लॉक'],
  };
  const x = m[level] || m.NONE;
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${x[0]}`} data-testid={`pw-level-${level}`}>{tx(x[1], x[2])}</span>;
};
const catText = (id: string, tx: (a: string, b: string) => string) => { const c = WATCH_CATEGORIES.find(x => x.id === id); return c ? tx(c.en, c.hi) : id; };

export const PartyWatchBroker: React.FC = () => {
  const tx = useTx();
  const [phone, setPhone] = useState(''); const [res, setRes] = useState<any>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [open, setOpen] = useState(false); const [mine, setMine] = useState<any>(null);
  const [f, setF] = useState({ partyName: '', partyKind: 'BUYER', category: 'COMMISSION_REFUSED', evidenceKind: '', note: '' });
  const [msg, setMsg] = useState(''); const [appeal, setAppeal] = useState('');
  const loadMine = () => api.pwMine().then(setMine).catch(() => undefined);
  useEffect(() => { loadMine(); }, []);
  const check = async () => {
    setErr(''); setMsg(''); setRes(null); setBusy(true);
    try { setRes(await api.pwCheck(digits10(phone))); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const send = async () => {
    setErr(''); setMsg(''); setBusy(true);
    try { await api.pwReport({ ...f, phone: digits10(phone), evidenceKind: f.evidenceKind || undefined }); setMsg(tx('Report sent to GENZ. We review every report before anything is shown to the network.', 'रिपोर्ट GENZ को भेज दी। नेटवर्क को कुछ भी दिखाने से पहले हम हर रिपोर्ट जाँचते हैं।')); setOpen(false); setF({ ...f, note: '', partyName: '' }); loadMine(); check(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const sendAppeal = async () => {
    setErr(''); setBusy(true);
    try { await api.pwAppeal(digits10(phone), appeal); setMsg(tx('Appeal sent. GENZ will answer it.', 'अपील भेज दी। GENZ जवाब देगा।')); setAppeal(''); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const valid = digits10(phone).length === 10;
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" data-testid="party-watch">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><ShieldAlert className="h-4 w-4 text-amber-600" />{tx('Network Watch — buyers & owners who skip the broker', 'नेटवर्क वॉच — ब्रोकर को छोड़ने वाले खरीदार और मालिक')}</h3>
        <p className="mt-0.5 text-xs text-slate-600">{tx('Check a mobile before you start working. If someone refuses your commission or goes direct, report it: when two brokers with proof report the same mobile, the whole network sees a caution, and GENZ can block it.', 'काम शुरू करने से पहले मोबाइल जाँचें। कोई आपका कमीशन देने से मना करे या सीधा सौदा करे तो रिपोर्ट करें: दो ब्रोकर सबूत के साथ एक ही मोबाइल की रिपोर्ट करें तो पूरे नेटवर्क को चेतावनी दिखती है, और GENZ उसे ब्लॉक कर सकता है।')}</p>
      </div>
      <div className="flex gap-2">
        <input className={cls} inputMode="numeric" maxLength={14} value={phone} onChange={e => { setPhone(e.target.value); setRes(null); }} placeholder={tx('Buyer / owner mobile (10 digits)', 'खरीदार / मालिक का मोबाइल (10 अंक)')} data-testid="pw-phone" />
        <button type="button" disabled={!valid || busy} onClick={check} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-50" data-testid="pw-check">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{tx('Check', 'जाँचें')}</button>
      </div>
      {res && (
        <div className={`rounded-lg border p-3 text-xs ${res.level === 'BLOCKED' ? 'border-red-300 bg-red-50 text-red-900' : res.level === 'CAUTION' ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`} data-testid="pw-result">
          <p className="flex items-center gap-2 font-semibold">…{res.last4} <LevelChip level={res.level} /></p>
          <p className="mt-1">{res.message ? tx(res.message.en, res.message.hi) : tx('No caution on this mobile. That does not prove it is safe — always fix the commission terms in writing.', 'इस मोबाइल पर कोई चेतावनी नहीं। इसका मतलब सुरक्षित होना नहीं — कमीशन की शर्तें हमेशा लिखित में तय करें।')}</p>
          {res.level !== 'NONE' && (
            <div className="mt-2 space-y-1">
              <p className="text-[11px]">{tx('Think this mark is wrong (for example the commission was paid)? Tell GENZ:', 'लगता है यह निशान ग़लत है (जैसे कमीशन मिल गया)? GENZ को बताएँ:')}</p>
              <div className="flex gap-2"><input className={cls} maxLength={400} value={appeal} onChange={e => setAppeal(e.target.value)} placeholder={tx('Why is it wrong? (15+ characters)', 'यह ग़लत क्यों है? (15+ अक्षर)')} /><button type="button" disabled={busy} onClick={sendAppeal} className="min-h-10 shrink-0 rounded-lg border border-slate-400 bg-white px-3 text-sm font-semibold">{tx('Appeal', 'अपील')}</button></div>
            </div>)}
          {!open && <button type="button" onClick={() => setOpen(true)} className="mt-2 font-semibold underline" data-testid="pw-open-report">{tx('Report this mobile…', 'इस मोबाइल की रिपोर्ट करें…')}</button>}
        </div>)}
      {!res && valid && !open && <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-red-700 underline" data-testid="pw-open-report">{tx('Report this mobile…', 'इस मोबाइल की रिपोर्ट करें…')}</button>}
      {open && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs" data-testid="pw-form">
          <div className="grid gap-2 sm:grid-cols-2">
            <input className={cls} maxLength={80} value={f.partyName} onChange={e => setF({ ...f, partyName: e.target.value })} placeholder={tx('Person’s name', 'व्यक्ति का नाम')} data-testid="pw-name" />
            <select className={cls} value={f.partyKind} onChange={e => setF({ ...f, partyKind: e.target.value })}><option value="BUYER">{tx('Buyer / tenant', 'खरीदार / किरायेदार')}</option><option value="OWNER">{tx('Owner / seller', 'मालिक / विक्रेता')}</option></select>
          </div>
          <select className={cls} value={f.category} onChange={e => setF({ ...f, category: e.target.value })} data-testid="pw-category">{WATCH_CATEGORIES.map(c => <option key={c.id} value={c.id}>{tx(c.en, c.hi)}</option>)}</select>
          <select className={cls} value={f.evidenceKind} onChange={e => setF({ ...f, evidenceKind: e.target.value })} data-testid="pw-evidence">
            <option value="">{tx('No proof on GENZ (needs 3 brokers to show a caution)', 'GENZ पर कोई सबूत नहीं (चेतावनी के लिए 3 ब्रोकर चाहिए)')}</option>
            {WATCH_EVIDENCE.map(e => <option key={e.id} value={e.id}>{tx('Proof: ', 'सबूत: ')}{tx(e.en, e.hi)}</option>)}
          </select>
          <textarea className="min-h-20 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" maxLength={400} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder={tx('What happened? Dates, what was said (15+ characters). Only you and GENZ staff read this.', 'क्या हुआ? तारीख़ें, क्या कहा गया (15+ अक्षर)। इसे सिर्फ़ आप और GENZ स्टाफ पढ़ेंगे।')} data-testid="pw-note" />
          <p className="text-[11px] text-slate-600">{tx('Report only what really happened. GENZ checks every report; a report found wrong counts against you, and three in a year stop you from reporting.', 'सिर्फ़ वही लिखें जो सच में हुआ। GENZ हर रिपोर्ट जाँचता है; ग़लत निकली रिपोर्ट आपके खिलाफ़ गिनी जाती है और साल में तीन होने पर आप रिपोर्ट नहीं कर पाएँगे।')}</p>
          <div className="flex gap-2"><button type="button" disabled={busy || !valid} onClick={send} className="min-h-10 rounded-lg bg-red-700 px-3 font-semibold text-white disabled:opacity-50" data-testid="pw-send">{tx('Send report to GENZ', 'GENZ को रिपोर्ट भेजें')}</button><button type="button" onClick={() => setOpen(false)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 font-semibold">{tx('Cancel', 'रद्द')}</button></div>
        </div>)}
      {msg && <p className="rounded bg-emerald-50 p-2 text-xs font-medium text-emerald-800" role="status">{msg}</p>}
      {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
      {mine && mine.reports.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-700">{tx('My reports', 'मेरी रिपोर्ट')}{mine.dismissed ? <span className="ml-2 font-normal text-amber-700">{tx(`${mine.dismissed} found wrong (limit ${mine.limit})`, `${mine.dismissed} ग़लत निकलीं (सीमा ${mine.limit})`)}</span> : null}</p>
          <ul className="mt-1 divide-y divide-slate-100 text-xs" data-testid="pw-mine">{mine.reports.slice(0, 20).map((r: any) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span>…{r.last4} · {r.partyName} · {catText(r.category, tx)}</span><span className="flex items-center gap-1"><span className="text-slate-500">{r.status === 'OPEN' ? tx('GENZ reviewing', 'GENZ जाँच रहा है') : r.status === 'UPHELD' ? tx('Accepted', 'मंज़ूर') : tx('Not accepted', 'अस्वीकार')}</span><LevelChip level={r.now} /></span></li>))}</ul>
        </div>)}
    </section>
  );
};

export const PartyWatchAdmin: React.FC = () => {
  const tx = useTx();
  const [q, setQ] = useState('open'); const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  const [act, setAct] = useState<{ key: string; text: string } | null>(null);
  const load = (queue = q) => api.pwAdmin(queue === 'all' ? undefined : queue).then(setD).catch(e => setErr(e.message));
  useEffect(() => { load(q); }, [q]);
  const run = async (fn: () => Promise<any>) => { setErr(''); try { await fn(); setAct(null); load(); } catch (e: any) { setErr(e.message); } };
  const Box = ({ k, label, ok, tone }: { k: string; label: string; ok: (text: string) => Promise<any>; tone: string }) => act?.key === k
    ? <span className="mt-1 flex w-full gap-2"><input autoFocus className="min-h-9 flex-1 rounded border border-slate-300 px-2" placeholder={tx('Reason (10+ characters)', 'कारण (10+ अक्षर)')} value={act.text} onChange={e => setAct({ key: k, text: e.target.value })} /><button type="button" onClick={() => run(() => ok(act.text))} className={`rounded px-3 font-semibold text-white ${tone}`}>{tx('Confirm', 'पक्का')}</button><button type="button" onClick={() => setAct(null)} className="rounded border px-2">×</button></span>
    : <button type="button" onClick={() => setAct({ key: k, text: '' })} className={`rounded px-2 py-1 font-semibold text-white ${tone}`}>{label}</button>;
  const tabs: [string, string, string, number | undefined][] = [['open', 'To review', 'जाँचना बाकी', d?.counts?.open], ['caution', 'Caution', 'चेतावनी', d?.counts?.caution], ['blocked', 'Blocked', 'ब्लॉक', d?.counts?.blocked], ['all', 'All', 'सभी', undefined]];
  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4" data-testid="party-watch-admin">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Ban className="h-4 w-4 text-red-600" />{tx('Network Watch — review desk', 'नेटवर्क वॉच — जाँच डेस्क')}{d?.counts?.appeals ? <span className="ml-1 rounded-full bg-amber-100 px-2 text-[11px] text-amber-900">{d.counts.appeals} {tx('appeals', 'अपील')}</span> : null}</h3>
      <div className="flex flex-wrap gap-1.5">{tabs.map(([id, en, hi, n]) => <button key={id} type="button" onClick={() => setQ(id)} className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${q === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`} data-testid={`pwa-tab-${id}`}>{tx(en, hi)}{n ? ` (${n})` : ''}</button>)}</div>
      {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
      {d && d.alerts.length === 0 && <p className="text-xs text-slate-500">{tx('Nothing here.', 'यहाँ कुछ नहीं।')}</p>}
      <ul className="space-y-3 text-xs">{(d?.alerts || []).map((a: any) => (
        <li key={a.id} className="rounded-lg border border-slate-200 p-3" data-testid={`pwa-${a.id}`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><b>…{a.last4} <span className="font-normal text-slate-500">({a.id}, {a.brokers} {tx('brokers', 'ब्रोकर')})</span></b><LevelChip level={a.level} /></div>
          {a.decision && <p className="mt-1 text-slate-600">{a.decision.action === 'BLOCKED' ? tx('Blocked', 'ब्लॉक') : tx('Cleared', 'क्लियर')} {tx('by', 'द्वारा')} {a.decision.byName} · {d0(a.decision.at)}{a.decision.until ? ` → ${d0(a.decision.until)}` : ''} — {a.decision.note}</p>}
          {a.maybeAccounts?.length > 0 && <p className="mt-1 flex items-center gap-1 text-amber-800"><AlertTriangle className="h-3.5 w-3.5" />{tx('This mobile also belongs to a GENZ account:', 'यह मोबाइल एक GENZ खाते का भी है:')} {a.maybeAccounts.map((m: any) => `${m.name} (${m.role})`).join(', ')}</p>}
          <ul className="mt-2 space-y-2">{a.reports.map((r: any) => (
            <li key={r.id} className="rounded bg-slate-50 p-2">
              <p><b>{r.partyName}</b> ({r.partyKind === 'OWNER' ? tx('owner', 'मालिक') : tx('buyer', 'खरीदार')}) · {catText(r.category, tx)}</p>
              <p className="text-slate-700">{r.note}</p>
              <p className="text-slate-500">{tx('Reported by', 'रिपोर्टर')} {r.brokerName}{r.brokerCompany ? `, ${r.brokerCompany}` : ''} · {d0(r.at)} · {r.evidence.verified ? <span className="font-semibold text-emerald-700">{tx('proof', 'सबूत')}: {r.evidence.kind} {r.evidence.refId}</span> : tx('no proof', 'सबूत नहीं')}</p>
              {r.status === 'OPEN'
                ? <div className="mt-1 flex flex-wrap gap-2"><Box k={`u${r.id}`} label={tx('Uphold', 'सही माना')} tone="bg-emerald-700" ok={t => api.pwReview(a.id, r.id, 'UPHOLD', t)} /><Box k={`d${r.id}`} label={tx('Dismiss (false report)', 'ख़ारिज (ग़लत रिपोर्ट)')} tone="bg-slate-700" ok={t => api.pwReview(a.id, r.id, 'DISMISS', t)} /></div>
                : <p className="mt-1 text-slate-600">{r.status === 'UPHELD' ? tx('Upheld', 'सही माना') : tx('Dismissed', 'ख़ारिज')} — {r.review?.note}</p>}
            </li>))}</ul>
          {a.appeals.filter((x: any) => x.status === 'OPEN').map((x: any) => (
            <div key={x.id} className="mt-2 rounded border border-amber-300 bg-amber-50 p-2"><p><b>{tx('Appeal', 'अपील')}</b> · {x.byName} · {x.note}</p><Box k={`a${x.id}`} label={tx('Answer…', 'जवाब दें…')} tone="bg-slate-800" ok={t => api.pwAnswer(a.id, x.id, t)} /></div>))}
          <div className="mt-2 flex flex-wrap gap-2">
            {a.level !== 'BLOCKED' && <Box k={`b${a.id}`} label={tx('Block for 1 year', '1 साल के लिए ब्लॉक')} tone="bg-red-700" ok={t => api.pwDecide(a.id, 'BLOCK', t)} />}
            {(a.level === 'BLOCKED' || a.level === 'CAUTION' || a.level === 'WATCH') && <Box k={`c${a.id}`} label={tx('Clear', 'क्लियर करें')} tone="bg-emerald-700" ok={t => api.pwDecide(a.id, 'CLEAR', t)} />}
          </div>
        </li>))}</ul>
    </section>
  );
};
