/** v26 — turn two-step sign-in (authenticator app code) on / off. Shown in "My data & privacy" and in the Control Center. */
import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';

export const TwoFactorCard: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const tx = useTx();
  const [st, setSt] = useState<{ enabled: boolean; recommended: boolean; recoveryLeft: number } | null>(null);
  const [step, setStep] = useState<'' | 'password' | 'scan' | 'codes' | 'off'>('');
  const [pw, setPw] = useState(''); const [code, setCode] = useState('');
  const [secret, setSecret] = useState(''); const [qr, setQr] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const load = () => api.twoFactorStatus().then(setSt).catch(() => setSt(null));
  useEffect(() => { load(); }, []);
  const field = 'mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn(); } catch (e: any) { setErr(e.message || 'Error'); } finally { setBusy(false); } };

  if (!st) return null;
  return (
    <div className={`mt-4 rounded-lg border p-3 ${st.enabled ? 'border-emerald-200 bg-emerald-50/40' : st.recommended ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`} data-testid="twofactor-card">
      <div className="flex items-start gap-2">
        {st.enabled ? <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-600" /> : <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-600" />}
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">{tx('Two-step sign-in', 'टू-स्टेप साइन-इन')} — {st.enabled ? tx('ON', 'चालू') : tx('OFF', 'बंद')}</p>
          {!compact && <p className="text-xs text-slate-600">{st.enabled
            ? tx(`Signing in needs your password and the code from your authenticator app. Recovery codes left: ${st.recoveryLeft}.`, `साइन इन के लिए पासवर्ड और ऑथेंटिकेटर ऐप का कोड दोनों चाहिए। बचे रिकवरी कोड: ${st.recoveryLeft}।`)
            : st.recommended
              ? tx('Strongly advised for GENZ admins: a stolen password alone will then not open your account (or the KYC vault).', 'GENZ एडमिन के लिए बहुत ज़रूरी: तब सिर्फ़ चोरी हुआ पासवर्ड आपका अकाउंट (या KYC वॉल्ट) नहीं खोल पाएगा।')
              : tx('Optional: protect your account with a code from an authenticator app (Google / Microsoft Authenticator).', 'वैकल्पिक: ऑथेंटिकेटर ऐप (Google / Microsoft Authenticator) के कोड से अकाउंट सुरक्षित करें।')}</p>}
        </div>
        {!step && <button onClick={() => { setStep(st.enabled ? 'off' : 'password'); setErr(''); }} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white" data-testid="twofactor-start">{st.enabled ? tx('Turn off', 'बंद करें') : tx('Turn on', 'चालू करें')}</button>}
      </div>

      {step === 'password' && (
        <form onSubmit={e => { e.preventDefault(); run(async () => { const r = await api.twoFactorSetup(pw); setPw(''); setSecret(r.secret); setQr(await QRCode.toDataURL(r.otpauth, { margin: 1, width: 200 })); setStep('scan'); }); }}>
          <input type="password" autoComplete="current-password" placeholder={tx('Your password', 'आपका पासवर्ड')} value={pw} onChange={e => setPw(e.target.value)} className={field} data-testid="twofactor-password" />
          <button disabled={busy || !pw} className="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : tx('Next', 'आगे')}</button>
        </form>
      )}
      {step === 'scan' && (
        <div className="mt-3 text-xs text-slate-700">
          <p>{tx('1. Open Google Authenticator / Microsoft Authenticator → “+” → scan this code.', '1. Google Authenticator / Microsoft Authenticator खोलें → “+” → यह कोड स्कैन करें।')}</p>
          {qr && <img src={qr} alt="QR" className="my-2 h-40 w-40 rounded border border-slate-200 bg-white" />}
          <p>{tx('Cannot scan? Type this key:', 'स्कैन नहीं हो रहा? यह की लिखें:')} <code className="break-all rounded bg-slate-100 px-1 font-mono" data-testid="twofactor-secret">{secret}</code></p>
          <p className="mt-2">{tx('2. Type the 6-digit code the app shows:', '2. ऐप में दिखा 6 अंकों का कोड लिखें:')}</p>
          <form onSubmit={e => { e.preventDefault(); run(async () => { const r = await api.twoFactorEnable(code.trim()); setCode(''); setCodes(r.recoveryCodes || []); setStep('codes'); load(); }); }}>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value)} className={`${field} font-mono tracking-widest`} data-testid="twofactor-code" />
            <button disabled={busy || code.trim().length !== 6} className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" data-testid="twofactor-enable">{tx('Turn on', 'चालू करें')}</button>
          </form>
        </div>
      )}
      {step === 'codes' && (
        <div className="mt-3 text-xs text-slate-700" data-testid="twofactor-codes">
          <p className="font-semibold text-emerald-800">{tx('Two-step sign-in is ON. Write these recovery codes on paper and keep them safe — each works once if you lose your phone. They will not be shown again.', 'टू-स्टेप साइन-इन चालू हो गया। ये रिकवरी कोड काग़ज़ पर लिखकर सुरक्षित रखें — फ़ोन खोने पर हर कोड एक बार चलेगा। ये दोबारा नहीं दिखेंगे।')}</p>
          <ul className="mt-2 grid grid-cols-2 gap-1 font-mono">{codes.map(c => <li key={c} className="rounded bg-slate-100 px-2 py-1">{c}</li>)}</ul>
          <button onClick={() => { setCodes([]); setStep(''); }} className="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">{tx('I have written them down', 'मैंने लिख लिए')}</button>
        </div>
      )}
      {step === 'off' && (
        <form onSubmit={e => { e.preventDefault(); run(async () => { await api.twoFactorDisable(pw, code.trim()); setPw(''); setCode(''); setStep(''); load(); }); }}>
          <input type="password" autoComplete="current-password" placeholder={tx('Your password', 'आपका पासवर्ड')} value={pw} onChange={e => setPw(e.target.value)} className={field} />
          <input inputMode="numeric" placeholder={tx('Code from the app', 'ऐप का कोड')} value={code} onChange={e => setCode(e.target.value)} className={field} />
          <button disabled={busy || !pw || !code} className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{tx('Turn off two-step sign-in', 'टू-स्टेप साइन-इन बंद करें')}</button>
        </form>
      )}
      {step && step !== 'codes' && <button onClick={() => { setStep(''); setErr(''); }} className="mt-2 text-xs text-slate-500 underline">{tx('Cancel', 'रद्द करें')}</button>}
      {err && <p className="mt-2 text-xs font-medium text-red-700">{err}</p>}
    </div>
  );
};
