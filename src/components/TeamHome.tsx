import React, { useEffect, useState } from 'react';
import { useTx } from '../lib/i18n.js';
import { Contact, Briefcase, Loader2, Phone, MessageCircle, PhoneCall } from 'lucide-react';
import { api } from '../lib/api.js';
import { UserProfile, DealRoom } from '../types/index.js';
import { CheckinModal } from './CheckinModal.js';
import { StaffDesk } from './StaffDesk.js';
import type { TabType } from './NavigationTabs.js';

export const TeamHome: React.FC<{ currentUser: UserProfile; deals: DealRoom[]; onNavigate: (t: TabType) => void }> = ({ currentUser, deals, onNavigate }) => {
  const tx = useTx();
  const [leads, setLeads] = useState<any[] | null>(null);
  const [checkin, setCheckin] = useState(false);
  const er = currentUser.employerRole;
  const crmSide = !er || er === 'BROKER' || er === 'DEVELOPER_BUILDER';
  useEffect(() => { if (!crmSide) { setLeads([]); return; } api.crmLeads().then(r => setLeads(r.leads)).catch(() => setLeads([])); }, []);
  const open = (leads || []).filter(l => !['BOOKED', 'LOST'].includes(l.stage));
  const overdue = open.filter(l => (l.followUps || []).some((f: any) => !f.done && Date.parse(f.dueAt) < Date.now()));
  // v31 — the call list: overdue follow-ups first, then those due today, then brand-new leads (oldest first)
  const dueOf = (l: any): number | null => { const d = (l.followUps || []).filter((f: any) => !f.done).map((f: any) => Date.parse(f.dueAt)).filter((n: number) => Number.isFinite(n)); return d.length ? Math.min(...d) : (l.nextFollowUpAt ? Date.parse(l.nextFollowUpAt) : null); };
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  const rank = (l: any) => { const d = dueOf(l); if (d !== null && d < Date.now()) return 0; if (d !== null && d <= endToday.getTime()) return 1; return l.stage === 'NEW' ? 2 : 3; };
  const callList = [...open].filter(l => rank(l) < 3).sort((a, b) => rank(a) - rank(b) || (dueOf(a) ?? Date.parse(a.createdAt)) - (dueOf(b) ?? Date.parse(b.createdAt)));
  const next = callList[0];
  const ph = (l: any) => String(l.phone || '').replace(/\D/g, '').slice(-10);
  const why = (l: any) => rank(l) === 0 ? tx('Follow-up overdue', 'फ़ॉलो-अप बकाया') : rank(l) === 1 ? tx('Follow-up due today', 'आज फ़ॉलो-अप') : tx('New lead — first call', 'नई लीड — पहला कॉल');
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{tx('Namaste', 'नमस्ते')}, {currentUser.name}</h2>
        <p className="text-xs text-slate-500">{currentUser.teamTitle || tx('Team member', 'टीम सदस्य')} · {tx('only the leads and deal rooms allotted to you appear here.','आपको आवंटित लीड और डील रूम ही यहाँ दिखते हैं।')}</p>
      </div>
      <button onClick={() => setCheckin(true)} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white">{tx('📍 Site check-in (GPS + selfie)', '📍 साइट चेक-इन (GPS + सेल्फ़ी)')}</button>
      {checkin && <CheckinModal onClose={() => setCheckin(false)} />}
      {!crmSide && (
        <button onClick={() => onNavigate(er === 'CONTRACTOR' ? 'construction' : 'connector')} className="block w-full rounded-xl border border-slate-200 bg-white p-4 text-left text-sm font-semibold hover:border-slate-400">
          {er === 'CONTRACTOR' ? tx('Open my assigned construction jobs →', 'मेरे सौंपे गए निर्माण कार्य खोलें →') : tx('Open the Connector Desk →', 'कनेक्टर डेस्क खोलें →')}
        </button>
      )}
      {crmSide && <StaffDesk />}
      {crmSide && leads !== null && (
        <section className="rounded-xl border border-slate-200 bg-white p-4" data-testid="team-calls">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><PhoneCall className="h-4 w-4 text-emerald-600" />{tx('Call next', 'अगला कॉल')}</h3>
          {!next ? <p className="mt-2 text-xs text-slate-500">{tx('Nobody is waiting for a call right now. 🎉', 'अभी किसी को कॉल का इंतज़ार नहीं। 🎉')}</p> : (
            <div className="mt-2 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3" data-testid="team-next">
              <div className="text-sm font-bold text-slate-900">{next.name} <span className="font-normal text-slate-500">· {next.projectName}</span></div>
              <div className="text-xs text-emerald-900">{why(next)}{next.unitInterest ? ` · ${next.unitInterest}` : ''}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {ph(next) && <a href={`tel:+91${ph(next)}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white"><Phone className="h-4 w-4" />{tx('Call', 'कॉल')}</a>}
                {ph(next) && <a href={`https://wa.me/91${ph(next)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-800"><MessageCircle className="h-4 w-4" />WhatsApp</a>}
                <button type="button" onClick={() => onNavigate('crm')} className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700">{tx('Log the call in CRM', 'CRM में कॉल दर्ज करें')}</button>
              </div>
            </div>
          )}
          {callList.length > 1 && (
            <ul className="mt-3 divide-y divide-slate-100 text-xs">
              {callList.slice(1, 9).map(l => <li key={l.id} className="flex items-center justify-between gap-2 py-2"><span><b className="text-slate-900">{l.name}</b> <span className="text-slate-500">· {l.projectName}</span><span className={`block ${rank(l) === 0 ? 'text-red-600' : 'text-slate-500'}`}>{why(l)}</span></span>{ph(l) && <a href={`tel:+91${ph(l)}`} className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700"><Phone className="inline h-3.5 w-3.5" /></a>}</li>)}
            </ul>
          )}
        </section>
      )}
      {crmSide && (leads === null ? <Loader2 className="h-5 w-5 animate-spin text-slate-500" /> : (
        <div className="grid gap-3 sm:grid-cols-3">
          <button onClick={() => onNavigate('crm')} className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-slate-400">
            <Contact className="h-5 w-5 text-slate-500" /><div className="mt-2 text-2xl font-bold">{open.length}</div><div className="text-xs text-slate-500">{tx('Open leads', 'खुली लीड')}</div>
          </button>
          <button onClick={() => onNavigate('crm')} className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-slate-400">
            <Contact className="h-5 w-5 text-red-500" /><div className="mt-2 text-2xl font-bold text-red-600">{overdue.length}</div><div className="text-xs text-slate-500">{tx('Overdue follow-ups', 'बकाया फ़ॉलो-अप')}</div>
          </button>
          <button onClick={() => onNavigate('deals')} className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-slate-400">
            <Briefcase className="h-5 w-5 text-slate-500" /><div className="mt-2 text-2xl font-bold">{deals.length}</div><div className="text-xs text-slate-500">{tx('Deal rooms', 'डील रूम')}</div>
          </button>
        </div>
      ))}
    </div>
  );
};
