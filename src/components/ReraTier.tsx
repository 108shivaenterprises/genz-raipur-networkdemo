import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Clock, ArrowUpCircle, XCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx, useI18n } from '../lib/i18n.js';

/**
 * v117 — "my RERA came". A local associate (Tier 2: resale, rental, land, local) who has now got his RERA registration adds it
 * himself; GENZ checks it on the state RERA portal and moves him to Tier 1 (builder RERA projects: partner, block, book).
 *   MyReraCard      — on the broker's own profile
 *   ReraClaimsPanel — on GENZ staff's ID Review desk
 */
const inp = 'min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase placeholder:normal-case';
const btn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-4 text-xs font-semibold disabled:opacity-50';
const day = (iso: string, hi: boolean) => new Date(iso).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
// same shape check as the server (kyc.ts isPlausibleRera) so the button wakes up only for a number that can pass
const plausible = (r: string) => /^[A-Z0-9][A-Z0-9\-/.]{6,28}[A-Z0-9]$/.test(r) && /[A-Z]/.test(r) && /\d/.test(r);
const norm = (v: string) => v.trim().toUpperCase().replace(/\s+/g, '');

export const MyReraCard: React.FC = () => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const [d, setD] = useState<Awaited<ReturnType<typeof api.netMyRera>> | null>(null);
  const [num, setNum] = useState(''); const [edit, setEdit] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const load = useCallback(() => api.netMyRera().then(setD).catch(e => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return err ? <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700" role="alert">{err}</p> : null;
  const send = async () => {
    setBusy(true); setErr('');
    try { await api.netMyReraSave(norm(num)); setEdit(false); setNum(''); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const claim = d.claim; const pending = claim?.status === 'PENDING'; const t1 = d.tier === 'TIER1';
  const form = (
    <div className="mt-3 space-y-2">
      <input value={num} onChange={e => setNum(e.target.value)} maxLength={30} className={inp} data-testid="rera-input" autoCapitalize="characters"
        placeholder={tx('RERA no. as on the certificate', 'सर्टिफ़िकेट वाला RERA नंबर')} aria-label={tx('RERA registration number', 'RERA रजिस्ट्रेशन नंबर')} />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !plausible(norm(num))} onClick={send} className={`${btn} bg-slate-900 text-white`} data-testid="rera-send">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpCircle className="h-4 w-4" />}{tx('Send to GENZ to check', 'जाँच के लिए GENZ को भेजें')}
        </button>
        {t1 && <button type="button" className={`${btn} border border-slate-300 bg-white text-slate-700`} onClick={() => setEdit(false)}>{tx('Cancel', 'रद्द')}</button>}
      </div>
      <p className="text-xs text-slate-500">{tx('GENZ checks the number on the state RERA portal. Till then nothing changes for you.', 'GENZ यह नंबर राज्य के RERA पोर्टल पर जाँचेगी। तब तक आपके लिए कुछ नहीं बदलता।')}</p>
    </div>
  );
  return (
    <section data-testid="rera-card" aria-label={tx('RERA and tier', 'RERA और टियर')}
      className={`rounded-2xl border p-4 ${t1 ? 'border-emerald-200 bg-emerald-50/70' : pending ? 'border-sky-200 bg-sky-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
      <div className="flex items-start gap-3">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${t1 ? 'bg-emerald-600' : pending ? 'bg-sky-600' : 'bg-amber-500'} text-white`} aria-hidden>
          {t1 ? <ShieldCheck className="h-5 w-5" /> : pending ? <Clock className="h-5 w-5" /> : <ArrowUpCircle className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900" data-testid="rera-tier">
            {t1 ? tx('Tier 1 · RERA verified', 'Tier 1 · RERA वेरिफ़ाइड') : tx('Tier 2 · Local associate', 'Tier 2 · लोकल एसोसिएट')}
          </h3>
          <p className="mt-0.5 text-xs text-slate-600">
            {t1
              ? tx('You can work builder (RERA) projects too: partner on a project, block units and book — plus resale, rental and land.', 'आप बिल्डर (RERA) प्रोजेक्ट पर भी काम कर सकते हैं: पार्टनर बनें, यूनिट ब्लॉक और बुक करें — साथ में रीसेल, किराया और ज़मीन।')
              : tx('You work resale, rental, land and local property. Got your RERA registration? Add it — once GENZ checks it, builder projects open for you.', 'आप रीसेल, किराया, ज़मीन और लोकल प्रॉपर्टी पर काम करते हैं। RERA रजिस्ट्रेशन मिल गया? यहाँ जोड़ें — GENZ की जाँच के बाद बिल्डर प्रोजेक्ट आपके लिए खुल जाएँगे।')}
          </p>
          {t1 && d.rera && <p className="mt-1 font-mono text-xs font-semibold text-emerald-800">RERA {d.rera}</p>}
        </div>
      </div>
      {pending && (
        <p className="mt-3 rounded-lg bg-white/80 p-2 text-xs text-sky-900" data-testid="rera-pending">
          {tx('GENZ is checking', 'GENZ जाँच रही है:')} <b className="font-mono">{claim!.number}</b> · {tx('sent', 'भेजा')} {day(claim!.at, hi)}. {tx('You will get an alert when it is done.', 'जाँच पूरी होने पर आपको सूचना मिलेगी।')}
        </p>
      )}
      {claim?.status === 'REJECTED' && !edit && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-white/80 p-2 text-xs text-red-800" data-testid="rera-rejected">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{tx('Could not confirm', 'पक्का नहीं हो सका:')} <b className="font-mono">{claim.number}</b>{claim.note ? ` — ${claim.note}` : ''}. {tx('Check the number and send it again.', 'नंबर जाँचें और फिर से भेजें।')}</span>
        </p>
      )}
      {!pending && (t1 ? (edit ? form : <button type="button" className="mt-2 min-h-11 px-1 text-xs font-semibold text-emerald-800 underline" onClick={() => setEdit(true)} data-testid="rera-change">{tx('My RERA number changed', 'मेरा RERA नंबर बदल गया')}</button>) : form)}
      {err && <p className="mt-2 text-xs text-red-700" role="alert">{err}</p>}
    </section>
  );
};

export const ReraClaimsPanel: React.FC<{ onDone?: () => void }> = ({ onDone }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.netReraClaims>>['claims'] | null>(null);
  const [why, setWhy] = useState<Record<string, string>>({}); const [no, setNo] = useState(''); const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const load = useCallback(() => api.netReraClaims().then(r => setRows(r.claims)).catch(e => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  if (!rows?.length) return err ? <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700" role="alert">{err}</p> : null;
  const decide = async (id: string, approve: boolean) => {
    setBusy(id); setErr('');
    try { await api.netReraDecide(id, approve, approve ? undefined : (why[id] || '').trim()); setNo(''); load(); onDone?.(); } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  return (
    <section className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3" data-testid="rera-claims" aria-label={tx('RERA to check', 'जाँचने के लिए RERA')}>
      <h3 className="text-sm font-bold text-slate-900">{tx('Brokers who added their RERA', 'जिन ब्रोकरों ने RERA जोड़ा')} ({rows.length})</h3>
      <p className="text-xs text-slate-600">{tx('Search the number on the state RERA portal (agent registration). If the name matches, approve — he becomes Tier 1 and builder projects open for him.', 'नंबर को राज्य के RERA पोर्टल (एजेंट रजिस्ट्रेशन) पर खोजें। नाम मिले तो मंज़ूर करें — वह Tier 1 बनेगा और बिल्डर प्रोजेक्ट उसके लिए खुलेंगे।')}</p>
      {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
      {rows.map(x => (
        <div key={x.userId} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3" data-testid="rera-claim">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">{x.name}{x.company ? <span className="font-normal text-slate-500"> · {x.company}</span> : null}</p>
            <p className="text-xs text-slate-500">{x.city || '—'} · {tx('sent', 'भेजा')} {day(x.at, hi)} · {x.idChecked ? tx('ID seen', 'ID देखी') : tx('ID not yet seen', 'ID अभी देखी नहीं')}</p>
            <p className="mt-1 break-all font-mono text-sm font-semibold text-slate-900">{x.number}</p>
          </div>
          {no === x.userId ? (
            <div className="space-y-2">
              <input value={why[x.userId] || ''} onChange={e => setWhy({ ...why, [x.userId]: e.target.value })} maxLength={200} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" data-testid="rera-why"
                placeholder={tx('Why (the broker sees this) — e.g. number not on the portal', 'कारण (ब्रोकर को दिखेगा) — जैसे पोर्टल पर नंबर नहीं मिला')} />
              <div className="flex gap-2">
                <button type="button" disabled={!!busy || (why[x.userId] || '').trim().length < 5} onClick={() => decide(x.userId, false)} className={`${btn} border border-red-300 bg-white text-red-700`} data-testid="rera-reject">{tx('Send back', 'वापस भेजें')}</button>
                <button type="button" onClick={() => setNo('')} className={`${btn} border border-slate-300 bg-white text-slate-700`}>{tx('Cancel', 'रद्द')}</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!!busy} onClick={() => decide(x.userId, true)} className={`${btn} bg-emerald-600 text-white`} data-testid="rera-approve">
                {busy === x.userId ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{tx('Checked — make Tier 1', 'जाँच लिया — Tier 1 बनाएँ')}
              </button>
              <button type="button" disabled={!!busy} onClick={() => setNo(x.userId)} className={`${btn} border border-slate-300 bg-white text-slate-700`}>{tx('Not found', 'नहीं मिला')}</button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
};
