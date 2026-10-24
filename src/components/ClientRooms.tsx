/**
 * v31 — Deal Desk → Client Rooms. A private room for the broker's OWN client (buyer / renter / tenant): share properties, chat, see likes and
 * visit requests. The client opens a link and confirms his mobile with a code — no app, no sign-up. Nobody else can read the chat.
 * v37 — redesign: KPI tiles (each one a filter), search + kind chips, two panes on a big screen (rooms | open room), one pane with "back" on a
 * phone, and inside a room: Chat (auto-scroll, quick replies) · Homes · Visits · Info.
 */
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Phone, Eye, Loader2, Plus, Link2, Copy, MessageCircle, Trash2, Lock, Home, ThumbsUp, ThumbsDown, CalendarClock, X, Search, Info, KeyRound, Heart, Inbox, CalendarPlus, Image as ImageIcon, PlayCircle, Check, MoreVertical, FileLock2 } from 'lucide-react';
import { ChatShell, ChatThread, type ThreadMsg } from './ChatKit.js';
import { ClientPaperPicker } from './PaperShare.js';
import { api } from '../lib/api.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';
import { ROOM_KINDS } from '../shared/clientRoomRules.js';
import { lazyView } from '../lib/lazyView.js';

/** v40 — the same "Schedule Verified Site Visit" form as everywhere else, opened from a room (client + home already filled in) */
const ScheduleVisitModal = lazyView(() => import('./Modals.js'), 'ScheduleVisitModal');

const inp = 'min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm';
const dark = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-40';
const light = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-40';
const when = (iso?: string) => iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const ago = (iso: string | undefined, hi: boolean) => {
  if (!iso) return '';
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return hi ? 'अभी' : 'now';
  if (m < 60) return hi ? `${m} मि.` : `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return hi ? `${h} घं.` : `${h}h`;
  const d = Math.floor(h / 24); return hi ? `${d} दिन` : `${d}d`;
};
const KIND_TONE: Record<string, string> = { BUYER: 'bg-sky-600', RENTER: 'bg-violet-600', TENANT: 'bg-amber-600', OTHER: 'bg-slate-600' };
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
/** v37 — one-tap replies (the broker can still edit before sending); no phone numbers, as the room forbids them */
const QUICK = [
  { en: 'I have added new homes for you — please have a look.', hi: 'मैंने आपके लिए नई प्रॉपर्टी जोड़ी हैं — एक बार देख लीजिए।' },
  { en: 'Can you come to see it tomorrow? Tell me a time that suits you.', hi: 'क्या आप कल देखने आ सकते हैं? अपना सुविधाजनक समय बताइए।' },
  { en: 'Please confirm your budget and the areas you prefer.', hi: 'कृपया अपना बजट और पसंदीदा इलाके बता दीजिए।' },
  { en: 'Your visit is confirmed — I will meet you at the site.', hi: 'आपकी विज़िट पक्की है — मैं आपसे साइट पर मिलूँगा।' },
  { en: 'The owner has agreed to talk on price — shall we meet?', hi: 'मालिक कीमत पर बात करने को तैयार हैं — मिलें?' },
];
type RoomFilter = 'all' | 'unread' | 'visits' | 'code' | 'liked';

export const ClientRoomsTab: React.FC<{ tick?: number }> = ({ tick }) => {
  const tx = useTx();
  const hi = useI18n().lang === 'hi';
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  const [open, setOpen] = useState<string>(() => { try { return new URLSearchParams(window.location.search).get('room') || ''; } catch { return ''; } });
  // v56 — "Open a client room" from a shop-QR lead fills the new-room form (handed over in this tab's session storage, never in the URL)
  // v57 — read here, removed only after the screen is really shown: a render React throws away and redoes must still find it
  const [prefill] = useState<any>(() => { try { const v = sessionStorage.getItem('genz.newroom'); if (v) return JSON.parse(v); } catch { /* blocked */ } return null; });
  useEffect(() => { if (prefill) { try { sessionStorage.removeItem('genz.newroom'); } catch { /* blocked */ } } }, [prefill]);
  const [creating, setCreating] = useState(!!prefill);
  const [fresh, setFresh] = useState<{ link: string; name: string; phone: string } | null>(null);
  const [q, setQ] = useState(''); const [kind, setKind] = useState('ALL'); const [f, setF] = useState<RoomFilter>('all'); const [who, setWho] = useState('ALL'); // v63 — broker: whose rooms (his own / one team member's)
  const load = () => api.crList().then(r => { setD(r); window.dispatchEvent(new Event('genz:rooms-changed')); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [tick]);
  // a client waiting for his code → open that room so the broker can read the code out at once
  // (v37) on a big screen the first room is open by default (two panes); on a phone the list comes first
  useEffect(() => {
    if (!d || open) return;
    const w = d.rooms.find((r: any) => r.codeAsk) || (window.innerWidth >= 1024 ? d.rooms.find((r: any) => r.status === 'ACTIVE') : undefined);
    if (w) setOpen(w.id);
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const active: any[] = useMemo(() => (d?.rooms || []).filter((r: any) => r.status === 'ACTIVE'), [d]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return active.filter(r => (kind === 'ALL' || r.kind === kind) && (who === 'ALL' || (who === 'ME' ? !r.createdById : r.createdById === who))
      && (f === 'all' || (f === 'unread' && r.unread > 0) || (f === 'visits' && r.openVisits > 0) || (f === 'code' && r.codeAsk) || (f === 'liked' && r.liked > 0))
      && (!s || r.clientName.toLowerCase().includes(s) || String(r.phoneLast4).includes(s)))
      .sort((a, b) => (Number(!!b.codeAsk) - Number(!!a.codeAsk)) || (b.unread - a.unread) || String(b.lastMessage?.at || b.updatedAt).localeCompare(String(a.lastMessage?.at || a.updatedAt)));
  }, [active, q, kind, f, who]);
  const makers: { id: string; name: string; n: number }[] = useMemo(() => { const m = new Map<string, { id: string; name: string; n: number }>(); for (const r of active) if (r.createdById) { const x = m.get(r.createdById) || { id: r.createdById, name: r.createdByName || '', n: 0 }; x.n++; m.set(r.createdById, x); } return [...m.values()]; }, [active]);
  if (err) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (!d) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />;
  const closed = d.rooms.filter((r: any) => r.status !== 'ACTIVE');
  const kindLabel = (k: string) => { const x = ROOM_KINDS.find(y => y.id === k); return x ? (hi ? x.hi : x.en) : k; };
  const sum = (k: string) => active.reduce((n, r) => n + (Number(r[k]) || 0), 0);
  const tiles: { id: RoomFilter; en: string; hi: string; v: number; icon: React.ElementType; tone: string }[] = [
    { id: 'all', en: 'Open rooms', hi: 'खुले रूम', v: active.length, icon: Inbox, tone: 'text-slate-900' },
    { id: 'unread', en: 'Unread messages', hi: 'नए संदेश', v: sum('unread'), icon: MessageCircle, tone: sum('unread') ? 'text-rose-700' : 'text-slate-900' },
    { id: 'visits', en: 'Visit asks', hi: 'विज़िट अनुरोध', v: sum('openVisits'), icon: CalendarClock, tone: sum('openVisits') ? 'text-amber-700' : 'text-slate-900' },
    { id: 'code', en: 'Waiting for code', hi: 'कोड का इंतज़ार', v: active.filter(r => r.codeAsk).length, icon: KeyRound, tone: active.some(r => r.codeAsk) ? 'text-amber-700' : 'text-slate-900' },
    { id: 'liked', en: 'Homes liked', hi: 'पसंद की गई प्रॉपर्टी', v: sum('liked'), icon: Heart, tone: 'text-emerald-700' },
  ];
  const openRoom = active.find(r => r.id === open);

  return (
    <div className="space-y-4" data-testid="rooms-tab">
      <details open={active.length === 0} className={`rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-950 ${openRoom ? 'hidden lg:block' : ''}`} data-testid="rooms-about">
        <summary className="flex cursor-pointer list-none items-start gap-1.5 font-semibold"><Lock className="mt-0.5 h-4 w-4 shrink-0" />{tx('A private room for each of your own clients', 'आपके हर अपने क्लाइंट के लिए एक निजी रूम')}</summary>
        <p className="mt-1">{tx('Share properties with your buyer / renter / tenant and chat in one place. He opens a link and confirms his mobile with a code — no app, no sign-up. Only you and he can read the chat; the listing broker, co-brokers, your team and GENZ staff cannot. He sees no exact address and no owner number — those come only after a verified visit.',
          'अपने खरीदार / किराएदार को प्रॉपर्टी दिखाएँ और एक ही जगह चैट करें। वह लिंक खोलकर कोड से अपना मोबाइल पक्का करता है — न ऐप, न साइन-अप। चैट सिर्फ़ आप दोनों पढ़ सकते हैं; लिस्टिंग ब्रोकर, को-ब्रोकर, आपकी टीम और GENZ स्टाफ़ नहीं। उसे पूरा पता या मालिक का नंबर नहीं दिखता — वह वेरिफ़ाइड विज़िट के बाद ही मिलता है।')}</p>
      </details>

      {fresh && !openRoom && (
        <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-3 text-sm" data-testid="room-link">
          <p className="font-bold text-emerald-900">{tx(`Room ready for ${fresh.name}`, `${fresh.name} के लिए रूम तैयार`)}</p>
          <p className="mt-1 break-all rounded bg-white p-2 font-mono text-xs">{window.location.origin}{fresh.link}</p>
          <p className="mt-1 text-xs text-emerald-900">{tx('This link is shown now only. If you lose it, make a new link from the room.', 'यह लिंक अभी ही दिखता है। खो जाए तो रूम से नया लिंक बनाएँ।')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={light} onClick={() => navigator.clipboard?.writeText(window.location.origin + fresh.link)}><Copy className="h-4 w-4" />{tx('Copy', 'कॉपी')}</button>
            <a className={light} target="_blank" rel="noreferrer" href={`https://wa.me/91${fresh.phone}?text=${encodeURIComponent((hi ? `नमस्ते ${fresh.name}, आपके लिए प्रॉपर्टी का निजी रूम: ` : `Hello ${fresh.name}, your private property room: `) + window.location.origin + fresh.link)}`}><MessageCircle className="h-4 w-4" />WhatsApp</a>
            <button className={light} onClick={() => setFresh(null)}><X className="h-4 w-4" />{tx('Done', 'हो गया')}</button>
          </div>
        </div>
      )}

      <div className={`grid grid-cols-2 gap-2 sm:grid-cols-5 ${openRoom ? 'hidden lg:grid' : ''}`}>
        {tiles.map(t => { const Icon = t.icon; return (
          <button key={t.id} type="button" onClick={() => setF(t.id)} className={`rounded-xl border p-2.5 text-left ${f === t.id ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 bg-white hover:border-slate-400'}`} data-testid={`room-kpi-${t.id}`}>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500"><Icon className="h-3.5 w-3.5" />{tx(t.en, t.hi)}</div>
            <div className={`mt-0.5 text-lg font-bold ${t.tone}`}>{t.v}</div>
          </button>
        ); })}
      </div>

      <div className={`flex-col gap-2 sm:flex-row sm:items-center ${openRoom ? 'hidden lg:flex' : 'flex'}`}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className={inp + ' pl-8'} value={q} onChange={e => setQ(e.target.value)} placeholder={tx('Search client name or last 4 digits', 'क्लाइंट का नाम या आख़िरी 4 अंक खोजें')} data-testid="room-search" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {[{ id: 'ALL', en: 'All', hi: 'सभी' }, ...ROOM_KINDS].map(k => <button key={k.id} type="button" onClick={() => setKind(k.id)} className={`min-h-9 shrink-0 rounded-full border px-3 text-[11px] font-semibold ${kind === k.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{hi ? k.hi : k.en}</button>)}
        </div>
        {makers.length > 0 && !d.staffOf && (
          <div className="flex gap-1.5 overflow-x-auto" data-testid="room-who">
            {[{ id: 'ALL', label: tx('Whole team', 'पूरी टीम') }, { id: 'ME', label: tx('Mine', 'मेरे') }, ...makers.map(m => ({ id: m.id, label: `${m.name.split(' ')[0]} (${m.n})` }))].map(k => <button key={k.id} type="button" onClick={() => setWho(k.id)} className={`min-h-9 shrink-0 rounded-full border px-3 text-[11px] font-semibold ${who === k.id ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{k.label}</button>)}
          </div>
        )}
        <button className={dark} onClick={() => setCreating(v => !v)} data-testid="room-new"><Plus className="h-4 w-4" />{tx('New room', 'नया रूम')}</button>
      </div>
      {creating && <NewRoom defaults={prefill || undefined} onDone={(link, name, phone, id) => { setCreating(false); setFresh({ link, name, phone }); setOpen(id); load(); }} />}

      {active.length === 0 && !creating ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">{tx('No client room yet. Tap “New room” and add your client\'s name and mobile.', 'अभी कोई क्लाइंट रूम नहीं। “नया रूम” दबाएँ और अपने क्लाइंट का नाम और मोबाइल डालें।')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {/* rooms list — hidden on a phone while a room is open */}
          <div className={`space-y-2 lg:col-span-2 ${openRoom ? 'hidden lg:block' : ''}`}>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{d.staffOf ? tx(`${d.staffOf}'s client rooms (${active.length})`, `${d.staffOf} के क्लाइंट रूम (${active.length})`) : tx(`My client rooms (${active.length})`, `मेरे क्लाइंट रूम (${active.length})`)}{shown.length !== active.length ? ` · ${tx(`${shown.length} shown`, `${shown.length} दिख रहे`)}` : ''}</h3>
            {shown.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">{tx('No room in this filter.', 'इस फ़िल्टर में कोई रूम नहीं।')} <button type="button" className="font-semibold underline" onClick={() => { setF('all'); setKind('ALL'); setQ(''); }}>{tx('Show all', 'सभी दिखाएँ')}</button></p>}
            <div className="space-y-2 lg:max-h-[75vh] lg:overflow-y-auto lg:pr-1">
              {shown.map((r: any) => (
                <button key={r.id} type="button" onClick={() => setOpen(r.id)} className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${open === r.id ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900' : 'border-slate-200 bg-white hover:border-slate-400'}`} data-testid={`room-card-${r.id}`}>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${KIND_TONE[r.kind] || KIND_TONE.OTHER}`}>{initials(r.clientName)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900">{r.clientName}</span>
                      <span className="shrink-0 text-[10px] text-slate-400">{ago(r.lastMessage?.at || r.updatedAt, hi)}</span>
                    </span>
                    <span className="block text-[11px] text-slate-500">{kindLabel(r.kind)} · ••{r.phoneLast4} · {tx(`${r.items} homes`, `${r.items} प्रॉपर्टी`)}{r.liked ? ` · 👍 ${r.liked}` : ''}{r.createdByName && !d.staffOf ? ` · ${tx('by', 'द्वारा')} ${r.createdByName.split(' ')[0]}` : ''}</span>
                    {r.lastMessage && <span className={`mt-0.5 block truncate text-xs ${r.unread > 0 ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{r.lastMessage.from === 'CLIENT' ? '↩ ' : tx('You: ', 'आप: ')}{r.lastMessage.text}</span>}
                    <span className="mt-1 flex flex-wrap gap-1">
                      {r.codeAsk && <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white" data-testid={`room-codeask-${r.id}`}>{tx('asking for code', 'कोड माँग रहा है')}</span>}
                      {r.unread > 0 && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">{tx(`${r.unread} new`, `${r.unread} नए`)}</span>}
                      {r.openVisits > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">{tx(`${r.openVisits} visit ask`, `${r.openVisits} विज़िट अनुरोध`)}</span>}
                      {!r.lastClientSeenAt && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{tx('not opened yet', 'अभी खोला नहीं')}</span>}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {closed.length > 0 && <details className="text-xs text-slate-500"><summary className="cursor-pointer font-semibold">{tx(`Closed rooms (${closed.length}) — chats are erased 90 days after closing`, `बंद रूम (${closed.length}) — बंद होने के 90 दिन बाद चैट मिट जाती है`)}</summary>
              <ul className="mt-1 space-y-0.5">{closed.map((r: any) => <li key={r.id}>{r.clientName} · ••{r.phoneLast4}</li>)}</ul></details>}
          </div>

          {/* open room */}
          <div className={`lg:col-span-3 ${openRoom ? '' : 'hidden lg:block'}`}>
            {openRoom
              ? <div className="lg:sticky lg:top-4"><RoomDetail id={openRoom.id} onChange={load} onBack={() => setOpen('')} fresh={fresh} onFreshDone={() => setFresh(null)} onLink={(link) => setFresh({ link, name: openRoom.clientName, phone: '' })} /></div>
              : <div className="flex h-full min-h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">{tx('Pick a room on the left.', 'बाईं ओर से कोई रूम चुनें।')}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

const NewRoom: React.FC<{ onDone: (link: string, name: string, phone: string, id: string) => void; defaults?: { clientName?: string; phone?: string; kind?: string; note?: string } }> = ({ onDone, defaults }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const [f, setF] = useState({ clientName: defaults?.clientName || '', phone: defaults?.phone || '', kind: defaults?.kind || 'BUYER', note: defaults?.note || '', consent: false });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try { const r = await api.crCreate(f); onDone(r.link, f.clientName, f.phone.replace(/\D/g, '').slice(-10), r.room.id); } catch (e: any) { setErr(e?.code === 'PARTY_BLOCKED' ? tx(e.body?.error || e.message, e.body?.hi || e.message) : e.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input className={inp} placeholder={tx('Client name', 'क्लाइंट का नाम')} value={f.clientName} onChange={e => setF({ ...f, clientName: e.target.value })} data-testid="room-name" />
        <input className={inp} inputMode="numeric" placeholder={tx('Client mobile (10 digits)', 'क्लाइंट का मोबाइल (10 अंक)')} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} data-testid="room-phone" />
      </div>
      <select className={inp} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>{ROOM_KINDS.map(k => <option key={k.id} value={k.id}>{hi ? k.hi : k.en}</option>)}</select>
      <input className={inp} placeholder={tx('Private note for yourself (optional)', 'अपने लिए निजी नोट (वैकल्पिक)')} maxLength={300} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
      <label className="flex items-start gap-2 text-[11px] font-semibold"><input type="checkbox" className="mt-0.5 h-5 w-5" checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} data-testid="room-consent" />{tx('My client agreed to get properties from me and chat in this room. His mobile is kept only as a one-way hash plus its last 4 digits.', 'मेरे क्लाइंट ने मुझसे प्रॉपर्टी पाने और इस रूम में चैट करने की सहमति दी है। उसका मोबाइल सिर्फ़ एक-तरफ़ा हैश और आख़िरी 4 अंकों के रूप में रखा जाता है।')}</label>
      {err && <p className="text-xs font-medium text-red-700" role="alert">{err}</p>}
      <button className={dark + ' w-full'} disabled={busy || !f.consent || f.clientName.trim().length < 2 || f.phone.replace(/\D/g, '').length < 10} onClick={go} data-testid="room-create">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}{tx('Make the room & link', 'रूम और लिंक बनाएँ')}</button>
    </div>
  );
};


/** v63 — the client's mobile inside his room: the broker always; office staff by the "customer numbers" switch (full / tap to reveal / hidden) */
const ClientPhone: React.FC<{ r: any; id: string; onRoom: (r: any) => void }> = ({ r, id, onRoom }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const [shown, setShown] = useState<string>(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [typed, setTyped] = useState('');
  const phone: string = r.phone || shown;
  const fmt = (p: string) => `${p.slice(0, 5)} ${p.slice(5)}`;
  if (r.status !== 'ACTIVE' || r.phoneAccess === 'HIDDEN') return null;
  const wa = phone ? `https://wa.me/91${phone}?text=${encodeURIComponent(hi ? `नमस्ते ${r.clientName}, ` : `Hello ${r.clientName}, `)}` : '';
  const act = async (fn: () => Promise<any>) => { setBusy(true); setErr(''); try { await fn(); } catch (e: any) { setErr(e.message || 'Error'); } finally { setBusy(false); } };
  return (
    <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 text-sm" data-testid="room-phone">
      {phone ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold text-slate-900" data-testid="room-phone-num">+91 {fmt(phone)}</span>
          <a className={light} href={`tel:+91${phone}`} data-testid="room-call"><Phone className="h-4 w-4" />{tx('Call', 'कॉल')}</a>
          <a className={light} target="_blank" rel="noreferrer" href={wa}><MessageCircle className="h-4 w-4" />WhatsApp</a>
          <button type="button" className={light} aria-label={tx('Copy number', 'नंबर कॉपी')} onClick={() => navigator.clipboard?.writeText(phone)}><Copy className="h-4 w-4" /></button>
        </div>
      ) : r.phoneSaved && r.phoneAccess === 'REVEAL' ? (
        <button type="button" disabled={busy} className={light} data-testid="room-reveal" onClick={() => act(async () => { const x = await api.crPhoneReveal(id); setShown(x.phone); })}><Eye className="h-4 w-4" />{tx(`Show number (••${r.phoneLast4})`, `नंबर देखें (••${r.phoneLast4})`)}</button>
      ) : !r.phoneSaved && !r.staff ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="room-phone-add">
          <span className="text-xs text-slate-600">{tx(`Number not saved (ends ${r.phoneLast4}).`, `नंबर सेव नहीं है (आख़िरी अंक ${r.phoneLast4})।`)}</span>
          <input className="min-h-10 w-36 rounded-lg border border-slate-300 px-2 text-sm" inputMode="numeric" maxLength={10} value={typed} onChange={e => setTyped(e.target.value.replace(/\D/g, ''))} placeholder={tx('10-digit mobile', '10 अंक का मोबाइल')} data-testid="room-phone-input" />
          <button type="button" disabled={busy || typed.length !== 10} className={light} data-testid="room-phone-save" onClick={() => act(async () => { const x = await api.crPhoneSave(id, typed); if (x?.room) onRoom(x.room); })}>{tx('Save', 'सेव')}</button>
        </div>
      ) : <span className="text-xs text-slate-500">{tx(`Number: ••${r.phoneLast4}`, `नंबर: ••${r.phoneLast4}`)}</span>}
      {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
    </div>
  );
};

export const RoomDetail: React.FC<{ id: string; onChange: () => void; onLink: (l: string) => void; onBack?: () => void; fresh?: { link: string; phone: string; name: string } | null; onFreshDone?: () => void }> = ({ id, onChange, onLink, onBack, fresh, onFreshDone }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const [tab, setTab] = useState<'chat' | 'homes' | 'visits' | 'info'>('chat');
  const [r, setR] = useState<any>(null); const [err, setErr] = useState(''); const [text, setText] = useState(''); const [about, setAbout] = useState('');
  const [pq, setPq] = useState(''); const [props, setProps] = useState<any[]>([]); const [pick, setPick] = useState(''); const [pnote, setPnote] = useState('');
  const [book, setBook] = useState<null | { item: any; req?: any }>(null);   // v40 — visit booked from the room
  const [mediaFor, setMediaFor] = useState('');                              // v40 — item whose photos / video are being chosen
  const [menu, setMenu] = useState(false);                                   // v50 — the ⋮ menu (new link, close room)
  const [aboutOpen, setAboutOpen] = useState(false);                         // v50 — the "about which property" picker under the message box
  const [paperPick, setPaperPick] = useState(false);                         // v55 — "+" → show a paper to this client
  const [noListings, setNoListings] = useState(false);                       // v58 — office staff without "see listings": chat only
  const [papers, setPapers] = useState<any[] | null>(null);                  // v55 — my papers, for the status of the ones shown here
  const hasPaper = !!r?.messages?.some((m: any) => m.paper);
  const loadPapers = () => api.propDocs({ scope: 'all' }).then(x => setPapers(x.docs || [])).catch(() => setPapers([]));
  useEffect(() => { if (hasPaper) void loadPapers(); /* eslint-disable-next-line */ }, [hasPaper, id]);
  const load = () => api.crGet(id).then(x => { setR(x.room); if (x.room.unread) api.crRead(id).then(onChange).catch(() => undefined); }).catch(e => setErr(e.message));
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) api.crGet(id).then(x => setR(x.room)).catch(() => undefined); }, 15000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => {
    const t = setTimeout(() => {
      const live = (x: any) => setProps(x.properties.filter((p: any) => ['active', 'under_negotiation'].includes(p.listingStatus)));
      (pq.trim().length >= 2 ? api.getProperties({ q: pq.trim(), limit: 30 }) : api.getProperties({ scope: 'boot' })).then(x => { setNoListings(false); live(x); }).catch((e: any) => { if (e?.status === 403) setNoListings(true); });
    }, pq ? 300 : 0);
    return () => clearTimeout(t);
  }, [pq]);
  const run = async (fn: () => Promise<any>, after?: (x: any) => void) => { setErr(''); try { const x = await fn(); if (x?.room) setR(x.room); after?.(x); onChange(); } catch (e: any) { setErr(e.message); } };
  useEffect(() => { setTab('chat'); }, [id]);
  const noop = () => undefined;
  if (!r) return (
    <ChatShell onBack={onBack || noop} backId="room-back" testId="room-detail" avatar={<span className="h-10 w-10 shrink-0 rounded-full bg-slate-200" />} title="…">
      <div className="py-10 text-center">{err ? <p className="text-xs text-red-700">{err}</p> : <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />}</div>
    </ChatShell>
  );
  const shared = new Set(r.items.map((i: any) => i.propertyId));

  const reqs = r.items.flatMap((i: any) => i.visitRequests.map((v: any) => ({ ...v, item: i })));
  const openReqs = reqs.filter((v: any) => v.status === 'REQUESTED').length;
  const kindLabel = (k: string) => { const x = ROOM_KINDS.find(y => y.id === k); return x ? (hi ? x.hi : x.en) : k; };
  const tabs: [typeof tab, string, string, number | undefined][] = [
    ['chat', 'Chat', 'चैट', undefined], ['homes', 'Homes', 'प्रॉपर्टी', r.items.length], ['visits', 'Visits', 'विज़िट', openReqs || undefined], ['info', 'Info', 'जानकारी', undefined],
  ];
  // v55 — a paper shown to this client: how often he opened it, until when, and "Stop"
  const paperCard = (m: any) => {
    const d = (papers || []).find((x: any) => (x.clientShares || []).some((c: any) => c.id === m.paper.shareId));
    const c = d?.clientShares.find((x: any) => x.id === m.paper.shareId);
    const over = c && (Date.parse(c.expiresAt) <= Date.now() || c.views >= c.maxViews);
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2" data-testid="room-paper-card">
        <div className="flex items-center gap-2"><FileLock2 className="h-5 w-5 shrink-0 text-indigo-700" aria-hidden /><span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{m.paper.title}</span></div>
        <p className="mt-1 text-xs text-slate-600">{papers === null ? '…' : !c ? tx('No longer shown to the client.', 'अब क्लाइंट को नहीं दिख रहा।')
          : over ? tx(`Over — opened ${c.views}/${c.maxViews}`, `ख़त्म — ${c.views}/${c.maxViews} बार खोला`)
          : tx(`View-only for your client · opened ${c.views}/${c.maxViews} · till ${new Date(c.expiresAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`, `क्लाइंट के लिए सिर्फ़ देखने को · ${c.views}/${c.maxViews} बार खोला · ${new Date(c.expiresAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} तक`)}</p>
        {c && !over && <button type="button" onClick={async () => { await api.propDocClientRevoke(d.id, c.id).catch(() => undefined); void loadPapers(); }} className="mt-1 inline-flex min-h-9 items-center rounded-md px-2 text-xs font-semibold text-red-700 hover:bg-red-50" data-testid="room-paper-stop">{tx('Stop showing', 'दिखाना बंद करें')}</button>}
      </div>
    );
  };
  const msgs: ThreadMsg[] = r.messages.map((m: any) => ({ id: m.id, mine: m.from === 'BROKER', who: r.clientName, text: m.text, at: m.at, ref: m.propertyId, ...(m.byName ? { by: m.byName } : {}), ...(m.paper ? { card: paperCard(m), hideText: true } : {}) }));
  // v58 — the broker's office staff work in his rooms: no closing, no papers, no visit booking (those stay with the broker)
  const staff = !!r.staff;
  const sendMsg = async (text: string) => {
    setErr('');
    try { const x = await api.crSend(id, text, about || undefined); if (x?.room) setR(x.room); onChange(); return true; } catch (e: any) { setErr(e.message); return false; }
  };
  const newLink = () => { setMenu(false); if (window.confirm(tx('Make a new link? The old link stops working and your client signs in again.', 'नया लिंक बनाएँ? पुराना लिंक बंद हो जाएगा और क्लाइंट को दोबारा कोड से खोलना होगा।'))) run(() => api.crLink(id), x => onLink(x.link)); };
  const closeRoom = () => { setMenu(false); if (window.confirm(tx('Close this room? The link stops working and the chat is erased after 90 days.', 'यह रूम बंद करें? लिंक बंद हो जाएगा और चैट 90 दिन बाद मिट जाएगी।'))) run(() => api.crClose(id)); };

  return (
    <ChatShell
      testId="room-detail" backId="room-back" onBack={onBack || noop}
      avatar={<span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${KIND_TONE[r.kind] || KIND_TONE.OTHER}`}>{initials(r.clientName)}</span>}
      title={r.clientName}
      subtitle={`${kindLabel(r.kind)} · ••${r.phoneLast4} · ${r.lastClientSeenAt ? `${tx('seen', 'देखा')} ${when(r.lastClientSeenAt)}` : tx('has not opened the link yet', 'अभी लिंक नहीं खोला')}`}
      actions={(
        <div className="relative shrink-0">
          <button type="button" onClick={() => setMenu(m => !m)} aria-label={tx('More', 'और')} aria-expanded={menu} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100" data-testid="room-menu"><MoreVertical className="h-5 w-5" /></button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-12 z-20 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                <button type="button" className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={newLink} data-testid="room-newlink"><Link2 className="h-4 w-4" />{tx('New link', 'नया लिंक')}</button>
                {!staff && <button type="button" className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-red-700 hover:bg-red-50" onClick={closeRoom} data-testid="room-close"><X className="h-4 w-4" />{tx('Close room', 'रूम बंद करें')}</button>}
              </div>
            </>
          )}
        </div>
      )}
      below={(
        <>
          {fresh && (
            <div className="shrink-0 border-b border-emerald-300 bg-emerald-50 p-3 text-sm" data-testid="room-link">
              <p className="font-bold text-emerald-900">{tx(`Room ready for ${fresh.name}`, `${fresh.name} के लिए रूम तैयार`)}</p>
              <p className="mt-1 break-all rounded bg-white p-2 font-mono text-xs">{window.location.origin}{fresh.link}</p>
              <p className="mt-1 text-xs text-emerald-900">{tx('This link is shown now only. If you lose it, make a new link from the ⋮ menu.', 'यह लिंक अभी ही दिखता है। खो जाए तो ⋮ मेन्यू से नया लिंक बनाएँ।')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className={light} onClick={() => navigator.clipboard?.writeText(window.location.origin + fresh.link)}><Copy className="h-4 w-4" />{tx('Copy', 'कॉपी')}</button>
                {fresh.phone && <a className={light} target="_blank" rel="noreferrer" href={`https://wa.me/91${fresh.phone}?text=${encodeURIComponent((hi ? `नमस्ते ${fresh.name}, आपके लिए प्रॉपर्टी का निजी रूम: ` : `Hello ${fresh.name}, your private property room: `) + window.location.origin + fresh.link)}`}><MessageCircle className="h-4 w-4" />WhatsApp</a>}
                <button className={light} onClick={() => onFreshDone?.()}><X className="h-4 w-4" />{tx('Done', 'हो गया')}</button>
              </div>
            </div>
          )}
          <ClientPhone r={r} id={id} onRoom={setR} />
          {r.codeForClient && (
            <div className="shrink-0 border-b border-amber-400 bg-amber-50 p-3 text-center" data-testid="room-code">
              <p className="text-xs font-semibold text-amber-900">{tx('Your client is opening the room. Tell him this code (valid 10 minutes):', 'आपका क्लाइंट रूम खोल रहा है। उसे यह कोड बताएँ (10 मिनट तक वैध):')}</p>
              <p className="mt-1 font-mono text-3xl font-black tracking-[0.3em] text-amber-950">{r.codeForClient}</p>
            </div>
          )}
          <div className="flex shrink-0 gap-1 border-b border-slate-200 bg-white px-2 py-1.5" role="tablist">
            {tabs.map(([tid, en, hiT, n]) => (
              <button key={tid} type="button" role="tab" aria-selected={tab === tid} onClick={() => setTab(tid)} className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-sm font-semibold ${tab === tid ? 'bg-slate-900 text-white' : 'text-slate-600'}`} data-testid={`room-tab-${tid}`}>
                {tx(en, hiT)}{n !== undefined && <span className={`rounded-full px-1.5 text-xs ${tid === 'visits' ? 'bg-amber-500 text-white' : tab === tid ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'}`}>{n}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    >
      {tab === 'chat' ? (
        <ChatThread
          msgs={msgs} onSend={sendMsg} error={err}
          placeholder={tx('Write to your client — no phone numbers', 'क्लाइंट को लिखें — फ़ोन नंबर नहीं')}
          emptyHint={tx('No messages yet. Say hello — or tap ⚡ for a ready reply.', 'अभी कोई संदेश नहीं। नमस्ते लिखें — या ⚡ से तैयार जवाब लें।')}
          quick={QUICK}
          menu={(close) => {
            // v53 — the same "+" as the deal chat, small: every item is a shortcut into something this screen already does (nothing new is shared from here)
            const live = r.items.filter((i: any) => i.property?.available);
            const withMedia = r.items.filter((i: any) => i.mediaAvailable?.photos > 0 || i.mediaAvailable?.videos > 0);
            const tile = 'flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl bg-white px-1 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 active:bg-slate-100';
            const dot = (tone: string, I: React.ElementType) => <span className={`flex h-9 w-9 items-center justify-center rounded-full ${tone}`}><I className="h-5 w-5" aria-hidden /></span>;
            if (paperPick) return <ClientPaperPicker room={{ id: r.id, clientName: r.clientName }} onCancel={() => setPaperPick(false)} onDone={() => { setPaperPick(false); close(); void load(); void loadPapers(); }} />;
            return (
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" data-testid="room-plus">
                {!staff && <button type="button" className={tile} data-testid="room-plus-paper" onClick={() => setPaperPick(true)}>{dot('bg-amber-100 text-amber-800', FileLock2)}{tx('Show a paper', 'कागज़ दिखाएँ')}</button>}
                {r.items.length > 0 && <button type="button" className={tile} data-testid="room-about" aria-pressed={!!about} onClick={() => { setAboutOpen(true); close(); }}>{dot('bg-emerald-100 text-emerald-700', Home)}{tx('About a home', 'प्रॉपर्टी चुनें')}</button>}
                <button type="button" className={tile} data-testid="room-plus-share" onClick={() => { setTab('homes'); close(); setTimeout(() => document.querySelector('[data-testid="room-pick"]')?.scrollIntoView({ block: 'center' }), 80); }}>{dot('bg-indigo-100 text-indigo-700', Plus)}{tx('Share a home', 'प्रॉपर्टी जोड़ें')}</button>
                {r.items.length > 0 && !staff && <button type="button" className={tile} data-testid="room-plus-visit" onClick={() => { if (live.length === 1) setBook({ item: live[0] }); else setTab('homes'); close(); }}>{dot('bg-sky-100 text-sky-700', CalendarPlus)}{tx('Book a visit', 'विज़िट तय करें')}</button>}
                {withMedia.length > 0 && <button type="button" className={tile} data-testid="room-plus-photos" onClick={() => { if (withMedia.length === 1) setMediaFor(withMedia[0].id); setTab('homes'); close(); }}>{dot('bg-violet-100 text-violet-700', ImageIcon)}{tx('Photos to show', 'फ़ोटो दिखाएँ')}</button>}
              </div>
            );
          }}
          composerTop={r.items.length > 0 && (aboutOpen || about) ? (
            <label className="mb-1.5 flex items-center gap-1.5 text-xs text-slate-500">
              <select className="min-h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs" value={about} onChange={e => setAbout(e.target.value)} aria-label={tx('About which property', 'किस प्रॉपर्टी के बारे में')}>
                <option value="">{tx('About: (none)', 'विषय: (कोई नहीं)')}</option>{r.items.map((i: any) => <option key={i.id} value={i.propertyId}>{i.property?.title || i.propertyId}</option>)}
              </select>
              <button type="button" onClick={() => { setAbout(''); setAboutOpen(false); }} aria-label={tx('Remove', 'हटाएँ')} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" data-testid="room-about-off"><X className="h-4 w-4" /></button>
            </label>
          ) : undefined}
          ids={{ root: 'room-chat-root', chat: 'room-chat', input: 'room-msg-input', send: 'room-send', quick: 'room-quick' }}
        />
      ) : (
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      {tab === 'homes' && (
      <section>
        <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{tx('Properties in this room', 'इस रूम की प्रॉपर्टी')} ({r.items.length})</h4>
        <div className="space-y-2">
          {r.items.map((i: any) => (
            <div key={i.id} className="rounded-lg border border-slate-200 p-2.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">{i.property?.title || i.propertyId} <span className="font-normal text-slate-400">· {i.propertyId}</span></div>
                  <div className="text-slate-500">{i.property ? `${i.property.locality}, ${i.property.city} · ${formatINR(i.property.price)}` : ''}{i.property && !i.property.available ? ` · ${tx('no longer available', 'अब उपलब्ध नहीं')}` : ''}</div>
                  {i.reaction && <div className={`mt-0.5 inline-flex items-center gap-1 font-semibold ${i.reaction === 'LIKE' ? 'text-emerald-700' : 'text-slate-500'}`}>{i.reaction === 'LIKE' ? <ThumbsUp className="h-3.5 w-3.5" /> : <ThumbsDown className="h-3.5 w-3.5" />}{i.reaction === 'LIKE' ? tx('Client liked it', 'क्लाइंट को पसंद आई') : tx('Client passed', 'क्लाइंट को नहीं जमी')}</div>}
                </div>
                <button className="rounded p-1.5 text-slate-400 hover:text-red-600" aria-label={tx('Take out', 'हटाएँ')} onClick={() => run(() => api.crDelItem(id, i.id))}><Trash2 className="h-4 w-4" /></button>
              </div>
              {(i.media?.photos?.length > 0 || i.media?.videos?.length > 0) && (
                <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto" data-testid={`room-media-strip-${i.id}`}>
                  {i.media.photos.slice(0, 5).map((u: string) => <img key={u} src={u} alt="" loading="lazy" className="h-12 w-16 shrink-0 rounded object-cover bg-slate-100" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />)}
                  {i.media.photos.length > 5 && <span className="shrink-0 text-[10px] text-slate-500">+{i.media.photos.length - 5}</span>}
                  {i.media.videos.length > 0 && <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white"><PlayCircle className="h-3 w-3" />{tx('video', 'वीडियो')}</span>}
                </div>
              )}
              {(i.visits || []).map((v: any) => (
                <div key={v.visitId} className="mt-1.5 flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-emerald-800"><Check className="h-3.5 w-3.5" />{tx('Visit booked', 'विज़िट तय')}: <b>{when(v.when)}</b> <span className="text-emerald-600">· {v.visitId}</span></div>
              ))}
              {i.visitRequests.map((v: any) => (
                <div key={v.id} className={`mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1.5 ${v.status === 'REQUESTED' ? 'bg-amber-50 text-amber-950' : 'bg-slate-50 text-slate-500'}`}>
                  <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{tx('Wants to visit', 'देखने आना चाहता है')}: <b>{when(v.preferred)}</b>{v.note ? ` — ${v.note}` : ''}</span>
                  {v.status === 'REQUESTED'
                    ? <span className="inline-flex gap-1">
                        {i.property?.available && !staff && <button className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white" onClick={() => setBook({ item: i, req: v })} data-testid={`room-book-req-${v.id}`}>{tx('Book this visit', 'यह विज़िट तय करें')}</button>}
                        <button className="rounded border border-amber-400 bg-white px-2 py-1 font-semibold" onClick={() => run(() => api.crVisitHandled(id, i.id, v.id))}>{tx('Done', 'हो गया')}</button>
                      </span>
                    : <span>✔ {v.visitId ? `${tx('booked', 'तय')} · ${v.visitId}` : tx('handled', 'निपटा')}</span>}
                </div>
              ))}
              {i.property?.available && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {!staff && <button className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-slate-900 px-2.5 text-[11px] font-semibold text-white" onClick={() => setBook({ item: i })} data-testid={`room-book-${i.id}`}><CalendarPlus className="h-3.5 w-3.5" />{tx('Book a visit', 'विज़िट तय करें')}</button>}
                  {(i.mediaAvailable?.photos > 0 || i.mediaAvailable?.videos > 0) && (
                    <button className={`inline-flex min-h-8 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-semibold ${mediaFor === i.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`} onClick={() => setMediaFor(mediaFor === i.id ? '' : i.id)} data-testid={`room-media-${i.id}`}>
                      <ImageIcon className="h-3.5 w-3.5" />{tx('Photos & video', 'फ़ोटो और वीडियो')} ({(i.media?.photos?.length || 0) + (i.media?.videos?.length || 0)}/{i.mediaAvailable.photos + i.mediaAvailable.videos})
                    </button>
                  )}
                </div>
              )}
              {mediaFor === i.id && <MediaPicker roomId={id} item={i} onSaved={(room) => { setR(room); setMediaFor(''); onChange(); }} onClose={() => setMediaFor('')} />}
            </div>
          ))}
        </div>
        {noListings ? <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900" data-testid="room-no-listings">{tx('Your broker has not switched on “See listings” for you — you can chat, but adding homes needs that switch.', 'आपके ब्रोकर ने आपके लिए “लिस्टिंग देखे” चालू नहीं किया है — आप चैट कर सकते हैं, पर घर जोड़ने के लिए वह स्विच चाहिए।')}</p> : <div className="mt-2 space-y-1.5 rounded-lg bg-slate-50 p-2">
          <input className={inp} value={pq} onChange={e => setPq(e.target.value)} placeholder={tx('Find a property to share — title, locality, city or ID', 'शेयर करने के लिए प्रॉपर्टी खोजें — नाम, इलाका, शहर या ID')} aria-label={tx('Find a property to share', 'शेयर करने के लिए प्रॉपर्टी खोजें')} />
          <select className={inp} value={pick} onChange={e => setPick(e.target.value)} data-testid="room-pick"><option value="">{tx('Choose a property…', 'प्रॉपर्टी चुनें…')}</option>{props.filter(p => !shared.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.title} — {p.locality}, {p.city} · {formatINR(p.askingPrice)}</option>)}</select>
          <input className={inp} maxLength={200} value={pnote} onChange={e => setPnote(e.target.value)} placeholder={tx('A line for your client (optional) — no phone numbers', 'क्लाइंट के लिए एक लाइन (वैकल्पिक) — फ़ोन नंबर नहीं')} />
          <button className={dark} disabled={!pick} onClick={() => run(() => api.crAddItem(id, pick, pnote || undefined), () => { setPick(''); setPnote(''); })} data-testid="room-add-prop"><Home className="h-4 w-4" />{tx('Share with client', 'क्लाइंट को दिखाएँ')}</button>
          <p className="text-[10px] text-slate-500">{tx('The listing\'s photos and video go with it — change them with "Photos & video".', 'लिस्टिंग की फ़ोटो और वीडियो साथ जाते हैं — "फ़ोटो और वीडियो" से बदलें।')}</p>
        </div>}
      </section>
      )}

      {tab === 'visits' && (
        <section className="space-y-2" data-testid="room-visits">
          {reqs.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-500">{tx('Your client has not asked for a visit yet. He can ask from any home in his room.', 'आपके क्लाइंट ने अभी विज़िट नहीं माँगी। वह अपने रूम की किसी भी प्रॉपर्टी से माँग सकता है।')}</p>}
          {reqs.map((v: any) => (
            <div key={v.id} className={`rounded-lg border p-2.5 text-xs ${v.status === 'REQUESTED' ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
              <div className="font-semibold">{v.item.property?.title || v.item.propertyId}</div>
              <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{tx('Wants to visit', 'देखने आना चाहता है')}: <b>{when(v.preferred)}</b>{v.note ? ` — ${v.note}` : ''}</span>
                {v.status === 'REQUESTED'
                  ? <span className="inline-flex gap-1">
                      {v.item.property?.available && !staff && <button className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white" onClick={() => setBook({ item: v.item, req: v })} data-testid={`room-visits-book-${v.id}`}>{tx('Book this visit', 'यह विज़िट तय करें')}</button>}
                      <button className="rounded border border-amber-400 bg-white px-2 py-1 font-semibold" onClick={() => run(() => api.crVisitHandled(id, v.item.id, v.id))}>{tx('Done', 'हो गया')}</button>
                    </span>
                  : <span>✔ {v.visitId ? `${tx('booked', 'तय')} · ${v.visitId}` : tx('handled', 'हो गया')}</span>}
              </div>
            </div>
          ))}
          {r.items.flatMap((i: any) => (i.visits || []).map((v: any) => ({ ...v, item: i }))).sort((a: any, b: any) => a.when.localeCompare(b.when)).map((v: any) => (
            <div key={v.visitId} className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-900"><Check className="h-3.5 w-3.5" /><b>{v.item.property?.title || v.item.propertyId}</b> · {tx('visit booked', 'विज़िट तय')} {when(v.when)} <span className="text-emerald-600">· {v.visitId}</span></div>
          ))}
          <p className="text-[11px] text-slate-500">{tx('"Book this visit" opens the verified-visit form with your client and the home filled in. Type his full mobile (it must match this room) — a verified visit also protects him as your buyer, and his room shows the visit time.', '"यह विज़िट तय करें" से वेरिफ़ाइड विज़िट का फ़ॉर्म क्लाइंट और प्रॉपर्टी भरकर खुलता है। उसका पूरा मोबाइल लिखें (इसी रूम वाला) — वेरिफ़ाइड विज़िट से वह आपके खरीदार के रूप में सुरक्षित रहता है, और उसके रूम में विज़िट का समय दिखता है।')}</p>
        </section>
      )}

      {tab === 'info' && (
        <section className="space-y-3 text-xs" data-testid="room-info">
          {!r.smsOn && <p className="rounded-lg bg-amber-50 p-3 text-slate-700">{tx('The code is not sent by SMS — it appears here when your client asks for it. Read it out to him by phone.', 'कोड SMS से नहीं जाता — क्लाइंट के माँगने पर वह यहाँ दिखता है। उसे फ़ोन पर बता दें।')}</p>}
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="font-semibold text-slate-700">{tx('My private note', 'मेरा निजी नोट')}</div>
            <p className="mt-0.5 whitespace-pre-wrap text-slate-600">{r.note || tx('No note.', 'कोई नोट नहीं।')}</p>
            <p className="mt-2 text-[11px] text-slate-500">{tx('Room link valid till', 'रूम लिंक इस तारीख़ तक')}: {when(r.expiresAt)} · {tx('it moves forward each time your client opens it', 'क्लाइंट जब भी खोलता है, यह आगे बढ़ जाती है')}</p>
          </div>
          {/* v46 — the client's phones: at most 2; remove one that is not your client's */}
          <div className="rounded-lg border border-slate-200 p-3" data-testid="room-devices">
            <div className="font-semibold text-slate-700">{tx(`Client's phones (${(r.devices || []).length} of ${r.maxDevices || 2})`, `क्लाइंट के फ़ोन (${(r.devices || []).length} / ${r.maxDevices || 2})`)}</div>
            <p className="mt-0.5 text-[11px] text-slate-500">{tx('Once he types the code on a phone, that phone opens the room without a code (as long as he opens it at least once in 60 days). A third phone is refused until you remove one.', 'किसी फ़ोन पर एक बार कोड डालने के बाद वह फ़ोन बिना कोड के खुलता है (60 दिन में एक बार खोलता रहे)। तीसरा फ़ोन तब तक नहीं जुड़ेगा जब तक आप एक हटाएँ नहीं।')}</p>
            {(r.devices || []).length === 0 && <p className="mt-1 text-slate-500">{tx('Not opened on any phone yet.', 'अभी किसी फ़ोन पर नहीं खोला।')}</p>}
            <ul className="mt-1 space-y-1">
              {(r.devices || []).map((d: any) => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                  <span><b>{d.label}</b> <span className="text-slate-500">· {tx('since', 'से')} {when(d.firstAt)} · {tx('last seen', 'आख़िरी बार')} {when(d.lastAt)}</span></span>
                  <button className="rounded-md border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50" data-testid="room-device-remove"
                    onClick={() => { if (window.confirm(tx('Remove this phone? It is signed out at once.', 'यह फ़ोन हटाएँ? यह तुरंत लॉग-आउट हो जाएगा।'))) run(() => api.crDelDevice(id, d.id)); }}>{tx('Remove', 'हटाएँ')}</button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1 font-semibold text-slate-700"><Info className="h-3.5 w-3.5" />{tx('What happened in this room', 'इस रूम में क्या हुआ')}</div>
            <ol className="space-y-1 border-l-2 border-slate-200 pl-3">
              {(r.events || []).slice().reverse().map((e: any, k: number) => <li key={k} className="text-slate-600"><span className="text-slate-400">{when(e.at)}</span> — {e.text}</li>)}
            </ol>
          </div>
        </section>
      )}

      {err && <p className="text-xs font-medium text-red-700" role="alert" data-testid="room-error">{err}</p>}
      </div>
      )}
      {book && (
        <Suspense fallback={null}>
          <ScheduleVisitModal
            isOpen
            dealId=""
            propertyId={book.item.propertyId}
            propertyTitle={book.item.property?.title}
            defaults={{ when: book.req?.preferred, note: book.req?.note }}
            clientRoom={{ id, itemId: book.item.id, requestId: book.req?.id, phoneLast4: r.phoneLast4, clientName: r.clientName }}
            onClose={() => { setBook(null); load(); onChange(); }}
            onSuccess={() => { load(); onChange(); }}
          />
        </Suspense>
      )}
    </ChatShell>
  );
};

/** v40 — choose which photos / videos of a home the client sees (only this listing's own, and only what this broker may share) */
const MediaPicker: React.FC<{ roomId: string; item: any; onSaved: (room: any) => void; onClose: () => void }> = ({ roomId, item, onSaved, onClose }) => {
  const tx = useTx();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [ph, setPh] = useState<Set<string>>(new Set()); const [vi, setVi] = useState<Set<string>>(new Set());
  useEffect(() => {
    api.crItemMedia(roomId, item.id).then(x => { setD(x); setPh(new Set(x.chosen.photos)); setVi(new Set(x.chosen.videos)); }).catch(e => setErr(e.message));
  }, [roomId, item.id]);
  const flip = (set: Set<string>, setter: (s: Set<string>) => void, u: string, max: number) => {
    const n = new Set(set); if (n.has(u)) n.delete(u); else { if (n.size >= max) { setErr(tx(`At most ${max} here`, `यहाँ ज़्यादा से ज़्यादा ${max}`)); return; } n.add(u); }
    setErr(''); setter(n);
  };
  if (!d) return <div className="mt-2 rounded-lg bg-slate-50 p-3 text-center">{err ? <p className="text-xs text-red-700">{err}</p> : <Loader2 className="mx-auto h-4 w-4 animate-spin text-slate-400" />}</div>;
  const vkind = (k: string) => k === 'YOUTUBE' ? 'YouTube' : k === 'FILE' ? tx('video file', 'वीडियो फ़ाइल') : tx('link', 'लिंक');
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-300 bg-slate-50 p-2.5" data-testid="room-media-picker">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-slate-800">{tx('What your client sees', 'क्लाइंट क्या देखेगा')}</b>
        <span className="flex gap-1">
          <button className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px]" onClick={() => { setPh(new Set(d.available.photos.slice(0, d.limits.maxPhotos))); setVi(new Set(d.available.videos.slice(0, d.limits.maxVideos).map((v: any) => v.url))); }}>{tx('All', 'सब')}</button>
          <button className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px]" onClick={() => { setPh(new Set()); setVi(new Set()); }}>{tx('None', 'कोई नहीं')}</button>
        </span>
      </div>
      {d.available.photos.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {d.available.photos.map((u: string, k: number) => (
            <button key={u} type="button" onClick={() => flip(ph, setPh, u, d.limits.maxPhotos)} className={`relative overflow-hidden rounded-md border-2 ${ph.has(u) ? 'border-emerald-500' : 'border-transparent opacity-60'}`} aria-pressed={ph.has(u)} aria-label={tx(`Photo ${k + 1}`, `फ़ोटो ${k + 1}`)} data-testid="room-media-photo">
              <img src={u} alt="" loading="lazy" className="h-16 w-full bg-slate-200 object-cover" />
              {ph.has(u) && <span className="absolute right-1 top-1 rounded-full bg-emerald-500 p-0.5 text-white"><Check className="h-3 w-3" /></span>}
            </button>
          ))}
        </div>
      )}
      {d.available.videos.map((v: any) => (
        <label key={v.url} className="flex items-center gap-2 rounded bg-white px-2 py-1.5">
          <input type="checkbox" checked={vi.has(v.url)} onChange={() => flip(vi, setVi, v.url, d.limits.maxVideos)} data-testid="room-media-video" />
          <PlayCircle className="h-4 w-4 text-slate-500" /><span className="truncate">{tx('Walkthrough video', 'वॉकथ्रू वीडियो')} · {vkind(v.kind)}</span>
        </label>
      ))}
      <p className="text-[10px] text-slate-500">{tx('Only this listing\'s photos and video — never papers. A photo the owner removes later disappears from the room by itself.', 'सिर्फ़ इसी लिस्टिंग की फ़ोटो और वीडियो — कागज़ कभी नहीं। मालिक बाद में कोई फ़ोटो हटाए तो वह रूम से अपने-आप हट जाएगी।')}</p>
      {err && <p className="text-[11px] text-red-700">{err}</p>}
      <div className="flex gap-2">
        <button className={dark + ' min-h-9 text-xs'} disabled={busy} onClick={async () => { setBusy(true); setErr(''); try { const x = await api.crSetMedia(roomId, item.id, { photos: [...ph], videos: [...vi] }); onSaved(x.room); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }} data-testid="room-media-save">{tx(`Show ${ph.size} photo(s)${vi.size ? ' + video' : ''}`, `${ph.size} फ़ोटो${vi.size ? ' + वीडियो' : ''} दिखाएँ`)}</button>
        <button className={light + ' min-h-9 text-xs'} onClick={onClose}>{tx('Cancel', 'रद्द')}</button>
      </div>
    </div>
  );
};
