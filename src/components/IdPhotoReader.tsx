import React, { useEffect, useRef, useState } from 'react';
import { Camera, Images, RotateCw, Loader2, ScanText, X, CheckCircle2 } from 'lucide-react';
import { useTx } from '../lib/i18n.js';
import type { Rotation } from '../lib/scanPages.js';
import { normPan, normAadhaar, panProblem, aadhaarProblem, isValidAadhaar } from '../shared/idRules.js';
import { addressProblem, pinProblem, normAddress, normPin } from '../shared/kycRules.js';
import type { OcrFound } from '../shared/idOcrParse.js';

export interface IdFill { pan?: string; aadhaar?: string; pincode?: string; address?: string }

/**
 * v25 — “Fill from photo”: the member photographs the PAN card (front) and the Aadhaar card (front for the number, back for the address);
 * the phone reads them (OCR, in the browser — the photo is NOT uploaded) and the values appear in editable boxes. Nothing is
 * filled into the form until the member taps “Use these”, and every value can be corrected first. Aadhaar is only suggested when it passes
 * the check digit; otherwise it is shown as “please check”.
 */
export const IdPhotoReader: React.FC<{ onApply: (v: IdFill) => void; className?: string; label?: { en: string; hi: string } }> = ({ onApply, className = '', label }) => {
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const btn = className || 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700';
  return (
    <>
      <button type="button" className={btn} onClick={() => setOpen(true)} data-testid="id-photo-open"><ScanText className="h-4 w-4" />{label ? tx(label.en, label.hi) : tx('Fill from photo of card', 'कार्ड की फ़ोटो से भरें')}</button>
      {open && <Reader onClose={() => setOpen(false)} onApply={v => { setOpen(false); onApply(v); }} />}
    </>
  );
};

const Reader: React.FC<{ onClose: () => void; onApply: (v: IdFill) => void }> = ({ onClose, onApply }) => {
  const tx = useTx();
  const cam = useRef<HTMLInputElement>(null); const gal = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null); const [url, setUrl] = useState('');
  const [rotation, setRotation] = useState<Rotation>(0);
  const [busy, setBusy] = useState(false); const [pct, setPct] = useState(0); const [stage, setStage] = useState('');
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const [v, setV] = useState({ pan: '', aadhaar: '', pincode: '', address: '' });
  const [seen, setSeen] = useState<{ pan?: boolean; aadhaar?: boolean; guess?: boolean; last4?: string; address?: boolean; pin?: boolean }>({});
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose, busy]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const choose = (list: FileList | null) => {
    const f = list?.[0]; if (!f) return;
    setErr(''); setMsg('');
    if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|heic)$/i.test(f.name)) { setErr(tx('Choose a photo (JPG / PNG).', 'फ़ोटो चुनें (JPG / PNG)।')); return; }
    setFile(f); setRotation(0); setUrl(URL.createObjectURL(f));
  };

  const merge = (f: OcrFound) => {
    const s: typeof seen = {};
    setV(cur => {
      const n = { ...cur };
      if (f.pan) { n.pan = f.pan; s.pan = true; }
      if (f.aadhaar) { n.aadhaar = f.aadhaar; s.aadhaar = true; }
      else if (f.aadhaarGuess) { n.aadhaar = f.aadhaarGuess; s.guess = true; }
      if (f.aadhaarLast4 && !f.aadhaar) s.last4 = f.aadhaarLast4;
      if (f.pincode) { n.pincode = f.pincode; s.pin = true; }
      if (f.address) { n.address = f.address; s.address = true; }
      return n;
    });
    setSeen(cur => ({ ...cur, ...s }));
    return !!(f.pan || f.aadhaar || f.aadhaarGuess || f.address || f.pincode || f.aadhaarLast4);
  };

  const read = async () => {
    if (!file) return;
    setBusy(true); setErr(''); setMsg(''); setPct(0.02);
    try {
      const { readIdPhoto } = await import('../lib/ocr.js'); // the engine is fetched only now
      const out = await readIdPhoto(file, { rotation, onProgress: (p, st) => { setPct(p); setStage(st); } });
      const got = merge(out.found);
      setMsg(got
        ? tx(`Read in ${out.secs} s. Check every box below against your card, then tap “Use these”.`, `${out.secs} सेकंड में पढ़ा। नीचे हर बॉक्स को अपने कार्ड से मिलाएँ, फिर “इन्हें लगाएँ” दबाएँ।`)
        : tx('Nothing useful could be read. Hold the card flat, in good light, with all four corners in the photo — or turn the photo — and try again. You can always type by hand.', 'कुछ काम का नहीं पढ़ा जा सका। कार्ड को सीधा, अच्छी रोशनी में, चारों कोने फ़ोटो में रखकर लें — या फ़ोटो घुमाएँ — और दोबारा कोशिश करें। हाथ से भी लिख सकते हैं।'));
    } catch (e: any) {
      setErr(e?.code === 'UNSUPPORTED'
        ? tx('This phone / browser cannot read photos here. Please type the numbers by hand.', 'यह फ़ोन / ब्राउज़र यहाँ फ़ोटो नहीं पढ़ सकता। कृपया नंबर हाथ से लिखें।')
        : e?.code === 'UNREADABLE'
          ? tx('That photo could not be opened. Take it again.', 'यह फ़ोटो खुली नहीं। दोबारा लीजिए।')
          : tx('The reader could not start (slow network?). Try again, or type by hand.', 'पढ़ने वाला शुरू नहीं हुआ (नेटवर्क धीमा?)। दोबारा कोशिश करें, या हाथ से लिखें।'));
    } finally { setBusy(false); setStage(''); }
  };

  const pan = normPan(v.pan); const aad = normAadhaar(v.aadhaar);
  const panIssue = pan ? panProblem(pan) : null; const aadIssue = aad ? aadhaarProblem(aad) : null;
  const addrIssue = v.address ? addressProblem(v.address) : null; const pinIssue = v.pincode ? pinProblem(v.pincode) : null;
  const anything = !!(pan || aad || v.address || v.pincode);
  const bad = !!(panIssue || (aad && !isValidAadhaar(aad)) || addrIssue || pinIssue);
  const inp = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
  const chip = (on?: boolean, text?: string) => (on ? <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">{text || tx('read from photo', 'फ़ोटो से पढ़ा')}</span> : null);
  const stageText = stage === 'engine' ? tx('Starting the reader (first time takes longer)…', 'पढ़ने वाला शुरू हो रहा है (पहली बार ज़्यादा समय)…') : stage === 'reading' ? tx('Reading the card…', 'कार्ड पढ़ा जा रहा है…') : tx('Preparing the photo…', 'फ़ोटो तैयार हो रही है…');
  const turnedStyle = { transform: `rotate(${rotation}deg)` } as const;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={tx('Fill from photo of card', 'कार्ड की फ़ोटो से भरें')} data-testid="id-photo-reader">
      <div className="flex max-h-[94vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><ScanText className="h-5 w-5" />{tx('Fill from photo of card', 'कार्ड की फ़ोटो से भरें')}</h3>
          <button type="button" onClick={onClose} disabled={busy} aria-label={tx('Close', 'बंद करें')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <p className="rounded-lg bg-sky-50 p-2.5 text-xs text-sky-900">{tx('Photograph one card at a time: the PAN card (front), the Aadhaar card front (number) and the Aadhaar back (address). The photo is read on your phone and is NOT uploaded — use “Photo → PDF” below if you also want to attach a copy.', 'एक बार में एक कार्ड की फ़ोटो लें: PAN कार्ड (आगे), आधार कार्ड आगे (नंबर) और आधार पीछे (पता)। फ़ोटो आपके फ़ोन पर ही पढ़ी जाती है और अपलोड नहीं होती — कॉपी लगानी हो तो नीचे “फ़ोटो → PDF” का इस्तेमाल करें।')}</p>
          <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { choose(e.target.files); e.target.value = ''; }} />
          <input ref={gal} type="file" accept="image/*" className="hidden" onChange={e => { choose(e.target.files); e.target.value = ''; }} data-testid="id-photo-file" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => cam.current?.click()} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-40"><Camera className="h-4 w-4" />{tx('Take photo', 'फ़ोटो लें')}</button>
            <button type="button" disabled={busy} onClick={() => gal.current?.click()} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-40"><Images className="h-4 w-4" />{tx('From gallery', 'गैलरी से')}</button>
          </div>

          {file && (
            <div className="space-y-2 rounded-lg border border-slate-200 p-2">
              <div className="flex h-40 items-center justify-center overflow-hidden rounded bg-slate-100"><img src={url} alt={tx('Your card photo', 'आपके कार्ड की फ़ोटो')} className="max-h-full max-w-full object-contain transition-transform" style={turnedStyle} /></div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={busy} onClick={() => setRotation(r => (((r + 90) % 360) as Rotation))} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-40"><RotateCw className="h-4 w-4" />{tx('Turn', 'घुमाएँ')}</button>
                <button type="button" disabled={busy} onClick={read} data-testid="id-photo-read" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}{busy ? tx('Reading…', 'पढ़ रहे हैं…') : tx('Read this photo', 'यह फ़ोटो पढ़ें')}</button>
              </div>
              {busy && <div aria-live="polite"><div className="h-2 overflow-hidden rounded bg-slate-100"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round(pct * 100)}%` }} /></div><p className="mt-1 text-[11px] text-slate-500">{stageText}</p></div>}
            </div>
          )}

          {err && <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{err}</p>}
          {msg && <p role="status" className="rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-900"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />{msg}</p>}

          <div className="space-y-2" data-testid="id-photo-values">
            <label className="block text-xs font-semibold text-slate-700">PAN{chip(seen.pan)}
              <input className={inp + ' font-mono'} maxLength={10} value={v.pan} onChange={e => setV({ ...v, pan: e.target.value.toUpperCase().replace(/\s/g, '') })} aria-invalid={!!panIssue} data-testid="id-photo-pan" />
              {panIssue && <span role="alert" className="mt-1 block text-[11px] font-medium text-red-700">{tx(panIssue.en, panIssue.hi)}</span>}
            </label>
            <label className="block text-xs font-semibold text-slate-700">{tx('Aadhaar number', 'आधार नंबर')}{chip(seen.aadhaar)}{seen.guess && !seen.aadhaar && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">{tx('please check every digit', 'हर अंक मिलाएँ')}</span>}
              <input className={inp + ' font-mono tracking-wider'} inputMode="numeric" maxLength={14} value={v.aadhaar} onChange={e => setV({ ...v, aadhaar: e.target.value.replace(/[^\d\s-]/g, '') })} aria-invalid={!!aadIssue} data-testid="id-photo-aadhaar" />
              {aadIssue && <span role="alert" className="mt-1 block text-[11px] font-medium text-red-700">{tx(aadIssue.en, aadIssue.hi)}</span>}
              {seen.last4 && !seen.aadhaar && !seen.guess && <span className="mt-1 block text-[11px] text-slate-600">{tx(`This card is masked (only …${seen.last4} is visible). Type the full number from your original card.`, `यह कार्ड मास्क्ड है (सिर्फ़ …${seen.last4} दिख रहा है)। पूरा नंबर अपने असली कार्ड से लिखें।`)}</span>}
            </label>
            <label className="block text-xs font-semibold text-slate-700">{tx('Address (as on Aadhaar)', 'पता (जैसा आधार में है)')}{chip(seen.address)}
              <textarea className={inp} rows={3} maxLength={320} value={v.address} onChange={e => setV({ ...v, address: e.target.value })} aria-invalid={!!addrIssue} data-testid="id-photo-address" />
              {addrIssue && <span role="alert" className="mt-1 block text-[11px] font-medium text-red-700">{tx(addrIssue.en, addrIssue.hi)}</span>}
            </label>
            <label className="block text-xs font-semibold text-slate-700">{tx('PIN code', 'PIN कोड')}{chip(seen.pin)}
              <input className={inp + ' font-mono'} inputMode="numeric" maxLength={6} value={v.pincode} onChange={e => setV({ ...v, pincode: e.target.value.replace(/\D/g, '') })} aria-invalid={!!pinIssue} />
              {pinIssue && <span role="alert" className="mt-1 block text-[11px] font-medium text-red-700">{tx(pinIssue.en, pinIssue.hi)}</span>}
            </label>
            <p className="text-[11px] text-slate-500">{tx('The reader is a machine: it can mix up 0/O, 1/I, 5/S and 8/B. Always compare with the card. (English text only — a Hindi address line is not read.)', 'पढ़ने वाली मशीन है: वह 0/O, 1/I, 5/S, 8/B में गड़बड़ कर सकती है। हमेशा कार्ड से मिलाएँ। (सिर्फ़ अंग्रेज़ी लिखावट — हिंदी में लिखा पता नहीं पढ़ा जाता।)')}</p>
          </div>
        </div>
        <div className="border-t border-slate-200 p-3">
          <button type="button" disabled={busy || !anything || bad} data-testid="id-photo-apply"
            onClick={() => onApply({ ...(pan ? { pan } : {}), ...(aad ? { aadhaar: aad } : {}), ...(v.pincode ? { pincode: normPin(v.pincode) } : {}), ...(v.address ? { address: normAddress(v.address) } : {}) })}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-40">
            {anything ? (bad ? tx('Fix the red boxes first', 'पहले लाल बॉक्स ठीक करें') : tx('Use these', 'इन्हें लगाएँ')) : tx('Read a photo first', 'पहले फ़ोटो पढ़ें')}
          </button>
        </div>
      </div>
    </div>
  );
};
