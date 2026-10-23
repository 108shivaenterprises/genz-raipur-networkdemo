/**
 * v47 — on top of every deal room: close a deal that did not happen (ask → the other broker agrees / 7 days → closed; reopen),
 * and record a site visit that happened outside the app (the other side confirms; shown as NOT verified).
 */
import React, { useState } from 'react';
import { XCircle, RotateCcw, CalendarCheck, AlertTriangle, CheckCircle2, Loader2, MoreHorizontal } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { CLOSE_AUTO_DAYS, CLOSE_REASONS, isClosed, reasonText } from '../shared/dealClose.js';
import type { DealRoom, UserProfile } from '../types/index.js';

const inp = 'min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm';
const btn = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-40';
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const STAGES = ['Lead', 'Introduction', 'Site Visit Done', 'Negotiation', 'Agreement', 'Handover', 'Settled'];

export const DealStatusPanel: React.FC<{ deal: DealRoom; me: UserProfile; verifiedVisits: number; onChanged: () => void }> = ({ deal, me, verifiedVisits, onChanged }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const [mode, setMode] = useState<'' | 'close' | 'no' | 'reopen' | 'visit' | 'decline'>('');
  const [reason, setReason] = useState<string>('BUYER_BACKED_OUT'); const [note, setNote] = useState(''); const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [menu, setMenu] = useState(false);
  const isBroker = deal.introducingBrokerId === me.id || deal.closingBrokerId === me.id;
  const isOwner = deal.ownerId === me.id;
  if (!isBroker && !isOwner) return null;
  const oneBroker = deal.introducingBrokerId === deal.closingBrokerId;
  const run = async (fn: () => Promise<any>) => { setBusy(true); setErr(''); try { await fn(); setMode(''); setNote(''); onChanged(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const c = deal.closure || null; const ov = deal.offlineVisit || null;
  const closed = isClosed(deal);
  const stageIdx = STAGES.indexOf(deal.stage);
  const canVisitPath = !closed && stageIdx >= 0 && stageIdx < 2 && verifiedVisits === 0 && deal.stage !== 'Disputed';
  const iConfirmVisit = !!ov && !ov.confirmedAt && ov.byId !== me.id && (oneBroker ? isOwner : isBroker);

  return (
    <div className="space-y-2" data-testid="deal-status-panel">
      {/* ── closed / close request ── */}
      {closed && c && (
        <div className="rounded-xl border border-slate-300 bg-slate-100 p-3 text-xs text-slate-800" data-testid="deal-closed">
          <p className="flex items-center gap-1.5 text-sm font-bold"><XCircle className="h-4 w-4 text-slate-600" />{tx('Deal room closed — the deal did not happen', 'डील रूम बंद — डील नहीं हुई')}</p>
          <p className="mt-0.5">{reasonText(c.reason, hi)}{c.note ? ` — “${c.note}”` : ''} · {tx('asked by', 'कहा')} {c.byName} · {day(c.closedAt)} · {c.how === 'NO_REPLY' ? tx(`no reply in ${CLOSE_AUTO_DAYS} days`, `${CLOSE_AUTO_DAYS} दिन में जवाब नहीं`) : c.how === 'ONE_BROKER' ? tx('one-broker deal', 'एक ब्रोकर की डील') : tx('both agreed', 'दोनों सहमत')}</p>
          <p className="mt-0.5 text-[11px] text-slate-600">{tx('Buyer protection, the owner’s mandate and the anti-bypass rules still run on their own dates.', 'खरीदार सुरक्षा, मालिक का मैंडेट और एंटी-बायपास नियम अपनी तारीख़ों तक चालू रहते हैं।')}</p>
          {isBroker && mode !== 'reopen' && <button className={`${btn} mt-2 border border-slate-400 bg-white text-slate-800`} onClick={() => setMode('reopen')} data-testid="deal-reopen"><RotateCcw className="h-3.5 w-3.5" />{tx('Reopen', 'दोबारा खोलें')}</button>}
          {mode === 'reopen' && (
            <div className="mt-2 space-y-1.5">
              <input className={inp} placeholder={tx('Why reopen? (the other broker sees this)', 'क्यों खोल रहे हैं? (दूसरे ब्रोकर को दिखेगा)')} value={note} onChange={(e) => setNote(e.target.value)} data-testid="deal-reopen-note" />
              <div className="flex gap-2"><button className={`${btn} bg-slate-900 text-white`} disabled={busy || note.trim().length < 3} onClick={() => run(() => api.dealReopen(deal.id, note))} data-testid="deal-reopen-save">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{tx('Reopen the deal room', 'डील रूम खोलें')}</button><button className={`${btn} border border-slate-300 bg-white`} onClick={() => setMode('')}>{tx('Cancel', 'रद्द')}</button></div>
            </div>
          )}
        </div>
      )}
      {!closed && c?.status === 'ASKED' && isBroker && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950" data-testid="deal-close-asked">
          {c.byId === me.id ? (
            <>
              <p className="font-bold">{tx('You asked to close this deal room', 'आपने यह डील रूम बंद करने को कहा है')} — {reasonText(c.reason, hi)}</p>
              <p className="mt-0.5">{tx(`It closes on ${day(c.autoAt)} unless the other broker says the deal is still on.`, `${day(c.autoAt)} को यह अपने आप बंद हो जाएगा, अगर दूसरा ब्रोकर “डील चालू है” न कहे।`)}</p>
              <button className={`${btn} mt-2 border border-amber-400 bg-white text-amber-900`} disabled={busy} onClick={() => run(() => api.dealCloseWithdraw(deal.id))}>{tx('Take it back', 'वापस लें')}</button>
            </>
          ) : (
            <>
              <p className="font-bold"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{c.byName} {tx('wants to close this deal room', 'यह डील रूम बंद करना चाहते हैं')}: {reasonText(c.reason, hi)}{c.note ? ` — “${c.note}”` : ''}</p>
              <p className="mt-0.5">{tx(`If you do not answer, it closes on ${day(c.autoAt)}.`, `जवाब न देने पर ${day(c.autoAt)} को बंद हो जाएगा।`)}</p>
              {mode !== 'no' ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className={`${btn} bg-slate-900 text-white`} disabled={busy} onClick={() => run(() => api.dealCloseAnswer(deal.id, true))} data-testid="deal-close-agree">{tx('Yes, close it', 'हाँ, बंद करें')}</button>
                  <button className={`${btn} border border-emerald-500 bg-white text-emerald-800`} onClick={() => setMode('no')} data-testid="deal-close-refuse">{tx('No, the deal is still on', 'नहीं, डील चालू है')}</button>
                </div>
              ) : (
                <div className="mt-2 space-y-1.5">
                  <input className={inp} placeholder={tx('What is happening? (they see this)', 'क्या चल रहा है? (उन्हें दिखेगा)')} value={note} onChange={(e) => setNote(e.target.value)} />
                  <button className={`${btn} bg-emerald-700 text-white`} disabled={busy || note.trim().length < 3} onClick={() => run(() => api.dealCloseAnswer(deal.id, false, note))}>{tx('Keep it open', 'चालू रखें')}</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── a visit that happened outside the app ── */}
      {ov && (
        <div className={`rounded-xl border p-3 text-xs ${ov.confirmedAt ? 'border-slate-300 bg-white text-slate-700' : 'border-sky-300 bg-sky-50 text-sky-950'}`} data-testid="offline-visit">
          <p className="flex items-center gap-1.5 font-bold"><CalendarCheck className="h-4 w-4" />{tx('Visit outside the app', 'ऐप के बाहर हुई विज़िट')}: {day(ov.visitedOn)} · {ov.byName}
            {ov.confirmedAt && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">{tx('Confirmed by both — NOT verified', 'दोनों ने माना — वेरिफ़ाइड नहीं')}</span>}</p>
          <p className="mt-0.5">“{ov.note}”</p>
          {ov.confirmedAt
            ? <p className="mt-0.5 text-[11px] text-slate-500">{tx(`Confirmed by ${ov.confirmedByName}. No OTP / QR, so it gives no buyer protection.`, `${ov.confirmedByName} ने पुष्टि की। OTP / QR नहीं हुआ, इसलिए इससे खरीदार सुरक्षा नहीं मिलती।`)}</p>
            : ov.byId === me.id
              ? <div className="mt-1 flex items-center gap-2"><span>{tx('Waiting for the other side to confirm.', 'दूसरी तरफ़ की पुष्टि बाकी।')}</span><button className={`${btn} border border-sky-400 bg-white`} disabled={busy} onClick={() => run(() => api.offlineVisitAct(deal.id, 'withdraw'))}>{tx('Take back', 'वापस लें')}</button></div>
              : iConfirmVisit && (mode !== 'decline'
                ? <div className="mt-2 flex flex-wrap gap-2"><button className={`${btn} bg-slate-900 text-white`} disabled={busy} onClick={() => run(() => api.offlineVisitAct(deal.id, 'confirm'))} data-testid="offline-visit-confirm"><CheckCircle2 className="h-3.5 w-3.5" />{tx('Yes, the buyer saw the property', 'हाँ, खरीदार ने प्रॉपर्टी देखी')}</button><button className={`${btn} border border-red-300 bg-white text-red-700`} onClick={() => setMode('decline')}>{tx('No', 'नहीं')}</button></div>
                : <div className="mt-2 space-y-1.5"><input className={inp} placeholder={tx('Why not? (they see this)', 'क्यों नहीं? (उन्हें दिखेगा)')} value={note} onChange={(e) => setNote(e.target.value)} /><button className={`${btn} bg-red-600 text-white`} disabled={busy || note.trim().length < 3} onClick={() => run(() => api.offlineVisitAct(deal.id, 'decline', note))}>{tx('Not confirmed', 'पुष्टि नहीं')}</button></div>)}
        </div>
      )}

      {/* ── actions (v52: tucked behind one button so the top of the deal room stays calm) ── */}
      {isBroker && !closed && ((canVisitPath && !ov && mode !== 'visit') || (deal.stage !== 'Settled' && !c && mode !== 'close')) && (
        <div>
          <button type="button" onClick={() => setMenu(o => !o)} aria-expanded={menu} className={`${btn} border border-slate-300 bg-white text-slate-700`} data-testid="deal-actions-more"><MoreHorizontal className="h-4 w-4" />{tx('More actions', 'और कार्रवाई')}</button>
          {menu && (
            <div className="mt-2 flex flex-wrap gap-2">
          {canVisitPath && !ov && mode !== 'visit' && <button className={`${btn} border border-sky-300 bg-sky-50 text-sky-900`} onClick={() => { setMode('visit'); setMenu(false); }} data-testid="offline-visit-open"><CalendarCheck className="h-3.5 w-3.5" />{tx('Visit already happened outside the app?', 'विज़िट ऐप के बाहर हो चुकी?')}</button>}
          {deal.stage !== 'Settled' && !c && mode !== 'close' && <button className={`${btn} border border-slate-300 bg-white text-slate-700`} onClick={() => { setMode('close'); setMenu(false); }} data-testid="deal-close-open"><XCircle className="h-3.5 w-3.5" />{tx('Deal did not happen — close', 'डील नहीं हुई — बंद करें')}</button>}
            </div>
          )}
        </div>
      )}
      {mode === 'visit' && (
        <div className="space-y-1.5 rounded-xl border border-sky-200 bg-white p-3 text-xs" data-testid="offline-visit-form">
          <p className="text-slate-600">{tx('Use this only if the buyer already saw the property before / outside the app, so no OTP / QR was possible. The other broker must confirm. It is shown as NOT verified and gives no buyer protection — for new visits always use the OTP / QR.', 'सिर्फ़ तब, जब खरीदार ऐप से पहले / बाहर प्रॉपर्टी देख चुका हो और OTP / QR हो ही नहीं सकता था। दूसरा ब्रोकर पुष्टि करेगा। यह “वेरिफ़ाइड नहीं” दिखेगा और इससे खरीदार सुरक्षा नहीं मिलती — नई विज़िट हमेशा OTP / QR से करें।')}</p>
          <label className="block font-semibold text-slate-700">{tx('Date of the visit', 'विज़िट की तारीख़')}<input type="date" className={inp + ' mt-1'} value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} data-testid="offline-visit-date" /></label>
          <input className={inp} placeholder={tx('Who visited, with whom, what happened', 'किसने, किसके साथ देखी, क्या हुआ')} value={note} onChange={(e) => setNote(e.target.value)} data-testid="offline-visit-note" />
          <div className="flex gap-2"><button className={`${btn} bg-slate-900 text-white`} disabled={busy || !date || note.trim().length < 5} onClick={() => run(() => api.offlineVisit(deal.id, date, note))} data-testid="offline-visit-save">{tx('Send for confirmation', 'पुष्टि के लिए भेजें')}</button><button className={`${btn} border border-slate-300 bg-white`} onClick={() => setMode('')}>{tx('Cancel', 'रद्द')}</button></div>
        </div>
      )}
      {mode === 'close' && (
        <div className="space-y-1.5 rounded-xl border border-slate-300 bg-white p-3 text-xs" data-testid="deal-close-form">
          <p className="text-slate-600">{oneBroker ? tx('You are on both sides, so the room closes at once.', 'आप दोनों तरफ़ हैं, इसलिए रूम तुरंत बंद होगा।') : tx(`The other broker can say the deal is still on. If he does not answer in ${CLOSE_AUTO_DAYS} days, the room closes. You can reopen it any time.`, `दूसरा ब्रोकर “डील चालू है” कह सकता है। ${CLOSE_AUTO_DAYS} दिन में जवाब न आए तो रूम बंद हो जाएगा। आप कभी भी दोबारा खोल सकते हैं।`)}</p>
          <select className={inp} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="deal-close-reason">
            {CLOSE_REASONS.map((r) => <option key={r.id} value={r.id}>{hi ? r.hi : r.en}</option>)}
          </select>
          <input className={inp} placeholder={tx('A line for the other broker (optional)', 'दूसरे ब्रोकर के लिए एक लाइन (ज़रूरी नहीं)')} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2"><button className={`${btn} bg-slate-900 text-white`} disabled={busy || (reason === 'OTHER' && note.trim().length < 3)} onClick={() => run(() => api.dealClose(deal.id, reason, note))} data-testid="deal-close-save">{oneBroker ? tx('Close now', 'अभी बंद करें') : tx('Ask to close', 'बंद करने को कहें')}</button><button className={`${btn} border border-slate-300 bg-white`} onClick={() => setMode('')}>{tx('Cancel', 'रद्द')}</button></div>
        </div>
      )}
      {err && <p className="text-xs font-semibold text-red-700" role="alert">{err}</p>}
    </div>
  );
};
