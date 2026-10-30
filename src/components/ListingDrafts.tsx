/**
 * v26 — "WhatsApp se listing": paste forwards → drafts → owner consent (link or signed form) → publish.
 * A draft is private to the broker. It goes live only after the owner says yes; that yes starts the bypass protection.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardPaste, Loader2, Trash2, Send, FileSignature, Upload, CheckCircle2, AlertTriangle, ExternalLink, Copy, X, MessageCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { PROPERTY_TYPES, stateNames } from '../shared/india.js';
import { STATUS_LABEL, PAPER_HELP, draftMissing, needMissing, termsOf, termsLine, type Basis } from '../shared/consentRules.js';
const NEED_RULES = { needMissing };
import { ProtectionPicker, useProtectionConfig } from './ProtectionDays.js';
import { formatINR } from '../lib/utils.js';
import { VoiceNote } from './VoiceNote.js';

type Draft = any;
const MISSING_LABEL: Record<string, [string, string]> = {
  propertyType: ['type', 'प्रकार'], transactionType: ['sale / rent', 'बिक्री / किराया'], state: ['state', 'राज्य'], city: ['city', 'शहर'], locality: ['locality', 'इलाक़ा'],
  askingPrice: ['price', 'कीमत'], ownerName: ['owner name', 'मालिक का नाम'], ownerPhone: ['owner mobile', 'मालिक का मोबाइल'], addressHidden: ['exact address', 'पूरा पता'],
};

function toDataUrl(file: File): Promise<string> {
  return new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => fail(r.error); r.readAsDataURL(file); });
}

export const ListingDrafts: React.FC<{ onClose: () => void; onPublished: () => void; openId?: string }> = ({ onClose, onPublished, openId }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const [text, setText] = useState(() => { try { const q = new URLSearchParams(window.location.search); return [q.get('stitle'), q.get('stext'), q.get('surl')].filter(Boolean).join('\n').slice(0, 20000); } catch { return ''; } });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [open, setOpen] = useState<string>(openId || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sms, setSms] = useState(false);
  const load = () => api.drafts().then(r => { setDrafts(r.drafts); setSms(!!r.smsCodes); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  const paste = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.waPaste(text); setText(''); await load(); if (r.drafts?.[0]) setOpen(r.drafts[0].id);
      const n = Number(r.needs || 0), l = Number(r.found || 0) - n;
      setNote(tx(`${l} listing draft(s) and ${n} buyer need(s) found.`, `${l} लिस्टिंग ड्राफ़्ट और ${n} खरीदार ज़रूरत मिलीं।`));
    }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const fromClipboard = async () => { try { const t = await navigator.clipboard.readText(); if (t) setText(t); } catch { /* the browser said no — the broker can long-press and paste */ } };
  const live = drafts.filter(d => d.status !== 'PUBLISHED' && d.kind !== 'NEED');
  const needs = drafts.filter(d => d.status !== 'PUBLISHED' && d.kind === 'NEED');
  const done = drafts.filter(d => d.status === 'PUBLISHED' && d.kind !== 'NEED');
  const needsDone = drafts.filter(d => d.status === 'PUBLISHED' && d.kind === 'NEED');
  const [note, setNote] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/40 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl" onClick={e => e.stopPropagation()} data-testid="listing-drafts">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-emerald-700 px-4 py-3 text-white">
          <MessageCircle className="h-5 w-5" />
          <div className="flex-1"><h2 className="text-sm font-bold">{tx('Listings & buyer needs from WhatsApp', 'WhatsApp से लिस्टिंग और खरीदार की ज़रूरत')}</h2><p className="text-[11px] opacity-90">{tx('Listing: paste → details → owner says yes → live · Need: paste → client details → saved', 'लिस्टिंग: पेस्ट → डिटेल → मालिक की हाँ → लाइव · ज़रूरत: पेस्ट → क्लाइंट डिटेल → सेव')}</p></div>
          <button onClick={onClose} aria-label={tx('Close', 'बंद करें')}><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <label className="text-xs font-semibold text-slate-700">{tx('Paste WhatsApp messages — properties and buyer requirements (one or many)', 'WhatsApp मैसेज पेस्ट करें — प्रॉपर्टी और खरीदार की ज़रूरत (एक या कई)')}</label>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={5} maxLength={20000} data-testid="wa-paste-text"
            placeholder={tx('Listings and buyer needs, e.g. “*2BHK flat for sale* Shankar Nagar 1150 sqft 45 L” or “2BHK chahiye Telibandha budget 40-50 L”', 'लिस्टिंग और खरीदार की ज़रूरत दोनों, जैसे “*2BHK फ्लैट बिक्री* शंकर नगर 1150 sqft 45 L” या “2BHK चाहिए तेलीबांधा बजट 40-50 L”')}
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" />
          <VoiceNote onText={t => setText(x => (x ? x.replace(/\s+$/, '') + '\n' : '') + t)} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={paste} disabled={busy || !text.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" data-testid="wa-paste-go">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardPaste className="h-3.5 w-3.5" />} {tx('Make drafts', 'ड्राफ़्ट बनाएँ')}
            </button>
            <button onClick={fromClipboard} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">{tx('Paste from clipboard', 'क्लिपबोर्ड से पेस्ट')}</button>
          </div>
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900">{tx('Nothing goes live without the property owner’s consent. The owner’s yes protects you: while the protection lasts, no other GENZ broker can list the same property.', 'मालिक की सहमति के बिना कुछ भी लाइव नहीं होगा। मालिक की हाँ आपको सुरक्षा देती है: सुरक्षा रहते कोई दूसरा GENZ ब्रोकर वही प्रॉपर्टी नहीं डाल सकता।')}</p>
          {err && <p className="mt-2 text-xs font-medium text-red-700" role="alert">{err}</p>}
          {note && !err && <p className="mt-2 text-xs font-medium text-emerald-800" role="status" data-testid="paste-note">{note}</p>}

          {needs.length > 0 && <>
            <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">{tx('Buyer needs', 'खरीदार की ज़रूरतें')} ({needs.length})</h3>
            <p className="text-[11px] text-slate-500">{tx('Requirements from the paste. Add your client’s name and mobile, then save — they go to Buyer Needs and matching starts.', 'पेस्ट से मिली ज़रूरतें। अपने क्लाइंट का नाम और मोबाइल भरें, फिर सेव करें — ये Buyer Needs में जाएँगी और मैचिंग शुरू होगी।')}</p>
            <ul className="mt-2 space-y-2">
              {needs.map(d => <NeedRow key={d.id} d={d} open={open === d.id} onToggle={() => setOpen(open === d.id ? '' : d.id)} onChanged={load} onSaved={() => { load(); onPublished(); }} />)}
            </ul>
          </>}

          <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">{tx('Drafts', 'ड्राफ़्ट')} ({live.length})</h3>
          <ul className="mt-2 space-y-2">
            {live.map(d => <DraftRow key={d.id} d={d} open={open === d.id} onToggle={() => setOpen(open === d.id ? '' : d.id)} onChanged={load} onPublished={() => { load(); onPublished(); }} hi={hi} sms={sms} />)}
            {!live.length && <li className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">{tx('No drafts yet — paste a WhatsApp message above.', 'अभी कोई ड्राफ़्ट नहीं — ऊपर WhatsApp मैसेज पेस्ट करें।')}</li>}
          </ul>
          {done.length > 0 && <p className="mt-4 text-xs text-slate-500">{tx(`${done.length} published from WhatsApp`, `WhatsApp से ${done.length} लाइव हुईं`)}</p>}
          {needsDone.length > 0 && <p className="mt-1 text-xs text-slate-500">{tx(`${needsDone.length} buyer needs saved from WhatsApp`, `WhatsApp से ${needsDone.length} खरीदार ज़रूरतें सेव हुईं`)}</p>}
        </div>
      </div>
    </div>
  );
};

/** v27 — how the listing broker is paid. The owner reads and signs it with his yes; a mandate is made when the listing goes live. */
const BrokerageBlock: React.FC<{ f: Record<string, any>; setF: (x: Record<string, any>) => void; locked: boolean; agree: boolean; setAgree: (b: boolean) => void }> = ({ f, setF, locked, agree, setAgree }) => {
  const tx = useTx();
  const basis = (f.remunerationBasis || '') as Basis | '';
  const t = termsOf(f);
  const inp = 'mt-0.5 w-full rounded-lg border border-purple-300 bg-white px-2 py-1.5 text-sm font-semibold disabled:bg-slate-50';
  const opts: [Basis, string, string, string, string][] = [
    ['SURPLUS_ABOVE_NET', tx('Net amount', 'नेट अमाउंट'), tx('Owner gets a fixed sum, the rest is yours', 'मालिक को तय रकम, ऊपर का आपका'), '', ''],
    ['PERCENTAGE', tx('Commission %', 'कमीशन %'), tx('% of the final price', 'फ़ाइनल कीमत का %'), '', ''],
    ['FIXED_FEE', tx('Fixed fee', 'फिक्स्ड फ़ीस'), tx('Flat ₹, whatever the price', 'तय ₹, कीमत जो भी हो'), '', ''],
  ];
  const num = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50/50 p-3" data-testid="brokerage-block">
      <p className="text-xs font-bold text-purple-950">{tx('Your brokerage — how you are paid', 'आपकी ब्रोकरेज — आपको कैसे मिलेगी')}</p>
      <p className="mt-0.5 text-[11px] text-slate-600">{tx('The owner reads this on the consent page and signs it with his yes. When the listing goes live the mandate is made — deal rooms need it.', 'मालिक इसे सहमति पेज पर पढ़कर अपनी हाँ और साइन से मानता है। लिस्टिंग लाइव होते ही मैंडेट बन जाता है — डील रूम के लिए यह ज़रूरी है।')}</p>
      <div role="radiogroup" className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {opts.map(([v, title, sub]) => (
          <button key={v} type="button" role="radio" aria-checked={basis === v} disabled={locked} data-testid={`basis-${v}`}
            onClick={() => setF({ ...f, remunerationBasis: basis === v && !locked ? '' : v })}
            className={`rounded-lg border p-2 text-left text-xs disabled:opacity-70 ${basis === v ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'}`}>
            <div className="font-bold">{title}</div><div className={`mt-0.5 text-[10px] ${basis === v ? 'text-slate-300' : 'text-slate-500'}`}>{sub}</div>
          </button>
        ))}
      </div>
      {basis === 'SURPLUS_ABOVE_NET' && <label className="mt-2 block text-xs font-semibold text-purple-900">{tx('Owner’s net amount (₹) — he receives this much', 'मालिक की नेट रकम (₹) — उसे इतना मिलेगा')}<input className={inp} inputMode="numeric" disabled={locked} value={f.ownerApprovedNetPrice ?? ''} onChange={num('ownerApprovedNetPrice')} data-testid="terms-net" /></label>}
      {basis === 'PERCENTAGE' && <label className="mt-2 block text-xs font-semibold text-purple-900">{tx('Commission (% of final price, 0.1–10)', 'कमीशन (फ़ाइनल कीमत का %, 0.1–10)')}<input className={inp} inputMode="decimal" disabled={locked} value={f.agreedCommissionPct ?? ''} onChange={num('agreedCommissionPct')} data-testid="terms-pct" /></label>}
      {basis === 'FIXED_FEE' && <label className="mt-2 block text-xs font-semibold text-purple-900">{tx('Fixed brokerage (₹)', 'फिक्स्ड ब्रोकरेज (₹)')}<input className={inp} inputMode="numeric" disabled={locked} value={f.fixedFeeAmount ?? ''} onChange={num('fixedFeeAmount')} data-testid="terms-fee" /></label>}
      {basis && t.terms && <p className="mt-2 rounded-lg bg-white p-2 text-[11px] text-slate-700" data-testid="terms-preview"><b>{tx(termsLine(t.terms).atAsking.en, termsLine(t.terms).atAsking.hi)}</b></p>}
      {basis && t.problem && (() => { const empty = !String((basis === 'PERCENTAGE' ? f.agreedCommissionPct : basis === 'FIXED_FEE' ? f.fixedFeeAmount : f.ownerApprovedNetPrice) ?? '').trim(); return <p className={`mt-2 text-[11px] font-medium ${empty ? 'text-slate-500' : 'text-red-700'}`} data-testid="terms-problem">{empty ? tx('Fill in the amount above.', 'ऊपर रकम भरें।') : tx(t.problem.en, t.problem.hi)}</p>; })()}
      {!basis && !locked && <p className="mt-2 text-[11px] text-amber-800">{tx('Not chosen yet — without it the listing has no mandate and deal rooms stay closed. You can also add it later from “Brokerage Mandate”.', 'अभी चुना नहीं — इसके बिना लिस्टिंग पर मैंडेट नहीं बनेगा और डील रूम बंद रहेंगे। बाद में “ब्रोकरेज मैंडेट” से भी जोड़ सकते हैं।')}</p>}
      {basis && !locked && (
        <label className="mt-2 flex items-start gap-2 rounded-lg bg-white p-2 text-xs font-semibold text-slate-800">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={agree} onChange={e => setAgree(e.target.checked)} data-testid="terms-agree" />
          <span>{tx('I agree to these brokerage terms and send them to the owner to sign (this tick is my e-sign, recorded with time).', 'मैं इन ब्रोकरेज शर्तों पर सहमत हूँ और मालिक को साइन के लिए भेज रहा/रही हूँ (यह टिक मेरा ई-साइन है, समय के साथ दर्ज)।')}</span>
        </label>
      )}
    </div>
  );
};

const DraftRow: React.FC<{ d: Draft; open: boolean; onToggle: () => void; onChanged: () => void; onPublished: () => void; hi: boolean; sms: boolean }> = ({ d, open, onToggle, onChanged, onPublished, hi, sms }) => {
  const tx = useTx();
  const cfg = useProtectionConfig();
  const [f, setF] = useState<Record<string, any>>(d.fields);
  const [days, setDays] = useState<number>(d.consent?.protectionDays || cfg?.defaultDays || 30);
  const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [taken, setTaken] = useState<any>(null);
  const [link, setLink] = useState<{ url: string; wa: string } | null>(null);
  const [agree, setAgree] = useState(false);
  useEffect(() => { setF(d.fields); }, [d.updatedAt]);
  useEffect(() => { if (cfg && !d.consent) setDays(cfg.defaultDays); }, [cfg?.defaultDays]);
  const c = d.consent;
  const status: string = d.status === 'READY' ? 'ACCEPTED' : c?.status || 'DRAFT';
  const chip = status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-800' : ['PENDING', 'PAPER_REVIEW'].includes(status) ? 'bg-amber-100 text-amber-800' : ['DECLINED', 'PAPER_REJECTED', 'LINK_EXPIRED', 'VOID'].includes(status) ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700';
  const label = status === 'DRAFT' ? tx('Draft', 'ड्राफ़्ट') : tx((STATUS_LABEL as any)[status]?.en || status, (STATUS_LABEL as any)[status]?.hi || status);
  const locked = !!c && ['PENDING', 'PAPER_REVIEW', 'ACCEPTED'].includes(c.status);
  const missing: string[] = draftMissing(f);
  const tt = termsOf(f);
  const termsBlock = !!f.remunerationBasis && (!!tt.problem || (!locked && !agree));
  const forProp: string = f.forPropertyId || '';
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); setErr(''); setTaken(null); try { await fn(); } catch (e: any) { if (e?.code === 'CONSENT_TAKEN') setTaken(e.body); else setErr(hi && e.body?.hi ? e.body.hi : e.message); } finally { setBusy(''); } };
  const numOrNull = (v: any) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(/[^\d.]/g, '')) || null);
  const saveFields = () => api.draftSave(d.id, { title: f.title, description: f.description, propertyType: f.propertyType, transactionType: f.transactionType, state: f.state, city: f.city, locality: f.locality, addressHidden: f.addressHidden, ownerName: f.ownerName, ownerPhone: f.ownerPhone, tags: f.tags || [], areaSqft: numOrNull(f.areaSqft), askingPrice: numOrNull(f.askingPrice), ownerApprovedNetPrice: numOrNull(f.ownerApprovedNetPrice), bhk: numOrNull(f.bhk), remunerationBasis: f.remunerationBasis || '', agreedCommissionPct: numOrNull(f.agreedCommissionPct), fixedFeeAmount: numOrNull(f.fixedFeeAmount) });
  const save = () => run('save', async () => { await saveFields(); onChanged(); });
  const ask = () => run('ask', async () => { if (!locked) await saveFields(); const r = await api.consentRequest(d.id, days, agree || undefined); setLink({ url: r.url, wa: r.whatsapp.link }); onChanged(); try { window.open(r.whatsapp.link, '_blank', 'noopener'); } catch { /* popup blocked: the button below still works */ } });
  const paper = (file: File) => run('paper', async () => { if (!locked) await saveFields(); await api.consentPaper(d.id, days, await toDataUrl(file), agree || undefined); onChanged(); });
  const publish = () => run('publish', async () => {
    const plot = /Plot|Land/.test(f.propertyType);
    const price = Number(f.askingPrice) || 0;
    const desc = String(f.description || '').trim();
    await api.createProperty({
      title: String(f.title || `${f.propertyType} in ${f.locality}`).slice(0, 160), description: desc.length >= 10 ? desc : `${f.propertyType} ${f.transactionType === 'Rent' ? 'for rent' : 'for sale'} in ${f.locality}, ${f.city}.`,
      propertyType: f.propertyType, transactionType: f.transactionType, state: f.state, city: f.city, locality: f.locality, addressHidden: f.addressHidden,
      ...(plot ? { plotAreaSqFt: Number(f.areaSqft) || undefined } : { builtUpAreaSqFt: Number(f.areaSqft) || undefined }),
      askingPrice: price, ownerApprovedNetPrice: Number(f.ownerApprovedNetPrice) > 0 && Number(f.ownerApprovedNetPrice) <= price ? Number(f.ownerApprovedNetPrice) : price,
      ownerName: f.ownerName, ownerPhone: f.ownerPhone, tags: f.tags || [], consentId: c?.id,
      ...(f.extra && typeof f.extra === 'object' ? f.extra : {}),
      ...(Array.isArray(f.images) && f.images.length ? { images: f.images } : {}), // v28: photos added in the “List property” form survive the owner-approval draft
    });
    onPublished();
  });
  const attach = () => run('attach', async () => { await api.consentAttach(d.id); onChanged(); onPublished(); });
  const del = () => run('del', async () => { if (!window.confirm(tx('Delete this draft?', 'यह ड्राफ़्ट हटाएँ?'))) return; await api.draftDelete(d.id); onChanged(); });
  const inp = 'mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50';
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const states = useMemo(() => stateNames(), []);

  return (
    <li className="rounded-xl border border-slate-200" data-testid={`draft-${d.id}`}>
      <button onClick={onToggle} className="flex w-full items-start gap-2 p-3 text-left">
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">{f.title || tx('Property', 'प्रॉपर्टी')}</p>
          <p className="text-xs text-slate-500">{[f.locality, f.city].filter(Boolean).join(', ')}{f.askingPrice ? ` · ${formatINR(Number(f.askingPrice))}` : ''}</p>
          {d.fields?.forPropertyId && <p className="mt-0.5 inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">{tx(`Owner approval for live listing ${d.fields.forPropertyId}`, `लाइव लिस्टिंग ${d.fields.forPropertyId} की मालिक अप्रूवल`)}</p>}
          {missing.length > 0 && !locked && <p className="mt-0.5 text-[11px] text-amber-700">{tx('Still needed: ', 'अभी चाहिए: ')}{missing.map(m => hi ? MISSING_LABEL[m]?.[1] : MISSING_LABEL[m]?.[0]).join(', ')}</p>}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${chip}`} data-testid="draft-status">{label}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-3">
          <details className="mb-2"><summary className="cursor-pointer text-[11px] text-slate-500">{tx('Original message', 'असली मैसेज')}</summary><pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 text-[11px] text-slate-600">{d.raw}</pre></details>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-slate-700 sm:col-span-2">{tx('Title', 'शीर्षक')}<input className={inp} value={f.title || ''} onChange={set('title')} maxLength={160} /></label>
            <label className="text-xs text-slate-700">{tx('Type', 'प्रकार')}<select className={inp} disabled={locked} value={f.propertyType || ''} onChange={set('propertyType')} data-testid="draft-type"><option value="">—</option>{PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
            <label className="text-xs text-slate-700">{tx('Sale / rent', 'बिक्री / किराया')}<select className={inp} value={f.transactionType || ''} onChange={set('transactionType')}><option value="">—</option><option value="Sale">{tx('Sale', 'बिक्री')}</option><option value="Rent">{tx('Rent', 'किराया')}</option><option value="Lease">{tx('Lease', 'लीज़')}</option></select></label>
            <label className="text-xs text-slate-700">{tx('State', 'राज्य')}<select className={inp} value={f.state || ''} onChange={set('state')} data-testid="draft-state"><option value="">—</option>{states.map(s => <option key={s}>{s}</option>)}</select></label>
            <label className="text-xs text-slate-700">{tx('City', 'शहर')}<input className={inp} disabled={locked} value={f.city || ''} onChange={set('city')} /></label>
            <label className="text-xs text-slate-700">{tx('Locality', 'इलाक़ा')}<input className={inp} disabled={locked} value={f.locality || ''} onChange={set('locality')} data-testid="draft-locality" /></label>
            <label className="text-xs text-slate-700">{tx('Area (sq ft)', 'क्षेत्रफल (वर्ग फ़ुट)')}<input className={inp} inputMode="numeric" value={f.areaSqft ?? ''} onChange={set('areaSqft')} /></label>
            <label className="text-xs text-slate-700">{tx('Price (₹)', 'कीमत (₹)')}<input className={inp} inputMode="numeric" disabled={locked && !!c?.terms} value={f.askingPrice ?? ''} onChange={set('askingPrice')} data-testid="draft-price" /></label>
            <label className="text-xs text-slate-700 sm:col-span-2">{tx('Exact address (private — only for verification)', 'पूरा पता (निजी — सिर्फ़ जाँच के लिए)')}<input className={inp} value={f.addressHidden || ''} onChange={set('addressHidden')} maxLength={300} data-testid="draft-address" /></label>
            <label className="text-xs text-slate-700">{tx('Owner name', 'मालिक का नाम')}<input className={inp} disabled={locked} value={f.ownerName || ''} onChange={set('ownerName')} data-testid="draft-owner-name" /></label>
            <label className="text-xs text-slate-700">{tx('Owner mobile', 'मालिक का मोबाइल')}<input className={inp} disabled={locked} inputMode="tel" value={f.ownerPhone || ''} onChange={set('ownerPhone')} data-testid="draft-owner-phone" />
              {!locked && (f.phonesFound || []).length > 0 && <span className="mt-1 flex flex-wrap gap-1">{(f.phonesFound as string[]).map(p => <button type="button" key={p} onClick={() => setF({ ...f, ownerPhone: p })} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">{tx('Use', 'लें')} {p}</button>)}</span>}
            </label>
          </div>
          {!locked && (f.phonesFound || []).length > 0 && <p className="mt-1 text-[11px] text-slate-500">{tx('A number in the message is often the forwarding broker’s — use it only if it is the owner’s.', 'मैसेज का नंबर अक्सर फ़ॉरवर्ड करने वाले ब्रोकर का होता है — सिर्फ़ तभी लें जब मालिक का हो।')}</p>}

          <BrokerageBlock f={f} setF={setF} locked={locked} agree={agree} setAgree={setAgree} />

          {taken && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800" data-testid="draft-taken"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{hi ? taken.hi : taken.error}{taken.protectedUntil && <> ({tx('until', 'तक')} {String(taken.protectedUntil).slice(0, 10)})</>}
            {taken.coBrokePropertyId && <button type="button" className="ml-1 font-semibold underline" onClick={() => { try { window.location.href = `/?tab=properties&propertyId=${encodeURIComponent(taken.coBrokePropertyId)}`; } catch { /* */ } }}>{tx('Open the listing to co-broke', 'को-ब्रोकिंग के लिए लिस्टिंग खोलें')}</button>}</div>}
          {err && <p className="mt-2 text-xs font-medium text-red-700" role="alert">{err}</p>}

          {status === 'ACCEPTED' ? (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-semibold text-emerald-800"><CheckCircle2 className="mr-1 inline h-4 w-4" />{tx(`Owner agreed. Protected until ${String(c?.expiresAt || '').slice(0, 10)} (${c?.protectionDays} days).`, `मालिक ने हाँ कहा। ${String(c?.expiresAt || '').slice(0, 10)} तक सुरक्षित (${c?.protectionDays} दिन)।`)}</p>
              <p className="mt-1 text-xs text-emerald-900" data-testid="owner-agreed-who">{tx('Owner', 'मालिक')}: <b>{f.ownerName || c?.ownerName}</b>{f.ownerPhone ? <> · {tx('Mobile', 'मोबाइल')}: <b>{(d => (d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : String(f.ownerPhone)))(String(f.ownerPhone).replace(/\D/g, '').slice(-10))}</b></> : null}
                {c?.ownerTypedName && String(c.ownerTypedName).trim().toLowerCase() !== String(f.ownerName || c?.ownerName || '').trim().toLowerCase() && <span className="block text-amber-800">{tx(`Signed on the link as “${c.ownerTypedName}” — check that this is the owner`, `लिंक पर “${c.ownerTypedName}” नाम से साइन किया — पक्का करें कि यही मालिक हैं`)}</span>}</p>
              {c?.signature && <p className="mt-1 flex items-center gap-2 text-xs text-emerald-900" data-testid="owner-signature">{tx('Owner signed:', 'मालिक का साइन:')} {c.signature.initials && <b className="rounded bg-white px-1.5 py-0.5">{c.signature.initials}</b>}{c.signature.drawn && <img src={api.consentSignatureUrl(c.id)} alt={tx('Owner signature', 'मालिक का साइन')} className="h-10 rounded border border-emerald-200 bg-white px-1" />}</p>}
              {c?.terms && <p className="mt-1 text-[11px] text-emerald-900">{tx(termsLine(c.terms).kind.en, termsLine(c.terms).kind.hi)} — {tx('the mandate becomes ACTIVE when you publish.', 'लाइव करते ही मैंडेट सक्रिय हो जाएगा।')}</p>}
              {forProp
                ? <button onClick={attach} disabled={!!busy} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" data-testid="draft-attach">{busy === 'attach' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{tx(`Apply to ${forProp}`, `${forProp} पर लागू करें`)}</button>
                : <button onClick={publish} disabled={!!busy} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" data-testid="draft-publish">{busy === 'publish' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{tx('Publish listing', 'लिस्टिंग लाइव करें')}</button>}
            </div>
          ) : status === 'PENDING' || status === 'PAPER_REVIEW' ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">{status === 'PENDING' ? tx(`Waiting for ${c.ownerName} to open the link and say yes (link valid till ${String(c.linkExpiresAt || '').slice(0, 10)}).`, `${c.ownerName} के लिंक खोलकर हाँ कहने का इंतज़ार (लिंक ${String(c.linkExpiresAt || '').slice(0, 10)} तक)।`) : tx('Signed form uploaded — GENZ is checking it.', 'साइन किया फ़ॉर्म अपलोड हुआ — GENZ जाँच रहा है।')}</p>
              {status === 'PENDING' && c.otpNeeded && <p className="mt-1">{tx('The owner also got a code by SMS to type on the page.', 'मालिक को SMS से एक कोड भी गया है जो पेज पर लिखना है।')}</p>}
              {link && <div className="mt-2 flex flex-wrap gap-2"><a href={link.wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white"><Send className="h-3.5 w-3.5" />WhatsApp</a><button type="button" onClick={() => navigator.clipboard?.writeText(link.url)} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-1.5 font-semibold"><Copy className="h-3.5 w-3.5" />{tx('Copy link', 'लिंक कॉपी')}</button></div>}
              {status === 'PENDING' && <button onClick={ask} disabled={!!busy} className="mt-2 font-semibold underline">{tx('Send a new link', 'नया लिंक भेजें')}</button>}
            </div>
          ) : (
            <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              {c && ['DECLINED', 'PAPER_REJECTED', 'LINK_EXPIRED', 'VOID'].includes(c.status) && <p className="text-xs text-red-700">{tx((STATUS_LABEL as any)[c.status].en, (STATUS_LABEL as any)[c.status].hi)}{c.reviewNote ? ` — ${c.reviewNote}` : ''}</p>}
              <ProtectionPicker value={days} onChange={setDays} testId="draft-days" />
              <div className="flex flex-wrap gap-2">
                <button onClick={ask} disabled={!!busy || missing.length > 0 || termsBlock} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" data-testid="draft-ask">{busy === 'ask' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}{tx('Ask owner on WhatsApp', 'मालिक से WhatsApp पर सहमति माँगें')}</button>
                <a href={api.consentFormUrl(d.id, days)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"><FileSignature className="h-3.5 w-3.5" />{tx('Print paper form', 'पेपर फ़ॉर्म प्रिंट करें')}<ExternalLink className="h-3 w-3" /></a>
                <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 ${missing.length || termsBlock ? 'pointer-events-none opacity-50' : ''}`}>
                  {busy === 'paper' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}{tx('Upload signed form', 'साइन किया फ़ॉर्म अपलोड')}
                  <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) paper(file); }} data-testid="draft-paper" />
                </label>
              </div>
              <p className="text-[11px] text-slate-500">{tx(PAPER_HELP.en, PAPER_HELP.hi)}{sms ? '' : ` ${tx('(SMS codes are off until an SMS service is connected; the link page checks it is not opened on your own phone.)', '(SMS सेवा जुड़ने तक SMS कोड बंद हैं; लिंक पेज जाँचता है कि वह आपके अपने फ़ोन पर तो नहीं खुला।)')}`}</p>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            {!locked && <button onClick={save} disabled={!!busy} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" data-testid="draft-save">{busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : tx('Save details', 'डिटेल सेव करें')}</button>}
            <button onClick={del} disabled={!!busy} className="ml-auto inline-flex items-center gap-1 text-xs text-red-700"><Trash2 className="h-3.5 w-3.5" />{tx('Delete', 'हटाएँ')}</button>
          </div>
        </div>
      )}
    </li>
  );
};

const NEED_MISSING: Record<string, [string, string]> = {
  propertyType: ['type', 'प्रकार'], transactionType: ['buy / rent', 'खरीद / किराया'], city: ['city', 'शहर'], localities: ['localities', 'इलाक़े'],
  budgetMax: ['budget', 'बजट'], customerName: ['client name', 'क्लाइंट का नाम'], customerPhone: ['client mobile', 'क्लाइंट का मोबाइल'],
};
/** v28 — a buyer / tenant requirement found in the paste → Buyer Need (no owner consent needed) */
const NeedRow: React.FC<{ d: Draft; open: boolean; onToggle: () => void; onChanged: () => void; onSaved: () => void }> = ({ d, open, onToggle, onChanged, onSaved }) => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const [f, setF] = useState<Record<string, any>>(d.fields);
  const [locText, setLocText] = useState<string>((d.fields.localities || []).join(', '));
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { setF(d.fields); setLocText((d.fields.localities || []).join(', ')); }, [d.updatedAt]);
  const n = (v: any) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(/[^\d.]/g, '')) || null);
  const fields = (): Record<string, any> => ({ ...f, localities: locText.split(/[,/|]+/).map(x => x.trim()).filter(Boolean).slice(0, 10), budgetMin: n(f.budgetMin), budgetMax: n(f.budgetMax), customerPhone: String(f.customerPhone || '') });
  const { needMissing } = NEED_RULES;
  const missing: string[] = needMissing(fields());
  const run = async (k: string, fn: () => Promise<void>) => { setBusy(k); setErr(''); try { await fn(); } catch (e: any) { setErr(hi && e.body?.hi ? e.body.hi : e.message); } finally { setBusy(''); } };
  const saveFields = () => { const x = fields(); return api.draftSave(d.id, { title: x.title, description: x.description, propertyType: x.propertyType, transactionType: x.transactionType, state: x.state, city: x.city, localities: x.localities, budgetMin: x.budgetMin, budgetMax: x.budgetMax, customerName: x.customerName, customerPhone: x.customerPhone, purpose: x.purpose, urgency: x.urgency, tags: x.tags || [] }); };
  const save = () => run('save', async () => { await saveFields(); onChanged(); });
  const create = () => run('create', async () => {
    const x = fields();
    await saveFields();
    const max = Number(x.budgetMax) || 0; const min = Math.min(Number(x.budgetMin) || Math.round(max * 0.85), max);
    const r = await api.createRequirement({
      customerName: String(x.customerName).trim(), customerPhone: String(x.customerPhone).trim(), budgetMin: min, budgetMax: max, state: x.state || undefined, city: String(x.city).trim(),
      preferredLocalities: x.localities, preferredTags: (x.tags || []).slice(0, 12), propertyType: x.propertyType, transactionType: x.transactionType || 'Sale',
      minAreaSqFt: Number(x.minAreaSqFt) || undefined, purpose: x.purpose || 'Self-use', urgency: x.urgency || 'Moderate (1-3 months)',
    });
    await api.draftSavedNeed(d.id, (r as any).requirement.id);
    onSaved();
  });
  const del = () => run('del', async () => { if (!window.confirm(tx('Delete this draft?', 'यह ड्राफ़्ट हटाएँ?'))) return; await api.draftDelete(d.id); onChanged(); });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const inp = 'mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm';
  const states = useMemo(() => stateNames(), []);
  return (
    <li className="rounded-xl border border-indigo-200 bg-indigo-50/30" data-testid={`need-${d.id}`}>
      <button onClick={onToggle} className="flex w-full items-start gap-2 p-3 text-left">
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">{f.title || tx('Buyer need', 'खरीदार की ज़रूरत')}</p>
          <p className="text-xs text-slate-500">{[(f.localities || []).join(', '), f.city].filter(Boolean).join(' · ')}{f.budgetMax ? ` · ${f.budgetMin ? `${formatINR(Number(f.budgetMin))} – ` : ''}${formatINR(Number(f.budgetMax))}` : ''}</p>
          {missing.length > 0 && <p className="mt-0.5 text-[11px] text-amber-700">{tx('Still needed: ', 'अभी चाहिए: ')}{missing.map(m => hi ? NEED_MISSING[m]?.[1] : NEED_MISSING[m]?.[0]).join(', ')}</p>}
        </div>
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-800">{tx('Buyer need', 'खरीदार')}</span>
      </button>
      {open && (
        <div className="border-t border-indigo-100 p-3">
          <details className="mb-2"><summary className="cursor-pointer text-[11px] text-slate-500">{tx('Original message', 'असली मैसेज')}</summary><pre className="mt-1 whitespace-pre-wrap rounded bg-white p-2 text-[11px] text-slate-600">{d.raw}</pre></details>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-slate-700">{tx('Type', 'प्रकार')}<select className={inp} value={f.propertyType || ''} onChange={set('propertyType')} data-testid="need-type"><option value="">—</option>{PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
            <label className="text-xs text-slate-700">{tx('Buy / rent', 'खरीद / किराया')}<select className={inp} value={f.transactionType || 'Sale'} onChange={set('transactionType')}><option value="Sale">{tx('Buy', 'खरीद')}</option><option value="Rent">{tx('Rent', 'किराया')}</option><option value="Lease">{tx('Lease', 'लीज़')}</option></select></label>
            <label className="text-xs text-slate-700">{tx('State', 'राज्य')}<select className={inp} value={f.state || ''} onChange={set('state')}><option value="">—</option>{states.map(x => <option key={x}>{x}</option>)}</select></label>
            <label className="text-xs text-slate-700">{tx('City', 'शहर')}<input className={inp} value={f.city || ''} onChange={set('city')} /></label>
            <label className="text-xs text-slate-700 sm:col-span-2">{tx('Localities (comma separated)', 'इलाक़े (कॉमा से अलग)')}<input className={inp} value={locText} onChange={e => setLocText(e.target.value)} data-testid="need-localities" /></label>
            <label className="text-xs text-slate-700">{tx('Budget from (₹)', 'बजट से (₹)')}<input className={inp} inputMode="numeric" value={f.budgetMin ?? ''} onChange={set('budgetMin')} /></label>
            <label className="text-xs text-slate-700">{tx('Budget up to (₹)', 'बजट तक (₹)')}<input className={inp} inputMode="numeric" value={f.budgetMax ?? ''} onChange={set('budgetMax')} data-testid="need-budget" /></label>
            <label className="text-xs text-slate-700">{tx('Client name', 'क्लाइंट का नाम')}<input className={inp} value={f.customerName || ''} onChange={set('customerName')} data-testid="need-client-name" /></label>
            <label className="text-xs text-slate-700">{tx('Client mobile', 'क्लाइंट का मोबाइल')}<input className={inp} inputMode="tel" value={f.customerPhone || ''} onChange={set('customerPhone')} data-testid="need-client-phone" /></label>
            <label className="text-xs text-slate-700">{tx('Purpose', 'उद्देश्य')}<select className={inp} value={f.purpose || 'Self-use'} onChange={set('purpose')}><option value="Self-use">{tx('Self-use', 'खुद के लिए')}</option><option value="Investment">{tx('Investment', 'निवेश')}</option><option value="Rental Yield">{tx('Rental income', 'किराये की आय')}</option><option value="Commercial Relocation">{tx('Business shift', 'कारोबार शिफ़्ट')}</option></select></label>
            <label className="text-xs text-slate-700">{tx('How soon', 'कितनी जल्दी')}<select className={inp} value={f.urgency || 'Moderate (1-3 months)'} onChange={set('urgency')}><option value="Immediate (< 15 days)">{tx('Within 15 days', '15 दिन में')}</option><option value="Moderate (1-3 months)">{tx('1–3 months', '1–3 महीने')}</option><option value="Exploratory (3-6 months)">{tx('3–6 months', '3–6 महीने')}</option></select></label>
          </div>
          {(f.phonesFound || []).length > 0 && <p className="mt-1 text-[11px] text-slate-500">{tx('The number in the message is usually the forwarding broker’s, not the client’s.', 'मैसेज का नंबर अक्सर फ़ॉरवर्ड करने वाले ब्रोकर का होता है, क्लाइंट का नहीं।')}</p>}
          {err && <p className="mt-2 text-xs font-medium text-red-700" role="alert">{err}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={create} disabled={!!busy || missing.length > 0} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" data-testid="need-create">{busy === 'create' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{tx('Save as Buyer Need', 'खरीदार की ज़रूरत सेव करें')}</button>
            <button onClick={save} disabled={!!busy} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">{tx('Save draft', 'ड्राफ़्ट सेव करें')}</button>
            <button onClick={del} disabled={!!busy} className="ml-auto inline-flex items-center gap-1 text-xs text-red-700"><Trash2 className="h-3.5 w-3.5" />{tx('Delete', 'हटाएँ')}</button>
          </div>
        </div>
      )}
    </li>
  );
};
