/**
 * v50 — one chat look for every conversation in the app (client rooms and deal rooms).
 *
 *   ChatShell  — the whole-screen frame on a phone (a bar with ← name, the thread, and the message box pinned at the bottom;
 *                the app header and the bottom menu are covered) and a plain card on a big screen. The phone's Back button closes it.
 *   ChatThread — the messages (day chips, one bubble per message, the sender's name only where it is not obvious) and the message box.
 *
 * Both are presentation only: whoever uses them loads and sends the messages.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, MessageSquare, Send, Zap } from 'lucide-react';
import { useI18n, useTx } from '../lib/i18n.js';

export interface ThreadMsg {
  id: string;
  mine: boolean;
  /** name of the sender — shown above a bubble that is not mine, when `showWho` is on */
  who: string;
  text: string;
  at: string;
  /** a small "about PROP-…" line under the text */
  ref?: string;
  /** an attached file or media link */
  link?: string;
}

const timeOf = (iso: string) => { try { return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
const dayKey = (iso: string) => { try { return new Date(iso).toDateString(); } catch { return iso; } };
const dayLabel = (iso: string, hi: boolean) => {
  const d = new Date(iso); const t = new Date();
  const yd = new Date(); yd.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return hi ? 'आज' : 'Today';
  if (d.toDateString() === yd.toDateString()) return hi ? 'कल' : 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
};

export const ChatThread: React.FC<{
  msgs: ThreadMsg[];
  /** send the text; resolve to `false` when it was refused (the text stays in the box) */
  onSend: (text: string) => Promise<boolean | void> | boolean | void;
  placeholder: string;
  emptyHint?: string;
  /** show the sender's name above the first bubble of each run (group chats: more than one other person) */
  showWho?: boolean;
  /** one-tap replies behind a ⚡ button */
  quick?: { en: string; hi: string }[];
  /** something that belongs to the message box (e.g. "About: which property") */
  composerTop?: React.ReactNode;
  /** an extra round button at the left of the message box */
  leading?: React.ReactNode;
  error?: string;
  ids?: { root?: string; chat?: string; input?: string; send?: string; quick?: string };
}> = ({ msgs, onSend, placeholder, emptyHint, showWho, quick, composerTop, leading, error, ids = {} }) => {
  const tx = useTx();
  const hi = useI18n().lang === 'hi';
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  useEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length]);
  const grow = () => { const el = field.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; };
  useEffect(grow, [text]);

  const send = async () => {
    const v = text.trim();
    if (!v || busy) return;
    setBusy(true);
    try { const ok = await onSend(v); if (ok !== false) { setText(''); setQuickOpen(false); } } finally { setBusy(false); field.current?.focus(); }
  };

  let lastDay = ''; let lastWho = '';
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" data-testid={ids.root || 'chat-thread'}>
      <div ref={box} className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-slate-100 px-3 py-3" data-testid={ids.chat || 'chat-messages'}>
        {msgs.length === 0 && (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-slate-500">
            <MessageSquare className="h-8 w-8 text-slate-300" aria-hidden />
            <p>{emptyHint || tx('No messages yet.', 'अभी कोई संदेश नहीं।')}</p>
          </div>
        )}
        {msgs.map(m => {
          const dk = dayKey(m.at); const newDay = dk !== lastDay; lastDay = dk;
          const who = m.mine ? '__me' : m.who; const newRun = newDay || who !== lastWho; lastWho = who;
          return (
            <React.Fragment key={m.id}>
              {newDay && <div className="sticky top-0 z-10 flex justify-center py-1"><span className="rounded-full bg-white/95 px-3 py-0.5 text-xs font-semibold text-slate-500 shadow-xs">{dayLabel(m.at, hi)}</span></div>}
              <div className={`flex ${m.mine ? 'justify-end' : 'justify-start'} ${newRun ? 'pt-1.5' : ''}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-[15px] leading-snug ${m.mine ? 'rounded-br-md bg-emerald-100 text-slate-900' : 'rounded-bl-md bg-white text-slate-900 shadow-xs'}`}>
                  {showWho && !m.mine && newRun && <div className="mb-0.5 text-xs font-bold text-indigo-700">{m.who}</div>}
                  {m.text}
                  {m.ref && <div className="mt-0.5 text-xs text-slate-500">↳ {m.ref}</div>}
                  {m.link && <a href={m.link} target="_blank" rel="noreferrer" className="mt-1 block text-xs font-semibold text-blue-700 underline">{tx('Attached file', 'संलग्न फ़ाइल')}</a>}
                  <div className="mt-0.5 text-right text-xs text-slate-400">{timeOf(m.at)}</div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white px-2.5 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {quick && quickOpen && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1" data-testid={ids.quick || 'chat-quick'}>
            {quick.map(q => <button key={q.en} type="button" onClick={() => { setText(hi ? q.hi : q.en); setQuickOpen(false); field.current?.focus(); }} className="min-h-9 shrink-0 rounded-full border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700">{hi ? q.hi : q.en}</button>)}
          </div>
        )}
        {composerTop}
        {error && <p className="mb-1 text-xs font-medium text-red-700" role="alert">{error}</p>}
        <form onSubmit={e => { e.preventDefault(); void send(); }} className="flex items-end gap-2">
          {leading}
          {quick && (
            <button type="button" onClick={() => setQuickOpen(o => !o)} aria-pressed={quickOpen} aria-label={tx('Quick replies', 'तैयार जवाब')}
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${quickOpen ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600'}`}><Zap className="h-5 w-5" /></button>
          )}
          <textarea ref={field} rows={1} value={text} maxLength={1000} onChange={e => setText(e.target.value)} placeholder={placeholder} enterKeyHint="send"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia?.('(pointer: fine)').matches) { e.preventDefault(); void send(); } }}
            className="max-h-[120px] min-h-11 flex-1 resize-none rounded-2xl border border-slate-300 bg-white px-3.5 py-2.5 text-base leading-snug focus:border-slate-900 focus:outline-none sm:text-sm" data-testid={ids.input || 'chat-input'} />
          <button type="submit" disabled={!text.trim() || busy} aria-label={tx('Send', 'भेजें')} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white disabled:bg-slate-300" data-testid={ids.send || 'chat-send'}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </form>
      </div>
    </div>
  );
};

export const ChatShell: React.FC<{
  onBack: () => void;
  avatar: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  /** buttons at the right end of the bar */
  actions?: React.ReactNode;
  /** a strip between the bar and the thread (tabs, a notice) */
  below?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
  backId?: string;
}> = ({ onBack, avatar, title, subtitle, actions, below, children, testId, backId }) => {
  const tx = useTx();
  const backRef = useRef(onBack); backRef.current = onBack;
  // on a phone the on-screen keyboard shrinks the visible area (not the page): follow it, so the message box stays above the keyboard
  const [vv, setVv] = useState<{ h: number; t: number } | null>(null);
  useEffect(() => {
    const v = window.visualViewport;
    if (!v || !window.matchMedia?.('(max-width: 1023px)').matches) return;
    const f = () => setVv({ h: v.height, t: v.offsetTop });
    f(); v.addEventListener('resize', f); v.addEventListener('scroll', f);
    return () => { v.removeEventListener('resize', f); v.removeEventListener('scroll', f); };
  }, []);
  // on a phone the Back button closes the chat instead of leaving the app; the page behind does not scroll
  useEffect(() => {
    const phone = window.matchMedia?.('(max-width: 1023px)').matches;
    if (!phone) return;
    let popped = false;
    try { window.history.pushState({ genzChat: true }, ''); } catch { /* old browser */ }
    const pop = () => { popped = true; backRef.current(); };
    window.addEventListener('popstate', pop);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('popstate', pop);
      document.body.style.overflow = prev;
      try { if (!popped && window.history.state?.genzChat) window.history.back(); } catch { /* old browser */ }
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-white lg:static lg:z-auto lg:h-[max(28rem,calc(100vh-19rem))] lg:overflow-hidden lg:rounded-xl lg:border lg:border-slate-200" role="dialog" aria-label={title} data-testid={testId || 'chat-shell'}
      style={vv ? { top: vv.t, height: vv.h, bottom: 'auto' } : undefined}>
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] lg:pt-2">
        <button type="button" onClick={onBack} aria-label={tx('Back', 'वापस')} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 lg:hidden" data-testid={backId || 'chat-back'}><ArrowLeft className="h-5 w-5" /></button>
        {avatar}
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold leading-tight text-slate-900">{title}</div>
          {subtitle && <div className="truncate text-xs text-slate-500">{subtitle}</div>}
        </div>
        {actions}
      </header>
      {below}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
};
