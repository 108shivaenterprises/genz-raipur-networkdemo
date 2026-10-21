/** v34 — "where will this QR be scanned, and by whom": a picker for when the QR is made, and a one-line reminder on every card. */
import React from 'react';
import { ScanLine as ScanIcon } from 'lucide-react';
import { useTx, useI18n } from '../lib/i18n.js';
import { SCAN_POINTS, scanLine, defaultScanPoint, type ScanKind } from '../shared/visitRules.js';

export const ScanPointSelect: React.FC<{ kind: ScanKind; value: string; onChange: (v: string) => void; className?: string }> = ({ kind, value, onChange, className }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const who = scanLine(kind, value).who;
  return (
    <div className="space-y-1" data-testid="scanpoint">
      <label className="block text-[11px] font-bold text-slate-700">{tx('Where will this QR be scanned?', 'यह QR कहाँ स्कैन होगा?')}</label>
      <select value={value || defaultScanPoint(kind)} onChange={e => onChange(e.target.value)} className={className || 'min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'} data-testid="scanpoint-select">
        {SCAN_POINTS[kind].map(p => <option key={p.id} value={p.id}>{hi ? p.hi : p.en}</option>)}
      </select>
      <p className="text-[11px] text-slate-500">{tx(`Only there — ${who.en}. The buyer sees this on his pass.`, `सिर्फ़ वहीं — ${who.hi}। खरीदार को यह उसके पास पर दिखेगा।`)}</p>
    </div>
  );
};

export const ScanLineNote: React.FC<{ kind: ScanKind; scanAt?: string }> = ({ kind, scanAt }) => {
  const tx = useTx(); const l = scanLine(kind, scanAt);
  return <p className="flex items-start gap-1.5 text-[11px] font-semibold text-slate-700" data-testid="scan-line"><ScanIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />{tx(`Scan at: ${l.where.en} — ${l.who.en}`, `स्कैन कहाँ: ${l.where.hi} — ${l.who.hi}`)}</p>;
};
