/**
 * v53 — the "+" menu of the deal chat, and the cards it puts in the chat.
 *
 *   useDealChatKit  — one hook for every screen that shows a deal chat (the deal room and the Chats inbox): it loads what the menu needs, gives the
 *                     "+" panel, the brokers-only switch + banner, and turns a stored message into a bubble with its card.
 *   ChatCard        — the card inside a bubble. A message stores only `kind` + `refId`; the card is filled in from what THIS reader may see
 *                     (his privacy-shielded copy of the property, the vault files he may open, his own visit list), so a card never shows more
 *                     than he could open himself.
 *
 * "+" is a shortcut, not a new way to share: a document is offered only if the sender may open it; giving the deal room access is the same
 * vault grant as before (asked for in plain words, never silent); the stage moves by the same server rules (one step at a time, visit / agreement
 * needed); nothing here holds money, takes contact numbers or records voice.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Building2, CalendarClock, Camera, Check, ChevronLeft, ChevronRight, ExternalLink, FileText, Flag, Loader2, Lock, MapPin } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';
import { formatINR } from '../lib/utils.js';
import { isClosed } from '../shared/dealClose.js';
import { PropertyThumb } from './PropertyThumb.js';
import { STAGES } from './DealHub.js';
import type { ThreadMsg } from './ChatKit.js';

interface Data { deal: any; property: any; visits: any[]; assets: any[]; isPrincipal: boolean; shared: Set<string> }

/** which assets a still-valid "deal room participants" grant of THIS deal already opens */
const sharedWithRoom = (grants: any[], dealId: string) => {
  const out = new Set<string>();
  for (const g of grants || []) {
    if (g.isRevoked || g.recipientType !== 'DEAL_ROOM_PARTICIPANTS' || g.recipientId !== dealId) continue;
    if (g.expiresAt && Date.parse(g.expiresAt) < Date.now()) continue;
    (g.assetIds || []).forEach((a: string) => out.add(a));
  }
  return out;
};

const CATEGORY: Record<string, [string, string]> = {
  OWNERSHIP_TITLE_DEED: ['Title deed', 'टाइटल डीड'], SALE_DEED_CHAIN: ['Sale-deed chain', 'सेल-डीड की कड़ी'], LAYOUT_SITE_PLAN: ['Layout / site plan', 'लेआउट / साइट प्लान'],
  SURVEY_MEASUREMENT: ['Survey / measurement', 'सर्वे / माप'], TAX_RECEIPT_NOC: ['Tax receipt / NOC', 'टैक्स रसीद / NOC'], WALKTHROUGH_VIDEO: ['Walkthrough video', 'वॉकथ्रू वीडियो'],
  OTHER_ATTACHMENT: ['Attachment', 'संलग्न फ़ाइल'], PHOTOGRAPH: ['Photo', 'फ़ोटो'],
};

const when = (iso?: string) => { try { return iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''; } catch { return ''; } };

// ───────────── the card inside a bubble ─────────────
const box = 'block w-full rounded-xl border border-slate-200 bg-slate-50 p-2 text-left hover:bg-slate-100';

export const ChatCard: React.FC<{ m: any; data: Data | null; onOpen: (tab: string) => void }> = ({ m, data, onOpen }) => {
  const tx = useTx(); const label = useLabel();
  const p = data?.property;
  const open = (tab: string) => () => onOpen(tab);
  switch (m.kind) {
    case 'PROPERTY':
      return (
        <button type="button" onClick={open('overview')} className={`${box} flex gap-2.5`} data-testid="chat-card-PROPERTY">
          <PropertyThumb src={p?.images?.[0]} type={p?.propertyType} seed={p?.title || m.refId} className="h-14 w-14 rounded-lg" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-slate-900">{p?.title || m.text}</span>
            <span className="block truncate text-xs text-slate-500">{[p?.locality, p?.city].filter(Boolean).join(', ') || m.refId}</span>
            {p?.askingPrice ? <span className="block text-xs font-semibold text-emerald-700">{formatINR(p.askingPrice)}</span> : null}
          </span>
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        </button>
      );
    case 'PHOTO':
      return m.mediaUrl ? (
        <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-200" data-testid="chat-card-PHOTO" aria-label={tx('Open the photo', 'फ़ोटो खोलें')}>
          <img src={m.mediaUrl} alt="" loading="lazy" decoding="async" className="max-h-56 w-full object-cover" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
        </a>
      ) : null;
    case 'DOCUMENT': {
      const a = data?.assets.find((x) => x.id === m.refId);
      const cat = a ? (CATEGORY[a.category] || ['Document', 'दस्तावेज़']) : ['Document', 'दस्तावेज़'];
      return (
        <button type="button" onClick={open('media_vault')} className={`${box} flex items-center gap-2.5`} data-testid="chat-card-DOCUMENT">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700"><FileText className="h-5 w-5" aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-slate-900">{a ? a.originalFileName : tx(cat[0], cat[1])}</span>
            <span className="block text-xs text-slate-500">{a ? tx(cat[0], cat[1]) : data ? tx('Not shared with you yet — ask the sender', 'अभी आपके साथ साझा नहीं — भेजने वाले से कहें') : '…'}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        </button>
      );
    }
    case 'LOCATION': {
      const url = p?.googleMapsUrl || (p?.latitude && p?.longitude ? `https://www.google.com/maps?q=${p.latitude},${p.longitude}` : '');
      const shielded = !!p?.addressHidden;
      return (
        <div className={`${box} cursor-default`} data-testid="chat-card-LOCATION">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700"><MapPin className="h-5 w-5" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-900">{tx('Property location', 'प्रॉपर्टी की लोकेशन')}</span>
              <span className="block truncate text-xs text-slate-500">{[p?.locality, p?.city].filter(Boolean).join(', ') || '…'}</span>
            </span>
          </div>
          {url && <a href={url} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex min-h-9 items-center gap-1 rounded-lg bg-white px-2.5 text-xs font-semibold text-blue-700 ring-1 ring-slate-200" data-testid="chat-card-maps"><ExternalLink className="h-3.5 w-3.5" aria-hidden />{shielded ? tx('Open approximate area', 'मोटा इलाक़ा खोलें') : tx('Open in Maps', 'मैप में खोलें')}</a>}
          {shielded && <p className="mt-1 text-[11px] text-slate-500">{tx('The exact address opens after a verified site visit.', 'सही पता वेरिफ़ाइड साइट विज़िट के बाद खुलता है।')}</p>}
        </div>
      );
    }
    case 'VISIT': {
      const v = data?.visits.find((x) => x.id === m.refId);
      return (
        <button type="button" onClick={open('overview')} className={`${box} flex items-center gap-2.5`} data-testid="chat-card-VISIT">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700"><CalendarClock className="h-5 w-5" aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-900">{tx('Site visit', 'साइट विज़िट')}{v ? ` · ${when(v.scheduledTime)}` : ''}</span>
            <span className={`block text-xs ${v?.isVerified ? 'font-semibold text-emerald-700' : 'text-slate-500'}`}>{v ? (v.isVerified ? tx('Verified on site', 'साइट पर वेरिफ़ाइड') : tx('Scheduled — not verified yet', 'तय — अभी वेरिफ़ाई नहीं')) : data ? tx('Open the deal room for details', 'ब्योरे के लिए डील रूम खोलें') : '…'}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        </button>
      );
    }
    case 'STAGE':
      return (
        <button type="button" onClick={open('overview')} className={`${box} flex items-center gap-2.5`} data-testid="chat-card-STAGE">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800"><Flag className="h-5 w-5" aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-slate-500">{tx('Deal stage', 'डील का स्टेज')}</span>
            <span className="block text-sm font-bold text-slate-900">{label('dealStage', m.refId)}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        </button>
      );
  }
  return null;
};

// ───────────── the panel under the "+" ─────────────
const Tile: React.FC<{ icon: React.ElementType; label: string; tone: string; onClick: () => void; testId: string; busy?: boolean }> = ({ icon: Icon, label, tone, onClick, testId, busy }) => (
  <button type="button" onClick={onClick} disabled={busy} className="flex min-h-[76px] sm:min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl bg-white px-1 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 active:bg-slate-100 disabled:opacity-50" data-testid={testId}>
    <span className={`flex h-9 w-9 items-center justify-center rounded-full ${tone}`}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" aria-hidden />}</span>{label}
  </button>
);

const Head: React.FC<{ title: string; onBack: () => void }> = ({ title, onBack }) => {
  const tx = useTx();
  return (
    <div className="mb-1.5 flex items-center gap-1">
      <button type="button" onClick={onBack} aria-label={tx('Back', 'वापस')} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-200" data-testid="plus-back"><ChevronLeft className="h-5 w-5" /></button>
      <span className="text-sm font-bold text-slate-800">{title}</span>
    </div>
  );
};

/** what the "+" panel needs from the hook */
interface Kit {
  data: Data | null;
  can: { property: boolean; visit: boolean; stage: boolean; private: boolean };
  brokersOnly: boolean;
  setBrokersOnly: (on: boolean) => void;
  post: (body: Record<string, unknown>) => Promise<boolean>;
  startVisit: () => void;
  grantRoom: (assetId: string) => Promise<void>;
  moveStage: (next: string) => Promise<boolean>;
}

const PlusPanel: React.FC<{ kit: Kit; close: () => void }> = ({ kit, close }) => {
  const tx = useTx(); const label = useLabel();
  const [view, setView] = useState<'home' | 'doc' | 'photo' | 'stage'>('home');
  const [ask, setAsk] = useState<any>(null);          // a document waiting for "give the deal room access?"
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const d = kit.data;
  if (!d) return <div className="flex items-center justify-center py-6 text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{tx('Loading…', 'लोड हो रहा है…')}</div>;

  const run = async (key: string, fn: () => Promise<boolean | void>) => {
    setBusy(key); setErr('');
    try { const ok = await fn(); if (ok !== false) close(); } catch (e: any) { setErr(e?.message || tx('Something went wrong', 'कुछ गड़बड़ हुई')); } finally { setBusy(''); }
  };
  const docs = d.assets.filter((a) => a.category !== 'PHOTOGRAPH');
  const photos = [...new Set<string>([...(d.property?.images || []), ...d.assets.filter((a) => a.category === 'PHOTOGRAPH').map((a) => a.fileUrl)])];
  const idx = STAGES.indexOf(d.deal.stage); const next = idx >= 0 ? STAGES[idx + 1] : undefined;

  if (view === 'doc') {
    return (
      <div data-testid="plus-docs">
        <Head title={tx('Send a document', 'दस्तावेज़ भेजें')} onBack={() => { setView('home'); setAsk(null); setErr(''); }} />
        {ask ? (
          <div className="rounded-xl bg-white p-3 ring-1 ring-amber-300" data-testid="plus-doc-ask">
            <p className="text-sm font-semibold text-slate-900">{ask.originalFileName}</p>
            <p className="mt-1 text-xs text-slate-600">{tx('The other side cannot open this file yet. Give the deal room access for 7 days, or send only the card (they will see it exists but cannot open it).', 'दूसरी तरफ़ अभी यह फ़ाइल नहीं खोल सकती। डील रूम को 7 दिन का एक्सेस दें, या सिर्फ़ कार्ड भेजें (उन्हें दिखेगा कि फ़ाइल है, पर खुलेगी नहीं)।')}</p>
            <div className="mt-2 flex flex-col gap-1.5 sm:flex-row">
              <button type="button" disabled={!!busy} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-50" data-testid="plus-doc-grant"
                onClick={() => run('grant', async () => { await kit.grantRoom(ask.id); return kit.post({ kind: 'DOCUMENT', refId: ask.id }); })}>
                {busy === 'grant' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{tx('Send + give access (7 days)', 'भेजें + एक्सेस दें (7 दिन)')}
              </button>
              <button type="button" disabled={!!busy} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50" data-testid="plus-doc-cardonly"
                onClick={() => run('card', () => kit.post({ kind: 'DOCUMENT', refId: ask.id }))}>{tx('Send card only', 'सिर्फ़ कार्ड भेजें')}</button>
            </div>
          </div>
        ) : docs.length === 0 ? (
          <p className="rounded-xl bg-white p-3 text-sm text-slate-500 ring-1 ring-slate-200" data-testid="plus-docs-empty">{tx('No documents in this property’s vault that you can open.', 'इस प्रॉपर्टी के वॉल्ट में आपके खोलने लायक कोई दस्तावेज़ नहीं।')}</p>
        ) : (
          <ul className="space-y-1">
            {docs.map((a) => {
              const cat = CATEGORY[a.category] || ['Document', 'दस्तावेज़'];
              const isShared = !d.isPrincipal || d.shared.has(a.id);
              return (
                <li key={a.id}>
                  <button type="button" disabled={!!busy} className="flex min-h-12 w-full items-center gap-2.5 rounded-xl bg-white px-2.5 py-1.5 text-left ring-1 ring-slate-200 active:bg-slate-100 disabled:opacity-50" data-testid={`plus-doc-${a.id}`}
                    onClick={() => (d.isPrincipal && !d.shared.has(a.id) ? setAsk(a) : void run(a.id, () => kit.post({ kind: 'DOCUMENT', refId: a.id })))}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700"><FileText className="h-4 w-4" aria-hidden /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{a.originalFileName}</span><span className="block text-xs text-slate-500">{tx(cat[0], cat[1])}</span></span>
                    {d.isPrincipal && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${isShared ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{isShared ? tx('Deal room can open', 'डील रूम खोल सकता है') : tx('Not shared', 'साझा नहीं')}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {err && <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">{err}</p>}
      </div>
    );
  }

  if (view === 'photo') {
    return (
      <div data-testid="plus-photos">
        <Head title={tx('Send a photo', 'फ़ोटो भेजें')} onBack={() => { setView('home'); setErr(''); }} />
        {photos.length === 0 ? (
          <p className="rounded-xl bg-white p-3 text-sm text-slate-500 ring-1 ring-slate-200" data-testid="plus-photos-empty">{tx('This property has no photos yet.', 'इस प्रॉपर्टी की अभी कोई फ़ोटो नहीं।')}</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {photos.slice(0, 30).map((u, i) => (
              <button key={u} type="button" disabled={!!busy} onClick={() => void run(u, () => kit.post({ kind: 'PHOTO', mediaUrl: u }))} className="relative aspect-square overflow-hidden rounded-lg bg-slate-200 ring-1 ring-slate-200 disabled:opacity-50" aria-label={tx(`Send photo ${i + 1}`, `फ़ोटो ${i + 1} भेजें`)} data-testid={`plus-photo-${i}`}>
                <img src={u} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                {busy === u && <span className="absolute inset-0 flex items-center justify-center bg-white/60"><Loader2 className="h-5 w-5 animate-spin" /></span>}
              </button>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-[11px] text-slate-500">{tx('Photos already on this property. Taking a new photo from the phone is not part of the chat yet.', 'प्रॉपर्टी की मौजूदा फ़ोटो। फ़ोन से नई फ़ोटो खींचकर भेजना अभी चैट में नहीं है।')}</p>
        {err && <p className="mt-1 text-xs font-medium text-red-700" role="alert">{err}</p>}
      </div>
    );
  }

  if (view === 'stage') {
    return (
      <div data-testid="plus-stage-view">
        <Head title={tx('Deal stage', 'डील का स्टेज')} onBack={() => { setView('home'); setErr(''); }} />
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">{tx('Now at', 'अभी')}</p>
          <p className="text-base font-bold text-slate-900" data-testid="plus-stage-now">{label('dealStage', d.deal.stage)}</p>
          {next ? (
            <button type="button" disabled={!!busy} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-50" data-testid="plus-stage-go"
              onClick={() => run('stage', () => kit.moveStage(next))}>
              {busy === 'stage' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}{tx(`Move to ${next}`, `${label('dealStage', next)} पर ले जाएँ`)}
            </button>
          ) : <p className="mt-1 text-xs text-slate-500">{tx('This deal is at the last stage.', 'यह डील आख़िरी स्टेज पर है।')}</p>}
          <p className="mt-2 text-[11px] text-slate-500">{tx('Stages move one step at a time, by the same rules as the deal room: “Site Visit Done” needs a verified visit, “Agreement” a signed agreement. A card with the new stage is added to the chat.', 'स्टेज एक-एक कदम बढ़ता है, डील रूम वाले ही नियमों से: “साइट विज़िट पूरी” के लिए वेरिफ़ाइड विज़िट, “समझौता” के लिए साइन हुआ समझौता चाहिए। नया स्टेज चैट में कार्ड बनकर जुड़ता है।')}</p>
        </div>
        {err && <p className="mt-1.5 text-xs font-medium text-red-700" role="alert" data-testid="plus-stage-err">{err}</p>}
      </div>
    );
  }

  return (
    <div data-testid="plus-home">
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {kit.can.property && <Tile icon={Building2} label={tx('Property', 'प्रॉपर्टी')} tone="bg-emerald-100 text-emerald-700" testId="plus-property" busy={busy === 'property'} onClick={() => void run('property', () => kit.post({ kind: 'PROPERTY' }))} />}
        {kit.can.property && <Tile icon={FileText} label={tx('Document', 'दस्तावेज़')} tone="bg-indigo-100 text-indigo-700" testId="plus-document" onClick={() => setView('doc')} />}
        {kit.can.property && <Tile icon={Camera} label={tx('Photo', 'फ़ोटो')} tone="bg-violet-100 text-violet-700" testId="plus-photo" onClick={() => setView('photo')} />}
        {kit.can.property && <Tile icon={MapPin} label={tx('Location', 'लोकेशन')} tone="bg-rose-100 text-rose-700" testId="plus-location" busy={busy === 'location'} onClick={() => void run('location', () => kit.post({ kind: 'LOCATION' }))} />}
        {kit.can.visit && <Tile icon={CalendarClock} label={tx('Visit', 'विज़िट')} tone="bg-sky-100 text-sky-700" testId="plus-visit" onClick={() => { kit.startVisit(); close(); }} />}
        {kit.can.stage && <Tile icon={Flag} label={tx('Stage', 'स्टेज')} tone="bg-amber-100 text-amber-800" testId="plus-stage" onClick={() => setView('stage')} />}
      </div>
      {kit.can.private && (
        <button type="button" role="switch" aria-checked={kit.brokersOnly} onClick={() => kit.setBrokersOnly(!kit.brokersOnly)} className="mt-1.5 flex min-h-12 w-full items-center gap-2.5 rounded-xl bg-white px-3 py-1.5 text-left ring-1 ring-slate-200" data-testid="plus-private">
          <Lock className={`h-5 w-5 shrink-0 ${kit.brokersOnly ? 'text-amber-700' : 'text-slate-500'}`} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-900">{tx('Brokers only', 'सिर्फ़ ब्रोकर')}</span>
            <span className="block text-[11px] leading-snug text-slate-500">{tx('The owner will not see it. GENZ can read it only while a dispute is open on this deal.', 'मालिक को नहीं दिखेगा। GENZ इसे सिर्फ़ तब पढ़ सकता है जब इस डील पर विवाद खुला हो।')}</span>
          </span>
          <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${kit.brokersOnly ? 'bg-amber-500' : 'bg-slate-300'}`} aria-hidden><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${kit.brokersOnly ? 'left-[1.375rem]' : 'left-0.5'}`} /></span>
        </button>
      )}
      {err && <p className="mt-1.5 text-xs font-medium text-red-700" role="alert">{err}</p>}
    </div>
  );
};

// ───────────── the hook ─────────────
export function useDealChatKit(o: {
  dealId: string;
  /** the chat is on screen: load what the cards and the menu need */
  active: boolean;
  meId: string;
  role?: string;
  perms: string[];
  /** post a message body ({ kind, refId, mediaUrl, text, audience }); resolve false when it was refused (the host shows the error) */
  send: (body: Record<string, unknown>) => Promise<boolean>;
  /** a tapped card: open this section of the deal room */
  onOpen: (tab: string) => void;
  /** the stage was moved from the menu */
  onStageChanged?: () => void;
}) {
  const tx = useTx();
  const [data, setData] = useState<Data | null>(null);
  const [brokersOnly, setBrokersOnly] = useState(false);
  const pendingVisit = useRef('');
  const live = useRef(o); live.current = o;

  const load = useCallback(async () => {
    const id = live.current.dealId; if (!id) return;
    try {
      const d = await api.getDeal(id);
      let assets: any[] = []; let isPrincipal = false; let shared = new Set<string>();
      if (live.current.perms.includes('property:read') && d.property?.id) {
        try {
          const v = await api.getVaultAssets(d.property.id);
          assets = v.assets || []; isPrincipal = !!v.isOwnerOrListingBroker;
          if (isPrincipal) { try { shared = sharedWithRoom((await api.getVaultGrants(d.property.id)).grants, id); } catch { /* grants unreadable: treat as none */ } }
        } catch { /* no vault access: the document list stays empty */ }
      }
      if (live.current.dealId === id) setData({ deal: d.deal, property: d.property, visits: (d as any).siteVisits || [], assets, isPrincipal, shared });
    } catch { /* the card falls back to its plain text */ }
  }, []);

  useEffect(() => { setData(null); setBrokersOnly(false); pendingVisit.current = ''; }, [o.dealId]);
  useEffect(() => { if (!o.active) setBrokersOnly(false); }, [o.active]);   // leaving the chat switches "Brokers only" off again
  useEffect(() => { if (o.active && o.dealId) void load(); }, [o.active, o.dealId, load]);

  // a visit booked from "+ Visit" comes back as a card in this chat (the visit secret never goes into the chat — the card holds only the visit id)
  const brokersOnlyRef = useRef(false); brokersOnlyRef.current = brokersOnly;
  const post = useCallback((body: Record<string, unknown>) => live.current.send({ ...body, audience: brokersOnlyRef.current ? 'BROKERS' : 'ALL' }), []);
  useEffect(() => {
    const done = (e: Event) => {
      const x = (e as CustomEvent).detail || {};
      if (pendingVisit.current && x.dealId === pendingVisit.current && x.visitId) { pendingVisit.current = ''; void post({ kind: 'VISIT', refId: x.visitId }).then(() => load()); }
    };
    const cancelled = () => { pendingVisit.current = ''; };
    window.addEventListener('genz:visit-scheduled', done); window.addEventListener('genz:visit-modal-closed', cancelled);
    return () => { window.removeEventListener('genz:visit-scheduled', done); window.removeEventListener('genz:visit-modal-closed', cancelled); };
  }, [post, load]);

  const isBroker = !!data && (data.deal.introducingBrokerId === o.meId || data.deal.closingBrokerId === o.meId);
  const closed = !!data && isClosed(data.deal);
  const can = {
    property: o.perms.includes('property:read'),
    visit: !!data && o.perms.includes('sitevisit:create') && !closed && data.deal.stage !== 'Settled',
    stage: !!data && isBroker && o.role !== 'TEAM_MEMBER' && o.perms.includes('deal:update_stage') && !closed && data.deal.stage !== 'Settled',
    private: isBroker && o.role !== 'TEAM_MEMBER',
  };

  const kit: Kit = {
    data, can, brokersOnly, setBrokersOnly, post,
    startVisit: () => {
      if (!data?.property?.id) return;
      pendingVisit.current = data.deal.id;
      window.dispatchEvent(new CustomEvent('genz:schedule-visit', { detail: { dealId: data.deal.id, propertyId: data.property.id } }));
    },
    grantRoom: async (assetId: string) => {
      if (!data?.property?.id) return;
      await api.createVaultGrant(data.property.id, { recipientType: 'DEAL_ROOM_PARTICIPANTS', recipientId: data.deal.id, assetIds: [assetId], permissionLevel: 'VIEW', expiresInDays: 7 });
      await load();
    },
    moveStage: async (next: string): Promise<boolean> => {
      if (!data) return false;
      await api.updateDealStage(data.deal.id, next);          // the server decides (one step, visit / agreement needed …); a refusal reaches the panel as its message
      const ok = await post({ kind: 'STAGE', refId: next });
      await load(); live.current.onStageChanged?.();
      return ok;
    },
  };

  return {
    ...kit,
    /** which channel a plain text message goes to */
    audience: (brokersOnly && can.private ? 'BROKERS' : 'ALL') as 'ALL' | 'BROKERS',
    /** the "Brokers only" strip above the message box while that switch is on */
    banner: brokersOnly && can.private ? (
      <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200" data-testid="chat-private-banner">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="min-w-0 flex-1">{tx('Brokers only — the owner will not see this', 'सिर्फ़ ब्रोकर — मालिक को नहीं दिखेगा')}</span>
        <button type="button" onClick={() => setBrokersOnly(false)} className="-my-1 min-h-9 shrink-0 rounded-lg px-2 font-bold underline" data-testid="chat-private-off">{tx('Turn off', 'बंद करें')}</button>
      </div>
    ) : undefined,
    /** the panel under the "+" (give it to ChatThread's `menu`) */
    menu: (close: () => void) => <PlusPanel kit={kit} close={close} />,
    /** a stored message → a bubble (with its card) */
    thread: (m: any, meId = o.meId): ThreadMsg => {
      const card = m.kind ? <ChatCard m={m} data={data} onOpen={(t) => live.current.onOpen(t)} /> : undefined;
      return { id: m.id, mine: m.senderId === meId, who: m.senderName, text: m.text, at: m.timestamp, link: m.kind === 'PHOTO' ? undefined : m.mediaUrl, card, hideText: !!(card && m.auto), priv: m.audience === 'BROKERS' };
    },
  };
}
