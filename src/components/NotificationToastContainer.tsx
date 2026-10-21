import React, { useEffect, useState } from 'react';
import { ToastItem } from '../types/notification.js';
import { useTx } from '../lib/i18n.js';
import {
  X,
  Handshake,
  ShieldCheck,
  Calendar,
  Building2,
  Bell,
  ArrowRight,
  Clock,
} from 'lucide-react';

interface NotificationToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const ToastCard: React.FC<{
  toast: ToastItem;
  onDismiss: (id: string) => void;
}> = ({ toast, onDismiss }) => {
  const tx = useTx();
  const duration = toast.durationMs || 6000;
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (elapsed >= duration) {
        clearInterval(interval);
        onDismiss(toast.id);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [toast.id, duration, onDismiss]);

  const getStyle = () => {
    switch (toast.type) {
      case 'offer':
        return {
          border: 'border-amber-300',
          bg: 'bg-white/95',
          iconBg: 'bg-amber-100 text-amber-800 border-amber-200',
          badge: 'bg-amber-100 text-amber-900 border-amber-200',
          badgeText: 'Collaboration Proposal',
          bar: 'bg-amber-500',
          Icon: Handshake,
        };
      case 'visit':
        return {
          border: 'border-emerald-300',
          bg: 'bg-white/95',
          iconBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          badge: 'bg-emerald-100 text-emerald-900 border-emerald-200',
          badgeText: 'Site Visit Update',
          bar: 'bg-emerald-600',
          Icon: ShieldCheck,
        };
      case 'deal':
        return {
          border: 'border-blue-300',
          bg: 'bg-white/95',
          iconBg: 'bg-blue-100 text-blue-800 border-blue-200',
          badge: 'bg-blue-100 text-blue-900 border-blue-200',
          badgeText: 'Deal Room',
          bar: 'bg-blue-600',
          Icon: Building2,
        };
      default:
        return {
          border: 'border-slate-300',
          bg: 'bg-white/95',
          iconBg: 'bg-slate-100 text-slate-800 border-slate-200',
          badge: 'bg-slate-100 text-slate-800 border-slate-200',
          badgeText: 'Notification',
          bar: 'bg-slate-600',
          Icon: Bell,
        };
    }
  };

  const style = getStyle();
  const IconComponent = style.Icon;

  return (
    <div
      role="alert"
      className={`relative overflow-hidden w-full max-w-sm rounded-xl border ${style.border} ${style.bg} p-4 shadow-xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-4 duration-300`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-xl border ${style.iconBg} shrink-0 mt-0.5`}>
          <IconComponent className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-1.5 mb-1">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${style.badge}`}>
              {style.badgeText}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">{tx('Just now', 'अभी')}</span>
          </div>

          <h4 className="text-xs font-bold text-slate-900 leading-snug truncate">
            {toast.title}
          </h4>
          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed break-words">
            {toast.message}
          </p>

          {toast.actionLabel && toast.onAction && (
            <div className="mt-2.5">
              <button
                onClick={() => {
                  toast.onAction?.();
                  onDismiss(toast.id);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-slate-900 hover:text-white bg-slate-100 hover:bg-slate-900 rounded-lg transition-colors shadow-2xs border border-slate-200 hover:border-slate-900"
              >
                <span>{toast.actionLabel}</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => onDismiss(toast.id)}
          className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
          title={tx('Dismiss notification', 'सूचना हटाएँ')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Expiry countdown line */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100">
        <div
          className={`h-full transition-all duration-75 ${style.bar}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export const NotificationToastContainer: React.FC<NotificationToastContainerProps> = ({
  toasts,
  onDismiss,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-auto"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
