/**
 * v36 — Verified Photo screens.
 *  VerifiedPhotoCard:  the broker uploads a selfie / photo; it shows on his ID card only after GENZ staff approve it.
 *  PhotoCheckAdmin:    GENZ staff queue — compare the photo with the member's ID, approve or send back with a reason.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Camera, BadgeCheck, Loader2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';

/** shrink to ~480px JPEG so the upload is small (≈40–80 KB) */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img: HTMLImageElement = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('bad image')); i.src = url; });
    const side = Math.min(img.width, img.height); const out = 480;
    const c = document.createElement('canvas'); c.width = out; c.height = out;
    c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out); // centre square crop
    return c.toDataURL('image/jpeg', 0.75);
  } finally { URL.revokeObjectURL(url); }
}

export const VerifiedPhotoCard: React.FC = () => {
  const tx = useTx();
  const [d, setD] = useState<any>(null); const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [prev, setPrev] = useState(''); const fileRef = useRef<HTMLInputElement>(null);
  const load = () => api.photoMine().then(setD).catch(() => setD(null));
  useEffect(() => { load(); }, []);
  if (!d) return null;
  const pick = async (f?: File) => { setErr(''); setOk(''); if (!f) return; try { setPrev(await shrink(f)); } catch { setErr(tx('Could not read this photo — try another.', 'यह फ़ोटो पढ़ी नहीं गई — दूसरी चुनें।')); } };
  const send = async () => {
    setBusy(true); setErr('');
    try { await api.photoUpload(prev, consent); setPrev(''); setConsent(false); setOk(tx('Sent. GENZ will compare it with your ID and tell you.', 'भेज दी। GENZ इसे आपकी ID से मिलाकर बताएगा।')); load(); }
    catch (e: any) { setErr(e?.body?.hi && document.documentElement.lang === 'hi' ? e.body.hi : e.message); } finally { setBusy(false); }
  };
  const rejected = d.latest?.status === 'REJECTED';
  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" data-testid="verified-photo">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold">{tx('My photo for the ID card', 'ID कार्ड के लिए मेरी फ़ोटो')}</h3>
        {d.approved ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800"><BadgeCheck className="h-3 w-3" />{tx('Checked by GENZ', 'GENZ ने जाँची')}</span>
          : d.pending ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{tx('GENZ is checking', 'GENZ जाँच रहा है')}</span>
          : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{tx('No photo yet', 'अभी फ़ोटो नहीं')}</span>}
      </div>
      <div className="flex items-center gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-300 bg-slate-100">
          {prev ? <img src={prev} alt="" className="h-full w-full object-cover" /> : d.url ? <img src={d.url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400"><Camera className="h-6 w-6" /></div>}
        </div>
        <div className="space-y-1 text-xs text-slate-600">
          <p>{tx('A clear photo of your face, no cap or sunglasses. It shows on your ID card only after GENZ matches it with your ID.', 'चेहरा साफ़ दिखे, टोपी या चश्मा नहीं। GENZ आपकी ID से मिला ले, तभी यह आपके ID कार्ड पर दिखेगी।')}</p>
          {rejected && <p role="alert" className="font-semibold text-red-700">{tx('Not accepted', 'स्वीकार नहीं')}: {d.latest.review?.note}</p>}
          <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={e => pick(e.target.files?.[0])} data-testid="photo-file" />
          <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 font-semibold text-slate-800"><Camera className="h-4 w-4" />{d.url || d.pending ? tx('Change photo', 'फ़ोटो बदलें') : tx('Take / choose photo', 'फ़ोटो लें / चुनें')}</button>
        </div>
      </div>
      {prev && (
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={consent} onChange={e => setConsent(e.target.checked)} data-testid="photo-consent" />{tx('I agree that GENZ keeps this photo to check my identity and show it on my ID card to other members. I can ask to erase it.', 'मैं सहमत हूँ कि GENZ मेरी पहचान जाँचने और दूसरे सदस्यों को मेरे ID कार्ड पर दिखाने के लिए यह फ़ोटो रखे। मैं इसे मिटाने को कह सकता हूँ।')}</label>
          <button type="button" disabled={!consent || busy} onClick={send} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-50" data-testid="photo-send">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Send for checking', 'जाँच के लिए भेजें')}</button>
        </div>)}
      {ok && <p className="rounded bg-emerald-50 p-2 text-xs font-medium text-emerald-800" role="status">{ok}</p>}
      {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
    </section>
  );
};

export const PhotoCheckAdmin: React.FC = () => {
  const tx = useTx();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [rej, setRej] = useState<{ id: string; text: string } | null>(null);
  const load = () => api.photoAdmin().then(setD).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const go = async (id: string, verdict: 'APPROVE' | 'REJECT', note?: string) => { setErr(''); try { await api.photoDecide(id, verdict, note); setRej(null); load(); } catch (e: any) { setErr(e.message); } };
  if (!d) return null;
  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4" data-testid="photo-check-admin">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Camera className="h-4 w-4" />{tx('Photo check', 'फ़ोटो जाँच')} {d.photos.length ? <span className="rounded-full bg-amber-100 px-2 text-[11px] text-amber-900">{d.photos.length}</span> : null}</h3>
      {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
      {d.photos.length === 0 && <p className="text-xs text-slate-500">{tx('No photo waiting.', 'कोई फ़ोटो बाकी नहीं।')}</p>}
      <ul className="space-y-3 text-xs">{d.photos.map((p: any) => (
        <li key={p.id} className="flex gap-3 rounded-lg border border-slate-200 p-2" data-testid={`photo-${p.id}`}>
          <img src={p.url} alt="" className="h-24 w-24 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0 flex-1 space-y-1">
            <p><b>{p.name}</b>{p.companyName ? ` · ${p.companyName}` : ''}</p>
            <p className="text-slate-600">{p.reraNumber ? `RERA ${p.reraNumber} · ` : ''}{p.pan ? `PAN ${p.pan} · ` : ''}{p.idSeen ? tx('ID seen by GENZ', 'ID GENZ ने देखी') : <span className="text-amber-700">{tx('ID not checked yet — check it first (Members → ID review)', 'ID अभी नहीं जाँची — पहले उसे जाँचें')}</span>}</p>
            {rej?.id === p.id
              ? <div className="flex gap-2"><input autoFocus className="min-h-9 flex-1 rounded border border-slate-300 px-2" placeholder={tx('What is wrong? (5+ characters)', 'क्या ग़लत है? (5+ अक्षर)')} value={rej!.text} onChange={e => setRej({ id: p.id, text: e.target.value })} /><button type="button" onClick={() => go(p.id, 'REJECT', rej!.text)} className="rounded bg-red-700 px-3 font-semibold text-white">{tx('Send back', 'वापस भेजें')}</button><button type="button" onClick={() => setRej(null)} className="rounded border px-2">×</button></div>
              : <div className="flex gap-2"><button type="button" onClick={() => go(p.id, 'APPROVE')} className="rounded bg-emerald-700 px-3 py-1.5 font-semibold text-white" data-testid="photo-approve">{tx('Matches the ID — approve', 'ID से मेल खाती है — मंज़ूर')}</button><button type="button" onClick={() => setRej({ id: p.id, text: '' })} className="rounded border border-slate-300 px-3 py-1.5 font-semibold">{tx('Send back…', 'वापस भेजें…')}</button></div>}
          </div>
        </li>))}</ul>
    </section>
  );
};
