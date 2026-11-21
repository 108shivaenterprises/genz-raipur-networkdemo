import React, { useState } from 'react';
import { Loader2, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { OtpAlert, OtpSent, type OtpErr, type OtpReq } from './OtpStep.js';

const input = 'min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none';

/** v175 — forgot password: mobile number -> code (WhatsApp / SMS by server mode) -> new password. The answer is the same for every number. */
export const ForgotPassword: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const tx = useTx();
  const [phone, setPhone] = useState(''); const [v, setV] = useState<OtpReq | null>(null); const [sentAt, setSentAt] = useState(0);
  const [code, setCode] = useState(''); const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<OtpErr | null>(null); const [done, setDone] = useState(false);
  const p10 = phone.replace(/\D/g, '').slice(-10);
  const ask = async () => {
    setBusy(true); setErr(null);
    try { setV(await api.forgotRequest(p10)); setSentAt(Date.now()); setCode(''); } catch (e: any) { setErr(e); } finally { setBusy(false); }
  };
  const reset = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api.forgotReset({ phone: p10, ref: v?.ref || '', code, password: pw }); setDone(true); } catch (e2: any) { setErr(e2); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="forgot-password">
      <button onClick={onBack} className="mb-3 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-slate-600"><ArrowLeft className="h-3.5 w-3.5" /> {tx('Back to sign in', 'साइन इन पर वापस')}</button>
      <h2 className="text-lg font-bold text-slate-900">{tx('Forgot password', 'पासवर्ड भूल गए')}</h2>
      {done ? (
        <div className="mt-4 space-y-3" data-testid="forgot-done">
          <p className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{tx('Done. If this number has an account, the password is changed and other devices are signed out. Sign in with the new password.', 'हो गया। अगर इस नंबर पर अकाउंट है तो पासवर्ड बदल गया है और बाकी डिवाइस साइन-आउट हैं। नए पासवर्ड से साइन इन करें।')}</p>
          <button onClick={onBack} className="min-h-11 w-full rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">{tx('Go to sign in', 'साइन इन पर जाएँ')}</button>
        </div>
      ) : !v ? (
        <form className="mt-3 space-y-3" onSubmit={e => { e.preventDefault(); void ask(); }}>
          <p className="text-xs text-slate-600">{tx('Enter your mobile number. We will give you a 6-digit code, then you choose a new password.', 'अपना मोबाइल नंबर डालें। हम 6 अंकों का कोड देंगे, फिर आप नया पासवर्ड चुनें।')}</p>
          <p className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900">{tx('Admin and staff accounts cannot be reset with a code — ask a SUPERADMIN to reset it.', 'एडमिन और स्टाफ अकाउंट कोड से रीसेट नहीं होते — SUPERADMIN से रीसेट करवाएँ।')}</p>
          <input required inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder={tx('10-digit mobile number', '10 अंकों का मोबाइल नंबर')} className={input} data-testid="forgot-phone" aria-label={tx('Mobile number', 'मोबाइल नंबर')} />
          <OtpAlert err={err} />
          <button disabled={busy || !/^[6-9]\d{9}$/.test(p10)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60" data-testid="forgot-send">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Get a code', 'कोड पाएँ')}</button>
        </form>
      ) : (
        <form className="mt-3 space-y-3" onSubmit={reset}>
          <OtpSent v={v} sentAt={sentAt} onResend={() => void ask()} busy={busy} />
          <input inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder={tx('6-digit code', '6 अंकों का कोड')} className={input + ' text-center font-mono text-lg tracking-widest'} data-testid="forgot-code" aria-label={tx('Code', 'कोड')} />
          <input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} placeholder={tx('New password', 'नया पासवर्ड')} className={input} data-testid="forgot-password-new" aria-label={tx('New password', 'नया पासवर्ड')} />
          <p className="text-[11px] text-slate-500">{tx('At least 10 characters with a capital letter, a small letter and a digit.', 'कम से कम 10 अक्षर — एक बड़ा अक्षर, एक छोटा अक्षर और एक अंक।')}</p>
          <OtpAlert err={err} />
          <button disabled={busy || code.length !== 6 || pw.length < 10} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60" data-testid="forgot-reset">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Set new password', 'नया पासवर्ड लगाएँ')}</button>
        </form>
      )}
    </div>
  );
};
