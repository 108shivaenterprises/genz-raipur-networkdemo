import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, FileText, Image as ImageIcon, Upload, Search, Share2, Trash2, X, Download, Eye, ShieldCheck, History, Pencil, Lock, Users, Globe2, CheckCircle2, AlertTriangle, FolderOpen, FileLock2, Unlock } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { PROP_DOC_TYPES, propDocTypeLabel } from '../shared/propDocs.js';
import { preparePaper, titleFromFile, guessType, fmtSize, PREFILL_KEY } from '../lib/paperFile.js';
import { ScanToPdf } from './ScanToPdf.js';
import { PROP_DOC_MAX_BYTES } from '../shared/propDocs.js';
import { WatermarkViewer, type ViewSession } from './WatermarkViewer.js';
import { ProtectedDocsView } from './ProtectedDocsView.js';

const paperPage = (t: string) => `/api/property-docs/view/${t}`;
/** the server's Hindi line when it sent one */
const errText = (e: any, hi: boolean) => (hi && e?.body?.hi) || e?.message || 'Error';

const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base focus:border-slate-900 focus:outline-none';
const btn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold';
type Vis = 'PRIVATE' | 'DEAL_PARTICIPANTS' | 'VERIFIED_BROKERS';

const VisBadge: React.FC<{ v: Vis }> = ({ v }) => {
  const tx = useTx();
  const m = v === 'PRIVATE'
    ? { icon: <Lock className="h-3 w-3" aria-hidden />, text: tx('Private', 'निजी'), cls: 'bg-slate-100 text-slate-700' }
    : v === 'DEAL_PARTICIPANTS'
      ? { icon: <Users className="h-3 w-3" aria-hidden />, text: tx('Deal partners', 'डील के साथी'), cls: 'bg-amber-100 text-amber-800' }
      : { icon: <Globe2 className="h-3 w-3" aria-hidden />, text: tx('All verified brokers', 'सभी वेरिफ़ाइड ब्रोकर'), cls: 'bg-rose-100 text-rose-800' };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.cls}`}>{m.icon}{m.text}</span>;
};

/** v49 — `withProtected`: the person also has Protected Docs; they now live here as a second section (the old tab opens this one). */
export const PropertyPapersView: React.FC<{ withProtected?: boolean }> = ({ withProtected = false }) => {
  const tx = useTx();
  const { lang } = useI18n();
  const hi = lang === 'hi';
  const [section, setSection] = useState<'papers' | 'protected'>(() => {
    try { return withProtected && new URLSearchParams(window.location.search).get('sub') === 'protected' ? 'protected' : 'papers'; } catch { return 'papers'; }
  });
  const [viewing, setViewing] = useState<(ViewSession & { id: string; canDownload: boolean; fileName?: string }) | null>(null);
  const [busyId, setBusyId] = useState('');
  const [meta, setMeta] = useState<any>(null);
  const [docs, setDocs] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [type, setType] = useState('');
  const [scope, setScope] = useState<'all' | 'mine' | 'shared'>('all');
  const [upload, setUpload] = useState(false);
  const [share, setShare] = useState<any>(null);
  const [logFor, setLogFor] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const [toast, setToast] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    api.propDocsMeta().then(setMeta).catch(e => setErr(e.message));
    try { const pre = sessionStorage.getItem(PREFILL_KEY); if (pre) { setPropertyId(pre); sessionStorage.removeItem(PREFILL_KEY); } } catch { /* ignore */ }
  }, []);

  /** v49 — open a paper in the stamped viewer: the opener's own name · ••mobile · time on every page */
  const openViewer = useCallback(async (id: string) => {
    setBusyId(id); setErr('');
    try { const s = await api.propDocView(id); setViewing({ ...s, id }); }
    catch (e: any) { setErr(errText(e, hi)); }
    finally { setBusyId(''); }
  }, [hi]);
  const closeViewer = useCallback(() => setViewing(null), []);
  // a link to a protected paper (?view=PD-…) opens it here
  useEffect(() => {
    try {
      const u = new URL(window.location.href); const id = u.searchParams.get('view');
      if (id && /^PD-[A-Z0-9]+$/i.test(id)) { u.searchParams.delete('view'); window.history.replaceState(null, '', u.toString()); openViewer(id); }
      if (u.searchParams.get('sub')) { u.searchParams.delete('sub'); window.history.replaceState(null, '', u.toString()); }
    } catch { /* old browser */ }
  }, [openViewer]);
  const setProtect = async (d: any, on: boolean) => {
    if (!on && !window.confirm(tx('Remove protection? Everyone this paper is shared with can then open the original file and download it.', 'सुरक्षा हटाएँ? फिर जिनके साथ यह कागज़ शेयर है वे असली फ़ाइल खोल और डाउनलोड कर सकेंगे।'))) return;
    setBusyId(d.id); setErr('');
    try { await api.propDocEdit(d.id, { protect: on }); flash(on ? tx('Protected — others can only view it, with their name stamped on it', 'सुरक्षित — बाकी लोग सिर्फ़ देख सकेंगे, उन पर उनका नाम छपेगा') : tx('Protection removed', 'सुरक्षा हटा दी')); load(); }
    catch (e: any) { setErr(errText(e, hi)); }
    finally { setBusyId(''); }
  };

  const load = useCallback(() => {
    const my = ++seq.current;
    api.propDocs({ q: q.trim(), propertyId, type, scope: scope === 'all' ? '' : scope })
      .then(r => { if (my === seq.current) { setDocs(r.docs); setErr(''); } })
      .catch(e => { if (my === seq.current) setErr(e.message); });
  }, [q, propertyId, type, scope]);
  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };
  const remove = async (d: any) => {
    if (!window.confirm(tx(`Delete “${d.title}” permanently? The file is removed from the server for everyone.`, `“${d.title}” हमेशा के लिए हटाएँ? फ़ाइल सर्वर से सबके लिए मिट जाएगी।`))) return;
    try { await api.propDocDelete(d.id); flash(tx('Deleted', 'हटा दिया')); load(); api.propDocsMeta().then(setMeta).catch(() => undefined); }
    catch (e: any) { setErr(e.message); }
  };

  const propsForFilter = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of meta?.properties || []) seen.set(p.id, `${p.title} — ${p.locality}`);
    for (const d of docs || []) if (!seen.has(d.propertyId)) seen.set(d.propertyId, `${d.propertyTitle} — ${d.locality}`);
    return [...seen.entries()];
  }, [meta, docs]);

  if (!meta && !err) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  const canUpload = (meta?.properties || []).length > 0;
  const pct = meta ? Math.min(100, Math.round((meta.usedBytes / meta.maxBytes) * 100)) : 0;

  const switcher = withProtected && (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" data-testid="papers-sections">
      {([['papers', <FolderOpen key="f" className="h-4 w-4" aria-hidden />, tx('Property papers', 'प्रॉपर्टी पेपर्स')], ['protected', <FileLock2 key="l" className="h-4 w-4" aria-hidden />, tx('Other protected docs', 'अन्य सुरक्षित दस्तावेज़')]] as const).map(([id, icon, label]) => (
        <button key={id} role="tab" aria-selected={section === id} onClick={() => setSection(id)} data-testid={`papers-section-${id}`}
          className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold ${section === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>{icon}{label}</button>
      ))}
    </div>
  );
  if (section === 'protected') return <div className="space-y-4">{switcher}<ProtectedDocsView /></div>;

  return (
    <div className="space-y-4">
      {switcher}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><FolderOpen className="h-5 w-5 text-amber-600" aria-hidden />{tx('Property Papers', 'प्रॉपर्टी पेपर्स')}</h2>
          <p className="text-xs text-slate-500">{tx('Keep every paper of your property in one place — upload once, find it by searching, share it here instead of on WhatsApp.', 'प्रॉपर्टी के सारे कागज़ एक जगह — एक बार अपलोड करें, सर्च से ढूँढें, WhatsApp की जगह यहीं शेयर करें।')}</p>
        </div>
        {canUpload && <button onClick={() => setUpload(true)} className={`${btn} bg-slate-900 px-4 text-sm text-white`}><Upload className="h-4 w-4" aria-hidden />{tx('Add papers', 'कागज़ जोड़ें')}</button>}
      </div>

      {err && <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{err}</p>}
      {toast && <p role="status" className="rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-800">{toast}</p>}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <ShieldCheck className="mr-1 inline h-4 w-4 text-emerald-600" aria-hidden />
        {tx('Papers are private by default: only you, this property’s owner and listing broker, and GENZ admins (for compliance) can open them. Everyone else needs your share. Every open is logged and you can read the log. Do not upload Aadhaar / PAN copies — if a paper has them, hide the numbers first.',
          'कागज़ डिफ़ॉल्ट रूप से निजी हैं: सिर्फ़ आप, इस प्रॉपर्टी का मालिक व लिस्टिंग ब्रोकर और GENZ एडमिन (कंप्लायंस के लिए) खोल सकते हैं। बाकी को आपका शेयर चाहिए। हर बार खोलने का लॉग बनता है जिसे आप देख सकते हैं। आधार / PAN की कॉपी अपलोड न करें — अगर किसी कागज़ में हैं तो पहले नंबर ढक दें।')}
        <span className="mt-1 block font-medium text-slate-800" data-testid="protect-help"><FileLock2 className="mr-1 inline h-3.5 w-3.5 text-rose-700" aria-hidden />{tx('🔒 Protect a paper and the people you share it with can only VIEW it here — with their own name and mobile stamped across every page. They cannot download or forward the file.', '🔒 कागज़ को “सुरक्षित” करें — जिनके साथ शेयर करेंगे वे इसे सिर्फ़ यहीं देख पाएँगे, हर पेज पर उनका अपना नाम और मोबाइल छपा होगा। फ़ाइल डाउनलोड या फ़ॉरवर्ड नहीं कर पाएँगे।')}</span>
        {meta && <span className="ml-1 text-slate-500">· {tx('Storage used', 'स्टोरेज')}: {fmtSize(meta.usedBytes)} / {fmtSize(meta.maxBytes)} ({pct}%)</span>}
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" aria-hidden />
          <input value={q} onChange={e => setQ(e.target.value)} aria-label={tx('Search papers', 'कागज़ खोजें')} className={`${field} pl-9`}
            placeholder={tx('Search: registry, khasra 142, Shankar Nagar, NOC, रजिस्ट्री…', 'खोजें: रजिस्ट्री, खसरा 142, शंकर नगर, NOC…')} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select value={propertyId} onChange={e => setPropertyId(e.target.value)} className={field} aria-label={tx('Property', 'प्रॉपर्टी')}>
            <option value="">{tx('All properties', 'सभी प्रॉपर्टी')}</option>
            {propsForFilter.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select value={type} onChange={e => setType(e.target.value)} className={field} aria-label={tx('Paper type', 'कागज़ का प्रकार')}>
            <option value="">{tx('All types', 'सभी प्रकार')}</option>
            {PROP_DOC_TYPES.map(t => <option key={t.id} value={t.id}>{hi ? t.hi : t.en}</option>)}
          </select>
        </div>
        <div className="flex gap-1.5" role="tablist">
          {([['all', tx('All', 'सभी')], ['mine', tx('Of my properties', 'मेरी प्रॉपर्टी के')], ['shared', tx('Shared with me', 'मेरे साथ शेयर')]] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={scope === id} onClick={() => setScope(id)}
              className={`min-h-11 rounded-full border px-3 text-xs font-semibold ${scope === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{label}</button>
          ))}
        </div>
      </div>

      {!docs ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div>
        : docs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-slate-700">{q || propertyId || type || scope !== 'all' ? tx('No paper matches this search.', 'इस खोज से कोई कागज़ नहीं मिला।') : tx('No papers yet.', 'अभी कोई कागज़ नहीं।')}</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">{canUpload
              ? tx('Add the registry, khasra / B-1, map, tax receipt, NOC… Anyone you share with can open them here — no more WhatsApp forwards.', 'रजिस्ट्री, खसरा / B-1, नक्शा, टैक्स रसीद, NOC… जोड़ें। जिनसे शेयर करेंगे वे यहीं खोल लेंगे — WhatsApp पर फ़ॉरवर्ड की ज़रूरत नहीं।')
              : tx('Papers that other members share with you will appear here.', 'दूसरे सदस्य जो कागज़ आपसे शेयर करेंगे वे यहाँ दिखेंगे।')}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {docs.map(d => (
              <li key={d.id} className="rounded-xl border border-slate-200 bg-white p-3" data-testid="paper-row">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    {d.mime === 'application/pdf' ? <FileText className="h-5 w-5" aria-hidden /> : <ImageIcon className="h-5 w-5" aria-hidden />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-bold text-slate-900">{d.title}</p>
                    <p className="text-xs text-slate-600">{propDocTypeLabel(d.type, hi)}{d.refNo ? ` · ${d.refNo}` : ''}</p>
                    <p className="text-xs text-slate-500">{d.propertyTitle}{d.locality ? ` — ${d.locality}` : ''}{d.city ? `, ${d.city}` : ''}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <VisBadge v={d.visibility} />
                      {d.protect && <span className="inline-flex items-center gap-1 rounded-full bg-rose-700 px-2 py-0.5 text-[10px] font-semibold text-white" data-testid="paper-protected"><FileLock2 className="h-3 w-3" aria-hidden />{tx('Protected · view only', 'सुरक्षित · सिर्फ़ देखने के लिए')}</span>}
                      {d.ddItemId && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-800">{tx('Due-diligence evidence', 'ड्यू डिलिजेंस का सबूत')}</span>}
                      {d.tags.map((t: string) => <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">#{t}</span>)}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {fmtSize(d.size)} · {new Date(d.createdAt).toLocaleDateString(hi ? 'hi-IN' : 'en-IN')} · {d.mine ? tx('uploaded by you', 'आपने जोड़ा') : tx(`from ${d.uploaderName}`, `${d.uploaderName} की ओर से`)}
                      {d.shares?.length ? ` · ${tx(`shared with ${d.shares.length}`, `${d.shares.length} को शेयर`)}` : ''}
                    </p>
                    {d.note && <p className="mt-1 text-xs italic text-slate-600">{d.note}</p>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {/* v49 — photos and protected papers open in the stamped viewer; an unprotected PDF opens as before */}
                  {d.protect || d.mime !== 'application/pdf'
                    ? <button type="button" onClick={() => openViewer(d.id)} disabled={busyId === d.id} className={`${btn} border border-slate-300 text-slate-800`} data-testid="paper-open">{busyId === d.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}{tx('Open', 'खोलें')}</button>
                    : <a href={`/api/property-docs/${d.id}/file`} target="_blank" rel="noopener noreferrer" className={`${btn} border border-slate-300 text-slate-800`} data-testid="paper-open"><Eye className="h-4 w-4" aria-hidden />{tx('Open', 'खोलें')}</a>}
                  {d.canDownload && <a href={`/api/property-docs/${d.id}/file?dl=1`} className={`${btn} border border-slate-300 text-slate-800`}><Download className="h-4 w-4" aria-hidden />{tx('Download', 'डाउनलोड')}</a>}
                  {d.canManage && (d.protect
                    ? <button type="button" onClick={() => setProtect(d, false)} disabled={busyId === d.id} className={`${btn} border border-rose-300 text-rose-800`} data-testid="paper-unprotect"><Unlock className="h-4 w-4" aria-hidden />{tx('Unprotect', 'सुरक्षा हटाएँ')}</button>
                    : <button type="button" onClick={() => setProtect(d, true)} disabled={busyId === d.id} className={`${btn} border border-rose-300 bg-rose-50 text-rose-800`} data-testid="paper-protect"><FileLock2 className="h-4 w-4" aria-hidden />{tx('Protect', 'सुरक्षित करें')}</button>)}
                  {d.canManage && <>
                    <button onClick={() => setShare(d)} className={`${btn} bg-slate-900 text-white`}><Share2 className="h-4 w-4" aria-hidden />{tx('Share', 'शेयर')}</button>
                    <button onClick={() => setEdit(d)} className={`${btn} border border-slate-300 text-slate-800`}><Pencil className="h-4 w-4" aria-hidden />{tx('Edit', 'बदलें')}</button>
                    <button onClick={() => setLogFor(d)} className={`${btn} border border-slate-300 text-slate-800`}><History className="h-4 w-4" aria-hidden />{tx('Who opened', 'किसने खोला')}</button>
                    <button onClick={() => remove(d)} className={`${btn} text-red-700`} aria-label={tx('Delete', 'हटाएँ')}><Trash2 className="h-4 w-4" aria-hidden /></button>
                  </>}
                </div>
              </li>
            ))}
          </ul>
        )}

      {upload && <UploadSheet meta={meta} presetProperty={propertyId} onClose={() => setUpload(false)} onDone={n => { setUpload(false); flash(tx(`${n} paper(s) added`, `${n} कागज़ जुड़ गए`)); load(); api.propDocsMeta().then(setMeta).catch(() => undefined); }} />}
      {share && <ShareSheet doc={share} onClose={() => { setShare(null); load(); }} />}
      {logFor && <LogSheet doc={logFor} onClose={() => setLogFor(null)} />}
      {edit && <EditSheet doc={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />}
      {viewing && <WatermarkViewer session={viewing} pageUrl={paperPage} onClose={closeViewer}
        downloads={viewing.canDownload ? [{ label: tx('Original', 'मूल फ़ाइल'), href: `/api/property-docs/${viewing.id}/file?dl=1` }] : undefined} />}
    </div>
  );
};

const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  const tx = useTx();
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} aria-label={tx('Close', 'बंद करें')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
};

type Row = { file: File; title: string; type: string; refNo: string; state: 'ready' | 'busy' | 'done' | 'error'; msg?: string };

const UploadSheet: React.FC<{ meta: any; presetProperty: string; onClose: () => void; onDone: (n: number) => void }> = ({ meta, presetProperty, onClose, onDone }) => {
  const tx = useTx();
  const { lang } = useI18n();
  const props: any[] = meta?.properties || [];
  const [propertyId, setPropertyId] = useState(props.find(p => p.id === presetProperty)?.id || (props.length === 1 ? props[0].id : ''));
  const [rows, setRows] = useState<Row[]>([]);
  const [visibility, setVisibility] = useState<Vis>('PRIVATE');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');
  const [attest, setAttest] = useState(false);
  const [protect, setProtect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState(false);

  const add = (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files).slice(0, 20); // copy NOW: the input is cleared right after, which empties the live FileList
    setRows(r => [...r, ...list.map(f => ({ file: f, title: titleFromFile(f.name), type: guessType(f.name), refNo: '', state: 'ready' as const }))].slice(0, 20));
  };
  const patch = (i: number, p: Partial<Row>) => setRows(r => r.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const go = async () => {
    setError('');
    if (!propertyId) return setError(tx('Choose the property these papers belong to.', 'चुनें कि ये कागज़ किस प्रॉपर्टी के हैं।'));
    if (!rows.length) return setError(tx('Choose at least one file.', 'कम से कम एक फ़ाइल चुनें।'));
    if (rows.some(r => r.state !== 'done' && r.title.trim().length < 2)) return setError(tx('Every paper needs a title.', 'हर कागज़ का एक नाम होना चाहिए।'));
    if (!attest) return setError(tx('Please tick the confirmation box.', 'कृपया पुष्टि वाला बॉक्स टिक करें।'));
    setBusy(true);
    let ok = rows.filter(r => r.state === 'done').length;
    let failed = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].state === 'done') continue;
      patch(i, { state: 'busy', msg: undefined });
      try {
        const p = await preparePaper(rows[i].file, lang === 'hi' ? 'hi' : 'en');
        await api.propDocUpload({
          propertyId, type: rows[i].type, title: rows[i].title.trim(), refNo: rows[i].refNo.trim() || undefined,
          tags: tags.split(',').map(t => t.trim()).filter(Boolean), note: note.trim() || undefined,
          fileName: p.fileName, data: p.data, visibility, attest: true, ...(protect ? { protect: true } : {}),
        });
        patch(i, { state: 'done' }); ok++;
      } catch (e: any) { patch(i, { state: 'error', msg: (lang === 'hi' && e?.body?.hi) || e.message }); failed++; }
    }
    setBusy(false);
    if (!failed) setTimeout(() => onDone(ok), 300);
    else setError(tx(`${ok} uploaded, ${failed} failed — fix the red ones and press Upload again.`, `${ok} अपलोड हुए, ${failed} नहीं हुए — लाल वाले ठीक करके फिर से अपलोड दबाएँ।`));
  };

  return (
    <Sheet title={tx('Add papers', 'कागज़ जोड़ें')} onClose={busy ? () => undefined : onClose}>
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-slate-700">{tx('Property', 'प्रॉपर्टी')}
          <select value={propertyId} onChange={e => setPropertyId(e.target.value)} className={`${field} mt-1`}>
            <option value="">{tx('— choose —', '— चुनें —')}</option>
            {props.map(p => <option key={p.id} value={p.id}>{p.title} — {p.locality}</option>)}
          </select>
        </label>

        <div>
          <input ref={pick} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" aria-label={tx('Choose files', 'फ़ाइल चुनें')} onChange={e => { add(e.target.files); e.target.value = ''; }} />
          <button type="button" onClick={() => pick.current?.click()} className="flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 p-4 text-center text-sm text-slate-600 hover:border-slate-500">
            <Upload className="h-6 w-6 text-slate-400" aria-hidden />
            <span className="font-semibold">{tx('Tap to choose PDF or photos', 'PDF या फ़ोटो चुनने के लिए टैप करें')}</span>
            <span className="text-xs text-slate-500">{tx('Up to 20 files · 10 MB each · phone photos are shrunk automatically', 'एक बार में 20 फ़ाइल · हर एक 10 MB तक · फ़ोन की फ़ोटो अपने आप छोटी हो जाती हैं')}</span>
          </button>
          <button type="button" onClick={() => setScan(true)} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800" data-testid="papers-scan">
            <FileText className="h-4 w-4" aria-hidden />{tx('Make one PDF from page photos', 'पेज की फ़ोटो से एक PDF बनाएँ')}
          </button>
          {scan && <ScanToPdf maxBytes={PROP_DOC_MAX_BYTES} onClose={() => setScan(false)} onDone={f => { setScan(false); add([f]); }} />}
        </div>

        {rows.length > 0 && (
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={i} className="rounded-lg border border-slate-200 p-2.5">
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span className="truncate">{r.file.name} · {fmtSize(r.file.size)}</span>
                  {r.state === 'done' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label={tx('Uploaded', 'अपलोड हो गया')} />
                    : r.state === 'busy' ? <Loader2 className="h-4 w-4 animate-spin" aria-label={tx('Uploading', 'अपलोड हो रहा है')} />
                      : <button type="button" disabled={busy} onClick={() => setRows(x => x.filter((_, j) => j !== i))} aria-label={tx('Remove', 'हटाएँ')} className="p-1 text-slate-400"><X className="h-4 w-4" /></button>}
                </div>
                {r.state !== 'done' && (
                  <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    <input value={r.title} onChange={e => patch(i, { title: e.target.value })} maxLength={120} aria-label={tx('Title', 'नाम')} placeholder={tx('Title', 'नाम')} className={field} />
                    <select value={r.type} onChange={e => patch(i, { type: e.target.value })} aria-label={tx('Type', 'प्रकार')} className={field}>
                      {PROP_DOC_TYPES.map(t => <option key={t.id} value={t.id}>{lang === 'hi' ? t.hi : t.en}</option>)}
                    </select>
                    <input value={r.refNo} onChange={e => patch(i, { refNo: e.target.value })} maxLength={60} aria-label={tx('Number (khasra / registry / plot)', 'नंबर (खसरा / रजिस्ट्री / प्लॉट)')} placeholder={tx('Number — khasra / registry / plot (optional)', 'नंबर — खसरा / रजिस्ट्री / प्लॉट (वैकल्पिक)')} className={`${field} sm:col-span-2`} />
                  </div>
                )}
                {r.msg && <p role="alert" className="mt-1 text-xs text-red-700">{r.msg}</p>}
              </li>
            ))}
          </ul>
        )}

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-semibold text-slate-700">{tx('Who can open these?', 'इन्हें कौन खोल सकता है?')}</legend>
          {([
            ['PRIVATE', tx('Only me, the property owner and listing broker (you can share with named people later)', 'सिर्फ़ मैं, प्रॉपर्टी का मालिक और लिस्टिंग ब्रोकर (बाद में नाम चुनकर शेयर कर सकते हैं)')],
            ['DEAL_PARTICIPANTS', tx('Also the people in a deal room on this property', 'साथ में इस प्रॉपर्टी की डील रूम के लोग')],
            ['VERIFIED_BROKERS', tx('Every verified broker on GENZ (whole network can see)', 'GENZ के सभी वेरिफ़ाइड ब्रोकर (पूरा नेटवर्क देख सकेगा)')],
          ] as [Vis, string][]).map(([v, label]) => (
            <label key={v} className="flex min-h-11 items-start gap-2 rounded-lg border border-slate-200 p-2 text-xs text-slate-700">
              <input type="radio" name="vis" checked={visibility === v} onChange={() => setVisibility(v)} className="mt-0.5" />{label}
            </label>
          ))}
        </fieldset>

        <label className={`flex min-h-11 items-start gap-2 rounded-lg border p-3 text-xs ${protect ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-slate-200 text-slate-700'}`} data-testid="upload-protect">
          <input type="checkbox" checked={protect} onChange={e => setProtect(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span><b className="flex items-center gap-1"><FileLock2 className="h-3.5 w-3.5" aria-hidden />{tx('Protect these papers (view only)', 'इन कागज़ों को सुरक्षित करें (सिर्फ़ देखने के लिए)')}</b>
            {tx('People you share with see them only inside GENZ, with their own name and mobile stamped on every page — no download, no forward. You, the owner and the listing broker keep the original. Works for photos and scanned PDFs (not PDFs typed on a computer).', 'जिनके साथ शेयर करेंगे वे इन्हें सिर्फ़ GENZ के अंदर देख पाएँगे, हर पेज पर उनका अपना नाम और मोबाइल छपा होगा — न डाउनलोड, न फ़ॉरवर्ड। असली फ़ाइल आपके, मालिक और लिस्टिंग ब्रोकर के पास रहती है। फ़ोटो और स्कैन किए PDF पर चलता है (कंप्यूटर पर टाइप किए PDF पर नहीं)।')}</span>
        </label>

        <input value={tags} onChange={e => setTags(e.target.value)} placeholder={tx('Tags, comma separated (optional) — e.g. plot14, original', 'टैग, कॉमा से अलग (वैकल्पिक) — जैसे plot14, original')} aria-label={tx('Tags', 'टैग')} className={field} />
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={400} placeholder={tx('Note (optional)', 'नोट (वैकल्पिक)')} aria-label={tx('Note', 'नोट')} className={field} />

        <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          <input type="checkbox" checked={attest} onChange={e => setAttest(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>{tx('I am the owner of this property, or the owner has allowed me to keep these papers here. I have not uploaded Aadhaar / PAN copies with visible numbers.', 'मैं इस प्रॉपर्टी का मालिक हूँ, या मालिक ने मुझे ये कागज़ यहाँ रखने की अनुमति दी है। मैंने ऐसी आधार / PAN कॉपी नहीं डाली जिसमें नंबर दिख रहे हों।')}</span>
        </label>

        {error && <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-red-50 p-2.5 text-xs text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{error}</p>}
        <button type="button" disabled={busy} onClick={go} className={`${btn} w-full bg-slate-900 py-3 text-sm text-white disabled:opacity-50`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}{busy ? tx('Uploading…', 'अपलोड हो रहा है…') : tx('Upload', 'अपलोड करें')}
        </button>
      </div>
    </Sheet>
  );
};

const ShareSheet: React.FC<{ doc: any; onClose: () => void }> = ({ doc, onClose }) => {
  const tx = useTx();
  const [people, setPeople] = useState<any[] | null>(null);
  const [cur, setCur] = useState<any>(doc);
  const [sel, setSel] = useState<string[]>([]);
  const [days, setDays] = useState('30');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { api.propDocPeople(doc.id).then(r => setPeople(r.people)).catch(e => setErr(e.message)); }, [doc.id]);
  const shown = (people || []).filter(p => !q.trim() || `${p.name} ${p.company} ${p.city}`.toLowerCase().includes(q.trim().toLowerCase()));
  const send = async () => {
    setErr(''); setMsg('');
    try { const r = await api.propDocShare(doc.id, { userIds: sel, expiresInDays: days ? Number(days) : undefined }); setCur(r.doc); setSel([]); setMsg(tx(`Shared with ${r.shared} member(s)`, `${r.shared} सदस्य को शेयर किया`)); }
    catch (e: any) { setErr(e.message); }
  };
  const revoke = async (userId: string) => {
    try { const r = await api.propDocRevoke(doc.id, userId); setCur(r.doc); } catch (e: any) { setErr(e.message); }
  };
  return (
    <Sheet title={`${tx('Share', 'शेयर करें')}: ${doc.title}`} onClose={onClose}>
      <div className="space-y-3">
        {(cur.shares || []).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-700">{tx('Can open now', 'अभी खोल सकते हैं')}</p>
            <ul className="mt-1 space-y-1">
              {cur.shares.map((s: any) => (
                <li key={s.userId} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
                  <span>{s.name}{s.expiresAt ? ` · ${s.expired ? tx('expired', 'समय खत्म') : tx('until', 'तक')} ${new Date(s.expiresAt).toLocaleDateString('en-IN')}` : ` · ${tx('no expiry', 'कोई समय-सीमा नहीं')}`}</span>
                  <button onClick={() => revoke(s.userId)} className="min-h-9 px-2 font-semibold text-red-700">{tx('Remove', 'हटाएँ')}</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={tx('Search members by name / company / city', 'नाम / कंपनी / शहर से सदस्य खोजें')} aria-label={tx('Search members', 'सदस्य खोजें')} className={field} />
        {!people && !err ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : (
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {shown.map(p => (
              <li key={p.id}>
                <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-2.5 text-xs">
                  <input type="checkbox" checked={sel.includes(p.id)} onChange={e => setSel(s => (e.target.checked ? [...s, p.id] : s.filter(x => x !== p.id)))} />
                  <span className="min-w-0 flex-1"><b>{p.name}</b> <span className="text-slate-500">· {p.role.replace(/_/g, ' ')}{p.company ? ` · ${p.company}` : ''}{p.city ? ` · ${p.city}` : ''}</span></span>
                  {p.inDeal && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">{tx('in a deal here', 'इस पर डील में')}</span>}
                </label>
              </li>
            ))}
            {!shown.length && <li className="py-3 text-center text-xs text-slate-500">{tx('No member found.', 'कोई सदस्य नहीं मिला।')}</li>}
          </ul>
        )}
        <label className="block text-xs font-semibold text-slate-700">{tx('Access lasts', 'पहुँच कितने दिन रहे')}
          <select value={days} onChange={e => setDays(e.target.value)} className={`${field} mt-1`}>
            <option value="7">{tx('7 days', '7 दिन')}</option><option value="30">{tx('30 days', '30 दिन')}</option><option value="90">{tx('90 days', '90 दिन')}</option><option value="">{tx('Until I remove it', 'जब तक मैं न हटाऊँ')}</option>
          </select>
        </label>
        {err && <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{err}</p>}
        {msg && <p role="status" className="rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-800">{msg}</p>}
        <button disabled={!sel.length} onClick={send} className={`${btn} w-full bg-slate-900 py-3 text-sm text-white disabled:opacity-40`}><Share2 className="h-4 w-4" aria-hidden />{tx(`Share with ${sel.length || ''}`, `${sel.length || ''} को शेयर करें`)}</button>
        <p className="text-[11px] text-slate-500">{tx('They can open and download it here. Every open is logged. You can remove access any time.', 'वे इसे यहीं खोल व डाउनलोड कर सकेंगे। हर बार खोलने का लॉग बनता है। आप कभी भी पहुँच हटा सकते हैं।')}</p>
      </div>
    </Sheet>
  );
};

const LogSheet: React.FC<{ doc: any; onClose: () => void }> = ({ doc, onClose }) => {
  const tx = useTx();
  const [log, setLog] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.propDocLog(doc.id).then(r => setLog(r.log)).catch(e => setErr(e.message)); }, [doc.id]);
  const label = (a: string) => ({ VIEW: tx('opened', 'खोला'), DOWNLOAD: tx('downloaded', 'डाउनलोड किया'), DENIED: tx('tried — refused', 'कोशिश की — मना हुआ'), SHARE: tx('was given access', 'को पहुँच मिली'), REVOKE: tx('access removed', 'की पहुँच हटी') } as Record<string, string>)[a] || a;
  return (
    <Sheet title={`${tx('Who opened', 'किसने खोला')}: ${doc.title}`} onClose={onClose}>
      {err ? <p role="alert" className="text-xs text-red-700">{err}</p> : !log ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : log.length === 0 ? <p className="text-sm text-slate-500">{tx('Nobody has opened it yet.', 'अभी तक किसी ने नहीं खोला।')}</p> : (
        <ul className="divide-y divide-slate-100 text-xs">
          {log.map((l, i) => (
            <li key={i} className="flex items-center justify-between gap-2 py-2">
              <span><b>{l.name}</b> {label(l.action)}{l.note ? ` (${l.note})` : ''}</span>
              <span className="shrink-0 text-slate-400">{new Date(l.at).toLocaleString('en-IN')}</span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
};

const EditSheet: React.FC<{ doc: any; onClose: () => void; onDone: () => void }> = ({ doc, onClose, onDone }) => {
  const tx = useTx();
  const { lang } = useI18n();
  const [f, setF] = useState({ title: doc.title, type: doc.type, refNo: doc.refNo || '', tags: (doc.tags || []).join(', '), note: doc.note || '', visibility: doc.visibility as Vis });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr('');
    try { await api.propDocEdit(doc.id, { title: f.title, type: f.type, refNo: f.refNo, tags: f.tags.split(',').map((t: any) => t.trim()).filter(Boolean), note: f.note, visibility: f.visibility }); onDone(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Sheet title={tx('Edit paper details', 'कागज़ की जानकारी बदलें')} onClose={onClose}>
      <div className="space-y-2.5">
        <input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} maxLength={120} aria-label={tx('Title', 'नाम')} className={field} />
        <select value={f.type} onChange={e => setF({ ...f, type: e.target.value })} aria-label={tx('Type', 'प्रकार')} className={field}>{PROP_DOC_TYPES.map(t => <option key={t.id} value={t.id}>{lang === 'hi' ? t.hi : t.en}</option>)}</select>
        <input value={f.refNo} onChange={e => setF({ ...f, refNo: e.target.value })} maxLength={60} aria-label={tx('Number', 'नंबर')} placeholder={tx('Number (khasra / registry / plot)', 'नंबर (खसरा / रजिस्ट्री / प्लॉट)')} className={field} />
        <input value={f.tags} onChange={e => setF({ ...f, tags: e.target.value })} aria-label={tx('Tags', 'टैग')} placeholder={tx('Tags, comma separated', 'टैग, कॉमा से अलग')} className={field} />
        <input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} maxLength={400} aria-label={tx('Note', 'नोट')} placeholder={tx('Note', 'नोट')} className={field} />
        <select value={f.visibility} onChange={e => setF({ ...f, visibility: e.target.value as Vis })} aria-label={tx('Who can open', 'कौन खोल सकता है')} className={field}>
          <option value="PRIVATE">{tx('Private — me, owner & listing broker', 'निजी — मैं, मालिक व लिस्टिंग ब्रोकर')}</option>
          <option value="DEAL_PARTICIPANTS">{tx('Also people in a deal room on this property', 'साथ में इस प्रॉपर्टी की डील के लोग')}</option>
          <option value="VERIFIED_BROKERS">{tx('Every verified broker', 'सभी वेरिफ़ाइड ब्रोकर')}</option>
        </select>
        {err && <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{err}</p>}
        <button disabled={busy} onClick={save} className={`${btn} w-full bg-slate-900 py-3 text-sm text-white disabled:opacity-50`}>{tx('Save', 'सेव करें')}</button>
      </div>
    </Sheet>
  );
};
