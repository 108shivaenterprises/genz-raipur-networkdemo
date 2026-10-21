import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Phone, CalendarClock, X, IndianRupee, AlertTriangle, Upload, CheckSquare, ArrowRightLeft } from 'lucide-react';
import { api } from '../lib/api.js';
import { hasPerm } from '../lib/permissions.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { CheckinModal } from './CheckinModal.js';
import { InventoryPanel } from './InventoryPanel.js';
import { BonusPanel } from './BonusPanel.js';
import { LeadPassPanel } from './VisitsView.js';
import { AlertsBar, FilterBar, EMPTY_FILTERS, TEMP_LABEL, LostSheet, WaMenu, FollowUpRow, LeadControls, BulkBar, ImportSheet, ExportButtons, btnLine, type CrmAlert, type Filters } from './CrmPlus.js';
import { BookingMoney, PayoutSheet, TdsPanel } from './CrmMoney.js';
import { ReportsPanel } from './CrmReports.js';
import { MoneyPanel, MoneyStrip } from './MoneyTrail.js';
import { SourceField, ProfileFields, LeadDetailsCard, CallPanel, ForwardSheet, HandoffTrail, CallQueuePanel, BookingRequestSheet, BookingDetail, ApproveSheet, outcomeLabel } from './CrmSales.js';
import { inferTeamRole, optLabel, TEAM_ROLES, type LeadProfile } from '../shared/crmSales.js';
import { LOST_CODES } from '../shared/crmRules.js';
import type { UserProfile } from '../types/index.js';
import { CRM_STAGE_ORDER, type CrmBooking, type CrmLead, type CrmLeadStage } from '../types/crm.js';

const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const dt = (s?: string) => (s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const STAGE_LABEL: Record<string, string> = {
  NEW: 'New', CONTACTED: 'Contacted', SITE_VISIT_SCHEDULED: 'Visit scheduled', SITE_VISITED: 'Visited',
  NEGOTIATION: 'Negotiation', BOOKING_REQUESTED: 'Booking requested', BOOKED: 'Booked', LOST: 'Lost',
};
const STAGE_COLOR: Record<string, string> = {
  NEW: 'bg-slate-100 text-slate-700', CONTACTED: 'bg-sky-100 text-sky-800', SITE_VISIT_SCHEDULED: 'bg-indigo-100 text-indigo-800',
  SITE_VISITED: 'bg-violet-100 text-violet-800', NEGOTIATION: 'bg-amber-100 text-amber-800', BOOKING_REQUESTED: 'bg-orange-100 text-orange-800',
  BOOKED: 'bg-emerald-100 text-emerald-800', LOST: 'bg-red-100 text-red-700',
};

const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    <div className={`mt-1 text-xl font-bold ${tone || 'text-slate-900'}`}>{value}</div>
  </div>
);

interface Props {
  currentUser: UserProfile;
  permissions: string[];
}

export const CrmView: React.FC<Props> = ({ currentUser, permissions }) => {
  const { t } = useI18n();
  const [overview, setOverview] = useState<any>(null);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [bookings, setBookings] = useState<CrmBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const tx = useTx();
  const [tab, setTab] = useState<'pipeline' | 'calls' | 'inventory' | 'bookings' | 'money' | 'brokerage' | 'bonus' | 'reports'>('pipeline');
  const [moneyBooking, setMoneyBooking] = useState<string | null>(null);
  const [f, setF] = useState<Filters>(EMPTY_FILTERS);
  const [fa, setFa] = useState<Filters>(EMPTY_FILTERS); // debounced copy that drives the server query
  const [total, setTotal] = useState(0);
  const [projects, setProjects] = useState<{ id: string; projectName: string }[]>([]);
  const [idFilter, setIdFilter] = useState<{ kind: string; ids: Set<string> } | null>(null);
  const [alertKey, setAlertKey] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const [payFor, setPayFor] = useState<CrmBooking | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const can = (...p: string[]) => hasPerm(permissions, ...p);
  const flash = useCallback((ok: boolean, msg: string) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 4500); }, []);

  const query = useCallback((offset = 0) => ({ q: fa.q.trim() || undefined, temperature: fa.temperature || undefined, projectId: fa.projectId || undefined, source: fa.source || undefined, ...(fa.flag ? { [fa.flag]: 1 } : {}), limit: 200, offset: offset || undefined }), [fa]);
  const load = useCallback(async () => {
    try {
      const [o, l, b] = await Promise.all([api.crmOverview(), api.crmLeads(query()), api.crmBookings()]);
      setOverview(o.overview); setLeads(l.leads); setTotal(l.total); setBookings(b.bookings); setAlertKey(k => k + 1);
    } catch (e: any) { flash(false, e.message); } finally { setLoading(false); }
  }, [query, flash]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const h = setTimeout(() => setFa(f), f.q === fa.q ? 0 : 300); return () => clearTimeout(h); }, [f]); // eslint-disable-line
  useEffect(() => { api.crmProjects().then(r => setProjects(r.projects)).catch(() => setProjects([])); }, []);
  const loadMore = async () => { try { const l = await api.crmLeads(query(leads.length)); setLeads(x => [...x, ...l.leads]); setTotal(l.total); } catch (e: any) { flash(false, e.message); } };

  const flagKind: Record<string, string> = { overdue: 'FOLLOWUP_OVERDUE', expiring: 'PROTECTION_EXPIRING', stale: 'STALE' };
  const pick = (a: CrmAlert | null) => {
    setIdFilter(null);
    if (!a) { setF({ ...f, flag: '' }); return; }
    const flag = ({ FOLLOWUP_OVERDUE: 'overdue', PROTECTION_EXPIRING: 'expiring', STALE: 'stale' } as Record<string, Filters['flag']>)[a.kind];
    if (flag) { setTab('pipeline'); setF({ ...f, flag }); return; }
    setTab(['VERIFY_PENDING', 'FORWARDED_TO_ME', 'FORWARD_UNSEEN', 'NEW_NOT_CALLED', 'UNREACHABLE'].includes(a.kind) ? 'pipeline' : a.kind.startsWith('MONEY_') ? 'money' : 'bookings');
    setIdFilter({ kind: a.kind, ids: new Set(a.ids || []) });
  };
  const activeKind = idFilter?.kind || (f.flag ? flagKind[f.flag] : null);

  const filtered = useMemo(() => (idFilter && tab === 'pipeline' ? leads.filter(l => idFilter.ids.has(l.id)) : leads), [leads, idFilter, tab]);
  const shownBookings = useMemo(() => (idFilter && tab === 'bookings' ? bookings.filter(b => idFilter.ids.has(b.id)) : bookings), [bookings, idFilter, tab]);
  const toggleSel = (id: string) => setSel(x => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const act = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); flash(true, ok); await load(); } catch (e: any) { flash(false, e.message); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  const o = overview || {};
  const isBroker = currentUser.role === 'BROKER';
  const isBuilder = currentUser.role === 'DEVELOPER_BUILDER';
  const isMember = currentUser.role === 'TEAM_MEMBER';
  const approved = bookings.filter(b => b.status === 'APPROVED');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t('crm.title', 'Builder ⇄ Associates CRM')}</h2>
          <p className="text-xs text-slate-500">
            {isMember ? tx('Leads your employer has allotted to you', 'आपके नियोक्ता ने आपको जो लीड सौंपी हैं') : isBroker ? tx('Your registered leads, bookings and brokerage', 'आपकी दर्ज की हुई लीड, बुकिंग और ब्रोकरेज') : isBuilder ? tx('Channel-partner leads, booking approvals and brokerage payouts for your projects', 'आपके प्रोजेक्ट की चैनल-पार्टनर लीड, बुकिंग अनुमोदन और ब्रोकरेज भुगतान') : tx('Platform-wide oversight (customer phone numbers masked)', 'पूरे प्लेटफ़ॉर्म की निगरानी (ग्राहकों के फ़ोन नंबर छिपे हुए)')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isMember && can('crm:lead_manage') && <button onClick={() => { setSelectMode(!selectMode); setSel(new Set()); }} className={`${btnLine} ${selectMode ? '!border-slate-900 !bg-slate-900 !text-white' : ''}`}><CheckSquare className="h-3.5 w-3.5" /> {tx('Select', 'चुनें')}</button>}
          {!isMember && can('crm:lead_create') && projects.length > 0 && <button onClick={() => setShowImport(true)} className={btnLine}><Upload className="h-3.5 w-3.5" /> {tx('Import', 'इम्पोर्ट')}</button>}
          {!isMember && <ExportButtons canFull={isBroker || isBuilder} flash={flash} />}
          {can('crm:lead_create') && (
            <button onClick={() => setShowAdd(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">
              <Plus className="h-4 w-4" /> {t('crm.register', 'Register lead')}
            </button>
          )}
        </div>
      </div>

      {toast && <div className={`rounded-lg px-3 py-2 text-xs font-medium ${toast.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{toast.msg}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('crm.activeLeads', 'Active leads')} value={o.activeLeads ?? 0} />
        <Stat label={t('crm.overdue', 'Overdue follow-ups')} value={o.overdueFollowUps ?? 0} tone={o.overdueFollowUps ? 'text-red-600' : undefined} />
        {!isMember && <Stat label={t('crm.pending', 'Pending approvals')} value={o.pendingBookingRequests ?? 0} />}
        <Stat label={t('crm.conversion', 'Conversion')} value={`${o.conversionPct ?? 0}%`} />
        {!isMember && (<>
          <Stat label={t('crm.salesValue', 'Sales value')} value={inr(o.salesValue)} />
          <Stat label={t('crm.collected', 'Collected')} value={inr(o.collected)} />
          <Stat label={t('crm.accrued', 'Brokerage accrued')} value={inr(o.brokerageAccrued)} />
          <Stat label={t('crm.payable', 'Payable now')} value={inr(o.brokeragePayable)} tone="text-emerald-700" />
        </>)}
      </div>

      <AlertsBar refreshKey={alertKey} active={activeKind} onPick={pick} />

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {((isMember ? ['pipeline', 'calls', ...(o.invMode && o.invMode !== 'OFF' ? ['inventory'] : []), ...(o.moneyTrail?.collect || o.moneyTrail?.confirm ? ['money'] : []), 'reports'] : ['pipeline', ...(can('crm:lead_manage') ? ['calls'] : []), 'bookings', 'money', 'brokerage', ...(can('inventory:read') ? ['inventory'] : []), 'bonus', 'reports']) as ('pipeline' | 'calls' | 'inventory' | 'bookings' | 'money' | 'brokerage' | 'bonus' | 'reports')[]).map(k => (
          <button key={k} onClick={() => setTab(k)} className={`min-h-9 shrink-0 whitespace-nowrap px-3 py-2 text-xs font-semibold ${tab === k ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}>
            {({ pipeline: tx('Pipeline', 'पाइपलाइन'), calls: tx('Call list', 'कॉल लिस्ट'), inventory: tx('Inventory', 'इन्वेंटरी'), bookings: tx('Bookings', 'बुकिंग'), money: tx('Money', 'पैसा'), brokerage: tx('Brokerage', 'ब्रोकरेज'), bonus: tx('Bonus', 'बोनस'), reports: tx('Reports', 'रिपोर्ट') } as Record<string, string>)[k]}{k === 'bookings' && o.pendingBookingRequests ? ` (${o.pendingBookingRequests})` : ''}
          </button>
        ))}
      </div>

      {idFilter && (tab === 'pipeline' || tab === 'bookings') && <p className="text-xs text-slate-600">{tx('Showing items from the alert', 'अलर्ट वाली चीज़ें दिख रही हैं')} · <button className="font-semibold text-slate-900 underline" onClick={() => setIdFilter(null)}>{tx('show all', 'सब दिखाएँ')}</button></p>}

      {tab === 'pipeline' && (
        <div className={`space-y-3 ${selectMode ? 'pb-20' : ''}`}>
          <FilterBar f={f} setF={setF} projects={projects} />
          <p className="text-[11px] text-slate-500">{tx(`${leads.length} of ${total} leads shown`, `${total} में से ${leads.length} लीड दिख रही हैं`)}{selectMode ? ` · ${tx('tap cards to select', 'कार्ड टैप करके चुनें')}` : ''}</p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {CRM_STAGE_ORDER.map(stage => {
              const col = filtered.filter(l => l.stage === stage);
              return (
                <div key={stage} className="w-60 shrink-0 rounded-xl bg-slate-100/70 p-2">
                  <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-bold text-slate-600">
                    <span>{t(`stage.${stage}`, STAGE_LABEL[stage])}</span><span>{col.length}</span>
                  </div>
                  <div className="space-y-2">
                    {col.map(l => {
                      const overdue = l.followUps.some(fu => !fu.done && Date.parse(fu.dueAt) < Date.now()) && !['BOOKED', 'LOST'].includes(l.stage);
                      const on = sel.has(l.id);
                      return (
                        <button key={l.id} onClick={() => (selectMode ? toggleSel(l.id) : setSelected(l.id))} className={`w-full rounded-lg border bg-white p-2.5 text-left hover:border-slate-900 ${on ? 'border-slate-900 ring-2 ring-slate-900' : 'border-slate-200'}`}>
                          <div className="flex items-center justify-between gap-1">
                            <span className="flex min-w-0 items-center gap-1 truncate text-xs font-bold text-slate-900">{selectMode && <input type="checkbox" readOnly checked={on} className="h-3.5 w-3.5 shrink-0" tabIndex={-1} />}{l.temperature && <span title={TEMP_LABEL[l.temperature][1]}>{TEMP_LABEL[l.temperature][0]}</span>}<span className="truncate">{l.name}</span></span>
                            {overdue && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                          </div>
                          <div className="truncate text-[11px] text-slate-500">{l.projectName}</div>
                          <div className="mt-1 text-[11px] text-slate-600">{l.unitInterest || '—'}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {l.optedOutAt && <span className="rounded bg-red-100 px-1.5 text-[9px] font-bold text-red-700">{tx('OPTED OUT', 'ऑप्ट-आउट')}</span>}
                            {l.stale && <span className="rounded bg-amber-100 px-1.5 text-[9px] font-bold text-amber-800">{tx('STALE', 'निष्क्रिय')}</span>}
                            {l.forwardUnseen && <span className="rounded bg-violet-100 px-1.5 text-[9px] font-bold text-violet-800">{tx('FORWARDED', 'फ़ॉरवर्ड')}</span>}
                            {!!l.callAttempts && <span className="rounded bg-sky-50 px-1.5 text-[9px] font-bold text-sky-800">📞 {l.callAttempts}</span>}
                            {!['BOOKED', 'LOST'].includes(l.stage) && (l.protectionDaysLeft ?? 99) <= 7 && <span className="rounded bg-red-50 px-1.5 text-[9px] font-bold text-red-700">{Math.max(0, l.protectionDaysLeft ?? 0)}{tx('d protection', 'दिन सुरक्षा')}</span>}
                            {(l.tags || []).slice(0, 2).map(tg => <span key={tg} className="rounded bg-slate-100 px-1.5 text-[9px] font-semibold text-slate-600">{tg}</span>)}
                          </div>
                          {!isBroker && <div className="mt-0.5 truncate text-[10px] text-slate-400">{tx('via', 'द्वारा')} {l.associateName || tx('Builder direct', 'बिल्डर सीधे')}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {leads.length < total && <div className="text-center"><button onClick={loadMore} className={btnLine}>{tx(`Load more (${total - leads.length} left)`, `और लोड करें (${total - leads.length} बाकी)`)}</button></div>}
        </div>
      )}

      {tab === 'bookings' && (
        <div className="space-y-3">
          {shownBookings.length === 0 && <p className="text-sm text-slate-500">{tx('No bookings yet.', 'अभी कोई बुकिंग नहीं।')}</p>}
          {shownBookings.map(b => <BookingCard key={b.id} b={b} can={can} act={act} role={currentUser.role} meId={currentUser.id} onChanged={load} flash={flash} onMoney={id => { setMoneyBooking(id); setTab('money'); }} />)}
        </div>
      )}

      {tab === 'money' && <MoneyPanel flash={flash} bookingId={moneyBooking} onClearBooking={() => setMoneyBooking(null)} alertIds={idFilter?.kind.startsWith('MONEY_') ? idFilter.ids : null} onClearAlert={() => setIdFilter(null)} onChanged={load} refreshKey={alertKey} />}
      {tab === 'calls' && <CallQueuePanel onOpen={id => setSelected(id)} canFilter={can('team:manage')} />}
      {tab === 'inventory' && <InventoryPanel role={currentUser.role} leads={leads} />}
      {tab === 'bonus' && <BonusPanel role={currentUser.role} canPay={can('crm:payout')} />}
      {tab === 'reports' && <ReportsPanel />}

      {tab === 'brokerage' && (
        <div className="space-y-3">
        {can('crm:payout') && isBuilder && <TdsPanel flash={flash} />}
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500">
              <tr><th className="p-3">{tx('Booking', 'बुकिंग')}</th><th>{tx('Customer', 'ग्राहक')}</th><th>{tx('Agreement', 'एग्रीमेंट')}</th><th>{tx('Collected', 'वसूला')}</th><th>{tx('Brokerage', 'ब्रोकरेज')}</th><th>{tx('Paid', 'चुकाया')}</th><th>{tx('Payable', 'देय')}</th><th></th></tr>
            </thead>
            <tbody>
              {approved.map(b => (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="p-3 font-semibold">{b.id}<div className="text-[10px] font-normal text-slate-400">{b.projectName} · {b.unitNo}</div></td>
                  <td>{b.customerName}</td><td>{inr(b.agreementValue)}</td>
                  <td>{(b as any).collectedPct}%</td>
                  <td>{inr(b.brokerageAmount)} <span className="text-slate-400">({b.brokeragePct}%)</span></td>
                  <td>{inr(b.brokeragePaidAmount)}</td>
                  <td className="font-bold text-emerald-700">{inr((b as any).payableBrokerage)}
                    {(b.payouts || []).some(p => p.status === 'DISPUTED') && <div className="text-[10px] font-bold text-red-600">{tx('disputed', 'विवादित')}</div>}
                    {(b.payouts || []).some(p => p.status === 'RECORDED') && <div className="text-[10px] font-semibold text-amber-700">{tx('awaiting confirmation', 'कन्फ़र्मेशन बाकी')}</div>}
                  </td>
                  <td className="pr-3 text-right">
                    {can('crm:payout') && (b as any).payableBrokerage > 0 && (
                      <button onClick={() => setPayFor(b)} className="min-h-9 rounded-md bg-emerald-600 px-3 text-[11px] font-semibold text-white">{tx('Release', 'रिलीज़')}</button>
                    )}
                  </td>
                </tr>
              ))}
              {approved.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-slate-500">{tx('No approved bookings yet.', 'अभी कोई मंज़ूर बुकिंग नहीं।')}</td></tr>}
            </tbody>
          </table>
          <p className="border-t border-slate-100 p-3 text-[11px] text-slate-500">{tx('Brokerage becomes payable pro-rata with the customer’s collections — never ahead of the builder’s receipts. Open a booking under Bookings for the full payout ledger.', 'ब्रोकरेज ग्राहक की वसूली के अनुपात में ही देय होता है — बिल्डर की रसीदों से आगे नहीं। पूरा पेआउट लेजर Bookings में खोलें।')}</p>
        </div>
        </div>
      )}

      {selected && <LeadDrawer id={selected} can={can} currentUser={currentUser} onClose={() => setSelected(null)} onChanged={load} flash={flash} />}
      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); load(); flash(true, 'Lead registered with 60-day protection'); }} isBuilder={isBuilder} />}
      {showImport && <ImportSheet projects={projects} onClose={() => setShowImport(false)} onDone={n => { load(); flash(true, tx(`${n} leads imported`, `${n} लीड इम्पोर्ट हुईं`)); }} />}
      {payFor && <PayoutSheet b={payFor} onClose={() => setPayFor(null)} onDone={() => { flash(true, tx('Payout recorded — the associate will confirm', 'पेआउट दर्ज — एसोसिएट कन्फ़र्म करेगा')); load(); }} />}
      {selectMode && <BulkBar ids={[...sel]} onClear={() => { setSel(new Set()); setSelectMode(false); }} onDone={msg => { flash(true, msg); setSel(new Set()); load(); }} />}
    </div>
  );
};

const BookingCard: React.FC<{ b: CrmBooking; can: (...p: string[]) => boolean; act: (fn: () => Promise<any>, ok: string) => void; role: string; meId: string; onChanged: () => void; flash: (ok: boolean, m: string) => void; onMoney?: (bookingId: string) => void }> = ({ b, can, act, role, meId, onChanged, flash, onMoney }) => {
  const tx = useTx();
  const label = useLabel();
  const [approve, setApprove] = useState(false);
  const fm = !!(b as any).forMember; // an employee sees the unit, the plan and the booking-amount status — never the money ledger
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-slate-900">{b.customerName} · {b.projectName} · {tx('Unit', 'यूनिट')} {b.unitNo}</div>
          <div className="text-xs text-slate-500">{b.id}{b.agreementValue != null ? ` · ${inr(b.agreementValue)}` : ''}{b.tokenAmount ? ` · ${tx('booking amount', 'बुकिंग राशि')} ${inr(b.tokenAmount)}` : ''}</div>
        </div>
        <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${b.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : b.status === 'REQUESTED' ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-600'}`}>{label('status', b.status)}</span>
      </div>
      <BookingDetail b={b} canDecide={can('crm:booking_decide')} act={act} />
      {b.status === 'REQUESTED' && can('crm:booking_decide') && (
        <div className="mt-3 flex gap-2">
          <button onClick={() => setApprove(true)} className="min-h-9 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">{tx('Approve', 'मंज़ूर')}</button>
          <button onClick={() => { const n = prompt(tx('Reason for rejection (min 5 chars)', 'अस्वीकार करने का कारण (कम से कम 5 अक्षर)')); if (n) act(() => api.crmDecideBooking(b.id, 'REJECT', n), tx('Booking rejected', 'बुकिंग अस्वीकार')); }} className="min-h-9 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">{tx('Reject', 'अस्वीकार')}</button>
        </div>
      )}
      {!fm && onMoney && <div className="mt-3"><MoneyStrip trails={b.trails} onOpen={() => onMoney(b.id)} /></div>}
      {approve && <ApproveSheet b={b} onClose={() => setApprove(false)} onDone={() => { flash(true, tx('Booking approved', 'बुकिंग मंज़ूर')); onChanged(); }} />}
      {!fm && (b.status === 'APPROVED' || b.status === 'CANCELLED') && <BookingMoney b={b} role={role} meId={meId} can={can} onChanged={onChanged} flash={flash} />}
      {b.decisionNote && <p className="mt-2 text-[11px] text-slate-500">{tx('Note', 'नोट')}: {b.decisionNote}</p>}
    </div>
  );
};

const LeadDrawer: React.FC<{ id: string; can: (...p: string[]) => boolean; currentUser: UserProfile; onClose: () => void; onChanged: () => void; flash: (ok: boolean, m: string) => void }> = ({ id, can, currentUser, onClose, onChanged, flash }) => {
  const [lead, setLead] = useState<CrmLead | null>(null);
  const [booking, setBooking] = useState<CrmBooking | undefined>();
  const [note, setNote] = useState('');
  const [type, setType] = useState('WHATSAPP');
  const [fu, setFu] = useState({ dueAt: '', note: '', channel: 'CALL' });
  const [bkOpen, setBkOpen] = useState(false);
  const [fwdOpen, setFwdOpen] = useState(false);
  const [team, setTeam] = useState<any[]>([]);
  const [checkin, setCheckin] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [shown, setShown] = useState('');
  const tx = useTx();
  const { t, lang } = useI18n();
  const label = useLabel();
  const stageName = (st: string) => t(`stage.${st}`, STAGE_LABEL[st] || st);
  useEffect(() => { setShown(''); }, [id]);
  useEffect(() => { if (can('team:manage')) api.teamList().then((r) => setTeam(r.members.filter((m: any) => m.status === 'VERIFIED'))).catch(() => setTeam([])); }, []); // eslint-disable-line

  const refresh = useCallback(async () => { const r = await api.crmLead(id); setLead(r.lead); setBooking(r.booking); }, [id]);
  useEffect(() => { refresh().catch(e => flash(false, e.message)); }, [refresh, flash]);

  const run = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); flash(true, ok); await refresh(); onChanged(); } catch (e: any) { flash(false, e.message); }
  };
  if (!lead) return null;
  const manage = can('crm:lead_manage') && !['BOOKED', 'BOOKING_REQUESTED'].includes(lead.stage);
  const isMemberU = currentUser.role === 'TEAM_MEMBER';
  // who raises the booking request: the associate for their own lead, the builder for a builder-desk lead, an employee only when the employer allowed it
  const canRequest = can('crm:booking_request') && ['SITE_VISITED', 'NEGOTIATION'].includes(lead.stage) && !lead.erasedAt && (
    (currentUser.role === 'BROKER' && lead.associateId === currentUser.id) ||
    (currentUser.role === 'DEVELOPER_BUILDER' && !lead.associateId && lead.builderId === currentUser.id) ||
    (isMemberU && !!lead.memberCan?.requestBooking));
  const canForwardBtn = can('crm:lead_manage') && lead.stage !== 'LOST' && !lead.optedOutAt && !lead.erasedAt && (
    (isMemberU && !!lead.memberCan?.forward) || (currentUser.role === 'BROKER' && lead.associateId === currentUser.id) || (currentUser.role === 'DEVELOPER_BUILDER' && !lead.associateId && lead.builderId === currentUser.id));
  const meRole = inferTeamRole((currentUser as any).teamTitle, (currentUser as any).teamRole);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">{lead.name}</h3>
            <p className="text-xs text-slate-500">{lead.id} · {lead.projectName}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-700"><Phone className="h-3 w-3" />{shown || lead.phone}
              {lead.phoneMasked && !shown && (
                <button className="min-h-9 rounded bg-slate-900 px-2.5 text-[11px] font-semibold text-white" onClick={async () => { try { setShown((await api.staffReveal(lead.id)).phone); } catch (e: any) { flash(false, e.message); } }}>{tx('Tap to reveal', 'नंबर दिखाएँ')}</button>
              )}
              {(() => { const ph = shown || lead.phone; const ok = /^\d{10}$/.test(ph.replace(/\D/g, '').slice(-10)) && !ph.includes('X') && !ph.includes('•') && !lead.optedOutAt && !lead.erasedAt; return ok ? (
                <a className="inline-flex min-h-9 items-center rounded bg-sky-600 px-3 text-[11px] font-semibold text-white" href={`tel:+91${ph.replace(/\D/g, '').slice(-10)}`}>{tx('Call', 'कॉल')}</a>
              ) : null; })()}
            </p>
            <div className="mt-2"><WaMenu lead={lead} phone={shown || lead.phone} me={currentUser.name.split(' ')[0]} /></div>
          </div>
          <button onClick={onClose} aria-label={tx('Close', 'बंद करें')}><X className="h-5 w-5 text-slate-500" /></button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`rounded px-2 py-0.5 font-bold ${STAGE_COLOR[lead.stage]}`}>{stageName(lead.stage)}</span>
          {lead.verify === 'PENDING' && <span className="rounded bg-amber-100 px-2 py-0.5 font-bold text-amber-800">{tx('Builder check pending', 'बिल्डर की जाँच बाकी')}</span>}
          {lead.visitProof && <span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">{tx('QR-verified visit ✓', 'QR से वेरिफ़ाइड विज़िट ✓')}</span>}
          {lead.verify === 'REJECTED' && <span className="rounded bg-red-100 px-2 py-0.5 font-bold text-red-700">{tx('Rejected by builder', 'बिल्डर ने अस्वीकार किया')}</span>}
          <span className="text-slate-500">{tx('via', 'ज़रिया')} {lead.associateName || tx('Builder direct', 'सीधे बिल्डर')}</span>
          <span className="text-slate-500">{tx('protected till', 'सुरक्षित')} {new Date(lead.protectedUntil).toLocaleDateString('en-IN')} {tx('', 'तक')}</span>
        </div>
        {lead.stage === 'LOST' && <p className="mt-2 text-xs text-red-700">{tx('Lost', 'खोई')}: {lead.lostCode ? `${(() => { const lc = LOST_CODES.find(c => c.id === lead.lostCode); return lc ? tx(lc.en, lc.hi) : lead.lostCode; })()} — ` : ''}{lead.lostReason}</p>}

        {(lead.assignedMemberName || (can('team:manage') && team.length > 0 && (lead.associateId === currentUser.id || (currentUser.role === 'DEVELOPER_BUILDER' && !lead.associateId)))) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-slate-600">{tx('Working on it:', 'इस पर काम कर रहा है:')}</span>
            {can('team:manage') && team.length > 0 && (lead.associateId === currentUser.id || (currentUser.role === 'DEVELOPER_BUILDER' && !lead.associateId)) ? (
              <select value={lead.assignedMemberId || ''} onChange={(e) => run(() => api.teamAllotLead(lead.id, e.target.value || null), e.target.value ? tx('Lead allotted', 'लीड सौंपी गई') : tx('Lead taken back', 'लीड वापस ली गई'))} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs">
                <option value="">{tx('You (not allotted)', 'आप (किसी को नहीं सौंपी)')}</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.name} — {optLabel(TEAM_ROLES, m.teamRole || 'OTHER', lang === 'hi')}</option>)}
              </select>
            ) : <b className="text-slate-800">{lead.assignedMemberName}</b>}
          </div>
        )}

        {manage && can('team:checkin') && (
          <button onClick={() => setCheckin(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold hover:border-slate-900">📍 {tx('Site check-in (GPS + selfie)', 'साइट चेक-इन (GPS + सेल्फ़ी)')}</button>
        )}
        {checkin && <CheckinModal leadId={lead.id} defaultLabel={lead.projectName} onClose={() => setCheckin(false)} onDone={refresh} />}

        <LeadControls lead={lead} run={run} refresh={async () => { await refresh(); onChanged(); }} manage={manage} isMember={currentUser.role === 'TEAM_MEMBER'} flash={flash} />

        <LeadDetailsCard lead={lead} canEdit={can('crm:lead_manage')} isMember={isMemberU} onSaved={async () => { flash(true, tx('Saved', 'सेव हुआ')); await refresh(); onChanged(); }} />
        {manage && !lead.optedOutAt && !lead.erasedAt && lead.stage !== 'LOST' && <CallPanel lead={lead} flash={flash} onChanged={async () => { await refresh(); onChanged(); }} onLost={() => setLostOpen(true)} />}
        {canForwardBtn && (
          <button onClick={() => setFwdOpen(true)} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-[11px] font-semibold text-violet-900 hover:border-violet-700"><ArrowRightLeft className="h-3.5 w-3.5" /> {tx('Forward to next executive / coordinator', 'अगले एक्ज़ीक्यूटिव / कोऑर्डिनेटर को भेजें')}</button>
        )}
        {fwdOpen && <ForwardSheet lead={lead} meRole={meRole} onClose={() => setFwdOpen(false)} onDone={async name => { flash(true, tx(`Forwarded to ${name}`, `${name} को भेज दी गई`)); onChanged(); if (isMemberU) onClose(); else await refresh(); }} />}
        <HandoffTrail lead={lead} />

        {manage && !lead.optedOutAt && !lead.erasedAt && (
          <div className="mt-4">
            <label className="text-[11px] font-semibold text-slate-600">{tx('Move stage', 'स्टेज बदलें')}</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(['CONTACTED', 'SITE_VISIT_SCHEDULED', 'SITE_VISITED', 'NEGOTIATION'] as CrmLeadStage[]).filter(s => s !== lead.stage).map(s => (
                <button key={s} onClick={() => run(() => api.crmSetStage(lead.id, { stage: s }), tx(`Moved to ${STAGE_LABEL[s]}`, `${stageName(s)} में बदला`))} className="rounded-md border border-slate-300 px-2 py-1 text-[11px] hover:border-slate-900">{stageName(s)}</button>
              ))}
              {lead.stage !== 'LOST' && <button onClick={() => setLostOpen(true)} className="min-h-9 rounded-md border border-red-300 px-3 py-1 text-[11px] text-red-700">{tx('Lost', 'खोई')}</button>}
            </div>
          </div>
        )}

        {lostOpen && <LostSheet onClose={() => setLostOpen(false)} onSubmit={async (code, text) => { await api.crmSetStage(lead.id, { stage: 'LOST', lostCode: code, lostReason: text || undefined }); flash(true, tx('Marked lost', 'खोई हुई चिह्नित')); await refresh(); onChanged(); }} />}

        {canRequest && (
          <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50/60 p-3">
            <div className="text-xs font-bold text-orange-900">{tx('Request booking', 'बुकिंग का अनुरोध')}</div>
            <p className="mt-1 text-[11px] text-orange-900/80">{tx('Unit, agreement value, booking amount (how it was paid) and the payment condition go to the builder for approval.', 'यूनिट, एग्रीमेंट वैल्यू, बुकिंग राशि (कैसे दी) और पेमेंट की शर्तें बिल्डर को मंज़ूरी के लिए जाती हैं।')}</p>
            <button onClick={() => setBkOpen(true)} className="mt-2 min-h-9 rounded-md bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white">{tx('Fill booking request', 'बुकिंग अनुरोध भरें')}</button>
          </div>
        )}
        {bkOpen && <BookingRequestSheet lead={lead} role={currentUser.role} onClose={() => setBkOpen(false)} onDone={async () => { flash(true, tx('Booking requested', 'बुकिंग का अनुरोध भेजा')); await refresh(); onChanged(); }} />}
        {booking && <div className="mt-4"><BookingCard b={booking} can={can} act={(fn, ok) => run(fn, ok)} role={currentUser.role} meId={currentUser.id} onChanged={() => { refresh(); onChanged(); }} flash={flash} /></div>}

        {can('crm:lead_manage') && (
          <>
            <div className="mt-5">
              <div className="text-xs font-bold text-slate-800">{tx('Log activity', 'गतिविधि दर्ज करें')}</div>
              <div className="mt-1 flex flex-wrap gap-2">
                <select value={lead.optedOutAt ? 'NOTE' : type} onChange={e => setType(e.target.value)} className="min-h-9 rounded border border-slate-300 px-2 py-1 text-xs">
                  {(lead.optedOutAt ? ['NOTE'] : ['WHATSAPP', 'MEETING', 'SITE_VISIT', 'NOTE']).map(ty => <option key={ty} value={ty}>{label('activityType', ty)}</option>)}
                </select>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder={tx('What happened?', 'क्या हुआ?')} className="min-h-9 min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs" />
                <button disabled={!note.trim()} onClick={() => run(async () => { await api.crmAddActivity(lead.id, { type: lead.optedOutAt ? 'NOTE' : type, note }); setNote(''); }, tx('Logged', 'दर्ज हुआ'))} className="rounded bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-40">{tx('Add', 'जोड़ें')}</button>
              </div>
            </div>
            <LeadPassPanel lead={lead} currentUser={currentUser} onChanged={onChanged} />
            <div className="mt-4">
              <div className="flex items-center gap-1 text-xs font-bold text-slate-800"><CalendarClock className="h-3.5 w-3.5" /> {tx('Follow-ups', 'फ़ॉलो-अप')}</div>
              <ul className="mt-1 space-y-1">
                {lead.followUps.map(f => <FollowUpRow key={f.id} lead={lead} f={f} run={run} editable={manage && !lead.optedOutAt} />)}
              </ul>
              {manage && !lead.optedOutAt && !lead.erasedAt && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input type="datetime-local" value={fu.dueAt} onChange={e => setFu({ ...fu, dueAt: e.target.value })} className="min-h-9 w-full rounded border border-slate-300 px-2 py-1 text-xs" />
                  <input value={fu.note} onChange={e => setFu({ ...fu, note: e.target.value })} placeholder={tx('Reminder', 'रिमाइंडर')} className="min-h-9 min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs" />
                  <button disabled={!fu.dueAt || !fu.note.trim()} onClick={() => run(async () => { await api.crmAddFollowUp(lead.id, { ...fu, dueAt: new Date(fu.dueAt).toISOString() }); setFu({ dueAt: '', note: '', channel: 'CALL' }); }, tx('Follow-up set', 'फ़ॉलो-अप तय हुआ'))} className="min-h-9 rounded bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-40">{tx('Set', 'तय करें')}</button>
                </div>
              )}
            </div>
          </>
        )}

        <div className="mt-5">
          <div className="text-xs font-bold text-slate-800">{tx('Timeline', 'टाइमलाइन')}</div>
          <ul className="mt-1 space-y-1.5">
            {lead.activities.map(a => (
              <li key={a.id} className="border-l-2 border-slate-200 pl-2 text-[11px]">
                <span className="font-semibold text-slate-700">{label('activityType', a.type)}</span> · {a.call ? (() => { const oc = outcomeLabel(a.call.outcome, lang === 'hi'); const en = outcomeLabel(a.call.outcome, false); const rest = a.note.startsWith(en) ? a.note.slice(en.length).replace(/^:\s*/, '') : a.note; return <><b>{oc}</b>{a.call.durationMin ? ` · ${a.call.durationMin} ${tx('min', 'मिनट')}` : ''} · #{a.call.attempt}{rest ? ` — ${rest}` : ''}</>; })() : a.note}
                <div className="text-[10px] text-slate-400">{a.byName} · {dt(a.at)}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

const AddLeadModal: React.FC<{ onClose: () => void; onDone: () => void; isBuilder: boolean }> = ({ onClose, onDone, isBuilder }) => {
  const [projects, setProjects] = useState<any[]>([]);
  const [f, setF] = useState({ projectId: '', name: '', phone: '', email: '', source: isBuilder ? 'WALK_IN' : 'ASSOCIATE_REFERRAL', sourceDetail: '', unitInterest: '', budgetMax: '', note: '' });
  const [profile, setProfile] = useState<LeadProfile>({});
  const [more, setMore] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const tx = useTx();
  useEffect(() => { api.crmProjects().then(r => { setProjects(r.projects); if (r.projects[0]) setF(x => ({ ...x, projectId: r.projects[0].id })); }); }, []);
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={async e => {
        e.preventDefault(); setBusy(true); setErr('');
        try {
          await api.crmCreateLead({ ...f, email: f.email || undefined, sourceDetail: f.sourceDetail.trim() || undefined, budgetMax: f.budgetMax ? Number(f.budgetMax) : undefined, note: f.note || undefined, profile: Object.values(profile).some(v => v !== undefined && v !== '') ? profile : undefined, consent: true });
          onDone();
        } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
      }} className="max-h-[92vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between"><h3 className="text-base font-bold">{tx('Register lead', 'लीड दर्ज करें')}</h3><button type="button" onClick={onClose}><X className="h-5 w-5 text-slate-500" /></button></div>
        <select required value={f.projectId} onChange={set('projectId')} className="w-full rounded border border-slate-300 px-2 py-2 text-sm">
          {projects.length === 0 && <option value="">{tx('No project available', 'कोई प्रोजेक्ट उपलब्ध नहीं')}</option>}
          {projects.map(p => <option key={p.id} value={p.id}>{p.projectName} — {p.locality}</option>)}
        </select>
        <input required placeholder={tx('Customer name', 'ग्राहक का नाम')} value={f.name} onChange={set('name')} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        <input required placeholder={tx('Mobile (10 digits)', 'मोबाइल (10 अंक)')} value={f.phone} onChange={set('phone')} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        <input placeholder={tx('Email (optional)', 'ईमेल (वैकल्पिक)')} value={f.email} onChange={set('email')} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        <SourceField source={f.source} detail={f.sourceDetail} onChange={(source, sourceDetail) => setF({ ...f, source, sourceDetail })} />
        <div className="grid grid-cols-2 gap-2">
          <input placeholder={tx('Interest (e.g. 3 BHK)', 'पसंद (जैसे 3 BHK)')} value={f.unitInterest} onChange={set('unitInterest')} className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder={tx('Max budget ₹', 'अधिकतम बजट ₹')} inputMode="numeric" value={f.budgetMax} onChange={set('budgetMax')} className="rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <textarea placeholder={tx('Note', 'नोट')} value={f.note} onChange={set('note')} rows={2} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        <div className="rounded-lg border border-slate-200">
          <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="flex min-h-10 w-full items-center justify-between px-3 text-left text-xs font-semibold text-slate-800">{tx('More about the customer (optional)', 'ग्राहक के बारे में और जानकारी (वैकल्पिक)')}<span className="text-slate-400">{more ? '▲' : '▼'}</span></button>
          {more && <div className="border-t border-slate-100 p-3"><ProfileFields value={profile} onChange={setProfile} competitorsPrivate={!isBuilder} /></div>}
        </div>
        <p className="flex items-start gap-1 text-[11px] text-slate-500"><IndianRupee className="mt-0.5 h-3 w-3" /> {tx('The first associate to register a buyer gets 60-day protection on that project; duplicates are rejected.', 'किसी प्रोजेक्ट पर खरीदार को सबसे पहले दर्ज करने वाले एसोसिएट को 60 दिन की सुरक्षा मिलती है; डुप्लिकेट अस्वीकार हो जाते हैं।')}</p>
        <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-800"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" /><span>{tx('This customer has agreed to be contacted about this project (call / WhatsApp). I can show proof if the builder asks.', 'इस ग्राहक ने इस प्रोजेक्ट के बारे में संपर्क (कॉल / WhatsApp) की सहमति दी है। बिल्डर माँगे तो मैं प्रमाण दिखा सकता/सकती हूँ।')}</span></label>
        {err && <p className="text-xs font-medium text-red-700">{err}</p>}
        <button disabled={busy || !consent} className="min-h-10 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{tx('Register', 'दर्ज करें')}</button>
      </form>
    </div>
  );
};
