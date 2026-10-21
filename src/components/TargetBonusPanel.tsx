import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Trophy, Save, Timer, Rocket, TrendingUp, Lock, Target as TargetIcon } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { DEFAULT_TARGET_SCHEME, rewardLabel, type TargetBonusScheme } from '../shared/targetBonus.js';

const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const day = (iso?: string, hi = false) => iso ? new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

interface Props { role: string; canPay: boolean }

/** v38 — Target Bonus: builder sets a target + deadline per partner and three rewards; the broker sees his own progress card. */
export const TargetBonusPanel: React.FC<Props> = ({ role, canPay }) => {
  const tx = useTx();
  const hi = useI18n().lang === 'hi';
  const [data, setData] = useState<{ projects: any[]; canManage: boolean } | null>(null);
  const [draft, setDraft] = useState<Record<string, TargetBonusScheme>>({});
  const [terms, setTerms] = useState<Record<string, { target: number; deadline: string }>>({});
  const [payRef, setPayRef] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const broker = role === 'BROKER';

  const load = useCallback(async () => {
    try {
      const r = await api.crmTargetBonus();
      setData(r);
      setDraft(Object.fromEntries(r.projects.map((p: any) => [p.projectId, p.scheme || DEFAULT_TARGET_SCHEME(p.earlyBirdPct ?? undefined)])));
      setTerms(Object.fromEntries(r.projects.flatMap((p: any) => p.rows.map((x: any) => [x.mandateId, { target: x.target, deadline: x.targetBy || '' }]))));
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (key: string, fn: () => Promise<any>, ok: string) => {
    setBusy(key); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); await load(); } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  };
  const patch = (pid: string, fn: (s: TargetBonusScheme) => TargetBonusScheme) => setDraft(d => ({ ...d, [pid]: fn(d[pid] || DEFAULT_TARGET_SCHEME()) }));

  if (!data) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  const manage = data.canManage;
  if (!data.projects.length) return broker ? null : (
    <p className="rounded-xl border border-slate-200 bg-white p-4 text-center text-xs text-slate-500">{tx('Launch a project first to set a target bonus.', 'टारगेट बोनस लगाने से पहले एक प्रोजेक्ट लॉन्च करें।')}</p>
  );

  const stateBadge = (r: any) => {
    const m: Record<string, [string, string, string]> = {
      ACHIEVED: ['bg-emerald-100 text-emerald-800', 'Target done', 'टारगेट पूरा'], IN_PROGRESS: ['bg-indigo-100 text-indigo-800', 'In progress', 'चल रहा है'],
      MISSED: ['bg-slate-200 text-slate-700', 'Period over', 'समय खत्म'], NO_TARGET: ['bg-amber-100 text-amber-800', 'No target set', 'टारगेट नहीं'],
    };
    const [c, en, h] = m[r.state] || m.IN_PROGRESS;
    return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c}`}>{tx(en, h)}{r.early ? ' · ' + tx('early', 'जल्दी') : ''}</span>;
  };
  const paceText = (r: any) => ({ AHEAD: tx('Ahead of pace', 'रफ़्तार से आगे'), ON_TRACK: tx('On track', 'सही रफ़्तार'), BEHIND: tx('Behind pace', 'रफ़्तार से पीछे'), DONE: tx('Target reached', 'टारगेट पूरा'), OVER: tx('Above target', 'टारगेट से ऊपर') } as Record<string, string>)[r.pace];
  const bar = (r: any) => {
    const pct = r.target ? Math.min(100, Math.round((r.units / r.target) * 100)) : 0;
    const time = r.daysTotal ? Math.min(100, Math.round(((r.daysTotal - r.daysLeft) / r.daysTotal) * 100)) : 0;
    return (
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100" title={tx(`${pct}% of target · ${time}% of time used`, `टारगेट का ${pct}% · समय का ${time}% बीता`)}>
        <div className={`h-full rounded-full ${r.state === 'ACHIEVED' ? 'bg-emerald-500' : r.pace === 'BEHIND' ? 'bg-amber-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
        {r.state === 'IN_PROGRESS' && <div className="absolute top-0 h-full w-0.5 bg-slate-500" style={{ left: `${time}%` }} />}
      </div>
    );
  };

  return (
    <div className="space-y-4" data-testid="target-bonus">
      <div className="flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
        <Trophy className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {broker
            ? tx('Target bonus: reach your own target before your deadline and the builder pays extra — more for every unit above the target, and more again if you finish early. A unit counts after the booking is approved and the minimum collection is in.',
                 'टारगेट बोनस: अपनी डेडलाइन से पहले अपना टारगेट पूरा करें तो बिल्डर अतिरिक्त देगा — टारगेट से ऊपर हर यूनिट पर और ज़्यादा, और जल्दी पूरा करने पर और भी। यूनिट तब गिनी जाती है जब बुकिंग मंज़ूर हो और न्यूनतम कलेक्शन आ जाए।')
            : tx('Target bonus: give each partner a target and a deadline. Reward 1 — target reached by the deadline. Reward 2 — extra % on every unit above the target. Reward 3 — early finish (your early-bird %). A partner who already earned, or whose period ended, keeps the terms he earned on.',
                 'टारगेट बोनस: हर पार्टनर को टारगेट और डेडलाइन दें। इनाम 1 — डेडलाइन तक टारगेट पूरा। इनाम 2 — टारगेट से ऊपर हर यूनिट पर अतिरिक्त %। इनाम 3 — जल्दी पूरा करने पर (आपका अर्ली-बर्ड %)। जिस पार्टनर ने कमा लिया या जिसका समय खत्म हो गया, उसकी शर्तें वही रहती हैं।')}
        </span>
      </div>
      {msg && <div className={`rounded-lg px-3 py-2 text-xs font-medium ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

      {data.projects.map((p) => {
        const s = draft[p.projectId] || DEFAULT_TARGET_SCHEME();
        const sc = p.scheme as TargetBonusScheme | null;
        return (
          <section key={p.projectId} className="rounded-xl border border-slate-200 bg-white p-4" data-testid={`tb-project-${p.projectId}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><TargetIcon className="h-4 w-4 text-indigo-600" /> {p.projectName}</h3>
              {sc && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${sc.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{sc.enabled ? tx('Target bonus on', 'टारगेट बोनस चालू') : tx('Target bonus off', 'टारगेट बोनस बंद')}</span>}
            </div>

            {sc?.enabled && (
              <ul className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <li className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800"><Trophy className="mr-1 inline h-3 w-3" />{tx('Target by deadline', 'डेडलाइन तक टारगेट')} → {rewardLabel(sc.hit, hi)}</li>
                {sc.overPct > 0 && <li className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-800"><TrendingUp className="mr-1 inline h-3 w-3" />{tx('Each unit above target', 'टारगेट से ऊपर हर यूनिट')} → +{sc.overPct}%</li>}
                {sc.early && sc.early.value > 0 && <li className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800"><Rocket className="mr-1 inline h-3 w-3" />{tx(`Finish in the first ${sc.early.withinPct}% of the time`, `समय के पहले ${sc.early.withinPct}% में पूरा`)} → {rewardLabel(sc.early, hi)}</li>}
                <li className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{tx(`Period ${sc.periodDays} days · counts at ${sc.qualifyCollectionPct}% collection`, `अवधि ${sc.periodDays} दिन · ${sc.qualifyCollectionPct}% कलेक्शन पर गिनती`)}</li>
              </ul>
            )}
            {sc?.note && <p className="mt-1 text-[11px] italic text-slate-500">{sc.note}</p>}

            {/* broker: one progress card */}
            {broker && p.rows.map((r: any) => (
              <div key={r.mandateId} className="mt-3 rounded-lg border border-slate-200 p-3" data-testid="tb-my-card">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-900">{tx(`Target: ${r.target} unit(s) by ${day(r.deadline)}`, `टारगेट: ${day(r.deadline, true)} तक ${r.target} यूनिट`)}</span>
                  {stateBadge(r)}
                </div>
                <div className="mt-2">{bar(r)}</div>
                <div className="mt-1 flex flex-wrap justify-between gap-2 text-[11px] text-slate-600">
                  <span><b className="text-slate-900">{r.units}</b>/{r.target} {tx('units', 'यूनिट')} · {paceText(r)}</span>
                  {r.state === 'IN_PROGRESS' && <span className="flex items-center gap-1"><Timer className="h-3 w-3" />{tx(`${r.daysLeft} day(s) left`, `${r.daysLeft} दिन बाकी`)}</span>}
                </div>
                {r.state === 'IN_PROGRESS' && (
                  <ul className="mt-2 space-y-1 text-[11px] text-slate-700">
                    <li>🎯 {tx(`${r.unitsToGo} more unit(s) → ${rewardLabel(sc?.hit, false)}`, `${r.unitsToGo} यूनिट और → ${rewardLabel(sc?.hit, true)}`)}{sc?.hit.kind === 'EXTRA_PCT' && r.potential.hit > 0 && <span className="text-slate-500"> ({tx('about', 'लगभग')} {inr(r.potential.hit)})</span>}</li>
                    {sc?.early && sc.early.value > 0 && r.earlyBy && r.earlyDaysLeft > 0 && <li>🚀 {tx(`Finish by ${day(r.earlyBy)} (${r.earlyDaysLeft} days) → early-bird ${rewardLabel(sc.early, false)}`, `${day(r.earlyBy, true)} तक (${r.earlyDaysLeft} दिन) पूरा करें → अर्ली-बर्ड ${rewardLabel(sc.early, true)}`)}{sc.early.kind === 'EXTRA_PCT' && r.potential.early > 0 && <span className="text-slate-500"> ({tx('about', 'लगभग')} {inr(r.potential.early)})</span>}</li>}
                    {r.potential.perExtraUnitPct > 0 && <li>📈 {tx(`After the target, every extra unit → +${r.potential.perExtraUnitPct}% on that sale`, `टारगेट के बाद हर अतिरिक्त यूनिट → उस बिक्री पर +${r.potential.perExtraUnitPct}%`)}</li>}
                  </ul>
                )}
                {r.state === 'ACHIEVED' && <p className="mt-2 text-[11px] font-semibold text-emerald-800">🎉 {tx(`Target reached on ${day(r.hitAt)}${r.early ? ' — early!' : ''}`, `${day(r.hitAt, true)} को टारगेट पूरा${r.early ? ' — जल्दी!' : ''}`)}</p>}
                {r.state === 'MISSED' && <p className="mt-2 text-[11px] text-slate-500">{tx('The period is over and the target was not reached. A pending collection on a booking made in the period can still count.', 'समय खत्म, टारगेट पूरा नहीं हुआ। अवधि में हुई बुकिंग का बाकी कलेक्शन आने पर वह अब भी गिनी जा सकती है।')}</p>}
                {(r.earned > 0 || r.paid > 0) && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-5">
                    <div><div className="text-slate-500">{tx('Target', 'टारगेट')}</div><b>{inr(r.hitAmount)}</b></div>
                    <div><div className="text-slate-500">{tx('Above target', 'टारगेट से ऊपर')}</div><b>{inr(r.overAmount)}</b></div>
                    <div><div className="text-slate-500">{tx('Early-bird', 'अर्ली-बर्ड')}</div><b>{inr(r.earlyAmount)}</b></div>
                    <div><div className="text-slate-500">{tx('Paid', 'मिला')}</div><b>{inr(r.paid)}</b></div>
                    <div><div className="text-slate-500">{tx('Due to you', 'बाकी')}</div><b className="text-emerald-800">{inr(r.payable)}</b></div>
                  </div>
                )}
                {r.locked && <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500"><Lock className="h-3 w-3" /> {tx('Your terms are frozen — later changes by the builder do not apply to you.', 'आपकी शर्तें तय हो गईं — बिल्डर के बाद के बदलाव आप पर लागू नहीं।')}</p>}
              </div>
            ))}

            {/* builder: every partner */}
            {!broker && sc && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="text-left text-[11px] uppercase text-slate-500">
                    <tr><th className="py-1.5 pr-2">{tx('Partner', 'पार्टनर')}</th><th>{tx('Target', 'टारगेट')}</th><th>{tx('Deadline', 'डेडलाइन')}</th><th className="w-40">{tx('Progress', 'प्रगति')}</th><th>{tx('Earned', 'कमाया')}</th><th>{tx('Paid', 'चुकाया')}</th><th>{tx('Payable', 'देय')}</th><th /></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {p.rows.map((r: any) => {
                      const t = terms[r.mandateId] || { target: r.target, deadline: r.targetBy || '' };
                      const changed = t.target !== r.target || (t.deadline || '') !== (r.targetBy || '');
                      return (
                        <tr key={r.mandateId} className="align-top" data-testid={`tb-row-${r.mandateId}`}>
                          <td className="py-2 pr-2"><div className="font-medium text-slate-800">{r.brokerName}</div><div className="mt-0.5">{stateBadge(r)}</div></td>
                          <td className="py-2">{manage && !r.locked
                            ? <input type="number" min={1} max={500} value={t.target} onChange={e => setTerms({ ...terms, [r.mandateId]: { ...t, target: Number(e.target.value) } })} className="w-16 rounded border border-slate-300 p-1" aria-label={tx('Target units', 'टारगेट यूनिट')} />
                            : <b>{r.target}</b>}</td>
                          <td className="py-2">{manage && !r.locked
                            ? <input type="date" value={t.deadline || r.deadline.slice(0, 10)} onChange={e => setTerms({ ...terms, [r.mandateId]: { ...t, deadline: e.target.value } })} className="rounded border border-slate-300 p-1" aria-label={tx('Deadline', 'डेडलाइन')} />
                            : day(r.deadline, hi)}
                            {r.state === 'IN_PROGRESS' && <div className="mt-0.5 text-[10px] text-slate-500">{tx(`${r.daysLeft} day(s) left`, `${r.daysLeft} दिन बाकी`)}</div>}
                          </td>
                          <td className="py-2 pr-2">{bar(r)}<div className="mt-0.5 text-[10px] text-slate-500">{r.units}/{r.target} · {paceText(r)}</div></td>
                          <td className="py-2 font-semibold text-emerald-800" title={tx(`Target ${inr(r.hitAmount)} + above target ${inr(r.overAmount)} + early ${inr(r.earlyAmount)}`, `टारगेट ${inr(r.hitAmount)} + ऊपर ${inr(r.overAmount)} + जल्दी ${inr(r.earlyAmount)}`)}>{inr(r.earned)}</td>
                          <td className="py-2">{inr(r.paid)}{r.overpaid > 0 && <div className="text-[10px] text-red-600">{tx('over-paid', 'ज़्यादा चुकाया')} {inr(r.overpaid)}</div>}</td>
                          <td className="py-2 font-semibold">{inr(r.payable)}</td>
                          <td className="whitespace-nowrap py-2">
                            {manage && !r.locked && changed && (
                              <button disabled={busy === 'terms-' + r.mandateId} onClick={() => act('terms-' + r.mandateId, () => api.crmSaveTargetPartner(p.projectId, r.mandateId, { target: t.target, deadline: t.deadline }), tx('Target saved', 'टारगेट सेव हुआ'))}
                                className="rounded bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50" data-testid={`tb-save-${r.mandateId}`}>{tx('Save', 'सेव')}</button>
                            )}
                            {r.locked && <span className="inline-flex items-center gap-1 text-[10px] text-slate-500" title={tx('Reached the target or period over — terms frozen', 'टारगेट पूरा या समय खत्म — शर्तें तय')}><Lock className="h-3 w-3" />{tx('frozen', 'तय')}</span>}
                            {canPay && r.payable > 0 && (
                              <span className="ml-1 inline-flex items-center gap-1">
                                <input value={payRef[r.mandateId] || ''} onChange={e => setPayRef({ ...payRef, [r.mandateId]: e.target.value })} placeholder={tx('UTR / ref', 'UTR / रेफ़')} className="w-24 rounded border border-slate-300 px-1.5 py-1 text-[11px]" />
                                <button disabled={busy === 'pay-' + r.mandateId} onClick={() => act('pay-' + r.mandateId, () => api.crmPayTargetBonus(p.projectId, { mandateId: r.mandateId, amount: r.payable, reference: payRef[r.mandateId] || '' }), tx('Target bonus marked as paid', 'टारगेट बोनस चुकाया दर्ज हुआ'))}
                                  className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50">{tx('Pay', 'चुकाएँ')} {inr(r.payable)}</button>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!p.rows.length && <tr><td colSpan={8} className="py-3 text-slate-400">{tx('No appointed partners yet.', 'अभी कोई नियुक्त पार्टनर नहीं।')}</td></tr>}
                  </tbody>
                </table>
                <p className="mt-1 text-[10px] text-slate-400">{tx('Empty deadline = partner start + the period. TDS is shown at payout; deduct and deposit it per your CA. GENZ does not hold or move this money.', 'खाली डेडलाइन = पार्टनर शुरू होने की तारीख + अवधि। पेआउट पर TDS दिखता है; CA की सलाह से काटें। GENZ यह पैसा न रखता है न भेजता है।')}</p>
              </div>
            )}

            {/* builder: scheme editor */}
            {manage && (
              <details className="mt-3 rounded-lg border border-slate-200 p-3" open={!sc}>
                <summary className="cursor-pointer text-xs font-semibold text-slate-800">{sc ? tx('Edit target bonus', 'टारगेट बोनस बदलें') : tx('Set up a target bonus', 'टारगेट बोनस लगाएँ')}</summary>
                <div className="mt-3 space-y-3 text-xs">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={s.enabled} onChange={e => patch(p.projectId, x => ({ ...x, enabled: e.target.checked }))} /> {tx('Target bonus is active', 'टारगेट बोनस चालू है')}</label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label>{tx('Default period (days from the partner\'s start)', 'डिफ़ॉल्ट अवधि (पार्टनर शुरू होने से दिन)')}<input type="number" min={7} max={730} value={s.periodDays} onChange={e => patch(p.projectId, x => ({ ...x, periodDays: Number(e.target.value) }))} className="mt-1 w-full rounded border border-slate-300 p-1.5" /></label>
                    <label>{tx('Unit counts after collection (%)', 'यूनिट इतने % कलेक्शन के बाद गिनी जाए')}<input type="number" min={0} max={100} value={s.qualifyCollectionPct} onChange={e => patch(p.projectId, x => ({ ...x, qualifyCollectionPct: Number(e.target.value) }))} className="mt-1 w-full rounded border border-slate-300 p-1.5" /></label>
                  </div>
                  <fieldset className="rounded bg-emerald-50/60 p-2">
                    <legend className="px-1 font-semibold text-emerald-900">1 · {tx('Target reached by the deadline', 'डेडलाइन तक टारगेट पूरा')}</legend>
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={s.hit.kind} onChange={e => patch(p.projectId, x => ({ ...x, hit: { ...x.hit, kind: e.target.value as any } }))} className="rounded border border-slate-300 p-1">
                        <option value="EXTRA_PCT">{tx('Extra % on the period\'s sales', 'अवधि की बिक्री पर अतिरिक्त %')}</option>
                        <option value="LUMP_SUM">{tx('Fixed ₹', 'तय ₹')}</option>
                      </select>
                      <input type="number" step="any" min={0} value={s.hit.value} onChange={e => patch(p.projectId, x => ({ ...x, hit: { ...x.hit, value: Number(e.target.value) } }))} className="w-28 rounded border border-slate-300 p-1" aria-label={tx('Target reward', 'टारगेट इनाम')} />
                    </div>
                  </fieldset>
                  <fieldset className="rounded bg-indigo-50/60 p-2">
                    <legend className="px-1 font-semibold text-indigo-900">2 · {tx('Every unit above the target', 'टारगेट से ऊपर हर यूनिट')}</legend>
                    <label className="flex items-center gap-2">+<input type="number" step="any" min={0} max={5} value={s.overPct} onChange={e => patch(p.projectId, x => ({ ...x, overPct: Number(e.target.value) }))} className="w-20 rounded border border-slate-300 p-1" aria-label={tx('Extra % per unit above target', 'टारगेट से ऊपर प्रति यूनिट %')} />% {tx('on that unit\'s agreement value (0 = off)', 'उस यूनिट की एग्रीमेंट वैल्यू पर (0 = बंद)')}</label>
                  </fieldset>
                  <fieldset className="rounded bg-amber-50/60 p-2">
                    <legend className="px-1 font-semibold text-amber-900">3 · {tx('Early finish (early-bird)', 'जल्दी पूरा (अर्ली-बर्ड)')}</legend>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={!!s.early} onChange={e => patch(p.projectId, x => ({ ...x, early: e.target.checked ? { kind: 'EXTRA_PCT', value: p.earlyBirdPct || 0.25, withinPct: 50 } : null }))} /> {tx('Reward an early finish', 'जल्दी पूरा करने पर इनाम')}</label>
                    {s.early && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span>{tx('Target reached within the first', 'समय के पहले')}</span>
                        <input type="number" min={10} max={90} value={s.early.withinPct} onChange={e => patch(p.projectId, x => ({ ...x, early: { ...x.early!, withinPct: Number(e.target.value) } }))} className="w-16 rounded border border-slate-300 p-1" aria-label={tx('Within % of period', 'अवधि के % में')} />
                        <span>{tx('% of the period →', '% में पूरा →')}</span>
                        <select value={s.early.kind} onChange={e => patch(p.projectId, x => ({ ...x, early: { ...x.early!, kind: e.target.value as any } }))} className="rounded border border-slate-300 p-1">
                          <option value="EXTRA_PCT">{tx('Extra %', 'अतिरिक्त %')}</option>
                          <option value="LUMP_SUM">{tx('Fixed ₹', 'तय ₹')}</option>
                        </select>
                        <input type="number" step="any" min={0} value={s.early.value} onChange={e => patch(p.projectId, x => ({ ...x, early: { ...x.early!, value: Number(e.target.value) } }))} className="w-24 rounded border border-slate-300 p-1" aria-label={tx('Early reward', 'जल्दी का इनाम')} />
                      </div>
                    )}
                    <p className="mt-1 text-[10px] text-amber-800">{tx('This is the project\'s early-bird %: saving an extra % here updates it.', 'यही प्रोजेक्ट का अर्ली-बर्ड % है: यहाँ % सेव करने पर वह भी बदल जाता है।')}</p>
                  </fieldset>
                  <label className="block">{tx('Note for partners (optional)', 'पार्टनर के लिए नोट (वैकल्पिक)')}<input value={s.note || ''} maxLength={200} onChange={e => patch(p.projectId, x => ({ ...x, note: e.target.value }))} className="mt-1 w-full rounded border border-slate-300 p-1.5" /></label>
                  <button disabled={busy === 'save-' + p.projectId} data-testid={`tb-save-scheme-${p.projectId}`}
                    onClick={() => act('save-' + p.projectId, () => api.crmSaveTargetScheme(p.projectId, { enabled: s.enabled, periodDays: s.periodDays, qualifyCollectionPct: s.qualifyCollectionPct, hit: s.hit, overPct: s.overPct, early: s.early, note: s.note || '' }), tx('Target bonus saved', 'टारगेट बोनस सेव हुआ'))}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" /> {tx('Save target bonus', 'टारगेट बोनस सेव करें')}</button>
                </div>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
};
