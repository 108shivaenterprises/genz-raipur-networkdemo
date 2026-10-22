/**
 * v43 — one home, no repeats: the trust badge sits next to the greeting, a co-broking offer waiting is the first tile, the
 * "setup %" bar shows only after the 3 first steps are done, and the phone-alert card opens only from its step.
 *
 * v26 — the simple broker home: three first steps for a new broker, then only what needs him today (every tile opens its screen),
 * GENZ's own projects, this month's rank, his chapter's next meet, and the city report to share on WhatsApp.
 */
import React, { useEffect, useState } from 'react';
import { MessageCircle, UserPlus, Bell, CheckCircle2, ChevronRight, Building2, Trophy, CalendarDays, Share2, ShieldCheck, Inbox, Clock, Handshake, Loader2, Lock, Plus, HardHat, Store } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';
import type { TabType } from './NavigationTabs.js';
import { AlertsCard } from './AlertsCard.js';
import { pushState } from '../lib/push.js';
import { goto } from '../lib/goto.js';
import { GrowthNudge } from './GrowthNudge.js';
import { TrustScoreBadge } from './TrustScoreBadge.js';
import type { UserProfile } from '../types/index.js';

interface Props {
  name: string;
  onNavigate: (t: TabType) => void;
  onOpenAddRequirement: () => void;
  /** v43 */
  user?: UserProfile;
  offersWaiting?: number;
  onOpenAddProperty?: () => void;
  onOpenAddLead?: () => void;
  canGrow?: boolean;
}

export const BrokerHome: React.FC<Props> = ({ name, onNavigate, onOpenAddRequirement, user, offersWaiting = 0, onOpenAddProperty, onOpenAddLead, canGrow }) => {
  const tx = useTx();
  const [showAlerts, setShowAlerts] = useState(false);
  const [h, setH] = useState<any>(null);
  const [alertsOn, setAlertsOn] = useState<boolean | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [confirms, setConfirms] = useState<any[]>([]);
  const [busy, setBusy] = useState('');
  const load = () => {
    api.homeBroker().then(setH).catch(() => setH(null));
    api.reputationPending().then(r => setConfirms(r.items || [])).catch(() => setConfirms([]));
  };
  useEffect(() => {
    load();
    pushState().then(s => setAlertsOn(s === 'on'));
    api.launchFeed().then(r => setProjects((r.items || []).filter((x: any) => x.view === 'OPEN').slice(0, 3))).catch(() => setProjects([]));
  }, []);
  if (!h) return null;
  const c = h.counts;
  const steps = [
    { done: h.firstRun.listing, icon: MessageCircle, en: 'Put your first listing — paste it from WhatsApp', hi: 'पहली लिस्टिंग डालें — WhatsApp से पेस्ट करें', go: () => goto('properties', { drafts: '1' }, onNavigate), testId: 'step-listing' },
    { done: h.firstRun.client, icon: UserPlus, en: 'Add a client’s need — GENZ finds matches for you', hi: 'किसी क्लाइंट की ज़रूरत जोड़ें — GENZ मैच ढूँढेगा', go: onOpenAddRequirement, testId: 'step-client' },
    { done: !!alertsOn, icon: Bell, en: 'Turn on phone alerts', hi: 'फ़ोन अलर्ट चालू करें', go: () => { setShowAlerts(true); window.setTimeout(() => document.getElementById('home-alerts')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); }, testId: 'step-alerts' },
  ];
  const left = steps.filter(s => !s.done).length;
  const tiles = [
    { n: offersWaiting, icon: Handshake, en: 'A broker sent you a co-broking offer — answer it', hi: 'किसी ब्रोकर ने को-ब्रोकिंग ऑफ़र भेजा है — जवाब दें', go: () => goto('deals', { view: 'proposals' }, onNavigate), tone: 'amber', testId: 'tile-offers' },
    { n: c.partnerCodes || 0, icon: Lock, en: 'A shop partner is waiting for his code — read it out', hi: 'दुकान पार्टनर कोड माँग रहे हैं — उन्हें बताएँ', go: () => goto('partners', { }, onNavigate), tone: 'amber', testId: 'tile-sp-codes' },
    { n: c.partnerNew || 0, icon: Store, en: 'New leads from your shop QR — call them', hi: 'दुकान QR से नई लीड — कॉल करें', go: () => onNavigate('partners'), tone: 'emerald', testId: 'tile-sp-new' },
    { n: c.partnerDue || 0, icon: Store, en: 'Shop partner’s share to pay', hi: 'दुकान पार्टनर का हिस्सा देना है', go: () => onNavigate('partners'), tone: 'amber', testId: 'tile-sp-due' },
    { n: c.roomCodes || 0, icon: Lock, en: 'A client is asking for his room code — read it out', hi: 'क्लाइंट रूम का कोड माँग रहा है — उसे बताएँ', go: () => onNavigate('clientroom'), tone: 'amber', testId: 'tile-room-codes' },
    { n: c.roomMsgs || 0, icon: MessageCircle, en: 'New messages from your clients', hi: 'आपके क्लाइंट के नए संदेश', go: () => onNavigate('clientroom'), tone: 'indigo', testId: 'tile-room-msgs' },
    { n: c.roomVisits || 0, icon: Clock, en: 'Clients asking to visit a property', hi: 'क्लाइंट प्रॉपर्टी देखने आना चाहते हैं', go: () => onNavigate('clientroom'), tone: 'amber', testId: 'tile-room-visits' },
    { n: c.shareAsks || 0, icon: Handshake, en: 'A connector proposed a % share — answer', hi: 'कनेक्टर ने % हिस्सा रखा है — जवाब दें', go: () => onNavigate('connector'), tone: 'amber', testId: 'tile-share-asks' },
    { n: c.shareToPay || 0, icon: Handshake, en: 'Connector share to work out / pay', hi: 'कनेक्टर का हिस्सा निकालना / चुकाना है', go: () => onNavigate('connector'), tone: 'emerald', testId: 'tile-share-pay' },
    { n: c.bondAlerts || 0, icon: ShieldCheck, en: 'Your buyer’s property was marked sold — check', hi: 'आपके खरीदार की प्रॉपर्टी बिकी दर्ज हुई — देखें', go: () => goto('desk', { sub: 'bonds' }, onNavigate), tone: 'amber', testId: 'tile-bond-alerts' },
    { n: c.bondAsks || 0, icon: Handshake, en: 'Brokers asking to co-broke your buyer', hi: 'आपके खरीदार पर को-ब्रोकिंग माँग रहे ब्रोकर', go: () => goto('desk', { sub: 'bonds' }, onNavigate), tone: 'indigo', testId: 'tile-bond-asks' },
    { n: c.readyToPublish, icon: CheckCircle2, en: 'Owner said yes — publish', hi: 'मालिक ने हाँ कहा — लाइव करें', go: () => goto('properties', { drafts: '1' }, onNavigate), tone: 'emerald' },
    { n: c.inbox, icon: Inbox, en: 'Brokers looking for what you have', hi: 'ब्रोकरों को आपकी प्रॉपर्टी चाहिए', go: () => onNavigate('requirements'), tone: 'indigo' },
    { n: c.answers, icon: Handshake, en: 'Answers to your buyer needs', hi: 'आपकी खरीदार ज़रूरत के जवाब', go: () => onNavigate('requirements'), tone: 'indigo' },
    { n: c.followUps, icon: Clock, en: 'Client follow-ups due', hi: 'क्लाइंट फ़ॉलो-अप बाकी', go: () => onNavigate('daily'), tone: 'amber' },
    { n: c.waitingOwner, icon: MessageCircle, en: 'Waiting for owner’s yes', hi: 'मालिक की हाँ का इंतज़ार', go: () => goto('properties', { drafts: '1' }, onNavigate), tone: 'slate' },
    { n: c.protectedListings, icon: ShieldCheck, en: 'Listings with bypass protection', hi: 'बायपास सुरक्षा वाली लिस्टिंग', go: () => onNavigate('properties'), tone: 'slate' },
    { n: c.buyerBonds || 0, icon: ShieldCheck, en: 'Buyers protected to you', hi: 'आपसे सुरक्षित खरीदार', go: () => goto('desk', { sub: 'bonds' }, onNavigate), tone: 'slate', testId: 'tile-bond' },
  ].filter(t => t.n > 0);
  const toneCls: Record<string, string> = { emerald: 'border-emerald-300 bg-emerald-50 text-emerald-900', indigo: 'border-indigo-200 bg-indigo-50 text-indigo-900', amber: 'border-amber-300 bg-amber-50 text-amber-900', slate: 'border-slate-200 bg-white text-slate-800' };
  const reportUrl = `${window.location.origin}/report/${encodeURIComponent(String(h.city || 'Raipur'))}${h.refCode ? `?ref=${encodeURIComponent(h.refCode)}` : ''}`;
  const confirm = async (x: any) => { setBusy(x.refId + x.toId); try { await api.reputationConfirm(x.refId, x.toId); load(); } finally { setBusy(''); } };

  return (
    <section className="mb-6 space-y-3" data-testid="broker-home">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">{tx(`Namaste, ${name.split(' ')[0]} 👋`, `नमस्ते, ${name.split(' ')[0]} 👋`)}</h2>
        {user && <span className="md:hidden"><TrustScoreBadge user={user} variant="pill" /></span>}
      </div>

      {left > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="first-steps">
          <p className="text-sm font-bold text-slate-900">{tx(`Get started — ${3 - left} of 3 done`, `शुरुआत — 3 में से ${3 - left} पूरे`)}</p>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${((3 - left) / 3) * 100}%` }} /></div>
          <ul className="mt-3 space-y-2">
            {steps.map((s, i) => (
              <li key={i}>
                <button onClick={s.go} disabled={s.done} data-testid={s.testId} className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm ${s.done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-900 hover:border-slate-900'}`}>
                  {s.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <s.icon className="h-5 w-5 shrink-0 text-slate-500" />}
                  <span className={`flex-1 ${s.done ? 'line-through' : 'font-semibold'}`}>{tx(s.en, s.hi)}</span>
                  {!s.done && <ChevronRight className="h-4 w-4 text-slate-400" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {left === 0 && canGrow && <GrowthNudge onOpen={() => onNavigate('grow')} className="" />}

      {showAlerts && <div id="home-alerts"><AlertsCard onState={s => setAlertsOn(s === 'on')} /></div>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button onClick={() => goto('properties', { drafts: '1' }, onNavigate)} className="flex min-h-20 flex-col items-start justify-between rounded-2xl bg-emerald-600 p-3 text-left text-white" data-testid="home-wa"><MessageCircle className="h-5 w-5" /><span className="text-sm font-bold">{tx('From WhatsApp — listing or buyer need', 'WhatsApp से — लिस्टिंग या खरीदार की ज़रूरत')}</span></button>
        <button onClick={onOpenAddRequirement} className="flex min-h-20 flex-col items-start justify-between rounded-2xl bg-slate-900 p-3 text-left text-white"><UserPlus className="h-5 w-5 text-amber-400" /><span className="text-sm font-bold">{tx('Client’s need', 'क्लाइंट की ज़रूरत')}</span></button>
        <button onClick={() => onNavigate('daily')} className="flex min-h-20 flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-3 text-left text-slate-900"><Clock className="h-5 w-5 text-slate-500" /><span className="text-sm font-bold">{tx('Today & clients', 'आज और क्लाइंट')}</span></button>
        <button onClick={() => onNavigate('matches')} className="flex min-h-20 flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-3 text-left text-slate-900"><Handshake className="h-5 w-5 text-slate-500" /><span className="text-sm font-bold">{tx('Matches', 'मैच')}</span></button>
      </div>
      {(onOpenAddProperty || onOpenAddLead) && (
        <div className="flex flex-wrap gap-2" data-testid="home-more-adds">
          {onOpenAddProperty && <button onClick={onOpenAddProperty} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-900"><Plus className="h-3.5 w-3.5" />{tx('Property (full form)', 'प्रॉपर्टी (पूरा फ़ॉर्म)')}</button>}
          {onOpenAddLead && <button onClick={onOpenAddLead} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-900"><HardHat className="h-3.5 w-3.5 text-orange-500" />{tx('Construction lead', 'कंस्ट्रक्शन लीड')}</button>}
        </div>
      )}

      {tiles.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2" data-testid="home-tiles">
          {tiles.map((t, i) => (
            <button key={i} onClick={t.go} data-testid={(t as any).testId} className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-left ${toneCls[t.tone]}`}>
              <t.icon className="h-5 w-5 shrink-0" /><span className="flex-1 text-sm font-semibold">{tx(t.en, t.hi)}</span><span className="text-lg font-bold">{t.n}</span><ChevronRight className="h-4 w-4 opacity-50" />
            </button>
          ))}
        </div>
      )}

      {confirms.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-white p-3" data-testid="peer-confirms">
          <p className="text-sm font-bold text-slate-900">{tx('Did these deals go fine?', 'क्या ये सौदे ठीक से हुए?')}</p>
          <p className="text-xs text-slate-500">{tx('Your “yes” shows on the other broker’s GENZ card (counts only).', 'आपकी “हाँ” दूसरे ब्रोकर के GENZ कार्ड पर दिखेगी (सिर्फ़ गिनती)।')}</p>
          <ul className="mt-2 space-y-1">{confirms.slice(0, 5).map((x: any) => (
            <li key={x.refId + x.toId} className="flex items-center gap-2 text-xs"><span className="flex-1">{x.toName} · {x.title}</span>
              <button onClick={() => confirm(x)} disabled={!!busy} className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white" data-testid="peer-confirm">{busy === x.refId + x.toId ? <Loader2 className="h-3 w-3 animate-spin" /> : tx('Deal went fine ✔', 'सौदा ठीक हुआ ✔')}</button></li>
          ))}</ul>
        </div>
      )}

      {projects.length > 0 && (
        <button onClick={() => onNavigate('pcontrol')} className="block w-full rounded-xl border border-amber-300 bg-amber-50 p-3 text-left" data-testid="home-projects">
          <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900"><Building2 className="h-4 w-4" />{tx('GENZ projects open for you', 'आपके लिए खुले GENZ प्रोजेक्ट')}</p>
          <ul className="mt-1 space-y-0.5 text-xs text-amber-900">{projects.map(p => <li key={p.id}>• {p.projectName} — {p.locality}{p.priceStartingFrom ? ` · ${tx('from', 'से')} ${formatINR(p.priceStartingFrom)}` : ''}{p.defaultCommissionPct ? ` · ${p.defaultCommissionPct}%` : ''}</li>)}</ul>
        </button>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <button onClick={() => onNavigate('community')} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left" data-testid="home-rank">
          <Trophy className="h-5 w-5 text-amber-500" />
          <span className="text-xs text-slate-700">{h.rank.position ? tx(`This month you are #${h.rank.position} of ${h.rank.of} (${h.rank.points} points)`, `इस महीने आप ${h.rank.of} में #${h.rank.position} हैं (${h.rank.points} अंक)`) : tx('Earn points: listings, consents, answers', 'अंक कमाएँ: लिस्टिंग, सहमति, जवाब')}
            {h.reputation.closed > 0 && <><br />{tx(`${h.reputation.closed} deals closed · confirmed by ${h.reputation.confirmers}`, `${h.reputation.closed} सौदे पूरे · ${h.reputation.confirmers} ने पुष्टि की`)}</>}</span>
        </button>
        <button onClick={() => onNavigate('community')} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left">
          <CalendarDays className="h-5 w-5 text-indigo-500" />
          <span className="text-xs text-slate-700">{h.chapter ? (h.chapter.nextMeet ? tx(`${h.chapter.name}: ${h.chapter.nextMeet.title}, ${new Date(h.chapter.nextMeet.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`, `${h.chapter.name}: ${h.chapter.nextMeet.title}, ${new Date(h.chapter.nextMeet.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`) : tx(`${h.chapter.name} · Captain ${h.chapter.captain || '—'}`, `${h.chapter.name} · कैप्टन ${h.chapter.captain || '—'}`)) : tx('Join your area’s chapter and its monthly meet', 'अपने इलाक़े के चैप्टर और मासिक मीट से जुड़ें')}</span>
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(`${h.city || 'Raipur'} property report — locality rates & buyer demand (GENZ): ${reportUrl}`)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left" data-testid="home-report">
          <Share2 className="h-5 w-5 text-emerald-600" /><span className="text-xs text-slate-700">{tx(`Share the ${h.city || 'city'} property report on WhatsApp`, `${h.city || 'शहर'} की प्रॉपर्टी रिपोर्ट WhatsApp पर भेजें`)}</span>
        </a>
      </div>
    </section>
  );
};
