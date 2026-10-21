/**
 * v26 — bypass protection days.
 *  - <ProtectionPicker>: 30 / 60 / 90 / 180 / custom, never above the superadmin's maximum (used by owner consent and mandates)
 *  - <ProtectionAdmin>:  the superadmin sets the maximum ("legal bond limit") and the default
 */
import React, { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { daysLabel, protectionProblem, PROTECTION_CEILING, PROTECTION_MIN, PROTECTION_EXPLAIN, type ProtectionConfig } from '../shared/protectionRules.js';

let cache: ProtectionConfig | null = null;
export function useProtectionConfig() {
  const [cfg, setCfg] = useState<ProtectionConfig | null>(cache);
  useEffect(() => { if (!cache) api.protectionConfig().then(c => { cache = c; setCfg(c); }).catch(() => setCfg({ max: 180, defaultDays: 30, presets: [30, 60, 90, 180], min: 7 })); }, []);
  return cfg;
}
export const clearProtectionCache = () => { cache = null; };

export const ProtectionPicker: React.FC<{ value: number; onChange: (d: number) => void; testId?: string }> = ({ value, onChange, testId = 'protection-picker' }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const cfg = useProtectionConfig();
  const [custom, setCustom] = useState(false);
  if (!cfg) return null;
  const problem = protectionProblem(value, cfg);
  return (
    <div data-testid={testId}>
      <p className="text-xs font-semibold text-slate-700">{tx('Bypass protection', 'बायपास सुरक्षा')} <span className="font-normal text-slate-500">({tx(`at most ${cfg.max} days`, `ज़्यादा से ज़्यादा ${cfg.max} दिन`)})</span></p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {cfg.presets.map(d => (
          <button key={d} type="button" onClick={() => { setCustom(false); onChange(d); }} data-testid={`${testId}-${d}`}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${!custom && value === d ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{daysLabel(d, hi)}</button>
        ))}
        <button type="button" onClick={() => setCustom(true)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${custom ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`} data-testid={`${testId}-custom`}>{tx('Other', 'अपने दिन')}</button>
      </div>
      {custom && <input type="number" min={cfg.min} max={cfg.max} value={value} onChange={e => onChange(Math.round(Number(e.target.value) || 0))} className="mt-2 w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm" data-testid={`${testId}-input`} />}
      {problem ? <p className="mt-1 text-xs text-red-700">{tx(problem.en, problem.hi)}</p> : <p className="mt-1 text-[11px] text-slate-500">{tx(PROTECTION_EXPLAIN.en, PROTECTION_EXPLAIN.hi)}</p>}
    </div>
  );
};

export const ProtectionAdmin: React.FC = () => {
  const tx = useTx(); const { lang } = useI18n();
  const [cfg, setCfg] = useState<ProtectionConfig | null>(null);
  const [max, setMax] = useState(180); const [def, setDef] = useState(30);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { api.protectionConfig().then(c => { setCfg(c); setMax(c.max); setDef(c.defaultDays); }).catch(() => {}); }, []);
  if (!cfg) return null;
  const save = async () => {
    setBusy(true); setMsg(null);
    try { const c = await api.protectionSettings({ maxDays: max, defaultDays: Math.min(def, max) }); setCfg(c); setMax(c.max); setDef(c.defaultDays); clearProtectionCache(); setMsg({ ok: true, text: tx('Saved. New bonds follow this; existing bonds keep their days.', 'सेव हो गया। नए बॉन्ड इसी से बनेंगे; पुराने बॉन्ड के दिन वही रहेंगे।') }); }
    catch (e: any) { setMsg({ ok: false, text: lang === 'hi' && e.body?.hi ? e.body.hi : e.message }); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid="protection-admin">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"><ShieldCheck className="h-4 w-4 text-indigo-600" /> {tx('Bypass protection — legal limit', 'बायपास सुरक्षा — क़ानूनी सीमा')}</h3>
      <p className="mt-1 text-xs text-slate-600">{tx('Brokers choose 30 / 60 / 90 / 180 days or their own number for each owner consent and mandate — never above your maximum. Set the maximum from your advocate’s advice.', 'ब्रोकर हर मालिक-सहमति और मैंडेट के लिए 30 / 60 / 90 / 180 दिन या अपने दिन चुनते हैं — आपकी अधिकतम सीमा से ऊपर कभी नहीं। अधिकतम सीमा अपने वकील की सलाह से रखें।')}</p>
      <label className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-700"><span>{tx(`Maximum days (${PROTECTION_MIN}–${PROTECTION_CEILING})`, `अधिकतम दिन (${PROTECTION_MIN}–${PROTECTION_CEILING})`)}</span>
        <input type="number" min={PROTECTION_MIN} max={PROTECTION_CEILING} value={max} onChange={e => setMax(Math.round(Number(e.target.value) || 0))} className="w-24 rounded border border-slate-300 px-2 py-1" data-testid="protection-max" /></label>
      <label className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-700"><span>{tx('Default when the broker does not choose', 'ब्रोकर न चुने तो डिफ़ॉल्ट')}</span>
        <input type="number" min={PROTECTION_MIN} max={max} value={def} onChange={e => setDef(Math.round(Number(e.target.value) || 0))} className="w-24 rounded border border-slate-300 px-2 py-1" data-testid="protection-default" /></label>
      <button onClick={save} disabled={busy} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" data-testid="protection-save">{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{tx('Save limit', 'सीमा सेव करें')}</button>
      {msg && <p className={`mt-2 text-xs ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.text}</p>}
    </div>
  );
};
