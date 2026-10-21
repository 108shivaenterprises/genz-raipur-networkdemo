import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Gift, Save, Target } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { slabLabel, type BonusScheme, type BonusSlab } from '../shared/bonus.js';

const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const blank = (): BonusScheme => ({ enabled: true, qualifyCollectionPct: 10, slabs: [] });

interface Props { role: string; canPay: boolean }

/** Volume-bonus: builders define slabs & pay; associates see the ladder and their own progress. */
export const BonusPanel: React.FC<Props> = ({ role, canPay }) => {
  const tx = useTx();
  const hi = useI18n().lang === 'hi';
  const sl = (x: BonusSlab) => slabLabel(x, hi);
  const [data, setData] = useState<{ projects: any[]; canManage: boolean } | null>(null);
  const [draft, setDraft] = useState<Record<string, BonusScheme>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [payRef, setPayRef] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.crmBonus();
      setData(r);
      setDraft(Object.fromEntries(r.projects.map((p: any) => [p.projectId, p.scheme || blank()])));
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); await load(); } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  };
  const patch = (pid: string, fn: (s: BonusScheme) => BonusScheme) => setDraft((d) => ({ ...d, [pid]: fn(d[pid] || blank()) }));

  if (!data) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  const manage = data.canManage;
  if (!data.projects.length) return <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">{manage ? tx('Launch a project first to set a volume bonus.', 'वॉल्यूम बोनस लगाने से पहले एक प्रोजेक्ट लॉन्च करें।') : tx('No volume bonus is offered on your projects right now.', 'अभी आपके प्रोजेक्ट पर कोई वॉल्यूम बोनस नहीं है।')}</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <Gift className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {hi ? <>वॉल्यूम बोनस बेस कमीशन के <b>ऊपर अतिरिक्त</b> है। एक स्तर में स्लैब जुड़ते नहीं — जो सबसे ऊँचा स्लैब पूरा हुआ वही लागू होता है। यूनिट तभी गिनी जाती है जब बुकिंग मंज़ूर हो <b>और</b> न्यूनतम कलेक्शन % मिल चुका हो; रद्द बुकिंग अपने-आप हट जाती हैं।</> : <>Volume bonus is <b>extra</b> to the base commission. Slabs are not stacked inside a level — the highest slab reached applies. A unit counts only after its booking is approved <b>and</b> the minimum collection % is received; cancelled bookings drop out automatically.</>}
        </span>
      </div>
      {msg && <div className={`rounded-lg px-3 py-2 text-xs font-medium ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

      {data.projects.map((p) => {
        const s = draft[p.projectId] || blank();
        return (
          <section key={p.projectId} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">{p.projectName} <span className="font-normal text-slate-400">· {p.projectId}</span></h3>
              <span className="text-xs text-slate-500">{tx('Units counted on project', 'प्रोजेक्ट पर गिनी गई यूनिट')}: <b className="text-slate-900">{p.projectUnits}</b></span>
            </div>

            {/* ladder (everyone) */}
            {p.scheme?.enabled && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {tx('Ladder', 'सीढ़ी')}{p.scheme.windowFrom ? ` · ${p.scheme.windowFrom} → ${p.scheme.windowTo || tx('open', 'खुला')}` : ''} · {tx(`counts at ${p.scheme.qualifyCollectionPct}% collection`, `${p.scheme.qualifyCollectionPct}% कलेक्शन पर गिनी जाती है`)}
                </p>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {p.scheme.slabs.map((x: BonusSlab) => <li key={x.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-700">{sl(x)}</li>)}
                </ul>
                {p.scheme.note && <p className="mt-1 text-[11px] italic text-slate-500">{p.scheme.note}</p>}
                {p.nextProject && <p className="mt-1 flex items-center gap-1 text-[11px] text-indigo-700"><Target className="h-3 w-3" /> {tx(`${p.nextProject.unitsToGo} more unit(s) across the project unlock:`, `प्रोजेक्ट में ${p.nextProject.unitsToGo} यूनिट और होने पर खुलेगा:`)} {sl(p.nextProject.slab)}</p>}
              </div>
            )}

            {/* progress / payouts */}
            {p.scheme?.enabled && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-[11px] uppercase text-slate-500">
                    <tr><th className="py-1.5 pr-3">{role === 'BROKER' ? tx('Your progress', 'आपकी प्रगति') : tx('Associate', 'एसोसिएट')}</th><th>{tx('Units', 'यूनिट')}</th><th>{tx('Sales', 'बिक्री')}</th><th>{tx('Bonus earned', 'कमाया बोनस')}</th><th>{tx('Paid', 'चुकाया')}</th><th>{tx('Payable', 'देय')}</th><th>{tx('Next slab', 'अगला स्लैब')}</th>{canPay && <th />}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {p.rows.map((r: any) => (
                      <tr key={r.mandateId} className="align-top">
                        <td className="py-1.5 pr-3 font-medium text-slate-800">{r.brokerName || tx('You', 'आप')}</td>
                        <td>{r.units}</td>
                        <td>{inr(r.salesValue)}</td>
                        <td className="font-semibold text-emerald-800">{inr(r.earned)}</td>
                        <td>{inr(r.paid)}{r.overpaid > 0 && <span className="ml-1 text-red-600" title={tx('Earned dropped (e.g. a cancelled booking) after payout — adjust in next payout', 'पेआउट के बाद कमाई घटी (जैसे बुकिंग रद्द) — अगले पेआउट में समायोजित करें')}>{tx('(over-paid', '(ज़्यादा चुकाया')} {inr(r.overpaid)})</span>}</td>
                        <td className="font-semibold">{inr(r.payable)}</td>
                        <td className="text-[11px] text-slate-500">{r.nextIndividual ? tx(`${r.nextIndividual.unitsToGo} more → ${slabLabel(r.nextIndividual.slab)}`, `${r.nextIndividual.unitsToGo} और → ${sl(r.nextIndividual.slab)}`) : r.individualSlab ? tx('Top slab reached 🎉', 'सबसे ऊँचा स्लैब मिल गया 🎉') : '—'}</td>
                        {canPay && (
                          <td className="whitespace-nowrap">
                            {r.payable > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <input value={payRef[r.mandateId] || ''} onChange={(e) => setPayRef({ ...payRef, [r.mandateId]: e.target.value })} placeholder={tx('UTR / ref', 'UTR / रेफ़')} className="w-24 rounded border border-slate-300 px-1.5 py-1 text-[11px]" />
                                <button disabled={busy === r.mandateId} onClick={() => act(r.mandateId, () => api.crmPayBonus(p.projectId, { mandateId: r.mandateId, amount: r.payable, reference: payRef[r.mandateId] || '' }), tx('Bonus marked as paid', 'बोनस चुकाया दर्ज हुआ'))} className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50">{tx('Pay', 'चुकाएँ')} {inr(r.payable)}</button>
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                    {!p.rows.length && <tr><td colSpan={8} className="py-3 text-slate-400">{tx('No associates yet.', 'अभी कोई एसोसिएट नहीं।')}</td></tr>}
                  </tbody>
                </table>
                <p className="mt-1 text-[10px] text-slate-400">{tx("TDS (5% default) is shown at payout; deduct and deposit it per your CA's advice.", 'पेआउट पर TDS (डिफ़ॉल्ट 5%) दिखता है; अपने CA की सलाह से काटें और जमा करें।')}</p>
              </div>
            )}

            {/* editor (builder / superadmin) */}
            {manage && (
              <details className="mt-4 rounded-lg border border-slate-200 p-3" open={!p.scheme}>
                <summary className="cursor-pointer text-xs font-semibold text-slate-800">{p.scheme ? tx('Edit bonus scheme', 'बोनस स्कीम बदलें') : tx('Set up a volume bonus', 'वॉल्यूम बोनस लगाएँ')}</summary>
                <div className="mt-3 space-y-3 text-xs">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={s.enabled} onChange={(e) => patch(p.projectId, (x) => ({ ...x, enabled: e.target.checked }))} /> {tx('Scheme is active', 'स्कीम चालू है')}</label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label>{tx('From', 'से')}<input type="date" value={s.windowFrom || ''} onChange={(e) => patch(p.projectId, (x) => ({ ...x, windowFrom: e.target.value || undefined }))} className="mt-1 w-full rounded border border-slate-300 p-1.5" /></label>
                    <label>{tx('To', 'तक')}<input type="date" value={s.windowTo || ''} onChange={(e) => patch(p.projectId, (x) => ({ ...x, windowTo: e.target.value || undefined }))} className="mt-1 w-full rounded border border-slate-300 p-1.5" /></label>
                    <label>{tx('Unit counts after collection (%)', 'यूनिट इतने % कलेक्शन के बाद गिनी जाए')}<input type="number" min={0} max={100} value={s.qualifyCollectionPct} onChange={(e) => patch(p.projectId, (x) => ({ ...x, qualifyCollectionPct: Number(e.target.value) }))} className="mt-1 w-full rounded border border-slate-300 p-1.5" /></label>
                  </div>
                  <div className="space-y-2">
                    {s.slabs.map((x, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2 rounded bg-slate-50 p-2">
                        <select value={x.level} onChange={(e) => patch(p.projectId, (c) => ({ ...c, slabs: c.slabs.map((y, j) => j === i ? { ...y, level: e.target.value as any } : y) }))} className="rounded border border-slate-300 p-1">
                          <option value="INDIVIDUAL">{tx("Associate's own units", 'एसोसिएट की अपनी यूनिट')}</option>
                          <option value="PROJECT">{tx('Whole project units', 'पूरे प्रोजेक्ट की यूनिट')}</option>
                        </select>
                        <span>≥</span>
                        <input type="number" min={1} value={x.minUnits} onChange={(e) => patch(p.projectId, (c) => ({ ...c, slabs: c.slabs.map((y, j) => j === i ? { ...y, minUnits: Number(e.target.value) } : y) }))} className="w-16 rounded border border-slate-300 p-1" />
                        <span>{tx('units →', 'यूनिट →')}</span>
                        <select value={x.kind} onChange={(e) => patch(p.projectId, (c) => ({ ...c, slabs: c.slabs.map((y, j) => j === i ? { ...y, kind: e.target.value as any } : y) }))} className="rounded border border-slate-300 p-1">
                          <option value="LUMP_SUM">{tx('Lump sum ₹', 'एकमुश्त ₹')}</option>
                          <option value="EXTRA_PCT">{tx('Extra % on those sales', 'उन बिक्री पर अतिरिक्त %')}</option>
                        </select>
                        <input type="number" step="any" min={0} value={x.value} onChange={(e) => patch(p.projectId, (c) => ({ ...c, slabs: c.slabs.map((y, j) => j === i ? { ...y, value: Number(e.target.value) } : y) }))} className="w-28 rounded border border-slate-300 p-1" />
                        <button type="button" aria-label={tx('Remove slab', 'स्लैब हटाएँ')} onClick={() => patch(p.projectId, (c) => ({ ...c, slabs: c.slabs.filter((_, j) => j !== i) }))} className="text-red-500 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => patch(p.projectId, (c) => ({ ...c, slabs: [...c.slabs, { id: '', level: 'INDIVIDUAL', minUnits: 3, kind: 'LUMP_SUM', value: 25000 }] }))} className="inline-flex items-center gap-1 text-indigo-600 hover:underline"><Plus className="h-3 w-3" /> {tx('Add slab', 'स्लैब जोड़ें')}</button>
                  </div>
                  <label className="block">{tx('Note for associates (optional)', 'एसोसिएट के लिए नोट (वैकल्पिक)')}<input value={s.note || ''} maxLength={200} onChange={(e) => patch(p.projectId, (x) => ({ ...x, note: e.target.value }))} className="mt-1 w-full rounded border border-slate-300 p-1.5" /></label>
                  <button disabled={busy === 'save-' + p.projectId} onClick={() => act('save-' + p.projectId, () => api.crmSaveBonusScheme(p.projectId, s), tx('Bonus scheme saved', 'बोनस स्कीम सेव हुई'))} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" /> {tx('Save scheme', 'स्कीम सेव करें')}</button>
                </div>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
};
