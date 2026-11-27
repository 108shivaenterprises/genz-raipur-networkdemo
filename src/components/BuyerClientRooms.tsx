import React, { useEffect, useState } from 'react';
import { MessageSquare, ThumbsUp, ThumbsDown, CalendarCheck, Send, Building2, ShieldCheck, Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { formatINR, formatDateTime } from '../lib/utils.js';

export const BuyerClientRooms: React.FC = () => {
  const tx = useTx();
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>('');
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const r = await api.myClientRooms();
      if (r.success) setRooms(r.rooms || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleReact = async (roomId: string, itemId: string, action: 'LIKE' | 'PASS' | 'VISIT') => {
    setBusy(`${itemId}:${action}`);
    setErr('');
    try {
      await api.reactMyClientRoom(roomId, itemId, action);
      await load();
    } catch (e: any) {
      setErr(e?.message || tx('Could not update reaction', 'अपडेट नहीं हो सका'));
    } finally {
      setBusy('');
    }
  };

  const handleSend = async (roomId: string) => {
    const text = (replyText[roomId] || '').trim();
    if (!text) return;
    setBusy(`msg:${roomId}`);
    setErr('');
    try {
      await api.replyMyClientRoom(roomId, text);
      setReplyText(prev => ({ ...prev, [roomId]: '' }));
      await load();
    } catch (e: any) {
      setErr(e?.message || tx('Could not send message', 'संदेश नहीं भेजा जा सका'));
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-indigo-200 bg-white p-4 shadow-xs" data-testid="buyer-client-rooms">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <MessageSquare className="h-4 w-4 text-indigo-600" />
            {tx('My Broker Rooms & Live Updates', 'मेरे ब्रोकर रूम्स और लाइव अपडेट्स')}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {tx(
              'Instant in-app updates, shared properties & direct chat with your brokers — no need to wait for WhatsApp links.',
              'आपके ब्रोकर से सीधे ऐप के अंदर प्रॉपर्टी अपडेट, चैट और विज़िट रिक्वेस्ट — WhatsApp लिंक का इंतज़ार नहीं।'
            )}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          {rooms.length} {tx('Active Room(s)', 'सक्रिय रूम')}
        </span>
      </div>

      {err && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</p>}

      {!rooms.length ? (
        <div className="mt-3 rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-600">
          {tx(
            'No broker has shared a private room to your mobile number yet. Once a broker adds you, their properties and live chat will appear right here.',
            'अभी तक किसी ब्रोकर ने आपके मोबाइल नंबर पर प्राइवेट रूम नहीं बनाया है। जैसे ही कोई ब्रोकर आपको जोड़ेगा, उनकी प्रॉपर्टी और चैट यहीं दिखेंगी।'
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {rooms.map(room => (
            <div key={room.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-3" data-testid={`buyer-room-${room.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    {room.brokerName} {room.brokerFirm ? `· ${room.brokerFirm}` : ''}
                  </div>
                  {room.brokerRera && <div className="text-[11px] font-mono text-slate-500">RERA: {room.brokerRera}</div>}
                </div>
                <span className="text-[11px] text-slate-500">{formatDateTime(room.updatedAt)}</span>
              </div>

              {/* Shared Properties */}
              {(room.items || []).length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700">
                    {tx(`Shared Properties (${room.items.length})`, `शेयर की गई प्रॉपर्टी (${room.items.length})`)}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {room.items.map((item: any) => {
                      const p = item.property;
                      if (!p) return null;
                      const hasVisitReq = (item.visitRequests || []).length > 0;
                      return (
                        <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-bold text-slate-900 flex items-center gap-1">
                                <Building2 className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                                <span>{p.title}</span>
                              </div>
                              <div className="text-[11px] text-slate-500">{p.locality}, {p.city}</div>
                            </div>
                            <span className="font-bold text-emerald-700 whitespace-nowrap">{formatINR(p.askingPrice)}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => handleReact(room.id, item.id, 'LIKE')}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold border ${
                                item.reaction === 'LIKE' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              <ThumbsUp className="h-3 w-3" /> {tx('Like', 'पसंद')}
                            </button>
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => handleReact(room.id, item.id, 'PASS')}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold border ${
                                item.reaction === 'PASS' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              <ThumbsDown className="h-3 w-3" /> {tx('Pass', 'छोड़ें')}
                            </button>
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => handleReact(room.id, item.id, 'VISIT')}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold border ${
                                hasVisitReq ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                              }`}
                            >
                              <CalendarCheck className="h-3 w-3" /> {hasVisitReq ? tx('Visit Requested ✔', 'विज़िट मांगी ✔') : tx('Request Visit', 'विज़िट मांगें')}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* In-App Live Chat */}
              <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
                <div className="max-h-40 overflow-y-auto space-y-1.5 text-xs">
                  {(room.messages || []).length === 0 ? (
                    <p className="text-slate-400 italic">{tx('No messages yet. Say hello to your broker!', 'अभी कोई संदेश नहीं है। अपने ब्रोकर को मैसेज करें!')}</p>
                  ) : (
                    room.messages.slice(-8).map((m: any) => (
                      <div key={m.id} className={`flex ${m.from === 'CLIENT' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 ${m.from === 'CLIENT' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                          <div>{m.text}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-1.5 pt-1 border-t border-slate-100">
                  <input
                    type="text"
                    value={replyText[room.id] || ''}
                    onChange={e => setReplyText(prev => ({ ...prev, [room.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') void handleSend(room.id); }}
                    placeholder={tx('Type a message to broker...', 'ब्रोकर को मैसेज लिखें...')}
                    className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                    data-testid={`buyer-room-input-${room.id}`}
                  />
                  <button
                    type="button"
                    disabled={busy === `msg:${room.id}` || !(replyText[room.id] || '').trim()}
                    onClick={() => void handleSend(room.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    data-testid={`buyer-room-send-${room.id}`}
                  >
                    <Send className="h-3.5 w-3.5" /> {tx('Send', 'भेजें')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
