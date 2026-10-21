import React, { useState } from 'react';
import { PlatformActivityEvent, ActivityEventType, UserProfile } from '../types/index.js';
import { formatINR } from '../lib/utils.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { localizeActivity } from '../lib/activityHi.js';
import {
  Activity,
  Building2,
  Handshake,
  CheckCircle2,
  Calendar,
  Award,
  Filter,
  ExternalLink,
  Clock,
  Sparkles,
  MapPin,
  RefreshCw,
} from 'lucide-react';

interface ActivityFeedProps {
  activities: PlatformActivityEvent[];
  currentUser: UserProfile;
  isLoading?: boolean;
  onRefresh?: () => void;
  onNavigate?: (tab: any) => void;
  maxItems?: number;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  activities,
  currentUser,
  isLoading = false,
  onRefresh,
  onNavigate,
  maxItems = 10,
}) => {
  const tx = useTx();
  const { lang } = useI18n();
  const label = useLabel();
  const [filterType, setFilterType] = useState<string>('ALL');

  // Filter options
  const filterOptions = [
    { id: 'ALL', label: tx('All Activity', 'सारी गतिविधि') },
    { id: 'PROPERTIES', label: tx('New Listings', 'नई लिस्टिंग') },
    { id: 'DEALS', label: tx('Deal Rooms', 'डील रूम') },
    { id: 'VISITS', label: tx('Site Visits', 'साइट विज़िट') },
  ];

  const filteredActivities = activities.filter((act) => {
    if (filterType === 'ALL') return true;
    if (filterType === 'PROPERTIES') return act.type === 'PROPERTY_LISTED' || act.type === 'PROPERTY_UPDATED';
    if (filterType === 'DEALS') return act.type === 'DEAL_ROOM_CREATED' || act.type === 'DEAL_STAGE_ADVANCED';
    if (filterType === 'VISITS') return act.type === 'SITE_VISIT_SCHEDULED' || act.type === 'SITE_VISIT_VERIFIED';
    return true;
  });

  const displayedActivities = filteredActivities.slice(0, maxItems);

  // Helper for human-readable relative time
  const getRelativeTime = (timestamp: string) => {
    const now = new Date().getTime();
    const then = new Date(timestamp).getTime();
    const diffSec = Math.floor((now - then) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    const days = Math.floor(diffSec / 86400);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  // Icon & styling selector per event type
  const getEventBadge = (type: ActivityEventType) => {
    switch (type) {
      case 'PROPERTY_LISTED':
      case 'PROPERTY_UPDATED':
        return {
          icon: <Building2 className="h-4 w-4 text-emerald-600" />,
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          dotBg: 'bg-emerald-500',
          tag: 'Listing',
        };
      case 'DEAL_ROOM_CREATED':
      case 'DEAL_STAGE_ADVANCED':
        return {
          icon: <Handshake className="h-4 w-4 text-blue-600" />,
          bg: 'bg-blue-50 text-blue-800 border-blue-200',
          dotBg: 'bg-blue-500',
          tag: 'Deal Room',
        };
      case 'SITE_VISIT_VERIFIED':
        return {
          icon: <CheckCircle2 className="h-4 w-4 text-amber-600" />,
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          dotBg: 'bg-amber-500',
          tag: 'Verified Visit',
        };
      case 'SITE_VISIT_SCHEDULED':
        return {
          icon: <Calendar className="h-4 w-4 text-indigo-600" />,
          bg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
          dotBg: 'bg-indigo-500',
          tag: 'Visit Scheduled',
        };
      case 'MANDATE_APPOINTED':
        return {
          icon: <Award className="h-4 w-4 text-purple-600" />,
          bg: 'bg-purple-50 text-purple-800 border-purple-200',
          dotBg: 'bg-purple-500',
          tag: 'Mandate',
        };
      default:
        return {
          icon: <Activity className="h-4 w-4 text-slate-600" />,
          bg: 'bg-slate-50 text-slate-800 border-slate-200',
          dotBg: 'bg-slate-500',
          tag: 'Event',
        };
    }
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-amber-400">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">{tx('Exchange Activity Feed', 'एक्सचेंज गतिविधि फ़ीड')}</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {tx('Live Network', 'लाइव नेटवर्क')}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {tx('Recent property listings, deal room progress, and verified site inspections across the network', 'नेटवर्क में हाल की लिस्टिंग, डील रूम की प्रगति और वेरिफ़ाइड साइट विज़िट')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              title={tx('Refresh Activity Feed', 'फ़ीड रिफ़्रेश करें')}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{tx('Refresh', 'रिफ़्रेश')}</span>
            </button>
          )}

          {onNavigate && (
            <button
              onClick={() => onNavigate('audit')}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              {tx('Audit Trail', 'ऑडिट ट्रेल')}
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 pt-3 pb-3 overflow-x-auto scrollbar-none">
        <span className="text-xs font-medium text-slate-400 mr-1 flex items-center gap-1">
          <Filter className="h-3 w-3" /> Filter:
        </span>
        {filterOptions.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setFilterType(opt.id)}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors ${
              filterType === opt.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Activity Timeline List */}
      <div className="mt-2 divide-y divide-slate-100">
        {displayedActivities.length === 0 ? (
          <div className="py-8 text-center">
            <Activity className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-xs font-semibold text-slate-700">{tx('No activity events match this filter', 'इस फ़िल्टर में कोई गतिविधि नहीं')}</p>
            <p className="text-[11px] text-slate-400">{tx('Events will appear here as users list properties and verify site visits.', 'जैसे-जैसे लोग प्रॉपर्टी लिस्ट करेंगे और साइट विज़िट वेरिफ़ाई करेंगे, घटनाएँ यहाँ दिखेंगी।')}</p>
          </div>
        ) : (
          displayedActivities.map((act) => {
            const badge = getEventBadge(act.type);
            const loc = localizeActivity(act, lang, label as any);
            return (
              <div
                key={act.id}
                className="group flex flex-col sm:flex-row sm:items-start justify-between gap-3 py-3.5 transition-colors hover:bg-slate-50/70 rounded-lg px-2 -mx-2"
              >
                <div className="flex items-start gap-3">
                  {/* Category Icon Badge */}
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${badge.bg}`}>
                    {badge.icon}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold border ${badge.bg}`}>
                        <span className={`h-1 w-1 rounded-full ${badge.dotBg}`} />
                        {badge.tag}
                      </span>
                      <h4 className="text-xs font-bold text-slate-900 group-hover:text-amber-900 transition-colors">
                        {loc.title}
                      </h4>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      {loc.description}
                    </p>

                    {/* Metadata chips */}
                    <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-slate-500">
                      <span className="font-medium text-slate-700">{act.actorName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {getRelativeTime(act.timestamp)}
                      </span>

                      {act.metadata?.locality && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="flex items-center gap-1 text-slate-600 font-medium">
                            <MapPin className="h-3 w-3 text-slate-400" />
                            {act.metadata.locality}
                          </span>
                        </>
                      )}

                      {act.metadata?.price && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-emerald-700">
                            {formatINR(act.metadata.price)}
                          </span>
                        </>
                      )}

                      {act.metadata?.stage && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-800">
                            {tx('Stage', 'स्टेज')}: {label('dealStage', act.metadata.stage)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Direct Action Link */}
                {act.targetTab && onNavigate && (
                  <button
                    onClick={() => onNavigate(act.targetTab)}
                    className="self-start sm:self-center shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-slate-800 hover:text-amber-700 bg-slate-50 hover:bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 transition-colors"
                  >
                    <span>{act.targetTab === 'properties' ? tx('View Listing', 'लिस्टिंग देखें') : act.targetTab === 'deals' ? tx('View Deal', 'डील देखें') : tx('View Details', 'विवरण देखें')}</span>
                    <ExternalLink className="h-3 w-3 text-slate-500" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer count indicator */}
      {displayedActivities.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>{tx(`Showing ${displayedActivities.length} of ${filteredActivities.length} platform events`, `${filteredActivities.length} में से ${displayedActivities.length} प्लेटफ़ॉर्म इवेंट दिख रहे हैं`)}</span>
          {onNavigate && (
            <button
              onClick={() => onNavigate('audit')}
              className="font-semibold text-slate-900 hover:text-amber-700 hover:underline"
            >
              {tx('View full cryptographic audit chain →', 'पूरी क्रिप्टोग्राफ़िक ऑडिट चेन देखें →')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
