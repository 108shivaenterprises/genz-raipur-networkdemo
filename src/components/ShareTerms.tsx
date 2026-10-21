import React, { useState } from 'react';
import { Percent } from 'lucide-react';
import { api } from '../lib/api.js';
import { formatINR } from '../lib/utils.js';
import { DEFAULT_MAX_SHARE_PCT, shareAmount, type ReferralShare } from '../shared/connector.js';

/**
 * v31 — the connector's % of the broker's commission on one referral.
 * The two sides agree a percentage; the broker pays it from his own commission, outside GENZ. GENZ records the terms, caps the %, keeps the trail.
 * side: CONNECTOR (the partner), WORKER (assigned broker / contractor / sponsor), VIEW (GENZ staff, read-only).
 */
export const ShareTerms: React.FC<{ r: any; side: 'CONNECTOR' | 'WORKER' | 'VIEW'; hi: boolean; cap?: number; onChanged: () => void }> = ({ r, side, hi, cap = DEFAULT_MAX_SHARE_PCT, onChanged }) => {
  const tx = (en: string, h: string) => (hi ? h : en);
  const sh: ReferralShare | undefined = r.share;
  const [pct, setPct] = useState('');
  const [commission, setCommission] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const closed = ['DUPLICATE', 'REJECTED', 'CLOSED_LOST'].includes(r.status);
  if (side === 'VIEW' && !sh) return null;
  if (!sh && closed) return null;
  if (side === 'WORKER' && !r.assignedToId && !r.sponsorId && !sh) return null;

  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setErr('');
    try { await fn(); setPct(''); setNote(''); setCommission(''); onChanged(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const mineProposal = !!sh && sh.status === 'PROPOSED' && sh.proposedBy === side;
  const theirProposal = !!sh && sh.status === 'PROPOSED' && sh.proposedBy !== side && side !== 'VIEW';
  const who = (s: string) => (s === 'CONNECTOR' ? tx('Connector', 'कनेक्टर') : tx('Broker', 'ब्रोकर'));
  const STATUS: Record<string, [string, string, string]> = {
    PROPOSED: ['Waiting for an answer', 'जवाब का इंतज़ार', 'bg-amber-100 text-amber-900'],
    AGREED: ['Agreed', 'तय हो गया', 'bg-emerald-100 text-emerald-900'],
    DECLINED: ['Declined', 'मना किया', 'bg-slate-200 text-slate-700'],
    PAID: ['Marked paid', 'चुकाया बताया', 'bg-sky-100 text-sky-900'],
    CONFIRMED: ['Received ✔', 'मिल गया ✔', 'bg-emerald-100 text-emerald-900'],
    NOT_RECEIVED: ['Not received', 'नहीं मिला', 'bg-rose-100 text-rose-800'],
  };
  const live = pct ? shareAmount(Number(commission || 0), Number(pct)) : 0;

  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-xs" data-testid={`share-${r.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold text-violet-900"><Percent className="h-3.5 w-3.5" /> {tx('Connector share of the broker\'s commission', 'ब्रोकर के कमीशन में कनेक्टर का हिस्सा')}</p>
        {sh && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[sh.status][2]}`}>{hi ? STATUS[sh.status][1] : STATUS[sh.status][0]}</span>}
      </div>

      {sh && (
        <p className="mt-1.5 text-sm text-slate-900">
          <b data-testid="share-pct">{sh.pct}%</b>
          {sh.amount !== undefined && <> · {tx('commission', 'कमीशन')} {formatINR(sh.dealCommission || 0)} → <b data-testid="share-amount">{formatINR(sh.amount)}</b></>}
          {sh.status === 'PROPOSED' && <span className="text-slate-500"> · {tx(`proposed by the ${who(sh.proposedBy).toLowerCase()}`, `${who(sh.proposedBy)} ने रखा`)}</span>}
        </p>
      )}

      {/* propose / counter */}
      {side !== 'VIEW' && (!sh || sh.status === 'DECLINED' || sh.status === 'PROPOSED') && !closed && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {theirProposal && <>
            <button disabled={busy} onClick={() => run(() => api.connectorShareRespond(r.id, 'ACCEPT'))} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white" data-testid="share-accept">{tx('Accept', 'मंज़ूर')} {sh!.pct}%</button>
            <button disabled={busy} onClick={() => run(() => api.connectorShareRespond(r.id, 'DECLINE', note))} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700" data-testid="share-decline">{tx('Decline', 'मना करें')}</button>
            <span className="text-slate-500">{tx('or counter:', 'या अपना %:')}</span>
          </>}
          {mineProposal && <span className="text-slate-500">{tx('You can change your %:', 'अपना % बदल सकते हैं:')}</span>}
          <input value={pct} onChange={e => setPct(e.target.value)} inputMode="decimal" placeholder="%" className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right" data-testid="share-input" aria-label={tx('Percent', 'प्रतिशत')} />
          <button disabled={busy || !pct} onClick={() => run(() => api.connectorShareSet(r.id, Number(pct), note || undefined))} className="rounded-lg bg-violet-700 px-3 py-1.5 font-semibold text-white disabled:opacity-40" data-testid="share-send">
            {theirProposal ? tx('Counter', 'काउंटर') : sh && sh.status === 'PROPOSED' ? tx('Change', 'बदलें') : tx('Propose %', '% रखें')}
          </button>
          <span className="text-[11px] text-slate-500">{tx(`up to ${cap}%`, `अधिकतम ${cap}%`)}</span>
        </div>
      )}

      {/* the broker records the commission once the deal is won */}
      {side === 'WORKER' && sh?.status === 'AGREED' && r.status === 'CLOSED_WON' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-800">{tx('Your commission on this deal ₹', 'इस सौदे पर आपका कमीशन ₹')}</span>
          <input value={commission} onChange={e => setCommission(e.target.value)} inputMode="numeric" className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right" data-testid="share-commission" aria-label={tx('Commission', 'कमीशन')} />
          <button disabled={busy || !Number(commission)} onClick={() => run(() => api.connectorShareDeal(r.id, Number(commission)))} className="rounded-lg bg-violet-700 px-3 py-1.5 font-semibold text-white disabled:opacity-40" data-testid="share-deal">{tx('Work out the share', 'हिस्सा निकालें')}</button>
          {live > 0 && <span className="text-slate-600">= {formatINR(live)}</span>}
        </div>
      )}
      {sh?.status === 'AGREED' && r.status !== 'CLOSED_WON' && side !== 'VIEW' && <p className="mt-1.5 text-slate-600">{tx('Agreed. When the deal closes, the broker enters his commission and the amount is worked out.', 'तय है। सौदा पक्का होने पर ब्रोकर अपना कमीशन डालेगा और रकम निकल जाएगी।')}</p>}

      {side === 'WORKER' && sh && sh.amount !== undefined && ['AGREED', 'NOT_RECEIVED'].includes(sh.status) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={note} onChange={e => setNote(e.target.value)} placeholder={tx('UPI ref / note (optional)', 'UPI रेफ़ / नोट (वैकल्पिक)')} className="w-44 rounded-lg border border-slate-300 bg-white px-2 py-1.5" />
          <button disabled={busy} onClick={() => run(() => api.connectorShareSettle(r.id, 'PAID', note || undefined))} className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white" data-testid="share-paid">{tx('I have paid it', 'मैंने चुका दिया')}</button>
        </div>
      )}
      {side === 'CONNECTOR' && sh?.status === 'PAID' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button disabled={busy} onClick={() => run(() => api.connectorShareSettle(r.id, 'CONFIRM'))} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white" data-testid="share-confirm">{tx('Yes, I received it', 'हाँ, मिल गया')}</button>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder={tx('If not received, say why', 'न मिले तो कारण')} className="w-44 rounded-lg border border-slate-300 bg-white px-2 py-1.5" />
          <button disabled={busy || note.trim().length < 5} onClick={() => run(() => api.connectorShareSettle(r.id, 'NOT_RECEIVED', note))} className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-semibold text-rose-700 disabled:opacity-40" data-testid="share-notrecv">{tx('Not received', 'नहीं मिला')}</button>
        </div>
      )}
      {sh?.status === 'NOT_RECEIVED' && side === 'VIEW' && <p className="mt-1.5 font-semibold text-rose-700">{tx('The connector says this share has not arrived. Please talk to both sides.', 'कनेक्टर कहता है यह हिस्सा नहीं पहुँचा। दोनों से बात करें।')}</p>}

      {err && <p className="mt-1.5 font-medium text-red-700" data-testid="share-error">{err}</p>}

      {sh && sh.history.length > 1 && (
        <details className="mt-2 text-[11px] text-slate-600"><summary className="cursor-pointer">{tx('History', 'इतिहास')}</summary>
          <ul className="mt-1 space-y-0.5">{sh.history.map(h => <li key={h.id}>{new Date(h.at).toLocaleDateString('en-IN')} · {h.side === 'GENZ' ? 'GENZ' : who(h.side)} · {h.action.toLowerCase().replace('_', ' ')}{h.pct ? ` ${h.pct}%` : ''}{h.note ? ` — ${h.note}` : ''}</li>)}</ul>
        </details>
      )}
      <details className="mt-2 text-[11px] text-slate-500"><summary className="cursor-pointer font-semibold">{tx('How this works', 'यह कैसे काम करता है')}</summary><p className="mt-1">{tx(
        'This is a referral fee the broker pays from his own commission, directly to the connector. GENZ only records the % and the trail; GENZ does not collect or pay it. Rewards and the reward ledger are separate.',
        'यह रेफ़रल फ़ीस है जो ब्रोकर अपने कमीशन से सीधे कनेक्टर को देता है। GENZ सिर्फ़ % और रिकॉर्ड रखता है; GENZ न इसे लेता है न देता है। रिवॉर्ड अलग चीज़ है।')}</p></details>
    </div>
  );
};
