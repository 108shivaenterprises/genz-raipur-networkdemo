/** v26 — GENZ admin: owner consents to check (signed paper forms, links opened on the broker's own phone, owner reports). */
import React, { useEffect, useState } from 'react';
import { FileSignature, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';

export const ConsentQueue: React.FC = () => {
  const tx = useTx();
  const [items, setItems] = useState<any[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const load = () => api.consentQueue().then(r => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  if (!items || !items.length) return null;
  const act = async (id: string, fn: () => Promise<any>) => { setBusy(id); setErr(''); try { await fn(); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(''); } };
  return (
    <section className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3" data-testid="consent-queue">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-amber-900"><FileSignature className="h-4 w-4" />{tx('Owner consents to check', 'जाँचने के लिए मालिक-सहमति')} ({items.length})</h3>
      {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
      <ul className="mt-2 space-y-2">
        {items.map(c => (
          <li key={c.id} className="rounded-lg border border-amber-200 bg-white p-2 text-xs">
            <p className="font-semibold text-slate-900">{c.title} — {c.locality}, {c.city}</p>
            <p className="text-slate-600">{tx('Broker', 'ब्रोकर')}: {c.brokerName} · {tx('Owner', 'मालिक')}: {c.ownerName} (…{c.ownerPhoneLast4}) · {c.protectionDays} {tx('days', 'दिन')}</p>
            {c.status === 'PAPER_REVIEW' && <a href={api.consentPaperUrl(c.id)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-semibold text-blue-700 underline">{tx('Open the signed form', 'साइन किया फ़ॉर्म खोलें')}</a>}
            {c.sameDevice && <p className="mt-1 text-red-700"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{tx('The owner’s “yes” came from the same phone and browser the broker used — call the owner to confirm.', 'मालिक की “हाँ” उसी फ़ोन-ब्राउज़र से आई जिससे ब्रोकर ने लिंक बनाया — मालिक को फ़ोन करके पक्का करें।')}</p>}
            {c.ownerReport && <p className="mt-1 text-red-700"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{tx('Owner says he did not agree', 'मालिक कहते हैं उन्होंने सहमति नहीं दी')}: “{c.ownerReport.note}”</p>}
            <input value={notes[c.id] || ''} onChange={e => setNotes({ ...notes, [c.id]: e.target.value })} placeholder={tx('Note (the broker sees it)', 'नोट (ब्रोकर को दिखेगा)')} className="mt-1 w-full rounded border border-slate-300 px-2 py-1" />
            <div className="mt-1 flex flex-wrap gap-2">
              {c.status === 'PAPER_REVIEW' ? <>
                <button disabled={!!busy} onClick={() => act(c.id, () => api.consentDecide(c.id, true, notes[c.id] || ''))} className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white" data-testid="consent-approve">{busy === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : tx('Form is fine', 'फ़ॉर्म ठीक है')}</button>
                <button disabled={!!busy} onClick={() => act(c.id, () => api.consentDecide(c.id, false, notes[c.id] || ''))} className="rounded bg-red-600 px-2 py-1 font-semibold text-white">{tx('Not acceptable', 'स्वीकार नहीं')}</button>
              </> : <>
                <button disabled={!!busy} onClick={() => act(c.id, () => api.consentDecide(c.id, true, notes[c.id] || 'Owner confirmed on call'))} className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white">{tx('Owner confirmed — keep', 'मालिक ने पक्का किया — रखें')}</button>
                <button disabled={!!busy} onClick={() => act(c.id, () => api.consentVoid(c.id, notes[c.id] || ''))} className="rounded bg-red-600 px-2 py-1 font-semibold text-white">{tx('Cancel consent', 'सहमति रद्द करें')}</button>
              </>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
