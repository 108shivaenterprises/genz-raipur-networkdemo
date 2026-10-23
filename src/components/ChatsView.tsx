/**
 * v50 — Chats: every conversation in one list, like a chat app.
 * Client rooms (my own buyers / renters) and deal-room chats (the co-broker, the owner) sit together, newest first, with the last message and an unread
 * count. Tap one → the whole screen is that chat (← back, messages, the message box at the bottom). Nothing about who may read what has changed:
 * the lists come from the same routes as before (/api/client-rooms and /api/chats/deals, which applies the deal-room chat rules).
 */
import { PropertyThumb } from './PropertyThumb.js';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, MessageSquare, Search } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { ROOM_KINDS } from '../shared/clientRoomRules.js';
import { ChatShell, ChatThread, type ThreadMsg } from './ChatKit.js';
import { RoomDetail } from './ClientRooms.js';
import { goto } from '../lib/goto.js';

const KIND_TONE: Record<string, string> = { BUYER: 'bg-sky-600', RENTER: 'bg-violet-600', TENANT: 'bg-amber-600', OTHER: 'bg-slate-600' };
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

/** WhatsApp-style time: today → clock time, yesterday → "Yesterday", this week → day name, older → date */
export const chatTime = (iso: string | undefined, hi: boolean) => {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(+d)) return '';
  const now = new Date(); const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400_000);
  if (diff <= 0) return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (diff === 1) return hi ? 'कल' : 'Yesterday';
  if (diff < 7) return d.toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { weekday: 'short' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

type Row = {
  key: string; kind: 'CLIENT' | 'DEAL'; id: string;
  title: string; sub: string; lastText?: string; lastMine?: boolean; lastBy?: string; lastAt?: string;
  unread: number; tone: string; badge?: string; closed?: boolean;
  /** a client waiting for his code / asking for a visit — shown as small tags under the message */
  tags: { text: string; cls: string }[];
  /** deal chat: the deal room's chat data */
  deal?: any;
};

/** one deal-room chat on its own screen (loads, polls, sends, and tells the server how far I have read) */
const DealChatPane: React.FC<{ row: Row; meId: string; onBack: () => void; onOpenDeal: () => void }> = ({ row, meId, onBack, onOpenDeal }) => {
  const tx = useTx();
  const [msgs, setMsgs] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => api.getDealMessages(row.id).then(r => {
    setMsgs(r.messages);
    api.chatRead(row.id).then(() => window.dispatchEvent(new Event('genz:chats-changed'))).catch(() => undefined);
  }).catch(e => { if (!msgs) setErr(e.message); }), [row.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 12000);
    return () => clearInterval(t);
  }, [load]);
  const thread: ThreadMsg[] = (msgs || []).map(m => ({ id: m.id, mine: m.senderId === meId, who: m.senderName, text: m.text, at: m.timestamp, link: m.mediaUrl }));
  const others = new Set((msgs || []).filter(m => m.senderId !== meId).map(m => m.senderId));
  const send = async (text: string) => {
    setErr('');
    try { const r = await api.sendDealMessage(row.id, { text }); setMsgs(p => [...(p || []), r.message]); window.dispatchEvent(new Event('genz:chats-changed')); return true; }
    catch (e: any) { setErr(e.message || tx('Could not send the message', 'संदेश भेजा नहीं जा सका')); return false; }
  };
  return (
    <ChatShell
      onBack={onBack} testId="deal-chat"
      avatar={<PropertyThumb src={row.deal?.cover} type={row.deal?.propertyType} seed={row.title} className="h-10 w-10 rounded-xl" />}
      title={row.title} subtitle={row.sub}
      actions={<button type="button" onClick={onOpenDeal} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-bold text-indigo-700 hover:bg-indigo-50" data-testid="chat-open-deal"><ExternalLink className="h-4 w-4" aria-hidden />{tx('Deal', 'डील')}</button>}
    >
      {msgs === null && !err ? <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : (
        <ChatThread
          msgs={thread} onSend={send} error={err} showWho={others.size > 1}
          placeholder={tx('Message…', 'संदेश लिखें…')}
          emptyHint={tx('No messages yet. Talk about the visit, token, registry dates here.', 'अभी कोई संदेश नहीं। यहाँ विज़िट, टोकन, रजिस्ट्री की तारीख़ की बात करें।')}
          ids={{ root: 'deal-chat-root', chat: 'deal-chat-messages', input: 'deal-chat-input', send: 'deal-chat-send' }}
        />
      )}
    </ChatShell>
  );
};

export const ChatsView: React.FC<{ meId: string; permissions: string[] }> = ({ meId, permissions }) => {
  const tx = useTx();
  const hi = useI18n().lang === 'hi';
  const canClients = permissions.includes('clientroom:use');
  const canDeals = permissions.includes('deal:chat');
  const [rooms, setRooms] = useState<any[] | null>(null);
  const [deals, setDeals] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [f, setF] = useState<'all' | 'unread' | 'clients' | 'brokers'>('all');
  const [open, setOpen] = useState<string>(() => { try { return new URLSearchParams(window.location.search).get('chat') || ''; } catch { return ''; } });
  const [fresh, setFresh] = useState<{ link: string; name: string; phone: string; id: string } | null>(null);

  // ?chat=c:ID / ?chat=d:ID opens a chat from a link; the address bar is cleaned at once so the Back button and a reload behave
  useEffect(() => { try { const u = new URL(window.location.href); if (u.searchParams.has('chat')) { u.searchParams.delete('chat'); window.history.replaceState(window.history.state, '', u.toString()); } } catch { /* old browser */ } }, []);
  const setOpenUrl = (k: string) => setOpen(k);
  const load = useCallback(() => {
    Promise.all([
      canClients ? api.crList().then(r => setRooms((r.rooms || []).filter((x: any) => x.status === 'ACTIVE'))) : Promise.resolve(setRooms([])),
      canDeals ? api.chatDeals().then(r => setDeals(r.deals || [])) : Promise.resolve(setDeals([])),
    ]).catch(e => setErr(e.message));
  }, [canClients, canDeals]);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 30000);
    window.addEventListener('genz:rooms-changed', load); window.addEventListener('genz:chats-changed', load);
    return () => { clearInterval(t); window.removeEventListener('genz:rooms-changed', load); window.removeEventListener('genz:chats-changed', load); };
  }, [load]);

  const kindLabel = (k: string) => { const x = ROOM_KINDS.find(y => y.id === k); return x ? (hi ? x.hi : x.en) : k; };
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const r of rooms || []) {
      const tags: Row['tags'] = [];
      if (r.codeAsk) tags.push({ text: tx('asking for code', 'कोड माँग रहा है'), cls: 'bg-amber-600 text-white' });
      if (r.openVisits > 0) tags.push({ text: tx(`${r.openVisits} visit ask`, `${r.openVisits} विज़िट अनुरोध`), cls: 'bg-amber-100 text-amber-900' });
      out.push({
        key: 'c:' + r.id, kind: 'CLIENT', id: r.id, title: r.clientName, sub: `${kindLabel(r.kind)} · ••${r.phoneLast4}`,
        lastText: r.lastMessage?.text, lastMine: r.lastMessage ? r.lastMessage.from !== 'CLIENT' : undefined, lastAt: r.lastMessage?.at || r.updatedAt,
        unread: (r.unread || 0) + (r.codeAsk ? 1 : 0), tone: KIND_TONE[r.kind] || KIND_TONE.OTHER, tags,
      });
    }
    for (const d of deals || []) {
      out.push({
        key: 'd:' + d.id, kind: 'DEAL', id: d.id, title: d.propertyTitle,
        sub: [d.with?.length ? tx(`with ${d.with.join(', ')}`, `${d.with.join(', ')} के साथ`) : '', d.stage].filter(Boolean).join(' · '),
        lastText: d.last ? (d.last.media && !d.last.text ? tx('Attachment', 'अटैचमेंट') : d.last.text) : undefined, lastMine: d.last?.mine, lastBy: d.last?.by, lastAt: d.last?.at,
        unread: d.unread || 0, tone: 'bg-amber-500', tags: [], closed: d.closed, deal: d,
      });
    }
    return out;
  }, [rooms, deals, hi]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = q.trim().toLowerCase();
  const match = (r: Row) => (!s || r.title.toLowerCase().includes(s) || r.sub.toLowerCase().includes(s) || (r.lastText || '').toLowerCase().includes(s))
    && (f === 'all' || (f === 'unread' && r.unread > 0) || (f === 'clients' && r.kind === 'CLIENT') || (f === 'brokers' && r.kind === 'DEAL'));
  const talking = rows.filter(r => r.lastText || r.kind === 'CLIENT').filter(match)
    .sort((a, b) => (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0) || String(b.lastAt || '').localeCompare(String(a.lastAt || '')));
  const silent = rows.filter(r => r.kind === 'DEAL' && !r.lastText && !r.closed).filter(match);
  const unreadTotal = rows.reduce((n, r) => n + r.unread, 0);
  const both = canClients && canDeals;
  const cur = rows.find(r => r.key === open);

  if (err) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (rooms === null || deals === null) return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-slate-400" />;

  const renderRow = (r: Row) => (
    <button key={r.key} type="button" onClick={() => setOpenUrl(r.key)} className={`flex w-full items-center gap-3 px-3 py-3 text-left active:bg-slate-100 lg:hover:bg-slate-50 ${open === r.key ? 'bg-slate-100' : ''}`} data-testid={`chat-row-${r.key}`}>
      {r.kind === 'DEAL'
        ? <PropertyThumb src={r.deal?.cover} type={r.deal?.propertyType} seed={r.title} className="h-12 w-12 rounded-xl" />
        : <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white ${r.tone}`} aria-hidden>{initials(r.title)}</span>}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-base ${r.unread > 0 ? 'font-bold' : 'font-semibold'} text-slate-900`}>{r.title}</span>
          <span className={`shrink-0 text-xs ${r.unread > 0 ? 'font-bold text-emerald-700' : 'text-slate-400'}`}>{chatTime(r.lastAt, hi)}</span>
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className={`truncate text-sm ${r.unread > 0 ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>
            {r.lastText ? <>{r.lastMine ? tx('You: ', 'आप: ') : (r.kind === 'DEAL' && r.lastBy ? `${r.lastBy.split(' ')[0]}: ` : '')}{r.lastText}</> : <span className="italic text-slate-400">{r.kind === 'CLIENT' ? tx('No messages yet', 'अभी कोई संदेश नहीं') : tx('Tap to start the chat', 'चैट शुरू करने के लिए दबाएँ')}</span>}
          </span>
          {r.unread > 0 && <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-bold text-white" aria-label={tx(`${r.unread} unread`, `${r.unread} नए`)}>{r.unread}</span>}
        </span>
        {r.tags.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{r.tags.map(t => <span key={t.text} className={`rounded-full px-2 py-0.5 text-xs font-bold ${t.cls}`}>{t.text}</span>)}</span>}
      </span>
    </button>
  );

  const pane = !cur ? (
    <div className="hidden h-[max(28rem,calc(100vh-19rem))] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-sm text-slate-400 lg:flex">{tx('Pick a chat on the left.', 'बाईं ओर से कोई चैट चुनें।')}</div>
  ) : cur.kind === 'CLIENT' ? (
    <RoomDetail key={cur.id} id={cur.id} onChange={load} onBack={() => setOpenUrl('')}
      fresh={fresh && fresh.id === cur.id ? fresh : null} onFreshDone={() => setFresh(null)}
      onLink={(link) => setFresh({ link, name: cur.title, phone: '', id: cur.id })} />
  ) : (
    <DealChatPane key={cur.id} row={cur} meId={meId} onBack={() => { setOpenUrl(''); load(); }}
      onOpenDeal={() => goto('deals', { deal: cur.id, sub: 'overview', chat: '' }, t => window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: t })))} />
  );

  return (
    <div className="space-y-3" data-testid="chats-view">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-slate-900">{tx('Chats', 'चैट')}</h2>
        {canClients && <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: 'clientroom' }))} className="inline-flex min-h-10 items-center rounded-full border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700" data-testid="chats-new-room">{tx('+ New client room', '+ नया क्लाइंट रूम')}</button>}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[24rem_1fr]">
        <div className={`${cur ? 'hidden lg:block' : ''}`}>
          {(rows.length > 6 || s) && (
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input className="min-h-11 w-full rounded-full border border-slate-300 bg-white pl-9 pr-3 text-base sm:text-sm" value={q} onChange={e => setQ(e.target.value)} placeholder={tx('Search chats', 'चैट खोजें')} aria-label={tx('Search chats', 'चैट खोजें')} data-testid="chats-search" />
            </div>
          )}
          {both && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1" role="tablist">
              {([['all', 'All', 'सभी'], ['unread', unreadTotal ? `Unread ${unreadTotal}` : 'Unread', unreadTotal ? `नए ${unreadTotal}` : 'नए'], ['clients', 'Clients', 'क्लाइंट'], ['brokers', 'Brokers', 'ब्रोकर']] as const).map(([id, en, hiT]) => (
                <button key={id} type="button" role="tab" aria-selected={f === id} onClick={() => setF(id)} className={`min-h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold ${f === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`} data-testid={`chats-filter-${id}`}>{tx(en, hiT)}</button>
              ))}
            </div>
          )}
          {talking.length === 0 && silent.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500" data-testid="chats-empty">
              <MessageSquare className="mx-auto mb-2 h-8 w-8 text-slate-300" aria-hidden />
              {s || f !== 'all' ? tx('No chat matches.', 'कोई चैट नहीं मिली।') : tx('No chats yet. Your client rooms and deal chats will appear here.', 'अभी कोई चैट नहीं। आपके क्लाइंट रूम और डील की चैट यहीं दिखेंगी।')}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white lg:max-h-[max(24rem,calc(100vh-24rem))] lg:overflow-y-auto">
              {talking.map(renderRow)}
            </div>
          )}
          {silent.length > 0 && (
            <details className="mt-3 rounded-xl border border-slate-200 bg-white" data-testid="chats-silent">
              <summary className="min-h-11 cursor-pointer list-none px-3 py-3 text-sm font-semibold text-slate-600">{tx(`Deals with no chat yet (${silent.length})`, `जिन डील में अभी चैट नहीं (${silent.length})`)}</summary>
              <div className="divide-y divide-slate-100 border-t border-slate-100">{silent.map(renderRow)}</div>
            </details>
          )}
        </div>
        <div className={cur ? '' : 'hidden lg:block'}>{pane}</div>
      </div>
    </div>
  );
};
