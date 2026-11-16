import React, { useEffect, useState } from 'react';
import { CheckSquare, Square, Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { PAPER_ITEMS } from '../shared/paperRules.js';

/** v156 — the deal's Paper check: a plain tick / untick list for the deal brokers. GENZ does not check or certify any paper. */
export const PaperCheck: React.FC<{ dealId: string }> = ({ dealId }) => {
  const tx = useTx();
  const [checks, setChecks] = useState<Record<string, { byName: string; at: string }> | null>(null);
  const [canTick, setCanTick] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { setChecks(null); api.paperGet(dealId).then(r => { setChecks(r.checks || {}); setCanTick(r.canTick); }).catch(e => setErr(e.message)); }, [dealId]);
  const flip = async (key: string) => {
    if (!checks || busy) return; setBusy(key); setErr('');
    try { setChecks((await api.paperSet(dealId, key, !checks[key])).checks); } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  if (!checks) return err ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{err}</p> : <Loader2 className="h-5 w-5 animate-spin text-slate-500" aria-label="Loading" />;
  const done = PAPER_ITEMS.filter(i => checks[i.key]).length;
  return (
    <div className="space-y-3" data-testid="paper-check">
      <div>
        <h3 className="text-base font-bold text-slate-900">{tx('Paper check', 'काग़ज़ों की सूची')} <span className="text-sm font-semibold text-emerald-700" data-testid="paper-count">{done}/{PAPER_ITEMS.length}</span></h3>
        <p className="text-xs text-slate-600">{tx('Your own list — tick what you have seen. GENZ does not check or certify any paper.', 'आपकी अपनी सूची — जो काग़ज़ देख लिया उस पर टिक करें। GENZ किसी काग़ज़ की जाँच या गारंटी नहीं करता।')}</p>
      </div>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {PAPER_ITEMS.map(i => {
          const c = checks[i.key]; const Icon = c ? CheckSquare : Square;
          return (
            <li key={i.key}>
              <button type="button" disabled={!canTick || busy === i.key} onClick={() => void flip(i.key)} aria-pressed={!!c} data-testid={`paper-${i.key}`}
                className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left disabled:opacity-70">
                <Icon className={`h-6 w-6 shrink-0 ${c ? 'text-emerald-600' : 'text-slate-400'}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-semibold ${c ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{tx(i.en, i.hi)}</span>
                  {c && <span className="block text-xs text-slate-500">{c.byName} · {new Date(c.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!canTick && <p className="text-xs text-slate-500">{tx('Only the two deal brokers can tick.', 'सिर्फ़ डील के दोनों ब्रोकर टिक कर सकते हैं।')}</p>}
      {err && <p className="text-sm text-red-700" role="alert">{err}</p>}
    </div>
  );
};
