import React, { useState } from 'react';
import { Clock, Flag, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { confirmLabel, QUICK_REASONS, QUICK_REASON_WORDS } from '../shared/listingTrust.js';

/** v182 — “confirmed N days ago”; amber when older than 20 days */
export const ConfirmChip: React.FC<{ p: { confirmedAt?: string; createdAt?: string } }> = ({ p }) => {
  const tx = useTx(); const l = confirmLabel(p);
  return <span data-testid="confirm-chip" className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${l.stale ? 'bg-amber-100 text-amber-900' : 'bg-emerald-50 text-emerald-800'}`}><Clock className="h-3 w-3" aria-hidden />{tx(l.en, l.hi)}{l.stale ? ` · ${tx('check first', 'पहले पूछ लें')}` : ''}</span>;
};

/** v182 — one tap: Wrong info / already sold. Shows only the five reasons; never the owner, phone or net price. */
export const QuickFlag: React.FC<{ id: string; compact?: boolean }> = ({ id, compact }) => {
  const tx = useTx(); const [open, setOpen] = useState(false); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const send = async (reason: string) => {
    setBusy(true);
    try { const r = await api.flagListing(id, reason); setMsg(tx(r.message, r.hi)); setTimeout(() => setOpen(false), 1500); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" data-testid="quick-flag" onClick={(e) => { e.stopPropagation(); setMsg(''); setOpen(true); }} className={`inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-amber-800 hover:bg-amber-50`}>
        <Flag className="h-3.5 w-3.5" aria-hidden />{tx('Wrong info / already sold', 'गलत जानकारी या बिक चुकी')}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-3 sm:items-center" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">{tx('What is wrong?', 'क्या गलत है?')}</h3><button type="button" onClick={() => setOpen(false)} className="inline-flex h-11 w-11 items-center justify-center" aria-label={tx('Close', 'बंद')}><X className="h-4 w-4" /></button></div>
            <div className="mt-2 space-y-1.5">{QUICK_REASONS.map(r => <button key={r} type="button" disabled={busy || !!msg} onClick={() => void send(r)} className="flex min-h-11 w-full items-center rounded-lg border border-slate-200 px-3 text-left text-sm font-medium disabled:opacity-60">{tx(QUICK_REASON_WORDS[r][0], QUICK_REASON_WORDS[r][1])}</button>)}</div>
            {msg && <p className="mt-2 text-xs font-medium text-slate-700" role="status">{msg}</p>}
          </div>
        </div>
      )}
    </>
  );
};
