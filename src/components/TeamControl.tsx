import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Shuffle, Eye, EyeOff, ShieldAlert, ArrowRightLeft, Palmtree, Building2, Wallet } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';

const inp = 'min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
const btn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-4 text-xs font-semibold disabled:opacity-50';
const dark = `${btn} bg-slate-900 text-white`;
const ghost = `${btn} border border-slate-300 bg-white text-slate-700`;

/** Employer's "Lead control" tab: how leads reach staff, what staff may see / do, hand-over, accountability, reveal log. */
export const TeamControl: React.FC<{ isBuilder: boolean }> = ({ isBuilder }) => {
  const tx = useTx();
  const [d, setD] = useState<any>(null);
  const [reveals, setReveals] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const flash = (ok: boolean, msg: string) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 4000); };
  const load = useCallback(async () => {
    try { setD(await api.tcControl()); api.tcReveals().then(r => setReveals(r.reveals)).catch(() => undefined); } catch (e: any) { flash(false, e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const run = async (fn: () => Promise<any>, ok: string | ((r: any) => string)) => { try { const r = await fn(); flash(true, typeof ok === 'function' ? ok(r) : ok); await load(); } catch (e: any) { flash(false, e.message); } };
  if (!d) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  const active = d.members.filter((m: any) => m.status === 'VERIFIED');
  return (
    <div className="space-y-5">
      {toast && <div className={`rounded-lg px-3 py-2 text-xs font-medium ${toast.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} role="status">{toast.msg}</div>}

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-bold"><Shuffle className="h-4 w-4" />{tx('How new leads reach your team', 'नई लीड टीम तक कैसे पहुँचे')}</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {([['OFF', 'I allot manually', 'मैं खुद बाँटूँगा'], ['ROUND_ROBIN', 'Take turns (round-robin)', 'बारी-बारी (राउंड-रॉबिन)'], ['LEAST_LOADED', 'Least busy first', 'सबसे कम काम वाले को']] as const).map(([k, en, hi]) => (
            <button key={k} onClick={() => run(() => api.tcRouting(k), tx('Routing saved', 'रूटिंग सेव'))} className={`min-h-11 rounded-lg px-3 text-xs font-semibold ${d.routing === k ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>{tx(en, hi)}</button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">{tx('Staff on leave, over their open-lead limit or limited to other projects are skipped. Leads nobody can take stay in your pool', 'छुट्टी पर, सीमा पार या दूसरे प्रोजेक्ट तक सीमित स्टाफ को छोड़ दिया जाता है। जिसे कोई न ले सके वह आपके पूल में रहती है')} ({d.pool} {tx('in pool now', 'अभी पूल में')}).</p>
      </section>

      {d.members.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{tx('Add team members first (Members tab).', 'पहले टीम सदस्य जोड़ें (Members टैब)।')}</p>}
      {d.members.map((m: any) => <MemberCard key={m.id} m={m} active={active} projects={d.projects} isBuilder={isBuilder} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)} run={run} />)}

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-bold"><Eye className="h-4 w-4" />{tx('Who looked at customer numbers', 'ग्राहक के नंबर किसने देखे')}</h3>
        {reveals.length === 0 ? <p className="text-xs text-slate-400">{tx('No number reveals yet. Set a staff member to “Tap to reveal” to log every view.', 'अभी कोई नंबर नहीं देखा गया। हर व्यू लॉग करने के लिए स्टाफ को “टैप करके देखें” पर रखें।')}</p> : (
          <ul className="divide-y divide-slate-100 text-xs">{reveals.slice(0, 40).map(r => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="font-medium">{r.userName}</span><span className="text-slate-500">{r.leadId}</span><span className="text-slate-400">{new Date(r.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span></li>)}</ul>
        )}
      </section>
    </div>
  );
};

const MemberCard: React.FC<{ m: any; active: any[]; projects: { id: string; name: string }[]; isBuilder: boolean; open: boolean; onToggle: () => void; run: (fn: () => Promise<any>, ok: any) => Promise<void> }> = ({ m, active, projects, isBuilder, open, onToggle, run }) => {
  const tx = useTx();
  const label = useLabel();
  const p = m.policy; const c = m.card;
  const set = (patch: any, ok = tx('Saved', 'सेव')) => run(() => api.tcPolicy(m.id, patch), ok);
  const [to, setTo] = useState('');
  const others = active.filter((x: any) => x.id !== m.id);
  const toggle = (label: string, hi: string, key: string, hint?: string) => (
    <label className="flex min-h-11 items-start gap-2 text-xs text-slate-700"><input type="checkbox" className="mt-1" checked={!!p[key]} onChange={e => set({ [key]: e.target.checked })} /><span><b>{tx(label, hi)}</b>{hint && <span className="block text-[10px] text-slate-500">{hint}</span>}</span></label>
  );
  return (
    <section className={`rounded-xl border bg-white p-4 ${m.status !== 'VERIFIED' ? 'border-red-200 opacity-80' : p.onLeave ? 'border-amber-300' : 'border-slate-200'}`}>
      <button onClick={onToggle} className="flex w-full items-start justify-between gap-2 text-left" aria-expanded={open}>
        <div className="min-w-0"><div className="text-sm font-bold text-slate-900">{m.name} <span className="text-xs font-normal text-slate-500">· {m.title}</span></div>
          <div className="mt-0.5 flex flex-wrap gap-1.5 text-[10px]">
            <span className="rounded bg-slate-100 px-1.5 py-0.5">{p.phoneMode === 'FULL' ? tx('sees numbers', 'नंबर देखता है') : p.phoneMode === 'REVEAL' ? tx('tap-to-reveal', 'टैप करके नंबर') : tx('no numbers', 'नंबर नहीं')}</span>
            {p.onLeave && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">{tx('on leave', 'छुट्टी पर')}</span>}
            {m.status !== 'VERIFIED' && <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">{label('status', m.status)}</span>}
            {p.canClaim && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-800">{tx('can claim from pool', 'पूल से ले सकता')}</span>}
            {p.canVerify && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-800">{tx('verifies leads', 'लीड वेरिफाई')}</span>}
            {p.canConfirmMoney && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">{tx('confirms money', 'पैसा कन्फ़र्म')}</span>}
            {p.canCollectMoney && !p.canConfirmMoney && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">{tx('collects money', 'पैसा वसूलता')}</span>}
            {p.scope === 'PROJECTS' && <span className="rounded bg-slate-100 px-1.5 py-0.5">{tx('sees project leads', 'प्रोजेक्ट की सारी लीड')}</span>}
          </div></div>
        <span className="text-xs text-slate-400">{open ? '▲' : '▼'}</span>
      </button>
      <div className="mt-3 grid grid-cols-5 gap-1 text-center text-[10px] text-slate-500">
        {[[c.open, tx('Open', 'खुली'), false], [c.untouched, tx('Untouched 24h', 'बिना छुए 24h'), c.untouched > 0], [c.stale, tx('Stale 3d', 'ठंडी 3d'), c.stale > 0], [c.overdue, tx('Overdue', 'ओवरड्यू'), c.overdue > 0], [c.avgFirstResponseHrs === null ? '—' : `${c.avgFirstResponseHrs}h`, tx('1st reply', 'पहला जवाब'), false]].map(([n, l, hot], i) => (
          <div key={i} className={`rounded py-1.5 ${hot ? 'bg-red-50 text-red-700' : 'bg-slate-50'}`}><div className={`text-sm font-bold ${hot ? '' : 'text-slate-900'}`}>{n as any}</div>{l as string}</div>
        ))}
      </div>
      {open && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-700">{p.phoneMode === 'FULL' ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}{tx('Customer phone numbers', 'ग्राहक के फ़ोन नंबर')}</div>
            <div className="grid grid-cols-3 gap-2">
              {([['FULL', 'Always visible', 'हमेशा दिखे'], ['REVEAL', 'Tap to reveal (logged)', 'टैप करके (लॉग)'], ['HIDDEN', 'Never', 'कभी नहीं']] as const).map(([k, en, hi]) => (
                <button key={k} onClick={() => set({ phoneMode: k })} className={`min-h-11 rounded-lg px-2 text-[11px] font-semibold ${p.phoneMode === k ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>{tx(en, hi)}</button>
              ))}
            </div>
            {p.phoneMode === 'REVEAL' && <label className="mt-2 block text-[11px] text-slate-600">{tx('Max numbers per day', 'रोज़ अधिकतम नंबर')} ({m.revealsToday} {tx('used today', 'आज इस्तेमाल')}, {m.reveals7d} {tx('this week', 'इस हफ़्ते')})<input defaultValue={p.revealCap} inputMode="numeric" onBlur={e => { const v = Number(e.target.value); if (v !== p.revealCap) set({ revealCap: v }); }} className={inp} /></label>}
            <p className="mt-1 text-[10px] text-slate-500">{tx('With “tap to reveal” or “never”, staff cannot search by number or read it from the list — this is what stops a leaving employee from copying your customers.', '“टैप करके” या “कभी नहीं” पर स्टाफ नंबर से सर्च या लिस्ट से कॉपी नहीं कर सकता — इसी से नौकरी छोड़ने वाला कर्मचारी आपके ग्राहक कॉपी नहीं कर पाता।')}</p>
          </div>
          <div className="grid gap-x-4 sm:grid-cols-2">
            {toggle('Can register new leads', 'नई लीड रजिस्टर कर सकता', 'canRegister')}
            {toggle('Can mark a lead lost', 'लीड “लॉस्ट” कर सकता', 'canMarkLost', tx('Off = only you can close a lead as lost', 'बंद = सिर्फ़ आप लीड लॉस्ट कर सकते हैं'))}
            {toggle('Can take leads from the pool', 'पूल से लीड ले सकता', 'canClaim', tx('First come, first served', 'जो पहले ले'))}
            {toggle('Can forward leads to teammates', 'लीड साथी को आगे भेज सकता', 'canForward', tx('Telecaller → executive → coordinator. History is kept.', 'टेलीकॉलर → एक्ज़ीक्यूटिव → कोऑर्डिनेटर। इतिहास रहता है।'))}
            {toggle('Can raise booking requests', 'बुकिंग अनुरोध भेज सकता', 'canRequestBooking', tx('The builder still approves. Off = only you raise bookings.', 'मंज़ूरी बिल्डर ही देता है। बंद = सिर्फ़ आप बुकिंग अनुरोध भेजें।'))}
            {isBuilder && toggle('Can accept / reject partner leads', 'पार्टनर लीड मंज़ूर/अस्वीकार कर सकता', 'canVerify')}
            {isBuilder && toggle('Can scan visit QR at the site', 'साइट पर विज़िट QR स्कैन कर सकता', 'canScanVisits', tx('Only builder staff can scan — a partner’s staff never can', 'सिर्फ़ बिल्डर का स्टाफ़ स्कैन कर सकता है — पार्टनर का स्टाफ़ कभी नहीं'))}
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-700"><Building2 className="h-3.5 w-3.5" />{tx('Plots / flats (inventory)', 'प्लॉट / फ़्लैट (इन्वेंटरी)')}</div>
            <div className="grid grid-cols-3 gap-2">
              {([['OFF', 'Off', 'बंद'], ['SHARED', 'Only what I post', 'सिर्फ़ जो मैं भेजूँ'], ['ALL', 'Everything I see', 'जो मुझे दिखे सब']] as const).map(([k, en, hi]) => (
                <button key={k} onClick={() => set({ invMode: k })} className={`min-h-11 rounded-lg px-2 text-[11px] font-semibold ${(p.invMode || 'OFF') === k ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>{tx(en, hi)}</button>
              ))}
            </div>
            {(p.invMode || 'OFF') !== 'OFF' && (
              <div className="mt-1 grid gap-x-4 sm:grid-cols-2">
                {toggle('Can see the rate (price)', 'रेट (कीमत) देख सकता', 'invPrice', tx('Off = he sees “price on request”. A rate the builder hid is never shown to anyone.', 'बंद = उसे “कीमत पूछें” दिखता है। बिल्डर ने जो रेट छुपाया वह किसी को नहीं दिखता।'))}
                {toggle('Can see road sides, facing, features', 'सड़क, दिशा, खूबियाँ देख सकता', 'invFeatures')}
                {toggle('Can send customers a unit link', 'ग्राहक को यूनिट लिंक भेज सकता', 'invShareOut', tx('The link carries your firm’s name. Switching this off kills his old links.', 'लिंक पर आपकी फ़र्म का नाम रहता है। यह बंद करते ही उसके पुराने लिंक बंद हो जाते हैं।'))}
              </div>
            )}
            <p className="mt-1 text-[10px] text-slate-500">{tx('Use the “Team board” in the Inventory tab to pick which plots go to whom, with rate and features on or off per post.', 'किसे कौन-से प्लॉट दिखें, यह Inventory टैब के “Team board” से चुनें — हर पोस्ट में रेट और खूबियाँ चालू/बंद।')}</p>
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-700"><Wallet className="h-3.5 w-3.5" />{tx('Customer money (Money Trail)', 'ग्राहक का पैसा (मनी ट्रेल)')}</div>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {toggle(isBuilder ? 'Can record money collected at the office' : 'Can record money he collects', isBuilder ? 'ऑफ़िस में लिया गया पैसा दर्ज कर सकता' : 'ग्राहक से लिया पैसा दर्ज कर सकता', 'canCollectMoney', tx('He records it; someone else must confirm it. GENZ never holds the money.', 'वह दर्ज करता है; कन्फ़र्म कोई और करेगा। GENZ पैसा नहीं रखता।'))}
              {toggle(isBuilder ? 'Authorised accounts person — can confirm money arrived' : 'Authorised — can confirm a colleague’s money and hand it to the builder', isBuilder ? 'अधिकृत अकाउंट वाला — पैसा मिलना कन्फ़र्म कर सकता' : 'अधिकृत — साथी का पैसा कन्फ़र्म कर और बिल्डर को सौंप सकता', 'canConfirmMoney', tx('He can never confirm money he collected himself. Leave off for ordinary staff.', 'अपना लिया हुआ पैसा वह कभी खुद कन्फ़र्म नहीं कर सकता। आम स्टाफ़ के लिए बंद रखें।'))}
            </div>
          </div>
          <label className="block text-[11px] text-slate-600">{tx('Max open leads at a time (blank = no limit)', 'एक समय में अधिकतम खुली लीड (खाली = सीमा नहीं)')}<input defaultValue={p.maxOpenLeads ?? ''} inputMode="numeric" onBlur={e => { const v = e.target.value.trim(); if (String(p.maxOpenLeads ?? '') !== v) set({ maxOpenLeads: v === '' ? null : Number(v) }); }} className={inp} /></label>
          <div>
            <div className="mb-1 text-[11px] font-bold text-slate-700">{tx('Projects this person works', 'यह व्यक्ति किन प्रोजेक्ट पर काम करे')}</div>
            <div className="flex flex-wrap gap-1.5">{projects.map(pr => { const on = p.projectIds.includes(pr.id); return <button key={pr.id} onClick={() => set({ projectIds: on ? p.projectIds.filter((x: string) => x !== pr.id) : [...p.projectIds, pr.id], ...(on && p.projectIds.length === 1 ? { scope: 'ASSIGNED' } : {}) })} className={`min-h-9 rounded-full px-3 text-[11px] font-semibold ${on ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700'}`}>{pr.name}</button>; })}{projects.length === 0 && <span className="text-xs text-slate-400">—</span>}</div>
            <p className="mt-1 text-[10px] text-slate-500">{tx('None selected = all projects.', 'कोई नहीं चुना = सभी प्रोजेक्ट।')}</p>
            {p.projectIds.length > 0 && <label className="mt-2 flex min-h-11 items-start gap-2 text-xs text-slate-700"><input type="checkbox" className="mt-1" checked={p.scope === 'PROJECTS'} onChange={e => set({ scope: e.target.checked ? 'PROJECTS' : 'ASSIGNED' })} /><span><b>{tx('Can see ALL leads of these projects (read-only)', 'इन प्रोजेक्ट की सारी लीड देख सकता (सिर्फ़ पढ़ने)')}</b><span className="block text-[10px] text-slate-500">{tx('Otherwise he sees only leads you allot to him.', 'वरना सिर्फ़ वही लीड दिखती हैं जो आप उसे दें।')}</span></span></label>}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <button onClick={() => set({ onLeave: !p.onLeave }, p.onLeave ? tx('Back from leave', 'छुट्टी से वापस') : tx('Marked on leave — open leads taken back', 'छुट्टी पर — खुली लीड वापस ली गईं'))} className={ghost}><Palmtree className="h-4 w-4" />{p.onLeave ? tx('Back from leave', 'छुट्टी से वापस') : tx('On leave', 'छुट्टी पर')}</button>
            <select value={to} onChange={e => setTo(e.target.value)} className={`${inp} !w-auto`} aria-label={tx('Hand over to', 'इन्हें सौंपें')}><option value="">{tx('Hand over open leads to…', 'खुली लीड सौंपें…')}</option>{others.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}<option value="__pool">{tx('Back to my pool', 'मेरे पूल में वापस')}</option></select>
            <button disabled={!to || c.open === 0} onClick={() => run(() => api.tcHandover(m.id, to === '__pool' ? null : to), (r: any) => tx(`${r.moved} lead(s) moved`, `${r.moved} लीड सौंपी`))} className={dark}><ArrowRightLeft className="h-4 w-4" />{tx('Hand over', 'सौंपें')} ({c.open})</button>
          </div>
          {m.status === 'VERIFIED' && <p className="flex items-start gap-1.5 text-[10px] text-slate-500"><ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />{tx('Suspending a member (Members tab) also takes back all their open leads automatically.', 'किसी सदस्य को सस्पेंड करने (Members टैब) पर उसकी सारी खुली लीड अपने आप वापस आ जाती हैं।')}</p>}
        </div>
      )}
    </section>
  );
};
