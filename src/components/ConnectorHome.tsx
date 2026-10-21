import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, PlusCircle, Wallet, Handshake, CheckCircle2, Clock, Share2, ChevronDown, ChevronUp, Store, Info } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';
import { UserProfile } from '../types/index.js';
import { LocationFields, LocationValue } from './LocationFields.js';
import { SHOP_TYPES, REFERRAL_TYPES, shopLabel, referralLabel } from '../shared/connector.js';
import { formatINR } from '../lib/utils.js';
import { ShareTerms } from './ShareTerms.js';

const STATUS_STYLE: Record<string, string> = {
  SUBMITTED: 'bg-slate-100 text-slate-700', CONTACTED: 'bg-blue-100 text-blue-800', QUALIFIED: 'bg-indigo-100 text-indigo-800',
  IN_PROGRESS: 'bg-amber-100 text-amber-800', CLOSED_WON: 'bg-emerald-100 text-emerald-800', CLOSED_LOST: 'bg-rose-100 text-rose-800',
  DUPLICATE: 'bg-slate-200 text-slate-600', REJECTED: 'bg-slate-200 text-slate-600',
};
const STATUS_HI: Record<string, string> = {
  SUBMITTED: 'जमा हुआ', CONTACTED: 'संपर्क हुआ', QUALIFIED: 'ज़रूरत पक्की', IN_PROGRESS: 'काम जारी', CLOSED_WON: 'सौदा पक्का', CLOSED_LOST: 'आगे नहीं बढ़ा', DUPLICATE: 'पहले से दर्ज', REJECTED: 'स्वीकार नहीं',
};
const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-slate-900 focus:outline-none';

/** Home screen of a GENZ Connector (local shopkeeper / community partner). Big buttons, bilingual, phone-first. */
export const ConnectorHome: React.FC<{ currentUser: UserProfile; onProfileChanged?: () => void }> = ({ currentUser, onProfileChanged }) => {
  const { lang, setLang } = useI18n();
  // local partners: Hindi by default until they pick a language themselves
  useEffect(() => { try { if (!localStorage.getItem('genz_lang')) setLang('hi'); } catch { /* ignore */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const hi = lang === 'hi';
  const tx = (en: string, h: string) => (hi ? h : en);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<any>(null);
  const [overview, setOverview] = useState<any>(null);
  const [refs, setRefs] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    try {
      const [m, o, r] = await Promise.all([api.connectorMeta(), api.connectorOverview(), api.connectorReferrals()]);
      setMeta(m); setOverview(o); setRefs(r.referrals);
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const st = overview?.stats;
  const rewardLines = useMemo(() => refs.filter(r => r.rewardStatus === 'APPROVED' || r.rewardStatus === 'PAID'), [refs]);
  const label = (s: string) => (hi ? STATUS_HI[s] : s.replace('_', ' ').toLowerCase().replace(/^./, c => c.toUpperCase())) || s;

  if (loading) return <div className="flex items-center gap-2 py-16 justify-center text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">{shopLabel(currentUser.connector?.shopType, hi)} · {currentUser.connector?.shopName}</p>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">{tx(`Namaste, ${currentUser.name.split(' ')[0]} 🙏`, `नमस्ते, ${currentUser.name.split(' ')[0]} 🙏`)}</h2>
          <p className="text-xs text-slate-500">{tx('Refer people who want to buy, sell, rent or build — earn a reward when the deal closes.', 'जो लोग प्रॉपर्टी खरीदना, बेचना, किराए पर लेना-देना या निर्माण कराना चाहते हैं उन्हें जोड़ें — सौदा पक्का होने पर इनाम पाएँ।')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowProfile(v => !v)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700"><Store className="h-4 w-4" /> {tx('My shop & UPI', 'मेरी दुकान और UPI')}</button>
          <button disabled={meta && !meta.enabled} onClick={() => setShowForm(v => !v)} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-amber-300 disabled:opacity-50"><PlusCircle className="h-4 w-4" /> {tx('Refer someone', 'किसी को जोड़ें')}</button>
        </div>
      </div>

      {meta && !meta.enabled && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{tx('The referral programme is paused for now.', 'रेफ़रल प्रोग्राम अभी रुका हुआ है।')}</p>}
      {msg && <p className={`rounded-lg px-3 py-2 text-xs font-medium ${msg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{msg.text}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: Handshake, label: tx('Referrals', 'कुल रेफ़रल'), value: st?.total ?? 0 },
          { icon: Clock, label: tx('In progress', 'चालू'), value: st?.open ?? 0 },
          { icon: CheckCircle2, label: tx('Deals closed', 'सौदे पक्के'), value: st?.won ?? 0 },
          { icon: Wallet, label: tx('Reward earned', 'कुल इनाम'), value: formatINR(st?.rewardEarnedAmount ?? 0) },
        ].map(c => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
            <c.icon className="h-4 w-4 text-amber-500" />
            <div className="mt-1 text-lg font-bold text-slate-900">{c.value}</div>
            <div className="text-[11px] text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>
      {st && (st.rewardApprovedAmount > 0 || st.rewardPendingApproval > 0) && (
        <p className="text-xs text-slate-600">
          {st.rewardApprovedAmount > 0 && <span className="mr-4">💰 {tx('Approved, payout coming:', 'मंज़ूर, जल्द भुगतान:')} <b>{formatINR(st.rewardApprovedAmount)}</b></span>}
          {st.rewardPendingApproval > 0 && <span>⏳ {tx(`${st.rewardPendingApproval} closed deal(s) waiting for reward approval`, `${st.rewardPendingApproval} सौदे इनाम की मंज़ूरी का इंतज़ार कर रहे हैं`)}</span>}
        </p>
      )}

      {showProfile && <ProfileCard user={currentUser} hi={hi} onSaved={() => { setShowProfile(false); setMsg({ ok: true, text: tx('Saved', 'सेव हो गया') }); onProfileChanged?.(); }} />}
      {showForm && meta && (
        <ReferralForm user={currentUser} meta={meta} hi={hi} onDone={(r) => { setShowForm(false); setMsg({ ok: true, text: r.contactMode === 'CONNECTOR_INTRODUCES' ? tx(`Referral ${r.id} saved. Your credit is protected under this ID — keep it. GENZ will call YOU, and you introduce ${r.customerName}.`, `रेफ़रल ${r.id} सेव हुआ। इस ID से आपका क्रेडिट सुरक्षित है — इसे संभालकर रखें। GENZ आपको कॉल करेगा, और आप ${r.customerName} से मिलवाएँगे।`) : tx(`Referral ${r.id} submitted. GENZ will contact ${r.customerName} soon.`, `रेफ़रल ${r.id} जमा हुआ। GENZ जल्द ही ${r.customerName} से संपर्क करेगा।`) }); load(); }} />
      )}

      <div>
        <h3 className="mb-2 text-sm font-bold text-slate-900">{tx('My referrals', 'मेरे रेफ़रल')}</h3>
        {refs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">{tx('No referrals yet. Tap “Refer someone” to add your first one.', 'अभी कोई रेफ़रल नहीं। “किसी को जोड़ें” दबाकर पहला जोड़ें।')}</p>
        ) : (
          <div className="space-y-2">
            {refs.map(r => (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{r.customerName} <span className="font-normal text-slate-400">· {r.id}</span></div>
                    <div className="text-xs text-slate-500">{referralLabel(r.type, hi)} · {r.locality}, {r.city}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>{label(r.status)}</span>
                    {open === r.id ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  </div>
                </button>
                {r.rewardStatus !== 'NONE' && (
                  <p className="mt-1 text-xs font-semibold text-emerald-700">💰 {formatINR(r.rewardAmount)} · {r.rewardStatus === 'PAID' ? tx('Paid', 'भुगतान हुआ') : tx('Approved', 'मंज़ूर')}</p>
                )}
                <Stepper status={r.status} hi={hi} />
                <ShareTerms r={r} side="CONNECTOR" hi={hi} cap={meta?.maxSharePct} onChanged={() => { setMsg({ ok: true, text: tx('Saved', 'सेव हो गया') }); load(); }} />
                {r.contactMode === 'CONNECTOR_INTRODUCES' && !r.customerPhone && !['CLOSED_WON', 'CLOSED_LOST', 'DUPLICATE', 'REJECTED'].includes(r.status) && (
                  <AddNumber r={r} tx={tx} onDone={(m) => { setMsg({ ok: true, text: m }); load(); }} />
                )}
                {open === r.id && (
                  <ol className="mt-3 space-y-1.5 border-l-2 border-slate-200 pl-3 text-xs text-slate-600">
                    {r.events.map((e: any, i: number) => <li key={i}><span className="text-slate-400">{new Date(e.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span> — {e.action}</li>)}
                  </ol>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {rewardLines.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold text-slate-900">{tx('Reward ledger', 'इनाम का हिसाब')}</h3>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white text-xs">
            {rewardLines.map(r => (
              <div key={r.id} className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 last:border-0">
                <span>{r.customerName} · {referralLabel(r.type, hi)}</span>
                <span className="font-semibold">{formatINR(r.rewardAmount)} <span className={r.rewardStatus === 'PAID' ? 'text-emerald-700' : 'text-amber-700'}>{r.rewardStatus === 'PAID' ? `✔ ${r.payoutReference || ''}` : tx('pending payout', 'भुगतान बाकी')}</span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {meta && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          <p className="mb-2 flex items-center gap-1.5 font-semibold text-slate-800"><Info className="h-4 w-4" /> {tx('How it works', 'यह कैसे काम करता है')}</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>{tx('Tell the person GENZ may call them, then add their name & number.', 'व्यक्ति को बताएँ कि GENZ उन्हें फ़ोन करेगा, फिर नाम और नंबर जोड़ें।')}</li>
            <li>{tx('GENZ assigns a verified broker / contractor, who contacts them.', 'GENZ एक सत्यापित ब्रोकर/ठेकेदार को देता है, जो उनसे संपर्क करता है।')}</li>
            <li>{tx('When the deal closes, GENZ approves your reward and pays it to your UPI.', 'सौदा पक्का होने पर GENZ आपका इनाम मंज़ूर करके आपकी UPI पर भेजता है।')}</li>
          </ol>
          <p className="mt-3 rounded-lg bg-white p-2.5 text-[11px] text-slate-700">{tx('You are a GENZ referral partner, not a broker: you only introduce people. You never negotiate, take money from customers or promise returns. Your referral ID keeps your credit safe — the earliest registration of a person counts.', 'आप GENZ के रेफ़रल पार्टनर हैं, ब्रोकर नहीं: आप सिर्फ़ लोगों को मिलवाते हैं। आप न मोल-भाव करते हैं, न ग्राहक से पैसे लेते हैं, न मुनाफ़े का वादा करते हैं। आपका रेफ़रल ID आपका क्रेडिट सुरक्षित रखता है — किसी व्यक्ति का सबसे पहला रजिस्ट्रेशन गिना जाता है।')}</p>
          <p className="mt-3 font-semibold text-slate-800">{tx('Reward per closed deal (set by GENZ):', 'हर पक्के सौदे पर इनाम (GENZ तय करता है):')}</p>
          <div className="mt-1 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {REFERRAL_TYPES.map(t => <div key={t.id} className="flex justify-between border-b border-slate-200/70 py-1"><span>{hi ? t.hi : t.label}</span><b>{formatINR(meta.rewards?.[t.id] ?? t.defaultReward)}</b></div>)}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">{tx('Rewards are paid only after the deal closes and GENZ approves it. Never ask the customer for money.', 'इनाम सौदा पक्का होने और GENZ की मंज़ूरी के बाद ही मिलता है। ग्राहक से कभी पैसे न माँगें।')}</p>
        </div>
      )}
    </div>
  );
};

/** v31 — where this referral is, in five dots */
const STEPS = ['SUBMITTED', 'CONTACTED', 'QUALIFIED', 'IN_PROGRESS', 'CLOSED_WON'] as const;
const STEP_LABEL: Record<string, [string, string]> = { SUBMITTED: ['Sent', 'भेजा'], CONTACTED: ['Called', 'संपर्क'], QUALIFIED: ['Need confirmed', 'ज़रूरत पक्की'], IN_PROGRESS: ['In progress', 'काम जारी'], CLOSED_WON: ['Deal done', 'सौदा पक्का'] };
const Stepper: React.FC<{ status: string; hi: boolean }> = ({ status, hi }) => {
  const stopped = ['CLOSED_LOST', 'DUPLICATE', 'REJECTED'].includes(status);
  const at = STEPS.indexOf(status as any);
  return (
    <div className="mt-2 flex items-center gap-1" aria-label={status} data-testid="ref-stepper">
      {STEPS.map((s, i) => (
        <React.Fragment key={s}>
          <div className="flex flex-col items-center">
            <span className={`h-3 w-3 rounded-full ${stopped ? 'bg-slate-300' : i <= at ? (status === 'CLOSED_WON' ? 'bg-emerald-500' : 'bg-amber-500') : 'bg-slate-200'}`} />
            <span className={`mt-0.5 text-[9px] leading-tight ${!stopped && i <= at ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>{STEP_LABEL[s][hi ? 1 : 0]}</span>
          </div>
          {i < STEPS.length - 1 && <span className={`mb-3 h-0.5 flex-1 ${!stopped && i < at ? 'bg-amber-400' : 'bg-slate-200'}`} />}
        </React.Fragment>
      ))}
    </div>
  );
};

const ReferralForm: React.FC<{ user: UserProfile; meta: any; hi: boolean; onDone: (r: any) => void }> = ({ user, meta, hi, onDone }) => {
  const tx = (en: string, h: string) => (hi ? h : en);
  const [type, setType] = useState('BUY_PROPERTY');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [intro, setIntro] = useState(false);
  const [loc, setLoc] = useState<LocationValue>({ state: user.state || '', city: user.city || '', locality: user.connector?.locality || '', pincode: '' });
  const [budget, setBudget] = useState('');
  const [details, setDetails] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await api.connectorRefer({ type, customerName: name, contactMode: intro ? 'CONNECTOR_INTRODUCES' : 'SHARE_NUMBER', customerPhone: intro ? undefined : phone, customerConsent: consent, state: loc.state || undefined, city: loc.city, locality: loc.locality, budgetNote: budget || undefined, details: details || undefined });
      onDone(r.referral);
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border-2 border-amber-300 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">{tx('New referral', 'नया रेफ़रल')}</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {REFERRAL_TYPES.map(t => (
          <label key={t.id} className={`cursor-pointer rounded-xl border px-3 py-2.5 text-xs font-medium ${type === t.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
            <input type="radio" name="rtype" className="sr-only" checked={type === t.id} onChange={() => setType(t.id)} />
            {hi ? t.hi : t.label} <span className={type === t.id ? 'text-amber-300' : 'text-emerald-700'}>· {formatINR(meta.rewards?.[t.id] ?? t.defaultReward)}</span>
          </label>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {([[false, tx('I will share their number', 'मैं उनका नंबर दूँगा/दूँगी'), tx('GENZ calls the customer directly', 'GENZ ग्राहक को सीधे कॉल करेगा')], [true, tx('I will introduce them myself', 'मैं खुद मिलवाऊँगा/मिलवाऊँगी'), tx('Number stays with you; GENZ calls YOU', 'नंबर आपके पास रहेगा; GENZ आपको कॉल करेगा')]] as [boolean, string, string][]).map(([v, l, d]) => (
          <label key={String(v)} className={`cursor-pointer rounded-xl border px-3 py-2 text-xs ${intro === v ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-white text-slate-700'}`}>
            <input type="radio" name="cmode" className="sr-only" checked={intro === v} onChange={() => setIntro(v)} />
            <div className="font-semibold">{l}</div><div className="text-[11px] opacity-80">{d}</div>
          </label>
        ))}
      </div>
      {intro && <p className="rounded-lg bg-sky-50 p-2 text-[11px] text-sky-900">{tx('Your referral ID protects your credit: if the same person is registered by someone else later, yours counts first. The customer number can be added later, when they are comfortable.', 'आपका रेफ़रल ID आपके क्रेडिट को सुरक्षित रखता है: अगर वही व्यक्ति बाद में किसी और से दर्ज हुआ, तो आपका पहले गिना जाएगा। ग्राहक का नंबर बाद में, जब वे सहज हों, जोड़ा जा सकता है।')}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="text-xs font-semibold text-slate-700">{tx("Person's name", 'व्यक्ति का नाम')} *</label><input required value={name} onChange={e => setName(e.target.value)} className={input} /></div>
        {!intro && <div><label className="text-xs font-semibold text-slate-700">{tx('Mobile number', 'मोबाइल नंबर')} *</label><input required inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9XXXXXXXXX" className={input} /></div>}
      </div>
      <LocationFields value={loc} onChange={setLoc} showPincode={false} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="text-xs font-semibold text-slate-700">{tx('Budget / need (optional)', 'बजट / ज़रूरत (वैकल्पिक)')}</label><input value={budget} onChange={e => setBudget(e.target.value)} placeholder={tx('e.g. around 40 lakh', 'जैसे 40 लाख के आसपास')} className={input} /></div>
        <div><label className="text-xs font-semibold text-slate-700">{tx('Anything else (optional)', 'कुछ और (वैकल्पिक)')}</label><input value={details} onChange={e => setDetails(e.target.value)} className={input} /></div>
      </div>
      <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
        <input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>{intro ? tx('This person knows I am recommending them to GENZ and agrees to be contacted through me.', 'इस व्यक्ति को पता है कि मैं उन्हें GENZ से मिलवा रहा/रही हूँ, और वे मेरे माध्यम से संपर्क के लिए सहमत हैं।') : tx('I have told this person that GENZ may call or WhatsApp them about this, and they agreed.', 'मैंने इस व्यक्ति को बता दिया है कि GENZ इस बारे में उन्हें फ़ोन/WhatsApp कर सकता है, और वे सहमत हैं।')}</span>
      </label>
      {error && <p className="text-xs font-medium text-red-700">{error}</p>}
      <button disabled={busy || !consent} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-amber-300 disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />} <Share2 className="h-4 w-4" /> {tx('Submit referral', 'रेफ़रल जमा करें')}</button>
    </form>
  );
};

const ProfileCard: React.FC<{ user: UserProfile; hi: boolean; onSaved: () => void }> = ({ user, hi, onSaved }) => {
  const tx = (en: string, h: string) => (hi ? h : en);
  const c = user.connector;
  const [shopType, setShopType] = useState<string>(c?.shopType || 'COMMUNITY_MEMBER');
  const [shopName, setShopName] = useState(c?.shopName || '');
  const [locality, setLocality] = useState(c?.locality || '');
  const [upi, setUpi] = useState(c?.payoutUpi || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.connectorSaveProfile({ shopType, shopName, locality: locality || undefined, payoutUpi: upi || '' }); onSaved(); }
    catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-900">{tx('My shop & payout details', 'मेरी दुकान और भुगतान विवरण')}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="text-xs font-semibold text-slate-700">{tx('Type', 'प्रकार')}</label><select value={shopType} onChange={e => setShopType(e.target.value)} className={input}>{SHOP_TYPES.map(s => <option key={s.id} value={s.id}>{hi ? s.hi : s.label}</option>)}</select></div>
        <div><label className="text-xs font-semibold text-slate-700">{tx('Shop / group name', 'दुकान / समूह का नाम')}</label><input required value={shopName} onChange={e => setShopName(e.target.value)} className={input} /></div>
        <div><label className="text-xs font-semibold text-slate-700">{tx('Area / locality', 'इलाका')}</label><input value={locality} onChange={e => setLocality(e.target.value)} className={input} /></div>
        <div><label className="text-xs font-semibold text-slate-700">UPI ID</label><input value={upi} onChange={e => setUpi(e.target.value)} placeholder="name@okaxis" className={input} /></div>
      </div>
      {error && <p className="text-xs font-medium text-red-700">{error}</p>}
      <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{tx('Save', 'सेव करें')}</button>
    </form>
  );
};

const AddNumber: React.FC<{ r: any; tx: (en: string, h: string) => string; onDone: (msg: string) => void }> = ({ r, tx, onDone }) => {
  const [num, setNum] = useState('');
  const [err, setErr] = useState('');
  const go = async () => {
    setErr('');
    try {
      const res = await api.connectorAttachContact(r.id, num);
      onDone(res.duplicate ? tx('This person was already registered earlier by someone else.', 'यह व्यक्ति पहले ही किसी और के द्वारा दर्ज है।') : tx('Number added.', 'नंबर जोड़ दिया गया।'));
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-[11px] text-sky-900">
      {tx('Number is with you. Add it when the customer is comfortable — GENZ checks it so nobody’s credit is lost.', 'नंबर आपके पास है। जब ग्राहक सहज हों तब जोड़ें — GENZ इसे जाँचता है ताकि किसी का क्रेडिट न छूटे।')}
      <div className="mt-1.5 flex gap-2">
        <input value={num} onChange={e => setNum(e.target.value)} inputMode="tel" placeholder="9XXXXXXXXX" className="w-36 rounded border border-slate-300 px-2 py-1 text-xs" />
        <button disabled={num.replace(/\D/g, '').length < 10} onClick={go} className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold disabled:opacity-40">{tx('Add number', 'नंबर जोड़ें')}</button>
      </div>
      {err && <p className="mt-1 text-red-700">{err}</p>}
    </div>
  );
};
