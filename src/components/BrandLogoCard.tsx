import React, { useEffect, useRef, useState } from 'react';
import { Loader2, ImagePlus, RotateCcw } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { resetBrandConfig } from '../lib/brandQr.js';

type Surf = 'qr' | 'poster' | 'share' | 'page';
interface Cfg { enabled: boolean; surfaces: Record<Surf, boolean>; custom: boolean; v: string }

/** v91 — superadmin: the GENZ Broker Network logo on every QR / poster / banner / post / story / public page. */
export const BrandLogoCard: React.FC = () => {
  const tx = useTx();
  const [c, setC] = useState<Cfg | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const load = () => api.brandConfig().then(setC).catch(() => undefined);
  useEffect(() => { load(); }, []);
  const save = async (b: any, ok: string) => {
    setBusy(true); setMsg('');
    try { const r = await api.brandSave(b); setC(r); resetBrandConfig(); setMsg(ok); } catch (e: any) { setMsg(e?.message || 'Failed'); } finally { setBusy(false); }
  };
  const pick = (f?: File | null) => {
    if (!f) return;
    if (f.size > 300 * 1024) { setMsg(tx('Logo must be under 300 KB', 'लोगो 300 KB से छोटा हो')); return; }
    const rd = new FileReader(); rd.onload = () => save({ image: String(rd.result) }, tx('Logo updated', 'लोगो बदल गया')); rd.readAsDataURL(f);
  };
  if (!c) return null;
  const S: [Surf, string, string][] = [
    ['qr', 'QR codes', 'सभी QR'], ['poster', 'Posters & certificates', 'पोस्टर / सर्टिफिकेट'], ['share', 'Banners · posts · stories', 'बैनर · पोस्ट · स्टोरी'], ['page', 'Public pages', 'पब्लिक पेज'],
  ];
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3" aria-label={tx('GENZ logo', 'GENZ लोगो')} data-testid="brand-logo-card">
      <div className="flex items-center gap-3">
        <img src={`/api/brand/logo?v=${encodeURIComponent(c.v)}`} alt="" className="h-12 w-12 rounded-lg border border-slate-200 object-contain" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900">{tx('GENZ Broker Network logo', 'GENZ Broker Network लोगो')}</h3>
          <p className="text-[11px] text-slate-500">{tx('Appears on every QR, poster, banner, post, story and public page. Only you (superadmin) can change it.', 'हर QR, पोस्टर, बैनर, पोस्ट, स्टोरी और पब्लिक पेज पर दिखता है। सिर्फ़ आप (सुपरएडमिन) बदल सकते हैं।')}</p>
        </div>
        <button role="switch" aria-checked={c.enabled} disabled={busy} onClick={() => save({ enabled: !c.enabled }, c.enabled ? tx('Logo OFF everywhere', 'लोगो हर जगह बंद') : tx('Logo ON', 'लोगो चालू'))}
          className={`rounded-full px-3 py-1 text-xs font-bold ${c.enabled ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>{c.enabled ? tx('ON', 'चालू') : tx('OFF', 'बंद')}</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {S.map(([k, en, hi]) => (
          <label key={k} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
            <input type="checkbox" checked={c.surfaces[k]} disabled={busy || !c.enabled} onChange={e => save({ surfaces: { [k]: e.target.checked } }, tx('Saved', 'सेव हुआ'))} /> {tx(en, hi)}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        <button disabled={busy} onClick={() => file.current?.click()} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"><ImagePlus className="h-3.5 w-3.5" /> {tx('Upload logo (PNG/JPG/WebP, ≤300 KB)', 'लोगो अपलोड (PNG/JPG/WebP, ≤300 KB)')}</button>
        {c.custom && <button disabled={busy} onClick={() => save({ image: null }, tx('Back to the GENZ mark', 'डिफ़ॉल्ट लोगो वापस'))} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"><RotateCcw className="h-3.5 w-3.5" /> {tx('Reset', 'रीसेट')}</button>}
        {busy && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        {msg && <span className="text-xs text-slate-600" role="status">{msg}</span>}
      </div>
    </section>
  );
};
