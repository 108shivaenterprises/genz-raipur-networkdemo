/** v26 — phone alerts (Web Push): on/off for this phone + what to hear about. v59 — the words follow the person's role, and a
 *  small "turn on alerts" card sits on the home of every role (the broker has it in his first steps). */
import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { pushState, enablePush, disablePush, type PushState } from '../lib/push.js';

type Kind = { k: string; en: string; hi: string };
const QUIET: Kind = { k: 'quiet', en: 'Silent 10 PM – 7 AM', hi: 'रात 10 – सुबह 7 शांत' };
const BROKER_KINDS: Kind[] = [
  { k: 'matches', en: 'New match for my clients', hi: 'मेरे क्लाइंट के लिए नया मैच' },
  { k: 'broadcast', en: 'Buyer needs from brokers + builder notices', hi: 'ब्रोकरों की खरीदार ज़रूरत + बिल्डर की सूचना' },
  { k: 'consent', en: 'Owner said yes / no', hi: 'मालिक ने हाँ / ना कहा' },
  { k: 'deals', en: 'Offers, deals, builder leads & payouts', hi: 'ऑफ़र, डील, बिल्डर लीड और पेमेंट' },
  { k: 'digest', en: '9 AM daily summary', hi: 'सुबह 9 बजे का सार' },
  QUIET,
];
/** what "work alerts" means for each role (one switch + the night silence) */
const ROLE_WORK: Record<string, { en: string; hi: string; why: [string, string] }> = {
  DEVELOPER_BUILDER: { en: 'Partner requests, leads, bookings & money', hi: 'पार्टनर की माँग, लीड, बुकिंग और पैसा',
    why: ['Know within seconds when a partner registers a lead, asks to book a unit, or confirms a payment.', 'सेकंडों में पता चलेगा जब कोई पार्टनर लीड जोड़े, यूनिट बुक करने को कहे, या पेमेंट कन्फ़र्म करे।'] },
  TEAM_MEMBER: { en: 'Leads, deals & messages for my work', hi: 'मेरे काम की लीड, डील और संदेश',
    why: ['Know within seconds when your office gives you a lead or a deal, or a client writes.', 'सेकंडों में पता चलेगा जब ऑफ़िस आपको लीड या डील दे, या कोई क्लाइंट लिखे।'] },
  LEGAL_COUNSEL: { en: 'New legal cases, quotes accepted, messages', hi: 'नए क़ानूनी केस, फ़ीस मंज़ूर, संदेश',
    why: ['Know within seconds when a broker in your state asks for legal help — the first counsellor to take it gets the case.', 'सेकंडों में पता चलेगा जब आपके राज्य का कोई ब्रोकर क़ानूनी मदद माँगे — पहले लेने वाले को केस मिलता है।'] },
  CONTRACTOR: { en: 'New construction leads, referral updates', hi: 'नई कंस्ट्रक्शन लीड, रेफ़रल अपडेट',
    why: ['Know within seconds when a broker posts a construction job in your city — the first to accept gets the customer.', 'सेकंडों में पता चलेगा जब कोई ब्रोकर आपके शहर में कंस्ट्रक्शन का काम डाले — पहले मानने वाले को ग्राहक मिलता है।'] },
  GENZ_CONNECTOR: { en: 'Updates on my referrals', hi: 'मेरे रेफ़रल के अपडेट', why: ['Know within seconds when a person you referred moves ahead.', 'सेकंडों में पता चलेगा जब आपका रेफ़र किया व्यक्ति आगे बढ़े।'] },
  ADMIN: { en: 'Reports and checks waiting for GENZ', hi: 'GENZ के पास जाँच के लिए रिपोर्ट', why: ['Know within seconds when a report or a photo needs a GENZ check.', 'सेकंडों में पता चलेगा जब किसी रिपोर्ट या फ़ोटो को GENZ की जाँच चाहिए।'] },
  PROPERTY_OWNER: { en: 'Updates on my property deals', hi: 'मेरी प्रॉपर्टी डील के अपडेट', why: ['Know within seconds when something on your property deal needs you.', 'सेकंडों में पता चलेगा जब आपकी प्रॉपर्टी डील में आपकी ज़रूरत हो।'] },
  BUYER_TENANT: { en: 'Updates on my deals', hi: 'मेरी डील के अपडेट', why: ['Know within seconds when something on your deal needs you.', 'सेकंडों में पता चलेगा जब आपकी डील में आपकी ज़रूरत हो।'] },
};
ROLE_WORK.SUPERADMIN = ROLE_WORK.ADMIN;
const kindsFor = (role?: string): Kind[] => {
  if (!role || role === 'BROKER') return BROKER_KINDS;
  const w = ROLE_WORK[role]; return [{ k: 'deals', en: w?.en || 'Work updates', hi: w?.hi || 'काम के अपडेट' }, QUIET];
};
const BROKER_WHY: [string, string] = ['Know within seconds when a listing fits your client, a broker needs what you have, or an owner says yes.', 'सेकंडों में पता चलेगा जब कोई लिस्टिंग आपके क्लाइंट से मिले, किसी ब्रोकर को आपकी प्रॉपर्टी चाहिए, या मालिक हाँ कहे।'];
const whyFor = (role?: string): [string, string] => (!role || role === 'BROKER') ? BROKER_WHY : ROLE_WORK[role]?.why || ['Know within seconds when something on GENZ needs you.', 'सेकंडों में पता चलेगा जब GENZ पर कुछ आपके लिए हो।'];

export const AlertsCard: React.FC<{ compact?: boolean; role?: string; onState?: (s: PushState) => void }> = ({ compact, role, onState }) => {
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
        : tx(...whyFor(role))}</p>}
      {on && prefs && !compact && (
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {kindsFor(role).map(x => <label key={x.k} className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={!!prefs[x.k]} onChange={e => setPref(x.k, e.target.checked)} /> {tx(x.en, x.hi)}</label>)}
        </div>
      )}
      {msg && <p className="mt-1 text-xs text-slate-700">{msg}</p>}
    </div>
  );
};

/** v59 — on the home of every role except the broker (his "first steps" carry it): shown until alerts are on; "Not now" hides it
 *  on this phone for 14 days. Once the person turns alerts on here, the card stays for this visit so he sees the confirmation. */
const NUDGE_KEY = 'genz.alertsNudge.until';
export const AlertsNudge: React.FC<{ role: string }> = ({ role }) => {
  const tx = useTx();
  const [first, setFirst] = useState<PushState | null>(null);
  const [hidden, setHidden] = useState(() => { try { return Number(localStorage.getItem(NUDGE_KEY) || 0) > Date.now(); } catch { return false; } });
  useEffect(() => { pushState().then(setFirst).catch(() => setFirst('unsupported')); }, []);
  if (hidden || first === null || first === 'on') return null;
  const later = () => { try { localStorage.setItem(NUDGE_KEY, String(Date.now() + 14 * 86400_000)); } catch { /* storage blocked: hide for this visit */ } setHidden(true); };
  return (
    <div className="mb-4" data-testid="alerts-nudge">
      <AlertsCard role={role} />
      <div className="mt-1 text-right">
        <button onClick={later} className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[11px] font-medium text-slate-500 hover:text-slate-800" data-testid="alerts-nudge-later">
          <X className="h-3 w-3" /> {tx('Not now', 'अभी नहीं')}
        </button>
      </div>
    </div>
  );
};
