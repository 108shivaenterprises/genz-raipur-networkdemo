import React, { useRef, useState } from 'react';
import { FileCheck2, Upload, Trash2, ExternalLink, Loader2, Camera } from 'lucide-react';
import { ScanToPdf } from './ScanToPdf.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { prepareIdFile, idFileError, type PreparedIdFile } from '../lib/idFile.js';
import { ID_DOC_LABEL, ID_DOC_MAX_BYTES, type IdDocKind } from '../shared/idRules.js';

export interface StoredIdDoc { id: string; kind: string; uploadedBy: string; createdAt: string; size: number }

/**
 * One place to put (or see) a PAN card / MASKED Aadhaar copy.
 *  • `doc`     — already on the server (open / replace / remove)
 *  • `pending` — chosen but not sent yet (the invite and sign-up forms send after the account / request exists)
 *  • `onChoose`— gets the browser-shrunk file; the parent decides when to upload
 */
export const IdDocSlot: React.FC<{
  kind: IdDocKind;
  doc?: StoredIdDoc | null;
  pending?: PreparedIdFile | null;
  onChoose: (f: PreparedIdFile) => void | Promise<void>;
  onClear?: () => void | Promise<void>;
  /** owner may open his stored copy */
  canOpen?: boolean;
  /** shown on the box: “your sponsor already uploaded this” */
  note?: string;
  disabled?: boolean;
}> = ({ kind, doc, pending, onChoose, onClear, canOpen, note, disabled }) => {
  const tx = useTx();
  const hi = useI18n().lang === 'hi';
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [scan, setScan] = useState(false);
  const L = ID_DOC_LABEL[kind];
  const pick = async (f?: File | null) => {
    if (!f) return;
    setErr(''); setBusy(true);
    try { await onChoose(await prepareIdFile(f)); } catch (e: any) { setErr(idFileError(e, hi)); }
    finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  const remove = async () => { setErr(''); setBusy(true); try { await onClear?.(); } catch (e: any) { setErr(idFileError(e, hi)); } finally { setBusy(false); } };
  const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;
  const btn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-40';
  return (
    <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="text-xs font-semibold text-slate-800">{tx(L.en, L.hi)}</div>
      {doc && !pending && (
        <div className="flex items-start gap-1.5 text-[11px] text-emerald-800"><FileCheck2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{tx('Uploaded', 'अपलोड हो गई')} {doc.uploadedBy === 'SPONSOR' ? tx('by your sponsor', 'आपके स्पॉन्सर ने') : ''} · {kb(doc.size)} · {new Date(doc.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span></div>
      )}
      {pending && <div className="flex items-start gap-1.5 text-[11px] text-sky-800"><FileCheck2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="min-w-0 break-all">{tx('Chosen', 'चुनी गई')}: {pending.fileName} · {kb(pending.size)}</span></div>}
      {!doc && !pending && !note && <div className="text-[11px] text-slate-500">{tx('Not added yet', 'अभी नहीं डाली')}</div>}
      {note && <div className="text-[11px] text-slate-600">{note}</div>}
      <div className="flex flex-wrap gap-2">
        <input ref={ref} type="file" accept="image/*,application/pdf" className="hidden" disabled={disabled || busy} onChange={e => pick(e.target.files?.[0])} />
        <button type="button" className={btn} disabled={disabled || busy} onClick={() => ref.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{doc || pending ? tx('Replace', 'बदलें') : tx('Choose photo / PDF', 'फ़ोटो / PDF चुनें')}
        </button>
        <button type="button" className={btn} disabled={disabled || busy} onClick={() => setScan(true)} data-testid={`id-scan-${kind}`}><Camera className="h-4 w-4" />{tx('Photo → PDF', 'फ़ोटो → PDF')}</button>
        {scan && <ScanToPdf title={kind === 'AADHAAR' ? 'Masked Aadhaar' : 'PAN card'} maxBytes={ID_DOC_MAX_BYTES} maxPages={2}
          hint={kind === 'AADHAAR' ? { en: 'Masked Aadhaar only: cover the first 8 digits with paper before you take the photo (front and back = 2 pages).', hi: 'सिर्फ़ मास्क्ड आधार: फ़ोटो लेने से पहले पहले 8 अंक काग़ज़ से ढक दीजिए (आगे और पीछे = 2 पेज)।' } : { en: 'Front of the PAN card; keep all four corners in the photo.', hi: 'PAN कार्ड का आगे का हिस्सा; फ़ोटो में चारों कोने आने चाहिए।' }}
          onClose={() => setScan(false)} onDone={f => { setScan(false); void pick(f); }} />}
        {doc && !pending && canOpen && <a className={btn} href={api.idDocUrl(doc.id)} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />{tx('Open', 'खोलें')}</a>}
        {(doc || pending) && onClear && <button type="button" className={`${btn} !text-red-700`} disabled={disabled || busy} onClick={remove}><Trash2 className="h-4 w-4" />{tx('Remove', 'हटाएँ')}</button>}
      </div>
      {err && <p role="alert" className="text-[11px] font-medium text-red-700">{err}</p>}
    </div>
  );
};
