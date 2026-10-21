import React, { useEffect, useState } from 'react';
import { Loader2, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx, useI18n } from '../lib/i18n.js';

const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none';
const ROLES: [string, string, string][] = [
  ['BROKER', 'Broker', 'ब्रोकर'], ['DEVELOPER_BUILDER', 'Builder / Developer', 'बिल्डर / डेवलपर'], ['CONTRACTOR', 'Contractor', 'ठेकेदार'],
  ['LEGAL_COUNSEL', 'Legal counsel', 'वकील'], ['PROPERTY_OWNER', 'Property owner', 'प्रॉपर्टी मालिक'],
];

/** Public, login-free panels: "Request access" (city waitlist) and "Forgot password". */
export const AccessRequest: React.FC<{ mode: 'access' | 'forgot'; refCode?: string; onBack: () => void }> = ({ mode, refCode, onBack }) => {
  const tx = useTx();
  const { lang } = useI18n();
  const hi = lang === 'hi';
  const [f, setF] = useState({ name: '', phone: '', city: '', role: 'BROKER', consent: false, website: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  const [ch, setCh] = useState<{ question: string; token: string } | null>(null);
  const [ans, setAns] = useState('');
  const loadCh = () => { setAns(''); api.growthChallenge().then(setCh).catch(() => setCh(null)); };
  useEffect(() => { if (mode === 'access') loadCh(); }, [mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = mode === 'access' ? await api.growthWaitlist({ ...f, ref: refCode || undefined, challengeToken: ch?.token, challengeAnswer: ans }) : await api.growthForgot(f.phone);
      setDone(r.message);
    } catch (e2: any) { setErr(e2.message); if (mode === 'access') loadCh(); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-600"><ArrowLeft className="h-3.5 w-3.5" /> {tx('Back to sign in', 'साइन इन पर वापस')}</button>
      <h2 className="text-lg font-bold text-slate-900">{mode === 'access' ? tx('Request access', 'एक्सेस माँगें') : tx('Forgot password', 'पासवर्ड भूल गए')}</h2>
      <p className="mt-1 text-xs text-slate-500">
        {mode === 'access'
          ? tx('GENZ is invite-only. Tell us who you are — we open cities where verified professionals are waiting, and send you an invitation code on WhatsApp.', 'GENZ इनवाइट-ओनली है। अपना परिचय दें — हम वहाँ शहर खोलते हैं जहाँ सत्यापित प्रोफ़ेशनल इंतज़ार में हैं, और WhatsApp पर इनवाइट कोड भेजते हैं।')
          : tx('Enter your registered mobile number. GENZ Operations will send you a temporary password on WhatsApp.', 'अपना रजिस्टर्ड मोबाइल नंबर डालें। GENZ ऑपरेशंस WhatsApp पर अस्थायी पासवर्ड भेजेगा।')}
      </p>
      {mode === 'access' && refCode && <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-[11px] font-semibold text-emerald-800">{tx(`Invited with code ${refCode}`, `कोड ${refCode} से आमंत्रित`)}</p>}
      {done ? <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{done}</p> : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          {mode === 'access' && <input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder={tx('Full name', 'पूरा नाम')} className={input} />}
          <input required inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder={tx('Mobile number', 'मोबाइल नंबर')} className={input} />
          {mode === 'access' && (<>
            <input required value={f.city} onChange={e => setF({ ...f, city: e.target.value })} placeholder={tx('Your city', 'आपका शहर')} className={input} />
            <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })} className={input}>{ROLES.map(r => <option key={r[0]} value={r[0]}>{hi ? r[2] : r[1]}</option>)}</select>
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={e => setF({ ...f, website: e.target.value })} className="absolute -left-[9999px] h-0 w-0 opacity-0" />
            {ch && <label className="block text-xs font-semibold text-slate-700">{tx('Quick check: what is', 'छोटी जाँच: कितना होता है')} {ch.question} ?<input required inputMode="numeric" value={ans} onChange={e => setAns(e.target.value)} className={input + ' mt-1'} autoComplete="off" /></label>}
            <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" required checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} className="mt-0.5 h-4 w-4" />{tx('I agree that GENZ may contact me on this number about my request (Privacy Policy).', 'मैं सहमत हूँ कि GENZ मेरी रिक्वेस्ट के बारे में इस नंबर पर संपर्क कर सकता है (प्राइवेसी पॉलिसी)।')}</label>
          </>)}
          {err && <p className="text-xs font-medium text-red-700">{err}</p>}
          <button disabled={busy || (mode === 'access' && !f.consent)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{mode === 'access' ? tx('Request access', 'एक्सेस माँगें') : tx('Ask for a new password', 'नया पासवर्ड माँगें')}</button>
        </form>
      )}
    </div>
  );
};
