import React, { useEffect, useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { DATE_KEYS, DATE_WORDS, REGISTRY_CARRY, daysTo, whenWords, type KeyDates as Dates } from '../shared/keyDates.js';

/** v158 — the four dates of the deal (token, agreement, registry, possession): the brokers set them, a line says "registry in 12 days", and the registry day brings its carry-list. */
export const KeyDates: React.FC<{ dealId: string }> = ({ dealId }) => {
  const tx = useTx();
  const [dates, setDates] = useState<Dates | null>(null);
  const [canSet, setCanSet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { setDates(null); api.keyDatesGet(dealId).then(r => { setDates(r.dates || {}); setCanSet(r.canSet); }).catch(e => setErr(e.message)); }, [dealId]);
  const save = async (body: Record<string, string | boolean | null>) => {
    setBusy(true); setErr('');
    try { setDates((await api.keyDatesSet(dealId, body)).dates); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  if (!dates) return err ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{err}</p> : <Loader2 className="h-5 w-5 animate-spin text-slate-500" aria-label="Loading" />;
  const reg = dates.registry; const regDays = reg ? daysTo(reg) : null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3" data-testid="key-dates">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><CalendarClock className="h-4 w-4 text-indigo-600" aria-hidden />{tx('Deal dates', 'डील की तारीख़ें')}</h3>
      {reg && <p className={`mt-1 rounded-lg px-2 py-1 text-sm font-bold ${regDays! >= 0 && regDays! <= 3 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-800'}`} data-testid="registry-line">{tx(`Registry ${whenWords(reg).en}`, `रजिस्ट्री ${whenWords(reg).hi}`)}</p>}
      <ul className="mt-2 space-y-2">
        {DATE_KEYS.map(k => (
          <li key={k} className="flex items-center gap-2">
            <label className="w-32 shrink-0 text-xs font-semibold text-slate-700" htmlFor={`kd-${k}`}>{tx(DATE_WORDS[k].en, DATE_WORDS[k].hi)}</label>
            <input id={`kd-${k}`} type="date" disabled={!canSet || busy} value={dates[k] || ''} onChange={e => void save({ [k]: e.target.value || null })}
              className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 disabled:bg-slate-50" data-testid={`kd-${k}`} />
          </li>
        ))}
      </ul>
      {!canSet && <p className="mt-1 text-xs text-slate-500">{tx('Only the two deal brokers can set the dates.', 'सिर्फ़ डील के दोनों ब्रोकर तारीख़ें भर सकते हैं।')}</p>}
      {reg && regDays! >= -1 && regDays! <= 7 && (
        <details className="mt-2 rounded-lg bg-slate-50 p-2" open data-testid="registry-carry">
          <summary className="cursor-pointer text-xs font-bold text-slate-800">{tx('What to take on registry day', 'रजिस्ट्री के दिन क्या ले जाना है')}</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-700">{REGISTRY_CARRY.map(c => <li key={c.en}>{tx(c.en, c.hi)}</li>)}</ul>
          <p className="mt-1 text-[11px] text-slate-500">{tx('A general list, not legal advice — your sub-registrar office may ask a little different.', 'यह आम सूची है, क़ानूनी सलाह नहीं — आपका सब-रजिस्ट्रार दफ़्तर थोड़ा अलग माँग सकता है।')}</p>
        </details>
      )}
      {reg && regDays! < 0 && canSet && (
        <label className="mt-2 flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-900">
          <input type="checkbox" className="h-5 w-5" checked={!!dates.mutationDone} disabled={busy} onChange={e => void save({ mutationDone: e.target.checked })} data-testid="kd-mutation" />
          {tx('Record updated in buyer’s name (dakhil-kharij)', 'रिकॉर्ड खरीदार के नाम चढ़ गया (दाख़िल-ख़ारिज)')}
        </label>
      )}
      {err && <p className="mt-1 text-sm text-red-700" role="alert">{err}</p>}
    </div>
  );
};
