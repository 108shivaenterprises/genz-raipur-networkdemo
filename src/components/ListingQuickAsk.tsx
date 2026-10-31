/**
 * v99 — "सवाल-जवाब से लिस्टिंग भरें": the broker answers one small question at a time (tap or type) instead of filling a long form.
 * Same rules as the GENZ सहायक uses with an owner in the shop-QR chat (src/shared/listingAsk.ts). Nothing is saved here:
 * it only fills the draft's fields on screen; the draft's own Save / “ask the owner” buttons keep working as before.
 */
import React, { useMemo, useState } from 'react';
import { Wand2, CheckCircle2, Undo2 } from 'lucide-react';
import { useTx } from '../lib/i18n.js';
import { nextAsk, progress, applyAnswer, composeListing, SKIP_CHIP, type AskId } from '../shared/listingAsk.js';

export const ListingQuickAsk: React.FC<{ f: Record<string, any>; setF: (x: Record<string, any>) => void; hi: boolean }> = ({ f, setF, hi }) => {
  const tx = useTx();
  const [skipped, setSkipped] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [hint, setHint] = useState('');
  const [last, setLast] = useState<{ f: Record<string, any>; skipped: string[]; ack: string } | null>(null);
  const q = useMemo(() => nextAsk(f, skipped), [f, skipped]);
  const pr = progress(f, skipped, true);
  const answer = (id: AskId, input: { chip?: string; text?: string }) => {
    const r = applyAnswer(f, id, input);
    if (!r.ok) { setHint(hi ? r.hint.hi : r.hint.en); return; }
    setHint(''); setText('');
    setLast({ f, skipped, ack: hi ? r.ack.hi : r.ack.en });
    const sk = r.skip ? [...skipped, id] : skipped;
    if (r.skip) setSkipped(sk);
    // the last question: if the title / description are still empty, write them from the answers (never over the broker's own words)
    const empty = String(r.fields.title || '').trim().length <= 3 || String(r.fields.description || '').trim().length < 10;
    if (!nextAsk(r.fields, sk) && empty) { const c = composeListing(r.fields); setF({ ...r.fields, title: String(r.fields.title || '').trim().length > 3 ? r.fields.title : c.title, description: String(r.fields.description || '').trim().length >= 10 ? r.fields.description : c.description, tags: Array.from(new Set([...(r.fields.tags || []), ...c.tags])) }); return; }
    if (!r.skip) setF(r.fields);
  };
  const undo = () => { if (!last) return; setF(last.f); setSkipped(last.skipped); setLast(null); setHint(''); };
  const fillText = () => { const c = composeListing(f); setLast({ f, skipped, ack: hi ? 'शीर्षक और विवरण जवाबों से बना दिया।' : 'Title and description written from the answers.' }); setF({ ...f, title: c.title, description: c.description, tags: Array.from(new Set([...(f.tags || []), ...c.tags])) }); };

  return (
    <section className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3" data-testid="quick-ask">
      <div className="flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-emerald-700" aria-hidden />
        <h4 className="flex-1 text-sm font-bold text-emerald-900">{tx('Fill by answering', 'सवाल-जवाब से भरें')}</h4>
        <span className="text-xs font-semibold text-emerald-800" data-testid="quick-ask-progress">{pr.done}/{pr.total}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-emerald-100" aria-hidden><div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pr.total ? Math.round((pr.done / pr.total) * 100) : 100}%` }} /></div>

      {q ? (
        <div className="mt-2.5">
          <p className="text-sm font-semibold text-slate-900" data-testid="quick-ask-q">{hi ? q.hi : q.en}</p>
          {q.chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {q.chips.map(c => (
                <button key={c.id} type="button" onClick={() => answer(q.id, { chip: c.id })} data-testid={`quick-chip-${q.id}-${c.id}`}
                  className="min-h-[40px] rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 active:bg-emerald-100">{hi ? c.hi : c.en}</button>
              ))}
            </div>
          )}
          {q.free && (
            <form className="mt-2 flex gap-1.5" onSubmit={e => { e.preventDefault(); if (text.trim()) answer(q.id, { text }); }}>
              <input value={text} onChange={e => { setText(e.target.value); setHint(''); }} maxLength={200} data-testid="quick-ask-input" aria-label={hi ? q.hi : q.en}
                placeholder={tx('Type here…', 'यहाँ लिखें…')} className="min-h-[40px] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
              <button type="submit" disabled={!text.trim()} data-testid="quick-ask-send" className="min-h-[40px] rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white disabled:opacity-40">{tx('Next', 'आगे')}</button>
            </form>
          )}
          {hint && <p className="mt-1.5 text-xs font-medium text-amber-800" role="alert" data-testid="quick-ask-hint">{hint}</p>}
          {q.optional && <button type="button" onClick={() => answer(q.id, { chip: 'SKIP' })} data-testid="quick-ask-skip" className="mt-2 text-xs font-medium text-slate-600 underline">{hi ? SKIP_CHIP.hi : SKIP_CHIP.en}</button>}
        </div>
      ) : (
        <div className="mt-2.5" data-testid="quick-ask-done">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900"><CheckCircle2 className="h-4 w-4" aria-hidden />{tx('All questions done.', 'सारे सवाल हो गए।')}</p>
          <p className="mt-0.5 text-xs text-slate-700">{tx('Check the details below, then Save. Photos and papers are added separately.', 'नीचे की जानकारी देख लें, फिर Save दबाएँ। फ़ोटो और काग़ज़ अलग से जुड़ते हैं।')}</p>
        </div>
      )}

      {pr.done > 0 && (
        <button type="button" onClick={fillText} data-testid="quick-ask-compose" className="mt-2 min-h-[36px] rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-900">{tx('Write title & description from these answers', 'इन जवाबों से शीर्षक और विवरण लिखें')}</button>
      )}
      {last && <p className="mt-2 flex items-center gap-2 text-[11px] text-slate-600" role="status">✓ {last.ack}<button type="button" onClick={undo} data-testid="quick-ask-undo" className="inline-flex items-center gap-0.5 font-semibold text-slate-700 underline"><Undo2 className="h-3 w-3" aria-hidden />{tx('Undo', 'वापस')}</button></p>}
    </section>
  );
};
