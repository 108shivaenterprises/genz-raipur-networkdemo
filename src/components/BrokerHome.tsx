/**
 * v80 — the counters (offers waiting, bills, codes, rent …) are in the notification bell ONLY; the Home does not repeat them as tiles.
 *
 * v43 — one home, no repeats: the trust badge sits next to the greeting, a co-broking offer waiting is the first tile, the
 * "setup %" bar shows only after the 3 first steps are done, and the phone-alert card opens only from its step.
 *
 * v26 — the simple broker home: three first steps for a new broker, then only what needs him today (every tile opens its screen),
 * GENZ's own projects, this month's rank, his chapter's next meet, and the city report to share on WhatsApp.
 */
import React, { useEffect, useState } from 'react';
import { Sparkles, MessageCircle, UserPlus, Bell, CheckCircle2, ChevronRight, Building2, Trophy, CalendarDays, Share2, Clock, Loader2, Plus, HardHat, Globe } from 'lucide-react';
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

/** v90 — the shop-QR engine on the Home: this week's scans / leads / owners, or one big "add your first shop" when there is none yet. */
const ShopQrTile: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const tx = useTx();
  const [d, setD] = useState<any>(null);
  useEffect(() => { api.spList().then(setD).catch(() => setD(false)); }, []);
  if (d === false) return null;
  if (!d) return null;
  const partners: any[] = d.partners || []; const leads: any[] = d.leads || [];
  const week = Date.now() - 7 * 86400_000;
  const recent = leads.filter(l => Date.parse(l.createdAt || '') >= week);
  const owners = recent.filter(l => l.kind === 'SELL' || l.kind === 'RENT_OUT').length;
  const fresh = leads.filter(l => l.status === 'NEW').length;
  if (partners.length === 0) {
    return (
      <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-50 p-4 text-left" data-testid="home-shopqr-first">
        <span className="text-2xl">📍</span>
        <span className="min-w-0 flex-1"><b className="block text-sm text-emerald-900">{tx('Add your first shop (2 minutes)', 'पहली दुकान जोड़ें (2 मिनट)')}</b><span className="text-xs text-emerald-800">{tx('A QR at a shop brings buyers and owners to you — no ads.', 'दुकान पर QR लगाइए — बिना विज्ञापन के ग्राहक और मालिक आपके पास आएँगे।')}</span></span>
        <ChevronRight className="h-5 w-5 text-emerald-700" />
      </button>
    );
  }
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-2xl border border-emerald-200 bg-white p-3 text-left" data-testid="home-shopqr">
      <span className="text-2xl">📍</span>
      <span className="min-w-0 flex-1">
        <b className="block text-sm text-slate-900">{tx('Shop QR', 'दुकान QR')}{fresh > 0 && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">{fresh} {tx('new', 'नई')}</span>}</b>
        <span className="text-xs text-slate-600">{tx(`This week: ${recent.length} lead${recent.length === 1 ? '' : 's'} · ${owners} owner${owners === 1 ? '' : 's'} · ${partners.length} shop${partners.length === 1 ? '' : 's'}`, `इस हफ़्ते: ${recent.length} लीड · ${owners} मालिक · ${partners.length} दुकान`)}</span>
      </span>
      <span className="shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white">{tx('+ Shop', '+ दुकान')}</span>
    </button>
  );
};

export const BrokerHome: React.FC<Props> = ({ name, onNavigate, onOpenAddRequirement, user, onOpenAddProperty, onOpenAddLead, canGrow }) => {
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
  const steps = [
    { done: h.firstRun.listing, icon: MessageCircle, en: 'Put your first listing — paste it from WhatsApp', hi: 'पहली लिस्टिंग डालें — WhatsApp से पेस्ट करें', go: () => goto('properties', { drafts: '1' }, onNavigate), testId: 'step-listing' },
    { done: h.firstRun.client, icon: UserPlus, en: 'Add a client’s need — GENZ finds matches for you', hi: 'किसी क्लाइंट की ज़रूरत जोड़ें — GENZ मैच ढूँढेगा', go: onOpenAddRequirement, testId: 'step-client' },
    { done: !!alertsOn, icon: Bell, en: 'Turn on phone alerts', hi: 'फ़ोन अलर्ट चालू करें', go: () => { setShowAlerts(true); window.setTimeout(() => document.getElementById('home-alerts')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); }, testId: 'step-alerts' },
  ];
  const left = steps.filter(s => !s.done).length;
  // v80 — the to-do counters live ONLY in the notification bell now (same list: src/shared/homeTodoRules.ts → server/homebell.ts). The Home no longer repeats them below.
  const reportUrl = `${window.location.origin}/report/${encodeURIComponent(String(h.city || 'Raipur'))}${h.refCode ? `?ref=${encodeURIComponent(h.refCode)}` : ''}`;
  // v79 — with his public page ON, the WhatsApp link is HIS page (his homes + an enquiry form; the city report is a link inside it); with it OFF the city report, which now tells who shared it
  const pageUrl = h.page?.on && h.refCode ? `${window.location.origin}/c/${encodeURIComponent(h.refCode)}` : '';
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
          {/* v54 — only what is still to do; a finished step disappears instead of staying crossed out */}
          <ul className="mt-3 space-y-2">
            {steps.filter(s => !s.done).map((s, i) => (
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

      <ShopQrTile onOpen={() => onNavigate('partners' as TabType)} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button onClick={() => goto('properties', { drafts: '1' }, onNavigate)} className="flex min-h-20 flex-col items-start justify-between rounded-2xl bg-emerald-600 p-3 text-left text-white" data-testid="home-wa"><MessageCircle className="h-5 w-5" /><span className="text-sm font-bold">{tx('From WhatsApp — listing or buyer need', 'WhatsApp से — लिस्टिंग या खरीदार की ज़रूरत')}</span></button>
        <button onClick={onOpenAddRequirement} className="flex min-h-20 flex-col items-start justify-between rounded-2xl bg-slate-900 p-3 text-left text-white"><UserPlus className="h-5 w-5 text-amber-400" /><span className="text-sm font-bold">{tx('Client’s need', 'क्लाइंट की ज़रूरत')}</span></button>
        <button onClick={() => onNavigate('daily')} className="flex min-h-20 flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-3 text-left text-slate-900"><Clock className="h-5 w-5 text-slate-500" /><span className="text-sm font-bold">{tx('Today & clients', 'आज और क्लाइंट')}</span></button>
        <button onClick={() => onNavigate('matches')} className="flex min-h-20 flex-col items-start justify-between rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left text-slate-900" data-testid="home-magic"><Sparkles className="h-5 w-5 text-amber-500" /><span className="text-sm font-bold">{tx('Magic Match', 'मैजिक मैच')}</span></button>
      </div>
      {(onOpenAddProperty || onOpenAddLead) && (
        <div className="flex flex-wrap gap-2" data-testid="home-more-adds">
          {onOpenAddProperty && <button onClick={onOpenAddProperty} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-slate-900"><Plus className="h-3.5 w-3.5" />{tx('Add property', 'प्रॉपर्टी जोड़ें')}</button>}
          {onOpenAddLead && <button onClick={onOpenAddLead} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-slate-900"><HardHat className="h-3.5 w-3.5 text-orange-500" />{tx('Construction lead', 'कंस्ट्रक्शन लीड')}</button>}
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

      <div className={`grid gap-2 ${h.page ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
        {h.page && (
          <button onClick={() => onNavigate('mypage')} className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left" data-testid="home-mypage">
            <Globe className="h-5 w-5 shrink-0 text-emerald-600" />
            <span className="text-xs text-emerald-900">{h.page.on
              ? tx(`Your public page: ${h.page.homes} homes · ${h.page.views} views — share it`, `आपका पब्लिक पेज: ${h.page.homes} घर · ${h.page.views} बार देखा गया — शेयर करें`)
              : tx('Make your free public page — your homes and an enquiry form, no login for customers', 'अपना मुफ़्त पब्लिक पेज बनाएँ — आपके घर और पूछताछ फ़ॉर्म, ग्राहक को लॉगिन नहीं चाहिए')}</span>
          </button>
        )}
        <button onClick={() => onNavigate('community')} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left" data-testid="home-rank">
          <Trophy className="h-5 w-5 text-amber-500" />
          <span className="text-xs text-slate-700">{h.rank.position ? tx(`This month you are #${h.rank.position} of ${h.rank.of} (${h.rank.points} points)`, `इस महीने आप ${h.rank.of} में #${h.rank.position} हैं (${h.rank.points} अंक)`) : tx('Earn points: listings, consents, answers', 'अंक कमाएँ: लिस्टिंग, सहमति, जवाब')}
            {h.reputation.closed > 0 && <><br />{tx(`${h.reputation.closed} deals closed · confirmed by ${h.reputation.confirmers}`, `${h.reputation.closed} सौदे पूरे · ${h.reputation.confirmers} ने पुष्टि की`)}</>}</span>
        </button>
        <button onClick={() => onNavigate('community')} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left">
          <CalendarDays className="h-5 w-5 text-indigo-500" />
          <span className="text-xs text-slate-700">{h.chapter ? (h.chapter.nextMeet ? tx(`${h.chapter.name}: ${h.chapter.nextMeet.title}, ${new Date(h.chapter.nextMeet.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`, `${h.chapter.name}: ${h.chapter.nextMeet.title}, ${new Date(h.chapter.nextMeet.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`) : tx(`${h.chapter.name} · Captain ${h.chapter.captain || '—'}`, `${h.chapter.name} · कैप्टन ${h.chapter.captain || '—'}`)) : tx('Join your area’s chapter and its monthly meet', 'अपने इलाक़े के चैप्टर और मासिक मीट से जुड़ें')}</span>
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(pageUrl ? `${h.city || 'Raipur'} ke verified ghar dekhein aur seedhe poochhein — ${name} (GENZ verified broker): ${pageUrl}` : `${h.city || 'Raipur'} property report — locality rates & buyer demand (GENZ): ${reportUrl}`)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left" data-testid="home-report" data-target={pageUrl ? 'page' : 'report'}>
          <Share2 className="h-5 w-5 text-emerald-600" /><span className="text-xs text-slate-700">{pageUrl ? tx('Share your public page on WhatsApp — customers see your homes and can ask', 'अपना पब्लिक पेज WhatsApp पर भेजें — ग्राहक आपके घर देखेंगे और पूछ सकेंगे') : tx(`Share the ${h.city || 'city'} property report on WhatsApp`, `${h.city || 'शहर'} की प्रॉपर्टी रिपोर्ट WhatsApp पर भेजें`)}</span>
        </a>
      </div>
    </section>
  );
};
