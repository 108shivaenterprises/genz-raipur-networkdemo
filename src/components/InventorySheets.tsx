import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Link2, MessageCircle, Trash2, Eye, EyeOff, Loader2, Download, Users, ExternalLink } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { Sheet, Err, useBusy, inp, btnDark, btnLine, inr } from './CrmPlus.js';
import {
  FACINGS, UNIT_FEATURES, MAX_FEATURES, NOTE_MAX, featureLabel, facingLabel, roadSidesLabel, unitShareLine, inrShort, RATE_PCT_MAX, UNIT_KINDS, CODE_MAX, unitKindOf, type UnitKind,
} from '../shared/inventoryRules.js';

/** v16.8 — sheets and cards for the plot / flat grid. All text is en + hi; every control is a real button (min 36px). */

export const copyText = async (t: string): Promise<boolean> => {
  try { await navigator.clipboard.writeText(t); return true; } catch { return false; }
};
export const siteUrl = (path: string) => `${window.location.origin}${path}`;

export const Chip: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }> = ({ on, onClick, children, disabled }) => (
  <button type="button" disabled={disabled} onClick={onClick}
    className={`min-h-9 rounded-full px-3 text-[11px] font-semibold disabled:opacity-40 ${on ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-900'}`}>{children}</button>
);

export const Tog: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }> = ({ on, onChange, label, hint, disabled }) => (
  <label className={`flex min-h-11 items-start gap-2 text-xs text-slate-700 ${disabled ? 'opacity-50' : ''}`}>
    <input type="checkbox" className="mt-1 h-4 w-4" checked={on} disabled={disabled} onChange={e => onChange(e.target.checked)} />
    <span><b>{label}</b>{hint && <span className="block text-[10px] font-normal text-slate-500">{hint}</span>}</span>
  </label>
);

export const FeaturePicker: React.FC<{ value: string[]; onChange: (v: string[]) => void; max?: number }> = ({ value, onChange, max = MAX_FEATURES }) => {
  const hi = useI18n().lang === 'hi';
  return (
    <div className="flex flex-wrap gap-1.5">
      {UNIT_FEATURES.map(f => {
        const on = value.includes(f.id);
        return <Chip key={f.id} on={on} disabled={!on && value.length >= max} onClick={() => onChange(on ? value.filter(x => x !== f.id) : [...value, f.id])}>{hi ? f.hi : f.en}</Chip>;
      })}
    </div>
  );
};

const SKIP_HI: Record<string, string> = { booked: 'बुक है', 'on hold': 'होल्ड पर', 'no area': 'क्षेत्रफ़ल नहीं', 'no change': 'बदलाव नहीं', 'price would be too low': 'कीमत बहुत कम होगी', 'price would be too high': 'कीमत बहुत ज़्यादा होगी' };

// ───────────────────────── rate change (bulk, with preview) ─────────────────────────
export const RateSheet: React.FC<{ pid: string; unitIds: string[]; onClose: () => void; onDone: (msg: string) => void }> = ({ pid, unitIds, onClose, onDone }) => {
  const tx = useTx();
  const hi = useI18n().lang === 'hi';
  const [mode, setMode] = useState<'PCT' | 'FLAT' | 'PER_SQFT' | 'SET_PER_SQFT'>('PCT');
  const [dir, setDir] = useState<1 | -1>(1);
  const [val, setVal] = useState('');
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(false);
  const [prev, setPrev] = useState<any>(null);
  const { busy, err, go, setErr } = useBusy();
  const n = Number(val);
  const rule = () => ({ mode, value: mode === 'SET_PER_SQFT' ? n : dir * n });
  const reset = () => { setPrev(null); setErr(''); };
  const MODES: [typeof mode, string, string][] = [
    ['PCT', 'By %', '% से'], ['FLAT', 'By ₹ per unit', '₹ प्रति यूनिट'], ['PER_SQFT', 'By ₹ per sq ft', '₹ प्रति वर्ग फ़ुट'], ['SET_PER_SQFT', 'Set ₹ per sq ft', 'सेट ₹/वर्ग फ़ुट'],
  ];
  return (
    <Sheet title={tx(`Change rate — ${unitIds.length} unit(s)`, `रेट बदलें — ${unitIds.length} यूनिट`)} onClose={onClose}>
      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-1.5">
          {MODES.map(([k, en, h]) => <button key={k} type="button" onClick={() => { setMode(k); reset(); }} className={`min-h-9 rounded-lg px-2 text-[11px] font-semibold ${mode === k ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>{tx(en, h)}</button>)}
        </div>
        {mode !== 'SET_PER_SQFT' && (
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => { setDir(1); reset(); }} className={`min-h-9 rounded-lg text-[11px] font-semibold ${dir === 1 ? 'bg-emerald-700 text-white' : 'border border-slate-300 bg-white'}`}>▲ {tx('Increase', 'बढ़ाएँ')}</button>
            <button type="button" onClick={() => { setDir(-1); reset(); }} className={`min-h-9 rounded-lg text-[11px] font-semibold ${dir === -1 ? 'bg-red-700 text-white' : 'border border-slate-300 bg-white'}`}>▼ {tx('Decrease', 'घटाएँ')}</button>
          </div>
        )}
        <input value={val} onChange={e => { setVal(e.target.value.replace(/[^\d.]/g, '')); reset(); }} inputMode="decimal" className={inp}
          placeholder={mode === 'PCT' ? tx(`Percent (max ${RATE_PCT_MAX}% at a time)`, `प्रतिशत (एक बार में अधिकतम ${RATE_PCT_MAX}%)`) : mode === 'FLAT' ? tx('Amount ₹ per unit', 'रकम ₹ प्रति यूनिट') : mode === 'PER_SQFT' ? tx('₹ per sq ft', '₹ प्रति वर्ग फ़ुट') : tx('New rate ₹ per sq ft', 'नया रेट ₹ प्रति वर्ग फ़ुट')} />
        <input value={reason} onChange={e => setReason(e.target.value.slice(0, 120))} className={inp} placeholder={tx('Reason (kept in the rate history)', 'कारण (रेट इतिहास में रहेगा)')} />
        <Tog on={notify} onChange={setNotify} label={tx('Tell my partners about the revision', 'मेरे पार्टनर्स को रेट बदलाव बताएँ')} hint={tx('Posts a “Rates revised” update. The new rates themselves are shown only to partners allowed to see them.', '“रेट बदले” अपडेट जाता है। नए रेट सिर्फ़ उन्हीं पार्टनर को दिखते हैं जिन्हें देखने की अनुमति है।')} />

        {prev && (
          <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div className="font-bold text-slate-800">{tx(`${prev.changes.length} unit(s) will change`, `${prev.changes.length} यूनिट बदलेंगी`)}{prev.skipped.length ? ` · ${tx(`${prev.skipped.length} skipped`, `${prev.skipped.length} छूटेंगी`)}` : ''}</div>
            <ul className="max-h-40 space-y-0.5 overflow-y-auto">
              {prev.changes.slice(0, 12).map((c: any) => <li key={c.id} className="flex justify-between gap-2"><span className="font-semibold">{c.label}</span><span className="text-slate-600">{inrShort(c.from)} → <b className={c.to > c.from ? 'text-emerald-700' : 'text-red-700'}>{inrShort(c.to)}</b></span></li>)}
              {prev.changes.length > 12 && <li className="text-slate-500">+ {prev.changes.length - 12} {tx('more', 'और')}</li>}
            </ul>
            {prev.skipped.length > 0 && <div className="text-[10px] text-slate-500">{tx('Skipped:', 'छूटीं:')} {prev.skipped.slice(0, 6).map((s: any) => `${s.label} (${hi ? SKIP_HI[s.why] || s.why : s.why})`).join(', ')}{prev.skipped.length > 6 ? '…' : ''}</div>}
          </div>
        )}
        <Err msg={err} />
        <p className="text-[10px] text-slate-500">{tx('Rates are rounded to ₹1,000. Held and booked units are never changed. Every change is logged with who and why.', 'रेट ₹1,000 तक राउंड होते हैं। होल्ड और बुक यूनिट कभी नहीं बदलतीं। हर बदलाव कौन/क्यों के साथ लॉग होता है।')}</p>
        <div className="flex gap-2">
          <button type="button" disabled={busy || !(n > 0)} onClick={() => go(async () => setPrev(await api.invBulk(pid, { unitIds, action: 'RATE', rule: rule(), dryRun: true })), () => { /* shown */ })} className={`${btnLine} flex-1`}>{busy && !prev ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{tx('1. Preview', '1. पहले देखें')}</button>
          <button type="button" disabled={busy || !prev || prev.changes.length === 0} onClick={() => { let applied = 0; go(async () => { const r = await api.invBulk(pid, { unitIds, action: 'RATE', rule: rule(), reason, notify }); applied = r.applied; }, () => onDone(tx(`Rate changed on ${applied} unit(s)`, `${applied} यूनिट का रेट बदल गया`))); }} className={`${btnDark} flex-1`}>{tx('2. Apply', '2. लागू करें')}</button>
        </div>
      </div>
    </Sheet>
  );
};

// ───────────────────────── who sees (units or the whole project) ─────────────────────────
export const VisibilitySheet: React.FC<{ pid: string; unitIds?: string[]; current?: any; onClose: () => void; onDone: (msg: string) => void }> = ({ pid, unitIds, current, onClose, onDone }) => {
  const tx = useTx();
  const project = !unitIds;
  const [aud, setAud] = useState<'INHERIT' | 'ALL' | 'SELECTED' | 'HIDDEN'>(project ? (current?.audience || 'ALL') : 'INHERIT');
  const [ids, setIds] = useState<string[]>(current?.brokerIds || []);
  const [priceHidden, setPriceHidden] = useState(!!current?.priceHidden);
  const [clear, setClear] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);
  const { busy, err, go } = useBusy();
  useEffect(() => { api.invPartners(pid).then(r => setPartners(r.partners)).catch(() => { /* picker stays empty */ }); }, [pid]);
  const OPTS: [typeof aud, string, string, string, string][] = [
    ...(project ? [] : [['INHERIT', 'Project default', 'प्रोजेक्ट का डिफ़ॉल्ट', 'Follow the setting of the whole project', 'पूरे प्रोजेक्ट की सेटिंग मानें'] as [typeof aud, string, string, string, string]]),
    ['ALL', 'All my partners', 'मेरे सभी पार्टनर', 'Every partner with an active mandate', 'हर सक्रिय मैंडेट वाला पार्टनर'],
    ['SELECTED', 'Only chosen partners', 'सिर्फ़ चुने हुए पार्टनर', 'Pick who sees it', 'चुनें किसे दिखे'],
    ['HIDDEN', 'Only me', 'सिर्फ़ मैं', 'Nobody else sees it (yet)', 'किसी और को नहीं दिखेगा (अभी)'],
  ];
  const save = () => {
    let msg = '';
    go(async () => {
      if (project) {
        const r = await api.invVisibility(pid, { audience: aud, brokerIds: aud === 'SELECTED' ? ids : [], priceHidden, clearOverrides: clear });
        msg = tx(`Saved${r.cleared ? ` · ${r.cleared} unit override(s) cleared` : ''}`, `सेव हुआ${r.cleared ? ` · ${r.cleared} यूनिट के अलग नियम हटे` : ''}`);
      } else {
        await api.invBulk(pid, { unitIds, action: 'VISIBILITY', vis: aud === 'INHERIT' ? null : { audience: aud, brokerIds: aud === 'SELECTED' ? ids : [], priceHidden } });
        msg = tx(`Visibility set on ${unitIds!.length} unit(s)`, `${unitIds!.length} यूनिट की दृश्यता सेट हुई`);
      }
    }, () => onDone(msg));
  };
  return (
    <Sheet title={project ? tx('Who sees this project’s plots', 'इस प्रोजेक्ट के प्लॉट किसे दिखें') : tx(`Who sees — ${unitIds!.length} unit(s)`, `किसे दिखें — ${unitIds!.length} यूनिट`)} onClose={onClose}>
      <div className="space-y-3 text-xs">
        <div className="space-y-1.5">
          {OPTS.map(([k, en, h, he, hh]) => (
            <button key={k} type="button" onClick={() => setAud(k)} className={`block min-h-11 w-full rounded-lg border px-3 py-2 text-left ${aud === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-800'}`}>
              <div className="font-semibold">{tx(en, h)}</div><div className={`text-[10px] ${aud === k ? 'text-slate-300' : 'text-slate-500'}`}>{tx(he, hh)}</div>
            </button>
          ))}
        </div>
        {aud === 'SELECTED' && (
          <div>
            <div className="mb-1 font-semibold text-slate-700">{tx('Partners', 'पार्टनर')} ({ids.length})</div>
            <div className="flex flex-wrap gap-1.5">
              {partners.map(p => <Chip key={p.brokerId} on={ids.includes(p.brokerId)} onClick={() => setIds(ids.includes(p.brokerId) ? ids.filter(x => x !== p.brokerId) : [...ids, p.brokerId])}>{p.name}{p.company ? ` · ${p.company}` : ''}</Chip>)}
              {partners.length === 0 && <span className="text-slate-400">{tx('No partner with a mandate on this project yet.', 'इस प्रोजेक्ट पर अभी किसी पार्टनर के पास मैंडेट नहीं।')}</span>}
            </div>
          </div>
        )}
        {aud !== 'INHERIT' && aud !== 'HIDDEN' && <Tog on={priceHidden} onChange={setPriceHidden} label={tx('Hide the rate from partners', 'पार्टनर से रेट छुपाएँ')} hint={tx('They see “price on request”. Their staff and customer links cannot show it either.', 'उन्हें “कीमत पूछें” दिखेगा। उनका स्टाफ़ और कस्टमर लिंक भी रेट नहीं दिखा सकते।')} />}
        {project && <Tog on={clear} onChange={setClear} label={tx('Also reset plots that have their own setting', 'जिन प्लॉट का अलग नियम है उन्हें भी रीसेट करें')} />}
        <Err msg={err} />
        <p className="text-[10px] text-slate-500">{tx('A hidden plot cannot be held or booked by a partner who cannot see it. Customer links never show anything the sender cannot see.', 'जो पार्टनर प्लॉट देख नहीं सकता वह उसे होल्ड/बुक नहीं कर सकता। कस्टमर लिंक में वह कुछ नहीं दिखता जो भेजने वाले को नहीं दिखता।')}</p>
        <button type="button" disabled={busy || (aud === 'SELECTED' && ids.length === 0)} onClick={save} className={`${btnDark} w-full`}>{tx('Save', 'सेव करें')}</button>
      </div>
    </Sheet>
  );
};

// ───────────────────────── facts (road sides, facing, tags) — bulk ─────────────────────────
export const FactsSheet: React.FC<{ pid: string; unitIds: string[]; onClose: () => void; onDone: (msg: string) => void }> = ({ pid, unitIds, onClose, onDone }) => {
  const tx = useTx();
  const hi = useI18n().lang === 'hi';
  const [facing, setFacing] = useState('~');       // ~ keep, '' clear
  const [roads, setRoads] = useState('~');
  const [width, setWidth] = useState('');
  const [dims, setDims] = useState('');
  const [note, setNote] = useState('');
  const [add, setAdd] = useState<string[]>([]);
  const [rem, setRem] = useState<string[]>([]);
  const { busy, err, go } = useBusy();
  const detail: any = {};
  if (facing !== '~') detail.facing = facing || null;
  if (roads !== '~') detail.roadSides = roads ? Number(roads) : null;
  if (width.trim()) detail.roadWidthFt = Number(width);
  if (dims.trim()) detail.dimensions = dims.trim();
  if (note.trim()) detail.note = note.trim();
  const nothing = Object.keys(detail).length === 0 && add.length === 0 && rem.length === 0;
  return (
    <Sheet title={tx(`Plot facts — ${unitIds.length} unit(s)`, `प्लॉट की जानकारी — ${unitIds.length} यूनिट`)} onClose={onClose}>
      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <label>{tx('Road sides', 'कितनी तरफ़ सड़क')}
            <select value={roads} onChange={e => setRoads(e.target.value)} className={`${inp} mt-1`}><option value="~">{tx('— keep as is —', '— जैसा है वैसा —')}</option><option value="">{tx('Clear', 'हटाएँ')}</option>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{roadSidesLabel(n, hi)}</option>)}</select></label>
          <label>{tx('Facing', 'दिशा')}
            <select value={facing} onChange={e => setFacing(e.target.value)} className={`${inp} mt-1`}><option value="~">{tx('— keep as is —', '— जैसा है वैसा —')}</option><option value="">{tx('Clear', 'हटाएँ')}</option>{FACINGS.map(f => <option key={f.id} value={f.id}>{hi ? f.hi : f.en}</option>)}</select></label>
          <label>{tx('Road width (ft)', 'सड़क की चौड़ाई (फ़ुट)')}<input value={width} onChange={e => setWidth(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="30" className={`${inp} mt-1`} /></label>
          <label>{tx('Size (e.g. 30 x 50 ft)', 'साइज़ (जैसे 30 x 50 ft)')}<input value={dims} onChange={e => setDims(e.target.value.slice(0, 24))} className={`${inp} mt-1`} /></label>
        </div>
        <div><div className="mb-1 font-semibold text-slate-700">{tx('Add these tags', 'ये टैग जोड़ें')}</div><FeaturePicker value={add} onChange={v => { setAdd(v); setRem(rem.filter(x => !v.includes(x))); }} /></div>
        <div><div className="mb-1 font-semibold text-slate-700">{tx('Remove these tags', 'ये टैग हटाएँ')}</div><FeaturePicker value={rem} onChange={v => { setRem(v); setAdd(add.filter(x => !v.includes(x))); }} max={99} /></div>
        <label className="block">{tx('Note for partners (max 200)', 'पार्टनर के लिए नोट (अधिकतम 200)')}<input value={note} onChange={e => setNote(e.target.value.slice(0, NOTE_MAX))} className={`${inp} mt-1`} /></label>
        <Err msg={err} />
        <button type="button" disabled={busy || nothing} onClick={() => go(() => api.invBulk(pid, { unitIds, action: 'FEATURES', detail, addFeatures: add, removeFeatures: rem }), () => onDone(tx(`Updated ${unitIds.length} unit(s)`, `${unitIds.length} यूनिट अपडेट हुईं`)))} className={`${btnDark} w-full`}>{tx('Apply to selected', 'चुनी हुई पर लागू करें')}</button>
      </div>
    </Sheet>
  );
};

// ───────────────────────── set the kind of many units ─────────────────────────
export const KindSheet: React.FC<{ pid: string; unitIds: string[]; onClose: () => void; onDone: (msg: string) => void }> = ({ pid, unitIds, onClose, onDone }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const [kind, setKind] = useState<UnitKind>('FLAT');
  const { busy, err, go } = useBusy();
  return (
    <Sheet title={tx(`Kind of ${unitIds.length} unit(s)`, `${unitIds.length} यूनिट का प्रकार`)} onClose={onClose}>
      <div className="space-y-3 text-xs">
        <p className="text-slate-600">{tx('Tell GENZ what these are, so partners can filter by it and see a rate card for each kind.', 'GENZ को बताएँ ये क्या हैं, ताकि पार्टनर इससे छाँट सकें और हर प्रकार का रेट कार्ड देख सकें।')}</p>
        <select value={kind} onChange={e => setKind(e.target.value as UnitKind)} className={inp} data-testid="bulk-kind">{UNIT_KINDS.map(k => <option key={k.id} value={k.id}>{hi ? k.hi : k.en}</option>)}</select>
        <Err msg={err} />
        <button type="button" disabled={busy} onClick={() => go(() => api.invBulk(pid, { unitIds, action: 'KIND', unitKind: kind }), () => onDone(tx(`Updated ${unitIds.length} unit(s)`, `${unitIds.length} यूनिट अपडेट हुईं`)))} className={`${btnDark} w-full`}>{tx('Apply to selected', 'चुनी हुई पर लागू करें')}</button>
      </div>
    </Sheet>
  );
};

// ───────────────────────── one unit — full edit ─────────────────────────
export const UnitEditSheet: React.FC<{ unit: any; onClose: () => void; onDone: (msg: string) => void }> = ({ unit, onClose, onDone }) => {
  const tx = useTx();
  const hi = useI18n().lang === 'hi';
  const locked = unit.status === 'HOLD' || unit.status === 'BOOKED';
  const [f, setF] = useState({
    price: String(unit.price ?? ''), reason: '', config: unit.config || '', areaSqft: unit.areaSqft ? String(unit.areaSqft) : '',
    facing: unit.facing || '', roadSides: unit.roadSides ? String(unit.roadSides) : '', roadWidthFt: unit.roadWidthFt ? String(unit.roadWidthFt) : '',
    dimensions: unit.dimensions || '', note: unit.note || '', kind: unitKindOf(unit) as UnitKind, code: unit.code || '',
  });
  const [feats, setFeats] = useState<string[]>(unit.features || []);
  const { busy, err, go } = useBusy();
  const body = () => {
    const b: any = {};
    if (!locked && Number(f.price) > 0 && Number(f.price) !== unit.price) { b.price = Number(f.price); if (f.reason.trim()) b.reason = f.reason.trim(); }
    if (f.config.trim() !== (unit.config || '')) b.config = f.config.trim();
    if (f.kind !== unitKindOf(unit)) b.kind = f.kind;
    if (f.code.trim() !== (unit.code || '')) b.code = f.code.trim() || null;
    if (f.areaSqft && Number(f.areaSqft) !== unit.areaSqft) b.areaSqft = Number(f.areaSqft);
    if (f.facing !== (unit.facing || '')) b.facing = f.facing || null;
    if (f.roadSides !== (unit.roadSides ? String(unit.roadSides) : '')) b.roadSides = f.roadSides ? Number(f.roadSides) : null;
    if (f.roadWidthFt !== (unit.roadWidthFt ? String(unit.roadWidthFt) : '')) b.roadWidthFt = f.roadWidthFt ? Number(f.roadWidthFt) : null;
    if (f.dimensions.trim() !== (unit.dimensions || '')) b.dimensions = f.dimensions.trim() || null;
    if (f.note.trim() !== (unit.note || '')) b.note = f.note.trim() || null;
    if (feats.slice().sort().join() !== (unit.features || []).slice().sort().join()) b.features = feats;
    return b;
  };
  const b = body();
  const newRate = Number(f.price) > 0 && Number(f.areaSqft) > 0 ? Math.round(Number(f.price) / Number(f.areaSqft)) : 0;
  return (
    <Sheet title={tx(`Edit ${unit.label}`, `${unit.label} बदलें`)} onClose={onClose}>
      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2">{tx('Rate ₹', 'रेट ₹')}{locked && <span className="ml-1 text-[10px] text-amber-700">({tx('locked — held / booked', 'लॉक — होल्ड / बुक')})</span>}
            <input value={f.price} disabled={locked} onChange={e => setF({ ...f, price: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className={`${inp} mt-1 disabled:bg-slate-100`} /></label>
          {newRate > 0 && <div className="col-span-2 -mt-1 text-[10px] text-slate-500">≈ {inr(newRate)} {tx('per sq ft', 'प्रति वर्ग फ़ुट')}</div>}
          {!locked && b.price !== undefined && <input value={f.reason} onChange={e => setF({ ...f, reason: e.target.value.slice(0, 120) })} placeholder={tx('Reason for the rate change', 'रेट बदलने का कारण')} className={`${inp} col-span-2`} />}
          <label>{tx('Kind', 'प्रकार (किस्म)')}<select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as UnitKind })} className={`${inp} mt-1`} data-testid="edit-kind">{UNIT_KINDS.map(k => <option key={k.id} value={k.id}>{hi ? k.hi : k.en}</option>)}</select></label>
          <label>{tx('Code', 'कोड')}<input value={f.code} onChange={e => setF({ ...f, code: e.target.value.slice(0, CODE_MAX) })} placeholder="GR-0001" className={`${inp} mt-1`} data-testid="edit-code" /></label>
          <label className="col-span-2">{tx('Type (2 BHK, 3 BHK, 30x50…)', 'प्रकार (2 BHK, 3 BHK, 30x50…)')}<input value={f.config} onChange={e => setF({ ...f, config: e.target.value })} className={`${inp} mt-1`} /></label>
          <label>{tx('Area (sq ft)', 'क्षेत्रफ़ल (वर्ग फ़ुट)')}<input value={f.areaSqft} onChange={e => setF({ ...f, areaSqft: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" className={`${inp} mt-1`} /></label>
          <label>{tx('Road sides', 'कितनी तरफ़ सड़क')}<select value={f.roadSides} onChange={e => setF({ ...f, roadSides: e.target.value })} className={`${inp} mt-1`}><option value="">—</option>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{roadSidesLabel(n, hi)}</option>)}</select></label>
          <label>{tx('Facing', 'दिशा')}<select value={f.facing} onChange={e => setF({ ...f, facing: e.target.value })} className={`${inp} mt-1`}><option value="">—</option>{FACINGS.map(x => <option key={x.id} value={x.id}>{hi ? x.hi : x.en}</option>)}</select></label>
          <label>{tx('Road width (ft)', 'सड़क चौड़ाई (फ़ुट)')}<input value={f.roadWidthFt} onChange={e => setF({ ...f, roadWidthFt: e.target.value.replace(/[^\d.]/g, '') })} inputMode="decimal" className={`${inp} mt-1`} /></label>
          <label>{tx('Size', 'साइज़')}<input value={f.dimensions} onChange={e => setF({ ...f, dimensions: e.target.value.slice(0, 24) })} placeholder="30 x 50 ft" className={`${inp} mt-1`} /></label>
        </div>
        <div><div className="mb-1 font-semibold text-slate-700">{tx('Tags', 'टैग')}</div><FeaturePicker value={feats} onChange={setFeats} /></div>
        <label className="block">{tx('Note for partners', 'पार्टनर के लिए नोट')}<input value={f.note} onChange={e => setF({ ...f, note: e.target.value.slice(0, NOTE_MAX) })} className={`${inp} mt-1`} /></label>
        {(unit.priceHistory || []).length > 0 && (
          <div className="rounded-lg bg-slate-50 p-2"><div className="mb-1 font-semibold text-slate-700">{tx('Rate history', 'रेट इतिहास')}</div>
            <ul className="space-y-0.5 text-[10px] text-slate-600">{(unit.priceHistory as any[]).slice(0, 5).map((h, i) => <li key={i}>{new Date(h.at).toLocaleDateString('en-IN', { dateStyle: 'medium' })} · <b>{inr(h.price)}</b> · {h.by}{h.reason ? ` · ${h.reason}` : ''}</li>)}</ul></div>
        )}
        <Err msg={err} />
        <button type="button" disabled={busy || Object.keys(b).length === 0} onClick={() => go(() => api.invUnit(unit.id, b), () => onDone(tx('Saved', 'सेव हुआ')))} className={`${btnDark} w-full`}>{tx('Save changes', 'बदलाव सेव करें')}</button>
      </div>
    </Sheet>
  );
};

// ───────────────────────── share with a customer ─────────────────────────
export const ShareSheet: React.FC<{ pid: string; projectName: string; units: any[]; caps: any; onClose: () => void }> = ({ pid, projectName, units, caps, onClose }) => {
  const tx = useTx();
  const { lang } = useI18n();
  const canPrice = !!caps?.seesPrice && units.every(u => u.price != null);
  const canFeat = caps?.member ? !!caps.member.features : true;
  const [price, setPrice] = useState(false);
  const [feat, setFeat] = useState(canFeat);
  const [client, setClient] = useState('');
  const [l, setL] = useState<'en' | 'hi'>(lang === 'hi' ? 'hi' : 'en');
  const [made, setMade] = useState<{ url: string; price: boolean; feat: boolean; capped: boolean } | null>(null);
  const [flash, setFlash] = useState('');
  const { busy, err, go } = useBusy();
  const hiL = l === 'hi';
  const flags = made ? { showPrice: made.price, showFeatures: made.feat } : { showPrice: price && canPrice, showFeatures: feat && canFeat };
  const text = (withLink: boolean) => {
    const head = hiL ? `नमस्ते${client ? ` ${client}` : ''}, *${projectName}* के ये प्लॉट/यूनिट देखें:` : `Hello${client ? ` ${client}` : ''}, here are the units at *${projectName}*:`;
    const lines = units.map(u => unitShareLine({ label: u.label, group: u.group, config: u.config, areaSqft: u.areaSqft, price: flags.showPrice ? u.price : undefined, facing: u.facing, roadSides: u.roadSides, roadWidthFt: u.roadWidthFt, dimensions: u.dimensions, features: u.features, note: u.note }, flags, hiL));
    return [head, '', ...lines, ...(withLink && made ? ['', hiL ? `पूरा विवरण: ${made.url}` : `Full details: ${made.url}`] : [])].join('\n');
  };
  const say = (m: string) => { setFlash(m); setTimeout(() => setFlash(''), 2500); };
  return (
    <Sheet title={tx(`Send ${units.length} unit(s) to a customer`, `${units.length} यूनिट ग्राहक को भेजें`)} onClose={onClose}>
      <div className="space-y-3 text-xs">
        <div className="flex flex-wrap gap-1">{units.slice(0, 12).map(u => <span key={u.id} className="rounded bg-slate-100 px-2 py-1 font-semibold">{u.label}</span>)}{units.length > 12 && <span className="px-1 py-1 text-slate-500">+{units.length - 12}</span>}</div>
        {!made && (
          <>
            <div className="rounded-lg border border-slate-200 p-2">
              <Tog on={price && canPrice} onChange={setPrice} disabled={!canPrice} label={tx('Show the rate to this customer', 'इस ग्राहक को रेट दिखाएँ')} hint={canPrice ? tx('Off = the page says “price on request”.', 'बंद = पेज पर “कीमत पूछें” लिखा आएगा।') : tx('You cannot show the rate — it is hidden from you.', 'आप रेट नहीं दिखा सकते — वह आपसे छुपा है।')} />
              <Tog on={feat && canFeat} onChange={setFeat} disabled={!canFeat} label={tx('Show road sides, facing & features', 'सड़क, दिशा और खूबियाँ दिखाएँ')} hint={canFeat ? undefined : tx('Not allowed for your account.', 'आपके अकाउंट को अनुमति नहीं।')} />
            </div>
            <input value={client} onChange={e => setClient(e.target.value.slice(0, 60))} placeholder={tx('Customer name (only for you, optional)', 'ग्राहक का नाम (सिर्फ़ आपके लिए, वैकल्पिक)')} className={inp} />
            <div className="grid grid-cols-2 gap-1.5">{(['en', 'hi'] as const).map(k => <button key={k} type="button" onClick={() => setL(k)} className={`min-h-9 rounded-lg text-[11px] font-semibold ${l === k ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white'}`}>{k === 'en' ? 'English' : 'हिन्दी'}</button>)}</div>
            <Err msg={err} />
            <button type="button" disabled={busy} onClick={() => go(async () => { const r = await api.invShareCreate({ projectId: pid, unitIds: units.map(u => u.id), showPrice: price && canPrice, showFeatures: feat && canFeat, clientLabel: client, lang: l }); setMade({ url: siteUrl(r.path), price: r.showPrice, feat: r.showFeatures, capped: r.capped }); }, () => { /* result shown below */ })} className={`${btnDark} w-full`}><Link2 className="h-4 w-4" />{tx('Create customer link', 'ग्राहक का लिंक बनाएँ')}</button>
            <button type="button" onClick={async () => say((await copyText(text(false))) ? tx('Text copied', 'टेक्स्ट कॉपी हुआ') : tx('Copy failed', 'कॉपी नहीं हुआ'))} className={`${btnLine} w-full`}><Copy className="h-4 w-4" />{tx('Just copy the details as text (no link)', 'सिर्फ़ टेक्स्ट कॉपी करें (लिंक नहीं)')}</button>
          </>
        )}
        {made && (
          <div className="space-y-2">
            <div className="rounded-lg bg-emerald-50 p-2 font-semibold text-emerald-800">{tx('Link ready', 'लिंक तैयार')} · {made.price ? tx('rate shown', 'रेट दिखेगा') : tx('rate hidden', 'रेट छुपा')} · {made.feat ? tx('features shown', 'खूबियाँ दिखेंगी') : tx('features hidden', 'खूबियाँ छुपी')}</div>
            {made.capped && <p className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">{tx('Some things you asked to show are not open to you, so they were left out.', 'आपने जो दिखाना चाहा उसमें से कुछ आपके लिए खुला नहीं है, इसलिए छोड़ दिया गया।')}</p>}
            <div className="break-all rounded-lg bg-slate-100 p-2 font-mono text-[11px]">{made.url}</div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={async () => say((await copyText(made.url)) ? tx('Link copied', 'लिंक कॉपी हुआ') : tx('Copy failed', 'कॉपी नहीं हुआ'))} className={btnLine}><Copy className="h-4 w-4" />{tx('Copy link', 'लिंक कॉपी')}</button>
              <button type="button" onClick={async () => say((await copyText(text(true))) ? tx('Message copied', 'मैसेज कॉपी हुआ') : tx('Copy failed', 'कॉपी नहीं हुआ'))} className={btnLine}><Copy className="h-4 w-4" />{tx('Copy message', 'मैसेज कॉपी')}</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(text(true))}`} target="_blank" rel="noreferrer" className={`${btnDark} bg-emerald-700`}><MessageCircle className="h-4 w-4" />WhatsApp</a>
              <a href={made.url} target="_blank" rel="noreferrer" className={btnLine}><ExternalLink className="h-4 w-4" />{tx('Preview', 'प्रिव्यू')}</a>
            </div>
            <p className="text-[10px] text-slate-500">{tx('The page shows only plots that are still available, with your firm’s contact card. You can revoke the link any time under “My customer links”.', 'पेज पर सिर्फ़ वही प्लॉट दिखते हैं जो अब भी उपलब्ध हैं, और आपकी फ़र्म का कॉन्टैक्ट कार्ड। लिंक कभी भी “मेरे कस्टमर लिंक” से बंद कर सकते हैं।')}</p>
          </div>
        )}
        {flash && <div className="rounded-lg bg-slate-900 px-3 py-2 text-center font-semibold text-white">{flash}</div>}
      </div>
    </Sheet>
  );
};

// ───────────────────────── post to the team ─────────────────────────
export const PostSheet: React.FC<{ pid: string; units: any[]; onClose: () => void; onDone: (msg: string) => void }> = ({ pid, units, onClose, onDone }) => {
  const tx = useTx();
  const [members, setMembers] = useState<any[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [price, setPrice] = useState(false);
  const [feat, setFeat] = useState(true);
  const [note, setNote] = useState('');
  const [days, setDays] = useState(0);
  const { busy, err, go } = useBusy();
  const canPrice = units.every(u => u.price != null);
  useEffect(() => { api.tcControl().then(r => setMembers((r.members || []).filter((m: any) => m.status === 'VERIFIED'))).catch(() => { /* empty list */ }); }, []);
  let capped = false;
  return (
    <Sheet title={tx(`Show ${units.length} unit(s) to my team`, `${units.length} यूनिट मेरी टीम को दिखाएँ`)} onClose={onClose}>
      <div className="space-y-3 text-xs">
        <div>
          <div className="mb-1 font-semibold text-slate-700">{tx('Who', 'किसे')}</div>
          <div className="flex flex-wrap gap-1.5">
            <Chip on={ids.length === 0} onClick={() => setIds([])}><Users className="mr-1 inline h-3 w-3" />{tx('Whole team', 'पूरी टीम')}</Chip>
            {members.map(m => <Chip key={m.id} on={ids.includes(m.id)} onClick={() => setIds(ids.includes(m.id) ? ids.filter(x => x !== m.id) : [...ids, m.id])}>{m.name}{m.title ? ` · ${m.title}` : ''}</Chip>)}
          </div>
          {members.length === 0 && <p className="mt-1 text-slate-400">{tx('No verified team member yet.', 'अभी कोई वेरिफ़ाइड टीम सदस्य नहीं।')}</p>}
        </div>
        <div className="rounded-lg border border-slate-200 p-2">
          <Tog on={price && canPrice} onChange={setPrice} disabled={!canPrice} label={tx('Staff may see the rate', 'स्टाफ़ को रेट दिखे')} hint={canPrice ? tx('Also needs “can see rate” switched on for that person in Team Control.', 'उस व्यक्ति के लिए Team Control में “रेट देख सकता” भी चालू होना चाहिए।') : tx('The rate is hidden from you, so it cannot be shown to staff.', 'रेट आपसे छुपा है, इसलिए स्टाफ़ को नहीं दिख सकता।')} />
          <Tog on={feat} onChange={setFeat} label={tx('Staff may see road sides, facing, features', 'स्टाफ़ को सड़क, दिशा, खूबियाँ दिखें')} />
        </div>
        <input value={note} onChange={e => setNote(e.target.value.slice(0, 200))} placeholder={tx('Note for the team (e.g. “push this week”)', 'टीम के लिए नोट (जैसे “इस हफ़्ते पुश करें”)')} className={inp} />
        <div>
          <div className="mb-1 font-semibold text-slate-700">{tx('Show for', 'कितने दिन दिखे')}</div>
          <div className="flex gap-1.5">{([[0, 'Until I end it', 'जब तक मैं बंद न करूँ'], [1, '1 day', '1 दिन'], [3, '3 days', '3 दिन'], [7, '7 days', '7 दिन']] as const).map(([d, en, hi]) => <Chip key={d} on={days === d} onClick={() => setDays(d)}>{tx(en, hi)}</Chip>)}</div>
        </div>
        <Err msg={err} />
        <button type="button" disabled={busy} onClick={() => go(async () => { const r = await api.invPostCreate({ projectId: pid, unitIds: units.map(u => u.id), memberIds: ids, showPrice: price && canPrice, showFeatures: feat, note, endsAt: days ? new Date(Date.now() + days * 86400_000).toISOString() : undefined }); capped = r.priceCapped; }, () => onDone(capped ? tx('Posted (rate left hidden — it is not open to you)', 'पोस्ट हो गया (रेट छुपा रहा — वह आपके लिए खुला नहीं)') : tx('Posted to your team', 'टीम को दिख गया')))} className={`${btnDark} w-full`}>{tx('Post to team', 'टीम को दिखाएँ')}</button>
      </div>
    </Sheet>
  );
};

// ───────────────────────── team board + team access ─────────────────────────
export const TeamBoardCard: React.FC<{ pid: string; canPost: boolean; refreshKey: number; onChanged: () => void }> = ({ pid, canPost, refreshKey, onChanged }) => {
  const tx = useTx();
  const [posts, setPosts] = useState<any[] | null>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try {
      const r = await api.invPosts(pid); setPosts(r.posts);
      if (canPost) { const t = await api.tcControl(); setTeam((t.members || []).filter((m: any) => m.status === 'VERIFIED')); }
    } catch (e: any) { setErr(e.message); }
  }, [pid, canPost]);
  useEffect(() => { load(); }, [load, refreshKey]);
  const setPol = async (id: string, patch: any) => { try { await api.tcPolicy(id, patch); await load(); onChanged(); } catch (e: any) { setErr(e.message); } };
  const end = async (id: string) => { try { await api.invPostEnd(id); await load(); } catch (e: any) { setErr(e.message); } };
  const live = (posts || []).filter(p => p.live);
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-xs">
      <div className="text-sm font-bold">{canPost ? tx('Team board — who sees which plots', 'टीम बोर्ड — किसे कौन-से प्लॉट दिखें') : tx('From your employer', 'आपके मालिक की तरफ़ से')}</div>
      <Err msg={err} />
      {posts === null && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      {posts && live.length === 0 && <p className="text-slate-500">{canPost ? tx('No live post. Select plots in the grid and tap “Show to team”.', 'कोई लाइव पोस्ट नहीं। ग्रिड में प्लॉट चुनकर “टीम को दिखाएँ” दबाएँ।') : tx('Nothing posted for you right now.', 'अभी आपके लिए कुछ पोस्ट नहीं है।')}</p>}
      <ul className="space-y-2">
        {live.map(p => (
          <li key={p.id} className="rounded-lg border border-slate-200 p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><div className="font-semibold">{p.projectName} · {p.unitLabels.slice(0, 8).join(', ')}{p.unitLabels.length > 8 ? ` +${p.unitLabels.length - 8}` : ''}</div>
                <div className="text-[10px] text-slate-500">{p.memberIds.length ? p.memberNames.join(', ') : tx('Whole team', 'पूरी टीम')} · {p.showPrice ? tx('rate shown', 'रेट दिखता') : tx('rate hidden', 'रेट छुपा')} · {p.showFeatures ? tx('features shown', 'खूबियाँ दिखती') : tx('features hidden', 'खूबियाँ छुपी')}{p.endsAt ? ` · ${tx('till', 'तक')} ${new Date(p.endsAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}` : ''}</div>
                {p.note && <div className="mt-0.5 text-slate-700">“{p.note}”</div>}</div>
              {canPost && <button type="button" onClick={() => end(p.id)} className={btnLine}>{tx('End', 'बंद करें')}</button>}
            </div>
          </li>
        ))}
      </ul>
      {canPost && team.length > 0 && (
        <div>
          <div className="mb-1 font-bold text-slate-700">{tx('Each staff member’s unit access', 'हर स्टाफ़ की यूनिट एक्सेस')}</div>
          <div className="space-y-2">
            {team.map(m => { const p = m.policy; return (
              <div key={m.id} className="rounded-lg border border-slate-200 p-2">
                <div className="mb-1 font-semibold">{m.name}{m.title ? <span className="font-normal text-slate-500"> · {m.title}</span> : null}</div>
                <div className="flex flex-wrap gap-1.5">
                  {([['OFF', 'Off', 'बंद'], ['SHARED', 'Posted only', 'सिर्फ़ पोस्ट'], ['ALL', 'Everything', 'सब']] as const).map(([k, en, hi]) => <Chip key={k} on={(p.invMode || 'OFF') === k} onClick={() => setPol(m.id, { invMode: k })}>{tx(en, hi)}</Chip>)}
                  {(p.invMode || 'OFF') !== 'OFF' && <>
                    <Chip on={!!p.invPrice} onClick={() => setPol(m.id, { invPrice: !p.invPrice })}>{p.invPrice ? <Eye className="mr-1 inline h-3 w-3" /> : <EyeOff className="mr-1 inline h-3 w-3" />}{tx('Rate', 'रेट')}</Chip>
                    <Chip on={p.invFeatures !== false} onClick={() => setPol(m.id, { invFeatures: p.invFeatures === false })}>{tx('Features', 'खूबियाँ')}</Chip>
                    <Chip on={!!p.invShareOut} onClick={() => setPol(m.id, { invShareOut: !p.invShareOut })}>{tx('Customer link', 'कस्टमर लिंक')}</Chip>
                  </>}
                </div>
              </div>
            ); })}
          </div>
        </div>
      )}
    </section>
  );
};

// ───────────────────────── my customer links ─────────────────────────
export const MyLinksCard: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const tx = useTx();
  const [links, setLinks] = useState<any[] | null>(null);
  const [err, setErr] = useState(''); const [flash, setFlash] = useState('');
  const load = useCallback(async () => { try { setLinks((await api.invShares()).links); } catch (e: any) { setErr(e.message); } }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  const revoke = async (t: string) => { try { await api.invShareRevoke(t); await load(); } catch (e: any) { setErr(e.message); } };
  const live = (links || []).filter(l => !l.revoked);
  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-xs">
      <div className="text-sm font-bold">{tx('My customer links', 'मेरे कस्टमर लिंक')}</div>
      <Err msg={err} />
      {links === null && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      {links && live.length === 0 && <p className="text-slate-500">{tx('No live link. Select plots and tap “Send to customer”.', 'कोई लाइव लिंक नहीं। प्लॉट चुनकर “ग्राहक को भेजें” दबाएँ।')}</p>}
      <ul className="divide-y divide-slate-100">
        {live.slice(0, 30).map(l => (
          <li key={l.token} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0"><div className="font-semibold">{l.projectName} · {l.unitLabels.slice(0, 5).join(', ')}{l.unitLabels.length > 5 ? ` +${l.unitLabels.length - 5}` : ''}</div>
              <div className="text-[10px] text-slate-500">{l.by ? `${l.by} · ` : ''}{l.clientLabel ? `${l.clientLabel} · ` : ''}{l.views} {tx('views', 'व्यू')} · {l.showPrice ? tx('rate on', 'रेट चालू') : tx('rate off', 'रेट बंद')}</div></div>
            <div className="flex gap-1.5">
              <button type="button" onClick={async () => { setFlash((await copyText(siteUrl(`/s/${l.token}`))) ? tx('Link copied', 'लिंक कॉपी हुआ') : tx('Copy failed', 'कॉपी नहीं हुआ')); setTimeout(() => setFlash(''), 2000); }} className={btnLine}><Copy className="h-3.5 w-3.5" />{tx('Copy', 'कॉपी')}</button>
              <button type="button" onClick={() => revoke(l.token)} className={btnLine}><Trash2 className="h-3.5 w-3.5" />{tx('Revoke', 'बंद करें')}</button>
            </div>
          </li>
        ))}
      </ul>
      {flash && <div className="rounded-lg bg-slate-900 px-3 py-1.5 text-center font-semibold text-white">{flash}</div>}
    </section>
  );
};

// ───────────────────────── paste a sheet ─────────────────────────
const COLS = ['group', 'label', 'kind', 'code', 'config', 'areaSqft', 'price', 'floor', 'facing', 'roadSides', 'roadWidthFt', 'dimensions', 'features', 'note'];
const TEMPLATE = `${COLS.join(',')}\nPhase 1,P-101,Plot,GR-0101,Plot,1500,2550000,,East,3,30,30 x 50 ft,Corner;Vastu-friendly,Corner plot near the park\nPhase 1,P-102,Plot,GR-0102,Plot,1200,1980000,,North,2,24,30 x 40 ft,Park facing,\nTower A,A-1501,Penthouse,GR-0201,4 BHK,2600,21000000,15,East,,,,Terrace;Penthouse,Top floor\nPhase 2,V-7,Villa,GR-0301,3 BHK,1800,9500000,,North,2,30,40 x 50 ft,,Independent house`;

function parseSheet(text: string): any[] {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const split = (line: string) => { const out: string[] = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) { const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (c === delim && !q) { out.push(cur.trim()); cur = ''; } else cur += c; }
    out.push(cur.trim()); return out; };
  const head = split(lines[0]).map(h => h.replace(/\s+/g, '').toLowerCase());
  const idx = (k: string) => head.indexOf(k.toLowerCase());
  return lines.slice(1).map(l => { const c = split(l); const row: any = {}; COLS.forEach(k => { const i = idx(k); if (i >= 0) row[k] = c[i] ?? ''; }); return row; });
}

export const ImportCard: React.FC<{ pid: string; onDone: (msg: string) => void }> = ({ pid, onDone }) => {
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [errs, setErrs] = useState<{ row: number; error: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const rows = useMemo(() => parseSheet(text), [text]);
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' })); a.download = 'genz-units-template.csv'; a.click(); URL.revokeObjectURL(a.href); };
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left text-sm font-bold">{tx('Add / update many units from a sheet', 'शीट से कई यूनिट जोड़ें / अपडेट करें')}<span className="text-slate-400">{open ? '–' : '+'}</span></button>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-slate-600">{tx('Copy rows from Excel / Google Sheets (with the header row) and paste here. Existing labels are updated (rate, size, features) unless they are held or booked; new labels are added. If any row is wrong, nothing is saved.', 'Excel / Google Sheets से हेडर समेत रो कॉपी करके यहाँ पेस्ट करें। जो लेबल पहले से हैं उनका रेट/साइज़/खूबियाँ अपडेट होंगी (होल्ड/बुक को छोड़कर); नए लेबल जुड़ेंगे। कोई रो गलत हो तो कुछ भी सेव नहीं होता।')}</p>
          <p className="font-mono text-[10px] text-slate-500">{COLS.join(' | ')}</p>
          <textarea value={text} onChange={e => { setText(e.target.value); setErrs([]); setErr(''); }} rows={6} className={`${inp} font-mono text-[11px]`} placeholder={TEMPLATE} />
          <Err msg={err} />
          {errs.length > 0 && <ul className="space-y-0.5 rounded-lg bg-red-50 p-2 text-red-700">{errs.map((e, i) => <li key={i}>{tx('Row', 'रो')} {e.row}: {e.error}</li>)}</ul>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={download} className={btnLine}><Download className="h-4 w-4" />{tx('Template (CSV)', 'टेम्पलेट (CSV)')}</button>
            <button type="button" disabled={busy || rows.length === 0} onClick={async () => {
              setErrs([]); setErr(''); setBusy(true);
              let res: any;
              try { res = await api.invImport(pid, rows); } catch (e: any) { setErr(e.message); setErrs(e.body?.errors || []); setBusy(false); return; }
              setBusy(false); setText(''); onDone(tx(`${res.created} added, ${res.updated} updated`, `${res.created} जुड़ीं, ${res.updated} अपडेट हुईं`));
            }} className={btnDark}>{tx(`Import ${rows.length} row(s)`, `${rows.length} रो इम्पोर्ट करें`)}</button>
          </div>
        </div>
      )}
    </section>
  );
};

export { FACINGS, featureLabel, facingLabel, roadSidesLabel, inrShort };
