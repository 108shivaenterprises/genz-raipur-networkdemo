import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, FileLock2, Upload, Eye, Share2, Trash2, X, Download, ShieldCheck, Camera } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';

const field = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-slate-900 focus:outline-none';

/** Resize a photo / scan to max 1600px JPEG so uploads stay small on 3G. */
async function toPage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('Not an image')); i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  } finally { URL.revokeObjectURL(url); }
}

export const ProtectedDocsView: React.FC = () => {
  const tx = useTx();
  const [docs, setDocs] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [upload, setUpload] = useState(false);
  const [share, setShare] = useState<any>(null);
  const [view, setView] = useState<any>(null);
  const load = useCallback(() => api.pdocs().then(r => setDocs(r.docs)).catch(e => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const remove = async (d: any) => { if (!window.confirm(tx('Delete this document for everyone?', 'यह दस्तावेज़ सबके लिए हटाएँ?'))) return; await api.pdocDelete(d.id); load(); };
  const open = async (d: any) => { try { setView(await api.pdocOpen(d.id).then(r => ({ ...r, id: d.id }))); load(); } catch (e: any) { setErr(e.message); } };
  if (!docs) return <div className="flex justify-center py-16">{err ? <p className="text-sm text-red-700">{err}</p> : <Loader2 className="h-6 w-6 animate-spin text-slate-500" />}</div>;
  const mine = docs.filter(d => d.owner), shared = docs.filter(d => !d.owner);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-lg font-bold text-slate-900">{tx('Protected documents', 'सुरक्षित दस्तावेज़')}</h2><p className="text-xs text-slate-500">{tx('You can download. Others can only view — with their name stamped on every page.', 'आप डाउनलोड कर सकते हैं। बाकी लोग सिर्फ़ देख सकते हैं — हर पेज पर उनके नाम की मुहर के साथ।')}</p></div>
        <button onClick={() => setUpload(true)} className="inline-flex min-h-12 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white"><Upload className="h-4 w-4" aria-hidden />{tx('Add document', 'दस्तावेज़ जोड़ें')}</button>
      </div>
      {err && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{err}</p>}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700"><ShieldCheck className="mr-1 inline h-4 w-4 text-emerald-600" aria-hidden />{tx('View-only protection: people you share with cannot download or forward a document. Each viewer\'s name is stamped on every page, and every view is recorded in the activity log.', 'सिर्फ़ देखने की सुरक्षा: जिनके साथ आप शेयर करते हैं वे दस्तावेज़ डाउनलोड या फ़ॉरवर्ड नहीं कर सकते। हर देखने वाले का नाम हर पेज पर छपता है और हर बार देखना एक्टिविटी लॉग में दर्ज होता है।')}</div>

      <Section title={tx('My documents', 'मेरे दस्तावेज़')} empty={tx('No documents yet. Add title deeds, RERA certificates, approved maps.', 'अभी कोई दस्तावेज़ नहीं। टाइटल डीड, RERA सर्टिफिकेट, स्वीकृत नक्शे जोड़ें।')} items={mine}>
        {d => (<>
          <button onClick={() => open(d)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold"><Eye className="h-4 w-4" aria-hidden />{tx('Open', 'खोलें')}</button>
          <button onClick={() => setShare(d)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white"><Share2 className="h-4 w-4" aria-hidden />{tx('Share view-only', 'सिर्फ़ देखने के लिए शेयर')}</button>
          <button onClick={() => remove(d)} className="inline-flex min-h-11 items-center rounded-lg px-2 text-red-700" aria-label={tx('Delete', 'हटाएँ')}><Trash2 className="h-4 w-4" /></button>
        </>)}
      </Section>
      <Section title={tx('Shared with me (view only)', 'मेरे साथ शेयर (सिर्फ़ देखने के लिए)')} empty={tx('Nothing has been shared with you.', 'आपके साथ कुछ शेयर नहीं हुआ।')} items={shared}>
        {d => <button onClick={() => open(d)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white"><Eye className="h-4 w-4" aria-hidden />{tx('View', 'देखें')}</button>}
      </Section>
      {upload && <Upload_ onClose={() => setUpload(false)} onDone={() => { setUpload(false); load(); }} />}
      {share && <ShareSheet doc={share} onClose={() => { setShare(null); load(); }} />}
      {view && <Viewer session={view} onClose={() => setView(null)} />}
    </div>
  );
};

const Section: React.FC<{ title: string; empty: string; items: any[]; children: (d: any) => React.ReactNode }> = ({ title, empty, items, children }) => {
  const tx = useTx();
  return (
    <section><h3 className="mb-2 text-sm font-bold text-slate-900">{title}</h3>
      {items.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-xs text-slate-500">{empty}</p> : (
        <ul className="space-y-2">{items.map(d => (
          <li key={d.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start gap-2"><FileLock2 className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-900">{d.title}</div>
              <div className="text-xs text-slate-500">{d.pages} {tx('page(s)', 'पेज')}{!d.owner ? ` · ${tx('from', 'से')} ${d.ownerName}` : ''}{d.viewsLeft != null ? ` · ${tx(`${d.viewsLeft} views left`, `${d.viewsLeft} बार देख सकते हैं`)}` : ''}{d.expiresAt ? ` · ${tx('till', 'तक')} ${new Date(d.expiresAt).toLocaleDateString('en-IN')}` : ''}{d.revoked ? ` · ${tx('withdrawn', 'वापस लिया')}` : ''}</div>
              {d.viewers && d.viewers.length > 0 && <div className="mt-1 text-[11px] text-slate-500">{tx('Viewers', 'देखने वाले')}: {d.viewers.filter((v: any) => !v.revoked).map((v: any) => `${v.name} (${v.views})`).join(', ') || '—'}</div>}
            </div></div>
            <div className="mt-2 flex flex-wrap items-center gap-2">{children(d)}</div>
          </li>))}</ul>)}
    </section>
  );
};

const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  const tx = useTx();
  return (
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center" role="dialog" aria-modal="true" onClick={onClose}>
    <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between"><h3 className="text-base font-bold text-slate-900">{title}</h3><button onClick={onClose} className="rounded-lg p-2" aria-label={tx('Close', 'बंद करें')}><X className="h-5 w-5" /></button></div>{children}
    </div>
  </div>
  );
};

const Upload_: React.FC<{ onClose: () => void; onDone: () => void }> = ({ onClose, onDone }) => {
  const tx = useTx();
  const [title, setTitle] = useState(''); const [pages, setPages] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const pick = async (files: FileList | null) => {
    if (!files) return; setErr('');
    try { const next: string[] = []; for (const f of Array.from(files).slice(0, 12 - pages.length)) next.push(await toPage(f)); setPages(p => [...p, ...next].slice(0, 12)); }
    catch { setErr(tx('Please choose photos / scans (JPG or PNG). For a PDF, take a screenshot of each page.', 'फोटो / स्कैन (JPG या PNG) चुनें। PDF हो तो हर पेज का स्क्रीनशॉट लें।')); }
  };
  const go = async () => { setBusy(true); setErr(''); try { await api.pdocUpload({ title, pages }); onDone(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <Sheet title={tx('Add a protected document', 'सुरक्षित दस्तावेज़ जोड़ें')} onClose={onClose}>
      <div className="space-y-3">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={tx('Title (e.g. Sale deed – Plot 14)', 'शीर्षक (जैसे: सेल डीड – प्लॉट 14)')} className={field} maxLength={120} />
        <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-700"><Upload className="h-4 w-4" aria-hidden />{tx('Choose page photos / scans', 'पेज की फोटो / स्कैन चुनें')}<input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => { void pick(e.target.files); e.target.value = ''; }} /></label>
        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700" data-testid="pdoc-camera"><Camera className="h-4 w-4" aria-hidden />{tx('Take a photo of the next page', 'अगले पेज की फ़ोटो लें')}<input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { void pick(e.target.files); e.target.value = ''; }} /></label>
        {pages.length > 0 && <div className="flex gap-2 overflow-x-auto">{pages.map((p, i) => <div key={i} className="relative shrink-0"><img src={p} alt={`${i + 1}`} className="h-20 w-16 rounded border object-cover" /><button onClick={() => setPages(pages.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-0.5 text-white" aria-label={tx('Remove', 'हटाएँ')}><X className="h-3 w-3" /></button></div>)}</div>}
        <p className="text-[11px] text-slate-500">{tx('Up to 12 pages. Photos are shrunk on your phone before upload.', '12 पेज तक। अपलोड से पहले फोटो आपके फ़ोन पर छोटी हो जाती हैं।')}</p>
        {err && <p className="text-xs font-medium text-red-700">{err}</p>}
        <button disabled={busy || title.trim().length < 2 || pages.length === 0} onClick={go} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Save securely', 'सुरक्षित सेव करें')}</button>
      </div>
    </Sheet>
  );
};

const ShareSheet: React.FC<{ doc: any; onClose: () => void }> = ({ doc, onClose }) => {
  const tx = useTx();
  const [people, setPeople] = useState<any[]>([]); const [q, setQ] = useState(''); const [pick, setPick] = useState<string[]>([]);
  const [days, setDays] = useState('7'); const [views, setViews] = useState('3'); const [msg, setMsg] = useState(''); const [log, setLog] = useState<any[] | null>(null);
  useEffect(() => { api.pdocPeople().then(r => setPeople(r.people)).catch(() => undefined); }, []);
  const list = people.filter(p => !q || (p.name + p.company).toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  const go = async () => { try { const r = await api.pdocShare(doc.id, { userIds: pick, expiresInDays: days ? Number(days) : undefined, maxViews: views ? Number(views) : undefined }); setMsg(tx(`Shared with ${r.shared} member(s) as view-only.`, `${r.shared} सदस्यों के साथ सिर्फ़ देखने के लिए शेयर हुआ।`)); setPick([]); } catch (e: any) { setMsg(e.message); } };
  return (
    <Sheet title={doc.title} onClose={onClose}>
      <div className="space-y-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={tx('Search member or company', 'सदस्य या कंपनी खोजें')} className={field} />
        <ul className="max-h-44 space-y-1 overflow-y-auto">{list.map(p => <li key={p.id}><label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm"><input type="checkbox" checked={pick.includes(p.id)} onChange={e => setPick(e.target.checked ? [...pick, p.id] : pick.filter(x => x !== p.id))} className="h-5 w-5" /><span className="truncate">{p.name}<span className="text-xs text-slate-500"> · {p.role.replace('_', ' ').toLowerCase()}{p.company ? ` · ${p.company}` : ''}</span></span></label></li>)}</ul>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-slate-700">{tx('Access for (days)', 'कितने दिन')}<input inputMode="numeric" value={days} onChange={e => setDays(e.target.value)} className={field + ' mt-1'} /></label>
          <label className="text-xs font-semibold text-slate-700">{tx('Max views', 'अधिकतम बार')}<input inputMode="numeric" value={views} onChange={e => setViews(e.target.value)} className={field + ' mt-1'} /></label>
        </div>
        <button disabled={pick.length === 0} onClick={go} className="min-h-12 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-50">{tx(`Share with ${pick.length} (view only)`, `${pick.length} के साथ शेयर (सिर्फ़ देखने के लिए)`)}</button>
        {msg && <p className="text-xs font-medium text-emerald-800">{msg}</p>}
        {doc.viewers?.filter((v: any) => !v.revoked).length > 0 && <div><div className="text-xs font-bold text-slate-700">{tx('Who can view', 'कौन देख सकता है')}</div><ul className="mt-1 space-y-1">{doc.viewers.filter((v: any) => !v.revoked).map((v: any) => <li key={v.userId} className="flex items-center justify-between text-xs"><span>{v.name} · {v.views} {tx('views', 'बार')}</span><button onClick={async () => { await api.pdocRevoke(doc.id, v.userId); onClose(); }} className="min-h-9 rounded px-2 font-semibold text-red-700">{tx('Remove', 'हटाएँ')}</button></li>)}</ul></div>}
        <div className="flex gap-3 text-xs font-semibold">
          <button onClick={async () => setLog((await api.pdocLog(doc.id)).log)} className="min-h-10 text-slate-700 underline">{tx('Who viewed it?', 'किसने देखा?')}</button>
          <button onClick={async () => { await api.pdocRevoke(doc.id); onClose(); }} className="min-h-10 text-red-700 underline">{tx('Withdraw from everyone', 'सबसे वापस लें')}</button>
        </div>
        {log && <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-2 text-[11px]">{log.length === 0 ? <li>{tx('No views yet.', 'अभी तक किसी ने नहीं देखा।')}</li> : log.map((l, i) => <li key={i} className={l.allowed ? '' : 'text-red-700'}>{new Date(l.at).toLocaleString('en-IN')} · {l.name}{l.allowed ? '' : ` · ${tx('blocked', 'रोका गया')}`}</li>)}</ul>}
      </div>
    </Sheet>
  );
};

const LOADS = new WeakMap<object, Promise<(HTMLCanvasElement | null)[]>>();

/** Draws each page on a canvas with a tiled watermark; hides everything when the tab loses focus; blocks save / print / copy shortcuts. */
const Viewer: React.FC<{ session: any; onClose: () => void }> = ({ session, onClose }) => {
  const tx = useTx();
  const [imgs, setImgs] = useState<(HTMLCanvasElement | null)[]>([]);
  const [hidden, setHidden] = useState(false);
  const [failed, setFailed] = useState('');
  const host = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let dead = false;
    // single-use page tokens: load once per session (React StrictMode runs effects twice in development)
    let job = LOADS.get(session);
    if (!job) {
      job = (async () => {
        const out: (HTMLCanvasElement | null)[] = [];
        for (const t of session.tokens as string[]) {
          try {
            const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('x')); i.src = `/api/pdocs/page/${t}`; });
            const c = document.createElement('canvas'); const k = Math.min(1, 1000 / img.width); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            const g = c.getContext('2d')!; g.drawImage(img, 0, 0, c.width, c.height);
            g.save(); g.globalAlpha = 0.16; g.fillStyle = '#b91c1c'; g.font = `bold ${Math.max(14, Math.round(c.width / 30))}px sans-serif`; g.rotate(-Math.PI / 7);
            const step = Math.max(110, Math.round(c.width / 5));
            for (let y = -c.height; y < c.height * 1.5; y += step) for (let x = -c.width; x < c.width * 1.6; x += Math.round(c.width * 0.62)) g.fillText(session.watermark, x, y);
            g.restore();
            out.push(c);
          } catch { out.push(null); }
        }
        return out;
      })();
      LOADS.set(session, job);
    }
    job.then(out => { if (!dead) { setImgs(out); if (out.every(x => !x)) setFailed(tx('Could not load the pages. Close and open again.', 'पेज लोड नहीं हुए। बंद करके दोबारा खोलें।')); } });
    return () => { dead = true; };
  }, [session, tx]);

  useEffect(() => {
    const blur = () => setHidden(document.visibilityState !== 'visible' || !document.hasFocus());
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'c', 'u'].includes(e.key.toLowerCase())) e.preventDefault(); if (e.key === 'PrintScreen') { setHidden(true); try { navigator.clipboard?.writeText(''); } catch { /* ignore */ } } };
    const ctx = (e: Event) => e.preventDefault();
    window.addEventListener('blur', blur); window.addEventListener('focus', blur); document.addEventListener('visibilitychange', blur); window.addEventListener('keydown', key); document.addEventListener('contextmenu', ctx);
    return () => { window.removeEventListener('blur', blur); window.removeEventListener('focus', blur); document.removeEventListener('visibilitychange', blur); window.removeEventListener('keydown', key); document.removeEventListener('contextmenu', ctx); };
  }, []);

  useEffect(() => { const h = host.current; if (!h) return; h.replaceChildren(); imgs.forEach(c => { if (!c) return; c.style.cssText = 'width:100%;height:auto;display:block;margin-bottom:8px;border-radius:6px;pointer-events:none;-webkit-user-drag:none;user-select:none'; c.draggable = false; h.appendChild(c); }); }, [imgs]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950 print:hidden" style={{ userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
      <div className="flex items-center justify-between gap-2 bg-slate-900 px-4 py-3 text-white"><div className="min-w-0"><div className="truncate text-sm font-bold">{session.title}</div><div className="truncate text-[11px] text-slate-400">{tx('View only · ', 'सिर्फ़ देखने के लिए · ')}{session.watermark}</div></div>
        {session.canDownload && Array.from({ length: Math.min(session.pages, 12) }, (_, n) => <a key={n} href={`/api/pdocs/${session.id}/download/${n}`} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-white/10 px-2.5 text-xs font-semibold"><Download className="h-3.5 w-3.5" aria-hidden />{n + 1}</a>)}
        <button onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-white/10" aria-label={tx('Close', 'बंद करें')}><X className="h-5 w-5" /></button></div>
      <div className="relative flex-1 overflow-y-auto p-3">
        {imgs.length === 0 && !failed && <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>}
        {failed && <p className="py-20 text-center text-sm text-red-300">{failed}</p>}
        <div ref={host} className={`mx-auto max-w-2xl transition ${hidden ? 'blur-2xl' : ''}`} />
        {hidden && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/70 text-center text-sm font-semibold text-white">{tx('Hidden while this window is not in focus', 'यह विंडो फोकस में न होने पर छुपा रहता है')}</div>}
      </div>
    </div>
  );
};
