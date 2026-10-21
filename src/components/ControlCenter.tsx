import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldCheck, Save, ExternalLink, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { PERMISSION_HI } from '../lib/permHi.js';
import { formatINR } from '../lib/utils.js';
import type { TabType } from './NavigationTabs.js';
import { NetworkPulse } from './NetworkPulse.js';
import { ProtectionAdmin } from './ProtectionDays.js';
import { TwoFactorCard } from './TwoFactorCard.js';

interface Props { onNavigate: (t: TabType) => void }

/** Where each permission group lives in the UI — powers the "Open" redirect buttons in the function directory. */
const PERM_TAB: [RegExp, TabType, string][] = [
  [/^connector:(manage|work|payout|settings)/, 'connector', 'Connector Desk|कनेक्टर डेस्क'],
  [/^connector:(self|refer)/, 'dashboard', 'My Referrals|मेरे रेफ़रल'],
  [/^(users:|privacy:|kyc)/, 'onboarding', 'Invite & KYC|इनवाइट और KYC'],
  [/^audit:/, 'audit', 'Audit Trail|ऑडिट ट्रेल'],
  [/^propdoc:/, 'propdocs', 'Property Papers|प्रॉपर्टी पेपर्स'],
  [/^(property|mandate)/, 'properties', 'Property Inventory|प्रॉपर्टी इन्वेंटरी'],
  [/^requirement/, 'requirements', 'Buyer Needs|खरीदार की ज़रूरतें'],
  [/^matching/, 'matches', 'Match Center|मैच सेंटर'],
  [/^(deal|commission|visit|collab|agreement)/, 'deals', 'Deal Rooms|डील रूम'],
  [/^dd:/, 'due_diligence', 'Due Diligence|ड्यू डिलिजेंस'],
  [/^lead:/, 'construction', 'Construction Leads|कंस्ट्रक्शन लीड'],
  [/^dispute/, 'disputes', 'Disputes|विवाद'],
  [/^builder:/, 'builder', 'Builder Launchpad|बिल्डर लॉन्चपैड'],
  [/^crm:/, 'crm', 'Associates CRM|एसोसिएट्स CRM'],
  [/^(metrics|admin|permissions)/, 'control', 'Control Center|कंट्रोल सेंटर'],
];
const locate = (perm: string) => PERM_TAB.find(([re]) => re.test(perm));

const Card: React.FC<{ title: string; value: React.ReactNode; hint?: string; tone?: 'ok' | 'warn' | 'bad'; onClick?: () => void }> = ({ title, value, hint, tone, onClick }) => (
  <button type="button" onClick={onClick} disabled={!onClick}
    className={`rounded-xl border bg-white p-4 text-left shadow-sm ${onClick ? 'hover:border-slate-400' : 'cursor-default'} ${tone === 'bad' ? 'border-rose-300' : tone === 'warn' ? 'border-amber-300' : 'border-slate-200'}`}>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
    <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
  </button>
);

export const ControlCenter: React.FC<Props> = ({ onNavigate }) => {
  const tx = useTx();
  const label = useLabel();
  const { lang } = useI18n();
  const descOf = (r: { permission: string; description: string }) => (lang === 'hi' ? PERMISSION_HI[r.permission] ?? r.description : r.description);
  const [d, setD] = useState<any>(null);
  const [idr, setIdr] = useState<any>(null);
  const [matrix, setMatrix] = useState<{ permission: string; description: string; roles: string[] }[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [form, setForm] = useState({ maintenanceMode: false, requireReraForBrokerApproval: true, ownerConsentRequired: false, defaultConstructionCommissionPct: 2 });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [c, m] = await Promise.all([api.controlCenter(), api.permissionMatrix()]);
      setD(c); setMatrix(m.matrix); setRoles(m.roles);
      api.idSummary().then(setIdr).catch(() => setIdr(null));
      const s = c.settings || {};
      setForm({
        maintenanceMode: !!s.maintenanceMode,
        requireReraForBrokerApproval: s.requireReraForBrokerApproval !== false,
        ownerConsentRequired: !!s.ownerConsentRequired,
        defaultConstructionCommissionPct: Number(s.defaultConstructionCommissionPct ?? 2),
      });
    } catch (e: any) { setErr(e.message || tx('Could not load control center', 'कंट्रोल सेंटर लोड नहीं हो सका')); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true); setMsg(null);
    try { await api.savePlatformSettings(form); setMsg({ ok: true, text: tx('Platform settings saved (audit-logged).', 'प्लेटफ़ॉर्म सेटिंग सेव हो गईं (ऑडिट में दर्ज)।') }); await load(); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setSaving(false); }
  };

  const rows = useMemo(() => matrix.filter((r) =>
    (!roleFilter || r.roles.includes(roleFilter)) &&
    (!q || (r.permission + ' ' + r.description + ' ' + (PERMISSION_HI[r.permission] || '')).toLowerCase().includes(q.toLowerCase()))), [matrix, q, roleFilter]);

  if (err) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{err}</div>;
  if (!d) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  const cn = d.connector;
  const intact = d.audit.integrity?.valid !== false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><ShieldCheck className="h-5 w-5 text-amber-500" /> {tx('Superadmin Control Center', 'सुपरएडमिन कंट्रोल सेंटर')}</h2>
          <p className="text-xs text-slate-500">{tx('Storage', 'स्टोरेज')}: {d.system.storage} · Env: {d.system.nodeEnv} · {tx('Demo data', 'डेमो डेटा')}: {d.system.demoMode ? tx('ON', 'चालू') : tx('off', 'बंद')} · {tx('Uptime', 'चालू रहने का समय')} {Math.round(d.system.uptimeSec / 60)} {tx('min', 'मिनट')} · {tx('Policy', 'पॉलिसी')} {d.system.policyVersion}</p>
        </div>
        {d.settings.maintenanceMode && <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800">{tx('MAINTENANCE MODE ON — non-admins blocked', 'मेंटेनेंस मोड चालू — एडमिन के अलावा सब बंद')}</span>}
      </div>

      <NetworkPulse onNavigate={onNavigate} />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card title={tx('Users', 'यूज़र')} value={d.users.total} hint={`${d.users.byStatus.VERIFIED || 0} ${tx('verified', 'वेरिफ़ाइड')}`} onClick={() => onNavigate('onboarding')} />
        <Card title={tx('KYC pending', 'KYC बाकी')} value={d.users.pendingKyc.length} tone={d.users.pendingKyc.length ? 'warn' : 'ok'} hint={tx('Click to review', 'देखने के लिए क्लिक करें')} onClick={() => onNavigate('onboarding')} />
        {idr && <Card title={tx('ID checks waiting', 'ID जाँच बाकी')} value={idr.todo} tone={idr.todo ? 'warn' : 'ok'} hint={`${tx('Auto-verify', 'ऑटो-वेरिफ़ाई')} ${idr.autoVerifyOn ? tx('ON', 'चालू') : tx('OFF', 'बंद')}${idr.auto ? ` · ${idr.auto} ${tx('auto-verified', 'ऑटो')}` : ''}`} onClick={() => onNavigate('idreview')} />}
        <Card title={tx('Open disputes', 'खुले विवाद')} value={d.disputes.open} tone={d.disputes.open ? 'warn' : 'ok'} onClick={() => onNavigate('disputes')} />
        <Card title={tx('Deals', 'डील')} value={d.deals.total} hint={`${tx('Expected fees', 'अपेक्षित फ़ीस')} ${formatINR(d.deals.commissionExpected)}`} onClick={() => onNavigate('deals')} />
        <Card title={tx('Connector referrals', 'कनेक्टर रेफ़रल')} value={cn.referrals} onClick={() => onNavigate('connector')} />
        <Card title={tx('Unassigned referrals', 'बिना असाइन रेफ़रल')} value={cn.unassigned} tone={cn.unassigned ? 'warn' : 'ok'} onClick={() => onNavigate('connector')} />
        <Card title={tx('Rewards to approve', 'मंज़ूर करने वाले रिवॉर्ड')} value={cn.rewardApprovals} tone={cn.rewardApprovals ? 'warn' : 'ok'} onClick={() => onNavigate('connector')} />
        <Card title={tx('Payouts due', 'देय पेआउट')} value={formatINR(cn.payoutsDueAmount)} hint={`${cn.payoutsDue} ${tx('partner payouts', 'पार्टनर पेआउट')}`} tone={cn.payoutsDue ? 'warn' : 'ok'} onClick={() => onNavigate('connector')} />
        <Card title={tx('Listings awaiting verification', 'वेरिफ़िकेशन बाकी लिस्टिंग')} value={d.inventory.moderationPending} onClick={() => onNavigate('properties')} />
        <Card title={tx('Invitations pending', 'बाकी इनवाइट')} value={d.invitations.pending} hint={`${d.invitations.redeemed} ${tx('redeemed', 'इस्तेमाल हुए')}`} onClick={() => onNavigate('onboarding')} />
        <Card title={tx('Privacy requests open', 'खुले प्राइवेसी अनुरोध')} value={d.privacy.openRequests} tone={d.privacy.openRequests ? 'warn' : 'ok'} onClick={() => onNavigate('onboarding')} />
        <Card title={tx('Audit chain', 'ऑडिट चेन')} value={intact ? tx('Intact', 'सही') : tx('BROKEN', 'टूटी')} tone={intact ? 'ok' : 'bad'} hint={tx('SHA-256 hash chain', 'SHA-256 हैश चेन')} onClick={() => onNavigate('audit')} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">{tx('Users by role', 'भूमिका के अनुसार यूज़र')}</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(d.users.byRole).map(([r, n]) => (
              <span key={r} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{label('role', r)}: <b>{n as number}</b></span>
            ))}
          </div>
          {d.users.mustChangePassword > 0 && (
            <p className="mt-3 flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> {d.users.mustChangePassword} {tx('account(s) still on a temporary password.', 'अकाउंट अभी अस्थायी पासवर्ड पर हैं।')}</p>
          )}
          {d.users.pendingKyc.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-2">
              <p className="text-xs font-semibold text-slate-700">{tx('Waiting for approval', 'मंज़ूरी का इंतज़ार')}</p>
              <ul className="mt-1 space-y-1">
                {d.users.pendingKyc.slice(0, 6).map((u: any) => (
                  <li key={u.id} className="flex items-center justify-between text-xs text-slate-600">
                    <span>{u.name} · {label('role', u.role)} · {u.city || '—'}</span>
                    <button className="text-indigo-600 hover:underline" onClick={() => onNavigate('onboarding')}>{tx('Review', 'देखें')}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">{tx('Platform settings', 'प्लेटफ़ॉर्म सेटिंग')}</h3>
          <label className="mb-2 flex items-center justify-between text-xs text-slate-700">
            <span>{tx('Maintenance mode (blocks everyone except admins)', 'मेंटेनेंस मोड (एडमिन के अलावा सबके लिए बंद)')}</span>
            <input type="checkbox" checked={form.maintenanceMode} onChange={(e) => setForm({ ...form, maintenanceMode: e.target.checked })} />
          </label>
          <label className="mb-2 flex items-center justify-between text-xs text-slate-700">
            <span>{tx('Require RERA number to approve brokers', 'ब्रोकर मंज़ूर करने के लिए RERA नंबर ज़रूरी')}</span>
            <input type="checkbox" checked={form.requireReraForBrokerApproval} onChange={(e) => setForm({ ...form, requireReraForBrokerApproval: e.target.checked })} />
          </label>
          <label className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-700">
            <span>{tx('Every new broker listing needs the owner’s consent first (link or signed form)', 'हर नई ब्रोकर लिस्टिंग से पहले मालिक की सहमति ज़रूरी (लिंक या साइन किया फ़ॉर्म)')}</span>
            <input type="checkbox" checked={form.ownerConsentRequired} onChange={(e) => setForm({ ...form, ownerConsentRequired: e.target.checked })} data-testid="consent-required-switch" />
          </label>
          <label className="mb-3 flex items-center justify-between gap-3 text-xs text-slate-700">
            <span>{tx('Default construction commission (%, 0.5–10)', 'डिफ़ॉल्ट कंस्ट्रक्शन कमीशन (%, 0.5–10)')}</span>
            <input type="number" step="0.5" min={0.5} max={10} className="w-20 rounded border border-slate-300 px-2 py-1" value={form.defaultConstructionCommissionPct}
              onChange={(e) => setForm({ ...form, defaultConstructionCommissionPct: Number(e.target.value) })} />
          </label>
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} {tx('Save settings', 'सेटिंग सेव करें')}
            </button>
            <button onClick={() => onNavigate('connector')} className="text-xs text-indigo-600 hover:underline">{tx('Connector reward amounts →', 'कनेक्टर रिवॉर्ड की रकम →')}</button>
          </div>
          {msg && <p className={`mt-2 text-xs ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.text}</p>}
        </div>
        <ProtectionAdmin />
        <div className="rounded-xl border border-slate-200 bg-white p-4"><TwoFactorCard /></div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">{tx('Recent audit events', 'हाल की ऑडिट घटनाएँ')}</h3>
        <ul className="divide-y divide-slate-100 text-xs text-slate-600">
          {d.audit.recent.map((e: any) => (
            <li key={e.id} className="flex items-center justify-between py-1.5">
              <span><b className="text-slate-800">{e.action}</b> · {e.entity} · {e.actor}</span>
              <span className="text-slate-400">{new Date(e.at).toLocaleString('en-IN')}</span>
            </li>
          ))}
          {!d.audit.recent.length && <li className="py-2 text-slate-400">{tx('No events yet.', 'अभी कोई घटना नहीं।')}</li>}
        </ul>
        <button className="mt-2 text-xs text-indigo-600 hover:underline" onClick={() => onNavigate('audit')}>{tx('Open full audit trail →', 'पूरा ऑडिट ट्रेल खोलें →')}</button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{tx('Function directory — every function, who may use it, where it lives', 'फ़ंक्शन डायरेक्टरी — हर फ़ंक्शन, कौन इस्तेमाल कर सकता है, कहाँ मिलेगा')} ({rows.length})</h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('Search function…', 'फ़ंक्शन खोजें…')} className="rounded-lg border border-slate-300 py-1.5 pl-7 pr-2 text-xs" />
            </div>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
              <option value="">{tx('All roles', 'सभी भूमिकाएँ')}</option>
              {roles.map((r) => <option key={r} value={r}>{label('role', r)}</option>)}
            </select>
          </div>
        </div>
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr><th className="p-2">{tx('Function', 'फ़ंक्शन')}</th><th className="p-2">{tx('What it does', 'क्या करता है')}</th><th className="p-2">{tx('Roles with access', 'किन भूमिकाओं को एक्सेस')}</th><th className="p-2" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const loc = locate(r.permission);
                return (
                  <tr key={r.permission} className="align-top">
                    <td className="p-2 font-mono text-[11px] text-slate-800">{r.permission}</td>
                    <td className="p-2 text-slate-600">{descOf(r)}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {r.roles.map((x) => <span key={x} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">{label('role', x)}</span>)}
                      </div>
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {loc && (
                        <button onClick={() => onNavigate(loc[1])} className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                          <ExternalLink className="h-3 w-3" /> {tx(loc[2].split('|')[0], loc[2].split('|')[1] || loc[2])}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400"><CheckCircle2 className="h-3 w-3" /> {tx('Generated live from the server permission catalog — it can never drift from what the API enforces.', 'सर्वर के परमिशन कैटलॉग से सीधे बना — API जो लागू करता है उससे कभी अलग नहीं हो सकता।')}</p>
      </section>
    </div>
  );
};
