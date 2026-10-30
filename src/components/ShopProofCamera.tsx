import React, { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, RefreshCw } from 'lucide-react';
import { useTx } from '../lib/i18n.js';

export interface ShopProof { photo: string; geo: { lat: number; lng: number; acc: number } }

/**
 * v93 — proof the QR is really at this shop. Live camera only (no gallery pick) + the phone's GPS at that moment, stamped on the photo.
 * The server stores it privately; the shop cannot carry a second broker's QR (same mobile, or the same place and name).
 */
export const ShopProofCamera: React.FC<{ value: ShopProof | null; onChange: (p: ShopProof | null) => void }> = ({ value, onChange }) => {
  const tx = useTx();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const stop = () => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; setLive(false); };
  useEffect(() => stop, []);
  const open = async () => {
    setErr('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      stream.current = s; setLive(true);
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = s; void video.current.play().catch(() => undefined); } });
    } catch { setErr(tx('Camera is blocked. Allow camera for this site and try again.', 'कैमरा बंद है। इस साइट के लिए कैमरा चालू करें और फिर कोशिश करें।')); }
  };
  const snap = async () => {
    const v = video.current; if (!v || !v.videoWidth) return;
    setBusy(true); setErr('');
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }));
      const k = Math.min(1, 800 / v.videoWidth); const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
      const g = c.getContext('2d')!; g.drawImage(v, 0, 0, c.width, c.height);
      const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
      const bar = Math.max(22, c.height * 0.06); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, c.height - bar, c.width, bar);
      g.fillStyle = '#fff'; g.font = `${Math.round(bar * 0.5)}px system-ui, sans-serif`; g.textBaseline = 'middle';
      g.fillText(`GENZ · ${lat.toFixed(5)}, ${lng.toFixed(5)} (±${Math.round(acc)} m) · ${new Date().toLocaleString('en-IN')}`, 8, c.height - bar / 2);
      onChange({ photo: c.toDataURL('image/jpeg', 0.6), geo: { lat, lng, acc } }); stop();
    } catch (e: any) { setErr(e?.code === 1 ? tx('Location is blocked. Allow location and try again at the shop.', 'लोकेशन बंद है। चालू करके दुकान पर फिर कोशिश करें।') : tx('Could not read the location. Try again outside the shop.', 'लोकेशन नहीं मिली। दुकान के बाहर फिर कोशिश करें।')); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-slate-300 p-2" data-testid="sp-proof">
      <p className="text-xs font-semibold text-slate-800">{tx('Shop photo at the shop (live camera + GPS)', 'दुकान पर दुकान की फ़ोटो (लाइव कैमरा + GPS)')}</p>
      <p className="text-[11px] text-slate-500">{tx('Stand at the shop where the QR will go and take the photo here. One shop keeps one GENZ QR.', 'जहाँ QR लगेगा वहीं खड़े होकर यहीं फ़ोटो लें। एक दुकान पर एक ही GENZ QR रह सकता है।')}</p>
      {value ? (
        <div className="flex items-center gap-2"><img src={value.photo} alt="" className="h-16 w-24 rounded object-cover" />
          <div className="text-[11px] text-emerald-700">✔ {tx('Photo + location saved', 'फ़ोटो + लोकेशन तैयार')} (±{Math.round(value.geo.acc)} m)</div>
          <button type="button" onClick={() => { onChange(null); void open(); }} className="ml-auto inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px]"><RefreshCw className="h-3 w-3" /> {tx('Retake', 'दोबारा')}</button></div>
      ) : live ? (
        <div className="space-y-2"><video ref={video} playsInline muted className="w-full rounded bg-black" />
          <button type="button" disabled={busy} onClick={snap} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white" data-testid="sp-proof-snap">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />} {tx('Take photo', 'फ़ोटो लें')}</button></div>
      ) : (
        <button type="button" onClick={open} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 py-2 text-xs font-semibold text-slate-800" data-testid="sp-proof-open"><Camera className="h-3.5 w-3.5" /> {tx('Open camera', 'कैमरा खोलें')}</button>
      )}
      {err && <p className="text-[11px] font-semibold text-red-700" role="alert">{err}</p>}
    </div>
  );
};
