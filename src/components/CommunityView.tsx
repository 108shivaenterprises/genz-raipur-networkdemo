import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, MapPin, Users, GraduationCap, Landmark, Flag, Check, Plus, Calendar, Megaphone } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { LESSONS } from '../shared/academy.js';
import { formatINR } from '../lib/utils.js';
import type { UserProfile } from '../types/index.js';

type Sub = 'chapters' | 'academy' | 'loans' | 'reports';
const field = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-slate-900 focus:outline-none';
const btn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white disabled:opacity-50';

export const CommunityView: React.FC<{ perms: string[]; currentUser: UserProfile }> = ({ perms, currentUser }) => {
  const tx = useTx();
  const has = (p: string) => perms.includes(p);
  const subs: [Sub, string, string, React.ElementType, boolean][] = [
    ['chapters', 'Chapters', 'चैप्टर', Users, has('chapter:read')], ['academy', 'Academy', 'अकादमी', GraduationCap, has('academy:read')],
    ['loans', 'Home-loan desk', 'होम-लोन डेस्क', Landmark, has('loan:submit') || has('loan:manage')], ['reports', 'Reports', 'रिपोर्ट', Flag, has('report:manage')],
  ];
  const avail = subs.filter(s => s[4]);
  const [sub, setSub] = useState<Sub>(() => { try { if (sessionStorage.getItem('genz.academy.open')) return 'academy'; } catch { /* ignore */ } return avail[0]?.[0] || 'chapters'; });
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">{avail.map(([id, en, hi, Icon]) => <button key={id} role="tab" aria-selected={sub === id} onClick={() => setSub(id)} className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-semibold ${sub === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}><Icon className="h-4 w-4" aria-hidden />{tx(en, hi)}</button>)}</div>
      {sub === 'chapters' && <Chapters isAdmin={has('chapter:manage')} me={currentUser} />}
      {sub === 'academy' && <Academy />}
      {sub === 'loans' && <Loans manage={has('loan:manage')} submit={has('loan:submit')} />}
      {sub === 'reports' && <Reports />}
    </div>
  );
};

// ───────── F7 chapters ─────────
const Chapters: React.FC<{ isAdmin: boolean; me: UserProfile }> = ({ isAdmin, me }) => {
  const tx = useTx();
  const [d, setD] = useState<any>(null); const [open, setOpen] = useState<string | null>(null); const [err, setErr] = useState('');
  const [nf, setNf] = useState({ name: '', city: me.city || '', zone: '' });
  const load = useCallback(() => api.chapters().then(r => { setD(r); if (r.myChapterId) setOpen(o => o ?? r.myChapterId); }).catch(e => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="flex justify-center py-12">{err ? <p className="text-sm text-red-700">{err}</p> : <Loader2 className="h-6 w-6 animate-spin text-slate-500" />}</div>;
  const join = async (id: string) => { try { await api.chapterJoin(id); setOpen(id); load(); } catch (e: any) { setErr(e.message); } };
  return (
    <div className="space-y-4">
      {err && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{err}</p>}
      {d.chapters.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">{tx('No chapter in your city yet. Chapters are opened by GENZ once a city has enough verified brokers.', 'आपके शहर में अभी कोई चैप्टर नहीं। शहर में पर्याप्त सत्यापित ब्रोकर होने पर GENZ चैप्टर खोलता है।')}</p>}
      <div className="grid gap-3 sm:grid-cols-2">{d.chapters.map((c: any) => (
        <div key={c.id} className={`rounded-xl border bg-white p-3.5 ${c.isMember ? 'border-emerald-300' : 'border-slate-200'}`}>
          <div className="flex items-start justify-between gap-2"><div><div className="text-sm font-bold text-slate-900">{c.name}</div><div className="flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" aria-hidden />{c.city}{c.zone ? ` · ${c.zone}` : ''}</div></div><span className="text-xs font-semibold text-slate-600">{c.members} {tx('members', 'सदस्य')}</span></div>
          <div className="mt-1 text-xs text-slate-500">{tx('City Captain', 'सिटी कैप्टन')}: {c.captain || '—'}</div>
          {c.nextMeet && <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-700"><Calendar className="h-3.5 w-3.5" aria-hidden />{c.nextMeet.title} · {new Date(c.nextMeet.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>}
          <div className="mt-3 flex gap-2">{c.isMember || isAdmin ? <button onClick={() => setOpen(open === c.id ? null : c.id)} className={btn}>{open === c.id ? tx('Close', 'बंद करें') : tx('Open chapter', 'चैप्टर खोलें')}</button> : <button onClick={() => join(c.id)} className={btn}>{tx('Join chapter', 'चैप्टर जॉइन करें')}</button>}
            {c.isMember && <button onClick={async () => { await api.chapterLeave(); setOpen(null); load(); }} className="min-h-11 rounded-lg border border-slate-300 px-3 text-xs font-semibold">{tx('Leave', 'छोड़ें')}</button>}</div>
          {open === c.id && <ChapterDetail id={c.id} />}
        </div>))}</div>
      {isAdmin && (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5"><div className="mb-2 text-sm font-bold text-slate-900">{tx('Open a new chapter', 'नया चैप्टर खोलें')}</div>
          <div className="grid gap-2 sm:grid-cols-3"><input value={nf.name} onChange={e => setNf({ ...nf, name: e.target.value })} placeholder={tx('Chapter name', 'चैप्टर का नाम')} className={field} /><input value={nf.city} onChange={e => setNf({ ...nf, city: e.target.value })} placeholder={tx('City', 'शहर')} className={field} /><input value={nf.zone} onChange={e => setNf({ ...nf, zone: e.target.value })} placeholder={tx('Zone (optional)', 'ज़ोन (वैकल्पिक)')} className={field} /></div>
          <button onClick={async () => { try { await api.chapterCreate(nf); setNf({ name: '', city: nf.city, zone: '' }); load(); } catch (e: any) { setErr(e.message); } }} className={btn + ' mt-2'}><Plus className="h-4 w-4" aria-hidden />{tx('Create', 'बनाएँ')}</button></div>
      )}
    </div>
  );
};

const ChapterDetail: React.FC<{ id: string }> = ({ id }) => {
  const tx = useTx();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [post, setPost] = useState(''); const [m, setM] = useState({ title: '', at: '', venue: '' });
  const [pick, setPick] = useState<Record<string, string[]>>({});
  const load = useCallback(() => api.chapter(id).then(setD).catch(e => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="py-4">{err ? <p className="text-xs text-red-700">{err}</p> : <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}</div>;
  const run = async (fn: () => Promise<any>) => { try { await fn(); setErr(''); load(); } catch (e: any) { setErr(e.message); } };
  return (
    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 text-xs">
      {err && <p className="text-red-700">{err}</p>}
      {d.canRun && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-2.5">
          <div className="flex gap-2"><input value={post} onChange={e => setPost(e.target.value)} placeholder={tx('Announcement', 'घोषणा')} className={field + ' text-sm'} /><button onClick={() => run(async () => { await api.chapterPost(id, post); setPost(''); })} className={btn} aria-label={tx('Post', 'पोस्ट')}><Megaphone className="h-4 w-4" /></button></div>
          <div className="grid gap-2 sm:grid-cols-3"><input value={m.title} onChange={e => setM({ ...m, title: e.target.value })} placeholder={tx('Meet title', 'मीट का नाम')} className={field + ' text-sm'} /><input type="datetime-local" value={m.at} onChange={e => setM({ ...m, at: e.target.value })} className={field + ' text-sm'} /><input value={m.venue} onChange={e => setM({ ...m, venue: e.target.value })} placeholder={tx('Venue', 'स्थान')} className={field + ' text-sm'} /></div>
          <button disabled={!m.title || !m.at || !m.venue} onClick={() => run(async () => { await api.meetCreate(id, { ...m, at: new Date(m.at).toISOString() }); setM({ title: '', at: '', venue: '' }); })} className={btn}>{tx('Schedule meet', 'मीट तय करें')}</button>
        </div>
      )}
      {d.posts.length > 0 && <div><div className="font-bold text-slate-800">{tx('Announcements', 'घोषणाएँ')}</div><ul className="mt-1 space-y-1">{d.posts.slice(0, 5).map((p: any) => <li key={p.id} className="rounded-lg bg-amber-50 p-2 text-amber-900">{p.text}<span className="block text-[10px] text-amber-700">{p.by} · {new Date(p.at).toLocaleDateString('en-IN')}</span></li>)}</ul></div>}
      <div><div className="font-bold text-slate-800">{tx('Meets', 'मीट')}</div>
        {d.meets.length === 0 ? <p className="mt-1 text-slate-500">{tx('No meets scheduled.', 'कोई मीट तय नहीं।')}</p> : <ul className="mt-1 space-y-2">{d.meets.map((x: any) => {
          const past = new Date(x.at).getTime() < Date.now();
          return (<li key={x.id} className="rounded-lg border border-slate-200 p-2.5"><div className="font-semibold text-slate-900">{x.title}</div><div className="text-slate-500">{new Date(x.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · {x.venue} · {x.going} {tx('going', 'आ रहे')}</div>
            {!past && <div className="mt-2 flex gap-2"><button onClick={() => run(() => api.meetRsvp(x.id, true))} className={`min-h-10 rounded-lg px-3 font-semibold ${x.myRsvp === true ? 'bg-emerald-600 text-white' : 'border border-slate-300'}`}>{tx('I’ll come', 'मैं आऊँगा')}</button><button onClick={() => run(() => api.meetRsvp(x.id, false))} className={`min-h-10 rounded-lg px-3 font-semibold ${x.myRsvp === false ? 'bg-slate-700 text-white' : 'border border-slate-300'}`}>{tx('Can’t', 'नहीं आ सकता')}</button></div>}
            {past && d.canRun && <div className="mt-2"><div className="mb-1 text-slate-600">{tx('Tick who attended', 'जो आए उन्हें टिक करें')}</div><div className="grid max-h-32 gap-1 overflow-y-auto sm:grid-cols-2">{d.members.map((p: any) => <label key={p.id} className="flex min-h-9 items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={(pick[x.id] ?? (x.attendees || []).map((a: any) => a.id)).includes(p.id)} onChange={e => { const cur = pick[x.id] ?? (x.attendees || []).map((a: any) => a.id); setPick({ ...pick, [x.id]: e.target.checked ? [...cur, p.id] : cur.filter((i: string) => i !== p.id) }); }} />{p.name}</label>)}</div><button onClick={() => run(() => api.meetAttendance(x.id, pick[x.id] ?? []))} className={btn + ' mt-1'}><Check className="h-4 w-4" aria-hidden />{tx('Save attendance (+10 pts each)', 'हाज़िरी सेव करें (+10 पॉइंट्स)')}</button></div>}
            {past && x.attendees && x.attendees.length > 0 && <div className="mt-2"><div className="font-semibold text-slate-700">{tx('Who was there — connect', 'कौन-कौन आया — जुड़ें')}</div><ul className="mt-1 space-y-0.5">{x.attendees.map((a: any) => <li key={a.id}>{a.name}{a.company ? ` · ${a.company}` : ''}{a.card && <a href={a.card} target="_blank" rel="noreferrer" className="ml-2 font-semibold text-blue-700 underline">{tx('Visiting card', 'विज़िटिंग कार्ड')}</a>}</li>)}</ul></div>}
          </li>);})}</ul>}</div>
      <div><div className="font-bold text-slate-800">{tx('Members', 'सदस्य')} ({d.members.length})</div><div className="mt-1 flex flex-wrap gap-1">{d.members.slice(0, 40).map((p: any) => <span key={p.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{p.name}</span>)}</div></div>
    </div>
  );
};

// ───────── F14 academy ─────────
const Academy: React.FC = () => {
  const tx = useTx(); const { lang } = useI18n();
  const [done, setDone] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(() => { try { const v = sessionStorage.getItem('genz.academy.open'); sessionStorage.removeItem('genz.academy.open'); return v; } catch { return null; } });
  useEffect(() => { api.academy().then(r => setDone(r.done)).catch(() => undefined); }, []);
  const TOPIC: Record<string, [string, string]> = { RERA: ['RERA', 'RERA'], DOCS: ['Documents', 'कागज़ात'], NEGOTIATION: ['Negotiation', 'मोलभाव'], APP: ['App', 'ऐप'] };
  const pct = Math.round((done.filter(d => LESSONS.some(l => l.id === d)).length / LESSONS.length) * 100);
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-white p-3.5 ring-1 ring-slate-200"><div className="flex justify-between text-sm font-bold text-slate-900"><span>{tx('Your progress', 'आपकी प्रगति')}</span><span>{pct}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div></div>
      {LESSONS.map(l => (
        <div key={l.id} className={`rounded-xl border bg-white ${open === l.id ? 'border-slate-900' : 'border-slate-200'}`}>
          <button onClick={() => setOpen(open === l.id ? null : l.id)} className="flex min-h-14 w-full items-center gap-3 p-3.5 text-left"><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${done.includes(l.id) ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{done.includes(l.id) ? '✓' : ''}</span><span className="flex-1"><span className="block text-sm font-semibold text-slate-900">{l.title[lang]}</span><span className="text-[11px] text-slate-500">{tx(...TOPIC[l.topic])}</span></span></button>
          {open === l.id && (
            <div className="space-y-3 border-t border-slate-100 p-3.5">
              {l.youtube ? <div className="aspect-video overflow-hidden rounded-lg"><iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${l.youtube}`} title={l.title[lang]} loading="lazy" allowFullScreen /></div> : <p className="rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-500">{tx('Video coming soon — the key points are below.', 'वीडियो जल्द आ रहा है — मुख्य बातें नीचे हैं।')}</p>}
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{l.points[lang].map((p, i) => <li key={i}>{p}</li>)}</ul>
              {!done.includes(l.id) && <button onClick={async () => { await api.academyDone(l.id); setDone([...done, l.id]); }} className={btn}>{tx('Mark as done', 'पूरा हुआ')}</button>}
            </div>)}
        </div>))}
    </div>
  );
};

// ───────── F19 loan desk ─────────
const STATUS: Record<string, [string, string]> = { SUBMITTED: ['Submitted', 'जमा'], CONTACTED: ['Contacted', 'संपर्क हुआ'], SANCTIONED: ['Sanctioned', 'स्वीकृत'], DISBURSED: ['Disbursed', 'वितरित'], REJECTED: ['Rejected', 'अस्वीकृत'] };
const Loans: React.FC<{ manage: boolean; submit: boolean }> = ({ manage, submit }) => {
  const tx = useTx();
  const [list, setList] = useState<any[] | null>(null); const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const [f, setF] = useState({ clientName: '', clientPhone: '', amountL: '', city: '', incomeType: 'SALARIED', consent: false });
  const load = useCallback(() => api.loans().then(r => setList(r.loans)).catch(e => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const send = async (e: React.FormEvent) => { e.preventDefault(); setErr(''); try { await api.loanSubmit({ clientName: f.clientName, clientPhone: f.clientPhone, amount: Math.round((parseFloat(f.amountL) || 0) * 100000), city: f.city, incomeType: f.incomeType, consent: f.consent }); setMsg(tx('Referral sent to the GENZ loan desk.', 'रेफ़रल GENZ लोन डेस्क को भेज दिया।')); setF({ ...f, clientName: '', clientPhone: '', amountL: '', consent: false }); load(); } catch (e2: any) { setErr(e2.message); } };
  return (
    <div className="space-y-4">
      {submit && (
        <form onSubmit={send} className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3.5">
          <div className="text-sm font-bold text-slate-900">{tx('Refer a client for a home loan', 'क्लाइंट को होम लोन के लिए रेफ़र करें')}</div>
          <div className="grid gap-2 sm:grid-cols-2"><input required value={f.clientName} onChange={e => setF({ ...f, clientName: e.target.value })} placeholder={tx('Client name', 'क्लाइंट का नाम')} className={field} /><input required inputMode="tel" value={f.clientPhone} onChange={e => setF({ ...f, clientPhone: e.target.value })} placeholder={tx('Client mobile', 'क्लाइंट मोबाइल')} className={field} />
            <input required inputMode="decimal" value={f.amountL} onChange={e => setF({ ...f, amountL: e.target.value })} placeholder={tx('Loan amount (₹ lakh)', 'लोन राशि (₹ लाख)')} className={field} /><input required value={f.city} onChange={e => setF({ ...f, city: e.target.value })} placeholder={tx('City', 'शहर')} className={field} />
            <select value={f.incomeType} onChange={e => setF({ ...f, incomeType: e.target.value })} className={field}><option value="SALARIED">{tx('Salaried', 'नौकरीपेशा')}</option><option value="SELF_EMPLOYED">{tx('Self-employed', 'स्व-रोज़गार')}</option><option value="BUSINESS">{tx('Business', 'व्यापार')}</option><option value="OTHER">{tx('Other', 'अन्य')}</option></select></div>
          <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" className="mt-0.5 h-5 w-5" checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} />{tx('The client agreed that the GENZ loan desk may contact them about a home loan.', 'क्लाइंट ने सहमति दी है कि GENZ लोन डेस्क होम लोन के बारे में उनसे संपर्क कर सकता है।')}</label>
          {err && <p className="text-xs font-medium text-red-700">{err}</p>}{msg && <p className="text-xs font-medium text-emerald-800">{msg}</p>}
          <button disabled={!f.consent} className={btn + ' w-full sm:w-auto'}>{tx('Send referral', 'रेफ़रल भेजें')}</button>
        </form>
      )}
      {!list ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : list.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-xs text-slate-500">{tx('No referrals yet.', 'अभी कोई रेफ़रल नहीं।')}</p> : (
        <ul className="space-y-2">{list.map(l => (
          <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
            <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-slate-900">{l.clientName} · {formatINR(l.amount)}</div><div className="text-slate-500">{l.city} · {l.incomeType.replace('_', ' ').toLowerCase()}{manage ? ` · ${tx('by', 'द्वारा')} ${l.brokerName} · ${l.clientPhone}` : ''}</div></div>
            {manage ? <select value={l.status} onChange={async e => { await api.loanStatus(l.id, { status: e.target.value }); load(); }} className="min-h-11 rounded-lg border border-slate-300 px-2 text-xs">{Object.keys(STATUS).map(s => <option key={s} value={s}>{tx(...STATUS[s])}</option>)}</select> : <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-700">{tx(...STATUS[l.status])}</span>}
          </li>))}</ul>)}
    </div>
  );
};

// ───────── F2 reports queue ─────────
const Reports: React.FC = () => {
  const tx = useTx();
  const [list, setList] = useState<any[] | null>(null); const [err, setErr] = useState('');
  const load = useCallback(() => api.reports().then(r => setList(r.reports)).catch(e => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const act = async (id: string, a: 'UPHOLD' | 'DISMISS') => { try { await api.reportResolve(id, a); load(); } catch (e: any) { setErr(e.message); } };
  if (!list) return <Loader2 className="h-5 w-5 animate-spin text-slate-400" />;
  return (
    <div className="space-y-2">{err && <p className="text-xs text-red-700">{err}</p>}
      <p className="text-xs text-slate-500">{tx('3 different members reporting the same listing hides it automatically until you review.', 'एक ही लिस्टिंग पर 3 अलग सदस्यों की रिपोर्ट आने पर वह आपकी समीक्षा तक अपने-आप छुप जाती है।')}</p>
      {list.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-xs text-slate-500">{tx('No reports.', 'कोई रिपोर्ट नहीं।')}</p> : list.map(r => (
        <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><div><b className="text-slate-900">{r.targetType === 'LISTING' ? tx('Listing', 'लिस्टिंग') : tx('Member', 'सदस्य')}: {r.targetLabel}</b>{r.held && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-800">{tx('ON HOLD', 'होल्ड पर')}</span>}<div className="text-slate-500">{r.reason} · {tx('by', 'द्वारा')} {r.reporterName}{r.note ? ` — “${r.note}”` : ''}</div></div>
          {r.status === 'OPEN' ? <div className="flex gap-2"><button onClick={() => act(r.id, 'UPHOLD')} className="min-h-10 rounded-lg bg-red-600 px-3 font-semibold text-white">{tx('Uphold (withdraw)', 'सही (हटाएँ)')}</button><button onClick={() => act(r.id, 'DISMISS')} className="min-h-10 rounded-lg border border-slate-300 px-3 font-semibold">{tx('Dismiss', 'खारिज')}</button></div> : <span className="font-semibold text-slate-500">{r.status}</span>}</div></div>))}
    </div>
  );
};
