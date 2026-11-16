import React, { useState } from 'react';
import { Copy, X } from 'lucide-react';
import { useTx } from '../lib/i18n.js';
import { makePosts, type PostHome, type PostLang } from '../shared/postMaker.js';

/** v160 — ready-to-paste text for a listing: WhatsApp group post, Instagram caption + hashtags, reel script. One tap copies it. */
export const PostMaker: React.FC<{ home: PostHome; broker: string; phone?: string; link?: string; onClose: () => void }> = ({ home, broker, phone, link, onClose }) => {
  const tx = useTx();
  const [lang, setLang] = useState<PostLang>('hi');
  const [tab, setTab] = useState<'group' | 'insta' | 'reel'>('group');
  const [done, setDone] = useState(false);
  const p = makePosts(home, { lang, broker, phone, link });
  const text = p[tab];
  const copy = async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* the text is selectable below */ } };
  const tabs: ['group' | 'insta' | 'reel', string][] = [['group', tx('WhatsApp group', 'WhatsApp ग्रुप')], ['insta', tx('Instagram', 'इंस्टाग्राम')], ['reel', tx('Reel idea', 'रील का आइडिया')]];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={tx('Post text', 'पोस्ट का टेक्स्ट')} data-testid="post-maker">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">{tx('Post this home', 'यह घर पोस्ट करें')}</h3>
          <button type="button" onClick={onClose} aria-label={tx('Close', 'बंद करें')} className="grid h-10 w-10 place-items-center rounded-full text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-2 flex gap-1.5" role="tablist">
          {tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`post-tab-${k}`} className={`min-h-10 flex-1 rounded-lg px-2 text-xs font-bold ${tab === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'}`}>{l}</button>)}
        </div>
        <div className="mt-2 flex gap-1.5">
          {(['hi', 'en'] as PostLang[]).map(l => <button key={l} type="button" onClick={() => setLang(l)} className={`min-h-9 rounded-full px-3 text-xs font-bold ${lang === l ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800'}`}>{l === 'hi' ? 'हिन्दी' : 'English'}</button>)}
        </div>
        <textarea readOnly value={text} rows={11} className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm text-slate-900" aria-label={tx('Post text', 'पोस्ट का टेक्स्ट')} data-testid="post-text" />
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => void copy()} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white" data-testid="post-copy"><Copy className="h-4 w-4" />{done ? tx('Copied ✔', 'कॉपी हो गया ✔') : tx('Copy', 'कॉपी करें')}</button>
          {tab === 'group' && <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-emerald-500 bg-emerald-50 px-4 text-sm font-bold text-emerald-800">{tx('Open WhatsApp', 'WhatsApp खोलें')}</a>}
        </div>
        <p className="mt-2 text-xs text-slate-500">{tx('Owner name, number and exact address are never put in.', 'मालिक का नाम, नंबर और पूरा पता इसमें कभी नहीं जाता।')}</p>
      </div>
    </div>
  );
};
