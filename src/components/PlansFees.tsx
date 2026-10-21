import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, IndianRupee, Plus, Pencil, AlertTriangle, Lock, Unlock, Users, Calculator, Receipt, BadgeCheck, X, Search } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { stateNames } from '../shared/india.js';
import {
  PAYER_SEGMENTS, FEE_EVENTS, GATES, WARNINGS, ruleWarnings, planWarnings, segmentInfo, eventInfo, gateInfo,
  type PayerSegment, type FeeEvent, type GateKey, type BillingWarning, type BenefitType,
} from '../shared/billingRules.js';

/** v23 — Plans & Fees: GENZ admins set fee rules, membership plans and member-only features; payers see what applies to them. */

const inp = 'min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
const btn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-40';
const dark = `${btn} bg-slate-900 text-white`; const ghost = `${btn} border border-slate-300 bg-white text-slate-700`;
const green = `${btn} bg-emerald-600 text-white`; const red = `${btn} border border-red-300 bg-white text-red-700`;
const card = 'rounded-xl border border-slate-200 bg-white p-4';
const lbl = 'block text-xs font-semibold text-slate-700';
const inr = (n?: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const d0 = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const todayIst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const ping = () => { try { window.dispatchEvent(new Event('genz:billing-changed')); } catch { /* old browser */ } };
const num = (v: string) => v.replace(/[^\d.]/g, '');

function useToast() {
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const say = (ok: boolean, msg: string) => { setToast({ ok, msg }); window.setTimeout(() => setToast(null), 6000); };
  const view = toast && <div role="status" className={`rounded-lg p-3 text-sm ${toast.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{toast.msg}</div>;
  return { say, view };
}
const useLang = () => useI18n().lang as 'en' | 'hi';

const STATUS: Record<string, [string, string, string]> = {
  DUE: ['Due', 'देय', 'bg-amber-100 text-amber-800'], MARKED_PAID: ['Paid — GENZ to confirm', 'भुगतान किया — GENZ पक्का करेगा', 'bg-sky-100 text-sky-800'],
  CONFIRMED: ['Received', 'मिल गया', 'bg-emerald-100 text-emerald-800'], REJECTED: ['Payment not found', 'भुगतान नहीं मिला', 'bg-red-100 text-red-800'],
  WAIVED: ['Waived / free', 'माफ़ / मुफ़्त', 'bg-slate-100 text-slate-600'], CANCELLED: ['Cancelled', 'रद्द', 'bg-slate-100 text-slate-500'],
};
const Chip: React.FC<{ s: string }> = ({ s }) => { const tx = useTx(); const x = STATUS[s] || [s, s, 'bg-slate-100']; return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${x[2]}`}>{tx(x[0], x[1])}</span>; };

// ───────────────────────────── small pickers ─────────────────────────────
const SegmentChecks: React.FC<{ value: PayerSegment[]; onChange: (v: PayerSegment[]) => void; allowed?: PayerSegment[] }> = ({ value, onChange, allowed }) => {
  const tx = useTx();
  const list = PAYER_SEGMENTS.filter(s => !allowed || allowed.includes(s.id));
  return (
    <div className="grid gap-1 sm:grid-cols-2">
      {list.map(s => (
        <label key={s.id} className="flex min-h-10 items-start gap-2 rounded-lg border border-slate-200 p-2 text-xs">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={value.includes(s.id)} onChange={() => onChange(value.includes(s.id) ? value.filter(x => x !== s.id) : [...value, s.id])} />
          <span><span className="font-semibold text-slate-800">{tx(s.en, s.hi)}</span><span className="block text-slate-500">{tx(s.hintEn, s.hintHi)}</span></span>
        </label>
      ))}
    </div>
  );
};
const StatePicker: React.FC<{ value: string[]; onChange: (v: string[]) => void }> = ({ value, onChange }) => {
  const tx = useTx();
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">{value.length === 0 && <span className="text-xs text-slate-500">{tx('All states', 'सभी राज्य')}</span>}{value.map(s => <button key={s} type="button" className="rounded-full bg-slate-900 px-2.5 py-1 text-xs text-white" onClick={() => onChange(value.filter(x => x !== s))}>{s} ×</button>)}</div>
      <select className={`${inp} mt-2 max-w-xs`} value="" onChange={e => { const v = e.target.value; if (v && !value.includes(v)) onChange([...value, v]); }} aria-label={tx('Add a state', 'राज्य जोड़ें')}>
        <option value="">{tx('Limit to a state…', 'किसी राज्य तक सीमित…')}</option>
        {stateNames().filter(s => !value.includes(s)).map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
};
const PeoplePicker: React.FC<{ value: string[]; onChange: (v: string[]) => void; names: Record<string, string>; onName: (id: string, name: string) => void; placeholder: string; testid?: string }> = ({ value, onChange, names, onName, placeholder, testid }) => {
  const tx = useTx(); const [q, setQ] = useState(''); const [hits, setHits] = useState<any[]>([]);
  useEffect(() => { if (q.trim().length < 2) { setHits([]); return; } const t = window.setTimeout(() => api.billingPeople(q).then(r => setHits(r.people || [])).catch(() => setHits([])), 250); return () => window.clearTimeout(t); }, [q]);
  return (
    <div data-testid={testid}>
      <div className="flex flex-wrap gap-1.5">{value.map(id => <button key={id} type="button" className="rounded-full bg-slate-200 px-2.5 py-1 text-xs text-slate-800" onClick={() => onChange(value.filter(x => x !== id))}>{names[id] || id} ×</button>)}</div>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
        <input className={`${inp} pl-9`} placeholder={placeholder} value={q} onChange={e => setQ(e.target.value)} />
        {hits.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow">
            {hits.map(h => <button key={h.id} type="button" className="block w-full px-3 py-2 text-left text-xs hover:bg-slate-50" onClick={() => { if (!value.includes(h.id)) onChange([...value, h.id]); onName(h.id, h.company ? `${h.name} — ${h.company}` : h.name); setQ(''); setHits([]); }}>
              <span className="font-semibold">{h.name}</span> {h.company && <span className="text-slate-500">{h.company}</span>} <span className="text-slate-400">· {h.city} · {tx(segmentInfo(h.segment)?.en || '', segmentInfo(h.segment)?.hi || '')}</span>
            </button>)}
          </div>
        )}
      </div>
    </div>
  );
};
interface Tgt { segments: PayerSegment[]; states: string[]; includeUserIds: string[]; excludeUserIds: string[] }
const TargetingEditor: React.FC<{ t: Tgt; set: (t: Tgt) => void; allowed?: PayerSegment[]; names: Record<string, string>; onName: (id: string, n: string) => void }> = ({ t, set, allowed, names, onName }) => {
  const tx = useTx();
  return (
    <div className="space-y-3">
      <div><div className={lbl}>{tx('Who it applies to', 'किस पर लागू')}</div><div className="mt-1"><SegmentChecks value={t.segments} onChange={segments => set({ ...t, segments })} allowed={allowed} /></div></div>
      <div><div className={lbl}>{tx('States', 'राज्य')}</div><div className="mt-1"><StatePicker value={t.states} onChange={states => set({ ...t, states })} /></div></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><div className={lbl}>{tx('Only these people (leave empty for everyone in the groups)', 'सिर्फ़ ये लोग (समूह के सब पर लागू करने के लिए ख़ाली छोड़ें)')}</div><div className="mt-1"><PeoplePicker value={t.includeUserIds} onChange={includeUserIds => set({ ...t, includeUserIds })} names={names} onName={onName} placeholder={tx('Search name / firm', 'नाम / फ़र्म खोजें')} testid="pick-include" /></div></div>
        <div><div className={lbl}>{tx('Never these people', 'इन पर कभी नहीं')}</div><div className="mt-1"><PeoplePicker value={t.excludeUserIds} onChange={excludeUserIds => set({ ...t, excludeUserIds })} names={names} onName={onName} placeholder={tx('Search name / firm', 'नाम / फ़र्म खोजें')} testid="pick-exclude" /></div></div>
      </div>
    </div>
  );
};
const WarningsAck: React.FC<{ warnings: BillingWarning[]; ack: string[]; setAck: (a: string[]) => void }> = ({ warnings, ack, setAck }) => {
  const tx = useTx(); if (!warnings.length) return null;
  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3" data-testid="billing-warnings">
      {warnings.map(w => (
        <label key={w} className="flex items-start gap-2 text-xs text-amber-900">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={ack.includes(w)} onChange={() => setAck(ack.includes(w) ? ack.filter(x => x !== w) : [...ack, w])} />
          <span><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{tx(WARNINGS[w].en, WARNINGS[w].hi)} <strong>{tx('I understand.', 'मैं समझता/समझती हूँ।')}</strong></span>
        </label>
      ))}
    </div>
  );
};

// ───────────────────────────── rule editor ─────────────────────────────
const RuleEditor: React.FC<{ rule?: any; names: Record<string, string>; onName: (id: string, n: string) => void; onDone: () => void; say: (ok: boolean, m: string) => void }> = ({ rule, names, onName, onDone, say }) => {
  const tx = useTx(); const lang = useLang();
  const [event, setEvent] = useState<FeeEvent>(rule?.event || 'BUILDER_BOOKING');
  const ev = eventInfo(event)!;
  const [t, setT] = useState<Tgt>({ segments: rule?.segments || [...ev.payers], states: rule?.states || [], includeUserIds: rule?.includeUserIds || [], excludeUserIds: rule?.excludeUserIds || [] });
  const [mode, setMode] = useState<'FLAT' | 'PERCENT'>(rule?.mode || 'PERCENT');
  const [value, setValue] = useState(rule ? String(rule.value) : ''); const [minFee, setMin] = useState(rule?.minFee !== undefined ? String(rule.minFee) : ''); const [maxFee, setMax] = useState(rule?.maxFee !== undefined ? String(rule.maxFee) : '');
  const [active, setActive] = useState(rule ? !!rule.active : true); const [from, setFrom] = useState(rule ? rule.effectiveFrom.slice(0, 10) : todayIst()); const [note, setNote] = useState(rule?.note || '');
  const [ack, setAck] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  const warnings = ruleWarnings({ event, mode, active });
  const changeEvent = (e: FeeEvent) => { setEvent(e); setT({ ...t, segments: [...eventInfo(e)!.payers] }); };
  const save = async () => {
    setBusy(true);
    try {
      await api.billingRuleSave(rule?.id || null, { event, mode, value: Number(value), minFee: mode === 'PERCENT' && minFee !== '' ? Number(minFee) : undefined, maxFee: mode === 'PERCENT' && maxFee !== '' ? Number(maxFee) : undefined, active, effectiveFrom: from, note: note || undefined, acknowledge: ack, ...t });
      say(true, tx('Fee rule saved — it applies from its start date; earlier charges keep their old calculation', 'फ़ीस नियम सहेजा — शुरू होने की तारीख़ से लागू; पहले के चार्ज पुराने हिसाब पर रहेंगे')); ping(); onDone();
    } catch (e: any) { say(false, e.message || 'Failed'); } finally { setBusy(false); }
  };
  const ok = value !== '' && t.segments.length > 0 && warnings.every(w => ack.includes(w)) && (mode === 'FLAT' || Number(value) <= 100);
  return (
    <div className={`${card} space-y-4 border-slate-900`} data-testid="rule-editor">
      <div className="flex items-center justify-between"><div className="text-sm font-bold">{rule ? tx('Edit fee rule', 'फ़ीस नियम बदलें') : tx('New fee rule', 'नया फ़ीस नियम')} {rule && <span className="font-normal text-slate-500">{rule.id}</span>}</div><button type="button" className={ghost} onClick={onDone} aria-label={tx('Close', 'बंद करें')}><X className="h-4 w-4" /></button></div>
      <label className={lbl}>{tx('When is it charged?', 'कब लगेगी?')}
        <select className={`${inp} mt-1`} value={event} onChange={e => changeEvent(e.target.value as FeeEvent)} disabled={!!rule} data-testid="rule-event">
          {FEE_EVENTS.map(e => <option key={e.id} value={e.id}>{tx(e.en, e.hi)}</option>)}
        </select>
        <span className="mt-1 block font-normal text-slate-500">{tx(ev.whenEn, ev.whenHi)}</span>
      </label>
      <TargetingEditor t={t} set={setT} allowed={ev.payers} names={names} onName={onName} />
      <div className="grid gap-3 sm:grid-cols-4">
        <label className={lbl}>{tx('Flat or %', 'तय रक़म या %')}
          <select className={`${inp} mt-1`} value={mode} onChange={e => setMode(e.target.value as any)} data-testid="rule-mode"><option value="FLAT">{tx('Flat ₹', 'तय ₹')}</option><option value="PERCENT">%</option></select>
        </label>
        <label className={lbl}>{mode === 'FLAT' ? tx('Amount (₹)', 'रक़म (₹)') : tx(`% of ${ev.baseEn}`, `${ev.baseHi} का %`)}<input className={`${inp} mt-1`} inputMode="decimal" value={value} onChange={e => setValue(num(e.target.value))} data-testid="rule-value" /></label>
        {mode === 'PERCENT' && <label className={lbl}>{tx('Minimum (₹)', 'कम से कम (₹)')}<input className={`${inp} mt-1`} inputMode="numeric" value={minFee} onChange={e => setMin(num(e.target.value))} /></label>}
        {mode === 'PERCENT' && <label className={lbl}>{tx('Maximum (₹)', 'ज़्यादा से ज़्यादा (₹)')}<input className={`${inp} mt-1`} inputMode="numeric" value={maxFee} onChange={e => setMax(num(e.target.value))} /></label>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={lbl}>{tx('Starts on', 'शुरू होगा')}<input type="date" className={`${inp} mt-1`} min={rule ? undefined : todayIst()} value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label className="flex items-center gap-2 pt-5 text-xs font-semibold"><input type="checkbox" className="h-4 w-4" checked={active} onChange={e => setActive(e.target.checked)} />{tx('Rule is on', 'नियम चालू')}</label>
        <label className={lbl}>{tx('Note (for GENZ)', 'नोट (GENZ के लिए)')}<input className={`${inp} mt-1`} value={note} onChange={e => setNote(e.target.value)} maxLength={300} /></label>
      </div>
      {value !== '' && <p className="rounded bg-slate-50 p-2 text-xs text-slate-700">{tx('In words', 'शब्दों में')}: <strong>{mode === 'FLAT' ? (lang === 'hi' ? `हर बार ${inr(Number(value))}` : `${inr(Number(value))} each time`) : `${value}% ${tx('of', '—')} ${tx(ev.baseEn, ev.baseHi)}${minFee ? ` · min ${inr(Number(minFee))}` : ''}${maxFee ? ` · max ${inr(Number(maxFee))}` : ''}`}</strong></p>}
      <WarningsAck warnings={warnings} ack={ack} setAck={setAck} />
      <button type="button" className={dark} disabled={busy || !ok} onClick={save} data-testid="rule-save">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{tx('Save rule', 'नियम सहेजें')}</button>
    </div>
  );
};

// ───────────────────────────── plan editor ─────────────────────────────
const BENEFIT_TYPES: [BenefitType | '', string, string][] = [
  ['', 'Normal fee', 'सामान्य फ़ीस'], ['FREE', 'Free', 'मुफ़्त'], ['FLAT', 'Flat ₹', 'तय ₹'], ['PERCENT', '% of base', 'आधार का %'], ['DISCOUNT_PCT', '% off the normal fee', 'सामान्य फ़ीस पर % छूट'],
];
const PlanEditor: React.FC<{ plan?: any; names: Record<string, string>; onName: (id: string, n: string) => void; onDone: () => void; say: (ok: boolean, m: string) => void }> = ({ plan, names, onName, onDone, say }) => {
  const tx = useTx();
  const [name, setName] = useState(plan?.name || ''); const [nameHi, setNameHi] = useState(plan?.nameHi || ''); const [desc, setDesc] = useState(plan?.description || '');
  const [t, setT] = useState<Tgt>({ segments: plan?.segments || [], states: plan?.states || [], includeUserIds: plan?.includeUserIds || [], excludeUserIds: plan?.excludeUserIds || [] });
  const [monthly, setMonthly] = useState(plan?.monthly !== undefined ? String(plan.monthly) : ''); const [yearly, setYearly] = useState(plan?.yearly !== undefined ? String(plan.yearly) : '');
  const [fees, setFees] = useState<Record<string, { type: BenefitType | ''; value: string }>>(() => Object.fromEntries(FEE_EVENTS.map(e => [e.id, { type: (plan?.fees?.[e.id]?.type || '') as any, value: plan?.fees?.[e.id] ? String(plan.fees[e.id].value) : '' }])));
  const [features, setFeatures] = useState<GateKey[]>(plan?.features || []); const [active, setActive] = useState(plan ? !!plan.active : true);
  const [ack, setAck] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  const feeObj = Object.fromEntries(Object.entries(fees).filter(([, v]) => v.type).map(([k, v]) => [k, { type: v.type as BenefitType, value: Number(v.value || 0) }]));
  const warnings = planWarnings({ segments: t.segments, fees: feeObj as any, active, monthly: monthly === '' ? undefined : Number(monthly), yearly: yearly === '' ? undefined : Number(yearly) });
  const events = FEE_EVENTS.filter(e => e.payers.some(p => t.segments.includes(p)));
  const gates = GATES.filter(g => g.segments.some(p => t.segments.includes(p)));
  const save = async () => {
    setBusy(true);
    try {
      await api.billingPlanSave(plan?.id || null, { name, nameHi: nameHi || undefined, description: desc || undefined, monthly: monthly === '' ? undefined : Number(monthly), yearly: yearly === '' ? undefined : Number(yearly), fees: Object.fromEntries(Object.entries(feeObj).filter(([k]) => events.some(e => e.id === k))), features: features.filter(f => gates.some(g => g.id === f)), active, acknowledge: ack, ...t });
      say(true, tx('Plan saved', 'प्लान सहेजा')); ping(); onDone();
    } catch (e: any) { say(false, e.message || 'Failed'); } finally { setBusy(false); }
  };
  const ok = name.trim().length >= 3 && t.segments.length > 0 && (monthly !== '' || yearly !== '') && warnings.every(w => ack.includes(w));
  return (
    <div className={`${card} space-y-4 border-slate-900`} data-testid="plan-editor">
      <div className="flex items-center justify-between"><div className="text-sm font-bold">{plan ? tx('Edit plan', 'प्लान बदलें') : tx('New membership plan', 'नया मेंबरशिप प्लान')}</div><button type="button" className={ghost} onClick={onDone} aria-label={tx('Close', 'बंद करें')}><X className="h-4 w-4" /></button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={lbl}>{tx('Plan name', 'प्लान का नाम')}<input className={`${inp} mt-1`} value={name} onChange={e => setName(e.target.value)} maxLength={60} data-testid="plan-name" /></label>
        <label className={lbl}>{tx('Name in Hindi (optional)', 'हिंदी में नाम (वैकल्पिक)')}<input className={`${inp} mt-1`} value={nameHi} onChange={e => setNameHi(e.target.value)} maxLength={60} /></label>
      </div>
      <label className={lbl}>{tx('What members get (shown to them)', 'सदस्यों को क्या मिलेगा (उन्हें दिखेगा)')}<input className={`${inp} mt-1`} value={desc} onChange={e => setDesc(e.target.value)} maxLength={300} /></label>
      <TargetingEditor t={t} set={setT} names={names} onName={onName} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={lbl}>{tx('Price per month (₹, empty = no monthly option, 0 = free)', 'हर महीने की कीमत (₹, ख़ाली = मासिक नहीं, 0 = मुफ़्त)')}<input className={`${inp} mt-1`} inputMode="numeric" value={monthly} onChange={e => setMonthly(num(e.target.value))} data-testid="plan-monthly" /></label>
        <label className={lbl}>{tx('Price per year (₹, empty = no yearly option)', 'हर साल की कीमत (₹, ख़ाली = सालाना नहीं)')}<input className={`${inp} mt-1`} inputMode="numeric" value={yearly} onChange={e => setYearly(num(e.target.value))} data-testid="plan-yearly" /></label>
      </div>
      {events.length > 0 && (
        <div>
          <div className={lbl}>{tx('What GENZ fees cost a member', 'सदस्य के लिए GENZ फ़ीस')}</div>
          <div className="mt-1 space-y-2">{events.map(e => (
            <div key={e.id} className="grid items-end gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[1fr_200px_120px]">
              <div className="text-xs"><div className="font-semibold">{tx(e.en, e.hi)}</div><div className="text-slate-500">{tx('A member never pays more than the normal fee.', 'सदस्य कभी सामान्य फ़ीस से ज़्यादा नहीं देता।')}</div></div>
              <select className={inp} value={fees[e.id].type} onChange={ev => setFees({ ...fees, [e.id]: { ...fees[e.id], type: ev.target.value as any } })} data-testid={`plan-fee-${e.id}`}>{BENEFIT_TYPES.map(([v, en, hi]) => <option key={v} value={v}>{tx(en, hi)}</option>)}</select>
              {fees[e.id].type && fees[e.id].type !== 'FREE' ? <input className={inp} inputMode="decimal" placeholder={fees[e.id].type === 'FLAT' ? '₹' : '%'} value={fees[e.id].value} onChange={ev => setFees({ ...fees, [e.id]: { ...fees[e.id], value: num(ev.target.value) } })} data-testid={`plan-fee-value-${e.id}`} /> : <span />}
            </div>
          ))}</div>
        </div>
      )}
      {gates.length > 0 && (
        <div>
          <div className={lbl}>{tx('Member-only features this plan unlocks', 'यह प्लान कौन-सी सिर्फ़-सदस्य सुविधाएँ खोलता है')}</div>
          <div className="mt-1 space-y-1">{gates.map(g => (
            <label key={g.id} className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={features.includes(g.id)} onChange={() => setFeatures(features.includes(g.id) ? features.filter(x => x !== g.id) : [...features, g.id])} /><span><strong>{tx(g.en, g.hi)}</strong> — {tx(g.detailEn, g.detailHi)}</span></label>
          ))}</div>
        </div>
      )}
      <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" className="h-4 w-4" checked={active} onChange={e => setActive(e.target.checked)} />{tx('Open for new members', 'नए सदस्यों के लिए खुला')}</label>
      <WarningsAck warnings={warnings} ack={ack} setAck={setAck} />
      <button type="button" className={dark} disabled={busy || !ok} onClick={save} data-testid="plan-save">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{tx('Save plan', 'प्लान सहेजें')}</button>
    </div>
  );
};

// ───────────────────────────── a ledger line ─────────────────────────────
const LedgerLine: React.FC<{ e: any; mode: 'admin' | 'self'; run: (fn: () => Promise<any>, ok: string) => void; busy: boolean }> = ({ e, mode, run, busy }) => {
  const tx = useTx(); const [ref, setRef] = useState(''); const [note, setNote] = useState('');
  const what = e.kind === 'MEMBERSHIP' ? `${tx('Membership', 'मेंबरशिप')} · ${e.planName}${e.months ? ` · ${e.months} ${tx('month(s)', 'महीने')}` : ''}${e.comp ? ` · ${tx('given free', 'मुफ़्त दी गई')}` : ''}` : `${tx(eventInfo(e.event)?.en || '', eventInfo(e.event)?.hi || '')} · ${e.refLabel || ''}`;
  return (
    <div className="rounded-lg border border-slate-200 p-3 text-xs" data-testid={`ledger-${e.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><strong>{what}</strong>{mode === 'admin' && <span className="text-slate-500"> · {e.payerName} · {tx(segmentInfo(e.payerSegment)?.en || '', segmentInfo(e.payerSegment)?.hi || '')}</span>} <span className="text-slate-400">{e.id} · {d0(e.createdAt)}</span></div>
        <div className="flex items-center gap-2"><span className="text-sm font-bold">{inr(e.amount)}</span><Chip s={e.status} /></div>
      </div>
      {e.calc && <div className="mt-1 text-slate-500">{e.calc.mode === 'FLAT' ? `${tx('Flat', 'तय')} ${inr(e.calc.value)}` : `${e.calc.value}%${e.base !== undefined ? ` ${tx('of', '×')} ${inr(e.base)}` : ''}`}{e.calc.planId ? ` · ${tx('member price', 'सदस्य दर')}${e.calc.normalFee !== undefined ? ` (${tx('normal', 'सामान्य')} ${inr(e.calc.normalFee)})` : ''}` : ''}</div>}
      {e.hidden && <div className="mt-1 text-slate-500"><Lock className="mr-1 inline h-3 w-3" />{tx('Which deal and the commission amount stay hidden from GENZ.', 'कौन-सी डील और कमीशन की रक़म GENZ से छिपी रहती है।')}</div>}
      {e.validTo && <div className="mt-1 text-emerald-700">{tx('Member', 'सदस्य')} {d0(e.validFrom)} → {d0(e.validTo)}</div>}
      {e.ref && <div className="mt-1 text-slate-600">UTR: {e.ref}{e.paidOn ? ` · ${d0(e.paidOn)}` : ''}</div>}
      {e.rejectNote && <div className="mt-1 text-red-700">{e.rejectNote}</div>}
      {e.cancelNote && <div className="mt-1 text-slate-500">{e.cancelNote}</div>}
      {e.needsRefund && <div className="mt-1 font-semibold text-amber-800">{tx('Refund to settle outside the app', 'रिफ़ंड ऐप के बाहर निपटाना है')}</div>}
      {mode === 'self' && (e.status === 'DUE' || e.status === 'REJECTED') && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <input className={`${inp} max-w-56`} placeholder={tx('UTR / reference', 'UTR / संदर्भ')} value={ref} onChange={ev => setRef(ev.target.value)} />
          <button type="button" className={dark} disabled={busy || ref.trim().length < 6} onClick={() => run(() => api.billingLedgerAct(e.id, 'mark-paid', { ref }), tx('Marked paid — GENZ will confirm', 'भुगतान दर्ज — GENZ पक्का करेगा'))}>{tx('I have paid GENZ', 'मैंने GENZ को भुगतान किया')}</button>
        </div>
      )}
      {mode === 'admin' && e.status === 'MARKED_PAID' && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <button type="button" className={green} disabled={busy} onClick={() => run(() => api.billingLedgerAct(e.id, 'confirm'), tx('Payment received', 'भुगतान मिला'))}>{tx('Received — confirm', 'मिल गया — पक्का करें')}</button>
          <input className={`${inp} max-w-56`} placeholder={tx('Reason if not found', 'न मिले तो कारण')} value={note} onChange={ev => setNote(ev.target.value)} />
          <button type="button" className={red} disabled={busy || note.trim().length < 5} onClick={() => run(() => api.billingLedgerAct(e.id, 'reject', { note }), tx('Sent back', 'वापस भेजा'))}>{tx('Not received', 'नहीं मिला')}</button>
        </div>
      )}
      {mode === 'admin' && (e.status === 'DUE' || e.status === 'REJECTED') && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <input className={`${inp} max-w-56`} placeholder={tx('Reason to waive', 'माफ़ करने का कारण')} value={note} onChange={ev => setNote(ev.target.value)} />
          <button type="button" className={ghost} disabled={busy || note.trim().length < 5} onClick={() => run(() => api.billingLedgerAct(e.id, 'waive', { note }), tx('Waived', 'माफ़ किया'))}>{tx('Waive', 'माफ़ करें')}</button>
        </div>
      )}
      {mode === 'admin' && e.needsRefund && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <input className={`${inp} max-w-56`} placeholder={tx('What was done', 'क्या किया गया')} value={note} onChange={ev => setNote(ev.target.value)} />
          <button type="button" className={ghost} disabled={busy || note.trim().length < 5} onClick={() => run(() => api.billingLedgerAct(e.id, 'refund-settled', { note }), tx('Marked settled', 'निपटाया'))}>{tx('Refund settled', 'रिफ़ंड निपट गया')}</button>
        </div>
      )}
    </div>
  );
};

// ───────────────────────────── admin ─────────────────────────────
type Part = 'rules' | 'plans' | 'gates' | 'members' | 'payments' | 'calc';
export const PlansFeesAdmin: React.FC = () => {
  const tx = useTx(); const lang = useLang(); const { say, view } = useToast();
  const [c, setC] = useState<any>(null); const [err, setErr] = useState(''); const [part, setPart] = useState<Part>('rules');
  const [editRule, setEditRule] = useState<any | null | undefined>(undefined); const [editPlan, setEditPlan] = useState<any | null | undefined>(undefined);
  const [names, setNames] = useState<Record<string, string>>({}); const onName = (id: string, n: string) => setNames(x => ({ ...x, [id]: n }));
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { api.billingCatalog().then(r => { setC(r); setNames(x => ({ ...r.people, ...x })); setErr(''); }).catch(e => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);
  const run = async (fn: () => Promise<any>, ok: string) => { setBusy(true); try { await fn(); say(true, ok); load(); ping(); } catch (e: any) { say(false, e.message || 'Failed'); } finally { setBusy(false); } };
  if (err && !c) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (!c) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" />;
  const t = c.totals;
  const tile = (id: Part, n: React.ReactNode, en: string, hi: string, Icon: any, hot = false) => (
    <button type="button" onClick={() => setPart(id)} aria-pressed={part === id} data-testid={`pf-tile-${id}`} className={`rounded-xl border p-3 text-left ${part === id ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200'} ${hot ? 'bg-amber-50' : 'bg-white'}`}>
      <Icon className="h-4 w-4 text-slate-500" /><div className="mt-1 text-xl font-bold text-slate-900">{n}</div><div className="text-xs text-slate-500">{tx(en, hi)}</div>
    </button>
  );
  const done = () => { setEditRule(undefined); setEditPlan(undefined); load(); };
  return (
    <div className="space-y-4" data-testid="plans-fees-admin">
      <div>
        <div className="flex items-center gap-2 text-lg font-bold text-slate-900"><IndianRupee className="h-5 w-5" />{tx('Plans & Fees', 'प्लान और फ़ीस')}</div>
        <p className="text-xs text-slate-500">{tx('Decide what GENZ charges, whom, and what members get. Nothing is charged without a rule; changes never touch earlier charges. Money moves outside the app.', 'तय कीजिए GENZ क्या, किससे लेता है और सदस्यों को क्या मिलता है। बिना नियम कोई फ़ीस नहीं; बदलाव पहले के चार्ज को नहीं छूते। पैसा ऐप के बाहर।')}</p>
      </div>
      {view}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        {tile('rules', c.rules.filter((r: any) => r.active).length, 'Fee rules on', 'चालू फ़ीस नियम', Receipt)}
        {tile('plans', c.plans.filter((p: any) => p.active).length, 'Open plans', 'खुले प्लान', BadgeCheck)}
        {tile('gates', c.gates.filter((g: any) => g.membersOnly).length, 'Member-only features', 'सिर्फ़-सदस्य सुविधाएँ', Lock)}
        {tile('members', t.activeMembers, 'Active members', 'सक्रिय सदस्य', Users)}
        {tile('payments', `${t.toConfirm} · ${inr(t.received)}`, 'To confirm · received', 'पक्का करना · मिला', IndianRupee, t.toConfirm > 0 || t.refunds > 0)}
        {tile('calc', '₹?', 'Fee calculator', 'फ़ीस कैलकुलेटर', Calculator)}
      </div>

      {part === 'rules' && (
        <div className="space-y-3">
          {editRule === undefined && <button type="button" className={dark} onClick={() => setEditRule(null)} data-testid="rule-new"><Plus className="h-4 w-4" />{tx('New fee rule', 'नया फ़ीस नियम')}</button>}
          {editRule !== undefined && <RuleEditor key={editRule?.id || 'new'} rule={editRule || undefined} names={names} onName={onName} onDone={done} say={say} />}
          {FEE_EVENTS.map(ev => {
            const rows = c.rules.filter((r: any) => r.event === ev.id);
            return (
              <div key={ev.id} className={card}>
                <div className="text-sm font-bold text-slate-900">{tx(ev.en, ev.hi)}</div>
                <div className="text-xs text-slate-500">{tx(ev.whenEn, ev.whenHi)}</div>
                {rows.length === 0 && <p className="mt-2 text-xs text-slate-500">{tx('No rule — GENZ charges nothing here.', 'कोई नियम नहीं — यहाँ GENZ कुछ नहीं लेता।')}</p>}
                <div className="mt-2 space-y-2">{rows.map((r: any) => (
                  <div key={r.id} className={`flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3 text-xs ${r.active ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-70'}`} data-testid={`rule-${r.id}`}>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">{r.text[lang]} {!r.active && <span className="ml-1 rounded bg-slate-100 px-1.5">{tx('off', 'बंद')}</span>} {r.createdBy === 'SYSTEM' && <span className="ml-1 rounded bg-amber-100 px-1.5 text-amber-800">{tx('starting figure', 'शुरुआती आँकड़ा')}</span>}</div>
                      <div className="text-slate-600">{r.segments.map((s: string) => tx(segmentInfo(s)?.en || s, segmentInfo(s)?.hi || s)).join(', ')}{r.states.length ? ` · ${r.states.join(', ')}` : ''}</div>
                      {r.includeUserIds.length > 0 && <div className="text-slate-600">{tx('Only', 'सिर्फ़')}: {r.includeUserIds.map((id: string) => names[id] || id).join(', ')}</div>}
                      {r.excludeUserIds.length > 0 && <div className="text-slate-600">{tx('Not for', 'इन पर नहीं')}: {r.excludeUserIds.map((id: string) => names[id] || id).join(', ')}</div>}
                      <div className="text-slate-400">{r.id} · {tx('from', 'से')} {d0(r.effectiveFrom)}{r.note ? ` · ${r.note}` : ''}</div>
                    </div>
                    <button type="button" className={ghost} onClick={() => { setEditRule(r); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil className="h-3.5 w-3.5" />{tx('Edit', 'बदलें')}</button>
                  </div>
                ))}</div>
              </div>
            );
          })}
        </div>
      )}

      {part === 'plans' && (
        <div className="space-y-3">
          {editPlan === undefined && <button type="button" className={dark} onClick={() => setEditPlan(null)} data-testid="plan-new"><Plus className="h-4 w-4" />{tx('New plan', 'नया प्लान')}</button>}
          {editPlan !== undefined && <PlanEditor key={editPlan?.id || 'new'} plan={editPlan || undefined} names={names} onName={onName} onDone={done} say={say} />}
          {c.plans.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{tx('No plan yet.', 'अभी कोई प्लान नहीं।')}</p>}
          {c.plans.map((p: any) => (
            <div key={p.id} className={`${card} ${p.active ? '' : 'opacity-70'}`} data-testid={`plan-${p.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-bold">{lang === 'hi' && p.nameHi ? p.nameHi : p.name} {!p.active && <span className="ml-1 rounded bg-slate-100 px-1.5 text-xs font-normal">{tx('closed to new members', 'नए सदस्यों के लिए बंद')}</span>}</div>
                  <div className="text-xs text-slate-600">{p.segments.map((s: string) => tx(segmentInfo(s)?.en || s, segmentInfo(s)?.hi || s)).join(', ')}{p.states.length ? ` · ${p.states.join(', ')}` : ''}</div>
                  {p.description && <div className="text-xs text-slate-500">{p.description}</div>}
                </div>
                <div className="text-right text-xs"><div className="text-sm font-bold">{p.monthly !== undefined ? `${inr(p.monthly)}/${tx('mo', 'माह')}` : ''} {p.yearly !== undefined ? `${inr(p.yearly)}/${tx('yr', 'साल')}` : ''}</div><div className="text-slate-500">{p.members} {tx('active members', 'सक्रिय सदस्य')}</div></div>
              </div>
              <ul className="mt-2 list-disc pl-5 text-xs text-slate-700">
                {p.feesText.map((f: any) => <li key={f.event}>{tx(eventInfo(f.event)?.en || '', eventInfo(f.event)?.hi || '')}: <strong>{f[lang]}</strong>{!c.rules.some((r: any) => r.active && r.event === f.event) && <span className="text-amber-700"> — {tx('no fee rule yet, so this saves members nothing today', 'अभी कोई फ़ीस नियम नहीं, इसलिए आज सदस्यों की कोई बचत नहीं')}</span>}</li>)}
                {p.features.map((g: string) => <li key={g}><Unlock className="mr-1 inline h-3 w-3" />{tx(gateInfo(g)?.en || g, gateInfo(g)?.hi || g)}</li>)}
              </ul>
              <button type="button" className={`${ghost} mt-2`} onClick={() => { setEditPlan(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil className="h-3.5 w-3.5" />{tx('Edit', 'बदलें')}</button>
            </div>
          ))}
        </div>
      )}

      {part === 'gates' && <GatesPart gates={c.gates} plans={c.plans} run={run} busy={busy} />}
      {part === 'members' && <MembersPart c={c} run={run} busy={busy} names={names} onName={onName} />}
      {part === 'payments' && <PaymentsPart run={run} busy={busy} />}
      {part === 'calc' && <CalcPart names={names} onName={onName} />}
    </div>
  );
};

const GatesPart: React.FC<{ gates: any[]; plans: any[]; run: (fn: () => Promise<any>, ok: string) => void; busy: boolean }> = ({ gates, plans, run, busy }) => {
  const tx = useTx(); const [g, setG] = useState<any[]>(gates.map(x => ({ ...x, segments: [...x.segments] })));
  useEffect(() => { setG(gates.map(x => ({ ...x, segments: [...x.segments] }))); }, [gates]);
  return (
    <div className={`${card} space-y-3`} data-testid="gates">
      <p className="text-xs text-slate-500">{tx('Reserve a feature for members. Add it to a plan first (Plans → Edit), otherwise nobody could use it. Perks like early access just need to be in a plan.', 'किसी सुविधा को सदस्यों के लिए आरक्षित कीजिए। पहले उसे किसी प्लान में जोड़िए (प्लान → बदलें), नहीं तो कोई उसे इस्तेमाल नहीं कर पाएगा। "पहले मौक़ा" जैसी सुविधा बस प्लान में होनी चाहिए।')}</p>
      {g.map((x, i) => {
        const info = gateInfo(x.key)!; const inPlans = plans.filter(p => p.active && p.features.includes(x.key)).map(p => p.name);
        return (
          <div key={x.key} className="rounded-lg border border-slate-200 p-3 text-xs">
            <div className="font-semibold text-slate-900">{info.kind === 'GATE' ? <Lock className="mr-1 inline h-3.5 w-3.5" /> : <Unlock className="mr-1 inline h-3.5 w-3.5" />}{tx(info.en, info.hi)}</div>
            <div className="text-slate-500">{tx(info.detailEn, info.detailHi)}</div>
            <div className="mt-1 text-slate-600">{tx('In plans', 'इन प्लान में')}: {inPlans.join(', ') || tx('none yet', 'अभी किसी में नहीं')}</div>
            {info.kind === 'GATE' && (
              <div className="mt-2 space-y-2">
                <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="h-4 w-4" checked={x.membersOnly} onChange={e => setG(g.map((y, j) => j === i ? { ...y, membersOnly: e.target.checked } : y))} data-testid={`gate-${x.key}`} />{tx('Members only', 'सिर्फ़ सदस्य')}</label>
                {x.membersOnly && <SegmentChecks value={x.segments} onChange={segments => setG(g.map((y, j) => j === i ? { ...y, segments } : y))} allowed={info.segments} />}
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className={dark} disabled={busy} onClick={() => run(() => api.billingGates(g.map(x => ({ key: x.key, membersOnly: x.membersOnly, segments: x.segments }))), tx('Saved', 'सहेजा'))} data-testid="gates-save">{tx('Save', 'सहेजें')}</button>
    </div>
  );
};

const MembersPart: React.FC<{ c: any; run: (fn: () => Promise<any>, ok: string) => void; busy: boolean; names: Record<string, string>; onName: (id: string, n: string) => void }> = ({ c, run, busy, names, onName }) => {
  const tx = useTx(); const [who, setWho] = useState<string[]>([]); const [planId, setPlanId] = useState(''); const [months, setMonths] = useState('1'); const [note, setNote] = useState(''); const [endNote, setEndNote] = useState('');
  return (
    <div className="space-y-3">
      <div className={`${card} space-y-3`}>
        <div className="text-sm font-bold">{tx('Give a membership free (pilot, partner, goodwill)', 'मुफ़्त मेंबरशिप दीजिए (पायलट, पार्टनर, सद्भाव)')}</div>
        <PeoplePicker value={who} onChange={v => setWho(v.slice(-1))} names={names} onName={onName} placeholder={tx('Search name / firm', 'नाम / फ़र्म खोजें')} />
        <div className="grid gap-2 sm:grid-cols-3">
          <select className={inp} value={planId} onChange={e => setPlanId(e.target.value)}><option value="">{tx('Choose plan', 'प्लान चुनें')}</option>{c.plans.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input className={inp} inputMode="numeric" value={months} onChange={e => setMonths(num(e.target.value))} aria-label={tx('Months', 'महीने')} />
          <input className={inp} placeholder={tx('Why (5+ characters)', 'क्यों (5+ अक्षर)')} value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <button type="button" className={dark} disabled={busy || !who.length || !planId || !months || note.trim().length < 5} onClick={() => run(async () => { await api.billingGrant({ userId: who[0], planId, months: Number(months), note }); setWho([]); setNote(''); }, tx('Membership given', 'मेंबरशिप दे दी'))}>{tx('Give membership', 'मेंबरशिप दें')}</button>
      </div>
      {c.members.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{tx('No active member yet.', 'अभी कोई सक्रिय सदस्य नहीं।')}</p>}
      {c.members.map((m: any) => (
        <div key={m.entryId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs">
          <div><strong>{m.name}</strong> · {m.planName} · {tx(segmentInfo(m.segment)?.en || '', segmentInfo(m.segment)?.hi || '')}<div className="text-slate-500">{d0(m.validFrom)} → {d0(m.validTo)}{m.comp ? ` · ${tx('given free', 'मुफ़्त दी गई')}` : ''}</div></div>
          <div className="flex items-end gap-2"><input className={`${inp} max-w-48`} placeholder={tx('Reason to end', 'ख़त्म करने का कारण')} value={endNote} onChange={e => setEndNote(e.target.value)} /><button type="button" className={red} disabled={busy || endNote.trim().length < 5} onClick={() => run(() => api.billingEnd(m.entryId, endNote), tx('Membership ended', 'मेंबरशिप ख़त्म'))}>{tx('End now', 'अभी ख़त्म करें')}</button></div>
        </div>
      ))}
    </div>
  );
};

const PaymentsPart: React.FC<{ run: (fn: () => Promise<any>, ok: string) => void; busy: boolean }> = ({ run, busy }) => {
  const tx = useTx(); const [status, setStatus] = useState('MARKED_PAID'); const [rows, setRows] = useState<any[] | null>(null);
  const load = useCallback(() => { api.billingLedger(status).then(r => setRows(r.entries)).catch(() => setRows([])); }, [status]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const f = () => load(); window.addEventListener('genz:billing-changed', f); return () => window.removeEventListener('genz:billing-changed', f); }, [load]);
  const F: [string, string, string][] = [['MARKED_PAID', 'To confirm', 'पक्का करना'], ['DUE', 'Due', 'देय'], ['REJECTED', 'Not found', 'नहीं मिला'], ['CONFIRMED', 'Received', 'मिला'], ['WAIVED', 'Waived / free', 'माफ़'], ['REFUND', 'Refunds', 'रिफ़ंड'], ['', 'All', 'सब']];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">{F.map(([v, en, hi]) => <button key={v} type="button" aria-pressed={status === v} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === v ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'}`} onClick={() => setStatus(v)}>{tx(en, hi)}</button>)}</div>
      {!rows ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" /> : rows.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{tx('Nothing here.', 'यहाँ कुछ नहीं।')}</p> : rows.map(e => <LedgerLine key={e.id} e={e} mode="admin" run={run} busy={busy} />)}
    </div>
  );
};

const CalcPart: React.FC<{ names: Record<string, string>; onName: (id: string, n: string) => void }> = ({ names, onName }) => {
  const tx = useTx(); const [event, setEvent] = useState<FeeEvent>('BUILDER_BOOKING'); const [base, setBase] = useState('5000000'); const [who, setWho] = useState<string[]>([]);
  const [segment, setSegment] = useState<PayerSegment>('BUILDER'); const [state, setState] = useState(''); const [out, setOut] = useState<any>(null); const [err, setErr] = useState('');
  const go = () => api.billingPreview({ event, base: Number(base || 0), userId: who[0], segment: who[0] ? undefined : segment, state: state || undefined }).then(r => { setOut(r); setErr(''); }).catch(e => { setErr(e.message); setOut(null); });
  return (
    <div className={`${card} space-y-3`} data-testid="calc">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={lbl}>{tx('Event', 'काम')}<select className={`${inp} mt-1`} value={event} onChange={e => setEvent(e.target.value as FeeEvent)}>{FEE_EVENTS.map(e => <option key={e.id} value={e.id}>{tx(e.en, e.hi)}</option>)}</select></label>
        <label className={lbl}>{tx(`Amount: ${eventInfo(event)?.baseEn}`, `रक़म: ${eventInfo(event)?.baseHi}`)}<input className={`${inp} mt-1`} inputMode="numeric" value={base} onChange={e => setBase(num(e.target.value))} /></label>
        <label className={lbl}>{tx('State', 'राज्य')}<select className={`${inp} mt-1`} value={state} onChange={e => setState(e.target.value)}><option value="">{tx('Their own state', 'उनका अपना राज्य')}</option>{stateNames().map(s => <option key={s} value={s}>{s}</option>)}</select></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><div className={lbl}>{tx('A person (uses their membership)', 'कोई व्यक्ति (उसकी मेंबरशिप के साथ)')}</div><div className="mt-1"><PeoplePicker value={who} onChange={v => setWho(v.slice(-1))} names={names} onName={onName} placeholder={tx('Search name / firm', 'नाम / फ़र्म खोजें')} /></div></div>
        {!who.length && <label className={lbl}>{tx('…or a group', '…या कोई समूह')}<select className={`${inp} mt-1`} value={segment} onChange={e => setSegment(e.target.value as PayerSegment)}>{PAYER_SEGMENTS.map(s => <option key={s.id} value={s.id}>{tx(s.en, s.hi)}</option>)}</select></label>}
      </div>
      <button type="button" className={dark} onClick={go} data-testid="calc-go"><Calculator className="h-4 w-4" />{tx('Work it out', 'हिसाब लगाएँ')}</button>
      {err && <p className="text-sm text-red-700">{err}</p>}
      {out && <div className="rounded-lg bg-slate-50 p-3 text-sm" data-testid="calc-out"><div className="text-2xl font-bold">{inr(out.fee)}</div><div className="text-slate-600">{out.why}</div>{out.rule && <div className="text-xs text-slate-400">{out.rule.id}{out.plan ? ` · ${out.plan.name}` : ''}</div>}</div>}
    </div>
  );
};

// ───────────────────────────── the payer's own view ─────────────────────────────
export const MyPlanFees: React.FC<{ embedded?: boolean }> = ({ embedded }) => {
  const tx = useTx(); const lang = useLang(); const { say, view } = useToast();
  const [m, setM] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(() => { api.billingMe().then(r => { setM(r); setErr(''); }).catch(e => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);
  const run = async (fn: () => Promise<any>, ok: string) => { setBusy(true); try { await fn(); say(true, ok); load(); ping(); } catch (e: any) { say(false, e.message || 'Failed'); } finally { setBusy(false); } };
  if (err && !m) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (!m) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-500" />;
  if (!m.segment) return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{tx('GENZ charges your account nothing.', 'GENZ आपके खाते से कुछ नहीं लेता।')}</p>;
  const seg = segmentInfo(m.segment);
  return (
    <div className="space-y-4" data-testid="my-plan-fees">
      {!embedded && <div className="flex items-center gap-2 text-lg font-bold text-slate-900"><BadgeCheck className="h-5 w-5" />{tx('GENZ Membership & Fees', 'GENZ मेंबरशिप और फ़ीस')}</div>}
      {view}
      <div className={card}>
        <div className="text-xs text-slate-500">{tx('Your group', 'आपका समूह')}: <strong className="text-slate-800">{tx(seg?.en || '', seg?.hi || '')}</strong>{m.state ? ` · ${m.state}` : ''}</div>
        {m.membership
          ? <div className="mt-1 text-sm font-semibold text-emerald-700" data-testid="my-membership"><BadgeCheck className="mr-1 inline h-4 w-4" />{m.membership.planName} · {tx('until', 'तक')} {d0(m.membership.validTo)}{m.membership.comp ? ` · ${tx('given by GENZ', 'GENZ ने दी')}` : ''}</div>
          : <div className="mt-1 text-sm text-slate-600">{tx('You are not a member right now.', 'आप अभी सदस्य नहीं हैं।')}</div>}
      </div>

      <div className={card}>
        <div className="mb-2 text-sm font-bold">{tx('GENZ fees that apply to you', 'आप पर लागू GENZ फ़ीस')}</div>
        {m.rules.length === 0 ? <p className="text-xs text-slate-500">{tx('None — GENZ charges you nothing today.', 'कोई नहीं — आज GENZ आपसे कुछ नहीं लेता।')}</p> : (
          <ul className="space-y-2 text-xs">{m.rules.map((r: any) => (
            <li key={r.event} className="rounded-lg bg-slate-50 p-2" data-testid={`my-rule-${r.event}`}>
              <div className="font-semibold text-slate-800">{tx(eventInfo(r.event)?.en || '', eventInfo(r.event)?.hi || '')}</div>
              <div className="text-slate-500">{tx(eventInfo(r.event)?.whenEn || '', eventInfo(r.event)?.whenHi || '')}</div>
              {r.rule ? <div>{tx('Fee', 'फ़ीस')}: <strong>{r.rule[lang]}</strong>{r.member ? <span className="text-emerald-700"> · {tx('you as a member', 'आपके लिए सदस्य दर')}: <strong>{r.member[lang]}</strong></span> : null}</div> : <div>{tx('No fee today', 'आज कोई फ़ीस नहीं')}</div>}
              {r.upcoming.map((u: any, i: number) => <div key={i} className="text-amber-800">{tx('From', 'से')} {d0(u.from)}: {u[lang]}</div>)}
            </li>
          ))}</ul>
        )}
        {m.gates.length > 0 && <ul className="mt-2 space-y-1 text-xs">{m.gates.map((g: any) => <li key={g.key}>{g.unlocked ? <Unlock className="mr-1 inline h-3 w-3 text-emerald-700" /> : <Lock className="mr-1 inline h-3 w-3 text-slate-500" />}{tx(gateInfo(g.key)?.en || '', gateInfo(g.key)?.hi || '')} — {g.unlocked ? tx('included in your plan', 'आपके प्लान में शामिल') : tx('members only', 'सिर्फ़ सदस्य')}</li>)}</ul>}
        <p className="mt-2 text-[11px] text-slate-500">{tx('A fee is worked out once, when the event happens, and never changes afterwards. You pay GENZ outside the app and note the UTR here.', 'फ़ीस एक बार, काम होते समय तय होती है और बाद में नहीं बदलती। आप GENZ को ऐप के बाहर भुगतान करके यहाँ UTR लिखते हैं।')}</p>
      </div>

      {m.plans.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-bold">{tx('Plans open to you', 'आपके लिए खुले प्लान')}</div>
          <div className="grid gap-3 sm:grid-cols-2">{m.plans.map((p: any) => (
            <div key={p.id} className={card} data-testid={`my-plan-${p.id}`}>
              <div className="text-sm font-bold">{lang === 'hi' && p.nameHi ? p.nameHi : p.name}</div>
              {p.description && <div className="text-xs text-slate-500">{p.description}</div>}
              <ul className="mt-2 list-disc pl-5 text-xs text-slate-700">
                {p.feesText.map((f: any) => <li key={f.event}>{tx(eventInfo(f.event)?.en || '', eventInfo(f.event)?.hi || '')}: <strong>{f[lang]}</strong>{!m.rules.some((r: any) => r.event === f.event && r.rule) && <span className="text-slate-500"> ({tx('GENZ charges nothing here today', 'आज GENZ यहाँ कुछ नहीं लेता')})</span>}</li>)}
                {p.features.map((g: string) => <li key={g}>{tx(gateInfo(g)?.en || g, gateInfo(g)?.hi || g)}</li>)}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                {p.monthly !== undefined && <button type="button" className={ghost} disabled={busy || !!m.pendingMembershipId} onClick={() => run(() => api.billingBuy(p.id, 'MONTHLY'), p.monthly ? tx('Added below — pay GENZ and note the UTR', 'नीचे जुड़ गया — GENZ को भुगतान करके UTR लिखिए') : tx('Membership active', 'मेंबरशिप चालू'))}>{tx('Monthly', 'मासिक')} {inr(p.monthly)}</button>}
                {p.yearly !== undefined && <button type="button" className={ghost} disabled={busy || !!m.pendingMembershipId} onClick={() => run(() => api.billingBuy(p.id, 'YEARLY'), p.yearly ? tx('Added below — pay GENZ and note the UTR', 'नीचे जुड़ गया — GENZ को भुगतान करके UTR लिखिए') : tx('Membership active', 'मेंबरशिप चालू'))}>{tx('Yearly', 'सालाना')} {inr(p.yearly)}</button>}
              </div>
              {m.membership && <p className="mt-1 text-[11px] text-slate-500">{tx('A new period starts when your current one ends.', 'नई अवधि आपकी मौजूदा अवधि ख़त्म होने पर शुरू होगी।')}</p>}
            </div>
          ))}</div>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-sm font-bold">{tx('Your GENZ dues and payments', 'आपके GENZ बकाये और भुगतान')}</div>
        {m.ledger.length === 0 ? <p className="text-xs text-slate-500">{tx('Nothing yet.', 'अभी कुछ नहीं।')}</p> : m.ledger.map((e: any) => <LedgerLine key={e.id} e={e} mode="self" run={run} busy={busy} />)}
      </div>
    </div>
  );
};

export const PlansFeesView: React.FC<{ permissions: string[] }> = ({ permissions }) =>
  permissions.includes('billing:manage') ? <PlansFeesAdmin /> : permissions.includes('billing:self') ? <MyPlanFees /> : null;
