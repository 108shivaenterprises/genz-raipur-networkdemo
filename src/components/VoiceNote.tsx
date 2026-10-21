/**
 * v30 — speak a buyer need instead of typing it ("3BHK chahiye Wakad mein, budget 1.2 Cr"). Uses the browser's own speech
 * recognition (nothing to install, no extra server). The spoken words only fill the paste box — the broker reads and corrects
 * them, and the same “Make drafts” step turns them into a Buyer Need. Chrome / Edge / Android send the audio to the browser
 * maker's speech service, so the screen says so; where the browser has no speech recognition the button explains instead.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { useTx } from '../lib/i18n.js';

type Rec = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
const Ctor = (): (new () => Rec) | null => { try { const w = window as any; return w.SpeechRecognition || w.webkitSpeechRecognition || null; } catch { return null; } };

export const VoiceNote: React.FC<{ onText: (spoken: string) => void }> = ({ onText }) => {
  const tx = useTx();
  const [on, setOn] = useState(false); const [lang, setLang] = useState<'en-IN' | 'hi-IN'>('en-IN'); const [msg, setMsg] = useState(''); const [live, setLive] = useState('');
  const rec = useRef<Rec | null>(null);
  useEffect(() => () => { try { rec.current?.stop(); } catch { /* already stopped */ } }, []);
  const start = () => {
    const C = Ctor();
    if (!C) { setMsg(tx('This browser cannot listen. Open GENZ in Chrome on your phone, or type / paste the need.', 'यह ब्राउज़र सुन नहीं सकता। फ़ोन के Chrome में GENZ खोलें, या ज़रूरत टाइप / पेस्ट करें।')); return; }
    setMsg(''); setLive('');
    const r = new C(); r.lang = lang; r.interimResults = true; r.continuous = true;
    r.onresult = (e: any) => {
      let fin = ''; let tmp = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const t = String(e.results[i][0]?.transcript || ''); if (e.results[i].isFinal) fin += t + ' '; else tmp += t; }
      if (fin.trim()) onText(fin.trim());
      setLive(tmp);
    };
    r.onerror = (e: any) => { setMsg(e?.error === 'not-allowed' ? tx('Microphone is blocked. Allow it in the browser’s site settings.', 'माइक बंद है। ब्राउज़र की साइट सेटिंग में चालू करें।') : tx('Could not hear properly — try again.', 'ठीक से सुनाई नहीं दिया — दोबारा बोलें।')); setOn(false); };
    r.onend = () => { setOn(false); setLive(''); };
    try { r.start(); rec.current = r; setOn(true); } catch { setMsg(tx('Could not start the microphone.', 'माइक शुरू नहीं हो सका।')); }
  };
  const stop = () => { try { rec.current?.stop(); } catch { /* already stopped */ } setOn(false); };
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2" data-testid="voice-note">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={on ? stop : start} className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${on ? 'bg-red-600 text-white' : 'bg-white text-slate-800 border border-slate-300'}`} data-testid="voice-btn">
          {on ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}{on ? tx('Stop', 'रोकें') : tx('Speak the need', 'बोलकर ज़रूरत लिखें')}
        </button>
        <select value={lang} onChange={e => setLang(e.target.value as any)} disabled={on} className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-xs" aria-label={tx('Speaking language', 'बोलने की भाषा')}>
          <option value="en-IN">{tx('Hinglish / English', 'हिंग्लिश / अंग्रेज़ी')}</option><option value="hi-IN">{tx('Hindi', 'हिन्दी')}</option>
        </select>
        {on && <span className="text-[11px] font-medium text-red-700" aria-live="polite">● {tx('Listening…', 'सुन रहा है…')} {live}</span>}
      </div>
      {msg && <p className="mt-1 text-[11px] text-red-700" role="alert">{msg}</p>}
      <p className="mt-1 text-[10px] text-slate-500">{tx('Say: type, area, budget — e.g. “3 BHK flat chahiye Shankar Nagar Raipur, budget 60 lakh”. Your browser’s speech service hears the audio; GENZ only receives the text you keep. Do not say the client’s mobile number aloud — type it in the next step.', 'बोलें: प्रकार, इलाका, बजट — जैसे “3 BHK flat chahiye Shankar Nagar Raipur, budget 60 lakh”। आवाज़ आपके ब्राउज़र की स्पीच सर्विस सुनती है; GENZ को सिर्फ़ वही टेक्स्ट मिलता है जो आप रखते हैं। क्लाइंट का मोबाइल नंबर बोलकर न लिखवाएँ — अगले स्टेप में टाइप करें।')}</p>
    </div>
  );
};
