import React, { useEffect, useState } from 'react';
import { X, Printer, FileText } from 'lucide-react';
import { useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';

export interface BayanaData { dealId: string; price: number; token: number; paidOn?: string; mode?: string; ref?: string; brokerName?: string; tds?: { applicable: boolean; amount: number; sellerNetPayable: number; asOf: string } }

/** v198 — a printable "token received" note, written from the हिसाब record. A record only: not an agreement, not proof of registration, no legal clauses. */
export const BayanaReceiptModal: React.FC<{ onClose: () => void; data: BayanaData }> = ({ onClose, data }) => {
  const tx = useTx();
  const [seller, setSeller] = useState(''); const [buyer, setBuyer] = useState(''); const [prop, setProp] = useState('');
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onClose]);
  const balance = Math.max(0, data.price - data.token);
  const inp = 'min-h-11 w-full rounded-lg border border-slate-300 px-2 text-sm print:border-0 print:px-0';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/70 p-3" role="dialog" aria-modal="true" aria-labelledby="bayana-title" data-testid="bayana-modal">
      <div className="my-4 w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 print:hidden">
          <h3 id="bayana-title" className="flex items-center gap-2 text-sm font-bold text-slate-900"><FileText className="h-4 w-4 text-indigo-600" aria-hidden />{tx('Broker’s acknowledgement of token received (non-statutory)', 'ब्रोकर की टोकन प्राप्ति की पावती (क़ानूनी दस्तावेज़ नहीं)')}</h3>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white" data-testid="bayana-print"><Printer className="h-4 w-4" aria-hidden />{tx('Print / Save PDF', 'प्रिंट / PDF')}</button>
            <button type="button" onClick={onClose} aria-label={tx('Close', 'बंद करें')} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200" data-testid="bayana-close"><X className="h-5 w-5" aria-hidden /></button>
          </div>
        </div>
        <div id="bayana-document" className="space-y-3 p-4 text-sm text-slate-800">
          <p className="text-center text-base font-bold">{tx('Acknowledgement of token received', 'टोकन प्राप्ति की पावती')}</p>
          <p className="text-center text-xs text-slate-500">{tx('Deal', 'डील')} {data.dealId}{data.paidOn ? ` · ${data.paidOn}` : ''}</p>
          <label className="block text-xs font-semibold text-slate-600">{tx('Seller / owner', 'विक्रेता / मालिक')}<input className={inp} value={seller} onChange={e => setSeller(e.target.value)} maxLength={80} data-testid="bayana-seller" /></label>
          <label className="block text-xs font-semibold text-slate-600">{tx('Buyer', 'खरीदार')}<input className={inp} value={buyer} onChange={e => setBuyer(e.target.value)} maxLength={80} data-testid="bayana-buyer" /></label>
          <label className="block text-xs font-semibold text-slate-600">{tx('Property', 'प्रॉपर्टी')}<input className={inp} value={prop} onChange={e => setProp(e.target.value)} maxLength={120} data-testid="bayana-prop" /></label>
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-300 bg-slate-50 p-3 text-center">
            <div><span className="block text-[11px] text-slate-500">{tx('Deal price', 'सौदे की कीमत')}</span><b>{formatINR(data.price)}</b></div>
            <div><span className="block text-[11px] text-slate-500">{tx('Token received', 'टोकन मिला')}</span><b className="text-emerald-800" data-testid="bayana-token">{formatINR(data.token)}</b></div>
            <div><span className="block text-[11px] text-slate-500">{tx('Balance', 'बाक़ी')}</span><b data-testid="bayana-balance">{formatINR(balance)}</b></div>
          </div>
          <p className="text-xs text-slate-600">{tx('Paid by', 'भुगतान')}: {data.mode || '—'}{data.ref ? ` · ${data.ref}` : ''}</p>
          {data.tds?.applicable && <p className="rounded-lg bg-indigo-50 p-2 text-xs text-indigo-950" data-testid="bayana-tds">{tx(`Indicative estimate (as of ${data.tds.asOf}): 1% TDS ${formatINR(Math.max(0, data.tds.amount))}, net to seller ${formatINR(Math.max(0, data.tds.sellerNetPayable))}. Confirm with your CA.`, `अनुमानित (${data.tds.asOf} तक): 1% TDS ${formatINR(Math.max(0, data.tds.amount))}, विक्रेता को शुद्ध ${formatINR(Math.max(0, data.tds.sellerNetPayable))}। अपने CA से पक्का करें।`)}</p>}
          <p className="text-xs text-slate-700">{tx('Recorded by', 'दर्ज करने वाला')}: {data.brokerName || '—'}</p>
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs font-semibold text-amber-900" data-testid="bayana-disclaimer">{tx('Record only, not an agreement or proof of registration; get an advocate to vet any agreement.', 'यह सिर्फ़ रिकॉर्ड है — एग्रीमेंट या रजिस्ट्री का सबूत नहीं; कोई भी एग्रीमेंट वकील से जँचवा लें।')}</p>
        </div>
      </div>
    </div>
  );
};
