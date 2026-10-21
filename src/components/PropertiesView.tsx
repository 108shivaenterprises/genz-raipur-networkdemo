import React, { useState, useEffect, useRef } from 'react';
import { Property, UserProfile } from '../types/index.js';
import { api, type PropertyFacets } from '../lib/api.js';
import { formatINR, formatArea, getPropertyWhatsAppShareUrl } from '../lib/utils.js';
import { PROPERTY_TYPES, INDIA_STATES, ALL_TAGS } from '../shared/india.js';
import { MandateModal } from './MandateModal.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { hasPerm } from '../lib/permissions.js';
import { openPapersFor } from '../lib/paperFile.js';
import type { OwnerMandate } from '../types/index.js';
import { TrustScoreBadge } from './TrustScoreBadge.js';
import { ReportButton } from './ReportButton.js';
import { EditPropertyModal } from './EditPropertyModal.js';
import { ListingDrafts } from './ListingDrafts.js';
import { ConsentQueue } from './ConsentQueue.js';
import { MessageCircle } from 'lucide-react';
import {
  Building2,
  FolderOpen,
  Lock,
  Search,
  Sparkles,
  History,
  ShieldCheck,
  Phone,
  Eye,
  CheckCircle2,
  Share2,
  MapPin,
  Video,
  Pencil,
  UserCheck,
  Clock,
  FileSignature,
} from 'lucide-react';

interface PropertiesViewProps {
  properties: Property[];
  currentUser: UserProfile;
  users?: UserProfile[];
  onOpenAddProperty: () => void;
  onPropertyUpdated?: () => void;
  onSelectPropertyForMatching: (prop: Property) => void;
  onProposeCollaboration: (prop: Property) => void;
  onScheduleVisit?: (prop: Property) => void;
  mandates?: OwnerMandate[];
  canSeeMandates?: boolean;
  /** server-issued permission list: actions the role may not use are not drawn (the API refuses them anyway) */
  permissions?: string[];
  /** v20: when the network is big the app starts with a partial list; searching then happens on the server */
  scope?: { total: number; scoped: boolean; facets?: PropertyFacets };
}

export const PropertiesView: React.FC<PropertiesViewProps> = ({
  properties,
  currentUser,
  users,
  onOpenAddProperty,
  onPropertyUpdated,
  onSelectPropertyForMatching,
  onProposeCollaboration,
  onScheduleVisit,
  mandates = [],
  canSeeMandates = false,
  permissions,
  scope,
}) => {
  const { lang } = useI18n();
  const hi = lang === 'hi';
  const tx = useTx();
  const label = useLabel();
  const may = (...p: string[]) => !permissions || hasPerm(permissions, ...p);
  const isBuyer = currentUser.role === 'BUYER_TENANT';
  const isOwner = currentUser.role === 'PROPERTY_OWNER';
  const isBroker = currentUser.role === 'BROKER';
  const [approvalBusy, setApprovalBusy] = useState('');
  /** v28 — a listing without the owner's approval: make / open its owner-approval draft (WhatsApp link + optional brokerage) */
  const openOwnerApproval = async (propertyId: string) => {
    setApprovalBusy(propertyId);
    try { const r = await api.consentFromProperty(propertyId); setDraftOpenId(r.draft.id); setShowDrafts(true); }
    catch (e: any) { alert(e?.message || 'Error'); } finally { setApprovalBusy(''); }
  };
  const [draftOpenId, setDraftOpenId] = useState<string>(() => { try { return new URLSearchParams(window.location.search).get('draft') || ''; } catch { return ''; } });
  const [showDrafts, setShowDrafts] = useState<boolean>(() => { try { return new URLSearchParams(window.location.search).get('drafts') === '1'; } catch { return false; } });
  const isAdmin = currentUser.role === 'SUPERADMIN' || currentUser.role === 'ADMIN';

  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'my'>(() => (isOwner ? 'my' : 'all'));
  const [selectedState, setSelectedState] = useState<string>('All');
  const [selectedCity, setSelectedCity] = useState<string>('All');
  const [selectedTag, setSelectedTag] = useState<string>('All');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [mandateFor, setMandateFor] = useState<Property | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('propertyId') || '';
    }
    return '';
  });
  const [selectedPropHistory, setSelectedPropHistory] = useState<Property | null>(null);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);

  // "Mine" is decided by the server-side ids only (never by matching names / phone numbers, which could
  // wrongly claim someone else's property).
  const isMyProperty = (p: Property) => isAdmin || p.listingBrokerId === currentUser.id || p.ownerId === currentUser.id;

  const myProperties = properties.filter((p) => {
    if (isAdmin) return true;
    return isMyProperty(p);
  });

  const myValuation = myProperties.reduce((s, p) => s + (p.askingPrice || 0), 0);
  const totalValuation = properties.reduce((s, p) => s + (p.askingPrice || 0), 0);

  const filteredProperties = properties.filter((p) => {
    if (ownershipFilter === 'my') {
      if (!isMyProperty(p)) return false;
    }
    if (selectedState !== 'All' && (p.state || '') !== selectedState) return false;
    if (selectedCity !== 'All' && (p.city || '') !== selectedCity) return false;
    if (selectedTag !== 'All' && !(p.tags || []).some((t) => t.toLowerCase() === selectedTag.toLowerCase())) return false;
    if (selectedType !== 'All' && p.propertyType !== selectedType) {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = p.title.toLowerCase().includes(q);
      const matchLoc = p.locality.toLowerCase().includes(q);
      const matchId = p.id.toLowerCase().includes(q);
      const matchPin = (p.pincode || '').includes(q);
      const matchCity = (p.city || '').toLowerCase().includes(q);
      if (!matchTitle && !matchLoc && !matchId && !matchPin && !matchCity) return false;
    }
    return true;
  });

  const propertyTypes = ['All', ...PROPERTY_TYPES];
  // v20 — big network: the app holds MY listings + the newest ones; any search / filter / "all" view asks the server, page by page
  const serverMode = !!scope?.scoped;
  const [browseAll, setBrowseAll] = useState(false);
  const wantsRemote = serverMode && ownershipFilter !== 'my' && (browseAll || selectedState !== 'All' || selectedCity !== 'All' || selectedTag !== 'All' || selectedType !== 'All' || !!searchQuery.trim());
  const [remote, setRemote] = useState<{ list: Property[]; total: number; hasMore: boolean; loading: boolean; err: string } | null>(null);
  const reqSeq = useRef(0);
  const remoteFilters = () => ({
    state: selectedState !== 'All' ? selectedState : undefined, city: selectedCity !== 'All' ? selectedCity : undefined,
    tag: selectedTag !== 'All' ? selectedTag : undefined, propertyType: selectedType !== 'All' ? selectedType : undefined, q: searchQuery.trim() || undefined,
  });
  const fetchRemote = async (more: boolean) => {
    const my = ++reqSeq.current; const offset = more && remote ? remote.list.length : 0;
    setRemote(r => ({ list: more && r ? r.list : [], total: r?.total || 0, hasMore: false, loading: true, err: '' }));
    try {
      const r = await api.getProperties({ ...remoteFilters(), limit: 60, offset });
      if (my !== reqSeq.current) return;
      setRemote(prev => ({ list: [...(more && prev ? prev.list : []), ...r.properties], total: r.total ?? r.properties.length, hasMore: !!r.hasMore, loading: false, err: '' }));
    } catch (e: any) {
      if (my === reqSeq.current) setRemote(prev => ({ list: prev?.list || [], total: prev?.total || 0, hasMore: false, loading: false, err: e?.message || 'Could not load' }));
    }
  };
  useEffect(() => {
    if (!wantsRemote) { reqSeq.current++; setRemote(null); return; }
    const t = window.setTimeout(() => fetchRemote(false), searchQuery.trim() ? 350 : 0);
    return () => window.clearTimeout(t);
  }, [wantsRemote, selectedState, selectedCity, selectedTag, selectedType, searchQuery, browseAll]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownList = remote ? remote.list : filteredProperties;
  // long lists are drawn 30 cards at a time (phones choke on hundreds of image cards)
  const [visibleCount, setVisibleCount] = useState(30);
  useEffect(() => { setVisibleCount(30); }, [ownershipFilter, selectedState, selectedCity, selectedTag, selectedType, searchQuery, browseAll]);
  // Only offer states / cities / tags that actually exist in the visible inventory (server facets on a partial list)
  const statesInUse = serverMode && scope?.facets ? scope.facets.states.map(x => x.name) : [...new Set(properties.map((p) => p.state).filter(Boolean) as string[])].sort();
  const citiesInUse = serverMode && scope?.facets
    ? [...new Set(scope.facets.cities.filter(c => selectedState === 'All' || c.state === selectedState).map(c => c.city))].sort()
    : [...new Set(properties.filter((p) => selectedState === 'All' || p.state === selectedState).map((p) => p.city).filter(Boolean))].sort();
  const tagsInUse = serverMode && scope?.facets ? scope.facets.tags.map(x => x.name).sort() : [...new Set([...ALL_TAGS.filter((t) => properties.some((p) => (p.tags || []).includes(t))), ...properties.flatMap((p) => p.tags || [])])].sort();
  const mandateOf = (p: Property) => {
    const list = mandates.filter((m) => m.propertyId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list.find((m) => m.status === 'PENDING_BROKER') || list.find((m) => m.status === 'ACTIVE') || list[0];
  };

  return (
    <div className="space-y-6">
      {showDrafts && <ListingDrafts openId={draftOpenId} onClose={() => { setShowDrafts(false); setDraftOpenId(''); try { const u = new URL(window.location.href); u.searchParams.delete('drafts'); u.searchParams.delete('draft'); window.history.replaceState(null, '', u.toString()); } catch { /* */ } }} onPublished={() => onPropertyUpdated?.()} />}
      {may('property:moderate') && <ConsentQueue />}
      {/* Header and Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{hi ? 'पूरे भारत की प्रॉपर्टी रजिस्ट्री' : 'Pan-India Property Registry'}</span>
            <span aria-hidden="true">·</span>
            <span>{remote ? tx(`${remote.list.length} of ${remote.total} shown`, `${remote.total} में से ${remote.list.length} दिख रही हैं`) : `${shownList.length} ${tx('properties displayed', 'प्रॉपर्टी दिख रही हैं')}`}</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-slate-700">
              {tx('Valuation', 'कुल मूल्य')}: {formatINR(shownList.reduce((s, p) => s + (p.askingPrice || 0), 0))}
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            {isOwner && ownershipFilter === 'my'
              ? tx('My Property Portfolio & Private Vault', 'मेरी प्रॉपर्टी और प्राइवेट वॉल्ट')
              : isBroker && ownershipFilter === 'my'
              ? tx('My Direct Mandates & Exclusive Listings', 'मेरे सीधे मैंडेट और एक्सक्लूसिव लिस्टिंग')
              : isBuyer
              ? tx('Verified Properties', 'वेरिफ़ाइड प्रॉपर्टी')
              : tx('Property Inventory & Co-Broking Exchange', 'प्रॉपर्टी इन्वेंटरी और को-ब्रोकिंग एक्सचेंज')}
          </h2>
        </div>

        {may('property:create') && (
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
        {isBroker && <button onClick={() => setShowDrafts(true)} data-testid="open-wa-drafts"
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700">
          <MessageCircle className="h-3.5 w-3.5" /> {tx('From WhatsApp', 'WhatsApp से डालें')}
        </button>}
        <button
          onClick={onOpenAddProperty}
          className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition-colors"
        >
          <Building2 className="h-3.5 w-3.5 text-amber-400" />
          <span>{tx('+ Register New Property', '+ नई प्रॉपर्टी दर्ज करें')}</span>
        </button>
        </div>
        )}
      </div>

      {/* Scope Selector Tabs for Owner & Broker */}
      {isBroker && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setOwnershipFilter('my')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              ownershipFilter === 'my'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span>{tx('My Direct Mandates', 'मेरे सीधे मैंडेट')}</span>
            <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              ownershipFilter === 'my' ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-slate-100 text-slate-700'
            }`}>
              {myProperties.length} ({formatINR(myValuation)})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setOwnershipFilter('all')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              ownershipFilter === 'all'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span>{tx('All Network Listings', 'नेटवर्क की सभी लिस्टिंग')}</span>
            <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              ownershipFilter === 'all' ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-slate-100 text-slate-700'
            }`}>
              {serverMode ? scope!.total : properties.length}{serverMode ? '' : ` (${formatINR(totalValuation)})`}
            </span>
          </button>
        </div>
      )}

      {/* Direct Mandates & Ownership Help Banner */}
      {ownershipFilter === 'my' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/80 p-3.5 text-xs text-blue-900 shadow-2xs">
          <div className="flex items-start sm:items-center gap-2.5">
            <UserCheck className="h-4 w-4 text-blue-700 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-bold">{tx('Your Managed Property Inventory:', 'आपकी संभाली हुई प्रॉपर्टी:')}</span>{' '}
              <span>
                {tx('You have full authority to edit prices, photos, video walkthrough, specifications, or status for your listings. Click the ', 'आप अपनी लिस्टिंग की कीमत, फ़ोटो, वीडियो, विवरण या स्टेटस बदल सकते हैं। किसी भी कार्ड पर ')}<strong>{tx('Edit Listing', 'लिस्टिंग एडिट करें')}</strong>{tx(' button on any card below to make updates.', ' बटन दबाएँ।')}
              </span>
            </div>
          </div>
          <button
            onClick={onOpenAddProperty}
            className="inline-flex items-center gap-1 self-start sm:self-auto rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shrink-0"
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>{tx('+ List Another', '+ एक और लिस्ट करें')}</span>
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder={hi ? 'शीर्षक, इलाका, शहर, पिनकोड, ID...' : 'Title, locality, city, PIN or ID...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-900 focus:outline-none"
            />
          </div>
          <select value={selectedState} onChange={(e) => { setSelectedState(e.target.value); setSelectedCity('All'); }} className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none">
            <option value="All">{hi ? 'सभी राज्य' : 'All states'}</option>
            {statesInUse.map((st) => <option key={st} value={st}>{hi ? (INDIA_STATES.find((x) => x.name === st)?.hi || st) : st}</option>)}
          </select>
          <select value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none">
            <option value="All">{hi ? 'सभी शहर' : 'All cities'}</option>
            {citiesInUse.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none">
            {propertyTypes.map((t) => <option key={t} value={t}>{t === 'All' ? (hi ? 'सभी प्रकार' : 'All property types') : label('propertyType', t)}</option>)}
          </select>
          <select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none">
            <option value="All">{hi ? 'सभी टैग' : 'Any tag'}</option>
            {tagsInUse.map((t) => <option key={t} value={t}>{label('tag', t)}</option>)}
          </select>
        </div>
      </div>

      {serverMode && ownershipFilter !== 'my' && !remote && (
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{tx(`Showing your listings and the newest ${properties.length} of ${scope!.total} in the network (your city first). Search or filter to look through all of them.`, `आपकी लिस्टिंग और नेटवर्क की ${scope!.total} में से नई ${properties.length} दिख रही हैं (आपका शहर पहले)। सब में देखने के लिए खोजें या फ़िल्टर लगाएँ।`)}</span>
          <button type="button" onClick={() => setBrowseAll(true)} className="min-h-11 shrink-0 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white">{tx('Browse all, newest first', 'सब देखें, नई पहले')}</button>
        </div>
      )}
      {remote?.err && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-800">{remote.err}</p>}
      {remote?.loading && remote.list.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">{tx('Searching the network…', 'नेटवर्क में खोज रहे हैं…')}</p>}

      {/* Properties Cards Grid */}
      {shownList.length === 0 && !remote?.loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <Building2 className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900">
            {ownershipFilter === 'my'
              ? isOwner
                ? tx('No properties registered in your owner portfolio', 'आपके पोर्टफ़ोलियो में कोई प्रॉपर्टी दर्ज नहीं')
                : tx('No direct mandated listings found', 'कोई सीधी मैंडेट लिस्टिंग नहीं मिली')
              : tx('No matching properties found', 'कोई मेल खाती प्रॉपर्टी नहीं मिली')}
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
            {ownershipFilter === 'my'
              ? isOwner
                ? tx('You currently have no properties registered under your account. Register your property or switch to "All Network Listings" to view the marketplace.', 'आपके खाते में अभी कोई प्रॉपर्टी दर्ज नहीं है। अपनी प्रॉपर्टी दर्ज करें या मार्केटप्लेस देखने के लिए "नेटवर्क की सभी लिस्टिंग" चुनें।')
                : tx('You have not registered any direct listings under your profile yet. Switch to "All Network Listings" to view co-broking inventory or register a new mandate.', 'आपने अभी कोई सीधी लिस्टिंग दर्ज नहीं की है। को-ब्रोकिंग इन्वेंटरी देखने के लिए "नेटवर्क की सभी लिस्टिंग" चुनें या नया मैंडेट दर्ज करें।')
              : tx('Try adjusting your search query, locality, or property type filter.', 'खोज, इलाका या प्रॉपर्टी का प्रकार बदलकर देखें।')}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            {ownershipFilter === 'my' && (
              <button
                type="button"
                onClick={() => setOwnershipFilter('all')}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {tx('View All Network Listings', 'नेटवर्क की सभी लिस्टिंग देखें')}
              </button>
            )}
            {may('property:create') && (
            <button
              type="button"
              onClick={onOpenAddProperty}
              className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              {tx('+ Register New Property', '+ नई प्रॉपर्टी दर्ज करें')}
            </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {shownList.slice(0, visibleCount).map((p) => {
            const isMyListing = isMyProperty(p);
            const canEditListing = isAdmin || isMyListing;
            const isOwnerOrAdmin = canEditListing;
            // v27 — sold / rented: everyone on the network sees it as closed; no more offers, visits or splits on it
            const isClosed = ['sold', 'rented'].includes(p.listingStatus);
            const closedWord = p.listingStatus === 'rented' ? tx('RENTED', 'किराये पर गई') : tx('SOLD', 'बिक गई');

            return (
              <div
                key={p.id}
                className={`flex flex-col justify-between rounded-xl border bg-white overflow-hidden shadow-xs hover:border-slate-300 transition-all ${
                  isMyListing ? 'border-blue-300/80 ring-1 ring-blue-500/20' : 'border-slate-200/90'
                } ${isClosed ? 'opacity-90' : ''}`}
                data-testid={isClosed ? `closed-${p.id}` : undefined}
              >
                <div>
                  {/* Image & Price Header */}
                  <div className="relative h-44 w-full bg-slate-100 overflow-hidden">
                    {p.images[0] ? (
                      <><div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-slate-400">{tx('No photo yet', 'अभी फ़ोटो नहीं है')}</div><img src={p.images[0]} alt="" className="relative h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} /></>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-medium text-slate-400">{tx('No photo yet', 'अभी फ़ोटो नहीं है')}</div>
                    )}
                    {!isMyListing && !isAdmin && currentUser.role !== 'PROPERTY_OWNER' && <div className="absolute bottom-2 right-2 rounded-md bg-white/90 shadow-xs"><ReportButton targetType="LISTING" targetId={p.id} /></div>}
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                      <div className="rounded bg-slate-950/80 backdrop-blur-xs px-2 py-0.5 text-[11px] font-mono font-semibold text-white">
                        {p.id}
                      </div>
                      {isMyListing && (
                        <span className="flex items-center gap-1 rounded bg-blue-600/95 backdrop-blur-xs px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                          <UserCheck className="h-3 w-3" />
                          <span>{tx('Your Listing', 'आपकी लिस्टिंग')}</span>
                        </span>
                      )}
                    </div>
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                      {p.videoUrl && (
                        <span className="rounded bg-purple-900/90 backdrop-blur-xs px-2 py-0.5 text-[10px] font-semibold text-white flex items-center gap-1">
                          {tx('Video Tour', 'वीडियो टूर')}
                        </span>
                      )}
                      {isClosed
                        ? <span className="rounded bg-red-600 px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide text-white shadow-xs" data-testid="sold-badge">{closedWord}</span>
                        : <span className="flex items-center gap-1 rounded bg-white/90 backdrop-blur-xs px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            <span>{tx('Verified', 'वेरिफ़ाइड')}</span>
                          </span>}
                    </div>
                  {p.googleMapsUrl && (
                    <a
                      href={p.googleMapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute bottom-2.5 left-2.5 rounded bg-white/95 backdrop-blur-xs px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:text-blue-900 flex items-center gap-1 shadow-xs"
                    >
                      <MapPin className="h-3 w-3 text-blue-600" />
                      <span>{tx('Google Maps Location', 'गूगल मैप्स लोकेशन')}</span>
                    </a>
                  )}
                </div>

                {/* Content */}
                <div className="p-4 space-y-3">
                  {currentUser.role !== 'PROPERTY_OWNER' && p.listingBrokerId === currentUser.id && !isClosed && !(p.protectionUntil && Date.parse(p.protectionUntil) > Date.now()) && (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs" data-testid={`approval-${p.id}`}>
                      <span className="font-semibold text-amber-900">{tx('Owner approval pending — no bypass protection yet', 'मालिक की अप्रूवल बाकी — अभी बायपास सुरक्षा नहीं')}</span>
                      <button type="button" disabled={approvalBusy === p.id} onClick={() => openOwnerApproval(p.id)} className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-50">{tx('Send to owner', 'मालिक को भेजें')}</button>
                    </div>
                  )}
                  {isClosed && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800" role="status">{p.listingStatus === 'rented' ? tx('This property is rented out — no more offers or visits.', 'यह प्रॉपर्टी किराये पर जा चुकी है — अब ऑफ़र या विज़िट नहीं।') : tx('This property is sold — no more offers or visits.', 'यह प्रॉपर्टी बिक चुकी है — अब ऑफ़र या विज़िट नहीं।')}</div>}
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span>{label('propertyType', p.propertyType)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-slate-800">{p.locality}, {p.city}{p.state ? ` (${p.state})` : ''}{p.pincode ? ` – ${p.pincode}` : ''}</span>
                      <span aria-hidden="true">·</span>
                      <span>{label('transactionType', p.transactionType)}</span>
                    </div>
                    <h3 className="mt-1 text-sm font-bold text-slate-900 line-clamp-1">{p.title}</h3>
                    <p className="mt-1 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {p.description}
                    </p>
                    {p.tags && p.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {p.tags.slice(0, 6).map((t) => (
                          <button key={t} type="button" onClick={() => setSelectedTag(t)} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-200">{label('tag', t)}</button>
                        ))}
                        {p.tags.length > 6 && <span className="text-[10px] text-slate-400">+{p.tags.length - 6}</span>}
                      </div>
                    )}
                  </div>

                  {/* Financial & Dimensions */}
                  <div className="rounded-lg bg-slate-50 p-2.5 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">{tx('Asking Price', 'माँगी कीमत')}:</span>
                      <span className="font-bold text-slate-900 text-sm">{formatINR(p.askingPrice)}</span>
                    </div>

                    {/* Owner Approved Net Price Protection — a broker-side concept, so buyers and legal counsel never see the row */}
                    {(isBroker || isOwner || isAdmin) && (
                    <div className="flex items-center justify-between border-t border-slate-200/60 pt-1.5">
                      <span className="text-slate-500 flex items-center gap-1">
                        <Lock className="h-3 w-3 text-slate-400" /> {tx('Owner Net Price', 'मालिक का नेट प्राइस')}:
                      </span>
                      {isOwnerOrAdmin && p.ownerApprovedNetPrice ? (
                        <span className="font-semibold text-purple-900">
                          {formatINR(p.ownerApprovedNetPrice)} {tx('(Confidential)', '(गोपनीय)')}
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-400 italic">
                          {tx('Protected (Authorized mandate only)', 'सुरक्षित (केवल अधिकृत मैंडेट के लिए)')}
                        </span>
                      )}
                    </div>
                    )}

                    <div className="flex items-center justify-between border-t border-slate-200/60 pt-1.5 text-slate-600">
                      <span>{tx('Built-up / Plot Area', 'बिल्ट-अप / प्लॉट क्षेत्रफल')}:</span>
                      <span>{formatArea(p.builtUpAreaSqFt || p.plotAreaSqFt)}</span>
                    </div>
                  </div>

                  {/* Listing Broker Mandate & Trust Score */}
                  {(() => {
                    const listingBroker = users?.find((u) => u.id === p.listingBrokerId);
                    return (
                      <div className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200/80 px-2.5 py-1.5 text-xs">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-[11px] text-slate-500">{tx('Listing Broker', 'लिस्टिंग ब्रोकर')}:</span>
                          <span className="font-semibold text-slate-800 truncate">
                            {listingBroker?.name || p.listingBrokerId}
                          </span>
                        </div>
                        {listingBroker && (
                          <TrustScoreBadge user={listingBroker} variant="minimal" />
                        )}
                      </div>
                    );
                  })()}

                  {/* Anti-Bypass Protected Contact Box */}
                  <div className="rounded-lg border border-slate-200 p-2.5 text-xs text-slate-600 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        {tx('Owner Contact', 'मालिक का संपर्क')}:
                      </span>
                      <span className="font-mono text-slate-800 flex items-center gap-1">
                        <Phone className="h-3 w-3 text-slate-400" />
                        {p.ownerPhone}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate" title={p.addressHidden}>
                      {p.addressHidden}
                    </div>
                  </div>

                  {/* Price revisions history if present */}
                  {p.priceHistory && p.priceHistory.length > 0 && (
                    <button
                      onClick={() => setSelectedPropHistory(p)}
                      className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800"
                    >
                      <History className="h-3 w-3" />
                      <span>{p.priceHistory.length} {tx('price change(s) recorded', 'कीमत बदलाव दर्ज')}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Owner ⇄ listing broker fixed-net-amount mandate */}
              {canSeeMandates && (isMyListing && !isAdmin ? true : isAdmin) && (() => {
                const m = mandateOf(p);
                const label = !m ? (hi ? 'मैंडेट नहीं' : 'No mandate yet')
                  : m.status === 'ACTIVE' ? (hi ? 'मैंडेट सक्रिय' : 'Mandate ACTIVE')
                  : m.status === 'PENDING_BROKER' ? (hi ? 'ब्रोकर के हस्ताक्षर बाकी' : 'Waiting for broker')
                  : m.status === 'REJECTED' ? (hi ? 'ब्रोकर ने अस्वीकार किया' : 'Declined by broker')
                  : m.status;
                const tone = m?.status === 'ACTIVE' ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : m?.status === 'PENDING_BROKER' ? 'text-amber-900 bg-amber-50 border-amber-200' : 'text-slate-700 bg-slate-50 border-slate-200';
                const needsMyAction = (isBroker && p.listingBrokerId === currentUser.id && !p.ownerId && !m) || (isBroker && m?.status === 'PENDING_BROKER' && p.listingBrokerId === currentUser.id) || (isOwner && (!m || m.status !== 'PENDING_BROKER' && m.status !== 'ACTIVE'));
                return (
                  <div className={`mx-4 mb-3 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${tone}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 font-semibold"><FileSignature className="h-3.5 w-3.5" />{hi ? 'ब्रोकरेज मैंडेट (नेट / कमीशन / फिक्स्ड)' : 'Brokerage Mandate (net / commission / fixed)'}</div>
                      <div className="truncate text-[11px] opacity-80">{label}{m && m.status !== 'REJECTED' ? ` · ${m.remunerationBasis === 'PERCENTAGE' ? `${m.agreedCommissionPct}% ${hi ? 'कमीशन' : 'commission'}` : m.remunerationBasis === 'FIXED_FEE' ? `${formatINR(m.fixedFeeAmount || 0)} ${hi ? 'फिक्स्ड' : 'fixed fee'}` : `${formatINR(m.approvedNetPrice)} ${hi ? 'नेट' : 'net'}`}` : ''}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMandateFor(p)}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold ${needsMyAction ? 'bg-slate-900 text-white hover:bg-slate-800' : 'border border-current/30 bg-white/70 hover:bg-white'}`}
                    >
                      {isOwner ? (m?.status === 'ACTIVE' ? (hi ? 'देखें / बदलें' : 'View / revise') : (hi ? 'ब्रोकरेज तय करें' : 'Set brokerage terms')) : (m?.status === 'PENDING_BROKER' && isBroker ? (hi ? 'समीक्षा और हस्ताक्षर' : 'Review & sign') : (isBroker && !m && !p.ownerId ? (hi ? 'ब्रोकरेज तय करें' : 'Set brokerage') : (hi ? 'देखें' : 'View')))}
                    </button>
                  </div>
                );
              })()}

              {/* Action Buttons */}
              <div className="p-4 pt-0 border-t border-slate-100 flex flex-wrap items-center gap-2">
                {canEditListing && !isClosed && (
                  <button
                    onClick={() => setEditingProperty(p)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs font-bold transition-colors shadow-2xs"
                    title={tx('Edit listing details, price, photos gallery, video tour, or status', 'लिस्टिंग का विवरण, कीमत, फ़ोटो, वीडियो या स्टेटस बदलें')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span>{tx('Edit Listing', 'लिस्टिंग एडिट करें')}</span>
                  </button>
                )}
                {may('matching:run') && !isBuyer && !isClosed && (
                <button
                  onClick={() => onSelectPropertyForMatching(p)}
                  className="flex-1 min-w-[90px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  <span>{tx('Find Matches', 'मैच खोजें')}</span>
                </button>
                )}
                {!isMyListing && !isOwner && !isClosed && isBroker && may('collab:propose') && (
                  <button
                    onClick={() => onProposeCollaboration(p)}
                    className="flex-1 min-w-[90px] inline-flex items-center justify-center gap-1 rounded-lg bg-slate-900 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
                  >
                    <span>{tx('Propose Split', 'स्प्लिट प्रस्ताव')}</span>
                  </button>
                )}
                {onScheduleVisit && !isClosed && may('sitevisit:create') && (
                  <button
                    onClick={() => onScheduleVisit(p)}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50/70 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors"
                    title={tx('Schedule verified site visit with client OTP anti-bypass protection', 'क्लाइंट OTP एंटी-बायपास सुरक्षा के साथ वेरिफ़ाइड साइट विज़िट तय करें')}
                  >
                    <Clock className="h-3.5 w-3.5 text-emerald-600" />
                    <span>{tx('Schedule Visit', 'विज़िट तय करें')}</span>
                  </button>
                )}
                {may('propdoc:use') && (p.ownerId === currentUser.id || p.listingBrokerId === currentUser.id) && (
                <button
                  onClick={() => { openPapersFor(p.id); window.location.href = '/?tab=propdocs'; }}
                  title={tx('Keep and search this property’s papers (registry, khasra, map…)', 'इस प्रॉपर्टी के कागज़ (रजिस्ट्री, खसरा, नक्शा…) रखें और खोजें')}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-amber-300 bg-amber-50/70 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-amber-700" />
                  <span>{tx('Papers', 'कागज़')}</span>
                </button>
                )}
                {may('dd:read') && (isMyListing || isAdmin || currentUser.role === 'LEGAL_COUNSEL') && (
                <button
                  onClick={() => {
                    window.location.href = `/?tab=due_diligence&propertyId=${p.id}`;
                  }}
                  title={tx('Launch or audit title due diligence', 'टाइटल ड्यू डिलिजेंस शुरू करें या जाँचें')}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-blue-300 bg-blue-50/60 px-2.5 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 transition-colors"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                  <span>{tx('Due Diligence', 'ड्यू डिलिजेंस')}</span>
                </button>
                )}
                <a
                  href={getPropertyWhatsAppShareUrl(p)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={tx('Quick Share on WhatsApp with verified deep link', 'वेरिफ़ाइड लिंक के साथ WhatsApp पर झटपट शेयर करें')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 hover:border-emerald-500 transition-colors shadow-2xs"
                >
                  <Share2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>{tx('Quick Share', 'झटपट शेयर')}</span>
                </a>
              </div>
            </div>
          );
        })}
      </div>
    )}

      {/* v20: draw more cards / fetch the next page */}
      {(shownList.length > visibleCount || remote?.hasMore) && (
        <div className="flex justify-center">
          <button type="button" disabled={remote?.loading}
            onClick={() => { if (shownList.length > visibleCount) setVisibleCount(v => v + 30); else fetchRemote(true); }}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 disabled:opacity-50">
            {remote?.loading ? tx('Loading…', 'लोड हो रहा है…') : tx('Show more properties', 'और प्रॉपर्टी दिखाएँ')}
          </button>
        </div>
      )}

      {/* Price History Modal */}
      {selectedPropHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">{tx('Price Revision Audit Log', 'कीमत बदलाव का ऑडिट लॉग')}</h3>
              <button
                onClick={() => setSelectedPropHistory(null)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                ✕ {tx('Close', 'बंद करें')}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500 font-mono">{selectedPropHistory.id}: {selectedPropHistory.title}</p>

            <div className="mt-4 space-y-2">
              {selectedPropHistory.priceHistory.map((item, idx) => (
                <div key={idx} className="rounded-lg bg-slate-50 p-2.5 text-xs">
                  <div className="flex justify-between font-semibold text-slate-900">
                    <span>{formatINR(item.price)}</span>
                    <span className="text-slate-500 text-[11px] font-normal">{new Date(item.changedAt).toLocaleDateString('en-IN')}</span>
                  </div>
                  <div className="text-slate-600 text-[11px] mt-0.5">{item.reason}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {mandateFor && (
        <MandateModal
          property={mandateFor}
          mandates={mandates}
          currentUser={currentUser}
          brokers={(users || []).filter((u) => u.role === 'BROKER')}
          onClose={() => setMandateFor(null)}
          onChanged={() => onPropertyUpdated?.()}
          onOpenDrafts={(id) => { setMandateFor(null); setDraftOpenId(id); setShowDrafts(true); }}
        />
      )}

      {/* Edit Property Modal */}
      {editingProperty && (
        <EditPropertyModal
          isOpen={Boolean(editingProperty)}
          property={editingProperty}
          currentUser={currentUser}
          onClose={() => setEditingProperty(null)}
          onSuccess={() => {
            setEditingProperty(null);
            if (onPropertyUpdated) {
              onPropertyUpdated();
            }
          }}
        />
      )}
    </div>
  );
};
