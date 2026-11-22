import React from 'react';
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

/** v189 — the honest empty state for a Basic account: the network is not shown until KYC (never "adjust your search"). */
export const BasicNetworkLocked: React.FC<{ what: 'listings' | 'needs' }> = ({ what }) => {
  const tx = useTx();
  return (
    <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-8 text-center" data-testid="basic-network-locked">
      <ShieldAlert className="mx-auto h-8 w-8 text-amber-600" aria-hidden />
      <h3 className="mt-2 text-sm font-semibold text-slate-900">{what === 'listings' ? tx('Network listings open after KYC', 'नेटवर्क की लिस्टिंग KYC के बाद खुलती हैं') : tx('Network buyer needs open after KYC', 'नेटवर्क की खरीदार ज़रूरतें KYC के बाद खुलती हैं')}</h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-slate-600">{tx('Add your PAN / RERA and the GENZ team will check it. Your own listings and clients work meanwhile.', 'अपना PAN / RERA जोड़ें, GENZ टीम जाँचेगी। तब तक आपकी अपनी लिस्टिंग और क्लाइंट चलते रहेंगे।')}</p>
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: 'network' }))} className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white" data-testid="basic-network-locked-go">{tx('Verify KYC', 'KYC वेरिफ़ाई करें')}</button>
    </div>
  );
};
