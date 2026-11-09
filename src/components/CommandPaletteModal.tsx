import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ArrowRight, CornerDownLeft, Sparkles, Building, UserCheck, Briefcase, PlusCircle, ShieldCheck } from 'lucide-react';
import type { TabType } from './NavigationTabs.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { UserProfile } from '../types/index.js';

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (tab: TabType) => void;
  allTabs: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }>;
  currentUser?: UserProfile;
  onOpenAddProperty?: () => void;
  onOpenAddRequirement?: () => void;
  onOpenAddLead?: () => void;
  onOpenBrokerQrModal?: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  onNavigate,
  allTabs,
  currentUser,
  onOpenAddProperty,
  onOpenAddRequirement,
  onOpenAddLead,
  onOpenBrokerQrModal,
}) => {
  const tx = useTx();
  const { lang } = useI18n();
  const [q, setQ] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Quick action commands based on user role
  const quickActions = useMemo(() => {
    const list: Array<{ id: string; title: string; subtitle: string; icon: any; action: () => void }> = [];
    if (onOpenAddProperty) {
      list.push({
        id: 'action-add-prop',
        title: tx('Add New Property', 'नई प्रॉपर्टी जोड़ें'),
        subtitle: tx('List a flat, plot, house or commercial space', 'फ्लैट, प्लॉट, घर या दुकान लिस्ट करें'),
        icon: PlusCircle,
        action: () => { onClose(); onOpenAddProperty(); },
      });
    }
    if (onOpenAddRequirement) {
      list.push({
        id: 'action-add-req',
        title: tx('Post Buyer Requirement', 'खरीदार की ज़रूरत दर्ज करें'),
        subtitle: tx('Find matching inventory across broker network', 'नेटवर्क में मैचिंग इन्वेंटरी खोजें'),
        icon: UserCheck,
        action: () => { onClose(); onOpenAddRequirement(); },
      });
    }
    if (onOpenAddLead && currentUser?.role === 'DEVELOPER_BUILDER') {
      list.push({
        id: 'action-add-lead',
        title: tx('Register CRM Lead', 'CRM लीड दर्ज करें'),
        subtitle: tx('Add buyer lead to project pipeline', 'प्रोजेक्ट पाइपलाइन में खरीदार जोड़ें'),
        icon: UserCheck,
        action: () => { onClose(); onOpenAddLead(); },
      });
    }
    if (onOpenBrokerQrModal) {
      list.push({
        id: 'action-qr',
        title: tx('Show My Broker Card / Scan QR', 'मेरा ब्रोकर कार्ड / QR स्कैन'),
        subtitle: tx('Site visit QR check-in & verified identity', 'विज़िट QR चेक-इन और पहचान'),
        icon: ShieldCheck,
        action: () => { onClose(); onOpenBrokerQrModal(); },
      });
    }
    return list;
  }, [tx, currentUser, onOpenAddProperty, onOpenAddRequirement, onOpenAddLead, onOpenBrokerQrModal, onClose]);

  // Filtered screens
  const filteredTabs = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return allTabs;
    return allTabs.filter(t => t.label.toLowerCase().includes(term) || t.id.toLowerCase().includes(term));
  }, [allTabs, q]);

  const totalItems = quickActions.length + filteredTabs.length;

  useEffect(() => {
    if (open) {
      setQ('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard navigation (Arrow keys + Enter + Escape)
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(prev => (prev + 1) % Math.max(1, totalItems));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(prev => (prev - 1 + totalItems) % Math.max(1, totalItems));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIdx < quickActions.length) {
          quickActions[selectedIdx].action();
        } else {
          const tab = filteredTabs[selectedIdx - quickActions.length];
          if (tab) {
            onClose();
            onNavigate(tab.id as TabType);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, selectedIdx, totalItems, quickActions, filteredTabs, onClose, onNavigate]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 pt-16 sm:p-6 sm:pt-24 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={tx('Command palette', 'कमांड पैलेट')}
      >
        {/* Search header */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 bg-slate-50/60">
          <Search className="h-5 w-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={e => { setQ(e.target.value); setSelectedIdx(0); }}
            placeholder={tx('Search 40+ screens, actions, tools… (or type to jump)', '40+ स्क्रीन, काम और टूल्स खोजें…')}
            className="flex-1 bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} className="rounded p-1 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-block rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 shadow-xs">ESC</kbd>
        </div>

        {/* Results list */}
        <div className="max-h-[60vh] overflow-y-auto p-2 scrollbar-thin">
          {/* Quick actions (shown when not deeply searching) */}
          {!q && quickActions.length > 0 && (
            <div className="mb-2">
              <p className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {tx('Quick Actions', 'त्वरित काम')}
              </p>
              <div className="space-y-1">
                {quickActions.map((action, idx) => {
                  const Icon = action.icon;
                  const isSel = selectedIdx === idx;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={action.action}
                      onMouseEnter={() => setSelectedIdx(idx)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                        isSel ? 'bg-amber-50 text-slate-900 ring-1 ring-amber-300' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isSel ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold leading-tight">{action.title}</p>
                          <p className="text-[11px] text-slate-500 truncate">{action.subtitle}</p>
                        </div>
                      </div>
                      <span className="flex items-center text-[11px] font-semibold text-slate-400">
                        <CornerDownLeft className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Screens section */}
          <div>
            <p className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {q ? tx(`Matching Screens (${filteredTabs.length})`, `मैचिंग स्क्रीन (${filteredTabs.length})`) : tx('All Screens & Portals', 'सभी स्क्रीन और पोर्टल')}
            </p>
            {filteredTabs.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                {tx('No matching screens found', 'कोई मैचिंग स्क्रीन नहीं मिली')}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredTabs.map((tab, tIdx) => {
                  const idx = quickActions.length + tIdx;
                  const Icon = tab.icon;
                  const isSel = selectedIdx === (q ? tIdx : idx);
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => { onClose(); onNavigate(tab.id as TabType); }}
                      onMouseEnter={() => setSelectedIdx(q ? tIdx : idx)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                        isSel ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100/80'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon className={`h-4 w-4 shrink-0 ${isSel ? 'text-amber-400' : 'text-slate-500'}`} />
                        <span className="text-xs font-semibold truncate">{tab.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {Boolean(tab.badge && tab.badge > 0) && (
                          <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${isSel ? 'bg-amber-400 text-slate-950' : 'bg-red-500 text-white'}`}>
                            {tab.badge}
                          </span>
                        )}
                        <ArrowRight className={`h-3.5 w-3.5 opacity-60 ${isSel ? 'text-amber-300 opacity-100' : ''}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-4 py-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold">↑</kbd><kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold">↓</kbd> {tx('Navigate', 'चुनें')}</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold">↵</kbd> {tx('Open', 'खोलें')}</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium">GENZ Smart Navigator</span>
        </div>
      </div>
    </div>
  );
};

