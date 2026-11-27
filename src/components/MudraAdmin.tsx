import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';

/** v199 (D20) — SUPERADMIN: credit %, validity, discount cap, terms and the affiliated partners (each with the % GENZ earns — the discount can never exceed it). */
export const MudraAdmin: React.FC = () => {
  const tx = useTx();
  const [c, setC] = useState<any>(null); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const [np, setNp] = useState({ name: '', category: '', feePct: '' });
  useEffect(() => { api.mudraAdmin().then(x => setC(x.config)).catch(() => setC(null)); }, []);
  if (!c) return null;
  const save = async (patch: any) => { try { const r = await api.mudraAdminSet(patch); setC(r.config); setMsg({ ok: true, text: tx('Saved', 'सेव हुआ') }); } catch (e: any) { setMsg({ ok: false, text: e.message }); } };
  const inp = 'min-h-11 rounded-lg border border-slate-300 px-2 text-sm';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm" data-testid="mudra-admin">
      <h3 className="font-bold text-slate-900">{tx('GENZ Mudra (discount voucher) — settings', 'GENZ मुद्रा (डिस्काउंट वाउचर) — सेटिंग')}</h3>
      <p className="text-xs text-slate-500">{tx('For buyers and tenants only. A voucher, not money. CA / lawyer to confirm the RBI PPI position before real redemptions.', 'सिर्फ़ खरीदार / किरायेदार के लिए। वाउचर है, पैसा नहीं। असली रिडेम्पशन से पहले CA / वकील से RBI PPI स्थिति पक्की करें।')}</p>
      <label className="mt-2 flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" className="h-5 w-5" checked={c.enabled} onChange={e => void save({ enabled: e.target.checked })} />{tx('Switched on', 'चालू')}</label>
      <div className="grid grid-cols-3 gap-2 text-xs">
        {([['pct', tx('Credit %', 'क्रेडिट %')], ['validityDays', tx('Valid days', 'वैधता दिन')], ['maxDiscountPct', tx('Max discount %', 'अधिकतम डिस्काउंट %')]] as const).map(([k, l]) => <label key={k} className="block">{l}<input className={inp + ' w-full'} inputMode="decimal" defaultValue={c[k]} onBlur={e => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== c[k]) void save({ [k]: v }); }} /></label>)}
      </div>
      <ul className="mt-2 space-y-1 text-xs">{c.partners.map((p: any) => <li key={p.id} className="flex min-h-9 items-center justify-between gap-2"><span>{p.name} · {p.category} · GENZ {p.feePct}%</span><button type="button" className="min-h-11 rounded-lg border border-slate-300 px-2 font-semibold" onClick={() => void save({ partners: c.partners.map((x: any) => x.id === p.id ? { ...x, active: !x.active } : x) })}>{p.active ? tx('Pause', 'रोकें') : tx('Resume', 'चालू करें')}</button></li>)}</ul>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <input className={inp} placeholder={tx('Partner name', 'पार्टनर का नाम')} value={np.name} onChange={e => setNp({ ...np, name: e.target.value })} aria-label={tx('Partner name', 'पार्टनर का नाम')} />
        <input className={inp} placeholder={tx('Category', 'श्रेणी')} value={np.category} onChange={e => setNp({ ...np, category: e.target.value })} aria-label={tx('Category', 'श्रेणी')} />
        <input className={inp} inputMode="decimal" placeholder={tx('GENZ fee %', 'GENZ फ़ीस %')} value={np.feePct} onChange={e => setNp({ ...np, feePct: e.target.value })} aria-label={tx('GENZ fee %', 'GENZ फ़ीस %')} />
      </div>
      <button type="button" disabled={np.name.trim().length < 2 || np.category.trim().length < 2 || !(Number(np.feePct) > 0)} className="mt-2 min-h-11 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-50" onClick={() => { void save({ partners: [...c.partners, { id: `PTR-${Date.now().toString(36)}`, name: np.name.trim(), category: np.category.trim(), feePct: Number(np.feePct), active: true }] }); setNp({ name: '', category: '', feePct: '' }); }}>{tx('Add partner', 'पार्टनर जोड़ें')}</button>
      {msg && <p className={`mt-1 text-xs ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`} role="status">{msg.text}</p>}
    </div>
  );
};
