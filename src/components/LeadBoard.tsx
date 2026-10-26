/**
 * v74 — Leadership Board + the brokerage talk (free route).
 *   BoardPicker      the Top 10 brokers of ONE city (rank, first name, GENZ-checked photo) — the owner taps one and confirms
 *   TermsBox         the brokerage, settled in the open: the broker says it, the other side accepts or counters
 *   OwnerRequests    the chosen broker's list (inside his Property tab): tell the brokerage, sign the mandate, or say no
 *   BrokerBoardLine  one line for a broker: where he stands on his city's board
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Trophy } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';
import { ProtectionPicker } from './ProtectionDays.js';

const inp = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm';
const btn = 'inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50';
const ghost = 'inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800 disabled:opacity-50';

export const Face: React.FC<{ src?: string; name: string; size?: number }> = ({ src, name, size = 56 }) => {
  const [bad, setBad] = useState(false);
  return src && !bad
    ? <img src={src} alt={name} width={size} height={size} onError={() => setBad(true)} className="rounded-full object-cover ring-2 ring-white" style={{ width: size, height: size }} />
    : <div className="flex items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-600" style={{ width: size, height: size }}>{name.slice(0, 1).toUpperCase()}</div>;
};

export const BoardPicker: React.FC<{ city: string; current?: string; busy?: boolean; confirmLabel?: [string, string]; onPick: (brokerId: string, firstName: string, photoUrl: string) => void }> = ({ city, current, busy, confirmLabel, onPick }) => {
  const tx = useTx(); const [b, setB] = useState<any[] | null>(null); const [err, setErr] = useState(''); const [sel, setSel] = useState('');
  useEffect(() => {
    const c = city.trim(); setSel(''); if (c.length < 2) { setB([]); return; }
    let live = true; setB(null); setErr('');
    const t = setTimeout(() => { api.leadBoard(c).then(r => { if (live) setB(r.board); }).catch(e => { if (live) { setErr(e.message); setB([]); } }); }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [city]);
  const picked = b?.find(x => x.brokerId === sel);
  return (
    <div className="space-y-2" data-testid="board-picker">
      <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Trophy className="h-4 w-4 text-amber-600" />{tx('Leadership Board', 'लीडरशिप बोर्ड')} · {city || tx('your city', 'आपका शहर')}</div>
      <p className="text-[11px] text-slate-500">{tx('The 10 best GENZ brokers of your city by their work points (last 90 days). Only GENZ-verified brokers with a GENZ-checked photo are here.', 'आपके शहर के सबसे अच्छे 10 GENZ ब्रोकर — पिछले 90 दिन के काम के पॉइंट से। यहाँ सिर्फ़ GENZ-वेरिफ़ाइड और फ़ोटो-जाँचे हुए ब्रोकर हैं।')}</p>
      {err && <p className="text-xs text-red-700">{err}</p>}
      {b === null && <Loader2 className="h-4 w-4 animate-spin" />}
      {b && b.length === 0 && !err && <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900" data-testid="board-empty">{tx('No broker is on the board for this city yet. Choose the GENZ plan and go live now.', 'इस शहर के बोर्ड पर अभी कोई ब्रोकर नहीं। GENZ का प्लान लेकर अभी लाइव करें।')}</p>}
      {b && b.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {b.map(x => (
            <button key={x.brokerId} type="button" onClick={() => setSel(x.brokerId)} disabled={x.brokerId === current} aria-pressed={sel === x.brokerId} data-testid={`board-${x.brokerId}`}
              className={`relative w-[104px] shrink-0 rounded-xl border-2 bg-white p-2 text-center disabled:opacity-50 ${sel === x.brokerId ? 'border-slate-900 shadow' : 'border-slate-200'}`}>
              <span className="absolute left-1.5 top-1.5 rounded-full bg-amber-100 px-1.5 text-[10px] font-extrabold text-amber-900">#{x.rank}</span>
              <div className="flex justify-center pt-3"><Face src={x.photoUrl} name={x.firstName} size={56} /></div>
              <div className="mt-1.5 truncate text-xs font-bold text-slate-900">{x.firstName}</div>
              <div className="h-3.5 text-[10px] font-semibold text-emerald-700">{x.isNew ? tx('New', 'नया') : x.brokerId === current ? tx('Your pick', 'आपकी पसंद') : ''}</div>
            </button>
          ))}
        </div>
      )}
      {picked && <button type="button" className={btn + ' w-full'} disabled={busy} onClick={() => onPick(picked.brokerId, picked.firstName, picked.photoUrl)} data-testid="board-confirm">{confirmLabel ? tx(...confirmLabel) : tx('Choose', 'चुनें')} {picked.firstName}</button>}
    </div>
  );
};

const money = (basis: string, value: number, price: number) => basis === 'PERCENTAGE' ? `${value}% ≈ ${formatINR(Math.round(price * value / 100))}` : formatINR(value);

/** the brokerage, offer by offer */
export const TermsBox: React.FC<{ l: any; side: 'OWNER' | 'BROKER'; locked?: boolean; onDone: () => void }> = ({ l, side, locked, onDone }) => {
  const tx = useTx(); const t = l.terms; const price = Number(l.askingPrice) || 0;
  const [basis, setBasis] = useState<'PERCENTAGE' | 'FIXED_FEE'>(t?.basis || 'PERCENTAGE'); const [val, setVal] = useState(t ? String(t.value) : ''); const [note, setNote] = useState('');
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const id = l.propertyId;
  const run = async (fn: () => Promise<any>) => { setBusy(true); setErr(''); try { await fn(); setOpen(false); onDone(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const n = Number(val);
  const who = (by: string) => by === side ? tx('You', 'आप') : side === 'OWNER' ? tx('Broker', 'ब्रोकर') : tx('Owner', 'मालिक');
  const form = (
    <div className="space-y-2 rounded-lg bg-slate-50 p-2.5">
      <div className="flex gap-2">{(['PERCENTAGE', 'FIXED_FEE'] as const).map(k => <button key={k} type="button" onClick={() => setBasis(k)} className={`min-h-10 flex-1 rounded-lg border text-xs font-bold ${basis === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white'}`}>{k === 'PERCENTAGE' ? tx('% of the price', 'कीमत का %') : tx('Fixed ₹', 'तय ₹')}</button>)}</div>
      <input className={inp} inputMode="decimal" placeholder={basis === 'PERCENTAGE' ? tx('e.g. 1.5 (0.1 – 10)', 'जैसे 1.5 (0.1 – 10)') : tx('Amount in ₹', '₹ में रकम')} value={val} onChange={e => setVal(e.target.value.replace(basis === 'PERCENTAGE' ? /[^\d.]/g : /\D/g, ''))} data-testid="terms-value" />
      {n > 0 && price > 0 && <p className="text-[11px] text-slate-600">{money(basis, n, price)} {tx('on the asking price', 'माँगी कीमत पर')} {formatINR(price)}</p>}
      <input className={inp} placeholder={tx('A short note (optional)', 'छोटा नोट (वैकल्पिक)')} value={note} maxLength={200} onChange={e => setNote(e.target.value)} />
      <button type="button" className={btn + ' w-full'} disabled={busy || !(n > 0)} onClick={() => run(() => api.olTerms(id, { action: 'PROPOSE', basis, value: n, note: note || undefined }))} data-testid="terms-send">
        {!t ? tx('Tell my brokerage', 'मेरी ब्रोकरेज बताएँ') : t.by === side ? tx('Change my offer', 'मेरा ऑफ़र बदलें') : tx('Send my counter offer', 'मेरा जवाबी ऑफ़र भेजें')}
      </button>
    </div>
  );
  return (
    <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/60 p-2.5 text-xs" data-testid="terms-box">
      <div className="font-bold text-indigo-950">{tx('Brokerage — settled between you two', 'ब्रोकरेज — आप दोनों के बीच तय')}</div>
      {err && <p className="text-red-700" role="alert">{err}</p>}
      {!t && side === 'OWNER' && <p className="text-slate-700">{tx('Waiting for your broker to tell his brokerage. You can accept it or make a counter offer.', 'आपका ब्रोकर अपनी ब्रोकरेज बताएगा। आप उसे मान सकते हैं या जवाबी ऑफ़र दे सकते हैं।')}</p>}
      {!t && side === 'BROKER' && !locked && form}
      {t && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5"><b className="text-sm" data-testid="terms-now">{money(t.basis, t.value, price)}</b>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${t.status === 'AGREED' ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>{t.status === 'AGREED' ? tx('Agreed by both ✔', 'दोनों ने माना ✔') : `${tx('Offer by', 'ऑफ़र')}: ${who(t.by)}`}</span></div>
          {t.note && <p className="text-slate-600">“{t.note}”</p>}
          {t.history.length > 1 && <p className="text-[10px] text-slate-500">{t.history.map((h: any) => `${who(h.by)}: ${h.action === 'ACCEPT' ? tx('agreed', 'माना') : h.basis === 'PERCENTAGE' ? h.value + '%' : '₹' + h.value}`).join(' → ')}</p>}
        </div>
      )}
      {t && t.status === 'PROPOSED' && t.by !== side && !locked && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn + ' flex-1'} disabled={busy} onClick={() => run(() => api.olTerms(id, { action: 'ACCEPT' }))} data-testid="terms-accept">{tx('Accept', 'मान लें')} ✔</button>
          <button type="button" className={ghost + ' flex-1'} onClick={() => setOpen(!open)} data-testid="terms-counter-open">{tx('Counter offer', 'जवाबी ऑफ़र')}</button>
        </div>
      )}
      {t && t.status === 'PROPOSED' && t.by === side && !locked && <button type="button" className={ghost + ' w-full'} onClick={() => setOpen(!open)}>{tx('Change my offer', 'मेरा ऑफ़र बदलें')}</button>}
      {t && t.status === 'PROPOSED' && t.by === side && <p className="text-slate-600">{tx('Waiting for the other side.', 'दूसरी तरफ़ के जवाब का इंतज़ार।')}</p>}
      {t && t.status === 'AGREED' && !locked && <button type="button" className={ghost + ' w-full'} onClick={() => setOpen(!open)}>{tx('Not right? Make a new offer', 'ठीक नहीं? नया ऑफ़र दें')}</button>}
      {open && !locked && form}
      <p className="text-[10px] text-slate-500">{tx('Only the agreed brokerage goes into the mandate. It is between you and your broker — GENZ does not collect it.', 'मंडेट में सिर्फ़ दोनों की तय की हुई ब्रोकरेज जाती है। यह आपके और ब्रोकर के बीच है — GENZ इसे नहीं लेता।')}</p>
    </div>
  );
};

/** a broker: where do I stand on my city's board */
export const BrokerBoardLine: React.FC<{ city?: string; userId: string }> = ({ city, userId }) => {
  const tx = useTx(); const [b, setB] = useState<any[] | null>(null);
  useEffect(() => { if (city) api.leadBoard(city).then(r => setB(r.board)).catch(() => setB(null)); }, [city]);
  if (!city || !b) return null;
  const me = b.find(x => x.brokerId === userId);
  return (
    <p className={`flex items-start gap-1.5 rounded-lg p-2.5 text-xs ${me ? 'bg-amber-50 text-amber-950' : 'bg-slate-50 text-slate-700'}`} data-testid="broker-board-line">
      <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <span>{me
        ? tx(`You are #${me.rank} on the ${city} Leadership Board — owners on the free route choose from these 10 brokers.`, `आप ${city} के लीडरशिप बोर्ड पर #${me.rank} हैं — फ़्री रूट वाले मालिक इन्हीं 10 ब्रोकरों में से चुनते हैं।`)
        : tx(`Owners on the free route choose from the Top 10 of ${city}. To appear: get your face photo checked by GENZ (Profile) and earn work points.`, `फ़्री रूट वाले मालिक ${city} के टॉप 10 में से चुनते हैं। आने के लिए: प्रोफ़ाइल में अपनी फ़ोटो GENZ से जँचवाएँ और काम के पॉइंट कमाएँ।`)}</span>
    </p>
  );
};

/** the chosen broker's list — shown inside the broker's Property tab only when an owner picked him */
export const OwnerRequests: React.FC<{ onOpenMandate?: () => void }> = () => {
  const tx = useTx(); const [rows, setRows] = useState<any[] | null>(null); const [err, setErr] = useState(''); const [pw, setPw] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.olAssigned().then(r => setRows(r.listings)).catch(e => setErr(e.message)), []);
  useEffect(() => { void load(); }, [load]);
  const run = async (fn: () => Promise<any>) => { setBusy(true); setErr(''); try { await fn(); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  if (!rows || rows.length === 0) return err ? <p className="text-xs text-red-700">{err}</p> : null;
  return (
    <section className="space-y-2 rounded-xl border-2 border-indigo-300 bg-white p-3" data-testid="owner-requests">
      <div><h3 className="text-sm font-bold text-slate-900">{tx('Owner requests', 'मालिकों के अनुरोध')} ({rows.length})</h3>
        <p className="text-[11px] text-slate-500">{tx('These owners picked you from the Leadership Board. Tell your brokerage; when you both agree, the owner signs the mandate and you co-sign.', 'इन मालिकों ने आपको लीडरशिप बोर्ड से चुना है। अपनी ब्रोकरेज बताएँ; दोनों के मानने पर मालिक मंडेट साइन करेगा और आप सह-साइन करेंगे।')}</p></div>
      {err && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700" role="alert">{err}</p>}
      {rows.map(r => (
        <div key={r.propertyId} className="space-y-2 rounded-xl border border-slate-200 p-2.5" data-testid={`owner-req-${r.propertyId}`}>
          <div><div className="text-sm font-bold text-slate-900">{r.title}</div><div className="text-[11px] text-slate-500">{r.locality}, {r.city} · {formatINR(r.askingPrice)} · {r.transactionType} · {tx('Owner', 'मालिक')}: {r.ownerFirstName}</div></div>
          <TermsBox l={r} side="BROKER" locked={r.mandateStatus === 'PENDING_BROKER' || r.mandateStatus === 'ACTIVE'} onDone={load} />
          {r.mandateStatus === 'PENDING_BROKER' && (
            <div className="space-y-2 rounded-lg bg-amber-50 p-2.5 text-xs">
              <b>{tx('The owner signed the mandate — it needs your signature.', 'मालिक ने मंडेट साइन कर दिया — आपका साइन बाकी है।')}</b>
              <input type="password" autoComplete="current-password" className={inp} placeholder={tx('Your password (acts as your signature)', 'आपका पासवर्ड (साइन की तरह)')} value={pw[r.propertyId] || ''} onChange={e => setPw({ ...pw, [r.propertyId]: e.target.value })} data-testid="req-sign-pw" />
              <button type="button" className={btn + ' w-full'} disabled={busy || !(pw[r.propertyId] || '').length} onClick={() => run(() => api.acceptOwnerMandate(r.mandateId, pw[r.propertyId]))} data-testid="req-sign">{tx('Sign the mandate', 'मंडेट साइन करें')}</button>
            </div>
          )}
          {r.mandateStatus === 'ACTIVE' && <p className="text-xs font-semibold text-emerald-700">✔ {tx('Mandate signed by both — the listing is live.', 'मंडेट दोनों ने साइन किया — लिस्टिंग लाइव है।')}</p>}
          {!['PENDING_BROKER', 'ACTIVE'].includes(r.mandateStatus || '') && <button type="button" className={ghost + ' w-full'} disabled={busy} onClick={() => run(() => api.olDecline(r.propertyId))} data-testid="req-decline">{tx('I cannot take this one', 'मैं यह नहीं ले सकता')}</button>}
        </div>
      ))}
    </section>
  );
};

/** an owner who has NOT paid: "free — choose a broker from the Top 10 of my city" */
export const FreeRouteOffer: React.FC<{ l: any; onDone: () => void }> = ({ l, onDone }) => {
  const tx = useTx(); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  return (
    <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/60 p-2.5" data-testid="free-route">
      {!open ? <button type="button" className={ghost + ' w-full !border-indigo-300 !text-indigo-900'} onClick={() => setOpen(true)} data-testid="free-route-open">{tx('Free instead: choose one broker from the Top 10 of', 'मुफ़्त में: टॉप 10 में से एक ब्रोकर चुनें —')} {l.city}</button> : <>
        {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
        <BoardPicker city={l.city} busy={busy} confirmLabel={['Choose', 'चुनें']} onPick={async id => { setBusy(true); setErr(''); try { await api.olViaBroker(l.propertyId, id); onDone(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }} />
        <p className="text-[10px] text-slate-500">{tx('No GENZ fee on this route. You and the broker agree his brokerage, you sign the mandate, and only then the listing goes live — with that one broker.', 'इस रूट पर GENZ की कोई फ़ीस नहीं। आप और ब्रोकर उसकी ब्रोकरेज तय करते हैं, आप मंडेट साइन करते हैं, तभी लिस्टिंग लाइव होती है — उसी एक ब्रोकर के साथ।')}</p>
        <button type="button" className="text-xs font-semibold text-slate-600 underline" onClick={() => setOpen(false)}>{tx('Close', 'बंद')}</button></>}
    </div>
  );
};

/** an owner who chose a broker: the broker, the brokerage talk, the mandate */
export const OwnerBrokerRoute: React.FC<{ l: any; onDone: () => void }> = ({ l, onDone }) => {
  const tx = useTx(); const t = l.terms; const ms: string | null = l.mandateStatus; const locked = ms === 'PENDING_BROKER' || ms === 'ACTIVE';
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [change, setChange] = useState(false);
  const [days, setDays] = useState(30); const [sent, setSent] = useState<{ devCode?: string } | null>(null); const [code, setCode] = useState('');
  const name = l.broker?.firstName || tx('your broker', 'आपका ब्रोकर');
  const run = async (fn: () => Promise<any>) => { setBusy(true); setErr(''); try { await fn(); onDone(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <div className="space-y-2" data-testid="owner-broker-route">
      {err && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700" role="alert">{err}</p>}
      {l.broker && <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 p-2"><Face src={l.broker.photoUrl} name={l.broker.firstName} size={44} /><div><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{tx('Your broker', 'आपका ब्रोकर')}</div><div className="text-sm font-bold text-slate-900">{l.broker.firstName}</div></div></div>}
      <TermsBox l={l} side="OWNER" locked={locked} onDone={onDone} />
      {t?.status === 'AGREED' && !locked && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs" data-testid="owner-sign-mandate">
          <b className="text-emerald-950">{tx('Both agreed. Now sign the mandate with a code on your mobile.', 'दोनों राज़ी। अब अपने मोबाइल के कोड से मंडेट साइन करें।')}</b>
          <ProtectionPicker value={days} onChange={setDays} testId="owner-protect" />
          {!sent ? <button type="button" className={btn + ' w-full'} disabled={busy} onClick={() => run(async () => { setSent(await api.ownerSignCode()); })} data-testid="owner-sign-code">{tx('Send me the code', 'मुझे कोड भेजें')}</button> : <>
            {sent.devCode && <p className="rounded bg-white p-1.5 text-[11px]">{tx('Demo code', 'डेमो कोड')}: <b>{sent.devCode}</b></p>}
            <input className={inp} inputMode="numeric" maxLength={6} placeholder={tx('6-digit code', '6 अंक का कोड')} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} data-testid="owner-sign-input" />
            <button type="button" className={btn + ' w-full'} disabled={busy || code.length !== 6} data-testid="owner-sign-go"
              onClick={() => run(() => api.createOwnerMandate({ propertyId: l.propertyId, advertisedPrice: l.askingPrice, remunerationBasis: t.basis, ...(t.basis === 'PERCENTAGE' ? { commissionPct: t.value } : { fixedFeeAmount: t.value }), protectionPeriodDays: days, password: code }))}>{tx('Sign the mandate', 'मंडेट साइन करें')}</button></>}
          <p className="text-[10px] text-slate-600">{tx(`The mandate carries exactly the agreed brokerage, and a ${days}-day protection: if a buyer ${name} brings deals with you directly in that time, the brokerage is still due.`, `मंडेट में ठीक वही तय ब्रोकरेज होगी, और ${days} दिन की सुरक्षा: इस दौरान ${name} का लाया ख़रीदार आपसे सीधी डील करे तब भी ब्रोकरेज देनी होगी।`)}</p>
        </div>
      )}
      {ms === 'PENDING_BROKER' && <div className="space-y-2 rounded-lg bg-amber-50 p-2.5 text-xs"><b>{tx(`Signed by you — waiting for ${name} to sign.`, `आपने साइन किया — ${name} का साइन बाकी।`)}</b><button type="button" className={ghost + ' w-full'} disabled={busy} onClick={() => run(() => api.withdrawOwnerMandate(l.mandateId))} data-testid="owner-withdraw">{tx('Withdraw the mandate', 'मंडेट वापस लें')}</button></div>}
      {ms === 'ACTIVE' && <p className="text-xs font-semibold text-emerald-700">✔ {tx('Mandate signed by both — your listing is live with this broker.', 'मंडेट दोनों ने साइन किया — आपकी लिस्टिंग इस ब्रोकर के साथ लाइव है।')}</p>}
      {!locked && (
        <div className="space-y-2">
          {!change ? <div className="flex gap-2"><button type="button" className={ghost + ' flex-1'} onClick={() => setChange(true)} data-testid="owner-change-broker">{tx('Choose another broker', 'दूसरा ब्रोकर चुनें')}</button>
            <button type="button" className={ghost + ' flex-1'} disabled={busy} onClick={() => run(() => api.olUnassign(l.propertyId))} data-testid="owner-take-back">{l.fee > 0 ? tx('Pay GENZ plan instead', 'GENZ प्लान लें') : tx('Take it back', 'वापस लें')}</button></div>
            : <><BoardPicker city={l.city} current={l.assignedBrokerId} busy={busy} confirmLabel={['Choose', 'चुनें']} onPick={id => run(async () => { await api.olViaBroker(l.propertyId, id); setChange(false); })} /><button type="button" className="text-xs font-semibold text-slate-600 underline" onClick={() => setChange(false)}>{tx('Close', 'बंद')}</button></>}
        </div>
      )}
    </div>
  );
};
