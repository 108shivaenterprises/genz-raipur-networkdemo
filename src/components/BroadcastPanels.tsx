/**
 * v26 — buyer need → network.
 *  <BroadcastButton>  on my requirement: send it to the brokers who hold matching listings
 *  <BroadcastInbox>   needs sent to me, with my fitting listings → one tap "I have it"
 *  <MyBroadcasts>     my sent needs and who answered (open the listing → normal offer flow)
 */
import React, { useEffect, useState } from 'react';
import { Megaphone, Loader2, CheckCircle2, Inbox, Send } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';

export const BroadcastButton: React.FC<{ requirementId: string }> = ({ requirementId }) => {
  const tx = useTx();
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const send = async () => {
    setBusy(true); setMsg(null);
    try { const r = await api.broadcastSend(requirementId); setMsg({ ok: true, text: tx(`Sent to ${r.broadcast.sentTo} brokers (${r.broadcast.withListing} have a matching listing).`, `${r.broadcast.sentTo} ब्रोकरों को भेजा (${r.broadcast.withListing} के पास मिलती लिस्टिंग है)।`) }); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  return (
    <div className="mt-2">
      <button onClick={send} disabled={busy} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50" data-testid={`broadcast-${requirementId}`}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />} {tx('Ask the network — who has it?', 'नेटवर्क से पूछें — किसके पास है?')}
      </button>
      {msg && <p className={`mt-1 text-[11px] ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p>}
    </div>
  );
};

export const BroadcastInbox: React.FC = () => {
  const tx = useTx();
  const [items, setItems] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(''); const [note, setNote] = useState<Record<string, string>>({});
  const focus = (() => { try { return new URLSearchParams(window.location.search).get('bc') || ''; } catch { return ''; } })();
  const load = () => api.broadcastInbox().then(r => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  if (!items || !items.length) return null;
  const answer = async (id: string, b: { propertyId?: string; note?: string }) => { setBusy(id + (b.propertyId || 'n')); try { await api.broadcastRespond(id, b); await load(); } catch (e: any) { alert(e.message); } finally { setBusy(''); } };
  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3" data-testid="broadcast-inbox">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-indigo-900"><Inbox className="h-4 w-4" />{tx('Brokers are looking for', 'ब्रोकर ढूँढ रहे हैं')} ({items.length})</h3>
      <ul className="mt-2 space-y-2">
        {items.map(b => (
          <li key={b.id} className={`rounded-lg border bg-white p-2 text-xs ${focus === b.id ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-indigo-100'}`}>
            <p className="font-semibold text-slate-900">{b.line}</p>
            <p className="text-slate-500">{b.from?.name}{b.from?.company ? ` · ${b.from.company}` : ''}</p>
            {b.myListings.length > 0 ? (
              <div className="mt-1 space-y-1">
                {b.myListings.map((l: any) => {
                  const done = b.answered.includes(l.id);
                  return (
                    <div key={l.id} className="flex items-center gap-2">
                      <span className="flex-1 text-slate-700">{l.title} · {formatINR(l.price)}</span>
                      {done ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{tx('Sent', 'भेजा')}</span>
                        : <button onClick={() => answer(b.id, { propertyId: l.id })} disabled={!!busy} className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white" data-testid={`have-it-${l.id}`}>{busy === b.id + l.id ? <Loader2 className="h-3 w-3 animate-spin" /> : tx('I have it', 'मेरे पास है')}</button>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-1 flex gap-1">
                <input value={note[b.id] || ''} onChange={e => setNote({ ...note, [b.id]: e.target.value })} placeholder={tx('Have it outside GENZ? Write a line', 'GENZ के बाहर है? एक लाइन लिखें')} className="flex-1 rounded border border-slate-300 px-2 py-1" />
                <button onClick={() => answer(b.id, { note: note[b.id] || '' })} disabled={!!busy || (note[b.id] || '').trim().length < 5} className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white disabled:opacity-50"><Send className="h-3 w-3" /></button>
              </div>
            )}
            {b.answered.includes('') && <p className="mt-1 text-emerald-700">{tx('You answered', 'आपने जवाब दिया')}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
};

export const MyBroadcasts: React.FC = () => {
  const tx = useTx();
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => { api.broadcastMine().then(r => setItems(r.items)).catch(() => setItems([])); }, []);
  if (!items || !items.length) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3" data-testid="my-broadcasts">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Megaphone className="h-4 w-4 text-indigo-600" />{tx('My questions to the network', 'नेटवर्क से मेरे सवाल')}</h3>
      <ul className="mt-2 space-y-2">
        {items.slice(0, 10).map(b => (
          <li key={b.id} className="rounded-lg border border-slate-100 p-2 text-xs">
            <p className="font-semibold text-slate-900">{b.line} <span className="font-normal text-slate-500">· {tx(`sent to ${b.sentTo}`, `${b.sentTo} को भेजा`)}{b.status === 'CLOSED' ? ` · ${tx('closed', 'बंद')}` : ''}</span></p>
            {b.responses.length === 0 ? <p className="text-slate-500">{tx('No answer yet.', 'अभी कोई जवाब नहीं।')}</p> : (
              <ul className="mt-1 space-y-1">
                {b.responses.map((r: any, i: number) => (
                  <li key={i} className="rounded bg-emerald-50 px-2 py-1 text-emerald-900">
                    <b>{r.broker?.name}</b>{r.broker?.company ? ` (${r.broker.company})` : ''}: {r.property ? <a className="font-semibold underline" href={`/?tab=properties&propertyId=${encodeURIComponent(r.property.id)}`}>{r.property.title} · {formatINR(r.property.price)}</a> : r.note}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
