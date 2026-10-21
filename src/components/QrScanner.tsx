import React, { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';
import { useTx } from '../lib/i18n.js';

/**
 * Camera QR scanner with three ways in, so it works on every phone and every hosting setup:
 *  1. live camera (needs https:// or localhost — browsers block cameras on plain http://LAN-IP)
 *  2. "Take photo of QR" — the phone's camera app via <input capture>, decoded here (works over plain http)
 *  3. type / paste the 10-character code (parent handles that)
 * Decoding: native BarcodeDetector when present, else the small `jsqr` library (loaded only when scanning starts).
 */
type Decoder = (src: HTMLVideoElement | ImageBitmap | HTMLCanvasElement) => Promise<string>;

async function makeDecoder(): Promise<Decoder> {
  const BD = (window as any).BarcodeDetector;
  if (BD) {
    try {
      const det = new BD({ formats: ['qr_code'] });
      return async (src) => { const r = await det.detect(src); return r?.[0]?.rawValue || ''; };
    } catch { /* fall through to jsqr */ }
  }
  const jsQR = (await import('jsqr')).default;
  const cv = document.createElement('canvas'); const cx = cv.getContext('2d', { willReadFrequently: true })!;
  return async (src) => {
    const w = (src as any).videoWidth || (src as any).width; const h = (src as any).videoHeight || (src as any).height;
    if (!w || !h) return '';
    const k = Math.min(1, 900 / Math.max(w, h)); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    cx.drawImage(src as CanvasImageSource, 0, 0, cv.width, cv.height);
    const img = cx.getImageData(0, 0, cv.width, cv.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data || '';
  };
}

export const QrScanner: React.FC<{ onResult: (text: string) => void; onClose: () => void }> = ({ onResult, onClose }) => {
  const tx = useTx();
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const stop = useRef<() => void>(() => undefined);
  const canCam = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;

  const startCamera = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      const v = video.current!; v.srcObject = stream; await v.play(); setLive(true);
      const decode = await makeDecoder(); let on = true;
      stop.current = () => { on = false; stream.getTracks().forEach(t => t.stop()); };
      const tick = async () => {
        if (!on) return;
        try { const t = await decode(v); if (t) { stop.current(); setLive(false); onResult(t); return; } } catch { /* keep trying */ }
        setTimeout(tick, 200);
      };
      tick();
    } catch (e: any) {
      setErr(e?.name === 'NotAllowedError' ? tx('Camera permission was denied. Allow it in the browser, or use “Take photo” below.', 'कैमरा की अनुमति नहीं मिली। ब्राउज़र में अनुमति दें, या नीचे “फ़ोटो लें” इस्तेमाल करें।') : tx('Camera could not start. Use “Take photo” below or type the code.', 'कैमरा शुरू नहीं हुआ। नीचे “फ़ोटो लें” या कोड टाइप करें।'));
    }
  };
  useEffect(() => () => stop.current(), []);

  const onFile = async (f?: File) => {
    if (!f) return; setBusy(true); setErr('');
    try {
      const bmp = await createImageBitmap(f); const decode = await makeDecoder();
      const t = await decode(bmp);
      if (t) onResult(t); else setErr(tx('No QR found in that photo — move closer, keep it sharp, and try again.', 'फ़ोटो में QR नहीं मिला — पास से, साफ़ फ़ोटो लें।'));
    } catch { setErr(tx('Could not read that photo.', 'फ़ोटो पढ़ी नहीं जा सकी।')); }
    setBusy(false);
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-300 bg-slate-950 p-3 text-white">
      <div className="flex items-center justify-between"><span className="text-xs font-bold">{tx('Scan visitor’s QR', 'विज़िटर का QR स्कैन करें')}</span><button aria-label="close" className="min-h-11 min-w-11" onClick={() => { stop.current(); onClose(); }}><X className="mx-auto h-4 w-4" /></button></div>
      <div className={`relative overflow-hidden rounded-lg bg-black ${live ? '' : 'hidden'}`}>
        <video ref={video} playsInline muted className="aspect-square w-full object-cover" />
        <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-emerald-400/80" />
      </div>
      {!live && <div className="grid gap-2">
        {canCam
          ? <button onClick={startCamera} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-bold text-slate-950"><Camera className="h-4 w-4" />{tx('Open camera', 'कैमरा खोलें')}</button>
          : <p className="rounded-lg bg-amber-500/15 p-2 text-[11px] text-amber-200">{tx('Live camera needs https:// (or localhost). Use “Take photo of QR” — it works on any link.', 'लाइव कैमरा के लिए https:// (या localhost) चाहिए। “QR की फ़ोटो लें” हर लिंक पर चलता है।')}</p>}
        <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/30 px-4 text-sm font-semibold">
          <ImagePlus className="h-4 w-4" />{busy ? tx('Reading…', 'पढ़ रहे हैं…') : tx('Take photo of QR', 'QR की फ़ोटो लें')}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>}
      {err && <p className="text-[11px] text-red-300">{err}</p>}
    </div>
  );
};
