import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { planCommand, COPILOT_HELP, type CpPlan, type CpListing } from '../shared/copilotRules.js';
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
  const load = useCallback(async () => {
    try { const [c, l] = await Promise.all([api.clients(), api.myListings()]); setClients(c.clients || []); setListings((l.listings || []).map((x: any) => ({ id: x.id, title: x.title, state: x.state }))); } catch { /* the panel still plans; it just cannot find names */ }
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

  return (
    <CopilotShell<P>
      title={['Copilot', 'कोपायलट']}
      placeholder={['e.g. Ramesh ko call kiya, kal 5 baje follow-up', 'जैसे: Ramesh ko call kiya, kal 5 baje follow-up']}
      chips={CHIPS}
      ready={ready}
      briefKey="broker"
      brief={() => { const { dueL, staleL } = lists(); const l = [...dueL, ...staleL].slice(0, 8); return l.length ? { text: tx('Good day! These need you today:', 'नमस्ते! आज इन पर ध्यान चाहिए:'), list: l } : null; }}
      plan={raw => planCommand(raw, { clients: clients.map(c => ({ id: c.id, name: c.name, stage: c.stage, followUpAt: c.followUpAt })), listings }) as P}
      read={pl => {
        if (pl.kind === 'UNKNOWN') return { text: tx(COPILOT_HELP.en, COPILOT_HELP.hi) };
        if (pl.kind !== 'SHOW_DUE' && pl.kind !== 'SHOW_BRIEF' && pl.kind !== 'SHOW_STALE') return null;
        const { dueL, staleL } = lists();
        const rows = pl.kind === 'SHOW_DUE' ? dueL : pl.kind === 'SHOW_STALE' ? staleL : [...dueL, ...staleL].slice(0, 10);
        return { text: rows.length ? tx(pl.en, pl.hi) : tx('All clear — nothing pending 🎉', 'सब ठीक है — कुछ पेंडिंग नहीं 🎉'), list: rows };
      }}
      pick={(id, lastRaw) => {
        const l = listings.find(x => x.id === id);
        if (l) return { kind: 'CONFIRM_LISTING', listingId: l.id, hi: `“${l.title}” अभी भी उपलब्ध है — कन्फर्म करूँ?`, en: `Confirm “${l.title}” is still available?` } as P;
        const c = clients.find(x => x.id === id);
        return c ? `${lastRaw} ${c.name}` : null;
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
  );
};
