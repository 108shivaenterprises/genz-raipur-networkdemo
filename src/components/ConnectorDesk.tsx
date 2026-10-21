import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, MessageCircle, UserCheck, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { UserProfile } from '../types/index.js';
import { REFERRAL_TYPES, STATUS_FLOW, REFERRAL_STATUSES, shopLabel, referralLabel } from '../shared/connector.js';
import { formatINR } from '../lib/utils.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { ShareTerms } from './ShareTerms.js';
import type { TabType } from './NavigationTabs.js';

const STATUS_STYLE: Record<string, string> = {
  SUBMITTED: 'bg-slate-100 text-slate-700', CONTACTED: 'bg-blue-100 text-blue-800', QUALIFIED: 'bg-indigo-100 text-indigo-800',
  IN_PROGRESS: 'bg-amber-100 text-amber-800', CLOSED_WON: 'bg-emerald-100 text-emerald-800', CLOSED_LOST: 'bg-rose-100 text-rose-800',
  DUPLICATE: 'bg-slate-200 text-slate-600', REJECTED: 'bg-slate-200 text-slate-600',
};
const small = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs';

interface Props { currentUser: UserProfile; permissions: string[]; users: UserProfile[]; onNavigate?: (t: TabType) => void }

/** Operations desk for connector referrals: admins see everything; brokers / contractors only what is assigned to them. */
export const ConnectorDesk: React.FC<Props> = ({ currentUser, permissions, users, onNavigate }) => {
  const can = (p: string) => permissions.includes(p);
  const full = can('connector:manage');            // reward / payout / settings authority
  const manage = full || can('connector:desk');    // can see all referrals, assign and progress them
  const sponsor = can('connector:sponsor');
  const [view, setView] = useState<'referrals' | 'partners' | 'settings' | 'mine'>('referrals');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [refs, setRefs] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const tx = useTx();
  const label = useLabel();
  const hi = useI18n().lang === 'hi';
  const [filter, setFilter] = useState('');
  const [queue, setQueue] = useState('');                 // which tile's list is open: open | won | unassigned | rewardApprovals | payoutsDue
  const [partnerFilter, setPartnerFilter] = useState<'all' | 'pending' | 'verified'>('all');
  const listTop = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [refTotal, setRefTotal] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    try {
      const [o, r] = await Promise.all([api.connectorOverview(), api.connectorReferrals({ status: filter || undefined, queue: queue || undefined, q: q || undefined })]);
      setOverview(o); setRefs(r.referrals); setRefTotal((r as any).total ?? r.referrals.length);
      if (full) setPartners((await api.connectorPartners()).partners);
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter, queue]);

  const act = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); setMsg({ ok: true, text: ok }); await load(); } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };

  if (loading) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> {tx('Loading…', 'लोड हो रहा है…')}</div>;
  const st = overview?.stats; const oq = overview?.queue;


  const pick = (next: string) => { setView('referrals'); setFilter(''); setQ(''); setQueue(next); setTimeout(() => listTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0); };
  const showAll = () => { setFilter(''); setQ(''); setQueue(''); };
  const pickPartners = (f: 'all' | 'pending') => { setView('partners'); setPartnerFilter(f); };
  const QUEUE_LABEL: Record<string, string> = {
    open: tx('Open referrals', 'खुले रेफ़रल'), won: tx('Won referrals', 'जीते हुए रेफ़रल'), unassigned: tx('To assign — nobody is working these yet', 'असाइन करने हैं — अभी किसी के पास नहीं'),
    rewardApprovals: tx('Reward approvals — closed won, reward not yet approved', 'रिवॉर्ड अप्रूवल — जीते, रिवॉर्ड अभी मंज़ूर नहीं'), payoutsDue: tx('Payouts due — reward approved, not yet paid', 'पेआउट देय — रिवॉर्ड मंज़ूर, भुगतान बाकी'), shareDisputes: tx('Share not received — the connector says the broker\'s share did not arrive', 'हिस्सा नहीं मिला — कनेक्टर कहता है ब्रोकर का हिस्सा नहीं पहुँचा'),
  };
  const queueTitle = queue ? QUEUE_LABEL[queue] : tx(`Status: ${filter}`, `स्टेटस: ${filter}`);
  const tiles: Array<{ id: string; label: string; value: number | undefined; sub?: string; alert?: boolean; active: boolean; go?: () => void }> = [
    { id: 'total', label: tx('Total', 'कुल'), value: st?.total, active: view === 'referrals' && !queue && !filter, go: () => { pick(''); } },
    { id: 'open', label: tx('Open', 'खुले'), value: st?.open, active: view === 'referrals' && queue === 'open', go: () => pick('open') },
    { id: 'won', label: tx('Won', 'जीते'), value: st?.won, active: view === 'referrals' && queue === 'won', go: () => pick('won') },
    ...(manage ? [
      { id: 'unassigned', label: tx('To assign', 'असाइन करना'), value: oq?.unassigned, alert: true, active: view === 'referrals' && queue === 'unassigned', go: () => pick('unassigned') },
      ...(full ? [
        { id: 'rewardApprovals', label: tx('Reward approvals', 'रिवॉर्ड अप्रूवल'), value: oq?.rewardApprovals, alert: true, active: view === 'referrals' && queue === 'rewardApprovals', go: () => pick('rewardApprovals') },
        { id: 'shareDisputes', label: tx('Share not received', 'हिस्सा नहीं मिला'), value: oq?.shareDisputes, alert: true, active: view === 'referrals' && queue === 'shareDisputes', go: () => pick('shareDisputes') },
        { id: 'payoutsDue', label: tx('Payouts due', 'पेआउट देय'), value: oq?.payoutsDue, sub: oq?.payoutsDue ? formatINR(oq?.payoutsDueAmount) : undefined, alert: true, active: view === 'referrals' && queue === 'payoutsDue', go: () => pick('payoutsDue') },
      ] : []),
      { id: 'partners', label: tx('Partners', 'पार्टनर'), value: overview?.partners?.total, active: view === 'partners' && partnerFilter === 'all', go: full ? () => pickPartners('all') : undefined },
      { id: 'kyc', label: tx('KYC pending', 'KYC बाकी'), value: overview?.partners?.pendingKyc, alert: true, active: view === 'partners' && partnerFilter === 'pending', go: full ? () => pickPartners('pending') : undefined },
    ] : []),
  ];
  const shownPartners = partners.filter(p => partnerFilter === 'all' ? true : partnerFilter === 'pending' ? p.verificationStatus === 'PENDING' : p.verificationStatus === 'VERIFIED');
  // who to pay: payouts due grouped by partner, with the UPI / phone on file
  const partnerById = new Map<string, any>(partners.map(p => [p.id, p]));
  const payGroups = (() => {
    const m = new Map<string, { id: string; name: string; count: number; amount: number }>();
    for (const r of refs) { if (r.rewardStatus !== 'APPROVED') continue; const g = m.get(r.connectorId) || { id: r.connectorId, name: r.connectorName, count: 0, amount: 0 }; g.count++; g.amount += r.rewardAmount || 0; m.set(r.connectorId, g); }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  })();

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs text-slate-500">{tx('GENZ Connector programme', 'GENZ कनेक्टर प्रोग्राम')} · {manage ? tx('Operations desk', 'ऑपरेशंस डेस्क') : tx('My assigned referrals', 'मुझे सौंपे गए रेफ़रल')}</div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">{tx('Local Partner Referrals', 'लोकल पार्टनर रेफ़रल')}</h2>
      </div>
      {msg && <p className={`rounded-lg px-3 py-2 text-xs font-medium ${msg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{msg.text}</p>}

      <div ref={listTop} className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6" role="group" aria-label={tx('Desk summary — tap a box to see the list', 'डेस्क सारांश — सूची देखने के लिए बॉक्स दबाएँ')}>
        {tiles.map(t => {
          const active = t.active;
          const body = (<>
            <div className={`text-lg font-bold ${t.alert && (t.value || 0) > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{t.value ?? 0}</div>
            <div className="text-[11px] text-slate-500">{t.label}</div>
            {t.sub && <div className="mt-0.5 text-[11px] font-semibold text-amber-700">{t.sub}</div>}
          </>);
          return t.go
            ? <button key={t.id} type="button" onClick={t.go} aria-pressed={active} className={`min-h-14 rounded-xl border bg-white p-3 text-left transition-colors hover:border-slate-900 ${active ? 'border-slate-900 ring-2 ring-slate-900' : 'border-slate-200'}`}>{body}</button>
            : <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-3">{body}</div>;
        })}
      </div>

      {view === 'referrals' && (queue || filter) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-800">
          <span><b>{queueTitle}</b> · {refTotal > refs.length ? tx(`newest ${refs.length} of ${refTotal} — search to narrow`, `${refTotal} में से नए ${refs.length} — छोटा करने के लिए खोजें`) : tx(`${refs.length} referral(s)`, `${refs.length} रेफ़रल`)}{queue === 'payoutsDue' ? ` · ${formatINR(refs.reduce((t, x) => t + (x.rewardAmount || 0), 0))}` : ''}</span>
          <button type="button" onClick={showAll} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 font-semibold"><X className="h-3.5 w-3.5" aria-hidden />{tx('Show all', 'सब दिखाएँ')}</button>
        </div>
      )}

      {(manage || sponsor) && (
        <div className="flex gap-1 border-b border-slate-200 text-xs">
          {([['referrals', tx('Referrals', 'रेफ़रल')], ...(full ? [['partners', tx(`Partners (${partners.length})`, `पार्टनर (${partners.length})`)]] : []), ...(sponsor ? [['mine', tx('My referral partners', 'मेरे रेफ़रल पार्टनर')]] : []), ...(can('connector:settings') ? [['settings', tx('Rewards & programme', 'रिवॉर्ड और प्रोग्राम')]] : [])] as [string, string][]).map(([id, l]) => (
            <button key={id} onClick={() => setView(id as any)} className={`px-3 py-2 font-semibold ${view === id ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-500'}`}>{l}</button>
          ))}
        </div>
      )}

      {view === 'referrals' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} placeholder={tx('Search name, ID, city…', 'नाम, ID, शहर खोजें…')} className={small + ' pl-8'} /></div>
            <select value={filter} onChange={e => { setQueue(''); setFilter(e.target.value); }} className={small}><option value="">{tx('All statuses', 'सभी स्टेटस')}</option>{REFERRAL_STATUSES.map(s => <option key={s} value={s}>{label('referralStatus', s)}</option>)}</select>
            <button onClick={load} className={small + ' font-semibold'}>{tx('Search', 'खोजें')}</button>
          </div>
          {queue === 'payoutsDue' && payGroups.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="mb-2 text-xs font-bold text-amber-900">{tx('Who to pay', 'किसे पेमेंट करना है')}</div>
              <ul className="space-y-2">{payGroups.map(g => { const pr = partnerById.get(g.id); const ph = String(pr?.phone || '').replace(/\D/g, '').slice(-10); return (
                <li key={g.id} className="flex items-start justify-between gap-3 rounded-lg bg-white/80 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{g.name} <span className="font-normal text-slate-500">· {tx(`${g.count} referral(s)`, `${g.count} रेफ़रल`)}</span></div>
                    <div className="mt-0.5 break-all font-mono text-slate-800">{pr?.connector?.payoutUpi || <span className="font-sans text-red-700">{tx('UPI not on file — ask the partner', 'UPI दर्ज नहीं — पार्टनर से लें')}</span>}</div>
                    {ph && <a href={`tel:+91${ph}`} className="font-semibold text-blue-700 underline">{pr.phone}</a>}
                  </div>
                  <div className="shrink-0 text-base font-bold text-slate-900">{formatINR(g.amount)}</div>
                </li>); })}</ul>
              <p className="mt-2 text-[11px] text-amber-900/80">{tx('GENZ does not move this money. Pay from your own UPI / bank, then enter the reference (UTR) under each referral and tap “Mark paid”.', 'यह पैसा GENZ नहीं भेजता। अपने UPI / बैंक से भुगतान करें, फिर हर रेफ़रल में रेफ़रेंस (UTR) डालकर “भुगतान दर्ज करें” दबाएँ।')}</p>
            </div>
          )}
          {queue === 'rewardApprovals' && refs.length > 0 && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">{tx('Each of these closed as won. Approve the reward in the green box under the referral (the default amount comes from Rewards & programme).', 'ये सब जीत के साथ बंद हुए हैं। रेफ़रल के नीचे हरे बॉक्स में रिवॉर्ड मंज़ूर करें (डिफ़ॉल्ट राशि “रिवॉर्ड और प्रोग्राम” से आती है)।')}</p>}
          {refs.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{queue || filter ? tx('Nothing pending here — all clear.', 'यहाँ कुछ बाकी नहीं — सब साफ़ है।') : tx('No referrals here yet.', 'अभी कोई रेफ़रल नहीं।')}</p>}
          <div className="space-y-3">
            {refs.map(r => <ReferralRow key={r.id} r={r} manage={manage} full={full} canPay={can('connector:payout')} mine={r.sponsorId === currentUser.id} worker={r.assignedToId === currentUser.id || r.sponsorId === currentUser.id} cap={overview?.maxSharePct} users={users} act={act} upi={partnerById.get(r.connectorId)?.connector?.payoutUpi} />)}
          </div>
        </>
      )}

      {view === 'partners' && full && (<>
        <div className="flex flex-wrap gap-2 text-xs" role="group" aria-label={tx('Filter partners', 'पार्टनर फ़िल्टर')}>
          {([['all', tx('All', 'सभी'), partners.length], ['pending', tx('KYC pending', 'KYC बाकी'), partners.filter(p => p.verificationStatus === 'PENDING').length], ['verified', tx('Verified', 'वेरिफ़ाइड'), partners.filter(p => p.verificationStatus === 'VERIFIED').length]] as [typeof partnerFilter, string, number][]).map(([id, l, n]) => (
            <button key={id} type="button" onClick={() => setPartnerFilter(id)} aria-pressed={partnerFilter === id} className={`min-h-9 rounded-full border px-3 font-semibold ${partnerFilter === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{l} ({n})</button>
          ))}
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-left text-slate-500"><tr>{[tx('Partner', 'पार्टनर'), tx('Shop', 'दुकान'), tx('City', 'शहर'), 'KYC', tx('Referrals', 'रेफ़रल'), tx('Won', 'जीते'), tx('Earned', 'कमाया'), tx('Paid', 'चुकाया'), ''].map((h, i) => <th key={i} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {shownPartners.map(p => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-3 py-2"><div className="font-semibold text-slate-900">{p.name}</div><div className="text-slate-500">{p.phone}</div></td>
                  <td className="px-3 py-2">{p.connector?.shopName}<div className="text-slate-500">{shopLabel(p.connector?.shopType, hi)}</div></td>
                  <td className="px-3 py-2">{p.city}{p.state ? `, ${p.state}` : ''}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 font-semibold ${p.verificationStatus === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{label('verification', p.verificationStatus)}</span></td>
                  <td className="px-3 py-2">{p.stats.total}</td><td className="px-3 py-2">{p.stats.won}</td>
                  <td className="px-3 py-2">{formatINR(p.stats.rewardEarnedAmount)}</td><td className="px-3 py-2">{formatINR(p.stats.rewardPaidAmount)}</td>
                  <td className="px-3 py-2">{p.verificationStatus !== 'VERIFIED' && onNavigate && <button onClick={() => onNavigate('onboarding')} className="inline-flex items-center gap-1 font-semibold text-blue-700 underline"><UserCheck className="h-3.5 w-3.5" /> {tx('Verify', 'वेरिफ़ाई करें')}</button>}</td>
                </tr>
              ))}
              {shownPartners.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">{partners.length === 0 ? tx('No connector partners yet. Invite one from “Invite & KYC” (role GENZ CONNECTOR).', 'अभी कोई कनेक्टर पार्टनर नहीं। “इनवाइट और KYC” से एक को बुलाएँ (रोल: GENZ कनेक्टर)।') : tx('Nobody in this group.', 'इस समूह में कोई नहीं।')}</td></tr>}
            </tbody>
          </table>
        </div>
      </>)}

      {view === 'mine' && sponsor && <MyPartnersPanel />}

      {view === 'settings' && can('connector:settings') && <SettingsPanel onSaved={(t) => { setMsg({ ok: true, text: t }); load(); }} />}
    </div>
  );
};

const ReferralRow: React.FC<{ r: any; manage: boolean; full: boolean; canPay: boolean; mine: boolean; worker: boolean; cap?: number; users: UserProfile[]; act: (f: () => Promise<any>, ok: string) => void; upi?: string }> = ({ r, manage, full, canPay, mine, worker, cap, users, act, upi }) => {
  const tx = useTx();
  const label = useLabel();
  const hi = useI18n().lang === 'hi';
  const rewardAdmin = full || mine; // a broker rewards partners of their own network; ops handles the GENZ-wide programme
  const [assignee, setAssignee] = useState('');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [ref, setRef] = useState('');
  const [cNum, setCNum] = useState('');
  const noNumber = r.contactMode === 'CONNECTOR_INTRODUCES' && !r.customerPhone;
  const cPhone = String(r.connectorPhone || '').replace(/\D/g, '').slice(-10);
  const wantsContractor = r.type === 'CONSTRUCTION';
  const pool = useMemo(() => users.filter(u => u.verificationStatus === 'VERIFIED' && u.role === (wantsContractor ? 'CONTRACTOR' : 'BROKER')), [users, wantsContractor]);
  const moves = STATUS_FLOW[r.status as keyof typeof STATUS_FLOW].filter(s => manage || !['DUPLICATE', 'REJECTED'].includes(s));
  const phone = String(r.customerPhone || '').replace(/\D/g, '').slice(-10);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">{r.customerName} <span className="font-normal text-slate-400">· {r.id}</span></div>
          <div className="text-xs text-slate-500">{referralLabel(r.type, hi)} · {r.locality}, {r.city}{r.budgetNote ? ` · ${r.budgetNote}` : ''}</div>
          {manage && <div className="text-xs text-slate-500">{tx('Referred by', 'रेफ़र किया')} <b>{r.connectorName}</b> ({shopLabel(r.shopType, hi)}) · {tx('Assigned', 'सौंपा गया')}: {r.assignedToName || <span className="text-amber-700">{tx('not yet', 'अभी नहीं')}</span>}</div>}
          {!manage && <div className="text-xs text-slate-500">{mine ? <>{tx('Referred by', 'रेफ़र किया')} <b>{r.connectorName}</b> ({tx('your partner', 'आपका पार्टनर')})</> : tx('Referred via GENZ partner', 'GENZ पार्टनर के ज़रिये')} · {tx('consent recorded', 'सहमति दर्ज')}: {r.customerConsent ? tx('yes', 'हाँ') : tx('no', 'नहीं')}</div>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>{label('referralStatus', r.status) || r.status.replace('_', ' ')}</span>
          {noNumber ? (
            r.connectorPhone && <a href={`tel:+91${cPhone}`} className={small + ' font-semibold'}>📞 {r.connectorName}: {r.connectorPhone}</a>
          ) : (<>
            <a href={`tel:+91${phone}`} className={small + ' font-semibold'}>📞 {r.customerPhone}</a>
            <a href={`https://wa.me/91${phone}`} target="_blank" rel="noreferrer" className={small + ' inline-flex items-center gap-1 font-semibold text-emerald-700'}><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>
          </>)}
        </div>
      </div>

      {noNumber && (
        <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
          <b>{tx('Number kept private by the partner.', 'पार्टनर ने नंबर निजी रखा है।')}</b> {tx(`The partner (${r.connectorName}) introduces this customer — call them, and add the customer's number once the customer is comfortable. It is checked against earlier referrals before work goes ahead.`, `पार्टनर (${r.connectorName}) इस ग्राहक से मिलवाएगा — उसे कॉल करें, और ग्राहक के सहज होने पर उसका नंबर जोड़ें। काम आगे बढ़ने से पहले इसे पुराने रेफ़रल से मिलाकर जाँचा जाता है।`)}
          {!['CLOSED_WON', 'CLOSED_LOST', 'DUPLICATE', 'REJECTED'].includes(r.status) && (
            <div className="mt-2 flex items-center gap-2">
              <input value={cNum} onChange={e => setCNum(e.target.value)} inputMode="numeric" placeholder={tx('Customer mobile', 'ग्राहक का मोबाइल')} className={small + ' w-40'} />
              <button disabled={cNum.replace(/\D/g, '').length < 10} onClick={() => act(() => api.connectorAttachContact(r.id, cNum), tx('Number added', 'नंबर जुड़ गया'))} className={small + ' font-semibold disabled:opacity-40'}>{tx('Add number', 'नंबर जोड़ें')}</button>
            </div>
          )}
        </div>
      )}

      {manage && !['CLOSED_WON', 'DUPLICATE', 'REJECTED'].includes(r.status) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={assignee} onChange={e => setAssignee(e.target.value)} className={small}>
            <option value="">{r.assignedToId ? tx(`Re-assign (now ${r.assignedToName})`, `दोबारा सौंपें (अभी: ${r.assignedToName})`) : tx(`Assign to ${wantsContractor ? 'contractor' : 'broker'}…`, `${wantsContractor ? 'ठेकेदार' : 'ब्रोकर'} को सौंपें…`)}</option>
            {pool.map(u => <option key={u.id} value={u.id}>{u.name}{u.city ? ` — ${u.city}` : ''}</option>)}
          </select>
          <button disabled={!assignee} onClick={() => act(() => api.connectorAssign(r.id, assignee), tx('Assigned', 'सौंप दिया'))} className={small + ' font-semibold disabled:opacity-40'}>{tx('Assign', 'सौंपें')}</button>
        </div>
      )}

      {moves.length > 0 && (manage || r.assignedToId) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={note} onChange={e => setNote(e.target.value)} placeholder={tx('Note (required to close as lost)', 'नोट (खोया बंद करने के लिए ज़रूरी)')} className={small + ' w-56'} />
          {moves.map(s => (
            <button key={s} onClick={() => act(() => api.connectorSetStatus(r.id, s, note || undefined), tx(`Moved to ${s}`, `${label('referralStatus', s)} में बदला`))} className={small + ' font-semibold hover:border-slate-900'}>→ {label('referralStatus', s) || s.replace('_', ' ')}</button>
          ))}
        </div>
      )}

      <ShareTerms r={r} side={worker ? 'WORKER' : 'VIEW'} hi={hi} cap={cap} onChanged={() => act(async () => {}, tx('Saved', 'सेव हो गया'))} />

      {rewardAdmin && r.status === 'CLOSED_WON' && r.rewardStatus === 'NONE' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 p-2.5">
          <span className="text-xs font-semibold text-emerald-900">{tx('Approve reward', 'रिवॉर्ड मंज़ूर करें')}{mine ? tx(' (you pay your partner)', ' (पार्टनर को आप चुकाएँगे)') : ''}</span>
          <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="numeric" placeholder={tx('default amount', 'डिफ़ॉल्ट राशि')} className={small + ' w-32'} />
          <button onClick={() => act(() => api.connectorApproveReward(r.id, amount ? Number(amount) : undefined), tx('Reward approved', 'रिवॉर्ड मंज़ूर'))} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">{tx('Approve', 'मंज़ूर करें')}</button>
        </div>
      )}
      {rewardAdmin && r.rewardStatus === 'APPROVED' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-2.5">
          <span className="text-xs font-semibold text-amber-900">{tx('Reward', 'रिवॉर्ड')} {formatINR(r.rewardAmount)} {tx('approved', 'मंज़ूर')}{full || canPay ? <> · {tx('pay to', 'इन्हें चुकाएँ')} <b>{r.connectorName}</b>{upi ? <> · UPI <span className="font-mono">{upi}</span></> : tx(' · no UPI on file', ' · UPI दर्ज नहीं')}</> : null}</span>
          {(canPay || mine) && <>
            <input value={ref} onChange={e => setRef(e.target.value)} placeholder={tx('UPI / bank reference (UTR)', 'UPI / बैंक रेफ़रेंस (UTR)')} className={small + ' w-56'} />
            <button disabled={ref.length < 4} onClick={() => act(() => api.connectorPay(r.id, ref), tx('Marked paid', 'भुगतान दर्ज हुआ'))} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-amber-300 disabled:opacity-40">{tx('Mark paid', 'भुगतान दर्ज करें')}</button>
          </>}
        </div>
      )}
      {rewardAdmin && r.rewardStatus === 'PAID' && <p className="mt-2 text-xs font-semibold text-emerald-700">✔ {formatINR(r.rewardAmount)} {tx('paid', 'चुकाया')} · {tx('ref', 'रेफ़')} {r.payoutReference}</p>}
    </div>
  );
};

const SettingsPanel: React.FC<{ onSaved: (t: string) => void }> = ({ onSaved }) => {
  const tx = useTx();
  const hi = useI18n().lang === 'hi';
  const [enabled, setEnabled] = useState(true);
  const [rewards, setRewards] = useState<Record<string, string>>({});
  const [maxShare, setMaxShare] = useState('25');
  const [error, setError] = useState('');
  useEffect(() => { api.connectorSettings().then(s => { setEnabled(s.enabled); setMaxShare(String(s.maxSharePct ?? 25)); setRewards(Object.fromEntries(Object.entries(s.rewards).map(([k, v]) => [k, String(v)]))); }); }, []);
  const save = async () => {
    setError('');
    try { await api.connectorSaveSettings({ enabled, maxSharePct: Number(maxShare), rewards: Object.fromEntries(Object.entries(rewards).map(([k, v]) => [k, Number(v)])) }); onSaved(tx('Programme settings saved', 'प्रोग्राम सेटिंग सेव हुई')); }
    catch (e: any) { setError(e.message); }
  };
  return (
    <div className="max-w-xl space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-900"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> {tx('Connector programme is ON (partners can submit referrals)', 'कनेक्टर प्रोग्राम चालू है (पार्टनर रेफ़रल भेज सकते हैं)')}</label>
      <p className="text-xs text-slate-500">{tx('Suggested reward (₹) per closed referral. Admins can override the amount when approving. Set the numbers your business actually offers.', 'हर बंद रेफ़रल पर सुझाया रिवॉर्ड (₹)। मंज़ूरी के समय एडमिन राशि बदल सकते हैं। वही राशि रखें जो आपका बिज़नेस सच में देता है।')}</p>
      {REFERRAL_TYPES.map(t => (
        <div key={t.id} className="flex items-center justify-between gap-3 text-xs"><span>{hi ? t.hi : t.label}</span><input value={rewards[t.id] ?? ''} onChange={e => setRewards({ ...rewards, [t.id]: e.target.value })} inputMode="numeric" className={small + ' w-28 text-right'} /></div>
      ))}
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs"><span>{tx('Highest connector share of a broker\'s commission (%)', 'ब्रोकर के कमीशन में कनेक्टर का अधिकतम हिस्सा (%)')}</span><input value={maxShare} onChange={e => setMaxShare(e.target.value)} inputMode="decimal" className={small + ' w-28 text-right'} data-testid="max-share" /></div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <button onClick={save} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white">{tx('Save', 'सेव करें')}</button>
    </div>
  );
};

const MyPartnersPanel: React.FC = () => {
  const tx = useTx();
  const hi = useI18n().lang === 'hi';
  const label = useLabel();
  const [data, setData] = useState<{ partners: any[]; invites: any[] } | null>(null);
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fresh, setFresh] = useState<{ code: string; phone: string } | null>(null);
  const load = () => api.connectorMyPartners().then(setData).catch((e) => setMsg({ ok: false, text: e.message }));
  useEffect(() => { load(); }, []);
  const invite = async () => {
    setMsg(null);
    try { const r = await api.connectorInvitePartner(phone); setFresh({ code: r.invitation.code, phone: r.invitation.invitedPhone }); setPhone(''); await load(); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };
  const wa = (code: string, ph: string) => `https://wa.me/91${ph.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(`नमस्ते! GENZ Broker Network से जुड़ने के लिए इन्विटेशन कोड: ${code}. ऐप खोलकर "आमंत्रण कोड है? यहाँ जुड़ें" / "Have an invitation code? Join here" पर कोड डालें। Hello! Invitation code to join GENZ Broker Network: ${code}.`)}`;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold text-slate-900">{tx('Invite a local partner into your network', 'अपने नेटवर्क में लोकल पार्टनर को बुलाएँ')}</h3>
        <p className="mt-0.5 text-xs text-slate-500">{tx('Paan shop, chai stall, vegetable vendor, kirana, society members… Their referrals come straight to you, and you decide and pay their reward. GENZ ops approves the account first.', 'पान की दुकान, चाय की गुमटी, सब्ज़ी वाला, किराना, सोसाइटी के लोग… इनके रेफ़रल सीधे आपके पास आते हैं, रिवॉर्ड आप तय करते और चुकाते हैं। पहले GENZ ऑप्स अकाउंट मंज़ूर करता है।')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="numeric" placeholder={tx("Partner's mobile number", 'पार्टनर का मोबाइल नंबर')} className={small + ' w-56'} />
          <button onClick={invite} disabled={phone.replace(/\D/g, '').length < 10} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{tx('Create invitation', 'इनवाइट बनाएँ')}</button>
        </div>
        {msg && <p className={`mt-2 text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p>}
        {fresh && (
          <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">
            {tx('Code', 'कोड')} <b className="font-mono">{fresh.code}</b> ·{' '}
            <a href={wa(fresh.code, fresh.phone)} target="_blank" rel="noreferrer" className="font-semibold underline">{tx('Send on WhatsApp', 'WhatsApp पर भेजें')}</a>
          </div>
        )}
      </div>

      {data && data.invites.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs">
          <h4 className="mb-2 font-semibold text-slate-900">{tx('Pending invitations', 'बाकी इनवाइट')}</h4>
          {data.invites.map(i => (
            <div key={i.id} className="flex items-center justify-between border-t border-slate-100 py-1.5">
              <span><span className="font-mono">{i.code}</span> · {i.invitedPhone}</span>
              <a href={wa(i.code, i.invitedPhone)} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 underline">WhatsApp</a>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-left text-slate-500"><tr>{[tx('Partner', 'पार्टनर'), tx('Shop', 'दुकान'), tx('Status', 'स्टेटस'), tx('Referrals', 'रेफ़रल'), tx('Won', 'जीते'), tx('Reward due', 'रिवॉर्ड देय'), tx('Paid', 'चुकाया')].map((h, i) => <th key={i} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {(data?.partners || []).map(p => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-3 py-2"><div className="font-semibold text-slate-900">{p.name}</div><div className="text-slate-500">{p.phone}</div></td>
                <td className="px-3 py-2">{p.connector?.shopName}<div className="text-slate-500">{shopLabel(p.connector?.shopType, hi)}</div></td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 font-semibold ${p.verificationStatus === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{p.verificationStatus === 'PENDING' ? tx('Awaiting GENZ approval', 'GENZ मंज़ूरी बाकी') : label('verification', p.verificationStatus)}</span></td>
                <td className="px-3 py-2">{p.stats.total}</td><td className="px-3 py-2">{p.stats.won}</td>
                <td className="px-3 py-2">{formatINR(p.stats.rewardApprovedAmount)}</td><td className="px-3 py-2">{formatINR(p.stats.rewardPaidAmount)}</td>
              </tr>
            ))}
            {data && data.partners.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">{tx('No partners yet — invite your first one above.', 'अभी कोई पार्टनर नहीं — ऊपर से पहले पार्टनर को बुलाएँ।')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};
