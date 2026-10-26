import React, { useEffect, useRef, useState } from 'react';
import { Loader2, ShieldAlert, Lock, Copy, Check, X, EyeOff, KeyRound } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';
import { REVEAL_PURPOSES, REVEAL_PURPOSE_LABEL, REVEAL_MIN_REASON, type RevealPurpose } from '../shared/kycRules.js';

const inp = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

/**
 * v25 — SUPERADMIN ONLY. Opens one member's PAN + full Aadhaar + address from the encrypted vault.
 * Needs a purpose, a written reason and the superadmin's own password; the opening is recorded and the member sees it. The details hide again after 90 seconds
 * and are never kept in the browser's storage.
 */
export const KycRevealModal: React.FC<{ userId: string; name: string; onClose: () => void }> = ({ userId, name, onClose }) => {
  const tx = useTx();
  const [f, setF] = useState({ purpose: '' as '' | RevealPurpose, reason: '', ref: '', password: '', code: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [out, setOut] = useState<any>(null); const [left, setLeft] = useState(0);
  const [copied, setCopied] = useState('');
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose, busy]);

  const ok = !!f.purpose && f.reason.trim().length >= REVEAL_MIN_REASON && f.password.length > 0;
  const open = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.kycReveal(userId, { purpose: f.purpose, reason: f.reason.trim(), ref: f.ref.trim() || undefined, password: f.password, code: f.code.trim() || undefined });
      setF(x => ({ ...x, password: '', code: '' }));
      setOut(r); setLeft(r.hideAfterSeconds || 90);
      timer.current = window.setInterval(() => setLeft(s => { if (s <= 1) { if (timer.current) window.clearInterval(timer.current); setOut(null); return 0; } return s - 1; }), 1000);
    } catch (e: any) { setErr(e.message || tx('Could not open', 'खुल नहीं सका')); setF(x => ({ ...x, password: '' })); }
    finally { setBusy(false); }
  };
  const copy = async (key: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied(''), 1500); } catch { /* clipboard not allowed */ } };
  const row = (key: string, label: string, value: string, mono = true) => (
    <div className="flex items-start justify-between gap-2 rounded-lg bg-white p-2">
      <div className="min-w-0"><div className="text-[10px] font-bold uppercase text-slate-500">{label}</div><div className={`break-words text-sm font-bold ${mono ? 'font-mono tracking-wide' : ''}`} data-testid={`kyc-out-${key}`}>{value || '—'}</div></div>
      {value && <button type="button" aria-label={tx('Copy', 'कॉपी')} onClick={() => copy(key, value)} className="rounded-lg border border-slate-300 p-2 text-slate-600">{copied === key ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</button>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/70 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={tx('Open full KYC', 'पूरा KYC खोलें')} data-testid="kyc-reveal">
      <div className="flex max-h-[94vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><Lock className="h-5 w-5 text-red-600" />{tx('Open full KYC', 'पूरा KYC खोलें')} — {name}</h3>
          <button type="button" onClick={onClose} disabled={busy} aria-label={tx('Close', 'बंद करें')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {!out ? (<>
            <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-900"><ShieldAlert className="mr-1 inline h-4 w-4" />{tx('This opens the member’s PAN, full Aadhaar number and address. Use it only for a legal / dispute / ID-fraud matter. The opening is recorded with your name and reason, and the member will see it on his own screen.', 'इससे सदस्य का PAN, पूरा आधार नंबर और पता खुलेगा। इसे सिर्फ़ क़ानूनी / विवाद / ID-धोखाधड़ी के मामले में इस्तेमाल करें। खुलना आपके नाम और कारण के साथ दर्ज होता है और सदस्य को अपनी स्क्रीन पर दिखता है।')}</p>
            <label className="block text-xs font-semibold text-slate-700">{tx('Why do you need it?', 'क्यों चाहिए?')}
              <select className={inp} value={f.purpose} onChange={e => setF({ ...f, purpose: e.target.value as RevealPurpose })} data-testid="kyc-purpose">
                <option value="">{tx('— choose —', '— चुनें —')}</option>
                {REVEAL_PURPOSES.map(p => <option key={p} value={p}>{tx(REVEAL_PURPOSE_LABEL[p].en, REVEAL_PURPOSE_LABEL[p].hi)}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-700">{tx(`Reason in your words (at least ${REVEAL_MIN_REASON} characters)`, `कारण अपने शब्दों में (कम से कम ${REVEAL_MIN_REASON} अक्षर)`)}
              <textarea className={inp} rows={3} maxLength={400} value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} placeholder={tx('e.g. Legal notice to be served on him for the unpaid commission of deal DEAL-2026-014; advocate needs his address.', 'जैसे: DEAL-2026-014 के बकाया कमीशन पर उन्हें क़ानूनी नोटिस भेजना है; वकील को उनका पता चाहिए।')} data-testid="kyc-reason" />
            </label>
            <label className="block text-xs font-semibold text-slate-700">{tx('Case / deal / dispute number (optional)', 'केस / डील / विवाद नंबर (वैकल्पिक)')}
              <input className={inp} maxLength={60} value={f.ref} onChange={e => setF({ ...f, ref: e.target.value })} data-testid="kyc-ref" />
            </label>
            <label className="block text-xs font-semibold text-slate-700"><KeyRound className="mr-1 inline h-3.5 w-3.5" />{tx('Type your own password to confirm', 'पुष्टि के लिए अपना पासवर्ड लिखें')}
              <input className={inp} type="password" autoComplete="current-password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} data-testid="kyc-password" />
            </label>
            <label className="block text-xs font-semibold text-slate-700">{tx('6-digit code from your authenticator app (if two-step sign-in is on)', 'ऑथेंटिकेटर ऐप का 6 अंकों का कोड (अगर टू-स्टेप साइन-इन चालू है)')}
              <input className={inp} inputMode="numeric" autoComplete="one-time-code" maxLength={14} value={f.code} onChange={e => setF({ ...f, code: e.target.value })} data-testid="kyc-code" />
            </label>
            {err && <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-xs font-medium text-red-700">{err}</p>}
          </>) : (
            <div className="space-y-2" data-testid="kyc-revealed">
              <div className="flex items-center justify-between rounded-lg bg-amber-50 p-2 text-xs text-amber-900"><span>{tx(`Hides again in ${left} s`, `${left} सेकंड में फिर छिप जाएगा`)}</span><button type="button" className="inline-flex items-center gap-1 font-semibold underline" onClick={() => { setOut(null); if (timer.current) window.clearInterval(timer.current); }}><EyeOff className="h-3.5 w-3.5" />{tx('Hide now', 'अभी छिपाएँ')}</button></div>
              {row('name', tx('Name', 'नाम'), out.member.name, false)}
              {row('pan', 'PAN', out.pan)}
              {row('aadhaar', tx('Aadhaar number', 'आधार नंबर'), out.aadhaar ? out.aadhaar.replace(/(\d{4})(?=\d)/g, '$1 ') : '')}
              {row('address', tx('Address', 'पता'), out.address ? `${out.address}${out.pincode ? ` – ${out.pincode}` : ''}` : '', false)}
              {row('phone', tx('Phone', 'फ़ोन'), out.member.phone)}
              <p className="text-[11px] text-slate-500">{tx('Do not forward this in a chat or e-mail. Give it only to the advocate / court / police who needs it, and note that you did.', 'इसे चैट या ई-मेल में आगे न भेजें। सिर्फ़ उस वकील / अदालत / पुलिस को दें जिसे ज़रूरत है, और दर्ज करें कि दिया।')}</p>
            </div>
          )}
        </div>
        {!out && <div className="border-t border-slate-200 p-3">
          <button type="button" disabled={!ok || busy} onClick={open} data-testid="kyc-open" className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-red-700 px-3 text-sm font-semibold text-white disabled:opacity-40">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Open and record', 'खोलें और दर्ज करें')}</button>
        </div>}
      </div>
    </div>
  );
};

/** SUPERADMIN ONLY: is the vault on, is there a key, how many are stored, and the latest openings. */
export const KycVaultPanel: React.FC = () => {
  const tx = useTx();
  const [s, setS] = useState<any>(null); const [rev, setRev] = useState<any[]>([]); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const load = () => { api.kycStatus().then(setS).catch(e => setErr(e.message)); api.kycReveals().then(r => setRev(r.reveals || [])).catch(() => {}); };
  useEffect(load, []);
  if (err) return null; // a non-superadmin simply sees nothing
  if (!s) return null;
  const toggle = async () => {
    const on = !s.on;
    if (!on && !window.confirm(tx('Switch the KYC vault OFF?\n\nNew sign-ups will keep only the last 4 Aadhaar digits. What is already stored stays encrypted.', 'KYC वॉल्ट बंद करें?\n\nनए साइन-अप में सिर्फ़ आधार के आख़िरी 4 अंक रखे जाएँगे। जो पहले से रखा है वह एन्क्रिप्ट ही रहेगा।'))) return;
    setBusy(true); try { await api.kycSetOn(on); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <section className={`space-y-2 rounded-xl border p-3 ${s.on ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-300 bg-white'}`} aria-label={tx('KYC vault', 'KYC वॉल्ट')} data-testid="kyc-vault-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Lock className="h-4 w-4" />{tx('KYC vault (superadmin only)', 'KYC वॉल्ट (सिर्फ़ सुपरएडमिन)')}</div>
          <p className="mt-0.5 text-xs text-slate-600">{tx(`Full Aadhaar and address, encrypted. Stored: ${s.counts.withAadhaar} Aadhaar · ${s.counts.withAddress} address of ${s.counts.brokers} brokers.`, `पूरा आधार और पता, एन्क्रिप्टेड। रखे हैं: ${s.counts.withAadhaar} आधार · ${s.counts.withAddress} पता (${s.counts.brokers} ब्रोकर में से)।`)}</p>
          {!s.keyReady && <p role="alert" className="mt-1 text-xs font-semibold text-red-700">{tx('No encryption key on this server — the vault is OFF. ', 'इस सर्वर पर एन्क्रिप्शन की (key) नहीं है — वॉल्ट बंद है। ')}{s.keyProblem}</p>}
          {s.keyWarning && <p className="mt-1 text-[11px] text-amber-800">{tx(s.keyWarning, 'एन्क्रिप्शन की (key) डेटा वाली ही डिस्क पर फ़ाइल है। सर्वर की सेटिंग में KYC_VAULT_KEY रखें, ताकि सिर्फ़ डेटा फ़ोल्डर की कॉपी से कुछ खोला न जा सके।')}</p>}
        </div>
        <button role="switch" aria-checked={s.on} aria-label={tx('KYC vault', 'KYC वॉल्ट')} disabled={busy || (!s.keyReady && !s.on)} onClick={toggle} data-testid="kyc-switch"
          className={`relative mt-1 inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${s.on ? 'bg-emerald-600' : 'bg-slate-300'}`}>
          <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${s.on ? 'translate-x-7' : 'translate-x-1'}`} /><span className="sr-only">{s.on ? 'ON' : 'OFF'}</span>
        </button>
      </div>
      {rev.length > 0 && <details className="text-xs"><summary className="cursor-pointer font-semibold text-slate-700">{tx(`Latest openings (${rev.length})`, `हाल में खुले (${rev.length})`)}</summary>
        <ul className="mt-1 space-y-1">{rev.slice(0, 10).map((r, i) => <li key={i} className="rounded bg-white p-1.5 text-[11px]"><b>{r.by}</b> → {r.member} · {new Date(r.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {tx(REVEAL_PURPOSE_LABEL[r.purpose as RevealPurpose]?.en || r.purpose, REVEAL_PURPOSE_LABEL[r.purpose as RevealPurpose]?.hi || r.purpose)}{r.ref ? ` [${r.ref}]` : ''}<div className="text-slate-600">“{r.reason}”</div></li>)}</ul>
      </details>}
    </section>
  );
};

/** SUPERADMIN ONLY: KYC kept (sealed) after a member deleted his account — open one with a reason, see its files for 10 minutes */
export const KycHoldsPanel: React.FC = () => {
  const tx = useTx();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [openId, setOpenId] = useState('');
  const [f, setF] = useState({ purpose: '' as '' | RevealPurpose, reason: '', password: '', code: '' }); const [busy, setBusy] = useState(false); const [out, setOut] = useState<any>(null);
  const load = () => api.kycHolds().then(setD).catch(e => setErr(e.message));
  useEffect(() => { void load(); }, []);
  if (err || !d) return null;
  const live = d.holds.filter((h: any) => !h.purgedAt);
  const ok = !!f.purpose && f.reason.trim().length >= REVEAL_MIN_REASON && f.password.length > 0;
  const open = async (id: string) => {
    setBusy(true); setErr('');
    try { const r = await api.kycHoldOpen(id, { purpose: f.purpose, reason: f.reason.trim(), password: f.password, code: f.code.trim() || undefined }); setF(x => ({ ...x, password: '', code: '' })); setOut({ id, ...r }); await load(); }
    catch (e: any) { setErr(e.message); setF(x => ({ ...x, password: '' })); } finally { setBusy(false); }
  };
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <section className="space-y-2 rounded-xl border border-slate-300 bg-white p-3" aria-label={tx('KYC kept after deletion', 'डिलीट के बाद रखा KYC')} data-testid="kyc-holds-panel">
      <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Lock className="h-4 w-4" />{tx('KYC kept after account deletion (superadmin only)', 'अकाउंट डिलीट के बाद रखा KYC (सिर्फ़ सुपरएडमिन)')}</div>
      <p className="text-xs text-slate-600">{tx(`When a member deletes his account, GENZ keeps his KYC sealed for ${Math.round(d.retainDays / 365 * 10) / 10} years (fraud / legal / RERA), then deletes it. Property papers and chats are not kept.`, `सदस्य अकाउंट डिलीट करे तो भी GENZ उसका KYC ${Math.round(d.retainDays / 365 * 10) / 10} साल सील करके रखता है (धोखाधड़ी / क़ानूनी / RERA), फिर मिटा देता है। प्रॉपर्टी के काग़ज़ और चैट नहीं रखे जाते।`)}</p>
      {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
      {live.length === 0 && <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{tx('Nothing kept right now.', 'अभी कुछ रखा नहीं है।')}</p>}
      {live.map((h: any) => (
        <div key={h.id} className="space-y-1.5 rounded-lg border border-slate-200 p-2 text-xs" data-testid={`kyc-hold-${h.id}`}>
          <div className="flex items-start justify-between gap-2"><div><b>{h.label}</b> · {h.files.length} {tx('files', 'फ़ाइलें')}{h.hasVault ? ` + ${tx('Aadhaar / address', 'आधार / पता')}` : ''}<div className="text-[11px] text-slate-500">{tx('Deleted', 'डिलीट')} {fmt(h.erasedAt)} · {tx('kept till', 'रखा जाएगा')} {fmt(h.retainUntil)} · {tx('opened', 'खुला')} {h.opened}×</div></div>
            <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 font-semibold" onClick={() => { setOpenId(openId === h.id ? '' : h.id); setOut(null); }}>{tx('Open', 'खोलें')}</button></div>
          {openId === h.id && !out && (
            <div className="space-y-2 rounded-lg bg-red-50 p-2">
              <p className="text-[11px] text-red-900">{tx('Use only for a legal / dispute / fraud matter. The opening is recorded with your name and reason.', 'सिर्फ़ क़ानूनी / विवाद / धोखाधड़ी के मामले में। खुलना आपके नाम और कारण के साथ दर्ज होता है।')}</p>
              <select className={inp} value={f.purpose} onChange={e => setF({ ...f, purpose: e.target.value as RevealPurpose })} data-testid="hold-purpose"><option value="">{tx('— why —', '— क्यों —')}</option>{REVEAL_PURPOSES.map(p => <option key={p} value={p}>{tx(REVEAL_PURPOSE_LABEL[p].en, REVEAL_PURPOSE_LABEL[p].hi)}</option>)}</select>
              <textarea className={inp} rows={2} maxLength={400} placeholder={tx(`Reason (at least ${REVEAL_MIN_REASON} characters)`, `कारण (कम से कम ${REVEAL_MIN_REASON} अक्षर)`)} value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} data-testid="hold-reason" />
              <input className={inp} type="password" autoComplete="current-password" placeholder={tx('Your password', 'आपका पासवर्ड')} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} data-testid="hold-password" />
              <input className={inp} inputMode="numeric" placeholder={tx('Authenticator code (if on)', 'ऑथेंटिकेटर कोड (अगर चालू)')} value={f.code} maxLength={14} onChange={e => setF({ ...f, code: e.target.value })} />
              <button type="button" disabled={!ok || busy} onClick={() => open(h.id)} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-red-700 px-3 text-sm font-semibold text-white disabled:opacity-40" data-testid="hold-open">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Open and record', 'खोलें और दर्ज करें')}</button>
            </div>
          )}
          {out?.id === h.id && (
            <div className="space-y-1.5 rounded-lg bg-slate-50 p-2" data-testid="hold-out">
              <div className="flex items-center justify-between"><span className="text-[11px] text-amber-800">{tx('Visible for this view only. Do not forward in chat or e-mail.', 'सिर्फ़ इसी स्क्रीन पर दिखता है। चैट / ई-मेल में आगे न भेजें।')}</span><button type="button" className="inline-flex items-center gap-1 font-semibold underline" onClick={() => setOut(null)}><EyeOff className="h-3.5 w-3.5" />{tx('Hide', 'छिपाएँ')}</button></div>
              <div><b>{out.member.name}</b> · {out.member.phone} · {out.member.city} · {out.member.role}</div>
              {out.pan && <div>PAN <span className="font-mono">{out.pan}</span></div>}
              {out.aadhaar ? <div>{tx('Aadhaar', 'आधार')} <span className="font-mono">{String(out.aadhaar).replace(/(\d{4})(?=\d)/g, '$1 ')}</span></div> : out.aadhaarLast4 ? <div>{tx('Aadhaar last 4', 'आधार के आख़िरी 4')}: {out.aadhaarLast4}</div> : null}
              {out.address && <div>{tx('Address', 'पता')}: {out.address}{out.pincode ? ` – ${out.pincode}` : ''}</div>}
              <div className="flex flex-wrap gap-2 pt-1">{out.files.map((x: any) => <a key={x.n} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold" href={`/api/kyc-retain/${h.id}/file/${x.n}`} target="_blank" rel="noreferrer">{x.kind.replace(/_/g, ' ')}</a>)}</div>
              <p className="text-[10px] text-slate-500">{tx('The file links work for 10 minutes after you open.', 'फ़ाइल के लिंक खोलने के 10 मिनट तक चलते हैं।')}</p>
            </div>
          )}
        </div>
      ))}
    </section>
  );
};
