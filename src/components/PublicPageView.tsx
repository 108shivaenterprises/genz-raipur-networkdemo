/**
 * v57 — My Public Page (broker). His visiting card (/c/<code>) becomes a page with the homes he picks and an enquiry form:
 *  • switch it on, copy / WhatsApp / QR its link, see views and new enquiries;
 *  • enquiries come ONLY to him (also for another broker's listing on his page) → client room, call, WhatsApp, status, delete;
 *  • homes: his own live listings (one-time "the owners agreed" promise), and other brokers' listings opened to public pages;
 *    for his own listing he decides whether other GENZ brokers may show it on their pages (default: no);
 *  • page details: one line about him, the areas he works in, Call / WhatsApp buttons on or off.
 * The page never shows an owner's name, number or exact address (server/publicPage.ts).
 */
import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { qrDataUrl, drawBrandLogo } from '../lib/brandQr.js';
import { Globe, Copy, ExternalLink, MessageCircle, Phone, QrCode, Loader2, MessagesSquare, Trash2, AlertTriangle, Eye, Home as HomeIcon, Inbox, ShieldCheck, Search, CheckCircle2, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { goto } from '../lib/goto.js';
import { PageTitle } from './PageTitle.js';
import { ENQ_STATUSES, priceShort } from '../shared/publicPageRules.js';

const inp = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm';
const dark = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-40';
const light = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-40';
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
type Sec = 'enq' | 'homes' | 'about';
type Retry = { kind: 'homes'; ids: string[] } | { kind: 'others'; id: string; on: boolean };

/** a big on / off switch with its label (the whole row is the button) */
const Toggle: React.FC<{ on: boolean; onClick: () => void; label: React.ReactNode; sub?: React.ReactNode; testId: string; disabled?: boolean }> = ({ on, onClick, label, sub, testId, disabled }) => (
  <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on} data-testid={testId}
    className={`flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-50 ${on ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700'}`}>
    <span className={`relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} /></span>
    <span className="flex-1"><span className="font-semibold">{label}</span>{sub && <span className="block text-xs font-normal opacity-80">{sub}</span>}</span>
  </button>
);

export const PublicPageView: React.FC = () => {
  const tx = useTx(); const hi = useI18n().lang === 'hi';
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [sec, setSec] = useState<Sec | ''>('');
  const [qr, setQr] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [ask, setAsk] = useState<Retry | null>(null);
  const [okTick, setOkTick] = useState(false);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ headline: '', areas: '', showPhone: false });
  const [delId, setDelId] = useState('');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const take = (r: any) => {
    setD(r);
    setForm({ headline: r.card.headline || '', areas: (r.card.areas || []).join(', '), showPhone: !!r.card.showPhone });
    window.dispatchEvent(new Event('genz:page-changed'));
  };
  const load = () => api.ppGet().then(r => { take(r); setSec(s => s || (r.counts.new > 0 || !r.card.enabled ? 'enq' : r.counts.homes === 0 ? 'homes' : 'enq')); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const link = d?.card.path ? `${origin}${d.card.path}` : '';
  useEffect(() => { if (!link) { setQr(''); return; } qrDataUrl(link, { width: 320, margin: 1, dark: '#0f172a', light: '#ffffff' }).then(setQr).catch(() => setQr('')); }, [link]);

  const run = async (key: string, fn: () => Promise<any>, ok?: string) => {
    setBusy(key); setMsg(null);
    try { const r = await fn(); if (r?.card) take(r); if (ok) setMsg({ ok: true, text: ok }); return true; }
    catch (e: any) {
      if (e?.code === 'OWNER_OK_NEEDED') return false;
      setMsg({ ok: false, text: e.message }); return true;
    } finally { setBusy(''); }
  };
  const saveHomes = async (ids: string[], ownerOk = false) => {
    let needOk = false;
    await run('homes', async () => { try { return await api.ppHomes(ids, ownerOk); } catch (e: any) { if (e?.code === 'OWNER_OK_NEEDED') { needOk = true; } throw e; } });
    if (needOk) { setAsk({ kind: 'homes', ids }); setOkTick(false); }
  };
  const setOthers = async (id: string, on: boolean, ownerOk = false) => {
    let needOk = false;
    await run('others' + id, async () => { try { return await api.ppOthers(id, on, ownerOk); } catch (e: any) { if (e?.code === 'OWNER_OK_NEEDED') { needOk = true; } throw e; } });
    if (needOk) { setAsk({ kind: 'others', id, on }); setOkTick(false); }
  };
  const confirmOk = async () => {
    const a = ask; if (!a) return; setAsk(null);
    if (a.kind === 'homes') await saveHomes(a.ids, true); else await setOthers(a.id, a.on, true);
  };

  const chosen: string[] = d?.homes.chosen || [];
  const toggleHome = (id: string) => saveHomes(chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id]);
  const net = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (d?.network || []).filter((p: any) => !s || `${p.title} ${p.locality} ${p.city} ${p.listingBroker?.name || ''}`.toLowerCase().includes(s));
  }, [d, q]);

  if (err) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>;
  if (!d) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  const shareText = tx(`See my verified homes on GENZ and send me an enquiry: ${link}`, `GENZ पर मेरे वेरिफ़ाइड घर देखें और पूछताछ भेजें: ${link}`);
  const enqNew = d.enquiries.filter((e: any) => e.status === 'NEW').length;
  const stLabel = (id: string) => { const x = ENQ_STATUSES.find(s => s.id === id); return x ? (hi ? x.hi : x.en) : id; };
  const tabs: Array<[Sec, string, number]> = [['enq', tx('Enquiries', 'पूछताछ'), enqNew], ['homes', tx('Homes', 'घर'), 0], ['about', tx('Page details', 'पेज की जानकारी'), 0]];

  return (
    <div className="space-y-4" data-testid="public-page">
      <PageTitle title={tx('My public page', 'मेरा पब्लिक पेज')} meta={d.card.enabled ? tx('Live', 'चालू') : tx('Off', 'बंद')} testId="pp-title"
        help={tx('A page anyone can open without logging in: your chosen homes and an enquiry form. Enquiries come only to you. It never shows an owner’s name, number or exact address.', 'ऐसा पेज जिसे कोई भी बिना लॉगिन खोल सकता है: आपके चुने घर और पूछताछ फ़ॉर्म। पूछताछ सिर्फ़ आपके पास आती है। पेज पर मालिक का नाम, नंबर या पूरा पता कभी नहीं दिखता।')} />

      {msg && <div className={`rounded-lg p-2.5 text-sm font-medium ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} role="status">{msg.text}</div>}

      <div className="space-y-3 rounded-2xl bg-slate-900 p-4 text-white" data-testid="pp-link-card">
        {!d.card.verified ? <p className="text-sm">{tx('Your account must be verified before the page can go live.', 'पेज चालू करने से पहले आपका अकाउंट वेरिफ़ाई होना ज़रूरी है।')}</p> : (
          <>
            <button type="button" onClick={() => run('on', () => api.ppSettings({ enabled: !d.card.enabled }), d.card.enabled ? tx('Page switched off', 'पेज बंद हो गया') : tx('Your page is live', 'आपका पेज चालू है'))} disabled={busy === 'on'} data-testid="pp-on" aria-pressed={d.card.enabled}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl bg-white/10 px-3 text-left">
              <span className={`relative inline-block h-6 w-11 shrink-0 rounded-full ${d.card.enabled ? 'bg-emerald-400' : 'bg-slate-500'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow ${d.card.enabled ? 'left-[22px]' : 'left-0.5'}`} /></span>
              <span className="flex-1 text-sm font-bold">{d.card.enabled ? tx('Page is live', 'पेज चालू है') : tx('Switch on my public page', 'मेरा पब्लिक पेज चालू करें')}</span>
              {busy === 'on' && <Loader2 className="h-4 w-4 animate-spin" />}
            </button>
            {d.card.enabled && link && (
              <>
                <p className="break-all rounded-lg bg-white/5 px-3 py-2 font-mono text-xs text-amber-200" data-testid="pp-link">{link}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-sm font-semibold text-white" data-testid="pp-wa"><MessageCircle className="h-4 w-4" />WhatsApp</a>
                  <button type="button" onClick={() => navigator.clipboard?.writeText(link).then(() => setMsg({ ok: true, text: tx('Link copied', 'लिंक कॉपी हो गया') })).catch(() => {})} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-white/30 px-3 text-sm font-semibold" data-testid="pp-copy"><Copy className="h-4 w-4" />{tx('Copy', 'कॉपी')}</button>
                  <a href={d.card.path} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-white/30 px-3 text-sm font-semibold" data-testid="pp-open"><ExternalLink className="h-4 w-4" />{tx('Open', 'खोलें')}</a>
                  <button type="button" onClick={() => setShowQr(v => !v)} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-white/30 px-3 text-sm font-semibold" data-testid="pp-qr"><QrCode className="h-4 w-4" />QR</button>
                </div>
                {showQr && qr && (
                  <div className="flex flex-col items-center gap-2 rounded-xl bg-white p-3 text-slate-900" data-testid="pp-qr-box">
                    <img src={qr} alt="QR" className="h-44 w-44" />
                    <a href={qr} download="GENZ-my-page-QR.png" className="text-xs font-semibold text-slate-700 underline">{tx('Download QR (for visiting card / board)', 'QR डाउनलोड करें (विज़िटिंग कार्ड / बोर्ड के लिए)')}</a>
                  </div>
                )}
              </>
            )}
            <div className="flex flex-wrap gap-2 text-xs" data-testid="pp-stats">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1"><Eye className="h-3.5 w-3.5" />{tx(`${d.card.views} views`, `${d.card.views} बार देखा गया`)}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1"><HomeIcon className="h-3.5 w-3.5" />{tx(`${d.counts.homes} homes`, `${d.counts.homes} घर`)}</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${enqNew ? 'bg-amber-400 font-bold text-slate-950' : 'bg-white/10'}`}><Inbox className="h-3.5 w-3.5" />{tx(`${enqNew} new enquiries`, `${enqNew} नई पूछताछ`)}</span>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
        {tabs.map(([id, label, n]) => (
          <button key={id} type="button" role="tab" aria-selected={sec === id} onClick={() => setSec(id)} data-testid={`pp-tab-${id}`}
            className={`relative min-h-11 rounded-lg px-2 text-sm font-semibold ${sec === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>
            {label}{n > 0 && <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-slate-950">{n}</span>}
          </button>
        ))}
      </div>

      {ask && (
        <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3" data-testid="pp-ownerok">
          <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900"><ShieldCheck className="h-4 w-4" />{tx('One promise before your listings go public', 'लिस्टिंग पब्लिक करने से पहले एक वादा')}</p>
          <label className="flex items-start gap-2 text-sm text-slate-800"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={okTick} onChange={e => setOkTick(e.target.checked)} data-testid="pp-ownerok-tick" /><span>{hi ? d.ownerOkText.hi : d.ownerOkText.en}</span></label>
          <div className="flex gap-2"><button type="button" className={dark} disabled={!okTick || !!busy} onClick={confirmOk} data-testid="pp-ownerok-yes"><CheckCircle2 className="h-4 w-4" />{tx('Confirm and continue', 'पुष्टि करें और आगे बढ़ें')}</button><button type="button" className={light} onClick={() => setAsk(null)}><X className="h-4 w-4" />{tx('Not now', 'अभी नहीं')}</button></div>
        </div>
      )}

      {sec === 'enq' && (
        <section className="space-y-3" data-testid="pp-enquiries">
          {d.enquiries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
              {d.card.enabled ? tx('No enquiries yet. Put the link on your WhatsApp status, in your groups and on your visiting card (QR).', 'अभी कोई पूछताछ नहीं। लिंक WhatsApp स्टेटस, ग्रुप और विज़िटिंग कार्ड (QR) पर लगाएँ।') : tx('Switch on your page above — customers’ enquiries will come here, only to you.', 'ऊपर पेज चालू करें — ग्राहकों की पूछताछ यहाँ आएगी, सिर्फ़ आपके पास।')}
            </div>
          ) : d.enquiries.map((e: any) => {
            const kind = e.home?.deal && e.home.deal !== 'Sale' ? 'RENTER' : 'BUYER';
            const first = e.name.split(' ')[0];
            const waText = tx(`Namaste ${first}, I am writing about your enquiry on my GENZ page${e.home ? ` (${e.home.title})` : ''}.`, `नमस्ते ${first}, आपने मेरे GENZ पेज पर पूछताछ की थी${e.home ? ` (${e.home.title})` : ''}।`);
            return (
              <div key={e.id} className={`space-y-2 rounded-xl border bg-white p-3 ${e.status === 'NEW' ? 'border-amber-300' : 'border-slate-200'}`} data-testid={`pp-enq-${e.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-base font-bold text-slate-900">{e.name}{e.status === 'NEW' && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">{tx('New', 'नई')}</span>}</p>
                  <span className="text-xs text-slate-500">{when(e.updatedAt || e.createdAt)}</span>
                </div>
                <p className="text-sm text-slate-700">{e.home ? <>{tx('About', 'घर')}: <button type="button" className="text-left font-semibold text-slate-900 underline" onClick={() => { goto('properties', { propertyId: e.home.id }); window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: 'properties' })); }}>{e.home.title}</button>{!e.home.live && <span className="ml-1 text-xs text-red-700">({tx('no longer on the page', 'अब पेज पर नहीं')})</span>}</> : tx('General enquiry', 'सामान्य पूछताछ')}</p>
                {e.home && !e.home.own && e.home.listingBroker && <p className="rounded-md bg-indigo-50 px-2 py-1 text-xs text-indigo-900">{tx(`Listing of ${e.home.listingBroker} — the client is yours; close it with them through a normal co-broking offer.`, `${e.home.listingBroker} की लिस्टिंग — क्लाइंट आपका है; सौदा उनके साथ सामान्य को-ब्रोकिंग ऑफ़र से करें।`)}</p>}
                {e.message && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">“{e.message}”</p>}
                {e.watch && <p className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-800" data-testid="pp-enq-watch"><AlertTriangle className="h-3.5 w-3.5" />{e.watch === 'BLOCKED' ? tx('GENZ Network Watch: this number is blocked after reports — be careful.', 'GENZ नेटवर्क वॉच: शिकायतों के बाद यह नंबर ब्लॉक है — सावधान रहें।') : tx('GENZ Network Watch: caution reports on this number.', 'GENZ नेटवर्क वॉच: इस नंबर पर सावधानी की रिपोर्ट है।')}</p>}
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={dark} data-testid="pp-enq-room" onClick={() => {
                    try { sessionStorage.setItem('genz.newroom', JSON.stringify({ clientName: e.name, phone: e.phone, kind, note: `Public page enquiry ${e.id}${e.home ? ` · ${e.home.id}` : ''}`, ...(e.home?.live ? { homeId: e.home.id, homeTitle: e.home.title } : {}) })); } catch { /* storage blocked: the form opens empty */ }
                    window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: 'clientroom' }));
                  }}><MessagesSquare className="h-4 w-4" />{tx('Open a client room', 'क्लाइंट रूम खोलें')}</button>
                  <a className={light} href={`tel:+91${e.phone}`}><Phone className="h-4 w-4" />{e.phone}</a>
                  <a className={light} href={`https://wa.me/91${e.phone}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" />WhatsApp</a>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {ENQ_STATUSES.map(s => (
                    <button key={s.id} type="button" disabled={!!busy} onClick={() => run('st' + e.id, () => api.ppEnqStatus(e.id, s.id))} data-testid={`pp-enq-st-${s.id}`}
                      className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold ${e.status === s.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{stLabel(s.id)}</button>
                  ))}
                  {delId === e.id
                    ? <span className="ml-auto inline-flex items-center gap-1 text-xs"><button type="button" className="inline-flex min-h-9 items-center rounded-full bg-red-600 px-3 font-semibold text-white" onClick={() => { setDelId(''); run('del' + e.id, () => api.ppEnqDelete(e.id), tx('Enquiry deleted', 'पूछताछ हटा दी')); }} data-testid="pp-enq-del-yes">{tx('Delete', 'हटाएँ')}</button><button type="button" className="inline-flex min-h-9 items-center rounded-full border border-slate-300 px-3" onClick={() => setDelId('')}>{tx('Keep', 'रहने दें')}</button></span>
                    : <button type="button" className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-xs text-slate-500" onClick={() => setDelId(e.id)} data-testid="pp-enq-del" aria-label={tx('Delete', 'हटाएँ')}><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              </div>
            );
          })}
          {d.enquiries.length > 0 && <p className="text-xs text-slate-500">{tx(`Calls and WhatsApp are not recorded in GENZ; a client room keeps the chat, the homes you show and the visits on record. Enquiries are erased ${d.limits.keepDays} days after they came in.`, `कॉल और WhatsApp GENZ में दर्ज नहीं होते; क्लाइंट रूम में चैट, दिखाए घर और विज़िट दर्ज रहते हैं। पूछताछ आने के ${d.limits.keepDays} दिन बाद अपने आप मिट जाती है।`)}</p>}
        </section>
      )}

      {sec === 'homes' && (
        <section className="space-y-4" data-testid="pp-homes">
          <p className="text-sm text-slate-700"><b>{chosen.length}</b> / {d.homes.max} {tx('homes on your page', 'घर आपके पेज पर')}{busy === 'homes' && <Loader2 className="ml-2 inline h-4 w-4 animate-spin" />}</p>
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">{tx('My live listings', 'मेरी लाइव लिस्टिंग')} ({d.own.length})</h3>
            {d.own.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-600">{tx('No live, verified listing yet. Once a listing is verified it can go on your page.', 'अभी कोई लाइव, वेरिफ़ाइड लिस्टिंग नहीं। लिस्टिंग वेरिफ़ाई होते ही पेज पर लग सकती है।')}</p>}
            {d.own.map((p: any) => (
              <div key={p.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" data-testid={`pp-own-row-${p.id}`}>
                <div className="flex gap-3">
                  {p.photo ? <img src={p.photo} alt="" className="h-16 w-20 shrink-0 rounded-lg bg-slate-100 object-cover" loading="lazy" /> : <div className="flex h-16 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-500">{tx('No photo', 'फ़ोटो नहीं')}</div>}
                  <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{p.title}</p><p className="text-xs text-slate-600">{p.locality}, {p.city} · {priceShort(p.price)}{p.deal !== 'Sale' ? tx('/month', '/माह') : ''}</p></div>
                </div>
                <Toggle on={p.onPage} onClick={() => toggleHome(p.id)} disabled={!!busy || (!p.onPage && chosen.length >= d.homes.max)} testId={`pp-own-${p.id}`} label={tx('On my page', 'मेरे पेज पर')} />
                <Toggle on={p.othersCanShow} onClick={() => setOthers(p.id, !p.othersCanShow)} disabled={!!busy} testId={`pp-others-${p.id}`} label={tx('Other brokers may show it too', 'दूसरे ब्रोकर भी दिखा सकें')}
                  sub={p.othersCanShow ? tx(`On ${p.othersShowing} other broker page(s) now · their customers’ enquiries go to them, the deal comes to you as a co-broking offer`, `अभी ${p.othersShowing} दूसरे ब्रोकर के पेज पर · उनके ग्राहकों की पूछताछ उनके पास, सौदा आपके पास को-ब्रोकिंग ऑफ़र से`) : tx('Off — only you show it', 'बंद — सिर्फ़ आप दिखाते हैं')} />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">{tx('Other brokers’ homes you may show', 'दूसरे ब्रोकरों के घर जो आप दिखा सकते हैं')} ({d.network.length})</h3>
            <p className="text-xs text-slate-500">{tx('Their listing broker opened these to public pages. A customer’s enquiry about one comes to you — close it with the listing broker through a normal co-broking offer.', 'इनके लिस्टिंग ब्रोकर ने इन्हें पब्लिक पेज के लिए खोला है। इन पर ग्राहक की पूछताछ आपके पास आती है — सौदा लिस्टिंग ब्रोकर के साथ सामान्य को-ब्रोकिंग ऑफ़र से करें।')}</p>
            {d.network.length > 6 && <div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input className={inp + ' pl-9'} value={q} onChange={e => setQ(e.target.value)} placeholder={tx('Search locality, title, broker', 'इलाक़ा, नाम, ब्रोकर खोजें')} data-testid="pp-net-q" /></div>}
            {d.network.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-600">{tx('No broker has opened a listing to public pages yet.', 'अभी किसी ब्रोकर ने पब्लिक पेज के लिए लिस्टिंग नहीं खोली।')}</p>}
            {net.map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3" data-testid={`pp-net-row-${p.id}`}>
                {p.photo ? <img src={p.photo} alt="" className="h-14 w-16 shrink-0 rounded-lg bg-slate-100 object-cover" loading="lazy" /> : <div className="h-14 w-16 shrink-0 rounded-lg bg-slate-100" />}
                <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-bold text-slate-900">{p.title}</p><p className="text-xs text-slate-600">{p.locality} · {priceShort(p.price)}{p.deal !== 'Sale' ? tx('/month', '/माह') : ''}</p>{p.listingBroker && <p className="truncate text-xs text-slate-500">{tx('Listing broker', 'लिस्टिंग ब्रोकर')}: {p.listingBroker.name}</p>}</div>
                <button type="button" onClick={() => toggleHome(p.id)} disabled={!!busy || (!p.onPage && chosen.length >= d.homes.max)} aria-pressed={p.onPage} data-testid={`pp-net-${p.id}`}
                  className={`inline-flex min-h-10 shrink-0 items-center rounded-lg px-3 text-xs font-bold ${p.onPage ? 'bg-emerald-600 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}>{p.onPage ? <><CheckCircle2 className="mr-1 h-4 w-4" />{tx('On page', 'पेज पर')}</> : tx('Add', 'जोड़ें')}</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {sec === 'about' && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" data-testid="pp-about">
          <label className="block text-sm font-semibold text-slate-800">{tx('One line about you', 'आपके बारे में एक लाइन')}
            <input className={inp + ' mt-1'} maxLength={d.limits.headline} value={form.headline} onChange={e => setForm({ ...form, headline: e.target.value })} placeholder={tx('e.g. Flats and plots in East Raipur — clear papers, fair price', 'जैसे: पूर्वी रायपुर में फ़्लैट और प्लॉट — साफ़ कागज़, सही दाम')} data-testid="pp-headline" />
          </label>
          <label className="block text-sm font-semibold text-slate-800">{tx(`Areas you work in (up to ${d.limits.areas}, separated by commas)`, `आपके इलाक़े (ज़्यादा से ज़्यादा ${d.limits.areas}, कॉमा से अलग)`)}
            <input className={inp + ' mt-1'} value={form.areas} onChange={e => setForm({ ...form, areas: e.target.value })} placeholder="Shankar Nagar, Telibandha" data-testid="pp-areas" />
          </label>
          <Toggle on={form.showPhone} onClick={() => setForm({ ...form, showPhone: !form.showPhone })} testId="pp-phone" label={tx('Show my Call / WhatsApp buttons', 'मेरे कॉल / WhatsApp बटन दिखाएँ')} sub={tx('Off: customers reach you through the enquiry form only (it is recorded in GENZ).', 'बंद: ग्राहक सिर्फ़ पूछताछ फ़ॉर्म से पहुँचेंगे (यह GENZ में दर्ज होता है)।')} />
          <button type="button" className={dark} disabled={busy === 'about'} onClick={() => run('about', () => api.ppSettings({ headline: form.headline, areas: form.areas, showPhone: form.showPhone }), tx('Saved', 'सेव हो गया'))} data-testid="pp-save">{busy === 'about' && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Save', 'सेव करें')}</button>
          <div className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            <p className="font-semibold text-slate-800"><Globe className="mr-1 inline h-3.5 w-3.5" />{tx('What a customer sees', 'ग्राहक को क्या दिखता है')}</p>
            <p>{tx('Photos (with your name across them), price, type, locality and city, area, tags and the description without phone numbers. A YouTube video if the listing has one.', 'फ़ोटो (उन पर आपका नाम), कीमत, प्रकार, इलाक़ा और शहर, एरिया, टैग और बिना फ़ोन नंबर का ब्यौरा। लिस्टिंग में YouTube वीडियो हो तो वह भी।')}</p>
            <p className="mt-1 font-semibold text-slate-800">{tx('Never shown', 'कभी नहीं दिखता')}</p>
            <p>{tx('The owner’s name and number, the exact address or map pin, the net price, papers, and anything from deal rooms.', 'मालिक का नाम और नंबर, पूरा पता या मैप पिन, नेट कीमत, कागज़, और डील रूम की कोई भी बात।')}</p>
          </div>
        </section>
      )}
    </div>
  );
};
