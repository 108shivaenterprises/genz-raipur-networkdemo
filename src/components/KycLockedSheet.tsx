import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { useTx } from '../lib/i18n.js';
import { previewLine, useBasicPreview } from './BasicBanner.js';

/** v185 (D15) — a Basic (open sign-up) account tapped something that needs KYC: say what is locked and why, and point to the ID step. Opened by the `genz:kyc-locked` event the API layer fires on ACCOUNT_NOT_VERIFIED + basic. */
let quietUntil = 0;   // v188: right after the button is tapped the sheet must not come back on the same tab
export const KycLockedSheet: React.FC = () => {
  const tx = useTx(); const previewN = useBasicPreview(); const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null); const from = useRef<HTMLElement | null>(null);
  useEffect(() => { const h = () => { if (Date.now() > quietUntil) setOpen(true); }; window.addEventListener('genz:kyc-locked', h); return () => window.removeEventListener('genz:kyc-locked', h); }, []);
  // any later tap (another tab, logout…) ends the quiet period; Esc closes; focus goes into the dialog and back to what opened it
  useEffect(() => { const t = () => { quietUntil = 0; }; window.addEventListener('pointerdown', t, true); return () => window.removeEventListener('pointerdown', t, true); }, []);
  useEffect(() => {
    if (!open) return;
    from.current = document.activeElement as HTMLElement | null; box.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('keydown', k); from.current?.focus?.(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 sm:items-center" role="dialog" aria-modal="true" aria-label={tx('Verify KYC to unlock', 'KYC वेरिफ़ाई करके खोलें')} data-testid="kyc-locked-sheet" onClick={() => setOpen(false)}>
      <div ref={box} tabIndex={-1} className="w-full max-w-md rounded-t-2xl bg-white p-5 outline-none sm:rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
          <h2 className="min-w-0 flex-1 text-base font-bold text-slate-900">{tx('Verify your KYC to unlock this', 'इसे खोलने के लिए KYC वेरिफ़ाई करें')}</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label={tx('Close', 'बंद करें')} className="inline-flex min-h-11 min-w-11 items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-2 text-sm text-slate-700">{previewLine(tx, previewN)} {tx('Your own listings, clients and chat always work. These stay locked until your PAN / RERA is checked:', 'आपकी अपनी लिस्टिंग, क्लाइंट और चैट हमेशा चलते हैं। ये तब तक बंद रहेंगे जब तक आपका PAN / RERA जाँचा न जाए:')}</p>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
          <li>{tx('Co-broke deals, commission agreements and payments', 'को-ब्रोक डील, कमीशन एग्रीमेंट और पेमेंट')}</li>
          <li>{tx('Offers, site visits and owner / client numbers', 'ऑफ़र, साइट विज़िट और मालिक / क्लाइंट के नंबर')}</li>
          <li>{tx('Broadcasting to the network and inviting others', 'नेटवर्क को ब्रॉडकास्ट और दूसरों को बुलाना')}</li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">{tx('Why: other brokers trade real money here, so GENZ opens these only for checked members. Your own listings go public to the network once you are verified.', 'क्यों: यहाँ ब्रोकर असली पैसे का काम करते हैं, इसलिए GENZ ये सिर्फ़ जाँचे हुए सदस्यों के लिए खोलता है। वेरिफ़ाई होते ही आपकी लिस्टिंग नेटवर्क में दिखने लगेंगी।')}</p>
        <button type="button" onClick={() => { quietUntil = Date.now() + 4000; setOpen(false); window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: 'network' })); }} className="mt-4 min-h-11 w-full rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white" data-testid="kyc-locked-go">{tx('Verify KYC: add my PAN / RERA document', 'KYC वेरिफ़ाई: मेरा PAN / RERA दस्तावेज़ जोड़ें')}</button>
      </div>
    </div>
  );
};
