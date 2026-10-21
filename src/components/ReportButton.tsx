import React, { useState } from 'react';
import { Flag, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';

const REASONS: [string, string, string][] = [
  ['SOLD', 'Already sold / not available', 'बिक चुकी / उपलब्ध नहीं'], ['FAKE', 'Fake or misleading', 'फर्जी या भ्रामक'], ['DUPLICATE', 'Duplicate listing', 'डुप्लीकेट लिस्टिंग'],
  ['WRONG_PRICE', 'Wrong price', 'गलत कीमत'], ['SPAM', 'Spam', 'स्पैम'], ['ABUSE', 'Abusive behaviour', 'बदतमीज़ी'], ['OTHER', 'Something else', 'कुछ और'],
];

/** One small "Report" link used on listings and broker cards. Reports go to GENZ ops; 3 different reporters auto-hold a listing. */
export const ReportButton: React.FC<{ targetType: 'LISTING' | 'BROKER'; targetId: string; compact?: boolean }> = ({ targetType, targetId, compact }) => {
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('SOLD');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true); setMsg('');
    try { const r = await api.report({ targetType, targetId, reason, note }); setMsg(r.message || tx('Reported. Thank you.', 'रिपोर्ट हो गई। धन्यवाद।')); setTimeout(() => setOpen(false), 1400); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-slate-500 hover:bg-red-50 hover:text-red-700 ${compact ? '' : 'min-h-8'}`} aria-label={tx('Report', 'रिपोर्ट करें')}>
        <Flag className="h-3.5 w-3.5" aria-hidden /> {tx('Report', 'रिपोर्ट')}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 sm:items-center" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">{targetType === 'LISTING' ? tx('Report this listing', 'इस लिस्टिंग को रिपोर्ट करें') : tx('Report this member', 'इस सदस्य को रिपोर्ट करें')}</h3><button onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button></div>
            <div className="mt-3 space-y-1.5">
              {REASONS.filter(r => targetType === 'LISTING' || ['SPAM', 'ABUSE', 'FAKE', 'OTHER'].includes(r[0])).map(r => (
                <label key={r[0]} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm"><input type="radio" name="reason" checked={reason === r[0]} onChange={() => setReason(r[0])} />{tx(r[1], r[2])}</label>
              ))}
            </div>
            <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={300} rows={2} placeholder={tx('Add a short note (optional)', 'छोटा नोट (वैकल्पिक)')} className="mt-3 w-full rounded-lg border border-slate-300 p-2 text-sm" />
            {msg && <p className="mt-2 text-xs font-medium text-slate-700">{msg}</p>}
            <button disabled={busy} onClick={send} className="mt-3 min-h-12 w-full rounded-lg bg-red-600 text-sm font-semibold text-white disabled:opacity-60">{tx('Send report', 'रिपोर्ट भेजें')}</button>
          </div>
        </div>
      )}
    </>
  );
};
