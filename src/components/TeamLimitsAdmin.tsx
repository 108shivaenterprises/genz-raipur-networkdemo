import React, { useEffect, useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { TEAM_CAP_LIMITS } from '../shared/crmSales.js';

type Data = Awaited<ReturnType<typeof api.teamLimits>>;
const KIND: Record<string, [string, string]> = { BROKER: ['Broker', 'ब्रोकर'], DEVELOPER_BUILDER: ['Builder', 'बिल्डर'], CONTRACTOR: ['Contractor', 'कॉन्ट्रैक्टर'] };

/** v76b — the superadmin sets how many team members a broker / builder / contractor may add (one figure per kind, or one figure for one person). Shown to the superadmin only: for anyone else the server says no and this renders nothing. */
export const TeamLimitsAdmin: React.FC = () => {
  const tx = useTx(); const { lang } = useI18n();
  const kind = (r: string) => (KIND[r] ? KIND[r][lang === 'hi' ? 1 : 0] : r);
  const [d, setD] = useState<Data | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [who, setWho] = useState(''); const [whoMax, setWhoMax] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const apply = (r: Data) => { setD(r); setVals(Object.fromEntries(r.roles.map(x => [x.role, String(x.cap)]))); };
  useEffect(() => { api.teamLimits().then(apply).catch(() => setD(null)); }, []);
  if (!d) return null;
  const run = async (p: Promise<any>, ok: string) => {
    setBusy(true); setMsg(null);
    try { apply(await p); setMsg({ ok: true, text: ok }); } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  const input = 'w-24 rounded border border-slate-300 px-2 py-1 text-xs';
  const overrides = d.employers.filter(e => e.override !== null);
  const picked = d.employers.find(e => e.id === who);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid="team-limits-admin">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"><Users className="h-4 w-4 text-indigo-600" /> {tx('Team size limit', 'टीम की सीमा')}</h3>
      <p className="mt-1 text-xs text-slate-600">{tx('How many team members each employer may add. Lowering a limit never removes anyone — it only stops new additions until the team is under the figure.', 'हर नियोक्ता कितने टीम सदस्य जोड़ सकता है। सीमा घटाने पर किसी को हटाया नहीं जाता — बस नए जोड़ना तब तक रुकता है जब तक टीम सीमा के नीचे न आ जाए।')}</p>
      {d.roles.map(x => (
        <div key={x.role} className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-700">
          <span>{kind(x.role)}{x.custom === null && <span className="ml-1 text-[10px] text-slate-400">({tx('built-in', 'पहले से तय')})</span>}</span>
          <span className="flex items-center gap-1.5">
            <input type="number" min={TEAM_CAP_LIMITS[0]} max={TEAM_CAP_LIMITS[1]} value={vals[x.role] ?? ''} onChange={e => setVals({ ...vals, [x.role]: e.target.value })} className={input} data-testid={`team-limit-${x.role}`} aria-label={kind(x.role)} />
            <button disabled={busy} onClick={() => run(api.teamLimitRole(x.role, Number(vals[x.role])), tx('Saved. New additions follow this figure.', 'सेव हुआ। नए जोड़ना इसी सीमा से चलेगा।'))} className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50" data-testid={`team-limit-save-${x.role}`}>{tx('Save', 'सेव')}</button>
            {x.custom !== null && <button disabled={busy} onClick={() => run(api.teamLimitRole(x.role, null), tx('Back to the built-in figure.', 'पहले वाली सीमा पर लौट आए।'))} className="text-[11px] text-slate-500 underline disabled:opacity-50">{tx('Reset', 'रीसेट')}</button>}
          </span>
        </div>))}
      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="text-xs font-semibold text-slate-800">{tx('One person only', 'सिर्फ़ एक व्यक्ति के लिए')}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={who} onChange={e => { setWho(e.target.value); const e1 = d.employers.find(x => x.id === e.target.value); setWhoMax(e1 ? String(e1.cap) : ''); }} className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs" aria-label={tx('Choose a broker, builder or contractor', 'ब्रोकर, बिल्डर या कॉन्ट्रैक्टर चुनें')} data-testid="team-limit-who">
            <option value="">{tx('Choose…', 'चुनें…')}</option>
            {d.employers.map(e => <option key={e.id} value={e.id}>{e.name} · {kind(e.role)} · {e.used}/{e.cap}</option>)}
          </select>
          <input type="number" min={TEAM_CAP_LIMITS[0]} max={TEAM_CAP_LIMITS[1]} value={whoMax} onChange={e => setWhoMax(e.target.value)} className={input} aria-label={tx('His limit', 'उसकी सीमा')} data-testid="team-limit-who-max" />
          <button disabled={busy || !picked || !whoMax} onClick={() => run(api.teamLimitUser(who, Number(whoMax)), tx('Saved for this person.', 'इस व्यक्ति के लिए सेव हुआ।'))} className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50" data-testid="team-limit-who-save">{tx('Set', 'लगाएँ')}</button>
        </div>
        {overrides.length > 0 && <ul className="mt-2 divide-y divide-slate-100 text-xs text-slate-700">{overrides.map(e => (
          <li key={e.id} className="flex items-center justify-between gap-2 py-1.5"><span className="min-w-0 truncate">{e.name} · {e.used}/{e.override}</span>
            <button disabled={busy} onClick={() => run(api.teamLimitUser(e.id, null), tx('Back to his kind’s figure.', 'उसके प्रकार की सीमा पर लौट आए।'))} className="text-[11px] text-slate-500 underline disabled:opacity-50">{tx('Reset', 'रीसेट')}</button></li>))}</ul>}
      </div>
      {busy && <Loader2 className="mt-2 h-4 w-4 animate-spin text-slate-400" />}
      {msg && <p className={`mt-2 text-xs ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.text}</p>}
    </div>
  );
};
