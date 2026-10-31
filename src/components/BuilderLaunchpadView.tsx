import React, { useState } from 'react';
import { BuilderProject, SalesAssociateMandate, UserProfile } from '../types/index.js';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { formatINR } from '../lib/utils.js';
import { LocationFields, LocationValue } from './LocationFields.js';
import { TrustScoreBadge } from './TrustScoreBadge.js';
import {
  Building2,
  Users,
  Award,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Search,
  Plus,
  Send,
  Calendar,
  Layers,
  FileCheck2,
  DollarSign,
  ArrowRight,
  X,
  Phone,
  Briefcase,
  Loader2,
} from 'lucide-react';

interface BuilderLaunchpadViewProps {
  currentUser: UserProfile;
  projects: BuilderProject[];
  mandates: SalesAssociateMandate[];
  brokers: UserProfile[];
  /** v28 — GENZ staff launch a project on behalf of a builder account (the server needs builderId) */
  builders?: UserProfile[];
  onRefreshData: () => void;
}

export const BuilderLaunchpadView: React.FC<BuilderLaunchpadViewProps> = ({
  currentUser,
  projects,
  mandates,
  brokers,
  builders = [],
  onRefreshData,
}) => {
  const isStaff = currentUser.role === 'SUPERADMIN';
  // v28 — GENZ ADMIN only watches this desk; appointing / recording bookings is the builder's (or superadmin's) job
  const canManage = currentUser.role === 'DEVELOPER_BUILDER' || currentUser.role === 'SUPERADMIN';
  const [builderId, setBuilderId] = useState('');
  const tx = useTx();
  const label = useLabel();
  const [activeSubTab, setActiveSubTab] = useState<'projects' | 'associates' | 'ledger'>('projects');
  const [selectedLocality, setSelectedLocality] = useState<string>('All');
  const [brokerSearch, setBrokerSearch] = useState<string>('');

  // Modals
  const [showLaunchModal, setShowLaunchModal] = useState<boolean>(false);
  const [appointModalData, setAppointModalData] = useState<{ open: boolean; broker?: UserProfile; project?: BuilderProject }>({
    open: false,
  });
  const [recordSaleModalData, setRecordSaleModalData] = useState<{ open: boolean; mandate?: SalesAssociateMandate }>({
    open: false,
  });

  // Launch Project Form State
  const [projectName, setProjectName] = useState('');
  const [tagline, setTagline] = useState('');
  const [loc, setLoc] = useState<LocationValue>({ state: '', city: '', locality: '', pincode: '' });
  const [reraNumber, setReraNumber] = useState('');
  const [projectType, setProjectType] = useState<'Luxury High-Rise' | 'Gated Plotted Enclave' | 'Commercial Mall & Business Hub' | 'Ultra-Luxury Villas'>('Luxury High-Rise');
  const [projectStage, setProjectStage] = useState<'Pre-Launch / Upcoming' | 'Under Construction' | 'Ready to Move'>('Pre-Launch / Upcoming');
  const [totalUnits, setTotalUnits] = useState(120);
  const [priceStartingFrom, setPriceStartingFrom] = useState(14500000);
  const [priceMax, setPriceMax] = useState(38000000);
  const [channelPartnerCommissionPct, setChannelPartnerCommissionPct] = useState(2.5);
  const [earlyBirdIncentiveBonusPct, setEarlyBirdIncentiveBonusPct] = useState(0.5);
  const [siteAddress, setSiteAddress] = useState('');
  const [amenitiesInput, setAmenitiesInput] = useState('');
  const [unitConfigsInput, setUnitConfigsInput] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);

  // Appoint Associate Form State
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>(brokers[0]?.id || '');
  const [agreedCommission, setAgreedCommission] = useState<number>(2.5);
  const [quotaUnits, setQuotaUnits] = useState<number>(5);
  const [isAppointing, setIsAppointing] = useState(false);
  const [brokerTierFilter, setBrokerTierFilter] = useState<'ALL' | 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE'>('ALL');

  // Record Sale Form State
  const [saleUnitDetails, setSaleUnitDetails] = useState('');
  const [saleCustomerName, setCustomerName] = useState('');
  const [saleAmount, setSaleAmount] = useState(0);
  const [isRecordingSale, setIsRecordingSale] = useState(false);

  // Computed KPIs
  const totalGDV = projects.reduce((s, p) => s + p.priceStartingFrom * p.totalUnits, 0);
  const totalSalesDelivered = projects.reduce((s, p) => s + p.totalSalesVolumeDelivered, 0);
  const totalUnitsBooked = projects.reduce((s, p) => s + p.totalBookingsGenerated, 0);
  const totalUnitsAvailable = projects.reduce((s, p) => s + p.availableUnits, 0);
  const totalCommissionDisbursed = mandates.reduce((s, m) => s + m.commissionEarned, 0);
  // v28 — a broker who only APPLIED (or was declined / revoked) is not an associate: not counted, no bookings against him
  const LIVE = ['ACTIVE_ASSOCIATE', 'TOP_PERFORMER', 'PAUSED'];
  const liveMandates = mandates.filter((m) => LIVE.includes(m.status));

  const filteredProjects = projects.filter((p) => {
    if (selectedLocality !== 'All' && !p.locality.toLowerCase().includes(selectedLocality.toLowerCase())) {
      return false;
    }
    return true;
  });

  const filteredBrokers = brokers.filter((b) => {
    if (brokerTierFilter !== 'ALL' && b.trustTier !== brokerTierFilter) {
      return false;
    }
    if (!brokerSearch) return true;
    const q = brokerSearch.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      (b.companyName && b.companyName.toLowerCase().includes(q)) ||
      (b.brokerId && b.brokerId.toLowerCase().includes(q)) ||
      (b.reraNumber && b.reraNumber.toLowerCase().includes(q))
    );
  });

  const handleLaunchProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLaunching(true);
    try {
      await api.createBuilderProject({
        ...(isStaff ? { builderId } : {}),
        projectName,
        tagline,
        locality: loc.locality,
        state: loc.state,
        city: loc.city,
        reraNumber,
        projectType,
        projectStage,
        totalUnits: Number(totalUnits),
        priceStartingFrom: Number(priceStartingFrom),
        priceMax: Number(priceMax),
        channelPartnerCommissionPct: Number(channelPartnerCommissionPct),
        earlyBirdIncentiveBonusPct: Number(earlyBirdIncentiveBonusPct),
        siteAddress: siteAddress || [loc.locality, loc.city, loc.state, loc.pincode].filter(Boolean).join(', '),
        unitConfigurations: unitConfigsInput.split(',').map((s) => s.trim()).filter(Boolean),
        amenities: amenitiesInput.split(',').map((s) => s.trim()).filter(Boolean),
      });
      alert(tx(`Project "${projectName}" launched successfully! Available for associate broker sales.`, `प्रोजेक्ट "${projectName}" सफलतापूर्वक लॉन्च हुआ! अब एसोसिएट ब्रोकर इसे बेच सकते हैं।`));
      setShowLaunchModal(false);
      onRefreshData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsLaunching(false);
    }
  };

  const handleAppointAssociate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAppointing(true);
    try {
      await api.appointSalesAssociate({
        projectId: selectedProjectId,
        brokerId: selectedBrokerId,
        agreedCommissionPct: Number(agreedCommission),
        targetUnitsQuota: Number(quotaUnits),
      });
      alert(tx('Associate appointed successfully! Exclusive sales mandate and collateral access granted.', 'एसोसिएट सफलतापूर्वक नियुक्त! विशेष सेल्स मैंडेट और मार्केटिंग सामग्री का एक्सेस मिल गया।'));
      setAppointModalData({ open: false });
      onRefreshData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsAppointing(false);
    }
  };

  const handleRecordSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordSaleModalData.mandate) return;
    setIsRecordingSale(true);
    try {
      const res = await api.recordAssociateSale({
        mandateId: recordSaleModalData.mandate.id,
        unitDetails: saleUnitDetails,
        saleValue: Number(saleAmount),
        customerName: saleCustomerName,
      });
      alert(tx(`Booking confirmed! Associate brokerage of ${formatINR(res.commissionEarned)} credited to ${recordSaleModalData.mandate.brokerName}.`, `बुकिंग पक्की! ${formatINR(res.commissionEarned)} की एसोसिएट ब्रोकरेज ${recordSaleModalData.mandate.brokerName} के खाते में दर्ज।`));
      setRecordSaleModalData({ open: false });
      onRefreshData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsRecordingSale(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header — v75: a plain title + one line; the big launch button stays */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {currentUser.role === 'DEVELOPER_BUILDER' ? tx('My projects', 'मेरे प्रोजेक्ट') : tx('Builders Project Launchpad & Sales Associate Network', 'बिल्डर प्रोजेक्ट लॉन्चपैड और सेल्स एसोसिएट नेटवर्क')}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {tx('Launch a project, appoint verified brokers to sell it, and track their quotas and commissions.', 'प्रोजेक्ट लॉन्च करें, बेचने के लिए वेरिफ़ाइड ब्रोकर चुनें, और उनका कोटा व कमीशन देखें।')}
            </p>
          </div>

          {(currentUser.role === 'DEVELOPER_BUILDER' || currentUser.role === 'SUPERADMIN') && /* v28: an ADMIN cannot create projects (server: builder:project_create) */ (
          <button
            onClick={() => setShowLaunchModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition-colors shrink-0"
          >
            <Plus className="h-4 w-4 text-amber-400" />
            <span>{tx('Launch New Project', 'नया प्रोजेक्ट लॉन्च करें')}</span>
          </button>
          )}
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{tx('Gross Project Portfolio (GDV)', 'कुल प्रोजेक्ट पोर्टफ़ोलियो (GDV)')}</span>
            <Building2 className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {formatINR(totalGDV)}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
            <span>{projects.length} development projects</span>
            <span aria-hidden="true">·</span>
            <span>{Array.from(new Set(projects.map((p) => p.city).filter(Boolean))).slice(0, 3).join(', ') || 'India'}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{tx('Delivered Associate Bookings', 'एसोसिएट से हुई बुकिंग')}</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-700">
            {formatINR(totalSalesDelivered)}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
            <span>{totalUnitsBooked} units sold</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-700">{totalUnitsAvailable} available</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{tx('Active Channel Partners', 'सक्रिय चैनल पार्टनर')}</span>
            <Users className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {liveMandates.length} {tx('Associates', 'एसोसिएट')}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
            <span>{brokers.length} {tx('verified brokers available', 'वेरिफ़ाइड ब्रोकर उपलब्ध')}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{tx('Associate Commission Paid', 'चुकाया गया एसोसिएट कमीशन')}</span>
            <Award className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-amber-700">
            {formatINR(totalCommissionDisbursed)}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
            <span>{tx('Recorded & confirmed by both sides', 'दोनों तरफ़ से रिकॉर्ड और पुष्टि')}</span>
            <span aria-hidden="true">·</span>
            <span>{tx('Zero Bypass Guarantee', 'ज़ीरो बायपास गारंटी')}</span>
          </div>
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveSubTab('projects')}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeSubTab === 'projects'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Building2 className="h-3.5 w-3.5 text-amber-400" />
          <span>{tx('Launched Projects & Inventory', 'लॉन्च प्रोजेक्ट और इन्वेंटरी')} ({projects.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('associates')}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeSubTab === 'associates'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Users className="h-3.5 w-3.5 text-blue-400" />
          <span>{tx('Find & Appoint Channel Partners', 'चैनल पार्टनर खोजें और नियुक्त करें')} ({brokers.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('ledger')}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeSubTab === 'ledger'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Award className="h-3.5 w-3.5 text-emerald-400" />
          <span>{tx('Associate Sales & Commission Ledger', 'एसोसिएट बिक्री और कमीशन लेजर')} ({mandates.length})</span>
        </button>
      </div>

      {/* TAB 1: LAUNCHED PROJECTS */}
      {activeSubTab === 'projects' && (
        <div className="space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500">
              {tx('Showing active builder projects across residential townships and commercial hubs.', 'रिहायशी टाउनशिप और कमर्शियल हब के चालू बिल्डर प्रोजेक्ट दिख रहे हैं।')}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">{tx('Filter Locality:', 'इलाका फ़िल्टर:')}</span>
              <select
                value={selectedLocality}
                onChange={(e) => setSelectedLocality(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              >
                <option value="All">{tx('All Localities', 'सभी इलाके')}</option>
                {Array.from(new Set(projects.map((p) => p.locality).filter(Boolean))).sort().map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {filteredProjects.map((proj) => {
              const bookingPct = Math.round(
                ((proj.totalUnits - proj.availableUnits) / proj.totalUnits) * 100
              );

              return (
                <div
                  key={proj.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white overflow-hidden shadow-xs hover:border-slate-300 transition-all"
                >
                  <div>
                    {/* Image Header */}
                    <div className="relative h-44 w-full bg-slate-100 overflow-hidden">
                      {proj.images[0] ? (
                        <img src={proj.images[0]} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-medium text-slate-400">{tx('No photo yet', 'अभी फ़ोटो नहीं है')}</div>
                      )}
                      <div className="absolute top-2.5 left-2.5 rounded bg-slate-950/80 backdrop-blur-xs px-2 py-0.5 text-[11px] font-mono font-semibold text-white">
                        {proj.id}
                      </div>
                      <div className="absolute top-2.5 right-2.5 rounded bg-amber-400 text-slate-950 px-2 py-0.5 text-[10px] font-bold tracking-wide">
                        {proj.channelPartnerCommissionPct}% {tx('Associate Comm.', 'एसोसिएट कमीशन')}
                      </div>
                    </div>

                    {/* Card Content */}
                    <div className="p-4 space-y-3">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <span>{label('builderProjectType', proj.projectType)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{proj.locality}</span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900 mt-0.5">{proj.projectName}</h3>
                        <p className="text-xs text-slate-600 line-clamp-2 mt-1">{proj.tagline}</p>
                      </div>

                      {/* RERA and Developer */}
                      <div className="rounded-lg bg-slate-50 p-2.5 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">{tx('RERA Registration:', 'RERA पंजीकरण:')}</span>
                          <span className="font-mono font-semibold text-emerald-800">{proj.reraNumber}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">{tx('Pricing Range:', 'कीमत की रेंज:')}</span>
                          <span className="font-bold text-slate-900">
                            {formatINR(proj.priceStartingFrom)} - {formatINR(proj.priceMax)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">{tx('Stage:', 'चरण:')}</span>
                          <span className="font-medium text-slate-800">{label('builderProjectStage', proj.projectStage)}</span>
                        </div>
                      </div>

                      {/* Sales & Inventory Progress */}
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between text-slate-600">
                          <span>Sales Progress ({bookingPct}% Booked)</span>
                          <span className="font-semibold text-slate-900">
                            {proj.availableUnits} / {proj.totalUnits} Units Left
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full bg-emerald-600 rounded-full transition-all"
                            style={{ width: `${bookingPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Unit Configurations */}
                      <div className="text-xs space-y-1">
                        <span className="font-semibold text-slate-700">{tx('Configurations:', 'कॉन्फ़िगरेशन:')}</span>
                        <div className="flex flex-wrap gap-1">
                          {proj.unitConfigurations.map((cfg, idx) => (
                            <span key={idx} className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                              {cfg}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {canManage && <div className="p-4 pt-0 border-t border-slate-100 flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedProjectId(proj.id);
                        setAppointModalData({ open: true, project: proj });
                      }}
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 py-2 text-xs font-semibold text-amber-300 hover:bg-slate-800 transition-colors shadow-xs"
                    >
                      <Users className="h-3.5 w-3.5" />
                      <span>{tx('Appoint Sales Associate', 'सेल्स एसोसिएट नियुक्त करें')}</span>
                    </button>
                  </div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: FIND & APPOINT CHANNEL PARTNERS */}
      {activeSubTab === 'associates' && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {tx('Verified Real Estate Brokers & Co-Brokers Directory', 'वेरिफ़ाइड रियल एस्टेट ब्रोकर और को-ब्रोकर डायरेक्टरी')}
              </h3>
              <p className="text-xs text-slate-500">
                {tx('Directly appoint top regional sales associates evaluated by Trust Scores from completed deals & verified inspections.', 'पूरी हुई डील और वेरिफ़ाइड निरीक्षण के ट्रस्ट स्कोर से परखे गए इलाके के बेहतरीन सेल्स एसोसिएट सीधे नियुक्त करें।')}
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder={tx('Search brokers by name, RERA or agency...', 'नाम, RERA या एजेंसी से ब्रोकर खोजें...')}
                value={brokerSearch}
                onChange={(e) => setBrokerSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
              />
            </div>
          </div>

          {/* Trust Tier Quick Filters */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200/80 pb-3 text-xs">
            <span className="text-slate-500 font-semibold mr-1 text-[11px] uppercase tracking-wider">{tx('Trust Tiers:', 'ट्रस्ट टियर:')}</span>
            <button
              onClick={() => setBrokerTierFilter('ALL')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                brokerTierFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Brokers ({brokers.length})
            </button>
            <button
              onClick={() => setBrokerTierFilter('PLATINUM')}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                brokerTierFilter === 'PLATINUM'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <span>🌟 Platinum Elite</span>
              <span className="text-[10px] opacity-80">({brokers.filter(b => b.trustTier === 'PLATINUM').length})</span>
            </button>
            <button
              onClick={() => setBrokerTierFilter('GOLD')}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                brokerTierFilter === 'GOLD'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span>💎 Gold Verified</span>
              <span className="text-[10px] opacity-80">({brokers.filter(b => b.trustTier === 'GOLD').length})</span>
            </button>
            <button
              onClick={() => setBrokerTierFilter('SILVER')}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                brokerTierFilter === 'SILVER'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100'
              }`}
            >
              <span>🛡️ Silver Associate</span>
              <span className="text-[10px] opacity-80">({brokers.filter(b => b.trustTier === 'SILVER').length})</span>
            </button>
            <button
              onClick={() => setBrokerTierFilter('BRONZE')}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                brokerTierFilter === 'BRONZE'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200'
              }`}
            >
              <span>🥉 Bronze Partner</span>
              <span className="text-[10px] opacity-80">({brokers.filter(b => b.trustTier === 'BRONZE').length})</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredBrokers.map((broker) => {
              const brokerMandates = liveMandates.filter((m) => m.brokerId === broker.id);
              const totalSalesByBroker = brokerMandates.reduce((s, m) => s + m.grossSalesDelivered, 0);
              const totalUnitsByBroker = brokerMandates.reduce((s, m) => s + m.unitsSold, 0);

              return (
                <div
                  key={broker.id}
                  className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span>{broker.brokerId || 'Verified Broker'}</span>
                        </div>
                        <h4 className="text-base font-bold text-slate-900 mt-0.5">{broker.name}</h4>
                        <div className="text-xs text-slate-500">{broker.companyName || 'Independent Real Estate Agency'}</div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <TrustScoreBadge user={broker} variant="pill" />
                        <div className="rounded bg-slate-100 px-2 py-0.5 text-center font-mono text-[10px] font-semibold text-slate-700">
                          {broker.city}
                        </div>
                      </div>
                    </div>

                    {/* Trust Score & Physical Verification Breakdown Card */}
                    <TrustScoreBadge user={broker} variant="detailed" />

                    {/* Broker Credentials & Performance */}
                    <div className="rounded-lg bg-slate-50 p-2.5 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">{tx('RERA Number:', 'RERA नंबर:')}</span>
                        <span className="font-mono font-semibold text-slate-800">{broker.reraNumber || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">{tx('Current Sales Delivered:', 'अब तक की बिक्री:')}</span>
                        <span className="font-bold text-emerald-700">{formatINR(totalSalesByBroker)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">{tx('Units Booked:', 'बुक यूनिट:')}</span>
                        <span className="font-semibold text-slate-900">{totalUnitsByBroker} units</span>
                      </div>
                    </div>

                    {/* Active Mandates */}
                    <div className="text-xs space-y-1">
                      <span className="font-semibold text-slate-700">Assigned Projects ({brokerMandates.length}):</span>
                      {brokerMandates.length > 0 ? (
                        <div className="space-y-1">
                          {brokerMandates.map((m) => (
                            <div key={m.id} className="flex items-center justify-between rounded bg-white p-1.5 border border-slate-200/60 text-[11px]">
                              <span className="truncate max-w-[170px] text-slate-700">{m.projectName}</span>
                              <span className="font-bold text-emerald-700">{m.agreedCommissionPct}%</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-slate-400 italic text-[11px]">{tx('Ready for new project mandate appointment', 'नए प्रोजेक्ट मैंडेट के लिए तैयार')}</div>
                      )}
                    </div>
                  </div>

                  {canManage && <button
                    onClick={() => {
                      setSelectedBrokerId(broker.id);
                      setAppointModalData({ open: true, broker });
                    }}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors shadow-xs"
                  >
                    <Send className="h-3.5 w-3.5 text-amber-400" />
                    <span>{tx('Appoint as Sales Associate', 'सेल्स एसोसिएट नियुक्त करें')}</span>
                  </button>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: ASSOCIATE SALES & COMMISSION LEDGER */}
      {activeSubTab === 'ledger' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {tx('Channel Partner Performance & Commission Payout Ledger', 'चैनल पार्टनर परफ़ॉर्मेंस और कमीशन पेआउट लेजर')}
              </h3>
              <p className="text-xs text-slate-500">
                {tx('Track unit bookings, gross sales delivered, and associate commission entitlements with full audit trail.', 'यूनिट बुकिंग, कुल बिक्री और एसोसिएट के कमीशन हक़ को पूरे ऑडिट ट्रेल के साथ देखें।')}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-4 py-3">{tx('Mandate ID', 'मैंडेट ID')}</th>
                    <th className="px-4 py-3">{tx('Associate Broker', 'एसोसिएट ब्रोकर')}</th>
                    <th className="px-4 py-3">{tx('Project Reference', 'प्रोजेक्ट संदर्भ')}</th>
                    <th className="px-4 py-3">{tx('Commission %', 'कमीशन %')}</th>
                    <th className="px-4 py-3">{tx('Units Sold', 'बिकी यूनिट')}</th>
                    <th className="px-4 py-3">{tx('Gross Sales (₹)', 'कुल बिक्री (₹)')}</th>
                    <th className="px-4 py-3">{tx('Commission Earned (₹)', 'कमाया कमीशन (₹)')}</th>
                    <th className="px-4 py-3">{tx('Status', 'स्टेटस')}</th>
                    <th className="px-4 py-3 text-right">{tx('Action', 'कार्रवाई')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {mandates.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">{m.id}</td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{m.brokerName}</div>
                        <div className="text-[11px] text-slate-500">{m.brokerCompany}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{m.projectName}</td>
                      <td className="px-4 py-3 font-bold text-amber-700">{m.agreedCommissionPct}%</td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-900">{m.unitsSold}</span>
                        <span className="text-slate-400 text-[11px]"> / {m.targetUnitsQuota} quota</span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900">
                        {formatINR(m.grossSalesDelivered)}
                      </td>
                      <td className="px-4 py-3 font-bold text-emerald-700 text-sm">
                        {formatINR(m.commissionEarned)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            m.status === 'TOP_PERFORMER'
                              ? 'bg-amber-100 text-amber-900'
                              : LIVE.includes(m.status) ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {label('status', m.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canManage && ['ACTIVE_ASSOCIATE', 'TOP_PERFORMER'].includes(m.status) ? <button
                          onClick={() => setRecordSaleModalData({ open: true, mandate: m })}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-slate-800 transition-colors"
                        >
                          {tx('+ Record Booking', '+ बुकिंग दर्ज करें')}
                        </button> : <span className="text-[11px] text-slate-400">{m.status === 'APPLIED' || m.status === 'SHORTLISTED' ? tx('Decide in Project Control', 'प्रोजेक्ट कंट्रोल में फ़ैसला करें') : '—'}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: LAUNCH NEW PROJECT */}
      {showLaunchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">{tx('Launch New Real Estate Project', 'नया रियल एस्टेट प्रोजेक्ट लॉन्च करें')}</h3>
                <p className="text-xs text-slate-500">{tx('Master Development & Channel Partner Offering', 'मास्टर डेवलपमेंट और चैनल पार्टनर ऑफ़र')}</p>
              </div>
              <button onClick={() => setShowLaunchModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleLaunchProject} className="mt-4 space-y-3">
              {isStaff && (
                <div>
                  <label className="text-xs font-semibold text-slate-700">{tx('Builder account (GENZ launches on its behalf):', 'बिल्डर अकाउंट (GENZ इसकी ओर से लॉन्च करता है):')}</label>
                  <select required value={builderId} onChange={(e) => setBuilderId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900">
                    <option value="">{tx('— Choose the verified builder —', '— सत्यापित बिल्डर चुनें —')}</option>
                    {builders.map((b) => <option key={b.id} value={b.id}>{b.name}{b.companyName ? ` — ${b.companyName}` : ''}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Project Name:', 'प्रोजेक्ट का नाम:')}</label>
                <input
                  type="text"
                  required
                  placeholder={tx('e.g. Lotus Grand Palms', 'जैसे लोटस ग्रैंड पाम्स')}
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Marketing Tagline:', 'मार्केटिंग टैगलाइन:')}</label>
                <input
                  type="text"
                  placeholder={tx('e.g. Ultra-Luxury 4 BHK Sky Residences overlooking Marine Drive', 'जैसे झील किनारे अल्ट्रा-लग्ज़री 4 BHK स्काई रेसिडेंस')}
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                />
              </div>

              <LocationFields value={loc} onChange={setLoc} />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">{tx('Project Type:', 'प्रोजेक्ट का प्रकार:')}</label>
                  <select
                    value={projectType}
                    onChange={(e) => setProjectType(e.target.value as any)}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                  >
                    <option value="Luxury High-Rise">{tx('Luxury High-Rise', 'लग्ज़री हाई-राइज़')}</option>
                    <option value="Gated Plotted Enclave">{tx('Gated Plotted Enclave', 'गेटेड प्लॉटेड एन्क्लेव')}</option>
                    <option value="Commercial Mall & Business Hub">{tx('Commercial Mall & Hub', 'कमर्शियल मॉल और हब')}</option>
                    <option value="Ultra-Luxury Villas">{tx('Ultra-Luxury Villas', 'अल्ट्रा-लग्ज़री विला')}</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">{tx('Stage:', 'चरण:')}</label>
                  <select
                    value={projectStage}
                    onChange={(e) => setProjectStage(e.target.value as any)}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                  >
                    <option value="Pre-Launch / Upcoming">{tx('Pre-Launch / Upcoming', 'प्री-लॉन्च / आने वाला')}</option>
                    <option value="Under Construction">{tx('Under Construction', 'निर्माणाधीन')}</option>
                    <option value="Ready to Move">{tx('Ready to Move', 'तुरंत कब्ज़ा')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700">{tx('RERA Project Registration # (your state’s RERA):', 'RERA प्रोजेक्ट रजिस्ट्रेशन # (आपके राज्य का RERA):')}</label>
                  <input
                    type="text"
                    required
                    value={reraNumber}
                    onChange={(e) => setReraNumber(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">{tx('Total Units Available:', 'कुल उपलब्ध यूनिट:')}</label>
                  <input
                    type="number"
                    required
                    value={totalUnits}
                    onChange={(e) => setTotalUnits(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700">{tx('Starting Price (₹):', 'शुरुआती कीमत (₹):')}</label>
                  <input
                    type="number"
                    required
                    value={priceStartingFrom}
                    onChange={(e) => setPriceStartingFrom(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-slate-900"
                  />
                </div>

                <div className="rounded-lg bg-amber-50 p-2 border border-amber-200">
                  <label className="text-xs font-semibold text-amber-950">
                    {tx('Channel Partner Broker Commission (%):', 'चैनल पार्टनर ब्रोकर कमीशन (%):')}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={channelPartnerCommissionPct}
                    onChange={(e) => setChannelPartnerCommissionPct(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-amber-300 p-1.5 text-xs font-bold text-amber-950 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Unit Configurations (Comma separated):', 'यूनिट कॉन्फ़िगरेशन (कॉमा से अलग):')}</label>
                <input
                  type="text"
                  value={unitConfigsInput}
                  onChange={(e) => setUnitConfigsInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Amenities & USPs (Comma separated):', 'सुविधाएँ और खासियतें (कॉमा से अलग):')}</label>
                <input
                  type="text"
                  value={amenitiesInput}
                  onChange={(e) => setAmenitiesInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLaunchModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {tx('Cancel', 'रद्द करें')}
                </button>
                <button
                  type="submit"
                  disabled={isLaunching}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {isLaunching ? tx('Launching Project...', 'प्रोजेक्ट लॉन्च हो रहा है...') : tx('Launch Project & Open to Channel Partners', 'प्रोजेक्ट लॉन्च करें और चैनल पार्टनर के लिए खोलें')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: APPOINT ASSOCIATE BROKER */}
      {appointModalData.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">{tx('Appoint Sales Associate', 'सेल्स एसोसिएट नियुक्त करें')}</h3>
              <button
                onClick={() => setAppointModalData({ open: false })}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAppointAssociate} className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Target Project:', 'चुना हुआ प्रोजेक्ट:')}</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.projectName} ({p.locality}) — {p.channelPartnerCommissionPct}% Base Comm.
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">{tx('Appoint Broker Partner:', 'ब्रोकर पार्टनर नियुक्त करें:')}</label>
                  {brokers.find(b => b.id === selectedBrokerId) && (
                    <TrustScoreBadge user={brokers.find(b => b.id === selectedBrokerId)} variant="minimal" />
                  )}
                </div>
                <select
                  value={selectedBrokerId}
                  onChange={(e) => setSelectedBrokerId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                >
                  {brokers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.companyName || b.brokerId || 'Broker'}) — Trust: {b.trustScore || 50}/100 [{b.trustTier || 'PARTNER'}]
                    </option>
                  ))}
                </select>

                {/* Selected Broker Trust Breakdown */}
                {brokers.find(b => b.id === selectedBrokerId) && (
                  <div className="mt-2">
                    <TrustScoreBadge user={brokers.find(b => b.id === selectedBrokerId)} variant="detailed" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">{tx('Agreed Commission (%):', 'तय कमीशन (%):')}</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={agreedCommission}
                    onChange={(e) => setAgreedCommission(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">{tx('Target Quota (Units):', 'लक्ष्य (यूनिट):')}</label>
                  <input
                    type="number"
                    required
                    value={quotaUnits}
                    onChange={(e) => setQuotaUnits(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div className="rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-950 border border-emerald-200">
                {tx('Granting this mandate unlocks high-res 3D elevation renders, sanction letters, and pre-sales brochures to the associate broker.', 'यह मैंडेट देने पर एसोसिएट ब्रोकर को हाई-रेज़ 3D एलिवेशन रेंडर, सैंक्शन लेटर और प्री-सेल्स ब्रोशर मिल जाते हैं।')}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAppointModalData({ open: false })}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {tx('Cancel', 'रद्द करें')}
                </button>
                <button
                  type="submit"
                  disabled={isAppointing}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {isAppointing ? tx('Issuing Mandate...', 'मैंडेट बन रहा है...') : tx('Ratify Associate Mandate', 'एसोसिएट मैंडेट मंज़ूर करें')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RECORD UNIT BOOKING */}
      {recordSaleModalData.open && recordSaleModalData.mandate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">{tx('Record Associate Unit Booking', 'एसोसिएट की यूनिट बुकिंग दर्ज करें')}</h3>
              <button
                onClick={() => setRecordSaleModalData({ open: false })}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRecordSale} className="mt-4 space-y-3">
              <div className="rounded-lg bg-slate-50 p-3 text-xs space-y-1">
                <div className="text-slate-500">{tx('Credited Sales Associate:', 'क्रेडिट होने वाला सेल्स एसोसिएट:')}</div>
                <div className="font-bold text-slate-900">
                  {recordSaleModalData.mandate.brokerName} ({recordSaleModalData.mandate.agreedCommissionPct}% {tx('commission', 'कमीशन')})
                </div>
                <div className="text-slate-500 text-[11px]">
                  Project: <strong>{recordSaleModalData.mandate.projectName}</strong>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Unit / Flat Details:', 'यूनिट / फ़्लैट का विवरण:')}</label>
                <input
                  type="text"
                  required
                  value={saleUnitDetails}
                  onChange={(e) => setSaleUnitDetails(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Buyer / Client Full Name:', 'खरीदार / ग्राहक का पूरा नाम:')}</label>
                <input
                  type="text"
                  required
                  value={saleCustomerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">{tx('Total Booking Agreement Value (₹):', 'कुल बुकिंग एग्रीमेंट मूल्य (₹):')}</label>
                <input
                  type="number"
                  required
                  value={saleAmount}
                  onChange={(e) => setSaleAmount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs font-bold text-slate-900"
                />
              </div>

              <div className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 border border-amber-200">
                Calculated Associate Brokerage: <strong>{formatINR(Math.round(saleAmount * (recordSaleModalData.mandate.agreedCommissionPct / 100)))}</strong>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRecordSaleModalData({ open: false })}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {tx('Cancel', 'रद्द करें')}
                </button>
                <button
                  type="submit"
                  disabled={isRecordingSale}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isRecordingSale ? tx('Confirming...', 'पक्का हो रहा है...') : tx('Record Booking & Credit Brokerage', 'बुकिंग दर्ज करें और ब्रोकरेज क्रेडिट करें')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
