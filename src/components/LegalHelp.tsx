import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Scale, ShieldCheck, FileText, Send, Phone, AlertTriangle, CheckCircle2, XCircle, Clock, Users, IndianRupee, Lock } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { stateNames, findState } from '../shared/india.js';
import { HELP_TYPES, NEVER_SHARE, helpTypeInfo } from '../shared/legalRules.js';
import { MyPlanFees } from './PlansFees.js';
import type { UserProfile } from '../types/index.js';

/** v22 — Legal Help screens: the broker's panel inside a deal room, the counsellor's desk, and GENZ's admin view. */

const inp = 'min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
const btn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-40';
const dark = `${btn} bg-slate-900 text-white`; const ghost = `${btn} border border-slate-300 bg-white text-slate-700`;
const green = `${btn} bg-emerald-600 text-white`; const red = `${btn} border border-red-300 bg-white text-red-700`;
const card = 'rounded-xl border border-slate-200 bg-white p-4';
const inr = (n?: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const d0 = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const dt = (iso?: string | null) => iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const ping = () => { try { window.dispatchEvent(new Event('genz:legal-changed')); } catch { /* old browser */ } };

const STATUS: Record<string, [string, string, string]> = {
  OPEN: ['Waiting for a counsellor', 'काउंसलर का इंतज़ार', 'bg-amber-100 text-amber-800'],
  CLAIMED: ['Counsellor is preparing a fee', 'काउंसलर फ़ीस तैयार कर रहा है', 'bg-sky-100 text-sky-800'],
  QUOTED: ['Fee quoted — your answer needed', 'फ़ीस आई — आपका जवाब चाहिए', 'bg-violet-100 text-violet-800'],
  ACCEPTED: ['In progress', 'काम चालू है', 'bg-emerald-100 text-emerald-800'],
  COMPLETED: ['Completed', 'पूरा हुआ', 'bg-slate-200 text-slate-700'],
  CANCELLED: ['Cancelled', 'रद्द', 'bg-slate-100 text-slate-500'],
};
/** v28 — the counsellor's own words for the same status (the broker's "your answer needed" is not his job) */
const STATUS_COUNSELLOR: Record<string, [string, string, string]> = {
  CLAIMED: ['Your case — quote your fee', 'आपका केस — अपनी फ़ीस बताइए', 'bg-sky-100 text-sky-800'],
  QUOTED: ['Fee sent — waiting for the broker', 'फ़ीस भेजी — ब्रोकर के जवाब का इंतज़ार', 'bg-violet-100 text-violet-800'],
};
const Chip: React.FC<{ status: string; who?: 'broker' | 'counsellor' | 'admin' }> = ({ status, who }) => {
  const tx = useTx(); const s = (who === 'counsellor' && STATUS_COUNSELLOR[status]) || STATUS[status] || [status, status, 'bg-slate-100 text-slate-600'];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s[2]}`}>{tx(s[0], s[1])}</span>;
};

function useToast() {
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const say = (ok: boolean, msg: string) => { setToast({ ok, msg }); window.setTimeout(() => setToast(null), 6000); };
  const view = toast && <div role="status" className={`rounded-lg p-3 text-sm ${toast.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{toast.msg}</div>;
  return { say, view };
}

// ───────────────────────────── one case, as each side sees it ─────────────────────────────
type Who = 'broker' | 'counsellor' | 'admin';
const CaseCard: React.FC<{ r: any; who: Who; canDecide?: boolean; onClaimed?: () => void; run: (fn: () => Promise<any>, ok: string) => void; busy: boolean }> = ({ r, who, canDecide, onClaimed, run, busy }) => {
  const tx = useTx(); const ht = helpTypeInfo(r.helpType);
  const [amount, setAmount] = useState(r.quote?.amount ? String(r.quote.amount) : ''); const [days, setDays] = useState(r.quote?.days ? String(r.quote.days) : ''); const [note, setNote] = useState('');
  const [msg, setMsg] = useState(''); const [rep, setRep] = useState(''); const [showRep, setShowRep] = useState(false); const [decNote, setDecNote] = useState('');
  const open = who === 'counsellor' || who === 'admin' || ['CLAIMED', 'QUOTED', 'ACCEPTED', 'COMPLETED'].includes(r.status);
  const canTalk = who !== 'admin' && ['CLAIMED', 'QUOTED', 'ACCEPTED', 'COMPLETED'].includes(r.status);
  return (
    <div className={card} data-testid={`legal-case-${r.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold text-slate-900">{ht ? tx(ht.en, ht.hi) : r.helpType} <span className="font-normal text-slate-500">· {r.state}{r.city ? `, ${r.city}` : ''}</span></div>
        <Chip status={r.status} who={who} />
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{r.description}</p>
      {r.detailsShared?.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-slate-600">{r.detailsShared.map((d: string) => <li key={d}>{d}</li>)}</ul>}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>{r.id}</span><span>{dt(r.createdAt)}</span>
        {r.propertyType && <span>{r.propertyType}</span>}
        {who !== 'counsellor' && r.sharedDocCount > 0 && <span>{r.sharedDocCount} {tx('paper(s) offered', 'काग़ज़ दिखाने को चुने')}</span>}
        {r.requestedBy && who !== 'broker' && <span>{tx('Asked by', 'माँगने वाला')}: <strong>{r.requestedBy.name}</strong></span>}
        {r.counsellor && who !== 'counsellor' && <span>{tx('Counsellor', 'काउंसलर')}: <strong>{r.counsellor.name}</strong></span>}
        {r.respondBy && <span className="inline-flex items-center gap-1 text-amber-700"><Clock className="h-3 w-3" />{tx('answer by', 'जवाब की समय-सीमा')} {dt(r.respondBy)}</span>}
      </div>

      {r.quote && (
        <div className="mt-3 rounded-lg bg-violet-50 p-3 text-sm" data-testid="legal-quote">
          <div className="font-semibold text-violet-900">{tx('Counsellor’s fee', 'काउंसलर की फ़ीस')}: {inr(r.quote.amount)}{r.quote.days ? ` · ${r.quote.days} ${tx('day(s)', 'दिन')}` : ''}</div>
          {r.quote.note && <div className="text-xs text-violet-800">{r.quote.note}</div>}
          {who === 'broker' && <div className="mt-1 text-xs text-slate-600">{tx('This is the final fee you pay the counsellor directly. GENZ adds nothing to it.', 'यह वही अंतिम फ़ीस है जो आप सीधे काउंसलर को देंगे। GENZ इसमें कुछ नहीं जोड़ता।')}</div>}
          {who === 'counsellor' && r.platformFee !== undefined && <div className="mt-1 text-xs text-slate-600">{tx('GENZ platform fee for this case', 'इस केस की GENZ प्लेटफ़ॉर्म फ़ीस')}: <strong>{inr(r.platformFee)}</strong></div>}
        </div>
      )}

      {(r.docs?.length > 0) && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs">
          <div className="mb-1 font-semibold text-slate-700">{tx('Papers shown to the counsellor (view only, ends when the case is completed)', 'काउंसलर को दिखाए गए काग़ज़ (सिर्फ़ देखने के लिए, केस पूरा होते ही बंद)')}</div>
          <ul className="list-disc pl-5 text-slate-600">{r.docs.map((d: any) => <li key={d.id}>{d.title} <span className="text-slate-400">({d.fileName})</span></li>)}</ul>
          {who === 'counsellor' && <div className="mt-1 text-slate-500">{tx('Open them from the Property Papers tab.', 'इन्हें “प्रॉपर्टी पेपर्स” टैब से खोलिए।')}</div>}
        </div>
      )}

      {r.contact && (
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-emerald-50 p-3 text-sm" data-testid="legal-contact">
          <Phone className="h-4 w-4 text-emerald-700" />
          {who !== 'broker' && <span>{r.contact.broker?.name}: <strong>{r.contact.broker?.phone}</strong></span>}
          {who !== 'counsellor' && <span>{r.contact.counsellor?.name}: <strong>{r.contact.counsellor?.phone}</strong></span>}
        </div>
      )}

      {r.bypassReport && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800" data-testid="legal-bypass">
          <div className="font-bold"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{tx('Bypass report', 'बायपास रिपोर्ट')} · {r.bypassReport.status}</div>
          {who !== 'counsellor' && <p className="mt-1">{r.bypassReport.description}</p>}
          {r.bypassReport.decisionNote && <p className="mt-1 italic">{r.bypassReport.decisionNote}</p>}
          {who === 'admin' && canDecide && r.bypassReport.status === 'OPEN' && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input className={`${inp} max-w-sm`} placeholder={tx('Your note (5+ characters)', 'आपका नोट (5+ अक्षर)')} value={decNote} onChange={e => setDecNote(e.target.value)} />
              <button type="button" className={red} disabled={busy} onClick={() => run(() => api.legalAct(r.id, 'bypass-decision', { decision: 'UPHELD', note: decNote }), tx('Upheld — strike added', 'माना गया — स्ट्राइक जुड़ा'))}>{tx('Uphold (strike)', 'सही माना (स्ट्राइक)')}</button>
              <button type="button" className={ghost} disabled={busy} onClick={() => run(() => api.legalAct(r.id, 'bypass-decision', { decision: 'DISMISSED', note: decNote }), tx('Dismissed', 'ख़ारिज'))}>{tx('Dismiss', 'ख़ारिज करें')}</button>
            </div>
          )}
        </div>
      )}

      {open && r.messages?.length > 0 && (
        <div className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs">
          {r.messages.map((m: any, i: number) => <div key={i}><span className="font-semibold text-slate-700">{m.role === 'LEGAL_COUNSEL' ? tx('Counsellor', 'काउंसलर') : tx('Broker', 'ब्रोकर')}</span> <span className="text-slate-400">{dt(m.at)}</span><div className="text-slate-700">{m.text}</div></div>)}
        </div>
      )}
      {canTalk && (
        <div className="mt-2 flex gap-2">
          <input className={inp} placeholder={r.status === 'ACCEPTED' ? tx('Write a message', 'संदेश लिखिए') : tx('Write a message (phone numbers are hidden until the fee is accepted)', 'संदेश लिखिए (फ़ीस मंज़ूर होने तक फ़ोन नंबर छिपे रहते हैं)')} value={msg} onChange={e => setMsg(e.target.value)} maxLength={1000} />
          <button type="button" className={ghost} disabled={busy || !msg.trim()} aria-label={tx('Send', 'भेजें')} onClick={() => run(async () => { await api.legalAct(r.id, 'messages', { text: msg }); setMsg(''); }, tx('Sent', 'भेज दिया'))}><Send className="h-4 w-4" /></button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {who === 'counsellor' && r.status === 'OPEN' && <button type="button" className={dark} disabled={busy} onClick={() => run(async () => { await api.legalAct(r.id, 'claim'); onClaimed?.(); }, tx('You took this case — now quote your fee', 'यह केस आपका हुआ — अब अपनी फ़ीस बताइए'))}>{tx('Take this case (first come, first served)', 'यह केस लें (पहले आओ पहले पाओ)')}</button>}
        {who === 'counsellor' && (r.status === 'CLAIMED' || r.status === 'QUOTED') && (
          <div className="flex w-full flex-wrap items-end gap-2">
            <label className="text-xs">{tx('Your fee (₹)', 'आपकी फ़ीस (₹)')}<input className={`${inp} w-32`} inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ''))} /></label>
            <label className="text-xs">{tx('Days', 'दिन')}<input className={`${inp} w-20`} inputMode="numeric" value={days} onChange={e => setDays(e.target.value.replace(/\D/g, ''))} /></label>
            <label className="min-w-40 flex-1 text-xs">{tx('What the fee covers', 'फ़ीस में क्या शामिल है')}<input className={inp} value={note} onChange={e => setNote(e.target.value)} maxLength={600} /></label>
            <button type="button" className={dark} disabled={busy || !amount} onClick={() => run(() => api.legalAct(r.id, 'quote', { amount: Number(amount), days: days ? Number(days) : undefined, note: note || undefined }), tx('Fee sent to the broker', 'फ़ीस ब्रोकर को भेज दी'))}>{r.status === 'QUOTED' ? tx('Update fee', 'फ़ीस बदलें') : tx('Send fee', 'फ़ीस भेजें')}</button>
            <button type="button" className={ghost} disabled={busy} onClick={() => run(() => api.legalAct(r.id, 'release'), tx('Given back to the pool', 'वापस पूल में दे दिया'))}>{tx('Give back', 'वापस करें')}</button>
          </div>
        )}
        {who === 'broker' && r.status === 'QUOTED' && (
          <>
            <button type="button" className={green} disabled={busy} onClick={() => run(() => api.legalAct(r.id, 'accept'), tx('Accepted — phone numbers are open now', 'मंज़ूर — अब फ़ोन नंबर खुल गए'))}><CheckCircle2 className="h-4 w-4" />{tx('Accept this fee', 'यह फ़ीस मंज़ूर')}</button>
            <button type="button" className={red} disabled={busy} onClick={() => run(() => api.legalAct(r.id, 'decline'), tx('Declined — the case goes to the next counsellor', 'मना किया — केस अगले काउंसलर के पास गया'))}><XCircle className="h-4 w-4" />{tx('Decline', 'मना करें')}</button>
          </>
        )}
        {who === 'broker' && ['OPEN', 'CLAIMED', 'QUOTED'].includes(r.status) && <button type="button" className={ghost} disabled={busy} onClick={() => run(() => api.legalAct(r.id, 'cancel'), tx('Request cancelled', 'माँग रद्द'))}>{tx('Cancel request', 'माँग रद्द करें')}</button>}
        {who !== 'admin' && r.status === 'ACCEPTED' && <button type="button" className={ghost} disabled={busy} onClick={() => run(() => api.legalAct(r.id, 'complete'), tx('Marked complete — papers closed', 'पूरा माना — काग़ज़ बंद'))}>{tx('Mark complete', 'पूरा हुआ')}</button>}
        {who === 'broker' && ['QUOTED', 'ACCEPTED', 'COMPLETED'].includes(r.status) && !(r.bypassReport && r.bypassReport.status === 'OPEN') && <button type="button" className={ghost} onClick={() => setShowRep(v => !v)}>{tx('Report: asked to go outside GENZ', 'रिपोर्ट: GENZ के बाहर जाने को कहा')}</button>}
      </div>
      {showRep && who === 'broker' && (
        <div className="mt-2 space-y-2">
          <textarea className={inp} rows={3} placeholder={tx('What happened? (15+ characters). GENZ reviews it — your deal room is not opened.', 'क्या हुआ? (15+ अक्षर)। GENZ इसे देखेगा — आपका डील रूम नहीं खुलेगा।')} value={rep} onChange={e => setRep(e.target.value)} maxLength={1000} />
          <button type="button" className={red} disabled={busy || rep.trim().length < 15} onClick={() => run(async () => { await api.legalAct(r.id, 'report-bypass', { description: rep }); setShowRep(false); setRep(''); }, tx('Report sent to GENZ', 'रिपोर्ट GENZ को भेजी'))}>{tx('Send report', 'रिपोर्ट भेजें')}</button>
        </div>
      )}
    </div>
  );
};

// ───────────────────────────── broker: inside the deal room ─────────────────────────────
export const LegalHelpPanel: React.FC<{ dealId: string }> = ({ dealId }) => {
  const tx = useTx(); const { say, view } = useToast();
  const [ctx, setCtx] = useState<any>(null); const [err, setErr] = useState('');
  const [state, setState] = useState(''); const [type, setType] = useState(''); const [desc, setDesc] = useState('');
  const [have, setHave] = useState<Set<string>>(new Set()); const [docs, setDocs] = useState<Set<string>>(new Set()); const [busy, setBusy] = useState(false);
  const load = useCallback(() => { api.legalContext(dealId).then(c => { setCtx(c); setState(s => s || c.state || ''); setErr(''); }).catch(e => setErr(e.message)); }, [dealId]);
  useEffect(() => { setCtx(null); setType(''); setDesc(''); setHave(new Set()); setDocs(new Set()); setState(''); load(); }, [dealId, load]);
  const info = type ? helpTypeInfo(type) : undefined;
  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try { await fn(); say(true, ok); load(); ping(); } catch (e: any) { say(false, e.message || 'Failed'); } finally { setBusy(false); }
  };
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); setter(n); };
  const submit = () => run(async () => {
    const r = await api.legalRaise({ dealId, state: state || undefined, helpType: type, description: desc, detailsShared: [...have].map(h => `${tx('I have', 'मेरे पास है')}: ${h}`), sharedDocIds: [...docs] });
    setType(''); setDesc(''); setHave(new Set()); setDocs(new Set());
    if (r.phoneMasked) say(true, tx('Sent. A phone number in your text was hidden — numbers open after the fee is accepted.', 'भेज दिया। आपके लिखे में फ़ोन नंबर छिपा दिया गया — नंबर फ़ीस मंज़ूर होने के बाद खुलते हैं।'));
  }, tx('Request sent to GENZ’s legal panel of that state', 'उस राज्य के GENZ लीगल पैनल को माँग भेज दी'));

  if (err && !ctx) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (!ctx) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" />;
  const stateOk = !!findState(state);
  const gated: string | null = ctx.membersOnly || null;
  return (
    <div className="space-y-4" data-testid="legal-help-panel">
      <div className="rounded-xl bg-slate-900 p-4 text-white">
        <div className="flex items-center gap-2 text-sm font-bold"><Scale className="h-4 w-4 text-amber-400" />{tx('Legal help from GENZ’s panel', 'GENZ के पैनल से क़ानूनी मदद')}</div>
        <p className="mt-1 text-xs text-slate-300">{tx('Tell the panel of this property’s state what you need. The first counsellor to take it quotes a fee; you accept or decline. The counsellor never enters your deal room — only what you tick below reaches him.', 'इस प्रॉपर्टी के राज्य के पैनल को बताइए कि क्या चाहिए। जो काउंसलर पहले केस लेगा वह फ़ीस बताएगा; आप मंज़ूर या मना कर सकते हैं। काउंसलर आपके डील रूम में कभी नहीं आता — सिर्फ़ वही पहुँचता है जो आप नीचे चुनें।')}</p>
      </div>
      {view}
      {gated && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" data-testid="legal-members-only"><Lock className="mr-1 inline h-4 w-4" />{tx('Legal help is for GENZ members right now.', 'अभी लीगल मदद सिर्फ़ GENZ सदस्यों के लिए है।')} <button type="button" className="font-semibold underline" onClick={() => { try { window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: 'plans' })); } catch { /* old browser */ } }}>{tx('See plans', 'प्लान देखें')}</button></p>}

      <div className={`${card} space-y-4`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-700">{tx('State of the property', 'प्रॉपर्टी का राज्य')}
            <select className={`${inp} mt-1`} value={state} onChange={e => setState(e.target.value)} data-testid="legal-state">
              {!state && <option value="">{tx('Select the state', 'राज्य चुनिए')}</option>}
              {stateNames().map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="mt-1 block text-xs font-normal text-slate-500">{ctx.stateFromProperty ? tx('Filled from this deal’s property. Change it only if the work happens in another state (e.g. registration).', 'इस डील की प्रॉपर्टी से भरा गया। सिर्फ़ तब बदलें जब काम दूसरे राज्य में होना हो (जैसे रजिस्ट्री)।') : tx('We could not read the state from the property — please select it.', 'प्रॉपर्टी से राज्य नहीं मिला — कृपया चुनिए।')}</span>
          </label>
          {ctx.propertyType && <div className="text-xs text-slate-600"><div className="font-semibold text-slate-700">{tx('Property', 'प्रॉपर्टी')}</div><div className="mt-2">{ctx.propertyType}{ctx.city ? ` · ${ctx.city}` : ''}</div></div>}
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold text-slate-700">{tx('What kind of help?', 'किस तरह की मदद?')}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {HELP_TYPES.map(h => (
              <button key={h.id} type="button" onClick={() => { setType(h.id); setHave(new Set()); }} aria-pressed={type === h.id}
                className={`rounded-lg border p-3 text-left text-xs ${type === h.id ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-400'}`}>
                <div className="font-semibold text-slate-900">{tx(h.en, h.hi)}</div>
                <div className="mt-0.5 text-slate-500">{tx(h.whenEn, h.whenHi)}</div>
              </button>
            ))}
          </div>
        </div>

        {info && (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3" data-testid="legal-what-to-share">
            <div>
              <div className="text-xs font-bold text-slate-800"><FileText className="mr-1 inline h-3.5 w-3.5" />{tx('Papers the counsellor will usually ask for — tick the ones you have', 'काउंसलर आम तौर पर ये काग़ज़ माँगेगा — जो आपके पास हों उन पर टिक कीजिए')}</div>
              <div className="mt-1 space-y-1">{info.papers.map(p => (
                <label key={p.en} className="flex min-h-9 items-center gap-2 text-xs text-slate-700"><input type="checkbox" className="h-4 w-4" checked={have.has(p.en)} onChange={() => toggle(have, setHave, p.en)} />{tx(p.en, p.hi)}</label>
              ))}</div>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800">{tx('Write these in your description', 'अपने विवरण में ये लिखिए')}</div>
              <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">{info.details.map(p => <li key={p.en}>{tx(p.en, p.hi)}</li>)}</ul>
            </div>
            {ctx.docs?.length > 0 && (
              <div>
                <div className="text-xs font-bold text-slate-800"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />{tx('Show these papers of yours to the counsellor (after you accept his fee; view-only; ends when the case is completed)', 'अपने ये काग़ज़ काउंसलर को दिखाइए (उसकी फ़ीस मंज़ूर करने के बाद; सिर्फ़ देखने के लिए; केस पूरा होते ही बंद)')}</div>
                <div className="mt-1 space-y-1">{ctx.docs.map((d: any) => (
                  <label key={d.id} className="flex min-h-9 items-center gap-2 text-xs text-slate-700"><input type="checkbox" className="h-4 w-4" checked={docs.has(d.id)} onChange={() => toggle(docs, setDocs, d.id)} />{d.title} <span className="text-slate-400">({d.fileName})</span></label>
                ))}</div>
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg border border-red-200 bg-red-50 p-3" data-testid="legal-never-share">
          <div className="text-xs font-bold text-red-800"><Lock className="mr-1 inline h-3.5 w-3.5" />{tx('Never put these in the request', 'ये कभी माँग में न डालें')}</div>
          <ul className="mt-1 list-disc pl-5 text-xs text-red-800">{NEVER_SHARE.map(n => <li key={n.en}>{tx(n.en, n.hi)}</li>)}</ul>
        </div>

        <label className="block text-xs font-semibold text-slate-700">{tx('Describe what you need', 'बताइए आपको क्या चाहिए')}
          <textarea className={`${inp} mt-1`} rows={4} maxLength={1200} value={desc} onChange={e => setDesc(e.target.value)} data-testid="legal-desc" />
          <span className="text-xs font-normal text-slate-500">{desc.trim().length}/1200 · {tx('at least 15 characters. GENZ admins and the panel of this state can read this text.', 'कम से कम 15 अक्षर। GENZ एडमिन और इस राज्य का पैनल यह लिखा हुआ पढ़ सकते हैं।')}</span>
        </label>
        <button type="button" className={dark} disabled={busy || !!gated || !type || !stateOk || desc.trim().length < 15} onClick={submit} data-testid="legal-submit">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{tx('Send to the legal panel', 'लीगल पैनल को भेजें')}
        </button>
      </div>

      {ctx.requests?.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-bold text-slate-800">{tx('Your legal-help requests for this deal', 'इस डील की आपकी लीगल-मदद माँगें')}</div>
          {ctx.requests.slice().reverse().map((r: any) => <CaseCard key={r.id} r={r} who="broker" run={run} busy={busy} />)}
        </div>
      )}
    </div>
  );
};

// ───────────────────────────── states picker ─────────────────────────────
const StatePicker: React.FC<{ value: string[]; onChange: (v: string[]) => void; max?: number }> = ({ value, onChange, max = 8 }) => {
  const tx = useTx();
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">{value.map(s => <button key={s} type="button" className="rounded-full bg-slate-900 px-2.5 py-1 text-xs text-white" onClick={() => onChange(value.filter(x => x !== s))} aria-label={`${tx('Remove', 'हटाएँ')} ${s}`}>{s} ×</button>)}</div>
      <select className={`${inp} mt-2 max-w-xs`} value="" onChange={e => { const v = e.target.value; if (v && !value.includes(v) && value.length < max) onChange([...value, v]); }} aria-label={tx('Add a state', 'राज्य जोड़ें')}>
        <option value="">{tx('Add a state…', 'राज्य जोड़िए…')}</option>
        {stateNames().filter(s => !value.includes(s)).map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
};

// ───────────────────────────── counsellor's desk ─────────────────────────────
const LegalDesk: React.FC = () => {
  const tx = useTx(); const { say, view } = useToast();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [states, setStates] = useState<string[] | null>(null);
  const [part, setPart] = useState<'pool' | 'cases' | 'fees'>('pool');
  const load = useCallback(() => { api.legalDesk().then(r => { setD(r); setErr(''); }).catch(e => setErr(e.message)); }, []);
  useEffect(() => { load(); const t = window.setInterval(load, 60_000); return () => window.clearInterval(t); }, [load]);
  const run = async (fn: () => Promise<any>, ok: string) => { setBusy(true); try { await fn(); say(true, ok); load(); ping(); } catch (e: any) { say(false, e.message || 'Failed'); load(); } finally { setBusy(false); } };
  if (err && !d) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (!d) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" />;
  const live = d.cases.filter((c: any) => ['CLAIMED', 'QUOTED', 'ACCEPTED'].includes(c.status));
  const tile = (id: typeof part, n: number | string, en: string, hi: string) => (
    <button type="button" onClick={() => setPart(id)} aria-pressed={part === id} className={`rounded-xl border p-3 text-left ${part === id ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200'} bg-white`}><div className="text-2xl font-bold text-slate-900">{n}</div><div className="text-xs text-slate-500">{tx(en, hi)}</div></button>
  );
  const myStates = states ?? d.profile.states;
  return (
    <div className="space-y-4" data-testid="legal-desk">
      <div className="flex items-center gap-2 text-lg font-bold text-slate-900"><Scale className="h-5 w-5" />{tx('Legal Desk', 'लीगल डेस्क')}</div>
      {view}
      {d.blocked && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" data-testid="legal-blocked">{d.blocked}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tile('pool', d.pool.length, 'Open in your states', 'आपके राज्यों में खुले')}
        {tile('cases', live.length, 'Your live cases', 'आपके चालू केस')}
        {tile('fees', d.owed, 'GENZ fees due · membership', 'बकाया GENZ फ़ीस · मेंबरशिप')}
      </div>

      <div className={card}>
        <div className="mb-1 text-sm font-bold text-slate-900"><Users className="mr-1 inline h-4 w-4" />{tx('States you work in', 'आप जिन राज्यों में काम करते हैं')}</div>
        <p className="mb-2 text-xs text-slate-500">{tx('You see and can take only requests from these states.', 'आप सिर्फ़ इन राज्यों की माँगें देख और ले सकते हैं।')}</p>
        <StatePicker value={myStates} onChange={setStates} />
        {states && <button type="button" className={`${dark} mt-2`} disabled={busy || !states.length} onClick={() => run(async () => { await api.legalProfileSave(states); setStates(null); }, tx('States saved', 'राज्य सहेजे'))}>{tx('Save states', 'राज्य सहेजें')}</button>}
        {d.profile.strikes > 0 && <p className="mt-2 text-xs text-red-700">{tx('Strikes', 'स्ट्राइक')}: {d.profile.strikes}</p>}
      </div>

      {part === 'pool' && (
        <div className="space-y-3">
          {d.pool.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{tx('No open request in your states right now.', 'अभी आपके राज्यों में कोई खुली माँग नहीं है।')}</p>}
          {d.pool.map((r: any) => <CaseCard key={r.id} r={r} who="counsellor" onClaimed={() => setPart('cases')} run={run} busy={busy || !!d.blocked} />)}
        </div>
      )}
      {part === 'cases' && (
        <div className="space-y-3">
          {d.cases.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{tx('You have not taken a case yet.', 'आपने अभी कोई केस नहीं लिया।')}</p>}
          {d.cases.map((r: any) => <CaseCard key={r.id} r={r} who="counsellor" run={run} busy={busy} />)}
        </div>
      )}
      {part === 'fees' && <MyPlanFees embedded />}
    </div>
  );
};

// ───────────────────────────── GENZ admin / superadmin ─────────────────────────────
const SETTING_FIELDS: [string, string, string][] = [
  ['claimHours', 'Hours to quote after taking a case', 'केस लेने के बाद फ़ीस बताने के घंटे'],
  ['quoteHours', 'Hours for the broker to answer', 'ब्रोकर के जवाब के घंटे'],
  ['maxStrikes', 'Strikes before removal', 'हटाने से पहले स्ट्राइक'],
];
const LegalAdmin: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const tx = useTx(); const { say, view } = useToast();
  const [a, setA] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [part, setPart] = useState<'requests' | 'bypass' | 'fees' | 'panel' | 'settings'>('requests');
  const [form, setForm] = useState<Record<string, string> | null>(null); const [reason, setReason] = useState('');
  const load = useCallback(() => { api.legalAdmin().then(r => { setA(r); setErr(''); }).catch(e => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);
  const run = async (fn: () => Promise<any>, ok: string) => { setBusy(true); try { await fn(); say(true, ok); load(); ping(); } catch (e: any) { say(false, e.message || 'Failed'); } finally { setBusy(false); } };
  const reqs = useMemo(() => a?.requests || [], [a]);
  if (err && !a) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (!a) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" />;
  const t = a.totals; const superadmin = currentUser.role === 'SUPERADMIN';
  const tile = (id: typeof part, n: number | string, en: string, hi: string, hot = false) => (
    <button type="button" onClick={() => setPart(id)} aria-pressed={part === id} className={`rounded-xl border p-3 text-left ${part === id ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200'} ${hot ? 'bg-amber-50' : 'bg-white'}`} data-testid={`legal-tile-${id}`}><div className="text-2xl font-bold text-slate-900">{n}</div><div className="text-xs text-slate-500">{tx(en, hi)}</div></button>
  );
  const f = form ?? Object.fromEntries(SETTING_FIELDS.map(([k]) => [k, String(a.settings[k])]));
  return (
    <div className="space-y-4" data-testid="legal-admin">
      <div className="flex items-center gap-2 text-lg font-bold text-slate-900"><Scale className="h-5 w-5" />{tx('Legal Help — GENZ panel', 'लीगल हेल्प — GENZ पैनल')}</div>
      {view}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tile('requests', `${t.open} / ${t.live}`, 'Open / in progress', 'खुली / चालू')}
        {tile('bypass', t.bypassOpen, 'Bypass reports', 'बायपास रिपोर्ट', t.bypassOpen > 0)}
        {tile('fees', `${t.toConfirm} · ${inr(t.feesReceived)}`, 'Legal fees: to confirm · received', 'लीगल फ़ीस: पक्का करना · मिली', t.toConfirm > 0)}
        {tile('panel', a.counsellors.length, 'Counsellors', 'काउंसलर')}
        {tile('settings', `${a.settings.claimHours}h / ${a.settings.quoteHours}h`, 'Time limits & strikes', 'समय-सीमा और स्ट्राइक')}
      </div>
      {a.uncovered.length > 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" data-testid="legal-uncovered"><AlertTriangle className="mr-1 inline h-4 w-4" />{tx('No counsellor covers', 'इन राज्यों में कोई काउंसलर नहीं')}: {a.uncovered.map((u: any) => `${u.state} (${u.open})`).join(', ')}</p>}

      {part === 'requests' && <div className="space-y-3">{reqs.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{tx('No legal-help request yet.', 'अभी कोई लीगल-मदद माँग नहीं।')}</p>}{reqs.map((r: any) => <CaseCard key={r.id} r={r} who="admin" canDecide run={run} busy={busy} />)}</div>}
      {part === 'bypass' && <div className="space-y-3">{reqs.filter((r: any) => r.bypassReport).length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{tx('No bypass report.', 'कोई बायपास रिपोर्ट नहीं।')}</p>}{reqs.filter((r: any) => r.bypassReport).map((r: any) => <CaseCard key={r.id} r={r} who="admin" canDecide run={run} busy={busy} />)}</div>}
      {part === 'fees' && (
        <div className={card} data-testid="legal-fees-moved">
          <p className="text-sm text-slate-700">{tx('Legal fees and memberships are now set and confirmed in Plans & Fees — one place for every GENZ fee (flat or %, per group, state or person).', 'लीगल फ़ीस और मेंबरशिप अब “प्लान और फ़ीस” में तय और पक्की होती हैं — हर GENZ फ़ीस की एक जगह (तय या %, समूह, राज्य या व्यक्ति के हिसाब से)।')}</p>
          <p className="mt-1 text-xs text-slate-500">{tx('Due', 'देय')}: {inr(t.feesDue)} · {tx('to confirm', 'पक्का करना')}: {inr(t.feesToConfirm)} · {tx('received', 'मिली')}: {inr(t.feesReceived)}</p>
          <button type="button" className={`${dark} mt-3`} onClick={() => { try { window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: 'plans' })); } catch { /* old browser */ } }}>{tx('Open Plans & Fees', 'प्लान और फ़ीस खोलें')}</button>
        </div>
      )}
      {part === 'panel' && (
        <div className="space-y-3">
          {a.counsellors.map((c: any) => (
            <div key={c.id} className={card} data-testid={`legal-counsellor-${c.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-bold">{c.name} <span className="font-normal text-slate-500">{c.company}</span></div>
                <div className="flex gap-1.5 text-xs">{c.member && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">{tx('Member', 'सदस्य')}</span>}{c.removed && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">{tx('Removed', 'हटाया')}</span>}{c.feeOverdue && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{tx('Fee overdue', 'फ़ीस बकाया')}</span>}</div></div>
              <div className="mt-1 text-xs text-slate-600">{c.states.join(', ') || tx('No state set', 'कोई राज्य नहीं')} · {tx('strikes', 'स्ट्राइक')} {c.strikes} · {c.openCases} {tx('live', 'चालू')} · {c.doneCases} {tx('done', 'पूरे')}</div>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <input className={`${inp} max-w-xs`} placeholder={tx('Reason (5+ characters)', 'कारण (5+ अक्षर)')} value={reason} onChange={e => setReason(e.target.value)} />
                {c.removed
                  ? <button type="button" className={ghost} disabled={busy || reason.trim().length < 5} onClick={() => run(() => api.legalCounsellorPanel(c.id, 'RESTORE', reason), tx('Restored to the panel', 'पैनल में वापस'))}>{tx('Restore', 'वापस लाएँ')}</button>
                  : <button type="button" className={red} disabled={busy || reason.trim().length < 5} onClick={() => run(() => api.legalCounsellorPanel(c.id, 'REMOVE', reason), tx('Removed from the panel', 'पैनल से हटाया'))}>{tx('Remove from panel', 'पैनल से हटाएँ')}</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {part === 'settings' && (
        <div className={card} data-testid="legal-settings">
          <div className="mb-2 text-sm font-bold">{tx('Time limits and strikes', 'समय-सीमा और स्ट्राइक')}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {SETTING_FIELDS.map(([k, en, hi]) => (
              <label key={k} className="text-xs font-semibold text-slate-700">{tx(en, hi)}
                <input className={`${inp} mt-1`} inputMode="numeric" disabled={!a.canEdit} value={f[k]} onChange={e => setForm({ ...f, [k]: e.target.value.replace(/\D/g, '') })} />
              </label>
            ))}
          </div>
          {a.canEdit
            ? <button type="button" className={`${dark} mt-3`} disabled={busy || !form} onClick={() => run(async () => { await api.legalSettingsSave(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Number(v)]))); setForm(null); }, tx('Saved', 'सहेजा'))}>{tx('Save', 'सहेजें')}</button>
            : <p className="mt-3 text-xs text-slate-500"><Lock className="mr-1 inline h-3 w-3" />{tx('Only the superadmin can change these.', 'इन्हें सिर्फ़ सुपरएडमिन बदल सकता है।')}</p>}
          <p className="mt-2 text-xs text-slate-500">{tx('Fees and memberships: Plans & Fees tab.', 'फ़ीस और मेंबरशिप: “प्लान और फ़ीस” टैब।')}</p>
        </div>
      )}
    </div>
  );
};

/** The tab: a counsellor gets the desk, GENZ staff get the admin view. */
export const LegalHelpView: React.FC<{ currentUser: UserProfile; permissions: string[] }> = ({ currentUser, permissions }) => {
  if (permissions.includes('legal:manage')) return <LegalAdmin currentUser={currentUser} />;
  if (permissions.includes('legal:desk')) return <LegalDesk />;
  return null;
};
