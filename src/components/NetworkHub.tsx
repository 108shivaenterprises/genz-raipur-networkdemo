import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Link2, ShieldCheck, UserPlus, Network, Building2, Gauge, Copy, Check, X, ChevronDown, BadgeCheck, Upload, Trash2, Eye } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatINR } from '../lib/utils.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { hasPerm } from '../lib/permissions.js';
import { SCOPE_KINDS, SHARE_MIN, SHARE_MAX } from '../shared/networkRules.js';
import { normPan, normAadhaar, panProblem, aadhaarProblem, isLast4, AADHAAR_NOTE, ID_DOC_NOTE } from '../shared/idRules.js';
import { IdDocSlot } from './IdDocSlot.js';
import { IdPhotoReader, type IdFill } from './IdPhotoReader.js';
import { KYC_CONSENT, KYC_VAULT_NOTE, addressProblem, pinProblem, normAddress, normPin, REVEAL_PURPOSE_LABEL, type RevealPurpose } from '../shared/kycRules.js';
import type { PreparedIdFile } from '../lib/idFile.js';
import type { UserProfile } from '../types/index.js';

const inp = 'min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
const btn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-40';
const dark = `${btn} bg-slate-900 text-white`; const ghost = `${btn} border border-slate-300 bg-white text-slate-700`; const green = `${btn} bg-emerald-600 text-white`; const red = `${btn} border border-red-300 bg-white text-red-700`;
const d0 = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
type Act = (fn: () => Promise<any>, ok: string) => Promise<void>;

const TierBadge: React.FC<{ tier?: string | null }> = ({ tier }) => {
  const tx = useTx();
  if (!tier) return null;
  return tier === 'TIER1'
    ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800"><ShieldCheck className="h-3 w-3" />{tx('RERA no. on file', 'RERA नंबर दर्ज')}</span>
    : <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800">{tx('Local Associate (vouched)', 'लोकल एसोसिएट (वाउच्ड)')}</span>;
};

export const NetworkHub: React.FC<{ currentUser: UserProfile; permissions: string[] }> = ({ currentUser, permissions }) => {
  const tx = useTx();
  const tabs = useMemo(() => ([
    hasPerm(permissions, 'tieup:manage', 'pcontrol:manage') && ['tieups', 'Tie-ups', 'टाई-अप', Link2],
    hasPerm(permissions, 'network:use') && ['growth', 'My network', 'मेरा नेटवर्क', Network],
    hasPerm(permissions, 'tier2:vouch') && ['entry', 'Register & ID', 'रजिस्टर और ID', UserPlus],
    hasPerm(permissions, 'pcontrol:manage') && ['channel', 'Builder channel', 'बिल्डर चैनल', Building2],
    hasPerm(permissions, 'growth:manage') && ['admin', 'City tiers & desk', 'सिटी टियर और डेस्क', Gauge],
  ].filter(Boolean) as any[]), [permissions]);
  const [sub, setSub] = useState<string>(tabs[0]?.[0] || 'growth');
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [tick, setTick] = useState(0);
  const act: Act = async (fn, ok) => {
    try { await fn(); setToast({ ok: true, msg: ok }); setTick(t => t + 1); } catch (e: any) { setToast({ ok: false, msg: e.message }); }
    setTimeout(() => setToast(null), 6000);
  };
  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-bold text-slate-900">{tx('Network', 'नेटवर्क')}</h2>
        <p className="text-xs text-slate-500">{tx('Tie up with brokers, register local associates as their RERA sponsor, and run your builder channel. GENZ records the terms — it never holds the parties’ deal money.', 'ब्रोकर्स से टाई-अप करें, RERA स्पॉन्सर बनकर लोकल एसोसिएट रजिस्टर कराएँ और बिल्डर चैनल चलाएँ। GENZ सिर्फ़ शर्तें रिकॉर्ड करता है — पक्षों का डील का पैसा कभी अपने पास नहीं रखता।')}</p></div>
      {toast && <div role="status" className={`sticky top-2 z-30 rounded-lg px-3 py-2 text-xs font-medium shadow ${toast.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{toast.msg}</div>}
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map(([id, en, hi, Icon]) => <button key={id} onClick={() => setSub(id)} className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${sub === id ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}><Icon className="h-4 w-4" />{tx(en, hi)}</button>)}
      </div>
      {sub === 'tieups' && <TieupsTab act={act} tick={tick} currentUser={currentUser} permissions={permissions} />}
      {sub === 'entry' && <EntryTab act={act} tick={tick} />}
      {sub === 'growth' && <GrowthTab currentUser={currentUser} tick={tick} />}
      {sub === 'channel' && <ChannelTab act={act} tick={tick} />}
      {sub === 'admin' && <AdminTab act={act} tick={tick} permissions={permissions} />}
    </div>
  );
};

const Load: React.FC<{ d: any; err: string }> = ({ d, err }) => err ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p> : d ? null : <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" />;

// ───────────────────────── tie-ups ─────────────────────────
const SCOPE_HI: Record<string, string> = { RESALE: 'रीसेल', RENTAL: 'किराया', LAND: 'ज़मीन', NEW_PROJECT: 'नया प्रोजेक्ट', COMMERCIAL: 'कमर्शियल', ANY: 'सभी' };
const TieupsTab: React.FC<{ act: Act; tick: number; currentUser: UserProfile; permissions: string[] }> = ({ act, tick, permissions }) => {
  const tx = useTx();
  const label = useLabel();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  const [dir, setDir] = useState<any[] | null>(null); const [q, setQ] = useState(''); const [tier, setTier] = useState('');
  const [pick, setPick] = useState<any>(null);
  const [share, setShare] = useState(50); const [kinds, setKinds] = useState<string[]>(['RESALE']); const [days, setDays] = useState(180); const [note, setNote] = useState('');
  const canTie = hasPerm(permissions, 'tieup:manage');
  useEffect(() => { api.tuList().then(setD).catch(e => setErr(e.message)); }, [tick]);
  const search = useCallback(() => { api.tuDirectory(q, '', tier).then(r => setDir(r.brokers)).catch(e => setErr(e.message)); }, [q, tier]);
  if (!d) return <Load d={d} err={err} />;
  return (
    <div className="space-y-5">
      {canTie && <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-bold">{tx('Find a broker to tie up with', 'टाई-अप के लिए ब्रोकर खोजें')}</h3>
        <div className="flex gap-2"><input className={inp} placeholder={tx('Name or firm', 'नाम या फ़र्म')} value={q} onChange={e => setQ(e.target.value)} />
          <select className={inp + ' max-w-[9rem]'} value={tier} onChange={e => setTier(e.target.value)}><option value="">{tx('All tiers', 'सभी टियर')}</option><option value="TIER1">Tier 1</option><option value="TIER2">Tier 2</option></select></div>
        <button className={`${dark} w-full`} onClick={search}>{tx('Search', 'खोजें')}</button>
        {dir && dir.length === 0 && <p className="text-xs text-slate-500">{tx('No brokers found.', 'कोई ब्रोकर नहीं मिला।')}</p>}
        {dir?.map(b => (
          <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2">
            <div className="min-w-0"><div className="truncate text-sm font-semibold">{b.name} <TierBadge tier={b.tier} /></div><div className="truncate text-[11px] text-slate-500">{b.company || '—'} · {b.city} · {b.settledDeals} {tx('closed deals', 'पूरी डील')}</div></div>
            {b.tieup ? <span className="text-[10px] font-bold text-slate-500">{b.tieup}</span> : <button className={ghost} onClick={() => { setPick(b); setKinds(['RESALE']); }}>{tx('Tie up', 'टाई-अप')}</button>}
          </div>))}
        {pick && (
          <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
            <div className="text-xs font-bold">{tx('Terms with', 'शर्तें —')} {pick.name}</div>
            <label className="block text-[11px] font-semibold text-slate-700">{tx('Share for the buyer-side broker (the one who brings the buyer)', 'खरीदार लाने वाले (बायर-साइड) ब्रोकर का हिस्सा')}: <b>{share}%</b> · {tx('listing side', 'लिस्टिंग साइड')} {100 - share}%</label>
            <input type="range" min={SHARE_MIN} max={SHARE_MAX} value={share} onChange={e => setShare(Number(e.target.value))} className="w-full" />
            <div className="flex flex-wrap gap-1.5">{SCOPE_KINDS.map(k => {
              const blocked = pick.tier === 'TIER2' && (k === 'NEW_PROJECT' || k === 'ANY');
              return <button key={k} disabled={blocked} onClick={() => setKinds(kinds.includes(k) ? kinds.filter(x => x !== k) : [...kinds, k])} className={`min-h-9 rounded-full px-3 text-[11px] font-semibold disabled:opacity-30 ${kinds.includes(k) ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white'}`}>{tx(k.replace('_', ' ').toLowerCase(), SCOPE_HI[k])}</button>;
            })}</div>
            {pick.tier === 'TIER2' && <p className="text-[11px] text-amber-800">{tx('Local associates (no RERA) cannot be tied up for new / RERA projects.', 'लोकल एसोसिएट (बिना RERA) के साथ नए / RERA प्रोजेक्ट का टाई-अप नहीं हो सकता।')}</p>}
            <div className="flex items-center gap-2"><label className="text-[11px] font-semibold">{tx('Valid for (days)', 'वैधता (दिन)')}</label><input type="number" min={7} max={365} className={inp + ' max-w-24'} value={days} onChange={e => setDays(Number(e.target.value))} /></div>
            <textarea className={inp} rows={2} maxLength={300} placeholder={tx('Note (optional)', 'नोट (वैकल्पिक)')} value={note} onChange={e => setNote(e.target.value)} />
            <p className="text-[11px] text-slate-500">{tx('GENZ only records this. Brokerage is settled between you two; when you co-broke an accepted offer, the deal room opens with this split.', 'GENZ इसे सिर्फ़ रिकॉर्ड करता है। ब्रोकरेज आप दोनों के बीच तय होती है; स्वीकार हुए ऑफ़र पर डील रूम इसी स्प्लिट से खुलेगा।')}</p>
            <div className="flex gap-2"><button className={`${green} flex-1`} disabled={!kinds.length} onClick={() => act(async () => { await api.tuPropose({ toId: pick.id, introSharePct: share, scopeKinds: kinds, validDays: days, note: note || undefined }); setPick(null); search(); }, tx('Proposal sent', 'प्रस्ताव भेज दिया'))}>{tx('Send proposal', 'प्रस्ताव भेजें')}</button><button className={ghost} onClick={() => setPick(null)}>{tx('Cancel', 'रद्द')}</button></div>
          </div>)}
      </section>}
      {canTie && <section className="space-y-2"><h3 className="text-sm font-bold">{tx('My tie-ups', 'मेरे टाई-अप')} ({d.tieups.length})</h3>
        {d.tieups.length === 0 && <p className="text-xs text-slate-500">{tx('No tie-ups yet. Search a broker above.', 'अभी कोई टाई-अप नहीं। ऊपर से ब्रोकर खोजें।')}</p>}
        {d.tieups.map((t: any) => (
          <div key={t.id} className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-bold">{t.other?.name} <TierBadge tier={t.other?.tier} /></div><div className="text-[11px] text-slate-500">{t.other?.company} · {t.direction === 'OUT' ? tx('You proposed', 'आपने भेजा') : tx('They proposed', 'उन्होंने भेजा')} · {t.id}</div></div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${t.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : t.status === 'PROPOSED' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'}`}>{label('status', t.status)}</span></div>
            <div className="text-xs text-slate-700">{tx('Buyer-side', 'बायर-साइड')} <b>{t.introSharePct}%</b> / {tx('listing-side', 'लिस्टिंग-साइड')} <b>{100 - t.introSharePct}%</b> · {t.scopeKinds.join(', ')}{t.city ? ` · ${t.city}` : ''}</div>
            {t.status === 'ACTIVE' && <div className="text-[11px] text-slate-500">{tx('Valid until', 'वैध')} {d0(t.validUntil)} · {t.dealsUsed || 0} {tx('deals opened', 'डील खुलीं')} · {tx('seal', 'सील')} {t.agreementHash?.slice(0, 12)}…</div>}
            {t.note && <div className="text-[11px] italic text-slate-500">“{t.note}”</div>}
            <div className="flex flex-wrap gap-2">
              {t.status === 'PROPOSED' && t.direction === 'IN' && <><button className={green} onClick={() => act(() => api.tuAct(t.id, 'accept'), tx('Tie-up is active', 'टाई-अप चालू'))}><Check className="h-4 w-4" />{tx('Accept', 'स्वीकार')}</button><button className={red} onClick={() => act(() => api.tuAct(t.id, 'decline'), tx('Declined', 'अस्वीकार'))}>{tx('Decline', 'अस्वीकार')}</button></>}
              {t.status === 'PROPOSED' && t.direction === 'OUT' && <button className={ghost} onClick={() => act(() => api.tuAct(t.id, 'withdraw'), tx('Withdrawn', 'वापस लिया'))}>{tx('Withdraw', 'वापस लें')}</button>}
              {t.status === 'ACTIVE' && <button className={red} onClick={() => { const r = window.prompt(tx('Reason for ending this tie-up?', 'टाई-अप खत्म करने का कारण?')); if (r) act(() => api.tuAct(t.id, 'end', { reason: r }), tx('Tie-up ended', 'टाई-अप खत्म')); }}>{tx('End', 'खत्म करें')}</button>}
            </div>
          </div>))}
      </section>}
      <section className="space-y-2"><h3 className="text-sm font-bold">{tx('Builder partnerships', 'बिल्डर पार्टनरशिप')} ({d.mandates.length})</h3>
        {d.mandates.length === 0 && <p className="text-xs text-slate-500">{tx('None yet — builder projects open to RERA-verified (Tier 1) brokers under Projects.', 'अभी कोई नहीं — बिल्डर प्रोजेक्ट RERA-सत्यापित (Tier 1) ब्रोकर्स को "प्रोजेक्ट्स" में मिलते हैं।')}</p>}
        {d.mandates.map((m: any) => <div key={m.id} className="rounded-lg border border-slate-200 bg-white p-2 text-xs"><b>{m.projectName}</b> · {m.builderName} · {m.commissionPct}% · {label('status', m.status)}{m.validUntil ? ` · ${d0(m.validUntil)}` : ''}</div>)}
      </section>
    </div>
  );
};

// ───────────────────────── vouch & entry ─────────────────────────
const EntryTab: React.FC<{ act: Act; tick: number }> = ({ act, tick }) => {
  const tx = useTx();
  const label = useLabel();
  const [me, setMe] = useState<any>(null); const [apps, setApps] = useState<any[]>([]); const [cap, setCap] = useState<any>(null); const [err, setErr] = useState('');
  const [f, setF] = useState({ name: '', phone: '', city: '', reference: '', consent: false, companyName: '', panNumber: '', aadhaarLast4: '' });
  const [files, setFiles] = useState<{ PAN?: PreparedIdFile; AADHAAR?: PreparedIdFile }>({});
  const [invite, setInvite] = useState<{ code: string; text: string } | null>(null); const [copied, setCopied] = useState(false);
  useEffect(() => { Promise.all([api.netMe(), api.netApps(), api.netCaptain()]).then(([m, a, c]) => { setMe(m); setApps(a.applications); setCap(c); if (!f.city) setF(x => ({ ...x, city: x.city || '' })); }).catch(e => setErr(e.message)); /* eslint-disable-next-line */ }, [tick]);
  if (!me) return <Load d={me} err={err} />;
  const copy = (t: string) => { navigator.clipboard?.writeText(t).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };
  return (
    <div className="space-y-5">
      <section className="space-y-1 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2 text-sm font-bold">{tx('My status', 'मेरी स्थिति')} <TierBadge tier={me.tier} /></div>
        {me.probationUntil && <p className="text-xs text-amber-800">{tx(`Probation until ${d0(me.probationUntil)} — fewer listings / offers allowed.`, `प्रोबेशन ${d0(me.probationUntil)} तक — कम लिस्टिंग / ऑफ़र।`)}</p>}
        {me.sponsor && <p className="text-xs text-slate-700">{tx('Registered by', 'आपको रजिस्टर कराया')}: <b>{me.sponsor.name || '—'}</b>{me.sponsor.company ? ` · ${me.sponsor.company}` : ''}{me.sponsor.city ? ` · ${me.sponsor.city}` : ''}{me.sponsor.rera ? ` · RERA ${me.sponsor.rera}` : ''}</p>}
        {(me.canSponsor || me.sponsoredCount > 0) && <p className="text-xs text-slate-600">{tx('Registrations this month', 'इस महीने के रजिस्ट्रेशन')}: {me.vouchesUsed}/{me.vouchLimit}{me.isCaptain ? ` · ${tx('City Captain', 'सिटी कैप्टन')}` : ''} · {tx('Strikes', 'स्ट्राइक')}: {me.strikes} · {tx('People I registered', 'मैंने रजिस्टर कराए')}: {me.sponsoredCount}</p>}
        {!me.canSponsor ? <p className="text-xs text-red-700">{tx('Only RERA-registered (Tier 1) brokers can register a new associate. Add your RERA registration to become one.', 'सिर्फ़ RERA-रजिस्टर्ड (Tier 1) ब्रोकर ही नया एसोसिएट रजिस्टर करा सकते हैं। इसके लिए अपना RERA रजिस्ट्रेशन जोड़ें।')}</p> : me.vouchBlock && <p className="text-xs text-red-700">{me.vouchBlock}</p>}
        <p className="text-[11px] text-slate-500">{tx('Rule: a broker without RERA can join GENZ only when a RERA-registered (Tier 1) broker registers them — you are their sponsor. GENZ records who registered whom and the admin can see it. If the person you register is later suspended or blacklisted, you get a strike; two strikes pause registering for 6 months. Local associates cannot register others.', 'नियम: बिना RERA वाला ब्रोकर तभी जुड़ सकता है जब कोई RERA-रजिस्टर्ड (Tier 1) ब्रोकर उसे रजिस्टर कराए — आप उसके स्पॉन्सर हैं। GENZ रिकॉर्ड रखता है कि किसने किसे रजिस्टर किया और एडमिन को यह दिखता है। आपका रजिस्टर किया व्यक्ति बाद में सस्पेंड / ब्लैकलिस्ट हुआ तो आपको स्ट्राइक मिलता है; दो स्ट्राइक पर 6 महीने रजिस्टर करना बंद। लोकल एसोसिएट दूसरों को रजिस्टर नहीं करा सकते।')}</p>
      </section>
      {me.tier && <VerifiedPhotoCard />}
      {me.tier && <MyIdCard act={act} tick={tick} />}
      {me.canVouch && <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-bold">{tx('Register a local broker (you are the sponsor)', 'लोकल ब्रोकर रजिस्टर कराएँ (आप स्पॉन्सर हैं)')}</h3>
        <input className={inp} placeholder={tx('Full name', 'पूरा नाम')} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <input className={inp} inputMode="tel" placeholder={tx('Mobile number', 'मोबाइल नंबर')} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
        <input className={inp} placeholder={tx('City (same as yours)', 'शहर (आपके जैसा)')} value={f.city} onChange={e => setF({ ...f, city: e.target.value })} />
        <textarea className={inp} rows={3} maxLength={300} placeholder={tx('Local reference: who knows them, office / shop, how long', 'लोकल रेफ़रेंस: कौन जानता है, ऑफ़िस / दुकान, कितने समय से')} value={f.reference} onChange={e => setF({ ...f, reference: e.target.value })} />
        <label className="flex items-start gap-2 text-[11px] text-slate-600"><input type="checkbox" className="mt-0.5" checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} />{tx('This person agreed to be contacted by GENZ.', 'इस व्यक्ति ने GENZ से संपर्क के लिए सहमति दी है।')}</label>
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="text-xs font-bold text-slate-800">{tx('Their ID — fill what you know (optional)', 'उनकी ID — जो पता हो भरें (वैकल्पिक)')}</div>
          <p className="text-[11px] text-slate-500">{tx('Whatever you fill here comes PREFILLED on their sign-up form, so they only check it. They still type their own full Aadhaar when joining.', 'जो यहाँ भरेंगे वह उनके साइन-अप फ़ॉर्म में पहले से भरा मिलेगा — उन्हें सिर्फ़ जाँचना होगा। जुड़ते समय पूरा आधार वे खुद डालेंगे।')}</p>
          <input className={inp} placeholder={tx('Firm / office name', 'फ़र्म / ऑफ़िस का नाम')} value={f.companyName} onChange={e => setF({ ...f, companyName: e.target.value })} />
          <div>
            <input className={inp + ' font-mono'} maxLength={10} placeholder={tx('PAN, e.g. ABCPD1234E', 'PAN, जैसे ABCPD1234E')} value={f.panNumber} onChange={e => setF({ ...f, panNumber: e.target.value.toUpperCase().replace(/\s/g, '') })} aria-invalid={!!panProblem(f.panNumber)} />
            {panProblem(f.panNumber) && <p role="alert" className="mt-1 text-[11px] font-medium text-red-700">{tx(panProblem(f.panNumber)!.en, panProblem(f.panNumber)!.hi)}</p>}
          </div>
          <div>
            <input className={inp + ' font-mono'} inputMode="numeric" maxLength={4} placeholder={tx('Aadhaar — last 4 digits only', 'आधार — सिर्फ़ आख़िरी 4 अंक')} value={f.aadhaarLast4} onChange={e => setF({ ...f, aadhaarLast4: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
            {f.aadhaarLast4 && !isLast4(f.aadhaarLast4) && <p role="alert" className="mt-1 text-[11px] font-medium text-red-700">{tx('Give exactly 4 digits.', 'ठीक 4 अंक दें।')}</p>}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(['PAN', 'AADHAAR'] as const).map(k => (
              <IdDocSlot key={k} kind={k} pending={files[k]} onChoose={p => setFiles(x => ({ ...x, [k]: p }))} onClear={() => setFiles(x => ({ ...x, [k]: undefined }))} />
            ))}
          </div>
          <p className="text-[11px] text-slate-500">{tx(ID_DOC_NOTE.en, ID_DOC_NOTE.hi)}</p>
        </div>
        <p className="text-[11px] text-slate-500">{tx('They will have to give their own PAN and Aadhaar when joining, and the GENZ team sees the cards before approving. Your name stays on record as their sponsor.', 'जुड़ते समय उन्हें अपना PAN और आधार देना होगा, और मंज़ूरी से पहले GENZ टीम कार्ड देखती है। स्पॉन्सर के रूप में आपका नाम रिकॉर्ड में रहेगा।')}</p>
        <button className={`${dark} w-full`} disabled={!f.consent || !!panProblem(f.panNumber) || (!!f.aadhaarLast4 && !isLast4(f.aadhaarLast4))} onClick={() => act(async () => {
          const r = await api.netPropose({ ...f, companyName: f.companyName || undefined, panNumber: f.panNumber || undefined, aadhaarLast4: f.aadhaarLast4 || undefined });
          if (r.invitation) setInvite({ code: r.invitation.code, text: r.invitation.whatsappText });
          const failed: string[] = [];
          for (const k of ['PAN', 'AADHAAR'] as const) { const p = files[k]; if (p) { try { await api.idAppUpload(r.application.id, { kind: k, fileName: p.fileName, data: p.data }); } catch (e: any) { failed.push(`${k}: ${e.message}`); } } }
          setF({ name: '', phone: '', city: f.city, reference: '', consent: false, companyName: '', panNumber: '', aadhaarLast4: '' }); setFiles({});
          if (failed.length) throw new Error(tx('Registered and the invitation is ready, but a copy was not uploaded (' + failed.join('; ') + '). Add it from the request card below.', 'रजिस्टर हो गया और इन्विटेशन तैयार है, पर एक कॉपी अपलोड नहीं हुई (' + failed.join('; ') + ')। नीचे अनुरोध कार्ड से जोड़ें।'));
        }, tx('Registered — send the invitation on WhatsApp', 'रजिस्टर हो गया — इन्विटेशन WhatsApp पर भेजें'))}>{tx('Register & create invitation', 'रजिस्टर कराएँ और इन्विटेशन बनाएँ')}</button>
      </section>}
      {invite && <section className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><div className="text-xs font-bold text-emerald-900">{tx('Invitation ready — send this to them on WhatsApp', 'इन्विटेशन तैयार — WhatsApp पर भेजें')}</div><p className="whitespace-pre-wrap break-words text-[11px] text-emerald-900">{invite.text}</p><button className={green} onClick={() => copy(invite.text)}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{tx('Copy message', 'संदेश कॉपी')}</button></section>}
      {cap?.isCaptain && <section className="space-y-1 rounded-xl border border-violet-200 bg-violet-50/50 p-3 text-xs"><div className="font-bold text-violet-900">{tx('City Captain board', 'सिटी कैप्टन बोर्ड')} — {cap.chapters.map((c: any) => c.city).join(', ')}</div>
        <div>{tx('Members', 'मेंबर')}: {cap.members.total} (Tier 1: {cap.members.tier1}, Tier 2: {cap.members.tier2}, {tx('on probation', 'प्रोबेशन')}: {cap.members.onProbation})</div>
        {cap.flagged.length > 0 && <div className="text-red-700">{tx('Members with strikes', 'स्ट्राइक वाले')}: {cap.flagged.map((m: any) => `${m.name} (${m.strikes})`).join(', ')}</div>}
        <div className="text-[11px] text-slate-500">{tx('Every captain vouch is audited and shown to GENZ ops.', 'हर कैप्टन वाउच ऑडिट होता है और GENZ ऑप्स को दिखता है।')}</div></section>}
      <section className="space-y-2"><h3 className="text-sm font-bold">{tx('Requests', 'अनुरोध')} ({apps.length})</h3>
        {apps.length === 0 && <p className="text-xs text-slate-500">{tx('No requests yet.', 'अभी कोई अनुरोध नहीं।')}</p>}
        {apps.map(a => (
          <div key={a.id} className="space-y-1 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-bold">{a.name} · {a.city}</div><div className="text-[11px] text-slate-500">{a.phone} · {tx('sponsor', 'स्पॉन्सर')} {a.proposer}</div></div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${a.status === 'OPEN' ? 'bg-amber-100 text-amber-800' : a.status === 'INVITED' || a.status === 'JOINED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{label('status', a.status)}</span></div>
            <p className="text-[11px] text-slate-600">“{a.reference}”</p>
            <div className="text-[11px] text-slate-500">{tx('Registered by', 'रजिस्टर कराया')}: {a.vouches.map((v: any) => `${v.name}${v.as === 'CAPTAIN' ? ' (Captain)' : ''}`).join(', ')}</div>
            {a.mine && a.idGiven && <div className="flex flex-wrap gap-1 text-[10px] font-semibold">{([['company', 'Firm', 'फ़र्म'], ['pan', 'PAN', 'PAN'], ['aadhaar', 'Aadhaar last-4', 'आधार आख़िरी-4'], ['panDoc', 'PAN card copy', 'PAN कार्ड कॉपी'], ['aadhaarDoc', 'Aadhaar copy', 'आधार कॉपी']] as const).map(([k, en, hi2]) => <span key={k} className={`rounded-full px-2 py-0.5 ${a.idGiven[k] ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{a.idGiven[k] ? '✓' : '—'} {tx(en, hi2)}</span>)}</div>}
            {a.mine && ['OPEN', 'INVITED'].includes(a.status) && <AppIdDocs appId={a.id} act={act} />}
            <div className="flex flex-wrap gap-2">
              {a.status === 'OPEN' && !a.iVouched && me.canVouch && <button className={green} onClick={() => act(() => api.netVouch(a.id), tx('Added as co-sponsor', 'सह-स्पॉन्सर जुड़ा'))}><ShieldCheck className="h-4 w-4" />{tx('Co-sponsor', 'सह-स्पॉन्सर')}</button>}
              {a.status === 'INVITED' && a.mine && <button className={ghost} onClick={() => api.netInvite(a.id).then(r => setInvite({ code: r.invitation.code, text: r.invitation.whatsappText })).catch(e => act(async () => { throw e; }, ''))}>{tx('Show invitation', 'इन्विटेशन दिखाएँ')}</button>}
              {['OPEN', 'INVITED'].includes(a.status) && (a.mine || cap?.isCaptain) && <button className={red} onClick={() => { const n = a.mine ? '' : window.prompt(tx('Reason?', 'कारण?')); if (a.mine || n) act(() => api.netClose(a.id, n || ''), tx('Closed', 'बंद')); }}><X className="h-4 w-4" />{a.mine ? tx('Withdraw', 'वापस लें') : tx('Reject', 'अस्वीकार')}</button>}
            </div>
          </div>))}
      </section>
    </div>
  );
};

/** The sponsor adds / replaces the PAN card and masked-Aadhaar copies of a person he registered, until that person has joined. */
const AppIdDocs: React.FC<{ appId: string; act: Act }> = ({ appId, act }) => {
  const tx = useTx();
  const [open, setOpen] = useState(false); const [docs, setDocs] = useState<any[] | null>(null);
  useEffect(() => { if (open && docs === null) api.idAppDocs(appId).then(r => setDocs(r.docs)).catch(() => setDocs([])); }, [open, docs, appId]);
  return (
    <div className="space-y-2">
      <button className={ghost} onClick={() => setOpen(!open)}><Upload className="h-4 w-4" />{tx('ID copies for this person', 'इस व्यक्ति की ID कॉपी')}</button>
      {open && docs && <><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(['PAN', 'AADHAAR'] as const).map(k => (
          <IdDocSlot key={k} kind={k} doc={docs.find(x => x.kind === k)} canOpen
            onChoose={async p => { const r = await api.idAppUpload(appId, { kind: k, fileName: p.fileName, data: p.data }); setDocs(r.docs); await act(async () => {}, tx('Copy added — it will be prefilled for them', 'कॉपी जुड़ गई — उनके लिए पहले से लगी मिलेगी')); }}
            onClear={async () => { const x = docs.find(v => v.kind === k); if (x) { const r = await api.idAppDelete(appId, x.id); setDocs(r.docs); } }} />
        ))}
      </div><p className="text-[11px] text-slate-500">{tx(ID_DOC_NOTE.en, ID_DOC_NOTE.hi)}</p></>}
    </div>
  );
};

// ───────────────────────── my PAN + Aadhaar (v18, v19: reasons + ID copies) ─────────────────────────
/** My ID status (masked), the reason when a number is refused, my PAN card / masked-Aadhaar copies, and what the GENZ team said. The user record keeps only the last 4 Aadhaar digits; the full number and the address (if the member agreed) sit in the encrypted KYC vault. */
import { VerifiedPhotoCard } from './VerifiedPhoto.js';
const MyIdCard: React.FC<{ act: Act; tick: number }> = ({ act, tick }) => {
  const tx = useTx();
  const hi = useI18n().lang === 'hi';
  const [d, setD] = useState<any>(null);
  const [mine, setMine] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ pan: '', aadhaar: '', consent: false, address: '', pincode: '', photo: false });
  const [kv, setKv] = useState<any>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [saving, setSaving] = useState(false); const [err, setErr] = useState('');
  const first = React.useRef(true);
  useEffect(() => {
    api.kycMine().then(setKv).catch(() => setKv(null));
    Promise.all([api.netMyId(), api.idMine()]).then(([r, m]) => { setD(r); setMine(m); if (first.current) { first.current = false; setOpen(!r.id.hasPan || !r.id.hasAadhaar); } }).catch(() => setD(null));
  }, [tick]);
  if (!d) return null;
  const id = d.id;
  const aad = normAadhaar(f.aadhaar);
  const panIssue = f.pan ? panProblem(f.pan) : null;
  const aadIssue = aad ? aadhaarProblem(aad) : null;
  const panOk = f.pan ? !panIssue : id.hasPan;
  const aadOk = !!aad && !aadIssue;
  const addrIssue = f.address ? addressProblem(f.address) : null;
  const pinIssue = f.pincode ? pinProblem(f.pincode) : null;
  const vaultOn = !!(kv?.on ?? d?.id?.vault?.on);
  const apply = (v: IdFill) => setF(cur => ({ ...cur, ...(v.pan ? { pan: v.pan } : {}), ...(v.aadhaar ? { aadhaar: v.aadhaar } : {}), ...(v.address ? { address: v.address } : {}), ...(v.pincode ? { pincode: v.pincode } : {}), photo: true }));
  const missing = !id.hasPan || !id.hasAadhaar;
  // why the Save button is grey — said in words, never silently
  const todo: string[] = [];
  if (!panOk) todo.push(f.pan ? tx('fix the PAN', 'PAN ठीक करें') : tx('enter your PAN', 'PAN डालें'));
  if (!aadOk) todo.push(aad ? tx('fix the Aadhaar number', 'आधार नंबर ठीक करें') : tx('enter your Aadhaar number', 'आधार नंबर डालें'));
  if (addrIssue) todo.push(tx('fix the address', 'पता ठीक करें'));
  if (pinIssue) todo.push(tx('fix the PIN code', 'PIN कोड ठीक करें'));
  if (!f.consent) todo.push(tx('tick the agreement', 'सहमति पर टिक करें'));
  const docOf = (k: string) => mine?.docs?.find((x: any) => x.kind === k) || null;
  const save = async () => {
    setSaving(true); setErr('');
    try {
      const r = await api.netMyIdSave({ panNumber: f.pan ? normPan(f.pan) : undefined, aadhaarNumber: aad, consent: true, kycConsent: true, address: f.address ? normAddress(f.address) : undefined, pincode: f.pincode ? normPin(f.pincode) : undefined, kycSource: f.photo ? 'PHOTO' : 'TYPED' });
      setF({ pan: '', aadhaar: '', consent: false, address: '', pincode: '', photo: false }); setOpen(false);
      await act(async () => {}, r.vaultStored ? tx('Saved — your Aadhaar number and address are kept encrypted', 'सेव हो गया — आपका आधार नंबर और पता एन्क्रिप्ट करके रखे गए') : tx('Saved — only the last 4 Aadhaar digits are kept (GENZ is not keeping full KYC details right now)', 'सेव हो गया — आधार के सिर्फ़ आख़िरी 4 अंक रखे गए (GENZ अभी पूरा KYC नहीं ले रहा)'));
      api.kycMine().then(setKv).catch(() => {});
    } catch (e: any) { setErr(e.message || tx('Could not save', 'सेव नहीं हुआ')); }
    finally { setSaving(false); }
  };
  const asked = mine?.review?.status === 'CHANGES_ASKED';
  return (
    <section className={`space-y-2 rounded-xl border p-3 ${missing || asked ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold">{tx('My PAN & Aadhaar', 'मेरा PAN और आधार')}</h3>
        {id.checked ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800"><BadgeCheck className="h-3 w-3" />{tx('Seen by GENZ', 'GENZ ने देखा')}</span>
          : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{tx('Not yet seen by GENZ', 'GENZ ने अभी नहीं देखा')}</span>}
      </div>
      {asked && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800"><b>{tx('The GENZ team asks:', 'GENZ टीम ने कहा:')}</b> {mine.review.note}</p>}
      <div className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
        <div>PAN: <b className="font-mono">{id.pan || tx('not given', 'नहीं दिया')}</b></div>
        <div>{tx('Aadhaar', 'आधार')}: <b className="font-mono">{id.aadhaar || tx('not given', 'नहीं दिया')}</b></div>
      </div>
      {kv && (kv.hasAadhaar || kv.hasAddress) && (
        <div className="space-y-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5 text-xs text-emerald-950" data-testid="kyc-vault-card">
          <div className="flex items-center gap-1.5 font-bold"><ShieldCheck className="h-3.5 w-3.5" />{tx('Kept encrypted by GENZ', 'GENZ के पास एन्क्रिप्ट होकर')}</div>
          <div>{kv.hasAadhaar ? tx(`Full Aadhaar number (${kv.aadhaar})`, `पूरा आधार नंबर (${kv.aadhaar})`) : tx('Full Aadhaar number: not kept', 'पूरा आधार नंबर: नहीं रखा')} · {kv.hasAddress ? tx('Address', 'पता') : tx('Address: not given', 'पता: नहीं दिया')}</div>
          {kv.hasAddress && kv.address && <div className="text-[11px] text-emerald-900"><b>{tx('My address', 'मेरा पता')}:</b> {kv.address}{kv.pincode ? ` – ${kv.pincode}` : ''}</div>}
          <div className="text-[11px] text-emerald-900">{tx(KYC_VAULT_NOTE.en, KYC_VAULT_NOTE.hi)}</div>
          <div>
            <div className="flex items-center gap-1 text-[11px] font-bold"><Eye className="h-3.5 w-3.5" />{tx('Who opened my KYC', 'मेरा KYC किसने खोला')}</div>
            {kv.opened?.length ? <ul className="mt-1 space-y-1" data-testid="kyc-opened-list">{kv.opened.slice(0, 5).map((o: any, i: number) => <li key={i} className="rounded bg-white p-1.5 text-[11px]"><b>{o.by}</b> · {new Date(o.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {tx(REVEAL_PURPOSE_LABEL[o.purpose as RevealPurpose]?.en || o.purpose, REVEAL_PURPOSE_LABEL[o.purpose as RevealPurpose]?.hi || o.purpose)}<div className="text-slate-600">“{o.reason}”</div></li>)}</ul>
              : <div className="text-[11px] text-emerald-900">{tx('Nobody has opened it.', 'अभी तक किसी ने नहीं खोला।')}</div>}
          </div>
          <button type="button" className={red} disabled={delBusy} data-testid="kyc-delete" onClick={async () => {
            if (!window.confirm(tx('Delete my full Aadhaar number and address from GENZ? Your PAN and the last 4 Aadhaar digits stay for the ID check.', 'GENZ से मेरा पूरा आधार नंबर और पता हटा दें? ID जाँच के लिए PAN और आधार के आख़िरी 4 अंक रहेंगे।'))) return;
            setDelBusy(true);
            try { await api.kycDeleteMine(); await act(async () => {}, tx('Deleted', 'हटा दिया')); api.kycMine().then(setKv).catch(() => {}); }
            catch (e: any) { setErr(e.message || tx('Could not delete', 'हटाया नहीं जा सका')); }
            finally { setDelBusy(false); }
          }}>{delBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{tx('Delete my full Aadhaar & address', 'मेरा पूरा आधार और पता हटाएँ')}</button>
        </div>
      )}
      {missing && d.required && <p className="text-xs text-amber-900">{tx('A local associate (no RERA) is approved only after PAN and Aadhaar are on file and the GENZ team has seen the cards.', 'लोकल एसोसिएट (बिना RERA) की मंज़ूरी तभी होती है जब PAN और आधार दर्ज हों और GENZ टीम कार्ड देख ले।')}</p>}
      {!missing && !id.checked && <p className="text-[11px] text-slate-600">{tx('The GENZ team will check your PAN card and Aadhaar card — from the copies below, or on a video call / at the office.', 'GENZ टीम आपका PAN कार्ड और आधार कार्ड नीचे दी कॉपी से, या वीडियो कॉल / ऑफ़िस में देखेगी।')}</p>}
      {mine && <div className="space-y-2">
        <div className="text-xs font-bold text-slate-700">{tx('Photo / PDF of my cards', 'मेरे कार्ड की फ़ोटो / PDF')}</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(['PAN', 'AADHAAR'] as const).map(k => (
            <IdDocSlot key={k} kind={k} doc={docOf(k)} canOpen
              onChoose={async p => { await api.idMineUpload({ kind: k, fileName: p.fileName, data: p.data }); await act(async () => {}, tx('Copy uploaded — the GENZ team will look at it', 'कॉपी अपलोड हो गई — GENZ टीम देखेगी')); }}
              onClear={async () => { const x = docOf(k); if (x) { await api.idMineDelete(x.id); await act(async () => {}, tx('Copy deleted', 'कॉपी हटा दी')); } }} />
          ))}
        </div>
        <p className="text-[11px] text-slate-500">{tx(ID_DOC_NOTE.en, ID_DOC_NOTE.hi)}</p>
      </div>}
      {!open && <button className={ghost} onClick={() => setOpen(true)}><ChevronDown className="h-4 w-4" />{tx('Change my numbers', 'नंबर बदलें')}</button>}
      {open && <div className="space-y-2">
        <IdPhotoReader onApply={apply} className={ghost} />
        <div>
          <input className={inp + ' font-mono'} maxLength={10} placeholder={id.hasPan ? tx('PAN (leave empty to keep)', 'PAN (वही रखने के लिए खाली छोड़ें)') : tx('PAN, e.g. ABCPD1234E', 'PAN, जैसे ABCPD1234E')} value={f.pan} onChange={e => setF({ ...f, pan: e.target.value.toUpperCase().replace(/\s/g, '') })} aria-invalid={!!panIssue} aria-describedby="myid-pan-err" />
          {panIssue && <p id="myid-pan-err" role="alert" className="mt-1 text-[11px] font-medium text-red-700">{tx(panIssue.en, panIssue.hi)}</p>}
        </div>
        <div>
          <input className={inp + ' font-mono tracking-wider'} inputMode="numeric" autoComplete="off" maxLength={14} placeholder={tx('Aadhaar number (12 digits)', 'आधार नंबर (12 अंक)')} value={f.aadhaar} onChange={e => setF({ ...f, aadhaar: e.target.value.replace(/[^\d\s-]/g, '') })} aria-invalid={!!aadIssue} aria-describedby="myid-aad-err" />
          {aadIssue && <p id="myid-aad-err" role="alert" className="mt-1 text-[11px] font-medium text-red-700">{tx(aadIssue.en, aadIssue.hi)}</p>}
        </div>
        <div>
          <textarea className={inp} rows={3} maxLength={320} placeholder={tx('Address (as on your Aadhaar) — house / street, area, city', 'पता (जैसा आधार में है) — मकान / गली, इलाक़ा, शहर')} value={f.address} onChange={e => setF({ ...f, address: e.target.value })} aria-invalid={!!addrIssue} data-testid="myid-address" />
          {addrIssue && <p role="alert" className="mt-1 text-[11px] font-medium text-red-700">{tx(addrIssue.en, addrIssue.hi)}</p>}
        </div>
        <div>
          <input className={inp + ' font-mono'} inputMode="numeric" maxLength={6} placeholder={tx('PIN code', 'PIN कोड')} value={f.pincode} onChange={e => setF({ ...f, pincode: e.target.value.replace(/\D/g, '') })} aria-invalid={!!pinIssue} data-testid="myid-pin" />
          {pinIssue && <p role="alert" className="mt-1 text-[11px] font-medium text-red-700">{tx(pinIssue.en, pinIssue.hi)}</p>}
        </div>
        <p className="text-[11px] text-slate-500">{tx(AADHAAR_NOTE.en, AADHAAR_NOTE.hi)} {tx('Type the full number each time you save.', 'हर बार पूरा नंबर डालना होता है।')}</p>
        {!vaultOn && kv && <p className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900">{tx('GENZ is not keeping full KYC details right now — only the last 4 Aadhaar digits will be saved.', 'GENZ अभी पूरा KYC नहीं ले रहा — सिर्फ़ आधार के आख़िरी 4 अंक सेव होंगे।')}</p>}
        <label className="flex items-start gap-2 text-[11px] text-slate-600"><input type="checkbox" className="mt-0.5" checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} data-testid="myid-consent" />{tx(KYC_CONSENT.en, KYC_CONSENT.hi)}</label>
        {err && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs font-medium text-red-700">{err}</p>}
        <button className={`${dark} w-full`} disabled={todo.length > 0 || saving} onClick={save}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Save', 'सेव करें')}</button>
        {todo.length > 0 && <p className="text-[11px] text-amber-800">{tx('To save:', 'सेव करने के लिए:')} {todo.join(', ')}</p>}
      </div>}
    </section>
  );
};

// ───────────────────────── my network + trust card ─────────────────────────
/** v20 — units this broker sold in GENZ master-CP projects: his share, TDS, what GENZ has paid / still owes (only his own lines) */
const MyMasterCpCard: React.FC<{ tick: number }> = ({ tick }) => {
  const tx = useTx();
  const [d, setD] = useState<any>(null);
  useEffect(() => { api.revMine().then(setD).catch(() => setD(null)); }, [tick]);
  if (!d || !d.entries?.length) return null;
  const t = d.totals;
  const st = (s: string) => ({ NOT_DUE: tx('waits for builder', 'बिल्डर का इंतज़ार'), DUE: tx('GENZ to pay', 'GENZ देगा'), PAID: tx('paid', 'मिल गया'), ON_HOLD: tx('on hold', 'रुका') } as Record<string, string>)[s] || s;
  return (
    <section className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3" aria-label={tx('My GENZ project earnings', 'GENZ प्रोजेक्ट से मेरी कमाई')}>
      <div className="text-sm font-bold text-emerald-950">{tx('My earnings from GENZ projects', 'GENZ प्रोजेक्ट से मेरी कमाई')}</div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-lg bg-white p-2"><div className="font-bold">{formatINR(t.earned)}</div><div className="text-[11px] text-slate-600">{t.units} {tx('unit(s) — after TDS', 'यूनिट — TDS के बाद')}</div></div>
        <div className="rounded-lg bg-white p-2"><div className="font-bold">{formatINR(t.paid)}</div><div className="text-[11px] text-slate-600">{tx('paid to you', 'आपको मिला')}</div></div>
        <div className="rounded-lg bg-white p-2"><div className="font-bold">{formatINR(t.due)}</div><div className="text-[11px] text-slate-600">{tx('GENZ to pay now', 'GENZ अभी देगा')}</div></div>
        <div className="rounded-lg bg-white p-2"><div className="font-bold">{formatINR(t.waiting + t.onHold)}</div><div className="text-[11px] text-slate-600">{tx('after the builder pays', 'बिल्डर के देने के बाद')}</div></div>
      </div>
      <ul className="space-y-1">{d.entries.slice(0, 20).map((e: any) => <li key={e.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-white px-2 py-1.5 text-[11px]"><span><b>{e.projectName}</b>{e.unitNo ? ` · ${e.unitNo}` : ''} · {new Date(e.bookedAt).toLocaleDateString('en-IN')} · {e.sharePct}%</span><span>{formatINR(e.payable)} · <b>{st(e.status)}</b>{e.paidAt ? ` · UTR ${e.ref}` : ''}{e.holdReason ? ` · ${e.holdReason}` : ''}</span></li>)}</ul>
      <p className="text-[10px] text-emerald-900">{tx('GENZ pays your share after the builder pays GENZ for that unit, by bank transfer outside the app. Questions: GENZ desk.', 'उस यूनिट का पैसा बिल्डर से GENZ को मिलने के बाद GENZ आपका हिस्सा बैंक ट्रांसफ़र से (ऐप के बाहर) देता है। सवाल: GENZ डेस्क।')}</p>
    </section>
  );
};

const GrowthTab: React.FC<{ currentUser: UserProfile; tick: number }> = ({ currentUser, tick }) => {
  const tx = useTx();
  const label = useLabel();
  const [tree, setTree] = useState<any>(null); const [prof, setProf] = useState<any>(null); const [err, setErr] = useState('');
  const [sp, setSp] = useState<any>(null); const [me, setMe] = useState<any>(null);
  useEffect(() => {
    api.netTree().then(setTree).catch(e => setErr(e.message)); api.netProfile(currentUser.id).then(r => setProf(r.profile)).catch(() => setProf(null));
    // v28: only brokers (and the superadmin) register / sponsor other brokers — others got a 403 here on every visit
    if (['BROKER', 'SUPERADMIN'].includes(currentUser.role)) api.netSponsored().then(setSp).catch(() => setSp(null)); else setSp(null);
    api.netMe().then(setMe).catch(() => setMe(null));
  }, [tick, currentUser.id]);
  if (!tree) return <Load d={tree} err={err} />;
  return (
    <div className="space-y-5">
      {currentUser.role === 'BROKER' && <MyMasterCpCard tick={tick} />}
      {me?.sponsor && <section className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-xs"><b>{tx('Who registered me', 'मुझे किसने रजिस्टर कराया')}:</b> {me.sponsor.name || '—'}{me.sponsor.company ? ` · ${me.sponsor.company}` : ''}{me.sponsor.city ? ` · ${me.sponsor.city}` : ''}</section>}
      {sp && <section className="space-y-2"><h3 className="text-sm font-bold">{tx('People I registered', 'मैंने जिन्हें रजिस्टर कराया')} ({sp.totals.all}) · {tx('verified', 'सत्यापित')} {sp.totals.verified} · {tx('waiting', 'प्रतीक्षा')} {sp.totals.pending}{sp.totals.problem ? ` · ${tx('problem', 'समस्या')} ${sp.totals.problem}` : ''}</h3>
        <p className="text-[11px] text-slate-500">{tx('You are the sponsor of record for these members. If one is suspended or blacklisted, you get a strike.', 'इन मेंबर्स के आप स्पॉन्सर हैं। इनमें से कोई सस्पेंड / ब्लैकलिस्ट हुआ तो आपको स्ट्राइक मिलता है।')} {tx('Strikes', 'स्ट्राइक')}: {sp.strikes}{sp.openRequests ? ` · ${tx('open invitations', 'खुले इन्विटेशन')}: ${sp.openRequests}` : ''}</p>
        {sp.members.length === 0 && <p className="text-xs text-slate-500">{tx('Nobody yet. Use "Register & ID" to register a local broker.', 'अभी कोई नहीं। "रजिस्टर और ID" से लोकल ब्रोकर रजिस्टर कराएँ।')}</p>}
        {sp.members.map((m: any) => (
          <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2">
            <div className="min-w-0"><div className="truncate text-xs font-semibold">{m.name} <TierBadge tier={m.tier} /></div><div className="text-[10px] text-slate-500">{m.city} · {tx('joined', 'जुड़े')} {d0(m.joinedAt)} · {m.idOnFile ? (m.idChecked ? tx('ID seen by GENZ', 'ID GENZ ने देखी') : tx('ID on file, not yet seen', 'ID दर्ज, देखी नहीं')) : tx('ID missing', 'ID नहीं दी')}</div></div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${m.status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' : m.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>{label('status', m.status)}</span>
          </div>))}
      </section>}
      {prof && <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-xs font-bold text-slate-500">{tx('Your GENZ trust card (what other members see)', 'आपका GENZ ट्रस्ट कार्ड (दूसरे मेंबर जो देखते हैं)')}</div>
        <div className="flex items-center gap-2"><div className="text-base font-bold">{prof.name}</div><TierBadge tier={prof.tier} /></div>
        <div className="text-xs text-slate-500">{prof.company || '—'} · {prof.city} · {tx('member since', 'मेंबर')} {prof.memberSince}</div>
        <div className="grid grid-cols-3 gap-2 text-center">{[['settledDeals', 'Closed deals', 'पूरी डील'], ['verifiedVisits', 'Verified visits', 'वेरिफ़ाइड विज़िट'], ['activeTieups', 'Tie-ups', 'टाई-अप'], ['builderPartnerships', 'Builder partners', 'बिल्डर पार्टनर'], ['vouchesReceived', 'Vouches', 'वाउच'], ['membersBrought', 'Members brought', 'जोड़े मेंबर']].map(([k, en, hi]) => (
          <div key={k} className="rounded-lg bg-slate-50 p-2"><div className="text-lg font-bold">{prof.stats[k]}</div><div className="text-[10px] text-slate-500">{tx(en, hi)}</div></div>))}</div>
        {prof.note && <p className="text-[11px] text-slate-500">{prof.note}</p>}
      </section>}
      <section className="space-y-2"><h3 className="text-sm font-bold">{tx('People I brought in', 'मैंने जिन्हें जोड़ा')} ({tree.totals.all}) · {tx('verified', 'सत्यापित')} {tree.totals.verified}</h3>
        <p className="text-[11px] text-slate-500">{tx('Every verified member you bring earns points (never cash). Up to 3 levels shown.', 'आपके लाए हर सत्यापित मेंबर पर पॉइंट मिलते हैं (कैश नहीं)। 3 स्तर तक दिखता है।')}</p>
        {tree.nodes.length === 0 && <p className="text-xs text-slate-500">{tx('Nobody yet. Use "Vouch & entry" or share your invite code.', 'अभी कोई नहीं। "वाउच और एंट्री" इस्तेमाल करें या इन्विटेशन कोड शेयर करें।')}</p>}
        {tree.nodes.map((n: any) => (
          <div key={n.id} style={{ marginLeft: (n.depth - 1) * 14 }} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2">
            <div className="min-w-0"><div className="truncate text-xs font-semibold">{n.name} <TierBadge tier={n.tier} /></div><div className="text-[10px] text-slate-500">{n.role.replace('_', ' ')} · {n.city}</div></div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${n.status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{label('status', n.status)}</span>
          </div>))}
      </section>
    </div>
  );
};

// ───────────────────────── builder channel ─────────────────────────
const KIND: [string, string, string][] = [['SITE_VISIT_COORD', 'Site-visit coordination', 'साइट विज़िट कोऑर्डिनेशन'], ['PAPERWORK', 'Paperwork support', 'पेपरवर्क सपोर्ट'], ['LAUNCH_DAY', 'Launch day', 'लॉन्च डे'], ['OTHER', 'Other', 'अन्य']];
const ChannelTab: React.FC<{ act: Act; tick: number }> = ({ act, tick }) => {
  const tx = useTx();
  const label = useLabel();
  const [d, setD] = useState<any>(null); const [desk, setDesk] = useState<any>(null); const [err, setErr] = useState('');
  const [f, setF] = useState({ projectId: '', kind: 'SITE_VISIT_COORD', note: '' });
  useEffect(() => { Promise.all([api.netChannel(), api.netDesk()]).then(([a, b]) => { setD(a); setDesk(b); setF(x => ({ ...x, projectId: x.projectId || a.projects[0]?.id || '' })); }).catch(e => setErr(e.message)); }, [tick]);
  if (!d) return <Load d={d} err={err} />;
  return (
    <div className="space-y-5">
      <p className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">{tx(d.rule, 'बिल्डर प्रोजेक्ट सिर्फ़ RERA-सत्यापित (Tier 1) ब्रोकर्स के लिए हैं। जो ब्रोकर लीड पहले रजिस्टर करता है वही उसका मालिक है, बिल्डर कोई भी चैनल इस्तेमाल करे।')}</p>
      {d.projects.length === 0 && <p className="text-xs text-slate-500">{tx('No projects yet.', 'अभी कोई प्रोजेक्ट नहीं।')}</p>}
      {d.projects.map((p: any) => (
        <section key={p.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-bold">{p.projectName}</div><div className="text-[11px] text-slate-500">{p.city} · {p.partners} {tx('active partners', 'एक्टिव पार्टनर')} · {p.applied} {tx('waiting', 'प्रतीक्षा')}</div></div></div>
          <div className="grid grid-cols-2 gap-2">
            <button className={p.mode === 'OPEN' ? dark : ghost} onClick={() => act(() => api.pcSettings(p.id, { access: 'OPEN_APPLY' }), tx('Open to all Tier 1 brokers', 'सभी Tier 1 ब्रोकर्स के लिए खुला'))}>{tx('Open mandate', 'ओपन मैंडेट')}</button>
            <button className={p.mode === 'INVITED' ? dark : ghost} onClick={() => act(() => api.pcSettings(p.id, { access: 'INVITE_ONLY' }), tx('Invited members only', 'सिर्फ़ चुने हुए मेंबर'))}>{tx('Invited members only', 'सिर्फ़ चुने मेंबर')}</button>
          </div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={p.desk} onChange={e => act(() => api.pcSettings(p.id, { desk: e.target.checked }), e.target.checked ? tx('GENZ desk coordination ON', 'GENZ डेस्क कोऑर्डिनेशन चालू') : tx('GENZ desk coordination OFF', 'GENZ डेस्क कोऑर्डिनेशन बंद'))} />{tx('Let the GENZ desk coordinate visits & paperwork (no sales, no money)', 'GENZ डेस्क को विज़िट और पेपरवर्क कोऑर्डिनेट करने दें (बिक्री नहीं, पैसा नहीं)')}</label>
        </section>))}
      {d.projects.some((p: any) => p.desk) && <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-bold">{tx('Ask the GENZ desk', 'GENZ डेस्क से मदद')}</h3>
        <select className={inp} value={f.projectId} onChange={e => setF({ ...f, projectId: e.target.value })}>{d.projects.filter((p: any) => p.desk).map((p: any) => <option key={p.id} value={p.id}>{p.projectName}</option>)}</select>
        <select className={inp} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>{KIND.map(([k, en, hi]) => <option key={k} value={k}>{tx(en, hi)}</option>)}</select>
        <textarea className={inp} rows={2} maxLength={400} placeholder={tx('What do you need?', 'क्या चाहिए?')} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
        <button className={`${dark} w-full`} disabled={f.note.trim().length < 5} onClick={() => act(async () => { await api.netDeskNew(f); setF({ ...f, note: '' }); }, tx('Request sent to the GENZ desk', 'GENZ डेस्क को भेज दिया'))}>{tx('Send request', 'अनुरोध भेजें')}</button>
      </section>}
      {desk?.requests?.length > 0 && <section className="space-y-2"><h3 className="text-sm font-bold">{tx('Desk requests', 'डेस्क अनुरोध')}</h3>
        {desk.requests.map((r: any) => <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-2 text-xs"><b>{r.projectName}</b> · {label('status', r.kind)} · <span className="font-bold">{label('status', r.status)}</span><div className="text-slate-600">{r.note}</div>{r.response && <div className="text-emerald-800">↳ {r.response}</div>}</div>)}</section>}
      <p className="text-[11px] text-slate-500">{tx(desk?.scope || '', 'GENZ डेस्क सिर्फ़ विज़िट और पेपरवर्क कोऑर्डिनेट करता है। यह कभी खरीदार को नहीं बेचता और पैसा नहीं संभालता।')}</p>
    </div>
  );
};

// ───────────────────────── who registered whom (v18, GENZ ops) ─────────────────────────
type ChainFilter = 'all' | 'registered' | 'problem' | 'idMissing' | 'idNotSeen' | 'inactive' | 'unsponsored';
const PROBLEM = ['SUSPENDED', 'BLACKLISTED', 'REJECTED'];
const SponsorChain: React.FC<{ act: Act; tick: number; canCheck: boolean; ids?: any }> = ({ act, tick, canCheck, ids }) => {
  const tx = useTx();
  const label = useLabel();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  const [flt, setFlt] = useState<ChainFilter>('all'); const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => { api.netAdminSponsors().then(setD).catch(e => setErr(e.message)); }, [tick]);
  if (!d) return <Load d={d} err={err} />;
  const t = d.totals;
  const keep = (m: any) => flt === 'problem' ? PROBLEM.includes(m.status) : flt === 'idMissing' ? !m.idOnFile : flt === 'idNotSeen' ? m.idOnFile && !m.idChecked && m.status !== 'REJECTED' : true;
  const rows = d.sponsors.filter((s: any) => flt === 'unsponsored' ? false : flt === 'inactive' ? !s.active : true).map((s: any) => ({ ...s, shown: s.members.filter(keep) })).filter((s: any) => (['problem', 'idMissing', 'idNotSeen'].includes(flt) ? s.shown.length > 0 : true));
  const unspons = flt === 'all' || flt === 'unsponsored' || flt === 'idMissing' || flt === 'idNotSeen' ? d.unsponsored.filter(keep) : [];
  const tiles: [ChainFilter, string, string, number, string][] = [
    ['registered', 'Sponsors', 'स्पॉन्सर', t.sponsors, 'text-slate-900'], ['all', 'People registered', 'रजिस्टर हुए', t.sponsored, 'text-slate-900'],
    ['problem', 'Suspended / rejected', 'सस्पेंड / अस्वीकृत', t.problem, t.problem ? 'text-red-700' : 'text-slate-900'],
    ['idMissing', 'ID not on file', 'ID दर्ज नहीं', t.idMissing, t.idMissing ? 'text-amber-700' : 'text-slate-900'], ['idNotSeen', 'ID not yet seen', 'ID देखी नहीं', t.idNotSeen, t.idNotSeen ? 'text-amber-700' : 'text-slate-900'],
    ['inactive', 'Sponsor not active', 'स्पॉन्सर निष्क्रिय', t.inactiveSponsors, t.inactiveSponsors ? 'text-red-700' : 'text-slate-900'], ['unsponsored', 'No sponsor on record', 'स्पॉन्सर रिकॉर्ड नहीं', t.unsponsored, t.unsponsored ? 'text-amber-700' : 'text-slate-900'],
  ];
  const seeId = (m: any) => {
    if (m.idChecked) return act(() => api.netIdCheck(m.id, false), tx('"ID seen" tick removed', '"ID देखी" टिक हटाया'));
    const note = window.prompt(tx('What did you see? (e.g. PAN card + masked Aadhaar on video call). No numbers please.', 'क्या देखा? (जैसे वीडियो कॉल पर PAN कार्ड + मास्क्ड आधार)। नंबर न लिखें।'));
    if (note === null) return Promise.resolve();
    return act(() => api.netIdCheck(m.id, true, note), tx('Marked: ID seen', 'ID देखी — दर्ज'));
  };
  const member = (m: any) => (
    <div key={m.id} className="space-y-1 rounded-lg border border-slate-200 bg-slate-50/60 p-2 text-xs">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-semibold">{m.name} <TierBadge tier={m.tier} /></div><div className="text-[10px] text-slate-500">{m.city} · {tx('joined', 'जुड़े')} {d0(m.joinedAt)}{m.probationUntil ? ` · ${tx('probation till', 'प्रोबेशन')} ${d0(m.probationUntil)}` : ''}</div></div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${m.status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' : m.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>{label('status', m.status)}</span></div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
        <span>PAN: <b className="font-mono">{m.pan || '—'}</b></span><span>{tx('Aadhaar', 'आधार')}: <b className="font-mono">{m.aadhaar || '—'}</b></span>
        <span className={m.idChecked ? 'font-semibold text-emerald-700' : m.idOnFile ? 'text-amber-700' : 'text-red-700'}>{m.idChecked ? `✓ ${tx('ID seen', 'ID देखी')}${m.checkedBy ? ` (${m.checkedBy})` : ''}` : m.idOnFile ? tx('ID not yet seen', 'ID देखी नहीं') : tx('ID missing', 'ID नहीं दी')}</span>
      </div>
      {m.checkNote && <div className="text-[10px] italic text-slate-500">“{m.checkNote}”</div>}
      {canCheck && m.idOnFile && m.status !== 'REJECTED' && <button className={m.idChecked ? ghost : green} onClick={() => seeId(m)}><BadgeCheck className="h-4 w-4" />{m.idChecked ? tx('Clear "ID seen"', '"ID देखी" हटाएँ') : tx('I have seen the ID', 'मैंने ID देख ली')}</button>}
    </div>
  );
  return (
    <section className="space-y-3" aria-label={tx('Who registered whom', 'किसने किसे रजिस्टर कराया')}>
      <div><h3 className="text-sm font-bold">{tx('Who registered whom', 'किसने किसे रजिस्टर कराया')}</h3>
        <p className="text-[11px] text-slate-500">{tx('A broker without RERA joins only through a RERA-registered sponsor. Tap a number to filter. If a registered person is suspended or blacklisted, the sponsor gets a strike.', 'बिना RERA वाला ब्रोकर सिर्फ़ RERA-रजिस्टर्ड स्पॉन्सर के ज़रिए जुड़ता है। फ़िल्टर के लिए नंबर दबाएँ। रजिस्टर किया व्यक्ति सस्पेंड / ब्लैकलिस्ट हुआ तो स्पॉन्सर को स्ट्राइक मिलता है।')}</p></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(([k, en, hi, n, cls]) => (
          <button key={k + en} onClick={() => setFlt(flt === k && k !== 'all' ? 'all' : k)} aria-pressed={flt === k} className={`min-h-11 rounded-lg border p-2 text-left ${flt === k ? 'border-slate-900 bg-slate-900/5' : 'border-slate-200 bg-white'}`}>
            <div className={`text-lg font-bold ${cls}`}>{n}</div><div className="text-[10px] leading-tight text-slate-500">{tx(en, hi)}</div></button>))}
      </div>
      {ids && <p className="text-[11px] text-slate-500">{tx(`All verified brokers: PAN on file ${ids.withPan}/${ids.brokers} · Aadhaar (last 4) ${ids.withAadhaar}/${ids.brokers} · ID seen by GENZ ${ids.seen}/${ids.brokers}. Older brokers can add theirs under "Register & ID".`, `सभी सत्यापित ब्रोकर: PAN दर्ज ${ids.withPan}/${ids.brokers} · आधार (आख़िरी 4) ${ids.withAadhaar}/${ids.brokers} · GENZ ने ID देखी ${ids.seen}/${ids.brokers}। पुराने ब्रोकर "रजिस्टर और ID" में अपना जोड़ सकते हैं।`)}</p>}
      {rows.length === 0 && unspons.length === 0 && <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">{tx('Nothing here.', 'यहाँ कुछ नहीं।')}</p>}
      {rows.map((s: any) => {
        const isOpen = open[s.id] ?? (flt !== 'all' && flt !== 'registered');
        return (
          <div key={s.id} className={`rounded-xl border bg-white p-3 ${s.active ? 'border-slate-200' : 'border-red-300'}`}>
            <button className="flex min-h-11 w-full items-start justify-between gap-2 text-left" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [s.id]: !isOpen })}>
              <div className="min-w-0"><div className="truncate text-sm font-bold">{s.name}{s.isCaptain ? ` · ${tx('City Captain', 'सिटी कैप्टन')}` : ''}</div>
                <div className="truncate text-[11px] text-slate-500">{s.company || '—'} · {s.city}{s.rera ? ` · RERA ${s.rera}` : ''}</div>
                <div className="mt-0.5 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">{s.total} {tx('registered', 'रजिस्टर')}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">{s.verified} {tx('verified', 'सत्यापित')}</span>
                  {s.pending > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{s.pending} {tx('waiting', 'प्रतीक्षा')}</span>}
                  {s.problem > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">{s.problem} {tx('problem', 'समस्या')}</span>}
                  {s.strikes > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">{tx('strikes', 'स्ट्राइक')} {s.strikes}</span>}
                  {!s.active && <span className="rounded-full bg-red-600 px-2 py-0.5 text-white">{tx('sponsor', 'स्पॉन्सर')} {label('status', s.status)}</span>}
                </div></div>
              <ChevronDown className={`mt-1 h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && <div className="mt-2 space-y-2">{s.shown.map(member)}{s.shown.length === 0 && <p className="text-xs text-slate-500">{tx('Nobody matches this filter.', 'इस फ़िल्टर में कोई नहीं।')}</p>}</div>}
          </div>);
      })}
      {unspons.length > 0 && <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50/50 p-3">
        <h4 className="text-xs font-bold text-amber-900">{tx('Local associates with no sponsor on record', 'लोकल एसोसिएट जिनका स्पॉन्सर रिकॉर्ड में नहीं')} ({unspons.length})</h4>
        <p className="text-[11px] text-amber-900">{tx('These joined before sponsor records began. Ask for their ID and decide whether to keep them.', 'ये स्पॉन्सर रिकॉर्ड शुरू होने से पहले जुड़े थे। इनकी ID लें और तय करें कि रखना है या नहीं।')}</p>
        {unspons.map(member)}
      </div>}
    </section>
  );
};

// ───────────────────────── GENZ ops ─────────────────────────
const AdminTab: React.FC<{ act: Act; tick: number; permissions: string[] }> = ({ act, tick, permissions }) => {
  const tx = useTx();
  const label = useLabel();
  const [d, setD] = useState<any>(null); const [desk, setDesk] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { Promise.all([api.netAdmin(), api.netDesk()]).then(([a, b]) => { setD(a); setDesk(b); }).catch(e => setErr(e.message)); }, [tick]);
  if (!d) return <Load d={d} err={err} />;
  return (
    <div className="space-y-5">
      <SponsorChain act={act} tick={tick} canCheck={hasPerm(permissions, 'users:review')} ids={d.ids} />
      <section className="space-y-2"><h3 className="text-sm font-bold">{tx('City density — active brokers vs target', 'सिटी डेंसिटी — एक्टिव ब्रोकर बनाम लक्ष्य')}</h3>
        {d.cities.length === 0 && <p className="text-xs text-slate-500">—</p>}
        {d.cities.map((c: any) => (
          <div key={c.city} className="space-y-1 rounded-lg border border-slate-200 bg-white p-2">
            <div className="flex justify-between text-xs"><b>{c.city}</b><span>{c.total}/{c.target} · Tier 1: {c.tier1} · Tier 2: {c.tier2}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${c.pct}%` }} /></div>
          </div>))}
        <p className="text-[11px] text-slate-500">{tx('Go deep in one city before opening the next.', 'अगला शहर खोलने से पहले एक शहर में गहराई लाएँ।')}</p>
      </section>
      <section className="space-y-1 rounded-xl border border-slate-200 bg-white p-3 text-xs"><h3 className="text-sm font-bold">{tx('Tier 2 pipeline', 'Tier 2 पाइपलाइन')}</h3>
        <div>{tx('Open', 'खुले')}: {d.pipeline.open} · {tx('Invited', 'इन्वाइटेड')}: {d.pipeline.invited} · {tx('Joined', 'जुड़े')}: {d.pipeline.joined} · {tx('Rejected', 'अस्वीकृत')}: {d.pipeline.rejected}</div>
        {d.pendingTier2.length > 0 && <div className="pt-1"><b>{tx('Waiting for your KYC approval', 'आपकी KYC मंज़ूरी का इंतज़ार')}:</b> {d.pendingTier2.map((u: any) => `${u.name} (${u.city}; ${tx('registered by', 'रजिस्टर कराया')} ${u.sponsor || u.vouchedBy.join(', ') || '—'}; ${u.idChecked ? tx('ID seen', 'ID देखी') : u.idOnFile ? tx('ID not yet seen', 'ID देखी नहीं') : tx('ID missing', 'ID नहीं दी')})`).join(' · ')}</div>}
      </section>
      <section className="space-y-1 rounded-xl border border-slate-200 bg-white p-3 text-xs"><h3 className="text-sm font-bold">{tx('City Captains', 'सिटी कैप्टन')}</h3>
        {d.captains.length === 0 && <p className="text-slate-500">{tx('No captains appointed yet (Community → Chapters).', 'अभी कोई कैप्टन नहीं (कम्युनिटी → चैप्टर)।')}</p>}
        {d.captains.map((c: any) => <div key={c.chapterId}>{c.city}: <b>{c.captain}</b> — {c.approvedByCaptain} {tx('captain approvals this month', 'कैप्टन अप्रूवल इस महीने')}, {c.vouchesThisMonth}/{c.limit}</div>)}
      </section>
      {d.flagged.length > 0 && <section className="space-y-1 rounded-xl border border-red-200 bg-red-50/50 p-3 text-xs"><h3 className="text-sm font-bold text-red-800">{tx('Members with vouch strikes', 'वाउच स्ट्राइक वाले मेंबर')}</h3>{d.flagged.map((u: any) => <div key={u.id}>{u.name} ({u.city}) — {u.strikes}{u.pausedUntil ? ` · ${tx('paused until', 'रुका')} ${d0(u.pausedUntil)}` : ''}</div>)}</section>}
      <section className="space-y-2"><h3 className="text-sm font-bold">{tx('GENZ desk queue', 'GENZ डेस्क कतार')}</h3>
        {(desk?.requests || []).length === 0 && <p className="text-xs text-slate-500">{tx('No requests.', 'कोई अनुरोध नहीं।')}</p>}
        {(desk?.requests || []).map((r: any) => (
          <div key={r.id} className="space-y-1 rounded-lg border border-slate-200 bg-white p-2 text-xs"><div><b>{r.projectName}</b> · {r.builderName} · {label('status', r.kind)} · <b>{label('status', r.status)}</b></div><div className="text-slate-600">{r.note}</div>
            {['OPEN', 'ACK'].includes(r.status) && <div className="flex flex-wrap gap-2">{r.status === 'OPEN' && <button className={ghost} onClick={() => act(() => api.netDeskStatus(r.id, { status: 'ACK' }), tx('Acknowledged', 'देख लिया'))}>{tx('Acknowledge', 'देखा')}</button>}<button className={green} onClick={() => act(() => api.netDeskStatus(r.id, { status: 'DONE', response: window.prompt(tx('Note for the builder', 'बिल्डर के लिए नोट')) || '' }), tx('Marked done', 'पूरा'))}>{tx('Done', 'पूरा')}</button><button className={red} onClick={() => act(() => api.netDeskStatus(r.id, { status: 'DECLINED', response: window.prompt(tx('Reason', 'कारण')) || '' }), tx('Declined', 'अस्वीकार'))}>{tx('Decline', 'अस्वीकार')}</button></div>}
          </div>))}
      </section>
    </div>
  );
};
