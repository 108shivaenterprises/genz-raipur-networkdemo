import React from 'react';
import { UserProfile } from '../types/index.js';
import { ShieldCheck, Building2, MapPin, CheckCircle2, AlertTriangle, Users, QrCode } from 'lucide-react';
import { TrustScoreBadge } from './TrustScoreBadge.js';
import { LangToggle, useI18n, useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';

interface NavbarProps {
  currentUser: UserProfile;
  users: UserProfile[];
  canViewAs?: boolean;
  onViewAs?: (userId: string) => void;
  onLogout: () => void;
  onOpenPrivacy?: () => void;
  onOpenInviteModal?: () => void;
  onOpenBrokerQrModal?: () => void;
  onOpenBrokerSafetyModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  users,
  canViewAs,
  onViewAs,
  onLogout,
  onOpenPrivacy,
  onOpenBrokerQrModal,
  onOpenBrokerSafetyModal,
}) => {
  const { t } = useI18n();
  const tx = useTx();
  const label = useLabel();
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-y-2 px-4 py-2.5 sm:px-6 sm:py-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-amber-400 font-bold tracking-wider shadow-sm">
            GZ
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-slate-900 sm:text-base">
                GENZ BROKER NETWORK
              </span>
              <span className="hidden rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-700 border border-amber-200/60 sm:inline-block">
                PAN-INDIA
              </span>
            </div>
            <div className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex">
              <span>{tx('Powered by GENZ BUILDCON', 'GENZ BUILDCON द्वारा संचालित')}</span>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-0.5 text-slate-600">
                <MapPin className="h-3 w-3 text-slate-400" /> {tx('India', 'भारत')}
              </span>
            </div>
          </div>
        </div>

        {/* User Role Switcher & Profile Details */}
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:gap-3">
          {/* Quick Broker QR Card Button */}
          {onOpenBrokerQrModal && (
            <button
              onClick={onOpenBrokerQrModal}
              title={tx('View & share verified digital broker identity card with QR code', 'वेरिफ़ाइड डिजिटल ब्रोकर आइडी कार्ड QR के साथ देखें और शेयर करें')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50/90 hover:bg-blue-100 px-2.5 py-1.5 text-xs font-bold text-blue-800 transition-colors shadow-2xs"
            >
              <QrCode className="h-3.5 w-3.5 text-blue-600" />
              <span className="hidden sm:inline">{tx('Broker QR Card', 'ब्रोकर QR कार्ड')}</span>
              <span className="sm:hidden">QR</span>
            </button>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="hidden text-xs font-semibold text-slate-800 lg:inline">
              {currentUser.name} <span className="font-normal text-slate-500">· {label('role', currentUser.role)}</span>
            </span>
            {canViewAs && onViewAs && (
              <div className="relative">
                <select
                  aria-label={tx('View as another user (read-only)', 'किसी दूसरे यूज़र की तरह देखें (सिर्फ़ देखने के लिए)')}
                  value=""
                  onChange={(e) => e.target.value && onViewAs(e.target.value)}
                  className="max-w-[150px] cursor-pointer appearance-none rounded-lg border border-slate-300 bg-white pl-3 pr-8 py-1.5 text-xs font-medium text-slate-800 shadow-sm hover:border-slate-400 focus:border-slate-900 focus:outline-none"
                >
                  <option value="">{tx('View as… (read-only)', 'ऐसे देखें… (सिर्फ़ देखना)')}</option>
                  {users.filter((u) => u.id !== currentUser.id).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} — {label('role', u.role)}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                  <Users className="h-3.5 w-3.5" />
                </div>
              </div>
            )}

            {/* Current Broker Trust Badge */}
            {currentUser.role === 'BROKER' && (
              <div className="hidden sm:block">
                <TrustScoreBadge user={currentUser} variant="compact" />
              </div>
            )}

            {/* Verification Badge */}
            <div className="hidden md:flex items-center gap-1.5 text-xs">
              {currentUser.verificationStatus === 'VERIFIED' ? (
                <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  {currentUser.brokerId || tx('Verified', 'सत्यापित')}
                </span>
              ) : currentUser.verificationStatus === 'BLACKLISTED' ? (
                <span className="inline-flex items-center gap-1 font-medium text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                  {tx('Blacklisted', 'ब्लैकलिस्ट')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                  <Building2 className="h-3.5 w-3.5 text-amber-600" />
                  {tx('Pending Review', 'जाँच बाकी')}
                </span>
              )}
            </div>

            <LangToggle />
            {onOpenPrivacy && (
              <button onClick={onOpenPrivacy} className="inline-flex rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-slate-900">{t('common.myData', 'My data')}</button>
            )}
            <button
              onClick={onLogout}
              title={tx(`Signed in as ${currentUser.name}`, `${currentUser.name} के रूप में साइन इन`)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
            >
              <span>{t('common.signOut', 'Sign out')}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
