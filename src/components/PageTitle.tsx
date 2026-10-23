/**
 * v51 — the heading of a main page: just the title, a small count chip and an (i) that opens the one-line "what is this page" help.
 * Replaces the small grey line above the title and the grey paragraph under it, which every page carried before and nobody read.
 */
import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { useTx } from '../lib/i18n.js';

export const PageTitle: React.FC<{
  title: React.ReactNode;
  /** a short count / status shown as a chip next to the title, e.g. "6 deals" */
  meta?: React.ReactNode;
  /** the explanation that used to sit under the title — opens from the (i) */
  help?: React.ReactNode;
  testId?: string;
}> = ({ title, meta, help, testId }) => {
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const hasMeta = meta !== undefined && meta !== null && meta !== '' && meta !== false;
  return (
    <div data-testid={testId}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
        {hasMeta && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{meta}</span>}
        {help && (
          <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={tx('About this page', 'इस पेज के बारे में')} data-testid="page-help"
            className="-m-1.5 inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <Info className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {help && open && <p className="mt-1 max-w-2xl text-sm text-slate-600" data-testid="page-help-text">{help}</p>}
    </div>
  );
};
