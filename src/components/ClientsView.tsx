import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Phone, MessageCircle, ChevronRight, Trash2, X, Clock, WifiOff, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '../lib/api.js';
import { useTx, useI18n } from '../lib/i18n.js';
import { PROPERTY_TYPES } from '../shared/india.js';
import { formatINR } from '../lib/utils.js';
import { enqueue, flushQueue, isNetworkError, pendingCount, type PendingOp } from '../lib/offline.js';
import type { UserProfile } from '../types/index.js';

const STAGES = ['NEW', 'CONTACTED', 'SITE_VISIT', 'NEGOTIATION', 'DEAL', 'LOST'] as const;
const STAGE_LABEL: Record<string, [string, string]> = { NEW: ['New', 'नया'], CONTACTED: ['Spoke', 'बात हुई'], SITE_VISIT: ['Site visit', 'साइट विज़िट'], NEGOTIATION: ['Negotiation', 'मोलभाव'], DEAL: ['Deal', 'डील'], LOST: ['Lost', 'खत्म'] };
const LEAD_STYLE: Record<string, string> = { HOT: 'bg-red-100 text-red-800', WARM: 'bg-amber-100 text-amber-800', COLD: 'bg-slate-100 text-slate-600' };
const LEAD_LABEL: Record<string, [string, string]> = { HOT: ['Hot', 'गर्म'], WARM: ['Warm', 'गुनगुना'], COLD: ['Cold', 'ठंडा'] };
const field = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-slate-900 focus:outline-none';
const TPL_KEY = 'genz.templates.v1';
const DRAFT_KEY = 'genz.client.draft';
const DEFAULT_TPL = {
  follow: { en: 'Hello {client_name}, this is regarding your property search. Any update from your side? I have some good options for you. {link}', hi: 'नमस्ते {client_name}, आपकी प्रॉपर्टी की तलाश के बारे में बात करनी थी। कोई अपडेट? मेरे पास कुछ अच्छे विकल्प हैं। {link}' },
  visit: { en: 'Hello {client_name}, shall we visit {property_title} this weekend? Let me know a convenient time.', hi: 'नमस्ते {client_name}, क्या हम इस वीकेंड {property_title} देखने चलें? सुविधाजनक समय बताइए।' },
};
const digits10 = (p: string) => p.replace(/\D/g, '').slice(-10);
const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const lakh = (v: string) => Math.round((parseFloat(v) || 0) * 100000);

export const ClientsView: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const tx = useTx();
  const { lang } = useI18n();
  const [list, setList] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [stage, setStage] = useState<string>('ALL');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<any | null>(null);
  const [pending, setPending] = useState(pendingCount());
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [tpl, setTpl] = useState(() => { try { return { ...DEFAULT_TPL, ...JSON.parse(localStorage.getItem(TPL_KEY) || '{}') }; } catch { return DEFAULT_TPL; } });
  const [editTpl, setEditTpl] = useState(false);
  const link = currentUser.referralCode ? `${location.origin}/c/${currentUser.referralCode}` : '';
  // v58 — the broker's office staff work his client list: no deleting, and the number only when the broker lets them see numbers
  const staff = currentUser.role === 'TEAM_MEMBER';

  const load = useCallback(async () => {
    try { const r = await api.clients(); setList(r.clients); setErr(''); } catch (e: any) { if (!isNetworkError(e)) setErr(e.message); else setList(prev => prev ?? []); }
  }, []);
  const send = useCallback(async (op: PendingOp) => (op.kind === 'add' ? api.clientAdd(op.body) : api.clientStage(op.id, op.body)), []);
  const sync = useCallback(async () => { if (!pendingCount()) return; const n = await flushQueue(send); setPending(pendingCount()); if (n) load(); }, [send, load]);

  useEffect(() => { load(); sync(); const on = () => { setOnline(true); sync(); }; const off = () => setOnline(false); window.addEventListener('online', on); window.addEventListener('offline', off); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); }; }, [load, sync]);

  const counts = useMemo(() => Object.fromEntries(STAGES.map(s => [s, (list || []).filter(c => c.stage === s).length])), [list]);
  const shown = useMemo(() => (list || []).filter(c => stage === 'ALL' || c.stage === stage).sort((a, b) => (b.lead?.score ?? 0) - (a.lead?.score ?? 0)), [list, stage]);
  const due = (list || []).filter(c => c.followUpAt && !['DEAL', 'LOST'].includes(c.stage) && new Date(c.followUpAt).getTime() <= Date.now());

  const move = async (c: any, to: string, lostReason?: string) => {
    if (to === 'LOST' && !lostReason) { const r = window.prompt(tx('Why was the lead lost? (one line)', 'लीड क्यों खत्म हुई? (एक लाइन)')); if (!r) return; lostReason = r; }
    const body = { stage: to, lostReason };
    setList(prev => (prev || []).map(x => (x.id === c.id ? { ...x, stage: to } : x)));
    try { const r = await api.clientStage(c.id, body); setList(prev => (prev || []).map(x => (x.id === c.id ? r.client : x))); setOpen((o: any) => (o?.id === c.id ? r.client : o)); }
    catch (e: any) { if (isNetworkError(e)) { enqueue({ kind: 'stage', id: c.id, body }); setPending(pendingCount()); } else { setErr(e.message); load(); } }
  };
  const wa = (c: any, kind: 'follow' | 'visit') => {
    const text = fill(tpl[kind][lang], { client_name: c.name.split(' ')[0], property_title: tx('the property', 'प्रॉपर्टी'), link });
    api.clientNote(c.id, { text: `WhatsApp: ${kind === 'follow' ? tx('follow-up sent', 'फॉलो-अप भेजा') : tx('visit invite sent', 'विज़िट का न्योता भेजा')}`, kind: 'CONTACT' }).catch(() => undefined);
    window.open(`https://wa.me/91${digits10(c.phone)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  if (!list) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>;
  return (
    <div className="space-y-4">
      {(!online || pending > 0) && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="status">
          {online ? <RefreshCw className="h-4 w-4" aria-hidden /> : <WifiOff className="h-4 w-4" aria-hidden />}
          <span className="flex-1">{!online ? tx('You are offline. Changes are saved on this phone and will sync automatically.', 'आप ऑफ़लाइन हैं। बदलाव इस फ़ोन में सेव हैं और नेट आते ही अपने-आप सिंक होंगे।') : tx(`${pending} change(s) waiting to sync`, `${pending} बदलाव सिंक होने बाकी`)}</span>
          {online && pending > 0 && <button onClick={sync} className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white">{tx('Sync now', 'अभी सिंक करें')}</button>}
        </div>
      )}
      {due.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <div className="text-xs font-bold text-red-900">{tx(`${due.length} follow-up(s) due`, `${due.length} फॉलो-अप बाकी`)}</div>
          <div className="mt-2 flex flex-wrap gap-2">{due.slice(0, 6).map(c => <button key={c.id} onClick={() => wa(c, 'follow')} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-red-800 shadow-xs"><MessageCircle className="h-4 w-4" aria-hidden />{c.name}</button>)}</div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">{tx('My clients', 'मेरे क्लाइंट')} <span className="text-sm font-medium text-slate-500">({list.length})</span></h2>
        <div className="flex gap-2">
          <button onClick={() => setEditTpl(true)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700">{tx('WhatsApp templates', 'WhatsApp टेम्पलेट')}</button>
          <button onClick={() => setAdding(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" aria-hidden />{tx('Add client', 'क्लाइंट जोड़ें')}</button>
        </div>
      </div>
      {err && <p className="rounded-lg bg-red-50 p-2.5 text-xs font-medium text-red-700">{err}</p>}

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {['ALL', ...STAGES].map(s => (
          <button key={s} onClick={() => setStage(s)} className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold ${stage === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>
            {s === 'ALL' ? tx('All', 'सभी') : tx(...STAGE_LABEL[s])} {s !== 'ALL' && <span className="opacity-70">{counts[s]}</span>}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-semibold text-slate-800">{list.length === 0 ? tx('No clients yet', 'अभी कोई क्लाइंट नहीं') : tx('Nobody in this stage', 'इस चरण में कोई नहीं')}</p>
          <p className="mt-1 text-xs text-slate-500">{tx('Add a client in 30 seconds — we will find matching properties for them every morning.', '30 सेकंड में क्लाइंट जोड़ें — हम हर सुबह उनके लिए मैचिंग प्रॉपर्टी ढूँढेंगे।')}</p>
          <button onClick={() => setAdding(true)} className="mt-4 min-h-12 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white">{tx('Add your first client', 'पहला क्लाइंट जोड़ें')}</button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map(c => {
            const idx = STAGES.indexOf(c.stage); const next = idx >= 0 && idx < 3 ? STAGES[idx + 1] : c.stage === 'NEGOTIATION' ? 'DEAL' : null;
            return (
              <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <button className="min-w-0 text-left" onClick={() => setOpen(c)}>
                    <div className="truncate text-sm font-bold text-slate-900">{c.name}</div>
                    <div className="truncate text-xs text-slate-500">{c.budgetMax ? `${formatINR(c.budgetMin)}–${formatINR(c.budgetMax)}` : tx('Budget not set', 'बजट तय नहीं')} · {c.propertyType} · {(c.areas || []).join(', ') || c.city}</div>
                  </button>
                  <span title={(c.lead?.reasons || []).map((r: any) => tx(r.en, r.hi)).join(' • ')} className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${LEAD_STYLE[c.lead?.label || 'COLD']}`}>{tx(...LEAD_LABEL[c.lead?.label || 'COLD'])} {c.lead?.score ?? 0}</span>
                </div>
                {c.followUpAt && <div className={`mt-1.5 flex items-center gap-1 text-[11px] ${new Date(c.followUpAt) <= new Date() ? 'font-bold text-red-700' : 'text-slate-500'}`}><Clock className="h-3 w-3" aria-hidden />{tx('Follow-up', 'फॉलो-अप')}: {new Date(c.followUpAt).toLocaleDateString('en-IN')}</div>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {c.phoneHidden ? <span className="text-xs text-slate-500" data-testid="client-phone-hidden">{c.phone} · {tx('number hidden by your broker', 'नंबर आपके ब्रोकर ने छुपाया है')}</span> : <>
                  <a href={`tel:+91${digits10(c.phone)}`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 px-3 text-slate-700" aria-label={tx('Call', 'कॉल')}><Phone className="h-4 w-4" /></a>
                  <button onClick={() => wa(c, 'follow')} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white"><MessageCircle className="h-4 w-4" aria-hidden />WhatsApp</button></>}
                  {next && <button onClick={() => move(c, next)} className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-800">{tx(...STAGE_LABEL[next])}<ChevronRight className="h-4 w-4" aria-hidden /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding && <AddClient currentUser={currentUser} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); setPending(pendingCount()); }} />}
      {open && <ClientDetail c={open} onClose={() => setOpen(null)} onMove={move} onChanged={(c2: any) => { setOpen(c2); setList(prev => (prev || []).map(x => (x.id === c2.id ? c2 : x))); }} onDelete={staff ? undefined : async () => { if (!window.confirm(tx('Delete this client permanently?', 'इस क्लाइंट को हमेशा के लिए हटाएँ?'))) return; await api.clientDelete(open.id); setOpen(null); load(); }} wa={wa} />}
      {editTpl && (
        <Sheet title={tx('WhatsApp templates', 'WhatsApp टेम्पलेट')} onClose={() => setEditTpl(false)}>
          <p className="text-xs text-slate-500">{tx('Use {client_name}, {property_title}, {link}. Saved on this phone.', '{client_name}, {property_title}, {link} इस्तेमाल करें। इसी फ़ोन में सेव होगा।')}</p>
          {(['follow', 'visit'] as const).map(k => (['en', 'hi'] as const).map(l => (
            <label key={k + l} className="mt-3 block text-xs font-semibold text-slate-700">{k === 'follow' ? tx('Follow-up', 'फॉलो-अप') : tx('Site visit', 'साइट विज़िट')} · {l.toUpperCase()}
              <textarea rows={3} value={tpl[k][l]} onChange={e => setTpl((t: any) => ({ ...t, [k]: { ...t[k], [l]: e.target.value } }))} className={field + ' mt-1 text-sm'} />
            </label>
          )))}
          <button onClick={() => { try { localStorage.setItem(TPL_KEY, JSON.stringify(tpl)); } catch { /* ignore */ } setEditTpl(false); }} className="mt-4 min-h-12 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white">{tx('Save', 'सेव करें')}</button>
        </Sheet>
      )}
    </div>
  );
};

const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  const tx = useTx();
  return (
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center" role="dialog" aria-modal="true" onClick={onClose}>
    <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between"><h3 className="text-base font-bold text-slate-900">{title}</h3><button onClick={onClose} className="rounded-lg p-2" aria-label={tx('Close', 'बंद करें')}><X className="h-5 w-5" /></button></div>
      {children}
    </div>
  </div>
  );
};

const AddClient: React.FC<{ currentUser: UserProfile; onClose: () => void; onSaved: () => void }> = ({ currentUser, onClose, onSaved }) => {
  const tx = useTx();
  const [f, setF] = useState(() => { try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); if (d) return d; } catch { /* no draft */ } return { name: '', phone: '', minL: '', maxL: '', city: currentUser.city || '', areas: '', propertyType: 'Residential Flat', transactionType: 'Sale', consent: false, followDays: '3' }; });
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(f)); } catch { /* ignore */ } }, [f]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const parse = async () => {
    try { const { parsed } = await api.clientParse(paste); setF((p: any) => ({ ...p, name: parsed.name || p.name, phone: parsed.phone || p.phone, minL: parsed.budgetMin ? String(parsed.budgetMin / 1e5) : p.minL, maxL: parsed.budgetMax ? String(parsed.budgetMax / 1e5) : p.maxL, areas: parsed.area || p.areas })); setPaste(''); }
    catch (e: any) { setErr(e.message); }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    const body = {
      name: f.name, phone: f.phone, budgetMin: lakh(f.minL), budgetMax: lakh(f.maxL), city: f.city, areas: f.areas.split(',').map((x: string) => x.trim()).filter(Boolean),
      propertyType: f.propertyType, transactionType: f.transactionType, consent: f.consent === true,
      followUpAt: f.followDays ? new Date(Date.now() + Number(f.followDays) * 86400000).toISOString() : undefined, clientRef: `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
    };
    try { await api.clientAdd(body); try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } onSaved(); }
    catch (e2: any) { if (isNetworkError(e2)) { enqueue({ kind: 'add', body }); try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } onSaved(); } else setErr(e2.message); }
    finally { setBusy(false); }
  };
  return (
    <Sheet title={tx('Add client', 'क्लाइंट जोड़ें')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <details className="rounded-lg bg-slate-50 p-2.5 text-xs"><summary className="cursor-pointer font-semibold text-slate-700">{tx('Paste a lead message (99acres / MagicBricks / WhatsApp)', 'लीड मैसेज पेस्ट करें (99acres / MagicBricks / WhatsApp)')}</summary>
          <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={3} className={field + ' mt-2 text-sm'} placeholder={tx('Name: Rahul… Phone… Budget 60 lakh… Location…', 'Name: राहुल… Phone… Budget 60 lakh… Location…')} />
          <button type="button" onClick={parse} disabled={paste.length < 8} className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-white disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" aria-hidden />{tx('Fill the form from this text', 'इस टेक्स्ट से फ़ॉर्म भरें')}</button>
        </details>
        <input required value={f.name} onChange={e => set('name', e.target.value)} placeholder={tx('Client name', 'क्लाइंट का नाम')} className={field} autoComplete="off" />
        <input required inputMode="tel" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder={tx('Mobile number', 'मोबाइल नंबर')} className={field} autoComplete="off" />
        <div className="grid grid-cols-2 gap-2">
          <input inputMode="decimal" value={f.minL} onChange={e => set('minL', e.target.value)} placeholder={tx('Budget from (₹ lakh)', 'बजट से (₹ लाख)')} className={field} />
          <input inputMode="decimal" value={f.maxL} onChange={e => set('maxL', e.target.value)} placeholder={tx('Budget up to (₹ lakh)', 'बजट तक (₹ लाख)')} className={field} />
        </div>
        {f.maxL && <p className="-mt-1 text-[11px] text-slate-500">{formatINR(lakh(f.minL))} – {formatINR(lakh(f.maxL))}</p>}
        <input value={f.city} onChange={e => set('city', e.target.value)} placeholder={tx('City', 'शहर')} className={field} />
        <input value={f.areas} onChange={e => set('areas', e.target.value)} placeholder={tx('Areas wanted (comma separated)', 'पसंदीदा इलाके (कॉमा से अलग)')} className={field} />
        <div className="grid grid-cols-2 gap-2">
          <select value={f.propertyType} onChange={e => set('propertyType', e.target.value)} className={field}>{PROPERTY_TYPES.map(t => <option key={t}>{t}</option>)}</select>
          <select value={f.transactionType} onChange={e => set('transactionType', e.target.value)} className={field}><option value="Sale">{tx('Buy', 'खरीदना')}</option><option value="Rent">{tx('Rent', 'किराया')}</option><option value="Lease">{tx('Lease', 'लीज़')}</option></select>
        </div>
        <label className="block text-xs font-semibold text-slate-700">{tx('Remind me to follow up in', 'फॉलो-अप याद दिलाएँ')}
          <select value={f.followDays} onChange={e => set('followDays', e.target.value)} className={field + ' mt-1'}><option value="">{tx('No reminder', 'रिमाइंडर नहीं')}</option><option value="1">{tx('1 day', '1 दिन में')}</option><option value="3">{tx('3 days', '3 दिन में')}</option><option value="7">{tx('1 week', '1 हफ्ते में')}</option></select>
        </label>
        <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={f.consent === true} onChange={e => set('consent', e.target.checked)} className="mt-0.5 h-5 w-5" />{tx('This client has agreed that I may save their number and contact them about properties. Only I can see it.', 'इस क्लाइंट ने सहमति दी है कि मैं उनका नंबर सेव कर सकता/सकती हूँ और प्रॉपर्टी के बारे में संपर्क कर सकता/सकती हूँ। इसे सिर्फ़ मैं देख सकता/सकती हूँ।')}</label>
        {err && <p className="text-xs font-medium text-red-700">{err}</p>}
        <button disabled={busy || !f.consent} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{tx('Save client', 'क्लाइंट सेव करें')}</button>
      </form>
    </Sheet>
  );
};

const ClientDetail: React.FC<{ c: any; onClose: () => void; onMove: (c: any, to: string) => void; onChanged: (c: any) => void; onDelete?: () => void; wa: (c: any, k: 'follow' | 'visit') => void }> = ({ c, onClose, onMove, onChanged, onDelete, wa }) => {
  const tx = useTx();
  const [note, setNote] = useState(''); const [err, setErr] = useState('');
  const addNote = async () => { if (!note.trim()) return; try { const r = await api.clientNote(c.id, { text: note.trim(), kind: 'NOTE' }); setNote(''); onChanged(r.client); } catch (e: any) { setErr(e.message); } };
  const setFollow = async (d: number) => { try { const r = await api.clientNote(c.id, { text: tx(`Follow-up set for ${d} day(s)`, `${d} दिन बाद का फॉलो-अप तय`), kind: 'FOLLOWUP', followUpAt: new Date(Date.now() + d * 86400000).toISOString() }); onChanged(r.client); } catch (e: any) { setErr(e.message); } };
  return (
    <Sheet title={c.name} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="flex items-center justify-between"><b>{tx('Why this lead is', 'यह लीड ऐसी क्यों है')} {tx(...LEAD_LABEL[c.lead?.label || 'COLD'])}</b><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${LEAD_STYLE[c.lead?.label || 'COLD']}`}>{c.lead?.score ?? 0}/100</span></div>
          <ul className="mt-2 space-y-1 text-xs text-slate-700">{(c.lead?.reasons || []).map((r: any, i: number) => <li key={i} className="flex justify-between gap-2"><span>{tx(r.en, r.hi)}</span><b className={r.pts < 0 ? 'text-red-700' : 'text-emerald-700'}>{r.pts > 0 ? '+' : ''}{r.pts}</b></li>)}</ul>
        </div>
        <div className="flex flex-wrap gap-1.5">{STAGES.map(s => <button key={s} onClick={() => onMove(c, s)} className={`min-h-10 rounded-full px-3 text-xs font-semibold ${c.stage === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300'}`}>{tx(...STAGE_LABEL[s])}</button>)}</div>
        {c.lostReason && <p className="text-xs text-slate-500">{tx('Lost because', 'खत्म होने का कारण')}: {c.lostReason}</p>}
        <div className="flex flex-wrap gap-2">
          {!c.phoneHidden && <button onClick={() => wa(c, 'visit')} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white"><MessageCircle className="h-4 w-4" aria-hidden />{tx('Invite to site visit', 'साइट विज़िट बुलाएँ')}</button>}
          {[1, 3, 7].map(d => <button key={d} onClick={() => setFollow(d)} className="min-h-11 rounded-lg border border-slate-300 px-3 text-xs font-semibold">{tx(`Remind in ${d}d`, `${d} दिन में याद दिलाएँ`)}</button>)}
        </div>
        <div className="flex gap-2"><input value={note} onChange={e => setNote(e.target.value)} placeholder={tx('Add a note', 'नोट जोड़ें')} maxLength={500} className={field} /><button onClick={addNote} className="min-h-12 shrink-0 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">{tx('Add', 'जोड़ें')}</button></div>
        {err && <p className="text-xs text-red-700">{err}</p>}
        <div><div className="mb-1 text-xs font-bold text-slate-700">{tx('Timeline', 'टाइमलाइन')}</div>
          <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs text-slate-600">{c.timeline.map((t: any, i: number) => <li key={i} className="flex gap-2"><span className="shrink-0 text-slate-400">{new Date(t.at).toLocaleDateString('en-IN')}</span><span>{t.text}</span></li>)}</ul></div>
        {onDelete && <button onClick={onDelete} className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-red-700"><Trash2 className="h-4 w-4" aria-hidden />{tx('Delete client', 'क्लाइंट हटाएँ')}</button>}
      </div>
    </Sheet>
  );
};
