import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { goto } from '../lib/goto.js';
import { pushState } from '../lib/push.js';
import type { TabType } from './NavigationTabs.js';

/** v182 — the broker's first-run steps on the Chats home: one 44px line, opens to the steps. Same data and hide key as the Home card (it is mounted on one screen only). */
export const FirstRunStrip: React.FC<{ userId: string; onNavigate: (t: TabType) => void; onAddNeed: () => void }> = ({ userId, onNavigate, onAddNeed }) => {
  const tx = useTx(); const [h, setH] = useState<any>(null); const [alertsOn, setAlertsOn] = useState(false); const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(`genz.firststeps.${userId}`) === '1'; } catch { return false; } });
  useEffect(() => { if (hidden) return; api.homeBroker().then(setH).catch(() => setH(null)); pushState().then(s => setAlertsOn(s === 'on')).catch(() => {}); }, [hidden]);
  if (hidden || !h?.firstRun) return null;
  const f = h.firstRun;
  const steps = [
    { done: f.listing, en: 'Add 1 property', hi: '1 प्रॉपर्टी जोड़ें', go: () => goto('properties', { drafts: '1' }, onNavigate) },
    { done: f.client, en: 'Add 1 client or buyer need', hi: '1 क्लाइंट या खरीदार की ज़रूरत जोड़ें', go: onAddNeed },
    { done: !!f.share, en: 'Share 1 link or flyer', hi: '1 लिंक या फ़्लायर शेयर करें', go: () => onNavigate('share' as TabType) },
    { done: !!f.invite, en: 'Invite 1 broker', hi: '1 ब्रोकर को बुलाएँ', go: () => onNavigate('grow' as TabType) },
    { done: alertsOn, en: 'Turn on phone alerts', hi: 'फ़ोन अलर्ट चालू करें', go: () => onNavigate('dashboard') },
  ];
  const left = steps.filter(s => !s.done).length;
  if (!left) return null;
  return (
    <div className="mb-2 rounded-xl border border-slate-200 bg-white" data-testid="first-steps-chat">
      <div className="flex items-center">
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-3 text-left text-sm font-bold text-slate-900">
          <span className="min-w-0 flex-1 truncate">{tx(`Get started — ${steps.length - left} of ${steps.length} done`, `शुरुआत — ${steps.length} में से ${steps.length - left} पूरे`)}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        <button type="button" onClick={() => { try { localStorage.setItem(`genz.firststeps.${userId}`, '1'); } catch { /* storage blocked */ } setHidden(true); }} className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-xs font-semibold text-slate-500" data-testid="first-steps-chat-hide">{tx('Hide', 'छुपाएँ')}</button>
      </div>
      {open && <ul className="space-y-1.5 px-3 pb-3">{steps.filter(s => !s.done).map((s, i) => (
        <li key={i}><button type="button" onClick={s.go} className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-slate-200 px-3 text-left text-sm font-semibold"><span className="min-w-0 flex-1">{tx(s.en, s.hi)}</span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden /></button></li>
      ))}</ul>}
    </div>
  );
};
