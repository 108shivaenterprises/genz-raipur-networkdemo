import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, ArrowLeft, Star, FileText, Megaphone, Send, Trash2, UserPlus, ClipboardList } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { formatINR } from '../lib/utils.js';
import { facingLabel, featureLabel, roadSidesLabel } from '../shared/inventoryRules.js';
import { SEGMENT_LABEL, type Segment } from '../shared/launchRules.js';
import { useI18n } from '../lib/i18n.js';
import type { UserProfile } from '../types/index.js';

const inp = 'min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
const btn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-4 text-xs font-semibold disabled:opacity-50';
const dark = `${btn} bg-slate-900 text-white`;
const ghost = `${btn} border border-slate-300 bg-white text-slate-700`;

const REL: Record<string, [string, string, string]> = {
  ACTIVE: ['Active partner', 'सक्रिय पार्टनर', 'bg-emerald-100 text-emerald-800'],
  PAUSED: ['Paused by builder', 'बिल्डर ने रोका', 'bg-amber-100 text-amber-800'],
  SHORTLISTED: ['Shortlisted by builder', 'बिल्डर ने शॉर्टलिस्ट किया', 'bg-sky-100 text-sky-800'],
  APPLIED: ['Request sent', 'रिक्वेस्ट भेजी', 'bg-amber-100 text-amber-800'],
  INVITED: ['Invited', 'इनवाइट', 'bg-sky-100 text-sky-800'],
  NONE: ['Open to apply', 'अप्लाई करें', 'bg-slate-100 text-slate-600'],
  COMPLETED: ['Ended', 'समाप्त', 'bg-slate-100 text-slate-600'],
  DECLINED: ['Declined', 'मना किया', 'bg-red-100 text-red-700'],
  REVOKED: ['Partnership ended', 'साझेदारी खत्म', 'bg-red-100 text-red-700'],
};
const RelChip: React.FC<{ rel: string }> = ({ rel }) => {
  const tx = useTx(); const r = REL[rel] || REL.NONE;
  return <span className={`inline-block shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${r[2]}`}>{tx(r[0], r[1])}</span>;
};
const STAGE_HI: Record<string, [string, string]> = { NEW: ['New', 'नई'], CONTACTED: ['Contacted', 'संपर्क हुआ'], SITE_VISIT_SCHEDULED: ['Visit set', 'विज़िट तय'], SITE_VISITED: ['Visited', 'विज़िट हुई'], NEGOTIATION: ['Negotiating', 'बातचीत'], BOOKING_REQUESTED: ['Booking asked', 'बुकिंग माँगी'], BOOKED: ['Booked', 'बुक'], LOST: ['Lost', 'छूटी'] };

/** v16.8 — GENZ launches open (or about to open) for this partner's group. Local associates see a preview only. */
const LaunchStrip: React.FC<{ feed: { segment: string | null; items: any[] }; onOpen: (id: string) => void }> = ({ feed, onOpen }) => {
  const tx = useTx();
  const [open, setOpen] = useState<string | null>(null);
  // a launch is for finding NEW partners — projects this partner already sells are not repeated here
  const items = feed.items.filter(it => !['ACTIVE_ASSOCIATE', 'TOP_PERFORMER', 'PAUSED'].includes(it.relation));
  if (!items.length) return null;
  const seg = feed.segment ? SEGMENT_LABEL[feed.segment as Segment] : null;
  const when = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '');
  return (
    <section className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
      <h3 className="text-sm font-bold text-indigo-900">{tx('New launches from GENZ', 'GENZ की नई लॉन्चिंग')}{seg ? <span className="ml-2 text-[10px] font-semibold text-indigo-700">{tx(seg.en, seg.hi)}</span> : null}</h3>
      <div className="grid gap-2 md:grid-cols-2">
        {items.map(it => {
          const isOpen = open === it.id;
          return (
            <div key={it.id} className="rounded-lg border border-indigo-200 bg-white">
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : it.id)} className="block min-h-14 w-full p-3 text-left">
                <div className="flex items-start justify-between gap-2"><b className="text-sm text-slate-900">{it.projectName}</b>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${it.view === 'OPEN' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{it.view === 'OPEN' ? tx('Open now', 'अभी खुला') : it.view === 'SOON' ? `${tx('Opens', 'खुलेगा')} ${when(it.opensAt)}` : tx('Preview', 'झलक')}</span></div>
                <div className="text-[11px] text-slate-500">{[it.locality, it.city].filter(Boolean).join(', ')}</div>
                {it.headline && <div className="mt-1 text-xs text-slate-700">{it.headline}</div>}
              </button>
              {isOpen && (
                <div className="space-y-1.5 border-t border-indigo-100 p-3 text-xs">
                  {it.view === 'OPEN' && <>
                    <div className="text-slate-600">{it.builderName}{it.projectType ? ` · ${it.projectType}` : ''}{it.launchDate ? ` · ${tx('launch', 'लॉन्च')} ${it.launchDate}` : ''}</div>
                    {it.priceStartingFrom ? <div className="font-semibold">{formatINR(it.priceStartingFrom)}{it.priceMax ? `–${formatINR(it.priceMax)}` : '+'}</div> : null}
                    {it.defaultCommissionPct ? <div className="text-slate-600">{tx('Builder’s partner commission', 'बिल्डर का पार्टनर कमीशन')}: <b>{it.defaultCommissionPct}%</b> <span className="text-slate-400">({tx('paid by the builder; GENZ takes none', 'बिल्डर देता है; GENZ कुछ नहीं लेता')})</span></div> : null}
                    {it.note && <div className="text-slate-700">“{it.note}”</div>}
                    <button type="button" onClick={() => onOpen(it.id)} className="inline-flex min-h-10 items-center rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white">{['ACTIVE_ASSOCIATE', 'TOP_PERFORMER', 'ACTIVE'].includes(it.relation) ? tx('Open project', 'प्रोजेक्ट खोलें') : tx('See terms & apply', 'शर्तें देखें और अप्लाई करें')}</button>
                    <p className="text-[10px] text-slate-500">{tx('The builder still approves every partner.', 'हर पार्टनर को बिल्डर ही मंज़ूर करता है।')}</p>
                  </>}
                  {it.view === 'SOON' && <p className="text-slate-600">{tx(`This launch opens for your group on ${when(it.opensAt)}. Name and place only until then.`, `यह लॉन्चिंग आपके ग्रुप के लिए ${when(it.opensAt)} को खुलेगी। तब तक सिर्फ़ नाम और जगह।`)}</p>}
                  {it.view === 'TEASER' && <p className="text-slate-600">{tx('Local associates get a preview only — no rates, units or commission. To sell RERA projects, add your RERA registration in your profile.', 'लोकल एसोसिएट को सिर्फ़ झलक मिलती है — रेट, यूनिट या कमीशन नहीं। RERA प्रोजेक्ट बेचने के लिए प्रोफ़ाइल में अपना RERA रजिस्ट्रेशन जोड़ें।')}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export const MyProjectsView: React.FC<{ currentUser: UserProfile; onNavigate: (t: any) => void }> = ({ currentUser, onNavigate }) => {
  const tx = useTx();
  const [rows, setRows] = useState<any[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [sub, setSub] = useState<'projects' | 'shortlist'>('projects');
  const [err, setErr] = useState('');
  const load = useCallback(() => api.ppProjects().then(r => setRows(r.projects)).catch(e => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const [feed, setFeed] = useState<{ segment: string | null; items: any[] }>({ segment: null, items: [] });
  useEffect(() => { if (currentUser.role === 'BROKER') api.launchFeed().then(r => setFeed({ segment: r.segment, items: r.items })).catch(() => { /* strip simply stays hidden */ }); }, [currentUser.role]);
  if (err) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (!rows) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  if (sel) return <ProjectPage id={sel} onBack={() => { setSel(null); load(); }} onNavigate={onNavigate} />;
  const groups: [string, string, string[]][] = [
    ['My projects', 'मेरे प्रोजेक्ट', ['ACTIVE', 'PAUSED']],
    ['Waiting for the builder', 'बिल्डर के जवाब का इंतज़ार', ['SHORTLISTED', 'APPLIED', 'INVITED']],
    ['Open — apply to sell', 'खुले — बेचने के लिए अप्लाई करें', ['NONE']],
    ['Ended / declined', 'समाप्त / मना', ['COMPLETED', 'DECLINED', 'REVOKED']],
  ];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{tx('My Projects', 'मेरे प्रोजेक्ट')}</h2>
        <p className="text-xs text-slate-500">{tx('Every builder project in one place: your status, terms, notices, your clients shortlisted per project, and your leads.', 'हर बिल्डर प्रोजेक्ट एक जगह: आपकी स्थिति, शर्तें, सूचनाएँ, प्रोजेक्ट-वार शॉर्टलिस्ट क्लाइंट और आपकी लीड।')}</p>
      </div>
      <div className="flex gap-1.5" role="tablist">
        {([['projects', 'Projects', 'प्रोजेक्ट', ClipboardList], ['shortlist', 'Shortlist board', 'शॉर्टलिस्ट बोर्ड', Star]] as const).map(([k, en, hi, Icon]) => (
          <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-xs font-semibold ${sub === k ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}><Icon className="h-4 w-4" />{tx(en, hi)}</button>
        ))}
      </div>
      {sub === 'shortlist' && <ShortlistBoard rows={rows} onOpen={setSel} />}
      {sub === 'projects' && (
        <>
          <LaunchStrip feed={feed} onOpen={setSel} />
          {rows.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{tx('No projects are open to partners in your area yet.', 'आपके इलाके में अभी कोई प्रोजेक्ट पार्टनर्स के लिए खुला नहीं।')}</p>}
          {groups.map(([en, hi, rels]) => {
            const g = rows.filter(r => rels.includes(r.relation));
            if (!g.length) return null;
            return (
              <section key={en} className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{tx(en, hi)} ({g.length})</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {g.map(p => (
                    <button key={p.id} onClick={() => setSel(p.id)} className="w-full min-w-0 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-slate-400">
                      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900">{p.projectName}</div><div className="truncate text-xs text-slate-500">{p.builderName} · {p.locality}, {p.city}</div></div><RelChip rel={p.relation} /></div>
                      <div className="mt-1 text-xs text-slate-600">{formatINR(p.priceStartingFrom)}–{formatINR(p.priceMax)} · {p.availableUnits} {tx('units', 'यूनिट')}</div>
                      {p.myTerms ? <div className="mt-1 text-[11px] text-emerald-700">{p.myTerms.commissionPct}% · {tx('target', 'टारगेट')} {p.myTerms.sold}/{p.myTerms.quota}{p.myTerms.dailyLeadCap ? ` · ${p.myTerms.dailyLeadCap}/${tx('day', 'दिन')}` : ''}</div> : <div className="mt-1 text-[11px] text-slate-500">{tx('Default commission', 'डिफ़ॉल्ट कमीशन')} {p.defaultCommissionPct}%</div>}
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-600">
                        {p.myLeads > 0 && <span className="rounded bg-slate-100 px-1.5 py-0.5">{p.myOpen}/{p.myLeads} {tx('leads', 'लीड')}</span>}
                        {p.myBooked > 0 && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{p.myBooked} {tx('booked', 'बुक')}</span>}
                        {p.shortlisted > 0 && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">★ {p.shortlisted} {tx('shortlisted', 'शॉर्टलिस्ट')}</span>}
                        {p.myPendingVerify > 0 && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-700">{p.myPendingVerify} {tx('awaiting builder check', 'बिल्डर चेक बाकी')}</span>}
                        {p.notices > 0 && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">📣 {p.notices}</span>}
                        {p.leadIntake === 'PAUSED' && p.relation === 'ACTIVE' && <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">⏸ {tx('new leads paused', 'नई लीड बंद')}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
};

/** project-wise board of my shortlisted clients, across every project */
const ShortlistBoard: React.FC<{ rows: any[]; onOpen: (id: string) => void }> = ({ rows, onOpen }) => {
  const tx = useTx();
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => { api.ppShortlist().then(r => setItems(r.shortlist)).catch(() => setItems([])); }, []);
  if (!items) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>;
  const ids = [...new Set(items.map(i => i.projectId))];
  if (!ids.length) return <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{tx('No client shortlisted yet. Open a project and tap “Shortlist a client”.', 'अभी कोई क्लाइंट शॉर्टलिस्ट नहीं। प्रोजेक्ट खोलकर “क्लाइंट शॉर्टलिस्ट करें” दबाएँ।')}</p>;
  return (
    <div className="space-y-3">
      {ids.map(pid => {
        const list = items.filter(i => i.projectId === pid); const row = rows.find(r => r.id === pid);
        return (
          <div key={pid} className="rounded-xl border border-slate-200 bg-white p-3">
            <button onClick={() => onOpen(pid)} className="flex w-full items-center justify-between gap-2 text-left"><span className="text-sm font-bold text-slate-900">{list[0].projectName}</span>{row && <RelChip rel={row.relation} />}</button>
            <ul className="mt-2 divide-y divide-slate-100 text-xs">
              {list.map(i => <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="font-medium">{i.clientName}</span><span className="text-slate-500">{i.units.join(', ') || '—'}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${i.status === 'LEAD_REGISTERED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{i.status === 'LEAD_REGISTERED' ? tx('Lead registered', 'लीड रजिस्टर') : tx('Shortlisted', 'शॉर्टलिस्ट')}</span></li>)}
            </ul>
          </div>
        );
      })}
    </div>
  );
};

const ProjectPage: React.FC<{ id: string; onBack: () => void; onNavigate: (t: any) => void }> = ({ id, onBack, onNavigate }) => {
  const tx = useTx();
  const label = useLabel();
  const [d, setD] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [note, setNote] = useState('');
  const [f, setF] = useState({ clientId: '', name: '', units: '', note: '' });
  const [openU, setOpenU] = useState<any>(null);
  const hiL = useI18n().lang === 'hi';
  const [phoneFor, setPhoneFor] = useState<{ id: string; v: string } | null>(null);
  const flash = (ok: boolean, msg: string) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 4500); };
  const load = useCallback(() => api.ppProject(id).then(setD).catch(e => flash(false, e.message)), [id]);
  useEffect(() => { load(); api.ppClients().then(r => setClients(r.clients)).catch(() => undefined); }, [load]);
  const run = async (fn: () => Promise<any>, ok: string) => { try { await fn(); flash(true, ok); await load(); return true; } catch (e: any) { flash(false, e.message); return false; } };
  // DPDP: the associate attests that the customer agreed to be contacted before a lead is registered
  const consentOk = () => window.confirm(tx('I confirm this customer agreed to be contacted about this project (call / WhatsApp).', 'मैं पुष्टि करता/करती हूँ कि ग्राहक ने इस प्रोजेक्ट के बारे में संपर्क (कॉल / WhatsApp) की सहमति दी है।'));
  if (!d) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  const p = d.project; const live = ['ACTIVE', 'PAUSED'].includes(d.relation);
  const addUnit = (u: string) => setF(x => ({ ...x, units: x.units.split(',').map(s => s.trim()).filter(Boolean).includes(u) ? x.units : [x.units.trim().replace(/,$/, ''), u].filter(Boolean).join(', ') }));
  const unitsArr = f.units.split(',').map(s => s.trim()).filter(Boolean).slice(0, 10);
  const stageCount = d.leads.reduce((a: any, l: any) => { a[l.stage] = (a[l.stage] || 0) + 1; return a; }, {});
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-slate-600"><ArrowLeft className="h-4 w-4" /> {tx('All projects', 'सभी प्रोजेक्ट')}</button>
      <div className="rounded-xl bg-slate-900 p-4 text-white">
        <div className="flex items-start justify-between gap-2"><div><div className="text-base font-bold">{p.projectName}</div><div className="text-xs text-slate-300">{p.builderName} · {p.locality}, {p.city}</div></div><RelChip rel={d.relation} /></div>
        <div className="mt-2 text-xs text-slate-300">{formatINR(p.priceStartingFrom)}–{formatINR(p.priceMax)} · {p.availableUnits}/{p.totalUnits} {tx('units', 'यूनिट')} · {label('builderProjectStage', p.projectStage)}{p.completionTarget ? ` · ${p.completionTarget}` : ''}</div>
        {p.tagline && <div className="mt-1 text-xs italic text-slate-300">{p.tagline}</div>}
      </div>
      {toast && <div className={`rounded-lg px-3 py-2 text-xs font-medium ${toast.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} role="status">{toast.msg}</div>}
      {d.statusReason && !live && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{d.statusReason}</p>}
      {d.relation === 'PAUSED' && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{tx('The builder paused your partnership', 'बिल्डर ने आपकी साझेदारी रोकी है')}{d.statusReason ? `: ${d.statusReason}` : ''}. {tx('Your existing leads stay protected; you cannot register new ones.', 'आपकी मौजूदा लीड सुरक्षित हैं; नई रजिस्टर नहीं कर सकते।')}</p>}
      {live && p.leadIntake === 'PAUSED' && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">⏸ {tx('The builder has paused new lead registrations', 'बिल्डर ने नई लीड रजिस्ट्रेशन रोकी है')}{p.intakeNote ? ` — ${p.intakeNote}` : ''}</p>}

      {d.relation === 'NONE' && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold">{tx('Want to sell this project?', 'यह प्रोजेक्ट बेचना चाहते हैं?')}</h3>
          <p className="text-xs text-slate-500">{tx('Send a request. The builder reviews your profile and decides; default commission', 'रिक्वेस्ट भेजें। बिल्डर आपकी प्रोफ़ाइल देखकर तय करेगा; डिफ़ॉल्ट कमीशन')} {p.defaultCommissionPct}%.</p>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder={tx('A line about your experience in this area (optional)', 'इस इलाके में आपके अनुभव की एक लाइन (वैकल्पिक)')} className={`${inp} min-h-20`} maxLength={300} />
          <button className={dark} onClick={() => run(() => api.ppApply(id, note), tx('Request sent to the builder', 'बिल्डर को रिक्वेस्ट भेजी'))}><Send className="h-4 w-4" />{tx('Request to sell', 'बेचने की रिक्वेस्ट')}</button>
        </div>
      )}
      {d.relation === 'APPLIED' && <p className="rounded-lg bg-sky-50 p-3 text-xs text-sky-800">{tx('Your request is with the builder. You will see the decision here.', 'आपकी रिक्वेस्ट बिल्डर के पास है। फ़ैसला यहीं दिखेगा।')}</p>}

      {d.terms && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <h3 className="text-sm font-bold text-emerald-900">{tx('Your terms', 'आपकी शर्तें')}</h3>
          <div className="mt-2 grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-lg bg-white p-2"><div className="text-lg font-bold">{d.terms.commissionPct}%</div>{tx('commission', 'कमीशन')}</div>
            <div className="rounded-lg bg-white p-2"><div className="text-lg font-bold">{d.terms.sold}/{d.terms.quota}</div>{tx('target units', 'टारगेट यूनिट')}</div>
          </div>
          <p className="mt-2 text-[11px] text-slate-600">{d.terms.dailyLeadCap ? `${tx('Max new leads per day', 'रोज़ अधिकतम नई लीड')}: ${d.terms.dailyLeadCap}. ` : ''}{d.terms.validUntil ? `${tx('Partnership till', 'साझेदारी तक')} ${new Date(d.terms.validUntil).toLocaleDateString('en-IN')}. ` : ''}{p.leadVerification === 'MANUAL' ? tx('The builder checks each new lead (auto-accepted after 48 h). ', 'बिल्डर हर नई लीड देखता है (48 घंटे में ऑटो-मंज़ूर)। ') : ''}{tx('Registered customers stay yours for', 'रजिस्टर किया ग्राहक आपके पास रहता है')} {p.registrationDays} {tx('days.', 'दिन।')}</p>
          {d.terms.history.length > 1 && <details className="mt-2 text-[11px] text-slate-600"><summary className="cursor-pointer font-semibold">{tx('Terms history', 'शर्तों का इतिहास')}</summary><ul className="mt-1 space-y-0.5">{d.terms.history.map((h: any, i: number) => <li key={i}>{new Date(h.at).toLocaleDateString('en-IN')} — {h.commissionPct}% / {h.quota} · {h.note}</li>)}</ul></details>}
        </section>
      )}

      {d.updates.length > 0 && (
        <section className="space-y-2"><h3 className="flex items-center gap-1.5 text-sm font-bold"><Megaphone className="h-4 w-4" />{tx('Builder notices', 'बिल्डर की सूचनाएँ')}</h3>
          {d.updates.map((u: any) => <div key={u.id} className="rounded-xl border border-violet-200 bg-violet-50/50 p-3"><div className="flex flex-wrap items-center gap-1.5 text-[10px]"><span className="rounded-full bg-violet-100 px-2 py-0.5 font-bold text-violet-800">{u.kind}</span><span className="text-slate-500">{new Date(u.createdAt).toLocaleDateString('en-IN')}{u.validUntil ? ` · ${tx('till', 'तक')} ${u.validUntil.slice(0, 10)}` : ''}</span></div><div className="mt-1 text-sm font-semibold">{u.title}</div>{u.body && <p className="text-xs text-slate-700">{u.body}</p>}</div>)}
        </section>
      )}
      {d.collateral.length > 0 && (
        <section className="space-y-2"><h3 className="text-sm font-bold">{tx('Brochures & documents', 'ब्रोशर और दस्तावेज़')}</h3>
          <div className="flex flex-wrap gap-2">{d.collateral.map((c: any) => <a key={c.id} href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-sky-800 underline"><FileText className="h-4 w-4" />{c.title}</a>)}</div></section>
      )}

      {live && !(d.availableUnits_list?.length > 0) && (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-600" data-testid="pp-no-units">
          {tx('The builder has not put the unit / plot list with rates here yet. You can still shortlist clients and register leads; ask the builder to add the units (Associates CRM → Inventory).', 'बिल्डर ने अभी यहाँ यूनिट / प्लॉट की लिस्ट और रेट नहीं डाले हैं। आप फिर भी क्लाइंट शॉर्टलिस्ट कर सकते हैं और लीड दर्ज कर सकते हैं; बिल्डर से यूनिट डालने को कहें (एसोसिएट्स CRM → इन्वेंटरी)।')}
        </section>
      )}
      {live && d.availableUnits_list.length > 0 && (
        <section className="space-y-2"><h3 className="text-sm font-bold">{tx('Available units', 'उपलब्ध यूनिट')} ({d.units.AVAILABLE})</h3>
          <div className="flex gap-2 overflow-x-auto pb-1">{d.availableUnits_list.map((u: any) => <button type="button" key={u.label} onClick={() => setOpenU(openU?.id === u.id ? null : u)} aria-pressed={openU?.id === u.id} className={`min-h-16 min-w-28 shrink-0 rounded-lg border bg-white p-2 text-center text-xs ${openU?.id === u.id ? 'border-slate-900 ring-2 ring-slate-900' : 'border-slate-200'}`}><div className="font-bold">{u.label}</div><div className="text-slate-500">{u.config}</div><div className="font-semibold">{u.price != null ? formatINR(u.price) : tx('Price on request', 'कीमत पूछें')}</div>{(u.roadSides || u.facing) && <div className="text-[10px] text-slate-500">{u.roadSides ? roadSidesLabel(u.roadSides, hiL) : ''}</div>}</button>)}</div>
          {openU && (
            <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="flex items-center justify-between"><b className="text-sm">{openU.label} · {openU.group}</b><button type="button" onClick={() => setOpenU(null)} className="text-slate-500 underline">{tx('Close', 'बंद')}</button></div>
              <div className="text-slate-600">{openU.config}{openU.areaSqft ? ` · ${openU.areaSqft} ${tx('sq ft', 'वर्ग फ़ुट')}` : ''}{openU.dimensions ? ` · ${openU.dimensions}` : ''}</div>
              <div className="font-semibold">{openU.price != null ? `${formatINR(openU.price)}${openU.ratePerSqft ? ` (≈ ₹${openU.ratePerSqft.toLocaleString('en-IN')}/${tx('sq ft', 'वर्ग फ़ुट')})` : ''}` : tx('Price on request — the builder has not shared the rate', 'कीमत पूछें — बिल्डर ने रेट साझा नहीं किया')}</div>
              <div className="flex flex-wrap gap-1.5">
                {openU.roadSides ? <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-300">{roadSidesLabel(openU.roadSides, hiL)}{openU.roadWidthFt ? ` · ${openU.roadWidthFt} ft` : ''}</span> : null}
                {openU.facing ? <span className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-300">{facingLabel(openU.facing, hiL)} {tx('facing', 'मुखी')}</span> : null}
                {(openU.features || []).map((x: string) => <span key={x} className="rounded-full bg-white px-2 py-1 ring-1 ring-slate-300">{featureLabel(x, hiL)}</span>)}
              </div>
              {openU.note && <div className="text-slate-700">“{openU.note}”</div>}
            </div>
          )}
          <button className={ghost} onClick={() => onNavigate('crm')}>{tx('Hold a unit / send to a customer in CRM →', 'CRM में यूनिट होल्ड / ग्राहक को भेजें →')}</button></section>
      )}

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-bold"><Star className="h-4 w-4 text-amber-500" />{tx('My shortlist for this project', 'इस प्रोजेक्ट के लिए मेरी शॉर्टलिस्ट')} ({d.shortlist.length})</h3>
        <p className="text-[11px] text-slate-500">{tx('Private to you. The builder only sees how many clients are lined up — never their names.', 'सिर्फ़ आपको दिखती है। बिल्डर को सिर्फ़ गिनती दिखती है — नाम नहीं।')}</p>
        <div className="grid gap-2 md:grid-cols-2">
          <select value={f.clientId} onChange={e => setF({ ...f, clientId: e.target.value, name: '' })} className={inp}><option value="">{tx('Pick from my clients…', 'मेरे क्लाइंट में से चुनें…')}</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.budgetMax ? ` · ≤ ${formatINR(c.budgetMax)}` : ''}</option>)}</select>
          {!f.clientId && <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder={tx('…or type a name', '…या नाम लिखें')} className={inp} maxLength={120} />}
        </div>
        <input value={f.units} onChange={e => setF({ ...f, units: e.target.value })} placeholder={tx('Units / plots he liked (e.g. A-101, A-102)', 'पसंद की यूनिट / प्लॉट (जैसे A-101)')} className={inp} />
        {live && d.availableUnits_list.length > 0 && <div className="flex flex-wrap gap-1.5">{d.availableUnits_list.slice(0, 12).map((u: any) => <button type="button" key={u.label} onClick={() => addUnit(u.label)} className="min-h-9 rounded-full border border-slate-300 px-3 text-[11px]">{u.label}</button>)}</div>}
        <input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder={tx('Note (e.g. wants east facing)', 'नोट (जैसे पूर्वमुखी चाहिए)')} className={inp} maxLength={300} />
        <button disabled={!f.clientId && f.name.trim().length < 2} className={dark} onClick={async () => { if (await run(() => api.ppShortlistAdd(id, { clientId: f.clientId || undefined, clientName: f.clientId ? undefined : f.name, units: unitsArr, note: f.note }), tx('Added to shortlist', 'शॉर्टलिस्ट में जोड़ा'))) setF({ clientId: '', name: '', units: '', note: '' }); }}><UserPlus className="h-4 w-4" />{tx('Shortlist a client', 'क्लाइंट शॉर्टलिस्ट करें')}</button>
        <ul className="divide-y divide-slate-100">
          {d.shortlist.map((s: any) => (
            <li key={s.id} className="py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0"><div className="text-sm font-semibold">{s.clientName}</div><div className="text-[11px] text-slate-500">{s.units.join(', ') || tx('no unit picked', 'यूनिट नहीं चुनी')}{s.note ? ` · ${s.note}` : ''}</div></div>
                <div className="flex items-center gap-1.5">
                  {s.status === 'LEAD_REGISTERED'
                    ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">{tx('Lead registered', 'लीड रजिस्टर')}</span>
                    : <button disabled={!live || p.leadIntake === 'PAUSED'} className={`${btn} bg-emerald-600 text-white`} onClick={() => (s.clientId ? (consentOk() && run(() => api.ppShortlistRegister(s.id, { consent: true }), tx('Registered as protected lead', 'सुरक्षित लीड रजिस्टर हुई'))) : setPhoneFor({ id: s.id, v: '' }))}>{tx('Register as lead', 'लीड रजिस्टर करें')}</button>}
                  {s.status !== 'LEAD_REGISTERED' && <button aria-label={tx('Remove', 'हटाएँ')} className="min-h-11 min-w-11 text-slate-400 hover:text-red-600" onClick={() => run(() => api.ppShortlistDrop(s.id), tx('Removed', 'हटाया'))}><Trash2 className="mx-auto h-4 w-4" /></button>}
                </div>
              </div>
              {phoneFor && phoneFor.id === s.id && <div className="mt-2 flex gap-2"><input autoFocus inputMode="numeric" value={phoneFor.v} onChange={e => setPhoneFor({ id: s.id, v: e.target.value })} placeholder={tx('Client mobile (10 digits)', 'क्लाइंट का मोबाइल (10 अंक)')} className={inp} /><button className={dark} onClick={async () => { if (consentOk() && await run(() => api.ppShortlistRegister(s.id, { phone: phoneFor.v, consent: true }), tx('Registered as protected lead', 'सुरक्षित लीड रजिस्टर हुई'))) setPhoneFor(null); }}>OK</button></div>}
            </li>
          ))}
          {d.shortlist.length === 0 && <li className="py-3 text-center text-xs text-slate-400">{tx('Nobody shortlisted yet.', 'अभी कोई शॉर्टलिस्ट नहीं।')}</li>}
        </ul>
        {!live && d.relation !== 'NONE' && <p className="text-[10px] text-slate-500">{tx('You can register leads once your partnership is active.', 'साझेदारी सक्रिय होने पर लीड रजिस्टर कर पाएँगे।')}</p>}
        {d.relation === 'NONE' && <p className="text-[10px] text-slate-500">{tx('Shortlisting works even before you are a partner — you can register the lead after approval.', 'पार्टनर बनने से पहले भी शॉर्टलिस्ट कर सकते हैं — मंज़ूरी के बाद लीड रजिस्टर करें।')}</p>}
      </section>

      {d.leads.length > 0 && (
        <section className="space-y-2"><h3 className="text-sm font-bold">{tx('My leads here', 'यहाँ मेरी लीड')} ({d.leads.length})</h3>
          <div className="flex flex-wrap gap-1.5 text-[10px]">{Object.entries(stageCount).map(([k, n]) => <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{STAGE_HI[k] ? tx(STAGE_HI[k][0], STAGE_HI[k][1]) : k} {n as number}</span>)}</div>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {d.leads.slice(0, 20).map((l: any) => <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs"><span className="font-semibold">{l.name}</span><span className="text-slate-500">{STAGE_HI[l.stage] ? tx(STAGE_HI[l.stage][0], STAGE_HI[l.stage][1]) : l.stage}{l.verify === 'PENDING' ? ` · ${tx('builder check pending', 'बिल्डर चेक बाकी')}` : ''}{l.assignedMemberName ? ` · ${l.assignedMemberName}` : ''}</span></li>)}
          </ul>
          <button className={ghost} onClick={() => onNavigate('crm')}>{tx('Open CRM →', 'CRM खोलें →')}</button></section>
      )}
      {d.bookings.length > 0 && (
        <section className="space-y-2"><h3 className="text-sm font-bold">{tx('My bookings', 'मेरी बुकिंग')}</h3>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">{d.bookings.map((b: any) => <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs"><span><b>{b.customerName}</b> · {b.unitNo}</span><span className="text-slate-500">{label('status', b.status)} · {formatINR(b.brokerageAmount)}</span></li>)}</ul></section>
      )}
    </div>
  );
};
