import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useTx } from '../lib/i18n.js';

/** v199 (D20) — SUPERADMIN: credit %, validity, discount cap, terms and the affiliated partners (each with the % GENZ earns — the discount can never exceed it). */
export const MudraAdmin: React.FC = () => {
  const tx = useTx();
  const [c, setC] = useState<any>(null); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const [np, setNp] = useState({ name: '', category: '', feePct: '' });
  const [terms, setTerms] = useState({ en: '', hi: '' }); const [invs, setInvs] = useState<any[]>([]); const [ni, setNi] = useState({ partnerId: '', buyerUserId: '', description: '', amountInr: '' });
  const msgRef = useRef<HTMLParagraphElement>(null); useEffect(() => { msg && msgRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [msg]);
  const loadInv = () => api.mudraAdminInvoices().then(x => setInvs(x.invoices || [])).catch(() => setInvs([]));
  useEffect(() => { api.mudraAdmin().then(x => { setC(x.config); setTerms(x.config.terms); }).catch(() => setC(null)); void loadInv(); }, []);
  if (!c) return null;
  const save = async (patch: any) => { try { const r = await api.mudraAdminSet(patch); setC(r.config); setMsg({ ok: true, text: tx('Saved', 'सेव हुआ') }); } catch (e: any) { setMsg({ ok: false, text: e.message }); } };
  const inp = 'min-h-11 rounded-lg border border-slate-300 px-2 text-sm';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm" data-testid="mudra-admin">
      <h3 className="font-bold text-slate-900">{tx('GENZ Mudra (discount voucher) — settings', 'GENZ मुद्रा (डिस्काउंट वाउचर) — सेटिंग')}</h3>
      <p className="text-xs text-slate-500">{tx('For buyers and tenants only. A voucher, not money. CA / lawyer to confirm the RBI PPI position before real redemptions.', 'सिर्फ़ खरीदार / किरायेदार के लिए। वाउचर है, पैसा नहीं। असली रिडेम्पशन से पहले CA / वकील से RBI PPI स्थिति पक्की करें।')}</p>
      <label className="mt-2 flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" className="h-5 w-5" checked={c.enabled} onChange={e => void save({ enabled: e.target.checked })} />{tx('Switched on', 'चालू')}</label>
      <div className="grid grid-cols-3 gap-2 text-xs">
        {([['pct', tx('Credit %', 'क्रेडिट %')], ['validityDays', tx('Valid days', 'वैधता दिन')], ['maxDiscountPct', tx('Max discount %', 'अधिकतम डिस्काउंट %')]] as const).map(([k, l]) => <label key={k} className="block">{l}<input className={inp + ' w-full'} inputMode="decimal" defaultValue={c[k]} onBlur={e => { const v = Number(e.target.value); if (Number.isFinite(v) && v !== c[k]) void save({ [k]: v }); }} /></label>)}
      </div>
      <ul className="mt-2 space-y-1 text-xs">{c.partners.map((p: any) => <li key={p.id} className="flex min-h-9 items-center justify-between gap-2"><span>{p.name} · {p.category} · GENZ {p.feePct}%</span><button type="button" className="min-h-11 rounded-lg border border-slate-300 px-2 font-semibold" onClick={() => void save({ partners: c.partners.map((x: any) => x.id === p.id ? { ...x, active: !x.active } : x) })}>{p.active ? tx('Pause', 'रोकें') : tx('Resume', 'चालू करें')}</button></li>)}</ul>
      <div className="mt-2 grid grid-cols-1 gap-2 text-xs min-[420px]:grid-cols-3">
        <input className={inp} placeholder={tx('Partner name', 'पार्टनर का नाम')} value={np.name} onChange={e => setNp({ ...np, name: e.target.value })} aria-label={tx('Partner name', 'पार्टनर का नाम')} />
        <input className={inp} placeholder={tx('Category', 'श्रेणी')} value={np.category} onChange={e => setNp({ ...np, category: e.target.value })} aria-label={tx('Category', 'श्रेणी')} />
        <input className={inp} inputMode="decimal" placeholder={tx('GENZ fee %', 'GENZ फ़ीस %')} value={np.feePct} onChange={e => setNp({ ...np, feePct: e.target.value })} aria-label={tx('GENZ fee %', 'GENZ फ़ीस %')} />
      </div>
      <button type="button" disabled={np.name.trim().length < 2 || np.category.trim().length < 2 || !(Number(np.feePct) > 0)} className="mt-2 min-h-11 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-50" onClick={() => { void save({ partners: [...c.partners, { id: `PTR-${Date.now().toString(36)}`, name: np.name.trim(), category: np.category.trim(), feePct: Number(np.feePct), active: true }] }); setNp({ name: '', category: '', feePct: '' }); }}>{tx('Add partner', 'पार्टनर जोड़ें')}</button>
      <div className="mt-3 space-y-1" data-testid="mudra-terms">
        <p className="text-xs font-bold text-slate-800">{tx('Terms (shown to the buyer)', 'शर्तें (खरीदार को दिखती हैं)')}</p>
        <textarea className={inp + ' w-full py-2'} rows={3} value={terms.en} onChange={e => setTerms({ ...terms, en: e.target.value })} aria-label={tx('Terms in English', 'शर्तें अंग्रेज़ी में')} />
        <textarea className={inp + ' w-full py-2'} rows={3} value={terms.hi} onChange={e => setTerms({ ...terms, hi: e.target.value })} aria-label={tx('Terms in Hindi', 'शर्तें हिंदी में')} />
        <button type="button" className="min-h-11 rounded-lg border border-slate-300 px-3 text-xs font-bold" onClick={() => void save({ terms })} data-testid="mudra-terms-save">{tx('Save terms', 'शर्तें सेव करें')}</button>
      </div>
      <div className="mt-3 space-y-2" data-testid="mudra-invoice-admin">
        <p className="text-xs font-bold text-slate-800">{tx('Create invoice (GENZ desk books the service)', 'इनवॉइस बनाएँ (GENZ डेस्क सर्विस बुक करता है)')}</p>
        <select className={inp + ' w-full'} value={ni.partnerId} onChange={e => setNi({ ...ni, partnerId: e.target.value })} aria-label={tx('Partner', 'पार्टनर')}><option value="">{tx('Partner…', 'पार्टनर…')}</option>{c.partners.filter((p: any) => p.active).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <input className={inp + ' w-full'} placeholder={tx('Buyer account id (e.g. USR-…)', 'खरीदार अकाउंट आईडी (जैसे USR-…)')} value={ni.buyerUserId} onChange={e => setNi({ ...ni, buyerUserId: e.target.value })} aria-label={tx('Buyer id', 'खरीदार आईडी')} />
        <input className={inp + ' w-full'} placeholder={tx('Work done', 'किया गया काम')} value={ni.description} onChange={e => setNi({ ...ni, description: e.target.value })} maxLength={200} aria-label={tx('Work done', 'किया गया काम')} />
        <input className={inp + ' w-full'} inputMode="numeric" placeholder={tx('Amount ₹', 'रकम ₹')} value={ni.amountInr} onChange={e => setNi({ ...ni, amountInr: e.target.value.replace(/\D/g, '') })} aria-label={tx('Amount', 'रकम')} />
        <button type="button" disabled={!ni.partnerId || !ni.buyerUserId.trim() || ni.description.trim().length < 3 || !Number(ni.amountInr)} className="min-h-11 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white disabled:opacity-50" onClick={async () => { try { await api.mudraAdminInvoiceNew({ partnerId: ni.partnerId, buyerUserId: ni.buyerUserId.trim(), description: ni.description.trim(), amountInr: Number(ni.amountInr) }); setNi({ partnerId: '', buyerUserId: '', description: '', amountInr: '' }); setMsg({ ok: true, text: tx('Invoice created', 'इनवॉइस बन गया') }); await loadInv(); } catch (e: any) { setMsg({ ok: false, text: e.message }); } }} data-testid="mudra-invoice-create">{tx('Create invoice', 'इनवॉइस बनाएँ')}</button>
      {msg && <p ref={msgRef} className={`mt-1 text-xs ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`} role="status">{msg.text}</p>}
        <ul className="space-y-1 text-xs" data-testid="mudra-invoice-list">{invs.filter(i => i.status !== 'CANCELLED').map(i => { const st = i.settlement; const act = async (fn: () => Promise<unknown>) => { try { await fn(); await loadInv(); } catch (e: any) { setMsg({ ok: false, text: e.message }); } };
          return <li key={i.id} className="rounded-lg border border-slate-200 p-2" data-testid={`mudra-inv-row-${i.id}`}><span className="block font-semibold">{i.invoiceRef} · {i.partnerName} · {i.buyerUserId}{i.description ? <span className="font-normal text-slate-600" data-testid={`mudra-desc-${i.id}`}> · {i.description}</span> : null}</span>
            {st ? <span className="block text-slate-700" data-testid={`mudra-settle-${i.id}`}>{tx('Gross', 'कुल')} ₹{st.grossInr} · {tx('Coins', 'मुद्रा')} ₹{st.coinsInr} · {tx('Customer pays', 'ग्राहक देगा')} ₹{st.customerPaysInr} · {tx('GENZ share', 'GENZ हिस्सा')} ₹{st.genzShareInr} · {tx('Partner payout', 'पार्टनर पेआउट')} ₹{st.partnerPayoutInr} · <b>{st.status === 'PAID_OUT' ? tx('PAID OUT', 'पेआउट हो गया') : tx('PENDING PAYOUT', 'पेआउट बाक़ी')}</b></span> : <span className="block text-slate-700">₹{i.amountInr} · {tx('Open', 'खुला')}</span>}
            <span className="mt-1 flex gap-2">
              {i.status === 'OPEN' && <><button type="button" className="min-h-11 rounded-lg border border-slate-300 px-2 font-semibold" data-testid={`mudra-markpaid-${i.id}`} onClick={() => void act(() => api.mudraAdminInvoiceMarkPaid(i.id))}>{tx('Mark paid (no coins)', 'पेड मार्क करें (बिना मुद्रा)')}</button><button type="button" className="min-h-11 rounded-lg border border-slate-300 px-2 font-semibold" onClick={() => void act(() => api.mudraAdminInvoiceCancel(i.id))}>{tx('Cancel', 'रद्द करें')}</button></>}
              {st?.status === 'PENDING_PAYOUT' && <button type="button" className="min-h-11 rounded-lg bg-slate-900 px-2 font-semibold text-white" data-testid={`mudra-payout-${i.id}`} onClick={() => void act(() => api.mudraAdminInvoicePayout(i.id))}>{tx('Mark partner paid out', 'पार्टनर को पेआउट हो गया')}</button>}
            </span></li>; })}</ul>
      </div>
    </div>
  );
};
