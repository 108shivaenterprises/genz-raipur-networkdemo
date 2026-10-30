import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { qrDataUrl, drawBrandLogo } from '../lib/brandQr.js';
import { Download, Printer, Loader2, X } from 'lucide-react';
import { useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';

interface PosterData { headline: string; title: string; type: string; locality: string; city: string; area: number; price: number; tx: string; broker: { name: string; company: string; rera: string; phone: string; logo?: string } }

/** Print-ready site board: big FOR SALE / FOR RENT, price, broker contact and a QR to the public listing page. */
async function draw(canvas: HTMLCanvasElement, w: number, h: number, d: PosterData, url: string, validDays = 0) {
  canvas.width = w; canvas.height = h; const g = canvas.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  const pad = w * 0.06;
  g.fillStyle = d.tx === 'Sale' ? '#c1121f' : '#0b6e4f'; g.fillRect(0, 0, w, h * 0.17);
  g.fillStyle = '#fff'; g.font = `800 ${w * 0.115}px system-ui, sans-serif`; g.textAlign = 'center'; g.fillText(d.headline, w / 2, h * 0.115);
  { const ls = w * 0.12; await drawBrandLogo(g, pad * 0.7, (h * 0.17 - ls) / 2, ls, 'poster'); g.textAlign = 'center'; }
  g.textAlign = 'left';
  const wrap = (text: string, x: number, y: number, maxW: number, lh: number, maxLines = 2) => {
    const words = text.split(' '); let line = ''; let n = 0;
    for (const word of words) { const t = line ? line + ' ' + word : word; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); y += lh; line = word; if (++n >= maxLines) return y; } else line = t; }
    g.fillText(line, x, y); return y + lh;
  };
  g.fillStyle = '#14213d'; g.font = `700 ${w * 0.058}px system-ui, sans-serif`;
  let y = wrap(d.title, pad, h * 0.24, w - pad * 2, w * 0.07, 2);
  g.fillStyle = '#444'; g.font = `500 ${w * 0.04}px system-ui, sans-serif`;
  y = wrap(`${d.type} · ${d.locality}, ${d.city}${d.area ? ` · ${Math.round(d.area).toLocaleString('en-IN')} sq ft` : ''}`, pad, y + w * 0.01, w - pad * 2, w * 0.05, 2);
  g.fillStyle = '#c1121f'; g.font = `800 ${w * 0.11}px system-ui, sans-serif`; g.fillText(`${formatINR(d.price)}${d.tx === 'Sale' ? '' : '/mo'}`, pad, y + w * 0.1);
  // v30 — a printed board goes stale: stamp the day the price was printed (and, if chosen, the last day it is valid)
  { const fmt = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const now = Date.now(); g.fillStyle = '#6b7280'; g.font = `600 ${w * 0.03}px system-ui, sans-serif`;
    g.fillText(validDays ? `Price as on ${fmt(now)} · valid till ${fmt(now + validDays * 86_400_000)} — confirm on the QR page` : `Price as on ${fmt(now)} — confirm the latest on the QR page`, pad, y + w * 0.1 + w * 0.05); }
  // QR
  const qr = await qrDataUrl(url, { width: 600, margin: 1 });
  const qs = w * 0.4; const qy = h * 0.45;
  await new Promise<void>(res => { const im = new Image(); im.onload = () => { g.drawImage(im, (w - qs) / 2, qy, qs, qs); res(); }; im.src = qr; });
  g.strokeStyle = '#14213d'; g.lineWidth = 6; g.strokeRect((w - qs) / 2 - 12, qy - 12, qs + 24, qs + 24);
  g.textAlign = 'center'; g.fillStyle = '#14213d'; g.font = `700 ${w * 0.042}px system-ui, sans-serif`;
  g.fillText('SCAN for photos, details & enquiry', w / 2, qy + qs + w * 0.07);
  g.font = `600 ${w * 0.036}px system-ui, sans-serif`; g.fillStyle = '#444'; g.fillText('फ़ोटो, जानकारी और पूछताछ के लिए स्कैन करें', w / 2, qy + qs + w * 0.12);
  // broker
  const ch = h * 0.2; const cy = h - ch - pad * 0.5;
  g.fillStyle = '#14213d'; g.fillRect(0, cy, w, ch + pad);
  g.textAlign = 'left'; let tx = pad;
  if (d.broker.logo) await new Promise<void>(res => { const im = new Image(); im.onload = () => { const s = Math.min(ch * 0.7 / im.height, ch * 0.7 / im.width); g.fillStyle = '#fff'; g.fillRect(pad, cy + ch * 0.12, im.width * s + 16, im.height * s + 16); g.drawImage(im, pad + 8, cy + ch * 0.12 + 8, im.width * s, im.height * s); tx = pad + im.width * s + 40; res(); }; im.onerror = () => res(); im.src = d.broker.logo!; });
  g.fillStyle = '#fff'; g.font = `700 ${w * 0.048}px system-ui, sans-serif`; g.fillText(d.broker.name, tx, cy + ch * 0.3);
  g.font = `400 ${w * 0.032}px system-ui, sans-serif`; g.fillStyle = '#cbd5e1';
  if (d.broker.company) g.fillText(d.broker.company, tx, cy + ch * 0.46);
  if (d.broker.rera) g.fillText(`RERA: ${d.broker.rera}`, tx, cy + ch * 0.6);
  g.fillStyle = '#fca311'; g.font = `800 ${w * 0.078}px system-ui, sans-serif`; g.fillText(d.broker.phone, tx, cy + ch * 0.92);
}

const isLocal = (u: string) => /localhost|127\.|192\.168\.|10\.\d|172\.(1[6-9]|2\d|3[01])\./.test(u);

export const SitePoster: React.FC<{ data: PosterData; code: string; onClose: () => void }> = ({ data, code, onClose }) => {
  const tx = useTx();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [base, setBase] = useState(() => { try { return localStorage.getItem('genz.publicBase') || window.location.origin; } catch { return window.location.origin; } });
  const [busy, setBusy] = useState(true);
  const [validDays, setValidDays] = useState(15);
  const url = `${base.replace(/\/+$/, '')}/p/${code}`;
  useEffect(() => {
    let live = true; setBusy(true);
    const t = setTimeout(() => { if (canvas.current) draw(canvas.current, 1240, 1754, data, url, validDays).then(() => { if (live) setBusy(false); }); }, 250);
    try { localStorage.setItem('genz.publicBase', base); } catch { /* ignore */ }
    return () => { live = false; clearTimeout(t); };
  }, [data, url, base, validDays]);
  const png = () => canvas.current!.toDataURL('image/png');
  return (
    <div className="space-y-3 rounded-xl border border-slate-300 bg-white p-3">
      <div className="flex items-center justify-between"><h4 className="text-sm font-bold">{tx('Site poster', 'साइट पोस्टर')}</h4><button aria-label="close" onClick={onClose} className="min-h-11 min-w-11"><X className="mx-auto h-4 w-4" /></button></div>
      <label className="block text-[11px] font-semibold text-slate-600">{tx('Public web address printed in the QR', 'QR में छपने वाला वेब पता')}
        <input value={base} onChange={e => setBase(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
      <label className="block text-[11px] font-semibold text-slate-600">{tx('Price valid for', 'रेट कितने दिन मान्य')}
        <select value={validDays} onChange={e => setValidDays(Number(e.target.value))} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" data-testid="poster-valid"><option value={7}>{tx('7 days', '7 दिन')}</option><option value={15}>{tx('15 days', '15 दिन')}</option><option value={30}>{tx('30 days', '30 दिन')}</option><option value={0}>{tx('Only print “price as on” the date', 'सिर्फ़ “रेट इस तारीख़ का” छापें')}</option></select></label>
      {isLocal(base) && <p className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">{tx('This address works only on your own network. Before printing, put your real website address here (e.g. https://yourdomain.in), otherwise customers’ phones cannot open it.', 'यह पता सिर्फ़ आपके नेटवर्क पर चलता है। प्रिंट से पहले अपनी असली वेबसाइट (जैसे https://yourdomain.in) डालें, वरना ग्राहकों के फ़ोन पर नहीं खुलेगा।')}</p>}
      <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {busy && <div className="absolute inset-0 flex items-center justify-center bg-white/70"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>}
        <canvas ref={canvas} className="h-auto w-full" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-40" onClick={() => { const a = document.createElement('a'); a.href = png(); a.download = `poster-${code}.png`; a.click(); }}><Download className="h-4 w-4" />PNG</button>
        <button disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 text-sm font-semibold disabled:opacity-40" onClick={() => {
          const w = window.open('', '_blank'); if (!w) return;
          w.document.write(`<html><head><title>Poster ${code}</title><style>@page{size:A4;margin:0}body{margin:0}img{width:100%;display:block}</style></head><body><img src="${png()}" onload="setTimeout(function(){window.print()},300)"></body></html>`); w.document.close();
        }}><Printer className="h-4 w-4" />{tx('Print A4', 'A4 प्रिंट')}</button>
      </div>
      <p className="text-[10px] text-slate-500">{tx('The poster shows only marketing details and your contact — never the owner’s name, exact address or net price. Print on A3 for a bigger board.', 'पोस्टर पर सिर्फ़ मार्केटिंग जानकारी और आपका संपर्क होता है — मालिक का नाम, सटीक पता या नेट प्राइस कभी नहीं। बड़े बोर्ड के लिए A3 पर प्रिंट करें।')}</p>
    </div>
  );
};
