import React, { useEffect, useRef, useState } from 'react';
import { Loader2, X, Download, ShieldCheck } from 'lucide-react';
import { useTx } from '../lib/i18n.js';

/**
 * v49 — the one view-only viewer for Protected Docs and protected Property Papers.
 *
 * Every page is drawn on a canvas with the VIEWER's own stamp (name · ••last 4 of mobile · date-time) tiled across the
 * whole page, plus a solid band at the bottom that cannot be missed. The page bytes come from single-use, signed page
 * tokens that the server serves only as an <img> to the person they were made for. The screen blurs when the window
 * loses focus and blocks save / print / copy shortcuts and the right-click menu.
 *
 * Honest limit: nothing on a web page can stop a phone camera or a screenshot — the stamp is what makes a leaked copy
 * traceable to the person who opened it.
 */
export interface ViewSession {
  title: string;
  tokens: string[];
  watermark: string;
  pages: number;
}

/** draw the page + the viewer's stamp; exported for the tests of the drawing maths */
export function stampCanvas(img: HTMLImageElement, stamp: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const k = Math.min(1, 1200 / img.width);
  c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, c.width, c.height);
  const W = c.width, H = c.height;
  const size = Math.max(15, Math.round(Math.min(W, H * 1.4) / 24));
  const line = `${stamp} · GENZ`;
  // 1) tiled, diagonal, two-tone (a light edge + a dark red fill) so it shows on white paper and on dark photos alike
  g.save();
  g.translate(W / 2, H / 2); g.rotate(-Math.PI / 7); g.translate(-W / 2, -H / 2);
  g.font = `700 ${size}px system-ui, "Noto Sans Devanagari", sans-serif`;
  g.textBaseline = 'middle';
  const tw = g.measureText(line).width;
  const stepX = Math.round(tw + size * 2.2);
  const stepY = Math.round(size * 3.6);
  let row = 0;
  for (let y = -H; y < H * 2; y += stepY, row++) {
    for (let x = -W - (row % 2) * (stepX / 2); x < W * 2; x += stepX) {
      g.globalAlpha = 0.42; g.lineWidth = Math.max(2, size / 7); g.strokeStyle = '#ffffff'; g.strokeText(line, x, y);
      g.globalAlpha = 0.34; g.fillStyle = '#b91c1c'; g.fillText(line, x, y);
    }
  }
  g.restore();
  // 2) a solid band at the bottom: who opened it, when, and that it must not be forwarded
  const band = Math.round(size * 2.3);
  g.save();
  g.globalAlpha = 0.86; g.fillStyle = '#0f172a'; g.fillRect(0, H - band, W, band);
  g.globalAlpha = 1; g.fillStyle = '#ffffff'; g.textBaseline = 'middle';
  g.font = `700 ${Math.round(size * 0.8)}px system-ui, "Noto Sans Devanagari", sans-serif`;
  const foot = `GENZ · View only — opened by ${stamp} · do not forward`;
  let fs = Math.round(size * 0.8);
  while (fs > 9 && g.measureText(foot).width > W - 20) { fs -= 1; g.font = `700 ${fs}px system-ui, "Noto Sans Devanagari", sans-serif`; }
  g.fillText(foot, 10, H - band / 2);
  g.restore();
  return c;
}

const LOADS = new WeakMap<object, Promise<(HTMLCanvasElement | null)[]>>();

export const WatermarkViewer: React.FC<{
  session: ViewSession;
  pageUrl: (token: string) => string;
  /** the original file(s) — only for people allowed to download (the uploader, the property owner / listing broker) */
  downloads?: { label: string; href: string }[];
  onClose: () => void;
}> = ({ session, pageUrl, downloads, onClose }) => {
  const tx = useTx();
  const [imgs, setImgs] = useState<(HTMLCanvasElement | null)[]>([]);
  const [hidden, setHidden] = useState(false);
  const [failed, setFailed] = useState('');
  const host = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let dead = false;
    // single-use page tokens: load once per session (React StrictMode runs effects twice in development)
    let job = LOADS.get(session);
    if (!job) {
      job = (async () => {
        const out: (HTMLCanvasElement | null)[] = [];
        for (const t of session.tokens) {
          try {
            const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('x')); i.src = pageUrl(t); });
            out.push(stampCanvas(img, session.watermark));
          } catch { out.push(null); }
        }
        return out;
      })();
      LOADS.set(session, job);
    }
    job.then(out => {
      if (dead) return;
      setImgs(out);
      if (out.every(x => !x)) setFailed(tx('Could not load the pages. Close and open again.', 'पेज लोड नहीं हुए। बंद करके दोबारा खोलें।'));
    });
    return () => { dead = true; };
  }, [session, pageUrl, tx]);

  useEffect(() => {
    const blur = () => setHidden(document.visibilityState !== 'visible' || !document.hasFocus());
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'c', 'u'].includes(e.key.toLowerCase())) e.preventDefault();
      if (e.key === 'Escape') onClose();
      if (e.key === 'PrintScreen') { setHidden(true); try { navigator.clipboard?.writeText(''); } catch { /* ignore */ } }
    };
    const ctx = (e: Event) => e.preventDefault();
    window.addEventListener('blur', blur); window.addEventListener('focus', blur); document.addEventListener('visibilitychange', blur); window.addEventListener('keydown', key); document.addEventListener('contextmenu', ctx);
    return () => { window.removeEventListener('blur', blur); window.removeEventListener('focus', blur); document.removeEventListener('visibilitychange', blur); window.removeEventListener('keydown', key); document.removeEventListener('contextmenu', ctx); };
  }, [onClose]);

  useEffect(() => {
    const h = host.current; if (!h) return;
    h.replaceChildren();
    imgs.forEach(c => {
      if (!c) return;
      c.style.cssText = 'width:100%;height:auto;display:block;margin-bottom:10px;border-radius:6px;pointer-events:none;-webkit-user-drag:none;user-select:none';
      c.draggable = false; h.appendChild(c);
    });
  }, [imgs]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950 print:hidden" style={{ userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }} data-testid="wm-viewer">
      <div className="flex items-center justify-between gap-2 bg-slate-900 px-4 py-3 text-white">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{session.title}</div>
          <div className="flex items-center gap-1 truncate text-[11px] text-amber-300" data-testid="wm-stamp"><ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />{tx('View only · stamped with: ', 'सिर्फ़ देखने के लिए · मुहर: ')}{session.watermark}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {(downloads || []).map(d => <a key={d.href} href={d.href} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-white/10 px-2.5 text-xs font-semibold" data-testid="wm-download"><Download className="h-3.5 w-3.5" aria-hidden />{d.label}</a>)}
          <button onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-white/10" aria-label={tx('Close', 'बंद करें')} data-testid="wm-close"><X className="h-5 w-5" /></button>
        </div>
      </div>
      <div className="relative flex-1 overflow-y-auto p-3">
        {imgs.length === 0 && !failed && <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>}
        {failed && <p className="py-20 text-center text-sm text-red-300">{failed}</p>}
        <div ref={host} className={`mx-auto max-w-2xl transition ${hidden ? 'blur-2xl' : ''}`} data-testid="wm-pages" />
        {hidden && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/70 text-center text-sm font-semibold text-white">{tx('Hidden while this window is not in focus', 'यह विंडो फोकस में न होने पर छुपा रहता है')}</div>}
      </div>
    </div>
  );
};
