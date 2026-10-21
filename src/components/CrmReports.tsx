import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { LOST_CODES } from '../shared/crmRules.js';
import { inr } from './CrmPlus.js';
import { sourceLabel, optLabel, TEAM_ROLES } from '../shared/crmSales.js';

/** v16 — CRM reports: funnel, project / associate / source tables, lost reasons, aging and money flags. Pure CSS bars, no chart library. */
const Bar: React.FC<{ value: number; max: number; tone?: string }> = ({ value, max, tone = 'bg-slate-800' }) => (
  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${tone}`} style={{ width: `${max ? Math.max(2, Math.round((value / max) * 100)) : 0}%` }} /></div>
);
const Card: React.FC<{ title: string; children: React.ReactNode; wide?: boolean }> = ({ title, children, wide }) => (
  <section className={`min-w-0 rounded-xl border border-slate-200 bg-white p-3 ${wide ? 'md:col-span-2' : ''}`}><h3 className="mb-2 text-xs font-bold text-slate-900">{title}</h3>{children}</section>
);
const Th: React.FC<{ children?: React.ReactNode; right?: boolean }> = ({ children, right }) => <th className={`whitespace-nowrap px-2 py-1.5 text-[10px] font-semibold uppercase text-slate-500 ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
const Td: React.FC<{ children?: React.ReactNode; right?: boolean; bold?: boolean; tone?: string }> = ({ children, right, bold, tone }) => <td className={`px-2 py-1.5 ${right ? 'text-right' : ''} ${bold ? 'font-semibold' : ''} ${tone || ''}`}>{children}</td>;

export const ReportsPanel: React.FC = () => {
  const tx = useTx(); const { lang } = useI18n();
  const [days, setDays] = useState(90); const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { setD(null); setErr(''); api.crmReports(days).then(setD).catch(e => setErr(e.message)); }, [days]);
  if (err) return <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>;
  if (!d) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>;
  const fmax = d.funnel[0]?.count || 1; const lmax = d.lostReasons[0]?.count || 1; const amax = Math.max(1, ...d.aging.map((a: any) => a.count));
  const lostLabel = (code: string, en: string) => { const c = LOST_CODES.find(x => x.id === code); return c ? (lang === 'hi' ? c.hi : c.en) : en; };
  const FUN: Record<string, [string, string]> = { REGISTERED: ['Registered', 'रजिस्टर्ड'], CONTACTED: ['Contacted', 'संपर्क हुआ'], SITE_VISITED: ['Visited site', 'साइट देखी'], NEGOTIATION: ['Negotiating', 'बातचीत'], BOOKING_REQUESTED: ['Booking asked', 'बुकिंग माँगी'], BOOKED: ['Booked', 'बुक'] };
  const m = d.money;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">{tx(`Leads registered in the last ${d.days} days · ${d.totals.leads} leads, ${d.totals.active} active, ${d.totals.booked} booked, ${d.totals.lost} lost`, `पिछले ${d.days} दिनों में रजिस्टर हुई लीड · ${d.totals.leads} लीड, ${d.totals.active} सक्रिय, ${d.totals.booked} बुक, ${d.totals.lost} लॉस्ट`)}</p>
        <select value={days} onChange={e => setDays(Number(e.target.value))} className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs" aria-label={tx('Period', 'अवधि')}>{[30, 90, 180, 365].map(n => <option key={n} value={n}>{tx(`Last ${n} days`, `पिछले ${n} दिन`)}</option>)}</select>
      </div>

      {m && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            [tx('Overdue collections', 'ओवरड्यू वसूली'), inr(m.overdueTotal), m.overdueTotal ? 'text-red-600' : ''],
            [tx('Brokerage payable now', 'अभी देय ब्रोकरेज'), inr(m.payable), 'text-emerald-700'],
            [tx('Payouts to confirm / disputed', 'कन्फ़र्म बाकी / विवादित'), `${m.unconfirmedPayouts} / ${m.disputedPayouts}`, m.disputedPayouts ? 'text-red-600' : ''],
            [tx('Open payment claims', 'खुले पेमेंट क्लेम'), String(m.openClaims), m.openClaims ? 'text-amber-700' : ''],
          ].map(([k, v, tone]) => <div key={k} className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-[10px] font-semibold uppercase text-slate-500">{k}</div><div className={`mt-1 text-lg font-bold ${tone || 'text-slate-900'}`}>{v}</div></div>)}
          {m.clawbackDue > 0 && <div className="col-span-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800 md:col-span-4">{tx(`Brokerage clawback still due: ${inr(m.clawbackDue)}`, `ब्रोकरेज वापसी बाकी: ${inr(m.clawbackDue)}`)}</div>}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Card title={tx('Funnel', 'फ़नल')}>
          <ul className="space-y-2">{d.funnel.map((s: any) => (
            <li key={s.id} className="flex items-center gap-2 text-[11px]"><span className="w-24 shrink-0 text-slate-700">{lang === 'hi' ? FUN[s.id]?.[1] : FUN[s.id]?.[0]}</span><Bar value={s.count} max={fmax} /><b className="w-8 text-right text-slate-900">{s.count}</b><span className="w-10 text-right text-slate-400">{s.id === 'REGISTERED' ? '' : `${s.pctOfPrev}%`}</span></li>
          ))}</ul>
          <p className="mt-2 text-[10px] text-slate-400">{tx('% = share of the previous step.', '% = पिछले चरण का हिस्सा।')}</p>
        </Card>
        <Card title={tx('Why leads are lost', 'लीड क्यों गईं')}>
          {d.lostReasons.length === 0 ? <p className="text-xs text-slate-500">{tx('No lost leads in this period.', 'इस अवधि में कोई लॉस्ट लीड नहीं।')}</p> : (
            <ul className="space-y-2">{d.lostReasons.map((r: any) => <li key={r.code} className="flex items-center gap-2 text-[11px]"><span className="w-32 shrink-0 truncate text-slate-700">{lostLabel(r.code, r.label)}</span><Bar value={r.count} max={lmax} tone="bg-red-500" /><b className="w-7 text-right">{r.count}</b></li>)}</ul>
          )}
        </Card>
        <Card title={tx('Age of active leads', 'सक्रिय लीड की उम्र')}>
          <ul className="space-y-2">{d.aging.map((a: any) => <li key={a.label} className="flex items-center gap-2 text-[11px]"><span className="w-20 shrink-0 text-slate-700">{a.label}</span><Bar value={a.count} max={amax} tone={a.label.startsWith('60') ? 'bg-amber-500' : 'bg-sky-500'} /><b className="w-7 text-right">{a.count}</b></li>)}</ul>
        </Card>
        <Card title={tx('Lead sources', 'लीड स्रोत')}>
          <div className="overflow-x-auto"><table className="w-full text-[11px]"><thead><tr><Th>{tx('Source', 'स्रोत')}</Th><Th right>{tx('Leads', 'लीड')}</Th><Th right>{tx('Booked', 'बुक')}</Th><Th right>%</Th></tr></thead>
            <tbody>{d.bySource.map((s: any) => <tr key={s.id} className="border-t border-slate-100"><Td>{sourceLabel(s.id, lang === 'hi')}</Td><Td right>{s.leads}</Td><Td right>{s.booked}</Td><Td right bold>{s.convPct}%</Td></tr>)}</tbody></table></div>
        </Card>

        {(d.speedToLeadHours != null || (d.byMember && d.byMember.length > 0)) && (
          <Card title={tx('Telecalling & team', 'टेलीकॉलिंग और टीम')} wide>
            {d.speedToLeadHours != null && <p className="mb-2 text-[11px] text-slate-600">{tx('Typical time from registering a lead to the first call:', 'लीड दर्ज होने से पहली कॉल तक का सामान्य समय:')} <b className="text-slate-900">{d.speedToLeadHours < 1 ? tx(`${Math.round(d.speedToLeadHours * 60)} min`, `${Math.round(d.speedToLeadHours * 60)} मिनट`) : tx(`${d.speedToLeadHours} h`, `${d.speedToLeadHours} घंटे`)}</b></p>}
            {d.byMember && d.byMember.length > 0 && (
              <div className="overflow-x-auto"><table className="w-full min-w-[36rem] text-[11px]"><thead><tr><Th>{tx('Member', 'सदस्य')}</Th><Th right>{tx('Calls', 'कॉल')}</Th><Th right>{tx('Connected', 'बात हुई')}</Th><Th right>%</Th><Th right>{tx('Visits fixed', 'विज़िट तय')}</Th><Th right>{tx('Forwarded out / in', 'भेजी / मिली')}</Th><Th right>{tx('Open', 'खुली')}</Th><Th right>{tx('Booked', 'बुक')}</Th></tr></thead>
                <tbody>{d.byMember.map((m: any) => <tr key={m.id} className="border-t border-slate-100"><Td bold>{m.name}<span className="block text-[10px] font-normal text-slate-500">{optLabel(TEAM_ROLES, m.role, lang === 'hi')}</span></Td><Td right>{m.calls}</Td><Td right>{m.connected}</Td><Td right bold>{m.connectPct}%</Td><Td right>{m.visitsFixed}</Td><Td right>{m.forwardedOut} / {m.forwardedIn}</Td><Td right>{m.open}</Td><Td right>{m.booked}</Td></tr>)}</tbody></table></div>
            )}
          </Card>
        )}

        <Card title={tx('Projects', 'प्रोजेक्ट')} wide>
          <div className="overflow-x-auto"><table className="w-full min-w-[30rem] text-[11px]"><thead><tr><Th>{tx('Project', 'प्रोजेक्ट')}</Th><Th right>{tx('Leads', 'लीड')}</Th><Th right>{tx('Visited', 'विज़िट')}</Th><Th right>{tx('Booked', 'बुक')}</Th><Th right>{tx('Lost', 'लॉस्ट')}</Th><Th right>%</Th><Th right>{tx('Sales value', 'बिक्री मूल्य')}</Th></tr></thead>
            <tbody>{d.byProject.map((p: any) => <tr key={p.id} className="border-t border-slate-100"><Td bold>{p.name}</Td><Td right>{p.leads}</Td><Td right>{p.visited}</Td><Td right>{p.booked}</Td><Td right>{p.lost}</Td><Td right bold>{p.convPct}%</Td><Td right>{inr(p.salesValue)}</Td></tr>)}</tbody></table></div>
        </Card>
        {d.byAssociate.length > 0 && (
          <Card title={tx('Associates — scorecard', 'एसोसिएट — स्कोरकार्ड')} wide>
            <div className="overflow-x-auto"><table className="w-full min-w-[36rem] text-[11px]"><thead><tr><Th>{tx('Associate', 'एसोसिएट')}</Th><Th right>{tx('Leads', 'लीड')}</Th><Th right>{tx('Contacted', 'संपर्क')}</Th><Th right>{tx('Visited', 'विज़िट')}</Th><Th right>{tx('Booked', 'बुक')}</Th><Th right>%</Th><Th right>{tx('1st reply (hrs)', 'पहला जवाब (घं.)')}</Th><Th right>{tx('Overdue', 'ओवरड्यू')}</Th><Th right>{tx('Stale', 'निष्क्रिय')}</Th></tr></thead>
              <tbody>{d.byAssociate.map((a: any) => <tr key={a.id} className="border-t border-slate-100"><Td bold>{a.name}</Td><Td right>{a.leads}</Td><Td right>{a.contacted}</Td><Td right>{a.visited}</Td><Td right>{a.booked}</Td><Td right bold>{a.convPct}%</Td><Td right>{a.avgFirstResponseHrs ?? '—'}</Td><Td right tone={a.overdue ? 'text-red-600 font-semibold' : ''}>{a.overdue}</Td><Td right tone={a.stale ? 'text-amber-700 font-semibold' : ''}>{a.stale}</Td></tr>)}</tbody></table></div>
          </Card>
        )}
        {m && m.overdueCollections.length > 0 && (
          <Card title={tx('Overdue collections', 'ओवरड्यू वसूली')} wide>
            <div className="overflow-x-auto"><table className="w-full min-w-[28rem] text-[11px]"><thead><tr><Th>{tx('Booking', 'बुकिंग')}</Th><Th>{tx('Customer', 'ग्राहक')}</Th><Th>{tx('Milestone', 'किस्त')}</Th><Th right>{tx('Pending', 'बाकी')}</Th><Th right>{tx('Days late', 'देरी (दिन)')}</Th></tr></thead>
              <tbody>{m.overdueCollections.map((o: any, i: number) => <tr key={i} className="border-t border-slate-100"><Td bold>{o.bookingId}</Td><Td>{o.customer}</Td><Td>{o.milestone}</Td><Td right>{inr(o.pending)}</Td><Td right tone="text-red-600 font-semibold">{o.days}</Td></tr>)}</tbody></table></div>
          </Card>
        )}
      </div>
    </div>
  );
};
