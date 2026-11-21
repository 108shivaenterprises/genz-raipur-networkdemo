import React, { useEffect, useState } from 'react';
import { Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { mmss } from './OtpStep.js';

const PURPOSE: Record<string, [string, string]> = { signup: ['Sign-up', 'साइन-अप'], owner: ['Owner sign-in', 'मालिक साइन-इन'], reset: ['Forgot password', 'पासवर्ड रीसेट'] };
type Res = Awaited<ReturnType<typeof api.otpPending>>;
type Row = Res['pending'][number] & { phone?: string; sendLink?: string; sent?: boolean };

/** v175/v176 (D5) — staff relay: the code goes ONLY to the number on record ("Send to this number"), never as a reply to someone who messaged in. Each first view and each send is written to the audit log. */
export const OtpCodesView: React.FC = () => {
  const tx = useTx(); const [d, setD] = useState<Res | null>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const load = async () => { setBusy(true); try { setD(await api.otpPending()); setErr(''); } catch (e: any) { setErr(e?.message || tx('Could not load', 'लोड नहीं हुआ')); } finally { setBusy(false); } };
  const send = (p: Row) => { void fetch(`/api/admin/otp-pending/${encodeURIComponent(p.ref)}/sent`, { method: 'POST', credentials: 'same-origin' }).finally(() => void load()); };
  useEffect(() => { void load(); const i = setInterval(() => void load(), 15000); return () => clearInterval(i); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="space-y-3" data-testid="otp-codes">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-emerald-600" /><h2 className="text-lg font-bold text-slate-900">{tx('Pending OTP codes', 'बाकी OTP कोड')}</h2>
          <button onClick={() => void load()} disabled={busy} aria-label={tx('Refresh', 'रीफ़्रेश')} className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button></div>
        <p className="mt-1 text-sm text-slate-600">{tx('Tap "Send to this number": WhatsApp opens to the number given at sign-up. Never reply to someone who messaged you first, and never send a code to any other number. Each code you open or send is written to the audit log.', '"इस नंबर पर भेजें" दबाएँ: WhatsApp उसी नंबर पर खुलेगा जो साइन-अप में दिया गया था। जिसने पहले आपको मैसेज किया उसे जवाब में कोड कभी न भेजें, और किसी और नंबर पर भी नहीं। आप जो कोड खोलते या भेजते हैं वह ऑडिट लॉग में दर्ज होता है।')}</p>
        {d && d.mode !== 'manual' && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{tx('Codes are not sent through this screen while OTP_MODE is not "manual".', 'OTP_MODE "manual" न होने पर कोड इस स्क्रीन से नहीं जाते।')}</p>}
        {d && <p className="mt-2 text-xs text-slate-500">{tx('Codes asked in the last 24 hours', 'पिछले 24 घंटे में माँगे गए कोड')}: <b>{d.usedToday}</b> / {d.dailyCap}</p>}
        {err && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">{err}</p>}
      </div>
      {d && d.pending.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500" data-testid="otp-empty">{tx('No code is waiting. When someone asks for one it shows up here.', 'कोई कोड बाकी नहीं। कोई माँगेगा तो यहीं दिखेगा।')}</p>}
      <ul className="space-y-2">
        {(d?.pending as Row[] | undefined)?.map(p => (
          <li key={p.ref} className="rounded-2xl border border-slate-200 bg-white p-3" data-testid="otp-row">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1 basis-40">
                <p className="font-mono text-sm font-bold text-slate-900">{p.ref}</p>
                <p className="font-mono text-base font-semibold text-slate-900" data-testid="otp-phone">+91 {p.phone}</p>
                <p className="text-xs text-slate-600">{tx(PURPOSE[p.purpose]?.[0] ?? p.purpose, PURPOSE[p.purpose]?.[1] ?? p.purpose)} · {tx('asked', 'माँगा')} {mmss(p.ageSec)} {tx('ago', 'पहले')} · {tx('expires in', 'मियाद')} {mmss(p.expiresInSec)}</p>
              </div>
              <p className="rounded-lg bg-slate-900 px-3 py-2 font-mono text-lg font-bold tracking-widest text-white" data-testid="otp-code">{p.code}</p>
            </div>
            {p.sendLink && <a href={p.sendLink} target="_blank" rel="noopener noreferrer" onClick={() => send(p)} data-testid="otp-send" className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white"><MessageCircle className="h-4 w-4" />{tx('Send to this number', 'इस नंबर पर भेजें')}{p.sent ? ` · ${tx('sent', 'भेजा')}` : ''}</a>}
          </li>
        ))}
      </ul>
    </section>
  );
};
