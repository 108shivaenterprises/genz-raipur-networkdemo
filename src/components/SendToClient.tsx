import React, { useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { useTx } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { formatINR } from '../lib/utils.js';

/** v166 — Property panel → "Send to client": the home goes into his client room (photos + video included); a NEW client gets his link on WhatsApp.
 *  When he taps 👍 the broker is told, and the room shows "Co-broking offer" for a home listed by another broker. */
export const SendToClient: React.FC<{ home: { id: string; title: string; locality: string; city?: string; askingPrice: number }; onClose: () => void }> = ({ home, onClose }) => {
  const tx = useTx();
  const [rooms, setRooms] = useState<any[] | null>(null);
  const [fresh, setFresh] = useState(false);
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [sent, setSent] = useState<{ to: string; link?: string; phone?: string } | null>(null);
  // v167 — a shop-QR customer whose confirmed need fits this home gets it in HIS chat (same rules as the lead chat's share button)
  const [qr, setQr] = useState<any[]>([]);
  useEffect(() => { api.spList().then((x: any) => setQr((x.leads || []).filter((l: any) => l.masked && l.chat?.reqConfirmedAt && (l.matches || []).some((m: any) => m.id === home.id)))).catch(() => undefined); }, [home.id]);
  useEffect(() => { api.crList().then((x: any) => { const l = (x.rooms || []).filter((r: any) => r.status === 'ACTIVE' && r.kind !== 'OWNER' && !r.held); setRooms(l); if (!l.length) setFresh(true); }).catch(() => { setRooms([]); setFresh(true); }); }, []);

  const give = async (roomId: string, to: string, link?: string, ph?: string) => {
    await api.crAddItem(roomId, home.id);
    setSent({ to, link, phone: ph });
  };
  const run = async (fn: () => Promise<void>) => { setErr(''); setBusy(true); try { await fn(); } catch (e: any) { setErr(e?.message || tx('Could not send', 'भेज नहीं पाए')); } finally { setBusy(false); } };
  const create = () => run(async () => {
    const r = await api.crCreate({ clientName: name.trim(), phone: phone.replace(/\D/g, '').slice(-10), kind: 'BUYER', consent: true });
    await give(r.room.id, name.trim(), `${window.location.origin}${r.link}`, phone.replace(/\D/g, '').slice(-10));
  });
  const wa = sent?.link ? `https://wa.me/91${sent.phone}?text=${encodeURIComponent(`नमस्ते ${sent.to}, आपके लिए यह प्रॉपर्टी चुनी है:\n${home.title} — ${home.locality}${home.city ? `, ${home.city}` : ''} · ${formatINR(home.askingPrice)}\nफोटो और डिटेल यहाँ देखें, पसंद आए तो 👍 दबाएँ:\n${sent.link}`)}` : '';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={tx('Send to client', 'क्लाइंट को भेजें')} data-testid="send-to-client">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><h3 className="text-base font-bold text-slate-900">{tx('Send to client', 'क्लाइंट को भेजें')}</h3><p className="truncate text-xs text-slate-500">{home.title} · {formatINR(home.askingPrice)}</p></div>
          <button type="button" onClick={onClose} aria-label={tx('Close', 'बंद करें')} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        {sent ? (
          <div className="mt-3 space-y-2" data-testid="send-done">
            <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 p-2.5 text-sm font-semibold text-emerald-800"><Check className="h-4 w-4" />{tx(`Sent to ${sent.to}`, `${sent.to} को भेज दिया`)}</p>
            {wa
              ? <a href={wa} target="_blank" rel="noopener noreferrer" data-testid="send-wa" className="flex min-h-11 items-center justify-center rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white">{tx('Send his link on WhatsApp', 'WhatsApp पर उसका लिंक भेजें')}</a>
              : <p className="text-xs text-slate-600">{tx('He already has his room link — it shows there with the photos, and he gets an alert.', 'उसके पास रूम का लिंक पहले से है — वहीं फोटो के साथ दिखेगा, और उसे अलर्ट जाएगा।')}</p>}
            <p className="text-xs text-slate-600">{tx('If he taps 👍 you are told — then talk co-broking with the listing broker from the same room.', 'अगर वह 👍 दबाए तो आपको बताया जाएगा — फिर उसी रूम से लिस्टिंग ब्रोकर से को-ब्रोकिंग की बात करें।')}</p>
            <button type="button" onClick={onClose} className="min-h-10 w-full rounded-lg border border-slate-300 text-sm font-semibold text-slate-700">{tx('Done', 'ठीक है')}</button>
          </div>
        ) : rooms === null ? <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-slate-400" /> : (
          <div className="mt-3 space-y-2">
            {!fresh && rooms.map((r: any) => {
              const has = (r.propertyIds || []).includes(home.id);
              return <button key={r.id} type="button" disabled={busy || has} onClick={() => run(() => give(r.id, r.clientName))} data-testid={`send-room-${r.id}`} className="flex min-h-11 w-full items-center justify-between rounded-lg border border-slate-200 px-3 text-left text-sm disabled:opacity-60"><span className="truncate font-semibold text-slate-900">{r.clientName}</span><span className="shrink-0 text-xs text-slate-500">{has ? tx('Already sent', 'पहले भेजा है') : `${r.items} ${tx('homes', 'घर')}`}</span></button>;
            })}
            {!fresh && qr.map((l: any) => <button key={l.id} type="button" disabled={busy} onClick={() => run(async () => { await api.spOffer(l.id, home.id); setSent({ to: l.name }); })} data-testid={`send-qr-${l.id}`} className="flex min-h-11 w-full items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-3 text-left text-sm"><span className="truncate font-semibold text-slate-900">{l.name}</span><span className="shrink-0 text-xs text-rose-800">{tx('Shop QR · in his chat', 'दुकान QR · उनकी चैट में')}</span></button>)}
            {!fresh && <button type="button" onClick={() => setFresh(true)} className="min-h-10 w-full rounded-lg border border-dashed border-slate-300 text-sm font-semibold text-slate-700" data-testid="send-new">{tx('+ New client', '+ नया क्लाइंट')}</button>}
            {fresh && (
              <div className="space-y-2" data-testid="send-fresh">
                <input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder={tx('Client name', 'क्लाइंट का नाम')} aria-label={tx('Client name', 'क्लाइंट का नाम')} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
                <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="numeric" maxLength={14} placeholder={tx('Client mobile (10 digits)', 'क्लाइंट का मोबाइल (10 अंक)')} aria-label={tx('Client mobile', 'क्लाइंट का मोबाइल')} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
                <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} className="mt-0.5 h-4 w-4" />{tx('My client agreed to receive properties and chat here', 'मेरे क्लाइंट ने यहाँ प्रॉपर्टी और चैट पाने की सहमति दी है')}</label>
                <button type="button" disabled={busy || name.trim().length < 2 || phone.replace(/\D/g, '').length < 10 || !ok} onClick={create} data-testid="send-create" className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-bold text-white disabled:opacity-50">{busy ? '…' : tx('Send', 'भेजें')}</button>
                {rooms.length > 0 && <button type="button" onClick={() => setFresh(false)} className="min-h-9 w-full text-xs font-semibold text-slate-600">{tx('← My clients', '← मेरे क्लाइंट')}</button>}
              </div>
            )}
            {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
          </div>
        )}
      </div>
    </div>
  );
};
