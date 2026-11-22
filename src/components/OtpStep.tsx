import React, { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useI18n, useTx } from '../lib/i18n.js';

/** v175 (D5) — what the server answers to "send me a code": the same shape for every phone number. */
export interface OtpReq { mode: 'manual' | 'sms' | 'demo'; ref?: string; wa?: string | null; waSet?: boolean; devCode?: string; expiresInSec?: number; cooldownSec?: number }
/** Seconds left until `endAt` (ms), ticking each second; 0 when over. */
export function useCountdown(endAt: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (endAt <= Date.now()) return; const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, [endAt]);
  return Math.max(0, Math.ceil((endAt - now) / 1000));
}
export const mmss = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);   // v178: no "1439:59"
export interface OtpErr { message: string; body?: { errorHi?: string; wait?: number; code?: string } }

/** Error line in the reader's language; locked / too-soon / cap states show a live retry countdown. */
export const OtpAlert: React.FC<{ err: OtpErr | null; className?: string }> = ({ err, className = '' }) => {
  const { lang } = useI18n(); const tx = useTx();
  const wait = err?.body?.wait || 0;
  const [endAt, setEndAt] = useState(0);
  useEffect(() => { setEndAt(wait ? Date.now() + wait * 1000 : 0); }, [err, wait]);
  const left = useCountdown(endAt);
  if (!err) return null;
  return (
    <div role="alert" className={`rounded-lg bg-red-50 p-2 text-xs font-medium text-red-800 ${className}`} data-testid="otp-error" data-code={err.body?.code || ''}>
      <p>{lang === 'hi' && err.body?.errorHi ? err.body.errorHi : err.message}</p>
      {wait > 0 && left > 0 && <p className="mt-1 font-mono text-sm font-bold" data-testid="otp-retry">{wait >= 3600 ? tx('Try again tomorrow', 'कल फिर कोशिश करें') + ' · ' : tx('Try again in', 'दोबारा कोशिश') + ' '}{mmss(left)}</p>}
    </div>
  );
};

/** After a code was asked for: manual = "send this on WhatsApp" step; sms = "sent"; demo = the demo code. `sentAt` restarts the resend timer. */
export const OtpSent: React.FC<{ v: OtpReq; sentAt: number; onResend: () => void; busy?: boolean; locked?: boolean; generic?: boolean }> = ({ v, sentAt, onResend, busy, locked, generic }) => {
  const tx = useTx();
  const left = useCountdown(sentAt + (v.cooldownSec ?? 60) * 1000);
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="otp-sent">
      {v.mode === 'manual' ? (<>
        <p className="text-xs font-semibold text-slate-800">{generic ? tx('If this number can reset with a code, send this request on WhatsApp and we reply with the 6-digit code. Admin / staff numbers get no code here — ask a SUPERADMIN.', 'अगर इस नंबर का कोड से रीसेट हो सकता है तो यह रिक्वेस्ट WhatsApp पर भेजें, हम 6 अंकों का कोड भेजेंगे। एडमिन / स्टाफ नंबर को यहाँ कोड नहीं मिलता — सुपरएडमिन से कहें।') : tx('Send this request on WhatsApp — we reply with your 6-digit code.', 'यह रिक्वेस्ट WhatsApp पर भेजें — हम आपको 6 अंकों का कोड भेजेंगे।')}</p>
        {locked ? null : v.wa
          ? <a href={v.wa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white" data-testid="otp-wa"><MessageCircle className="h-4 w-4" />{tx('Send on WhatsApp', 'WhatsApp पर भेजें')}</a>
          : <p className="rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-900" data-testid="otp-ask-admin">{tx('Ask your admin for the code.', 'कोड के लिए अपने एडमिन से पूछें।')}</p>}
        {v.ref && !locked && <p className="text-[11px] text-slate-600">{tx('Request number', 'रिक्वेस्ट नंबर')}: <b className="font-mono" data-testid="otp-ref">{v.ref}</b> · {tx('valid 10 minutes', '10 मिनट मान्य')}</p>}
      </>) : v.devCode
        ? <p className="text-xs font-semibold text-amber-800" data-testid="otp-demo">{tx('Demo code', 'डेमो कोड')}: <b className="font-mono">{v.devCode}</b></p>
        : <p className="text-xs font-semibold text-slate-800">{tx('Code sent to your phone.', 'कोड आपके फ़ोन पर भेजा गया।')}</p>}
      <button type="button" onClick={onResend} disabled={busy || left > 0} className="min-h-11 text-xs font-semibold text-emerald-800 underline disabled:no-underline disabled:opacity-50" data-testid="otp-resend">
        {left > 0 ? `${tx('Ask again in', 'फिर माँगें')} ${mmss(left)}` : tx('Ask for a new code', 'नया कोड माँगें')}
      </button>
    </div>
  );
};
