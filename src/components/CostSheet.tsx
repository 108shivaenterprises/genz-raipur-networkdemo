/** v30 — Deal Desk → Cost sheet: all-in cost of a property (duty, registration, GST, extras, broker's fee) and EMI comparison. Runs in the browser, stores nothing. */
import React, { useMemo, useState } from 'react';
import { useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';
import { landedCost, loanPlan } from '../shared/costRules.js';

const inp = 'min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm';
const Num: React.FC<{ label: string; v: string; set: (v: string) => void; hint?: string; testId?: string }> = ({ label, v, set, hint, testId }) => (
  <label className="block text-[11px] font-semibold text-slate-600">{label}
    <input className={`${inp} mt-1`} inputMode="decimal" value={v} onChange={e => set(e.target.value.replace(/[^\d.]/g, ''))} data-testid={testId} />
    {hint && <span className="mt-0.5 block text-[10px] font-normal text-slate-500">{hint}</span>}
  </label>
);

export const CostSheet: React.FC = () => {
  const tx = useTx();
  const [f, setF] = useState({ price: '', guide: '', stamp: '5', reg: '1', regCap: '', gst: '0', extras: '', legal: '', brokerage: '', down: '20', rate: '8.5', years: '20' });
  const set = (k: string) => (v: string) => setF(x => ({ ...x, [k]: v }));
  const n = (s: string) => Number(s) || 0;
  const c = useMemo(() => landedCost({ price: n(f.price), guidelineValue: n(f.guide), stampPct: n(f.stamp), regPct: n(f.reg), regCap: n(f.regCap), gstPct: n(f.gst), extras: n(f.extras), legal: n(f.legal), brokeragePct: n(f.brokerage) }), [f]);
  const plans = useMemo(() => [-1, 0, 1].map(d => ({ rate: Math.max(0, n(f.rate) + d), ...loanPlan(n(f.price), n(f.down), Math.max(0, n(f.rate) + d), n(f.years)) })), [f.price, f.down, f.rate, f.years]);
  const rows: [string, string, number][] = [
    ['Price on agreement', 'एग्रीमेंट की क़ीमत', n(f.price)], ['Stamp duty', 'स्टाम्प ड्यूटी', c.stamp], ['Registration fee', 'रजिस्ट्रेशन फ़ीस', c.reg], ['GST', 'GST', c.gst],
    ['Floor rise, parking, deposits…', 'फ्लोर राइज़, पार्किंग, डिपॉज़िट…', c.extras], ['Legal / agreement', 'वकील / एग्रीमेंट', c.legal], ['Broker’s fee', 'ब्रोकर फ़ीस', c.brokerage],
  ];
  return (
    <div className="space-y-3" data-testid="cost-sheet">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-bold text-slate-900">{tx('All-in cost sheet', 'कुल ख़र्च शीट')}</h3>
        <p className="text-[11px] text-slate-500">{tx('Show the buyer the real number before the site visit — no surprise at registry. Rates differ by state, buyer and year: type the rate you have confirmed with the sub-registrar / your CA. The numbers below are only a starting point, not an official rate.', 'साइट विज़िट से पहले खरीदार को असली रकम दिखाएँ — रजिस्ट्री पर झटका नहीं। दर राज्य, खरीदार और साल से बदलती है: सब-रजिस्ट्रार / CA से पक्की की हुई दर डालें। नीचे की संख्याएँ सिर्फ़ शुरुआती अंदाज़ हैं, सरकारी दर नहीं।')}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Num label={tx('Price ₹', 'क़ीमत ₹')} v={f.price} set={set('price')} testId="cost-price" />
          <Num label={tx('Guideline / circle value ₹ (optional)', 'गाइडलाइन / सर्किल वैल्यू ₹ (वैकल्पिक)')} v={f.guide} set={set('guide')} hint={tx('Duty is charged on the higher of the two', 'ड्यूटी दोनों में से ज़्यादा पर लगती है')} />
          <Num label={tx('Stamp duty %', 'स्टाम्प ड्यूटी %')} v={f.stamp} set={set('stamp')} testId="cost-stamp" />
          <Num label={tx('Registration %', 'रजिस्ट्रेशन %')} v={f.reg} set={set('reg')} />
          <Num label={tx('Registration cap ₹ (if any)', 'रजिस्ट्रेशन की सीमा ₹ (अगर हो)')} v={f.regCap} set={set('regCap')} />
          <label className="block text-[11px] font-semibold text-slate-600">{tx('GST %', 'GST %')}
            <select className={`${inp} mt-1`} value={f.gst} onChange={e => set('gst')(e.target.value)}><option value="0">{tx('0 — ready / resale', '0 — तैयार / पुनर्विक्रय')}</option><option value="1">{tx('1 — affordable, under construction', '1 — किफ़ायती, निर्माणाधीन')}</option><option value="5">{tx('5 — under construction', '5 — निर्माणाधीन')}</option></select>
            <span className="mt-0.5 block text-[10px] font-normal text-slate-500">{tx('Confirm with a CA', 'CA से पक्का करें')}</span></label>
          <Num label={tx('Extras ₹', 'अतिरिक्त ₹')} v={f.extras} set={set('extras')} />
          <Num label={tx('Legal ₹', 'वकील ₹')} v={f.legal} set={set('legal')} />
          <Num label={tx('Broker’s fee %', 'ब्रोकर फ़ीस %')} v={f.brokerage} set={set('brokerage')} />
        </div>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3" data-testid="cost-result">
        <ul className="space-y-1 text-xs text-slate-800">{rows.filter(r => r[2] > 0).map(r => <li key={r[0]} className="flex justify-between gap-2"><span>{tx(r[0], r[1])}</span><b>{formatINR(r[2])}</b></li>)}</ul>
        <div className="mt-2 flex justify-between border-t border-emerald-300 pt-2 text-sm font-extrabold text-slate-900"><span>{tx('You really pay', 'असल में देना होगा')}</span><span data-testid="cost-total">{formatINR(c.total)}</span></div>
        {c.total > 0 && <p className="text-[11px] text-emerald-800">{tx(`${c.onTopPct}% on top of the price`, `क़ीमत के ऊपर ${c.onTopPct}% और`)}</p>}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-bold text-slate-900">{tx('Home-loan EMI', 'होम-लोन EMI')}</h3>
        <div className="mt-2 grid grid-cols-3 gap-2"><Num label={tx('Down payment %', 'डाउन पेमेंट %')} v={f.down} set={set('down')} /><Num label={tx('Interest %', 'ब्याज %')} v={f.rate} set={set('rate')} /><Num label={tx('Years', 'साल')} v={f.years} set={set('years')} /></div>
        <div className="mt-2 overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-1">{tx('Rate', 'ब्याज')}</th><th>{tx('EMI / month', 'EMI / माह')}</th><th>{tx('Total interest', 'कुल ब्याज')}</th></tr></thead>
          <tbody>{plans.map((p, i) => <tr key={i} className={i === 1 ? 'font-bold' : ''}><td className="py-1">{p.rate}%</td><td data-testid={i === 1 ? 'emi-main' : undefined}>{formatINR(p.emi)}</td><td>{formatINR(p.interest)}</td></tr>)}</tbody></table></div>
        <p className="mt-1 text-[10px] text-slate-500">{tx('Loan approval, rate and processing fee depend on the bank — this is only an estimate for the talk with the buyer.', 'लोन की मंज़ूरी, ब्याज और प्रोसेसिंग फ़ीस बैंक पर निर्भर है — यह सिर्फ़ खरीदार से बात के लिए अंदाज़ा है।')}</p>
      </div>
    </div>
  );
};
