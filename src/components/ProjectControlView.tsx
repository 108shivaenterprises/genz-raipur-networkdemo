import React, { useCallback, useEffect, useState } from 'react';
import { BuilderLaunchPanel } from './LaunchDesk.js';
import { Loader2, ArrowLeft, PauseCircle, PlayCircle, Ban, CheckCircle2, XCircle, Megaphone, FileText, Settings, UserCheck, Users, Trash2, ShieldCheck, Lock, Unlock, MessageCircle, Camera, X } from 'lucide-react';
import { openPartnerChat } from './PartnerChat.js';
import { preparePhoto } from '../lib/photoFile.js';
import { api } from '../lib/api.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { formatINR } from '../lib/utils.js';
import type { UserProfile } from '../types/index.js';
import { PASS_ON, AUDIENCES, passOf } from '../shared/docRules.js';

const inp = 'min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
const btn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-4 text-xs font-semibold disabled:opacity-50';
const dark = `${btn} bg-slate-900 text-white`;
const ghost = `${btn} border border-slate-300 bg-white text-slate-700`;
/** v61 — open the chat with this partner (made on first use) */
const ChatBtn: React.FC<{ withId: string }> = ({ withId }) => {
  const tx = useTx(); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  return (
    <>
      <button type="button" className={ghost} disabled={busy} data-testid={`pcv-chat-${withId}`} onClick={async () => { setBusy(true); setErr(''); try { await openPartnerChat(withId); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}{tx('Chat', 'चैट')}
      </button>
      {err && <span className="text-xs text-red-700">{err}</span>}
    </>
  );
};
const days = (iso?: string) => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000)) : null);

const Chip: React.FC<{ tone: 'green' | 'amber' | 'red' | 'slate' | 'blue'; children: React.ReactNode }> = ({ tone, children }) => {
  const c = { green: 'bg-emerald-100 text-emerald-800', amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-700', slate: 'bg-slate-100 text-slate-600', blue: 'bg-sky-100 text-sky-800' }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${c}`}>{children}</span>;
};

/** one-line "type a reason, then confirm" form used for decline / pause / revoke / reject */
const ReasonForm: React.FC<{ label: string; confirm: string; min?: number; extra?: React.ReactNode; onSubmit: (reason: string) => Promise<void>; onCancel: () => void }> = ({ label, confirm, min = 3, extra, onSubmit, onCancel }) => {
  const [v, setV] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
      <input autoFocus value={v} onChange={e => setV(e.target.value)} placeholder={label} className={inp} maxLength={200} />
      {extra}
      <div className="flex gap-2">
        <button disabled={busy || v.trim().length < min} onClick={async () => { setBusy(true); try { await onSubmit(v.trim()); } finally { setBusy(false); } }} className={dark}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirm}</button>
        <button onClick={onCancel} className={ghost}>×</button>
      </div>
    </div>
  );
};

type Sub = 'partners' | 'verify' | 'notices' | 'settings' | 'staff';

export const ProjectControlView: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const tx = useTx();
  const [list, setList] = useState<any[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const loadList = useCallback(() => api.pcProjects().then(r => setList(r.projects)).catch(e => setErr(e.message)), []);
  useEffect(() => { loadList(); }, [loadList]);
  if (err) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (!list) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  if (sel) return <ProjectRoom id={sel} canWrite={currentUser.role !== 'ADMIN'} onBack={() => { setSel(null); loadList(); }} />;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{tx('Partners & rules', 'पार्टनर और नियम')}</h2>
        <p className="text-xs text-slate-500">{tx('You decide who sells each project, on what terms, and which leads are accepted.', 'हर प्रोजेक्ट कौन बेचेगा, किस शर्त पर, और कौन-सी लीड मंज़ूर होगी — यह आप तय करते हैं।')}</p>
      </div>
      {currentUser.role === 'DEVELOPER_BUILDER' && <BuilderLaunchPanel />}
      {list.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{tx('No projects yet. Launch a project from Builder Launchpad first.', 'अभी कोई प्रोजेक्ट नहीं। पहले Builder Launchpad से प्रोजेक्ट लॉन्च करें।')}</div>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {list.map(p => (
          <button key={p.id} onClick={() => setSel(p.id)} className="w-full min-w-0 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-slate-400">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900">{p.projectName}</div><div className="text-xs text-slate-500">{p.locality}, {p.city}{p.builderName && currentUser.role === 'ADMIN' ? ` · ${p.builderName}` : ''}</div></div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {p.leadIntake === 'PAUSED' ? <Chip tone="red">{tx('Intake paused', 'लीड बंद')}</Chip> : <Chip tone="green">{tx('Taking leads', 'लीड चालू')}</Chip>}
                {p.access === 'INVITE_ONLY' && <Chip tone="slate">{tx('Invite-only', 'सिर्फ़ इनवाइट')}</Chip>}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[[p.partners, tx('Partners', 'पार्टनर'), false], [p.applications + p.shortlisted, tx('Requests', 'रिक्वेस्ट'), p.applications > 0], [p.pendingVerification, tx('To verify', 'वेरिफाई'), p.pendingVerification > 0], [p.pendingBookings, tx('Bookings', 'बुकिंग'), p.pendingBookings > 0]].map(([n, l, hot], i) => (
                <div key={i} className={`rounded-lg p-2 ${hot ? 'bg-amber-50' : 'bg-slate-50'}`}><div className={`text-lg font-bold ${hot ? 'text-amber-700' : 'text-slate-900'}`}>{n as number}</div><div className="text-[10px] text-slate-500">{l as string}</div></div>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-slate-500">{p.openLeads} {tx('open leads', 'खुली लीड')} · {p.leads} {tx('total', 'कुल')}{p.leadVerification === 'MANUAL' ? ` · ${tx('lead check ON', 'लीड चेक चालू')}` : ''}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

const ProjectRoom: React.FC<{ id: string; canWrite: boolean; onBack: () => void }> = ({ id, canWrite, onBack }) => {
  const tx = useTx();
  const [d, setD] = useState<any>(null);
  const [sub, setSub] = useState<Sub>('partners');
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const flash = (ok: boolean, msg: string) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 4000); };
  const load = useCallback(() => api.pcProject(id).then(setD).catch(e => flash(false, e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  const act = async (fn: () => Promise<any>, ok: string) => { try { await fn(); flash(true, ok); await load(); } catch (e: any) { flash(false, e.message); throw e; } };
  if (!d) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  const p = d.project;
  const pending = d.partners.filter((m: any) => ['APPLIED', 'SHORTLISTED'].includes(m.status)).length;
  const tabs: [Sub, string, string, React.ElementType, number][] = [
    ['partners', 'Partners', 'पार्टनर', Users, pending],
    ['verify', 'Verify leads', 'लीड वेरिफाई', UserCheck, d.verification.length],
    ['notices', 'Notices & files', 'सूचना और फ़ाइलें', Megaphone, 0],
    ['settings', 'Rules', 'नियम', Settings, 0],
    ['staff', 'My staff', 'मेरा स्टाफ', ShieldCheck, 0],
  ];
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-slate-600"><ArrowLeft className="h-4 w-4" /> {tx('All projects', 'सभी प्रोजेक्ट')}</button>
      <div className="rounded-xl bg-slate-900 p-4 text-white">
        <div className="text-base font-bold">{p.projectName}</div>
        <div className="text-xs text-slate-300">{p.locality}, {p.city} · {formatINR(p.priceStartingFrom)}–{formatINR(p.priceMax)} · {p.channelPartnerCommissionPct}% {tx('default commission', 'डिफ़ॉल्ट कमीशन')}</div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded bg-white/10 px-2 py-0.5">{d.summary.leads} {tx('leads', 'लीड')} · {d.summary.open} {tx('open', 'खुली')} · {d.summary.booked} {tx('booked', 'बुक')}</span>
          <span className="rounded bg-white/10 px-2 py-0.5">{d.units.total ? <>{d.units.AVAILABLE}/{d.units.total} {tx('units free', 'यूनिट खाली')}</> : <>{d.project.availableUnits}/{d.project.totalUnits} {tx('units free · unit list not added yet (Associates CRM → Inventory)', 'यूनिट खाली · यूनिट लिस्ट अभी नहीं डाली (एसोसिएट्स CRM → इन्वेंटरी)')}</>}</span>
          <span className="rounded bg-white/10 px-2 py-0.5" title={tx('Brokers have lined up these clients for your project (names stay private)', 'ब्रोकर्स ने इन क्लाइंट्स को आपके प्रोजेक्ट के लिए शॉर्टलिस्ट किया है (नाम निजी रहते हैं)')}>★ {d.demand.clients} {tx('clients shortlisted by', 'क्लाइंट शॉर्टलिस्ट —')} {d.demand.partners} {tx('brokers', 'ब्रोकर')}</span>
        </div>
        {p.leadIntake === 'PAUSED' && <div className="mt-2 rounded bg-red-500/20 px-2 py-1 text-[11px] text-red-100">⏸ {tx('New lead registrations are paused', 'नई लीड रजिस्ट्रेशन बंद है')}{p.intakeNote ? ` — ${p.intakeNote}` : ''}</div>}
      </div>
      {!canWrite && <p className="rounded-lg bg-slate-100 p-2 text-xs text-slate-600">{tx('Read-only (admin oversight).', 'सिर्फ़ देखने के लिए (एडमिन निगरानी)।')}</p>}
      {toast && <div className={`rounded-lg px-3 py-2 text-xs font-medium ${toast.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} role="status">{toast.msg}</div>}
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
        {tabs.map(([k, en, hi, Icon, n]) => (
          <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)} className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-semibold ${sub === k ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>
            <Icon className="h-4 w-4" />{tx(en, hi)}{n > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{n}</span>}
          </button>
        ))}
      </div>
      {sub === 'partners' && <PartnersTab d={d} canWrite={canWrite} act={act} />}
      {sub === 'verify' && <VerifyTab d={d} canWrite={canWrite} act={act} />}
      {sub === 'notices' && <NoticesTab d={d} canWrite={canWrite} act={act} />}
      {sub === 'settings' && <RulesTab d={d} canWrite={canWrite} act={act} />}
      {sub === 'staff' && <StaffTab d={d} canWrite={canWrite} act={act} />}
    </div>
  );
};

type TabProps = { d: any; canWrite: boolean; act: (fn: () => Promise<any>, ok: string) => Promise<void> };

const PartnersTab: React.FC<TabProps> = ({ d, canWrite, act }) => {
  const tx = useTx();
  const [open, setOpen] = useState<{ id: string; mode: 'approve' | 'decline' | 'shortlist' | 'pause' | 'revoke' | 'terms' } | null>(null);
  const [f, setF] = useState({ pct: String(d.project.channelPartnerCommissionPct), quota: '5', cap: '', until: '', note: '' });
  const [take, setTake] = useState(false);
  const reqs = d.partners.filter((m: any) => ['APPLIED', 'SHORTLISTED'].includes(m.status));
  const live = d.partners.filter((m: any) => ['ACTIVE_ASSOCIATE', 'TOP_PERFORMER', 'PAUSED'].includes(m.status));
  const past = d.partners.filter((m: any) => ['DECLINED', 'REVOKED', 'COMPLETED', 'INVITED'].includes(m.status));
  const openFor = (m: any, mode: any) => { setOpen({ id: m.id, mode }); setTake(false); setF({ pct: String(m.agreedCommissionPct ?? d.project.channelPartnerCommissionPct), quota: String(m.targetUnitsQuota ?? 5), cap: m.dailyLeadCap ? String(m.dailyLeadCap) : '', until: m.validUntil ? m.validUntil.slice(0, 10) : '', note: '' }); };
  const termsFields = (needNote: boolean) => (
    <div className="grid grid-cols-2 gap-2">
      <label className="text-[11px] text-slate-600">{tx('Commission %', 'कमीशन %')}<input inputMode="decimal" value={f.pct} onChange={e => setF({ ...f, pct: e.target.value })} className={inp} /></label>
      <label className="text-[11px] text-slate-600">{tx('Target units', 'टारगेट यूनिट')}<input inputMode="numeric" value={f.quota} onChange={e => setF({ ...f, quota: e.target.value })} className={inp} /></label>
      <label className="text-[11px] text-slate-600">{tx('Max new leads / day', 'रोज़ अधिकतम नई लीड')}<input inputMode="numeric" placeholder={tx('no limit', 'कोई सीमा नहीं')} value={f.cap} onChange={e => setF({ ...f, cap: e.target.value })} className={inp} /></label>
      <label className="text-[11px] text-slate-600">{tx('Partnership ends on', 'साझेदारी समाप्ति')}<input type="date" value={f.until} onChange={e => setF({ ...f, until: e.target.value })} className={inp} /></label>
      {needNote && <label className="col-span-2 text-[11px] text-slate-600">{tx('Why (partner will see this)', 'कारण (पार्टनर को दिखेगा)')}<input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} className={inp} maxLength={200} /></label>}
    </div>
  );
  const terms = () => ({ commissionPct: Number(f.pct), quota: Number(f.quota), dailyLeadCap: f.cap ? Number(f.cap) : null, validUntil: f.until ? new Date(f.until + 'T23:59:59').toISOString() : null });
  return (
    <div className="space-y-5">
      {reqs.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900">{tx('Requests to sell your project', 'आपका प्रोजेक्ट बेचने की रिक्वेस्ट')}</h3>
          {reqs.map((m: any) => (
            <div key={m.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><div className="text-sm font-bold text-slate-900">{m.brokerName}</div><div className="text-[11px] text-slate-500">{m.brokerCompany} · {m.brokerCity || '—'} · RERA {m.brokerRera || '—'}</div></div>
                <Chip tone={m.status === 'SHORTLISTED' ? 'blue' : 'amber'}>{m.status === 'SHORTLISTED' ? tx('Shortlisted', 'शॉर्टलिस्ट') : tx('New request', 'नई रिक्वेस्ट')}</Chip>
              </div>
              {m.appliedNote && <p className="mt-1 text-xs text-slate-700">“{m.appliedNote}”</p>}
              {canWrite && open?.id !== m.id && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => openFor(m, 'approve')} className={dark}><CheckCircle2 className="h-4 w-4" />{tx('Approve', 'मंज़ूर')}</button>
                  {m.status === 'APPLIED' && <button onClick={() => openFor(m, 'shortlist')} className={ghost}>★ {tx('Shortlist', 'शॉर्टलिस्ट')}</button>}
                  <button onClick={() => openFor(m, 'decline')} className={ghost}><XCircle className="h-4 w-4" />{tx('Decline', 'मना करें')}</button>
                  <ChatBtn withId={m.brokerId} />
                </div>
              )}
              {open?.id === m.id && open?.mode === 'approve' && (
                <div className="mt-2 space-y-2 rounded-lg bg-white p-3">{termsFields(false)}
                  <div className="flex gap-2"><button className={dark} onClick={() => act(() => api.pcDecide(m.id, { action: 'APPROVE', ...terms() }), tx('Partner approved', 'पार्टनर मंज़ूर')).then(() => setOpen(null)).catch(() => undefined)}>{tx('Approve with these terms', 'इन शर्तों पर मंज़ूर करें')}</button><button className={ghost} onClick={() => setOpen(null)}>×</button></div></div>
              )}
              {open?.id === m.id && open?.mode === 'shortlist' && <ReasonForm label={tx('Note for the partner (optional)', 'पार्टनर के लिए नोट (वैकल्पिक)')} min={0} confirm={tx('Shortlist', 'शॉर्टलिस्ट')} onCancel={() => setOpen(null)} onSubmit={r => act(() => api.pcDecide(m.id, { action: 'SHORTLIST', note: r }), tx('Shortlisted', 'शॉर्टलिस्ट हुआ')).then(() => setOpen(null))} />}
              {open?.id === m.id && open?.mode === 'decline' && <ReasonForm label={tx('Reason (partner will see it)', 'कारण (पार्टनर को दिखेगा)')} confirm={tx('Decline', 'मना करें')} onCancel={() => setOpen(null)} onSubmit={r => act(() => api.pcDecide(m.id, { action: 'DECLINE', note: r }), tx('Declined', 'मना किया')).then(() => setOpen(null))} />}
            </div>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-bold text-slate-900">{tx('Your sales partners', 'आपके सेल्स पार्टनर')} ({live.length})</h3>
        {live.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">{tx('No active partners. Brokers can apply from “My Projects”, or appoint one from Builder Launchpad.', 'कोई सक्रिय पार्टनर नहीं। ब्रोकर “My Projects” से अप्लाई कर सकते हैं, या Builder Launchpad से नियुक्त करें।')}</p>}
        {live.map((m: any) => {
          const c = m.card;
          return (
            <div key={m.id} className={`rounded-xl border bg-white p-3 ${m.status === 'PAUSED' ? 'border-amber-300' : 'border-slate-200'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900">{m.brokerName}</div><div className="text-[11px] text-slate-500">{m.brokerCompany} · RERA {m.brokerRera || '—'}</div></div>
                <div className="flex flex-wrap gap-1">
                  {m.status === 'PAUSED' ? <Chip tone="amber">{tx('Paused', 'रुका हुआ')}</Chip> : <Chip tone="green">{tx('Active', 'सक्रिय')}</Chip>}
                  {c.flag === 'INACTIVE' && <Chip tone="red">{tx('Inactive', 'निष्क्रिय')} {c.inactiveDays}d</Chip>}
                  {c.flag === 'QUIET' && <Chip tone="amber">{tx('Quiet', 'शांत')} {c.inactiveDays}d</Chip>}
                  {m.pendingBookings > 0 && <Chip tone="blue">{m.pendingBookings} {tx('booking(s) waiting', 'बुकिंग इंतज़ार में')}</Chip>}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-600">{m.agreedCommissionPct}% · {tx('target', 'टारगेट')} {m.unitsSold}/{m.targetUnitsQuota} · {m.dailyLeadCap ? `${m.leadsToday}/${m.dailyLeadCap} ${tx('leads today', 'आज की लीड')}` : tx('no daily limit', 'रोज़ की सीमा नहीं')}{m.validUntil ? ` · ${tx('till', 'तक')} ${new Date(m.validUntil).toLocaleDateString('en-IN')}` : ''}</div>
              <div className="mt-2 grid grid-cols-5 gap-1 text-center text-[10px] text-slate-500">
                {[[c.leads, tx('Leads', 'लीड')], [c.active, tx('Active', 'सक्रिय')], [c.visits, tx('Visited', 'विज़िट')], [c.booked, tx('Booked', 'बुक')], [`${c.conversionPct}%`, tx('Conv.', 'कन्वर्ज़न')]].map(([n, l], i) => <div key={i} className="rounded bg-slate-50 py-1.5"><div className="text-sm font-bold text-slate-900">{n}</div>{l}</div>)}
              </div>
              {m.statusReason && <p className="mt-1 text-[11px] text-amber-700">{m.statusReason}</p>}
              {canWrite && open?.id !== m.id && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.status === 'PAUSED'
                    ? <button className={ghost} onClick={() => act(() => api.pcStatus(m.id, { action: 'RESUME' }), tx('Resumed', 'फिर से चालू')).catch(() => undefined)}><PlayCircle className="h-4 w-4" />{tx('Resume', 'चालू करें')}</button>
                    : <button className={ghost} onClick={() => openFor(m, 'pause')}><PauseCircle className="h-4 w-4" />{tx('Pause', 'रोकें')}</button>}
                  <ChatBtn withId={m.brokerId} />
                  <button className={ghost} onClick={() => openFor(m, 'terms')}>{tx('Edit terms', 'शर्तें बदलें')}</button>
                  <button className={`${ghost} !text-red-700`} onClick={() => openFor(m, 'revoke')}><Ban className="h-4 w-4" />{tx('End partnership', 'साझेदारी खत्म')}</button>
                </div>
              )}
              {open?.id === m.id && open?.mode === 'pause' && <ReasonForm label={tx('Reason (partner will see it)', 'कारण (पार्टनर को दिखेगा)')} confirm={tx('Pause partner', 'पार्टनर रोकें')} onCancel={() => setOpen(null)} onSubmit={r => act(() => api.pcStatus(m.id, { action: 'PAUSE', reason: r }), tx('Paused', 'रोका गया')).then(() => setOpen(null))} />}
              {open?.id === m.id && open?.mode === 'revoke' && <ReasonForm min={5} label={tx('Reason (min 5 characters)', 'कारण (कम से कम 5 अक्षर)')} confirm={tx('End partnership', 'साझेदारी खत्म करें')} onCancel={() => setOpen(null)}
                extra={<label className="flex items-start gap-2 text-[11px] text-slate-600"><input type="checkbox" checked={take} onChange={e => setTake(e.target.checked)} className="mt-0.5" />{tx('Also take this partner\'s open leads back to the builder desk. (Otherwise their registered leads stay theirs until protection ends — the fair default.)', 'इस पार्टनर की खुली लीड बिल्डर डेस्क पर वापस लें। (नहीं तो प्रोटेक्शन खत्म होने तक उनकी रजिस्टर्ड लीड उन्हीं की रहती हैं — यही निष्पक्ष तरीका है।)')}</label>}
                onSubmit={r => act(() => api.pcStatus(m.id, { action: 'REVOKE', reason: r, takeOpenLeads: take }), tx('Partnership ended', 'साझेदारी खत्म')).then(() => setOpen(null))} />}
              {open?.id === m.id && open?.mode === 'terms' && (
                <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">{termsFields(true)}
                  <p className="text-[10px] text-slate-500">{tx('New commission applies to bookings requested from now on; earlier bookings keep their rate.', 'नया कमीशन अब से माँगी गई बुकिंग पर लागू होगा; पुरानी बुकिंग की दर वही रहेगी।')}</p>
                  <div className="flex gap-2"><button className={dark} disabled={f.note.trim().length < 3} onClick={() => act(() => api.pcTerms(m.id, { ...terms(), note: f.note }), tx('Terms updated', 'शर्तें बदलीं')).then(() => setOpen(null)).catch(() => undefined)}>{tx('Save terms', 'शर्तें सेव करें')}</button><button className={ghost} onClick={() => setOpen(null)}>×</button></div></div>
              )}
            </div>
          );
        })}
      </section>

      {past.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white p-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-600">{tx('Past / declined', 'पुराने / मना किए')} ({past.length})</summary>
          <ul className="mt-2 divide-y divide-slate-100 text-xs">{past.map((m: any) => <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="font-medium">{m.brokerName}</span><span className="text-slate-500">{m.status.toLowerCase()}{m.statusReason ? ` — ${m.statusReason}` : ''}</span></li>)}</ul>
        </details>
      )}
    </div>
  );
};

const VerifyTab: React.FC<TabProps> = ({ d, canWrite, act }) => {
  const tx = useTx();
  const [rej, setRej] = useState<string | null>(null);
  const hoursLeft = (l: any) => Math.max(0, Math.round((Date.parse(l.verifyDueAt) - Date.now()) / 3600000));
  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{d.project.leadVerification === 'MANUAL'
        ? tx('Lead check is ON: every lead a partner registers waits here. If you do not respond in 48 hours it is accepted automatically, so partners are never stuck.', 'लीड चेक चालू है: पार्टनर की हर लीड यहाँ इंतज़ार करती है। 48 घंटे में जवाब न दें तो अपने आप मंज़ूर हो जाती है, ताकि पार्टनर अटकें नहीं।')
        : tx('Lead check is OFF — leads are accepted instantly. Turn it on in “Rules” to review each lead.', 'लीड चेक बंद है — लीड तुरंत मंज़ूर होती हैं। हर लीड देखने के लिए “नियम” में चालू करें।')}</p>
      {d.verification.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{tx('Nothing waiting.', 'कुछ इंतज़ार में नहीं।')}</p>}
      {d.verification.map((l: any) => (
        <div key={l.id} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-bold">{l.name}</div><div className="text-[11px] text-slate-500">{l.phone} · {l.unitInterest || '—'} · {tx('via', 'द्वारा')} {l.associateName}</div></div><Chip tone="amber">{hoursLeft(l)}h {tx('to auto-accept', 'में ऑटो-मंज़ूर')}</Chip></div>
          {canWrite && rej !== l.id && <div className="mt-2 flex gap-2"><button className={dark} onClick={() => act(() => api.pcVerify(l.id, { decision: 'ACCEPT' }), tx('Lead accepted', 'लीड मंज़ूर')).catch(() => undefined)}><CheckCircle2 className="h-4 w-4" />{tx('Accept', 'मंज़ूर')}</button><button className={ghost} onClick={() => setRej(l.id)}><XCircle className="h-4 w-4" />{tx('Reject', 'अस्वीकार')}</button></div>}
          {rej === l.id && <ReasonForm label={tx('Reason (e.g. already our client)', 'कारण (जैसे: पहले से हमारा क्लाइंट)')} confirm={tx('Reject lead', 'लीड अस्वीकार')} onCancel={() => setRej(null)} onSubmit={r => act(() => api.pcVerify(l.id, { decision: 'REJECT', note: r }), tx('Lead rejected', 'लीड अस्वीकार')).then(() => setRej(null))} />}
        </div>
      ))}
    </div>
  );
};

/** v77 — pick the partners who get a paper personally */
const PartnerPick: React.FC<{ partners: any[]; value: string[]; onChange: (v: string[]) => void }> = ({ partners, value, onChange }) => {
  const tx = useTx();
  if (partners.length === 0) return <p className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900">{tx('You have no appointed partners on this project yet — appoint one first, then share a paper with him personally.', 'इस प्रोजेक्ट पर अभी कोई नियुक्त पार्टनर नहीं — पहले नियुक्त करें, फिर उसे निजी तौर पर काग़ज़ दें।')}</p>;
  return (
    <div className="space-y-1 rounded-lg bg-slate-50 p-2" data-testid="doc-partners">
      <div className="text-[11px] font-semibold text-slate-700">{tx('Share personally with', 'निजी तौर पर किसे दें')}</div>
      {partners.map((m: any) => (
        <label key={m.brokerId} className="flex min-h-9 items-center gap-2 text-xs text-slate-800"><input type="checkbox" className="h-4 w-4" checked={value.includes(m.brokerId)} onChange={e => onChange(e.target.checked ? [...value, m.brokerId] : value.filter(x => x !== m.brokerId))} />{m.brokerName}{m.brokerCompany ? <span className="text-slate-500"> · {m.brokerCompany}</span> : null}</label>
      ))}
    </div>
  );
};
/** v77 — how far the partner may pass a paper on */
const PassPick: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const tx = useTx();
  return (
    <div className="space-y-1" role="radiogroup" aria-label={tx('How far may it go', 'कितना आगे जा सकता है')} data-testid="doc-passon">
      <div className="text-[11px] font-semibold text-slate-700">{tx('How far may the partner pass it on?', 'पार्टनर इसे कितना आगे दे सकता है?')}</div>
      {PASS_ON.map(x => (
        <label key={x.id} className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border p-2 text-xs ${value === x.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
          <input type="radio" name="passon" className="mt-0.5 h-4 w-4" checked={value === x.id} onChange={() => onChange(x.id)} value={x.id} />
          <span><b className="block text-slate-900">{tx(x.en, x.hi)}</b><span className="text-slate-600">{tx(x.hintEn, x.hintHi)}</span></span>
        </label>))}
    </div>
  );
};
const DocScopeEditor: React.FC<{ f: any; partners: any[]; onSave: (b: any) => void }> = ({ f, partners, onSave }) => {
  const tx = useTx();
  const [aud, setAud] = useState<string>(f.audience); const [ids, setIds] = useState<string[]>(f.brokerIds || []); const [pass, setPass] = useState<string>(passOf(f)); const [note, setNote] = useState<string>(f.note || '');
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-2" data-testid="doc-editor">
      <select value={aud} onChange={e => setAud(e.target.value)} className={inp} aria-label={tx('Who gets it', 'किसे मिले')}>{AUDIENCES.map(a => <option key={a.id} value={a.id}>{tx(a.en, a.hi)}</option>)}</select>
      {aud === 'SELECTED' && <PartnerPick partners={partners} value={ids} onChange={setIds} />}
      <PassPick value={pass} onChange={setPass} />
      <input value={note} onChange={e => setNote(e.target.value)} placeholder={tx('A line for the partner (optional)', 'पार्टनर के लिए एक लाइन (वैकल्पिक)')} className={inp} maxLength={200} />
      <button type="button" disabled={aud === 'SELECTED' && ids.length === 0} className={dark} data-testid="doc-save" onClick={() => onSave({ audience: aud, passOn: pass, note: note.trim() || null, ...(aud === 'SELECTED' ? { brokerIds: ids } : {}) })}>{tx('Save', 'सेव')}</button>
    </div>
  );
};

const NoticesTab: React.FC<TabProps> = ({ d, canWrite, act }) => {
  const tx = useTx();
  const [n, setN] = useState({ kind: 'OFFER', title: '', body: '', audience: 'ASSOCIATES', validUntil: '' });
  const [photo, setPhoto] = useState<{ data: string; preview: string } | null>(null);
  const [photoErr, setPhotoErr] = useState('');
  const hi = useI18n().lang === 'hi';
  const [c, setC] = useState<{ title: string; kind: string; url: string; audience: string; passOn: string; note: string; brokerIds: string[] }>({ title: '', kind: 'BROCHURE', url: '', audience: 'ASSOCIATES', passOn: 'NONE', note: '', brokerIds: [] });
  const [editId, setEditId] = useState('');
  const KIND = ['OFFER', 'UPDATE', 'PRICE', 'LAUNCH', 'NOTICE'];
  const FK = ['BROCHURE', 'PRICE_LIST', 'PAYMENT_PLAN', 'RERA', 'LAYOUT', 'OTHER'];
  const aud = (a: string) => a === 'ALL_CPS' ? tx('All brokers', 'सभी ब्रोकर') : a === 'SELECTED' ? tx('Chosen partners', 'चुने पार्टनर') : tx('Partners only', 'सिर्फ़ पार्टनर');
  const partnersLive = (d.partners || []).filter((m: any) => ['ACTIVE_ASSOCIATE', 'TOP_PERFORMER', 'PAUSED'].includes(m.status));
  const passTxt = (p: string) => { const x = PASS_ON.find(y => y.id === p) || PASS_ON[0]; return tx(x.en, x.hi); };
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-bold">{tx('Notice board for partners', 'पार्टनर्स के लिए सूचना')}</h3>
        {canWrite && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            <div className="grid grid-cols-2 gap-2">
              <select value={n.kind} onChange={e => setN({ ...n, kind: e.target.value })} className={inp}>{KIND.map(k => <option key={k}>{k}</option>)}</select>
              <select value={n.audience} onChange={e => setN({ ...n, audience: e.target.value })} className={inp}><option value="ASSOCIATES">{tx('Partners only', 'सिर्फ़ पार्टनर')}</option><option value="ALL_CPS">{tx('All brokers', 'सभी ब्रोकर')}</option></select>
            </div>
            <input placeholder={tx('Title (e.g. Diwali offer: free parking)', 'शीर्षक (जैसे: दिवाली ऑफ़र)')} value={n.title} onChange={e => setN({ ...n, title: e.target.value })} className={inp} maxLength={120} />
            <textarea placeholder={tx('Details', 'विवरण')} value={n.body} onChange={e => setN({ ...n, body: e.target.value })} className={`${inp} min-h-20`} maxLength={1000} />
            <label className="block text-[11px] text-slate-600">{tx('Valid until (optional)', 'कब तक मान्य (वैकल्पिक)')}<input type="date" value={n.validUntil} onChange={e => setN({ ...n, validUntil: e.target.value })} className={inp} /></label>
            {/* v61 — one photo with the notice (offer poster, site progress) */}
            {photo ? (
              <div className="relative inline-block"><img src={photo.preview} alt="" className="max-h-40 rounded-lg" data-testid="pcv-notice-preview" /><button type="button" aria-label={tx('Remove the photo', 'फ़ोटो हटाएँ')} onClick={() => setPhoto(null)} className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow"><X className="h-4 w-4" /></button></div>
            ) : (
              <label className={`${ghost} cursor-pointer`} data-testid="pcv-notice-photo"><Camera className="h-4 w-4" />{tx('Add a photo (optional)', 'फ़ोटो जोड़ें (वैकल्पिक)')}
                <input type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setPhotoErr(''); try { setPhoto(await preparePhoto(f, hi)); } catch (x: any) { setPhotoErr(x.message); } }} />
              </label>
            )}
            {photoErr && <p className="text-xs text-red-700" role="alert">{photoErr}</p>}
            <button disabled={n.title.trim().length < 3} className={dark} onClick={() => act(() => api.pcNotice(d.project.id, { ...n, validUntil: n.validUntil || undefined, ...(photo ? { photo: photo.data } : {}) }), tx('Notice posted', 'सूचना भेजी')).then(() => { setN({ ...n, title: '', body: '', validUntil: '' }); setPhoto(null); }).catch(() => undefined)}>{tx('Post notice', 'सूचना डालें')}</button>
          </div>
        )}
        {d.updates.length === 0 && <p className="text-xs text-slate-500">{tx('No notices yet.', 'अभी कोई सूचना नहीं।')}</p>}
        {d.updates.map((u: any) => (
          <div key={u.id} className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><Chip tone="blue">{u.kind}</Chip><Chip tone="slate">{aud(u.audience)}</Chip>{u.validUntil && <span className="text-[10px] text-slate-500">{tx('till', 'तक')} {u.validUntil.slice(0, 10)}</span>}</div><div className="mt-1 text-sm font-semibold">{u.title}</div>{u.body && <p className="text-xs text-slate-600">{u.body}</p>}{u.photoId && <img src={`/api/pcontrol/notice-photo/${u.photoId}`} alt="" loading="lazy" className="mt-2 max-h-48 rounded-lg" data-testid="pcv-notice-img" />}</div>
            {canWrite && <button aria-label={tx('Delete', 'हटाएँ')} className="min-h-11 min-w-11 text-slate-400 hover:text-red-600" onClick={() => act(() => api.pcNoticeDelete(u.id), tx('Deleted', 'हटाया')).catch(() => undefined)}><Trash2 className="mx-auto h-4 w-4" /></button>}
          </div>
        ))}
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-bold">{tx('Brochures, price lists & documents (links)', 'ब्रोशर, प्राइस लिस्ट और दस्तावेज़ (लिंक)')}</h3>
        {canWrite && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            <input placeholder={tx('Name (e.g. Price list Oct 2026)', 'नाम (जैसे: प्राइस लिस्ट अक्टूबर)')} value={c.title} onChange={e => setC({ ...c, title: e.target.value })} className={inp} maxLength={100} />
            <input placeholder="https://drive.google.com/…" value={c.url} onChange={e => setC({ ...c, url: e.target.value })} className={inp} inputMode="url" />
            <div className="grid grid-cols-2 gap-2">
              <select value={c.kind} onChange={e => setC({ ...c, kind: e.target.value })} className={inp}>{FK.map(k => <option key={k}>{k}</option>)}</select>
              <select value={c.audience} onChange={e => setC({ ...c, audience: e.target.value })} className={inp} data-testid="doc-audience" aria-label={tx('Who gets it', 'किसे मिले')}>{AUDIENCES.map(a => <option key={a.id} value={a.id}>{tx(a.en, a.hi)}</option>)}</select>
            </div>
            {c.audience === 'SELECTED' && <PartnerPick partners={partnersLive} value={c.brokerIds} onChange={v => setC({ ...c, brokerIds: v })} />}
            <PassPick value={c.passOn} onChange={v => setC({ ...c, passOn: v })} />
            <input placeholder={tx('A line for the partner (optional) — e.g. rates valid till 30 Nov', 'पार्टनर के लिए एक लाइन (वैकल्पिक) — जैसे: रेट 30 नवंबर तक मान्य')} value={c.note} onChange={e => setC({ ...c, note: e.target.value })} className={inp} maxLength={200} />
            <p className="text-[10px] text-slate-500">{tx('Tip: for papers you do not want forwarded at all, use “Protected Docs” (view-only, watermarked) and share it with partners there.', 'जो कागज़ बिल्कुल फ़ॉरवर्ड नहीं होने चाहिए उनके लिए “Protected Docs” (सिर्फ़ देखना, वॉटरमार्क) इस्तेमाल करें।')}</p>
            <button disabled={c.title.trim().length < 2 || !c.url || (c.audience === 'SELECTED' && c.brokerIds.length === 0)} className={dark} data-testid="doc-add" onClick={() => act(() => api.pcFile(d.project.id, { title: c.title, kind: c.kind, url: c.url, audience: c.audience, passOn: c.passOn, ...(c.note.trim() ? { note: c.note.trim() } : {}), ...(c.audience === 'SELECTED' ? { brokerIds: c.brokerIds } : {}) }), tx('File added', 'फ़ाइल जोड़ी')).then(() => setC({ ...c, title: '', url: '', note: '' })).catch(() => undefined)}>{tx('Add file', 'फ़ाइल जोड़ें')}</button>
          </div>
        )}
        {d.collateral.map((f: any) => (
          <div key={f.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" data-testid="doc-row">
            <div className="flex items-center justify-between gap-2">
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 text-sm font-medium text-sky-800 underline"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{f.title}</span></a>
              {canWrite && <div className="flex items-center"><button type="button" className="min-h-11 shrink-0 whitespace-nowrap px-2 text-xs font-semibold text-slate-600 underline" onClick={() => setEditId(editId === f.id ? '' : f.id)} data-testid="doc-edit">{tx('Who / how far', 'किसे / कितना आगे')}</button><button aria-label={tx('Delete', 'हटाएँ')} className="min-h-11 min-w-11 text-slate-400 hover:text-red-600" onClick={() => act(() => api.pcFileDelete(d.project.id, f.id), tx('Removed', 'हटाया')).catch(() => undefined)}><Trash2 className="mx-auto h-4 w-4" /></button></div>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5"><Chip tone={f.audience === 'SELECTED' ? 'amber' : 'slate'}>{aud(f.audience)}{f.audience === 'SELECTED' ? ` (${(f.brokerIds || []).length})` : ''}</Chip><Chip tone={passOf(f) === 'CLIENT' ? 'green' : passOf(f) === 'TEAM' ? 'blue' : 'slate'}>{passTxt(passOf(f))}</Chip></div>
            {f.audience === 'SELECTED' && <p className="text-[11px] text-slate-600">{(f.brokerIds || []).map((id: string) => partnersLive.find((m: any) => m.brokerId === id)?.brokerName || id).join(', ')}</p>}
            {f.note && <p className="text-[11px] text-slate-600">“{f.note}”</p>}
            {editId === f.id && <DocScopeEditor f={f} partners={partnersLive} onSave={b => act(() => api.pcFilePatch(d.project.id, f.id, b), tx('Saved', 'सेव हुआ')).then(() => setEditId('')).catch(() => undefined)} />}
          </div>
        ))}
      </section>
    </div>
  );
};

const RulesTab: React.FC<TabProps> = ({ d, canWrite, act }) => {
  const tx = useTx();
  const label = useLabel();
  const p = d.project;
  const [s, setS] = useState({ access: p.access, leadIntake: p.leadIntake, intakeNote: p.intakeNote || '', leadVerification: p.leadVerification, registrationDays: String(p.registrationDays), visitProof: p.visitProof || 'OFF' });
  const [x, setX] = useState({ tagline: p.tagline || '', status: p.status, projectStage: p.projectStage, priceStartingFrom: String(p.priceStartingFrom), priceMax: String(p.priceMax), channelPartnerCommissionPct: String(p.channelPartnerCommissionPct), availableUnits: String(p.availableUnits), completionTarget: p.completionTarget || '' });
  const seg = (cur: string, val: string, label: string, onPick: () => void) => <button type="button" disabled={!canWrite} onClick={onPick} className={`min-h-11 flex-1 rounded-lg px-3 text-xs font-semibold ${cur === val ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>{label}</button>;
  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold">{tx('Who can work this project', 'यह प्रोजेक्ट कौन कर सकता है')}</h3>
        <div><div className="mb-1 text-[11px] font-semibold text-slate-600">{tx('Visibility', 'दिखना')}</div>
          <div className="flex gap-2">{seg(s.access, 'OPEN_APPLY', tx('Brokers can apply', 'ब्रोकर अप्लाई कर सकते हैं'), () => setS({ ...s, access: 'OPEN_APPLY' }))}{seg(s.access, 'INVITE_ONLY', tx('Invite-only (hidden)', 'सिर्फ़ इनवाइट (छुपा)'), () => setS({ ...s, access: 'INVITE_ONLY' }))}</div></div>
        <div><div className="mb-1 text-[11px] font-semibold text-slate-600">{tx('New lead registrations', 'नई लीड रजिस्ट्रेशन')}</div>
          <div className="flex gap-2">{seg(s.leadIntake, 'OPEN', tx('Open', 'चालू'), () => setS({ ...s, leadIntake: 'OPEN' }))}{seg(s.leadIntake, 'PAUSED', tx('Paused', 'बंद'), () => setS({ ...s, leadIntake: 'PAUSED' }))}</div>
          {s.leadIntake === 'PAUSED' && <input value={s.intakeNote} onChange={e => setS({ ...s, intakeNote: e.target.value })} placeholder={tx('Message to partners (e.g. site visit week)', 'पार्टनर्स को संदेश')} className={`${inp} mt-2`} maxLength={200} />}</div>
        <div><div className="mb-1 text-[11px] font-semibold text-slate-600">{tx('Lead check', 'लीड चेक')}</div>
          <div className="flex gap-2">{seg(s.leadVerification, 'AUTO', tx('Instant accept', 'तुरंत मंज़ूर'), () => setS({ ...s, leadVerification: 'AUTO' }))}{seg(s.leadVerification, 'MANUAL', tx('I verify each lead', 'मैं हर लीड देखूँगा'), () => setS({ ...s, leadVerification: 'MANUAL' }))}</div>
          <p className="mt-1 text-[10px] text-slate-500">{tx('Unreviewed leads are accepted after 48 hours.', 'बिना देखी लीड 48 घंटे बाद मंज़ूर हो जाती है।')}</p></div>
        <div><div className="mb-1 text-[11px] font-semibold text-slate-600">{tx('Site-visit proof', 'साइट विज़िट का सबूत')}</div>
          <div className="flex gap-2">{seg(s.visitProof, 'OFF', tx('Not required', 'ज़रूरी नहीं'), () => setS({ ...s, visitProof: 'OFF' }))}{seg(s.visitProof, 'QR_REQUIRED', tx('QR scan required', 'QR स्कैन ज़रूरी'), () => setS({ ...s, visitProof: 'QR_REQUIRED' }))}</div>
          <p className="mt-1 text-[10px] text-slate-500">{tx('Required = a new lead can reach “Site visited”, negotiation or booking only after your team scans the partner’s visit pass. Older leads are not affected.', 'ज़रूरी = नई लीड तभी “साइट विज़िटेड”, नेगोशिएशन या बुकिंग तक जाएगी जब आपकी टीम पार्टनर का विज़िट पास स्कैन करे। पुरानी लीड पर असर नहीं।')}</p></div>
        <label className="block text-[11px] font-semibold text-slate-600">{tx('Lead protection (days) — how long a registered customer stays with the partner', 'लीड प्रोटेक्शन (दिन)')}<input inputMode="numeric" disabled={!canWrite} value={s.registrationDays} onChange={e => setS({ ...s, registrationDays: e.target.value })} className={inp} /></label>
        {canWrite && <button className={dark} onClick={() => act(() => api.pcSettings(p.id, { access: s.access, leadIntake: s.leadIntake, intakeNote: s.leadIntake === 'PAUSED' ? s.intakeNote : '', leadVerification: s.leadVerification, registrationDays: Number(s.registrationDays), visitProof: s.visitProof }), tx('Rules saved', 'नियम सेव')).catch(() => undefined)}>{tx('Save rules', 'नियम सेव करें')}</button>}
      </section>
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold">{tx('Project details', 'प्रोजेक्ट विवरण')}</h3>
        <input value={x.tagline} disabled={!canWrite} onChange={e => setX({ ...x, tagline: e.target.value })} placeholder={tx('Tagline', 'टैगलाइन')} className={inp} maxLength={160} />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-slate-600">{tx('Status', 'स्थिति')}<select disabled={!canWrite} value={x.status} onChange={e => setX({ ...x, status: e.target.value })} className={inp}>{['ACTIVE_LAUNCH', 'PRE_BOOKING', 'SOLD_OUT', 'ARCHIVED'].map(k => <option key={k}>{k}</option>)}</select></label>
          <label className="text-[11px] text-slate-600">{tx('Stage', 'चरण')}<select disabled={!canWrite} value={x.projectStage} onChange={e => setX({ ...x, projectStage: e.target.value })} className={inp}>{['Pre-Launch / Upcoming', 'Under Construction', 'Ready to Move'].map(k => <option key={k} value={k}>{label('builderProjectStage', k)}</option>)}</select></label>
          <label className="text-[11px] text-slate-600">{tx('Price from (₹)', 'कीमत से (₹)')}<input inputMode="numeric" disabled={!canWrite} value={x.priceStartingFrom} onChange={e => setX({ ...x, priceStartingFrom: e.target.value })} className={inp} /></label>
          <label className="text-[11px] text-slate-600">{tx('Price up to (₹)', 'कीमत तक (₹)')}<input inputMode="numeric" disabled={!canWrite} value={x.priceMax} onChange={e => setX({ ...x, priceMax: e.target.value })} className={inp} /></label>
          <label className="text-[11px] text-slate-600">{tx('Default commission %', 'डिफ़ॉल्ट कमीशन %')}<input inputMode="decimal" disabled={!canWrite} value={x.channelPartnerCommissionPct} onChange={e => setX({ ...x, channelPartnerCommissionPct: e.target.value })} className={inp} /></label>
          <label className="text-[11px] text-slate-600">{tx('Units available', 'उपलब्ध यूनिट')}<input inputMode="numeric" disabled={!canWrite} value={x.availableUnits} onChange={e => setX({ ...x, availableUnits: e.target.value })} className={inp} /></label>
        </div>
        <input value={x.completionTarget} disabled={!canWrite} onChange={e => setX({ ...x, completionTarget: e.target.value })} placeholder={tx('Completion target (e.g. Dec 2027)', 'पूर्णता लक्ष्य')} className={inp} />
        <p className="text-[10px] text-slate-500">{tx('Changing the default commission affects only partners appointed from now; existing partners keep their terms (edit them in Partners).', 'डिफ़ॉल्ट कमीशन बदलने से सिर्फ़ नए पार्टनर प्रभावित होंगे; मौजूदा पार्टनर की शर्तें “पार्टनर” टैब में बदलें।')}</p>
        {canWrite && <button className={dark} onClick={() => act(() => api.pcDetails(p.id, { tagline: x.tagline, status: x.status, projectStage: x.projectStage, priceStartingFrom: Number(x.priceStartingFrom), priceMax: Number(x.priceMax), channelPartnerCommissionPct: Number(x.channelPartnerCommissionPct), availableUnits: Number(x.availableUnits), completionTarget: x.completionTarget }), tx('Details saved', 'विवरण सेव')).catch(() => undefined)}>{tx('Save details', 'विवरण सेव करें')}</button>}
      </section>
    </div>
  );
};

const StaffTab: React.FC<TabProps> = ({ d, canWrite, act }) => {
  const tx = useTx();
  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{tx('Choose which of your employees may accept / reject partner leads for this project and whether they see customer numbers. Full controls (phone masking, routing, hand-over) are in My Team → Lead control.', 'तय करें कि आपका कौन-सा कर्मचारी इस प्रोजेक्ट की पार्टनर लीड मंज़ूर/अस्वीकार कर सकता है और ग्राहक का नंबर देख सकता है। पूरे नियंत्रण My Team → Lead control में हैं।')}</p>
      {d.staff.length === 0 && <p className="text-xs text-slate-500">{tx('No team members yet — add them in My Team.', 'अभी कोई टीम सदस्य नहीं — My Team में जोड़ें।')}</p>}
      {d.staff.map((m: any) => (
        <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <div><div className="text-sm font-bold">{m.name}</div><div className="text-[11px] text-slate-500">{m.title} · {tx('numbers', 'नंबर')}: {m.policy.phoneMode}{m.status !== 'VERIFIED' ? ` · ${m.status}` : ''}</div></div>
          <button disabled={!canWrite || m.status !== 'VERIFIED'} onClick={() => act(() => api.tcPolicy(m.id, { canVerify: !m.policy.canVerify }), m.policy.canVerify ? tx('Verification removed', 'वेरिफिकेशन हटाया') : tx('Can now verify leads', 'अब लीड वेरिफाई कर सकते हैं')).catch(() => undefined)} className={m.policy.canVerify ? dark : ghost}>
            {m.policy.canVerify ? <><Unlock className="h-4 w-4" />{tx('Can verify leads', 'लीड वेरिफाई कर सकता')}</> : <><Lock className="h-4 w-4" />{tx('Cannot verify', 'वेरिफाई नहीं')}</>}
          </button>
          <button disabled={!canWrite || m.status !== 'VERIFIED'} onClick={() => act(() => api.tcPolicy(m.id, { canScanVisits: !m.policy.canScanVisits }), m.policy.canScanVisits ? tx('Scan right removed', 'स्कैन अधिकार हटाया') : tx('Can now scan visit QR', 'अब विज़िट QR स्कैन कर सकते हैं')).catch(() => undefined)} className={m.policy.canScanVisits ? dark : ghost}>
            {m.policy.canScanVisits ? <><Unlock className="h-4 w-4" />{tx('Can scan visit QR', 'विज़िट QR स्कैन कर सकता')}</> : <><Lock className="h-4 w-4" />{tx('Cannot scan visit QR', 'विज़िट QR स्कैन नहीं')}</>}
          </button>
        </div>
      ))}
    </div>
  );
};
