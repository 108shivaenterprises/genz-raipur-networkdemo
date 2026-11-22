import React, { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useTx } from '../lib/i18n.js';
import { WHATS_NEW, LATEST_VERSION, seenVersion, markSeen, shouldShowWhatsNew } from '../lib/whatsNew.js';

export const WhatsNewCard: React.FC<{ userId: string; createdAt?: string; role?: string }> = ({ userId, createdAt, role }) => {
  const tx = useTx();
  const [show, setShow] = useState(() => {
    const seen = seenVersion(userId);
    const s = shouldShowWhatsNew(seen, LATEST_VERSION, createdAt);
    if (!s && !seen) markSeen(userId);   // first-ever login: nothing to announce, remember the version
    return s;
  });
  const [more, setMore] = useState(false);
  if (!show) return null;
  const e = role === 'PROPERTY_OWNER' && WHATS_NEW[0].owner ? { ...WHATS_NEW[0], ...WHATS_NEW[0].owner } : WHATS_NEW[0];
  return (
    <div className="mb-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-3.5" data-testid="whats-new" role="status">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-indigo-950">{tx('What’s new', 'नया क्या है')}</p>
          {(() => { const items = tx(e.en.join('|'), e.hi.join('|')).split('|'); return (<>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-indigo-900">{(more ? items : items.slice(0, 1)).map((b, i) => <li key={i}>{b}</li>)}</ul>
            {items.length > 1 && <button type="button" onClick={() => setMore(m => !m)} aria-expanded={more} className="mt-0.5 inline-flex min-h-11 items-center text-xs font-semibold text-indigo-700 underline" data-testid="whats-new-more">{more ? tx('Less', 'कम') : tx(`${items.length - 1} more`, `${items.length - 1} और`)}</button>}
          </>); })()}
        </div>
        <button type="button" data-testid="whats-new-close" onClick={() => { markSeen(userId); setShow(false); }} className="-mr-1 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-indigo-700" aria-label={tx('Dismiss', 'बंद करें')}><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
};
