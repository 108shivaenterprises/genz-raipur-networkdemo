/**
 * v46 — Shop QR partners (broker) + the GENZ desk list (admin).
 * A broker puts his QR at a shop / society gate, agrees the shopkeeper's share (sale / rent, % of his brokerage or fixed ₹),
 * and gets the leads customers send by scanning it. The shopkeeper accepts the terms and follows his leads on his own page
 * (link + mobile code). Later work on a lead's mobile number by the same broker is linked automatically.
 */
import { PageTitle } from './PageTitle.js';
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Store, Printer, Send, Phone, MessageCircle, AlertTriangle, CheckCircle2, Link2, Pause, Play, XCircle, ShieldCheck, MessagesSquare, Sparkles } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { formatINR } from '../lib/utils.js';
import { LEAD_KINDS, LEAD_STATUSES, PAYOUT_LABEL, DEFAULT_TERMS, PARTNER_LIMITS, PAY_MODES, OVERDUE, SHARE_CHANGE_LABEL, partnerAmount, sideOfKind, termsText, cutText, checkTerms, refOk, payRecordText, type PartnerTerms, type Cut, type PartnerPayMode } from '../shared/shopPartner.js';
import type { UserProfile } from '../types/index.js';

const inp = 'min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm';
const dark = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-40';
const light = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-40';
const when = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
const abs = (path: string) => `${window.location.origin}${path}`;

const CutInput: React.FC<{ label: string; value: Cut; onChange: (c: Cut) => void; testId: string }> = ({ label, value, onChange, testId }) => {
  const tx = useTx();
  return (
    <div>
      <label className="text-xs font-semibold text-slate-700">{label}</label>
      <div className="mt-1 flex gap-2">
        <select className={inp + ' !w-28'} value={value.mode} onChange={(e) => onChange({ mode: e.target.value as Cut['mode'], value: e.target.value === 'PCT' ? 20 : 2000 })} data-testid={`${testId}-mode`}>
          <option value="PCT">{tx('% of my brokerage', 'मेरी ब्रोकरेज का %')}</option>
          <option value="FIXED">{tx('Fixed ₹ per deal', 'हर डील पर ₹')}</option>
        </select>
        <input className={inp} type="number" inputMode="decimal" min={0} step={value.mode === 'PCT' ? 0.5 : 100} value={value.value || ''} onChange={(e) => onChange({ ...value, value: Number(e.target.value) })} data-testid={`${testId}-value`} />
      </div>
    </div>
  );
};

const TermsEditor: React.FC<{ value: PartnerTerms; onChange: (t: PartnerTerms) => void }> = ({ value, onChange }) => {
  const tx = useTx();
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <CutInput label={tx('Share on a SALE', 'बिक्री पर हिस्सा')} value={value.sale} onChange={(c) => onChange({ ...value, sale: c })} testId="sp-sale" />
      <CutInput label={tx('Share on a RENT', 'किराये पर हिस्सा')} value={value.rent} onChange={(c) => onChange({ ...value, rent: c })} testId="sp-rent" />
      <div>
        <label className="text-xs font-semibold text-slate-700">{tx('A lead stays the shop’s for (days)', 'लीड कितने दिन दुकान की रहे')}</label>
        <input className={inp + ' mt-1'} type="number" min={PARTNER_LIMITS.minLockDays} max={PARTNER_LIMITS.maxLockDays} value={value.lockDays} onChange={(e) => onChange({ ...value, lockDays: Number(e.target.value) })} data-testid="sp-lock" />
      </div>
    </div>
  );
};

const AddPartner: React.FC<{ city: string; onDone: (x: { partner: any; link: string }) => void; onCancel: () => void }> = ({ city, onDone, onCancel }) => {
  const tx = useTx();
  const [f, setF] = useState({ shopName: '', personName: '', phone: '', area: '', city, consent: false });
  const [terms, setTerms] = useState<PartnerTerms>(DEFAULT_TERMS);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const tErr = checkTerms(terms);
  const go = async () => {
    setBusy(true); setErr('');
    try { const r = await api.spCreate({ ...f, terms }); onDone(r); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" data-testid="sp-add">
      <p className="text-sm font-bold text-slate-900">{tx('New shop partner', 'नया दुकान पार्टनर')}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={inp} placeholder={tx('Shop / place name (e.g. Gupta Kirana)', 'दुकान / जगह का नाम (जैसे गुप्ता किराना)')} value={f.shopName} onChange={(e) => setF({ ...f, shopName: e.target.value })} data-testid="sp-shop" />
        <input className={inp} placeholder={tx('Shopkeeper’s name', 'दुकानदार का नाम')} value={f.personName} onChange={(e) => setF({ ...f, personName: e.target.value })} data-testid="sp-person" />
        <input className={inp} inputMode="numeric" maxLength={14} placeholder={tx('Shopkeeper’s mobile', 'दुकानदार का मोबाइल')} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} data-testid="sp-phone" />
        <input className={inp} placeholder={tx('Area / locality of the shop', 'दुकान का इलाका')} value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} data-testid="sp-area" />
      </div>
      <TermsEditor value={terms} onChange={setTerms} />
      <p className="text-[11px] text-slate-500">{termsText(terms)} · {tx('You pay the shop yourself; GENZ only records it. Call it a “referral fee” — check with your CA / lawyer once.', 'हिस्सा आप ख़ुद दुकान को देंगे; GENZ सिर्फ़ रिकॉर्ड रखता है। इसे “रेफ़रल फ़ीस” कहें — एक बार CA / वकील से पूछ लें।')}</p>
      <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} data-testid="sp-consent" />
        <span>{tx('The shopkeeper agreed to keep my QR and to be contacted on this mobile. He will accept these terms on his own phone before the QR starts.', 'दुकानदार मेरा QR रखने और इस मोबाइल पर संपर्क के लिए सहमत है। QR चालू होने से पहले वह अपने फ़ोन पर ये शर्तें मंज़ूर करेगा।')}</span></label>
      {(err || (tErr && f.shopName)) && <p className="text-xs font-semibold text-red-700" role="alert">{err || tErr}</p>}
      <div className="flex gap-2">
        <button className={dark} disabled={busy || !f.consent || !!tErr || f.shopName.trim().length < 2 || f.personName.trim().length < 2 || f.phone.replace(/\D/g, '').length < 10 || f.area.trim().length < 2} onClick={go} data-testid="sp-create">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{tx('Add & send terms', 'जोड़ें और शर्तें भेजें')}</button>
        <button className={light} onClick={onCancel}>{tx('Cancel', 'रद्द')}</button>
      </div>
    </div>
  );
};

const waText = (p: any, link: string, hi = true) => (hi
  ? `नमस्ते ${p.personName} जी, GENZ पर हमारी QR पार्टनरशिप — आपका हिस्सा: ${termsText(p.terms, true)}। यह लिंक खोलें, अपना मोबाइल (••${p.phoneLast4}) डालें और "मंज़ूर" दबाएँ: ${abs(link)}`
  : `Namaste ${p.personName} ji, our QR partnership on GENZ — your share: ${termsText(p.terms)}. Open this link, enter your mobile (••${p.phoneLast4}) and tap Accept: ${abs(link)}`);

const PartnerCard: React.FC<{ p: any; onChange: () => void }> = ({ p, onChange }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const [edit, setEdit] = useState(false); const [terms, setTerms] = useState<PartnerTerms>(p.pending?.terms || p.terms); const [note, setNote] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<any>) => { setBusy(true); setErr(''); try { await fn(); onChange(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const tone = p.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : p.status === 'PENDING' ? 'bg-amber-100 text-amber-900' : p.status === 'PAUSED' ? 'bg-slate-200 text-slate-700' : 'bg-red-100 text-red-700';
  const statusText = { ACTIVE: tx('QR live', 'QR चालू'), PENDING: tx('Waiting for his “Accept”', 'उनकी “मंज़ूरी” बाकी'), PAUSED: tx('Paused', 'रुका'), ENDED: tx('Ended', 'ख़त्म') }[p.status as 'ACTIVE'];
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" data-testid={`sp-partner-${p.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Store className="h-4 w-4 text-slate-500" />{p.shopName}</p>
          <p className="text-xs text-slate-500">{p.personName} · ••{p.phoneLast4} · {p.area}</p></div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{statusText}</span>
      </div>
      {p.codeForPartner && (
        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-2 text-center" data-testid="sp-code">
          <p className="text-[11px] font-semibold text-amber-900">{tx('He is opening his page — read him this code', 'वे अपना पेज खोल रहे हैं — यह कोड बताएँ')}</p>
          <p className="font-mono text-2xl font-extrabold tracking-widest text-slate-900">{p.codeForPartner}</p>
        </div>
      )}
      {p.status === 'PAUSED' && p.pausedBy === 'SYSTEM' && (
        <p className="rounded-md bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-800" data-testid="sp-autopaused">⏸ {tx(`GENZ paused this QR: a share has been unpaid for over ${OVERDUE.pauseDays} days. Pay it (mark it paid with the reference) and the QR starts again.`, `GENZ ने यह QR रोका है: एक हिस्सा ${OVERDUE.pauseDays} दिन से ज़्यादा बाकी है। चुकाकर (रेफ़रेंस के साथ) दर्ज करें — QR फिर चालू हो जाएगा।`)}</p>
      )}
      {['ACTIVE', 'PAUSED'].includes(p.status) && (
        <p className={`text-[11px] ${p.alerts?.phones > 0 ? 'text-emerald-800' : 'text-slate-500'}`} data-testid="sp-alerts-state">
          {p.alerts?.phones > 0 ? `🔔 ${tx(`His phone gets alerts (${p.alerts.phones})`, `उनके फ़ोन पर अलर्ट चालू (${p.alerts.phones})`)}` : `🔕 ${tx('No alerts on his phone yet — ask him to open his page and tap “Turn alerts on”. Then he hears about every lead and every change of his share.', 'उनके फ़ोन पर अलर्ट अभी बंद — उनसे पेज खुलवाकर “अलर्ट चालू करें” दबवाएँ। फिर हर लीड और हिस्से के हर बदलाव की ख़बर उन्हें मिलेगी।')}`}
        </p>
      )}
      <p className="text-xs text-slate-700">{termsText(p.terms, hi)} <span className="text-slate-400">(v{p.termsVersion})</span></p>
      {p.pending && <p className="rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-900">{tx('Change waiting for his yes', 'बदलाव — उनकी हाँ बाकी')}: {termsText(p.pending.terms, hi)}</p>}
      <div className="grid grid-cols-4 gap-1 text-center text-[11px]">
        {[[tx('Scans', 'स्कैन'), p.scans], [tx('Leads', 'लीड'), p.counts.leads], [tx('Deals', 'डील'), p.counts.won], [tx('Due', 'बाकी'), formatINR(p.counts.due)]].map(([k, v]) => (
          <div key={String(k)} className="rounded-md bg-slate-50 py-1"><b className="block text-sm text-slate-900">{v}</b>{k}</div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {p.pageUrl && p.status !== 'ENDED' && <a className={light + ' !min-h-9 !text-xs'} href={`https://wa.me/?text=${encodeURIComponent(waText(p, p.pageUrl, hi))}`} target="_blank" rel="noopener noreferrer" data-testid="sp-wa"><Send className="h-3.5 w-3.5" />{tx('Send his page link', 'उनका पेज लिंक भेजें')}</a>}
        {p.status !== 'ENDED' && <a className={light + ' !min-h-9 !text-xs'} href={p.posterUrl} target="_blank" rel="noopener noreferrer" data-testid="sp-poster"><Printer className="h-3.5 w-3.5" />{tx('QR poster', 'QR पोस्टर')}</a>}
        {p.status !== 'ENDED' && <a className={light + ' !min-h-9 !text-xs'} href={`${p.posterUrl}?size=a4`} target="_blank" rel="noopener noreferrer" data-testid="sp-poster-a4">A4</a>}
        {p.status !== 'ENDED' && <a className={light + ' !min-h-9 !text-xs'} href={`/api/shop-partners/${p.id}/leaflet`} target="_blank" rel="noopener noreferrer" data-testid="sp-leaflet">{tx('Leaflet to explain', 'समझाने वाला पर्चा')}</a>}
        {p.status !== 'ENDED' && <button className={light + ' !min-h-9 !text-xs'} onClick={() => setEdit(!edit)} data-testid="sp-edit-terms">{tx('Change share', 'हिस्सा बदलें')}</button>}
        {p.status === 'ACTIVE' && <button className={light + ' !min-h-9 !text-xs'} disabled={busy} onClick={() => run(() => api.spAction(p.id, 'pause'))}><Pause className="h-3.5 w-3.5" />{tx('Pause', 'रोकें')}</button>}
        {p.status === 'PAUSED' && <button className={light + ' !min-h-9 !text-xs'} disabled={busy || (p.pausedBy === 'SYSTEM' && p.overdue > 0)} onClick={() => run(() => api.spAction(p.id, 'resume'))}><Play className="h-3.5 w-3.5" />{tx('Resume', 'फिर चालू')}</button>}
        {p.status !== 'ENDED' && <button className={light + ' !min-h-9 !text-xs'} disabled={busy} onClick={() => { if (window.confirm(tx('Make a new page link? The old link stops and he signs in again.', 'नया पेज लिंक बनाएँ? पुराना बंद होगा, उन्हें दोबारा कोड डालना होगा।'))) run(() => api.spAction(p.id, 'link')); }}><Link2 className="h-3.5 w-3.5" />{tx('New link', 'नया लिंक')}</button>}
        {p.status !== 'ENDED' && <button className={light + ' !min-h-9 !text-xs !text-red-700'} disabled={busy} onClick={() => { if (window.confirm(tx('End this partnership? The QR stops. Leads already in keep their share.', 'साझेदारी ख़त्म करें? QR बंद होगा। पहले आई लीड का हिस्सा वैसा ही रहेगा।'))) run(() => api.spAction(p.id, 'end')); }}><XCircle className="h-3.5 w-3.5" />{tx('End', 'ख़त्म')}</button>}
      </div>
      {edit && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-2">
          <TermsEditor value={terms} onChange={setTerms} />
          <input className={inp} placeholder={tx('Note for him (optional)', 'उनके लिए नोट (ज़रूरी नहीं)')} value={note} onChange={(e) => setNote(e.target.value)} />
          <p className="text-[11px] text-slate-500">{p.status === 'PENDING' ? tx('He has not accepted yet, so this simply corrects the proposal.', 'उन्होंने अभी मंज़ूर नहीं किया, इसलिए यह प्रस्ताव ही सुधरेगा।') : tx('The current share stays until he accepts on his page. A change applies only to leads after that.', 'उनकी मंज़ूरी तक पुराना हिस्सा चलेगा। बदलाव सिर्फ़ आगे की लीड पर लगेगा।')}</p>
          <div className="flex gap-2">
            <button className={dark + ' !min-h-9 !text-xs'} disabled={busy || !!checkTerms(terms)} onClick={() => run(() => api.spTerms(p.id, terms, note)).then(() => setEdit(false))} data-testid="sp-terms-send">{tx('Propose', 'प्रस्ताव भेजें')}</button>
            {p.pending && <button className={light + ' !min-h-9 !text-xs'} disabled={busy} onClick={() => run(() => api.spAction(p.id, 'terms/withdraw'))}>{tx('Withdraw change', 'बदलाव वापस लें')}</button>}
          </div>
        </div>
      )}
      {(p.devices || []).length > 0 && (
        <p className="text-[11px] text-slate-500">{tx('His page is open on', 'उनका पेज खुला है')}: {p.devices.map((d: any) => (
          <span key={d.id} className="mr-2">{d.label} <button className="text-red-700 underline" onClick={() => run(() => api.spDelDevice(p.id, d.id))}>{tx('remove', 'हटाएँ')}</button></span>
        ))}</p>
      )}
      {err && <p className="text-xs font-semibold text-red-700" role="alert">{err}</p>}
    </div>
  );
};

const LeadCard: React.FC<{ l: any; onChange: () => void }> = ({ l, onChange }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const [mode, setMode] = useState<'' | 'won' | 'lost' | 'paid' | 'need' | 'share'>(''); const [val, setVal] = useState(''); const [reason, setReason] = useState(''); const [pm, setPm] = useState<PartnerPayMode>('UPI'); const [reply, setReply] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const kind = LEAD_KINDS.find((k) => k.id === l.kind)!; const side = sideOfKind(l.kind); const cut: Cut = side === 'SALE' ? l.terms.sale : l.terms.rent;
  const run = async (fn: () => Promise<any>) => { setBusy(true); setErr(''); try { await fn(); setMode(''); setVal(''); setReason(''); setReply(''); onChange(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const pay = l.payout ? PAYOUT_LABEL[l.payout.status as keyof typeof PAYOUT_LABEL] : null;
  return (
    <div className={`space-y-1.5 rounded-xl border bg-white p-3 ${l.flags.length ? 'border-red-300' : 'border-slate-200'}`} data-testid={`sp-lead-${l.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-900">{l.name} <span className="ml-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-800">{hi ? kind.hi : kind.en}</span></p>
        <span className="text-[11px] text-slate-500">{tx('via', 'से')} <b>{l.shopName}</b> · {when(l.createdAt)}</span>
      </div>
      <p className="text-xs text-slate-600">{l.locality}{l.budget ? ` · ${l.budget}` : ''}{l.propertyType ? ` · ${l.propertyType}` : ''}{l.note ? ` · “${l.note}”` : ''}</p>
      {l.homeTitle && <p className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900" data-testid="sp-lead-home">👍 {tx('Interested in', 'पसंद आया')}: {l.homeTitle} <span className="font-normal text-emerald-800">· {l.homeOwn ? tx('your listing', 'आपकी लिस्टिंग') : tx('another GENZ broker’s listing — he never sees this lead; use a co-broking offer', 'दूसरे GENZ ब्रोकर की लिस्टिंग — उसे यह लीड नहीं दिखती; को-ब्रोकिंग ऑफ़र से काम करें')}</span></p>}
      {l.promise && <p className="rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-700" data-testid="sp-lead-promise"><ShieldCheck className="mr-0.5 inline h-3 w-3 text-emerald-700" />{tx('“No direct deal” promise ticked and signed by', '“सीधा सौदा नहीं” की सहमति — हस्ताक्षर')} <b>{l.promise.signName}</b> · {when(l.promise.at)} · {tx('wording', 'शब्द')} {l.promise.version}</p>}
      {/* v56 — a client room first: the chat, the homes shown and the visits stay on record (a call or WhatsApp does not) */}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={dark + ' !min-h-10'} data-testid="sp-lead-room" onClick={() => {
          const kindOfRoom = l.kind === 'BUY' ? 'BUYER' : l.kind === 'RENT_IN' ? 'RENTER' : 'OTHER';
          try { sessionStorage.setItem('genz.newroom', JSON.stringify({ clientName: l.name, phone: l.phone, kind: kindOfRoom, note: `Shop QR lead ${l.id} · ${l.shopName}${l.homeTitle ? ` · ${l.homeTitle}` : ''}`.slice(0, 190), homeId: l.homeId || '', homeTitle: l.homeTitle || '' })); } catch { /* storage blocked: the form opens empty */ }
          window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: 'clientroom' }));
        }}><MessagesSquare className="h-4 w-4" />{tx('Open a client room', 'क्लाइंट रूम खोलें')}</button>
        {(l.kind === 'BUY' || l.kind === 'RENT_IN') && <button type="button" className={light + ' !min-h-10 !text-xs'} data-testid="sp-lead-need" onClick={() => setMode(mode === 'need' ? '' : 'need')}><Sparkles className="h-3.5 w-3.5" />{tx('No home yet? Find in network', 'घर नहीं है? नेटवर्क में ढूँढें')}</button>}
        <a className={light + ' !min-h-10 !text-xs'} href={`tel:+91${l.phone}`}><Phone className="h-3.5 w-3.5" />{l.phone}</a>
        <a className={light + ' !min-h-10 !text-xs'} href={`https://wa.me/91${l.phone}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a>
      </div>
      <p className="text-[11px] text-slate-500">{tx('A call or WhatsApp is not recorded in GENZ. A client room keeps the chat, the homes you show and the visits on record — useful if this lead or the shop’s share is ever questioned.', 'कॉल या WhatsApp GENZ में दर्ज नहीं होता। क्लाइंट रूम में चैट, दिखाए घर और विज़िट दर्ज रहते हैं — लीड या दुकान के हिस्से पर कभी सवाल उठे तो काम आता है।')}</p>
      {l.links.length > 0 && <div className="flex flex-wrap gap-1">{l.links.map((x: any, i: number) => <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{hi ? x.hi : x.en} · {when(x.at)}</span>)}</div>}
      {l.flags.map((f: any) => <p key={f.code} className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-800" data-testid="sp-flag"><AlertTriangle className="h-3.5 w-3.5" />{hi ? f.hi : f.en}</p>)}
      <p className="text-[11px] text-slate-500"><ShieldCheck className="mr-0.5 inline h-3 w-3" />{l.locked ? tx(`The shop’s lead till ${when(l.lockUntil)} · their share: ${cutText(cut)}`, `${when(l.lockUntil)} तक दुकान की लीड · हिस्सा: ${cutText(cut, true)}`) : tx('Protection over', 'सुरक्षा का समय पूरा')}</p>
      {l.status !== 'WON' && l.auto && (
        <p className="rounded-md bg-indigo-50 px-2 py-1 text-[11px] text-indigo-900" data-testid="sp-auto-share">
          {tx(`The app has worked out the shop’s share from the deal (only the brokerage on this lead’s own side): ${formatINR(l.auto.amount)} (your brokerage ${formatINR(l.auto.brokerage)} · ${cutText(cut)}). It follows the final price and the owner’s mandate by itself — and the shop is told whenever it changes.`,
            `ऐप ने डील से दुकान का हिस्सा निकाला (सिर्फ़ इस लीड की तरफ़ की ब्रोकरेज से): ${formatINR(l.auto.amount)} (आपकी ब्रोकरेज ${formatINR(l.auto.brokerage)} · ${cutText(cut, true)})। यह फ़ाइनल रेट और मालिक के मैंडेट के साथ अपने आप बदलता है — और बदलने पर दुकान को ख़बर जाती है।`)}
        </p>
      )}
      {l.status !== 'WON' ? (
        <div className="flex flex-wrap items-center gap-1">
          {LEAD_STATUSES.filter((s) => !['WON', 'LOST'].includes(s.id)).map((s) => (
            <button key={s.id} disabled={busy} onClick={() => run(() => api.spLeadStatus(l.id, s.id))} className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold ${l.status === s.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{hi ? s.hi : s.en}</button>
          ))}
          <button onClick={() => setMode(mode === 'won' ? '' : 'won')} className="inline-flex min-h-9 items-center rounded-full border border-emerald-500 bg-emerald-50 px-3 text-xs font-bold text-emerald-800" data-testid="sp-won">{tx('Deal done', 'डील हुई')}</button>
          <button onClick={() => setMode(mode === 'lost' ? '' : 'lost')} className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold ${l.status === 'LOST' ? 'border-red-600 bg-red-600 text-white' : 'border-red-300 text-red-700'}`}>{tx('Not going ahead', 'आगे नहीं बढ़ी')}</button>
        </div>
      ) : (
        <div className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900" data-testid="sp-won-box">
          <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />{tx('Deal done', 'डील हुई')} · {tx('your brokerage', 'आपकी ब्रोकरेज')} {formatINR(l.won.brokerage)} · <b data-testid="sp-fixed-share">{tx('shop’s share', 'दुकान का हिस्सा')} {formatINR(l.won.amount)}</b>
          {pay && <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${l.payout.status === 'RECEIVED' ? 'bg-emerald-200' : l.payout.status === 'NOT_RECEIVED' ? 'bg-red-200 text-red-900' : 'bg-amber-200 text-amber-900'}`}>{hi ? pay.hi : pay.en}</span>}
          <p className="mt-0.5 text-[11px] text-emerald-800">{l.won.source === 'TYPED' ? tx('You wrote this brokerage (the deal is not in the app) — the shop was asked to confirm it.', 'यह ब्रोकरेज आपने ख़ुद लिखी (डील ऐप में नहीं चली) — दुकान से पुष्टि माँगी गई।') : tx('Worked out by the app from the final price and this lead’s own side of the brokerage.', 'अंतिम भाव और इस लीड की तरफ़ की ब्रोकरेज से ऐप ने निकाला।')}</p>
          {l.payout?.ref && <p className="text-[11px]">{l.payout.mode || 'UPI'} · {tx('ref', 'रेफ़')} {l.payout.ref}</p>}
          {l.payout?.partnerNote && <p className="mt-1 text-red-800">“{l.payout.partnerNote}”</p>}
          {l.unpaidDays >= 3 && <p className="mt-1 font-semibold text-red-800" data-testid="sp-unpaid">⏳ {tx(`Unpaid for ${l.unpaidDays} days — the QR pauses itself at ${OVERDUE.pauseDays} days.`, `${l.unpaidDays} दिन से बाकी — ${OVERDUE.pauseDays} दिन पर QR अपने आप रुक जाएगा।`)}</p>}
          <div className="mt-1 flex flex-wrap gap-3">
            {['DUE', 'NOT_RECEIVED'].includes(l.payout?.status) && <button className="underline" onClick={() => setMode('paid')} data-testid="sp-paid">{tx('I have paid', 'मैंने चुका दिया')}</button>}
            {['DUE', 'NOT_RECEIVED'].includes(l.payout?.status) && <button className="underline" onClick={() => setMode(mode === 'share' ? '' : 'share')} data-testid="sp-fix-share">{tx('Correct the share', 'हिस्सा सुधारें')}</button>}
          </div>
        </div>
      )}
      {(l.shareChanges || []).length > 0 && (
        <div className="space-y-1" data-testid="sp-changes">
          {(l.shareChanges as any[]).slice(-3).map((c) => (
            <div key={c.id} className={`rounded-md px-2 py-1 text-[11px] ${c.status === 'DISPUTED' ? 'bg-red-50 text-red-900' : c.status === 'OK' ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
              <b>{c.from > 0 ? `${formatINR(c.from)} → ` : ''}{formatINR(c.to)}</b> · {hi ? SHARE_CHANGE_LABEL[c.by as keyof typeof SHARE_CHANGE_LABEL]?.hi : SHARE_CHANGE_LABEL[c.by as keyof typeof SHARE_CHANGE_LABEL]?.en}{c.reason ? ` — “${c.reason}”` : ''} · {when(c.at)}
              <span className="ml-1 font-semibold">{c.status === 'OK' ? tx('shop accepted ✔', 'दुकान ने माना ✔') : c.status === 'DISPUTED' ? tx('shop says NOT right', 'दुकान: सही नहीं') : tx('waiting for the shop', 'दुकान का जवाब बाकी')}</span>
              {c.status === 'DISPUTED' && c.note && <span className="block">“{c.note}”</span>}
              {c.brokerNote && <span className="block">{tx('Your reply', 'आपका जवाब')}: “{c.brokerNote}”</span>}
              {c.status === 'DISPUTED' && !c.brokerNote && (
                <span className="mt-1 flex gap-1"><input className={inp + ' !min-h-8 !text-xs'} placeholder={tx('Reply to the shop', 'दुकान को जवाब')} value={reply} onChange={(e) => setReply(e.target.value)} data-testid="sp-reply" />
                  <button className={dark + ' !min-h-8 !text-xs'} disabled={busy || reply.trim().length < 2} onClick={() => run(() => api.spChangeReply(l.id, c.id, reply))} data-testid="sp-reply-send">{tx('Send', 'भेजें')}</button></span>
              )}
            </div>
          ))}
        </div>
      )}
      {l.askState?.answer && (
        <p className={`rounded-md px-2 py-1 text-[11px] font-semibold ${l.askState.answer === 'YES' ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`} data-testid="sp-customer-said">
          {l.askState.answer === 'YES' ? tx('The customer told GENZ: it went ahead with you.', 'ग्राहक ने GENZ को बताया: आपके साथ बात आगे बढ़ी।') : tx('The customer told GENZ: it did not go ahead.', 'ग्राहक ने GENZ को बताया: बात आगे नहीं बढ़ी।')}
        </p>
      )}
      {l.status === 'LOST' && l.lostReason && <p className="text-[11px] text-slate-500">{tx('Reason', 'कारण')}: {l.lostReason}</p>}
      {mode === 'need' && (
        <div className="space-y-1 rounded-lg bg-slate-50 p-2" data-testid="sp-need-form">
          <p className="text-[11px] text-slate-600">{tx('Adds this client to your Buyer Needs and opens Magic Match across the network. Other brokers see only his initials; the lead stays yours.', 'इस क्लाइंट को आपके बायर नीड में जोड़ता है और पूरे नेटवर्क में मैजिक मैच खोलता है। दूसरे ब्रोकर को सिर्फ़ उसके नाम के अक्षर दिखते हैं; लीड आपकी ही रहती है।')}</p>
          <label className="text-[11px] font-semibold text-slate-700">{tx('Budget (max, ₹ lakh) / monthly rent (₹ thousand)', 'बजट (अधिकतम, ₹ लाख) / किराया (₹ हज़ार महीना)')}</label>
          <input className={inp} type="number" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} data-testid="sp-need-budget" />
          <button className={dark + ' !min-h-9 !text-xs'} disabled={busy || !(Number(val) > 0)} data-testid="sp-need-save" onClick={() => run(async () => {
            const rent = l.kind === 'RENT_IN'; const max = Math.round(Number(val) * (rent ? 1000 : 100000));
            const T: Record<string, string> = { Flat: 'Residential Flat', House: 'Independent House', Plot: 'Residential Plot', Shop: 'Commercial Shop', Office: 'Commercial Office', Warehouse: 'Warehouse / Godown' };
            await api.createRequirement({ customerName: l.name, customerPhone: l.phone, budgetMin: Math.max(1, Math.round(max * 0.7)), budgetMax: max, city: l.city || 'Raipur', preferredLocalities: [l.locality], preferredTags: [], propertyType: T[l.propertyType || ''] || 'Residential Flat', transactionType: rent ? 'Rent' : 'Sale', purpose: 'Self-use', urgency: 'Moderate (1-3 months)' });
            window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: 'matches' }));
          })}>{tx('Add & find matches', 'जोड़ें और मैच ढूँढें')}</button>
        </div>
      )}
      {mode === 'won' && (
        <div className="space-y-1.5 rounded-lg bg-slate-50 p-2" data-testid="sp-won-form">
          {l.auto ? (
            <>
              <p className="text-xs text-slate-800" data-testid="sp-won-auto">{tx('From the deal', 'डील से')}: {tx('your brokerage', 'आपकी ब्रोकरेज')} <b>{formatINR(l.auto.brokerage)}</b> → {tx('shop’s share', 'दुकान का हिस्सा')} <b>{formatINR(l.auto.amount)}</b> ({cutText(cut, hi)})</p>
              <p className="text-[11px] text-slate-500">{tx('Nothing to type — the app took it from the final price and the brokerage on this lead’s own side. The shop sees the same figure.', 'कुछ लिखना नहीं है — ऐप ने अंतिम भाव और इस लीड की अपनी तरफ़ की ब्रोकरेज से निकाला है। दुकान को यही रकम दिखेगी।')}</p>
              <details className="text-xs">
                <summary className="cursor-pointer font-semibold text-slate-700" data-testid="sp-won-change">{tx('This is not my brokerage — change it', 'यह मेरी ब्रोकरेज नहीं — बदलें')}</summary>
                <div className="mt-1 space-y-1">
                  <input className={inp} type="number" inputMode="numeric" placeholder={tx('Your real brokerage (₹)', 'आपकी असली ब्रोकरेज (₹)')} value={val} onChange={(e) => setVal(e.target.value)} data-testid="sp-brokerage" />
                  <input className={inp} placeholder={tx('Why? (the shop sees this)', 'क्यों? (दुकान को दिखेगा)')} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="sp-reason" />
                  {Number(val) > 0 && <p className="text-[11px] text-amber-800">{tx('Shop’s share', 'दुकान का हिस्सा')}: <b>{formatINR(partnerAmount(cut, Number(val)))}</b> — {tx('the shop is told the old and the new amount, and can say it is not right.', 'दुकान को पुराना और नया हिस्सा दिखेगा, और वह “सही नहीं” कह सकती है।')}</p>}
                </div>
              </details>
              <button className={dark + ' !min-h-9 !text-xs'} disabled={busy || (Number(val) > 0 && reason.trim().length < 3)} onClick={() => run(() => (Number(val) > 0 ? api.spLeadWon(l.id, Math.round(Number(val)), reason) : api.spLeadWon(l.id)))} data-testid="sp-won-save">{tx('Confirm — deal done', 'पक्का करें — डील हुई')}</button>
            </>
          ) : (
            <>
              <label className="text-[11px] font-semibold text-slate-700">{tx('This deal is not in GENZ — write your own brokerage on it (₹)', 'यह डील GENZ में नहीं चली — इस पर आपकी ब्रोकरेज (₹) लिखें')}</label>
              <input className={inp} type="number" inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} data-testid="sp-brokerage" />
              {Number(val) > 0 && <p className="text-[11px] text-slate-600">{tx('Shop’s share', 'दुकान का हिस्सा')}: <b>{formatINR(partnerAmount(cut, Number(val)))}</b> ({cutText(cut, hi)})</p>}
              <p className="text-[11px] text-slate-500">{tx('The shop is asked to confirm this figure on its page. A deal run through GENZ (final price + mandate) fills this in by itself.', 'दुकान से अपने पेज पर इस रकम की पुष्टि माँगी जाएगी। GENZ में चली डील (अंतिम भाव + मैंडेट) में यह अपने आप भर जाता है।')}</p>
              <button className={dark + ' !min-h-9 !text-xs'} disabled={busy || !(Number(val) > 0)} onClick={() => run(() => api.spLeadWon(l.id, Math.round(Number(val))))} data-testid="sp-won-save">{tx('Save', 'सेव करें')}</button>
            </>
          )}
        </div>
      )}
      {mode === 'share' && l.won && (
        <div className="space-y-1.5 rounded-lg bg-slate-50 p-2" data-testid="sp-share-form">
          <p className="text-[11px] text-slate-600">{tx(`Now: brokerage ${formatINR(l.won.brokerage)} → shop’s share ${formatINR(l.won.amount)}. The shop is told the old and the new amount with your reason.`, `अभी: ब्रोकरेज ${formatINR(l.won.brokerage)} → दुकान का हिस्सा ${formatINR(l.won.amount)}। दुकान को पुराना-नया हिस्सा और आपकी वजह दिखेगी।`)}</p>
          <input className={inp} type="number" inputMode="numeric" placeholder={tx('Correct brokerage (₹)', 'सही ब्रोकरेज (₹)')} value={val} onChange={(e) => setVal(e.target.value)} data-testid="sp-share-brokerage" />
          <input className={inp} placeholder={tx('Why? (the shop sees this)', 'क्यों? (दुकान को दिखेगा)')} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="sp-share-reason" />
          {Number(val) > 0 && <p className="text-[11px] text-slate-600">{tx('New share', 'नया हिस्सा')}: <b>{formatINR(partnerAmount(cut, Number(val)))}</b></p>}
          <button className={dark + ' !min-h-9 !text-xs'} disabled={busy || !(Number(val) > 0) || reason.trim().length < 3} onClick={() => run(() => api.spLeadShare(l.id, Math.round(Number(val)), reason))} data-testid="sp-share-save">{tx('Save & tell the shop', 'सेव करें और दुकान को बताएँ')}</button>
        </div>
      )}
      {mode === 'lost' && (
        <div className="space-y-1 rounded-lg bg-slate-50 p-2">
          <input className={inp} placeholder={tx('Why? (the shop sees this)', 'क्यों? (दुकान वाले को दिखेगा)')} value={val} onChange={(e) => setVal(e.target.value)} />
          <p className="text-[11px] text-slate-500">{tx('If you work this number later, it still shows to the shop and to GENZ.', 'अगर बाद में इस नंबर पर काम हुआ तो वह दुकान और GENZ को दिखेगा।')}</p>
          <button className={dark + ' !min-h-9 !text-xs'} disabled={busy || val.trim().length < 3} onClick={() => run(() => api.spLeadStatus(l.id, 'LOST', val))}>{tx('Save', 'सेव करें')}</button>
        </div>
      )}
      {mode === 'paid' && (
        <div className="space-y-1.5 rounded-lg bg-slate-50 p-2" data-testid="sp-paid-form">
          <div className="flex gap-1">
            {PAY_MODES.map((m) => <button key={m.id} type="button" onClick={() => setPm(m.id)} className={`inline-flex min-h-9 flex-1 items-center justify-center rounded-lg border px-2 text-xs font-semibold ${pm === m.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`} data-testid={`sp-mode-${m.id}`}>{hi ? m.hi : m.en}</button>)}
          </div>
          {pm !== 'CASH' && <input className={inp} placeholder={tx('UPI / bank reference (UTR) — needed', 'UPI / बैंक रेफ़रेंस (UTR) — ज़रूरी')} value={val} onChange={(e) => setVal(e.target.value)} data-testid="sp-paid-ref" />}
          <p className="text-[11px] text-slate-500">{pm === 'CASH' ? tx('Cash has no reference — it counts only when the shop taps “Received” on his page.', 'नकद का रेफ़रेंस नहीं होता — दुकान वाले के पेज पर “मिल गया” दबाने पर ही गिना जाएगा।') : tx('The shop sees this reference and confirms on his page. Paying by UPI / bank keeps proof for both of you.', 'दुकान को यह रेफ़रेंस दिखेगा और वह अपने पेज पर पुष्टि करेगी। UPI / बैंक से भेजने पर दोनों के पास सबूत रहता है।')}</p>
          <button className={dark + ' !min-h-9 !text-xs'} disabled={busy || !refOk(pm, val.trim())} onClick={() => run(() => api.spLeadPaid(l.id, pm, pm === 'CASH' ? '' : val.trim()))} data-testid="sp-paid-save">{tx('Mark paid — he confirms on his page', 'चुकाया दर्ज करें — वे अपने पेज पर पुष्टि करेंगे')}</button>
        </div>
      )}
      {err && <p className="text-xs font-semibold text-red-700" role="alert">{err}</p>}
    </div>
  );
};

/** v82 — how to win a shopkeeper: a message to send, the four things he asks, and the one-page leaflet */
const PitchKit: React.FC<{ name: string }> = ({ name }) => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const [copied, setCopied] = useState(false);
  const msg = hi
    ? `नमस्ते भाईसाहब! मैं ${name}, GENZ नेटवर्क का वेरिफ़ाइड ब्रोकर हूँ। आपकी दुकान पर मेरा एक QR लगेगा। आपके यहाँ कोई मकान / दुकान / प्लॉट किराये या ख़रीद-बिक्री की बात करे तो उसे QR स्कैन करा दीजिए — बस इतना। डील हो गई तो मेरी ब्रोकरेज में से आपका हिस्सा (जैसे बिक्री पर ${DEFAULT_TERMS.sale.value}%)। हिस्सा ऐप ख़ुद निकालता है और कुछ बदले तो आपके फ़ोन पर ख़बर आती है; पैसा मैं सीधे UPI से भेजूँगा, रेफ़रेंस के साथ। आपको कुछ लिखना-पढ़ना नहीं, ग्राहक से पैसे की बात नहीं।`
    : `Namaste! I am ${name}, a verified broker on GENZ Network. I will keep a QR at your shop. If anyone asks about renting, buying or selling a house / shop / plot, just let them scan it — that is all. When a deal happens you get your share of my brokerage (e.g. ${DEFAULT_TERMS.sale.value}% on a sale). The app works the share out and tells your phone if anything changes; I pay you directly by UPI with the reference. No paperwork, no talking money with the customer.`;
  const qa: [string, string, string, string][] = [
    ['What do I get?', 'मुझे क्या मिलेगा?', 'A share of my brokerage on every closed deal from your QR — agreed on your page before the QR starts.', 'आपके QR से आई हर पूरी डील पर मेरी ब्रोकरेज का हिस्सा — QR चालू होने से पहले आपके पेज पर तय।'],
    ['How do I know the amount is right?', 'रकम सही है, कैसे पता?', 'The app takes the final price and the brokerage on your customer’s own side (the buyer’s fee, or the owner’s signed mandate if the owner came through you) and works it out. If it ever changes you get an alert with the old and new amount, and you can say “not right”.', 'ऐप अंतिम भाव और आपके ग्राहक की तरफ़ की ब्रोकरेज (ख़रीदार की फ़ीस, या मालिक आपके ज़रिए आया तो उसका साइन किया मैंडेट) से रकम निकालता है। कभी बदले तो पुराना-नया हिस्सा अलर्ट में आता है, और आप “सही नहीं” कह सकते हैं।'],
    ['What if you pay late?', 'देर से दिया तो?', `You are reminded at 3, 7 and 12 days; at ${OVERDUE.pauseDays} days the QR pauses by itself; at ${OVERDUE.deskDays} days the GENZ desk looks at it.`, `३, ७, १२ दिन पर याद दिलाया जाता है; ${OVERDUE.pauseDays} दिन पर QR अपने आप रुकता है; ${OVERDUE.deskDays} दिन पर GENZ डेस्क देखता है।`],
    ['Will you cut me out later?', 'बाद में मुझे हटा तो नहीं दोगे?', 'The customer who came by your QR stays your lead for the protection period; any later work on that number shows on your page by itself.', 'आपके QR से आया ग्राहक सुरक्षा अवधि तक आपकी लीड रहता है; उसी नंबर पर बाद का कोई भी काम आपके पेज पर अपने आप दिखता है।'],
  ];
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-3" data-testid="sp-pitch">
      <summary className="cursor-pointer text-sm font-bold text-slate-900">{tx('How to explain it to a shopkeeper', 'दुकानदार को कैसे समझाएँ')}</summary>
      <div className="mt-2 space-y-2 text-xs text-slate-700">
        <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2">{msg}</p>
        <div className="flex flex-wrap gap-1.5">
          <button className={light + ' !min-h-9 !text-xs'} onClick={() => { try { void navigator.clipboard.writeText(msg).then(() => setCopied(true)); } catch { /* clipboard blocked */ } }} data-testid="sp-pitch-copy">{copied ? tx('Copied ✔', 'कॉपी हो गया ✔') : tx('Copy message', 'संदेश कॉपी करें')}</button>
          <a className={light + ' !min-h-9 !text-xs'} href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer"><Send className="h-3.5 w-3.5" />WhatsApp</a>
        </div>
        <div className="space-y-1.5">
          {qa.map((x) => <div key={x[0]}><p className="font-semibold text-slate-900">{hi ? x[1] : x[0]}</p><p>{hi ? x[3] : x[2]}</p></div>)}
        </div>
        <p className="text-[11px] text-slate-500">{tx('Print the one-page leaflet from a partner’s card (“Leaflet to explain”) — it shows his own terms and a worked example.', 'किसी पार्टनर के कार्ड से एक पन्ने का पर्चा (“समझाने वाला पर्चा”) प्रिंट करें — उसमें उनकी अपनी शर्तें और उदाहरण है।')}</p>
      </div>
    </details>
  );
};

const Desk: React.FC = () => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const [items, setItems] = useState<any[] | null>(null); const [err, setErr] = useState('');
  useEffect(() => { api.spAdmin().then((r) => setItems(r.items)).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="text-sm text-red-700">{err}</p>;
  if (!items) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />;
  return (
    <div className="space-y-2" data-testid="sp-desk">
      <p className="text-xs text-slate-600">{tx('Shares marked “not received” by a shop, shares unpaid for 30+ days, a changed share the shop says is not right, leads worked on after being marked lost, deals without a share written, and customers whose answer does not match the record. Call both sides; open a dispute if needed.', 'दुकान ने “नहीं मिला” बताया, हिस्सा 30+ दिन से बाकी, बदला हुआ हिस्सा दुकान को “सही नहीं”, “lost” बताकर भी काम हुआ, डील लगती है पर हिस्सा दर्ज नहीं, या ग्राहक का जवाब रिकॉर्ड से मेल नहीं खाता। दोनों से बात करें; ज़रूरत हो तो विवाद खोलें।')}</p>
      {items.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{tx('Nothing to look at.', 'देखने को कुछ नहीं।')}</p>}
      {items.map((x) => (
        <div key={x.id} className="rounded-xl border border-red-200 bg-white p-3 text-xs">
          <p className="font-bold text-slate-900">{x.brokerName} ⇄ {x.shopName} (••{x.partnerLast4})</p>
          <p className="text-slate-600">{x.locality} · {tx('customer', 'ग्राहक')} ••{x.phoneLast4} · {when(x.createdAt)} · {x.status}</p>
          {x.won && <p>{tx('Share', 'हिस्सा')} {formatINR(x.won.amount)} · {x.payout?.status}{x.payout?.partnerNote ? ` — “${x.payout.partnerNote}”` : ''}{x.unpaidDays > 0 ? ` · ${tx(`unpaid ${x.unpaidDays} days`, `${x.unpaidDays} दिन से बाकी`)}` : ''}{x.payout?.mode ? ` · ${x.payout.mode}${x.payout.ref ? ` ${x.payout.ref}` : ''}` : ''}</p>}
          {(x.shareChanges || []).map((c: any) => <p key={c.id} className="text-slate-700">{formatINR(c.from)} → {formatINR(c.to)} · {c.by}{c.reason ? ` — “${c.reason}”` : ''} · {c.status}{c.note ? ` — “${c.note}”` : ''}</p>)}
          {x.customerSaid && <p className="font-semibold text-slate-800">{tx('Customer said', 'ग्राहक ने कहा')}: {x.customerSaid === 'YES' ? tx('it went ahead', 'बात आगे बढ़ी') : tx('it did not go ahead', 'बात आगे नहीं बढ़ी')}</p>}
          {x.flags.map((f: any) => <p key={f.code} className="font-semibold text-red-800">⚠ {hi ? f.hi : f.en}</p>)}
          <p className="text-slate-500">{x.links.map((l: any) => `${l.en} (${when(l.at)})`).join(' · ')}</p>
        </div>
      ))}
    </div>
  );
};

export const ShopPartnersView: React.FC<{ currentUser: UserProfile; canManage: boolean; canOversee: boolean }> = ({ currentUser, canManage, canOversee }) => {
  const tx = useTx();
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  const [tab, setTab] = useState<'leads' | 'partners' | 'desk'>(canManage ? 'leads' : 'desk');
  const [adding, setAdding] = useState(false); const [fresh, setFresh] = useState<{ partner: any; link: string } | null>(null);
  const [filter, setFilter] = useState<'all' | 'new' | 'open' | 'won' | 'due' | 'flag'>('all');
  const load = () => { if (canManage) api.spList().then(setD).catch((e) => setErr(e.message)); };
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 20000); return () => clearInterval(t); /* eslint-disable-next-line */ }, []);
  const leads = useMemo(() => (d?.leads || []).filter((l: any) => filter === 'all' || (filter === 'new' && l.status === 'NEW') || (filter === 'open' && !['WON', 'LOST'].includes(l.status))
    || (filter === 'won' && l.status === 'WON') || (filter === 'due' && l.payout && ['DUE', 'NOT_RECEIVED'].includes(l.payout.status)) || (filter === 'flag' && l.flags.length > 0)), [d, filter]);
  const count = (f: typeof filter) => (d?.leads || []).filter((l: any) => f === 'new' ? l.status === 'NEW' : f === 'due' ? l.payout && ['DUE', 'NOT_RECEIVED'].includes(l.payout.status) : f === 'flag' ? l.flags.length > 0 : false).length;

  return (
    <div className="space-y-4" data-testid="shop-partners">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <PageTitle title={tx('Shop QR partners', 'दुकान QR पार्टनर')} help={tx('Put your QR at a shop or society gate instead of pamphlets. Customers scan and send their need; the lead is yours, the shop gets the share you both agreed.', 'पैम्फ़लेट की जगह अपना QR दुकान या सोसाइटी गेट पर लगाएँ। ग्राहक स्कैन करके ज़रूरत भेजता है; लीड आपकी, दुकान को तय हिस्सा।')} />
        </div>
        {canManage && !adding && <button className={dark} onClick={() => { setAdding(true); setFresh(null); }} data-testid="sp-new"><Plus className="h-4 w-4" />{tx('New partner', 'नया पार्टनर')}</button>}
      </div>

      {canManage && d && d.partners.length === 0 && !adding && (
        <ol className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 sm:grid-cols-3">
          <li><b>1.</b> {tx('Add the shop and agree the share (sale / rent).', 'दुकान जोड़ें, हिस्सा तय करें (बिक्री / किराया)।')}</li>
          <li><b>2.</b> {tx('Send him his page link on WhatsApp — he accepts on his phone.', 'WhatsApp पर उनका पेज लिंक भेजें — वे अपने फ़ोन पर मंज़ूर करें।')}</li>
          <li><b>3.</b> {tx('Print the QR poster and put it up. Leads come here; he sees their progress.', 'QR पोस्टर प्रिंट करके लगाएँ। लीड यहाँ आएँगी; उन्हें प्रगति दिखेगी।')}</li>
        </ol>
      )}
      {adding && <AddPartner city={currentUser.city || ''} onCancel={() => setAdding(false)} onDone={(x) => { setFresh(x); setAdding(false); load(); }} />}
      {fresh && (
        <div className="space-y-2 rounded-xl border-2 border-emerald-400 bg-emerald-50 p-3 text-sm" data-testid="sp-fresh">
          <p className="font-bold text-emerald-900">{tx(`${fresh.partner.shopName} added. Now:`, `${fresh.partner.shopName} जुड़ गए। अब:`)}</p>
          <div className="flex flex-wrap gap-2">
            <a className={dark} href={`https://wa.me/91${(fresh as any).phone || ''}?text=${encodeURIComponent(waText(fresh.partner, fresh.link))}`} target="_blank" rel="noopener noreferrer"><Send className="h-4 w-4" />{tx('1. Send terms on WhatsApp', '1. WhatsApp पर शर्तें भेजें')}</a>
            <a className={light} href={fresh.partner.posterUrl} target="_blank" rel="noopener noreferrer"><Printer className="h-4 w-4" />{tx('2. Print the QR poster', '2. QR पोस्टर प्रिंट करें')}</a>
          </div>
          <p className="text-[11px] text-emerald-900">{tx('The QR starts working once he taps “Accept” on his page. If there is no SMS, his code shows on his card here — read it out to him.', 'उनके पेज पर “मंज़ूर” दबाते ही QR चालू होगा। SMS न हो तो उनका कोड यहीं उनके कार्ड पर दिखेगा — उन्हें बता दें।')}</p>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1" role="tablist">
        {canManage && ([['leads', tx('Leads', 'लीड'), d?.leads.length], ['partners', tx('Partners', 'पार्टनर'), d?.partners.length]] as const).map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${tab === id ? 'bg-slate-900 text-white' : 'text-slate-600'}`} data-testid={`sp-tab-${id}`}>{label}{n !== undefined && <span className="rounded-full bg-white/20 px-1.5 text-[10px]">{n}</span>}</button>
        ))}
        {canOversee && <button role="tab" aria-selected={tab === 'desk'} onClick={() => setTab('desk')} className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${tab === 'desk' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>{tx('GENZ desk', 'GENZ डेस्क')}</button>}
      </div>

      {err && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      {tab === 'desk' && canOversee && <Desk />}
      {canManage && !d && !err && tab !== 'desk' && <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />}
      {canManage && d && tab === 'partners' && <PitchKit name={currentUser.name} />}
      {canManage && d && tab === 'partners' && (
        <div className="grid gap-3 md:grid-cols-2">
          {d.partners.length === 0 && <p className="text-sm text-slate-500">{tx('No partners yet.', 'अभी कोई पार्टनर नहीं।')}</p>}
          {d.partners.map((p: any) => <PartnerCard key={p.id + p.termsVersion + p.status + (p.pending ? 1 : 0)} p={p} onChange={load} />)}
        </div>
      )}
      {canManage && d && tab === 'leads' && (
        <div className="space-y-3">
          {d.record?.counted > 0 && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="sp-record">🤝 {tx(`Your record with shop partners: ${d.record.onTime} of ${d.record.counted} shares paid within ${OVERDUE.pauseDays} days.`, `दुकान पार्टनर्स के साथ आपका रिकॉर्ड: ${d.record.counted} में से ${d.record.onTime} हिस्से ${OVERDUE.pauseDays} दिन में चुकाए।`)}{d.record.overdue > 0 ? ` ⏳ ${tx(`${d.record.overdue} overdue`, `${d.record.overdue} देर से`)}` : ''}</p>}
          <div className="flex flex-wrap gap-1.5">
            {([['all', tx('All', 'सभी')], ['new', tx('New', 'नई')], ['open', tx('Open', 'चालू')], ['won', tx('Deals', 'डील')], ['due', tx('Share to pay', 'हिस्सा देना है')], ['flag', tx('⚠ Check', '⚠ देखें')]] as const).map(([id, label]) => (
              <button key={id} onClick={() => setFilter(id)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{label}{['new', 'due', 'flag'].includes(id) && count(id) > 0 ? ` (${count(id)})` : ''}</button>
            ))}
          </div>
          {leads.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{d.partners.length ? tx('No leads here yet.', 'यहाँ अभी कोई लीड नहीं।') : tx('Add your first shop partner to start getting leads.', 'लीड पाने के लिए पहला दुकान पार्टनर जोड़ें।')}</p>}
          <div className="grid gap-3 md:grid-cols-2">{leads.map((l: any) => <LeadCard key={l.id + l.status + (l.payout?.status || '')} l={l} onChange={load} />)}</div>
        </div>
      )}
    </div>
  );
};
