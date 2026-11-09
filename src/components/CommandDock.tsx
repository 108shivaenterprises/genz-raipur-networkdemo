import React, { useState } from 'react';
import { Plus, Search, ShieldCheck, QrCode, PhoneCall, Sparkles, X, ChevronUp, MessageSquare, Zap, Calculator } from 'lucide-react';
import { useTx } from '../lib/i18n.js';
import type { UserProfile } from '../types/index.js';
import type { TabType } from './NavigationTabs.js';

interface CommandDockProps {
  currentUser: UserProfile;
  onNavigate: (tab: TabType) => void;
  onOpenCommandPalette: () => void;
  onOpenAddProperty?: () => void;
  onOpenAddRequirement?: () => void;
  onOpenAddLead?: () => void;
  onOpenQuickScan?: () => void;
  onOpenCostSheet?: () => void;
}

export function CommandDock({
  currentUser,
  onNavigate,
  onOpenCommandPalette,
  onOpenAddProperty,
  onOpenAddRequirement,
  onOpenAddLead,
  onOpenQuickScan,
  onOpenCostSheet,
}: CommandDockProps) {
  const [open, setOpen] = useState(false);
  const t = useTx();

  const isBroker = currentUser.role === 'BROKER';
  const isBuilder = currentUser.role === 'DEVELOPER_BUILDER';
  const isAdmin = currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN';

  return (
    <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40 flex flex-col items-end gap-2 select-none">
      {/* Expanded Quick Action Wheel / Speed Dial */}
      {open && (
        <div className="flex flex-col items-end gap-2.5 mb-2 animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* 1. Spotlight Search */}
          <button
            onClick={() => {
              setOpen(false);
              onOpenCommandPalette();
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 rounded-full shadow-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-xs font-semibold group"
          >
            <span>
              {t('Search Everything (⌘K)', 'सब खोजें (⌘K)')}
            </span>
            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200">
              <Search className="w-4 h-4" />
            </div>
          </button>

          {/* 2. Magic Match */}
          <button
            onClick={() => {
              setOpen(false);
              onNavigate('matches');
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full shadow-lg hover:brightness-105 transition-all text-xs font-semibold group"
          >
            <span>
              {t('Magic Match Engine', 'मैजिक मैच इंजन')}
            </span>
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
              <Sparkles className="w-4 h-4" />
            </div>
          </button>

          {/* 3. Register Lead / Demand */}
          {(isBroker || isBuilder || isAdmin) && onOpenAddLead && (
            <button
              onClick={() => {
                setOpen(false);
                onOpenAddLead();
              }}
              className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all text-xs font-semibold group"
            >
              <span>
                {t('Register Client Lead', 'क्लाइंट लीड दर्ज करें')}
              </span>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
                <Plus className="w-4 h-4" />
              </div>
            </button>
          )}

          {/* 4. Quick Scan / Digital Pass */}
          {onOpenQuickScan && (
            <button
              onClick={() => {
                setOpen(false);
                onOpenQuickScan();
              }}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 text-white rounded-full shadow-lg hover:bg-emerald-700 transition-all text-xs font-semibold group"
            >
              <span>
                {t('Site Visit QR Pass', 'साइट विज़िट QR पास')}
              </span>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
                <QrCode className="w-4 h-4" />
              </div>
            </button>
          )}

          {/* Quick Cost Sheet Generator */}
          {onOpenCostSheet && (
            <button
              onClick={() => {
                setOpen(false);
                onOpenCostSheet();
              }}
              className="flex items-center gap-2 px-3.5 py-2 bg-teal-600 text-white rounded-full shadow-lg hover:bg-teal-700 transition-all text-xs font-semibold group"
            >
              <span>
                {t('Property Cost Sheet', 'प्रॉपर्टी कॉस्ट शीट')}
              </span>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
                <Calculator className="w-4 h-4" />
              </div>
            </button>
          )}

          {/* 5. Anti-Bypass Protected Deals */}
          <button
            onClick={() => {
              setOpen(false);
              onNavigate('deals');
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-all text-xs font-semibold group"
          >
            <span>
              {t('Protected Deal Rooms', 'डील रूम्स')}
            </span>
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </button>
        </div>
      )}

      {/* Main Floating Trigger Button */}
      <button
        onClick={() => setOpen(!open)}
        aria-label="Speed Dial Actions"
        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 transform active:scale-95 ${
          open
            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 rotate-90'
            : 'bg-gradient-to-tr from-indigo-600 via-blue-600 to-indigo-700 text-white hover:shadow-indigo-500/30'
        }`}
      >
        {open ? <X className="w-6 h-6" /> : <Zap className="w-6 h-6 fill-white" />}
      </button>
    </div>
  );
}

