import React, { useState } from 'react';
import { UserProfile } from '../types/index.js';
import { CheckCircle2, AlertTriangle, Building2, Users, QrCode, ScanLine, MessageCircle, LogOut, ShieldCheck, ChevronDown } from 'lucide-react';
import { TrustScoreBadge } from './TrustScoreBadge.js';
import { LangToggle, useI18n, useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { BrandMark } from './BrandMark.js';
import { NotificationBell } from './NotificationBell.js';

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
  /** v45: roles that verify visits but have no broker card (owner, builder team) get a Scan button */
  onOpenScan?: () => void;
  /** v50: the chat icon (only for people who have chats) and the number of unread messages on it */
  onOpenChats?: () => void;
  chatCount?: number;
}

const initialsOf = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

/**
 * v50 — one slim row on every screen: the logo, [chat] [QR / scan] and a profile button.
 * Language, "My data", the verification status and "Sign out" live inside the profile menu instead of four buttons on a second row.
 */
export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  users,
  canViewAs,
  onViewAs,
  onLogout,
  onOpenPrivacy,
  onOpenBrokerQrModal,
  onOpenScan,
  onOpenChats,
  chatCount = 0,
}) => {
  const { t } = useI18n();
  const tx = useTx();
  const label = useLabel();
  const [menu, setMenu] = useState(false);
  const status = currentUser.verificationStatus;
  const iconBtn = 'relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-slate-700 transition-colors';
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:px-6">
        {/* Brand */}
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark className="h-10 w-10" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-base font-bold tracking-tight text-slate-900 sm:text-lg"><span className="sm:hidden">GENZ</span><span className="hidden sm:inline">GENZ BROKER NETWORK</span></div>
            <div className="truncate text-[11px] text-slate-500 sm:text-xs"><span className="sm:hidden">{tx('Broker Network', 'ब्रोकर नेटवर्क')}</span><span className="hidden sm:inline">{tx('Powered by GENZ BUILDCON', 'GENZ BUILDCON द्वारा संचालित')}</span></div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* v77 — the notification bell: every role, every alert in one list, with Clear all */}
          <NotificationBell />
          {onOpenChats && (
            <button type="button" onClick={onOpenChats} data-testid="header-chat" aria-label={chatCount > 0 ? tx(`Chats — ${chatCount} new`, `चैट — ${chatCount} नए`) : tx('Chats', 'चैट')} title={tx('Chats', 'चैट')} className={`${iconBtn} border-slate-200 bg-white hover:border-slate-900`}>
              <MessageCircle className="h-5 w-5" />
              {chatCount > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[11px] font-bold text-white" data-testid="header-chat-badge">{chatCount > 99 ? '99+' : chatCount}</span>}
            </button>
          )}
          {onOpenBrokerQrModal && (
            <button type="button" onClick={onOpenBrokerQrModal} data-testid="header-qr" aria-label={tx('QR · Scan / Card', 'QR · स्कैन / कार्ड')}
              title={tx('Scan a visit QR, or show your broker QR card', 'विज़िट QR स्कैन करें, या अपना ब्रोकर QR कार्ड दिखाएँ')}
              className={`${iconBtn} border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 sm:w-auto sm:gap-1.5 sm:px-3.5 sm:text-sm sm:font-bold`}>
              <QrCode className="h-5 w-5 text-blue-600" /><span className="hidden sm:inline">{tx('QR · Scan / Card', 'QR · स्कैन / कार्ड')}</span>
            </button>
          )}
          {!onOpenBrokerQrModal && onOpenScan && (
            <button type="button" onClick={onOpenScan} data-testid="header-scan" aria-label={tx('Scan', 'स्कैन')} title={tx('Scan a visit QR at the property', 'प्रॉपर्टी पर विज़िट QR स्कैन करें')}
              className={`${iconBtn} border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 sm:w-auto sm:gap-1.5 sm:px-3.5 sm:text-sm sm:font-bold`}>
              <ScanLine className="h-5 w-5 text-blue-600" /><span className="hidden sm:inline">{tx('Scan', 'स्कैन')}</span>
            </button>
          )}

          {/* Profile menu */}
          <div className="relative">
            <button type="button" onClick={() => setMenu(m => !m)} aria-expanded={menu} aria-haspopup="menu" aria-label={tx('Profile and settings', 'प्रोफ़ाइल और सेटिंग')} data-testid="header-profile"
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white pl-1 pr-1 hover:border-slate-900 lg:pr-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-amber-400">{initialsOf(currentUser.name)}</span>
              <span className="hidden max-w-[10rem] truncate text-sm font-semibold text-slate-800 lg:inline">{currentUser.name}</span>
              <ChevronDown className="hidden h-4 w-4 text-slate-400 lg:block" aria-hidden />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-13 z-50 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl" role="menu" data-testid="profile-menu">
                  <div className="px-3 pb-2 pt-1.5">
                    <div className="truncate text-base font-bold text-slate-900">{currentUser.name}</div>
                    <div className="text-xs text-slate-500">{label('role', currentUser.role)}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                      {status === 'VERIFIED' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{currentUser.brokerId || tx('Verified', 'सत्यापित')}</span>
                      ) : status === 'BLACKLISTED' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-red-700"><AlertTriangle className="h-3.5 w-3.5" />{tx('Blacklisted', 'ब्लैकलिस्ट')}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><Building2 className="h-3.5 w-3.5" />{tx('Pending Review', 'जाँच बाकी')}</span>
                      )}
                      {currentUser.role === 'BROKER' && <TrustScoreBadge user={currentUser} variant="compact" />}
                    </div>
                  </div>
                  <div className="my-1 border-t border-slate-100" />
                  <div className="flex min-h-11 items-center justify-between gap-2 px-3">
                    <span className="text-sm font-semibold text-slate-700">{t('common.language', 'Language')}</span>
                    <LangToggle className="min-h-9 px-3" />
                  </div>
                  {onOpenPrivacy && (
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); onOpenPrivacy(); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50" data-testid="menu-mydata"><ShieldCheck className="h-4 w-4 text-slate-500" />{t('common.myData', 'My data')}</button>
                  )}
                  {canViewAs && onViewAs && (
                    <label className="flex min-h-11 items-center gap-2 px-3 text-sm font-semibold text-slate-700"><Users className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                      <select aria-label={tx('View as another user (read-only)', 'किसी दूसरे यूज़र की तरह देखें (सिर्फ़ देखने के लिए)')} value="" onChange={(e) => { if (e.target.value) { setMenu(false); onViewAs(e.target.value); } }}
                        className="min-h-9 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-xs font-medium text-slate-800">
                        <option value="">{tx('View as… (read-only)', 'ऐसे देखें… (सिर्फ़ देखना)')}</option>
                        {users.filter((u) => u.id !== currentUser.id).map((u) => <option key={u.id} value={u.id}>{u.name} — {label('role', u.role)}</option>)}
                      </select>
                    </label>
                  )}
                  <div className="my-1 border-t border-slate-100" />
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); onLogout(); }} title={tx(`Signed in as ${currentUser.name}`, `${currentUser.name} के रूप में साइन इन`)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-red-700 hover:bg-red-50" data-testid="menu-signout"><LogOut className="h-4 w-4" />{t('common.signOut', 'Sign out')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
