import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, ExternalLink, Link2, Loader2, MessageCircle, Minus, Plus, Printer, Trash2, Receipt, Clock } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { Sheet, Err, useBusy, inp, btnDark, btnLine, inr } from './CrmPlus.js';
import { Chip, Tog, copyText, siteUrl } from './InventorySheets.js';
import { COST_LIMITS, chargesError, cleanCharges, computeCostSheet, type ChargeLine, type CostSheetOut, type ProjectCharges } from '../shared/costSheetRules.js';

/**
 * v106 — cost sheets. Two sides of one thing:
 *   ChargesSheet      the builder sets what a sheet is made of (extra charges, GST, stamp, registration, payment steps) — once per project
 *   UnitCostSheet     anyone who may send a unit makes the sheet of one unit: live figures, parking picks, a tracked customer link
 *   CostSheetsCard    the sheets already sent, with how many times each was opened
 */

const dshort = (iso: string, hi: boolean) => new Date(iso).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
const SEG = ['bg-slate-900', 'bg-slate-700', 'bg-slate-500', 'bg-slate-400', 'bg-slate-300', 'bg-slate-200'];

/** the payment steps as one bar — how the money is spread over the build */
export const ScheduleBar: React.FC<{ steps: { name: string; pct: number; amount?: number; dueInDays?: number }[]; compact?: boolean }> = ({ steps, compact }) => {
  const tx = useTx();
  return (
    <div className="space-y-1.5">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={steps.map(s => `${s.name} ${s.pct}%`).join(', ')}>
        {steps.map((s, i) => <div key={i} className={SEG[Math.min(i, SEG.length - 1)]} style={{ width: `${Math.max(0, s.pct)}%` }} title={`${s.name} ${s.pct}%`} />)}
      </div>
      {!compact && <ul className="space-y-1">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="flex min-w-0 items-center gap-1.5"><span className={`h-2 w-2 shrink-0 rounded-full ${SEG[Math.min(i, SEG.length - 1)]}`} /><span className="truncate">{s.name}</span><span className="shrink-0 text-slate-400">{s.pct}%{s.dueInDays ? ` · ${tx(`~${s.dueInDays}d`, `~${s.dueInDays} दिन`)}` : ''}</span></span>
            {s.amount !== undefined && <b className="shrink-0 tabular-nums">{inr(s.amount)}</b>}
          </li>
        ))}
      </ul>}
    </div>
  );
};

/** the figures of one sheet — a dark “all-in” panel on top of the breakdown */
const Figures: React.FC<{ out: CostSheetOut }> = ({ out }) => {
  const tx = useTx();
  const row = (label: string, v: number, o: { sub?: string; muted?: boolean; strong?: boolean } = {}) => (
    <div className={`flex items-start justify-between gap-3 py-1.5 ${o.strong ? 'border-t border-slate-200 font-bold text-slate-900' : o.muted ? 'text-slate-500' : 'text-slate-700'}`}>
      <span className="min-w-0">{label}{o.sub ? <span className="block text-[10px] font-normal text-slate-400">{o.sub}</span> : null}</span><span className="shrink-0 tabular-nums">{inr(v)}</span>
    </div>
  );
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="bg-slate-900 px-4 py-3 text-white">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">{tx('All-in cost to the customer', 'ग्राहक की कुल लागत (सब मिलाकर)')}</div>
        <div className="text-2xl font-extrabold tabular-nums" data-testid="cs-allin">{inr(out.allIn)}</div>
        <div className="text-[10px] text-slate-300">{tx('Pays the builder', 'बिल्डर को')} {inr(out.payable)} · {tx('government fees (estimate)', 'सरकारी शुल्क (अनुमान)')} {inr(out.stamp + out.reg)}</div>
      </div>
      <div className="divide-y divide-slate-100 px-4 py-1 text-xs">
        {row(tx('Price of the unit', 'यूनिट की कीमत'), out.basic, { sub: out.ratePerSqft && out.areaSqft ? `${inr(out.ratePerSqft)} × ${out.areaSqft} ${tx('sq ft', 'वर्ग फ़ुट')}` : undefined })}
        {out.lines.map(l => <React.Fragment key={l.id}>{row(l.label, l.amount, { sub: `${l.basis}${l.gst ? '' : ` · ${tx('no GST', 'जीएसटी नहीं')}`}` })}</React.Fragment>)}
        {out.gstPct > 0 && row(`${tx('GST', 'जीएसटी')} @ ${out.gstPct}%`, out.gst, { sub: `${tx('on', 'पर')} ${inr(out.agreementValue)}`, muted: true })}
        {row(tx('Total payable to the builder', 'बिल्डर को कुल देय'), out.payable, { strong: true })}
        {out.stampPct > 0 && row(`${tx('Stamp duty', 'स्टाम्प ड्यूटी')} @ ${out.stampPct}%`, out.stamp, { muted: true })}
        {out.regPct > 0 && row(`${tx('Registration', 'रजिस्ट्रेशन')} @ ${out.regPct}%`, out.reg, { muted: true })}
      </div>
    </div>
  );
};

// ───────────────────────── the builder: what a sheet is made of ─────────────────────────
type LineF = { id: string; label: string; mode: 'PER_SQFT' | 'FIXED'; amount: string; gst: boolean; optional: boolean; maxQty: string };
const newId = () => `c${Date.now().toString(36).slice(-6)}`;

export const ChargesSheet: React.FC<{ pid: string; charges: ProjectCharges; isSet: boolean; sample?: { price: number; areaSqft?: number }; onClose: () => void; onDone: (msg: string) => void }> = ({ pid, charges, isSet, sample, onClose, onDone }) => {
  const tx = useTx();
  const [gst, setGst] = useState(String(charges.gstPct)); const [stamp, setStamp] = useState(String(charges.stampPct)); const [reg, setReg] = useState(String(charges.regPct));
  const [valid, setValid] = useState(String(charges.validDays)); const [note, setNote] = useState(charges.note || '');
  const [lines, setLines] = useState<LineF[]>(() => charges.lines.map(l => ({ id: l.id, label: l.label, mode: l.mode, amount: l.amount ? String(l.amount) : '', gst: l.gst !== false, optional: !!l.optional, maxQty: String(l.maxQty || 1) })));
  const [steps, setSteps] = useState(() => charges.schedule.map(s => ({ name: s.name, pct: String(s.pct), dueInDays: String(s.dueInDays) })));
  const [sp, setSp] = useState({ price: String(sample?.price || 5000000), area: String(sample?.areaSqft || 1200) });
  const { busy, err, go } = useBusy();

  const draft: ProjectCharges = useMemo(() => ({
    gstPct: Number(gst) || 0, stampPct: Number(stamp) || 0, regPct: Number(reg) || 0, validDays: Math.round(Number(valid)) || 0, ...(note.trim() ? { note: note.trim() } : {}),
    lines: lines.map(l => ({ id: l.id, label: l.label.trim(), mode: l.mode, amount: Number(l.amount) || 0, gst: l.gst, ...(l.optional ? { optional: true, maxQty: Math.max(1, Math.min(COST_LIMITS.maxQty, Math.round(Number(l.maxQty)) || 1)) } : {}) } as ChargeLine)),
    schedule: steps.map(s => ({ name: s.name.trim(), pct: Number(s.pct) || 0, dueInDays: Math.round(Number(s.dueInDays)) || 0 })),
  }), [gst, stamp, reg, valid, note, lines, steps]);
  const problem = chargesError(draft);
  const total = Math.round(steps.reduce((a, s) => a + (Number(s.pct) || 0), 0) * 100) / 100;
  const preview = useMemo(() => (problem || !(Number(sp.price) > 0) ? null : computeCostSheet({ price: Number(sp.price), areaSqft: Number(sp.area) || undefined }, cleanCharges(draft), Object.fromEntries(draft.lines.filter(l => l.optional).map(l => [l.id, 1])))), [problem, sp, draft]);
  const setLine = (i: number, p: Partial<LineF>) => setLines(lines.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <Sheet title={tx('Cost sheet — charges of this project', 'कॉस्ट शीट — इस प्रोजेक्ट के शुल्क')} onClose={onClose}>
      <div className="space-y-4 text-xs">
        <p className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">{tx('Set once. Every partner then sends the same, correct sheet — you stay in control of the figures. Type the GST, stamp duty and registration that apply to this project. A line left at ₹0 is not printed. Sheets already sent keep their figures.', 'एक बार तय करें। फिर हर पार्टनर वही सही शीट भेजता है — आँकड़े आपके हाथ में रहते हैं। इस प्रोजेक्ट पर लागू जीएसटी, स्टाम्प ड्यूटी और रजिस्ट्रेशन भरें। ₹0 वाली लाइन छपती नहीं। पहले भेजी शीट के आँकड़े नहीं बदलते।')}</p>
        {!isSet && <p className="rounded-lg bg-amber-50 p-2 text-[11px] font-semibold text-amber-800">{tx('Not saved yet — partners cannot make cost sheets of this project until you save.', 'अभी सेव नहीं हुआ — सेव करने तक पार्टनर इस प्रोजेक्ट की कॉस्ट शीट नहीं बना सकते।')}</p>}

        <div className="grid grid-cols-3 gap-2">
          {([[tx('GST %', 'जीएसटी %'), gst, setGst], [tx('Stamp duty %', 'स्टाम्प %'), stamp, setStamp], [tx('Registration %', 'रजिस्ट्रेशन %'), reg, setReg]] as const).map(([lab, v, set]) => (
            <label key={lab} className="block font-semibold text-slate-700">{lab}<input value={v} onChange={e => set(e.target.value.replace(/[^\d.]/g, '').slice(0, 5))} inputMode="decimal" className={`${inp} mt-1`} /></label>
          ))}
        </div>

        <div className="space-y-2">
          <div className="font-bold text-slate-900">{tx('Charges on top of the price', 'कीमत के ऊपर के शुल्क')}</div>
          {lines.map((l, i) => (
            <div key={l.id} className="space-y-1.5 rounded-lg border border-slate-200 p-2">
              <div className="flex items-center gap-1.5">
                <input value={l.label} onChange={e => setLine(i, { label: e.target.value.slice(0, COST_LIMITS.labelMax) })} aria-label={tx('Charge name', 'शुल्क का नाम')} className={`${inp} !py-1.5`} />
                <button type="button" aria-label={tx('Remove', 'हटाएँ')} onClick={() => setLines(lines.filter((_, j) => j !== i))} className="shrink-0 p-1.5 text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-[1fr_1fr] gap-1.5">
                <div className="flex gap-1">
                  <Chip on={l.mode === 'PER_SQFT'} onClick={() => setLine(i, { mode: 'PER_SQFT' })}>{tx('₹ / sq ft', '₹ / वर्ग फ़ुट')}</Chip>
                  <Chip on={l.mode === 'FIXED'} onClick={() => setLine(i, { mode: 'FIXED' })}>{tx('Fixed ₹', 'तय ₹')}</Chip>
                </div>
                <input value={l.amount} onChange={e => setLine(i, { amount: e.target.value.replace(/[^\d.]/g, '').slice(0, 12) })} inputMode="decimal" placeholder="0" aria-label={tx('Amount', 'रक़म')} className={`${inp} !py-1.5 text-right`} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4">
                <Tog on={l.gst} onChange={v => setLine(i, { gst: v })} label={tx('GST applies', 'जीएसटी लगता है')} />
                <Tog on={l.optional} onChange={v => setLine(i, { optional: v })} label={tx('Customer picks how many', 'ग्राहक गिनती चुनता है')} />
                {l.optional && <label className="flex items-center gap-1 text-slate-600">{tx('up to', 'अधिकतम')}<input value={l.maxQty} onChange={e => setLine(i, { maxQty: e.target.value.replace(/\D/g, '').slice(0, 1) })} inputMode="numeric" className="w-10 rounded border border-slate-300 px-1 py-1 text-center" /></label>}
              </div>
            </div>
          ))}
          {lines.length < COST_LIMITS.lines && <button type="button" onClick={() => setLines([...lines, { id: newId(), label: '', mode: 'FIXED', amount: '', gst: true, optional: false, maxQty: '1' }])} className={btnLine}><Plus className="h-4 w-4" />{tx('Add a charge', 'शुल्क जोड़ें')}</button>}
          <p className="text-[10px] text-slate-500">{tx('“PLC” is the preferred-location charge; a unit can carry its own PLC (Edit unit). A refundable deposit or a society charge: switch “GST applies” off.', '“PLC” पसंदीदा लोकेशन का शुल्क है; किसी यूनिट का अपना PLC भी हो सकता है (यूनिट बदलें)। वापसी-योग्य डिपॉज़िट या सोसाइटी शुल्क के लिए “जीएसटी लगता है” बंद करें।')}</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between"><span className="font-bold text-slate-900">{tx('Payment schedule', 'भुगतान का क्रम')}</span><span className={`font-bold ${Math.abs(total - 100) < 0.01 ? 'text-emerald-700' : 'text-red-600'}`}>{total}% / 100%</span></div>
          {steps.map((s, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_3.2rem_3.2rem_1.5rem] items-center gap-1 [&>*]:min-w-0">
              <input value={s.name} onChange={e => setSteps(steps.map((x, j) => (j === i ? { ...x, name: e.target.value.slice(0, 60) } : x)))} aria-label={tx('Step', 'चरण')} className={`${inp} !py-1.5`} />
              <input value={s.pct} onChange={e => setSteps(steps.map((x, j) => (j === i ? { ...x, pct: e.target.value.replace(/[^\d.]/g, '').slice(0, 5) } : x)))} inputMode="decimal" title="%" aria-label="%" className={`${inp} !px-1 !py-1.5 text-center`} />
              <input value={s.dueInDays} onChange={e => setSteps(steps.map((x, j) => (j === i ? { ...x, dueInDays: e.target.value.replace(/\D/g, '').slice(0, 4) } : x)))} inputMode="numeric" title={tx('days after booking', 'बुकिंग के कितने दिन बाद')} aria-label={tx('days', 'दिन')} className={`${inp} !px-1 !py-1.5 text-center`} />
              <button type="button" aria-label={tx('Remove step', 'चरण हटाएँ')} onClick={() => setSteps(steps.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5 text-slate-400" /></button>
            </div>
          ))}
          <div className="text-[10px] text-slate-500">{tx('Columns: step · % · days after booking', 'कॉलम: चरण · % · बुकिंग के कितने दिन बाद')}</div>
          {steps.length < COST_LIMITS.schedule && <button type="button" onClick={() => setSteps([...steps, { name: '', pct: '', dueInDays: '0' }])} className={btnLine}><Plus className="h-4 w-4" />{tx('Add a step', 'चरण जोड़ें')}</button>}
        </div>

        <div className="grid grid-cols-[6rem_1fr] gap-2">
          <label className="block font-semibold text-slate-700">{tx('Valid (days)', 'मान्य (दिन)')}<input value={valid} onChange={e => setValid(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" className={`${inp} mt-1`} /></label>
          <label className="block font-semibold text-slate-700">{tx('Line printed on every sheet', 'हर शीट पर छपने वाली लाइन')}<input value={note} onChange={e => setNote(e.target.value.slice(0, COST_LIMITS.noteMax))} placeholder={tx('Prices subject to change without notice', 'कीमतें बिना सूचना बदल सकती हैं')} className={`${inp} mt-1`} /></label>
        </div>

        <div className="space-y-2 rounded-xl border border-dashed border-slate-300 p-3">
          <div className="font-bold text-slate-900">{tx('Try it on a sample unit', 'एक सैंपल यूनिट पर देखें')}</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-slate-600">{tx('Price ₹', 'कीमत ₹')}<input value={sp.price} onChange={e => setSp({ ...sp, price: e.target.value.replace(/\D/g, '').slice(0, 11) })} inputMode="numeric" className={`${inp} mt-1 !py-1.5`} /></label>
            <label className="block text-slate-600">{tx('Area sq ft', 'क्षेत्रफ़ल वर्ग फ़ुट')}<input value={sp.area} onChange={e => setSp({ ...sp, area: e.target.value.replace(/[^\d.]/g, '').slice(0, 8) })} inputMode="decimal" className={`${inp} mt-1 !py-1.5`} /></label>
          </div>
          {preview ? <Figures out={preview} /> : <p className="text-[11px] text-slate-500">{problem || tx('Enter a price to see a sheet.', 'शीट देखने के लिए कीमत लिखें।')}</p>}
          {preview && preview.schedule.length > 0 && <ScheduleBar steps={preview.schedule} />}
        </div>

        {problem && <p className="rounded-lg bg-red-50 px-3 py-2 font-medium text-red-700">{problem}</p>}
        <Err msg={err} />
        <button type="button" disabled={busy || !!problem} onClick={() => go(() => api.invCharges(pid, draft), () => onDone(tx('Cost-sheet charges saved', 'कॉस्ट शीट के शुल्क सेव हुए')))} className={`${btnDark} w-full`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{tx('Save charges', 'शुल्क सेव करें')}</button>
      </div>
    </Sheet>
  );
};

// ───────────────────────── one unit's sheet ─────────────────────────
export const UnitCostSheet: React.FC<{ unit: any; projectName: string; leads: any[]; onClose: () => void; onMade?: () => void }> = ({ unit, projectName, leads, onClose, onMade }) => {
  const tx = useTx();
  const { lang } = useI18n();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [pv, setPv] = useState<{ out: CostSheetOut; options: { id: string; label: string; maxQty: number; amount: number; mode: string }[]; validDays: number; note: string; blocked: string } | null>(null);
  const [perr, setPerr] = useState('');
  const [leadId, setLeadId] = useState(leads[0]?.id || '');
  const [client, setClient] = useState(leads[0]?.name || '');
  const [l, setL] = useState<'en' | 'hi'>(lang === 'hi' ? 'hi' : 'en');
  const [note, setNote] = useState('');
  const [showSched, setShowSched] = useState(false);
  const [made, setMade] = useState<{ url: string; validUntil: string; out: CostSheetOut } | null>(null);
  const [flash, setFlash] = useState('');
  const { busy, err, go } = useBusy();
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current; const t = setTimeout(async () => {
      try { const r = await api.costPreview({ unitId: unit.id, qty }); if (n === seq.current) { setPv(r); setPerr(''); } } catch (e: any) { if (n === seq.current) { setPv(null); setPerr(e.message || 'Failed'); } }
    }, 200);
    return () => clearTimeout(t);
  }, [unit.id, qty]);

  const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(''), 2200); };
  const hiL = l === 'hi';
  const text = (url: string, out: CostSheetOut, until: string) => (hiL
    ? `नमस्ते${client ? ` ${client}` : ''}, *${projectName}* की यूनिट *${unit.label}* की कॉस्ट शीट:\nकुल लागत (सब मिलाकर): *${inr(out.allIn)}*\n(कीमत ${inr(out.basic)} + शुल्क + जीएसटी + स्टाम्प/रजिस्ट्रेशन का अनुमान) — ${dshort(until, true)} तक मान्य।\nपूरी शीट: ${url}`
    : `Hello${client ? ` ${client}` : ''}, cost sheet of *${unit.label}* at *${projectName}*:\nAll-in cost: *${inr(out.allIn)}*\n(price ${inr(out.basic)} + charges + GST + stamp duty / registration estimate) — valid till ${dshort(until, false)}.\nFull sheet: ${url}`);
  const setQ = (id: string, n: number, max: number) => setQty(q => ({ ...q, [id]: Math.max(0, Math.min(max, n)) }));
  const pick = (id: string) => { setLeadId(id); const ld = leads.find(x => x.id === id); if (ld) setClient(ld.name); };

  return (
    <Sheet title={tx(`Cost sheet · ${unit.label}`, `कॉस्ट शीट · ${unit.label}`)} onClose={onClose}>
      <div className="space-y-3 text-xs">
        <div className="flex items-center gap-2 text-slate-600"><Receipt className="h-4 w-4 text-slate-400" /><span className="truncate">{projectName} · {unit.group}{unit.config ? ` · ${unit.config}` : ''}{unit.areaSqft ? ` · ${unit.areaSqft} ${tx('sq ft', 'वर्ग फ़ुट')}` : ''}</span></div>

        {!pv && !perr && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}
        {perr && <p className="rounded-lg bg-amber-50 px-3 py-2 font-medium text-amber-900" data-testid="cs-error">{perr}</p>}

        {pv && !made && (
          <>
            {pv.options.length > 0 && (
              <div className="space-y-1.5 rounded-lg border border-slate-200 p-2">
                {pv.options.map(o => {
                  const n = qty[o.id] || 0;
                  return (
                    <div key={o.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0"><b>{o.label}</b><span className="block text-[10px] text-slate-500">{o.mode === 'PER_SQFT' ? `${inr(o.amount)} ${tx('per sq ft', 'प्रति वर्ग फ़ुट')}` : inr(o.amount)} {tx('each', 'प्रत्येक')}</span></span>
                      <span className="flex shrink-0 items-center gap-1">
                        <button type="button" aria-label={tx('Less', 'कम')} disabled={n <= 0} onClick={() => setQ(o.id, n - 1, o.maxQty)} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 disabled:opacity-30"><Minus className="h-4 w-4" /></button>
                        <span className="w-6 text-center text-sm font-bold tabular-nums" data-testid={`cs-qty-${o.id}`}>{n}</span>
                        <button type="button" aria-label={tx('More', 'ज़्यादा')} disabled={n >= o.maxQty} onClick={() => setQ(o.id, n + 1, o.maxQty)} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 disabled:opacity-30"><Plus className="h-4 w-4" /></button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <Figures out={pv.out} />
            {pv.blocked && <p className="rounded-lg bg-amber-50 px-3 py-2 font-medium text-amber-900">{pv.blocked}</p>}

            {pv.out.schedule.length > 0 && (
              <div className="space-y-1.5">
                <button type="button" onClick={() => setShowSched(!showSched)} aria-expanded={showSched} className="flex w-full items-center justify-between font-bold text-slate-800">{tx('Payment schedule', 'भुगतान का क्रम')}<span className="text-slate-400">{showSched ? '–' : '+'}</span></button>
                <ScheduleBar steps={pv.out.schedule} compact={!showSched} />
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500"><Clock className="h-3.5 w-3.5" />{tx(`Valid for ${pv.validDays} days from today — after that the page shows no numbers.`, `आज से ${pv.validDays} दिन मान्य — उसके बाद पेज पर आँकड़े नहीं दिखते।`)}</div>

            <div className="space-y-2 border-t border-slate-100 pt-3">
              {leads.length > 0 && (
                <label className="block font-semibold text-slate-700">{tx('For which customer?', 'किस ग्राहक के लिए?')}
                  <select value={leadId} onChange={e => pick(e.target.value)} className={`${inp} mt-1`}>
                    <option value="">{tx('— not linked to a lead —', '— किसी लीड से जुड़ा नहीं —')}</option>
                    {leads.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </label>
              )}
              <input value={client} onChange={e => setClient(e.target.value.slice(0, 60))} placeholder={tx('Name printed on the sheet (optional)', 'शीट पर छपने वाला नाम (वैकल्पिक)')} className={inp} />
              <input value={note} onChange={e => setNote(e.target.value.slice(0, COST_LIMITS.noteMax))} placeholder={tx('Your own line for this customer (optional)', 'इस ग्राहक के लिए आपकी अपनी लाइन (वैकल्पिक)')} className={inp} />
              <div className="grid grid-cols-2 gap-1.5">{(['en', 'hi'] as const).map(k => <button key={k} type="button" onClick={() => setL(k)} className={`min-h-9 rounded-lg text-[11px] font-semibold ${l === k ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white'}`}>{k === 'en' ? 'English' : 'हिन्दी'}</button>)}</div>
              <Err msg={err} />
              <button type="button" disabled={busy || !!pv.blocked} data-testid="cs-make"
                onClick={() => go(async () => { const r = await api.costCreate({ unitId: unit.id, qty, clientLabel: client, lang: l, ...(leadId ? { leadId } : {}), ...(note.trim() ? { note: note.trim() } : {}) }); setMade({ url: siteUrl(r.path), validUntil: r.validUntil, out: r.out }); onMade?.(); }, () => { /* shown below */ })} className={`${btnDark} w-full`}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}{tx('Make the customer’s sheet', 'ग्राहक की शीट बनाएँ')}
              </button>
            </div>
          </>
        )}

        {made && (
          <div className="space-y-2">
            <div className="rounded-lg bg-emerald-50 p-2 font-semibold text-emerald-800">{tx('Sheet ready', 'शीट तैयार')} · {inr(made.out.allIn)} · {tx('valid till', 'मान्य')} {dshort(made.validUntil, hiL)}</div>
            <div className="break-all rounded-lg bg-slate-100 p-2 font-mono text-[11px]">{made.url}</div>
            <div className="grid grid-cols-2 gap-2">
              <a href={`https://wa.me/?text=${encodeURIComponent(text(made.url, made.out, made.validUntil))}`} target="_blank" rel="noreferrer" className={`${btnDark} bg-emerald-700`}><MessageCircle className="h-4 w-4" />WhatsApp</a>
              <button type="button" onClick={async () => say((await copyText(made.url)) ? tx('Link copied', 'लिंक कॉपी हुआ') : tx('Copy failed', 'कॉपी नहीं हुआ'))} className={btnLine}><Copy className="h-4 w-4" />{tx('Copy link', 'लिंक कॉपी')}</button>
              <button type="button" onClick={async () => say((await copyText(text(made.url, made.out, made.validUntil))) ? tx('Message copied', 'मैसेज कॉपी हुआ') : tx('Copy failed', 'कॉपी नहीं हुआ'))} className={btnLine}><Copy className="h-4 w-4" />{tx('Copy message', 'मैसेज कॉपी')}</button>
              <a href={made.url} target="_blank" rel="noreferrer" className={btnLine}><ExternalLink className="h-4 w-4" />{tx('Open', 'खोलें')}</a>
            </div>
            <p className="flex items-start gap-1.5 text-[10px] text-slate-500"><Printer className="mt-0.5 h-3 w-3 shrink-0" />{tx('The customer can print it or save it as a PDF from the page. You will see here how many times it was opened. The figures are frozen as of today.', 'ग्राहक पेज से इसे प्रिंट या PDF सेव कर सकता है। कितनी बार खुली, यहीं दिखेगा। आँकड़े आज के हिसाब से जम गए हैं।')}</p>
          </div>
        )}
        {flash && <div className="rounded-lg bg-slate-900 px-3 py-2 text-center font-semibold text-white">{flash}</div>}
      </div>
    </Sheet>
  );
};

// ───────────────────────── sheets already sent ─────────────────────────
export const CostSheetsCard: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState(''); const [flash, setFlash] = useState('');
  const load = useCallback(async () => { try { setRows((await api.costSheets()).sheets); } catch (e: any) { setErr(e.message); } }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  const live = (rows || []).filter(r => !r.revoked);
  if (rows && live.length === 0) return null;
  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-xs" data-testid="cs-list">
      <div className="flex items-center gap-1.5 text-sm font-bold"><Receipt className="h-4 w-4 text-slate-500" />{tx('Cost sheets I sent', 'मेरी भेजी कॉस्ट शीट')}</div>
      <Err msg={err} />
      {rows === null && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      <ul className="divide-y divide-slate-100">
        {live.slice(0, 30).map(r => (
          <li key={r.token} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <div className="font-semibold">{r.unitLabel} · {r.projectName}</div>
              <div className="text-[10px] text-slate-500">{r.by ? `${r.by} · ` : ''}{r.clientLabel ? `${r.clientLabel} · ` : ''}{inr(r.allIn)} · {r.expired ? <span className="font-semibold text-red-600">{tx('expired', 'अवधि पूरी')}</span> : `${tx('till', 'तक')} ${dshort(r.validUntil, hi)}`}</div>
              <div className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${r.views > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{r.views > 0 ? tx(`Opened ${r.views}×`, `${r.views} बार खुली`) : tx('Not opened yet', 'अभी खुली नहीं')}</div>
            </div>
            <div className="flex gap-1.5">
              <button type="button" onClick={async () => { setFlash((await copyText(siteUrl(`/s/${r.token}`))) ? tx('Link copied', 'लिंक कॉपी हुआ') : tx('Copy failed', 'कॉपी नहीं हुआ')); setTimeout(() => setFlash(''), 2000); }} className={btnLine}><Copy className="h-3.5 w-3.5" />{tx('Copy', 'कॉपी')}</button>
              <button type="button" onClick={async () => { try { await api.costRevoke(r.token); await load(); } catch (e: any) { setErr(e.message); } }} className={btnLine}><Trash2 className="h-3.5 w-3.5" />{tx('Withdraw', 'वापस लें')}</button>
            </div>
          </li>
        ))}
      </ul>
      {flash && <div className="rounded-lg bg-slate-900 px-3 py-1.5 text-center font-semibold text-white">{flash}</div>}
    </section>
  );
};
