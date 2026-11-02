import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Send, Check, X, Loader2, Sparkles } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { planCommand, COPILOT_HELP, type CpPlan, type CpClient, type CpListing } from '../shared/copilotRules.js';

type Msg = { who: 'me' | 'bot'; text: string; plan?: CpPlan; done?: boolean; list?: { id: string; line: string }[] };
const CHIPS: [string, string][] = [['aaj ka kaam', 'आज का काम'], ['kiska follow-up pending hai', 'किसका फॉलो-अप पेंडिंग'], ['thanda leads dikhao', 'ठंडे लीड्स'], ['naya client ', 'नया क्लाइंट']];
const DAY = 86_400_000;

/** v110 — Broker Copilot. Types a line → gets a plan → taps ✅ → the normal client API runs it (same permissions and audit as the screens). */
export const CopilotPanel: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const tx = useTx();
  const [clients, setClients] = useState<any[]>([]);
  const [listings, setListings] = useState<CpListing[]>([]);
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const last = useRef('');
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try { const [c, l] = await Promise.all([api.clients(), api.myListings()]); setClients(c.clients || []); setListings((l.listings || []).map((x: any) => ({ id: x.id, title: x.title, state: x.state }))); } catch { /* the panel still plans; it just cannot find names */ }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [msgs]);

  const cp = (): CpClient[] => clients.map(c => ({ id: c.id, name: c.name, stage: c.stage, followUpAt: c.followUpAt }));
  const say = (m: Msg) => setMsgs(a => [...a.slice(-30), m]);
  const nameOf = (id: string) => clients.find(c => c.id === id)?.name || '';

  const show = (kind: 'SHOW_DUE' | 'SHOW_BRIEF' | 'SHOW_STALE', head: string) => {
    const now = Date.now(); const live = clients.filter(c => c.stage !== 'DEAL' && c.stage !== 'LOST');
    const due = live.filter(c => c.followUpAt && new Date(c.followUpAt).getTime() <= now);
    const stale = live.filter(c => now - new Date(c.lastContactAt || c.updatedAt || c.createdAt || now).getTime() > 7 * DAY);
    const rows = (kind === 'SHOW_DUE' ? due : kind === 'SHOW_STALE' ? stale : [...due, ...stale.filter(s => !due.includes(s))]).slice(0, 10);
    const lines = rows.map(c => ({ id: c.id, line: `${c.name} · ${c.stage}${c.followUpAt && new Date(c.followUpAt).getTime() <= now ? tx(' · follow-up due', ' · फॉलो-अप बाकी') : ''}` }));
    say({ who: 'bot', text: lines.length ? head : tx('All clear — nothing pending 🎉', 'सब ठीक है — कुछ पेंडिंग नहीं 🎉'), list: lines });
  };

  const run = (raw: string, forcePlan?: CpPlan) => {
    const plan = forcePlan || planCommand(raw, { clients: cp(), listings });
    last.current = raw;
    if (plan.kind === 'SHOW_DUE' || plan.kind === 'SHOW_BRIEF' || plan.kind === 'SHOW_STALE') return show(plan.kind, tx(plan.en, plan.hi));
    if (plan.kind === 'UNKNOWN') return say({ who: 'bot', text: tx(COPILOT_HELP.en, COPILOT_HELP.hi) });
    say({ who: 'bot', text: tx(plan.en, plan.hi), plan });
    setConsent(false);
  };

  const submit = (v = text) => { const raw = v.trim(); if (!raw || busy) return; say({ who: 'me', text: raw }); setText(''); run(raw); };

  const pick = (id: string, label: string) => {
    say({ who: 'me', text: label });
    const l = listings.find(x => x.id === id);
    if (l) return run(last.current, { kind: 'CONFIRM_LISTING', listingId: l.id, hi: `“${l.title}” अभी भी उपलब्ध है — कन्फर्म करूँ?`, en: `Confirm “${l.title}” is still available?` });
    const c = clients.find(x => x.id === id);
    if (c) run(`${last.current} ${c.name}`);
  };

  const confirm = async (i: number) => {
    const m = msgs[i]; const plan = m.plan; if (!plan || busy) return;
    if (plan.kind === 'ADD_CLIENT' && !consent) return;
    setBusy(true);
    try {
      let ok = '';
      if (plan.kind === 'ADD_CLIENT') { const r = await api.clientAdd({ ...plan.body, consent: true }); ok = r.duplicate ? tx('Already in your list.', 'यह पहले से आपकी लिस्ट में है।') : tx('Client added ✅', 'क्लाइंट जुड़ गया ✅'); }
      else if (plan.kind === 'STAGE') { await api.clientStage(plan.clientId, { stage: plan.stage, lostReason: plan.lostReason, followUpAt: plan.followUpAt }); ok = tx(`Done ✅ ${nameOf(plan.clientId)} → ${plan.stage}`, `हो गया ✅ ${nameOf(plan.clientId)} → ${plan.stage}`); }
      else if (plan.kind === 'NOTE') { await api.clientNote(plan.clientId, { text: plan.text, kind: plan.noteKind, followUpAt: plan.followUpAt }); ok = tx('Saved ✅', 'सेव हो गया ✅'); }
      else if (plan.kind === 'CONFIRM_LISTING') { await api.confirmListing(plan.listingId); ok = tx('Listing confirmed ✅', 'लिस्टिंग कन्फर्म ✅'); }
      setMsgs(a => a.map((x, j) => (j === i ? { ...x, done: true } : x)));
      say({ who: 'bot', text: ok });
      await load(); onChanged?.();
    } catch (e: any) {
      say({ who: 'bot', text: `⚠️ ${e?.message || tx('Could not do that. Please try from the Clients tab.', 'यह नहीं हो पाया। Clients टैब से कोशिश करें।')}` });
    } finally { setBusy(false); }
  };

  const cancel = (i: number) => { setMsgs(a => a.map((x, j) => (j === i ? { ...x, done: true } : x))); say({ who: 'bot', text: tx('Okay, cancelled.', 'ठीक है, रद्द।') }); };

  return (
    <section className="rounded-2xl border border-indigo-100 bg-white p-3 shadow-sm" aria-label={tx('Broker Copilot', 'ब्रोकर कोपायलट')} data-testid="copilot">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white"><Bot className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-900">{tx('Copilot', 'कोपायलट')}</p><p className="truncate text-xs text-slate-500">{tx('Tell me the work — I will ask before I do it.', 'काम बताइए — करने से पहले आपसे पूछूँगा।')}</p></div>
      </div>
      {msgs.length > 0 && (
        <div className="mb-2 max-h-72 space-y-2 overflow-y-auto" aria-live="polite">
          {msgs.map((m, i) => (
            <div key={i} className={m.who === 'me' ? 'flex justify-end' : 'flex'}>
              <div className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm ${m.who === 'me' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                {m.list && m.list.length > 0 && <ul className="mt-1 space-y-0.5 text-xs">{m.list.map(l => <li key={l.id}>• {l.line}</li>)}</ul>}
                {m.plan?.kind === 'ASK' && m.plan.choices && <div className="mt-2 flex flex-wrap gap-1.5">{m.plan.choices.map(c => <button key={c.id} type="button" onClick={() => pick(c.id, c.label)} className="min-h-9 rounded-full border border-indigo-200 bg-white px-3 text-xs font-semibold text-indigo-700">{c.label}</button>)}</div>}
                {m.plan && m.plan.kind !== 'ASK' && !m.done && (
                  <div className="mt-2 space-y-2">
                    {m.plan.kind === 'ADD_CLIENT' && <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4" /><span>{tx('The client agreed to be contacted.', 'क्लाइंट ने संपर्क करने की अनुमति दी है।')}</span></label>}
                    {m.plan.kind === 'STAGE' && m.plan.money && <p className="text-xs font-semibold text-amber-700">{tx('Deal close changes your numbers — be sure.', 'डील बंद करने से आपके आँकड़े बदलते हैं — पक्का करें।')}</p>}
                    <div className="flex gap-2">
                      <button type="button" disabled={busy || (m.plan.kind === 'ADD_CLIENT' && !consent)} onClick={() => confirm(i)} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{tx('Yes, do it', 'हाँ, करो')}</button>
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
        {CHIPS.map(([en, hi]) => <button key={en} type="button" onClick={() => (en.endsWith(' ') ? setText(en) : submit(en))} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full bg-indigo-50 px-3 text-xs font-semibold text-indigo-700"><Sparkles className="h-3 w-3" />{tx(en.trim(), hi)}</button>)}
      </div>
      <form onSubmit={e => { e.preventDefault(); submit(); }} className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)} maxLength={600} placeholder={tx('e.g. Ramesh ko call kiya, kal 5 baje follow-up', 'जैसे: Ramesh ko call kiya, kal 5 baje follow-up')} aria-label={tx('Tell the copilot', 'कोपायलट को बताइए')} className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm" />
        <button type="submit" disabled={!text.trim() || busy} className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white disabled:opacity-50" aria-label={tx('Send', 'भेजें')}><Send className="h-4 w-4" /></button>
      </form>
    </section>
  );
};
