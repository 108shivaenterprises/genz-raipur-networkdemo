/**
 * v55 — Property Papers in the chat.
 *
 *  PaperSharePanel — inside the deal chat's "+" → Document: share one of my papers with people of this deal, for N days and M opens,
 *                    and (optionally) let them show it to their own client. The paper becomes view-only (watermarked) if it was not.
 *  PaperCard       — the card the share leaves in the deal chat. Each reader sees what HE may do: open it (opens left, until when),
 *                    show it to his client, or — the sender — who has it and "Stop".
 *  ClientPaperPicker — in a Client Room's "+": show a paper to this client (view-only page with the client's own name stamped on it).
 *
 * Every open is counted and logged; nobody but the uploader / owner / listing broker ever gets the file itself.
 * Honest limit (said on screen too): a web page cannot block a screenshot or another phone's camera — the stamp names whose copy it was.
 */
import React, { useEffect, useState } from 'react';
import { Check, FileLock2, Loader2, Lock, Send, UserRound, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { PROP_DOC_TYPES } from '../shared/propDocs.js';
import { WatermarkViewer, type ViewSession } from './WatermarkViewer.js';

const paperPage = (t: string) => `/api/property-docs/view/${t}`;
const day = (iso?: string) => { try { return iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''; } catch { return ''; } };
const chip = (on: boolean) => `inline-flex min-h-10 items-center justify-center rounded-full border px-3 text-sm font-semibold ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`;
const typeLabel = (t: string, hi: (a: string, b: string) => string) => { const x = PROP_DOC_TYPES.find(y => y.id === t); return x ? hi(x.en, x.hi) : t; };
const live = (iso?: string) => !iso || Date.parse(iso) > Date.now();

/** open the stamped viewer for one paper (counts one open when it is a limited share) */
export function usePaperViewer(onAfter?: () => void) {
  const hi = useI18n().lang === 'hi';
  const [viewing, setViewing] = useState<ViewSession | null>(null);
  const [err, setErr] = useState('');
  const open = async (id: string) => {
    setErr('');
    try { setViewing(await api.propDocView(id)); } catch (e: any) { setErr(e?.body?.hi && hi ? e.body.hi : e.message); }
    finally { onAfter?.(); }
  };
  const viewer = viewing ? <WatermarkViewer session={viewing} pageUrl={paperPage} onClose={() => setViewing(null)} /> : null;
  return { open, viewer, err };
}

// ───────────── share from the deal chat ─────────────
export const PaperSharePanel: React.FC<{
  doc: any; dealId: string; people: { id: string; name: string; role: string }[];
  onDone: (message: any) => void; onCancel: () => void;
}> = ({ doc, dealId, people, onDone, onCancel }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const brokers = people.filter(p => p.role === 'BROKER');
  const [who, setWho] = useState<string[]>(brokers.length ? brokers.map(p => p.id) : people.slice(0, 1).map(p => p.id));
  const [days, setDays] = useState(3);
  const [views, setViews] = useState(5);
  const [client, setClient] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const send = async () => {
    setBusy(true); setErr('');
    try { const r = await api.propDocChatShare(doc.id, { dealId, userIds: who, days, maxViews: views, clientShare: client }); onDone(r.message); }
    catch (e: any) { setErr(e?.body?.hi && hi ? e.body.hi : e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2.5 rounded-xl bg-white p-3 ring-1 ring-slate-200" data-testid="paper-share">
      <div className="flex items-start gap-2">
        <FileLock2 className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700" aria-hidden />
        <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{doc.title}</p><p className="text-xs text-slate-500">{typeLabel(doc.type, tx)}</p></div>
      </div>
      {people.length === 0 ? <p className="text-sm text-slate-600">{tx('Nobody else in this deal can receive papers yet.', 'इस डील में अभी कोई और कागज़ नहीं ले सकता।')}</p> : (
        <>
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600">{tx('Who may see it', 'कौन देख सकता है')}</p>
            <div className="flex flex-wrap gap-1.5">
              {people.map(p => {
                const on = who.includes(p.id);
                return <button key={p.id} type="button" onClick={() => setWho(w => on ? w.filter(x => x !== p.id) : [...w, p.id])} className={chip(on)} aria-pressed={on} data-testid={`paper-who-${p.id}`}><UserRound className="mr-1 h-4 w-4" aria-hidden />{p.name}{p.role === 'PROPERTY_OWNER' ? ` (${tx('owner', 'मालिक')})` : ''}</button>;
              })}
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600">{tx('For how many days', 'कितने दिन तक')}</p>
            <div className="flex flex-wrap gap-1.5">{[1, 3, 7, 30].map(n => <button key={n} type="button" onClick={() => setDays(n)} className={chip(days === n)} data-testid={`paper-days-${n}`}>{tx(`${n} day${n > 1 ? 's' : ''}`, `${n} दिन`)}</button>)}</div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600">{tx('How many times can each open it', 'हर कोई कितनी बार खोल सकता है')}</p>
            <div className="flex flex-wrap gap-1.5">{[1, 3, 5, 10, 0].map(n => <button key={n} type="button" onClick={() => setViews(n)} className={chip(views === n)} data-testid={`paper-views-${n}`}>{n ? tx(`${n}×`, `${n} बार`) : tx('No limit', 'कोई सीमा नहीं')}</button>)}</div>
          </div>
          <button type="button" role="switch" aria-checked={client} onClick={() => setClient(c => !c)} className="flex min-h-12 w-full items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-1.5 text-left ring-1 ring-slate-200" data-testid="paper-client">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">{tx('May show it to his own client', 'अपने क्लाइंट को दिखा सकते हैं')}</span>
              <span className="block text-[11px] leading-snug text-slate-500">{tx('Only inside his client room, view-only, with the client’s own name stamped — never longer or more often than you allowed.', 'सिर्फ़ उनके क्लाइंट रूम में, देखने भर को, क्लाइंट के अपने नाम की मुहर के साथ — आपकी तय सीमा से ज़्यादा कभी नहीं।')}</span>
            </span>
            <span className={`relative h-6 w-11 shrink-0 rounded-full ${client ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${client ? 'left-[1.375rem]' : 'left-0.5'}`} /></span>
          </button>
          <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-950"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{tx('It opens view-only, with each viewer’s initials, name, mobile ••last 4 and time stamped on every page. No download. A screenshot or a photo with another phone cannot be blocked on a web page — the stamp shows whose copy it was.', 'यह सिर्फ़ देखने के लिए खुलेगा — हर पेज पर देखने वाले के initials, नाम, मोबाइल ••आख़िरी 4 और समय की मुहर। डाउनलोड नहीं। वेब पेज पर स्क्रीनशॉट या दूसरे फ़ोन से फ़ोटो रोकी नहीं जा सकती — मुहर बताएगी कि कॉपी किसकी थी।')}</p>
        </>
      )}
      {err && <p className="text-xs font-medium text-red-700" role="alert">{err}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy || !who.length} onClick={send} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-50" data-testid="paper-send">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{tx('Share in chat', 'चैट में भेजें')}
        </button>
        <button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">{tx('Cancel', 'रद्द')}</button>
      </div>
    </div>
  );
};

// ───────────── show to my client (from a deal chat card, or from a client room) ─────────────
const ClientShareForm: React.FC<{ doc: any; maxUntil?: string; fixedRoom?: { id: string; clientName: string }; onDone: (msg: string) => void; onCancel: () => void }> = ({ doc, maxUntil, fixedRoom, onDone, onCancel }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const [rooms, setRooms] = useState<any[] | null>(fixedRoom ? [fixedRoom] : null);
  const [room, setRoom] = useState(fixedRoom?.id || '');
  const [days, setDays] = useState(3);
  const [views, setViews] = useState(3);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (!fixedRoom) api.crList().then(r => { const a = (r.rooms || []).filter((x: any) => x.status === 'ACTIVE'); setRooms(a); if (a[0]) setRoom(a[0].id); }).catch(() => setRooms([])); }, [fixedRoom]);
  const cap = maxUntil ? Math.max(1, Math.ceil((Date.parse(maxUntil) - Date.now()) / 86_400_000)) : 30;
  const send = async () => {
    setBusy(true); setErr('');
    try { await api.propDocClientShare(doc.id, { roomId: room, days: Math.min(days, cap), maxViews: views }); onDone(tx('Shown to your client — it is in the room chat.', 'आपके क्लाइंट को दिखा दिया — रूम की चैट में है।')); }
    catch (e: any) { setErr(e?.body?.hi && hi ? e.body.hi : e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-white p-2.5 ring-1 ring-slate-200" data-testid="paper-client-form">
      {rooms === null ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : rooms.length === 0 ? <p className="text-xs text-slate-600">{tx('You have no open client room. Open one in Client Rooms first.', 'आपका कोई खुला क्लाइंट रूम नहीं है। पहले Client Rooms में रूम खोलें।')}</p> : (
        <>
          {!fixedRoom && (
            <select value={room} onChange={e => setRoom(e.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm" aria-label={tx('Client room', 'क्लाइंट रूम')} data-testid="paper-client-room">
              {rooms.map(r => <option key={r.id} value={r.id}>{r.clientName} · ••{r.phoneLast4}</option>)}
            </select>
          )}
          <div className="flex flex-wrap gap-1.5">{[1, 3, 7].filter(n => n <= Math.max(1, cap)).map(n => <button key={n} type="button" onClick={() => setDays(n)} className={chip(days === n)}>{tx(`${n} day${n > 1 ? 's' : ''}`, `${n} दिन`)}</button>)}{cap < 7 && <span className="self-center text-[11px] text-slate-500">{tx(`(you may see it till ${day(maxUntil)})`, `(आप ${day(maxUntil)} तक देख सकते हैं)`)}</span>}</div>
          <div className="flex flex-wrap gap-1.5">{[1, 3, 5].map(n => <button key={n} type="button" onClick={() => setViews(n)} className={chip(views === n)}>{tx(`${n}×`, `${n} बार`)}</button>)}</div>
          <p className="text-[11px] leading-snug text-slate-500">{tx('Your client opens it in his room, view-only, with his own name and mobile ••last 4 stamped on every page.', 'क्लाइंट इसे अपने रूम में सिर्फ़ देख पाएगा — हर पेज पर उसका अपना नाम और मोबाइल ••आख़िरी 4 छपा होगा।')}</p>
          {err && <p className="text-xs font-medium text-red-700" role="alert">{err}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={busy || !room} onClick={send} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white disabled:opacity-50" data-testid="paper-client-send">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{tx('Show to client', 'क्लाइंट को दिखाएँ')}</button>
            <button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"><X className="h-4 w-4" /></button>
          </div>
        </>
      )}
    </div>
  );
};

// ───────────── the card in the deal chat ─────────────
export const PaperCard: React.FC<{ m: any; papers: any[] | null; canClientShare: boolean; onChanged: () => void }> = ({ m, papers, canClientShare, onChanged }) => {
  const tx = useTx();
  const [showClient, setShowClient] = useState(false);
  const [note, setNote] = useState('');
  const { open, viewer, err } = usePaperViewer(onChanged);
  const d = papers?.find(x => x.id === m.refId);
  const head = (
    <div className="flex items-center gap-2.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700"><FileLock2 className="h-5 w-5" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-slate-900">{d?.title || tx('Property paper', 'प्रॉपर्टी का कागज़')}</span>
        <span className="block text-xs text-slate-500">{d ? typeLabel(d.type, tx) + ' · ' : ''}{tx('view-only · stamped', 'सिर्फ़ देखने के लिए · मुहर')}</span>
      </span>
    </div>
  );
  if (!papers) return <div className="rounded-xl border border-slate-200 bg-slate-50 p-2" data-testid="chat-card-PAPER">{head}</div>;
  if (!d) return <div className="rounded-xl border border-slate-200 bg-slate-50 p-2" data-testid="chat-card-PAPER">{head}<p className="mt-1 text-xs text-slate-500">{tx('Not shared with you.', 'आपके साथ साझा नहीं।')}</p></div>;
  const mine = d.myShare;
  const usable = mine ? live(mine.expiresAt) && (mine.viewsLeft === null || mine.viewsLeft > 0) : true;
  const btn = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold';
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2" data-testid="chat-card-PAPER">
      {head}
      {mine && (
        <p className={`mt-1.5 text-xs ${usable ? 'text-slate-600' : 'font-semibold text-red-700'}`} data-testid="paper-left">
          {!live(mine.expiresAt) ? tx('Time to view is over.', 'देखने का समय ख़त्म।')
            : mine.viewsLeft === 0 ? tx('All your opens are used.', 'आपके तय बार पूरे हो गए।')
            : tx(`${mine.viewsLeft === null ? 'Any number of' : mine.viewsLeft} open(s) left${mine.expiresAt ? ` · till ${day(mine.expiresAt)}` : ''}`, `${mine.viewsLeft === null ? 'कितनी भी बार' : `${mine.viewsLeft} बार और`}${mine.expiresAt ? ` · ${day(mine.expiresAt)} तक` : ''}`)}
        </p>
      )}
      {d.canManage && (d.shares || []).filter((s: any) => s.dealId === m.dealRoomId).length > 0 && (
        <ul className="mt-1.5 space-y-1" data-testid="paper-shared-with">
          {(d.shares || []).filter((s: any) => s.dealId === m.dealRoomId).map((s: any) => (
            <li key={s.userId} className="flex items-center gap-2 text-xs text-slate-600">
              <span className="min-w-0 flex-1 truncate"><b className="text-slate-800">{s.name}</b> · {s.maxViews ? tx(`opened ${s.views}/${s.maxViews}`, `${s.views}/${s.maxViews} बार खोला`) : tx(`opened ${s.views}×`, `${s.views} बार खोला`)}{s.expiresAt ? ` · ${live(s.expiresAt) ? tx(`till ${day(s.expiresAt)}`, `${day(s.expiresAt)} तक`) : tx('expired', 'समय ख़त्म')}` : ''}{s.clientShare ? ` · ${tx('may show client', 'क्लाइंट को दिखा सकते')}` : ''}</span>
              <button type="button" onClick={async () => { await api.propDocRevoke(d.id, s.userId).catch(() => undefined); onChanged(); }} className="min-h-9 shrink-0 rounded-md px-2 font-semibold text-red-700 hover:bg-red-50" data-testid={`paper-stop-${s.userId}`}>{tx('Stop', 'बंद करें')}</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {usable && <button type="button" onClick={() => void open(d.id)} className={`${btn} bg-slate-900 text-white`} data-testid="paper-open"><Lock className="h-4 w-4" aria-hidden />{tx('Open', 'खोलें')}</button>}
        {mine?.clientShare && canClientShare && usable && <button type="button" onClick={() => setShowClient(s => !s)} className={`${btn} border border-emerald-600 bg-white text-emerald-800`} data-testid="paper-show-client">{tx('Show my client', 'अपने क्लाइंट को दिखाएँ')}</button>}
      </div>
      {showClient && <ClientShareForm doc={d} maxUntil={mine?.expiresAt} onCancel={() => setShowClient(false)} onDone={(t) => { setShowClient(false); setNote(t); onChanged(); }} />}
      {(d.clientShares || []).length > 0 && <p className="mt-1.5 text-[11px] text-slate-500">{tx('Shown to: ', 'दिखाया: ')}{d.clientShares.map((c: any) => `${c.clientName} (${c.views}/${c.maxViews})`).join(', ')}</p>}
      {note && <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-700"><Check className="h-3.5 w-3.5" />{note}</p>}
      {err && <p className="mt-1 text-xs font-medium text-red-700" role="alert">{err}</p>}
      {viewer}
    </div>
  );
};

// ───────────── a client room's "+": show a paper to this client ─────────────
export const ClientPaperPicker: React.FC<{ room: { id: string; clientName: string }; onDone: () => void; onCancel: () => void }> = ({ room, onDone, onCancel }) => {
  const tx = useTx();
  const [docs, setDocs] = useState<any[] | null>(null);
  const [pick, setPick] = useState<any>(null);
  useEffect(() => {
    api.propDocs({ scope: 'all' }).then(r => setDocs((r.docs || []).filter((d: any) =>
      d.canManage ? (d.protect || /^image\//.test(d.mime) || d.mime === 'application/pdf')
        : d.myShare?.clientShare && live(d.myShare.expiresAt) && (d.myShare.viewsLeft === null || d.myShare.viewsLeft > 0)))).catch(() => setDocs([]));
  }, []);
  if (pick) return <ClientShareForm doc={pick} maxUntil={pick.myShare?.expiresAt} fixedRoom={room} onCancel={() => setPick(null)} onDone={() => onDone()} />;
  return (
    <div data-testid="room-paper-list">
      <div className="mb-1.5 flex items-center justify-between"><span className="text-sm font-bold text-slate-800">{tx('Show a paper (view-only)', 'कागज़ दिखाएँ (सिर्फ़ देखने को)')}</span><button type="button" onClick={onCancel} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200" aria-label={tx('Close', 'बंद करें')}><X className="h-4 w-4" /></button></div>
      {docs === null ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : docs.length === 0 ? (
        <p className="rounded-xl bg-white p-3 text-sm text-slate-500 ring-1 ring-slate-200">{tx('No paper you may show. Your own papers live in Property Papers; a paper another broker shared in a deal chat appears here when he allowed “show to his client”.', 'दिखाने लायक कोई कागज़ नहीं। आपके अपने कागज़ Property Papers में हैं; किसी ब्रोकर ने डील चैट में भेजा कागज़ यहाँ तभी आता है जब उसने “क्लाइंट को दिखा सकते हैं” चालू किया हो।')}</p>
      ) : (
        <ul className="space-y-1">
          {docs.map(d => (
            <li key={d.id}><button type="button" onClick={() => setPick(d)} className="flex min-h-12 w-full items-center gap-2.5 rounded-xl bg-white px-2.5 py-1.5 text-left ring-1 ring-slate-200 active:bg-slate-100" data-testid={`room-paper-${d.id}`}>
              <FileLock2 className="h-5 w-5 shrink-0 text-indigo-700" aria-hidden />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{d.title}</span><span className="block truncate text-xs text-slate-500">{d.propertyTitle} · {typeLabel(d.type, tx)}</span></span>
            </button></li>
          ))}
        </ul>
      )}
    </div>
  );
};
