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
type Step = 'menu' | 'deal' | 'type' | 'city' | 'area' | 'budget' | 'name' | 'phone' | 'confirm' | 'done' | 'free' | 'find' | 'deals';
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
  const [act, setAct] = useState<{ id: string; kind: 'send' | 'visit' } | null>(null);
  const [found, setFound] = useState<any[] | null>(null);
  const [dealsInfo, setDealsInfo] = useState<any[] | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { api.getMe().then((m: any) => setNeed(n => ({ ...n, city: n.city || m?.user?.city || '' }))).catch(() => undefined); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [log, step, saved]);

  const say = (mine: string, bot: string, next: Step) => { setLog(l => [...l, { me: true, text: mine }, { text: bot }]); setTyped(''); setStep(next); };
  const restart = () => { setLog([]); setSaved(null); setAct(null); setFound(null); setDealsInfo(null); setTyped(''); setAllTypes(false); setNeed(n => ({ city: n.city, areas: [], name: '', phone: '' })); setStep('menu'); };
  const tab = (t: string) => window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: t }));
  const askArea = (city: string) => tx(`Which area of ${city}? Tap or type. You can pick more than one.`, `${city} का कौन सा इलाका? दबाएँ या लिखें। एक से ज़्यादा चुन सकते हैं।`);
  const askBudget = (deal?: string) => deal === 'Rent' ? tx('Rent up to how much per month?', 'किराया महीने का कितने तक?') : tx('Budget up to how much?', 'बजट कितने तक?');
  const pickType = (v: string, shown: string) => { setNeed(n => ({ ...n, type: v })); if (need.city) say(shown, askArea(need.city), 'area'); else say(shown, tx('Which city?', 'कौन सा शहर?'), 'city'); };
  const pickBudget = (v: number) => { setNeed(n => ({ ...n, budget: v })); say(formatINR(v), tx("Client's name?", 'क्लाइंट का नाम?'), 'name'); };
  const summary = `${need.name} · ${need.type} · ${need.deal === 'Rent' ? tx('Rent', 'किराया') : tx('Buy', 'ख़रीद')} · ${need.areas.join(', ')}, ${need.city} · ${tx('up to', 'तक')} ${formatINR(need.budget || 0)}`;

  const botSay = (text: string) => setLog(l => [...l, { text }]);
  // v152 — actions on a home card: send it to the client in a client room, ask the network (co-broke), or book a visit
  const sendHome = async (h: any) => {
    setBusy(true);
    try {
      let id = '';
      try { id = (await api.crCreate({ clientName: need.name, phone: need.phone, kind: need.deal === 'Rent' ? 'RENTER' : 'BUYER', consent: true })).room.id; }
      catch (e: any) { id = ((await api.crList()).rooms || []).find((x: any) => x.status === 'ACTIVE' && x.kind !== 'OWNER' && x.phoneLast4 === need.phone.slice(-4))?.id || ''; if (!id) throw e; }
      await api.crSend(id, tx(`Please see this home: ${h.property.title}`, `यह घर देखिए: ${h.property.title}`), h.property.id);
      botSay(tx(`Sent "${h.property.title}" to ${need.name} in his client room.`, `"${h.property.title}" ${need.name} को उनके क्लाइंट रूम में भेज दिया।`));
    } catch (e: any) { botSay(e?.message || tx('Could not send.', 'भेज नहीं पाया।')); }
    setAct(null); setBusy(false);
  };
  // co-broke = the client's need (never his name or number) goes to the brokers who hold a matching home, same as the shop lead's button
  const askNetwork = async () => {
    if (!saved) return; setBusy(true);
    try { const r = await api.broadcastSend(saved.id); botSay(tx(`Sent to ${r.broadcast.sentTo} brokers. Their homes will reply in your chats.`, `${r.broadcast.sentTo} ब्रोकरों को भेजा। उनके घर आपकी चैट में जवाब देंगे।`)); }
    catch (e: any) { botSay(e?.message || tx('Could not ask.', 'पूछ नहीं पाया।')); }
    setBusy(false);
  };
  const bookVisit = async (h: any, days: number, hour: number, label: string) => {
    setBusy(true);
    try {
      const d = new Date(Date.now() + days * 86400_000); d.setHours(hour, 0, 0, 0);
      await api.scheduleSiteVisit({ propertyId: h.property.id, customerName: need.name, customerPhone: need.phone, scheduledTime: d.toISOString(), notes: 'Booked from Sahayak' });
      botSay(tx(`Visit booked for ${need.name}: ${label}. "${h.property.title}"`, `${need.name} की विज़िट तय: ${label}। "${h.property.title}"`));
    } catch (e: any) { botSay(e?.message || tx('Could not book the visit.', 'विज़िट तय नहीं हुई।')); }
    setAct(null); setBusy(false);
  };
  const doFind = async (q: string) => {
    setBusy(true);
    try { setFound(((await api.getProperties({ q, limit: 4 })).properties || []).map((p: any) => ({ property: p }))); } catch { setFound([]); }
    say(q, tx('Here is what I found:', 'ये मिला:'), 'find'); setBusy(false);
  };
  const showDeals = async () => {
    setBusy(true);
    try { setDealsInfo((await api.getDeals()).deals || []); } catch { setDealsInfo([]); }
    say(tx('My deals and commission', 'मेरी डील और कमीशन'), tx('Your deals:', 'आपकी डील:'), 'deals'); setBusy(false);
  };

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

      {((step === 'done' && saved ? saved.homes : step === 'find' ? found || [] : []) as any[]).map((h: any) => (
        <div key={h.property.id} className="mr-10 rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-sm" data-testid="sahayak-home">
          <div className="font-bold text-slate-900">{h.property.title}</div>
          <div className="text-xs text-slate-500">{h.property.locality}{h.score != null && <> · {Math.round(h.score)}% {tx('match', 'मेल')}</>}</div>
          <div className="font-bold text-emerald-700">{formatINR(h.property.askingPrice)}</div>
          {step === 'done' && <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={opt} onClick={() => setAct({ id: h.property.id, kind: 'send' })} data-testid="sahayak-send-client">{tx('Send to client', 'क्लाइंट को भेजो')}</button>
            <button type="button" className={opt} onClick={() => setAct({ id: h.property.id, kind: 'visit' })} data-testid="sahayak-visit">{tx('Book a visit', 'विज़िट तय करो')}</button>
          </div>}
          {step === 'done' && act?.id === h.property.id && act?.kind === 'send' && <div className="mt-2 space-y-2 rounded-xl bg-amber-50 p-2">
            <p className="text-xs text-slate-800">{tx(`Has ${need.name} agreed to get homes and chat in a client room?`, `क्या ${need.name} ने क्लाइंट रूम में घर और चैट पाने की हाँ कही है?`)}</p>
            <button type="button" className={go} disabled={busy} onClick={() => void sendHome(h)} data-testid="sahayak-send-yes">{tx('Yes, send', 'हाँ, भेजो')}</button>
          </div>}
          {step === 'done' && act?.id === h.property.id && act?.kind === 'visit' && <div className="mt-2 flex flex-wrap gap-2" data-testid="sahayak-visit-times">
            {([[1, 11, tx('Tomorrow 11 am', 'कल सुबह 11')], [1, 16, tx('Tomorrow 4 pm', 'कल शाम 4')], [2, 11, tx('Day after, 11 am', 'परसों सुबह 11')]] as [number, number, string][]).map(([d, hr, lb]) => <button key={lb} type="button" className={opt} disabled={busy} onClick={() => void bookVisit(h, d, hr, lb)}>{lb}</button>)}
          </div>}
        </div>
      ))}

      <div className="flex flex-wrap gap-2 pt-1" data-testid={`sahayak-step-${step}`}>
        {step === 'menu' && <>
          <button type="button" className={go} onClick={() => say(tx('Add a client requirement', 'क्लाइंट की ज़रूरत जोड़ो'), tx('Does the client want to buy or rent?', 'क्लाइंट को ख़रीदना है या किराये पर?'), 'deal')} data-testid="sahayak-add-need">{tx('Add a client requirement', 'क्लाइंट की ज़रूरत जोड़ो')}</button>
          <button type="button" className={opt} onClick={() => say(tx('Find a property', 'प्रॉपर्टी ढूँढो'), tx('Type an area, a name or a type — for example Shankar Nagar.', 'इलाका, नाम या प्रकार लिखिए — जैसे शंकर नगर।'), 'find')} data-testid="sahayak-find">{tx('Find a property', 'प्रॉपर्टी ढूँढो')}</button>
          <button type="button" className={opt} onClick={() => tab('properties')}>{tx('Add a property', 'प्रॉपर्टी जोड़ो')}</button>
          <button type="button" className={opt} onClick={() => tab('daily')}>{tx("Today's work", 'आज का काम')}</button>
          <button type="button" className={opt} disabled={busy} onClick={() => void showDeals()} data-testid="sahayak-deals">{tx('My deals and commission', 'मेरी डील और कमीशन')}</button>
          <button type="button" className={opt} onClick={() => tab('share')}>{tx('My shop QR', 'मेरा शॉप QR')}</button>
          <button type="button" className={opt} onClick={() => setStep('free')} data-testid="sahayak-free">{tx('Type it myself', 'खुद लिखूँगा')}</button>
        </>}
        {step === 'find' && <form className="flex w-full gap-2" onSubmit={e => { e.preventDefault(); const q = typed.trim(); if (q.length >= 2) void doFind(q); }}>
          <input className={field} value={typed} onChange={e => setTyped(e.target.value)} aria-label={tx('Search homes', 'घर खोजें')} placeholder={tx('Area, name or type', 'इलाका, नाम या प्रकार')} data-testid="sahayak-find-input" /><button className={go} disabled={busy || typed.trim().length < 2}>{tx('Search', 'खोजो')}</button></form>}
        {step === 'find' && found && <>
          {found.length === 0 && <p className="text-sm text-slate-600">{tx('Nothing found. Try another word.', 'कुछ नहीं मिला। दूसरा शब्द लिखिए।')}</p>}
          <button type="button" className={opt} onClick={() => tab('properties')}>{tx('Open all properties', 'सारी प्रॉपर्टी खोलो')}</button>
        </>}
        {step === 'deals' && <div className="w-full space-y-2" data-testid="sahayak-deals-card">
          {(dealsInfo || []).length === 0 ? <p className="rounded-2xl bg-white p-3 text-sm text-slate-600">{tx('No deals yet.', 'अभी कोई डील नहीं।')}</p> : <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <div className="text-xs font-bold text-slate-600">{tx('COMMISSION EXPECTED', 'अनुमानित कमीशन')}</div>
            <div className="text-xl font-bold text-emerald-700">{formatINR((dealsInfo || []).filter((d: any) => d.stage !== 'Disputed').reduce((n: number, d: any) => n + (d.totalCommissionExpected || 0), 0))}</div>
            <div className="text-xs text-slate-600">{tx(`${(dealsInfo || []).length} deals · all stages together`, `${(dealsInfo || []).length} डील · सभी चरण मिलाकर`)}</div>
            {(dealsInfo || []).slice(0, 3).map((d: any) => <div key={d.id} className="flex justify-between border-t border-emerald-100 py-1.5 text-slate-900"><span className="truncate">{d.propertyTitle || d.stage}</span><span className="font-bold">{d.stage}</span></div>)}
          </div>}
          <button type="button" className={go} onClick={() => tab('deals')}>{tx('Open my deals', 'मेरी डील खोलो')}</button>
        </div>}
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
          <button type="button" className={opt} disabled={busy} onClick={() => void askNetwork()} data-testid="sahayak-cobroke">{tx('Ask brokers (co-broke)', 'ब्रोकरों से पूछो (को-ब्रोक)')}</button>
          <button type="button" className={opt} onClick={restart}>{tx('Add another', 'एक और जोड़ो')}</button>
        </>}
        {step !== 'menu' && step !== 'done' && step !== 'confirm' && <button type="button" className="min-h-11 px-2 text-xs font-semibold text-slate-500 underline" onClick={restart} data-testid="sahayak-menu">{tx('Back to menu', 'मेन्यू पर वापस')}</button>}
      </div>
      {step === 'free' && <CopilotPanel />}
      <div ref={end} />
    </div>
  );
};
