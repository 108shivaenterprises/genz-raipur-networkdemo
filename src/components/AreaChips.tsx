import React, { useState } from 'react';
import { X } from 'lucide-react';
import { areasOf, canonPlace, splitPlaces, suggestAreas } from '../shared/places.js';
import { useI18n } from '../lib/i18n.js';

/**
 * v90 — pick several areas of a city. Tap a suggestion or type one (spelling is tidied: "shanker nagar" → "Shankar Nagar").
 * A city has many areas, so the list shown is the chosen city's own areas.
 */
export const AreaChips: React.FC<{
  city: string; value: string[]; onChange: (v: string[]) => void; max?: number; label?: string; hint?: string; testId?: string;
}> = ({ city, value, onChange, max = 10, label, hint, testId = 'area-chips' }) => {
  const { lang } = useI18n(); const hi = lang === 'hi';
  const [typed, setTyped] = useState('');
  const add = (raw: string) => {
    const next = [...value];
    for (const p of splitPlaces(raw)) { const c = canonPlace(city, p); if (c && !next.some(x => x.toLowerCase() === c.toLowerCase())) next.push(c); }
    onChange(next.slice(0, max)); setTyped('');
  };
  const sugg = suggestAreas(city, typed, typed ? 6 : 10).filter(s => !value.some(v => v.toLowerCase() === s.replace(/\s*\(.*\)\s*/g, '').toLowerCase()));
  return (
    <div data-testid={testId}>
      {label && <label className="text-xs font-semibold text-slate-700">{label}</label>}
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
      {value.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {value.map(v => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white">
              {v}<button type="button" aria-label={`remove ${v}`} onClick={() => onChange(value.filter(x => x !== v))}><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
      <input
        value={typed} onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); if (typed.trim()) add(typed); } }}
        onBlur={() => { if (typed.trim()) add(typed); }}
        placeholder={city ? (hi ? `${city} का इलाका लिखें, Enter दबाएँ` : `Type an area of ${city}, press Enter`) : (hi ? 'पहले शहर चुनें' : 'Choose the city first')}
        className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
      />
      {city && areasOf(city).length > 0 && sugg.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {sugg.map(s => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-700 hover:border-slate-900">+ {s.replace(/\s*\(.*\)\s*/g, '')}</button>
          ))}
        </div>
      )}
    </div>
  );
};
