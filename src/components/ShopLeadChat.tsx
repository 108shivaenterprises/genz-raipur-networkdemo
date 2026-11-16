import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { ChatShell, ChatThread, type ThreadMsg } from './ChatKit.js';
import { LeadCard } from './ShopPartners.js';
import { LEAD_KINDS } from '../shared/shopPartner.js';
import { GONE_WORDS, type GoneKind } from '../shared/sahayak.js';

const initials = (n: string) => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

/** v163 — a shop-QR customer's chat opens like every other chat: name on top, the thread, the message box. Lead details (status, room, deal) sit behind "Details". */
export const ShopLeadChat: React.FC<{ l: any; onBack: () => void; onChange: () => void; extra?: React.ReactNode }> = ({ l, onBack, onChange, extra }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const [details, setDetails] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const c = l.chat; const owner = l.kind === 'SELL' || l.kind === 'RENT_OUT'; const kind = LEAD_KINDS.find(k => k.id === l.kind);
  useEffect(() => { if ((c?.unread || 0) > 0) void api.spLeadSeen(l.id).then(onChange).catch(() => undefined); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [l.id, c?.unread]);
  const run = async (fn: () => Promise<any>) => { setBusy(true); setErr(''); try { await fn(); onChange(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const msgs: ThreadMsg[] = (c?.msgs || []).map((m: any, i: number) => {
    const gone = m.gone ? ` · ${tx(GONE_WORDS[m.gone as GoneKind]?.shortEn || 'not available', GONE_WORDS[m.gone as GoneKind]?.shortHi || 'उपलब्ध नहीं')}` : '';
    const text = m.kind === 'ASK' ? `✔ ${tx('Asked him to confirm', 'पुष्टि माँगी')}: ${m.text}` : m.kind === 'HOME' ? `🏠 ${m.title} · ${m.price} · ${m.place}${gone}` : m.by === 'BOT' ? tx(m.en || m.text, m.text) : m.text;
    return { id: String(i), mine: m.by === 'BROKER' || m.by === 'BOT', who: m.by === 'BOT' ? tx('🤖 GENZ assistant', '🤖 GENZ सहायक') : m.by === 'SYSTEM' ? 'GENZ' : l.name, text, at: m.at };
  });
  const matches: any[] = l.matches || [];
  const top = (
    <div className="space-y-1">
      {l.masked && c?.reqConfirmedAt && !owner && matches.length > 0 && (
        <div className="space-y-1" data-testid="sp-matches">
          <p className="text-xs font-semibold text-emerald-900">{tx('He confirmed his need. Share a matching home — his number shows after you share:', 'उन्होंने ज़रूरत पक्की की। मेल खाता घर शेयर करें — शेयर करते ही नंबर दिखेगा:')}</p>
          {matches.map(h => <button key={h.id} type="button" disabled={busy} onClick={() => run(() => api.spOffer(l.id, h.id))} data-testid={`sp-offer-${h.id}`} className="flex min-h-10 w-full items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-semibold text-emerald-900"><span className="truncate">🏠 {h.title}</span><span>{h.price}</span></button>)}
        </div>
      )}
      {l.masked && c?.reqConfirmedAt && !owner && matches.length === 0 && <p className="text-xs text-amber-900" data-testid="sp-no-match">{tx('He confirmed his need, but none of your homes matches it. Add or switch on a matching listing — his number stays hidden until you share one.', 'उन्होंने ज़रूरत पक्की की, पर आपका कोई घर मेल नहीं खाता। मेल खाता लिस्टिंग जोड़ें / चालू करें — तब तक नंबर छुपा रहेगा।')}</p>}
      {l.masked && c && !c.reqConfirmedAt && !c.reqAskedAt && <button type="button" disabled={busy} onClick={() => run(() => api.spAskNeed(l.id))} data-testid="sp-ask-need" className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800">✔ {tx('Ask him to confirm his need', 'उनसे ज़रूरत पक्की करवाएँ')}</button>}
      {l.masked && c?.reqAskedAt && !c.reqConfirmedAt && <p className="text-xs text-slate-700" data-testid="sp-need-waiting">⏳ {tx('Waiting for him to confirm: ', 'उनकी पुष्टि का इंतज़ार: ')}{l.needLine}</p>}
    </div>
  );
  const below = (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700" data-testid="shop-chat-strip">
      <span data-testid={l.masked ? 'sp-masked' : 'sp-unmasked'}>{l.masked ? `🔒 ${tx('Number hidden', 'नंबर छुपा है')} ••${l.phoneLast4}` : `✔ ${tx('Number visible', 'नंबर दिख रहा है')}`}</span>
      {l.brief && <span className="font-semibold">{l.brief.label === 'HOT' ? '🔥' : ''} {tx(l.brief.next.en, l.brief.next.hi)}</span>}
      {!l.bot?.offByBroker && <button type="button" disabled={busy} onClick={() => run(() => api.spBotLead(l.id, !!l.bot?.on))} data-testid="sp-bot-toggle" className="rounded-full border border-slate-300 bg-white px-2 py-0.5 font-semibold">🤖 {l.bot?.on ? tx('Assistant on — I will talk myself', 'सहायक चालू — मैं खुद बात करूँगा') : tx('Let the assistant answer', 'सहायक को जवाब देने दें')}</button>}
      {l.bot?.needsBroker && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900" data-testid="sp-bot-needs">🙋 {tx('Needs you', 'आपकी ज़रूरत')}</span>}
    </div>
  );
  return (
    <ChatShell onBack={onBack} testId="shop-chat-pane" title={l.name} subtitle={`${l.shopName}${kind ? ` · ${hi ? kind.hi : kind.en}` : ''}`}
      avatar={<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-600 text-sm font-bold text-white" aria-hidden>{initials(l.name)}</span>}
      actions={<button type="button" onClick={() => setDetails(d => !d)} data-testid="shop-chat-details" className="inline-flex min-h-10 items-center gap-1 rounded-full border border-slate-300 px-3 text-xs font-bold text-slate-800">{details ? tx('Chat', 'चैट') : tx('Details', 'विवरण')}{details ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button>}
      below={below}>
      {details ? <div className="flex-1 overflow-y-auto bg-slate-50 p-3">{extra}<LeadCard l={l} onChange={onChange} noChat /></div> : (
        <ChatThread msgs={msgs} error={err} composerTop={top} placeholder={tx('Write to him (no phone numbers)', 'उन्हें लिखें (फ़ोन नंबर नहीं)')}
          emptyHint={tx('No messages yet.', 'अभी कोई संदेश नहीं।')}
          onSend={async text => { try { await api.spLeadChat(l.id, text); setErr(''); onChange(); return true; } catch (e: any) { setErr(e.message); return false; } }}
          ids={{ root: 'sp-lead-chat', chat: 'sp-chat-msgs', input: 'sp-chat-input', send: 'sp-chat-send' }} />
      )}
    </ChatShell>
  );
};
