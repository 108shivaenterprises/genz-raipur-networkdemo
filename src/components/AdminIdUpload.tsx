import React, { useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { prepareIdFile, idFileError } from '../lib/idFile.js';

/** v188 — GENZ staff attach the card (seen on a video call / at the office) on behalf of a member: POST /api/id-review/users/:id/docs */
export const AdminIdUpload: React.FC<{ userId: string; onDone: () => void }> = ({ userId, onDone }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const ref = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState('PAN'); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const pick = async (f?: File | null) => {
    if (!f) return; setBusy(true); setErr(''); setMsg('');
    try { const p = await prepareIdFile(f); await api.idAdminUpload(userId, { kind, fileName: p.fileName, data: p.data }); setMsg(tx('Copy added', 'कॉपी जोड़ दी')); onDone(); }
    catch (e: any) { setErr(idFileError(e, hi)); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5" data-testid="admin-id-upload">
      <select aria-label={tx('Which card', 'कौन सा कार्ड')} className="min-h-11 rounded border border-slate-300 px-2 text-[11px]" value={kind} onChange={e => { setKind(e.target.value); setMsg(''); setErr(''); }}>
        <option value="PAN">PAN</option><option value="AADHAAR">{tx('Aadhaar (masked)', 'आधार (मास्क्ड)')}</option><option value="RERA">RERA</option>
      </select>
      <input ref={ref} type="file" accept="image/*,application/pdf" className="hidden" disabled={busy} onChange={e => pick(e.target.files?.[0])} />
      <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="inline-flex min-h-11 items-center gap-1 rounded border border-slate-300 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}{tx('Add copy for member', 'सदस्य की ओर से कॉपी जोड़ें')}</button>
      {msg && <span role="status" className="text-[11px] text-emerald-700">{msg}</span>}
      {err && <span role="alert" className="text-[11px] text-red-700">{err}</span>}
    </div>
  );
};
