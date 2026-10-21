import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTx } from '../lib/i18n.js';
import { Loader2, Copy, MessageCircle, Download, Link2, Flame, Printer } from 'lucide-react';
import { api } from '../lib/api.js';
import { LANG_LABELS, TEMPLATE_LABELS, TEMPLATE_LABELS_HI, renderTemplate, waLink, type TemplateKind, type TemplateLang } from '../shared/templates.js';

interface Brand { displayName: string; company: string; tagline: string; reraId: string; logo: string; phone: string; city: string }
interface Source { kind: 'PROJECT' | 'PROPERTY'; id: string; title: string; sub: string; price: string; lines: string[] }

function shrinkLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 256 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Could not read the image'));
    img.src = url;
  });
}

/** Draw a branded flyer. Pure canvas, no external images (so it can always be exported). */
async function drawFlyer(canvas: HTMLCanvasElement, w: number, h: number, src: Source, brand: Brand) {
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, '#14213d'); grad.addColorStop(1, '#1f3b73');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(252,163,17,0.12)'; g.beginPath(); g.arc(w * 0.9, h * 0.12, w * 0.4, 0, Math.PI * 2); g.fill();
  const pad = w * 0.07; const tall = h > w * 1.3;
  const FONT = 'system-ui, sans-serif';
  /** split into lines that fit maxW (current font); the last line gets "…" if the text is cut */
  const lines = (text: string, maxW: number, maxLines: number): string[] => {
    const out: string[] = []; let line = ''; const words = String(text || '').split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (g.measureText(test).width > maxW && line) {
        out.push(line); line = words[i];
        if (out.length >= maxLines) { out[maxLines - 1] = out[maxLines - 1].replace(/\s*\S*$/, '') + '…'; return out; }
      } else line = test;
    }
    if (line) out.push(line);
    return out;
  };
  const maxW = w - pad * 2;
  // the broker card is fixed at the bottom; everything above must end before it — shrink the text until it fits (never overlap)
  const ch = h * (tall ? 0.2 : 0.24); const cy = h - ch - pad * 0.7;
  const limit = cy - pad * 0.45;
  const top = h * (tall ? 0.19 : 0.2);
  g.fillStyle = '#fca311'; g.font = `600 ${w * 0.034}px ${FONT}`; g.fillText(src.kind === 'PROJECT' ? 'NEW LAUNCH' : 'PROPERTY FOR YOU', pad, h * (tall ? 0.12 : 0.115));
  const body = (f: number, nBullets: number, draw: boolean): number => {
    let y = top;
    g.font = `700 ${w * 0.075 * f}px ${FONT}`; g.fillStyle = '#fff';
    for (const l of lines(src.title, maxW, 3)) { if (draw) g.fillText(l, pad, y); y += w * 0.09 * f; }
    g.font = `400 ${w * 0.04 * f}px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.8)'; y += w * 0.005 * f;
    for (const l of lines(src.sub, maxW, 2)) { if (draw) g.fillText(l, pad, y); y += w * 0.052 * f; }
    y += w * 0.06 * f;
    let ps = w * 0.09 * f; g.font = `700 ${ps}px ${FONT}`;
    while (g.measureText(src.price).width > maxW && ps > w * 0.04) { ps *= 0.94; g.font = `700 ${ps}px ${FONT}`; }
    g.fillStyle = '#fca311'; if (draw) g.fillText(src.price, pad, y); y += w * 0.085 * f;
    g.font = `500 ${w * 0.038 * f}px ${FONT}`; g.fillStyle = '#fff';
    for (const l of src.lines.slice(0, nBullets)) {
      const ls = lines(l, maxW - w * 0.04, 2);
      ls.forEach((t, i) => { if (draw) g.fillText((i === 0 ? '•  ' : '    ') + t, pad, y); y += w * 0.055 * f; });
      y += w * 0.006 * f;
    }
    return y;
  };
  let f = 1; let nb = Math.min(src.lines.length, tall ? 6 : 4);
  while (body(f, nb, false) > limit && f > 0.62) f -= 0.04;
  while (body(f, nb, false) > limit && nb > 0) nb--;   // still too long at the smallest size: show fewer points rather than overlap the card
  body(f, nb, true);
  // broker card
  g.fillStyle = '#fff'; g.beginPath(); g.roundRect(pad * 0.6, cy, w - pad * 1.2, ch, w * 0.03); g.fill();
  let tx = pad;
  if (brand.logo) {
    await new Promise<void>(res => { const im = new Image(); im.onload = () => { const s = Math.min(ch * 0.7 / im.height, ch * 0.7 / im.width); g.drawImage(im, pad, cy + ch * 0.15, im.width * s, im.height * s); tx = pad + im.width * s + w * 0.03; res(); }; im.onerror = () => res(); im.src = brand.logo; });
  }
  const room = w - pad * 0.6 - tx - pad * 0.3;           // space left of the card's right edge
  const put = (text: string, weight: number, size: number, color: string, yy: number) => {
    let px = size; g.font = `${weight} ${px}px ${FONT}`;
    while (g.measureText(text).width > room && px > size * 0.55) { px *= 0.95; g.font = `${weight} ${px}px ${FONT}`; }
    g.fillStyle = color; g.fillText(text, tx, yy);
  };
  put(brand.displayName, 700, w * 0.043, '#14213d', cy + ch * 0.32);
  if (brand.company) put(brand.company, 400, w * 0.03, '#444', cy + ch * 0.5);
  if (brand.reraId) put(`RERA: ${brand.reraId}`, 400, w * 0.03, '#444', cy + ch * 0.66);
  put(`📞 ${brand.phone}`, 700, w * 0.042, '#14213d', cy + ch * 0.88);
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-xs';

export const ShareKit: React.FC = () => {
  const tx = useTx();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [sel, setSel] = useState('');
  const [client, setClient] = useState('');
  const [lang, setLang] = useState<TemplateLang>('hi');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastUrl, setLastUrl] = useState('');
  const [tpl, setTpl] = useState<TemplateKind>('INTRO');
  const [f, setF] = useState({ phone: '', date: '', time: '', amount: '' });
  const canvas = useRef<HTMLCanvasElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [b, s, l] = await Promise.all([api.shareBrand(), api.shareSources(), api.shareLinks()]);
      setBrand(b.brand); setSources(s.sources); setLinks(l.links); if (!sel && s.sources[0]) setSel(`${s.sources[0].kind}:${s.sources[0].id}`);
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  }, [sel]);
  useEffect(() => { load(); const t = setInterval(() => api.shareLinks().then(r => setLinks(r.links)).catch(() => {}), 30000); return () => clearInterval(t); }, [load]);

  const src = useMemo(() => sources.find(s => `${s.kind}:${s.id}` === sel), [sources, sel]);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };
  const saveBrand = async () => { if (!brand) return; try { const r = await api.shareSaveBrand({ displayName: brand.displayName, tagline: brand.tagline, reraId: brand.reraId, logo: brand.logo }); setBrand(r.brand); flash(true, tx('Brand profile saved','ब्रांड प्रोफ़ाइल सेव हो गई')); } catch (e: any) { flash(false, e.message); } };

  const createLink = async () => {
    if (!src) return; setBusy(true);
    try {
      const r = await api.shareCreate({ kind: src.kind, refId: src.id, clientLabel: client, lang });
      const url = origin + r.path; setLastUrl(url); setClient(''); await load();
      flash(true, tx('Tracking link created', 'ट्रैकिंग लिंक बन गया'));
    } catch (e: any) { flash(false, e.message); } finally { setBusy(false); }
  };

  const download = async (w: number, h: number, name: string) => {
    if (!src || !brand || !canvas.current) return;
    await drawFlyer(canvas.current, w, h, src, brand);
    const a = document.createElement('a'); a.href = canvas.current.toDataURL('image/png'); a.download = `${name}-${src.id}.png`; a.click();
  };
  const printPdf = async () => {
    if (!src || !brand || !canvas.current) return;
    await drawFlyer(canvas.current, 1240, 1754, src, brand);
    const w = window.open('', '_blank'); if (!w) return flash(false, tx('Please allow pop-ups','कृपया पॉप-अप की अनुमति दें'));
    w.document.write(`<html><head><title>${src.title}</title><style>@page{size:A4;margin:0}body{margin:0}img{width:100%;display:block}</style></head><body><img src="${canvas.current.toDataURL('image/png')}" onload="setTimeout(function(){window.print()},300)"></body></html>`);
    w.document.close();
  };

  const text = brand ? renderTemplate(tpl, lang, { customer: client || undefined, broker: brand.displayName, company: brand.company, city: brand.city, project: src?.title, rera: brand.reraId, date: f.date, time: f.time, amount: f.amount }) : '';
  const shareText = lastUrl ? `${text}\n${lastUrl}` : text;

  if (!brand) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;

  return (
    <div className="space-y-5">
      <div><h2 className="text-lg font-bold text-slate-900">{tx('Share Kit', 'शेयर किट')}</h2><p className="text-xs text-slate-500">{tx('Flyers, tracked links and ready messages with your own name, RERA ID and logo — all here.','अपने नाम, RERA ID और लोगो के साथ फ़्लायर, ट्रैक्ड लिंक और तैयार संदेश — सब यहीं।')}</p></div>
      {msg && <div className={`rounded-lg px-3 py-2 text-xs font-medium ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-xs">
          <div className="text-sm font-bold">{tx('1. My brand', '1. मेरा ब्रांड')}</div>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} value={brand.displayName} onChange={e => setBrand({ ...brand, displayName: e.target.value })} placeholder={tx('Name', 'नाम')} />
            <input className={inputCls} value={brand.reraId} onChange={e => setBrand({ ...brand, reraId: e.target.value })} placeholder={tx('Your RERA ID (agent)', 'आपका RERA ID (एजेंट)')} />
            <input className={`${inputCls} col-span-2`} value={brand.tagline} onChange={e => setBrand({ ...brand, tagline: e.target.value })} placeholder={tx('Tagline (optional)', 'टैगलाइन (वैकल्पिक)')} />
          </div>
          <div className="flex items-center gap-3">
            {brand.logo && <img src={brand.logo} alt="logo" className="h-12 w-12 rounded border object-contain" />}
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={async e => { const file = e.target.files?.[0]; if (file) { try { setBrand({ ...brand, logo: await shrinkLogo(file) }); } catch (x: any) { flash(false, x.message); } } }} />
            <button onClick={() => logoRef.current?.click()} className="rounded border border-slate-300 px-2.5 py-1.5 font-semibold">{tx('Choose logo / photo', 'लोगो / फ़ोटो चुनें')}</button>
            {brand.logo && <button onClick={() => setBrand({ ...brand, logo: '' })} className="text-slate-500 underline">{tx('Remove', 'हटाएँ')}</button>}
            <button onClick={saveBrand} className="ml-auto rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white">{tx('Save', 'सेव करें')}</button>
          </div>
          <p className="text-[10px] text-slate-500">{tx('Mobile number','मोबाइल नंबर')}: {brand.phone} {tx('(from your account). It will be shown to the customer on every flyer and link.','(आपके खाते से)। यह हर फ़्लायर और लिंक पर ग्राहक को दिखेगा।')}</p>
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-xs">
          <div className="text-sm font-bold">{tx('2. What to share','2. क्या शेयर करना है')}</div>
          <select value={sel} onChange={e => setSel(e.target.value)} className={inputCls}>
            {sources.length === 0 && <option value="">{tx('No project / property available to share','शेयर करने योग्य कोई प्रोजेक्ट / प्रॉपर्टी नहीं')}</option>}
            {sources.map(s => <option key={`${s.kind}:${s.id}`} value={`${s.kind}:${s.id}`}>{s.kind === 'PROJECT' ? '🏢' : '🏠'} {s.title} — {s.sub}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} value={client} onChange={e => setClient(e.target.value)} placeholder={tx("Client name (Dr. Verma)","ग्राहक का नाम (डॉ. वर्मा)")} />
            <select className={inputCls} value={lang} onChange={e => setLang(e.target.value as TemplateLang)}>{(Object.keys(LANG_LABELS) as TemplateLang[]).map(k => <option key={k} value={k}>{LANG_LABELS[k]}</option>)}</select>
          </div>
          <button disabled={busy || !src} onClick={createLink} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white disabled:opacity-50"><Link2 className="h-4 w-4" /> {tx('Create tracking link', 'ट्रैकिंग लिंक बनाएँ')}</button>
          {lastUrl && <div className="rounded-lg bg-slate-50 p-2 break-all">{lastUrl}<div className="mt-1.5 flex gap-2"><button className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1" onClick={() => navigator.clipboard?.writeText(lastUrl)}><Copy className="h-3 w-3" /> {tx('Copy', 'कॉपी')}</button></div></div>}
          <div className="flex flex-wrap gap-2 pt-1">
            <button disabled={!src} onClick={() => download(1080, 1920, 'whatsapp-status')} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1.5 font-semibold disabled:opacity-50"><Download className="h-3.5 w-3.5" /> {tx('WhatsApp Status', 'WhatsApp स्टेटस')}</button>
            <button disabled={!src} onClick={() => download(1080, 1080, 'instagram-post')} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1.5 font-semibold disabled:opacity-50"><Download className="h-3.5 w-3.5" /> {tx('Instagram Post', 'इंस्टाग्राम पोस्ट')}</button>
            <button disabled={!src} onClick={printPdf} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1.5 font-semibold disabled:opacity-50"><Printer className="h-3.5 w-3.5" /> {tx('PDF Brochure', 'PDF ब्रोशर')}</button>
          </div>
          <p className="text-[10px] text-slate-500">{tx('For PDF, choose "Save as PDF" in the window that opens. The flyer carries only public marketing info and your contact — never the builder commission.','PDF के लिए खुलने वाली विंडो में "Save as PDF" चुनें। फ़्लायर पर केवल सार्वजनिक मार्केटिंग जानकारी और आपका संपर्क होता है — बिल्डर का कमीशन कभी नहीं।')}</p>
          <canvas ref={canvas} className="hidden" />
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-xs">
        <div className="text-sm font-bold">{tx('3. Ready message (click-to-chat)', '3. तैयार संदेश (क्लिक करके चैट)')}</div>
        <div className="grid gap-2 sm:grid-cols-5">
          <select className={inputCls} value={tpl} onChange={e => setTpl(e.target.value as TemplateKind)}>{(Object.keys(TEMPLATE_LABELS) as TemplateKind[]).map(k => <option key={k} value={k}>{tx(TEMPLATE_LABELS[k], TEMPLATE_LABELS_HI[k])}</option>)}</select>
          <input className={inputCls} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder={tx("Client mobile","ग्राहक का मोबाइल")} inputMode="numeric" />
          <input className={inputCls} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} placeholder={tx('Date', 'तारीख')} />
          <input className={inputCls} value={f.time} onChange={e => setF({ ...f, time: e.target.value })} placeholder={tx('Time', 'समय')} />
          <input className={inputCls} value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} placeholder={tx('Amount ₹', 'राशि ₹')} />
        </div>
        <textarea readOnly value={shareText} rows={4} className={`${inputCls} bg-slate-50`} />
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => navigator.clipboard?.writeText(shareText)} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2.5 py-1.5 font-semibold"><Copy className="h-3.5 w-3.5" /> {tx('Copy', 'कॉपी')}</button>
          <a href={waLink(f.phone, shareText)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1.5 font-semibold text-white"><MessageCircle className="h-3.5 w-3.5" /> {tx('Send on WhatsApp', 'WhatsApp पर भेजें')}</a>
          <span className="text-[10px] text-slate-500">{tx('These are drafts — have offer / payment messages checked by a lawyer.','ये ड्राफ़्ट हैं — ऑफ़र / भुगतान वाले संदेश किसी वकील से जँचवा लें।')}</span>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-sm font-bold">{tx('4. My links — who has seen them', '4. मेरे लिंक — किसने देखा')}</div>
        <div className="overflow-x-auto"><table className="w-full text-left text-xs">
          <thead className="text-slate-500"><tr><th className="py-1">{tx('Item', 'आइटम')}</th><th>{tx('Client', 'ग्राहक')}</th><th>{tx('Views', 'व्यू')}</th><th>{tx('Plans & pricing', 'प्लान और कीमत')}</th><th>{tx('Last seen', 'आख़िरी बार देखा')}</th><th></th></tr></thead>
          <tbody>
            {links.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-slate-400">{tx('No links yet','अभी कोई लिंक नहीं')}</td></tr>}
            {links.map(l => {
              const hot = l.views >= 2 || (l.seconds?.plans || 0) >= 30;
              return <tr key={l.token} className={`border-t border-slate-100 ${l.revoked ? 'opacity-50' : ''}`}>
                <td className="py-1.5">{l.title}</td><td>{l.clientLabel || '—'}</td>
                <td>{hot && !l.revoked && <Flame className="mr-1 inline h-3.5 w-3.5 text-orange-500" />}{l.views}</td>
                <td>{l.seconds?.plans ? `${l.seconds.plans}s` : '—'}</td>
                <td>{l.lastViewAt ? new Date(l.lastViewAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : tx('not yet','अभी नहीं')}</td>
                <td className="space-x-2 whitespace-nowrap">
                  <button onClick={() => navigator.clipboard?.writeText(`${origin}/s/${l.token}`)} className="text-slate-600 underline">{tx('copy', 'कॉपी')}</button>
                  {!l.revoked && <button onClick={async () => { await api.shareRevoke(l.token); load(); }} className="text-red-600 underline">{tx('close', 'बंद')}</button>}
                </td></tr>;
            })}
          </tbody></table></div>
        <p className="mt-2 text-[10px] text-slate-400">{tx('🔥 = 2+ views or 30+ seconds on Plans & pricing. Alerts show inside the app; WhatsApp push alerts need the WhatsApp Business API.','🔥 = 2+ व्यू या Plans & pricing पर 30+ सेकंड। अलर्ट अभी ऐप के अंदर दिखते हैं; WhatsApp पर पुश अलर्ट के लिए WhatsApp Business API चाहिए।')}</p>
      </div>
    </div>
  );
};
