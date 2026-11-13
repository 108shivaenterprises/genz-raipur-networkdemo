import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, Save, Trash2, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';

type Key = Awaited<ReturnType<typeof api.apiKeys>>['keys'][number];

/** v135 — superadmin types the API keys here; every flow (SMS, OTP, calls) uses them on its next request. */
export const ApiKeysView: React.FC = () => {
  const tx = useTx();
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [vault, setVault] = useState(true);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    try { const r = await api.apiKeys(); setKeys(r.keys); setVault(r.vault); }
    catch (e: any) { setMsg({ ok: false, text: e?.message || tx('Could not load', 'लोड नहीं हुआ') }); setKeys([]); }
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (k: Key, value: string) => {
    setBusy(k.name); setMsg(null);
    try {
      await api.setApiKey(k.name, value);
      setDraft(d => ({ ...d, [k.name]: '' }));
      setMsg({ ok: true, text: value ? tx(`${k.label} saved — in use everywhere now.`, `${k.label} सेव हुई — अब हर जगह यही चलेगी।`) : tx(`${k.label} removed from here.`, `${k.label} यहाँ से हटाई गई।`) });
      await load();
    } catch (e: any) { setMsg({ ok: false, text: e?.message || tx('Could not save', 'सेव नहीं हुआ') }); }
    finally { setBusy(''); }
  };

  const groups = [...new Set((keys || []).map(k => k.group))];
  const chip = (k: Key) => k.source === 'panel'
    ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">{tx('Set here', 'यहाँ से लगी')}</span>
    : k.source === 'server' ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{tx('From server settings', 'सर्वर सेटिंग से')}</span>
    : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{tx('Not set', 'नहीं लगी')}</span>;

  return (
    <section className="space-y-4" data-testid="api-keys">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><KeyRound className="h-5 w-5 text-amber-500" />{tx('API Keys', 'API कीज़')}</h2>
        <p className="mt-1 text-sm text-slate-600">{tx('A key saved here is used at once by every part of the app (SMS, OTP, calls). Leave it empty to use the server setting. A saved secret is never shown again — only its last 4 characters.',
          'यहाँ सेव की गई key तुरंत पूरे ऐप में लगती है (SMS, OTP, कॉल)। खाली छोड़ें तो सर्वर सेटिंग वाली चलेगी। सेव होने के बाद पूरी key दोबारा नहीं दिखती — सिर्फ़ आख़िरी 4 अक्षर।')}</p>
        {!vault && <p role="alert" className="mt-2 flex items-start gap-2 rounded-lg bg-red-50 p-2 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{tx('The server vault key is missing, so keys cannot be stored here safely.', 'सर्वर की वॉल्ट key नहीं है, इसलिए यहाँ keys सुरक्षित नहीं रखी जा सकतीं।')}</p>}
        {msg && <p role="status" className={`mt-2 rounded-lg p-2 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{msg.text}</p>}
      </div>
      {keys === null && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{tx('Loading…', 'लोड हो रहा है…')}</p>}
      {groups.map(g => (
        <div key={g} className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">{g}</h3>
          <ul className="space-y-3">
            {(keys || []).filter(k => k.group === g).map(k => (
              <li key={k.name} className="rounded-xl border border-slate-100 p-3" data-testid={`key-${k.name}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">{k.label}</span>{chip(k)}
                  <code className="text-[11px] text-slate-400">{k.name}</code>
                </div>
                {k.shown && <p className="mt-1 break-all font-mono text-xs text-slate-600">{k.shown}</p>}
                {k.updatedAt && <p className="mt-0.5 text-[11px] text-slate-400">{tx('Changed', 'बदली')} {new Date(k.updatedAt).toLocaleString()}{k.updatedBy ? ` · ${k.updatedBy}` : ''}</p>}
                <form className="mt-2 flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); if ((draft[k.name] || '').trim()) void save(k, draft[k.name]); }}>
                  <input type={k.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={draft[k.name] || ''} onChange={e => setDraft(d => ({ ...d, [k.name]: e.target.value }))}
                    placeholder={k.source === 'none' ? tx('Paste here', 'यहाँ पेस्ट करें') : tx('New value', 'नई value')} aria-label={k.label}
                    className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm" />
                  <button type="submit" disabled={busy === k.name || !vault || !(draft[k.name] || '').trim()} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-40">
                    {busy === k.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{tx('Save', 'सेव')}
                  </button>
                  {k.source === 'panel' && <button type="button" disabled={busy === k.name} onClick={() => void save(k, '')} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-300 px-3 text-sm text-slate-700">
                    <Trash2 className="h-4 w-4" />{tx('Remove', 'हटाएँ')}
                  </button>}
                </form>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
};
