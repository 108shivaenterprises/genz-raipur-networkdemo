/**
 * v81 — "Calls": the owner's rule for his staff's calls (on / off, recording), and the log of calls with the recordings the person may hear.
 * Never a phone number. Audio is fetched only when "Listen" is tapped and is deleted after 30 days (or sooner, by the businesses on the call).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Play, Trash2, Loader2, Circle } from 'lucide-react';
import { useTx } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';

type Row = { id: string; context: string; with: string; staff: boolean; direction: 'in' | 'out' | 'staff'; status: string; at: string; durationSec: number; recorded: boolean; audio: boolean; deleted: boolean; expired: boolean };
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const CTX: Record<string, [string, string]> = { TEAM: ['Team', 'टीम'], DEAL: ['Deal room', 'डील रूम'], PARTNER: ['Builder / partner', 'बिल्डर / पार्टनर'] };

export const CallsPanel: React.FC = () => {
  const tx = useTx();
  const [rows, setRows] = useState<Row[] | null>(null); const [keep, setKeep] = useState(30);
  const [cfg, setCfg] = useState<{ canManage: boolean; settings: { enabled: boolean; record: 'OFF' | 'ASK' | 'ALWAYS' }; relay: boolean } | null>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(''); const [play, setPlay] = useState<{ id: string; url: string } | null>(null);
  const load = useCallback(() => {
    api.callLog().then(r => { setRows(r.calls); setKeep(r.keepDays); }).catch(e => { setRows([]); setErr(e.message); });
    api.callConfig().then(c => setCfg(c)).catch(() => undefined);
  }, []);
  useEffect(() => { load(); return () => { setPlay(p => { if (p) URL.revokeObjectURL(p.url); return null; }); }; }, [load]);
  const setRule = async (patch: Partial<{ enabled: boolean; record: 'OFF' | 'ASK' | 'ALWAYS' }>) => {
    if (!cfg) return; const next = { ...cfg.settings, ...patch }; setBusy('rule'); setErr('');
    try { await api.callSettingsSet(next); setCfg({ ...cfg, settings: next }); } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  const listen = async (id: string) => {
    setBusy(id); setErr('');
    try { if (play) URL.revokeObjectURL(play.url); setPlay({ id, url: await api.callAudio(id) }); } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  const del = async (id: string) => {
    if (!window.confirm(tx('Delete this recording for good?', 'यह रिकॉर्डिंग हमेशा के लिए मिटाएँ?'))) return;
    setBusy(id); setErr('');
    try { await api.callAudioDelete(id); if (play?.id === id) { URL.revokeObjectURL(play.url); setPlay(null); } load(); } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  const icon = (c: Row) => c.status === 'MISSED' || c.status === 'DECLINED' || c.status === 'CANCELLED' ? <PhoneMissed className="h-4 w-4 text-red-500" /> : c.direction === 'in' ? <PhoneIncoming className="h-4 w-4 text-emerald-600" /> : c.direction === 'out' ? <PhoneOutgoing className="h-4 w-4 text-sky-600" /> : <Phone className="h-4 w-4 text-slate-500" />;
  return (
    <div className="space-y-4" data-testid="calls-panel">
      {cfg?.canManage && (
        <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid="calls-rules">
          <div className="text-sm font-bold">{tx('Calls with my staff', 'मेरे स्टाफ़ के साथ कॉल')}</div>
          <p className="mt-1 text-[11px] text-slate-500">{tx('Calls happen inside the app — nobody sees a phone number. Recording is never secret: both screens show a red bar.', 'कॉल ऐप के अंदर होती हैं — किसी को फ़ोन नंबर नहीं दिखता। रिकॉर्डिंग कभी छुपी नहीं होती: दोनों स्क्रीन पर लाल पट्टी दिखती है।')}</p>
          <label className="mt-3 flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={cfg.settings.enabled} disabled={!!busy} onChange={e => setRule({ enabled: e.target.checked })} />{tx('Staff can call and be called in the app', 'स्टाफ़ ऐप में कॉल कर और ले सकता है')}</label>
          <div className="mt-2 text-xs font-semibold">{tx('Recording of calls with my staff', 'मेरे स्टाफ़ की कॉल की रिकॉर्डिंग')}</div>
          <div className="mt-1 grid gap-1.5 sm:grid-cols-3" role="radiogroup">
            {([['OFF', 'No recording', 'रिकॉर्डिंग नहीं'], ['ASK', 'Ask each time', 'हर बार पूछकर'], ['ALWAYS', 'Always (calls with me)', 'हमेशा (मेरे साथ की कॉल)']] as const).map(([k, en, hi]) => (
              <button key={k} role="radio" aria-checked={cfg.settings.record === k} disabled={!!busy || !cfg.settings.enabled} onClick={() => setRule({ record: k })}
                className={`min-h-11 rounded-lg border px-2 text-xs font-semibold ${cfg.settings.record === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'} disabled:opacity-50`} data-testid={`calls-rule-${k}`}>{tx(en, hi)}</button>))}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">{tx(`Recordings are kept ${keep} days, then deleted. Staff never receive the audio. A call with someone outside your business is recorded only if that person allows it.`, `रिकॉर्डिंग ${keep} दिन रखी जाती है, फिर मिट जाती है। स्टाफ़ को ऑडियो कभी नहीं मिलता। आपके बिज़नेस के बाहर के किसी के साथ की कॉल तभी रिकॉर्ड होती है जब वह अनुमति दे।`)}</p>
          {cfg && !cfg.relay && <p className="mt-1 text-[10px] text-amber-700">{tx('Note: on some mobile networks a call may not connect until a relay (TURN) server is set up by GENZ.', 'ध्यान दें: कुछ मोबाइल नेटवर्क पर कॉल तब तक नहीं जुड़ती जब तक GENZ रिले (TURN) सर्वर न लगा दे।')}</p>}
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold"><Phone className="h-4 w-4" />{tx('Calls', 'कॉल')}</div>
        {err && <div className="mb-2 rounded bg-red-50 px-2 py-1.5 text-xs text-red-700" role="alert">{err}</div>}
        {rows === null ? <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{tx('Loading…', 'लोड हो रहा है…')}</div>
          : rows.length === 0 ? <p className="text-xs text-slate-400">{tx('No calls yet. Use the Call button in a team list, a deal room or a builder chat.', 'अभी कोई कॉल नहीं। टीम सूची, डील रूम या बिल्डर चैट में Call बटन दबाएँ।')}</p>
          : <ul className="divide-y divide-slate-100 text-xs">{rows.map(c => (
            <li key={c.id} className="py-2" data-testid="call-row">
              <div className="flex flex-wrap items-center gap-2">
                {icon(c)}<span className="min-w-0 flex-1 truncate font-semibold">{c.with}</span>
                <span className="text-slate-500">{(CTX[c.context] ? tx(...CTX[c.context]) : c.context)}</span>
                <span className="w-12 text-right tabular-nums text-slate-500">{c.durationSec ? mmss(c.durationSec) : '—'}</span>
                <span className="w-28 text-right text-slate-400">{new Date(c.at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 pl-6">
                {c.staff && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{tx('your staff', 'आपका स्टाफ़')}</span>}
                {c.status !== 'ENDED' && <span className="text-[10px] text-slate-500">{c.status === 'MISSED' ? tx('missed', 'छूटी') : c.status === 'DECLINED' ? tx('declined', 'काटी') : c.status === 'CANCELLED' ? tx('cancelled', 'रद्द') : c.status}</span>}
                {c.recorded && <span className="inline-flex items-center gap-1 text-[10px] text-red-600"><Circle className="h-2.5 w-2.5 fill-red-600" />{c.deleted ? tx('recording deleted', 'रिकॉर्डिंग मिटाई') : c.expired ? tx('recording expired', 'रिकॉर्डिंग की अवधि पूरी') : tx('recorded', 'रिकॉर्ड हुई')}</span>}
                {c.audio && <>
                  <button disabled={busy === c.id} onClick={() => listen(c.id)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-2.5 font-semibold" data-testid="call-listen">{busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}{tx('Listen', 'सुनें')}</button>
                  <button disabled={busy === c.id} onClick={() => del(c.id)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-red-200 px-2.5 font-semibold text-red-700" aria-label={tx('Delete the recording', 'रिकॉर्डिंग मिटाएँ')}><Trash2 className="h-3.5 w-3.5" /></button>
                </>}
              </div>
              {play?.id === c.id && <audio className="mt-2 w-full" controls autoPlay src={play.url} />}
            </li>))}</ul>}
      </div>
    </div>
  );
};

export const CallsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const tx = useTx();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-slate-50 p-3" onClick={e => e.stopPropagation()} role="dialog" aria-label={tx('Calls', 'कॉल')}>
        <div className="mb-2 flex items-center justify-between"><div className="text-sm font-bold">{tx('Calls', 'कॉल')}</div><button onClick={onClose} className="min-h-11 px-3 text-xs font-semibold underline">{tx('Close', 'बंद करें')}</button></div>
        <CallsPanel />
      </div>
    </div>
  );
};
