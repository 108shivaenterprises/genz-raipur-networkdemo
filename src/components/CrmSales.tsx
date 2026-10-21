import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, PhoneCall, ArrowRightLeft, Plus, Trash2, Check, X, Pencil, IndianRupee } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { Sheet, Err, useBusy, inp, btnDark, btnLine, inr } from './CrmPlus.js';
import {
  LEAD_SOURCES, sourceLabel, sourceHint, optLabel, PURPOSES, FUNDINGS, LOAN_STATUSES, TIMELINES, OCCUPATIONS, CURRENT_HOMES, BEST_TIMES, LANGUAGES,
  PROFILE_TEXT_MAX, profileCompleteness, MISSING_LABEL, CALL_OUTCOMES, callOutcome, FORWARD_PURPOSES, TEAM_ROLES, NEXT_ROLE,
  TOKEN_MODES, PLAN_TYPES, MAX_SCHEDULE_LINES, scheduleError,
  type LeadProfile,
} from '../shared/crmSales.js';
import type { CrmLead, CrmBooking } from '../types/crm.js';
import { isOpenTrail } from '../shared/moneyTrail.js';

/**
 * v16.7 — Sales Desk UI: lead source, customer details, telecaller call log + call list, forwarding to the next executive,
 * the booking request (amount, payment condition) and the builder's "booking amount received?" confirmation.
 * Everything is bilingual (tx / the hi + en labels that ship with the shared rules).
 */
type Opt = { id: string; en: string; hi: string };
type Flash = (ok: boolean, msg: string) => void;
const when = (s?: string) => (s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const localIso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const ago = (iso?: string, hi = false) => {
  if (!iso) return '';
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 60) return hi ? `${m} मिनट पहले` : `${m} min ago`;
  if (m < 1440) return hi ? `${Math.round(m / 60)} घंटे पहले` : `${Math.round(m / 60)} h ago`;
  return hi ? `${Math.round(m / 1440)} दिन पहले` : `${Math.round(m / 1440)} d ago`;
};
const lab = 'block text-[11px] font-semibold text-slate-600';
const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(/,/g, '')));

export const outcomeLabel = (id: string | undefined, hi: boolean) => optLabel(CALL_OUTCOMES, id, hi);

const Sel: React.FC<{ label: string; value?: string; list: readonly Opt[]; onChange: (v: string) => void; hi: boolean; required?: boolean }> = ({ label, value, list, onChange, hi, required }) => (
  <label className={lab}>{label}
    <select required={required} value={value || ''} onChange={e => onChange(e.target.value)} className={`${inp} mt-0.5 !py-1.5`}>
      <option value="">—</option>
      {list.map(o => <option key={o.id} value={o.id}>{hi ? o.hi : o.en}</option>)}
    </select>
  </label>
);

// ═════════════════════════ lead source ═════════════════════════
export const SourceField: React.FC<{ source: string; detail: string; onChange: (source: string, detail: string) => void }> = ({ source, detail, onChange }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  return (
    <div className="space-y-1.5">
      <label className={lab}>{tx('Where did this lead come from?', 'यह लीड कहाँ से आई?')}
        <select value={source} onChange={e => onChange(e.target.value, '')} className={`${inp} mt-0.5`}>
          {LEAD_SOURCES.map(s => <option key={s.id} value={s.id}>{hi ? s.hi : s.en}</option>)}
        </select>
      </label>
      <input value={detail} maxLength={100} onChange={e => onChange(source, e.target.value)} placeholder={sourceHint(source, hi)} aria-label={tx('Source detail', 'स्रोत का विवरण')} className={inp} />
    </div>
  );
};

// ═════════════════════════ customer details ═════════════════════════
const ENUM_FIELDS: { key: keyof LeadProfile; list: readonly Opt[]; en: string; hi: string }[] = [
  { key: 'purpose', list: PURPOSES, en: 'Why are they buying?', hi: 'खरीद का मक़सद' },
  { key: 'funding', list: FUNDINGS, en: 'How will they pay?', hi: 'पैसे का इंतज़ाम' },
  { key: 'loanStatus', list: LOAN_STATUSES, en: 'Home-loan status', hi: 'होम लोन की स्थिति' },
  { key: 'timeline', list: TIMELINES, en: 'When do they want to buy?', hi: 'कब तक खरीदना है' },
  { key: 'occupation', list: OCCUPATIONS, en: 'What do they do?', hi: 'पेशा' },
  { key: 'currentHome', list: CURRENT_HOMES, en: 'Current home', hi: 'अभी का घर' },
  { key: 'bestTimeToCall', list: BEST_TIMES, en: 'Best time to call', hi: 'कॉल का सही समय' },
  { key: 'language', list: LANGUAGES, en: 'Language', hi: 'भाषा' },
];

/** The "customer details" form (no income, PAN / Aadhaar, religion, caste, health or second phone — by design). */
export const ProfileFields: React.FC<{ value: LeadProfile; onChange: (p: LeadProfile) => void; competitorsPrivate?: boolean }> = ({ value, onChange, competitorsPrivate }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const set = (k: keyof LeadProfile, v: unknown) => { const next: Record<string, unknown> = { ...value, [k]: v === '' ? undefined : v }; if (k === 'funding' && v === 'SELF') delete next.loanStatus; onChange(next as LeadProfile); };
  const txt = (k: keyof typeof PROFILE_TEXT_MAX, en: string, hiL: string, rows = 0) => (
    <label className={lab}>{tx(en, hiL)}
      {rows ? <textarea rows={rows} maxLength={PROFILE_TEXT_MAX[k]} value={(value[k] as string) || ''} onChange={e => set(k, e.target.value)} className={`${inp} mt-0.5`} />
        : <input maxLength={PROFILE_TEXT_MAX[k]} value={(value[k] as string) || ''} onChange={e => set(k, e.target.value)} className={`${inp} mt-0.5 !py-1.5`} />}
    </label>
  );
  return (
    <div className="space-y-2.5">
      <div className="grid gap-2 sm:grid-cols-2">
        {ENUM_FIELDS.filter(f => f.key !== 'loanStatus' || (value.funding && value.funding !== 'SELF')).map(f => (
          <Sel key={f.key} label={tx(f.en, f.hi)} value={value[f.key] as string} list={f.list} hi={hi} onChange={v => set(f.key, v)} />
        ))}
        <label className={lab}>{tx('Family members', 'परिवार के सदस्य')}
          <input inputMode="numeric" value={value.familySize ?? ''} onChange={e => set('familySize', e.target.value === '' ? '' : Number(e.target.value.replace(/\D/g, '')))} className={`${inp} mt-0.5 !py-1.5`} />
        </label>
        {txt('residenceCity', 'City they live in', 'किस शहर में रहते हैं')}
        {txt('residenceLocality', 'Area / locality', 'इलाका / मोहल्ला')}
        {txt('decisionMaker', 'Who decides? (self, spouse, father…)', 'फ़ैसला कौन करेगा (खुद, पत्नी, पिता…)')}
        <div>{txt('competitors', 'Other projects they are seeing', 'और कौन से प्रोजेक्ट देख रहे हैं')}{competitorsPrivate && <span className="text-[10px] text-slate-500">{tx('Only you and your team see this — never the builder.', 'यह सिर्फ़ आप और आपकी टीम देखती है — बिल्डर नहीं।')}</span>}</div>
      </div>
      {txt('preferences', 'What do they want? (facing, floor, parking…)', 'क्या चाहिए? (फ़ेसिंग, फ़्लोर, पार्किंग…)', 2)}
      {txt('remarks', 'Remarks', 'टिप्पणी', 2)}
      <p className="text-[10px] text-slate-500">{tx('Only what is needed to serve the customer. Do not enter income, PAN / Aadhaar, religion, caste or health details.', 'सिर्फ़ वही जो ग्राहक की सेवा के लिए ज़रूरी है। आय, PAN / आधार, धर्म, जाति या सेहत की जानकारी न डालें।')}</p>
    </div>
  );
};

const ProfileSheet: React.FC<{ lead: CrmLead; onClose: () => void; onSaved: () => void }> = ({ lead, onClose, onSaved }) => {
  const tx = useTx(); const { busy, err, go } = useBusy();
  const [p, setP] = useState<LeadProfile>({ ...(lead.profile || {}) });
  const [budget, setBudget] = useState(lead.budgetMax ? String(lead.budgetMax) : '');
  const [unit, setUnit] = useState(lead.unitInterest || '');
  return (
    <Sheet title={tx('Customer details', 'ग्राहक की जानकारी')} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={lab}>{tx('Wants (e.g. 3 BHK)', 'क्या चाहिए (जैसे 3 BHK)')}<input value={unit} maxLength={160} onChange={e => setUnit(e.target.value)} className={`${inp} mt-0.5 !py-1.5`} /></label>
          <label className={lab}>{tx('Max budget ₹', 'अधिकतम बजट ₹')}<input inputMode="numeric" value={budget} onChange={e => setBudget(e.target.value)} className={`${inp} mt-0.5 !py-1.5`} />{num(budget) ? <span className="text-[10px] font-normal text-slate-500">{inr(num(budget)!)}</span> : null}</label>
        </div>
        <ProfileFields value={p} onChange={setP} competitorsPrivate={!!lead.associateId} />
        <Err msg={err} />
        <button disabled={busy} onClick={() => go(() => api.crmPatchLead(lead.id, { profile: p as Record<string, unknown>, unitInterest: unit.trim(), ...(num(budget) ? { budgetMax: num(budget) } : {}) }), () => { onSaved(); onClose(); })} className={`${btnDark} w-full`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{tx('Save details', 'जानकारी सेव करें')}
        </button>
      </div>
    </Sheet>
  );
};

const SourceSheet: React.FC<{ lead: CrmLead; onClose: () => void; onSaved: () => void }> = ({ lead, onClose, onSaved }) => {
  const tx = useTx(); const { busy, err, go } = useBusy();
  const [s, setS] = useState({ source: lead.source as string, detail: lead.sourceDetail || '' });
  return (
    <Sheet title={tx('Lead source', 'लीड का स्रोत')} onClose={onClose}>
      <div className="space-y-3">
        <SourceField source={s.source} detail={s.detail} onChange={(source, detail) => setS({ source, detail })} />
        <Err msg={err} />
        <button disabled={busy} onClick={() => go(() => api.crmPatchLead(lead.id, { source: s.source, sourceDetail: s.detail.trim() }), () => { onSaved(); onClose(); })} className={`${btnDark} w-full`}>{tx('Save source', 'स्रोत सेव करें')}</button>
      </div>
    </Sheet>
  );
};

/** Source + "what we know about this customer" — a meter, the answers so far and what to ask next. */
export const LeadDetailsCard: React.FC<{ lead: CrmLead; canEdit: boolean; isMember: boolean; onSaved: () => void }> = ({ lead, canEdit, isMember, onSaved }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const [sheet, setSheet] = useState<'profile' | 'source' | null>(null);
  if (lead.erasedAt) return null;
  const p = lead.profile || {}; const dc = profileCompleteness(lead);
  const chips: [string, string][] = [];
  for (const f of ENUM_FIELDS) { const v = p[f.key] as string | undefined; if (v) chips.push([tx(f.en, f.hi), optLabel(f.list, v, hi)]); }
  if (p.residenceLocality || p.residenceCity) chips.push([tx('Lives in', 'रहते हैं'), [p.residenceLocality, p.residenceCity].filter(Boolean).join(', ')]);
  if (p.familySize) chips.push([tx('Family', 'परिवार'), String(p.familySize)]);
  if (p.decisionMaker) chips.push([tx('Decides', 'फ़ैसला'), p.decisionMaker]);
  if (p.competitors) chips.push([tx('Also seeing', 'और देख रहे'), p.competitors]);
  const missing = dc.missing.map(k => MISSING_LABEL[k]?.[hi ? 1 : 0]).filter(Boolean);
  const pctDone = Math.round((dc.filled / dc.total) * 100);
  return (
    <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold text-slate-800">{tx('Source & customer details', 'स्रोत और ग्राहक की जानकारी')}</div>
        {canEdit && !lead.optedOutAt && <button onClick={() => setSheet('profile')} className={btnLine}><Pencil className="h-3 w-3" /> {tx('Edit details', 'जानकारी भरें')}</button>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-700">
        <span className="rounded bg-white px-2 py-0.5 font-semibold ring-1 ring-slate-200">{tx('Source', 'स्रोत')}: {sourceLabel(lead.source, hi)}{lead.sourceDetail ? ` — ${lead.sourceDetail}` : ''}</span>
        {canEdit && !isMember && !lead.optedOutAt && <button onClick={() => setSheet('source')} className="font-semibold text-slate-900 underline">{tx('change', 'बदलें')}</button>}
      </div>
      <div className="flex items-center gap-2" aria-label={tx('How well we know this customer', 'ग्राहक के बारे में कितनी जानकारी')}>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${pctDone >= 70 ? 'bg-emerald-500' : pctDone >= 40 ? 'bg-amber-500' : 'bg-red-400'}`} style={{ width: `${Math.max(4, pctDone)}%` }} /></div>
        <b className="text-[11px] text-slate-800">{dc.filled}/{dc.total}</b>
      </div>
      {chips.length > 0 && <div className="flex flex-wrap gap-1.5">{chips.map(([k, v]) => <span key={k + v} className="rounded-full bg-white px-2.5 py-0.5 text-[11px] text-slate-700 ring-1 ring-slate-200"><span className="text-slate-500">{k}:</span> <b>{v}</b></span>)}</div>}
      {(p.preferences || p.remarks) && <p className="text-[11px] text-slate-600">{[p.preferences, p.remarks].filter(Boolean).join(' · ')}</p>}
      {missing.length > 0 && !lead.optedOutAt && <p className="text-[11px] text-amber-800">{tx('Ask next:', 'अगला पूछें:')} {missing.slice(0, 4).join(', ')}</p>}
      {sheet === 'profile' && <ProfileSheet lead={lead} onClose={() => setSheet(null)} onSaved={onSaved} />}
      {sheet === 'source' && <SourceSheet lead={lead} onClose={() => setSheet(null)} onSaved={onSaved} />}
    </div>
  );
};

// ═════════════════════════ telecaller: log a call ═════════════════════════
export const CallPanel: React.FC<{ lead: CrmLead; flash: Flash; onChanged: () => Promise<void> | void; onLost: () => void }> = ({ lead, flash, onChanged, onLost }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const [outcome, setOutcome] = useState(''); const [at, setAt] = useState(''); const [dur, setDur] = useState(''); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [hint, setHint] = useState<string>('');
  const oc = callOutcome(outcome);
  const attempts = lead.callAttempts || 0; const conn = lead.callsConnected || 0;
  const submit = async () => {
    setBusy(true); setErr(''); setHint('');
    try {
      const r = await api.crmCall(lead.id, { outcome, ...(note.trim() ? { note: note.trim() } : {}), ...(dur.trim() ? { durationMin: Number(dur) } : {}), ...(oc?.needsWhen && at ? { when: new Date(at).toISOString() } : {}) });
      flash(true, tx('Call logged', 'कॉल दर्ज हुई'));
      setOutcome(''); setAt(''); setDur(''); setNote('');
      if (r.suggest === 'LOST') setHint(tx('The customer is not interested. Mark the lead lost, with the reason?', 'ग्राहक की रुचि नहीं है। कारण के साथ लीड “खोई” चिह्नित करें?'));
      else if (r.suggest === 'TRY_WHATSAPP') setHint(tx(`${attempts + 1} calls and never reached. Try WhatsApp, or mark the lead lost as “not responding”.`, `${attempts + 1} कॉल और एक बार भी बात नहीं हुई। WhatsApp आज़माएँ, या “जवाब नहीं” कारण से लीड खोई करें।`));
      else if (r.suggest === 'FIX_NUMBER') setHint(tx('Wrong number. Correct the phone number (Lead controls) or mark the lead lost.', 'गलत नंबर। फ़ोन नंबर सुधारें (लीड कंट्रोल) या लीड खोई करें।'));
      await onChanged();
    } catch (e: any) { setErr(e.message || 'Failed'); } finally { setBusy(false); }
  };
  return (
    <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-sky-900"><PhoneCall className="h-3.5 w-3.5" /> {tx('Log a call', 'कॉल दर्ज करें')}</div>
        <div className="text-[11px] text-slate-600">
          {attempts === 0 ? tx('Not called yet', 'अभी कॉल नहीं हुई') : <>{tx(`${attempts} call(s) · ${conn} connected`, `${attempts} कॉल · ${conn} में बात हुई`)}{lead.lastCallOutcome && <> · {outcomeLabel(lead.lastCallOutcome, hi)} {ago(lead.lastCallAt, hi)}</>}</>}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {CALL_OUTCOMES.map(o => (
          <button key={o.id} type="button" onClick={() => setOutcome(outcome === o.id ? '' : o.id)} aria-pressed={outcome === o.id}
            className={`min-h-9 rounded-lg border px-2 py-1 text-left text-[11px] font-semibold ${outcome === o.id ? (o.connected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-800 bg-slate-800 text-white') : o.connected ? 'border-emerald-200 bg-white text-emerald-900 hover:border-emerald-600' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-800'}`}>
            {hi ? o.hi : o.en}
          </button>
        ))}
      </div>
      {oc && (
        <div className="mt-2 space-y-2">
          {oc.needsWhen && (
            <label className={lab}>{oc.needsWhen === 'VISIT' ? tx('Visit date & time', 'विज़िट की तारीख़ और समय') : tx('Call back on', 'कब कॉल करना है')}
              <input type="datetime-local" min={localIso(new Date())} value={at} onChange={e => setAt(e.target.value)} className={`${inp} mt-0.5 !py-1.5`} />
            </label>
          )}
          <div className="flex gap-2">
            <input value={note} maxLength={400} onChange={e => setNote(e.target.value)} placeholder={tx('What did they say? (optional)', 'क्या बोले? (वैकल्पिक)')} className={`${inp} min-w-0 flex-1 !py-1.5`} />
            {oc.connected && <input value={dur} inputMode="numeric" onChange={e => setDur(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder={tx('min', 'मिनट')} aria-label={tx('Call length in minutes', 'कॉल कितने मिनट की')} className={`${inp} !w-16 !py-1.5`} />}
          </div>
          {!oc.connected && oc.retryHours && <p className="text-[10px] text-slate-500">{tx(`A retry reminder is set for ${oc.retryHours} hours later.`, `${oc.retryHours} घंटे बाद का रिमाइंडर अपने आप लगेगा।`)}</p>}
          <button disabled={busy || (!!oc.needsWhen && !at)} onClick={submit} className={`${btnDark} w-full`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {tx('Save call', 'कॉल सेव करें')}</button>
        </div>
      )}
      <Err msg={err} />
      {hint && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          <span className="flex-1">{hint}</span>
          <button onClick={onLost} className={btnLine}>{tx('Mark lost', 'खोई करें')}</button>
          <button onClick={() => setHint('')} aria-label={tx('Dismiss', 'हटाएँ')}><X className="h-3.5 w-3.5 text-amber-700" /></button>
        </div>
      )}
    </div>
  );
};

// ═════════════════════════ forwarding ═════════════════════════
export const ForwardSheet: React.FC<{ lead: CrmLead; meRole: string; onClose: () => void; onDone: (toName: string) => void }> = ({ lead, meRole, onClose, onDone }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi'; const { busy, err, go } = useBusy();
  const [d, setD] = useState<Awaited<ReturnType<typeof api.crmForwardTargets>> | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [to, setTo] = useState(''); const [purpose, setPurpose] = useState('FOLLOW_UP'); const [note, setNote] = useState('');
  useEffect(() => { api.crmForwardTargets(lead.id).then(setD).catch(e => setLoadErr(e.message)); }, [lead.id]);
  const order = ['TELECALLER', 'SALES_EXECUTIVE', 'SITE_COORDINATOR', 'CLOSING_MANAGER', 'ASSISTANT', 'OTHER'];
  const sorted = useMemo(() => (d?.targets || []).slice().sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked) || Number(b.role === NEXT_ROLE[meRole]) - Number(a.role === NEXT_ROLE[meRole]) || order.indexOf(a.role) - order.indexOf(b.role) || a.openLeads - b.openLeads), [d, meRole]); // eslint-disable-line
  return (
    <Sheet title={tx('Forward this lead', 'यह लीड आगे भेजें')} onClose={onClose}>
      {!d && !loadErr && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>}
      <Err msg={loadErr} />
      {d && (
        <div className="space-y-3">
          <p className="text-[11px] text-slate-600">{tx('The next person sees what you did and what to do next. The history stays on the lead.', 'अगला व्यक्ति देखेगा कि आपने क्या किया और आगे क्या करना है। पूरा इतिहास लीड पर रहेगा।')}{d.current ? ` ${tx('Now with', 'अभी इनके पास')}: ${d.current.name}.` : ''}</p>
          {!d.canForwardNow && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{tx('You cannot forward this lead right now (your employer controls this, or the lead is closed).', 'आप अभी यह लीड आगे नहीं भेज सकते (यह आपके नियोक्ता के नियंत्रण में है, या लीड बंद है)।')}</p>}
          {sorted.length === 0 && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{tx('There is nobody to forward to. Add a team member first (My Team).', 'आगे भेजने के लिए कोई नहीं है। पहले टीम सदस्य जोड़ें (मेरी टीम)।')}</p>}
          <div className="space-y-1.5" role="radiogroup" aria-label={tx('Forward to', 'किसे भेजें')}>
            {sorted.map(m => {
              const suggested = !m.blocked && m.role === NEXT_ROLE[meRole];
              return (
                <button key={m.id} type="button" role="radio" aria-checked={to === m.id} disabled={!!m.blocked} onClick={() => setTo(m.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs ${to === m.id ? 'border-slate-900 ring-2 ring-slate-900' : 'border-slate-200 hover:border-slate-500'} disabled:cursor-not-allowed disabled:opacity-50`}>
                  <span className="min-w-0"><b className="text-slate-900">{m.name}</b><span className="block truncate text-[10px] text-slate-500">{optLabel(TEAM_ROLES, m.role, hi)}{m.title && m.title.toLowerCase() !== optLabel(TEAM_ROLES, m.role, false).toLowerCase() ? ` · ${m.title}` : ''}</span></span>
                  <span className="shrink-0 text-right text-[10px] text-slate-500">{m.blocked ? <span className="font-semibold text-red-700">{m.blocked === 'on leave' ? tx('on leave', 'छुट्टी पर') : m.blocked === 'not on this project' ? tx('not on this project', 'इस प्रोजेक्ट पर नहीं') : tx('lead limit reached', 'लीड की सीमा पूरी')}</span> : <>{m.openLeads} {tx('open', 'खुली')}{suggested && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-800">{tx('next step', 'अगला कदम')}</span>}</>}</span>
                </button>
              );
            })}
          </div>
          <div>
            <div className={lab}>{tx('What should they do?', 'उन्हें क्या करना है?')}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">{FORWARD_PURPOSES.map(p => <button key={p.id} type="button" onClick={() => setPurpose(p.id)} className={`min-h-9 rounded-full border px-3 text-[11px] font-semibold ${purpose === p.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{hi ? p.hi : p.en}</button>)}</div>
          </div>
          <label className={lab}>{tx('Hand-off note (what you did, what next)', 'हैंड-ऑफ़ नोट (आपने क्या किया, आगे क्या)')}
            <textarea rows={3} maxLength={400} value={note} onChange={e => setNote(e.target.value)} placeholder={tx('e.g. Spoke twice, wants a 3 BHK, free on Sunday for a site visit', 'जैसे: दो बार बात हुई, 3 BHK चाहिए, रविवार को साइट विज़िट के लिए फ़्री')} className={`${inp} mt-0.5`} />
          </label>
          <Err msg={err} />
          <button disabled={busy || !to || note.trim().length < 5 || !d.canForwardNow} onClick={() => go(() => api.crmForward(lead.id, { toMemberId: to, purpose, note: note.trim() }).then(r => onDone(r.forwardedTo.name)), onClose)} className={`${btnDark} w-full`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />} {tx('Forward', 'आगे भेजें')}
          </button>
        </div>
      )}
    </Sheet>
  );
};

export const HandoffTrail: React.FC<{ lead: CrmLead }> = ({ lead }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const hs = lead.handoffs || [];
  if (!hs.length) return null;
  return (
    <div className="mt-4">
      <div className="flex items-center gap-1 text-xs font-bold text-slate-800"><ArrowRightLeft className="h-3.5 w-3.5" /> {tx('Passed on', 'आगे भेजा गया')}</div>
      <ul className="mt-1 space-y-1.5">
        {hs.slice(0, 6).map((h, i) => (
          <li key={h.id} className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
            <div className="flex flex-wrap items-center gap-1.5"><b>{h.fromName} → {h.toName}</b><span className="rounded bg-white px-1.5 py-0.5 ring-1 ring-slate-200">{optLabel(FORWARD_PURPOSES, h.purpose, hi)}</span>
              {i === 0 && (h.seenAt ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800">{tx('opened', 'खोला गया')}</span> : <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">{tx('not opened yet', 'अभी खोला नहीं')}</span>)}</div>
            <p className="mt-0.5">{h.note}</p><div className="text-[10px] text-slate-400">{when(h.at)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ═════════════════════════ call list ═════════════════════════
export const CallQueuePanel: React.FC<{ onOpen: (id: string) => void; canFilter: boolean }> = ({ onOpen, canFilter }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const [d, setD] = useState<Awaited<ReturnType<typeof api.crmCallQueue>> | null>(null);
  const [err, setErr] = useState(''); const [mem, setMem] = useState(''); const [members, setMembers] = useState<any[]>([]);
  useEffect(() => { if (canFilter) api.teamList().then(r => setMembers(r.members.filter((m: any) => m.status === 'VERIFIED'))).catch(() => setMembers([])); }, [canFilter]);
  useEffect(() => { setD(null); setErr(''); api.crmCallQueue(mem || undefined).then(setD).catch(e => setErr(e.message)); }, [mem]);
  if (err) return <Err msg={err} />;
  if (!d) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>;
  const REASON: Record<string, [string, string, string]> = { FOLLOWUP_DUE: ['Follow-up due', 'फ़ॉलो-अप का समय', 'bg-red-100 text-red-800'], NEW_UNCALLED: ['New — not called', 'नई — कॉल नहीं हुई', 'bg-amber-100 text-amber-800'], TODAY: ['Due today', 'आज का', 'bg-sky-100 text-sky-800'] };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600">{tx(`${d.counts.due} follow-ups due · ${d.counts.fresh} new leads not called · ${d.counts.today} due today`, `${d.counts.due} फ़ॉलो-अप बाकी · ${d.counts.fresh} नई लीड पर कॉल नहीं · ${d.counts.today} आज के`)}</p>
        {canFilter && members.length > 0 && (
          <select value={mem} onChange={e => setMem(e.target.value)} className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs" aria-label={tx('Team member', 'टीम सदस्य')}>
            <option value="">{tx('Everyone', 'सब')}</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </div>
      {d.queue.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{tx('Nobody is waiting for a call. Well done!', 'किसी को कॉल का इंतज़ार नहीं। शाबाश!')}</p>}
      <ul className="space-y-2">
        {d.queue.map((r: any) => (
          <li key={r.id}>
            <button onClick={() => onOpen(r.id)} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900">{r.name}</div><div className="truncate text-[11px] text-slate-500">{r.projectName}{r.assignedMemberName ? ` · ${r.assignedMemberName}` : ''}</div></div>
                <div className="flex flex-wrap items-center gap-1 text-[10px] font-bold">
                  {r.forwardUnseen && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-800">{tx('forwarded to you', 'आपको फ़ॉरवर्ड')}</span>}
                  <span className={`rounded px-1.5 py-0.5 ${REASON[r.reason][2]}`}>{hi ? REASON[r.reason][1] : REASON[r.reason][0]}</span>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                <span>{r.attempts === 0 ? tx('never called', 'कभी कॉल नहीं') : tx(`${r.attempts} call(s)`, `${r.attempts} कॉल`)}{r.lastOutcome ? ` · ${outcomeLabel(r.lastOutcome, hi)} ${ago(r.lastCallAt, hi)}` : ''}</span>
                <span>{sourceLabel(r.source, hi)}</span>
                <span>{tx('details', 'जानकारी')} {r.detailsFilled}/{r.detailsTotal}</span>
                {r.dueAt && <span>{tx('due', 'समय')} {when(r.dueAt)}</span>}
              </div>
              {r.followUpNote && <div className="mt-1 text-[11px] text-slate-500">“{r.followUpNote}”</div>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ═════════════════════════ booking request: amount + payment condition ═════════════════════════
type Line = { name: string; pct: string; dueInDays: string };
const DEFAULT_LINES = (hi: boolean): Line[] => [
  { name: hi ? 'बुकिंग राशि' : 'Booking amount', pct: '10', dueInDays: '0' },
  { name: hi ? '30 दिन में (एग्रीमेंट)' : 'Within 30 days (agreement)', pct: '20', dueInDays: '30' },
  { name: hi ? 'निर्माण / स्ट्रक्चर पड़ाव पर' : 'On development / structure milestone', pct: '40', dueInDays: '150' },
  { name: hi ? 'रजिस्ट्री / कब्ज़े पर' : 'On registry / possession', pct: '30', dueInDays: '300' },
];
const PRESETS = (type: string, hi: boolean): Line[] | null => {
  const n = (en: string, h: string) => (hi ? h : en);
  switch (type) {
    case 'DOWN_PAYMENT': return [{ name: n('On booking', 'बुकिंग पर'), pct: '10', dueInDays: '0' }, { name: n('Balance — down payment', 'बाकी — डाउन पेमेंट'), pct: '90', dueInDays: '30' }];
    case 'TIME_LINKED': return [{ name: n('Booking amount', 'बुकिंग राशि'), pct: '10', dueInDays: '0' }, { name: n('After 30 days', '30 दिन बाद'), pct: '20', dueInDays: '30' }, { name: n('After 90 days', '90 दिन बाद'), pct: '30', dueInDays: '90' }, { name: n('After 180 days', '180 दिन बाद'), pct: '40', dueInDays: '180' }];
    case 'CONSTRUCTION_LINKED': return [{ name: n('Booking amount', 'बुकिंग राशि'), pct: '10', dueInDays: '0' }, { name: n('Agreement', 'एग्रीमेंट'), pct: '20', dueInDays: '30' }, { name: n('On foundation / plinth', 'नींव / प्लिंथ पर'), pct: '20', dueInDays: '120' }, { name: n('On slab / structure', 'स्लैब / स्ट्रक्चर पर'), pct: '20', dueInDays: '240' }, { name: n('On possession', 'कब्ज़े पर'), pct: '30', dueInDays: '540' }];
    case 'LOAN_LINKED': return [{ name: n('Booking amount', 'बुकिंग राशि'), pct: '10', dueInDays: '0' }, { name: n('Own contribution', 'अपना हिस्सा'), pct: '10', dueInDays: '30' }, { name: n('Bank disbursement', 'बैंक डिसबर्समेंट'), pct: '80', dueInDays: '60' }];
    default: return null;
  }
};

export const BookingRequestSheet: React.FC<{ lead: CrmLead; role: string; onClose: () => void; onDone: () => void }> = ({ lead, role, onClose, onDone }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi'; const { busy, err, go, setErr } = useBusy();
  const direct = !lead.associateId;
  const [f, setF] = useState({ unitNo: '', unitConfig: lead.unitInterest || '', agreement: '', token: '', tokenMode: '', tokenRef: '', tokenPaidOn: today(), planType: 'STANDARD', funding: lead.profile?.funding || '', bank: '', loan: '', conditions: '', discount: '', registryBy: '', coApplicant: '', note: '' });
  const [lines, setLines] = useState<Line[] | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });
  const agreement = num(f.agreement) || 0; const token = num(f.token) || 0;
  const total = lines ? lines.reduce((a, l) => a + (Number(l.pct) || 0), 0) : 100;
  const pickPlan = (id: string) => { setF({ ...f, planType: id }); setLines(PRESETS(id, hi)); };
  const upd = (i: number, k: keyof Line, v: string) => setLines(lines!.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const loanOn = !!f.funding && f.funding !== 'SELF';
  const problem = (): string => {
    if (!f.unitNo.trim()) return tx('Enter the unit / plot number', 'यूनिट / प्लॉट नंबर लिखें');
    if (!agreement) return tx('Enter the agreement value', 'एग्रीमेंट वैल्यू लिखें');
    if (token > agreement) return tx('The booking amount cannot be more than the agreement value', 'बुकिंग राशि एग्रीमेंट वैल्यू से ज़्यादा नहीं हो सकती');
    if (token > 0 && !f.tokenMode) return tx('How did the customer pay the booking amount?', 'ग्राहक ने बुकिंग राशि कैसे दी?');
    if (token > 0 && f.tokenMode && f.tokenMode !== 'CASH' && f.tokenRef.trim().length < 3) return tx('Enter the cheque no. / UTR of the booking amount', 'बुकिंग राशि का चेक नं. / UTR लिखें');
    if (loanOn && num(f.loan) && num(f.loan)! > agreement) return tx('The loan cannot be more than the agreement value', 'लोन एग्रीमेंट वैल्यू से ज़्यादा नहीं हो सकता');
    if (lines) { const e = scheduleError(lines.map(l => ({ pct: Number(l.pct) }))); if (e) return tx(`The instalments must total 100% (now ${Math.round(total * 100) / 100}%)`, `किस्तें कुल 100% होनी चाहिए (अभी ${Math.round(total * 100) / 100}%)`); if (lines.some(l => l.name.trim().length < 2 || !(Number(l.pct) > 0))) return tx('Give every instalment a name and a percentage', 'हर किस्त का नाम और प्रतिशत लिखें'); }
    if (f.planType === 'CUSTOM' && !lines && f.conditions.trim().length < 5) return tx('Describe the custom plan — add instalments or write the condition', 'कस्टम प्लान बताएँ — किस्तें जोड़ें या शर्त लिखें');
    return '';
  };
  const submit = () => {
    const pr = problem(); if (pr) { setErr(pr); return; }
    const plan: Record<string, unknown> = { planType: f.planType };
    if (f.funding) plan.funding = f.funding;
    if (loanOn && f.bank.trim()) plan.bank = f.bank.trim();
    if (loanOn && num(f.loan)) plan.loanAmount = num(f.loan);
    if (f.conditions.trim()) plan.conditions = f.conditions.trim();
    if (lines) plan.schedule = lines.map(l => ({ name: l.name.trim(), pct: Number(l.pct), dueInDays: Math.max(0, Math.round(Number(l.dueInDays) || 0)) }));
    if (num(f.discount)) plan.discountAsked = num(f.discount);
    if (f.registryBy) plan.expectedRegistryBy = f.registryBy;
    const payload: Record<string, unknown> = { unitNo: f.unitNo.trim(), agreementValue: agreement, tokenAmount: token, plan };
    if (f.unitConfig.trim()) payload.unitConfig = f.unitConfig.trim();
    if (token > 0) { payload.tokenMode = f.tokenMode; if (f.tokenRef.trim()) payload.tokenRef = f.tokenRef.trim(); if (f.tokenPaidOn) payload.tokenPaidOn = f.tokenPaidOn; }
    if (f.coApplicant.trim()) payload.coApplicantName = f.coApplicant.trim();
    if (f.note.trim()) payload.note = f.note.trim();
    go(() => api.crmRequestBooking(lead.id, payload), () => { onDone(); onClose(); });
  };
  const sect = 'rounded-lg border border-slate-200 p-3 space-y-2';
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl" onClick={e => e.stopPropagation()} role="dialog" aria-label={tx('Booking request', 'बुकिंग अनुरोध')}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div><h3 className="text-sm font-bold text-slate-900">{tx('Booking request', 'बुकिंग अनुरोध')} — {lead.name}</h3><p className="text-[11px] text-slate-500">{lead.projectName}</p></div>
          <button type="button" onClick={onClose} aria-label={tx('Close', 'बंद करें')}><X className="h-5 w-5 text-slate-500" /></button>
        </div>
        {direct && <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-[11px] text-sky-900">{tx('This is a sale by the builder’s own desk — no associate, so no brokerage is created.', 'यह बिल्डर की अपनी डेस्क की बिक्री है — कोई एसोसिएट नहीं, इसलिए ब्रोकरेज नहीं बनेगा।')}</p>}
        {role === 'TEAM_MEMBER' && <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-700">{tx('You are raising this for your employer. The builder will see your name on the request.', 'आप यह अनुरोध अपने नियोक्ता के लिए भेज रहे हैं। बिल्डर को अनुरोध पर आपका नाम दिखेगा।')}</p>}
        <div className="space-y-3">
          <div className={sect}>
            <div className="text-xs font-bold text-slate-800">{tx('Unit & price', 'यूनिट और कीमत')}</div>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className={lab}>{tx('Unit / plot no.', 'यूनिट / प्लॉट नं.')}<input value={f.unitNo} maxLength={40} onChange={set('unitNo')} className={`${inp} mt-0.5 !py-1.5`} /></label>
              <label className={lab}>{tx('Type', 'प्रकार')}<input value={f.unitConfig} maxLength={160} onChange={set('unitConfig')} placeholder="3 BHK" className={`${inp} mt-0.5 !py-1.5`} /></label>
              <label className={lab}>{tx('Agreement value ₹', 'एग्रीमेंट वैल्यू ₹')}<input inputMode="numeric" value={f.agreement} onChange={set('agreement')} className={`${inp} mt-0.5 !py-1.5`} />{agreement ? <span className="text-[10px] font-normal text-slate-500">{inr(agreement)}</span> : null}</label>
            </div>
            <label className={lab}>{tx('Co-applicant (optional)', 'सह-आवेदक (वैकल्पिक)')}<input value={f.coApplicant} maxLength={100} onChange={set('coApplicant')} className={`${inp} mt-0.5 !py-1.5`} /></label>
          </div>

          <div className={sect}>
            <div className="text-xs font-bold text-slate-800">{tx('Booking amount (token)', 'बुकिंग राशि (टोकन)')}</div>
            <p className="text-[10px] text-slate-500">{tx('Enter what the customer says they have already paid. GENZ does not touch the money — the builder checks it and confirms it arrived. Leave 0 if nothing is paid yet.', 'ग्राहक ने जो राशि पहले दे दी है वह लिखें। GENZ पैसे को हाथ नहीं लगाता — बिल्डर जाँचकर कन्फ़र्म करेगा कि मिल गई। अभी कुछ नहीं दिया तो 0 रखें।')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={lab}>{tx('Amount paid ₹', 'दी गई राशि ₹')}<input inputMode="numeric" value={f.token} onChange={set('token')} className={`${inp} mt-0.5 !py-1.5`} />{token ? <span className="text-[10px] font-normal text-slate-500">{inr(token)}{agreement ? ` · ${(Math.round((token / agreement) * 1000) / 10)}%` : ''}</span> : null}</label>
              {token > 0 && <Sel label={tx('Paid by', 'कैसे दिया')} value={f.tokenMode} list={TOKEN_MODES} hi={hi} onChange={v => setF({ ...f, tokenMode: v })} />}
              {token > 0 && f.tokenMode !== 'CASH' && <label className={lab}>{tx('Cheque no. / UTR / reference', 'चेक नं. / UTR / रेफ़रेंस')}<input value={f.tokenRef} maxLength={60} onChange={set('tokenRef')} className={`${inp} mt-0.5 !py-1.5`} /></label>}
              {token > 0 && <label className={lab}>{tx('Paid on', 'किस तारीख़ को')}<input type="date" max={today()} value={f.tokenPaidOn} onChange={set('tokenPaidOn')} className={`${inp} mt-0.5 !py-1.5`} /></label>}
            </div>
          </div>

          <div className={sect}>
            <div className="text-xs font-bold text-slate-800">{tx('Payment condition', 'पेमेंट की शर्तें')}</div>
            <div className="flex flex-wrap gap-1.5">{PLAN_TYPES.map(p => <button key={p.id} type="button" onClick={() => pickPlan(p.id)} aria-pressed={f.planType === p.id} className={`min-h-9 rounded-full border px-3 text-[11px] font-semibold ${f.planType === p.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{hi ? p.hi : p.en}</button>)}</div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Sel label={tx('Funding', 'पैसे का इंतज़ाम')} value={f.funding} list={FUNDINGS} hi={hi} onChange={v => setF({ ...f, funding: v })} />
              {loanOn && <label className={lab}>{tx('Bank', 'बैंक')}<input value={f.bank} maxLength={60} onChange={set('bank')} className={`${inp} mt-0.5 !py-1.5`} /></label>}
              {loanOn && <label className={lab}>{tx('Loan amount ₹', 'लोन राशि ₹')}<input inputMode="numeric" value={f.loan} onChange={set('loan')} className={`${inp} mt-0.5 !py-1.5`} /></label>}
            </div>
            {lines === null ? (
              <div className="rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-700">
                {tx('The builder’s standard schedule will be used: 10% on booking · 20% in 30 days · 40% on structure milestone · 30% on registry / possession.', 'बिल्डर का स्टैंडर्ड शेड्यूल लगेगा: 10% बुकिंग पर · 20% 30 दिन में · 40% स्ट्रक्चर पड़ाव पर · 30% रजिस्ट्री / कब्ज़े पर।')}
                <button type="button" onClick={() => setLines(DEFAULT_LINES(hi))} className="ml-1 font-semibold text-slate-900 underline">{tx('Change instalments', 'किस्तें बदलें')}</button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_4rem_4rem_1.75rem] items-end gap-1.5">
                    <label className={lab}>{i === 0 ? tx('Instalment', 'किस्त') : <span className="sr-only">{tx('Instalment', 'किस्त')}</span>}<input value={l.name} maxLength={80} onChange={e => upd(i, 'name', e.target.value)} className={`${inp} mt-0.5 !px-2 !py-1.5 text-xs`} /></label>
                    <label className={lab}>{i === 0 ? '%' : <span className="sr-only">%</span>}<input inputMode="decimal" value={l.pct} onChange={e => upd(i, 'pct', e.target.value.replace(/[^\d.]/g, ''))} className={`${inp} mt-0.5 !px-2 !py-1.5 text-xs`} /></label>
                    <label className={lab}>{i === 0 ? tx('Days', 'दिन') : <span className="sr-only">{tx('Days', 'दिन')}</span>}<input inputMode="numeric" value={l.dueInDays} onChange={e => upd(i, 'dueInDays', e.target.value.replace(/\D/g, ''))} className={`${inp} mt-0.5 !px-2 !py-1.5 text-xs`} /></label>
                    <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length <= 1} aria-label={tx('Remove instalment', 'किस्त हटाएँ')} className="mb-1 text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className={Math.abs(total - 100) > 0.01 ? 'font-bold text-red-700' : 'font-semibold text-emerald-700'}>{tx('Total', 'कुल')} {Math.round(total * 100) / 100}%{agreement && Math.abs(total - 100) <= 0.01 ? ` = ${inr(agreement)}` : ''}</span>
                  <span className="flex gap-2">
                    {lines.length < MAX_SCHEDULE_LINES && <button type="button" onClick={() => setLines([...lines, { name: '', pct: '', dueInDays: '0' }])} className={btnLine}><Plus className="h-3 w-3" /> {tx('Add line', 'किस्त जोड़ें')}</button>}
                    <button type="button" onClick={() => setLines(null)} className={btnLine}>{tx('Use builder’s standard', 'बिल्डर का स्टैंडर्ड लगाएँ')}</button>
                  </span>
                </div>
                {agreement > 0 && Math.abs(total - 100) <= 0.01 && <p className="text-[10px] text-slate-500">{lines.map(l => `${l.name || '—'}: ${inr((agreement * (Number(l.pct) || 0)) / 100)}`).join(' · ')}</p>}
              </div>
            )}
            <label className={lab}>{tx('Special conditions (free parking, possession date, rebate…)', 'विशेष शर्तें (फ़्री पार्किंग, कब्ज़े की तारीख़, छूट…)')}<textarea rows={2} maxLength={500} value={f.conditions} onChange={set('conditions')} className={`${inp} mt-0.5`} /></label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={lab}>{tx('Discount the customer asks ₹', 'ग्राहक कितनी छूट माँग रहा है ₹')}<input inputMode="numeric" value={f.discount} onChange={set('discount')} className={`${inp} mt-0.5 !py-1.5`} /></label>
              <label className={lab}>{tx('Wants registry by', 'रजिस्ट्री कब तक चाहिए')}<input type="date" min={today()} value={f.registryBy} onChange={set('registryBy')} className={`${inp} mt-0.5 !py-1.5`} /></label>
            </div>
          </div>

          <label className={lab}>{tx('Note for the builder (optional)', 'बिल्डर के लिए नोट (वैकल्पिक)')}<textarea rows={2} maxLength={1000} value={f.note} onChange={set('note')} className={`${inp} mt-0.5`} /></label>
          <Err msg={err} />
          <button disabled={busy} onClick={submit} className={`${btnDark} w-full !bg-orange-600`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{tx('Send to builder', 'बिल्डर को भेजें')}</button>
        </div>
      </div>
    </div>
  );
};

// ═════════════════════════ booking details + the builder's confirmation ═════════════════════════
const TOKEN_STATUS: Record<string, [string, string, string]> = {
  CLAIMED: ['Claimed — waiting for the builder to confirm', 'दावा किया — बिल्डर के कन्फ़र्म करने का इंतज़ार', 'bg-amber-100 text-amber-900'],
  RECEIVED: ['Received — confirmed by the builder', 'मिल गई — बिल्डर ने कन्फ़र्म किया', 'bg-emerald-100 text-emerald-800'],
  NOT_RECEIVED: ['Builder says NOT received', 'बिल्डर कहता है नहीं मिली', 'bg-red-100 text-red-800'],
};

export const BookingDetail: React.FC<{ b: CrmBooking; canDecide: boolean; act: (fn: () => Promise<any>, ok: string) => void }> = ({ b, canDecide, act }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const [notRecv, setNotRecv] = useState(false); const [why, setWhy] = useState('');
  const plan = b.plan; const t = b.token; const fm = (b as any).forMember;
  const onTheWay = (b.trails || []).some(x => x.target === 'TOKEN' && isOpenTrail(x)); // v16.9 — the amount is travelling through the Money tab
  if (!plan && !t && !b.requestedBy && !b.coApplicantName && !b.direct) return null;
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-[11px] text-slate-700">
      <div className="flex flex-wrap items-center gap-1.5">
        {b.requestedBy && <span>{tx('Requested by', 'अनुरोध किसने किया')} <b>{b.requestedBy.name}</b>{b.requestedBy.onBehalfOf ? ` ${tx('for', 'की ओर से')} ${b.requestedBy.onBehalfOf}` : ''}</span>}
        {b.direct && <span className="rounded bg-sky-100 px-1.5 py-0.5 font-bold text-sky-800">{tx('Builder-desk sale — no brokerage', 'बिल्डर डेस्क की बिक्री — ब्रोकरेज नहीं')}</span>}
        {b.coApplicantName && <span>· {tx('Co-applicant', 'सह-आवेदक')}: <b>{b.coApplicantName}</b></span>}
      </div>
      {t && (
        <div className="rounded-lg bg-white p-2.5 ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-slate-900"><IndianRupee className="mr-0.5 inline h-3 w-3" />{tx('Booking amount', 'बुकिंग राशि')}: {inr(t.amount)}</span>
            <span className={`rounded px-2 py-0.5 font-bold ${TOKEN_STATUS[t.status]?.[2]}`}>{hi ? TOKEN_STATUS[t.status]?.[1] : TOKEN_STATUS[t.status]?.[0]}</span>
          </div>
          <div className="mt-0.5 text-slate-600">{optLabel(TOKEN_MODES, t.mode, hi)}{t.ref ? ` · ${t.ref}` : ''}{t.paidOn ? ` · ${new Date(t.paidOn).toLocaleDateString('en-IN')}` : ''} · {tx('claimed by', 'दावा')} {t.claimedByName}</div>
          {t.confirmedByName && <div className="text-slate-500">{tx('Confirmed by', 'कन्फ़र्म किया')} {t.confirmedByName} · {when(t.confirmedAt)}{t.note ? ` — ${t.note}` : ''}</div>}
          {!fm && t.status === 'CLAIMED' && !canDecide && <p className="mt-1 text-amber-800">{tx('Brokerage becomes payable only after the builder confirms this amount and collects the instalments.', 'ब्रोकरेज तभी देय होता है जब बिल्डर यह राशि कन्फ़र्म करे और किस्तें वसूले।')}</p>}
          {canDecide && t.status !== 'RECEIVED' && onTheWay && <p className="mt-2 rounded-md bg-violet-50 px-2.5 py-1.5 text-violet-900">{tx('This amount is travelling through the Money tab — confirm it there once it reaches you.', 'यह राशि “पैसा” टैब में रास्ते में है — आपके पास पहुँचने पर वहीं कन्फ़र्म करें।')}</p>}
          {canDecide && t.status !== 'RECEIVED' && !onTheWay && (
            <div className="mt-2 space-y-1.5">
              {b.status === 'APPROVED' && t.status === 'CLAIMED' && <button onClick={() => act(() => api.crmConfirmToken(b.id, true), tx('Booking amount recorded as received', 'बुकिंग राशि “मिल गई” दर्ज'))} className="min-h-9 rounded-md bg-emerald-600 px-3 text-[11px] font-semibold text-white">{tx('I received it', 'मुझे मिल गई')}</button>}
              {b.status === 'REQUESTED' && <p className="text-slate-500">{tx('Tick “received” when you approve the booking.', 'बुकिंग मंज़ूर करते समय “मिल गई” टिक करें।')}</p>}
              {t.status === 'CLAIMED' && (!notRecv ? <button onClick={() => setNotRecv(true)} className="ml-0 min-h-9 rounded-md border border-red-300 px-3 text-[11px] font-semibold text-red-700">{tx('Not received', 'नहीं मिली')}</button> : (
                <div className="flex gap-1.5"><input value={why} onChange={e => setWhy(e.target.value)} maxLength={200} placeholder={tx('Why? (cheque bounced, not in bank…)', 'क्यों? (चेक बाउंस, बैंक में नहीं आई…)')} className={`${inp} !py-1.5`} /><button disabled={why.trim().length < 3} onClick={() => act(() => api.crmConfirmToken(b.id, false, why.trim()), tx('Marked as not received', '“नहीं मिली” दर्ज'))} className={btnDark}>{tx('Save', 'सेव')}</button></div>
              ))}
            </div>
          )}
        </div>
      )}
      {plan && (
        <div>
          <div className="font-bold text-slate-900">{tx('Payment condition', 'पेमेंट की शर्तें')}: {optLabel(PLAN_TYPES, plan.planType, hi)}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-slate-600">
            {plan.funding && <span>{optLabel(FUNDINGS, plan.funding, hi)}{plan.bank ? ` — ${plan.bank}` : ''}{plan.loanAmount ? ` ${inr(plan.loanAmount)}` : ''}</span>}
            {!!plan.discountAsked && <span>{tx('Discount asked', 'छूट की माँग')}: {inr(plan.discountAsked)}</span>}
            {plan.expectedRegistryBy && <span>{tx('Registry by', 'रजिस्ट्री')}: {new Date(plan.expectedRegistryBy).toLocaleDateString('en-IN')}</span>}
          </div>
          {plan.conditions && <p className="mt-0.5 text-slate-600">“{plan.conditions}”</p>}
          {!!plan.schedule?.length && <p className="mt-0.5 text-slate-500">{plan.schedule.map(s => `${s.name} ${s.pct}% (${s.dueInDays}${tx('d', ' दिन')})`).join(' · ')}</p>}
        </div>
      )}
    </div>
  );
};

/** The builder's decision on a booking request: shows what was claimed and lets the builder confirm the booking amount in the same step. */
export const ApproveSheet: React.FC<{ b: CrmBooking; onClose: () => void; onDone: () => void }> = ({ b, onClose, onDone }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi'; const { busy, err, go } = useBusy();
  const t = b.token; const [recv, setRecv] = useState(false); const [note, setNote] = useState('');
  const onTheWay = (b.trails || []).some(x => x.target === 'TOKEN' && isOpenTrail(x));
  return (
    <Sheet title={tx('Approve booking', 'बुकिंग मंज़ूर करें')} onClose={onClose}>
      <div className="space-y-3 text-xs text-slate-700">
        <p><b>{b.customerName}</b> · {b.projectName} · {tx('Unit', 'यूनिट')} {b.unitNo} · {inr(b.agreementValue)}</p>
        {b.direct ? <p className="rounded-lg bg-sky-50 px-3 py-2 text-sky-900">{tx('Builder-desk sale: no brokerage will be created.', 'बिल्डर-डेस्क की बिक्री: ब्रोकरेज नहीं बनेगा।')}</p> : <p className="text-slate-500">{tx('Brokerage will be calculated from the mandate and becomes payable as you collect the instalments.', 'ब्रोकरेज मैंडेट से गिना जाएगा और आपकी वसूली के अनुपात में देय होगा।')}</p>}
        {t && t.status !== 'RECEIVED' && onTheWay && <p className="rounded-lg bg-violet-50 px-3 py-2 text-violet-900">{tx(`The booking amount ${inr(t.amount)} is travelling through the Money tab — approve now and confirm it there once it reaches you.`, `बुकिंग राशि ${inr(t.amount)} “पैसा” टैब में रास्ते में है — अभी मंज़ूर करें और पहुँचने पर वहीं कन्फ़र्म करें।`)}</p>}
        {t && t.status !== 'RECEIVED' && !onTheWay && (
          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <input type="checkbox" checked={recv} onChange={e => setRecv(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
            <span><b>{tx(`Booking amount ${inr(t.amount)} has reached me`, `बुकिंग राशि ${inr(t.amount)} मुझे मिल गई`)}</b><span className="block text-[11px] text-slate-600">{optLabel(TOKEN_MODES, t.mode, hi)}{t.ref ? ` · ${t.ref}` : ''} — {tx('tick only if you have checked it in your bank / cheque book', 'तभी टिक करें जब आपने बैंक / चेक बुक में जाँच ली हो')}</span></span>
          </label>
        )}
        <input value={note} maxLength={200} onChange={e => setNote(e.target.value)} placeholder={tx('Note (optional)', 'नोट (वैकल्पिक)')} className={inp} />
        <Err msg={err} />
        <button disabled={busy} onClick={() => go(() => api.crmDecideBooking(b.id, 'APPROVE', note.trim() || undefined, t && t.status !== 'RECEIVED' && !onTheWay && recv ? { tokenReceived: true } : {}), () => { onDone(); onClose(); })} className={`${btnDark} w-full !bg-emerald-600`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {tx('Approve', 'मंज़ूर करें')}</button>
      </div>
    </Sheet>
  );
};

