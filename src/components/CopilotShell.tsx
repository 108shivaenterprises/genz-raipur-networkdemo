import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, Check, X, Loader2, Sparkles } from 'lucide-react';
import { useTx } from '../lib/i18n.js';
import { VoiceNote } from './VoiceNote.js';

/** what the shell needs from any plan: a kind, two languages of text, and optional choices / consent / warning */
export interface ShellPlan { kind: string; hi: string; en: string; choices?: { id: string; label: string }[]; needsConsent?: boolean; warn?: { hi: string; en: string } }
export interface ShellRead { text: string; list?: string[] }
interface Msg { who: 'me' | 'bot'; text: string; plan?: ShellPlan; done?: boolean; list?: string[] }

interface Props<P extends ShellPlan> {
  title: [string, string];
  placeholder: [string, string];
  chips: [string, string][];                       // [text sent, label shown]; a chip ending in a space only fills the box
  plan: (raw: string) => P;
  /** read-only plans answer straight away (no confirm card) */
  read: (p: P) => ShellRead | null;
  /** runs a confirmed plan through the normal API; resolves to the line to show, throws to show the error */
  run: (p: P) => Promise<string>;
  /** a tapped choice → the next plan */
  pick: (choiceId: string, lastRaw: string) => P | string | null;
  /** v111 — a short “what needs you today”, shown once a day when it has something to say */
  brief?: () => ShellRead | null;
  briefKey?: string;
  ready?: boolean;
}

const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

/** v110/v111 — one chat box for every role's copilot: plan → confirm card → API; a mic that fills the box; a daily brief. */
export function CopilotShell<P extends ShellPlan>(p: Props<P>) {
  const tx = useTx();
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const last = useRef('');
  const end = useRef<HTMLDivElement>(null);
  const briefed = useRef(false);
  const say = (m: Msg) => setMsgs(a => [...a.slice(-30), m]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [msgs]);

  // the daily brief — once per calendar day per device, and only when there is something in it
  useEffect(() => {
    if (!p.ready || briefed.current || !p.brief) return; briefed.current = true;
    const k = `genz.cp.brief.${p.briefKey || 'x'}`;
    try { if (localStorage.getItem(k) === today()) return; } catch { /* storage may be blocked — then it shows once per visit */ }
    const b = p.brief(); if (!b || !b.list?.length) return;
    say({ who: 'bot', text: b.text, list: b.list });
    try { localStorage.setItem(k, today()); } catch { /* optional */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.ready]);

  const show = (plan: P) => {
    const r = p.read(plan);
    if (r) return say({ who: 'bot', text: r.text, list: r.list });
    say({ who: 'bot', text: tx(plan.en, plan.hi), plan }); setConsent(false);
  };
  const submit = (v = text) => { const raw = v.trim(); if (!raw || busy) return; say({ who: 'me', text: raw }); setText(''); last.current = raw; show(p.plan(raw)); };
  const choose = (id: string, label: string) => { say({ who: 'me', text: label }); const n = p.pick(id, last.current); if (!n) return; if (typeof n === 'string') { last.current = n; show(p.plan(n)); } else show(n); };

  const confirm = async (i: number) => {
    const plan = msgs[i]?.plan as P | undefined; if (!plan || busy) return;
    if (plan.needsConsent && !consent) return;
    setBusy(true);
    try { const ok = await p.run(plan); setMsgs(a => a.map((x, j) => (j === i ? { ...x, done: true } : x))); say({ who: 'bot', text: ok }); }
    catch (e: any) { say({ who: 'bot', text: `⚠️ ${e?.message || tx('Could not do that. Please use the screen instead.', 'यह नहीं हो पाया। कृपया स्क्रीन से कीजिए।')}` }); }
    finally { setBusy(false); }
  };
  const cancel = (i: number) => { setMsgs(a => a.map((x, j) => (j === i ? { ...x, done: true } : x))); say({ who: 'bot', text: tx('Okay, cancelled.', 'ठीक है, रद्द।') }); };

  return (
    <section className="rounded-2xl border border-indigo-100 bg-white p-3 shadow-sm" aria-label={tx(p.title[0], p.title[1])} data-testid="copilot">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white"><Bot className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-900">{tx(p.title[0], p.title[1])}</p><p className="truncate text-xs text-slate-500">{tx('Tell me the work — I will ask before I do it.', 'काम बताइए — करने से पहले आपसे पूछूँगा।')}</p></div>
      </div>
      {msgs.length > 0 && (
        <div className="mb-2 max-h-72 space-y-2 overflow-y-auto" aria-live="polite">
          {msgs.map((m, i) => (
            <div key={i} className={m.who === 'me' ? 'flex justify-end' : 'flex'}>
              <div className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm ${m.who === 'me' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                {m.list && m.list.length > 0 && <ul className="mt-1 space-y-0.5 text-xs">{m.list.map((l, k) => <li key={k}>• {l}</li>)}</ul>}
                {m.plan?.choices && <div className="mt-2 flex flex-wrap gap-1.5">{m.plan.choices.map(c => <button key={c.id} type="button" onClick={() => choose(c.id, c.label)} className="min-h-9 rounded-full border border-indigo-200 bg-white px-3 text-xs font-semibold text-indigo-700">{c.label}</button>)}</div>}
                {m.plan && m.plan.kind !== 'ASK' && m.plan.kind !== 'INFO' && !m.done && (
                  <div className="mt-2 space-y-2">
                    {m.plan.needsConsent && <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4" /><span>{tx('The client agreed to be contacted.', 'क्लाइंट ने संपर्क करने की अनुमति दी है।')}</span></label>}
                    {m.plan.warn && <p className="text-xs font-semibold text-amber-700">{tx(m.plan.warn.en, m.plan.warn.hi)}</p>}
                    <div className="flex gap-2">
                      <button type="button" disabled={busy || (!!m.plan.needsConsent && !consent)} onClick={() => confirm(i)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{tx('Yes, do it', 'हाँ, करो')}</button>
                      <button type="button" disabled={busy} onClick={() => cancel(i)} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"><X className="h-4 w-4" />{tx('No', 'नहीं')}</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={end} />
        </div>
      )}
      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
        {p.chips.map(([en, label]) => <button key={en} type="button" onClick={() => (en.endsWith(' ') ? setText(en) : submit(en))} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full bg-indigo-50 px-3 text-xs font-semibold text-indigo-700"><Sparkles className="h-3 w-3" />{label}</button>)}
      </div>
      <form onSubmit={e => { e.preventDefault(); submit(); }} className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} maxLength={600} placeholder={tx(p.placeholder[0], p.placeholder[1])} aria-label={tx('Tell the copilot', 'कोपायलट को बताइए')} className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm" />
        <button type="submit" disabled={!text.trim() || busy} className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white disabled:opacity-50" aria-label={tx('Send', 'भेजें')}><Send className="h-4 w-4" /></button>
      </form>
      {/* v111 — speak the line: the words fill the box and are planned straight away; nothing runs without the ✅ card */}
      <VoiceNote label={['Speak the work', 'बोलकर काम बताइए']} onText={spoken => submit(spoken)} />
    </section>
  );
}
