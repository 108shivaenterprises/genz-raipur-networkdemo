import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { planCommand, showClientPlan, type CpPlan, type CpListing } from '../shared/copilotRules.js';
import { CopilotShell, type ShellPlan } from './CopilotShell.js';

type P = CpPlan & ShellPlan;
const DAY = 86_400_000;
const CHIPS: [string, string][] = [['aaj ka kaam', 'आज का काम'], ['kiska follow-up pending hai', 'किसका फॉलो-अप पेंडिंग'], ['thanda leads dikhao', 'ठंडे लीड्स'], ['naya client ', 'नया क्लाइंट']];

/** v110 — Broker Copilot (Today tab): one line → plan → ✅ → the normal client API. v111 — daily brief + mic through the shell. */
export const CopilotPanel: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const tx = useTx();
  const [clients, setClients] = useState<any[]>([]);
  const [listings, setListings] = useState<CpListing[]>([]);
  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const load = useCallback(async () => {
    setLoadErr(false);
    try { const [c, l] = await Promise.all([api.clients(), api.myListings()]); setClients(c.clients || []); setListings((l.listings || []).map((x: any) => ({ id: x.id, title: x.title, state: x.state }))); } catch { setLoadErr(true); }   // shown with a Retry — never a silent “not found”
    setReady(true);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const nameOf = (id: string) => clients.find(c => c.id === id)?.name || '';

  const lists = () => {
    const now = Date.now(); const live = clients.filter(c => c.stage !== 'DEAL' && c.stage !== 'LOST');
    const due = live.filter(c => c.followUpAt && new Date(c.followUpAt).getTime() <= now);
    const stale = live.filter(c => !due.includes(c) && now - new Date(c.lastContactAt || c.updatedAt || c.createdAt || now).getTime() > 7 * DAY);
    const line = (c: any, d: boolean) => `${c.name} · ${c.stage}${d ? tx(' · follow-up due', ' · फॉलो-अप बाकी') : ''}`;
    return { due, stale, dueL: due.slice(0, 10).map(c => line(c, true)), staleL: stale.slice(0, 10).map(c => line(c, false)) };
  };

  const date = (s?: string) => s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
  const money = (n: number) => n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(1)} L` : `₹${n}`;
  /** short read-only card from the client already loaded (own clients only; no server call) */
  const clientCard = (c: any, topic?: string) => {
    const bud = c.budgetMax ? `${c.budgetMin ? money(c.budgetMin) + ' – ' : '≤ '}${money(c.budgetMax)}` : tx('not set', 'तय नहीं');
    const fu = c.followUpAt ? date(c.followUpAt) + (new Date(c.followUpAt).getTime() <= Date.now() ? tx(' (due)', ' (बाकी)') : '') : tx('none', 'कोई नहीं');
    const first = topic === 'budget' ? tx(`${c.name}'s budget: ${bud}`, `${c.name} का बजट: ${bud}`) : topic === 'follow' || topic === 'next' ? tx(`${c.name}'s next follow-up: ${fu}`, `${c.name} का अगला फॉलो-अप: ${fu}`) : topic === 'status' ? tx(`${c.name} is at: ${c.stage}`, `${c.name} अभी: ${c.stage}`) : tx(`${c.name} · ${c.stage}${c.lead?.label ? ' · ' + c.lead.label : ''}`, `${c.name} · ${c.stage}${c.lead?.label ? ' · ' + c.lead.label : ''}`);
    const tl = ((c.timeline || []) as { at: string; text: string }[]).slice(-3).reverse().map(e => `${date(e.at)} — ${e.text}`);
    const list = [
      `${tx('Stage', 'स्टेज')}: ${c.stage}`, `${tx('Budget', 'बजट')}: ${bud}`,
      `${tx('Looking for', 'ढूँढ रहे')}: ${[c.propertyType, (c.areas || []).join(', ')].filter(Boolean).join(' · ') || '—'}`,
      `${tx('Next follow-up', 'अगला फॉलो-अप')}: ${fu}`, `${tx('Last contact', 'आख़िरी संपर्क')}: ${date(c.lastContactAt) || '—'}`,
      ...tl.map(x => `• ${x}`),
    ];
    return { text: first, list };
  };

  return (<>
    {loadErr && <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900" role="alert" data-testid="copilot-load-error"><span>{tx('Could not load your clients — names cannot be found right now.', 'आपके क्लाइंट लोड नहीं हुए — अभी नाम नहीं मिलेंगे।')}</span><button type="button" onClick={() => void load()} className="min-h-11 shrink-0 rounded-lg bg-amber-700 px-3 font-semibold text-white" data-testid="copilot-load-retry">{tx('Retry', 'फिर कोशिश करें')}</button></div>}
    <CopilotShell<P>
      title={['Copilot', 'कोपायलट']}
      placeholder={['e.g. Ramesh ko call kiya, kal 5 baje follow-up', 'जैसे: Ramesh ko call kiya, kal 5 baje follow-up']}
      chips={CHIPS}
      ready={ready}
      briefKey="broker"
      brief={() => { const { dueL, staleL } = lists(); const l = [...dueL, ...staleL].slice(0, 8); return l.length ? { text: tx('Good day! These need you today:', 'नमस्ते! आज इन पर ध्यान चाहिए:'), list: l } : null; }}
      plan={raw => loadErr && !clients.length ? ({ kind: 'INFO', en: 'Could not load your clients — tap Retry above, then ask again.', hi: 'क्लाइंट लोड नहीं हुए — ऊपर “फिर कोशिश करें” दबाकर दोबारा पूछें।' } as P) : planCommand(raw, { clients: clients.map(c => ({ id: c.id, name: c.name, stage: c.stage, followUpAt: c.followUpAt })), listings }) as P}
      read={pl => {
        if (pl.kind === 'UNKNOWN') return { text: tx(pl.en, pl.hi) };
        if (pl.kind === 'SHOW_CLIENT') { const c = clients.find(x => x.id === (pl as any).clientId); return c ? clientCard(c, (pl as any).topic) : { text: tx('Client not found — Retry or reload.', 'क्लाइंट नहीं मिला — दोबारा खोलें।') }; }
        if (pl.kind !== 'SHOW_DUE' && pl.kind !== 'SHOW_BRIEF' && pl.kind !== 'SHOW_STALE') return null;
        const { dueL, staleL } = lists();
        const rows = pl.kind === 'SHOW_DUE' ? dueL : pl.kind === 'SHOW_STALE' ? staleL : [...dueL, ...staleL].slice(0, 10);
        return { text: rows.length ? tx(pl.en, pl.hi) : tx('All clear — nothing pending 🎉', 'सब ठीक है — कुछ पेंडिंग नहीं 🎉'), list: rows };
      }}
      pick={(id, lastRaw) => {
        const l = listings.find(x => x.id === id);
        if (l) return { kind: 'CONFIRM_LISTING', listingId: l.id, hi: `“${l.title}” अभी भी उपलब्ध है — कन्फर्म करूँ?`, en: `Confirm “${l.title}” is still available?` } as P;
        const c = clients.find(x => x.id === id);
        if (!c) return null;
        const again = planCommand(`${lastRaw} ${c.name}`, { clients: clients.map(x => ({ id: x.id, name: x.name, stage: x.stage, followUpAt: x.followUpAt })), listings });
        // a chip / mic / ask-reply with no action of its own: just show the client
        return again.kind === 'UNKNOWN' || again.kind === 'INFO' ? showClientPlan(c) as P : `${lastRaw} ${c.name}`;
      }}
      run={async pl => {
        let ok = '';
        if (pl.kind === 'ADD_CLIENT') { const r = await api.clientAdd({ ...(pl as any).body, consent: true }); ok = r.duplicate ? tx('Already in your list.', 'यह पहले से आपकी लिस्ट में है।') : tx('Client added ✅', 'क्लाइंट जुड़ गया ✅'); }
        else if (pl.kind === 'STAGE') { const s = pl as any; await api.clientStage(s.clientId, { stage: s.stage, lostReason: s.lostReason, followUpAt: s.followUpAt }); ok = tx(`Done ✅ ${nameOf(s.clientId)} → ${s.stage}`, `हो गया ✅ ${nameOf(s.clientId)} → ${s.stage}`); }
        else if (pl.kind === 'NOTE') { const n = pl as any; await api.clientNote(n.clientId, { text: n.text, kind: n.noteKind, followUpAt: n.followUpAt }); ok = tx('Saved ✅', 'सेव हो गया ✅'); }
        else if (pl.kind === 'CONFIRM_LISTING') { await api.confirmListing((pl as any).listingId); ok = tx('Listing confirmed ✅', 'लिस्टिंग कन्फर्म ✅'); }
        await load(); onChanged?.();
        return ok;
      }}
    />
  </>);
};
