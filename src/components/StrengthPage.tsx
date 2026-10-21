import React, { useEffect, useState } from 'react';
import { Loader2, Printer, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx, LangToggle } from '../lib/i18n.js';
import { StrengthBody } from './StrengthBody.js';

/** v20 — what a builder sees when GENZ shares its network strength: read-only, totals only, link expires. */
export const StrengthPage: React.FC<{ token: string }> = ({ token }) => {
  const tx = useTx();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { api.publicStrength(token).then(setD).catch(e => setErr(e.message)); }, [token]);
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 font-black text-amber-400">GZ</span>
            <div><div className="text-base font-bold">{d?.platform?.name || 'GENZ Broker Network'}</div><div className="text-[11px] text-slate-500">{tx('Powered by', 'संचालक')} {d?.platform?.poweredBy || 'GENZ BUILDCON'}</div></div></div>
          <div className="flex items-center gap-2 print:hidden"><LangToggle /><button onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold"><Printer className="h-4 w-4" />{tx('Print / PDF', 'प्रिंट / PDF')}</button></div>
        </header>
        {err && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{err}</p>}
        {!d && !err && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}
        {d && <>
          <div>
            <h1 className="text-xl font-bold">{tx('Our network, in numbers', 'हमारा नेटवर्क, आँकड़ों में')}</h1>
            <p className="text-xs text-slate-600">{tx(`Prepared for ${d.label}. Verified, KYC-checked brokers who sell through GENZ — with site visits proven by QR / OTP and bookings tracked end to end.`, `${d.label} के लिए। KYC-जाँचे वेरिफ़ाइड ब्रोकर जो GENZ से बेचते हैं — QR / OTP से साबित साइट विज़िट और शुरू से आख़िर तक दर्ज बुकिंग।`)}</p>
          </div>
          <StrengthBody s={d.strength} />
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />{tx('Counted from GENZ’s own records at the moment you opened this page. Totals only — no broker, buyer or owner details are shared. This link stops working on', 'यह पेज खोलते समय GENZ के अपने रिकॉर्ड से गिना गया। सिर्फ़ कुल संख्या — किसी ब्रोकर, खरीदार या मालिक की जानकारी नहीं दी जाती। यह लिंक बंद होगा')} {new Date(d.expiresAt).toLocaleDateString('en-IN')}.</div>
        </>}
      </div>
    </div>
  );
};
