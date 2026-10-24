import { goto } from '../lib/goto.js';
import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Network,
  Building,
  UserCheck,
  Sparkles,
  Briefcase,
  HardHat,
  Scale,
  History,
  KeyRound,
  Layers,
  ShieldCheck,
  Contact,
  Handshake,
  Settings2,
  Users,
  Share2,
  Landmark,
  Rocket,
  CalendarCheck,
  FileLock2,
  FolderOpen,
  GraduationCap,
  SlidersHorizontal,
  QrCode,
  FileSearch,
  IndianRupee,
  Scale as ScaleIcon,
  BadgeIndianRupee,
  MessagesSquare,
  MessageCircle,
  Store,
  Globe,
  DoorOpen,
} from 'lucide-react';
import { api } from '../lib/api.js';

import { UserProfile } from '../types/index.js';
import { useI18n } from '../lib/i18n.js';

export type TabType =
  | 'dashboard'
  | 'builder'
  | 'properties'
  | 'requirements'
  | 'matches'
  | 'deals'
  | 'due_diligence'
  | 'construction'
  | 'disputes'
  | 'audit'
  | 'onboarding'
  | 'idreview'
  | 'revenue'
  | 'legal'
  | 'plans'
  | 'crm'
  | 'connector'
  | 'control'
  | 'team'
  | 'share'
  | 'landrecords'
  | 'grow'
  | 'citylaunch'
  | 'daily'
  | 'pdocs'
  | 'propdocs'
  | 'community'
  | 'pcontrol'
  | 'visits'
  | 'clientroom'
  | 'desk'
  | 'network'
  | 'launchdesk'
  | 'partners'
  | 'mypage'
  | 'rentdesk'
  | 'chats';

interface NavigationTabsProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  currentUser?: UserProfile;
  permissions?: string[];
  unreadCount?: {
    matches?: number;
    deals?: number;
    disputes?: number;
    leads?: number;
  };
  /** v50: unread chat messages (client rooms + deal rooms) */
  chatBadge?: number;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  activeTab,
  onChangeTab,
  currentUser,
  permissions = [],
  unreadCount = {},
  chatBadge = 0,
}) => {
  const { t } = useI18n();
  const has = (...p: string[]) => p.some((x) => permissions.includes(x));
  // v19: the ID Review tab carries a badge — checks waiting for me or for anyone — so the team is told without opening it
  const [idBadge, setIdBadge] = useState(0);
  const reviewer = permissions.includes('users:review');
  useEffect(() => {
    if (!reviewer) { setIdBadge(0); return; }
    let live = true;
    const pull = () => { api.idSummary().then(r => { if (live) setIdBadge(r.badge || 0); }).catch(() => {}); };
    pull();
    const timer = window.setInterval(pull, 60_000);
    window.addEventListener('genz:idreview-changed', pull);
    return () => { live = false; window.clearInterval(timer); window.removeEventListener('genz:idreview-changed', pull); };
  }, [reviewer, activeTab]);
  // v22: the Legal tab carries a badge — open requests for a counsellor, payments / reports waiting for GENZ, a fee waiting for the broker's answer
  const [legalBadge, setLegalBadge] = useState(0);
  const legalUser = permissions.includes('legal:desk') || permissions.includes('legal:manage');
  useEffect(() => {
    if (!legalUser) { setLegalBadge(0); return; }
    let live = true;
    const pull = () => { api.legalBadge().then(r => { if (live) setLegalBadge(r.count || 0); }).catch(() => {}); };
    pull();
    const timer = window.setInterval(pull, 60_000);
    window.addEventListener('genz:legal-changed', pull);
    return () => { live = false; window.clearInterval(timer); window.removeEventListener('genz:legal-changed', pull); };
  }, [legalUser, activeTab]);
  // v23: Plans & Fees — admins always; a payer only when a plan / fee / due concerns him (brokers see nothing while GENZ charges them nothing)
  const [billing, setBilling] = useState({ count: 0, relevant: false });
  const billingUser = permissions.includes('billing:manage') || permissions.includes('billing:self');
  useEffect(() => {
    if (!billingUser) { setBilling({ count: 0, relevant: false }); return; }
    let live = true;
    const pull = () => { api.billingBadge().then(r => { if (live) setBilling({ count: r.count || 0, relevant: !!r.relevant }); }).catch(() => {}); };
    pull();
    const timer = window.setInterval(pull, 120_000);
    window.addEventListener('genz:billing-changed', pull);
    return () => { live = false; window.clearInterval(timer); window.removeEventListener('genz:billing-changed', pull); };
  }, [billingUser, activeTab]);
  // v32: Client Rooms — a badge for new client messages, visit asks and a client waiting for his code
  const [roomBadge, setRoomBadge] = useState(0);
  const roomUser = permissions.includes('clientroom:use');
  useEffect(() => {
    if (!roomUser) { setRoomBadge(0); return; }
    let live = true;
    const pull = () => { api.crList().then(r => { if (live) setRoomBadge((r.rooms || []).filter((x: any) => x.status === 'ACTIVE').reduce((n: number, x: any) => n + (x.unread || 0) + (x.openVisits || 0) + (x.codeAsk ? 1 : 0), 0)); }).catch(() => {}); };
    pull();
    const timer = window.setInterval(pull, 60_000);
    window.addEventListener('genz:rooms-changed', pull);
    return () => { live = false; window.clearInterval(timer); window.removeEventListener('genz:rooms-changed', pull); };
  }, [roomUser, activeTab]);
  // v57: My Public Page — a badge for new enquiries from the broker's public page
  const [pageBadge, setPageBadge] = useState(0);
  const pageUser = permissions.includes('publicpage:use');
  useEffect(() => {
    if (!pageUser) { setPageBadge(0); return; }
    let live = true;
    const pull = () => { api.ppBadge().then(r => { if (live) setPageBadge(r.count || 0); }).catch(() => {}); };
    pull();
    const timer = window.setInterval(pull, 90_000);
    window.addEventListener('genz:page-changed', pull);
    return () => { live = false; window.clearInterval(timer); window.removeEventListener('genz:page-changed', pull); };
  }, [pageUser, activeTab]);
  const isOwner = currentUser?.role === 'PROPERTY_OWNER';
  const isConnector = currentUser?.role === 'GENZ_CONNECTOR';
  const isMember = currentUser?.role === 'TEAM_MEMBER';

  // Tabs are derived from the server-issued permission list; the API enforces the same rules independently.
  const allTabs = [
    { id: 'dashboard', label: isMember ? t('nav.myWork', 'My Work') : isConnector ? t('nav.myReferrals', 'My Referrals') : t('nav.dashboard', 'Dashboard'), icon: LayoutDashboard },
    ...(has('legal:desk') && !has('legal:manage') ? [{ id: 'legal', label: t('nav.legal', 'Legal Desk'), icon: ScaleIcon, badge: legalBadge }] : []),
    // v54.1 — GENZ admins are never part of a deal chat (they read a deal room only through a dispute), so their Chats list is always empty
    ...(has('deal:chat', 'clientroom:use', 'pchat:use') && currentUser?.role !== 'ADMIN' && currentUser?.role !== 'SUPERADMIN' ? [{ id: 'chats', label: t('nav.chats', 'Chats'), icon: MessageCircle, badge: chatBadge }] : []),
    ...(has('daily:use') ? [{ id: 'daily', label: t('nav.daily', 'Today & Clients'), icon: CalendarCheck }] : []),
    ...(has('pcontrol:manage', 'pcontrol:oversee') ? [{ id: 'pcontrol', label: t('nav.pcontrol', 'Project Control'), icon: SlidersHorizontal }] : has('pcontrol:partner') ? [{ id: 'pcontrol', label: t('nav.myprojects', 'My Projects'), icon: Layers }] : []),
    ...(has('offer:make', 'offer:decide', 'listing:lifecycle') ? [{ id: 'desk', label: t('nav.desk', 'Deal Desk'), icon: Handshake }] : []),
    ...(has('network:use', 'growth:manage') ? [{ id: 'network', label: t('nav.network', 'Tie-ups & Tiers'), icon: Network }] : []),
    ...(has('clientroom:use') ? [{ id: 'clientroom', label: t('nav.clientroom', 'Client Rooms'), icon: MessagesSquare, badge: roomBadge }] : []),
    ...(has('visit:pass', 'visit:scan') ? [{ id: 'visits', label: t('nav.visits', 'Visit QR'), icon: QrCode }] : []),
    ...(has('connector:manage', 'connector:work', 'connector:desk') ? [{ id: 'connector', label: t('nav.connector', 'Connector Desk'), icon: Handshake }] : []),
    ...(has('partner:manage', 'partner:oversee') ? [{ id: 'partners', label: t('nav.partners', 'Shop QR Partners'), icon: Store }] : []),
    ...(has('team:manage') ? [{ id: 'team', label: t('nav.team', 'My Team'), icon: Users }] : []),
    ...(has('publicpage:use') ? [{ id: 'mypage', label: t('nav.mypage', 'My Public Page'), icon: Globe, badge: pageBadge }] : []),
    ...(has('rent:use') ? [{ id: 'rentdesk', label: t('nav.rentdesk', 'Rent Desk'), icon: DoorOpen }] : []),
    ...(has('share:use') ? [{ id: 'share', label: t('nav.share', 'Share Kit'), icon: Share2 }] : []),
    ...(has('propdoc:use') ? [{ id: 'propdocs', label: t('nav.propdocs', 'Property Papers'), icon: FolderOpen }] : []),
    // v49: Protected Docs is a section of Property Papers for whoever has both
    ...(has('pdoc:use') && !has('propdoc:use') ? [{ id: 'pdocs', label: t('nav.pdocs', 'Protected Docs'), icon: FileLock2 }] : []),
    ...(has('chapter:read', 'academy:read', 'loan:manage', 'report:manage') ? [{ id: 'community', label: t('nav.community', 'Community'), icon: GraduationCap }] : []),
    ...(has('growth:nominate') ? [{ id: 'grow', label: t('nav.grow', 'Grow Network'), icon: Users }] : []),
    ...(has('launch:manage') ? [{ id: 'launchdesk', label: t('nav.launchdesk', 'Launch Desk'), icon: Rocket }] : []),
    ...(has('growth:manage') ? [{ id: 'citylaunch', label: t('nav.citylaunch', 'City Launch'), icon: Rocket }] : []),
    ...(has('landrecord:manage') ? [{ id: 'landrecords', label: t('nav.landrecords', 'Land Records'), icon: Landmark }] : []),
    ...(has('builder:associates_read') ? [{ id: 'builder', label: t('nav.builder', 'Builder Launchpad'), icon: Layers }] : []),
    ...(has('crm:read') ? [{ id: 'crm', label: t('nav.crm', 'Associates CRM'), icon: Contact }] : []),
    ...(has('property:read')
      ? [{ id: 'properties', label: isOwner ? t('nav.myProperties', 'My Properties') : t('nav.properties', 'Properties'), icon: Building }]
      : []),
    ...(has('requirement:read') ? [{ id: 'requirements', label: t('nav.requirements', 'Buyer Needs'), icon: UserCheck }] : []),
    ...(has('matching:run') ? [{ id: 'matches', label: t('nav.matches', 'Magic Match'), icon: Sparkles, badge: unreadCount.matches }] : []),
    ...(has('deal:read')
      ? [{ id: 'deals', label: isOwner ? t('nav.myDeals', 'My Property Deals') : t('nav.deals', 'My Deals'), icon: Briefcase, badge: unreadCount.deals }]
      : []),
    ...(has('dd:read') ? [{ id: 'due_diligence', label: t('nav.dd', 'Title Check'), icon: ShieldCheck }] : []),
    ...(has('lead:read') ? [{ id: 'construction', label: t('nav.construction', 'Construction Leads'), icon: HardHat, badge: unreadCount.leads }] : []),
    ...(has('dispute:read') ? [{ id: 'disputes', label: t('nav.disputes', 'Disputes'), icon: Scale, badge: unreadCount.disputes }] : []),
    ...(has('audit:read_all', 'audit:read_own') ? [{ id: 'audit', label: t('nav.audit', 'Activity Record'), icon: History }] : []),
    ...(has('users:invite', 'users:review') ? [{ id: 'onboarding', label: t('nav.onboarding', 'Invite & KYC'), icon: KeyRound }] : []),
    ...(has('users:review') ? [{ id: 'idreview', label: t('nav.idreview', 'ID Review'), icon: FileSearch, badge: idBadge }] : []),
    ...(has('billing:manage') ? [{ id: 'plans', label: t('nav.plansAdmin', 'Plans & Fees'), icon: BadgeIndianRupee, badge: billing.count }] : has('billing:self') && (billing.relevant || activeTab === 'plans') ? [{ id: 'plans', label: t('nav.plans', 'GENZ Membership'), icon: BadgeIndianRupee, badge: billing.count }] : []),
    ...(has('legal:manage') ? [{ id: 'legal', label: t('nav.legalAdmin', 'Legal Help'), icon: ScaleIcon, badge: legalBadge }] : []),
    ...(has('admin:control_center') ? [{ id: 'revenue', label: t('nav.revenue', 'Revenue & Growth'), icon: IndianRupee }] : []),
    ...(has('admin:control_center') ? [{ id: 'control', label: t('nav.control', 'Control Center'), icon: Settings2 }] : []),
  ];
  // v62 — the super admin holds every permission, but a broker's own workspace (his clients, rooms, page, rent desk, offers, passes) is empty
  // for him: those tabs are left out of his menu (he sees a member's screens with "view as"; the routes still work for a direct link)
  const PERSONAL_TABS = ['daily', 'clientroom', 'visits', 'mypage', 'rentdesk', 'share', 'desk'];
  const tabs = currentUser?.role === 'SUPERADMIN' ? allTabs.filter(x => !PERSONAL_TABS.includes(x.id)) : allTabs;

  // A remembered or linked tab this user may not open (permissions changed, someone else's link) → dashboard, never an empty page.
  const allowed = allTabs.some(x => x.id === activeTab);
  useEffect(() => {
    if (!currentUser || allowed) return;
    // v49: an old Protected Docs link / shortcut opens that section inside Property Papers
    if (activeTab === 'pdocs' && has('propdoc:use') && has('pdoc:use')) { goto('propdocs', { tab: 'propdocs', sub: 'protected' }, t2 => onChangeTab(t2)); return; }
    onChangeTab('dashboard');
  }, [allowed, currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // v26 — on a phone a broker gets 5 big buttons at the bottom instead of ~20 tabs; “More” opens the full list.
  // v62 — every role with more than 6 tabs gets the same (admin 25, super admin 28, builder 14, legal 11…), with its own 4 buttons.
  const role = currentUser?.role || '';
  const simple = role === 'BROKER' || tabs.length > 6;
  const [more, setMore] = useState(false);
  // v44: the first id that exists wins (so “Deals” opens the deal pipeline; Deal Desk stays one tap away in More)
  const pick = (ids: string[]) => ids.map(id => tabs.find(x => x.id === id)).find(Boolean);
  const HOME = { ids: ['dashboard'], key: 'nav.home', en: 'Home' };
  const BOTTOM: Record<string, Array<{ ids: string[]; key: string; en: string }>> = {
    BROKER: [HOME, { ids: ['properties'], key: 'nav.propShort', en: 'Property' }, { ids: ['requirements'], key: 'nav.buyersShort', en: 'Buyers' }, { ids: ['deals', 'desk'], key: 'nav.dealsShort', en: 'Deals' }],
    DEVELOPER_BUILDER: [HOME, { ids: ['pcontrol'], key: 'nav.projectsShort', en: 'Projects' }, { ids: ['crm'], key: 'nav.crmShort', en: 'CRM' }, { ids: ['chats'], key: 'nav.chats', en: 'Chats' }],
    ADMIN: [HOME, { ids: ['onboarding', 'idreview'], key: 'nav.kycShort', en: 'KYC' }, { ids: ['disputes'], key: 'nav.disputesShort', en: 'Disputes' }, { ids: ['plans'], key: 'nav.feesShort', en: 'Fees' }],
    SUPERADMIN: [HOME, { ids: ['onboarding', 'idreview'], key: 'nav.kycShort', en: 'KYC' }, { ids: ['disputes'], key: 'nav.disputesShort', en: 'Disputes' }, { ids: ['control', 'plans'], key: 'nav.controlShort', en: 'Control' }],
    LEGAL_COUNSEL: [HOME, { ids: ['legal'], key: 'nav.legalShort', en: 'Legal' }, { ids: ['due_diligence'], key: 'nav.ddShort', en: 'Title' }, { ids: ['propdocs', 'pdocs'], key: 'nav.papersShort', en: 'Papers' }],
    PROPERTY_OWNER: [HOME, { ids: ['properties'], key: 'nav.propShort', en: 'Property' }, { ids: ['deals'], key: 'nav.dealsShort', en: 'Deals' }, { ids: ['chats', 'disputes'], key: 'nav.chats', en: 'Chats' }],
    CONTRACTOR: [HOME, { ids: ['construction'], key: 'nav.leadsShort', en: 'Leads' }, { ids: ['team'], key: 'nav.teamShort', en: 'Team' }, { ids: ['disputes'], key: 'nav.disputesShort', en: 'Disputes' }],
  };
  const bottom = simple ? (BOTTOM[role] || [HOME, ...tabs.filter(x => x.id !== 'dashboard').slice(0, 3).map(x => ({ ids: [x.id], key: '', en: '' }))])
    .map(b => { const tab = pick(b.ids); return { tab, label: b.key ? t(b.key, b.en) : (tab?.label || '') }; }).filter(x => x.tab) : [];
  const inBottom = bottom.some(b => b.tab!.id === activeTab);

  // v31 — a broker's ~23 tabs in 6 groups, each in priority order (the order of `ids` is the order shown; a group opens on its first tab). Every tab is still reachable: a group lists the tabs below, and anything not named lands in “Other”.
  const BROKER_GROUP_DEFS: Array<{ id: string; key: string; en: string; ids: string[] }> = [
    { id: 'today', key: 'nav.g.today', en: 'Today', ids: ['dashboard', 'chats', 'daily', 'visits'] },
    { id: 'property', key: 'nav.g.property', en: 'Property & Buyers', ids: ['properties', 'requirements', 'matches', 'mypage', 'share', 'propdocs', 'pdocs', 'landrecords'] },
    // v45: client rooms sit with the deals (a buyer's room → visit → offer → deal room)
    { id: 'deals', key: 'nav.g.deals', en: 'Deals', ids: ['deals', 'clientroom', 'desk', 'rentdesk', 'legal', 'due_diligence', 'disputes', 'audit'] },
    { id: 'sales', key: 'nav.g.sales', en: 'Sales & Team', ids: ['crm', 'partners', 'builder', 'pcontrol', 'connector', 'construction', 'team'] },
    { id: 'grow', key: 'nav.g.grow', en: 'Network & Growth', ids: ['network', 'community', 'grow', 'plans', 'launchdesk', 'citylaunch'] },
  ];
  // v62 — GENZ staff: the day's checks first, then money & growth, the market, sales, and the controls & records
  const ADMIN_GROUP_DEFS: Array<{ id: string; key: string; en: string; ids: string[] }> = [
    { id: 'today', key: 'nav.g.today', en: 'Today', ids: ['dashboard', 'onboarding', 'idreview', 'disputes', 'legal'] },
    { id: 'money', key: 'nav.g.money', en: 'Money & Growth', ids: ['plans', 'revenue', 'citylaunch', 'launchdesk', 'grow', 'network', 'community'] },
    { id: 'market', key: 'nav.g.market', en: 'Listings & Deals', ids: ['properties', 'requirements', 'matches', 'deals', 'due_diligence', 'construction', 'landrecords', 'propdocs', 'pdocs'] },
    { id: 'sales', key: 'nav.g.sales', en: 'Sales & Team', ids: ['crm', 'builder', 'pcontrol', 'connector', 'partners', 'team'] },
    { id: 'control', key: 'nav.g.control', en: 'Control & Records', ids: ['control', 'audit'] },
  ];
  const GROUP_DEFS = role === 'ADMIN' || role === 'SUPERADMIN' ? ADMIN_GROUP_DEFS : BROKER_GROUP_DEFS;
  const groups = (() => {
    const placed = new Set<string>();
    const g = GROUP_DEFS.map(d => ({ ...d, label: t(d.key, d.en), tabs: d.ids.map(id => tabs.find(x => x.id === id)).filter(Boolean) as typeof tabs })).filter(d => d.tabs.length > 0);
    g.forEach(d => d.tabs.forEach(x => placed.add(x.id)));
    const rest = tabs.filter(x => !placed.has(x.id));
    if (rest.length) g.push({ id: 'other', key: 'nav.g.other', en: 'Other', ids: rest.map(x => x.id), label: t('nav.g.other', 'Other'), tabs: rest });
    return g;
  })();
  const activeGroup = groups.find(d => d.tabs.some(x => x.id === activeTab)) || groups[0];
  const gBadge = (d: { tabs: Array<{ badge?: number }> }) => d.tabs.reduce((n, x) => n + (x.badge || 0), 0);

  return (
    <div className="w-full border-b border-slate-200 bg-slate-50/50">
      {simple && (
        <>
          <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] md:hidden" aria-label="Main" data-testid="bottom-nav">
            {bottom.map(b => {
              const Icon = b.tab!.icon; const on = activeTab === b.tab!.id;
              return (
                <button key={b.tab!.id} onClick={() => { setMore(false); onChangeTab(b.tab!.id as TabType); }} data-testid={`bottom-${b.tab!.id}`}
                  className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${on ? 'text-slate-900' : 'text-slate-500'}`}>
                  <Icon className={`h-5 w-5 ${on ? 'text-amber-500' : ''}`} />{b.label}
                  {Boolean(b.tab!.badge && b.tab!.badge > 0) && <span className="absolute right-3 top-1.5 h-2 w-2 rounded-full bg-red-500" />}
                </button>
              );
            })}
            <button onClick={() => setMore(m => !m)} data-testid="bottom-more" className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${more || (!inBottom && activeTab !== 'dashboard') ? 'text-slate-900' : 'text-slate-500'}`}>
              <LayoutDashboard className="h-5 w-5" />{t('nav.more', 'More')}
            </button>
          </nav>
          {more && (
            <div className="fixed inset-0 z-30 bg-slate-900/30 md:hidden" onClick={() => setMore(false)}>
              <div className="absolute inset-x-0 bottom-14 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-white p-3 pb-6 shadow-xl" onClick={e => e.stopPropagation()} data-testid="more-sheet">
                {groups.map(g => { const rest = g.tabs.filter(x => !bottom.some(b => b.tab!.id === x.id)); if (!rest.length) return null; return (
                  <div key={g.id} className="mb-3" data-testid={`more-group-${g.id}`}>
                    <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{g.label}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {rest.map(tab => { const Icon = tab.icon; return (
                        <button key={tab.id} onClick={() => { setMore(false); onChangeTab(tab.id as TabType); }} className={`relative flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center text-[11px] font-semibold ${activeTab === tab.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                          <Icon className="h-5 w-5" /><span className="leading-tight">{tab.label}</span>
                          {Boolean(tab.badge && tab.badge > 0) && <span className="absolute right-1.5 top-1.5 rounded-full bg-red-500 px-1 text-[9px] text-white">{tab.badge}</span>}
                        </button>
                      ); })}
                    </div>
                  </div>
                ); })}
              </div>
            </div>
          )}
        </>
      )}
      <div className={`mx-auto max-w-7xl px-4 sm:px-6 ${simple ? 'hidden md:block' : ''}`}>
        {simple && groups.length > 1 && (
          <nav className="flex gap-1.5 overflow-x-auto pt-2 scrollbar-none" aria-label="Groups" data-testid="nav-groups">
            {groups.map(g => {
              const on = activeGroup?.id === g.id; const b = gBadge(g);
              return (
                <button key={g.id} data-testid={`group-${g.id}`} aria-pressed={on}
                  onClick={() => { if (!on) onChangeTab(g.tabs[0].id as TabType); }}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'}`}>
                  {g.label}{b > 0 && <span className={`ml-1.5 rounded-full px-1.5 text-[10px] ${on ? 'bg-amber-400 text-slate-950' : 'bg-red-500 text-white'}`}>{b}</span>}
                </button>
              );
            })}
          </nav>
        )}
        <nav className="flex space-x-1 overflow-x-auto py-2 scrollbar-none" aria-label="Tabs">
          {(simple && groups.length > 1 && activeGroup ? activeGroup.tabs : tabs).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onChangeTab(tab.id as TabType)}
                className={`group flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-all md:min-h-0 md:text-xs ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    isActive ? 'text-amber-400' : 'text-slate-400 group-hover:text-slate-700'
                  }`}
                />
                <span>{tab.label}</span>
                {Boolean(tab.badge && tab.badge > 0) && (
                  <span
                    className={`ml-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                      isActive
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-slate-200 text-slate-700 group-hover:bg-slate-300'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
