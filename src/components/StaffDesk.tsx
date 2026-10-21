import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Inbox, UserCheck, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';

const btn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-4 text-xs font-semibold disabled:opacity-50';

/** For an employee: leads the employer lets them claim, and (builder staff) partner leads waiting for verification. Hidden when neither applies. */
export const StaffDesk: React.FC = () => {
  const tx = useTx();
  const [pool, setPool] = useState<any>(null);
  const [queue, setQueue] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [rej, setRej] = useState<{ id: string; v: string } | null>(null);
  const flash = (ok: boolean, t: string) => { setMsg({ ok, t }); setTimeout(() => setMsg(null), 3500); };
  const load = useCallback(() => {
    api.staffPool().then(setPool).catch(() => setPool({ enabled: false, leads: [] }));
    api.pcVerifyQueue().then(r => setQueue(r.leads)).catch(() => setQueue([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!pool) return <Loader2 className="h-5 w-5 animate-spin text-slate-500" />;
  if (!pool.enabled && queue.length === 0) return null;
  const run = async (fn: () => Promise<any>, ok: string) => { try { await fn(); flash(true, ok); load(); } catch (e: any) { flash(false, e.message); } };
  return (
    <div className="space-y-4">
      {msg && <div className={`rounded-lg px-3 py-2 text-xs font-medium ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} role="status">{msg.t}</div>}
      {pool.enabled && (
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-bold"><Inbox className="h-4 w-4" />{tx('Lead pool', 'लीड पूल')} <span className="text-xs font-normal text-slate-500">({pool.open}/{pool.cap} {tx('yours', 'आपकी')})</span></h3>
          {pool.leads.length === 0 && <p className="text-xs text-slate-400">{tx('No unassigned leads right now.', 'अभी कोई अनअसाइंड लीड नहीं।')}</p>}
          {pool.leads.map((l: any) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3">
              <div><div className="text-sm font-semibold">{l.name}</div><div className="text-[11px] text-slate-500">{l.projectName} · {l.unitInterest || '—'} · {new Date(l.createdAt).toLocaleDateString('en-IN')}</div></div>
              <button className={`${btn} bg-slate-900 text-white`} onClick={() => run(() => api.staffClaim(l.id), tx('Lead is yours now', 'लीड अब आपकी'))}>{tx('Take this lead', 'यह लीड लें')}</button>
            </div>
          ))}
        </section>
      )}
      {queue.length > 0 && (
        <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-bold"><UserCheck className="h-4 w-4" />{tx('Partner leads to verify', 'वेरिफाई करने वाली पार्टनर लीड')} ({queue.length})</h3>
          {queue.map(l => (
            <div key={l.id} className="rounded-lg bg-white p-3">
              <div className="text-sm font-semibold">{l.name} <span className="text-[11px] font-normal text-slate-500">· {l.projectName} · {tx('via', 'द्वारा')} {l.associateName}</span></div>
              <div className="mt-2 flex gap-2">
                <button className={`${btn} bg-slate-900 text-white`} onClick={() => run(() => api.pcVerify(l.id, { decision: 'ACCEPT' }), tx('Accepted', 'मंज़ूर'))}><CheckCircle2 className="h-4 w-4" />{tx('Accept', 'मंज़ूर')}</button>
                <button className={`${btn} border border-slate-300 bg-white text-slate-700`} onClick={() => setRej({ id: l.id, v: '' })}><XCircle className="h-4 w-4" />{tx('Reject', 'अस्वीकार')}</button>
              </div>
              {rej && rej.id === l.id && <div className="mt-2 flex gap-2"><input autoFocus value={rej.v} onChange={e => setRej({ id: l.id, v: e.target.value })} placeholder={tx('Reason', 'कारण')} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /><button disabled={rej.v.trim().length < 3} className={`${btn} bg-red-600 text-white`} onClick={() => run(() => api.pcVerify(l.id, { decision: 'REJECT', note: rej.v }), tx('Rejected', 'अस्वीकार')).then(() => setRej(null))}>OK</button></div>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
};
