/**
 * v75 — one simple home for the three professional roles (builder / developer, lawyer, contractor).
 *
 * Before: a hero, 4–5 big number cards, a list of "needs attention", a "quick links" card that repeated the tabs, and a second
 * block of numbers underneath — 8+ cards and a screen and a half of scrolling before the first action.
 * Now: (1) "Today" — the few things waiting for this person, each one tap away from the screen that fixes it,
 *      (2) four big buttons — the four things this role does all day, (3) four small numbers.
 * Nothing is removed: every other screen is still in the bottom bar / More.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Contact, Layers, Users, Scale, ShieldCheck, FolderOpen, Landmark, HardHat, FileLock2, IndianRupee, Clock, Handshake, FileSignature, Lock, Loader2, MessageCircle, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { hasPerm } from '../lib/permissions.js';
import { formatINR } from '../lib/utils.js';
import type { BuilderProject, ConstructionLead, SalesAssociateMandate, UserProfile } from '../types/index.js';
import type { TabType } from './NavigationTabs.js';
import { GrowthNudge } from './GrowthNudge.js';

type Tone = 'warn' | 'info' | 'ok';
interface Todo { key: string; icon: React.ElementType; en: string; hi: string; tab: TabType; tone: Tone; n?: number; value?: string }
interface Big { tab: TabType; icon: React.ElementType; en: string; hi: string; show: boolean; style: 'dark' | 'amber' | 'light' }
interface Num { key: string; n: string | number; en: string; hi: string; tab: TabType; hot?: boolean }

const TONE: Record<Tone, string> = {
  warn: 'border-amber-300 bg-amber-50 text-amber-950',
  info: 'border-slate-200 bg-white text-slate-900',
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
};
const BIG: Record<Big['style'], string> = {
  dark: 'bg-slate-900 text-white',
  amber: 'border border-amber-300 bg-amber-100 text-slate-900',
  light: 'border border-slate-200 bg-white text-slate-900',
};

interface Props {
  currentUser: UserProfile;
  permissions: string[];
  projects?: BuilderProject[];
  mandates?: SalesAssociateMandate[];
  constructionLeads?: ConstructionLead[];
  onNavigate: (t: TabType) => void;
}

/** Fetch once; an error (no permission, offline) leaves it null and that part of the home simply stays quiet. */
function useOnce<T>(on: boolean, fn: () => Promise<T>): [T | null, boolean] {
  const [d, setD] = useState<T | null>(null); const [done, setDone] = useState(!on);
  useEffect(() => {
    if (!on) return; let live = true;
    fn().then(r => { if (live) setD(r); }).catch(() => undefined).finally(() => { if (live) setDone(true); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return [d, done];
}

export const ProHome: React.FC<Props> = ({ currentUser, permissions, projects = [], mandates = [], constructionLeads = [], onNavigate }) => {
  const tx = useTx(); const label = useLabel();
  const role = currentUser.role;
  const may = (...p: string[]) => hasPerm(permissions, ...p);

  // ── what each role needs to know ──
  const [crm, crmDone] = useOnce(role === 'DEVELOPER_BUILDER' && may('crm:read'), () => api.crmOverview());
  const [pc, pcDone] = useOnce(role === 'DEVELOPER_BUILDER' && may('pcontrol:manage', 'pcontrol:oversee'), () => api.pcProjects());
  const [ins, insDone] = useOnce(role === 'LEGAL_COUNSEL' || role === 'CONTRACTOR', () => api.homeInsights());
  const [dd, ddDone] = useOnce(role === 'LEGAL_COUNSEL' && may('dd:read'), () => api.getDueDiligenceIssues());
  const loading = !(crmDone && pcDone && insDone && ddDone);

  const first = String(currentUser.name || '').split(' ')[0];
  let todos: Todo[] = []; let bigs: Big[] = []; let nums: Num[] = []; let line = '';

  if (role === 'DEVELOPER_BUILDER') {
    const o = crm?.overview; const ps: any[] = pc?.projects || [];
    const sum = (k: string) => ps.reduce((a, p) => a + (Number(p[k]) || 0), 0);
    const mine = projects.filter(p => p.builderId === currentUser.id && p.status !== 'ARCHIVED');
    const units = mine.reduce((a, p) => ({ total: a.total + (p.totalUnits || 0), left: a.left + (p.availableUnits || 0) }), { total: 0, left: 0 });
    const applied = ps.length ? sum('applications') : mandates.filter(m => m.builderId === currentUser.id && m.status === 'APPLIED').length;
    line = tx('Builder / developer', 'बिल्डर / डेवलपर');
    todos = [
      { key: 'bk', icon: FileSignature, tab: 'crm', tone: 'warn', n: o?.pendingBookingRequests || 0, en: 'Booking requests — approve or decline', hi: 'बुकिंग अनुरोध — मंज़ूर या मना करें' },
      { key: 'ver', icon: ShieldCheck, tab: 'pcontrol', tone: 'warn', n: sum('pendingVerification'), en: 'Partner leads to check — accept or reject', hi: 'पार्टनर की लीड जाँचनी है — मंज़ूर या अस्वीकार' },
      { key: 'app', icon: Handshake, tab: 'pcontrol', tone: 'info', n: applied, en: 'Brokers asking to sell your project', hi: 'ब्रोकर आपका प्रोजेक्ट बेचने की अनुमति माँग रहे' },
      { key: 'fu', icon: Clock, tab: 'crm', tone: 'warn', n: o?.overdueFollowUps || 0, en: 'Follow-ups running late — call today', hi: 'फ़ॉलो-अप लेट — आज कॉल करें' },
      { key: 'pay', icon: IndianRupee, tab: 'crm', tone: 'info', n: o?.brokeragePayable ? 1 : 0, value: o?.brokeragePayable ? formatINR(o.brokeragePayable) : undefined, en: 'Brokerage to pay', hi: 'ब्रोकरेज देना है' },
    ];
    bigs = [
      { tab: 'crm', icon: Contact, en: 'Leads', hi: 'लीड', show: may('crm:read'), style: 'dark' },
      { tab: 'builder', icon: Layers, en: 'My projects', hi: 'मेरे प्रोजेक्ट', show: may('builder:associates_read'), style: 'amber' },
      { tab: 'pcontrol', icon: Handshake, en: 'Partners & rules', hi: 'पार्टनर और नियम', show: may('pcontrol:manage', 'pcontrol:oversee'), style: 'light' },
      { tab: 'team', icon: Users, en: 'My team', hi: 'मेरी टीम', show: may('team:manage'), style: 'light' },
    ];
    nums = [
      { key: 'proj', n: mine.length, en: 'live projects', hi: 'चालू प्रोजेक्ट', tab: 'builder' },
      { key: 'units', n: units.total ? `${units.left}/${units.total}` : '0', en: 'units left', hi: 'यूनिट बाकी', tab: 'builder' },
      { key: 'leads', n: o ? o.activeLeads : '—', en: 'open leads', hi: 'खुली लीड', tab: 'crm' },
      { key: 'sales', n: o ? formatINR(o.salesValue) : '—', en: 'sales booked', hi: 'बिक्री बुक', tab: 'crm' },
    ];
  } else if (role === 'LEGAL_COUNSEL') {
    const issues: any[] = (dd?.issues || []).filter((i: any) => ['OPEN', 'IN_PROGRESS', 'REOPENED'].includes(i.status));
    const serious = issues.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH').length;
    const c = ins?.insights?.cases || { claimed: 0, quoted: 0, accepted: 0, completed: 0 };
    const m = ins?.insights?.membership;
    line = tx('Legal counsel', 'लीगल काउंसल');
    todos = [
      { key: 'open', icon: Scale, tab: 'legal', tone: 'warn', n: ins?.insights?.open || 0, en: 'New legal-help requests — the first to take gets the case', hi: 'नई क़ानूनी मदद की माँग — जो पहले ले, केस उसका' },
      { key: 'quote', icon: FileSignature, tab: 'legal', tone: 'warn', n: c.claimed, en: 'Cases you took — send your quote', hi: 'आपके लिए केस — कोट भेजें' },
      { key: 'ser', icon: AlertTriangle, tab: 'due_diligence', tone: 'warn', n: serious, en: 'Serious title issues — resolve before registry', hi: 'गंभीर टाइटल मुद्दे — रजिस्ट्री से पहले निपटाएँ' },
      { key: 'run', icon: Clock, tab: 'legal', tone: 'info', n: c.accepted, en: 'Cases in progress', hi: 'चल रहे केस' },
      { key: 'iss', icon: ShieldCheck, tab: 'due_diligence', tone: 'info', n: Math.max(0, issues.length - serious), en: 'Other open title issues', hi: 'बाकी खुले टाइटल मुद्दे' },
      { key: 'mem', icon: IndianRupee, tab: 'plans', tone: 'info', n: m?.warn ? 1 : 0, en: !m?.active ? 'No active membership — member rates are off' : 'Membership ends soon — renew', hi: !m?.active ? 'मेंबरशिप चालू नहीं — मेंबर रेट बंद' : 'मेंबरशिप जल्द ख़त्म — रिन्यू करें' },
    ];
    bigs = [
      { tab: 'legal', icon: Scale, en: 'Cases', hi: 'केस', show: may('legal:desk'), style: 'dark' },
      { tab: 'due_diligence', icon: ShieldCheck, en: 'Title check', hi: 'टाइटल जाँच', show: may('dd:read'), style: 'amber' },
      { tab: may('propdoc:use') ? 'propdocs' : 'pdocs', icon: FolderOpen, en: 'Papers', hi: 'काग़ज़', show: may('propdoc:use', 'pdoc:use'), style: 'light' },
      { tab: 'landrecords', icon: Landmark, en: 'Land records', hi: 'भूमि रिकॉर्ड', show: may('landrecord:manage'), style: 'light' },
    ];
    nums = [
      { key: 'o', n: ins ? ins.insights?.open ?? 0 : '—', en: 'open requests', hi: 'खुली माँग', tab: 'legal' },
      { key: 'r', n: ins ? c.claimed + c.quoted + c.accepted : '—', en: 'my cases running', hi: 'मेरे चालू केस', tab: 'legal' },
      { key: 'i', n: dd ? issues.length : '—', en: 'open title issues', hi: 'खुले टाइटल मुद्दे', tab: 'due_diligence' },
      { key: 'd', n: ins ? c.completed : '—', en: 'cases completed', hi: 'पूरे केस', tab: 'legal' },
    ];
  } else if (role === 'CONTRACTOR') {
    const open = constructionLeads.filter(l => l.status === 'OPEN');
    const mine = constructionLeads.filter(l => l.assignedContractorId === currentUser.id);
    const active = mine.filter(l => l.status === 'ASSIGNED' || l.status === 'IN_PROGRESS');
    const withFee = mine.filter(l => (l.referralCommissionDue || 0) > 0);
    const feeDue = withFee.filter(l => !l.referralCommissionPaid).reduce((a, l) => a + (l.referralCommissionDue || 0), 0);
    const feePaid = withFee.filter(l => l.referralCommissionPaid).reduce((a, l) => a + (l.referralCommissionDue || 0), 0);
    const waiting = ins?.insights?.requests?.waiting || 0;
    line = `${tx('Contractor', 'कॉन्ट्रैक्टर')}${currentUser.companyName ? ' · ' + currentUser.companyName : ''}`;
    todos = [
      { key: 'open', icon: HardHat, tab: 'construction', tone: 'warn', n: open.length, en: 'New construction leads — ask for the one you want', hi: 'नई कंस्ट्रक्शन लीड — जो चाहिए वह माँगें' },
      { key: 'fee', icon: IndianRupee, tab: 'construction', tone: 'warn', n: feeDue > 0 ? 1 : 0, value: feeDue > 0 ? formatINR(feeDue) : undefined, en: 'Referral fee to pay the broker', hi: 'ब्रोकर को रेफ़रल फ़ीस देनी है' },
      { key: 'act', icon: Clock, tab: 'construction', tone: 'info', n: active.length, en: 'Jobs in progress', hi: 'चालू काम' },
      { key: 'wait', icon: Handshake, tab: 'construction', tone: 'info', n: waiting, en: 'Requests waiting for approval', hi: 'अनुरोध मंज़ूरी के इंतज़ार में' },
    ];
    bigs = [
      { tab: 'construction', icon: HardHat, en: 'Leads & jobs', hi: 'लीड और काम', show: may('lead:read'), style: 'dark' },
      { tab: 'team', icon: Users, en: 'My team', hi: 'मेरी टीम', show: may('team:manage'), style: 'amber' },
      { tab: 'disputes', icon: Scale, en: 'Disputes', hi: 'विवाद', show: may('dispute:read'), style: 'light' },
      { tab: 'pdocs', icon: FileLock2, en: 'Protected docs', hi: 'सुरक्षित दस्तावेज़', show: may('pdoc:use'), style: 'light' },
    ];
    nums = [
      { key: 'o', n: open.length, en: 'open leads', hi: 'खुली लीड', tab: 'construction' },
      { key: 'a', n: active.length, en: 'active jobs', hi: 'चालू काम', tab: 'construction' },
      { key: 'f', n: formatINR(feeDue), en: 'fee to pay', hi: 'देय फ़ीस', tab: 'construction', hot: feeDue > 0 },
      { key: 's', n: formatINR(feePaid), en: 'fee paid', hi: 'चुकाई फ़ीस', tab: 'construction' },
    ];
  }

  const items = useMemo(() => todos.filter(t => (t.n || 0) > 0).sort((a, b) => (a.tone === 'warn' ? 0 : 1) - (b.tone === 'warn' ? 0 : 1)), [JSON.stringify(todos.map(t => [t.key, t.n, t.value]))]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = items.slice(0, 5);

  return (
    <section className="mx-auto max-w-3xl space-y-4" data-testid="pro-home">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{tx(`Namaste, ${first} 👋`, `नमस्ते, ${first} 👋`)}</h2>
        <p className="text-xs text-slate-500">{line} · {label('role', role)}</p>
      </div>

      <div data-testid="pro-todo">
        <h3 className="mb-2 text-sm font-bold text-slate-900">{tx('Today — what is waiting for you', 'आज — आपका क्या काम बाकी है')}</h3>
        {loading ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          : shown.length === 0 ? (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm font-semibold text-emerald-900" data-testid="pro-todo-empty"><CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />{tx('All clear — nothing is waiting for you right now. 🎉', 'सब ठीक है — अभी आपका कोई काम बाकी नहीं। 🎉')}</div>
          ) : (
            <ul className="space-y-2">
              {shown.map(t => (
                <li key={t.key}>
                  <button type="button" onClick={() => onNavigate(t.tab)} data-testid={`pro-todo-${t.key}`} className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-left ${TONE[t.tone]}`}>
                    <t.icon className="h-5 w-5 shrink-0" />
                    <span className="flex-1 text-sm font-semibold">{tx(t.en, t.hi)}</span>
                    <span className="text-lg font-bold">{t.value ?? t.n}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
                  </button>
                </li>
              ))}
              {items.length > shown.length && <li className="px-1 text-xs text-slate-500">{tx(`+ ${items.length - shown.length} more — open the screens below`, `+ ${items.length - shown.length} और — नीचे के स्क्रीन खोलें`)}</li>}
            </ul>
          )}
      </div>

      <div className="grid grid-cols-2 gap-2" data-testid="pro-actions">
        {bigs.filter(b => b.show).map(b => (
          <button key={b.tab + b.en} type="button" onClick={() => onNavigate(b.tab)} data-testid={`pro-act-${b.tab}`} className={`flex min-h-24 flex-col items-start justify-between rounded-2xl p-4 text-left ${BIG[b.style]}`}>
            <b.icon className={`h-6 w-6 ${b.style === 'dark' ? 'text-amber-400' : 'text-slate-600'}`} />
            <span className="text-base font-bold leading-tight">{tx(b.en, b.hi)}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="pro-numbers">
        {nums.map(n => (
          <button key={n.key} type="button" onClick={() => onNavigate(n.tab)} data-testid={`pro-num-${n.key}`} className="rounded-xl bg-slate-50 px-3 py-2.5 text-center hover:bg-slate-100">
            <div className={`text-lg font-bold ${n.hot ? 'text-amber-700' : 'text-slate-900'}`}>{n.n}</div>
            <div className="text-[11px] text-slate-500">{tx(n.en, n.hi)}</div>
          </button>
        ))}
      </div>

      {may('growth:nominate') && <GrowthNudge onOpen={() => onNavigate('grow')} className="" />}

      {role === 'CONTRACTOR' && (
        <details className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
          <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-slate-700"><Lock className="h-4 w-4 text-slate-500" />{tx('How lead privacy works', 'लीड की प्राइवेसी कैसे काम करती है')}</summary>
          <p className="mt-2 leading-relaxed">{tx('Customer name, phone and exact site address stay hidden on every open lead. They are shown to you only after you take the lead by accepting the referral agreement. The referral fee between you and the broker is paid directly to him — GENZ does not hold it and only records what you both confirm.', 'हर खुली लीड पर ग्राहक का नाम, फ़ोन और साइट का पूरा पता छुपा रहता है। रेफ़रल एग्रीमेंट मानकर लीड लेने के बाद ही वे आपको दिखते हैं। रेफ़रल फ़ीस आप ब्रोकर को सीधे देते हैं — GENZ उसे नहीं रखता, सिर्फ़ वही दर्ज करता है जो आप दोनों कन्फ़र्म करें।')}</p>
        </details>
      )}
      {role === 'DEVELOPER_BUILDER' && may('pchat:use') && (
        <button type="button" onClick={() => onNavigate('chats')} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-left text-sm font-semibold text-slate-800" data-testid="pro-chats"><MessageCircle className="h-5 w-5 text-slate-500" /><span className="flex-1">{tx('Chat with partners', 'पार्टनर से चैट')}</span><ChevronRight className="h-4 w-4 text-slate-400" /></button>
      )}
    </section>
  );
};
