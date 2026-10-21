import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { UserProfile, DealRoom, Property, BuyerRequirement, ConstructionLead, PlatformActivityEvent, CollaborationOffer } from '../types/index.js';
import { formatINR } from '../lib/utils.js';
import { api } from '../lib/api.js';
import { useLabel } from '../lib/labels.js';
import { useTx } from '../lib/i18n.js';
import {
  Building2,
  TrendingUp,
  ShieldCheck,
  HardHat,
  ArrowRight,
  Sparkles,
  Briefcase,
  AlertCircle,
  FileCheck2,
  BarChart3,
  PieChart as PieChartIcon,
  Layers,
} from 'lucide-react';
import { TrustScoreBadge } from './TrustScoreBadge.js';
import { ActivityFeed } from './ActivityFeed.js';
import { RoleHome, ROLE_HOME_ROLES } from './RoleHome.js';
import { hasPerm } from '../lib/permissions.js';
import { ContractorDashboard } from './ContractorDashboard.js';
import { lazyView } from '../lib/lazyView.js';
// v20: the chart library (~350 KB) downloads after the numbers are already on screen
const DealStageChart = lazyView(() => import('./DashboardCharts.js'), 'DealStageChart');
const CommissionPie = lazyView(() => import('./DashboardCharts.js'), 'CommissionPie');
const LocalityChart = lazyView(() => import('./DashboardCharts.js'), 'LocalityChart');
const ChartSkeleton: React.FC = () => <div className="h-full w-full animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />;

interface DashboardViewProps {
  currentUser: UserProfile;
  properties: Property[];
  requirements: BuyerRequirement[];
  deals: DealRoom[];
  constructionLeads: ConstructionLead[];
  metrics: any;
  offers?: CollaborationOffer[];
  activities?: PlatformActivityEvent[];
  onNavigate: (tab: any) => void;
  onOpenAddProperty: () => void;
  onOpenAddRequirement: () => void;
  onOpenAddLead: () => void;
  /** server-issued permission list: quick actions the role may not use are not drawn */
  permissions?: string[];
  projects?: import('../types/index.js').BuilderProject[];
  mandates?: import('../types/index.js').SalesAssociateMandate[];
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  properties,
  requirements,
  deals,
  constructionLeads,
  metrics,
  offers = [],
  activities: initialActivities,
  onNavigate,
  onOpenAddProperty,
  onOpenAddRequirement,
  onOpenAddLead,
  permissions,
  projects = [],
  mandates = [],
}) => {
  const tx = useTx();
  const label = useLabel();
  const incomingPendingOffers = useMemo(() => {
    return (offers || []).filter(
      (o) =>
        (o.receivingBrokerId === currentUser.id ||
          currentUser.role === 'SUPERADMIN' ||
          currentUser.role === 'ADMIN') &&
        o.status === 'PENDING'
    );
  }, [offers, currentUser]);

  const [activities, setActivities] = useState<PlatformActivityEvent[]>(initialActivities || []);
  const [loadingActivities, setLoadingActivities] = useState<boolean>(!initialActivities);

  // Fetch live activity feed
  const fetchActivities = async () => {
    setLoadingActivities(true);
    try {
      const res = await api.getActivityFeed();
      if (res.success && res.activities) {
        setActivities(res.activities);
      }
    } catch (err) {
      console.error('Failed to fetch activity feed:', err);
    } finally {
      setLoadingActivities(false);
    }
  };

  useEffect(() => {
    if (initialActivities && initialActivities.length > 0) {
      setActivities(initialActivities);
    } else {
      fetchActivities();
    }
  }, [initialActivities, properties.length, deals.length]);
  const [chartView, setChartView] = useState<'deals' | 'inventory'>('deals');
  const [inventoryScope, setInventoryScope] = useState<'personal' | 'network'>(() => {
    return (currentUser.role === 'SUPERADMIN' || currentUser.role === 'ADMIN') ? 'network' : 'personal';
  });

  const isBroker = currentUser.role === 'BROKER';
  const isOwner = currentUser.role === 'PROPERTY_OWNER';
  const isContractor = currentUser.role === 'CONTRACTOR';
  const isAdmin = currentUser.role === 'SUPERADMIN' || currentUser.role === 'ADMIN';
  const isLegal = currentUser.role === 'LEGAL_COUNSEL';
  const isBuilder = currentUser.role === 'DEVELOPER_BUILDER';
  const hasOwnHome = (ROLE_HOME_ROLES as readonly string[]).includes(currentUser.role);
  // No list passed → keep showing the action (the API still refuses what the role may not do).
  const may = (...p: string[]) => !permissions || hasPerm(permissions, ...p);

  // Calculate personalized inventory vs total network inventory
  const myProperties = useMemo(() => {
    if (isOwner) {
      return properties.filter((p) => p.ownerId === currentUser.id || p.ownerPhone === currentUser.phone);
    }
    if (isBroker) {
      return properties.filter((p) => p.listingBrokerId === currentUser.id);
    }
    return [];
  }, [properties, currentUser, isOwner, isBroker]);

  const networkInventoryVal = metrics?.totalPropertyInventoryValue || properties.reduce((s, p) => s + p.askingPrice, 0);
  
  const userInventoryVal = useMemo(() => {
    if (metrics?.userInventoryValue !== undefined && metrics?.userInventoryValue !== null) {
      return metrics.userInventoryValue;
    }
    return myProperties.reduce((s, p) => s + (p.askingPrice || 0), 0);
  }, [metrics, myProperties]);

  const activeInventoryDisplayVal = inventoryScope === 'personal' && !isAdmin ? userInventoryVal : networkInventoryVal;
  const activeInventoryDisplayCount = inventoryScope === 'personal' && !isAdmin ? myProperties.length : properties.length;

  // v21: GENZ staff see what the deals are worth (and the totals below), never one deal's brokerage — so the admin charts run on deal value
  const amountOf = (d: { totalCommissionExpected: number; dealValue?: number }) => (isAdmin ? d.dealValue || 0 : d.totalCommissionExpected);
  const dealTotals = isAdmin ? (metrics?.dealTotals as undefined | {
    deals: number; dealValue: number; settledDeals: number; settledValue: number; dealsWithBrokerage: number;
    commissionAgreed: number; commissionPaid: number; commissionWaiting: number; openDisputes: number;
  }) : undefined;
  const totalCommissionVolume = deals.reduce((s, d) => s + amountOf(d), 0);
  const constructionVolume = metrics?.totalConstructionVolume || constructionLeads.reduce((s, l) => s + l.estimatedBudget, 0);

  // 1. Deal Pipeline by Stage Data
  const dealStages = [
    'Lead',
    'Introduction',
    'Site Visit Done',
    'Negotiation',
    'Agreement',
    'Handover',
    'Settled',
  ];

  const dealStageData = useMemo(() => {
    return dealStages.map((stage) => {
      const matchingDeals = deals.filter((d) => d.stage === stage);
      const totalVolume = matchingDeals.reduce((sum, d) => sum + amountOf(d), 0);
      return {
        stage: label('dealStage', stage),
        dealsCount: matchingDeals.length,
        brokerageVolume: totalVolume,
      };
    });
  }, [deals, label, isAdmin]);

  // 2. Commission Settlement Status Distribution
  const commissionStatusData = useMemo(() => {
    const statuses: Array<{ key: string; label: string; color: string }> = [
      { key: 'AGREED', label: tx('Ratified & Agreed', 'मंज़ूर और तय'), color: '#10b981' }, // emerald-500
      { key: 'PROPOSED', label: tx('Proposed', 'प्रस्तावित'), color: '#f59e0b' }, // amber-500
      { key: 'DUE', label: tx('Due for Payout', 'भुगतान देय'), color: '#3b82f6' }, // blue-500
      { key: 'PAID', label: tx('Settled & Disbursed', 'निपटा और चुकाया'), color: '#6366f1' }, // indigo-500
      { key: 'DISPUTED', label: tx('Settlement Hold (Disputed)', 'निपटान रोका (विवाद)'), color: '#ef4444' }, // red-500
    ];

    return statuses.map((item) => {
      const statusDeals = deals.filter((d) => (d.settlementStatus || 'AGREED') === item.key);
      const totalAmount = statusDeals.reduce((sum, d) => sum + amountOf(d), 0);
      return {
        name: item.label,
        // real figure for every label/tooltip; `value` only gives a zero-amount slice a visible sliver (never shown as money)
        amount: totalAmount,
        value: totalAmount || (statusDeals.length > 0 ? 1 : 0),
        count: statusDeals.length,
        color: item.color,
      };
    }).filter((item) => item.count > 0 || item.value > 0);
  }, [deals, tx, isAdmin]);

  // 3. Locality Inventory Distribution Data
  const localityInventoryData = useMemo(() => {
    const localityMap: { [key: string]: { count: number; value: number } } = {};
    properties.forEach((p) => {
      const loc = p.locality || p.city || 'Unspecified';
      if (!localityMap[loc]) {
        localityMap[loc] = { count: 0, value: 0 };
      }
      localityMap[loc].count += 1;
      localityMap[loc].value += p.askingPrice;
    });

    return Object.entries(localityMap)
      .map(([locality, data]) => ({
        locality,
        count: data.count,
        valuation: data.value,
      }))
      .sort((a, b) => b.valuation - a.valuation);
  }, [properties]);

  // Custom Recharts Tooltip
  const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-slate-200 bg-slate-900 p-2.5 text-xs text-white shadow-xl">
          <p className="font-bold text-amber-400">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={`item-${index}`} className="mt-1 text-slate-200">
              <span className="font-medium text-slate-400">{entry.name}: </span>
              <strong className="text-white">
                {entry.dataKey === 'brokerageVolume' || entry.dataKey === 'valuation'
                  ? formatINR(entry.value)
                  : tx(`${entry.value} listings/deals`, `${entry.value} लिस्टिंग/डील`)}
              </strong>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="rounded-lg border border-slate-200 bg-slate-900 p-2.5 text-xs text-white shadow-xl">
          <p className="font-bold text-amber-400">{data.name}</p>
          <p className="mt-1 text-slate-200">
            {isAdmin ? tx('Deal value', 'डील वैल्यू') : tx('Brokerage', 'ब्रोकरेज')}: <strong>{formatINR(data.payload.amount ?? data.value)}</strong>
          </p>
          <p className="text-[11px] text-slate-400">
            {tx('Deals Count', 'डील की संख्या')}: <strong>{data.payload.count}</strong>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{tx('India Real Estate Exchange', 'भारत रियल एस्टेट एक्सचेंज')}</span>
              <span aria-hidden="true">·</span>
              <span>{tx('Signed in', 'लॉगिन')}: {currentUser.name}</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-slate-700">{currentUser.role.replace('_', ' ')}</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              {currentUser.role === 'DEVELOPER_BUILDER'
                ? tx('GENZ Builder & Developer Launchpad', 'GENZ बिल्डर और डेवलपर लॉन्चपैड')
                : isAdmin
                ? tx('GENZ Network Command Center', 'GENZ नेटवर्क कमांड सेंटर')
                : isBroker
                ? `${tx('Welcome back', 'वापसी पर स्वागत है')}, ${currentUser.name}`
                : isOwner
                ? `${tx('Owner Portal', 'ओनर पोर्टल')}: ${currentUser.name}`
                : isContractor
                ? `${tx('Contractor Desk', 'कॉन्ट्रैक्टर डेस्क')}: ${currentUser.companyName || currentUser.name}`
                : isLegal
                ? `${tx('Legal Desk', 'लीगल डेस्क')}: ${currentUser.name}`
                : `${tx('Buyer Portal', 'खरीदार पोर्टल')}: ${currentUser.name}`}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {currentUser.role === 'DEVELOPER_BUILDER' && tx('Launch new residential & commercial projects across India, appoint verified associate brokers, and track sales quotas.', 'पूरे भारत में नए रिहायशी और कमर्शियल प्रोजेक्ट लॉन्च करें, वेरिफ़ाइड एसोसिएट ब्रोकर नियुक्त करें और बिक्री लक्ष्य देखें।')}
              {isBroker && tx('Search active inventory, propose co-broking commission splits, and execute OTP-verified site visits.', 'चालू इन्वेंटरी खोजें, को-ब्रोकिंग कमीशन बँटवारे का प्रस्ताव दें और OTP से वेरिफ़ाइड साइट विज़िट करें।')}
              {isOwner && tx('Your properties are protected by the anti-bypass rule and confidential net price mandates.', 'आपकी प्रॉपर्टी एंटी-बायपास नियम और गोपनीय नेट कीमत से सुरक्षित है।')}
              {isContractor && tx('Take masked construction leads powered by GENZ BUILDCON, with the referral fee agreed upfront on every lead.', 'GENZ BUILDCON की छुपी हुई कंस्ट्रक्शन लीड लें — हर लीड पर रेफ़रल फ़ीस पहले से तय रहती है।')}
              {isAdmin && tx('Full oversight over broker authorizations, commission agreements, and cryptographic audit records.', 'ब्रोकर की मंज़ूरियों, कमीशन एग्रीमेंट और क्रिप्टोग्राफ़िक ऑडिट रिकॉर्ड पर पूरी निगरानी।')}
              {currentUser.role === 'BUYER_TENANT' && tx('Tell us what you need, see properties that match, and keep your site-visit codes in one place.', 'अपनी ज़रूरत बताएँ, मैच होती प्रॉपर्टी देखें और साइट-विज़िट कोड एक जगह रखें।')}
              {isLegal && tx('Review title and compliance for properties and deals. Commissions and broker chat are never shown to you.', 'प्रॉपर्टी और सौदों का टाइटल व अनुपालन देखें। कमीशन और ब्रोकर चैट आपको कभी नहीं दिखते।')}
            </p>

            {isBroker && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <TrustScoreBadge user={currentUser} variant="pill" />
                <span className="text-xs text-slate-500">
                  {tx(`Trust Score based on ${currentUser.completedDealsCount || 0} completed deal(s) and ${currentUser.verifiedSiteVisitsCount || 0} OTP-verified physical site inspection(s).`, `ट्रस्ट स्कोर ${currentUser.completedDealsCount || 0} पूरी हुई डील और ${currentUser.verifiedSiteVisitsCount || 0} OTP-वेरिफ़ाइड साइट विज़िट पर आधारित है।`)}
                </span>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Builder Launchpad ONLY for Developers and Superadmins */}
            {(currentUser.role === 'DEVELOPER_BUILDER' || isAdmin) && (
              <button
                onClick={() => onNavigate('builder')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 py-2 text-xs font-semibold text-slate-950 shadow-xs hover:bg-amber-300 transition-colors"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>{tx('Builder Launchpad & Sales Associates', 'बिल्डर लॉन्चपैड और सेल्स एसोसिएट्स')}</span>
              </button>
            )}
            {(isBroker || isOwner || isAdmin || currentUser.role === 'DEVELOPER_BUILDER') && may('property:create') && !isOwner && (
              <button
                onClick={onOpenAddProperty}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition-colors"
              >
                <Building2 className="h-3.5 w-3.5 text-amber-400" />
                <span>{tx('+ List Property', '+ प्रॉपर्टी लिस्ट करें')}</span>
              </button>
            )}
            {(isBroker || isAdmin) && may('requirement:create') && (
              <button
                onClick={onOpenAddRequirement}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
              >
                <span>{tx('+ Buyer Requirement', '+ खरीदार की ज़रूरत')}</span>
              </button>
            )}
            {(isBroker || isOwner || isAdmin) && may('lead:create') && (
              <button
                onClick={onOpenAddLead}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
              >
                <HardHat className="h-3.5 w-3.5 text-orange-500" />
                <span>{tx('+ Construction Lead', '+ कंस्ट्रक्शन लीड')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Incoming Collaboration Proposals Notification Banner */}
      {incomingPendingOffers.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white font-bold shadow-xs">
              <Briefcase className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                  ⚡ Action Required: Co-Broking Split Proposals
                </span>
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                  {incomingPendingOffers.length} New
                </span>
              </div>
              <p className="text-xs text-slate-700 mt-0.5">
                {tx('Partner brokers have proposed collaboration on your properties. Review commission splits & accept into an instant Deal Room.', 'पार्टनर ब्रोकर ने आपकी प्रॉपर्टी पर सहयोग का प्रस्ताव दिया है। कमीशन बँटवारा देखें और मंज़ूर करके तुरंत डील रूम बनाएँ।')}
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('deals')}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-slate-800 transition-colors shrink-0 shadow-xs"
          >
            <span>{tx('Review in Deal Room', 'डील रूम में देखें')}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* A contractor has no property or deal-room access: show construction work only, never network inventory or brokerage. */}
      {isContractor ? (
        <ContractorDashboard currentUser={currentUser} constructionLeads={constructionLeads} onNavigate={onNavigate} />
      ) : hasOwnHome ? (
        <RoleHome
          currentUser={currentUser}
          permissions={permissions || []}
          properties={properties}
          requirements={requirements}
          deals={deals}
          projects={projects}
          mandates={mandates}
          onNavigate={onNavigate}
          onOpenAddProperty={onOpenAddProperty}
          onOpenAddRequirement={onOpenAddRequirement}
        />
      ) : (
      <>
      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Personalized & Role-Specific Inventory Valuation */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-slate-700">
                {isAdmin
                  ? tx('Total Network Inventory', 'नेटवर्क की कुल इन्वेंटरी')
                  : isOwner
                  ? inventoryScope === 'personal'
                    ? tx('My Property Portfolio', 'मेरा प्रॉपर्टी पोर्टफ़ोलियो')
                    : tx('Total Network Exchange', 'नेटवर्क एक्सचेंज (कुल)')
                  : isBroker
                  ? inventoryScope === 'personal'
                    ? tx('My Listed Mandates', 'मेरे लिस्टेड मैंडेट')
                    : tx('Total Network Exchange', 'नेटवर्क एक्सचेंज (कुल)')
                  : inventoryScope === 'personal'
                  ? tx('My Portfolio Value', 'मेरे पोर्टफ़ोलियो की कीमत')
                  : tx('Total Network Exchange', 'नेटवर्क एक्सचेंज (कुल)')}
              </span>
              <Building2 className="h-4 w-4 text-slate-400" />
            </div>
            
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              {formatINR(activeInventoryDisplayVal)}
            </div>

            <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <span>
                {activeInventoryDisplayCount}{' '}
                {inventoryScope === 'personal' && !isAdmin
                  ? isOwner
                    ? tx('properties owned', 'अपनी प्रॉपर्टी')
                    : isBroker
                    ? tx('direct listings', 'अपनी सीधी लिस्टिंग')
                    : tx('properties', 'प्रॉपर्टी')
                  : tx('active exchange listings', 'नेटवर्क पर चालू लिस्टिंग')}
              </span>
              <span aria-hidden="true">·</span>
              <span>{inventoryScope === 'personal' && !isAdmin ? tx('Personal Portfolio', 'मेरा पोर्टफ़ोलियो') : tx('Network Marketplace', 'नेटवर्क मार्केटप्लेस')}</span>
            </div>
          </div>

          {!isAdmin && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">
                {inventoryScope === 'personal'
                  ? `Network Total: ${formatINR(networkInventoryVal)}`
                  : `My Portfolio: ${formatINR(userInventoryVal)}`}
              </span>
              <button
                type="button"
                onClick={() => setInventoryScope(inventoryScope === 'personal' ? 'network' : 'personal')}
                className="font-semibold text-amber-700 hover:text-amber-800 underline underline-offset-2 transition-colors cursor-pointer"
              >
                {inventoryScope === 'personal' ? 'View Network' : 'View My Portfolio'}
              </button>
            </div>
          )}
        </div>

        {/* Metric 2 */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{dealTotals ? tx('Deals done through the network', 'नेटवर्क से हुई डील') : tx('Deal Room Brokerage Pipeline', 'डील रूम की ब्रोकरेज पाइपलाइन')}</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          {dealTotals ? (
            <div data-testid="admin-deal-totals">
              <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-700">{formatINR(dealTotals.dealValue)}</div>
              <div className="mt-1 text-xs text-slate-500">
                {tx(`total deal value · ${dealTotals.deals} deals at Agreement stage or later (${dealTotals.settledDeals} settled)`, `कुल डील वैल्यू · ${dealTotals.deals} डील (एग्रीमेंट स्टेज या आगे, ${dealTotals.settledDeals} निपटीं)`)}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px]">
                <div><span className="block text-slate-400">{tx('Brokerage agreed', 'तय ब्रोकरेज')}</span><strong className="text-slate-800">{formatINR(dealTotals.commissionAgreed)}</strong></div>
                <div><span className="block text-slate-400">{tx('Exchanged between brokers', 'ब्रोकरों के बीच चुकाया')}</span><strong className="text-emerald-700">{formatINR(dealTotals.commissionPaid)}</strong></div>
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                {tx('Totals only. A deal room opens to GENZ only when a dispute is raised.', 'सिर्फ़ कुल आँकड़े। डील रूम GENZ को तभी खुलता है जब विवाद दर्ज हो।')}
                {dealTotals.commissionWaiting > 0 && <> {tx(`${formatINR(dealTotals.commissionWaiting)} waiting for the brokers to confirm.`, `${formatINR(dealTotals.commissionWaiting)} की पुष्टि ब्रोकरों से बाकी।`)}</>}
              </div>
            </div>
          ) : (
            <>
              <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-700">
                {formatINR(totalCommissionVolume)}
              </div>
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <span>{tx(`${deals.length} active deal rooms`, `${deals.length} चालू डील रूम`)}</span>
                <span aria-hidden="true">·</span>
                <span>{deals.filter((d) => !!d.agreementHash).length}/{deals.length} splits ratified</span>
              </div>
            </>
          )}
        </div>

        {/* Metric 3 */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{tx('GENZ BUILDCON Projects', 'GENZ BUILDCON प्रोजेक्ट')}</span>
            <HardHat className="h-4 w-4 text-orange-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {formatINR(constructionVolume)}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
            <span>{constructionLeads.length} leads</span>
            <span aria-hidden="true">·</span>
            <span>{tx('1% broker referral fee', '1% ब्रोकर रेफ़रल फ़ीस')}</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{tx('Co-Broking Deals', 'को-ब्रोकिंग डील')}</span>
            <Briefcase className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {deals.length} {tx('Active Deals', 'चालू डील')}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>{incomingPendingOffers.length} {tx('pending proposals', 'बाकी प्रस्ताव')}</span>
            <button
              onClick={() => onNavigate('deals')}
              className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
            >
              {tx('Open Deal Room →', 'डील रूम खोलें →')}
            </button>
          </div>
        </div>
      </div>

      {/* Visual Analytics & Oversight Section with Recharts */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-900">{tx('Executive Administrative Oversight', 'कार्यकारी प्रशासनिक निगरानी')}</span>
              <span aria-hidden="true">·</span>
              <span>{tx('Visual metrics powered by Recharts', 'चार्ट के साथ आँकड़े')}</span>
            </div>
            <h2 className="text-base font-bold text-slate-900 mt-0.5">
              {tx('Deal Pipeline, Commission Status & Inventory Analytics', 'डील पाइपलाइन, कमीशन की स्थिति और इन्वेंटरी विश्लेषण')}
            </h2>
          </div>

          {/* Segmented Controls for Chart Switching */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs">
            <button
              onClick={() => setChartView('deals')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
                chartView === 'deals'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5 text-amber-500" />
              <span>{tx('Deals & Commission Pipeline', 'डील और कमीशन पाइपलाइन')}</span>
            </button>
            <button
              onClick={() => setChartView('inventory')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
                chartView === 'inventory'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PieChartIcon className="h-3.5 w-3.5 text-blue-500" />
              <span>{tx('Locality Inventory Valuation', 'इलाके की इन्वेंटरी का मूल्य')}</span>
            </button>
          </div>
        </div>

        {chartView === 'deals' ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left 2 Cols: Deal Stage Progression & Volume */}
            <div className="lg:col-span-2 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">
                  {isAdmin ? tx('Deal Progression Funnel & Deal Value (₹)', 'डील प्रगति फ़नल और डील वैल्यू (₹)') : tx('Deal Progression Funnel & Brokerage Volume (₹)', 'डील प्रगति फ़नल और ब्रोकरेज वॉल्यूम (₹)')}
                </span>
                <span className="text-slate-500">{tx(`${deals.length} active deals monitored`, `${deals.length} चालू डील पर नज़र`)}</span>
              </div>
              <div className="h-72 w-full pt-2">
                <Suspense fallback={<ChartSkeleton />}>
                  <DealStageChart data={dealStageData} tooltip={<CustomBarTooltip />} volumeName={isAdmin ? tx('Deal value (₹)', 'डील वैल्यू (₹)') : tx('Brokerage Volume (₹)', 'ब्रोकरेज वॉल्यूम (₹)')} countName={tx('Deals Count', 'डील की संख्या')} />
                </Suspense>
              </div>
            </div>

            {/* Right 1 Col: Commission Status Donut Breakdown */}
            <div className="space-y-2 border-t lg:border-t-0 lg:border-l border-slate-100 pt-4 lg:pt-0 lg:pl-6">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800">{tx('Commission Status Breakdown', 'कमीशन स्थिति का ब्यौरा')}</span>
                <span className="text-emerald-700 font-medium">{tx('100% Ratified', '100% मंज़ूर')}</span>
              </div>
              <div className="h-56 w-full">
                <Suspense fallback={<ChartSkeleton />}>
                  <CommissionPie data={commissionStatusData} tooltip={<CustomPieTooltip />} />
                </Suspense>
              </div>

              {/* Legend Summary */}
              <div className="space-y-1.5 pt-1 text-xs">
                {commissionStatusData.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-slate-600 truncate max-w-[140px]">{item.name}</span>
                    </div>
                    <span className="font-bold text-slate-900">{formatINR(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Locality Inventory Breakdown */
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800">
                {tx('Locality Inventory Valuation & Supply Concentrations', 'इलाके की इन्वेंटरी का मूल्य और सप्लाई का केंद्रीकरण')}
              </span>
              <span className="text-slate-500">{properties.length} active property clusters</span>
            </div>
            <div className="h-72 w-full pt-2">
              <Suspense fallback={<ChartSkeleton />}>
                <LocalityChart data={localityInventoryData} tooltip={<CustomBarTooltip />} valueName={tx('Combined Valuation (₹)', 'कुल मूल्य (₹)')} countName={tx('Property Count', 'प्रॉपर्टी की संख्या')} />
              </Suspense>
            </div>
          </div>
        )}
      </div>

      {/* Main Content 2-Column Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Real-Time Activity Feed & High-Priority Deals */}
        <div className="space-y-6 lg:col-span-2">
          {/* Real-Time Platform Activity Feed */}
          <ActivityFeed
            activities={activities}
            currentUser={currentUser}
            isLoading={loadingActivities}
            onRefresh={fetchActivities}
            onNavigate={onNavigate}
            maxItems={8}
          />

          {/* Active Deals Section */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">{tx('Active Deal Rooms & Negotiations', 'चालू डील रूम और बातचीत')}</h2>
                <p className="text-xs text-slate-500">{tx('Protected B2B co-broker deals with locked commission splits', 'लॉक्ड कमीशन बँटवारे वाली सुरक्षित B2B को-ब्रोकर डील')}</p>
              </div>
              <button
                onClick={() => onNavigate('deals')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-900 hover:text-amber-700"
              >
                {tx('View All Deals', 'सारी डील देखें')} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-4 divide-y divide-slate-100">
              {deals.map((deal) => (
                <div key={deal.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-bold text-slate-900">{deal.id}</span>
                        <span aria-hidden="true">·</span>
                        <span>{tx('Stage', 'चरण')}: <strong className="text-slate-800">{label('dealStage', deal.stage)}</strong></span>
                        <span aria-hidden="true">·</span>
                        <span>{tx(`${deal.siteVisitsCount} Site Visit(s)`, `${deal.siteVisitsCount} साइट विज़िट`)}</span>
                      </div>
                      <h3 className="mt-1 text-sm font-semibold text-slate-900">
                        {tx('Property Ref', 'प्रॉपर्टी संदर्भ')}: {deal.propertyId}
                      </h3>
                      <div className="mt-1 flex items-center gap-3 text-xs text-slate-600">
                        {deal.feeMode === 'OWN_SIDE' ? (
                          <span className="text-emerald-700 font-medium">{tx('Apna-apna side — your own client\'s fee', 'अपना-अपना साइड — आपके अपने क्लाइंट की फ़ीस')}{deal.totalCommissionExpected ? <>: <strong>{formatINR(deal.totalCommissionExpected)}</strong></> : null}</span>
                        ) : (<>
                        <span>{tx('Expected Gross Commission', 'अपेक्षित कुल कमीशन')}: <strong>{formatINR(deal.totalCommissionExpected)}</strong></span>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-700 font-medium">{tx('Split', 'बँटवारा')}: {deal.introducingBrokerSharePct}% {tx('Introducer', 'परिचय कराने वाला')} / {deal.closingBrokerSharePct}% {tx('Closer', 'डील पूरी करने वाला')}</span>
                        </>)}
                      </div>
                    </div>

                    <button
                      onClick={() => onNavigate('deals')}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100 transition-colors"
                    >
                      {tx('Enter Deal Room', 'डील रूम में जाएँ')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Construction Referral Opportunities */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">{tx('GENZ BUILDCON Construction Pipeline', 'GENZ BUILDCON कंस्ट्रक्शन पाइपलाइन')}</h2>
                <p className="text-xs text-slate-500">{tx('Civil construction & interior leads with 1% referral commission', '1% रेफ़रल कमीशन वाली सिविल और इंटीरियर लीड')}</p>
              </div>
              <button
                onClick={() => onNavigate('construction')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-900 hover:text-amber-700"
              >
                {tx('Marketplace', 'मार्केटप्लेस')} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {constructionLeads.slice(0, 2).map((lead) => (
                <div key={lead.id} className="rounded-lg border border-slate-200 p-4 hover:border-slate-300 transition-colors">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-mono text-slate-700">{lead.id}</span>
                    <span className="text-orange-700 font-medium">{lead.referralCommissionPct}% {tx('Referral Fee', 'रेफ़रल फ़ीस')}</span>
                  </div>
                  <h4 className="mt-1 text-sm font-semibold text-slate-900 line-clamp-1">{lead.title}</h4>
                  <div className="mt-2 text-xs text-slate-600">
                    <div>{tx('Budget', 'बजट')}: <strong className="text-slate-900">{formatINR(lead.estimatedBudget)}</strong></div>
                    <div>{tx('Location', 'इलाका')}: {lead.approximateLocation}</div>
                  </div>
                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">{tx('Referring', 'रेफ़र करने वाले')}: {lead.referringBrokerName}</span>
                    <button
                      onClick={() => onNavigate('construction')}
                      className="font-semibold text-slate-900 hover:underline"
                    >
                      {tx('View Details', 'विवरण देखें')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1 Col: Platform Rules, Matching Engine Quick Launch & Audit Status */}
        <div className="space-y-6">
          {/* Matching Engine Callout */}
          <div className="rounded-xl border border-amber-200 bg-linear-to-br from-amber-50/70 to-white p-5 shadow-xs">
            <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
              <Sparkles className="h-4 w-4 text-amber-600" />
              <span>{tx('Real Matching Engine Active', 'असली मैचिंग इंजन चालू')}</span>
            </div>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              {tx('Deterministic scoring calculates location alignment (city + locality), budget overlap, property categories, and floor area tolerances.', 'तय नियमों वाला स्कोर इलाके का मेल (शहर + लोकैलिटी), बजट का ओवरलैप, प्रॉपर्टी का प्रकार और क्षेत्रफल की गुंजाइश नापता है।')}
            </p>
            <div className="mt-4">
              <button
                onClick={() => onNavigate('matches')}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-amber-300 hover:bg-slate-800 transition-colors shadow-xs"
              >
                {tx('Launch Match Engine', 'मैच इंजन चलाएँ')} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Co-Broking Deal Execution Hub */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Briefcase className="h-4 w-4 text-blue-600" />
                {tx('Co-Broking Deals & Proposals', 'को-ब्रोकिंग डील और प्रस्ताव')}
              </h3>
              <span className="text-[11px] font-semibold text-slate-500">{deals.length} {tx('Active', 'चालू')}</span>
            </div>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              {tx('Propose commission splits, review incoming collaboration proposals, execute digital agreements, and track closings securely in the Deal Room.', 'कमीशन बँटवारे का प्रस्ताव दें, आए प्रस्ताव देखें, डिजिटल एग्रीमेंट करें और क्लोज़िंग को डील रूम में सुरक्षित ट्रैक करें।')}
            </p>
            <div className="mt-4">
              <button
                onClick={() => onNavigate('deals')}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors shadow-xs"
              >
                <span>{tx('Open Deal Rooms & Proposals', 'डील रूम और प्रस्ताव खोलें')}</span>
                <ArrowRight className="h-3.5 w-3.5 text-amber-400" />
              </button>
            </div>
          </div>

          {/* Audit Chain Verification Status */}
          <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <FileCheck2 className="h-4 w-4 text-blue-600" />
                {tx('Audit Log Integrity', 'ऑडिट लॉग की अखंडता')}
              </span>
              <span className="text-emerald-700 font-semibold">{tx('100% Cryptographic Match', '100% क्रिप्टोग्राफ़िक मिलान')}</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {tx('Every listing, price revision, OTP verification, and commission allocation is chained in a SHA-256 block ledger.', 'हर लिस्टिंग, कीमत बदलाव, OTP वेरिफ़िकेशन और कमीशन बँटवारा SHA-256 ब्लॉक लेजर में जुड़ा रहता है।')}
            </p>
            <button
              onClick={() => onNavigate('audit')}
              className="mt-3 w-full text-center text-xs font-semibold text-slate-700 hover:text-slate-900 hover:underline"
            >
              {tx('Inspect Audit Block Chain →', 'ऑडिट ब्लॉक चेन देखें →')}
            </button>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
};
