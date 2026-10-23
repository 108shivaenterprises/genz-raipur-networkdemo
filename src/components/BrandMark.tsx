/**
 * v51 — the GENZ Broker Network logo.
 * Drop the logo file at  public/brand/logo.png  (a square or wide PNG with a transparent background) and it shows up here, in the header and on
 * the sign-in page, with no code change. Until that file exists the old gold "GZ" mark is shown, so nothing looks broken.
 */
import React, { useEffect, useState } from 'react';

const LOGO = '/brand/logo.png';
// one check per page load, shared by every BrandMark on the screen
let known: boolean | undefined;
let pending: Promise<boolean> | undefined;
const probe = (): Promise<boolean> => {
  if (known !== undefined) return Promise.resolve(known);
  if (!pending) {
    pending = new Promise<boolean>((resolve) => {
      try {
        const im = new Image();
        im.onload = () => { known = im.naturalWidth > 0; resolve(known); };
        im.onerror = () => { known = false; resolve(false); };
        im.src = LOGO;
      } catch { known = false; resolve(false); }
    });
  }
  return pending;
};

export const BrandMark: React.FC<{ className?: string }> = ({ className = 'h-10 w-10' }) => {
  const [has, setHas] = useState(known === true);
  useEffect(() => {
    let live = true;
    if (known === undefined) void probe().then((ok) => { if (live) setHas(ok); });
    return () => { live = false; };
  }, []);
  if (has) return <img src={LOGO} alt="GENZ Broker Network" className={`${className} shrink-0 rounded-lg object-contain`} data-testid="brand-logo" />;
  return <div className={`flex ${className} shrink-0 items-center justify-center rounded-lg bg-slate-900 font-bold tracking-wider text-amber-400 shadow-sm`} data-testid="brand-gz" aria-label="GENZ Broker Network">GZ</div>;
};
