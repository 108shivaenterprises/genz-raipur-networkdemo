/**
 * v29 — Buyer bond (buyer ↔ broker protection per property): the stop notice another broker sees, the holder's list
 * (Deal Desk → Buyer protection), and GENZ staff's list with "cancel on proof".
 */
import React, { useEffect, useState } from 'react';
import { ShieldCheck, Send, AlertTriangle, Loader2, Phone, MessageCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';

const d0 = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const daysLeft = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86400_000));

/** shown when a visit / offer is stopped by another broker's buyer bond (409 BUYER_BONDED) */
export const BondBlockedNotice: React.FC<{ info: any; onClose?: () => void }> = ({ info, onClose }) => {
  const tx = useTx();
  const [noteText, setNoteText] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(''); const [err, setErr] = useState('');
  const ask = async () => {
    setBusy(true); setErr('');
    try { await api.bbAsk(info.bondRef, noteText); setDone(tx('Request sent. That broker now has your name and mobile and can call you to co-broke.', 'रिक्वेस्ट भेज दी। उस ब्रोकर के पास अब आपका नाम और मोबाइल है, वे को-ब्रोकिंग के लिए आपको कॉल कर सकते हैं।')); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950" data-testid="bond-blocked">
      <p className="flex items-start gap-1.5 font-semibold"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />{tx(info.error || '', info.hi || info.error || '')}</p>
      {info.protectedUntil && <p className="mt-1">{tx('Protected until', 'सुरक्षा')} <b>{d0(info.protectedUntil)}</b>{tx('', ' तक')}</p>}
      {done ? <p className="mt-2 rounded bg-white p-2 font-medium text-emerald-800" role="status">{done}</p> : info.bondRef && (
        <div className="mt-2 space-y-2">
          <input className="min-h-10 w-full rounded-lg border border-amber-300 bg-white px-2 text-sm" maxLength={300} value={noteText} onChange={e => setNoteText(e.target.value)} placeholder={tx('A line for that broker (optional)', 'उस ब्रोकर के लिए एक लाइन (वैकल्पिक)')} />
          <p className="text-[11px] text-amber-800">{tx('GENZ does not show you who that broker is. If you ask, your name, company and mobile go to them.', 'GENZ आपको उस ब्रोकर का नाम नहीं बताता। रिक्वेस्ट भेजने पर आपका नाम, कंपनी और मोबाइल उन्हें जाएगा।')}</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={ask} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-slate-900 px-3 font-semibold text-white disabled:opacity-50" data-testid="bond-ask">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}{tx('Ask that broker to co-broke', 'उस ब्रोकर से को-ब्रोकिंग माँगें')}</button>
            {onClose && <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-amber-300 bg-white px-3 font-semibold">{tx('Close', 'बंद')}</button>}
          </div>
        </div>
      )}
      {err && <p className="mt-1 text-red-700" role="alert">{err}</p>}
    </div>
  );
};

/** Deal Desk → Buyer protection: my buyer bonds, co-broke requests on them, alerts when the property was sold */
export const BuyerBondsTab: React.FC<{ tick?: number }> = ({ tick }) => {
  const tx = useTx();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState('');
  const load = () => api.bbMine().then(setD).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [tick]);
  if (err) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (!d) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />;
  const release = async (id: string) => { if (!window.confirm(tx('Let this buyer bond go? Other brokers can then bring this buyer to this property.', 'यह खरीदार सुरक्षा छोड़ें? फिर दूसरे ब्रोकर इस खरीदार को इस प्रॉपर्टी पर ला सकेंगे।'))) return; setBusy(id); try { await api.bbRelease(id); await load(); } finally { setBusy(''); } };
  const active = d.bonds.filter((b: any) => b.active); const past = d.bonds.filter((b: any) => !b.active);
  return (
    <div className="space-y-3" data-testid="bonds-tab">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-950">
        <p className="font-bold"><ShieldCheck className="mr-1 inline h-4 w-4" />{tx('Buyer protection', 'खरीदार सुरक्षा')}</p>
        <p className="mt-1">{tx('When your buyer’s site visit is verified (OTP / QR) or you send an offer with the buyer’s consent, that buyer is bonded to you for that property for the GENZ protection days. No other GENZ broker can book a visit or make an offer for the same buyer there — they are asked to co-broke with you. Add the buyer’s mobile on the visit to get this protection.', 'जब आपके खरीदार की साइट विज़िट (OTP / QR) से पक्की होती है या आप खरीदार की सहमति से ऑफ़र भेजते हैं, तो उस प्रॉपर्टी पर वह खरीदार GENZ सुरक्षा के दिनों तक आपसे जुड़ जाता है। कोई दूसरा GENZ ब्रोकर उसी खरीदार के लिए वहाँ विज़िट या ऑफ़र नहीं कर सकता — उसे आपसे को-ब्रोकिंग के लिए कहा जाता है। यह सुरक्षा पाने के लिए विज़िट में खरीदार का मोबाइल ज़रूर डालें।')}</p>
      </div>
      {active.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">{tx('No active buyer bond yet.', 'अभी कोई चालू खरीदार सुरक्षा नहीं।')}</p>}
      {active.map((b: any) => (
        <div key={b.id} className={`rounded-xl border bg-white p-3 text-xs ${b.closedNotice ? 'border-red-300' : 'border-slate-200'}`} data-testid={`bond-${b.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900">{b.buyerName} <span className="font-normal text-slate-500">(…{b.buyerPhoneLast4})</span></div>
              <div className="text-slate-600">{b.propertyTitle || b.propertyId} · {b.locality}{b.city ? `, ${b.city}` : ''} · {b.propertyId}</div></div>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">{tx(`${daysLeft(b.expiresAt)} days left`, `${daysLeft(b.expiresAt)} दिन बाकी`)}</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">{b.source === 'VISIT' ? tx('Verified visit', 'पक्की विज़िट') : tx('Offer', 'ऑफ़र')} {b.sourceId} · {tx('since', 'से')} {d0(b.createdAt)} · {tx('till', 'तक')} {d0(b.expiresAt)}</div>
          {b.closedNotice && <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-50 p-2 font-semibold text-red-800" data-testid="bond-closed"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{tx(`This property was marked ${b.closedNotice.status} on ${d0(b.closedNotice.at)} while your buyer bond was running. If your buyer bought it, open the deal room and raise a dispute — the commission goes on hold while GENZ checks.`, `आपकी खरीदार सुरक्षा के दौरान ${d0(b.closedNotice.at)} को यह प्रॉपर्टी ${b.closedNotice.status === 'rented' ? 'किराये पर गई' : 'बिक गई'} दर्ज हुई। अगर आपके खरीदार ने ली है तो डील रूम खोलकर विवाद दर्ज करें — GENZ के जाँचने तक कमीशन होल्ड रहेगा।`)}</p>}
          {b.asks?.length > 0 && (
            <div className="mt-2 rounded-lg bg-indigo-50 p-2" data-testid="bond-asks">
              <p className="font-semibold text-indigo-900">{tx('Brokers asking to co-broke this buyer', 'इस खरीदार पर को-ब्रोकिंग माँगने वाले ब्रोकर')}</p>
              <ul className="mt-1 space-y-1">{b.asks.map((a: any) => <li key={a.id} className="flex flex-wrap items-center gap-2"><span className="font-semibold">{a.fromName}</span>{a.fromCompany && <span className="text-slate-500">{a.fromCompany}</span>}{a.fromPhone && <a className="inline-flex items-center gap-1 text-indigo-700 underline" href={`tel:${a.fromPhone}`}><Phone className="h-3 w-3" />{a.fromPhone}</a>}{a.fromPhone && <a className="inline-flex items-center gap-1 font-semibold text-emerald-700 underline" target="_blank" rel="noopener noreferrer" href={`https://wa.me/91${String(a.fromPhone).replace(/\D/g, '').slice(-10)}`}><MessageCircle className="h-3 w-3" />WhatsApp</a>}{a.note && <span className="italic text-slate-600">“{a.note}”</span>}<span className="text-slate-400">{d0(a.at)}</span></li>)}</ul>
            </div>
          )}
          <div className="mt-2"><button type="button" disabled={busy === b.id} onClick={() => release(b.id)} className="min-h-9 rounded-lg border border-slate-300 px-3 font-semibold text-slate-700 disabled:opacity-50">{tx('Let go (buyer not interested)', 'छोड़ें (खरीदार की रुचि नहीं)')}</button></div>
        </div>
      ))}
      {past.length > 0 && <details className="text-xs"><summary className="cursor-pointer text-slate-500">{tx(`Ended (${past.length})`, `ख़त्म (${past.length})`)}</summary>
        <ul className="mt-1 space-y-1">{past.map((b: any) => <li key={b.id} className="text-slate-600">{b.buyerName} (…{b.buyerPhoneLast4}) · {b.propertyId} · {b.status === 'RELEASED' ? tx('let go', 'छोड़ा') : b.status === 'VOID' ? tx('cancelled by GENZ', 'GENZ ने रद्द किया') : tx('time over', 'समय पूरा')} · {d0(b.expiresAt)}</li>)}</ul></details>}
    </div>
  );
};

/** GENZ staff: buyer bonds of one property (or the latest) and "cancel on proof" */
export const BuyerBondsAdmin: React.FC = () => {
  const tx = useTx();
  const [pid, setPid] = useState(''); const [d, setD] = useState<any[] | null>(null); const [err, setErr] = useState(''); const [noteFor, setNoteFor] = useState<{ id: string; text: string } | null>(null);
  const load = () => api.bbAdmin(pid.trim() || undefined).then(r => setD(r.bonds)).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const voidIt = async () => { if (!noteFor) return; try { await api.bbVoid(noteFor.id, noteFor.text); setNoteFor(null); load(); } catch (e: any) { setErr(e.message); } };
  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4" data-testid="bonds-admin">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><ShieldCheck className="h-4 w-4" />{tx('Buyer bonds (who brought the buyer first)', 'खरीदार सुरक्षा (खरीदार पहले कौन लाया)')}</h3>
      <div className="flex gap-2"><input className="min-h-10 flex-1 rounded-lg border border-slate-300 px-2 text-sm" placeholder={tx('Property ID (empty = latest)', 'प्रॉपर्टी ID (खाली = नई वाली)')} value={pid} onChange={e => setPid(e.target.value)} /><button type="button" onClick={load} className="min-h-10 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white">{tx('Show', 'दिखाएँ')}</button></div>
      {err && <p className="text-xs text-red-700">{err}</p>}
      {d && d.length === 0 && <p className="text-xs text-slate-500">{tx('None.', 'कोई नहीं।')}</p>}
      <ul className="divide-y divide-slate-100 text-xs">{(d || []).slice(0, 50).map((b: any) => (
        <li key={b.id} className="py-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><span><b>{b.propertyId}</b> · {b.brokerName} · {b.buyerName} (…{b.buyerPhoneLast4}) · {b.source} {b.sourceId}</span><span className={b.active ? 'text-emerald-700' : 'text-slate-500'}>{b.active ? tx(`till ${d0(b.expiresAt)}`, `${d0(b.expiresAt)} तक`) : b.status}</span></div>
          {b.active && (noteFor && noteFor.id === b.id
            ? <div className="mt-1 flex gap-2"><input autoFocus className="min-h-9 flex-1 rounded border border-slate-300 px-2" placeholder={tx('Why (10+ characters)', 'कारण (10+ अक्षर)')} value={noteFor.text} onChange={e => setNoteFor({ id: b.id, text: e.target.value })} /><button type="button" onClick={voidIt} className="min-h-9 rounded bg-red-600 px-3 font-semibold text-white">{tx('Cancel bond', 'सुरक्षा रद्द')}</button></div>
            : <button type="button" onClick={() => setNoteFor({ id: b.id, text: '' })} className="mt-1 text-red-700 underline">{tx('Cancel on proof…', 'सबूत पर रद्द करें…')}</button>)}
        </li>))}</ul>
    </section>
  );
};
