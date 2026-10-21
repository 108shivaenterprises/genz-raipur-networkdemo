import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, IndianRupee, TrendingUp, Megaphone, Activity, Download, Plus, Link2, Copy, Ban, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Share2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';
import { StrengthBody } from './StrengthBody.js';

/**
 * v20 — Revenue & Growth (superadmin): GENZ's master-CP commission book, growth & value numbers for investors,
 * the builder pitch (network-strength links) and system health. Money moves outside the app; this records it.
 */
type Sub = 'book' | 'value' | 'pilot' | 'pitch' | 'health';
const box = 'rounded-xl border border-slate-200 bg-white p-3';
const inp = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm';
const dark = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-40';
const ghost = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 disabled:opacity-40';
const d0 = (s?: string) => (s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—');
const pc = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${n}%`);

const Tile: React.FC<{ label: string; value: React.ReactNode; hint?: string; tone?: 'ok' | 'warn' | 'bad'; active?: boolean; onClick?: () => void }> = ({ label, value, hint, tone, active, onClick }) => (
  <button type="button" onClick={onClick} disabled={!onClick} aria-pressed={onClick ? !!active : undefined}
    className={`min-h-16 rounded-xl border p-2.5 text-left ${active ? 'border-slate-900 bg-slate-900 text-white' : tone === 'bad' ? 'border-rose-300 bg-white' : tone === 'warn' ? 'border-amber-300 bg-white' : 'border-slate-200 bg-white'} ${onClick ? '' : 'cursor-default'}`}>
    <div className="text-lg font-bold leading-tight">{value}</div>
    <div className="mt-0.5 text-[11px] font-semibold">{label}</div>
    {hint && <div className={`text-[10px] ${active ? 'text-slate-300' : 'text-slate-500'}`}>{hint}</div>}
  </button>
);

export const RevenueGrowthView: React.FC = () => {
  const tx = useTx();
  const [sub, setSub] = useState<Sub>('book');
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const say = (ok: boolean, msg: string) => { setToast({ ok, msg }); window.setTimeout(() => setToast(null), 6000); };
  const tabs: [Sub, string, string, React.ElementType][] = [
    ['book', 'Master-CP book', 'मास्टर-CP बही', IndianRupee],
    ['value', 'Growth & value', 'ग्रोथ और वैल्यू', TrendingUp],
    ['pilot', 'Pilot check', 'पायलट जाँच', CheckCircle2],
    ['pitch', 'Builder pitch', 'बिल्डर पिच', Megaphone],
    ['health', 'System health', 'सिस्टम हेल्थ', Activity],
  ];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{tx('Revenue & Growth', 'कमाई और ग्रोथ')}</h2>
        <p className="text-xs text-slate-500">{tx('GENZ’s commission book for master-CP agreements with builders, the numbers an investor asks for, a network-strength page to show builders, and system health. Money moves bank-to-bank outside the app — this records it.', 'बिल्डर्स के साथ मास्टर-CP समझौतों की GENZ कमीशन बही, निवेशक जो आँकड़े पूछते हैं, बिल्डर को दिखाने के लिए नेटवर्क-ताक़त पेज, और सिस्टम हेल्थ। पैसा ऐप के बाहर बैंक से बैंक जाता है — यहाँ सिर्फ़ हिसाब दर्ज होता है।')}</p>
      </div>
      {toast && <div role="status" className={`sticky top-2 z-30 rounded-lg px-3 py-2 text-xs font-medium shadow ${toast.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{toast.msg}</div>}
      <div className="flex gap-2 overflow-x-auto" role="tablist">
        {tabs.map(([id, en, hi, Icon]) => <button key={id} role="tab" aria-selected={sub === id} onClick={() => setSub(id)} className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${sub === id ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}><Icon className="h-4 w-4" />{tx(en, hi)}</button>)}
      </div>
      {sub === 'book' && <BookTab say={say} />}
      {sub === 'value' && <ValueTab />}
      {sub === 'pilot' && <PilotTab />}
      {sub === 'pitch' && <PitchTab say={say} />}
      {sub === 'health' && <HealthTab />}
    </div>
  );
};

// ───────────────────────────── v26 pilot check ─────────────────────────────
const PilotTab: React.FC = () => {
  const tx = useTx();
  const [days, setDays] = useState(60); const [city, setCity] = useState('');
  const [p, setP] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { const t = window.setTimeout(() => api.revPilot(days, city).then(r => setP(r.pilot)).catch(e => setErr(e.message)), 250); return () => window.clearTimeout(t); }, [days, city]);
  if (err) return <p className="text-xs text-red-700">{err}</p>;
  if (!p) return <Loader2 className="h-5 w-5 animate-spin text-slate-400" />;
  const tile = (label: string, value: string, good: boolean | null, sub: string) => (
    <div className={`rounded-xl border p-3 ${good === null ? 'border-slate-200 bg-white' : good ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
      <p className="text-[11px] font-semibold text-slate-600">{label}</p><p className="text-2xl font-bold text-slate-900">{value}</p><p className="text-[11px] text-slate-500">{sub}</p>
    </div>
  );
  return (
    <div className="space-y-3" data-testid="pilot-tab">
      <p className="text-xs text-slate-600">{tx('Open a city to everyone only when these two numbers are healthy in the pilot.', 'शहर सबके लिए तभी खोलें जब पायलट में ये दोनों आँकड़े ठीक हों।')}</p>
      <div className="flex flex-wrap gap-2 text-xs">
        <label>{tx('Joined in the last', 'पिछले')} <select value={days} onChange={e => setDays(Number(e.target.value))} className="rounded border border-slate-300 px-2 py-1">{[30, 60, 90, 180].map(d => <option key={d} value={d}>{d}</option>)}</select> {tx('days', 'दिन में जुड़े')}</label>
        <input value={city} onChange={e => setCity(e.target.value)} placeholder={tx('City (all)', 'शहर (सभी)')} className="rounded border border-slate-300 px-2 py-1" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {tile(tx('Brokers joined', 'जुड़े ब्रोकर'), String(p.joined), null, city || tx('all cities', 'सभी शहर'))}
        {tile(tx('Activated in 7 days', '7 दिन में काम शुरू'), p.activation.pct === null ? '—' : `${p.activation.pct}%`, p.activation.pct === null ? null : p.activation.pct >= p.target.activationPct, tx(`listing ${p.activation.listing} · client ${p.activation.client} · owner consent ${p.activation.consent} · target ${p.target.activationPct}%`, `लिस्टिंग ${p.activation.listing} · क्लाइंट ${p.activation.client} · मालिक-सहमति ${p.activation.consent} · लक्ष्य ${p.target.activationPct}%`))}
        {tile(tx('Came back on day 7–13', 'दिन 7–13 पर वापस आए'), p.d7.pct === null ? '—' : `${p.d7.pct}%`, p.d7.pct === null ? null : p.d7.pct >= p.target.d7Pct, tx(`${p.d7.returned} of ${p.d7.base} who joined 14+ days ago · target ${p.target.d7Pct}%`, `14+ दिन पहले जुड़े ${p.d7.base} में से ${p.d7.returned} · लक्ष्य ${p.target.d7Pct}%`))}
      </div>
    </div>
  );
};

// ───────────────────────────── Master-CP book ─────────────────────────────
const VIEWS: [string, string, string][] = [
  ['all', 'All lines', 'सभी लाइनें'], ['expected', 'To invoice', 'बिल बनाना है'], ['invoiced', 'Invoiced', 'बिल भेजा'], ['overdue', 'Overdue', 'देर हो गई'],
  ['received', 'Builder paid', 'बिल्डर ने दिया'], ['payable', 'Pay brokers', 'ब्रोकर को देना'], ['paid', 'Brokers paid', 'ब्रोकर को दिया'], ['risk', 'Double-pay risk', 'दो बार भुगतान का ख़तरा'], ['hold', 'On hold', 'रोका गया'], ['done', 'Settled', 'पूरा'], ['cancelled', 'Cancelled', 'रद्द'],
];

const BookTab: React.FC<{ say: (ok: boolean, m: string) => void }> = ({ say }) => {
  const tx = useTx();
  const [s, setS] = useState<any>(null);
  const [entries, setEntries] = useState<any>(null);
  const [view, setView] = useState('all');
  const [agreementId, setAgreementId] = useState('');
  const [q, setQ] = useState('');
  const [newAg, setNewAg] = useState(false);
  const [newLine, setNewLine] = useState(false);
  const [open, setOpen] = useState('');
  const load = async () => {
    try {
      const [a, b] = await Promise.all([api.revSummary(), api.revEntries({ agreementId, view, q: q.trim() })]);
      setS(a); setEntries(b);
    } catch (e: any) { say(false, e.message); }
  };
  useEffect(() => { const t = window.setTimeout(load, q ? 300 : 0); return () => window.clearTimeout(t); }, [view, agreementId, q]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  const t = s.totals;
  const go = (v: string) => { setView(v); setOpen(''); };
  return (
    <div className="space-y-4">
      <section aria-label={tx('Money tiles', 'पैसे के टाइल')} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label={tx('To invoice', 'बिल बनाना है')} value={formatINR(t.expected)} hint={tx('builder owes, no bill yet', 'बिल्डर देगा, बिल नहीं गया')} active={view === 'expected'} onClick={() => go('expected')} />
        <Tile label={tx('Invoiced', 'बिल भेजा')} value={formatINR(t.invoiced)} hint={tx('waiting for payment', 'भुगतान का इंतज़ार')} active={view === 'invoiced'} onClick={() => go('invoiced')} />
        <Tile label={tx('Overdue', 'देर हो गई')} value={formatINR(t.overdue)} hint={`${t.overdueCount} ${tx('unit(s) past payment days', 'यूनिट समय से बाहर')}`} tone={t.overdueCount ? 'bad' : 'ok'} active={view === 'overdue'} onClick={() => go('overdue')} />
        <Tile label={tx('Received', 'मिल गया')} value={formatINR(t.received)} hint={tx('from builders', 'बिल्डर्स से')} active={view === 'received'} onClick={() => go('received')} />
        <Tile label={tx('Pay brokers now', 'ब्रोकर को अभी देना')} value={formatINR(t.payableNow)} hint={tx('builder has paid', 'बिल्डर ने दे दिया')} tone={t.payableNow ? 'warn' : 'ok'} active={view === 'payable'} onClick={() => go('payable')} />
        <Tile label={tx('Paid to brokers', 'ब्रोकर को दिया')} value={formatINR(t.paidToBrokers)} active={view === 'paid'} onClick={() => go('paid')} />
        <Tile label={tx('GENZ net (booked)', 'GENZ शुद्ध (बुक)')} value={formatINR(t.net)} hint={`${t.entries} ${tx('unit(s)', 'यूनिट')} · ${formatINR(t.agreementValue)} ${tx('sold', 'बिका')}`} onClick={() => go('all')} active={view === 'all'} />
        <Tile label={tx('Cash kept', 'हाथ में बचा')} value={formatINR(t.cashKept)} hint={tx('received − paid to brokers', 'मिला − ब्रोकर को दिया')} />
      </section>
      {t.doublePayRisk > 0 && (
        <button type="button" onClick={() => go('risk')} className="flex w-full items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-left text-xs text-rose-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{tx(`${t.doublePayRisk} line(s): the builder ALSO recorded a brokerage to the same partner in the CRM. Make sure the partner is paid only once — open them.`, `${t.doublePayRisk} लाइन: बिल्डर ने CRM में उसी पार्टनर का ब्रोकरेज भी दर्ज किया है। पार्टनर को एक ही बार भुगतान हो — इन्हें खोलें।`)}
        </button>
      )}

      <section className={box + ' space-y-2'} aria-label={tx('Agreements', 'समझौते')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">{tx('Master-CP agreements', 'मास्टर-CP समझौते')} ({s.agreements.length})</h3>
          <button className={dark} onClick={() => setNewAg(v => !v)}><Plus className="h-4 w-4" />{tx('New agreement', 'नया समझौता')}</button>
        </div>
        {newAg && <AgreementForm onDone={(m) => { setNewAg(false); say(true, m); load(); }} onErr={(m) => say(false, m)} />}
        {s.agreements.length === 0 && !newAg && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">{tx('No agreement yet. When a builder signs a master channel-partner agreement (or an LOI) with GENZ, add it here — every approved partner booking of those projects then lands in this book by itself.', 'अभी कोई समझौता नहीं। जब कोई बिल्डर GENZ के साथ मास्टर चैनल-पार्टनर समझौता (या LOI) करे, यहाँ जोड़ें — उन प्रोजेक्ट की हर मंज़ूर पार्टनर बुकिंग अपने-आप इस बही में आ जाएगी।')}</p>}
        {s.agreements.map((a: any) => <AgreementRow key={a.id} a={a} active={agreementId === a.id} onPick={() => setAgreementId(agreementId === a.id ? '' : a.id)} onSaved={(m) => { say(true, m); load(); }} onErr={(m) => say(false, m)} />)}
      </section>

      <section className="space-y-2" aria-label={tx('Book lines', 'बही की लाइनें')}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-bold">{tx('Lines', 'लाइनें')} {agreementId && <span className="text-xs font-normal text-slate-500">· {agreementId}</span>}</h3>
          <a className={ghost} href={api.revExportUrl()}><Download className="h-4 w-4" />{tx('CSV for CA', 'CA के लिए CSV')}</a>
          <button className={ghost} onClick={() => setNewLine(v => !v)} disabled={!s.agreements.some((a: any) => a.status === 'LOI' || a.status === 'SIGNED')}><Plus className="h-4 w-4" />{tx('Add a unit by hand', 'यूनिट हाथ से जोड़ें')}</button>
        </div>
        {newLine && <LineForm agreements={s.agreements.filter((a: any) => a.status === 'LOI' || a.status === 'SIGNED')} onDone={(m) => { setNewLine(false); say(true, m); load(); }} onErr={(m) => say(false, m)} />}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {VIEWS.map(([id, en, hi]) => <button key={id} onClick={() => go(id)} aria-pressed={view === id} className={`min-h-10 shrink-0 rounded-full px-3 text-[11px] font-semibold ${view === id ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>{tx(en, hi)} ({entries?.counts?.[id] ?? 0})</button>)}
        </div>
        <input className={inp} value={q} onChange={e => setQ(e.target.value)} placeholder={tx('Search project, unit, broker, booking or invoice no.', 'प्रोजेक्ट, यूनिट, ब्रोकर, बुकिंग या बिल नंबर खोजें')} aria-label={tx('Search lines', 'लाइनें खोजें')} />
        {!entries ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : entries.entries.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">{tx('Nothing here.', 'यहाँ कुछ नहीं।')}</p> : (
          <ul className="space-y-2">{entries.entries.map((e: any) => <LineRow key={e.id} e={e} open={open === e.id} onToggle={() => setOpen(open === e.id ? '' : e.id)} onDone={(m) => { say(true, m); load(); }} onErr={(m) => say(false, m)} />)}</ul>
        )}
        {entries && entries.total > entries.entries.length && <p className="text-center text-[11px] text-slate-500">{tx(`Showing ${entries.entries.length} of ${entries.total} — search to narrow.`, `${entries.total} में से ${entries.entries.length} — छोटा करने के लिए खोजें।`)}</p>}
      </section>

      <section className={box} aria-label={tx('Last 12 months', 'पिछले 12 महीने')}>
        <h3 className="mb-2 text-sm font-bold">{tx('Last 12 months (by booking month)', 'पिछले 12 महीने (बुकिंग के महीने से)')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="text-[10px] uppercase text-slate-500"><tr><th className="py-1">{tx('Month', 'महीना')}</th><th>{tx('Units', 'यूनिट')}</th><th>{tx('Sold', 'बिका')}</th><th>{tx('GENZ gross', 'GENZ कुल')}</th><th>{tx('GENZ net', 'GENZ शुद्ध')}</th><th>{tx('Received', 'मिला')}</th></tr></thead>
            <tbody>{s.monthly.map((m: any) => <tr key={m.month} className="border-t border-slate-100"><td className="py-1 font-mono">{m.month}</td><td>{m.units}</td><td>{formatINR(m.value)}</td><td>{formatINR(m.gross)}</td><td className="font-semibold">{formatINR(m.net)}</td><td>{formatINR(m.received)}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <p className="text-[11px] text-slate-500">{tx('Rates, TDS and invoices: confirm with your CA. GENZ issues its own invoice to the builder outside the app; record the invoice number and the bank reference here.', 'दरें, TDS और बिल: अपने CA से पक्का करें। GENZ अपना बिल ऐप के बाहर बिल्डर को देता है; यहाँ बिल नंबर और बैंक रेफ़रेंस दर्ज करें।')}</p>
    </div>
  );
};

const statusLabel = (tx: (a: string, b: string) => string, a: any) => ({ DRAFT: tx('Draft', 'ड्राफ़्ट'), LOI: tx('LOI signed', 'LOI साइन'), SIGNED: tx('Signed', 'साइन हुआ'), ENDED: tx('Ended', 'ख़त्म') } as Record<string, string>)[a] || a;

const AgreementForm: React.FC<{ a?: any; onDone: (m: string) => void; onErr: (m: string) => void }> = ({ a, onDone, onErr }) => {
  const tx = useTx();
  const [projects, setProjects] = useState<any[]>([]);
  const [f, setF] = useState(() => ({
    builderName: a?.builderName || '', projectIds: (a?.projectIds || []) as string[], projectNames: String((a?.projectNames || []).join(', ')),
    genzRatePct: String(a?.genzRatePct ?? 3), brokerSharePct: String(a?.brokerSharePct ?? 2), tdsOnGenzPct: String(a?.tdsOnGenzPct ?? 2), tdsOnBrokerPct: String(a?.tdsOnBrokerPct ?? 2),
    paymentDays: String(a?.paymentDays ?? 45), payWhenPaid: a?.payWhenPaid ?? true, status: a?.status || 'DRAFT', validFrom: a?.validFrom?.slice(0, 10) || '', validTo: a?.validTo?.slice(0, 10) || '', note: a?.note || '',
  }));
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.revProjects().then(r => setProjects(r.projects)).catch(() => undefined); }, []);
  const n = (v: string) => Number(String(v).replace(/[^\d.]/g, ''));
  const spread = n(f.genzRatePct) - n(f.brokerSharePct);
  const pick = (id: string) => setF(x => ({ ...x, projectIds: x.projectIds.includes(id) ? x.projectIds.filter(p => p !== id) : [...x.projectIds, id], builderName: x.builderName || projects.find(p => p.id === id)?.builderName || '' }));
  const save = async () => {
    setBusy(true);
    try {
      const body = { builderName: f.builderName.trim(), projectIds: f.projectIds, projectNames: f.projectNames.split(',').map(x => x.trim()).filter(Boolean), genzRatePct: n(f.genzRatePct), brokerSharePct: n(f.brokerSharePct), tdsOnGenzPct: n(f.tdsOnGenzPct), tdsOnBrokerPct: n(f.tdsOnBrokerPct), paymentDays: Math.round(n(f.paymentDays)), payWhenPaid: f.payWhenPaid, status: f.status, validFrom: f.validFrom || null, validTo: f.validTo || null, note: f.note };
      const r = a ? await api.revAgreementUpdate(a.id, body) : await api.revAgreementCreate(body);
      onDone(a ? tx('Agreement saved', 'समझौता सेव हुआ') : tx(`Agreement added${r.synced?.added ? ` — ${r.synced.added} booking(s) pulled in` : ''}`, `समझौता जुड़ा${r.synced?.added ? ` — ${r.synced.added} बुकिंग जुड़ीं` : ''}`));
    } catch (e: any) { onErr(e.message); } finally { setBusy(false); }
  };
  const lab = 'block text-[11px] font-semibold text-slate-700';
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <label className={lab}>{tx('Builder', 'बिल्डर')}<input className={inp + ' mt-1'} value={f.builderName} onChange={e => setF({ ...f, builderName: e.target.value })} placeholder={tx('Builder / company name', 'बिल्डर / कंपनी का नाम')} /></label>
      <div className={lab}>{tx('Projects on GENZ', 'GENZ पर प्रोजेक्ट')}
        <div className="mt-1 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">{projects.map(p => <button type="button" key={p.id} onClick={() => pick(p.id)} aria-pressed={f.projectIds.includes(p.id)} className={`min-h-9 rounded-full px-2.5 text-[11px] ${f.projectIds.includes(p.id) ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white'}`}>{p.name} · {p.city}</button>)}{projects.length === 0 && <span className="text-[11px] font-normal text-slate-500">{tx('No builder projects on GENZ yet', 'GENZ पर अभी कोई बिल्डर प्रोजेक्ट नहीं')}</span>}</div>
      </div>
      <label className={lab}>{tx('Other projects (not on GENZ) — comma separated', 'दूसरे प्रोजेक्ट (GENZ पर नहीं) — कॉमा से अलग')}<input className={inp + ' mt-1'} value={f.projectNames} onChange={e => setF({ ...f, projectNames: e.target.value })} /></label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className={lab}>{tx('Builder pays GENZ %', 'बिल्डर GENZ को %')}<input className={inp + ' mt-1'} inputMode="decimal" value={f.genzRatePct} onChange={e => setF({ ...f, genzRatePct: e.target.value })} /></label>
        <label className={lab}>{tx('Broker share %', 'ब्रोकर का हिस्सा %')}<input className={inp + ' mt-1'} inputMode="decimal" value={f.brokerSharePct} onChange={e => setF({ ...f, brokerSharePct: e.target.value })} /></label>
        <label className={lab}>{tx('TDS by builder %', 'बिल्डर का TDS %')}<input className={inp + ' mt-1'} inputMode="decimal" value={f.tdsOnGenzPct} onChange={e => setF({ ...f, tdsOnGenzPct: e.target.value })} /></label>
        <label className={lab}>{tx('TDS on broker %', 'ब्रोकर पर TDS %')}<input className={inp + ' mt-1'} inputMode="decimal" value={f.tdsOnBrokerPct} onChange={e => setF({ ...f, tdsOnBrokerPct: e.target.value })} /></label>
      </div>
      <p className={`text-[11px] font-semibold ${spread < 0 ? 'text-red-700' : 'text-emerald-800'}`}>{spread < 0 ? tx('The broker share cannot be more than what the builder pays GENZ.', 'ब्रोकर का हिस्सा, बिल्डर से GENZ को मिलने वाले से ज़्यादा नहीं हो सकता।') : tx(`GENZ keeps ${Math.round(spread * 100) / 100}% of each unit's value (₹${Math.round(spread * 50000).toLocaleString('en-IN')} on a ₹50 lakh flat).`, `GENZ हर यूनिट की क़ीमत का ${Math.round(spread * 100) / 100}% रखता है (₹50 लाख के फ़्लैट पर ₹${Math.round(spread * 50000).toLocaleString('en-IN')})।`)}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className={lab}>{tx('Builder pays within (days)', 'बिल्डर इतने दिन में देगा')}<input className={inp + ' mt-1'} inputMode="numeric" value={f.paymentDays} onChange={e => setF({ ...f, paymentDays: e.target.value })} /></label>
        <label className={lab}>{tx('Status', 'स्थिति')}<select className={inp + ' mt-1'} value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>{['DRAFT', 'LOI', 'SIGNED', 'ENDED'].map(x => <option key={x} value={x}>{statusLabel(tx, x)}</option>)}</select></label>
        <label className={lab}>{tx('Valid from', 'कब से')}<input type="date" className={inp + ' mt-1'} value={f.validFrom} onChange={e => setF({ ...f, validFrom: e.target.value })} /></label>
        <label className={lab}>{tx('Valid to', 'कब तक')}<input type="date" className={inp + ' mt-1'} value={f.validTo} onChange={e => setF({ ...f, validTo: e.target.value })} /></label>
      </div>
      <label className="flex min-h-9 items-center gap-2 text-xs"><input type="checkbox" checked={f.payWhenPaid} onChange={e => setF({ ...f, payWhenPaid: e.target.checked })} />{tx('Pay the broker only after the builder has paid GENZ ("pay when paid")', 'ब्रोकर को तभी दें जब बिल्डर GENZ को दे दे ("pay when paid")')}</label>
      <label className={lab}>{tx('Note', 'नोट')}<textarea className={inp + ' mt-1 py-2'} rows={2} maxLength={500} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></label>
      <p className="text-[11px] text-slate-500">{tx('Only LOI / signed agreements collect bookings. Rates apply to new lines; lines already booked keep their rate.', 'सिर्फ़ LOI / साइन हुए समझौते बुकिंग जोड़ते हैं। नई दर नई लाइनों पर लगती है; पुरानी लाइनें अपनी दर रखती हैं।')}</p>
      <button className={dark} disabled={busy || spread < 0 || !f.builderName.trim()} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Save agreement', 'समझौता सेव करें')}</button>
    </div>
  );
};

const AgreementRow: React.FC<{ a: any; active: boolean; onPick: () => void; onSaved: (m: string) => void; onErr: (m: string) => void }> = ({ a, active, onPick, onSaved, onErr }) => {
  const tx = useTx();
  const [edit, setEdit] = useState(false);
  const t = a.totals;
  return (
    <div className={`rounded-lg border p-2.5 ${active ? 'border-slate-900' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button type="button" onClick={onPick} aria-pressed={active} className="min-w-0 flex-1 text-left">
          <div className="text-sm font-bold">{a.builderName} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold">{statusLabel(tx, a.status)}</span></div>
          <div className="text-[11px] text-slate-500">{a.id} · GENZ {a.genzRatePct}% · {tx('broker', 'ब्रोकर')} {a.brokerSharePct}% · {tx('keeps', 'GENZ रखता')} {Math.round((a.genzRatePct - a.brokerSharePct) * 100) / 100}% · {a.projectIds.length + a.projectNames.length} {tx('project(s)', 'प्रोजेक्ट')}</div>
          <div className="text-[11px] text-slate-700">{t.entries} {tx('units', 'यूनिट')} · {tx('net', 'शुद्ध')} {formatINR(t.net)} · {tx('received', 'मिला')} {formatINR(t.received)}{t.overdueCount ? ` · ${t.overdueCount} ${tx('overdue', 'देर')}` : ''}</div>
        </button>
        <button className={ghost} onClick={() => setEdit(v => !v)}>{edit ? tx('Close', 'बंद') : tx('Edit', 'बदलें')}</button>
      </div>
      {edit && <div className="mt-2"><AgreementForm a={a} onDone={(m) => { setEdit(false); onSaved(m); }} onErr={onErr} /></div>}
    </div>
  );
};

const LineForm: React.FC<{ agreements: any[]; onDone: (m: string) => void; onErr: (m: string) => void }> = ({ agreements, onDone, onErr }) => {
  const tx = useTx();
  const [f, setF] = useState({ agreementId: agreements[0]?.id || '', projectName: '', unitNo: '', brokerName: '', bookedAt: new Date().toISOString().slice(0, 10), valueL: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.revEntryCreate({ agreementId: f.agreementId, projectName: f.projectName, unitNo: f.unitNo, brokerName: f.brokerName || undefined, bookedAt: f.bookedAt, agreementValue: Math.round(Number(f.valueL) * 100000) }); onDone(tx('Line added', 'लाइन जुड़ी')); }
    catch (e: any) { onErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
      <select className={inp} value={f.agreementId} onChange={e => setF({ ...f, agreementId: e.target.value })} aria-label={tx('Agreement', 'समझौता')}>{agreements.map(a => <option key={a.id} value={a.id}>{a.builderName} ({a.id})</option>)}</select>
      <input className={inp} value={f.projectName} onChange={e => setF({ ...f, projectName: e.target.value })} placeholder={tx('Project', 'प्रोजेक्ट')} />
      <input className={inp} value={f.unitNo} onChange={e => setF({ ...f, unitNo: e.target.value })} placeholder={tx('Unit no.', 'यूनिट नं.')} />
      <input className={inp} value={f.brokerName} onChange={e => setF({ ...f, brokerName: e.target.value })} placeholder={tx('Sold by (leave empty = GENZ direct)', 'किसने बेचा (खाली = GENZ ख़ुद)')} />
      <input type="date" className={inp} value={f.bookedAt} onChange={e => setF({ ...f, bookedAt: e.target.value })} aria-label={tx('Booking date', 'बुकिंग की तारीख़')} />
      <input className={inp} inputMode="decimal" value={f.valueL} onChange={e => setF({ ...f, valueL: e.target.value })} placeholder={tx('Agreement value ₹ lakh', 'एग्रीमेंट वैल्यू ₹ लाख')} />
      <p className="text-[11px] text-slate-500 sm:col-span-2">{tx('For sales outside the GENZ CRM. A broker typed by name (not chosen from GENZ) gets no share in the book.', 'GENZ CRM के बाहर की बिक्री के लिए। नाम से लिखे ब्रोकर (GENZ से नहीं चुने) का बही में हिस्सा नहीं बनता।')}</p>
      <button className={dark} disabled={busy || !f.projectName || !(Number(f.valueL) > 0)} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Add line', 'लाइन जोड़ें')}</button>
    </div>
  );
};

const bLabel = (tx: (a: string, b: string) => string, s: string) => ({ EXPECTED: tx('to invoice', 'बिल बनाना है'), INVOICED: tx('invoiced', 'बिल भेजा'), RECEIVED: tx('received', 'मिल गया'), WRITTEN_OFF: tx('written off', 'छोड़ दिया') } as any)[s] || s;
const kLabel = (tx: (a: string, b: string) => string, s: string) => ({ NOT_DUE: tx('waits for builder', 'बिल्डर का इंतज़ार'), DUE: tx('pay now', 'अभी दें'), PAID: tx('paid', 'दे दिया'), ON_HOLD: tx('on hold', 'रोका') } as any)[s] || s;

const LineRow: React.FC<{ e: any; open: boolean; onToggle: () => void; onDone: (m: string) => void; onErr: (m: string) => void }> = ({ e, open, onToggle, onDone, onErr }) => {
  const tx = useTx();
  const [f, setF] = useState({ invoiceNo: '', ref: '', amount: '', reason: '', date: '' });
  const [busy, setBusy] = useState(false);
  const m = e.money;
  const act = async (action: string, extra: any = {}, ok = tx('Saved', 'सेव हुआ')) => {
    setBusy(true);
    try { await api.revEntryAct(e.id, { action, ...extra }); onDone(ok); } catch (x: any) { onErr(x.message); } finally { setBusy(false); }
  };
  const amt = f.amount ? Math.round(Number(f.amount)) : undefined;
  return (
    <li className={`rounded-xl border bg-white p-3 ${e.overdue ? 'border-rose-300' : e.doublePayRisk && e.broker.status !== 'PAID' ? 'border-amber-300' : 'border-slate-200'}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-start justify-between gap-2 text-left">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{e.projectName} {e.unitNo && `· ${e.unitNo}`} <span className="text-[11px] font-normal text-slate-500">· {e.builderName}</span></div>
          <div className="text-[11px] text-slate-500">{d0(e.bookedAt)} · {formatINR(e.agreementValue)} · {tx('by', 'द्वारा')} {e.brokerName} · {e.source === 'CRM' ? `CRM ${e.bookingId}` : tx('typed in', 'हाथ से')}</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-bold">
            <span className="rounded-full bg-slate-100 px-2 py-0.5">{tx('Builder', 'बिल्डर')}: {bLabel(tx, e.builder.status)}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5">{tx('Broker', 'ब्रोकर')}: {kLabel(tx, e.broker.status)}</span>
            {e.overdue && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800">{tx('overdue', 'देर')}</span>}
            {e.doublePayRisk && e.broker.status !== 'PAID' && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">{tx('double-pay risk', 'दो बार भुगतान का ख़तरा')}</span>}
            {e.cancelled && <span className="rounded-full bg-slate-200 px-2 py-0.5">{tx('cancelled', 'रद्द')}</span>}
          </div>
        </div>
        <div className="text-right text-xs">
          <div className="font-bold">{tx('GENZ net', 'GENZ शुद्ध')} {formatINR(m.net)}</div>
          <div className="text-[11px] text-slate-500">{tx('from builder', 'बिल्डर से')} {formatINR(m.expectedFromBuilder)} · {tx('to broker', 'ब्रोकर को')} {formatINR(m.payableToBroker)}</div>
          {open ? <ChevronUp className="ml-auto h-4 w-4" /> : <ChevronDown className="ml-auto h-4 w-4" />}
        </div>
      </button>
      {open && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs">
          <div className="grid gap-1 sm:grid-cols-2">
            <div>{tx('GENZ', 'GENZ')} {e.genzRatePct}% = {formatINR(m.gross)} − TDS {formatINR(m.tdsOnGenz)} = <b>{formatINR(m.expectedFromBuilder)}</b></div>
            <div>{tx('Broker', 'ब्रोकर')} {e.brokerSharePct}% = {formatINR(m.brokerShare)} − TDS {formatINR(m.tdsOnBroker)} = <b>{formatINR(m.payableToBroker)}</b></div>
            {e.builder.invoiceNo && <div>{tx('Invoice', 'बिल')}: {e.builder.invoiceNo} · {d0(e.builder.invoicedAt)}</div>}
            {e.builder.receivedAt && <div>{tx('Received', 'मिला')}: {formatINR(e.builder.receivedAmount)} · {d0(e.builder.receivedAt)} · UTR {e.builder.ref}</div>}
            {e.broker.paidAt && <div>{tx('Paid', 'दिया')}: {formatINR(e.broker.paidAmount)} · {d0(e.broker.paidAt)} · UTR {e.broker.ref}</div>}
            {e.broker.holdReason && <div className="text-amber-800">{tx('Hold', 'रोक')}: {e.broker.holdReason}</div>}
            {e.cancelled && <div>{tx('Cancelled', 'रद्द')}: {e.cancelled.reason}</div>}
          </div>
          {!e.cancelled && (
            <div className="grid gap-2 sm:grid-cols-4">
              <input className={inp} value={f.invoiceNo} onChange={x => setF({ ...f, invoiceNo: x.target.value })} placeholder={tx('Invoice no.', 'बिल नं.')} />
              <input className={inp} value={f.ref} onChange={x => setF({ ...f, ref: x.target.value })} placeholder={tx('Bank ref / UTR', 'बैंक रेफ़ / UTR')} />
              <input className={inp} inputMode="numeric" value={f.amount} onChange={x => setF({ ...f, amount: x.target.value.replace(/[^\d]/g, '') })} placeholder={tx('Amount ₹ (if different)', 'राशि ₹ (अलग हो तो)')} />
              <input type="date" className={inp} value={f.date} onChange={x => setF({ ...f, date: x.target.value })} aria-label={tx('Date', 'तारीख़')} />
              <input className={inp + ' sm:col-span-4'} value={f.reason} onChange={x => setF({ ...f, reason: x.target.value })} placeholder={tx('Note / reason (needed to write off, hold, cancel, or to confirm a double-pay risk)', 'नोट / कारण (छोड़ने, रोकने, रद्द करने या दो-बार-भुगतान पक्का करने के लिए ज़रूरी)')} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {!e.cancelled && e.builder.status === 'EXPECTED' && <button className={dark} disabled={busy || !f.invoiceNo} onClick={() => act('INVOICE', { invoiceNo: f.invoiceNo, date: f.date || undefined }, tx('Marked invoiced', 'बिल दर्ज'))}>{tx('Invoice sent', 'बिल भेजा')}</button>}
            {!e.cancelled && (e.builder.status === 'EXPECTED' || e.builder.status === 'INVOICED') && <button className={dark} disabled={busy || !f.ref} onClick={() => act('RECEIVE', { ref: f.ref, amount: amt, date: f.date || undefined }, tx('Payment from builder recorded', 'बिल्डर का भुगतान दर्ज'))}><CheckCircle2 className="h-4 w-4" />{tx('Builder paid', 'बिल्डर ने दिया')}</button>}
            {!e.cancelled && e.broker.status === 'DUE' && <button className={dark} disabled={busy || !f.ref} onClick={() => act('PAY', { ref: f.ref, amount: amt, date: f.date || undefined, reason: f.reason || undefined }, tx('Broker payment recorded', 'ब्रोकर भुगतान दर्ज'))}>{tx('Broker paid', 'ब्रोकर को दिया')}</button>}
            {!e.cancelled && e.broker.status !== 'PAID' && e.broker.status !== 'ON_HOLD' && e.brokerId && <button className={ghost} disabled={busy || f.reason.length < 5} onClick={() => act('HOLD', { reason: f.reason }, tx('On hold', 'रोका गया'))}>{tx('Hold payout', 'भुगतान रोकें')}</button>}
            {!e.cancelled && e.broker.status === 'ON_HOLD' && <button className={ghost} disabled={busy} onClick={() => act('RELEASE', {}, tx('Released', 'रोक हटी'))}>{tx('Release', 'रोक हटाएँ')}</button>}
            {!e.cancelled && (e.builder.status === 'EXPECTED' || e.builder.status === 'INVOICED') && <button className={ghost} disabled={busy || f.reason.length < 5} onClick={() => act('WRITE_OFF', { reason: f.reason }, tx('Written off', 'छोड़ दिया'))}>{tx('Write off', 'छोड़ दें')}</button>}
            {!e.cancelled && e.builder.status !== 'RECEIVED' && e.broker.status !== 'PAID' && <button className={`${ghost} !text-red-700`} disabled={busy || f.reason.length < 5} onClick={() => act('CANCEL', { reason: f.reason }, tx('Cancelled', 'रद्द'))}>{tx('Cancel line', 'लाइन रद्द')}</button>}
            {e.cancelled && <button className={ghost} disabled={busy} onClick={() => act('REOPEN', {}, tx('Reopened', 'फिर से खोली'))}>{tx('Reopen', 'फिर खोलें')}</button>}
          </div>
          <details><summary className="cursor-pointer text-[11px] font-semibold text-slate-600">{tx('History', 'इतिहास')} ({e.history.length})</summary>
            <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">{[...e.history].reverse().map((h: any, i: number) => <li key={i}>{d0(h.at)} · {h.by}: {h.what}</li>)}</ul></details>
        </div>
      )}
    </li>
  );
};

// ───────────────────────────── Growth & value ─────────────────────────────
const ValueTab: React.FC = () => {
  const tx = useTx();
  const [r, setR] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { api.revValue().then(x => setR(x.report)).catch(e => setErr(e.message)); }, []);
  if (err) return <p className="rounded-lg bg-red-50 p-3 text-xs text-red-800">{err}</p>;
  if (!r) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  const h = r.headline; const mo = r.money; const v = r.virality;
  const heat = (x: number | null) => (x === null ? 'bg-slate-50 text-slate-400' : x >= 60 ? 'bg-emerald-600 text-white' : x >= 40 ? 'bg-emerald-400 text-white' : x >= 20 ? 'bg-emerald-200' : 'bg-emerald-50');
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={tx('Headline', 'मुख्य आँकड़े')}>
        <Tile label={tx('Verified brokers', 'वेरिफ़ाइड ब्रोकर')} value={h.verifiedBrokers} hint={`${tx('month-on-month', 'पिछले महीने से')} ${pc(h.verifiedGrowthPct)}`} />
        <Tile label={tx('Active brokers this month', 'इस महीने सक्रिय ब्रोकर')} value={h.activeBrokersThisMonth ?? '—'} hint={`${tx('month-on-month', 'पिछले महीने से')} ${pc(h.activeGrowthPct)}`} />
        <Tile label={tx('Network sales, 12 months', 'नेटवर्क बिक्री, 12 महीने')} value={formatINR(mo.networkGmv12m)} hint={`${mo.networkBookings12m} ${tx('bookings', 'बुकिंग')} · ${tx('via partners', 'पार्टनर से')} ${mo.partnerSharePct ?? '—'}%`} />
        <Tile label={tx('GENZ net revenue, 12 months', 'GENZ शुद्ध कमाई, 12 महीने')} value={formatINR(mo.genzNet12m)} hint={`${tx('take rate', 'टेक रेट')} ${mo.takeRatePct ?? '—'}% · ${tx('received', 'मिला')} ${formatINR(mo.genzReceived12m)}`} />
        <Tile label={tx('New brokers via members (90 days)', 'सदस्यों से आए नए ब्रोकर (90 दिन)')} value={`${v.viaMembers90d}/${v.newBrokers90d}`} hint={`${v.viaMembersPct ?? '—'}% · k = ${v.kFactor ?? '—'}`} />
        <Tile label={tx('Cities', 'शहर')} value={h.cities} hint={`${h.citiesWith10} ${tx('with 10+ verified brokers', 'में 10+ वेरिफ़ाइड ब्रोकर')}`} />
        <Tile label={tx('Network share of GENZ', 'नेटवर्क में GENZ का हिस्सा')} value={mo.networkTakeRatePct === null ? '—' : `${mo.networkTakeRatePct}%`} hint={tx('GENZ net ÷ all network sales', 'GENZ शुद्ध ÷ सारी नेटवर्क बिक्री')} />
        <Tile label={tx('Sales growth (month)', 'बिक्री ग्रोथ (महीना)')} value={pc(h.gmvGrowthPct)} />
      </section>
      <div className="flex flex-wrap gap-2"><a className={ghost} href={api.revValueCsvUrl()}><Download className="h-4 w-4" />{tx('Monthly table as CSV (data room)', 'महीने की तालिका CSV (डेटा रूम)')}</a></div>
      <section className={box}>
        <h3 className="mb-2 text-sm font-bold">{tx('Month by month', 'महीने दर महीने')}</h3>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs">
          <thead className="text-[10px] uppercase text-slate-500"><tr><th className="py-1">{tx('Month', 'महीना')}</th><th>{tx('New', 'नए')}</th><th>{tx('Verified', 'वेरिफ़ाइड')}</th><th>{tx('Active', 'सक्रिय')}</th><th>{tx('Working', 'काम किया')}</th><th>{tx('Bookings', 'बुकिंग')}</th><th>{tx('Sales', 'बिक्री')}</th><th>{tx('Co-broking', 'को-ब्रोकिंग')}</th><th>{tx('Invites used', 'इनवाइट इस्तेमाल')}</th><th>{tx('GENZ net', 'GENZ शुद्ध')}</th></tr></thead>
          <tbody>{r.monthly.map((m: any) => <tr key={m.month} className="border-t border-slate-100"><td className="py-1 font-mono">{m.month}</td><td>{m.newBrokers}</td><td>{m.verifiedBrokers}</td><td>{m.activeBrokers ?? '—'}</td><td>{m.workingBrokers ?? '—'}</td><td>{m.networkBookings}</td><td>{formatINR(m.networkGmv)}</td><td>{m.coBroking}</td><td>{m.invitesRedeemed}</td><td className="font-semibold">{formatINR(m.genzNet)}</td></tr>)}</tbody>
        </table></div>
        {r.recordedSince && <p className="mt-1 text-[10px] text-slate-500">{tx(`"Active" is counted from ${r.recordedSince} (the daily record). Earlier months show —.`, `"सक्रिय" की गिनती ${r.recordedSince} से (रोज़ का रिकॉर्ड)। उससे पहले के महीने — दिखते हैं।`)}</p>}
      </section>
      <section className={box}>
        <h3 className="mb-1 text-sm font-bold">{tx('Do brokers stay? (cohort retention)', 'क्या ब्रोकर टिकते हैं? (कोहॉर्ट रिटेंशन)')}</h3>
        <p className="mb-2 text-[11px] text-slate-500">{tx('Of the brokers who joined in a month, the share who opened GENZ in that month and each month after.', 'जो ब्रोकर किसी महीने जुड़े, उनमें से कितने % ने उस महीने और बाद के हर महीने GENZ खोला।')}</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-center text-[11px]">
          <thead className="text-[10px] uppercase text-slate-500"><tr><th className="py-1 text-left">{tx('Joined', 'जुड़े')}</th><th>{tx('Size', 'संख्या')}</th>{r.cohorts.map((_: any, i: number) => <th key={i}>M+{i}</th>)}</tr></thead>
          <tbody>{r.cohorts.map((c: any) => <tr key={c.month}><td className="py-0.5 text-left font-mono">{c.month}</td><td>{c.size}</td>{r.cohorts.map((_: any, i: number) => { const x = c.retention[i]; return <td key={i} className={i < c.retention.length ? `rounded ${heat(x)}` : ''}>{i < c.retention.length ? (x === null ? '—' : `${x}%`) : ''}</td>; })}</tr>)}</tbody>
        </table></div>
      </section>
      <section className={box}>
        <h3 className="mb-2 text-sm font-bold">{tx('Top cities', 'मुख्य शहर')}</h3>
        <ul className="grid gap-1 sm:grid-cols-2">{r.cities.map((c: any) => <li key={c.city} className="flex justify-between rounded-lg bg-slate-50 px-2 py-1 text-xs"><span className="font-semibold">{c.city}</span><span>{c.verified} {tx('verified', 'वेरिफ़ाइड')} · {c.active30} {tx('active (30 d)', 'सक्रिय (30 दिन)')}</span></li>)}</ul>
      </section>
      <p className="text-[11px] text-slate-500">{tx('k-factor: new brokers brought in by members ÷ brokers active in the same 90 days. Above 1 the network grows by itself. Take rate: GENZ net ÷ value sold under master-CP agreements.', 'k-फ़ैक्टर: सदस्यों द्वारा लाए गए नए ब्रोकर ÷ उन्हीं 90 दिन में सक्रिय ब्रोकर। 1 से ऊपर हो तो नेटवर्क अपने-आप बढ़ता है। टेक रेट: GENZ शुद्ध ÷ मास्टर-CP में बिकी कुल क़ीमत।')}</p>
    </div>
  );
};

// ───────────────────────────── Builder pitch ─────────────────────────────
const PitchTab: React.FC<{ say: (ok: boolean, m: string) => void }> = ({ say }) => {
  const tx = useTx();
  const [city, setCity] = useState('');
  const [d, setD] = useState<any>(null); const [links, setLinks] = useState<any[]>([]);
  const [label, setLabel] = useState(''); const [days, setDays] = useState('30'); const [busy, setBusy] = useState(false);
  const load = async () => { try { const [a, b] = await Promise.all([api.revStrength(city), api.revLinks()]); setD(a); setLinks(b.links); } catch (e: any) { say(false, e.message); } };
  useEffect(() => { load(); }, [city]); // eslint-disable-line react-hooks/exhaustive-deps
  const full = (path: string) => `${window.location.origin}${path}`;
  const create = async () => {
    setBusy(true);
    try { const r = await api.revLinkCreate({ city, label: label.trim(), days: Number(days) || 30 }); setLabel(''); await load(); try { await navigator.clipboard.writeText(full(r.link.path)); say(true, tx('Link created and copied', 'लिंक बना और कॉपी हुआ')); } catch { say(true, tx('Link created', 'लिंक बना')); } }
    catch (e: any) { say(false, e.message); } finally { setBusy(false); }
  };
  if (!d) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600">{tx('Show a builder what GENZ’s network can sell — counted live from GENZ records, totals only (no names, phones or customer details). Share it as a read-only link that expires, and see how often it was opened.', 'बिल्डर को दिखाइए कि GENZ का नेटवर्क क्या बेच सकता है — GENZ के रिकॉर्ड से सीधी गिनती, सिर्फ़ कुल संख्या (कोई नाम, फ़ोन या ग्राहक की जानकारी नहीं)। सिर्फ़ पढ़ने वाला लिंक भेजें जो समय पर बंद हो जाए, और देखें कितनी बार खोला गया।')}</p>
      <select className={inp + ' max-w-xs'} value={city} onChange={e => setCity(e.target.value)} aria-label={tx('City', 'शहर')}><option value="">{tx('All India', 'पूरा भारत')}</option>{d.cities.map((c: string) => <option key={c} value={c}>{c}</option>)}</select>
      <StrengthBody s={d.strength} />
      <section className={box + ' space-y-2'}>
        <h3 className="text-sm font-bold">{tx('Share with a builder', 'बिल्डर के साथ शेयर करें')}</h3>
        <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
          <input className={inp} value={label} onChange={e => setLabel(e.target.value)} placeholder={tx('Who is it for? e.g. “Avinash Group — Raipur”', 'किसके लिए? जैसे “अविनाश ग्रुप — रायपुर”')} />
          <select className={inp} value={days} onChange={e => setDays(e.target.value)} aria-label={tx('Valid for', 'वैधता')}>{['7', '15', '30', '60', '90'].map(x => <option key={x} value={x}>{x} {tx('days', 'दिन')}</option>)}</select>
          <button className={dark} disabled={busy || label.trim().length < 2} onClick={create}><Link2 className="h-4 w-4" />{tx('Create link', 'लिंक बनाएँ')}</button>
        </div>
        {links.length === 0 ? <p className="text-[11px] text-slate-500">{tx('No links yet.', 'अभी कोई लिंक नहीं।')}</p> : (
          <ul className="space-y-1.5">{links.map(l => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-xs">
              <div className="min-w-0"><b>{l.label}</b> · {l.city || tx('All India', 'पूरा भारत')} <div className="text-[11px] text-slate-500">{l.live ? tx(`opened ${l.views}× · till ${d0(l.expiresAt)}`, `${l.views} बार खुला · ${d0(l.expiresAt)} तक`) : tx('switched off / expired', 'बंद / समय ख़त्म')}{l.lastViewAt ? ` · ${tx('last', 'आख़िरी')} ${d0(l.lastViewAt)}` : ''}</div></div>
              {l.live && <div className="flex gap-1.5">
                <button className={ghost} onClick={async () => { try { await navigator.clipboard.writeText(full(l.path)); say(true, tx('Copied', 'कॉपी हुआ')); } catch { say(false, full(l.path)); } }}><Copy className="h-4 w-4" />{tx('Copy', 'कॉपी')}</button>
                <a className={ghost} target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${tx('GENZ Broker Network — our strength', 'GENZ ब्रोकर नेटवर्क — हमारी ताक़त')}: ${full(l.path)}`)}`}><Share2 className="h-4 w-4" />WhatsApp</a>
                <button className={`${ghost} !text-red-700`} onClick={async () => { try { await api.revLinkRevoke(l.id); say(true, tx('Link switched off', 'लिंक बंद')); load(); } catch (e: any) { say(false, e.message); } }}><Ban className="h-4 w-4" />{tx('Switch off', 'बंद करें')}</button>
              </div>}
            </li>))}</ul>
        )}
      </section>
    </div>
  );
};

// ───────────────────────────── System health ─────────────────────────────
const HealthTab: React.FC = () => {
  const tx = useTx();
  const [h, setH] = useState<any>(null); const [err, setErr] = useState('');
  const load = () => api.adminHealth().then(x => { setH(x.health); setErr(''); }).catch(e => setErr(e.message));
  useEffect(() => { load(); const t = window.setInterval(load, 30_000); return () => window.clearInterval(t); }, []);
  const maxLag = useMemo(() => Math.max(50, ...(h?.eventLoopLagMs?.perMinute || [0])), [h]);
  if (err) return <p className="rounded-lg bg-red-50 p-3 text-xs text-red-800">{err}</p>;
  if (!h) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  const list = (rows: any[], empty: string) => rows.length === 0 ? <p className="text-[11px] text-slate-500">{empty}</p> : <ul className="space-y-1">{rows.map((r, i) => <li key={i} className="rounded-lg bg-slate-50 px-2 py-1 text-[11px]"><b className="font-mono">{r.path}</b> {r.ms ? `· ${r.ms} ms` : ''} · ×{r.n} · {d0(r.at)} {new Date(r.at).toLocaleTimeString('en-IN')}<div className="break-all text-slate-600">{r.detail}</div></li>)}</ul>;
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label={tx('Status', 'स्थिति')} value={h.status === 'OK' ? tx('Healthy', 'ठीक') : tx('Look at it', 'देखें')} tone={h.status === 'OK' ? 'ok' : 'warn'} hint={`${tx('up', 'चालू')} ${Math.round(h.uptimeSec / 3600)} h · ${h.storage}`} />
        <Tile label={tx('Server busy (worst, 15 min)', 'सर्वर व्यस्त (सबसे ज़्यादा, 15 मिनट)')} value={`${h.eventLoopLagMs.max15m} ms`} tone={h.eventLoopLagMs.max15m > 2000 ? 'bad' : h.eventLoopLagMs.max15m > 500 ? 'warn' : 'ok'} hint={tx('under 200 ms is good', '200 ms से कम अच्छा')} />
        <Tile label={tx('Memory', 'मेमोरी')} value={`${h.memoryMb.rss} MB`} hint={`${tx('heap', 'हीप')} ${h.memoryMb.heapUsed}/${h.memoryMb.heapLimit} MB`} tone={h.memoryMb.heapUsed > h.memoryMb.heapLimit * 0.8 ? 'bad' : 'ok'} />
        <Tile label={tx('Requests since start', 'शुरू से अनुरोध')} value={h.counts.requests} hint={`${h.counts.slow} ${tx('slow', 'धीमे')} · ${h.counts.serverErrors} ${tx('errors', 'त्रुटि')} · ${h.counts.client} ${tx('phone crashes', 'फ़ोन क्रैश')}`} tone={h.counts.serverErrors ? 'warn' : 'ok'} />
      </section>
      {h.saves && <p className="text-[11px] text-slate-600">{tx(`Database saves: ${h.saves.flushes} · last ${h.saves.lastMs} ms (${h.saves.lastRows} rows) · slowest ${h.saves.maxMs} ms`, `डेटाबेस सेव: ${h.saves.flushes} · पिछला ${h.saves.lastMs} ms (${h.saves.lastRows} पंक्तियाँ) · सबसे धीमा ${h.saves.maxMs} ms`)}</p>}
      <section className={box}>
        <h3 className="mb-2 text-sm font-bold">{tx('Server busy, per minute (last 30)', 'सर्वर व्यस्त, हर मिनट (पिछले 30)')}</h3>
        {h.eventLoopLagMs.perMinute.length === 0 ? <p className="text-[11px] text-slate-500">{tx('Fills in after the first minute.', 'पहले मिनट के बाद भरेगा।')}</p> : (
          <div className="flex h-20 items-end gap-0.5" aria-label={tx('busy chart', 'व्यस्तता चार्ट')}>{h.eventLoopLagMs.perMinute.map((v: number, i: number) => <div key={i} title={`${v} ms`} className={`flex-1 rounded-t ${v > 2000 ? 'bg-rose-500' : v > 500 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ height: `${Math.max(4, (v / maxLag) * 100)}%` }} />)}</div>
        )}
      </section>
      <section className={box}><h3 className="mb-2 text-sm font-bold">{tx('Slow requests', 'धीमे अनुरोध')} (≥ {h.slowThresholdMs} ms)</h3>{list(h.slow, tx('None — good.', 'कोई नहीं — बढ़िया।'))}</section>
      <section className={box}><h3 className="mb-2 text-sm font-bold">{tx('Server errors', 'सर्वर त्रुटियाँ')}</h3>{list(h.serverErrors, tx('None — good.', 'कोई नहीं — बढ़िया।'))}</section>
      <section className={box}><h3 className="mb-2 text-sm font-bold">{tx('Crashes reported by phones', 'फ़ोन से आए क्रैश')}</h3>{list(h.client, tx('None — good.', 'कोई नहीं — बढ़िया।'))}</section>
      <section className={box}><h3 className="mb-2 text-sm font-bold">{tx('Biggest data', 'सबसे बड़ा डेटा')}</h3><p className="text-[11px] text-slate-600">{Object.entries(h.data.bigCollections).sort((a: any, b: any) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k}: ${(n as number).toLocaleString('en-IN')}`).join(' · ') || '—'}</p></section>
      <p className="text-[11px] text-slate-500">{tx('Kept in memory only (resets on restart). No names, phones or form contents — only paths, timings and error text.', 'सिर्फ़ मेमोरी में (रीस्टार्ट पर साफ़)। कोई नाम, फ़ोन या फ़ॉर्म की जानकारी नहीं — सिर्फ़ रास्ता, समय और त्रुटि का संदेश।')}</p>
    </div>
  );
};
