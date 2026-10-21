import React, { useEffect, useState } from 'react';
import { Send, Loader2, Check, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';

/**
 * v40 — from a Deal Room (or anywhere a property is open): put this home into one of the broker's own Client Rooms,
 * with the listing's photos and video. The client then sees it in his room and can ask for a visit.
 */
export const ShareToRoom: React.FC<{ propertyId: string; className?: string }> = ({ propertyId, className }) => {
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState<any[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => { if (open && !rooms) api.crList().then(r => setRooms((r.rooms || []).filter((x: any) => x.status === 'ACTIVE'))).catch(e => setMsg({ ok: false, text: e.message })); }, [open, rooms]);
  const send = async (room: any) => {
    setBusy(room.id); setMsg(null);
    try { await api.crAddItem(room.id, propertyId); setMsg({ ok: true, text: tx(`Shared in ${room.clientName}'s room with its photos & video`, `${room.clientName} के रूम में फ़ोटो-वीडियो के साथ भेज दी`) }); window.dispatchEvent(new Event('genz:rooms-changed')); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  };
  return (
    <span className="relative inline-block">
      <button type="button" onClick={() => setOpen(o => !o)} className={className || 'flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-900'} data-testid="share-to-room">
        <Send className="h-3.5 w-3.5" /><span>{tx('Send to client room', 'क्लाइंट रूम में भेजें')}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-2 text-xs shadow-xl" data-testid="share-to-room-list">
          <div className="mb-1 flex items-center justify-between"><b className="text-slate-800">{tx('Which client?', 'किस क्लाइंट को?')}</b><button type="button" onClick={() => setOpen(false)} aria-label={tx('Close', 'बंद')} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button></div>
          {!rooms && !msg && <Loader2 className="mx-auto my-2 h-4 w-4 animate-spin text-slate-400" />}
          {rooms && rooms.length === 0 && <p className="p-2 text-slate-500">{tx('No open client room yet — open one in Client Rooms.', 'अभी कोई खुला क्लाइंट रूम नहीं — Client Rooms में खोलें।')}</p>}
          <ul className="max-h-60 space-y-1 overflow-auto">
            {(rooms || []).map(r => (
              <li key={r.id}>
                <button type="button" disabled={!!busy} onClick={() => send(r)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-2 py-1.5 text-left hover:border-slate-900 disabled:opacity-50">
                  <span><b>{r.clientName}</b> <span className="text-slate-400">••{r.phoneLast4} · {r.items} {tx('homes', 'प्रॉपर्टी')}</span></span>
                  {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5 text-slate-400" />}
                </button>
              </li>
            ))}
          </ul>
          {msg && <p className={`mt-1 flex items-center gap-1 rounded px-2 py-1 ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} role="status">{msg.ok && <Check className="h-3.5 w-3.5" />}{msg.text}</p>}
        </div>
      )}
    </span>
  );
};
