import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTx, useI18n } from '../lib/i18n.js';
import { Loader2, Trophy, Plus, Trash2, Timer, X, EyeOff, Eye, Send, Users, ListChecks, SlidersHorizontal, Pencil, Copy, Lock, Compass } from 'lucide-react';
import { api } from '../lib/api.js';
import { btnDark, btnLine, inp } from './CrmPlus.js';
import { ProjectDocsCard } from './ProjectDocsCard.js';
import {
  RateSheet, VisibilitySheet, FactsSheet, UnitEditSheet, KindSheet, ShareSheet, PostSheet, TeamBoardCard, MyLinksCard, ImportCard, FeaturePicker, Chip, copyText,
} from './InventorySheets.js';
import { FACINGS, UNIT_FEATURES, UNIT_KINDS, facingLabel, featureLabel, roadSidesLabel, unitShareLine, inrShort, kindLabel, unitKindOf, isFloorWise, rateCard, type UnitKind } from '../shared/inventoryRules.js';

const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const COLORS: Record<string, string> = {
  AVAILABLE: 'bg-emerald-100 border-emerald-400 text-emerald-900',
  HOLD: 'bg-amber-100 border-amber-400 text-amber-900',
  BOOKED: 'bg-red-100 border-red-400 text-red-900',
  RESERVED: 'bg-violet-100 border-violet-400 text-violet-900',
};
const LABEL: Record<string, string> = { AVAILABLE: 'Available', HOLD: 'On hold', BOOKED: 'Booked / sold', RESERVED: 'Builder reserved' };
const LABEL_HI: Record<string, string> = { AVAILABLE: 'उपलब्ध', HOLD: 'होल्ड पर', BOOKED: 'बुक / बिक गई', RESERVED: 'बिल्डर ने रिज़र्व की' };
const fshort = (id?: string) => (id ? id.split('_').map(w => w[0]).join('') : '');

const left = (iso: string | null | undefined, hi = false) => {
  if (!iso) return hi ? 'बुकिंग बाकी' : 'booking pending';
  const m = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60000));
  return hi ? (m >= 60 ? `${Math.floor(m / 60)}घं ${m % 60}मि बाकी` : `${m}मि बाकी`) : (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m left` : `${m}m left`);
};

const audLabel = (v: any, tx: (a: string, b: string) => string) =>
  !v ? '' : v.audience === 'HIDDEN' ? tx('Only me', 'सिर्फ़ मैं') : v.audience === 'SELECTED' ? tx(`${v.brokerIds.length} chosen partner(s)`, `${v.brokerIds.length} चुने पार्टनर`) : tx('All partners', 'सभी पार्टनर');

interface Props { role: string; leads: any[] }

type SheetState = null | { kind: 'rate' | 'vis' | 'facts' | 'share' | 'post' | 'edit' | 'projvis' | 'kind'; ids?: string[]; unit?: any };

export const InventoryPanel: React.FC<Props> = ({ role, leads }) => {
  const tx = useTx();
  const { lang, t } = useI18n();
  const hi = lang === 'hi';
  const lbl = (k: string) => (hi ? LABEL_HI[k] : LABEL[k]) || k;
  const [projects, setProjects] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pid, setPid] = useState('');
  const [data, setData] = useState<any>(null);
  const [board, setBoard] = useState<any>(null);
  const [sel, setSel] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [hold, setHold] = useState({ leadId: '', tokenAmount: '', tokenRef: '' });
  const [gen, setGen] = useState({ unitKind: 'FLAT' as UnitKind, group: 'Tower A', prefix: 'A-', startFloor: '1', floors: '5', perFloor: '4', config: '3 BHK', areaSqft: '1450', basePrice: '8500000', ratePerSqft: '', byRate: false, codePrefix: '', floorRise: '100000', facing: '', roadSides: '', roadWidthFt: '', dimensions: '' });
  const [genFeats, setGenFeats] = useState<string[]>([]);
  const [slabs, setSlabs] = useState<any[]>([]);
  const [cfg, setCfg] = useState({ holdHours: '2', minToken: '21000' });
  // v16.8
  const [statusF, setStatusF] = useState('');
  const [kindF, setKindF] = useState<'' | UnitKind>('');
  const [rateOpen, setRateOpen] = useState(false);
  const [f, setF] = useState({ q: '', group: '', config: '', facing: '', road: '', minL: '', maxL: '', vis: '' });
  const [featF, setFeatF] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<SheetState>(null);
  const [refresh, setRefresh] = useState(0);
  const [hidePrice, setHidePrice] = useState(() => { try { return localStorage.getItem('genz.inv.hidePrice') === '1'; } catch { return false; } });
  const togglePrice = () => { const v = !hidePrice; setHidePrice(v); try { localStorage.setItem('genz.inv.hidePrice', v ? '1' : '0'); } catch { /* optional */ } };

  const loadProjects = useCallback(async () => {
    try { const r = await api.invProjects(); setProjects(r.projects); if (!pid && r.projects[0]) setPid(r.projects[0].id); } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setLoaded(true); }
  }, [pid]);
  const loadProject = useCallback(async () => {
    if (!pid) return;
    try {
      const [d, b] = await Promise.all([api.invProject(pid), api.invLeaderboard(pid).catch(() => null)]);
      setData(d); setBoard(b);
      setSlabs((d.project.cpSlabs || []).map((s: any) => ({ ...s, to: s.to ?? '' })));
      setCfg({ holdHours: String(d.project.holdHours), minToken: String(d.project.minToken) });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  }, [pid]);
  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => { setPicked(new Set()); setStatusF(''); setKindF(''); setFeatF([]); setF({ q: '', group: '', config: '', facing: '', road: '', minL: '', maxL: '', vis: '' }); }, [pid]);
  useEffect(() => { loadProject(); const t = setInterval(loadProject, 60000); return () => clearInterval(t); }, [loadProject]);

  const act = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); setSel(null); await loadProject(); } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  const sheetDone = (m: string) => { setSheet(null); setSel(null); setPicked(new Set()); setSelectMode(false); setMsg({ ok: true, text: m }); loadProject(); setRefresh(k => k + 1); };

  const caps = data?.caps || {};
  const canManage = !!data?.canManage;
  const seesPrice = caps.seesPrice !== false && !hidePrice;
  const units: any[] = data?.units || [];
  const priceOf = (u: any) => (seesPrice && u.price != null ? u.price : null);

  // filter option lists come from what is really in the grid
  const configs = useMemo(() => [...new Set(units.map(u => u.config).filter(Boolean))].sort(), [units]);
  const groupNames = useMemo(() => [...new Set(units.map(u => u.group))], [units]);
  const facingsIn = useMemo(() => [...new Set(units.map(u => u.facing).filter(Boolean))] as string[], [units]);
  const roadsIn = useMemo(() => [...new Set(units.map(u => u.roadSides).filter(Boolean))].sort() as number[], [units]);
  const kindsIn = useMemo(() => UNIT_KINDS.map(k => ({ ...k, n: units.filter(u => unitKindOf(u) === k.id).length })).filter(k => k.n > 0), [units]);
  const card = useMemo(() => rateCard(units.map(u => ({ ...u, price: seesPrice ? u.price : null }))), [units, seesPrice]);
  const featsIn = useMemo(() => UNIT_FEATURES.filter(x => units.some(u => (u.features || []).includes(x.id))), [units]);

  const filtered = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const min = f.minL ? Number(f.minL) * 100000 : 0; const max = f.maxL ? Number(f.maxL) * 100000 : Infinity;
    return units.filter(u => {
      if (statusF && u.status !== statusF) return false;
      if (kindF && unitKindOf(u) !== kindF) return false;
      if (q && !`${u.label} ${u.code || ''} ${u.group} ${u.config}`.toLowerCase().includes(q)) return false;
      if (f.group && u.group !== f.group) return false;
      if (f.config && u.config !== f.config) return false;
      if (f.facing && u.facing !== f.facing) return false;
      if (f.road && (f.road === '3' ? (u.roadSides || 0) < 3 : u.roadSides !== Number(f.road))) return false;
      if ((min > 0 || max < Infinity) && (u.price == null || u.price < min || u.price > max)) return false;
      if (featF.length && !featF.every(x => (u.features || []).includes(x))) return false;
      if (f.vis === 'HIDDEN' && u.vis?.audience !== 'HIDDEN') return false;
      if (f.vis === 'SELECTED' && u.vis?.audience !== 'SELECTED') return false;
      if (f.vis === 'PRICE' && !u.vis?.priceHidden) return false;
      return true;
    });
  }, [units, statusF, kindF, f, featF]);
  const filtersOn = !!(statusF || kindF || featF.length || Object.values(f).some(Boolean));
  const clearFilters = () => { setStatusF(''); setKindF(''); setFeatF([]); setF({ q: '', group: '', config: '', facing: '', road: '', minL: '', maxL: '', vis: '' }); };

  const groups: Record<string, any[]> = {};
  filtered.forEach(u => { (groups[u.group] ||= []).push(u); });
  const myLeads = leads.filter(l => l.projectId === pid && !['LOST', 'BOOKED'].includes(l.stage));
  const pickedUnits = units.filter(u => picked.has(u.id));
  const pickedFree = pickedUnits.filter(u => u.status === 'AVAILABLE');
  const flash = (ok: boolean, text: string) => setMsg({ ok, text });
  const togglePick = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const projectName = projects.find(p => p.id === pid)?.projectName || data?.project?.projectName || '';

  const showDocs = role === 'BROKER' || role === 'TEAM_MEMBER';
  if (loaded && !projects.length && !data) {
    return (
      <div className="space-y-4">
        <p className="py-6 text-center text-xs text-slate-500">{role === 'TEAM_MEMBER'
          ? tx('Nothing has been shared with you yet. Ask your employer to show you units (Team board).', 'अभी आपको कुछ दिखाया नहीं गया। अपने मालिक से यूनिट दिखाने को कहें (टीम बोर्ड)।')
          : tx('No project found. Brokers need an active mandate from the builder.', 'कोई प्रोजेक्ट नहीं मिला। ब्रोकर के लिए बिल्डर का सक्रिय मैंडेट चाहिए।')}</p>
        {showDocs && <ProjectDocsCard role={role} refreshKey={refresh} />}
      </div>
    );
  }
  if (!loaded) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;

  const tiles: [string, string, number][] = data ? [
    ['', tx('All', 'सभी'), data.summary.total], ['AVAILABLE', lbl('AVAILABLE'), data.summary.available], ['HOLD', lbl('HOLD'), data.summary.hold],
    ['BOOKED', lbl('BOOKED'), data.summary.booked], ['RESERVED', lbl('RESERVED'), data.summary.reserved],
  ] : [];
  const sellFlags = { showPrice: seesPrice, showFeatures: true };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={pid} onChange={e => setPid(e.target.value)} aria-label={tx('Project', 'प्रोजेक्ट')} className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-xs">
          {projects.map(p => <option key={p.id} value={p.id}>{p.projectName} ({p.available}/{p.units} {tx('available', 'उपलब्ध')})</option>)}
        </select>
        {caps.seesPrice !== false && <button type="button" onClick={togglePrice} className={btnLine} title={tx('Hide every rate on this screen — handy when a customer is looking', 'इस स्क्रीन पर हर रेट छुपाएँ — ग्राहक सामने बैठा हो तो काम आता है')}>{hidePrice ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{hidePrice ? tx('Rates hidden', 'रेट छुपे हैं') : tx('Hide rates on my screen', 'मेरी स्क्रीन पर रेट छुपाएँ')}</button>}
        <button type="button" onClick={() => setSelectMode(!selectMode)} className={selectMode ? btnDark : btnLine}><ListChecks className="h-4 w-4" />{selectMode ? tx('Done selecting', 'चुनना बंद') : tx('Select units', 'यूनिट चुनें')}</button>
        <button type="button" onClick={() => setShowFilters(!showFilters)} className={showFilters || filtersOn ? btnDark : btnLine}><SlidersHorizontal className="h-4 w-4" />{tx('Filters', 'फ़िल्टर')}{filtersOn ? ' •' : ''}</button>
      </div>

      {data && (
        <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] sm:text-[11px]">
          {tiles.map(([k, label, n]) => (
            <button key={k || 'ALL'} type="button" onClick={() => setStatusF(statusF === k ? '' : k)} aria-pressed={statusF === k}
              className={`min-h-12 rounded-lg border px-1 py-1.5 font-semibold ${k ? COLORS[k] : 'border-slate-300 bg-white text-slate-800'} ${statusF === k ? 'ring-2 ring-slate-900' : ''}`}>
              <div className="text-sm font-bold">{n}</div><div className="leading-tight">{label}</div>
            </button>
          ))}
        </div>
      )}

      {data && kindsIn.length > 1 && (
        <div className="flex flex-wrap gap-1.5" data-testid="kind-chips" role="group" aria-label={tx('Kind of unit', 'यूनिट का प्रकार')}>
          <Chip on={kindF === ''} onClick={() => setKindF('')}>{tx('All kinds', 'सभी प्रकार')} · {units.length}</Chip>
          {kindsIn.map(k => <Chip key={k.id} on={kindF === k.id} onClick={() => setKindF(kindF === k.id ? '' : k.id)}>{hi ? k.hi : k.en} · {k.n}</Chip>)}
        </div>
      )}

      {data && card.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-3 text-xs" data-testid="rate-card">
          <button type="button" onClick={() => setRateOpen(!rateOpen)} aria-expanded={rateOpen} className="flex w-full items-center justify-between gap-2 text-left text-sm font-bold text-slate-900">
            {tx('Rate card — every type, its count and rate', 'रेट कार्ड — हर प्रकार, उसकी गिनती और रेट')}<span className="text-slate-400">{rateOpen ? '–' : '+'}</span>
          </button>
          {rateOpen && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[22rem] text-left">
                <thead className="text-slate-500"><tr><th className="py-1">{tx('Type', 'प्रकार')}</th><th>{tx('Free / all', 'खाली / कुल')}</th>{seesPrice && <th>{tx('Price', 'कीमत')}</th>}{seesPrice && <th>₹/{tx('sq ft', 'वर्ग फ़ुट')}</th>}<th /></tr></thead>
                <tbody>
                  {card.map(r => (
                    <tr key={`${r.kind}|${r.config}`} className="border-t border-slate-100" data-testid="rate-row">
                      <td className="py-1.5 pr-2"><b>{kindLabel(r.kind, hi)}</b>{r.config ? <span className="text-slate-600"> · {r.config}</span> : null}</td>
                      <td>{r.available}/{r.count}</td>
                      {seesPrice && <td>{r.minPrice === undefined ? '—' : r.minPrice === r.maxPrice ? inrShort(r.minPrice) : `${inrShort(r.minPrice)} – ${inrShort(r.maxPrice!)}`}</td>}
                      {seesPrice && <td>{r.minRate === undefined ? '—' : r.minRate === r.maxRate ? inr(r.minRate) : `${inr(r.minRate)} – ${inr(r.maxRate!)}`}</td>}
                      <td className="text-right"><button type="button" onClick={() => { setSelectMode(true); setPicked(new Set(r.ids)); }} className="min-h-9 rounded-lg border border-slate-300 px-2 font-semibold text-slate-700 hover:border-slate-900">{tx('Select all', 'सब चुनें')}</button></td>
                    </tr>))}
                </tbody>
              </table>
              <p className="mt-1.5 text-[10px] text-slate-500">{tx('“Select all” picks every unit of that type — then change its rate, who sees it, or send it, in one go.', '“सब चुनें” उस प्रकार की हर यूनिट चुन लेता है — फिर एक साथ उसका रेट बदलें, किसे दिखे तय करें, या भेजें।')}</p>
            </div>
          )}
        </section>
      )}

      {msg && <div className={`rounded-lg px-3 py-2 text-xs font-medium ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

      {caps.kind === 'MEMBER' && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          {caps.member?.mode === 'ALL' ? tx('You can see every unit your employer sees.', 'आपके मालिक को जो यूनिट दिखती हैं वे सब आपको दिखती हैं।') : tx('You see only the units your employer shows you.', 'आपको सिर्फ़ वही यूनिट दिखती हैं जो आपका मालिक दिखाता है।')}
          {' '}{caps.member?.price ? '' : tx('Rates are hidden for your account.', 'आपके अकाउंट के लिए रेट छुपे हैं।')}
        </p>
      )}

      {canManage && data && (
        <button type="button" onClick={() => setSheet({ kind: 'projvis' })} className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs hover:border-slate-900">
          <span><b className="block text-slate-900">{tx('Who sees this project’s units', 'इस प्रोजेक्ट की यूनिट किसे दिखती हैं')}</b>
            <span className="text-slate-600">{audLabel(data.project.vis, tx) || tx('All partners', 'सभी पार्टनर')} · {data.project.vis?.priceHidden ? tx('rates hidden', 'रेट छुपे') : tx('rates shown', 'रेट दिखते')} · {tx('a unit can override this', 'किसी यूनिट का अलग नियम हो सकता है')}</span></span>
          <Users className="h-4 w-4 shrink-0 text-slate-500" />
        </button>
      )}

      {showFilters && data && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 [&>*]:min-w-0">
            <input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder={tx('Search unit no. / code', 'यूनिट नंबर / कोड खोजें')} className={`${inp} col-span-2 sm:col-span-1`} />
            <select value={f.group} onChange={e => setF({ ...f, group: e.target.value })} className={inp}><option value="">{tx('All groups', 'सभी ग्रुप')}</option>{groupNames.map(g => <option key={g} value={g}>{g}</option>)}</select>
            <select value={f.config} onChange={e => setF({ ...f, config: e.target.value })} className={inp}><option value="">{tx('All types', 'सभी प्रकार')}</option>{configs.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={f.facing} onChange={e => setF({ ...f, facing: e.target.value })} className={inp}><option value="">{tx('Any facing', 'कोई भी दिशा')}</option>{FACINGS.filter(x => facingsIn.includes(x.id)).map(x => <option key={x.id} value={x.id}>{hi ? x.hi : x.en}</option>)}</select>
            <select value={f.road} onChange={e => setF({ ...f, road: e.target.value })} className={inp}><option value="">{tx('Any road sides', 'कितनी भी तरफ़ सड़क')}</option>{[1, 2, 3].filter(n => roadsIn.some(r => (n === 3 ? r >= 3 : r === n))).map(n => <option key={n} value={n}>{n === 3 ? tx('3 or more sides', '3 या ज़्यादा तरफ़') : roadSidesLabel(n, hi)}</option>)}</select>
            {seesPrice && <><input value={f.minL} onChange={e => setF({ ...f, minL: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" placeholder={tx('Min ₹ lakh', 'न्यूनतम ₹ लाख')} className={inp} />
              <input value={f.maxL} onChange={e => setF({ ...f, maxL: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" placeholder={tx('Max ₹ lakh', 'अधिकतम ₹ लाख')} className={inp} /></>}
            {canManage && <select value={f.vis} onChange={e => setF({ ...f, vis: e.target.value })} className={inp}><option value="">{tx('Any visibility', 'कोई भी दृश्यता')}</option><option value="HIDDEN">{tx('Hidden (only me)', 'छुपे (सिर्फ़ मैं)')}</option><option value="SELECTED">{tx('Chosen partners only', 'सिर्फ़ चुने पार्टनर')}</option><option value="PRICE">{tx('Rate hidden', 'रेट छुपा')}</option></select>}
          </div>
          {featsIn.length > 0 && <div className="flex flex-wrap gap-1.5">{featsIn.map(x => <Chip key={x.id} on={featF.includes(x.id)} onClick={() => setFeatF(featF.includes(x.id) ? featF.filter(y => y !== x.id) : [...featF, x.id])}>{hi ? x.hi : x.en}</Chip>)}</div>}
          {filtersOn && <button type="button" onClick={clearFilters} className={btnLine}><X className="h-4 w-4" />{tx('Clear filters', 'फ़िल्टर हटाएँ')}</button>}
        </div>
      )}

      {data && <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>{tx(`Showing ${filtered.length} of ${units.length}`, `${units.length} में से ${filtered.length} दिख रही हैं`)}</span>
        {selectMode && <span className="flex gap-1.5">
          <button type="button" onClick={() => setPicked(new Set(filtered.map(u => u.id)))} className={btnLine}>{tx('Select all shown', 'दिख रही सभी चुनें')}</button>
          {picked.size > 0 && <button type="button" onClick={() => setPicked(new Set())} className={btnLine}>{tx('Clear', 'हटाएँ')} ({picked.size})</button>}
        </span>}
      </div>}

      {data && units.length === 0 && !canManage && <p className="text-xs text-slate-500">{caps.kind === 'MEMBER' ? tx('Nothing has been shown to you yet.', 'अभी आपको कुछ दिखाया नहीं गया।') : tx('The builder has not created the unit grid for this project yet.', 'बिल्डर ने अभी इस प्रोजेक्ट का यूनिट ग्रिड नहीं बनाया है।')}</p>}
      {data && units.length > 0 && filtered.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">{tx('No unit matches these filters.', 'इन फ़िल्टर से कोई यूनिट नहीं मिली।')} <button type="button" onClick={clearFilters} className="font-semibold underline">{tx('Clear filters', 'फ़िल्टर हटाएँ')}</button></p>}

      {Object.entries(groups).map(([g, list]) => (
        <div key={g} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-800"><span>{g}</span><span className="font-normal text-slate-400">{list.length}</span></div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10">
            {list.map((u: any) => {
              const on = picked.has(u.id); const p = priceOf(u);
              const hiddenFromSome = canManage && (u.vis?.audience !== 'ALL' || u.vis?.priceHidden);
              return (
                <button key={u.id} type="button" aria-label={`${u.label} ${lbl(u.status)}`}
                  onClick={() => { if (selectMode) togglePick(u.id); else { setSel(u); setHold({ leadId: myLeads[0]?.id || '', tokenAmount: String(data.project.minToken), tokenRef: '' }); } }}
                  className={`relative min-h-[3.25rem] rounded-md border px-1 py-1.5 text-center text-[11px] font-semibold leading-tight ${COLORS[u.status]} ${u.mine ? 'ring-2 ring-slate-900' : ''} ${on ? 'ring-4 ring-blue-600' : ''}`}>
                  {selectMode && <span className={`absolute left-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[9px] ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-400 bg-white'}`}>{on ? '✓' : ''}</span>}
                  {hiddenFromSome && <EyeOff className="absolute right-0.5 top-0.5 h-3 w-3 text-slate-600" />}
                  {u.label}
                  <div className="text-[9px] font-normal opacity-80">{u.status === 'HOLD' ? left(u.hold?.expiresAt, hi) : p != null ? `${(p / 100000).toFixed(1)}L` : <span className="inline-flex items-center gap-0.5"><Lock className="h-2 w-2" />{tx('on request', 'पूछें')}</span>}</div>
                  {(u.roadSides || u.facing) && <div className="text-[9px] font-normal opacity-70">{u.roadSides ? tx(`${u.roadSides}-side`, `${u.roadSides} तरफ़`) : ''}{u.roadSides && u.facing ? ' · ' : ''}{fshort(u.facing)}</div>}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {selectMode && picked.size > 0 && (
        <div className="sticky bottom-2 z-30 space-y-1.5 rounded-xl border border-slate-900 bg-white p-2.5 shadow-xl">
          <div className="text-[11px] font-bold text-slate-800">{tx(`${picked.size} selected`, `${picked.size} चुने गए`)}{pickedFree.length !== picked.size ? ` · ${tx(`${pickedFree.length} available`, `${pickedFree.length} उपलब्ध`)}` : ''}</div>
          <div className="flex flex-wrap gap-1.5">
            {caps.canShare && <button type="button" onClick={() => pickedFree.length ? setSheet({ kind: 'share', ids: pickedFree.map(u => u.id) }) : flash(false, tx('Pick at least one available unit to send', 'भेजने के लिए कम से कम एक उपलब्ध यूनिट चुनें'))} className={btnDark}><Send className="h-4 w-4" />{tx('Send to customer', 'ग्राहक को भेजें')}</button>}
            {caps.canPost && <button type="button" onClick={() => pickedFree.length ? setSheet({ kind: 'post', ids: pickedFree.map(u => u.id) }) : flash(false, tx('Pick at least one available unit to show', 'दिखाने के लिए कम से कम एक उपलब्ध यूनिट चुनें'))} className={btnLine}><Users className="h-4 w-4" />{tx('Show to my team', 'मेरी टीम को दिखाएँ')}</button>}
            {canManage && <>
              <button type="button" onClick={() => setSheet({ kind: 'rate', ids: pickedUnits.map(u => u.id) })} className={btnLine}>₹ {tx('Change rate', 'रेट बदलें')}</button>
              <button type="button" onClick={() => setSheet({ kind: 'vis', ids: pickedUnits.map(u => u.id) })} className={btnLine}><Eye className="h-4 w-4" />{tx('Who sees', 'किसे दिखे')}</button>
              <button type="button" onClick={() => setSheet({ kind: 'facts', ids: pickedUnits.map(u => u.id) })} className={btnLine}><Compass className="h-4 w-4" />{tx('Road / facing / tags', 'सड़क / दिशा / टैग')}</button>
              <button type="button" onClick={() => setSheet({ kind: 'kind', ids: pickedUnits.map(u => u.id) })} className={btnLine} data-testid="bulk-set-kind">{tx('Set kind', 'प्रकार तय करें')}</button>
              <button type="button" disabled={busy} onClick={() => act(async () => { const r = await api.invBulk(pid, { unitIds: pickedUnits.map(u => u.id), action: 'STATUS', status: 'RESERVED' }); setPicked(new Set()); if (r.skipped) flash(true, tx(`${r.applied} reserved, ${r.skipped} skipped (held / booked)`, `${r.applied} रिज़र्व हुईं, ${r.skipped} छूटीं (होल्ड / बुक)`)); }, tx('Reserved', 'रिज़र्व हुईं'))} className={btnLine}>{tx('Reserve', 'रिज़र्व करें')}</button>
              <button type="button" disabled={busy} onClick={() => act(async () => { await api.invBulk(pid, { unitIds: pickedUnits.map(u => u.id), action: 'STATUS', status: 'AVAILABLE' }); setPicked(new Set()); }, tx('Made available', 'उपलब्ध हुईं'))} className={btnLine}>{tx('Make available', 'उपलब्ध करें')}</button>
            </>}
          </div>
        </div>
      )}

      {sel && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center" onClick={() => setSel(null)}>
          <div className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-white p-4 text-xs" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div><div className="text-sm font-bold">{sel.label} · {sel.group}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5"><span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white" data-testid="unit-kind">{kindLabel(unitKindOf(sel), hi)}</span>{sel.code ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700" data-testid="unit-code">{tx('Code', 'कोड')}: {sel.code}</span> : null}{sel.floor !== undefined && sel.floor !== null ? <span className="text-[10px] text-slate-500">{tx('Floor', 'फ़्लोर')} {sel.floor}</span> : null}</div>
                <div className="text-slate-500">{sel.config} {sel.areaSqft ? `· ${sel.areaSqft} ${tx('sq ft', 'वर्ग फ़ुट')}` : ''}{sel.dimensions ? ` · ${sel.dimensions}` : ''}</div></div>
              <button type="button" aria-label={tx('Close', 'बंद करें')} onClick={() => setSel(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-block rounded border px-2 py-0.5 ${COLORS[sel.status]}`}>{lbl(sel.status)}</span>
              <span className="text-base font-bold text-slate-900">{priceOf(sel) != null ? inr(priceOf(sel)) : tx('Price on request', 'कीमत पूछें')}</span>
              {priceOf(sel) != null && sel.ratePerSqft && <span className="text-slate-500">≈ {inr(sel.ratePerSqft)}/{tx('sq ft', 'वर्ग फ़ुट')}</span>}
            </div>
            {(sel.roadSides || sel.facing || sel.roadWidthFt || (sel.features || []).length > 0 || sel.note) && (
              <div className="space-y-1.5 rounded-lg bg-slate-50 p-2">
                <div className="flex flex-wrap gap-1.5">
                  {sel.roadSides ? <span className="rounded-full bg-white px-2 py-1 font-semibold ring-1 ring-slate-300">{roadSidesLabel(sel.roadSides, hi)}{sel.roadWidthFt ? ` · ${sel.roadWidthFt} ft` : ''}</span> : null}
                  {sel.facing ? <span className="rounded-full bg-white px-2 py-1 font-semibold ring-1 ring-slate-300">{facingLabel(sel.facing, hi)} {tx('facing', 'मुखी')}</span> : null}
                  {(sel.features || []).map((x: string) => <span key={x} className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-300">{featureLabel(x, hi)}</span>)}
                </div>
                {sel.note && <div className="text-slate-700">“{sel.note}”</div>}
              </div>
            )}
            {canManage && sel.vis && <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 p-2 text-slate-700"><Eye className="h-3.5 w-3.5" />{tx('Seen by:', 'किसे दिखता है:')} <b>{audLabel(sel.vis, tx)}</b>{sel.vis.priceHidden ? ` · ${tx('rate hidden', 'रेट छुपा')}` : ''}</div>}
            {sel.status === 'HOLD' && <div className="flex items-center gap-1 text-slate-600"><Timer className="h-3.5 w-3.5" /> {left(sel.hold?.expiresAt, hi)}{sel.hold?.customerName ? ` · ${sel.hold.customerName} (${sel.hold.brokerName}) · ${tx('token', 'टोकन')} ${inr(sel.hold.tokenAmount)} / ${sel.hold.tokenRef}` : ''}</div>}

            <div className="grid grid-cols-2 gap-2">
              {caps.canShare && sel.status === 'AVAILABLE' && <button type="button" onClick={() => setSheet({ kind: 'share', ids: [sel.id] })} className={btnDark}><Send className="h-4 w-4" />{tx('Send to customer', 'ग्राहक को भेजें')}</button>}
              {caps.canPost && sel.status === 'AVAILABLE' && <button type="button" onClick={() => setSheet({ kind: 'post', ids: [sel.id] })} className={btnLine}><Users className="h-4 w-4" />{tx('Show to my team', 'टीम को दिखाएँ')}</button>}
              <button type="button" onClick={async () => { const ok = await copyText(unitShareLine({ kind: sel.kind, label: sel.label, config: sel.config, areaSqft: sel.areaSqft, price: priceOf(sel), facing: sel.facing, roadSides: sel.roadSides, roadWidthFt: sel.roadWidthFt, dimensions: sel.dimensions, features: sel.features, note: sel.note }, sellFlags, hi)); flash(ok, ok ? tx('Details copied', 'जानकारी कॉपी हुई') : tx('Copy failed', 'कॉपी नहीं हुआ')); setSel(null); }} className={btnLine}><Copy className="h-4 w-4" />{tx('Copy details', 'जानकारी कॉपी करें')}</button>
              {canManage && <button type="button" onClick={() => setSheet({ kind: 'edit', unit: sel })} className={btnLine}><Pencil className="h-4 w-4" />{tx('Edit unit', 'यूनिट बदलें')}</button>}
              {canManage && <button type="button" onClick={() => setSheet({ kind: 'vis', ids: [sel.id] })} className={btnLine}><Eye className="h-4 w-4" />{tx('Who sees', 'किसे दिखे')}</button>}
              {canManage && sel.status === 'AVAILABLE' && <button type="button" onClick={() => setSheet({ kind: 'rate', ids: [sel.id] })} className={btnLine}>₹ {tx('Change rate', 'रेट बदलें')}</button>}
            </div>

            {sel.status === 'AVAILABLE' && caps.canHold && (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="font-semibold">{tx('Hold this unit for your customer', 'इस यूनिट को अपने ग्राहक के लिए होल्ड करें')} ({data.project.holdHours} {tx('hours', 'घंटे')})</div>
                <select value={hold.leadId} onChange={e => setHold({ ...hold, leadId: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-2">
                  {myLeads.length === 0 && <option value="">{tx('You have no open lead on this project', 'इस प्रोजेक्ट पर आपकी कोई ओपन लीड नहीं')}</option>}
                  {myLeads.map(l => <option key={l.id} value={l.id}>{l.name} · {t(`stage.${l.stage}`, l.stage)}</option>)}
                </select>
                <input value={hold.tokenAmount} onChange={e => setHold({ ...hold, tokenAmount: e.target.value })} inputMode="numeric" placeholder={tx(`Token (min ${inr(data.project.minToken)})`, `टोकन (न्यूनतम ${inr(data.project.minToken)})`)} className="w-full rounded border border-slate-300 px-2 py-2" />
                <input value={hold.tokenRef} onChange={e => setHold({ ...hold, tokenRef: e.target.value })} placeholder={tx('Builder receipt / UTR number', 'बिल्डर की रसीद / UTR नंबर')} className="w-full rounded border border-slate-300 px-2 py-2" />
                <p className="text-[10px] text-slate-500">{tx('Money does not go through GENZ — pay the token to the builder directly and enter the receipt/UTR here. While held, no other broker can take this unit.', 'पैसा GENZ से नहीं जाता — टोकन सीधे बिल्डर को दें और रसीद/UTR यहाँ लिखें। होल्ड के दौरान कोई दूसरा ब्रोकर यह यूनिट नहीं ले सकता।')}</p>
                <button type="button" disabled={busy || !hold.leadId} onClick={() => act(() => api.invHold(sel.id, { leadId: hold.leadId, tokenAmount: Number(hold.tokenAmount), tokenRef: hold.tokenRef }), tx('Unit held', 'यूनिट होल्ड हो गई'))} className="w-full rounded-lg bg-slate-900 py-2 font-semibold text-white disabled:opacity-50">{tx('Hold this unit', 'यह यूनिट होल्ड करें')}</button>
              </div>
            )}
            {sel.status === 'HOLD' && (sel.mine || canManage) && !sel.hold?.bookingId && sel.hold?.expiresAt !== null && (
              <button type="button" disabled={busy} onClick={() => act(() => api.invRelease(sel.id), tx('Hold released', 'होल्ड हटा दिया गया'))} className="w-full rounded-lg border border-slate-300 py-2 font-semibold">{tx('Release hold', 'होल्ड हटाएँ')}</button>
            )}
            {canManage && (sel.status === 'AVAILABLE' || sel.status === 'RESERVED') && (
              <button type="button" disabled={busy} onClick={() => act(() => api.invUnit(sel.id, { status: sel.status === 'AVAILABLE' ? 'RESERVED' : 'AVAILABLE' }), tx('Updated', 'अपडेट हो गया'))} className="w-full rounded-lg border border-violet-300 py-2 font-semibold text-violet-800">
                {sel.status === 'AVAILABLE' ? tx('Reserve for builder', 'बिल्डर के लिए रिज़र्व करें') : tx('Make available', 'उपलब्ध करें')}
              </button>
            )}
            {sel.status === 'BOOKED' && <p className="text-slate-500">{tx('Booking is approved in CRM.', 'बुकिंग CRM में स्वीकृत है।')}</p>}
          </div>
        </div>
      )}

      {sheet?.kind === 'rate' && <RateSheet pid={pid} unitIds={sheet.ids!} onClose={() => setSheet(null)} onDone={sheetDone} />}
      {sheet?.kind === 'vis' && <VisibilitySheet pid={pid} unitIds={sheet.ids!} onClose={() => setSheet(null)} onDone={sheetDone} />}
      {sheet?.kind === 'projvis' && <VisibilitySheet pid={pid} current={data?.project?.vis} onClose={() => setSheet(null)} onDone={sheetDone} />}
      {sheet?.kind === 'kind' && <KindSheet pid={pid} unitIds={sheet.ids!} onClose={() => setSheet(null)} onDone={sheetDone} />}
      {sheet?.kind === 'facts' && <FactsSheet pid={pid} unitIds={sheet.ids!} onClose={() => setSheet(null)} onDone={sheetDone} />}
      {sheet?.kind === 'edit' && <UnitEditSheet unit={sheet.unit} onClose={() => setSheet(null)} onDone={sheetDone} />}
      {sheet?.kind === 'share' && <ShareSheet pid={pid} projectName={projectName} units={units.filter(u => sheet.ids!.includes(u.id)).map(u => ({ ...u, price: priceOf(u) }))} caps={{ ...caps, seesPrice }} onClose={() => { setSheet(null); setRefresh(k => k + 1); }} />}
      {sheet?.kind === 'post' && <PostSheet pid={pid} units={units.filter(u => sheet.ids!.includes(u.id))} onClose={() => setSheet(null)} onDone={sheetDone} />}

      {showDocs && pid && <ProjectDocsCard role={role} projectId={pid} refreshKey={refresh} />}
      {data && (caps.canPost || (caps.kind === 'MEMBER' && caps.member?.mode === 'SHARED')) && <TeamBoardCard pid={pid} canPost={!!caps.canPost} refreshKey={refresh} onChanged={loadProject} />}
      {data && caps.canShare && <MyLinksCard refreshKey={refresh} />}

      {board && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold"><Trophy className="h-4 w-4 text-amber-500" /> {tx('Leaderboard', 'लीडरबोर्ड')}</div>
          {board.slabs.length > 0 && <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
            {board.slabs.map((s: any, i: number) => <span key={i} className="rounded-full bg-slate-100 px-2.5 py-1">{tx('Booking', 'बुकिंग')} {s.from}{s.to ? `–${s.to}` : '+'}: <b>{s.commissionPct}%</b>{s.reward ? ` + ${s.reward}` : ''}</span>)}
          </div>}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500"><tr><th className="py-1">#</th><th>{tx('Associate', 'एसोसिएट')}</th><th>{tx('Units', 'यूनिट')}</th><th>{tx('Points', 'पॉइंट')}</th>{role !== 'BROKER' && <th>{tx('Value', 'मूल्य')}</th>}<th>{tx('Slab now', 'अभी का स्लैब')}</th><th>{tx('Next', 'अगला')}</th></tr></thead>
              <tbody>
                {board.rows.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-slate-400">{tx('No approved bookings yet', 'अभी कोई स्वीकृत बुकिंग नहीं')}</td></tr>}
                {board.rows.map((r: any) => (
                  <tr key={r.brokerId} className={`border-t border-slate-100 ${r.you ? 'bg-amber-50 font-semibold' : ''}`}>
                    <td className="py-1.5">{r.rank}</td><td>{r.name}{r.you ? tx(' (you)', ' (आप)') : ''}</td><td>{r.units}</td><td>{r.points}</td>
                    {role !== 'BROKER' && <td>{inr(r.value)}</td>}
                    <td>{r.slabPct ? `${r.slabPct}%${r.reward ? ` · ${r.reward}` : ''}` : '—'}</td>
                    <td>{r.next ? tx(`${r.next.toGo} more → ${r.next.commissionPct}%${r.next.reward ? ` + ${r.next.reward}` : ''}`, `${r.next.toGo} और → ${r.next.commissionPct}%${r.next.reward ? ` + ${r.next.reward}` : ''}`) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-slate-400">{tx('Points = 100 per approved booking + 1 per ₹1 lakh. Slab commission applies only to future approvals; rewards (trip/coin) are given by the builder.', 'पॉइंट = प्रति स्वीकृत बुकिंग 100 + प्रति ₹1 लाख पर 1। स्लैब कमीशन केवल आगे की स्वीकृतियों पर लगता है; रिवॉर्ड (ट्रिप/सिक्का) बिल्डर खुद देता है।')}</p>
        </div>
      )}

      {canManage && data && <ImportCard pid={pid} onDone={sheetDone} />}

      {canManage && data && (
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-xs">
            <div className="text-sm font-bold">{tx('Add units — flats, penthouses, villas, plots, shops', 'यूनिट जोड़ें — फ़्लैट, पेंटहाउस, विला, प्लॉट, दुकान')}</div>
            <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
              <label className="col-span-2 block">{tx('What are you adding?', 'क्या जोड़ रहे हैं?')}
                <select value={gen.unitKind} onChange={e => setGen({ ...gen, unitKind: e.target.value as UnitKind })} className="mt-1 w-full rounded border border-slate-300 px-2 py-2" data-testid="gen-kind">
                  {UNIT_KINDS.map(k => <option key={k.id} value={k.id}>{hi ? k.hi : k.en}{k.floorWise ? ` — ${tx('floor × per floor', 'फ़्लोर × हर फ़्लोर पर')}` : ` — ${tx('numbered 1, 2, 3…', 'क्रम से 1, 2, 3…')}`}</option>)}
                </select></label>
              <input value={gen.group} onChange={e => setGen({ ...gen, group: e.target.value })} placeholder={tx('Block / tower / lane (Tower A, Phase 1)', 'ब्लॉक / टावर / लेन (टावर A, फ़ेज़ 1)')} className="rounded border border-slate-300 px-2 py-2" />
              <input value={gen.prefix} onChange={e => setGen({ ...gen, prefix: e.target.value })} placeholder={tx('Number prefix (A-)', 'नंबर प्रीफ़िक्स (A-)')} className="rounded border border-slate-300 px-2 py-2" />
              {isFloorWise(gen.unitKind) ? <input value={gen.startFloor} onChange={e => setGen({ ...gen, startFloor: e.target.value })} inputMode="numeric" placeholder={tx('First floor (0 = ground)', 'पहला फ़्लोर (0 = ग्राउंड)')} className="rounded border border-slate-300 px-2 py-2" /> : <span />}
              {isFloorWise(gen.unitKind) ? <input value={gen.floors} onChange={e => setGen({ ...gen, floors: e.target.value })} inputMode="numeric" placeholder={tx('How many floors', 'कितने फ़्लोर')} className="rounded border border-slate-300 px-2 py-2" /> : <span />}
              <input value={gen.perFloor} onChange={e => setGen({ ...gen, perFloor: e.target.value })} inputMode="numeric" placeholder={isFloorWise(gen.unitKind) ? tx('Units per floor', 'हर फ़्लोर पर यूनिट') : tx('How many units', 'कितनी यूनिट')} className="rounded border border-slate-300 px-2 py-2" />
              <input value={gen.config} onChange={e => setGen({ ...gen, config: e.target.value })} placeholder={tx('Type (2 BHK, 3 BHK, 4 BHK, 30x50…)', 'प्रकार (2 BHK, 3 BHK, 4 BHK, 30x50…)')} className="rounded border border-slate-300 px-2 py-2" />
              <input value={gen.areaSqft} onChange={e => setGen({ ...gen, areaSqft: e.target.value })} inputMode="decimal" placeholder={tx('Area sq ft', 'क्षेत्रफ़ल (वर्ग फ़ुट)')} className="rounded border border-slate-300 px-2 py-2" />
              <input value={gen.codePrefix} onChange={e => setGen({ ...gen, codePrefix: e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 10) })} placeholder={tx('Code prefix (GR → GR-0001)', 'कोड प्रीफ़िक्स (GR → GR-0001)')} className="rounded border border-slate-300 px-2 py-2" data-testid="gen-code" />
              <div className="col-span-2 flex flex-wrap items-center gap-1.5">
                <Chip on={!gen.byRate} onClick={() => setGen({ ...gen, byRate: false })}>{tx('Set price ₹', 'कीमत ₹ दें')}</Chip>
                <Chip on={gen.byRate} onClick={() => setGen({ ...gen, byRate: true })}>{tx('Set rate ₹ per sq ft', 'रेट ₹ प्रति वर्ग फ़ुट दें')}</Chip>
              </div>
              {gen.byRate
                ? <input value={gen.ratePerSqft} onChange={e => setGen({ ...gen, ratePerSqft: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" placeholder={tx('Rate ₹ per sq ft (needs the area)', 'रेट ₹ प्रति वर्ग फ़ुट (क्षेत्रफ़ल ज़रूरी)')} className="rounded border border-slate-300 px-2 py-2" data-testid="gen-rate" />
                : <input value={gen.basePrice} onChange={e => setGen({ ...gen, basePrice: e.target.value })} inputMode="numeric" placeholder={tx('Base price ₹', 'बेस कीमत ₹')} className="rounded border border-slate-300 px-2 py-2" />}
              {isFloorWise(gen.unitKind) ? <input value={gen.floorRise} onChange={e => setGen({ ...gen, floorRise: e.target.value })} inputMode="numeric" placeholder={tx('Price rise per floor ₹', 'हर फ़्लोर पर कीमत बढ़ोतरी ₹')} className="rounded border border-slate-300 px-2 py-2" /> : <span />}
              <select value={gen.roadSides} onChange={e => setGen({ ...gen, roadSides: e.target.value })} className="rounded border border-slate-300 px-2 py-2"><option value="">{tx('Road sides (optional)', 'कितनी तरफ़ सड़क (वैकल्पिक)')}</option>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{roadSidesLabel(n, hi)}</option>)}</select>
              <select value={gen.facing} onChange={e => setGen({ ...gen, facing: e.target.value })} className="rounded border border-slate-300 px-2 py-2"><option value="">{tx('Facing (optional)', 'दिशा (वैकल्पिक)')}</option>{FACINGS.map(x => <option key={x.id} value={x.id}>{hi ? x.hi : x.en}</option>)}</select>
              <input value={gen.roadWidthFt} onChange={e => setGen({ ...gen, roadWidthFt: e.target.value })} placeholder={tx('Road width ft', 'सड़क चौड़ाई फ़ुट')} className="rounded border border-slate-300 px-2 py-2" />
              <input value={gen.dimensions} onChange={e => setGen({ ...gen, dimensions: e.target.value })} placeholder={tx('Size (30 x 50 ft)', 'साइज़ (30 x 50 ft)')} className="rounded border border-slate-300 px-2 py-2" />
            </div>
            <FeaturePicker value={genFeats} onChange={setGenFeats} />
            <p className="text-[10px] text-slate-500">{tx('Make one kind at a time (e.g. 2 BHK flats of Tower A, then 3 BHK, then the penthouses, then the plots) — each gets its own number, code and rate. Facts and tags set here go on every unit created now; change one later with “Edit unit”, many with “Select units”.', 'एक बार में एक प्रकार बनाएँ (जैसे टावर A के 2 BHK, फिर 3 BHK, फिर पेंटहाउस, फिर प्लॉट) — हर एक का अपना नंबर, कोड और रेट होगा। यहाँ भरी जानकारी और टैग अभी बनने वाली हर यूनिट पर लगेंगे; बाद में एक को “Edit unit” से और कई को “Select units” से बदलें।')}</p>
            <button type="button" disabled={busy} onClick={() => act(() => api.invGenerate(pid, {
              unitKind: gen.unitKind, group: gen.group, prefix: gen.prefix, startFloor: gen.startFloor === '' ? 1 : Number(gen.startFloor), floors: Number(gen.floors) || 1, perFloor: Number(gen.perFloor), config: gen.config, areaSqft: gen.areaSqft ? Number(gen.areaSqft) : undefined,
              ...(gen.byRate ? { ratePerSqft: Number(gen.ratePerSqft) } : { basePrice: Number(gen.basePrice) }), floorRise: Number(gen.floorRise) || 0, ...(gen.codePrefix ? { codePrefix: gen.codePrefix } : {}),
              ...(gen.facing ? { facing: gen.facing } : {}), ...(gen.roadSides ? { roadSides: Number(gen.roadSides) } : {}), ...(gen.roadWidthFt ? { roadWidthFt: Number(gen.roadWidthFt) } : {}), ...(gen.dimensions ? { dimensions: gen.dimensions } : {}), ...(genFeats.length ? { features: genFeats } : {}),
            }), tx('Units created', 'यूनिट बन गईं'))} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white"><Plus className="h-4 w-4" /> {tx('Generate', 'बनाएँ')}</button>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-xs">
            <div className="text-sm font-bold">{tx('Hold window & escalator commission', 'होल्ड की अवधि और स्लैब-वार कमीशन')}</div>
            <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
              <label>{tx('Hold (hours)', 'होल्ड (घंटे)')}<input value={cfg.holdHours} onChange={e => setCfg({ ...cfg, holdHours: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-2 py-2" /></label>
              <label>{tx('Min token ₹', 'न्यूनतम टोकन ₹')}<input value={cfg.minToken} onChange={e => setCfg({ ...cfg, minToken: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-2 py-2" /></label>
            </div>
            {slabs.map((s, i) => (
              <div key={i} className="grid grid-cols-[2.5rem_2.5rem_3.5rem_minmax(0,1fr)_1.5rem] items-center gap-1 [&>*]:min-w-0">
                <input value={s.from} onChange={e => setSlabs(slabs.map((x, j) => j === i ? { ...x, from: e.target.value } : x))} className="rounded border border-slate-300 px-1 py-1.5" title={tx('from booking', 'इस बुकिंग से')} />
                <input value={s.to} onChange={e => setSlabs(slabs.map((x, j) => j === i ? { ...x, to: e.target.value } : x))} placeholder="∞" className="rounded border border-slate-300 px-1 py-1.5" title={tx('to booking', 'इस बुकिंग तक')} />
                <input value={s.commissionPct} onChange={e => setSlabs(slabs.map((x, j) => j === i ? { ...x, commissionPct: e.target.value } : x))} className="rounded border border-slate-300 px-1 py-1.5" title={tx('commission %', 'कमीशन %')} />
                <input value={s.reward || ''} onChange={e => setSlabs(slabs.map((x, j) => j === i ? { ...x, reward: e.target.value } : x))} placeholder={tx('Reward (trip, gold coin)', 'इनाम (ट्रिप, सोने का सिक्का)')} className="rounded border border-slate-300 px-1 py-1.5" />
                <button type="button" aria-label={tx('Remove slab', 'स्लैब हटाएँ')} onClick={() => setSlabs(slabs.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5 text-slate-400" /></button>
              </div>
            ))}
            <div className="flex gap-2">
              <button type="button" onClick={() => { const last = slabs[slabs.length - 1]; setSlabs([...slabs, { from: last ? Number(last.to || last.from) + 1 : 1, to: '', commissionPct: 2.5, reward: '' }]); }} className="rounded border border-slate-300 px-2.5 py-1.5">{tx('+ Slab', '+ स्लैब')}</button>
              <button type="button" disabled={busy} onClick={() => act(() => api.invSettings(pid, { holdHours: Number(cfg.holdHours), minToken: Number(cfg.minToken), cpSlabs: slabs.map(s => ({ from: Number(s.from), to: s.to === '' || s.to == null ? null : Number(s.to), commissionPct: Number(s.commissionPct), reward: s.reward || undefined })) }), tx('Settings saved', 'सेटिंग्स सेव हो गईं'))} className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white">{tx('Save', 'सेव करें')}</button>
            </div>
            <p className="text-[10px] text-slate-500">{tx('A slab applies to the associate’s n-th approved booking (columns: from, to, %, reward). With no slab, the mandate’s agreed % applies. Affects future approvals only.', 'स्लैब एसोसिएट की n-वीं स्वीकृत बुकिंग पर लगता है (कॉलम: from, to, %, reward)। स्लैब न हो तो मैंडेट का तय % लगता है। केवल आगे की स्वीकृतियों पर असर।')}</p>
          </div>
        </div>
      )}
    </div>
  );
};
