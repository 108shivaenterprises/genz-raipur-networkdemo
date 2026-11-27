import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { OtpAlert, OtpSent, type OtpErr, type OtpReq } from './OtpStep.js';

/** D23 round 11 — prove the mobile on the account with a code; visits booked on this number open to the account only after that. Hidden once verified. */
export const PhoneVerifyCard: React.FC = () => {
  const tx = useTx();
  const [st, setSt] = useState<{ verified: boolean; hasPhone: boolean } | null>(null);
  const [tok, setTok] = useState(''); const [v, setV] = useState<OtpReq | null>(null); const [sentAt, setSentAt] = useState(0);
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<OtpErr | null>(null);
  useEffect(() => { api.phoneStatus().then(setSt).catch(() => setSt(null)); }, []);
  if (!st || st.verified || !st.hasPhone) return null;
  const send = async () => { setBusy(true); setErr(null); try { const r = await api.phoneSend(); if (r.already) { setSt({ ...st, verified: true }); return; } setTok(r.otpToken); setV(r); setSentAt(Date.now()); setCode(''); } catch (e) { setErr(e as OtpErr); } finally { setBusy(false); } };
  const confirm = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(null); try { await api.phoneConfirm(tok, code); setSt({ ...st, verified: true }); } catch (e2) { setErr(e2 as OtpErr); } finally { setBusy(false); } };
  return (
    <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3" data-testid="phone-verify">
      <p className="text-sm font-semibold text-amber-900">{tx('Verify your mobile number', 'अपना मोबाइल नंबर वेरिफ़ाई करें')}</p>
      <p className="mt-1 text-xs text-amber-900">{tx('Until you do, visits booked on your number do not open to this account (they stay protected).', 'जब तक आप ऐसा नहीं करते, आपके नंबर पर बुक विज़िट इस अकाउंट में नहीं खुलेंगी (वे सुरक्षित रहती हैं)।')}</p>
      {!v ? <button type="button" disabled={busy} onClick={() => void send()} className="mt-2 min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60" data-testid="phone-verify-send">{tx('Send code', 'कोड भेजें')}</button> : (
        <form onSubmit={confirm} className="mt-2 space-y-2">
          <OtpSent v={v} sentAt={sentAt} onResend={() => void send()} busy={busy} />
          <input inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder={tx('6-digit code', '6 अंकों का कोड')} aria-label={tx('6-digit code', '6 अंकों का कोड')} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-center font-mono text-sm" data-testid="phone-verify-code" />
          <button disabled={busy || code.length !== 6} className="min-h-11 w-full rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-60" data-testid="phone-verify-confirm">{tx('Verify', 'वेरिफ़ाई करें')}</button>
        </form>)}
      <OtpAlert err={err} />
    </div>
  );
};
