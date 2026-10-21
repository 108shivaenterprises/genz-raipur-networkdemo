/** v26 — phone alerts (Web Push): on/off for this phone + what to hear about. */
import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { pushState, enablePush, disablePush, type PushState } from '../lib/push.js';

const KINDS: { k: string; en: string; hi: string }[] = [
  { k: 'matches', en: 'New match for my clients', hi: 'मेरे क्लाइंट के लिए नया मैच' },
  { k: 'broadcast', en: 'Buyer needs from other brokers', hi: 'दूसरे ब्रोकरों की खरीदार ज़रूरत' },
  { k: 'consent', en: 'Owner said yes / no', hi: 'मालिक ने हाँ / ना कहा' },
  { k: 'deals', en: 'Offers and deals', hi: 'ऑफ़र और डील' },
  { k: 'digest', en: '9 AM daily summary', hi: 'सुबह 9 बजे का सार' },
  { k: 'quiet', en: 'Silent 10 PM – 7 AM', hi: 'रात 10 – सुबह 7 शांत' },
];

export const AlertsCard: React.FC<{ compact?: boolean; onState?: (s: PushState) => void }> = ({ compact, onState }) => {
  const tx = useTx();
  const [state, setState] = useState<PushState | null>(null);
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  useEffect(() => { pushState().then(setState); api.pushPrefs().then(r => setPrefs(r.prefs)).catch(() => {}); }, []);
  const toggle = async () => {
    setBusy(true); setMsg('');
    try {
      const s = state === 'on' ? await disablePush() : await enablePush();
      setState(s); onState?.(s);
      if (s === 'on') { await api.pushTest().catch(() => {}); setMsg(tx('Alerts are on — a test alert was sent.', 'अलर्ट चालू — एक टेस्ट अलर्ट भेजा गया।')); }
      if (s === 'blocked') setMsg(tx('The browser blocked alerts. Allow notifications for this site in the browser settings.', 'ब्राउज़र ने अलर्ट रोक दिए। ब्राउज़र सेटिंग में इस साइट के नोटिफ़िकेशन चालू करें।'));
    } catch (e: any) { setMsg(e.message || 'Error'); } finally { setBusy(false); }
  };
  const setPref = async (k: string, v: boolean) => { if (!prefs) return; const n = { ...prefs, [k]: v }; setPrefs(n); try { await api.pushPrefsSave({ [k]: v }); } catch { /* keep the screen state */ } };
  if (state === null) return null;
  const on = state === 'on';
  return (
    <div className={`rounded-xl border p-3 ${on ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-300 bg-amber-50'}`} data-testid="alerts-card">
      <div className="flex items-center gap-2">
        {on ? <Bell className="h-4 w-4 text-emerald-600" /> : <BellOff className="h-4 w-4 text-amber-600" />}
        <p className="flex-1 text-sm font-semibold text-slate-900">{on ? tx('Phone alerts are on', 'फ़ोन अलर्ट चालू हैं') : tx('Turn on phone alerts', 'फ़ोन अलर्ट चालू करें')}</p>
        {state !== 'unsupported' && <button onClick={toggle} disabled={busy} className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${on ? 'bg-slate-500' : 'bg-emerald-600'}`} data-testid="alerts-toggle">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : on ? tx('Turn off', 'बंद करें') : tx('Turn on', 'चालू करें')}
        </button>}
      </div>
      {!on && !compact && <p className="mt-1 text-xs text-slate-600">{state === 'unsupported'
        ? tx('This browser cannot show alerts. On iPhone: add GENZ to the Home Screen first (Share → Add to Home Screen), then open it from there.', 'यह ब्राउज़र अलर्ट नहीं दिखा सकता। iPhone पर: पहले GENZ को होम स्क्रीन पर जोड़ें (Share → Add to Home Screen), फिर वहीं से खोलें।')
        : tx('Know within seconds when a listing fits your client, a broker needs what you have, or an owner says yes.', 'सेकंडों में पता चलेगा जब कोई लिस्टिंग आपके क्लाइंट से मिले, किसी ब्रोकर को आपकी प्रॉपर्टी चाहिए, या मालिक हाँ कहे।')}</p>}
      {on && prefs && !compact && (
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {KINDS.map(x => <label key={x.k} className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={!!prefs[x.k]} onChange={e => setPref(x.k, e.target.checked)} /> {tx(x.en, x.hi)}</label>)}
        </div>
      )}
      {msg && <p className="mt-1 text-xs text-slate-700">{msg}</p>}
    </div>
  );
};
