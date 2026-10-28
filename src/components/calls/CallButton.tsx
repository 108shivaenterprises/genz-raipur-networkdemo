import React, { useEffect, useRef, useState } from 'react';
import { Phone, Loader2 } from 'lucide-react';
import { useTx } from '../../lib/i18n.js';
import { api } from '../../lib/api.js';
import { useCalls } from './CallHost.js';

/** "Call" for one known person (renders nothing when this person has no call tool or calls are off) */
export const CallButton: React.FC<{ toUserId: string; name: string; context: 'TEAM' | 'DEAL' | 'PARTNER'; contextId?: string; compact?: boolean; className?: string }> = ({ toUserId, name, context, contextId, compact, className }) => {
  const tx = useTx(); const calls = useCalls();
  if (!calls) return null;
  return (
    <button type="button" disabled={calls.busy} onClick={e => { e.stopPropagation(); void calls.start({ toUserId, name, context, contextId }); }}
      className={className || `inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-emerald-600 px-3 text-xs font-semibold text-emerald-700 ${calls.busy ? 'opacity-50' : ''}`}
      aria-label={tx(`Call ${name}`, `${name} को कॉल करें`)} data-testid="call-button">
      {calls.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}{!compact && tx('Call', 'कॉल')}
    </button>
  );
};

/** "Call" for a room or chat: opens a small list of the people there who can take a call (a single person is called directly) */
export const CallMenu: React.FC<{ context: 'TEAM' | 'DEAL' | 'PARTNER'; contextId?: string; compact?: boolean }> = ({ context, contextId, compact }) => {
  const tx = useTx(); const calls = useCalls();
  const [open, setOpen] = useState(false); const [people, setPeople] = useState<Array<{ id: string; name: string; title: string }> | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    api.callPeople(context, contextId).then(r => setPeople(r.people)).catch(() => setPeople([]));
    const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', off); return () => document.removeEventListener('mousedown', off);
  }, [open, context, contextId]);
  if (!calls) return null;
  return (
    <div ref={box} className="relative">
      <button type="button" disabled={calls.busy} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="menu" data-testid="call-menu"
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-emerald-600 px-3 text-xs font-semibold text-emerald-700 ${calls.busy ? 'opacity-50' : ''}`}>
        <Phone className="h-4 w-4" />{!compact && tx('Call', 'कॉल')}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-xl">
          {people === null ? <div className="flex items-center gap-2 p-3 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{tx('Looking…', 'देख रहे हैं…')}</div>
            : people.length === 0 ? <div className="p-3 text-slate-500">{tx('No one here can take a call right now.', 'यहाँ अभी कोई कॉल नहीं ले सकता।')}</div>
            : people.map(p => (
              <button key={p.id} role="menuitem" onClick={() => { setOpen(false); void calls.start({ toUserId: p.id, name: p.name, context, contextId }); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left hover:bg-slate-50" data-testid="call-person">
                <Phone className="h-4 w-4 shrink-0 text-emerald-600" /><span className="min-w-0"><span className="block truncate font-semibold">{p.name}</span><span className="block truncate text-[10px] text-slate-500">{p.title}</span></span>
              </button>))}
        </div>
      )}
    </div>
  );
};
