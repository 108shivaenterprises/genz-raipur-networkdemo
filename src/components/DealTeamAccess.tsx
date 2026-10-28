import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';

interface Props { dealId: string; allotted: string[]; onChanged: () => void }

/** A deal broker chooses which of their own employees may work in this deal room (read + chat; commission stays hidden). */
export const DealTeamAccess: React.FC<Props> = ({ dealId, allotted, onChanged }) => {
  const hi = useI18n().lang === 'hi';
  const [team, setTeam] = useState<any[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  useEffect(() => { api.teamList().then((r) => setTeam(r.members.filter((m: any) => m.status === 'VERIFIED'))).catch(() => setTeam([])); }, []);
  useEffect(() => { setSel(allotted.filter((id) => team.some((m) => m.id === id))); }, [allotted, team]);
  if (!team.length) return null;
  const save = async () => {
    setMsg('');
    try { await api.teamAllotDeal(dealId, sel); setMsg(hi ? 'सेव हो गया' : 'Saved'); onChanged(); } catch (e: any) { setMsg(e.message); }
  };
  return (
    <details className="mt-2 text-xs">
      <summary className="inline-flex cursor-pointer items-center gap-1 font-semibold text-indigo-700"><Users className="h-3.5 w-3.5" /> {hi ? 'इस डील पर टीम' : 'Team on this deal'} ({sel.length})</summary>
      <div className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
        {team.map((m) => (
          <label key={m.id} className="flex items-center gap-2">
            <input type="checkbox" checked={sel.includes(m.id)} onChange={(e) => setSel(e.target.checked ? [...sel, m.id] : sel.filter((x) => x !== m.id))} />
            {m.name} <span className="text-slate-400">· {m.teamTitle}</span>
          </label>
        ))}
        <p className="text-xs text-slate-500">{hi ? 'वे डील और चैट पढ़ सकते हैं। कमीशन, बँटवारा या सिर्फ़-ब्रोकर चैनल उन्हें कभी नहीं दिखता।' : 'They can read the deal and chat. They never see commission, split or the brokers-only channel.'}</p>
        <button onClick={save} className="rounded bg-slate-900 px-3 py-1 font-semibold text-white">{hi ? 'सेव करें' : 'Save'}</button>
        {msg && <span className="ml-2 text-slate-600">{msg}</span>}
      </div>
    </details>
  );
};
