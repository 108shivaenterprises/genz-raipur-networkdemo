/**
 * v73 — owner self-listing screens.
 *   OwnerSignIn        login page: "मैं मालिक हूँ" — mobile + one-time code (no password)
 *   OwnerListingsTab   one tab, three faces: the owner's listings (fee → pool → broker), the broker's pool, GENZ staff's master plan
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, ArrowLeft, Plus, Check, MapPin, Upload, Trash2, ExternalLink, ShieldCheck, Camera } from 'lucide-react';
import { INDIA_STATES, matchState, stateOfCity, citiesOf } from '../shared/india.js';
import { prepareDoc, shrinkImage } from '../lib/imgShrink.js';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';
import { FreeRouteOffer, OwnerBrokerRoute } from './LeadBoard.js';

const inp = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm';
const btn = 'inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50';
const ghost = 'inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800 disabled:opacity-50';

export const OwnerSignIn: React.FC<{ onLoggedIn: (s: any) => void; onBack: () => void }> = ({ onLoggedIn, onBack }) => {
  const tx = useTx();
  /** v80 — useTx() returns a NEW function on every render. `detect` used to depend on it, so every re-render made a "new" detect, the effect ran again, asked the phone for its location again and
   *  set state again — an endless loop (the flicker, and the city never settling). Now the latest tx sits in a ref and detect is created once. */
  const txRef = useRef(tx); txRef.current = tx;
  const [phone, setPhone] = useState(''); const [step, setStep] = useState<'phone' | 'code'>('phone'); const [code, setCode] = useState('');
  const [exists, setExists] = useState(false); const [name, setName] = useState(''); const [city, setCity] = useState(''); const [stateName, setStateName] = useState(''); const [country, setCountry] = useState('India'); const [ok, setOk] = useState(false);
  const [locNote, setLocNote] = useState(''); const [locBusy, setLocBusy] = useState(false); const touched = useRef(false); const autoRan = useRef(false); const alive = useRef(true);
  const [dev, setDev] = useState(''); const [tok, setTok] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  /** put a place into the form — only while the owner has not typed or chosen anything himself */
  const apply = useCallback((r: { state?: string; city?: string; country?: string }) => {
    if (touched.current) return;
    const st = matchState(r.state)?.name || (r.city ? stateOfCity(r.city) : '') || '';
    if (st) setStateName(st);
    if (r.city) setCity(r.city);
    if (r.country) setCountry(r.country);
  }, []);
  /** ask the phone for its location, turn it into state / city; if the phone will not say, the network address gives the rough city; the owner can change every field afterwards */
  const detect = useCallback(() => {
    const t = (en: string, hi: string) => txRef.current(en, hi);
    const viaNetwork = async (why: string) => {
      try {
        const r = await api.geoIp();
        if (!alive.current) return;
        if (r.found) { apply(r); setLocNote(t('Filled from your network area — change it if it is wrong.', 'आपके नेटवर्क इलाक़े से भरा गया — ग़लत हो तो बदल लें।')); return; }
      } catch { /* fall through to the plain note */ }
      if (alive.current) setLocNote(why);
    };
    setLocBusy(true); setLocNote('');
    const done = () => { if (alive.current) setLocBusy(false); };
    if (!navigator.geolocation) { void viaNetwork(t('This phone cannot share its location — choose your state and city.', 'यह फ़ोन लोकेशन नहीं दे सकता — अपना राज्य और शहर चुनें।')).finally(done); return; }
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const r = await api.geoReverse(pos.coords.latitude, pos.coords.longitude);
        if (!alive.current) return;
        if (r.found) { apply(r); setLocNote(t('Filled from your location — change it if it is wrong.', 'आपकी लोकेशन से भरा गया — ग़लत हो तो बदल लें।')); }
        else await viaNetwork(t('Could not find the place — choose your state and city.', 'जगह नहीं मिली — राज्य और शहर चुनें।'));
      } catch { await viaNetwork(t('Could not find the place — choose your state and city.', 'जगह नहीं मिली — राज्य और शहर चुनें।')); } finally { done(); }
    }, () => { void viaNetwork(t('Location was not allowed — choose your state and city.', 'लोकेशन की इजाज़त नहीं मिली — राज्य और शहर चुनें।')).finally(done); }, { timeout: 8000, maximumAge: 600000 });
  }, [apply]);
  // ONCE, the first time a new owner reaches the code step (never again on a re-render)
  useEffect(() => { if (step === 'code' && !exists && !autoRan.current) { autoRan.current = true; detect(); } }, [step, exists, detect]);
  const sendCode = async () => { const r = await api.ownerOtp(phone.replace(/\D/g, '')); setExists(r.exists); setDev(r.devCode || ''); setTok(r.otpToken || ''); setCode(''); };
  const go = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="owner-signin">
        <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs text-slate-500"><ArrowLeft className="h-3.5 w-3.5" />{tx('Back', 'वापस')}</button>
        <h1 className="text-base font-bold text-slate-900">🏠 {tx('Property owner — sign in with your mobile', 'प्रॉपर्टी मालिक — मोबाइल से साइन-इन')}</h1>
        <p className="mt-1 text-xs text-slate-600">{tx('No password. We send a 6-digit code to your mobile. New here? Your account is made in one step.', 'पासवर्ड नहीं। आपके मोबाइल पर 6 अंकों का कोड आएगा। नए हैं? अकाउंट एक ही बार में बन जाएगा।')}</p>
        {step === 'phone' ? (
          <form className="mt-4 space-y-3" onSubmit={e => { e.preventDefault(); void go(async () => { await sendCode(); setStep('code'); }); }}>
            <input className={inp} inputMode="numeric" maxLength={10} placeholder={tx('10-digit mobile', '10 अंकों का मोबाइल')} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} data-testid="owner-phone" />
            {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
            <button className={btn + ' w-full'} disabled={busy || phone.length !== 10} data-testid="owner-send">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : tx('Send code', 'कोड भेजें')}</button>
          </form>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={e => { e.preventDefault(); void go(async () => { const r = await api.ownerVerify({ phone, code: code.replace(/\D/g, ''), otpToken: tok || undefined, name: exists ? undefined : name, city: exists ? undefined : city, state: exists ? undefined : stateName || undefined, consent: exists ? undefined : ok }); void r; onLoggedIn(await api.getMe()); }); }}>
            {dev && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800" data-testid="owner-devcode">{tx('Demo: your code is', 'डेमो: आपका कोड')} <b>{dev}</b></p>}
            <input className={inp + ' text-center font-mono text-xl tracking-widest'} inputMode="numeric" maxLength={6} autoFocus autoComplete="one-time-code" placeholder="••••••" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} data-testid="owner-code" />
            {!exists && <>
              <input className={inp} placeholder={tx('Your name', 'आपका नाम')} value={name} onChange={e => setName(e.target.value)} data-testid="owner-name" />
              <div className="flex items-center justify-between"><span className="text-[11px] font-semibold text-slate-700">{tx('Where is your property?', 'आपकी प्रॉपर्टी कहाँ है?')}</span><button type="button" onClick={() => { touched.current = false; detect(); }} disabled={locBusy} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700" data-testid="owner-detect">{locBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}{tx('Use my location', 'मेरी लोकेशन लें')}</button></div>
              <select className={inp} value={country} onChange={e => { touched.current = true; setCountry(e.target.value); }} data-testid="owner-country"><option value="India">{tx('India', 'भारत')}</option></select>
              <select className={inp} value={stateName} onChange={e => { touched.current = true; setStateName(e.target.value); }} data-testid="owner-state"><option value="">{tx('State / UT', 'राज्य / केंद्र शासित')}</option>{INDIA_STATES.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}</select>
              <input className={inp} list="owner-city-list" placeholder={tx('City / town', 'शहर / क़स्बा')} value={city} onChange={e => { touched.current = true; const v = e.target.value; setCity(v); if (!stateName) { const st = stateOfCity(v); if (st) setStateName(st); } }} data-testid="owner-city" />
              <datalist id="owner-city-list">{citiesOf(stateName).map(c => <option key={c} value={c} />)}</datalist>
              {locNote && <p className="text-[11px] text-slate-500">{locNote}</p>}
              <label className="flex items-start gap-2 text-[11px] text-slate-600"><input type="checkbox" className="mt-0.5" checked={ok} onChange={e => setOk(e.target.checked)} data-testid="owner-consent" />{tx('I agree to GENZ keeping my name and mobile number to run my listing. If I give GENZ my face photo / ID, GENZ may keep them sealed for 3 years even after I delete my account (privacy policy).', 'मैं सहमत हूँ कि GENZ मेरी लिस्टिंग चलाने के लिए मेरा नाम और मोबाइल नंबर रखे। अगर मैं अपनी फ़ोटो / ID दूँ तो अकाउंट डिलीट करने के बाद भी GENZ उन्हें 3 साल सील करके रख सकता है (प्राइवेसी पॉलिसी)।')}</label>
            </>}
            {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
            {err && /expired|already used|new code|नया कोड/i.test(err) && <button type="button" className="text-xs font-semibold text-emerald-700 underline" disabled={busy} onClick={() => void go(sendCode)} data-testid="owner-resend">{tx('Send a new code', 'नया कोड भेजें')}</button>}
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
  PAID: ['Live — all GENZ brokers can see it', 'लाइव — सभी GENZ ब्रोकर देख सकते हैं', 'bg-emerald-100 text-emerald-900'],
    WAIVED_BROKER: ['With your broker — live after the mandate', 'आपके ब्रोकर के पास — मंडेट के बाद लाइव', 'bg-indigo-100 text-indigo-900'],
  EXPIRED: ['Time over — renew', 'समय पूरा — फिर चालू करें', 'bg-slate-200 text-slate-700'],
};


const Chip: React.FC<{ tone: 'ok' | 'wait' | 'bad'; children: React.ReactNode }> = ({ tone, children }) => <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${tone === 'ok' ? 'bg-emerald-100 text-emerald-900' : tone === 'bad' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>{children}</span>;

/** how big is the network my fee puts the property in front of */
export const NetworkStrip: React.FC = () => {
  const tx = useTx(); const [n, setN] = useState<any>(null);
  useEffect(() => { api.olNetwork().then(setN).catch(() => setN(null)); }, []);
  if (!n) return null;
  const box = (v: React.ReactNode, en: string, hi: string) => <div className="rounded-lg bg-white/10 p-2"><div className="text-lg font-extrabold leading-none">{v}</div><div className="mt-1 text-[10px] text-slate-300">{tx(en, hi)}</div></div>;
  return (
    <section className="rounded-xl bg-slate-900 p-3 text-white" data-testid="owner-network">
      <div className="text-xs font-bold">{tx('Your property goes in front of the GENZ network', 'आपकी प्रॉपर्टी GENZ नेटवर्क के सामने जाती है')}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {box(n.brokers, 'verified brokers', 'वेरिफ़ाइड ब्रोकर')}{box(n.activeBrokers, 'active this month', 'इस महीने सक्रिय')}{box(n.liveListings, 'live listings', 'लाइव लिस्टिंग')}{box(n.buyerNeeds, 'buyers looking now', 'अभी खोजते ख़रीदार')}
      </div>
      <p className="mt-2 text-[10px] text-slate-400">{tx(`${n.visits90d} verified site visits in the last 90 days · counted from GENZ records, totals only`, `पिछले 90 दिन में ${n.visits90d} सत्यापित साइट विज़िट · GENZ रिकॉर्ड से, सिर्फ़ कुल आँकड़े`)}</p>
    </section>
  );
};

/** what an owner can buy — shown before he lists, so the price is never a surprise */
const PlanCards: React.FC<{ onNew: () => void }> = ({ onNew }) => {
  const tx = useTx(); const [c, setC] = useState<any>(null);
  useEffect(() => { api.olConfig().then(setC).catch(() => setC(null)); }, []);
  if (!c) return null;
  return (
    <section className="space-y-2" data-testid="owner-plans">
      <div className="text-sm font-bold text-slate-900">{tx('Listing plans', 'लिस्टिंग प्लान')}</div>
      {!c.enabled && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{tx('Owner listing is paused by GENZ for now.', 'GENZ ने अभी मालिक लिस्टिंग रोकी है।')}</p>}
      {c.plans.length === 0 && <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{tx('GENZ has not set a plan yet. Ask a GENZ broker to list for you (free, after a mandate).', 'GENZ ने अभी कोई प्लान नहीं रखा। किसी GENZ ब्रोकर से लिस्ट करवाएँ (मुफ़्त, मंडेट के बाद)।')}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {c.plans.map((p: any) => (
          <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-3" data-testid={`plancard-${p.id}`}>
            <div className="flex items-baseline justify-between gap-2"><b className="text-sm">{p.name}</b><span className="text-lg font-extrabold text-emerald-700">{p.fee > 0 ? formatINR(p.fee) : tx('Free', 'मुफ़्त')}</span></div>
            <div className="mt-1 text-[11px] text-slate-600">{p.durationDays} {tx('days live', 'दिन लाइव')} · {p.maxPhotos} {tx('photos', 'फ़ोटो')} · {p.maxActivePerOwner} {tx('listings at a time', 'लिस्टिंग एक साथ')}</div>
            <div className="text-[11px] text-slate-500">{p.transactionTypes.length ? p.transactionTypes.join(' / ') : tx('All deals', 'सभी डील')} · {p.propertyTypes.length ? p.propertyTypes.join(', ') : tx('all property kinds', 'हर तरह की प्रॉपर्टी')}</div>
            <button type="button" className={btn + ' mt-2 w-full'} disabled={!c.enabled} onClick={onNew} data-testid={`plan-buy-${p.id}`}>{tx('List with this plan', 'इस प्लान से लिस्ट करें')}</button>
          </div>
        ))}
      </div>
      <ul className="space-y-0.5 text-[11px] text-slate-600">
        <li>• {tx('The plan is picked by your deal kind and property kind. You pay GENZ by UPI after you list, GENZ confirms, and it goes live.', 'प्लान आपकी डील और प्रॉपर्टी के प्रकार से अपने-आप चुनता है। लिस्ट करने के बाद GENZ को UPI से दें, GENZ पक्का करे, और लिस्टिंग लाइव।')}</li>
        <li>• {tx('Brokers earn from the buyer only — never from you. You only promise not to deal directly with a buyer they bring.', 'ब्रोकर की कमाई सिर्फ़ ख़रीदार से — आपसे कभी नहीं। आप बस वादा करते हैं कि उनके लाए ख़रीदार से सीधी डील नहीं करेंगे।')}</li>
        <li>• {tx('Free route: choose one broker from the Leadership Board (Top 10) of your city, agree his brokerage, sign the mandate — then it goes live with him. Papers and brokers stay in your control.', 'मुफ़्त रूट: अपने शहर के लीडरशिप बोर्ड (टॉप 10) से एक ब्रोकर चुनें, उसकी ब्रोकरेज तय करें, मंडेट साइन करें — फिर उसके साथ लाइव। काग़ज़ और ब्रोकर आपके कंट्रोल में रहते हैं।')}</li>
      </ul>
    </section>
  );
};

const DOC_LABEL: Record<string, [string, string]> = {
  SELFIE: ['Your face photo (selfie)', 'आपकी चेहरे की फ़ोटो (सेल्फ़ी)'], ID_AADHAAR_MASKED: ['Aadhaar (masked)', 'आधार (मास्क्ड)'], ID_PAN: ['PAN card', 'पैन कार्ड'], ID_VOTER: ['Voter ID', 'वोटर आईडी'], ID_DL: ['Driving licence', 'ड्राइविंग लाइसेंस'],
  ELECTRICITY_BILL: ['Electricity bill', 'बिजली बिल'], TAX_RECEIPT: ['Property tax receipt', 'प्रॉपर्टी टैक्स रसीद'], TITLE_DEED: ['Title / registry', 'टाइटल / रजिस्ट्री'], OTHER: ['Other paper', 'अन्य काग़ज़'],
};
const ID_KINDS = ['ID_AADHAAR_MASKED', 'ID_PAN', 'ID_VOTER', 'ID_DL'];

/** face + ID for me, papers for each property — photographed or picked from the phone; GENZ staff check them and the checker is named */
const VerifySection: React.FC<{ listings: any[] }> = ({ listings }) => {
  const tx = useTx(); const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [consent, setConsent] = useState(false);
  const [idKind, setIdKind] = useState('ID_AADHAAR_MASKED');
  const load = useCallback(() => api.odocList().then(setD).catch(e => setErr(e.message)), []);
  useEffect(() => { void load(); }, [load]);
  const send = async (kind: string, f: File | undefined, propertyId?: string) => {
    if (!f) return; setBusy(true); setErr('');
    try { const data = kind === 'SELFIE' ? await shrinkImage(f, 900, 350 * 1024) : await prepareDoc(f); await api.odocUpload({ kind, propertyId, data, name: f.name, consent }); await load(); }
    catch (e: any) { setErr(e?.message === 'PDF too big' ? tx('This PDF is over 1.4 MB — scan smaller or send a photo.', 'यह PDF 1.4 MB से बड़ा है — छोटा स्कैन करें या फ़ोटो भेजें।') : e?.message === 'bad image' ? tx('This file could not be read as a photo.', 'यह फ़ाइल फ़ोटो की तरह नहीं पढ़ी जा सकी।') : e.message); }
    finally { setBusy(false); }
  };
  const del = async (id: string) => { setBusy(true); setErr(''); try { await api.odocDelete(id); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  if (!d) return null;
  const mine = (k: string[], propertyId?: string) => d.docs.filter((x: any) => k.includes(x.kind) && (propertyId === undefined || x.propertyId === propertyId));
  const chip = (x: any) => x.status === 'APPROVED' ? <Chip tone="ok">✔ {tx('Checked by', 'जाँचा')} {x.review?.byName || 'GENZ'}</Chip> : x.status === 'REJECTED' ? <Chip tone="bad">{tx('Send again', 'दोबारा भेजें')}{x.review?.note ? `: ${x.review.note}` : ''}</Chip> : <Chip tone="wait">{tx('GENZ is checking', 'GENZ जाँच रहा है')}</Chip>;
  const row = (x: any) => (
    <div key={x.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs" data-testid={`odoc-${x.kind}`}>
      <div className="min-w-0"><div className="truncate font-semibold">{tx(...(DOC_LABEL[x.kind] || [x.kind, x.kind]) as [string, string])}</div>{chip(x)}</div>
      <div className="flex shrink-0 gap-1"><a className={ghost + ' !min-h-9 !px-2'} href={`/api/owner-media/doc/${x.id}/file`} target="_blank" rel="noreferrer" aria-label="open"><ExternalLink className="h-3.5 w-3.5" /></a>
        {x.status !== 'APPROVED' && <button type="button" className={ghost + ' !min-h-9 !px-2'} disabled={busy} onClick={() => del(x.id)} aria-label="delete"><Trash2 className="h-3.5 w-3.5" /></button>}</div>
    </div>
  );
  const pick = (label: React.ReactNode, onFile: (f?: File) => void, opts: { capture?: boolean; testId: string }) => (
    <label className={`${consent && !busy ? 'cursor-pointer' : 'pointer-events-none opacity-50'} inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white`}>
      {label}<input type="file" className="hidden" accept={opts.capture ? 'image/*' : 'image/*,application/pdf'} {...(opts.capture ? { capture: 'user' as const } : {})} onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} data-testid={opts.testId} />
    </label>
  );
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="owner-verify">
      <div className="flex items-start justify-between gap-2"><div><h3 className="flex items-center gap-1.5 text-sm font-bold"><ShieldCheck className="h-4 w-4 text-emerald-600" />{tx('Verification — who you are, and your papers', 'वेरिफ़िकेशन — आप कौन हैं और आपके काग़ज़')}</h3>
        <p className="text-[11px] text-slate-500">{tx('Upload from the camera or the phone. GENZ staff check them and your name tick shows who checked. Only you and GENZ staff can open them.', 'कैमरे या फ़ोन से अपलोड करें। GENZ स्टाफ़ जाँचता है और टिक पर जाँचने वाले का नाम दिखता है। सिर्फ़ आप और GENZ स्टाफ़ इन्हें खोल सकते हैं।')}</p></div>
        {d.idChecked && <Chip tone="ok">✔ {tx('Identity checked', 'पहचान जाँची गई')}</Chip>}</div>
      {err && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700" role="alert">{err}</p>}
      <label className="flex items-start gap-2 text-[11px]"><input type="checkbox" className="mt-0.5" checked={consent} onChange={e => setConsent(e.target.checked)} data-testid="odoc-consent" />{tx('I agree to GENZ keeping my face photo and ID to check me. Even if I later delete my account, GENZ may keep them sealed for 3 years for fraud / legal checks, then deletes them (privacy policy).', 'मैं सहमत हूँ कि GENZ मेरी जाँच के लिए मेरी चेहरे की फ़ोटो और ID रखे। बाद में मैं अकाउंट डिलीट भी कर दूँ तो भी GENZ धोखाधड़ी / क़ानूनी जाँच के लिए इन्हें 3 साल सील करके रख सकता है, फिर मिटा देता है (प्राइवेसी पॉलिसी)।')}</label>

      <div className="space-y-2">
        <div className="text-xs font-bold">1. {tx('Your face photo', 'आपकी चेहरे की फ़ोटो')}</div>
        {mine(['SELFIE']).map(row)}
        {pick(<><Camera className="h-4 w-4" />{tx('Take / choose selfie', 'सेल्फ़ी लें / चुनें')}</>, f => send('SELFIE', f), { capture: true, testId: 'odoc-selfie' })}
      </div>
      <div className="space-y-2">
        <div className="text-xs font-bold">2. {tx('Your ID', 'आपकी ID')}</div>
        {mine(ID_KINDS).map(row)}
        <select className={inp} value={idKind} onChange={e => setIdKind(e.target.value)} data-testid="odoc-idkind">{ID_KINDS.map(k => <option key={k} value={k}>{tx(...DOC_LABEL[k] as [string, string])}</option>)}</select>
        {pick(<><Upload className="h-4 w-4" />{tx('Upload ID (photo or PDF)', 'ID अपलोड करें (फ़ोटो या PDF)')}</>, f => send(idKind, f), { testId: 'odoc-id' })}
      </div>
      <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
        <div className="text-xs font-bold">3. {tx('Property papers — bill, tax receipt, title / registry', 'प्रॉपर्टी के काग़ज़ — बिल, टैक्स रसीद, टाइटल / रजिस्ट्री')}</div>
        <p className="text-[11px] text-slate-600">{tx('Upload each paper ONCE, property by property, in Property Papers. Then, when you talk to a broker, share it with him for the days and the number of views you choose — and you can see who opened it.', 'हर काग़ज़ प्रॉपर्टी के हिसाब से सिर्फ़ एक बार “Property Papers” में अपलोड करें। फिर ब्रोकर से बात होने पर उसे उतने दिन और उतनी बार देखने के लिए शेयर करें जितना आप तय करें — और देखें कि किसने खोला।')}</p>
        <button type="button" className={ghost + ' w-full'} onClick={() => window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: 'propdocs' }))} data-testid="owner-open-papers"><ExternalLink className="h-4 w-4" />{tx('Open Property Papers', 'Property Papers खोलें')}</button>
        <p className="text-[11px] text-slate-500">{tx('The “GENZ verified property” tick comes only after the title is checked (by a broker or an advocate).', '“GENZ वेरिफ़ाइड प्रॉपर्टी” का टिक तभी आता है जब टाइटल जाँचा जाए (ब्रोकर या वकील से)।')}</p>
      </div>
    </section>
  );
};

export const OwnerPanel: React.FC<{ onNew: () => void; refreshKey?: number }> = ({ onNew, refreshKey }) => {
  const tx = useTx(); const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState<Record<string, string>>({}); const [nd, setNd] = useState<Record<string, boolean>>({});
  const load = useCallback(() => api.olMine().then(setD).catch(e => setErr(e.message)), []);
  useEffect(() => { void load(); }, [load, refreshKey]);
  const run = async (fn: () => Promise<any>) => { setBusy(true); setErr(''); try { await fn(); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  if (!d) return err ? <p className="text-xs text-red-700">{err}</p> : <Loader2 className="h-4 w-4 animate-spin" />;
  return (
    <div className="space-y-3" data-testid="owner-listings">
      <div className="flex items-center justify-between gap-2">
        <div><h2 className="text-base font-bold text-slate-900">{tx('My listings', 'मेरी लिस्टिंग')}</h2><p className="text-[11px] text-slate-500">{tx('Two ways: pay GENZ’s plan and go live for all brokers, or choose one broker free from your city’s Top 10 and go live after his mandate.', 'दो रास्ते: GENZ का प्लान देकर सभी ब्रोकरों के लिए लाइव, या अपने शहर के टॉप 10 में से एक ब्रोकर मुफ़्त चुनें और उसके मंडेट के बाद लाइव।')}</p></div>
        <button type="button" className={btn} onClick={onNew} data-testid="owner-new"><Plus className="h-4 w-4" />{tx('New listing', 'नई लिस्टिंग')}</button>
      </div>
      <NetworkStrip />
      <PlanCards onNew={onNew} />
      {err && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700" role="alert">{err}</p>}
      {d.listings.length === 0 && <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{tx('No listing yet. Choose a plan above and tap “New listing”.', 'अभी कोई लिस्टिंग नहीं। ऊपर प्लान देखें और “नई लिस्टिंग” दबाएँ।')}</p>}
      {d.listings.map((l: any) => {
        const s = STATUS[l.feeStatus] || ['', '', ''];
        return (
          <div key={l.propertyId} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" data-testid={`owner-listing-${l.propertyId}`}>
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900">{l.title}</div><div className="text-[11px] text-slate-500">{l.locality}, {l.city} · {formatINR(l.askingPrice)} · {l.propertyId}</div></div></div>
            <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${s[2]}`} data-testid="owner-listing-status">{tx(s[0], s[1])}</span>
            {l.listingStatus === 'active' && <p className="text-[11px] font-semibold text-emerald-700">✔ {tx('Live — matching and offers are on.', 'लाइव — मैचिंग और ऑफ़र चालू हैं।')}</p>}
            {['PENDING', 'REJECTED', 'EXPIRED'].includes(l.feeStatus) && l.fee > 0 && l.feeStatus !== 'EXPIRED' && (
              <div className="space-y-2 rounded-lg bg-amber-50 p-2.5 text-xs">
                <div>{tx('Listing fee', 'लिस्टिंग फ़ीस')}: <b>{formatINR(l.fee)}</b> · {l.durationDays} {tx('days in the pool', 'दिन पूल में')}{l.refundable ? ` · ${tx('refundable on title check / deal', 'टाइटल जाँच / डील पर वापस')}` : ''}</div>
                <div>{tx('Pay by UPI to', 'UPI से दें')}: <b>{d.upiId || tx('(GENZ will share)', '(GENZ बताएगा)')}</b>{d.payeeName ? ` (${d.payeeName})` : ''}. {tx('Then write the reference (UTR):', 'फिर रेफ़रेंस (UTR) लिखें:')}</div>
                {d.upiId && <a className={ghost + ' !min-h-9 w-full'} href={`upi://pay?pa=${encodeURIComponent(d.upiId)}&pn=${encodeURIComponent(d.payeeName || 'GENZ')}&am=${l.fee}&cu=INR&tn=${encodeURIComponent('GENZ listing ' + l.propertyId)}`} data-testid="owner-upi-link">{tx('Pay with my UPI app', 'अपने UPI ऐप से दें')} · {formatINR(l.fee)}</a>}
                <label className="flex items-start gap-2 text-[11px]"><input type="checkbox" className="mt-0.5" checked={!!nd[l.propertyId]} onChange={e => setNd({ ...nd, [l.propertyId]: e.target.checked })} data-testid="owner-nodirect" />{tx('I will not deal directly with any buyer or renter brought by GENZ brokers. Any number of brokers may show my property and take visits.', 'GENZ के ब्रोकर जो ख़रीदार / किराएदार लाएँगे, उससे मैं सीधी डील नहीं करूँगा। कितने भी ब्रोकर मेरी प्रॉपर्टी दिखा सकते हैं और विज़िट ले सकते हैं।')}</label>
                {l.rejectNote && <div className="text-red-700">{l.rejectNote}</div>}
                <div className="flex gap-2"><input className={inp} placeholder="UTR / Ref" value={ref[l.propertyId] || ''} onChange={e => setRef({ ...ref, [l.propertyId]: e.target.value })} data-testid="owner-utr" /><button type="button" className={btn} disabled={busy || !nd[l.propertyId] || (ref[l.propertyId] || '').length < 3} onClick={() => run(() => api.olPay(l.propertyId, { ref: ref[l.propertyId], noDirectDeal: !!nd[l.propertyId] }))} data-testid="owner-pay">{tx('Send', 'भेजें')}</button></div>
              </div>
            )}
            {l.feeStatus === 'EXPIRED' && l.fee > 0 && <button type="button" className={btn} disabled={busy} onClick={() => run(() => api.olRenew(l.propertyId))}>{tx('Renew', 'फिर चालू करें')}</button>}
            {['PENDING', 'REJECTED', 'EXPIRED'].includes(l.feeStatus) && <FreeRouteOffer l={l} onDone={load} />}
            {l.feeStatus === 'WAIVED_BROKER' && <OwnerBrokerRoute l={l} onDone={load} />}
            {l.inPool && <p className="text-[11px] text-slate-600" data-testid="owner-live-note">{tx('Any GENZ broker can see your listing (not your phone or address), bring buyers and take visits. The broker is paid by the buyer only — you pay no brokerage.', 'कोई भी GENZ ब्रोकर आपकी लिस्टिंग देख सकता है (आपका फ़ोन या पता नहीं), ख़रीदार ला सकता है और विज़िट ले सकता है। ब्रोकर को पैसा सिर्फ़ ख़रीदार देगा — आप ब्रोकरेज नहीं देंगे।')}{l.liveUntil ? ` ${tx('Live till', 'लाइव')} ${String(l.liveUntil).slice(0, 10)}.` : ''}</p>}
          </div>
        );
      })}
      <VerifySection listings={d.listings} />
    </div>
  );
};


/** GENZ staff: owner selfies / IDs / papers waiting to be checked */
const PapersQueue: React.FC = () => {
  const tx = useTx(); const [docs, setDocs] = useState<any[] | null>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [why, setWhy] = useState<Record<string, string>>({});
  const load = useCallback(() => api.odocAdminList().then(x => setDocs(x.docs)).catch(e => setErr(e.message)), []);
  useEffect(() => { void load(); }, [load]);
  const decide = async (id: string, ok: boolean) => { setBusy(true); setErr(''); try { await api.odocAdminDecide(id, ok, why[id]); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  if (!docs) return null;
  return (
    <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50 p-3" data-testid="papers-queue">
      <div className="text-sm font-bold text-violet-900">{tx('Owner papers to check', 'जाँचने वाले मालिक के काग़ज़')} ({docs.length})</div>
      {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
      {docs.length === 0 && <p className="text-xs text-violet-800">{tx('Nothing waiting.', 'कुछ बाकी नहीं।')}</p>}
      {docs.map(x => (
        <div key={x.id} className="space-y-1.5 rounded-lg bg-white p-2.5 text-xs">
          <div className="font-semibold">{x.ownerName} (••{x.ownerPhoneLast4}) · {tx(...(DOC_LABEL[x.kind] || [x.kind, x.kind]) as [string, string])}{x.propertyTitle ? ` · ${x.propertyTitle}` : ''}</div>
          <a className={ghost + ' !min-h-9'} href={`/api/owner-media/doc/${x.id}/file`} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />{tx('Open', 'खोलें')}</a>
          <div className="flex gap-2"><button type="button" className={btn + ' !min-h-9'} disabled={busy} onClick={() => decide(x.id, true)} data-testid={`odoc-ok-${x.id}`}>{tx('Checked ✔', 'जाँच लिया ✔')}</button>
            <input className={inp + ' !min-h-9'} placeholder={tx('Reason if not clear', 'साफ़ न हो तो कारण')} value={why[x.id] || ''} onChange={e => setWhy({ ...why, [x.id]: e.target.value })} />
            <button type="button" className={ghost + ' !min-h-9'} disabled={busy || (why[x.id] || '').length < 3} onClick={() => decide(x.id, false)}>{tx('Send back', 'वापस भेजें')}</button></div>
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

      <PapersQueue />
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

/** the tab itself is for GENZ staff (master plan); owners see OwnerPanel inside their Property tab */
export const OwnerListingsTab: React.FC<{ role: string; goto?: (t: string) => void }> = () => <OwnerPlansAdmin />;
