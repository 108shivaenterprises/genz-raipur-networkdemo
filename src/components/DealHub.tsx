/**
 * v37 — Deal Hub screens (Deals tab).
 *   DealPipeline   KPI tiles (each one a filter), search, role chips, Board (stage columns) ⇄ List view
 *   StageStepper   Lead → Settled as steps; a deal broker can move the deal by tapping a step
 *   NextSteps      what this deal needs from ME now — each line opens the deal-room section that answers it
 *   MandatesBoard  every owner ⇄ broker brokerage mandate in one place: status, protection days left, terms, "open"
 * Data: GET /api/deal-hub (same visibility / money rules as /api/deals) and GET /api/owner-mandates.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, LayoutGrid, List as ListIcon, AlertTriangle, Clock, Wallet, Briefcase, Scale, CheckCircle2, ChevronRight, CalendarCheck,
  FileSignature, ListTodo, MessageSquare, ShieldCheck, Loader2, IndianRupee, Hourglass, X, UserRound, XCircle,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { formatINR } from '../lib/utils.js';
import { MandateModal } from './MandateModal.js';
import type { OwnerMandate, Property, UserProfile } from '../types/index.js';

export const STAGES = ['Lead', 'Introduction', 'Site Visit Done', 'Negotiation', 'Agreement', 'Handover', 'Settled'];
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } } };
const ago = (iso: string | undefined, tx: (a: string, b: string) => string) => {
  if (!iso) return '';
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400_000);
  if (d <= 0) return tx('today', 'आज');
  if (d === 1) return tx('yesterday', 'कल');
  return tx(`${d} days ago`, `${d} दिन पहले`);
};
const short = (n?: number) => {
  if (!n) return '₹0';
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(n >= 1e8 ? 0 : 2).replace(/\.?0+$/, '')} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(n >= 1e6 ? 1 : 2).replace(/\.?0+$/, '')} L`;
  return formatINR(n);
};

// ───────────── next steps ─────────────
const NEXT_ICON: Record<string, React.ElementType> = {
  CLOSE_TO_ANSWER: AlertTriangle, OFFLINE_VISIT_TO_CONFIRM: CalendarCheck,
  DISPUTE_OPEN: Scale, AGREEMENT_TO_SIGN: FileSignature, TASKS_TO_ACCEPT: ListTodo, VISITS_TO_VERIFY: CalendarCheck, TASKS_OVERDUE: AlertTriangle,
  TASKS_TO_VERIFY: CheckCircle2, PAYMENTS_TO_CONFIRM: IndianRupee, NO_AGREEMENT: FileSignature, TASKS_TO_DO: ListTodo, STALLED: Hourglass,
};
const NEXT_TONE: Record<string, string> = {
  CLOSE_TO_ANSWER: 'border-amber-300 bg-amber-50 text-amber-900', OFFLINE_VISIT_TO_CONFIRM: 'border-sky-300 bg-sky-50 text-sky-900',
  DISPUTE_OPEN: 'border-red-300 bg-red-50 text-red-800', AGREEMENT_TO_SIGN: 'border-amber-300 bg-amber-50 text-amber-900', TASKS_TO_ACCEPT: 'border-amber-300 bg-amber-50 text-amber-900',
  VISITS_TO_VERIFY: 'border-sky-300 bg-sky-50 text-sky-900', TASKS_OVERDUE: 'border-red-300 bg-red-50 text-red-800', TASKS_TO_VERIFY: 'border-sky-300 bg-sky-50 text-sky-900',
  PAYMENTS_TO_CONFIRM: 'border-emerald-300 bg-emerald-50 text-emerald-900', NO_AGREEMENT: 'border-slate-300 bg-slate-50 text-slate-800', TASKS_TO_DO: 'border-slate-300 bg-slate-50 text-slate-800',
  STALLED: 'border-slate-300 bg-slate-50 text-slate-700',
};
export function nextText(n: { kind: string; n: number }, idleDays: number, tx: (a: string, b: string) => string) {
  const k = n.n;
  switch (n.kind) {
    case 'CLOSE_TO_ANSWER': return tx('The other broker wants to close this deal — answer', 'दूसरा ब्रोकर यह डील बंद करना चाहता है — जवाब दें');
    case 'OFFLINE_VISIT_TO_CONFIRM': return tx('Confirm a visit that happened outside the app', 'ऐप के बाहर हुई विज़िट की पुष्टि करें');
    case 'DISPUTE_OPEN': return tx('A dispute is open — see the holds', 'विवाद खुला है — होल्ड देखें');
    case 'AGREEMENT_TO_SIGN': return tx('Approve the commission agreement', 'कमीशन समझौता मंज़ूर करें');
    case 'TASKS_TO_ACCEPT': return tx(`${k} dut${k > 1 ? 'ies wait' : 'y waits'} for your yes`, `${k} ज़िम्मेदारी आपकी हाँ का इंतज़ार कर रही`);
    case 'VISITS_TO_VERIFY': return tx(`${k} site visit${k > 1 ? 's' : ''} to verify`, `${k} साइट विज़िट वेरिफ़ाई करनी है`);
    case 'TASKS_OVERDUE': return tx(`${k} dut${k > 1 ? 'ies' : 'y'} past the due date`, `${k} ज़िम्मेदारी की तारीख़ निकल गई`);
    case 'TASKS_TO_VERIFY': return tx(`${k} finished dut${k > 1 ? 'ies' : 'y'} to check`, `${k} पूरी हुई ज़िम्मेदारी जाँचनी है`);
    case 'PAYMENTS_TO_CONFIRM': return tx(`${k} commission payment${k > 1 ? 's' : ''} to confirm`, `${k} कमीशन भुगतान पक्का करना है`);
    case 'NO_AGREEMENT': return tx('No commission agreement yet — propose one', 'अभी कमीशन समझौता नहीं — प्रस्ताव भेजें');
    case 'TASKS_TO_DO': return tx(`${k} dut${k > 1 ? 'ies' : 'y'} to finish`, `${k} ज़िम्मेदारी पूरी करनी है`);
    case 'STALLED': return tx(`Nothing happened for ${idleDays} days — message the other side`, `${idleDays} दिन से कुछ नहीं हुआ — दूसरी तरफ़ को मैसेज करें`);
  }
  return n.kind;
}

export const NextSteps: React.FC<{ item: any; onGo: (tab: string, kind?: string) => void }> = ({ item, onGo }) => {
  const tx = useTx();
  if (!item) return null;
  const list: any[] = item.next || [];
  if (!list.length) return (
    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800" data-testid="next-steps-clear">
      <CheckCircle2 className="h-4 w-4" />{tx('Nothing waiting on you in this deal right now.', 'इस डील में अभी आपके लिए कुछ बाकी नहीं।')}
    </div>
  );
  return (
    <div className="space-y-1.5" data-testid="next-steps">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{tx('Next steps for you', 'आपके अगले कदम')}</div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {list.map((n: any) => {
          const Icon = NEXT_ICON[n.kind] || ChevronRight;
          return (
            <button key={n.kind} type="button" onClick={() => onGo(n.tab, n.kind)} className={`flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 text-left text-xs font-semibold ${NEXT_TONE[n.kind] || ''}`} data-testid={`next-${n.kind}`}>
              <span className="flex items-center gap-2"><Icon className="h-4 w-4 shrink-0" />{nextText(n, item.idleDays, tx)}</span>
              <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ───────────── stage stepper ─────────────
export const StageStepper: React.FC<{ stage: string; canEdit: boolean; onChange: (s: string) => void }> = ({ stage, canEdit, onChange }) => {
  const tx = useTx(); const label = useLabel();
  const cur = STAGES.indexOf(stage);
  return (
    <div className="space-y-1" data-testid="stage-stepper">
      {stage === 'Disputed' && <p className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800">{tx('This deal is marked Disputed.', 'यह डील विवाद में है।')}</p>}
      <ol className="flex items-center gap-1 overflow-x-auto pb-1">
        {STAGES.map((s, i) => {
          const done = cur >= 0 && i < cur; const now = i === cur;
          const cls = now ? 'border-slate-900 bg-slate-900 text-white' : done ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500';
          const body = (
            <>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${now ? 'bg-amber-400 text-slate-900' : done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{done ? '✓' : i + 1}</span>
              <span className="whitespace-nowrap">{label('dealStage', s)}</span>
            </>
          );
          return (
            <li key={s} className="flex shrink-0 items-center gap-1">
              {canEdit && !now
                ? <button type="button" title={tx(`Move the deal to “${s}”`, `डील को “${label('dealStage', s)}” पर ले जाएँ`)} onClick={() => { if (window.confirm(tx(`Move this deal to “${s}”?`, `इस डील को “${label('dealStage', s)}” पर ले जाएँ?`))) onChange(s); }}
                    className={`flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold hover:border-slate-500 ${cls}`} data-testid={`stage-step-${i}`}>{body}</button>
                : <span className={`flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold ${cls}`} aria-current={now ? 'step' : undefined} data-testid={`stage-step-${i}`}>{body}</span>}
              {i < STAGES.length - 1 && <span className={`h-0.5 w-3 shrink-0 ${i < cur ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

// ───────────── deal card + pipeline ─────────────
const roleChip = (r: string, tx: (a: string, b: string) => string) => ({
  INTRODUCING: [tx('Buyer side', 'खरीदार की तरफ़'), 'bg-sky-100 text-sky-800'], CLOSING: [tx('Listing side', 'लिस्टिंग की तरफ़'), 'bg-violet-100 text-violet-800'],
  OWNER: [tx('My property', 'मेरी प्रॉपर्टी'), 'bg-emerald-100 text-emerald-800'], TEAM: [tx('Team', 'टीम'), 'bg-slate-100 text-slate-700'],
  LEGAL: [tx('Legal', 'क़ानूनी'), 'bg-slate-100 text-slate-700'], ADMIN: [tx('GENZ view', 'GENZ दृश्य'), 'bg-slate-100 text-slate-700'],
} as Record<string, [string, string]>)[r] || ['', ''];

const Progress: React.FC<{ i: number; dark?: boolean }> = ({ i, dark }) => (
  <div className="flex gap-0.5" aria-hidden="true">{STAGES.map((_, k) => <span key={k} className={`h-1 flex-1 rounded-full ${k <= i ? (k === STAGES.length - 1 ? 'bg-emerald-500' : 'bg-amber-400') : dark ? 'bg-white/20' : 'bg-slate-200'}`} />)}</div>
);

export const DealCard: React.FC<{ d: any; onOpen: (id: string, tab?: string, kind?: string) => void; compact?: boolean; selected?: boolean }> = ({ d, onOpen, compact, selected }) => {
  const tx = useTx(); const label = useLabel();
  const [rl, rc] = roleChip(d.myRole, tx);
  const first = (d.next || [])[0];
  return (
    <button type="button" onClick={() => onOpen(d.id, first && first.kind !== 'STALLED' ? first.tab : undefined, first?.kind)}
      className={`w-full rounded-xl border p-3 text-left transition-all ${selected ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-900 hover:border-slate-400 hover:shadow-sm'}`} data-testid={`deal-card-${d.id}`}>
      <div className="flex items-start justify-between gap-2">
        <span className={`font-mono text-[10px] font-bold ${selected ? 'text-slate-300' : 'text-slate-500'}`}>{d.id}</span>
        {rl && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${selected ? 'bg-white/15 text-white' : rc}`}>{rl}</span>}
      </div>
      <div className="mt-1 line-clamp-2 text-xs font-bold leading-snug">{d.propertyTitle}</div>
      <div className={`mt-0.5 truncate text-[11px] ${selected ? 'text-slate-300' : 'text-slate-500'}`}>{[d.locality, d.city].filter(Boolean).join(', ')}{compact ? ` · ${label('dealStage', d.stage)}` : ''}</div>
      <div className="mt-2"><Progress i={d.stageIndex} dark={selected} /></div>
      {(d.money || d.counterpartName) && (
        <div className={`mt-2 flex items-center justify-between gap-2 text-[11px] ${selected ? 'text-slate-200' : 'text-slate-600'}`}>
          <span className="flex min-w-0 items-center gap-1 truncate">{d.counterpartName && <><UserRound className="h-3 w-3 shrink-0" />{d.counterpartName}</>}</span>
          {d.money?.myShare ? <span className={`shrink-0 font-bold ${selected ? 'text-amber-300' : 'text-emerald-700'}`}>{short(d.money.myShare)}</span> : null}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {d.closed && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">{tx('Closed — did not happen', 'बंद — डील नहीं हुई')}</span>}
        {!d.closed && d.closing && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">{tx('Close asked', 'बंद करने को कहा')}</span>}
        {d.openDispute && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800">{tx('Dispute', 'विवाद')}</span>}
        {first && first.kind !== 'STALLED' && <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${selected ? 'bg-amber-400 text-slate-900' : 'bg-amber-100 text-amber-900'}`}>{nextText(first, d.idleDays, tx).slice(0, 48)}</span>}
        {d.stalled && <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${selected ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'}`}><Hourglass className="h-3 w-3" />{tx(`${d.idleDays}d idle`, `${d.idleDays} दिन रुका`)}</span>}
        {d.visits?.upcoming > 0 && <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${selected ? 'bg-white/15 text-white' : 'bg-sky-100 text-sky-800'}`}><CalendarCheck className="h-3 w-3" />{d.visits.upcoming}</span>}
      </div>
    </button>
  );
};

type Filter = 'live' | 'needs' | 'stalled' | 'disputes' | 'settled' | 'closed' | 'all';
export const DealPipeline: React.FC<{ hub: any; onOpen: (id: string, tab?: string, kind?: string) => void; showRoles: boolean }> = ({ hub, onOpen, showRoles }) => {
  const tx = useTx(); const label = useLabel();
  // a phone starts in the list (one column reads better); the choice is remembered once the broker picks one
  const [view, setViewRaw] = useState<'board' | 'list'>(() => { const v = store.get('genz-deal-view'); return v === 'list' || v === 'board' ? v : (typeof window !== 'undefined' && window.innerWidth < 640 ? 'list' : 'board'); });
  const setView = (v: 'board' | 'list') => { setViewRaw(v); store.set('genz-deal-view', v); };
  const [filter, setFilter] = useState<Filter>('live');
  const [role, setRole] = useState<'ALL' | 'INTRODUCING' | 'CLOSING'>('ALL');
  const [q, setQ] = useState('');
  const items: any[] = hub?.deals || [];
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter(d => {
      if (filter === 'live' && (d.stage === 'Settled' || d.closed)) return false;
      if (filter === 'settled' && d.stage !== 'Settled') return false;
      if (filter === 'closed' && !d.closed) return false;
      if (filter !== 'closed' && filter !== 'all' && d.closed) return false;
      if (filter === 'needs' && !d.needsMe) return false;
      if (filter === 'stalled' && !d.stalled) return false;
      if (filter === 'disputes' && !d.openDispute) return false;
      if (role !== 'ALL' && d.myRole !== role) return false;
      if (s && ![d.id, d.propertyId, d.propertyTitle, d.locality, d.city, d.counterpartName].filter(Boolean).some((x: string) => x.toLowerCase().includes(s))) return false;
      return true;
    }).sort((a, b) => (Number(b.needsMe) - Number(a.needsMe)) || String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)));
  }, [items, filter, role, q]);
  if (!hub) return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  const k = hub.kpis;
  const tiles: { id: Filter; en: string; hi: string; v: string | number; icon: React.ElementType; tone: string }[] = [
    { id: 'live', en: 'Live deals', hi: 'चालू डील', v: k.live, icon: Briefcase, tone: 'text-slate-900' },
    { id: 'needs', en: 'Need my action', hi: 'मेरा काम बाकी', v: k.needsMe, icon: AlertTriangle, tone: k.needsMe ? 'text-amber-700' : 'text-slate-900' },
    ...(k.hasMoney ? [{ id: 'live' as Filter, en: 'My share in pipeline', hi: 'पाइपलाइन में मेरा हिस्सा', v: short(k.myPipeline), icon: Wallet, tone: 'text-emerald-700' }] : []),
    { id: 'stalled', en: `Idle ${hub.stalledDays}+ days`, hi: `${hub.stalledDays}+ दिन रुकी`, v: k.stalled, icon: Hourglass, tone: k.stalled ? 'text-slate-700' : 'text-slate-900' },
    { id: 'disputes', en: 'Disputes', hi: 'विवाद', v: k.disputes, icon: Scale, tone: k.disputes ? 'text-red-700' : 'text-slate-900' },
    { id: 'settled', en: 'Settled', hi: 'निपटी', v: k.settled, icon: CheckCircle2, tone: 'text-emerald-700' },
    ...(k.closed ? [{ id: 'closed' as Filter, en: 'Closed (did not happen)', hi: 'बंद (डील नहीं हुई)', v: k.closed, icon: XCircle, tone: 'text-slate-600' }] : []),
  ];
  const wide = typeof window === 'undefined' || window.innerWidth >= 1024;
  const cols = [...STAGES, ...(shown.some(d => d.stage === 'Disputed') ? ['Disputed'] : [])].filter(s => filter !== 'live' || s !== 'Settled').filter(s => filter !== 'settled' || s === 'Settled')
    .filter(s => wide || shown.some(d => d.stage === s)); // on a small screen empty stages only take space
  return (
    <div className="space-y-4" data-testid="deal-pipeline">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {tiles.map((t, i) => {
          const Icon = t.icon; const on = filter === t.id && !(i > 0 && t.id === 'live');
          return (
            <button key={t.en} type="button" onClick={() => setFilter(t.id)} className={`rounded-xl border p-3 text-left transition-colors ${on ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 bg-white hover:border-slate-400'}`} data-testid={`hub-kpi-${t.id}`}>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><Icon className="h-3.5 w-3.5" />{tx(t.en, t.hi)}</div>
              <div className={`mt-1 text-xl font-bold ${t.tone}`}>{t.v}</div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="min-h-10 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-8 text-sm" value={q} onChange={e => setQ(e.target.value)} placeholder={tx('Search property, locality, deal ID, broker', 'प्रॉपर्टी, इलाका, डील ID, ब्रोकर खोजें')} data-testid="hub-search" />
          {q && <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" aria-label={tx('Clear', 'साफ़ करें')}><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {showRoles && ([['ALL', 'All', 'सभी'], ['INTRODUCING', 'I brought the buyer', 'खरीदार मैं लाया'], ['CLOSING', 'My listing', 'मेरी लिस्टिंग']] as const).map(([id, en, hi]) => (
            <button key={id} type="button" onClick={() => setRole(id)} className={`min-h-9 rounded-full border px-3 text-[11px] font-semibold ${role === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{tx(en, hi)}</button>
          ))}
          <div className="ml-1 inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
            <button type="button" onClick={() => setView('board')} className={`inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold ${view === 'board' ? 'bg-slate-900 text-white' : 'text-slate-600'}`} data-testid="hub-view-board"><LayoutGrid className="h-3.5 w-3.5" />{tx('Board', 'बोर्ड')}</button>
            <button type="button" onClick={() => setView('list')} className={`inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold ${view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600'}`} data-testid="hub-view-list"><ListIcon className="h-3.5 w-3.5" />{tx('List', 'लिस्ट')}</button>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          <Briefcase className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          {tx('No deal room yet. A deal room opens when a co-broking proposal is accepted or a site visit is booked on a listing.', 'अभी कोई डील रूम नहीं। को-ब्रोकिंग प्रस्ताव मंज़ूर होने पर या किसी लिस्टिंग पर साइट विज़िट बुक होने पर डील रूम खुलता है।')}
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">{tx('No deal matches this filter.', 'इस फ़िल्टर में कोई डील नहीं।')} <button type="button" className="font-semibold underline" onClick={() => { setFilter('all'); setRole('ALL'); setQ(''); }}>{tx('Show all', 'सभी दिखाएँ')}</button></div>
      ) : view === 'board' ? (
        <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2" data-testid="hub-board">
          {cols.map(s => {
            const col = shown.filter(d => d.stage === s);
            const sum = col.reduce((n, d) => n + (d.money?.myShare || 0), 0);
            return (
              <section key={s} className="flex w-64 shrink-0 snap-start flex-col rounded-xl bg-slate-100/80 p-2" data-testid={`hub-col-${s.replace(/\s+/g, '-')}`}>
                <header className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-slate-800">{label('dealStage', s) || s} <span className="ml-1 rounded-full bg-white px-1.5 text-[10px] text-slate-600">{col.length}</span></span>
                  {sum > 0 && <span className="text-[10px] font-semibold text-emerald-700">{short(sum)}</span>}
                </header>
                <div className="space-y-2">
                  {col.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-3 text-center text-[11px] text-slate-400">{tx('Empty', 'खाली')}</p> : col.map(d => <DealCard key={d.id} d={d} onOpen={onOpen} />)}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid="hub-list">
          <ul className="divide-y divide-slate-100">
            {shown.map(d => {
              const first = (d.next || [])[0];
              return (
                <li key={d.id}>
                  <button type="button" onClick={() => onOpen(d.id, first && first.kind !== 'STALLED' ? first.tab : undefined, first?.kind)} className="grid w-full grid-cols-1 gap-2 px-3 py-3 text-left hover:bg-slate-50 sm:grid-cols-12 sm:items-center" data-testid={`hub-row-${d.id}`}>
                    <div className="sm:col-span-4">
                      <div className="truncate text-sm font-semibold text-slate-900">{d.propertyTitle}</div>
                      <div className="truncate text-[11px] text-slate-500"><span className="font-mono">{d.id}</span> · {[d.locality, d.city].filter(Boolean).join(', ')}{d.counterpartName ? ` · ${d.counterpartName}` : ''}</div>
                    </div>
                    <div className="sm:col-span-3">
                      <div className="mb-1 text-[11px] font-semibold text-slate-700">{label('dealStage', d.stage) || d.stage}{d.closed ? <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">{tx('Closed', 'बंद')}</span> : null}</div>
                      <Progress i={d.stageIndex} />
                    </div>
                    <div className="text-[11px] sm:col-span-3">
                      {first ? <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold ${NEXT_TONE[first.kind] || ''}`}>{nextText(first, d.idleDays, tx)}</span> : <span className="text-emerald-700">{tx('Nothing pending', 'कुछ बाकी नहीं')}</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 sm:col-span-2 sm:flex-col sm:items-end">
                      {d.money?.myShare ? <span className="font-bold text-emerald-700">{short(d.money.myShare)}</span> : <span />}
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{ago(d.lastActivityAt, tx)}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

// ───────────── mandates board ─────────────
const startOf = (m: OwnerMandate) => m.confirmedAt || m.brokerSignedAt || m.ownerSignedAt || m.createdAt;
const endOf = (m: OwnerMandate) => Date.parse(startOf(m)) + (m.protectionPeriodDays || 0) * 86400_000;
const daysLeftOf = (m: OwnerMandate) => Math.ceil((endOf(m) - Date.now()) / 86400_000);
type MFilter = 'active' | 'waiting' | 'ending' | 'ended' | 'all';
const mState = (m: OwnerMandate): MFilter => {
  if (m.status === 'PENDING_BROKER') return 'waiting';
  if (m.status !== 'ACTIVE') return 'ended';
  const left = daysLeftOf(m);
  if (left <= 0) return 'ended';
  return left <= 7 ? 'ending' : 'active';
};
export const MandatesBoard: React.FC<{ currentUser: UserProfile; deals?: any[]; onOpenDeal?: (id: string) => void }> = ({ currentUser, deals = [], onOpenDeal }) => {
  const tx = useTx(); const label = useLabel();
  const [list, setList] = useState<OwnerMandate[] | null>(null); const [err, setErr] = useState('');
  const [f, setF] = useState<MFilter>('active'); const [q, setQ] = useState('');
  const [openProp, setOpenProp] = useState<Property | null>(null); const [opening, setOpening] = useState('');
  const load = () => api.getOwnerMandates().then(r => setList(r.mandates)).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const open = async (m: OwnerMandate) => {
    setOpening(m.id); setErr('');
    try { const r = await api.getProperty(m.propertyId); setOpenProp(r.property); } catch (e: any) { setErr(e.message); } finally { setOpening(''); }
  };
  if (err && !list) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (!list) return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  const iAmBroker = (m: OwnerMandate) => m.brokerId === currentUser.id;
  const count = (x: MFilter) => list.filter(m => (x === 'active' ? ['active', 'ending'].includes(mState(m)) : mState(m) === x)).length;
  const expected = list.filter(m => ['active', 'ending'].includes(mState(m)) && iAmBroker(m)).reduce((n, m) => n + (m.brokerRemunerationAtAsking || 0), 0);
  const s = q.trim().toLowerCase();
  const shown = list.filter(m => (f === 'all' ? true : f === 'active' ? ['active', 'ending'].includes(mState(m)) : mState(m) === f))
    .filter(m => !s || [m.id, m.propertyId, m.propertyTitle, m.ownerName, m.offPlatformOwner?.name, m.brokerName].filter(Boolean).some(x => String(x).toLowerCase().includes(s)))
    .sort((a, b) => (mState(a) === 'waiting' ? -1 : 0) - (mState(b) === 'waiting' ? -1 : 0) || endOf(a) - endOf(b));
  const basis = (m: OwnerMandate) => m.remunerationBasis === 'SURPLUS_ABOVE_NET' ? tx(`Everything above ${formatINR(m.approvedNetPrice)} (owner's net)`, `मालिक के नेट ${formatINR(m.approvedNetPrice)} से ऊपर सब`)
    : m.remunerationBasis === 'PERCENTAGE' ? tx(`${m.agreedCommissionPct}% of the price`, `कीमत का ${m.agreedCommissionPct}%`) : tx(`Fixed fee ${formatINR(m.fixedFeeAmount || 0)}`, `तय फ़ीस ${formatINR(m.fixedFeeAmount || 0)}`);
  const tiles: { id: MFilter; en: string; hi: string; v: string | number; tone: string }[] = [
    { id: 'active', en: 'Active mandates', hi: 'चालू मैंडेट', v: count('active'), tone: 'text-emerald-700' },
    { id: 'waiting', en: 'Waiting for broker’s sign', hi: 'ब्रोकर के साइन बाकी', v: count('waiting'), tone: count('waiting') ? 'text-amber-700' : 'text-slate-900' },
    { id: 'ending', en: 'Protection ends in 7 days', hi: '7 दिन में सुरक्षा ख़त्म', v: count('ending'), tone: count('ending') ? 'text-red-700' : 'text-slate-900' },
    { id: 'ended', en: 'Ended / withdrawn', hi: 'ख़त्म / वापस', v: count('ended'), tone: 'text-slate-600' },
  ];
  const chip: Record<MFilter, [string, string, string]> = {
    active: ['bg-emerald-100 text-emerald-800', 'Active', 'चालू'], ending: ['bg-red-100 text-red-800', 'Ending soon', 'जल्द ख़त्म'], waiting: ['bg-amber-100 text-amber-900', 'Sign pending', 'साइन बाकी'],
    ended: ['bg-slate-100 text-slate-600', 'Ended', 'ख़त्म'], all: ['', '', ''],
  };
  return (
    <div className="space-y-4" data-testid="mandates-board">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {tiles.map(t => (
          <button key={t.id} type="button" onClick={() => setF(t.id)} className={`rounded-xl border p-3 text-left ${f === t.id ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 bg-white hover:border-slate-400'}`} data-testid={`mandate-kpi-${t.id}`}>
            <div className="text-[11px] font-semibold text-slate-500">{tx(t.en, t.hi)}</div>
            <div className={`mt-1 text-xl font-bold ${t.tone}`}>{t.v}</div>
          </button>
        ))}
        {expected > 0 && (
          <button type="button" onClick={() => setF('active')} className="col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left lg:col-span-1">
            <div className="text-[11px] font-semibold text-emerald-800">{tx('My brokerage at asking price', 'माँगी कीमत पर मेरी ब्रोकरेज')}</div>
            <div className="mt-1 text-xl font-bold text-emerald-800">{short(expected)}</div>
          </button>
        )}
      </div>
      <div className="relative sm:max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="min-h-10 w-full rounded-lg border border-slate-300 bg-white pl-8 text-sm" value={q} onChange={e => setQ(e.target.value)} placeholder={tx('Search property, owner, mandate ID', 'प्रॉपर्टी, मालिक, मैंडेट ID खोजें')} data-testid="mandate-search" />
      </div>
      {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          {list.length === 0 ? tx('No mandate yet. A mandate is made when the owner signs the brokerage terms (consent link or Property → Mandate).', 'अभी कोई मैंडेट नहीं। मालिक ब्रोकरेज शर्तों पर साइन करे (सहमति लिंक या प्रॉपर्टी → मैंडेट), तब मैंडेट बनता है।')
            : <>{tx('Nothing in this filter.', 'इस फ़िल्टर में कुछ नहीं।')} <button type="button" className="font-semibold underline" onClick={() => { setF('all'); setQ(''); }}>{tx('Show all', 'सभी दिखाएँ')}</button></>}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map(m => {
            const st = mState(m); const left = daysLeftOf(m); const total = m.protectionPeriodDays || 1;
            const pct = Math.max(0, Math.min(100, Math.round(((total - Math.max(0, left)) / total) * 100)));
            return (
              <article key={m.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4" data-testid={`mandate-${m.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-[10px] font-bold text-slate-500">{m.id} · {m.propertyId}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${chip[st][0]}`}>{tx(chip[st][1], chip[st][2])}</span>
                </div>
                <h4 className="mt-1 line-clamp-2 text-sm font-bold text-slate-900">{m.propertyTitle || m.propertyId}</h4>
                <p className="mt-0.5 text-[11px] text-slate-500">{tx('Owner', 'मालिक')}: <b className="text-slate-700">{m.ownerName || m.offPlatformOwner?.name || '—'}</b>{m.offPlatformOwner?.phoneLast4 ? ` (••${m.offPlatformOwner.phoneLast4})` : ''}{!iAmBroker(m) && m.brokerName ? ` · ${tx('Broker', 'ब्रोकर')}: ${m.brokerName}` : ''}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg bg-slate-50 p-2"><dt className="text-slate-500">{tx('Asking price', 'माँगी कीमत')}</dt><dd className="font-bold text-slate-900">{short(m.advertisedPrice)}</dd></div>
                  <div className="rounded-lg bg-emerald-50 p-2"><dt className="text-emerald-800">{tx('Brokerage at asking', 'माँगी कीमत पर ब्रोकरेज')}</dt><dd className="font-bold text-emerald-800">{short(m.brokerRemunerationAtAsking)}</dd></div>
                </dl>
                <p className="mt-2 text-[11px] text-slate-600">{basis(m)}</p>
                {(st === 'active' || st === 'ending') && (
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] font-semibold text-slate-500"><span>{tx('Protection', 'सुरक्षा')} {m.protectionPeriodDays} {tx('days', 'दिन')}</span><span className={st === 'ending' ? 'text-red-700' : ''}>{tx(`${left} days left`, `${left} दिन बाकी`)}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-200"><div className={`h-1.5 rounded-full ${st === 'ending' ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} /></div>
                  </div>
                )}
                {st === 'waiting' && iAmBroker(m) && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-[11px] font-semibold text-amber-900">{tx('The owner has signed — open it and co-sign to make it active.', 'मालिक ने साइन कर दिया — खोलकर आप भी साइन करें, तब यह चालू होगा।')}</p>}
                <div className="mt-auto space-y-2 pt-3">
                  {onOpenDeal && deals.filter((d: any) => d.propertyId === m.propertyId).slice(0, 2).map((d: any) => (
                    <button key={d.id} type="button" onClick={() => onOpenDeal(d.id)} className="inline-flex min-h-10 w-full items-center justify-between gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800" data-testid={`mandate-deal-${d.id}`}>
                      <span className="inline-flex items-center gap-1.5"><Briefcase className="h-4 w-4" />{tx('Deal room', 'डील रूम')} {d.id}</span><span className="text-[10px] text-slate-500">{label('dealStage', d.stage)}</span>
                    </button>
                  ))}
                  <button type="button" disabled={opening === m.id} onClick={() => open(m)} className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-50" data-testid={`mandate-open-${m.id}`}>
                    {opening === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}{st === 'waiting' && iAmBroker(m) ? tx('Open & sign', 'खोलें और साइन करें') : tx('Open mandate', 'मैंडेट खोलें')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {openProp && <MandateModal property={openProp} mandates={list} currentUser={currentUser} brokers={[]} onClose={() => setOpenProp(null)} onChanged={() => { load(); }} />}
    </div>
  );
};

/** a small helper for the deal-room left list / mobile switcher */
export const MessageHint: React.FC<{ at?: string }> = ({ at }) => {
  const tx = useTx();
  if (!at) return null;
  return <span className="inline-flex items-center gap-1 text-[10px] text-slate-500"><MessageSquare className="h-3 w-3" />{ago(at, tx)}</span>;
};
