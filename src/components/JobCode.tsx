import React, { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { useTx } from '../lib/i18n.js';

/** D23 — the customer makes a 4-digit code (shown once) and tells it to the person who is with him; React text only. */
export const MakeCode: React.FC<{ make: () => Promise<{ code: string; expiresAt: string }>; testId: string; label?: string }> = ({ make, testId, label }) => {
  const tx = useTx(); const [code, setCode] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async () => { setBusy(true); setErr(''); try { setCode((await make()).code); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <div className="space-y-1" data-testid={testId}>
      {code ? <p className="rounded-lg bg-amber-50 p-2 text-center" role="status"><span className="block text-[11px] text-slate-600">{tx('Tell this code to the person with you, only when they are at your place. It works once, for 24 hours.', 'यह कोड उसी व्यक्ति को बताएँ जो आपके पास मौजूद है। यह एक बार चलता है, 24 घंटे तक।')}</span><b className="block text-3xl tracking-[0.4em] text-slate-900" data-testid={`${testId}-value`}>{code}</b></p> : null}
      <button type="button" disabled={busy} onClick={() => void go()} className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 disabled:opacity-50" data-testid={`${testId}-btn`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}{code ? tx('Make a new code', 'नया कोड बनाएँ') : label || tx('Make my code', 'मेरा कोड बनाएँ')}</button>
      {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
    </div>
  );
};

/** the other side types the 4 digits */
export const EnterCode: React.FC<{ submit: (code: string) => Promise<unknown>; testId: string; label?: string }> = ({ submit, testId, label }) => {
  const tx = useTx(); const [v, setV] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const go = async () => { setBusy(true); setMsg(null); try { await submit(v); setMsg({ ok: true, t: tx('Code accepted', 'कोड सही निकला') }); setV(''); } catch (e: any) { setMsg({ ok: false, t: e.message }); } finally { setBusy(false); } };
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
      <input className="min-h-11 w-28 rounded-lg border border-slate-300 px-2 text-center text-sm tracking-[0.3em]" inputMode="numeric" maxLength={4} value={v} onChange={e => setV(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" aria-label={label || tx("Customer's 4-digit code", 'ग्राहक का 4 अंकों का कोड')} data-testid={`${testId}-input`} />
      <button type="button" disabled={busy || v.length !== 4} onClick={() => void go()} className="min-h-11 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-50" data-testid={`${testId}-btn`}>{tx('Check code', 'कोड जाँचें')}</button>
      {msg && <p className={`w-full text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`} role="status">{msg.t}</p>}
    </div>
  );
};

/** shrink to at most 800px and under ~140 KB (the server accepts 150 KB) */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file); const k = Math.min(1, 800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  let q = 0.7, out = c.toDataURL('image/jpeg', q); while (out.length * 0.75 > 140 * 1024 && q > 0.3) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
  return out;
}
export const PhotoPick: React.FC<{ label: string; upload: (data: string) => Promise<unknown>; testId: string }> = ({ label, upload, testId }) => {
  const tx = useTx(); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const pick = async (f?: File) => { if (!f) return; setBusy(true); setErr(''); try { await upload(await shrink(f)); } catch (e: any) { setErr(e.message || tx('Could not read this photo — try another.', 'यह फ़ोटो पढ़ी नहीं गई — दूसरी चुनें।')); } finally { setBusy(false); } };
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold" data-testid={testId}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : label}
      <input type="file" accept="image/*" className="sr-only" onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      {err && <span className="ml-2 text-red-700" role="alert">{err}</span>}
    </label>
  );
};
