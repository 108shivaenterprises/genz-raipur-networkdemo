/**
 * v81 — the call itself: the two phones talk to each other directly (WebRTC); GENZ only passes the small "hello" notes (signals) and keeps
 * the call's record. No phone number is on this screen, or anywhere in the call.
 * Recording is never silent: the red bar is on BOTH screens while it runs, and it starts only after "Allow" (or the employer's own rule).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Circle, Loader2, ShieldCheck } from 'lucide-react';
import { useTx } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';

export interface CallView {
  id: string; context: string; status: 'RINGING' | 'ACTIVE' | 'ENDED' | 'MISSED' | 'DECLINED' | 'CANCELLED'; role: 'caller' | 'callee';
  peer: { id: string; name: string }; answeredAt?: string; durationSec: number; ringLeftSec: number;
  record: 'OFF' | 'ASKED' | 'ON' | 'DENIED'; recordMode: 'FORBIDDEN' | 'ASK' | 'ALWAYS'; recordByMe: boolean; recordByName?: string; askedByMe: boolean; live: boolean;
}
const DONE = ['ENDED', 'MISSED', 'DECLINED', 'CANCELLED'];
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const REC_FLUSH_MS = 45_000;

/** the audio format this phone's recorder can make (Chrome / Android: webm, iPhone Safari: mp4) */
function pickRecorderMime(): string {
  const M = (window as any).MediaRecorder; if (!M?.isTypeSupported) return '';
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => M.isTypeSupported(t)) || '';
}

export const CallScreen: React.FC<{ initial: CallView; stream: MediaStream; iceServers: RTCIceServer[]; onClose: () => void }> = ({ initial, stream, iceServers, onClose }) => {
  const tx = useTx();
  const [call, setCall] = useState<CallView>(initial);
  const [conn, setConn] = useState<'new' | 'connecting' | 'connected' | 'reconnecting' | 'failed'>('new');
  const [muted, setMuted] = useState(false);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<'' | 'saving' | 'yes' | 'no'>('');
  const callRef = useRef(call); callRef.current = call;
  const pc = useRef<RTCPeerConnection | null>(null);
  const audioEl = useRef<HTMLAudioElement>(null);
  const remote = useRef<MediaStream | null>(null);
  const lastSeq = useRef(0);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const sendQ = useRef<Promise<unknown>>(Promise.resolve());
  const offered = useRef(false);
  const stopped = useRef(false);
  // recording state
  const rec = useRef<{ mr: MediaRecorder; ac: AudioContext; buf: Blob[]; seq: number; timer: number; uploading: boolean } | null>(null);
  const recDone = useRef(false);

  const send = useCallback((kind: string, data: unknown) => {
    sendQ.current = sendQ.current.then(() => api.callSignal(callRef.current.id, kind, JSON.stringify(data))).catch(() => { /* the poll shows the call's real state */ });
  }, []);

  const makePc = useCallback(() => {
    if (pc.current) return pc.current;
    const p = new RTCPeerConnection({ iceServers });
    stream.getTracks().forEach(t => p.addTrack(t, stream));
    p.onicecandidate = e => { if (e.candidate) send('ice', e.candidate.toJSON()); };
    p.ontrack = e => {
      remote.current = e.streams[0] || new MediaStream([e.track]);
      if (audioEl.current) { audioEl.current.srcObject = remote.current; audioEl.current.play().catch(() => { /* needs a tap on some phones — the end button is one */ }); }
    };
    p.onconnectionstatechange = () => {
      const s = p.connectionState;
      setConn(s === 'connected' ? 'connected' : s === 'connecting' || s === 'new' ? 'connecting' : s === 'failed' ? 'failed' : 'reconnecting');
      if (s === 'failed' && callRef.current.role === 'caller' && !stopped.current) {
        p.createOffer({ iceRestart: true }).then(o => p.setLocalDescription(o).then(() => send('offer', o))).catch(() => { /* the other phone may have left */ });
      }
    };
    pc.current = p; return p;
  }, [iceServers, send, stream]);

  const flushIce = useCallback(async () => {
    const p = pc.current; if (!p?.remoteDescription) return;
    for (const c of pendingIce.current.splice(0)) { try { await p.addIceCandidate(c); } catch { /* an old path */ } }
  }, []);

  const handle = useCallback(async (kind: string, raw: string) => {
    let data: any; try { data = JSON.parse(raw); } catch { return; }
    const p = makePc();
    if (kind === 'offer') {
      await p.setRemoteDescription(data); await flushIce();
      const a = await p.createAnswer(); await p.setLocalDescription(a); send('answer', a);
    } else if (kind === 'answer') {
      if (p.signalingState === 'have-local-offer') { await p.setRemoteDescription(data); await flushIce(); }
    } else if (kind === 'ice') {
      if (p.remoteDescription) { try { await p.addIceCandidate(data); } catch { /* an old path */ } } else pendingIce.current.push(data);
    }
  }, [flushIce, makePc, send]);

  // ── recording (only the phone that asked records; the pieces go to the server about every 45 seconds) ──
  type Rec = { mr: MediaRecorder; ac: AudioContext; buf: Blob[]; seq: number; timer: number; uploading: boolean };
  const uploadPieces = useCallback(async (r: Rec, last: boolean) => {
    if (last) { for (let i = 0; i < 50 && r.uploading; i++) await new Promise(res => setTimeout(res, 200)); }
    if (r.uploading) return;
    if (!r.buf.length && !last) return;
    r.uploading = true;
    try {
      if (r.buf.length) {
        const blob = new Blob(r.buf, { type: r.buf[0].type || 'audio/webm' });
        await api.callChunk(callRef.current.id, r.seq, blob);
        r.buf = []; r.seq += 1;
      }
      if (last && !recDone.current) { recDone.current = true; setSaved('saving'); const f = await api.callRecordFinish(callRef.current.id); setSaved(f.saved ? 'yes' : 'no'); }
    } catch { /* the pieces stay in memory and go with the next try */ }
    finally { r.uploading = false; }
  }, []);
  const startRecording = useCallback(() => {
    if (rec.current || recDone.current || !remote.current) return;
    const mime = pickRecorderMime(); if (!mime) return;
    try {
      const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
      const dest = ac.createMediaStreamDestination();
      ac.createMediaStreamSource(stream).connect(dest);
      ac.createMediaStreamSource(remote.current).connect(dest);
      const mr = new MediaRecorder(dest.stream, { mimeType: mime, audioBitsPerSecond: 24000 });
      const r: Rec = { mr, ac, buf: [], seq: 0, timer: 0, uploading: false };
      mr.ondataavailable = e => { if (e.data && e.data.size) r.buf.push(e.data); };
      mr.onstop = () => { void uploadPieces(r, true).finally(() => { try { void ac.close(); } catch { /* closed */ } }); };
      mr.start(10_000);
      r.timer = window.setInterval(() => { void uploadPieces(r, false); }, REC_FLUSH_MS);
      rec.current = r;
    } catch { setErr(tx('This phone could not start the recording.', 'इस फ़ोन पर रिकॉर्डिंग शुरू नहीं हो सकी।')); }
  }, [stream, tx, uploadPieces]);
  const stopRecording = useCallback(() => {
    const r = rec.current; if (!r) return;
    window.clearInterval(r.timer); rec.current = null;
    try { if (r.mr.state !== 'inactive') r.mr.stop(); else void uploadPieces(r, true); } catch { void uploadPieces(r, true); }
  }, [uploadPieces]);

  const teardown = useCallback(() => {
    if (stopped.current) return; stopped.current = true;
    stopRecording();
    try { pc.current?.close(); } catch { /* closed */ }
    pc.current = null; stream.getTracks().forEach(t => t.stop());
  }, [stopRecording, stream]);

  // ── the heartbeat: what the other phone sent + the call's state, about once a second ──
  useEffect(() => {
    let alive = true; let inflight = false;
    const tick = async () => {
      if (inflight || !alive) return; inflight = true;
      try {
        const r = await api.callSignals(callRef.current.id, lastSeq.current);
        if (!alive) return;
        setCall(r.call);
        const c = r.call as CallView;
        // the caller opens the line as soon as the other side answers
        if (c.status === 'ACTIVE' && c.role === 'caller' && !offered.current) {
          offered.current = true; const p = makePc(); setConn('connecting');
          const o = await p.createOffer(); await p.setLocalDescription(o); send('offer', o);
        }
        if (c.status === 'ACTIVE' && c.role === 'callee') makePc();
        for (const s of r.signals) { lastSeq.current = Math.max(lastSeq.current, s.seq); await handle(s.kind, s.data); }
        if (DONE.includes(c.status)) { teardown(); }
      } catch (e: any) { if (e?.status === 404 || e?.status === 401) { teardown(); setCall(x => ({ ...x, status: 'ENDED', live: false })); } }
      finally { inflight = false; }
    };
    void tick(); const t = window.setInterval(tick, 1000);
    return () => { alive = false; window.clearInterval(t); };
  }, [handle, makePc, send, teardown]);

  // a callee who answered is already ACTIVE: make the connection ready for the offer
  useEffect(() => { if (initial.role === 'callee' && initial.status === 'ACTIVE') makePc(); }, [initial.role, initial.status, makePc]);

  // the recording phone starts when recording is ON and the line is up; it stops when recording is switched off or the call ends
  useEffect(() => {
    if (call.record === 'ON' && call.recordByMe && conn === 'connected' && call.status === 'ACTIVE') startRecording();
    if ((call.record !== 'ON' || DONE.includes(call.status)) && rec.current && call.recordByMe) stopRecording();
  }, [call.record, call.recordByMe, call.status, conn, startRecording, stopRecording]);

  // the clock
  useEffect(() => {
    if (call.status !== 'ACTIVE' || !call.answeredAt) return;
    const t = window.setInterval(() => setSecs(Math.max(0, Math.round((Date.now() - Date.parse(call.answeredAt!)) / 1000))), 500);
    return () => window.clearInterval(t);
  }, [call.status, call.answeredAt]);

  // keep the screen awake while talking, and tell the server if the page is closed in the middle of the call
  useEffect(() => {
    let lock: any = null; try { (navigator as any).wakeLock?.request('screen').then((l: any) => { lock = l; }).catch(() => { /* not allowed */ }); } catch { /* not supported */ }
    const bye = () => { if (!DONE.includes(callRef.current.status)) { try { navigator.sendBeacon(`/api/calls/${callRef.current.id}/end`, new Blob(['{}'], { type: 'application/json' })); } catch { /* the server ends a silent call by itself */ } } };
    window.addEventListener('pagehide', bye);
    return () => { window.removeEventListener('pagehide', bye); try { lock?.release(); } catch { /* released */ } teardown(); };
  }, [teardown]);

  useEffect(() => { stream.getAudioTracks().forEach(t => { t.enabled = !muted; }); }, [muted, stream]);

  const act = async (fn: () => Promise<any>) => { setBusy(true); setErr(''); try { await fn(); } catch (e: any) { setErr(e.message || 'Error'); } finally { setBusy(false); } };
  const hangUp = () => act(async () => {
    const c = callRef.current;
    if (c.status === 'RINGING' && c.role === 'caller') await api.callCancel(c.id); else await api.callEnd(c.id);
    setCall(x => ({ ...x, status: c.status === 'RINGING' ? 'CANCELLED' : 'ENDED', live: false })); teardown();
  });
  const record = (a: 'ask' | 'allow' | 'deny' | 'stop') => act(async () => { const r = await api.callRecord(call.id, a); setCall(r.call); });

  const ended = DONE.includes(call.status);
  const title = call.status === 'RINGING' ? (call.role === 'caller' ? tx('Calling…', 'कॉल लग रही है…') : tx('Connecting…', 'जुड़ रहा है…'))
    : call.status === 'ACTIVE' ? (conn === 'connected' ? mmss(secs) : conn === 'failed' ? tx('Could not connect', 'जुड़ नहीं पाया') : tx('Connecting…', 'जुड़ रहा है…'))
    : call.status === 'MISSED' ? tx('No answer', 'किसी ने नहीं उठाया') : call.status === 'DECLINED' ? tx('Call declined', 'कॉल नहीं ली') : call.status === 'CANCELLED' ? tx('Call cancelled', 'कॉल रद्द') : `${tx('Call ended', 'कॉल ख़त्म')} · ${mmss(call.durationSec || secs)}`;
  const recOn = call.record === 'ON';
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-900 text-white" role="dialog" aria-label={tx('Voice call', 'आवाज़ वाली कॉल')} data-testid="call-screen">
      <audio ref={audioEl} autoPlay playsInline />
      {recOn && <div className="flex items-center justify-center gap-2 bg-red-600 px-3 py-2 text-xs font-semibold" role="status" data-testid="call-rec-bar"><Circle className="h-3 w-3 animate-pulse fill-white" />{tx('This call is being recorded', 'यह कॉल रिकॉर्ड हो रही है')}{call.recordByName ? ` (${call.recordByName})` : ''}</div>}
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-700 text-3xl font-bold">{call.peer.name.trim().slice(0, 1).toUpperCase()}</div>
        <div className="text-xl font-bold" data-testid="call-peer">{call.peer.name}</div>
        <div className="text-sm text-slate-300" aria-live="polite" data-testid="call-title">{title}{!ended && conn === 'reconnecting' && ` · ${tx('network weak…', 'नेटवर्क कमज़ोर…')}`}</div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><ShieldCheck className="h-3.5 w-3.5" />{tx('No phone number is shown or shared on this call.', 'इस कॉल में कोई फ़ोन नंबर नहीं दिखता, न साझा होता है।')}</div>

        {!ended && call.status === 'ACTIVE' && call.recordMode === 'ASK' && call.record !== 'ON' && (
          <div className="mt-2 w-full max-w-xs space-y-2 rounded-xl bg-slate-800 p-3 text-xs">
            {call.record === 'ASKED' && !call.askedByMe && (<>
              <div className="font-semibold">{tx(`${call.peer.name} wants to record this call.`, `${call.peer.name} यह कॉल रिकॉर्ड करना चाहते हैं।`)}</div>
              <div className="flex gap-2"><button disabled={busy} onClick={() => record('allow')} className="min-h-11 flex-1 rounded-lg bg-emerald-600 font-semibold" data-testid="call-rec-allow">{tx('Allow', 'अनुमति दें')}</button><button disabled={busy} onClick={() => record('deny')} className="min-h-11 flex-1 rounded-lg bg-slate-600 font-semibold" data-testid="call-rec-deny">{tx('Not now', 'अभी नहीं')}</button></div>
            </>)}
            {call.record === 'ASKED' && call.askedByMe && <div className="text-slate-300">{tx('Waiting for the other side to allow the recording…', 'दूसरी तरफ़ की अनुमति का इंतज़ार…')}</div>}
            {(call.record === 'OFF' || call.record === 'DENIED') && (<>
              {call.record === 'DENIED' && <div className="text-slate-300">{tx('The other side said no.', 'दूसरी तरफ़ से मना हुआ।')}</div>}
              <button disabled={busy} onClick={() => record('ask')} className="min-h-11 w-full rounded-lg border border-slate-500 font-semibold" data-testid="call-rec-ask">{tx('Ask to record this call', 'यह कॉल रिकॉर्ड करने की अनुमति माँगें')}</button>
            </>)}
          </div>
        )}
        {!ended && recOn && call.recordMode === 'ASK' && <button disabled={busy} onClick={() => record('stop')} className="text-xs text-slate-300 underline" data-testid="call-rec-stop">{tx('Stop the recording (it cannot be started again)', 'रिकॉर्डिंग रोकें (दोबारा शुरू नहीं होगी)')}</button>}
        {!ended && recOn && call.recordMode === 'ALWAYS' && <div className="max-w-xs text-[11px] text-slate-300">{tx('Calls with the office are recorded under the owner\'s rule.', 'ऑफ़िस के साथ की कॉल मालिक के नियम से रिकॉर्ड होती हैं।')}</div>}
        {ended && saved && <div className="text-[11px] text-slate-300" data-testid="call-saved">{saved === 'saving' ? tx('Saving the recording…', 'रिकॉर्डिंग सहेजी जा रही है…') : saved === 'yes' ? tx('Recording saved. Find it in Calls.', 'रिकॉर्डिंग सहेज ली गई। उसे Calls में देखें।') : tx('The recording could not be saved.', 'रिकॉर्डिंग सहेजी नहीं जा सकी।')}</div>}
        {err && <div className="rounded bg-red-900/60 px-3 py-2 text-xs text-red-100" role="alert">{err}</div>}
      </div>
      <div className="flex items-center justify-center gap-6 px-6 pb-10 pt-4">
        {!ended && <button onClick={() => setMuted(m => !m)} className={`flex h-14 w-14 items-center justify-center rounded-full ${muted ? 'bg-white text-slate-900' : 'bg-slate-700'}`} aria-label={muted ? tx('Unmute', 'आवाज़ चालू') : tx('Mute', 'म्यूट')} aria-pressed={muted} data-testid="call-mute">{muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}</button>}
        {!ended
          ? <button disabled={busy} onClick={hangUp} className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600" aria-label={tx('End call', 'कॉल ख़त्म करें')} data-testid="call-end">{busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <PhoneOff className="h-7 w-7" />}</button>
          : <button onClick={onClose} className="min-h-12 rounded-full bg-white px-8 font-semibold text-slate-900" data-testid="call-close">{tx('Close', 'बंद करें')}</button>}
      </div>
    </div>
  );
};
