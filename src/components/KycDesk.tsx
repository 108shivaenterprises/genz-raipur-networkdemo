import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, CheckCircle2, Circle, Clock, Loader2, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { IdDocSlot } from './IdDocSlot.js';
import { normPan, panProblem, normAadhaar, aadhaarProblem } from '../shared/idRules.js';

/**
 * v188 — "Verify KYC": the one self-contained screen a Basic account uses to get verified. It does NOT call /network/profile
 * (403 for Basic): PAN + Aadhaar (/my-id), RERA claim (/my-rera), ID / RERA copies (/id-review/mine/docs), each with a status line.
 */
const inp = 'min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
const btn = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white disabled:opacity-50';
const Row: React.FC<{ ok: boolean; wait?: boolean; en: string; hi: string }> = ({ ok, wait, en, hi }) => {
  const tx = useTx();
  return <li className={`flex items-start gap-1.5 text-xs ${ok ? 'text-emerald-800' : wait ? 'text-sky-800' : 'text-slate-700'}`}>
    {ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : wait ? <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}<span>{tx(en, hi)}</span></li>;
};

export const KycDesk: React.FC = () => {
  const tx = useTx();
  const [id, setId] = useState<any>(null); const [rera, setRera] = useState<any>(null); const [mine, setMine] = useState<any>(null);
  const [f, setF] = useState({ pan: '', aadhaar: '', consent: false, rera: '' });
  const [busy, setBusy] = useState(''); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState(''); const [notBroker, setNotBroker] = useState(false);
  const load = useCallback(async () => {
    setLoadErr('');
    const [a, b, c] = await Promise.allSettled([api.netMyId(), api.netMyRera(), api.idMine()]);
    setId(a.status === 'fulfilled' ? a.value.id : null); setRera(b.status === 'fulfilled' ? b.value : null); setMine(c.status === 'fulfilled' ? c.value : null);
    // a non-broker role gets 403 on /my-id and /my-rera (those are broker-only) — that is a role rule, not a failure
    const roleNo = a.status === 'rejected' && (a.reason as any)?.status === 403;
    setNotBroker(roleNo);
    const real = [a, b, c].find(x => x.status === 'rejected' && !(roleNo && (x.reason as any)?.status === 403)) as PromiseRejectedResult | undefined;
    if (real) setLoadErr((real.reason as any)?.message || 'Could not load');
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!loaded) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  if (loadErr && !id && !mine) return (
    <div role="alert" className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800" data-testid="kyc-load-error">
      <p>{loadErr}</p>
      <button type="button" className={btn} onClick={() => { setLoaded(false); void load(); }}>{tx('Retry', 'फिर कोशिश करें')}</button>
    </div>
  );
  const docs: any[] = mine?.docs || []; const docOf = (k: string) => docs.find(d => d.kind === k) || null;
  const aad = normAadhaar(f.aadhaar); const panI = f.pan ? panProblem(f.pan) : null; const aadI = aad ? aadhaarProblem(aad) : null;
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key); setErr(''); setMsg('');   // a new action clears the last message
    try { await fn(); setMsg(ok); await load(); } catch (e: any) { setErr(e.message || tx('Could not save', 'सेव नहीं हुआ')); } finally { setBusy(''); }
  };
  const reraNorm = f.rera.trim().toUpperCase().replace(/\s+/g, ''); const reraOk = /^[A-Z0-9][A-Z0-9\-/.]{6,28}[A-Z0-9]$/.test(reraNorm) && /[A-Z]/.test(reraNorm) && /\d/.test(reraNorm);   // same shape check as the server
  const claim = rera?.claim; const asked = mine?.review?.status === 'CHANGES_ASKED';
  const seen = !!id?.checked; const hasIdNums = !!(id?.hasPan && id?.hasAadhaar);
  return (
    <section className="space-y-4" data-testid="kyc-desk">
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><ShieldCheck className="h-4 w-4 text-emerald-600" />{tx('Verify your KYC', 'अपना KYC वेरिफ़ाई करें')}</h3>
        <p className="mt-1 text-xs text-slate-700">{tx('Give your PAN and Aadhaar, add a copy of the cards (and your RERA certificate if you have one). No RERA? You can still be verified as a Tier 2 associate; add RERA later to move to Tier 1. The GENZ team checks them and then unlocks deals, offers and visits.', 'अपना PAN और आधार दें, कार्ड की कॉपी (और RERA सर्टिफ़िकेट हो तो वह) जोड़ें। RERA नहीं है? फिर भी Tier 2 एसोसिएट के रूप में वेरिफ़ाई हो सकते हैं; RERA बाद में जोड़कर Tier 1 बनें। GENZ टीम जाँचकर डील, ऑफ़र और विज़िट खोल देगी।')}</p>
        {asked && <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800"><b>{tx('The GENZ team asks:', 'GENZ टीम ने कहा:')}</b> {mine.review.note}</p>}
      </div>
      <ul className="space-y-1 rounded-xl border border-slate-200 bg-white p-3" data-testid="kyc-status">
        <Row ok={!!id?.hasPan} en={id?.hasPan ? `PAN given (${id.pan})` : 'PAN: not given yet'} hi={id?.hasPan ? `PAN दिया (${id.pan})` : 'PAN: अभी नहीं दिया'} />
        <Row ok={!!id?.hasAadhaar} en={id?.hasAadhaar ? 'Aadhaar given (last 4 kept)' : 'Aadhaar: not given yet'} hi={id?.hasAadhaar ? 'आधार दिया (आख़िरी 4 अंक रखे)' : 'आधार: अभी नहीं दिया'} />
        <Row ok={!!(docOf('PAN') || docOf('AADHAAR'))} en={docOf('PAN') || docOf('AADHAAR') ? 'Card copy uploaded' : 'Card copy: not uploaded yet'} hi={docOf('PAN') || docOf('AADHAAR') ? 'कार्ड की कॉपी अपलोड है' : 'कार्ड की कॉपी: अभी अपलोड नहीं'} />
        <Row ok={claim?.status === 'APPROVED'} wait={claim?.status === 'PENDING'} en={claim ? (claim.status === 'APPROVED' ? `RERA ${claim.number} approved` : claim.status === 'PENDING' ? `RERA ${claim.number} sent — waiting for the GENZ team` : `RERA ${claim.number} was not accepted${claim.note ? `: ${claim.note}` : ''}`) : 'No RERA yet? You can still be verified as a Tier 2 associate — add RERA later to move to Tier 1. Have it? Send the number and certificate copy below.'}
          hi={claim ? (claim.status === 'APPROVED' ? `RERA ${claim.number} मंज़ूर` : claim.status === 'PENDING' ? `RERA ${claim.number} भेजा — GENZ टीम के इंतज़ार में` : `RERA ${claim.number} मंज़ूर नहीं हुआ${claim.note ? `: ${claim.note}` : ''}`) : 'RERA नहीं है? फिर भी आप Tier 2 एसोसिएट के रूप में वेरिफ़ाई हो सकते हैं — RERA बाद में जोड़कर Tier 1 बनें। RERA है? नीचे नंबर और सर्टिफ़िकेट की कॉपी भेजें।'} />
        <Row ok={seen} wait={!seen && hasIdNums} en={seen ? 'The GENZ team has seen your ID' : hasIdNums ? 'Waiting: the GENZ team will look at your ID' : 'GENZ cannot check yet — add PAN and Aadhaar first'} hi={seen ? 'GENZ टीम ने आपकी ID देख ली' : hasIdNums ? 'इंतज़ार: GENZ टीम आपकी ID देखेगी' : 'GENZ अभी जाँच नहीं सकती — पहले PAN और आधार दें'} />
      </ul>
      {notBroker && <p className="rounded-lg border border-sky-200 bg-sky-50 p-2 text-xs text-sky-900" data-testid="kyc-not-broker">{tx('PAN / Aadhaar numbers and RERA are for brokers. For your role, add a copy of your ID below — the GENZ team checks it.', 'PAN / आधार नंबर और RERA ब्रोकर के लिए हैं। आपकी भूमिका के लिए नीचे अपनी ID की कॉपी जोड़ें — GENZ टीम जाँचेगी।')}</p>}
      {loadErr && (id || mine) && <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{loadErr} <button type="button" className="min-h-11 font-semibold underline" onClick={() => void load()}>{tx('Retry', 'फिर कोशिश करें')}</button></p>}
      {msg && <p role="status" className="rounded-lg bg-emerald-50 p-2 text-xs font-medium text-emerald-800">{msg}</p>}
      {err && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs font-medium text-red-700">{err}</p>}
      {id && <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <h4 className="text-xs font-bold text-slate-800">{tx('1. PAN and Aadhaar', '1. PAN और आधार')}</h4>
        <input className={inp + ' font-mono'} maxLength={10} aria-label="PAN" placeholder={id.hasPan ? tx('PAN (leave empty to keep)', 'PAN (वही रखने के लिए खाली छोड़ें)') : tx('PAN, e.g. ABCPD1234E', 'PAN, जैसे ABCPD1234E')} value={f.pan} onChange={e => setF({ ...f, pan: e.target.value.toUpperCase() })} data-testid="kyc-pan" />
        {panI && <p role="alert" className="text-[11px] font-medium text-red-700">{tx(panI.en, panI.hi)}</p>}
        <input className={inp + ' font-mono tracking-wider'} inputMode="numeric" autoComplete="off" maxLength={14} aria-label={tx('Aadhaar number', 'आधार नंबर')} placeholder={tx('Aadhaar number (12 digits)', 'आधार नंबर (12 अंक)')} value={f.aadhaar} onChange={e => setF({ ...f, aadhaar: e.target.value.replace(/[^\d\s-]/g, '') })} data-testid="kyc-aadhaar" />
        {aadI && <p role="alert" className="text-[11px] font-medium text-red-700">{tx(aadI.en, aadI.hi)}</p>}
        <label className="flex min-h-11 items-start gap-2 text-[11px] text-slate-600"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} />{tx('I agree that GENZ keeps my PAN and the last 4 digits of my Aadhaar to verify me.', 'मैं सहमत हूँ कि GENZ मेरी पहचान जाँचने के लिए मेरा PAN और आधार के आख़िरी 4 अंक रखे।')}</label>
        <button type="button" className={btn} data-testid="kyc-save-id" disabled={!!busy || !!panI || !!aadI || !f.consent || !((f.pan && !panI) || (aad && !aadI)) || (!id.hasPan && !f.pan) || (!id.hasAadhaar && !aad)}
          onClick={() => run('id', () => api.netMyIdSave({ panNumber: f.pan ? normPan(f.pan) : undefined, aadhaarNumber: aad || '', consent: true, kycSource: 'TYPED' }).then(() => setF(x => ({ ...x, pan: '', aadhaar: '', consent: false }))), tx('Saved — the GENZ team will look at it', 'सेव हो गया — GENZ टीम देखेगी'))}>
          {busy === 'id' && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Save PAN and Aadhaar', 'PAN और आधार सेव करें')}</button>
      </div>}
      {rera && <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <h4 className="text-xs font-bold text-slate-800">{tx('2. RERA (optional — Tier 1 needs it)', '2. RERA (वैकल्पिक — Tier 1 के लिए ज़रूरी)')}</h4>
        <input className={inp + ' uppercase placeholder:normal-case'} maxLength={30} aria-label={tx('RERA registration number', 'RERA रजिस्ट्रेशन नंबर')} placeholder={tx('RERA no. as on the certificate', 'सर्टिफ़िकेट वाला RERA नंबर')} value={f.rera} onChange={e => setF({ ...f, rera: e.target.value })} data-testid="kyc-rera" />
        {!reraOk && <p className="text-[11px] text-slate-600" data-testid="kyc-rera-why">{f.rera.trim() ? tx('This does not look like a RERA number — write it exactly as on the certificate (8–30 letters / digits, e.g. PCGRERA2026X0187).', 'यह RERA नंबर जैसा नहीं लगता — सर्टिफ़िकेट जैसा ही लिखें (8–30 अक्षर / अंक, जैसे PCGRERA2026X0187)।') : tx('Type your RERA number to send it. No RERA yet? Skip this — you can add it later.', 'भेजने के लिए अपना RERA नंबर लिखें। अभी RERA नहीं है? छोड़ दें — बाद में जोड़ सकते हैं।')}</p>}
        <button type="button" className={btn} data-testid="kyc-save-rera" disabled={!!busy || !reraOk}
          onClick={() => run('rera', () => api.netMyReraSave(f.rera.trim().toUpperCase().replace(/\s+/g, '')).then(() => setF(x => ({ ...x, rera: '' }))), tx('RERA sent — it is approved by the GENZ team, not automatically', 'RERA भेज दिया — इसे GENZ टीम मंज़ूर करती है, अपने-आप नहीं'))}>
          {busy === 'rera' && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Send my RERA', 'मेरा RERA भेजें')}</button>
      </div>}
      {mine && <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <h4 className="text-xs font-bold text-slate-800">{tx('3. Photo / PDF of my cards', '3. मेरे कार्ड की फ़ोटो / PDF')}</h4>
        {(['PAN', 'AADHAAR', 'RERA'] as const).map(k => (
          <IdDocSlot key={k} kind={k} doc={docOf(k)} canOpen
            onChoose={async p => { setErr(''); setMsg(''); await api.idMineUpload({ kind: k, fileName: p.fileName, data: p.data }); setMsg(tx('Copy uploaded — the GENZ team will look at it', 'कॉपी अपलोड हो गई — GENZ टीम देखेगी')); await load(); }}
            onClear={async () => { setErr(''); setMsg(''); const x = docOf(k); if (x) { await api.idMineDelete(x.id); await load(); } }} />
        ))}
      </div>}
      <p className="flex items-center gap-1 text-[11px] text-slate-500"><BadgeCheck className="h-3.5 w-3.5" />{tx('Only you and the GENZ ID-review team can open your copies; every opening by staff is logged.', 'आपकी कॉपी सिर्फ़ आप और GENZ की ID-जाँच टीम खोल सकती है; स्टाफ़ का हर बार खोलना दर्ज होता है।')}</p>
    </section>
  );
};
