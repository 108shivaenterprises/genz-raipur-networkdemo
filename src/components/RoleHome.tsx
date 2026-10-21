import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Building2, Briefcase, CalendarClock, Handshake, ShieldCheck, Scale, Search, Sparkles, UserCheck, Layers,
  Contact, AlertTriangle, KeyRound, Landmark, FileLock2, FolderOpen, IndianRupee, Users, FileSignature,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { formatINR, formatDateTime } from '../lib/utils.js';
import { useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { hasPerm } from '../lib/permissions.js';
import type { BuilderProject, BuyerRequirement, DealRoom, DueDiligenceIssue, Property, SalesAssociateMandate, SiteVisit, UserProfile } from '../types/index.js';
import type { TabType } from './NavigationTabs.js';

/**
 * Role-specific home screens. The broker dashboard (commission pipeline, co-broking, network inventory) is the wrong
 * first screen for an owner, a buyer, a legal counsel or a builder: each of them gets only what their job needs, and every
 * tile is one click to the screen that holds the detail. A tile is only drawn when the role may open that screen.
 */
type Tone = 'warn' | 'ok' | undefined;
interface TileProps { label: string; value: string; sub: string; icon: React.ReactNode; tab?: TabType; tone?: Tone; testId: string; onNavigate: (t: TabType) => void }

const Tile: React.FC<TileProps> = ({ label, value, sub, icon, tab, tone, testId, onNavigate }) => {
  const body = (
    <>
      <div className="flex items-center justify-between text-xs text-slate-500"><span className="font-semibold text-slate-700">{label}</span>{icon}</div>
      <div className={`mt-2 text-2xl font-bold tracking-tight ${tone === 'warn' ? 'text-amber-700' : tone === 'ok' ? 'text-emerald-700' : 'text-slate-900'}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </>
  );
  const cls = 'min-w-0 rounded-xl border border-slate-200/80 bg-white p-5 text-left shadow-xs';
  return tab ? (
    <button type="button" data-testid={testId} onClick={() => onNavigate(tab)} className={`${cls} transition hover:border-slate-400 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400`}>{body}</button>
  ) : (
    <div data-testid={testId} className={cls}>{body}</div>
  );
};

interface Attention { key: string; title: string; detail: string; tab: TabType; tone?: 'warn' | 'info' }

const AttentionList: React.FC<{ items: Attention[]; empty: string; onNavigate: (t: TabType) => void; heading: string; sub: string }> = ({ items, empty, onNavigate, heading, sub }) => (
  <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs lg:col-span-2" data-testid="role-attention">
    <h2 className="text-base font-bold text-slate-900">{heading}</h2>
    <p className="text-xs text-slate-500">{sub}</p>
    {items.length === 0 ? (
      <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-6 text-center text-xs text-emerald-800">{empty}</p>
    ) : (
      <ul className="mt-4 space-y-2">
        {items.slice(0, 8).map(i => (
          <li key={i.key}>
            <button type="button" onClick={() => onNavigate(i.tab)} className="flex w-full items-start gap-3 rounded-lg border border-slate-200 p-3 text-left hover:border-slate-400">
              <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${i.tone === 'warn' ? 'text-amber-600' : 'text-slate-400'}`} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{i.title}</span><span className="block text-xs text-slate-500">{i.detail}</span></span>
              <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-400" />
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const LinkCard: React.FC<{ title: string; links: Array<{ tab: TabType; label: string; icon: React.ReactNode; show: boolean }>; onNavigate: (t: TabType) => void }> = ({ title, links, onNavigate }) => (
  <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs">
    <h2 className="text-base font-bold text-slate-900">{title}</h2>
    <div className="mt-3 flex flex-col gap-2">
      {links.filter(l => l.show).map(l => (
        <button key={l.tab} type="button" onClick={() => onNavigate(l.tab)} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:border-slate-400">
          {l.icon}<span className="flex-1">{l.label}</span><ArrowRight className="h-3.5 w-3.5 text-slate-400" />
        </button>
      ))}
    </div>
  </div>
);

/** Fetch once on mount; a failure (no permission, offline) just leaves the data null — the tile then shows a dash. */
function useOnce<T>(enabled: boolean, fn: () => Promise<T>): T | null {
  const [d, setD] = useState<T | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let on = true;
    fn().then(r => { if (on) setD(r); }).catch(() => { /* leave null */ });
    return () => { on = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return d;
}

const upcoming = (v: SiteVisit) => !v.isVerified && Date.parse(v.scheduledTime) >= Date.now() - 3 * 3600_000;

// ───────────────────────── Property owner ─────────────────────────
const OwnerHome: React.FC<Props> = ({ currentUser, permissions, properties, deals, onNavigate, onOpenAddProperty }) => {
  const tx = useTx();
  const mine = useMemo(() => properties.filter(p => p.ownerId === currentUser.id), [properties, currentUser.id]);
  const canDesk = hasPerm(permissions, 'offer:decide');
  const offers = useOnce(canDesk, () => api.ofList());
  const visits = useOnce(hasPerm(permissions, 'sitevisit:read'), () => api.getSiteVisits());
  const verified = mine.filter(p => p.verificationStatus === 'VERIFIED').length;
  const pending = mine.filter(p => p.verificationStatus !== 'VERIFIED');
  const toDecide: any[] = (offers?.incoming || []).filter((o: any) => o.status === 'SUBMITTED' && o.canDecide);
  const tokenDue: any[] = (offers?.incoming || []).filter((o: any) => o.status === 'ACCEPTED' && o.canDecide);
  const nextVisits = (visits?.siteVisits || []).filter(upcoming).sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  const titleOf = (id: string) => mine.find(p => p.id === id)?.title || id;

  const items: Attention[] = [
    ...toDecide.map((o: any) => ({ key: 'o' + o.id, tone: 'warn' as const, tab: 'desk' as TabType, title: tx(`Offer ${formatINR(o.amount)} on ${titleOf(o.propertyId)}`, `${titleOf(o.propertyId)} पर ${formatINR(o.amount)} का ऑफ़र`), detail: tx('Waiting for your decision — accept, counter or reject', 'आपके फ़ैसले का इंतज़ार — मंज़ूर, काउंटर या अस्वीकार करें') })),
    ...tokenDue.map((o: any) => ({ key: 't' + o.id, tone: 'warn' as const, tab: 'desk' as TabType, title: tx(`Token due on ${titleOf(o.propertyId)}`, `${titleOf(o.propertyId)} पर टोकन बाकी`), detail: tx('Offer accepted — record the token once you have actually received it', 'ऑफ़र मंज़ूर — टोकन असल में मिलने के बाद ही दर्ज करें') })),
    ...nextVisits.slice(0, 3).map(v => ({ key: 'v' + v.id, tab: 'deals' as TabType, title: tx(`Site visit: ${titleOf(v.propertyId)}`, `साइट विज़िट: ${titleOf(v.propertyId)}`), detail: `${formatDateTime(v.scheduledTime)} · ${v.customerName}${v.otpCode ? ` · OTP ${v.otpCode}` : ''}` })),
    ...pending.map(p => ({ key: 'p' + p.id, tab: 'properties' as TabType, title: tx(`${p.title} is not verified yet`, `${p.title} अभी वेरिफ़ाई नहीं हुई`), detail: tx('Buyers and brokers cannot see it until GENZ verifies it', 'GENZ के वेरिफ़ाई करने तक खरीदार/ब्रोकर इसे नहीं देख सकते') })),
  ];

  const tp = { onNavigate };
  return (
    <div className="space-y-6" data-testid="owner-home">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile {...tp} testId="tile-owner-props" tab="properties" label={tx('My properties', 'मेरी प्रॉपर्टी')} value={String(mine.length)} sub={tx(`${verified} verified · ${mine.length - verified} awaiting · ${formatINR(mine.reduce((a, p) => a + (p.askingPrice || 0), 0))} asking`, `${verified} वेरिफ़ाइड · ${mine.length - verified} बाकी · ${formatINR(mine.reduce((a, p) => a + (p.askingPrice || 0), 0))} माँग`)} icon={<Building2 className="h-4 w-4 text-slate-500" />} />
        {canDesk && <Tile {...tp} testId="tile-owner-offers" tab="desk" label={tx('Offers to decide', 'फ़ैसले वाले ऑफ़र')} value={offers ? String(toDecide.length) : '—'} sub={tx(`${tokenDue.length} token(s) to record`, `${tokenDue.length} टोकन दर्ज करना बाकी`)} tone={toDecide.length ? 'warn' : undefined} icon={<Handshake className="h-4 w-4 text-amber-600" />} />}
        <Tile {...tp} testId="tile-owner-deals" tab="deals" label={tx('Deal rooms', 'डील रूम')} value={String(deals.length)} sub={tx('Brokers working on your properties', 'आपकी प्रॉपर्टी पर काम कर रहे ब्रोकर')} icon={<Briefcase className="h-4 w-4 text-blue-600" />} />
        <Tile {...tp} testId="tile-owner-visits" tab="deals" label={tx('Site visits ahead', 'आने वाली साइट विज़िट')} value={visits ? String(nextVisits.length) : '—'} sub={nextVisits[0] ? tx(`Next: ${formatDateTime(nextVisits[0].scheduledTime)}`, `अगली: ${formatDateTime(nextVisits[0].scheduledTime)}`) : tx('None scheduled', 'कोई तय नहीं')} icon={<CalendarClock className="h-4 w-4 text-slate-500" />} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <AttentionList items={items} onNavigate={onNavigate} heading={tx('Needs your attention', 'आपके ध्यान की ज़रूरत')} sub={tx('Offers, tokens, visits and listings waiting on you', 'आप पर रुके ऑफ़र, टोकन, विज़िट और लिस्टिंग')} empty={tx('Nothing is waiting on you right now.', 'अभी आप पर कुछ भी रुका नहीं है।')} />
        <LinkCard onNavigate={onNavigate} title={tx('Quick links', 'क्विक लिंक')} links={[
          { tab: 'properties', label: tx('My properties & vault', 'मेरी प्रॉपर्टी और वॉल्ट'), icon: <Building2 className="h-3.5 w-3.5" />, show: true },
          { tab: 'desk', label: tx('Deal Desk (offers & tokens)', 'डील डेस्क (ऑफ़र और टोकन)'), icon: <Handshake className="h-3.5 w-3.5" />, show: canDesk },
          { tab: 'propdocs', label: tx('Property papers (upload & search)', 'प्रॉपर्टी पेपर्स (अपलोड और खोज)'), icon: <FolderOpen className="h-3.5 w-3.5" />, show: hasPerm(permissions, 'propdoc:use') },
          { tab: 'pdocs', label: tx('Protected documents', 'सुरक्षित दस्तावेज़'), icon: <FileLock2 className="h-3.5 w-3.5" />, show: hasPerm(permissions, 'pdoc:use') },
          { tab: 'disputes', label: tx('Disputes', 'विवाद'), icon: <Scale className="h-3.5 w-3.5" />, show: hasPerm(permissions, 'dispute:read') },
        ]} />
      </div>
      <button type="button" onClick={onOpenAddProperty} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"><Building2 className="h-3.5 w-3.5 text-amber-400" />{tx('+ List a property', '+ प्रॉपर्टी लिस्ट करें')}</button>
    </div>
  );
};

// ───────────────────────── Buyer / tenant ─────────────────────────
const BuyerHome: React.FC<Props> = ({ permissions, properties, requirements, onNavigate, onOpenAddRequirement }) => {
  const tx = useTx();
  // the API already returns only this buyer's own enquiries
  const mine = requirements;
  const open = mine.filter(r => ['active', 'matching'].includes(r.status));
  const visits = useOnce(hasPerm(permissions, 'sitevisit:read'), () => api.getSiteVisits());
  const matchCounts = useOnce(open.length > 0 && hasPerm(permissions, 'matching:run'), () => Promise.all(open.slice(0, 4).map(r => api.getMatchesForRequirement(r.id).then(m => ({ id: r.id, n: m.matches.length })).catch(() => ({ id: r.id, n: 0 })))));
  const totalMatches = (matchCounts || []).reduce((a, m) => a + m.n, 0);
  const nextVisits = (visits?.siteVisits || []).filter(upcoming).sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  const titleOf = (id: string) => properties.find(p => p.id === id)?.title || id;
  const tp = { onNavigate };

  return (
    <div className="space-y-6" data-testid="buyer-home">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile {...tp} testId="tile-buyer-reqs" tab="requirements" label={tx('My requirements', 'मेरी ज़रूरतें')} value={String(open.length)} sub={tx(`${mine.length} in total`, `कुल ${mine.length}`)} icon={<UserCheck className="h-4 w-4 text-slate-500" />} />
        <Tile {...tp} testId="tile-buyer-matches" tab="matches" label={tx('Matching properties', 'मैच होती प्रॉपर्टी')} value={matchCounts ? String(totalMatches) : open.length ? '—' : '0'} sub={tx('Scored against your budget and area', 'आपके बजट और इलाके से मिलान')} tone={totalMatches ? 'ok' : undefined} icon={<Sparkles className="h-4 w-4 text-amber-500" />} />
        <Tile {...tp} testId="tile-buyer-visits" tab="properties" label={tx('Site visits ahead', 'आने वाली साइट विज़िट')} value={visits ? String(nextVisits.length) : '—'} sub={nextVisits[0] ? tx(`Next: ${formatDateTime(nextVisits[0].scheduledTime)}`, `अगली: ${formatDateTime(nextVisits[0].scheduledTime)}`) : tx('None scheduled', 'कोई तय नहीं')} icon={<CalendarClock className="h-4 w-4 text-slate-500" />} />
        <Tile {...tp} testId="tile-buyer-browse" tab="properties" label={tx('Browse properties', 'प्रॉपर्टी देखें')} value={String(properties.length)} sub={tx('Verified listings (owner contact stays private)', 'वेरिफ़ाइड लिस्टिंग (मालिक का संपर्क निजी)')} icon={<Search className="h-4 w-4 text-slate-500" />} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs lg:col-span-2" data-testid="buyer-visits">
          <h2 className="text-base font-bold text-slate-900">{tx('My site visits', 'मेरी साइट विज़िट')}</h2>
          <p className="text-xs text-slate-500">{tx('Give the code below to the broker only when you are at the property — it proves the visit really happened.', 'कोड ब्रोकर को तभी दें जब आप प्रॉपर्टी पर हों — इससे विज़िट सच में हुई यह साबित होता है।')}</p>
          {nextVisits.length === 0 ? (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">{tx('No visit is scheduled yet. When a broker books one for you it shows up here.', 'अभी कोई विज़िट तय नहीं। ब्रोकर बुक करेगा तो यहाँ दिखेगी।')}</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {nextVisits.slice(0, 5).map(v => (
                <li key={v.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                  <CalendarClock className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{titleOf(v.propertyId)}</span><span className="block text-xs text-slate-500">{formatDateTime(v.scheduledTime)}</span></span>
                  {v.otpCode ? <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-1 font-mono text-sm font-bold tracking-widest text-emerald-800" aria-label={tx('visit code', 'विज़िट कोड')}>{v.otpCode}</span> : <span className="shrink-0 text-[11px] text-slate-400">{tx('code sent by SMS', 'कोड SMS से भेजा')}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <LinkCard onNavigate={onNavigate} title={tx('What next?', 'आगे क्या?')} links={[
          { tab: 'requirements', label: tx('Tell us what you need', 'अपनी ज़रूरत बताएँ'), icon: <UserCheck className="h-3.5 w-3.5" />, show: true },
          { tab: 'matches', label: tx('See my matches', 'मेरे मैच देखें'), icon: <Sparkles className="h-3.5 w-3.5" />, show: hasPerm(permissions, 'matching:run') },
          { tab: 'properties', label: tx('Browse properties', 'प्रॉपर्टी देखें'), icon: <Search className="h-3.5 w-3.5" />, show: true },
          { tab: 'audit', label: tx('My activity log', 'मेरा एक्टिविटी लॉग'), icon: <ShieldCheck className="h-3.5 w-3.5" />, show: hasPerm(permissions, 'audit:read_own') },
        ]} />
      </div>
      {hasPerm(permissions, 'requirement:create') && (
        <button type="button" onClick={onOpenAddRequirement} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800">{tx('+ Post a requirement', '+ ज़रूरत जोड़ें')}</button>
      )}
    </div>
  );
};

// ───────────────────────── Legal counsel ─────────────────────────
const SEV: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFORMATIONAL: 4 };
const LegalHome: React.FC<Props> = ({ permissions, properties, deals, onNavigate }) => {
  const tx = useTx();
  const label = useLabel();
  const res = useOnce(hasPerm(permissions, 'dd:read'), () => api.getDueDiligenceIssues());
  const issues: DueDiligenceIssue[] = (res?.issues || []).filter(i => ['OPEN', 'IN_PROGRESS', 'REOPENED'].includes(i.status)).sort((a, b) => (SEV[a.severity] ?? 9) - (SEV[b.severity] ?? 9));
  const serious = issues.filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH');
  const titleOf = (id: string) => properties.find(p => p.id === id)?.title || id;
  const tp = { onNavigate };
  const items: Attention[] = issues.map(i => ({ key: i.id, tab: 'due_diligence' as TabType, tone: (i.severity === 'CRITICAL' || i.severity === 'HIGH' ? 'warn' : 'info') as 'warn' | 'info', title: `${label('status', i.severity)} · ${i.title}`, detail: `${titleOf(i.propertyId)} · ${tx('due', 'अंतिम तिथि')} ${i.deadline ? formatDateTime(i.deadline) : '—'}` }));

  return (
    <div className="space-y-6" data-testid="legal-home">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile {...tp} testId="tile-legal-issues" tab="due_diligence" label={tx('Open legal issues', 'खुले कानूनी मुद्दे')} value={res ? String(issues.length) : '—'} sub={tx('Title, approvals and compliance gaps', 'टाइटल, अनुमति और अनुपालन की कमियाँ')} tone={issues.length ? 'warn' : 'ok'} icon={<Scale className="h-4 w-4 text-amber-600" />} />
        <Tile {...tp} testId="tile-legal-serious" tab="due_diligence" label={tx('Critical / high', 'गंभीर / ऊँचे')} value={res ? String(serious.length) : '—'} sub={tx('Resolve these before registry', 'रजिस्ट्री से पहले निपटाएँ')} tone={serious.length ? 'warn' : undefined} icon={<AlertTriangle className="h-4 w-4 text-rose-600" />} />
        <Tile {...tp} testId="tile-legal-props" tab="properties" label={tx('Properties in network', 'नेटवर्क की प्रॉपर्टी')} value={String(properties.length)} sub={tx('Open one to review its checklist', 'चेकलिस्ट देखने के लिए खोलें')} icon={<Building2 className="h-4 w-4 text-slate-500" />} />
        {hasPerm(permissions, 'deal:read') && <Tile {...tp} testId="tile-legal-deals" tab="deals" label={tx('Deals to clear', 'क्लियर करने वाले सौदे')} value={String(deals.length)} sub={tx('Readiness report and sign-off', 'रेडीनेस रिपोर्ट और साइन-ऑफ़')} icon={<FileSignature className="h-4 w-4 text-slate-500" />} />}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <AttentionList items={items} onNavigate={onNavigate} heading={tx('Open issues, most serious first', 'खुले मुद्दे, गंभीर पहले')} sub={tx('From the due-diligence issue register', 'ड्यू-डिलिजेंस इश्यू रजिस्टर से')} empty={tx('No open legal issues.', 'कोई खुला कानूनी मुद्दा नहीं।')} />
        <LinkCard onNavigate={onNavigate} title={tx('My work', 'मेरा काम')} links={[
          { tab: 'due_diligence', label: tx('Due diligence & title audit', 'ड्यू डिलिजेंस और टाइटल ऑडिट'), icon: <ShieldCheck className="h-3.5 w-3.5" />, show: hasPerm(permissions, 'dd:read') },
          { tab: 'landrecords', label: tx('Land records & red flags', 'भूमि रिकॉर्ड और रेड फ़्लैग'), icon: <Landmark className="h-3.5 w-3.5" />, show: hasPerm(permissions, 'landrecord:manage') },
          { tab: 'deals', label: tx('Deal rooms (no commissions shown)', 'डील रूम (कमीशन नहीं दिखता)'), icon: <Briefcase className="h-3.5 w-3.5" />, show: hasPerm(permissions, 'deal:read') },
          { tab: 'propdocs', label: tx('Property papers shared with me', 'मुझसे शेयर हुए प्रॉपर्टी पेपर्स'), icon: <FolderOpen className="h-3.5 w-3.5" />, show: hasPerm(permissions, 'propdoc:use') },
          { tab: 'pdocs', label: tx('Protected documents', 'सुरक्षित दस्तावेज़'), icon: <FileLock2 className="h-3.5 w-3.5" />, show: hasPerm(permissions, 'pdoc:use') },
        ]} />
      </div>
    </div>
  );
};

// ───────────────────────── Developer / builder ─────────────────────────
const BuilderHome: React.FC<Props> = ({ currentUser, permissions, projects, mandates, onNavigate }) => {
  const tx = useTx();
  const crm = useOnce(hasPerm(permissions, 'crm:read'), () => api.crmOverview());
  const o = crm?.overview;
  const mine = projects.filter(p => p.builderId === currentUser.id);
  const live = mine.filter(p => p.status !== 'ARCHIVED');
  const units = live.reduce((a, p) => ({ total: a.total + (p.totalUnits || 0), left: a.left + (p.availableUnits || 0) }), { total: 0, left: 0 });
  const myMandates = mandates.filter(m => m.builderId === currentUser.id);
  const active = myMandates.filter(m => ['ACTIVE_ASSOCIATE', 'TOP_PERFORMER'].includes(m.status)).length;
  const applied = myMandates.filter(m => m.status === 'APPLIED').length;
  const tp = { onNavigate };
  const items: Attention[] = [
    ...(o?.pendingBookingRequests ? [{ key: 'bk', tone: 'warn' as const, tab: 'crm' as TabType, title: tx(`${o.pendingBookingRequests} booking request(s) to approve`, `${o.pendingBookingRequests} बुकिंग अनुरोध मंज़ूर करने हैं`), detail: tx('Associates are waiting for your decision', 'एसोसिएट आपके फ़ैसले का इंतज़ार कर रहे हैं') }] : []),
    ...(o?.overdueFollowUps ? [{ key: 'fu', tone: 'warn' as const, tab: 'crm' as TabType, title: tx(`${o.overdueFollowUps} overdue follow-up(s)`, `${o.overdueFollowUps} फ़ॉलो-अप लेट`), detail: tx('Leads going cold — assign or call today', 'लीड ठंडी पड़ रही हैं — आज असाइन करें या कॉल करें') }] : []),
    ...(applied ? [{ key: 'ap', tab: 'pcontrol' as TabType, title: tx(`${applied} associate application(s)`, `${applied} एसोसिएट आवेदन`), detail: tx('Review and shortlist or decline', 'देखें और शॉर्टलिस्ट या अस्वीकार करें') }] : []),
    ...(o?.brokeragePayable ? [{ key: 'pay', tone: 'warn' as const, tab: 'crm' as TabType, title: tx(`${formatINR(o.brokeragePayable)} brokerage payable`, `${formatINR(o.brokeragePayable)} ब्रोकरेज देय`), detail: tx('Pay the associate directly, then record it — GENZ never holds this money', 'एसोसिएट को सीधे दें, फिर दर्ज करें — GENZ यह पैसा नहीं रखता') }] : []),
  ];

  return (
    <div className="space-y-6" data-testid="builder-home">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile {...tp} testId="tile-builder-projects" tab="builder" label={tx('Live projects', 'चालू प्रोजेक्ट')} value={String(live.length)} sub={tx(`${units.left} of ${units.total} units available`, `${units.total} में से ${units.left} यूनिट उपलब्ध`)} icon={<Layers className="h-4 w-4 text-slate-500" />} />
        <Tile {...tp} testId="tile-builder-assoc" tab={applied ? 'pcontrol' : 'builder'} label={tx('Active associates', 'सक्रिय एसोसिएट')} value={String(active)} sub={tx(`${applied} application(s) waiting`, `${applied} आवेदन बाकी`)} tone={applied ? 'warn' : undefined} icon={<Users className="h-4 w-4 text-slate-500" />} />
        {hasPerm(permissions, 'crm:read') && <Tile {...tp} testId="tile-builder-leads" tab="crm" label={tx('Active leads', 'सक्रिय लीड')} value={o ? String(o.activeLeads) : '—'} sub={tx(`${o?.overdueFollowUps ?? 0} overdue follow-up(s) · ${o?.conversionPct ?? 0}% converted`, `${o?.overdueFollowUps ?? 0} फ़ॉलो-अप लेट · ${o?.conversionPct ?? 0}% कन्वर्ट`)} tone={o?.overdueFollowUps ? 'warn' : undefined} icon={<Contact className="h-4 w-4 text-blue-600" />} />}
        {hasPerm(permissions, 'crm:read') && <Tile {...tp} testId="tile-builder-sales" tab="crm" label={tx('Sales booked', 'बुक हुई बिक्री')} value={o ? formatINR(o.salesValue) : '—'} sub={tx(`${o?.approvedBookings ?? 0} booking(s) · ${formatINR(o?.brokeragePayable ?? 0)} brokerage payable`, `${o?.approvedBookings ?? 0} बुकिंग · ${formatINR(o?.brokeragePayable ?? 0)} ब्रोकरेज देय`)} icon={<IndianRupee className="h-4 w-4 text-emerald-600" />} />}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <AttentionList items={items} onNavigate={onNavigate} heading={tx('Needs your attention', 'आपके ध्यान की ज़रूरत')} sub={tx('Bookings, follow-ups, applications and payouts', 'बुकिंग, फ़ॉलो-अप, आवेदन और भुगतान')} empty={tx('Nothing is waiting on you right now.', 'अभी आप पर कुछ भी रुका नहीं है।')} />
        <LinkCard onNavigate={onNavigate} title={tx('Quick links', 'क्विक लिंक')} links={[
          { tab: 'builder', label: tx('Builder Launchpad & associates', 'बिल्डर लॉन्चपैड और एसोसिएट'), icon: <Layers className="h-3.5 w-3.5" />, show: hasPerm(permissions, 'builder:associates_read') },
          { tab: 'crm', label: tx('Associates CRM', 'एसोसिएट CRM'), icon: <Contact className="h-3.5 w-3.5" />, show: hasPerm(permissions, 'crm:read') },
          { tab: 'pcontrol', label: tx('Project Control', 'प्रोजेक्ट कंट्रोल'), icon: <KeyRound className="h-3.5 w-3.5" />, show: hasPerm(permissions, 'pcontrol:manage', 'pcontrol:oversee') },
          { tab: 'team', label: tx('My team', 'मेरी टीम'), icon: <Users className="h-3.5 w-3.5" />, show: hasPerm(permissions, 'team:manage') },
        ]} />
      </div>
    </div>
  );
};

// ───────────────────────── switch ─────────────────────────
interface Props {
  currentUser: UserProfile;
  permissions: string[];
  properties: Property[];
  requirements: BuyerRequirement[];
  deals: DealRoom[];
  projects: BuilderProject[];
  mandates: SalesAssociateMandate[];
  onNavigate: (t: TabType) => void;
  onOpenAddProperty: () => void;
  onOpenAddRequirement: () => void;
}

export const ROLE_HOME_ROLES = ['PROPERTY_OWNER', 'BUYER_TENANT', 'LEGAL_COUNSEL', 'DEVELOPER_BUILDER'] as const;

export const RoleHome: React.FC<Props> = (p) => {
  switch (p.currentUser.role) {
    case 'PROPERTY_OWNER': return <OwnerHome {...p} />;
    case 'BUYER_TENANT': return <BuyerHome {...p} />;
    case 'LEGAL_COUNSEL': return <LegalHome {...p} />;
    case 'DEVELOPER_BUILDER': return <BuilderHome {...p} />;
    default: return null;
  }
};
