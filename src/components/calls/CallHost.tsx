/**
 * v81 — the one place that rings and starts calls. Wrap the signed-in app in <CallHost>; any screen can then use useCalls().start(…).
 * It asks the server "is someone calling me?" every few seconds while the app is open (and a phone alert wakes the app when it is closed),
 * shows the incoming-call sheet, and opens the call screen. The microphone is asked for ONLY when a person taps Call or Answer.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Phone, PhoneOff, X } from 'lucide-react';
import { useTx } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';
import { CallScreen, type CallView } from './CallScreen.js';

export interface StartOpts { toUserId: string; name: string; context: 'TEAM' | 'DEAL' | 'PARTNER'; contextId?: string }
interface CallsApi { start: (o: StartOpts) => Promise<void>; busy: boolean }
const Ctx = createContext<CallsApi | null>(null);
/** null when the app has no call tool for this person — screens then hide their Call buttons */
export const useCalls = () => useContext(Ctx);

const RING_POLL_MS = 5000;

async function mic(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('NO_MIC_API');
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
}

export const CallHost: React.FC<{ enabled: boolean; children: React.ReactNode }> = ({ enabled, children }) => {
  const tx = useTx();
  const [screen, setScreen] = useState<{ call: CallView; stream: MediaStream } | null>(null);
  const [ring, setRing] = useState<CallView | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const iceRef = useRef<RTCIceServer[] | null>(null);
  const screenRef = useRef(screen); screenRef.current = screen;
  const first = useRef(true);

  const micError = useCallback((e: any) => {
    const n = e?.name || e?.message || '';
    setErr(n === 'NotAllowedError' || n === 'PermissionDeniedError' ? tx('The microphone is blocked. Allow it in the browser\'s site settings and try again.', 'माइक बंद है। ब्राउज़र की साइट सेटिंग में माइक की अनुमति दें और फिर कोशिश करें।')
      : n === 'NotFoundError' ? tx('No microphone was found on this phone.', 'इस फ़ोन में माइक नहीं मिला।')
      : tx('Calls need the microphone and a secure (https) page.', 'कॉल के लिए माइक और सुरक्षित (https) पेज चाहिए।'));
  }, [tx]);
  const ice = useCallback(async () => {
    if (!iceRef.current) { const c = await api.callConfig(); iceRef.current = c.iceServers as RTCIceServer[]; }
    return iceRef.current;
  }, []);

  const start = useCallback(async (o: StartOpts) => {
    if (screenRef.current || busy) return; setErr(''); setBusy(true);
    let stream: MediaStream | null = null;
    try {
      stream = await mic();
      await ice();
      const r = await api.callStart({ toUserId: o.toUserId, context: o.context, contextId: o.contextId });
      setScreen({ call: r.call, stream });
    } catch (e: any) {
      stream?.getTracks().forEach(t => t.stop());
      if (e?.status) setErr(e.message || tx('The call could not start.', 'कॉल शुरू नहीं हो सकी।')); else micError(e);
    } finally { setBusy(false); }
  }, [busy, ice, micError, tx]);

  const answer = useCallback(async () => {
    if (!ring || screenRef.current) return; setErr(''); setBusy(true);
    let stream: MediaStream | null = null;
    try {
      stream = await mic(); await ice();
      const r = await api.callAnswer(ring.id);
      setRing(null); setScreen({ call: r.call, stream });
    } catch (e: any) {
      stream?.getTracks().forEach(t => t.stop());
      if (e?.status) { setErr(e.message || tx('The call is over.', 'कॉल ख़त्म हो चुकी है।')); setRing(null); } else micError(e);
    } finally { setBusy(false); }
  }, [ice, micError, ring, tx]);
  const decline = useCallback(async () => { const r = ring; setRing(null); if (r) { try { await api.callDecline(r.id); } catch { /* it ended by itself */ } } }, [ring]);

  // is someone calling me?
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const poll = async () => {
      if (!alive || document.hidden || screenRef.current) return;
      try {
        const r = await api.callRing(); if (!alive) return;
        setRing(r.ring);
        // a reload in the middle of a call loses the microphone: close the old call instead of leaving the other person hanging
        if (first.current && r.active && !screenRef.current) { void api.callEnd(r.active.id).catch(() => undefined); setErr(tx('Your last call was disconnected when the app reloaded.', 'ऐप दोबारा खुलने से आपकी पिछली कॉल कट गई।')); }
        first.current = false;
      } catch { /* signed out or offline: try again later */ }
    };
    void poll(); const t = window.setInterval(poll, RING_POLL_MS);
    const wake = () => { if (!document.hidden) void poll(); };
    window.addEventListener('focus', wake); document.addEventListener('visibilitychange', wake);
    return () => { alive = false; window.clearInterval(t); window.removeEventListener('focus', wake); document.removeEventListener('visibilitychange', wake); };
  }, [enabled, tx]);

  // the ring sound + buzz while the sheet is open (some browsers keep sound off until the person has tapped something — the sheet is still there)
  useEffect(() => {
    if (!ring) return;
    let ac: AudioContext | null = null; let t = 0;
    const beep = () => {
      try {
        ac = ac || new (window.AudioContext || (window as any).webkitAudioContext)();
        for (const [at, f] of [[0, 440], [0.25, 480]] as const) {
          const o = ac.createOscillator(); const g = ac.createGain(); o.frequency.value = f; g.gain.value = 0.08; o.connect(g); g.connect(ac.destination);
          o.start(ac.currentTime + at); o.stop(ac.currentTime + at + 0.2);
        }
        navigator.vibrate?.([300, 200, 300]);
      } catch { /* silent ring */ }
    };
    beep(); t = window.setInterval(beep, 2500);
    return () => { window.clearInterval(t); try { void ac?.close(); } catch { /* closed */ } };
  }, [ring?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<CallsApi | null>(() => (enabled ? { start, busy: busy || !!screen } : null), [enabled, start, busy, screen]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {ring && !screen && (
        <div className="fixed inset-x-0 top-0 z-[65] p-3" role="alertdialog" aria-label={tx('Incoming call', 'आती हुई कॉल')} data-testid="call-incoming">
          <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-slate-900 p-3 text-white shadow-2xl">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-700 text-lg font-bold">{ring.peer.name.trim().slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{ring.peer.name}</div><div className="text-[11px] text-slate-300">{tx('GENZ voice call', 'GENZ आवाज़ कॉल')}</div></div>
            <button onClick={decline} className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600" aria-label={tx('Decline', 'काटें')} data-testid="call-decline"><PhoneOff className="h-5 w-5" /></button>
            <button disabled={busy} onClick={answer} className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600" aria-label={tx('Answer', 'उठाएँ')} data-testid="call-answer"><Phone className="h-5 w-5" /></button>
          </div>
        </div>
      )}
      {err && !screen && (
        <div className="fixed inset-x-0 bottom-20 z-[65] px-3" role="alert" data-testid="call-error">
          <div className="mx-auto flex max-w-md items-start gap-2 rounded-xl bg-red-700 p-3 text-xs text-white shadow-xl"><span className="flex-1">{err}</span><button onClick={() => setErr('')} aria-label={tx('Close', 'बंद करें')}><X className="h-4 w-4" /></button></div>
        </div>
      )}
      {screen && <CallScreen initial={screen.call} stream={screen.stream} iceServers={iceRef.current || []} onClose={() => setScreen(null)} />}
    </Ctx.Provider>
  );
};
