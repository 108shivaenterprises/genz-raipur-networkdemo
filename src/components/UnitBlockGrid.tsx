import React, { useEffect, useState } from 'react';
import { Building, CheckCircle2, Hourglass, LayoutGrid, List, Loader2, Lock, EyeOff, Timer } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { Sheet, Err, useBusy, inp, btnDark } from './CrmPlus.js';
import { canBlock, clock, floorLabel, holdElapsed, holdLeftMs, holdTone, isTower, statusCounts, tokenChips, towerRows, type HoldTone } from '../shared/blockGridRules.js';

/**
 * v108 — the unit grid as a building and a block as a clock.
 *   TowerGrid    a tower × floor picture (top floor first) with a little status bar; plots / villas keep the plain grid
 *   UnitCell     one unit: colour = status, a ticking clock on a blocked unit
 *   BlockStrip   "my blocks · 2 of 3" — every unit I have blocked (the builder: every unit on hold) with its clock
 *   HoldClock    the big clock in a unit's drawer
 *   BlockSheet   block a unit for a customer in one short sheet: customer chips, token chips, receipt / UTR — a record, never a payment
 */

export const COLORS: Record<string, string> = {
  AVAILABLE: 'bg-emerald-100 border-emerald-400 text-emerald-900',
  HOLD: 'bg-amber-100 border-amber-400 text-amber-900',
  BOOKED: 'bg-red-100 border-red-400 text-red-900',
  RESERVED: 'bg-violet-100 border-violet-400 text-violet-900',
};
const BAR: Record<string, string> = { AVAILABLE: 'bg-emerald-400', HOLD: 'bg-amber-400', BOOKED: 'bg-red-400', RESERVED: 'bg-violet-400' };
const TONE_CELL: Record<HoldTone, string> = {
  ok: 'bg-amber-100 border-amber-400 text-amber-900', soon: 'bg-amber-200 border-amber-500 text-amber-950', late: 'bg-red-100 border-red-500 text-red-900 animate-pulse',
  gone: 'bg-emerald-100 border-emerald-400 text-emerald-900', pending: 'bg-sky-100 border-sky-400 text-sky-900',
};
const TONE_TEXT: Record<HoldTone, string> = { ok: 'text-amber-800', soon: 'text-amber-900', late: 'text-red-700', gone: 'text-emerald-700', pending: 'text-sky-800' };
const fshort = (id?: string) => (id ? id.split('_').map(w => w[0]).join('') : '');
const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');

/** a clock that ticks only while something on the screen needs it */
export function useNow(active: boolean, ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

/** the grid kind is remembered per device */
export const useGridView = () => {
  const [view, setView] = useState<'plan' | 'compact'>(() => { try { return localStorage.getItem('genz.inv.view') === 'compact' ? 'compact' : 'plan'; } catch { return 'plan'; } });
  const set = (v: 'plan' | 'compact') => { setView(v); try { localStorage.setItem('genz.inv.view', v); } catch { /* optional */ } };
  return [view, set] as const;
};

export const ViewToggle: React.FC<{ view: 'plan' | 'compact'; onChange: (v: 'plan' | 'compact') => void }> = ({ view, onChange }) => {
  const tx = useTx();
  const b = (v: 'plan' | 'compact', icon: React.ReactNode, label: string) => (
    <button type="button" onClick={() => onChange(v)} aria-pressed={view === v} data-testid={`view-${v}`}
      className={`inline-flex min-h-9 items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold ${view === v ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>{icon}{label}</button>
  );
  return <div className="inline-flex overflow-hidden rounded-lg border border-slate-300" role="group" aria-label={tx('Grid view', 'ग्रिड का रूप')}>
    {b('plan', <Building className="h-3.5 w-3.5" />, tx('Plan', 'प्लान'))}{b('compact', <LayoutGrid className="h-3.5 w-3.5" />, tx('Compact', 'कॉम्पैक्ट'))}
  </div>;
};

// ───────────────────────── one unit ─────────────────────────
export const UnitCell: React.FC<{
  u: any; now: number; price: number | null; selectMode: boolean; picked: boolean; hiddenFromSome: boolean; tower?: boolean; onTap: () => void; statusLabel: string;
}> = ({ u, now, price, selectMode, picked, hiddenFromSome, tower, onTap, statusLabel }) => {
  const tx = useTx();
  const held = u.status === 'HOLD';
  const tone = held ? holdTone(u.hold?.expiresAt, now) : 'ok';
  const color = held ? TONE_CELL[tone] : COLORS[u.status];
  const sub = held
    ? (u.hold?.expiresAt ? <span className="inline-flex items-center gap-0.5 font-bold tabular-nums"><Timer className="h-2.5 w-2.5" />{clock(holdLeftMs(u.hold.expiresAt, now))}</span> : <span className="inline-flex items-center gap-0.5"><Hourglass className="h-2.5 w-2.5" />{tx('booking', 'बुकिंग')}</span>)
    : price != null ? `${(price / 100000).toFixed(1)}L` : <span className="inline-flex items-center gap-0.5"><Lock className="h-2 w-2" />{tx('on request', 'पूछें')}</span>;
  return (
    <button type="button" aria-label={`${u.label} ${statusLabel}`} onClick={onTap} data-testid="unit-cell" data-status={u.status}
      className={`relative min-h-[3.25rem] rounded-md border px-1 py-1.5 text-center text-[11px] font-semibold leading-tight ${color} ${u.mine ? 'ring-2 ring-slate-900' : ''} ${picked ? 'ring-4 ring-blue-600' : ''}`}>
      {selectMode && <span className={`absolute left-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[9px] ${picked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-400 bg-white'}`}>{picked ? '✓' : ''}</span>}
      {hiddenFromSome && <EyeOff className="absolute right-0.5 top-0.5 h-3 w-3 text-slate-600" />}
      {u.label}
      <div className="text-[9px] font-normal opacity-90">{sub}</div>
      {!tower && (u.roadSides || u.facing) && <div className="text-[9px] font-normal opacity-70">{u.roadSides ? tx(`${u.roadSides}-side`, `${u.roadSides} तरफ़`) : ''}{u.roadSides && u.facing ? ' · ' : ''}{fshort(u.facing)}</div>}
    </button>
  );
};

/** a thin stacked bar: how the tower's units are spread over the four statuses */
const StatusBar: React.FC<{ list: any[] }> = ({ list }) => {
  const c = statusCounts(list); const n = Math.max(1, list.length);
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={Object.entries(c).map(([k, v]) => `${k} ${v}`).join(', ')}>
      {(['AVAILABLE', 'HOLD', 'RESERVED', 'BOOKED'] as const).map(k => c[k] ? <div key={k} className={BAR[k]} style={{ width: `${(c[k] / n) * 100}%` }} /> : null)}
    </div>
  );
};

/** one group of units: a tower (floors as rows) when it is one, else the plain grid */
export const GroupBlock: React.FC<{ name: string; list: any[]; view: 'plan' | 'compact'; renderCell: (u: any, tower: boolean) => React.ReactNode }> = ({ name, list, view, renderCell }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const free = list.filter(u => u.status === 'AVAILABLE').length;
  const tower = view === 'plan' && isTower(list);
  const t = tower ? towerRows(list) : null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3" data-testid={tower ? 'tower' : 'group'}>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-bold text-slate-800">
        <span className="flex min-w-0 items-center gap-1.5 truncate">{tower && <Building className="h-3.5 w-3.5 shrink-0 text-slate-500" />}{name}</span>
        <span className="shrink-0 font-normal text-slate-500">{tx(`${free} free of ${list.length}`, `${list.length} में ${free} खाली`)}</span>
      </div>
      <div className="mb-2"><StatusBar list={list} /></div>
      {t ? (
        <div className="overflow-x-auto pb-1">
          <div className="space-y-1.5" style={{ minWidth: `${Math.min(t.cols, 8) * 3.6 + 2}rem` }}>
            {t.rows.map(r => (
              <div key={r.floor} className="flex items-stretch gap-1.5" data-testid="tower-row">
                <div className="flex w-7 shrink-0 flex-col items-center justify-center rounded bg-slate-100 text-[10px] font-bold leading-none text-slate-500" title={tx(`Floor ${r.floor}`, `फ़्लोर ${r.floor}`)}>{floorLabel(r.floor, hi)}<span className="mt-0.5 text-[7px] font-normal">{tx('floor', 'फ़्लोर')}</span></div>
                <div className="grid flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${t.cols}, minmax(3.4rem, 1fr))` }}>{r.units.map(u => <React.Fragment key={u.id}>{renderCell(u, true)}</React.Fragment>)}</div>
              </div>
            ))}
            {t.noFloor.length > 0 && (
              <div className="flex items-stretch gap-1.5"><div className="flex w-7 shrink-0 items-center justify-center rounded bg-slate-50 text-[10px] font-bold text-slate-400">—</div>
                <div className="grid flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${t.cols}, minmax(3.4rem, 1fr))` }}>{t.noFloor.map(u => <React.Fragment key={u.id}>{renderCell(u, true)}</React.Fragment>)}</div></div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10">{list.map(u => <React.Fragment key={u.id}>{renderCell(u, false)}</React.Fragment>)}</div>
      )}
    </div>
  );
};

// ───────────────────────── my blocks ─────────────────────────
export const BlockStrip: React.FC<{ units: any[]; now: number; canManage: boolean; holds?: { used: number; max: number }; onOpen: (u: any) => void }> = ({ units, now, canManage, holds, onOpen }) => {
  const tx = useTx();
  const list = units.filter(u => u.status === 'HOLD' && u.hold && (u.mine || canManage)).sort((a, b) => (Date.parse(a.hold.expiresAt || '') || Infinity) - (Date.parse(b.hold.expiresAt || '') || Infinity));
  if (!list.length && !(holds && holds.used > 0)) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3" data-testid="block-strip">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-bold text-slate-800">
        <span className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5 text-slate-500" />{canManage ? tx('On hold now', 'अभी होल्ड पर') : tx('My blocks', 'मेरे ब्लॉक')}</span>
        {holds && <span className={`rounded-full px-2 py-0.5 text-[10px] ${holds.used >= holds.max ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`} data-testid="holds-used">{tx(`${holds.used} of ${holds.max} used`, `${holds.max} में से ${holds.used} इस्तेमाल`)}</span>}
      </div>
      {list.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {list.map(u => {
            const tone = holdTone(u.hold.expiresAt, now);
            return (
              <button key={u.id} type="button" onClick={() => onOpen(u)} data-testid="block-chip" className={`min-w-[8.5rem] shrink-0 rounded-lg border px-2.5 py-2 text-left ${TONE_CELL[tone]}`}>
                <div className="flex items-center justify-between gap-2 text-xs font-bold"><span>{u.label}</span><span className="tabular-nums">{u.hold.expiresAt ? clock(holdLeftMs(u.hold.expiresAt, now)) : tx('booking', 'बुकिंग')}</span></div>
                <div className="truncate text-[10px] opacity-80">{u.hold.customerName || '—'}{canManage && u.hold.brokerName ? ` · ${u.hold.brokerName}` : ''}</div>
              </button>
            );
          })}
        </div>
      ) : <p className="text-[11px] text-slate-500">{tx('Your blocks are on other projects.', 'आपके ब्लॉक दूसरे प्रोजेक्ट पर हैं।')}</p>}
    </section>
  );
};

// ───────────────────────── the clock in a unit's drawer ─────────────────────────
export const HoldClock: React.FC<{ hold: any; now: number; mineOrOwner: boolean; hours: number }> = ({ hold, now, mineOrOwner, hours }) => {
  const tx = useTx();
  const tone = holdTone(hold?.expiresAt, now);
  const pct = Math.round(holdElapsed(hold?.at, hold?.expiresAt, now) * 100);
  return (
    <div className={`space-y-1.5 rounded-xl border px-3 py-2.5 ${TONE_CELL[tone].replace(' animate-pulse', '')}`} data-testid="hold-clock">
      {hold?.expiresAt ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-[11px] font-semibold"><Timer className="h-3.5 w-3.5" />{mineOrOwner ? tx('Block ends in', 'ब्लॉक ख़त्म होने में') : tx('Held — free again in', 'होल्ड — फिर खाली होगी')}</span>
            <span className={`text-2xl font-extrabold tabular-nums ${TONE_TEXT[tone]}`} data-testid="hold-left">{clock(holdLeftMs(hold.expiresAt, now))}</span>
          </div>
          {hold.at && <div className="h-1.5 overflow-hidden rounded-full bg-white/60"><div className={`h-full ${tone === 'late' ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} /></div>}
          <p className="text-[10px] opacity-80">{tx(`A block lasts ${hours} h. If no booking request is raised in the CRM before it ends, the unit goes back to everyone.`, `ब्लॉक ${hours} घंटे का होता है। ख़त्म होने से पहले CRM में बुकिंग रिक्वेस्ट न गई तो यूनिट सबके लिए वापस खाली हो जाती है।`)}</p>
        </>
      ) : (
        <div className="flex items-center gap-1.5 text-xs font-semibold"><Hourglass className="h-4 w-4" />{tx('A booking request is with the builder — the unit stays blocked until he decides.', 'बुकिंग रिक्वेस्ट बिल्डर के पास है — उनके फ़ैसले तक यूनिट ब्लॉक रहेगी।')}</div>
      )}
      {mineOrOwner && hold?.customerName && <div className="text-[11px]">{hold.customerName}{hold.brokerName ? ` (${hold.brokerName})` : ''} · {tx('token', 'टोकन')} {inr(hold.tokenAmount)} · {tx('receipt', 'रसीद')} {hold.tokenRef}</div>}
    </div>
  );
};

// ───────────────────────── block a unit ─────────────────────────
export const BlockSheet: React.FC<{
  unit: any; project: { minToken: number; holdHours: number }; projectName: string; leads: any[]; busyLeadIds: Set<string>; holds?: { used: number; max: number };
  onClose: () => void;
}> = ({ unit, project, projectName, leads, busyLeadIds, holds, onClose }) => {
  const tx = useTx();
  const { busy, err, go } = useBusy();
  const firstFree = leads.find(l => !busyLeadIds.has(l.id));
  const [leadId, setLeadId] = useState(firstFree?.id || '');
  const [token, setToken] = useState(String(project.minToken));
  const [ref, setRef] = useState('');
  const [made, setMade] = useState<any>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!made) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [made]);
  const chk = canBlock({ status: unit.status, canHold: true, used: holds?.used ?? 0, max: holds?.max ?? 3, leads: leads.length });
  const amount = Number(token.replace(/[^\d]/g, ''));
  const problem = !leadId ? tx('Pick the customer', 'ग्राहक चुनें') : !(amount >= project.minToken) ? tx(`Token must be at least ${inr(project.minToken)}`, `टोकन कम से कम ${inr(project.minToken)} हो`) : ref.trim().length < 4 ? tx('Enter the receipt / UTR number the builder gave', 'बिल्डर की दी रसीद / UTR नंबर लिखें') : '';
  const lead = leads.find(l => l.id === leadId);

  if (made) {
    const exp = made.hold?.expiresAt as string | undefined;
    return (
      <Sheet title={tx('Unit blocked', 'यूनिट ब्लॉक हो गई')} onClose={onClose}>
        <div className="space-y-3 text-center text-xs" data-testid="block-done">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <p className="text-sm font-bold text-slate-900">{unit.label} · {tx('blocked for', 'ब्लॉक किसके लिए')} {lead?.name || made.hold?.customerName}</p>
          {exp && <div className="rounded-xl bg-amber-50 px-3 py-3"><div className="text-[11px] font-semibold text-amber-900">{tx('Time to raise the booking request', 'बुकिंग रिक्वेस्ट भेजने का समय')}</div><div className="text-3xl font-extrabold tabular-nums text-amber-900">{clock(holdLeftMs(exp, now))}</div></div>}
          <p className="text-slate-600">{tx('Now send the booking request from the CRM (customer → Booking). If it is not raised before the clock ends, the unit goes back to everyone. The builder has been told.', 'अब CRM से बुकिंग रिक्वेस्ट भेजें (ग्राहक → बुकिंग)। घड़ी ख़त्म होने से पहले न भेजी तो यूनिट सबके लिए वापस खाली हो जाएगी। बिल्डर को बता दिया गया है।')}</p>
          <button type="button" onClick={onClose} className={`${btnDark} w-full`}>{tx('Done', 'ठीक है')}</button>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet title={`${tx('Block', 'ब्लॉक')} ${unit.label} · ${projectName}`} onClose={onClose}>
      <div className="space-y-3 text-xs" data-testid="block-sheet">
        {!chk.ok ? <p className="rounded-lg bg-amber-50 px-3 py-2 font-medium text-amber-900" data-testid="block-refused">{tx(chk.reason!.en, chk.reason!.hi)}</p> : (
          <>
            <div>
              <div className="mb-1.5 font-bold text-slate-800">{tx('1 · For which customer?', '1 · किस ग्राहक के लिए?')}</div>
              <div className="flex flex-wrap gap-1.5">
                {leads.map(l => {
                  const off = busyLeadIds.has(l.id);
                  return <button key={l.id} type="button" disabled={off} onClick={() => setLeadId(l.id)} aria-pressed={leadId === l.id} data-testid="block-lead"
                    className={`rounded-full border px-3 py-1.5 font-semibold ${leadId === l.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-800'} disabled:opacity-40`}>{l.name}{off ? ` · ${tx('has a block', 'का ब्लॉक है')}` : ''}</button>;
                })}
              </div>
            </div>
            <div>
              <div className="mb-1.5 font-bold text-slate-800">{tx('2 · Token paid to the builder', '2 · बिल्डर को दिया टोकन')}</div>
              <div className="flex flex-wrap gap-1.5">
                {tokenChips(project.minToken).map(n => <button key={n} type="button" onClick={() => setToken(String(n))} aria-pressed={amount === n} className={`rounded-full border px-3 py-1.5 font-semibold ${amount === n ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-800'}`}>{inr(n)}{n === project.minToken ? ` (${tx('min', 'न्यूनतम')})` : ''}</button>)}
              </div>
              <input value={token} onChange={e => setToken(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" className={`${inp} mt-1.5`} aria-label={tx('Token amount', 'टोकन राशि')} data-testid="block-token" />
            </div>
            <div>
              <div className="mb-1.5 font-bold text-slate-800">{tx('3 · Builder’s receipt / UTR number', '3 · बिल्डर की रसीद / UTR नंबर')}</div>
              <input value={ref} onChange={e => setRef(e.target.value)} maxLength={40} className={inp} placeholder={tx('e.g. UTR 4123 …', 'जैसे UTR 4123 …')} data-testid="block-ref" />
            </div>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">{tx(`Money does not go through GENZ — pay the builder directly and record the receipt here. The unit is blocked for ${project.holdHours} h; no other broker can take it meanwhile. You use ${holds ? holds.used + 1 : 1} of ${holds?.max ?? 3} blocks.`, `पैसा GENZ से नहीं जाता — बिल्डर को सीधे दें और रसीद यहाँ दर्ज करें। यूनिट ${project.holdHours} घंटे ब्लॉक रहती है; इस दौरान कोई दूसरा ब्रोकर नहीं ले सकता। आप ${holds?.max ?? 3} में से ${holds ? holds.used + 1 : 1} ब्लॉक इस्तेमाल करेंगे।`)}</p>
            <Err msg={err} />
            <button type="button" disabled={busy || !!problem} data-testid="block-go" className={`${btnDark} w-full`}
              onClick={() => go(async () => { const r: any = await api.invHold(unit.id, { leadId, tokenAmount: amount, tokenRef: ref.trim() }); setMade(r.unit || { hold: { expiresAt: new Date(Date.now() + project.holdHours * 3600_000).toISOString() } }); }, () => { /* shown above */ })}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Timer className="h-4 w-4" />}{tx(`Block for ${project.holdHours} h`, `${project.holdHours} घंटे के लिए ब्लॉक करें`)}
            </button>
            {problem && <p className="text-center text-[11px] text-slate-500">{problem}</p>}
          </>
        )}
      </div>
    </Sheet>
  );
};

export { List };
