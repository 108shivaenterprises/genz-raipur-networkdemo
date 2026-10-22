import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Loader2, Sun, Users, Map as MapIcon, ShieldCheck, BarChart3, Award, BellOff, Bell, Share2, Handshake, ThumbsDown, Star, HelpCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { formatINR } from '../lib/utils.js';
import { ClientsView } from './ClientsView.js';
// Leaflet is ~150 KB: only downloaded when a broker opens the Map tab (keeps first load light on slow networks)
const MapView = lazy(() => import('./MapView.js').then(m => ({ default: m.MapView })));
import { ReportButton } from './ReportButton.js';
import type { UserProfile } from '../types/index.js';

type Sub = 'today' | 'clients' | 'map' | 'listings' | 'rates' | 'points';

export const HelpLink: React.FC<{ lesson: string; onNavigate: (t: any) => void }> = ({ lesson, onNavigate }) => {
  const tx = useTx();
  return <button type="button" onClick={() => { try { sessionStorage.setItem('genz.academy.open', lesson); } catch { /* ignore */ } onNavigate('community'); }} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={tx('Help video / guide', 'हेल्प वीडियो / गाइड')}><HelpCircle className="h-5 w-5" /></button>;
};

export const DailyView: React.FC<{ currentUser: UserProfile; onNavigate: (t: any) => void; initial?: Sub }> = ({ currentUser, onNavigate, initial = 'today' }) => {
  const tx = useTx();
  const [sub, setSub] = useState<Sub>(initial);
  const tabs: [Sub, string, string, React.ElementType][] = [
    ['today', 'Today', 'आज', Sun], ['clients', 'Clients', 'क्लाइंट', Users], ['listings', 'My listings & trust', 'मेरी लिस्टिंग और ट्रस्ट', ShieldCheck],
    ['map', 'Map', 'नक्शा', MapIcon], ['rates', 'Rate card', 'रेट कार्ड', BarChart3], ['points', 'Points', 'पॉइंट्स', Award],
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1.5 overflow-x-auto pb-1" role="tablist">
          {tabs.map(([id, en, hi, Icon]) => (
            <button key={id} role="tab" aria-selected={sub === id} onClick={() => setSub(id)} className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-semibold ${sub === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}><Icon className="h-4 w-4" aria-hidden />{tx(en, hi)}</button>
          ))}
        </div>
        <HelpLink lesson="app-start" onNavigate={onNavigate} />
      </div>
      {sub === 'today' && <Digest onGoClients={() => setSub('clients')} />}
      {sub === 'clients' && <ClientsView currentUser={currentUser} />}
      {sub === 'map' && <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>}><MapView /></Suspense>}
      {sub === 'listings' && <Listings />}
      {sub === 'rates' && <Rates city={currentUser.city} />}
      {sub === 'points' && <Points />}
    </div>
  );
};

// ───────── F1 digest ─────────
const Digest: React.FC<{ onGoClients: () => void }> = ({ onGoClients }) => {
  const tx = useTx();
  const label = useLabel();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => api.dailyDigest().then(setD).catch(e => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const fb = (m: any, action: 'OPENED' | 'SHORTLISTED' | 'DISMISSED') => { api.dailyFeedback(m.key, action).catch(() => undefined); setD((p: any) => ({ ...p, matches: action === 'DISMISSED' ? p.matches.filter((x: any) => x.key !== m.key) : p.matches.map((x: any) => (x.key === m.key ? { ...x, status: action } : x)) })); };
  const coBroke = async (m: any) => {
    if (!window.confirm(tx(`Propose a 50:50 co-broking split to ${m.broker?.name || 'the listing broker'}?`, `${m.broker?.name || 'लिस्टिंग ब्रोकर'} को 50:50 को-ब्रोकिंग का प्रस्ताव भेजें?`))) return;
    try { await api.createOffer({ propertyId: m.property.id, requirementId: m.sourceKind === 'REQUIREMENT' ? m.sourceId : undefined, proposedIntroducingShare: 50, proposedClosingShare: 50, terms: 'Standard 50:50 split proposed from the GENZ daily digest.' }); setMsg(tx('Proposal sent. Track it in Deal Rooms.', 'प्रस्ताव भेज दिया। Deal Rooms में देखें।')); }
    catch (e: any) { setMsg(e.message); }
  };
  const share = (m: any) => {
    const p = m.property; fb(m, 'SHORTLISTED');
    const text = `${p.title}\n${p.locality}, ${p.city}\n${p.propertyType} · ${formatINR(p.askingPrice)}\n\n${tx('Shared via GENZ Broker Network', 'GENZ Broker Network से शेयर किया')}`;
    if (navigator.share) navigator.share({ text }).catch(() => undefined); else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  if (err) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (!d) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-slate-900 p-4 text-white">
        <div className="text-xs font-semibold text-amber-300">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <div className="mt-1 text-lg font-bold leading-snug">{d.muted ? tx('Daily digest is muted', 'डेली डाइजेस्ट म्यूट है') : d.properties === 0 ? tx('No new matches today', 'आज कोई नया मैच नहीं') : tx(`${d.properties} properties for your ${d.clients} client(s)`, `आपके ${d.clients} क्लाइंट के लिए ${d.properties} प्रॉपर्टी`)}</div>
        {!d.muted && d.fresh > 0 && <div className="text-xs text-slate-300">{tx(`${d.fresh} listed in the last 3 days`, `${d.fresh} पिछले 3 दिनों में आईं`)}</div>}
        <button onClick={() => api.dailyPrefs({ muted: !d.muted }).then(load)} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-semibold">{d.muted ? <Bell className="h-4 w-4" aria-hidden /> : <BellOff className="h-4 w-4" aria-hidden />}{d.muted ? tx('Unmute', 'म्यूट हटाएँ') : tx('Mute digest', 'डाइजेस्ट म्यूट करें')}</button>
      </div>
      {msg && <p className="rounded-lg bg-emerald-50 p-2.5 text-xs font-medium text-emerald-800" role="status">{msg}</p>}
      {!d.muted && d.matches.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-semibold text-slate-800">{tx('Add clients to get matches', 'मैच पाने के लिए क्लाइंट जोड़ें')}</p>
          <p className="mt-1 text-xs text-slate-500">{tx('Each morning we compare your clients’ budget and areas with fresh listings from verified brokers.', 'हर सुबह हम आपके क्लाइंट के बजट और इलाके की तुलना सत्यापित ब्रोकरों की ताज़ा लिस्टिंग से करते हैं।')}</p>
          <button onClick={onGoClients} className="mt-4 min-h-12 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white">{tx('Add a client', 'क्लाइंट जोड़ें')}</button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {d.matches.map((m: any) => (
          <div key={m.key} className={`overflow-hidden rounded-xl border bg-white ${m.status === 'SHORTLISTED' ? 'border-amber-300' : 'border-slate-200'}`}>
            {m.property.image && <img src={m.property.image} alt="" loading="lazy" className="h-32 w-full object-cover" />}
            <div className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900">{m.property.title}</div><div className="truncate text-xs text-slate-500">{m.property.locality}, {m.property.city} · {label('propertyType', m.property.propertyType)}</div></div>
                <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">{m.score}%</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs"><b>{formatINR(m.property.askingPrice)}</b><span className="text-slate-500">{tx('for', 'के लिए')} {m.clientName}</span>{m.isNew && <span className="rounded bg-blue-100 px-1.5 text-[10px] font-bold text-blue-800">{tx('NEW', 'नया')}</span>}</div>
              <button onClick={() => { setOpen(open === m.key ? null : m.key); if (m.status === 'NEW') fb(m, 'OPENED'); }} className="mt-1 text-[11px] font-semibold text-slate-600 underline">{open === m.key ? tx('Hide details', 'विवरण छुपाएँ') : tx('Why this match?', 'यह मैच क्यों?')}</button>
              {open === m.key && (
                <div className="mt-2 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-700">
                  <ul className="list-disc space-y-0.5 pl-4">{m.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                  <div className="mt-1.5 text-slate-500">{tx('Listed by', 'लिस्टिंग')}: {m.broker?.name}{m.broker?.trustScore != null ? ` · ${tx('Trust', 'ट्रस्ट')} ${m.broker.trustScore}` : ''} · {tx(`confirmed available, ${m.property.daysLeft} days left`, `उपलब्ध कन्फर्म, ${m.property.daysLeft} दिन बाकी`)}</div>
                  <div className="mt-1 text-slate-500">{tx('Score = match 60% + broker trust 10% + freshness + your past taps', 'स्कोर = मैच 60% + ब्रोकर ट्रस्ट 10% + ताज़गी + आपके पिछले टैप')}</div>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button onClick={() => coBroke(m)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white"><Handshake className="h-4 w-4" aria-hidden />{tx('Co-broke', 'को-ब्रोक')}</button>
                <button onClick={() => share(m)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white"><Share2 className="h-4 w-4" aria-hidden />{tx('Share', 'शेयर')}</button>
                <button onClick={() => fb(m, 'SHORTLISTED')} className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-2.5 ${m.status === 'SHORTLISTED' ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-300 text-slate-600'}`} aria-label={tx('Shortlist', 'शॉर्टलिस्ट')}><Star className="h-4 w-4" /></button>
                <button onClick={() => fb(m, 'DISMISSED')} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 px-2.5 text-slate-600" aria-label={tx('Not interested', 'रुचि नहीं')}><ThumbsDown className="h-4 w-4" /></button>
                <span className="ml-auto"><ReportButton targetType="LISTING" targetId={m.property.id} compact /></span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ───────── F2 listings freshness + trust ─────────
const Listings: React.FC = () => {
  const tx = useTx();
  const [l, setL] = useState<any[] | null>(null); const [t, setT] = useState<any>(null); const [err, setErr] = useState('');
  const load = useCallback(() => { api.myListings().then(r => setL(r.listings)).catch(e => setErr(e.message)); api.trustBreakdown().then(setT).catch(() => undefined); }, []);
  useEffect(() => { load(); }, [load]);
  const confirm = async (id: string) => { try { await api.confirmListing(id); load(); } catch (e: any) { setErr(e.message); } };
  const STATE: Record<string, [string, string, string]> = { FRESH: ['Verified ✓', 'सत्यापित ✓', 'bg-emerald-100 text-emerald-800'], EXPIRING: ['Expiring soon', 'जल्दी खत्म होगी', 'bg-amber-100 text-amber-800'], EXPIRED: ['Hidden — expired', 'छुपी — समय खत्म', 'bg-red-100 text-red-800'], HELD: ['On hold (reports)', 'होल्ड पर (रिपोर्ट)', 'bg-red-100 text-red-800'] };
  return (
    <div className="space-y-5">
      {err && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{err}</p>}
      <section>
        <h3 className="text-sm font-bold text-slate-900">{tx('Tap “still available” once a month', 'महीने में एक बार “अभी भी उपलब्ध” दबाएँ')}</h3>
        <p className="text-xs text-slate-500">{tx('Listings not confirmed for 30 days are hidden from other brokers until you confirm. Fresh listings get the ✓ tick and rank higher.', '30 दिन तक कन्फर्म न की गई लिस्टिंग दूसरे ब्रोकरों से छुप जाती है। ताज़ा लिस्टिंग को ✓ मिलता है और वह ऊपर दिखती है।')}</p>
        {!l ? <Loader2 className="mt-3 h-5 w-5 animate-spin text-slate-400" /> : l.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-xs text-slate-500">{tx('You have no live listings. Add one from Property Inventory.', 'आपकी कोई लाइव लिस्टिंग नहीं है। Property Inventory से जोड़ें।')}</p> : (
          <ul className="mt-3 space-y-2">{l.map(x => (
            <li key={x.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-900">{x.title}</div><div className="text-xs text-slate-500">{x.locality}, {x.city}{x.state !== 'EXPIRED' && x.state !== 'HELD' ? ` · ${tx(`${x.daysLeft} days left`, `${x.daysLeft} दिन बाकी`)}` : ''}</div></div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATE[x.state][2]}`}>{tx(STATE[x.state][0], STATE[x.state][1])}</span>
              {x.state !== 'HELD' && <button onClick={() => confirm(x.id)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white"><CheckCircle2 className="h-4 w-4" aria-hidden />{tx('Still available', 'अभी भी उपलब्ध')}</button>}
            </li>))}</ul>
        )}
      </section>
      {t && (
        <section>
          <div className="flex items-baseline justify-between"><h3 className="text-sm font-bold text-slate-900">{tx('Your trust score — how it is built', 'आपका ट्रस्ट स्कोर — कैसे बनता है')}</h3><span className="text-2xl font-extrabold text-slate-900">{t.total}<span className="text-sm font-medium text-slate-400">/100</span></span></div>
          <ul className="mt-2 space-y-2">{t.parts.map((p: any) => (
            <li key={p.id} className="rounded-lg bg-white p-2.5 ring-1 ring-slate-200"><div className="flex justify-between text-xs"><span className="text-slate-700">{tx(p.en, p.hi)}</span><b>{p.pts}/{p.max}</b></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${(p.pts / p.max) * 100}%` }} /></div></li>))}</ul>
          {t.tips.length > 0 && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><b>{tx('How to raise it', 'स्कोर कैसे बढ़ाएँ')}</b><ul className="mt-1 list-disc space-y-0.5 pl-4">{t.tips.map((x: any) => <li key={x.id}>{tx(x.en, x.hi)} (+{x.gain})</li>)}</ul></div>}
        </section>
      )}
    </div>
  );
};

// ───────── F17 rate card ─────────
const Rates: React.FC<{ city: string }> = ({ city }) => {
  const tx = useTx();
  const label = useLabel();
  const [r, setR] = useState<any>(null);
  useEffect(() => { api.rateCard(city).then(setR).catch(() => setR({ cards: [], minSample: 10 })); }, [city]);
  if (!r) return <Loader2 className="h-5 w-5 animate-spin text-slate-400" />;
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">{tx(`Median ₹ per sq.ft from GENZ listings of the last 90 days. A locality appears only after ${r.minSample} listings, so one odd price cannot mislead you.`, `पिछले 90 दिनों की GENZ लिस्टिंग का मीडियन ₹ प्रति वर्ग फुट। किसी इलाके की दर तभी दिखती है जब कम से कम ${r.minSample} लिस्टिंग हों।`)}</p>
      {r.cards.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">{tx('Not enough listings yet to show a fair rate. This fills up as more brokers list.', 'अभी ठीक दर दिखाने लायक लिस्टिंग नहीं हैं। जैसे-जैसे ब्रोकर लिस्ट करेंगे, यह भरता जाएगा।')}</p> : (
        <div className="grid gap-2 sm:grid-cols-2">{r.cards.map((c: any) => (
          <div key={c.city + c.locality + c.propertyType} className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-sm font-bold text-slate-900">{c.locality}, {c.city}</div><div className="text-xs text-slate-500">{label('propertyType', c.propertyType)}</div><div className="mt-1 text-xl font-extrabold text-slate-900">₹{c.medianPerSqFt.toLocaleString('en-IN')}<span className="text-xs font-medium text-slate-500"> /sq.ft</span></div><div className="text-[11px] text-slate-500">{tx(`${c.sample} listings · ${c.from} to ${c.to}`, `${c.sample} लिस्टिंग · ${c.from} से ${c.to}`)}</div></div>))}</div>
      )}
      <p className="text-[11px] text-slate-400">{tx('Indicative only — asking prices, not registered sale values.', 'सिर्फ़ संकेत के लिए — माँगी गई कीमतें हैं, रजिस्टर्ड बिक्री मूल्य नहीं।')}</p>
    </div>
  );
};

// ───────── F13 points ─────────
const Points: React.FC = () => {
  const tx = useTx();
  const [p, setP] = useState<any>(null); const [lb, setLb] = useState<any>(null); const [msg, setMsg] = useState('');
  const load = useCallback(() => { api.points().then(setP).catch(() => undefined); api.leaderboard().then(setLb).catch(() => undefined); }, []);
  useEffect(() => { load(); }, [load]);
  const redeem = async () => { try { await api.pointsRedeem(); setMsg(tx('Profile boost is on for 7 days.', '7 दिन के लिए प्रोफ़ाइल बूस्ट चालू।')); load(); } catch (e: any) { setMsg(e.message); } };
  if (!p) return <Loader2 className="h-5 w-5 animate-spin text-slate-400" />;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-slate-900 p-4 text-white"><div className="text-xs text-slate-300">{tx('Your points', 'आपके पॉइंट्स')}</div><div className="text-3xl font-extrabold">{p.balance}</div><div className="text-xs text-slate-300">{tx(`${p.month} earned this month · points are not money`, `इस महीने ${p.month} मिले · पॉइंट्स पैसे नहीं हैं`)}</div>
        <div className="mt-3 flex flex-wrap gap-1.5">{p.badges.map((b: any) => <span key={b.id} className="rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-slate-900">{tx(b.en, b.hi)}</span>)}{p.nextBadge && <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px]">{tx(`Next badge at ${p.nextBadge.min}`, `अगला बैज ${p.nextBadge.min} पर`)}</span>}</div></div>
      <div className="rounded-xl border border-slate-200 bg-white p-3.5"><div className="text-sm font-bold text-slate-900">{tx('7-day profile boost', '7 दिन का प्रोफ़ाइल बूस्ट')}</div><p className="text-xs text-slate-500">{tx(`Your listings rank a little higher in other brokers’ daily digest. Costs ${p.cost} points.`, `दूसरे ब्रोकरों के डेली डाइजेस्ट में आपकी लिस्टिंग थोड़ी ऊपर दिखती है। ${p.cost} पॉइंट्स लगते हैं।`)}</p>
        {p.boostUntil && <p className="mt-1 text-xs font-semibold text-emerald-700">{tx('Active until', 'चालू, तारीख तक')} {new Date(p.boostUntil).toLocaleDateString('en-IN')}</p>}
        <button disabled={p.balance < p.cost} onClick={redeem} className="mt-2 min-h-11 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white disabled:opacity-40">{tx('Use points', 'पॉइंट्स इस्तेमाल करें')}</button>{msg && <p className="mt-2 text-xs text-slate-700">{msg}</p>}</div>
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-xs text-slate-600"><b className="text-slate-900">{tx('How to earn', 'कैसे कमाएँ')}</b><ul className="mt-1 list-disc space-y-0.5 pl-4"><li>{tx('Confirm a listing “still available”: 5', 'लिस्टिंग “अभी भी उपलब्ध” कन्फर्म करें: 5')}</li><li>{tx('Settled deal with another broker: 25', 'दूसरे ब्रोकर के साथ पूरी हुई डील: 25')}</li><li>{tx('Verified site visit: 3', 'सत्यापित साइट विज़िट: 3')}</li><li>{tx('A broker you invited gets verified: 15', 'आपके बुलाए ब्रोकर का सत्यापन: 15')}</li><li>{tx('Chapter meet attended: 10', 'चैप्टर मीट में हाज़िरी: 10')}</li></ul><p className="mt-1 text-slate-400">{tx('Max 40 points a day. No points for deals between the same company.', 'दिन में अधिकतम 40 पॉइंट्स। एक ही कंपनी के बीच की डील पर पॉइंट्स नहीं।')}</p></div>
      {lb && <div className="rounded-xl border border-slate-200 bg-white p-3.5"><div className="text-sm font-bold text-slate-900">{lb.scope === 'CHAPTER' ? tx('Chapter leaderboard', 'चैप्टर लीडरबोर्ड') : tx('City leaderboard', 'शहर लीडरबोर्ड')} · {lb.month}</div>
        {lb.rows.length === 0 ? <p className="mt-2 text-xs text-slate-500">{tx('No points yet this month — be the first.', 'इस महीने अभी किसी के पॉइंट्स नहीं — पहले बनिए।')}</p> : <ol className="mt-2 space-y-1">{lb.rows.map((r: any, i: number) => <li key={r.id} className="flex justify-between text-xs"><span><b>{i + 1}.</b> {r.name}{r.company ? ` · ${r.company}` : ''}</span><b>{r.points}</b></li>)}</ol>}</div>}
    </div>
  );
};
