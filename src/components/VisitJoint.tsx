import React from 'react';
import { useTx } from '../lib/i18n.js';
import { visitJoint } from '../shared/visitRules.js';

/** v159 — "Owner ✔ · Buyer ✔ → fixed": both sides of a visit in one line for the broker */
export const VisitJoint: React.FC<{ v: { ownerOk?: { answer: 'YES' | 'NO' }; ackStatus?: 'NONE' | 'PENDING' | 'ACKED'; isVerified?: boolean } }> = ({ v }) => {
  const tx = useTx();
  if (v.isVerified) return null;
  const j = visitJoint(v);
  const cls = j.state === 'PAKKA' ? 'bg-emerald-100 text-emerald-900' : j.state === 'CHANGE' ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-900';
  const mark = (s: string) => (s === 'YES' ? '✔' : s === 'NO' ? '✖' : '…');
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cls}`} data-testid="visit-joint" data-state={j.state}>
      {tx('Owner', 'मालिक')} {mark(j.owner)} · {tx('Buyer', 'खरीदार')} {mark(j.buyer)}
      {' → '}{j.state === 'PAKKA' ? tx('fixed', 'पक्की') : j.state === 'CHANGE' ? tx('owner wants another time', 'मालिक दूसरा समय चाहता है') : tx('waiting', 'इंतज़ार')}
    </span>
  );
};
