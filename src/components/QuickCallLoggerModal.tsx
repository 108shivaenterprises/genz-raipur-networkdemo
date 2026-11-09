import React, { useState } from 'react';
import { PhoneCall, Calendar, Clock, CheckCircle2, X, MessageSquare, AlertCircle, Sparkles } from 'lucide-react';
import { api } from '../lib/api.js';
import { useUI } from '../lib/ui.js';
import { useTx } from '../lib/i18n.js';
import type { CrmLead } from '../types/crm.js';

interface QuickCallLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: CrmLead;
  onLogged?: () => void;
}

export function QuickCallLoggerModal({
  isOpen,
  onClose,
  lead,
  onLogged,
}: QuickCallLoggerModalProps) {
  const t = useTx();
  const { toast } = useUI();
  const [outcome, setOutcome] = useState<string>('CONNECTED');
  const [note, setNote] = useState<string>('');
  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [durationMin, setDurationMin] = useState<number>(3);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const quickOutcomes = [
    { id: 'VISIT_SCHEDULED', label: t('Site Visit Agreed', 'साइट विज़िट तय हुई'), color: 'bg-emerald-500 text-white', icon: '🏡' },
    { id: 'HOT_FOLLOW_UP', label: t('Call Back Later', 'बाद में कॉल करें'), color: 'bg-amber-500 text-white', icon: '⏰' },
    { id: 'CONNECTED', label: t('Discussed Details', 'बातचीत हुई'), color: 'bg-blue-600 text-white', icon: '💬' },
    { id: 'RINGING', label: t('Ringing / No Answer', 'घंटी बजी / उठाया नहीं'), color: 'bg-slate-700 text-white', icon: '📞' },
    { id: 'NOT_INTERESTED', label: t('Not Interested', 'रुचि नहीं है'), color: 'bg-red-600 text-white', icon: '❌' },
  ];

  const handleSetQuickTime = (hoursFromNow: number) => {
    const d = new Date(Date.now() + hoursFromNow * 3600_000);
    const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setScheduledDate(iso);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.crmCall(lead.id, {
        outcome,
        note: note.trim() || undefined,
        durationMin: durationMin > 0 ? durationMin : undefined,
        when: scheduledDate ? new Date(scheduledDate).toISOString() : undefined,
      });

      toast(t('Call activity logged to CRM timeline!', 'कॉल विवरण CRM टाइमलाइन में दर्ज हुआ!'), 'success');
      onLogged?.();
      onClose();
    } catch (err: any) {
      toast(err.message || t('Failed to log call', 'कॉल दर्ज करने में विफल'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/60 flex items-center justify-center text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800">
            <PhoneCall className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              {t('Log Call Disposition', 'कॉल परिणाम दर्ज करें')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lead.name} · {lead.projectName || t('Inbound Lead', 'लीड')}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Quick Outcome Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">
              {t('Call Outcome / Result', 'कॉल का परिणाम')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {quickOutcomes.map((qo) => (
                <button
                  key={qo.id}
                  type="button"
                  onClick={() => setOutcome(qo.id)}
                  className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all text-left ${
                    outcome === qo.id
                      ? `${qo.color} border-transparent shadow-md`
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-slate-400'
                  }`}
                >
                  <span>{qo.icon}</span>
                  <span className="truncate">{qo.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* If visit scheduled or callback requested -> date selector with quick presets */}
          {(outcome === 'VISIT_SCHEDULED' || outcome === 'HOT_FOLLOW_UP') && (
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block">
                {outcome === 'VISIT_SCHEDULED' ? t('Select Site Visit Date & Time', 'विज़िट की तारीख़ और समय') : t('Callback Reminder Time', 'कॉल बैक का समय')}
              </label>
              <div className="flex gap-1.5 flex-wrap mb-1.5">
                <button
                  type="button"
                  onClick={() => handleSetQuickTime(4)}
                  className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                >
                  {t('+4 Hours', '+4 घंटे')}
                </button>
                <button
                  type="button"
                  onClick={() => handleSetQuickTime(24)}
                  className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                >
                  {t('Tomorrow 11 AM', 'कल 11 बजे')}
                </button>
                <button
                  type="button"
                  onClick={() => handleSetQuickTime(72)}
                  className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                >
                  {t('This Weekend', 'इस वीकेंड')}
                </button>
              </div>
              <input
                type="datetime-local"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full text-xs p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
              />
            </div>
          )}

          {/* Quick Note */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              {t('Conversation Notes (Optional)', 'बातचीत का नोट (वैकल्पिक)')}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('e.g. Interested in 3 BHK higher floor with 2 car parks', 'उदा. ऊपरी मंजिल का 3 BHK पसंद आया')}
              className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{loading ? t('Saving...', 'सहेजा जा रहा है...') : t('Save Call Disposition', 'कॉल परिणाम सहेजें')}</span>
          </button>
        </form>
      </div>
    </div>
  );
}

