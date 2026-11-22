import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { ShieldAlert } from 'lucide-react';
import { useTx } from '../lib/i18n.js';

/** v188 — a Basic (not yet KYC-verified) broker sees it on Home and Chats: what is held and the one next step. */
export const BasicBanner: React.FC = () => {
  const tx = useTx();
  return (
    <div className="mb-2 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2" data-testid="basic-banner">
      <ShieldAlert className="h-4 w-4 shrink-0 text-amber-700" aria-hidden />
      <p className="min-w-0 flex-1 text-xs font-semibold text-amber-900">{tx('Basic — add KYC to unlock deals', 'बेसिक — डील खोलने के लिए KYC जोड़ें')}</p>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: 'network' }))} className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white">{tx('Verify KYC', 'KYC वेरिफ़ाई')}</button>
    </div>
  );
};

let previewMemo: Promise<number> | null = null;
/** how many network rows a Basic account may preview a day (from the server, asked once) */
export const useBasicPreview = (): number => {
  const [n, setN] = useState(0);
  useEffect(() => { previewMemo ||= api.authConfig().then(c => Number(c.basicPreviewPerDay) || 0).catch(() => 0); void previewMemo.then(setN); }, []);
  return n;
};
/** "Preview: up to N network listings a day. Full network, sharing and deals after KYC" — one sentence, used everywhere a Basic account is told what it gets */
export const previewLine = (tx: (en: string, hi: string) => string, n: number, what: 'listings' | 'needs' = 'listings'): string =>
  what === 'listings'
    ? tx(`Preview: up to ${n || 'a few'} network listings a day. Full network, sharing and deals after KYC.`, `प्रीव्यू: रोज़ ${n || 'कुछ'} तक नेटवर्क लिस्टिंग। पूरा नेटवर्क, शेयरिंग और डील KYC के बाद।`)
    : tx(`Preview: up to ${n || 'a few'} network buyer needs a day. Full network and deals after KYC.`, `प्रीव्यू: रोज़ ${n || 'कुछ'} तक नेटवर्क खरीदार ज़रूरतें। पूरा नेटवर्क और डील KYC के बाद।`);

/** v189/v191 — the honest empty state for a Basic account: a limited daily preview, and what happens when it is used up (never "adjust your search") */
export const BasicNetworkLocked: React.FC<{ what: 'listings' | 'needs'; limited?: { en: string; hi: string } | null }> = ({ what, limited }) => {
  const tx = useTx(); const n = useBasicPreview();
  return (
    <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-8 text-center" data-testid="basic-network-locked">
      <ShieldAlert className="mx-auto h-8 w-8 text-amber-600" aria-hidden />
      <h3 className="mt-2 text-sm font-semibold text-slate-900" data-testid={limited ? 'basic-limit-note' : undefined}>{limited ? tx(limited.en, limited.hi) : tx('Network preview', 'नेटवर्क प्रीव्यू')}</h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-slate-600">{previewLine(tx, n, what)}</p>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: 'network' }))} className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white" data-testid="basic-network-locked-go">{tx('Verify KYC', 'KYC वेरिफ़ाई करें')}</button>
    </div>
  );
};

/** v191 — the Deals tab for a Basic account with no deal of its own */
export const BasicDealsLocked: React.FC = () => {
  const tx = useTx();
  return (
    <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-8 text-center" data-testid="basic-deals-locked">
      <ShieldAlert className="mx-auto h-8 w-8 text-amber-600" aria-hidden />
      <h3 className="mt-2 text-sm font-semibold text-slate-900">{tx('Deals open after KYC', 'डील KYC के बाद खुलती हैं')}</h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-slate-600">{tx('Co-broking, offers, site visits and commission agreements need a verified account. Add your PAN / RERA and the GENZ team will check it.', 'को-ब्रोकिंग, ऑफ़र, साइट विज़िट और कमीशन एग्रीमेंट के लिए वेरिफ़ाइड अकाउंट चाहिए। अपना PAN / RERA जोड़ें, GENZ टीम जाँचेगी।')}</p>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: 'network' }))} className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white" data-testid="basic-deals-locked-go">{tx('Verify KYC', 'KYC वेरिफ़ाई करें')}</button>
    </div>
  );
};
