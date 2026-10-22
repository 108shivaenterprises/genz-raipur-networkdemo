import React, { useEffect, useState } from 'react';
import { Rocket } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';

/** Dashboard banner: activation progress + a shortcut to the invite loop. Hidden once everything is done. */
export const GrowthNudge: React.FC<{ onOpen: () => void; className?: string }> = ({ onOpen, className = 'mb-5' }) => {
  const tx = useTx();
  const [d, setD] = useState<any>(null);
  useEffect(() => { api.growthMe().then(setD).catch(() => setD(null)); }, []);
  if (!d || d.progress >= 100) return null;
  const next = d.checklist.find((c: any) => !c.done);
  return (
    <button onClick={onOpen} className={`${className} flex w-full items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-left hover:border-amber-400`}>
      <Rocket className="h-5 w-5 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-amber-900">{tx(`Your setup is ${d.progress}% done`, `आपका सेटअप ${d.progress}% पूरा है`)}</div>
        {next && <div className="truncate text-[11px] text-amber-800">{tx('Next: ', 'अगला: ')}{tx(next.en, next.hi)}</div>}
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-amber-100"><div className="h-full bg-amber-500" style={{ width: `${d.progress}%` }} /></div>
      </div>
      <span className="shrink-0 text-[11px] font-semibold text-amber-900">{tx('Open →', 'खोलें →')}</span>
    </button>
  );
};
