/**
 * v51 — one way to show a property's picture everywhere (chats, deals, deal room, matches).
 * With a photo it shows the photo; without one (or when the photo cannot load) it shows a soft coloured tile with an icon for the kind of
 * property, so nothing ever looks broken or empty. The caller sets the size and shape (className), e.g. "h-12 w-12 rounded-lg".
 */
import React, { useEffect, useState } from 'react';
import { Building2, Home, Store, Trees } from 'lucide-react';

const TINTS = [
  'bg-sky-100 text-sky-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700', 'bg-rose-100 text-rose-700', 'bg-teal-100 text-teal-700',
];
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const iconFor = (t?: string) => {
  const x = String(t || '').toLowerCase();
  if (/plot|land|farm|agri/.test(x)) return Trees;
  if (/shop|commercial|office|showroom|warehouse|godown/.test(x)) return Store;
  if (/house|villa|bungalow|independent|row/.test(x)) return Home;
  return Building2;
};

export const PropertyThumb: React.FC<{
  /** the cover picture (first image of the property) */
  src?: string;
  /** the kind of property ("Residential Flat", "Plot" …) — picks the icon of the fallback tile */
  type?: string;
  /** any stable text (title / id) — picks the colour of the fallback tile */
  seed?: string;
  className?: string;
  iconClassName?: string;
}> = ({ src, type, seed, className = 'h-12 w-12 rounded-lg', iconClassName = 'h-1/2 w-1/2' }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  const Icon = iconFor(type);
  const tint = TINTS[hash(String(seed || type || 'x')) % TINTS.length];
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden ${className} ${src && !failed ? 'bg-slate-100' : tint}`} data-testid="prop-thumb" aria-hidden="true">
      {src && !failed
        ? <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" onError={() => setFailed(true)} />
        : <Icon className={iconClassName} strokeWidth={1.75} />}
    </span>
  );
};
