import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, X, Activity, Info } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { formatINR } from '../lib/utils.js';
import type { TabType } from './NavigationTabs.js';
import type { WindowKey, DayCounts } from '../shared/pulseRules.js';

/**
 * v17 — Network Pulse (superadmin, inside the Control Center).
 * How many people / brokers came, what the network sold, what has been collected, what is live. Every tile opens the list behind it.
 * Names, roles and cities only — never a phone number, never a customer.
 */

interface WinCounts { people: number; brokers: number; acted: number; actedBrokers: number }
interface PulseData {
  asOf: string; today: string; trackingSince: string | null;
  activity: { windows: Record<WindowKey, WinCounts>; signups: Record<WindowKey, { people: number; brokers: number }>; series: DayCounts[] };
  network: { people: number; verifiedPeople: number; pendingPeople: number; byRole: Record<string, number>; brokers: { total: number; verified: number; rera: number } };
  projects: { total: number; live: number; builders: number; liveBuilders: number; units: { total: number; available: number; sold: number }; byStage: Record<string, number>; byCity: { city: string; count: number }[] };
  bookings: {
    counts: { requested: number; approved: number; rejected: number; cancelled: number };
    network: { count: number; value: number; collected: number }; direct: { count: number; value: number; collected: number };
    byWindow: Record<WindowKey, { network: { count: number; value: number }; all: { count: number; value: number }; raised: number }>;
    series: { day: string; raised: number; approved: number }[];
  };
  money: { collectedNetwork: number; collectedDirect: number; onTheWay: { count: number; amount: number; withTeam: number; withPartner: number; handedOver: number }; confirmedByBuilder: number; stuck: number };
}
interface Drill { id: string; kind: string; title: string; q: Record<string, string> }

const WIN_ORDER: WindowKey[] = ['today', 'yesterday', 'd7', 'd30'];
const n0 = (n: number) => (n || 0).toLocaleString('en-IN');

const Tile: React.FC<{ title: string; value: React.ReactNode; hint?: string; active?: boolean; tone?: 'warn'; onClick: () => void }> = ({ title, value, hint, active, tone, onClick }) => (
  <button type="button" onClick={onClick} aria-pressed={!!active}
    className={`min-w-0 rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-slate-400 ${active ? 'border-indigo-500 ring-2 ring-indigo-200' : tone === 'warn' ? 'border-amber-300' : 'border-slate-200'}`}>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
    <p className="mt-1 break-words text-xl font-bold leading-tight text-slate-900">{value}</p>
    {hint && <p className="mt-0.5 break-words text-[11px] leading-snug text-slate-500">{hint}</p>}
  </button>
);

/** a pill switch (kept outside the screen component so the button keeps keyboard focus when it re-renders) */
const Seg: React.FC<{ value: string; cur: string; onPick: () => void; children: React.ReactNode }> = ({ value, cur, onPick, children }) => (
  <button type="button" onClick={onPick} aria-pressed={value === cur}
    className={`rounded-full border px-3 py-1 text-xs font-semibold ${value === cur ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'}`}>{children}</button>
);

/** one series, thin bars on a shared baseline; hover or tap a day to read it. Lighter bars = days we only know from the audit trail. */
const Bars: React.FC<{ rows: { day: string; v: number; soft?: boolean }[]; color: string; softColor: string; label: string; unit: string; fmtDay: (d: string) => string }> = ({ rows, color, softColor, label, unit, fmtDay }) => {
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(1, ...rows.map(r => r.v));
  const cur = sel === null ? null : rows[sel];
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>{cur ? `${fmtDay(cur.day)} · ${n0(cur.v)} ${unit}` : `${label}`}</span>
        <span>{max} ▸</span>
      </div>
      <div className="relative mt-1 flex h-28 items-end gap-[3px] border-b border-slate-300" role="img" aria-label={`${label}: ${rows.map(r => `${fmtDay(r.day)} ${r.v}`).join(', ')}`}
        onMouseLeave={() => setSel(null)}>
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-slate-200" />
        {rows.map((r, i) => (
          <button key={r.day} type="button" aria-label={`${fmtDay(r.day)}: ${r.v} ${unit}`} onMouseEnter={() => setSel(i)} onFocus={() => setSel(i)} onClick={() => setSel(sel === i ? null : i)}
            className="group relative flex h-full min-w-0 flex-1 items-end justify-center focus:outline-none">
            <span className={`block w-full max-w-[14px] rounded-t-[4px] ${r.soft ? softColor : color} ${sel === i ? 'ring-2 ring-slate-700 ring-offset-1' : ''}`} style={{ height: r.v ? `${Math.max(4, (r.v / max) * 100)}%` : '2px', opacity: r.v ? 1 : 0.35 }} />
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>{fmtDay(rows[0]?.day)}</span><span>{fmtDay(rows[Math.floor(rows.length / 2)]?.day)}</span><span>{fmtDay(rows[rows.length - 1]?.day)}</span></div>
    </div>
  );
};

export const NetworkPulse: React.FC<{ onNavigate: (t: TabType) => void }> = ({ onNavigate }) => {
  const tx = useTx();
  const { lang } = useI18n();
  const label = useLabel();
  const [d, setD] = useState<PulseData | null>(null);
  const [err, setErr] = useState('');
  const [win, setWin] = useState<WindowKey>('today');
  const [mode, setMode] = useState<'people' | 'brokers' | 'acted'>('people');
  const [bmode, setBmode] = useState<'raised' | 'approved'>('approved');
  const [drill, setDrill] = useState<Drill | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ total: number; value?: number }>({ total: 0 });
  const [busy, setBusy] = useState(false);
  const [table, setTable] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try { setD(await api.pulse()); setErr(''); }
    catch (e: any) { setErr(e.message || tx('Could not load Network Pulse', 'नेटवर्क पल्स लोड नहीं हो सका')); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = async (dr: Drill) => {
    setDrill(dr); setRows([]);
    try { const r = await api.pulseDrill(dr.q); setRows(r.rows || []); setMeta({ total: r.total || 0, value: r.value }); }
    catch (e: any) { setErr(e.message); }
  };

  const fmtDay = useCallback((day: string) => {
    if (!day) return '';
    const dt = new Date(day + 'T00:00:00');
    return dt.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' });
  }, [lang]);

  const WIN_LABEL: Record<WindowKey, string> = useMemo(() => ({
    today: tx('Today', 'आज'), yesterday: tx('Yesterday', 'कल'), d7: tx('Last 7 days', 'पिछले 7 दिन'), d30: tx('Last 30 days', 'पिछले 30 दिन'),
  }), [lang]);

  if (err && !d) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{err}</div>;
  if (!d) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  const a = d.activity.windows[win]; const su = d.activity.signups[win];
  const bw = d.bookings.byWindow[win];
  const soldPct = d.bookings.network.value ? Math.round((d.bookings.network.collected / d.bookings.network.value) * 100) : 0;
  const isActive = (id: string) => drill?.id === id;
  const wq = { window: win };

  const series = d.activity.series.map(s => ({ day: s.day, v: mode === 'people' ? s.people : mode === 'brokers' ? s.brokers : s.acted, soft: s.source !== 'tracked' && mode !== 'acted' }));
  const bseries = d.bookings.series.map(s => ({ day: s.day, v: bmode === 'raised' ? s.raised : s.approved }));
  const hasHistoryDays = d.activity.series.some(s => s.source === 'history');

  const personRow = (u: any) => (
    <li key={u.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2 text-xs">
      <span className="min-w-0 break-words font-medium text-slate-800">{u.name}<span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-normal text-slate-600">{label('role', u.role)}</span></span>
      <span className="text-slate-500">{[u.companyName, u.city].filter(Boolean).join(' · ') || '—'}{u.daysActive ? ` · ${u.daysActive} ${tx('day(s)', 'दिन')}` : ''}</span>
    </li>
  );
  const bookingRow = (b: any) => (
    <li key={b.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2 text-xs">
      <span className="min-w-0 break-words font-medium text-slate-800">{b.projectName} · {b.unitNo}<span className="ml-2 text-[10px] font-normal text-slate-500">{b.id}</span></span>
      <span className="text-slate-600">{formatINR(b.agreementValue)} · {b.status === 'APPROVED' ? `${tx('collected', 'वसूली')} ${b.pct}%` : label('status', b.status)} · {b.direct ? tx('builder desk', 'बिल्डर डेस्क') : b.associateName} · {b.builderName} · {fmtDay((b.at || '').slice(0, 10))}</span>
    </li>
  );
  const projectRow = (p: any) => (
    <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2 text-xs">
      <span className="min-w-0 break-words font-medium text-slate-800">{p.projectName}<span className="ml-2 text-[10px] font-normal text-slate-500">{p.builderName}</span></span>
      <span className="text-slate-600">{p.city} · {p.availableUnits}/{p.totalUnits} {tx('units left', 'यूनिट बाकी')} · {p.partners} {tx('partners', 'पार्टनर')}</span>
    </li>
  );
  const moneyRow = (m: any) => (
    <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2 text-xs">
      <span className="min-w-0 break-words font-medium text-slate-800">{m.projectName} · {m.bookingId}<span className="ml-2 text-[10px] font-normal text-slate-500">{m.id}</span></span>
      <span className="text-slate-600">{formatINR(m.amount)} · {m.holder === 'COLLECTOR' ? tx('with team member', 'टीम मेंबर के पास') : m.holder === 'CP' ? tx('with partner', 'पार्टनर के पास') : tx('handed to builder', 'बिल्डर को सौंपा')} · {m.ageDays} {tx('day(s)', 'दिन')}</span>
    </li>
  );
  const rowFor = drill?.kind === 'bookings' ? bookingRow : drill?.kind === 'projects' ? projectRow : drill?.kind === 'money' ? moneyRow : personRow;

  return (
    <section className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3 sm:p-4" aria-label={tx('Network Pulse', 'नेटवर्क पल्स')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><Activity className="h-5 w-5 text-indigo-600" /> {tx('Network Pulse', 'नेटवर्क पल्स')}</h3>
          <p className="text-[11px] text-slate-500">{tx('How many came, what the network sold, what is collected, what is live — tap any tile for the list.', 'कितने आए, नेटवर्क ने क्या बेचा, कितना वसूल हुआ, क्या लाइव है — किसी भी टाइल को दबाकर लिस्ट देखें।')}</p>
        </div>
        <button type="button" onClick={load} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400">
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> {tx('Refresh', 'रिफ़्रेश')}
        </button>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={tx('Period', 'अवधि')}>
        {WIN_ORDER.map(w => <Seg key={w} value={w} cur={win} onPick={() => { setWin(w); setDrill(null); }}>{WIN_LABEL[w]}</Seg>)}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-700">{tx('Who came', 'कौन आया')} · {WIN_LABEL[win]}</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Tile title={tx('People came', 'लोग आए')} value={n0(a.people)} hint={tx('everyone who opened the app', 'जिसने भी ऐप खोला')} active={isActive('people')}
            onClick={() => open({ id: 'people', kind: 'people', title: `${tx('People who came', 'आए हुए लोग')} · ${WIN_LABEL[win]}`, q: { kind: 'people', ...wq } })} />
          <Tile title={tx('Brokers came', 'ब्रोकर आए')} value={n0(a.brokers)} hint={`${tx('of', 'कुल')} ${n0(d.network.brokers.verified)} ${tx('verified', 'वेरिफ़ाइड')}`} active={isActive('brokers')}
            onClick={() => open({ id: 'brokers', kind: 'brokers', title: `${tx('Brokers who came', 'आए हुए ब्रोकर')} · ${WIN_LABEL[win]}`, q: { kind: 'brokers', ...wq } })} />
          <Tile title={tx('Did something', 'काम किया')} value={n0(a.acted)} hint={`${tx('brokers', 'ब्रोकर')}: ${n0(a.actedBrokers)}`} active={isActive('acted')}
            onClick={() => open({ id: 'acted', kind: 'acted', title: `${tx('People who did something', 'काम करने वाले')} · ${WIN_LABEL[win]}`, q: { kind: 'acted', ...wq } })} />
          <Tile title={tx('New sign-ups', 'नए साइन-अप')} value={n0(su.people)} hint={`${tx('brokers', 'ब्रोकर')}: ${n0(su.brokers)}`} active={isActive('signups')}
            onClick={() => open({ id: 'signups', kind: 'signups', title: `${tx('New sign-ups', 'नए साइन-अप')} · ${WIN_LABEL[win]}`, q: { kind: 'signups', ...wq } })} />
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-700">{tx('What the network did', 'नेटवर्क ने क्या किया')} · {WIN_LABEL[win]}</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Tile title={tx('Bookings (network)', 'बुकिंग (नेटवर्क)')} value={n0(bw.network.count)} hint={`${tx('all time', 'अब तक')}: ${n0(d.bookings.network.count)}`} active={isActive('b-net')}
            onClick={() => open({ id: 'b-net', kind: 'bookings', title: `${tx('Approved bookings through partners', 'पार्टनर के ज़रिए मंज़ूर बुकिंग')} · ${WIN_LABEL[win]}`, q: { kind: 'bookings', status: 'APPROVED', scope: 'network', ...wq } })} />
          <Tile title={tx('Sale value', 'बिक्री की रकम')} value={formatINR(bw.network.value)} hint={`${tx('all time', 'अब तक')}: ${formatINR(d.bookings.network.value)}`} active={isActive('b-val')}
            onClick={() => open({ id: 'b-val', kind: 'bookings', title: `${tx('Sale value — approved bookings', 'बिक्री की रकम — मंज़ूर बुकिंग')} · ${WIN_LABEL[win]}`, q: { kind: 'bookings', status: 'APPROVED', scope: 'network', ...wq } })} />
          <Tile title={tx('Collected so far', 'अब तक वसूली')} value={formatINR(d.money.collectedNetwork)} hint={`${soldPct}% ${tx('of network sales', 'नेटवर्क की बिक्री का')}`} active={isActive('b-col')}
            onClick={() => open({ id: 'b-col', kind: 'bookings', title: tx('Collections on network sales (all time)', 'नेटवर्क की बिक्री पर वसूली (अब तक)'), q: { kind: 'bookings', status: 'APPROVED', scope: 'network', window: 'all' } })} />
          <Tile title={tx('Money on the way', 'रास्ते में पैसा')} value={formatINR(d.money.onTheWay.amount)} tone={d.money.stuck ? 'warn' : undefined}
            hint={`${tx('team', 'टीम')} ${formatINR(d.money.onTheWay.withTeam)} · ${tx('partner', 'पार्टनर')} ${formatINR(d.money.onTheWay.withPartner)} · ${tx('builder', 'बिल्डर')} ${formatINR(d.money.onTheWay.handedOver)}${d.money.stuck ? ` · ${d.money.stuck} ${tx('stuck', 'अटके')}` : ''}`}
            active={isActive('money')}
            onClick={() => open({ id: 'money', kind: 'money', title: tx('Money not yet confirmed by the builder', 'जिस पैसे को बिल्डर ने अभी माना नहीं'), q: { kind: 'money' } })} />
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-700">{tx('The network today', 'नेटवर्क आज')}</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Tile title={tx('Live projects', 'लाइव प्रोजेक्ट')} value={n0(d.projects.live)} hint={`${n0(d.projects.units.available)} ${tx('units left', 'यूनिट बाकी')} · ${n0(d.projects.liveBuilders)} ${tx('builder(s)', 'बिल्डर')}`}
            active={isActive('projects')}
            onClick={() => open({ id: 'projects', kind: 'projects', title: tx('Live projects (units still to sell)', 'लाइव प्रोजेक्ट (जिनमें यूनिट बिकनी बाकी हैं)'), q: { kind: 'projects', live: '1' } })} />
          <Tile title={tx('Verified brokers', 'वेरिफ़ाइड ब्रोकर')} value={`${n0(d.network.brokers.verified)}/${n0(d.network.brokers.total)}`} hint={`RERA: ${n0(d.network.brokers.rera)}`} onClick={() => onNavigate('onboarding')} />
          <Tile title={tx('Booking requests waiting', 'इंतज़ार में बुकिंग')} value={n0(d.bookings.counts.requested)} tone={d.bookings.counts.requested ? 'warn' : undefined} hint={tx('waiting for the builder', 'बिल्डर के जवाब का इंतज़ार')} active={isActive('b-req')}
            onClick={() => open({ id: 'b-req', kind: 'bookings', title: tx('Booking requests waiting for the builder', 'बिल्डर के जवाब के इंतज़ार में बुकिंग'), q: { kind: 'bookings', status: 'REQUESTED', window: 'all' } })} />
          <Tile title={tx("Builder's own sales", 'बिल्डर की अपनी बिक्री')} value={n0(d.bookings.direct.count)} hint={`${formatINR(d.bookings.direct.value)} · ${tx('not counted above', 'ऊपर नहीं जुड़ी')}`} active={isActive('b-dir')}
            onClick={() => open({ id: 'b-dir', kind: 'bookings', title: tx("Sales made by builders' own desks (no partner)", 'बिल्डर के अपने डेस्क की बिक्री (बिना पार्टनर)'), q: { kind: 'bookings', status: 'APPROVED', scope: 'direct', window: 'all' } })} />
        </div>
      </div>

      {drill && (
        <div className="rounded-xl border border-slate-200 bg-white p-3" aria-live="polite">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 break-words text-sm font-semibold text-slate-900">{drill.title} <span className="font-normal text-slate-500">({n0(meta.total)}{meta.value !== undefined ? ` · ${formatINR(meta.value)}` : ''})</span></p>
            <button type="button" onClick={() => setDrill(null)} aria-label={tx('Close list', 'लिस्ट बंद करें')} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
          {!rows.length
            ? <p className="py-4 text-center text-xs text-slate-400">{tx('Nothing here for this period.', 'इस अवधि में यहाँ कुछ नहीं।')}</p>
            : <ul className="mt-1 divide-y divide-slate-100">{rows.map(rowFor)}</ul>}
          {drill.kind === 'projects' && <button type="button" onClick={() => onNavigate('builder')} className="mt-2 text-xs text-indigo-600 hover:underline">{tx('Open Builder Launchpad →', 'बिल्डर लॉन्चपैड खोलें →')}</button>}
          {drill.kind === 'bookings' && <button type="button" onClick={() => onNavigate('crm')} className="mt-2 text-xs text-indigo-600 hover:underline">{tx('Open Associates CRM →', 'एसोसिएट्स CRM खोलें →')}</button>}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">{tx('Per day — last 30 days', 'रोज़ — पिछले 30 दिन')}</p>
            <div className="flex flex-wrap gap-1.5">
              <Seg value="people" cur={mode} onPick={() => setMode('people')}>{tx('People', 'लोग')}</Seg>
              <Seg value="brokers" cur={mode} onPick={() => setMode('brokers')}>{tx('Brokers', 'ब्रोकर')}</Seg>
              <Seg value="acted" cur={mode} onPick={() => setMode('acted')}>{tx('Did something', 'काम किया')}</Seg>
            </div>
          </div>
          <Bars rows={series} color={mode === 'brokers' ? 'bg-emerald-600' : 'bg-indigo-600'} softColor={mode === 'brokers' ? 'bg-emerald-300' : 'bg-indigo-300'}
            label={mode === 'people' ? tx('People per day', 'रोज़ आने वाले लोग') : mode === 'brokers' ? tx('Brokers per day', 'रोज़ आने वाले ब्रोकर') : tx('People who did something per day', 'रोज़ काम करने वाले')}
            unit={mode === 'brokers' ? tx('brokers', 'ब्रोकर') : tx('people', 'लोग')} fmtDay={fmtDay} />
          {hasHistoryDays && mode !== 'acted' && <p className="mt-1 text-[10px] text-slate-500">{tx('Lighter bars: older days counted from the audit trail only (people who did something).', 'हल्के बार: पुराने दिन सिर्फ़ ऑडिट ट्रेल से गिने (जिन्होंने कुछ किया)।')}</p>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">{tx('Bookings per day', 'रोज़ की बुकिंग')}</p>
            <div className="flex flex-wrap gap-1.5">
              <Seg value="approved" cur={bmode} onPick={() => setBmode('approved')}>{tx('Approved', 'मंज़ूर')}</Seg>
              <Seg value="raised" cur={bmode} onPick={() => setBmode('raised')}>{tx('Requested', 'माँगी गई')}</Seg>
            </div>
          </div>
          <Bars rows={bseries} color="bg-amber-500" softColor="bg-amber-300" label={bmode === 'approved' ? tx('Approved bookings per day', 'रोज़ मंज़ूर बुकिंग') : tx('Booking requests per day', 'रोज़ माँगी गई बुकिंग')} unit={tx('bookings', 'बुकिंग')} fmtDay={fmtDay} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setTable(!table)} className="text-xs font-semibold text-indigo-600 hover:underline">{table ? tx('Hide the day-by-day table', 'रोज़ की तालिका छिपाएँ') : tx('Show the day-by-day table', 'रोज़ की तालिका दिखाएँ')}</button>
      </div>
      {table && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr><th className="p-2">{tx('Day', 'दिन')}</th><th className="p-2">{tx('People', 'लोग')}</th><th className="p-2">{tx('Brokers', 'ब्रोकर')}</th><th className="p-2">{tx('Did something', 'काम किया')}</th><th className="p-2">{tx('Bookings approved', 'मंज़ूर बुकिंग')}</th></tr></thead>
            <tbody>
              {[...d.activity.series].reverse().map((s, i) => {
                const bs = d.bookings.series[d.bookings.series.length - 1 - i];
                return <tr key={s.day} className="border-t border-slate-100"><td className="p-2">{fmtDay(s.day)}</td><td className="p-2">{s.people}</td><td className="p-2">{s.brokers}</td><td className="p-2">{s.acted}</td><td className="p-2">{bs?.approved ?? 0}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {tx('Daily counting stores only a user-id and the Indian date (no page, IP or phone) and is erased after 180 days. ', 'रोज़ की गिनती में सिर्फ़ यूज़र-आईडी और भारतीय तारीख़ रहती है (कोई पेज, IP या फ़ोन नहीं) और 180 दिन बाद मिट जाती है। ')}
          {d.trackingSince
            ? tx(`"Came" is counted from ${fmtDay(d.trackingSince)}; before that only people who did something are known (from the audit trail). `, `"आए" की गिनती ${fmtDay(d.trackingSince)} से है; उससे पहले सिर्फ़ काम करने वाले ही पता हैं (ऑडिट ट्रेल से)। `)
            : tx('Counting starts with the first sign-in after this update. ', 'गिनती इस अपडेट के बाद के पहले साइन-इन से शुरू होती है। ')}
          {tx('"Network" sales = bookings made through partners; a builder\'s own desk is shown apart. Admin accounts are not counted. No customer name or phone is shown here.', '"नेटवर्क" बिक्री = पार्टनर के ज़रिए हुई बुकिंग; बिल्डर का अपना डेस्क अलग दिखता है। एडमिन अकाउंट गिनती में नहीं हैं। यहाँ किसी ग्राहक का नाम या फ़ोन नहीं दिखता।')}
        </span>
      </p>
    </section>
  );
};
