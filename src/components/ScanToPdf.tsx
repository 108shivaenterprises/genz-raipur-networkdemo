import React, { useEffect, useRef, useState } from 'react';
import { Camera, Images, RotateCw, ArrowLeft, ArrowRight, Trash2, Loader2, FileText, X, Wand2 } from 'lucide-react';
import { useTx } from '../lib/i18n.js';
import { makePdfFile, type ScanSource, type Rotation } from '../lib/scanPages.js';

/**
 * v24 — "Make a PDF from photos": take or pick photos of each page, turn / order / remove them, optionally give them a clean
 * document look, and get ONE PDF back (built on the phone; no new library). The caller then uploads it exactly as if the
 * user had chosen a PDF — the same checks, the same storage.
 */
export const ScanToPdf: React.FC<{
  title?: string;
  /** the most the destination accepts (bytes) */
  maxBytes: number;
  maxPages?: number;
  /** a line shown on top, e.g. "Cover the first 8 Aadhaar digits before the photo" */
  hint?: { en: string; hi: string };
  onDone: (file: File) => void;
  onClose: () => void;
}> = ({ title: title0 = '', maxBytes, maxPages = 30, hint, onDone, onClose }) => {
  const tx = useTx();
  const [pages, setPages] = useState<(ScanSource & { url: string })[]>([]);
  const [title, setTitle] = useState(title0);
  const [enhance, setEnhance] = useState(true);
  const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(''); const [err, setErr] = useState('');
  const cam = useRef<HTMLInputElement>(null); const gal = useRef<HTMLInputElement>(null);
  useEffect(() => () => { pages.forEach(p => URL.revokeObjectURL(p.url)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose, busy]);

  const add = (list: FileList | null) => {
    if (!list) return; setErr('');
    const imgs = Array.from(list).filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (imgs.length < list.length) setErr(tx('Only photos can be made into a PDF here. To add a PDF you already have, close this and choose the file.', 'यहाँ सिर्फ़ फ़ोटो से PDF बनती है। पहले से बनी PDF जोड़ने के लिए इसे बंद करके फ़ाइल चुनें।'));
    setPages(cur => {
      const room = Math.max(0, maxPages - cur.length);
      if (imgs.length > room) setErr(tx(`At most ${maxPages} pages in one PDF.`, `एक PDF में ज़्यादा से ज़्यादा ${maxPages} पेज।`));
      return [...cur, ...imgs.slice(0, room).map((file, i) => ({ id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`, file, rotation: 0 as Rotation, url: URL.createObjectURL(file) }))];
    });
  };
  const turn = (i: number) => setPages(p => p.map((x, j) => (j === i ? { ...x, rotation: ((x.rotation + 90) % 360) as Rotation } : x)));
  const move = (i: number, d: -1 | 1) => setPages(p => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const drop = (i: number) => setPages(p => { URL.revokeObjectURL(p[i].url); return p.filter((_, j) => j !== i); });

  const make = async () => {
    setBusy(true); setErr('');
    try {
      const file = await makePdfFile(pages, {
        title: title.trim() || 'Scan', maxBytes, enhance,
        onProgress: (d, t, pass) => setProgress(pass ? tx(`Making it smaller to fit… page ${Math.min(d + 1, t)} of ${t}`, `फ़िट करने के लिए छोटा कर रहे हैं… पेज ${Math.min(d + 1, t)} / ${t}`) : tx(`Page ${Math.min(d + 1, t)} of ${t}…`, `पेज ${Math.min(d + 1, t)} / ${t}…`)),
      });
      onDone(file);
    } catch (e: any) {
      setErr(e?.message === 'TOO_BIG'
        ? tx(`Even at the smallest size these pages are over ${Math.round(maxBytes / 1024 / 1024)} MB. Make two PDFs with fewer pages.`, `सबसे छोटे साइज़ पर भी ये पेज ${Math.round(maxBytes / 1024 / 1024)} MB से ज़्यादा हैं। कम पेज वाली दो PDF बनाइए।`)
        : tx('A photo could not be read. Remove it and take it again.', 'कोई फ़ोटो पढ़ी नहीं जा सकी। उसे हटाकर दोबारा लीजिए।'));
    } finally { setBusy(false); setProgress(''); }
  };

  const btn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-40';
  const iconBtn = 'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 disabled:opacity-30';
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={tx('Make a PDF from photos', 'फ़ोटो से PDF बनाएँ')} data-testid="scan-to-pdf">
      <div className="flex max-h-[94vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><FileText className="h-5 w-5" />{tx('Make a PDF from photos', 'फ़ोटो से PDF बनाएँ')}</h3>
          <button type="button" onClick={onClose} disabled={busy} aria-label={tx('Close', 'बंद करें')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {hint && <p className="rounded-lg bg-amber-50 p-2.5 text-xs font-medium text-amber-900">{tx(hint.en, hint.hi)}</p>}
          <p className="text-xs text-slate-500">{tx('Lay each page flat in good light and photograph it from straight above. The PDF is made on your phone — nothing is sent until you upload it.', 'हर पेज को अच्छी रोशनी में सीधा रखकर ऊपर से फ़ोटो लीजिए। PDF आपके फ़ोन पर ही बनती है — अपलोड करने से पहले कुछ नहीं भेजा जाता।')}</p>

          <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { add(e.target.files); e.target.value = ''; }} />
          <input ref={gal} type="file" accept="image/*" multiple className="hidden" onChange={e => { add(e.target.files); e.target.value = ''; }} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={`${btn} bg-slate-900 text-white`} disabled={busy || pages.length >= maxPages} onClick={() => cam.current?.click()} data-testid="scan-camera"><Camera className="h-4 w-4" />{pages.length ? tx('Take next page', 'अगले पेज की फ़ोटो') : tx('Take photo of page 1', 'पेज 1 की फ़ोटो लें')}</button>
            <button type="button" className={`${btn} border border-slate-300 bg-white text-slate-700`} disabled={busy || pages.length >= maxPages} onClick={() => gal.current?.click()} data-testid="scan-gallery"><Images className="h-4 w-4" />{tx('Add from gallery', 'गैलरी से जोड़ें')}</button>
          </div>

          {pages.length > 0 && (
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="scan-pages">
              {pages.map((p, i) => (
                <li key={p.id} className="rounded-lg border border-slate-200 p-2">
                  <div className="relative flex h-36 items-center justify-center overflow-hidden rounded bg-slate-100">
                    <img src={p.url} alt={tx(`Page ${i + 1}`, `पेज ${i + 1}`)} className={`max-h-full max-w-full object-contain transition-transform ${enhance ? 'grayscale contrast-150 brightness-110' : ''}`} style={{ transform: `rotate(${p.rotation}deg)` }} />
                    <span className="absolute left-1 top-1 rounded bg-slate-900/80 px-1.5 text-[11px] font-bold text-white">{i + 1}</span>
                  </div>
                  <div className="mt-2 flex justify-between gap-1">
                    <button type="button" className={iconBtn} onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label={tx('Move earlier', 'पहले करें')}><ArrowLeft className="h-4 w-4" /></button>
                    <button type="button" className={iconBtn} onClick={() => turn(i)} disabled={busy} aria-label={tx('Turn', 'घुमाएँ')}><RotateCw className="h-4 w-4" /></button>
                    <button type="button" className={iconBtn} onClick={() => move(i, 1)} disabled={busy || i === pages.length - 1} aria-label={tx('Move later', 'बाद में करें')}><ArrowRight className="h-4 w-4" /></button>
                    <button type="button" className={`${iconBtn} !text-red-700`} onClick={() => drop(i)} disabled={busy} aria-label={tx('Remove page', 'पेज हटाएँ')}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <label className="block text-xs font-semibold text-slate-700">{tx('Name of the PDF', 'PDF का नाम')}
            <input className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} placeholder={tx('e.g. Sale deed – Plot 14', 'जैसे: सेल डीड – प्लॉट 14')} data-testid="scan-title" />
          </label>
          <label className="flex min-h-10 items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" className="h-4 w-4" checked={enhance} onChange={e => setEnhance(e.target.checked)} /><Wand2 className="h-4 w-4" />{tx('Clean document look (grey, whiter background, darker text)', 'साफ़ दस्तावेज़ जैसा (ग्रे, सफ़ेद बैकग्राउंड, गहरा अक्षर)')}</label>
          <p className="text-[11px] text-slate-500">{tx(`Up to ${maxPages} pages · the PDF is made to fit ${Math.round(maxBytes / 1024 / 1024)} MB`, `${maxPages} पेज तक · PDF ${Math.round(maxBytes / 1024 / 1024)} MB में फ़िट की जाती है`)}</p>
          {err && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700" role="alert">{err}</p>}
        </div>
        <div className="border-t border-slate-200 p-3">
          <button type="button" className={`${btn} w-full bg-emerald-600 text-sm text-white`} disabled={busy || !pages.length} onClick={make} data-testid="scan-make">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {busy ? progress || tx('Making the PDF…', 'PDF बन रही है…') : pages.length ? tx(`Make PDF (${pages.length} page${pages.length > 1 ? 's' : ''}) and use it`, `PDF बनाएँ (${pages.length} पेज) और लगाएँ`) : tx('Add at least one page', 'कम से कम एक पेज जोड़ें')}
          </button>
        </div>
      </div>
    </div>
  );
};
