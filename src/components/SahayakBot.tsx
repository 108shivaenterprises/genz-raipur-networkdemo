/**
 * v151 — GENZ Sahayak as a menu bot (like a WhatsApp business bot): it asks one thing at a time and gives the answers as buttons,
 * so a broker never has to know a "format". Adding a client's requirement goes: buy / rent → what → where → budget → name → phone → check → save,
 * then the homes that fit. Everything is saved through the normal requirement API (same rules, same checks). Free typing is still there
 * under "Type it myself" (the Copilot).
 */
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';
import { goto } from '../lib/goto.js';
import { lazyView } from '../lib/lazyView.js';
import { isValidIndianPhone, sanitizePhone } from '../lib/validate.js';
import { PROPERTY_TYPES } from '../shared/india.js';
import { AreaChips } from './AreaChips.js';

const CopilotPanel = lazyView(() => import('./CopilotPanel.js'), 'CopilotPanel');
type Step = 'menu' | 'deal' | 'type' | 'city' | 'area' | 'budget' | 'name' | 'phone' | 'confirm' | 'done' | 'free';
type Need = { deal?: 'Sale' | 'Rent'; type?: string; city: string; areas: string[]; budget?: number; name: string; phone: string };
const QUICK_TYPES: [string, string, string][] = [['Residential Flat', 'Flat', 'फ़्लैट'], ['Independent House', 'House', 'मकान'], ['Residential Plot', 'Plot', 'प्लॉट'], ['Commercial Shop', 'Shop', 'दुकान'], ['Commercial Office', 'Office', 'ऑफ़िस']];
const BUDGETS = { Sale: [2e6, 4e6, 6e6, 8e6, 1e7, 1.5e7, 2e7, 3e7], Rent: [8e3, 12e3, 15e3, 2e4, 3e4, 5e4] };
const UNITS: [number, string, string][] = [[1e3, 'Thousand', 'हज़ार'], [1e5, 'Lakh', 'लाख'], [1e7, 'Crore', 'करोड़']];
const opt = 'min-h-11 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 active:bg-slate-100';
const go = 'min-h-11 rounded-full bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-40';
const field = 'min-h-11 min-w-0 flex-1 rounded-full border border-slate-300 bg-white px-4 text-base';

export const SahayakBot: React.FC = () => {
  const tx = useTx();
  const [step, setStep] = useState<Step>('menu');
  const [log, setLog] = useState<{ me?: boolean; text: string }[]>([]);
  const [need, setNeed] = useState<Need>({ city: '', areas: [], name: '', phone: '' });
  const [typed, setTyped] = useState(''); const [unit, setUnit] = useState(1e5); const [allTypes, setAllTypes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ id: string; homes: any[] } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { api.getMe().then((m: any) => setNeed(n => ({ ...n, city: n.city || m?.user?.city || '' }))).catch(() => undefined); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [log, step, saved]);

  const say = (mine: string, bot: string, next: Step) => { setLog(l => [...l, { me: true, text: mine }, { text: bot }]); setTyped(''); setStep(next); };
  const restart = () => { setLog([]); setSaved(null); setTyped(''); setAllTypes(false); setNeed(n => ({ city: n.city, areas: [], name: '', phone: '' })); setStep('menu'); };
  const tab = (t: string) => window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: t }));
  const askArea = (city: string) => tx(`Which area of ${city}? Tap or type. You can pick more than one.`, `${city} का कौन सा इलाका? दबाएँ या लिखें। एक से ज़्यादा चुन सकते हैं।`);
  const askBudget = (deal?: string) => deal === 'Rent' ? tx('Rent up to how much per month?', 'किराया महीने का कितने तक?') : tx('Budget up to how much?', 'बजट कितने तक?');
  const pickType = (v: string, shown: string) => { setNeed(n => ({ ...n, type: v })); if (need.city) say(shown, askArea(need.city), 'area'); else say(shown, tx('Which city?', 'कौन सा शहर?'), 'city'); };
  const pickBudget = (v: number) => { setNeed(n => ({ ...n, budget: v })); say(formatINR(v), tx("Client's name?", 'क्लाइंट का नाम?'), 'name'); };
  const summary = `${need.name} · ${need.type} · ${need.deal === 'Rent' ? tx('Rent', 'किराया') : tx('Buy', 'ख़रीद')} · ${need.areas.join(', ')}, ${need.city} · ${tx('up to', 'तक')} ${formatINR(need.budget || 0)}`;

  const save = async () => {
    setBusy(true);
    try {
      const max = need.budget || 0;
      const r = await api.createRequirement({
        customerName: need.name, customerPhone: need.phone, budgetMin: Math.round(max * 0.7), budgetMax: max, city: need.city, preferredLocalities: need.areas,
        preferredTags: [], propertyType: need.type, transactionType: need.deal, purpose: 'Self-use', urgency: 'Moderate (1-3 months)',
      });
      const all = await api.getMatchesForRequirement(r.requirement.id).catch(() => ({ matches: [] as any[] }));
      const m = { matches: (all.matches || []).filter((x: any) => x.score >= 50) };   // a weak match (an office for a flat) is not shown as "fits"
      setSaved({ id: r.requirement.id, homes: m.matches.slice(0, 3) });
      setLog(l => [...l, { me: true, text: tx('Save it', 'सेव करो') }, { text: (m.matches || []).length ? tx(`Saved. ${m.matches.length} home(s) fit — the best ones:`, `सेव हो गया। ${m.matches.length} घर मिलते हैं — सबसे अच्छे:`) : tx('Saved. No home fits yet — I will show it under Buyers when one comes.', 'सेव हो गया। अभी कोई घर नहीं मिलता — आने पर Buyers में दिखेगा।') }]);
      setStep('done');
    } catch (e: any) { setLog(l => [...l, { text: e?.message || tx('Could not save. Please check and try again.', 'सेव नहीं हुआ। जाँच कर फिर कोशिश करें।') }]); }
    setBusy(false);
  };

  return (
    <div className="space-y-2" data-testid="sahayak-bot">
      <p className="mr-10 w-fit rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm text-slate-900 shadow-sm">{tx('Namaste. What do you want to do? Just tap.', 'नमस्ते। क्या करना है? बस दबाइए।')}</p>
      {log.map((m, i) => <p key={i} className={`w-fit max-w-[85%] rounded-2xl px-3 py-2 text-sm text-slate-900 shadow-sm ${m.me ? 'ml-auto rounded-tr-sm bg-emerald-100' : 'mr-10 rounded-tl-sm bg-white'}`}>{m.text}</p>)}

      {step === 'done' && saved && saved.homes.map((h: any) => (
        <div key={h.property.id} className="mr-10 rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-sm" data-testid="sahayak-home">
          <div className="font-bold text-slate-900">{h.property.title}</div>
          <div className="text-xs text-slate-500">{h.property.locality} · {Math.round(h.score)}% {tx('match', 'मेल')}</div>
          <div className="font-bold text-emerald-700">{formatINR(h.property.askingPrice)}</div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2 pt-1" data-testid={`sahayak-step-${step}`}>
        {step === 'menu' && <>
          <button type="button" className={go} onClick={() => say(tx('Add a client requirement', 'क्लाइंट की ज़रूरत जोड़ो'), tx('Does the client want to buy or rent?', 'क्लाइंट को ख़रीदना है या किराये पर?'), 'deal')} data-testid="sahayak-add-need">{tx('Add a client requirement', 'क्लाइंट की ज़रूरत जोड़ो')}</button>
          <button type="button" className={opt} onClick={() => tab('properties')}>{tx('Find / add a property', 'प्रॉपर्टी ढूँढो / जोड़ो')}</button>
          <button type="button" className={opt} onClick={() => tab('daily')}>{tx("Today's work", 'आज का काम')}</button>
          <button type="button" className={opt} onClick={() => tab('deals')}>{tx('My deals and commission', 'मेरी डील और कमीशन')}</button>
          <button type="button" className={opt} onClick={() => tab('share')}>{tx('My shop QR', 'मेरा शॉप QR')}</button>
          <button type="button" className={opt} onClick={() => setStep('free')} data-testid="sahayak-free">{tx('Type it myself', 'खुद लिखूँगा')}</button>
        </>}
        {step === 'deal' && (['Sale', 'Rent'] as const).map(d => <button key={d} type="button" className={opt} data-testid={`sahayak-deal-${d}`} onClick={() => { setNeed(n => ({ ...n, deal: d })); say(d === 'Sale' ? tx('Buy', 'ख़रीदना') : tx('Rent', 'किराये पर'), tx('What is needed?', 'क्या चाहिए?'), 'type'); }}>{d === 'Sale' ? tx('Buy', 'ख़रीदना') : tx('Rent', 'किराये पर')}</button>)}
        {step === 'type' && <>
          {QUICK_TYPES.map(([v, en, hi]) => <button key={v} type="button" className={opt} data-testid={`sahayak-type-${en}`} onClick={() => pickType(v, tx(en, hi))}>{tx(en, hi)}</button>)}
          {!allTypes ? <button type="button" className={opt} onClick={() => setAllTypes(true)}>{tx('Other…', 'और…')}</button>
            : <select aria-label={tx('Other property type', 'दूसरा प्रकार')} className={field} value="" onChange={e => e.target.value && pickType(e.target.value, e.target.value)}><option value="">{tx('Pick one', 'चुनें')}</option>{PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>}
        </>}
        {step === 'city' && <form className="flex w-full gap-2" onSubmit={e => { e.preventDefault(); const c = typed.trim(); if (c.length < 2) return; setNeed(n => ({ ...n, city: c })); say(c, askArea(c), 'area'); }}>
          <input className={field} value={typed} onChange={e => setTyped(e.target.value)} aria-label={tx('City', 'शहर')} placeholder={tx('City', 'शहर')} /><button className={go} disabled={typed.trim().length < 2}>{tx('Next', 'आगे')}</button></form>}
        {step === 'area' && <div className="w-full space-y-2 rounded-2xl bg-white p-3">
          <AreaChips city={need.city} value={need.areas} onChange={v => setNeed(n => ({ ...n, areas: v }))} max={5} testId="sahayak-areas" />
          <button type="button" className={go} disabled={!need.areas.length} data-testid="sahayak-area-next" onClick={() => say(need.areas.join(', '), askBudget(need.deal), 'budget')}>{tx('Next', 'आगे')}</button>
        </div>}
        {step === 'budget' && <>
          {BUDGETS[need.deal === 'Rent' ? 'Rent' : 'Sale'].map(v => <button key={v} type="button" className={opt} data-testid={`sahayak-budget-${v}`} onClick={() => pickBudget(v)}>{formatINR(v)}</button>)}
          <form className="flex w-full flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); const v = Math.round(Number(typed) * unit); if (v > 0) pickBudget(v); }}>
            <input className={field} inputMode="decimal" value={typed} onChange={e => setTyped(e.target.value.replace(/[^\d.]/g, ''))} aria-label={tx('Another amount', 'कोई और रकम')} placeholder={tx('Another amount', 'कोई और रकम')} />
            {UNITS.map(([u, en, hi]) => <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)} className={`min-h-11 rounded-full border px-3 text-xs font-semibold ${unit === u ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{tx(en, hi)}</button>)}
            <button className={go} disabled={!(Number(typed) > 0)}>{tx('Next', 'आगे')}</button>
          </form>
        </>}
        {step === 'name' && <form className="flex w-full gap-2" onSubmit={e => { e.preventDefault(); const v = typed.trim(); if (v.length < 2) return; setNeed(n => ({ ...n, name: v })); say(v, tx("Client's mobile number? (10 digits)", 'क्लाइंट का मोबाइल नंबर? (10 अंक)'), 'phone'); }}>
          <input className={field} value={typed} onChange={e => setTyped(e.target.value)} aria-label={tx('Client name', 'क्लाइंट का नाम')} placeholder={tx('Client name', 'क्लाइंट का नाम')} data-testid="sahayak-name" /><button className={go} disabled={typed.trim().length < 2}>{tx('Next', 'आगे')}</button></form>}
        {step === 'phone' && <form className="flex w-full gap-2" onSubmit={e => { e.preventDefault(); if (!isValidIndianPhone(typed)) return; const v = sanitizePhone(typed); setNeed(n => ({ ...n, phone: v })); say(v, tx('Please check. Is this right?', 'देख लीजिए। सही है?'), 'confirm'); }}>
          <input className={field} type="tel" inputMode="numeric" value={typed} onChange={e => setTyped(e.target.value)} aria-label={tx('Mobile number', 'मोबाइल नंबर')} placeholder="98XXXXXXXX" data-testid="sahayak-phone" /><button className={go} disabled={!isValidIndianPhone(typed)}>{tx('Next', 'आगे')}</button></form>}
        {step === 'confirm' && <div className="w-full space-y-2">
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-slate-900" data-testid="sahayak-summary">{summary}</p>
          <div className="flex gap-2"><button type="button" className={go} disabled={busy} onClick={() => void save()} data-testid="sahayak-save">{busy ? tx('Saving…', 'सेव हो रहा है…') : tx('Yes, save', 'हाँ, सेव करो')}</button><button type="button" className={opt} onClick={restart}>{tx('Start again', 'फिर से शुरू')}</button></div>
        </div>}
        {step === 'done' && saved && <>
          <button type="button" className={go} onClick={() => goto('requirements', { reqId: saved.id }, t => tab(t))} data-testid="sahayak-open-need">{tx('Open this requirement', 'यह ज़रूरत खोलो')}</button>
          <button type="button" className={opt} onClick={restart}>{tx('Add another', 'एक और जोड़ो')}</button>
        </>}
        {step !== 'menu' && step !== 'done' && step !== 'confirm' && <button type="button" className="min-h-11 px-2 text-xs font-semibold text-slate-500 underline" onClick={restart} data-testid="sahayak-menu">{tx('Back to menu', 'मेन्यू पर वापस')}</button>}
      </div>
      {step === 'free' && <CopilotPanel />}
      <div ref={end} />
    </div>
  );
};
