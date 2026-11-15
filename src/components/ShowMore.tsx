import React, { useState } from 'react';
import { useTx } from '../lib/i18n.js';

/** v145 — a long list shows its first few items and a "Show more" button (a phone screen was up to 16,000px long).
 *  `cols` = inside a <tbody>: the button sits in a full-width table row. */
export const ShowMore: React.FC<{ step?: number; cols?: number; children: React.ReactNode }> = ({ step = 8, cols, children }) => {
  const tx = useTx(); const all = React.Children.toArray(children); const [n, setN] = useState(step);
  const left = all.length - n;
  const btn = left > 0 && (
    <button type="button" onClick={() => setN(n + step * 2)} data-testid="show-more"
      className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">
      {tx(`Show more (${left} left)`, `और दिखाएँ (${left} बाकी)`)}
    </button>
  );
  return <>{all.slice(0, n)}{btn && (cols ? <tr><td colSpan={cols} className="p-2">{btn}</td></tr> : btn)}</>;
};
