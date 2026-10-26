import React, { useEffect, useRef, useState } from 'react';
import { X, Download, Upload, MessageCircle, Trash2, Pencil, Clock3, Check, Tag, Phone, ShieldOff, ShieldCheck, Star } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { LOST_CODES, WA_TEMPLATES, fillTemplate, MAX_TAGS, MAX_BULK, MAX_IMPORT_ROWS, STALE_DAYS } from '../shared/crmRules.js';
import { LEAD_SOURCES } from '../shared/crmSales.js';
import type { CrmLead, CrmFollowUp } from '../types/crm.js';

/** v16 — CRM workflow + controls UI: alerts, filters, bulk, import / export, lead controls, follow-up edit, lost reasons, WhatsApp templates. */
export type Run = (fn: () => Promise<any>, ok: string) => Promise<void>;
export type Flash = (ok: boolean, msg: string) => void;

export const inp = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
export const btnDark = 'inline-flex min-h-9 items-center justify-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40';
export const btnLine = 'inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 hover:border-slate-900 disabled:opacity-40';
export const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const dt = (s?: string) => (s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const localIso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** Busy + error state for a sheet: errors stay inside the sheet instead of a toast hidden behind it. */
export function useBusy() {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async (fn: () => Promise<any>, done: () => void) => { setBusy(true); setErr(''); try { await fn(); done(); } catch (e: any) { setErr(e.message || 'Failed'); } finally { setBusy(false); } };
  return { busy, err, go, setErr };
}

export const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => { const tx = useTx(); return (
  <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onClick={onClose}>
    <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
      <div className="mb-3 flex items-start justify-between gap-3"><h3 className="text-sm font-bold text-slate-900">{title}</h3><button type="button" onClick={onClose} aria-label={tx('Close', 'बंद करें')}><X className="h-5 w-5 text-slate-500" /></button></div>
      {children}
    </div>
  </div>
); };
export const Err: React.FC<{ msg: string }> = ({ msg }) => (msg ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{msg}</p> : null);

// ───────────────────────── alerts ─────────────────────────
export interface CrmAlert { kind: string; severity: 'high' | 'med' | 'low'; count: number; en: string; hi: string; ids?: string[] }
const SEV = { high: 'border-red-300 bg-red-50 text-red-800', med: 'border-amber-300 bg-amber-50 text-amber-900', low: 'border-slate-300 bg-slate-50 text-slate-700' };
export const AlertsBar: React.FC<{ refreshKey: number; active: string | null; onPick: (a: CrmAlert | null) => void }> = ({ refreshKey, active, onPick }) => {
  const { lang } = useI18n(); const tx = useTx();
  const [alerts, setAlerts] = useState<CrmAlert[]>([]);
  useEffect(() => { api.crmAlerts().then(r => setAlerts(r.alerts)).catch(() => setAlerts([])); }, [refreshKey]);
  if (!alerts.length) return <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">{tx('All clear — nothing needs your attention right now.', 'सब ठीक है — अभी किसी चीज़ पर ध्यान देने की ज़रूरत नहीं।')}</p>;
  return (
    <div className="flex flex-wrap gap-2" role="list" aria-label={tx('Needs attention', 'ध्यान दें')}>
      {alerts.map(a => (
        <button key={a.kind} role="listitem" onClick={() => onPick(active === a.kind ? null : a)} className={`min-h-9 rounded-full border px-3 py-1 text-left text-[11px] font-semibold ${SEV[a.severity]} ${active === a.kind ? 'ring-2 ring-slate-900' : ''}`}>
          {lang === 'hi' ? a.hi : a.en}: <b>{a.count}</b>
        </button>
      ))}
    </div>
  );
};

// ───────────────────────── filters ─────────────────────────
export interface Filters { q: string; temperature: string; projectId: string; source: string; flag: '' | 'overdue' | 'stale' | 'expiring' }
export const EMPTY_FILTERS: Filters = { q: '', temperature: '', projectId: '', source: '', flag: '' };
const SOURCES: [string, string, string][] = LEAD_SOURCES.map(x => [x.id, x.en, x.hi]);
export const TEMP_LABEL: Record<string, [string, string, string]> = { HOT: ['🔥', 'Hot', 'गर्म'], WARM: ['☀️', 'Warm', 'गुनगुना'], COLD: ['❄️', 'Cold', 'ठंडा'] };

export const FilterBar: React.FC<{ f: Filters; setF: (f: Filters) => void; projects: { id: string; projectName: string }[] }> = ({ f, setF, projects }) => {
  const tx = useTx(); const { lang } = useI18n();
  const set = (k: keyof Filters, v: string) => setF({ ...f, [k]: v } as Filters);
  const chip = (flag: Filters['flag'], en: string, hi: string) => (
    <button key={flag} onClick={() => set('flag', f.flag === flag ? '' : flag)} className={`min-h-9 rounded-full border px-3 text-[11px] font-semibold ${f.flag === flag ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{tx(en, hi)}</button>
  );
  const sel = 'min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs';
  // v75 — search is always there; the project / temperature / source pickers and the flag chips open with "Filters" (they stay open while one is in use)
  const used = [f.temperature, f.projectId, f.source, f.flag].filter(Boolean).length;
  const [more, setMore] = useState(false);
  const show = more || used > 0;
  return (
    <div className="space-y-2" data-testid="crm-filters">
      <div className="flex items-center gap-2">
        <input value={f.q} onChange={e => set('q', e.target.value)} placeholder={tx('Search name, phone, tag', 'नाम, फ़ोन, टैग खोजें')} className="min-h-9 min-w-0 flex-1 sm:max-w-xs rounded-lg border border-slate-300 px-3 text-xs" />
        <button type="button" onClick={() => setMore(m => !m)} aria-expanded={show} data-testid="crm-filters-toggle" className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700">{tx('Filters', 'फ़िल्टर')}{used > 0 && <span className="rounded-full bg-slate-900 px-1.5 text-[10px] text-white">{used}</span>}<span aria-hidden>{show ? '▲' : '▼'}</span></button>
      </div>
      {show && (<>
      <div className="flex flex-wrap items-center gap-2">
        <select value={f.projectId} onChange={e => set('projectId', e.target.value)} className={sel} aria-label={tx('Project', 'प्रोजेक्ट')}><option value="">{tx('All projects', 'सभी प्रोजेक्ट')}</option>{projects.map(p => <option key={p.id} value={p.id}>{p.projectName}</option>)}</select>
        <select value={f.temperature} onChange={e => set('temperature', e.target.value)} className={sel} aria-label={tx('Temperature', 'तापमान')}><option value="">{tx('Any temperature', 'कोई भी तापमान')}</option>{Object.entries(TEMP_LABEL).map(([k, v]) => <option key={k} value={k}>{v[0]} {lang === 'hi' ? v[2] : v[1]}</option>)}</select>
        <select value={f.source} onChange={e => set('source', e.target.value)} className={sel} aria-label={tx('Source', 'स्रोत')}><option value="">{tx('Any source', 'कोई भी स्रोत')}</option>{SOURCES.map(s => <option key={s[0]} value={s[0]}>{lang === 'hi' ? s[2] : s[1]}</option>)}</select>
      </div>
      <div className="flex flex-wrap gap-2">
        {chip('overdue', 'Overdue follow-up', 'ओवरड्यू फ़ॉलो-अप')}{chip('stale', `No activity ${STALE_DAYS}+ days`, `${STALE_DAYS}+ दिन निष्क्रिय`)}{chip('expiring', 'Protection ending', 'सुरक्षा खत्म होने वाली')}
        {(f.q || f.temperature || f.projectId || f.source || f.flag) && <button onClick={() => setF(EMPTY_FILTERS)} className="min-h-9 px-2 text-[11px] font-semibold text-red-600">{tx('Clear', 'हटाएँ')}</button>}
      </div>
      </>)}
      {!show && f.q && <button onClick={() => setF(EMPTY_FILTERS)} className="min-h-9 px-2 text-[11px] font-semibold text-red-600">{tx('Clear', 'हटाएँ')}</button>}
    </div>
  );
};

// ───────────────────────── lost reason ─────────────────────────
export const LostSheet: React.FC<{ onClose: () => void; onSubmit: (code: string, text: string) => Promise<void>; title?: string }> = ({ onClose, onSubmit, title }) => {
  const tx = useTx(); const { lang } = useI18n(); const { busy, err, go } = useBusy();
  const [code, setCode] = useState(''); const [text, setText] = useState('');
  return (
    <Sheet title={title || tx('Why was this lead lost?', 'यह लीड क्यों गई?')} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">{LOST_CODES.map(c => <button key={c.id} type="button" onClick={() => setCode(c.id)} className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${code === c.id ? 'border-red-600 bg-red-600 text-white' : 'border-slate-300 text-slate-700'}`}>{lang === 'hi' ? c.hi : c.en}</button>)}</div>
        <input value={text} onChange={e => setText(e.target.value)} maxLength={300} placeholder={tx('Details (optional)', 'विवरण (वैकल्पिक)')} className={inp} />
        <Err msg={err} />
        <button disabled={!code || busy} onClick={() => go(() => onSubmit(code, text), onClose)} className={`${btnDark} w-full !bg-red-600`}>{tx('Mark lost', 'लॉस्ट करें')}</button>
      </div>
    </Sheet>
  );
};

// ───────────────────────── WhatsApp templates (wa.me, client-side — no paid API) ─────────────────────────
export const WaMenu: React.FC<{ lead: CrmLead; phone: string; me: string }> = ({ lead, phone, me }) => {
  const tx = useTx(); const { lang } = useI18n(); const [open, setOpen] = useState(false);
  const d = phone.replace(/\D/g, '').slice(-10);
  if (lead.optedOutAt || lead.erasedAt || !/^\d{10}$/.test(d) || /[X•*]/.test(phone)) return null;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-[11px] font-semibold text-white"><MessageCircle className="h-3.5 w-3.5" /> {tx('WhatsApp templates', 'WhatsApp मैसेज')}</button>
      {open && (
        <ul className="absolute left-0 z-10 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {WA_TEMPLATES.map(t => {
            const text = fillTemplate(lang === 'hi' ? t.textHi : t.textEn, { name: lead.name.split(' ')[0], project: lead.projectName, me });
            return <li key={t.id}><a target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} href={`https://wa.me/91${d}?text=${encodeURIComponent(text)}`} className="block rounded-lg px-3 py-2 text-xs hover:bg-slate-50"><b className="text-slate-900">{lang === 'hi' ? t.hi : t.en}</b><span className="mt-0.5 block truncate text-[10px] text-slate-500">{text}</span></a></li>;
          })}
        </ul>
      )}
    </div>
  );
};

// ───────────────────────── follow-up row: done / snooze / edit / delete ─────────────────────────
export const FollowUpRow: React.FC<{ lead: CrmLead; f: CrmFollowUp; run: Run; editable: boolean }> = ({ lead, f, run, editable }) => {
  const tx = useTx(); const [edit, setEdit] = useState(false); const [snooze, setSnooze] = useState(false);
  const label = useLabel();
  const [due, setDue] = useState(localIso(new Date(f.dueAt))); const [note, setNote] = useState(f.note); const [ch, setCh] = useState(f.channel);
  const overdue = !f.done && Date.parse(f.dueAt) < Date.now();
  const snoozeBy = (days: number) => { setSnooze(false); run(() => api.crmEditFollowUp(lead.id, f.id, { dueAt: new Date(Math.max(Date.now(), Date.parse(f.dueAt)) + days * 86400000).toISOString() }), tx(`Snoozed ${days} day(s)`, `${days} दिन आगे किया`)); };
  if (edit) return (
    <li className="space-y-2 rounded-lg border border-slate-300 p-2">
      <div className="flex flex-wrap gap-2"><input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} className="min-h-9 rounded border border-slate-300 px-2 text-xs" />
        <select value={ch} onChange={e => setCh(e.target.value as CrmFollowUp['channel'])} className="min-h-9 rounded border border-slate-300 px-2 text-xs">{['CALL', 'WHATSAPP', 'MEETING', 'SITE_VISIT'].map(c => <option key={c}>{c}</option>)}</select></div>
      <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs" />
      <div className="flex gap-2"><button className={btnDark} disabled={!due || note.trim().length < 2} onClick={() => { setEdit(false); run(() => api.crmEditFollowUp(lead.id, f.id, { dueAt: new Date(due).toISOString(), note, channel: ch }), tx('Follow-up updated', 'फ़ॉलो-अप अपडेट हुआ')); }}>{tx('Save', 'सेव')}</button><button className={btnLine} onClick={() => setEdit(false)}>{tx('Cancel', 'रद्द')}</button></div>
    </li>
  );
  return (
    <li className="rounded border border-slate-200 px-2 py-1.5 text-[11px]">
      <div className="flex items-start justify-between gap-2">
        <span className={f.done ? 'text-slate-400 line-through' : overdue ? 'text-red-600' : ''}>{dt(f.dueAt)} · {label('status', f.channel)} · {f.note}</span>
        {!f.done && editable && (
          <span className="flex shrink-0 items-center gap-0.5">
            <button aria-label={tx('Done', 'हो गया')} className="grid h-9 w-9 place-items-center" onClick={() => run(() => api.crmFollowUpDone(lead.id, f.id), tx('Done', 'हो गया'))}><Check className="h-4 w-4 text-emerald-600" /></button>
            <button aria-label={tx('Snooze', 'बाद में')} className="grid h-9 w-9 place-items-center" onClick={() => setSnooze(!snooze)}><Clock3 className="h-4 w-4 text-slate-600" /></button>
            <button aria-label={tx('Edit', 'बदलें')} className="grid h-9 w-9 place-items-center" onClick={() => setEdit(true)}><Pencil className="h-4 w-4 text-slate-600" /></button>
            <button aria-label={tx('Delete', 'हटाएँ')} className="grid h-9 w-9 place-items-center" onClick={() => { if (window.confirm(tx('Remove this follow-up?', 'यह फ़ॉलो-अप हटाएँ?'))) run(() => api.crmDeleteFollowUp(lead.id, f.id), tx('Follow-up removed', 'फ़ॉलो-अप हटाया')); }}><Trash2 className="h-4 w-4 text-red-500" /></button>
          </span>
        )}
      </div>
      {snooze && <div className="mt-1 flex flex-wrap gap-2">{[1, 3, 7].map(d => <button key={d} className={btnLine} onClick={() => snoozeBy(d)}>+{d} {tx(d === 1 ? 'day' : 'days', 'दिन')}</button>)}</div>}
    </li>
  );
};

// ───────────────────────── controls inside the lead drawer ─────────────────────────
const PhoneSheet: React.FC<{ lead: CrmLead; onClose: () => void; onDone: () => void }> = ({ lead, onClose, onDone }) => {
  const tx = useTx(); const { busy, err, go } = useBusy(); const [phone, setPhone] = useState(''); const [reason, setReason] = useState('');
  return (
    <Sheet title={tx('Correct the phone number', 'फ़ोन नंबर सुधारें')} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-slate-600">{tx('Only for a typing mistake. The associate can fix it within 24 hours of registering; after that only the builder. Every change is logged (numbers masked).', 'सिर्फ़ टाइपिंग की गलती के लिए। एसोसिएट रजिस्टर करने के 24 घंटे में सुधार सकता है; उसके बाद सिर्फ़ बिल्डर। हर बदलाव लॉग होता है (नंबर मास्क्ड)।')}</p>
        <input inputMode="numeric" value={phone} onChange={e => setPhone(e.target.value)} placeholder={tx('Correct mobile (10 digits)', 'सही मोबाइल (10 अंक)')} className={inp} />
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder={tx('Why? (min 5 characters)', 'क्यों? (कम से कम 5 अक्षर)')} className={inp} />
        <Err msg={err} />
        <button disabled={busy || reason.trim().length < 5 || phone.replace(/\D/g, '').length < 10} onClick={() => go(() => api.crmCorrectPhone(lead.id, phone, reason), () => { onDone(); onClose(); })} className={`${btnDark} w-full`}>{tx('Correct number', 'नंबर सुधारें')}</button>
      </div>
    </Sheet>
  );
};
const OptOutSheet: React.FC<{ lead: CrmLead; onClose: () => void; onDone: () => void }> = ({ lead, onClose, onDone }) => {
  const tx = useTx(); const { busy, err, go } = useBusy(); const [note, setNote] = useState('');
  return (
    <Sheet title={tx('Customer asked not to be contacted', 'ग्राहक ने संपर्क न करने को कहा')} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-slate-600">{tx('This closes the lead as lost, cancels pending follow-ups and blocks calls / WhatsApp logging. The customer’s personal data is erased automatically after a short retention period.', 'यह लीड को लॉस्ट कर देगा, पेंडिंग फ़ॉलो-अप हटाएगा और कॉल / WhatsApp लॉग रोक देगा। ग्राहक का निजी डेटा कुछ दिनों बाद अपने-आप मिटा दिया जाएगा।')}</p>
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={150} placeholder={tx('How did the customer say it? (optional)', 'ग्राहक ने कैसे बताया? (वैकल्पिक)')} className={inp} />
        <Err msg={err} />
        <button disabled={busy} onClick={() => go(() => api.crmOptOut(lead.id, note), () => { onDone(); onClose(); })} className={`${btnDark} w-full !bg-red-600`}>{tx('Record opt-out', 'ऑप्ट-आउट दर्ज करें')}</button>
      </div>
    </Sheet>
  );
};

export const LeadControls: React.FC<{ lead: CrmLead; run: Run; refresh: () => Promise<void>; manage: boolean; isMember: boolean; flash: Flash }> = ({ lead, run, refresh, manage, isMember, flash }) => {
  const tx = useTx(); const { lang } = useI18n();
  const [sheet, setSheet] = useState<'phone' | 'optout' | null>(null);
  const [tag, setTag] = useState('');
  const [fb, setFb] = useState({ rating: 0, liked: '', objection: '', nextStep: '' });
  const open = !['BOOKED', 'LOST'].includes(lead.stage);
  const left = lead.protectionDaysLeft ?? 99;
  const visited = ['SITE_VISITED', 'NEGOTIATION', 'BOOKING_REQUESTED', 'BOOKED'].includes(lead.stage);
  const tags = lead.tags || [];
  if (lead.erasedAt) return <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">{tx('Personal data of this lead was erased under the retention policy.', 'रिटेंशन नीति के तहत इस लीड का निजी डेटा मिटा दिया गया है।')}</p>;
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {lead.consent && <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800"><ShieldCheck className="h-3 w-3" /> {tx('Consent', 'सहमति')} · {lead.consent.via}</span>}
        {lead.optedOutAt && <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 font-bold text-red-700"><ShieldOff className="h-3 w-3" /> {tx('Opted out — do not contact', 'ऑप्ट-आउट — संपर्क न करें')}</span>}
        {lead.stale && <span className="rounded bg-amber-100 px-2 py-0.5 font-bold text-amber-800">{tx(`No activity ${STALE_DAYS}+ days`, `${STALE_DAYS}+ दिन से कोई गतिविधि नहीं`)}</span>}
        {open && <span className={`rounded px-2 py-0.5 font-semibold ${left <= 7 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'}`}>{tx(`Protection: ${Math.max(0, left)} day(s) left`, `सुरक्षा: ${Math.max(0, left)} दिन बाकी`)}{lead.protectionExtensions ? ` · +${lead.protectionExtensions}` : ''}</span>}
      </div>

      {manage && open && !isMember && left <= 7 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-xs">
          <span className="flex-1 text-amber-900">{tx('Registration protection is ending. Extend it by 30 days if you have really been in touch with this customer.', 'रजिस्ट्रेशन सुरक्षा खत्म होने वाली है। अगर आप सच में ग्राहक से संपर्क में रहे हैं तो 30 दिन बढ़ाएँ।')}</span>
          <button className={btnDark} onClick={() => run(() => api.crmExtendProtection(lead.id), tx('Protection extended by 30 days', 'सुरक्षा 30 दिन बढ़ी'))}>{tx('Extend 30 days', '30 दिन बढ़ाएँ')}</button>
        </div>
      )}

      {manage && !lead.optedOutAt && (
        <div>
          <div className="text-[11px] font-semibold text-slate-600">{tx('Temperature', 'तापमान')}</div>
          <div className="mt-1 flex gap-1.5">{(['HOT', 'WARM', 'COLD'] as const).map(k => <button key={k} onClick={() => run(() => api.crmPatchLead(lead.id, { temperature: k }), tx('Updated', 'अपडेट हुआ'))} className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${lead.temperature === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700'}`}>{TEMP_LABEL[k][0]} {lang === 'hi' ? TEMP_LABEL[k][2] : TEMP_LABEL[k][1]}</button>)}</div>
        </div>
      )}

      {(tags.length > 0 || manage) && (
        <div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600"><Tag className="h-3 w-3" /> {tx('Tags', 'टैग')}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {tags.map(t => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{t}{manage && <button aria-label={`Remove ${t}`} onClick={() => run(() => api.crmPatchLead(lead.id, { tags: tags.filter(x => x !== t) }), tx('Tag removed', 'टैग हटाया'))}><X className="h-3 w-3" /></button>}</span>)}
            {manage && tags.length < MAX_TAGS && (
              <form className="flex gap-1" onSubmit={e => { e.preventDefault(); const v = tag.trim().slice(0, 20); if (v) { setTag(''); run(() => api.crmPatchLead(lead.id, { tags: [...tags, v] }), tx('Tag added', 'टैग जुड़ा')); } }}>
                <input value={tag} onChange={e => setTag(e.target.value)} maxLength={20} placeholder={tx('Add tag (NRI, loan…)', 'टैग जोड़ें (NRI, लोन…)')} className="min-h-9 w-40 rounded-lg border border-slate-300 px-2 text-xs" />
                <button className={btnLine} disabled={!tag.trim()}>+</button>
              </form>
            )}
          </div>
        </div>
      )}

      {visited && (
        <div className="rounded-lg border border-slate-200 p-2.5">
          <div className="text-[11px] font-bold text-slate-800">{tx('Site-visit feedback', 'साइट विज़िट फ़ीडबैक')}</div>
          {(lead.visitFeedback || []).map(v => <p key={v.id} className="mt-1 text-[11px] text-slate-700">{'★'.repeat(v.rating)}{'☆'.repeat(5 - v.rating)} · {v.liked.join(', ') || '—'}{v.objection ? ` · ${tx('objection', 'आपत्ति')}: ${v.objection}` : ''}{v.nextStep ? ` · ${tx('next', 'आगे')}: ${v.nextStep}` : ''} <span className="text-slate-400">({v.byName})</span></p>)}
          {manage && (lead.visitFeedback || []).length < 5 && (
            <div className="mt-2 space-y-2">
              <div className="flex gap-1" role="radiogroup" aria-label={tx('Rating', 'रेटिंग')}>{[1, 2, 3, 4, 5].map(n => <button key={n} role="radio" aria-checked={fb.rating === n} aria-label={`${n}`} onClick={() => setFb({ ...fb, rating: n })} className="grid h-9 w-9 place-items-center"><Star className={`h-5 w-5 ${fb.rating >= n ? 'fill-amber-400 text-amber-500' : 'text-slate-300'}`} /></button>)}</div>
              <input value={fb.liked} onChange={e => setFb({ ...fb, liked: e.target.value })} placeholder={tx('What did they like? (comma separated)', 'क्या पसंद आया? (कॉमा से अलग)')} className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs" />
              <input value={fb.objection} onChange={e => setFb({ ...fb, objection: e.target.value })} maxLength={300} placeholder={tx('Main objection', 'मुख्य आपत्ति')} className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs" />
              <input value={fb.nextStep} onChange={e => setFb({ ...fb, nextStep: e.target.value })} maxLength={200} placeholder={tx('Agreed next step', 'तय अगला कदम')} className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs" />
              <button disabled={!fb.rating} className={btnDark} onClick={() => run(async () => { await api.crmVisitFeedback(lead.id, { rating: fb.rating, liked: fb.liked.split(',').map(s => s.trim()).filter(Boolean).slice(0, 6), objection: fb.objection, nextStep: fb.nextStep }); setFb({ rating: 0, liked: '', objection: '', nextStep: '' }); }, tx('Feedback saved', 'फ़ीडबैक सेव हुआ'))}>{tx('Save feedback', 'फ़ीडबैक सेव करें')}</button>
            </div>
          )}
        </div>
      )}

      {manage && !['BOOKED', 'BOOKING_REQUESTED'].includes(lead.stage) && (
        <div className="flex flex-wrap gap-2">
          {!lead.optedOutAt && <button className={btnLine} onClick={() => setSheet('phone')}><Phone className="h-3.5 w-3.5" /> {tx('Correct phone', 'फ़ोन सुधारें')}</button>}
          {!lead.optedOutAt && <button className={`${btnLine} !border-red-300 !text-red-700`} onClick={() => setSheet('optout')}><ShieldOff className="h-3.5 w-3.5" /> {tx('Customer opted out', 'ग्राहक ऑप्ट-आउट')}</button>}
        </div>
      )}
      {sheet === 'phone' && <PhoneSheet lead={lead} onClose={() => setSheet(null)} onDone={() => { flash(true, tx('Phone corrected (logged)', 'फ़ोन सुधरा (लॉग हुआ)')); refresh(); }} />}
      {sheet === 'optout' && <OptOutSheet lead={lead} onClose={() => setSheet(null)} onDone={() => { flash(true, tx('Opt-out recorded', 'ऑप्ट-आउट दर्ज हुआ')); refresh(); }} />}
    </div>
  );
};

// ───────────────────────── bulk bar ─────────────────────────
export const BulkBar: React.FC<{ ids: string[]; onClear: () => void; onDone: (msg: string) => void }> = ({ ids, onClear, onDone }) => {
  const tx = useTx(); const { busy, err, go } = useBusy();
  const [mode, setMode] = useState<'' | 'TAG' | 'FOLLOWUP' | 'LOST'>('');
  const [tag, setTag] = useState(''); const [fu, setFu] = useState({ dueAt: localIso(new Date(Date.now() + 86400000)), channel: 'CALL', note: '' });
  const send = (body: any, msg: string) => go(() => api.crmBulk({ ids, ...body }).then(r => { if (r.done < ids.length) throw new Error(tx(`${r.done} of ${ids.length} updated — ${r.results.find(x => !x.ok)?.error || 'some failed'}`, `${ids.length} में से ${r.done} अपडेट हुए — ${r.results.find(x => !x.ok)?.error || 'कुछ फेल हुए'}`)); }), () => { setMode(''); onDone(msg); });
  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-300 bg-white p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
          <b className="text-xs text-slate-900">{ids.length} {tx('selected', 'चुने गए')}</b>
          {ids.length > MAX_BULK && <span className="text-[11px] font-semibold text-red-600">{tx(`max ${MAX_BULK}`, `अधिकतम ${MAX_BULK}`)}</span>}
          {(['HOT', 'WARM', 'COLD'] as const).map(k => <button key={k} disabled={busy || !ids.length || ids.length > MAX_BULK} className={btnLine} onClick={() => send({ action: 'TEMPERATURE', temperature: k }, tx('Temperature set', 'तापमान सेट'))}>{TEMP_LABEL[k][0]}</button>)}
          <button disabled={!ids.length || ids.length > MAX_BULK} className={btnLine} onClick={() => setMode('TAG')}>{tx('Tag', 'टैग')}</button>
          <button disabled={!ids.length || ids.length > MAX_BULK} className={btnLine} onClick={() => setMode('FOLLOWUP')}>{tx('Follow-up', 'फ़ॉलो-अप')}</button>
          <button disabled={!ids.length || ids.length > MAX_BULK} className={`${btnLine} !border-red-300 !text-red-700`} onClick={() => setMode('LOST')}>{tx('Mark lost', 'लॉस्ट')}</button>
          <button className="ml-auto min-h-9 px-2 text-[11px] font-semibold text-slate-600" onClick={onClear}>{tx('Done', 'पूरा')}</button>
        </div>
        {err && !mode && <p className="mx-auto mt-2 max-w-5xl text-xs font-medium text-red-700">{err}</p>}
      </div>
      {mode === 'TAG' && <Sheet title={tx(`Tag ${ids.length} leads`, `${ids.length} लीड को टैग करें`)} onClose={() => setMode('')}><div className="space-y-3"><input autoFocus value={tag} maxLength={20} onChange={e => setTag(e.target.value)} placeholder={tx('e.g. diwali-offer', 'जैसे diwali-offer')} className={inp} /><Err msg={err} /><button disabled={busy || !tag.trim()} className={`${btnDark} w-full`} onClick={() => send({ action: 'TAG', tag }, tx('Tag added', 'टैग जुड़ा'))}>{tx('Add tag', 'टैग जोड़ें')}</button></div></Sheet>}
      {mode === 'FOLLOWUP' && <Sheet title={tx(`Follow-up for ${ids.length} leads`, `${ids.length} लीड के लिए फ़ॉलो-अप`)} onClose={() => setMode('')}><div className="space-y-3"><input type="datetime-local" value={fu.dueAt} onChange={e => setFu({ ...fu, dueAt: e.target.value })} className={inp} /><select value={fu.channel} onChange={e => setFu({ ...fu, channel: e.target.value })} className={inp}>{['CALL', 'WHATSAPP', 'MEETING', 'SITE_VISIT'].map(c => <option key={c}>{c}</option>)}</select><input value={fu.note} maxLength={300} onChange={e => setFu({ ...fu, note: e.target.value })} placeholder={tx('Reminder note', 'रिमाइंडर नोट')} className={inp} /><Err msg={err} /><button disabled={busy || fu.note.trim().length < 2 || !fu.dueAt} className={`${btnDark} w-full`} onClick={() => send({ action: 'FOLLOWUP', dueAt: new Date(fu.dueAt).toISOString(), channel: fu.channel, note: fu.note }, tx('Follow-ups set', 'फ़ॉलो-अप सेट हुए'))}>{tx('Set follow-ups', 'फ़ॉलो-अप सेट करें')}</button></div></Sheet>}
      {mode === 'LOST' && <LostSheet title={tx(`Mark ${ids.length} leads lost`, `${ids.length} लीड लॉस्ट करें`)} onClose={() => setMode('')} onSubmit={async (code, text) => { const r = await api.crmBulk({ ids, action: 'LOST', lostCode: code, note: text || undefined }); onDone(tx(`${r.done} leads marked lost`, `${r.done} लीड लॉस्ट हुईं`)); }} />}
    </>
  );
};

// ───────────────────────── import / export ─────────────────────────
export const ImportSheet: React.FC<{ projects: { id: string; projectName: string }[]; onClose: () => void; onDone: (n: number) => void }> = ({ projects, onClose, onDone }) => {
  const tx = useTx(); const { busy, err, go } = useBusy(); const file = useRef<HTMLInputElement>(null);
  const [projectId, setProjectId] = useState(projects[0]?.id || ''); const [csv, setCsv] = useState(''); const [consent, setConsent] = useState(false);
  const [res, setRes] = useState<{ imported: number; failed: number; results: any[] } | null>(null);
  const rows = Math.max(0, csv.split(/\r?\n/).filter(l => l.trim()).length - 1);
  return (
    <Sheet title={tx('Import leads from CSV', 'CSV से लीड इम्पोर्ट करें')} onClose={onClose}>
      {res ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-900">{tx(`${res.imported} imported, ${res.failed} skipped`, `${res.imported} इम्पोर्ट, ${res.failed} छोड़े गए`)}</p>
          {res.failed > 0 && <ul className="max-h-56 space-y-1 overflow-y-auto text-[11px]">{res.results.filter(r => !r.ok).map(r => <li key={r.row} className="rounded bg-red-50 px-2 py-1 text-red-700">{tx('Row', 'पंक्ति')} {r.row}: {r.error}</li>)}</ul>}
          <button className={`${btnDark} w-full`} onClick={() => { onDone(res.imported); onClose(); }}>{tx('Close', 'बंद करें')}</button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">{tx(`First row must be: name, phone (optional: email, interest, budget, note). Up to ${MAX_IMPORT_ROWS} rows. Duplicates and protected numbers are skipped with a reason.`, `पहली पंक्ति: name, phone (वैकल्पिक: email, interest, budget, note)। अधिकतम ${MAX_IMPORT_ROWS} पंक्तियाँ। डुप्लीकेट और सुरक्षित नंबर कारण के साथ छोड़ दिए जाते हैं।`)}</p>
          <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inp}>{projects.map(p => <option key={p.id} value={p.id}>{p.projectName}</option>)}</select>
          <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={6} placeholder={'name,phone,interest\nRavi Sharma,9876543210,3 BHK'} className={`${inp} font-mono text-xs`} />
          <div className="flex items-center gap-2"><input ref={file} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { if (f.size > 400_000) { setCsv(''); return; } setCsv(await f.text()); } }} /><button type="button" className={btnLine} onClick={() => file.current?.click()}><Upload className="h-3.5 w-3.5" /> {tx('Choose file', 'फ़ाइल चुनें')}</button>{rows > 0 && <span className="text-[11px] text-slate-500">{rows} {tx('rows', 'पंक्तियाँ')}</span>}</div>
          <label className="flex items-start gap-2 text-xs text-slate-800"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4" /><span>{tx('I confirm every customer in this file agreed to be contacted about this project.', 'मैं पुष्टि करता/करती हूँ कि इस फ़ाइल के हर ग्राहक ने इस प्रोजेक्ट के बारे में संपर्क की सहमति दी है।')}</span></label>
          <Err msg={err} />
          <button disabled={busy || !consent || !projectId || rows < 1 || rows > MAX_IMPORT_ROWS} className={`${btnDark} w-full`} onClick={() => go(async () => setRes(await api.crmImport({ projectId, csv, consent: true })), () => undefined)}>{tx('Import', 'इम्पोर्ट')}</button>
        </div>
      )}
    </Sheet>
  );
};

export const ExportButtons: React.FC<{ canFull: boolean; flash: Flash }> = ({ canFull, flash }) => {
  const tx = useTx(); const [busy, setBusy] = useState(false); const [open, setOpen] = useState(false);
  const dl = async (full: boolean) => {
    setBusy(true);
    try { const blob = await api.crmExportCsv(full); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `genz-leads-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); flash(true, tx('Export downloaded (logged)', 'एक्सपोर्ट डाउनलोड हुआ (लॉग)')); setOpen(false); }
    catch (e: any) { flash(false, e.message); setOpen(false); } finally { setBusy(false); }
  };
  return (<>
    <button className={btnLine} onClick={() => (canFull ? setOpen(true) : dl(false))}><Download className="h-3.5 w-3.5" /> {tx('Export CSV', 'CSV एक्सपोर्ट')}</button>
    {open && (
      <Sheet title={tx('Export leads', 'लीड एक्सपोर्ट करें')} onClose={() => setOpen(false)}>
        <div className="space-y-2">
          <p className="text-xs text-slate-600">{tx('Every export is logged. Customer phone numbers are masked unless you choose otherwise — keep the file private.', 'हर एक्सपोर्ट लॉग होता है। ग्राहकों के फ़ोन नंबर मास्क्ड रहते हैं जब तक आप अलग न चुनें — फ़ाइल निजी रखें।')}</p>
          <button disabled={busy} className={`${btnDark} w-full`} onClick={() => dl(false)}>{tx('Masked numbers (recommended)', 'मास्क्ड नंबर (सुझाया गया)')}</button>
          <button disabled={busy} className={`${btnLine} w-full`} onClick={() => dl(true)}>{tx('Full phone numbers (logged)', 'पूरे फ़ोन नंबर (लॉग होगा)')}</button>
        </div>
      </Sheet>
    )}
  </>);
};
