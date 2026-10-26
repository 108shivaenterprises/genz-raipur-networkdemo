import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Bell, Handshake, Home, History, Plus, Check, X, QrCode, Printer, Trash2, ChevronDown, ShieldCheck, Calculator, MessagesSquare, Wallet } from 'lucide-react';
import { BuyerBondsTab, BondBlockedNotice } from './BuyerBond.js';
import { ClientRoomsTab } from './ClientRooms.js';
import { CostSheet } from './CostSheet.js';
import { HisaabTab } from './DealHisaab.js';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { formatINR } from '../lib/utils.js';
import { hasPerm } from '../lib/permissions.js';
import { SitePoster } from './SitePoster.js';
import { SOLD_PURGE_DAYS } from '../shared/dealRules.js';
import type { UserProfile } from '../types/index.js';

const inp = 'min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
const btn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-40';
const dark = `${btn} bg-slate-900 text-white`; const ghost = `${btn} border border-slate-300 bg-white text-slate-700`; const green = `${btn} bg-emerald-600 text-white`; const red = `${btn} border border-red-300 bg-white text-red-700`;
const dt = (iso?: string) => iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
const d0 = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const TONE: Record<string, string> = { SUBMITTED: 'bg-blue-100 text-blue-800', COUNTERED: 'bg-amber-100 text-amber-800', ACCEPTED: 'bg-emerald-100 text-emerald-800', TOKEN_HELD: 'bg-violet-100 text-violet-800', BACKUP: 'bg-slate-200 text-slate-700', REJECTED: 'bg-red-100 text-red-700', WITHDRAWN: 'bg-slate-200 text-slate-600', EXPIRED: 'bg-slate-200 text-slate-600', RELEASED: 'bg-slate-200 text-slate-600', CLOSED: 'bg-slate-200 text-slate-600' };
const Chip: React.FC<{ s: string; extra?: string }> = ({ s, extra }) => { const label = useLabel(); return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE[s] || 'bg-slate-100'}`}>{label('status', s)}{extra}</span>; };

type Act = (fn: () => Promise<any>, ok: string) => Promise<void>;

export const DealDesk: React.FC<{ currentUser: UserProfile; permissions: string[] }> = ({ currentUser, permissions }) => {
  const tx = useTx();
  const canOffers = hasPerm(permissions, 'offer:make', 'offer:decide');
  const canListings = hasPerm(permissions, 'listing:lifecycle');
  const canTimeline = hasPerm(permissions, 'deal:read');
  // v32 — priority order: offers & token (money) → client rooms (live chats) → my listings → buyer protection → timeline → calculator
  const tabs = [canOffers && ['offers', 'Offers & token', 'ऑफ़र और टोकन', Handshake], canTimeline && ['hisaab', 'Accounts', 'हिसाब', Wallet], hasPerm(permissions, 'clientroom:use') && ['rooms', 'Client rooms', 'क्लाइंट रूम', MessagesSquare], canListings && ['listings', 'My listings', 'मेरी लिस्टिंग', Home], hasPerm(permissions, 'offer:make', 'sitevisit:create') && currentUser.role === 'BROKER' && ['bonds', 'Buyer protection', 'खरीदार सुरक्षा', ShieldCheck], canTimeline && ['timeline', 'Deal timeline', 'डील टाइमलाइन', History], ['cost', 'Cost sheet & EMI', 'कुल ख़र्च और EMI', Calculator]].filter(Boolean) as any[];
  const [sub, setSub] = useState<string>(() => { try { const q = new URLSearchParams(window.location.search).get('sub'); if (q && tabs.some(t => t[0] === q)) return q; } catch { /* */ } return tabs[0]?.[0] || 'offers'; });
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [tick, setTick] = useState(0);
  const loadAlerts = useCallback(() => api.lsAlerts().then(r => setAlerts(r.alerts)).catch(() => setAlerts([])), []);
  useEffect(() => { loadAlerts(); }, [loadAlerts, tick]);
  const act: Act = async (fn, ok) => {
    try { await fn(); setToast({ ok: true, msg: ok }); setTick(t => t + 1); } catch (e: any) { setToast({ ok: false, msg: e.message }); }
    setTimeout(() => setToast(null), 5000);
  };
  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-bold text-slate-900">{tx('Deal Desk', 'डील डेस्क')}</h2>
        <p className="text-xs text-slate-500">{tx('Offers, token, sold / relist, site poster and your deal history — in one place.', 'ऑफ़र, टोकन, सोल्ड / रीलिस्ट, साइट पोस्टर और आपकी डील हिस्ट्री — एक जगह।')}</p></div>
      {toast && <div role="status" className={`rounded-lg px-3 py-2 text-xs font-medium ${toast.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{toast.msg}</div>}
      {alerts.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-amber-900"><Bell className="h-3.5 w-3.5" />{tx('Needs your attention', 'आपके ध्यान के लिए')} ({alerts.length})</div>
          <ul className="space-y-1">{alerts.slice(0, 6).map((a, i) => <li key={i} className="text-[11px] text-amber-900">• {tx(a.en, a.hi)}</li>)}</ul>
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        {tabs.map(([id, en, hi, Icon]) => <button key={id} onClick={() => setSub(id)} className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${sub === id ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}><Icon className="h-4 w-4" />{tx(en, hi)}</button>)}
      </div>
      {sub === 'offers' && canOffers && <OffersTab act={act} tick={tick} permissions={permissions} />}
      {sub === 'listings' && canListings && <ListingsTab act={act} tick={tick} currentUser={currentUser} />}
      {sub === 'timeline' && canTimeline && <TimelineTab act={act} tick={tick} />}
      {sub === 'hisaab' && canTimeline && <HisaabTab />}
      {sub === 'bonds' && <BuyerBondsTab tick={tick} />}
      {sub === 'rooms' && <ClientRoomsTab tick={tick} />}
      {sub === 'cost' && <CostSheet />}
    </div>
  );
};

// ───────────────────────── offers ─────────────────────────
const OffersTab: React.FC<{ act: Act; tick: number; permissions: string[] }> = ({ act, tick, permissions }) => {
  const tx = useTx();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  const [showNew, setShowNew] = useState(false);
  useEffect(() => { api.ofList().then(setD).catch(e => setErr(e.message)); }, [tick]);
  if (err) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (!d) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" />;
  const canMake = hasPerm(permissions, 'offer:make');
  return (
    <div className="space-y-5">
      {canMake && <section className="space-y-2">
        <button className={`${dark} w-full`} onClick={() => setShowNew(!showNew)}><Plus className="h-4 w-4" />{tx('Make an offer for a buyer', 'खरीदार के लिए ऑफ़र दें')}</button>
        {showNew && <NewOffer act={act} onDone={() => setShowNew(false)} />}
      </section>}
      {d.incoming.length > 0 && <section className="space-y-2"><h3 className="text-sm font-bold">{tx('Offers on my properties', 'मेरी प्रॉपर्टी पर ऑफ़र')} ({d.incoming.length})</h3>
        <p className="text-[11px] text-slate-500">{tx('Buyer names show only the first name until you accept. One offer holds the property at a time; the rest wait in a backup queue and move up automatically.', 'स्वीकार करने तक खरीदार का सिर्फ़ पहला नाम दिखता है। एक समय में एक ही ऑफ़र प्रॉपर्टी रोकता है; बाकी बैकअप कतार में रहते हैं और अपने आप आगे आते हैं।')}</p>
        {d.incoming.map((o: any) => <OfferCard key={o.id} o={o} side="incoming" act={act} />)}</section>}
      {canMake && <section className="space-y-2"><h3 className="text-sm font-bold">{tx('My offers', 'मेरे ऑफ़र')} ({d.made.length})</h3>
        {d.made.length === 0 && <p className="text-xs text-slate-500">{tx('You have not made any offers yet.', 'आपने अभी कोई ऑफ़र नहीं दिया।')}</p>}
        {d.made.map((o: any) => <OfferCard key={o.id} o={o} side="made" act={act} />)}</section>}
    </div>
  );
};

const NewOffer: React.FC<{ act: Act; onDone: () => void }> = ({ act, onDone }) => {
  const tx = useTx();
  const [props, setProps] = useState<any[]>([]);
  const [f, setF] = useState({ propertyId: '', buyerName: '', buyerPhone: '', amount: '', tokenProposed: '', validityHours: '72', note: '', consent: false });
  // v20: start from my usual list; typing searches the whole network on the server (no 40k-option drop-down)
  const [pq, setPq] = useState('');
  // v28 — pick the buyer from my own Buyer Needs instead of typing the name and mobile again
  const [clients, setClients] = useState<any[]>([]);
  useEffect(() => { api.getRequirements({ mine: true, limit: 200 }).then(r => setClients((r.requirements || []).filter((x: any) => x.customerName && x.customerPhone && !/•/.test(String(x.customerPhone))))).catch(() => setClients([])); }, []);
  useEffect(() => {
    const live = (r: any) => setProps(r.properties.filter((p: any) => ['active', 'under_negotiation'].includes(p.listingStatus)));
    const t = window.setTimeout(() => {
      (pq.trim().length >= 2 ? api.getProperties({ q: pq.trim(), limit: 40 }) : api.getProperties({ scope: 'boot' })).then(live).catch(() => undefined);
    }, pq ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [pq]);
  const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }));
  const [blocked, setBlocked] = useState<any>(null);
  const send = () => act(async () => {
    setBlocked(null);
    try { await api.ofMake({ propertyId: f.propertyId, buyerName: f.buyerName, buyerPhone: f.buyerPhone, amount: Number(f.amount), tokenProposed: Number(f.tokenProposed || 0), validityHours: Number(f.validityHours), note: f.note || undefined, consent: true }); onDone(); }
    catch (e: any) { if (e?.code === 'BUYER_BONDED') { setBlocked(e.body); throw new Error(tx('Stopped: another broker brought this buyer to this property first.', 'रुका: इस प्रॉपर्टी पर यह खरीदार पहले दूसरा ब्रोकर लाया था।')); } throw e; }
  }, tx('Offer sent', 'ऑफ़र भेजा'));
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      {blocked && <BondBlockedNotice info={blocked} onClose={() => setBlocked(null)} />}
      <input className={inp} value={pq} onChange={e => setPq(e.target.value)} placeholder={tx('Find the property — title, locality, city, PIN or ID', 'प्रॉपर्टी खोजें — नाम, इलाका, शहर, PIN या ID')} aria-label={tx('Find the property', 'प्रॉपर्टी खोजें')} />
      <select value={f.propertyId} onChange={e => set('propertyId', e.target.value)} className={inp}><option value="">{tx('Choose a property…', 'प्रॉपर्टी चुनें…')}</option>{props.map(p => <option key={p.id} value={p.id}>{p.title} — {formatINR(p.askingPrice)}</option>)}</select>
      {clients.length > 0 && <select className={inp} value="" onChange={e => { const c = clients.find(x => x.id === e.target.value); if (c) setF(x => ({ ...x, buyerName: c.customerName, buyerPhone: String(c.customerPhone).replace(/[^\d+]/g, '') })); }} aria-label={tx('Pick from my buyer needs', 'मेरी खरीदार ज़रूरतों से चुनें')} data-testid="offer-pick-client">
        <option value="">{tx('Pick the buyer from my Buyer Needs…', 'मेरी खरीदार ज़रूरतों से खरीदार चुनें…')}</option>
        {clients.map(c => <option key={c.id} value={c.id}>{c.customerName} — {c.propertyType} · {formatINR(c.budgetMax)}</option>)}
      </select>}
      <div className="grid grid-cols-2 gap-2"><input className={inp} placeholder={tx('Buyer name', 'खरीदार का नाम')} value={f.buyerName} onChange={e => set('buyerName', e.target.value)} /><input className={inp} inputMode="numeric" placeholder={tx('Buyer mobile', 'खरीदार का मोबाइल')} value={f.buyerPhone} onChange={e => set('buyerPhone', e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-2"><input className={inp} inputMode="numeric" placeholder={tx('Offer ₹', 'ऑफ़र ₹')} value={f.amount} onChange={e => set('amount', e.target.value)} /><input className={inp} inputMode="numeric" placeholder={tx('Token ₹', 'टोकन ₹')} value={f.tokenProposed} onChange={e => set('tokenProposed', e.target.value)} /></div>
      <label className="block text-[11px] text-slate-600">{tx('Valid for (hours, 6–168)', 'वैधता (घंटे, 6–168)')}<input className={inp} inputMode="numeric" value={f.validityHours} onChange={e => set('validityHours', e.target.value)} /></label>
      <input className={inp} placeholder={tx('Note (optional)', 'नोट (वैकल्पिक)')} maxLength={300} value={f.note} onChange={e => set('note', e.target.value)} />
      <label className="flex min-h-11 items-start gap-2 text-[11px] font-semibold"><input type="checkbox" checked={f.consent} onChange={e => set('consent', e.target.checked)} className="mt-0.5 h-5 w-5" />{tx('The buyer agreed that I share their details for this offer', 'खरीदार ने इस ऑफ़र के लिए अपनी जानकारी साझा करने की सहमति दी है')}</label>
      <button disabled={!f.consent || !f.propertyId} className={`${dark} w-full`} onClick={send}>{tx('Send offer', 'ऑफ़र भेजें')}</button>
    </div>
  );
};

const OfferCard: React.FC<{ o: any; side: 'incoming' | 'made'; act: Act }> = ({ o, side, act }) => {
  const tx = useTx();
  const [open, setOpen] = useState(false); const [mode, setMode] = useState<'' | 'counter' | 'reject' | 'token' | 'refund'>('');
  const [v, setV] = useState({ amount: '', note: '', ref: '', days: '7' });
  const run = (fn: () => Promise<any>, ok: string) => act(fn, ok).then(() => setMode(''));
  const t = o.token;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><div className="truncate text-sm font-bold">{o.property?.title || o.propertyId}</div>
          <div className="text-[11px] text-slate-500">{side === 'incoming' ? `${tx('Buyer', 'खरीदार')}: ${o.buyerName} · ${tx('via', 'द्वारा')} ${o.brokerName}` : `${tx('Buyer', 'खरीदार')}: ${o.buyerName} ••••${o.buyerPhoneLast4}`}</div></div>
        <Chip s={o.status} extra={o.status === 'BACKUP' && o.queueNo ? ` #${o.queueNo}` : ''} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px]">
        <div className="rounded-lg bg-slate-50 p-2"><div className="font-bold">{formatINR(o.counterAmount && o.status === 'COUNTERED' ? o.counterAmount : o.amount)}</div>{o.status === 'COUNTERED' ? tx('counter', 'काउंटर') : tx('offer', 'ऑफ़र')}</div>
        <div className="rounded-lg bg-slate-50 p-2"><div className="font-bold">{formatINR(t?.amount ?? o.tokenProposed)}</div>{t ? tx('token received', 'टोकन मिला') : tx('token', 'टोकन')}</div>
        <div className="rounded-lg bg-slate-50 p-2"><div className="font-bold">{d0(t && !t.outcome ? t.validUntil : o.validUntil)}</div>{tx('valid till', 'तक वैध')}</div>
      </div>
      {o.status === 'COUNTERED' && o.counterNote && <p className="mt-1 text-[11px] text-amber-800">“{o.counterNote}”</p>}
      {o.status === 'ACCEPTED' && o.tokenDueBy && <p className="mt-1 text-[11px] text-emerald-800">{tx('Token due by', 'टोकन की समय-सीमा')} {dt(o.tokenDueBy)}{o.dealRoomId ? ` · ${o.dealRoomId}` : ''}</p>}
      {t && <p className="mt-1 text-[11px] text-slate-600">{tx('Ref', 'रेफ़रेंस')} {t.ref} · {t.buyerSideAckAt ? `✔ ${tx('buyer side confirmed paid', 'खरीदार पक्ष ने पुष्टि की')}` : tx('buyer side has not confirmed yet', 'खरीदार पक्ष की पुष्टि बाकी')}{t.outcome ? ` · ${t.outcome}${t.outcomeAckAt ? ' ✔' : ''}` : ''}</p>}
      {o.needsOwner && <p className="mt-1 rounded bg-amber-50 p-2 text-[11px] text-amber-800">{tx('You brought this buyer yourself — only the property owner can decide on this offer.', 'यह खरीदार आप ही लाए हैं — इस ऑफ़र पर सिर्फ़ प्रॉपर्टी मालिक फ़ैसला कर सकता है।')}</p>}

      <div className="mt-2 flex flex-wrap gap-2">
        {side === 'incoming' && o.canDecide && ['SUBMITTED'].includes(o.status) && <>
          <button className={green} onClick={() => run(() => api.ofDecide(o.id, { action: 'ACCEPT' }), tx('Accepted', 'स्वीकार'))}><Check className="h-4 w-4" />{tx('Accept', 'स्वीकार')}</button>
          <button className={ghost} onClick={() => setMode('counter')}>{tx('Counter', 'काउंटर')}</button><button className={red} onClick={() => setMode('reject')}><X className="h-4 w-4" />{tx('Reject', 'अस्वीकार')}</button></>}
        {side === 'incoming' && o.canDecide && o.status === 'BACKUP' && <button className={red} onClick={() => setMode('reject')}>{tx('Reject', 'अस्वीकार')}</button>}
        {side === 'incoming' && o.canDecide && o.status === 'ACCEPTED' && <button className={dark} onClick={() => setMode('token')}>{tx('Record token received', 'टोकन मिला दर्ज करें')}</button>}
        {side === 'incoming' && o.canDecide && o.status === 'TOKEN_HELD' && t && !t.outcome && <>
          {!t.extended && <button className={ghost} onClick={() => run(() => api.ofTokenExtend(o.id, 3), tx('Extended by 3 days', '3 दिन बढ़ाया'))}>{tx('Extend 3 days', '3 दिन बढ़ाएँ')}</button>}
          <button className={ghost} onClick={() => setMode('refund')}>{tx('Refund / forfeit', 'वापस / ज़ब्त')}</button></>}
        {side === 'made' && o.status === 'COUNTERED' && <>
          <button className={green} onClick={() => run(() => api.ofRespond(o.id, 'ACCEPT'), tx('Counter accepted', 'काउंटर मंज़ूर'))}>{tx('Accept counter', 'काउंटर मंज़ूर')}</button>
          <button className={red} onClick={() => run(() => api.ofRespond(o.id, 'DECLINE'), tx('Declined', 'अस्वीकार'))}>{tx('Decline', 'अस्वीकार')}</button></>}
        {side === 'made' && ['SUBMITTED', 'COUNTERED', 'ACCEPTED', 'BACKUP'].includes(o.status) && <button className={red} onClick={() => run(() => api.ofWithdraw(o.id), tx('Withdrawn', 'वापस लिया'))}>{tx('Withdraw', 'वापस लें')}</button>}
        {side === 'made' && t && !t.buyerSideAckAt && <button className={dark} onClick={() => run(() => api.ofTokenAck(o.id, 'PAID'), tx('Confirmed', 'पुष्टि हुई'))}>{tx('I confirm the token was paid', 'टोकन भरा — पुष्टि')}</button>}
        {side === 'made' && t?.outcome && !t.outcomeAckAt && <button className={ghost} onClick={() => run(() => api.ofTokenAck(o.id, 'OUTCOME'), tx('Confirmed', 'पुष्टि हुई'))}>{tx('Confirm outcome', 'नतीजे की पुष्टि')}</button>}
        <button className={ghost} onClick={() => setOpen(!open)}><ChevronDown className={`h-4 w-4 ${open ? 'rotate-180' : ''}`} />{tx('History', 'इतिहास')}</button>
      </div>

      {mode === 'counter' && <div className="mt-2 space-y-2"><input className={inp} inputMode="numeric" placeholder={tx('Counter amount ₹', 'काउंटर राशि ₹')} value={v.amount} onChange={e => setV({ ...v, amount: e.target.value })} /><input className={inp} placeholder={tx('Note', 'नोट')} value={v.note} onChange={e => setV({ ...v, note: e.target.value })} /><button className={dark} onClick={() => run(() => api.ofDecide(o.id, { action: 'COUNTER', counterAmount: Number(v.amount), note: v.note }), tx('Counter sent', 'काउंटर भेजा'))}>{tx('Send counter', 'काउंटर भेजें')}</button></div>}
      {mode === 'reject' && <div className="mt-2 space-y-2"><input className={inp} placeholder={tx('Reason (required)', 'कारण (ज़रूरी)')} value={v.note} onChange={e => setV({ ...v, note: e.target.value })} /><button className={red} onClick={() => run(() => api.ofDecide(o.id, { action: 'REJECT', note: v.note }), tx('Rejected', 'अस्वीकार'))}>{tx('Reject offer', 'ऑफ़र अस्वीकार')}</button></div>}
      {mode === 'token' && <div className="mt-2 space-y-2">
        <p className="text-[11px] text-slate-600">{tx('GENZ does not handle the money. The buyer pays you directly; record it here with the UTR / receipt number.', 'पैसा GENZ से नहीं गुज़रता। खरीदार सीधे आपको देता है; UTR / रसीद नंबर के साथ यहाँ दर्ज करें।')}</p>
        <div className="grid grid-cols-2 gap-2"><input className={inp} inputMode="numeric" placeholder={tx('Amount ₹', 'राशि ₹')} value={v.amount} onChange={e => setV({ ...v, amount: e.target.value })} /><input className={inp} placeholder={tx('UTR / receipt no.', 'UTR / रसीद नं.')} value={v.ref} onChange={e => setV({ ...v, ref: e.target.value })} /></div>
        <label className="block text-[11px] text-slate-600">{tx('Token valid for (days, max 30)', 'टोकन वैधता (दिन, अधिकतम 30)')}<input className={inp} inputMode="numeric" value={v.days} onChange={e => setV({ ...v, days: e.target.value })} /></label>
        <button className={dark} onClick={() => run(() => api.ofToken(o.id, { amount: Number(v.amount), ref: v.ref, validDays: Number(v.days) }), tx('Token recorded — property locked', 'टोकन दर्ज — प्रॉपर्टी लॉक'))}>{tx('Record & lock property', 'दर्ज करें और लॉक करें')}</button></div>}
      {mode === 'refund' && <div className="mt-2 space-y-2"><input className={inp} placeholder={tx('Note (how it was settled)', 'नोट (कैसे निपटा)')} value={v.note} onChange={e => setV({ ...v, note: e.target.value })} />
        <div className="flex gap-2"><button className={dark} onClick={() => run(() => api.ofTokenClose(o.id, { outcome: 'REFUNDED', note: v.note }), tx('Refunded — property free', 'वापस — प्रॉपर्टी फ्री'))}>{tx('Refunded', 'वापस किया')}</button>
          <button disabled={Date.parse(t?.validUntil) > Date.now()} className={red} onClick={() => run(() => api.ofTokenClose(o.id, { outcome: 'FORFEITED', note: v.note }), tx('Marked forfeited', 'ज़ब्त दर्ज'))}>{tx('Forfeited (after expiry)', 'ज़ब्त (समय खत्म)')}</button></div></div>}
      {open && <ol className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-600">{o.history.map((h: any, i: number) => <li key={i}><span className="text-slate-400">{dt(h.at)}</span> · {h.text}{h.byName && h.byName !== 'GENZ' ? ` (${h.byName})` : ''}</li>)}</ol>}
    </div>
  );
};

// ───────────────────────── listings ─────────────────────────
const ListingsTab: React.FC<{ act: Act; tick: number; currentUser: UserProfile }> = ({ act, tick }) => {
  const tx = useTx();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  const [enq, setEnq] = useState<any[]>([]);
  useEffect(() => { api.lsMine().then(setD).catch(e => setErr(e.message)); api.lsEnquiries().then(r => setEnq(r.enquiries)).catch(() => setEnq([])); }, [tick]);
  if (err) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (!d) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" />;
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">{tx(`When a listing is sold or rented it leaves matching and the feed at once. Owner and customer personal data is erased ${d.purgeDays} days later; your deal timeline, commission records and an anonymous market record stay.`, `लिस्टिंग सोल्ड / रेंटेड होते ही मैचिंग और फ़ीड से हट जाती है। मालिक और ग्राहक का निजी डेटा ${d.purgeDays} दिन बाद मिट जाता है; आपकी डील टाइमलाइन, कमीशन रिकॉर्ड और अनाम मार्केट रिकॉर्ड बने रहते हैं।`)}</p>
      {d.listings.length === 0 && <p className="text-xs text-slate-500">{tx('No listings yet.', 'अभी कोई लिस्टिंग नहीं।')}</p>}
      {d.listings.map((l: any) => <ListingCard key={l.id} l={l} act={act} />)}
      {enq.length > 0 && <section className="space-y-2"><h3 className="text-sm font-bold">{tx('Poster enquiries', 'पोस्टर से पूछताछ')} ({enq.length})</h3>
        {enq.map(e => <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
          <div className="min-w-0"><b>{e.name}</b> · <a className="text-blue-700 underline" href={`tel:${e.phone}`}>{e.phone}</a><div className="truncate text-slate-500">{e.propertyTitle}{e.message ? ` — ${e.message}` : ''}</div><div className="text-[10px] text-slate-400">{dt(e.createdAt)} · {e.status}</div></div>
          <div className="flex gap-2">{e.status === 'NEW' && <button className={ghost} onClick={() => act(() => api.lsEnquiryStatus(e.id, 'CONTACTED'), tx('Marked contacted', 'संपर्क किया'))}>{tx('Contacted', 'संपर्क किया')}</button>}{e.status !== 'CLOSED' && <button className={ghost} onClick={() => act(() => api.lsEnquiryStatus(e.id, 'CLOSED'), tx('Closed', 'बंद'))}>{tx('Close', 'बंद')}</button>}</div></div>)}</section>}
    </div>
  );
};

const STATUS_LABEL: Record<string, [string, string, string]> = { active: ['Active', 'चालू', 'bg-emerald-100 text-emerald-800'], under_negotiation: ['On hold / negotiating', 'होल्ड / बातचीत', 'bg-amber-100 text-amber-800'], sold: ['Sold', 'बिकी', 'bg-red-100 text-red-700'], rented: ['Rented', 'किराए पर', 'bg-red-100 text-red-700'], withdrawn: ['Withdrawn', 'हटाई', 'bg-slate-200 text-slate-700'], pending_verification: ['Pending verification', 'वेरिफिकेशन बाकी', 'bg-blue-100 text-blue-800'], suspended: ['Suspended', 'निलंबित', 'bg-slate-200 text-slate-700'], draft: ['Draft', 'ड्राफ़्ट', 'bg-slate-100 text-slate-600'] };

const ListingCard: React.FC<{ l: any; act: Act }> = ({ l, act }) => {
  const tx = useTx();
  const [mode, setMode] = useState<'' | 'sold' | 'relist' | 'poster'>('');
  const [poster, setPoster] = useState<any>(null);
  const [via, setVia] = useState<'NETWORK' | 'OUTSIDE'>('OUTSIDE'); const [pick, setPick] = useState(''); const [cands, setCands] = useState<any[]>([]);
  const [v, setV] = useState({ price: '', note: '', ask: String(l.askingPrice), ownerName: '', ownerPhone: '', address: '' });
  const closed = ['sold', 'rented', 'withdrawn'].includes(l.listingStatus);
  const closedWord = l.transactionType === 'Sale' ? 'sold' : 'rented';
  const st = STATUS_LABEL[l.listingStatus] || [l.listingStatus, l.listingStatus, 'bg-slate-100'];
  useEffect(() => {
    if (mode !== 'sold') return;
    Promise.all([api.ofList(), api.getDeals()]).then(([o, dl]) => {
      const offers = o.incoming.filter((x: any) => x.propertyId === l.id && ['ACCEPTED', 'TOKEN_HELD'].includes(x.status)).map((x: any) => ({ key: `O:${x.id}`, label: `${tx('Offer', 'ऑफ़र')} ${x.id} — ${formatINR(x.amount)} (${x.buyerName})` }));
      const deals = dl.deals.filter((x: any) => x.propertyId === l.id).map((x: any) => ({ key: `D:${x.id}`, label: `${tx('Deal room', 'डील रूम')} ${x.id}` }));
      setCands([...offers, ...deals]);
    }).catch(() => setCands([]));
  }, [mode, l.id, tx]);
  const submitSold = () => act(() => api.lsStatus(l.id, via === 'NETWORK'
    ? { status: closedWord, soldVia: 'NETWORK', ...(pick.startsWith('O:') ? { offerId: pick.slice(2) } : { dealRoomId: pick.slice(2) }), soldPrice: v.price ? Number(v.price) : undefined, soldNote: v.note || undefined }
    : { status: closedWord, soldVia: 'OUTSIDE', soldPrice: v.price ? Number(v.price) : undefined, soldNote: v.note || undefined }), tx('Marked ' + closedWord, 'स्टेटस अपडेट')).then(() => setMode(''));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><div className="truncate text-sm font-bold">{l.title}</div><div className="text-[11px] text-slate-500">{l.locality}, {l.city} · {formatINR(l.askingPrice)} · {l.id}</div></div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${st[2]}`}>{tx(st[0], st[1])}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-500">
        {l.liveOffers > 0 && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{l.liveOffers} {tx('live offers', 'ऑफ़र')}</span>}
        {l.tokenHeld && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">{tx('token held', 'टोकन लॉक')}</span>}
        {l.posterCode && <span>{l.posterViews} {tx('poster scans', 'पोस्टर स्कैन')}</span>}
        {l.newEnquiries > 0 && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">{l.newEnquiries} {tx('new enquiries', 'नई पूछताछ')}</span>}
        {l.resaleOf && <span className="rounded bg-slate-100 px-1.5 py-0.5">{tx('resale of', 'रीसेल')} {l.resaleOf}</span>}
        {l.verificationStatus === 'PENDING' && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{tx('awaiting verification', 'वेरिफिकेशन का इंतज़ार')}</span>}
      </div>
      {closed && l.soldAt && <p className="mt-1 text-[11px] text-slate-600">{d0(l.soldAt)} · {l.soldVia === 'NETWORK' ? tx('inside GENZ', 'GENZ के अंदर') : tx('outside the network', 'नेटवर्क के बाहर')}{l.soldPrice ? ` · ${formatINR(l.soldPrice)}` : ''}{l.purgedAt ? ` · ${tx('personal data erased', 'निजी डेटा मिटाया')}` : l.purgeOn ? ` · ${tx('data erased on', 'डेटा मिटेगा')} ${d0(l.purgeOn)}` : ''}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {!closed && ['active', 'under_negotiation'].includes(l.listingStatus) && <>
          {l.listingStatus === 'under_negotiation' && !l.tokenHeld && <button className={ghost} onClick={() => act(() => api.lsStatus(l.id, { status: 'active' }), tx('Active again', 'फिर चालू'))}>{tx('Make active', 'चालू करें')}</button>}
          {l.listingStatus === 'active' && <button className={ghost} onClick={() => act(() => api.lsStatus(l.id, { status: 'under_negotiation' }), tx('On hold', 'होल्ड'))}>{tx('Put on hold', 'होल्ड')}</button>}
          <button className={dark} onClick={() => setMode(mode === 'sold' ? '' : 'sold')}>{l.transactionType === 'Sale' ? tx('Mark sold', 'बिकी') : tx('Mark rented', 'किराए पर गई')}</button>
          <button className={red} onClick={() => { if (window.confirm(tx('Withdraw this listing?', 'यह लिस्टिंग हटाएँ?'))) act(() => api.lsStatus(l.id, { status: 'withdrawn' }), tx('Withdrawn', 'हटाई')); }}>{tx('Withdraw', 'हटाएँ')}</button>
          {l.isListingBroker && l.verificationStatus === 'VERIFIED' && <button className={ghost} onClick={async () => { try { setPoster(await api.lsPoster(l.id)); setMode('poster'); } catch (e: any) { act(() => Promise.reject(e), ''); } }}><QrCode className="h-4 w-4" />{tx('Site poster', 'साइट पोस्टर')}</button>}
        </>}
        {l.canUndo && <button className={ghost} onClick={() => act(() => api.lsUndo(l.id), tx('Restored', 'वापस चालू'))}>{tx('Undo (24 h)', 'पूर्ववत (24 घंटे)')}</button>}
        {closed && <button className={ghost} onClick={() => setMode(mode === 'relist' ? '' : 'relist')}>{tx('Relist (resale)', 'रीलिस्ट (रीसेल)')}</button>}
      </div>
      {mode === 'sold' && <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
        <div className="text-[11px] font-semibold">{tx('How did it close?', 'कैसे हुआ?')}</div>
        <div className="flex gap-2"><button className={via === 'NETWORK' ? dark : ghost} onClick={() => setVia('NETWORK')}>{tx('Inside GENZ', 'GENZ के अंदर')}</button><button className={via === 'OUTSIDE' ? dark : ghost} onClick={() => setVia('OUTSIDE')}>{tx('Outside the network', 'नेटवर्क के बाहर')}</button></div>
        {via === 'NETWORK' && <select className={inp} value={pick} onChange={e => setPick(e.target.value)}><option value="">{tx('Through which offer / deal?', 'किस ऑफ़र / डील से?')}</option>{cands.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select>}
        <input className={inp} inputMode="numeric" placeholder={tx('Final price ₹ (optional, private)', 'अंतिम कीमत ₹ (वैकल्पिक, निजी)')} value={v.price} onChange={e => setV({ ...v, price: e.target.value })} />
        <input className={inp} maxLength={200} placeholder={tx('Note (optional, private)', 'नोट (वैकल्पिक, निजी)')} value={v.note} onChange={e => setV({ ...v, note: e.target.value })} />
        <p className="text-[10px] text-slate-500">{tx('Price and note are visible only to you and the owner / listing broker. You can undo within 24 hours.', 'कीमत और नोट सिर्फ़ आपको और मालिक / लिस्टिंग ब्रोकर को दिखते हैं। 24 घंटे में पूर्ववत कर सकते हैं।')}</p>
        <button disabled={via === 'NETWORK' && !pick} className={`${dark} w-full`} onClick={submitSold}>{tx('Confirm', 'पक्का करें')}</button></div>}
      {mode === 'relist' && <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
        <p className="text-[11px] text-slate-600">{tx('Creates a NEW listing linked to this one. It needs verification again; old deals and commissions stay with the old record.', 'यह नई लिस्टिंग बनाता है जो इससे जुड़ी रहती है। दोबारा वेरिफिकेशन लगेगा; पुरानी डील और कमीशन पुराने रिकॉर्ड में रहते हैं।')}</p>
        <input className={inp} inputMode="numeric" placeholder={tx('New asking price ₹', 'नई माँग कीमत ₹')} value={v.ask} onChange={e => setV({ ...v, ask: e.target.value })} />
        {l.purgedAt && <><input className={inp} placeholder={tx('Owner name', 'मालिक का नाम')} value={v.ownerName} onChange={e => setV({ ...v, ownerName: e.target.value })} /><input className={inp} inputMode="numeric" placeholder={tx('Owner mobile', 'मालिक का मोबाइल')} value={v.ownerPhone} onChange={e => setV({ ...v, ownerPhone: e.target.value })} /><input className={inp} placeholder={tx('Address', 'पता')} value={v.address} onChange={e => setV({ ...v, address: e.target.value })} /></>}
        <button className={`${dark} w-full`} onClick={() => act(() => api.lsRelist(l.id, { confirm: true, askingPrice: Number(v.ask), ...(l.purgedAt ? { ownerName: v.ownerName, ownerPhone: v.ownerPhone, addressHidden: v.address } : {}) }), tx('Relisted — pending verification', 'रीलिस्ट — वेरिफिकेशन बाकी')).then(() => setMode(''))}>{tx('The property is available again', 'प्रॉपर्टी फिर उपलब्ध है')}</button></div>}
      {mode === 'poster' && poster && <div className="mt-2"><SitePoster data={poster.poster} code={poster.code} onClose={() => setMode('')} /></div>}
    </div>
  );
};

// ───────────────────────── timeline ─────────────────────────
const KIND_DOT: Record<string, string> = { DEAL: 'bg-slate-500', VISIT: 'bg-blue-500', VISIT_DONE: 'bg-emerald-500', OFFER: 'bg-violet-500', AUDIT: 'bg-slate-400', COMMISSION: 'bg-amber-500', DISPUTE: 'bg-red-500', MILESTONE: 'bg-sky-500', MILESTONE_DONE: 'bg-teal-500', MILESTONE_CONFIRMED: 'bg-emerald-600', SOLD: 'bg-red-600' };
const MS_KINDS: Array<[string, string, string]> = [['AGREEMENT', 'Agreement', 'एग्रीमेंट'], ['PAYMENT', 'Payment', 'पेमेंट'], ['REGISTRY', 'Registry', 'रजिस्ट्री'], ['POSSESSION', 'Possession', 'कब्ज़ा'], ['COMMISSION', 'Commission', 'कमीशन'], ['OTHER', 'Other', 'अन्य']];

const TimelineTab: React.FC<{ act: Act; tick: number }> = ({ act, tick }) => {
  const tx = useTx();
  const label = useLabel();
  const [deals, setDeals] = useState<any[] | null>(null); const [sel, setSel] = useState(''); const [t, setT] = useState<any>(null); const [err, setErr] = useState('');
  const [ms, setMs] = useState({ kind: 'PAYMENT', title: '', plannedAt: '', amount: '' }); const [note, setNote] = useState({ text: '', remindAt: '' });
  useEffect(() => { api.getDeals().then(r => { setDeals(r.deals); if (!sel && r.deals[0]) setSel(r.deals[0].id); }).catch(e => setErr(e.message)); }, []);  // eslint-disable-line
  useEffect(() => { if (sel) api.tlGet(sel).then(setT).catch(e => { setT(null); setErr(e.message); }); }, [sel, tick]);
  const title = useMemo(() => t?.deal ? `${t.deal.propertyTitle || t.deal.propertyId} — ${t.deal.customer}` : '', [t]);
  const print = () => {
    if (!t) return; const w = window.open('', '_blank'); if (!w) return;
    const e = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    w.document.write(`<html><head><title>Deal ${e(t.deal.id)}</title><style>body{font-family:system-ui;margin:24px;color:#111}h1{font-size:18px;margin:0}table{border-collapse:collapse;width:100%;margin-top:12px;font-size:12px}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left;vertical-align:top}.s{color:#555;font-size:12px}.f{margin-top:16px;font-size:11px;color:#555}</style></head><body><h1>Deal timeline — ${e(t.deal.id)}</h1><div class="s">${e(title)} · ${e(t.deal.locality || '')} · stage ${e(t.deal.stage)}</div><div class="s">Brokers: ${e(t.deal.brokers.introducing || '-')} / ${e(t.deal.brokers.closing || '-')}</div>
<table><tr><th>When</th><th>What</th><th>By</th><th>Status</th></tr>${t.events.map((x: any) => `<tr><td>${e(dt(x.at))}</td><td>${e(x.title)}${x.detail ? `<br><span class="s">${e(x.detail)}</span>` : ''}</td><td>${e(x.by || '')}</td><td>${e(x.status || '')}</td></tr>`).join('')}</table>
<div class="f">Generated ${e(dt(t.generatedAt))} from the GENZ Broker Network activity record. Fingerprint ${e(t.fingerprint)}. “UNCONFIRMED” = marked by one side only. GENZ does not see bank or registrar records; this is a record of what the parties entered in the app.</div></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 400);
  };
  if (err && !deals) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (!deals) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" />;
  if (deals.length === 0) return <p className="text-xs text-slate-500">{tx('No deals yet. A deal opens when you schedule a visit or an offer is accepted.', 'अभी कोई डील नहीं। विज़िट शेड्यूल या ऑफ़र स्वीकार होने पर डील खुलती है।')}</p>;
  return (
    <div className="space-y-4">
      <select value={sel} onChange={e => setSel(e.target.value)} className={inp}>{deals.map(d => <option key={d.id} value={d.id}>{d.id} · {label('dealStage', d.stage)}</option>)}</select>
      {t && <>
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-bold">{title}</div><div className="text-[11px] text-slate-500">{t.deal.stage} · {tx('fingerprint', 'फ़िंगरप्रिंट')} {t.fingerprint}</div></div><button className={ghost} onClick={print}><Printer className="h-4 w-4" />{tx('Print / PDF', 'प्रिंट / PDF')}</button></div>
        <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
          {t.events.map((x: any, i: number) => (
            <li key={i} className="relative"><span className={`absolute -left-[22px] top-1 h-3 w-3 rounded-full ${KIND_DOT[x.kind] || 'bg-slate-400'}`} />
              <div className="text-[10px] text-slate-400">{dt(x.at)}{x.by ? ` · ${x.by}` : ''}</div>
              <div className="text-xs font-medium text-slate-800">{x.title} {x.status === 'UNCONFIRMED' && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">{tx('unconfirmed', 'अपुष्ट')}</span>}{x.status === 'CONFIRMED' && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800">✔ {tx('confirmed', 'पुष्ट')}</span>}</div>
              {x.detail && <div className="text-[11px] text-slate-500">{x.detail}</div>}</li>
          ))}
        </ol>
        {t.canWrite && <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <h4 className="text-sm font-bold">{tx('Agreement · payment · registry milestones', 'एग्रीमेंट · पेमेंट · रजिस्ट्री माइलस्टोन')}</h4>
          <p className="text-[11px] text-slate-500">{tx('Mark it done when it happens; the other side then confirms. Only confirmed entries count as agreed by both.', 'हो जाने पर “पूरा” करें; फिर दूसरा पक्ष पुष्टि करता है। दोनों की पुष्टि वाली एंट्री ही पक्की मानी जाती है।')}</p>
          {t.milestones.filter((m: any) => m.status !== 'CANCELLED').map((m: any) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-xs">
              <div className="min-w-0"><b>{m.title}</b> <span className="text-slate-500">· {m.kind.toLowerCase()}{m.amount ? ` · ${formatINR(m.amount)}` : ''}{m.plannedAt ? ` · ${d0(m.plannedAt)}` : ''}{m.ref ? ` · ref ${m.ref}` : ''}</span>
                <div className="text-[10px] text-slate-500">{m.status === 'PLANNED' ? tx('planned', 'योजना') : m.confirmedAt ? `✔ ${tx('confirmed by', 'पुष्टि')} ${m.confirmedByName}` : tx('done — awaiting the other side', 'पूरा — दूसरे पक्ष की पुष्टि बाकी')}</div></div>
              <div className="flex gap-2">
                {m.status === 'PLANNED' && <button className={ghost} onClick={() => act(() => api.tlMs(sel, m.id, 'done', m.kind === 'PAYMENT' || m.kind === 'COMMISSION' ? { ref: window.prompt(tx('Payment reference (UTR / receipt) — optional', 'पेमेंट रेफ़रेंस (UTR / रसीद) — वैकल्पिक')) || undefined } : {}), tx('Marked done', 'पूरा'))}>{tx('Done', 'पूरा')}</button>}
                {m.canConfirm && <button className={green} onClick={() => act(() => api.tlMs(sel, m.id, 'confirm'), tx('Confirmed', 'पुष्टि'))}>{tx('Confirm', 'पुष्टि')}</button>}
                {!m.confirmedAt && <button aria-label={tx('Cancel', 'रद्द करें')} className="min-h-11 min-w-11 text-slate-400 hover:text-red-600" onClick={() => act(() => api.tlMs(sel, m.id, 'cancel'), tx('Cancelled', 'रद्द'))}><Trash2 className="mx-auto h-4 w-4" /></button>}
              </div></div>
          ))}
          <div className="grid grid-cols-2 gap-2"><select className={inp} value={ms.kind} onChange={e => setMs({ ...ms, kind: e.target.value })}>{MS_KINDS.map(([k, en, hi]) => <option key={k} value={k}>{tx(en, hi)}</option>)}</select><input type="date" className={inp} value={ms.plannedAt} onChange={e => setMs({ ...ms, plannedAt: e.target.value })} /></div>
          <div className="grid grid-cols-[1fr_7rem] gap-2"><input className={inp} placeholder={tx('e.g. Registry at sub-registrar', 'जैसे: सब-रजिस्ट्रार में रजिस्ट्री')} value={ms.title} onChange={e => setMs({ ...ms, title: e.target.value })} /><input className={inp} inputMode="numeric" placeholder="₹" value={ms.amount} onChange={e => setMs({ ...ms, amount: e.target.value })} /></div>
          <button disabled={ms.title.trim().length < 3} className={`${dark} w-full`} onClick={() => act(() => api.tlAdd(sel, { kind: ms.kind, title: ms.title, plannedAt: ms.plannedAt || undefined, amount: ms.amount ? Number(ms.amount) : undefined }).then(() => setMs({ ...ms, title: '', amount: '' })), tx('Milestone added', 'माइलस्टोन जुड़ा'))}><Plus className="h-4 w-4" />{tx('Add milestone', 'माइलस्टोन जोड़ें')}</button>
        </section>}
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <h4 className="text-sm font-bold">{tx('My private notes & reminders', 'मेरे निजी नोट और रिमाइंडर')}</h4>
          <p className="text-[11px] text-slate-500">{tx('Only you can see these.', 'इन्हें सिर्फ़ आप देख सकते हैं।')}</p>
          {t.notes.map((n: any) => <div key={n.id} className="flex items-start justify-between gap-2 rounded-lg bg-amber-50/60 p-2 text-xs"><div>{n.text}{n.remindAt && <div className="text-[10px] text-amber-800">⏰ {dt(n.remindAt)}</div>}</div><button aria-label={tx('Delete', 'हटाएँ')} className="min-h-11 min-w-11 text-slate-400 hover:text-red-600" onClick={() => act(() => api.tlNoteDel(sel, n.id), tx('Deleted', 'हटाया'))}><Trash2 className="mx-auto h-4 w-4" /></button></div>)}
          <textarea className={`${inp} min-h-20`} maxLength={500} placeholder={tx('e.g. Registry on 20th — remind buyer about stamp duty', 'जैसे: 20 को रजिस्ट्री — खरीदार को स्टांप ड्यूटी याद दिलाएँ')} value={note.text} onChange={e => setNote({ ...note, text: e.target.value })} />
          <input type="datetime-local" className={inp} value={note.remindAt} onChange={e => setNote({ ...note, remindAt: e.target.value })} />
          <button disabled={note.text.trim().length < 2} className={`${dark} w-full`} onClick={() => act(() => api.tlNote(sel, { text: note.text, remindAt: note.remindAt ? new Date(note.remindAt).toISOString() : undefined }).then(() => setNote({ text: '', remindAt: '' })), tx('Note saved', 'नोट सेव'))}>{tx('Save note', 'नोट सेव करें')}</button>
        </section>
      </>}
    </div>
  );
};
