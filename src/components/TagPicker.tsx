import React, { useState } from 'react';
import { TAG_GROUPS, cleanTags } from '../shared/india.js';
import { useI18n } from '../lib/i18n.js';
import { useLabel } from '../lib/labels.js';

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  max?: number;
  label?: string;
}

/** Grouped quick-pick tags plus free-text custom tags. */
export const TagPicker: React.FC<Props> = ({ value, onChange, max = 12, label }) => {
  const { lang } = useI18n();
  const hi = lang === 'hi';
  const label_ = useLabel();
  const [custom, setCustom] = useState('');
  const has = (t: string) => value.some((x) => x.toLowerCase() === t.toLowerCase());
  const toggle = (t: string) => onChange(has(t) ? value.filter((x) => x.toLowerCase() !== t.toLowerCase()) : cleanTags([...value, t], max));
  const addCustom = () => {
    if (!custom.trim()) return;
    onChange(cleanTags([...value, custom], max));
    setCustom('');
  };
  const known = new Set(TAG_GROUPS.flatMap((g) => g.tags.map((t) => t.toLowerCase())));
  const extra = value.filter((t) => !known.has(t.toLowerCase()));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-700">{label || (hi ? 'टैग (खोज और मैचिंग के लिए)' : 'Tags (used for search & matching)')}</label>
        <span className="text-[10px] text-slate-400">{value.length}/{max}</span>
      </div>
      {TAG_GROUPS.map((g) => (
        <div key={g.group}>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{hi ? g.groupHi : g.group}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {g.tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggle(t)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                  has(t) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {label_('tag', t)}
              </button>
            ))}
          </div>
        </div>
      ))}
      {extra.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {extra.map((t) => (
            <button key={t} type="button" onClick={() => toggle(t)} className="rounded-full border border-amber-400 bg-amber-100 px-2.5 py-0.5 text-[11px] text-amber-950">
              {t} ✕
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          placeholder={hi ? 'अपना टैग जोड़ें' : 'Add your own tag'}
          maxLength={40}
          className="flex-1 rounded-lg border border-slate-300 p-1.5 text-xs focus:border-slate-900 focus:outline-none"
        />
        <button type="button" onClick={addCustom} className="rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          {hi ? 'जोड़ें' : 'Add'}
        </button>
      </div>
    </div>
  );
};
