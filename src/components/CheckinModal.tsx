import React, { useRef, useState } from 'react';
import { useTx } from '../lib/i18n.js';
import { Loader2, MapPin, Camera, X } from 'lucide-react';
import { api } from '../lib/api.js';

/** GPS + selfie site check-in. The selfie is shrunk in the browser (≈40 KB) before upload. */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 560; const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.55));
    };
    img.onerror = () => reject(new Error('Could not read the photo'));
    img.src = url;
  });
}

export const CheckinModal: React.FC<{ leadId?: string; defaultLabel?: string; onClose: () => void; onDone?: () => void }> = ({ leadId, defaultLabel, onClose, onDone }) => {
  const tx = useTx();
  const [label, setLabel] = useState(defaultLabel || '');
  const [selfie, setSelfie] = useState('');
  const [pos, setPos] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const locate = () => {
    setErr('');
    if (!navigator.geolocation) return setErr(tx('Location is not available on this device','इस डिवाइस पर लोकेशन उपलब्ध नहीं है'));
    navigator.geolocation.getCurrentPosition(
      p => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      e => setErr(e.code === 1 ? tx('Allow location permission (browser settings) and try again','लोकेशन की अनुमति दें (ब्राउज़र सेटिंग) और फिर कोशिश करें') : tx('Could not get location — try in the open','लोकेशन नहीं मिली — खुले में कोशिश करें')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };
  const submit = async () => {
    if (!pos) return; setBusy(true); setErr('');
    try { await api.teamCheckin({ label, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, leadId, selfie }); setDone(true); onDone?.(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-4 text-xs" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><div className="text-sm font-bold">{tx('Site check-in', 'साइट चेक-इन')}</div><button onClick={onClose}><X className="h-4 w-4" /></button></div>
        {done ? <div className="rounded-lg bg-emerald-50 p-3 font-medium text-emerald-800">{tx('Checked in. Your employer will see the location and selfie.','चेक-इन हो गया। आपके नियोक्ता को लोकेशन और सेल्फ़ी दिखेगी।')}</div> : (<>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder={tx("Site / project name","साइट / प्रोजेक्ट का नाम")} className="w-full rounded border border-slate-300 px-2 py-2" />
          <button onClick={locate} className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 py-2 font-semibold"><MapPin className="h-4 w-4" /> {pos ? tx(`Location captured (±${Math.round(pos.accuracy)} m) — retake`, `लोकेशन मिल गई (±${Math.round(pos.accuracy)} m) — दोबारा लें`) : tx('Get my location', 'मेरी लोकेशन लें')}</button>
          <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { try { setSelfie(await shrink(f)); } catch (x: any) { setErr(x.message); } } }} />
          <button onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 py-2 font-semibold"><Camera className="h-4 w-4" /> {selfie ? tx('Selfie taken — retake','सेल्फ़ी ली — बदलें') : tx('Take a selfie with the client','ग्राहक के साथ सेल्फ़ी लें')}</button>
          {selfie && <img src={selfie} alt="selfie" className="mx-auto h-28 rounded-lg object-cover" />}
          {err && <div className="rounded bg-red-50 px-2 py-1.5 text-red-700">{err}</div>}
          <button disabled={busy || !pos || !selfie || label.trim().length < 2} onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 font-semibold text-white disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Check in</button>
          <p className="text-[10px] text-slate-500">{tx('Location and selfie are visible only to your employer, are recorded in the audit trail, and are not used anywhere else.','लोकेशन और सेल्फ़ी केवल आपके नियोक्ता को दिखती हैं, ऑडिट ट्रेल में दर्ज होती हैं, और इस सुविधा के अलावा कहीं उपयोग नहीं होतीं।')}</p>
        </>)}
      </div>
    </div>
  );
};
