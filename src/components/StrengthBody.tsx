import React from 'react';
import { useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';

/** the network-strength numbers (also used by the public page) */
export const StrengthBody: React.FC<{ s: any }> = ({ s }) => {
  const tx = useTx();
  const stat = (v: React.ReactNode, en: string, hi: string) => <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xl font-bold">{v}</div><div className="text-[11px] text-slate-600">{tx(en, hi)}</div></div>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stat(s.brokers.verified, 'Verified brokers', 'वेरिफ़ाइड ब्रोकर')}
        {stat(s.brokers.rera, 'with RERA registration', 'RERA रजिस्ट्रेशन वाले')}
        {stat(s.brokers.salesStaff, 'their sales staff on GENZ', 'GENZ पर उनका सेल्स स्टाफ़')}
        {stat(s.brokers.active30d, 'active in the last 30 days', 'पिछले 30 दिन में सक्रिय')}
        {stat(s.inventory.liveListings, 'live listings', 'लाइव लिस्टिंग')}
        {stat(s.inventory.localities, 'localities covered', 'इलाक़े कवर')}
        {stat(s.inventory.buyerNeeds, 'active buyer needs', 'सक्रिय खरीदार की ज़रूरतें')}
        {stat(s.work.verifiedSiteVisits90d, 'verified site visits (90 days)', 'सत्यापित साइट विज़िट (90 दिन)')}
        {stat(s.sales.bookings12m, 'bookings through partners (12 months)', 'पार्टनर से बुकिंग (12 महीने)')}
        {stat(formatINR(s.sales.value12m), 'value sold (12 months)', 'बिकी क़ीमत (12 महीने)')}
        {stat(s.work.medianFirstCallHours === null ? '—' : `${s.work.medianFirstCallHours} h`, 'median time to first call on a lead', 'लीड पर पहली कॉल का औसत समय')}
        {stat(s.sales.buildersWorkingWithGenz, 'builders already working with GENZ', 'बिल्डर पहले से GENZ के साथ')}
      </div>
      {s.inventory.topLocalities.length > 0 && <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs"><b>{tx('Strongest localities', 'सबसे मज़बूत इलाक़े')}:</b> {s.inventory.topLocalities.map((l: any) => `${l.name} (${l.n})`).join(' · ')}</div>}
      {s.inventory.needsByType.length > 0 && <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs"><b>{tx('What buyers are asking for', 'खरीदार क्या माँग रहे हैं')}:</b> {s.inventory.needsByType.map((l: any) => `${l.type} (${l.n})`).join(' · ')}</div>}
      <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs"><b>{tx('Brokers joining', 'जुड़ते ब्रोकर')}:</b> {s.brokers.joinedByMonth.map((m: any) => `${m.month}: ${m.brokers}`).join(' · ')}</div>
      <p className="text-[10px] text-slate-500">{tx(`${s.city} · counted ${new Date(s.generatedAt).toLocaleString('en-IN')} from GENZ records. Totals only.`, `${s.city} · GENZ रिकॉर्ड से ${new Date(s.generatedAt).toLocaleString('en-IN')} को गिना। सिर्फ़ कुल संख्या।`)}</p>
    </div>
  );
};

