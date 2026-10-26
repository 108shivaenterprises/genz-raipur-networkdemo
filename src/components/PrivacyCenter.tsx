import React, { useEffect, useState } from 'react';
import { X, Download, Trash2, MessageSquareWarning, KeyRound } from 'lucide-react';
import { useI18n, useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { TwoFactorCard } from './TwoFactorCard.js';
import { AlertsCard } from './AlertsCard.js';
import { api } from '../lib/api.js';

interface Req { id: string; type: string; status: string; createdAt: string; details: string; resolutionNote?: string }

async function j(url: string, init?: RequestInit) {
  const r = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...init });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

/** Any signed-in user can change their own password here (same secure endpoint as the first-login screen). */
const PasswordSection: React.FC = () => {
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(''); const [next, setNext] = useState(''); const [again, setAgain] = useState('');
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const field = 'mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    if (next !== again) { setMsg({ ok: false, text: tx('The two new passwords do not match.', 'दोनों नए पासवर्ड एक जैसे नहीं हैं।') }); return; }
    if (next.length < 10 || !/[a-z]/.test(next) || !/[A-Z]/.test(next) || !/\d/.test(next)) {
      setMsg({ ok: false, text: tx('Use 10+ characters with an upper-case letter, a lower-case letter and a number.', '10+ अक्षर, एक बड़ा अक्षर, एक छोटा अक्षर और एक अंक रखें।') }); return;
    }
    setBusy(true);
    try {
      await api.changePassword(cur, next);
      setCur(''); setNext(''); setAgain(''); setOpen(false);
      setMsg({ ok: true, text: tx('Password changed. Your other sign-ins on other devices were signed out.', 'पासवर्ड बदल गया। दूसरे डिवाइस पर आपके बाकी लॉगिन बंद कर दिए गए हैं।') });
    } catch (err: any) {
      const m = String(err.message || '');
      setMsg({ ok: false, text: /current password is incorrect/i.test(m) ? tx('Current password is wrong.', 'मौजूदा पासवर्ड ग़लत है।') : m });
    } finally { setBusy(false); }
  };
  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-3" data-testid="password-section">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-2 text-sm font-semibold text-slate-800" aria-expanded={open}>
        <KeyRound className="h-4 w-4" /> {tx('Change my password', 'मेरा पासवर्ड बदलें')}
      </button>
      {open && (
        <form onSubmit={submit} autoComplete="off">
          <input type={show ? 'text' : 'password'} required autoComplete="current-password" name="current-password" placeholder={tx('Current password', 'मौजूदा पासवर्ड')} value={cur} onChange={e => setCur(e.target.value)} className={field} />
          <input type={show ? 'text' : 'password'} required autoComplete="new-password" name="new-password" placeholder={tx('New password', 'नया पासवर्ड')} value={next} onChange={e => setNext(e.target.value)} className={field} />
          <input type={show ? 'text' : 'password'} required autoComplete="new-password" name="new-password-confirm" placeholder={tx('Repeat new password', 'नया पासवर्ड दोबारा')} value={again} onChange={e => setAgain(e.target.value)} className={field} />
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> {tx('Show passwords', 'पासवर्ड दिखाएँ')}</label>
          <button disabled={busy} className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{tx('Update password', 'पासवर्ड बदलें')}</button>
        </form>
      )}
      {msg && <p className={`mt-2 text-xs font-medium ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p>}
    </div>
  );
};

export const PrivacyCenter: React.FC<{ onClose: () => void; role?: string }> = ({ onClose, role }) => {
  const { t } = useI18n();
  const tx = useTx();
  const label = useLabel();
  const [reqs, setReqs] = useState<Req[]>([]);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => j('/api/privacy/requests').then(d => setReqs(d.requests)).catch(() => {});
  useEffect(() => { load(); }, []);

  const file = async (type: 'ERASURE' | 'GRIEVANCE' | 'CORRECTION') => {
    try {
      if (type === 'ERASURE' && !confirm(tx('Request deletion of your account? Records required by law are retained in anonymised form. If you gave GENZ KYC (face photo, ID, Aadhaar), it is kept sealed for 3 years for fraud / legal checks and then deleted.', 'अपना अकाउंट हटाने का अनुरोध करें? क़ानून के लिए ज़रूरी रिकॉर्ड गुमनाम रूप में रखे जाते हैं। अगर आपने GENZ को KYC (फ़ोटो, ID, आधार) दिया है तो वह धोखाधड़ी / क़ानूनी जाँच के लिए 3 साल सील करके रखा जाता है, फिर मिटा दिया जाता है।'))) return;
      await j('/api/privacy/requests', { method: 'POST', body: JSON.stringify({ type, details: text }) });
      setText(''); setMsg({ ok: true, text: tx('Request filed. The Grievance Officer will respond within 15 days.', 'अनुरोध दर्ज हो गया। शिकायत अधिकारी 15 दिन में जवाब देंगे।') }); load();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">{t('priv.title', 'My data & privacy')}</h3>
          <button onClick={onClose} aria-label={tx('Close', 'बंद करें')}><X className="h-5 w-5 text-slate-500" /></button>
        </div>
        <a href="/api/privacy/export" className="mt-4 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:border-slate-900">
          <Download className="h-4 w-4" /> {t('priv.export', 'Download my data (JSON)')}
        </a>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder={tx('Describe your correction / grievance (optional for erasure)', 'अपना सुधार / शिकायत लिखें (अकाउंट हटाने के लिए ज़रूरी नहीं)')} className="mt-4 w-full rounded-lg border border-slate-300 p-2 text-sm" />
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={() => file('GRIEVANCE')} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"><MessageSquareWarning className="h-3.5 w-3.5" /> {t('priv.grievance', 'Grievance / correction')}</button>
          <button onClick={() => file('ERASURE')} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"><Trash2 className="h-3.5 w-3.5" /> {t('priv.erase', 'Request account erasure')}</button>
        </div>
        {msg && <p className={`mt-3 text-xs font-medium ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p>}
        <PasswordSection />
        <TwoFactorCard />
        <div className="mt-4"><AlertsCard role={role} /></div>
        <ul className="mt-4 space-y-1.5">
          {reqs.map(r => (
            <li key={r.id} className="rounded border border-slate-200 p-2 text-xs">
              <b>{label('status', r.type)}</b> · {label('status', r.status)} · {new Date(r.createdAt).toLocaleDateString('en-IN')}
              {r.resolutionNote && <div className="text-slate-500">{r.resolutionNote}</div>}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex gap-4 text-xs"><a className="text-blue-700 underline" href="#/privacy" onClick={onClose}>{tx('Privacy Policy', 'गोपनीयता नीति')}</a><a className="text-blue-700 underline" href="#/terms" onClick={onClose}>{tx('Terms', 'नियम व शर्तें')}</a></div>
      </div>
    </div>
  );
};

/** Admin / Grievance Officer queue (DPDP requests must be answered within the published SLA). */
export const PrivacyQueue: React.FC = () => {
  const tx = useTx();
  const label = useLabel();
  const [reqs, setReqs] = useState<(Req & { userName: string; userId: string })[]>([]);
  const [err, setErr] = useState('');
  const load = () => j('/api/privacy/requests').then(d => setReqs(d.requests)).catch(() => {});
  useEffect(() => { load(); }, []);
  const resolve = async (id: string, decision: 'COMPLETE' | 'REJECT') => {
    try {
      const note = decision === 'REJECT' ? prompt(tx('Reason for rejection', 'अस्वीकार करने का कारण')) || '' : '';
      await j(`/api/privacy/requests/${id}/resolve`, { method: 'POST', body: JSON.stringify({ decision, note }) });
      setErr(''); load();
    } catch (e: any) { setErr(e.message); }
  };
  const open = reqs.filter(r => r.status === 'OPEN');
  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-bold text-slate-900">{tx('Privacy requests (DPDP)', 'प्राइवेसी अनुरोध (DPDP)')} — {open.length} {tx('open', 'खुले')}</h3>
      {err && <p className="mt-2 text-xs font-medium text-red-700">{err}</p>}
      <ul className="mt-3 space-y-2">
        {reqs.slice(0, 20).map(r => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 p-2 text-xs">
            <span><b>{label('status', r.type)}</b> · {r.userName} · {new Date(r.createdAt).toLocaleDateString('en-IN')} · {label('status', r.status)}{r.details ? ` — ${r.details}` : ''}</span>
            {r.status === 'OPEN' && (
              <span className="flex gap-1.5">
                <button onClick={() => resolve(r.id, 'COMPLETE')} className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white">{tx('Complete', 'पूरा करें')}</button>
                <button onClick={() => resolve(r.id, 'REJECT')} className="rounded bg-slate-200 px-2 py-1 font-semibold text-slate-800">{tx('Reject', 'अस्वीकार')}</button>
              </span>
            )}
          </li>
        ))}
        {reqs.length === 0 && <li className="text-xs text-slate-500">{tx('No requests.', 'कोई अनुरोध नहीं।')}</li>}
      </ul>
    </div>
  );
};
