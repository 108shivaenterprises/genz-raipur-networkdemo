import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n, useTx } from '../../lib/i18n.js';

/** v76 — small pieces the HR screens share: rupee format, times in IST, a status pill, a month picker, a one-line toast. */
export const inr = (n: number) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
export const fmtTime = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '';
export const fmtDay = (d: string, hi = false) => new Date(d + 'T00:00:00Z').toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const fmtRange = (a: string, b: string, hi = false) => a === b ? fmtDay(a, hi) : `${fmtDay(a, hi)} – ${fmtDay(b, hi)}`;
export const monthLabel = (m: string, hi = false) => new Date(m + '-01T00:00:00Z').toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const nowMonth = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);
export const shiftMonth = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 7); };

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'slate' | 'orange';
const TONE: Record<Tone, string> = {
  green: 'bg-emerald-100 text-emerald-800', amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-700',
  blue: 'bg-sky-100 text-sky-800', slate: 'bg-slate-100 text-slate-600', orange: 'bg-orange-100 text-orange-800',
};
export const Pill: React.FC<{ tone?: Tone; children: React.ReactNode }> = ({ tone = 'slate', children }) => <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[tone]}`}>{children}</span>;

/** the one-word state of a person today, in plain words */
export const useStateInfo = () => {
  const tx = useTx();
  return (s: string): { label: string; tone: Tone } => ({
    IN: { label: tx('In', 'हाज़िर'), tone: 'green' }, LATE: { label: tx('Late', 'देर से'), tone: 'amber' }, OUT: { label: tx('Done', 'छुट्टी हुई'), tone: 'slate' },
    ON_LEAVE: { label: tx('On leave', 'छुट्टी पर'), tone: 'blue' }, OFF: { label: tx('Off today', 'आज छुट्टी'), tone: 'slate' }, ABSENT: { label: tx('Not in', 'नहीं आया'), tone: 'red' },
    NOT_YET: { label: tx('Not yet', 'अभी नहीं'), tone: 'slate' }, HALF: { label: tx('Half day', 'आधा दिन'), tone: 'orange' },
  } as Record<string, { label: string; tone: Tone }>)[s] || { label: s, tone: 'slate' };
};

/** the colour of a day letter in the month sheet */
export const CODE_CLASS: Record<string, string> = {
  P: 'bg-emerald-500 text-white', L: 'bg-amber-400 text-white', H: 'bg-orange-400 text-white', A: 'bg-red-500 text-white',
  V: 'bg-sky-500 text-white', O: 'bg-slate-200 text-slate-500', '-': 'bg-slate-100 text-slate-300',
};

export const MonthBar: React.FC<{ month: string; onChange: (m: string) => void; max?: string }> = ({ month, onChange, max }) => {
  const { lang } = useI18n(); const tx = useTx();
  const canNext = !max || month < max;
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-1 py-1">
      <button type="button" aria-label={tx('Previous month', 'पिछला महीना')} onClick={() => onChange(shiftMonth(month, -1))} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"><ChevronLeft className="h-5 w-5" /></button>
      <div className="text-sm font-bold text-slate-900">{monthLabel(month, lang === 'hi')}</div>
      <button type="button" aria-label={tx('Next month', 'अगला महीना')} disabled={!canNext} onClick={() => onChange(shiftMonth(month, 1))} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
    </div>
  );
};

/** a one-line message that goes away by itself */
export function useFlash() {
  const [t, setT] = useState<{ ok: boolean; msg: string } | null>(null);
  const flash = (ok: boolean, msg: string) => { setT({ ok, msg }); setTimeout(() => setT(null), 4500); };
  const node = t ? <div role="status" className={`rounded-lg px-3 py-2 text-xs font-medium ${t.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{t.msg}</div> : null;
  return { flash, node };
}

export const INPUT = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
export const BTN = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-50';
export const BTN_DARK = `${BTN} bg-slate-900 text-white`;
export const BTN_GREEN = `${BTN} bg-emerald-600 text-white`;
export const BTN_LINE = `${BTN} border border-slate-300 bg-white text-slate-700`;
export const BTN_RED = `${BTN} border border-red-300 bg-white text-red-700`;
export const CARD = 'rounded-xl border border-slate-200 bg-white p-4';

/** a progress bar that is green when done, amber under way */
export const Bar: React.FC<{ pct: number }> = ({ pct }) => (
  <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-sky-500' : 'bg-amber-400'}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} /></div>
);

export const WEEKDAYS = (hi: boolean) => hi ? ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
