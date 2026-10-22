/**
 * v48 — in a deal room (Agreement stage on): the broker's brokerage bills to the OWNER and / or the BUYER.
 * Make a bill (lines, optional GST, due date, UPI), send it on WhatsApp, send reminders, open it as a PDF, mark it received.
 */
import React, { useEffect, useState } from 'react';
import { Receipt, Send, Copy, Printer, CheckCircle2, XCircle, Plus, Loader2, Eye, BellRing } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import type { UserProfile } from '../types/index.js';

const inp = 'min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm';
const btn = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-40';
const day = (d?: string) => (d ? new Date(d.length === 10 ? `${d}T00:00:00+05:30` : d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const plusDays = (n: number) => { const d = new Date(Date.now() + n * 86400_000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const abs = (p: string) => `${window.location.origin}${p}`;
/** a bill shows the exact rupees, not “₹2.5 L” */
const rs = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

const waMsg = (r: any, broker: string, reminder: boolean) => reminder
  ? `नमस्ते ${r.partyName} जी, याद दिला रहे हैं — ${r.propertyTitle} का ब्रोकरेज ${rs(r.total)} (${day(r.dueOn)} तक) बाकी है। बिल, PDF और UPI: ${abs(r.link)} — भुगतान हो गया हो तो इसी लिंक पर UTR लिख दें। धन्यवाद, ${broker}`
  : `नमस्ते ${r.partyName} जी, ${r.propertyTitle} की डील के लिए ब्रोकरेज बिल — कुल ${rs(r.total)}, ${day(r.dueOn)} तक। बिल, PDF और UPI इस लिंक पर: ${abs(r.link)}। धन्यवाद, ${broker}`;

export const PaymentRequestsPanel: React.FC<{ dealId: string; me: UserProfile; stage: string }> = ({ dealId, me, stage }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [making, setMaking] = useState(false);
  const [f, setF] = useState<any>(null);
  const [recv, setRecv] = useState<{ id: string; ref: string } | null>(null);
  const load = () => api.prList(dealId).then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [dealId, stage]);
  if (!d) return null;
  if (!d.canBill && d.requests.length === 0) return null;

  const start = (party: 'OWNER' | 'BUYER') => {
    const pf = party === 'OWNER' ? d.prefill.owner : d.prefill.buyer;
    setF({
      party, partyName: pf.name || '', partyPhone: pf.phone || '', gstPct: 0, gstin: d.prefill.gstin || '', upiId: d.prefill.upiId || '', dueOn: plusDays(7), note: '',
      items: [{ text: hi ? `ब्रोकरेज — ${d.prefill.property.title}` : `Brokerage — ${d.prefill.property.title}`, amount: pf.amount ? String(pf.amount) : '' }],
    });
    setMaking(true); setErr('');
  };
  const run = async (fn: () => Promise<any>) => { setBusy(true); setErr(''); try { await fn(); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const sub = f ? f.items.reduce((n: number, i: any) => n + (Number(i.amount) || 0), 0) : 0;
  const total = sub + Math.round(sub * (Number(f?.gstPct) || 0) / 100);
  const chip = (r: any) => r.status === 'PAID' ? ['bg-emerald-100 text-emerald-800', tx('Received', 'मिल गया')]
    : r.status === 'CANCELLED' ? ['bg-slate-200 text-slate-600', tx('Cancelled', 'रद्द')]
    : r.status === 'PARTY_SAYS_PAID' ? ['bg-sky-100 text-sky-900', tx(`Says paid · ref ${r.partySaid?.ref}`, `भुगतान बताया · ${r.partySaid?.ref}`)]
    : r.overdue ? ['bg-red-100 text-red-800', tx('Past due', 'तारीख़ निकल गई')] : ['bg-amber-100 text-amber-900', tx(`Due ${day(r.dueOn)}`, `${day(r.dueOn)} तक`)];

  return (
    <div className="space-y-2 rounded-xl border border-emerald-200 bg-white p-3" data-testid="pay-requests">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Receipt className="h-4 w-4 text-emerald-700" />{tx('Brokerage from the owner / buyer', 'मालिक / खरीदार से ब्रोकरेज')}</p>
        {d.canBill && !making && (
          <div className="flex gap-1.5">
            <button className={`${btn} border border-emerald-500 bg-emerald-50 text-emerald-800`} onClick={() => start('OWNER')} data-testid="pay-new-owner"><Plus className="h-3.5 w-3.5" />{tx('Bill to owner', 'मालिक को बिल')}</button>
            <button className={`${btn} border border-emerald-500 bg-emerald-50 text-emerald-800`} onClick={() => start('BUYER')} data-testid="pay-new-buyer"><Plus className="h-3.5 w-3.5" />{tx('Bill to buyer', 'खरीदार को बिल')}</button>
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-500">{tx('A bill with a link (PDF + UPI QR) that you send on WhatsApp. He pays you directly — GENZ does not hold this money. He can write the UTR on the link; you confirm.', 'एक बिल जिसका लिंक (PDF + UPI QR) आप WhatsApp पर भेजते हैं। पैसा सीधे आपको मिलता है — GENZ यह पैसा नहीं रखता। वह लिंक पर UTR लिख सकता है; आप पुष्टि करें।')}</p>

      {making && f && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs" data-testid="pay-form">
          <p className="font-bold text-slate-800">{f.party === 'OWNER' ? tx('Bill to the owner', 'मालिक को बिल') : tx('Bill to the buyer', 'खरीदार को बिल')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className={inp} placeholder={tx('Name', 'नाम')} value={f.partyName} onChange={(e) => setF({ ...f, partyName: e.target.value })} data-testid="pay-name" />
            <input className={inp} inputMode="numeric" maxLength={14} placeholder={tx('Mobile (WhatsApp)', 'मोबाइल (WhatsApp)')} value={f.partyPhone} onChange={(e) => setF({ ...f, partyPhone: e.target.value })} data-testid="pay-phone" />
          </div>
          {f.items.map((it: any, i: number) => (
            <div key={i} className="flex gap-2">
              <input className={inp} placeholder={tx('Description', 'विवरण')} value={it.text} onChange={(e) => { const items = [...f.items]; items[i] = { ...it, text: e.target.value }; setF({ ...f, items }); }} data-testid={`pay-line-${i}`} />
              <input className={inp + ' !w-36'} type="number" inputMode="numeric" placeholder="₹" value={it.amount} onChange={(e) => { const items = [...f.items]; items[i] = { ...it, amount: e.target.value }; setF({ ...f, items }); }} data-testid={`pay-amount-${i}`} />
            </div>
          ))}
          {f.items.length < 3 && <button className="text-[11px] font-semibold text-slate-600 underline" onClick={() => setF({ ...f, items: [...f.items, { text: '', amount: '' }] })}>{tx('+ another line', '+ एक और लाइन')}</button>}
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="font-semibold text-slate-700">GST<select className={inp + ' mt-1'} value={f.gstPct} onChange={(e) => setF({ ...f, gstPct: Number(e.target.value) })} data-testid="pay-gst">{[0, 5, 12, 18].map((g) => <option key={g} value={g}>{g === 0 ? tx('No GST', 'GST नहीं') : `${g}%`}</option>)}</select></label>
            <label className="font-semibold text-slate-700">GSTIN<input className={inp + ' mt-1 uppercase'} maxLength={15} placeholder={tx('if you have one', 'अगर है तो')} value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} /></label>
            <label className="font-semibold text-slate-700">{tx('Pay by', 'आख़िरी तारीख़')}<input type="date" className={inp + ' mt-1'} value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} data-testid="pay-due" /></label>
          </div>
          <input className={inp} placeholder={tx('Your UPI ID (e.g. name@okaxis) — a QR is made from it', 'आपकी UPI ID (जैसे name@okaxis) — इससे QR बनेगा')} value={f.upiId} onChange={(e) => setF({ ...f, upiId: e.target.value })} data-testid="pay-upi" />
          <input className={inp} placeholder={tx('Note on the bill (optional)', 'बिल पर नोट (ज़रूरी नहीं)')} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          <p className="font-semibold text-slate-800">{tx('Total', 'कुल')}: {rs(total)}{Number(f.gstPct) > 0 ? ` (${tx('incl. GST', 'GST सहित')})` : ''}</p>
          <div className="flex gap-2">
            <button className={`${btn} bg-slate-900 text-white`} disabled={busy} data-testid="pay-create"
              onClick={() => run(async () => { await api.prCreate(dealId, { ...f, items: f.items.filter((i: any) => i.text || i.amount).map((i: any) => ({ text: i.text, amount: Math.round(Number(i.amount)) })) }); setMaking(false); setF(null); })}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}{tx('Make the bill', 'बिल बनाएँ')}</button>
            <button className={`${btn} border border-slate-300 bg-white`} onClick={() => { setMaking(false); setF(null); }}>{tx('Cancel', 'रद्द')}</button>
          </div>
        </div>
      )}

      {d.requests.map((r: any) => {
        const [cls, label] = chip(r); const open = r.status === 'SENT' || r.status === 'PARTY_SAYS_PAID';
        const phone = String(r.partyPhone || '');
        return (
          <div key={r.id} className="space-y-1.5 rounded-lg border border-slate-200 p-2.5 text-xs" data-testid={`pay-bill-${r.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-900">{r.party === 'OWNER' ? tx('Owner', 'मालिक') : tx('Buyer', 'खरीदार')}: {r.partyName} · {rs(r.total)}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>{label}</span>
            </div>
            <p className="text-[11px] text-slate-500"><span className="font-mono">{r.number}</span> · <Eye className="inline h-3 w-3" /> {tx(`opened ${r.views}×`, `${r.views} बार खोला`)} · <BellRing className="inline h-3 w-3" /> {tx(`${r.reminders.length} reminder(s)`, `${r.reminders.length} रिमाइंडर`)}{r.reminders.length ? ` · ${tx('last', 'आख़िरी')} ${day(r.reminders[r.reminders.length - 1].at)}` : ''}</p>
            {r.status === 'PAID' && <p className="text-[11px] text-emerald-800">{tx('Received', 'मिला')} {day(r.paid?.at)} · {r.paid?.ref}</p>}
            {open && (
              <div className="flex flex-wrap gap-1.5">
                <a className={`${btn} bg-emerald-600 text-white`} href={`https://wa.me/91${phone}?text=${encodeURIComponent(waMsg(r, me.name, r.reminders.length > 0 || r.overdue))}`} target="_blank" rel="noopener noreferrer"
                  onClick={() => { void api.prAct(r.id, 'remind').then(load).catch(() => undefined); }} data-testid="pay-wa"><Send className="h-3.5 w-3.5" />{r.reminders.length === 0 && !r.overdue ? tx('Send on WhatsApp', 'WhatsApp पर भेजें') : tx('Send a reminder', 'रिमाइंडर भेजें')}</a>
                <a className={`${btn} border border-slate-300 bg-white text-slate-700`} href={r.link} target="_blank" rel="noopener noreferrer" data-testid="pay-open"><Printer className="h-3.5 w-3.5" />{tx('Bill / PDF', 'बिल / PDF')}</a>
                <button className={`${btn} border border-slate-300 bg-white text-slate-700`} onClick={() => { void navigator.clipboard?.writeText(abs(r.link)); }}><Copy className="h-3.5 w-3.5" />{tx('Copy link', 'लिंक कॉपी')}</button>
                <button className={`${btn} border border-emerald-500 bg-white text-emerald-800`} onClick={() => setRecv({ id: r.id, ref: r.partySaid?.ref || '' })} data-testid="pay-received"><CheckCircle2 className="h-3.5 w-3.5" />{tx('Money received', 'पैसा मिल गया')}</button>
                <button className={`${btn} border border-slate-300 bg-white text-slate-500`} disabled={busy} onClick={() => { if (window.confirm(tx('Cancel this bill? The link will show “cancelled”.', 'यह बिल रद्द करें? लिंक पर “रद्द” दिखेगा।'))) void run(() => api.prAct(r.id, 'cancel')); }}><XCircle className="h-3.5 w-3.5" />{tx('Cancel', 'रद्द')}</button>
              </div>
            )}
            {recv && recv.id === r.id && (
              <div className="flex gap-2">
                <input className={inp} placeholder={tx('UTR / cheque no. / “cash”', 'UTR / चेक नं. / “cash”')} value={recv.ref} onChange={(e) => setRecv({ id: r.id, ref: e.target.value })} data-testid="pay-ref" />
                <button className={`${btn} bg-slate-900 text-white`} disabled={busy || recv.ref.trim().length < 2} onClick={() => run(async () => { await api.prAct(r.id, 'received', recv?.ref); setRecv(null); })} data-testid="pay-ref-save">{tx('Save', 'सेव')}</button>
              </div>
            )}
          </div>
        );
      })}
      {err && <p className="text-xs font-semibold text-red-700" role="alert">{err}</p>}
    </div>
  );
};
