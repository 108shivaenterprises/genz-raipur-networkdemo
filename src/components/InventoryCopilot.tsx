import React from 'react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { planInventory, summaryText, unitLine, INV_HELP, type InvPlan, type CpUnit } from '../shared/invCopilot.js';
import { CopilotShell, type ShellPlan } from './CopilotShell.js';

type P = InvPlan & ShellPlan;

/** v111 — Copilot above the unit grid. The builder can set a rate or reserve / free a unit (same call as the grid's edit sheet); partners can only ask. */
export const InventoryCopilot: React.FC<{ units: any[]; canManage: boolean; seesPrice: boolean; onChanged: () => void }> = ({ units, canManage, seesPrice, onChanged }) => {
  const tx = useTx();
  const cu: CpUnit[] = units.map(u => ({ id: u.id, label: u.label, code: u.code, status: u.status, price: seesPrice ? u.price : null, config: u.config, group: u.group }));
  const byId = (id?: string) => cu.find(u => u.id === id);
  const chips: [string, string][] = canManage
    ? [['kitne flat bache hain', 'कितने बचे हैं'], ['A-101 ka rate ', 'रेट बदलें'], ['A-101 reserve karo', 'रिज़र्व करें']]
    : [['kitne flat bache hain', 'कितने बचे हैं'], ['A-101 ka status', 'यूनिट का स्टेटस']];
  return (
    <CopilotShell<P>
      title={['Inventory Copilot', 'इन्वेंटरी कोपायलट']}
      placeholder={['e.g. A-101 ka rate 85 lakh karo', 'जैसे: A-101 ka rate 85 lakh karo']}
      chips={chips}
      ready={units.length > 0}
      briefKey={canManage ? 'builder' : 'partner'}
      brief={() => {
        const hold = cu.filter(u => u.status === 'HOLD'); const left = cu.filter(u => u.status === 'AVAILABLE').length;
        return hold.length || left ? { text: tx(`${left} available · ${hold.length} on hold right now.`, `अभी ${left} उपलब्ध · ${hold.length} होल्ड पर।`), list: hold.slice(0, 6).map(u => unitLine(u, false)) } : null;
      }}
      plan={raw => planInventory(raw, { units: cu, canManage }) as P}
      read={pl => {
        if (pl.kind === 'UNKNOWN') return { text: tx(INV_HELP.en, INV_HELP.hi) };
        if (pl.kind === 'INFO') return { text: tx(pl.en, pl.hi) };
        if (pl.kind === 'SHOW_SUMMARY') return { text: summaryText(cu) };
        if (pl.kind === 'SHOW_UNIT') { const u = byId((pl as any).unitId); return u ? { text: unitLine(u, seesPrice) } : null; }
        return null;
      }}
      pick={(id, lastRaw) => { const u = byId(id); return u ? `${lastRaw} ${u.label}` : null; }}
      run={async pl => {
        if (pl.kind === 'PRICE') { const p = pl as any; await api.invUnit(p.unitId, { price: p.price, reason: 'Copilot' }); onChanged(); return tx(`Rate set ✅ ${byId(p.unitId)?.label || ''}`, `रेट बदल गया ✅ ${byId(p.unitId)?.label || ''}`); }
        if (pl.kind === 'STATUS') { const p = pl as any; await api.invUnit(p.unitId, { status: p.status }); onChanged(); return tx(`Done ✅ ${byId(p.unitId)?.label || ''} → ${p.status.toLowerCase()}`, `हो गया ✅ ${byId(p.unitId)?.label || ''}`); }
        return '';
      }}
    />
  );
};
