/**
 * v60 — Rent desk (broker). A rented home after the deal:
 *  • record the tenancy — from a rent deal room, from his rent listing, or an old rental of his by hand — with the agreed terms;
 *  • the tenant's police verification (step, date, police station, acknowledgement no. — never the tenant's ID);
 *  • reminders 60 / 30 / 7 days before the end; WhatsApp lines to the owner and the tenant; renew with the yearly increase;
 *  • notice → vacating → put the home back on GENZ for rent;
 *  • a printable term sheet (Hindi + English) — not the agreement.
 * GENZ never holds rent or deposit (server/rentdesk.ts).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { DoorOpen, Plus, Loader2, MessageCircle, Printer, ShieldCheck, RefreshCw, LogOut, Bell, ChevronDown, ChevronUp, Trash2, Home as HomeIcon, Pencil, X, CheckCircle2, Info } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { PageTitle } from './PageTitle.js';
import { goto } from '../lib/goto.js';
import {
  RENT_LIMITS, AGREEMENT_STEPS, POLICE_STEPS, POLICE_CHECKLIST, NEVER_STORE, RENT_CONSENT_TEXT, FLAG_TEXT, endOf, todayIst, humanDay, rupees, nextRent, waText, waLink,
  type RentFlag, type WaKind,
} from '../shared/rentRules.js';

const inp = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm';
const lab = 'block space-y-1 text-xs font-semibold text-slate-600';
const dark = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-40';
const light = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-40';
const green = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white';
const toneCls = { red: 'bg-red-50 text-red-800 border-red-200', amber: 'bg-amber-50 text-amber-900 border-amber-200', slate: 'bg-slate-100 text-slate-700 border-slate-200' } as const;
const num = (v: string) => { const n = Math.round(Number(String(v).replace(/[^\d.]/g, ''))); return Number.isFinite(n) ? n : 0; };
type Filter = 'LIVE' | 'ENDING' | 'POLICE' | 'ENDED';

export const RentDeskView: React.FC<{ brokerName: string }> = ({ brokerName }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<Filter>('LIVE');
  const [open, setOpen] = useState('');
  const [adding, setAdding] = useState(false);
  const load = () => api.rentList().then(r => { setD(r); setErr(''); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const replace = (t: any) => setD((x: any) => x ? { ...x, items: x.items.map((i: any) => i.id === t.id ? t : i) } : x);

  const list = useMemo(() => {
    const items: any[] = d?.items || [];
    if (filter === 'ENDED') return items.filter(t => t.status === 'ENDED');
    if (filter === 'ENDING') return items.filter(t => t.flags.some((f: RentFlag) => f === 'OVERDUE' || f.startsWith('ENDING_')));
    if (filter === 'POLICE') return items.filter(t => t.flags.includes('POLICE'));
    return items.filter(t => t.status !== 'ENDED');
  }, [d, filter]);

  if (err) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (!d) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  const c = d.counts;
  const chips: Array<[Filter, string, number, string]> = [
    ['LIVE', tx('Running', 'चल रहे'), c.running, 'rent-f-live'],
    ['ENDING', tx('Ending soon', 'जल्द ख़त्म'), c.rentEnding, 'rent-f-ending'],
    ['POLICE', tx('Police pending', 'पुलिस बाक़ी'), c.rentPolice, 'rent-f-police'],
    ['ENDED', tx('Ended', 'ख़त्म'), c.ended, 'rent-f-ended'],
  ];

  return (
    <div className="space-y-4" data-testid="rent-desk">
      <PageTitle title={tx('Rent desk', 'किराया डेस्क')} meta={tx(`${c.running} running`, `${c.running} चल रहे`)} testId="rent-title"
        help={tx('Your rented homes after the deal: the agreed terms, the tenant’s police verification, reminders before the agreement ends, renewal and re-letting. GENZ never holds rent or deposit — the tenant pays the owner directly.', 'डील के बाद आपके किराये वाले घर: तय शर्तें, किरायेदार का पुलिस वेरिफ़िकेशन, अनुबंध ख़त्म होने से पहले याद, रिन्यू और दोबारा किराये पर देना। GENZ किराया या डिपॉज़िट कभी नहीं रखता — किरायेदार सीधे मालिक को देता है।')} />

      {msg && <div className={`rounded-lg p-2.5 text-sm font-medium ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} role="status">{msg.text}</div>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {chips.map(([id, label, n, testId]) => (
          <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id} data-testid={testId}
            className={`min-h-12 rounded-xl border px-3 py-2 text-left ${filter === id ? 'border-slate-900 bg-slate-900 text-white' : (id === 'ENDING' || id === 'POLICE') && n > 0 ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-slate-200 bg-white text-slate-800'}`}>
            <span className="block text-lg font-bold leading-tight">{n}</span><span className="text-xs font-semibold">{label}</span>
          </button>
        ))}
      </div>

      {!adding ? (
        <button type="button" className={`${dark} w-full`} onClick={() => { setAdding(true); setMsg(null); }} data-testid="rent-add"><Plus className="h-4 w-4" />{tx('Record a tenancy', 'किरायेदारी दर्ज करें')}</button>
      ) : (
        <NewTenancy sources={d.sources} hi={hi} onCancel={() => setAdding(false)} onSaved={t => { setAdding(false); setFilter('LIVE'); setOpen(t.id); setMsg({ ok: true, text: tx('Tenancy recorded. Reminders are on.', 'किरायेदारी दर्ज हो गई। याद दिलाना चालू।') }); load(); }} />
      )}

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600" data-testid="rent-empty">
          {filter === 'LIVE' ? tx('No running tenancy yet. When a rent deal is done, record it here — GENZ reminds you before the agreement ends so the renewal (or the next tenant) stays with you.', 'अभी कोई चालू किरायेदारी नहीं। किराये की डील होते ही यहाँ दर्ज करें — अनुबंध ख़त्म होने से पहले GENZ याद दिलाएगा, ताकि रिन्यू (या अगला किरायेदार) आपके पास ही रहे।') : tx('Nothing here.', 'यहाँ कुछ नहीं।')}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(t => <TenancyCard key={t.id} t={t} hi={hi} brokerName={brokerName} open={open === t.id} onToggle={() => setOpen(o => o === t.id ? '' : t.id)}
            onChanged={(nt, text) => { if (nt) replace(nt); else load(); if (text) setMsg({ ok: true, text }); }} onError={text => setMsg({ ok: false, text })} onReload={load} />)}
        </div>
      )}
      <p className="text-xs text-slate-500">{tx(`Names and numbers of a tenancy are erased ${d.keepDays} days after it ends. Never upload the tenant’s ID here.`, `किरायेदारी ख़त्म होने के ${d.keepDays} दिन बाद नाम और नंबर मिट जाते हैं। किरायेदार की ID यहाँ कभी अपलोड न करें।`)}</p>
    </div>
  );
};

// ───────────────────────── new tenancy ─────────────────────────
const NewTenancy: React.FC<{ sources: any[]; hi: boolean; onCancel: () => void; onSaved: (t: any) => void }> = ({ sources, hi, onCancel, onSaved }) => {
  const tx = useTx();
  const [src, setSrc] = useState('');
  const [f, setF] = useState({ place: '', ownerName: '', ownerPhone: '', tenantName: '', tenantPhone: '', rent: '', deposit: '', maintenance: '', startOn: todayIst(), months: String(RENT_LIMITS.monthsDefault), lockInMonths: '', escalationPct: '', noticeDays: String(RENT_LIMITS.noticeDefaultDays), agreement: 'NONE' });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(x => ({ ...x, [k]: e.target.value }));
  const pick = (key: string) => {
    setSrc(key); const s = sources.find(x => `${x.kind}:${x.id}` === key);
    if (s) setF(x => ({ ...x, place: s.place || x.place, rent: s.rent ? String(s.rent) : x.rent, ownerName: s.ownerName || x.ownerName, ownerPhone: s.ownerPhone ? String(s.ownerPhone).replace(/\D/g, '').slice(-10) : x.ownerPhone }));
  };
  const months = num(f.months) || RENT_LIMITS.monthsDefault;
  const endOn = /^\d{4}-\d{2}-\d{2}$/.test(f.startOn) ? endOf(f.startOn, months) : '';
  const save = async () => {
    setBusy(true); setErr('');
    const s = sources.find(x => `${x.kind}:${x.id}` === src);
    try {
      const r = await api.rentCreate({
        ...(s?.dealRoomId ? { dealRoomId: s.dealRoomId } : s ? { propertyId: s.propertyId } : {}),
        place: f.place, ownerName: f.ownerName, ownerPhone: f.ownerPhone, tenantName: f.tenantName, tenantPhone: f.tenantPhone,
        rent: num(f.rent), deposit: num(f.deposit), ...(f.maintenance ? { maintenance: num(f.maintenance) } : {}),
        startOn: f.startOn, months, ...(f.lockInMonths ? { lockInMonths: num(f.lockInMonths) } : {}), ...(f.escalationPct ? { escalationPct: Number(f.escalationPct) } : {}),
        noticeDays: num(f.noticeDays), agreement: f.agreement, consent: consent || undefined,
      });
      onSaved(r.tenancy);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" data-testid="rent-form">
      <div className="flex items-center justify-between"><p className="text-base font-bold text-slate-900">{tx('Record a tenancy', 'किरायेदारी दर्ज करें')}</p><button type="button" onClick={onCancel} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500" aria-label={tx('Close', 'बंद करें')}><X className="h-5 w-5" /></button></div>
      <label className={lab}>{tx('Start from', 'कहाँ से')}
        <select className={inp} value={src} onChange={e => pick(e.target.value)} data-testid="rent-src">
          <option value="">{tx('By hand (a rental you did earlier)', 'हाथ से (पहले की करवाई किरायेदारी)')}</option>
          {sources.map(s => <option key={`${s.kind}:${s.id}`} value={`${s.kind}:${s.id}`}>{s.kind === 'DEAL' ? tx('Deal room', 'डील रूम') : tx('My listing', 'मेरी लिस्टिंग')} · {s.label}</option>)}
        </select>
      </label>
      <label className={lab}>{tx('Home (a few words, not the full address)', 'घर (कुछ शब्द, पूरा पता नहीं)')}<input className={inp} value={f.place} onChange={set('place')} maxLength={RENT_LIMITS.place} placeholder={tx('2 BHK flat, Shankar Nagar', '2 BHK फ़्लैट, शंकर नगर')} data-testid="rent-place" /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className={lab}>{tx('Owner’s name', 'मालिक का नाम')}<input className={inp} value={f.ownerName} onChange={set('ownerName')} maxLength={RENT_LIMITS.name} data-testid="rent-owner" /></label>
        <label className={lab}>{tx('Owner’s mobile', 'मालिक का मोबाइल')}<input className={inp} value={f.ownerPhone} onChange={set('ownerPhone')} inputMode="numeric" maxLength={14} data-testid="rent-owner-phone" /></label>
        <label className={lab}>{tx('Tenant’s name', 'किरायेदार का नाम')}<input className={inp} value={f.tenantName} onChange={set('tenantName')} maxLength={RENT_LIMITS.name} data-testid="rent-tenant" /></label>
        <label className={lab}>{tx('Tenant’s mobile', 'किरायेदार का मोबाइल')}<input className={inp} value={f.tenantPhone} onChange={set('tenantPhone')} inputMode="numeric" maxLength={14} data-testid="rent-tenant-phone" /></label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className={lab}>{tx('Rent / month ₹', 'किराया / महीना ₹')}<input className={inp} value={f.rent} onChange={set('rent')} inputMode="numeric" data-testid="rent-rent" /></label>
        <label className={lab}>{tx('Deposit ₹', 'डिपॉज़िट ₹')}<input className={inp} value={f.deposit} onChange={set('deposit')} inputMode="numeric" data-testid="rent-deposit" /></label>
        <label className={lab}>{tx('Maintenance ₹', 'मेंटेनेंस ₹')}<input className={inp} value={f.maintenance} onChange={set('maintenance')} inputMode="numeric" placeholder="0" /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className={lab}>{tx('Starts on', 'कब से')}<input type="date" className={inp} value={f.startOn} onChange={set('startOn')} data-testid="rent-start" /></label>
        <label className={lab}>{tx('Months', 'महीने')}<input className={inp} value={f.months} onChange={set('months')} inputMode="numeric" data-testid="rent-months" /></label>
      </div>
      {endOn && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="rent-endon">{tx('Ends on', 'ख़त्म')}: <b>{humanDay(endOn, hi)}</b></p>}
      <div className="grid grid-cols-3 gap-2">
        <label className={lab}>{tx('Lock-in (months)', 'लॉक-इन (महीने)')}<input className={inp} value={f.lockInMonths} onChange={set('lockInMonths')} inputMode="numeric" placeholder="0" /></label>
        <label className={lab}>{tx('Yearly increase %', 'सालाना बढ़ोतरी %')}<input className={inp} value={f.escalationPct} onChange={set('escalationPct')} inputMode="decimal" placeholder="5" /></label>
        <label className={lab}>{tx('Notice (days)', 'नोटिस (दिन)')}<input className={inp} value={f.noticeDays} onChange={set('noticeDays')} inputMode="numeric" /></label>
      </div>
      <label className={lab}>{tx('Rent agreement', 'किराया अनुबंध')}
        <select className={inp} value={f.agreement} onChange={set('agreement')}>{AGREEMENT_STEPS.map(a => <option key={a.id} value={a.id}>{hi ? a.hi : a.en}</option>)}</select>
      </label>
      <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-slate-800">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={consent} onChange={e => setConsent(e.target.checked)} data-testid="rent-consent" />
        <span>{hi ? RENT_CONSENT_TEXT.hi : RENT_CONSENT_TEXT.en}</span>
      </label>
      {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{err}</p>}
      <div className="flex gap-2"><button type="button" className={`${dark} flex-1`} disabled={busy || !consent} onClick={save} data-testid="rent-save">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{tx('Save tenancy', 'किरायेदारी सेव करें')}</button><button type="button" className={light} onClick={onCancel}>{tx('Cancel', 'रद्द')}</button></div>
    </section>
  );
};

// ───────────────────────── one tenancy ─────────────────────────
const TenancyCard: React.FC<{ t: any; hi: boolean; brokerName: string; open: boolean; onToggle: () => void; onChanged: (t: any | null, text?: string) => void; onError: (text: string) => void; onReload: () => void }> = ({ t, hi, brokerName, open, onToggle, onChanged, onError, onReload }) => {
  const tx = useTx();
  const [busy, setBusy] = useState('');
  const [pane, setPane] = useState<'' | 'renew' | 'notice' | 'vacate' | 'edit' | 'relist' | 'history'>('');
  const [police, setPolice] = useState({ status: t.police.status, on: t.police.on || '', station: t.police.station || '', ref: t.police.ref || '' });
  const [renew, setRenew] = useState({ rent: String(t.nextRent), months: String(t.months) });
  const [notice, setNotice] = useState({ on: todayIst(), by: 'TENANT' });
  const [vacate, setVacate] = useState({ on: todayIst(), depositNote: '' });
  const [edit, setEdit] = useState({ rent: String(t.rent), deposit: String(t.deposit), maintenance: t.maintenance ? String(t.maintenance) : '', ownerPhone: t.ownerPhone || '', tenantPhone: t.tenantPhone || '', agreement: t.agreement, stampRef: t.stampRef || '', keysOn: t.keysOn || '', meterNote: t.meterNote || '' });
  const [relist, setRelist] = useState({ rent: String(t.nextRent), address: '', ownerPhone: t.ownerPhone || '' });
  const [askDel, setAskDel] = useState(false);
  useEffect(() => { setPolice({ status: t.police.status, on: t.police.on || '', station: t.police.station || '', ref: t.police.ref || '' }); setRenew({ rent: String(t.nextRent), months: String(t.months) }); }, [t]);

  const run = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key);
    try { const r = await fn(); onChanged(r?.tenancy || null, ok); setPane(''); return r; } catch (e: any) { onError(e.message); return null; } finally { setBusy(''); }
  };
  const flags: RentFlag[] = t.flags || [];
  const ended = t.status === 'ENDED';
  const wa = (kind: WaKind) => waText(kind, t, hi, brokerName);
  const left = t.daysLeft as number;
  const leftText = ended ? tx(`Ended ${humanDay(t.vacatedOn || t.endOn, false)}`, `ख़त्म ${humanDay(t.vacatedOn || t.endOn, true)}`)
    : left < 0 ? tx(`Term over ${-left} day(s) ago`, `अवधि ${-left} दिन पहले ख़त्म`) : tx(`${left} day(s) left`, `${left} दिन बाक़ी`);
  const stepLabel = (arr: readonly { id: string; en: string; hi: string }[], id: string) => { const x = arr.find(a => a.id === id); return x ? (hi ? x.hi : x.en) : id; };

  return (
    <article className={`rounded-xl border bg-white ${flags.some(f => FLAG_TEXT[f].tone === 'red') ? 'border-red-300' : flags.length ? 'border-amber-300' : 'border-slate-200'}`} data-testid={`rent-card-${t.id}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 p-3 text-left" data-testid="rent-card-open">
        <span className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ended ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}><DoorOpen className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold text-slate-900">{t.place}</span>
          <span className="block text-xs text-slate-600">{tx('Owner', 'मालिक')}: {t.ownerName} · {tx('Tenant', 'किरायेदार')}: {t.tenantName}</span>
          <span className="mt-0.5 block text-sm text-slate-800">{rupees(t.rent)}{tx('/month', '/महीना')} · {tx('deposit', 'डिपॉज़िट')} {rupees(t.deposit)}</span>
          <span className="block text-xs text-slate-500">{humanDay(t.startOn, hi)} – {humanDay(t.endOn, hi)} · <b className={left < 8 && !ended ? 'text-red-700' : ''}>{leftText}</b></span>
          {flags.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{flags.map(f => <span key={f} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneCls[FLAG_TEXT[f].tone]}`} data-testid={`rent-flag-${f}`}>{hi ? FLAG_TEXT[f].hi : FLAG_TEXT[f].en}</span>)}</span>}
        </span>
        {open ? <ChevronUp className="mt-1 h-5 w-5 text-slate-400" /> : <ChevronDown className="mt-1 h-5 w-5 text-slate-400" />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 p-3" data-testid="rent-detail">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            {([
              [tx('Rent', 'किराया'), `${rupees(t.rent)}${t.maintenance ? ` + ${rupees(t.maintenance)} ${tx('maint.', 'मेंटे.')}` : ''}`],
              [tx('Deposit', 'डिपॉज़िट'), rupees(t.deposit)],
              [tx('Term', 'अवधि'), tx(`${t.months} months`, `${t.months} महीने`)],
              [tx('Lock-in', 'लॉक-इन'), t.lockInMonths ? tx(`${t.lockInMonths} months`, `${t.lockInMonths} महीने`) : '—'],
              [tx('Yearly increase', 'सालाना बढ़ोतरी'), t.escalationPct ? `${t.escalationPct}%` : '—'],
              [tx('Notice', 'नोटिस'), tx(`${t.noticeDays} days`, `${t.noticeDays} दिन`)],
              [tx('Agreement', 'अनुबंध'), stepLabel(AGREEMENT_STEPS, t.agreement)],
              [tx('Renewed', 'रिन्यू'), t.renewals.length ? tx(`${t.renewals.length} time(s)`, `${t.renewals.length} बार`) : '—'],
            ] as [string, string][]).map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-semibold text-slate-900">{v}</dd></div>)}
          </dl>
          {!ended && t.property?.mine && ['active', 'under_negotiation'].includes(t.property.status) && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" data-testid="rent-listing-live">
              <span className="flex-1">{tx('Your listing of this home is still live on the network — mark it rented so other brokers stop sending clients.', 'इस घर की आपकी लिस्टिंग अभी नेटवर्क पर चालू है — "किराये पर गया" करें, ताकि दूसरे ब्रोकर क्लाइंट न भेजें।')}</span>
              <button type="button" className={light} onClick={() => { goto('properties', { propertyId: t.property.id }); window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: 'properties' })); }}>{tx('Open the listing', 'लिस्टिंग खोलें')}</button>
            </div>
          )}
          {t.status === 'NOTICE' && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800">{tx(`Notice given on ${humanDay(t.noticeOn)} — home to be empty by ${humanDay(t.vacateBy)}.`, `${humanDay(t.noticeOn, true)} को नोटिस दिया — ${humanDay(t.vacateBy, true)} तक घर ख़ाली होना है।`)}</p>}
          {t.meterNote && <p className="text-xs text-slate-600">{tx('Meter / fittings', 'मीटर / फ़िटिंग')}: {t.meterNote}</p>}
          {ended && t.depositNote && <p className="text-xs text-slate-600">{tx('Deposit', 'डिपॉज़िट')}: {t.depositNote}</p>}

          {/* WhatsApp from his own phone */}
          {!ended && !t.erasedAt && (
            <div className="grid grid-cols-2 gap-2">
              <a className={green} href={waLink(wa('OWNER_RENEW'), t.ownerPhone)} target="_blank" rel="noopener noreferrer" data-testid="rent-wa-owner"><MessageCircle className="h-4 w-4" />{tx('Owner: renew?', 'मालिक: रिन्यू?')}</a>
              <a className={green} href={waLink(wa('TENANT_RENEW'), t.tenantPhone)} target="_blank" rel="noopener noreferrer" data-testid="rent-wa-tenant"><MessageCircle className="h-4 w-4" />{tx('Tenant: renew?', 'किरायेदार: रिन्यू?')}</a>
              <a className={light} href={waLink(wa('TERMS'))} target="_blank" rel="noopener noreferrer" data-testid="rent-wa-terms"><MessageCircle className="h-4 w-4" />{tx('Send the terms', 'शर्तें भेजें')}</a>
              <a className={light} href={`/api/rent/${encodeURIComponent(t.id)}/sheet`} target="_blank" rel="noopener noreferrer" data-testid="rent-sheet"><Printer className="h-4 w-4" />{tx('Term sheet', 'शर्तों की शीट')}</a>
            </div>
          )}

          {/* police verification */}
          {!ended && (
            <section className={`space-y-2 rounded-xl border p-3 ${t.police.status === 'DONE' ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/60'}`} data-testid="rent-police">
              <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><ShieldCheck className="h-4 w-4" />{tx('Tenant police verification', 'किरायेदार का पुलिस वेरिफ़िकेशन')}: <span className="font-semibold">{stepLabel(POLICE_STEPS, t.police.status)}</span></p>
              <div className="grid grid-cols-3 gap-1">
                {POLICE_STEPS.map(s => <button key={s.id} type="button" onClick={() => setPolice(p => ({ ...p, status: s.id }))} aria-pressed={police.status === s.id} data-testid={`rent-police-${s.id}`}
                  className={`min-h-10 rounded-lg border px-2 text-xs font-semibold ${police.status === s.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{hi ? s.hi : s.en}</button>)}
              </div>
              {police.status !== 'NOT_STARTED' && (
                <div className="grid grid-cols-2 gap-2">
                  <label className={lab}>{tx('Date', 'तारीख़')}<input type="date" className={inp} value={police.on} max={todayIst()} onChange={e => setPolice(p => ({ ...p, on: e.target.value }))} data-testid="rent-police-on" /></label>
                  <label className={lab}>{tx('Police station', 'थाना')}<input className={inp} value={police.station} maxLength={RENT_LIMITS.name} onChange={e => setPolice(p => ({ ...p, station: e.target.value }))} /></label>
                  <label className={`${lab} col-span-2`}>{tx('Acknowledgement no. (not the Aadhaar)', 'पावती नंबर (आधार नहीं)')}<input className={inp} value={police.ref} maxLength={RENT_LIMITS.ref} onChange={e => setPolice(p => ({ ...p, ref: e.target.value }))} data-testid="rent-police-ref" /></label>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={dark} disabled={busy === 'police'} data-testid="rent-police-save"
                  onClick={() => run('police', () => api.rentPolice(t.id, { status: police.status, ...(police.on ? { on: police.on } : {}), ...(police.station ? { station: police.station } : {}), ...(police.ref ? { ref: police.ref } : {}) }), tx('Police verification saved', 'पुलिस वेरिफ़िकेशन सेव हुआ'))}>
                  {busy === 'police' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{tx('Save', 'सेव करें')}</button>
                {t.police.status !== 'DONE' && <a className={green} href={waLink(wa('POLICE'), t.ownerPhone)} target="_blank" rel="noopener noreferrer" data-testid="rent-wa-police"><MessageCircle className="h-4 w-4" />{tx('Checklist to owner', 'मालिक को चेकलिस्ट')}</a>}
              </div>
              <details className="text-xs text-slate-700"><summary className="cursor-pointer font-semibold">{tx('What to carry', 'साथ क्या ले जाएँ')}</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">{POLICE_CHECKLIST.map(x => <li key={x.en}>{hi ? x.hi : x.en}</li>)}</ul>
              </details>
              <p className="flex items-start gap-1 text-[11px] text-slate-600"><Info className="mt-0.5 h-3 w-3 shrink-0" />{hi ? NEVER_STORE.hi : NEVER_STORE.en}</p>
            </section>
          )}

          {/* what happens next */}
          {!ended && (
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className={light} onClick={() => setPane(p => p === 'renew' ? '' : 'renew')} aria-pressed={pane === 'renew'} data-testid="rent-renew"><RefreshCw className="h-4 w-4" />{tx('Renew', 'रिन्यू')}</button>
              <button type="button" className={light} onClick={() => setPane(p => p === 'notice' ? '' : 'notice')} aria-pressed={pane === 'notice'} data-testid="rent-notice"><Bell className="h-4 w-4" />{tx('Notice', 'नोटिस')}</button>
              <button type="button" className={light} onClick={() => setPane(p => p === 'vacate' ? '' : 'vacate')} aria-pressed={pane === 'vacate'} data-testid="rent-vacate"><LogOut className="h-4 w-4" />{tx('Vacated', 'ख़ाली हुआ')}</button>
            </div>
          )}
          {pane === 'renew' && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3" data-testid="rent-renew-pane">
              <p className="text-sm text-slate-700">{tx(`New term from ${humanDay(nextDay(t.endOn))}. Suggested rent with the ${t.escalationPct || 0}% increase: ${rupees(t.nextRent)}. A new term needs a new agreement.`, `नई अवधि ${humanDay(nextDay(t.endOn), true)} से। ${t.escalationPct || 0}% बढ़ोतरी के साथ सुझाया किराया: ${rupees(t.nextRent)}। नई अवधि के लिए नया अनुबंध बनवाएँ।`)}</p>
              <div className="grid grid-cols-2 gap-2">
                <label className={lab}>{tx('New rent ₹', 'नया किराया ₹')}<input className={inp} value={renew.rent} onChange={e => setRenew(r => ({ ...r, rent: e.target.value }))} inputMode="numeric" data-testid="rent-renew-rent" /></label>
                <label className={lab}>{tx('Months', 'महीने')}<input className={inp} value={renew.months} onChange={e => setRenew(r => ({ ...r, months: e.target.value }))} inputMode="numeric" /></label>
              </div>
              <button type="button" className={`${dark} w-full`} disabled={busy === 'renew'} data-testid="rent-renew-save" onClick={() => run('renew', () => api.rentRenew(t.id, { rent: num(renew.rent), months: num(renew.months) }), tx('Renewed — the new term is on the desk', 'रिन्यू हो गया — नई अवधि डेस्क पर'))}>{tx('Renew', 'रिन्यू करें')}</button>
            </div>
          )}
          {pane === 'notice' && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3" data-testid="rent-notice-pane">
              <div className="grid grid-cols-2 gap-2">
                <label className={lab}>{tx('Notice given on', 'नोटिस कब दिया')}<input type="date" className={inp} value={notice.on} max={todayIst()} onChange={e => setNotice(n => ({ ...n, on: e.target.value }))} /></label>
                <label className={lab}>{tx('By', 'किसने')}<select className={inp} value={notice.by} onChange={e => setNotice(n => ({ ...n, by: e.target.value }))}><option value="TENANT">{tx('Tenant', 'किरायेदार')}</option><option value="OWNER">{tx('Owner', 'मालिक')}</option></select></label>
              </div>
              <button type="button" className={`${dark} w-full`} disabled={busy === 'notice'} data-testid="rent-notice-save" onClick={() => run('notice', () => api.rentNotice(t.id, notice), tx('Notice recorded', 'नोटिस दर्ज हुआ'))}>{tx('Record the notice', 'नोटिस दर्ज करें')}</button>
            </div>
          )}
          {pane === 'vacate' && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3" data-testid="rent-vacate-pane">
              <label className={lab}>{tx('Tenant left on', 'किरायेदार कब गया')}<input type="date" className={inp} value={vacate.on} max={todayIst()} onChange={e => setVacate(v => ({ ...v, on: e.target.value }))} /></label>
              <label className={lab}>{tx('Deposit (what happened)', 'डिपॉज़िट (क्या हुआ)')}<input className={inp} value={vacate.depositNote} maxLength={RENT_LIMITS.note} onChange={e => setVacate(v => ({ ...v, depositNote: e.target.value }))} placeholder={tx('Full deposit returned', 'पूरा डिपॉज़िट लौटाया')} data-testid="rent-vacate-note" /></label>
              <button type="button" className={`${dark} w-full`} disabled={busy === 'vacate'} data-testid="rent-vacate-save" onClick={() => run('vacate', () => api.rentVacate(t.id, { on: vacate.on, ...(vacate.depositNote ? { depositNote: vacate.depositNote } : {}) }), tx('Recorded. You can put the home back on GENZ now.', 'दर्ज हुआ। अब घर दोबारा GENZ पर डाल सकते हैं।'))}>{tx('Record vacating', 'ख़ाली होना दर्ज करें')}</button>
            </div>
          )}

          {/* re-let: his rented listing goes back on the network (verification again) */}
          {ended && t.property?.mine && t.property.status === 'rented' && !t.property.relisted && (
            pane !== 'relist' ? (
              <button type="button" className={`${green} w-full`} onClick={() => setPane('relist')} data-testid="rent-relist"><HomeIcon className="h-4 w-4" />{tx('Put this home back on GENZ for rent', 'ये घर दोबारा किराये के लिए GENZ पर डालें')}</button>
            ) : (
              <div className="space-y-2 rounded-xl bg-emerald-50 p-3" data-testid="rent-relist-pane">
                <label className={lab}>{tx('Rent to ask ₹', 'माँगा किराया ₹')}<input className={inp} value={relist.rent} onChange={e => setRelist(r => ({ ...r, rent: e.target.value }))} inputMode="numeric" data-testid="rent-relist-rent" /></label>
                {t.property.purged && <>
                  <label className={lab}>{tx('Owner’s mobile', 'मालिक का मोबाइल')}<input className={inp} value={relist.ownerPhone} inputMode="numeric" maxLength={14} onChange={e => setRelist(r => ({ ...r, ownerPhone: e.target.value }))} /></label>
                  <label className={lab}>{tx('Full address (the old one was erased)', 'पूरा पता (पुराना मिट गया था)')}<input className={inp} value={relist.address} maxLength={300} onChange={e => setRelist(r => ({ ...r, address: e.target.value }))} /></label>
                </>}
                <p className="text-xs text-slate-600">{tx('A new listing is made; GENZ verifies it again before it shows on the network.', 'नई लिस्टिंग बनेगी; नेटवर्क पर दिखने से पहले GENZ उसे फिर जाँचेगा।')}</p>
                <button type="button" className={`${dark} w-full`} disabled={busy === 'relist'} data-testid="rent-relist-save" onClick={async () => {
                  setBusy('relist');
                  try {
                    await api.lsRelist(t.property.id, { confirm: true, askingPrice: num(relist.rent), ...(t.property.purged ? { ownerName: t.ownerName, ownerPhone: relist.ownerPhone, addressHidden: relist.address } : {}) });
                    setPane(''); onChanged(null, tx('The home is listed again — waiting for verification.', 'घर दोबारा लिस्ट हुआ — वेरिफ़िकेशन बाक़ी।')); onReload();
                  } catch (e: any) { onError(e.message); } finally { setBusy(''); }
                }}>{tx('List it again', 'दोबारा लिस्ट करें')}</button>
              </div>
            )
          )}

          {/* edit / history / delete */}
          {!t.erasedAt && (
            <div className="flex flex-wrap gap-2">
              {!ended && <button type="button" className={light} onClick={() => setPane(p => p === 'edit' ? '' : 'edit')} data-testid="rent-edit"><Pencil className="h-4 w-4" />{tx('Edit', 'बदलें')}</button>}
              <button type="button" className={light} onClick={() => setPane(p => p === 'history' ? '' : 'history')} data-testid="rent-history">{tx('History', 'इतिहास')}</button>
              {!t.renewals.length && (askDel
                ? <span className="ml-auto inline-flex items-center gap-1"><button type="button" className="inline-flex min-h-11 items-center rounded-lg bg-red-600 px-3 text-sm font-semibold text-white" onClick={() => { setAskDel(false); run('del', () => api.rentDelete(t.id), tx('Deleted', 'हटा दिया')); }} data-testid="rent-del-yes">{tx('Delete', 'हटाएँ')}</button><button type="button" className={light} onClick={() => setAskDel(false)}>{tx('Keep', 'रहने दें')}</button></span>
                : <button type="button" className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-slate-500" onClick={() => setAskDel(true)} data-testid="rent-del" aria-label={tx('Delete (made by mistake)', 'हटाएँ (ग़लती से बना)')}><Trash2 className="h-4 w-4" /></button>)}
            </div>
          )}
          {pane === 'edit' && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3" data-testid="rent-edit-pane">
              <div className="grid grid-cols-3 gap-2">
                <label className={lab}>{tx('Rent ₹', 'किराया ₹')}<input className={inp} value={edit.rent} onChange={e => setEdit(x => ({ ...x, rent: e.target.value }))} inputMode="numeric" /></label>
                <label className={lab}>{tx('Deposit ₹', 'डिपॉज़िट ₹')}<input className={inp} value={edit.deposit} onChange={e => setEdit(x => ({ ...x, deposit: e.target.value }))} inputMode="numeric" /></label>
                <label className={lab}>{tx('Maint. ₹', 'मेंटे. ₹')}<input className={inp} value={edit.maintenance} onChange={e => setEdit(x => ({ ...x, maintenance: e.target.value }))} inputMode="numeric" /></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className={lab}>{tx('Owner’s mobile', 'मालिक का मोबाइल')}<input className={inp} value={edit.ownerPhone} onChange={e => setEdit(x => ({ ...x, ownerPhone: e.target.value }))} inputMode="numeric" /></label>
                <label className={lab}>{tx('Tenant’s mobile', 'किरायेदार का मोबाइल')}<input className={inp} value={edit.tenantPhone} onChange={e => setEdit(x => ({ ...x, tenantPhone: e.target.value }))} inputMode="numeric" /></label>
                <label className={lab}>{tx('Agreement', 'अनुबंध')}<select className={inp} value={edit.agreement} onChange={e => setEdit(x => ({ ...x, agreement: e.target.value }))} data-testid="rent-edit-agreement">{AGREEMENT_STEPS.map(a => <option key={a.id} value={a.id}>{hi ? a.hi : a.en}</option>)}</select></label>
                <label className={lab}>{tx('E-stamp no.', 'ई-स्टाम्प नं.')}<input className={inp} value={edit.stampRef} maxLength={RENT_LIMITS.ref} onChange={e => setEdit(x => ({ ...x, stampRef: e.target.value }))} /></label>
                <label className={lab}>{tx('Keys handed over', 'चाबी कब दी')}<input type="date" className={inp} value={edit.keysOn} max={todayIst()} onChange={e => setEdit(x => ({ ...x, keysOn: e.target.value }))} /></label>
                <label className={lab}>{tx('Meter readings / fittings', 'मीटर रीडिंग / फ़िटिंग')}<input className={inp} value={edit.meterNote} maxLength={RENT_LIMITS.note} onChange={e => setEdit(x => ({ ...x, meterNote: e.target.value }))} /></label>
              </div>
              <button type="button" className={`${dark} w-full`} disabled={busy === 'edit'} data-testid="rent-edit-save" onClick={() => run('edit', () => api.rentPatch(t.id, {
                rent: num(edit.rent), deposit: num(edit.deposit), ...(edit.maintenance ? { maintenance: num(edit.maintenance) } : {}), ownerPhone: edit.ownerPhone, tenantPhone: edit.tenantPhone,
                agreement: edit.agreement, ...(edit.stampRef ? { stampRef: edit.stampRef } : {}), ...(edit.keysOn ? { keysOn: edit.keysOn } : {}), ...(edit.meterNote ? { meterNote: edit.meterNote } : {}),
              }), tx('Saved', 'सेव हुआ'))}>{tx('Save changes', 'बदलाव सेव करें')}</button>
            </div>
          )}
          {pane === 'history' && (
            <ul className="space-y-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-700" data-testid="rent-history-pane">
              {[...t.history].reverse().map((h: any, i: number) => <li key={i}><span className="text-slate-500">{new Date(h.at).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' })}</span> · {h.what}</li>)}
            </ul>
          )}
        </div>
      )}
    </article>
  );
};
const nextDay = (d: string) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
