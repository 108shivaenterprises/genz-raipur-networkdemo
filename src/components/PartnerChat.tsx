/**
 * v61 — Builder ↔ channel partner chat (one thread per builder and partner; inside Chats).
 * Text, a photo (shrunk on the phone), and cards: a lead or a booking between the two, and — from the builder — an available unit.
 * Cards show a customer's first name only; GENZ staff do not read these chats (server/partnerchat.ts).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ChevronRight, Contact, Home as HomeIcon, Loader2, ReceiptText, Lock, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { ChatShell, ChatThread, type ThreadMsg } from './ChatKit.js';
import { preparePhoto } from '../lib/photoFile.js';
import { formatINR } from '../lib/utils.js';
import { featureLabel, kindLabel } from '../shared/inventoryRules.js';

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const ICON: Record<string, React.ElementType> = { LEAD: Contact, BOOKING: ReceiptText, UNIT: HomeIcon };

const STATUS: Record<string, [string, string, string]> = {
  AVAILABLE: ['Available', 'उपलब्ध', 'bg-emerald-100 text-emerald-800'], HOLD: ['On hold', 'होल्ड पर', 'bg-amber-100 text-amber-800'],
  BOOKED: ['Booked', 'बुक हो चुकी', 'bg-slate-200 text-slate-700'], RESERVED: ['Reserved', 'रिज़र्व', 'bg-slate-200 text-slate-700'],
};

/** v79 — tap a UNIT card: the unit's own details (what the builder shared with this partner; the price only if the builder allowed it) */
export const UnitSheet: React.FC<{ threadId: string; unitId: string; onClose: () => void }> = ({ threadId, unitId, onClose }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { api.pchatUnit(threadId, unitId).then(setD).catch(e => setErr(e?.message || tx('Could not open the unit', 'यूनिट खुल नहीं सकी'))); }, [threadId, unitId]); // eslint-disable-line react-hooks/exhaustive-deps
  const u = d?.unit; const pr = d?.project;
  const st = u ? (STATUS[u.status] || [u.status, u.status, 'bg-slate-200 text-slate-700']) : null;
  const facts: Array<[string, string]> = u ? ([
    [tx('Type', 'प्रकार'), kindLabel(u.kind, hi)],
    [tx('Unit no.', 'यूनिट नं.'), u.label + (u.code ? ` · ${u.code}` : '')],
    [tx('Block / tower', 'ब्लॉक / टावर'), u.group],
    [tx('Floor', 'मंज़िल'), u.floor !== undefined && u.floor !== null ? String(u.floor) : ''],
    [tx('Size', 'साइज़'), u.areaSqft ? `${Number(u.areaSqft).toLocaleString('en-IN')} sq.ft` : ''],
    [tx('Rate', 'रेट'), u.ratePerSqft ? `${formatINR(u.ratePerSqft)} / sq.ft` : ''],
    [tx('Facing', 'फ़ेसिंग'), u.facing || ''],
    [tx('Road sides', 'सड़क की तरफ़'), u.roadSides ? String(u.roadSides) : ''],
    [tx('Road width', 'सड़क की चौड़ाई'), u.roadWidthFt ? `${u.roadWidthFt} ft` : ''],
    [tx('Plot size', 'प्लॉट का नाप'), u.dimensions || ''],
  ] as Array<[string, string]>).filter(([, v]) => v) : [];
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4" onClick={onClose} data-testid="pc-unit-sheet">
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 pb-6 shadow-xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">{tx('Unit', 'यूनिट')}</p>
            <h3 className="truncate text-base font-bold text-slate-900">{u ? `${u.label} · ${u.config || kindLabel(u.kind, hi)}` : tx('Loading…', 'लोड हो रहा है…')}</h3>
            {pr && <p className="truncate text-xs text-slate-500">{pr.projectName}{[pr.locality, pr.city].filter(Boolean).length ? ` · ${[pr.locality, pr.city].filter(Boolean).join(', ')}` : ''}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={tx('Close', 'बंद करें')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" data-testid="pc-unit-close"><X className="h-5 w-5" /></button>
        </div>
        {err && <p className="rounded-lg bg-red-50 p-2 text-xs font-semibold text-red-700" role="alert">{err}</p>}
        {!u && !err && <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-slate-400" />}
        {u && st && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
              <div>
                <p className="text-[11px] text-slate-500">{tx('Price', 'कीमत')}</p>
                <p className="text-lg font-extrabold text-slate-900" data-testid="pc-unit-price">{u.priceHidden ? tx('On request', 'पूछने पर') : formatINR(u.price)}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${st[2]}`} data-testid="pc-unit-status">{tx(st[0], st[1])}</span>
            </div>
            {facts.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs" data-testid="pc-unit-facts">
                {facts.map(([k, v]) => <div key={k}><dt className="text-[11px] text-slate-500">{k}</dt><dd className="font-semibold text-slate-900">{v}</dd></div>)}
              </dl>
            )}
            {u.features?.length > 0 && <div className="flex flex-wrap gap-1">{u.features.map((f: string) => <span key={f} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-800">{featureLabel(f, hi)}</span>)}</div>}
            {u.note && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{u.note}</p>}
            {pr && (pr.stage || pr.completion || pr.rera) && (
              <p className="text-[11px] text-slate-500">{[pr.stage, pr.completion ? tx(`Completion ${pr.completion}`, `पूरा होना ${pr.completion}`) : '', pr.rera ? `RERA ${pr.rera}` : ''].filter(Boolean).join(' · ')}</p>
            )}
            {u.heldByMe && <p className="text-xs font-semibold text-emerald-700">{tx('This unit is on hold for you.', 'यह यूनिट आपके लिए होल्ड पर है।')}</p>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

/** one card inside a bubble */
export const PartnerCard: React.FC<{ card: { kind: string; refId: string; label: string; sub?: string }; threadId?: string }> = ({ card, threadId }) => {
  const tx = useTx();
  const [openUnit, setOpenUnit] = useState(false);
  if (card.kind === 'PHOTO') {
    const src = `/api/partner-chats/photo/${encodeURIComponent(card.refId)}`;
    return <a href={src} target="_blank" rel="noopener noreferrer" className="mb-1 block overflow-hidden rounded-xl bg-slate-200" data-testid="pc-photo"><img src={src} alt={tx('Photo', 'फ़ोटो')} loading="lazy" className="max-h-64 w-full object-cover" /></a>;
  }
  const Icon = ICON[card.kind] || Contact;
  const kind = card.kind === 'LEAD' ? tx('Lead', 'लीड') : card.kind === 'BOOKING' ? tx('Booking', 'बुकिंग') : tx('Unit', 'यूनिट');
  const inner = (
    <>
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1"><span className="block text-[11px] font-bold uppercase tracking-wide text-indigo-700">{kind}</span><span className="block truncate text-sm font-semibold text-slate-900">{card.label}</span>{card.sub && <span className="block truncate text-xs text-slate-500">{card.sub}</span>}</span>
    </>
  );
  // v79 — a unit card opens the unit's details
  if (card.kind === 'UNIT' && threadId) {
    return (
      <>
        <button type="button" onClick={() => setOpenUnit(true)} className="mb-1 flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white/80 p-2 text-left hover:bg-white" data-testid="pc-card-UNIT" aria-label={tx('Open the unit details', 'यूनिट की जानकारी खोलें')}>
          {inner}<ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        </button>
        {openUnit && <UnitSheet threadId={threadId} unitId={card.refId} onClose={() => setOpenUnit(false)} />}
      </>
    );
  }
  return (
    <div className="mb-1 flex items-start gap-2 rounded-xl border border-slate-200 bg-white/80 p-2" data-testid={`pc-card-${card.kind}`}>
      {inner}
    </div>
  );
};

/** the "+" panel: a photo, or a lead / booking / unit card */
const CardMenu: React.FC<{ id: string; side: string; onCard: (c: { kind: string; refId: string }) => void; onPhoto: (data: string) => void }> = ({ id, side, onCard, onPhoto }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [tab, setTab] = useState<'LEAD' | 'BOOKING' | 'UNIT'>('LEAD');
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { api.pchatCards(id).then(setD).catch(e => setErr(e.message)); }, [id]);
  const list = d ? (tab === 'LEAD' ? d.leads : tab === 'BOOKING' ? d.bookings : d.units) : [];
  const tabs: Array<['LEAD' | 'BOOKING' | 'UNIT', string]> = [['LEAD', tx('Lead', 'लीड')], ['BOOKING', tx('Booking', 'बुकिंग')], ...(side === 'BUILDER' ? [['UNIT', tx('Unit', 'यूनिट')]] as Array<['UNIT', string]> : [])];
  return (
    <div className="space-y-2" data-testid="pc-menu">
      <input ref={file} type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setErr(''); try { const p = await preparePhoto(f, hi); onPhoto(p.data); } catch (x: any) { setErr(x.message); } }} data-testid="pc-photo-input" />
      <button type="button" onClick={() => file.current?.click()} className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800" data-testid="pc-photo-pick"><Camera className="h-4 w-4" />{tx('Photo (site, cheque, brochure page…)', 'फ़ोटो (साइट, चेक, ब्रोशर का पेज…)')}</button>
      <div className="flex gap-1" role="tablist">{tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-9 flex-1 rounded-lg text-xs font-semibold ${tab === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`} data-testid={`pc-tab-${k}`}>{l}</button>)}</div>
      {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
      {!d && !err ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /> : list.length === 0 ? (
        <p className="rounded-lg bg-white p-2 text-xs text-slate-500">{tab === 'LEAD' ? tx('No leads between you yet.', 'आपके बीच अभी कोई लीड नहीं।') : tab === 'BOOKING' ? tx('No bookings between you yet.', 'आपके बीच अभी कोई बुकिंग नहीं।') : tx('No available unit in the shared projects.', 'साझा प्रोजेक्ट में कोई खाली यूनिट नहीं।')}</p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto">{list.map((c: any) => (
          <li key={c.refId}><button type="button" onClick={() => onCard({ kind: c.kind, refId: c.refId })} className="w-full rounded-lg bg-white px-3 py-2 text-left" data-testid={`pc-pick-${c.refId}`}><span className="block truncate text-sm font-semibold text-slate-900">{c.label}</span>{c.sub && <span className="block truncate text-xs text-slate-500">{c.sub}</span>}</button></li>
        ))}</ul>
      )}
    </div>
  );
};

export const PartnerChatPane: React.FC<{ id: string; fallbackTitle: string; onBack: () => void }> = ({ id, fallbackTitle, onBack }) => {
  const tx = useTx();
  const [t, setT] = useState<any>(null); const [side, setSide] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => api.pchatGet(id).then(r => { setT(r.thread); setSide(r.side); window.dispatchEvent(new Event('genz:chats-changed')); }).catch(e => setErr(e.message)), [id]);
  useEffect(() => { load(); const iv = setInterval(() => { if (!document.hidden) load(); }, 12000); return () => clearInterval(iv); }, [load]);
  const send = async (b: { text?: string; card?: { kind: string; refId: string }; photo?: string }) => {
    setErr('');
    try { const r = await api.pchatSend(id, b); setT((x: any) => x ? { ...x, messages: [...x.messages, r.message] } : x); window.dispatchEvent(new Event('genz:chats-changed')); return true; }
    catch (e: any) { setErr(e.message || tx('Could not send the message', 'संदेश भेजा नहीं जा सका')); return false; }
  };
  const msgs: ThreadMsg[] = (t?.messages || []).map((m: any) => ({ id: m.id, mine: m.mine, who: m.byName, text: m.text, at: m.at, by: m.by, card: m.card ? <PartnerCard card={m.card} threadId={id} /> : undefined, hideText: !m.text }));
  const quick = side === 'BUILDER' ? [
    { en: 'Lead accepted — please plan the site visit.', hi: 'लीड मंज़ूर — साइट विज़िट तय करें।' },
    { en: 'Booking approved — please collect the booking amount.', hi: 'बुकिंग मंज़ूर — बुकिंग अमाउंट ले लें।' },
    { en: 'Your brokerage has been released.', hi: 'आपकी ब्रोकरेज भेज दी गई है।' },
    { en: 'Please share the client’s visit time.', hi: 'क्लाइंट की विज़िट का समय बताइए।' },
  ] : [
    { en: 'Please check my lead.', hi: 'मेरी लीड जाँच लीजिए।' },
    { en: 'Is this unit still available?', hi: 'क्या ये यूनिट अभी खाली है?' },
    { en: 'Client is coming for the site visit tomorrow at 11 AM.', hi: 'क्लाइंट कल 11 बजे साइट विज़िट पर आ रहे हैं।' },
    { en: 'When will the brokerage be released?', hi: 'ब्रोकरेज कब तक मिलेगी?' },
  ];
  const title = t?.with || fallbackTitle;
  return (
    <ChatShell onBack={onBack} testId="partner-chat"
      avatar={<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white" aria-hidden>{initials(title)}</span>}
      title={title} subtitle={t?.projects?.length ? t.projects.join(' · ') : tx('Partner chat', 'पार्टनर चैट')}>
      {!t && !err ? <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : (
        <ChatThread msgs={msgs} onSend={text => send({ text })} error={err} showWho={side === 'PARTNER'} quick={quick}
          menu={t?.open ? (close => <CardMenu id={id} side={side} onCard={c => { close(); void send({ card: c }); }} onPhoto={data => { close(); void send({ photo: data }); }} />) : undefined}
          composerTop={t && !t.open ? <p className="mb-1 flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600" data-testid="pc-closed"><Lock className="h-3 w-3" />{tx('This partnership has ended — the chat is read-only.', 'यह साझेदारी ख़त्म हो गई — चैट सिर्फ़ पढ़ने के लिए है।')}</p> : undefined}
          placeholder={tx('Message…', 'संदेश लिखें…')}
          emptyHint={side === 'BUILDER' ? tx('Talk with this partner about his leads, visits, bookings and payouts. Use + for a lead, a unit or a photo.', 'इस पार्टनर से उसकी लीड, विज़िट, बुकिंग और पेमेंट की बात करें। लीड, यूनिट या फ़ोटो के लिए + दबाएँ।') : tx('Ask the builder about your leads, units, bookings and brokerage. Use + for a lead, a booking or a photo.', 'बिल्डर से अपनी लीड, यूनिट, बुकिंग और ब्रोकरेज की बात करें। लीड, बुकिंग या फ़ोटो के लिए + दबाएँ।')}
          ids={{ root: 'pc-root', chat: 'pc-messages', input: 'pc-input', send: 'pc-send' }} />
      )}
    </ChatShell>
  );
};

/** open (or make) the chat with a partner / builder and show it in Chats */
export async function openPartnerChat(withId: string): Promise<void> {
  const r = await api.pchatOpen(withId);
  try { const u = new URL(window.location.href); u.searchParams.set('chat', `p:${r.id}`); window.history.replaceState(window.history.state, '', u.toString()); } catch { /* old browser */ }
  window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: 'chats' }));
}
