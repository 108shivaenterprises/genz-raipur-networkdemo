import React, { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, LogIn, KeyRound } from 'lucide-react';
import { api } from '../lib/api.js';
import { LangToggle, useI18n, useTx } from '../lib/i18n.js';
import { JoinView } from './JoinView.js';
import { AccessRequest } from './AccessRequest.js';

interface Props {
  onLoggedIn: (session: Awaited<ReturnType<typeof api.login>>) => void;
  notice?: string;
}

type Cfg = Awaited<ReturnType<typeof api.authConfig>>;

const ROLE_LABEL: Record<string, [string, string]> = {
  SUPERADMIN: ['Super admin', 'सुपर एडमिन'], ADMIN: ['Admin', 'एडमिन'], DEVELOPER_BUILDER: ['Builder', 'बिल्डर'], BROKER: ['Broker', 'ब्रोकर'],
  CONTRACTOR: ['Contractor', 'ठेकेदार'], LEGAL_COUNSEL: ['Legal', 'वकील'], PROPERTY_OWNER: ['Owner', 'मालिक'], BUYER_TENANT: ['Buyer', 'खरीदार'],
  GENZ_CONNECTOR: ['Connector', 'कनेक्टर'], TEAM_MEMBER: ['Employee', 'कर्मचारी'],
};
const ORDER = ['SUPERADMIN', 'ADMIN', 'DEVELOPER_BUILDER', 'BROKER', 'CONTRACTOR', 'LEGAL_COUNSEL', 'PROPERTY_OWNER', 'BUYER_TENANT', 'GENZ_CONNECTOR', 'TEAM_MEMBER'];
export const LoginView: React.FC<Props> = ({ onLoggedIn, notice }) => {
  const { t } = useI18n();
  const tx = useTx();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [demoRole, setDemoRole] = useState('ALL');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const refParam = (() => { try { return new URLSearchParams(window.location.search).get('ref') || ''; } catch { return ''; } })();
  const [panel, setPanel] = useState<'' | 'access' | 'forgot'>(refParam ? 'access' : '');
  const [ticket, setTicket] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => {
    api.authConfig().then(setCfg).catch(() => setCfg(null));
  }, []);

  const submit = async (em: string, pw: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await api.login(em, pw);
      rememberedLoginPassword = pw; // kept in memory only, so a forced password change does not ask for it again
      if (res.twoFactorRequired && res.ticket) { setTicket(res.ticket); setCode(''); return; }
      onLoggedIn(res);
    } catch (e: any) {
      setError(e.message || tx('Login failed', 'लॉगिन नहीं हो पाया'));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    setBusy(true); setError('');
    try { onLoggedIn(await api.login2fa(ticket, code.trim())); }
    catch (e: any) { setError(e.message || tx('Login failed', 'लॉगिन नहीं हो पाया')); if (e?.code === 'TICKET_EXPIRED') setTicket(''); }
    finally { setBusy(false); }
  };

  if (ticket) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <form onSubmit={(e) => { e.preventDefault(); submitCode(); }} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="login-2fa">
        <h1 className="text-base font-bold text-slate-900">{tx('Two-step sign-in', 'टू-स्टेप साइन-इन')}</h1>
        <p className="mt-1 text-xs text-slate-600">{tx('Open your authenticator app and type the 6-digit GENZ code. Lost the phone? Type one of your recovery codes.', 'अपना ऑथेंटिकेटर ऐप खोलें और GENZ का 6 अंकों का कोड लिखें। फ़ोन खो गया? कोई एक रिकवरी कोड लिखें।')}</p>
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={14} value={code} onChange={(e) => setCode(e.target.value)} data-testid="login-2fa-code"
          className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-center font-mono text-xl tracking-widest focus:border-slate-900 focus:outline-none" />
        {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
        <button disabled={busy || code.trim().length < 6} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" data-testid="login-2fa-submit">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} {tx('Verify and sign in', 'जाँचें और साइन इन करें')}
        </button>
        <button type="button" onClick={() => { setTicket(''); setError(''); }} className="mt-3 w-full text-xs text-slate-500 underline">{tx('Back', 'वापस')}</button>
      </form>
    </div>
  );

  if (joining) return <JoinView onBack={() => setJoining(false)} />;
  if (panel) return <div className="mx-auto max-w-5xl px-4 py-10"><AccessRequest mode={panel} refCode={refParam} onBack={() => setPanel('')} /></div>;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-3xl grid gap-6 md:grid-cols-2">
        <form
          onSubmit={(e) => { e.preventDefault(); submit(email, password); }}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-amber-400 font-bold">GZ</div>
            <div>
              <h1 className="text-base font-bold text-slate-900">GENZ BROKER NETWORK</h1>
              <p className="text-xs text-slate-500">{t('login.tagline', 'Invite-only · India')}</p>
            </div>
            <LangToggle className="ml-auto" />
          </div>
          {notice && <p className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">{notice}</p>}
          <label className="block text-xs font-semibold text-slate-700 mb-1">{t('login.email', 'Email or mobile number')}</label>
          <input type="text" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none" />
          <label className="block text-xs font-semibold text-slate-700 mb-1">{t('login.password', 'Password')}</label>
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none" />
          {error && <p className="mb-3 text-xs font-medium text-red-700">{error}</p>}
          <button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} {t('login.button', 'Sign in')}
          </button>
          <button type="button" onClick={() => setJoining(true)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:border-slate-900">
            <KeyRound className="h-4 w-4 text-amber-500" /> {t('login.join', 'Have an invitation code? Join here')}
          </button>
          <p className="mt-3 flex justify-between text-[11px]">
            <button type="button" onClick={() => setPanel('access')} className="font-semibold text-blue-700 underline">{tx('Request access', 'एक्सेस माँगें')}</button>
            <button type="button" onClick={() => setPanel('forgot')} className="font-semibold text-blue-700 underline">{tx('Forgot password?', 'पासवर्ड भूल गए?')}</button>
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> {t('login.invite', 'New member? Get an invitation code from the GENZ team.')}
          </p>
          <p className="mt-3 flex gap-4 text-[11px]">
            <a href="#/privacy" className="text-blue-700 underline">{t('login.privacy', 'Privacy Policy')}</a>
            <a href="#/terms" className="text-blue-700 underline">{t('login.terms', 'Terms of Use')}</a>
          </p>
        </form>

        {cfg?.demoMode && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-6">
            <h2 className="flex items-center gap-2 text-sm font-bold text-amber-900"><KeyRound className="h-4 w-4" /> {tx('Demo accounts', 'डेमो अकाउंट')}</h2>
            <p className="mt-1 text-[11px] text-amber-800">{tx('DEMO_MODE is on (never enable in production). Password:', 'DEMO_MODE चालू है (प्रोडक्शन में कभी चालू न रखें)। पासवर्ड:')} <code className="font-mono">{cfg.demoPassword}</code></p>
            {cfg.demoAccounts.length > 12 && (
              <div className="mt-3 flex flex-wrap gap-1" data-testid="demo-role-chips">
                {['ALL', ...ORDER.filter(r => cfg.demoAccounts.some(a => a.role === r))].map(r => {
                  const n = r === 'ALL' ? cfg.demoAccounts.length : cfg.demoAccounts.filter(a => a.role === r).length;
                  const on = demoRole === r;
                  return (
                    <button key={r} type="button" onClick={() => setDemoRole(r)} data-testid={`demo-role-${r}`}
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-amber-200 bg-white text-slate-700 hover:border-slate-900'}`}>
                      {r === 'ALL' ? tx('All', 'सभी') : tx(ROLE_LABEL[r]?.[0] || r, ROLE_LABEL[r]?.[1] || r)} · {n}
                    </button>
                  );
                })}
              </div>
            )}
            <ul className="mt-3 space-y-1.5 max-h-80 overflow-auto">
              {[...cfg.demoAccounts].filter(a => demoRole === 'ALL' || a.role === demoRole).sort((x, y) => ORDER.indexOf(x.role) - ORDER.indexOf(y.role)).map((a) => (
                <li key={a.id}>
                  <button type="button" disabled={busy} onClick={() => submit(a.email, cfg.demoPassword || '')}
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-left text-xs hover:border-slate-900">
                    <span className="font-semibold text-slate-900">{a.name}</span>
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{a.role === 'TEAM_MEMBER' ? 'EMPLOYEE' : a.role.replace('_', ' ')}</span>
                    {a.role === 'TEAM_MEMBER' && a.companyName && <span className="ml-1 text-[10px] text-slate-500">of {a.companyName}</span>}
                    {a.verificationStatus !== 'VERIFIED' && <span className="ml-1 text-[10px] text-amber-700">({a.verificationStatus})</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

// In-memory only (never stored): the password just used to sign in.
let rememberedLoginPassword = '';

export const ChangePasswordView: React.FC<{ onDone: () => void; onLogout: () => void }> = ({ onDone, onLogout }) => {
  const tx = useTx();
  const known = rememberedLoginPassword;           // present right after signing in on this page
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const field = 'mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <form
        autoComplete="off"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          if (next !== again) { setError(tx('The two new passwords do not match.', 'दोनों नए पासवर्ड एक जैसे नहीं हैं।')); return; }
          setBusy(true);
          try {
            await api.changePassword(known || cur, next);
            rememberedLoginPassword = '';
            onDone();
          } catch (err: any) {
            const msg = String(err.message || '');
            setError(/current password/i.test(msg) && known
              ? tx('Could not verify your sign-in password. Sign out and sign in again, then retry.', 'आपका साइन-इन पासवर्ड जाँचा नहीं जा सका। साइन आउट करके दोबारा साइन इन करें, फिर कोशिश करें।')
              : msg);
          } finally { setBusy(false); }
        }}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-base font-bold text-slate-900">{tx('Set a new password', 'नया पासवर्ड बनाएँ')}</h1>
        <p className="mt-1 text-xs text-slate-500">{tx('Choose your own password. 10+ characters with an upper-case letter, a lower-case letter and a number.', 'अपना पासवर्ड चुनें। 10+ अक्षर, एक बड़ा अक्षर, एक छोटा अक्षर और एक अंक।')}</p>
        {!known && (
          <>
            <p className="mt-3 text-[11px] text-slate-500">{tx('Enter the password you just signed in with (the temporary one).', 'वह पासवर्ड डालें जिससे अभी साइन इन किया (अस्थायी वाला)।')}</p>
            <input type={show ? 'text' : 'password'} required autoComplete="off" name="temp-password" placeholder={tx('Current (temporary) password', 'मौजूदा (अस्थायी) पासवर्ड')} value={cur} onChange={(e) => setCur(e.target.value)} className={field} />
          </>
        )}
        <input type={show ? 'text' : 'password'} required autoComplete="new-password" name="new-password" placeholder={tx('New password', 'नया पासवर्ड')} value={next} onChange={(e) => setNext(e.target.value)} className={field} />
        <input type={show ? 'text' : 'password'} required autoComplete="new-password" name="new-password-confirm" placeholder={tx('Repeat new password', 'नया पासवर्ड दोबारा')} value={again} onChange={(e) => setAgain(e.target.value)} className={field} />
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> {tx('Show passwords', 'पासवर्ड दिखाएँ')}</label>
        {error && <p className="mt-3 text-xs font-medium text-red-700">{error}</p>}
        <button disabled={busy} className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{tx('Update password', 'पासवर्ड बदलें')}</button>
        <button type="button" onClick={onLogout} className="mt-2 w-full text-xs text-slate-500 hover:text-slate-900">{tx('Sign out', 'साइन आउट')}</button>
      </form>
    </div>
  );
};

export const PendingApprovalView: React.FC<{ status: string; name: string; onLogout: () => void }> = ({ status, name, onLogout }) => {
  const { t, lang } = useI18n();
  return (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <ShieldCheck className="mx-auto h-8 w-8 text-amber-500" />
      <h1 className="mt-3 text-base font-bold text-slate-900">{t('pending.title', 'Verification in progress')}</h1>
      <p className="mt-2 text-sm text-slate-600">{lang === 'hi' ? <>{name}, आपका अकाउंट <b>{status.replace('_', ' ')}</b> है। GENZ ऑपरेशंस आपके KYC दस्तावेज़ सत्यापित कर दे, उसके बाद मार्केटप्लेस, डील रूम और CRM खुल जाएँगे।</> : <>{name}, your account is <b>{status.replace('_', ' ')}</b>. Marketplace, deal rooms and CRM unlock after GENZ Operations verifies your KYC documents.</>}</p>
      <button onClick={onLogout} className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">{t('common.signOut', 'Sign out')}</button>
    </div>
  </div>
  );
};
