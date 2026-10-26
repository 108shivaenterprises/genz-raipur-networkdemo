/**
 * v73 — owner self-listing screens.
 *   OwnerSignIn        login page: "मैं मालिक हूँ" — mobile + one-time code (no password)
 *   OwnerListingsTab   one tab, three faces: the owner's listings (fee → pool → broker), the broker's pool, GENZ staff's master plan
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, ArrowLeft, Plus, Check } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';

const inp = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm';
const btn = 'inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50';
const ghost = 'inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800 disabled:opacity-50';

export const OwnerSignIn: React.FC<{ onLoggedIn: (s: any) => void; onBack: () => void }> = ({ onLoggedIn, onBack }) => {
  const tx = useTx();
  const [phone, setPhone] = useState(''); const [step, setStep] = useState<'phone' | 'code'>('phone'); const [code, setCode] = useState('');
  const [exists, setExists] = useState(false); const [name, setName] = useState(''); const [city, setCity] = useState(''); const [ok, setOk] = useState(false);
  const [dev, setDev] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="owner-signin">
        <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs text-slate-500"><ArrowLeft className="h-3.5 w-3.5" />{tx('Back', 'वापस')}</button>
        <h1 className="text-base font-bold text-slate-900">🏠 {tx('Property owner — sign in with your mobile', 'प्रॉपर्टी मालिक — मोबाइल से साइन-इन')}</h1>
        <p className="mt-1 text-xs text-slate-600">{tx('No password. We send a 6-digit code to your mobile. New here? Your account is made in one step.', 'पासवर्ड नहीं। आपके मोबाइल पर 6 अंकों का कोड आएगा। नए हैं? अकाउंट एक ही बार में बन जाएगा।')}</p>
        {step === 'phone' ? (
          <form className="mt-4 space-y-3" onSubmit={e => { e.preventDefault(); void go(async () => { const r = await api.ownerOtp(phone.replace(/\D/g, '')); setExists(r.exists); setDev(r.devCode || ''); setStep('code'); }); }}>
            <input className={inp} inputMode="numeric" maxLength={10} placeholder={tx('10-digit mobile', '10 अंकों का मोबाइल')} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} data-testid="owner-phone" />
            {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
            <button className={btn + ' w-full'} disabled={busy || phone.length !== 10} data-testid="owner-send">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : tx('Send code', 'कोड भेजें')}</button>
          </form>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={e => { e.preventDefault(); void go(async () => { const r = await api.ownerVerify({ phone, code: code.replace(/\D/g, ''), name: exists ? undefined : name, city: exists ? undefined : city, consent: exists ? undefined : ok }); void r; onLoggedIn(await api.getMe()); }); }}>
            {dev && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800" data-testid="owner-devcode">{tx('Demo: your code is', 'डेमो: आपका कोड')} <b>{dev}</b></p>}
            <input className={inp + ' text-center font-mono text-xl tracking-widest'} inputMode="numeric" maxLength={6} autoFocus autoComplete="one-time-code" placeholder="••••••" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} data-testid="owner-code" />
            {!exists && <>
              <input className={inp} placeholder={tx('Your name', 'आपका नाम')} value={name} onChange={e => setName(e.target.value)} data-testid="owner-name" />
              <input className={inp} placeholder={tx('City', 'शहर')} value={city} onChange={e => setCity(e.target.value)} />
              <label className="flex items-start gap-2 text-[11px] text-slate-600"><input type="checkbox" className="mt-0.5" checked={ok} onChange={e => setOk(e.target.checked)} data-testid="owner-consent" />{tx('I agree to GENZ keeping my name and mobile number to run my listing (privacy policy).', 'मैं सहमत हूँ कि GENZ मेरी लिस्टिंग चलाने के लिए मेरा नाम और मोबाइल नंबर रखे (प्राइवेसी पॉलिसी)।')}</label>
            </>}
            {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
            <button className={btn + ' w-full'} disabled={busy || code.length !== 6 || (!exists && (!ok || name.trim().length < 2))} data-testid="owner-go">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : tx('Sign in', 'साइन-इन')}</button>
          </form>
        )}
      </div>
    </div>
  );
};

const STATUS: Record<string, [string, string, string]> = {
  PENDING: ['Pay the fee to go live', 'फ़ीस देकर लाइव करें', 'bg-amber-100 text-amber-900'],
  WAITING_CONFIRM: ['GENZ is checking your payment', 'GENZ आपका भुगतान जाँच रहा है', 'bg-sky-100 text-sky-900'],
  REJECTED: ['Payment not found — write it again', 'भुगतान नहीं मिला — दोबारा लिखें', 'bg-red-100 text-red-800'],
  PAID: ['Live in the broker pool', 'ब्रोकर पूल में लाइव', 'bg-emerald-100 text-emerald-900'],
  FREE: ['Live in the broker pool (free)', 'ब्रोकर पूल में लाइव (मुफ़्त)', 'bg-emerald-100 text-emerald-900'],
  WAIVED_BROKER: ['With your broker — live after the mandate', 'आपके ब्रोकर के पास — मंडेट के बाद लाइव', 'bg-indigo-100 text-indigo-900'],
  EXPIRED: ['Time over — renew', 'समय पूरा — फिर चालू करें', 'bg-slate-200 text-slate-700'],
};

const OwnerHome: React.FC<{ goto: (t: string) => void }> = ({ goto }) => {
  const tx = useTx(); const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState<Record<string, string>>({});
  const load = useCallback(() => api.olMine().then(setD).catch(e => setErr(e.message)), []);
  useEffect(() => { void load(); }, [load]);
  const run = async (fn: () => Promise<any>) => { setBusy(true); setErr(''); try { await fn(); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  if (!d) return err ? <p className="text-xs text-red-700">{err}</p> : <Loader2 className="h-4 w-4 animate-spin" />;
  return (
    <div className="space-y-3" data-testid="owner-listings">
      <div className="flex items-center justify-between gap-2">
        <div><h2 className="text-base font-bold text-slate-900">{tx('My listings', 'मेरी लिस्टिंग')}</h2><p className="text-[11px] text-slate-500">{tx('Fee first → brokers see it → you choose one broker → mandate → matching starts.', 'पहले फ़ीस → ब्रोकर देखते हैं → आप एक ब्रोकर चुनते हैं → मंडेट → मैचिंग शुरू।')}</p></div>
        <button type="button" className={btn} onClick={() => goto('properties')} data-testid="owner-new"><Plus className="h-4 w-4" />{tx('New listing', 'नई लिस्टिंग')}</button>
      </div>
      {err && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700" role="alert">{err}</p>}
      {d.listings.length === 0 && <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{tx('No listing yet. Tap “New listing” (Property tab).', 'अभी कोई लिस्टिंग नहीं। “नई लिस्टिंग” दबाएँ (प्रॉपर्टी टैब)।')}</p>}
      {d.listings.map((l: any) => {
        const s = STATUS[l.feeStatus] || ['', '', ''];
        return (
          <div key={l.propertyId} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" data-testid={`owner-listing-${l.propertyId}`}>
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900">{l.title}</div><div className="text-[11px] text-slate-500">{l.locality}, {l.city} · {formatINR(l.askingPrice)} · {l.propertyId}</div></div></div>
            <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${s[2]}`} data-testid="owner-listing-status">{tx(s[0], s[1])}</span>
            {l.listingStatus === 'active' && <p className="text-[11px] font-semibold text-emerald-700">✔ {tx('Matching is on — your broker is working on it.', 'मैचिंग चालू है — आपका ब्रोकर काम कर रहा है।')}</p>}
            {['PENDING', 'REJECTED', 'EXPIRED'].includes(l.feeStatus) && l.fee > 0 && l.feeStatus !== 'EXPIRED' && (
              <div className="space-y-2 rounded-lg bg-amber-50 p-2.5 text-xs">
                <div>{tx('Listing fee', 'लिस्टिंग फ़ीस')}: <b>{formatINR(l.fee)}</b> · {l.durationDays} {tx('days in the pool', 'दिन पूल में')}{l.refundable ? ` · ${tx('refundable on title check / deal', 'टाइटल जाँच / डील पर वापस')}` : ''}</div>
                <div>{tx('Pay by UPI to', 'UPI से दें')}: <b>{d.upiId || tx('(GENZ will share)', '(GENZ बताएगा)')}</b>{d.payeeName ? ` (${d.payeeName})` : ''}. {tx('Then write the reference (UTR):', 'फिर रेफ़रेंस (UTR) लिखें:')}</div>
                {l.rejectNote && <div className="text-red-700">{l.rejectNote}</div>}
                <div className="flex gap-2"><input className={inp} placeholder="UTR / Ref" value={ref[l.propertyId] || ''} onChange={e => setRef({ ...ref, [l.propertyId]: e.target.value })} data-testid="owner-utr" /><button type="button" className={btn} disabled={busy || (ref[l.propertyId] || '').length < 3} onClick={() => run(() => api.olPay(l.propertyId, { ref: ref[l.propertyId] }))} data-testid="owner-pay">{tx('Send', 'भेजें')}</button></div>
              </div>
            )}
            {l.feeStatus === 'EXPIRED' && <button type="button" className={btn} disabled={busy} onClick={() => run(() => api.olRenew(l.propertyId))}>{tx('Renew', 'फिर चालू करें')}</button>}
            {l.inPool && (
              <div className="space-y-2 rounded-lg bg-slate-50 p-2.5 text-xs" data-testid="owner-requests">
                <div className="font-semibold">{tx('Brokers who asked for your mandate', 'जिन ब्रोकर ने आपका मंडेट माँगा')} ({l.requests.length})</div>
                {l.requests.length === 0 && <p className="text-slate-500">{tx('Waiting — brokers can see your listing (not your phone or address).', 'इंतज़ार — ब्रोकर आपकी लिस्टिंग देख सकते हैं (आपका फ़ोन या पता नहीं)।')}</p>}
                {l.requests.map((q: any) => (
                  <div key={q.brokerId} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2"><span className="min-w-0"><b>{q.brokerName}</b>{q.note ? <span className="block text-[11px] text-slate-500">{q.note}</span> : null}</span>
                    <button type="button" className={btn + ' !min-h-9 !px-3'} disabled={busy} onClick={() => run(() => api.olAssign(l.propertyId, q.brokerId))} data-testid={`owner-assign-${q.brokerId}`}><Check className="h-3.5 w-3.5" />{tx('Choose', 'चुनें')}</button></div>
                ))}
              </div>
            )}
            {l.assignedBrokerId && l.listingStatus !== 'active' && (
              <div className="space-y-2 rounded-lg bg-indigo-50 p-2.5 text-xs">
                <p>{tx('You chose a broker. Matching starts after you both sign the mandate. You paid GENZ the listing fee, so the broker cannot ask you for brokerage — he earns from the buyer only.', 'आपने ब्रोकर चुन लिया। आप दोनों के मंडेट पर साइन करने के बाद मैचिंग शुरू होगी। आपने GENZ को लिस्टिंग फ़ीस दी है, इसलिए ब्रोकर आपसे ब्रोकरेज नहीं माँग सकता — वह सिर्फ़ ख़रीदार से लेगा।')}</p>
                <div className="flex gap-2"><button type="button" className={btn} onClick={() => goto('properties')}>{tx('Make the mandate', 'मंडेट बनाएँ')}</button><button type="button" className={ghost} disabled={busy} onClick={() => run(() => api.olUnassign(l.propertyId))}>{tx('Take back', 'वापस लें')}</button></div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const OwnerPool: React.FC = () => {
  const tx = useTx(); const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [note, setNote] = useState<Record<string, string>>({});
  const load = useCallback(() => api.olPool().then(setD).catch(e => setErr(e.message)), []);
  useEffect(() => { void load(); }, [load]);
  if (!d) return err ? <p className="text-xs text-red-700">{err}</p> : <Loader2 className="h-4 w-4 animate-spin" />;
  return (
    <div className="space-y-3" data-testid="owner-pool">
      <div><h2 className="text-base font-bold text-slate-900">{tx('Owner pool', 'मालिक पूल')}</h2><p className="text-[11px] text-slate-500">{tx('Homes listed by owners themselves. You can see them, but they are not matched until the owner chooses you and the mandate is signed. Owner phone and address stay hidden.', 'मालिकों की ख़ुद डाली लिस्टिंग। आप इन्हें देख सकते हैं, पर मैच तभी होंगी जब मालिक आपको चुने और मंडेट साइन हो। मालिक का फ़ोन और पता छिपा रहता है।')}</p></div>
      {err && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700" role="alert">{err}</p>}
      {d.pool.length === 0 && <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{tx('No owner listing in the pool now.', 'अभी पूल में कोई मालिक-लिस्टिंग नहीं।')}</p>}
      {d.pool.map((p: any) => (
        <div key={p.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" data-testid={`pool-${p.id}`}>
          <div className="text-sm font-bold text-slate-900">{p.title}</div>
          <div className="text-[11px] text-slate-500">{p.locality}, {p.city} · {p.propertyType} · {p.transactionType} · {formatINR(p.askingPrice)}</div>
          {p.requested ? <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-900">✔ {tx('You asked for the mandate', 'आपने मंडेट माँगा')}</span> : (
            <div className="flex gap-2"><input className={inp} placeholder={tx('Short note to the owner (optional)', 'मालिक के लिए छोटा नोट (वैकल्पिक)')} maxLength={200} value={note[p.id] || ''} onChange={e => setNote({ ...note, [p.id]: e.target.value })} />
              <button type="button" className={btn} disabled={busy} data-testid={`pool-ask-${p.id}`} onClick={async () => { setBusy(true); setErr(''); try { await api.olRequest(p.id, note[p.id]); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }}>{tx('Ask mandate', 'मंडेट माँगें')}</button></div>
          )}
        </div>
      ))}
    </div>
  );
};

const KINDS = ['Residential Flat', 'Residential House', 'Residential Villa', 'Residential Plot', 'Commercial Shop', 'Commercial Office', 'Commercial Plot', 'Agricultural Land', 'Warehouse'];
const OwnerPlansAdmin: React.FC = () => {
  const tx = useTx(); const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const blank = { id: null as string | null, name: '', transactionTypes: [] as string[], propertyTypes: [] as string[], fee: '0', durationDays: '60', maxPhotos: '12', maxActivePerOwner: '3', refundable: false, active: true };
  const [f, setF] = useState<typeof blank | null>(null); const [upi, setUpi] = useState(''); const [rej, setRej] = useState<Record<string, string>>({});
  const load = useCallback(() => api.olAdmin().then(x => { setD(x); setUpi(x.cfg.upiId || ''); }).catch(e => setErr(e.message)), []);
  useEffect(() => { void load(); }, [load]);
  const run = async (fn: () => Promise<any>, after?: () => void) => { setBusy(true); setErr(''); try { await fn(); await load(); after?.(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  if (!d) return err ? <p className="text-xs text-red-700">{err}</p> : <Loader2 className="h-4 w-4 animate-spin" />;
  const tog = (arr: string[], v: string) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  return (
    <div className="space-y-3" data-testid="owner-plans-admin">
      <div><h2 className="text-base font-bold text-slate-900">{tx('Owner listing — master plan', 'मालिक लिस्टिंग — मास्टर प्लान')}</h2><p className="text-[11px] text-slate-500">{tx('Fee, days in the pool and limits for each kind of listing. A listing brought by a GENZ broker or a shop-QR partner is free but needs the mandate. GENZ never holds deal money — this is only GENZ’s own listing fee.', 'हर तरह की लिस्टिंग की फ़ीस, पूल में दिन और सीमाएँ। GENZ ब्रोकर या शॉप-QR से आई लिस्टिंग मुफ़्त है पर मंडेट ज़रूरी। GENZ डील का पैसा कभी नहीं रखता — यह सिर्फ़ GENZ की अपनी लिस्टिंग फ़ीस है।')}</p></div>
      {err && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700" role="alert">{err}</p>}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={d.cfg.enabled} onChange={e => run(() => api.olAdminCfg({ enabled: e.target.checked }))} data-testid="olcfg-enabled" />{tx('Owners may list on their own', 'मालिक ख़ुद लिस्टिंग कर सकते हैं')}</label>
        <div className="flex gap-2"><input className={inp} placeholder={tx('GENZ UPI for the fee (name@bank)', 'फ़ीस के लिए GENZ UPI (name@bank)')} value={upi} onChange={e => setUpi(e.target.value)} data-testid="olcfg-upi" /><button type="button" className={btn} disabled={busy} onClick={() => run(() => api.olAdminCfg({ upiId: upi }))}>{tx('Save', 'सेव')}</button></div>
      </div>

      {d.waiting.length > 0 && (
        <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3" data-testid="olwaiting">
          <div className="text-sm font-bold text-sky-900">{tx('Fees to confirm', 'पक्की करने वाली फ़ीस')} ({d.waiting.length})</div>
          {d.waiting.map((w: any) => (
            <div key={w.propertyId} className="space-y-1.5 rounded-lg bg-white p-2.5 text-xs">
              <div className="font-semibold">{w.ownerName} · {w.title}</div><div>{formatINR(w.fee)} · UTR <b>{w.ref}</b> · {w.paidOn}</div>
              <div className="flex gap-2"><button type="button" className={btn + ' !min-h-9'} disabled={busy} onClick={() => run(() => api.olConfirm(w.propertyId))} data-testid={`olconfirm-${w.propertyId}`}>{tx('Received ✔', 'मिल गया ✔')}</button>
                <input className={inp + ' !min-h-9'} placeholder={tx('Reason if not found', 'न मिले तो कारण')} value={rej[w.propertyId] || ''} onChange={e => setRej({ ...rej, [w.propertyId]: e.target.value })} /><button type="button" className={ghost + ' !min-h-9'} disabled={busy || (rej[w.propertyId] || '').length < 3} onClick={() => run(() => api.olReject(w.propertyId, rej[w.propertyId]))}>{tx('Not found', 'नहीं मिला')}</button></div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between"><div className="text-sm font-bold">{tx('Plans', 'प्लान')} ({d.plans.length})</div><button type="button" className={btn} onClick={() => setF({ ...blank })} data-testid="olplan-new"><Plus className="h-4 w-4" />{tx('New plan', 'नया प्लान')}</button></div>
      {d.plans.map((p: any) => (
        <div key={p.id} className={`rounded-xl border bg-white p-3 text-xs ${p.active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`} data-testid={`olplan-${p.id}`}>
          <div className="flex items-center justify-between gap-2"><b className="text-sm">{p.name}</b><span className="font-extrabold text-emerald-700">{p.fee > 0 ? formatINR(p.fee) : tx('Free', 'मुफ़्त')}</span></div>
          <div className="text-slate-600">{p.transactionTypes.length ? p.transactionTypes.join(' / ') : tx('All deals', 'सभी')} · {p.propertyTypes.length ? p.propertyTypes.join(', ') : tx('all property kinds', 'सभी तरह की प्रॉपर्टी')}</div>
          <div className="text-slate-600">{p.durationDays} {tx('days', 'दिन')} · {p.maxPhotos} {tx('photos', 'फ़ोटो')} · {p.maxActivePerOwner} {tx('open listings per owner', 'खुली लिस्टिंग प्रति मालिक')}{p.refundable ? ` · ${tx('refundable', 'वापसी योग्य')}` : ''}{p.active ? '' : ` · ${tx('off', 'बंद')}`}</div>
          <div className="mt-2 flex gap-2"><button type="button" className={ghost + ' !min-h-9'} onClick={() => setF({ id: p.id, name: p.name, transactionTypes: p.transactionTypes, propertyTypes: p.propertyTypes, fee: String(p.fee), durationDays: String(p.durationDays), maxPhotos: String(p.maxPhotos), maxActivePerOwner: String(p.maxActivePerOwner), refundable: p.refundable, active: p.active })}>{tx('Edit', 'बदलें')}</button><button type="button" className={ghost + ' !min-h-9'} disabled={busy} onClick={() => run(() => api.olPlanDel(p.id))}>{tx('Delete', 'हटाएँ')}</button></div>
        </div>
      ))}
      {f && (
        <div className="space-y-2 rounded-xl border-2 border-slate-900 bg-white p-3" data-testid="olplan-form">
          <input className={inp} placeholder={tx('Plan name', 'प्लान का नाम')} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} data-testid="olplan-name" />
          <div className="text-[11px] font-semibold">{tx('Deal kind (none ticked = all)', 'डील का प्रकार (कुछ नहीं चुना = सभी)')}</div>
          <div className="flex flex-wrap gap-2">{['Sale', 'Rent', 'Lease'].map(t => <button key={t} type="button" onClick={() => setF({ ...f, transactionTypes: tog(f.transactionTypes, t) })} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${f.transactionTypes.includes(t) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300'}`}>{t}</button>)}</div>
          <div className="text-[11px] font-semibold">{tx('Property kind (none ticked = all)', 'प्रॉपर्टी का प्रकार (कुछ नहीं चुना = सभी)')}</div>
          <div className="flex flex-wrap gap-2">{KINDS.map(t => <button key={t} type="button" onClick={() => setF({ ...f, propertyTypes: tog(f.propertyTypes, t) })} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${f.propertyTypes.includes(t) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300'}`}>{t}</button>)}</div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <label>{tx('Fee ₹ (0 = free)', 'फ़ीस ₹ (0 = मुफ़्त)')}<input className={inp} inputMode="numeric" value={f.fee} onChange={e => setF({ ...f, fee: e.target.value.replace(/\D/g, '') })} data-testid="olplan-fee" /></label>
            <label>{tx('Days in the pool', 'पूल में दिन')}<input className={inp} inputMode="numeric" value={f.durationDays} onChange={e => setF({ ...f, durationDays: e.target.value.replace(/\D/g, '') })} data-testid="olplan-days" /></label>
            <label>{tx('Photos allowed', 'फ़ोटो की सीमा')}<input className={inp} inputMode="numeric" value={f.maxPhotos} onChange={e => setF({ ...f, maxPhotos: e.target.value.replace(/\D/g, '') })} /></label>
            <label>{tx('Open listings per owner', 'खुली लिस्टिंग प्रति मालिक')}<input className={inp} inputMode="numeric" value={f.maxActivePerOwner} onChange={e => setF({ ...f, maxActivePerOwner: e.target.value.replace(/\D/g, '') })} /></label>
          </div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.refundable} onChange={e => setF({ ...f, refundable: e.target.checked })} />{tx('Refundable / credited on title check or deal', 'टाइटल जाँच या डील पर वापस / क्रेडिट')}</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} />{tx('Plan is on', 'प्लान चालू')}</label>
          <div className="flex gap-2"><button type="button" className={btn} disabled={busy || f.name.trim().length < 2} data-testid="olplan-save" onClick={() => run(() => api.olPlanSave(f.id, { name: f.name, transactionTypes: f.transactionTypes, propertyTypes: f.propertyTypes, fee: Number(f.fee), durationDays: Number(f.durationDays), maxPhotos: Number(f.maxPhotos), maxActivePerOwner: Number(f.maxActivePerOwner), refundable: f.refundable, active: f.active }), () => setF(null))}>{tx('Save plan', 'प्लान सेव')}</button><button type="button" className={ghost} onClick={() => setF(null)}>{tx('Close', 'बंद')}</button></div>
          <p className="text-[11px] text-slate-500">{tx('A changed plan applies to NEW listings only.', 'बदला हुआ प्लान सिर्फ़ नई लिस्टिंग पर लगता है।')}</p>
        </div>
      )}
    </div>
  );
};

export const OwnerListingsTab: React.FC<{ role: string; goto: (t: string) => void }> = ({ role, goto }) => {
  if (role === 'PROPERTY_OWNER') return <OwnerHome goto={goto} />;
  if (role === 'BROKER') return <OwnerPool />;
  return <OwnerPlansAdmin />;
};
