import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import {
  UserProfile,
  Property,
  BuyerRequirement,
  DealRoom,
  ConstructionLead,
  Dispute,
  SiteVisit,
  BuilderProject,
  SalesAssociateMandate,
  CollaborationOffer,
  OwnerMandate,
} from './types/index.js';
import { api, setUnauthorizedHandler, type PropertyFacets } from './lib/api.js';
import { hasPerm } from './lib/permissions.js';
import { useTx, useI18n } from './lib/i18n.js';
import { LoginView, ChangePasswordView, PendingApprovalView } from './components/LoginView.js';
import { PrivacyCenter, PrivacyQueue } from './components/PrivacyCenter.js';
import { AlertsNudge } from './components/AlertsCard.js';
import { syncPush, disablePush } from './lib/push.js';
import { Navbar } from './components/Navbar.js';
import { NavigationTabs, TabType } from './components/NavigationTabs.js';
import { useChatBadge } from './lib/useChatBadge.js';
import { GrowthNudge } from './components/GrowthNudge.js';
import { Loader2, ShieldCheck, MapPin, Building2, Eye } from 'lucide-react';
import { lazyView, prefetch } from './lib/lazyView.js';
import { TabErrorBoundary, TabLoading } from './components/TabErrorBoundary.js';

// v20: screens load on demand (see lib/lazyView.ts)
const CrmView = lazyView(() => import('./components/CrmView.js'), 'CrmView');
const ConnectorHome = lazyView(() => import('./components/ConnectorHome.js'), 'ConnectorHome');
const BrokerHome = lazyView(() => import('./components/BrokerHome.js'), 'BrokerHome');
const ConnectorDesk = lazyView(() => import('./components/ConnectorDesk.js'), 'ConnectorDesk');
const ControlCenter = lazyView(() => import('./components/ControlCenter.js'), 'ControlCenter');
const LaunchDesk = lazyView(() => import('./components/LaunchDesk.js'), 'LaunchDesk');
const NetworkHub = lazyView(() => import('./components/NetworkHub.js'), 'NetworkHub');
const IdReviewView = lazyView(() => import('./components/IdReviewView.js'), 'IdReviewView');
const PlansFeesView = lazyView(() => import('./components/PlansFees.js'), 'PlansFeesView');
const LegalHelpView = lazyView(() => import('./components/LegalHelp.js'), 'LegalHelpView');
const RevenueGrowthView = lazyView(() => import('./components/RevenueGrowthView.js'), 'RevenueGrowthView');
const DealDesk = lazyView(() => import('./components/DealDesk.js'), 'DealDesk');
const BuyerBondsAdmin = lazyView(() => import('./components/BuyerBond.js'), 'BuyerBondsAdmin');
const PartyWatchBroker = lazyView(() => import('./components/PartyWatch.js'), 'PartyWatchBroker');
const PartyWatchAdmin = lazyView(() => import('./components/PartyWatch.js'), 'PartyWatchAdmin');
const PhotoCheckAdmin = lazyView(() => import('./components/VerifiedPhoto.js'), 'PhotoCheckAdmin');
const ClientRoomsTab = lazyView(() => import('./components/ClientRooms.js'), 'ClientRoomsTab');
const ChatsView = lazyView(() => import('./components/ChatsView.js'), 'ChatsView');
const ShopPartnersView = lazyView(() => import('./components/ShopPartners.js'), 'ShopPartnersView');
const VisitsView = lazyView(() => import('./components/VisitsView.js'), 'VisitsView');
const QuickScan = lazyView(() => import('./components/QuickScan.js'), 'QuickScan');
const QrMenu = lazyView(() => import('./components/QuickScan.js'), 'QrMenu');
const ProjectControlView = lazyView(() => import('./components/ProjectControlView.js'), 'ProjectControlView');
const MyProjectsView = lazyView(() => import('./components/MyProjectsView.js'), 'MyProjectsView');
const TeamView = lazyView(() => import('./components/TeamView.js'), 'TeamView');
const ShareKit = lazyView(() => import('./components/ShareKit.js'), 'ShareKit');
const LandRecordsView = lazyView(() => import('./components/LandRecordsView.js'), 'LandRecordsView');
const GrowthView = lazyView(() => import('./components/GrowthView.js'), 'GrowthView');
const PublicPageView = lazyView(() => import('./components/PublicPageView.js'), 'PublicPageView');
const RentDeskView = lazyView(() => import('./components/RentDeskView.js'), 'RentDeskView');
const DailyView = lazyView(() => import('./components/DailyView.js'), 'DailyView');
const PropertyPapersView = lazyView(() => import('./components/PropertyPapersView.js'), 'PropertyPapersView');
const ProtectedDocsView = lazyView(() => import('./components/ProtectedDocsView.js'), 'ProtectedDocsView');
const CommunityView = lazyView(() => import('./components/CommunityView.js'), 'CommunityView');
const CityLaunch = lazyView(() => import('./components/CityLaunch.js'), 'CityLaunch');
const HomeInsights = lazyView(() => import('./components/HomeInsights.js'), 'HomeInsights');
const TeamHome = lazyView(() => import('./components/TeamHome.js'), 'TeamHome');
const DashboardView = lazyView(() => import('./components/DashboardView.js'), 'DashboardView');
const BuilderLaunchpadView = lazyView(() => import('./components/BuilderLaunchpadView.js'), 'BuilderLaunchpadView');
const PropertiesView = lazyView(() => import('./components/PropertiesView.js'), 'PropertiesView');
const RequirementsView = lazyView(() => import('./components/RequirementsView.js'), 'RequirementsView');
const MatchCenterView = lazyView(() => import('./components/MatchCenterView.js'), 'MatchCenterView');
const DealRoomsView = lazyView(() => import('./components/DealRoomsView.js'), 'DealRoomsView');
const DueDiligenceView = lazyView(() => import('./components/DueDiligenceView.js'), 'DueDiligenceView');
const ConstructionView = lazyView(() => import('./components/ConstructionView.js'), 'ConstructionView');
const DisputesView = lazyView(() => import('./components/DisputesView.js'), 'DisputesView');
const AuditTrailView = lazyView(() => import('./components/AuditTrailView.js'), 'AuditTrailView');
const OnboardingView = lazyView(() => import('./components/OnboardingView.js'), 'OnboardingView');
const SiteVisitQrPassModal = lazyView(() => import('./components/SiteVisitQrPassModal.js'), 'SiteVisitQrPassModal');
const PublicBrokerQrModal = lazyView(() => import('./components/PublicBrokerQrModal.js'), 'PublicBrokerQrModal');
const BrokerSafetyModal = lazyView(() => import('./components/BrokerSafetyModal.js'), 'BrokerSafetyModal');
const AddPropertyModal = lazyView(() => import('./components/Modals.js'), 'AddPropertyModal');
const AddRequirementModal = lazyView(() => import('./components/Modals.js'), 'AddRequirementModal');
const CollaborationModal = lazyView(() => import('./components/Modals.js'), 'CollaborationModal');
const ScheduleVisitModal = lazyView(() => import('./components/Modals.js'), 'ScheduleVisitModal');
const VerifyVisitOtpModal = lazyView(() => import('./components/Modals.js'), 'VerifyVisitOtpModal');
const FileDisputeModal = lazyView(() => import('./components/Modals.js'), 'FileDisputeModal');
const AddConstructionLeadModal = lazyView(() => import('./components/Modals.js'), 'AddConstructionLeadModal');

const TAB_KEY = 'genz.tab';
const ALL_TABS: TabType[] = ['dashboard', 'builder', 'properties', 'requirements', 'matches', 'deals', 'due_diligence', 'construction', 'disputes', 'audit', 'onboarding', 'crm', 'connector', 'control', 'team', 'share', 'landrecords', 'grow', 'citylaunch', 'daily', 'pdocs', 'propdocs', 'community', 'pcontrol', 'visits', 'clientroom', 'desk', 'network', 'launchdesk', 'idreview', 'revenue', 'legal', 'plans', 'partners', 'mypage', 'rentdesk', 'chats'];

export default function App() {
  const tx = useTx();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [authState, setAuthState] = useState<'checking' | 'anon' | 'ready'>('checking');
  const bootRetry = useRef(0);
  // v44: "session ended" only for someone who WAS signed in (a first-time visitor just sees the sign-in page)
  const wasSignedIn = useRef(false);
  useEffect(() => { if (currentUser) wasSignedIn.current = true; }, [currentUser]);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [impersonatedBy, setImpersonatedBy] = useState<{ id: string; name: string } | null>(null);
  const [sessionNotice, setSessionNotice] = useState('');
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  // v20: the app starts with MY listings + the newest ones; the full network is searched page by page on the server
  const [requirementScope, setRequirementScope] = useState<{ total: number; scoped: boolean }>({ total: 0, scoped: false });
  const [propertyScope, setPropertyScope] = useState<{ total: number; scoped: boolean; facets?: PropertyFacets }>({ total: 0, scoped: false });
  const [activeTab, setActiveTabRaw] = useState<TabType>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab') as TabType;
      // v20: every tab can be opened by link (?tab=daily, ?tab=grow…); the nav still drops tabs the role may not use
      if (tabParam && ALL_TABS.includes(tabParam)) {
        return tabParam;
      }
      if (params.get('propertyId')) return 'properties';
      if (params.get('reqId')) return 'requirements';
      // A page reload (dev-server refresh, app update, F5) keeps the user on the tab they were on. Login / view-as / logout reset it.
      try { const kept = sessionStorage.getItem(TAB_KEY) as TabType | null; if (kept && ALL_TABS.includes(kept)) return kept; } catch { /* storage blocked */ }
    }
    return 'dashboard';
  });
  const setActiveTab = (t: TabType) => { setActiveTabRaw(t); try { sessionStorage.setItem(TAB_KEY, t); } catch { /* storage blocked */ } };
  const chatBadge = useChatBadge(permissions, activeTab);
  // v23: a screen can ask to open another tab ("Open Plans & Fees")
  useEffect(() => {
    const go = (e: Event) => { const t = (e as CustomEvent).detail as TabType; if (ALL_TABS.includes(t)) setActiveTab(t); };
    window.addEventListener('genz:goto-tab', go);
    return () => window.removeEventListener('genz:goto-tab', go);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Domain State
  const [properties, setProperties] = useState<Property[]>([]);
  const [requirements, setRequirements] = useState<BuyerRequirement[]>([]);
  const [deals, setDeals] = useState<DealRoom[]>([]);
  const [offers, setOffers] = useState<CollaborationOffer[]>([]);
  const [constructionLeads, setConstructionLeads] = useState<ConstructionLead[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [projects, setProjects] = useState<BuilderProject[]>([]);
  const [mandates, setMandates] = useState<SalesAssociateMandate[]>([]);
  const [ownerMandates, setOwnerMandates] = useState<OwnerMandate[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Modal Dialog States
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [showAddRequirement, setShowAddRequirement] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  const [showBrokerQrModal, setShowBrokerQrModal] = useState(false);
  // v45 — header QR: a small menu (scan a visit QR / my card) and the scanner itself
  const [showQrMenu, setShowQrMenu] = useState(false);
  const [showQuickScan, setShowQuickScan] = useState(false);
  const [showBrokerSafetyModal, setShowBrokerSafetyModal] = useState(false);
  const [showFileDispute, setShowFileDispute] = useState<{ open: boolean; dealId?: string }>({ open: false });
  const [collaborationTarget, setCollaborationTarget] = useState<{
    open: boolean;
    propertyId: string;
    requirementId?: string;
    receivingBrokerId: string;
  } | null>(null);
  const [scheduleVisitTarget, setScheduleVisitTarget] = useState<{
    open: boolean;
    dealId?: string;
    propertyId: string;
    propertyTitle?: string;
    /** v40 — the deal room's buyer, filled in (the broker can change it) */
    defaults?: { name?: string; phone?: string };
  } | null>(null);
  const [verifyOtpVisit, setVerifyOtpVisit] = useState<SiteVisit | null>(null);
  const [qrPassVisit, setQrPassVisit] = useState<SiteVisit | null>(null);
  const [dealRoomsRefreshKey, setDealRoomsRefreshKey] = useState<number>(0);
  const openScheduleVisit = (dealId: string, propertyId: string) => {
    const prop = properties.find((p) => p.id === propertyId);
    // v40 — the buyer of this deal room is filled in when this broker can see him (his own requirement; a masked number is left out)
    const deal = deals.find((d) => d.id === dealId);
    const req = deal?.requirementId ? requirements.find((q) => q.id === deal.requirementId) : undefined;
    const phone = req?.customerPhone && !/[x*•]/i.test(req.customerPhone) ? req.customerPhone : undefined;
    setScheduleVisitTarget({
      open: true,
      dealId,
      propertyId,
      propertyTitle: prop?.title,
      defaults: req ? { name: req.customerName, phone } : undefined,
    });
  };
  // v53 — the chat's "+ Visit" opens the same schedule-visit window from the chat screen (the window sits above the full-screen chat)
  const openScheduleVisitRef = useRef(openScheduleVisit); openScheduleVisitRef.current = openScheduleVisit;
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail || {}; if (d.dealId && d.propertyId) openScheduleVisitRef.current(d.dealId, d.propertyId); };
    window.addEventListener('genz:schedule-visit', h);
    return () => window.removeEventListener('genz:schedule-visit', h);
  }, []);

  // Matching Selection State
  const [matchSelectedReqId, setMatchSelectedReqId] = useState<string | undefined>(undefined);
  const [matchSelectedPropId, setMatchSelectedPropId] = useState<string | undefined>(undefined);

  // Fetch everything the signed-in role is allowed to see (each call is permission-gated server-side too).
  const loadData = async () => {
    try {
      const meRes = await api.getMe();
      const perms = meRes.permissions || [];
      setCurrentUser(meRes.user);
      setPermissions(perms);
      setMustChangePassword(!!meRes.mustChangePassword);
      setImpersonatedBy(meRes.impersonatedBy || null);
      setAuthState('ready');

      if (meRes.user.verificationStatus !== 'VERIFIED' || meRes.mustChangePassword) return;

      const has = (...p: string[]) => hasPerm(perms, ...p);
      const skip = <T,>(v: T) => Promise.resolve(v);
      const [users, props, reqs, dealsR, leads, disp, metr, proj, assoc, offs, omand] = await Promise.allSettled([
        api.getUsers(),
        has('property:read') ? api.getProperties({ scope: 'boot' }) : skip({ properties: [] as Property[] }),
        has('requirement:read') ? api.getRequirements({ scope: 'boot' }) : skip({ requirements: [] as BuyerRequirement[] }),
        has('deal:read') ? api.getDeals() : skip({ deals: [] as DealRoom[] }),
        has('lead:read') ? api.getConstructionLeads() : skip({ leads: [] as ConstructionLead[] }),
        has('dispute:read') ? api.getDisputes() : skip({ disputes: [] as Dispute[] }),
        has('metrics:own') ? api.getAdminMetrics() : skip({ metrics: null }),
        has('builder:projects_read') ? api.getBuilderProjects() : skip({ projects: [] as BuilderProject[] }),
        has('builder:associates_read', 'builder:my_mandates') ? api.getBuilderAssociates() : skip({ mandates: [] as SalesAssociateMandate[] }),
        has('collab:read') ? api.getOffers() : skip({ success: true, offers: [] as CollaborationOffer[] }),
        has('mandate:read') ? api.getOwnerMandates() : skip({ success: true, mandates: [] as OwnerMandate[] }),
      ]);
      const ok = <T,>(r: PromiseSettledResult<T>): T | undefined => (r.status === 'fulfilled' ? r.value : undefined);

      setUsers(ok(users)?.users || []);
      setProperties(ok(props)?.properties || []);
      setPropertyScope({ total: (ok(props) as any)?.total ?? (ok(props)?.properties || []).length, scoped: !!(ok(props) as any)?.scoped, facets: (ok(props) as any)?.facets });
      setRequirements(ok(reqs)?.requirements || []);
      setRequirementScope({ total: (ok(reqs) as any)?.total ?? (ok(reqs)?.requirements || []).length, scoped: !!(ok(reqs) as any)?.scoped });
      setDeals(ok(dealsR)?.deals || []);
      setConstructionLeads((ok(leads) as any)?.leads || []);
      setDisputes(ok(disp)?.disputes || []);
      setMetrics((ok(metr) as any)?.metrics ?? null);
      setProjects((ok(proj) as any)?.projects || []);
      setMandates((ok(assoc) as any)?.mandates || []);
      setOffers((ok(offs) as any)?.offers || []);
      setOwnerMandates((ok(omand) as any)?.mandates || []);
      bootRetry.current = 0;
    } catch (err: any) {
      if (err?.status === 401) {
        setAuthState('anon');
        setCurrentUser(null);
      } else {
        // v28 — a busy server (429), a server hiccup (5xx) or a dropped mobile connection is NOT a sign-out:
        // stay signed in (or keep checking) and try again, instead of throwing the member back to the login page.
        console.error('Failed to load platform data:', err);
        if (bootRetry.current < 4) {
          bootRetry.current += 1;
          window.setTimeout(() => { void loadData(); }, 1500 * bootRetry.current);
        } else {
          bootRetry.current = 0;
          setAuthState(prev => (prev === 'ready' ? 'ready' : 'anon'));
        }
        return;
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setCurrentUser(null);
      setAuthState('anon');
      if (wasSignedIn.current) setSessionNotice('SESSION_ENDED');
    });
    loadData();
    return () => setUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // v20: once signed in, warm the files of the screens this role opens most (idle time only, never blocks the first screen)
  useEffect(() => {
    if (!currentUser || currentUser.verificationStatus !== 'VERIFIED') return;
    const r = currentUser.role;
    const common = [() => import('./components/Modals.js')];
    const byRole: Record<string, (() => Promise<unknown>)[]> = {
      BROKER: [() => import('./components/DailyView.js'), () => import('./components/PropertiesView.js'), () => import('./components/NetworkHub.js')],
      DEVELOPER_BUILDER: [() => import('./components/ProjectControlView.js'), () => import('./components/CrmView.js')],
      SUPERADMIN: [() => import('./components/ControlCenter.js'), () => import('./components/OnboardingView.js')],
      ADMIN: [() => import('./components/OnboardingView.js'), () => import('./components/IdReviewView.js')],
      TEAM_MEMBER: [() => import('./components/CrmView.js')],
    };
    prefetch([...(byRole[r] || []), ...(r === 'BROKER' || r === 'PROPERTY_OWNER' ? common : [])]);
  }, [currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoggedIn = async () => {
    setSessionNotice('');
    setLoading(true);
    setActiveTab('dashboard');
    await loadData();
  };

  // v59 — this phone's alerts follow the person signed in on it (never while "viewing as" someone), in the language of his app
  const { lang } = useI18n();
  useEffect(() => { if (currentUser?.id && !impersonatedBy) void syncPush(currentUser.id); }, [currentUser?.id, impersonatedBy?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!currentUser?.id || impersonatedBy) return;
    api.pushPrefs().then(r => { if ((r?.prefs?.lang || 'en') !== lang) return api.pushPrefsSave({ lang }); }).catch(() => { /* alerts stay in the last language */ });
  }, [currentUser?.id, impersonatedBy?.id, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = async () => {
    // v59 — signing out also stops this person's alerts on this phone (a shared office phone carries nobody's alerts after it)
    if (!impersonatedBy) { try { await disablePush(); } catch { /* the browser refused: the server copy goes after failed sends */ } }
    try { await api.logout(); } catch { /* ignore */ }
    setCurrentUser(null);
    setPermissions([]);
    setProperties([]); setRequirements([]); setDeals([]); setOffers([]); setDisputes([]); setConstructionLeads([]);
    setProjects([]); setMandates([]); setOwnerMandates([]); setMetrics(null); setUsers([]);
    setAuthState('anon');
    try { sessionStorage.removeItem(TAB_KEY); } catch { /* storage blocked */ }
  };

  const pendingIncomingOffers = useMemo(() => {
    return offers.filter(
      (o) =>
        (o.receivingBrokerId === currentUser?.id ||
          currentUser?.role === 'SUPERADMIN' ||
          currentUser?.role === 'ADMIN') &&
        o.status === 'PENDING'
    );
  }, [offers, currentUser]);

  const handleViewAs = async (userId: string) => {
    setLoading(true);
    try {
      await api.impersonate(userId);
      setActiveTab('dashboard');
      await loadData();
    } catch (err) {
      console.error('View-as error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStopViewAs = async () => {
    setLoading(true);
    try {
      await api.stopImpersonating();
      setActiveTab('dashboard');
      await loadData();
    } finally {
      setLoading(false);
    }
  };

  if (authState === 'anon') {
    return <LoginView onLoggedIn={handleLoggedIn} notice={sessionNotice} />;
  }

  if (authState === 'ready' && currentUser && mustChangePassword) {
    return <ChangePasswordView onDone={handleLoggedIn} onLogout={handleLogout} />;
  }

  if (authState === 'ready' && currentUser && currentUser.verificationStatus !== 'VERIFIED') {
    return <PendingApprovalView status={currentUser.verificationStatus} name={currentUser.name} role={currentUser.role} onLogout={handleLogout} />;
  }

  if (loading || !currentUser) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 text-slate-700">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900" />
        <h2 className="mt-4 text-base font-bold text-slate-900">
          GENZ BROKER NETWORK
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Loading real estate exchange &amp; anti-bypass ledger...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/70 text-slate-900">
      {/* Top Header Navbar */}
      {impersonatedBy && (
        <div className="flex items-center justify-center gap-3 bg-amber-400 px-4 py-1.5 text-xs font-semibold text-slate-900">
          <Eye className="h-4 w-4" /> {tx(`Read-only “view as” ${currentUser.name} (${currentUser.role.replace(/_/g, ' ')}) — signed in as ${impersonatedBy.name}`, `सिर्फ़ देखने का “व्यू एज़” — ${currentUser.name} (${currentUser.role.replace(/_/g, ' ')}); साइन इन: ${impersonatedBy.name}`)}
          <button onClick={handleStopViewAs} className="rounded bg-slate-900 px-2 py-0.5 text-white">{tx('Exit', 'बाहर निकलें')}</button>
        </div>
      )}
      <Navbar
        currentUser={currentUser}
        users={users}
        canViewAs={hasPerm(permissions, 'users:impersonate') && !impersonatedBy}
        onViewAs={handleViewAs}
        onLogout={handleLogout}
        onOpenPrivacy={() => setShowPrivacy(true)}
        onOpenInviteModal={() => setActiveTab('onboarding')}
        onOpenBrokerQrModal={currentUser.role === 'BROKER' ? () => setShowQrMenu(true) : undefined}
        onOpenScan={currentUser.role !== 'BROKER' && hasPerm(permissions, 'sitevisit:verify', 'visit:scan') ? () => setShowQuickScan(true) : undefined}
        onOpenBrokerSafetyModal={() => setShowBrokerSafetyModal(true)}
        onOpenChats={hasPerm(permissions, 'deal:chat', 'clientroom:use') && currentUser.role !== 'ADMIN' && currentUser.role !== 'SUPERADMIN' ? () => setActiveTab('chats') : undefined}
        chatCount={chatBadge}
      />

      {/* Segmented Navigation Tabs */}
      <NavigationTabs
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        currentUser={currentUser}
        permissions={permissions}
        chatBadge={chatBadge}
        unreadCount={{
          deals: pendingIncomingOffers.length > 0 ? pendingIncomingOffers.length : deals.length,
          leads: constructionLeads.filter((l) => l.status === 'OPEN').length,
          disputes: disputes.filter((d) => d.status === 'OPEN').length,
        }}
      />

      {/* Main Content Area */}
      <main className={`flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 ${currentUser.role === 'BROKER' ? 'pb-24 md:pb-6' : ''}`}>
        <TabErrorBoundary key={activeTab} area={activeTab}>
        <Suspense fallback={<TabLoading />}>
        {activeTab === 'dashboard' && currentUser.role === 'GENZ_CONNECTOR' && (
          <ConnectorHome currentUser={currentUser} onProfileChanged={loadData} />
        )}

        {activeTab === 'dashboard' && currentUser.role === 'GENZ_CONNECTOR' && <HomeInsights role={currentUser.role} onNavigate={setActiveTab} />}

        {/* v59 — every role gets its work alerts; the broker's home has this inside his first steps */}
        {activeTab === 'dashboard' && currentUser.role !== 'BROKER' && currentUser.verificationStatus === 'VERIFIED' && <AlertsNudge role={currentUser.role} />}

        {activeTab === 'dashboard' && currentUser.role === 'TEAM_MEMBER' && (
          <TeamHome currentUser={currentUser} deals={deals} onNavigate={setActiveTab} permissions={permissions} />
        )}

        {activeTab === 'dashboard' && currentUser.role === 'BROKER' && currentUser.verificationStatus === 'VERIFIED' && (
          <BrokerHome name={currentUser.name} user={currentUser} onNavigate={setActiveTab} onOpenAddRequirement={() => setShowAddRequirement(true)}
            offersWaiting={pendingIncomingOffers.length}
            onOpenAddProperty={hasPerm(permissions, 'property:create') ? () => setShowAddProperty(true) : undefined}
            onOpenAddLead={hasPerm(permissions, 'lead:create') ? () => setShowAddLead(true) : undefined}
            canGrow={hasPerm(permissions, 'growth:nominate')} />
        )}

        {/* v43: a verified broker sees the setup bar inside his home (after his first steps), not twice */}
        {activeTab === 'dashboard' && currentUser.verificationStatus === 'VERIFIED' && currentUser.role !== 'BROKER' && hasPerm(permissions, 'growth:nominate') && <GrowthNudge onOpen={() => setActiveTab('grow')} />}

        {activeTab === 'dashboard' && ['ADMIN', 'SUPERADMIN'].includes(currentUser.role) && <HomeInsights role={currentUser.role} onNavigate={setActiveTab} />}

        {activeTab === 'dashboard' && currentUser.role !== 'GENZ_CONNECTOR' && currentUser.role !== 'TEAM_MEMBER' && (
          <DashboardView
            currentUser={currentUser}
            permissions={permissions}
            projects={projects}
            mandates={mandates}
            properties={properties}
            requirements={requirements}
            deals={deals}
            constructionLeads={constructionLeads}
            metrics={metrics}
            offers={offers}
            onNavigate={setActiveTab}
            onOpenAddProperty={() => setShowAddProperty(true)}
            onOpenAddRequirement={() => setShowAddRequirement(true)}
            onOpenAddLead={() => setShowAddLead(true)}
          />
        )}

        {activeTab === 'dashboard' && ['PROPERTY_OWNER', 'BUYER_TENANT', 'LEGAL_COUNSEL', 'DEVELOPER_BUILDER', 'CONTRACTOR'].includes(currentUser.role) && <HomeInsights role={currentUser.role} onNavigate={setActiveTab} />}

        {activeTab === 'builder' && hasPerm(permissions, 'builder:associates_read') && (
          <BuilderLaunchpadView
            currentUser={currentUser}
            projects={projects}
            mandates={mandates}
            brokers={users.filter((u) => u.role === 'BROKER')}
            builders={users.filter((u) => u.role === 'DEVELOPER_BUILDER' && u.verificationStatus === 'VERIFIED')}
            onRefreshData={loadData}
          />
        )}

        {activeTab === 'properties' && (
          <PropertiesView
            permissions={permissions}
            properties={properties}
            scope={propertyScope}
            currentUser={currentUser}
            users={users}
            onOpenAddProperty={() => setShowAddProperty(true)}
            onPropertyUpdated={loadData}
            mandates={ownerMandates}
            canSeeMandates={hasPerm(permissions, 'mandate:read')}
            onSelectPropertyForMatching={(prop) => {
              setMatchSelectedPropId(prop.id);
              setActiveTab('matches');
            }}
            onProposeCollaboration={(prop) => {
              setCollaborationTarget({
                open: true,
                propertyId: prop.id,
                receivingBrokerId: prop.listingBrokerId || prop.ownerId || '',
              });
            }}
            onScheduleVisit={(prop) => {
              const matchedDeal = deals.find(
                (d) =>
                  d.propertyId === prop.id &&
                  (d.introducingBrokerId === currentUser?.id || d.closingBrokerId === currentUser?.id)
              );
              setScheduleVisitTarget({
                open: true,
                dealId: matchedDeal?.id || '',
                propertyId: prop.id,
                propertyTitle: prop.title,
              });
            }}
          />
        )}

        {activeTab === 'requirements' && (
          <RequirementsView
            requirements={requirements}
            scope={requirementScope}
            currentUser={currentUser}
            onOpenAddRequirement={() => setShowAddRequirement(true)}
            onSelectRequirementForMatching={(req) => {
              setMatchSelectedReqId(req.id);
              setActiveTab('matches');
            }}
          />
        )}

        {activeTab === 'matches' && (
          <MatchCenterView
            canPropose={hasPerm(permissions, 'collab:propose') && currentUser.role === 'BROKER' /* v28: the server takes split proposals only from brokers */}
            canMatchByProperty={currentUser.role !== 'BUYER_TENANT' && hasPerm(permissions, 'matching:run')}
            properties={properties}
            requirements={requirements}
            selectedRequirementId={matchSelectedReqId}
            selectedPropertyId={matchSelectedPropId}
            onOpenCollaborationModal={(data) => {
              setCollaborationTarget({
                open: true,
                propertyId: data.propertyId,
                requirementId: data.requirementId,
                receivingBrokerId: data.receivingBrokerId,
              });
            }}
          />
        )}

        {activeTab === 'deals' && (
          <DealRoomsView
            deals={deals}
            permissions={permissions}
            currentUser={currentUser}
            properties={properties}
            offers={offers}
            onRefreshDeals={loadData}
            onRefreshOffers={loadData}
            onOpenBrokerSafetyModal={() => setShowBrokerSafetyModal(true)}
            onOpenScheduleVisit={openScheduleVisit}
            onOpenVerifyVisitOtp={(visit) => {
              setVerifyOtpVisit(visit);
            }}
            onOpenFileDispute={(dealId) => {
              setShowFileDispute({ open: true, dealId });
            }}
            refreshTrigger={dealRoomsRefreshKey}
          />
        )}

        {activeTab === 'due_diligence' && (
          <DueDiligenceView
            // v28: only properties whose due-diligence workspace this member may open (own listing, a deal he is in, admin / legal)
            properties={['SUPERADMIN', 'ADMIN', 'LEGAL_COUNSEL'].includes(currentUser.role) ? properties : properties.filter((p) => p.ownerId === currentUser.id || p.listingBrokerId === currentUser.id || deals.some((d) => d.propertyId === p.id))}
            currentUser={currentUser}
            allBrokers={users.filter((u) => u.role === 'BROKER')}
            permissions={permissions}
          />
        )}

        {activeTab === 'construction' && (
          <ConstructionView
            leads={constructionLeads}
            currentUser={currentUser}
            onRefreshLeads={loadData}
            onOpenAddLead={() => setShowAddLead(true)}
            canSubmitLead={hasPerm(permissions, 'lead:create')}
          />
        )}

        {activeTab === 'disputes' && (
          <DisputesView
            disputes={disputes}
            currentUser={currentUser}
            onRefreshDisputes={loadData}
            onOpenFileDispute={(dealId) => {
              setShowFileDispute({ open: true, dealId });
            }}
          />
        )}
        {activeTab === 'disputes' && hasPerm(permissions, 'partywatch:report') && <div className="mt-6"><PartyWatchBroker /></div>}
        {activeTab === 'disputes' && hasPerm(permissions, 'partywatch:review') && <div className="mt-6"><PartyWatchAdmin /></div>}
        {activeTab === 'disputes' && hasPerm(permissions, 'users:review') && <div className="mt-6"><PhotoCheckAdmin /></div>}
        {activeTab === 'disputes' && hasPerm(permissions, 'property:moderate') && <div className="mt-6"><BuyerBondsAdmin /></div>}

        {activeTab === 'crm' && hasPerm(permissions, 'crm:read') && (
          <CrmView currentUser={currentUser} permissions={permissions} />
        )}

        {activeTab === 'connector' && hasPerm(permissions, 'connector:manage', 'connector:work', 'connector:desk') && (
          <ConnectorDesk currentUser={currentUser} permissions={permissions} users={users} onNavigate={setActiveTab} />
        )}

        {activeTab === 'daily' && hasPerm(permissions, 'daily:use') && <DailyView currentUser={currentUser} onNavigate={setActiveTab} />}

        {activeTab === 'propdocs' && hasPerm(permissions, 'propdoc:use') && <PropertyPapersView withProtected={hasPerm(permissions, 'pdoc:use')} />}
        {/* v49: whoever has Property Papers finds Protected Docs inside it (the old tab link is redirected there) */}
        {activeTab === 'pdocs' && hasPerm(permissions, 'pdoc:use') && !hasPerm(permissions, 'propdoc:use') && <ProtectedDocsView />}

        {activeTab === 'community' && hasPerm(permissions, 'chapter:read', 'academy:read', 'loan:manage', 'report:manage') && <CommunityView perms={permissions} currentUser={currentUser} />}

        {activeTab === 'grow' && hasPerm(permissions, 'growth:nominate') && <GrowthView />}
        {activeTab === 'mypage' && hasPerm(permissions, 'publicpage:use') && <PublicPageView />}
        {activeTab === 'rentdesk' && hasPerm(permissions, 'rent:use') && <RentDeskView brokerName={currentUser.name} />}

        {activeTab === 'citylaunch' && hasPerm(permissions, 'growth:manage') && <CityLaunch canReset={hasPerm(permissions, 'users:reset_password')} />}

        {activeTab === 'share' && hasPerm(permissions, 'share:use') && <ShareKit />}

        {activeTab === 'landrecords' && hasPerm(permissions, 'landrecord:manage') && <LandRecordsView currentUser={currentUser} />}

        {activeTab === 'network' && hasPerm(permissions, 'network:use', 'growth:manage') && <NetworkHub currentUser={currentUser} permissions={permissions} />}
        {activeTab === 'desk' && hasPerm(permissions, 'offer:make', 'offer:decide', 'listing:lifecycle') && <DealDesk currentUser={currentUser} permissions={permissions} />}

        {activeTab === 'clientroom' && hasPerm(permissions, 'clientroom:use') && <ClientRoomsTab />}
        {activeTab === 'chats' && hasPerm(permissions, 'deal:chat', 'clientroom:use') && <ChatsView meId={currentUser.id} permissions={permissions} />}

        {activeTab === 'partners' && hasPerm(permissions, 'partner:manage', 'partner:oversee') && <ShopPartnersView currentUser={currentUser} canManage={hasPerm(permissions, 'partner:manage')} canOversee={hasPerm(permissions, 'partner:oversee')} />}
        {activeTab === 'visits' && hasPerm(permissions, 'visit:pass', 'visit:scan') && <VisitsView currentUser={currentUser} />}

        {activeTab === 'pcontrol' && hasPerm(permissions, 'pcontrol:manage', 'pcontrol:oversee') && <ProjectControlView currentUser={currentUser} />}

        {activeTab === 'pcontrol' && !hasPerm(permissions, 'pcontrol:manage', 'pcontrol:oversee') && hasPerm(permissions, 'pcontrol:partner') && <MyProjectsView currentUser={currentUser} onNavigate={setActiveTab} />}

        {activeTab === 'team' && hasPerm(permissions, 'team:manage') && <TeamView isBuilder={currentUser.role === 'DEVELOPER_BUILDER'} canControl={['BROKER', 'DEVELOPER_BUILDER'].includes(currentUser.role)} />}

        {activeTab === 'control' && hasPerm(permissions, 'admin:control_center') && <ControlCenter onNavigate={setActiveTab} />}
        {activeTab === 'launchdesk' && hasPerm(permissions, 'launch:manage') && <LaunchDesk />}

        {activeTab === 'audit' && <AuditTrailView />}

        {activeTab === 'onboarding' && (
          <OnboardingView
            currentUser={currentUser}
            users={users}
            onRefreshUsers={loadData}
            onOpenIdReview={() => setActiveTab('idreview')}
          />
        )}

        {activeTab === 'onboarding' && hasPerm(permissions, 'users:review') && <PrivacyQueue />}

        {activeTab === 'idreview' && hasPerm(permissions, 'users:review') && <IdReviewView currentUser={currentUser} />}

        {activeTab === 'plans' && (hasPerm(permissions, 'billing:manage') || hasPerm(permissions, 'billing:self')) && <PlansFeesView permissions={permissions} />}
        {activeTab === 'legal' && (hasPerm(permissions, 'legal:desk') || hasPerm(permissions, 'legal:manage')) && <LegalHelpView currentUser={currentUser} permissions={permissions} />}
        {activeTab === 'revenue' && hasPerm(permissions, 'admin:control_center') && <RevenueGrowthView />}
        </Suspense>
        </TabErrorBoundary>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-6 text-xs text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900">GENZ BROKER NETWORK</span>
            <span aria-hidden="true">·</span>
            <span>{tx('Powered by GENZ BUILDCON INFRA PVT LTD', 'GENZ BUILDCON INFRA PVT LTD द्वारा संचालित')}</span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1 text-slate-600">
              <MapPin className="h-3 w-3 text-slate-400" /> {tx('India', 'भारत')}
            </span>
          </div>

          <div className="flex items-center gap-4 text-slate-600">
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> {tx('Anti-Bypass Protected', 'एंटी-बायपास सुरक्षित')}
            </span>
            <span>{tx('RERA Ready', 'RERA के अनुरूप')}</span>
            <span>{tx('Timezone: Asia/Kolkata', 'समय क्षेत्र: Asia/Kolkata (IST)')}</span>
          </div>
        </div>
      </footer>

      {showPrivacy && <PrivacyCenter role={currentUser?.role} onClose={() => setShowPrivacy(false)} />}

      {/* Interactive Modals (downloaded the first time one is opened) */}
      <TabErrorBoundary area="modal">
      <Suspense fallback={null}>
      {showAddProperty && <AddPropertyModal
        isOpen={showAddProperty}
        onClose={() => setShowAddProperty(false)}
        onSuccess={loadData}
        currentUser={currentUser}
        brokers={users.filter((u) => u.role === 'BROKER')}
      />}

      {showAddRequirement && <AddRequirementModal
        isOpen={showAddRequirement}
        onClose={() => setShowAddRequirement(false)}
        onSuccess={loadData}
        currentUser={currentUser}
      />}

      {showAddLead && <AddConstructionLeadModal
        isOpen={showAddLead}
        onClose={() => setShowAddLead(false)}
        onSuccess={loadData}
      />}

      {collaborationTarget?.open && (
        <CollaborationModal
          isOpen={true}
          data={{
            propertyId: collaborationTarget.propertyId,
            requirementId: collaborationTarget.requirementId,
            receivingBrokerId: collaborationTarget.receivingBrokerId,
          }}
          onClose={() => setCollaborationTarget(null)}
          onSuccess={loadData}
        />
      )}

      {scheduleVisitTarget?.open && (
        <ScheduleVisitModal
          isOpen={true}
          dealId={scheduleVisitTarget.dealId}
          propertyId={scheduleVisitTarget.propertyId}
          propertyTitle={scheduleVisitTarget.propertyTitle}
          defaults={scheduleVisitTarget.defaults}
          onClose={() => { setScheduleVisitTarget(null); window.dispatchEvent(new Event('genz:visit-modal-closed')); }}
          onSuccess={() => {
            loadData();
            setDealRoomsRefreshKey((k) => k + 1);
          }}
          onOpenQrPass={(visit) => setQrPassVisit(visit)}
        />
      )}

      {verifyOtpVisit && (
        <VerifyVisitOtpModal
          isOpen={true}
          visit={verifyOtpVisit}
          onClose={() => setVerifyOtpVisit(null)}
          onSuccess={() => {
            loadData();
            setDealRoomsRefreshKey((k) => k + 1);
          }}
        />
      )}

      {qrPassVisit && (
        <SiteVisitQrPassModal
          isOpen={Boolean(qrPassVisit)}
          visit={qrPassVisit}
          property={properties.find((p) => p.id === qrPassVisit.propertyId)}
          dealId={qrPassVisit.dealRoomId}
          currentUser={
            currentUser ||
            ({
              id: 'USR-TEMP',
              name: 'Broker User',
              role: 'BROKER',
              phone: '',
              email: '',
              brokerId: '',
            } as any)
          }
          onClose={() => setQrPassVisit(null)}
          onSuccess={() => {
            loadData();
            setDealRoomsRefreshKey((k) => k + 1);
          }}
        />
      )}

      {showFileDispute.open && (
        <FileDisputeModal
          isOpen={true}
          dealId={showFileDispute.dealId}
          currentUserId={currentUser?.id}
          directory={users.map((u) => ({ id: u.id, name: u.name, role: u.role }))}
          onClose={() => setShowFileDispute({ open: false })}
          onSuccess={loadData}
        />
      )}

      {/* Verified Broker Digital QR Card Modal */}
      {showQrMenu && currentUser && (
        <Suspense fallback={null}>
          <QrMenu onClose={() => setShowQrMenu(false)} onScan={() => { setShowQrMenu(false); setShowQuickScan(true); }} onCard={() => { setShowQrMenu(false); setShowBrokerQrModal(true); }} />
        </Suspense>
      )}
      {showQuickScan && currentUser && (
        <Suspense fallback={null}>
          <QuickScan currentUser={currentUser} canBuilderScan={hasPerm(permissions, 'visit:scan')} hasVisitsTab={hasPerm(permissions, 'visit:pass', 'visit:scan')} onNavigate={setActiveTab} onClose={() => setShowQuickScan(false)} />
        </Suspense>
      )}
      {showBrokerQrModal && currentUser && (
        <PublicBrokerQrModal
          isOpen={showBrokerQrModal}
          currentUser={currentUser}
          brokers={users}
          onClose={() => setShowBrokerQrModal(false)}
        />
      )}

      {/* Broker Safety & 50:50 Commission Agreement Hub Modal */}
      {showBrokerSafetyModal && currentUser && (
        <BrokerSafetyModal
          isOpen={showBrokerSafetyModal}
          currentUser={currentUser}
          brokers={users}
          properties={properties}
          onClose={() => setShowBrokerSafetyModal(false)}
          onOpenDispute={() => setActiveTab('disputes')}
        />
      )}
      </Suspense>
      </TabErrorBoundary>
    </div>
  );
}
